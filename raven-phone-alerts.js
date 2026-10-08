(() => {
 'use strict';
 const inbox = document.getElementById('raven-inbox');
 if (!inbox) return;
 const inboxTabs = inbox.querySelector('.raven-inbox-tabs');
 if (!inboxTabs) return;

 const box = document.createElement('div');
 box.style.cssText = 'padding:10px 20px;border-bottom:1px solid #ffffff12;font-size:12px;color:#aaa1ba';
 const button = document.createElement('button');
 button.type = 'button';
 button.textContent = 'Enable phone alerts';
 button.style.cssText = 'padding:8px 12px;border-radius:10px;border:1px solid #a855f744;background:#7c3aed24;color:#dcc0ff';
 const note = document.createElement('span');
 note.style.marginLeft = '10px';
 box.append(button, note);
 inboxTabs.after(box);

 const cap = window.Capacitor;
 const plugin = cap?.Plugins?.PushNotifications;
 const platform = cap?.getPlatform?.();
 const native = cap?.isNativePlatform?.() && (platform === 'ios' || platform === 'android') && plugin;
 let deviceToken = null;
 let registeredOwner = null;
 let registeringOwner = null;
 const enabledKey = id => 'raven_phone_alerts_' + platform + '_' + id;

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

 function label() {
  button.textContent = registeredOwner === currentUser?.id && registeredOwner ? 'Turn off phone alerts' : 'Enable phone alerts';
 }

 function nativeLabel() {
  return platform === 'android' ? 'Android Settings' : 'iPhone Settings';
 }

 async function register() {
  if (!native || !currentUser?.id) return;
  const owner = currentUser.id;
  const status = await api('/push/status');
  if (!status.platforms?.[platform]) throw Error('Phone alerts are awaiting activation.');
  let permission = await plugin.checkPermissions();
  if (permission.receive === 'prompt') permission = await plugin.requestPermissions();
  if (permission.receive !== 'granted') throw Error('Allow notifications in ' + nativeLabel() + ' to receive alerts.');
  if (currentUser?.id !== owner) return;
  registeringOwner = owner;
  await plugin.register();
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
    if (owner !== currentUser?.id) return;
    registeredOwner = owner;
    localStorage.setItem(enabledKey(owner), '1');
    note.textContent = 'Trip activity, messages and friend requests';
    label();
   } catch (error) {
    note.textContent = error.message;
   }
  });
  plugin.addListener('registrationError', () => {
   note.textContent = 'Could not register. Update RAVEN and try again.';
   registeredOwner = null;
   label();
  });
  plugin.addListener('pushNotificationActionPerformed', event => navigateFromAlert(event.notification?.data));
  db.auth.onAuthStateChange((_event, session) => {
   setTimeout(async () => {
    if (registeredOwner !== session?.user?.id) {
     registeredOwner = null;
     registeringOwner = null;
     label();
     await plugin.removeAllDeliveredNotifications().catch(() => {});
    }
    if (session?.user?.id && localStorage.getItem(enabledKey(session.user.id)) === '1') {
     try { await register(); } catch (error) { note.textContent = error.message; }
    }
   }, 0);
  });
 }

 button.onclick = async () => {
  if (!native) {
   note.textContent = 'Available in the RAVEN iPhone and Android apps; browser alerts are not enabled.';
   return;
  }
  button.disabled = true;
  try {
   if (registeredOwner === currentUser?.id && deviceToken) {
    await api('/push/device', 'DELETE', { token: deviceToken });
    localStorage.removeItem(enabledKey(registeredOwner));
    registeredOwner = null;
    registeringOwner = null;
    await plugin.unregister();
    await plugin.removeAllDeliveredNotifications();
    note.textContent = 'Phone alerts off';
    label();
   } else {
    note.textContent = 'Setting up…';
    await register();
   }
  } catch (error) {
   note.textContent = error.message;
  } finally {
   button.disabled = false;
  }
 };
})();
