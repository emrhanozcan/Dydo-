import { normalizeAddress } from "../core/addressNormalizer";
import { buildColumnMap, findLiveOrderTable, getOrderRows, parseOrders } from "../content/orderParser";
import { visibleText } from "../prm/domUtils";
import { SELECTORS } from "../prm/selectors";
import type { OrderColumn } from "../prm/constants";
import type { CustomerDeliveryPreference, ExtensionState, LearnedAddress, Vehicle } from "../shared/types";
import { getState, updateState } from "../storage/storage";

export const ORDER_LIST_URL = "https://dydoprm.visionplus.com.tr/main/order-management/order-list";

export interface ScrapedHistoryRow {
  orderNumber: string;
  customerName: string;
  phone: string;
  rawAddress: string;
  status: string;
  vehicleName: string;
  vehicleId?: string;
}

let isScrapingActive = false;
let overlayElement: HTMLDivElement | null = null;

export function isOrderListPage(): boolean {
  return location.pathname.includes("/main/order-management/order-list");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// 1. "Temizle" ve "Ara" Butonlarını Bulan Fonksiyon
// =============================================================================
export function findFilterButtons(): { clearBtn: HTMLElement | null; searchBtn: HTMLElement | null } {
  let clearBtn: HTMLElement | null = null;
  let searchBtn: HTMLElement | null = null;

  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>("button, a.btn, input[type='button'], input[type='submit'], div[role='button'], a")
  );

  for (const btn of buttons) {
    if (btn.closest("#prm-history-learning-overlay") || btn.closest("#prm-history-learner-banner")) continue;
    const text = normalizeAddress(btn.innerText || btn.getAttribute("value") || btn.getAttribute("title") || "");
    if (!clearBtn && (text.includes("temizle") || text.includes("sifirla") || text.includes("reset"))) {
      clearBtn = btn;
    }
    if (!searchBtn && (text === "ara" || text === "search" || text.includes("ara"))) {
      if (!text.includes("temizle") && !text.includes("iptal") && !text.includes("arac")) {
        searchBtn = btn;
      }
    }
  }

  // Fallback: Kırmızı buton veya arama ikonu olan buton
  if (!searchBtn) {
    for (const btn of buttons) {
      if (btn.closest("#prm-history-learning-overlay") || btn.closest("#prm-history-learner-banner")) continue;
      if (
        btn.classList.contains("btn-danger") ||
        btn.classList.contains("p-button-danger") ||
        btn.querySelector(".fa-search, .pi-search, i.search, [class*='search']")
      ) {
        const text = normalizeAddress(btn.innerText || "");
        if (!text.includes("temizle") && !text.includes("iptal")) {
          searchBtn = btn;
          break;
        }
      }
    }
  }

  return { clearBtn, searchBtn };
}

// Filtre alanlarındaki tüm kutuları boşaltma
export function clearAllFilterInputs(): void {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"));
  for (const el of inputs) {
    if (el.closest("table") || el.closest("#prm-history-learning-overlay") || el.closest("#prm-history-learner-banner")) continue;
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox" || el.type === "radio") {
        el.checked = false;
      } else {
        el.value = "";
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el instanceof HTMLSelectElement) {
      el.selectedIndex = 0;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

// =============================================================================
// 2. Tabloyu Bekleme ve Tespit Etme
// =============================================================================
export async function waitForOrderTable(timeoutMs = 10000): Promise<HTMLElement | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // 1. Kanıtlanmış findLiveOrderTable fonksiyonu
    const table = findLiveOrderTable();
    if (table) {
      const rows = getOrderRows(table);
      if (rows.length > 0) return table;
    }

    // 2. SELECTORS.tables listesindeki tüm tabloları tara
    for (const sel of SELECTORS.tables) {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(sel));
      for (const cand of candidates) {
        if (cand.closest("#prm-history-learning-overlay") || cand.closest("#prm-history-learner-banner")) continue;
        const rows = getOrderRows(cand);
        if (rows.length > 0) {
          const map = buildColumnMap(cand);
          if (map.address !== undefined || map.orderNumber !== undefined || map.customerName !== undefined) {
            return cand;
          }
        }
      }
    }

    await delay(500);
  }
  return null;
}

