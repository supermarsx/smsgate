package com.smsrelay3.config

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsrelay3.ConfigStore
import com.smsrelay3.HttpClient
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.ConfigState
import com.smsrelay3.presence.HeartbeatScheduler
import com.smsrelay3.sim.SimScheduler
import okhttp3.Request
import org.json.JSONObject

class ConfigSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val baseUrl = ConfigStore.getConfig(applicationContext).serverUrl.trim().trimEnd('/')
        if (baseUrl.isBlank()) {
            ConfigScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
            return Result.retry()
        }
        val deviceToken = DeviceAuthStore.getDeviceToken(applicationContext)
        if (deviceToken.isNullOrBlank()) {
            ConfigScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
            return Result.retry()
        }

        val db = DatabaseProvider.get(applicationContext)
        val current = db.configStateDao().latest()
        val requestBuilder = Request.Builder()
            .url("$baseUrl/api/v1/device/config")
            .addHeader("Authorization", "Bearer $deviceToken")
        current?.etag?.let { requestBuilder.addHeader("If-None-Match", it) }

        val response = try {
            HttpClient.get(applicationContext).newCall(requestBuilder.build()).execute()
        } catch (_: Exception) {
            com.smsrelay3.LogStore.append("error", "config", "Config sync: request failed")
            ConfigScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
            return Result.retry()
        }

        response.use { res ->
            if (res.code == 304) {
                scheduleFromPolicy()
                ConfigScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
                return Result.success()
            }
            if (!res.isSuccessful) {
                com.smsrelay3.LogStore.append("error", "config", "Config sync: status ${res.code}")
                ConfigScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
                return Result.retry()
            }
            val body = res.body?.string().orEmpty()
            if (body.isBlank()) {
                ConfigScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
                return Result.retry()
            }
            val json = JSONObject(body)
            val version = json.optLong("version", System.currentTimeMillis())
            val etag = res.header("ETag")
            val state = ConfigState(
                version = version,
                etag = etag,
                lastAppliedAtMs = System.currentTimeMillis(),
                rawJson = body
            )
            db.configStateDao().upsert(state)
            com.smsrelay3.LogStore.append("info", "config", "Config sync: applied v$version")
            com.smsrelay3.ServiceModeController.apply(applicationContext)
            scheduleFromPolicy()
            ConfigScheduler.scheduleNext(applicationContext, DEFAULT_INTERVAL_SECONDS)
            return Result.success()
        }
    }

    private suspend fun scheduleFromPolicy() {
        val policy = ConfigRepository(applicationContext).latestPolicy()
        HeartbeatScheduler.scheduleNext(applicationContext, policy.heartbeatIntervalS)
        SimScheduler.scheduleNext(applicationContext, policy.simPollIntervalS)
        com.smsrelay3.contacts.ContactsSyncScheduler.scheduleNext(
            applicationContext,
            policy.contactsSyncIntervalS
        )
    }

    companion object {
        private const val DEFAULT_INTERVAL_SECONDS = 60L
    }
}
