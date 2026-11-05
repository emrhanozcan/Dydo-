import { normalizeAddress } from "../core/addressNormalizer";
import { WHATSAPP_SELECTORS } from "./whatsappSelectors";

export function getActiveChatTitle(): string | undefined {
  for (const headerSelector of WHATSAPP_SELECTORS.activeChatHeaders) {
    for (const header of document.querySelectorAll<HTMLElement>(headerSelector)) {
      for (const titleSelector of WHATSAPP_SELECTORS.activeChatTitles) {
        const title = header.querySelector<HTMLElement>(titleSelector);
        const value = title?.getAttribute("title") || title?.innerText || title?.textContent || "";
        if (value.trim()) return value.trim();
      }
    }
  }
  return undefined;
}

export function isTargetGroup(activeTitle: string | undefined, target: string): boolean {
  return Boolean(activeTitle && normalizeAddress(activeTitle) === normalizeAddress(target));
}

export function findMessageContainer(): HTMLElement | null {
  for (const selector of WHATSAPP_SELECTORS.messageContainers) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) return element;
  }
  return null;
}
