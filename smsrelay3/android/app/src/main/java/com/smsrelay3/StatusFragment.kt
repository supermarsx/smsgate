package com.smsrelay3

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.data.OutboundMessageStatus
import com.smsrelay3.data.db.DatabaseProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class StatusFragment : Fragment() {
    private lateinit var deviceIdText: TextView
    private lateinit var queueDepthText: TextView
    private lateinit var lastRttText: TextView
    private lateinit var lastSendText: TextView
    private lateinit var simSummaryText: TextView

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
        queueDepthText = view.findViewById(R.id.status_queue_depth)
        lastRttText = view.findViewById(R.id.status_last_rtt)
        lastSendText = view.findViewById(R.id.status_last_send)
        simSummaryText = view.findViewById(R.id.status_sim_summary)
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

            withContext(Dispatchers.Main) {
                deviceIdText.text = getString(R.string.status_device_id, deviceId)
                queueDepthText.text = getString(R.string.status_queue_depth, queueDepth)
                lastRttText.text = getString(
                    R.string.status_last_rtt,
                    heartbeat?.lastRttMs?.toString() ?: "-"
                )
                lastSendText.text = getString(
                    R.string.status_last_send,
                    lastAck?.toString() ?: "-"
                )
                simSummaryText.text = getString(
                    R.string.status_sim_summary,
                    if (simSlots.isEmpty()) "-" else simSlots.joinToString(",")
                )
            }
        }
    }
}
