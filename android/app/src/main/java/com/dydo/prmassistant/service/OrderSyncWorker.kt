package com.dydo.prmassistant.service

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.dydo.prmassistant.data.models.CloudConfig
import com.dydo.prmassistant.data.repository.PrmRepository

class OrderSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val repository = PrmRepository()

    override suspend fun doWork(): Result {
        if (!CloudConfig.notificationsEnabled) return Result.success()

        val ordersResult = repository.getOrders(onlyActive = true)
        if (ordersResult.isSuccess) {
            val orders = ordersResult.getOrNull() ?: emptyList()
            for (order in orders) {
                if (!PrmNotificationHelper.hasBeenNotified(applicationContext, order.id)) {
                    PrmNotificationHelper.showNotification(
                        applicationContext,
                        "🔔 Yeni Sipariş: ${order.customerName}",
                        "${order.rawAddress}\n💰 ${order.displayAmount} (${order.createdAt})",
                        order.id
                    )
                }
            }
        }
        return Result.success()
    }
}
