import { describe, expect, it } from "vitest";
import { extractInvoiceMetadata, extractReturnPalletMetadata } from "../src/core/invoiceExtractor";

describe("invoice PDF metadata extraction", () => {
  it("extracts invoice date and prioritized grand total", () => {
    const result = extractInvoiceMetadata(
      "TEDARİKÇİ A.Ş. Fatura Tarihi: 25.08.2026 Mal Hizmet Toplam Tutarı 8.000,00 Genel Toplam: 9.600,00 TL",
      "tedarikci-fatura.pdf",
      1,
    );
    expect(result.amountMinor).toBe(960000);
    const date = new Date(result.documentDate);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 7, 25]);
    expect(result.confidence).toBe("automatic");
  });

  it("requires review when a scanned PDF yields no text", () => {
    expect(extractInvoiceMetadata("", "scan.pdf", 123)).toMatchObject({ amountMinor: undefined, confidence: "needs_review", documentDate: 123 });
  });

  it("extracts return pallet amount, date and product quantities", () => {
    const result = extractReturnPalletMetadata(
      "İade Faturası Belge Tarihi: 27.08.2026\nBoş Damacana 12 Adet 120,00 TL\nPlastik Palet 3 PALET 900,00 TL\nGenel Toplam: 2.340,00 TL",
      "iade-paleti.pdf",
      1,
    );
    expect(result.amountMinor).toBe(234000);
    expect(result.items).toEqual([
      { name: "Boş Damacana", quantity: 12, unit: "Adet" },
      { name: "Plastik Palet", quantity: 3, unit: "Palet" },
    ]);
    expect(result.confidence).toBe("automatic");
  });

  it("requires review when return products cannot be extracted", () => {
    const result = extractReturnPalletMetadata("Genel Toplam: 500,00 TL", "iade.pdf", 1);
    expect(result.items).toEqual([]);
    expect(result.confidence).toBe("needs_review");
  });

  it("extracts quantity-first return rows without including the price in the product name", () => {
    const result = extractReturnPalletMetadata(
      "Tarih 27.08.2026\n5 Adet İade Cam Damacana 750,00 TL\nToplam Tutar 750,00 TL",
      "iade.pdf",
      1,
    );
    expect(result.items).toEqual([{ name: "İade Cam Damacana", quantity: 5, unit: "Adet" }]);
  });
});
