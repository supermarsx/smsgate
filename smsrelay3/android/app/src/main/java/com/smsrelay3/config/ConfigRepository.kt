package com.smsrelay3.config

import android.content.Context
import com.smsrelay3.data.db.DatabaseProvider
import org.json.JSONObject

class ConfigRepository(private val context: Context) {
    private val db = DatabaseProvider.get(context)

    suspend fun latestPolicy(): ConfigPolicy {
        val state = db.configStateDao().latest()
        val raw = state?.rawJson
        if (raw.isNullOrBlank()) {
            return ConfigPolicy(
                realtimeMode = ConfigDefaults.REALTIME_MODE,
                heartbeatIntervalS = ConfigDefaults.HEARTBEAT_INTERVAL_S,
                simPollIntervalS = ConfigDefaults.SIM_POLL_INTERVAL_S,
                reconcileEnabled = ConfigDefaults.RECONCILE_ENABLED,
                reconcileWindowMinutes = ConfigDefaults.RECONCILE_WINDOW_MINUTES,
                reconcileIntervalMinutes = ConfigDefaults.RECONCILE_INTERVAL_MINUTES,
                reconcileMaxScanCount = ConfigDefaults.RECONCILE_MAX_SCAN_COUNT,
                retentionAckedHours = ConfigDefaults.RETENTION_ACKED_HOURS,
                retentionHeartbeatHours = ConfigDefaults.RETENTION_HEARTBEAT_HOURS,
                retentionSimDays = ConfigDefaults.RETENTION_SIM_DAYS,
                retentionLogDays = ConfigDefaults.RETENTION_LOG_DAYS,
                retentionSmsRawHours = ConfigDefaults.RETENTION_SMS_RAW_HOURS,
                overridesEnabled = ConfigDefaults.OVERRIDES_ENABLED,
                overridesAllowlist = emptyList(),
                contactsSyncEnabled = ConfigDefaults.CONTACTS_SYNC_ENABLED,
                contactsSyncIntervalS = ConfigDefaults.CONTACTS_SYNC_INTERVAL_S,
                tlsPinningEnabled = ConfigDefaults.TLS_PINNING_ENABLED,
                tlsPins = emptyList()
            )
        }
        return parsePolicy(raw)
    }

