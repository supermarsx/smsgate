package com.smsrelay3

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.smsrelay3.presence.HeartbeatScheduler
import com.smsrelay3.sim.SimScheduler
import com.smsrelay3.sync.SyncScheduler

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val config = ConfigStore.getConfig(context)
        if (config.enableBootReceiver && config.enableForegroundService) {
            val serviceIntent = Intent(context, RelayForegroundService::class.java)
            ForegroundServiceGuard.start(context, serviceIntent)
        }
        SyncScheduler.enqueueNow(context)
        HeartbeatScheduler.ensureScheduled(context)
        SimScheduler.ensureScheduled(context)
    }
}
