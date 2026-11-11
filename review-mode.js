/* review-mode.js: the Feedback Drawer (library/features/review-widget, feature_version 1.5.0), loaded only on ?review=1.
 * Classic script, one IIFE (js-isolation); window.__rwRefresh and window.__rwComments are its only exports.
 *
 * Two modes (qna-mode.md):
 *   QA   comments on any screen, drawer or timeline entry, for team and admin accounts
 *   Q&A  the discovery questions (window.HUB_QUESTIONS, from feedback.js) with their answers from window.HubAnswers; a
 *        card opens the question's own hub drawer (qa:<id>), where the form is
 * Store (host-answers-store.md): the host's HubAnswers. With accounts the author is the signed-in account; an account
 * without QA access gets Q&A only and an empty comment adapter (the rules refuse it anyway).
 *
 * Screens (hash-route-screens.md): a record's `page` is PAGE_PREFIX + route (+ ?tab=), and a comment left in a drawer
 * also stores `drawer` (d=…&dt=…). This hub's deviation, recorded in .composition-manifest.md: the host gives most
 * elements a global anchor (pg-<page>-p3, cm-<entry>, em-<email>, j-<J>-<step> …, see src/hub/INDEX.md) that names the
 * element wherever it shows, so a comment on such an anchor decorates it on any screen, and window.__rwReveal(anchor)
 * opens the screen or drawer that holds it. Elements the host leaves bare get per-screen ids, rw-m-<tag>-<n> in main and
 * rw-d-<tag>-<n> in the drawer, renumbered each pass, and decorate only on their own screen and drawer.
 * No text preview, url or user agent is stored: the hub is gated, its store is not. */
(function () {
const CFG = window.TTRD_REVIEW_CONFIG || {};
const L = Object.assign({}, CFG.REVIEW_LABELS || {});
const PREFIX = CFG.PAGE_PREFIX;
const ROUTES = CFG.HASH_ROUTES || {};
const RENAMES = CFG.PAGE_RENAMES || {}, DRAWER_RENAMES = CFG.DRAWER_RENAMES || {};
if (!PREFIX) { console.error('[review] PAGE_PREFIX is not set; the Feedback Drawer does not start'); return; }
const _MEM = {};
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return (k in _MEM) ? _MEM[k] : null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { _MEM[k] = v; } } };

const ANCHOR_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'td', 'dt', 'dd'];
const CHROME_SEL = '.review-banner,.review-sidebar,.review-modal-overlay,.review-floating-pill,.review-toggle-btn,[data-review-skip],.rw-dots';
const ROOTS = [['#app-main', 'rw-m', false], ['#drawer-body', 'rw-d', true]];
const AUTO = /^rw-[md]-/;
const drawerOpen = () => { const d = document.getElementById('app-drawer'); return !!(d && d.classList.contains('open')); };

