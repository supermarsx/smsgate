package com.smsrelay3.config

data class ConfigPolicy(
    val realtimeMode: String,
    val heartbeatIntervalS: Long,
    val simPollIntervalS: Long,
    val reconcileEnabled: Boolean,
    val reconcileWindowMinutes: Int,
    val reconcileIntervalMinutes: Int,
    val reconcileMaxScanCount: Int,
    val retentionAckedHours: Int,
    val retentionHeartbeatHours: Int,
    val retentionSimDays: Int,
    val retentionLogDays: Int,
    val retentionSmsRawHours: Int
)

object ConfigDefaults {
    const val REALTIME_MODE = "foreground_service"
    const val HEARTBEAT_INTERVAL_S = 20L
    const val SIM_POLL_INTERVAL_S = 60L
    const val RECONCILE_ENABLED = true
    const val RECONCILE_WINDOW_MINUTES = 10
    const val RECONCILE_INTERVAL_MINUTES = 2
    const val RECONCILE_MAX_SCAN_COUNT = 200
    const val RETENTION_ACKED_HOURS = 24
    const val RETENTION_HEARTBEAT_HOURS = 24
    const val RETENTION_SIM_DAYS = 7
    const val RETENTION_LOG_DAYS = 7
    const val RETENTION_SMS_RAW_HOURS = 24
}
