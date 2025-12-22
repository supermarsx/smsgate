package com.smsrelay2

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val config = ConfigStore.getConfig(context)
        if (!config.enableListener) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        if (config.enableForegroundService && !RelayForegroundService.isRunning) {
            val serviceIntent = Intent(context, RelayForegroundService::class.java)
            ContextCompat.startForegroundService(context, serviceIntent)
        }

        messages.forEach { sms ->
            val data = Data.Builder()
                .putString(SmsUploadWorker.KEY_FROM, sms.originatingAddress ?: "")
                .putString(SmsUploadWorker.KEY_BODY, sms.messageBody ?: "")
                .putLong(SmsUploadWorker.KEY_TIMESTAMP, System.currentTimeMillis())
                .build()
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val work = OneTimeWorkRequestBuilder<SmsUploadWorker>()
                .setConstraints(constraints)
                .setInputData(data)
                .build()
            WorkManager.getInstance(context).enqueue(work)
        }
    }
}
