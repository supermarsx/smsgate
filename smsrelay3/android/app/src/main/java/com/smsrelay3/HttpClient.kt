package com.smsrelay3

import okhttp3.OkHttpClient

object HttpClient {
    val instance: OkHttpClient = OkHttpClient()
}
