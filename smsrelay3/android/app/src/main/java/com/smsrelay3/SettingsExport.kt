package com.smsrelay3

import android.content.Context
import android.net.Uri
import com.smsrelay3.data.LocalOverridesRepository
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter

object SettingsExport {
    fun buildConfigJson(context: Context): String {
        val config = ConfigStore.getConfig(context)
        val json = JSONObject()
        val server = JSONObject()
        server.put("url", config.serverUrl)
        server.put("apiPath", config.apiPath)
        server.put("method", config.httpMethod)
        json.put("server", server)
        val auth = JSONObject()
        auth.put("clientIdHeader", config.clientIdHeader)
        auth.put("clientId", config.clientIdValue)
        auth.put("authHeader", config.authHeader)
        auth.put("authPrefix", config.authPrefix)
        auth.put("acceptHeader", config.acceptHeader)
        auth.put("acceptValue", config.acceptValue)
        auth.put("contentTypeHeader", config.contentTypeHeader)
        auth.put("contentTypeValue", config.contentTypeValue)
        auth.put("pin", config.pin)
        auth.put("salt", config.salt)
        json.put("auth", auth)
        val provisioning = JSONObject()
        provisioning.put("remoteConfigUrl", config.remoteConfigUrl)
        provisioning.put("remoteConfigAuthHeader", config.remoteConfigAuthHeader)
        provisioning.put("remoteConfigAuthValue", config.remoteConfigAuthValue)
        provisioning.put("remoteConfigSignatureHeader", config.remoteConfigSignatureHeader)
        provisioning.put("remoteConfigSignatureSecret", config.remoteConfigSignatureSecret)
        provisioning.put("discoveryPort", config.discoveryPort)
        json.put("provisioning", provisioning)
        val ui = JSONObject()
        ui.put("locale", ConfigStore.getString(context, ConfigStore.KEY_APP_LOCALE, "system"))
        ui.put("theme", ConfigStore.getString(context, ConfigStore.KEY_APP_THEME, "system"))
        ui.put("accent", ConfigStore.getString(context, ConfigStore.KEY_APP_ACCENT, "cyan"))
        json.put("ui", ui)
        val features = JSONObject()
        features.put("enableListener", config.enableListener)
        features.put("enableForegroundService", config.enableForegroundService)
        features.put("enableBootReceiver", config.enableBootReceiver)
        features.put("enableSocketPresence", config.enableSocketPresence)
        features.put("notificationEnabled", config.notificationEnabled)
        features.put("servicesEnabled", config.servicesEnabled)
        json.put("features", features)
        val overrides = runBlocking { LocalOverridesRepository(context).getOverrides() }
        if (!overrides.isNullOrBlank()) {
            json.put("overrides", JSONObject(overrides))
        }
        json.put("effective", buildEffectiveConfig(config))
        return json.toString(2)
    }

