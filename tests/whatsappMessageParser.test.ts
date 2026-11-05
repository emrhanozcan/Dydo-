import { describe, expect, it } from "vitest";
import { createWhatsAppFingerprint, parseWhatsAppOrder } from "../src/whatsapp/whatsappMessageParser";
import { isWhatsAppAutoImportable, shouldAutoImportWhatsAppMessage, whatsAppReportRecord } from "../src/whatsapp/whatsappOrderEngine";
import { createDefaultState } from "../src/storage/schema";
import type { ExtensionState } from "../src/shared/types";

function pricedState(): ExtensionState {
  const state = createDefaultState();
  const prices = [
    { id: "price-19", name: "19 LT Damacana", amount: 21_900 },
    { id: "price-05", name: "0.5 LT", amount: 14_500 },
    { id: "price-15", name: "1.5 LT", amount: 12_000 },
  ];
  for (const price of prices) state.productPrices[price.id] = { id: price.id, productName: price.name, priceMinor: price.amount, rawPrice: String(price.amount / 100), sourceUrl: "test", updatedAt: 1 };
  state.whatsappProducts.forEach((product, index) => { product.priceProductId = prices[index].id; });
  return state;
}

function parse(text: string, state = pricedState()) {
  return parseWhatsAppOrder({ groupName: "Saka", sender: "Ahmet", timestamp: "27.08.2026 17:15", text, detectedAt: 1 }, state);
}

describe("WhatsApp order parser", () => {
  it.each([
    ["Arıköy manolya 49 2 tane", "19 LT Damacana", 2, "Arıköy manolya 49"],
    ["Arıköy manolya 49 2 pc", "19 LT Damacana", 2, "Arıköy manolya 49"],
    ["Arıköy manolya 49 2 koli 05", "0.5 LT", 2, "Arıköy manolya 49"],
    ["Arıköy manolya 49 1 paket 1.5", "1.5 LT", 1, "Arıköy manolya 49"],
  ])("parses %s", (text, productName, quantity, address) => {
    const result = parse(text);
    expect(result.status).toBe("order");
    expect(result.order?.rawAddress).toBe(address);
    expect(result.order?.items).toEqual([expect.objectContaining({ productName, quantity })]);
    expect(result.order?.confidence).toBe("high");
  });

  it("parses multiple products as one priced order", () => {
    const result = parse("Arıköy manolya 49 2 pc 2 koli 05 1 paket 1.5").order!;
    expect(result.items.map((item) => [item.productName, item.quantity])).toEqual([["19 LT Damacana", 2], ["0.5 LT", 2], ["1.5 LT", 1]]);
    expect(result.totalQuantity).toBe(5);
    expect(result.totalAmount).toBe(2 * 21_900 + 2 * 14_500 + 12_000);
  });

  it.each([
    ["Karafil 17 2 tane", "Karafil 17", 2],
    ["Küçük Arıköy Çınarlı 8 2 tane", "Küçük Arıköy Çınarlı 8", 2],
    ["Yonca A5/6 1 tane", "Yonca A5/6", 1],
  ])("parses a live Saka message: %s", (text, address, quantity) => {
    const result = parse(text).order!;
    expect(result.rawAddress).toBe(address);
    expect(result.items[0]).toMatchObject({ productName: "19 LT Damacana", quantity });
  });

  it("keeps a partially recognized incoming order in the approval flow", () => {
    const result = parse("Noya B1/5 3 PC 1 paket 1 lt").order!;
    expect(result.rawAddress).toBe("Noya B1/5");
    expect(result.items).toEqual([expect.objectContaining({ productName: "19 LT Damacana", quantity: 3 })]);
    expect(result.confidence).toBe("low");
    expect(result.warnings.join(" ")).toContain("1 paket 1 lt");
  });

  it("keeps every number in the address before the first quantity pattern", () => {
    const result = parse("Kiptaş 1 blok no 2 daire 10 1 tane").order!;
    expect(result.rawAddress).toBe("Kiptaş 1 blok no 2 daire 10");
    expect(result.items[0].quantity).toBe(1);
  });

  it.each(["Araç 2 nerede?", "Tamamdır", "Arıköy manolya 49 2"])("rejects non-order text %s", (text) => {
    expect(parse(text).status).toBe("not_order");
  });

  it("supports opt-in bare trailing numbers", () => {
    const state = pricedState();
    state.whatsappSettings.bareNumberAsDefaultProduct = true;
    const result = parse("Arıköy manolya 49 2", state).order!;
    expect(result.rawAddress).toBe("Arıköy manolya 49");
    expect(result.items[0]).toMatchObject({ productName: "19 LT Damacana", quantity: 2 });
  });

  it("marks unknown fragments low-confidence", () => {
    const result = parse("Arıköy manolya 49 2 pc bir de küçüklerden 2 tane").order!;
    expect(result.confidence).toBe("low");
    expect(result.warnings.join(" ")).toContain("Tanımlanamayan");
  });

  it("never reports high confidence when a catalog price is missing", () => {
    const state = pricedState();
    state.whatsappProducts[0].priceProductId = undefined;
    delete state.productPrices["price-19"];
    const result = parse("Arıköy manolya 49 2 tane", state).order!;
    expect(result.confidence).toBe("medium");
    expect(result.totalAmount).toBe(0);
  });

  it("allows auto import only for complete high-confidence priced orders", () => {
    const state = pricedState();
    state.whatsappSettings.mode = "auto";
    const complete = parse("Arıköy manolya 49 2 tane", state).order!;
    const unknown = parse("Arıköy manolya 49 2 pc küçüklerden 2 tane", state).order!;
    expect(isWhatsAppAutoImportable(complete, state)).toBe(true);
    expect(isWhatsAppAutoImportable(unknown, state)).toBe(false);
    const record = whatsAppReportRecord(complete, 10);
    expect(record.channel).toBe("WhatsApp");
    expect(record.amountMinor).toBe(43_800);
    expect(record.items?.[0]).toMatchObject({ productName: "19 LT Damacana", quantity: 2, totalMinor: 43_800 });
  });

  it("always sends same-day recovered orders to manual approval", () => {
    const state = pricedState();
    state.whatsappSettings.mode = "auto";
    const order = parse("Karafil 17 2 tane", state).order!;
    const baseMessage = { groupName: "Saka", text: "Karafil 17 2 tane", detectedAt: 1 };
    expect(shouldAutoImportWhatsAppMessage(order, state, baseMessage)).toBe(true);
    expect(shouldAutoImportWhatsAppMessage(order, state, { ...baseMessage, historical: true })).toBe(false);
    expect(shouldAutoImportWhatsAppMessage(order, state, { ...baseMessage, outgoing: true })).toBe(false);
  });

  it("creates stable fingerprints and distinguishes timestamps", () => {
    const base = { groupName: "Saka", sender: "Ahmet", timestamp: "17:15", text: "Arıköy 2 tane", detectedAt: 1 };
    expect(createWhatsAppFingerprint(base)).toBe(createWhatsAppFingerprint({ ...base, detectedAt: 999 }));
    expect(createWhatsAppFingerprint(base)).not.toBe(createWhatsAppFingerprint({ ...base, timestamp: "17:16" }));
  });
});