/* ───── screen and drawer keys, from the hash ───── */
function hashParts() {
  const h = location.hash && location.hash !== '#' ? location.hash : '#' + (ROUTES.defaultRoute || '/'), i = h.indexOf('?');
  return { path: (i < 0 ? h : h.slice(0, i)).replace(/^#/, '') || ROUTES.defaultRoute || '/', q: new URLSearchParams(i < 0 ? '' : h.slice(i + 1)) };
}
function screenKey() { const p = hashParts(), tab = p.q.get('tab'); return PREFIX + p.path + (tab ? '?tab=' + encodeURIComponent(tab) : ''); }
function drawerKey() {
  const p = hashParts(), d = p.q.get('d'); if (!d || !drawerOpen()) return '';
  const s = new URLSearchParams(); s.set('d', d); const dt = p.q.get('dt'); if (dt) s.set('dt', dt); return s.toString();
}
let SLUG = screenKey(), DRAWER = drawerKey(), LASTHASH = location.hash;

/* page-rename-map.md: the same function a migration uses */
function renamePage(page, map) {
  const i = page.indexOf('?tab='), base = i < 0 ? page : page.slice(0, i), tail = i < 0 ? '' : page.slice(i), seen = new Set([base]);
  let cur = base;
  while (Object.prototype.hasOwnProperty.call(map, cur)) { cur = map[cur]; if (seen.has(cur)) throw new Error('page rename loop at ' + cur); seen.add(cur); }
  return cur + tail;
}
function renamed(rec) {
  if (!rec || typeof rec.page !== 'string') return rec;
  const out = Object.assign({}, rec); out.page = renamePage(rec.page, RENAMES);
  if (rec.drawer) { const q = new URLSearchParams(rec.drawer), d = q.get('d'); if (d && Object.prototype.hasOwnProperty.call(DRAWER_RENAMES, d)) { q.set('d', DRAWER_RENAMES[d]); out.drawer = q.toString(); } }
  return out;
}

/* per-screen ids for what the host left bare; host anchors are never touched */
function anchorPass() {
  ROOTS.forEach(([sel, pre, isDrawer]) => {
    const root = document.querySelector(sel); if (!root || (isDrawer && !drawerOpen())) return;
    const counters = {};
    root.querySelectorAll(ANCHOR_TAGS.join(',')).forEach(elm => {
      if (elm.closest(CHROME_SEL)) return;
      const cur = elm.getAttribute('data-comment-id');
      if (cur && !AUTO.test(cur)) return;
      const host = elm.parentElement && elm.parentElement.closest('[data-comment-id]');
      if (host && root.contains(host) && !AUTO.test(host.getAttribute('data-comment-id'))) { if (cur) elm.removeAttribute('data-comment-id'); return; }
      if ((elm.textContent || '').trim().length < 2) { if (cur) elm.removeAttribute('data-comment-id'); return; }
      const tag = elm.tagName.toLowerCase(); counters[tag] = (counters[tag] || 0) + 1;
      const id = pre + '-' + tag + '-' + counters[tag];
      if (cur !== id) elm.setAttribute('data-comment-id', id);
    });
  });
}
const rootIsDrawer = elm => !!(elm && elm.closest && elm.closest('#drawer-body'));

function statusOf(c) { const s = c.status; return (s === 'resolved' || s === 'applied' || s === 'archived' || c.archived || c.applied) ? 'resolved' : 'pending'; }
const isHub = c => c && typeof c.page === 'string' && c.page.indexOf(PREFIX) === 0;
const cssq = v => (window.CSS && CSS.escape) ? CSS.escape(v) : v;
const inDom = a => !!document.querySelector('[data-comment-id="' + cssq(a) + '"]');
/* on screen now: a host anchor wherever it shows; a per-screen id only on its screen (and drawer) */
function visibleHere(c) {
  if (!isHub(c) || !c.anchor) return false;
  if (!AUTO.test(c.anchor)) return inDom(c.anchor);
  return c.page === SLUG && (c.anchor.indexOf('rw-d-') === 0 ? c.drawer === DRAWER : true) && inDom(c.anchor);
}
const onScreen = c => isHub(c) && (c.page === SLUG || visibleHere(c));

/* ───── adapters ───── */
function localAdapter() {
  const KEY = 'ttrd_review_comments'; let cb = null;
  const read = () => { try { return JSON.parse(store.get(KEY) || '{}'); } catch (e) { return {}; } };
  const write = o => store.set(KEY, JSON.stringify(o)); const ping = () => cb && cb(read());
  return { local: true,
    subscribe(fn) { cb = fn; fn(read()); window.addEventListener('storage', e => { if (e.key === KEY) fn(read()); }); return () => { cb = null; }; },
    create(rec) { const o = read(); const id = 'c' + Date.now() + Math.random().toString(36).slice(2, 7); o[id] = rec; write(o); ping(); return Promise.resolve(id); },
    update(id, patch) { const o = read(); o[id] = Object.assign({}, o[id], patch); write(o); ping(); return Promise.resolve(); },
    remove(id) { const o = read(); delete o[id]; write(o); ping(); return Promise.resolve(); } };
}
const EMPTY = { local: false, subscribe(fn) { fn({}); return () => {}; }, create: () => Promise.reject(new Error('QA is for team accounts')), update: () => Promise.reject(new Error('QA is for team accounts')), remove: () => Promise.reject(new Error('QA is for team accounts')) };

function el(t, c, h) { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function when(ts) { const d = new Date(ts || Date.now()); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
/* native dialogs can throw in an embedded browser (comment-lifecycle.md) */
const ask = (msg, def) => { try { return window.prompt(msg, def || ''); } catch (e) { return def || ''; } };
const sure = msg => { try { return window.confirm(msg); } catch (e) { return true; } };
const tell = msg => { try { window.alert(msg); } catch (e) { console.warn('[review]', msg); } };

let SIDE, LIST, TABS, QTABS, MODES, SCOPEEL, PILL, ROUTE, ADAPTER, ME, COMMENTS = {}, FILTER = 'open', QFILTER = 'todo', MODE = 'qa', SCOPE = 'page', NOQA = false;
let curEl = null, curId = null, hideT = null, SELID = null, SELANCHOR = null, FOCUS = null;
const TAB_OF = { open: 'pending', resolved: 'resolved' };
const questions = () => window.HUB_QUESTIONS || [];
const answerOf = qid => window.HubAnswers ? window.HubAnswers.get(qid) : null;

/* labels come from the key itself: "ttrd-hub:/journeys/A?tab=flow" -> "journeys › A · flow" */
function pageLabel(page) {
  const s = String(page || '').slice(PREFIX.length), i = s.indexOf('?tab=');
  const path = (i < 0 ? s : s.slice(0, i)).replace(/^\//, '').split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } }).join(' › ');
  return (path || ROUTES.defaultRoute || '/') + (i < 0 ? '' : ' · ' + decodeURIComponent(s.slice(i + 5)));
}
function drawerLabel(dr) { const q = new URLSearchParams(dr || ''); return (q.get('d') || '') + (q.get('dt') ? ' · ' + q.get('dt') : ''); }
function currentTitle() { return (document.title || '').split(' · ')[0] || pageLabel(SLUG); }

function setSide(hidden) {
  document.documentElement.setAttribute('data-rw-side', hidden ? 'hidden' : 'shown');
  if (SIDE) SIDE.classList.toggle('rw-collapsed', hidden);
  const b = document.querySelector('.rw-side-btn'); if (b) b.textContent = hidden ? L.showSide : L.hideSide;
  store.set('ttrd_rw_side', hidden ? 'hidden' : 'shown');
}

function buildChrome() {
  const ban = el('div', 'review-banner'); ban.setAttribute('data-review-skip', '');
  ban.innerHTML = '<span class="rw-title">' + esc(L.bannerTitle) + '</span><span class="rw-route"></span>' + (ADAPTER.local ? '<span class="rw-local">' + esc(L.localOnly) + '</span>' : '') + '<span class="rw-spacer"></span><span class="rw-name">' + esc(ME) + '</span>';
  const side = el('button', 'rw-side-btn', esc(L.hideSide)); side.type = 'button'; side.onclick = () => setSide(!SIDE.classList.contains('rw-collapsed'));
  const exit = el('button', null, esc(L.exit)); exit.type = 'button'; exit.onclick = () => { const u = new URL(location.href); u.searchParams.delete('review'); location.href = u.toString(); };
  ban.appendChild(side); ban.appendChild(exit); document.body.appendChild(ban);
  ROUTE = ban.querySelector('.rw-route');

  SIDE = el('aside', 'review-sidebar'); SIDE.setAttribute('aria-label', L.sidebarTitle);
  SIDE.appendChild(el('h3', null, '<span>' + esc(L.sidebarTitle) + '</span>'));
  MODES = el('div', 'rw-modes');
  [['qa', L.modeQA], ['answers', L.modeAnswers]].forEach(([k, lbl]) => { const b = el('button', k === MODE ? 'on' : null, esc(lbl)); b.type = 'button'; b.dataset.m = k; b.onclick = () => setMode(k); MODES.appendChild(b); });
  SIDE.appendChild(MODES);
  SCOPEEL = el('div', 'rw-scopebar');
  [['page', L.scopePage], ['all', L.scopeAll]].forEach(([k, lbl]) => {
    const b = el('button', k === SCOPE ? 'on' : null, esc(lbl)); b.type = 'button'; b.dataset.s = k;
    b.onclick = () => { SCOPE = k; SCOPEEL.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.s === k)); render(); };
    SCOPEEL.appendChild(b);
  });
  SIDE.appendChild(SCOPEEL);
  TABS = el('div', 'review-tabs');
  [['open', L.tabOpen], ['resolved', L.tabResolved]].forEach(([k, lbl]) => {
    const b = el('button', k === FILTER ? 'on' : null, esc(lbl) + ' <span class="rw-c">0</span>'); b.type = 'button'; b.dataset.k = k;
    b.onclick = () => { FILTER = k; TABS.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.k === k)); render(); };
    TABS.appendChild(b);
  });
  SIDE.appendChild(TABS);
  QTABS = el('div', 'review-tabs rw-qtabs');
  [['todo', L.tabToAnswer], ['done', L.tabAnswered]].forEach(([k, lbl]) => {
    const b = el('button', k === QFILTER ? 'on' : null, esc(lbl) + ' <span class="rw-c">0</span>'); b.type = 'button'; b.dataset.k = k;
    b.onclick = () => { QFILTER = k; QTABS.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.k === k)); render(); };
    QTABS.appendChild(b);
  });
  SIDE.appendChild(QTABS);
  LIST = el('div', 'review-list'); SIDE.appendChild(LIST); document.body.appendChild(SIDE);
  const saved = store.get('ttrd_rw_side');
  setSide(saved ? saved === 'hidden' : window.matchMedia('(max-width:900px)').matches);   /* phones start hidden */

  PILL = el('button', 'review-floating-pill', esc(L.add)); PILL.type = 'button'; PILL.setAttribute('data-review-skip', '');
  document.body.appendChild(PILL);
  PILL.addEventListener('mouseenter', () => clearTimeout(hideT));
  PILL.addEventListener('mouseleave', hidePillSoon);
  PILL.addEventListener('click', () => { if (curId && curEl) openComposer(curId, curEl); });
  const rootSel = ROOTS.map(r => r[0]).join(',');
  document.addEventListener('mouseover', e => {
    if (NOQA || !e.target.closest || e.target.closest(CHROME_SEL)) return;
    let a = e.target.closest('[data-comment-id]');
    if (!a && e.target.closest(rootSel)) { anchorPass(); a = e.target.closest('[data-comment-id]'); }
    if (a && a.closest(rootSel)) { clearTimeout(hideT); placePill(a); }
  });
  /* phones: a tap on commentable text shows the pill there; the tap still does what it does in the hub */
  document.addEventListener('pointerdown', e => {
    if (NOQA || e.pointerType !== 'touch' || !e.target.closest || e.target.closest(CHROME_SEL)) return;
    const a = e.target.closest('[data-comment-id]');
    if (a && a.closest(rootSel)) { clearTimeout(hideT); placePill(a); } else hidePillSoon();
  }, true);
  document.addEventListener('mouseout', e => { const to = e.relatedTarget; if (to && (to === PILL || (to.closest && to.closest('[data-comment-id]')))) return; hidePillSoon(); });
  window.addEventListener('scroll', () => { if (curEl && PILL.style.display === 'block') placePill(curEl); }, true);
}
/* beside its element, not over it: on a short tab or link the pill would block the click */
function placePill(elm) {
  curEl = elm; curId = elm.getAttribute('data-comment-id'); PILL.style.display = 'block';
  const r = elm.getBoundingClientRect(), w = PILL.offsetWidth;
  PILL.style.top = Math.max(52, Math.min(r.top, window.innerHeight - 34)) + 'px';
  PILL.style.left = (r.right + 6 + w < window.innerWidth ? r.right + 6 : Math.max(6, r.left - w - 6)) + 'px';
}
function hidePillSoon() { hideT = setTimeout(() => { PILL.style.display = 'none'; curEl = null; curId = null; }, 160); }

