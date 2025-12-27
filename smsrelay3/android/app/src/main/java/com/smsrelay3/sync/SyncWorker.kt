package com.smsrelay3.sync

import android.content.Context
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsrelay3.ConfigStore
import com.smsrelay3.HttpClient
import com.smsrelay3.LogStore
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
        val pending = dao.loadByStatus(OutboundMessageStatus.QUEUED, DEFAULT_BATCH_SIZE)
        if (pending.isEmpty()) return Result.success()

        if (pending.size > 1 && tryBatchSend(baseUrl, config.apiPath, deviceToken, pending)) {
            val now = System.currentTimeMillis()
            pending.forEach { msg ->
                dao.update(onSendSuccess(onSendStart(msg, now)))
            }
            LogStore.append("info", "sync", "Batch sent ${pending.size} messages")
            return Result.success()
        }

        var hadFailure = false
        for (message in pending) {
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
                val failure = onSendFailure(sending)
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
                .post(body)
                .build()
            HttpClient.get(applicationContext).newCall(request).execute().use { response ->
                response.isSuccessful
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
        private const val DEFAULT_BATCH_SIZE = 10
        private const val DEFAULT_MAX_ATTEMPTS = 5
        private const val DEDUP_WINDOW_MS = 5 * 60 * 1000
        private val JSON_MEDIA = "application/json".toMediaType()
    }
}
