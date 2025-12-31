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

        val repo = SimInventoryRepository(applicationContext)
        val previous = repo.loadAll()
        val snapshots = SimInventoryReader.readSnapshots(applicationContext)
        repo.saveSnapshots(snapshots)
        if (snapshots.isEmpty()) {
            val policy = ConfigRepository(applicationContext).latestPolicy()
            SimScheduler.scheduleNext(applicationContext, policy.simPollIntervalS)
            return Result.success()
        }
        val diff = SimInventoryRepository.diff(previous, snapshots)
        val hasChanges = diff.added.isNotEmpty() || diff.removed.isNotEmpty() || diff.moved.isNotEmpty()

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
        payload.put("diff", JSONObject().apply {
            put("added", JSONArray().apply { diff.added.forEach { put(it.iccid) } })
            put("removed", JSONArray().apply { diff.removed.forEach { put(it.iccid) } })
            put("moved", JSONArray().apply {
                diff.moved.forEach { put(JSONObject().apply {
                    put("iccid", it.iccid)
                    put("slot_index", it.slotIndex)
                    put("subscription_id", it.subscriptionId)
                }) }
            })
        })

        val body = payload.toString().toRequestBody(JSON_MEDIA)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/device/sims")
            .addHeader("Authorization", "Bearer $deviceToken")
            .addHeader("x-device-id", deviceId)
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
        } else if (hasChanges) {
            com.smsrelay3.LogStore.append("info", "sim", "SIM: inventory changed added=${diff.added.size} removed=${diff.removed.size} moved=${diff.moved.size}")
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
