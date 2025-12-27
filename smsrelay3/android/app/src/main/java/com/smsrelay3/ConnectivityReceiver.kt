package com.smsrelay3

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.smsrelay3.sync.SyncScheduler

/**
 * Triggers a catch-up sync when connectivity returns to help flush queued messages.
 */
class ConnectivityReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ConnectivityManager.CONNECTIVITY_ACTION) return
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return
        val caps = cm.getNetworkCapabilities(network) ?: return
        val connected = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        if (connected) {
            SyncScheduler.enqueueNow(context)
        }
    }
}
