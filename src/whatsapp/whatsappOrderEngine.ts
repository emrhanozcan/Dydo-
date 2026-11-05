import { matchOrderVehicle } from "../core/vehicleMatcher";
import { showWhatsAppOrderNotification } from "../notifications/desktopNotification";
import { speak } from "../notifications/voice";
import type { ExtensionState, ParsedWhatsAppOrder, PrmOrder, ReportOrderRecord } from "../shared/types";
import { appendHistory, appendLog, getState, updateState } from "../storage/storage";
import { createWhatsAppFingerprint, parseWhatsAppOrder } from "./whatsappMessageParser";
import type { WhatsAppMessage } from "./whatsappTypes";

export async function processWhatsAppMessage(message: WhatsAppMessage): Promise<"imported" | "pending" | "ignored" | "duplicate"> {
  let state = await getState();
  if (!state.whatsappSettings.enabled || normalizeGroup(message.groupName) !== normalizeGroup(state.whatsappSettings.targetGroupName)) return "ignored";
  const fingerprint = createWhatsAppFingerprint(message);
  let reserved = false;
  await updateState((current) => {
    if (current.processedWhatsAppMessages.some((entry) => entry.fingerprint === fingerprint)) return;
    reserved = true;
    current.processedWhatsAppMessages.unshift({
      fingerprint,
      rawMessage: message.text,
      groupName: message.groupName,
      sender: message.sender,
      timestamp: message.timestamp,
      status: "pending",
      createdAt: message.detectedAt,
    });
    current.processedWhatsAppMessages = current.processedWhatsAppMessages.slice(0, 2000);
  });
  if (!reserved) {
    await appendLog({ level: "INFO", code: "WHATSAPP_DUPLICATE_MESSAGE", message: fingerprint });
    return "duplicate";
  }

  state = await getState();
  const parsed = parseWhatsAppOrder(message, state);
  if (parsed.status === "not_order" || !parsed.order) {
    await setProcessedStatus(fingerprint, "ignored");
    return "ignored";
  }
  const order = parsed.order;
  const decision = matchOrderVehicle(asPrmOrder(order), state.vehicles, state.learnedAddresses);
  order.suggestedVehicleId = decision.vehicleId;
  // Orders recovered from today's chat history must always be reviewed by the
  // operator, even when live-message mode is set to automatic.
  const canAutoImport = shouldAutoImportWhatsAppMessage(order, state, message);
  if (canAutoImport) {
    await importWhatsAppOrder(order, "automatic");
    await notifyOrder(order, state, true);
    return "imported";
  }

  await updateState((current) => {
    current.pendingWhatsAppOrders = [order, ...current.pendingWhatsAppOrders.filter((item) => item.messageId !== fingerprint)];
  });
  await appendHistory({ orderId: fingerprint, address: order.rawAddress, suggestedVehicleId: order.suggestedVehicleId, mode: "safe", result: "pending", reason: order.warnings.join("; ") || (message.historical ? "whatsapp_same_day_history" : "whatsapp_safe_mode") });
  await appendLog({ level: order.confidence === "low" ? "WARNING" : "INFO", code: "WHATSAPP_ORDER_PENDING", message: `${order.rawAddress}: ${order.items.length} ürün`, orderId: fingerprint });
  if (!message.historical) await notifyOrder(order, state, false);
  return "pending";
}

export function shouldAutoImportWhatsAppMessage(order: ParsedWhatsAppOrder, state: ExtensionState, message: WhatsAppMessage): boolean {
  return !message.historical && !message.outgoing && isWhatsAppAutoImportable(order, state);
}

export function isWhatsAppAutoImportable(order: ParsedWhatsAppOrder, state: ExtensionState): boolean {
  return state.whatsappSettings.mode === "auto" && order.confidence === "high" && order.warnings.length === 0 &&
    Boolean(order.normalizedAddress) && order.items.length > 0 && order.items.every((item) => item.unitPrice > 0);
}

export async function reviewWhatsAppOrder(fingerprint: string, action: "approve" | "ignore", editedOrder?: ParsedWhatsAppOrder): Promise<void> {
  const state = await getState();
  const order = editedOrder ?? state.pendingWhatsAppOrders.find((item) => item.messageId === fingerprint);
  if (!order) throw new Error("Onay bekleyen WhatsApp siparişi bulunamadı.");
  if (action === "ignore") {
    await updateState((current) => {
      current.pendingWhatsAppOrders = current.pendingWhatsAppOrders.filter((item) => item.messageId !== fingerprint);
      const processed = current.processedWhatsAppMessages.find((item) => item.fingerprint === fingerprint);
      if (processed) processed.status = "ignored";
    });
    await appendHistory({ orderId: fingerprint, address: order.rawAddress, suggestedVehicleId: order.suggestedVehicleId, mode: "safe", result: "skipped", reason: "whatsapp_not_order" });
    return;
  }
  const sanitized = sanitizeEditedOrder(order);
  const decision = matchOrderVehicle(asPrmOrder(sanitized), state.vehicles, state.learnedAddresses);
  sanitized.suggestedVehicleId = decision.vehicleId;
  await importWhatsAppOrder(sanitized, "safe");
}

