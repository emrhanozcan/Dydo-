export type AssignmentMode = "safe" | "automatic";
export type HealthStatus = "connected" | "login_page" | "tab_not_found" | "dom_incompatible";
export type HistoryMode = AssignmentMode | "manual_override";
export type HistoryResult = "success" | "failed" | "pending" | "skipped";

export interface PrmOrder {
  id: string;
  secondaryId?: string;
  channel?: string;
  customerName?: string;
  phone?: string;
  rawAddress: string;
  normalizedAddress: string;
  details?: string;
  notes?: string;
  status?: string;
  currentVehicle?: string;
  amount?: string;
  paymentType?: string;
  createdAt?: string;
  appointmentDelivery?: string;
  minutesPassed?: number;
  detectedAt: number;
}

export interface Vehicle {
  id: string;
  shortName: string;
  prmName: string;
  active: boolean;
  keywords: string[];
  learnedKeywords: string[];
}

export interface LearnedAddress {
  id: string;
  normalizedAddress: string;
  rawExample: string;
  vehicleId: string;
  useCount: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  source: "safe_approved" | "automatic" | "manual_selection";
}

export interface Settings {
  enabled: boolean;
  automaticLogin: boolean;
  desktopNotifications: boolean;
  alarmSound: boolean;
  addressSpeech: boolean;
  volume: number;
  assignmentMode: AssignmentMode;
  learnAddresses: boolean;
  learnNativeAssignments: boolean;
  maximumHistory: number;
  debugMode: boolean;
}

export interface OrderHistoryEntry {
  id: string;
  orderId: string;
  address: string;
  suggestedVehicleId?: string;
  assignedVehicleId?: string;
  mode: HistoryMode;
  result: HistoryResult;
  reason?: string;
  createdAt: number;
}

export interface LogEntry {
  id: string;
  level: "INFO" | "WARNING" | "ERROR";
  code: string;
  message: string;
  orderId?: string;
  createdAt: number;
}

export interface RuntimeStatus {
  health: HealthStatus;
  lastCheckAt?: number;
  lastOrderId?: string;
  tabId?: number;
  diagnostics?: Record<string, boolean>;
}

export interface PendingAssignment {
  orderId: string;
  vehicleId: string;
  startedAt: number;
  order: PrmOrder;
  mode: HistoryMode;
  learn: boolean;
}

export interface ReportOrderRecord {
  orderId: string;
  customerName?: string;
  vehicleId?: string;
  channel: string;
  amountMinor: number;
  rawAmount?: string;
  details?: string;
  items?: ReportOrderItem[];
  orderCreatedAt: number;
  capturedAt: number;
  updatedAt: number;
}

export interface ExpenseDocument {
  id: string;
  fileName: string;
  vendor: string;
  documentDate: number;
  amountMinor: number;
  addedAt: number;
  extractionStatus: "automatic" | "needs_review" | "manual";
}

export interface ReturnPalletItem {
  name: string;
  quantity: number;
  unit: string;
}

export interface ReturnPalletDocument {
  id: string;
  fileName: string;
  description: string;
  documentDate: number;
  amountMinor: number;
  items: ReturnPalletItem[];
  addedAt: number;
  extractionStatus: "automatic" | "needs_review" | "manual";
}

export interface ProductPrice {
  id: string;
  productCode?: string;
  productName: string;
  unit?: string;
  priceMinor: number;
  rawPrice: string;
  sourceUrl: string;
  updatedAt: number;
}

export interface ProductPriceSyncState {
  status: "idle" | "syncing" | "success" | "error";
  sourceUrl: string;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  lastProductCount: number;
  lastPageCount?: number;
}

export type WhatsAppUnit = "adet" | "koli" | "paket";
export type WhatsAppMode = "safe" | "auto";

export interface WhatsAppSettings {
  enabled: boolean;
  targetGroupName: string;
  mode: WhatsAppMode;
  defaultProductId: string;
  bareNumberAsDefaultProduct: boolean;
  notificationEnabled: boolean;
  voiceEnabled: boolean;
  defaultQuantityWords: string[];
}

