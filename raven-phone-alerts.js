(() => {
 'use strict';

 // This bridge is shared by the Inbox control and the Settings toggle. Keep the
 // native setup independent of the Inbox because Settings can be opened first.
 const cap = window.Capacitor;
 const plugin = cap?.Plugins?.PushNotifications;
 const platform = cap?.getPlatform?.();
 const native = Boolean(cap?.isNativePlatform?.() && (platform === 'ios' || platform === 'android') && plugin);
 let deviceToken = null;
 let registeredOwner = null;
 let registeringOwner = null;
 let pendingRegistration = null;
 const enabledKey = id => 'raven_phone_alerts_' + platform + '_' + id;

 const inbox = document.getElementById('raven-inbox');
 const inboxTabs = inbox?.querySelector('.raven-inbox-tabs');
 let button = null;
 let note = null;
 if (inboxTabs) {
  const box = document.createElement('div');
  box.style.cssText = 'padding:10px 20px;border-bottom:1px solid #ffffff12;font-size:12px;color:#aaa1ba';
  button = document.createElement('button');
  button.type = 'button';
  button.style.cssText = 'padding:8px 12px;border-radius:10px;border:1px solid #a855f744;background:#7c3aed24;color:#dcc0ff';
  note = document.createElement('span');
  note.style.marginLeft = '10px';
  box.append(button, note);
  inboxTabs.after(box);
 }

 function setNote(message) {
  if (note) note.textContent = message || '';
 }

 function label() {
  if (button) button.textContent = registeredOwner === currentUser?.id && registeredOwner ? 'Turn off phone alerts' : 'Enable phone alerts';
  if (native && typeof setPrivacyToggle === 'function') setPrivacyToggle('push_notif', registeredOwner === currentUser?.id && Boolean(deviceToken));
 }

 function nativeLabel() {
  return platform === 'android' ? 'Android Settings' : 'iPhone Settings';
 }

 async function api(path, method = 'GET', body) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) throw Error('Sign in to enable alerts.');
  const response = await fetch(BACKEND + path, {
   method,
   headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
   ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Please retry later.');
  return data;
 }

 function finishRegistration(owner, error) {
  const pending = pendingRegistration;
  if (!pending || pending.owner !== owner) return;
  pendingRegistration = null;
  clearTimeout(pending.timeout);
  if (error) pending.reject(error);
  else pending.resolve();
 }

 function waitForRegistration(owner) {
  if (pendingRegistration?.owner === owner) return pendingRegistration.promise;
  if (pendingRegistration) finishRegistration(pendingRegistration.owner, Error('Phone alert setup was interrupted. Please try again.'));
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  const timeout = setTimeout(() => finishRegistration(owner, Error('Phone alert setup timed out. Please try again.')), 20000);
  pendingRegistration = { owner, promise, resolve, reject, timeout };
  return promise;
 }

 async function register() {
  if (!native) throw Error('Phone alerts are available in the RAVEN iPhone and Android apps.');
  const owner = currentUser?.id;
  if (!owner) throw Error('Sign in to enable alerts.');
  if (pendingRegistration?.owner === owner) return pendingRegistration.promise;
  const status = await api('/push/status');
  if (!status.platforms?.[platform]) throw Error('Phone alerts are awaiting activation.');
  let permission = await plugin.checkPermissions();
  if (permission.receive === 'prompt') permission = await plugin.requestPermissions();
  if (permission.receive !== 'granted') {
   await turnOff();
   throw Error('Allow notifications in ' + nativeLabel() + ' to receive alerts.');
  }
  if (registeredOwner === owner && deviceToken) return;
  if (currentUser?.id !== owner) throw Error('Your account changed. Please try again.');
  const completion = waitForRegistration(owner);
  registeringOwner = owner;
  try {
   await plugin.register();
  } catch (error) {
   finishRegistration(owner, error);
   throw error;
  }
  return completion;
 }

 async function turnOff() {
  if (!native) return;
  const owner = registeredOwner || currentUser?.id;
  if (deviceToken && owner === currentUser?.id) await api('/push/device', 'DELETE', { token: deviceToken });
  if (owner) localStorage.removeItem(enabledKey(owner));
  registeredOwner = null;
  registeringOwner = null;
  deviceToken = null;
  await plugin.unregister().catch(() => {});
  await plugin.removeAllDeliveredNotifications().catch(() => {});
  setNote('Phone alerts off');
  label();
 }

 async function setEnabled(enabled) {
  if (enabled) {
   setNote('Setting up…');
   await register();
   return;
  }
  await turnOff();
 }

 // The Settings screen calls this instead of trying browser Notification APIs.
 window.RavenPhoneAlerts = {
  isAvailable: () => native,
  isEnabled: () => native && registeredOwner === currentUser?.id && Boolean(deviceToken),
  setEnabled,
  maybePromptSignup
 };

 let signupDialog = null;
 let signupDialogOwner = null;
 async function maybePromptSignup() {
  const owner = currentUser?.id;
  if (!native || !owner || !window.ravenDashboardReady || signupDialog) return;
  const pendingKey = 'raven_push_signup_pending_' + owner;
  const seenKey = 'raven_push_signup_seen_' + owner;
  if (localStorage.getItem(pendingKey) !== '1') return;
  if (localStorage.getItem(seenKey) === '1' || localStorage.getItem(enabledKey(owner)) === '1') {
   localStorage.removeItem(pendingKey); return;
  }
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  signupDialog = dialog;
  signupDialogOwner = owner;
  dialog.id = 'raven-signup-push';
  dialog.setAttribute('aria-labelledby', 'raven-signup-push-title');
  dialog.style.cssText = 'width:min(360px,calc(100vw - 48px));box-sizing:border-box;padding:26px;border:1px solid #7542a5;border-radius:22px;background:#121019;color:#f4f0fb;box-shadow:0 18px 80px #000b;font-family:inherit';
  dialog.innerHTML = '<h2 id="raven-signup-push-title" style="margin:0 0 12px;font-size:23px">Stay in the loop</h2>' +
   '<p style="color:#b8b1c7;line-height:1.6;font-size:14px">Allow RAVEN to notify you about messages, trip comments and unpaid trip bills? Reminders start 3 days after a trip’s bill due date and repeat every 3 days while you still owe. Names and trip names may appear on your lock screen.</p>' +
   '<p style="color:#b8b1c7;font-size:12px">Optional. Change this anytime in Settings.</p>' +
   '<p id="raven-signup-push-error" role="status" style="font-size:13px;color:#ffb04a"></p>' +
   '<div style="display:flex;gap:10px;margin-top:20px"><button type="button" id="raven-signup-push-later" style="flex:1;padding:13px;border:1px solid #473551;border-radius:12px;background:transparent;color:#e9ddfa;font:inherit">Not now</button><button type="button" id="raven-signup-push-allow" style="flex:1;padding:13px;border:0;border-radius:12px;background:#28ce58;color:#061109;font:inherit;font-weight:800">Allow</button></div>';
  document.body.appendChild(dialog);
  const finish = () => {
   localStorage.setItem(seenKey, '1');
   localStorage.removeItem(pendingKey);
   dialog.close(); dialog.remove(); signupDialog = null; signupDialogOwner = null;
   previousFocus?.focus?.();
  };
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  dialog.querySelector('#raven-signup-push-later').onclick = finish;
  const allow = dialog.querySelector('#raven-signup-push-allow');
  allow.onclick = async () => {
   if (owner !== currentUser?.id) { finish(); return; }
   allow.disabled = true;
   allow.textContent = 'Enabling…';
   try {
    // Only this explicit tap can start the operating system permission prompt.
    await setEnabled(true);
    if (owner !== currentUser?.id) { finish(); return; }
    if (typeof savePrivacySetting === 'function') await savePrivacySetting('push_notif', true);
    finish();
   } catch (error) {
    dialog.querySelector('#raven-signup-push-error').textContent = error.message || 'Could not enable notifications. You can retry or choose Not now.';
   } finally { allow.disabled = false; allow.textContent = 'Allow'; }
  };
  dialog.showModal();
 }

 function navigateFromAlert(data) {
  if (!currentUser?.id || data?.recipient_id !== currentUser.id) return;
  const kind = data.kind;
  if (kind === 'bill') {
   showPage('active-bills');
  } else if (kind === 'trip' || String(kind || '').startsWith('trip_')) {
   showPage('trip-hub');
  } else if (kind === 'friend_request') {
   showPage('friends');
  } else {
   showPage('overview');
   document.getElementById('raven-inbox-open')?.click();
  }
 }

 if (native) {
  plugin.addListener('registration', async token => {
   const owner = registeringOwner;
   if (!owner || owner !== currentUser?.id) return;
   try {
    deviceToken = token.value;
    await api('/push/device', 'POST', { token: deviceToken, platform });
    if (owner !== currentUser?.id) throw Error('Your account changed. Please try again.');
    registeredOwner = owner;
    localStorage.setItem(enabledKey(owner), '1');
    setNote('Trip activity, messages and friend requests');
    label();
    finishRegistration(owner);
   } catch (error) {
    setNote(error.message || 'Could not set up phone alerts.');
    finishRegistration(owner, error);
   }
  });
  plugin.addListener('registrationError', error => {
   const owner = registeringOwner;
   const problem = Error(error?.error || error?.message || 'Could not register. Update RAVEN and try again.');
   registeredOwner = null;
   setNote(problem.message);
   label();
   if (owner) finishRegistration(owner, problem);
  });
  plugin.addListener('pushNotificationActionPerformed', event => navigateFromAlert(event.notification?.data));
  db.auth.onAuthStateChange((_event, session) => {
   setTimeout(async () => {
    if (signupDialog && session?.user?.id !== signupDialogOwner) { signupDialog.close(); signupDialog.remove(); signupDialog = null; signupDialogOwner = null; }
    if (registeredOwner !== session?.user?.id) {
     registeredOwner = null;
     registeringOwner = null;
     deviceToken = null;
     label();
     await plugin.removeAllDeliveredNotifications().catch(() => {});
    }
    if (session?.user?.id && localStorage.getItem(enabledKey(session.user.id)) === '1') {
     try { await setEnabled(true); } catch (error) { setNote(error.message); }
    }
   }, 0);
  });
  document.addEventListener('visibilitychange', async () => {
   if (document.hidden || !registeredOwner) return;
   try {
    if ((await plugin.checkPermissions()).receive !== 'granted') await turnOff();
   } catch (_) { /* A transient bridge error is not permission revocation. */ }
  });
  // If the dashboard became visible before this deferred script loaded.
  if (window.ravenDashboardReady) void maybePromptSignup();
 }

 if (button) {
  label();
  button.onclick = async () => {
   button.disabled = true;
   try {
    if (!native) {
     setNote('Available in the RAVEN iPhone and Android apps; browser alerts are not enabled.');
    } else {
     await setEnabled(!(registeredOwner === currentUser?.id && deviceToken));
    }
   } catch (error) {
    setNote(error.message || 'Could not update phone alerts.');
   } finally {
    button.disabled = false;
   }
  };
 }
})();
