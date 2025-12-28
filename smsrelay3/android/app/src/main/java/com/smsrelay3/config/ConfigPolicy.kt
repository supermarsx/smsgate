package com.smsrelay3.config

data class ConfigPolicy(
    val realtimeMode: String,
    val syncRetryBaseMs: Long,
    val syncRetryMaxMs: Long,
    val syncMaxAttempts: Int,
    val syncQueueMaxDepth: Int,
    val syncBatchMaxSize: Int,
    val syncFlushOnConnect: Boolean,
    val wsKeepaliveS: Long,
    val wsReconnectBaseMs: Long,
    val wsReconnectMaxMs: Long,
    val loggingEnabled: Boolean,
    val loggingLevel: String,
    val loggingPersistToDisk: Boolean,
    val loggingRedactSmsContent: Boolean,
    val heartbeatIntervalS: Long,
    val simPollIntervalS: Long,
    val reconcileEnabled: Boolean,
    val reconcileWindowMinutes: Int,
    val reconcileIntervalMinutes: Int,
    val reconcileMaxScanCount: Int,
    val reconcileIgnoreSenders: List<String>,
    val retentionAckedHours: Int,
    val retentionHeartbeatHours: Int,
    val retentionSimDays: Int,
    val retentionLogDays: Int,
    val retentionSmsRawHours: Int,
    val overridesEnabled: Boolean,
    val overridesAllowlist: List<String>,
    val contactsSyncEnabled: Boolean,
    val contactsSyncIntervalS: Long,
    val tlsPinningEnabled: Boolean,
    val tlsPins: List<String>
)

object ConfigDefaults {
    const val REALTIME_MODE = "foreground_service"
    const val SYNC_RETRY_BASE_MS = 1_000L
    const val SYNC_RETRY_MAX_MS = 5 * 60_000L
    const val SYNC_MAX_ATTEMPTS = 5
    const val SYNC_QUEUE_MAX_DEPTH = 1_000
    const val SYNC_BATCH_MAX_SIZE = 10
    const val SYNC_FLUSH_ON_CONNECT = true
    const val WS_KEEPALIVE_S = 30L
    const val WS_RECONNECT_BASE_MS = 1_000L
    const val WS_RECONNECT_MAX_MS = 60_000L
    const val LOGGING_ENABLED = true
    const val LOGGING_LEVEL = "info"
    const val LOGGING_PERSIST = true
    const val LOGGING_REDACT_SMS = true
    const val HEARTBEAT_INTERVAL_S = 20L
    const val SIM_POLL_INTERVAL_S = 60L
    const val RECONCILE_ENABLED = true
    const val RECONCILE_WINDOW_MINUTES = 10
    const val RECONCILE_INTERVAL_MINUTES = 2
    const val RECONCILE_MAX_SCAN_COUNT = 200
    val RECONCILE_IGNORE_SENDERS: List<String> = emptyList()
    const val RETENTION_ACKED_HOURS = 24
    const val RETENTION_HEARTBEAT_HOURS = 24
    const val RETENTION_SIM_DAYS = 7
    const val RETENTION_LOG_DAYS = 7
    const val RETENTION_SMS_RAW_HOURS = 24
    const val OVERRIDES_ENABLED = false
    const val CONTACTS_SYNC_ENABLED = false
    const val CONTACTS_SYNC_INTERVAL_S = 3600L
    const val TLS_PINNING_ENABLED = false
}
