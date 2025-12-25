package com.smsrelay3.pairing

import android.content.Context
import com.smsrelay3.ConfigStore
import com.smsrelay3.HttpClient
import com.smsrelay3.data.DeviceAuthStore
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

object PairingClient {
    private val JSON_MEDIA = "application/json".toMediaType()

    fun completeWithToken(context: Context, token: String): Boolean {
        val baseUrl = ConfigStore.getConfig(context).serverUrl.trim().trimEnd('/')
        if (baseUrl.isBlank()) return false
        val payload = JSONObject()
        payload.put("pairing_token", token)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/pairing/complete")
            .post(payload.toString().toRequestBody(JSON_MEDIA))
            .build()
        return execute(context, request)
    }

    fun completeWithUrl(context: Context, url: String): Boolean {
        val request = Request.Builder()
            .url(url)
            .post("{}".toRequestBody(JSON_MEDIA))
            .build()
        return execute(context, request)
    }

    private fun execute(context: Context, request: Request): Boolean {
        return try {
            HttpClient.instance.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use false
                val body = response.body?.string().orEmpty()
                if (body.isBlank()) return@use false
                val json = JSONObject(body)
                val deviceId = json.optString("device_id").ifBlank { json.optString("deviceId") }
                val deviceToken = json.optString("device_token").ifBlank { json.optString("deviceToken") }
                if (deviceId.isBlank() || deviceToken.isBlank()) return@use false
                DeviceAuthStore.setDeviceId(context, deviceId)
                DeviceAuthStore.setDeviceToken(context, deviceToken)
                true
            }
        } catch (_: Exception) {
            false
        }
    }
}
