/* Voyager journeys prototype — renders window.JOURNEY_DATA (built by
 * tools/journey-prototype/build.py). Left: navigation. Main: the journey as a
 * map of builder steps, like Voyager's canvas. Right: the selected step's setup, as Voyager's
 * config panel would show it. Read-only: nothing here talks to Voyager. */
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
    ['Keep depositing', ['D', 'E', 'F']]
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

  var state = { view: 'overview', j: null, tab: 'flow', step: null, email: null };

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
  function renderNav() {
    var h = '<div class="brand"><b>TenTrade</b><small>Voyager journeys · prototype</small></div>';
    h += '<a href="#overview" data-v="overview"><span class="lt">≡</span><span><span class="t">Overview</span><span class="s">Goals, hand-overs, CRM tags</span></span></a>';
    GOAL_GROUPS.forEach(function (g) {
      h += '<div class="grp">' + esc(g[0]) + '</div>';
      g[1].forEach(function (id) {
        var j = byId[id]; if (!j) { return; }
        var sends = j.steps.filter(function (s) { return s.type === 'Send'; }).length;
        h += '<a href="#j/' + id + '" data-v="j/' + id + '"><span class="lt">' + id + '</span><span><span class="t">' + esc(j.name) +
          '</span><span class="s">' + j.steps.length + ' steps · ' + sends + ' emails</span></span></a>';
      });
    });
    h += '<div class="grp">Reference</div>';
    h += '<a href="#sets" data-v="sets"><span class="lt">✉</span><span><span class="t">Email sets</span><span class="s">All drafted copy, S01–S20</span></span></a>';
    h += '<a href="#builder" data-v="builder"><span class="lt">⚙</span><span><span class="t">Builder options</span><span class="s">What Voyager allows</span></span></a>';
    h += '<div class="foot">Prototype · read-only<br>Built ' + esc(D.built) + ' from the journey docs.<br>Nothing here is live in Voyager.</div>';
    $('#nav').innerHTML = h;
  }
  function markNav() {
    var key = state.view === 'journey' ? 'j/' + state.j : state.view;
    Array.prototype.forEach.call(document.querySelectorAll('#nav a'), function (a) { a.classList.toggle('on', a.dataset.v === key); });
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
  function header(eyebrow, title, lede) {
    return '<div class="eyebrow">' + esc(eyebrow) + '</div><h1>' + esc(title) + '</h1>' + (lede ? '<p class="lede">' + lede + '</p>' : '');
  }

  function renderOverview() {
    $('#main').innerHTML = header('TenTrade · Voyager', 'Client journeys', 'Seven journeys for people who are already TenTrade clients. Pick one on the left to see its steps; click any step to open its setup on the right.') +
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
      h += '<div class="setcard" data-comment-id="set-' + esc(st.id) + '"><h3>' + esc(st.id) + ' — ' + esc(st.title) + '</h3><div class="meta">Used in journey ' +
        (st.journey ? '<a href="#j/' + st.journey + '">' + esc(st.journey) + ' — ' + esc((byId[st.journey] || {}).name) + '</a>' : '—') + '</div><div class="elist">';
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
    var h = '<div data-comment-id="j-' + j.id + '-head">' + header('Journey ' + j.id, j.fullTitle, '') + '</div>';
    h += '<div class="chips" data-comment-id="j-' + j.id + '-summary"><span class="chip goal">Goal: ' + esc(j.goal) + '</span><span class="chip k">' + j.steps.length + ' steps</span><span class="chip k">' + sends.length + ' emails</span><span class="chip k">' + calls + ' call tasks</span><span class="chip k">Replaces ' + esc(j.replaces) + '</span></div>';
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
  function currentHash() { return location.hash || fallbackHash || '#overview'; }
  function route() {
    var hsh = currentHash().slice(1).split('/');
    var prevView = state.view, prevJ = state.j;
    state.step = null; state.email = null;
    if (hsh[0] === 'j' && byId[hsh[1]]) {
      state.view = 'journey'; state.j = hsh[1]; state.step = hsh[2] || null;
      if (prevJ !== state.j) { state.tab = 'flow'; }
    } else if (hsh[0] === 'sets') { state.view = 'sets'; state.email = hsh[1] || null; }
    else if (hsh[0] === 'builder') { state.view = 'builder'; }
    else { state.view = 'overview'; }
    markNav();
    var sameScreen = prevView === state.view && prevJ === state.j && document.getElementById('main').children.length;
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
    if (a) { e.preventDefault(); nav(a.getAttribute('href')); return; }
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
    if ((m = /^(?:j|d|p)-([A-G])-([A-G]\d+\w*)$/.exec(a))) { return '#j/' + m[1] + '/' + m[2]; }
    if ((m = /^j-([A-G])-(?:head|summary|segment|settings)$/.exec(a))) { return '#j/' + m[1]; }
    if ((m = /^j-([A-G])-about-/.exec(a))) { state.tab = 'about'; return '#j/' + m[1]; }
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
    } else if (/^j-([A-G])-about-/.test(anchor) && state.tab !== 'about') { state.tab = 'about'; renderJourney(); }
    return document.querySelector('[data-comment-id="' + anchor + '"]');
  };

  renderNav();
  route();
})();
