package com.smsrelay3

import android.app.Service
import android.content.Intent
import android.os.IBinder

class BackgroundRelayService : Service() {
    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        LogStore.append("info", "service", "Background service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val config = ConfigStore.getConfig(this)
        if (!config.servicesEnabled) {
            stopSelf()
            return START_NOT_STICKY
        }
        LogStore.append("info", "service", "Background service active")
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        LogStore.append("info", "service", "Background service destroyed")
        super.onDestroy()
    }

    companion object {
        @Volatile
        var isRunning: Boolean = false
            private set
    }
}
