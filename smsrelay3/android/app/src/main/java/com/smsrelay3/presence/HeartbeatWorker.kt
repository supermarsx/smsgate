package com.smsrelay3.presence

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsrelay3.ConfigStore
import com.smsrelay3.HttpClient
import com.smsrelay3.config.ConfigRepository
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.data.OutboundMessageStatus
import com.smsrelay3.data.SimInventoryRepository
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.HeartbeatSample
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.UUID

class HeartbeatWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val config = ConfigStore.getConfig(applicationContext)
        val baseUrl = config.serverUrl.trim().trimEnd('/')
        if (baseUrl.isBlank()) {
            com.smsrelay3.LogStore.append("error", "heartbeat", "Heartbeat: missing server URL")
            HeartbeatScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
            return Result.retry()
        }

        val deviceToken = DeviceAuthStore.getDeviceToken(applicationContext)
        val deviceId = DeviceAuthStore.getDeviceId(applicationContext)
        if (deviceToken.isNullOrBlank() || deviceId.isNullOrBlank()) {
            com.smsrelay3.LogStore.append("error", "heartbeat", "Heartbeat: missing device credentials")
            HeartbeatScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
            return Result.retry()
        }

        val db = DatabaseProvider.get(applicationContext)
        val queueDepth = db.outboundMessageDao().countByStatus(OutboundMessageStatus.QUEUED)
        val lastSuccess = db.outboundMessageDao().latestAttemptForStatus(OutboundMessageStatus.ACKED)
        val simSummaryHash = SimInventoryRepository(applicationContext).computeSummaryHash()
        val wsState = com.smsrelay3.runtime.AppRuntime.wsState()

        val payload = JSONObject()
        payload.put("device_id", deviceId)
        payload.put("client_time", java.time.Instant.now().toString())
        payload.put("queue_depth", queueDepth)
        if (lastSuccess != null) {
            payload.put("last_successful_ingest_at", java.time.Instant.ofEpochMilli(lastSuccess).toString())
        }
        payload.put("ws_state", wsState)
        payload.put("network_type", NetworkUtil.networkType(applicationContext))
        payload.put("battery_level", BatteryUtil.batteryPercent(applicationContext))
        payload.put("sim_summary_hash", simSummaryHash)
        payload.put("sims", org.json.JSONArray())

        val body = payload.toString().toRequestBody(JSON_MEDIA)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/presence/heartbeat")
            .addHeader("Authorization", "Bearer $deviceToken")
            .addHeader("x-device-id", deviceId)
            .post(body)
            .build()

        val startedAt = System.currentTimeMillis()
        val success = try {
            HttpClient.get(applicationContext).newCall(request).execute().use { response ->
                response.isSuccessful
            }
        } catch (_: Exception) {
            false
        }
        if (!success) {
            com.smsrelay3.LogStore.append("error", "heartbeat", "Heartbeat: send failed")
        }
        val rtt = System.currentTimeMillis() - startedAt
        val sample = HeartbeatSample(
            id = UUID.randomUUID().toString(),
            createdAtMs = System.currentTimeMillis(),
            queueDepth = queueDepth,
            networkType = NetworkUtil.networkType(applicationContext),
            batteryPercent = BatteryUtil.batteryPercent(applicationContext),
            lastSuccessSendAtMs = lastSuccess,
            lastRttMs = if (success) rtt else null,
            wsState = if (success) "connected" else "offline"
        )
        db.heartbeatDao().insert(sample)

        val policy = ConfigRepository(applicationContext).latestPolicy()
        HeartbeatScheduler.scheduleNext(applicationContext, policy.heartbeatIntervalS)
        return if (success) Result.success() else Result.retry()
    }

    companion object {
        private const val DEFAULT_INTERVAL_SECONDS = 20L
        private val JSON_MEDIA = "application/json".toMediaType()
    }
}
