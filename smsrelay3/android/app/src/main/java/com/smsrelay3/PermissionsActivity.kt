package com.smsrelay3

import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.smsrelay3.util.PermissionGate
import com.smsrelay3.util.ThemeManager

class PermissionsActivity : AppCompatActivity() {
    private lateinit var requiredText: TextView
    private lateinit var optionalText: TextView
    private lateinit var statusText: TextView
    private lateinit var actionButton: Button

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ ->
        refresh()
        if (PermissionGate.allRequiredGranted(this)) {
            proceed()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        ThemeManager.applyMode(this)
        ThemeManager.applyTheme(this)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_permissions)
        requiredText = findViewById(R.id.permissions_required_list)
        optionalText = findViewById(R.id.permissions_optional_list)
        statusText = findViewById(R.id.permissions_status)
        actionButton = findViewById(R.id.permissions_action)

        actionButton.setOnClickListener {
            val toRequest = PermissionGate.requiredPermissions + PermissionGate.optionalPermissions
            permissionLauncher.launch(toRequest.toTypedArray())
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
        if (PermissionGate.allRequiredGranted(this)) {
            proceed()
        }
    }

    private fun refresh() {
        requiredText.text = buildListText(PermissionGate.requiredPermissions)
        optionalText.text = buildListText(PermissionGate.optionalPermissions)
        statusText.text = if (PermissionGate.allRequiredGranted(this)) {
            getString(R.string.permissions_ready)
        } else {
            getString(R.string.permissions_missing)
        }
        actionButton.text = if (PermissionGate.allRequiredGranted(this)) {
            getString(R.string.permissions_continue)
        } else {
            getString(R.string.permissions_grant)
        }
    }

    private fun buildListText(list: List<String>): String {
        if (list.isEmpty()) return "-"
        return list.joinToString("\n") { permission ->
            val label = permission.substringAfterLast('.')
            val ok = PermissionGate.hasPermission(this, permission)
            val mark = if (ok) "OK" else "MISSING"
            "$label: $mark"
        }
    }

    private fun proceed() {
        if (isFinishing) return
        startActivity(android.content.Intent(this, MainActivity::class.java))
        finish()
    }
}
