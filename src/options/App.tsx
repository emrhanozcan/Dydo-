import { useEffect, useMemo, useState } from "react";
import { addKeyword } from "../core/keywordRules";
import { normalizeAddress } from "../core/addressNormalizer";
import { resolveWhatsAppProductPrice } from "../whatsapp/whatsappMessageParser";
import { MESSAGE, sendMessage } from "../shared/messages";
import type { ExtensionState, Settings } from "../shared/types";
import { createBackup, parseBackup } from "../storage/backup";
import { getState, updateState } from "../storage/storage";
import { loginCloud, logoutCloud } from "../cloud/cloudSync";
import { Reports } from "./Reports";

type Tab = "reports" | "whatsapp" | "prices" | "vehicles" | "learned" | "history" | "settings" | "diagnostics" | "cloud";
const TABS: Tab[] = ["reports", "whatsapp", "prices", "vehicles", "learned", "history", "settings", "diagnostics", "cloud"];

export function App() {
  const [state, setViewState] = useState<ExtensionState | null>(null);
  const hashTab = location.hash.slice(1) as Tab;
  const [tab, setTab] = useState<Tab>(TABS.includes(hashTab) ? hashTab : "vehicles");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  async function refresh() { setViewState(await getState()); }
  async function mutate(fn: (current: ExtensionState) => void) {
    await updateState(fn); await broadcastChange(); await refresh();
  }
  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 3500); }
  if (!state) return <div className="loading">Yükleniyor…</div>;

  return (
    <div className="shell">
      <aside>
        <div className="logo"><span>P</span><div><b>PRM Assistant</b><small>Yönetim Merkezi</small></div></div>
        <nav>
          <Nav id="reports" current={tab} set={setTab}>Raporlar</Nav>
          <Nav id="whatsapp" current={tab} set={setTab}>WhatsApp</Nav>
          <Nav id="prices" current={tab} set={setTab}>Ürün Fiyatları</Nav>
          <Nav id="vehicles" current={tab} set={setTab}>Araç Bölgeleri</Nav>
          <Nav id="learned" current={tab} set={setTab}>Öğrenilmiş Adresler</Nav>
          <Nav id="history" current={tab} set={setTab}>Sipariş Geçmişi</Nav>
          <Nav id="settings" current={tab} set={setTab}>Ayarlar & Yedek</Nav>
          <Nav id="cloud" current={tab} set={setTab}>Bulut & Mobil</Nav>
          <Nav id="diagnostics" current={tab} set={setTab}>Selector Diagnostics</Nav>
        </nav>
        <div className="privacy">🔒 Verileriniz güvende ve senkronizedir.</div>
      </aside>
      <main>
        {notice && <div className="notice">{notice}</div>}
        {tab === "reports" && <Reports state={state} mutate={mutate} flash={flash} />}
        {tab === "whatsapp" && <WhatsAppDashboard state={state} mutate={mutate} refresh={refresh} flash={flash} />}
        {tab === "prices" && <ProductPrices state={state} mutate={mutate} refresh={refresh} flash={flash} />}
        {tab === "vehicles" && <Vehicles state={state} mutate={mutate} flash={flash} />}
        {tab === "learned" && <Learned state={state} mutate={mutate} />}
        {tab === "history" && <History state={state} />}
        {tab === "settings" && <SettingsPanel state={state} mutate={mutate} refresh={refresh} flash={flash} />}
        {tab === "cloud" && <CloudPanel state={state} refresh={refresh} flash={flash} />}
        {tab === "diagnostics" && <Diagnostics state={state} />}
      </main>
    </div>
  );
}

function Nav({ id, current, set, children }: { id: Tab; current: Tab; set: (tab: Tab) => void; children: string }) {
  return <button className={id === current ? "active" : ""} onClick={() => { location.hash = id; set(id); }}>{children}</button>;
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <header><h1>{title}</h1><p>{subtitle}</p></header>;
}

