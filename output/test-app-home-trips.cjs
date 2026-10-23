'use strict';
// Full opening-page browser regression. App/API traffic is synthetic and intercepted.
// Optional public brand fonts are fetched before testing, never account/media data.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const html = fs.readFileSync('app.html', 'utf8');
const pinHelper = fs.readFileSync('raven-trip-pin.js','utf8');
for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/src=/.test(script[1])) new vm.Script(script[2]);
}
assert.match(fs.readFileSync('dashboard.html', 'utf8'), /id="page-trip-hub"/);
const sdk = `
window.testSessionMode='valid';window.testSessionCalls=0;window.releaseSession=null;
window.testUser={id:'11111111-1111-4111-8111-111111111111',email:'member@example.invalid'};
window.testProfile={first_name:'Member',raven_id:'member',onboarding_complete:true};
window.testTrip={id:'TRIP1',name:'Scottsdale 2026',type:'trip',creator_email:'member@example.invalid',member_emails:'[]',share_token:'synthetic-share'};
window.testTripError=false;
window.supabase={createClient(){return {
  auth:{
    async getSession(){window.testSessionCalls++;if(testSessionMode==='pending')return new Promise(resolve=>window.releaseSession=resolve);if(testSessionMode==='error')throw Error('offline');return {data:{session:testSessionMode==='none'?null:{user:testUser,access_token:'synthetic-only'}}};},
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},
    async signOut(){return {error:null};}
  },
  from(table){const q={select(){return q;},eq(){return q;},abortSignal(){return q;},async maybeSingle(){return {data:table==='trips'?window.testTrip:window.testProfile,error:table==='trips'&&window.testTripError?{message:'offline'}:null};}};return q;}
}}};`;

