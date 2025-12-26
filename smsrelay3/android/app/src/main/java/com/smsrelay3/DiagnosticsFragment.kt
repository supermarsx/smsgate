package com.smsrelay3

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.export.DiagnosticsExport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.concurrent.thread

class DiagnosticsFragment : Fragment() {
    private lateinit var permissionsText: TextView
    private lateinit var pairingText: TextView
    private lateinit var configVersionText: TextView
    private lateinit var lastHeartbeatText: TextView
    private lateinit var lastErrorText: TextView
    private lateinit var overridesText: TextView
    private lateinit var serviceModeText: TextView
    private lateinit var oemGuidanceText: TextView
    private lateinit var recentEventsText: TextView
    private lateinit var recentErrorsText: TextView
    private var exportButton: android.widget.Button? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_diagnostics, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        permissionsText = view.findViewById(R.id.diag_permissions)
        pairingText = view.findViewById(R.id.diag_pairing)
        configVersionText = view.findViewById(R.id.diag_config_version)
        lastHeartbeatText = view.findViewById(R.id.diag_last_heartbeat)
        lastErrorText = view.findViewById(R.id.diag_last_error)
        overridesText = view.findViewById(R.id.diag_overrides)
        serviceModeText = view.findViewById(R.id.diag_service_mode)
        oemGuidanceText = view.findViewById(R.id.diag_oem_guidance)
        recentEventsText = view.findViewById(R.id.diag_recent_events)
        recentErrorsText = view.findViewById(R.id.diag_recent_errors)
        exportButton = view.findViewById(R.id.export_diagnostics)
        exportButton?.setOnClickListener {
            exportLauncher.launch("smsrelay3-diagnostics.json")
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
            val config = db.configStateDao().latest()
            val heartbeat = db.heartbeatDao().latest()
            val permissions = buildPermissionsSummary(context)
            val pairing = buildPairingSummary(context)
            val lastError = db.localLogDao().loadRecentByLevel("error", 1).firstOrNull()
            val overrides = db.localOverridesDao().latest()
            val serviceMode = buildServiceModeSummary(context)
            val oemGuidance = buildOemGuidance()
            val recentEvents = db.localLogDao().loadRecent(20)
            val recentErrors = db.localLogDao().loadRecentByLevel("error", 20)
            val recentEventsTextValue = formatEntries(recentEvents)
            val recentErrorsTextValue = formatEntries(recentErrors)

            withContext(Dispatchers.Main) {
                permissionsText.text = getString(R.string.diag_permissions, permissions)
                pairingText.text = getString(R.string.diag_pairing_status, pairing)
                configVersionText.text = getString(
                    R.string.diag_config_version,
                    config?.version?.toString() ?: "-"
                )
                lastHeartbeatText.text = getString(
                    R.string.diag_last_heartbeat,
                    heartbeat?.createdAtMs?.toString() ?: "-"
                )
                lastErrorText.text = getString(
                    R.string.diag_last_error,
                    lastError?.message ?: "-"
                )
                overridesText.text = getString(
                    R.string.diag_overrides,
                    overrides?.updatedAtMs?.toString() ?: "-"
                )
                serviceModeText.text = getString(R.string.diag_service_mode, serviceMode)
                oemGuidanceText.text = oemGuidance
                recentEventsText.text = recentEventsTextValue
                recentErrorsText.text = recentErrorsTextValue
            }
        }
    }

    private val exportLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        if (uri == null) return@registerForActivityResult
        thread {
            val content = DiagnosticsExport.buildDiagnosticsJson(requireContext())
            val success = DiagnosticsExport.writeToUri(requireContext(), uri, content)
            requireActivity().runOnUiThread {
                android.widget.Toast.makeText(
                    requireContext(),
                    if (success) getString(R.string.toast_export_diagnostics_done) else getString(R.string.toast_export_diagnostics_failed),
                    android.widget.Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    private fun buildPermissionsSummary(context: android.content.Context): String {
        val sms = com.smsrelay3.util.PermissionGate.hasPermission(
            context,
            android.Manifest.permission.READ_SMS
        )
        val contacts = com.smsrelay3.util.PermissionGate.hasPermission(
            context,
            android.Manifest.permission.READ_CONTACTS
        )
        val phone = com.smsrelay3.util.PermissionGate.hasPermission(
            context,
            android.Manifest.permission.READ_PHONE_STATE
        )
        return "sms:${flag(sms)} contacts:${flag(contacts)} phone:${flag(phone)}"
    }

    private fun buildPairingSummary(context: android.content.Context): String {
        val deviceId = com.smsrelay3.data.DeviceAuthStore.getDeviceId(context)
        return if (deviceId.isNullOrBlank()) {
            getString(R.string.pairing_status_unpaired)
        } else {
            getString(R.string.pairing_status_paired, deviceId)
        }
    }

    private suspend fun buildServiceModeSummary(context: android.content.Context): String {
        val policy = com.smsrelay3.config.ConfigRepository(context).latestPolicy()
        val foreground = if (RelayForegroundService.isRunning) "running" else "stopped"
        val backgroundMode = when (policy.realtimeMode) {
            "persistent_background" -> "persistent"
            "best_effort" -> "workmanager"
            else -> "disabled"
        }
        val backgroundRunning = if (BackgroundRelayService.isRunning) "running" else "stopped"
        return "mode=${policy.realtimeMode} foreground=$foreground background=$backgroundMode ($backgroundRunning)"
    }

    private fun flag(value: Boolean): String {
        return if (value) "ok" else "missing"
    }

    private fun formatEntries(entries: List<com.smsrelay3.data.entity.LocalLogEntry>): String {
        if (entries.isEmpty()) return "-"
        val formatter = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
        return entries.joinToString("\n") { entry ->
            val ts = formatter.format(java.util.Date(entry.tsMs))
            "[$ts] ${entry.message}"
        }
    }

    private fun buildOemGuidance(): String {
        val manufacturer = android.os.Build.MANUFACTURER.lowercase()
        return when {
            manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("miui") ->
                "MIUI: enable autostart, disable battery optimization, allow background activity."
            manufacturer.contains("huawei") || manufacturer.contains("honor") ->
                "Huawei: add to protected apps, disable battery optimization, allow background activity."
            manufacturer.contains("samsung") ->
                "Samsung: disable deep sleep for smsrelay3, allow background activity."
            manufacturer.contains("oppo") || manufacturer.contains("oneplus") ->
                "Oppo/OnePlus: enable autostart, allow background activity, disable battery optimization."
            manufacturer.contains("vivo") ->
                "Vivo: enable autostart, allow background activity, disable battery optimization."
            else ->
                "Check battery optimization and background restriction settings for smsrelay3."
        }
    }
}
