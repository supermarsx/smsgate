package com.smsrelay3.presence

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object HeartbeatScheduler {
    private const val WORK_NAME = "smsrelay3_heartbeat"
    private const val DEFAULT_INTERVAL_SECONDS = 20L

    fun ensureScheduled(context: Context) {
        scheduleNext(context, DEFAULT_INTERVAL_SECONDS)
    }

    fun scheduleNext(context: Context, delaySeconds: Long) {
        val request = OneTimeWorkRequestBuilder<HeartbeatWorker>()
            .setInitialDelay(delaySeconds, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }
}
