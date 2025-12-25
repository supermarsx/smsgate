package com.smsrelay3

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity
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
import com.smsrelay3.util.PermissionGate

class MainActivity : AppCompatActivity() {
    override fun attachBaseContext(newBase: android.content.Context) {
        super.attachBaseContext(LocaleManager.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        ThemeManager.applyMode(this)
        ThemeManager.applyTheme(this)
        super.onCreate(savedInstanceState)
        LogStore.init(applicationContext)
        setContentView(R.layout.activity_main)
        if (!PermissionGate.allRequiredGranted(this)) {
            startActivity(Intent(this, PermissionsActivity::class.java))
            finish()
            return
        }

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
            SyncScheduler.enqueueNow(this)
            ConfigScheduler.ensureScheduled(this)
            HeartbeatScheduler.ensureScheduled(this)
            SimScheduler.ensureScheduled(this)
            ReconcileScheduler.ensureScheduled(this)
            PruneScheduler.ensureScheduled(this)
            ContactsSyncScheduler.ensureScheduled(this)
        }
    }

    companion object {
    }

    override fun onResume() {
        super.onResume()
        if (!PermissionGate.allRequiredGranted(this)) {
            startActivity(Intent(this, PermissionsActivity::class.java))
            finish()
        }
    }
}
