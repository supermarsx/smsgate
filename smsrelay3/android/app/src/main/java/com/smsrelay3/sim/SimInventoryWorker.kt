package com.smsrelay3.sim

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsrelay3.ConfigStore
import com.smsrelay3.HttpClient
import com.smsrelay3.config.ConfigRepository
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.data.SimInventoryRepository
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class SimInventoryWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val config = ConfigStore.getConfig(applicationContext)
        val baseUrl = config.serverUrl.trim().trimEnd('/')
        if (baseUrl.isBlank()) {
            com.smsrelay3.LogStore.append("error", "sim", "SIM: missing server URL")
            SimScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
            return Result.retry()
        }

        val deviceToken = DeviceAuthStore.getDeviceToken(applicationContext)
        val deviceId = DeviceAuthStore.getDeviceId(applicationContext)
        if (deviceToken.isNullOrBlank() || deviceId.isNullOrBlank()) {
            com.smsrelay3.LogStore.append("error", "sim", "SIM: missing device credentials")
            SimScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
            return Result.retry()
        }

        val snapshots = SimInventoryReader.readSnapshots(applicationContext)
        val repo = SimInventoryRepository(applicationContext)
        repo.saveSnapshots(snapshots)
        if (snapshots.isEmpty()) {
            val policy = ConfigRepository(applicationContext).latestPolicy()
            SimScheduler.scheduleNext(applicationContext, policy.simPollIntervalS)
            return Result.success()
        }

        val sims = JSONArray()
        snapshots.forEach { item ->
            val sim = JSONObject()
            sim.put("slot_index", item.slotIndex)
            sim.put("subscription_id", item.subscriptionId)
            sim.put("iccid", item.iccid)
            sim.put("msisdn", item.msisdn)
            sim.put("carrier_name", item.carrierName)
            sim.put("status", item.status)
            sims.put(sim)
        }
        val payload = JSONObject()
        payload.put("device_id", deviceId)
        payload.put("captured_at_ms", System.currentTimeMillis())
        payload.put("sims", sims)

        val body = payload.toString().toRequestBody(JSON_MEDIA)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/device/sims")
            .addHeader("Authorization", "Bearer $deviceToken")
            .post(body)
            .build()

        val success = try {
            HttpClient.get(applicationContext).newCall(request).execute().use { response ->
                response.isSuccessful
            }
        } catch (_: Exception) {
            false
        }
        if (!success) {
            com.smsrelay3.LogStore.append("error", "sim", "SIM: upload failed")
        }

        val policy = ConfigRepository(applicationContext).latestPolicy()
        SimScheduler.scheduleNext(applicationContext, policy.simPollIntervalS)
        return if (success) Result.success() else Result.retry()
    }

    companion object {
        private const val DEFAULT_INTERVAL_SECONDS = 60L
        private val JSON_MEDIA = "application/json".toMediaType()
    }
}
