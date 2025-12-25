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
                retentionSmsRawHours = ConfigDefaults.RETENTION_SMS_RAW_HOURS
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
                retentionSmsRawHours = smsRawHours.coerceAtLeast(1)
            )
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
                retentionSmsRawHours = ConfigDefaults.RETENTION_SMS_RAW_HOURS
            )
        }
    }
}
