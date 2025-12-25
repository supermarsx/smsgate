package com.smsrelay3

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.viewpager2.widget.ViewPager2
import com.google.android.material.tabs.TabLayout
import com.google.android.material.tabs.TabLayoutMediator
import com.smsrelay3.config.ConfigScheduler
import com.smsrelay3.contacts.ContactsSyncScheduler
import com.smsrelay3.presence.HeartbeatScheduler
import com.smsrelay3.reconcile.ReconcileScheduler
import com.smsrelay3.retention.PruneScheduler
import com.smsrelay3.sim.SimScheduler
import com.smsrelay3.sync.SyncScheduler
import com.smsrelay3.util.LocaleManager
import com.smsrelay3.util.ThemeManager

class MainActivity : AppCompatActivity() {
    override fun attachBaseContext(newBase: android.content.Context) {
        super.attachBaseContext(LocaleManager.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ThemeManager.apply(this)
        LogStore.init(applicationContext)
        setContentView(R.layout.activity_main)

        val pager = findViewById<ViewPager2>(R.id.main_pager)
        val tabs = findViewById<TabLayout>(R.id.main_tabs)
        pager.adapter = MainPagerAdapter(this)
        pager.offscreenPageLimit = 1
        TabLayoutMediator(tabs, pager) { tab, position ->
            val label = when (position) {
                0 -> getString(R.string.tab_status)
                1 -> getString(R.string.tab_diagnostics)
                2 -> getString(R.string.tab_logs)
                3 -> getString(R.string.tab_pairing)
                else -> getString(R.string.tab_configs)
            }
            tab.text = null
            tab.contentDescription = label
            tab.setIcon(
                when (position) {
                    0 -> R.drawable.ic_tab_status
                    1 -> R.drawable.ic_tab_diagnostics
                    2 -> R.drawable.ic_tab_logs
                    3 -> R.drawable.ic_tab_pairing
                    else -> R.drawable.ic_tab_settings
                }
            )
        }.attach()

        Handler(Looper.getMainLooper()).post {
            requestSmsPermissions()
            requestNotificationPermission()
            SyncScheduler.enqueueNow(this)
            ConfigScheduler.ensureScheduled(this)
            HeartbeatScheduler.ensureScheduled(this)
            SimScheduler.ensureScheduled(this)
            ReconcileScheduler.ensureScheduled(this)
            PruneScheduler.ensureScheduled(this)
            ContactsSyncScheduler.ensureScheduled(this)
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
            return
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

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_SMS_PERMISSIONS) return
        val granted = permissions.indices.all { index ->
            grantResults.getOrNull(index) == PackageManager.PERMISSION_GRANTED
        }
        if (!granted) {
            showSmsPermissionRequiredDialog()
        }
    }

    private fun showSmsPermissionRequiredDialog() {
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.sms_permission_title))
            .setMessage(getString(R.string.sms_permission_message))
            .setPositiveButton(getString(R.string.sms_permission_open_settings)) { _, _ ->
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                intent.data = Uri.fromParts("package", packageName, null)
                startActivity(intent)
            }
            .setNegativeButton(getString(R.string.sms_permission_retry)) { _, _ ->
                requestSmsPermissions()
            }
            .setCancelable(false)
            .show()
    }

    override fun onResume() {
        super.onResume()
        requestSmsPermissions()
    }
}
