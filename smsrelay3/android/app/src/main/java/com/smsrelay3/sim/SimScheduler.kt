package com.smsrelay3.sim

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object SimScheduler {
    private const val WORK_NAME = "smsrelay3_sim_poll"
    private const val DEFAULT_INTERVAL_SECONDS = 60L

    fun ensureScheduled(context: Context) {
        scheduleNext(context, DEFAULT_INTERVAL_SECONDS)
    }

    fun scheduleNext(context: Context, delaySeconds: Long) {
        val request = OneTimeWorkRequestBuilder<SimInventoryWorker>()
            .setInitialDelay(delaySeconds, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }
}