// =============================================================================
// 3. Teslimatçı İsmini Araç ID'sine Eşleştirme (Araç 1, 2, 3)
// =============================================================================
export function matchDeliveryVehicleId(vehicleText: string, vehicles: Vehicle[]): string | undefined {
  if (!vehicleText) return undefined;
  const norm = normalizeAddress(vehicleText);

  // 1. Doğrudan "arac 1", "arac 2", "arac 3" kontrolleri
  if (norm.includes("arac 1") || norm.includes("araç 1") || norm.includes("kurye 1")) return "vehicle1";
  if (norm.includes("arac 2") || norm.includes("araç 2") || norm.includes("kurye 2")) return "vehicle2";
  if (norm.includes("arac 3") || norm.includes("araç 3") || norm.includes("kurye 3")) return "vehicle3";

  // 2. Tanımlı araç listesindeki isimlerle kontrol
  for (const v of vehicles) {
    const vShort = normalizeAddress(v.shortName);
    const vPrm = normalizeAddress(v.prmName);
    if (vShort && norm.includes(vShort)) return v.id;
    if (vPrm && norm.includes(vPrm)) return v.id;
  }

  // 3. Rakam kontrolü (metin içinde tek başına 1, 2, 3 geçiyorsa)
  if (/\b1\b/.test(norm)) return "vehicle1";
  if (/\b2\b/.test(norm)) return "vehicle2";
  if (/\b3\b/.test(norm)) return "vehicle3";

  return undefined;
}

// =============================================================================
// 4. Tablodaki Sipariş Satırlarını Ayıklama (Çift Katmanlı Sağlam Tarayıcı)
// =============================================================================
export function extractOrdersFromTable(table: HTMLElement, vehicles: Vehicle[]): ScrapedHistoryRow[] {
  // YÖNTEM A: orderParser'ın kanıtlanmış parseOrders motoru
  try {
    const prmOrders = parseOrders(table);
    if (prmOrders.length > 0) {
      const results: ScrapedHistoryRow[] = [];
      for (const po of prmOrders) {
        const vehicleId = matchDeliveryVehicleId(po.currentVehicle ?? "", vehicles);
        results.push({
          orderNumber: po.id,
          customerName: po.customerName || "Bilinmeyen Müşteri",
          phone: po.phone || "",
          rawAddress: po.rawAddress,
          status: po.status || "",
          vehicleName: po.currentVehicle || "",
          vehicleId,
        });
      }
      if (results.length > 0) {
        return results;
      }
    }
  } catch (e) {
    console.warn("[PRM HistoryLearner] parseOrders denemesi başarısız, manuel taramaya geçiliyor:", e);
  }

  // YÖNTEM B: Üniversal Manuel Grid Tarayıcı
  return scanTableManually(table, vehicles);
}

