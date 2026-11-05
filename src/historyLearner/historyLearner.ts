import { normalizeAddress } from "../core/addressNormalizer";
import { resolveVehicleId } from "../core/reportEngine";
import type { CustomerDeliveryPreference, ExtensionState, LearnedAddress, Vehicle } from "../shared/types";
import { getState, updateState } from "../storage/storage";
import { syncReportsToCloud } from "../cloud/cloudSync";

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

interface ColumnMap {
  orderNumber: number;
  customerName: number;
  phone: number;
  address: number;
  status: number;
  deliveryVehicle: number;
}

let isScrapingActive = false;
let overlayElement: HTMLDivElement | null = null;

export function isOrderListPage(): boolean {
  return location.pathname.includes("/main/order-management/order-list");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 1. "Temizle" ve "Ara" Butonlarını Bulan Fonksiyon
export function findFilterButtons(): { clearBtn: HTMLElement | null; searchBtn: HTMLElement | null } {
  let clearBtn: HTMLElement | null = null;
  let searchBtn: HTMLElement | null = null;

  const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, a.btn, input[type='button'], input[type='submit'], div[role='button'], a"));
  for (const btn of buttons) {
    const text = (btn.innerText || btn.getAttribute("value") || btn.getAttribute("title") || "").trim().toLowerCase();
    if (!clearBtn && (text.includes("temizle") || text === "sıfırla" || text === "reset")) {
      clearBtn = btn;
    }
    if (!searchBtn && (text === "ara" || text === "search" || text.includes("ara"))) {
      if (!text.includes("temizle") && !text.includes("iptal") && !text.includes("araç")) {
        searchBtn = btn;
      }
    }
  }

  // Fallback: Kırmızı renkli buton veya arama ikonu içeren buton
  if (!searchBtn) {
    for (const btn of buttons) {
      if (btn.classList.contains("btn-danger") || btn.classList.contains("p-button-danger") || btn.querySelector(".fa-search, .pi-search, i.search")) {
        const text = (btn.innerText || "").trim().toLowerCase();
        if (!text.includes("temizle") && !text.includes("iptal")) {
          searchBtn = btn;
          break;
        }
      }
    }
  }

  return { clearBtn, searchBtn };
}

// Filtre alanlarındaki tüm metin ve seçim kutularını kesin olarak boşaltma
export function clearAllFilterInputs(): void {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"));
  for (const el of inputs) {
    if (el.closest("table") || el.closest("#prm-history-learning-overlay") || el.closest("#prm-history-learning-banner")) continue;
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

// 2. Tabloyu ve Başlık Haritasını Bulan Fonksiyon
export function findOrderTable(): { table: HTMLTableElement; colMap: ColumnMap } | null {
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));
  for (const table of tables) {
    const headers = Array.from(table.querySelectorAll("th, thead td, tr:first-child td"));
    if (headers.length === 0) continue;

    let orderNumber = -1;
    let customerName = -1;
    let phone = -1;
    let address = -1;
    let status = -1;
    let deliveryVehicle = -1;

    headers.forEach((th, idx) => {
      const text = (th.textContent || "").trim().toLowerCase();
      if (text.includes("sipariş numara") || text.includes("siparis no") || text.includes("sipariş no")) orderNumber = idx;
      else if (text.includes("müşteri adı") || text.includes("musteri adi") || text.includes("müşteri") || text.includes("musteri")) customerName = idx;
      else if (text.includes("telefon") || text.includes("tel no") || text.includes("gsm")) phone = idx;
      else if (text.includes("adresi") || text.includes("adres") || text.includes("müşteri adresi")) address = idx;
      else if (text.includes("durum") || text.includes("sipariş durumu")) status = idx;
      else if (text.includes("teslimatçı") || text.includes("teslimatci") || text.includes("araç") || text.includes("kurye")) deliveryVehicle = idx;
    });

    if (customerName !== -1 && address !== -1 && deliveryVehicle !== -1) {
      return {
        table,
        colMap: {
          orderNumber: orderNumber !== -1 ? orderNumber : 0,
          customerName,
          phone: phone !== -1 ? phone : 3,
          address,
          status: status !== -1 ? status : 8,
          deliveryVehicle,
        },
      };
    }
  }
  return null;
}

// 3. Geçerli Sayfadaki Satırları Okuma
export function parseCurrentPageRows(table: HTMLTableElement, colMap: ColumnMap, vehicles: Vehicle[]): ScrapedHistoryRow[] {
  const rows = Array.from(table.querySelectorAll("tbody tr, tr:not(:first-child)"));
  const results: ScrapedHistoryRow[] = [];

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 5) continue;

    const orderNumber = (cells[colMap.orderNumber]?.textContent || "").trim().split("\n")[0].trim();
    const customerName = (cells[colMap.customerName]?.textContent || "").trim().replace(/\s+/g, " ");
    const rawPhone = (cells[colMap.phone]?.textContent || "").trim().replace(/\D/g, "");
    const rawAddress = (cells[colMap.address]?.textContent || "").trim().replace(/\s+/g, " ");
    const status = (cells[colMap.status]?.textContent || "").trim();
    const vehicleName = (cells[colMap.deliveryVehicle]?.textContent || "").trim().replace(/\s+/g, " ");

    if (!customerName || !rawAddress) continue;

    // Aracı eşleştir (ARAÇ 1, ARAÇ 2, ARAÇ 3)
    let vehicleId: string | undefined;
    const upperName = vehicleName.toLocaleUpperCase("tr-TR");
    for (const v of vehicles) {
      const vShort = v.shortName.toLocaleUpperCase("tr-TR");
      const vPrm = v.prmName.toLocaleUpperCase("tr-TR");
      if (
        upperName.includes(vShort) ||
        upperName.includes(vPrm) ||
        (v.id === "vehicle1" && (upperName.includes("ARAÇ 1") || upperName.includes("ARAC 1"))) ||
        (v.id === "vehicle2" && (upperName.includes("ARAÇ 2") || upperName.includes("ARAC 2"))) ||
        (v.id === "vehicle3" && (upperName.includes("ARAÇ 3") || upperName.includes("ARAC 3")))
      ) {
        vehicleId = v.id;
        break;
      }
    }

    results.push({
      orderNumber,
      customerName,
      phone: rawPhone,
      rawAddress,
      status,
      vehicleName,
      vehicleId,
    });
  }

  return results;
}

