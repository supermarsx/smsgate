package com.smsrelay3.sync

import android.content.Context
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsrelay3.ConfigStore
import com.smsrelay3.HttpClient
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.data.OutboundMessageStatus
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.OutboundMessage
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
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

        var hadFailure = false
        for (message in pending) {
            val sending = message.copy(
                status = OutboundMessageStatus.SENDING,
                lastAttemptAtMs = System.currentTimeMillis()
            )
            dao.update(sending)
            val success = sendMessage(baseUrl, config.apiPath, deviceToken, sending)
            if (success) {
                dao.update(sending.copy(status = OutboundMessageStatus.ACKED))
            } else {
                com.smsrelay3.LogStore.append("error", "sync", "Sync: send failed ${message.id}")
                val attempts = sending.retryCount + 1
                val status = if (attempts >= DEFAULT_MAX_ATTEMPTS) {
                    OutboundMessageStatus.FAILED
                } else {
                    OutboundMessageStatus.QUEUED
                }
                dao.update(
                    sending.copy(
                        status = status,
                        retryCount = attempts
                    )
                )
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
        val json = JSONObject()
        json.put("device_id", message.deviceId)
        json.put("device_seq", message.seq)
        json.put("received_at_device_ms", message.smsReceivedAtMs)
        json.put("sender", message.sender)
        json.put("content", message.content)
        json.put("content_hash", message.contentHash)
        json.put("sim_slot_index", message.simSlotIndex)
        json.put("subscription_id", message.subscriptionId)
        json.put("iccid", message.iccid)
        json.put("msisdn", message.msisdn)
        json.put("source", "android_sms")
        val metadata = JSONObject()
        metadata.put("manufacturer", Build.MANUFACTURER)
        metadata.put("model", Build.MODEL)
        metadata.put("sdk_int", Build.VERSION.SDK_INT)
        json.put("metadata", metadata)

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

    companion object {
        private const val DEFAULT_BATCH_SIZE = 10
        private const val DEFAULT_MAX_ATTEMPTS = 5
        private val JSON_MEDIA = "application/json".toMediaType()
    }
}
