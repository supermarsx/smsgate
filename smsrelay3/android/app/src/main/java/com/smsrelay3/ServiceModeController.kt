package com.smsrelay3

import android.content.Context
import android.content.Intent
import com.smsrelay3.config.ConfigRepository
import com.smsrelay3.config.ConfigWebSocketManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.runBlocking

object ServiceModeController {
    fun apply(context: Context) {
        runBlocking { applyAsync(context) }
    }

    suspend fun applyAsync(context: Context) {
        val config = withContext(Dispatchers.IO) { ConfigStore.getConfig(context) }
        if (!config.servicesEnabled) {
            stopAll(context)
            return
        }
        if (config.enableSocketPresence) {
            // Connect may touch disk (device token); keep it off main.
            withContext(Dispatchers.IO) { ConfigWebSocketManager.connect(context) }
        } else {
            ConfigWebSocketManager.disconnect()
        }
        val policy = withContext(Dispatchers.IO) { ConfigRepository(context).latestPolicy() }
        when (policy.realtimeMode) {
            "best_effort" -> stopAll(context)
            "persistent_background" -> {
                stopForeground(context)
                startBackground(context)
            }
            else -> {
                startForeground(context)
                startBackground(context)
            }
        }
    }

    fun applyFromBoot(context: Context) {
        val config = ConfigStore.getConfig(context)
        if (!config.enableBootReceiver) return
        apply(context)
    }

    private fun startForeground(context: Context) {
        val config = ConfigStore.getConfig(context)
        if (!config.enableForegroundService) return
        if (!RelayForegroundService.isRunning) {
            ForegroundServiceGuard.start(context, Intent(context, RelayForegroundService::class.java))
        }
    }

    private fun startBackground(context: Context) {
        if (!BackgroundRelayService.isRunning) {
            context.startService(Intent(context, BackgroundRelayService::class.java))
        }
    }

    private fun stopForeground(context: Context) {
        context.stopService(Intent(context, RelayForegroundService::class.java))
    }

    private fun stopBackground(context: Context) {
        context.stopService(Intent(context, BackgroundRelayService::class.java))
    }

    private fun stopAll(context: Context) {
        stopForeground(context)
        stopBackground(context)
        ConfigWebSocketManager.disconnect()
    }
}
