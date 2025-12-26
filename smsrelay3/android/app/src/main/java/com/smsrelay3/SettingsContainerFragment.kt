package com.smsrelay3

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import androidx.appcompat.widget.SwitchCompat
import androidx.fragment.app.Fragment
import androidx.activity.result.contract.ActivityResultContracts
import com.smsrelay3.util.OemSettings
import kotlin.concurrent.thread

class SettingsContainerFragment : Fragment() {
    private val exportConfigLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri == null) return@registerForActivityResult
        thread {
            val content = SettingsExport.buildConfigJson(requireContext())
            val success = SettingsExport.writeToUri(requireContext(), uri, content)
            requireActivity().runOnUiThread {
                toast(if (success) getString(R.string.toast_export_config_done) else getString(R.string.toast_export_config_failed))
            }
        }
    }
    private val importConfigLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@registerForActivityResult
        thread {
            val content = SettingsExport.readFromUri(requireContext(), uri)
            val success = content?.let { SettingsExport.applyConfigJson(requireContext(), it) } ?: false
            requireActivity().runOnUiThread {
                toast(if (success) getString(R.string.toast_import_config_done) else getString(R.string.toast_import_config_failed))
            }
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return inflater.inflate(R.layout.fragment_settings, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val openSettings = view.findViewById<Button>(R.id.open_settings)
        val openBattery = view.findViewById<Button>(R.id.open_battery)
        val openNotifications = view.findViewById<Button>(R.id.open_notifications)
        val openAutostart = view.findViewById<Button>(R.id.open_autostart)
        val exportConfig = view.findViewById<Button>(R.id.export_config)
        val importConfig = view.findViewById<Button>(R.id.import_config)
        val toggleServices = view.findViewById<SwitchCompat>(R.id.toggle_services)

        toggleServices.isChecked = ConfigStore.getBoolean(
            requireContext(),
            ConfigStore.KEY_SERVICES_ENABLED,
            true
        )
        toggleServices.setOnCheckedChangeListener { _, enabled ->
            ConfigStore.setBoolean(requireContext(), ConfigStore.KEY_SERVICES_ENABLED, enabled)
            ServiceModeController.apply(requireContext())
        }

        openSettings.setOnClickListener {
            val intent = android.content.Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            intent.data = android.net.Uri.fromParts("package", requireContext().packageName, null)
            startActivity(intent)
            toast(getString(R.string.toast_open_settings))
        }

        openBattery.setOnClickListener {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            startActivity(intent)
            toast(getString(R.string.toast_open_battery))
        }

        openNotifications.setOnClickListener {
            OemSettings.openNotificationSettings(requireContext())
            toast(getString(R.string.toast_open_notifications))
        }

        openAutostart.setOnClickListener {
            val opened = OemSettings.openAutoStartSettings(requireContext())
            if (!opened) {
                val intent = android.content.Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                intent.data = android.net.Uri.fromParts("package", requireContext().packageName, null)
                startActivity(intent)
            }
            toast(getString(R.string.toast_open_autostart))
        }

        exportConfig.setOnClickListener {
            exportConfigLauncher.launch("smsrelay3-config.json")
            toast(getString(R.string.toast_export_config_started))
        }

        importConfig.setOnClickListener {
            importConfigLauncher.launch(arrayOf("application/json"))
            toast(getString(R.string.toast_import_config_started))
        }

        if (childFragmentManager.findFragmentById(R.id.settings_container) == null) {
            childFragmentManager.beginTransaction()
                .replace(R.id.settings_container, SettingsFragment())
                .commit()
        }
    }

    private fun toast(message: String) {
        android.widget.Toast.makeText(requireContext(), message, android.widget.Toast.LENGTH_SHORT).show()
    }
}
