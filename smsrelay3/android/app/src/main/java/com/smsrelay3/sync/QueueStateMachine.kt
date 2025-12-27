package com.smsrelay3.sync

import com.smsrelay3.data.OutboundMessageStatus
import com.smsrelay3.data.entity.OutboundMessage
import com.smsrelay3.util.RetryBackoff

/**
 * Stateless helpers to evolve outbound messages through the queue lifecycle.
 * This keeps the retry policy centralized and testable.
 */
object QueueStateMachine {
    private const val MAX_ATTEMPTS = 5
    private const val BASE_DELAY_MS = 1_000L
    private const val MAX_DELAY_MS = 5 * 60_000L

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

    fun onSendFailure(message: OutboundMessage): FailureResult {
        val attempts = message.retryCount + 1
        val failedOut = message.copy(
            retryCount = attempts,
            status = if (attempts >= MAX_ATTEMPTS) {
                OutboundMessageStatus.FAILED
            } else {
                OutboundMessageStatus.QUEUED
            }
        )
        val delayMs = nextDelayMillis(attempts - 1)
        return FailureResult(failedOut, delayMs)
    }

    fun nextDelayMillis(attempt: Int): Long =
        RetryBackoff.calculateDelayMillis(
            attempt = attempt,
            baseMillis = BASE_DELAY_MS,
            maxMillis = MAX_DELAY_MS,
            jitterFraction = 0.25
        )

    data class FailureResult(
        val message: OutboundMessage,
        val delayMs: Long
    )
}
