package com.smsrelay3.pairing

import android.content.Context
import com.smsrelay3.ConfigStore
import com.smsrelay3.HttpClient
import com.smsrelay3.LogStore
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.ConfigState
import com.smsrelay3.config.ConfigRepository
import com.smsrelay3.config.ConfigScheduler
import com.smsrelay3.contacts.ContactsSyncScheduler
import com.smsrelay3.presence.HeartbeatScheduler
import com.smsrelay3.sim.SimScheduler
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import kotlinx.coroutines.runBlocking

object PairingClient {
    private val JSON_MEDIA = "application/json".toMediaType()
    private const val MAX_ATTEMPTS = 2

    data class PairingResult(
        val success: Boolean,
        val message: String? = null,
        val expired: Boolean = false,
        val retryable: Boolean = false
    )

    fun completeWithToken(context: Context, token: String): PairingResult {
        val baseUrl = ConfigStore.getConfig(context).serverUrl.trim().trimEnd('/')
        if (baseUrl.isBlank()) return PairingResult(false, "Missing server URL")
        val payload = JSONObject()
        payload.put("pairing_token", token)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/pairing/complete")
            .post(payload.toString().toRequestBody(JSON_MEDIA))
            .build()
        return execute(context, request)
    }

    fun completeWithUrl(context: Context, url: String): PairingResult {
        val request = Request.Builder()
            .url(url)
            .post("{}".toRequestBody(JSON_MEDIA))
            .build()
        return execute(context, request)
    }

    private fun execute(context: Context, request: Request): PairingResult {
        repeat(MAX_ATTEMPTS) { attempt ->
            try {
                HttpClient.get(context).newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        val body = response.body?.string().orEmpty()
                        val message = parseErrorMessage(body) ?: "HTTP ${response.code}"
                        val expired = response.code == 401 || response.code == 403 || response.code == 404 || response.code == 410
                        val retryable = response.code in 500..599
                        if (retryable && attempt < MAX_ATTEMPTS - 1) {
                            LogStore.append("warn", "pairing", "Pairing: retrying after ${response.code}")
                            return@use
                        }
                        return PairingResult(false, message, expired = expired, retryable = retryable)
                    }
                    val body = response.body?.string().orEmpty()
                    if (body.isBlank()) return PairingResult(false, "Empty response from server")
                    val json = JSONObject(body)
                    val deviceId = json.optString("device_id").ifBlank { json.optString("deviceId") }
                    val deviceToken = json.optString("device_token").ifBlank { json.optString("deviceToken") }
                    if (deviceId.isBlank() || deviceToken.isBlank()) {
                        return PairingResult(false, "Missing device credentials")
                    }
                    DeviceAuthStore.setDeviceId(context, deviceId)
                    DeviceAuthStore.setDeviceToken(context, deviceToken)
                    applyInitialConfig(context, json)
                    schedulePostPairing(context)
                    return PairingResult(true)
                }
            } catch (ex: Exception) {
                val retryable = attempt < MAX_ATTEMPTS - 1
                LogStore.append("warn", "pairing", "Pairing: network error ${ex.javaClass.simpleName}")
                if (!retryable) {
                    return PairingResult(false, "Network error", retryable = true)
                }
            }
        }
        return PairingResult(false, "Pairing failed", retryable = true)
    }

    private fun parseErrorMessage(body: String): String? {
        if (body.isBlank()) return null
        return try {
            val json = JSONObject(body)
            json.optString("error").ifBlank { json.optString("message") }.ifBlank { null }
        } catch (_: Exception) {
            null
        }
    }

    private fun applyInitialConfig(context: Context, json: JSONObject) {
        val configObj = json.optJSONObject("config")
            ?: json.optJSONObject("policy")
            ?: json.optJSONObject("config_snapshot")
        val configString = configObj?.toString().orEmpty()
        val version = json.optLong("config_version", -1L).takeIf { it > 0 }
            ?: configObj?.optLong("version", -1L)?.takeIf { it > 0 }
            ?: json.optLong("version", -1L).takeIf { it > 0 }
        if (configString.isBlank() && version == null) return
        val state = ConfigState(
            version = version ?: System.currentTimeMillis(),
            etag = null,
            lastAppliedAtMs = System.currentTimeMillis(),
            rawJson = configString.ifBlank { null }
        )
        runBlocking {
            DatabaseProvider.get(context).configStateDao().upsert(state)
        }
    }

    private fun schedulePostPairing(context: Context) {
        ConfigScheduler.scheduleNext(context, 1L)
        runBlocking {
            val policy = ConfigRepository(context).latestPolicy()
            HeartbeatScheduler.scheduleNext(context, policy.heartbeatIntervalS)
            SimScheduler.scheduleNext(context, policy.simPollIntervalS)
            ContactsSyncScheduler.scheduleNext(context, policy.contactsSyncIntervalS)
        }
    }
}
