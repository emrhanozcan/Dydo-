import { normalizeAddress } from "./addressNormalizer";
import type { ExpenseDocument, PrmOrder, ReportOrderRecord, ReturnPalletDocument, Vehicle } from "../shared/types";
import { aggregateProductSales, type ProductSalesRow } from "./productParser";

export interface ReportPeriod {
  start: number;
  endExclusive: number;
}

export interface ReportBreakdownRow {
  key: string;
  orderCount: number;
  amountMinor: number;
}

export interface ReportSummary {
  orders: ReportOrderRecord[];
  orderCount: number;
  amountMinor: number;
  byVehicle: ReportBreakdownRow[];
  byChannel: ReportBreakdownRow[];
  byProduct: ProductSalesRow[];
}

export interface ReturnProductSummary {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  documentCount: number;
}

export interface ReturnPalletSummary {
  documents: ReturnPalletDocument[];
  amountMinor: number;
  byProduct: ReturnProductSummary[];
}

export function parsePrmAmountToMinor(value?: string): number | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value.replace(/[^\d,.-]/g, "");
  if (!/\d/.test(cleaned)) return undefined;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  const separator = Math.max(comma, dot);
  const decimalDigits = separator >= 0 ? cleaned.length - separator - 1 : 0;
  const hasDecimal = separator >= 0 && decimalDigits > 0 && decimalDigits <= 2;
  const integerPart = (hasDecimal ? cleaned.slice(0, separator) : cleaned).replace(/\D/g, "") || "0";
  const fractionPart = hasDecimal ? cleaned.slice(separator + 1).replace(/\D/g, "").padEnd(2, "0").slice(0, 2) : "00";
  const sign = cleaned.startsWith("-") ? -1 : 1;
  return sign * (Number.parseInt(integerPart, 10) * 100 + Number.parseInt(fractionPart, 10));
}

export function parsePrmDate(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const match = value.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const [, day, month, year, hour = "0", minute = "0"] = match;
    const timestamp = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveVehicleId(name: string | undefined, vehicles: Vehicle[]): string | undefined {
  const normalized = normalizeAddress(name ?? "");
  if (!normalized) return undefined;
  return vehicles.find((vehicle) =>
    normalized.includes(normalizeAddress(vehicle.prmName)) || normalized.includes(normalizeAddress(vehicle.shortName)),
  )?.id;
}

export function reportRecordFromOrder(
  order: PrmOrder,
  vehicles: Vehicle[],
  previous?: ReportOrderRecord,
  forcedVehicleId?: string,
  now = Date.now(),
): ReportOrderRecord {
  return {
    orderId: order.id,
    customerName: order.customerName ?? previous?.customerName,
    vehicleId: forcedVehicleId ?? resolveVehicleId(order.currentVehicle, vehicles) ?? previous?.vehicleId,
    channel: order.channel?.trim() || previous?.channel || "Bilinmiyor",
    amountMinor: parsePrmAmountToMinor(order.amount) ?? previous?.amountMinor ?? 0,
    rawAmount: order.amount ?? previous?.rawAmount,
    details: order.details ?? previous?.details,
    orderCreatedAt: parsePrmDate(order.createdAt, previous?.orderCreatedAt ?? order.detectedAt),
    capturedAt: previous?.capturedAt ?? now,
    updatedAt: now,
  };
}

export function mergeReportOrders(
  current: Record<string, ReportOrderRecord>,
  orders: PrmOrder[],
  vehicles: Vehicle[],
  now = Date.now(),
): Record<string, ReportOrderRecord> {
  const next = { ...current };
  for (const order of orders) next[order.id] = reportRecordFromOrder(order, vehicles, next[order.id], undefined, now);
  const cutoff = now - 2 * 365 * 24 * 60 * 60 * 1000;
  return Object.fromEntries(
    Object.entries(next)
      .filter(([, record]) => record.orderCreatedAt >= cutoff || record.updatedAt >= cutoff)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, 50_000),
  );
}

