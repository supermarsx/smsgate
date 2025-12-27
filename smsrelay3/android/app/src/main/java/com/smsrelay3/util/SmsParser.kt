package com.smsrelay3.util

import java.security.MessageDigest
import java.util.Locale

object SmsParser {
    fun stitch(parts: List<String>): String = buildString {
        parts.forEach { append(it) }
    }

    fun contentHash(sender: String, providerId: String?, body: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val payload = listOf(sender, providerId.orEmpty(), body).joinToString("|")
        val hash = digest.digest(payload.toByteArray(Charsets.UTF_8))
        return hash.joinToString("") { "%02x".format(Locale.US, it) }
    }
}
