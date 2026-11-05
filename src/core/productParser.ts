import { normalizeAddress } from "./addressNormalizer";
import type { ReportOrderRecord } from "../shared/types";

export interface ParsedProductLine {
  key: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface ProductSalesRow extends ParsedProductLine {
  orderCount: number;
  amountMinor: number;
}

const QUANTITY_PATTERN = /(.*?)(\d+(?:[.,]\d+)?)\s*(Adet|Koli|Paket|Şişe)\b/giu;

export function parseProductLines(details?: string): ParsedProductLine[] {
  if (!details?.trim()) return [];
  const compact = details.replace(/\s+/g, " ").trim();
  const lines: ParsedProductLine[] = [];
  QUANTITY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = QUANTITY_PATTERN.exec(compact)) !== null) {
    const rawName = match[1].replace(/^[,;:\s-]+|[,;:\s-]+$/g, "").trim();
    const quantity = Number.parseFloat(match[2].replace(",", "."));
    const unit = titleCaseUnit(match[3]);
    if (!rawName || !Number.isFinite(quantity) || quantity <= 0) continue;
    const name = canonicalProductName(rawName);
    lines.push({ key: `${normalizeAddress(name)}|${normalizeAddress(unit)}`, name, quantity, unit });
  }
  if (lines.length === 0 && compact.length > 0) {
    const name = canonicalProductName(compact.slice(0, 120));
    lines.push({ key: `${normalizeAddress(name)}|adet`, name, quantity: 1, unit: "Adet" });
  }
  return lines;
}

export function aggregateProductSales(orders: ReportOrderRecord[]): ProductSalesRow[] {
  const rows = new Map<string, ProductSalesRow>();
  for (const order of orders) {
    const lines = order.items?.length
      ? order.items.map((item) => ({ key: `${normalizeAddress(item.productName)}|${normalizeAddress(item.unit)}`, name: item.productName, quantity: item.quantity, unit: item.unit }))
      : parseProductLines(order.details);
    if (lines.length === 0) continue;
    const totalWeight = lines.reduce((total, line) => total + line.quantity, 0);
    let allocated = 0;
    lines.forEach((line, index) => {
      const explicitTotal = order.items?.[index]?.totalMinor;
      const share = explicitTotal !== undefined ? explicitTotal : index === lines.length - 1
        ? order.amountMinor - allocated
        : Math.round(order.amountMinor * (line.quantity / totalWeight));
      allocated += share;
      const row = rows.get(line.key) ?? { ...line, quantity: 0, orderCount: 0, amountMinor: 0 };
      row.quantity += line.quantity;
      row.orderCount += 1;
      row.amountMinor += share;
      rows.set(line.key, row);
    });
  }
  return [...rows.values()].sort((a, b) => b.quantity - a.quantity || b.amountMinor - a.amountMinor);
}

function canonicalProductName(rawName: string): string {
  const normalized = normalizeAddress(rawName);
  const volume = rawName.toLocaleLowerCase("tr-TR").match(/(\d+(?:[.,]\d+)?)\s*(?:lt|l)\b/);
  if (!volume) return rawName.replace(/\s+/g, " ").trim();
  const amount = volume[1].replace(".", ",");
  const pack = normalized.match(/\bx\s*(\d+)\b/);
  if (normalized.includes("damacana")) return `${amount} Lt Damacana`;
  return `${amount} Lt${pack ? ` x ${pack[1]}` : ""}`;
}

function titleCaseUnit(value: string): string {
  const normalized = value.toLocaleLowerCase("tr-TR");
  return normalized.charAt(0).toLocaleUpperCase("tr-TR") + normalized.slice(1);
}
