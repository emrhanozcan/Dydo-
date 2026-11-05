import { findMessageContainer, getActiveChatTitle, isTargetGroup } from "./whatsappDetector";
import { WHATSAPP_SELECTORS } from "./whatsappSelectors";
import type { WhatsAppMessage } from "./whatsappTypes";

export class WhatsAppObserver {
  private observer?: MutationObserver;
  private timer?: number;
  private inspectTimer?: number;
  private groupName?: string;
  private seenMessageIds = new Set<string>();
  private lastStatusAt = 0;
  private backfilling = false;

  constructor(
    private readonly targetGroup: () => string,
    private readonly onMessage: (message: WhatsAppMessage) => void,
    private readonly onStatus: () => void,
  ) {}

  start(): void {
    this.inspect(true);
    // WhatsApp builds a message in several DOM mutations. Waiting briefly keeps us
    // from reading (and permanently marking) a half-built message row.
    this.observer = new MutationObserver(() => this.scheduleInspect());
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-id", "data-pre-plain-text", "class"] });
    this.timer = window.setInterval(() => this.inspect(false), 2_000);
  }

  stop(): void {
    this.observer?.disconnect();
    if (this.timer) window.clearInterval(this.timer);
    if (this.inspectTimer) window.clearTimeout(this.inspectTimer);
  }

  private scheduleInspect(): void {
    if (this.inspectTimer) window.clearTimeout(this.inspectTimer);
    this.inspectTimer = window.setTimeout(() => {
      this.inspectTimer = undefined;
      this.inspect(false);
    }, 120);
  }

  private inspect(forceBaseline: boolean): void {
    const activeGroup = getActiveChatTitle();
    const groupChanged = activeGroup !== this.groupName;
    this.groupName = activeGroup;
    const container = findMessageContainer();
    const nodes = container ? findMessageNodes(container) : [];
    if (forceBaseline || groupChanged) {
      this.seenMessageIds.clear();
      nodes.forEach((node) => this.remember(node));
      if (isTargetGroup(activeGroup, this.targetGroup())) {
        for (const message of readTodayMessages(nodes, activeGroup!)) this.onMessage(message);
        if (!this.backfilling && container) void this.backfillToday(activeGroup!, container, nodes);
      }
      this.emitStatus(true);
      return;
    }
    if (!isTargetGroup(activeGroup, this.targetGroup())) {
      this.emitStatus();
      return;
    }
    if (this.backfilling) {
      nodes.forEach((node) => this.remember(node));
      this.emitStatus();
      return;
    }
    for (const node of nodes) {
      const identity = messageNodeIdentity(node);
      if (this.seenMessageIds.has(identity)) continue;
      this.remember(node);
      const message = readMessage(node, activeGroup!);
      if (message) this.onMessage(message);
    }
    this.emitStatus();
  }

  private emitStatus(force = false): void {
    if (!force && Date.now() - this.lastStatusAt < 1_000) return;
    this.lastStatusAt = Date.now();
    this.onStatus();
  }

  private remember(node: HTMLElement): void {
    this.seenMessageIds.add(messageNodeIdentity(node));
    // A long-running WhatsApp tab should not grow this set without limit.
    if (this.seenMessageIds.size > 4_000) {
      const oldest = this.seenMessageIds.values().next().value;
      if (oldest) this.seenMessageIds.delete(oldest);
    }
  }

