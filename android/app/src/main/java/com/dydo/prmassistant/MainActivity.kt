package com.dydo.prmassistant

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.content.Context
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.dydo.prmassistant.data.models.CloudConfig
import com.dydo.prmassistant.data.repository.PrmRepository
import com.dydo.prmassistant.service.OrderMonitorService
import com.dydo.prmassistant.ui.screens.LiveOrdersScreen
import com.dydo.prmassistant.ui.screens.LoginScreen
import com.dydo.prmassistant.ui.screens.ReportsScreen
import com.dydo.prmassistant.ui.screens.SettingsScreen
import com.dydo.prmassistant.ui.theme.DyDoPrmTheme
import com.dydo.prmassistant.ui.theme.DyDoRed

class MainActivity : ComponentActivity() {

    private val repository = PrmRepository()

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        CloudConfig.notificationsEnabled = isGranted
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("dydo_prefs", Context.MODE_PRIVATE)
        val savedLoggedIn = prefs.getBoolean("is_logged_in", false)
        CloudConfig.isLoggedIn = savedLoggedIn

        if (savedLoggedIn) {
            OrderMonitorService.start(this)
        }

        askNotificationPermission()

        setContent {
            DyDoPrmTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var isLoggedIn by remember { mutableStateOf(CloudConfig.isLoggedIn) }

                    if (!isLoggedIn) {
                        LoginScreen(
                            repository = repository,
                            onLoginSuccess = {
                                prefs.edit().putBoolean("is_logged_in", true).apply()
                                isLoggedIn = true
                                OrderMonitorService.start(this@MainActivity)
                            }
                        )
                    } else {
                        MainScreen(
                            repository = repository,
                            onLogout = {
                                prefs.edit().putBoolean("is_logged_in", false).apply()
                                isLoggedIn = false
                                OrderMonitorService.stop(this@MainActivity)
                            }
                        )
                    }
                }
            }
        }
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}

@Composable
fun MainScreen(
    repository: PrmRepository,
    onLogout: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.ListAlt, contentDescription = "Siparişler") },
                    label = { Text("Siparişler") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = DyDoRed,
                        selectedTextColor = DyDoRed,
                        indicatorColor = DyDoRed.copy(alpha = 0.15f)
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.BarChart, contentDescription = "Raporlar") },
                    label = { Text("Raporlar") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = DyDoRed,
                        selectedTextColor = DyDoRed,
                        indicatorColor = DyDoRed.copy(alpha = 0.15f)
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Ayarlar") },
                    label = { Text("Ayarlar") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = DyDoRed,
                        selectedTextColor = DyDoRed,
                        indicatorColor = DyDoRed.copy(alpha = 0.15f)
                    )
                )
            }
        }
    ) { padding ->
        androidx.compose.foundation.layout.Box(modifier = Modifier.padding(padding)) {
            when (selectedTab) {
                0 -> LiveOrdersScreen(repository = repository)
                1 -> ReportsScreen(repository = repository)
                2 -> SettingsScreen(onLogout = onLogout)
            }
        }
    }
}

