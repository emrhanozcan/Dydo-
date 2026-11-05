import type { ExtensionState, MatchDecision, PrmOrder } from "../shared/types";
import { matchOrderVehicle } from "./vehicleMatcher";
import { evaluateAssignment } from "./safetyEngine";

export interface OrderPlan {
  order: PrmOrder;
  decision: MatchDecision;
  action: "assign" | "ask_user";
  reason: string;
}

export function planOrder(order: PrmOrder, state: ExtensionState, domCompatible = true): OrderPlan {
  const decision = matchOrderVehicle(order, state.vehicles, state.learnedAddresses, state.customerPreferences);
  const safety = evaluateAssignment(state.settings.assignmentMode, decision, domCompatible);
  return { order, decision, ...safety };
}
