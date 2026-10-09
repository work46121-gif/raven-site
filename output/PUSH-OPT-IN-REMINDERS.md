# Account notification opt-in reminders

- The signed-in native home screen and dashboard both load the existing phone-alert bridge. Home renders first; notification checks never block startup or navigation.
- All signed-in accounts with notifications off are eligible, including accounts that previously dismissed the one-time signup prompt. Signed-out users and incomplete/cached-only identities are excluded.
- A visible prompt is snoozed for three days, and Not now/Escape renew that three-day deadline. Closing the app while it is visible also preserves the deadline. A reminder appears only on a subsequent open/resume or ready-screen entry, not on an interrupting timer.
- Reminder timestamps are stored per account on the device and shared by the home screen and dashboard. They persist over normal app restarts/updates; reinstalling or clearing app storage resets them.
- Actual enabled native opt-ins plus granted OS permission suppress the prompt, including when the backend is temporarily offline. Existing opt-ins restore quietly and never invoke the OS permission prompt automatically.
- Allow is optional and is the only prompt action that requests OS permission and registers the device. If the OS has already denied permission, the existing error directs users to phone Settings. Not now does not register or subscribe anyone.
- Prompt checks are serialized per account and revalidate identity/readiness after asynchronous operations. Unsupported browser/PWA shells and inactive native providers are not prompted by this feature.
- This is bundled native UI: users need this app build installed. Publishing to TestFlight alone does not update public App Store installations. Existing push delivery is unchanged.

Tests: `output/test-push-reminder-prompt.cjs` loads both a synthetic bridge fixture and the real `app.html` with mocked native/auth/provider services. It covers all-account eligibility, three-day boundaries/repeated snoozing, account separation, reload persistence, enabled suppression, consent, races, real home launch and sign-out. `output/test-phone-alerts-settings.cjs` and `output/test-phone-alerts.cjs` verify the existing registration/settings/server flow. No production test notifications are sent by these tests.
