# PRM Assistant

PRM Assistant, mevcut web tabanlı PRM sisteminin kaynak koduna veya backend'ine dokunmadan canlı siparişleri izleyen ve teslimatçı atamalarını fail-safe biçimde yöneten Chrome/Edge Manifest V3 eklentisidir.

Varsayılan çalışma modu **Güvenli Mod**'dur. Eklenti bir atamayı ancak sipariş satırı, teslimatçı modalı, kesin araç seçeneği ve kaydetme sonrası tablo sonucu doğrulandığında başarılı kabul eder. Belirsiz, çakışan veya pasif araç eşleşmelerinde otomatik işlem yapmaz.

## Özellikler

- Runtime table-header eşleştirmeli PRM order parser
- `MutationObserver`, ilk-yükleme baseline'ı ve kalıcı duplicate koruması
- Browser autofill sonrası sınırlı retry/cooldown kullanan otomatik login
- Güvenli Mod ve fail-safe Otomatik Atama
- Üç araç için aktif/pasif durumları ve kullanıcı tarafından yönetilen keyword'ler
- Turkish-aware adres normalizasyonu, conflict kontrolü ve learned-address önceliği
- Geçmiş/mevcut doğrulanmış atamalardan sokak, cadde ve site imzalarını otomatik çıkaran özel kural öğrenmesi
- Pasif canonical araçta geçici override'ın öğrenilmemesi
- Shadow DOM içinde çoklu yeni-sipariş kuyruğu
- Tekli PRM modal işlem kuyruğu ve save sonrası tablo doğrulaması
- Desktop notification, MV3 offscreen audio document üzerinden extension alarmı ve Türkçe TTS
- Sipariş geçmişi, sınırlı hata logları, debug ve selector diagnostics
- Günlük, aylık ve özel tarih aralıklı araç/kaynak/sipariş kalemi adet ve tutar raporları
- Ürün kalemi bazında miktar ve dağıtılmış gelir raporu
- Yerel PDF fatura okuma; gider ve iade paleti belgelerini arşivleme; satış + iade geliri − gider net bakiye takibi
- 18:30'dan sonra gelen siparişleri bir sonraki rapor gününe aktaran iş günü kesimi
- JSON export/import ve şema doğrulaması
- Refresh/navigation sonrasında pending assignment doğrulaması
- Opsiyonel, stabil PRM-native manuel teslimatçı değişikliklerinden öğrenme
- Yalnızca ayarlanan WhatsApp grubunu izleyen, duplicate korumalı ve deterministik sipariş parser'ı
- Güvenli/Otomatik WhatsApp aktarımı, kalıcı onay kuyruğu, bildirim, TTS ve araç önerisi
- PRM ürün fiyat listesini İstanbul gününe göre ilk tarayıcı açılışında yenileyen ürün kataloğu
- WhatsApp kodlarını PRM katalog ürünlerine bağlayan fiyat eşleştirmesi; kuruş bazlı toplam ve ürün/kaynak raporları

Adres, telefon, müşteri ve sipariş verileri yalnızca `chrome.storage.local` içinde kalır. Harici sunucu, analytics, CDN veya runtime kod indirme yoktur. Credential veya oturum token'ı saklanmaz.

## Gereksinimler

- Node.js 20+
- npm 10+
- Güncel Chrome veya Edge 116+ (Manifest V3 ve offscreen audio)

## PRM domain ayarlama

Varsayılan manifest yetkili PRM origin'i olan `https://dydoprm.visionplus.com.tr/*` için build edilir. Domain ileride değişirse build öncesinde aşağıdaki yöntemle override edilebilir.

PowerShell:

```powershell
$env:VITE_PRM_ORIGIN = "https://dydoprm.visionplus.com.tr/*"
npm run build
```

