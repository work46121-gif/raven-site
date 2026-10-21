/* Guest editor/persistence UI. Drafts stay in memory, never in localStorage. */
(function(){
  'use strict';
  const editor=RavenGuestPayments.createEditor(),pending=new Map();
  let config=null;
  function init(options){config=options}
  async function request(path,options={}){
    if(!config)throw Error('Payment details are not ready. Refresh and try again.');
    const session=(await config.session())?.data?.session;
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
    if(options.owner&&options.owner!==session?.user?.id)throw Error('Sign in with the bill creator’s account to retry.');
    const {owner,...requestOptions}=options;
    const response=await fetch(config.backend+path,{...requestOptions,headers,signal:AbortSignal.timeout(15000)});
    let body;try{body=await response.json()}catch{throw Error('Could not save payment details. Try again.')}
    if(!response.ok||!body.success)throw Error(body.error||'Could not load payment details.');
    return body;
  }
  async function save(billId,token,entries){
    if(!entries.length)return;
    const existing=pending.get(billId);
    pending.set(billId,{token,entries,owner:existing?.owner||null});
    const session=(await config.session())?.data?.session;
    if(!session?.user?.id)throw Error('Sign in again to save guest payment details.');
    if(existing?.owner&&existing.owner!==session.user.id)throw Error('Sign in with the bill creator’s account to retry.');
    const draft={token,entries,owner:session.user.id};pending.set(billId,draft);
    await request('/bill/'+encodeURIComponent(billId)+'/guest-payment-methods',{method:'POST',owner:draft.owner,headers:{'X-Raven-Bill-Token':token},body:JSON.stringify({entries})});
    pending.delete(billId);
  }
  function renderPending(container,billId){
    if(!container)return;
    container.querySelectorAll('[data-guest-save-pending]').forEach(n=>n.remove());
    const draft=pending.get(billId);if(!draft)return;
    const note=document.createElement('div');note.dataset.guestSavePending='1';note.setAttribute('role','status');
    note.style.cssText='padding:12px 0;color:#f4ba74;font-size:13px;line-height:1.5';
    const message=document.createElement('p');message.textContent='Bill created. Guest payment details were not confirmed saved. Retry here—do not create another bill.';
    const button=document.createElement('button');button.type='button';button.className='btn-o';button.textContent='Retry saving guest payment details';
    button.onclick=async()=>{button.disabled=true;try{await save(billId,draft.token,draft.entries);note.textContent='Guest payment details saved.';note.style.color='#77DDA8'}catch(e){message.textContent=e.message;button.disabled=false}};
    note.append(message,button);container.prepend(note);
  }
  window.RavenGuestPaymentUI={
    init,render:(container,names)=>editor.render(container,names),entries:names=>editor.entries(names),
    remove:name=>editor.remove(name),clear:()=>editor.clear(),save,renderPending,hasPending:id=>pending.has(id),
    payer:async(billId,token)=>(await request('/bill/'+encodeURIComponent(billId)+'/guest-payer',{headers:token?{'X-Raven-Bill-Token':token}:{}})).profile
  };
})();
