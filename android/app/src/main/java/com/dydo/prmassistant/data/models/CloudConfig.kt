package com.dydo.prmassistant.data.models

object CloudConfig {
    // Güvenlik: Canlı anahtarlarınızı .env dosyasından veya yerel yapılandırmadan manuel giriniz
    var supabaseUrl: String = "YOUR_SUPABASE_URL"
    var supabaseAnonKey: String = "YOUR_SUPABASE_ANON_KEY"
    var userEmail: String = "YOUR_USER_EMAIL"
    var isLoggedIn: Boolean = false
    var notificationsEnabled: Boolean = true

    val DEFAULT_VEHICLES = listOf(
        Vehicle(id = "vehicle1", shortName = "ARAÇ 1", prmName = "İSTANBUL-ZEKERİYAKÖY ARAÇ 1"),
        Vehicle(id = "vehicle2", shortName = "ARAÇ 2", prmName = "İSTANBUL-ZEKERİYAKÖY ARAÇ 2"),
        Vehicle(id = "vehicle3", shortName = "ARAÇ 3", prmName = "İSTANBUL-ZEKERİYAKÖY ARAÇ 3")
    )
}
