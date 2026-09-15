(() => {
  'use strict';
  const polish=document.createElement('link');polish.rel='stylesheet';polish.href='raven-chat-polish.css?v=20260915-1';document.head.append(polish);
  const $=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
  const nameOf=p=>[p.first_name,p.last_name].filter(Boolean).join(' ')||('@'+(p.raven_id||'member'));
  let group=null,messages=[],members=[],photos=[],groupOffset=0,groupMore=false,loading=false,groupEpoch=0,groups=[],groupOwner=null;
  async function api(path,body,method) {
    const {data:{session}}=await db.auth.getSession();if(!session?.access_token)throw Error('Please sign in again.');
    const response=await fetch(BACKEND+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'Could not load chat.');return data;
  }
  const style=el('style');style.textContent=`.rc-dialog{position:fixed;inset:0;margin:auto;width:min(560px,calc(100% - 20px));max-height:88dvh;border:1px solid #393044;border-radius:22px;background:#101018;color:#f0eef8;padding:0;overflow:hidden}.rc-dialog::backdrop{background:#030308bf;backdrop-filter:blur(8px)}.rc-head{display:flex;align-items:center;gap:8px;padding:16px;border-bottom:1px solid #ffffff12}.rc-head h2{flex:1;min-width:0;font:22px 'Bebas Neue',sans-serif;margin:0;overflow-wrap:anywhere}.rc-dialog button{cursor:pointer;background:#7c3aed24;color:#dcc0ff;border:1px solid #a855f744;border-radius:10px;padding:10px;min-height:42px;font:600 12px inherit}.rc-dialog button:disabled{opacity:.5;cursor:wait}.rc-dialog button:focus-visible{outline:2px solid #30D158;outline-offset:2px}.rc-body{overflow:auto;max-height:60dvh;padding:16px}.rc-dialog input,.rc-dialog textarea{box-sizing:border-box;width:100%;min-width:0;padding:12px;background:#08080f;border:1px solid #ffffff25;border-radius:10px;color:inherit;font:16px inherit}.rc-status{font-size:12px;color:#9896a8;padding:8px 16px;line-height:1.5}.rc-person{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #ffffff10}.rc-person input{width:20px}.rc-person span{font-size:13px}.rc-person small{display:block;color:#c084fc;margin-top:4px}.rc-composer{display:flex;gap:8px;align-items:center;padding:12px;border-top:1px solid #ffffff12}.rc-composer textarea{flex:1;resize:none}.rc-message{max-width:85%;padding:11px 13px;border-radius:14px;background:#1c1828;margin:10px auto 10px 0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.6}.rc-message.mine{margin-left:auto;margin-right:0;background:#163024}.rc-message small{display:block;color:#aaa0b9;font-size:10px}.rc-message img{display:block;max-width:100%;max-height:280px;border-radius:10px}.rc-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rc-gallery img{width:100%;height:150px;object-fit:cover;border-radius:10px}.rc-gallery a{color:#c084fc;font-size:10px;overflow:hidden}.rc-gallery time{display:block;padding:5px}.rc-actions{display:flex;gap:8px;margin:10px 0}.rc-group-list{border-bottom:1px solid #ffffff16;padding-bottom:10px;margin-bottom:12px}.rc-group-list button{width:100%;text-align:left}.rc-group-list small{display:block;color:#9896a8;font-size:11px}.rc-dm-tools{display:flex;gap:8px;padding:8px 14px}.rc-dm-tools button{background:#7c3aed24;border:1px solid #a855f744;color:#c084fc;border-radius:8px;min-height:38px;padding:8px 12px}.rc-photo-inline img{max-width:180px;max-height:200px;border-radius:12px}.rc-photo-inline{padding:6px 10px;color:#c084fc;font-size:11px}@media(max-width:420px){.rc-head{gap:6px;padding:12px}.rc-head button{padding:8px;font-size:11px}.rc-head h2{font-size:19px}}`;document.head.append(style);
  function dialog(id,title){const d=el('dialog',undefined,'rc-dialog');d.id=id;const h=el('div',undefined,'rc-head'),t=el('h2',title);t.id=id+'-title';d.setAttribute('aria-labelledby',t.id);h.append(t);const close=el('button','×');close.type='button';close.setAttribute('aria-label','Close');close.onclick=()=>d.close();h.append(close);d.append(h);document.body.append(d);return d;}
  const composer=dialog('rc-new','New chat'),picker=el('div',undefined,'rc-body');composer.append(picker);
  const chat=dialog('rc-chat','Group chat'),status=el('div','', 'rc-status'),history=el('div',undefined,'rc-body');history.id='rc-history';history.setAttribute('aria-live','polite');
  const rename=el('button','Rename group'),gallery=el('button','⋯');gallery.setAttribute('aria-label','Group details and shared media');gallery.title='Shared media and group details';chat.querySelector('.rc-head').insertBefore(gallery,chat.querySelector('.rc-head button'));
  const older=el('button','Load older messages');older.hidden=true;older.style.margin='10px 16px';chat.append(status,older,history);
  const form=el('form',undefined,'rc-composer'),photo=el('button','+ Photo'),input=el('textarea');photo.type='button';input.rows=1;input.maxLength=10000;input.placeholder='Message the group';input.setAttribute('aria-label','Group message');const send=el('button','Send');send.type='submit';form.append(photo,input,send);chat.append(form);
  send.textContent='↑';send.setAttribute('aria-label','Send');send.title='Send message';
  input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(110,input.scrollHeight)+'px'});
  chat.addEventListener('close',()=>{groupEpoch++;group=null;messages=[];photos=[];input.value='';void loadGroups()});
  async function startChat() {
    $('raven-inbox')?.close();picker.textContent='Loading your friends…';composer.showModal();const owner=currentUser?.id;
    try{
      const data=await api('/chats/friends');if(currentUser?.id!==owner){composer.close();return}picker.replaceChildren();
      const mode=el('div',undefined,'rc-actions'),dm=el('button','Direct message'),groupButton=el('button','Group chat'),title=el('input');dm.type=groupButton.type='button';title.placeholder='Group name';title.maxLength=80;title.setAttribute('aria-label','Group name');title.hidden=true;mode.append(dm,groupButton);picker.append(mode,title);
      const list=el('div'),submit=el('button','Create group'),error=el('p','', 'rc-status');submit.type='button';submit.hidden=true;picker.append(list,error,submit);let groupMode=false;const chosen=new Set();
      function render(){list.replaceChildren();title.hidden=!groupMode;submit.hidden=!groupMode;dm.setAttribute('aria-pressed',String(!groupMode));groupButton.setAttribute('aria-pressed',String(groupMode));
        for(const friend of data.friends||[]){const row=el(groupMode?'label':'button',undefined,'rc-person');if(!groupMode){row.type='button';row.style.width='100%';row.onclick=()=>{composer.close();openDirectMessage(friend.id,nameOf(friend),friend)}}else{const check=el('input');check.type='checkbox';check.checked=chosen.has(friend.id);check.onchange=()=>check.checked?chosen.add(friend.id):chosen.delete(friend.id);row.append(check)}const text=el('span',nameOf(friend));text.append(el('small','@'+(friend.raven_id||'')));row.append(text);list.append(row)}
        if(!data.friends?.length)list.append(el('p','Add a Raven friend and wait for acceptance to start chatting.','rc-status'));
      }
      dm.onclick=()=>{groupMode=false;render()};groupButton.onclick=()=>{groupMode=true;render()};render();
      submit.onclick=async()=>{if(!title.value.trim()||chosen.size<2){error.textContent='Name the group and select at least two friends.';return}submit.disabled=true;error.textContent='Creating…';try{const result=await api('/chats',{name:title.value.trim(),members:[...chosen]});composer.close();openGroup(result.chat)}catch(e){error.textContent=e.message}finally{submit.disabled=false}};
    }catch(e){picker.textContent=e.message}
  }
  if($('raven-inbox-compose'))$('raven-inbox-compose').onclick=startChat;
  let groupsAccount=null,groupsPending=null,groupsUpdated=0,groupsPage={},groupsError=false;
  async function prepareGroups(offset=0,force=false) {
    const owner=currentUser?.id;
    if(groupsAccount!==owner){groupsAccount=owner;groups=[];groupsPending=null;groupsUpdated=0;groupsPage={};groupsError=false}
    if(!owner)return;
    if(!offset&&groupsPending)return groupsPending;
    if(!offset&&!force&&Date.now()-groupsUpdated<10000)return;
    const request=(async()=>{
      try{const data=await api('/chats?offset='+offset);if(currentUser?.id!==owner||groupsAccount!==owner)return;
        groups=offset?[...groups,...data.chats]:data.chats;groupsPage=data;groupsUpdated=Date.now();groupsError=false;
        window.ravenGroupUnreadCount=groups.filter(g=>g.unread).length;window.dispatchEvent(new Event('raven-group-unread'));
      }catch(e){if(groupsAccount===owner)groupsError=true}
    })();
    if(!offset)groupsPending=request;
    await request;if(groupsPending===request)groupsPending=null;
  }
  function renderGroups() {
    const list=$('raven-inbox-list');
    if(groupsAccount!==currentUser?.id||!list||!$('raven-inbox')?.open||list.getAttribute('aria-busy')==='true'||document.querySelector('[data-inbox-tab="notifications"]')?.getAttribute('aria-pressed')==='true')return;
    list.querySelector('.rc-group-list')?.remove();const box=el('div',undefined,'rc-group-list');box.append(el('p','Group chats','rm-muted'));
    for(const g of groups){const b=el('button',undefined,'raven-inbox-row');b.type='button';const avatar=el('span',g.name.charAt(0).toUpperCase(),'raven-inbox-avatar');if(g.photo_url){const img=el('img');img.src=g.photo_url;img.alt='';img.onerror=()=>img.remove();avatar.append(img)}const text=el('span',g.name+(g.unread?' · New':''));text.append(el('small',g.last_message?.body||'Start the conversation'));b.append(avatar,text);b.onclick=()=>openGroup(g);box.append(b)}
    if(!groups.length)box.append(el('p',groupsError?'Group chats are temporarily unavailable.':'Tap + to start a group.','rm-muted'));
    if(groupsPage.hasMore){const more=el('button','Load more groups');more.onclick=()=>loadGroups(groupsPage.nextOffset);box.append(more)}list.prepend(box);
  }
  async function loadGroups(offset=0){await prepareGroups(offset,true);renderGroups()}
  window.ravenPrepareGroups=prepareGroups;
  window.ravenRenderGroups=renderGroups;
  window.addEventListener('raven-inbox-rendered',()=>void loadGroups());
  function openGroup(value){$('raven-inbox')?.close();group=value;groupOwner=currentUser?.id;groupEpoch++;messages=[];photos=[];members=[];groupOffset=0;history.replaceChildren();status.textContent='';chat.setAttribute('aria-busy','true');for(let i=0;i<3;i++){const s=el('div',undefined,'rc-skeleton');s.setAttribute('aria-hidden','true');history.append(s)}chat.classList.remove('rc-enter');void chat.offsetWidth;chat.classList.add('rc-enter');$('rc-chat-title').textContent=value.name;groupPhoto.hidden=true;chat.classList.remove('has-photo');chat.showModal();void refreshGroup(false);void updateGroupPhoto(value.id);}
  async function refreshGroup(loadOlder=false){
    if(groupOwner!==currentUser?.id){history.replaceChildren();chat.close();return;}
    if(!group||loading)return;const id=group.id,epoch=groupEpoch,owner=currentUser?.id;loading=true;
    try{const data=await api('/chats/'+id+'/messages?offset='+(loadOlder?groupOffset:0));if(group?.id!==id||epoch!==groupEpoch||owner!==currentUser?.id)return;
      const pinned=history.scrollHeight-history.scrollTop-history.clientHeight<50;members=data.members;group.name=data.chat.name;$('rc-chat-title').textContent=group.name;
      messages=[...new Map([...messages,...data.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
      if(loadOlder||!groupOffset){groupOffset=data.nextOffset;groupMore=data.hasMore}older.hidden=!groupMore;
      const media=await api('/chats/'+id+'/media');if(group?.id!==id||epoch!==groupEpoch||owner!==currentUser?.id)return;photos=media.media;
      chat.setAttribute('aria-busy','false');renderGroup();status.textContent=members.length+' members · '+members.map(nameOf).join(', ');
      if(!loadOlder&&pinned)history.scrollTop=history.scrollHeight;
      const latest=messages.at(-1);if(latest)await api('/chats/'+id+'/read',{at:latest.created_at});
    }catch(e){status.textContent=e.message}finally{loading=false}
  }
  function renderGroup(){history.replaceChildren();let day='';for(const m of messages){const date=new Date(m.created_at),nextDay=date.toLocaleDateString(undefined,{month:'short',day:'numeric'});if(nextDay!==day){history.append(el('div',nextDay,'rc-day'));day=nextDay}const mine=m.sender_id===currentUser?.id,name=nameOf(members.find(p=>p.id===m.sender_id)||{});const row=el('div',undefined,'rc-message'+(mine?' mine':''));row.dataset.initial=name.charAt(0).toUpperCase();const sender=el('div',name,'rc-sender'),profile=members.find(p=>p.id===m.sender_id);if(profile?.avatar_url&&/^(https:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(profile.avatar_url)){const avatar=el('img');avatar.src=profile.avatar_url;avatar.alt='';avatar.onerror=()=>avatar.remove();sender.prepend(avatar)}row.append(sender);const attachment=photos.find(p=>p.message_id===m.id);if(attachment){const img=el('img');img.src=attachment.url;img.alt='Photo shared in this chat';img.loading='lazy';row.append(img)}else row.append(el('div',m.body));row.append(el('small',date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})));history.append(row)}if(!messages.length)history.append(el('p','Your group is ready. Send the first message.','rc-status'));}
  older.onclick=()=>refreshGroup(true);
  form.onsubmit=async e=>{e.preventDefault();const body=input.value.trim();if(!body||!group)return;const id=group.id;send.disabled=true;try{await api('/chats/'+id+'/messages',{body});if(group?.id===id){input.value='';await refreshGroup();history.scrollTop=history.scrollHeight}}catch(error){status.textContent=error.message}finally{send.disabled=false}};
  rename.onclick=async()=>{if(!group)return;const id=group.id,name=prompt('Rename this group',group.name);if(name===null)return;try{const data=await api('/chats/'+id,{name},'PATCH');if(group?.id===id){group.name=data.chat.name;$('rc-chat-title').textContent=data.chat.name}}catch(e){status.textContent=e.message}};
  const mediaDialog=dialog('rc-media','Shared media'),mediaBody=el('div',undefined,'rc-body');mediaDialog.append(mediaBody);mediaDialog.querySelector('.rc-head').insertBefore(rename,mediaDialog.querySelector('.rc-head button'));
  async function showPhotos(path){mediaBody.replaceChildren();mediaDialog.showModal();const grid=el('div',undefined,'rc-gallery'),note=el('p','Loading…','rc-status'),more=el('button','Load more photos');more.type='button';more.hidden=true;mediaBody.append(note,grid,more);let offset=0;const owner=currentUser?.id;
    const load=async()=>{more.disabled=true;try{const data=await api(path+'?offset='+offset);let combined=[...data.media],hasMore=data.hasMore;const peer=path.match(/^\/chat-dms\/([^/]+)\/media$/)?.[1];if(peer){const {data:gifs,error}=await db.from('direct_messages').select('id,gif_url,created_at').or('and(sender_id.eq.'+owner+',receiver_id.eq.'+peer+'),and(sender_id.eq.'+peer+',receiver_id.eq.'+owner+')').not('gif_url','is',null).order('created_at',{ascending:false}).range(offset,offset+50);if(error)throw error;combined.push(...(gifs||[]).slice(0,50).filter(g=>/^https:\/\//i.test(g.gif_url)).map(g=>({...g,url:g.gif_url})));hasMore=hasMore||(gifs||[]).length>50;}if(currentUser?.id!==owner){mediaDialog.close();return}combined.sort((a,b)=>b.created_at.localeCompare(a.created_at));for(const p of combined){const a=el('a');a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';const img=el('img');img.src=p.url;img.alt='Shared media';img.loading='lazy';a.append(img,el('time',new Date(p.created_at).toLocaleDateString()));grid.append(a)}offset=data.nextOffset;more.hidden=!hasMore;more.textContent='Load more media';note.textContent=grid.children.length?'Photos and GIFs shared in this conversation. Scroll to browse.':'No shared media yet.'}catch(e){note.textContent=e.message}finally{more.disabled=false}};more.onclick=load;await load();
  }
  const settings=dialog('rc-settings','Group details'),settingsBody=el('div',undefined,'rc-body');settings.append(settingsBody);
  const groupPhoto=el('img');groupPhoto.alt='Group photo';groupPhoto.style.cssText='width:44px;height:44px;border-radius:15px;object-fit:cover;flex-shrink:0';groupPhoto.hidden=true;chat.querySelector('.rc-head').prepend(groupPhoto);
  const photoStyle=el('style');photoStyle.textContent='#rc-chat.has-photo .rc-head::before{display:none}.rc-member-controls{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}#rc-settings .rc-person{display:block}#rc-settings .rc-person img{width:32px;height:32px;border-radius:50%;object-fit:cover;float:left;margin-right:10px}';document.head.append(photoStyle);
  async function updateGroupPhoto(id){try{const data=await api('/chats/'+id+'/details');if(group?.id!==id)return;groupPhoto.hidden=!data.chat.photo_url;chat.classList.toggle('has-photo',!!data.chat.photo_url);if(data.chat.photo_url)groupPhoto.src=data.chat.photo_url;}catch{groupPhoto.hidden=true;chat.classList.remove('has-photo')}}
  async function showSettings(){if(!group)return;const id=group.id;settingsBody.textContent='Loading group details…';if(!settings.open)settings.showModal();
    try{const data=await api('/chats/'+id+'/details');if(group?.id!==id){settings.close();return}settingsBody.replaceChildren();const note=el('p','', 'rc-status');
      const actions=el('div',undefined,'rc-member-controls'),media=el('button','Shared media');media.onclick=()=>{settings.close();rename.hidden=true;showPhotos('/chats/'+id+'/media')};actions.append(media);
      async function manage(action,target,role){try{await api('/chats/'+id+'/manage',{action,target,role});if(action==='leave'){settings.close();chat.close();return}await showSettings();await refreshGroup()}catch(e){note.textContent=e.message}}
      if(data.can_manage){const renameButton=el('button','Rename'),photoButton=el('button','Change group photo'),add=el('button','Add members');
        renameButton.onclick=async()=>{const name=prompt('Group name',data.chat.name);if(name===null)return;try{await api('/chats/'+id,{name},'PATCH');await refreshGroup();await showSettings()}catch(e){note.textContent=e.message}};
        photoButton.onclick=()=>choosePhoto('/chats/'+id+'/photo',async()=>{await updateGroupPhoto(id);await showSettings()},message=>note.textContent=message);
        add.onclick=async()=>{try{const result=await api('/chats/friends');const list=el('div');const eligible=result.friends.filter(f=>!data.members.some(m=>m.id===f.id));if(!eligible.length)list.append(el('p','All your Raven friends are already in this group.'));for(const f of eligible){const b=el('button',undefined,'rc-add-member');b.type='button';b.setAttribute('aria-label','Add '+nameOf(f));const avatar=el('span',nameOf(f).charAt(0).toUpperCase(),'rc-member-avatar');if(f.avatar_url&&/^(https:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(f.avatar_url)){const img=el('img');img.src=f.avatar_url;img.alt='';img.onerror=()=>img.remove();avatar.append(img)}const copy=el('span',undefined,'rc-member-copy');copy.append(el('strong',nameOf(f)),el('small',f.raven_id?'@'+f.raven_id:'Raven member'));const plus=el('span','+','rc-member-plus');plus.setAttribute('aria-hidden','true');b.append(avatar,copy,plus);b.onclick=()=>manage('add',f.id);list.append(b)}add.disabled=true;actions.after(list)}catch(e){note.textContent=e.message}};actions.append(renameButton,photoButton,add);
      }
      settingsBody.append(actions,note,el('h3','Members'));
      for(const p of data.members){const row=el('div',undefined,'rc-person'),label=el('span',nameOf(p)+(p.id===currentUser?.id?' · You':''));label.append(el('small','@'+(p.raven_id||'member')+' · '+p.role));row.append(label);
        if(data.can_manage){const controls=el('div',undefined,'rc-member-controls'),role=el('button',p.role==='admin'?'Remove admin':'Make admin');role.onclick=()=>{if(confirm('Change '+nameOf(p)+'’s admin role?'))manage('role',p.id,p.role==='admin'?'member':'admin')};controls.append(role);if(p.id!==currentUser?.id){const remove=el('button','Remove member');remove.onclick=()=>{if(confirm('Remove '+nameOf(p)+' from this group?'))manage('remove',p.id)};controls.append(remove)}row.append(controls)}settingsBody.append(row);
      }
      const leave=el('button','Leave group');leave.style.cssText='color:#ff8585;border-color:#ff555544;width:100%;margin-top:20px';leave.onclick=()=>{if(confirm('Leave this group? You will no longer have access to its messages or media.'))manage('leave')};settingsBody.append(leave);await updateGroupPhoto(id);
    }catch(e){settingsBody.textContent='Group controls need the one-time database setup, or the service is temporarily unavailable. '+e.message;const media=el('button','Shared media');media.onclick=()=>{settings.close();rename.hidden=true;showPhotos('/chats/'+id+'/media')};settingsBody.append(media)}
  }
  gallery.onclick=showSettings;
  const file=el('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.hidden=true;document.body.append(file);let uploadTarget=null;
  function choosePhoto(path,after,onError){uploadTarget={path,after,onError};file.value='';file.click()}
  file.onchange=async()=>{const selected=file.files[0],target=uploadTarget;if(!selected||!target)return;if(selected.size>6291456){target.onError('Choose a JPEG, PNG, or WebP photo under 6 MB.');return}photo.disabled=true;
    try{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(selected)});await api(target.path,{data_url:dataUrl});await target.after()}catch(e){target.onError(e.message||'Could not send this photo.')}finally{photo.disabled=false}
  };
  photo.onclick=()=>{if(group){const id=group.id;choosePhoto('/chats/'+id+'/media',()=>group?.id===id&&refreshGroup(),message=>status.textContent=message)}};
  const oldDM=window.openDirectMessage;
  let dmProfiles=new Map();
  function decorateDM(){const wraps=Array.from($('dm-messages')?.children||[]).filter(n=>n.style.display==='flex');wraps.forEach((wrap,index)=>{const m=_dmMessages[index];if(!m||wrap.querySelector('.rc-dm-sender'))return;const p=dmProfiles.get(m.sender_id),name=p?nameOf(p):(m.sender_id===currentUser?.id?'You':_dmFriendName||'Raven member');const bubble=wrap.firstElementChild;if(!bubble)return;const label=el('div',name,'rc-dm-sender');label.style.cssText='font-size:11px;font-weight:600;color:#d4c6e3;margin-bottom:6px';bubble.prepend(label);const avatar=el('span',name.charAt(0).toUpperCase());avatar.style.cssText='width:28px;height:28px;flex-shrink:0;border-radius:50%;overflow:hidden;background:#352547;color:#d8b4fe;display:grid;place-items:center;font-size:12px';if(p?.avatar_url&&/^(https:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(p.avatar_url)){const img=el('img');img.src=p.avatar_url;img.alt='';img.style.cssText='width:100%;height:100%;object-fit:cover';img.onerror=()=>img.remove();avatar.append(img)}wrap.prepend(avatar)})}
  async function loadDMProfiles(id){const owner=currentUser?.id;dmProfiles=new Map();try{const {data,error}=await db.from('profiles').select('id,first_name,last_name,raven_id,avatar_url').in('id',[owner,id]);if(error)throw error;if(currentUser?.id!==owner||_dmFriendId!==id)return;dmProfiles=new Map((data||[]).map(p=>[p.id,p]));renderDMMessages()}catch{if(_dmFriendId===id)decorateDM()}}
  window.openDirectMessage=function(id,...args){const response=oldDM.call(this,id,...args);let tools=$('rc-dm-tools');if(!tools){tools=el('div',undefined,'rc-dm-tools');tools.id='rc-dm-tools';$('dm-messages').before(tools)}tools.replaceChildren();const add=el('button','+ Photo'),view=el('button','⋯'),note=el('span','');view.setAttribute('aria-label','Conversation details and shared media');view.title='Shared media';note.className='rc-status';add.type=view.type='button';tools.append(add,view,note);
    add.onclick=()=>{add.disabled=true;choosePhoto('/chat-dms/'+id+'/media',async()=>{add.disabled=false;if(_dmFriendId===id){await loadDMMessages(id);await attachDMPhotos(id)}},msg=>{add.disabled=false;note.textContent=msg});add.disabled=false};
    view.onclick=()=>{rename.hidden=true;showPhotos('/chat-dms/'+id+'/media')};return response;
  };
  async function attachDMPhotos(id){const owner=currentUser?.id;try{const data=await api('/chat-dms/'+id+'/media');if(_dmFriendId!==id||currentUser?.id!==owner)return;
    for(const node of $('dm-messages').querySelectorAll('div,p,span')){if(node.children.length)continue;const match=node.textContent.match(/^\[RAVEN_PHOTO:([0-9a-f-]+)\]$/i);if(!match)continue;const p=data.media.find(p=>p.id===match[1]);if(p){node.textContent='';const img=el('img');img.src=p.url;img.alt='Photo shared in this conversation';img.style.cssText='max-width:100%;max-height:260px;border-radius:12px';node.append(img)}else node.textContent='Photo · open Photos to view';}
  }catch{/* Gallery can retry independently. */}}
  const oldRender=window.renderDMMessages;window.renderDMMessages=function(...args){const result=oldRender.apply(this,args);decorateDM();if(_dmFriendId)void attachDMPhotos(_dmFriendId);return result};
  const openWithTools=window.openDirectMessage;window.openDirectMessage=function(id,...args){const result=openWithTools.call(this,id,...args);void loadDMProfiles(id);return result};
  setInterval(()=>{if(!document.hidden&&chat.open)void refreshGroup()},10000);
  setInterval(()=>{if(!document.hidden&&currentUser?.id)void loadGroups()},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&chat.open)void refreshGroup()});
})();
