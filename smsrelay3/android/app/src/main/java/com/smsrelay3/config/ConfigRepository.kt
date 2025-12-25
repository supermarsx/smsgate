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
                heartbeatIntervalS = ConfigDefaults.HEARTBEAT_INTERVAL_S,
                simPollIntervalS = ConfigDefaults.SIM_POLL_INTERVAL_S
            )
        }
        return parsePolicy(raw)
    }

    private fun parsePolicy(raw: String): ConfigPolicy {
        return try {
            val json = JSONObject(raw)
            val heartbeat = json.optJSONObject("heartbeat")
            val sim = json.optJSONObject("sim")
            val heartbeatInterval = heartbeat?.optLong("interval_s", ConfigDefaults.HEARTBEAT_INTERVAL_S)
                ?: ConfigDefaults.HEARTBEAT_INTERVAL_S
            val poll = sim?.optJSONObject("poll")
            val simInterval = poll?.optLong("interval_s", -1L).takeIf { it != -1L }
                ?: sim?.optLong("poll_interval_s", -1L).takeIf { it != -1L }
                ?: sim?.optLong("pollIntervalS", ConfigDefaults.SIM_POLL_INTERVAL_S)
                ?: ConfigDefaults.SIM_POLL_INTERVAL_S
            ConfigPolicy(
                heartbeatIntervalS = heartbeatInterval.coerceAtLeast(5L),
                simPollIntervalS = simInterval.coerceAtLeast(10L)
            )
        } catch (_: Exception) {
            ConfigPolicy(
                heartbeatIntervalS = ConfigDefaults.HEARTBEAT_INTERVAL_S,
                simPollIntervalS = ConfigDefaults.SIM_POLL_INTERVAL_S
            )
        }
    }
}
