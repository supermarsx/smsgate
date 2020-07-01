package com.smsrelay2;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.facebook.react.HeadlessJsTaskService;
import com.facebook.react.bridge.WritableNativeMap;

import java.util.Date;

public class SmsReceiver extends BroadcastReceiver {
    private static final String EVENT = "com.smsrelay2:smsReceived";
    private static final String CHANNEL_ID = "SMSRECEIVED";

    private void receiveMessage(SmsMessage message, Context context) {

        /*start headlessjs task*/
        Intent service = new Intent(context, SmsEventService.class);
        Bundle bundle = new Bundle();
        bundle.putString("originatingAddress", message.getOriginatingAddress());
        bundle.putString("body", message.getMessageBody());
        service.putExtras(bundle);
        context.startService(service);
        HeadlessJsTaskService.acquireWakeLockNow(context);

        /*send notification*/
        createNotificationChannel(context);
        Intent notificationIntent = new Intent(context, MainActivity.class);
        int id = (int) ((new Date().getTime() / 1000L) % Integer.MAX_VALUE);
        PendingIntent contentIntent = PendingIntent.getActivity(context, 0, notificationIntent, PendingIntent.FLAG_UPDATE_CURRENT);
        /*Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(message.getOriginatingAddress())
                .setContentText(message.getMessageBody())
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(contentIntent)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setAutoCancel(true)
                .build();

        NotificationManager notificationManager = (NotificationManager)context.getSystemService(context.NOTIFICATION_SERVICE);
        notificationManager.notify(id, notification);
        */

        /*send event*/
        WritableNativeMap receivedMessage = new WritableNativeMap();
        receivedMessage.putString("originatingAddress", message.getOriginatingAddress());
        receivedMessage.putString("body", message.getMessageBody());

        SmsListenerModule.sendEvent(EVENT, receivedMessage);
    }

    private void createNotificationChannel(Context context) {
        // Create the NotificationChannel, but only on API 26+ because
        // the NotificationChannel class is new and not in the support library
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            int importance = NotificationManager.IMPORTANCE_HIGH;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "smsrelay2", importance);
            channel.setDescription("smsrelay2");
            NotificationManager notificationManager = context.getSystemService(NotificationManager.class);
            notificationManager.createNotificationChannel(channel);
        }
    }


    @Override
    public void onReceive(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            for (SmsMessage message : Telephony.Sms.Intents.getMessagesFromIntent(intent)) {
                receiveMessage(message, context);
            }
            return;
        }

        try {
            final Bundle bundle = intent.getExtras();

            if (bundle == null || !bundle.containsKey("pdus")) {
                return;
            }

            final Object[] pdus = (Object[]) bundle.get("pdus");

            for (Object pdu : pdus) {
                receiveMessage(SmsMessage.createFromPdu((byte[]) pdu), context);
            }
        } catch (Exception e) {
            Log.e(SmsListenerPackage.TAG, e.getMessage());
        }
    }
}