// 4. Sonraki Sayfa Butonunu Bulma
export function findNextPageButton(): HTMLElement | null {
  // PrimeNG / AntD / Bootstrap / DX paginator butonları
  const selectors = [
    "button.p-paginator-next:not([disabled]):not(.p-disabled)",
    "li.p-paginator-next:not(.p-disabled) a",
    "li.next:not(.disabled) a",
    "a.page-link[aria-label*='Next']",
    "a.page-link[aria-label*='Sonraki']",
    ".dx-page-next:not(.dx-state-disabled)",
    "button[aria-label='Next page']:not([disabled])",
    "button[title='Sonraki Sayfa']:not([disabled])",
  ];

  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && isElementVisible(el)) return el;
  }

  // Metin veya ikona göre arama (>, », Sonraki)
  const paginationElements = Array.from(document.querySelectorAll<HTMLElement>(".pagination a, .pagination button, .p-paginator a, .p-paginator button, ul[class*='page'] li a"));
  for (const el of paginationElements) {
    const txt = (el.innerText || el.getAttribute("aria-label") || "").trim();
    if (txt === ">" || txt === "»" || txt === "›" || txt.toLowerCase().includes("sonraki")) {
      const isParentDisabled = el.closest(".disabled") !== null || el.hasAttribute("disabled") || el.classList.contains("disabled") || el.classList.contains("p-disabled");
      if (!isParentDisabled && isElementVisible(el)) return el;
    }
  }

  // Aktif sayfa numarasından bir sonrakini bulma (Örn: 1 aktifse 2'ye tıkla)
  const activePageEl = document.querySelector<HTMLElement>(".pagination .active, .p-highlight, li.active, button.active");
  if (activePageEl) {
    const currentPageNum = parseInt(activePageEl.innerText.trim(), 10);
    if (!isNaN(currentPageNum) && currentPageNum > 0) {
      const nextPageNum = currentPageNum + 1;
      const nextNumEl = Array.from(document.querySelectorAll<HTMLElement>(".pagination a, .pagination button, .p-paginator-page, ul[class*='page'] li a, button"))
        .find((el) => el.innerText.trim() === String(nextPageNum) && isElementVisible(el));
      if (nextNumEl) return nextNumEl;
    }
  }

  return null;
}

