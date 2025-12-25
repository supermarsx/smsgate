package com.smsrelay3

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class PendingMessageStoreTest {
    @Test
    fun add_and_remove_pending_message() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val file = File(context.filesDir, "pending_sms.json")
        if (file.exists()) file.delete()

        val message = PendingMessageStore.create("+1", "hello", 1700000000000L)
        PendingMessageStore.add(context, message)

        val listed = PendingMessageStore.list(context)
        assertEquals(1, listed.size)
        assertEquals(message.id, listed[0].id)

        PendingMessageStore.remove(context, message.id)
        assertTrue(PendingMessageStore.list(context).isEmpty())
    }
}