Alternatif olarak `.env.example` dosyasını `.env.local` adıyla kopyalayıp değeri değiştirin. Chrome match pattern kullanın; path kısmını `/*` bırakın. Eklenti hiçbir zaman `<all_urls>` istemez. Domain değişikliğinden sonra yeniden build edip eklentiyi yeniden yükleyin.

## Kurulum ve build

```text
npm install
npm run typecheck
npm run test
npm run build
```

Chrome'da:

1. `chrome://extensions` adresini açın.
2. **Developer mode** seçeneğini etkinleştirin.
3. **Load unpacked** seçeneğine basın.
4. Bu repodaki `dist` klasörünü seçin.

Edge'de aynı işlem `edge://extensions` sayfasından yapılır.

## İlk kullanım

1. PRM domainini doğru origin ile build edin.
2. Eklentiyi yükleyin ve PRM sekmesini açın.
3. Popup'ta bağlantının **PRM Bağlı** olduğunu doğrulayın.
4. Options → **Selector Diagnostics** ekranında `Live Order Table`, `Required Columns` ve `Delivery Column` alanlarının `FOUND` olduğunu doğrulayın.
5. Araç durumlarını ve keyword'leri kontrol edin.
6. Gerçek siparişlerde daima önce **Güvenli Mod** ile başlayın.
7. Otomatik Mod'u ancak parser, modal seçimi ve save doğrulaması gerçek PRM'de tekrar tekrar doğrulandıktan sonra kullanıcı olarak açın.

İlk başarılı canlı tablo tespitinde mevcut satırlar baseline'a alınır; alarm, TTS, notification veya popup üretilmez. Sonraki yeni siparişler sipariş numarası üzerinden tespit edilir. `seenOrders` son 30 gün / en fazla 1000 kayıtla sınırlıdır.

## Ürün fiyatları

Options → **Ürün Fiyatları** sayfası PRM'deki `main/product-management/product-price-list` ekranından ürün kodu, ürün adı, birim ve fiyatı alır. Tarayıcı her gün ilk kez açıldığında fiyat sayfası arka plan sekmesinde açılır; tablo sayfalıysa semantik “Sonraki/Next” kontrolüyle bütün sayfalar okunur ve sekme tamamlanınca kapanır. Aynı gün yeniden kontrol için **Fiyatları Şimdi Güncelle** kullanılabilir.

Okuma boş, yarım veya mevcut kataloğa göre şüpheli ölçüde eksikse önceki başarılı katalog korunur ve teknik hata kaydı oluşturulur. Para tutarları kuruş olarak saklanır. İlk canlı kullanımda Options → **Ürün Fiyatları** altında her WhatsApp ürününü doğru PRM katalog satırına bağlayın; fiyat eşleşmeyen siparişler Otomatik Mod'da hiçbir zaman rapora yazılmaz.

## WhatsApp entegrasyonu

1. `https://web.whatsapp.com/` sayfasını açıp oturum açın.
2. Varsayılan **Saka** grubunu açın veya Options → **WhatsApp** bölümünden hedef grup adını değiştirin.
3. Options → **Ürün Fiyatları** bölümünde `19 LT Damacana`, `0.5 LT` ve `1.5 LT` WhatsApp ürünlerini doğru PRM fiyat ürünlerine bağlayın.
4. Önce **Güvenli Mod** kullanın. Yeni mesajlar WhatsApp Web üzerinde popup ve yönetim ekranında kalıcı “Onay Bekleyenler” kaydı oluşturur.
5. Parser ve fiyat eşleşmeleri canlı mesajlarla doğrulandıktan sonra istenirse **Otomatik** moda geçin.

Parser `X tane/adet` ve `X pc` ifadelerini varsayılan ürüne, `X koli 05/0.5/0,5` ifadesini 0.5 LT ürüne, `X paket 1.5/1,5` ifadesini 1.5 LT ürüne çevirir. Ürün ifadesinden önceki rakamlar adresin parçası olarak korunur. Mesaj sonundaki yalın sayı varsayılan olarak kapalıdır. Bilinmeyen metin, adres/fiyat eksikliği veya düşük güven durumunda Otomatik Mod devreye girmez.