export interface WhatsAppProduct {
  id: string;
  name: string;
  unit: WhatsAppUnit;
  aliases: string[];
  isDefault: boolean;
  active: boolean;
  priceProductId?: string;
}

export interface ParsedWhatsAppOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitType: WhatsAppUnit;
  unitPrice: number;
  totalPrice: number;
  matchedText: string;
}

export interface ParsedWhatsAppOrder {
  messageId: string;
  groupName: string;
  sender?: string;
  rawMessage: string;
  rawAddress: string;
  normalizedAddress: string;
  items: ParsedWhatsAppOrderItem[];
  totalQuantity: number;
  totalAmount: number;
  detectedAt: number;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  suggestedVehicleId?: string;
}

export interface ProcessedWhatsAppMessage {
  fingerprint: string;
  rawMessage: string;
  groupName: string;
  sender?: string;
  timestamp?: string;
  status: "imported" | "ignored" | "pending" | "failed";
  createdAt: number;
}

export interface WhatsAppRuntimeStatus {
  tabFound: boolean;
  pageDetected: boolean;
  activeGroupName?: string;
  targetGroupActive: boolean;
  messageContainerFound: boolean;
  latestMessageFound: boolean;
  messageTextFound: boolean;
  senderFound: boolean;
  timestampFound: boolean;
  lastCheckAt: number;
}

export interface ReportOrderItem {
  productId?: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPriceMinor?: number;
  totalMinor?: number;
}

export interface CloudAccount {
  email: string;
  isLoggedIn: boolean;
  syncStatus: "idle" | "syncing" | "connected" | "error";
  lastSyncAt?: number;
  lastError?: string;
  autoSync: boolean;
  syncedOrdersCount: number;
}

export interface ExtensionState {
  schemaVersion: number;
  settings: Settings;
  vehicles: Vehicle[];
  learnedAddresses: LearnedAddress[];
  seenOrders: Record<string, number>;
  orderHistory: OrderHistoryEntry[];
  logs: LogEntry[];
  pendingAssignments: PendingAssignment[];
  reportOrders: Record<string, ReportOrderRecord>;
  dismissedReportOrders: Record<string, number>;
  expenseDocuments: ExpenseDocument[];
  returnPalletDocuments: ReturnPalletDocument[];
  productPrices: Record<string, ProductPrice>;
  productPriceSync: ProductPriceSyncState;
  whatsappSettings: WhatsAppSettings;
  whatsappProducts: WhatsAppProduct[];
  processedWhatsAppMessages: ProcessedWhatsAppMessage[];
  pendingWhatsAppOrders: ParsedWhatsAppOrder[];
  whatsappRuntime: WhatsAppRuntimeStatus;
  cloudAccount: CloudAccount;
  runtime: RuntimeStatus;
  customerPreferences: Record<string, CustomerDeliveryPreference>;
  historyLearner: HistoryLearnerStatus;
}

export type MatchReason = "customer_history" | "learned" | "learned_keyword" | "keyword" | "time_rule" | "unknown" | "conflict" | "inactive";

export interface CustomerDeliveryPreference {
  key: string;
  customerName: string;
  phone: string;
  rawAddress: string;
  normalizedAddress: string;
  counts: Record<string, number>;
  topVehicleId: string;
  topVehicleName: string;
  topCount: number;
  totalDeliveries: number;
  lastDeliveryAt: number;
}

export interface HistoryLearnerStatus {
  isRunning: boolean;
  currentPage: number;
  totalOrdersScraped: number;
  totalCustomersLearned: number;
  lastRunAt: number;
  statusMessage?: string;
  error?: string;
}

export interface MatchDecision {
  status: "matched" | "manual_required";
  vehicleId?: string;
  canonicalVehicleId?: string;
  reason: MatchReason;
  matchedValue?: string;
  conflictVehicleIds?: string[];
  autoAssignmentAllowed: boolean;
}
