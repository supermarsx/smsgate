package com.smsrelay2

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val config = ConfigStore.getConfig(context)
        if (config.enableBootReceiver && config.enableForegroundService) {
            val serviceIntent = Intent(context, RelayForegroundService::class.java)
            ContextCompat.startForegroundService(context, serviceIntent)
        }
    }
}