function modal(title, ctx, initText, initRepl, onSave) {
  const back = document.activeElement;
  const ov = el('div', 'review-modal-overlay'), m = el('div', 'review-modal'); m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.innerHTML = '<h4>' + esc(title) + '</h4><div class="rw-ctx">' + esc(ctx) + '</div>';
  const ta = el('textarea'); ta.placeholder = L.placeholder; ta.value = initText || '';
  const tr = el('textarea'); tr.placeholder = L.replacementPlaceholder; tr.value = initRepl || ''; tr.style.minHeight = '44px';
  const acts = el('div', 'rw-modal-acts');
  const close = () => { ov.remove(); if (back && back.focus && document.contains(back)) back.focus(); };
  const cancel = el('button', 'rw-cancel', esc(L.cancel)); cancel.type = 'button'; cancel.onclick = close;
  const save = el('button', 'rw-save', esc(L.save)); save.type = 'button';
  save.onclick = () => { const t = ta.value.trim(), r = tr.value.trim(); if (!t && !r) return; onSave(t, r); close(); };
  acts.appendChild(cancel); acts.appendChild(save); m.appendChild(ta); m.appendChild(tr); m.appendChild(acts); ov.appendChild(m);
  ov.onclick = e => { if (e.target === ov) close(); };
  /* its own Escape and Tab, stopped here, so one Escape does not also close the hub's drawer */
  ov.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      e.stopPropagation(); const f = [ta, tr, cancel, save], i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  document.body.appendChild(ov); ta.focus();
}
function openComposer(anchor, elm) {
  if (NOQA) return;
  /* the element's text is shown so the reviewer knows what they comment on; it is not stored */
  const live = (elm.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const inDrawer = rootIsDrawer(elm), page = SLUG, drawer = inDrawer ? DRAWER : '';
  modal(L.addTitle, currentTitle() + (drawer ? ' · ' + drawerLabel(drawer) : '') + ' · ' + live, '', '', (text, repl) => {
    const rec = { comment: text, replacement: repl || null, anchor: anchor, page: page, author: ME, status: 'pending', timestamp: Date.now() };
    if (drawer) rec.drawer = drawer;
    saveOr(ADAPTER.create(rec));
  });
}
function saveOr(pr) { return Promise.resolve(pr).catch(e => { console.warn('[review] write failed', e); tell(L.saveFailed); }); }
function actBtn(label, cls, fn) { const b = el('button', cls, esc(label)); b.type = 'button'; b.onclick = ev => { ev.stopPropagation(); fn(); }; return b; }
function targetOf(c) { if (!visibleHere(c)) return null; return visibleTarget(document.querySelector('[data-comment-id="' + cssq(c.anchor) + '"]')); }
function visibleTarget(e0) { for (let e = e0; e && e.getBoundingClientRect; e = e.parentElement) { const r = e.getBoundingClientRect(); if (r.width || r.height) return e; } return null; }

function setMode(m) {
  MODE = m; MODES.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.m === m));
  SCOPEEL.style.display = TABS.style.display = m === 'qa' ? '' : 'none'; QTABS.style.display = m === 'answers' ? '' : 'none';
  render();
}
function renderAnswers() {
  const qs = questions(), done = qs.filter(q => answerOf(q.id));
  QTABS.querySelector('[data-k="todo"] .rw-c').textContent = qs.length - done.length; QTABS.querySelector('[data-k="done"] .rw-c').textContent = done.length;
  const show = qs.filter(q => QFILTER === 'done' ? answerOf(q.id) : !answerOf(q.id));
  LIST.innerHTML = '';
  LIST.appendChild(el('div', 'rw-qa-prog', '<span>' + esc(L.answeredOf.replace('{n}', done.length).replace('{total}', qs.length)) + '</span><i><b style="width:' + (qs.length ? done.length / qs.length * 100 : 0) + '%"></b></i>'));
  if (!show.length) { LIST.appendChild(el('div', 'review-empty', esc(QFILTER === 'done' ? L.emptyAnswered : L.emptyToAnswer))); return; }
  let group = null;
  show.forEach(q => {
    if (q.group !== group) { group = q.group; LIST.appendChild(el('div', 'review-group', esc(group))); }
    const a = answerOf(q.id), card = el('button', 'rw-qa-card' + ((window.Hub && Hub.state.d) === 'qa:' + q.id ? ' rw-selected' : '')); card.type = 'button'; card.dataset.q = q.id;
    card.appendChild(el('div', 'rw-qa-q', esc(q.q)));
    if (q.when) card.appendChild(el('div', 'rw-qa-why', esc(q.when)));
    if (a) {
      card.appendChild(el('div', 'rw-qa-a', esc(a.summary || '')));
      card.appendChild(el('div', 'rw-qa-by', esc(a.author || '') + ' · ' + esc(when(a.timestamp)) + (a.files && a.files.length ? ' · ' + a.files.length + ' ' + esc(L.filesLabel) : '')));
    }
    card.onclick = () => { if (window.Hub) { Hub.open('qa:' + q.id); if (window.matchMedia('(max-width:900px)').matches) setSide(true); } };
    LIST.appendChild(card);
  });
}
function decorate() {
  document.querySelectorAll('.has-comment,.has-applied-comment').forEach(e => { e.classList.remove('has-comment', 'has-applied-comment'); if (e.dataset.rwPos) { e.style.position = ''; delete e.dataset.rwPos; } });
  document.querySelectorAll('.rw-dots').forEach(e => e.remove());
  if (NOQA) return;
  const by = {};
  Object.values(COMMENTS).forEach(c => { if (!visibleHere(c)) return; const r = by[c.anchor] || (by[c.anchor] = { active: 0, resolved: 0 }); if (statusOf(c) === 'resolved') r.resolved++; else r.active++; });
  Object.keys(by).forEach(an => {
    const r = by[an];
    document.querySelectorAll('[data-comment-id="' + cssq(an) + '"]').forEach(a => {
      a.classList.add(r.active > 0 ? 'has-comment' : 'has-applied-comment');
      /* review widget 1.6.0: the dots need a containing block, but only a static element gets one, inline, so review
         mode never reflows a positioned host element (anchor-strategy.md, "Review mode never reflows the host page") */
      if (getComputedStyle(a).position === 'static') { a.style.position = 'relative'; a.dataset.rwPos = '1'; }
      const d = document.createElement('span'); d.className = 'rw-dots'; d.setAttribute('aria-hidden', 'true');
      let h = ''; for (let i = 0; i < r.active; i++) h += '<i class="rw-dot rw-dot-active"></i>'; for (let i = 0; i < r.resolved; i++) h += '<i class="rw-dot rw-dot-resolved"></i>';
      d.innerHTML = h; a.appendChild(d);
    });
  });
}
function render() {
  if (!LIST) return;
  const focusRow = document.activeElement && document.activeElement.closest && document.activeElement.closest('.review-row');
  const focusId = focusRow && focusRow.dataset.id;
  if (ROUTE) ROUTE.textContent = '· ' + currentTitle() + (DRAWER ? ' · ' + drawerLabel(DRAWER) : '');
  decorate();
  if (MODE === 'answers') { applyActive(); renderAnswers(); return; }
  const all = Object.entries(COMMENTS).filter(([, c]) => isHub(c));
  const source = SCOPE === 'all' ? all : all.filter(([, c]) => onScreen(c));
  const counts = { pending: 0, resolved: 0 };
  source.forEach(([, c]) => { counts[statusOf(c)]++; });
  TABS.querySelectorAll('button').forEach(b => { b.querySelector('.rw-c').textContent = counts[TAB_OF[b.dataset.k]] || 0; });
  const rows = readingOrder(source.filter(([, c]) => statusOf(c) === TAB_OF[FILTER]));
  LIST.innerHTML = '';
  if (!rows.length) { LIST.appendChild(el('div', 'review-empty', esc(L.empty))); applyActive(); return; }
  const grouped = SCOPE === 'all', groups = {};
  rows.forEach(e => { const k = grouped ? e[1].page : ''; (groups[k] || (groups[k] = [])).push(e); });
  const order = Object.keys(groups).sort((a, b) => a === SLUG ? -1 : b === SLUG ? 1 : pageLabel(a).localeCompare(pageLabel(b)));
  order.forEach(pg => {
    if (grouped) {
      const hdr = el('div', 'rw-group' + (pg === SLUG ? ' rw-group-here' : ''));
      hdr.innerHTML = '<span class="rw-group-name">' + esc(pg === SLUG ? L.thisPage : pageLabel(pg)) + '</span><span class="rw-group-count">' + groups[pg].length + '</span>';
      LIST.appendChild(hdr);
    }
    groups[pg].forEach(([id, c]) => {
      const st = statusOf(c), vis = visibleHere(c);
      const row = el('div', 'review-row' + (id === SELID ? ' rw-selected' : '') + (vis ? '' : ' rw-offpage')); row.dataset.id = id; row.tabIndex = 0;
      row.innerHTML = '<div class="rw-meta"><b>' + esc(c.author || L.anonymous) + '</b><span class="rw-badge rw-' + st + '">' + esc(st === 'resolved' ? L.badgeResolved : L.badgeOpen) + '</span>' +
        (c.drawer ? '<span class="rw-drawer-chip">' + esc(drawerLabel(c.drawer)) + '</span>' : '') + (vis ? '' : '<span class="rw-jump">' + esc(L.opens) + '</span>') +
        '<span>' + when(c.timestamp) + (c.edited_at ? ' · ' + esc(L.edited) : '') + '</span></div>' +
        '<div class="rw-body">' + esc(c.comment || '') + '</div>' + (c.replacement ? '<div class="rw-repl">↳ ' + esc(c.replacement) + '</div>' : '') +
        (st === 'resolved' && c.resolution ? '<div class="rw-resolution">✓ ' + esc(c.resolution) + '</div>' : '') + '<div class="rw-anchor">' + esc(c.anchor) + '</div>';
      const acts = el('div', 'rw-acts');
      if (st === 'pending') {
        acts.appendChild(actBtn(L.edit, 'edit-btn', () => modal(L.editTitle, c.anchor, c.comment || '', c.replacement || '', (t, r) => saveOr(ADAPTER.update(id, { comment: t, replacement: r || null, edited_at: Date.now() })))));
        acts.appendChild(actBtn(L.resolve, 'resolve-btn', () => { const note = (ask(L.resolvePrompt) || '').trim(); saveOr(ADAPTER.update(id, { status: 'resolved', resolution: note || L.resolvedBy.replace('{name}', ME), resolved_at: Date.now(), resolved_by: ME })); }));
      } else acts.appendChild(actBtn(L.reopen, 'restore-btn', () => saveOr(ADAPTER.update(id, { status: 'pending', resolution: null }))));
      acts.appendChild(actBtn(L.del, 'delete-btn', () => { if (sure(L.deleteConfirm)) saveOr(ADAPTER.remove(id)); }));
      row.appendChild(acts);
      const go = vis ? () => { SELID = id; spotlight(c); render(); } : () => jumpTo(id, c);
      row.onclick = go; row.onkeydown = e => { if (e.key === 'Enter' && e.target === row) go(); };
      LIST.appendChild(row);
    });
  });
  if (focusId) { const r = LIST.querySelector('.review-row[data-id="' + cssq(focusId) + '"]'); if (r) r.focus(); }
  applyActive();
}
/* reading order of the elements on screen (rows top to bottom, left to right); the rest after, oldest first */
function readingOrder(entries) {
  const pos = new Map();
  entries.forEach(e => { const t = targetOf(e[1]); if (!t) return; const r = t.getBoundingClientRect(); if (!r.width && !r.height) return; pos.set(e[0], { top: r.top + window.pageYOffset, bottom: r.bottom + window.pageYOffset, left: r.left + window.pageXOffset }); });
  const ts = e => e[1].timestamp || 0;
  const placed = entries.filter(e => pos.has(e[0])).sort((a, b) => pos.get(a[0]).top - pos.get(b[0]).top || ts(a) - ts(b));
  const band = new Map(); let row = 0, bottom = -Infinity;
  placed.forEach(e => { const p = pos.get(e[0]); if (p.top >= bottom) { row++; bottom = p.bottom; } else bottom = Math.min(bottom, p.bottom); band.set(e[0], row); });
  placed.sort((a, b) => band.get(a[0]) - band.get(b[0]) || pos.get(a[0]).left - pos.get(b[0]).left || pos.get(a[0]).top - pos.get(b[0]).top || ts(a) - ts(b));
  return placed.concat(entries.filter(e => !pos.has(e[0])).sort((a, b) => ts(a) - ts(b)));
}
function applyActive() {
  document.querySelectorAll('.rw-active-anchor').forEach(e => e.classList.remove('rw-active-anchor'));
  const c = SELID && COMMENTS[SELID]; if (!c || !SELANCHOR || !visibleHere(c)) return;
  document.querySelectorAll('[data-comment-id="' + cssq(SELANCHOR) + '"]').forEach(a => { const t = visibleTarget(a); if (t) t.classList.add('rw-active-anchor'); });
}
function spotlight(c) {
  SELANCHOR = c.anchor; applyActive();
  const a = targetOf(c); if (!a) return null;
  a.scrollIntoView({ behavior: 'smooth', block: 'center' });
  a.classList.remove('rw-spot'); void a.offsetWidth; a.classList.add('rw-spot'); setTimeout(() => a.classList.remove('rw-spot'), 1200);
  return a;
}
/* another screen or drawer: the host opens it (by the anchor where it can, else by the stored address), then the element
 * is spotlit once it exists. ?review=1 is in the query, so the session survives the hash change. */