  private async backfillToday(groupName: string, container: HTMLElement, initialNodes: HTMLElement[]): Promise<void> {
    const pane = findScrollableMessagePane(container, initialNodes);
    if (!pane || pane.scrollTop <= 0) return;
    this.backfilling = true;
    const originalBottomOffset = Math.max(0, pane.scrollHeight - pane.clientHeight - pane.scrollTop);
    try {
      for (let step = 0; step < 40; step += 1) {
        if (!isTargetGroup(getActiveChatTitle(), this.targetGroup())) break;
        const previousTop = pane.scrollTop;
        pane.scrollTop = Math.max(0, previousTop - Math.max(400, Math.floor(pane.clientHeight * 0.8)));
        pane.dispatchEvent(new Event("scroll", { bubbles: true }));
        await waitForDom(180);
        const currentContainer = findMessageContainer();
        const nodes = currentContainer ? findMessageNodes(currentContainer) : [];
        nodes.forEach((node) => this.remember(node));
        for (const message of readTodayMessages(nodes, groupName)) this.onMessage(message);
        if (containsMessageBeforeToday(nodes) || pane.scrollTop === 0 || pane.scrollTop === previousTop) break;
      }
    } finally {
      pane.scrollTop = Math.max(0, pane.scrollHeight - pane.clientHeight - originalBottomOffset);
      pane.dispatchEvent(new Event("scroll", { bubbles: true }));
      await waitForDom(180);
      const restoredContainer = findMessageContainer();
      if (restoredContainer) findMessageNodes(restoredContainer).forEach((node) => this.remember(node));
      this.backfilling = false;
      this.inspect(false);
    }
  }
}

export function findScrollableMessagePane(container: HTMLElement, nodes = findMessageNodes(container)): HTMLElement | null {
  const candidates: HTMLElement[] = [];
  for (const node of nodes.slice(-5)) {
    let current = node.parentElement;
    while (current && container.contains(current)) {
      if (!candidates.includes(current)) candidates.push(current);
      current = current.parentElement;
    }
  }
  if (container.scrollHeight > container.clientHeight + 20) candidates.push(container);
  return candidates.find((element) => element.scrollHeight > element.clientHeight + 20) ?? null;
}

function containsMessageBeforeToday(nodes: HTMLElement[], now = Date.now()): boolean {
  const currentDate = new Date(now);
  const startOfToday = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
  return nodes.some((node) => {
    const message = readMessage(node, "history", now);
    const timestamp = parseWhatsAppTimestamp(message?.timestamp, now);
    return timestamp !== undefined && timestamp < startOfToday;
  });
}

