package com.smsrelay3.sync

import android.content.Context
import android.os.Build
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
        if (deviceToken.isNullOrBlank()) {
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

        if (due.size > 1 && tryBatchSend(baseUrl, config.apiPath, deviceToken, due)) {
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
            val success = sendMessage(baseUrl, config.apiPath, deviceToken, sending)
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
        deviceToken: String,
        message: OutboundMessage
    ): Boolean {
        val json = buildMessageJson(message)
        val body = json.toString().toRequestBody(JSON_MEDIA)
        val path = apiPath.trim().ifBlank { "/api/v1/ingest" }
        val request = Request.Builder()
            .url("$baseUrl$path")
            .addHeader("Authorization", "Bearer $deviceToken")
            .addHeader("Accept", "application/json")
            .post(body)
            .build()

        return try {
            HttpClient.get(applicationContext).newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use false
                val payload = response.body?.string().orEmpty()
                if (payload.isBlank()) return@use false
                val json = runCatching { JSONObject(payload) }.getOrNull() ?: return@use false
                json.has("event_id") || json.has("eventId") || json.has("device_seq")
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun tryBatchSend(
        baseUrl: String,
        apiPath: String,
        deviceToken: String,
        messages: List<OutboundMessage>
    ): Boolean {
        return try {
            val path = apiPath.trim().ifBlank { "/api/v1/ingest" }
            val batchPath = if (path.endsWith("/ingest")) "$path/batch" else "$path/batch"
            val array = JSONArray()
            messages.forEach { array.put(buildMessageJson(it)) }
            val body = JSONObject().apply { put("messages", array) }
                .toString()
                .toRequestBody(JSON_MEDIA)
            val request = Request.Builder()
                .url("$baseUrl$batchPath")
                .addHeader("Authorization", "Bearer $deviceToken")
                .addHeader("Accept", "application/json")
                .post(body)
                .build()
            HttpClient.get(applicationContext).newCall(request).execute().use { response ->
                val payload = response.body?.string().orEmpty()
                response.isSuccessful && payload.isNotBlank()
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun buildMessageJson(message: OutboundMessage): JSONObject {
        return JSONObject().apply {
            put("device_id", message.deviceId)
            put("device_seq", message.seq)
            put("received_at_device_ms", message.smsReceivedAtMs)
            put("sender", message.sender)
            put("content", message.content)
            put("content_hash", message.contentHash)
            put("sim_slot_index", message.simSlotIndex)
            put("subscription_id", message.subscriptionId)
            put("iccid", message.iccid)
            put("msisdn", message.msisdn)
            put("source", message.source)
            put("metadata", JSONObject().apply {
                put("manufacturer", Build.MANUFACTURER)
                put("model", Build.MODEL)
                put("sdk_int", Build.VERSION.SDK_INT)
            })
        }
    }

    companion object {
        private const val DEDUP_WINDOW_MS = 5 * 60 * 1000
        private const val MAX_BATCH_READ = 50
        private val JSON_MEDIA = "application/json".toMediaType()
    }
}
