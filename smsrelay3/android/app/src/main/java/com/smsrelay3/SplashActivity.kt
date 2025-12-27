package com.smsrelay3

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.StrictMode
import androidx.appcompat.app.AppCompatActivity
import com.smsrelay3.util.ThemeManager
import com.smsrelay3.util.LocaleManager

class SplashActivity : AppCompatActivity() {
    override fun attachBaseContext(newBase: android.content.Context) {
        super.attachBaseContext(LocaleManager.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        ThemeManager.applyMode(this)
        ThemeManager.applyTheme(this)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)
        val icon = findViewById<android.view.View>(R.id.splash_icon)
        val title = findViewById<android.view.View>(R.id.splash_text)
        val progress = findViewById<android.view.View>(R.id.splash_progress)
        val subtext = findViewById<android.view.View>(R.id.splash_subtext)
        val views = listOf(icon, title, progress, subtext)
        val dp = resources.displayMetrics.density
        views.forEachIndexed { idx, v ->
            v.alpha = 0f
            v.translationY = 6f * dp
            v.animate()
                .alpha(1f)
                .translationY(0f)
                .setDuration(220)
                .setStartDelay((40L * idx))
                .start()
        }

        Handler(Looper.getMainLooper()).post {
            // Allow the short-lived disk/binder work from activity launch to avoid StrictMode spam.
            val old = StrictMode.allowThreadDiskReads()
            try {
                startActivity(Intent(this, MainActivity::class.java))
                finish()
            } finally {
                StrictMode.setThreadPolicy(old)
            }
        }
    }
}
