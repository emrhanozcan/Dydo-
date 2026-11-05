import type { ExtensionState, Settings, Vehicle } from "../shared/types";

export const CURRENT_SCHEMA_VERSION = 8;

export const PRODUCT_PRICE_LIST_URL = "https://dydoprm.visionplus.com.tr/main/product-management/product-price-list";

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  automaticLogin: true,
  desktopNotifications: true,
  alarmSound: true,
  addressSpeech: true,
  volume: 0.8,
  assignmentMode: "safe",
  learnAddresses: true,
  learnNativeAssignments: true,
  maximumHistory: 500,
  debugMode: false,
};

export const DEFAULT_VEHICLES: Vehicle[] = [
  {
    id: "vehicle1",
    shortName: "ARAÇ 1",
    prmName: "İSTANBUL-ZEKERİYAKÖY ARAÇ 1",
    active: true,
    keywords: ["Bahçeköy", "Bahçeköy Merkez", "Beyazgül Konakları"],
    learnedKeywords: [],
  },
  {
    id: "vehicle2",
    shortName: "ARAÇ 2",
    prmName: "İSTANBUL-ZEKERİYAKÖY ARAÇ 2",
    active: true,
    keywords: ["Zekeriyaköy", "Kiptaş Konutları", "Demirciköy"],
    learnedKeywords: [],
  },
  {
    id: "vehicle3",
    shortName: "ARAÇ 3",
    prmName: "İSTANBUL-ZEKERİYAKÖY ARAÇ 3",
    active: true,
    keywords: ["Uskumruköy", "Arıköy", "Güven Life Sitesi", "Zargana Sokak"],
    learnedKeywords: [],
  },
];

export const DEFAULT_WHATSAPP_PRODUCTS = [
  { id: "wa-product-19lt", name: "19 LT Damacana", unit: "adet", aliases: ["pc", "damacana", "dam", "19 lt", "19lt"], isDefault: true, active: true },
  { id: "wa-product-05lt", name: "0.5 LT", unit: "koli", aliases: ["koli 05", "koli 0.5", "koli 0,5"], isDefault: false, active: true },
  { id: "wa-product-15lt", name: "1.5 LT", unit: "paket", aliases: ["paket 1.5", "paket 1,5"], isDefault: false, active: true },
] satisfies import("../shared/types").WhatsAppProduct[];

export function createDefaultState(): ExtensionState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    vehicles: DEFAULT_VEHICLES.map((vehicle) => ({ ...vehicle, keywords: [...vehicle.keywords], learnedKeywords: [...vehicle.learnedKeywords] })),
    learnedAddresses: [],
    seenOrders: {},
    orderHistory: [],
    logs: [],
    pendingAssignments: [],
    reportOrders: {},
    dismissedReportOrders: {},
    expenseDocuments: [],
    returnPalletDocuments: [],
    productPrices: {},
    productPriceSync: {
      status: "idle",
      sourceUrl: PRODUCT_PRICE_LIST_URL,
      lastProductCount: 0,
    },
    whatsappSettings: {
      enabled: true,
      targetGroupName: "Saka",
      mode: "safe",
      defaultProductId: "wa-product-19lt",
      bareNumberAsDefaultProduct: false,
      notificationEnabled: true,
      voiceEnabled: true,
      defaultQuantityWords: ["tane", "adet"],
    },
    whatsappProducts: DEFAULT_WHATSAPP_PRODUCTS.map((product) => ({ ...product, aliases: [...product.aliases] })),
    processedWhatsAppMessages: [],
    pendingWhatsAppOrders: [],
    whatsappRuntime: { tabFound: false, pageDetected: false, targetGroupActive: false, messageContainerFound: false, latestMessageFound: false, messageTextFound: false, senderFound: false, timestampFound: false, lastCheckAt: 0 },
    cloudAccount: {
      email: (typeof import.meta !== "undefined" && import.meta.env?.VITE_CLOUD_EMAIL) || "",
      isLoggedIn: false,
      syncStatus: "idle",
      autoSync: true,
      syncedOrdersCount: 0,
    },
    runtime: { health: "tab_not_found" },
  };
}
