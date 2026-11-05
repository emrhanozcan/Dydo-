import { useEffect, useState } from "react";
import { MESSAGE } from "../shared/messages";
import type { ExtensionState, Settings } from "../shared/types";
import { getState, updateState } from "../storage/storage";
import { logoutCloud } from "../cloud/cloudSync";
import { LoginPage } from "./LoginPage";

const HEALTH_LABEL = {
  connected: "PRM Bağlı",
  login_page: "Giriş Sayfası",
  tab_not_found: "PRM Sekmesi Bulunamadı",
  dom_incompatible: "DOM Uyumsuz",
};

export function App() {
  const [state, setViewState] = useState<ExtensionState | null>(null);

  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  async function refresh() { setViewState(await getState()); }
  async function mutate(mutator: (current: ExtensionState) => void) {
    await updateState(mutator);
    await notifyTabs();
    await refresh();
  }
  if (!state) return <main className="loading">Yükleniyor…</main>;

  // Kullanıcı giriş yapmamışsa şık Login ekranını göster
  if (!state.cloudAccount?.isLoggedIn) {
    return (
      <main className="popup login-view">
        <LoginPage onSuccess={async () => { await refresh(); await notifyTabs(); }} />
      </main>
    );
  }

  const statusClass = state.runtime.health === "connected" ? "ok" : state.runtime.health === "login_page" ? "warn" : "bad";
  return (
    <main className="popup">
      {/* Kullanıcı Oturum Bilgisi & Çıkış */}
      <div className="user-account-bar">
        <div className="user-info">
          <span className="user-icon">👤</span>
          <span className="user-email">{state.cloudAccount.email}</span>
        </div>
        <button
          className="btn-logout"
          title="Oturumu Kapat"
          onClick={async () => {
            if (window.confirm("Bulut oturumunu kapatmak istediğinize emin misiniz?")) {
              await logoutCloud();
              await refresh();
              await notifyTabs();
            }
          }}
        >
          Çıkış Yap
        </button>
      </div>

      <header><div className="brandmark">D</div><div><h1>PRM ASSISTANT</h1><p>Güvenli sipariş otomasyonu</p></div></header>
      <section className="status">
        <div><span className={`dot ${statusClass}`} />{HEALTH_LABEL[state.runtime.health]}</div>
        <small>Son kontrol: {formatTime(state.runtime.lastCheckAt)}</small>
        <small>Son sipariş: {state.runtime.lastOrderId ?? "—"}</small>
      </section>
      <section className="status">
        <div><span className={`dot ${state.whatsappRuntime.targetGroupActive ? "ok" : state.whatsappRuntime.pageDetected ? "warn" : "bad"}`} />WhatsApp</div>
        <small>{state.whatsappRuntime.targetGroupActive ? `${state.whatsappRuntime.activeGroupName} grubu izleniyor` : state.whatsappRuntime.pageDetected ? "WhatsApp açık; hedef grup aktif değil" : state.whatsappRuntime.tabFound ? "WhatsApp açık; entegrasyon yeniden bağlanıyor" : "WhatsApp Web bulunamadı"}</small>
        <small>Onay bekleyen: {state.pendingWhatsAppOrders.length}</small>
      </section>

      <section className="status">
        <div><span className={`dot ${state.cloudAccount?.isLoggedIn ? "ok" : "warn"}`} />Bulut & Mobil</div>
        <small>{state.cloudAccount?.isLoggedIn ? `Bağlı: ${state.cloudAccount.email}` : "Bulut hesabı bağlı değil"}</small>
        <small>Senkronize: {state.cloudAccount?.syncedOrdersCount || 0} sipariş</small>
      </section>

      <Section title="ARAÇLAR">
        {state.vehicles.map((vehicle) => (
          <label className="row" key={vehicle.id}>
            <span><b>{vehicle.shortName}</b><small>{vehicle.active ? "Çalışıyor" : "Çalışmıyor"}</small></span>
            <Switch checked={vehicle.active} onChange={(active) => mutate((current) => {
              const target = current.vehicles.find((item) => item.id === vehicle.id); if (target) target.active = active;
            })} />
          </label>
        ))}
      </Section>

      <Section title="OTOMASYON">
        <Toggle label="PRM Assistant aktif" setting="enabled" settings={state.settings} mutate={mutate} />
        <Toggle label="Otomatik Login" setting="automaticLogin" settings={state.settings} mutate={mutate} />
        <Toggle label="Yeni Sipariş Alarmı" setting="alarmSound" settings={state.settings} mutate={mutate} />
        <Toggle label="Adresi Sesli Oku" setting="addressSpeech" settings={state.settings} mutate={mutate} />
      </Section>

      <Section title="ARAÇ ATAMA">
        <div className="mode">
          <button className={state.settings.assignmentMode === "safe" ? "selected" : ""} onClick={() => mutate((current) => { current.settings.assignmentMode = "safe"; })}>● Güvenli Mod</button>
          <button className={state.settings.assignmentMode === "automatic" ? "selected danger" : ""} onClick={() => {
            if (window.confirm("Otomatik Mod, kesin eşleşmiş aktif araçlarda kullanıcı onayı beklemeden PRM ataması yapar. Safe Mode testlerini tamamladınız mı?")) void mutate((current) => { current.settings.assignmentMode = "automatic"; });
          }}>● Otomatik Atama</button>
        </div>
        {state.settings.assignmentMode === "automatic" && <p className="caution">Yalnızca kesin eşleşmiş ve aktif araçlara otomatik atama yapılır.</p>}
      </Section>

      <div style={{ margin: "14px 0 10px 0" }}>
        <button
          onClick={() => openOptionsTab("learned")}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            color: "#38bdf8",
            border: "1px solid #38bdf8",
            borderRadius: 10,
            padding: "10px",
            fontWeight: "bold",
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          🎓 Adres & Araç Öğrenme Modülü ({Object.keys(state.customerPreferences || {}).length})
        </button>
      </div>

      <nav>
        <button onClick={() => openOptionsTab("reports")}>Raporlar</button>
        <button onClick={() => openOptionsTab("whatsapp")}>WhatsApp</button>
        <button onClick={() => openOptionsTab("prices")}>Ürün Fiyatları</button>
        <button onClick={() => openOptionsTab("vehicles")}>Araç Bölgeleri</button>
        <button onClick={() => openOptionsTab("learned")}>Öğrenilmiş Adresler</button>
        <button onClick={() => openOptionsTab("cloud")}>Bulut & Mobil</button>
        <button onClick={() => openOptionsTab("history")}>Geçmiş ve Ayarlar</button>
      </nav>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="section"><h2>{title}</h2>{children}</section>;
}

function Toggle({ label, setting, settings, mutate }: {
  label: string; setting: keyof Pick<Settings, "enabled" | "automaticLogin" | "alarmSound" | "addressSpeech">; settings: Settings;
  mutate: (fn: (state: ExtensionState) => void) => Promise<void>;
}) {
  return <label className="row"><span>{label}</span><Switch checked={settings[setting]} onChange={(checked) => mutate((state) => { state.settings[setting] = checked; })} /></label>;
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <input className="switch" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />;
}

function formatTime(value?: number): string { return value ? new Date(value).toLocaleTimeString("tr-TR") : "—"; }

async function notifyTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter((tab) => tab.id).map(async (tab) => {
    try { await chrome.tabs.sendMessage(tab.id!, { type: MESSAGE.STATE_CHANGED }); } catch { /* PRM dışı sekme */ }
  }));
}

function openOptionsTab(tab: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#${tab}`) });
}
