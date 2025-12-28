package com.smsrelay3

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Button
import androidx.fragment.app.Fragment
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.data.OutboundMessageStatus
import com.smsrelay3.data.db.DatabaseProvider
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import android.provider.Settings
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class StatusFragment : Fragment() {
    private lateinit var deviceIdText: TextView
    private lateinit var connectionText: TextView
    private lateinit var queueDepthText: TextView
    private lateinit var lastRttText: TextView
    private lateinit var lastSendText: TextView
    private lateinit var simSummaryText: TextView
    private lateinit var reconcileText: TextView
    private var openSettingsButton: Button? = null
    private var openNotificationsButton: Button? = null
    private var openBatteryButton: Button? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_status, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        deviceIdText = view.findViewById(R.id.status_device_id)
        connectionText = view.findViewById(R.id.status_connection)
        queueDepthText = view.findViewById(R.id.status_queue_depth)
        lastRttText = view.findViewById(R.id.status_last_rtt)
        lastSendText = view.findViewById(R.id.status_last_send)
        simSummaryText = view.findViewById(R.id.status_sim_summary)
        reconcileText = view.findViewById(R.id.status_reconcile)
        openSettingsButton = view.findViewById(R.id.status_open_settings)
        openNotificationsButton = view.findViewById(R.id.status_open_notifications)
        openBatteryButton = view.findViewById(R.id.status_open_battery)

        openSettingsButton?.setOnClickListener {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            intent.data = android.net.Uri.fromParts("package", requireContext().packageName, null)
            startActivity(intent)
        }
        openNotificationsButton?.setOnClickListener {
            com.smsrelay3.util.OemSettings.openNotificationSettings(requireContext())
        }
        openBatteryButton?.setOnClickListener {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        CoroutineScope(Dispatchers.IO).launch {
            val context = requireContext()
            val db = DatabaseProvider.get(context)
            val queueDepth = db.outboundMessageDao().countByStatus(OutboundMessageStatus.QUEUED)
            val heartbeat = db.heartbeatDao().latest()
            val lastAck = db.outboundMessageDao().latestAttemptForStatus(OutboundMessageStatus.ACKED)
            val simSnapshots = db.simSnapshotDao().loadAll()
            val simSlots = simSnapshots.map { it.slotIndex }.distinct().sorted()
            val deviceId = DeviceAuthStore.getDeviceId(context) ?: "unpaired"
            val policy = com.smsrelay3.config.ConfigRepository(context).latestPolicy()
            val reconcileAt = com.smsrelay3.runtime.AppRuntime.lastReconcileAtMs()
            val connectionState = when (heartbeat?.wsState) {
                "connected" -> "connected"
                "offline" -> "offline"
                else -> "unknown"
            }

            withContext(Dispatchers.Main) {
                deviceIdText.text = getString(R.string.status_device_id, deviceId)
                connectionText.text = getString(R.string.status_connection, connectionState)
                queueDepthText.text = getString(R.string.status_queue_depth, queueDepth)
                lastRttText.text = getString(
                    R.string.status_last_rtt,
                    heartbeat?.lastRttMs?.toString() ?: "-"
                )
                lastSendText.text = getString(
                    R.string.status_last_send,
                    lastAck?.let { formatTs(it) } ?: "-"
                )
                simSummaryText.text = getString(
                    R.string.status_sim_summary,
                    if (simSlots.isEmpty()) "-" else simSlots.joinToString(",")
                )
                val reconcileStatus = if (policy.reconcileEnabled) {
                    if (reconcileAt > 0) "on (last ${formatTs(reconcileAt)})" else "on"
                } else {
                    "off"
                }
                reconcileText.text = getString(R.string.status_reconcile, reconcileStatus)
            }
        }
    }

    private fun formatTs(ts: Long): String {
        val fmt = SimpleDateFormat("HH:mm:ss", Locale.US)
        return fmt.format(Date(ts))
    }
}
