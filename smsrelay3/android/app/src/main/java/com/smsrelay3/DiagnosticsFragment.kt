package com.smsrelay3

import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.smsrelay3.data.db.DatabaseProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class DiagnosticsFragment : Fragment() {
    private lateinit var permissionsText: TextView
    private lateinit var configVersionText: TextView
    private lateinit var lastHeartbeatText: TextView

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
        configVersionText = view.findViewById(R.id.diag_config_version)
        lastHeartbeatText = view.findViewById(R.id.diag_last_heartbeat)
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

            withContext(Dispatchers.Main) {
                permissionsText.text = getString(R.string.diag_permissions, permissions)
                configVersionText.text = getString(
                    R.string.diag_config_version,
                    config?.version?.toString() ?: "-"
                )
                lastHeartbeatText.text = getString(
                    R.string.diag_last_heartbeat,
                    heartbeat?.createdAtMs?.toString() ?: "-"
                )
            }
        }
    }

    private fun buildPermissionsSummary(context: android.content.Context): String {
        val sms = hasPermission(context, android.Manifest.permission.READ_SMS)
        val contacts = hasPermission(context, android.Manifest.permission.READ_CONTACTS)
        val phone = hasPermission(context, android.Manifest.permission.READ_PHONE_STATE)
        return "sms:${flag(sms)} contacts:${flag(contacts)} phone:${flag(phone)}"
    }

    private fun hasPermission(context: android.content.Context, permission: String): Boolean {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }

    private fun flag(value: Boolean): String {
        return if (value) "ok" else "missing"
    }
}
