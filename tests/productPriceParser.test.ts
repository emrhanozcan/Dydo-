// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { findNextPageButton, findProductPriceTable, parseMoneyMinor, parseProductPriceTable } from "../src/productPrices/productPriceParser";
import { scrapeAllProductPrices } from "../src/productPrices/productPriceScraper";

describe("product price parser", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it.each([
    ["219,00 TL", 21_900],
    ["₺1.250,50", 125_050],
    ["1,250.50 TRY", 125_050],
    ["1.250 TL", 125_000],
    ["0,00", 0],
  ])("parses Turkish monetary value %s", (raw, expected) => {
    expect(parseMoneyMinor(raw)).toBe(expected);
  });

  it("finds the semantic table and extracts code, name, unit and price", () => {
    document.body.innerHTML = `
      <table><thead><tr><th>Başlık</th></tr></thead><tbody><tr><td>İlgisiz</td></tr></tbody></table>
      <table aria-label="Ürün fiyat listesi"><thead><tr>
        <th>Ürün Kodu</th><th>Ürün Adı</th><th>Birim</th><th>Tavsiye Edilen Satış Fiyatı</th>
      </tr></thead><tbody>
        <tr><td>DM-19</td><td>19 LT Damacana</td><td>Adet</td><td>219,00 TL</td></tr>
        <tr><td>SU-05</td><td>0.5 LT Su</td><td>Koli</td><td>145,50 TL</td></tr>
      </tbody></table>`;
    const table = findProductPriceTable();
    expect(table).not.toBeNull();
    expect(parseProductPriceTable(table!)).toMatchObject([
      { productCode: "DM-19", productName: "19 LT Damacana", unit: "Adet", priceMinor: 21_900, rawPrice: "219,00 TL" },
      { productCode: "SU-05", productName: "0.5 LT Su", unit: "Koli", priceMinor: 14_550, rawPrice: "145,50 TL" },
    ]);
  });

  it("does not confuse an Ürün Fiyatı header with the product name", () => {
    document.body.innerHTML = `<table><thead><tr><th>Ürün Kodu</th><th>Ürün Fiyatı</th></tr></thead><tbody><tr><td>DM-19</td><td>219,00</td></tr></tbody></table>`;
    expect(parseProductPriceTable(document.querySelector("table")!)[0]).toMatchObject({ productCode: "DM-19", productName: "DM-19", priceMinor: 21_900 });
  });

  it("reads the portal's two-level header and chooses editable dealer sale price", () => {
    document.body.innerHTML = `<table class="product-table"><thead>
      <tr><th></th><th colspan="3">27.08.2026</th></tr>
      <tr><th>Kapalı/Açık</th><th>Ürün Kodu</th><th>Ürün Açıklaması</th><th>Bayi Alış Fiyatı</th><th>Tavsiye Fiyat</th><th>Bayi Satış Fiyatı</th></tr>
    </thead><tbody><tr><td><input type="checkbox"></td><td>6306876</td><td>SAKA DEPOZİTO (Damacana)</td><td>0,00</td><td>135,00</td><td><input value="120"></td></tr></tbody></table>`;
    const table = findProductPriceTable();
    expect(table).not.toBeNull();
    expect(parseProductPriceTable(table!)[0]).toMatchObject({ productCode: "6306876", productName: "SAKA DEPOZİTO (Damacana)", priceMinor: 12_000, rawPrice: "120" });
  });

  it("supports the portal's English product-description and custom-price headers", () => {
    document.body.innerHTML = `<table><thead><tr><th>Open/Close</th><th>Product Code</th><th>Product Description</th><th>Branch Purchase Price</th><th>Advised Price</th><th>Custom Price</th></tr></thead><tbody><tr><td></td><td>ABC</td><td>0.5 LT</td><td>100.00</td><td>145.50</td><td><input value="140.00"></td></tr></tbody></table>`;
    expect(parseProductPriceTable(document.querySelector("table")!)[0]).toMatchObject({ productCode: "ABC", productName: "0.5 LT", priceMinor: 14_000 });
  });

  it("collects every paginator page", async () => {
    document.body.innerHTML = `<section><table><thead><tr><th>Ürün Kodu</th><th>Ürün Adı</th><th>Fiyat</th></tr></thead><tbody><tr><td>A</td><td>Ürün A</td><td>10,00</td></tr></tbody></table><button aria-label="Sonraki sayfa">İleri</button></section>`;
    const table = document.querySelector("table")!;
    const next = findNextPageButton(table)! as HTMLButtonElement;
    next.addEventListener("click", () => {
      table.querySelector("tbody")!.innerHTML = `<tr><td>B</td><td>Ürün B</td><td>20,00</td></tr>`;
      next.disabled = true;
    });
    const result = await scrapeAllProductPrices(1_000);
    expect(result.complete).toBe(true);
    expect(result.pageCount).toBe(2);
    expect(result.products.map((product) => product.productName)).toEqual(["Ürün A", "Ürün B"]);
  });
});
