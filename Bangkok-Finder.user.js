// ==UserScript==
// @name         42 Bangkok Cluster & Friends
// @namespace    sider.intra42.bangkok
// @description  Adds Bangkok TH cluster, cross-campus Friends presence, relative login time, Batch badges and per-batch level leaderboard.
// @match        https://meta.intra.42.fr/clusters*
// @match        https://profile.intra.42.fr/*
// @match        https://profile-v3.intra.42.fr/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @connect      meta.intra.42.fr
// @connect      api.intra.42.fr
// @updateURL    https://raw.githubusercontent.com/pik-vpx/42-Better-Of-Better-Intra-Userscript/main/Bangkok-Finder.user.js
// @downloadURL  https://raw.githubusercontent.com/pik-vpx/42-Better-Of-Better-Intra-Userscript/main/Bangkok-Finder.user.js
// @version      2.6.19
// @changelog    UI redesign per ui-ux-pro-max: slate dark system, teal CTAs, hairline borders, focus/hover/press states, denser lists.
// ==/UserScript==


(() => {
  'use strict';
  const ID = { style: 'bkk42-style', modal: 'bkk42-modal', shortcut: 'bkk42-shortcut', float: 'bkk42-float', clusterTab: 'bi-bangkok-tab', friendsTab: 'bi-friends-tab', topTab: 'bi-top-tab', clusterPane: 'bi-bangkok-cluster-pane', friendsPane: 'bi-friends-pane', topPane: 'bi-top-pane' };
  const SEEN_KEY = 'bi-bangkok-lastseen';
  const ROSTER_EXTRA_KEY = 'bkk42-roster-extra';
  const META_KEY = 'bi-bangkok-user-meta';
  const FRIENDS_KEY = 'bi-bangkok-friends';
  const IMAGES_KEY = 'bi-bangkok-friend-images';
  const CLUSTER_URL = 'https://meta.intra.42.fr/clusters.json';
  const BANGKOK_CAMPUS_ID = 33;
  const ACTIVE_CAMPUSES = [9,12,16,17,21,22,23,26,29,30,31,32,33,34,35,37,39,40,41,43,44,46,47,48,49,50,51,53,54,55];
  let bangkokCache = { time: 0, data: [], promise: null };
  let globalCache = { time: 0, map: new Map(), promise: null };
  const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const parseLogins = (v) => [...new Set(String(v || '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9_-]{2,30}$/.test(s)))];
  const readFriends = () => { try { const v = JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]'); return Array.isArray(v) ? parseLogins(v.join(' ')) : []; } catch (_) { return []; } };
  const writeFriends = (l) => localStorage.setItem(FRIENDS_KEY, JSON.stringify(l));
  const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (_) { return {}; } };
  const seenTime = (v) => (typeof v === 'number' ? v : ((v && v.t) || 0));
  const recordSeen = (entries, campusId) => { try { const s = readSeen(); const n = Date.now(); let ch = false; for (const e of entries || []) { const l = String((e && e.login) || '').toLowerCase(); if (!l) continue; const cp = Number((e && e.campus_id) || campusId || 0); const prev = s[l]; if (!prev || n - seenTime(prev) > 60000) { s[l] = { t: n, c: cp }; ch = true; } } if (ch) { for (const k of Object.keys(s)) { if (n - seenTime(s[k]) > 2592000000) delete s[k]; } localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } } catch (_) {} };
  const fmtAgo = (ms) => { if (!isFinite(ms) || ms < 0) ms = 0; const t = Math.floor(ms / 1000); const d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; if (d > 0) return d + 'd ' + h + 'h'; if (h > 0) return h + 'h ' + m + 'm'; if (m > 0) return m + 'm ' + s + 's'; return s + 's'; };
  const agoLabel = (beginAt, login, seenMap) => { if (beginAt) { const t = Date.parse(beginAt); if (!isNaN(t)) return fmtAgo(Date.now() - t); } if (login) { const s = (seenMap || readSeen())[String(login).toLowerCase()]; if (s) { const a = Date.now() - seenTime(s); if (a > 36e5) return '... ' + fmtAgo(a) + ' ago'; return 'seen ' + fmtAgo(a) + ' ago'; } } return '...'; };
  const batchFromDate = (iso) => { if (!iso) return null; const d = new Date(iso); if (isNaN(d)) return null; const y = d.getFullYear(); const n = y - 2017; if (!(n > 0 && n < 30)) return null; return { n, label: '#' + n }; };
  // Peerfinder parity (bundle: oe/ce) — status order and rules are their exact ones; staff are filtered from the roster, so not listed.
  const STATUS_LIST = ['Active', 'Pisciner', 'Freezing', 'Blackholed', 'Alumni'];
  const statusOf = (r) => (r.pis ? 'Pisciner' : r.alg ? 'Alumni' : (r.bh && Date.parse(r.bh) < Date.now() && !r.act) ? 'Blackholed' : r.act ? 'Active' : 'Freezing');


  const readMetaCache = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (_) { return {}; } };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  // SECURITY: never hardcode a token here — paste it in the Leaderboard UI box. Browser localStorage only, never in git.
  const API_TOKEN_KEY = 'bkk42-api-token';
  const API_CLIENT_ID = 'u-s4t2ud-15306ab01ddd3adffadab88702be58dcb5d7c50791f930aaababf8da79ae4d06';
  const API_REDIRECT_URI = 'https://meta.intra.42.fr/clusters';
  const API_SECRET_KEY = 'bkk42-api-secret';
  const gmGet = (k, fb) => {
    let g = fb, hasG = false;
    try { if (typeof GM_getValue !== 'undefined') { g = GM_getValue(k, fb); hasG = g !== fb && g != null; } } catch (_) {}
    if (hasG) return g;
    let l = fb;
    try { l = localStorage.getItem(k); } catch (_) { l = fb; }
    if (l == null) return fb;
    try { if (typeof GM_setValue !== 'undefined') GM_setValue(k, l); } catch (_) {}
    return l;
  };
  const gmSet = (k, v) => { try { if (typeof GM_setValue !== 'undefined') { GM_setValue(k, v); return; } } catch (_) {} try { localStorage.setItem(k, v); } catch (_) {} };
  const gmDel = (k) => { try { if (typeof GM_deleteValue !== 'undefined') { GM_deleteValue(k); return; } } catch (_) {} try { localStorage.removeItem(k); } catch (_) {} };
  const readApiSecret = () => gmGet(API_SECRET_KEY, '').trim();
  const readApiStore = () => { try { const raw = gmGet(API_TOKEN_KEY, ''); if (!raw) return {}; const o = JSON.parse(raw); if (o && typeof o === 'object' && !Array.isArray(o)) return o; return { a: raw }; } catch (_) { const fb = gmGet(API_TOKEN_KEY, ''); return fb ? { a: fb } : {}; } };
  const writeApiStore = (o) => gmSet(API_TOKEN_KEY, JSON.stringify(o));
  const v2Starts = [];
  const v2Slot = async () => {
    for (;;) {
      const now = Date.now();
      while (v2Starts.length && now - v2Starts[0] > 1000) v2Starts.shift();
      if (v2Starts.length < 2) { v2Starts.push(Date.now()); return; }
      await new Promise((r) => setTimeout(r, Math.max(50, v2Starts[0] + 1000 - now + 20)));
    }
  };
  const oauthTokenRequest = (body) => new Promise((res, rej) => {
    if (typeof GM_xmlhttpRequest !== 'function') return rej(new Error('no GM_xhr'));
    GM_xmlhttpRequest({ method: 'POST', url: 'https://api.intra.42.fr/oauth/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, data: body, responseType: 'json', timeout: 15000, onload: (r) => { if (r.status < 200 || r.status >= 300) return rej(new Error('HTTP ' + r.status)); try { const j = r.response != null ? r.response : JSON.parse(r.responseText); if (!j.access_token) return rej(new Error('no token')); res(j); } catch (e) { rej(e); } }, onerror: () => rej(new Error('Network request failed')), ontimeout: () => rej(new Error('Network request timed out')) });
  });
  let v2RefreshPromise = null;
  const ensureV2Token = () => {
    const s = readApiStore();
    if (s.a && (!s.exp || s.exp - Date.now() > 60000)) return Promise.resolve(true);
    if (!s.r || !readApiSecret()) return Promise.resolve(!!s.a);
    if (v2RefreshPromise) return v2RefreshPromise;
    v2RefreshPromise = (async () => {
      try {
        const body = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(s.r) + '&client_id=' + encodeURIComponent(API_CLIENT_ID) + '&client_secret=' + encodeURIComponent(readApiSecret());
        const t = await oauthTokenRequest(body);
        writeApiStore({ a: t.access_token, r: t.refresh_token || s.r, exp: Date.now() + (Number(t.expires_in) || 7200) * 1000 });
        apiStatus.ok = true;
        return true;
      } catch (_) { return !!readApiStore().a; }
      finally { v2RefreshPromise = null; }
    })();
    return v2RefreshPromise;
  };
  let exchangeCodeLastErr = '';
  const exchangeCode = async (code) => {
    const sec = readApiSecret();
    if (!sec) return false;
    const body = 'grant_type=authorization_code&client_id=' + encodeURIComponent(API_CLIENT_ID) + '&client_secret=' + encodeURIComponent(sec) + '&code=' + encodeURIComponent(code) + '&redirect_uri=' + encodeURIComponent(API_REDIRECT_URI);
    try {
      const t = await oauthTokenRequest(body);
      writeApiStore({ a: t.access_token, r: t.refresh_token || '', exp: Date.now() + (Number(t.expires_in) || 7200) * 1000 });
      apiStatus.ok = true;
      return true;
    } catch (e) { exchangeCodeLastErr = String((e && e.message) || e || 'error'); return false; }
  };
  const apiStatus = { ok: null };
  const readApiToken = () => { try { const s = readApiStore(); return String((s && s.a) || ''); } catch (_) { return ''; } };
  const apiV2 = async (path) => {
    try { await ensureV2Token(); } catch (_) {}
    await v2Slot();
    const tk = readApiToken();
    if (!tk) throw new Error('no token');
    const url = 'https://api.intra.42.fr/v2' + path;
    if (typeof GM_xmlhttpRequest === 'function') return new Promise((res, rej) => GM_xmlhttpRequest({ method: 'GET', url, headers: { Authorization: 'Bearer ' + tk, Accept: 'application/json' }, responseType: 'json', timeout: 15000, onload: (r) => { if (r.status === 401 || r.status === 403) { apiStatus.ok = false; return rej(new Error('HTTP ' + r.status + ' bad token')); } if (r.status < 200 || r.status >= 300) return rej(new Error('HTTP ' + r.status)); apiStatus.ok = true; try { res(r.response != null ? r.response : JSON.parse(r.responseText)); } catch (e) { rej(e); } }, onerror: () => rej(new Error('Network request failed')), ontimeout: () => rej(new Error('Network request timed out')) }));
  };
  const parseV2Stats = (s) => {
    if (s == null) return null;
    if (Array.isArray(s)) { const h = s.reduce((a, x) => a + Number((x && (x.total_hours || x.hours)) || 0), 0); return h > 0 ? h : null; }
    if (typeof s === 'object') {
      let mins = 0, any = false;
      for (const v of Object.values(s)) {
        if (typeof v === 'number' && isFinite(v)) { mins += v * 60; any = true; }
        else if (typeof v === 'string') { const m = v.match(/(\d+):(\d\d)(?::(\d\d))?/); if (m) { mins += Number(m[1]) * 60 + Number(m[2]); any = true; } }
      }
      return any ? mins / 60 : null;
    }
    return null;
  };
  const readRosterExtra = () => { try { const v = JSON.parse(localStorage.getItem(ROSTER_EXTRA_KEY) || '[]'); return Array.isArray(v) ? parseLogins(v.join(' ')) : []; } catch (_) { return []; } };
  const buildRoster = (onlineLogins) => { const set = new Set(); for (const l of (onlineLogins || [])) { const s = String(l || '').toLowerCase(); if (s) set.add(s); } for (const l of Object.keys(readSeen())) set.add(String(l).toLowerCase()); for (const l of readFriends()) set.add(String(l).toLowerCase()); for (const l of readRosterExtra()) set.add(String(l).toLowerCase()); return [...set].filter((s) => /^[a-z0-9_-]{2,30}$/.test(s)); };
  const getUserMeta = async (login) => { login = String(login || '').toLowerCase(); if (!login) return {}; const c = readMetaCache(); const now = Date.now(); if (c[login] && now - (c[login].t || 0) < 604800000) return c[login];
    if (readApiToken()) {
      try {
        const u = await apiV2('/users/' + encodeURIComponent(login));
        const cus = Array.isArray(u.cursus_users) ? u.cursus_users : [];
        const prev = c[login] || {};
        const main = cus.find((e) => e && e.cursus && e.cursus.slug === '42cursus') || null;
        const pisc = !main ? (cus.find((e) => e && e.cursus && (e.cursus.slug === 'c-piscine' || e.cursus.name === 'C Piscine')) || null) : null;
        const level = main ? (main.level != null ? Number(main.level) : (prev.level != null ? prev.level : null)) : null;
        const begin = (main && (main.begin_at || main.created_at)) || (pisc && (pisc.begin_at || pisc.created_at)) || prev.begin || '';
        let batch = prev.batch || '', batchN = prev.batchN || 0;
        if (begin) { const b = batchFromDate(begin); if (b) { batch = b.label; batchN = b.n; } }
        const st = u['staff?'] ? 'Staff' : (pisc ? 'Pisciner' : u['alumni?'] ? 'Alumni' : (u.blackholed_at && Date.parse(u.blackholed_at) < Date.now() && !u['active?']) ? 'Blackholed' : u['active?'] ? 'Active' : 'Freezing');
        const img = (u.image && u.image.versions && u.image.versions.medium) || u.image_url || prev.img || '';
        const m = { id: (u && u.id) || 0, level, batch, batchN, begin, st, img, t: now };
        try { const cc = readMetaCache(); cc[login] = m; localStorage.setItem(META_KEY, JSON.stringify(cc)); } catch (_) {}
        return m;
      } catch (e) { console.warn('[bkk42] user meta failed', login, String((e && e.message) || e)); }
    }
    return c[login] || {}; };
  const requestJSON = async (url) => { if (window.siderRuntime && window.siderRuntime.fetch) { const r = await window.siderRuntime.fetch(url, { credentials: 'include' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); } if (typeof GM_xmlhttpRequest === 'function') return new Promise((res, rej) => GM_xmlhttpRequest({ method: 'GET', url, responseType: 'json', withCredentials: true, timeout: 15000, onload: (r) => { if (r.status < 200 || r.status >= 300) return rej(new Error('HTTP ' + r.status)); try { res(r.response != null ? r.response : JSON.parse(r.responseText)); } catch (e) { rej(e); } }, onerror: () => rej(new Error('Network request failed')), ontimeout: () => rej(new Error('Network request timed out')) }));
  };
  const getBangkok = async (force) => { if (!force && bangkokCache.time && Date.now() - bangkokCache.time < 60000) return bangkokCache.data; if (bangkokCache.promise) return bangkokCache.promise; bangkokCache.promise = requestJSON(CLUSTER_URL).then((data) => { bangkokCache.data = Array.isArray(data) ? data.filter((e) => e && !e.end_at && e.login && e.host) : [];       bangkokCache.time = Date.now(); recordSeen(bangkokCache.data, BANGKOK_CAMPUS_ID); return bangkokCache.data; }).finally(() => { bangkokCache.promise = null; }); return bangkokCache.promise; };
  const getGlobalMap = async (force) => { if (!force && globalCache.time && Date.now() - globalCache.time < 60000) return globalCache.map; if (globalCache.promise) return globalCache.promise; globalCache.promise = (async () => { const urls = [CLUSTER_URL].concat(ACTIVE_CAMPUSES.filter((id) => id !== BANGKOK_CAMPUS_ID).map((id) => CLUSTER_URL + '?campus_id=' + id)); let okCount = 0; const settled = await Promise.all(urls.map(async (u) => { try { const d = await requestJSON(u); okCount++; return Array.isArray(d) ? d.filter((e) => e && !e.end_at && e.login && e.host) : []; } catch (e) { console.warn('[bkk42] feed failed', u.replace('https://meta.intra.42.fr', ''), String((e && e.message) || e)); return []; } })); if (!okCount) throw new Error('all cluster feed requests failed');       const map = new Map(); for (const e of settled.flat()) map.set(String(e.login).toLowerCase(), e); recordSeen([...map.values()], 0); globalCache.map = map; globalCache.time = Date.now(); return map; })().finally(() => { globalCache.promise = null; }); return globalCache.promise; };
  const CAMPUS_NAMES_KEY = 'bkk42-campus-names';
  const campusNameCache = { map: null, promise: null };
  const readCampusNames = () => { try { return JSON.parse(localStorage.getItem(CAMPUS_NAMES_KEY) || '{}') || {}; } catch (_) { return {}; } };
  // Campus names from Better Intra's public campuses.json (MIT) — Bangkok pinned, rest fall back to Campus {id}.
  const STATIC_CAMPUS_NAMES = { 9: 'Lyon', 12: 'Belgium', 16: 'Khouribga', 17: 'Moscow', 21: 'Benguerir', 22: 'Madrid', 23: 'Kazan', 26: 'Tokyo', 29: 'Seoul', 30: 'Rome', 31: 'Angouleme', 32: 'Yerevan', 33: 'Bangkok', 34: 'Kuala Lumpur', 35: 'Amman', 37: 'Malaga', 39: 'Heilbronn', 40: 'Urduliz', 41: 'Nice', 43: 'Abu Dhabi', 44: 'Wolfsburg', 46: 'Barcelona', 47: 'Lausanne', 48: 'Mulhouse', 49: 'Istanbul', 50: 'Kocaeli', 51: 'Berlin', 53: 'Vienna', 54: '42 Central', 55: 'Tétouan' };
  const loadCampusNames = () => {
    if (campusNameCache.map) return Promise.resolve(campusNameCache.map);
    const merged = Object.assign({}, STATIC_CAMPUS_NAMES, readCampusNames());
    merged[BANGKOK_CAMPUS_ID] = 'Bangkok';
    campusNameCache.map = merged;
    if (readApiToken()) {
      return (async () => {
        try {
          const d = await withTimeout(apiV2('/campus?page[size]=100'), 12000);
          for (const cp of (Array.isArray(d) ? d : [])) {
            const id = Number(cp && cp.id);
            if (id && cp.name) merged[id] = String(cp.name);
          }
          try { localStorage.setItem(CAMPUS_NAMES_KEY, JSON.stringify(merged)); } catch (_) {}
        } catch (e) { console.warn('[bkk42] campus names failed', String((e && e.message) || e)); }
        return merged;
      })();
    }
    return Promise.resolve(merged);
  };
  const campusClusterCache = { time: new Map(), data: new Map(), promise: new Map() };
  const getCampusCluster = async (id, force) => {
    id = Number(id);
    const t = campusClusterCache.time.get(id) || 0;
    if (!force && campusClusterCache.data.has(id) && Date.now() - t < 60000) return campusClusterCache.data.get(id);
    if (campusClusterCache.promise.has(id)) return campusClusterCache.promise.get(id);
    const p = requestJSON(CLUSTER_URL + '?campus_id=' + id).then((data) => {
      const rows = Array.isArray(data) ? data.filter((e) => e && !e.end_at && e.login && e.host) : [];
      campusClusterCache.data.set(id, rows); campusClusterCache.time.set(id, Date.now());
      recordSeen(rows, id);
      return rows;
    }).finally(() => { campusClusterCache.promise.delete(id); });
    campusClusterCache.promise.set(id, p);
    return p;
  };
  const ROSTER_CACHE_KEY = 'bkk42-campus-roster@4';
  const ROSTER_PAGE_SIZE = 100;
  const ROSTER_MAX_PAGES = 150;
  let lastSeedHits = 0;
  let lastRosterSource = '';
  let lastRosterFresh = false;
  // Peerfinder parity: their exact hardcoded cursus list (bundle: ke=["42cursus","c-piscine"]) — no discovery.
  const ROSTER_SLUGS = ['42cursus', 'c-piscine'];
  const loadCampusRoster = async (id, onPage, force) => {
    id = Number(id);
    lastRosterFresh = false;
    lastRosterSource = ROSTER_SLUGS.join('+');
    let rc = {};
    try { rc = JSON.parse(localStorage.getItem(ROSTER_CACHE_KEY) || '{}') || {}; } catch (_) {}
    if (!force && rc[id] && Date.now() - (rc[id].t || 0) < 86400000 && Array.isArray(rc[id].logins) && rc[id].logins.length) return rc[id].logins;
    if (!readApiToken()) return null;
    const slugs = ROSTER_SLUGS;
    const rows = new Map();
    let firstErr = '';
    const putRow = (u, slug) => {
      if (!u || typeof u !== 'object') return;
      const user = (u.user && typeof u.user === 'object') ? u.user : null;
      if (u['staff?'] || (user && user['staff?'])) return;
      const login = String((user && user.login) || u.login || '').toLowerCase();
      if (!/^[a-z0-9_-]{2,30}$/.test(login)) return;
      const begin = u.begin_at || u.created_at || '';
      const t = begin ? Date.parse(begin) : NaN;
      const level = u.level != null ? Number(u.level) : null;
      const uid = (user && user.id) || u.id || 0;
      const src = user || u;
      const mk = { id: uid, level, begin, pis: slug === 'c-piscine', act: !!src['active?'], alg: !!src['alumni?'], bh: u.blackholed_at || src.blackholed_at || '', img: (src.image && src.image.versions && src.image.versions.medium) || src.image_url || '' };
      const cur = rows.get(login);
      if (!cur) { rows.set(login, mk); return; }
      const curT = cur.begin ? Date.parse(cur.begin) : NaN;
      if (!isNaN(t) && (isNaN(curT) || t > curT)) {
        rows.set(login, { id: uid || cur.id, level: level != null ? level : cur.level, begin, pis: mk.pis, act: mk.act, alg: mk.alg, bh: mk.bh || cur.bh, img: mk.img || cur.img });
      } else {
        if (cur.level == null && level != null) cur.level = level;
        if (!cur.begin && begin) cur.begin = begin;
        if (!cur.id && uid) cur.id = uid;
        if (!cur.img && mk.img) cur.img = mk.img;
      }
    };
    const progress = () => { if (typeof onPage === 'function') { try { onPage(rows.size); } catch (_) {} } };
    for (const slug of slugs) {
      const before = rows.size;
      for (let page = 1; page <= ROSTER_MAX_PAGES; page++) {
        let d = null;
        try { d = await withTimeout(apiV2('/cursus/' + encodeURIComponent(slug) + '/cursus_users?filter[campus_id]=' + id + '&filter[future]=false&page[size]=' + ROSTER_PAGE_SIZE + '&page[number]=' + page), 20000); }
        catch (e) {
          if (page === 1 && rows.size === before && !firstErr) firstErr = slug + ': ' + String((e && e.message) || e);
          break;
        }
        if (!Array.isArray(d) || !d.length) break;
        for (const u of d) putRow(u, slug);
        progress();
        if (d.length < ROSTER_PAGE_SIZE) break;
      }
    }
    if (!rows.size) throw new Error(firstErr || 'roster empty on all cursus');
    lastRosterFresh = true;
    const logins = [...rows.keys()];
    try {
      const c = readMetaCache(); const now = Date.now(); let ch = false; lastSeedHits = 0;
      for (const [login, s] of rows) {
        const prev = c[login] || {};
        const m = {
          id: s.id || prev.id || 0,
          level: s.pis ? null : (s.level != null ? s.level : (prev.level != null ? prev.level : null)),
          batch: prev.batch || '', batchN: prev.batchN || 0,
          begin: s.begin || prev.begin || '',
          st: statusOf(s),
          img: s.img || prev.img || '',
          t: now,
        };
        if (m.begin && !m.batchN) { const b = batchFromDate(m.begin); if (b) { m.batch = b.label; m.batchN = b.n; } }
        c[login] = m; ch = true;
        if (m.level != null) lastSeedHits++;
      }
      if (ch) { for (const k of Object.keys(c)) { if (now - ((c[k] && c[k].t) || 0) > 2592000000) delete c[k]; } localStorage.setItem(META_KEY, JSON.stringify(c)); }
    } catch (_) {}
    try { if (logins.length) { rc[id] = { t: Date.now(), logins }; localStorage.setItem(ROSTER_CACHE_KEY, JSON.stringify(rc)); } } catch (_) {}
    return logins;
  };
  const bkk42RosterDebug = async (id) => {
    id = Number(id) || BANGKOK_CAMPUS_ID;
    const out = { id, token: !!readApiToken(), source: lastRosterSource || '', slugs: [], pages: {} };
    out.slugs = ROSTER_SLUGS.slice();
    for (const slug of out.slugs) {
      try {
        const d = await withTimeout(apiV2('/cursus/' + encodeURIComponent(slug) + '/cursus_users?filter[campus_id]=' + id + '&filter[future]=false&page[size]=' + ROSTER_PAGE_SIZE + '&page[number]=1'), 15000);
        const arr = Array.isArray(d) ? d : [];
        out.pages[slug] = { ok: true, len: arr.length, first: arr[0] ? String(((arr[0].user && arr[0].user.login) || arr[0].login) || '') : '', levels: arr.filter((u) => u && u.level != null).length };
      } catch (e) { out.pages[slug] = { ok: false, err: String((e && e.message) || e) }; }
    }
    try { console.log('[bkk42-roster-debug]', JSON.stringify(out)); } catch (_) {}
    return out;
  };
  try { window.__bkk42RosterDebug = bkk42RosterDebug; } catch (_) {}
  try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) unsafeWindow.__bkk42RosterDebug = bkk42RosterDebug; } catch (_) {}
  const installStyle = () => { document.getElementById(ID.style)?.remove(); const st = el('style'); st.id = ID.style; st.textContent = '.bkk42-root{--bg:#0a101d;--panel:#101a2e;--card:#182338;--seat:#212e46;--line:rgba(148,163,184,.16);--muted:#94a3b8;--cyan:#00babc;--green:#34d399;--btn:#1f2b44;--btn-hi:#2a3a5c;--data:ui-monospace,"Cascadia Mono","Fira Code",Consolas,monospace;box-sizing:border-box;min-height:480px;padding:24px;background:radial-gradient(900px 320px at 15% -8%,rgba(0,186,188,.07),transparent 65%),var(--bg);color:#e8eef7;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:dark}.bkk42-root *{box-sizing:border-box}.bkk42-root button{border:1px solid rgba(148,163,184,.14);border-radius:8px;padding:9px 14px;background:var(--btn);color:#e2e8f0;font-weight:700;cursor:pointer;transition:background .15s,border-color .15s,transform .08s,box-shadow .15s}.bkk42-root button:hover{background:var(--btn-hi)}.bkk42-root button:active:not(:disabled){transform:scale(.97)}.bkk42-root button:disabled{cursor:wait;opacity:.55}.bkk42-root .primary,.bkk42-nav button.active{background:var(--cyan);border-color:transparent;color:#052427;box-shadow:0 4px 14px rgba(0,186,188,.22)}.bkk42-root .primary:hover{background:#2ad3d5}.bkk42-root .bkk42-dots{padding:2px 9px;font-size:12px;line-height:1.6}.bkk42-root select,.bkk42-root textarea,.bkk42-root input{color-scheme:dark}.bkk42-root select.bkk42-sel{border:1px solid rgba(148,163,184,.14);border-radius:8px;padding:9px 12px;background:var(--btn);color:#e2e8f0;font-weight:700;cursor:pointer;transition:background .15s,border-color .15s}.bkk42-root select.bkk42-sel:hover{background:var(--btn-hi)}.bkk42-root .bkk42-input{flex:1;min-width:0;padding:10px 12px;background:#16233c;color:#e8eef7;border:1px solid #3d5178;border-radius:8px;box-shadow:inset 0 1px 2px rgba(2,6,16,.45);transition:border-color .15s,box-shadow .15s}.bkk42-root .bkk42-input:focus{outline:none;border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,186,188,.18)}.bkk42-root button:focus-visible,.bkk42-root select:focus-visible,.bkk42-root textarea:focus-visible,.bkk42-root input:focus-visible,.bkk42-root summary:focus-visible,.bkk42-root a:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}.bkk42-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}.bkk42-root h2{margin:0;color:#fff;font-size:24px;letter-spacing:-.02em;font-weight:800}.bkk42-note{margin-top:6px;color:var(--muted);font-size:13px}.bkk42-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.bkk42-total{display:flex;align-items:baseline;gap:7px;padding:8px 14px;background:rgba(34,197,94,.10);border:1px solid rgba(34,197,94,.35);border-radius:8px;color:#4ade80;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.bkk42-total strong{font-size:20px;color:#6ee7b7;font-family:var(--data)}.bkk42-zones{display:grid;gap:20px}.bkk42-zone{padding:18px;background:var(--panel);border:1px solid var(--line);border-radius:12px}.bkk42-zone h3{margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid var(--line);color:#5eead4;font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}.bkk42-zone .bkk42-zones{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.bkk42-tables{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.bkk42-table{padding:12px;background:var(--card);border:1px solid var(--line);border-radius:10px}.bkk42-table-title{text-align:center;margin-bottom:10px;color:#5eead4;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.bkk42-chairs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bkk42-seat{display:block;min-height:60px;padding:9px;overflow:hidden;background:var(--seat);border:2px solid transparent;border-radius:8px;color:#fff;text-decoration:none;transition:border-color .15s,background .15s}.bkk42-seat:hover{border-color:var(--cyan);color:#fff;background:#26344f}.bkk42-seat.friend{border-color:#22c55e;background:rgba(34,197,94,.10)}.bkk42-seat.empty{background:rgba(148,163,184,.05);color:#64748b;pointer-events:none}.bkk42-seat img{float:left;width:40px;height:40px;margin-right:8px;border-radius:50%;object-fit:cover;background:#2a3550;box-shadow:0 0 0 1px rgba(148,163,184,.25)}.bkk42-host{display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#8ba0bf}.bkk42-login{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:700}.bkk42-seat .bkk42-login{color:#fff}.bkk42-empty,.bkk42-error{padding:24px;text-align:center;background:rgba(148,163,184,.05);border:1px dashed var(--line);border-radius:10px;color:var(--muted)}.bkk42-error{color:#fca5a5;border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.08)}.bkk42-editor{display:none;margin-bottom:18px;padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:12px}.bkk42-editor.open{display:block}.bkk42-editor textarea{width:100%;min-height:105px;padding:11px;background:#16233c;color:#e8eef7;border:1px solid #3d5178;border-radius:8px;resize:vertical;font-family:var(--data);font-size:13px;box-shadow:inset 0 1px 2px rgba(2,6,16,.45);transition:border-color .15s,box-shadow .15s}.bkk42-editor textarea:focus{outline:none;border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,186,188,.18)}.bkk42-editor-row{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}.bkk42-hint{color:var(--muted);font-size:12px}.bkk42-friends{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}.bkk42-card{display:flex;align-items:center;gap:12px;padding:13px;background:var(--card);border:1px solid var(--line);border-left:4px solid #475569;border-radius:10px;transition:background .15s,border-color .15s}.bkk42-card:hover{background:#1e2b44}.bkk42-card.online{border-left-color:#22c55e}.bkk42-card img,.bkk42-avatar{flex:none;width:54px;height:54px;border-radius:50%;object-fit:cover;background:#2a3550}.bkk42-avatar{display:grid;place-items:center;color:#94a3b8;font-weight:800;border:1px dashed rgba(148,163,184,.3)}.bkk42-card a{color:#fff;font-size:15px;font-weight:800;text-decoration:none}.bkk42-card a:hover{color:#5eead4}.bkk42-status{margin-top:3px;color:#94a3b8;font-size:13px}.bkk42-card.online .bkk42-status{color:#4ade80}.bkk42-sub{margin-top:4px;font-size:11px;color:var(--muted)}.bkk42-seat .bkk42-sub{color:#aab8cf;margin-top:7px}.bkk42-pill{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:20px;background:rgba(0,186,188,.14);border:1px solid rgba(0,186,188,.3);color:#5eead4;font-size:10.5px;font-weight:800}.bkk42-rank{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 11px;background:var(--card);border:1px solid transparent;border-radius:8px;transition:background .15s,border-color .15s}.bkk42-rank:hover{background:#1e2c46;border-color:rgba(148,163,184,.18)}.bkk42-rank>b{font-family:var(--data);font-size:12px;color:#64748b}.bkk42-rank a{color:#fff;text-decoration:none;min-width:0}.bkk42-rank a:hover{color:#5eead4}.bkk42-lv{color:var(--green);font-weight:800;font-family:var(--data);font-size:13px}.bkk42-seat>.bkk42-pill{margin:7px 0 1px}#' + ID.modal + '{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(3,7,18,.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);color-scheme:dark}#' + ID.modal + '[hidden]{display:none}#' + ID.modal + ' .bkk42-shell{display:flex;flex-direction:column;width:min(1180px,97vw);height:min(820px,94vh);overflow:hidden;background:#0d1526;border:1px solid rgba(148,163,184,.16);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.5)}#' + ID.modal + ' .bkk42-bar{display:flex;align-items:center;gap:18px;padding:12px 18px;background:#101a2e;border-bottom:1px solid var(--line);color:#fff}.bkk42-brand{font-size:17px;font-weight:800;white-space:nowrap;letter-spacing:-.01em}.bkk42-brand::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--cyan);margin-right:9px;box-shadow:0 0 8px rgba(0,186,188,.8);vertical-align:middle}.bkk42-nav{display:flex;gap:6px;flex-wrap:wrap}.bkk42-nav button{border:1px solid rgba(148,163,184,.14);border-radius:8px;padding:8px 14px;background:transparent;color:#cbd5e1;font-weight:700;cursor:pointer;transition:background .15s,color .15s,transform .08s}.bkk42-nav button:hover{background:var(--btn-hi);color:#fff}.bkk42-close{margin-left:auto;border:1px solid transparent;border-radius:8px;background:transparent;color:#94a3b8;font-size:26px;line-height:1;cursor:pointer;width:36px;height:36px;transition:background .15s,color .15s}.bkk42-close:hover{background:rgba(148,163,184,.12);color:#fff}.bkk42-modal-body{flex:1;overflow:auto;scrollbar-color:#334155 transparent}#' + ID.modal + ' ::-webkit-scrollbar{width:10px;height:10px}#' + ID.modal + ' ::-webkit-scrollbar-thumb{background:#334155;border-radius:8px}#' + ID.modal + ' ::-webkit-scrollbar-track{background:transparent}.bkk42-view[hidden]{display:none}#bkk42-float{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:54px;height:54px;border:0;border-radius:50%;background:linear-gradient(160deg,#00c2c4,#018a8c);color:#052427;font-size:17px;font-weight:850;cursor:pointer;box-shadow:0 8px 24px rgba(0,186,188,.35);transition:transform .15s,box-shadow .15s}#bkk42-float:hover{transform:scale(1.06);box-shadow:0 10px 28px rgba(0,186,188,.5)}#bkk42-float:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}@media(max-width:700px){.bkk42-head{flex-direction:column}.bkk42-tables{grid-template-columns:1fr}}.bkk42-rav{width:38px;height:38px;border-radius:50%;object-fit:cover;flex:none;background:#2a3550;box-shadow:0 0 0 1px rgba(148,163,184,.25)}.bkk42-stc-active{color:#4ade80}.bkk42-stc-pisciner{color:#ffd166}.bkk42-stc-freezing{color:#6cb6ff}.bkk42-stc-blackholed{color:#ff6b6b}.bkk42-stc-alumni{color:#4dd0e1}.bkk42-stc-staff{color:#b388ff}.bkk42-stfilter{position:relative}.bkk42-stfilter summary{display:inline-block;list-style:none;border:1px solid rgba(148,163,184,.14);border-radius:8px;padding:9px 14px;background:var(--btn);color:#e2e8f0;font-weight:700;cursor:pointer;transition:background .15s}.bkk42-stfilter summary:hover{background:var(--btn-hi)}.bkk42-stfilter summary::-webkit-details-marker{display:none}.bkk42-stfilter[open] summary{background:var(--cyan);border-color:transparent;color:#052427}.bkk42-stpanel{position:absolute;top:calc(100% + 6px);left:0;z-index:30;display:grid;gap:4px;min-width:178px;padding:10px;background:#101a2e;border:1px solid var(--line);border-radius:10px;box-shadow:0 14px 36px rgba(0,0,0,.5)}.bkk42-stopt{display:flex;align-items:center;gap:9px;padding:5px 7px;border-radius:6px;font-size:13px;color:#cbd5e1;cursor:pointer;transition:background .12s}.bkk42-stopt:hover{background:rgba(148,163,184,.10)}.bkk42-stopt input{accent-color:var(--cyan)}@media(prefers-reduced-motion:reduce){.bkk42-root,.bkk42-root *,#bkk42-modal,#bkk42-modal *,.bkk42-sess-back,.bkk42-sess-back *{transition:none!important;animation:none!important}}.bkk42-root .bkk42-input::placeholder,.bkk42-root textarea::placeholder{color:#8fa3c4;opacity:1}@media(max-width:1080px){.bkk42-zone .bkk42-zones{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.bkk42-zone .bkk42-zones{grid-template-columns:minmax(0,1fr)}}'; document.head.appendChild(st); };
  const makeHead = (t, n) => { const h = el('div', 'bkk42-head'); const ti = el('div'); ti.append(el('h2', '', t), el('div', 'bkk42-note', n)); const a = el('div', 'bkk42-actions'); h.append(ti, a); return { head: h, note: ti.lastElementChild, actions: a }; };
  const batchLabel = (m) => { const n = m && (m.batchN | 0); return n > 0 ? '#' + n : ''; };
  const paintBatchPill = (scopeEl, login, m) => {
    const label = batchLabel(m);
    if (!label || !scopeEl || !scopeEl.isConnected || scopeEl.querySelector('.bkk42-pill')) return;
    const p = el('span', 'bkk42-pill', ' ' + label);
    const loginEl = scopeEl.querySelector('.bkk42-login');
    if (loginEl && scopeEl.classList.contains('bkk42-seat')) {
      if (typeof loginEl.after === 'function') loginEl.after(p);
      else loginEl.parentNode.insertBefore(p, loginEl.nextSibling);
    } else {
      const anchor = loginEl || scopeEl.querySelector('a');
      if (!anchor) return;
      anchor.appendChild(p);
    }
  };
  const enrichCards = async (root) => {
    const cards = [...root.querySelectorAll('.bkk42-card[data-login], .bkk42-seat[data-login]')].slice(0, 80);
    const cache = readMetaCache();
    for (const card of cards) {
      const login = (card.dataset.login || '').toLowerCase();
      const hit = login && cache[login];
      if (hit && batchLabel(hit)) paintBatchPill(card, login, hit);
    }
    const queue = cards.filter((card) => !card.dataset.metaDone);
    const runQueue = async () => {
      for (let i = 0; i < queue.length; i += 4) {
        if (!root.isConnected) return;
        await Promise.all(queue.slice(i, i + 4).map(async (card) => {
          const login = (card.dataset.login || '').toLowerCase();
          if (!login || card.dataset.metaDone || !card.isConnected) return;
          card.dataset.metaDone = '1';
          try {
            const m = await getUserMeta(login);
            if (!card.isConnected) return;
            paintBatchPill(card, login, m);
            const det = card.querySelector('div');
            if (det && card.classList.contains('bkk42-card') && !det.querySelector('.bkk42-lv')) {
              if (m.level != null) det.appendChild(el('div', 'bkk42-lv', 'Lv ' + Number(m.level).toFixed(2)));
              else if (m.st && m.st !== 'Active') det.appendChild(el('div', 'bkk42-lv bkk42-stc-' + String(m.st).toLowerCase(), m.st));
            }
          } catch (_) {}
        }));
        await new Promise((r) => setTimeout(r, 200));
      }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { runQueue(); }, { timeout: 5000 });
    else setTimeout(() => { runQueue(); }, 1500);
  };
  const renderCluster = async (root, force) => { const myToken = (root.dataset.loadToken = String((Number(root.dataset.loadToken) || 0) + 1)); const alive = () => root.isConnected && root.dataset.loadToken === myToken; root.className = 'bkk42-root'; root.replaceChildren(); const hh = makeHead('Bangkok TH', 'Loading live workstations...'); const total = el('div', 'bkk42-total'); const tn = el('strong', '', '--'); total.append(tn, document.createTextNode(' Online')); const ref = el('button', 'primary', 'Refresh'); ref.type = 'button'; ref.onclick = () => renderCluster(root, true); hh.actions.append(total, ref); root.appendChild(hh.head); try { ref.disabled = true; const locs = await getBangkok(force); if (!alive()) return; const fr = new Set(readFriends()); tn.textContent = String(locs.length); hh.note.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); const zones = el('div', 'bkk42-zones'); for (let z = 1; z <= 3; z++) { const users = locs.filter((e) => String(e.host).toLowerCase().startsWith('z' + z + 't')); const zone = el('section', 'bkk42-zone'); zone.appendChild(el('h3', '', 'Zone ' + z + ' \u00B7 ' + users.length + ' online')); const tm = new Map(); for (const u of users) { const m2 = String(u.host).match(/^z\d+t(\d+)c(\d+)$/i); if (!m2) continue; const tb = Number(m2[1]); if (!tm.has(tb)) tm.set(tb, new Map()); tm.get(tb).set(Number(m2[2]), u); } if (!tm.size) zone.appendChild(el('div', 'bkk42-empty', 'No active tables')); else { const tables = el('div', 'bkk42-tables'); for (const tt of [...tm].sort((a, b) => a[0] - b[0])) { const table = el('div', 'bkk42-table'); table.appendChild(el('div', 'bkk42-table-title', 'Table T' + tt[0])); const grid = el('div', 'bkk42-chairs'); for (let ch = 1; ch <= 4; ch++) { const u = tt[1].get(ch); const login = u ? String(u.login).toLowerCase() : ''; const seat = el(u ? 'a' : 'div', 'bkk42-seat' + (u && fr.has(login) ? ' friend' : '') + (u ? '' : ' empty')); if (u) { seat.href = 'https://profile.intra.42.fr/users/' + encodeURIComponent(login); if (u.cdn_uri) { const im = el('img'); im.src = String(u.cdn_uri); im.alt = ''; im.loading = 'lazy'; seat.appendChild(im); } } seat.append(el('span', 'bkk42-host', 'Z' + z + ' \u00B7 T' + tt[0] + ' \u00B7 C' + ch), el('span', 'bkk42-login', u ? login + (fr.has(login) ? ' \u2605' : '') : 'Empty')); if (u) { seat.appendChild(el('span', 'bkk42-sub', agoLabel(u.begin_at, login))); seat.appendChild(makeDotsButton(login)); seat.dataset.login = login; } grid.appendChild(seat); } table.appendChild(grid); tables.appendChild(table); } zone.appendChild(tables); } zones.appendChild(zone); } root.appendChild(zones); enrichCards(root); } catch (e) { if (alive()) { console.warn('[bkk42] cluster feed failed', String((e && e.message) || e)); hh.note.textContent = 'Live feed unavailable'; root.appendChild(el('div', 'bkk42-error', 'Could not load Bangkok cluster locations.')); } } finally { ref.disabled = false; } };
  const hydrateFriendImages = async (grid) => { let cache = {}; try { cache = JSON.parse(localStorage.getItem(IMAGES_KEY) || '{}') || {}; } catch (_) {} let mm = {}; try { mm = readMetaCache(); } catch (_) {} for (const card of [...grid.querySelectorAll('.bkk42-card[data-login]')].slice(0, 30)) { if (!card.isConnected || card.querySelector('img')) continue; const login = card.dataset.login; let u2 = cache[login] || (mm[login] && mm[login].img) || '';       if (!u2 && readApiToken()) { try { const u = await apiV2('/users/' + encodeURIComponent(login)); const cand = (u && (u.image_url || (u.image && u.image.link))) || ''; if (cand) { u2 = String(cand); cache[login] = u2; localStorage.setItem(IMAGES_KEY, JSON.stringify(cache)); } } catch (_) {} } if (u2 && card.isConnected && !card.querySelector('img')) { const im = el('img'); im.src = u2; im.alt = ''; im.loading = 'lazy'; card.querySelector('.bkk42-avatar')?.replaceWith(im); } } };
  const renderFriends = async (root, force, onCount) => { onCount = onCount || (() => {}); const myToken = (root.dataset.loadToken = String((Number(root.dataset.loadToken) || 0) + 1)); const alive = () => root.isConnected && root.dataset.loadToken === myToken; root.className = 'bkk42-root'; root.replaceChildren(); const hh = makeHead('Friends \u00B7 all campuses', 'Checking live locations...'); const man = el('button', '', 'Manage list'); const ref = el('button', 'primary', 'Refresh'); hh.actions.append(man, ref); const ed = el('div', 'bkk42-editor'); const ta = el('textarea'); ta.placeholder = 'login1\nlogin2\nlogin3'; ta.value = readFriends().join('\n'); const row = el('div', 'bkk42-editor-row'); const sv = el('button', 'primary', 'Save list'); row.append(sv, el('span', 'bkk42-hint', 'Separate logins with spaces, commas, or new lines.')); ed.append(ta, row); const grid = el('div', 'bkk42-friends'); root.append(hh.head, ed, grid); man.onclick = () => { ed.classList.toggle('open'); if (ed.classList.contains('open')) ta.focus(); }; ref.onclick = () => renderFriends(root, true, onCount); sv.onclick = () => { writeFriends(parseLogins(ta.value)); renderFriends(root, false, onCount); }; let live = new Map(); try { ref.disabled = true; live = await getGlobalMap(force); if (!alive()) return; hh.note.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' \u00B7 all campuses'; } catch (e) { if (alive()) { console.warn('[bkk42] friends feed failed', String((e && e.message) || e)); hh.note.textContent = 'Live feed unavailable'; } } finally { ref.disabled = false; } if (!alive()) return; const fr = readFriends(); onCount(fr.filter((l) => live.has(l)).length, fr.length); if (!fr.length) grid.appendChild(el('div', 'bkk42-empty', 'No friends yet. Select Manage list to add 42 logins.')); for (const login of fr) { const loc = live.get(login); const card = el('div', 'bkk42-card' + (loc ? ' online' : '')); card.dataset.login = login; if (loc && loc.cdn_uri) { const im = el('img'); im.src = String(loc.cdn_uri); im.alt = ''; im.loading = 'lazy'; card.appendChild(im); } else card.appendChild(el('span', 'bkk42-avatar', '?')); const det = el('div'); const pf = el('a', '', login); pf.href = 'https://profile.intra.42.fr/users/' + encodeURIComponent(login); const suf = loc && Number(loc.campus_id) !== BANGKOK_CAMPUS_ID ? ' \u00B7 campus ' + loc.campus_id : ''; det.append(pf, el('div', 'bkk42-status', loc ? 'Online \u00B7 ' + String(loc.host).toUpperCase() + suf : 'Offline')); det.appendChild(el('div', 'bkk42-sub', agoLabel(loc && loc.begin_at, login))); det.appendChild(makeDotsButton(login)); card.appendChild(det); grid.appendChild(card); } setTimeout(() => { if (grid.isConnected) hydrateFriendImages(grid); }, 2000); enrichCards(root); };
  const fmtHours = (h) => { if (h == null || !isFinite(h)) return '\u2014h'; const m = Math.round(h * 60); const hh = Math.floor(m / 60); if (hh < 1) return m + 'm'; return hh + 'h ' + (m % 60) + 'm'; };
  const getLog30d = async (login) => {
    login = String(login || '').toLowerCase();
    try {
      const c = readMetaCache(); const now = Date.now();
      const hit = login && c[login];
      if (hit && hit.log30d != null && now - (hit.logT || 0) < 86400000) return { hours: hit.log30d, approx: !!hit.logApprox };
      let hours = null; let approx = true;
      try {
        if (readApiToken()) {
          const sv = await withTimeout(apiV2('/users/' + encodeURIComponent(login) + '/locations_stats'), 8000);
          const ph = parseV2Stats(sv);
          hours = ph != null ? ph : 0;
          approx = false;
        }
      } catch (e) { console.warn('[bkk42] locations_stats failed', login, String((e && e.message) || e)); }

      if (hours != null) {
        try { const cc = readMetaCache(); cc[login] = Object.assign({}, cc[login], { log30d: hours, logApprox: approx, logT: now, t: (cc[login] && cc[login].t) || now }); localStorage.setItem(META_KEY, JSON.stringify(cc)); } catch (_) {}
      }
      return { hours, approx };
    } catch (_) { return { hours: null, approx: true }; }
  };
  const LASTLOC_KEY = 'bkk42-last-loc';
  const getSessions = async (login) => {
    login = String(login || '').toLowerCase();
    if (!login) return [];
    let c = {};
    try { c = JSON.parse(localStorage.getItem(LASTLOC_KEY) || '{}') || {}; } catch (_) {}
    const hit = c[login];
    if (hit && Array.isArray(hit.sessions) && Date.now() - (hit.t || 0) < 86400000) return hit.sessions;
    const legacy = (hit && hit.host !== undefined && !Array.isArray(hit.sessions))
      ? [{ host: String(hit.host || '').toUpperCase(), begin: hit.begin || '', end: hit.end || '' }]
      : null;
    if (legacy && Date.now() - (hit.t || 0) < 86400000) {
      c[login] = { sessions: legacy, t: hit.t || Date.now() };
      try { localStorage.setItem(LASTLOC_KEY, JSON.stringify(c)); } catch (_) {}
      return legacy;
    }
    if (!readApiToken()) return legacy || (Array.isArray(hit && hit.sessions) ? hit.sessions : []);
    const mapLocs = (d) => (Array.isArray(d) ? d : [])
      .filter((L) => L && (L.begin_at || L.created_at))
      .sort((a, b) => Date.parse(b.begin_at || b.created_at) - Date.parse(a.begin_at || a.created_at))
      .slice(0, 5)
      .map((L) => ({ host: String(L.host || '').toUpperCase(), begin: L.begin_at || L.created_at || '', end: L.end_at || '' }));
    let uid = Number((readMetaCache()[login] || {}).id) || 0;
    if (!uid) { try { uid = Number((await getUserMeta(login)).id) || 0; } catch (_) {} }
    const tries = [];
    if (uid) {
      tries.push('/users/' + uid + '/locations?sort=-end_at&page[size]=25&page[number]=1');
    }
    tries.push('/users/' + encodeURIComponent(login) + '/locations?page[size]=5');
    const errs = [];
    for (const path of tries) {
      try {
        const arr = mapLocs(await withTimeout(apiV2(path), 10000));
        c[login] = { sessions: arr, t: Date.now() };
        try { localStorage.setItem(LASTLOC_KEY, JSON.stringify(c)); } catch (_) {}
        return arr;
      } catch (e) { errs.push(path.split('?')[0] + ': ' + String((e && e.message) || e)); }
    }
    if (legacy) return legacy;
    if (hit && Array.isArray(hit.sessions)) return hit.sessions;
    throw new Error(errs.join(' | '));
  };
  const getLastLocation = async (login) => {
    try {
      const ss = await getSessions(login);
      const b = ss[0];
      if (!b) return null;
      return { host: b.host, begin: b.begin, end: b.end, t: Date.now() };
    } catch (_) { return null; }
  };
  const SESSIONS_STYLE = 'bkk42-sessions-style';
  const ensureSessionsStyle = () => {
    if (document.getElementById(SESSIONS_STYLE)) return;
    const st = el('style'); st.id = SESSIONS_STYLE;
    st.textContent = '.bkk42-sess-back{position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;padding:20px;background:rgba(3,7,18,.72);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);color-scheme:dark}.bkk42-sess-box{display:flex;flex-direction:column;gap:12px;width:min(430px,94vw);max-height:82vh;overflow:auto;padding:18px;background:#101a2e;border:1px solid rgba(148,163,184,.16);border-radius:14px;color:#e8eef7;box-shadow:0 24px 64px rgba(0,0,0,.5);scrollbar-color:#334155 transparent}.bkk42-sess-box::-webkit-scrollbar{width:10px}.bkk42-sess-box::-webkit-scrollbar-thumb{background:#334155;border-radius:8px}.bkk42-sess-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.bkk42-sess-head a{color:#fff;font-size:16px;font-weight:800;text-decoration:none}.bkk42-sess-head a:hover{color:#5eead4}.bkk42-sess-x{border:1px solid transparent;border-radius:8px;background:#1f2b44;color:#cbd5e1;font-size:16px;font-weight:800;padding:4px 12px;cursor:pointer;transition:background .15s,color .15s}.bkk42-sess-x:hover{background:#2a3a5c;color:#fff}.bkk42-sess-list{display:grid;gap:8px}.bkk42-sess-row{display:grid;grid-template-columns:14px 1fr auto;gap:10px;align-items:center;padding:10px 12px;background:#182338;border:1px solid rgba(148,163,184,.10);border-radius:8px}.bkk42-sess-dot{width:9px;height:9px;border-radius:50%;background:#64748b}.bkk42-sess-row.live .bkk42-sess-dot{background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,.7)}.bkk42-sess-row b{font-size:14px;color:#fff}.bkk42-sess-row .bkk42-sub{margin-top:0;white-space:nowrap;color:#94a3b8}.bkk42-sess-box .bkk42-empty{color:#94a3b8;background:rgba(148,163,184,.05);border:1px dashed rgba(148,163,184,.16)}.bkk42-dots{float:right;border:1px solid rgba(148,163,184,.16);border-radius:6px;background:rgba(148,163,184,.10);color:#cbd5e1;font-size:11px;font-weight:800;line-height:1.5;padding:2px 9px;cursor:pointer;transition:background .15s}.bkk42-dots:hover{background:rgba(148,163,184,.18)}.bkk42-sess-back button:focus-visible,.bkk42-sess-back a:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}';
    document.head.appendChild(st);
  };
  let sessToken = 0;
  let sessEsc = null;
  const sessWhen = (s) => {
    const parts = [];
    if (s.begin) { const t = Date.parse(s.begin); if (!isNaN(t)) parts.push('started ' + fmtAgo(Date.now() - t) + ' ago'); }
    if (s.end) { const t = Date.parse(s.end); if (!isNaN(t)) parts.push('ended ' + fmtAgo(Date.now() - t) + ' ago'); }
    else parts.push('live now');
    if (s.begin && s.end) { const d = Date.parse(s.end) - Date.parse(s.begin); if (d > 0) parts.push('~' + fmtAgo(d)); }
    return parts.join(' · ');
  };
  const closeSessionsModal = () => { sessToken++; if (sessEsc) { document.removeEventListener('keydown', sessEsc); sessEsc = null; } document.querySelectorAll('.bkk42-sess-back').forEach((n) => n.remove()); };
  const openSessionsModal = async (login) => {
    login = String(login || '').toLowerCase();
    if (!login) return;
    ensureSessionsStyle();
    closeSessionsModal();
    const my = ++sessToken;
    const back = el('div', 'bkk42-sess-back');
    const box = el('div', 'bkk42-sess-box');
    const head = el('div', 'bkk42-sess-head');
    const title = el('a', '', login); title.href = 'https://profile.intra.42.fr/users/' + encodeURIComponent(login);
    const x = el('button', 'bkk42-sess-x', '×'); x.type = 'button';
    x.onclick = () => closeSessionsModal();
    head.append(title, x);
    const body = el('div', 'bkk42-sess-list', 'Loading sessions…');
    box.append(head, body); back.appendChild(box);
    back.addEventListener('click', (e) => { if (e.target === back) closeSessionsModal(); });
    document.body.appendChild(back);
    const esc = (e) => { if (e.key === 'Escape') closeSessionsModal(); };
    sessEsc = esc;
    document.addEventListener('keydown', esc);
    if (!readApiToken()) {
      if (my !== sessToken || !back.isConnected) return;
      body.replaceChildren(el('div', 'bkk42-empty', 'Login with 42 to see sessions'));
      return;
    }
    let sessions = null, sessErr = '';
    try { sessions = await getSessions(login); }
    catch (e) { sessErr = String((e && e.message) || e); }
    try { console.log('[bkk42-sessions]', login, sessErr || 'ok'); } catch (_) {}
    if (my !== sessToken || !back.isConnected) return;
    body.replaceChildren();
    if (sessions == null) {
      const err = el('div', 'bkk42-empty', apiStatus.ok === false ? 'Session history unavailable — login again' : "Couldn't load sessions" + (sessErr ? " \u2014 " + sessErr : ""));
      body.appendChild(err);
      if (apiStatus.ok !== false) {
        const retry = el('button', 'bkk42-dots', 'Try again'); retry.type = 'button';
        retry.onclick = () => openSessionsModal(login);
        body.appendChild(retry);
      }
      return;
    }
    if (!sessions.length) { body.appendChild(el('div', 'bkk42-empty', 'No recorded sessions')); return; }
    sessions.slice(0, 5).forEach((s) => {
      const row = el('div', 'bkk42-sess-row' + (!s.end ? ' live' : ''));
      row.append(el('span', 'bkk42-sess-dot'), el('b', '', s.host || '?'), el('span', 'bkk42-sub', sessWhen(s)));
      body.appendChild(row);
    });
  };
  const makeDotsButton = (login) => {
    const b = el('button', 'bkk42-dots', '⋯'); b.type = 'button'; b.title = 'Previous sessions';
    b.setAttribute('aria-label', 'Previous sessions for ' + login);
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openSessionsModal(login); };
    return b;
  };
  const renderTop = async (root, force, opts) => {
    opts = opts || {};
    const mode = opts.mode || root.dataset.sortMode || 'level';
    const presence = opts.presence || root.dataset.presence || 'all';
    const batch = opts.batch !== undefined ? String(opts.batch) : (root.dataset.batch || 'all');
    const limit = opts.limit !== undefined ? String(opts.limit) : (root.dataset.limit || 'all');
    const campus = opts.campus !== undefined ? String(opts.campus) : (root.dataset.campus || String(BANGKOK_CAMPUS_ID));
    const statuses = opts.status !== undefined ? String(opts.status) : (root.dataset.status || 'all');
    root.dataset.sortMode = mode; root.dataset.presence = presence; root.dataset.batch = batch; root.dataset.limit = limit; root.dataset.campus = campus; root.dataset.status = statuses;
    const myToken = (root.dataset.loadToken = String((Number(root.dataset.loadToken) || 0) + 1));
    const alive = () => root.isConnected && root.dataset.loadToken === myToken;
    root.className = 'bkk42-root'; root.replaceChildren();
    const hh = makeHead('Leaderboard', 'Resolving roster...');
    const ref = el('button', 'primary', 'Refresh'); ref.type = 'button';
    const sortBtn = el('button', '', mode === 'level' ? 'Sort: Level' : 'Sort: Active 30d'); sortBtn.type = 'button';
    const filtBtn = el('button', '', 'Filter: ' + presence); filtBtn.type = 'button';
    const batchSel = el('select', 'bkk42-sel');
    const limitSel = el('select', 'bkk42-sel');
    const campusSel = el('select', 'bkk42-sel');
    const stBox = el('details', 'bkk42-stfilter');
    stBox.open = root.dataset.statusesOpen === '1';
    const stSet = new Set(statuses === 'all' ? STATUS_LIST : (statuses === 'none' ? [] : statuses.split(',')));
    const stSum = el('summary', '', statuses === 'all' ? 'Status: all' : !stSet.size ? 'Status: none' : 'Status: ' + stSet.size + '/' + STATUS_LIST.length);
    const stPanel = el('div', 'bkk42-stpanel');
    for (const s of STATUS_LIST) {
      const lab = el('label', 'bkk42-stopt');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = stSet.has(s);
      lab.append(cb, document.createTextNode(s));
      cb.onchange = () => {
        if (cb.checked) stSet.add(s); else stSet.delete(s);
        const on = STATUS_LIST.filter((x) => stSet.has(x));
        const v = !on.length ? 'none' : (on.length === STATUS_LIST.length ? 'all' : on.join(','));
        renderTop(root, false, Object.assign(keep(), { status: v }));
      };
      stPanel.appendChild(lab);
    }
    stBox.append(stSum, stPanel);
    stBox.addEventListener('toggle', () => { root.dataset.statusesOpen = stBox.open ? '1' : '0'; });
    const loadBtn = el('button', '', 'Load details'); loadBtn.type = 'button'; loadBtn.hidden = true;
    const stopBtn = el('button', '', 'Stop'); stopBtn.type = 'button'; stopBtn.hidden = true;
    const keep = () => ({ mode, presence, batch: batchSel.value || 'all', limit: limitSel.value || 'all', campus: campusSel.value || String(BANGKOK_CAMPUS_ID), status: statuses });
    ref.onclick = () => renderTop(root, true, keep());
    sortBtn.onclick = () => renderTop(root, false, Object.assign(keep(), { mode: mode === 'level' ? 'active' : 'level' }));
    filtBtn.onclick = () => { const nx = presence === 'all' ? 'online' : presence === 'online' ? 'offline' : 'all'; renderTop(root, false, Object.assign(keep(), { presence: nx })); };
    batchSel.onchange = () => renderTop(root, false, keep());
    limitSel.onchange = () => renderTop(root, false, keep());
    campusSel.onchange = () => renderTop(root, false, keep());
    stopBtn.onclick = () => { root.dataset.loadToken = String((Number(root.dataset.loadToken) || 0) + 1); stopBtn.hidden = true; loadBtn.hidden = false; ref.disabled = false; };
    hh.actions.append(sortBtn, filtBtn, stBox, campusSel, batchSel, limitSel, loadBtn, stopBtn, ref);
    try { const vv = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || ''; if (vv) hh.actions.append(el('span', 'bkk42-hint', 'v' + vv)); } catch (_) {}
    root.appendChild(hh.head);
    const imp = el('div', 'bkk42-editor open');
    const ta = el('textarea'); ta.placeholder = 'Paste full promo logins to include offline (space/comma/newline)';
    ta.value = readRosterExtra().join('\n'); ta.style.minHeight = '48px';
    const irow = el('div', 'bkk42-editor-row');
    const isv = el('button', '', 'Save roster'); isv.type = 'button';
    isv.onclick = () => { try { localStorage.setItem(ROSTER_EXTRA_KEY, JSON.stringify(parseLogins(ta.value))); } catch (_) {} renderTop(root, false, keep()); };
    irow.append(isv, el('span', 'bkk42-hint', 'Stored locally. Merges with seen + friends.'));
    const trow = el('div', 'bkk42-editor-row');
    const loginBtn = el('button', 'primary', 'Login with 42'); loginBtn.type = 'button';
    const logoutBtn = el('button', '', 'Logout'); logoutBtn.type = 'button';
    const oauthStatusText = () => {
      if (readApiToken()) return apiStatus.ok === false ? 'API token rejected (401) — login again' : 'API linked — official v2 active';
      try {
        const o = JSON.parse(gmGet('bkk42-oauth-last', 'null'));
        if (o && !o.ok && Date.now() - (o.t || 0) < 3600000) {
          if (o.err === 'no-secret') return 'Login returned a code but no secret saved — save secret, Login again';
          return 'Last login failed' + (o.err ? ' (' + o.err + ')' : '') + ' — try again';
        }
      } catch (_) {}
      return 'Not logged in — login for the leaderboard';
    };
    const tst = el('span', 'bkk42-hint', oauthStatusText());
    loginBtn.onclick = () => {
      if (!readApiSecret()) { tst.textContent = 'Save your app secret below first (local only)'; try { sinput.focus(); } catch (_) {} return; }
      window.open('https://api.intra.42.fr/oauth/authorize?client_id=' + encodeURIComponent(API_CLIENT_ID) + '&redirect_uri=' + encodeURIComponent(API_REDIRECT_URI) + '&response_type=code&scope=public', '_blank');
    };
    logoutBtn.onclick = () => { gmDel(API_TOKEN_KEY); apiStatus.ok = null; renderTop(root, false, keep()); };
    trow.append(loginBtn, logoutBtn, tst);
    const srow = el('div', 'bkk42-editor-row');
    const sinput = el('input'); sinput.type = 'password';
    sinput.placeholder = readApiSecret() ? 'App secret saved — paste new to replace' : 'Paste 42 app secret (local only, needed for login/refresh)';
    sinput.className = 'bkk42-input';
    const ssv = el('button', '', 'Save secret'); ssv.type = 'button';
    ssv.onclick = () => { const v = sinput.value.trim(); if (!v) return; gmSet(API_SECRET_KEY, v); renderTop(root, false, keep()); };
    srow.append(sinput, ssv, el('span', 'bkk42-hint', 'Secret + token never leave this browser.'));
    imp.append(ta, irow, trow, srow); root.appendChild(imp);
    const list = el('div', 'bkk42-zones'); root.appendChild(list);
    const passPresence = (m2) => presence === 'all' || (presence === 'online' ? !!m2.loc : !m2.loc);
    const statusSet = statuses === 'all' ? null : new Set(statuses === 'none' ? [] : statuses.split(','));
    const passStatus = (m2) => !statusSet || statusSet.has((m2.meta && m2.meta.st) || '');
    let seenSnap = readSeen();
    const passBatch = (m2) => { const bn = (m2.meta && m2.meta.batchN) || 0; if (batch === 'all') return true; if (batch === 'new') return !bn; return String(bn) === batch; };
    const sortMetas = (arr) => { if (mode === 'active') arr.sort((a, b) => (((b.log && b.log.hours) == null) ? -1 : b.log.hours) - (((a.log && a.log.hours) == null) ? -1 : a.log.hours)); else arr.sort((a, b) => ((b.meta.level == null ? -1 : b.meta.level) - (a.meta.level == null ? -1 : a.meta.level))); };
    const rowSub = (row) => {
      if (row.loc) return 'Online \u00B7 ' + String(row.loc.host).toUpperCase() + ' \u00B7 ' + agoLabel(row.loc.begin_at, row.login);
      const ll = row.lastLoc;
      if (ll && (ll.end || ll.begin)) {
        const t = Date.parse(ll.end || ll.begin);
        const when = isNaN(t) ? '' : fmtAgo(Date.now() - t) + ' ago';
        return 'Last seen ' + (when || 'a while ago') + (ll.host ? ' \u00B7 ' + ll.host : '');
      }
      return 'Offline \u00B7 ' + agoLabel(null, row.login, seenSnap);
    };
    const drawList = (metas) => {
      seenSnap = readSeen();
      list.replaceChildren();
      const groups = new Map();
      for (const m2 of metas) { if (!passPresence(m2) || !passBatch(m2) || !passStatus(m2)) continue; const key = (m2.meta && m2.meta.batchN) || 0; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m2); }
      for (const arr of groups.values()) sortMetas(arr);
      for (const k of [...groups.keys()].sort((a, b) => b - a)) {
        const arr = groups.get(k);
        const label = k ? '#' + k : 'Unknown batch';
        const sec = el('section', 'bkk42-zone');
        const cap = 30;
        const h3 = el('h3', '', label + ' \u00B7 ' + arr.length + (arr.length > cap ? ' (top ' + cap + ')' : ''));
        sec.appendChild(h3);
        const lw = el('div', 'bkk42-zones');
        const showAll = el('button', '', 'Show all ' + arr.length); showAll.type = 'button';
        const draw = (lim) => {
          h3.textContent = label + ' \u00B7 ' + arr.length + (lim < arr.length ? ' (top ' + cap + ')' : '');
          lw.replaceChildren();
          arr.slice(0, lim).forEach((row, idx) => {
            const r = el('div', 'bkk42-rank');
            const a = el('a');
            a.href = 'https://profile.intra.42.fr/users/' + encodeURIComponent(row.login);
            const av = (row.meta && row.meta.img) || '';
            if (av) a.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0';
            if (av) { const im = el('img', 'bkk42-rav'); im.src = av; im.alt = ''; im.loading = 'lazy'; a.appendChild(im); }
            a.appendChild(document.createTextNode((idx + 1) + '. ' + row.login + (row.loc ? '' : ' · off')));
            const st = (row.meta && row.meta.st) || '';
            const wrap = el('span');
            if (mode === 'active') { const pre = (row.log && row.log.hours != null && row.log.approx) ? '~' : ''; const subPre = row.meta.level != null ? 'Lv ' + Number(row.meta.level).toFixed(2) + ' · ' : (st ? st + ' · ' : ''); wrap.append(el('span', 'bkk42-lv', pre + fmtHours(row.log ? row.log.hours : null) + ' · 30d'), el('div', 'bkk42-sub', subPre + rowSub(row))); }
            else {
              const lvText = row.meta.level != null ? 'Lv ' + Number(row.meta.level).toFixed(2) : (st || 'Lv •••');
              const lvCls = 'bkk42-lv' + (row.meta.level == null && st ? ' bkk42-stc-' + String(st).toLowerCase() : '');
              const stPre = st && row.meta.level != null && st !== 'Active' ? st + ' · ' : '';
              wrap.append(el('span', lvCls, lvText), el('div', 'bkk42-sub', stPre + rowSub(row)));
            }
            wrap.appendChild(makeDotsButton(row.login));
            r.append(el('b', '', '#' + (idx + 1)), a, wrap); lw.appendChild(r);
          });
          if (arr.length > lim) { lw.appendChild(showAll); showAll.onclick = () => draw(arr.length); }
        };
        draw(cap);
        sec.appendChild(lw); list.appendChild(sec);
      }
      if (!groups.size) list.appendChild(el('div', 'bkk42-empty', 'No one matches this filter yet.'));
    };
    const fillBatches = (metas) => {
      const bs = [...new Set(metas.filter((m) => (m.meta && m.meta.batchN)).map((m) => m.meta.batchN))].sort((a, b) => b - a);
      batchSel.replaceChildren();
      const mk = (v, t) => { const o = el('option', '', t); o.value = v; batchSel.appendChild(o); };
      mk('all', 'Batch: all');
      for (const b of bs) mk(String(b), 'Batch #' + b);
      mk('new', 'Batch: new');
      batchSel.value = (batch === 'all' || batch === 'new' || bs.some((b) => String(b) === batch)) ? batch : 'all';
    };
    const fillLimits = () => {
      limitSel.replaceChildren();
      const mk = (v, t) => { const o = el('option', '', t); o.value = v; limitSel.appendChild(o); };
      mk('all', 'Load: all'); mk('10', 'Load: 10'); mk('25', 'Load: 25'); mk('50', 'Load: 50'); mk('100', 'Load: 100'); mk('200', 'Load: 200');
      limitSel.value = ['all', '10', '25', '50', '100', '200'].includes(limit) ? limit : 'all';
    };
    const fillCampus = (known) => {
      campusSel.replaceChildren();
      const mk = (v, t) => { const o = el('option', '', t); o.value = v; campusSel.appendChild(o); };
      mk(String(BANGKOK_CAMPUS_ID), 'Bangkok (default)');
      mk('all', 'All campuses');
      for (const id of ACTIVE_CAMPUSES.filter((x) => x !== BANGKOK_CAMPUS_ID)) mk(String(id), (known && known[id]) || ('Campus ' + id));
      campusSel.value = campus;
    };
    let feedFailed = false;
    const stampDone = (n) => { hh.note.textContent = (feedFailed ? 'Live feed unavailable \u00B7 ' : 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' \u00B7 ') + n + ' known \u00B7 ' + scopeNote; };
    let locs = []; let scopeNote = 'Bangkok';
    if (!readApiToken()) {
      hh.note.textContent = 'Leaderboard needs login';
      list.appendChild(el('div', 'bkk42-empty', 'Login with 42 above to load the whole campus leaderboard. Without login you still have the Bangkok map + Friends tabs.'));
      return;
    }
    try {
      if (campus === 'all') { const gm = await getGlobalMap(force); locs = [...gm.values()]; scopeNote = 'all campuses'; }
      else if (Number(campus) === BANGKOK_CAMPUS_ID) { locs = await getBangkok(force); scopeNote = 'Bangkok'; }
      else { locs = await getCampusCluster(campus, force); scopeNote = STATIC_CAMPUS_NAMES[Number(campus)] || ('Campus ' + campus); }
    }
    catch (_) { feedFailed = true; hh.note.textContent = 'Live feed unavailable \u00B7 showing cached'; }
    if (!alive()) return;
    const online = new Map(locs.map((e) => [String(e.login).toLowerCase(), e]));
    const onlineKeys = [...online.keys()];
    const snapOf = () => readMetaCache();
    let metas;
    if (campus === 'all') {
      const snap = snapOf();
      metas = buildRoster(onlineKeys).map((l) => ({ login: l, meta: snap[l] || {}, loc: online.get(l) || null }));
    } else {
      const snap = snapOf();
      metas = onlineKeys.map((l) => ({ login: l, meta: snap[l] || {}, loc: online.get(l) || null }));
    }
    const isFresh = (m2) => !!(m2.meta && (m2.meta.batchN || m2.meta.level != null));
    fillBatches(metas); fillLimits(); fillCampus(readCampusNames()); drawList(metas);
    if (campus !== 'all' && readApiToken()) {
      hh.note.textContent = 'Loading students…';
      try {
        const extra = await withTimeout(loadCampusRoster(Number(campus), (n) => {
          if (!alive()) return;
          hh.note.textContent = 'Loading students… ' + n + ' found — browsing available';
        }, force), 120000);
        if (!alive()) return;
        if (extra && extra.length) {
          const snap = snapOf();
          for (const m of metas) { const sm = snap[m.login]; if (sm) m.meta = sm; }
          const have = new Set(metas.map((m) => m.login));
          let added = 0;
          for (const l of extra) {
            if (!have.has(l)) { have.add(l); metas.push({ login: l, meta: snap[l] || {}, loc: online.get(l) || null }); added++; }
          }
          if (added) scopeNote += ' · full roster (' + (lastRosterFresh ? lastSeedHits + ' levels' : 'cached') + ')';
          fillBatches(metas); drawList(metas);
        }
      } catch (e) { scopeNote += ' · roster failed (' + String((e && e.message) || e || 'error') + ')'; }
    }
    loadCampusNames().then((names) => { if (alive()) fillCampus(names); });
    const pending = () => metas.filter((m) => !isFresh(m) || (mode === 'active' && m.log === undefined));
    const loadMissing = async () => {
      const limN = limitSel.value === 'all' ? Infinity : Number(limitSel.value);
      const queue = pending().slice(0, limN);
      if (!queue.length || !alive()) return;
      loadBtn.hidden = true; stopBtn.hidden = false; ref.disabled = true;
      let done = 0;
      for (let i = 0; i < queue.length; i += 4) {
        if (!alive()) { ref.disabled = false; return; }
        await Promise.all(queue.slice(i, i + 4).map(async (m2) => {
          if (!alive()) return;
          m2.meta = await getUserMeta(m2.login);
          if (!m2.loc && m2.lastLoc === undefined) m2.lastLoc = await getLastLocation(m2.login);
          if (mode === 'active' && m2.log === undefined) m2.log = await getLog30d(m2.login);
        }));
        if (!alive()) { ref.disabled = false; return; }
        done = Math.min(queue.length, i + 4);
        fillBatches(metas); drawList(metas);
        hh.note.textContent = 'Loading details ' + done + '/' + queue.length + '...';
        if (i + 4 < queue.length) await new Promise((r) => setTimeout(r, 150));
      }
      ref.disabled = false;
      if (!alive()) return;
      stopBtn.hidden = true;
      const left = pending().length;
      if (left) { loadBtn.textContent = mode === 'active' ? 'Load activity (' + left + ' left)' : 'Load details (' + left + ' new)'; loadBtn.hidden = false; }
      stampDone(metas.length);
    };
    loadBtn.onclick = () => { loadMissing(); };
    if (mode === 'active') {
      const actLim = limitSel.value === 'all' ? Infinity : Number(limitSel.value);
      const actQ = metas.filter((m2) => m2.log === undefined).slice(0, actLim);
      if (actQ.length) {
        stopBtn.hidden = false; ref.disabled = true;
        for (let i = 0; i < actQ.length; i += 4) {
          if (!alive()) { ref.disabled = false; return; }
          await Promise.all(actQ.slice(i, i + 4).map(async (m2) => { if (m2.log === undefined) m2.log = await getLog30d(m2.login); }));
          if (!alive()) { ref.disabled = false; return; }
          drawList(metas);
          hh.note.textContent = 'Loading activity ' + Math.min(actQ.length, i + 4) + '/' + actQ.length + '...';
          if (i + 4 < actQ.length) await new Promise((r) => setTimeout(r, 150));
        }
        ref.disabled = false;
        if (!alive()) return;
        stopBtn.hidden = true;
      }
    }
    const missing = pending().length;
    if (missing) { loadBtn.textContent = mode === 'active' ? 'Load activity (' + missing + ' left)' : 'Load details (' + missing + ' new)'; loadBtn.hidden = false; }
    stampDone(metas.length);
    if (campus !== 'all' && apiStatus.ok === false) hh.note.textContent += ' · API token rejected — Login with 42 again';
  };
  const createModal = () => { const ex = document.getElementById(ID.modal); if (ex && ex.openView) return ex; if (ex) ex.remove(); const mo = el('div'); mo.id = ID.modal; mo.hidden = true; const sh = el('section', 'bkk42-shell'); const bar = el('header', 'bkk42-bar'); const nv = el('nav', 'bkk42-nav'); const cb = el('button', 'active', 'Bangkok TH'); cb.type = 'button'; const fb = el('button', '', 'Friends'); fb.type = 'button'; const tb = el('button', '', 'Leaderboard'); tb.type = 'button'; const cl = el('button', 'bkk42-close', '\u00D7'); cl.type = 'button'; cl.setAttribute('aria-label', 'Close'); nv.append(cb, fb, tb); bar.append(el('div', 'bkk42-brand', '42 Bangkok'), nv, cl); const body = el('main', 'bkk42-modal-body'); const cv = el('section', 'bkk42-view'); const fv2 = el('section', 'bkk42-view'); fv2.hidden = true; const tv = el('section', 'bkk42-view'); tv.hidden = true; body.append(cv, fv2, tv); sh.append(bar, body); mo.appendChild(sh); document.body.appendChild(mo); const show = (n) => { cb.classList.toggle('active', n === 'cluster'); fb.classList.toggle('active', n === 'friends'); tb.classList.toggle('active', n === 'top'); cv.hidden = n !== 'cluster'; fv2.hidden = n !== 'friends'; tv.hidden = n !== 'top'; if (n === 'friends') renderFriends(fv2, false, (o, t2) => { fb.textContent = 'Friends' + (t2 ? ' (' + o + '/' + t2 + ')' : ''); }); else if (n === 'top') renderTop(tv, false); else renderCluster(cv); }; cb.onclick = () => show('cluster'); fb.onclick = () => show('friends'); tb.onclick = () => show('top'); cl.onclick = () => { mo.hidden = true; }; mo.addEventListener('click', (e) => { if (e.target === mo) mo.hidden = true; });     mo.openView = (n) => { mo.hidden = false; show(n); }; 
    const rerenderTop = () => { try { if (!mo.hidden && !tv.hidden) renderTop(tv, false); } catch (_) {} };
    window.addEventListener('storage', (ev) => {
      if (!ev || (ev.key !== API_TOKEN_KEY && ev.key !== 'bkk42-oauth-last')) return;
      rerenderTop();
    });
    try { if (typeof GM_addValueChangeListener !== 'undefined') { GM_addValueChangeListener(API_TOKEN_KEY, rerenderTop); GM_addValueChangeListener('bkk42-oauth-last', rerenderTop); } } catch (_) {}
    return mo; };
  const mountMeta = () => { const done = document.getElementById(ID.clusterTab)?.isConnected && document.getElementById(ID.clusterPane)?.isConnected && document.getElementById(ID.friendsTab)?.isConnected && document.getElementById(ID.friendsPane)?.isConnected && document.getElementById(ID.topTab)?.isConnected && document.getElementById(ID.topPane)?.isConnected; if (done) return true; const nv = document.querySelector('#main-container'); const ct = document.querySelector('#cluster-map .tab-content'); if (!nv || !ct) return false; [ID.clusterTab, ID.friendsTab, ID.topTab, ID.clusterPane, ID.friendsPane, ID.topPane, 'bi-friends-style'].forEach((id) => document.getElementById(id)?.remove()); const add = (tid, pid, label, render) => { const it = el('li'); it.id = tid; it.setAttribute('role', 'presentation'); const lk = el('a', '', label); lk.href = '#' + pid; lk.dataset.toggle = 'tab'; lk.setAttribute('role', 'tab'); const pn = el('div', 'tab-pane'); pn.id = pid; pn.setAttribute('role', 'tabpanel'); lk.addEventListener('click', () => render(pn)); it.appendChild(lk); nv.insertBefore(it, document.getElementById('cluster-shadow-host') || null); ct.appendChild(pn); return { link: lk, pane: pn }; }; add(ID.clusterTab, ID.clusterPane, 'Bangkok TH', (p) => renderCluster(p)); const fr2 = add(ID.friendsTab, ID.friendsPane, 'Friends', (p) => renderFriends(p, false, (o, t2) => { fr2.link.textContent = 'Friends' + (t2 ? ' (' + o + '/' + t2 + ')' : ''); })); add(ID.topTab, ID.topPane, 'Leaderboard', (p) => renderTop(p)); return true; };
  const ensureFloatButton = () => { let f = document.getElementById(ID.float); if (!f) { f = el('button', '', 'TH'); f.id = ID.float; f.type = 'button'; f.title = 'Bangkok TH cluster'; f.setAttribute('aria-label', 'Open Bangkok TH cluster'); f.addEventListener('click', (e) => { e.preventDefault(); createModal().openView('cluster'); }); document.body.appendChild(f); } return true; };


  const mountProfile = () => { createModal(); const ex = document.getElementById(ID.shortcut); if (ex?.isConnected) { document.getElementById(ID.float)?.remove(); return true; } if (ex) ex.remove(); const cl2 = [...document.querySelectorAll('a')].find((l) => l.textContent.trim() === 'Clusters'); const wr = cl2?.parentElement; if (!wr?.parentElement) return ensureFloatButton(); const mo = createModal(); const tw = wr.cloneNode(true); tw.id = ID.shortcut; const tl = tw.querySelector('a'); tl.href = '#'; tl.removeAttribute('data-bi-bangkok-bound'); const lb = tl.querySelector('span'); if (lb) lb.textContent = 'TH'; else tl.textContent = 'TH'; tl.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); mo.openView('cluster'); }, true); wr.after(tw); document.getElementById(ID.float)?.remove(); return true; };
  let spaObserver = null; let lastUrl = location.href;
  const boot = () => { installStyle(); ensureSessionsStyle(); lastUrl = location.href;
    try {
      const q = new URLSearchParams(location.search);
      const code = q.get('code');
      if (code) {
        q.delete('code'); q.delete('state');
        history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash);
        if (readApiSecret()) exchangeCode(code).then((ok) => { gmSet('bkk42-oauth-last', JSON.stringify({ ok, t: Date.now(), err: ok ? '' : exchangeCodeLastErr })); });
        else gmSet('bkk42-oauth-last', JSON.stringify({ ok: false, t: Date.now(), err: 'no-secret' }));
      }
    } catch (_) {} (location.hostname === 'meta.intra.42.fr' ? mountMeta : mountProfile)(); if (spaObserver) spaObserver.disconnect(); spaObserver = new MutationObserver(() => { (location.hostname === 'meta.intra.42.fr' ? mountMeta : mountProfile)(); }); spaObserver.observe(document.body, { childList: true, subtree: true });   setTimeout(() => { if (location.hostname === 'meta.intra.42.fr') spaObserver?.disconnect(); }, 20000); };
  const recheckRoute = () => { if (location.href !== lastUrl) boot(); };
  const bkk42Diag = async () => {
    const out = { v: '', t: new Date().toISOString(), token: false, apiOk: null, cache: { meta: 0, seen: 0, friends: 0 }, probes: {} };
    try { out.v = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || ''; } catch (_) {}
    try { out.token = !!readApiToken(); out.apiOk = apiStatus.ok; } catch (_) {}
    try { out.cache.meta = Object.keys(readMetaCache()).length; out.cache.seen = Object.keys(readSeen()).length; out.cache.friends = readFriends().length; } catch (_) {}
    const probe = async (name, fn) => { try { await fn(); out.probes[name] = 'ok'; } catch (e) { out.probes[name] = 'FAIL ' + String((e && e.message) || e); } };
    await probe('bangkok-feed', () => getBangkok(true));
    if (out.token) {
      await probe('v2-campus', () => apiV2('/campus/33'));
      await probe('v2-roster-page', () => apiV2('/cursus/42cursus/cursus_users?filter[campus_id]=33&filter[future]=false&page[size]=' + ROSTER_PAGE_SIZE + '&page[number]=1'));
    }
    try { console.log('[bkk42-diag]', JSON.stringify(out)); } catch (_) {}
    return out;
  };
  try { window.__bkk42Diag = bkk42Diag; } catch (_) {}
  try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) unsafeWindow.__bkk42Diag = bkk42Diag; } catch (_) {}
  if (!window.__bkk42HistoryPatched) { window.__bkk42HistoryPatched = true; const op = history.pushState, or = history.replaceState; history.pushState = function () { const r = op.apply(this, arguments); setTimeout(recheckRoute, 400); return r; }; history.replaceState = function () { const r = or.apply(this, arguments); setTimeout(recheckRoute, 400); return r; }; window.addEventListener('popstate', () => setTimeout(boot, 400)); window.addEventListener('hashchange', () => setTimeout(boot, 400)); }
  document.addEventListener('keydown', (e) => { const mo = document.getElementById(ID.modal); if (e.key === 'Escape' && mo && !mo.hidden) mo.hidden = true; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  document.addEventListener('turbolinks:load', boot);
})();
