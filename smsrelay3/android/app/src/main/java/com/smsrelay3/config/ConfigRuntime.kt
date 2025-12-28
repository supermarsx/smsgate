package com.smsrelay3.config

import android.content.Context
import com.smsrelay3.contacts.ContactsSyncScheduler
import com.smsrelay3.presence.HeartbeatScheduler
import com.smsrelay3.reconcile.ReconcileScheduler
import com.smsrelay3.sim.SimScheduler

object ConfigRuntime {
    /**
     * Apply scheduling knobs from the latest policy. Keeps all schedules in one place so
     * both pull and WS updates stay consistent.
     */
    suspend fun apply(context: Context) {
        val policy = ConfigRepository(context).latestPolicy()
        HeartbeatScheduler.scheduleNext(context, policy.heartbeatIntervalS)
        SimScheduler.scheduleNext(context, policy.simPollIntervalS)
        ReconcileScheduler.scheduleNext(context, policy.reconcileIntervalMinutes.toLong())
        ContactsSyncScheduler.scheduleNext(context, policy.contactsSyncIntervalS)
    }
}
