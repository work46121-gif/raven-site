const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const source=fs.readFileSync('dashboard.html','utf8'),code=source.slice(source.indexOf('let newsletterPromptBusy ='),source.indexOf('async function savePrivacySetting('));
 await page.setContent('<style>body{background:#09090f;font-family:Arial}dialog::backdrop{background:#0009}</style><div id="dashboard-screen"></div>');
 await page.addScriptTag({content:`let currentUser={id:'a'},newsletterPreferenceValue=false;let calls=0,enabled=false,due=true;function setPrivacyToggle(){}async function newsletterRequest(opts={},endpoint=''){if(endpoint){calls++;const show=due&&!enabled;due=false;return {show}}if(opts.method==='PUT'){enabled=JSON.parse(opts.body).enabled;}return {enabled}}`+code});
 await page.evaluate(()=>maybePromptNewsletter());await page.getByRole('dialog').waitFor();
 assert.equal(await page.getByRole('button',{name:'Not now'}).isVisible(),true);
 assert.ok(await page.evaluate(()=>document.getElementById('raven-newsletter-prompt').getBoundingClientRect().width<=innerWidth));
 await page.screenshot({path:'output/newsletter-prompt-mobile.png'});
 await page.getByRole('button',{name:'Not now'}).click();assert.equal(await page.evaluate(()=>enabled),false);
 await page.evaluate(()=>maybePromptNewsletter());assert.equal(await page.locator('dialog').count(),0);
 await page.evaluate(()=>{due=true;return maybePromptNewsletter()});await page.getByRole('button',{name:'Enable newsletter'}).click();assert.equal(await page.evaluate(()=>enabled),true);
 await page.evaluate(()=>{due=true;return maybePromptNewsletter()});assert.equal(await page.locator('dialog').count(),0);
 await page.evaluate(()=>{enabled=false;due=true;return maybePromptNewsletter()});await page.evaluate(()=>{currentUser={id:'b'}});await page.getByRole('dialog').waitFor({state:'detached'});
 console.log('PASS: mobile dialog, dismiss stays off, repeat suppressed, explicit opt-in, enabled users skipped, account switch cleanup');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
