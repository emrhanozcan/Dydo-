import type { MatchDecision, ParsedWhatsAppOrder, PrmOrder, Vehicle } from "../shared/types";

export async function showOrderNotification(
  order: PrmOrder,
  decision: MatchDecision,
  vehicles: Vehicle[],
): Promise<string> {
  const vehicle = vehicles.find((candidate) => candidate.id === decision.vehicleId);
  const id = `prm-order-${order.id}`;
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon128.png"),
    title: "PRM Assistant — Yeni Sipariş",
    message: `${shortAddress(order.rawAddress)}\n${vehicle ? `Önerilen: ${vehicle.shortName}` : "Manuel seçim gerekli"}`,
    priority: 2,
  });
  return id;
}

export async function showWarningNotification(title: string, message: string): Promise<void> {
  await chrome.notifications.create(`prm-warning-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon128.png"),
    title,
    message,
    priority: 2,
  });
}

export async function showWhatsAppOrderNotification(order: ParsedWhatsAppOrder, imported: boolean): Promise<string> {
  const id = `prm-whatsapp-${order.messageId}`;
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon128.png"),
    title: imported ? "WhatsApp Siparişi Kaydedildi" : "Yeni WhatsApp Siparişi",
    message: `${shortAddress(order.rawAddress)}\n${order.items.map((item) => `${item.quantity} × ${item.productName}`).join(", ")}\nToplam: ${(order.totalAmount / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}`,
    priority: 2,
  });
  return id;
}

function shortAddress(address: string): string {
  return address.length > 120 ? `${address.slice(0, 117)}...` : address;
}
