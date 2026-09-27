// ==UserScript==
// @bound-url    https://meta.intra.42.fr/clusters
// @name         42 Bangkok Cluster & Friends
// @namespace    sider.intra42.bangkok
// @description  Adds Bangkok TH cluster, cross-campus Friends presence, relative login time, Batch badges and per-batch level leaderboard.
// @match        https://meta.intra.42.fr/clusters*
// @match        https://profile.intra.42.fr/*
// @match        https://profile-v3.intra.42.fr/*
// @grant        GM_xmlhttpRequest
// @connect      meta.intra.42.fr
// @connect      profile.intra.42.fr
// @connect      intrapy.intra.42.fr
// @connect      pace-system.42.fr
// @updateURL    https://raw.githubusercontent.com/pik-vpx/42-Better-Of-Better-Intra-Userscript/main/Bangkok-Finder.user.js
// @downloadURL  https://raw.githubusercontent.com/pik-vpx/42-Better-Of-Better-Intra-Userscript/main/Bangkok-Finder.user.js
// @version      2.2.2
// @changelog    Leaderboard tab with batch selector, on-demand loading, stats timeout and instant cache render.
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
  const recordSeen = (entries) => { try { const s = readSeen(); const n = Date.now(); let c = false; for (const e of entries || []) { const l = String((e && e.login) || '').toLowerCase(); if (l && (!s[l] || n - s[l] > 60000)) { s[l] = n; c = true; } } if (c) localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (_) {} };
  const fmtAgo = (ms) => { if (!isFinite(ms) || ms < 0) ms = 0; const t = Math.floor(ms / 1000); const d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; if (d > 0) return d + 'd ' + h + 'h'; if (h > 0) return h + 'h ' + m + 'm'; if (m > 0) return m + 'm ' + s + 's'; return s + 's'; };
  const agoLabel = (beginAt, login) => { if (beginAt) { const t = Date.parse(beginAt); if (!isNaN(t)) return fmtAgo(Date.now() - t); } if (login) { const s = readSeen()[String(login).toLowerCase()]; if (s) { const a = Date.now() - s; if (a > 36e5) return '... ' + fmtAgo(a) + ' ago'; return 'seen ' + fmtAgo(a) + ' ago'; } } return '...'; };
  const batchFromDate = (iso) => { if (!iso) return null; const d = new Date(iso); if (isNaN(d)) return null; const y = d.getFullYear(); const n = y - 2017; if (!(n > 0 && n < 30)) return null; return { n, label: '#' + n }; };
  const getToken = () => { try { return sessionStorage.getItem('ft_intrapy_token') || ''; } catch (_) { return ''; } };
  const authedJSON = async (url) => { const tk = getToken(); const H = tk ? { Authorization: tk, Accept: 'application/json' } : { Accept: 'application/json' }; if (typeof GM_xmlhttpRequest === 'function' && /^https:\/\/(intrapy\.intra\.42\.fr|pace-system\.42\.fr)/.test(url)) return new Promise((res, rej) => GM_xmlhttpRequest({ method: 'GET', url, headers: H, responseType: 'json', timeout: 15000, onload: (r) => { if (r.status < 200 || r.status >= 300) return rej(new Error('HTTP ' + r.status)); try { res(r.response != null ? r.response : JSON.parse(r.responseText)); } catch (e) { rej(e); } }, onerror: () => rej(new Error('Network request failed')), ontimeout: () => rej(new Error('Network request timed out')) })); if (window.siderRuntime && window.siderRuntime.fetch) { const r = await window.siderRuntime.fetch(url, { headers: H }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); } const r = await fetch(url, { headers: H, credentials: 'include' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const readMetaCache = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (_) { return {}; } };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  const readRosterExtra = () => { try { const v = JSON.parse(localStorage.getItem(ROSTER_EXTRA_KEY) || '[]'); return Array.isArray(v) ? parseLogins(v.join(' ')) : []; } catch (_) { return []; } };
  const buildRoster = (onlineLogins) => { const set = new Set(); for (const l of (onlineLogins || [])) { const s = String(l || '').toLowerCase(); if (s) set.add(s); } for (const l of Object.keys(readSeen())) set.add(String(l).toLowerCase()); for (const l of readFriends()) set.add(String(l).toLowerCase()); for (const l of readRosterExtra()) set.add(String(l).toLowerCase()); return [...set].filter((s) => /^[a-z0-9_-]{2,30}$/.test(s)); };
  const getUserMeta = async (login) => { login = String(login || '').toLowerCase(); if (!login) return {}; const c = readMetaCache(); const now = Date.now(); if (c[login] && now - (c[login].t || 0) < 604800000) return c[login]; try { const u = await authedJSON('https://intrapy.intra.42.fr/api/v1/users/' + encodeURIComponent(login)); let level = (c[login] && c[login].level != null) ? c[login].level : null; try { const cu = await authedJSON('https://intrapy.intra.42.fr/api/v1/users/' + encodeURIComponent(login) + '/cursus'); const main = Array.isArray(cu) ? cu.find((e) => e.slug === '42cursus') : null; if (main) level = main.level + (main.progress ? main.progress / 100 : 0); } catch (_) {} let batch = (c[login] && c[login].batch) || '', batchN = (c[login] && c[login].batchN) || 0, begin = (c[login] && c[login].begin) || ''; if (u && u.id) { try { const p = await authedJSON('https://pace-system.42.fr/api/v1/users/' + u.id + '/profile'); if (p && p.cursus_begin_date) { begin = p.cursus_begin_date; const b = batchFromDate(begin); if (b) { batch = b.label; batchN = b.n; } } } catch (_) {} } const m = { id: (u && u.id) || 0, level, batch, batchN, begin, t: now }; c[login] = m; try { localStorage.setItem(META_KEY, JSON.stringify(c)); } catch (_) {} return m; } catch (_) { return c[login] || {}; } };
  const requestJSON = async (url) => { if (window.siderRuntime && window.siderRuntime.fetch) { const r = await window.siderRuntime.fetch(url, { credentials: 'include' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); } if (typeof GM_xmlhttpRequest === 'function') return new Promise((res, rej) => GM_xmlhttpRequest({ method: 'GET', url, responseType: 'json', withCredentials: true, timeout: 15000, onload: (r) => { if (r.status < 200 || r.status >= 300) return rej(new Error('HTTP ' + r.status)); try { res(r.response != null ? r.response : JSON.parse(r.responseText)); } catch (e) { rej(e); } }, onerror: () => rej(new Error('Network request failed')), ontimeout: () => rej(new Error('Network request timed out')) })); const r = await fetch(url, { credentials: 'include' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const getBangkok = async (force) => { if (!force && bangkokCache.data.length && Date.now() - bangkokCache.time < 60000) return bangkokCache.data; if (bangkokCache.promise) return bangkokCache.promise; bangkokCache.promise = requestJSON(CLUSTER_URL).then((data) => { bangkokCache.data = Array.isArray(data) ? data.filter((e) => e && !e.end_at && e.login && e.host) : []; bangkokCache.time = Date.now(); recordSeen(bangkokCache.data); return bangkokCache.data; }).finally(() => { bangkokCache.promise = null; }); return bangkokCache.promise; };
  const getGlobalMap = async (force) => { if (!force && globalCache.map.size && Date.now() - globalCache.time < 60000) return globalCache.map; if (globalCache.promise) return globalCache.promise; globalCache.promise = (async () => { const urls = [CLUSTER_URL].concat(ACTIVE_CAMPUSES.filter((id) => id !== BANGKOK_CAMPUS_ID).map((id) => CLUSTER_URL + '?campus_id=' + id)); const settled = await Promise.all(urls.map(async (u) => { try { const d = await requestJSON(u); return Array.isArray(d) ? d.filter((e) => e && !e.end_at && e.login && e.host) : []; } catch (_) { return []; } })); const map = new Map(); for (const e of settled.flat()) map.set(String(e.login).toLowerCase(), e); recordSeen([...map.values()]); globalCache.map = map; globalCache.time = Date.now(); return map; })().finally(() => { globalCache.promise = null; }); return globalCache.promise; };
  const installStyle = () => { document.getElementById(ID.style)?.remove(); const st = el('style'); st.id = ID.style; st.textContent = '.bkk42-root{--bg:#171a20;--panel:#20252e;--card:#292f3a;--seat:#353c49;--line:#3e4654;--muted:#9da7b6;--cyan:#00babc;--green:#55dca8;box-sizing:border-box;min-height:480px;padding:22px;background:var(--bg);color:#eef2f5;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.bkk42-root *{box-sizing:border-box}.bkk42-root button{border:0;border-radius:6px;padding:9px 14px;background:#343b48;color:#fff;font-weight:750;cursor:pointer}.bkk42-root button:hover{filter:brightness(1.1)}.bkk42-root button:disabled{cursor:wait;opacity:.6}.bkk42-root .primary,.bkk42-nav button.active{background:#009fa2}.bkk42-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.bkk42-root h2{margin:0;color:#fff;font-size:25px}.bkk42-note{margin-top:5px;color:var(--muted)}.bkk42-actions{display:flex;align-items:center;gap:10px}.bkk42-total{display:flex;align-items:baseline;gap:7px;padding:8px 14px;background:#213f37;border:1px solid #00d084;border-radius:8px;color:var(--green);font-size:12px;font-weight:850;text-transform:uppercase}.bkk42-total strong{font-size:21px;color:#70efbd}.bkk42-zones{display:grid;gap:22px}.bkk42-zone{padding:16px;background:var(--panel);border-radius:9px}.bkk42-zone h3{margin:0 0 14px;color:#fff}.bkk42-tables{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.bkk42-table{padding:12px;background:var(--card);border:1px solid var(--line);border-radius:10px}.bkk42-table-title{text-align:center;margin-bottom:10px;color:#00c8cb;font-weight:850}.bkk42-chairs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bkk42-seat{display:block;min-height:58px;padding:8px;overflow:hidden;background:var(--seat);border:2px solid transparent;border-radius:7px;color:#fff;text-decoration:none}.bkk42-seat:hover{border-color:var(--cyan);color:#fff}.bkk42-seat.friend{border-color:#00d084;background:#234137}.bkk42-seat.empty{background:#242933;color:#707987;pointer-events:none}.bkk42-seat img{float:left;width:36px;height:36px;margin-right:8px;border-radius:50%;object-fit:cover;background:#242933}.bkk42-host{display:block;font-size:11px;font-weight:850}.bkk42-login{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.bkk42-empty,.bkk42-error{padding:25px;text-align:center;background:#252a34;border-radius:7px;color:#9ba5b4}.bkk42-error{color:#ff9292}.bkk42-editor{display:none;margin-bottom:18px;padding:14px;background:var(--panel);border-radius:7px}.bkk42-editor.open{display:block}.bkk42-editor textarea{width:100%;min-height:105px;padding:11px;background:#2a303b;color:#fff;border:1px solid #4c5564;border-radius:5px;resize:vertical}.bkk42-editor-row{display:flex;align-items:center;gap:10px;margin-top:9px}.bkk42-hint{color:#929baa;font-size:12px}.bkk42-friends{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}.bkk42-card{display:flex;align-items:center;gap:12px;padding:13px;background:#252a34;border-left:4px solid #6b7280;border-radius:6px}.bkk42-card.online{border-left-color:#00d084}.bkk42-card img,.bkk42-avatar{flex:none;width:47px;height:47px;border-radius:50%;object-fit:cover;background:#3a404c}.bkk42-avatar{display:grid;place-items:center}.bkk42-card a{color:#fff;font-size:16px;font-weight:800;text-decoration:none}.bkk42-card a:hover{color:#00c8cb}.bkk42-status{margin-top:3px;color:#aab2c0;font-size:13px}.bkk42-card.online .bkk42-status{color:var(--green)}.bkk42-sub{margin-top:4px;font-size:11px;color:var(--muted)}.bkk42-seat .bkk42-sub{color:#c7d0dc}.bkk42-pill{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:20px;background:#343b48;font-size:11px;font-weight:800}.bkk42-rank{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:9px 12px;background:#252a34;border-radius:7px}.bkk42-lv{color:var(--green);font-weight:850}.bkk42-seat>.bkk42-pill{margin:4px 0 0}#' + ID.modal + '{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(2,6,12,.84)}#' + ID.modal + '[hidden]{display:none}#' + ID.modal + ' .bkk42-shell{display:flex;flex-direction:column;width:min(1180px,97vw);height:min(820px,94vh);overflow:hidden;background:#171a20;border:1px solid #3d4552;border-radius:14px}#' + ID.modal + ' .bkk42-bar{display:flex;align-items:center;gap:22px;padding:13px 18px;background:#1d2129;border-bottom:1px solid #353c47;color:#fff}.bkk42-brand{font-size:20px;font-weight:850;white-space:nowrap}.bkk42-nav{display:flex;gap:8px;flex-wrap:wrap}.bkk42-nav button{border:0;border-radius:6px;padding:9px 14px;background:#343b48;color:#fff;font-weight:750;cursor:pointer}.bkk42-close{margin-left:auto;border:0;background:transparent;color:#fff;font-size:29px;cursor:pointer}.bkk42-modal-body{flex:1;overflow:auto}.bkk42-view[hidden]{display:none}#bkk42-float{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:54px;height:54px;border:0;border-radius:50%;background:#009fa2;color:#fff;font-size:17px;font-weight:850;cursor:pointer}@media(max-width:700px){.bkk42-head{flex-direction:column}.bkk42-tables{grid-template-columns:1fr}}'; document.head.appendChild(st); };
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
            if (m.level != null && det && card.classList.contains('bkk42-card') && !det.querySelector('.bkk42-lv')) det.appendChild(el('div', 'bkk42-lv', 'Lv ' + Number(m.level).toFixed(2)));
          } catch (_) {}
        }));
        await new Promise((r) => setTimeout(r, 200));
      }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { runQueue(); }, { timeout: 5000 });
    else setTimeout(() => { runQueue(); }, 1500);
  };
  const renderCluster = async (root, force) => { root.className = 'bkk42-root'; root.replaceChildren(); const hh = makeHead('Bangkok TH', 'Loading live workstations...'); const total = el('div', 'bkk42-total'); const tn = el('strong', '', '--'); total.append(tn, document.createTextNode(' Online')); const ref = el('button', 'primary', 'Refresh'); ref.type = 'button'; ref.onclick = () => renderCluster(root, true); hh.actions.append(total, ref); root.appendChild(hh.head); try { ref.disabled = true; const locs = await getBangkok(force); const fr = new Set(readFriends()); tn.textContent = String(locs.length); hh.note.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); const zones = el('div', 'bkk42-zones'); for (let z = 1; z <= 3; z++) { const users = locs.filter((e) => String(e.host).toLowerCase().startsWith('z' + z + 't')); const zone = el('section', 'bkk42-zone'); zone.appendChild(el('h3', '', 'Zone ' + z + ' \u00B7 ' + users.length + ' online')); const tm = new Map(); for (const u of users) { const m2 = String(u.host).match(/^z\d+t(\d+)c(\d+)$/i); if (!m2) continue; const tb = Number(m2[1]); if (!tm.has(tb)) tm.set(tb, new Map()); tm.get(tb).set(Number(m2[2]), u); } if (!tm.size) zone.appendChild(el('div', 'bkk42-empty', 'No active tables')); else { const tables = el('div', 'bkk42-tables'); for (const tt of [...tm].sort((a, b) => a[0] - b[0])) { const table = el('div', 'bkk42-table'); table.appendChild(el('div', 'bkk42-table-title', 'Table T' + tt[0])); const grid = el('div', 'bkk42-chairs'); for (let ch = 1; ch <= 4; ch++) { const u = tt[1].get(ch); const login = u ? String(u.login).toLowerCase() : ''; const seat = el(u ? 'a' : 'div', 'bkk42-seat' + (u && fr.has(login) ? ' friend' : '') + (u ? '' : ' empty')); if (u) { seat.href = 'https://profile.intra.42.fr/users/' + encodeURIComponent(login); if (u.cdn_uri) { const im = el('img'); im.src = String(u.cdn_uri); im.alt = ''; im.loading = 'lazy'; seat.appendChild(im); } } seat.append(el('span', 'bkk42-host', 'Z' + z + ' \u00B7 T' + tt[0] + ' \u00B7 C' + ch), el('span', 'bkk42-login', u ? login + (fr.has(login) ? ' \u2605' : '') : 'Empty')); if (u) { seat.appendChild(el('span', 'bkk42-sub', agoLabel(u.begin_at, login))); seat.dataset.login = login; } grid.appendChild(seat); } table.appendChild(grid); tables.appendChild(table); } zone.appendChild(tables); } zones.appendChild(zone); } root.appendChild(zones); enrichCards(root); } catch (_) { hh.note.textContent = 'Live feed unavailable'; root.appendChild(el('div', 'bkk42-error', 'Could not load Bangkok cluster locations.')); } finally { ref.disabled = false; } };
  const hydrateFriendImages = async (grid) => { let cache = {}; try { cache = JSON.parse(localStorage.getItem(IMAGES_KEY) || '{}') || {}; } catch (_) {} for (const card of [...grid.querySelectorAll('.bkk42-card[data-login]')].slice(0, 30)) { if (!card.isConnected || card.querySelector('img')) continue; const login = card.dataset.login; let u2 = cache[login]; if (!u2) { try { const rs = await requestJSON('https://profile.intra.42.fr/searches/search.json?query=' + encodeURIComponent(login)); const ex = Array.isArray(rs) ? rs.find((x) => String(x.login).toLowerCase() === login) : null; u2 = (ex && ex.cdn_uri) || ''; if (u2) { cache[login] = u2; localStorage.setItem(IMAGES_KEY, JSON.stringify(cache)); } } catch (_) {} } if (u2 && card.isConnected && !card.querySelector('img')) { const im = el('img'); im.src = u2; im.alt = ''; im.loading = 'lazy'; card.querySelector('.bkk42-avatar')?.replaceWith(im); } } };
  const renderFriends = async (root, force, onCount) => { onCount = onCount || (() => {}); root.className = 'bkk42-root'; root.replaceChildren(); const hh = makeHead('Friends \u00B7 all campuses', 'Checking live locations...'); const man = el('button', '', 'Manage list'); const ref = el('button', 'primary', 'Refresh'); hh.actions.append(man, ref); const ed = el('div', 'bkk42-editor'); const ta = el('textarea'); ta.placeholder = 'login1\nlogin2\nlogin3'; ta.value = readFriends().join('\n'); const row = el('div', 'bkk42-editor-row'); const sv = el('button', 'primary', 'Save list'); row.append(sv, el('span', 'bkk42-hint', 'Separate logins with spaces, commas, or new lines.')); ed.append(ta, row); const grid = el('div', 'bkk42-friends'); root.append(hh.head, ed, grid); man.onclick = () => { ed.classList.toggle('open'); if (ed.classList.contains('open')) ta.focus(); }; ref.onclick = () => renderFriends(root, true, onCount); sv.onclick = () => { writeFriends(parseLogins(ta.value)); renderFriends(root, false, onCount); }; let live = new Map(); try { ref.disabled = true; live = await getGlobalMap(force); hh.note.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' \u00B7 all campuses'; } catch (_) { hh.note.textContent = 'Live feed unavailable'; } finally { ref.disabled = false; } const fr = readFriends(); onCount(fr.filter((l) => live.has(l)).length, fr.length); if (!fr.length) grid.appendChild(el('div', 'bkk42-empty', 'No friends yet. Select Manage list to add 42 logins.')); for (const login of fr) { const loc = live.get(login); const card = el('div', 'bkk42-card' + (loc ? ' online' : '')); card.dataset.login = login; if (loc && loc.cdn_uri) { const im = el('img'); im.src = String(loc.cdn_uri); im.alt = ''; im.loading = 'lazy'; card.appendChild(im); } else card.appendChild(el('span', 'bkk42-avatar', '?')); const det = el('div'); const pf = el('a', '', login); pf.href = 'https://profile.intra.42.fr/users/' + encodeURIComponent(login); const suf = loc && Number(loc.campus_id) !== BANGKOK_CAMPUS_ID ? ' \u00B7 campus ' + loc.campus_id : ''; det.append(pf, el('div', 'bkk42-status', loc ? 'Online \u00B7 ' + String(loc.host).toUpperCase() + suf : 'Offline')); det.appendChild(el('div', 'bkk42-sub', agoLabel(loc && loc.begin_at, login))); card.appendChild(det); grid.appendChild(card); } setTimeout(() => { if (grid.isConnected) hydrateFriendImages(grid); }, 2000); enrichCards(root); };
  const fmtHours = (h) => { if (h == null || !isFinite(h)) return '\u2014h'; const m = Math.round(h * 60); const hh = Math.floor(m / 60); if (hh < 1) return m + 'm'; return hh + 'h ' + (m % 60) + 'm'; };
  const getLog30d = async (login, loc) => {
    login = String(login || '').toLowerCase();
    try {
      const c = readMetaCache(); const now = Date.now();
      const hit = login && c[login];
      if (hit && hit.log30d != null && now - (hit.logT || 0) < 86400000) return { hours: hit.log30d, approx: !!hit.logApprox };
      let hours = null; let approx = true;
      try {
        const s = await withTimeout(authedJSON('https://intrapy.intra.42.fr/api/v1/users/' + encodeURIComponent(login) + '/locations_stats?range=30d'), 8000);
        const arr = s && (s.locations || s.stats || s.data || s);
        if (Array.isArray(arr)) hours = arr.reduce((a, x) => a + (Number(x.total_hours || x.hours || x.duration_hours || 0)), 0) || null;
        else if (s && s.total_hours != null) hours = Number(s.total_hours);
        if (hours != null) approx = false;
      } catch (_) {}
      if (hours == null) {
        const seen = readSeen()[login];
        const base = seen ? Math.max(0, (now - seen) / 36e5) : 0;
        const cur = loc && loc.begin_at ? Math.max(0, (now - Date.parse(loc.begin_at)) / 36e5) : 0;
        hours = Math.min(720, base > 0 ? Math.max(cur, Math.min(60, 720 - base)) : cur);
        if (!seen && !loc) hours = null;
      }
      try { const cc = readMetaCache(); cc[login] = Object.assign({}, cc[login], { log30d: hours, logApprox: approx, logT: now, t: (cc[login] && cc[login].t) || now }); localStorage.setItem(META_KEY, JSON.stringify(cc)); } catch (_) {}
      return { hours, approx };
    } catch (_) { return { hours: null, approx: true }; }
  };
  const renderTop = async (root, force, opts) => {
    opts = opts || {};
    const mode = opts.mode || root.dataset.sortMode || 'level';
    const presence = opts.presence || root.dataset.presence || 'all';
    const batch = opts.batch !== undefined ? String(opts.batch) : (root.dataset.batch || 'all');
    const limit = opts.limit !== undefined ? String(opts.limit) : (root.dataset.limit || 'all');
    root.dataset.sortMode = mode; root.dataset.presence = presence; root.dataset.batch = batch; root.dataset.limit = limit;
    const myToken = (root.dataset.loadToken = String((Number(root.dataset.loadToken) || 0) + 1));
    const alive = () => root.isConnected && root.dataset.loadToken === myToken;
    root.className = 'bkk42-root'; root.replaceChildren();
    const hh = makeHead('Leaderboard', 'Resolving roster...');
    const ref = el('button', 'primary', 'Refresh'); ref.type = 'button';
    const sortBtn = el('button', '', mode === 'level' ? 'Sort: Level' : 'Sort: Active 30d'); sortBtn.type = 'button';
    const filtBtn = el('button', '', 'Filter: ' + presence); filtBtn.type = 'button';
    const selCss = 'border:0;border-radius:6px;padding:9px 14px;background:#343b48;color:#fff;font-weight:750;cursor:pointer';
    const batchSel = el('select'); batchSel.style.cssText = selCss;
    const limitSel = el('select'); limitSel.style.cssText = selCss;
    const loadBtn = el('button', '', 'Load details'); loadBtn.type = 'button'; loadBtn.hidden = true;
    const stopBtn = el('button', '', 'Stop'); stopBtn.type = 'button'; stopBtn.hidden = true;
    const keep = () => ({ mode, presence, batch: batchSel.value || 'all', limit: limitSel.value || 'all' });
    ref.onclick = () => renderTop(root, true, keep());
    sortBtn.onclick = () => renderTop(root, false, Object.assign(keep(), { mode: mode === 'level' ? 'active' : 'level' }));
    filtBtn.onclick = () => { const nx = presence === 'all' ? 'online' : presence === 'online' ? 'offline' : 'all'; renderTop(root, false, Object.assign(keep(), { presence: nx })); };
    batchSel.onchange = () => renderTop(root, false, keep());
    limitSel.onchange = () => renderTop(root, false, keep());
    stopBtn.onclick = () => { root.dataset.loadToken = String((Number(root.dataset.loadToken) || 0) + 1); stopBtn.hidden = true; loadBtn.hidden = false; ref.disabled = false; };
    hh.actions.append(sortBtn, filtBtn, batchSel, limitSel, loadBtn, stopBtn, ref); root.appendChild(hh.head);
    const imp = el('div', 'bkk42-editor open');
    const ta = el('textarea'); ta.placeholder = 'Paste full promo logins to include offline (space/comma/newline)';
    ta.value = readRosterExtra().join('\n'); ta.style.minHeight = '48px';
    const irow = el('div', 'bkk42-editor-row');
    const isv = el('button', '', 'Save roster'); isv.type = 'button';
    isv.onclick = () => { try { localStorage.setItem(ROSTER_EXTRA_KEY, JSON.stringify(parseLogins(ta.value))); } catch (_) {} renderTop(root, false, keep()); };
    irow.append(isv, el('span', 'bkk42-hint', 'Stored locally. Merges with seen + friends.'));
    imp.append(ta, irow); root.appendChild(imp);
    const list = el('div', 'bkk42-zones'); root.appendChild(list);
    const passPresence = (m2) => presence === 'all' || (presence === 'online' ? !!m2.loc : !m2.loc);
    const passBatch = (m2) => { const bn = (m2.meta && m2.meta.batchN) || 0; if (batch === 'all') return true; if (batch === 'new') return !bn; return String(bn) === batch; };
    const sortMetas = (arr) => { if (mode === 'active') arr.sort((a, b) => (((b.log && b.log.hours) == null) ? -1 : b.log.hours) - (((a.log && a.log.hours) == null) ? -1 : a.log.hours)); else arr.sort((a, b) => ((b.meta.level == null ? -1 : b.meta.level) - (a.meta.level == null ? -1 : a.meta.level))); };
    const rowSub = (row) => row.loc ? 'Online \u00B7 ' + String(row.loc.host).toUpperCase() : 'Offline \u00B7 ' + agoLabel(null, row.login);
    const drawList = (metas) => {
      list.replaceChildren();
      const groups = new Map();
      for (const m2 of metas) { if (!passPresence(m2) || !passBatch(m2)) continue; const key = (m2.meta && m2.meta.batchN) || 0; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m2); }
      for (const arr of groups.values()) sortMetas(arr);
      for (const k of [...groups.keys()].sort((a, b) => b - a)) {
        const arr = groups.get(k);
        const label = k ? '#' + k : 'Unknown batch';
        const sec = el('section', 'bkk42-zone');
        const cap = 30;
        sec.appendChild(el('h3', '', label + ' \u00B7 ' + arr.length + (arr.length > cap ? ' (top ' + cap + ')' : '')));
        const lw = el('div', 'bkk42-zones');
        const showAll = el('button', '', 'Show all ' + arr.length); showAll.type = 'button';
        const draw = (lim) => {
          lw.replaceChildren();
          arr.slice(0, lim).forEach((row, idx) => {
            const r = el('div', 'bkk42-rank');
            const a = el('a', '', (idx + 1) + '. ' + row.login + (row.loc ? '' : ' \u00B7 off'));
            a.href = 'https://profile.intra.42.fr/users/' + encodeURIComponent(row.login); a.style.color = '#fff';
            const wrap = el('span');
            if (mode === 'active') { const pre = row.log && row.log.approx ? '~' : ''; wrap.append(el('span', 'bkk42-lv', pre + fmtHours(row.log ? row.log.hours : null) + ' \u00B730d'), el('div', 'bkk42-sub', (row.meta.level != null ? 'Lv ' + Number(row.meta.level).toFixed(2) + ' \u00B7 ' : '') + rowSub(row))); }
            else wrap.append(el('span', 'bkk42-lv', row.meta.level != null ? 'Lv ' + Number(row.meta.level).toFixed(2) : 'Lv \u2022\u2022\u2022'), el('div', 'bkk42-sub', rowSub(row)));
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
      mk('all', 'Load: all'); mk('50', 'Load: 50'); mk('100', 'Load: 100'); mk('200', 'Load: 200');
      limitSel.value = ['all', '50', '100', '200'].includes(limit) ? limit : 'all';
    };
    const stampDone = (n) => { hh.note.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' \u00B7 ' + n + ' known'; };
    let locs = [];
    try { locs = await getBangkok(force); }
    catch (_) { hh.note.textContent = 'Live feed unavailable \u00B7 showing cached'; }
    if (!alive()) return;
    const online = new Map(locs.map((e) => [String(e.login).toLowerCase(), e]));
    const roster = buildRoster([...online.keys()]);
    const snap = readMetaCache();
    const metas = roster.map((l) => ({ login: l, meta: snap[l] || {}, loc: online.get(l) || null }));
    const isFresh = (m2) => !!(m2.meta && (m2.meta.batchN || m2.meta.level != null));
    fillBatches(metas); fillLimits(); drawList(metas);
    const pending = () => metas.filter((m) => !isFresh(m));
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
          if (mode === 'active' && m2.log === undefined) m2.log = await getLog30d(m2.login, m2.loc);
        }));
        if (!alive()) { ref.disabled = false; return; }
        done = Math.min(queue.length, i + 4);
        fillBatches(metas); drawList(metas);
        hh.note.textContent = 'Loading details ' + done + '/' + queue.length + '...';
        await new Promise((r) => setTimeout(r, 150));
      }
      ref.disabled = false;
      if (!alive()) return;
      stopBtn.hidden = true;
      const left = pending().length;
      if (left) { loadBtn.textContent = 'Load details (' + left + ' new)'; loadBtn.hidden = false; }
      stampDone(metas.length);
    };
    loadBtn.onclick = () => { loadMissing(); };
    if (mode === 'active') {
      stopBtn.hidden = false; ref.disabled = true;
      for (let i = 0; i < metas.length; i += 4) {
        if (!alive()) { ref.disabled = false; return; }
        await Promise.all(metas.slice(i, i + 4).map(async (m2) => { if (m2.log === undefined) m2.log = await getLog30d(m2.login, m2.loc); }));
        if (!alive()) { ref.disabled = false; return; }
        drawList(metas);
        hh.note.textContent = 'Loading activity ' + Math.min(metas.length, i + 4) + '/' + metas.length + '...';
        await new Promise((r) => setTimeout(r, 150));
      }
      ref.disabled = false;
      if (!alive()) return;
      stopBtn.hidden = true;
    }
    const missing = pending().length;
    if (missing) { loadBtn.textContent = 'Load details (' + missing + ' new)'; loadBtn.hidden = false; }
    stampDone(metas.length);
  };
  const createModal = () => { const ex = document.getElementById(ID.modal); if (ex && ex.openView) return ex; if (ex) ex.remove(); const mo = el('div'); mo.id = ID.modal; mo.hidden = true; const sh = el('section', 'bkk42-shell'); const bar = el('header', 'bkk42-bar'); const nv = el('nav', 'bkk42-nav'); const cb = el('button', 'active', 'Bangkok TH'); cb.type = 'button'; const fb = el('button', '', 'Friends'); fb.type = 'button'; const tb = el('button', '', 'Leaderboard'); tb.type = 'button'; const cl = el('button', 'bkk42-close', '\u00D7'); cl.type = 'button'; cl.setAttribute('aria-label', 'Close'); nv.append(cb, fb, tb); bar.append(el('div', 'bkk42-brand', '42 Bangkok'), nv, cl); const body = el('main', 'bkk42-modal-body'); const cv = el('section', 'bkk42-view'); const fv2 = el('section', 'bkk42-view'); fv2.hidden = true; const tv = el('section', 'bkk42-view'); tv.hidden = true; body.append(cv, fv2, tv); sh.append(bar, body); mo.appendChild(sh); document.body.appendChild(mo); const show = (n) => { cb.classList.toggle('active', n === 'cluster'); fb.classList.toggle('active', n === 'friends'); tb.classList.toggle('active', n === 'top'); cv.hidden = n !== 'cluster'; fv2.hidden = n !== 'friends'; tv.hidden = n !== 'top'; if (n === 'friends') renderFriends(fv2, false, (o, t2) => { fb.textContent = 'Friends' + (t2 ? ' (' + o + ')' : ''); }); else if (n === 'top') renderTop(tv, false); else renderCluster(cv); }; cb.onclick = () => show('cluster'); fb.onclick = () => show('friends'); tb.onclick = () => show('top'); cl.onclick = () => { mo.hidden = true; }; mo.addEventListener('click', (e) => { if (e.target === mo) mo.hidden = true; }); mo.openView = (n) => { mo.hidden = false; show(n); }; return mo; };
  const mountMeta = () => { const done = document.getElementById(ID.clusterTab)?.isConnected && document.getElementById(ID.clusterPane)?.isConnected && document.getElementById(ID.friendsTab)?.isConnected && document.getElementById(ID.friendsPane)?.isConnected && document.getElementById(ID.topTab)?.isConnected && document.getElementById(ID.topPane)?.isConnected; if (done) return true; const nv = document.querySelector('#main-container'); const ct = document.querySelector('#cluster-map .tab-content'); if (!nv || !ct) return false; [ID.clusterTab, ID.friendsTab, ID.topTab, ID.clusterPane, ID.friendsPane, ID.topPane, 'bi-friends-style'].forEach((id) => document.getElementById(id)?.remove()); const add = (tid, pid, label, render) => { const it = el('li'); it.id = tid; it.setAttribute('role', 'presentation'); const lk = el('a', '', label); lk.href = '#' + pid; lk.dataset.toggle = 'tab'; lk.setAttribute('role', 'tab'); const pn = el('div', 'tab-pane'); pn.id = pid; pn.setAttribute('role', 'tabpanel'); lk.addEventListener('click', () => render(pn)); it.appendChild(lk); nv.insertBefore(it, document.getElementById('cluster-shadow-host') || null); ct.appendChild(pn); return { link: lk, pane: pn }; }; add(ID.clusterTab, ID.clusterPane, 'Bangkok TH', (p) => renderCluster(p)); const fr2 = add(ID.friendsTab, ID.friendsPane, 'Friends', (p) => renderFriends(p, false, (o, t2) => { fr2.link.textContent = 'Friends' + (t2 ? ' (' + o + ')' : ''); })); add(ID.topTab, ID.topPane, 'Leaderboard', (p) => renderTop(p)); return true; };
  const ensureFloatButton = () => { let f = document.getElementById(ID.float); if (!f) { f = el('button', '', 'TH'); f.id = ID.float; f.type = 'button'; f.title = 'Bangkok TH cluster'; f.setAttribute('aria-label', 'Open Bangkok TH cluster'); f.addEventListener('click', (e) => { e.preventDefault(); createModal().openView('cluster'); }); document.body.appendChild(f); } return true; };


  const mountProfile = () => { createModal(); const ex = document.getElementById(ID.shortcut); if (ex?.isConnected) { document.getElementById(ID.float)?.remove(); return true; } if (ex) ex.remove(); const cl2 = [...document.querySelectorAll('a')].find((l) => l.textContent.trim() === 'Clusters'); const wr = cl2?.parentElement; if (!wr?.parentElement) return ensureFloatButton(); const mo = createModal(); const tw = wr.cloneNode(true); tw.id = ID.shortcut; const tl = tw.querySelector('a'); tl.href = '#'; tl.removeAttribute('data-bi-bangkok-bound'); const lb = tl.querySelector('span'); if (lb) lb.textContent = 'TH'; else tl.textContent = 'TH'; tl.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); mo.openView('cluster'); }, true); wr.after(tw); document.getElementById(ID.float)?.remove(); return true; };
  let spaObserver = null; let lastUrl = location.href;
  const boot = () => { installStyle(); lastUrl = location.href; (location.hostname === 'meta.intra.42.fr' ? mountMeta : mountProfile)(); if (spaObserver) spaObserver.disconnect(); spaObserver = new MutationObserver(() => { (location.hostname === 'meta.intra.42.fr' ? mountMeta : mountProfile)(); }); spaObserver.observe(document.body, { childList: true, subtree: true });   setTimeout(() => { if (location.hostname === 'meta.intra.42.fr') spaObserver?.disconnect(); }, 20000); };
  const recheckRoute = () => { if (location.href !== lastUrl) boot(); };
  if (!window.__bkk42HistoryPatched) { window.__bkk42HistoryPatched = true; const op = history.pushState, or = history.replaceState; history.pushState = function () { const r = op.apply(this, arguments); setTimeout(recheckRoute, 400); return r; }; history.replaceState = function () { const r = or.apply(this, arguments); setTimeout(recheckRoute, 400); return r; }; window.addEventListener('popstate', () => setTimeout(boot, 400)); window.addEventListener('hashchange', () => setTimeout(boot, 400)); }
  document.addEventListener('keydown', (e) => { const mo = document.getElementById(ID.modal); if (e.key === 'Escape' && mo && !mo.hidden) mo.hidden = true; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  document.addEventListener('turbolinks:load', boot);
})();
