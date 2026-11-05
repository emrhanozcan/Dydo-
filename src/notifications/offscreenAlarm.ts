import { MESSAGE, type ExtensionMessage } from "../shared/messages";

const OFFSCREEN_URL = "offscreen.html";
let creatingDocument: Promise<void> | null = null;

export async function playOffscreenAlarm(volume: number): Promise<void> {
  await ensureOffscreenDocument();
  const message: ExtensionMessage = { type: MESSAGE.PLAY_ALARM, volume };
  await chrome.runtime.sendMessage(message);
}

async function ensureOffscreenDocument(): Promise<void> {
  const documentUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [documentUrl],
  });
  if (contexts.length > 0) return;
  if (creatingDocument) return creatingDocument;
  creatingDocument = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "Yeni sipariş alarmını kullanıcı arayüzünü kesmeden çalmak.",
  }).finally(() => { creatingDocument = null; });
  return creatingDocument;
}