function waitForDom(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function findMessageNodes(root: ParentNode): HTMLElement[] {
  const selector = WHATSAPP_SELECTORS.messages.join(",");
  const nodes = [...root.querySelectorAll<HTMLElement>(selector)]
    .filter((node) => WHATSAPP_SELECTORS.messageTexts.some((textSelector) => node.matches(textSelector) || node.querySelector(textSelector)));
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const identity = messageNodeIdentity(node);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function messageNodeIdentity(node: HTMLElement): string {
  const dataNode = node.closest<HTMLElement>("[data-id]") ?? node.querySelector<HTMLElement>("[data-id]");
  const dataId = dataNode?.getAttribute("data-id")?.trim();
  if (dataId) return `id:${dataId}`;
  const metadataNode = node.matches("[data-pre-plain-text]") ? node : node.querySelector<HTMLElement>("[data-pre-plain-text]");
  const metadata = metadataNode?.getAttribute("data-pre-plain-text")?.trim() ?? "";
  const text = WHATSAPP_SELECTORS.messageTexts.flatMap((textSelector) => [
    ...(node.matches(textSelector) ? [node] : []),
    ...node.querySelectorAll<HTMLElement>(textSelector),
  ]).map((element) => element.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
  return `content:${metadata}|${text}`;
}

export function readMessage(node: HTMLElement, groupName: string, detectedAt = Date.now()): WhatsAppMessage | null {
  let text = "";
  for (const selector of WHATSAPP_SELECTORS.messageTexts) {
    const elements = [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll<HTMLElement>(selector)];
    const parts = elements.map((element) => element.innerText || element.textContent || "").filter(Boolean);
    if (parts.length) { text = [...new Set(parts)].join(" ").replace(/\s+/g, " ").trim(); break; }
  }
  if (!text) return null;
  const metadataNode = WHATSAPP_SELECTORS.metadata.map((selector) => node.querySelector<HTMLElement>(selector)).find(Boolean);
  const metadata = metadataNode?.getAttribute("data-pre-plain-text") ?? node.getAttribute("data-pre-plain-text") ?? "";
  const parsed = metadata.match(/^\[(.+?)\]\s*([^:]+):/u);
  return { groupName, sender: parsed?.[2]?.trim(), timestamp: parsed?.[1]?.trim(), messageKey: node.getAttribute("data-id") ?? node.closest<HTMLElement>("[data-id]")?.getAttribute("data-id") ?? undefined, text, detectedAt, outgoing: isOutgoingMessageNode(node) };
}

export function readRecentIncomingMessages(nodes: HTMLElement[], groupName: string, now = Date.now()): WhatsAppMessage[] {
  return nodes.slice(-50).flatMap((node) => {
    if (isOutgoingMessageNode(node)) return [];
    const message = readMessage(node, groupName, now);
    return message && isRecentWhatsAppTimestamp(message.timestamp, now) ? [message] : [];
  });
}

/** Reads the already-rendered incoming orders from today for manual approval. */
export function readTodayIncomingMessages(nodes: HTMLElement[], groupName: string, now = Date.now()): WhatsAppMessage[] {
  return nodes.flatMap((node) => {
    if (isOutgoingMessageNode(node)) return [];
    const message = readMessage(node, groupName, now);
    return message && isWhatsAppTimestampToday(message.timestamp, now) ? [{ ...message, historical: true }] : [];
  });
}

/** Reads both received and self-sent messages; order parsing filters chat noise later. */
export function readTodayMessages(nodes: HTMLElement[], groupName: string, now = Date.now()): WhatsAppMessage[] {
  return nodes.flatMap((node) => {
    const message = readMessage(node, groupName, now);
    return message && isWhatsAppTimestampToday(message.timestamp, now) ? [{ ...message, historical: true }] : [];
  });
}

export function isWhatsAppTimestampToday(timestamp: string | undefined, now = Date.now()): boolean {
  const messageTime = parseWhatsAppTimestamp(timestamp, now);
  if (messageTime === undefined) return false;
  const messageDate = new Date(messageTime);
  const currentDate = new Date(now);
  return messageDate.getFullYear() === currentDate.getFullYear() &&
    messageDate.getMonth() === currentDate.getMonth() &&
    messageDate.getDate() === currentDate.getDate();
}

export function isOutgoingMessageNode(node: HTMLElement): boolean {
  if (node.matches(".message-out") || node.querySelector(".message-out")) return true;
  const dataId = node.getAttribute("data-id") ?? node.querySelector<HTMLElement>("[data-id]")?.getAttribute("data-id") ?? "";
  return /^true_/i.test(dataId);
}

export function isRecentWhatsAppTimestamp(timestamp: string | undefined, now = Date.now(), maximumAgeMs = 30 * 60 * 1000): boolean {
  const messageTime = parseWhatsAppTimestamp(timestamp, now);
  if (messageTime === undefined) return false;
  const age = now - messageTime;
  return Number.isFinite(messageTime) && age >= -2 * 60 * 1000 && age <= maximumAgeMs;
}

export function parseWhatsAppTimestamp(timestamp: string | undefined, now = Date.now()): number | undefined {
  if (!timestamp) return undefined;
  const value = timestamp.replace(/[\u200e\u200f]/g, " ").trim();
  const timeFirst = value.match(/(\d{1,2}):(\d{2})(?:\s*,\s*|\s+)(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/u);
  const dateFirst = value.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s*,\s*|\s+)(\d{1,2}):(\d{2})/u);
  let messageTime: number;
  if (timeFirst) {
    messageTime = new Date(Number(timeFirst[5]), Number(timeFirst[4]) - 1, Number(timeFirst[3]), Number(timeFirst[1]), Number(timeFirst[2])).getTime();
  } else if (dateFirst) {
    messageTime = new Date(Number(dateFirst[3]), Number(dateFirst[2]) - 1, Number(dateFirst[1]), Number(dateFirst[4]), Number(dateFirst[5])).getTime();
  } else {
    const timeOnly = value.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/u);
    if (!timeOnly) return undefined;
    const current = new Date(now);
    const inferred = new Date(current.getFullYear(), current.getMonth(), current.getDate(), Number(timeOnly[1]), Number(timeOnly[2]));
    if (inferred.getTime() > now + 2 * 60 * 1000) inferred.setDate(inferred.getDate() - 1);
    messageTime = inferred.getTime();
  }
  return Number.isFinite(messageTime) ? messageTime : undefined;
}
