/* TenTrade review hub — renders window.JOURNEY_DATA (built by
 * tools/journey-prototype/build.py). Left: sections (planning, journeys, blasts,
 * segments, calendar, strategy, reporting, PanUI). Main: a page, or a journey as a
 * map of builder steps like Voyager's canvas. Right: a drawer with a step's setup
 * or an email preview. Read-only: nothing here talks to Voyager. */
(function () {
  'use strict';
  var D = window.JOURNEY_DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };

  var TYPES = {
    'Trigger':   { k: 'trigger', icon: '▶', label: 'Trigger' },
    'Send':      { k: 'send',    icon: '✉', label: 'Send email' },
    'Wait':      { k: 'wait',    icon: '⏱', label: 'Wait' },
    'Wait for':  { k: 'wait',    icon: '⏱', label: 'Wait' },
    'Branch':    { k: 'branch',  icon: '⑂', label: 'Branch' },
    'A/B split': { k: 'split',   icon: '⚖', label: 'A/B split' },
    'Webhook':   { k: 'webhook', icon: '⇄', label: 'Webhook' },
    'Call task': { k: 'call',    icon: '☎', label: 'Call task' },
    'Exit':      { k: 'exit',    icon: '⏹', label: 'Exit' }
  };
  var GOAL_GROUPS = [
    ['First deposit', ['A', 'B', 'G']],
    ['Deposit again', ['C']],
    ['Keep depositing', ['D', 'E', 'F']],
    ['Webinar follow-ups', ['H', 'I', 'J']]
  ];
  // Voyager's field labels, as the Branch / Wait-for field picker lists them.
  var FIELD_LABEL = {
    'verified': 'verified (bool)', 'registrationDate': 'registrationDate (date)', 'firstDepositDate': 'firstDepositDate (date)',
    'lastDepositDate': 'lastDepositDate (date)', 'lastLoginDate': 'lastLoginDate (date)', 'lastTradedAt': 'lastTradedAt (date)',
    'status': 'status (string)', 'tags': 'tags (string)', 'partnerId': 'partnerId (string)',
    'MT5 balance': 'MT5 balance (number)', 'MT5 open positions': 'MT5 open positions (number)'
  };
  var AUDIENCE_ORDER = ['Countries', 'Tags', 'Tags (any of)', 'Manager IDs', 'Is IB', 'IB IDs', 'Master IB IDs', 'Verified', 'Lead',
    'UTM source', 'UTM medium', 'UTM campaign', 'Balance (MT5)', 'First deposit', 'Last deposit', 'Registered', 'Birth date',
    'Last traded', 'Last login', 'Open positions'];

  var byId = {};
  D.journeys.forEach(function (j) { byId[j.id] = j; });

  // Hub pages from hub-pages.json, by id, with their section.
  var PAGES = {}, SECTIONS = D.sections || [];
  SECTIONS.forEach(function (sec) { sec.pages.forEach(function (pg) { PAGES[pg.id] = { page: pg, sec: sec }; }); });
  var LANDING = PAGES[D.landing] ? '#p/' + D.landing : '#overview';

  var state = { view: 'overview', j: null, tab: 'flow', step: null, email: null, page: null, sub: null };

  /* ---- review-widget integration ----
   * Every commentable element carries a stable data-comment-id. The ids encode
   * where the element lives (j-A-A9 = journey A, step A9; em-S03-E1 = email
   * S03-E1; ov-p3 = overview paragraph 3) so __rwReveal can navigate to it when
   * a reviewer clicks a comment in the sidebar. */
  function tagProse(root, prefix) {
    var n = {};
    Array.prototype.forEach.call(root.querySelectorAll('h3,h4,p,li,tr'), function (el) {
      if (el.closest('[data-comment-id]') && el.closest('[data-comment-id]') !== el) { return; }
      var tag = el.tagName.toLowerCase();
      n[tag] = (n[tag] || 0) + 1;
      el.setAttribute('data-comment-id', prefix + '-' + tag + n[tag]);
    });
  }
  function refreshReview() { if (window.__rwRefresh) { try { window.__rwRefresh(); } catch (e) { /* widget not ready */ } } }

  /* ------------------------------------------------------------ navigation */
  // Sections are always listed; the active section opens to show its pages.
  function activeSection() {
    if (state.view === 'page') { return PAGES[state.page].sec.id; }
    return 'journeys';
  }
  function sectionHref(sec) { return sec.kind === 'journeys' ? '#overview' : '#p/' + sec.pages[0].id; }
  function navItem(href, v, mark, title, sub) {
    return '<a href="' + href + '" data-v="' + v + '" class="it"><span class="lt">' + mark + '</span><span><span class="t">' + esc(title) + '</span>' +
      (sub ? '<span class="s">' + esc(sub) + '</span>' : '') + '</span></a>';
  }
  // Which sections are expanded. Each header toggles its own section; opening a
  // page expands the section it belongs to. Remembered per browser when possible.
  var EXPANDED = (function () { try { return JSON.parse(localStorage.getItem('ttrd_nav_open')) || {}; } catch (e) { return {}; } })();
  var lastActive = null;
  function saveExpanded() { try { localStorage.setItem('ttrd_nav_open', JSON.stringify(EXPANDED)); } catch (e) { /* private mode */ } }
  function toggleSection(id) { EXPANDED[id] = !EXPANDED[id]; saveExpanded(); renderNav(); }
  function setAllSections(open) { SECTIONS.forEach(function (sec) { EXPANDED[sec.id] = open; }); saveExpanded(); renderNav(); }
  function renderNav() {
    var act = activeSection();
    if (act !== lastActive) { EXPANDED[act] = true; lastActive = act; saveExpanded(); }
    var allOpen = SECTIONS.every(function (sec) { return EXPANDED[sec.id]; });
    var h = '<div class="brand"><b>TenTrade</b><small>CRM &amp; email · review hub</small></div>' +
      '<button type="button" class="navall" data-nav-all="' + (allOpen ? '0' : '1') + '">' + (allOpen ? 'Collapse all' : 'Expand all') + '</button>';
    SECTIONS.forEach(function (sec) {
      var open = !!EXPANDED[sec.id], cur = sec.id === act;
      h += '<button type="button" class="sec' + (open ? ' open' : '') + (cur ? ' cur' : '') + '" data-toggle-sec="' + esc(sec.id) + '" aria-expanded="' + open + '" title="' + (open ? 'Collapse' : 'Expand') + ' ' + esc(sec.title) + '">' +
        '<span class="si">' + esc(sec.icon || '•') + '</span><span class="sx"><span class="t">' + esc(sec.title) + '</span><span class="s">' + esc(sec.sub || '') + '</span></span><span class="chev" aria-hidden="true">▸</span></button>';
      if (!open) { return; }
      h += '<div class="items">';
      if (sec.kind === 'journeys') {
        h += navItem('#overview', 'overview', '≡', 'Overview', 'Goals, hand-overs, CRM tags');
        GOAL_GROUPS.forEach(function (g) {
          h += '<div class="grp">' + esc(g[0]) + '</div>';
          g[1].forEach(function (id) {
            var j = byId[id]; if (!j) { return; }
            var sends = j.steps.filter(function (x) { return x.type === 'Send'; }).length;
            h += navItem('#j/' + id, 'j/' + id, id, j.name, j.steps.length + ' steps · ' + sends + ' emails');
          });
        });
        h += '<div class="grp">Reference</div>';
        h += navItem('#sets', 'sets', '✉', 'Email sets', 'All drafted copy, S01–S' + String(D.sets.length).padStart(2, '0'));
        h += navItem('#builder', 'builder', '⚙', 'Builder options', 'What Voyager allows');
      } else {
        sec.pages.forEach(function (pg, i) {
          h += navItem('#p/' + pg.id, 'p/' + pg.id, sec.pages.length > 1 ? String(i + 1) : (sec.icon || '•'), pg.title, pg.sub);
        });
      }
      h += '</div>';
    });
    h += '<div class="foot">Review hub · read-only<br>Built ' + esc(D.built) + ' from the project docs.<br>Nothing here is live in Voyager.</div>';
    $('#nav').innerHTML = h;
    markNav();
  }
  function markNav() {
    var key = state.view === 'journey' ? 'j/' + state.j : state.view === 'page' ? 'p/' + state.page : state.view;
    Array.prototype.forEach.call(document.querySelectorAll('#nav a.it'), function (a) { a.classList.toggle('on', a.dataset.v === key); });
  }

  /* ------------------------------------------------------------- summaries */
  function condText(c) {
    var v = c.value ? (c.op === 'in last N days' || c.op === 'over N days ago' ? '' : ' ' + c.value) : '';
    var op = c.op === 'in last N days' ? 'in last ' + c.value + ' days' : c.op === 'over N days ago' ? 'over ' + c.value + ' days ago' : c.op;
    return c.field + ' ' + op + v;
  }
  function condsSummary(cfg) {
    var cs = cfg.conditions || [];
    if (!cs.length) { return '—'; }
    // collapse "status equals A, B, C"
    var allSame = cs.every(function (c) { return c.field === cs[0].field && c.op === cs[0].op; });
    if (allSame && cs.length > 2) { return cs[0].field + ' ' + cs[0].op + ' ' + cs.slice(0, 3).map(function (c) { return c.value; }).join(', ') + '… (' + cs.length + ')'; }
    var joiner = cfg.match === 'any' ? ' OR ' : ' AND ';
    return cs.map(condText).join(joiner);
  }
  function summary(s) {
    var c = s.config;
    switch (s.type) {
      case 'Trigger': return 'automated (CRM segment)';
      case 'Send': {
        var e = D.emails[c.template] || {};
        return '<span class="eid">' + esc(c.template) + '</span><span class="subj">' + esc(e.subject || '—') + '</span>';
      }
      case 'Wait': return c.mode === 'until' ? 'until ' + esc(c.time) + (c.weekday && c.weekday !== 'any day' ? ' ' + esc(c.weekday) : ', any day') : 'wait ' + esc(c.amount) + ' ' + esc(c.unit);
      case 'Wait for': return 'for ' + esc(condsSummary(c)) + ' · ≤ ' + esc(c.giveUp) + ' ' + esc(c.giveUpUnit);
      case 'Branch': return esc(condsSummary(c));
      case 'A/B split': return 'A ' + esc(c.weight) + '% · B ' + (100 - (+c.weight || 0)) + '% · auto: ' + esc(c.auto);
      case 'Call task': return esc(c.note);
      case 'Exit': return 'ends the journey for the contact';
    }
    return esc(c.raw || '');
  }

  /* ---------------------------------------------------------------- views */
  // Notice on every page: the content is speculative and for demonstration.
  // Texts live in hub-pages.json ("notice"), with per-section wording.
  function noticeHtml() {
    var N = D.notice || {}, sec = activeSection();
    var text = (N.sections && N.sections[sec]) || N['default'];
    if (!text) { return ''; }
    return '<div class="notice" role="note" data-comment-id="notice-' + esc(sec) + '"><b>' + esc(N.label || 'Notice') + '</b><span>' + esc(text) + '</span></div>';
  }
  function header(eyebrow, title, lede, bare) {
    return (bare ? '' : noticeHtml()) + '<div class="eyebrow">' + esc(eyebrow) + '</div><h1>' + esc(title) + '</h1>' + (lede ? '<p class="lede">' + lede + '</p>' : '');
  }

  function renderOverview() {
    $('#main').innerHTML = header('Journeys', 'Client journeys', 'Seven lifecycle journeys for people who are already TenTrade clients, and three follow-up journeys for the webinar programmes. Pick one on the left to see its map; click any step to open its setup on the right.') +
      '<div class="prose" id="pv">' + D.overviewHtml + '</div>';
    tagProse($('#pv'), 'ov'); refreshReview();
  }
  function renderBuilder() {
    $('#main').innerHTML = header('Reference', 'Journey builder options', 'Every option Voyager\'s journey builder offers, read from the builder code on 2026-10-03.') +
      '<div class="prose" id="pv">' + D.builderRefHtml + '</div>';
    tagProse($('#pv'), 'bo'); refreshReview();
  }
  function renderSets() {
    var h = header('Reference', 'Email sets', 'Every drafted email, grouped by set. Click an email to preview it on the right. The journeys use these emails by ID.');
    D.sets.forEach(function (st) {
      h += '<div class="setcard" data-comment-id="set-' + esc(st.id) + '"><h3>' + esc(st.id) + ' — ' + esc(st.title) + '</h3><div class="meta">Used in ' +
        (st.journey ? 'journey <a href="#j/' + st.journey + '">' + esc(st.journey) + ' — ' + esc((byId[st.journey] || {}).name) + '</a>' + (st.journey >= 'H' ? ' and the webinar blasts' : '') : 'the daily birthday blasts') + '</div><div class="elist">';
      st.emails.forEach(function (id) {
        var e = D.emails[id];
        h += '<div class="row' + (state.email === id ? ' sel' : '') + '" data-email="' + esc(id) + '"><span class="eid">' + esc(id) + '</span><span class="stp"></span><span><span class="s">' + esc(e.subject) + '</span><br><span class="l">' + esc(e.label) + '</span></span></div>';
      });
      h += '</div></div>';
    });
    h += '<div class="prose" id="pv"><h3>Conventions for every email</h3>' + D.conventionsHtml + '</div>';
    $('#main').innerHTML = h;
    tagProse($('#pv'), 'cv'); refreshReview();
  }

  function incomingMap(j) {
    var m = {};
    j.steps.forEach(function (s) { s.next.forEach(function (o) { (m[o.to] = m[o.to] || []).push({ from: s.id, port: o.port }); }); });
    return m;
  }

  function renderJourney() {
    var j = byId[state.j];
    if (!j) { nav('#overview'); return; }
    var sends = j.steps.filter(function (s) { return s.type === 'Send'; });
    var calls = j.steps.filter(function (s) { return s.type === 'Call task'; }).length;
    var h = noticeHtml() + '<div data-comment-id="j-' + j.id + '-head">' + header('Journey ' + j.id, j.fullTitle, '', true) + '</div>';
    h += '<div class="chips" data-comment-id="j-' + j.id + '-summary"><span class="chip goal">Goal: ' + esc(j.goal) + '</span><span class="chip k">' + j.steps.length + ' steps</span><span class="chip k">' + sends.length + ' emails</span><span class="chip k">' + calls + (calls === 1 ? ' call task' : ' call tasks') + '</span><span class="chip k">Replaces ' + esc(j.replaces) + '</span></div>';
    h += '<div class="chips" data-comment-id="j-' + j.id + '-segment">' + j.segment.map(function (s) { return '<span class="chip seg"><b>' + esc(s.field) + ':</b> ' + esc(s.value) + '</span>'; }).join('') + '</div>';
    h += '<div class="chips" data-comment-id="j-' + j.id + '-settings">' + j.settings.map(function (s) { return '<span class="chip"><b>' + esc(s.setting) + ':</b> ' + esc(s.value.replace(/\*\*/g, '')) + '</span>'; }).join('') + '</div>';
    h += '<div class="tabs"><button data-tab="flow"' + (state.tab === 'flow' ? ' class="on"' : '') + '>Flow</button><button data-tab="emails"' + (state.tab === 'emails' ? ' class="on"' : '') + '>Emails (' + sends.length + ')</button><button data-tab="about"' + (state.tab === 'about' ? ' class="on"' : '') + '>About this journey</button></div>';
    if (state.tab === 'flow') { h += mapHtml(j); }
    else if (state.tab === 'emails') { h += emailsHtml(j, sends); }
    else { h += '<div class="prose" id="pv">' + (j.segmentNoteHtml ? '<h3>Segment</h3>' + j.segmentNoteHtml : '') + j.about.map(function (a) { return '<h3>' + esc(a.title) + '</h3>' + a.html; }).join('') + '</div>'; }
    $('#main').innerHTML = h;
    $('#main').classList.toggle('wide', state.tab === 'flow');
    if (state.tab === 'flow') { layoutMap(j); }
    if (state.tab === 'about') { tagProse($('#pv'), 'j-' + j.id + '-about'); }
    refreshReview();
  }

  /* ---- journey map ----
   * Drawn the way Voyager's builder canvas draws a journey: 168px step cards
   * with an input port on top, output ports below (Y/N for Branch and Wait-for,
   * A/B for the split), curved grey connectors, a dotted canvas. Voyager keeps
   * a hand-placed x/y per step; the build sheets have none, so the map is laid
   * out here: steps sit on rows by their longest path from the trigger,
   * connectors that skip rows run down thin lanes, and rows are reordered to
   * cut crossings. */
  var MAP = { w: 168, lane: 16, gapX: 36, gapY: 70, pad: 48, zoom: null };
  var PORT_X = { out: 0.5, Y: 0.28, N: 0.72, A: 0.28, B: 0.72 };
  function outPorts(s) {
    if (s.type === 'Exit') { return []; }
    if (s.type === 'Branch' || s.type === 'Wait for') { return ['Y', 'N']; }
    if (s.type === 'A/B split') { return ['A', 'B']; }
    return ['out'];
  }

  function mapHtml(j) {
    var legend = Object.keys(TYPES).filter(function (k) { return k !== 'Wait for'; }).map(function (k) {
      var t = TYPES[k]; return '<span><i style="color:var(--' + t.k + ')">' + t.icon + '</i>' + t.label + '</span>';
    }).join('');
    var h = '<div class="flowbar"><span>Drag to move around · ' + (/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl') + ' + scroll to zoom · click a step for its setup, a connector or port to jump to its target.</span><span class="legend">' + legend + '</span></div>';
    h += '<div class="cwrap"><div class="zoomctl" data-review-skip><button data-zoom="-1" title="Zoom out">−</button><button data-zoom="0" title="Fit the whole journey">Fit</button><button data-zoom="1" title="Zoom in">+</button></div>' +
      '<div class="canvas" id="cv"><div class="sizer" id="cvs"><div class="stage" id="stage"><svg class="edges" id="edges" aria-hidden="true"></svg>';
    j.steps.forEach(function (s) {
      var t = TYPES[s.type] || TYPES.Exit;
      var to = {};
      s.next.forEach(function (o) { to[o.port] = o.to; });
      var ports = s.type === 'Trigger' ? '' : '<span class="port in"></span>';
      outPorts(s).forEach(function (p) {
        ports += '<span class="port o p-' + p + '"' + (to[p] ? ' data-go="' + esc(to[p]) + '" title="' + (p === 'out' ? 'Next' : p) + ' → ' + esc(to[p]) + '"' : ' title="Not connected"') + '>' + (p === 'out' ? '' : p) + '</span>';
      });
      h += '<div class="node t-' + t.k + (state.step === s.id ? ' sel' : '') + '" id="n-' + esc(s.id) + '" data-step="' + esc(s.id) + '" data-comment-id="j-' + esc(j.id) + '-' + esc(s.id) + '"' + ' title="' + esc((s.section ? s.section + ' — ' : '') + (s.purpose || '')) + '"' + '>' +
        ports + '<div class="nh"><span class="ic">' + t.icon + '</span>' + t.label + '<span class="sid">' + esc(s.id) + '</span></div>' +
        '<div class="nb">' + summary(s) + '</div></div>';
    });
    return h + '</div></div></div></div>';
  }

  // Weighted isotonic regression (pool adjacent violators): the x positions
  // closest to `want` that keep each item at least sep[i] right of the last.
  function packRow(want, sep) {
    var c = [0];
    for (var i = 1; i < want.length; i++) { c[i] = c[i - 1] + sep[i - 1]; }
    var blocks = [];
    want.forEach(function (d, i) {
      blocks.push({ sum: d - c[i], n: 1 });
      while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
        var b = blocks.pop(); blocks[blocks.length - 1].sum += b.sum; blocks[blocks.length - 1].n += b.n;
      }
    });
    var out = [];
    blocks.forEach(function (b) { for (var k = 0; k < b.n; k++) { out.push(b.sum / b.n + c[out.length]); } });
    return out;
  }

  function layoutMap(j) {
    var stage = $('#stage'); if (!stage) { return; }
    var V = {}, order = [];
    j.steps.forEach(function (s, i) { V[s.id] = { id: s.id, real: true, idx: i, w: MAP.w, ins: [], outs: [] }; order.push(s.id); });
    var edges = [];
    j.steps.forEach(function (s) { s.next.forEach(function (o) { if (V[o.to]) { edges.push({ from: s.id, to: o.to, port: o.port }); } }); });
    // Loops are possible in Voyager; set them aside so the rows stay acyclic.
    var mark = {};
    function dfs(u) {
      mark[u] = 1;
      edges.forEach(function (e) { if (e.from === u) { if (mark[e.to] === 1) { e.back = true; } else if (!mark[e.to]) { dfs(e.to); } } });
      mark[u] = 2;
    }
    order.forEach(function (id) { if (!mark[id]) { dfs(id); } });
    var fwd = edges.filter(function (e) { return !e.back; });
    var row = {};
    function rowOf(v) {
      if (row[v] != null) { return row[v]; }
      var r = 0;
      fwd.forEach(function (e) { if (e.to === v) { r = Math.max(r, rowOf(e.from) + 1); } });
      return (row[v] = r);
    }
    order.forEach(rowOf);
    // Connectors that skip rows get a lane point on every row they cross.
    var segs = [];
    fwd.forEach(function (e, k) {
      var prev = e.from, frac = PORT_X[e.port] || 0.5;
      e.lanes = [];
      for (var r = row[e.from] + 1; r < row[e.to]; r++) {
        var d = 'L' + k + '_' + r;
        V[d] = { id: d, real: false, idx: V[e.from].idx + 0.5, w: 0, ins: [], outs: [] }; row[d] = r; e.lanes.push(d);
        segs.push({ u: prev, v: d, f: frac }); prev = d; frac = 0.5;
      }
      segs.push({ u: prev, v: e.to, f: frac });
    });
    segs.forEach(function (sg) { V[sg.u].outs.push(sg); V[sg.v].ins.push(sg); });
    var rows = [];
    Object.keys(V).forEach(function (id) { (rows[row[id]] = rows[row[id]] || []).push(id); });
    rows = rows.map(function (r) { return (r || []).sort(function (a, b) { return V[a].idx - V[b].idx; }); });
    // Order within rows: barycentre sweeps, keeping the order with fewest crossings.
    function posIn(r) { var m = {}; r.forEach(function (id, i) { m[id] = i; }); return m; }
    function crossings(rs) {
      var n = 0;
      for (var i = 0; i + 1 < rs.length; i++) {
        var pu = posIn(rs[i]), pv = posIn(rs[i + 1]), list = [];
        rs[i].forEach(function (u) { V[u].outs.forEach(function (sg) { if (pv[sg.v] != null) { list.push([pu[u] + sg.f, pv[sg.v]]); } }); });
        for (var a = 0; a < list.length; a++) { for (var b = a + 1; b < list.length; b++) { if ((list[a][0] - list[b][0]) * (list[a][1] - list[b][1]) < 0) { n++; } } }
      }
      return n;
    }
    var best = rows.map(function (r) { return r.slice(); }), bestN = crossings(rows);
    for (var it = 0; it < 12; it++) {
      var down = it % 2 === 0;
      for (var ri = down ? 1 : rows.length - 2; down ? ri < rows.length : ri >= 0; ri += down ? 1 : -1) {
        var ref = posIn(rows[down ? ri - 1 : ri + 1]), cur = posIn(rows[ri]);
        var key = {};
        rows[ri].forEach(function (id) {
          var nb = down ? V[id].ins.map(function (sg) { return ref[sg.u] != null ? ref[sg.u] + (sg.f - 0.5) : null; })
                        : V[id].outs.map(function (sg) { return ref[sg.v] != null ? ref[sg.v] - (sg.f - 0.5) : null; });
          nb = nb.filter(function (x) { return x != null; });
          key[id] = nb.length ? nb.reduce(function (a, b) { return a + b; }, 0) / nb.length : cur[id];
        });
        rows[ri].sort(function (a, b) { return key[a] - key[b] || cur[a] - cur[b]; });
      }
      var n = crossings(rows);
      if (n < bestN) { bestN = n; best = rows.map(function (r) { return r.slice(); }); }
    }
    rows = best;
    // x: each step pulled toward the ports it connects to, rows kept apart.
    var X = {};
    function gap(a, b) { return (V[a].w + V[b].w) / 2 + (V[a].real && V[b].real ? MAP.gapX : V[a].real || V[b].real ? MAP.lane * 1.5 : MAP.lane); }
    rows.forEach(function (r) { var x = 0; r.forEach(function (id, i) { if (i) { x += gap(r[i - 1], id); } X[id] = x; }); });
    function portX(id, f) { return X[id] + (f - 0.5) * V[id].w; }
    for (var pass = 0; pass < 16; pass++) {
      var mode = pass === 15 ? 'both' : pass % 2 ? 'up' : 'down';
      var seq = rows.map(function (r, i) { return i; });
      if (mode === 'up') { seq.reverse(); }
      seq.forEach(function (ri) {
        var r = rows[ri];
        var want = r.map(function (id) {
          var pts = [];
          if (mode !== 'up') { V[id].ins.forEach(function (sg) { pts.push(portX(sg.u, sg.f)); }); }
          if (mode !== 'down') { V[id].outs.forEach(function (sg) { pts.push(X[sg.v] - (sg.f - 0.5) * V[id].w); }); }
          return pts.length ? pts.reduce(function (a, b) { return a + b; }, 0) / pts.length : X[id];
        });
        var sep = r.slice(1).map(function (id, i) { return gap(r[i], id); });
        packRow(want, sep).forEach(function (x, i) { X[r[i]] = x; });
      });
    }
    // y: rows stacked by the tallest card in each.
    var H = {};
    order.forEach(function (id) { H[id] = document.getElementById('n-' + id).offsetHeight; });
    var top = [], rowH = [], y = MAP.pad;
    rows.forEach(function (r, ri) {
      rowH[ri] = Math.max.apply(null, [24].concat(r.filter(function (id) { return V[id].real; }).map(function (id) { return H[id]; })));
      top[ri] = y; y += rowH[ri] + MAP.gapY;
    });
    var minX = Infinity, maxX = -Infinity;
    Object.keys(X).forEach(function (id) { minX = Math.min(minX, X[id] - V[id].w / 2); maxX = Math.max(maxX, X[id] + V[id].w / 2); });
    var shift = MAP.pad - minX;
    Object.keys(X).forEach(function (id) { X[id] += shift; });
    order.forEach(function (id) {
      var el = document.getElementById('n-' + id);
      el.style.left = (X[id] - MAP.w / 2) + 'px'; el.style.top = top[row[id]] + 'px';
    });
    var W = maxX - minX + 2 * MAP.pad, Ht = y - MAP.gapY + MAP.pad;
    // Connectors: Voyager's vertical S-curve between rows, straight down a lane.
    function curve(a, b) { var dy = Math.max(26, Math.abs(b.y - a.y) / 2); return ' C' + a.x + ',' + (a.y + dy) + ' ' + b.x + ',' + (b.y - dy) + ' ' + b.x + ',' + b.y; }
    var svg = '';
    edges.forEach(function (e) {
      var f = PORT_X[e.port] || 0.5;
      var a = { x: portX(e.from, f), y: top[row[e.from]] + H[e.from] };
      var b = { x: X[e.to], y: top[row[e.to]] };
      var d = 'M' + a.x + ',' + a.y;
      if (e.back) {
        var side = Math.max(X[e.from], X[e.to]) + MAP.w / 2 + 30;
        d += ' C' + a.x + ',' + (a.y + 50) + ' ' + side + ',' + (a.y + 50) + ' ' + side + ',' + ((a.y + b.y) / 2) + ' S' + b.x + ',' + (b.y - 50) + ' ' + b.x + ',' + b.y;
      } else {
        var p = a;
        e.lanes.forEach(function (l) {
          var q = { x: X[l], y: top[row[l]] };
          d += curve(p, q) + ' L' + q.x + ',' + (q.y + rowH[row[l]]);
          p = { x: q.x, y: q.y + rowH[row[l]] };
        });
        d += curve(p, b);
      }
      svg += '<path d="' + d + '" class="e p-' + esc(e.port) + (e.back ? ' back' : '') + '" data-from="' + esc(e.from) + '" data-to="' + esc(e.to) + '" data-go="' + esc(e.to) + '"><title>' + esc(e.from) + (e.port === 'out' ? '' : ' ' + esc(e.port)) + ' → ' + esc(e.to) + '</title></path>';
    });
    var edgesEl = $('#edges');
    edgesEl.setAttribute('width', W); edgesEl.setAttribute('height', Ht); edgesEl.innerHTML = svg;
    stage.style.width = W + 'px'; stage.style.height = Ht + 'px';
    stage.dataset.w = W; stage.dataset.h = Ht;
    var cv = $('#cv');
    // Open at a readable size (the whole width if it fits at 75% or more), on the trigger.
    MAP.zoom = null;
    setZoom(Math.max(0.75, Math.min(1, (cv.clientWidth - 24) / W)));
    cv.scrollTop = 0; cv.scrollLeft = Math.max(0, X[order[0]] * MAP.zoom - cv.clientWidth / 2);
    wireCanvas(cv);
    hiEdges();
  }
  function fitZoom() {
    var cv = $('#cv'), st = $('#stage');
    if (!cv || !st) { return 1; }
    return Math.max(0.35, Math.min(1, (cv.clientWidth - 24) / +st.dataset.w, (cv.clientHeight - 24) / +st.dataset.h));
  }
  function setZoom(z, cx, cy) {
    var cv = $('#cv'), st = $('#stage'), sz = $('#cvs');
    if (!cv || !st) { return; }
    z = Math.max(0.3, Math.min(1.6, z));
    var old = MAP.zoom || z;
    if (cx == null) { cx = cv.clientWidth / 2; cy = cv.clientHeight / 2; }
    var wx = (cv.scrollLeft + cx) / old, wy = (cv.scrollTop + cy) / old;
    MAP.zoom = z;
    st.style.transform = 'scale(' + z + ')';
    sz.style.width = (+st.dataset.w * z) + 'px'; sz.style.height = (+st.dataset.h * z) + 'px';
    cv.scrollLeft = wx * z - cx; cv.scrollTop = wy * z - cy;
  }
  function wireCanvas(cv) {
    var drag = null;
    cv.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.node,.zoomctl,path')) { return; }
      drag = { x: e.clientX, y: e.clientY, l: cv.scrollLeft, t: cv.scrollTop };
      cv.classList.add('panning'); cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) { return; }
      cv.scrollLeft = drag.l - (e.clientX - drag.x); cv.scrollTop = drag.t - (e.clientY - drag.y);
    });
    var stop = function () { drag = null; cv.classList.remove('panning'); };
    cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
    cv.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) { return; }
      e.preventDefault();
      var r = cv.getBoundingClientRect();
      setZoom(MAP.zoom * Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }
  // Connectors touching the selected (or hovered) step turn magenta.
  function hiEdges(hover) {
    Array.prototype.forEach.call(document.querySelectorAll('#edges path'), function (p) {
      var f = p.getAttribute('data-from'), t = p.getAttribute('data-to');
      p.classList.toggle('sel', !!state.step && (f === state.step || t === state.step));
      p.classList.toggle('hov', !!hover && (f === hover || t === hover));
    });
  }

  function emailsHtml(j, sends) {
    var h = '<div class="elist">';
    sends.forEach(function (s) {
      var e = D.emails[s.config.template] || {};
      h += '<div class="row' + (state.step === s.id ? ' sel' : '') + '" data-step="' + esc(s.id) + '"><span class="eid">' + esc(s.config.template) + '</span><span class="stp">' + esc(s.id) + '</span><span><span class="s">' + esc(e.subject) + '</span><br><span class="l">' + esc(e.preheader) + '</span></span></div>';
    });
    return h + '</div>';
  }

  /* ---------------------------------------------------------------- pages */
  function renderPage() {
    var P = PAGES[state.page], pg = P.page, sec = P.sec;
    var eyebrow = pg.part ? sec.title + ' · ' + pg.docTitle : sec.title;
    var h = header(eyebrow, pg.title, pg.lede || '');
    if (pg.kind === 'embed') {
      h += '<p class="hint">An example page, shown as it would appear to a client. <a href="' + esc(pg.src) + '" target="_blank" rel="noopener">Open it in a new tab ↗</a></p>' +
        '<div class="embed"><iframe src="' + esc(pg.src) + '" title="' + esc(pg.title) + '" loading="lazy"></iframe></div>';
    } else if (pg.kind === 'backlog') {
      h += '<div class="prose" id="pv">' + pg.html + '</div>' + backlogHtml(pg);
    } else if (pg.kind === 'birthday') {
      h += birthdayHtml(pg) + '<div class="prose" id="pv">' + pg.html + '</div>';
    } else {
      h += '<div class="prose" id="pv">' + pg.html + '</div>';
    }
    // previous / next within the section
    var i = sec.pages.indexOf(pg);
    if (sec.pages.length > 1) {
      h += '<div class="pager">' + (i > 0 ? '<a href="#p/' + sec.pages[i - 1].id + '">← ' + esc(sec.pages[i - 1].title) + '</a>' : '<span></span>') +
        (i < sec.pages.length - 1 ? '<a href="#p/' + sec.pages[i + 1].id + '">' + esc(sec.pages[i + 1].title) + ' →</a>' : '<span></span>') + '</div>';
    }
    $('#main').innerHTML = h;
    $('#main').classList.toggle('wide', pg.kind === 'backlog' || pg.kind === 'embed');
    if ($('#pv')) { tagProse($('#pv'), 'pg-' + pg.id); }
    refreshReview();
  }

  /* ---- backlog board: the Credo staging-plan board (PBI rows, tasks across
   * To do / Doing / Done, a review column, WIP limit of one row). */
  var WHO = { 'PanUI team': 'by-panui', 'Us': 'by-us', 'Both': 'by-both', 'Needs decision': 'by-decision' };
  function backlogHtml(pg) {
    var all = [];
    pg.groups.forEach(function (g) { all = all.concat(g.pbis); });
    var st = function (p, k) { return p.tasks.filter(function (t) { return t.status === k; }).length; };
    var active = all.filter(function (p) { return st(p, 'doing'); });
    var done = all.filter(function (p) { return p.tasks.length && st(p, 'done') === p.tasks.length; });
    var blocked = all.filter(function (p) { return p.blocked; });
    var h = '<div class="bl-status">' +
      '<div class="card state"><small>Status</small><b>Proposed to TenTrade’s platform team. Nothing started.</b></div>' +
      '<div class="card"><small>In progress (WIP 1)</small><b>' + (active.length ? esc(active.map(function (p) { return p.id; }).join(', ')) : 'none') + '</b></div>' +
      '<div class="card"><small>PBIs done</small><b>' + done.length + ' / ' + all.length + '</b></div>' +
      '<div class="card"><small>Waiting on a decision</small><b>' + blocked.length + '</b></div></div>';
    if (active.length > 1) { h += '<div class="bl-warn">WIP limit broken: ' + active.length + ' rows have tasks in Doing.</div>'; }
    h += '<div class="bl-legend">' + Object.keys(WHO).map(function (k) { return '<span><i class="pill ' + WHO[k] + '">' + esc(k) + '</i></span>'; }).join('') + '<span>Rows in priority order; only one row in Doing at a time.</span></div>';
    h += '<div class="board"><div class="hd">Backlog item (PBI)</div><div class="hd">To do</div><div class="hd doing">Doing <em>· WIP limit: 1 row</em></div><div class="hd">Done</div><div class="hd">Review</div>';
    pg.groups.forEach(function (g) {
      h += '<div class="grp-row" data-comment-id="bl-grp-' + esc(slugify(g.title)) + '"><b>' + (g.feature ? 'Feature: ' : '') + esc(g.title) + '</b>' + (g.html ? '<div class="gdesc">' + g.html + '</div>' : '') + '</div>';
      g.pbis.forEach(function (p) {
        var isActive = st(p, 'doing') > 0, isDone = p.tasks.length && st(p, 'done') === p.tasks.length;
        var cls = isActive ? 'row-active' : isDone ? 'row-done' : p.blocked ? 'row-blocked' : '';
        var col = function (k, name) {
          var ts = p.tasks.filter(function (t) { return t.status === k; });
          return '<div class="cell col col-' + k + ' ' + cls + (ts.length ? '' : ' empty') + '"><span class="lbl">' + name + '</span>' +
            ts.map(function (t) { return '<div class="task">' + esc(t.text) + '</div>'; }).join('') + '</div>';
        };
        h += '<div class="cell pbi ' + cls + '" id="pbi-' + esc(p.id) + '" data-comment-id="bl-' + esc(p.id) + '">' +
          '<div class="top"><span class="id">' + esc(p.id) + '</span><i class="pill ' + (WHO[p.who] || 'by-both') + '">' + esc(p.who) + '</i>' +
          (p.blocked ? '<i class="pill blk">Blocked · ' + esc(p.blocked) + '</i>' : '') +
          (p.refs ? p.refs.split(/,\s*/).map(function (r) { return '<span class="ref">' + esc(r) + '</span>'; }).join('') : '') + '</div>' +
          '<div class="ttl">' + esc(p.title) + '</div><p class="pwhy">' + esc(p.why) + '</p>' +
          '<details><summary>Done when</summary><div class="dod">' + esc(p.done) + '</div></details></div>' +
          col('todo', 'To do') + col('doing', 'Doing') + col('done', 'Done') +
          '<div class="cell col col-review ' + cls + '"><span class="lbl">Review</span><div class="rv"><div class="s">' + esc(p.review || 'Planned') + '</div></div></div>';
      });
    });
    return h + '</div>';
  }
  function slugify(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* ---- birthday calendar: one blast per day of the year, coloured by star
   * sign; the twelve sample days open their email, any other day opens its
   * sign's email with that day's date. */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var ELEMENT = { Aries: 'fire', Leo: 'fire', Sagittarius: 'fire', Taurus: 'earth', Virgo: 'earth', Capricorn: 'earth', Gemini: 'air', Libra: 'air', Aquarius: 'air', Cancer: 'water', Scorpio: 'water', Pisces: 'water' };
  var GLYPH = { Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋', Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏', Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓' };
  function monthIdx(name) { var k = name.slice(0, 3).toLowerCase(); for (var i = 0; i < 12; i++) { if (MONTHS[i].slice(0, 3).toLowerCase() === k) { return i; } } return -1; }
  function md(m, d) { return (m + 1) * 100 + d; }
  function signOf(pg, m, d) {
    var key = md(m, d);
    for (var i = 0; i < pg.signs.length; i++) {
      var r = pg.signs[i].dates.split(/\s*[–-]\s*/), a = r[0].split(' '), b = r[1].split(' ');
      var from = md(monthIdx(a[1]), +a[0]), to = md(monthIdx(b[1]), +b[0]);
      if (from <= to ? key >= from && key <= to : key >= from || key <= to) { return pg.signs[i]; }
    }
    return null;
  }
  function sampleOf(pg, m, d) {
    for (var i = 0; i < pg.samples.length; i++) { var p = pg.samples[i].date.split(' '); if (+p[0] === d && monthIdx(p[1]) === m) { return pg.samples[i]; } }
    return null;
  }
  function sampleForSign(pg, sign) { return pg.samples.filter(function (x) { return x.sign === sign; })[0]; }
  var DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function birthdayHtml(pg) {
    var h = '<div class="bd-legend">' + pg.signs.map(function (sg) { return '<span class="el-' + ELEMENT[sg.sign] + '"><i>' + GLYPH[sg.sign] + '</i>' + esc(sg.sign) + ' <small>' + esc(sg.dates) + '</small></span>'; }).join('') +
      '</div><p class="hint">366 daily blasts. <b>★</b> marks the twelve sample days written in full. Click any day to see the email that goes out.</p><div class="bd-cal">';
    MONTHS.forEach(function (mn, m) {
      h += '<div class="bd-month"><h4>' + mn + '</h4><div class="bd-days">';
      for (var d = 1; d <= DAYS_IN[m]; d++) {
        var sg = signOf(pg, m, d), smp = sampleOf(pg, m, d), key = String(m + 1).padStart(2, '0') + String(d).padStart(2, '0');
        var dd = String(d).padStart(2, '0') + String(m + 1).padStart(2, '0');
        h += '<button class="bd-day el-' + (sg ? ELEMENT[sg.sign] : 'x') + (smp ? ' smp' : '') + (state.sub === dd ? ' sel' : '') + '" data-bday="' + dd + '" title="' + d + ' ' + mn + ' · ' + (sg ? esc(sg.sign) : '') + (smp ? ' · sample ' + esc(smp.email) : '') + '" data-k="' + key + '">' + d + (smp ? '<i>★</i>' : '') + '</button>';
      }
      h += '</div></div>';
    });
    return h + '</div>';
  }
  function openBirthday(dd) {
    var pg = PAGES.birthday && PAGES.birthday.page; if (!pg) { return; }
    var d = +dd.slice(0, 2), m = +dd.slice(2, 4) - 1;
    var sg = signOf(pg, m, d), smp = sampleOf(pg, m, d), base = sg && sampleForSign(pg, sg.sign);
    var e = D.emails[(smp || base || {}).email];
    $('#dh').innerHTML = '<div class="ic" style="background:var(--send)">' + (sg ? GLYPH[sg.sign] : '✉') + '</div><div><div class="tt">Birthday blast · ' + d + ' ' + MONTHS[m] + '</div><div class="st">' + (sg ? esc(sg.sign) + ' · ' + esc(sg.nick) : '') + '</div></div><button class="x" data-close title="Close (Esc)">✕</button>';
    var info = '<div class="cfg" data-comment-id="bd-' + dd + '"><h4>Blast set-up</h4><dl class="kv">' +
      '<dt>Name</dt><dd>birthday-' + dd + ' · SEG-16</dd><dt>Audience</dt><dd>Birth date: Anniversary in 0 days · Last login: Last 365 days</dd>' +
      '<dt>Send</dt><dd>' + d + ' ' + MONTHS[m] + ', 07:00 UTC</dd><dt>Template</dt><dd>' + (sg ? esc(sg.sign) : '') + ' birthday email' + (e ? ' (' + esc(e.id) + ')' : '') + '</dd>' +
      '<dt>Coupon</dt><dd>20% off one funded-account challenge, valid 7 days</dd></dl>' +
      (smp ? '<div class="why">Sample day: this email is written in full in set S24.</div>' : base ? '<div class="why">Uses the ' + esc(sg.sign) + ' email written for ' + esc(base.date) + '; on this day it goes out unchanged, dated ' + d + ' ' + MONTHS[m] + '.</div>' : '') +
      (m === 1 && d === 29 ? '<div class="why">Leap years only. In other years these clients join the 28 February blast.</div>' : '') + '</div>';
    $('#db').innerHTML = info + emailPreview(e);
    document.body.classList.add('drawer-open');
    Array.prototype.forEach.call(document.querySelectorAll('.bd-day'), function (b) { b.classList.toggle('sel', b.dataset.bday === dd); });
    refreshReview();
  }

  /* --------------------------------------------------------------- drawer */
  function ctl(label, value, isSelect) {
    return '<label class="f"><span>' + esc(label) + '</span><div class="ctl' + (isSelect ? ' sel' : '') + '">' + value + '</div></label>';
  }
  function condBlock(c) {
    var v = '';
    if (c.op === 'in last N days' || c.op === 'over N days ago') { v = '<div class="ctl">Days: ' + esc(c.value) + '</div>'; }
    else if (c.value) { v = '<div class="ctl">' + esc(c.value) + '</div>'; }
    return '<div class="cond"><div class="ctl sel">' + esc(FIELD_LABEL[c.field] || c.field) + '</div><div class="ctl sel">' + esc(c.op) + '</div>' + v +
      (c.note ? '<div class="note">' + esc(c.note) + '</div>' : '') + '</div>';
  }
  function audienceHtml(j) {
    var set = {};
    j.segment.forEach(function (s) { set[s.field] = s.value; });
    var h = '';
    j.segment.forEach(function (s) { h += ctl(s.field, esc(s.value), true); });
    var others = AUDIENCE_ORDER.filter(function (f) { return !(f in set) && !(f === 'Tags' && set['Tags (any of)']) && !(f === 'Tags (any of)' && set.Tags); });
    h += '<p class="hint">All other filters left at "Any": ' + esc(others.filter(function (f) { return f !== 'Tags (any of)'; }).join(', ')) + '.</p>';
    return h;
  }
  function emailPreview(e) {
    if (!e) { return '<div class="empty">Email not found.</div>'; }
    var body = e.bodyHtml.replace(/\{\{(\w+)\}\}/g, '<span class="tok">{{$1}}</span>');
    return '<div class="mail" data-comment-id="em-' + esc(e.id) + '"><div class="mh"><div><span class="k">From</span>TenTrade</div><div><span class="k">Subject</span><span class="subj">' + esc(e.subject) + '</span></div><div><span class="k">Preheader</span><span class="pre">' + esc(e.preheader) + '</span></div></div>' +
      '<div class="mb"><div class="logo">TenTrade</div>' + body +
      (e.button ? '<span class="cta">' + esc(e.button) + '</span><div class="cta-t">Links to: ' + esc(e.buttonTarget) + '</div>' : '') + '</div>' +
      '<div class="mf">Footer on every email: risk warning (CFDs are leveraged products and carry a high level of risk to your capital), the regulated-entity line (Evalanch Ltd, Seychelles FSA licence SD082), links to the legal documents, and <span class="tok">{{unsubscribe_url}}</span>.</div></div>';
  }
  function setSources(id) {
    var setId = String(id).slice(0, 3);
    var st = D.sets.filter(function (s) { return s.id === setId; })[0];
    return st && st.sourcesHtml ? '<h4>Sources for the facts in this set</h4><div class="src">' + st.sourcesHtml + '</div>' : '';
  }

  function openStep(j, s) {
    var t = TYPES[s.type] || TYPES.Exit;
    var idx = j.steps.indexOf(s);
    $('#dh').innerHTML = '<div class="ic" style="background:var(--' + t.k + ')">' + t.icon + '</div><div><div class="tt">' + esc(s.type === 'Wait for' ? 'Wait — for a condition' : t.label) + '</div><div class="st">' + esc(s.id) + ' · ' + esc(s.section || '') + ' · journey ' + esc(j.id) + '</div></div>' +
      '<div class="nav2" style="margin-left:auto"><button data-move="-1" title="Previous step (↑)"' + (idx < 1 ? ' disabled' : '') + '>↑</button><button data-move="1" title="Next step (↓)"' + (idx >= j.steps.length - 1 ? ' disabled' : '') + '>↓</button></div><button class="x" data-close title="Close (Esc)">✕</button>';
    var c = s.config, h = '';
    if (s.purpose) { h += '<div class="purpose" data-comment-id="p-' + esc(j.id) + '-' + esc(s.id) + '"><span>What it’s for</span>' + esc(s.purpose) + '</div>'; }
    h += '<div class="cfg" data-comment-id="d-' + esc(j.id) + '-' + esc(s.id) + '">';
    switch (s.type) {
      case 'Trigger':
        h += ctl('Source', 'CRM segment (automated)', true);
        h += '<h4>Audience — who enters this journey</h4>' + audienceHtml(j);
        if (j.segmentNoteHtml) { h += '<div class="why">' + j.segmentNoteHtml.replace(/<\/?p>/g, ' ') + '</div>'; }
        h += '<h4>Journey settings</h4><dl class="kv">' + j.settings.map(function (x) { return '<dt>' + esc(x.setting) + '</dt><dd>' + esc(x.value.replace(/\*\*/g, '')) + (x.why && x.why !== '—' ? '<div class="hint" style="font-weight:400;margin:2px 0 4px">' + esc(x.why) + '</div>' : '') + '</dd>'; }).join('') + '</dl>';
        break;
      case 'Send': {
        var e = D.emails[c.template];
        var freq = j.sendFrequency || 'Once ever';
        h += ctl('Channel', 'Email', true) + ctl('Template', esc(c.template + (e ? ' — ' + e.label : '')), true) + ctl('Frequency', esc(freq), true);
        h += '<div class="btnrow"><button class="btn" title="Prototype: not connected to Voyager">Test this email</button></div>';
        if (c.remark) { h += '<div class="why">' + esc(c.remark) + '</div>'; }
        h += '<h4>Email</h4>' + emailPreview(e) + setSources(c.template);
        break;
      }
      case 'Wait':
        if (c.mode === 'until') { h += ctl('Mode', 'Until a time', true) + ctl('Time', esc(c.time)) + ctl('Weekday', esc(c.weekday), true); }
        else { h += ctl('Mode', 'For a duration', true) + ctl('Amount', esc(c.amount)) + ctl('Unit', esc(c.unit), true); }
        break;
      case 'Wait for':
        h += ctl('Mode', 'For a condition', true) + ctl('Match', c.match === 'any' ? 'Any — OR' : 'All — AND', true);
        h += (c.conditions || []).map(condBlock).join('');
        h += ctl('Give up after', esc(c.giveUp)) + ctl('Unit', esc(c.giveUpUnit), true);
        h += '<p class="hint">Y = condition met in time · N = timed out.</p>';
        break;
      case 'Branch':
        h += ctl('Match', c.match === 'any' ? 'Any — OR' : 'All — AND', true) + (c.conditions || []).map(condBlock).join('');
        h += '<p class="hint">Yes = matches · No = doesn\'t.</p>';
        break;
      case 'A/B split':
        h += ctl('% to variant A', esc(c.weight)) + ctl('Auto-winner', esc(c.auto), true) + ctl('Min sends/arm', esc(c.minPerArm));
        h += '<p class="hint">A gets that %, B the rest. Both outputs are connected.</p>';
        break;
      case 'Call task':
        h += ctl('Note', esc(c.note)) + '<p class="hint">Adds the contact to CRM → Call Tasks (visibility-scoped).</p>';
        break;
      default:
        h += '<p class="hint">Ends the journey for the contact.</p>';
    }
    h += '</div>';
    var inc = incomingMap(j)[s.id] || [];
    h += '<div class="cfg"><h4>Connections</h4>';
    h += '<div class="hint">Outputs</div><div class="conn">' + (s.next.length ? s.next.map(function (o) { return '<span class="out" data-go="' + esc(o.to) + '"><span class="p ' + esc(o.port) + '">' + (o.port === 'out' ? '→' : esc(o.port)) + '</span>' + esc(o.to) + '</span>'; }).join('') : '<span class="hint">none — the journey ends here</span>') + '</div>';
    h += '<div class="hint" style="margin-top:10px">Inputs</div><div class="conn">' + (inc.length ? inc.map(function (f) { return '<span class="out" data-go="' + esc(f.from) + '"><span class="p ' + esc(f.port) + '">' + (f.port === 'out' ? '→' : esc(f.port)) + '</span>from ' + esc(f.from) + '</span>'; }).join('') : '<span class="hint">entry — the trigger starts here</span>') + '</div></div>';
    $('#db').innerHTML = h;
    document.body.classList.add('drawer-open');
    refreshReview();
  }
  function openEmail(id) {
    var e = D.emails[id];
    $('#dh').innerHTML = '<div class="ic" style="background:var(--send)">✉</div><div><div class="tt">' + esc(id) + '</div><div class="st">' + esc(e ? e.label : '') + '</div></div><button class="x" data-close title="Close (Esc)">✕</button>';
    $('#db').innerHTML = emailPreview(e) + setSources(id);
    document.body.classList.add('drawer-open');
    refreshReview();
  }
  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    if (state.view === 'journey' && state.step) { nav('#j/' + state.j); }
    else if (state.view === 'sets' && state.email) { nav('#sets'); }
    else if (state.view === 'page' && state.sub) { nav('#p/' + state.page); }
  }

  /* --------------------------------------------------------------- router */
  // Navigation goes through nav(): it sets location.hash, and falls back to
  // in-page routing where the address cannot change (data: URLs, sandboxed
  // previews), so the prototype works the same either way.
  var fallbackHash = '';
  function nav(h) {
    try { location.hash = h; } catch (err) { /* ignore */ }
    if (location.hash !== h) { fallbackHash = h; route(); }
  }
  function currentHash() { return location.hash || fallbackHash || LANDING; }
  function route() {
    var hsh = currentHash().slice(1).split('/');
    var prevView = state.view, prevJ = state.j;
    var prevPage = state.page;
    state.step = null; state.email = null; state.sub = null;
    if (hsh[0] === '' || (hsh[0] === 'p' && !PAGES[hsh[1]])) { nav(LANDING); return; }
    if (hsh[0] === 'p') {
      state.view = 'page'; state.page = hsh[1]; state.sub = hsh[2] || null;
    } else if (hsh[0] === 'j' && byId[hsh[1]]) {
      state.view = 'journey'; state.j = hsh[1]; state.step = hsh[2] || null;
      if (prevJ !== state.j) { state.tab = 'flow'; }
    } else if (hsh[0] === 'sets') { state.view = 'sets'; state.email = hsh[1] || null; }
    else if (hsh[0] === 'builder') { state.view = 'builder'; }
    else { state.view = 'overview'; }
    renderNav();
    var sameScreen = prevView === state.view && prevJ === state.j && (state.view !== 'page' || prevPage === state.page) && document.getElementById('main').children.length;
    if (state.view === 'page') {
      if (!sameScreen) { renderPage(); window.scrollTo(0, 0); }
      if (state.page === 'birthday' && state.sub) { openBirthday(state.sub); } else { document.body.classList.remove('drawer-open'); }
      return;
    }
    if (state.view === 'journey') {
      if (!sameScreen) { renderJourney(); window.scrollTo(0, 0); } else { markSelection(); }
      var j = byId[state.j];
      var s = state.step && j.steps.filter(function (x) { return x.id === state.step; })[0];
      if (s) {
        // The drawer slides in over .2s and narrows the canvas; place the step after it settles.
        var wasOpen = document.body.classList.contains('drawer-open');
        openStep(j, s);
        if (wasOpen) { reveal(s.id); } else { setTimeout(function () { reveal(s.id); }, 230); }
      } else { document.body.classList.remove('drawer-open'); }
    } else {
      $('#main').classList.remove('wide');
      if (!sameScreen) {
        if (state.view === 'sets') { renderSets(); } else if (state.view === 'builder') { renderBuilder(); } else { renderOverview(); }
        window.scrollTo(0, 0);
      } else if (state.view === 'sets') { markSelection(); }
      if (state.view === 'sets' && state.email && D.emails[state.email]) { openEmail(state.email); } else { document.body.classList.remove('drawer-open'); }
    }
  }
  function markSelection() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-step]'), function (el) { el.classList.toggle('sel', el.dataset.step === state.step); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-email]'), function (el) { el.classList.toggle('sel', el.dataset.email === state.email); });
    hiEdges();
  }
  function reveal(id) {
    var el = document.getElementById('n-' + id) || document.querySelector('.row[data-step="' + id + '"]');
    if (!el) { return; }
    var cv = el.closest('.canvas');
    if (cv) {
      // Pan the canvas so the step sits in the middle of the part of it that is on screen.
      var cr = cv.getBoundingClientRect(), nr = el.getBoundingClientRect();
      var vt = Math.max(cr.top, 0), vb = Math.min(cr.bottom, window.innerHeight);
      if (vb - vt < 200) { window.scrollTo({ top: window.pageYOffset + cr.top - 20 }); cr = cv.getBoundingClientRect(); nr = el.getBoundingClientRect(); vt = Math.max(cr.top, 0); vb = Math.min(cr.bottom, window.innerHeight); }
      if (nr.left < cr.left + 10 || nr.right > cr.right - 10 || nr.top < vt + 10 || nr.bottom > vb - 10) {
        var tl = Math.max(0, Math.min(cv.scrollWidth - cv.clientWidth, cv.scrollLeft + nr.left - cr.left - (cr.width - nr.width) / 2));
        var tt = Math.max(0, Math.min(cv.scrollHeight - cv.clientHeight, cv.scrollTop + nr.top - (vt + vb - nr.height) / 2));
        var top2 = nr.top - (tt - cv.scrollTop);
        cv.scrollTo({ left: tl, top: tt, behavior: 'smooth' });
        // At the ends of the map the canvas cannot pan far enough; scroll the page for the rest.
        if (top2 + nr.height > window.innerHeight - 10 || top2 < 10) { window.scrollBy({ top: top2 - (window.innerHeight - nr.height) / 2, behavior: 'smooth' }); }
      }
      return;
    }
    var r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 40) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  function go(stepId) {
    if (state.view !== 'journey') { return; }
    if (state.tab !== 'flow') { state.tab = 'flow'; renderJourney(); }
    nav('#j/' + state.j + '/' + stepId);
  }

  /* --------------------------------------------------------------- events */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var a = t.closest('a[href^="#"]');
    if (a) {
      e.preventDefault();
      var href = a.getAttribute('href'), em = /^#sets\/(S\d\d-E\w+)$/.exec(href);
      // Email links inside a page or a journey's notes open the preview in place.
      if (em && D.emails[em[1]] && state.view !== 'sets') { openEmail(em[1]); return; }
      nav(href); return;
    }
    var ts = t.closest('[data-toggle-sec]');
    if (ts) { toggleSection(ts.dataset.toggleSec); return; }
    var na = t.closest('[data-nav-all]');
    if (na) { setAllSections(na.dataset.navAll === '1'); return; }
    var bd = t.closest('[data-bday]');
    if (bd) { nav('#p/birthday/' + bd.dataset.bday); return; }
    var goEl = t.closest('[data-go]');
    if (goEl) { e.stopPropagation(); go(goEl.getAttribute('data-go')); return; }
    if (t.closest('[data-close]')) { closeDrawer(); return; }
    var zm = t.closest('[data-zoom]');
    if (zm) { var dz = +zm.dataset.zoom; setZoom(dz ? MAP.zoom * (dz > 0 ? 1.25 : 0.8) : fitZoom()); return; }
    var mv = t.closest('[data-move]');
    if (mv) { move(+mv.dataset.move); return; }
    var tab = t.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; renderJourney(); return; }
    var stepEl = t.closest('[data-step]');
    if (stepEl && state.view === 'journey') { nav('#j/' + state.j + '/' + stepEl.dataset.step); return; }
    var emEl = t.closest('[data-email]');
    if (emEl) { nav('#sets/' + emEl.dataset.email); }
  });
  document.addEventListener('mouseover', function (e) {
    var g = e.target.closest && e.target.closest('.node [data-go], .drawer [data-go], #edges [data-go]');
    Array.prototype.forEach.call(document.querySelectorAll('.node.hl'), function (n) { n.classList.remove('hl'); });
    if (g) { var n = document.getElementById('n-' + g.getAttribute('data-go')); if (n) { n.classList.add('hl'); } }
    if (document.getElementById('edges')) { var nd = e.target.closest && e.target.closest('.node'); hiEdges(nd ? nd.dataset.step : null); }
  });
  function move(d) {
    var j = byId[state.j]; if (!j || !state.step) { return; }
    var i = j.steps.map(function (s) { return s.id; }).indexOf(state.step) + d;
    if (i >= 0 && i < j.steps.length) { go(j.steps[i].id); }
  }
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input,textarea,select')) { return; }
    if (e.key === 'Escape') { closeDrawer(); }
    else if (state.step && (e.key === 'ArrowDown' || e.key === 'j')) { e.preventDefault(); move(1); }
    else if (state.step && (e.key === 'ArrowUp' || e.key === 'k')) { e.preventDefault(); move(-1); }
  });
  window.addEventListener('hashchange', route);

  // Called by the review widget when a reviewer clicks a comment: open the view
  // that holds the commented element, then hand the element back.
  function hashForAnchor(a) {
    var m;
    if ((m = /^(?:j|d|p)-([A-Z])-([A-Z]\d+\w*)$/.exec(a))) { return '#j/' + m[1] + '/' + m[2]; }
    if ((m = /^j-([A-Z])-(?:head|summary|segment|settings)$/.exec(a))) { return '#j/' + m[1]; }
    if ((m = /^j-([A-Z])-about-/.exec(a))) { state.tab = 'about'; return '#j/' + m[1]; }
    if ((m = /^pg-(.+)-(?:h3|h4|p|li|tr)\d+$/.exec(a)) && PAGES[m[1]]) { return '#p/' + m[1]; }
    if (/^bl-/.test(a)) { return '#p/backlog'; }
    if ((m = /^bd-(\d{4})$/.exec(a))) { return '#p/birthday/' + m[1]; }
    if ((m = /^em-(S\d\d-E\w+)$/.exec(a))) {
      if (document.querySelector('[data-comment-id="' + a + '"]')) { return null; }
      return '#sets/' + m[1];
    }
    if (/^(set-|cv-)/.test(a)) { return '#sets'; }
    if (/^bo-/.test(a)) { return '#builder'; }
    if (/^ov-/.test(a)) { return '#overview'; }
    return null;
  }
  window.__rwReveal = function (anchor) {
    var target = hashForAnchor(anchor);
    if (target && currentHash() !== target) {
      var wantAbout = state.tab === 'about';
      fallbackHash = target;
      try { history.replaceState(null, '', target); } catch (e) { /* sandboxed */ }
      route();
      if (wantAbout && state.view === 'journey' && state.tab !== 'about') { state.tab = 'about'; renderJourney(); }
    } else if (/^j-([A-Z])-about-/.test(anchor) && state.tab !== 'about') { state.tab = 'about'; renderJourney(); }
    return document.querySelector('[data-comment-id="' + anchor + '"]');
  };

  route();
})();
