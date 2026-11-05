import { learnAddress } from "../core/learningEngine";
import { addLearnedAddressRules } from "../core/addressRuleExtractor";
import { reportRecordFromOrder } from "../core/reportEngine";
import { showOrderNotification, showWarningNotification } from "../notifications/desktopNotification";
import { buildOrderSpeech, speak } from "../notifications/voice";
import { playOffscreenAlarm } from "../notifications/offscreenAlarm";
import { MESSAGE, type ExtensionMessage, type MessageResponse } from "../shared/messages";
import { appendHistory, appendLog, getState, initializeStorage, updateState } from "../storage/storage";
import { acceptProductPrices, ensureDailyProductPriceSync, failProductPriceSync, isAutomaticSyncTab, PRODUCT_PRICE_TIMEOUT_ALARM } from "../productPrices/productPriceSync";
import { processWhatsAppMessage, reviewWhatsAppOrder } from "../whatsapp/whatsappOrderEngine";
import type { ExtensionState } from "../shared/types";

void initializeRuntimeHealth().catch((error: unknown) => console.error("[PRM Assistant] WhatsApp health initialization failed", error));

chrome.runtime.onInstalled.addListener(() => void initializeAndSchedulePriceSync());
chrome.runtime.onStartup.addListener(() => void initializeAndSchedulePriceSync());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PRODUCT_PRICE_TIMEOUT_ALARM) void getState().then((state) => state.productPriceSync.status === "syncing" ? failProductPriceSync("Ürün fiyat sayfası 120 saniye içinde okunamadı.") : undefined);
  if (alarm.name === "prm-product-price-startup") void ensureDailyProductPriceSync().catch((error: unknown) => failProductPriceSync(error instanceof Error ? error.message : String(error)));
  if (alarm.name === "prm-whatsapp-health") void probeWhatsAppConnection(true);
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse: (response: MessageResponse) => void) => {
  void handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

async function handleMessage(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<MessageResponse> {
  switch (message.type) {
    case MESSAGE.GET_STATE:
      void probeWhatsAppConnection(false);
      return { ok: true, state: await getState() };
    case MESSAGE.PAGE_STATUS: {
      await updateState((state) => {
        state.runtime = { ...state.runtime, ...message.status, tabId: sender.tab?.id ?? state.runtime.tabId };
      });
      if (message.status.diagnostics?.automaticLoginFailed) {
        await showWarningNotification("PRM Assistant", "Otomatik giriş başarısız. Manuel kontrol gerekli.");
      }
      if (message.status.health === "dom_incompatible") {
        await appendLog({ level: "ERROR", code: "DOM_INCOMPATIBLE", message: "PRM arayüzü değişmiş olabilir. Otomatik işlemler durduruldu." });
        await showWarningNotification("PRM arayüzü uyumsuz", "Otomatik işlemler durduruldu. Selector diagnostics ekranını kontrol edin.");
      }
      return { ok: true };
    }
    case MESSAGE.NEW_ORDER: {
      const state = await getState();
      await updateState((next) => {
        next.runtime.lastOrderId = message.order.id;
        next.runtime.lastCheckAt = Date.now();
        if (next.dismissedReportOrders[message.order.id] === undefined) {
          next.reportOrders[message.order.id] = reportRecordFromOrder(
            message.order,
            next.vehicles,
            next.reportOrders[message.order.id],
          );
        }
      });
      await Promise.all([
        state.settings.desktopNotifications
          ? runNotificationChannel("DESKTOP_NOTIFICATION_FAILED", () => showOrderNotification(message.order, message.decision, state.vehicles), message.order.id)
          : Promise.resolve(),
        state.settings.alarmSound
          ? runNotificationChannel("ALARM_FAILED", () => playOffscreenAlarm(state.settings.volume), message.order.id)
          : Promise.resolve(),
        state.settings.addressSpeech
          ? runNotificationChannel("TTS_FAILED", async () => speak(buildOrderSpeech(message.order, message.decision, state.vehicles), state.settings.volume), message.order.id)
          : Promise.resolve(),
      ]);
      await appendHistory({
        orderId: message.order.id,
        address: message.order.rawAddress,
        suggestedVehicleId: message.decision.vehicleId,
        mode: state.settings.assignmentMode,
        result: "pending",
        reason: message.decision.reason,
      });
      return { ok: true };
    }
    case MESSAGE.ASSIGNMENT_RESULT: {
      let learnedRuleConflicts: { keyword: string; ownerVehicleId: string }[] = [];
      await updateState((state) => {
        state.pendingAssignments = state.pendingAssignments.filter((pending) => pending.orderId !== message.order.id);
        if (message.success && message.learn && state.settings.learnAddresses) {
          state.learnedAddresses = learnAddress(
            state.learnedAddresses,
            message.order.rawAddress,
            message.vehicleId,
            message.mode === "automatic" ? "automatic" : message.mode === "safe" ? "safe_approved" : "manual_selection",
          );
          if (message.mode !== "automatic") {
            const result = addLearnedAddressRules(state.vehicles, message.vehicleId, message.order.rawAddress);
            state.vehicles = result.vehicles;
            learnedRuleConflicts = result.conflicts;
          }
        }
        if (message.success && state.dismissedReportOrders[message.order.id] === undefined) {
          state.reportOrders[message.order.id] = reportRecordFromOrder(
            message.order,
            state.vehicles,
            state.reportOrders[message.order.id],
            message.vehicleId,
          );
        }
      });
      for (const conflict of learnedRuleConflicts) {
        await appendLog({
          level: "WARNING",
          code: "LEARNED_KEYWORD_CONFLICT",
          message: `${conflict.keyword} başka bir araç için zaten kayıtlı olduğundan otomatik eklenmedi.`,
          orderId: message.order.id,
        });
      }
      await appendHistory({
        orderId: message.order.id,
        address: message.order.rawAddress,
        suggestedVehicleId: undefined,
        assignedVehicleId: message.vehicleId,
        mode: message.mode,
        result: message.success ? "success" : "failed",
        reason: message.reason,
      });
      if (!message.success) {
        await appendLog({ level: "ERROR", code: "ORDER_ASSIGNMENT_FAILED", message: message.reason ?? "Atama doğrulanamadı.", orderId: message.order.id });
        await showWarningNotification("Atama başarısız", `${message.order.id}: ${message.reason ?? "Manuel kontrol gerekli."}`);
      }
      return { ok: true };
    }
    case MESSAGE.TEST_VOICE: {
      const state = await getState();
      await Promise.all([
        runNotificationChannel("TEST_ALARM_FAILED", () => playOffscreenAlarm(state.settings.volume)),
        runNotificationChannel("TEST_TTS_FAILED", async () => speak("PRM Assistant test sesi. Sesli bildirim çalışıyor.", state.settings.volume)),
        runNotificationChannel("TEST_DESKTOP_NOTIFICATION_FAILED", () => showWarningNotification("PRM Assistant Test", "Masaüstü bildirimi çalışıyor.")),
      ]);
      return { ok: true };
    }
    case MESSAGE.FOCUS_PRM:
      await focusPrmTab();
      return { ok: true };
    case MESSAGE.SYNC_PRODUCT_PRICES:
      await ensureDailyProductPriceSync(message.force ?? true);
      return { ok: true };
    case MESSAGE.PRODUCT_PRICES_SCRAPED:
      try {
        await acceptProductPrices(message.products, message.pageCount, message.complete);
      } catch (error) {
        await failProductPriceSync(error instanceof Error ? error.message : String(error));
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      return { ok: true };
    case MESSAGE.PRODUCT_PRICE_SYNC_FAILED:
      await failProductPriceSync(message.error);
      return { ok: true };
    case MESSAGE.WHATSAPP_STATUS:
      await updateState((state) => { state.whatsappRuntime = { ...message.status, tabFound: true }; });
      return { ok: true };
    case MESSAGE.WHATSAPP_MESSAGE:
      await processWhatsAppMessage(message.message);
      return { ok: true };
    case MESSAGE.REVIEW_WHATSAPP_ORDER:
      await reviewWhatsAppOrder(message.fingerprint, message.action, message.editedOrder);
      return { ok: true };
    case MESSAGE.RECONNECT_WHATSAPP:
      await probeWhatsAppConnection(true);
      return { ok: true };
    case MESSAGE.START_ORDER_HISTORY_LEARN: {
      const orderListUrl = "https://dydoprm.visionplus.com.tr/main/order-management/order-list";
      const tabs = await chrome.tabs.query({ url: "*://dydoprm.visionplus.com.tr/main/order-management/order-list*" });
      let tabId: number;
      if (tabs.length > 0 && tabs[0].id) {
        tabId = tabs[0].id;
        await chrome.tabs.update(tabId, { active: true });
        if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        const newTab = await chrome.tabs.create({ url: orderListUrl, active: true });
        tabId = newTab.id!;
        await new Promise((resolve) => setTimeout(resolve, 3500));
      }

      try {
        const res = await chrome.tabs.sendMessage(tabId, {
          type: MESSAGE.START_ORDER_HISTORY_LEARN,
          maxPages: message.maxPages,
        }) as MessageResponse;
        return res || { ok: true };
      } catch (err) {
        return { ok: true, error: "Sipariş listesi sayfası açıldı. Sayfadaki [Taramayı Başlat] butonuna basarak işlemi başlatabilirsiniz." };
      }
    }
    case MESSAGE.PLAY_ALARM:
      return { ok: true };
    case MESSAGE.STATE_CHANGED:
    case MESSAGE.ASSIGN_ORDER:
    case MESSAGE.SCRAPE_PRODUCT_PRICES:
    case MESSAGE.PING_WHATSAPP:
      return { ok: true };
  }
}

chrome.notifications.onClicked.addListener((notificationId) => void (notificationId.startsWith("prm-whatsapp-") ? focusWhatsAppTab() : focusPrmTab()));
chrome.tabs.onRemoved.addListener((tabId) => {
  void updateState((state) => {
    if (state.runtime.tabId === tabId) state.runtime = { health: "tab_not_found" };
  });
  void isAutomaticSyncTab(tabId).then(async (automatic) => {
    if (automatic) await failProductPriceSync("Ürün fiyat sekmesi okuma tamamlanmadan kapatıldı.");
  });
  void chrome.tabs.query({ url: "https://web.whatsapp.com/*" }).then((tabs) => {
    if (tabs.length === 0) void updateState((state) => { state.whatsappRuntime = disconnectedWhatsAppRuntime(false); });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url?.includes("/main/product-management/product-price-list")) return;
  void chrome.tabs.sendMessage(tabId, { type: MESSAGE.SCRAPE_PRODUCT_PRICES }).catch(() => undefined);
});

async function initializeAndSchedulePriceSync(): Promise<void> {
  await initializeStorage();
  const whatsappTabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (whatsappTabs.length === 0) await updateState((state) => { state.whatsappRuntime = disconnectedWhatsAppRuntime(false); });
  chrome.alarms.create("prm-product-price-startup", { delayInMinutes: 0.1 });
  chrome.alarms.create("prm-whatsapp-health", { delayInMinutes: 0.1, periodInMinutes: 1 });
  await probeWhatsAppConnection(true);
}

async function initializeRuntimeHealth(): Promise<void> {
  await getState();
  chrome.alarms.create("prm-whatsapp-health", { delayInMinutes: 0.1, periodInMinutes: 1 });
  await probeWhatsAppConnection(true);
}

async function probeWhatsAppConnection(repair: boolean): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length === 0) {
    await updateState((state) => { state.whatsappRuntime = disconnectedWhatsAppRuntime(false); });
    return;
  }
  let connected = false;
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: MESSAGE.PING_WHATSAPP }) as MessageResponse;
      if (response?.ok) { connected = true; await forgetWhatsAppRepair(tab.id); }
    } catch {
      if (repair && await shouldRepairWhatsAppTab(tab.id)) {
        await rememberWhatsAppRepair(tab.id);
        await chrome.tabs.reload(tab.id);
      }
    }
  }
  if (!connected) await updateState((state) => { state.whatsappRuntime = disconnectedWhatsAppRuntime(true); });
}

