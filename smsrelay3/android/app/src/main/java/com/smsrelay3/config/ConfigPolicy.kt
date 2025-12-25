package com.smsrelay3.config

data class ConfigPolicy(
    val heartbeatIntervalS: Long,
    val simPollIntervalS: Long,
    val reconcileEnabled: Boolean,
    val reconcileWindowMinutes: Int,
    val reconcileIntervalMinutes: Int,
    val reconcileMaxScanCount: Int
)

object ConfigDefaults {
    const val HEARTBEAT_INTERVAL_S = 20L
    const val SIM_POLL_INTERVAL_S = 60L
    const val RECONCILE_ENABLED = true
    const val RECONCILE_WINDOW_MINUTES = 10
    const val RECONCILE_INTERVAL_MINUTES = 2
    const val RECONCILE_MAX_SCAN_COUNT = 200
}
