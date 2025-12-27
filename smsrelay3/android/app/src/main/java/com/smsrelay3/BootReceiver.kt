package com.smsrelay3

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.smsrelay3.config.ConfigScheduler
import com.smsrelay3.contacts.ContactsSyncScheduler
import com.smsrelay3.presence.HeartbeatScheduler
import com.smsrelay3.reconcile.ReconcileScheduler
import com.smsrelay3.retention.PruneScheduler
import com.smsrelay3.sim.SimScheduler
import com.smsrelay3.sync.SyncScheduler

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        ServiceModeController.applyFromBoot(context)
        SyncScheduler.enqueueNow(context)
        SyncScheduler.ensureCatchUp(context)
        ConfigScheduler.ensureScheduled(context)
        HeartbeatScheduler.ensureScheduled(context)
        SimScheduler.ensureScheduled(context)
        ReconcileScheduler.ensureScheduled(context)
        PruneScheduler.ensureScheduled(context)
        ContactsSyncScheduler.ensureScheduled(context)
    }
}
