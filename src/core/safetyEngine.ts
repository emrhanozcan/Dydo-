import type { AssignmentMode, MatchDecision } from "../shared/types";

export interface SafetyResult {
  action: "assign" | "ask_user";
  reason: string;
}

export function evaluateAssignment(mode: AssignmentMode, decision: MatchDecision, domCompatible = true): SafetyResult {
  if (!domCompatible) return { action: "ask_user", reason: "dom_incompatible" };
  if (!decision.autoAssignmentAllowed || !decision.vehicleId) return { action: "ask_user", reason: decision.reason };
  if (mode === "safe") return { action: "ask_user", reason: "safe_mode_approval" };
  return { action: "assign", reason: "automatic_mode" };
}
