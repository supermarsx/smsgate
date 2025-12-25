package com.smsrelay3.contacts

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object ContactsSyncScheduler {
    private const val WORK_NAME = "smsrelay3_contacts_sync"
    private const val DEFAULT_INTERVAL_SECONDS = 3600L

    fun ensureScheduled(context: Context) {
        scheduleNext(context, DEFAULT_INTERVAL_SECONDS)
    }

    fun scheduleNext(context: Context, delaySeconds: Long) {
        val request = OneTimeWorkRequestBuilder<ContactsSyncWorker>()
            .setInitialDelay(delaySeconds, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }
}
