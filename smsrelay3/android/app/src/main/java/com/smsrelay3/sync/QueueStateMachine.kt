package com.smsrelay3.sync

import com.smsrelay3.data.OutboundMessageStatus
import com.smsrelay3.data.entity.OutboundMessage
import com.smsrelay3.util.RetryBackoff

/**
 * Stateless helpers to evolve outbound messages through the queue lifecycle.
 * This keeps the retry policy centralized and testable.
 */
object QueueStateMachine {
    fun onSendStart(message: OutboundMessage, nowMs: Long = System.currentTimeMillis()): OutboundMessage {
        return message.copy(
            status = OutboundMessageStatus.SENDING,
            lastAttemptAtMs = nowMs
        )
    }

    fun onSendSuccess(message: OutboundMessage): OutboundMessage {
        return message.copy(
            status = OutboundMessageStatus.ACKED
        )
    }

    fun onSendFailure(
        message: OutboundMessage,
        maxAttempts: Int = 5,
        baseDelayMs: Long = 1_000L,
        maxDelayMs: Long = 5 * 60_000L
    ): FailureResult {
        val attempts = message.retryCount + 1
        val failedOut = message.copy(
            retryCount = attempts,
            status = if (attempts >= maxAttempts) {
                OutboundMessageStatus.FAILED
            } else {
                OutboundMessageStatus.QUEUED
            }
        )
        val delayMs = nextDelayMillis(attempts - 1, baseDelayMs, maxDelayMs)
        return FailureResult(failedOut, delayMs)
    }

    fun nextDelayMillis(
        attempt: Int,
        baseMillis: Long = 1_000L,
        maxMillis: Long = 5 * 60_000L
    ): Long =
        RetryBackoff.calculateDelayMillis(
            attempt = attempt,
            baseMillis = baseMillis,
            maxMillis = maxMillis,
            jitterFraction = 0.25
        )

    data class FailureResult(
        val message: OutboundMessage,
        val delayMs: Long
    )
}
