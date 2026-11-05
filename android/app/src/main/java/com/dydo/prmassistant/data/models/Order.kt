package com.dydo.prmassistant.data.models

data class Order(
    val id: String,
    val secondaryId: String = "",
    val customerName: String = "Müşteri",
    val phone: String = "",
    val rawAddress: String,
    val normalizedAddress: String = "",
    val details: String = "",
    val amount: String = "0,00",
    val paymentType: String = "",
    val status: String = "Bekliyor",
    val currentVehicle: String = "Atanmadı",
    val createdAt: String = "",
    val updatedAt: Long = System.currentTimeMillis()
) {
    val createdAtEpoch: Long
        get() {
            if (createdAt.isBlank()) return updatedAt
            return try {
                val clean = createdAt.trim()
                val parts = clean.split(" ")
                val dateParts = parts[0].split(".")
                val timeParts = parts.getOrNull(1)?.split(":") ?: listOf("0", "0")
                val day = dateParts[0].toInt()
                val month = dateParts[1].toInt() - 1
                val year = dateParts[2].toInt()
                val hour = timeParts[0].toInt()
                val min = timeParts[1].toInt()
                val sec = timeParts.getOrNull(2)?.toInt() ?: 0
                val cal = java.util.Calendar.getInstance()
                cal.set(year, month, day, hour, min, sec)
                cal.timeInMillis
            } catch (e: Exception) {
                updatedAt
            }
        }
    val displayAmount: String
        get() {
            val clean = amount.trim()
            return if (clean.contains("TL", ignoreCase = true) || clean.contains("₺")) {
                clean
            } else {
                "$clean TL"
            }
        }
}

fun parseAmountToKurus(amountStr: String?): Long {
    if (amountStr.isNullOrBlank()) return 0L
    val clean = amountStr.replace("TL", "", ignoreCase = true)
        .replace("₺", "")
        .trim()
    if (!clean.any { it.isDigit() }) return 0L

    val comma = clean.lastIndexOf(',')
    val dot = clean.lastIndexOf('.')
    val sep = maxOf(comma, dot)

    return if (sep >= 0 && (clean.length - sep - 1) in 1..2) {
        // Virgülden veya noktadan sonra 1 veya 2 basamak var (kuruş)
        val intPart = clean.substring(0, sep).filter { it.isDigit() }.ifEmpty { "0" }.toLong()
        val decPart = clean.substring(sep + 1).filter { it.isDigit() }.padEnd(2, '0').take(2).toLong()
        intPart * 100L + decPart
    } else {
        // Ondalık basamak yok, doğrudan tam lira
        val intPart = clean.filter { it.isDigit() }.ifEmpty { "0" }.toLong()
        intPart * 100L
    }
}

data class Vehicle(
    val id: String,
    val shortName: String,
    val prmName: String,
    val active: Boolean = true
)

data class VehicleStat(
    val id: String,
    val name: String,
    val count: Int
)

data class ReportSummary(
    val totalOrders: Int = 0,
    val totalRevenueMinor: Long = 0L,
    val vehicleStats: List<VehicleStat> = emptyList(),
    val lastUpdated: Long = System.currentTimeMillis()
) {
    val formattedRevenue: String
        get() {
            val lira = totalRevenueMinor / 100.0
            val symbols = java.text.DecimalFormatSymbols(java.util.Locale("tr", "TR"))
            val df = java.text.DecimalFormat("#,##0.00 TL", symbols)
            return df.format(lira)
        }
}

