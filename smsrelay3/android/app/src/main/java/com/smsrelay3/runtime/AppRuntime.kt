package com.smsrelay3.runtime

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

object AppRuntime {
    private val wsState = AtomicReference("disconnected")
    private val lastSendAt = AtomicLong(0L)
    private val lastAckAt = AtomicLong(0L)
    private val foreground = AtomicBoolean(false)

    fun setWsState(state: String) {
        wsState.set(state)
    }

    fun wsState(): String = wsState.get()

    fun markSend(tsMs: Long) {
        lastSendAt.set(tsMs)
    }

    fun markAck(tsMs: Long) {
        lastAckAt.set(tsMs)
    }

    fun lastSendAtMs(): Long = lastSendAt.get()

    fun lastAckAtMs(): Long = lastAckAt.get()

    fun setForeground(value: Boolean) {
        foreground.set(value)
    }

    fun isForeground(): Boolean = foreground.get()
}
