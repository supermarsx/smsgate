package com.smsrelay3

import androidx.test.core.app.ApplicationProvider
import com.smsrelay3.data.db.DatabaseProvider
import com.smsrelay3.data.entity.LocalLogEntry
import com.smsrelay3.export.LogExport
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.UUID

class LogExportTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

    @After
    fun cleanup() {
        File(context.filesDir.parentFile, "databases/smsrelay3.db").delete()
    }

    @Test
    fun exportRedactsDigits() = runBlocking {
        val dao = DatabaseProvider.get(context).localLogDao()
        dao.insert(
            LocalLogEntry(
                id = UUID.randomUUID().toString(),
                tsMs = System.currentTimeMillis(),
                level = "info",
                category = "test",
                message = "code 123456",
                detailsJson = null
            )
        )
        val output = LogExport.buildExport(context, "all")
        assertFalse(output.contains("123456"))
        assertTrue(output.contains("******"))
    }
}
