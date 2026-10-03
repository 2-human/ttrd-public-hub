/* review-mode.js — review widget (loads only on ?review=1). Classic script.
 * Floating add-comment pill (deepest hovered anchor) + banner + sidebar with
 * three status tabs (Active/Applied/Archived) per comment-lifecycle.md.
 * Persists via Firebase RTDB (/comments/{id}) or a localStorage fallback. */
const CFG = (window.TTRD_REVIEW_CONFIG) || {};
const L = Object.assign({
  bannerTitle:'Review mode', localOnly:'Local-only', exit:'Exit review', sidebarTitle:'Comments',
  empty:'No comments here yet. Hover an ad, its copy, headline, description, or image and click the +.',
  add:'+ Comment', save:'Post comment', cancel:'Cancel',
  edit:'Edit', del:'Delete', resolve:'Resolve', reopen:'Reopen',
  tabOpen:'Open', tabResolved:'Resolved', resolvePrompt:'Resolution note (what was done):',
  placeholder:'Your feedback…', replacementPlaceholder:'Suggested change (optional)…', namePrompt:'Your name:'
}, CFG.REVIEW_LABELS || {});
const FB = CFG.FIREBASE_CONFIG || {};
const FB_OK = FB.apiKey && FB.apiKey.indexOf('PASTE') !== 0 && FB.databaseURL && FB.databaseURL.indexOf('PASTE') < 0;
const _MEM = {};
const store = {get(k){try{return localStorage.getItem(k)}catch(e){return (k in _MEM)?_MEM[k]:null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){_MEM[k]=v}}};

const ANCHOR_TAGS = ['h1','h2','h3','h4','h5','h6','p','li','blockquote'];
const CHROME_SEL = '.review-banner,.review-sidebar,.review-modal-overlay,.review-floating-pill,[data-review-skip]';

