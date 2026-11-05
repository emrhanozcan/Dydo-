package com.dydo.prmassistant.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dydo.prmassistant.data.models.CloudConfig
import com.dydo.prmassistant.data.models.Order
import com.dydo.prmassistant.data.models.Vehicle
import com.dydo.prmassistant.data.repository.PrmRepository
import com.dydo.prmassistant.ui.theme.DyDoOrange
import com.dydo.prmassistant.ui.theme.DyDoRed
import kotlinx.coroutines.launch

data class ParsedPhone(
    val mainNumber: String,
    val displayFormatted: String,
    val extensionCode: String?
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveOrdersScreen(
    repository: PrmRepository
) {
    var orders by remember { mutableStateOf<List<Order>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableIntStateOf(0) } // 0: Canlı, 1: Teslim Edilenler
    var assigningOrderId by remember { mutableStateOf<String?>(null) }
    var selectedOrderForDetail by remember { mutableStateOf<Order?>(null) }
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

    // 10 saniyede bir otomatik periyodik yenileme
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

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = {
                        Column {
                            Text(
                                if (selectedTab == 0) "Canlı Siparişler" else "Teslim Edilenler",
                                fontWeight = FontWeight.Bold,
                                fontSize = 20.sp
                            )
                            Text(
                                text = "${orders.size} sipariş listelendi",
                                fontSize = 12.sp,
                                color = Color.White.copy(alpha = 0.8f)
                            )
                        }
                    },
                    actions = {
                        IconButton(onClick = { loadOrders() }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Yenile", tint = Color.White)
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = DyDoRed,
                        titleContentColor = Color.White
                    )
                )

                // Canlı / Teslim Edilenler Filtre Sekmeleri
                TabRow(
                    selectedTabIndex = selectedTab,
                    containerColor = Color.White,
                    contentColor = DyDoRed
                ) {
                    Tab(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        text = {
                            Text("🔥 Canlı Siparişler", fontWeight = if (selectedTab == 0) FontWeight.Bold else FontWeight.Normal)
                        }
                    )
                    Tab(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        text = {
                            Text("✅ Teslim Edilenler", fontWeight = if (selectedTab == 1) FontWeight.Bold else FontWeight.Normal)
                        }
                    )
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF8FAFC))
        ) {
            if (isLoading && orders.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = DyDoRed)
                }
            } else if (orders.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                        Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(64.dp), tint = Color.LightGray)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            if (selectedTab == 0) "Henüz aktif canlı sipariş yok." else "Teslim edilmiş sipariş bulunmuyor.",
                            color = Color.Gray,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            if (selectedTab == 0) "Web eklentisi açık olduğunda siparişler buraya otomatik aktarılır." else "Teslim edilen siparişler burada arşivlenir.",
                            color = Color.Gray,
                            fontSize = 12.sp
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { loadOrders() },
                            colors = ButtonDefaults.buttonColors(containerColor = DyDoRed),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Şimdi Yenile")
                        }
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(orders, key = { it.id }) { order ->
                        OrderCard(
                            order = order,
                            isAssigning = assigningOrderId == order.id,
                            onCardClick = { selectedOrderForDetail = order },
                            onAssignVehicle = { vehicle ->
                                assigningOrderId = order.id
                                coroutineScope.launch {
                                    val res = repository.assignOrderToVehicle(order.id, vehicle)
                                    assigningOrderId = null
                                    if (res.isSuccess) {
                                        orders = orders.map {
                                            if (it.id == order.id) it.copy(currentVehicle = vehicle.prmName, status = "Atandı") else it
                                        }
                                        snackbarMessage = "Sipariş ${vehicle.shortName}'ye aktarıldı!"
                                    } else {
                                        snackbarMessage = "Atama hatası: ${res.exceptionOrNull()?.message}"
                                    }
                                }
                            },
                            onUpdateStatus = { newStatus ->
                                coroutineScope.launch {
                                    val res = repository.updateOrderStatus(order.id, newStatus)
                                    if (res.isSuccess) {
                                        if (selectedTab == 0 && newStatus == "Teslim Edildi") {
                                            orders = orders.filter { it.id != order.id }
                                            snackbarMessage = "Sipariş teslim edildi olarak işaretlendi!"
                                        } else {
                                            orders = orders.map {
                                                if (it.id == order.id) it.copy(status = newStatus) else it
                                            }
                                            snackbarMessage = "Durum güncellendi: $newStatus"
                                        }
                                    } else {
                                        snackbarMessage = "Güncelleme hatası"
                                    }
                                }
                            }
                        )
                    }
                }
            }

            // Sipariş Detayı BottomSheet
            selectedOrderForDetail?.let { detailOrder ->
                OrderDetailBottomSheet(
                    order = detailOrder,
                    onDismiss = { selectedOrderForDetail = null },
                    onAssignVehicle = { vehicle ->
                        coroutineScope.launch {
                            val res = repository.assignOrderToVehicle(detailOrder.id, vehicle)
                            if (res.isSuccess) {
                                selectedOrderForDetail = detailOrder.copy(currentVehicle = vehicle.prmName, status = "Atandı")
                                orders = orders.map {
                                    if (it.id == detailOrder.id) it.copy(currentVehicle = vehicle.prmName, status = "Atandı") else it
                                }
                                snackbarMessage = "Sipariş ${vehicle.shortName}'ye aktarıldı!"
                            }
                        }
                    },
                    onUpdateStatus = { newStatus ->
                        coroutineScope.launch {
                            val res = repository.updateOrderStatus(detailOrder.id, newStatus)
                            if (res.isSuccess) {
                                selectedOrderForDetail = detailOrder.copy(status = newStatus)
                                if (selectedTab == 0 && newStatus == "Teslim Edildi") {
                                    orders = orders.filter { it.id != detailOrder.id }
                                    selectedOrderForDetail = null
                                    snackbarMessage = "Sipariş teslim edildi olarak işaretlendi!"
                                } else {
                                    orders = orders.map {
                                        if (it.id == detailOrder.id) it.copy(status = newStatus) else it
                                    }
                                    snackbarMessage = "Durum güncellendi: $newStatus"
                                }
                            }
                        }
                    }
                )
            }
        }
    }
}

