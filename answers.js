/* The hub's one store: Q&A answers and their files, the Feedback Drawer's QA comments, and the email approvals
 * (library/features/review-widget/host-answers-store.md). Public page code: it holds no data.
 *
 * Shared backend: Firestore + Storage of the project in window.FIREBASE_CONFIG (firebase-config.js), under hubs/ttrd.
 * People sign in with their own account by email link (features/auth-gate/email-link-sign-in.md); sign-up is closed.
 * The account's `role` claim decides what it reaches, and firebase/firestore.rules enforce the same:
 *   admin, team  answers, QA comments, approvals, PanUI journey drafts; the public-view index (team reads, admin writes)
 *   client       answers only
 * Public view (public-view.js): a share's rendered copy in Storage at hubs/ttrd/public/<token>.json and <token>.<n>.json,
 * which anyone holding the token can read (view.html); only admin writes or removes one. The stored copy of every page
 * (hubs/ttrd/prebuilt, made at publish by tools/hub/public-prebuild.mjs) is read by admin accounts only, never written
 * here: publicPages().prebuilt().
 * window.HUB_PUBLIC_SEED = { answers, approvals } (set only by tools/hub/public-refresh.mjs in its headless browser): the
 * store serves those records read-only and connects to nothing, so a refreshed copy shows what the hub shows.
 * Without a backend config the answers stay in this browser (localStorage + IndexedDB). A shared backend that fails is
 * never replaced by the browser one: `error` is set and saving stops.
 *
 * A config with `emulator: { auth, firestore, storage }` (ports) connects to the local emulators instead; the publish
 * script refuses such a config. */
