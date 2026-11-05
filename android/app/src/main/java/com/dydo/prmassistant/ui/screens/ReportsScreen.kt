package com.dydo.prmassistant.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    var isLoading by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    fun loadReports() {
        isLoading = true
        coroutineScope.launch {
            val res = repository.getReports()
            isLoading = false
            if (res.isSuccess) {
                report = res.getOrNull()
            }
        }
    }

    LaunchedEffect(Unit) {
        loadReports()
        while (true) {
            kotlinx.coroutines.delay(15_000)
            val res = repository.getReports()
            if (res.isSuccess) {
                report = res.getOrNull()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Günlük Raporlar", fontWeight = FontWeight.Bold, fontSize = 20.sp) },
                actions = {
                    IconButton(onClick = { loadReports() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Yenile", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = DyDoRed,
                    titleContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF8FAFC))
                .padding(16.dp)
        ) {
            if (isLoading && report == null) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = DyDoRed)
                }
            } else {
                val r = report ?: ReportSummary()
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    // Summary cards
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Card(
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("Toplam Sipariş", fontSize = 12.sp, color = Color.Gray)
                                Text("${r.totalOrders} Adet", fontSize = 24.sp, fontWeight = FontWeight.Black, color = DyDoRed)
                            }
                        }

                        Card(
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("Toplam Ciro", fontSize = 12.sp, color = Color.Gray)
                                Text(r.formattedRevenue, fontSize = 20.sp, fontWeight = FontWeight.Black, color = DyDoOrange)
                            }
                        }
                    }

                    // Vehicle breakdown card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "Araç Dağılımı",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0F172A)
                            )
                            Spacer(modifier = Modifier.height(12.dp))

                            r.vehicleStats.forEach { stat ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text("🚚", fontSize = 18.sp)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(stat.name, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                    }
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = Color(0xFFEFF6FF)
                                    ) {
                                        Text(
                                            "${stat.count} Sipariş",
                                            color = Color(0xFF2563EB),
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp,
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                        )
                                    }
                                }
                                HorizontalDivider(color = Color(0xFFF1F5F9))
                            }
                        }
                    }
                }
            }
        }
    }
}

