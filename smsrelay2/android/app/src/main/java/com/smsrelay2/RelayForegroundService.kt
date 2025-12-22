package com.smsrelay2

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class RelayForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val config = ConfigStore.getConfig(this)
        if (!config.enableForegroundService) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildNotification(config.notificationEnabled))
        if (config.enableSocketPresence) {
            SocketPresenceManager.connect(this)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        SocketPresenceManager.disconnect()
        isRunning = false
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
        private const val CHANNEL_ID = "smsgate_relay"
        private const val NOTIFICATION_ID = 1001
        @Volatile
        var isRunning: Boolean = false
            private set
    }
}
