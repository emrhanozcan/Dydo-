import { MESSAGE, sendMessage, type ExtensionMessage } from "../shared/messages";
import type { ExtensionState } from "../shared/types";
import { getState } from "../storage/storage";
import { findMessageContainer, getActiveChatTitle, isTargetGroup } from "./whatsappDetector";
import { findMessageNodes, readMessage, WhatsAppObserver } from "./whatsappObserver";
import { WhatsAppOrderOverlay } from "./whatsappOverlay";

let state: ExtensionState;
let observer: WhatsAppObserver | undefined;
const overlay = new WhatsAppOrderOverlay();

void bootstrap();

async function bootstrap(): Promise<void> {
  state = await getState();
  overlay.render(state);
  startObserver();
  chrome.storage.onChanged.addListener(() => void getState().then((next) => { state = next; overlay.render(state); }));
}

function startObserver(): void {
  observer?.stop();
  if (!state.whatsappSettings.enabled) {
    void reportStatus();
    return;
  }
  observer = new WhatsAppObserver(
    () => state.whatsappSettings.targetGroupName,
    (message) => void sendMessage({ type: MESSAGE.WHATSAPP_MESSAGE, message }),
    () => void reportStatus(),
  );
  observer.start();
}

async function reportStatus(): Promise<void> {
  const activeGroupName = getActiveChatTitle();
  const container = findMessageContainer();
  const nodes = container ? findMessageNodes(container) : [];
  const latest = nodes.length && activeGroupName ? readMessage(nodes[nodes.length - 1], activeGroupName) : null;
  const latestMessageFound = Boolean(latest);
  await sendMessage({
    type: MESSAGE.WHATSAPP_STATUS,
    status: {
      tabFound: true,
      pageDetected: true,
      activeGroupName,
      targetGroupActive: isTargetGroup(activeGroupName, state.whatsappSettings.targetGroupName),
      messageContainerFound: Boolean(container),
      latestMessageFound,
      messageTextFound: Boolean(latest?.text),
      senderFound: Boolean(latest?.sender),
      timestampFound: Boolean(latest?.timestamp),
      lastCheckAt: Date.now(),
    },
  });
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === MESSAGE.PING_WHATSAPP) {
    sendResponse({ ok: true });
    return false;
  }
  if (message.type !== MESSAGE.STATE_CHANGED) return false;
  void getState().then((next) => { state = next; startObserver(); sendResponse({ ok: true }); });
  return true;
});

window.addEventListener("pagehide", () => { observer?.stop(); overlay.destroy(); });
