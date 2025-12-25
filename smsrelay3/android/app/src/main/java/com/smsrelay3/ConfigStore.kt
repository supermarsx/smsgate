package com.smsrelay3

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

data class AppConfig(
    val serverUrl: String,
    val apiPath: String,
    val httpMethod: String,
    val remoteConfigUrl: String,
    val remoteConfigAuthHeader: String,
    val remoteConfigAuthValue: String,
    val remoteConfigSignatureHeader: String,
    val remoteConfigSignatureSecret: String,
    val discoveryPort: Int,
    val clientIdHeader: String,
    val clientIdValue: String,
    val authHeader: String,
    val authPrefix: String,
    val acceptHeader: String,
    val acceptValue: String,
    val contentTypeHeader: String,
    val contentTypeValue: String,
    val pin: String,
    val salt: String,
    val enableListener: Boolean,
    val enableForegroundService: Boolean,
    val enableBootReceiver: Boolean,
    val enableSocketPresence: Boolean,
    val notificationEnabled: Boolean,
    val servicesEnabled: Boolean
)

object ConfigStore {
    private const val PREFS_NAME = "smsrelay3_secure_prefs"

    const val KEY_SERVER_URL = "server_url"
    const val KEY_API_PATH = "api_path"
    const val KEY_HTTP_METHOD = "http_method"
    const val KEY_REMOTE_CONFIG_URL = "remote_config_url"
    const val KEY_REMOTE_CONFIG_AUTH_HEADER = "remote_config_auth_header"
    const val KEY_REMOTE_CONFIG_AUTH_VALUE = "remote_config_auth_value"
    const val KEY_REMOTE_CONFIG_SIGNATURE_HEADER = "remote_config_signature_header"
    const val KEY_REMOTE_CONFIG_SIGNATURE_SECRET = "remote_config_signature_secret"
    const val KEY_DISCOVERY_PORT = "discovery_port"
    const val KEY_CLIENT_ID_HEADER = "client_id_header"
    const val KEY_CLIENT_ID_VALUE = "client_id_value"
    const val KEY_AUTH_HEADER = "auth_header"
    const val KEY_AUTH_PREFIX = "auth_prefix"
    const val KEY_ACCEPT_HEADER = "accept_header"
    const val KEY_ACCEPT_VALUE = "accept_value"
    const val KEY_CONTENT_TYPE_HEADER = "content_type_header"
    const val KEY_CONTENT_TYPE_VALUE = "content_type_value"
    const val KEY_PIN = "pin"
    const val KEY_SALT = "salt"
    const val KEY_TOKEN = "token"
    const val KEY_ENABLE_LISTENER = "enable_listener"
    const val KEY_ENABLE_FOREGROUND = "enable_foreground_service"
    const val KEY_ENABLE_BOOT = "enable_boot_receiver"
    const val KEY_ENABLE_SOCKET = "enable_socket_presence"
    const val KEY_NOTIFICATION_ENABLED = "notification_enabled"
    const val KEY_APP_LOCALE = "app_locale"
    const val KEY_APP_THEME = "app_theme"
    const val KEY_APP_ACCENT = "app_accent"
    const val KEY_SERVICES_ENABLED = "services_enabled"

