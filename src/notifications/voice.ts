import type { MatchDecision, PrmOrder, Vehicle } from "../shared/types";

export function buildOrderSpeech(order: PrmOrder, decision: MatchDecision, vehicles: Vehicle[]): string {
  const vehicle = vehicles.find((candidate) => candidate.id === decision.vehicleId);
  if (decision.reason === "inactive") {
    return `Yeni sipariş geldi. Müşteri adresi: ${order.rawAddress}. Normal teslimatçı ${vehicle?.shortName ?? "bilinmiyor"}. Ancak bu araç bugün çalışmıyor. Manuel araç seçimi gerekli.`;
  }
  if (!vehicle) {
    return `Yeni sipariş geldi. Müşteri adresi: ${order.rawAddress}. Araç eşleşmesi bulunamadı. Manuel seçim gerekli.`;
  }
  return `Yeni sipariş geldi. Müşteri adresi: ${order.rawAddress}. Önerilen teslimatçı: ${vehicle.shortName}.`;
}

export function speak(text: string, volume: number): void {
  chrome.tts.stop();
  chrome.tts.speak(text, { lang: "tr-TR", volume: Math.max(0, Math.min(1, volume)), rate: 0.95 });
}
