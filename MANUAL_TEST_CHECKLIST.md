# MANUAL TEST CHECKLIST

## Build ve izinler

- [ ] `VITE_PRM_ORIGIN` yalnızca yetkili gerçek PRM origin'ine ayarlandı.
- [ ] `npm run typecheck`, `npm run test` ve `npm run build` başarılı.
- [ ] `dist` unpacked extension olarak yüklendi.
- [ ] Extension izinlerinde gereksiz `<all_urls>` veya dış domain yok.

## İlk canlı kontrol — yalnızca Safe Mode

- [ ] Popup'ta **Güvenli Mod** seçili.
- [ ] Üç aracın aktif/pasif durumları operasyon gününe uygun.
- [ ] PRM sekmesinde health **PRM Bağlı**.
- [ ] Diagnostics'te live table ve required columns `FOUND`.
- [ ] Mevcut siparişler baseline'a alındı; ses, notification veya overlay çıkmadı.
- [ ] Yeni siparişte alarm, Türkçe adres TTS, desktop notification ve Shadow DOM popup çıktı.
- [ ] Notification tıklanınca doğru PRM sekmesi odaklandı.

## Login

- [ ] Tarayıcı username/password alanlarını doldurduğunda Giriş butonuna bir kez basıldı.
- [ ] Alanlar boşken butona basılmadı ve sonsuz retry oluşmadı.
- [ ] CAPTCHA/MFA/SMS ekranında otomatik işlem yapılmadı.

## Eşleştirme güvenliği

- [ ] Bilinen keyword doğru aracı önerdi.
- [ ] Bilinmeyen adres manuel seçim istedi.
- [ ] İki araç conflict durumunda atama yapılmadı.
- [ ] Pasif canonical araçta otomatik atama yapılmadı; yalnızca aktif araçlar manuel gösterildi.
- [ ] Pasif canonical araçtan geçici yönlendirme, canonical learned mapping'i değiştirmedi.

## PRM atama adaptörü

- [ ] Yalnızca hedef sipariş satırındaki teslimatçı kontrolü açıldı.
- [ ] Doğru teslimatçı modalı bulundu.
- [ ] Araç option'ı gerçek PRM tam metniyle seçildi.
- [ ] Kaydet sonrası aynı satırdaki teslimatçı değeri doğrulandı.
- [ ] Dropdown/option/save kaldırıldığında yanlış elemente tıklanmadı ve işlem failed oldu.
- [ ] Aynı anda birkaç sipariş geldiğinde modal işlemleri sırayla yapıldı.
- [ ] Refresh/navigation sırasında pending işlem success sayılmadı; dönüşte tablo üzerinden doğrulandı.

## Öğrenme, history ve backup

- [ ] Safe Mode onayı learned address oluşturdu.
- [ ] Sonraki aynı adres keyword'den önce learned kayıtla eşleşti.
- [ ] Learned kayıt düzenlendi ve silindi.
- [ ] History ve error log doğru sonuç/reason gösterdi.
- [ ] JSON export alındı; export müşteri/sipariş history'si içermiyor.
- [ ] Geçerli backup import edildi, bozuk/schema uyumsuz backup reddedildi.

## Auto Mode'a geçiş kapısı

- [ ] Yukarıdaki Safe Mode senaryoları gerçek siparişlerde tekrarlı biçimde doğrulandı.
- [ ] Operasyon sorumlusu Auto Mode'u bilinçli olarak açtı.
- [ ] Kesin ve aktif eşleşme kullanıcı onayı olmadan atandı ve tablodan doğrulandı.
- [ ] Unknown, conflict, inactive araç ve DOM uyumsuzluk senaryolarında Auto Mode fail-safe kaldı.

## Ürün fiyatları ve WhatsApp

- [ ] Tarayıcının gün içindeki ilk açılışında PRM ürün fiyat sayfası arka planda açıldı ve tamamlanınca kapandı.
- [ ] Options → Ürün Fiyatları ekranında bütün sayfalardaki ürünler, kodlar, birimler ve Türkçe fiyatlar doğru göründü.
- [ ] Yarım/boş tablo senaryosunda önceki başarılı fiyat kataloğu silinmedi.
- [ ] Üç varsayılan WhatsApp ürünü doğru PRM fiyat satırlarına bağlandı.
- [ ] Yalnızca ayarlanan Saka grubu aktifken yeni mesaj işlendi; başka sohbetler işlenmedi.
- [ ] `2 tane`, `2 pc`, `2 koli 05` ve `1 paket 1.5` kalıpları doğru ürün ve miktara dönüştü.
- [ ] Adres içindeki blok/no/daire rakamları miktar sayılmadı; yalın son sayı ayarı kapalıyken işlenmedi.
- [ ] Güvenli Mod siparişi WhatsApp popup'ında ve Onay Bekleyenler listesinde kalıcı gösterdi.
- [ ] Düşük güvenli, bilinmeyen metinli veya fiyatı eksik mesaj Auto Mode'da rapora yazılmadı.
- [ ] Onaylanan tek WhatsApp mesajı raporda +1 sipariş, WhatsApp kaynağı ve doğru ürün/fiyat toplamını oluşturdu.
- [ ] Aynı mesaj DOM'a yeniden eklendiğinde ikinci rapor kaydı oluşmadı.
