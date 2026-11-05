import type { Vehicle } from "../shared/types";
import { normalizeAddress } from "./addressNormalizer";
import { findKeywordOwner } from "./keywordRules";

const SITE_SUFFIXES = new Set(["site", "sitesi", "konutlari", "evleri", "apartmani", "apartmanlari", "rezidans", "residence", "plaza"]);
const ROAD_SUFFIXES = new Set(["sokak", "sokagi", "sk", "cadde", "caddesi", "cad", "cd", "bulvar", "bulvari", "blv"]);
const STOP_WORDS = new Set([
  "mah", "mahalle", "mahallesi", "mevkii", "koy", "koyu", "sariyer", "istanbul", "turkiye",
  "no", "numara", "blok", "bina", "kat", "daire", "not", "floor", "flat", "apt",
]);

export interface LearnedKeywordResult {
  vehicles: Vehicle[];
  added: string[];
  conflicts: { keyword: string; ownerVehicleId: string }[];
}

export function extractSpecificAddressRules(rawAddress: string): string[] {
  const tokens = rawAddress
    .replace(/[(),;\/\\|]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[-–—]+|[-–—:]+$/g, ""))
    .filter(Boolean);
  const results: string[] = [];

  tokens.forEach((token, index) => {
    const suffix = normalizeAddress(token);
    const isSite = SITE_SUFFIXES.has(suffix);
    const isRoad = ROAD_SUFFIXES.has(suffix);
    if (!isSite && !isRoad) return;
    const prefix: string[] = [];
    const limit = isSite ? 3 : 2;
    for (let cursor = index - 1; cursor >= 0 && prefix.length < limit; cursor -= 1) {
      const normalized = normalizeAddress(tokens[cursor]);
      if (!normalized || STOP_WORDS.has(normalized) || SITE_SUFFIXES.has(normalized) || ROAD_SUFFIXES.has(normalized) || /\d/.test(normalized)) break;
      prefix.unshift(tokens[cursor]);
    }
    if (prefix.length === 0) return;
    const phrase = [...prefix, token].join(" ").replace(/[.:]+$/g, "").trim();
    if (normalizeAddress(phrase).split(" ").length >= 2) results.push(phrase);
  });

  return [...new Map(results.map((rule) => [normalizeAddress(rule), rule])).values()];
}

export function addLearnedAddressRules(vehicles: Vehicle[], vehicleId: string, rawAddress: string): LearnedKeywordResult {
  let next = vehicles;
  const added: string[] = [];
  const conflicts: LearnedKeywordResult["conflicts"] = [];
  for (const keyword of extractSpecificAddressRules(rawAddress)) {
    const owner = findKeywordOwner(next, keyword, vehicleId);
    if (owner) {
      conflicts.push({ keyword, ownerVehicleId: owner.id });
      continue;
    }
    next = next.map((vehicle) => {
      if (vehicle.id !== vehicleId) return vehicle;
      const exists = [...vehicle.keywords, ...vehicle.learnedKeywords]
        .some((candidate) => normalizeAddress(candidate) === normalizeAddress(keyword));
      if (exists) return vehicle;
      added.push(keyword);
      return { ...vehicle, learnedKeywords: [...vehicle.learnedKeywords, keyword] };
    });
  }
  return { vehicles: next, added, conflicts };
}