export function whatsAppReportRecord(order: ParsedWhatsAppOrder, now = Date.now()): ReportOrderRecord {
  return {
    orderId: order.messageId,
    customerName: order.sender,
    vehicleId: order.suggestedVehicleId,
    channel: "WhatsApp",
    amountMinor: order.totalAmount,
    rawAmount: `${(order.totalAmount / 100).toFixed(2)} TL`,
    details: order.items.map((item) => `${item.productName} ${item.quantity} ${titleUnit(item.unitType)}`).join("; "),
    items: order.items.map((item) => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, unit: titleUnit(item.unitType), unitPriceMinor: item.unitPrice, totalMinor: item.totalPrice })),
    orderCreatedAt: order.detectedAt,
    capturedAt: now,
    updatedAt: now,
  };
}

async function importWhatsAppOrder(order: ParsedWhatsAppOrder, mode: "safe" | "automatic"): Promise<void> {
  await updateState((state) => {
    state.reportOrders[order.messageId] = whatsAppReportRecord(order);
    state.pendingWhatsAppOrders = state.pendingWhatsAppOrders.filter((item) => item.messageId !== order.messageId);
    const processed = state.processedWhatsAppMessages.find((item) => item.fingerprint === order.messageId);
    if (processed) processed.status = "imported";
  });
  await appendHistory({ orderId: order.messageId, address: order.rawAddress, suggestedVehicleId: order.suggestedVehicleId, assignedVehicleId: order.suggestedVehicleId, mode, result: "success", reason: "whatsapp_imported" });
  await appendLog({ level: "INFO", code: "WHATSAPP_ORDER_IMPORTED", message: `${order.rawAddress}: ${(order.totalAmount / 100).toFixed(2)} TL`, orderId: order.messageId });
}

async function setProcessedStatus(fingerprint: string, status: "ignored" | "failed"): Promise<void> {
  await updateState((state) => {
    const processed = state.processedWhatsAppMessages.find((item) => item.fingerprint === fingerprint);
    if (processed) processed.status = status;
  });
}

async function notifyOrder(order: ParsedWhatsAppOrder, state: ExtensionState, imported: boolean): Promise<void> {
  try {
    if (state.whatsappSettings.notificationEnabled) await showWhatsAppOrderNotification(order, imported);
    if (state.whatsappSettings.voiceEnabled) {
      const items = order.items.map((item) => `${item.quantity} ${item.unitType} ${item.productName}`).join(". ");
      await speak(`Yeni WhatsApp siparişi. Adres: ${order.rawAddress}. Sipariş: ${items}.`, state.settings.volume);
    }
  } catch (error) {
    await appendLog({ level: "ERROR", code: "WHATSAPP_NOTIFICATION_FAILED", message: error instanceof Error ? error.message : String(error), orderId: order.messageId });
  }
}

function asPrmOrder(order: ParsedWhatsAppOrder): PrmOrder {
  return { id: order.messageId, rawAddress: order.rawAddress, normalizedAddress: order.normalizedAddress, detectedAt: order.detectedAt };
}

function sanitizeEditedOrder(order: ParsedWhatsAppOrder): ParsedWhatsAppOrder {
  const items = order.items.filter((item) => Number.isFinite(item.quantity) && item.quantity > 0 && Number.isSafeInteger(item.unitPrice) && item.unitPrice >= 0)
    .map((item) => ({ ...item, quantity: Math.floor(item.quantity), totalPrice: Math.floor(item.quantity) * item.unitPrice }));
  if (!order.rawAddress.trim() || items.length === 0) throw new Error("Adres ve en az bir geçerli ürün gerekli.");
  return { ...order, items, totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0), totalAmount: items.reduce((sum, item) => sum + item.totalPrice, 0) };
}

function normalizeGroup(value: string): string { return value.trim().toLocaleLowerCase("tr-TR"); }
function titleUnit(value: string): string { return value.charAt(0).toLocaleUpperCase("tr-TR") + value.slice(1); }
