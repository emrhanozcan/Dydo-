export const WHATSAPP_SELECTORS = {
  activeChatHeaders: ["#main header", '[role="main"] header', "main header", "header"],
  activeChatTitles: ['[data-testid="conversation-info-header-chat-title"]', '[title][dir="auto"]', '[title][role="button"]', "h1", "h2"],
  messageContainers: ['#main [role="application"]', '#main [aria-label*="mesaj" i]', '#main [aria-label*="message" i]', "#main", '[role="main"]', 'main [role="application"]', "main"],
  messages: ['[data-id][role="row"]', '[data-testid="msg-container"]', '.message-in[data-id]', '.message-out[data-id]', '[data-id]'],
  messageTexts: ['[data-testid="msg-text"]', '[data-pre-plain-text] .selectable-text', 'span.selectable-text.copyable-text', 'span.selectable-text', '.copyable-text [dir="ltr"]', '.copyable-text [dir="auto"]'],
  metadata: ['[data-pre-plain-text]'],
} as const;
