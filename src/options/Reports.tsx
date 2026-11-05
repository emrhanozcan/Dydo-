import { useEffect, useMemo, useState } from "react";
import { aggregateExpenses, aggregateReport, aggregateReturnPallets, parsePrmAmountToMinor, periodForCustom, periodForDay, periodForMonth, reportingTimestamp } from "../core/reportEngine";
import { extractInvoiceMetadata, extractReturnPalletMetadata } from "../core/invoiceExtractor";
import { createId } from "../shared/id";
import type { ExtensionState } from "../shared/types";
import { deleteExpensePdf, openExpensePdf, saveExpensePdf } from "../storage/pdfArchive";
import { readPdfText } from "./pdfReader";
import { pullHistoricalOrdersFromCloud } from "../cloud/cloudSync";

interface ExpenseDraft { file: File; vendor: string; date: string; amount: string; status: "automatic" | "needs_review" }
interface ReturnDraftItem { name: string; quantity: string; unit: string }
interface ReturnDraft { file: File; description: string; date: string; amount: string; items: ReturnDraftItem[]; status: "automatic" | "needs_review" }

export function Reports({ state, mutate, flash }: {
  state: ExtensionState;
  mutate: (fn: (state: ExtensionState) => void) => Promise<void>;
  flash: (message: string) => void;
}) {
  const today = localDateValue(new Date());
  const [periodType, setPeriodType] = useState<"day" | "month" | "custom">("day");
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [page, setPage] = useState(0);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  const [returnDraft, setReturnDraft] = useState<ReturnDraft | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [returnPdfLoading, setReturnPdfLoading] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const pageSize = 100;
  const period = periodType === "day"
    ? periodForDay(day)
    : periodType === "month"
      ? periodForMonth(month)
      : periodForCustom(customStart, customEnd);
  const report = useMemo(
    () => aggregateReport(Object.values(state.reportOrders), period),
    [state.reportOrders, period.start, period.endExclusive],
  );
  const expenses = useMemo(
    () => aggregateExpenses(state.expenseDocuments, period),
    [state.expenseDocuments, period.start, period.endExclusive],
  );
  const returns = useMemo(
    () => aggregateReturnPallets(state.returnPalletDocuments, period),
    [state.returnPalletDocuments, period.start, period.endExclusive],
  );
  const totalIncome = report.amountMinor + returns.amountMinor;
  const netAmount = totalIncome - expenses.amountMinor;
  const pageCount = Math.max(1, Math.ceil(report.orders.length / pageSize));
  const displayedOrders = report.orders.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => { setPage(0); }, [periodType, day, month, customStart, customEnd]);

  async function selectPdf(file?: File): Promise<void> {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase("tr-TR").endsWith(".pdf")) {
      flash("Lütfen PDF dosyası seçin.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) { flash("PDF dosyası 20 MB sınırını aşıyor."); return; }
    setPdfLoading(true);
    try {
      const text = await readPdfText(file);
      const metadata = extractInvoiceMetadata(text, file.name);
      setExpenseDraft({
        file,
        vendor: metadata.vendor,
        date: localDateValue(new Date(metadata.documentDate)),
        amount: metadata.amountMinor === undefined ? "" : (metadata.amountMinor / 100).toFixed(2).replace(".", ","),
        status: metadata.confidence,
      });
      if (metadata.confidence === "needs_review") flash("PDF metni veya toplam tutarı kesin okunamadı. Kaydetmeden önce alanları kontrol edin.");
    } catch (error) {
      flash(error instanceof Error ? `PDF okunamadı: ${error.message}` : "PDF okunamadı.");
    } finally {
      setPdfLoading(false);
    }
  }

  async function saveExpense(): Promise<void> {
    if (!expenseDraft) return;
    const amountMinor = parsePrmAmountToMinor(expenseDraft.amount);
    if (!amountMinor || amountMinor <= 0) { flash("Geçerli bir fatura tutarı girin."); return; }
    const documentDate = inputDateTimestamp(expenseDraft.date);
    if (!Number.isFinite(documentDate)) { flash("Geçerli bir belge tarihi girin."); return; }
    const id = createId("expense");
    try {
      await saveExpensePdf(id, expenseDraft.file);
      await mutate((current) => {
        current.expenseDocuments.unshift({
          id,
          fileName: expenseDraft.file.name,
          vendor: expenseDraft.vendor.trim() || "Tedarikçi belirtilmedi",
          documentDate,
          amountMinor,
          addedAt: Date.now(),
          extractionStatus: expenseDraft.status,
        });
      });
      setExpenseDraft(null);
      flash("Gelen mal faturası gider kaydı olarak eklendi.");
    } catch (error) {
      await deleteExpensePdf(id).catch(() => undefined);
      flash(error instanceof Error ? error.message : "Fatura kaydedilemedi.");
    }
  }

  async function selectReturnPdf(file?: File): Promise<void> {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase("tr-TR").endsWith(".pdf")) {
      flash("Lütfen PDF dosyası seçin.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) { flash("PDF dosyası 20 MB sınırını aşıyor."); return; }
    setReturnPdfLoading(true);
    try {
      const text = await readPdfText(file);
      const metadata = extractReturnPalletMetadata(text, file.name);
      setReturnDraft({
        file,
        description: metadata.vendor,
        date: localDateValue(new Date(metadata.documentDate)),
        amount: metadata.amountMinor === undefined ? "" : (metadata.amountMinor / 100).toFixed(2).replace(".", ","),
        items: (metadata.items.length ? metadata.items : [{ name: "", quantity: 1, unit: "Adet" }]).map((item) => ({
          name: item.name,
          quantity: String(item.quantity).replace(".", ","),
          unit: item.unit,
        })),
        status: metadata.confidence,
      });
      if (metadata.confidence === "needs_review") flash("İade PDF'sindeki tutar veya ürün kalemleri kesin okunamadı. Kaydetmeden önce kontrol edin.");
    } catch (error) {
      flash(error instanceof Error ? `İade PDF'si okunamadı: ${error.message}` : "İade PDF'si okunamadı.");
    } finally {
      setReturnPdfLoading(false);
    }
  }

  async function saveReturnPallet(): Promise<void> {
    if (!returnDraft) return;
    const amountMinor = parsePrmAmountToMinor(returnDraft.amount);
    if (!amountMinor || amountMinor <= 0) { flash("Geçerli bir iade geliri tutarı girin."); return; }
    const documentDate = inputDateTimestamp(returnDraft.date);
    if (!Number.isFinite(documentDate)) { flash("Geçerli bir belge tarihi girin."); return; }
    const items = returnDraft.items.map((item) => ({
      name: item.name.trim(),
      quantity: Number.parseFloat(item.quantity.replace(",", ".")),
      unit: item.unit.trim() || "Adet",
    })).filter((item) => item.name && Number.isFinite(item.quantity) && item.quantity > 0);
    if (items.length === 0) { flash("En az bir geçerli iade ürünü ve miktarı girin."); return; }
    const id = createId("return-pallet");
    try {
      await saveExpensePdf(id, returnDraft.file);
      await mutate((current) => {
        current.returnPalletDocuments.unshift({
          id,
          fileName: returnDraft.file.name,
          description: returnDraft.description.trim() || "İade paleti",
          documentDate,
          amountMinor,
          items,
          addedAt: Date.now(),
          extractionStatus: returnDraft.status,
        });
      });
      setReturnDraft(null);
      flash("İade paleti belgesi gelir kaydı olarak eklendi.");
    } catch (error) {
      await deleteExpensePdf(id).catch(() => undefined);
      flash(error instanceof Error ? error.message : "İade paleti kaydedilemedi.");
    }
  }

  async function removeExpense(id: string): Promise<void> {
    if (!window.confirm("Bu gider kaydı ve arşivlenen PDF silinsin mi?")) return;
    await deleteExpensePdf(id);
    await mutate((current) => { current.expenseDocuments = current.expenseDocuments.filter((document) => document.id !== id); });
  }

  async function removeReturnPallet(id: string): Promise<void> {
    if (!window.confirm("Bu iade geliri kaydı ve arşivlenen PDF silinsin mi?")) return;
    await deleteExpensePdf(id);
    await mutate((current) => { current.returnPalletDocuments = current.returnPalletDocuments.filter((document) => document.id !== id); });
  }

  async function clearDailyReport(): Promise<void> {
    if (periodType !== "day") return;
    const entryCount = report.orderCount + expenses.documents.length + returns.documents.length;
    if (entryCount === 0) return;
    const reportDate = new Date(period.start).toLocaleDateString("tr-TR");
    if (!window.confirm(`${reportDate} tarihli günlük rapor temizlensin mi? ${report.orderCount} sipariş, ${expenses.documents.length} gider ve ${returns.documents.length} iade kaydı kalıcı olarak silinecek.`)) return;

    const orderIds = new Set(report.orders.map((order) => order.orderId));
    const expenseIds = new Set(expenses.documents.map((document) => document.id));
    const returnIds = new Set(returns.documents.map((document) => document.id));
    try {
      await mutate((current) => {
        const dismissedAt = Date.now();
        for (const [key, order] of Object.entries(current.reportOrders)) {
          if (!orderIds.has(order.orderId)) continue;
          delete current.reportOrders[key];
          current.dismissedReportOrders[order.orderId] = dismissedAt;
        }
        current.dismissedReportOrders = Object.fromEntries(
          Object.entries(current.dismissedReportOrders).sort((left, right) => right[1] - left[1]).slice(0, 50_000),
        );
        current.expenseDocuments = current.expenseDocuments.filter((document) => !expenseIds.has(document.id));
        current.returnPalletDocuments = current.returnPalletDocuments.filter((document) => !returnIds.has(document.id));
      });
      const pdfResults = await Promise.allSettled([...expenseIds, ...returnIds].map((id) => deleteExpensePdf(id)));
      setPage(0);
      const failedPdfCount = pdfResults.filter((result) => result.status === "rejected").length;
      flash(failedPdfCount > 0
        ? `${reportDate} tarihli günlük rapor temizlendi; ${failedPdfCount} PDF arşivden kaldırılamadı.`
        : `${reportDate} tarihli günlük rapor temizlendi.`);
    } catch (error) {
      flash(error instanceof Error ? `Günlük rapor temizlenemedi: ${error.message}` : "Günlük rapor temizlenemedi.");
    }
  }

  return <>
    <header><h1>Raporlar</h1><p>Satışları, iade paleti gelirlerini, giderleri ve ürün miktarlarını inceleyin.</p></header>
    <section className="report-filters">
      <label>Rapor Dönemi<select value={periodType} onChange={(event) => setPeriodType(event.target.value as typeof periodType)}><option value="day">Günlük</option><option value="month">Aylık</option><option value="custom">Özel Tarih Aralığı</option></select></label>
      {periodType === "day" && <label>Gün<input type="date" value={day} onChange={(event) => setDay(event.target.value)} /></label>}
      {periodType === "month" && <label>Ay<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>}
      {periodType === "custom" && <>
        <label>Başlangıç<input type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} /></label>
        <label>Bitiş<input type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} /></label>
      </>}
      <button
        type="button"
        className="clear-daily-report"
        style={{ background: "#2563eb", borderColor: "#1d4ed8", color: "#fff", fontWeight: "bold" }}
        disabled={syncingCloud}
        onClick={async () => {
          setSyncingCloud(true);
          try {
            const count = await pullHistoricalOrdersFromCloud();
            flash(`☁️ Buluttan ${count} adet geçmiş sipariş başarıyla çekildi ve hesabınıza aktarıldı!`);
          } catch {
            flash("Buluttan geçmiş veri çekilirken hata oluştu.");
          } finally {
            setSyncingCloud(false);
          }
        }}
      >
        {syncingCloud ? "☁️ Buluttan Çekiliyor…" : "☁️ Buluttaki Geçmiş Siparişleri Çek"}
      </button>
      {periodType === "day" && <button className="clear-daily-report" disabled={report.orderCount + expenses.documents.length + returns.documents.length === 0} onClick={() => void clearDailyReport()}>Günlük Raporu Temizle</button>}
    </section>

    <div className="report-kpis five">
      <article><small>TOPLAM SİPARİŞ</small><strong>{report.orderCount.toLocaleString("tr-TR")}</strong><span>adet</span></article>
      <article className="money"><small>SATIŞ GELİRİ</small><strong>{formatMoney(report.amountMinor)}</strong><span>sipariş toplamı</span></article>
      <article className="return-income"><small>İADE PALETİ GELİRİ</small><strong>{formatMoney(returns.amountMinor)}</strong><span>{returns.documents.length} belge · {formatReturnQuantitySummary(returns.byProduct)}</span></article>
      <article className="expense"><small>GELEN MAL / GİDER</small><strong>{formatMoney(expenses.amountMinor)}</strong><span>{expenses.documents.length} belge</span></article>
      <article className={netAmount < 0 ? "net negative" : "net"}><small>NET BAKİYE</small><strong>{formatMoney(netAmount)}</strong><span>satış + iade − gider</span></article>
    </div>

    <div className="document-upload-grid">
      <section className="card expense-upload">
        <div><h2>GELEN MAL FATURASI / PDF</h2><p>Tarih ve genel toplam otomatik okunup gider olarak kaydedilir.</p></div>
        <label className="pdf-button">{pdfLoading ? "PDF okunuyor…" : "Gider PDF Ekle"}<input type="file" accept="application/pdf,.pdf" disabled={pdfLoading} onChange={(event) => { void selectPdf(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </section>
      <section className="card expense-upload return-upload">
        <div><h2>İADE PALETİ / PDF</h2><p>Tutar, tarih, iade edilen ürünler ve miktarları otomatik okunup gelire eklenir.</p></div>
        <label className="pdf-button return-button">{returnPdfLoading ? "PDF okunuyor…" : "İade PDF Ekle"}<input type="file" accept="application/pdf,.pdf" disabled={returnPdfLoading} onChange={(event) => { void selectReturnPdf(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </section>
    </div>
    {expenseDraft && <section className="card expense-draft">
      <div className={`extraction-status ${expenseDraft.status}`}>{expenseDraft.status === "automatic" ? "Otomatik okundu" : "Kontrol gerekli"}</div>
      <label>Tedarikçi / Açıklama<input value={expenseDraft.vendor} onChange={(event) => setExpenseDraft({ ...expenseDraft, vendor: event.target.value, status: "needs_review" })} /></label>
      <label>Belge Tarihi<input type="date" value={expenseDraft.date} onChange={(event) => setExpenseDraft({ ...expenseDraft, date: event.target.value, status: "needs_review" })} /></label>
      <label>Genel Toplam (TL)<input inputMode="decimal" placeholder="0,00" value={expenseDraft.amount} onChange={(event) => setExpenseDraft({ ...expenseDraft, amount: event.target.value, status: "needs_review" })} /></label>
      <button className="save-expense" onClick={() => void saveExpense()}>Gider Kaydını Kaydet</button><button className="cancel-expense" onClick={() => setExpenseDraft(null)}>İptal</button>
    </section>}
    {returnDraft && <section className="card expense-draft return-draft">
      <div className={`extraction-status ${returnDraft.status}`}>{returnDraft.status === "automatic" ? "Otomatik okundu" : "Kontrol gerekli"}</div>
      <label>Firma / Açıklama<input value={returnDraft.description} onChange={(event) => setReturnDraft({ ...returnDraft, description: event.target.value, status: "needs_review" })} /></label>
      <label>Belge Tarihi<input type="date" value={returnDraft.date} onChange={(event) => setReturnDraft({ ...returnDraft, date: event.target.value, status: "needs_review" })} /></label>
      <label>İade Geliri Toplamı (TL)<input inputMode="decimal" placeholder="0,00" value={returnDraft.amount} onChange={(event) => setReturnDraft({ ...returnDraft, amount: event.target.value, status: "needs_review" })} /></label>
      <div className="return-item-editor">
        <div className="return-item-heading"><b>İADE EDİLEN ÜRÜNLER</b><button onClick={() => setReturnDraft({ ...returnDraft, items: [...returnDraft.items, { name: "", quantity: "1", unit: "Adet" }], status: "needs_review" })}>+ Ürün Ekle</button></div>
        {returnDraft.items.map((item, index) => <div className="return-item-row" key={index}>
          <label>Ürün<input placeholder="Ürün adı" value={item.name} onChange={(event) => setReturnDraft(updateReturnDraftItem(returnDraft, index, { name: event.target.value }))} /></label>
          <label>Miktar<input inputMode="decimal" value={item.quantity} onChange={(event) => setReturnDraft(updateReturnDraftItem(returnDraft, index, { quantity: event.target.value }))} /></label>
          <label>Birim<input placeholder="Adet" value={item.unit} onChange={(event) => setReturnDraft(updateReturnDraftItem(returnDraft, index, { unit: event.target.value }))} /></label>
          <button className="delete return-item-delete" title="Ürünü sil" onClick={() => setReturnDraft({ ...returnDraft, items: returnDraft.items.filter((_, itemIndex) => itemIndex !== index), status: "needs_review" })}>Sil</button>
        </div>)}
      </div>
      <div className="return-draft-actions"><button className="save-expense" onClick={() => void saveReturnPallet()}>İade Gelirini Kaydet</button><button className="cancel-expense" onClick={() => setReturnDraft(null)}>İptal</button></div>
    </section>}

    <div className="report-breakdowns">
      <ReportBreakdown title="ARAÇ BAZINDA" rows={report.byVehicle.map((row) => ({ ...row, label: row.key === "unassigned" ? "Atanmamış" : vehicleName(state, row.key) }))} total={report.amountMinor} />
      <ReportBreakdown title="KAYNAK BAZINDA" rows={report.byChannel.map((row) => ({ ...row, label: row.key }))} total={report.amountMinor} />
    </div>

    <h2 className="subheading">ÜRÜN KALEMİ BAZINDA SATIŞ</h2>
    <section className="table-card product-report"><table><thead><tr><th>Ürün</th><th>Sipariş</th><th>Satılan Miktar</th><th className="amount">Dağıtılmış Gelir</th></tr></thead><tbody>
      {report.byProduct.map((product) => <tr key={product.key}><td><b>{product.name}</b></td><td>{product.orderCount}</td><td><b>{formatQuantity(product.quantity)}</b> {product.unit}</td><td className="amount"><b>{formatMoney(product.amountMinor)}</b></td></tr>)}
      {!report.byProduct.length && <tr><td colSpan={4} className="empty">Bu dönemde ayrıştırılabilir ürün kalemi bulunamadı.</td></tr>}
    </tbody></table></section>
    <p className="allocation-note">Tek ürünlü siparişlerde gelir doğrudan ürüne yazılır. Birden fazla ürün bulunan siparişlerde toplam tutar, ürün miktarları oranında dağıtılır; PRM satır bazında fiyat sağlarsa bu hesap daha sonra kesin fiyatla değiştirilebilir.</p>

    <h2 className="subheading">SİPARİŞ KALEMLERİ</h2>
    <section className="table-card report-detail"><table><thead><tr><th>Tarih</th><th>Müşteri</th><th>Araç</th><th>Kaynak</th><th>Sipariş Detayı</th><th className="amount">Tutar</th></tr></thead><tbody>
      {displayedOrders.map((order) => <tr key={order.orderId}><td>{new Date(order.orderCreatedAt).toLocaleString("tr-TR")}{reportingTimestamp(order.orderCreatedAt) !== order.orderCreatedAt && <small>Rapor günü: {new Date(reportingTimestamp(order.orderCreatedAt)).toLocaleDateString("tr-TR")}</small>}</td><td><b title={`Sipariş: ${order.orderId}`}>{order.customerName ?? "İsimsiz Müşteri"}</b></td><td>{order.vehicleId ? vehicleName(state, order.vehicleId) : "Atanmamış"}</td><td><span className="source-badge">{order.channel}</span></td><td className="order-details">{order.details ?? "—"}</td><td className="amount"><b>{formatMoney(order.amountMinor)}</b></td></tr>)}
      {!displayedOrders.length && <tr><td colSpan={6} className="empty">Bu tarih aralığında rapor kaydı bulunamadı. Canlı sipariş tablosunu bir kez açıp yenileyin.</td></tr>}
    </tbody>{report.orders.length > 0 && <tfoot><tr><td colSpan={5}>TOPLAM · {report.orderCount.toLocaleString("tr-TR")} SİPARİŞ</td><td className="amount">{formatMoney(report.amountMinor)}</td></tr></tfoot>}</table></section>
    {pageCount > 1 && <div className="pagination"><button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Önceki</button><span>{page + 1} / {pageCount}</span><button disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Sonraki</button></div>}

    <h2 className="subheading">İADE EDİLEN ÜRÜNLER</h2>
    <section className="table-card return-product-list"><table><thead><tr><th>Ürün</th><th>Belge</th><th className="amount">Toplam İade Miktarı</th></tr></thead><tbody>
      {returns.byProduct.map((product) => <tr key={product.key}><td><b>{product.name}</b></td><td>{product.documentCount.toLocaleString("tr-TR")}</td><td className="amount"><b>{formatQuantity(product.quantity)}</b> {product.unit}</td></tr>)}
      {!returns.byProduct.length && <tr><td colSpan={3} className="empty">Bu tarih aralığında iade edilen ürün kaydı yok.</td></tr>}
    </tbody></table></section>

    <h2 className="subheading">İADE PALETİ / GELİR BELGELERİ</h2>
    <section className="table-card return-list"><table><thead><tr><th>Tarih</th><th>Firma / Açıklama</th><th>İade Edilen Ürünler</th><th>Dosya</th><th>Okuma</th><th className="amount">Gelir</th><th /></tr></thead><tbody>
      {returns.documents.map((document) => <tr key={document.id}><td>{new Date(document.documentDate).toLocaleDateString("tr-TR")}</td><td><b>{document.description}</b></td><td className="return-items">{document.items.map((item, index) => <span key={`${item.name}-${index}`}><b>{formatQuantity(item.quantity)} {item.unit}</b> {item.name}</span>)}</td><td><button className="pdf-link" onClick={() => void openExpensePdf(document.id).then((found) => { if (!found) flash("Arşivlenen PDF bulunamadı."); })}>{document.fileName}</button></td><td><span className={`extraction-status ${document.extractionStatus}`}>{document.extractionStatus === "automatic" ? "Otomatik" : document.extractionStatus === "manual" ? "Manuel" : "Kontrollü"}</span></td><td className="amount"><b>{formatMoney(document.amountMinor)}</b></td><td><button className="delete" onClick={() => void removeReturnPallet(document.id)}>Sil</button></td></tr>)}
      {!returns.documents.length && <tr><td colSpan={7} className="empty">Bu tarih aralığında iade paleti gelir belgesi yok.</td></tr>}
    </tbody><tfoot><tr><td colSpan={5}>TOPLAM İADE PALETİ GELİRİ</td><td className="amount">{formatMoney(returns.amountMinor)}</td><td /></tr></tfoot></table></section>

    <h2 className="subheading">GELEN MAL / GİDER BELGELERİ</h2>
    <section className="table-card expense-list"><table><thead><tr><th>Tarih</th><th>Tedarikçi / Açıklama</th><th>Dosya</th><th>Okuma</th><th className="amount">Tutar</th><th /></tr></thead><tbody>
      {expenses.documents.map((document) => <tr key={document.id}><td>{new Date(document.documentDate).toLocaleDateString("tr-TR")}</td><td><b>{document.vendor}</b></td><td><button className="pdf-link" onClick={() => void openExpensePdf(document.id).then((found) => { if (!found) flash("Arşivlenen PDF bulunamadı."); })}>{document.fileName}</button></td><td><span className={`extraction-status ${document.extractionStatus}`}>{document.extractionStatus === "automatic" ? "Otomatik" : document.extractionStatus === "manual" ? "Manuel" : "Kontrollü"}</span></td><td className="amount"><b>{formatMoney(document.amountMinor)}</b></td><td><button className="delete" onClick={() => void removeExpense(document.id)}>Sil</button></td></tr>)}
      {!expenses.documents.length && <tr><td colSpan={6} className="empty">Bu tarih aralığında gider belgesi yok.</td></tr>}
    </tbody><tfoot><tr><td colSpan={4}>TOPLAM GİDER</td><td className="amount">{formatMoney(expenses.amountMinor)}</td><td /></tr></tfoot></table></section>
    <p className="report-note">18:30'dan sonra (18:31 ve sonrası) gelen siparişler bir sonraki rapor gününe yazılır. Net bakiye satış geliri + iade paleti geliri − gider olarak hesaplanır. Raporlar sipariş numarasıyla tekilleştirilir. PDF'ler ve veriler yalnızca bu tarayıcıda tutulur; son iki yıl ve en fazla 50.000 sipariş saklanır.</p>
  </>;
}

function ReportBreakdown({ title, rows, total }: { title: string; rows: { key: string; label: string; orderCount: number; amountMinor: number }[]; total: number }) {
  return <section className="card report-breakdown"><h2>{title}</h2>{rows.map((row) => <div className="breakdown-row" key={row.key}><div><b>{row.label}</b><small>{row.orderCount.toLocaleString("tr-TR")} sipariş</small></div><div className="breakdown-money"><b>{formatMoney(row.amountMinor)}</b><small>{total > 0 ? `%${((row.amountMinor / total) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "%0"}</small></div></div>)}{!rows.length && <div className="empty">Kayıt yok.</div>}</section>;
}

function vehicleName(state: ExtensionState, id: string): string {
  return state.vehicles.find((vehicle) => vehicle.id === id)?.shortName ?? id;
}

function formatMoney(amountMinor: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amountMinor / 100);
}

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inputDateTimestamp(value: string): number {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12).getTime() : Number.NaN;
}

function formatQuantity(value: number): string {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

function updateReturnDraftItem(draft: ReturnDraft, index: number, patch: Partial<ReturnDraftItem>): ReturnDraft {
  return {
    ...draft,
    status: "needs_review",
    items: draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  };
}

function formatReturnQuantitySummary(products: { quantity: number; unit: string }[]): string {
  if (!products.length) return "ürün kaydı yok";
  const totals = new Map<string, number>();
  for (const product of products) totals.set(product.unit, (totals.get(product.unit) ?? 0) + product.quantity);
  return [...totals.entries()].map(([unit, quantity]) => `${formatQuantity(quantity)} ${unit}`).join(" · ");
}
