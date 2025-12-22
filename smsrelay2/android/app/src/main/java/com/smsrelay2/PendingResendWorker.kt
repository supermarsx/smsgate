package com.smsrelay2

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class PendingResendWorker(appContext: Context, workerParams: WorkerParameters) :
    Worker(appContext, workerParams) {
    override fun doWork(): Result {
        val pending = PendingMessageStore.list(applicationContext)
        if (pending.isEmpty()) return Result.success()
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val workManager = WorkManager.getInstance(applicationContext)
        for (message in pending) {
            val data = Data.Builder()
                .putString(SmsUploadWorker.KEY_MESSAGE_ID, message.id)
                .putString(SmsUploadWorker.KEY_FROM, message.number)
                .putString(SmsUploadWorker.KEY_BODY, message.body)
                .putLong(SmsUploadWorker.KEY_TIMESTAMP, message.timestamp)
                .build()
            val work = OneTimeWorkRequestBuilder<SmsUploadWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .setInputData(data)
                .build()
            workManager.enqueue(work)
        }
        return Result.success()
    }

    companion object {
        private const val UNIQUE_NAME = "pending_resend"

        fun enqueue(context: Context) {
            val work = OneTimeWorkRequestBuilder<PendingResendWorker>().build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_NAME,
                ExistingWorkPolicy.REPLACE,
                work
            )
        }
    }
}
