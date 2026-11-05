import type { AssignmentMode, ExtensionState, MatchDecision, PrmOrder, RuntimeStatus } from "./types";
import type { ProductPriceCandidate } from "../productPrices/productPriceParser";
import type { ParsedWhatsAppOrder, WhatsAppRuntimeStatus } from "./types";
import type { WhatsAppMessage } from "../whatsapp/whatsappTypes";

export const MESSAGE = {
  PAGE_STATUS: "PAGE_STATUS",
  NEW_ORDER: "NEW_ORDER",
  ASSIGN_ORDER: "ASSIGN_ORDER",
  ASSIGNMENT_RESULT: "ASSIGNMENT_RESULT",
  STATE_CHANGED: "STATE_CHANGED",
  GET_STATE: "GET_STATE",
  TEST_VOICE: "TEST_VOICE",
  FOCUS_PRM: "FOCUS_PRM",
  PLAY_ALARM: "PLAY_ALARM",
  SYNC_PRODUCT_PRICES: "SYNC_PRODUCT_PRICES",
  SCRAPE_PRODUCT_PRICES: "SCRAPE_PRODUCT_PRICES",
  PRODUCT_PRICES_SCRAPED: "PRODUCT_PRICES_SCRAPED",
  PRODUCT_PRICE_SYNC_FAILED: "PRODUCT_PRICE_SYNC_FAILED",
  WHATSAPP_STATUS: "WHATSAPP_STATUS",
  WHATSAPP_MESSAGE: "WHATSAPP_MESSAGE",
  REVIEW_WHATSAPP_ORDER: "REVIEW_WHATSAPP_ORDER",
  PING_WHATSAPP: "PING_WHATSAPP",
  RECONNECT_WHATSAPP: "RECONNECT_WHATSAPP",
} as const;

export type ExtensionMessage =
  | { type: typeof MESSAGE.PAGE_STATUS; status: RuntimeStatus }
  | { type: typeof MESSAGE.NEW_ORDER; order: PrmOrder; decision: MatchDecision }
  | { type: typeof MESSAGE.ASSIGN_ORDER; order: PrmOrder; vehicleId: string; mode: AssignmentMode | "manual_override"; learn: boolean }
  | { type: typeof MESSAGE.ASSIGNMENT_RESULT; order: PrmOrder; vehicleId: string; success: boolean; reason?: string; mode: AssignmentMode | "manual_override"; learn: boolean }
  | { type: typeof MESSAGE.STATE_CHANGED }
  | { type: typeof MESSAGE.GET_STATE }
  | { type: typeof MESSAGE.TEST_VOICE }
  | { type: typeof MESSAGE.FOCUS_PRM }
  | { type: typeof MESSAGE.PLAY_ALARM; volume: number }
  | { type: typeof MESSAGE.SYNC_PRODUCT_PRICES; force?: boolean }
  | { type: typeof MESSAGE.SCRAPE_PRODUCT_PRICES }
  | { type: typeof MESSAGE.PRODUCT_PRICES_SCRAPED; products: ProductPriceCandidate[]; pageCount: number; complete: boolean }
  | { type: typeof MESSAGE.PRODUCT_PRICE_SYNC_FAILED; error: string }
  | { type: typeof MESSAGE.WHATSAPP_STATUS; status: WhatsAppRuntimeStatus }
  | { type: typeof MESSAGE.WHATSAPP_MESSAGE; message: WhatsAppMessage }
  | { type: typeof MESSAGE.REVIEW_WHATSAPP_ORDER; fingerprint: string; action: "approve" | "ignore"; editedOrder?: ParsedWhatsAppOrder }
  | { type: typeof MESSAGE.PING_WHATSAPP }
  | { type: typeof MESSAGE.RECONNECT_WHATSAPP };

export interface MessageResponse {
  ok: boolean;
  state?: ExtensionState;
  error?: string;
}

export function sendMessage(message: ExtensionMessage): Promise<MessageResponse> {
  return chrome.runtime.sendMessage(message) as Promise<MessageResponse>;
}
