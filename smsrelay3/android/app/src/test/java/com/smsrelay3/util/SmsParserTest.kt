package com.smsrelay3.util

import org.junit.Assert.assertEquals
import org.junit.Test

class SmsParserTest {
    @Test
    fun `multipart segments stitch correctly`() {
        val parts = listOf("Hello ", "world", "!")
        val stitched = SmsParser.stitch(parts)
        assertEquals("Hello world!", stitched)
    }

    @Test
    fun `content hash is stable`() {
        val hash1 = SmsParser.contentHash("abc", "123", "Hello")
        val hash2 = SmsParser.contentHash("abc", "123", "Hello")
        assertEquals(hash1, hash2)
    }
}
