import { parsePrmAmountToMinor, parsePrmDate } from "./reportEngine";
import type { ReturnPalletItem } from "../shared/types";

export interface ExtractedInvoiceMetadata {
  vendor: string;
  documentDate: number;
  amountMinor?: number;
  confidence: "automatic" | "needs_review";
}

export interface ExtractedReturnPalletMetadata extends ExtractedInvoiceMetadata {
  items: ReturnPalletItem[];
}

const TOTAL_LABELS = [
  "ödenecek tutar",
  "genel toplam",
  "vergiler dahil toplam tutar",
  "fatura toplamı",
  "toplam tutar",
  "mal hizmet toplam tutarı",
] as const;

export function extractInvoiceMetadata(text: string, fileName: string, now = Date.now()): ExtractedInvoiceMetadata {
  const compact = text.replace(/\s+/g, " ").trim();
  let amountMinor: number | undefined;
  for (const label of TOTAL_LABELS) {
    const pattern = new RegExp(`${escapeRegExp(label)}[^\\d-]{0,50}(-?\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})|-?\\d+(?:[.,]\\d{2}))`, "giu");
    const matches = [...compact.matchAll(pattern)];
    const candidate = matches.at(-1)?.[1];
    if (candidate) {
      amountMinor = parsePrmAmountToMinor(candidate);
      if (amountMinor !== undefined) break;
    }
  }

  const dateMatch = compact.match(/(?:fatura tarihi|düzenleme tarihi|belge tarihi|tarih)[^\d]{0,25}(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/iu)
    ?? compact.match(/(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})/u);
  const documentDate = dateMatch ? parsePrmDate(dateMatch[1], now) : now;
  return {
    vendor: fileName.replace(/\.pdf$/iu, "").replace(/[_-]+/g, " ").trim(),
    documentDate,
    amountMinor,
    confidence: amountMinor !== undefined && compact.length >= 30 ? "automatic" : "needs_review",
  };
}

export function extractReturnPalletMetadata(text: string, fileName: string, now = Date.now()): ExtractedReturnPalletMetadata {
  const invoice = extractInvoiceMetadata(text, fileName, now);
  const items = extractReturnPalletItems(text);
  return {
    ...invoice,
    items,
    confidence: invoice.amountMinor !== undefined && items.length > 0 ? "automatic" : "needs_review",
  };
}

export function extractReturnPalletItems(text: string): ReturnPalletItem[] {
  const unitPattern = "ADET|AD|KOLİ|KOLI|PALET|PAKET|KASA|ŞİŞE|SISE|KG|LT|LİTRE|LITRE";
  const nameThenQuantity = new RegExp(`^(.{2,160}?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${unitPattern})\\b`, "iu");
  const quantityThenName = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${unitPattern})\\s+(.{2,160}?)(?=\\s+-?\\d[\\d.]*,\\d{2}\\s*(?:TL|₺)|$)`, "iu");
  const candidates = text
    .split(/\r?\n|[;|]+/u)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const items: ReturnPalletItem[] = [];

  for (const line of candidates) {
    const leadingName = line.match(nameThenQuantity);
    const leadingQuantity = leadingName ? null : line.match(quantityThenName);
    const rawName = leadingName?.[1] ?? leadingQuantity?.[3];
    const rawQuantity = leadingName?.[2] ?? leadingQuantity?.[1];
    const rawUnit = leadingName?.[3] ?? leadingQuantity?.[2];
    if (!rawName || !rawQuantity || !rawUnit) continue;
    const name = cleanReturnProductName(rawName);
    const quantity = Number.parseFloat(rawQuantity.replace(",", "."));
    if (!name || isReturnTableHeader(name) || !Number.isFinite(quantity) || quantity <= 0) continue;
    items.push({ name, quantity, unit: canonicalReturnUnit(rawUnit) });
  }

  return mergeReturnItems(items);
}

function cleanReturnProductName(value: string): string {
  return value
    .replace(/^\d{1,4}\s+(?=[A-Za-zÇĞİÖŞÜçğıöşü])/u, "")
    .replace(/^(?:ürün|mal hizmet|açıklama)\s*[:\-]?\s*/iu, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, "")
    .trim();
}

function isReturnTableHeader(value: string): boolean {
  const normalized = value.toLocaleLowerCase("tr-TR");
  return ["ürün", "mal hizmet", "açıklama", "miktar", "birim", "fiyat", "toplam"].some((header) => normalized === header);
}

function canonicalReturnUnit(value: string): string {
  const normalized = value.toLocaleUpperCase("tr-TR");
  if (normalized === "AD") return "Adet";
  if (normalized === "KOLI") return "Koli";
  if (normalized === "SISE") return "Şişe";
  if (normalized === "LITRE") return "Litre";
  return normalized.charAt(0) + normalized.slice(1).toLocaleLowerCase("tr-TR");
}

function mergeReturnItems(items: ReturnPalletItem[]): ReturnPalletItem[] {
  const merged = new Map<string, ReturnPalletItem>();
  for (const item of items) {
    const key = `${item.name.toLocaleLowerCase("tr-TR")}|${item.unit.toLocaleLowerCase("tr-TR")}`;
    const current = merged.get(key);
    if (current) current.quantity += item.quantity;
    else merged.set(key, { ...item });
  }
  return [...merged.values()];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
