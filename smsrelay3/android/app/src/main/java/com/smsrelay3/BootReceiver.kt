package com.smsrelay3

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.smsrelay3.config.ConfigScheduler
import com.smsrelay3.config.ConfigRepository
import kotlinx.coroutines.runBlocking
import com.smsrelay3.contacts.ContactsSyncScheduler
import com.smsrelay3.presence.HeartbeatScheduler
import com.smsrelay3.reconcile.ReconcileScheduler
import com.smsrelay3.retention.PruneScheduler
import com.smsrelay3.sim.SimScheduler
import com.smsrelay3.sync.SyncScheduler

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val config = ConfigStore.getConfig(context)
        if (config.enableBootReceiver) {
            val policy = runBlocking {
                ConfigRepository(context).latestPolicy()
            }
            if (policy.realtimeMode == "foreground_service" && config.enableForegroundService) {
                val serviceIntent = Intent(context, RelayForegroundService::class.java)
                ForegroundServiceGuard.start(context, serviceIntent)
            }
        }
        SyncScheduler.enqueueNow(context)
        ConfigScheduler.ensureScheduled(context)
        HeartbeatScheduler.ensureScheduled(context)
        SimScheduler.ensureScheduled(context)
        ReconcileScheduler.ensureScheduled(context)
        PruneScheduler.ensureScheduled(context)
        ContactsSyncScheduler.ensureScheduled(context)
    }
}
