package com.smsrelay3.reconcile

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object ReconcileScheduler {
    private const val WORK_NAME = "smsrelay3_reconcile"
    private const val DEFAULT_INTERVAL_MINUTES = 2L

    fun ensureScheduled(context: Context) {
        scheduleNext(context, DEFAULT_INTERVAL_MINUTES)
    }

    fun scheduleNext(context: Context, delayMinutes: Long) {
        val request = OneTimeWorkRequestBuilder<ReconcileWorker>()
            .setInitialDelay(delayMinutes, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }
}
