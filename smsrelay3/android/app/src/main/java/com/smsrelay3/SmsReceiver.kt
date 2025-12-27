package com.smsrelay3

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsMessage
import com.smsrelay3.data.OutboundMessageRepository
import com.smsrelay3.sync.SyncScheduler
import com.smsrelay3.util.SimInfoResolver
import com.smsrelay3.util.SmsParser
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
            val grouped = messages.groupBy { sms ->
                Pair(sms.originatingAddress ?: "", sms.timestampMillis)
            }.values
            grouped.forEach { group ->
                val ordered = group.sortedBy { it.timestampMillis }
                val first = ordered.first()
                val sender = first.originatingAddress ?: ""
                val subId = resolveSubscriptionId(first)
                val simInfo = SimInfoResolver.resolve(context, subId)
                val body = SmsParser.stitch(ordered.mapNotNull { it.messageBody })
                val hash = SmsParser.contentHash(sender, simInfo.iccid ?: simInfo.subscriptionId?.toString(), body)
                repository.enqueueSms(
                    sender = sender,
                    content = body,
                    receivedAtMs = System.currentTimeMillis(),
                    simSlotIndex = simInfo.slotIndex,
                    subscriptionId = simInfo.subscriptionId,
                    iccid = simInfo.iccid,
                    msisdn = simInfo.msisdn,
                    source = "broadcast",
                    contentHash = hash
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
