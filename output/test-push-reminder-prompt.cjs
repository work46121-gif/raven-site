const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const bridge=fs.readFileSync('raven-phone-alerts.js','utf8');
const DAY=86400000;
async function setup(browser,options={}) {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<style>body{background:#06060a;color:white;font-family:Arial,sans-serif}dialog::backdrop{background:#000a}</style><h1>RAVEN</h1><button>Open Dashboard</button>'}));
 await page.goto('https://raven-fixture.invalid');
 await page.addScriptTag({content:`
 var currentUser={id:'returning'}, BACKEND='https://fixture.invalid', permission='prompt', provider=true, fail=false;
 var osPrompts=0, registrations=0, requests=[], listeners={}, appListeners={}, privacy={}, testNow=Date.now();
 Date.now=()=>testNow;
 window.ravenPhoneAlertsReady=true;
 var Capacitor={isNativePlatform:()=>${options.native!==false},getPlatform:()=> 'ios',Plugins:{
  App:{addListener:(name,fn)=>{appListeners[name]=fn;return Promise.resolve({remove(){}})}},
  PushNotifications:{addListener:(name,fn)=>{listeners[name]=fn;return Promise.resolve({remove(){}})},
   checkPermissions:async()=>({receive:permission}),requestPermissions:async()=>{osPrompts++;permission='granted';return{receive:permission}},
   register:async()=>{registrations++;setTimeout(()=>listeners.registration({value:'a'.repeat(64)}),5)},
   unregister:async()=>{},removeAllDeliveredNotifications:async()=>{}}
 }};
 var db={auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:currentUser}}}),onAuthStateChange:fn=>{window.authChanged=fn}}};
 window.fetch=async(path,options)=>{requests.push({path,options});if(fail)throw Error('Offline');return{ok:true,json:async()=>({success:true,platforms:{ios:provider}})}};
 function setPrivacyToggle(name,value){privacy[name]=value}
 async function savePrivacySetting(name,value){privacy[name]=value}
 `});
 if(options.enabled)await page.evaluate(()=>{localStorage.setItem('raven_phone_alerts_ios_returning','1');permission='granted'});
 if(options.offline)await page.evaluate(()=>{fail=true});
 if(options.unavailable)await page.evaluate(()=>{provider=false});
 if(options.notReady)await page.evaluate(()=>{window.ravenPhoneAlertsReady=false});
 if(options.seen)await page.evaluate(()=>{localStorage.setItem('raven_push_signup_seen_returning','1')});
 await page.addScriptTag({content:bridge});
 return {page,errors};
}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const {page,errors}=await setup(browser,{seen:true});
  await page.locator('#raven-signup-push').waitFor();
  assert.equal(await page.evaluate(()=>osPrompts),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'output/push-reminder-preview.png'});
  await page.getByRole('button',{name:'Not now',exact:true}).click();
  const after=await page.evaluate(()=>Number(localStorage.getItem('raven_push_prompt_after_returning')));
  assert.equal(after-await page.evaluate(()=>testNow),3*DAY);
  assert.equal(await page.evaluate(()=>registrations),0);
  await page.evaluate(()=>{appListeners.resume();document.dispatchEvent(new Event('visibilitychange'))});
  await page.evaluate(()=>RavenPhoneAlerts.maybePrompt());
  assert.equal(await page.locator('dialog').count(),0);
  await page.evaluate(day=>{testNow+=3*day-1},DAY);
  await page.evaluate(()=>RavenPhoneAlerts.maybePrompt());
  assert.equal(await page.locator('dialog').count(),0);
  await page.evaluate(()=>{testNow++;appListeners.resume()});
  await page.locator('#raven-signup-push').waitFor();
  await page.keyboard.press('Escape');
  await page.evaluate(()=>RavenPhoneAlerts.maybePrompt());
  assert.equal(await page.locator('dialog').count(),0);
  // Repeated dismissals get the same three-day cadence, never every launch.
  await page.evaluate(day=>{testNow+=3*day},DAY);
  await page.evaluate(()=>Promise.all([RavenPhoneAlerts.maybePrompt(),RavenPhoneAlerts.maybePrompt()]));
  assert.equal(await page.locator('dialog').count(),1);
  await page.getByRole('button',{name:'Not now',exact:true}).click();
  // Different accounts have independent schedules; old signup-seen flags do not exclude them.
  await page.evaluate(()=>{currentUser={id:'second'};permission='prompt'});
  await page.evaluate(()=>RavenPhoneAlerts.maybePrompt());
  await page.locator('#raven-signup-push').waitFor();
  await page.getByRole('button',{name:'Allow',exact:true}).click();
  await page.locator('#raven-signup-push').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>RavenPhoneAlerts.isEnabled()),true);
  assert.equal(await page.evaluate(()=>osPrompts),1);
  await page.evaluate(day=>{testNow+=30*day},DAY);
  await page.evaluate(()=>RavenPhoneAlerts.maybePrompt());
  assert.equal(await page.locator('dialog').count(),0);
  // A changed account during an asynchronous preflight cannot receive the old account's prompt.
  await page.evaluate(()=>{
   currentUser={id:'third'};permission='prompt';
   Capacitor.Plugins.PushNotifications.checkPermissions=()=>new Promise(resolve=>{window.releasePermission=resolve});
   void RavenPhoneAlerts.maybePrompt();currentUser={id:'fourth'};
   releasePermission({receive:'prompt'});
  });
  await page.evaluate(()=>Promise.resolve());
  assert.equal(await page.locator('dialog').count(),0);
  assert.deepEqual(errors,[]);await page.close();
  // Existing enabled accounts are suppressed on a fresh app launch, even if backend is offline.
  for(const offline of [false,true]){
   const fixture=await setup(browser,{enabled:true,offline});
   await fixture.page.evaluate(()=>RavenPhoneAlerts.maybePrompt());
   await fixture.page.waitForTimeout(50);
   assert.equal(await fixture.page.locator('dialog').count(),0);
   assert.equal(await fixture.page.evaluate(()=>osPrompts),0);
   assert.deepEqual(fixture.errors,[]);await fixture.page.close();
  }
  for(const options of [{native:false},{offline:true},{unavailable:true},{notReady:true}]){
   const fixture=await setup(browser,options);
   await fixture.page.evaluate(()=>RavenPhoneAlerts.maybePrompt());
   assert.equal(await fixture.page.locator('dialog').count(),0);
   assert.equal(await fixture.page.evaluate(()=>osPrompts),0);
   assert.deepEqual(fixture.errors,[]);await fixture.page.close();
  }
  // Load the real app entry HTML, including its original authentication and
  // home-screen code. No production network or account data is used.
  const home=await browser.newPage({viewport:{width:390,height:844}});
  const homeErrors=[];home.on('pageerror',error=>homeErrors.push(error.message));
  await home.addInitScript(()=>{
   const user={id:'fixture-home',email:'sample@example.invalid'};
   const profile={id:user.id,onboarding_complete:true,first_name:'Sample',raven_id:'sample'};
   const listeners={};window.homeListeners=listeners;window.homeOsPrompts=0;
   window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:{
    App:{addListener:()=>Promise.resolve({remove(){}}),getLaunchUrl:async()=>({})},
    PushNotifications:{addListener:(name,fn)=>{listeners[name]=fn;return Promise.resolve({remove(){}})},
     checkPermissions:async()=>({receive:localStorage.getItem('fixture-os-permission')||'prompt'}),
     requestPermissions:async()=>{window.homeOsPrompts++;localStorage.setItem('fixture-os-permission','granted');return{receive:'granted'}},
     register:async()=>{setTimeout(()=>listeners.registration({value:'b'.repeat(64)}),5)},
     unregister:async()=>{},removeAllDeliveredNotifications:async()=>{}}
   }};
   window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user,access_token:'fixture'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>{
    const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:profile})};return query;
   }})};
  });
  await home.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='raven-home.invalid'&&url.pathname==='/app.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync('app.html','utf8')});
   if(url.hostname==='raven-home.invalid'&&url.pathname==='/raven-phone-alerts.js')return route.fulfill({contentType:'application/javascript',body:bridge});
   if(url.pathname==='/push/status'||url.pathname==='/push/device'||url.pathname==='/account/welcome')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,platforms:{ios:true}})});
   return route.fulfill({contentType:'text/plain',body:''});
  });
  await home.goto('https://raven-home.invalid/app.html?app=1');
  await home.locator('#raven-signup-push').waitFor();
  assert.ok(await home.locator('#app-home').evaluate(el=>el.classList.contains('active')));
  assert.equal(await home.evaluate(()=>homeOsPrompts),0);
  await home.screenshot({path:'output/push-reminder-home-preview.png'});
  await home.getByRole('button',{name:'Not now',exact:true}).click();
  await home.reload();
  await home.waitForFunction(()=>window.ravenPhoneAlertsReady===true);
  await home.evaluate(()=>RavenPhoneAlerts.maybePrompt());
  assert.equal(await home.locator('dialog').count(),0,'Dismissal survives a real page reload');
  await home.evaluate(()=>localStorage.setItem('raven_push_prompt_after_fixture-home',String(Date.now()-1)));
  await home.evaluate(()=>RavenPhoneAlerts.maybePrompt());
  await home.getByRole('button',{name:'Allow',exact:true}).click();
  await home.locator('#raven-signup-push').waitFor({state:'detached'});
  await home.reload();
  await home.waitForFunction(()=>window.ravenPhoneAlertsReady===true&&RavenPhoneAlerts.isEnabled());
  assert.equal(await home.locator('dialog').count(),0,'Enabled account is restored silently after relaunch');
  assert.equal(await home.evaluate(()=>homeOsPrompts),0);
  await home.evaluate(()=>showSignedOutHome());
  await home.evaluate(()=>RavenPhoneAlerts.maybePrompt());
  assert.equal(await home.locator('dialog').count(),0,'Never prompt signed-out home');
  assert.deepEqual(homeErrors,[]);await home.close();
  // Check both actual app entry points use the same bridge, after the visible signed-in shell.
  for(const file of ['app.html','dashboard.html']){
   const html=fs.readFileSync(file,'utf8');
   assert.ok(html.includes('raven-phone-alerts.js?v=20261009-account-reminders1'));
   assert.ok(html.includes('RavenPhoneAlerts?.maybePrompt?.()'));
   for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
  }
  console.log('PASS: all signed-in native accounts, old signup dismissals, home/dashboard launch, three-day exact boundary and repeated snooze, resume, independent accounts, race/duplicate protection, enabled/offline suppression, explicit OS consent, PWA/provider/readiness gates and mobile fit. Synthetic data only.');
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
