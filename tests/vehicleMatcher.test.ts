import { describe, expect, it } from "vitest";
import { matchOrderVehicle, matchVehicle } from "../src/core/vehicleMatcher";
import { DEFAULT_VEHICLES } from "../src/storage/schema";
import type { LearnedAddress, PrmOrder, Vehicle } from "../src/shared/types";

const vehicles = (): Vehicle[] => DEFAULT_VEHICLES.map((vehicle) => ({ ...vehicle, keywords: [...vehicle.keywords] }));
const order = (createdAt: string | undefined, detectedAt = new Date(2026, 7, 27, 12).getTime()): PrmOrder => ({
  id: "order-1",
  rawAddress: "Bahçeköy Merkez Mahallesi",
  normalizedAddress: "bahcekoy merkez mahallesi",
  createdAt,
  detectedAt,
});

describe("vehicle matching", () => {
  it("matches Uskumruköy to vehicle 3", () => {
    expect(matchVehicle("Uskumruköy Mah.", vehicles(), []).vehicleId).toBe("vehicle3");
  });

  it("prefers learned address over keywords", () => {
    const learned: LearnedAddress[] = [{ id: "l1", normalizedAddress: "zekeriyakoy", rawExample: "Zekeriyaköy", vehicleId: "vehicle1", useCount: 1, createdAt: 1, updatedAt: 1, lastUsedAt: 1, source: "safe_approved" }];
    const decision = matchVehicle("Zekeriyaköy Kiptaş Konutları", vehicles(), learned);
    expect(decision.vehicleId).toBe("vehicle1");
    expect(decision.reason).toBe("learned");
  });

  it("blocks inactive vehicle", () => {
    const list = vehicles(); list[1].active = false;
    const decision = matchVehicle("Zekeriyaköy", list, []);
    expect(decision.reason).toBe("inactive");
    expect(decision.autoAssignmentAllowed).toBe(false);
  });

  it("requires manual selection for unknown address", () => {
    expect(matchVehicle("Bilinmeyen Bölge", vehicles(), []).status).toBe("manual_required");
  });

  it("requires manual selection for equal-strength conflict", () => {
    const list = vehicles(); list[0].keywords = ["Ortak Site"]; list[1].keywords = ["Ortak Site"];
    const decision = matchVehicle("Ortak Site A Blok", list, []);
    expect(decision.reason).toBe("conflict");
    expect(decision.autoAssignmentAllowed).toBe(false);
  });

  it("treats matches from two vehicles as conflict even when one keyword is longer", () => {
    const list = vehicles(); list[0].keywords = ["Ortak"]; list[1].keywords = ["Ortak Site"];
    expect(matchVehicle("Ortak Site A Blok", list, []).reason).toBe("conflict");
  });

  it.each([
    ["27.08.2026 00:00", "vehicle3"],
    ["27.08.2026 08:30", "vehicle3"],
    ["27.08.2026 08:31", "vehicle1"],
    ["27.08.2026 18:00", "vehicle1"],
    ["27.08.2026 18:01", "vehicle3"],
  ])("routes Bahçeköy order at %s to %s", (createdAt, expectedVehicleId) => {
    const decision = matchOrderVehicle(order(createdAt), vehicles(), []);
    expect(decision.vehicleId).toBe(expectedVehicleId);
    expect(decision.reason).toBe("time_rule");
  });

  it("uses detection time when the order creation time is missing", () => {
    const detectedAt = new Date(2026, 7, 27, 7, 45).getTime();
    expect(matchOrderVehicle(order(undefined, detectedAt), vehicles(), []).vehicleId).toBe("vehicle3");
  });

  it("applies the Bahçeköy time rule before a learned address", () => {
    const learned: LearnedAddress[] = [{ id: "l2", normalizedAddress: "bahcekoy merkez mahallesi", rawExample: "Bahçeköy Merkez Mahallesi", vehicleId: "vehicle3", useCount: 1, createdAt: 1, updatedAt: 1, lastUsedAt: 1, source: "safe_approved" }];
    expect(matchOrderVehicle(order("27.08.2026 12:00"), vehicles(), learned).vehicleId).toBe("vehicle1");
  });

  it("requires manual selection when the time-rule vehicle is inactive", () => {
    const list = vehicles();
    list[2].active = false;
    const decision = matchOrderVehicle(order("27.08.2026 07:00"), list, []);
    expect(decision.reason).toBe("inactive");
    expect(decision.autoAssignmentAllowed).toBe(false);
  });
});
