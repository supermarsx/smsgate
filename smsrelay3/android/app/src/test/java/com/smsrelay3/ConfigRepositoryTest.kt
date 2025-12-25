package com.smsrelay3

import androidx.test.core.app.ApplicationProvider
import com.smsrelay3.config.ConfigDefaults
import com.smsrelay3.config.ConfigRepository
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class ConfigRepositoryTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

    @After
    fun cleanup() {
        File(context.filesDir.parentFile, "databases/smsrelay3.db").delete()
    }

    @Test
    fun defaultPolicyMatchesDefaults() = runBlocking {
        val policy = ConfigRepository(context).latestPolicy()
        assertEquals(ConfigDefaults.REALTIME_MODE, policy.realtimeMode)
        assertEquals(ConfigDefaults.RETENTION_ACKED_HOURS, policy.retentionAckedHours)
        assertEquals(ConfigDefaults.RETENTION_LOG_DAYS, policy.retentionLogDays)
        assertEquals(ConfigDefaults.CONTACTS_SYNC_ENABLED, policy.contactsSyncEnabled)
        assertEquals(ConfigDefaults.TLS_PINNING_ENABLED, policy.tlsPinningEnabled)
    }
}
