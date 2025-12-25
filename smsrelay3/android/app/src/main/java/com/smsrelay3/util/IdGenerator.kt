package com.smsrelay3.util

import java.util.UUID

object IdGenerator {
    fun uuid(): String = UUID.randomUUID().toString()
}
