package com.smsrelay3.sync

import com.smsrelay3.util.RetryBackoff
import org.junit.Assert.assertTrue
import org.junit.Test

class RetryBackoffStrategyTest {
    @Test
    fun `default backoff grows and caps`() {
        val delays = (0..5).map { RetryBackoff.calculateDelayMillis(it, baseMillis = 500, maxMillis = 30_000, jitterFraction = 0.0) }
        assertTrue(delays.zipWithNext().all { it.first <= it.second })
        assertTrue(delays.last() <= 30_000)
    }
}
