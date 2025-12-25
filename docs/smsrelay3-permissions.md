# smsrelay3 permissions

Required:
- RECEIVE_SMS
- READ_SMS
- INTERNET
- ACCESS_NETWORK_STATE

Conditional:
- FOREGROUND_SERVICE + FOREGROUND_SERVICE_DATA_SYNC (foreground realtime mode)
- READ_PHONE_STATE (SIM slot/ICCID/MSISDN)
- READ_CONTACTS (contacts sync)
- CAMERA (QR pairing)
- POST_NOTIFICATIONS (foreground notification)
- RECEIVE_BOOT_COMPLETED (start on boot)

Notes:
- READ_SMS is required for reconciliation.
- READ_PHONE_STATE is best-effort; SIM inventory still runs without ICCID/MSISDN.
