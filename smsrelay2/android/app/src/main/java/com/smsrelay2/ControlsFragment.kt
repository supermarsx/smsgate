package com.smsrelay2

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.activity.result.contract.ActivityResultContracts
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import kotlin.concurrent.thread

class ControlsFragment : Fragment() {
    private lateinit var statusText: TextView
    private val exportLogsLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        if (uri == null) return@registerForActivityResult
        thread {
            val content = LogStore.snapshot().joinToString("\n")
            val success = writeToUri(uri, content)
            requireActivity().runOnUiThread {
                toast(if (success) getString(R.string.toast_done) else getString(R.string.toast_failed))
            }
        }
    }
    private val exportConfigLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri == null) return@registerForActivityResult
        thread {
            val content = buildConfigJson()
            val success = writeToUri(uri, content)
            requireActivity().runOnUiThread {
                toast(if (success) getString(R.string.toast_done) else getString(R.string.toast_failed))
            }
        }
    }
    private val importConfigLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@registerForActivityResult
        thread {
            val content = readFromUri(uri)
            val success = content?.let { applyConfigJson(it) } ?: false
            requireActivity().runOnUiThread {
                toast(if (success) getString(R.string.toast_done) else getString(R.string.toast_failed))
            }
        }
    }
    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        val contents = result.contents
        if (contents.isNullOrBlank()) {
            LogStore.append("Pairing: QR scan cancelled")
            return@registerForActivityResult
        }
        LogStore.append("Pairing: QR scanned")
        handlePairingPayload(contents)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_controls, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        statusText = view.findViewById(R.id.status_text)
        val startService = view.findViewById<Button>(R.id.start_service)
        val stopService = view.findViewById<Button>(R.id.stop_service)
        val provisionNow = view.findViewById<Button>(R.id.provision_now)
        val openBattery = view.findViewById<Button>(R.id.open_battery)
        val openSettings = view.findViewById<Button>(R.id.open_settings)
        val discoverServer = view.findViewById<Button>(R.id.discover_server)
        val scanPairingQr = view.findViewById<Button>(R.id.scan_pairing_qr)
        val exportLogs = view.findViewById<Button>(R.id.export_logs)
        val clearLogs = view.findViewById<Button>(R.id.clear_logs)
        val exportConfig = view.findViewById<Button>(R.id.export_config)
        val importConfig = view.findViewById<Button>(R.id.import_config)
        val startListener = view.findViewById<Button>(R.id.start_listener)
        val stopListener = view.findViewById<Button>(R.id.stop_listener)

        startService.setOnClickListener {
            val intent = Intent(requireContext(), RelayForegroundService::class.java)
            if (!ForegroundServiceGuard.start(requireContext(), intent)) {
                requestNotificationPermission()
                return@setOnClickListener
            }
            LogStore.append("Foreground service started")
            toast(getString(R.string.toast_started))
            updateStatus()
        }

        stopService.setOnClickListener {
            val intent = Intent(requireContext(), RelayForegroundService::class.java)
            requireContext().stopService(intent)
            LogStore.append("Foreground service stopped")
            toast(getString(R.string.toast_stopped))
            updateStatus()
        }

        provisionNow.setOnClickListener {
            LogStore.append("Provisioning: start")
            RemoteProvisioner.provision(requireContext()) { success ->
                LogStore.append(if (success) "Provisioning: success" else "Provisioning: failed")
                statusText.text = if (success) {
                    getString(R.string.status_ready)
                } else {
                    getString(R.string.status_error)
                }
                toast(if (success) getString(R.string.toast_done) else getString(R.string.toast_failed))
            }
        }

        openBattery.setOnClickListener {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            startActivity(intent)
        }

        openSettings.setOnClickListener {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            intent.data = Uri.fromParts("package", requireContext().packageName, null)
            startActivity(intent)
            toast(getString(R.string.toast_done))
        }

        discoverServer.setOnClickListener {
            val config = ConfigStore.getConfig(requireContext())
            val port = config.discoveryPort
            LogStore.append("Discovery: scanning local network on port $port")
            discoverServer.isEnabled = false
            thread {
                val results = LocalServerDiscovery.scan(requireContext(), port)
                requireActivity().runOnUiThread {
                    discoverServer.isEnabled = true
                    if (results.isEmpty()) {
                        LogStore.append("Discovery: no servers found")
                        showDiscoveryDialog(emptyList())
                    } else {
                        results.forEach {
                            LogStore.append("Discovery: found ${it.name} at ${it.url}")
                        }
                        showDiscoveryDialog(results)
                    }
                }
            }
        }

        scanPairingQr.setOnClickListener {
            if (!hasCameraPermission()) {
                requestCameraPermission()
                return@setOnClickListener
            }
            val options = ScanOptions()
                .setPrompt("Scan pairing QR")
                .setBeepEnabled(true)
                .setOrientationLocked(false)
            scanLauncher.launch(options)
        }

        exportLogs.setOnClickListener {
            exportLogsLauncher.launch("smsrelay2-logs.txt")
        }

        clearLogs.setOnClickListener {
            LogStore.clear()
            toast(getString(R.string.toast_done))
        }

        exportConfig.setOnClickListener {
            exportConfigLauncher.launch("smsrelay2-config.json")
        }

        importConfig.setOnClickListener {
            importConfigLauncher.launch(arrayOf("application/json"))
        }

        startListener.setOnClickListener {
            ConfigStore.setBoolean(requireContext(), ConfigStore.KEY_ENABLE_LISTENER, true)
            LogStore.append("Listener enabled")
            toast(getString(R.string.toast_started))
            updateStatus()
        }

        stopListener.setOnClickListener {
            ConfigStore.setBoolean(requireContext(), ConfigStore.KEY_ENABLE_LISTENER, false)
            LogStore.append("Listener disabled")
            toast(getString(R.string.toast_stopped))
            updateStatus()
        }
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
    }

    private fun updateStatus() {
        val config = ConfigStore.getConfig(requireContext())
        statusText.text = if (RelayForegroundService.isRunning) {
            "${getString(R.string.status_running)} | listener: ${if (config.enableListener) "on" else "off"}"
        } else {
            "${getString(R.string.status_stopped)} | listener: ${if (config.enableListener) "on" else "off"}"
        }
    }

    private fun requestNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ActivityCompat.requestPermissions(
            requireActivity(),
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            REQUEST_NOTIFICATION_PERMISSIONS
        )
    }

    companion object {
        private const val REQUEST_NOTIFICATION_PERMISSIONS = 101
        private const val REQUEST_CAMERA_PERMISSIONS = 102
    }

    private fun showDiscoveryDialog(results: List<DiscoveryResult>) {
        if (results.isEmpty()) {
            AlertDialog.Builder(requireContext())
                .setTitle(getString(R.string.discover_title))
                .setMessage(getString(R.string.discover_none))
                .setNegativeButton(getString(R.string.discover_cancel), null)
                .show()
            return
        }
        val items = results.map {
            val code = it.pairingCode?.let { pc -> " code:$pc" } ?: ""
            "${it.name}${code} (${it.url})"
        }.toTypedArray()
        var selectedIndex = 0
        AlertDialog.Builder(requireContext())
            .setTitle(getString(R.string.discover_title))
            .setSingleChoiceItems(items, 0) { _, which ->
                selectedIndex = which
            }
            .setPositiveButton(getString(R.string.discover_use)) { _, _ ->
                val selected = results.getOrNull(selectedIndex) ?: return@setPositiveButton
                ConfigStore.setString(requireContext(), ConfigStore.KEY_SERVER_URL, selected.url)
                LogStore.append("Discovery: using ${selected.name} at ${selected.url}")
                toast(getString(R.string.toast_done))
                selected.pairingUrl?.let { pairingUrl ->
                    LogStore.append("Discovery: pulling config from pairing endpoint")
                    RemoteProvisioner.provisionWithUrl(requireContext(), pairingUrl) { success ->
                        LogStore.append(if (success) {
                            "Discovery: pairing config applied"
                        } else {
                            "Discovery: pairing config failed"
                        })
                        toast(if (success) getString(R.string.toast_done) else getString(R.string.toast_failed))
                    }
                }
            }
            .setNegativeButton(getString(R.string.discover_cancel), null)
            .show()
    }

    private fun handlePairingPayload(payload: String) {
        val url = payload.trim()
        if (url.startsWith("http://") || url.startsWith("https://")) {
            RemoteProvisioner.provisionWithUrl(requireContext(), url) { success ->
                LogStore.append(if (success) getString(R.string.pairing_success) else getString(R.string.pairing_failed))
                toast(if (success) getString(R.string.toast_done) else getString(R.string.toast_failed))
            }
            return
        }
        LogStore.append(getString(R.string.pairing_failed))
        toast(getString(R.string.toast_failed))
    }

    private fun toast(message: String) {
        Toast.makeText(requireContext(), message, Toast.LENGTH_SHORT).show()
    }

    private fun writeToUri(uri: android.net.Uri, content: String): Boolean {
        return try {
            requireContext().contentResolver.openOutputStream(uri)?.use { stream ->
                OutputStreamWriter(stream).use { writer ->
                    writer.write(content)
                }
            } ?: return false
            LogStore.append("Export: wrote ${content.length} bytes")
            true
        } catch (_: Exception) {
            LogStore.append("Export: failed")
            false
        }
    }

    private fun readFromUri(uri: android.net.Uri): String? {
        return try {
            requireContext().contentResolver.openInputStream(uri)?.use { stream ->
                BufferedReader(InputStreamReader(stream)).readText()
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun buildConfigJson(): String {
        val config = ConfigStore.getConfig(requireContext())
        val json = org.json.JSONObject()
        val server = org.json.JSONObject()
        server.put("url", config.serverUrl)
        server.put("apiPath", config.apiPath)
        server.put("method", config.httpMethod)
        json.put("server", server)
        val auth = org.json.JSONObject()
        auth.put("clientIdHeader", config.clientIdHeader)
        auth.put("clientId", config.clientIdValue)
        auth.put("authHeader", config.authHeader)
        auth.put("authPrefix", config.authPrefix)
        auth.put("acceptHeader", config.acceptHeader)
        auth.put("acceptValue", config.acceptValue)
        auth.put("contentTypeHeader", config.contentTypeHeader)
        auth.put("contentTypeValue", config.contentTypeValue)
        auth.put("pin", config.pin)
        auth.put("salt", config.salt)
        json.put("auth", auth)
        val features = org.json.JSONObject()
        features.put("enableListener", config.enableListener)
        features.put("enableForegroundService", config.enableForegroundService)
        features.put("enableBootReceiver", config.enableBootReceiver)
        features.put("enableSocketPresence", config.enableSocketPresence)
        features.put("notificationEnabled", config.notificationEnabled)
        json.put("features", features)
        return json.toString(2)
    }

    private fun applyConfigJson(raw: String): Boolean {
        return try {
            val json = org.json.JSONObject(raw)
            RemoteProvisioner.applyConfigJson(requireContext(), json)
            LogStore.append("Import: config applied")
            true
        } catch (_: Exception) {
            LogStore.append("Import: failed")
            false
        }
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun requestCameraPermission() {
        ActivityCompat.requestPermissions(
            requireActivity(),
            arrayOf(Manifest.permission.CAMERA),
            REQUEST_CAMERA_PERMISSIONS
        )
    }
}
