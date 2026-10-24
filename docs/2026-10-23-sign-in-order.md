# Email-first sign-in layout

The login form now presents: email, password, Remember email / Forgot, green Sign in to RAVEN button, an `or` separator, Google, then Apple. The conditional resend-confirmation action remains beside the email sign-in flow. The green button has a 44px minimum tap height.

This is a DOM-order change, not CSS-only reordering, so keyboard navigation matches the visual order. Provider buttons remain `type=button`; Enter in the password field submits the existing email/password handler. Signup/reset forms and all script blocks are unchanged from the preceding release.

User approved deployment and the existing iOS build workflow after tests.

Validation:

- Extended `output/test-app-home-trips.cjs`: full-page mocked startup and auth; login order at 320/390/430/768px, short viewport, scrollability, 44px targets, keyboard sequence, email Enter submission, original Google/Apple handler dispatch with empty password fields, no navigation after failed sign-in, and existing Home/pinned-trip/onboarding guards. Passed with brand fonts.
- Root `growth/test-apple-onboarding-ui.cjs`: recreated Apple identity and direct dashboard entry require onboarding; no dashboard flash. Passed with synthetic data.
- Compared all app script blocks and non-login forms with the prior Git revision: unchanged.
- Visually inspected the mobile login screenshot; whitespace/diff checks passed.

No database migration, authentication logic changes, production sign-ins, account changes, publishing or purchases. Installed native apps bundle this page and need the new iOS build to receive it; website delivery alone does not update an older bundle.