Her mesaj tek sipariş olarak raporlanır. Kaynak bazında **WhatsApp**, ürün bazında gerçek miktar ve katalog fiyatından hesaplanan gelir gösterilir. İşlenen son 2000 mesaj fingerprint'i saklanarak DOM yeniden çizimi ve sayfa yenilemesinde duplicate kayıt engellenir.

## Araçlar ve keyword yönetimi

Popup araçların günlük aktif/pasif durumunu değiştirir. Options → **Araç Bölgeleri** sayfasında keyword eklenebilir, düzenlenebilir ve silinebilir. Türkçe büyük/küçük harf, noktalama ve boşluk farkları normalize edilir.

Aynı normalize edilmiş keyword başka araçtaysa kayıt reddedilir. Öğrenilmiş sokak/site kuralları mahalle gibi genel keyword'lerden önce değerlendirilir. Örneğin `Uskumruköy → ARAÇ 3` genel kuralına rağmen `Manolya Sitesi → ARAÇ 1` özel öğrenilmiş kuralı baskın gelir. İki farklı araçta özel kural eşleşirse karar `conflict` olur ve otomatik atama yapılmaz. Daha önce kullanıcı tarafından doğrulanmış tam learned address hepsinden önce değerlendirilir.

Bahçeköy adresli siparişlerde siparişin oluşturma saati öncelikli özel kuraldır: 08:30 ve öncesi ile 18:00'dan sonrası `ARAÇ 3`e, 08:30'dan sonra 18:00 dâhil olmak üzere `ARAÇ 1`e yönlendirilir. Oluşturma saati okunamazsa siparişin eklenti tarafından algılandığı yerel saat kullanılır. Hedef araç pasifse otomatik atama yapılmaz.

## Güvenli Mod

Yeni sipariş için eşleşme önerilir ve PRM sayfasının sağ altında Shadow DOM popup'ı gösterilir. Kullanıcı önerilen veya farklı aktif aracı seçer. Eklenti yalnızca hedef sipariş satırındaki teslimatçı alanını açar, modalı bekler, gerçek PRM option text'ini tam eşleştirir, kaydeder ve aynı satırdaki teslimatçı metninden doğrular.

## Otomatik Mod

Yalnızca şu koşulların tamamında otomatik atama yapılır:

- DOM gerekli header'larla uyumlu,
- tek ve kesin learned/keyword eşleşmesi var,
- canonical araç aktif,
- gerçek PRM option text'i tam bulundu,
- sipariş satırı işlem boyunca mevcut,
- kaydetme sonucu tablodan doğrulandı.

Koşullardan biri sağlanmazsa eklenti işlem yapmaz ve manuel seçim ister.

## Otomatik login ve güvenlik ekranları

Eklenti username veya password saklamaz. Login sayfasında tarayıcının autofill ettiği iki alan da doluysa Angular form modelini `input/change` olaylarıyla senkronize eder ve semantik `Giriş` butonuna hemen basar. Alanlar henüz hazır değilse kısa ve kontrollü kontroller yapar. Başarısız giriş döngüsünü önlemek için iki dakikada en fazla üç gerçek tıklama yapılır. CAPTCHA, MFA, SMS veya doğrulama kodu algılanırsa otomasyon durur.

## Selector yapılandırması

Gerçek PRM DOM'u bu repo hazırlanırken mevcut olmadığı için selector adaptörü merkezi tutulur:

- `src/prm/selectors.ts`: semantic selector adayları
- `src/prm/constants.ts`: Türkçe header/button alias'ları ve gerekli kolonlar
- `src/prm/domUtils.ts`: görünür metin, label/role/button/option yardımcıları
- `src/content/orderParser.ts`: header → column map ve row parser
- `src/content/assignmentAutomation.ts`: hedef-satır modal akışı ve doğrulama

