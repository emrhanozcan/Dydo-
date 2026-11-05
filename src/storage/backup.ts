import type { ExtensionState, Settings, Vehicle, LearnedAddress, WhatsAppProduct, WhatsAppSettings } from "../shared/types";
import { CURRENT_SCHEMA_VERSION } from "./schema";
import { normalizeAddress } from "../core/addressNormalizer";

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: number;
  settings: Settings;
  vehicles: Vehicle[];
  learnedAddresses: LearnedAddress[];
  whatsappSettings?: WhatsAppSettings;
  whatsappProducts?: WhatsAppProduct[];
}

export function createBackup(state: ExtensionState): BackupPayload {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    settings: state.settings,
    vehicles: state.vehicles,
    learnedAddresses: state.learnedAddresses,
    whatsappSettings: state.whatsappSettings,
    whatsappProducts: state.whatsappProducts,
  };
}

export function parseBackup(raw: string): BackupPayload {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object") throw new Error("Geçersiz yedek dosyası.");
  const candidate = data as Partial<BackupPayload>;
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, CURRENT_SCHEMA_VERSION].includes(candidate.schemaVersion ?? -1)) throw new Error("Desteklenmeyen şema sürümü.");
  if (!candidate.settings || !Array.isArray(candidate.vehicles) || !Array.isArray(candidate.learnedAddresses)) {
    throw new Error("Yedek gerekli alanları içermiyor.");
  }
  const vehicles = candidate.vehicles.map((vehicle) => ({
    ...vehicle,
    learnedKeywords: Array.isArray(vehicle.learnedKeywords) ? vehicle.learnedKeywords : [],
  }));
  const settings = candidate.settings as Partial<Settings>;
  const booleanKeys: (keyof Settings)[] = ["enabled", "automaticLogin", "desktopNotifications", "alarmSound", "addressSpeech", "learnAddresses", "learnNativeAssignments", "debugMode"];
  if (booleanKeys.some((key) => typeof settings[key] !== "boolean")) throw new Error("Yedekte geçersiz boolean ayarı var.");
  if (settings.assignmentMode !== "safe" && settings.assignmentMode !== "automatic") throw new Error("Yedekte geçersiz atama modu var.");
  if (typeof settings.volume !== "number" || settings.volume < 0 || settings.volume > 1) throw new Error("Yedekte geçersiz ses seviyesi var.");
  if (typeof settings.maximumHistory !== "number" || !Number.isInteger(settings.maximumHistory) || settings.maximumHistory < 50 || settings.maximumHistory > 5000) throw new Error("Yedekte geçersiz geçmiş limiti var.");
  const vehicleIds = new Set<string>();
  const keywordOwners = new Map<string, string>();
  for (const vehicle of vehicles) {
    if (typeof vehicle.id !== "string" || !vehicle.id || typeof vehicle.shortName !== "string" || !vehicle.shortName || typeof vehicle.prmName !== "string" || !vehicle.prmName || typeof vehicle.active !== "boolean" || !Array.isArray(vehicle.keywords) || vehicle.keywords.some((keyword) => typeof keyword !== "string" || !normalizeAddress(keyword)) || !Array.isArray(vehicle.learnedKeywords) || vehicle.learnedKeywords.some((keyword) => typeof keyword !== "string" || !normalizeAddress(keyword))) {
      throw new Error("Yedekte geçersiz araç kaydı var.");
    }
    if (vehicleIds.has(vehicle.id)) throw new Error("Yedekte yinelenen araç kimliği var.");
    vehicleIds.add(vehicle.id);
    for (const keyword of [...vehicle.keywords, ...vehicle.learnedKeywords]) {
      const normalized = normalizeAddress(keyword);
      const owner = keywordOwners.get(normalized);
      if (owner && owner !== vehicle.id) throw new Error("Yedekte birden fazla araca atanmış keyword var.");
      keywordOwners.set(normalized, vehicle.id);
    }
  }
  for (const entry of candidate.learnedAddresses) {
    if (
      typeof entry.id !== "string" || !entry.id ||
      typeof entry.normalizedAddress !== "string" || !entry.normalizedAddress ||
      typeof entry.rawExample !== "string" ||
      typeof entry.vehicleId !== "string" || !vehicleIds.has(entry.vehicleId) ||
      typeof entry.useCount !== "number" || entry.useCount < 0 ||
      !["safe_approved", "automatic", "manual_selection"].includes(entry.source)
    ) throw new Error("Yedekte geçersiz öğrenilmiş adres kaydı var.");
  }
  return { ...candidate, schemaVersion: CURRENT_SCHEMA_VERSION, vehicles } as BackupPayload;
}