export function periodForDay(value: string): ReportPeriod {
  const startDate = parseInputDate(value);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);
  return { start: startDate.getTime(), endExclusive: endDate.getTime() };
}

export function periodForMonth(value: string): ReportPeriod {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  const startDate = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : new Date(Number.NaN);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);
  return { start: startDate.getTime(), endExclusive: endDate.getTime() };
}

export function periodForCustom(startValue: string, endValue: string): ReportPeriod {
  const startDate = parseInputDate(startValue);
  const endDate = parseInputDate(endValue);
  endDate.setDate(endDate.getDate() + 1);
  return { start: startDate.getTime(), endExclusive: endDate.getTime() };
}

export function aggregateReport(records: ReportOrderRecord[], period: ReportPeriod): ReportSummary {
  const orders = records
    .filter((record) => {
      const timestamp = reportingTimestamp(record.orderCreatedAt);
      return timestamp >= period.start && timestamp < period.endExclusive;
    })
    .sort((a, b) => b.orderCreatedAt - a.orderCreatedAt);
  return {
    orders,
    orderCount: orders.length,
    amountMinor: orders.reduce((total, order) => total + order.amountMinor, 0),
    byVehicle: breakdown(orders, (order) => order.vehicleId ?? "unassigned"),
    byChannel: breakdown(orders, (order) => order.channel || "Bilinmiyor"),
    byProduct: aggregateProductSales(orders),
  };
}

export function reportingTimestamp(orderCreatedAt: number): number {
  const date = new Date(orderCreatedAt);
  const afterDailyCutoff = date.getHours() > 18 || (date.getHours() === 18 && date.getMinutes() > 30);
  if (afterDailyCutoff) date.setDate(date.getDate() + 1);
  return date.getTime();
}

export function aggregateExpenses(documents: ExpenseDocument[], period: ReportPeriod): { documents: ExpenseDocument[]; amountMinor: number } {
  const filtered = documents
    .filter((document) => document.documentDate >= period.start && document.documentDate < period.endExclusive)
    .sort((a, b) => b.documentDate - a.documentDate);
  return { documents: filtered, amountMinor: filtered.reduce((total, document) => total + document.amountMinor, 0) };
}

export function aggregateReturnPallets(documents: ReturnPalletDocument[], period: ReportPeriod): ReturnPalletSummary {
  const filtered = documents
    .filter((document) => document.documentDate >= period.start && document.documentDate < period.endExclusive)
    .sort((a, b) => b.documentDate - a.documentDate);
  const products = new Map<string, ReturnProductSummary>();
  for (const document of filtered) {
    const seenInDocument = new Set<string>();
    for (const item of document.items) {
      const key = `${normalizeAddress(item.name)}|${normalizeAddress(item.unit)}`;
      const row = products.get(key) ?? { key, name: item.name, quantity: 0, unit: item.unit, documentCount: 0 };
      row.quantity += item.quantity;
      if (!seenInDocument.has(key)) row.documentCount += 1;
      seenInDocument.add(key);
      products.set(key, row);
    }
  }
  return {
    documents: filtered,
    amountMinor: filtered.reduce((total, document) => total + document.amountMinor, 0),
    byProduct: [...products.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "tr-TR")),
  };
}

function breakdown(orders: ReportOrderRecord[], keyFor: (order: ReportOrderRecord) => string): ReportBreakdownRow[] {
  const rows = new Map<string, ReportBreakdownRow>();
  for (const order of orders) {
    const key = keyFor(order);
    const row = rows.get(key) ?? { key, orderCount: 0, amountMinor: 0 };
    row.orderCount += 1;
    row.amountMinor += order.amountMinor;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.amountMinor - a.amountMinor || b.orderCount - a.orderCount);
}

function parseInputDate(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(Number.NaN);
}