function jumpTo(id, c) {
  SELID = id; FOCUS = { id: id, tries: 0 };
  if (window.matchMedia('(max-width:900px)').matches) setSide(true);
  let opened = false;
  if (!AUTO.test(c.anchor) && window.__rwReveal) { try { opened = !!window.__rwReveal(c.anchor); } catch (e) {} }
  if (!opened) {
    let h = '#' + c.page.slice(PREFIX.length);
    if (c.drawer) h += (h.indexOf('?') < 0 ? '?' : '&') + c.drawer;
    if (location.hash !== h) location.hash = h;
  }
  setTimeout(tryFocus, 60);
}
function tryFocus() {
  if (!FOCUS) return;
  const c = COMMENTS[FOCUS.id]; if (!c) { FOCUS = null; return; }
  syncRoute(); anchorPass();
  const want = statusOf(c) === 'resolved' ? 'resolved' : 'open';
  if (FILTER !== want) { FILTER = want; TABS.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.k === want)); }
  if (spotlight(c)) { FOCUS = null; render(); return; }
  if (++FOCUS.tries < 12) setTimeout(tryFocus, 250); else { FOCUS = null; render(); }
}
function syncRoute() {
  const s = screenKey(), d = drawerKey();
  if (location.hash === LASTHASH && s === SLUG && d === DRAWER) return false;
  LASTHASH = location.hash;
  if (s !== SLUG && !FOCUS) { SELANCHOR = null; SELID = null; }
  SLUG = s; DRAWER = d; return true;
}
/* hash-route-screens.md: the comment rows the hub's own views read (chassis module comments) */
function commentRows() {
  return Object.entries(COMMENTS).filter(([, c]) => isHub(c)).map(([id, c]) => ({ id: id, anchor: c.anchor, ref: new URLSearchParams(c.drawer || '').get('d') || undefined,
    route: c.page.slice(PREFIX.length), author: c.author || L.anonymous, text: c.comment || '', status: statusOf(c), at: c.timestamp }));
}

