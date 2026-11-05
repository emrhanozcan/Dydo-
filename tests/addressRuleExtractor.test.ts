import { describe, expect, it } from "vitest";
import { addLearnedAddressRules, extractSpecificAddressRules } from "../src/core/addressRuleExtractor";
import { matchVehicle } from "../src/core/vehicleMatcher";
import { DEFAULT_VEHICLES } from "../src/storage/schema";

const vehicles = () => DEFAULT_VEHICLES.map((vehicle) => ({ ...vehicle, keywords: [...vehicle.keywords], learnedKeywords: [...vehicle.learnedKeywords] }));

describe("specific street/site learning", () => {
  it("extracts site and street signatures without apartment details", () => {
    expect(extractSpecificAddressRules("Uskumruköy Mah. Nurhak Sokak Dekar Sitesi No:11 Daire:4"))
      .toEqual(["Nurhak Sokak", "Dekar Sitesi"]);
  });

  it("adds learned rules to the manually assigned vehicle", () => {
    const result = addLearnedAddressRules(vehicles(), "vehicle1", "Uskumruköy Mah. Manolya Sitesi B Blok Daire 4");
    expect(result.added).toEqual(["Manolya Sitesi"]);
    expect(result.vehicles[0].learnedKeywords).toContain("Manolya Sitesi");
  });

  it("specific learned site overrides the general neighborhood rule", () => {
    const result = addLearnedAddressRules(vehicles(), "vehicle1", "Uskumruköy Mah. Manolya Sitesi");
    const decision = matchVehicle("Uskumruköy Mahallesi Manolya Sitesi A Blok", result.vehicles, []);
    expect(decision).toMatchObject({ vehicleId: "vehicle1", reason: "learned_keyword" });
  });
});
