// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import fixture from "./fixtures/live-orders.html?raw";
import { buildColumnMap, findLiveOrderTable, parseOrders } from "../src/content/orderParser";
import { performAssignment } from "../src/content/assignmentAutomation";
import { DEFAULT_VEHICLES } from "../src/storage/schema";
import { detectPage } from "../src/content/prmDetector";

describe("PRM DOM integration fixture", () => {
  beforeEach(() => { document.body.innerHTML = fixture; });

  it("derives column indexes from shuffled Turkish headers and parses order", () => {
    const table = findLiveOrderTable();
    expect(table).not.toBeNull();
    expect(buildColumnMap(table!)).toMatchObject({ address: 0, orderNumber: 1, deliveryPerson: 2, customerName: 3 });
    expect(parseOrders(table!)[0]).toMatchObject({ id: "2026082616751805", customerName: "Gürcan Eken", normalizedAddress: "uskumrukoy mah arikoy sitesi" });
  });

  it("selects exact PRM vehicle option, saves and verifies the row", async () => {
    document.getElementById("save")!.addEventListener("click", () => {
      document.querySelector<HTMLTableCellElement>("tbody td:nth-child(3)")!.textContent = "İSTANBUL-ZEKERİYAKÖY ARAÇ 3";
    });
    const order = parseOrders(findLiveOrderTable()!)[0];
    await expect(performAssignment(order, DEFAULT_VEHICLES[2])).resolves.toEqual({ success: true });
  });

  it("does not click an arbitrary element if the dropdown is absent", async () => {
    document.querySelector("select")?.remove();
    const order = parseOrders(findLiveOrderTable()!)[0];
    await expect(performAssignment(order, DEFAULT_VEHICLES[2])).resolves.toEqual({ success: false, reason: "delivery_dropdown_not_found" });
  });

  it("detects an Angular-style login form whose username input has no type", () => {
    document.body.innerHTML = `<form><label>Kullanıcı Adı<input formcontrolname="username" value="zekeriyakoy"></label><label>Şifre<input type="password" value="secret"></label><button type="submit">Giriş</button></form>`;
    expect(detectPage()).toBe("login");
  });

  describe("V-NEXT Sales modern UI assignment flow (Images 1-4)", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div class="breadcrumb"><span>Sipariş Yönetimi</span> &gt; <span>Canlı Sipariş</span></div>
        <table class="mat-mdc-table">
          <thead>
            <tr class="mat-mdc-header-row">
              <th>Sipariş Numarası</th>
              <th>Sipariş Kanalı</th>
              <th>Müşteri Adı</th>
              <th>Telefon No</th>
              <th>Müşteri Adresi</th>
              <th>Sipariş Detay</th>
              <th>Notlar</th>
              <th>Sipariş Durumu</th>
              <th>Teslimatçı</th>
              <th>Gecikme Bildirimi</th>
              <th>Sipariş Tutarı</th>
              <th>Ödeme Tipi</th>
              <th>İşlemler</th>
              <th>Oluşturma Zamanı</th>
              <th>Randevulu Teslimat</th>
              <th>Geçen Dakika</th>
            </tr>
          </thead>
          <tbody>
            <tr class="mat-mdc-row">
              <td>
                <div class="order-id" title="2026110310780415">202611031... <button type="button">⧉</button></div>
                <div class="secondary-id">10780415 <button type="button">⧉</button></div>
              </td>
              <td>Mobil</td>
              <td>SEDA KÖPRÜLÜ</td>
              <td>5396565278</td>
              <td>Zekeriyaköy, Sayran Bağları Sk., No: 41, Site: Sinpaş Boğaziçi Malikaneleri</td>
              <td>SAKA 19 LT DAMACANA SU 1 Adet</td>
              <td>-</td>
              <td>Bekliyor</td>
              <td>
                <span class="badge rounded-pill delivery-pill" role="button">İSTANBUL-ZEKERİYAKÖY ARAÇ 1</span>
              </td>
              <td>Hayır</td>
              <td>470,00</td>
              <td>Kredi Kartı (Online)</td>
              <td><button type="button">İptal</button></td>
              <td>03.11.2026 08:05</td>
              <td>03.11.2026 09:00</td>
              <td>0</td>
            </tr>
          </tbody>
        </table>
      `;
    });

    it("correctly parses order number, secondary id and columns from modern table", () => {
      const table = findLiveOrderTable();
      expect(table).not.toBeNull();
      const map = buildColumnMap(table!);
      expect(map.orderNumber).toBe(0);
      expect(map.deliveryPerson).toBe(8);
      expect(map.address).toBe(4);

      const orders = parseOrders(table!);
      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        id: "2026110310780415",
        secondaryId: "10780415",
        customerName: "SEDA KÖPRÜLÜ",
        currentVehicle: "İSTANBUL-ZEKERİYAKÖY ARAÇ 1",
      });
    });

    it("automates the 4-step vehicle assignment modal flow smoothly", async () => {
      const table = findLiveOrderTable()!;
      const pill = table.querySelector<HTMLElement>(".delivery-pill")!;

      // Setup simulated modal behavior when delivery pill is clicked (Image 1 -> Image 2)
      pill.addEventListener("click", () => {
        const modal = document.createElement("div");
        modal.className = "mat-dialog-container modal";
        modal.setAttribute("role", "dialog");
        modal.innerHTML = `
          <div class="modal-header">
            <span class="icon">🚚</span> <h3>Teslimatçı</h3>
          </div>
          <div class="modal-body">
            <div class="mat-mdc-form-field">
              <label class="mat-mdc-floating-label">Teslimatçı</label>
              <div class="mat-mdc-select custom-select" role="combobox" aria-haspopup="listbox" tabindex="0">
                <span class="mat-mdc-select-value">İSTANBUL-ZEKERİYAKÖY ARAÇ 1</span>
                <span class="arrow">▼</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary cancel-btn">✕ İptal</button>
            <button type="button" class="btn btn-danger save-btn">💾 Kaydet</button>
          </div>
        `;
        document.body.appendChild(modal);

        const selectTrigger = modal.querySelector<HTMLElement>(".custom-select")!;
        selectTrigger.addEventListener("click", () => {
          // Dropdown opens in CDK overlay (Image 2 -> Image 3)
          const overlay = document.createElement("div");
          overlay.className = "cdk-overlay-container";
          overlay.innerHTML = `
            <div class="cdk-overlay-pane">
              <div role="listbox" class="mat-mdc-select-panel">
                <div role="option" class="mat-mdc-option" data-value="v1">İSTANBUL-ZEKERİYAKÖY ARAÇ 1</div>
                <div role="option" class="mat-mdc-option" data-value="v2">İSTANBUL-ZEKERİYAKÖY ARAÇ 2</div>
                <div role="option" class="mat-mdc-option" data-value="v3">İSTANBUL-ZEKERİYAKÖY ARAÇ 3</div>
              </div>
            </div>
          `;
          document.body.appendChild(overlay);

          overlay.querySelectorAll<HTMLElement>(".mat-mdc-option").forEach((opt) => {
            opt.addEventListener("click", () => {
              // Option chosen (Image 3 -> Image 4)
              selectTrigger.querySelector(".mat-mdc-select-value")!.textContent = opt.textContent;
              overlay.remove();
            });
          });
        });

        const saveBtn = modal.querySelector<HTMLElement>(".save-btn")!;
        saveBtn.addEventListener("click", () => {
          const chosenVehicle = selectTrigger.querySelector(".mat-mdc-select-value")!.textContent ?? "";
          pill.textContent = chosenVehicle;
          modal.remove();
        });
      });

      const order = parseOrders(table)[0];
      const result = await performAssignment(order, DEFAULT_VEHICLES[1]); // ARAÇ 2
      expect(result).toEqual({ success: true });
      expect(pill.textContent).toContain("İSTANBUL-ZEKERİYAKÖY ARAÇ 2");
    });
  });
});
