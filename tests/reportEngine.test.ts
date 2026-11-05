import { describe, expect, it } from "vitest";
import {
  aggregateReport,
  aggregateReturnPallets,
  mergeReportOrders,
  parsePrmAmountToMinor,
  parsePrmDate,
  periodForCustom,
  periodForDay,
  periodForMonth,
  reportingTimestamp,
} from "../src/core/reportEngine";
import { DEFAULT_VEHICLES } from "../src/storage/schema";
import type { PrmOrder } from "../src/shared/types";

function order(id: string, overrides: Partial<PrmOrder> = {}): PrmOrder {
  return {
    id,
    rawAddress: "Uskumruköy",
    normalizedAddress: "uskumrukoy",
    detectedAt: new Date(2026, 7, 26, 12, 0).getTime(),
    ...overrides,
  };
}

describe("report engine", () => {
  it("parses Turkish money without floating point loss", () => {
    expect(parsePrmAmountToMinor("₺1.234,56")).toBe(123456);
    expect(parsePrmAmountToMinor("400,00")).toBe(40000);
    expect(parsePrmAmountToMinor("515")).toBe(51500);
  });

  it("parses PRM Turkish date and period bounds", () => {
    const parsed = new Date(parsePrmDate("26.08.2026 12:46", 0));
    expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), parsed.getHours(), parsed.getMinutes()]).toEqual([2026, 7, 26, 12, 46]);
    expect(periodForDay("2026-08-26").endExclusive - periodForDay("2026-08-26").start).toBe(86_400_000);
    expect(periodForMonth("2026-08").start).toBe(new Date(2026, 7, 1).getTime());
    expect(periodForCustom("2026-08-20", "2026-08-26").endExclusive).toBe(new Date(2026, 7, 27).getTime());
  });

  it("deduplicates order IDs and aggregates by vehicle and source", () => {
    let records = mergeReportOrders({}, [
      order("1001", { channel: "Mobil", amount: "400,00", currentVehicle: "İSTANBUL-ZEKERİYAKÖY ARAÇ 1", createdAt: "26.08.2026 10:00" }),
      order("1002", { channel: "Getir", amount: "515,00", currentVehicle: "İSTANBUL-ZEKERİYAKÖY ARAÇ 3", createdAt: "26.08.2026 11:00" }),
    ], DEFAULT_VEHICLES, new Date(2026, 7, 26, 12).getTime());
    records = mergeReportOrders(records, [
      order("1001", { channel: "Mobil", amount: "450,00", currentVehicle: "İSTANBUL-ZEKERİYAKÖY ARAÇ 1", createdAt: "26.08.2026 10:00" }),
    ], DEFAULT_VEHICLES, new Date(2026, 7, 26, 13).getTime());
    const report = aggregateReport(Object.values(records), periodForDay("2026-08-26"));
    expect(report.orderCount).toBe(2);
    expect(report.amountMinor).toBe(96500);
    expect(report.byVehicle).toEqual(expect.arrayContaining([
      { key: "vehicle1", orderCount: 1, amountMinor: 45000 },
      { key: "vehicle3", orderCount: 1, amountMinor: 51500 },
    ]));
    expect(report.byChannel.find((row) => row.key === "Getir")?.orderCount).toBe(1);
  });

  it("uses exact WhatsApp item totals in product and source reports", () => {
    const timestamp = new Date(2026, 7, 26, 12).getTime();
    const report = aggregateReport([{
      orderId: "wa_1", channel: "WhatsApp", amountMinor: 58_000, orderCreatedAt: timestamp, capturedAt: timestamp, updatedAt: timestamp,
      items: [
        { productName: "19 LT Damacana", quantity: 2, unit: "Adet", totalMinor: 43_800 },
        { productName: "0.5 LT", quantity: 1, unit: "Koli", totalMinor: 14_200 },
      ],
    }], periodForDay("2026-08-26"));
    expect(report.orderCount).toBe(1);
    expect(report.byChannel).toEqual([{ key: "WhatsApp", orderCount: 1, amountMinor: 58_000 }]);
    expect(report.byProduct.map((item) => [item.name, item.quantity, item.amountMinor])).toEqual([
      ["19 LT Damacana", 2, 43_800], ["0.5 LT", 1, 14_200],
    ]);
  });

  it("reports orders after 18:30 on the following day", () => {
    const records = [
      { orderId: "1830", channel: "Mobil", amountMinor: 10000, orderCreatedAt: new Date(2026, 7, 27, 18, 30).getTime(), capturedAt: 1, updatedAt: 1 },
      { orderId: "1831", channel: "Mobil", amountMinor: 20000, orderCreatedAt: new Date(2026, 7, 27, 18, 31).getTime(), capturedAt: 1, updatedAt: 1 },
      { orderId: "late-month", channel: "Mobil", amountMinor: 30000, orderCreatedAt: new Date(2026, 7, 31, 23, 0).getTime(), capturedAt: 1, updatedAt: 1 },
    ];
    expect(aggregateReport(records, periodForDay("2026-08-27")).orders.map((record) => record.orderId)).toEqual(["1830"]);
    expect(aggregateReport(records, periodForDay("2026-08-28")).orders.map((record) => record.orderId)).toEqual(["1831"]);
    expect(aggregateReport(records, periodForMonth("2026-08")).orders.map((record) => record.orderId)).toEqual(["1831", "1830"]);
    expect(aggregateReport(records, periodForMonth("2026-09")).orders.map((record) => record.orderId)).toEqual(["late-month"]);
    expect(new Date(reportingTimestamp(records[1].orderCreatedAt)).getDate()).toBe(28);
  });
});

describe("return pallet reports", () => {
  it("adds return income and aggregates returned products for the selected period", () => {
    const period = periodForDay("2026-08-27");
    const summary = aggregateReturnPallets([
      {
        id: "return-1", fileName: "iade-1.pdf", description: "Firma", documentDate: new Date(2026, 7, 27, 12).getTime(), amountMinor: 150000,
        items: [{ name: "Boş Damacana", quantity: 10, unit: "Adet" }], addedAt: 1, extractionStatus: "automatic",
      },
      {
        id: "return-2", fileName: "iade-2.pdf", description: "Firma", documentDate: new Date(2026, 7, 27, 14).getTime(), amountMinor: 50000,
        items: [{ name: "Boş Damacana", quantity: 5, unit: "Adet" }, { name: "Plastik Palet", quantity: 2, unit: "Palet" }], addedAt: 1, extractionStatus: "automatic",
      },
      {
        id: "return-old", fileName: "eski.pdf", description: "Firma", documentDate: new Date(2026, 7, 26, 12).getTime(), amountMinor: 99900,
        items: [{ name: "Boş Damacana", quantity: 99, unit: "Adet" }], addedAt: 1, extractionStatus: "automatic",
      },
    ], period);
    expect(summary.amountMinor).toBe(200000);
    expect(summary.documents).toHaveLength(2);
    expect(summary.byProduct).toEqual([
      { key: "bos damacana|adet", name: "Boş Damacana", quantity: 15, unit: "Adet", documentCount: 2 },
      { key: "plastik palet|palet", name: "Plastik Palet", quantity: 2, unit: "Palet", documentCount: 1 },
    ]);
  });
});
