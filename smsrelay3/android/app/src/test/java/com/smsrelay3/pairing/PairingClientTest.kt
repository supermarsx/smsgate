package com.smsrelay3.pairing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PairingClientTest {
    @Test
    fun `parseErrorMessage returns error field when present`() {
        val json = """{"error":"bad token"}"""
        assertEquals("bad token", PairingClient.parseErrorMessage(json))
    }

    @Test
    fun `parseErrorMessage falls back to message field`() {
        val json = """{"message":"expired"}"""
        assertEquals("expired", PairingClient.parseErrorMessage(json))
    }

    @Test
    fun `parseErrorMessage returns null for empty or invalid`() {
        assertNull(PairingClient.parseErrorMessage(""))
        assertNull(PairingClient.parseErrorMessage("{not-json"))
    }
}
