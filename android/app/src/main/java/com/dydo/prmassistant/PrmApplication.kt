package com.dydo.prmassistant

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.dydo.prmassistant.service.OrderSyncWorker
import java.util.concurrent.TimeUnit

class PrmApplication : Application() {

    companion object {
        const val CHANNEL_ID = "prm_orders_channel"
        const val SERVICE_CHANNEL_ID = "prm_service_channel"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        scheduleBackgroundSync()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)

            // 1. Yeni Siparişler için Yüksek Öncelikli Kanal (Sesli & Titreşimli)
            val name = getString(R.string.notification_channel_name)
            val descriptionText = getString(R.string.notification_channel_desc)
            val importance = NotificationManager.IMPORTANCE_HIGH

            val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build()

            val orderChannel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 200, 300)
                setSound(defaultSoundUri, audioAttributes)
            }
            notificationManager.createNotificationChannel(orderChannel)

            // 2. Arka Plan Canlı Takip Servisi Kanalı (Sessiz)
            val serviceChannel = NotificationChannel(
                SERVICE_CHANNEL_ID,
                "DyDo Canlı Takip Servisi",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Canlı siparişleri arka planda kontrol eden servis"
                enableVibration(false)
                setSound(null, null)
            }
            notificationManager.createNotificationChannel(serviceChannel)
        }
    }

    private fun scheduleBackgroundSync() {
        val workRequest = PeriodicWorkRequestBuilder<OrderSyncWorker>(15, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "prm_order_sync_work",
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
    }
}

