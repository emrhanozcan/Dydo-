import { normalizeAddress } from "../core/addressNormalizer";
import type { ExtensionState, ParsedWhatsAppOrder, ParsedWhatsAppOrderItem, ProductPrice, WhatsAppProduct } from "../shared/types";
import type { WhatsAppMessage, WhatsAppParseResult } from "./whatsappTypes";

interface Match {
  start: number;
  end: number;
  quantity: number;
  product: WhatsAppProduct;
  text: string;
}

export function parseWhatsAppOrder(message: WhatsAppMessage, state: ExtensionState): WhatsAppParseResult {
  const products = state.whatsappProducts.filter((product) => product.active);
  const defaultProduct = products.find((product) => product.id === state.whatsappSettings.defaultProductId) ?? products.find((product) => product.isDefault);
  const potential: Match[] = [];
  for (const product of products) {
    for (const alias of product.aliases) collectMatches(message.text, alias, product, potential);
  }
  if (defaultProduct) {
    for (const word of state.whatsappSettings.defaultQuantityWords) collectMatches(message.text, word, defaultProduct, potential);
  }

  let matches = selectNonOverlapping(potential);
  if (matches.length === 0 && defaultProduct && state.whatsappSettings.bareNumberAsDefaultProduct) {
    const bare = message.text.match(/\b(\d+)\s*[.!?]?\s*$/u);
    if (bare?.index !== undefined) {
      matches = [{ start: bare.index, end: bare.index + bare[0].length, quantity: Number(bare[1]), product: defaultProduct, text: bare[0].trim() }];
    }
  }
  if (matches.length === 0) return { status: "not_order" };

  const firstStart = Math.min(...matches.map((match) => match.start));
  const rawAddress = message.text.slice(0, firstStart).replace(/[\s,;:-]+$/g, "").trim();
  const warnings: string[] = [];
  if (!rawAddress) warnings.push("Adres bulunamadı.");
  const unknown = unknownTail(message.text, firstStart, matches);
  if (unknown) warnings.push(`Tanımlanamayan sipariş metni: "${unknown}"`);

  const items = mergeItems(matches.map((match) => pricedItem(match, state.productPrices)));
  const missingPrices = items.filter((item) => item.unitPrice <= 0);
  if (missingPrices.length) warnings.push(`Fiyat eşleşmesi eksik: ${missingPrices.map((item) => item.productName).join(", ")}`);
  const confidence = unknown || !rawAddress ? "low" : missingPrices.length ? "medium" : "high";
  const fingerprint = createWhatsAppFingerprint(message);
  const order: ParsedWhatsAppOrder = {
    messageId: fingerprint,
    groupName: message.groupName,
    sender: message.sender,
    rawMessage: message.text,
    rawAddress,
    normalizedAddress: normalizeAddress(rawAddress),
    items,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    totalAmount: items.reduce((total, item) => total + item.totalPrice, 0),
    detectedAt: message.detectedAt,
    confidence,
    warnings,
  };
  return { status: "order", order };
}

export function createWhatsAppFingerprint(message: WhatsAppMessage): string {
  const source = [normalizeAddress(message.groupName), normalizeAddress(message.sender ?? ""), message.timestamp ?? "", message.messageKey ?? "", normalizeAddress(message.text)].join("|");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `wa_${(hash >>> 0).toString(36)}`;
}

export function resolveWhatsAppProductPrice(product: WhatsAppProduct, prices: Record<string, ProductPrice>): number {
  if (product.priceProductId && prices[product.priceProductId]) return prices[product.priceProductId].priceMinor;
  const exact = Object.values(prices).filter((price) => normalizeAddress(price.productName) === normalizeAddress(product.name));
  return exact.length === 1 ? exact[0].priceMinor : 0;
}

function collectMatches(text: string, alias: string, product: WhatsAppProduct, target: Match[]): void {
  const normalizedAlias = normalizeAddress(alias);
  if (!normalizedAlias) return;
  const aliasPattern = normalizedAlias.split(" ").map(escapeRegExp).join("[\\s.,/\\-]*");
  const pattern = new RegExp(`\\b(\\d+)\\s+${aliasPattern}\\b`, "giu");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const quantity = Number(match[1]);
    if (Number.isSafeInteger(quantity) && quantity > 0) target.push({ start: match.index, end: match.index + match[0].length, quantity, product, text: match[0] });
  }
}

function selectNonOverlapping(matches: Match[]): Match[] {
  const selected: Match[] = [];
  for (const match of matches.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start))) {
    if (!selected.some((item) => match.start < item.end && match.end > item.start)) selected.push(match);
  }
  return selected.sort((left, right) => left.start - right.start);
}

function pricedItem(match: Match, prices: Record<string, ProductPrice>): ParsedWhatsAppOrderItem {
  const unitPrice = resolveWhatsAppProductPrice(match.product, prices);
  return {
    productId: match.product.id,
    productName: match.product.name,
    quantity: match.quantity,
    unitType: match.product.unit,
    unitPrice,
    totalPrice: match.quantity * unitPrice,
    matchedText: match.text,
  };
}

function mergeItems(items: ParsedWhatsAppOrderItem[]): ParsedWhatsAppOrderItem[] {
  const merged = new Map<string, ParsedWhatsAppOrderItem>();
  for (const item of items) {
    const previous = merged.get(item.productId);
    if (previous) {
      previous.quantity += item.quantity;
      previous.totalPrice += item.totalPrice;
      previous.matchedText += `, ${item.matchedText}`;
    } else merged.set(item.productId, { ...item });
  }
  return [...merged.values()];
}

function unknownTail(text: string, start: number, matches: Match[]): string {
  const tail = [...text.slice(start)];
  for (const match of matches) {
    for (let index = Math.max(0, match.start - start); index < match.end - start; index += 1) tail[index] = " ";
  }
  const compact = tail.join("").replace(/[,;:+-]/g, " ").replace(/\s+/g, " ").trim();
  const normalized = normalizeAddress(compact).replace(/\b(?:ve|bir de|arti)\b/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? compact : "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
