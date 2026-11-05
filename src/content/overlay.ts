import type { MatchDecision, PrmOrder, Vehicle } from "../shared/types";

interface OverlayItem {
  order: PrmOrder;
  decision: MatchDecision;
  vehicles: Vehicle[];
}

export class OrderOverlay {
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private readonly queue: OverlayItem[] = [];
  private busy = false;

  constructor(private readonly onAssign: (item: OverlayItem, vehicleId: string) => Promise<void>) {
    this.host = document.createElement("div");
    this.host.id = "prm-assistant-overlay";
    this.root = this.host.attachShadow({ mode: "closed" });
    document.documentElement.append(this.host);
  }

  enqueue(order: PrmOrder, decision: MatchDecision, vehicles: Vehicle[]): void {
    if (this.queue.some((item) => item.order.id === order.id)) return;
    this.queue.push({ order, decision, vehicles });
    this.render();
  }

  destroy(): void {
    this.host.remove();
  }

  private render(): void {
    const item = this.queue[0];
    if (!item) {
      this.root.innerHTML = "";
      return;
    }
    const suggested = item.vehicles.find((vehicle) => vehicle.id === item.decision.vehicleId);
    const activeVehicles = item.vehicles.filter((vehicle) => vehicle.active);
    const warning = item.decision.reason === "inactive"
      ? `${suggested?.shortName ?? "Normal araç"} çalışmıyor. Manuel seçim gerekli.`
      : item.decision.reason === "conflict"
        ? "Birden fazla araç kuralı eşleşti. Manuel seçim gerekli."
        : item.decision.reason === "unknown"
          ? "Araç eşleşmesi bulunamadı. Manuel seçim gerekli."
          : "";
    this.root.innerHTML = `
      <style>
        :host{all:initial} .card{position:fixed;z-index:2147483647;right:24px;bottom:24px;width:340px;box-sizing:border-box;background:#fff;color:#102a2a;border:1px solid #cbd5e1;border-radius:18px;box-shadow:0 22px 60px #0f172a38;padding:18px;font:14px/1.45 Inter,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;align-items:center}.title{font-size:13px;font-weight:800;letter-spacing:.08em;color:#0f766e}.count{font-size:12px;color:#64748b}.name{font-size:18px;font-weight:750;margin-top:14px}.address{color:#475569;margin-top:5px;max-height:70px;overflow:auto}.recommend{margin-top:14px;padding:11px 12px;background:#ecfdf5;border-radius:11px;font-weight:700}.warning{margin-top:12px;padding:10px;background:#fff7ed;color:#9a3412;border-radius:10px}.actions{display:grid;gap:8px;margin-top:14px}button{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;padding:10px 12px;border-radius:10px;font-weight:750;background:#0f766e;color:#fff}button.alt{background:#f1f5f9;color:#334155}button:disabled{opacity:.5;cursor:wait}.skip{margin-top:8px;color:#64748b;background:transparent;padding:6px}
      </style>
      <section class="card" role="dialog" aria-label="Yeni sipariş">
        <div class="top"><div class="title">🔔 YENİ SİPARİŞ</div><div class="count">1 / ${this.queue.length}</div></div>
        <div class="name">${escapeHtml(item.order.customerName ?? `Sipariş ${item.order.id}`)}</div>
        <div class="address">${escapeHtml(item.order.rawAddress)}</div>
        ${suggested ? `<div class="recommend">Önerilen: 🚚 ${escapeHtml(suggested.shortName)}</div>` : ""}
        ${warning ? `<div class="warning">⚠ ${escapeHtml(warning)}</div>` : ""}
        <div class="actions">
          ${activeVehicles.map((vehicle) => `<button class="${vehicle.id === suggested?.id ? "" : "alt"}" data-vehicle="${vehicle.id}" ${this.busy ? "disabled" : ""}>${escapeHtml(vehicle.shortName)}'YE ATA</button>`).join("")}
        </div>
        <button class="skip" data-skip ${this.busy ? "disabled" : ""}>Beklet / Kapat</button>
      </section>`;
    this.root.querySelectorAll<HTMLButtonElement>("[data-vehicle]").forEach((button) => {
      button.addEventListener("click", () => void this.assign(item, button.dataset.vehicle ?? ""));
    });
    this.root.querySelector<HTMLButtonElement>("[data-skip]")?.addEventListener("click", () => {
      this.queue.shift();
      this.render();
    });
  }

  private async assign(item: OverlayItem, vehicleId: string): Promise<void> {
    if (this.busy || !vehicleId) return;
    this.busy = true;
    this.render();
    await this.onAssign(item, vehicleId);
    this.busy = false;
    this.queue.shift();
    this.render();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
