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
import androidx.appcompat.app.AlertDialog
import kotlin.concurrent.thread

class ControlsFragment : Fragment() {
    private lateinit var statusText: TextView

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

        startService.setOnClickListener {
            val intent = Intent(requireContext(), RelayForegroundService::class.java)
            if (!ForegroundServiceGuard.start(requireContext(), intent)) {
                requestNotificationPermission()
                return@setOnClickListener
            }
            updateStatus()
        }

        stopService.setOnClickListener {
            val intent = Intent(requireContext(), RelayForegroundService::class.java)
            requireContext().stopService(intent)
            updateStatus()
        }

        provisionNow.setOnClickListener {
            RemoteProvisioner.provision(requireContext()) { success ->
                statusText.text = if (success) {
                    getString(R.string.status_ready)
                } else {
                    getString(R.string.status_error)
                }
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
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
    }

    private fun updateStatus() {
        statusText.text = if (RelayForegroundService.isRunning) {
            getString(R.string.status_running)
        } else {
            getString(R.string.status_stopped)
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
        val items = results.map { "${it.name} (${it.url})" }.toTypedArray()
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
            }
            .setNegativeButton(getString(R.string.discover_cancel), null)
            .show()
    }
}
