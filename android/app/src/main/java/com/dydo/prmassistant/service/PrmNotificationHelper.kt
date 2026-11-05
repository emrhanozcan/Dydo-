package com.dydo.prmassistant.service

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat
import com.dydo.prmassistant.MainActivity
import com.dydo.prmassistant.PrmApplication

object PrmNotificationHelper {

    private const val PREFS_NAME = "prm_notifications"
    private const val KEY_NOTIFIED_IDS = "notified_order_ids"

    fun hasBeenNotified(context: Context, orderId: String): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val set = prefs.getStringSet(KEY_NOTIFIED_IDS, emptySet()) ?: emptySet()
        return set.contains(orderId)
    }

    fun markAsNotified(context: Context, orderId: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val set = prefs.getStringSet(KEY_NOTIFIED_IDS, emptySet())?.toMutableSet() ?: mutableSetOf()
        set.add(orderId)
        if (set.size > 500) {
            val trimmed = set.toList().takeLast(400).toSet()
            prefs.edit().putStringSet(KEY_NOTIFIED_IDS, trimmed).apply()
        } else {
            prefs.edit().putStringSet(KEY_NOTIFIED_IDS, set).apply()
        }
    }

    fun markAllAsNotified(context: Context, orderIds: Collection<String>) {
        if (orderIds.isEmpty()) return
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val set = prefs.getStringSet(KEY_NOTIFIED_IDS, emptySet())?.toMutableSet() ?: mutableSetOf()
        set.addAll(orderIds)
        prefs.edit().putStringSet(KEY_NOTIFIED_IDS, set).apply()
    }

    fun showNotification(context: Context, title: String, message: String, orderId: String) {
        markAsNotified(context, orderId)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("orderId", orderId)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            orderId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val notificationBuilder = NotificationCompat.Builder(context, PrmApplication.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setAutoCancel(true)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 300, 200, 300))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(orderId.hashCode(), notificationBuilder.build())
    }
}