function isElementVisible(el: HTMLElement): boolean {
  return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

// 5. Ekran Üzerinde Canlı İlerleme Bildirimi
function showFloatingOverlay(page: number, orderCount: number, customerCount: number, onStop: () => void) {
  if (!overlayElement) {
    overlayElement = document.createElement("div");
    overlayElement.id = "prm-history-learning-overlay";
    overlayElement.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 340px;
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
        <div style="font-size:10px; color:#94a3b8;">TARANAN SAYFA</div>
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
  let pageCount = 0;

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
      clearBtn.click();
      await delay(600);
    }
    // Tüm input ve select elemanlarını kesin olarak sıfırla
    clearAllFilterInputs();
    await delay(600);

    // 2. ADIM: "Ara" butonuna tıkla ve tüm geçmiş siparişleri listele
    if (searchBtn) {
      searchBtn.click();
      await delay(2500);
    } else {
      console.warn("[PRM HistoryLearner] Ara butonu bulunamadı, mevcut tablo taranacak.");
    }

    // 3. ADIM: Sayfa Sayfa Siparişleri Gez ve Öğren
    while (isScrapingActive && pageCount < maxPages) {
      pageCount++;

      const tableData = findOrderTable();
      if (!tableData) {
        console.warn("[PRM HistoryLearner] Sipariş tablosu bulunamadı, bekleniyor...");
        await delay(1500);
        continue;
      }

      const rows = parseCurrentPageRows(tableData.table, tableData.colMap, state.vehicles);
      if (rows.length === 0) {
        console.warn("[PRM HistoryLearner] Bu sayfada satır bulunamadı.");
        break;
      }

      for (const row of rows) {
        totalOrdersScraped++;
        if (!row.vehicleId) continue; // Aracı atanmamış siparişleri atla

        // Müşteri benzersiz anahtarı: Telefon varsa telefon, yoksa normalize adres
        const cleanPhone = row.phone.replace(/\D/g, "");
        const normAddr = normalizeAddress(row.rawAddress);
        const customerKey = cleanPhone.length >= 7 ? `phone_${cleanPhone}` : `addr_${normAddr}`;

        const existingPref = customerMap[customerKey];
        const counts: Record<string, number> = existingPref ? { ...existingPref.counts } : {};
        counts[row.vehicleId] = (counts[row.vehicleId] || 0) + 1;

        // En çok teslim eden aracı belirle (User kuralı)
        let topVehId = row.vehicleId;
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

        // Ayrıca LearnedAddresses tablosunu da en çok teslim eden araçla besle
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

      showFloatingOverlay(pageCount, totalOrdersScraped, Object.keys(customerMap).length, () => {
        isScrapingActive = false;
      });

      // Her 2 sayfada bir verileri hafızaya kaydet
      if (pageCount % 2 === 0) {
        await updateState((s) => {
          s.customerPreferences = customerMap;
          s.learnedAddresses = learnedAddressList.slice(0, 5000);
          s.historyLearner = {
            isRunning: true,
            currentPage: pageCount,
            totalOrdersScraped,
            totalCustomersLearned: Object.keys(customerMap).length,
            lastRunAt: Date.now(),
          };
        });
      }

      // Sonraki sayfa butonunu bul ve tıkla
      const nextBtn = findNextPageButton();
      if (!nextBtn) {
        console.log("[PRM HistoryLearner] Son sayfaya ulaşıldı veya sonraki sayfa butonu yok.");
        break;
      }

      nextBtn.click();
      await delay(1800); // Tablonun render edilmesi için bekle
    }

    // 4. ADIM: Nihai Durumu Kaydet
    await updateState((s) => {
      s.customerPreferences = customerMap;
      s.learnedAddresses = learnedAddressList.slice(0, 5000);
      s.historyLearner = {
        isRunning: false,
        currentPage: pageCount,
        totalOrdersScraped,
        totalCustomersLearned: Object.keys(customerMap).length,
        lastRunAt: Date.now(),
        statusMessage: `Başarıyla tamamlandı. ${pageCount} sayfa, ${totalOrdersScraped} sipariş ve ${Object.keys(customerMap).length} müşteri öğrenildi.`,
      };
    });

    removeFloatingOverlay();
    alert(`🎉 Adres Öğrenme Tamamlandı!\n\n• Toplam ${pageCount} sayfa tarandı.\n• Toplam ${totalOrdersScraped} sipariş incelendi.\n• ${Object.keys(customerMap).length} müşterinin teslimat geçmişi ve en çok teslim eden aracı hafızaya kaydedildi!`);

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
