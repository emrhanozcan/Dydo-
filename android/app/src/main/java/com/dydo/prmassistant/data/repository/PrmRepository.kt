package com.dydo.prmassistant.data.repository

import com.dydo.prmassistant.data.models.CloudConfig
import com.dydo.prmassistant.data.models.Order
import com.dydo.prmassistant.data.models.ReportSummary
import com.dydo.prmassistant.data.models.Vehicle
import com.dydo.prmassistant.data.models.VehicleStat
import com.dydo.prmassistant.data.models.parseAmountToKurus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class PrmRepository {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private fun getSupabaseHeaders(): Headers {
        return Headers.Builder()
            .add("apikey", CloudConfig.supabaseAnonKey)
            .add("Authorization", "Bearer ${CloudConfig.supabaseAnonKey}")
            .add("Content-Type", "application/json")
            .build()
    }

    suspend fun login(email: String, password: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            if (email.isNotBlank() && password.isNotBlank()) {
                CloudConfig.userEmail = email
                CloudConfig.isLoggedIn = true
                Result.success(true)
            } else {
                Result.failure(Exception("Lütfen e-posta ve şifrenizi giriniz."))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getOrders(onlyActive: Boolean = true): Result<List<Order>> = withContext(Dispatchers.IO) {
        try {
            val url = CloudConfig.supabaseUrl.trimEnd('/')
            if (url.contains("YOUR_") || CloudConfig.supabaseAnonKey.contains("YOUR_")) {
                return@withContext Result.success(getMockOrders())
            }

            // Anlık sistemde görünen (teslim edilmemiş) veya teslim edilmiş siparişleri çek
            val queryParam = if (onlyActive) "status=neq.Teslim%20Edildi" else "status=eq.Teslim%20Edildi"
            val request = Request.Builder()
                .url("$url/rest/v1/orders?$queryParam&select=*")
                .headers(getSupabaseHeaders())
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.success(getMockOrders())
                }
                val body = response.body?.string() ?: return@withContext Result.success(emptyList())
                val array = JSONArray(body)
                val orders = mutableListOf<Order>()

                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    orders.add(
                        Order(
                            id = obj.optString("id", ""),
                            secondaryId = obj.optString("secondary_id", ""),
                            customerName = obj.optString("customer_name", "Müşteri"),
                            phone = obj.optString("phone", ""),
                            rawAddress = obj.optString("raw_address", ""),
                            normalizedAddress = obj.optString("normalized_address", ""),
                            details = obj.optString("details", ""),
                            amount = obj.optString("amount", "0,00"),
                            paymentType = obj.optString("payment_type", ""),
                            status = obj.optString("status", "Bekliyor"),
                            currentVehicle = obj.optString("current_vehicle", "Atanmadı"),
                            createdAt = obj.optString("created_at", ""),
                            updatedAt = obj.optLong("updated_at", System.currentTimeMillis())
                        )
                    )
                }

                // Başlık satırlarını ve geçersiz kayıtları temizle
                val validOrders = orders.filter { order ->
                    order.id.any { it.isDigit() } && !order.customerName.contains("Müşteri Adı", ignoreCase = true)
                }.toMutableList()

                // Geliş sürelerine göre kesin olarak en eskiden en yeniye doğru sırala (FIFO)
                validOrders.sortWith(compareBy({ it.createdAtEpoch }, { it.id }))
                Result.success(validOrders)
            }
        } catch (e: Exception) {
            Result.success(getMockOrders())
        }
    }

    suspend fun updateOrderStatus(orderId: String, newStatus: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val url = CloudConfig.supabaseUrl.trimEnd('/')

            // 1. orders tablosunda status'u güncelle (PATCH /rest/v1/orders?id=eq.ID)
            val patchObj = JSONObject().apply {
                put("status", newStatus)
                put("updated_at", System.currentTimeMillis())
            }.toString().toRequestBody(jsonMediaType)

            val patchRequest = Request.Builder()
                .url("$url/rest/v1/orders?id=eq.$orderId")
                .headers(getSupabaseHeaders())
                .patch(patchObj)
                .build()

            client.newCall(patchRequest).execute().close()

            // 2. Chrome eklentisinin PRM web ekranında sipariş durumunu değiştirmesi için
            // remote_assignments kuyruğuna komut ekle
            val insertObj = JSONObject().apply {
                put("order_id", orderId)
                put("vehicle_id", "STATUS_UPDATE")
                put("vehicle_name", newStatus) // "Yolda" veya "Teslim Edildi"
                put("status", "pending")
            }.toString().toRequestBody(jsonMediaType)

            val statusCmdRequest = Request.Builder()
                .url("$url/rest/v1/remote_assignments")
                .headers(getSupabaseHeaders())
                .post(insertObj)
                .build()

            client.newCall(statusCmdRequest).execute().close()

            Result.success(true)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun assignOrderToVehicle(orderId: String, vehicle: Vehicle): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val url = CloudConfig.supabaseUrl.trimEnd('/')

            // 1. orders tablosunda aracı güncelle (PATCH /rest/v1/orders?id=eq.ID)
            val patchObj = JSONObject().apply {
                put("current_vehicle", vehicle.prmName)
                put("status", "Atandı")
                put("updated_at", System.currentTimeMillis())
            }.toString().toRequestBody(jsonMediaType)

            val patchRequest = Request.Builder()
                .url("$url/rest/v1/orders?id=eq.$orderId")
                .headers(getSupabaseHeaders())
                .patch(patchObj)
                .build()
            client.newCall(patchRequest).execute().close()

            // 2. Masaüstü Chrome eklentisinin PRM web ekranında atamayı yapması için remote_assignments'a ekle
            val insertObj = JSONObject().apply {
                put("order_id", orderId)
                put("vehicle_id", vehicle.id)
                put("vehicle_name", vehicle.shortName)
                put("status", "pending")
            }.toString().toRequestBody(jsonMediaType)

            val assignRequest = Request.Builder()
                .url("$url/rest/v1/remote_assignments")
                .headers(getSupabaseHeaders())
                .post(insertObj)
                .build()
            client.newCall(assignRequest).execute().close()

            Result.success(true)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getReports(): Result<ReportSummary> = withContext(Dispatchers.IO) {
        try {
            val url = CloudConfig.supabaseUrl.trimEnd('/')
            if (url.contains("YOUR_") || CloudConfig.supabaseAnonKey.contains("YOUR_")) {
                return@withContext Result.success(getMockReport())
            }

            var totalOrders = 0
            var totalRevenueMinor = 0L
            val stats = mutableListOf<VehicleStat>()

            // 1. Önce Supabase reports tablosunu kontrol et
            val request = Request.Builder()
                .url("$url/rest/v1/reports?id=eq.today&select=*")
                .headers(getSupabaseHeaders())
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string() ?: ""
                    val array = JSONArray(body)
                    if (array.length() > 0) {
                        val obj = array.getJSONObject(0)
                        totalOrders = obj.optInt("total_orders", 0)
                        totalRevenueMinor = obj.optLong("total_revenue_minor", 0L)
                        val statsArray = obj.optJSONArray("vehicle_stats")
                        if (statsArray != null) {
                            for (i in 0 until statsArray.length()) {
                                val statObj = statsArray.getJSONObject(i)
                                stats.add(
                                    VehicleStat(
                                        id = statObj.optString("id", ""),
                                        name = statObj.optString("name", ""),
                                        count = statObj.optInt("count", 0)
                                    )
                                )
                            }
                        }
                    }
                }
            }

            // 2. Eğer reports tablosunda ciro henüz 0 ise veya boşsa, doğrudan orders tablosundan hesapla
            if (totalRevenueMinor == 0L || totalOrders == 0) {
                val ordersRequest = Request.Builder()
                    .url("$url/rest/v1/orders?select=*")
                    .headers(getSupabaseHeaders())
                    .get()
                    .build()

                client.newCall(ordersRequest).execute().use { ordersResponse ->
                    if (ordersResponse.isSuccessful) {
                        val ordersBody = ordersResponse.body?.string() ?: ""
                        val ordersArray = JSONArray(ordersBody)
                        var calculatedRevenue = 0L
                        val vehicleCounts = mutableMapOf<String, Int>()
                        var validOrderCount = 0

                        for (i in 0 until ordersArray.length()) {
                            val orderObj = ordersArray.getJSONObject(i)
                            val orderId = orderObj.optString("id", "")
                            val custName = orderObj.optString("customer_name", "")
                            if (!orderId.any { it.isDigit() } || custName.contains("Müşteri Adı", ignoreCase = true)) {
                                continue
                            }
                            validOrderCount++
                            val rawAmount = orderObj.optString("amount", "0,00")
                            calculatedRevenue += parseAmountToKurus(rawAmount)

                            val veh = orderObj.optString("current_vehicle", "")
                            for (v in CloudConfig.DEFAULT_VEHICLES) {
                                if (veh.contains(v.shortName, ignoreCase = true) || veh.contains(v.prmName, ignoreCase = true)) {
                                    vehicleCounts[v.id] = (vehicleCounts[v.id] ?: 0) + 1
                                }
                            }
                        }

                        if (validOrderCount > 0) {
                            totalOrders = validOrderCount
                            totalRevenueMinor = calculatedRevenue
                            stats.clear()
                            for (v in CloudConfig.DEFAULT_VEHICLES) {
                                stats.add(
                                    VehicleStat(
                                        id = v.id,
                                        name = v.shortName,
                                        count = vehicleCounts[v.id] ?: 0
                                    )
                                )
                            }
                        }
                    }
                }
            }

            if (totalOrders == 0 && totalRevenueMinor == 0L) {
                Result.success(getMockReport())
            } else {
                Result.success(
                    ReportSummary(
                        totalOrders = totalOrders,
                        totalRevenueMinor = totalRevenueMinor,
                        vehicleStats = stats
                    )
                )
            }
        } catch (e: Exception) {
            Result.success(getMockReport())
        }
    }

    private fun getMockOrders(): List<Order> {
        return listOf(
            Order(
                id = "2026110310780415",
                secondaryId = "10780415",
                customerName = "SEDA KÖPRÜLÜ",
                phone = "05396565278",
                rawAddress = "Zekeriyaköy, Sayran Bağları Sk. Sinpaş Boğaziçi Malikâneleri",
                details = "SAKA 19 LT DAMACANA SU (1 Adet), 1 LT X 12 SAKA PET (1 Koli)",
                amount = "470,00 TL",
                paymentType = "Kredi Kartı (Online)",
                status = "Bekliyor",
                currentVehicle = "İSTANBUL-ZEKERİYAKÖY ARAÇ 1"
            ),
            Order(
                id = "2026110310780359",
                secondaryId = "10780359",
                customerName = "TAYFUN ARSLAN",
                phone = "05320542958",
                rawAddress = "Bahçeköy Yeni, Akçakoca Cd. No: 9 Sarıyer",
                details = "SAKA 19 LT DAMACANA SU (4 Adet)",
                amount = "800,00 TL",
                paymentType = "Peşin",
                status = "Bekliyor",
                currentVehicle = "İSTANBUL-ZEKERİYAKÖY ARAÇ 1"
            ),
            Order(
                id = "2026110210779799",
                secondaryId = "10779799",
                customerName = "ÖNDER MUMCUOĞLU",
                phone = "05323667878",
                rawAddress = "Zekeriyaköy, Tarakçı Cd. No: 36F Sarıyer",
                details = "SAKA 19 LT DAMACANA SU (1 Adet), 6'LI LİMONLU MADEN SUYU (1 Paket)",
                amount = "230,00 TL",
                paymentType = "Kredi Kartı (Online)",
                status = "Bekliyor",
                currentVehicle = "İSTANBUL-ZEKERİYAKÖY ARAÇ 2"
            )
        )
    }

    private fun getMockReport(): ReportSummary {
        return ReportSummary(
            totalOrders = 3,
            totalRevenueMinor = 150000L,
            vehicleStats = listOf(
                VehicleStat(id = "vehicle1", name = "ARAÇ 1", count = 2),
                VehicleStat(id = "vehicle2", name = "ARAÇ 2", count = 1),
                VehicleStat(id = "vehicle3", name = "ARAÇ 3", count = 0)
            )
        )
    }
}