CSS class veya `nth-child` uydurulmamıştır. Gerçek PRM güncellendiğinde önce diagnostics ekranını kullanın; mümkünse `aria-label`, role, label ve görünen metin adaylarını merkezi dosyalara ekleyin. Atama adaptörünü değiştirdiğinizde DOM fixture testlerini de güncelleyin.

## Öğrenme ve geçici override

Güvenli Mod'da onaylanan, manuel olarak seçilen veya Otomatik Mod'da başarıyla doğrulanan adresler ayar açıkken öğrenilir. Canonical araç pasifken başka araca yapılan atama geçici yönlendirmedir; canonical learned mapping değiştirilmez. Options ekranından learned kayıtların aracı düzenlenebilir veya kayıt silinebilir.

PRM'nin kendi arayüzünde yapılan teslimatçı değişikliklerinden öğrenme toggle'ı bulunur. Değişiklik 750 ms stabil kaldığında, araç adı tanımlı PRM araçlarından biriyle eşleştiğinde ve aynı sipariş için extension assignment pending olmadığında öğrenilir. Pasif canonical araç koruması bu akışta da uygulanır.

## Bildirimler ve ses

Alarm ve adres TTS ayrı ayrı açılıp kapatılabilir. Ses seviyesi Options sayfasından ayarlanır. TTS, `chrome.tts` ile `tr-TR` kullanır. “Test Sesi” alarmı, Türkçe TTS'yi ve masaüstü test bildirimini birlikte doğrular. Notification'a tıklamak son tespit edilen PRM sekmesini ve penceresini odaklar. Bir kanal hata verirse diğer ses/bildirim kanalları çalışmaya devam eder.

## Backup / import

Options → **Ayarlar & Yedek** üzerinden settings, vehicles, keyword'ler ve learned addresses JSON olarak dışa aktarılır. Import yalnızca desteklenen `schemaVersion` ve zorunlu araç alanları doğrulandıktan sonra uygulanır. Sipariş history'si, loglar ve müşteri verileri backup'a dahil edilmez.

## Debugging

Debug Mode açıkken anlamlı `[PRM Assistant]` logları console'a yazılabilir; kalıcı teknik kayıtlar Options → **Sipariş Geçmişi** altında görünür ve 500 kayıtla sınırlıdır. DOM uyumsuzsa runtime sağlık durumu `dom_incompatible` olur, bildirim gösterilir ve atama yapılmaz.

## Testler

```text
npm run typecheck
npm run test
npm run build
```

Vitest testleri adres normalizasyonu, keyword conflict, learned-address önceliği, inactive araç, unknown/conflict kararları, temporary override ve duplicate sipariş davranışını kapsar. `tests/fixtures/live-orders.html`, kolon sırası değiştirilmiş canlı sipariş tablosu ile teslimatçı modalını simüle eder; parser, exact option selection, save doğrulaması ve dropdown bulunamadığında fail-safe davranış test edilir.

## Mimari

```text
src/background      service worker, notification/TTS, runtime state
src/content         page detection, login, parser, observer, overlay, assignment queue
src/core            saf karar, normalization, matching ve learning motorları
src/notifications   alarm, TTS ve desktop notification abstraction'ları
src/options         yönetim, history, backup ve diagnostics UI
src/popup           günlük operasyon UI
src/prm             merkezi semantic selector registry ve DOM helpers
src/shared          typed model ve message bus
src/storage         schema, migration, sınırlama ve backup
tests               unit testler ve DOM integration fixture
```

## Bilinen entegrasyon noktası

Production kodu ve build hazırdır; ancak gerçek PRM domaini ve DOM'u verilmediğinden canlı selector doğrulaması bilinçli olarak yapılmamıştır. İlk canlı kullanımda [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md) izlenmeli ve Auto Mode açılmadan önce Safe Mode senaryoları tamamlanmalıdır.
