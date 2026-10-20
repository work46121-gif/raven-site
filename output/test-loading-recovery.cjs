'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {chromium}=require('playwright');
const app=fs.readFileSync('app.html','utf8'),dashboard=fs.readFileSync('dashboard.html','utf8');
// Exercise the real trip-opening function with hung auth/pass providers.
const tripCode=dashboard.slice(dashboard.indexOf('async function openTrip('),dashboard.indexOf('function showTripOpenLoader('));
async function tripTest(mode){
 let shown=0,assigned=[],network=0;
 const context={URL,AbortController,location:{href:'https://ravensplit.com/dashboard.html',assign:u=>assigned.push(u)},tripDataMap:{T:{name:'Test trip'}},FRONTEND:'https://ravensplit.com',BACKEND:'https://backend.test',
  setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,25)),clearTimeout,showTripOpenLoader:()=>shown++,hideTripOpenLoader(){},getTripOpenUrl:()=> 'https://ravensplit.com/trip/T?t=synthetic',console,
  db:{auth:{getSession:()=>mode==='auth-hang'?new Promise(()=>{}):Promise.resolve({data:{session:{access_token:'synthetic'}}})}},fetch:()=>{network++;return mode==='body-hang'?Promise.resolve({ok:true,json:()=>new Promise(()=>{})}):mode==='pass-ok'?Promise.resolve({ok:true,json:async()=>({pass:'scoped-test-pass'})}):new Promise(()=>{})}};
 context.window={location:context.location};vm.createContext(context);vm.runInContext(tripCode,context);
 await Promise.all([context.openTrip('T'),context.openTrip('T')]);assert.equal(shown,1);assert.equal(assigned.length,1,'one navigation even with rapid double tap');
 assert.equal(new URL(assigned[0]).searchParams.get('t'),'synthetic','never drop trip access');
 if(mode==='auth-hang')assert.equal(network,0);if(mode==='pass-ok')assert.ok(assigned[0].includes('#raven_travel=scoped-test-pass'));
}
(async()=>{
 for(const mode of ['auth-hang','pass-hang','body-hang','pass-ok'])await tripTest(mode);
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const mode of ['sdk-hang','session-hang','profile-hang','success']){
   const page=await browser.newPage({viewport:{width:390,height:844}});await page.clock.install();
   let writes=0;
   await page.route('**/*',route=>{
    if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:app});
    if(route.request().url().includes('/@supabase/')){
     if(mode==='sdk-hang')return new Promise(()=>{});
     const session={user:{id:'test-id',email:'test@example.invalid'},access_token:'synthetic'};
     return route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:()=>${mode==='session-hang'?'new Promise(()=>{})':`Promise.resolve({data:{session:${JSON.stringify(session)}}})`}},from(){const q={select(){return q},eq(){return q},maybeSingle(){return ${mode==='profile-hang'?'new Promise(()=>{})':'Promise.resolve({data:{onboarding_complete:true,first_name:"Test"}})'}}};return q}})};`});
    }
    if(route.request().method()!=='GET')writes++;
    return route.fulfill({contentType:route.request().resourceType()==='stylesheet'?'text/css':'application/javascript',body:''});
   });
   await page.goto('https://loading.test/app.html',{waitUntil:'commit'});
   await page.waitForFunction(()=>!!window.RavenBoot);
   await page.clock.runFor(13000);
   if(mode==='success')assert.equal(await page.locator('#intro-splash').evaluate(el=>el.classList.contains('is-done')),true);
   else{await page.getByRole('button',{name:'Retry loading RAVEN'}).waitFor();assert.equal(await page.locator('#intro-splash').isVisible(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('raven_signed_out')),null,'timeout does not sign out');}
   if(mode==='session-hang')await page.screenshot({path:'output/raven-startup-retry-preview.png'});
   assert.ok(writes<=1,'only existing welcome request, no new data writes');await page.close();
  }
 }finally{await browser.close()}
 console.log('PASS startup recovery for hung SDK/session/profile, successful boot, no forced logout or false onboarding; bounded optional trip auth/pass and double-tap navigation.');
})().catch(e=>{console.error(e);process.exitCode=1});
