// ==UserScript==
// @bound-url    https://meta.intra.42.fr/clusters
// @name         42 Bangkok Cluster & Friends
// @namespace    sider.intra42.bangkok
// @description  Adds clean Bangkok TH cluster and cross-campus Friends presence to Meta Clusters and every Profile page.
// @match        https://meta.intra.42.fr/clusters*
// @match        https://profile.intra.42.fr/*
// @match        https://profile-v3.intra.42.fr/*
// @grant        GM_xmlhttpRequest
// @connect      meta.intra.42.fr
// @connect      profile.intra.42.fr
// @updateURL    https://raw.githubusercontent.com/yourname/my-userscript/main/my-script.user.js
// @downloadURL  https://raw.githubusercontent.com/yourname/my-userscript/main/my-script.user.js
// @changelog    Keeps the script mounted across profile-v3 SPA navigation with a floating TH fallback button.
// ==/UserScript==

(() => {
  'use strict';

  const ID = {
    style: 'bkk42-style', modal: 'bkk42-modal', shortcut: 'bkk42-shortcut', float: 'bkk42-float',
    clusterTab: 'bi-bangkok-tab', friendsTab: 'bi-friends-tab',
    clusterPane: 'bi-bangkok-cluster-pane', friendsPane: 'bi-friends-pane'
  };
  const FRIENDS_KEY = 'bi-bangkok-friends';
  const IMAGES_KEY = 'bi-bangkok-friend-images';
  const CLUSTER_URL = 'https://meta.intra.42.fr/clusters.json';
  const BANGKOK_CAMPUS_ID = 33;
  const ACTIVE_CAMPUSES = [9, 12, 16, 17, 21, 22, 23, 26, 29, 30, 31, 32, 33, 34, 35, 37, 39, 40, 41, 43, 44, 46, 47, 48, 49, 50, 51, 53, 54, 55];
  let bangkokCache = { time: 0, data: [], promise: null };
  let globalCache = { time: 0, map: new Map(), promise: null };

  const el = (tag, className = '', text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const parseLogins = (value) => [...new Set(String(value || '').split(/[\s,;]+/)
    .map((login) => login.trim().toLowerCase())
    .filter((login) => /^[a-z0-9_-]{2,30}$/.test(login)))];

  const readFriends = () => {
    try {
      const value = JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]');
      return Array.isArray(value) ? parseLogins(value.join(' ')) : [];
    } catch (_) { return []; }
  };

  const writeFriends = (logins) => localStorage.setItem(FRIENDS_KEY, JSON.stringify(logins));

  const requestJSON = async (url) => {
    if (window.siderRuntime?.fetch) {
      const response = await window.siderRuntime.fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => GM_xmlhttpRequest({
        method: 'GET', url, responseType: 'json', withCredentials: true, timeout: 15000,
        onload: (response) => {
          if (response.status < 200 || response.status >= 300) return reject(new Error(`HTTP ${response.status}`));
          try { resolve(response.response ?? JSON.parse(response.responseText)); }
          catch (error) { reject(error); }
        },
        onerror: () => reject(new Error('Network request failed')),
        ontimeout: () => reject(new Error('Network request timed out'))
      }));
    }
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };

  const getBangkok = async (force = false) => {
    if (!force && bangkokCache.data.length && Date.now() - bangkokCache.time < 60000) return bangkokCache.data;
    if (bangkokCache.promise) return bangkokCache.promise;
    bangkokCache.promise = requestJSON(CLUSTER_URL).then((data) => {
      bangkokCache.data = Array.isArray(data) ? data.filter((entry) => entry && !entry.end_at && entry.login && entry.host) : [];
      bangkokCache.time = Date.now();
      return bangkokCache.data;
    }).finally(() => { bangkokCache.promise = null; });
    return bangkokCache.promise;
  };

  const getGlobalMap = async (force = false) => {
    if (!force && globalCache.map.size && Date.now() - globalCache.time < 60000) return globalCache.map;
    if (globalCache.promise) return globalCache.promise;
    globalCache.promise = (async () => {
      const urls = [CLUSTER_URL, ...ACTIVE_CAMPUSES.filter((id) => id !== BANGKOK_CAMPUS_ID).map((id) => `${CLUSTER_URL}?campus_id=${id}`)];
      const settled = await Promise.all(urls.map(async (url) => {
        try {
          const data = await requestJSON(url);
          return Array.isArray(data) ? data.filter((entry) => entry && !entry.end_at && entry.login && entry.host) : [];
        } catch (_) { return []; }
      }));
      const map = new Map();
      for (const entry of settled.flat()) map.set(String(entry.login).toLowerCase(), entry);
      globalCache.map = map;
      globalCache.time = Date.now();
      return map;
    })().finally(() => { globalCache.promise = null; });
    return globalCache.promise;
  };

  const installStyle = () => {
    document.getElementById(ID.style)?.remove();
    const style = el('style');
    style.id = ID.style;
    style.textContent = `
      .bkk42-root{--bg:#171a20;--panel:#20252e;--card:#292f3a;--seat:#353c49;--line:#3e4654;--muted:#9da7b6;--cyan:#00babc;--green:#55dca8;box-sizing:border-box;min-height:480px;padding:22px;background:var(--bg);color:#eef2f5;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
      .bkk42-root *{box-sizing:border-box}.bkk42-root button{border:0;border-radius:6px;padding:9px 14px;background:#343b48;color:#fff;font-weight:750;cursor:pointer}.bkk42-root button:hover{filter:brightness(1.1)}.bkk42-root button:disabled{cursor:wait;opacity:.6}.bkk42-root .primary,.bkk42-nav button.active{background:#009fa2}
      .bkk42-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.bkk42-root h2{margin:0;color:#fff;font-size:25px}.bkk42-note{margin-top:5px;color:var(--muted)}.bkk42-actions{display:flex;align-items:center;gap:10px}.bkk42-total{display:flex;align-items:baseline;gap:7px;padding:8px 14px;background:#213f37;border:1px solid #00d084;border-radius:8px;color:var(--green);font-size:12px;font-weight:850;text-transform:uppercase}.bkk42-total strong{font-size:21px;color:#70efbd}
      .bkk42-zones{display:grid;gap:22px}.bkk42-zone{padding:16px;background:var(--panel);border-radius:9px}.bkk42-zone h3{margin:0 0 14px;color:#fff}.bkk42-tables{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.bkk42-table{padding:12px;background:var(--card);border:1px solid var(--line);border-radius:10px}.bkk42-table-title{text-align:center;margin-bottom:10px;color:#00c8cb;font-weight:850}.bkk42-chairs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bkk42-seat{display:block;min-height:58px;padding:8px;overflow:hidden;background:var(--seat);border:2px solid transparent;border-radius:7px;color:#fff;text-decoration:none}.bkk42-seat:hover{border-color:var(--cyan);color:#fff}.bkk42-seat.friend{border-color:#00d084;background:#234137}.bkk42-seat.empty{background:#242933;color:#707987;pointer-events:none}.bkk42-seat img{float:left;width:36px;height:36px;margin-right:8px;border-radius:50%;object-fit:cover;background:#242933}.bkk42-host{display:block;font-size:11px;font-weight:850}.bkk42-login{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .bkk42-empty,.bkk42-error{padding:25px;text-align:center;background:#252a34;border-radius:7px;color:#9ba5b4}.bkk42-error{color:#ff9292}.bkk42-editor{display:none;margin-bottom:18px;padding:14px;background:var(--panel);border-radius:7px}.bkk42-editor.open{display:block}.bkk42-editor textarea{width:100%;min-height:105px;padding:11px;background:#2a303b;color:#fff;border:1px solid #4c5564;border-radius:5px;resize:vertical}.bkk42-editor-row{display:flex;align-items:center;gap:10px;margin-top:9px}.bkk42-hint{color:#929baa;font-size:12px}.bkk42-friends{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}.bkk42-card{display:flex;align-items:center;gap:12px;padding:13px;background:#252a34;border-left:4px solid #6b7280;border-radius:6px}.bkk42-card.online{border-left-color:#00d084}.bkk42-card img,.bkk42-avatar{flex:none;width:47px;height:47px;border-radius:50%;object-fit:cover;background:#3a404c}.bkk42-avatar{display:grid;place-items:center}.bkk42-card a{color:#fff;font-size:16px;font-weight:800;text-decoration:none}.bkk42-card a:hover{color:#00c8cb}.bkk42-status{margin-top:3px;color:#aab2c0;font-size:13px}.bkk42-card.online .bkk42-status{color:var(--green)}
      #${ID.modal}{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(2,6,12,.84)}#${ID.modal}[hidden]{display:none}#${ID.modal} .bkk42-shell{display:flex;flex-direction:column;width:min(1180px,97vw);height:min(820px,94vh);overflow:hidden;background:#171a20;border:1px solid #3d4552;border-radius:14px;box-shadow:0 24px 90px #000}#${ID.modal} .bkk42-bar{display:flex;align-items:center;gap:22px;padding:13px 18px;background:#1d2129;border-bottom:1px solid #353c47;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.bkk42-brand{font-size:20px;font-weight:850;white-space:nowrap}.bkk42-nav{display:flex;gap:8px}.bkk42-nav button{border:0;border-radius:6px;padding:9px 14px;background:#343b48;color:#fff;font-weight:750;cursor:pointer}.bkk42-close{margin-left:auto;border:0;background:transparent;color:#fff;font-size:29px;cursor:pointer}.bkk42-modal-body{flex:1;overflow:auto}.bkk42-view[hidden]{display:none}
      #bkk42-float{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:54px;height:54px;border:0;border-radius:50%;background:#009fa2;color:#fff;font-size:17px;font-weight:850;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.5)}
      @media(max-width:700px){.bkk42-head{flex-direction:column}.bkk42-tables{grid-template-columns:1fr}#${ID.modal}{padding:0}#${ID.modal} .bkk42-shell{width:100vw;height:100vh;border-radius:0}.bkk42-brand{display:none}.bkk42-root{padding:14px}}
    `;
    document.head.appendChild(style);
  };

  const makeHead = (titleText, noteText) => {
    const head = el('div', 'bkk42-head');
    const title = el('div');
    title.append(el('h2', '', titleText), el('div', 'bkk42-note', noteText));
    const actions = el('div', 'bkk42-actions');
    head.append(title, actions);
    return { head, note: title.lastElementChild, actions };
  };

  const renderCluster = async (root, force = false) => {
    root.className = 'bkk42-root';
    root.replaceChildren();
    const { head, note, actions } = makeHead('Bangkok TH', 'Loading live workstations…');
    const total = el('div', 'bkk42-total');
    const totalNumber = el('strong', '', '—');
    total.append(totalNumber, document.createTextNode(' Online'));
    const refresh = el('button', 'primary', 'Refresh');
    refresh.type = 'button';
    refresh.onclick = () => renderCluster(root, true);
    actions.append(total, refresh);
    root.appendChild(head);
    try {
      refresh.disabled = true;
      const locations = await getBangkok(force);
      const friends = new Set(readFriends());
      totalNumber.textContent = String(locations.length);
      note.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const zones = el('div', 'bkk42-zones');
      for (let zoneNumber = 1; zoneNumber <= 3; zoneNumber++) {
        const users = locations.filter((entry) => String(entry.host).toLowerCase().startsWith(`z${zoneNumber}t`));
        const zone = el('section', 'bkk42-zone');
        zone.appendChild(el('h3', '', `Zone ${zoneNumber} · ${users.length} online`));
        const tableMap = new Map();
        for (const user of users) {
          const match = String(user.host).match(/^z\d+t(\d+)c(\d+)$/i);
          if (!match) continue;
          const table = Number(match[1]);
          if (!tableMap.has(table)) tableMap.set(table, new Map());
          tableMap.get(table).set(Number(match[2]), user);
        }
        if (!tableMap.size) zone.appendChild(el('div', 'bkk42-empty', 'No active tables'));
        else {
          const tables = el('div', 'bkk42-tables');
          for (const [tableNumber, chairs] of [...tableMap].sort((a, b) => a[0] - b[0])) {
            const table = el('div', 'bkk42-table');
            table.appendChild(el('div', 'bkk42-table-title', `Table T${tableNumber}`));
            const chairGrid = el('div', 'bkk42-chairs');
            for (let chair = 1; chair <= 4; chair++) {
              const user = chairs.get(chair);
              const login = user ? String(user.login).toLowerCase() : '';
              const seat = el(user ? 'a' : 'div', `bkk42-seat${user && friends.has(login) ? ' friend' : ''}${user ? '' : ' empty'}`);
              if (user) {
                seat.href = `https://profile.intra.42.fr/users/${encodeURIComponent(login)}`;
                if (user.cdn_uri) {
                  const image = el('img'); image.src = String(user.cdn_uri); image.alt = ''; image.loading = 'lazy'; seat.appendChild(image);
                }
              }
              seat.append(el('span', 'bkk42-host', `Z${zoneNumber} · T${tableNumber} · C${chair}`), el('span', 'bkk42-login', user ? `${login}${friends.has(login) ? ' ★' : ''}` : 'Empty'));
              chairGrid.appendChild(seat);
            }
            table.appendChild(chairGrid); tables.appendChild(table);
          }
          zone.appendChild(tables);
        }
        zones.appendChild(zone);
      }
      root.appendChild(zones);
    } catch (_) {
      note.textContent = 'Live feed unavailable';
      root.appendChild(el('div', 'bkk42-error', 'Could not load Bangkok cluster locations.'));
    } finally { refresh.disabled = false; }
  };

  const hydrateFriendImages = async (grid) => {
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(IMAGES_KEY) || '{}') || {}; } catch (_) {}
    for (const card of [...grid.querySelectorAll('.bkk42-card[data-login]')].slice(0, 30)) {
      if (!card.isConnected || card.querySelector('img')) continue;
      const login = card.dataset.login;
      let imageUrl = cache[login];
      if (!imageUrl) {
        try {
          const results = await requestJSON(`https://profile.intra.42.fr/searches/search.json?query=${encodeURIComponent(login)}`);
          const exact = Array.isArray(results) ? results.find((item) => String(item.login).toLowerCase() === login) : null;
          imageUrl = exact?.cdn_uri || '';
          if (imageUrl) { cache[login] = imageUrl; localStorage.setItem(IMAGES_KEY, JSON.stringify(cache)); }
        } catch (_) {}
      }
      if (imageUrl && card.isConnected && !card.querySelector('img')) {
        const image = el('img'); image.src = imageUrl; image.alt = ''; image.loading = 'lazy'; card.querySelector('.bkk42-avatar')?.replaceWith(image);
      }
    }
  };

  const renderFriends = async (root, force = false, onCount = () => {}) => {
    root.className = 'bkk42-root';
    root.replaceChildren();
    const { head, note, actions } = makeHead('Friends on campus', 'Checking live locations…');
    const manage = el('button', '', 'Manage list');
    const refresh = el('button', 'primary', 'Refresh');
    actions.append(manage, refresh);
    const editor = el('div', 'bkk42-editor');
    const textarea = el('textarea');
    textarea.placeholder = 'login1\nlogin2\nlogin3';
    textarea.value = readFriends().join('\n');
    const editorRow = el('div', 'bkk42-editor-row');
    const save = el('button', 'primary', 'Save list');
    editorRow.append(save, el('span', 'bkk42-hint', 'Separate logins with spaces, commas, or new lines.'));
    editor.append(textarea, editorRow);
    const grid = el('div', 'bkk42-friends');
    root.append(head, editor, grid);
    manage.onclick = () => { editor.classList.toggle('open'); if (editor.classList.contains('open')) textarea.focus(); };
    refresh.onclick = () => renderFriends(root, true, onCount);
    save.onclick = () => { writeFriends(parseLogins(textarea.value)); renderFriends(root, false, onCount); };
    let live = new Map();
    try {
      refresh.disabled = true;
      live = await getGlobalMap(force);
      note.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · all campuses`;
    } catch (_) { note.textContent = 'Live feed unavailable'; }
    finally { refresh.disabled = false; }
    const friends = readFriends();
    onCount(friends.filter((login) => live.has(login)).length, friends.length);
    if (!friends.length) grid.appendChild(el('div', 'bkk42-empty', 'No friends yet. Select “Manage list” to add 42 logins.'));
    for (const login of friends) {
      const location = live.get(login);
      const card = el('div', `bkk42-card${location ? ' online' : ''}`); card.dataset.login = login;
      if (location?.cdn_uri) { const image = el('img'); image.src = String(location.cdn_uri); image.alt = ''; image.loading = 'lazy'; card.appendChild(image); }
      else card.appendChild(el('span', 'bkk42-avatar', '?'));
      const details = el('div');
      const profile = el('a', '', login); profile.href = `https://profile.intra.42.fr/users/${encodeURIComponent(login)}`;
      const campusSuffix = location && Number(location.campus_id) !== BANGKOK_CAMPUS_ID ? ` · campus ${location.campus_id}` : '';
      details.append(profile, el('div', 'bkk42-status', location ? `Online · ${String(location.host).toUpperCase()}${campusSuffix}` : 'Offline'));
      card.appendChild(details); grid.appendChild(card);
    }
    hydrateFriendImages(grid);
  };

  const createModal = () => {
    const existingModal = document.getElementById(ID.modal);
    if (existingModal?.openView) return existingModal;
    existingModal?.remove();
    const modal = el('div'); modal.id = ID.modal; modal.hidden = true;
    const shell = el('section', 'bkk42-shell');
    const bar = el('header', 'bkk42-bar');
    const nav = el('nav', 'bkk42-nav');
    const clusterButton = el('button', 'active', 'Bangkok TH'); clusterButton.type = 'button';
    const friendsButton = el('button', '', 'Friends'); friendsButton.type = 'button';
    const close = el('button', 'bkk42-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
    nav.append(clusterButton, friendsButton); bar.append(el('div', 'bkk42-brand', '42 Bangkok'), nav, close);
    const body = el('main', 'bkk42-modal-body');
    const clusterView = el('section', 'bkk42-view');
    const friendsView = el('section', 'bkk42-view'); friendsView.hidden = true;
    body.append(clusterView, friendsView); shell.append(bar, body); modal.appendChild(shell); document.body.appendChild(modal);
    const show = (name) => {
      const friends = name === 'friends';
      clusterButton.classList.toggle('active', !friends); friendsButton.classList.toggle('active', friends);
      clusterView.hidden = friends; friendsView.hidden = !friends;
      if (friends) renderFriends(friendsView, false, (online, total) => { friendsButton.textContent = `Friends${total ? ` (${online})` : ''}`; });
      else renderCluster(clusterView);
    };
    clusterButton.onclick = () => show('cluster'); friendsButton.onclick = () => show('friends');
    close.onclick = () => { modal.hidden = true; };
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.hidden = true; });
    modal.openView = (name) => { modal.hidden = false; show(name); };
    return modal;
  };

  const mountMeta = () => {
    if (document.getElementById(ID.clusterTab)?.isConnected && document.getElementById(ID.clusterPane)?.isConnected && document.getElementById(ID.friendsTab)?.isConnected && document.getElementById(ID.friendsPane)?.isConnected) return true;
    const nav = document.querySelector('#main-container');
    const content = document.querySelector('#cluster-map .tab-content');
    if (!nav || !content) return false;
    [ID.clusterTab, ID.friendsTab, ID.clusterPane, ID.friendsPane, 'bi-friends-style'].forEach((id) => document.getElementById(id)?.remove());
    const add = (tabId, paneId, label, render) => {
      const item = el('li'); item.id = tabId; item.setAttribute('role', 'presentation');
      const link = el('a', '', label); link.href = `#${paneId}`; link.dataset.toggle = 'tab'; link.setAttribute('role', 'tab');
      const pane = el('div', 'tab-pane'); pane.id = paneId; pane.setAttribute('role', 'tabpanel');
      link.addEventListener('click', () => render(pane));
      item.appendChild(link); nav.insertBefore(item, document.getElementById('cluster-shadow-host') || null); content.appendChild(pane);
      return { link, pane };
    };
    add(ID.clusterTab, ID.clusterPane, 'Bangkok TH', (pane) => renderCluster(pane));
    const friend = add(ID.friendsTab, ID.friendsPane, 'Friends', (pane) => renderFriends(pane, false, (online, total) => { friend.link.textContent = `Friends${total ? ` (${online})` : ''}`; }));
    return true;
  };

  const ensureFloatButton = () => {
    let float = document.getElementById(ID.float);
    if (!float) {
      float = el('button', '', 'TH');
      float.id = ID.float;
      float.type = 'button';
      float.title = 'Bangkok TH cluster';
      float.setAttribute('aria-label', 'Open Bangkok TH cluster');
      float.addEventListener('click', (event) => { event.preventDefault(); createModal().openView('cluster'); });
      document.body.appendChild(float);
    }
    return true;
  };

  const mountProfile = () => {
    createModal();
    const existing = document.getElementById(ID.shortcut);
    if (existing?.isConnected) { document.getElementById(ID.float)?.remove(); return true; }
    existing?.remove();
    const clusterLink = [...document.querySelectorAll('a')].find((link) => link.textContent.trim() === 'Clusters');
    const wrapper = clusterLink?.parentElement;
    if (!wrapper?.parentElement) return ensureFloatButton();
    const modal = createModal();
    const thWrapper = wrapper.cloneNode(true); thWrapper.id = ID.shortcut;
    const thLink = thWrapper.querySelector('a'); thLink.href = '#'; thLink.removeAttribute('data-bi-bangkok-bound');
    const label = thLink.querySelector('span'); if (label) label.textContent = 'TH'; else thLink.textContent = 'TH';
    thLink.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); modal.openView('cluster'); }, true);
    wrapper.after(thWrapper);
    document.getElementById(ID.float)?.remove();
    return true;
  };

  let spaObserver = null;
  let lastUrl = location.href;
  const boot = () => {
    installStyle();
    lastUrl = location.href;
    (location.hostname === 'meta.intra.42.fr' ? mountMeta : mountProfile)();
    spaObserver?.disconnect();
    spaObserver = new MutationObserver(() => { (location.hostname === 'meta.intra.42.fr' ? mountMeta : mountProfile)(); });
    spaObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => spaObserver?.disconnect(), location.hostname === 'meta.intra.42.fr' ? 20000 : 60000);
  };
  const recheckRoute = () => { if (location.href !== lastUrl) boot(); };
  if (!window.__bkk42HistoryPatched) {
    window.__bkk42HistoryPatched = true;
    const origPush = history.pushState, origReplace = history.replaceState;
    history.pushState = function (...args) { const result = origPush.apply(this, args); setTimeout(recheckRoute, 400); return result; };
    history.replaceState = function (...args) { const result = origReplace.apply(this, args); setTimeout(recheckRoute, 400); return result; };
    window.addEventListener('popstate', () => setTimeout(boot, 400));
    window.addEventListener('hashchange', () => setTimeout(boot, 400));
  }

  document.addEventListener('keydown', (event) => {
    const modal = document.getElementById(ID.modal);
    if (event.key === 'Escape' && modal && !modal.hidden) modal.hidden = true;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  document.addEventListener('turbolinks:load', boot);
})();