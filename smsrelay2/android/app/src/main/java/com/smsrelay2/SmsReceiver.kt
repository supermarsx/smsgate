package com.smsrelay2

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val config = ConfigStore.getConfig(context)
        if (!config.enableListener) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        if (config.enableForegroundService && !RelayForegroundService.isRunning) {
            val serviceIntent = Intent(context, RelayForegroundService::class.java)
            ForegroundServiceGuard.start(context, serviceIntent)
        }

        messages.forEach { sms ->
            val pending = PendingMessageStore.create(
                sms.originatingAddress ?: "",
                sms.messageBody ?: "",
                System.currentTimeMillis()
            )
            PendingMessageStore.add(context, pending)
            val data = Data.Builder()
                .putString(SmsUploadWorker.KEY_MESSAGE_ID, pending.id)
                .putString(SmsUploadWorker.KEY_FROM, pending.number)
                .putString(SmsUploadWorker.KEY_BODY, pending.body)
                .putLong(SmsUploadWorker.KEY_TIMESTAMP, pending.timestamp)
                .build()
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val work = OneTimeWorkRequestBuilder<SmsUploadWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .setInputData(data)
                .build()
            WorkManager.getInstance(context).enqueue(work)
        }
    }
}
