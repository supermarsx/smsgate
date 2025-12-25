package com.smsrelay3.retention

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object PruneScheduler {
    private const val WORK_NAME = "smsrelay3_prune"
    private const val DEFAULT_INTERVAL_HOURS = 6L

    fun ensureScheduled(context: Context) {
        scheduleNext(context, DEFAULT_INTERVAL_HOURS)
    }

    fun scheduleNext(context: Context, delayHours: Long) {
        val request = OneTimeWorkRequestBuilder<PruneWorker>()
            .setInitialDelay(delayHours, TimeUnit.HOURS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }
}
