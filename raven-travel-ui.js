(() => {
 // Travel belongs inside the opened trip, never on the dashboard's trip list.
 const root=document.getElementById('trip-travel-action');if(!root)return;
 const currentUser={id:null};
 const db={auth:{getSession:async()=>{await initChatDb();const state=await chatDb.auth.getSession();currentUser.id=state.data.session?.user?.id||null;return state}}};
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e};
 const card=el('dialog');card.className='rm-card';card.id='raven-trip-travel-popup';card.style.cssText='width:min(620px,calc(100% - 24px));max-height:85dvh;overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;background:#101018;color:#f0eef8;border:1px solid #393044;border-radius:20px;padding:22px';
 const h=el('h3','Travel plans'),desc=el('p','One place for the group’s stay and everyone’s flights.'),select=el('select');desc.className='rm-muted';select.setAttribute('aria-label','Trip for travel plans');select.style.cssText='width:100%;padding:12px;background:#15151f;color:#fff;border:1px solid #ffffff20;border-radius:12px;font-size:16px';
 select.hidden=true;const close=el('button','×');close.type='button';close.setAttribute('aria-label','Close travel plans');close.style.cssText='float:right;background:none;border:0;color:#c4b5d6;font-size:26px;cursor:pointer';close.onclick=()=>card.close();
 const status=el('p');status.className='rm-muted';const content=el('div');card.append(close,h,desc,select,status,content);document.body.append(card);card.setAttribute('aria-label','Trip travel plans');
 card.addEventListener('close',()=>{generation++;rows=[];content.replaceChildren()});
 let generation=0,selectedOwner=null,offset=0,rows=[],members=[],canAssign=false;
 async function api(path,method='GET',body){const {data:{session}}=await db.auth.getSession();if(!session)throw Error('Sign in to see travel plans.');const r=await fetch(BACKEND+path,{method,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error||'Please retry.');return d}
 root.onclick=async()=>{select.replaceChildren(new Option('Trip',TRIP_ID));select.value=TRIP_ID;h.textContent='Stay & flights';card.showModal();status.textContent='Loading travel plans…';try{await db.auth.getSession();await load()}catch(e){status.textContent=e.message}};
 async function load(more=false){const id=select.value,owner=currentUser?.id,epoch=++generation;content.replaceChildren();if(!id)return;status.textContent='Loading travel plans…';if(!more){offset=0;rows=[];}
  try{const data=await api('/trips/'+encodeURIComponent(id)+'/travel?offset='+offset);if(generation!==epoch||currentUser?.id!==owner||select.value!==id)return;rows.push(...data.media);offset=data.nextOffset;members=data.members;canAssign=data.can_assign;render(id,data.hasMore);status.textContent='Shared with linked trip members only. Hide booking codes, boarding-pass barcodes and personal details before uploading.';}catch(e){if(epoch===generation)status.textContent=e.message;}
 }
 select.onchange=()=>load();
 function render(id,hasMore){content.replaceChildren();
  const form=el('form');form.style.cssText='display:grid;grid-template-columns:1fr;gap:10px;margin:16px 0';
  const kind=el('select'),person=el('select'),title=el('input'),file=el('input'),button=el('button','Upload screenshot');
  kind.append(new Option('Airbnb / stay · for the group','stay'),new Option('Flight · by person','flight'));kind.setAttribute('aria-label','Upload type');
  for(const m of members.filter(m=>canAssign||m.id===currentUser.id))person.append(new Option(([m.first_name,m.last_name].filter(Boolean).join(' ')||'Member')+(m.raven_id?' · @'+m.raven_id:''),m.id));person.value=currentUser.id;person.hidden=true;person.setAttribute('aria-label','Whose flight');kind.onchange=()=>person.hidden=kind.value!=='flight';
  title.placeholder='Title (optional), e.g. JFK → Miami';title.maxLength=100;title.setAttribute('aria-label','Screenshot title');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.required=true;file.setAttribute('aria-label','Travel screenshot');button.type='submit';
  for(const field of [kind,person,title,file,button])field.style.cssText='width:100%;box-sizing:border-box;background:#15151f;color:#ded8eb;border:1px solid #ffffff25;border-radius:10px;padding:11px;font-size:14px';button.style.color='#30D158';form.append(kind,person,title,file,button);content.append(form);
  form.onsubmit=async event=>{event.preventDefault();const photo=file.files[0],owner=currentUser.id;if(!photo)return;if(photo.size>6291456){status.textContent='Choose a JPEG, PNG or WebP under 6 MB.';return}button.disabled=true;status.textContent='Uploading…';
   try{const data_url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(photo)});if(owner!==currentUser?.id||select.value!==id)return;await api('/trips/'+encodeURIComponent(id)+'/travel','POST',{kind:kind.value,person_id:person.value,title:title.value,data_url});await load();}catch(e){status.textContent=e.message||'Upload failed. Please retry.';}finally{button.disabled=false}
  };
  const groups=[['Airbnb / stay',rows.filter(r=>r.kind==='stay')],...members.map(m=>[(m.first_name||m.raven_id||'Member')+' · Flights',rows.filter(r=>r.kind==='flight'&&r.person_id===m.id)])];
  for(const [label,media] of groups){const section=el('section');section.style.margin='22px 0';section.append(el('h4',label));if(!media.length){const empty=el('p','No screenshots yet.');empty.className='rm-muted';section.append(empty)}const grid=el('div');grid.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px';
   for(const item of media){const wrap=el('div'),a=el('a'),img=el('img');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';img.src=item.url;img.alt=item.title||label;img.loading='lazy';img.style.cssText='width:100%;height:150px;object-fit:cover;border-radius:12px';a.append(img);wrap.append(a,el('p',item.title||label));if(item.can_remove){const remove=el('button','Remove');remove.type='button';remove.onclick=async()=>{if(!confirm('Remove this travel screenshot?'))return;try{await api('/trips/'+encodeURIComponent(id)+'/travel/'+item.id,'DELETE');await load()}catch(e){status.textContent=e.message}};wrap.append(remove)}grid.append(wrap)}section.append(grid);content.append(section);
  }
  if(hasMore){const more=el('button','Load more screenshots');more.type='button';more.onclick=()=>load(true);content.append(more)}
 }
})();
