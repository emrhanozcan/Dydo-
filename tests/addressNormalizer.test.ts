import { describe, expect, it } from "vitest";
import { normalizeAddress } from "../src/core/addressNormalizer";

describe("address normalization", () => {
  it("normalizes Turkish characters, punctuation and whitespace", () => {
    expect(normalizeAddress("  ZEKERİYAKÖY MAH.   KİPTAŞ KONUTLARI ")).toBe("zekeriyakoy mah kiptas konutlari");
    expect(normalizeAddress("ZEKERİYAKÖY")).toBe(normalizeAddress("zekeriyakoy"));
  });
});