function pageSlug(){let p=window.location.pathname.replace(/\/index\.html?$/,'');if(p===''||p==='/')return 'home';return p.replace(/^\/|\/$/g,'').replace(/\//g,'-')||'home';}
const SLUG = pageSlug();
function reviewer(){let n=store.get('ttrd_reviewer');if(!n){n=(window.prompt(L.namePrompt,'')||'Anonymous').trim()||'Anonymous';store.set('ttrd_reviewer',n);}return n;}

/* status normalize (reader shim for legacy boolean records) */
function statusOf(c){ const s=c.status; if(s==='resolved'||s==='applied'||s==='archived'||c.archived||c.applied)return 'resolved'; return 'pending'; }

/* ---- adapter ---- */
function localAdapter(){
  const KEY='ttrd_review_comments'; let cb=null;
  const read=()=>{try{return JSON.parse(store.get(KEY)||'{}')}catch(e){return {}}};
  const write=o=>store.set(KEY,JSON.stringify(o)); const ping=()=>cb&&cb(read());
  return { local:true,
    subscribe(fn){cb=fn;fn(read());window.addEventListener('storage',e=>{if(e.key===KEY)fn(read())});return()=>{cb=null}},
    create(rec){const o=read();const id='c'+Date.now()+Math.random().toString(36).slice(2,7);o[id]=rec;write(o);ping();return Promise.resolve(id)},
    update(id,patch){const o=read();o[id]=Object.assign({},o[id],patch);write(o);ping();return Promise.resolve()},
    remove(id){const o=read();delete o[id];write(o);ping();return Promise.resolve()} };
}
async function firebaseAdapter(){
  const A=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const D=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
  const app=(A.getApps&&A.getApps().length)?A.getApp():A.initializeApp(FB);
  const db=D.getDatabase(app); const root=D.ref(db,'comments');
  return { local:false,
    subscribe(fn){return D.onValue(root,s=>fn(s.val()||{}))},
    create(rec){const r=D.push(root);return D.set(r,rec).then(()=>r.key)},
    update(id,patch){return D.update(D.ref(db,'comments/'+id),patch)},
    remove(id){return D.remove(D.ref(db,'comments/'+id))} };
}

function el(t,c,h){const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e}
function esc(s){return (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function when(ts){const d=new Date(ts||Date.now());return d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}

let SIDE,LIST,TABS,PILL,ADAPTER,ME,COMMENTS={},FILTER='open',curEl=null,curId=null,hideT=null;
let SELID=null,SELANCHOR=null; /* clicked comment: row id + its anchor (persist across re-renders) */
const TAB_OF={open:'pending',resolved:'resolved'};

function buildChrome(){
  const ban=el('div','review-banner');
  ban.innerHTML='<span class="rw-title">'+esc(L.bannerTitle)+'</span>'+(ADAPTER.local?'<span class="rw-local">'+esc(L.localOnly)+'</span>':'')+'<span class="rw-spacer"></span><span class="rw-name">'+esc(ME)+'</span>';
  const exit=el('button',null,esc(L.exit)); exit.onclick=()=>{const u=new URL(location.href);u.searchParams.delete('review');location.href=u.toString()};
  ban.appendChild(exit); document.body.appendChild(ban);

  SIDE=el('aside','review-sidebar');
  SIDE.appendChild(el('h3',null,'<span>'+esc(L.sidebarTitle)+'</span>'));
  TABS=el('div','review-tabs');
  [['open',L.tabOpen],['resolved',L.tabResolved]].forEach(([k,lbl])=>{
    const b=el('button',k===FILTER?'on':null,esc(lbl)+' <span class="rw-c">0</span>'); b.dataset.k=k;
    b.onclick=()=>{FILTER=k;TABS.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x.dataset.k===k));render();};
    TABS.appendChild(b);
  });
  SIDE.appendChild(TABS);
  LIST=el('div','review-list'); SIDE.appendChild(LIST); document.body.appendChild(SIDE);

  PILL=el('button','review-floating-pill',esc(L.add)); PILL.type='button'; PILL.setAttribute('data-review-skip','');
  document.body.appendChild(PILL);
  PILL.addEventListener('mouseenter',()=>clearTimeout(hideT));
  PILL.addEventListener('mouseleave',hidePillSoon);
  PILL.addEventListener('click',()=>{if(curId&&curEl)openComposer(curId,curEl)});
  document.addEventListener('mouseover',e=>{if(e.target.closest(CHROME_SEL))return;const a=e.target.closest('[data-comment-id]');if(a){clearTimeout(hideT);placePill(a);}});
  document.addEventListener('mouseout',e=>{const to=e.relatedTarget;if(to&&(to===PILL||(to.closest&&to.closest('[data-comment-id]'))))return;hidePillSoon();});
  window.addEventListener('scroll',()=>{if(curEl&&PILL.style.display==='block')placePill(curEl)},true);
}
function placePill(elm){curEl=elm;curId=elm.getAttribute('data-comment-id');PILL.style.display='block';const r=elm.getBoundingClientRect();PILL.style.top=Math.max(52,Math.min(r.top+6,window.innerHeight-34))+'px';PILL.style.left=Math.max(6,r.right-PILL.offsetWidth-8)+'px';}
function hidePillSoon(){hideT=setTimeout(()=>{PILL.style.display='none';curEl=null;curId=null;},140);}

function anchorPass(){
  const seen=new Set(),counters={};
  const opt=Array.from(document.querySelectorAll('[data-comment-target]'));
  const tagged=Array.from(document.querySelectorAll(ANCHOR_TAGS.join(',')));
  [...opt,...tagged].forEach(elm=>{
    if(seen.has(elm))return;seen.add(elm);
    if(elm.closest(CHROME_SEL))return;
    if(elm.hasAttribute('data-comment-id'))return;
    if((elm.textContent||'').trim().length<2 && !elm.querySelector('img,video'))return;
    const tag=elm.tagName.toLowerCase();counters[tag]=(counters[tag]||0)+1;
    elm.setAttribute('data-comment-id',SLUG+'-'+tag+'-'+counters[tag]);
  });
}

function modal(title,ctx,initText,initRepl,onSave){
  const ov=el('div','review-modal-overlay');const m=el('div','review-modal');
  m.innerHTML='<h4>'+esc(title)+'</h4><div class="rw-ctx">'+esc(ctx)+'</div>';
  const ta=el('textarea');ta.placeholder=L.placeholder;ta.value=initText||'';
  const tr=el('textarea');tr.placeholder=L.replacementPlaceholder;tr.value=initRepl||'';tr.style.minHeight='44px';
  const acts=el('div','rw-modal-acts');
  const cancel=el('button','rw-cancel',esc(L.cancel));cancel.onclick=()=>ov.remove();
  const save=el('button','rw-save',esc(L.save));
  save.onclick=()=>{const t=ta.value.trim(),r=tr.value.trim();if(!t&&!r)return;onSave(t,r);ov.remove()};
  acts.appendChild(cancel);acts.appendChild(save);m.appendChild(ta);m.appendChild(tr);m.appendChild(acts);ov.appendChild(m);
  ov.onclick=e=>{if(e.target===ov)ov.remove()};document.body.appendChild(ov);ta.focus();
}
function openComposer(anchor,elm){
  const note=elm.getAttribute('data-variant-note');
  const prev=note||(elm.textContent||'').replace(/\s+/g,' ').trim().slice(0,80)||(elm.querySelector('img,video')?'[creative]':'');
  modal('Add comment',anchor,'','',(text,repl)=>ADAPTER.create({comment:text,replacement:repl||null,anchor:anchor,page:SLUG,author:ME,status:'pending',timestamp:Date.now(),text_preview:prev,url:location.href,user_agent:navigator.userAgent}));
}

function actBtn(label,cls,fn){const b=el('button',cls,esc(label));b.onclick=ev=>{ev.stopPropagation();fn()};return b;}
function render(){
  const all=Object.entries(COMMENTS).filter(([id,c])=>c&&c.page===SLUG);
  const counts={pending:0,resolved:0};
  all.forEach(([id,c])=>{counts[statusOf(c)]=(counts[statusOf(c)]||0)+1});
  TABS.querySelectorAll('button').forEach(b=>{b.querySelector('.rw-c').textContent=counts[TAB_OF[b.dataset.k]]||0;});
  // outlines + status dots — full outline on commented components (red while any
  // comment is open, green when only resolved remain) + a vertical stack of dots
  // just outside the right border: one red dot per active comment, one green per resolved.
  document.querySelectorAll('.has-comment,.has-applied-comment').forEach(e=>e.classList.remove('has-comment','has-applied-comment'));
  document.querySelectorAll('.rw-dots').forEach(e=>e.remove());
  const byTarget={};
  all.forEach(([id,c])=>{const st=statusOf(c);const sel='[data-comment-id="'+(window.CSS&&CSS.escape?CSS.escape(c.anchor):c.anchor)+'"]';const r=byTarget[sel]||(byTarget[sel]={active:0,resolved:0});if(st==='resolved')r.resolved++;else r.active++;});
  Object.keys(byTarget).forEach(sel=>{const r=byTarget[sel];document.querySelectorAll(sel).forEach(a=>{
    a.classList.add(r.active>0?'has-comment':'has-applied-comment');
    const d=document.createElement('span');d.className='rw-dots';d.setAttribute('aria-hidden','true');
    let h='';for(let i=0;i<r.active;i++)h+='<i class="rw-dot rw-dot-active"></i>';for(let i=0;i<r.resolved;i++)h+='<i class="rw-dot rw-dot-resolved"></i>';
    d.innerHTML=h;a.appendChild(d);
  });});
  // list for current tab
  const want=TAB_OF[FILTER];
  const rows=readingOrder(all.filter(([id,c])=>statusOf(c)===want));
  LIST.innerHTML='';
  if(!rows.length){LIST.appendChild(el('div','review-empty',esc(L.empty)));return}
  rows.forEach(([id,c])=>{
    const st=statusOf(c);
    const row=el('div','review-row'+(id===SELID?' rw-selected':''));
    const blabel=st==='resolved'?'resolved':'open';
    row.innerHTML='<div class="rw-meta"><b>'+esc(c.author||'Anonymous')+'</b><span class="rw-badge rw-'+st+'">'+blabel+'</span><span>'+when(c.timestamp)+(c.edited_at?' · edited':'')+'</span></div>'+
      '<div class="rw-body">'+esc(c.comment||'')+'</div>'+
      (c.replacement?'<div class="rw-repl">↳ '+esc(c.replacement)+'</div>':'')+
      (st==='resolved'&&c.resolution?'<div class="rw-resolution">✓ '+esc(c.resolution)+'</div>':'')+
      '<div class="rw-anchor">'+esc(c.anchor)+'</div>';
    const acts=el('div','rw-acts');
    if(st==='pending'){
      acts.appendChild(actBtn(L.edit,'edit-btn',()=>modal('Edit comment',c.anchor,c.comment||'',c.replacement||'',(t,r)=>ADAPTER.update(id,{comment:t,replacement:r||null,edited_at:Date.now()}))));
      acts.appendChild(actBtn(L.resolve,'resolve-btn',()=>{const note=(window.prompt(L.resolvePrompt,'')||'').trim();ADAPTER.update(id,{status:'resolved',resolution:note||('Resolved · '+ME),resolved_at:Date.now(),resolved_by:ME});}));
    } else {
      acts.appendChild(actBtn(L.reopen,'restore-btn',()=>ADAPTER.update(id,{status:'pending',resolution:null})));
    }
    acts.appendChild(actBtn(L.del,'delete-btn',()=>{if(confirm('Delete this comment?'))ADAPTER.remove(id)}));
    row.appendChild(acts);
    row.onclick=()=>{SELID=id;spotlight(c.anchor);};
    LIST.appendChild(row);
  });
  applyActive();
}
/* persistent strong highlight on the currently-selected comment's element(s).
 * querySelectorAll because a campaign-wide headline anchor (hl-{i}) can match
 * several ads at once. */
/* An anchor can land on an element the page hides; a hidden element cannot be
 * scrolled to and shows no outline, so the click looks broken. Climb to the
 * nearest ancestor that actually occupies space and use that instead. */
function visibleTarget(el){
  for(let e=el; e && e.getBoundingClientRect; e=e.parentElement){
    const r=e.getBoundingClientRect();
    if(r.width||r.height) return e;
  }
  return null;
}
function commentTarget(c){
  if(!c || !c.anchor) return null;
  const sel = '[data-comment-id="'+(window.CSS&&CSS.escape?CSS.escape(c.anchor):c.anchor)+'"]';
  return visibleTarget(document.querySelector(sel));
}
/* Sidebar order (2026-09-22): reading order of the components themselves —
 * top row left→right, then the next row, down to the bottom. Comments whose
 * element isn't on this page (another LP's, in the hub's "all" scope) keep the
 * old oldest-first order and sit after the placed ones inside their own group.
 *
 * Rows are found by vertical overlap rather than a fixed tolerance: an element
 * joins the current row while it still starts above that row's running bottom,
 * and the bottom shrinks to the shortest member so one tall element (a hero
 * image beside a stack of cards) can't swallow everything below it. */
function readingOrder(entries){
  const pos=new Map();
  entries.forEach(e=>{
    const t=commentTarget(e[1]);
    if(!t) return;
    const r=t.getBoundingClientRect();
    if(!r.width && !r.height) return;
    pos.set(e[0],{top:r.top+window.pageYOffset,bottom:r.bottom+window.pageYOffset,left:r.left+window.pageXOffset});
  });
  const ts=e=>e[1].timestamp||0;
  const placed=entries.filter(e=>pos.has(e[0])).sort((a,b)=>pos.get(a[0]).top-pos.get(b[0]).top||ts(a)-ts(b));
  const band=new Map();
  let row=0, bottom=-Infinity;
  placed.forEach(e=>{
    const p=pos.get(e[0]);
    if(p.top>=bottom){ row++; bottom=p.bottom; }
    else bottom=Math.min(bottom,p.bottom);
    band.set(e[0],row);
  });
  placed.sort((a,b)=>
    band.get(a[0])-band.get(b[0])
    || pos.get(a[0]).left-pos.get(b[0]).left
    || pos.get(a[0]).top-pos.get(b[0]).top
    || ts(a)-ts(b));
  return placed.concat(entries.filter(e=>!pos.has(e[0])).sort((a,b)=>ts(a)-ts(b)));
}
function applyActive(){
  document.querySelectorAll('.rw-active-anchor').forEach(e=>e.classList.remove('rw-active-anchor'));
  if(!SELANCHOR)return;
  const sel='[data-comment-id="'+(window.CSS&&CSS.escape?CSS.escape(SELANCHOR):SELANCHOR)+'"]';
  document.querySelectorAll(sel).forEach(a=>{const t=visibleTarget(a); if(t) t.classList.add('rw-active-anchor');});
}
function spotlight(anchor){
  SELANCHOR=anchor;
  let a=null;
  /* the prototype exposes __rwReveal: it flips the right dropdown/tab so the
   * commented variant is on screen, then returns that zone's element. */
  if(window.__rwReveal){try{a=window.__rwReveal(anchor)}catch(e){}}
  if(!a)a=document.querySelector('[data-comment-id="'+(window.CSS&&CSS.escape?CSS.escape(anchor):anchor)+'"]');
  applyActive();
  if(!a)return;
  a = visibleTarget(a) || a;
  a.scrollIntoView({behavior:'smooth',block:'center'});
  a.classList.remove('rw-spot');void a.offsetWidth;a.classList.add('rw-spot');setTimeout(()=>a.classList.remove('rw-spot'),1200);
}

(async function init(){
  ME=reviewer();
  try{ADAPTER=FB_OK?await firebaseAdapter():localAdapter();}catch(e){console.warn('[review] firebase init failed, using local',e);ADAPTER=localAdapter();}
  buildChrome();anchorPass();
  /* variant-aware anchors (prototype variation): the prototype rewrites a zone's
   * data-comment-id when its headline/message/creative selection changes, then
   * calls this hook so the highlight pass re-matches comments to the now-current
   * variant. Per-dimension scoping falls out of the existing match-by-anchor. */
  window.__rwRefresh=render;
  ADAPTER.subscribe(data=>{COMMENTS=data||{};render()});
})();
