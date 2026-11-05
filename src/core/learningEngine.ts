import { createId } from "../shared/id";
import type { LearnedAddress } from "../shared/types";
import { normalizeAddress } from "./addressNormalizer";

export function learnAddress(
  learned: LearnedAddress[],
  rawAddress: string,
  vehicleId: string,
  source: LearnedAddress["source"],
  now = Date.now(),
): LearnedAddress[] {
  const normalizedAddress = normalizeAddress(rawAddress);
  if (!normalizedAddress) return learned;
  const existing = learned.find((entry) => entry.normalizedAddress === normalizedAddress);
  if (existing) {
    return learned.map((entry) =>
      entry.id === existing.id
        ? { ...entry, vehicleId, rawExample: rawAddress, source, useCount: entry.useCount + 1, updatedAt: now, lastUsedAt: now }
        : entry,
    );
  }
  return [
    ...learned,
    {
      id: createId("learned"),
      normalizedAddress,
      rawExample: rawAddress,
      vehicleId,
      useCount: 1,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      source,
    },
  ];
}

export function applyConfirmedAssignment(
  learned: LearnedAddress[],
  rawAddress: string,
  canonicalVehicleId: string | undefined,
  assignedVehicleId: string,
  canonicalVehicleInactive: boolean,
  source: LearnedAddress["source"],
): LearnedAddress[] {
  if (canonicalVehicleInactive && canonicalVehicleId && canonicalVehicleId !== assignedVehicleId) return learned;
  return learnAddress(learned, rawAddress, assignedVehicleId, source);
}
