import type { ExtensionState } from "../shared/types";
import { createDefaultState, CURRENT_SCHEMA_VERSION } from "./schema";

export function migrateState(input: unknown): ExtensionState {
  const defaults = createDefaultState();
  if (!input || typeof input !== "object") return defaults;
  const candidate = input as Partial<ExtensionState>;
  return {
    ...defaults,
    ...candidate,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: { ...defaults.settings, ...(candidate.settings ?? {}) },
    vehicles: Array.isArray(candidate.vehicles)
      ? candidate.vehicles.map((vehicle) => {
          const defVeh = defaults.vehicles.find((d) => d.id === vehicle.id);
          const combinedLearned = Array.from(new Set([
            ...(Array.isArray(vehicle.learnedKeywords) ? vehicle.learnedKeywords : []),
            ...(defVeh?.learnedKeywords || []),
          ]));
          const combinedKeywords = Array.from(new Set([
            ...(Array.isArray(vehicle.keywords) ? vehicle.keywords : []),
            ...(defVeh?.keywords || []),
          ]));
          return {
            ...vehicle,
            keywords: combinedKeywords,
            learnedKeywords: combinedLearned,
          };
        })
      : defaults.vehicles,
    learnedAddresses: Array.isArray(candidate.learnedAddresses) && candidate.learnedAddresses.length > 0
      ? candidate.learnedAddresses
      : defaults.learnedAddresses,
    seenOrders: candidate.seenOrders && typeof candidate.seenOrders === "object" ? candidate.seenOrders : {},
    orderHistory: Array.isArray(candidate.orderHistory) ? candidate.orderHistory : [],
    logs: Array.isArray(candidate.logs) ? candidate.logs : [],
    pendingAssignments: Array.isArray(candidate.pendingAssignments) ? candidate.pendingAssignments : [],
    reportOrders: candidate.reportOrders && typeof candidate.reportOrders === "object" ? candidate.reportOrders : {},
    dismissedReportOrders: candidate.dismissedReportOrders && typeof candidate.dismissedReportOrders === "object" ? candidate.dismissedReportOrders : {},
    expenseDocuments: Array.isArray(candidate.expenseDocuments) ? candidate.expenseDocuments : [],
    returnPalletDocuments: Array.isArray(candidate.returnPalletDocuments) ? candidate.returnPalletDocuments : [],
    productPrices: candidate.productPrices && typeof candidate.productPrices === "object" ? candidate.productPrices : {},
    productPriceSync: { ...defaults.productPriceSync, ...(candidate.productPriceSync ?? {}) },
    whatsappSettings: { ...defaults.whatsappSettings, ...(candidate.whatsappSettings ?? {}) },
    whatsappProducts: Array.isArray(candidate.whatsappProducts) ? candidate.whatsappProducts : defaults.whatsappProducts,
    processedWhatsAppMessages: Array.isArray(candidate.processedWhatsAppMessages) ? candidate.processedWhatsAppMessages.slice(0, 2000) : [],
    pendingWhatsAppOrders: Array.isArray(candidate.pendingWhatsAppOrders) ? candidate.pendingWhatsAppOrders : [],
    whatsappRuntime: { ...defaults.whatsappRuntime, ...(candidate.whatsappRuntime ?? {}) },
    cloudAccount: { ...defaults.cloudAccount, ...(candidate.cloudAccount ?? {}) },
    runtime: { ...defaults.runtime, ...(candidate.runtime ?? {}) },
  };
}
