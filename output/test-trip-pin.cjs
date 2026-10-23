'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const Pin=require('../raven-trip-pin');
const nativeFetch=global.fetch;
const store=new Map();global.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const user={id:'11111111-1111-4111-8111-111111111111',email:'member@example.invalid'};
const trip={id:'TRIP1',name:'Scottsdale 2026',creator_email:user.email,member_emails:'[]',type:'trip',share_token:'private-link'};
async function unit(){
  Pin.set(user.id,trip);assert.deepEqual(Pin.read(user.id),{id:trip.id,name:trip.name});assert.equal(Pin.read('other'),null);
  assert.ok(!JSON.stringify([...store]).includes(trip.share_token),'no capability saved');
  Pin.set(user.id,{id:'TRIP2',name:'Fort Laddie'});Pin.clear(user.id,'TRIP1');assert.equal(Pin.read(user.id).id,'TRIP2','stale resolution cannot clear newer pin');
  Pin.clear(user.id);assert.equal(Pin.read(user.id),null);
  for(const id of ['../x','a?token=x','https://evil.invalid','',null])assert.throws(()=>Pin.set(user.id,{id,name:'Unsafe'}));
  store.set('raven_home_trip_v1:'+user.id,'{broken');assert.equal(Pin.read(user.id),null);Pin.clear(user.id);
  assert.equal(Pin.hasAccess({...trip,creator_email:'other',member_emails:JSON.stringify(['MEMBER@EXAMPLE.INVALID'])},user),true);
  assert.equal(Pin.hasAccess({...trip,creator_email:'other',member_emails:JSON.stringify(['notmember@example.invalid'])},user),false);
  assert.equal(Pin.hasAccess({...trip,type:'roommates'},user),false);
  let queries=0,status=200,result=trip,queryError=null,headers,fields;
  const db={from(table){assert.equal(table,'trips');const q={select(s){fields=s;return q},eq(k,v){assert.equal(k,'id');assert.equal(v,trip.id);return q},abortSignal(){return q},async maybeSingle(){queries++;return {data:result,error:queryError}}};return q}};
  global.fetch=async(url,options)=>{assert.ok(url.endsWith('/trips/TRIP1/travel-pass'));headers=options.headers;return {ok:status===200,status,json:async()=>({success:true,pass:'fresh-pass'})}};
  const options={pin:{id:trip.id,name:trip.name},session:{user,access_token:'synthetic-auth'},backend:'https://backend.test',db};
  let dest=await Pin.resolve(options);assert.equal(dest.name,trip.name);assert.equal(headers.Authorization,'Bearer synthetic-auth');
  const url=new URL(dest.url);assert.equal(url.origin,'https://ravensplit.com');assert.equal(url.pathname,'/trip/TRIP1');assert.equal(url.hash,'#raven_travel=fresh-pass');assert.equal(url.searchParams.get('t'),trip.share_token);assert.ok(!dest.url.includes('synthetic-auth'));assert.equal(fields,'id,name,type,creator_email,member_emails,share_token');
  const count=queries;for(status of [403,404])assert.equal(await Pin.resolve(options),null);assert.equal(queries,count,'denied server access never fetches trip metadata');
  status=401;await assert.rejects(Pin.resolve(options),e=>e.status===401);status=503;await assert.rejects(Pin.resolve(options));status=200;
  result=null;assert.equal(await Pin.resolve(options),null);result={...trip,creator_email:'other',member_emails:'[]'};assert.equal(await Pin.resolve(options),null);
  result=trip;queryError={message:'offline'};await assert.rejects(Pin.resolve(options));queryError=null;
  global.fetch=()=>new Promise(()=>{});await assert.rejects(Pin.resolve({...options,timeoutMs:15}),/timed out/);
  const realStorage=global.localStorage;global.localStorage={setItem(){throw Error('Quota')},getItem(){throw Error('Disabled')}};assert.equal(Pin.read(user.id),null);assert.throws(()=>Pin.set(user.id,trip),/Could not save/);global.localStorage=realStorage;
  global.fetch=nativeFetch;
}
async function ui(){
  const d=fs.readFileSync('dashboard.html','utf8'),helper=fs.readFileSync('raven-trip-pin.js','utf8');
  for(const m of d.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=|application\/(?:ld\+)?json/.test(m[1]))new vm.Script(m[2]);
  const script=d.slice(d.indexOf('async function toggleHomeTripPin('),d.indexOf('function openCreateTrip()'));
  const body=d.slice(d.indexOf('<div id="page-trip-hub"'),d.indexOf('<!-- ROOMMATES PAGE -->'));
  const assets=new Map(),fontUrl='https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Epilogue:wght@400;500;600;700;800&display=swap';
  if(process.env.RAVEN_TEST_BRAND_FONTS==='1'){
    const css=await(await fetch(fontUrl,{signal:AbortSignal.timeout(15000)})).text();assets.set(fontUrl,{contentType:'text/css',body:css});
    for(const m of css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g))if(!assets.has(m[1]))assets.set(m[1],{contentType:'font/woff2',body:Buffer.from(await(await fetch(m[1],{signal:AbortSignal.timeout(15000)})).arrayBuffer())});
  }
  const setup=`let currentUser=${JSON.stringify(user)},tripDataMap={},tripUrlMap={};window.events=[];window.sessionValid=true;
  const trips=[${JSON.stringify({...trip,total:0,receipt_count:17,people:['Member','Guest'],created_at:'2026-10-14'})},${JSON.stringify({...trip,id:'TRIP2',name:'Fort Laddie Part 2',total:0,receipt_count:22,people:['Member','Guest'],created_at:'2026-10-13'})}];
  const RAVEN_APP_MODE=true,FRONTEND='https://fixture.invalid',warmedTripUrls=new Set();
  const getDashboardUserEmail=()=>currentUser.email,tripBelongsToDashboardUser=(t,e)=>t.creator_email===e,showToast=(text)=>events.push(text),isRavenSignedOut=()=>!currentUser,tripOpenWait=async p=>p,openTrip=(id)=>events.push('open:'+id),warmTrip=()=>events.push('warm'),openTripAdmin=()=>events.push('admin'),openTripChat=()=>events.push('chat'),refreshTripChatUnreadBadges=()=>{},openSampleGuide=()=>{};
  window.sessionGate=false;window.pendingSessions=[];
  const db={auth:{getSession:async()=>sessionGate?new Promise(resolve=>pendingSessions.push(resolve)):({data:{session:sessionValid?{user:currentUser}:null}})},from(table){const q={select(){return q},eq(){return q},neq(){return q},ilike(){return q},in(){return q},order(){return q},maybeSingle(){return q},then(fn){return Promise.resolve({data:table==='trips'?trips:null,error:null}).then(fn)}};return q}};`;
  const html='<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+[...d.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map(m=>m[0]).join('')+'<style>body{display:block!important;padding:24px 14px!important;opacity:1!important}.page{display:block!important}</style></head><body class="app-mode ready">'+body+'<script>'+helper+'</script><script>'+setup+script+'</script></body></html>';
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>assets.has(route.request().url())?route.fulfill(assets.get(route.request().url())):route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:html.replace('</head>','<link rel="stylesheet" href="'+fontUrl+'"></head>')}):route.abort());
    await page.goto('https://fixture.invalid/pins');await page.evaluate(()=>loadTrips());
    const pin1=page.locator('[data-home-pin="TRIP1"]'),pin2=page.locator('[data-home-pin="TRIP2"]');
    assert.equal(await page.locator('[data-home-pin]').count(),2);assert.equal(await page.locator('#sample-trip-tutorial [data-home-pin]').count(),0,'sample not pinnable');
    await pin1.tap();assert.equal(await pin1.getAttribute('aria-pressed'),'true');assert.ok(!(await page.evaluate(()=>events)).some(e=>e==='warm'||e.startsWith('open:')),'pin tap never opens/prefetches trip');
    await pin2.tap();assert.equal(await pin1.getAttribute('aria-pressed'),'false');assert.equal(await pin2.getAttribute('aria-pressed'),'true');
    await pin2.tap();assert.equal(await pin2.getAttribute('aria-pressed'),'false');
    await pin1.focus();await page.keyboard.press('Enter');assert.equal(await pin1.getAttribute('aria-pressed'),'true');
    await page.reload();await page.evaluate(()=>loadTrips());assert.equal(await pin1.getAttribute('aria-pressed'),'true','pin persists after reload');
    await page.evaluate(()=>sessionGate=true);await pin1.tap();await pin2.tap();
    await page.evaluate(()=>pendingSessions[1]({data:{session:{user:currentUser}}}));await pin2.getByText('Pinned',{exact:true}).waitFor();
    await page.evaluate(()=>pendingSessions[0]({data:{session:{user:currentUser}}}));await page.waitForFunction(()=>![...document.querySelectorAll('[data-home-pin]')].some(button=>button.disabled));
    assert.equal(await pin2.getAttribute('aria-pressed'),'true','late first response never replaces the last selected pin');await page.evaluate(()=>sessionGate=false);await pin1.tap();
    for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.ok(await page.locator('.bill-card').evaluateAll(nodes=>nodes.every(e=>e.scrollWidth<=e.clientWidth)),'cards fit '+width);const r=await pin1.boundingBox();assert.ok(r.width>=44&&r.height>=44);assert.ok(await pin1.evaluate(button=>button.getBoundingClientRect().left>=button.previousElementSibling.getBoundingClientRect().right),'pin never overlaps name/meta')}
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'output/trip-pin-hub-mobile.png',fullPage:true});
    await page.evaluate(()=>sessionValid=false);await pin2.tap();assert.equal(await pin1.getAttribute('aria-pressed'),'true','expired session cannot replace pin');
    await page.evaluate(()=>{sessionValid=true;currentUser={...currentUser,id:'22222222-2222-4222-8222-222222222222'};return loadTrips()});assert.equal(await pin1.getAttribute('aria-pressed'),'false','another account never inherits pin');
    await pin2.tap();assert.equal(await page.evaluate(()=>RavenTripPin.read('11111111-1111-4111-8111-111111111111').id),'TRIP1');
    const original=await page.evaluate(()=>JSON.stringify(trips));await page.evaluate(()=>{trips[0].name='A very long trip name with <script>not executable</script> & a very long destination';return loadTrips()});await page.setViewportSize({width:320,height:844});assert.ok(await page.locator('.bill-card').evaluateAll(nodes=>nodes.every(e=>e.scrollWidth<=e.clientWidth)));
    assert.equal(JSON.parse(original)[0].total,0);assert.deepEqual(await page.evaluate(()=>trips.map(t=>t.receipt_count)),[17,22]);assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close()}
}
(async()=>{await unit();await ui();console.log('PASS trip pin: scoped storage, one pin, reload/unpin/replace, accessible mobile UI, no accidental trip opening, session checks, server membership checks, minimal fresh metadata, private capability handling, deleted/revoked trip fallback, timeout, no financial or receipt changes. Synthetic data only.')})().catch(e=>{console.error(e);process.exitCode=1});
