package com.dydo.prmassistant.data.models

data class DriverAccount(
    val username: String,
    val displayName: String,
    val assignedVehicle: String, // "ARAÇ 1", "ARAÇ 2", "ARAÇ 3", veya "ALL" (Tüm araçlar)
    val password: String
)

object CloudConfig {
    var supabaseUrl: String = "https://ufmrmxggkxfcgnbqzwon.supabase.co"
    var supabaseAnonKey: String = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbXJteGdna3hmY2duYnF6d29uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NzU1MDAsImV4cCI6MjEwOTI1MTUwMH0.qjpwDbwIG6mjg6Lm2A66U0DsQrLCu0Wm9fes5mgdjeo"
    var userEmail: String = "emirhnnozcn@gmail.com"
    var isLoggedIn: Boolean = false
    var notificationsEnabled: Boolean = true

    // =========================================================================
    // 🚚 SÜRÜCÜ & ARAÇ HESAPLARI (ŞİFRELERİ AŞAĞIDAN KOLAYCA DEĞİŞTİREBİLİRSİNİZ)
    // =========================================================================
    val DRIVER_ACCOUNTS = listOf(
        // Araç 1 Sürücüsü:
        DriverAccount(
            username = "mehmetali",
            displayName = "Mehmet Ali (Araç 1)",
            assignedVehicle = "ARAÇ 1",
            password = "123" // <-- ARAÇ 1 ŞİFRESİ
        ),
        // Araç 2 Sürücüsü:
        DriverAccount(
            username = "volkan",
            displayName = "Volkan (Araç 2)",
            assignedVehicle = "ARAÇ 2",
            password = "123" // <-- ARAÇ 2 ŞİFRESİ
        ),
        // Araç 3 Sürücüsü:
        DriverAccount(
            username = "mehmet",
            displayName = "Mehmet (Araç 3)",
            assignedVehicle = "ARAÇ 3",
            password = "123" // <-- ARAÇ 3 ŞİFRESİ
        ),
        // Tüm Araçları Görebilen Yönetici (Admin) Hesabı:
        DriverAccount(
            username = "admin",
            displayName = "Yönetici (Tüm Araçlar)",
            assignedVehicle = "ALL",
            password = "admin" // <-- YÖNETİCİ ŞİFRESİ
        )
    )

    // Giriş yapan aktif sürücü hesabı (null ise giriş yapılmamıştır)
    var currentDriver: DriverAccount? = null

    val DEFAULT_VEHICLES = listOf(
        Vehicle(id = "vehicle1", shortName = "ARAÇ 1", prmName = "İSTANBUL-ZEKERİYAKÖY ARAÇ 1"),
        Vehicle(id = "vehicle2", shortName = "ARAÇ 2", prmName = "İSTANBUL-ZEKERİYAKÖY ARAÇ 2"),
        Vehicle(id = "vehicle3", shortName = "ARAÇ 3", prmName = "İSTANBUL-ZEKERİYAKÖY ARAÇ 3")
    )
}