function ProductPrices({ state, mutate, refresh, flash }: PanelProps & { refresh: () => Promise<void>; flash: (message: string) => void }) {
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState(false);
  const products = useMemo(() => Object.values(state.productPrices)
    .filter((product) => `${product.productCode ?? ""} ${product.productName} ${product.unit ?? ""}`.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")))
    .sort((left, right) => left.productName.localeCompare(right.productName, "tr-TR")), [state.productPrices, search]);
  const sync = state.productPriceSync;

  async function syncNow() {
    setStarting(true);
    try {
      const response = await sendMessage({ type: MESSAGE.SYNC_PRODUCT_PRICES, force: true });
      if (!response.ok) throw new Error(response.error ?? "Fiyat kontrolü başlatılamadı.");
      await refresh();
      flash("Ürün fiyat sayfası arka planda açıldı. Liste okununca bu ekran otomatik güncellenecek.");
    } catch (error) {
      flash(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }

  return <>
    <PageTitle title="Ürün Fiyatları" subtitle="PRM ürün fiyat listesinden alınan güncel katalog. WhatsApp sipariş tutarları bu katalogdan hesaplanır." />
    <section className="card price-sync-card">
      <div>
        <span className={`sync-badge ${sync.status}`}>{syncStatusLabel(sync.status)}</span>
        <h2>{sync.lastProductCount} ürün</h2>
        <p>Son başarılı kontrol: {formatDateTime(sync.lastSuccessAt)}</p>
        {sync.lastPageCount ? <p>{sync.lastPageCount} liste sayfası okundu.</p> : null}
        {sync.lastError && <p className="sync-error">{sync.lastError}</p>}
      </div>
      <button className="primary-action" disabled={starting || sync.status === "syncing"} onClick={() => void syncNow()}>
        {starting || sync.status === "syncing" ? "Kontrol ediliyor…" : "Fiyatları Şimdi Güncelle"}
      </button>
    </section>
    <div className="price-toolbar">
      <input className="search" placeholder="Ürün adı, kodu veya birim ara…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <a href={sync.sourceUrl} target="_blank" rel="noreferrer">PRM fiyat listesini aç</a>
    </div>
    <section className="table-card"><table><thead><tr><th>Ürün Kodu</th><th>Ürün</th><th>Birim</th><th>Fiyat</th><th>Güncellendi</th></tr></thead><tbody>
      {products.map((product) => <tr key={product.id}><td>{product.productCode ?? "—"}</td><td><b>{product.productName}</b></td><td>{product.unit ?? "—"}</td><td><b className="money">{formatMoney(product.priceMinor)}</b><small>{product.rawPrice}</small></td><td>{formatDateTime(product.updatedAt)}</td></tr>)}
      {!products.length && <tr><td colSpan={5} className="empty">{search ? "Aramayla eşleşen ürün bulunamadı." : "Henüz ürün fiyatı alınmadı. Fiyatları Şimdi Güncelle düğmesini kullanın."}</td></tr>}
    </tbody></table></section>
    <WhatsAppProducts state={state} mutate={mutate} flash={flash} />
    <p className="hint">Otomatik kontrol İstanbul saatine göre günde bir kez, tarayıcının ilk açılışında yapılır. Okuma tamamlanamazsa önceki başarılı fiyatlar korunur.</p>
  </>;
}

function WhatsAppProducts({ state, mutate, flash }: PanelProps & { flash: (message: string) => void }) {
  const catalog = Object.values(state.productPrices).sort((left, right) => left.productName.localeCompare(right.productName, "tr-TR"));
  async function addAlias(productId: string) {
    const alias = window.prompt("Yeni WhatsApp kodu")?.trim();
    if (!alias) return;
    const normalized = normalizeAddress(alias);
    const owner = state.whatsappProducts.find((product) => product.id !== productId && product.aliases.some((item) => normalizeAddress(item) === normalized));
    if (owner) { flash(`"${alias}" kodu ${owner.name} için zaten kullanılıyor.`); return; }
    await mutate((current) => { current.whatsappProducts.find((product) => product.id === productId)?.aliases.push(alias); });
  }
  async function editAlias(productId: string, oldAlias: string) {
    const alias = window.prompt("WhatsApp kodunu düzenle", oldAlias)?.trim();
    if (!alias || alias === oldAlias) return;
    const normalized = normalizeAddress(alias);
    const owner = state.whatsappProducts.find((product) => product.id !== productId && product.aliases.some((item) => normalizeAddress(item) === normalized));
    if (owner) { flash(`"${alias}" kodu ${owner.name} için zaten kullanılıyor.`); return; }
    await mutate((current) => { const target = current.whatsappProducts.find((item) => item.id === productId); if (target) target.aliases = target.aliases.map((item) => item === oldAlias ? alias : item); });
  }
  async function addProduct() {
    const name = window.prompt("Ürün adı")?.trim();
    if (!name) return;
    const unit = window.prompt("Birim: adet, koli veya paket", "adet")?.trim().toLocaleLowerCase("tr-TR");
    if (unit !== "adet" && unit !== "koli" && unit !== "paket") { flash("Birim adet, koli veya paket olmalı."); return; }
    await mutate((current) => { current.whatsappProducts.push({ id: `wa-product-${crypto.randomUUID()}`, name, unit, aliases: [], isDefault: false, active: true }); });
  }
  return <>
    <div className="section-title-row"><h2 className="subheading">WHATSAPP ÜRÜNLERİ & KODLARI</h2><button className="primary-action compact" onClick={() => void addProduct()}>+ Ürün Ekle</button></div>
    <div className="wa-product-grid">{state.whatsappProducts.map((product) => <section className="card wa-product-card" key={product.id}>
      <div className="card-title"><input className="product-name-input" value={product.name} onChange={(event) => void mutate((current) => { const target = current.whatsappProducts.find((item) => item.id === product.id); if (target) target.name = event.target.value; })} /><SettingToggle label="Aktif" value={product.active} set={(value) => void mutate((current) => { const target = current.whatsappProducts.find((item) => item.id === product.id); if (target) target.active = value; })} /></div>
      <label>PRM fiyat ürünü<select value={product.priceProductId ?? ""} onChange={(event) => void mutate((current) => { const target = current.whatsappProducts.find((item) => item.id === product.id); if (target) target.priceProductId = event.target.value || undefined; })}><option value="">Otomatik tam-ad eşleşmesi</option>{catalog.map((price) => <option key={price.id} value={price.id}>{price.productCode ? `${price.productCode} · ` : ""}{price.productName} · {formatMoney(price.priceMinor)}</option>)}</select></label>
      <div className="linked-price">Birim fiyat: <b>{resolveWhatsAppProductPrice(product, state.productPrices) > 0 ? formatMoney(resolveWhatsAppProductPrice(product, state.productPrices)) : "Eşleşme gerekli"}</b></div>
      <label>Birim<select value={product.unit} onChange={(event) => void mutate((current) => { const target = current.whatsappProducts.find((item) => item.id === product.id); if (target) target.unit = event.target.value as typeof target.unit; })}><option value="adet">Adet</option><option value="koli">Koli</option><option value="paket">Paket</option></select></label>
      <label className="default-radio"><input type="radio" name="default-product" checked={product.isDefault} onChange={() => void mutate((current) => { current.whatsappProducts.forEach((item) => { item.isDefault = item.id === product.id; }); current.whatsappSettings.defaultProductId = product.id; })} /> Varsayılan WhatsApp ürünü</label>
      <div className="chips">{product.aliases.map((alias) => <span className="chip" key={alias}>{alias}<button title="Düzenle" onClick={() => void editAlias(product.id, alias)}>✎</button><button title="Sil" onClick={() => void mutate((current) => { const target = current.whatsappProducts.find((item) => item.id === product.id); if (target) target.aliases = target.aliases.filter((item) => item !== alias); })}>×</button></span>)}</div>
      <button className="secondary-action" onClick={() => void addAlias(product.id)}>+ Kod Ekle</button>
    </section>)}</div>
  </>;
}

function WhatsAppDashboard({ state, mutate, refresh, flash }: PanelProps & { refresh: () => Promise<void>; flash: (message: string) => void }) {
  const runtime = state.whatsappRuntime;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayOrders = Object.values(state.reportOrders).filter((order) => order.channel === "WhatsApp" && order.orderCreatedAt >= today.getTime());
  async function review(fingerprint: string, action: "approve" | "ignore") {
    const response = await sendMessage({ type: MESSAGE.REVIEW_WHATSAPP_ORDER, fingerprint, action });
    if (!response.ok) flash(response.error ?? "İşlem tamamlanamadı.");
    await refresh();
  }
  async function reconnect() {
    const response = await sendMessage({ type: MESSAGE.RECONNECT_WHATSAPP });
    if (!response.ok) flash(response.error ?? "WhatsApp bağlantısı yenilenemedi.");
    else flash("WhatsApp entegrasyonu yeniden bağlanıyor; sekme bir kez yenilenebilir.");
    window.setTimeout(() => void refresh(), 1_500);
  }
  async function edit(fingerprint: string) {
    const order = state.pendingWhatsAppOrders.find((item) => item.messageId === fingerprint);
    if (!order) return;
    const address = window.prompt("Adresi düzenle", order.rawAddress)?.trim();
    if (!address) return;
    const items = order.items.map((item) => {
      const productName = window.prompt("Ürün adı", item.productName)?.trim() || item.productName;
      const configured = state.whatsappProducts.find((product) => normalizeAddress(product.name) === normalizeAddress(productName));
      const unitInput = window.prompt(`${productName} birimi: adet, koli veya paket`, configured?.unit ?? item.unitType)?.trim().toLocaleLowerCase("tr-TR");
      const unitType = unitInput === "adet" || unitInput === "koli" || unitInput === "paket" ? unitInput : configured?.unit ?? item.unitType;
      const quantity = Number(window.prompt(`${productName} miktarı`, String(item.quantity)) ?? item.quantity);
      const catalogPrice = configured ? resolveWhatsAppProductPrice(configured, state.productPrices) : item.unitPrice;
      const priceLira = Number((window.prompt(`${productName} birim fiyatı (TL)`, String((catalogPrice || item.unitPrice) / 100).replace(".", ",")) ?? String((catalogPrice || item.unitPrice) / 100)).replace(",", "."));
      return { ...item, productId: configured?.id ?? item.productId, productName, unitType, quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : item.quantity, unitPrice: Number.isFinite(priceLira) && priceLira >= 0 ? Math.round(priceLira * 100) : item.unitPrice };
    }).map((item) => ({ ...item, totalPrice: item.quantity * item.unitPrice }));
    await mutate((current) => {
      const target = current.pendingWhatsAppOrders.find((item) => item.messageId === fingerprint);
      if (!target) return;
      target.rawAddress = address; target.normalizedAddress = normalizeAddress(address); target.items = items;
      target.totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0); target.totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);
      target.confidence = "high"; target.warnings = [];
    });
    flash("Sipariş düzenlendi; onay bekliyor.");
  }
  return <>
    <PageTitle title="WhatsApp Entegrasyonu" subtitle="Yalnızca belirlenen gruptaki yeni sipariş mesajları güvenli biçimde işlenir." />
    <div className="wa-kpis"><article className="card"><small>DURUM</small><b>{runtime.targetGroupActive ? `🟢 ${runtime.activeGroupName} grubu izleniyor` : runtime.pageDetected ? `🟡 WhatsApp açık · hedef grup aktif değil` : runtime.tabFound ? "🟡 WhatsApp açık · entegrasyon yeniden bağlanıyor" : "🔴 WhatsApp Web bulunamadı"}</b></article><article className="card"><small>BUGÜNKÜ SİPARİŞ</small><b>{todayOrders.length}</b></article><article className="card"><small>BUGÜNKÜ GELİR</small><b>{formatMoney(todayOrders.reduce((sum, order) => sum + order.amountMinor, 0))}</b></article><article className="card"><small>ONAY BEKLEYEN</small><b>{state.pendingWhatsAppOrders.length}</b></article></div>
    {!runtime.pageDetected && <div className="reconnect-row"><button className="primary-action" onClick={() => void reconnect()}>WhatsApp Bağlantısını Yenile</button></div>}
    <section className="card settings-grid wa-settings">
      <SettingToggle label="WhatsApp Takibi" value={state.whatsappSettings.enabled} set={(value) => void mutate((current) => { current.whatsappSettings.enabled = value; })} />
      <label>İzlenecek Grup<input value={state.whatsappSettings.targetGroupName} onChange={(event) => void mutate((current) => { current.whatsappSettings.targetGroupName = event.target.value; })} /></label>
      <label>Sipariş Aktarım Modu<select value={state.whatsappSettings.mode} onChange={(event) => { const mode = event.target.value as "safe" | "auto"; if (mode === "auto" && !window.confirm("Otomatik mod yalnızca yüksek güvenli, adresi ve tüm fiyatları eksiksiz siparişleri doğrudan rapora ekler. Güvenli Mod testleri tamamlandı mı?")) return; void mutate((current) => { current.whatsappSettings.mode = mode; }); }}><option value="safe">Güvenli Mod</option><option value="auto">Otomatik</option></select></label>
      <label>Varsayılan miktar ifadeleri<input value={state.whatsappSettings.defaultQuantityWords.join(", ")} onChange={(event) => { const words = event.target.value.split(",").map((item) => item.trim()).filter(Boolean); void mutate((current) => { current.whatsappSettings.defaultQuantityWords = words; }); }} /></label>
      <SettingToggle label="Sondaki tek sayıyı damacana say" value={state.whatsappSettings.bareNumberAsDefaultProduct} set={(value) => void mutate((current) => { current.whatsappSettings.bareNumberAsDefaultProduct = value; })} />
      <SettingToggle label="Desktop Notification" value={state.whatsappSettings.notificationEnabled} set={(value) => void mutate((current) => { current.whatsappSettings.notificationEnabled = value; })} />
      <SettingToggle label="WhatsApp Sipariş Sesi" value={state.whatsappSettings.voiceEnabled} set={(value) => void mutate((current) => { current.whatsappSettings.voiceEnabled = value; })} />
    </section>
    <h2 className="subheading">ONAY BEKLEYENLER</h2>
    <div className="pending-wa-list">{state.pendingWhatsAppOrders.map((order) => <section className="card pending-wa" key={order.messageId}><div><h3>{order.rawAddress || "Adres bulunamadı"}</h3><small>{order.sender ? `Gönderen: ${order.sender} · ` : ""}{order.confidence.toUpperCase()}</small></div><div>{order.items.map((item) => <p key={item.productId}><b>{item.quantity} {item.unitType}</b> {item.productName} · {item.unitPrice ? formatMoney(item.totalPrice) : "fiyat eksik"}</p>)}</div>{order.warnings.map((warning) => <p className="sync-error" key={warning}>{warning}</p>)}<strong>Toplam: {formatMoney(order.totalAmount)}</strong><div className="pending-actions"><button className="primary-action compact" onClick={() => void review(order.messageId, "approve")}>Rapora Ekle</button><button onClick={() => void edit(order.messageId)}>Düzenle</button><button className="delete" onClick={() => void review(order.messageId, "ignore")}>Sipariş Değil</button></div></section>)}{!state.pendingWhatsAppOrders.length && <section className="card empty">Onay bekleyen WhatsApp siparişi yok.</section>}</div>
  </>;
}

function Vehicles({ state, mutate, flash }: PanelProps & { flash: (message: string) => void }) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  async function add(vehicleId: string) {
    const keyword = inputs[vehicleId]?.trim(); if (!keyword) return;
    try {
      await mutate((current) => { current.vehicles = addKeyword(current.vehicles, vehicleId, keyword); });
      setInputs((current) => ({ ...current, [vehicleId]: "" }));
    } catch (error) { flash(error instanceof Error ? error.message : String(error)); }
  }
  async function edit(vehicleId: string, oldKeyword: string) {
    const next = window.prompt("Anahtar kelimeyi düzenle", oldKeyword)?.trim(); if (!next || next === oldKeyword) return;
    try {
      await mutate((current) => {
        const without = current.vehicles.map((vehicle) => vehicle.id === vehicleId ? { ...vehicle, keywords: vehicle.keywords.filter((item) => item !== oldKeyword) } : vehicle);
        current.vehicles = addKeyword(without, vehicleId, next);
      });
    } catch (error) { flash(error instanceof Error ? error.message : String(error)); }
  }
  return <>
    <PageTitle title="Araç Bölgeleri" subtitle="Araç durumlarını ve adres eşleştirme anahtar kelimelerini yönetin." />
    <div className="vehicle-grid">{state.vehicles.map((vehicle) => <section className="card" key={vehicle.id}>
      <div className="card-title"><div><h2>{vehicle.shortName}</h2><small>{vehicle.prmName}</small></div><label className="status-toggle"><input type="checkbox" checked={vehicle.active} onChange={(event) => mutate((current) => { const target = current.vehicles.find((item) => item.id === vehicle.id); if (target) target.active = event.target.checked; })} />{vehicle.active ? "Çalışıyor" : "Çalışmıyor"}</label></div>
      <div className="chips">{vehicle.keywords.map((keyword) => <span className="chip" key={`manual-${keyword}`}>{keyword}<button title="Düzenle" onClick={() => edit(vehicle.id, keyword)}>✎</button><button title="Sil" onClick={() => mutate((current) => { const target = current.vehicles.find((item) => item.id === vehicle.id); if (target) target.keywords = target.keywords.filter((item) => item !== keyword); })}>×</button></span>)}</div>
      {vehicle.learnedKeywords.length > 0 && <><h3 className="learned-title">ÖĞRENİLEN SOKAK / SİTELER</h3><div className="chips">{vehicle.learnedKeywords.map((keyword) => <span className="chip learned" key={`learned-${keyword}`}>{keyword}<small>öğrenildi</small><button title="Sil" onClick={() => mutate((current) => { const target = current.vehicles.find((item) => item.id === vehicle.id); if (target) target.learnedKeywords = target.learnedKeywords.filter((item) => item !== keyword); })}>×</button></span>)}</div></>}
      <div className="add"><input value={inputs[vehicle.id] ?? ""} placeholder="Yeni anahtar kelime" onChange={(event) => setInputs((current) => ({ ...current, [vehicle.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void add(vehicle.id); }} /><button onClick={() => add(vehicle.id)}>Ekle</button></div>
    </section>)}</div>
  </>;
}

function Learned({ state, mutate }: PanelProps) {
  const [search, setSearch] = useState("");
  const entries = useMemo(() => state.learnedAddresses.filter((entry) => entry.rawExample.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR"))), [state.learnedAddresses, search]);
  return <>
    <PageTitle title="Öğrenilmiş Adresler" subtitle="Onaylanmış atamalardan oluşan kalıcı adres–araç eşleşmeleri." />
    <input className="search" placeholder="Adres ara…" value={search} onChange={(event) => setSearch(event.target.value)} />
    <section className="table-card"><table><thead><tr><th>Adres</th><th>Araç</th><th>Kullanım</th><th>Kaynak</th><th /></tr></thead><tbody>
      {entries.map((entry) => <tr key={entry.id}><td><b>{entry.rawExample}</b><small>{entry.normalizedAddress}</small></td><td><select value={entry.vehicleId} onChange={(event) => mutate((current) => { const target = current.learnedAddresses.find((item) => item.id === entry.id); if (target) { target.vehicleId = event.target.value; target.updatedAt = Date.now(); } })}>{state.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.shortName}</option>)}</select></td><td>{entry.useCount}</td><td>{entry.source}</td><td><button className="delete" onClick={() => mutate((current) => { current.learnedAddresses = current.learnedAddresses.filter((item) => item.id !== entry.id); })}>Sil</button></td></tr>)}
      {!entries.length && <tr><td colSpan={5} className="empty">Kayıt bulunamadı.</td></tr>}
    </tbody></table></section>
  </>;
}

function History({ state }: { state: ExtensionState }) {
  const [source, setSource] = useState<"all" | "prm" | "whatsapp">("all");
  const entries = state.orderHistory.filter((entry) => source === "all" || (source === "whatsapp" ? entry.orderId.startsWith("wa_") : !entry.orderId.startsWith("wa_")));
  return <>
    <PageTitle title="Sipariş Geçmişi" subtitle="Atama kararları, doğrulama sonuçları ve teknik kayıtlar." />
    <label className="history-filter">Kaynak<select value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="all">Tümü</option><option value="prm">PRM</option><option value="whatsapp">WhatsApp</option></select></label>
    <section className="table-card"><table><thead><tr><th>Zaman</th><th>Sipariş / Adres</th><th>Öneri</th><th>Atanan</th><th>Sonuç</th></tr></thead><tbody>
      {entries.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString("tr-TR")}</td><td><b>{entry.orderId}</b><small>{entry.address}</small></td><td>{vehicleName(state, entry.suggestedVehicleId)}</td><td>{vehicleName(state, entry.assignedVehicleId)}</td><td><span className={`result ${entry.result}`}>{entry.result}</span><small>{entry.reason}</small></td></tr>)}
      {!entries.length && <tr><td colSpan={5} className="empty">Bu filtrede sipariş işlemi yok.</td></tr>}
    </tbody></table></section>
    <h2 className="subheading">TEKNİK HATA KAYITLARI</h2>
    <section className="table-card"><table><tbody>{state.logs.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleTimeString("tr-TR")}</td><td><span className={`level ${entry.level}`}>{entry.level}</span></td><td><b>{entry.code}</b><small>{entry.message}</small></td><td>{entry.orderId}</td></tr>)}</tbody></table></section>
  </>;
}

