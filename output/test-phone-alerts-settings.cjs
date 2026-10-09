const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const dashboard = fs.readFileSync('Dashboard.html', 'utf8');
const start = dashboard.indexOf('async function handlePushNotifToggle(value) {');
const end = dashboard.indexOf('// ─── PWA INSTALL', start);
assert.ok(start > 0 && end > start);
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<body><div id="settings"></div></body>' }));
    await page.goto('https://raven-test.invalid');
    await page.addScriptTag({ content: `
      var currentUser = { id: 'one' }, BACKEND = 'https://test.invalid', listeners = {}, requests = [];
      var permission = 'prompt', ready = false, serverFailure = false, registrations = 0, privacy = {}, notices = [];
      var db = { auth: {
        getSession: async () => ({ data: { session: { access_token: 'fixture-token' } } }),
        onAuthStateChange: fn => { window.authChanged = fn; }
      } };
      var Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { PushNotifications: {
        addListener: (name, fn) => { listeners[name] = fn; return Promise.resolve({ remove() {} }); },
        checkPermissions: async () => ({ receive: permission }),
        requestPermissions: async () => { permission = 'granted'; return { receive: permission }; },
        register: async () => { registrations++; setTimeout(() => listeners.registration({ value: 'a'.repeat(64) }), 20); },
        unregister: async () => { window.unregistered = true; }, removeAllDeliveredNotifications: async () => {}
      } } };
      window.fetch = async (path, options) => {
        requests.push({ path, options });
        const failed = serverFailure && options.method === 'POST';
        return { ok: !failed, json: async () => failed
          ? { success: false, error: 'Phone notifications need a one-time database update.' }
          : { success: true, enabled: ready, platforms: { ios: ready, android: false } } };
      };
      function showPage(name) { window.destination = name; }
      function setPrivacyToggle(name, value) { privacy[name] = value; }
      async function savePrivacySetting(name, value) { privacy[name] = value; }
      function showToast(text, type) { notices.push({ text, type }); }
      ${dashboard.slice(start, end)}
    ` });
    await page.addScriptTag({ content: fs.readFileSync('raven-phone-alerts.js', 'utf8') });
    assert.equal(await page.evaluate(() => RavenPhoneAlerts.isAvailable()), true);
    await page.evaluate(() => handlePushNotifToggle(true));
    assert.equal(await page.evaluate(() => privacy.push_notif), false);
    assert.match(await page.evaluate(() => notices.at(-1).text), /awaiting activation/);
    await page.evaluate(() => { ready = true; permission = 'denied'; });
    await page.evaluate(() => handlePushNotifToggle(true));
    assert.match(await page.evaluate(() => notices.at(-1).text), /iPhone Settings/);
    assert.equal(await page.evaluate(() => registrations), 0);
    await page.evaluate(() => { permission = 'prompt'; serverFailure = true; });
    await page.evaluate(() => handlePushNotifToggle(true));
    assert.equal(await page.evaluate(() => privacy.push_notif), false);
    assert.equal(await page.evaluate(() => RavenPhoneAlerts.isEnabled()), false);
    assert.match(await page.evaluate(() => notices.at(-1).text), /database update/);
    assert.equal(await page.evaluate(() => localStorage.getItem('raven_phone_alerts_ios_one')), null);
    await page.evaluate(() => { serverFailure = false; });
    await page.evaluate(() => handlePushNotifToggle(true));
    assert.equal(await page.evaluate(() => privacy.push_notif), true);
    assert.equal(await page.evaluate(() => RavenPhoneAlerts.isEnabled()), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('raven_phone_alerts_ios_one')), '1');
    assert.equal(await page.evaluate(() => requests.filter(r => r.options.method === 'POST').length), 2);
    await page.evaluate(() => listeners.pushNotificationActionPerformed({ notification: { data: { recipient_id: 'other', kind: 'bill' } } }));
    assert.equal(await page.evaluate(() => window.destination), undefined);
    await page.evaluate(() => listeners.pushNotificationActionPerformed({ notification: { data: { recipient_id: 'one', kind: 'trip_comment' } } }));
    assert.equal(await page.evaluate(() => window.destination), 'trip-hub');
    await page.evaluate(() => handlePushNotifToggle(false));
    assert.equal(await page.evaluate(() => privacy.push_notif), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('raven_phone_alerts_ios_one')), null);
    assert.equal(await page.evaluate(() => unregistered), true);
    assert.equal(await page.evaluate(() => requests.at(-1).options.method), 'DELETE');
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => { window.ravenDashboardReady=true; });
    await page.evaluate(() => RavenPhoneAlerts.maybePromptSignup());
    assert.equal(await page.locator('#raven-signup-push').count(),0); // Returning accounts not prompted.
    await page.evaluate(() => { currentUser={id:'new-one'};localStorage.setItem('raven_push_signup_pending_new-one','1');permission='prompt'; });
    await page.evaluate(() => RavenPhoneAlerts.maybePromptSignup());
    assert.equal(await page.locator('#raven-signup-push').isVisible(),true);
    assert.equal(await page.evaluate(() => permission),'prompt'); // No OS prompt before Allow.
    await page.screenshot({path:'output/push-signup-preview.png'});
    await page.getByRole('button',{name:'Not now',exact:true}).click();
    await page.evaluate(() => RavenPhoneAlerts.maybePromptSignup());
    assert.equal(await page.locator('#raven-signup-push').count(),0);
    await page.evaluate(() => { currentUser={id:'new-two'};localStorage.setItem('raven_push_signup_pending_new-two','1');serverFailure=true; });
    await page.evaluate(() => RavenPhoneAlerts.maybePromptSignup());
    await page.getByRole('button',{name:'Allow',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('raven-signup-push-error').textContent.includes('database update'));
    assert.equal(await page.evaluate(() => localStorage.getItem('raven_push_signup_seen_new-two')),null);
    await page.evaluate(() => {serverFailure=false;});
    await page.getByRole('button',{name:'Allow',exact:true}).click();
    await page.waitForFunction(() => !document.getElementById('raven-signup-push'));
    assert.equal(await page.evaluate(() => RavenPhoneAlerts.isEnabled()),true);
    assert.equal(await page.evaluate(() => privacy.push_notif),true);
    assert.equal(await page.evaluate(() => localStorage.getItem('raven_push_signup_seen_new-two')),'1');
    await page.evaluate(() => {permission='denied';document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(() => !RavenPhoneAlerts.isEnabled());
    assert.equal(await page.evaluate(() => requests.at(-1).options.method),'DELETE');
    assert.deepEqual(errors, []);
    console.log('PASS: Settings without Inbox; native registration/retry, signup Allow/Not now, no permission before consent, returning accounts not prompted, OS revocation cleanup, saved opt-in/out and safe navigation. Mocked native/Apple delivery only.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
