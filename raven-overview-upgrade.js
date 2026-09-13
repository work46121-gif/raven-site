/* Additive overview inbox and RAVEN Lifestyle money hub. */
// Private recent-member list. All reads pass through the authenticated owner API.
(() => {
  const result = document.getElementById('admin-profile-result');
  if (!result) return;
  const section = document.createElement('section');
  section.className = 'rm-card';
  section.style.marginBottom = '18px';
  section.setAttribute('aria-labelledby', 'admin-recent-title');
  section.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><h3 id="admin-recent-title">Recently joined</h3><div class="rm-muted">Newest accounts first · includes setup in progress</div></div><button type="button" id="admin-recent-refresh">Refresh</button></div><div id="admin-recent-status" class="rm-muted" role="status" style="margin-top:12px"></div><div id="admin-recent-list"></div><button type="button" id="admin-recent-more" hidden style="margin-top:14px">Load more</button>';
  result.before(section);
  const list = section.querySelector('#admin-recent-list');
  list.tabIndex = 0;
  list.setAttribute('role', 'region');
  list.setAttribute('aria-label', 'Recently joined members; scroll for more');
  list.style.cssText = 'overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;';
  function sizeRecentList() {
    const rows = [...list.children];
    if (!rows.length) { list.style.maxHeight = ''; return; }
    const height = rows.slice(0, 2).reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    if (height) list.style.maxHeight = Math.ceil(height) + 'px';
  }
  if (window.ResizeObserver) new ResizeObserver(sizeRecentList).observe(section);
  window.addEventListener('resize', sizeRecentList);
  const status = section.querySelector('#admin-recent-status');
  const more = section.querySelector('#admin-recent-more');
  const refresh = section.querySelector('#admin-recent-refresh');
  let offset = 0, generation = 0;
  const seen = new Set();
  async function loadRecentMembers(reset = true) {
    const requestGeneration = ++generation;
    const owner = currentUser?.id;
    if (reset) { list.replaceChildren(); seen.clear(); offset = 0; more.hidden = true; }
    if (!ravenAdminAccess || !owner) { list.replaceChildren(); status.textContent = ''; more.hidden = true; return; }
    refresh.disabled = true; more.disabled = true; status.textContent = 'Loading recent members…';
    try {
      const response = await ravenAdminRequest('/admin/recent-members?offset=' + offset);
      if (requestGeneration !== generation || currentUser?.id !== owner || !ravenAdminAccess) return;
      for (const member of response.members || []) {
        if (seen.has(member.id)) continue;
        seen.add(member.id);
        const row = document.createElement('div'); row.className = 'rm-item';
        const identity = document.createElement('div'); identity.style.minWidth = '0';
        const name = document.createElement('strong');
        name.textContent = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'New member';
        const handle = document.createElement('small'); handle.style.color = '#C084FC';
        handle.textContent = member.raven_id ? '@' + member.raven_id : 'Raven ID not set yet';
        const joined = document.createElement('small');
        const date = member.created_at ? new Date(member.created_at) : null;
        joined.textContent = (date && !Number.isNaN(date.getTime()) ? 'Joined ' + date.toLocaleString(undefined, {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : 'Join date unavailable') + (member.onboarding_complete ? '' : ' · Setup in progress');
        identity.append(name, handle, joined); row.append(identity);
        if (member.raven_id) {
          const view = document.createElement('button'); view.type = 'button'; view.textContent = 'View';
          view.setAttribute('aria-label', 'View @' + member.raven_id);
          view.onclick = () => { document.getElementById('admin-raven-id-input').value = member.raven_id; loadAdminProfile(member.raven_id); };
          row.append(view);
        }
        list.append(row);
      }
      offset = response.nextOffset;
      more.hidden = !response.hasMore;
      status.textContent = seen.size ? 'Newest members · scroll to see more' : 'No member profiles yet.';
      requestAnimationFrame(sizeRecentList);
    } catch (error) {
      if (requestGeneration === generation) status.textContent = 'Could not load recent members. Tap Refresh to retry.';
    } finally {
      if (requestGeneration === generation) { refresh.disabled = false; more.disabled = false; }
    }
  }
  refresh.onclick = () => loadRecentMembers(true);
  more.onclick = () => loadRecentMembers(false);
  const previousShowPage = window.showPage;
  window.showPage = function(...args) {
    const response = previousShowPage.apply(this, args);
    if (args[0] === 'admin') void loadRecentMembers(true);
    else { generation++; list.replaceChildren(); seen.clear(); more.hidden = true; status.textContent = ''; }
    return response;
  };
  if (document.getElementById('page-admin')?.classList.contains('active')) void loadRecentMembers(true);
})();

(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value) || 0);
  let inboxTab='messages', inboxOwner=null, notifications=[], conversations=[], inboxBusy=false;
  const overviewHeader=document.querySelector('#page-overview > .page-header');
  if (overviewHeader) {
    overviewHeader.insertAdjacentHTML('beforeend','<button type="button" class="raven-inbox-trigger" id="raven-inbox-open" aria-label="Open inbox: messages and notifications" aria-haspopup="dialog"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h16v13H9l-5 4V4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span class="raven-inbox-label">Inbox</span><span class="raven-inbox-count" id="raven-inbox-count" hidden></span></button>');
    document.body.insertAdjacentHTML('beforeend','<dialog id="raven-inbox" aria-labelledby="raven-inbox-title"><div class="raven-inbox-head"><div><h2 id="raven-inbox-title">Inbox</h2></div><button type="button" id="raven-inbox-close" aria-label="Close inbox">×</button></div><div class="raven-inbox-tabs" role="group" aria-label="Inbox sections"><button type="button" data-inbox-tab="messages" aria-pressed="true">Inbox</button><button type="button" data-inbox-tab="notifications" aria-pressed="false">Notifications</button></div><div id="raven-inbox-list" aria-live="polite"></div></dialog>');
    byId('raven-inbox-open').onclick=()=>{byId('raven-inbox').showModal();refreshInbox(true)};
    const compose=document.createElement('button');compose.type='button';compose.id='raven-inbox-compose';compose.textContent='+';compose.setAttribute('aria-label','Start a new chat');compose.style.marginLeft='auto';compose.style.marginRight='8px';
    byId('raven-inbox-close').before(compose);
    compose.onclick=async()=>{
      const list=byId('raven-inbox-list');list.innerHTML='<div class="raven-inbox-empty">Loading Raven friends…</div>';
      const owner=currentUser?.id;if(!owner)return;
      try {
        const {data:edges,error}=await db.from('raven_friends').select('user_id,friend_id').eq('status','accepted').or('user_id.eq.'+owner+',friend_id.eq.'+owner);
        if(error)throw error;
        const ids=[...new Set((edges||[]).map(f=>f.user_id===owner?f.friend_id:f.user_id))];
        const {data:friends,error:lookupError}=ids.length?await db.from('profiles').select('id,first_name,last_name,raven_id,avatar_url').in('id',ids):{data:[]};
        if(lookupError)throw lookupError;if(currentUser?.id!==owner)return;
        list.replaceChildren();
        const title=document.createElement('p');title.className='rm-muted';title.textContent='Start a DM with a Raven friend';list.append(title);
        for(const friend of friends||[]) {
          const button=document.createElement('button');button.type='button';button.className='raven-inbox-row';
          const text=document.createElement('span');text.className='raven-inbox-copy';
          const name=document.createElement('strong');name.textContent=[friend.first_name,friend.last_name].filter(Boolean).join(' ')||'Raven friend';
          const id=document.createElement('small');id.textContent=friend.raven_id?'@'+friend.raven_id:'';text.append(name,id);button.append(text);
          button.onclick=()=>{byId('raven-inbox').close();openDirectMessage(friend.id,name.textContent,friend)};list.append(button);
        }
        if(!friends?.length){const empty=document.createElement('p');empty.className='raven-inbox-empty';empty.textContent='No Raven friends yet. Add a friend and wait for them to accept to start a chat.';list.append(empty)}
      }catch{list.innerHTML='<div class="raven-inbox-empty">Could not load friends. Tap + to retry.</div>'}
    };
    byId('raven-inbox-close').onclick=()=>byId('raven-inbox').close();
    byId('raven-inbox').addEventListener('click',e=>{if(e.target===byId('raven-inbox')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
    document.querySelectorAll('[data-inbox-tab]').forEach(button=>button.onclick=()=>{inboxTab=button.dataset.inboxTab;renderInbox()});
  }
  function readNotificationIds() {
    try {const ids=JSON.parse(localStorage.getItem('rr_'+(currentUser?.id||'u'))||'[]');return Array.isArray(ids)?ids:[]}catch{return []}
  }
  function updateInboxBadge() {
    const badge=byId('raven-inbox-count');if(!badge)return;
    const read=new Set(readNotificationIds());
    const count=Object.values(_dmUnreadMap||{}).reduce((s,n)=>s+Number(n||0),0)+notifications.filter(n=>n.unread&&!read.has(n.id)).length+Number(window.ravenGroupUnreadCount||0);
    badge.hidden=count===0;badge.textContent=count>99?'99+':String(count);
    byId('raven-inbox-open').setAttribute('aria-label','Open inbox: '+count+' unread messages and notifications');
  }
  async function refreshInbox(showLoading=false) {
    if(!overviewHeader||inboxBusy)return;
    const owner=currentUser?.id;
    if(inboxOwner!==owner){inboxOwner=owner;conversations=[];notifications=[];const badge=byId('raven-inbox-count');badge.hidden=true}
    if(!owner){if(byId('raven-inbox').open)byId('raven-inbox-list').innerHTML='<div class="raven-inbox-empty">Sign in to see your inbox.</div>';return}
    inboxBusy=true;
    if(showLoading)byId('raven-inbox-list').innerHTML='<div class="raven-inbox-empty">Loading your inbox…</div>';
    try {
      await loadUnreadDMCounts();
      const nextNotifications=await buildNotifications();
      if(currentUser?.id!==owner)return;
      notifications=nextNotifications;
      // Only load private message previews when the user opens the inbox.
      if(byId('raven-inbox').open){
        const {data:messages,error}=await db.from('direct_messages').select('id,sender_id,receiver_id,body,created_at,read_at').or('sender_id.eq.'+owner+',receiver_id.eq.'+owner).order('created_at',{ascending:false}).limit(200);
        if(error)throw error;
        const latest=new Map();
        for(const m of messages||[]){const peer=m.sender_id===owner?m.receiver_id:m.sender_id;if(peer&&!latest.has(peer))latest.set(peer,m)}
        const ids=[...latest.keys()];
        const {data:profiles,error:profileError}=ids.length?await db.from('profiles').select('id,first_name,last_name,raven_id').in('id',ids):{data:[],error:null};
        if(profileError)throw profileError;
        if(currentUser?.id!==owner)return;
        conversations=ids.map(id=>({id,message:latest.get(id),profile:(profiles||[]).find(p=>p.id===id)||{id}}));
      }
      updateInboxBadge();if(byId('raven-inbox').open)renderInbox();
    } catch(error){if(byId('raven-inbox').open)byId('raven-inbox-list').innerHTML='<div class="raven-inbox-empty">Could not refresh your inbox. Close and reopen to retry.</div>'}
    finally{inboxBusy=false}
  }
  function renderInbox() {
    // Notify the group list after the existing DM/notification rows render.
    setTimeout(()=>window.dispatchEvent(new Event('raven-inbox-rendered')),0);
    const list=byId('raven-inbox-list');if(!list)return;
    const read=new Set(readNotificationIds());
    document.querySelectorAll('[data-inbox-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.inboxTab===inboxTab)));
    if(inboxTab==='messages') {
      list.innerHTML=conversations.map((c,index)=>{
        const name=[c.profile.first_name,c.profile.last_name].filter(Boolean).join(' ')|| (c.profile.raven_id?'@'+c.profile.raven_id:'Raven member');
        const unread=Number(_dmUnreadMap[c.id]||0);
        return '<button type="button" class="raven-inbox-row '+(unread?'unread':'')+'" data-conversation="'+index+'"><span class="raven-inbox-avatar">'+safe(name[0])+'</span><span class="raven-inbox-copy"><strong>'+safe(name)+(unread?' · '+unread+' unread':'')+'</strong><small>'+safe(c.profile.raven_id?'@'+c.profile.raven_id:'')+'</small><small>'+safe(/^\[RAVEN_PHOTO:/.test(c.message.body||'')?'Photo':(c.message.body||'Message'))+'</small></span><time>'+safe(formatTimeAgo(c.message.created_at))+'</time></button>';
      }).join('')||'<div class="raven-inbox-empty">No conversations yet.<br>Message a friend to start one.</div>';
      list.querySelectorAll('[data-conversation]').forEach(button=>button.onclick=()=>{const c=conversations[Number(button.dataset.conversation)];byId('raven-inbox').close();openDirectMessage(c.id,c.profile.first_name||c.profile.raven_id||'Raven member',c.profile)});
    } else {
      list.innerHTML=notifications.map((n,index)=>'<button type="button" class="raven-inbox-row '+(n.unread&&!read.has(n.id)?'unread':'')+'" data-inbox-notification="'+index+'"><span class="raven-inbox-avatar" aria-hidden="true">'+(n.type==='friend'?'+':'•')+'</span><span class="raven-inbox-copy"><strong>'+safe(n.title)+'</strong><small>'+safe(n.sub)+'</small></span><time>'+safe(formatTimeAgo(n.time))+'</time></button>').join('')||'<div class="raven-inbox-empty">All caught up.<br>Bill updates and friend requests will land here.</div>';
      list.querySelectorAll('[data-inbox-notification]').forEach(button=>button.onclick=()=>{
        const n=notifications[Number(button.dataset.inboxNotification)];
        try{localStorage.setItem('rr_'+currentUser.id,JSON.stringify([...new Set([...readNotificationIds(),n.id])].slice(-200)))}catch{}
        n.unread=false;const existing=_allNotifs.find(item=>item.id===n.id);if(existing)existing.unread=false;
        updateInboxBadge();updateNotifBadge();byId('raven-inbox').close();if(n.action)n.action();
      });
    }
  }
  window.addEventListener('raven-group-unread',updateInboxBadge);
  for(const name of ['updateDMBadges','updateNotifBadge']) {
    const previous=window[name];if(typeof previous==='function')window[name]=function(...args){const result=previous.apply(this,args);updateInboxBadge();return result};
  }

  window.addEventListener('raven-inbox-show-groups',()=>window.dispatchEvent(new Event('raven-inbox-rendered')));
  function moneySnapshot(data, now=new Date()) {
    const pad=n=>String(n).padStart(2,'0');
    const current=now.getFullYear()+'-'+pad(now.getMonth()+1);
    const today=current+'-'+pad(now.getDate());
    const amount=rows=>rows.reduce((sum,row)=>sum+(Number(row.amount)||0),0);
    const bills=(data.bills||[]).filter(b=>String(b.dueDate||'').slice(0,7)===current);
    const income=amount((data.paychecks||[]).filter(p=>String(p.date||'').slice(0,7)===current));
    const investing=amount((data.investments||[]).filter(p=>String(p.date||'').slice(0,7)===current));
    const trend=Array.from({length:6},(_,index)=>{const date=new Date(now.getFullYear(),now.getMonth()-5+index,1);const key=date.getFullYear()+'-'+pad(date.getMonth()+1);return {label:date.toLocaleDateString('en-US',{month:'short'}),income:amount((data.paychecks||[]).filter(p=>String(p.date||'').slice(0,7)===key)),bills:amount((data.bills||[]).filter(p=>String(p.dueDate||'').slice(0,7)===key))}});
    const upcoming=(data.bills||[]).filter(b=>!b.paidDate&&b.dueDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,4);
    const recurring=(data.bills||[]).filter(b=>b.seriesId&&b.frequency&&b.frequency!=='one-time'&&b.dueDate>=today).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    const unique=[...new Map(recurring.slice().reverse().map(b=>[b.seriesId,b])).values()].sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    return {current,today,income,investing,billsTotal:amount(bills),remainder:income-amount(bills)-investing,trend,upcoming,recurring:unique};
  }
  const hub=document.createElement('section');hub.id='raven-money-hub';hub.setAttribute('aria-label','Your money overview');
  document.querySelector('#page-lifestyle .flight-deck')?.before(hub);
  function settingsKey(){return currentUser?.id?'raven_money_plan_v1:'+currentUser.id:null}
  function readPlan(){try{const key=settingsKey();return key?JSON.parse(localStorage.getItem(key)||'{}'):{} }catch{return {}}}
  function renderMoneyHub(force=false) {
    if(!hub.isConnected)return;
    if(!force && byId('raven-money-plan')?.contains(document.activeElement))return;
    const s=moneySnapshot(DATA),plan=readPlan();
    const cap=Math.max(0,Number(plan.budget)||0),target=Math.max(0,Number(plan.target)||0),saved=Math.max(0,Number(plan.saved)||0);
    const month=new Date(s.current+'-01T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'});
    const max=Math.max(1,...s.trend.flatMap(m=>[m.income,m.bills]));
    const items=(rows,recurring)=>rows.map(b=>'<div class="rm-item"><div><strong>'+safe(b.name||'Bill')+'</strong><small>'+safe(recurring?((FREQ_LABELS[b.frequency]||'Recurring')+' · Next '+b.dueDate):(b.dueDate<s.today?'Overdue · '+b.dueDate:'Due '+b.dueDate))+'</small></div><b>'+money(b.amount)+'</b></div>').join('');
    hub.innerHTML='<div class="rm-hero"><div class="rm-eyebrow"><span>YOUR MONEY, IN FLIGHT</span><span>'+safe(month)+'</span></div><h2>A clearer view. More room to fly.</h2><div class="rm-muted">Planned monthly remainder</div><div class="rm-balance '+(s.remainder<0?'rm-negative':'')+'">'+(s.income?money(s.remainder):'—')+'</div><div class="rm-muted">'+(s.income?'Tracked income minus bills and investments. This is not your bank balance.':'Add income to see how your monthly plan balances.')+'</div><div class="rm-cashflow"><div><span>Income tracked</span><strong>'+money(s.income)+'</strong></div><div><span>Bills planned</span><strong>'+money(s.billsTotal)+'</strong></div><div><span>Investments logged</span><strong>'+money(s.investing)+'</strong></div></div><div class="rm-actions"><button type="button" data-money-add="paycheck">+ Income</button><button type="button" data-money-add="bill">+ Bill / subscription</button><button type="button" data-money-add="investment">+ Investment</button></div></div>'+
      '<div class="rm-grid"><article class="rm-card"><h3>Your money rhythm</h3><div class="rm-muted">Six months of tracked income and planned bills</div><div class="rm-trend" role="img" aria-label="'+safe(s.trend.map(m=>m.label+': income '+money(m.income)+', bills '+money(m.bills)).join('; '))+'">'+s.trend.map(m=>'<div class="rm-month"><div class="rm-columns"><span class="rm-bar income" style="height:'+Math.max(2,m.income/max*100)+'%"></span><span class="rm-bar" style="height:'+Math.max(2,m.bills/max*100)+'%"></span></div><small>'+m.label+'</small></div>').join('')+'</div><div class="rm-legend"><span><i></i>Income</span><span><i class="bills"></i>Bills</span></div></article>'+
      '<article class="rm-card"><h3>Landing next</h3><div class="rm-muted">Unpaid bills, with overdue items first</div>'+ (items(s.upcoming,false)||'<div class="rm-empty">Nothing waiting in the wings.<br>Add a bill to track its next due date.</div>')+'</article>'+
      '<article class="rm-card"><h3>Recurring watch</h3><div class="rm-muted">Subscriptions and repeating bills you track</div>'+ (items(s.recurring.slice(0,4),true)||'<div class="rm-empty">Keep small charges from going unnoticed. Add a bill and choose a repeat schedule.</div>')+'<button type="button" data-money-review>Review all bills</button></article>'+
      '<article class="rm-card"><h3>Build your nest</h3><div class="rm-muted">A personal target, at your own pace</div><div class="rm-balance" style="font-size:30px">'+money(saved)+' <span class="rm-muted">of '+money(target)+'</span></div><div class="rm-progress"><span style="width:'+(target?Math.min(100,saved/target*100):0)+'%"></span></div><div class="rm-muted">'+(cap?money(Math.max(0,cap-s.billsTotal))+' left in your monthly bill budget'+(s.billsTotal>cap?' · '+money(s.billsTotal-cap)+' over budget':''):'Set a monthly bill budget and savings target below.')+'</div><form id="raven-money-plan"><label>Monthly bill budget ($)<input name="budget" type="number" min="0" max="1000000000" step="0.01" value="'+cap+'" required></label><label>Savings target ($)<input name="target" type="number" min="0" max="1000000000" step="0.01" value="'+target+'" required></label><label>Amount you have saved ($)<input name="saved" type="number" min="0" max="1000000000" step="0.01" value="'+saved+'" required></label><button type="submit">Save my plan</button><output id="raven-money-plan-status" aria-live="polite"></output></form><div class="rm-muted" style="margin-top:10px">Plan settings are saved on this device for your account. No money is moved.</div></article></div><p class="rm-disclosure">Based only on entries you add to Lifestyle. Recurring watch does not detect or cancel bank subscriptions. Your Raven Score, medals, trackers, and coaching remain below.</p>';
    hub.querySelectorAll('[data-money-add]').forEach(button=>button.onclick=()=>openModal(button.dataset.moneyAdd));
    hub.querySelector('[data-money-review]').onclick=()=>{switchTab('bills');byId('panel-bills')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})};
    byId('raven-money-plan').onsubmit=event=>{
      event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
      const values=Object.fromEntries(['budget','target','saved'].map(name=>[name,Number(form.elements[name].value)]));
      if(Object.values(values).some(n=>!Number.isFinite(n)||n<0))return;
      const key=settingsKey();if(!key){byId('raven-money-plan-status').textContent='Sign in to save your plan.';return}
      try{localStorage.setItem(key,JSON.stringify(values));renderMoneyHub(true);byId('raven-money-plan-status').textContent='Saved for your account on this device.'}catch{byId('raven-money-plan-status').textContent='Could not save. Please try again.'}
    };
  }
  const oldRender=window.renderAll;
  if(typeof oldRender==='function')window.renderAll=function(...args){const result=oldRender.apply(this,args);renderMoneyHub();return result};
  const oldShow=window.showPage;
  if(typeof oldShow==='function')window.showPage=function(...args){const result=oldShow.apply(this,args);if(args[0]==='overview')void refreshInbox();if(args[0]==='lifestyle')renderMoneyHub();return result};
  renderMoneyHub();void refreshInbox();
  setInterval(()=>{if(!document.hidden&&(byId('page-overview')?.classList.contains('active')||byId('raven-inbox')?.open))void refreshInbox()},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshInbox()});
  // Pure calculation exported for fixture-based regression tests.
  window.ravenMoneySnapshot=moneySnapshot;
})();
