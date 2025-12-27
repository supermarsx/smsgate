package com.smsrelay3

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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

        // Quick handoff to main once the app is ready; keeps splash responsive.
        Handler(Looper.getMainLooper()).post {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
    }
}