function scanTableManually(table: HTMLElement, vehicles: Vehicle[]): ScrapedHistoryRow[] {
  const map = buildColumnMap(table);
  const rows = getOrderRows(table);
  const results: ScrapedHistoryRow[] = [];

  for (const row of rows) {
    const cellNodes = [
      ...row.querySelectorAll<HTMLElement>(
        ":scope > td, :scope > th, :scope > [role=gridcell], :scope > [role=cell], mat-cell, .mat-cell, .mat-mdc-cell"
      ),
    ];
    const cells = cellNodes.length > 0 ? cellNodes : ([...row.children] as HTMLElement[]);
    if (cells.length < 3) continue;

    const getText = (col: OrderColumn): string => {
      const idx = map[col];
      if (idx !== undefined && cells[idx]) {
        return visibleText(cells[idx]).trim();
      }
      return "";
    };

    let orderNum = getText("orderNumber");
    let custName = getText("customerName");
    let phone = getText("phone");
    let address = getText("address");
    let status = getText("status");
    let vehicleText = getText("deliveryPerson");

    // Sütun haritası eksikse ekran görüntüsündeki sabit pozisyonları dene
    // 0: Sipariş No, 2: Müşteri Adı, 3: Telefon No, 7: Müşteri Adresi, 8: Sipariş Durumu, 11: Teslimatçı
    if (!orderNum && cells[0]) orderNum = visibleText(cells[0]).split("\n")[0].trim();
    if (!custName && cells[2]) custName = visibleText(cells[2]).trim();
    if (!phone && cells[3]) phone = visibleText(cells[3]).trim();
    if (!address && cells[7]) address = visibleText(cells[7]).trim();
    if (!status && cells[8]) status = visibleText(cells[8]).trim();
    if (!vehicleText && cells[11]) vehicleText = visibleText(cells[11]).trim();

    // Adres hala boşsa sokak, mahalle, cadde içeren hücreyi bul
    if (!address) {
      for (const cell of cells) {
        const t = visibleText(cell);
        const norm = normalizeAddress(t);
        if (
          norm.includes("mah") ||
          norm.includes("sk") ||
          norm.includes("cd") ||
          norm.includes("sokak") ||
          norm.includes("cadde") ||
          norm.includes("apt") ||
          norm.includes("sitesi") ||
          norm.includes("kat:") ||
          norm.includes("daire:") ||
          norm.includes("sariyer") ||
          norm.includes("istanbul")
        ) {
          address = t.trim();
          break;
        }
      }
    }

    // Teslimatçı hala boşsa ARAÇ içeren hücreyi bul
    if (!vehicleText) {
      for (const cell of cells) {
        const t = visibleText(cell);
        const norm = normalizeAddress(t);
        if (norm.includes("arac") || norm.includes("araç") || norm.includes("zekeriyakoy")) {
          vehicleText = t.trim();
          break;
        }
      }
    }

    if (!address) continue;

    const vehicleId = matchDeliveryVehicleId(vehicleText, vehicles);

    results.push({
      orderNumber: orderNum || `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerName: custName || "Müşteri",
      phone: phone.replace(/\D/g, ""),
      rawAddress: address,
      status,
      vehicleName: vehicleText,
      vehicleId,
    });
  }

  return results;
}

// =============================================================================
// 5. Sonraki Sayfa Butonunu Bulma
// =============================================================================
export function findNextPageButton(): HTMLElement | null {
  const selectors = [
    "button.p-paginator-next:not([disabled]):not(.p-disabled)",
    "li.p-paginator-next:not(.p-disabled) a",
    "li.next:not(.disabled) a",
    "a.page-link[aria-label*='Next' i]",
    "a.page-link[aria-label*='Sonraki' i]",
    "button[aria-label*='Next' i]:not([disabled])",
    "button[aria-label*='Sonraki' i]:not([disabled])",
    "button[title*='Next' i]:not([disabled])",
    "button[title*='Sonraki' i]:not([disabled])",
    ".mat-mdc-paginator-navigation-next:not([disabled])",
    "button.mat-paginator-navigation-next:not([disabled])",
    ".p-paginator-next:not([disabled])",
  ];

  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && isElementVisible(el)) return el;
  }

  const paginationElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".pagination a, .pagination button, .p-paginator a, .p-paginator button, ul[class*='page'] li a, .mat-paginator button"
    )
  );

  for (const el of paginationElements) {
    const txt = (el.innerText || el.getAttribute("aria-label") || "").trim();
    if (txt === ">" || txt === "»" || txt === "›" || txt.toLowerCase().includes("sonraki")) {
      const isParentDisabled =
        el.closest(".disabled") !== null ||
        el.hasAttribute("disabled") ||
        el.classList.contains("disabled") ||
        el.classList.contains("p-disabled");
      if (!isParentDisabled && isElementVisible(el)) return el;
    }
  }

  // Aktif sayfa numarasından bir sonrakini bulma (1 aktifse 2'ye tıkla)
  const activePageEl = document.querySelector<HTMLElement>(".pagination .active, .p-highlight, li.active, button.active");
  if (activePageEl) {
    const currentPageNum = parseInt(activePageEl.innerText.trim(), 10);
    if (!isNaN(currentPageNum) && currentPageNum > 0) {
      const nextPageNum = currentPageNum + 1;
      const nextNumEl = Array.from(
        document.querySelectorAll<HTMLElement>(".pagination a, .pagination button, .p-paginator-page, ul[class*='page'] li a, button")
      ).find((el) => el.innerText.trim() === String(nextPageNum) && isElementVisible(el));
      if (nextNumEl) return nextNumEl;
    }
  }

  return null;
}

function isElementVisible(el: HTMLElement): boolean {
  return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

// =============================================================================
// 6. Sayfa Geçişini Bekleme
// =============================================================================
async function waitForPageChange(oldFirstOrderId: string | undefined, timeoutMs = 4000): Promise<void> {
  if (!oldFirstOrderId) {
    await delay(2000);
    return;
  }
  const start = Date.now();
  await delay(800);
  while (Date.now() - start < timeoutMs) {
    const table = findLiveOrderTable();
    if (table) {
      const rows = getOrderRows(table);
      if (rows.length > 0) {
        const firstRowText = visibleText(rows[0]);
        if (!firstRowText.includes(oldFirstOrderId)) {
          // Sayfa içeriği başarıyla yenilendi
          await delay(400);
          return;
        }
      }
    }
    await delay(300);
  }
}

// =============================================================================
// 7. Ekran Üzerinde Canlı İlerleme Bildirimi
// =============================================================================
function showFloatingOverlay(page: number, orderCount: number, customerCount: number, onStop: () => void) {
  if (!overlayElement) {
    overlayElement = document.createElement("div");
    overlayElement.id = "prm-history-learning-overlay";
    overlayElement.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 350px;
      background: #0f172a;
      color: #ffffff;
      border-radius: 18px;
      box-shadow: 0 16px 36px rgba(0,0,0,0.45);
      border: 2px solid #38bdf8;
      padding: 18px;
      z-index: 9999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    document.body.appendChild(overlayElement);
  }

  overlayElement.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:20px;">🎓</span>
        <strong style="font-size:14px; font-weight:800; color:#38bdf8;">Adres Öğrenme Modülü</strong>
      </div>
      <span style="font-size:11px; background:#1e293b; color:#22c55e; padding:3px 8px; border-radius:10px; font-weight:bold; border:1px solid #22c55e;">
        CANLI TARAMA
      </span>
    </div>
    <div style="font-size:12px; color:#94a3b8; margin-bottom:12px; line-height:1.4;">
      Geçmiş siparişler geriye doğru taranıyor. Her müşterinin en çok teslim aldığı araç tespit ediliyor.
    </div>
    <div style="background:#1e293b; border-radius:12px; padding:10px; margin-bottom:14px; display:flex; justify-content:space-around; text-align:center;">
      <div>
        <div style="font-size:10px; color:#94a3b8;">İŞLENEN SAYFA</div>
        <div style="font-size:18px; font-weight:900; color:#facc15;">${page}</div>
      </div>
      <div>
        <div style="font-size:10px; color:#94a3b8;">SİPARİŞ</div>
        <div style="font-size:18px; font-weight:900; color:#38bdf8;">${orderCount}</div>
      </div>
      <div>
        <div style="font-size:10px; color:#94a3b8;">ÖĞRENİLEN</div>
        <div style="font-size:18px; font-weight:900; color:#4ade80;">${customerCount}</div>
      </div>
    </div>
    <button id="btn-stop-learning" style="
      width: 100%;
      background: #dc2626;
      color: white;
      border: none;
      border-radius: 10px;
      padding: 10px;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
    ">
      ⏹️ Taramayı Tamamla ve Kaydet
    </button>
  `;

  document.getElementById("btn-stop-learning")?.addEventListener("click", onStop);
}

function removeFloatingOverlay() {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

// =============================================================================
// 🚀 ANA TARAMA VE ÖĞRENME MOTORU
// =============================================================================
export async function runHistoryLearningProcess(maxPages = 200): Promise<{ totalOrders: number; totalCustomers: number }> {
  if (isScrapingActive) {
    console.warn("[PRM HistoryLearner] Tarama işlemi zaten aktif!");
    return { totalOrders: 0, totalCustomers: 0 };
  }

  isScrapingActive = true;
  let totalOrdersScraped = 0;
  let currentPage = 1;
  let consecutiveEmptyPages = 0;

  try {
    const state = await getState();
    const customerMap: Record<string, CustomerDeliveryPreference> = { ...(state.customerPreferences || {}) };
    const learnedAddressList: LearnedAddress[] = [...(state.learnedAddresses || [])];

    showFloatingOverlay(1, totalOrdersScraped, Object.keys(customerMap).length, () => {
      isScrapingActive = false;
    });

    // 1. ADIM: "Temizle" butonuna tıkla ve tüm alanların boş olduğundan emin ol
    const { clearBtn, searchBtn } = findFilterButtons();
    if (clearBtn) {
      console.log("[PRM HistoryLearner] 'Temizle' butonuna tıklandı.");
      clearBtn.click();
      await delay(600);
    }
    clearAllFilterInputs();
    await delay(600);

    // 2. ADIM: "Ara" butonuna tıkla ve siparişlerin listelenmesini bekle
    if (searchBtn) {
      console.log("[PRM HistoryLearner] 'Ara' butonuna tıklandı, tablo bekleniyor...");
      searchBtn.click();
      await delay(2500);
    } else {
      console.warn("[PRM HistoryLearner] Ara butonu bulunamadı, mevcut tablo üzerinden devam edilecek.");
    }

    // 3. ADIM: Sayfa Sayfa Gez ve Her Siparişi Çıkar
    while (isScrapingActive && currentPage <= maxPages) {
      showFloatingOverlay(currentPage, totalOrdersScraped, Object.keys(customerMap).length, () => {
        isScrapingActive = false;
      });

      // Tabloyu bekle ve bul
      const table = await waitForOrderTable(8000);
      if (!table) {
        console.warn(`[PRM HistoryLearner] Sayfa ${currentPage}: Tablo bulunamadı.`);
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 3) {
          console.warn("[PRM HistoryLearner] Üst üste 3 kez tablo bulunamadı, tarama tamamlandı.");
          break;
        }
        await delay(1500);
        continue;
      }

      // Bu sayfadaki siparişleri oku
      const rows = extractOrdersFromTable(table, state.vehicles);
      console.log(`[PRM HistoryLearner] Sayfa ${currentPage}: ${rows.length} sipariş okundu.`);

      if (rows.length === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 3) {
          console.warn("[PRM HistoryLearner] Üst üste 3 kez boş sayfa geldi, tarama tamamlandı.");
          break;
        }
      } else {
        consecutiveEmptyPages = 0;
      }

      // Siparişleri müşterilere ve araç tercihlerine ekle
      for (const row of rows) {
        totalOrdersScraped++;
        const vehicleId = row.vehicleId;
        const cleanPhone = row.phone.replace(/\D/g, "");
        const normAddr = normalizeAddress(row.rawAddress);
        const customerKey = cleanPhone.length >= 7 ? `phone_${cleanPhone}` : `addr_${normAddr}`;

        if (vehicleId) {
          const existingPref = customerMap[customerKey];
          const counts: Record<string, number> = existingPref ? { ...existingPref.counts } : {};
          counts[vehicleId] = (counts[vehicleId] || 0) + 1;

          // En çok teslimat yapan aracı belirle (User kuralı)
          let topVehId = vehicleId;
          let topCount = 0;
          for (const [vId, count] of Object.entries(counts)) {
            if (count > topCount) {
              topCount = count;
              topVehId = vId;
            }
          }

          const topVehicle = state.vehicles.find((v) => v.id === topVehId);
          const topVehicleName = topVehicle?.shortName || topVehId;
          const totalDeliveries = Object.values(counts).reduce((sum, c) => sum + c, 0);

          customerMap[customerKey] = {
            key: customerKey,
            customerName: row.customerName,
            phone: row.phone,
            rawAddress: row.rawAddress,
            normalizedAddress: normAddr,
            counts,
            topVehicleId: topVehId,
            topVehicleName,
            topCount,
            totalDeliveries,
            lastDeliveryAt: Date.now(),
          };

          // LearnedAddresses listesine de ekle/güncelle
          const existingLaIdx = learnedAddressList.findIndex(
            (la) => la.normalizedAddress === normAddr || (cleanPhone.length >= 7 && la.rawExample.includes(cleanPhone))
          );

          if (existingLaIdx !== -1) {
            learnedAddressList[existingLaIdx].vehicleId = topVehId;
            learnedAddressList[existingLaIdx].useCount = topCount;
            learnedAddressList[existingLaIdx].updatedAt = Date.now();
          } else {
            learnedAddressList.unshift({
              id: `learned-hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              normalizedAddress: normAddr,
              rawExample: `${row.customerName} - ${row.rawAddress} (${row.phone})`,
              vehicleId: topVehId,
              useCount: topCount,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              lastUsedAt: Date.now(),
              source: "automatic",
            });
          }
        }
      }

      showFloatingOverlay(currentPage, totalOrdersScraped, Object.keys(customerMap).length, () => {
        isScrapingActive = false;
      });

      // Her sayfada durumu hafızaya kaydet (böylece durdurulsa bile hiçbir veri kaybolmaz)
      await updateState((s) => {
        s.customerPreferences = customerMap;
        s.learnedAddresses = learnedAddressList.slice(0, 5000);
        s.historyLearner = {
          isRunning: true,
          currentPage,
          totalOrdersScraped,
          totalCustomersLearned: Object.keys(customerMap).length,
          lastRunAt: Date.now(),
        };
      });

      // Sonraki sayfa butonuna tıkla
      const nextBtn = findNextPageButton();
      if (!nextBtn) {
        console.log("[PRM HistoryLearner] Son sayfaya ulaşıldı veya sonraki sayfa butonu yok.");
        break;
      }

      const firstOrderIdBefore = rows[0]?.orderNumber;
      nextBtn.click();
      currentPage++;

      // Sayfa tablosunun değişmesini bekle
      await waitForPageChange(firstOrderIdBefore, 4000);
    }

    // 4. ADIM: Nihai Durumu Kaydet
    await updateState((s) => {
      s.customerPreferences = customerMap;
      s.learnedAddresses = learnedAddressList.slice(0, 5000);
      s.historyLearner = {
        isRunning: false,
        currentPage,
        totalOrdersScraped,
        totalCustomersLearned: Object.keys(customerMap).length,
        lastRunAt: Date.now(),
        statusMessage: `Başarıyla tamamlandı. ${currentPage} sayfa, ${totalOrdersScraped} sipariş ve ${Object.keys(customerMap).length} müşteri öğrenildi.`,
      };
    });

    removeFloatingOverlay();
    alert(
      `🎉 Adres Öğrenme Tamamlandı!\n\n• Toplam ${currentPage} sayfa tarandı.\n• Toplam ${totalOrdersScraped} sipariş incelendi.\n• ${Object.keys(customerMap).length} müşterinin teslimat geçmişi ve en çok teslim eden aracı hafızaya kaydedildi!`
    );

    return {
      totalOrders: totalOrdersScraped,
      totalCustomers: Object.keys(customerMap).length,
    };
  } catch (error) {
    console.error("[PRM HistoryLearner] Hata oluştu:", error);
    removeFloatingOverlay();
    await updateState((s) => {
      s.historyLearner = {
        ...(s.historyLearner || {}),
        isRunning: false,
        error: error instanceof Error ? error.message : String(error),
      };
    });
    alert(`Adres öğrenme sırasında bir hata oluştu: ${error instanceof Error ? error.message : String(error)}`);
    return { totalOrders: totalOrdersScraped, totalCustomers: 0 };
  } finally {
    isScrapingActive = false;
  }
}

// =============================================================================
// 📌 Sipariş Listesi Sayfasında Üst Banner / Başlatma Butonu Enjeksiyonu
// =============================================================================
export function injectOrderListControlBanner(): void {
  if (document.getElementById("prm-history-learner-banner")) return;

  const banner = document.createElement("div");
  banner.id = "prm-history-learner-banner";
  banner.style.cssText = `
    position: fixed;
    top: 14px;
    right: 24px;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #ffffff;
    border: 2px solid #38bdf8;
    border-radius: 14px;
    padding: 10px 18px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.4);
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="font-size: 24px;">🎓</span>
      <div>
        <div style="font-weight: 800; font-size: 13px; color: #38bdf8;">Adres & Araç Öğrenme Modülü</div>
        <div style="font-size: 11px; color: #94a3b8;">Tüm geçmiş siparişleri tarayıp müşterileri en çok teslim eden araca atar.</div>
      </div>
    </div>
    <button id="btn-start-history-learning-action" style="
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-weight: bold;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    ">
      🚀 Taramayı Başlat
    </button>
  `;

  document.body.appendChild(banner);

  const startBtn = document.getElementById("btn-start-history-learning-action");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      startBtn.setAttribute("disabled", "true");
      (startBtn as HTMLElement).innerText = "⏳ Taranıyor...";
      void runHistoryLearningProcess().finally(() => {
        startBtn.removeAttribute("disabled");
        (startBtn as HTMLElement).innerText = "🚀 Taramayı Başlat";
      });
    });
  }
}
