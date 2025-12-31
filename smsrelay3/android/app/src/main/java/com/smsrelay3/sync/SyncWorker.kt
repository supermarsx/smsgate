package com.smsrelay3.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsrelay3.ConfigStore
import com.smsrelay3.HttpClient
import com.smsrelay3.LogStore
import com.smsrelay3.config.ConfigRepository
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.data.OutboundMessageStatus
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.OutboundMessage
import com.smsrelay3.sync.QueueStateMachine.onSendFailure
import com.smsrelay3.sync.QueueStateMachine.onSendStart
import com.smsrelay3.sync.QueueStateMachine.onSendSuccess
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.min

class SyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
        override suspend fun doWork(): Result {
            val config = ConfigStore.getConfig(applicationContext)
            val baseUrl = config.serverUrl.trim().trimEnd('/')
            if (baseUrl.isBlank()) {
                com.smsrelay3.LogStore.append("error", "sync", "Sync: missing server URL")
                return Result.retry()
            }

            val deviceToken = DeviceAuthStore.getDeviceToken(applicationContext)
            val deviceId = DeviceAuthStore.getDeviceId(applicationContext)
            if (deviceToken.isNullOrBlank() || deviceId.isNullOrBlank()) {
                com.smsrelay3.LogStore.append("error", "sync", "Sync: missing device token")
                return Result.retry()
            }

        val db = DatabaseProvider.get(applicationContext)
        val dao = db.outboundMessageDao()
        val policy = ConfigRepository(applicationContext).latestPolicy()
        val pending = dao.loadByStatus(
            OutboundMessageStatus.QUEUED,
            min(policy.syncBatchMaxSize, MAX_BATCH_READ)
        )
        if (pending.isEmpty()) return Result.success()
        val now = System.currentTimeMillis()
        val due = pending.filter { message ->
            val lastAttempt = message.lastAttemptAtMs ?: return@filter true
            val waitMs = QueueStateMachine.nextDelayMillis(
                message.retryCount,
                policy.syncRetryBaseMs,
                policy.syncRetryMaxMs
            )
            (now - lastAttempt) >= waitMs
        }
        if (due.isEmpty()) {
            LogStore.append("info", "sync", "Sync: no messages due (respecting backoff)")
            return Result.success()
        }

            if (due.size > 1 && tryBatchSend(baseUrl, config.apiPath, deviceId, deviceToken, due)) {
                val now = System.currentTimeMillis()
                due.forEach { msg ->
                    dao.update(onSendSuccess(onSendStart(msg, now)))
                }
                LogStore.append("info", "sync", "Batch sent ${due.size} messages")
            return Result.success()
        }

        var hadFailure = false
        for (message in due) {
            val alreadyAcked = dao.countStatusByHashBetween(
                OutboundMessageStatus.ACKED,
                message.contentHash,
                message.smsReceivedAtMs - DEDUP_WINDOW_MS,
                message.smsReceivedAtMs + DEDUP_WINDOW_MS
            ) > 0
            if (alreadyAcked) {
                dao.update(message.copy(status = OutboundMessageStatus.ACKED, lastAttemptAtMs = System.currentTimeMillis()))
                continue
            }
            val sending = onSendStart(message, System.currentTimeMillis())
            dao.update(sending)
                val success = sendMessage(baseUrl, config.apiPath, deviceId, deviceToken, listOf(sending))
                if (success) {
                    dao.update(onSendSuccess(sending))
                } else {
                    com.smsrelay3.LogStore.append("error", "sync", "Sync: send failed ${message.id}")
                    val failure = onSendFailure(
                    sending,
                    maxAttempts = policy.syncMaxAttempts,
                    baseDelayMs = policy.syncRetryBaseMs,
                    maxDelayMs = policy.syncRetryMaxMs
                )
                dao.update(failure.message)
                hadFailure = true
            }
        }

        return if (hadFailure) Result.retry() else Result.success()
    }

        private fun sendMessage(
            baseUrl: String,
            apiPath: String,
            deviceId: String,
            deviceToken: String,
            messages: List<OutboundMessage>
        ): Boolean {
            val body = buildEventsPayload(deviceId, messages).toString().toRequestBody(JSON_MEDIA)
            val path = apiPath.trim().ifBlank { "/api/v1/ingest" }
            val request = Request.Builder()
                .url("$baseUrl$path")
                .addHeader("Authorization", "Bearer $deviceToken")
                .addHeader("x-device-id", deviceId)
                .addHeader("Accept", "application/json")
                .post(body)
                .build()

            return try {
                HttpClient.get(applicationContext).newCall(request).execute().use { response ->
                    response.isSuccessful
                }
            } catch (_: Exception) {
                false
            }
        }

        private fun tryBatchSend(
            baseUrl: String,
            apiPath: String,
            deviceId: String,
            deviceToken: String,
            messages: List<OutboundMessage>
        ): Boolean {
            return sendMessage(baseUrl, apiPath, deviceId, deviceToken, messages)
        }

        private fun buildEventsPayload(deviceId: String, messages: List<OutboundMessage>): JSONObject {
            val array = JSONArray()
            messages.forEach { msg ->
                val event = JSONObject().apply {
                    put("id", msg.id)
                    put("device_id", deviceId)
                    put("number_e164", msg.msisdn ?: JSONObject.NULL)
                    put("subscription_id", msg.subscriptionId ?: JSONObject.NULL)
                    put("sim_slot_index", msg.simSlotIndex)
                    if (msg.iccid != null) put("iccid", msg.iccid)
                    put("sender", msg.sender)
                    put("content", msg.content)
                    put("device_received_at", java.time.Instant.ofEpochMilli(msg.smsReceivedAtMs).toString())
                    put("source", msg.source)
                    put("content_hash", msg.contentHash)
                }
                array.put(event)
            }
            return JSONObject().apply { put("events", array) }
        }

    companion object {
        private const val DEDUP_WINDOW_MS = 5 * 60 * 1000
        private const val MAX_BATCH_READ = 50
        private val JSON_MEDIA = "application/json".toMediaType()
    }
}
