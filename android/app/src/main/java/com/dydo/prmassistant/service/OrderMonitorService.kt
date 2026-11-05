package com.dydo.prmassistant.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.dydo.prmassistant.MainActivity
import com.dydo.prmassistant.PrmApplication
import com.dydo.prmassistant.data.models.CloudConfig
import com.dydo.prmassistant.data.repository.PrmRepository
import kotlinx.coroutines.*

class OrderMonitorService : Service() {

    private val repository = PrmRepository()
    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private val seenOrderIds = mutableSetOf<String>()
    private var isFirstCheck = true

    companion object {
        private const val NOTIFICATION_ID = 2001

        fun start(context: Context) {
            val intent = Intent(context, OrderMonitorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, OrderMonitorService::class.java)
            context.stopService(intent)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startInForeground()
        startOrderMonitoring()
    }

    private fun startInForeground() {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = NotificationCompat.Builder(this, PrmApplication.SERVICE_CHANNEL_ID)
            .setContentTitle("DyDo PRM Sipariş Takibi Aktif")
            .setContentText("Yeni gelen siparişler 10 saniyede bir kontrol ediliyor.")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startOrderMonitoring() {
        serviceScope.launch {
            while (isActive) {
                try {
                    if (CloudConfig.notificationsEnabled) {
                        val result = repository.getOrders()
                        if (result.isSuccess) {
                            val orders = result.getOrNull() ?: emptyList()

                            if (isFirstCheck) {
                                // İlk başlangıçta mevcut tüm siparişleri hafızaya al ve bildirim atılmış say
                                PrmNotificationHelper.markAllAsNotified(applicationContext, orders.map { it.id })
                                seenOrderIds.addAll(orders.map { it.id })
                                isFirstCheck = false
                            } else {
                                // Sadece daha önce bildirim atılmamış yeni siparişleri bul
                                val newOrders = orders.filter { !seenOrderIds.contains(it.id) && !PrmNotificationHelper.hasBeenNotified(applicationContext, it.id) }
                                for (newOrder in newOrders) {
                                    seenOrderIds.add(newOrder.id)
                                    PrmNotificationHelper.showNotification(
                                        context = applicationContext,
                                        title = "🔔 Yeni Sipariş: ${newOrder.customerName}",
                                        message = "${newOrder.rawAddress}\n💰 ${newOrder.displayAmount} (${newOrder.createdAt})",
                                        orderId = newOrder.id
                                    )
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Sessizce devam et
                }

                // 10 saniyede bir düzenli kontrol
                delay(10_000)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
    }
}