const WHATSAPP_REPAIR_KEY = "prmWhatsAppRepairAttempts";
async function shouldRepairWhatsAppTab(tabId: number): Promise<boolean> {
  const result = await chrome.storage.session.get(WHATSAPP_REPAIR_KEY);
  const attempts = (result[WHATSAPP_REPAIR_KEY] ?? {}) as Record<string, number>;
  return Date.now() - (attempts[String(tabId)] ?? 0) > 10 * 60 * 1000;
}
async function rememberWhatsAppRepair(tabId: number): Promise<void> {
  const result = await chrome.storage.session.get(WHATSAPP_REPAIR_KEY);
  const attempts = (result[WHATSAPP_REPAIR_KEY] ?? {}) as Record<string, number>;
  attempts[String(tabId)] = Date.now();
  await chrome.storage.session.set({ [WHATSAPP_REPAIR_KEY]: attempts });
}
async function forgetWhatsAppRepair(tabId: number): Promise<void> {
  const result = await chrome.storage.session.get(WHATSAPP_REPAIR_KEY);
  const attempts = (result[WHATSAPP_REPAIR_KEY] ?? {}) as Record<string, number>;
  if (!(String(tabId) in attempts)) return;
  delete attempts[String(tabId)];
  await chrome.storage.session.set({ [WHATSAPP_REPAIR_KEY]: attempts });
}
function disconnectedWhatsAppRuntime(tabFound: boolean): ExtensionState["whatsappRuntime"] {
  return { tabFound, pageDetected: false, targetGroupActive: false, messageContainerFound: false, latestMessageFound: false, messageTextFound: false, senderFound: false, timestampFound: false, lastCheckAt: Date.now() };
}

async function focusPrmTab(): Promise<void> {
  const state = await getState();
  if (state.runtime.tabId !== undefined) {
    await chrome.tabs.update(state.runtime.tabId, { active: true });
    const tab = await chrome.tabs.get(state.runtime.tabId);
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  }
}

async function focusWhatsAppTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tab?.id === undefined) return;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
}

async function runNotificationChannel(code: string, operation: () => Promise<unknown>, orderId?: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await appendLog({ level: "ERROR", code, message, orderId });
    } catch {
      console.error("[PRM Assistant]", code, message);
    }
  }
}
