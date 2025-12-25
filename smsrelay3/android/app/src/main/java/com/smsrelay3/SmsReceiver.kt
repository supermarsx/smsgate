package com.smsrelay3

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.smsrelay3.data.OutboundMessageRepository
import com.smsrelay3.sync.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

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

        val result = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            val repository = OutboundMessageRepository(context)
            messages.forEach { sms ->
                repository.enqueueSms(
                    sender = sms.originatingAddress ?: "",
                    content = sms.messageBody ?: "",
                    receivedAtMs = System.currentTimeMillis(),
                    simSlotIndex = null,
                    subscriptionId = sms.subscriptionId.takeIf { it > 0 },
                    iccid = null,
                    msisdn = null,
                    source = "broadcast"
                )
            }
            SyncScheduler.enqueueNow(context)
            result.finish()
        }
    }
}
