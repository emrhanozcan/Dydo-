export interface WhatsAppMessage {
  groupName: string;
  sender?: string;
  timestamp?: string;
  messageKey?: string;
  text: string;
  detectedAt: number;
  outgoing?: boolean;
  /** The message already existed in the chat when the observer connected. */
  historical?: boolean;
}

export interface WhatsAppParseResult {
  status: "order" | "not_order";
  order?: import("../shared/types").ParsedWhatsAppOrder;
}
