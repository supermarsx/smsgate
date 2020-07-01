package com.smsrelay2;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.os.Build;
import android.provider.Telephony;
import android.util.Log;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class SmsListenerModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
    private BroadcastReceiver mReceiver;
    private boolean isReceiverRegistered = false;
    private static ReactApplicationContext reactContext;

    public SmsListenerModule(ReactApplicationContext context) {
        super(context);

        reactContext = context;

        //mReceiver = new SmsReceiver(context);
        getReactApplicationContext().addLifecycleEventListener(this);
        //registerReceiverIfNecessary(mReceiver);
    }
    public static void sendEvent(String event, WritableNativeMap params) {
        if (reactContext == null) {
            return;
        }

        if (!reactContext.hasActiveCatalystInstance()) {
            return;
        }

        Log.d(
                SmsListenerPackage.TAG,
                String.format("%s: %s", params.getString("originatingAddress"), params.getString("body"))
        );
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(event, params);
    }
    private void registerReceiverIfNecessary(BroadcastReceiver receiver) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT && getCurrentActivity() != null) {
            getCurrentActivity().registerReceiver(
                    receiver,
                    new IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
            );
            isReceiverRegistered = true;
            return;
        }

        if (getCurrentActivity() != null) {
            getCurrentActivity().registerReceiver(
                    receiver,
                    new IntentFilter("android.provider.Telephony.SMS_RECEIVED")
            );
            isReceiverRegistered = true;
        }
    }

    private void unregisterReceiver(BroadcastReceiver receiver) {
        if (isReceiverRegistered && getCurrentActivity() != null) {
            getCurrentActivity().unregisterReceiver(receiver);
            isReceiverRegistered = false;
        }
    }

    @Override
    public void onHostResume() {
        //registerReceiverIfNecessary(mReceiver);
    }

    @Override
    public void onHostPause() {
        //unregisterReceiver(mReceiver);
    }

    @Override
    public void onHostDestroy() {
        //unregisterReceiver(mReceiver);
    }

    @Override
    public String getName() {
        return "SmsListenerPackage";
    }
}
