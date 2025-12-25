package com.smsrelay3

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat

class RelayForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        LogStore.append("info", "service", "Foreground service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val config = ConfigStore.getConfig(this)
        if (!config.enableForegroundService || !config.servicesEnabled) {
            stopSelf()
            return START_NOT_STICKY
        }
        val notification = buildNotification(config.notificationEnabled)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        LogStore.append("info", "service", "Foreground service active")
        if (config.enableSocketPresence) {
            SocketPresenceManager.connect(this)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        SocketPresenceManager.disconnect()
        isRunning = false
        LogStore.append("info", "service", "Foreground service destroyed")
        super.onDestroy()
    }

    private fun buildNotification(isLoud: Boolean): Notification {
        createChannelIfNeeded()
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(getString(R.string.relay_notification_title))
            .setContentText(getString(R.string.relay_notification_text))
            .setOngoing(true)
        if (!isLoud) {
            builder.setSilent(true)
        }
        return builder.build()
    }

    private fun createChannelIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.relay_channel_name),
                NotificationManager.IMPORTANCE_LOW
            )
            channel.description = getString(R.string.relay_channel_desc)
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        private const val CHANNEL_ID = "smsrelay3_relay"
        private const val NOTIFICATION_ID = 1001
        @Volatile
        var isRunning: Boolean = false
            private set
    }
}
