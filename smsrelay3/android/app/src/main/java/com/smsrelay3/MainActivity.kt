package com.smsrelay3

import android.Manifest
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.content.pm.PackageManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.viewpager2.widget.ViewPager2
import com.google.android.material.tabs.TabLayout
import com.google.android.material.tabs.TabLayoutMediator
import com.smsrelay3.presence.HeartbeatScheduler
import com.smsrelay3.sim.SimScheduler
import com.smsrelay3.sync.SyncScheduler

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val pager = findViewById<ViewPager2>(R.id.main_pager)
        val tabs = findViewById<TabLayout>(R.id.main_tabs)
        pager.adapter = MainPagerAdapter(this)
        pager.offscreenPageLimit = 1
        TabLayoutMediator(tabs, pager) { tab, position ->
            tab.text = when (position) {
                0 -> getString(R.string.tab_logs)
                1 -> getString(R.string.tab_controls)
                else -> getString(R.string.tab_configs)
            }
        }.attach()

        Handler(Looper.getMainLooper()).post {
            requestSmsPermissions()
            requestNotificationPermission()
            SyncScheduler.enqueueNow(this)
            HeartbeatScheduler.ensureScheduled(this)
            SimScheduler.ensureScheduled(this)
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
