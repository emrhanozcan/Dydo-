import type { ProductPriceCandidate } from "./productPriceParser";
import type { ProductPrice } from "../shared/types";
import { appendLog, getState, updateState } from "../storage/storage";
import { PRODUCT_PRICE_LIST_URL } from "../storage/schema";

const SYNC_TAB_KEY = "prmProductPriceSyncTabId";
const RETRY_AFTER_MS = 30 * 60 * 1000;
export const PRODUCT_PRICE_TIMEOUT_ALARM = "prm-product-price-timeout";

export async function ensureDailyProductPriceSync(force = false): Promise<boolean> {
  const state = await getState();
  const now = Date.now();
  if (!force && state.productPriceSync.lastSuccessAt && dayKey(state.productPriceSync.lastSuccessAt) === dayKey(now)) return false;
  if (!force && state.productPriceSync.lastAttemptAt && now - state.productPriceSync.lastAttemptAt < RETRY_AFTER_MS) return false;

  await updateState((current) => {
    current.productPriceSync.status = "syncing";
    current.productPriceSync.lastAttemptAt = now;
    current.productPriceSync.lastError = undefined;
  });

  const tab = await chrome.tabs.create({ url: PRODUCT_PRICE_LIST_URL, active: false });
  if (tab.id === undefined) {
    await failProductPriceSync("Ürün fiyatları için PRM sekmesi açılamadı.");
    return false;
  }
  await chrome.storage.session.set({ [SYNC_TAB_KEY]: tab.id });
  armTimeout();
  return true;
}

export async function acceptProductPrices(
  candidates: ProductPriceCandidate[],
  pageCount: number,
  complete: boolean,
): Promise<void> {
  if (!complete) throw new Error("Fiyat listesinin tüm sayfaları okunamadı; mevcut fiyatlar korundu.");
  const valid = candidates.filter(isValidCandidate);
  if (valid.length === 0) throw new Error("Fiyat sayfasında geçerli ürün bulunamadı; mevcut fiyatlar korundu.");
  const current = await getState();
  const existingCount = Object.keys(current.productPrices).length;
  if (existingCount >= 10 && valid.length < Math.ceil(existingCount / 2)) {
    throw new Error(`Okunan ürün sayısı beklenenden düşük (${valid.length}/${existingCount}); mevcut fiyatlar korundu.`);
  }

  const now = Date.now();
  const snapshot: Record<string, ProductPrice> = Object.fromEntries(valid.map((candidate) => [candidate.id, {
    ...candidate,
    sourceUrl: PRODUCT_PRICE_LIST_URL,
    updatedAt: now,
  }]));
  await updateState((state) => {
    state.productPrices = snapshot;
    state.productPriceSync = {
      status: "success",
      sourceUrl: PRODUCT_PRICE_LIST_URL,
      lastAttemptAt: state.productPriceSync.lastAttemptAt ?? now,
      lastSuccessAt: now,
      lastProductCount: valid.length,
      lastPageCount: pageCount,
    };
  });
  await appendLog({ level: "INFO", code: "PRODUCT_PRICES_UPDATED", message: `${valid.length} ürünün fiyatı ${pageCount} sayfadan güncellendi.` });
  await closeAutomaticSyncTab();
}

export async function failProductPriceSync(error: string): Promise<void> {
  await updateState((state) => {
    state.productPriceSync.status = "error";
    state.productPriceSync.lastError = error;
  });
  await appendLog({ level: "ERROR", code: "PRODUCT_PRICE_SYNC_FAILED", message: error });
  await closeAutomaticSyncTab();
}

export async function isAutomaticSyncTab(tabId: number): Promise<boolean> {
  const stored = await chrome.storage.session.get(SYNC_TAB_KEY);
  return stored[SYNC_TAB_KEY] === tabId;
}

export function dayKey(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function armTimeout(): void {
  chrome.alarms.create(PRODUCT_PRICE_TIMEOUT_ALARM, { delayInMinutes: 2 });
}

async function closeAutomaticSyncTab(): Promise<void> {
  await chrome.alarms.clear(PRODUCT_PRICE_TIMEOUT_ALARM);
  const stored = await chrome.storage.session.get(SYNC_TAB_KEY);
  const tabId = stored[SYNC_TAB_KEY];
  await chrome.storage.session.remove(SYNC_TAB_KEY);
  if (typeof tabId !== "number") return;
  setTimeout(() => {
    void chrome.tabs.remove(tabId).catch(() => {
      // Sekme kullanıcı tarafından daha önce kapatılmış olabilir.
    });
  }, 400);
}

function isValidCandidate(candidate: ProductPriceCandidate): boolean {
  return typeof candidate.id === "string" && candidate.id.startsWith("prm_product_") &&
    typeof candidate.productName === "string" && Boolean(candidate.productName.trim()) &&
    Number.isSafeInteger(candidate.priceMinor) && candidate.priceMinor >= 0 &&
    typeof candidate.rawPrice === "string";
}
