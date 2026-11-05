import type { Vehicle } from "../shared/types";
import { normalizeAddress } from "./addressNormalizer";

export function findKeywordOwner(vehicles: Vehicle[], keyword: string, exceptVehicleId?: string): Vehicle | undefined {
  const normalized = normalizeAddress(keyword);
  return vehicles.find(
    (vehicle) =>
      vehicle.id !== exceptVehicleId &&
      (vehicle.keywords.some((candidate) => normalizeAddress(candidate) === normalized) ||
        vehicle.learnedKeywords.some((candidate) => normalizeAddress(candidate) === normalized)),
  );
}

export function addKeyword(vehicles: Vehicle[], vehicleId: string, keyword: string): Vehicle[] {
  if (!normalizeAddress(keyword)) throw new Error("Anahtar kelime boş olamaz.");
  const owner = findKeywordOwner(vehicles, keyword, vehicleId);
  if (owner) throw new Error(`Bu anahtar kelime ${owner.shortName} için zaten kullanılmaktadır.`);
  return vehicles.map((vehicle) => {
    if (vehicle.id !== vehicleId) return vehicle;
    if ([...vehicle.keywords, ...vehicle.learnedKeywords].some((candidate) => normalizeAddress(candidate) === normalizeAddress(keyword))) return vehicle;
    return { ...vehicle, keywords: [...vehicle.keywords, keyword.trim()] };
  });
}
