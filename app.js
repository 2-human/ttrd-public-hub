/* Voyager journeys prototype — renders window.JOURNEY_DATA (built by
 * tools/journey-prototype/build.py). Left: navigation. Main: the journey as a
 * stream of builder steps. Right: the selected step's setup, as Voyager's
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
    if (state.tab === 'flow') { h += flowHtml(j); }
    else if (state.tab === 'emails') { h += emailsHtml(j, sends); }
    else { h += '<div class="prose" id="pv">' + (j.segmentNoteHtml ? '<h3>Segment</h3>' + j.segmentNoteHtml : '') + j.about.map(function (a) { return '<h3>' + esc(a.title) + '</h3>' + a.html; }).join('') + '</div>'; }
    $('#main').innerHTML = h;
    if (state.tab === 'about') { tagProse($('#pv'), 'j-' + j.id + '-about'); }
    refreshReview();
  }

  function flowHtml(j) {
    var inc = incomingMap(j);
    var legend = Object.keys(TYPES).filter(function (k) { return k !== 'Wait for'; }).map(function (k) {
      var t = TYPES[k]; return '<span><i style="background:var(--' + t.k + ')">' + t.icon + '</i>' + t.label + '</span>';
    }).join('');
    var h = '<div class="flowbar"><span>Click a step to open its setup. Outputs jump to their target.</span><span class="legend">' + legend + '</span></div>';
    var cur = null;
    j.steps.forEach(function (s, i) {
      if (s.section !== cur) {
        if (cur !== null) { h += '</div></div>'; }
        cur = s.section;
        h += '<div class="sec"><h2>' + esc(s.section || 'Steps') + '</h2><div class="stream">';
      }
      var t = TYPES[s.type] || TYPES.Exit;
      var nextId = j.steps[i + 1] ? j.steps[i + 1].id : null;
      var prevId = j.steps[i - 1] ? j.steps[i - 1].id : null;
      var froms = (inc[s.id] || []).filter(function (f) { return f.from !== prevId; });
      var outs = s.next.map(function (o) {
        var isNext = o.to === nextId && o.port === 'out';
        return '<span class="out' + (isNext ? ' next' : '') + '" data-go="' + esc(o.to) + '"><span class="p ' + esc(o.port) + '">' + (o.port === 'out' ? '→' : esc(o.port)) + '</span>' + esc(o.to) + '</span>';
      }).join('');
      var rem = s.type === 'Send' ? (s.config.description ? esc(s.config.description) : '') + (s.config.remark ? ' — ' + esc(s.config.remark) : '') : (s.config.conditions || []).map(function (c) { return c.note; }).filter(Boolean).map(esc).join(' · ');
      h += '<div class="node t-' + t.k + (state.step === s.id ? ' sel' : '') + '" id="n-' + esc(s.id) + '" data-step="' + esc(s.id) + '" data-comment-id="j-' + esc(j.id) + '-' + esc(s.id) + '">' +
        '<div class="ic">' + t.icon + '</div><div>' +
        '<div class="hd"><span class="id">' + esc(s.id) + '</span><span class="ty">' + (s.type === 'Wait for' ? 'Wait for a condition' : t.label) + '</span>' +
        (froms.length ? '<span class="from">from ' + froms.map(function (f) { return esc(f.from) + (f.port !== 'out' ? ' (' + esc(f.port) + ')' : ''); }).join(', ') + '</span>' : '') + '</div>' +
        '<div class="sum">' + summary(s) + '</div>' + (rem ? '<div class="rem">' + rem + '</div>' : '') +
        (outs ? '<div class="outs">' + outs + '</div>' : '') + '</div></div>';
    });
    if (cur !== null) { h += '</div></div>'; }
    return h;
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
    var c = s.config, h = '<div class="cfg" data-comment-id="d-' + esc(j.id) + '-' + esc(s.id) + '">';
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
      if (s) { openStep(j, s); reveal(s.id); } else { document.body.classList.remove('drawer-open'); }
    } else {
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
  }
  function reveal(id) {
    var el = document.getElementById('n-' + id) || document.querySelector('.row[data-step="' + id + '"]');
    if (!el) { return; }
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
    if (goEl) { e.stopPropagation(); go(goEl.dataset.go); return; }
    if (t.closest('[data-close]')) { closeDrawer(); return; }
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
    var g = e.target.closest && e.target.closest('.node [data-go], .drawer [data-go]');
    Array.prototype.forEach.call(document.querySelectorAll('.node.hl'), function (n) { n.classList.remove('hl'); });
    if (g) { var n = document.getElementById('n-' + g.dataset.go); if (n) { n.classList.add('hl'); } }
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
    if ((m = /^(?:j|d)-([A-G])-([A-G]\d+\w*)$/.exec(a))) { return '#j/' + m[1] + '/' + m[2]; }
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
