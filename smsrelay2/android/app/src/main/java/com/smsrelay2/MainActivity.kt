package com.smsrelay2

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager

class MainActivity : AppCompatActivity() {
    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.status_text)
        val startService = findViewById<Button>(R.id.start_service)
        val stopService = findViewById<Button>(R.id.stop_service)
        val provisionNow = findViewById<Button>(R.id.provision_now)
        val openBattery = findViewById<Button>(R.id.open_battery)
        val openSettings = findViewById<Button>(R.id.open_settings)

        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.settings_container, SettingsFragment())
                .commit()
        }

        startService.setOnClickListener {
            val intent = Intent(this, RelayForegroundService::class.java)
            if (!ForegroundServiceGuard.start(this, intent)) {
                requestNotificationPermission()
                return@setOnClickListener
            }
            updateStatus()
        }

        stopService.setOnClickListener {
            val intent = Intent(this, RelayForegroundService::class.java)
            stopService(intent)
            updateStatus()
        }

        provisionNow.setOnClickListener {
            RemoteProvisioner.provision(this) { success ->
                statusText.text = if (success) getString(R.string.status_ready) else getString(R.string.status_error)
            }
        }

        openBattery.setOnClickListener {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            startActivity(intent)
        }

        openSettings.setOnClickListener {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            intent.data = Uri.fromParts("package", packageName, null)
            startActivity(intent)
        }

        requestSmsPermissions()
        requestNotificationPermission()
        PendingResendWorker.enqueue(this)
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

    private fun requestSmsPermissions() {
        val permissions = arrayOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS
        )
        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQUEST_SMS_PERMISSIONS)
        }
    }

    private fun requestNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            REQUEST_NOTIFICATION_PERMISSIONS
        )
    }

    companion object {
        private const val REQUEST_SMS_PERMISSIONS = 100
        private const val REQUEST_NOTIFICATION_PERMISSIONS = 101
    }
}