(function () {
  var ROOT = 'hubs/ttrd', KEY = 'ttrd_hub_answers', MAILKEY = 'ttrd_signin_email', FILEDB = 'ttrd_hub_files';
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-';
  var SEED = window.HUB_PUBLIC_SEED || null;
  var cache = null, listeners = [], apprCache = {}, apprListeners = [], DB = null, F = null, AU = null, SDKS = null, settle, INIT = null;
  var words = function (k) { var L = (window.HUB_CONFIG || {}).labels || {}; return L[k] || k; };
  var notify = function () { listeners.forEach(function (f) { try { f(); } catch (e) { console.error('[answers]', e); } }); };
  var local = function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  var write = function (o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} notify(); };
  function db() {
    if (DB) return DB;
    DB = new Promise(function (ok, no) { var r = indexedDB.open(FILEDB, 1); r.onupgradeneeded = function () { r.result.createObjectStore('files'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; });
    return DB;
  }
  function tx(mode, fn) { return db().then(function (d) { return new Promise(function (ok, no) { var s = d.transaction('files', mode).objectStore('files'), q = fn(s); q.onsuccess = function () { ok(q.result); }; q.onerror = function () { no(q.error); }; }); }); }
  var fail = function (e) { console.error('[answers]', e); api.error = true; notify(); };
  /* Firestore refuses undefined values */
  var clean = function (o) { var r = {}; Object.keys(o).forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; };

  /* A sign-in link lands here with ?mode=signIn&oobCode=…: finish it, then drop only Firebase's parameters, so the page's
   * own (such as ?review=1) stay. */
  function finishLink(Au, auth) {
    var href = location.href; if (!Au.isSignInWithEmailLink(auth, href)) return null;
    var email = ''; try { email = localStorage.getItem(MAILKEY) || ''; } catch (e) {}
    if (!email) { try { email = (window.prompt(words('signInConfirmEmail')) || '').trim(); } catch (e) {} }
    var u = new URL(href); ['mode', 'oobCode', 'apiKey', 'lang', 'continueUrl', 'tenantId'].forEach(function (k) { u.searchParams.delete(k); });
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    if (!email) return null;
    return Au.signInWithEmailLink(auth, email, href).then(function () { try { localStorage.removeItem(MAILKEY); } catch (e) {} })
      .catch(function (e) { api.signInError = e.code || 'failed'; console.warn('[answers] sign-in link', e.code || e); });
  }
  /* Sign-in state, once per page: the gate needs it before the hub opens, the store after. */
  function init() {
    var cfg = window.FIREBASE_CONFIG; api.backend = !!(cfg && cfg.apiKey);
    if (!api.backend) return Promise.resolve();
    if (INIT) return INIT;
    var fb = clean(cfg); delete fb.emulator;
    INIT = Promise.all(['app', 'auth', 'firestore', 'storage'].map(function (m) { return import(SDK + m + '.js'); })).then(function (M) {
      var A = M[0], Au = M[1], Fs = M[2], St = M[3];
      var app = A.getApps().length ? A.getApp() : A.initializeApp(fb), auth = Au.getAuth(app), store = Fs.getFirestore(app), files = St.getStorage(app);
      var emu = cfg.emulator;
      if (emu) {
        Au.connectAuthEmulator(auth, 'http://127.0.0.1:' + emu.auth, { disableWarnings: true });
        Fs.connectFirestoreEmulator(store, '127.0.0.1', emu.firestore);
        St.connectStorageEmulator(files, '127.0.0.1', emu.storage);
      }
      AU = { Au: Au, auth: auth }; SDKS = { Fs: Fs, St: St, store: store, files: files };
      return Promise.resolve(finishLink(Au, auth)).then(function () {
        return new Promise(function (ok) {
          var first = true;
          Au.onAuthStateChanged(auth, function (u) {
            /* a sign-in or sign-out after start (another tab, the menu) reloads, so every part of the hub sees one account */
            if (!first) { if ((u ? u.uid : null) !== (api.user ? api.user.uid : null)) location.reload(); return; }
            first = false; if (!u) return ok();
            u.getIdTokenResult().then(function (t) { api.user = { uid: u.uid, email: u.email, name: u.displayName || u.email, role: t.claims.role || '' }; ok(); }, function () { ok(); });
          });
        });
      });
    });
    return INIT;
  }
  function connect() {
    return init().then(function () {
      if (!api.canAnswer()) return;
      var Fs = SDKS.Fs, store = SDKS.store;
      F = { Fs: Fs, St: SDKS.St, store: store, files: SDKS.files,
        col: function (n) { return Fs.collection(store, ROOT + '/' + n); }, doc: function (n, id) { return Fs.doc(store, ROOT + '/' + n, id); } };
      if (api.canQA()) {
        F.Fs.onSnapshot(F.col('approvals'), function (snap) {
          var o = {}; snap.forEach(function (d) { o[d.id] = d.data(); }); apprCache = o; api.approvalsShared = true;
          apprListeners.forEach(function (f) { try { f(); } catch (e) { console.error('[answers]', e); } });
        }, fail);
      }
      return new Promise(function (ok, no) {
        F.Fs.onSnapshot(F.col('answers'), function (snap) { var o = {}; snap.forEach(function (d) { o[d.id] = d.data(); }); cache = o; api.shared = true; ok(); notify(); }, no);
      });
    });
  }

  var api = window.HubAnswers = {
    backend: false, shared: false, error: false, user: null, signInError: null, approvalsShared: false,
    canAnswer: function () { return !!api.user && ['admin', 'team', 'client'].indexOf(api.user.role) >= 0; },
    canQA: function () { return !!api.user && ['admin', 'team'].indexOf(api.user.role) >= 0; },
    /* emails a one-time sign-in link; only accounts an admin created can use it (sign-up is closed) */
    signIn: function (email) {
      return init().then(function () {
        if (!AU) throw new Error('no backend');
        return AU.Au.sendSignInLinkToEmail(AU.auth, email, { url: location.origin + location.pathname + location.search, handleCodeInApp: true })
          .then(function () { try { localStorage.setItem(MAILKEY, email); } catch (e) {} });
      });
    },
    signOut: function () { return AU ? AU.Au.signOut(AU.auth) : Promise.resolve(); },
    init: init,
    /* the gate's way in: the hub's decryption keys, which only accounts with a role can read (newest first) */
    gateKeys: function () {
      return init().then(function () {
        if (!api.canAnswer()) return [];
        return SDKS.Fs.getDoc(SDKS.Fs.doc(SDKS.store, ROOT + '/meta', 'gate')).then(function (d) { return (d.exists() && d.data().keys) || []; });
      });
    },
    /* settles once the backend is known; the Feedback Drawer waits for it */
    ready: new Promise(function (ok) { settle = ok; }),
    start: function () {
      if (api.started) return api.ready; api.started = true;
      if (SEED) { cache = SEED.answers || {}; apprCache = SEED.approvals || {}; api.shared = true; api.approvalsShared = true; settle(); notify(); return api.ready; }
      (api.backend || (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) ? connect().catch(function (e) { F = null; cache = null; api.shared = false; api.error = true; console.error('[answers] shared storage unavailable', e); }) : Promise.resolve())
        .then(function () { settle(); notify(); });
      return api.ready;
    },
    all: function () { return cache || (api.backend ? {} : local()); },
    get: function (id) { return api.all()[id] || null; },
    /* optimistic: the cache and listeners first, then the write; a failed write pauses saving */
    save: function (id, rec) {
      if (F) { rec = clean(rec); if (api.user) rec.uid = api.user.uid; cache[id] = rec; notify(); F.Fs.setDoc(F.doc('answers', id), rec).catch(fail); return; }
      if (api.backend) return;   /* signed out or no role: never a silent local save */
      var o = local(); o[id] = rec; write(o);
    },
    remove: function (id) {
      var r = api.get(id);
      ((r && r.files) || []).forEach(function (f) { api.dropFile(f.id, f.path); });
      if (F) { delete cache[id]; notify(); F.Fs.deleteDoc(F.doc('answers', id)).catch(fail); return; }
      if (api.backend) return;
      var o = local(); delete o[id]; write(o);
    },
    onChange: function (fn) { listeners.push(fn); },
    putFile: function (file, qid) {
      var id = 'f' + Date.now() + Math.random().toString(36).slice(2, 7), meta = { id: id, name: file.name, size: file.size, type: file.type || 'application/octet-stream' };
      if (F) { meta.path = ROOT + '/answers/' + qid + '/' + id; return F.St.uploadBytes(F.St.ref(F.files, meta.path), file, { contentType: meta.type }).then(function () { return meta; }); }
      if (api.backend) return Promise.reject(new Error('not signed in'));
      return tx('readwrite', function (s) { return s.put(file, id); }).then(function () { return meta; });
    },
    getFile: function (meta) { return F && meta.path ? F.St.getBlob(F.St.ref(F.files, meta.path)) : tx('readonly', function (s) { return s.get(meta.id); }); },
    dropFile: function (id, path) { return F && path ? F.St.deleteObject(F.St.ref(F.files, path)).catch(fail) : api.backend ? Promise.resolve() : tx('readwrite', function (s) { return s.delete(id); }); },
    /* the Feedback Drawer's QA comments: team and admin accounts only */
    comments: function () {
      if (!F || !api.canQA()) return null;
      return { local: false,
        subscribe: function (fn) { return F.Fs.onSnapshot(F.col('comments'), function (snap) { var o = {}; snap.forEach(function (d) { o[d.id] = d.data(); }); fn(o); }, fail); },
        create: function (rec) { rec = clean(rec); rec.uid = api.user.uid; return F.Fs.addDoc(F.col('comments'), rec).then(function (r) { return r.id; }); },
        update: function (id, patch) { return F.Fs.updateDoc(F.doc('comments', id), clean(patch)); },
        remove: function (id) { return F.Fs.deleteDoc(F.doc('comments', id)); } };
    },
    /* email approvals (chassis module approval): team and admin accounts only. A record only records; nothing is sent. */
    approvals: function () {
      if (SEED) return { get: function (ref) { return apprCache[ref] || null; }, set: function () { return Promise.resolve(null); }, onChange: function () {} };
      if (!F || !api.canQA()) return null;
      return {
        get: function (ref) { return apprCache[ref] || null; },
        set: function (ref, rec) {
          var old = apprCache[ref], hist = ((old && old.history) || []).concat([{ state: rec.state, by: rec.by, at: rec.at, note: rec.note || '' }]).slice(-50);
          var full = clean({ ref: ref, state: rec.state, by: rec.by, at: rec.at, note: rec.note || '', uid: api.user.uid, history: hist });
          apprCache[ref] = full;
          return F.Fs.setDoc(F.doc('approvals', ref), full).then(function () { return full; }, function (e) { if (old) apprCache[ref] = old; else delete apprCache[ref]; fail(e); return old || null; });
        },
        onChange: function (fn) { apprListeners.push(fn); }
      };
    },
    /* Public view (public-view.js): the index of shares (team and admin read it) and their copies. A copy is files:
     * <token>.json, the manifest, and parts <token>.<n>.json. put() uploads the parts, then the manifest, then drops
     * parts the last copy had and this one does not, and only then writes the index; remove() takes the manifest down
     * first, then the parts and the index: the manifest is what makes a link work, so a half-done step never leaves a
     * link working that the index says is off. Admin only (the rules). */
    publicPages: function () {
      if (!F || !api.canQA()) return null;
      var path = function (token, n) { return ROOT + '/public/' + token + (n ? '.' + n : '') + '.json'; };
      var up = function (p, json) { return F.St.uploadBytes(F.St.ref(F.files, p), new Blob([json], { type: 'application/json' }), { contentType: 'application/json', cacheControl: 'no-cache' }); };
      var drop = function (p) { return F.St.deleteObject(F.St.ref(F.files, p)).catch(function (e) { if (!e || e.code !== 'storage/object-not-found') throw e; }); };
      var range = function (from, to) { var o = []; for (var i = from; i < to; i++) o.push(i); return o; };
      return {
        admin: api.user.role === 'admin',
        who: function () { return api.user ? api.user.name : ''; },
        subscribe: function (fn) { return F.Fs.onSnapshot(F.col('public'), function (snap) { var o = {}; snap.forEach(function (d) { o[d.id] = d.data(); }); fn(o); }, function (e) { console.error('[answers] public index', e); fn(null); }); },
        /* files: [manifest, part 1, …]; oldParts: how many files the share had (0 for a new share) */
        put: function (key, rec, files, oldParts) {
          var tok = rec.token, n = files.length;
          return Promise.all(range(1, n).map(function (i) { return up(path(tok, i), files[i]); }))
            .then(function () { return up(path(tok, 0), files[0]); })
            .then(function () { return Promise.all(range(n, oldParts || 0).map(function (i) { return drop(path(tok, i)); })); })
            .then(function () { rec = clean(rec); rec.uid = api.user.uid; return F.Fs.setDoc(F.doc('public', key), rec).then(function () { return rec; }); });
        },
        remove: function (key, token, parts) {
          return drop(path(token, 0))
            .then(function () { return Promise.all(range(1, parts || 1).map(function (i) { return drop(path(token, i)); })); })
            .then(function () { return F.Fs.deleteDoc(F.doc('public', key)); });
        },
        /* the stored copy of every page (tools/hub/public-prebuild.mjs, made at each publish), admin only: the index
         * hubs/ttrd/prebuilt/{pageKey} ({ route, hash, build, builtAt, parts, held, … }) and each copy's files
         * hubs/ttrd/prebuilt/<hash>.json and <hash>.<n>.json, the bytes of one JSON cut in order. load(rec) joins them; a
         * file refused or not found (403, 404) is a missing copy (null), never an error. The copy's takenAt becomes its
         * row's builtAt: a stored copy is "as of the last publish". */
        prebuilt: function () {
          if (api.user.role !== 'admin') return null;
          var file = function (hash, n) { return ROOT + '/prebuilt/' + hash + (n ? '.' + n : '') + '.json'; };
          var gone = function (e) { return !!e && (e.code === 'storage/object-not-found' || e.code === 'storage/unauthorized'); };
          return {
            subscribe: function (fn) { return F.Fs.onSnapshot(F.col('prebuilt'), function (snap) { var o = {}; snap.forEach(function (d) { o[d.id] = d.data(); }); fn(o); }, function (e) { console.warn('[answers] stored copies', e.code || e); fn(null); }); },
            load: function (rec) {
              if (!rec || !/^[0-9a-f]{32}$/.test(rec.hash || '')) return Promise.resolve(null);
              var n = Math.max(1, Math.min(999, Math.floor(+rec.parts || 1)));
              return Promise.all(range(0, n).map(function (i) { return F.St.getBytes(F.St.ref(F.files, file(rec.hash, i))); })).then(function (bufs) {
                var len = bufs.reduce(function (a, b) { return a + b.byteLength; }, 0), all = new Uint8Array(len), at = 0;
                bufs.forEach(function (b) { all.set(new Uint8Array(b), at); at += b.byteLength; });
                var copy = JSON.parse(new TextDecoder().decode(all));
                if (rec.builtAt) copy.takenAt = new Date(rec.builtAt).toISOString();
                return copy;
              }, function (e) { if (gone(e)) return null; throw e; });
            }
          };
        }
      };
    },
    /* PanUI journey drafts (panui-journey.js): team and admin accounts only. Built in the hub's simulator or by Claude
     * (tools/hub-firebase/journey-drafts.mjs); nothing here reaches PanUI. */
    journeyDrafts: function () {
      if (!F || !api.canQA()) return null;
      return {
        subscribe: function (fn) { return F.Fs.onSnapshot(F.col('journeyDrafts'), function (snap) { var o = {}; snap.forEach(function (d) { o[d.id] = d.data(); }); fn(o); }, fail); },
        save: function (id, rec) { rec = clean(rec); rec.uid = api.user.uid; return F.Fs.setDoc(F.doc('journeyDrafts', id), rec).then(function () { return rec; }); },
        remove: function (id) { return F.Fs.deleteDoc(F.doc('journeyDrafts', id)); },
        who: function () { return api.user ? api.user.name : ''; }
      };
    }
  };
  window.addEventListener('storage', function (e) { if (e.key === KEY && !F) notify(); });
})();
