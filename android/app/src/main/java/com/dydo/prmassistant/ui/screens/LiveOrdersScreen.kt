package com.dydo.prmassistant.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dydo.prmassistant.data.models.CloudConfig
import com.dydo.prmassistant.data.models.Order
import com.dydo.prmassistant.data.models.Vehicle
import com.dydo.prmassistant.data.models.parseAmountToKurus
import com.dydo.prmassistant.data.repository.PrmRepository
import com.dydo.prmassistant.ui.theme.*
import kotlinx.coroutines.launch

data class ParsedPhone(
    val mainNumber: String,
    val displayFormatted: String,
    val extensionCode: String?
)

data class ParsedProductItem(
    val cleanName: String,
    val quantity: Int,
    val unit: String
)

data class ConsolidatedProduct(
    val name: String,
    val count: Int,
    val unit: String
)

fun parseOrderPhone(rawPhone: String): ParsedPhone {
    if (rawPhone.isBlank()) return ParsedPhone("", "", null)
    val slashIndex = rawPhone.indexOf('/')
    if (slashIndex != -1) {
        val phonePart = rawPhone.substring(0, slashIndex).trim()
        val codePart = rawPhone.substring(slashIndex + 1).replace(Regex("[^0-9]"), "").trim()
        var cleanNumber = phonePart.replace(Regex("[^0-9+]"), "")
        if (cleanNumber.startsWith("850")) cleanNumber = "0$cleanNumber"
        else if (cleanNumber.startsWith("+90850")) cleanNumber = cleanNumber.replace("+90", "0")
        else if (cleanNumber.length == 10 && cleanNumber.startsWith("5")) cleanNumber = "0$cleanNumber"
        return ParsedPhone(
            mainNumber = cleanNumber,
            displayFormatted = phonePart,
            extensionCode = codePart.ifBlank { null }
        )
    }

    var clean = rawPhone.replace(Regex("[^0-9+]"), "")
    if (clean.startsWith("850")) clean = "0$clean"
    else if (clean.startsWith("+90850")) clean = clean.replace("+90", "0")
    else if (clean.length == 10 && clean.startsWith("5")) clean = "0$clean"
    return ParsedPhone(
        mainNumber = clean,
        displayFormatted = rawPhone.trim(),
        extensionCode = null
    )
}

fun dialCustomer(context: Context, rawPhone: String) {
    val parsed = parseOrderPhone(rawPhone)
    if (parsed.mainNumber.isNotBlank()) {
        if (parsed.extensionCode != null) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Dahili Kod", parsed.extensionCode)
            clipboard.setPrimaryClip(clip)
            Toast.makeText(context, "🔑 Dahili Kod (${parsed.extensionCode}) kopyalandı!", Toast.LENGTH_LONG).show()
        }
        val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${parsed.mainNumber}"))
        context.startActivity(dialIntent)
    } else {
        Toast.makeText(context, "Telefon numarası bulunamadı", Toast.LENGTH_SHORT).show()
    }
}

fun openMap(context: Context, address: String) {
    if (address.isBlank()) return
    val mapIntent = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(address)}"))
    context.startActivity(mapIntent)
}

fun getInitials(name: String): String {
    val parts = name.trim().split(" ").filter { it.isNotBlank() }
    return when {
        parts.size >= 2 -> "${parts[0].first().uppercase()}${parts[1].first().uppercase()}"
        parts.isNotEmpty() && parts[0].isNotEmpty() -> parts[0].take(2).uppercase()
        else -> "DY"
    }
}

// Ürün detayını tek tek kalem kalem ayrıştıran akıllı fonksiyon
fun parseProductItems(details: String): List<ParsedProductItem> {
    if (details.isBlank()) return emptyList()
    val segments = details.split(",", ";", "\n").map { it.trim() }.filter { it.isNotBlank() }
    val result = mutableListOf<ParsedProductItem>()
    val regex = Regex("""(.*?)\s*(\d+)\s*(Adet|Koli|Şişe|Paket|adet|koli|şişe|paket)?$""", RegexOption.IGNORE_CASE)

    for (segment in segments) {
        val cleanSegment = segment.replace("(", "").replace(")", "").trim()
        val match = regex.find(cleanSegment)
        if (match != null && match.groupValues[1].isNotBlank()) {
            val namePart = match.groupValues[1].trim().trimEnd('-', ':')
            val qty = match.groupValues[2].toIntOrNull() ?: 1
            val rawUnit = match.groupValues.getOrNull(3)?.trim() ?: ""
            val unit = if (rawUnit.isNotBlank()) rawUnit.replaceFirstChar { it.uppercase() } else "Adet"
            result.add(
                ParsedProductItem(
                    cleanName = namePart.ifBlank { cleanSegment },
                    quantity = qty,
                    unit = unit
                )
            )
        } else {
            result.add(
                ParsedProductItem(
                    cleanName = cleanSegment,
                    quantity = 1,
                    unit = "Adet"
                )
            )
        }
    }
    return result
}

