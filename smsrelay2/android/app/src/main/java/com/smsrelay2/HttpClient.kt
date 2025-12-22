package com.smsrelay2

import okhttp3.OkHttpClient

object HttpClient {
    val instance: OkHttpClient = OkHttpClient()
}