    private fun parsePolicy(raw: String): ConfigPolicy {
        return try {
            val json = JSONObject(raw)
            val heartbeat = json.optJSONObject("heartbeat")
            val sim = json.optJSONObject("sim")
            val reconcile = json.optJSONObject("reconcile")
            val realtimeMode = json.optString("realtime_mode", ConfigDefaults.REALTIME_MODE)
            val heartbeatInterval = heartbeat?.optLong("interval_s", ConfigDefaults.HEARTBEAT_INTERVAL_S)
                ?: ConfigDefaults.HEARTBEAT_INTERVAL_S
            val poll = sim?.optJSONObject("poll")
            val simInterval = poll?.optLong("interval_s", -1L).takeIf { it != -1L }
                ?: sim?.optLong("poll_interval_s", -1L).takeIf { it != -1L }
                ?: sim?.optLong("pollIntervalS", ConfigDefaults.SIM_POLL_INTERVAL_S)
                ?: ConfigDefaults.SIM_POLL_INTERVAL_S
            val reconcileEnabled = reconcile?.optBoolean("enabled", ConfigDefaults.RECONCILE_ENABLED)
                ?: ConfigDefaults.RECONCILE_ENABLED
            val reconcileWindow = reconcile?.optInt("window_minutes", ConfigDefaults.RECONCILE_WINDOW_MINUTES)
                ?: ConfigDefaults.RECONCILE_WINDOW_MINUTES
            val reconcileInterval = reconcile?.optInt("interval_minutes", ConfigDefaults.RECONCILE_INTERVAL_MINUTES)
                ?: ConfigDefaults.RECONCILE_INTERVAL_MINUTES
            val reconcileMaxScan = reconcile?.optInt("max_scan_count", ConfigDefaults.RECONCILE_MAX_SCAN_COUNT)
                ?: ConfigDefaults.RECONCILE_MAX_SCAN_COUNT
            val retention = json.optJSONObject("retention")
            val overrides = json.optJSONObject("overrides")
            val contacts = json.optJSONObject("contacts_sync")
            val tls = json.optJSONObject("tls_pinning")
            val overridesEnabled = overrides?.optBoolean("enabled", ConfigDefaults.OVERRIDES_ENABLED)
                ?: ConfigDefaults.OVERRIDES_ENABLED
            val overridesAllowlist = overrides?.optJSONArray("allowlist")?.let { array ->
                (0 until array.length()).mapNotNull { array.optString(it) }.filter { it.isNotBlank() }
            } ?: emptyList()
            val ackedHours = retention?.optInt("acked_hours", ConfigDefaults.RETENTION_ACKED_HOURS)
                ?: ConfigDefaults.RETENTION_ACKED_HOURS
            val heartbeatHours = retention?.optInt("heartbeat_hours", ConfigDefaults.RETENTION_HEARTBEAT_HOURS)
                ?: ConfigDefaults.RETENTION_HEARTBEAT_HOURS
            val simDays = retention?.optInt("sim_days", ConfigDefaults.RETENTION_SIM_DAYS)
                ?: ConfigDefaults.RETENTION_SIM_DAYS
            val logDays = retention?.optInt("log_days", ConfigDefaults.RETENTION_LOG_DAYS)
                ?: ConfigDefaults.RETENTION_LOG_DAYS
            val smsRawHours = retention?.optInt("sms_raw_hours", ConfigDefaults.RETENTION_SMS_RAW_HOURS)
                ?: ConfigDefaults.RETENTION_SMS_RAW_HOURS
            val contactsEnabled = contacts?.optBoolean("enabled", ConfigDefaults.CONTACTS_SYNC_ENABLED)
                ?: ConfigDefaults.CONTACTS_SYNC_ENABLED
            val contactsInterval = contacts?.optLong("interval_s", ConfigDefaults.CONTACTS_SYNC_INTERVAL_S)
                ?: ConfigDefaults.CONTACTS_SYNC_INTERVAL_S
            val tlsEnabled = tls?.optBoolean("enabled", ConfigDefaults.TLS_PINNING_ENABLED)
                ?: ConfigDefaults.TLS_PINNING_ENABLED
            val tlsPins = tls?.optJSONArray("pins")?.let { array ->
                (0 until array.length()).mapNotNull { array.optString(it) }.filter { it.isNotBlank() }
            } ?: emptyList()
            ConfigPolicy(
                realtimeMode = realtimeMode,
                heartbeatIntervalS = heartbeatInterval.coerceAtLeast(5L),
                simPollIntervalS = simInterval.coerceAtLeast(10L),
                reconcileEnabled = reconcileEnabled,
                reconcileWindowMinutes = reconcileWindow.coerceAtLeast(1),
                reconcileIntervalMinutes = reconcileInterval.coerceAtLeast(1),
                reconcileMaxScanCount = reconcileMaxScan.coerceAtLeast(10),
                retentionAckedHours = ackedHours.coerceAtLeast(1),
                retentionHeartbeatHours = heartbeatHours.coerceAtLeast(1),
                retentionSimDays = simDays.coerceAtLeast(1),
                retentionLogDays = logDays.coerceAtLeast(1),
                retentionSmsRawHours = smsRawHours.coerceAtLeast(1),
                overridesEnabled = overridesEnabled,
                overridesAllowlist = overridesAllowlist,
                contactsSyncEnabled = contactsEnabled,
                contactsSyncIntervalS = contactsInterval.coerceAtLeast(60L),
                tlsPinningEnabled = tlsEnabled,
                tlsPins = tlsPins
            ).let { policy ->
                applyLocalOverrides(policy)
            }
        } catch (_: Exception) {
            ConfigPolicy(
                realtimeMode = ConfigDefaults.REALTIME_MODE,
                heartbeatIntervalS = ConfigDefaults.HEARTBEAT_INTERVAL_S,
                simPollIntervalS = ConfigDefaults.SIM_POLL_INTERVAL_S,
                reconcileEnabled = ConfigDefaults.RECONCILE_ENABLED,
                reconcileWindowMinutes = ConfigDefaults.RECONCILE_WINDOW_MINUTES,
                reconcileIntervalMinutes = ConfigDefaults.RECONCILE_INTERVAL_MINUTES,
                reconcileMaxScanCount = ConfigDefaults.RECONCILE_MAX_SCAN_COUNT,
                retentionAckedHours = ConfigDefaults.RETENTION_ACKED_HOURS,
                retentionHeartbeatHours = ConfigDefaults.RETENTION_HEARTBEAT_HOURS,
                retentionSimDays = ConfigDefaults.RETENTION_SIM_DAYS,
                retentionLogDays = ConfigDefaults.RETENTION_LOG_DAYS,
                retentionSmsRawHours = ConfigDefaults.RETENTION_SMS_RAW_HOURS,
                overridesEnabled = ConfigDefaults.OVERRIDES_ENABLED,
                overridesAllowlist = emptyList(),
                contactsSyncEnabled = ConfigDefaults.CONTACTS_SYNC_ENABLED,
                contactsSyncIntervalS = ConfigDefaults.CONTACTS_SYNC_INTERVAL_S,
                tlsPinningEnabled = ConfigDefaults.TLS_PINNING_ENABLED,
                tlsPins = emptyList()
            )
        }
    }

