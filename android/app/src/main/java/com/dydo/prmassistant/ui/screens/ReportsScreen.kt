package com.dydo.prmassistant.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dydo.prmassistant.data.models.Order
import com.dydo.prmassistant.data.models.ReportSummary
import com.dydo.prmassistant.data.repository.PrmRepository
import com.dydo.prmassistant.ui.theme.DyDoOrange
import com.dydo.prmassistant.ui.theme.DyDoRed
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportsScreen(
    repository: PrmRepository
) {
    var report by remember { mutableStateOf<ReportSummary?>(null) }
    var deliveredOrders by remember { mutableStateOf<List<Order>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    fun loadReports() {
        isLoading = true
        coroutineScope.launch {
            val res = repository.getReports()
            val ordersRes = repository.getOrders(onlyActive = false)
            isLoading = false
            if (res.isSuccess) {
                report = res.getOrNull()
            }
            if (ordersRes.isSuccess) {
                deliveredOrders = ordersRes.getOrNull() ?: emptyList()
            }
        }
    }

    LaunchedEffect(Unit) {
        loadReports()
        while (true) {
            kotlinx.coroutines.delay(15_000)
            val res = repository.getReports()
            val ordersRes = repository.getOrders(onlyActive = false)
            if (res.isSuccess) {
                report = res.getOrNull()
            }
            if (ordersRes.isSuccess) {
                deliveredOrders = ordersRes.getOrNull() ?: emptyList()
            }
        }
    }

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color(0xFF0F172A), Color(0xFF1E293B))
                        )
                    )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 20.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("📊", fontSize = 22.sp)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                "Günlük Dağıtım Raporu",
                                fontWeight = FontWeight.Black,
                                fontSize = 19.sp,
                                color = Color.White
                            )
                        }
                        Text(
                            "Canlı Dağıtım & Ciro İstatistikleri",
                            fontSize = 12.sp,
                            color = Color(0xFF94A3B8),
                            fontWeight = FontWeight.Medium
                        )
                    }

                    IconButton(
                        onClick = { loadReports() },
                        modifier = Modifier
                            .size(40.dp)
                            .background(Color.White.copy(alpha = 0.12f), CircleShape)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = "Yenile", tint = Color.White)
                    }
                }
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF1F5F9))
        ) {
            if (isLoading && report == null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = DyDoRed)
                }
            } else {
                val r = report ?: ReportSummary()
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Özet KPI Kartları (Ciro ve Toplam Sipariş)
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Card(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(20.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text("Toplam Sipariş", fontSize = 12.sp, color = Color(0xFF64748B), fontWeight = FontWeight.SemiBold)
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFEFF6FF),
                                            modifier = Modifier.size(28.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Text("📦", fontSize = 14.sp)
                                            }
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        "${r.totalOrders} Adet",
                                        fontSize = 24.sp,
                                        fontWeight = FontWeight.Black,
                                        color = DyDoRed
                                    )
                                }
                            }

                            Card(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(20.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text("Toplam Ciro", fontSize = 12.sp, color = Color(0xFF64748B), fontWeight = FontWeight.SemiBold)
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFECFDF5),
                                            modifier = Modifier.size(28.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Text("💰", fontSize = 14.sp)
                                            }
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        r.formattedRevenue,
                                        fontSize = 21.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Color(0xFF16A34A)
                                    )
                                }
                            }
                        }
                    }

                    // Araç Dağılım Kartı
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(20.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
                        ) {
                            Column(modifier = Modifier.padding(18.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(
                                            "🚚 Araç Bazlı Dağıtım",
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.Black,
                                            color = Color(0xFF0F172A)
                                        )
                                        Text(
                                            "Araç 1, Araç 2 ve Araç 3 İş Yükü",
                                            fontSize = 12.sp,
                                            color = Color(0xFF64748B)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(14.dp))

                                if (r.vehicleStats.isEmpty()) {
                                    Text(
                                        "Henüz araç dağılım verisi oluşmadı.",
                                        color = Color.Gray,
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(vertical = 12.dp)
                                    )
                                } else {
                                    r.vehicleStats.forEach { stat ->
                                        val ratio = if (r.totalOrders > 0) stat.count.toFloat() / r.totalOrders.toFloat() else 0f
                                        Surface(
                                            shape = RoundedCornerShape(14.dp),
                                            color = Color(0xFFF8FAFC),
                                            border = BorderStroke(1.dp, Color(0xFFF1F5F9)),
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 5.dp)
                                        ) {
                                            Column(modifier = Modifier.padding(12.dp)) {
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.SpaceBetween,
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                                        Text("🚚", fontSize = 18.sp)
                                                        Spacer(modifier = Modifier.width(8.dp))
                                                        Text(
                                                            stat.name,
                                                            fontWeight = FontWeight.Black,
                                                            fontSize = 15.sp,
                                                            color = Color(0xFF0F172A)
                                                        )
                                                    }
                                                    Surface(
                                                        shape = RoundedCornerShape(8.dp),
                                                        color = Color(0xFFEFF6FF),
                                                        border = BorderStroke(1.dp, Color(0xFFBFDBFE))
                                                    ) {
                                                        Text(
                                                            "${stat.count} Sipariş",
                                                            color = Color(0xFF1D4ED8),
                                                            fontWeight = FontWeight.Black,
                                                            fontSize = 13.sp,
                                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                        )
                                                    }
                                                }

                                                Spacer(modifier = Modifier.height(8.dp))

                                                // İlerleme Çubuğu
                                                LinearProgressIndicator(
                                                    progress = { ratio },
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .height(6.dp),
                                                    color = DyDoRed,
                                                    trackColor = Color(0xFFE2E8F0)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Geçmiş Teslim Edilen Sipariş Kayıtları Listesi
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(20.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
                        ) {
                            Column(modifier = Modifier.padding(18.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(
                                            "📋 Geçmiş Sipariş Kayıtları",
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.Black,
                                            color = Color(0xFF0F172A)
                                        )
                                        Text(
                                            "Buluttaki teslim edilmiş geçmiş kayıtlar",
                                            fontSize = 12.sp,
                                            color = Color(0xFF64748B)
                                        )
                                    }
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFF1F5F9)
                                    ) {
                                        Text(
                                            "${deliveredOrders.size} Kayıt",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF475569),
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(14.dp))

                                if (deliveredOrders.isEmpty()) {
                                    Text(
                                        "Geçmiş teslim kaydı bulunamadı.",
                                        color = Color.Gray,
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(vertical = 12.dp)
                                    )
                                } else {
                                    deliveredOrders.take(100).forEach { order ->
                                        Surface(
                                            shape = RoundedCornerShape(12.dp),
                                            color = Color(0xFFF8FAFC),
                                            border = BorderStroke(1.dp, Color(0xFFF1F5F9)),
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 4.dp)
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(12.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(
                                                        text = order.customerName,
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 14.sp,
                                                        color = Color(0xFF0F172A)
                                                    )
                                                    Spacer(modifier = Modifier.height(2.dp))
                                                    Text(
                                                        text = "${order.currentVehicle.replace("İSTANBUL-ZEKERİYAKÖY ", "")} • ${order.createdAt}",
                                                        fontSize = 11.sp,
                                                        color = Color(0xFF64748B)
                                                    )
                                                }
                                                Text(
                                                    text = order.displayAmount,
                                                    fontWeight = FontWeight.Black,
                                                    fontSize = 14.sp,
                                                    color = DyDoRed
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
