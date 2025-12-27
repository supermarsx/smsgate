package com.smsrelay3.util

import org.junit.Assert.assertTrue
import org.junit.Test

class RetryBackoffTest {
    @Test
    fun `backoff grows but is capped`() {
        val d0 = RetryBackoff.calculateDelayMillis(attempt = 0, baseMillis = 100, maxMillis = 1000, jitterFraction = 0.0)
        val d1 = RetryBackoff.calculateDelayMillis(attempt = 1, baseMillis = 100, maxMillis = 1000, jitterFraction = 0.0)
        val d5 = RetryBackoff.calculateDelayMillis(attempt = 5, baseMillis = 100, maxMillis = 1000, jitterFraction = 0.0)
        assertTrue(d1 > d0)
        assertTrue(d5 <= 1000)
    }

    @Test
    fun `jitter stays within bounds`() {
        val base = 200L
        val jitter = 0.1
        repeat(20) {
            val value = RetryBackoff.calculateDelayMillis(attempt = 0, baseMillis = base, maxMillis = 1000, jitterFraction = jitter)
            assertTrue(value in (base * (1 - jitter)).toLong()..(base * (1 + jitter)).toLong())
        }
    }
}
