(() => {
 'use strict';
 const inbox=document.getElementById('raven-inbox');if(!inbox)return;
 const box=document.createElement('div');box.style.cssText='padding:10px 20px;border-bottom:1px solid #ffffff12;font-size:12px;color:#aaa1ba';
 const button=document.createElement('button');button.type='button';button.textContent='Enable phone alerts';button.style.cssText='padding:8px 12px;border-radius:10px;border:1px solid #a855f744;background:#7c3aed24;color:#dcc0ff';
 const note=document.createElement('span');note.style.marginLeft='10px';box.append(button,note);inbox.querySelector('.raven-inbox-tabs').after(box);
 const cap=window.Capacitor,plugin=cap?.Plugins?.PushNotifications;
 const native=cap?.isNativePlatform?.()&&cap?.getPlatform?.()==='ios'&&plugin;
 let deviceToken=null,registeredOwner=null,registeringOwner=null;
 const enabledKey=id=>'raven_phone_alerts_'+id;
 async function api(path,method='GET',body){const {data:{session}}=await db.auth.getSession();if(!session)throw Error('Sign in to enable alerts.');const r=await fetch(BACKEND+path,{method,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Please retry later.');return data;}
 function label(){button.textContent=registeredOwner===currentUser?.id&&registeredOwner?'Turn off phone alerts':'Enable phone alerts';}
 async function register(){
  if(!native||!currentUser?.id)return;
  const owner=currentUser.id;const status=await api('/push/status');if(!status.enabled)throw Error('Phone alerts are awaiting activation.');
  let permission=await plugin.checkPermissions();if(permission.receive==='prompt')permission=await plugin.requestPermissions();
  if(permission.receive!=='granted')throw Error('Allow notifications in iPhone Settings to receive alerts.');
  if(currentUser?.id!==owner)return;
  registeringOwner=owner;await plugin.register();
 }
 if(native){
  plugin.addListener('registration',async token=>{
   const owner=registeringOwner;if(!owner||owner!==currentUser?.id)return;
   try{deviceToken=token.value;await api('/push/device','POST',{token:deviceToken});if(owner!==currentUser?.id)return;registeredOwner=owner;localStorage.setItem(enabledKey(owner),'1');note.textContent='Bills, trips and messages';label()}catch(e){note.textContent=e.message}
  });
  plugin.addListener('registrationError',()=>{note.textContent='Could not register. Update RAVEN and try again.';registeredOwner=null;label()});
  plugin.addListener('pushNotificationActionPerformed',event=>{
   const data=event.notification?.data;if(!currentUser?.id||data?.recipient_id!==currentUser.id)return;
   if(data.kind==='bill')showPage('bills');else if(data.kind==='trip')showPage('trips');else{showPage('overview');document.getElementById('raven-inbox-open')?.click()}
  });
  db.auth.onAuthStateChange((_event,session)=>{setTimeout(async()=>{
   if(registeredOwner!==session?.user?.id){registeredOwner=null;registeringOwner=null;label();await plugin.removeAllDeliveredNotifications().catch(()=>{});}
   if(session?.user?.id&&localStorage.getItem(enabledKey(session.user.id))==='1'){
    try{await register()}catch(e){note.textContent=e.message}
   }
  },0)});
 }
 button.onclick=async()=>{
  if(!native){note.textContent='Requires the updated RAVEN iPhone app; website alerts are not enabled.';return;}
  button.disabled=true;
  try{
   if(registeredOwner===currentUser?.id&&deviceToken){await api('/push/device','DELETE',{token:deviceToken});localStorage.removeItem(enabledKey(registeredOwner));registeredOwner=null;registeringOwner=null;await plugin.unregister();await plugin.removeAllDeliveredNotifications();note.textContent='Phone alerts off';label()}
   else{note.textContent='Setting up…';await register()}
  }catch(e){note.textContent=e.message}finally{button.disabled=false}
 };
})();
