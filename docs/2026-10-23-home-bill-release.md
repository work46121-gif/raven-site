# Scan / Trips home and guest payment preview

## Scope

- Two animated home sections: Scan Receipt and RAVEN Trips. Trips opens the existing authenticated Trip Hub list; no trip or album data is prefetched by this screen.
- The new Trips action verifies the current SDK session, handles session expiry/timeouts, and preserves onboarding and signed-out behavior.
- Compact participant name/badge layout; assignment/removal remains under Manage. Secondary bill actions are under More bill options.
- A visible guest Payment options row names Venmo, Cash App, and Apple Pay. Details use the existing creator-only, bill-scoped storage and carry into the bill's payer options when that guest is the payer.
- No new migration, financial mutation, paid membership, entitlement, upload-limit change, or purchase.

## Verification

Synthetic fixtures only; no production accounts or bill data modified.

- `node output/test-app-home-trips.cjs`: real page scripts, responsive layouts, iPhone safe-area spacing, touch/keyboard routing, scan/dashboard/settings preservation, signed-out/stale/expired/mismatched session denial, retry, sign-out race, onboarding and reduced motion.
- `node output/test-bill-preview-ui.cjs`: production preview layout at 320/390/768 px, compact badge and separate profile action, visible guest payer editor, Manage/More bill options, save/reopen/clear/retry, changed-session rejection and unchanged balances.
- Backend regressions: `test-guest-profile-ui.cjs`, `test-guest-payments.cjs`, `test-plus-badge.cjs`. Cover bill creation, database protections, and saved guest payer details in classic/live bill pages.

Tests use Playwright from the existing local runtime and Edge; public brand fonts are optional with `RAVEN_TEST_BRAND_FONTS=1`.

## Delivery

Website deployment and iOS publication are separate. Capacitor bundles app.html as index.html along with dashboard.html and its helpers; an installed older app does not gain new bundled screens just by reopening after a website deployment. The existing main-branch workflow builds and publishes to TestFlight. Confirm its status for the exact release commit before claiming delivery.

Newsletter sending remains disabled; RAVEN Plus stays private and does not grant memberships. These unrelated release switches are not changed here.
