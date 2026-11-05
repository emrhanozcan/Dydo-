import type { PrmOrder } from "../shared/types";
import { parseOrders } from "./orderParser";

export class OrderObserver {
  private observer: MutationObserver | null = null;
  private healthTimer: number | null = null;
  private scheduled = false;

  constructor(
    private readonly table: HTMLElement,
    private readonly onOrders: (orders: PrmOrder[]) => Promise<void>,
  ) {}

  start(): void {
    this.observer = new MutationObserver(() => this.scheduleRead());
    const target = (this.table as HTMLTableElement).tBodies?.[0] ?? this.table;
    this.observer.observe(target, { childList: true, subtree: true, characterData: true });
    this.healthTimer = window.setInterval(() => this.scheduleRead(), 60_000);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.healthTimer !== null) window.clearInterval(this.healthTimer);
  }

  private scheduleRead(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    window.setTimeout(() => {
      this.scheduled = false;
      void this.onOrders(parseOrders(this.table));
    }, 250);
  }
}
