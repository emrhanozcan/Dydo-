import { describe, expect, it } from "vitest";
import { applyConfirmedAssignment, learnAddress } from "../src/core/learningEngine";

describe("learning engine", () => {
  it("learns a confirmed address", () => {
    const learned = learnAddress([], "Güven Life Sitesi", "vehicle3", "safe_approved", 10);
    expect(learned[0]).toMatchObject({ normalizedAddress: "guven life sitesi", vehicleId: "vehicle3", useCount: 1 });
  });

  it("does not replace canonical mapping during inactive-vehicle temporary override", () => {
    const original = learnAddress([], "Kiptaş Konutları", "vehicle2", "safe_approved", 10);
    const result = applyConfirmedAssignment(original, "Kiptaş Konutları", "vehicle2", "vehicle1", true, "manual_selection");
    expect(result).toEqual(original);
    expect(result[0].vehicleId).toBe("vehicle2");
  });
});
