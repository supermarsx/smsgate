package com.smsrelay2;

import android.content.Intent;
import android.os.Bundle;
import androidx.annotation.Nullable;

import com.facebook.react.HeadlessJsTaskService;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;
import com.facebook.react.jstasks.HeadlessJsTaskRetryPolicy;
import com.facebook.react.jstasks.LinearCountingRetryPolicy;

public class SmsEventService<HeadlessJsRetryPolicy> extends HeadlessJsTaskService {
    @Nullable
    protected HeadlessJsTaskConfig getTaskConfig(Intent intent) {
        Bundle extras = intent.getExtras();
        LinearCountingRetryPolicy retryPolicy = new LinearCountingRetryPolicy(
                3, // Max number of retry attempts
                1000 // Delay between each retry attempt
        );
        return new HeadlessJsTaskConfig(
                "RECEIVE_SMS",
                extras != null ? Arguments.fromBundle(extras) : Arguments.createMap(),
                5000,
                true,
                retryPolicy);
    }
}