    private fun prefs(context: Context): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (_: Exception) {
            context.getSharedPreferences("smsrelay3_fallback_prefs", Context.MODE_PRIVATE)
        }
    }

    fun getConfig(context: Context): AppConfig {
        val prefs = prefs(context)
        return AppConfig(
            serverUrl = prefs.getString(KEY_SERVER_URL, "https://syncserver.local") ?: "",
            apiPath = prefs.getString(KEY_API_PATH, "/api/v1/ingest") ?: "",
            httpMethod = prefs.getString(KEY_HTTP_METHOD, "POST") ?: "POST",
            remoteConfigUrl = prefs.getString(KEY_REMOTE_CONFIG_URL, "") ?: "",
            remoteConfigAuthHeader = prefs.getString(KEY_REMOTE_CONFIG_AUTH_HEADER, "") ?: "",
            remoteConfigAuthValue = prefs.getString(KEY_REMOTE_CONFIG_AUTH_VALUE, "") ?: "",
            remoteConfigSignatureHeader = prefs.getString(KEY_REMOTE_CONFIG_SIGNATURE_HEADER, "") ?: "",
            remoteConfigSignatureSecret = prefs.getString(KEY_REMOTE_CONFIG_SIGNATURE_SECRET, "") ?: "",
            discoveryPort = prefs.getString(KEY_DISCOVERY_PORT, "3000")?.toIntOrNull() ?: 3000,
            clientIdHeader = prefs.getString(KEY_CLIENT_ID_HEADER, "x-clientid") ?: "x-clientid",
            clientIdValue = prefs.getString(KEY_CLIENT_ID_VALUE, "#XCLIENTID1") ?: "",
            authHeader = prefs.getString(KEY_AUTH_HEADER, "Authorization") ?: "Authorization",
            authPrefix = prefs.getString(KEY_AUTH_PREFIX, "Bearer ") ?: "Bearer ",
            acceptHeader = prefs.getString(KEY_ACCEPT_HEADER, "Accept") ?: "Accept",
            acceptValue = prefs.getString(KEY_ACCEPT_VALUE, "application/json") ?: "application/json",
            contentTypeHeader = prefs.getString(KEY_CONTENT_TYPE_HEADER, "Content-Type") ?: "Content-Type",
            contentTypeValue = prefs.getString(KEY_CONTENT_TYPE_VALUE, "application/json") ?: "application/json",
            pin = prefs.getString(KEY_PIN, "#PIN1") ?: "",
            salt = prefs.getString(KEY_SALT, "#SALT") ?: "",
            enableListener = prefs.getBoolean(KEY_ENABLE_LISTENER, true),
            enableForegroundService = prefs.getBoolean(KEY_ENABLE_FOREGROUND, true),
            enableBootReceiver = prefs.getBoolean(KEY_ENABLE_BOOT, true),
            enableSocketPresence = prefs.getBoolean(KEY_ENABLE_SOCKET, true),
            notificationEnabled = prefs.getBoolean(KEY_NOTIFICATION_ENABLED, true),
            servicesEnabled = prefs.getBoolean(KEY_SERVICES_ENABLED, true)
        )
    }

    fun setString(context: Context, key: String, value: String) {
        prefs(context).edit().putString(key, value).apply()
    }

    fun setBoolean(context: Context, key: String, value: Boolean) {
        prefs(context).edit().putBoolean(key, value).apply()
    }

    fun getString(context: Context, key: String, defaultValue: String): String {
        return prefs(context).getString(key, defaultValue) ?: defaultValue
    }

    fun getBoolean(context: Context, key: String, defaultValue: Boolean): Boolean {
        return prefs(context).getBoolean(key, defaultValue)
    }

    fun defaultString(key: String): String {
        return when (key) {
            KEY_SERVER_URL -> "https://syncserver.local"
            KEY_API_PATH -> "/api/v1/ingest"
            KEY_HTTP_METHOD -> "POST"
            KEY_REMOTE_CONFIG_URL -> ""
            KEY_REMOTE_CONFIG_AUTH_HEADER -> ""
            KEY_REMOTE_CONFIG_AUTH_VALUE -> ""
            KEY_REMOTE_CONFIG_SIGNATURE_HEADER -> ""
            KEY_REMOTE_CONFIG_SIGNATURE_SECRET -> ""
            KEY_DISCOVERY_PORT -> "3000"
            KEY_CLIENT_ID_HEADER -> "x-clientid"
            KEY_CLIENT_ID_VALUE -> "#XCLIENTID1"
            KEY_AUTH_HEADER -> "Authorization"
            KEY_AUTH_PREFIX -> "Bearer "
            KEY_ACCEPT_HEADER -> "Accept"
            KEY_ACCEPT_VALUE -> "application/json"
            KEY_CONTENT_TYPE_HEADER -> "Content-Type"
            KEY_CONTENT_TYPE_VALUE -> "application/json"
            KEY_PIN -> "#PIN1"
            KEY_SALT -> "#SALT"
            KEY_APP_LOCALE -> "system"
            KEY_APP_THEME -> "system"
            KEY_APP_ACCENT -> "cyan"
            else -> ""
        }
    }
}
