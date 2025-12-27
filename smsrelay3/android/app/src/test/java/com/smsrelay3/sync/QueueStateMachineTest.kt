package com.smsrelay3.sync

import com.smsrelay3.data.OutboundMessageStatus
import com.smsrelay3.data.entity.OutboundMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QueueStateMachineTest {
    private fun stubMessage() = OutboundMessage(
        id = "1",
        deviceId = "dev",
        seq = 1,
        createdAtMs = 0,
        smsReceivedAtMs = 0,
        sender = "123",
        content = "hello",
        contentHash = "abc",
        simSlotIndex = 0,
        subscriptionId = 1,
        iccid = "iccid",
        msisdn = "msisdn",
        status = OutboundMessageStatus.QUEUED,
        retryCount = 0,
        lastAttemptAtMs = null,
        source = "test"
    )

    @Test
    fun `send start moves to sending and stamps time`() {
        val now = 1000L
        val updated = QueueStateMachine.onSendStart(stubMessage(), now)
        assertEquals(OutboundMessageStatus.SENDING, updated.status)
        assertEquals(now, updated.lastAttemptAtMs)
    }

    @Test
    fun `success moves to acked`() {
        val msg = stubMessage().copy(status = OutboundMessageStatus.SENDING)
        val updated = QueueStateMachine.onSendSuccess(msg)
        assertEquals(OutboundMessageStatus.ACKED, updated.status)
    }

    @Test
    fun `failure increments retries and eventually fails`() {
        var msg = stubMessage()
        repeat(4) {
            val result = QueueStateMachine.onSendFailure(msg)
            msg = result.message
            assertEquals(OutboundMessageStatus.QUEUED, msg.status)
            assertTrue(result.delayMs in 500..300_000)
        }
        val finalResult = QueueStateMachine.onSendFailure(msg)
        assertEquals(5, finalResult.message.retryCount)
        assertEquals(OutboundMessageStatus.FAILED, finalResult.message.status)
    }
}