(async function init() {
  const HA = window.HubAnswers;
  if (HA) { if (!HA.started && HA.start) HA.start(); await HA.ready; }   /* behind the gate this settles after the hub opens */
  /* with accounts, the author is the signed-in account and QA is for team accounts only */
  const acct = !!(HA && HA.backend);
  ME = acct ? (HA.user ? HA.user.name : L.notSignedIn) : (store.get('ttrd_reviewer') || (() => { const n = (ask(L.namePrompt) || '').trim() || L.anonymous; store.set('ttrd_reviewer', n); return n; })());
  NOQA = acct && !HA.canQA();
  ADAPTER = NOQA ? EMPTY : (acct ? HA.comments() : null) || (acct ? EMPTY : localAdapter());
  buildChrome();
  if (NOQA) { document.documentElement.setAttribute('data-rw-noqa', ''); MODES.querySelector('[data-m="qa"]').remove(); setMode('answers'); }
  else setMode('qa');
  anchorPass();
  let scheduled = false;
  const soon = () => { if (scheduled) return; scheduled = true; queueMicrotask(() => { scheduled = false; syncRoute(); anchorPass(); render(); if (FOCUS) tryFocus(); }); };
  /* late content (a list filter, a lazy tab), batched; our own dots are skipped or render() would loop */
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes || []) {
      if (!n || n.nodeType !== 1 || (n.closest && n.closest(CHROME_SEL)) || (n.classList && n.classList.contains('rw-dots'))) continue;
      soon(); return;
    }
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', soon);
  window.__rwRefresh = soon;   /* the chassis calls it after every screen and drawer change (hostRefresh) */
  window.__rwComments = commentRows;
  if (HA) HA.onChange(() => { if (MODE === 'answers') render(); });
  ADAPTER.subscribe(data => {
    const o = {}; Object.keys(data || {}).forEach(k => { o[k] = renamed(data[k]); }); COMMENTS = o;
    if (window.Hub && Hub.comments) { if (!commentRows.wired) { commentRows.wired = true; Hub.comments.source(() => Promise.resolve(commentRows())); } else Hub.comments.read(); }
    render(); if (FOCUS) tryFocus();
  });
})();
})();
