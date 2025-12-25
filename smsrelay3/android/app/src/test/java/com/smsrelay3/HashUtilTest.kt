package com.smsrelay3

import org.junit.Assert.assertEquals
import org.junit.Test

class HashUtilTest {
    @Test
    fun sha512_matchesKnownValue() {
        val input = "abc"
        val expected =
            "ddaf35a193617abacc417349ae204131" +
                "12e6fa4e89a97ea20a9eeee64b55d39a" +
                "2192992a274fc1a836ba3c23a3feebbd" +
                "454d4423643ce80e2a9ac94fa54ca49f"
        assertEquals(expected, HashUtil.sha512(input))
    }
}
