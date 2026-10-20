'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const initiallyCompleted of [true,false]){
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await page.clock.install();
   let calls=0,complete=initiallyCompleted;const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());
    const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(req.isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#08080d;color:white;font:16px Arial"><button id="trip-travel-action">Trip Center</button></body>'});
    if(url.pathname.endsWith('/travel'))return json({members:[{id:'U',first_name:'Alex'}],media:[{id:'F',kind:'flight',person_id:'U',flight_number:'AA100',title:'Outbound',url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="76"/>',can_remove:false}],flight_tracking:{enabled:!complete},can_assign:false,hasMore:false});
    if(url.pathname.endsWith('/flight-status')){calls++;return json(complete?{tracking_enabled:false,status:'completed',label:'Tracking off · trip completed'}:{available:true,status:'live',label:'Live · airborne'})}
    throw Error('Unexpected request '+url.pathname);
   });
   await page.goto('https://flight-ui.test');
   await page.addScriptTag({content:"var TRIP_ID='T',BACKEND='https://api.test';function initChatDb(){return Promise.resolve()}var chatDb={auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:'U'}}}})}};"});
   await page.addScriptTag({content:fs.readFileSync(process.env.RAVEN_TRAVEL_UI_PATH||'raven-travel-ui.js','utf8')});
   assert.equal(calls,0,'trip entry performs no flight queries');
   await page.getByRole('button',{name:'Trip Center',exact:true}).click();await page.locator('.travel-flight-disclosure').waitFor();
   if(initiallyCompleted){
    await page.getByText('Tracking off · trip completed',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Refresh status'}).count(),0);
   }else{
    await page.locator('.travel-flight-state.live').waitFor({state:'attached'});assert.equal(calls,1);
    complete=true;await page.clock.runFor(61000);await page.locator('.travel-flight-state.completed').first().waitFor({state:'attached'});assert.equal(calls,2);
   }
   const before=calls;await page.clock.runFor(180000);
   await page.evaluate(()=>{window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'))});await page.clock.runFor(1000);
   assert.equal(calls,before,'completed trips do not poll or refresh on resume');assert.equal(before,initiallyCompleted?0:2);
   if(initiallyCompleted)await page.screenshot({path:'output/completed-trip-flight-preview.png'});
   await page.getByRole('button',{name:'Close Trip Center'}).click();assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS flight UI: zero completed-trip queries, active status preserved, completion stops polling and online/resume refresh; trip entry remains lazy.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
