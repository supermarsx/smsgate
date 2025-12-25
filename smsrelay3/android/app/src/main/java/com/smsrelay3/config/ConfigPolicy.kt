package com.smsrelay3.config

data class ConfigPolicy(
    val heartbeatIntervalS: Long,
    val simPollIntervalS: Long
)

object ConfigDefaults {
    const val HEARTBEAT_INTERVAL_S = 20L
    const val SIM_POLL_INTERVAL_S = 60L
}