@Composable
fun OrderCard(
    order: Order,
    isAssigning: Boolean,
    onCardClick: () -> Unit,
    onAssignVehicle: (Vehicle) -> Unit,
    onUpdateStatus: (String) -> Unit
) {
    val context = LocalContext.current
    val parsedPhone = remember(order.phone) { parseOrderPhone(order.phone) }
    val isYolda = order.status.equals("Yolda", ignoreCase = true)
    val isTeslimEdildi = order.status.equals("Teslim Edildi", ignoreCase = true)

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCardClick() }
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header: Customer Name & Amount
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = order.customerName,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = Color(0xFF0F172A)
                )
                Text(
                    text = order.displayAmount,
                    fontWeight = FontWeight.Black,
                    fontSize = 17.sp,
                    color = DyDoRed
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Badges Row: Durum & Ödeme Şekli
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Durum Rozeti
                val (statusBg, statusFg, statusText) = when {
                    isYolda -> Triple(Color(0xFFE0F2FE), Color(0xFF0284C7), "🚚 Yolda")
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
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = statusFg,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }

                // Ödeme Tipi Rozeti (Nakit / Kredi Kartı)
                val isOnlineOrCard = order.paymentType.contains("Kredi", ignoreCase = true) || order.paymentType.contains("Online", ignoreCase = true)
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = if (isOnlineOrCard) Color(0xFFEFF6FF) else Color(0xFFF0FDF4)
                ) {
                    Text(
                        text = if (order.paymentType.isNotBlank()) "💳 ${order.paymentType}" else "💵 Nakit/Peşin",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (isOnlineOrCard) Color(0xFF1D4ED8) else Color(0xFF15803D),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Phone Row + Direct Call Button
            if (order.phone.isNotBlank()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "📞 ${parsedPhone.displayFormatted}",
                        fontSize = 13.sp,
                        color = Color(0xFF334155),
                        fontWeight = FontWeight.SemiBold
                    )
                    Button(
                        onClick = { dialCustomer(context, order.phone) },
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp)
                    ) {
                        Text("📞 Ara", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }

                // Getir / Trendyol Dahili Kod Varsa Belirgin Rozet
                if (parsedPhone.extensionCode != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color(0xFFFEF3C7),
                        border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "🔑 Dahili Kod: ${parsedPhone.extensionCode}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF92400E)
                            )
                            Text(
                                text = "Arama açılınca tuşlayın",
                                fontSize = 10.sp,
                                color = Color(0xFFB45309)
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
            }

            // Address
            Text(
                text = "📍 ${order.rawAddress}",
                fontSize = 13.sp,
                color = Color(0xFF334155),
                lineHeight = 18.sp
            )

            // Order details / products
            if (order.details.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "📦 ${order.details}",
                    fontSize = 13.sp,
                    color = DyDoOrange,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Current assigned vehicle pill & Arrival Time
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Araç: ", fontSize = 12.sp, color = Color.Gray)
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = if (order.currentVehicle.contains("Atanmadı")) Color(0xFFF1F5F9) else Color(0xFFFFEBEE)
                    ) {
                        Text(
                            text = order.currentVehicle,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (order.currentVehicle.contains("Atanmadı")) Color.Gray else DyDoRed,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }

                if (order.createdAt.isNotBlank()) {
                    Text(
                        text = "🕒 ${order.createdAt}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF64748B)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFFF1F5F9))
            Spacer(modifier = Modifier.height(8.dp))

            // 3 Quick Action Buttons: Araç 1, Araç 2, Araç 3
            Text(
                text = "Araca Aktar:",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF64748B)
            )

            Spacer(modifier = Modifier.height(6.dp))

            if (isAssigning) {
                Box(
                    modifier = Modifier.fillMaxWidth().height(36.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(22.dp), color = DyDoRed)
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    CloudConfig.DEFAULT_VEHICLES.forEach { vehicle ->
                        val isCurrent = order.currentVehicle.contains(vehicle.shortName)
                        OutlinedButton(
                            onClick = { onAssignVehicle(vehicle) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                containerColor = if (isCurrent) DyDoRed else Color.Transparent,
                                contentColor = if (isCurrent) Color.White else DyDoRed
                            ),
                            border = ButtonDefaults.outlinedButtonBorder.copy(
                                brush = androidx.compose.ui.graphics.SolidColor(DyDoRed)
                            ),
                            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = "🚚 ${vehicle.shortName}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Kural: Önce Yolda aşamasına getirilir, ardından Teslim Edildi butonu aktif olur
            if (!isTeslimEdildi) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // 1. Aşama: Yolda Butonu
                    Button(
                        onClick = { onUpdateStatus("Yolda") },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isYolda) Color(0xFF0284C7) else Color(0xFFE0F2FE),
                            contentColor = if (isYolda) Color.White else Color(0xFF0369A1)
                        ),
                        contentPadding = PaddingValues(vertical = 4.dp)
                    ) {
                        Text(
                            text = if (isYolda) "✓ Yolda" else "1. 🚚 Yola Çıkar",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    // 2. Aşama: Teslim Edildi Butonu (Sadece Yolda ise aktif)
                    Button(
                        onClick = {
                            if (isYolda) {
                                onUpdateStatus("Teslim Edildi")
                            } else {
                                Toast.makeText(context, "Sipariş önce Yolda aşamasına getirilmelidir!", Toast.LENGTH_SHORT).show()
                            }
                        },
                        enabled = isYolda,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isYolda) Color(0xFF16A34A) else Color(0xFFE2E8F0),
                            contentColor = if (isYolda) Color.White else Color(0xFF94A3B8),
                            disabledContainerColor = Color(0xFFF1F5F9),
                            disabledContentColor = Color(0xFF94A3B8)
                        ),
                        contentPadding = PaddingValues(vertical = 4.dp)
                    ) {
                        Text(
                            text = if (isYolda) "2. ✅ Teslim Et" else "2. Teslim Edildi",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    // Detay Butonu
                    OutlinedButton(
                        onClick = { onCardClick() },
                        shape = RoundedCornerShape(10.dp),
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text("Detay ➔", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    OutlinedButton(
                        onClick = { onCardClick() },
                        shape = RoundedCornerShape(10.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Text("Detayları İncele ➔", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

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
    val isYolda = order.status.equals("Yolda", ignoreCase = true)
    val isTeslimEdildi = order.status.equals("Teslim Edildi", ignoreCase = true)

    ModalBottomSheet(
        onDismissRequest = { onDismiss() },
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp)
                .navigationBarsPadding()
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Sipariş Detayı",
                        fontSize = 13.sp,
                        color = Color.Gray,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = order.customerName,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F172A)
                    )
                }
                IconButton(onClick = { onDismiss() }) {
                    Icon(Icons.Default.Close, contentDescription = "Kapat")
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Tutar ve Ödeme Şekli Kartı
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
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

            // Talep Edilen Ürünler (Ne İstediği)
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBEB)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "📦 Talep Edilen Ürünler (Detay)",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = DyDoOrange
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (order.details.isNotBlank()) order.details else "Ürün detayı girilmemiş.",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF451A03)
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("No: ${order.id}", fontSize = 11.sp, color = Color.Gray)
                        if (order.createdAt.isNotBlank()) {
                            Text("Geliş: ${order.createdAt}", fontSize = 11.sp, color = Color.Gray)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Telefon ve Adres Kartı (Arama ve Harita Aksiyonları ile)
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F5F9)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    // Telefon
                    if (order.phone.isNotBlank()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("📞 Telefon No", fontSize = 11.sp, color = Color.Gray)
                                Text(
                                    text = parsedPhone.displayFormatted,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF1E293B)
                                )
                            }
                            Button(
                                onClick = { dialCustomer(context, order.phone) },
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                            ) {
                                Text("📞 Hemen Ara", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        // Getir / Trendyol Dahili Kod Kutusu
                        if (parsedPhone.extensionCode != null) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0xFFFEF3C7),
                                border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text("🔑 Platform Arama Kodu (Getir/Trendyol):", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFFB45309))
                                        Text("Dahili Kod: ${parsedPhone.extensionCode}", fontSize = 16.sp, fontWeight = FontWeight.Black, color = Color(0xFF78350F))
                                    }
                                    Button(
                                        onClick = {
                                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                            val clip = ClipData.newPlainText("Dahili Kod", parsedPhone.extensionCode)
                                            clipboard.setPrimaryClip(clip)
                                            Toast.makeText(context, "Kod panoya kopyalandı: ${parsedPhone.extensionCode}", Toast.LENGTH_SHORT).show()
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706)),
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                                    ) {
                                        Text("Kopyala", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                        HorizontalDivider(color = Color(0xFFE2E8F0))
                        Spacer(modifier = Modifier.height(10.dp))
                    }

                    // Adres
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("📍 Adres", fontSize = 11.sp, color = Color.Gray)
                            Text(
                                text = order.rawAddress,
                                fontSize = 13.sp,
                                color = Color(0xFF334155),
                                lineHeight = 17.sp
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                val mapIntent = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(order.rawAddress)}"))
                                context.startActivity(mapIntent)
                            },
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3B82F6)),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Text("Harita", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Hangi Araca Atanacağı
            Text(
                text = "Hangi Araca Atanacak?",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF475569)
            )
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
                        Text(
                            text = "🚚 ${vehicle.shortName}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Sipariş Durumu: Önce Yolda, sonra Teslim Edildi
            Text(
                text = "Sipariş Durumu Aşamaları:",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF475569)
            )
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // 1. Aşama: Yolda Butonu
                Button(
                    onClick = { onUpdateStatus("Yolda") },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isYolda) Color(0xFF0284C7) else Color(0xFFE0F2FE),
                        contentColor = if (isYolda) Color.White else Color(0xFF0369A1)
                    ),
                    contentPadding = PaddingValues(vertical = 10.dp)
                ) {
                    Text(
                        text = if (isYolda) "✓ Yolda İşaretli" else "1. 🚚 Yola Çıkar",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // 2. Aşama: Teslim Edildi Butonu (Yalnızca Yolda ise aktif)
                Button(
                    onClick = {
                        if (isYolda) {
                            onUpdateStatus("Teslim Edildi")
                        } else {
                            Toast.makeText(context, "Sipariş önce Yolda aşamasına getirilmelidir!", Toast.LENGTH_SHORT).show()
                        }
                    },
                    enabled = isYolda,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isYolda) Color(0xFF16A34A) else Color(0xFFE2E8F0),
                        contentColor = if (isYolda) Color.White else Color(0xFF94A3B8),
                        disabledContainerColor = Color(0xFFF1F5F9),
                        disabledContentColor = Color(0xFF94A3B8)
                    ),
                    contentPadding = PaddingValues(vertical = 10.dp)
                ) {
                    Text(
                        text = if (isYolda) "2. ✅ Teslim Edildi" else "2. Teslim Edildi (Kilitli)",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
