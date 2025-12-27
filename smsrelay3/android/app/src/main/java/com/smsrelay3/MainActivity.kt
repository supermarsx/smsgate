package com.smsrelay3

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.doOnLayout
import androidx.viewpager2.widget.ViewPager2
import androidx.lifecycle.lifecycleScope
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.InsetDrawable
import kotlinx.coroutines.launch
import com.google.android.material.color.MaterialColors
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
    private var tabsSized = false
    private var themeOverlay: View? = null
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
        themeOverlay = findViewById(R.id.theme_loading_overlay)
        themeOverlay?.visibility = View.VISIBLE
        themeOverlay?.alpha = 1f
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
        var lastAppliedWidth = -1
        var lastAppliedCount = -1
        fun applyEvenTabWidths() {
            if (tabsSized) return
            tabs.post {
                if (tabsSized) return@post
                val tabStrip = tabs.getChildAt(0) as? LinearLayout ?: return@post
                val count = tabStrip.childCount.takeIf { it > 0 } ?: return@post
                val availableWidth = tabs.width - tabs.paddingLeft - tabs.paddingRight
                val perTabWidth = (availableWidth / count).coerceAtLeast(0)
                if (availableWidth == lastAppliedWidth && count == lastAppliedCount) return@post
                lastAppliedWidth = availableWidth
                lastAppliedCount = count
                val inset = (perTabWidth / 4).coerceAtLeast(0)
                val indicatorHeight = resources.displayMetrics.density.times(3f).toInt().coerceAtLeast(2)
                val indicatorColor = MaterialColors.getColor(tabs, com.google.android.material.R.attr.colorPrimary)
                val indicatorDrawable = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    setColor(indicatorColor)
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
                    val newWidth = perTabWidth
                    if (lp.width == newWidth && lp.weight == 0f && child.minimumWidth == 0) continue
                    lp.width = newWidth
                    lp.weight = 0f
                    child.layoutParams = lp
                    child.minimumWidth = 0
                    child.setPadding(0, child.paddingTop, 0, child.paddingBottom)
                }
                tabsSized = true
            }
        }
        tabs.doOnLayout { applyEvenTabWidths() }

        Handler(Looper.getMainLooper()).post {
            SyncScheduler.enqueueNow(this)
            SyncScheduler.ensureCatchUp(this)
            ConfigScheduler.ensureScheduled(this)
            HeartbeatScheduler.ensureScheduled(this)
            SimScheduler.ensureScheduled(this)
            ReconcileScheduler.ensureScheduled(this)
            PruneScheduler.ensureScheduled(this)
            ContactsSyncScheduler.ensureScheduled(this)
            ServiceModeController.apply(this)
            fadeInContent()
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
        lifecycleScope.launch {
            ServiceModeController.applyAsync(this@MainActivity)
        }
    }

    fun showThemeChangeOverlay() {
        themeOverlay?.let { overlay ->
            overlay.visibility = View.VISIBLE
            overlay.alpha = 0f
            overlay.animate().alpha(1f).setDuration(120).start()
        }
    }

    private fun fadeInContent() {
        val logo = findViewById<View>(R.id.logo_text)
        val tabs = findViewById<View>(R.id.main_tabs)
        val pager = findViewById<View>(R.id.main_pager)
        val overlay = themeOverlay
        val targets = listOf(logo, tabs, pager)
        targets.forEach { view ->
            view.visibility = View.VISIBLE
            view.animate().alpha(1f).setDuration(250).start()
        }
        overlay?.animate()?.alpha(0f)?.setDuration(180)?.withEndAction {
            overlay.visibility = View.GONE
        }?.start()
    }

    override fun onPause() {
        ConfigEvents.unregister(configListener)
        super.onPause()
    }
}
