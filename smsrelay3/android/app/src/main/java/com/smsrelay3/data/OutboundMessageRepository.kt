package com.smsrelay3.data

import android.content.Context
import com.smsrelay3.HashUtil
import com.smsrelay3.LogStore
import com.smsrelay3.config.ConfigRepository
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.OutboundMessage
import java.util.UUID

class OutboundMessageRepository(private val context: Context) {
    private val db = DatabaseProvider.get(context)

    suspend fun enqueueSms(
        sender: String,
        content: String,
        receivedAtMs: Long,
        simSlotIndex: Int?,
        subscriptionId: Int?,
        iccid: String?,
        msisdn: String?,
        source: String,
        contentHash: String? = null
    ): OutboundMessage {
        val policy = ConfigRepository(context).latestPolicy()
        val queuedCount = db.outboundMessageDao().countByStatus(OutboundMessageStatus.QUEUED)
        if (queuedCount >= policy.syncQueueMaxDepth) {
            db.outboundMessageDao().deleteOldestByStatus(OutboundMessageStatus.QUEUED)
            LogStore.append("warn", "sync", "Queue depth limit reached; evicted oldest queued to admit new")
        }
        val deviceId = DeviceAuthStore.getDeviceId(context) ?: "unpaired"
        val seq = DeviceSequenceStore.nextSeq(context)
        val createdAt = System.currentTimeMillis()
        val hashSeed = contentHash ?: "$sender|$content|$receivedAtMs|$simSlotIndex|$subscriptionId"
        val message = OutboundMessage(
            id = UUID.randomUUID().toString(),
            deviceId = deviceId,
            seq = seq,
            createdAtMs = createdAt,
            smsReceivedAtMs = receivedAtMs,
            sender = sender,
            content = content,
            contentHash = HashUtil.sha256(hashSeed),
            simSlotIndex = simSlotIndex,
            subscriptionId = subscriptionId,
            iccid = iccid,
            msisdn = msisdn,
            status = OutboundMessageStatus.QUEUED,
            retryCount = 0,
            lastAttemptAtMs = null,
            source = source
        )
        db.outboundMessageDao().insert(message)
        return message
    }
}
