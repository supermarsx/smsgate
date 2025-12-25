package com.smsrelay3.export

import android.content.Context
import android.net.Uri
import com.smsrelay3.data.db.DatabaseProvider
import kotlinx.coroutines.runBlocking
import java.io.OutputStreamWriter

object LogExport {
    fun buildExport(context: Context, filter: String): String {
        val dao = DatabaseProvider.get(context).localLogDao()
        val entries = runBlocking {
            if (filter == "error") {
                dao.loadRecentByLevel("error", 500)
            } else {
                dao.loadRecent(500)
            }
        }
        return entries.reversed().joinToString("\n") { entry ->
            redact("[${entry.tsMs}] ${entry.level}/${entry.category}: ${entry.message}")
        }
    }

    fun writeToUri(context: Context, uri: Uri, content: String): Boolean {
        return try {
            context.contentResolver.openOutputStream(uri)?.use { stream ->
                OutputStreamWriter(stream).use { writer ->
                    writer.write(content)
                }
            } ?: return false
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun redact(line: String): String {
        val digits = Regex("\\b\\d{4,}\\b")
        return digits.replace(line) { matchResult ->
            "*".repeat(matchResult.value.length)
        }
    }
}
