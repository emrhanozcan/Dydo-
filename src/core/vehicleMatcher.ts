import type { LearnedAddress, MatchDecision, PrmOrder, Vehicle } from "../shared/types";
import { normalizeAddress } from "./addressNormalizer";

const BAHCEKOY_KEYWORD = "bahcekoy";
const MORNING_CUTOFF_MINUTES = 8 * 60 + 30;
const EVENING_CUTOFF_MINUTES = 18 * 60;

export function matchOrderVehicle(
  order: PrmOrder,
  vehicles: Vehicle[],
  learnedAddresses: LearnedAddress[],
): MatchDecision {
  const normalizedAddress = normalizeAddress(order.rawAddress);
  if (containsWholeKeyword(normalizedAddress, BAHCEKOY_KEYWORD)) {
    const minutes = orderMinuteOfDay(order);
    const vehicleId = minutes <= MORNING_CUTOFF_MINUTES || minutes > EVENING_CUTOFF_MINUTES
      ? "vehicle3"
      : "vehicle1";
    return decisionForVehicle(vehicleId, vehicles, "time_rule", "Bahçeköy saat kuralı");
  }

  return matchVehicle(order.rawAddress, vehicles, learnedAddresses);
}

export function matchVehicle(
  rawAddress: string,
  vehicles: Vehicle[],
  learnedAddresses: LearnedAddress[],
): MatchDecision {
  const normalizedAddress = normalizeAddress(rawAddress);
  const learned = learnedAddresses
    .filter((entry) => normalizedAddress === entry.normalizedAddress || normalizedAddress.includes(entry.normalizedAddress))
    .sort((a, b) => b.normalizedAddress.length - a.normalizedAddress.length)[0];

  if (learned) {
    return decisionForVehicle(learned.vehicleId, vehicles, "learned", learned.normalizedAddress);
  }

  const learnedKeywordMatches = collectKeywordMatches(normalizedAddress, vehicles, "learnedKeywords");
  if (learnedKeywordMatches.length > 0) {
    const vehicleIds = [...new Set(learnedKeywordMatches.map((match) => match.vehicle.id))];
    if (vehicleIds.length > 1) return conflictDecision(vehicleIds);
    const strongest = learnedKeywordMatches.sort((a, b) => b.normalized.length - a.normalized.length)[0];
    return decisionForVehicle(vehicleIds[0], vehicles, "learned_keyword", strongest.keyword);
  }

  const matches = collectKeywordMatches(normalizedAddress, vehicles, "keywords");
  if (matches.length === 0) {
    return { status: "manual_required", reason: "unknown", autoAssignmentAllowed: false };
  }

  const vehicleIds = [...new Set(matches.map((match) => match.vehicle.id))];
  if (vehicleIds.length > 1) {
    return conflictDecision(vehicleIds);
  }
  const strongest = matches.filter((match) => match.vehicle.id === vehicleIds[0]).sort((a, b) => b.normalized.length - a.normalized.length)[0];
  return decisionForVehicle(vehicleIds[0], vehicles, "keyword", strongest.keyword);
}

function decisionForVehicle(
  vehicleId: string,
  vehicles: Vehicle[],
  reason: "learned" | "learned_keyword" | "keyword" | "time_rule",
  matchedValue: string,
): MatchDecision {
  const vehicle = vehicles.find((candidate) => candidate.id === vehicleId);
  if (!vehicle) return { status: "manual_required", reason: "unknown", autoAssignmentAllowed: false };
  if (!vehicle.active) {
    return {
      status: "manual_required",
      vehicleId,
      canonicalVehicleId: vehicleId,
      reason: "inactive",
      matchedValue,
      autoAssignmentAllowed: false,
    };
  }
  return {
    status: "matched",
    vehicleId,
    canonicalVehicleId: vehicleId,
    reason,
    matchedValue,
    autoAssignmentAllowed: true,
  };
}

function orderMinuteOfDay(order: PrmOrder): number {
  const time = order.createdAt?.match(/(?:^|\s)(\d{1,2}):([0-5]\d)(?::[0-5]\d)?(?:\s|$)/);
  if (time) {
    const hour = Number.parseInt(time[1], 10);
    const minute = Number.parseInt(time[2], 10);
    if (hour >= 0 && hour <= 23) return hour * 60 + minute;
  }

  const detectedAt = new Date(order.detectedAt);
  return detectedAt.getHours() * 60 + detectedAt.getMinutes();
}

function containsWholeKeyword(normalizedAddress: string, keyword: string): boolean {
  return ` ${normalizedAddress} `.includes(` ${keyword} `);
}

function collectKeywordMatches(
  normalizedAddress: string,
  vehicles: Vehicle[],
  key: "keywords" | "learnedKeywords",
): { vehicle: Vehicle; keyword: string; normalized: string }[] {
  const paddedAddress = ` ${normalizedAddress} `;
  return vehicles.flatMap((vehicle) =>
    vehicle[key]
      .map((keyword) => ({ vehicle, keyword, normalized: normalizeAddress(keyword) }))
      .filter(({ normalized }) => normalized.length > 0 && paddedAddress.includes(` ${normalized} `)),
  );
}

function conflictDecision(vehicleIds: string[]): MatchDecision {
  return { status: "manual_required", reason: "conflict", conflictVehicleIds: vehicleIds, autoAssignmentAllowed: false };
}
