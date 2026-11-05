import { describe, expect, it } from "vitest";
import { migrateState } from "../src/storage/migrations";
import { createDefaultState } from "../src/storage/schema";

describe("storage migrations", () => {
  it("adds learned keyword collections to schema v1 vehicles", () => {
    const oldState = createDefaultState() as unknown as Record<string, unknown>;
    oldState.schemaVersion = 1;
    oldState.vehicles = (oldState.vehicles as { learnedKeywords?: string[] }[]).map(({ learnedKeywords: _removed, ...vehicle }) => vehicle);
    const migrated = migrateState(oldState);
    expect(migrated.schemaVersion).toBe(8);
    expect(migrated.reportOrders).toEqual({});
    expect(migrated.dismissedReportOrders).toEqual({});
    expect(migrated.expenseDocuments).toEqual([]);
    expect(migrated.returnPalletDocuments).toEqual([]);
    expect(migrated.productPrices).toEqual({});
    expect(migrated.productPriceSync.status).toBe("idle");
    expect(migrated.whatsappProducts).toHaveLength(3);
    expect(migrated.whatsappSettings.mode).toBe("safe");
    expect(migrated.vehicles.every((vehicle) => Array.isArray(vehicle.learnedKeywords))).toBe(true);
  });
});