(async () => {
  const assets = new Map();
  if (process.env.RAVEN_TEST_BRAND_FONTS === '1') {
    const url = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Epilogue:wght@400;500;600;700;800&display=swap';
    const css = await (await fetch(url, {signal:AbortSignal.timeout(15000)})).text();
    assets.set(url, {contentType:'text/css', body:css});
    for (const match of css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)) {
      if (!assets.has(match[1])) assets.set(match[1], {contentType:'font/woff2',body:Buffer.from(await (await fetch(match[1],{signal:AbortSignal.timeout(15000)})).arrayBuffer())});
    }
  }
  const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const errors=[];
  try {
    async function open(mode='valid',profileComplete=true,pin=null) {
      const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      const page=await context.newPage();
      const controls={passStatus:200,gate:null};
      if(pin)await context.addInitScript(pin=>{if(location.hostname==='raven-home.test'&&location.pathname==='/app.html')localStorage.setItem('raven_home_trip_v1:11111111-1111-4111-8111-111111111111',JSON.stringify(pin))},pin);
      const requests=[],navigations=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async route=>{
        const url=route.request().url();requests.push(url);
        if(new URL(url).pathname==='/raven-trip-pin.js')return route.fulfill({contentType:'application/javascript',body:pinHelper});
        if(url.endsWith('/travel-pass')){if(controls.gate)await controls.gate;return route.fulfill({status:controls.passStatus,contentType:'application/json',body:JSON.stringify({success:controls.passStatus===200,pass:'synthetic-trip-pass'})})}
        if(assets.has(url))return route.fulfill(assets.get(url));
        if(url.includes('cdn.jsdelivr.net/npm/@supabase/'))return route.fulfill({contentType:'application/javascript',body:sdk+`window.testSessionMode=${JSON.stringify(mode)};window.testProfile.onboarding_complete=${profileComplete};`});
        if(route.request().isNavigationRequest()) {
          if(new URL(url).pathname==='/app.html')return route.fulfill({contentType:'text/html',body:html});
          navigations.push(new URL(url).pathname+new URL(url).search);
          return route.fulfill({contentType:'text/html',body:'<h1>Authenticated destination fixture</h1>'});
        }
        if(url.endsWith('/account/welcome'))return route.fulfill({contentType:'application/json',body:'{"success":true}'});
        return route.fulfill({contentType:url.includes('fonts.googleapis')?'text/css':'application/javascript',body:''});
      });
      await page.goto('https://raven-home.test/app.html?app=1');
      if(profileComplete)await page.locator('#app-home.active').waitFor();
      return {page,context,requests,navigations,controls};
    }
    const home=await open();const page=home.page;
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('#home-trips-btn').isVisible(),true);
    assert.equal(await page.getByRole('heading',{name:'Scan Receipt'}).count(),1);
    assert.equal(await page.getByRole('heading',{name:'RAVEN Trips'}).count(),1);
    for (const [width,height] of [[320,568],[375,667],[390,844],[430,932],[768,1024],[844,390],[1280,800]]) {
      await page.setViewportSize({width,height});
      const layout=await page.evaluate(()=>{
        const selectors=['.scan-logo-button','#home-trips-btn','#scan-home-title','#trips-home-title','.dashboard-pill'];
        return {overflow:document.documentElement.scrollWidth>innerWidth, boxes:selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {s,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};})};
      });
      assert.equal(layout.overflow,false,`no horizontal overflow ${width}x${height}`);
      for(const box of layout.boxes){assert.ok(box.x>=0 && box.right<=width+1,box.s+' horizontal bounds');assert.ok(box.y>=0&&box.bottom<=height+1,box.s+' visible '+width+'x'+height);}
      const scan=layout.boxes[0],trips=layout.boxes[1];
      assert.ok(scan.height>=44&&trips.height>=44,'accessible hit areas');
      assert.ok(scan.bottom<=trips.y || scan.right<=trips.x,'actions never overlap');
    }
    await page.setViewportSize({width:390,height:844});
    // Approximate iPhone safe-area insets for the reference image.
    await page.addStyleTag({content:'#home-top{padding-top:71px!important}.app-cta-bottom{padding-bottom:44px!important}'});
    await page.waitForFunction(()=>[...document.querySelectorAll('.intro-splash')].every(el=>getComputedStyle(el).visibility==='hidden'||getComputedStyle(el).display==='none'));
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))});
    for(const id of ['scan-home-title','trips-home-title','trips-home-instruction'])assert.ok(await page.locator('#'+id).evaluate(el=>{const r=el.getBoundingClientRect(),parent=el.closest('.scan-card').getBoundingClientRect();return r.top>=parent.top&&r.bottom<=parent.bottom}),'safe-area text not clipped: '+id);
    await page.screenshot({path:'output/app-home-split-mobile.png',fullPage:true});
    assert.equal(home.requests.some(url=>/\/trips?\/|\/album|\/receipts/.test(new URL(url).pathname)),false,'no trip/media preload');
    assert.notEqual(await page.locator('.trips-wing-left').evaluate(e=>getComputedStyle(e).animationName),'none');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.trips-wing-left').evaluate(e=>getComputedStyle(e).animationName),'none');
    await page.locator('#home-trips-btn').focus();await page.keyboard.press('Enter');
    await page.waitForURL('**/dashboard.html?app=1&page=trip-hub');
    assert.deepEqual(home.navigations,['/dashboard.html?app=1&page=trip-hub']);
    await home.context.close();

    const touch=await open();await touch.page.locator('#home-trips-btn').tap();await touch.page.waitForURL('**/dashboard.html?app=1&page=trip-hub');assert.equal(touch.navigations.length,1);await touch.context.close();
    const scan=await open();await scan.page.locator('.scan-logo-button').tap();await scan.page.waitForURL('**/dashboard.html?app=1&page=create-bill');await scan.context.close();
    const dashboard=await open();await dashboard.page.getByRole('button',{name:'Open Dashboard'}).click();await dashboard.page.waitForURL('**/dashboard.html?app=1&page=overview');await dashboard.context.close();
    const settings=await open();await settings.page.getByRole('button',{name:'Profile & settings'}).click();await settings.page.waitForURL('**/dashboard.html?app=1&page=settings');await settings.context.close();

    const signedOut=await open('none');
    await signedOut.page.evaluate(()=>localStorage.setItem('raven_profile',JSON.stringify({user_id:'stale-user',onboarding_complete:true})));
    await signedOut.page.locator('#home-trips-btn').tap();
    await signedOut.page.locator('#app-home.auth-visible').waitFor();
    assert.equal(signedOut.navigations.length,0,'cached identity never grants trips entry');
    assert.equal(await signedOut.page.locator('.trips-hero').isVisible(),false,'auth gets full-height layout');
    for(const tab of ['login','signup','reset']){
      await signedOut.page.evaluate(tab=>showAuthPanel(tab),tab);
      const action=signedOut.page.locator('#'+({login:'login-button',signup:'signup-button',reset:'reset-button'}[tab]));
      await action.scrollIntoViewIfNeeded();assert.equal(await action.isVisible(),true,'auth form remains usable '+tab);
    }
    await signedOut.context.close();

    const expired=await open();await expired.page.evaluate(()=>window.testSessionMode='none');await expired.page.locator('#home-trips-btn').tap();await expired.page.locator('#app-home.auth-visible').waitFor();assert.equal(expired.navigations.length,0);await expired.context.close();
    const mismatch=await open();await mismatch.page.evaluate(()=>window.testUser={id:'other',email:'other@example.invalid'});await mismatch.page.locator('#home-trips-btn').tap();await mismatch.page.locator('#app-home.auth-visible').waitFor();assert.equal(mismatch.navigations.length,0);await mismatch.context.close();
    const stalled=await open();await stalled.page.evaluate(()=>window.testSessionMode='pending');await stalled.page.locator('#home-trips-btn').tap();await stalled.page.locator('#trips-home-status').getByText('Could not verify your session. Tap the wings to retry.').waitFor({timeout:5000});assert.equal(await stalled.page.locator('#home-trips-btn').isEnabled(),true);assert.equal(stalled.navigations.length,0);await stalled.page.evaluate(()=>window.testSessionMode='valid');await stalled.page.locator('#home-trips-btn').tap();await stalled.page.waitForURL('**/dashboard.html?app=1&page=trip-hub');await stalled.context.close();
    const race=await open();await race.page.evaluate(()=>window.testSessionMode='pending');await race.page.locator('#home-trips-btn').tap();await race.page.evaluate(()=>{showSignedOutHome();window.releaseSession({data:{session:{user:testUser}}});});await race.page.waitForFunction(()=>!tripsHomeOpening);assert.equal(race.navigations.length,0,'sign-out during check does not navigate');await race.context.close();
    const onboarding=await open('valid',false);await onboarding.page.waitForURL('**/onboarding.html?app=1');assert.deepEqual(onboarding.navigations,['/onboarding.html?app=1']);await onboarding.context.close();

    const pinned=await open('valid',true,{id:'TRIP1',name:'Scottsdale 2026'});
    assert.equal(pinned.requests.some(url=>url.endsWith('/travel-pass')),false,'idle Home never resolves trip access');
    await pinned.page.getByText('Pinned · Scottsdale 2026',{exact:true}).waitFor();
    let releasePass;pinned.controls.gate=new Promise(resolve=>releasePass=resolve);
    await pinned.page.getByRole('button',{name:'RAVEN Trips',exact:true}).tap();
    await pinned.page.getByRole('heading',{name:'Opening Scottsdale 2026…',exact:true}).waitFor();
    for(const width of [320,390,768]){await pinned.page.setViewportSize({width,height:844});assert.ok(await pinned.page.locator('#home-trip-opening').evaluate(e=>e.scrollWidth<=e.clientWidth),'loader fits '+width)}
    await pinned.page.setViewportSize({width:390,height:844});
    await pinned.page.screenshot({path:'output/trip-pin-opening-mobile.png'});
    await pinned.page.evaluate(()=>testTrip.name='Scottsdale reunion');releasePass();
    await pinned.page.waitForURL('https://ravensplit.com/trip/TRIP1?**');
    assert.equal(pinned.navigations.length,1);assert.ok(pinned.navigations[0].startsWith('/trip/TRIP1?'),'bypasses dashboard list');
    assert.equal(new URL(pinned.page.url()).hash,'#raven_travel=synthetic-trip-pass');
    assert.equal(new URL(pinned.page.url()).searchParams.get('t'),'synthetic-share');await pinned.context.close();

    for(const reason of ['removed','deleted','mismatch','roommates']){
      const gone=await open('valid',true,{id:'TRIP1',name:'Old trip'});
      if(reason==='removed')gone.controls.passStatus=403;
      if(reason==='deleted')await gone.page.evaluate(()=>testTrip=null);
      if(reason==='mismatch')await gone.page.evaluate(()=>testTrip.creator_email='different@example.invalid');
      if(reason==='roommates')await gone.page.evaluate(()=>testTrip.type='roommates');
      await gone.page.locator('#home-trips-btn').tap();await gone.page.waitForURL('**/dashboard.html?app=1&page=trip-hub');
      assert.equal(await gone.page.evaluate(()=>localStorage.getItem('raven_home_trip_v1:11111111-1111-4111-8111-111111111111')),null,'unavailable pin cleared');
      assert.ok(!gone.navigations.some(url=>url.startsWith('/trip/')),'inaccessible pin never opens: '+reason);await gone.context.close();
    }
    const offline=await open('valid',true,{id:'TRIP1',name:'Scottsdale 2026'});offline.controls.passStatus=503;
    await offline.page.locator('#home-trips-btn').tap();await offline.page.getByText('Could not open your pinned trip. Check your connection and retry.',{exact:true}).waitFor();
    assert.equal(await offline.page.evaluate(()=>RavenTripPin.read(currentUser.id).id),'TRIP1','temporary outage keeps pin');
    offline.controls.passStatus=200;await offline.page.getByRole('button',{name:'Retry opening trip'}).click();await offline.page.waitForURL('https://ravensplit.com/trip/TRIP1?**');await offline.context.close();
    const cancel=await open('valid',true,{id:'TRIP1',name:'Scottsdale 2026'});let releaseCancel;cancel.controls.gate=new Promise(resolve=>releaseCancel=resolve);
    await cancel.page.locator('#home-trips-btn').tap();await cancel.page.getByRole('button',{name:'Cancel opening trip'}).waitFor();
    await cancel.page.keyboard.press('Escape');releaseCancel();await cancel.page.waitForFunction(()=>!tripsHomeOpening);assert.equal(cancel.navigations.length,0);assert.equal(await cancel.page.locator('#home-trip-opening').isVisible(),false);await cancel.context.close();
    const all=await open('valid',true,{id:'TRIP1',name:'Scottsdale 2026'});all.controls.passStatus=503;
    await all.page.locator('#home-trips-btn').tap();await all.page.getByRole('button',{name:'View all trips'}).click();await all.page.waitForURL('**/dashboard.html?app=1&page=trip-hub');await all.context.close();
    const revoked=await open('valid',true,{id:'TRIP1',name:'Scottsdale 2026'});revoked.controls.passStatus=401;
    await revoked.page.locator('#home-trips-btn').tap();await revoked.page.locator('#app-home.auth-visible').waitFor();assert.equal(revoked.navigations.length,0);assert.equal(await revoked.page.locator('#home-trip-opening').isVisible(),false);await revoked.context.close();
    const loggedOutPin=await open('none',true,{id:'TRIP1',name:'Private trip'});assert.equal(await loggedOutPin.page.getByText('Pinned · Private trip',{exact:true}).count(),0);await loggedOutPin.page.locator('#home-trips-btn').tap();await loggedOutPin.page.locator('#app-home.auth-visible').waitFor();assert.equal(loggedOutPin.requests.some(url=>url.endsWith('/travel-pass')),false);await loggedOutPin.context.close();
    assert.deepEqual(errors,[]);
    console.log('PASS opening screen: full-page startup, responsive sections, no media preload, Trips touch/keyboard/title routing, existing routes preserved, session guards, timeout retry, sign-out race, onboarding, auth forms, reduced motion, direct pinned trip, named loader, inaccessible/deleted pin fallback, temporary failures, cancel and all-trips escape. Synthetic data only.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
