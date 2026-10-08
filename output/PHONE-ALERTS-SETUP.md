# Activate RAVEN phone notifications

The product code is ready, but delivery remains off until this checklist is completed. Existing in-app notifications continue to work. This setup enables alerts in the native iPhone and Android apps—not in a browser.

## What people can receive

- A new Trip Hub receipt
- A Trip Hub comment
- A receipt assignment or a newly added share of an existing receipt
- A Trip Hub message, direct message, or group-chat message
- A friend request
- Existing bill assignments and Trip Hub invites

Recipients must be linked members of the trip. The sender is excluded whenever RAVEN has their signed-in account ID. The phone banner uses generic text only: it does not put a dollar amount, receipt image, or message body on the lock screen.

## 1. Install the database rules

Run [`raven-phone-alerts-migration.sql`](raven-phone-alerts-migration.sql) in the Raven Supabase SQL Editor. It is safe to rerun. It never sends alerts for old activity; it only queues activity after the migration completes.

## 2. Enable iPhone delivery

1. In Apple Developer, enable **Push Notifications** for App ID `com.ravensplit.app`.
2. Regenerate the App Store provisioning profile and refresh it in Codemagic.
3. Create an Apple Push Notifications service (APNs) signing key. This is separate from the App Store Connect upload key. Keep the downloaded `.p8` file private.
4. Add these private Railway backend variables:

   - `APNS_KEY_ID`
   - `APNS_TEAM_ID`
   - `APNS_PRIVATE_KEY` — the complete `.p8` contents, including BEGIN/END lines
   - `APNS_ENVIRONMENT=production` for TestFlight/App Store builds

5. In Codemagic's `raven-ios` variable group, set `ENABLE_PUSH_NOTIFICATIONS=1`, then build a new TestFlight version.

## 3. Enable Android delivery

1. In Firebase Console, create or select the RAVEN Firebase project and add an Android app with package name `com.ravensplit.app`.
2. Download its `google-services.json`. Do not commit it. Base64-encode its contents and save the result as the secure Codemagic variable `FIREBASE_GOOGLE_SERVICES_JSON_B64`. The Android build workflow writes it into the build only.
3. Create a Firebase service-account key for the same project. Add its complete JSON contents to Railway as `FIREBASE_SERVICE_ACCOUNT_JSON` (or use base64 in `FIREBASE_SERVICE_ACCOUNT_JSON_B64`). Do not put either value in this repository or chat.
4. Build and install a new Android `.aab` / Play test build after the Codemagic variable is in place.

## 4. Turn delivery on and test

1. After at least one platform above is configured, set Railway variable `RAVEN_PUSH_ENABLED=1`.
2. In the updated native app, open **Overview → Inbox → Enable phone alerts** and accept the system permission.
3. Test with two distinct accounts:

   - Add a Trip Hub receipt, then add someone to a receipt share.
   - Post a Trip Hub comment and message.
   - Send a group/direct message and a friend request.
   - Confirm the recipient receives one alert, the sender does not, and tapping it opens the relevant RAVEN area.
   - Test sign-out, account switching, and opting out.

Temporary delivery failures retry. Alerts expire after 24 hours, and stale device tokens are removed. Delivery still depends on permission, network, device settings, and Focus/Do Not Disturb.

Sources: [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications), [Firebase Cloud Messaging HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [Apple APNs token authentication](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns).
