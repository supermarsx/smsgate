package com.smsrelay3

import android.Manifest
import android.os.Bundle
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
import android.widget.EditText
import android.widget.LinearLayout
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.smsrelay3.data.DeviceAuthStore
import com.smsrelay3.pairing.PairingClient
import kotlin.concurrent.thread

class PairingFragment : Fragment() {
    private lateinit var statusText: TextView
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
        return inflater.inflate(R.layout.fragment_pairing, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        statusText = view.findViewById(R.id.pairing_status)
        val discoverServer = view.findViewById<Button>(R.id.discover_server)
        val scanPairingQr = view.findViewById<Button>(R.id.scan_pairing_qr)
        discoverServer.setOnClickListener {
            val config = ConfigStore.getConfig(requireContext())
            val port = config.discoveryPort
            LogStore.append("Discovery: scanning local network on port $port")
            toast(getString(R.string.toast_discovery_started))
            discoverServer.isEnabled = false
            thread {
                val results = LocalServerDiscovery.scan(requireContext(), port)
                requireActivity().runOnUiThread {
                    if (!isAdded) return@runOnUiThread
                    discoverServer.isEnabled = true
                    if (results.isEmpty()) {
                        LogStore.append("Discovery: no servers found")
                        toast(getString(R.string.toast_discovery_none))
                        showDiscoveryDialog(emptyList())
                    } else {
                        results.forEach {
                            LogStore.append("Discovery: found ${it.name} at ${it.url}")
                        }
                        toast(getString(R.string.toast_discovery_done))
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
            LogStore.append("Pairing: opening QR scanner")
            toast(getString(R.string.toast_scan_qr_started))
        }
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
    }

    private fun updateStatus() {
        val deviceId = DeviceAuthStore.getDeviceId(requireContext())
        statusText.text = if (deviceId.isNullOrBlank()) {
            getString(R.string.pairing_status_unpaired)
        } else {
            getString(R.string.pairing_status_paired, deviceId)
        }
    }

    companion object {
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
        val pinInput = EditText(requireContext()).apply {
            hint = getString(R.string.pairing_code_hint)
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
        }
        val container = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 16, 32, 0)
            addView(pinInput)
        }
        val items = results.map {
            val code = it.pairingCode?.let { pc -> " code:$pc" } ?: ""
            "${it.name}${code} (${it.url})"
        }.toTypedArray()
        var selectedIndex = 0
        AlertDialog.Builder(requireContext())
            .setTitle(getString(R.string.discover_title))
            .setView(container)
            .setSingleChoiceItems(items, 0) { _, which ->
                selectedIndex = which
            }
            .setPositiveButton(getString(R.string.discover_use)) { _, _ ->
                val selected = results.getOrNull(selectedIndex) ?: return@setPositiveButton
                ConfigStore.setString(requireContext(), ConfigStore.KEY_SERVER_URL, selected.url)
                ConfigEvents.notifyChanged()
                LogStore.append("Discovery: using ${selected.name} at ${selected.url}")
                toast(getString(R.string.toast_discovery_done))
                val pin = pinInput.text?.toString()?.trim().orEmpty()
                val pairingUrl = if (pin.isNotBlank()) {
                    "${selected.url}/api/pairing?code=$pin"
                } else {
                    selected.pairingUrl
                }
                pairingUrl?.let {
                    thread {
                        val success = PairingClient.completeWithUrl(requireContext(), it)
                        requireActivity().runOnUiThread {
                            LogStore.append(if (success) {
                                "Discovery: pairing applied"
                            } else {
                                "Discovery: pairing failed"
                            })
                            toast(if (success) getString(R.string.toast_pairing_ok) else getString(R.string.toast_pairing_failed))
                            ConfigEvents.notifyChanged()
                        }
                    }
                }
            }
            .setNegativeButton(getString(R.string.discover_cancel), null)
            .show()
    }

    private fun handlePairingPayload(payload: String) {
        val url = payload.trim()
        if (url.startsWith("http://") || url.startsWith("https://")) {
            thread {
                val success = PairingClient.completeWithUrl(requireContext(), url)
                requireActivity().runOnUiThread {
                    LogStore.append(if (success) getString(R.string.pairing_success) else getString(R.string.pairing_failed))
                    toast(if (success) getString(R.string.toast_pairing_ok) else getString(R.string.toast_pairing_failed))
                }
            }
            return
        }
        thread {
            val success = PairingClient.completeWithToken(requireContext(), url)
            requireActivity().runOnUiThread {
                LogStore.append(if (success) getString(R.string.pairing_success) else getString(R.string.pairing_failed))
                toast(if (success) getString(R.string.toast_pairing_ok) else getString(R.string.toast_pairing_failed))
            }
        }
    }

    private fun toast(message: String) {
        Toast.makeText(requireContext(), message, Toast.LENGTH_SHORT).show()
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