function SettingsPanel({ state, mutate, refresh, flash }: PanelProps & { refresh: () => Promise<void>; flash: (message: string) => void }) {
  async function importFile(file?: File) {
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      await mutate((current) => { current.settings = backup.settings; current.vehicles = backup.vehicles; current.learnedAddresses = backup.learnedAddresses; if (backup.whatsappSettings) current.whatsappSettings = backup.whatsappSettings; if (backup.whatsappProducts) current.whatsappProducts = backup.whatsappProducts; });
      flash("Yedek başarıyla içe aktarıldı.");
    } catch (error) { flash(error instanceof Error ? error.message : String(error)); }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(createBackup(state), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `prm-assistant-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <>
    <PageTitle title="Ayarlar & Yedek" subtitle="Bildirim, öğrenme ve güvenlik davranışlarını yapılandırın." />
    <section className="card settings-grid">
      <SettingToggle label="PRM Assistant aktif" value={state.settings.enabled} set={(value) => setSetting(mutate, "enabled", value)} />
      <SettingToggle label="Otomatik Login" value={state.settings.automaticLogin} set={(value) => setSetting(mutate, "automaticLogin", value)} />
      <SettingToggle label="Desktop Notification" value={state.settings.desktopNotifications} set={(value) => setSetting(mutate, "desktopNotifications", value)} />
      <SettingToggle label="Alarm Sesi" value={state.settings.alarmSound} set={(value) => setSetting(mutate, "alarmSound", value)} />
      <SettingToggle label="Adres Seslendirme" value={state.settings.addressSpeech} set={(value) => setSetting(mutate, "addressSpeech", value)} />
      <SettingToggle label="Adresleri Öğren" value={state.settings.learnAddresses} set={(value) => setSetting(mutate, "learnAddresses", value)} />
      <SettingToggle label="PRM manuel atamalarından öğren" value={state.settings.learnNativeAssignments} set={(value) => setSetting(mutate, "learnNativeAssignments", value)} />
      <SettingToggle label="Debug Mode" value={state.settings.debugMode} set={(value) => setSetting(mutate, "debugMode", value)} />
      <label>Atama Modu<select value={state.settings.assignmentMode} onChange={(event) => {
        const mode = event.target.value as Settings["assignmentMode"];
        if (mode === "automatic" && !window.confirm("Auto Mode kesin eşleşmelerde kullanıcı onayı olmadan atama yapar. Safe Mode canlı testleri tamamlandı mı?")) { event.target.value = state.settings.assignmentMode; return; }
        setSetting(mutate, "assignmentMode", mode);
      }}><option value="safe">Güvenli Mod</option><option value="automatic">Otomatik Atama</option></select></label>
      <label>Ses Seviyesi <b>%{Math.round(state.settings.volume * 100)}</b><input type="range" min="0" max="1" step="0.05" value={state.settings.volume} onChange={(event) => setSetting(mutate, "volume", Number(event.target.value))} /></label>
      <label>Maksimum Geçmiş<input type="number" min="50" max="5000" value={state.settings.maximumHistory} onChange={(event) => setSetting(mutate, "maximumHistory", Math.max(50, Number(event.target.value)))} /></label>
    </section>
    <div className="button-row"><button className="primary" onClick={() => sendMessage({ type: MESSAGE.TEST_VOICE })}>Test Sesi</button><button onClick={exportData}>Ayarları Dışa Aktar</button><label className="file-button">Ayarları İçe Aktar<input type="file" accept="application/json" onChange={(event) => void importFile(event.target.files?.[0])} /></label></div>
  </>;
}

function Diagnostics({ state }: { state: ExtensionState }) {
  const diagnostics = state.runtime.diagnostics ?? {};
  const labels: Record<string, string> = { loginButton: "Login Button", loginUsernameFound: "Login Username Field", loginUsernameFilled: "Username Autofill", loginPasswordFound: "Login Password Field", loginPasswordFilled: "Password Autofill", liveOrderTable: "Live Order Table", requiredColumns: "Required Columns", deliveryColumn: "Delivery Column", deliveryModal: "Delivery Modal", deliveryCombobox: "Delivery Combobox", saveButton: "Save Button", securityChallenge: "Security Challenge", automaticLoginFailed: "Automatic Login" };
  return <>
    <PageTitle title="Selector Diagnostics" subtitle="Gerçek PRM DOM adaptörünün son sağlık kontrolü." />
    <section className="card diagnostics"><div className="health-line"><b>PRM Sağlığı</b><span>{state.runtime.health}</span></div>{Object.entries(labels).map(([key, label]) => <div key={key}><span>{label}</span><b className={diagnostics[key] ? "found" : "missing"}>{diagnostics[key] ? "FOUND" : "NOT FOUND"}</b></div>)}</section>
    <h2 className="subheading">WHATSAPP WEB</h2>
    <section className="card diagnostics">{[
      ["Page Detected", state.whatsappRuntime.pageDetected],
      ["Active Chat Header", Boolean(state.whatsappRuntime.activeGroupName)],
      [`Target Group · ${state.whatsappSettings.targetGroupName}`, state.whatsappRuntime.targetGroupActive],
      ["Message Container", state.whatsappRuntime.messageContainerFound],
      ["Latest Message", state.whatsappRuntime.latestMessageFound],
      ["Message Text", state.whatsappRuntime.messageTextFound],
      ["Sender", state.whatsappRuntime.senderFound],
      ["Timestamp", state.whatsappRuntime.timestampFound],
    ].map(([label, found]) => <div key={String(label)}><span>{label}</span><b className={found ? "found" : "missing"}>{found ? "FOUND" : "NOT FOUND"}</b></div>)}</section>
    <p className="hint">Modal alanları yalnızca teslimatçı modalı açıkken FOUND görünür. Gerçek DOM değişirse yalnızca <code>src/prm/selectors.ts</code>, <code>constants.ts</code> ve gerekirse semantic helper katmanını güncelleyin.</p>
  </>;
}

function CloudPanel({ state, refresh, flash }: { state: ExtensionState; refresh: () => Promise<void>; flash: (msg: string) => void }) {
  const [email, setEmail] = useState(state.cloudAccount?.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await loginCloud(email, password);
    setLoading(false);
    await refresh();
    if (res.success) {
      flash("Bulut hesabına başarıyla giriş yapıldı! Canlı veriler mobil uygulamayla senkronize ediliyor.");
    } else {
      flash(res.error || "Giriş başarısız.");
    }
  }

  async function handleLogout() {
    await logoutCloud();
    await refresh();
    flash("Bulut hesabından çıkış yapıldı.");
  }

  async function toggleAutoSync(checked: boolean) {
    await updateState((s) => {
      s.cloudAccount.autoSync = checked;
    });
    await refresh();
  }

  const account = state.cloudAccount;

  return <>
    <PageTitle title="Bulut & Mobil Senkronizasyon" subtitle="Canlı siparişleri, araç atamalarını ve günlük raporları Android mobil uygulamanızla anlık senkronize edin." />

    {account?.isLoggedIn ? (
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span className="sync-badge success">● Bulut Bağlantısı Aktif</span>
            <h2 style={{ marginTop: 8 }}>{account.email}</h2>
            <p>Son Senkronizasyon: {account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleTimeString("tr-TR") : "Henüz yok"}</p>
            <p>Buluta Aktarılan Sipariş Sayısı: <b>{account.syncedOrdersCount || 0}</b></p>
          </div>
          <button className="button danger" onClick={() => void handleLogout()}>Çıkış Yap</button>
        </div>

        <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid #e2e8f0" }} />

        <label className="setting-toggle" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            <b>Canlı Siparişleri Otomatik Senkronize Et</b>
            <small style={{ display: "block", color: "#64748b" }}>Gelen her yeni siparişi anında mobil uygulamaya ve bildirim servisine iletir.</small>
          </span>
          <input
            type="checkbox"
            checked={account.autoSync}
            onChange={(e) => void toggleAutoSync(e.target.checked)}
          />
        </label>
      </section>
    ) : (
      <section className="card" style={{ maxWidth: 480 }}>
        <h2>Bulut Hesabı Girişi</h2>
        <p style={{ color: "#64748b", marginBottom: 16 }}>
          Mobil uygulamada da aynı hesapla oturum açarak siparişleri telefonunuzdan anlık yönetebilirsiniz.
        </p>
        <form onSubmit={(e) => void handleLogin(e)} style={{ display: "grid", gap: 12 }}>
          <label>
            <b>Kullanıcı E-Posta:</b>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@dydo.com"
              style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 6, border: "1px solid #cbd5e1" }}
            />
          </label>
          <label>
            <b>Şifre:</b>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: "100%", padding: 8, marginTop: 4, borderRadius: 6, border: "1px solid #cbd5e1" }}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="primary"
            style={{ padding: "10px 16px", borderRadius: 8, fontWeight: "bold" }}
          >
            {loading ? "Giriş Yapılıyor…" : "Bulut Hesabına Giriş Yap"}
          </button>
        </form>
      </section>
    )}

    <section className="card" style={{ marginTop: 20 }}>
      <h3>📱 Kotlin Mobil Uygulama Bilgileri</h3>
      <p>Proje dizininde yer alan <code>android/</code> klasöründeki Kotlin Android uygulamasını Android Studio ile derleyip telefonunuza yükleyebilirsiniz.</p>
      <ul style={{ paddingLeft: 20, marginTop: 8, lineHeight: 1.6, color: "#334155" }}>
        <li><b>Anlık Bildirimler (FCM):</b> Masaüstü eklenti yeni siparişi yakaladığı anda telefonunuza yüksek öncelikli sesli bildirim düşer.</li>
        <li><b>Mobil Araç Atama:</b> Telefonda siparişe tek dokunuşla (Araç 1, Araç 2, Araç 3) atama yapabilirsiniz; eklenti arka planda PRM sisteminde bu seçimi kaydeder.</li>
        <li><b>Günlük Raporlar:</b> Gün boyunca çıkan damacana ve araç dağılımlarını mobilden canlı takip edebilirsiniz.</li>
      </ul>
    </section>
  </>;
}

interface PanelProps { state: ExtensionState; mutate: (fn: (state: ExtensionState) => void) => Promise<void> }
function SettingToggle({ label, value, set }: { label: string; value: boolean; set: (value: boolean) => void }) { return <label className="setting-toggle"><span>{label}</span><input type="checkbox" checked={value} onChange={(event) => set(event.target.checked)} /></label>; }
function setSetting<K extends keyof Settings>(mutate: PanelProps["mutate"], key: K, value: Settings[K]) { void mutate((state) => { state.settings[key] = value; }); }
function syncStatusLabel(status: ExtensionState["productPriceSync"]["status"]): string { return ({ idle: "Henüz kontrol edilmedi", syncing: "Kontrol ediliyor", success: "Güncel", error: "Kontrol başarısız" })[status]; }
function formatMoney(valueMinor: number): string { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(valueMinor / 100); }
function formatDateTime(value?: number): string { return value ? new Date(value).toLocaleString("tr-TR") : "—"; }
function vehicleName(state: ExtensionState, id?: string) { return id ? state.vehicles.find((vehicle) => vehicle.id === id)?.shortName ?? id : "—"; }
async function broadcastChange() { const tabs = await chrome.tabs.query({}); await Promise.all(tabs.filter((tab) => tab.id).map(async (tab) => { try { await chrome.tabs.sendMessage(tab.id!, { type: MESSAGE.STATE_CHANGED }); } catch { /* ignore */ } })); }
