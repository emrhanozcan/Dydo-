import { describe, expect, it } from "vitest";
import { aggregateProductSales, parseProductLines } from "../src/core/productParser";
import type { ReportOrderRecord } from "../src/shared/types";

describe("product line reports", () => {
  it("extracts canonical bottle and demijohn products with quantities", () => {
    expect(parseProductLines("SAKA 19 LT DAMACANA SU 2 Adet, 0,5 LT X 12 SAKA PET SU 1 Koli")).toEqual([
      { key: "19 lt damacana|adet", name: "19 Lt Damacana", quantity: 2, unit: "Adet" },
      { key: "0 5 lt x 12|koli", name: "0,5 Lt x 12", quantity: 1, unit: "Koli" },
    ]);
  });

  it("counts products and keeps allocated revenue equal to order revenue", () => {
    const order: ReportOrderRecord = {
      orderId: "1", channel: "Mobil", amountMinor: 60000, details: "SAKA 19 LT DAMACANA SU 2 Adet, 0,5 LT SU 1 Koli",
      orderCreatedAt: 1, capturedAt: 1, updatedAt: 1,
    };
    const rows = aggregateProductSales([order]);
    expect(rows.reduce((total, row) => total + row.amountMinor, 0)).toBe(60000);
    expect(rows.find((row) => row.name === "19 Lt Damacana")?.quantity).toBe(2);
  });
});
