package com.smsrelay3.util

import kotlin.math.pow
import kotlin.random.Random

object RetryBackoff {
    /**
     * Calculate exponential backoff with optional jitter.
     * @param attempt 0-based attempt count.
     * @param baseMillis base delay in ms (default 500).
     * @param maxMillis cap in ms (default 30s).
     * @param jitterFraction fraction of jitter to apply (0.0-1.0).
     */
    fun calculateDelayMillis(
        attempt: Int,
        baseMillis: Long = 500,
        maxMillis: Long = 30_000,
        jitterFraction: Double = 0.2
    ): Long {
        val exp = baseMillis * 2.0.pow(attempt.coerceAtLeast(0).toDouble())
        val capped = exp.coerceAtMost(maxMillis.toDouble())
        val jitter = (capped * jitterFraction)
        val offset = if (jitter > 0) Random.nextDouble(-jitter, jitter) else 0.0
        return (capped + offset).coerceAtLeast(0.0).toLong()
    }
}
