import { MESSAGE, sendMessage } from "../shared/messages";
import type { ExtensionState, ParsedWhatsAppOrder } from "../shared/types";

export class WhatsAppOrderOverlay {
  private host?: HTMLElement;
  private shadow?: ShadowRoot;

  render(state: ExtensionState): void {
    const order = state.pendingWhatsAppOrders[0];
    if (!order) { this.destroy(); return; }
    this.ensureHost();
    if (!this.shadow) return;
    this.shadow.innerHTML = `${styles}<article><header><b>WHATSAPP SİPARİŞİ</b><span>${escapeHtml(order.confidence.toUpperCase())}</span></header><h2>${escapeHtml(order.rawAddress || "Adres bulunamadı")}</h2>${order.items.map(itemHtml).join("")}<div class="total">Toplam <b>${money(order.totalAmount)}</b></div>${order.warnings.map((warning) => `<p class="warning">${escapeHtml(warning)}</p>`).join("")}<footer><button data-action="approve">RAPORA EKLE</button><button data-action="edit">DÜZENLE</button><button data-action="ignore">SİPARİŞ DEĞİL</button></footer></article>`;
    this.shadow.querySelector('[data-action="approve"]')?.addEventListener("click", () => void this.review(order, "approve"));
    this.shadow.querySelector('[data-action="ignore"]')?.addEventListener("click", () => void this.review(order, "ignore"));
    this.shadow.querySelector('[data-action="edit"]')?.addEventListener("click", () => window.open(chrome.runtime.getURL("options.html#whatsapp"), "_blank"));
  }

  destroy(): void { this.host?.remove(); this.host = undefined; this.shadow = undefined; }

  private ensureHost(): void {
    if (this.host?.isConnected) return;
    this.host = document.createElement("div");
    this.host.id = "prm-whatsapp-order-overlay";
    document.documentElement.appendChild(this.host);
    this.shadow = this.host.attachShadow({ mode: "open" });
  }

  private async review(order: ParsedWhatsAppOrder, action: "approve" | "ignore"): Promise<void> {
    await sendMessage({ type: MESSAGE.REVIEW_WHATSAPP_ORDER, fingerprint: order.messageId, action });
  }
}

function itemHtml(item: ParsedWhatsAppOrder["items"][number]): string {
  return `<div class="item"><span><b>${item.quantity} ${escapeHtml(item.unitType)}</b> ${escapeHtml(item.productName)}</span><b>${item.unitPrice ? money(item.totalPrice) : "Fiyat eksik"}</b></div>`;
}
function money(value: number): string { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100); }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!); }

const styles = `<style>:host{all:initial}article{position:fixed;right:22px;bottom:22px;z-index:2147483647;width:min(390px,calc(100vw - 44px));box-sizing:border-box;padding:18px;border:1px solid #b8d7d2;border-radius:16px;background:#fff;color:#173434;box-shadow:0 18px 60px #0005;font:13px/1.45 system-ui,sans-serif}header{display:flex;justify-content:space-between;color:#0f766e;font-size:11px;letter-spacing:.06em}h2{margin:10px 0 14px;font-size:18px}.item{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #edf2f1}.total{display:flex;justify-content:space-between;margin-top:13px;font-size:16px}.warning{padding:8px;border-radius:8px;background:#fff7ed;color:#9a3412}footer{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}button{border:0;border-radius:8px;padding:9px 10px;background:#e2e8f0;color:#334155;font-weight:800;cursor:pointer}button:first-child{background:#0f766e;color:#fff}button:last-child{background:#fee2e2;color:#991b1b}</style>`;