    private fun applyLocalOverrides(policy: ConfigPolicy): ConfigPolicy {
        if (!policy.overridesEnabled) return policy
        val overrides = kotlinx.coroutines.runBlocking { db.localOverridesDao().latest() } ?: return policy
        val raw = overrides.rawJson
        if (raw.isBlank()) return policy
        return applyOverrides(policy, raw)
    }

    private fun applyOverrides(policy: ConfigPolicy, raw: String): ConfigPolicy {
        return try {
            val json = JSONObject(raw)
            val allow = policy.overridesAllowlist
            fun allowed(key: String): Boolean = allow.isEmpty() || allow.contains(key)
            val heartbeatInterval = if (allowed("heartbeat.interval_s")) {
                json.optJSONObject("heartbeat")?.optLong("interval_s", -1L)?.takeIf { it > 0 } ?: -1L
            } else {
                -1L
            }
            val simInterval = if (allowed("sim.poll.interval_s")) {
                json.optJSONObject("sim")?.optJSONObject("poll")?.optLong("interval_s", -1L)
                    ?.takeIf { it > 0 } ?: -1L
            } else {
                -1L
            }
            val reconcileInterval = if (allowed("reconcile.interval_minutes")) {
                json.optJSONObject("reconcile")?.optInt("interval_minutes", -1)
                    ?.takeIf { it > 0 } ?: -1
            } else {
                -1
            }
            val retentionAcked = if (allowed("retention.acked_hours")) {
                json.optJSONObject("retention")?.optInt("acked_hours", -1)?.takeIf { it > 0 } ?: -1
            } else {
                -1
            }
            val retentionLogs = if (allowed("retention.log_days")) {
                json.optJSONObject("retention")?.optInt("log_days", -1)?.takeIf { it > 0 } ?: -1
            } else {
                -1
            }
            policy.copy(
                heartbeatIntervalS = if (heartbeatInterval > 0) heartbeatInterval else policy.heartbeatIntervalS,
                simPollIntervalS = if (simInterval > 0) simInterval else policy.simPollIntervalS,
                reconcileIntervalMinutes = if (reconcileInterval > 0) reconcileInterval else policy.reconcileIntervalMinutes,
                retentionAckedHours = if (retentionAcked > 0) retentionAcked else policy.retentionAckedHours,
                retentionLogDays = if (retentionLogs > 0) retentionLogs else policy.retentionLogDays
            )
        } catch (_: Exception) {
            policy
        }
    }
}
