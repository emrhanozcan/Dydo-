package com.dydo.prmassistant.ui.screens

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.dydo.prmassistant.service.PrmNotificationHelper
import com.dydo.prmassistant.ui.theme.DyDoRed

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    var notificationsEnabled by remember { mutableStateOf(CloudConfig.notificationsEnabled) }
    var supabaseUrl by remember { mutableStateOf(CloudConfig.supabaseUrl) }
    var supabaseAnonKey by remember { mutableStateOf(CloudConfig.supabaseAnonKey) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ayarlar", fontWeight = FontWeight.Bold, fontSize = 20.sp) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = DyDoRed,
                    titleContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF8FAFC))
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Account Card
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Bağlı Hesap", fontSize = 12.sp, color = Color.Gray)
                    Text(CloudConfig.userEmail, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A))
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = {
                            CloudConfig.isLoggedIn = false
                            onLogout()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Çıkış Yap")
                    }
                }
            }

            // Notifications Card
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Sipariş Bildirimleri", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Text("Yeni sipariş geldiğinde anlık sesli bildirim gönder", fontSize = 12.sp, color = Color.Gray)
                        }
                        Switch(
                            checked = notificationsEnabled,
                            onCheckedChange = {
                                notificationsEnabled = it
                                CloudConfig.notificationsEnabled = it
                            }
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedButton(
                        onClick = {
                            PrmNotificationHelper.showNotification(
                                context,
                                "🔔 Test Bildirimi",
                                "DyDo PRM Supabase Mobil Bildirim Sistemi başarıyla çalışıyor!",
                                "test_order_123"
                            )
                        },
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Test Bildirimi Gönder")
                    }
                }
            }

            // Supabase Settings Card
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("⚡ Supabase Bağlantısı", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = supabaseUrl,
                        onValueChange = {
                            supabaseUrl = it
                            CloudConfig.supabaseUrl = it
                        },
                        label = { Text("Supabase Proje URL") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = supabaseAnonKey,
                        onValueChange = {
                            supabaseAnonKey = it
                            CloudConfig.supabaseAnonKey = it
                        },
                        label = { Text("Supabase Anon Key") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )
                }
            }
        }
    }
}
