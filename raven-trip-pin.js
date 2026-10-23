/* Home shortcut only: account/device-scoped, never an access credential. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RavenTripPin=api})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const prefix='raven_home_trip_v1:';
  const validId=value=>typeof value==='string'&&/^[a-z0-9_-]{1,64}$/i.test(value);
  const key=userId=>typeof userId==='string'&&/^[a-z0-9_-]{1,128}$/i.test(userId)?prefix+userId:null;
  const cleanName=value=>String(value||'Trip').trim().slice(0,120)||'Trip';
  const storage=()=>globalThis.localStorage;
  function read(userId){try{const k=key(userId);if(!k)return null;const pin=JSON.parse(storage().getItem(k)||'null');return validId(pin?.id)&&typeof pin.name==='string'?{id:pin.id,name:cleanName(pin.name)}:null}catch{return null}}
  function set(userId,trip){const k=key(userId);if(!k||!validId(trip?.id))throw Error('Sign in before pinning a trip.');try{storage().setItem(k,JSON.stringify({id:trip.id,name:cleanName(trip.name)}))}catch{throw Error('Could not save your pin on this device. Try again.')}}
  function clear(userId,expectedId){const k=key(userId);if(!k)return;if(expectedId&&read(userId)?.id!==expectedId)return;try{storage().removeItem(k)}catch{throw Error('Could not remove your pin on this device. Try again.')}}
  function hasAccess(trip,user){
    const email=String(user?.email||'').trim().toLowerCase();if(!email||!trip||trip.type==='roommates')return false;
    let members=trip.member_emails;try{if(typeof members==='string')members=JSON.parse(members)}catch{members=[]}
    return String(trip.creator_email||'').trim().toLowerCase()===email||(Array.isArray(members)&&members.some(value=>String(value).trim().toLowerCase()===email));
  }
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M10 11 3 7l2 7 5 3M22 11l7-4-2 7-5 3" fill="currentColor" opacity=".45"/><path d="M16 4a7 7 0 0 0-7 7c0 6 7 15 7 15s7-9 7-15a7 7 0 0 0-7-7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m12.5 11 2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="29" r="1.5" fill="currentColor"/></svg>';
  function button(trip,userId){if(!key(userId)||!validId(trip?.id))return '';return '<button type="button" class="trip-home-pin" data-home-pin="'+escape(trip.id)+'" aria-pressed="false" aria-label="Pin '+escape(cleanName(trip.name))+' to Home">'+icon+'<span>Pin</span></button>'}
  function sync(container,userId,trips){const pin=read(userId);container.querySelectorAll('[data-home-pin]').forEach(button=>{const id=button.dataset.homePin,selected=pin?.id===id,name=cleanName(trips[id]?.name);button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',(selected?'Unpin ':'Pin ')+name+(selected?' from Home':' to Home'));button.title=selected?'Pinned to RAVEN Trips on Home':'Open this trip directly from Home';button.querySelector('span').textContent=selected?'Pinned':'Pin';button.closest('.bill-card')?.classList.toggle('trip-home-pinned',selected)})}
  async function resolve({pin,session,db,backend,signal,timeoutMs=6500}){
    if(!validId(pin?.id)||!session?.user?.id||!session?.access_token)throw Object.assign(Error('Sign in to open your pinned trip.'),{status:401});
    const controller=new AbortController(),abort=()=>controller.abort();
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    let timer;
    try{return await Promise.race([(async()=>{
      // The existing server endpoint rechecks linked membership. A stored pin
      // cannot authorize access, and no token or signed URL is saved locally.
      const response=await fetch(backend+'/trips/'+encodeURIComponent(pin.id)+'/travel-pass',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},signal:controller.signal});
      if([403,404].includes(response.status))return null;
      if(response.status===401)throw Object.assign(Error('Sign in again to open your trip.'),{status:401});
      if(!response.ok)throw Error('Could not check trip access.');
      const data=await response.json();if(!data?.success||typeof data.pass!=='string'||!data.pass)throw Error('Could not connect to your trip.');
      const result=await db.from('trips').select('id,name,type,creator_email,member_emails,share_token').eq('id',pin.id).abortSignal(controller.signal).maybeSingle();
      if(result.error)throw Error('Could not load your trip.');
      const trip=result.data;
      if(!trip||trip.id!==pin.id||!hasAccess(trip,session.user))return null;
      if(typeof trip.share_token!=='string'||!trip.share_token)throw Error('Trip link is not ready.');
      const url=new URL('/trip/'+encodeURIComponent(trip.id),'https://ravensplit.com');
      url.searchParams.set('t',trip.share_token);url.searchParams.set('app','1');
      url.hash='raven_travel='+encodeURIComponent(data.pass);
      return {url:url.href,id:trip.id,name:cleanName(trip.name)};
    })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Trip loading timed out.'))},timeoutMs)})])}
    finally{clearTimeout(timer);controller.abort();signal?.removeEventListener('abort',abort)}
  }
  return {read,set,clear,hasAccess,button,sync,resolve};
});
