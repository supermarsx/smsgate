package com.smsrelay2

import android.content.Context
import android.os.Handler
import android.os.Looper
import okhttp3.Request
import org.json.JSONObject
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.concurrent.thread

object RemoteProvisioner {
    fun provision(context: Context, onComplete: (Boolean) -> Unit) {
        thread {
            val config = ConfigStore.getConfig(context)
            val url = config.remoteConfigUrl
            if (url.isBlank()) {
                onComplete(false)
                return@thread
            }
            val requestBuilder = Request.Builder().url(url)
            val authHeader = config.remoteConfigAuthHeader.trim()
            val authValue = config.remoteConfigAuthValue
            if (authHeader.isNotBlank() && authValue.isNotBlank()) {
                requestBuilder.header(authHeader, authValue)
            }
            val request = requestBuilder.build()
            val success = try {
                HttpClient.instance.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@use false
                    val body = response.body?.string() ?: return@use false
                    val signatureHeader = config.remoteConfigSignatureHeader.trim()
                    val signatureSecret = config.remoteConfigSignatureSecret
                    if (signatureHeader.isNotBlank() && signatureSecret.isNotBlank()) {
                        val signature = response.header(signatureHeader) ?: return@use false
                        if (!verifySignature(body, signature, signatureSecret)) {
                            return@use false
                        }
                    }
                    applyConfig(context, body)
                    true
                }
            } catch (_: Exception) {
                false
            }
            Handler(Looper.getMainLooper()).post {
                onComplete(success)
            }
        }
    }

    private fun applyConfig(context: Context, body: String) {
        val json = JSONObject(body)
        applyConfigFromJson(context, json)
    }

    fun applyConfigForTest(context: Context, json: JSONObject) {
        applyConfigFromJson(context, json)
    }

    private fun applyConfigFromJson(context: Context, json: JSONObject) {
        val server = json.optJSONObject("server")
        val auth = json.optJSONObject("auth")
        val features = json.optJSONObject("features")

        server?.optString("url")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_SERVER_URL, it)
        }
        server?.optString("apiPath")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_API_PATH, it)
        }
        server?.optString("method")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_HTTP_METHOD, it)
        }

        auth?.optString("clientIdHeader")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_CLIENT_ID_HEADER, it)
        }
        auth?.optString("clientId")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_CLIENT_ID_VALUE, it)
        }
        auth?.optString("authHeader")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_AUTH_HEADER, it)
        }
        auth?.optString("authPrefix")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_AUTH_PREFIX, it)
        }
        auth?.optString("acceptHeader")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_ACCEPT_HEADER, it)
        }
        auth?.optString("acceptValue")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_ACCEPT_VALUE, it)
        }
        auth?.optString("contentTypeHeader")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_CONTENT_TYPE_HEADER, it)
        }
        auth?.optString("contentTypeValue")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_CONTENT_TYPE_VALUE, it)
        }
        auth?.optString("pin")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_PIN, it)
        }
        auth?.optString("salt")?.takeIf { it.isNotBlank() }?.let {
            ConfigStore.setString(context, ConfigStore.KEY_SALT, it)
        }

        if (features != null) {
            if (features.has("enableListener")) {
                ConfigStore.setBoolean(
                    context,
                    ConfigStore.KEY_ENABLE_LISTENER,
                    features.optBoolean("enableListener")
                )
            }
            if (features.has("enableForegroundService")) {
                ConfigStore.setBoolean(
                    context,
                    ConfigStore.KEY_ENABLE_FOREGROUND,
                    features.optBoolean("enableForegroundService")
                )
            }
            if (features.has("enableBootReceiver")) {
                ConfigStore.setBoolean(
                    context,
                    ConfigStore.KEY_ENABLE_BOOT,
                    features.optBoolean("enableBootReceiver")
                )
            }
            if (features.has("enableSocketPresence")) {
                ConfigStore.setBoolean(
                    context,
                    ConfigStore.KEY_ENABLE_SOCKET,
                    features.optBoolean("enableSocketPresence")
                )
            }
            if (features.has("notificationEnabled")) {
                ConfigStore.setBoolean(
                    context,
                    ConfigStore.KEY_NOTIFICATION_ENABLED,
                    features.optBoolean("notificationEnabled")
                )
            }
        }
    }

    private fun verifySignature(body: String, signature: String, secret: String): Boolean {
        val normalized = signature.trim()
            .removePrefix("sha256=")
            .removePrefix("SHA256=")
            .lowercase()
        if (normalized.isBlank()) return false
        val expected = hmacSha256Hex(secret, body).lowercase()
        return MessageDigest.isEqual(
            expected.toByteArray(Charsets.US_ASCII),
            normalized.toByteArray(Charsets.US_ASCII)
        )
    }

    private fun hmacSha256Hex(secret: String, body: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val bytes = mac.doFinal(body.toByteArray(Charsets.UTF_8))
        val result = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            result.append(String.format("%02x", b))
        }
        return result.toString()
    }
}
