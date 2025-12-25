package com.smsrelay3

import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RemoteProvisionerTest {
    @Test
    fun applyConfig_updatesPreferences() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val json = JSONObject(
            """
            {
              "server": {
                "url": "https://example.com",
                "apiPath": "/api/push/message",
                "method": "POST"
              },
              "auth": {
                "clientIdHeader": "x-clientid",
                "clientId": "DEVICE01",
                "authHeader": "Authorization",
                "authPrefix": "Bearer ",
                "acceptHeader": "Accept",
                "acceptValue": "application/json",
                "contentTypeHeader": "Content-Type",
                "contentTypeValue": "application/json",
                "pin": "1234",
                "salt": "SALT"
              },
              "features": {
                "enableListener": true,
                "enableForegroundService": true,
                "enableBootReceiver": true,
                "enableSocketPresence": true,
                "notificationEnabled": true
              }
            }
            """.trimIndent()
        )

        RemoteProvisioner.applyConfigForTest(context, json)
        val config = ConfigStore.getConfig(context)
        assertEquals("https://example.com", config.serverUrl)
        assertEquals("DEVICE01", config.clientIdValue)
        assertEquals("1234", config.pin)
        assertEquals("SALT", config.salt)
    }
}
