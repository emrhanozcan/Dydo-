import { describe, expect, it } from "vitest";
import { evaluateAssignment } from "../src/core/safetyEngine";

describe("safety engine", () => {
  const matched = { status: "matched", reason: "keyword", vehicleId: "vehicle2", autoAssignmentAllowed: true } as const;
  it("asks approval in safe mode", () => expect(evaluateAssignment("safe", matched).action).toBe("ask_user"));
  it("assigns a certain match in automatic mode", () => expect(evaluateAssignment("automatic", matched).action).toBe("assign"));
  it("fails safe on incompatible DOM", () => expect(evaluateAssignment("automatic", matched, false).action).toBe("ask_user"));
});
