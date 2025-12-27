package com.smsrelay3

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.doOnLayout
import androidx.viewpager2.widget.ViewPager2
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.InsetDrawable
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
import android.widget.LinearLayout

class MainActivity : AppCompatActivity() {
    private val configListener: () -> Unit = {
        ServiceModeController.apply(this)
    }
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
        pager.offscreenPageLimit = 5
        tabs.isHorizontalScrollBarEnabled = false
        tabs.setPadding(0, 0, 0, 0)
        tabs.clipToPadding = true
        tabs.isTabIndicatorFullWidth = true
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

        tabs.tabMode = TabLayout.MODE_FIXED
        tabs.tabGravity = TabLayout.GRAVITY_FILL
        fun applyEvenTabWidths() {
            val tabStrip = tabs.getChildAt(0) as? LinearLayout ?: return
            val count = tabStrip.childCount.takeIf { it > 0 } ?: return
            val availableWidth = tabs.width - tabs.paddingLeft - tabs.paddingRight
            val perTabWidth = (availableWidth / count).coerceAtLeast(0)
            val inset = (perTabWidth / 4).coerceAtLeast(0)
            val indicatorHeight = resources.displayMetrics.density.times(3f).toInt().coerceAtLeast(2)
            val indicatorDrawable = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                setColor(tabs.tabIndicatorColor)
                cornerRadius = resources.displayMetrics.density * 2f
                setSize(0, indicatorHeight)
            }
            tabs.setSelectedTabIndicator(InsetDrawable(indicatorDrawable, inset, 0, inset, 0))
            tabStrip.layoutParams = tabStrip.layoutParams?.apply {
                width = LinearLayout.LayoutParams.MATCH_PARENT
            }
            tabStrip.weightSum = count.toFloat()
            tabStrip.setPadding(0, 0, 0, 0)
            tabStrip.clipToPadding = false
            for (i in 0 until count) {
                val child = tabStrip.getChildAt(i)
                val lp = child.layoutParams as? LinearLayout.LayoutParams ?: continue
                lp.width = perTabWidth
                lp.weight = 0f
                child.layoutParams = lp
                child.minimumWidth = 0
                child.setPadding(0, child.paddingTop, 0, child.paddingBottom)
            }
            tabStrip.requestLayout()
        }
        tabs.doOnLayout { applyEvenTabWidths() }
        tabs.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> applyEvenTabWidths() }

        Handler(Looper.getMainLooper()).post {
            SyncScheduler.enqueueNow(this)
            ConfigScheduler.ensureScheduled(this)
            HeartbeatScheduler.ensureScheduled(this)
            SimScheduler.ensureScheduled(this)
            ReconcileScheduler.ensureScheduled(this)
            PruneScheduler.ensureScheduled(this)
            ContactsSyncScheduler.ensureScheduled(this)
            ServiceModeController.apply(this)
        }
    }

    companion object {
    }

    override fun onResume() {
        super.onResume()
        if (!PermissionGate.allRequiredGranted(this)) {
            startActivity(Intent(this, PermissionsActivity::class.java))
            finish()
            return
        }
        ConfigEvents.register(configListener)
        ServiceModeController.apply(this)
    }

    override fun onPause() {
        ConfigEvents.unregister(configListener)
        super.onPause()
    }
}
