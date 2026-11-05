import { describe, expect, it } from "vitest";
import { addKeyword } from "../src/core/keywordRules";
import { DEFAULT_VEHICLES } from "../src/storage/schema";

describe("keyword rules", () => {
  it("rejects duplicate keyword owned by another vehicle", () => {
    expect(() => addKeyword(DEFAULT_VEHICLES, "vehicle1", "KİPTAŞ KONUTLARI")).toThrow(/ARAÇ 2/);
  });
});