// Tüm siparişlerdeki ürünleri araç yükü için konsolide eden fonksiyon
fun calculateConsolidatedProducts(orders: List<Order>): List<ConsolidatedProduct> {
    val totals = mutableMapOf<String, Pair<Int, String>>()

    for (order in orders) {
        val items = parseProductItems(order.details)
        for (item in items) {
            val key = item.cleanName.lowercase().trim()
            val existing = totals[key]
            val currentCount = existing?.first ?: 0
            val unit = existing?.second ?: item.unit
            totals[key] = Pair(currentCount + item.quantity, unit)
        }
    }

    return totals.map { (key, pair) ->
        ConsolidatedProduct(
            name = key.uppercase(),
            count = pair.first,
            unit = pair.second
        )
    }.sortedByDescending { it.count }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveOrdersScreen(
    repository: PrmRepository,
    onLogout: () -> Unit = {}
) {
    var orders by remember { mutableStateOf<List<Order>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableIntStateOf(0) } // 0: Canlı, 1: Teslim Edilenler
    var selectedOrderForDetail by remember { mutableStateOf<Order?>(null) }
    var showLoadingManifest by remember { mutableStateOf(false) }
    var snackbarMessage by remember { mutableStateOf<String?>(null) }

    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    fun loadOrders() {
        isLoading = true
        coroutineScope.launch {
            val res = repository.getOrders(onlyActive = (selectedTab == 0))
            isLoading = false
            if (res.isSuccess) {
                orders = res.getOrNull() ?: emptyList()
            }
        }
    }

    LaunchedEffect(selectedTab) {
        loadOrders()
    }

    // 10 saniyede bir otomatik periyodik canlı yenileme
    LaunchedEffect(selectedTab) {
        while (true) {
            kotlinx.coroutines.delay(10_000)
            val res = repository.getOrders(onlyActive = (selectedTab == 0))
            if (res.isSuccess) {
                orders = res.getOrNull() ?: emptyList()
            }
        }
    }

    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
            snackbarHostState.showSnackbar(it)
            snackbarMessage = null
        }
    }

    // Giriş yapan sürücünün araç filtresi (Araç 1, Araç 2, Araç 3)
    val displayedOrders = remember(orders, CloudConfig.currentDriver) {
        val driver = CloudConfig.currentDriver
        if (driver != null && driver.assignedVehicle != "ALL") {
            orders.filter { it.currentVehicle.contains(driver.assignedVehicle, ignoreCase = true) }
        } else {
            orders
        }
    }

    // İstatistikler
    val waitingCount = displayedOrders.count { it.status.equals("Bekliyor", ignoreCase = true) || it.status.contains("Atan", ignoreCase = true) }
    val yoldaCount = displayedOrders.count { it.status.equals("Yolda", ignoreCase = true) }
    val totalRevenueMinor = displayedOrders.sumOf { parseAmountToKurus(it.amount) }
    val formattedRevenue = String.format("%.2f TL", totalRevenueMinor / 100.0)

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
                // Header Bar (Sol Üst Yuvarlak Sayaç + Sürücü + Aksiyonlar)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Sol: Yuvarlak Sayaç Rozeti (Tıklanınca Araca Yüklenecek Ürünler Manifestosunu Açar)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(16.dp))
                            .clickable { showLoadingManifest = true }
                            .padding(end = 8.dp)
                    ) {
                        // Altın Gradyanlı 3D Yuvarlak Sayaç
                        Surface(
                            shape = CircleShape,
                            color = Color.Transparent,
                            border = BorderStroke(2.5.dp, Color(0xFFFDE68A)),
                            shadowElevation = 8.dp,
                            modifier = Modifier
                                .size(50.dp)
                                .background(
                                    Brush.radialGradient(
                                        colors = listOf(Color(0xFFFBBF24), Color(0xFFD97706))
                                    ),
                                    shape = CircleShape
                                )
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = "${displayedOrders.size}",
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.Black,
                                    color = Color(0xFF451A03)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = CloudConfig.currentDriver?.displayName ?: "DyDo Kurye",
                                    fontWeight = FontWeight.Black,
                                    fontSize = 16.sp,
                                    color = Color.White
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = DyDoRed.copy(alpha = 0.25f),
                                    border = BorderStroke(1.dp, DyDoRed.copy(alpha = 0.5f))
                                ) {
                                    Text(
                                        text = CloudConfig.currentDriver?.assignedVehicle ?: "TÜMÜ",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Color(0xFFFF6B6B),
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(2.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Surface(
                                    shape = CircleShape,
                                    color = Color(0xFF22C55E),
                                    modifier = Modifier.size(7.dp)
                                ) {}
                                Spacer(modifier = Modifier.width(5.dp))
                                Text(
                                    text = "Yük Manifestosu (Dokun)",
                                    fontSize = 11.sp,
                                    color = Color(0xFF94A3B8),
                                    fontWeight = FontWeight.SemiBold
                                )
                                Spacer(modifier = Modifier.width(2.dp))
                                Text("📦", fontSize = 11.sp)
                            }
                        }
                    }

                    // Sağ: Yenile ve Çıkış Butonları
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(
                            onClick = { loadOrders() },
                            modifier = Modifier
                                .size(40.dp)
                                .background(Color.White.copy(alpha = 0.12f), CircleShape)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = "Yenile", tint = Color.White)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        IconButton(
                            onClick = { onLogout() },
                            modifier = Modifier
                                .size(40.dp)
                                .background(Color.White.copy(alpha = 0.12f), CircleShape)
                        ) {
                            Text("🚪", fontSize = 16.sp)
                        }
                    }
                }

                // Canlı KPI Özet Şeridi (Bekleyen, Yolda, Aktif Ciro)
                if (selectedTab == 0 && displayedOrders.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color.White.copy(alpha = 0.08f),
                            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.05f)),
                            modifier = Modifier.weight(1f)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("⏳", fontSize = 15.sp)
                                Spacer(modifier = Modifier.width(6.dp))
                                Column {
                                    Text("Bekleyen", fontSize = 10.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                                    Text("$waitingCount Adet", fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color(0xFFFDE047))
                                }
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color.White.copy(alpha = 0.08f),
                            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.05f)),
                            modifier = Modifier.weight(1f)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("🚚", fontSize = 15.sp)
                                Spacer(modifier = Modifier.width(6.dp))
                                Column {
                                    Text("Yolda", fontSize = 10.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                                    Text("$yoldaCount Adet", fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color(0xFF38BDF8))
                                }
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color.White.copy(alpha = 0.08f),
                            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.05f)),
                            modifier = Modifier.weight(1.3f)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("💰", fontSize = 15.sp)
                                Spacer(modifier = Modifier.width(6.dp))
                                Column {
                                    Text("Ciro", fontSize = 10.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                                    Text(formattedRevenue, fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color(0xFF4ADE80))
                                }
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                }

                // Modern Segmented Tab Bar (Canlı vs Teslim Edilenler)
                Surface(
                    color = Color.Transparent,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFF0F172A).copy(alpha = 0.8f), RoundedCornerShape(14.dp))
                            .border(1.dp, Color(0xFF334155), RoundedCornerShape(14.dp))
                            .padding(4.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .background(
                                    if (selectedTab == 0) DyDoRed else Color.Transparent,
                                    RoundedCornerShape(10.dp)
                                )
                                .clickable { selectedTab = 0 }
                                .padding(vertical = 9.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "🔥 Canlı Siparişler",
                                    fontSize = 13.sp,
                                    fontWeight = if (selectedTab == 0) FontWeight.Black else FontWeight.SemiBold,
                                    color = if (selectedTab == 0) Color.White else Color(0xFF94A3B8)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Surface(
                                    shape = CircleShape,
                                    color = if (selectedTab == 0) Color.White else Color(0xFF334155)
                                ) {
                                    Text(
                                        text = "${displayedOrders.size}",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (selectedTab == 0) DyDoRed else Color.White,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                                    )
                                }
                            }
                        }

                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .background(
                                    if (selectedTab == 1) DyDoRed else Color.Transparent,
                                    RoundedCornerShape(10.dp)
                                )
                                .clickable { selectedTab = 1 }
                                .padding(vertical = 9.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "✅ Teslim Edilenler",
                                fontSize = 13.sp,
                                fontWeight = if (selectedTab == 1) FontWeight.Black else FontWeight.SemiBold,
                                color = if (selectedTab == 1) Color.White else Color(0xFF94A3B8)
                            )
                        }
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF1F5F9))
        ) {
            if (isLoading && displayedOrders.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = DyDoRed)
                }
            } else if (displayedOrders.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Card(
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        modifier = Modifier.padding(24.dp)
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(28.dp)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFEFF6FF),
                                modifier = Modifier.size(68.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(text = if (selectedTab == 0) "✨" else "📦", fontSize = 32.sp)
                                }
                            }
                            Spacer(modifier = Modifier.height(14.dp))
                            Text(
                                text = if (selectedTab == 0) "Aktif Canlı Sipariş Yok" else "Teslim Edilen Sipariş Yok",
                                color = Color(0xFF0F172A),
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = if (selectedTab == 0) "Aracınıza atanan yeni siparişler anında bu ekrana düşer." else "Bugün teslim ettiğiniz siparişler burada arşivlenir.",
                                color = Color(0xFF64748B),
                                fontSize = 13.sp,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = { loadOrders() },
                                colors = ButtonDefaults.buttonColors(containerColor = DyDoRed),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text("🔄 Yenile", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    items(displayedOrders, key = { it.id }) { order ->
                        ModernOrderCard(
                            order = order,
                            onCardClick = { selectedOrderForDetail = order },
                            onUpdateStatus = { targetStatus ->
                                coroutineScope.launch {
                                    val res = repository.updateOrderStatus(order.id, targetStatus)
                                    if (res.isSuccess) {
                                        snackbarMessage = "Sipariş durumu '$targetStatus' yapıldı."
                                        loadOrders()
                                    } else {
                                        snackbarMessage = "Durum güncellenemedi!"
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }
    }

    // Sol üst sayaç rozetine tıklandığında açılan Yükleme Manifestosu
    if (showLoadingManifest) {
        ModernLoadingManifestBottomSheet(
            orders = displayedOrders,
            vehicleTitle = CloudConfig.currentDriver?.displayName ?: "Tüm Araçlar",
            onDismiss = { showLoadingManifest = false }
        )
    }

    // Sipariş Detay Penceresi (Bottom Sheet)
    selectedOrderForDetail?.let { order ->
        OrderDetailBottomSheet(
            order = order,
            onDismiss = { selectedOrderForDetail = null },
            onAssignVehicle = { vehicle ->
                coroutineScope.launch {
                    val res = repository.assignOrderToVehicle(order.id, vehicle)
                    if (res.isSuccess) {
                        snackbarMessage = "Sipariş ${vehicle.shortName} aracına aktarıldı."
                        selectedOrderForDetail = null
                        loadOrders()
                    }
                }
            },
            onUpdateStatus = { targetStatus ->
                coroutineScope.launch {
                    val res = repository.updateOrderStatus(order.id, targetStatus)
                    if (res.isSuccess) {
                        snackbarMessage = "Sipariş '$targetStatus' yapıldı."
                        selectedOrderForDetail = null
                        loadOrders()
                    }
                }
            }
        )
    }
}

// =============================================================================
// 🌟 ULTRA-MODERN SİPARİŞ KARTI
// =============================================================================
@Composable
fun ModernOrderCard(
    order: Order,
    onCardClick: () -> Unit,
    onUpdateStatus: (String) -> Unit
) {
    val context = LocalContext.current
    val parsedPhone = remember(order.phone) { parseOrderPhone(order.phone) }
    val productItems = remember(order.details) { parseProductItems(order.details) }
    val isYolda = order.status.equals("Yolda", ignoreCase = true)
    val isTeslimEdildi = order.status.equals("Teslim Edildi", ignoreCase = true)

    // Platform algılama & marka renkleri
    val (channelBg, channelFg, channelText) = when {
        order.customerName.contains("Getir", ignoreCase = true) || order.details.contains("Getir", ignoreCase = true) -> Triple(Color(0xFFF3E8FF), Color(0xFF5D3EBC), "Getir")
        order.customerName.contains("Trendyol", ignoreCase = true) || order.details.contains("Trendyol", ignoreCase = true) -> Triple(Color(0xFFFFF7ED), Color(0xFFF27A1A), "Trendyol")
        order.customerName.contains("Yemeksepeti", ignoreCase = true) -> Triple(Color(0xFFFEE2E2), Color(0xFFDC2626), "Yemeksepeti")
        else -> Triple(Color(0xFFEFF6FF), Color(0xFF2563EB), "DyDo Web")
    }

    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
        border = BorderStroke(
            width = if (isYolda) 1.5.dp else 1.dp,
            color = if (isYolda) Color(0xFF0284C7) else Color(0xFFE2E8F0)
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCardClick() }
    ) {
        Column(modifier = Modifier.padding(15.dp)) {
            // 1. ÜST ŞERİT: Sipariş ID / Kanal / Saat / Atanan Araç
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Kanal Çipi
                    Surface(
                        shape = RoundedCornerShape(7.dp),
                        color = channelBg,
                        border = BorderStroke(1.dp, channelFg.copy(alpha = 0.2f))
                    ) {
                        Text(
                            text = channelText,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            color = channelFg,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                        )
                    }

                    if (order.createdAt.isNotBlank()) {
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "⏱️ ${order.createdAt}",
                            fontSize = 11.sp,
                            color = Color(0xFF64748B),
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                // Araç Çipi
                val vehicleName = if (order.currentVehicle.contains("Atanmadı")) "Atanmadı" else order.currentVehicle.replace("İSTANBUL-ZEKERİYAKÖY ", "")
                Surface(
                    shape = RoundedCornerShape(7.dp),
                    color = if (vehicleName.contains("Atanmadı")) Color(0xFFF1F5F9) else Color(0xFFFEF2F2),
                    border = BorderStroke(1.dp, if (vehicleName.contains("Atanmadı")) Color(0xFFCBD5E1) else Color(0xFFFECACA))
                ) {
                    Text(
                        text = "🚚 $vehicleName",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        color = if (vehicleName.contains("Atanmadı")) Color(0xFF64748B) else DyDoRed,
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // 2. MÜŞTERİ BİLGİSİ & TOPLAM TUTAR
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // İnisiyalli Avatar
                Surface(
                    shape = CircleShape,
                    color = if (isYolda) Color(0xFFE0F2FE) else Color(0xFFF1F5F9),
                    border = BorderStroke(1.5.dp, if (isYolda) Color(0xFF7DD3FC) else Color(0xFFE2E8F0)),
                    modifier = Modifier.size(46.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = getInitials(order.customerName),
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Black,
                            color = if (isYolda) Color(0xFF0369A1) else Color(0xFF1E293B)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = order.customerName,
                        fontWeight = FontWeight.Black,
                        fontSize = 17.sp,
                        color = Color(0xFF0F172A),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // Durum Rozeti
                        val (statusBg, statusFg, statusText) = when {
                            isYolda -> Triple(Color(0xFFE0F2FE), Color(0xFF0284C7), "🚀 Yolda")
                            isTeslimEdildi -> Triple(Color(0xFFDCFCE7), Color(0xFF16A34A), "✅ Teslim Edildi")
                            order.status == "Atandı" -> Triple(Color(0xFFEDE9FE), Color(0xFF7C3AED), "🚚 Atandı")
                            else -> Triple(Color(0xFFFEF3C7), Color(0xFFD97706), "⏳ Bekliyor")
                        }
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = statusBg
                        ) {
                            Text(
                                text = statusText,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Black,
                                color = statusFg,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }

                        // Ödeme Yöntemi Rozeti
                        val isOnlineOrCard = order.paymentType.contains("Kredi", ignoreCase = true) || order.paymentType.contains("Online", ignoreCase = true)
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = if (isOnlineOrCard) Color(0xFFEFF6FF) else Color(0xFFF0FDF4)
                        ) {
                            Text(
                                text = if (order.paymentType.isNotBlank()) "💳 ${order.paymentType}" else "💵 Nakit",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isOnlineOrCard) Color(0xFF1D4ED8) else Color(0xFF15803D),
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                }

                // Tutar Rozeti (Sağ)
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFFEF2F2),
                    border = BorderStroke(1.5.dp, Color(0xFFFECACA))
                ) {
                    Text(
                        text = order.displayAmount,
                        fontWeight = FontWeight.Black,
                        fontSize = 17.sp,
                        color = DyDoRed,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // =================================================================
            // 3. 📦 ÜRÜNLER (KALEM KALEM, ÇOK NET VE OKUNAKLI)
            // =================================================================
            if (productItems.isNotEmpty()) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(10.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 2.dp)
                        ) {
                            Text(
                                text = "📦 SİPARİŞ KALEMLERİ",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                color = Color(0xFF475569)
                            )
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = DyDoOrange.copy(alpha = 0.12f)
                            ) {
                                Text(
                                    text = "${productItems.sumOf { it.quantity }} Parça Ürün",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Black,
                                    color = DyDoOrange,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }

                        productItems.forEach { item ->
                            val isDamacana = item.cleanName.contains("DAMACANA", ignoreCase = true)
                            val isKoli = item.cleanName.contains("KOLİ", ignoreCase = true) || item.unit.contains("Koli", ignoreCase = true)

                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                shadowElevation = 1.dp,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Text(
                                            text = if (isDamacana) "💧" else if (isKoli) "📦" else "🥤",
                                            fontSize = 18.sp
                                        )
                                        Spacer(modifier = Modifier.width(10.dp))
                                        Text(
                                            text = item.cleanName,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Black,
                                            color = Color(0xFF0F172A),
                                            lineHeight = 18.sp
                                        )
                                    }

                                    Spacer(modifier = Modifier.width(8.dp))

                                    // Büyük Belirgin Adet/Koli Çipi
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = if (isDamacana) Color(0xFFEFF6FF) else Color(0xFFFFFBEB),
                                        border = BorderStroke(1.dp, if (isDamacana) Color(0xFFBFDBFE) else Color(0xFFFDE68A))
                                    ) {
                                        Text(
                                            text = "${item.quantity} ${item.unit.uppercase()}",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Black,
                                            color = if (isDamacana) Color(0xFF1D4ED8) else Color(0xFFB45309),
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
            }

            // 4. ADRES VE HARİTA BUTONU
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFFF8FAFC),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("📍", fontSize = 18.sp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = order.rawAddress,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF334155),
                        lineHeight = 17.sp,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = { openMap(context, order.rawAddress) },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = InfoBlue),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Icon(Icons.Default.Navigation, contentDescription = "Harita", modifier = Modifier.size(15.dp), tint = Color.White)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Harita", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // 5. TELEFON & DAHİLİ KOD (GETİR / TRENDYOL)
            if (order.phone.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = { dialCustomer(context, order.phone) },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen),
                    modifier = Modifier.fillMaxWidth().height(44.dp),
                    contentPadding = PaddingValues(horizontal = 14.dp)
                ) {
                    Icon(Icons.Default.Phone, contentDescription = "Ara", modifier = Modifier.size(17.dp), tint = Color.White)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Hemen Ara (${parsedPhone.displayFormatted})",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                if (parsedPhone.extensionCode != null) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFFEF3C7),
                        border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "🔑 Dahili Kod: ${parsedPhone.extensionCode}",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Black,
                                color = Color(0xFF92400E)
                            )
                            Text(
                                text = "Panoya Kopyalandı ✓",
                                fontSize = 11.sp,
                                color = Color(0xFFB45309),
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider(color = Color(0xFFF1F5F9))
            Spacer(modifier = Modifier.height(10.dp))

            // 6. İKİ AŞAMALI AKSİYON BUTONLARI (1. YOLA ÇIKAR ➔ 2. TESLİM EDİLDİ)
            if (!isTeslimEdildi) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // 1. Aşama: Yola Çıkar
                    Button(
                        onClick = { onUpdateStatus("Yolda") },
                        modifier = Modifier.weight(1.1f).height(46.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isYolda) Color(0xFF0284C7) else Color(0xFFE0F2FE),
                            contentColor = if (isYolda) Color.White else Color(0xFF0369A1)
                        )
                    ) {
                        Text(
                            text = if (isYolda) "✓ Yolda" else "1. 🚚 Yola Çıkar",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Black
                        )
                    }

                    // 2. Aşama: Teslim Edildi (Sadece Yolda ise aktif)
                    Button(
                        onClick = {
                            if (isYolda) {
                                onUpdateStatus("Teslim Edildi")
                            } else {
                                Toast.makeText(context, "Sipariş önce Yolda aşamasına getirilmelidir!", Toast.LENGTH_SHORT).show()
                            }
                        },
                        enabled = isYolda,
                        modifier = Modifier.weight(1.1f).height(46.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isYolda) SuccessGreen else Color(0xFFE2E8F0),
                            contentColor = if (isYolda) Color.White else Color(0xFF94A3B8),
                            disabledContainerColor = Color(0xFFF1F5F9),
                            disabledContentColor = Color(0xFF94A3B8)
                        )
                    ) {
                        Text(
                            text = if (isYolda) "2. ✅ Teslim Et" else "2. Teslim (Kilitli)",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Black
                        )
                    }

                    // Detay Butonu
                    OutlinedButton(
                        onClick = { onCardClick() },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.height(46.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp)
                    ) {
                        Text("Detay", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    OutlinedButton(
                        onClick = { onCardClick() },
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                    ) {
                        Text("Detayları İncele ➔", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

// =============================================================================
// 📦 ARACA YÜKLENECEK TÜM ÜRÜNLER (MODERN MANİFESTO BOTTOM SHEET)
// =============================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModernLoadingManifestBottomSheet(
    orders: List<Order>,
    vehicleTitle: String,
    onDismiss: () -> Unit
) {
    val consolidatedItems = remember(orders) { calculateConsolidatedProducts(orders) }
    val damacanaCount = consolidatedItems.filter { it.name.contains("DAMACANA", ignoreCase = true) }.sumOf { it.count }
    val koliCount = consolidatedItems.filter { !it.name.contains("DAMACANA", ignoreCase = true) }.sumOf { it.count }
    val totalPieces = consolidatedItems.sumOf { it.count }

    // Sürücünün yüklerken işaretleyebileceği kontrol listesi state'i
    val checkedItems = remember { mutableStateMapOf<String, Boolean>() }

    ModalBottomSheet(
        onDismissRequest = { onDismiss() },
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp)
                .navigationBarsPadding()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "🚚 Araca Yüklenecek Toplam Yük",
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFF0F172A)
                    )
                    Text(
                        text = "$vehicleTitle • Aktif ${orders.size} Sipariş İçin Toplam $totalPieces Parça",
                        fontSize = 13.sp,
                        color = Color.Gray,
                        fontWeight = FontWeight.Medium
                    )
                }
                IconButton(onClick = { onDismiss() }) {
                    Icon(Icons.Default.Close, contentDescription = "Kapat")
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Özet Parça Kartları (Damacana ve Koli)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFEFF6FF),
                    border = BorderStroke(1.dp, Color(0xFFBFDBFE)),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("💧 Toplam Damacana", fontSize = 11.sp, color = Color(0xFF1E40AF), fontWeight = FontWeight.Bold)
                        Text("$damacanaCount Adet", fontSize = 22.sp, fontWeight = FontWeight.Black, color = Color(0xFF1D4ED8))
                    }
                }

                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFFFFBEB),
                    border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("📦 Toplam Koli / Pet", fontSize = 11.sp, color = Color(0xFF92400E), fontWeight = FontWeight.Bold)
                        Text("$koliCount Koli/Paket", fontSize = 22.sp, fontWeight = FontWeight.Black, color = Color(0xFFB45309))
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            if (consolidatedItems.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("Yüklenecek aktif sipariş ürünü bulunamadı.", color = Color.Gray)
                }
            } else {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "KALEM KALEM YÜKLEME KONTROL LİSTESİ (DOKUNUP İŞARETLE):",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            color = Color(0xFF64748B)
                        )
                        consolidatedItems.forEach { item ->
                            val isDamacana = item.name.contains("DAMACANA", ignoreCase = true)
                            val isChecked = checkedItems[item.name] ?: false

                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isChecked) Color(0xFFF0FDF4) else Color.White,
                                border = BorderStroke(1.dp, if (isChecked) Color(0xFF86EFAC) else Color(0xFFE2E8F0)),
                                shadowElevation = 1.dp,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { checkedItems[item.name] = !isChecked }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Surface(
                                            shape = CircleShape,
                                            color = if (isChecked) Color(0xFF22C55E) else Color(0xFFF1F5F9),
                                            border = BorderStroke(1.dp, if (isChecked) Color(0xFF16A34A) else Color(0xFFCBD5E1)),
                                            modifier = Modifier.size(26.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                if (isChecked) {
                                                    Icon(Icons.Default.Check, contentDescription = "Yüklendi", tint = Color.White, modifier = Modifier.size(16.dp))
                                                } else {
                                                    Text(text = if (isDamacana) "💧" else "📦", fontSize = 13.sp)
                                                }
                                            }
                                        }

                                        Spacer(modifier = Modifier.width(10.dp))
                                        Text(
                                            text = item.name,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Black,
                                            color = if (isChecked) Color(0xFF15803D) else Color(0xFF0F172A),
                                            textDecoration = if (isChecked) TextDecoration.LineThrough else TextDecoration.None
                                        )
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = if (isChecked) Color(0xFFDCFCE7) else if (isDamacana) Color(0xFFEFF6FF) else Color(0xFFFEF3C7)
                                    ) {
                                        Text(
                                            text = "${item.count} ${item.unit}",
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Black,
                                            color = if (isChecked) Color(0xFF16A34A) else if (isDamacana) Color(0xFF1D4ED8) else Color(0xFFB45309),
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = { onDismiss() },
                colors = ButtonDefaults.buttonColors(containerColor = DyDoRed),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
            ) {
                Text("Anladım, Kapat ✓", fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }

            Spacer(modifier = Modifier.height(10.dp))
        }
    }
}

// =============================================================================
// 🔍 SİPARİŞ DETAY PENCERESİ (BOTTOM SHEET)
// =============================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailBottomSheet(
    order: Order,
    onDismiss: () -> Unit,
    onAssignVehicle: (Vehicle) -> Unit,
    onUpdateStatus: (String) -> Unit
) {
    val context = LocalContext.current
    val parsedPhone = remember(order.phone) { parseOrderPhone(order.phone) }
    val productItems = remember(order.details) { parseProductItems(order.details) }
    val isYolda = order.status.equals("Yolda", ignoreCase = true)

    ModalBottomSheet(
        onDismissRequest = { onDismiss() },
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp)
                .navigationBarsPadding()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(text = "Sipariş Detayı", fontSize = 12.sp, color = Color.Gray, fontWeight = FontWeight.Medium)
                    Text(text = order.customerName, fontSize = 20.sp, fontWeight = FontWeight.Black, color = Color(0xFF0F172A))
                }
                IconButton(onClick = { onDismiss() }) {
                    Icon(Icons.Default.Close, contentDescription = "Kapat")
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Tutar ve Ödeme Şekli
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Ödeme Türü", fontSize = 11.sp, color = Color.Gray)
                        Text(
                            text = if (order.paymentType.isNotBlank()) order.paymentType else "Nakit / Peşin",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF1E293B)
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Toplam Tutar", fontSize = 11.sp, color = Color.Gray)
                        Text(
                            text = order.displayAmount,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Black,
                            color = DyDoRed
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Kalem Kalem Ürünler
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBEB)),
                border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "📦 Sipariş Edilen Ürünler (Kalem Kalem):",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Black,
                        color = DyDoOrange
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    if (productItems.isNotEmpty()) {
                        productItems.forEach { item ->
                            val isDamacana = item.cleanName.contains("DAMACANA", ignoreCase = true)
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text(text = if (isDamacana) "💧" else "📦", fontSize = 16.sp)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = item.cleanName,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF451A03)
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = Color.White
                                ) {
                                    Text(
                                        text = "${item.quantity} ${item.unit}",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Color(0xFFB45309),
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                    )
                                }
                            }
                        }
                    } else {
                        Text(
                            text = if (order.details.isNotBlank()) order.details else "Ürün detayı girilmemiş.",
                            fontSize = 14.sp,
                            color = Color(0xFF451A03)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Adres & Harita
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F5F9)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("📍 Teslimat Adresi", fontSize = 11.sp, color = Color.Gray, fontWeight = FontWeight.Bold)
                            Text(text = order.rawAddress, fontSize = 13.sp, color = Color(0xFF334155), lineHeight = 17.sp)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = { openMap(context, order.rawAddress) },
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = InfoBlue)
                        ) {
                            Text("Harita", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Araç Değiştirme
            Text(text = "Hangi Araca Atanacak?", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF475569))
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CloudConfig.DEFAULT_VEHICLES.forEach { vehicle ->
                    val isCurrent = order.currentVehicle.contains(vehicle.shortName)
                    Button(
                        onClick = { onAssignVehicle(vehicle) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isCurrent) DyDoRed else Color(0xFFF1F5F9),
                            contentColor = if (isCurrent) Color.White else Color(0xFF334155)
                        ),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        Text(text = "🚚 ${vehicle.shortName}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Durum Aşamaları
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = { onUpdateStatus("Yolda") },
                    modifier = Modifier.weight(1f).height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isYolda) Color(0xFF0284C7) else Color(0xFFE0F2FE),
                        contentColor = if (isYolda) Color.White else Color(0xFF0369A1)
                    )
                ) {
                    Text(text = if (isYolda) "✓ Yolda İşaretli" else "1. 🚚 Yola Çıkar", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = {
                        if (isYolda) {
                            onUpdateStatus("Teslim Edildi")
                        } else {
                            Toast.makeText(context, "Sipariş önce Yolda aşamasına getirilmelidir!", Toast.LENGTH_SHORT).show()
                        }
                    },
                    enabled = isYolda,
                    modifier = Modifier.weight(1f).height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isYolda) SuccessGreen else Color(0xFFE2E8F0),
                        contentColor = if (isYolda) Color.White else Color(0xFF94A3B8),
                        disabledContainerColor = Color(0xFFF1F5F9),
                        disabledContentColor = Color(0xFF94A3B8)
                    )
                ) {
                    Text(text = if (isYolda) "2. ✅ Teslim Edildi" else "2. Teslim (Kilitli)", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
