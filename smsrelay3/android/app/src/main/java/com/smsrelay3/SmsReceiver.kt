package com.smsrelay3

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsMessage
import com.smsrelay3.data.OutboundMessageRepository
import com.smsrelay3.sync.SyncScheduler
import com.smsrelay3.util.SimInfoResolver
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
                val subId = resolveSubscriptionId(sms)
                val simInfo = SimInfoResolver.resolve(context, subId)
                repository.enqueueSms(
                    sender = sms.originatingAddress ?: "",
                    content = sms.messageBody ?: "",
                    receivedAtMs = System.currentTimeMillis(),
                    simSlotIndex = simInfo.slotIndex,
                    subscriptionId = simInfo.subscriptionId,
                    iccid = simInfo.iccid,
                    msisdn = simInfo.msisdn,
                    source = "broadcast"
                )
            }
            SyncScheduler.enqueueNow(context)
            result.finish()
        }
    }

    private fun resolveSubscriptionId(sms: SmsMessage): Int? {
        return try {
            val method = sms.javaClass.getMethod("getSubscriptionId")
            val value = method.invoke(sms) as? Int ?: return null
            value.takeIf { it > 0 }
        } catch (_: Exception) {
            null
        }
    }
}