    fun applyConfigJson(context: Context, raw: String): Boolean {
        return try {
            val json = JSONObject(raw)
            RemoteProvisioner.applyConfigJson(context, json)
            json.optJSONObject("provisioning")?.let { provisioning ->
                provisioning.optString("remoteConfigUrl").takeIf { it.isNotBlank() }?.let {
                    ConfigStore.setString(context, ConfigStore.KEY_REMOTE_CONFIG_URL, it)
                }
                provisioning.optString("remoteConfigAuthHeader").takeIf { it.isNotBlank() }?.let {
                    ConfigStore.setString(context, ConfigStore.KEY_REMOTE_CONFIG_AUTH_HEADER, it)
                }
                provisioning.optString("remoteConfigAuthValue").takeIf { it.isNotBlank() }?.let {
                    ConfigStore.setString(context, ConfigStore.KEY_REMOTE_CONFIG_AUTH_VALUE, it)
                }
                provisioning.optString("remoteConfigSignatureHeader").takeIf { it.isNotBlank() }?.let {
                    ConfigStore.setString(context, ConfigStore.KEY_REMOTE_CONFIG_SIGNATURE_HEADER, it)
                }
                provisioning.optString("remoteConfigSignatureSecret").takeIf { it.isNotBlank() }?.let {
                    ConfigStore.setString(context, ConfigStore.KEY_REMOTE_CONFIG_SIGNATURE_SECRET, it)
                }
                provisioning.optInt("discoveryPort", configDiscoveryPort(context))
                    .takeIf { it > 0 }
                    ?.let { ConfigStore.setString(context, ConfigStore.KEY_DISCOVERY_PORT, it.toString()) }
            }
            json.optJSONObject("overrides")?.let { overrides ->
                val requiredPin = ConfigStore.getConfig(context).pin
                val providedPin = overrides.optString("pin")
                if (requiredPin.isNotBlank() && providedPin != requiredPin) {
                    LogStore.append("warn", "config", "Import: overrides rejected (pin mismatch)")
                } else {
                    overrides.remove("pin")
                    runBlocking {
                        LocalOverridesRepository(context).setOverrides(overrides.toString())
                    }
                }
            }
            json.optJSONObject("ui")?.let { ui ->
                ui.optString("locale").takeIf { it.isNotBlank() }?.let {
                    ConfigStore.setString(context, ConfigStore.KEY_APP_LOCALE, it)
                }
                ui.optString("theme").takeIf { it.isNotBlank() }?.let {
                    ConfigStore.setString(context, ConfigStore.KEY_APP_THEME, it)
                }
                ui.optString("accent").takeIf { it.isNotBlank() }?.let {
                    ConfigStore.setString(context, ConfigStore.KEY_APP_ACCENT, it)
                }
            }
            ConfigEvents.notifyChanged()
            LogStore.append("info", "config", "Import: config applied")
            true
        } catch (_: Exception) {
            LogStore.append("error", "config", "Import: failed")
            false
        }
    }

    fun writeToUri(context: Context, uri: Uri, content: String): Boolean {
        return try {
            context.contentResolver.openOutputStream(uri)?.use { stream ->
                OutputStreamWriter(stream).use { writer ->
                    writer.write(content)
                }
            } ?: return false
            LogStore.append("info", "config", "Export: wrote ${content.length} bytes")
            true
        } catch (_: Exception) {
            LogStore.append("error", "config", "Export: failed")
            false
        }
    }

    fun readFromUri(context: Context, uri: Uri): String? {
        return try {
            context.contentResolver.openInputStream(uri)?.use { stream ->
                BufferedReader(InputStreamReader(stream)).readText()
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun configDiscoveryPort(context: Context): Int {
        return ConfigStore.getConfig(context).discoveryPort
    }

    private fun buildEffectiveConfig(config: AppConfig): JSONObject {
        val json = JSONObject()
        json.put("server_url", config.serverUrl.safeRedact())
        json.put("api_path", config.apiPath)
        json.put("http_method", config.httpMethod)
        json.put("client_id_header", config.clientIdHeader)
        json.put("client_id_value", config.clientIdValue.safeRedact())
        json.put("auth_header", config.authHeader)
        json.put("auth_prefix", config.authPrefix)
        json.put("accept_header", config.acceptHeader)
        json.put("accept_value", config.acceptValue)
        json.put("content_type_header", config.contentTypeHeader)
        json.put("content_type_value", config.contentTypeValue)
        json.put("features", JSONObject().apply {
            put("enableListener", config.enableListener)
            put("enableForegroundService", config.enableForegroundService)
            put("enableBootReceiver", config.enableBootReceiver)
            put("enableSocketPresence", config.enableSocketPresence)
            put("notificationEnabled", config.notificationEnabled)
            put("servicesEnabled", config.servicesEnabled)
        })
        return json
    }

    private fun String.safeRedact(): String {
        return if (isBlank()) this else "***"
    }
}
