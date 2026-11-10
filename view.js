/* The public view of one hub page (view.html#<token>). Plain shell code: it holds no hub data and needs no sign-in.
 * It fetches the copy that public-view.js made (Storage hubs/ttrd/public/<token>.json, readable by anyone who has the
 * token; listing is refused) and draws it: the page's main column, its views (data-pv) and its drawers (data-pd), the
 * Vault's Desktop/Phone switch and Save as PDF. Nothing here leads to another hub page: the copy has no such links.
 * Words: the pub* labels in hub.config.js. Colours: the tokens in hub.config.js, set the way the chassis sets them. */
(function () {
  var cfg = window.HUB_CONFIG || {}, L = cfg.labels || {}, fb = window.FIREBASE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var t = function (k, v) { var s = L[k] || k; Object.keys(v || {}).forEach(function (x) { s = s.split('{' + x + '}').join(v[x]); }); return s; };
  var DATA = null, VIEW = '', DRAWER = null, WIDTH = 'desk', lastFocus = null;

  /* ─── identity: the chassis' token names (hub-core.js applyTokens), brand, words ─── */
  (function () {
    var BRAND = { accent: 'primary-deep', bg: 'surface-base', soft: 'surface-tint', line: 'rule', ink: 'text-default', mute: 'text-soft', head: 'neutral-deep' }, KEY = {};
    Object.keys(BRAND).forEach(function (k) { KEY[BRAND[k]] = k; });
    var name = function (k) { return BRAND[k] ? '--' + BRAND[k] : KEY[k] ? '--' + k : '--hub-' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); };
    var tk = cfg.tokens || {}, body = Object.keys(tk).filter(function (k) { return /^[a-z0-9][a-zA-Z0-9-]*$/.test(k); }).map(function (k) { return name(k) + ':' + String(tk[k]).replace(/[;{}]/g, ''); }).join(';');
    var st = document.createElement('style'); st.textContent = ':root{' + body + '}'; document.head.appendChild(st);
    if (cfg.lang) { document.documentElement.setAttribute('lang', cfg.lang); }
    if (cfg.fonts && cfg.fonts.body) { document.documentElement.style.setProperty('--hub-font', cfg.fonts.body); }
    var b = cfg.brand || {};
    $('app-brand').innerHTML = '<span>' + esc(b.name || '') + '</span>' + (b.sub ? '<small>' + esc(b.sub) + '</small>' : '');
    $('drawer-close').setAttribute('aria-label', t('pubClose'));
    document.documentElement.style.setProperty('--htop', $('app-bar').offsetHeight + 'px');
  })();

  function message(title, body) {
    $('app-main').innerHTML = '<div class="pg"><div class="notfound"><h1>' + esc(title) + '</h1>' + (body ? '<p class="lead">' + esc(body) + '</p>' : '') + '</div></div>';
    document.title = title;
  }
  function source(tok) {
    var path = encodeURIComponent('hubs/ttrd/public/' + tok + '.json'), emu = fb.emulator;
    var host = emu ? 'http://127.0.0.1:' + emu.storage : 'https://firebasestorage.googleapis.com';
    return host + '/v0/b/' + encodeURIComponent(fb.storageBucket || '') + '/o/' + path + '?alt=media';
  }

  /* ─── main: one view of the page at a time ─── */
  function showView(key, focus) {
    if (!DATA) { return; }
    key = DATA.views[key] != null ? key : (DATA.alias || {})[key] != null ? DATA.alias[key] : DATA.first;
    VIEW = key;
    var m = $('app-main');
    m.classList.toggle('pg-wide', /class="pg wide"/.test(DATA.views[key].slice(0, 400)));
    m.innerHTML = DATA.views[key] + '<p class="pv-foot">' + esc(t('pubFoot', { date: day(DATA.takenAt) })) + '</p>';
    setWidth(WIDTH);
    markSelected();
    m.scrollTop = 0;
    if (focus) { m.focus({ preventScroll: true }); }
  }
  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(cfg.locale || 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.toTimeString().slice(0, 5); }
  /* the Vault's Desktop 600 / Phone 375 switch */
  function setWidth(w) {
    WIDTH = w;
    all('.vbox').forEach(function (b) { b.classList.toggle('vbox-desk', w === 'desk'); b.classList.toggle('vbox-phone', w === 'phone'); });
    all('[data-vault-w]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-vault-w') === w); });
  }
  function markSelected() {
    all('.sel').forEach(function (e) { e.classList.remove('sel'); });
    if (DRAWER) { all('[data-pd]').forEach(function (e) { if (e.getAttribute('data-pd') === DRAWER.ref && e.closest('#app-main')) { e.classList.add('sel'); } }); }
  }

  /* ─── drawers, as the chassis draws them (title, sub, tabs, panel) ─── */
  function openDrawer(ref, tab) {
    var it = DATA && DATA.drawers[ref]; if (!it) { return; }
    var d = $('app-drawer');
    if (!d.classList.contains('open')) { lastFocus = document.activeElement; }
    DRAWER = { ref: ref, it: it };
    $('drawer-title').textContent = it.title;
    $('drawer-sub').innerHTML = it.sub || '';
    paint(tab || it.tabs[0][0]);
    d.classList.add('open'); d.classList.toggle('wide', !!it.wide); d.classList.toggle('xwide', it.wide === 'x');
    d.setAttribute('aria-hidden', 'false'); d.removeAttribute('inert');
    document.body.classList.add('has-drawer'); document.body.classList.toggle('drawer-wide', !!it.wide && it.wide !== 'x'); document.body.classList.toggle('drawer-xwide', it.wide === 'x');
    $('app-scrim').hidden = false;
    markSelected();
    $('drawer-close').focus({ preventScroll: true });
  }
  function paint(key) {
    var it = DRAWER.it, cur = it.tabs.filter(function (x) { return x[0] === key; })[0] || it.tabs[0], bar = '';
    if (it.tabs.length > 1) {
      bar = '<div class="dtabs" role="tablist">' + it.tabs.map(function (x) {
        var on = x[0] === cur[0];
        return '<button type="button" role="tab" id="dtab-' + esc(x[0]) + '" aria-controls="dpanel" data-dt="' + esc(x[0]) + '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' + esc(x[1]) + '</button>';
      }).join('') + '</div>';
    }
    $('drawer-body').innerHTML = bar + '<div class="dpanel" id="dpanel" role="tabpanel" tabindex="-1">' + cur[2] + '</div>';
    $('drawer-body').scrollTop = 0;
    setWidth(WIDTH);
  }
  function closeDrawer() {
    var d = $('app-drawer'); if (!d.classList.contains('open')) { return; }
    d.classList.remove('open', 'wide', 'xwide'); d.setAttribute('aria-hidden', 'true'); d.setAttribute('inert', '');
    document.body.classList.remove('has-drawer', 'drawer-wide', 'drawer-xwide'); $('app-scrim').hidden = true;
    var ref = DRAWER && DRAWER.ref; DRAWER = null; markSelected();
    var back = lastFocus && document.contains(lastFocus) && lastFocus !== document.body ? lastFocus : (ref && document.querySelector('#app-main [data-pd="' + CSS.escape(ref) + '"]')) || $('app-main');
    back.focus({ preventScroll: true }); lastFocus = null;
  }

  /* ─── events ─── */
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-dt], [data-pd], [data-pv], [data-vault-w], #drawer-close, #app-scrim, #pv-print');
    if (!c) { return; }
    if (c.id === 'drawer-close' || c.id === 'app-scrim') { closeDrawer(); return; }
    if (c.id === 'pv-print') { window.print(); return; }
    if (c.hasAttribute('data-dt')) { paint(c.getAttribute('data-dt')); var b = $('drawer-body').querySelector('[data-dt="' + CSS.escape(c.getAttribute('data-dt')) + '"]'); if (b) { b.focus({ preventScroll: true }); } return; }
    if (c.hasAttribute('data-vault-w')) { e.preventDefault(); setWidth(c.getAttribute('data-vault-w')); return; }
    e.preventDefault();
    if (c.hasAttribute('data-pd')) { openDrawer(c.getAttribute('data-pd')); return; }
    if (c.hasAttribute('data-pv')) { closeDrawer(); showView(c.getAttribute('data-pv'), true); }
  });
  document.addEventListener('keydown', function (e) {
    var tg = e.target;
    if (e.key === 'Escape') { closeDrawer(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && tg.matches && tg.matches('[data-pd], [data-pv]') && !tg.matches('button')) { e.preventDefault(); tg.click(); return; }
    var bar = tg.closest && tg.closest('[role="tablist"]');
    if (bar && /^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) {
      var list = all('[role="tab"]', bar), at = list.indexOf(tg), to = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
      e.preventDefault(); list[to].focus(); list[to].click();
    }
  });
  window.addEventListener('hashchange', function () { location.reload(); });

  /* ─── load ─── */
  var tok = location.hash.replace(/^#/, '');
  $('app-main').innerHTML = '<div class="pg"><p class="hint">' + esc(t('pubLoading')) + '</p></div>';
  if (!/^[A-Za-z0-9_-]{22}$/.test(tok) || !fb.storageBucket) { message(t('pubNotShared'), t('pubNotSharedBody')); return; }
  fetch(source(tok), { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }).then(function (r) {
    if (r.status === 404 || r.status === 403) { return null; }
    if (!r.ok) { throw new Error('status ' + r.status); }
    return r.json();
  }).then(function (data) {
    if (!data || data.v !== 1 || !data.views || data.views[data.first] == null) { message(t('pubNotShared'), t('pubNotSharedBody')); return; }
    DATA = data;
    document.title = data.title + ' · ' + ((cfg.brand || {}).name || '');
    var p = $('pv-print'); p.textContent = t('pubPdf'); p.hidden = false;
    showView(data.first);
  }).catch(function (e) { console.error('[view]', e); message(t('pubFailed')); });
})();
