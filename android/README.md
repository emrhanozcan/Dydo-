# DyDo PRM Assistant - Android Mobil Uygulaması (Kotlin & Supabase)

Bu mobil uygulama, DyDo PRM Assistant Chrome eklentisiyle **Supabase** veritabanı üzerinden çift yönlü senkronize çalışan modern bir Kotlin (Jetpack Compose) Android uygulamasıdır.

## 🚀 Özellikler

1. **Anlık Sipariş Bildirimleri:**
   - DyDo PRM web sistemine yeni bir sipariş düştüğünde, masaüstü eklenti siparişi Supabase veritabanına yazar.
   - Telefonunuza anında sesli ve titreşimli yüksek öncelikli bildirim (`🔔 Yeni Supabase Siparişi: [Müşteri Adı]`) gelir.
   - Bildirime dokunarak doğrudan sipariş detayına gidebilirsiniz.
   - Arka planda `WorkManager` periyodik kontrol mekanizması aktiftir.

2. **Canlı Sipariş Yönetimi & 1-Dokunuşla Araç Atama:**
   - Gelen siparişlerin müşteri adı, telefon numarası, açık adresi, sepet detayları, tutarı ve atanmış aracı anlık olarak listelenir.
   - Her sipariş kartının altında bulunan **[ 🚚 ARAÇ 1 ]**, **[ 🚚 ARAÇ 2 ]**, **[ 🚚 ARAÇ 3 ]** butonlarına dokunarak siparişi anında araca aktarabilirsiniz.
   - Mobilden bir araca dokunduğunuzda atama Supabase üzerinden masaüstü eklentiye iletilir ve web sisteminde araç anında değiştirilir.

3. **Günlük Raporlar:**
   - Günlük toplam sipariş adedi.
   - Toplam ciro (TL).
   - Araç bazlı sipariş dağılımı (Araç 1, Araç 2, Araç 3).

4. **Ortak Hesap Girişi:**
   - `.env` dosyasında belirlediğiniz e-posta (`emirhnnozcn@gmail.com`) ve şifre ile hem eklentide hem mobil uygulamada oturum açılır.

---

## 🛠 Supabase Kurulum Adımları

1. [Supabase](https://supabase.com) üzerinde ücretsiz bir proje oluşturun.
2. Proje ana dizinindeki `supabase_schema.sql` dosyasının içeriğini kopyalayın.
3. Supabase Dashboard -> **SQL Editor** kısmına yapıştırıp **Run** butonuna basın. (Gerekli tüm `orders`, `remote_assignments` ve `reports` tabloları otomatik oluşturulacaktır).
4. Supabase Dashboard -> **Project Settings** -> **API** alanından:
   - **Project URL**
   - **anon / public key**
   bilgilerini alıp kök dizindeki `.env` dosyasına (`VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY`) yapıştırın.

---

## 📱 Android Studio'da Çalıştırma

1. **Android Studio** programını açın.
2. `File` > `Open` seçeneğiyle `c:\Projeler\DyDo\DyDoExtension-main\android` klasörünü açın.
3. Gradle senkronizasyonu tamamlandıktan sonra Android telefonunuzu bağlayın ve sağ üstteki yeşil **Run (Çalıştır ▶)** butonuna basın.
