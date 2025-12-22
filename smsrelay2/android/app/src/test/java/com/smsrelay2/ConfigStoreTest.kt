package com.smsrelay2

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ConfigStoreTest {
    @Test
    fun defaults_areStable() {
        assertEquals("http://#SERVER:#PORT", ConfigStore.defaultString(ConfigStore.KEY_SERVER_URL))
        assertEquals("/api/push/message", ConfigStore.defaultString(ConfigStore.KEY_API_PATH))
        assertEquals("POST", ConfigStore.defaultString(ConfigStore.KEY_HTTP_METHOD))
        assertEquals("x-clientid", ConfigStore.defaultString(ConfigStore.KEY_CLIENT_ID_HEADER))
        assertEquals("Authorization", ConfigStore.defaultString(ConfigStore.KEY_AUTH_HEADER))
    }

    @Test
    fun set_and_get_string() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        ConfigStore.setString(context, ConfigStore.KEY_SERVER_URL, "https://example.com")
        val value = ConfigStore.getString(context, ConfigStore.KEY_SERVER_URL, "")
        assertEquals("https://example.com", value)
    }
}
