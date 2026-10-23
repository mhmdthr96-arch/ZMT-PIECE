// ============================================================
// ZMT PIECE - Restaurant orders SERVICE (renderer runtime)
// ============================================================
// Responsibilities:
//  - config (enabled / role / name / tables / kitchen printer) in localStorage
//  - LAN presence heartbeat so senders/receivers discover each other
//  - orders living ONLY in localStorage (zmt_rest_orders) — never DB, never LAN
//  - message relay: rest-presence / rest-order / rest-status / rest-perms
//  - permissions matrix (-manager), persisted via DB.setMeta('restPerms')
//  - UI: incoming-order popup + toast + badge, floating send sheet, dialogs
//  - printing: kitchen ticket (thermal / chosen printer) + full sale invoice
(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  var RC = window.RestCore;
  if (!RC) return;

  var LS_ENABLED = 'zmt_rest_enabled';
  var LS_ROLE = 'zmt_rest_role';
  var LS_ID = 'zmt_rest_id';
  var LS_NAME = 'zmt_rest_name';
  var LS_TABLES = 'zmt_rest_tables';
  var LS_PRINTER = 'zmt_rest_kitchen_printer';
  var LS_ORDERS = 'zmt_rest_orders';
  var LS_PERMS = 'zmt_rest_permcache';

  var PRESENCE_INTERVAL = 15000;
  var PRESENCE_EXPIRY = 45000;

  var state = {
    enabled: false,
    role: RC.ROLE_NONE,
    myId: '',
    myName: '',
    tables: ['1', '2', '3', '4', '5'],
    kitchenPrinter: '',
    peers: {},           // id → { id, name, role, ts }
    orders: [],          // order objects (sender + receiver copies are separate)
    perms: {},           // id → { send, control, confirm } (manager overrides)
    permSeq: 0,
    popupQueue: [],
    popupShown: false,
    orderEsc: null,     // document-level Escape handler for the order popup
    initDone: false,
    heartbeatTimer: null
  };

  // ===== helpers ==========================================================

  function lsGet(k, def) {
    try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function lsGetJson(k, def) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function lsSetJson(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (e) {}
  }

  function getStoreName() {
    if (typeof window.getPrintInfo === 'function') {
      const pi = window.getPrintInfo();
      if (pi && pi.name) return pi.name;
    }
    return lsGet('zmt_store_name', '') || 'ZMT PIECE';
  }

  function t(key) { return typeof window.t === 'function' ? window.t(key) : ''; }

  function lanSend(payload) {
    if (!payload || !payload.type) return false;
    if (!window.electronAPI || !window.electronAPI.lanSend) return false;
    try { window.electronAPI.lanSend(payload); return true; } catch (e) { return false; }
  }

  function sortOrders(list) {
    return list.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function saveOrders() {
    const kept = state.orders.slice(0, 400);
    lsSetJson(LS_ORDERS, kept);
  }

  function pushOrder(order) {
    state.orders.push(order);
    if (state.orders.length > 400) state.orders = state.orders.slice(-400);
    saveOrders();
    emit('rest:orders', { orders: orderedVisible() });
    updateBadge();
  }

  function findOrder(id) {
    return state.orders.find(o => String(o.id) === String(id));
  }

  // ===== config ===========================================================

  function loadConfig() {
    state.enabled = lsGet(LS_ENABLED, '0') === '1';
    state.role = RC.ROLE_SEND === lsGet(LS_ROLE, '') ? RC.ROLE_SEND : (RC.ROLE_RECEIVE === lsGet(LS_ROLE, '') ? RC.ROLE_RECEIVE : RC.ROLE_NONE);
    state.myId = lsGet(LS_ID, '') || '';
    state.myName = lsGet(LS_NAME, '') || getStoreName();
    const tables = lsGetJson(LS_TABLES, null);
    if (Array.isArray(tables) && tables.length) state.tables = tables.map(String).filter(Boolean);
    state.kitchenPrinter = lsGet(LS_PRINTER, '') || '';
    state.orders = lsGetJson(LS_ORDERS, []);
    if (!Array.isArray(state.orders)) state.orders = [];
    state.perms = lsGetJson(LS_PERMS, {});
    loadPermsFromDB();
  }

  function ensureMyId() {
    if (!state.myId) {
      state.myId = RC.genId();
      lsSet(LS_ID, state.myId);
    }
  }

  function setConfig(cfg) {
    cfg = cfg || {};
    if (typeof cfg.enabled === 'boolean') {
      state.enabled = cfg.enabled;
      lsSet(LS_ENABLED, cfg.enabled ? '1' : '0');
      if (cfg.enabled) ensureMyId();
    }
    if (cfg.role === RC.ROLE_SEND || cfg.role === RC.ROLE_RECEIVE || cfg.role === RC.ROLE_NONE) {
      state.role = cfg.role;
      lsSet(LS_ROLE, cfg.role);
      if (state.role !== RC.ROLE_NONE) ensureMyId();
    }
    if (typeof cfg.name === 'string') {
      state.myName = cfg.name.trim() || state.myName;
      lsSet(LS_NAME, state.myName);
    }
    if (Array.isArray(cfg.tables)) {
      state.tables = cfg.tables.map(String).filter(Boolean);
      lsSetJson(LS_TABLES, state.tables);
    }
    if (typeof cfg.kitchenPrinter === 'string') {
      state.kitchenPrinter = cfg.kitchenPrinter;
      lsSet(LS_PRINTER, cfg.kitchenPrinter);
    }
    storageSyncBar();
    emit('rest:config', { cfg: getConfig() });
    syncPresenceNow();
  }

  function getConfig() {
    return {
      enabled: state.enabled,
      role: state.role,
      myId: state.myId,
      myName: state.myName,
      tables: state.tables.slice(),
      kitchenPrinter: state.kitchenPrinter
    };
  }

  function me() {
    return { id: state.myId, name: state.myName, role: state.role };
  }

  // ===== permissions ======================================================

  function isManagerUser() {
    try { return typeof Auth !== 'undefined' && Auth.isManager ? !!Auth.isManager() : false; } catch (e) { return false; }
  }

  function loadPermsFromDB() {
    if (typeof DB !== 'undefined' && DB.getMeta) {
      try {
        const stored = DB.getMeta('restPerms');
        if (stored && stored.allow && typeof stored.allow === 'object') {
          state.perms = Object.assign({}, state.perms, stored.allow);
          lsSetJson(LS_PERMS, state.perms);
        }
      } catch (e) {}
    }
  }

  function defaultPermsForRole(role) {
    return RC.defaultPerms(role === RC.ROLE_RECEIVE ? RC.ROLE_RECEIVE : RC.ROLE_SEND);
  }

  function permsFor(id) {
    const key = String(id || '');
    let role = state.role;
    if (key && key !== state.myId) {
      const p = state.peers[key];
      role = p && p.role ? p.role : RC.ROLE_SEND;
    }
    return RC.mergePerms(defaultPermsForRole(role), state.perms[key]);
  }

  function permsForMe() {
    return permsFor(state.myId);
  }

  function canOrderFromSales() {
    return state.enabled && state.role === RC.ROLE_SEND && RC.canSend(permsForMe());
  }

  // Self-order: any enabled device may address an order to itself, no matter
  // its role (send/receive) — the order is a local-only loopback.
  function canSelfOrder() {
    return state.enabled && !!state.myId;
  }

  function isSelfOrder(order) {
    if (!order) return false;
    const me = String(state.myId || '');
    return me !== '' &&
      String((order.from && order.from.id) || '') === me &&
      String(order.to || '') === me;
  }

  // Effective permissions for acting on a specific order: a self-addressed
  // order gets full receiver powers by default (manager overrides still win).
  function permsForOrder(order) {
    if (isSelfOrder(order)) {
      return RC.mergePerms({ send: true, control: true, confirm: true }, state.perms[state.myId]);
    }
    return permsFor(state.myId);
  }

  function savePermsById(id, patch) {
    const key = String(id || '');
    const before = state.perms[key];
    state.perms[key] = RC.mergePerms(before, patch);
    if (RC.permsEqual(before || {}, state.perms[key])) return false;
    storePerms();
    return true;
  }

  function storePerms() {
    lsSetJson(LS_PERMS, state.perms);
    const seq = Date.now();
    try {
      if (typeof DB !== 'undefined' && DB.setMeta) {
        DB.setMeta('restPerms', { updatedAt: seq, allow: state.perms });
      }
    } catch (e) {}
    emit('rest:perms', { perms: state.perms });
    lanSend({ type: 'rest-perms', from: me(), seq: seq, allow: state.perms });
    return seq;
  }

  function peersList(roleFilter) {
    const list = [];
    for (const id of Object.keys(state.peers)) {
      const p = state.peers[id];
      if (p && (!roleFilter || p.role === roleFilter)) list.push(p);
    }
    return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }

  function receiverPeers() { return peersList(RC.ROLE_RECEIVE); }

  function bumpPermSeq() {
    try {
      const stored = (typeof DB !== 'undefined' && DB.getMeta) ? DB.getMeta('restPerms') : null;
      if (stored && stored.updatedAt) state.permSeq = stored.updatedAt;
    } catch (e) {}
  }

  // ===== presence ===========================================================

  function syncPresenceNow() {
    if (!state.enabled || state.role === RC.ROLE_NONE || !state.myId) return;
    lanSend({ type: 'rest-presence', id: state.myId, name: state.myName, role: state.role, ts: Date.now() });
    prunePeers();
  }

  function startHeartbeat() {
    if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = setInterval(() => {
      prunePeers();
      syncPresenceNow();
      if (state.popupQueue.length && !state.popupShown) showNextPopup();
    }, PRESENCE_INTERVAL);
  }

  function stopHeartbeat() {
    if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
  }

  function prunePeers() {
    const now = Date.now();
    let changed = false;
    for (const id of Object.keys(state.peers)) {
      const p = state.peers[id];
      if (!p || now - (p.ts || 0) > PRESENCE_EXPIRY) { delete state.peers[id]; changed = true; }
    }
    if (changed) emit('rest:peers', { peers: peersList() });
  }

  function handlePresence(m) {
    if (!m || !m.id || String(m.id) === state.myId) return;
    const p = state.peers[m.id];
    const changed = !p || p.name !== m.name || p.role !== m.role;
    state.peers[m.id] = { id: m.id, name: m.name, role: m.role, ts: m.ts || Date.now() };
    if (changed || !p) emit('rest:peers', { peers: peersList() });
  }

  // ===== orders: LAN inbound ==============================================

  function handleOrder(msg) {
    // ignore echo of our own orders
    if (msg.from && String(msg.from.id) === state.myId) return;
    const ord = msg.order;
    if (!ord || !ord.id) return;
    // only a receiver address may store it; a sender keeps only its own copies
    if (state.role !== RC.ROLE_RECEIVE || String(ord.to || '') !== state.myId) return;
    if (findOrder(ord.id)) return;
    ord.incoming = true;
    pushOrder(ord);
    queuePopup(ord);
  }

  function handleStatus(msg) {
    if (!msg || !msg.orderId) return;
    if (msg.to && String(msg.to) !== state.myId) return;
    if (String(msg.from && msg.from.id) === state.myId) return;
    const ord = findOrder(msg.orderId);
    if (!ord) return;
    const st = msg.status;
    const valid = [RC.STATUS.NEW, RC.STATUS.INPROGRESS, RC.STATUS.DONE, RC.STATUS.CONFIRMED, RC.STATUS.CANCELLED];
    if (valid.indexOf(st) === -1) return;
    const updated = Object.assign({}, ord, {
      status: st,
      statusBy: String(msg.from && msg.from.id) || '',
      statusByDevice: String(msg.from && msg.from.name) || '',
      statusTs: msg.ts || Date.now(),
      updatedAt: msg.ts || Date.now()
    });
    if (st === RC.STATUS.CONFIRMED && msg.invoiceId) updated.invoiceId = msg.invoiceId;
    if (st === RC.STATUS.CONFIRMED && msg.invoiceNo) updated.invoiceNo = msg.invoiceNo;
    const idx = state.orders.findIndex(o => o.id === ord.id);
    if (idx !== -1) { state.orders[idx] = updated; saveOrders(); }
    emit('rest:orders', { orders: orderedVisible() });
    updateBadge();
    if (st === RC.STATUS.CANCELLED) toast(t('rest.statusCancelled'), 'danger');
  }

  function handlePerms(msg) {
    if (!msg || !msg.allow || typeof msg.allow !== 'object') return;
    if (String(msg.from && msg.from.id) === state.myId) return;
    const seq = msg.seq || 0;
    if (seq && state.permSeq && seq <= state.permSeq) return;
    state.perms = Object.assign({}, state.perms, msg.allow);
    state.permSeq = seq || state.permSeq;
    lsSetJson(LS_PERMS, state.perms);
    try {
      if (typeof DB !== 'undefined' && DB.setMeta) {
        DB.setMeta('restPerms', { updatedAt: seq || Date.now(), allow: state.perms });
      }
    } catch (e) {}
    emit('rest:perms', { perms: state.perms });
    emit('rest:config', { cfg: getConfig() });
  }

  function onLanMessage(msg) {
    if (!msg || !msg.type) return;
    if (!state.enabled) return;
    switch (msg.type) {
      case 'rest-presence': handlePresence(msg); break;
      case 'rest-order': handleOrder(msg); break;
      case 'rest-status': handleStatus(msg); break;
      case 'rest-perms': handlePerms(msg); break;
    }
  }

  // ===== orders: lifecycle ================================================

  function orderedVisible() {
    const vis = state.orders.filter(o => RC.isVisible(o, state.myId, state.role));
    return sortOrders(vis);
  }

  function incomingActive() {
    return state.orders.filter(o =>
      RC.isVisible(o, state.myId, RC.ROLE_RECEIVE) &&
      !RC.TERMINAL[o.status]
    );
  }

  function unreadCount() { return incomingActive().length; }

  function sendOrder(opts) {
    if (!state.enabled) return { ok: false, reason: 'ROLE' };
    const target = opts.toId || '';
    const isSelf = !!state.myId && target === state.myId;
    if (isSelf) {
      if (!canSelfOrder()) return { ok: false, reason: 'ROLE' };
    } else {
      if (state.role !== RC.ROLE_SEND) return { ok: false, reason: 'ROLE' };
      if (!RC.canSend(permsForMe())) return { ok: false, reason: 'PERM' };
      const recv = state.peers[target];
      if (!target || !recv || recv.role !== RC.ROLE_RECEIVE) return { ok: false, reason: 'NO_RECEIVER' };
    }
    if (!opts.table || !String(opts.table).trim()) return { ok: false, reason: 'NO_TABLE' };
    if (!opts.items || !opts.items.length) return { ok: false, reason: 'EMPTY' };

    const order = RC.createOrder({
      table: opts.table,
      notes: opts.notes,
      items: opts.items,
      fromId: state.myId,
      fromName: state.myName,
      toId: target
    });
    order.items = opts.items.map(RC.cloneItem);
    pushOrder(order);
    if (!isSelf) {
      lanSend({ type: 'rest-order', from: me(), to: target, order: order, ts: Date.now() });
    }
    toast(t('rest.sent'), 'ok');
    return { ok: true, order: order };
  }

  function updateStatus(orderId, action, extra) {
    const ord = findOrder(orderId);
    if (!ord) return { ok: false, reason: 'MISSING' };
    const actionRay = action;
    const allowed = RC.availableActions(ord, me(), permsForOrder(ord));
    if (allowed.indexOf(actionRay) === -1) return { ok: false, reason: 'DENIED' };
    const res = RC.applyStatus(ord, actionRay, me(), extra);
    if (!res.ok) return res;
    const idx = state.orders.findIndex(o => o.id === ord.id);
    if (idx !== -1) { state.orders[idx] = res.order; saveOrders(); }
    emit('rest:orders', { orders: orderedVisible() });
    updateBadge();
    // notify the other side so both devices show the same status
    // (a self-addressed order has no other side — skip the LAN notify)
    if (!isSelfOrder(ord)) {
      const toSide = String(ord.from && ord.from.id) === state.myId ? String(ord.to || '') : String((ord.from && ord.from.id) || '');
      lanSend({
        type: 'rest-status',
        from: me(),
        to: toSide,
        orderId: ord.id,
        status: res.order.status,
        invoiceId: res.order.invoiceId || undefined,
        invoiceNo: res.order.invoiceNo || undefined,
        ts: res.order.statusTs
      });
    }
    return { ok: true, order: res.order };
  }

  // ===== badge =============================================================

  function updateBadge() {
    const el = document.getElementById('localOrdersNavBadge');
    if (!el) return;
    const n = unreadCount();
    el.style.display = n > 0 ? '' : 'none';
    el.textContent = n > 40 ? '40+' : String(n);
  }

  // ===== toast =============================================================

  function ensureToastEl() {
    let el = document.getElementById('restToast');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'restToast';
    el.className = 'rest-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
  }

  function toast(text, cls) {
    const el = ensureToastEl();
    const icon = cls === 'ok' ? 'fa-check-circle'
      : cls === 'danger' ? 'fa-exclamation-circle'
      : 'fa-info-circle';
    el.innerHTML = `<i class="fas ${icon}"></i><span>${window.escHtml(text || '')}</span>`;
    el.className = 'rest-toast show ' + (cls || 'info');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'rest-toast'; }, 2600);
  }

  // ===== popup (incoming order) ===========================================

  function queuePopup(order) {
    state.popupQueue.push(order);
    emit('rest:popup', { queued: state.popupQueue.length });
    if (typeof window.ZmtSound === 'object' && window.ZmtSound.click) window.ZmtSound.click();
    if (!state.popupShown) showNextPopup();
  }

  function showNextPopup() {
    if (state.popupShown || orderVeilOpen()) return;
    // never stack a new order over the payment dialog; closeDialog() re-queues
    if (document.querySelector('#restConfirmVeil')) return;
    const ord = state.popupQueue.shift();
    if (!ord) return;
    state.popupShown = true;
    openOrderPopup(ord);
  }

  function dismissPopup() {
    state.popupShown = false;
    if (state.orderEsc) {
      document.removeEventListener('keydown', state.orderEsc, true);
      state.orderEsc = null;
    }
    // remove every order veil (guards against a stale duplicate stacking up);
    // the confirm-sale dialog uses a different id and must survive.
    document.querySelectorAll('#restOrderVeil').forEach(v => v.remove());
    if (state.popupQueue.length) setTimeout(showNextPopup, 250);
  }

  function orderVeilOpen() {
    return !!document.querySelector('#restOrderVeil');
  }

  function popupBtnHTML(actions) {
    const map = {
      inprogress: `<button type="button" class="rest-btn rest-btn-progress" data-rest-act="inprogress"><i class="fas fa-fire"></i> ${t('rest.inprogressBtn')}</button>`,
      done: `<button type="button" class="rest-btn rest-btn-done" data-rest-act="done"><i class="fas fa-check"></i> ${t('rest.doneBtn')}</button>`,
      confirm: `<button type="button" class="rest-btn rest-btn-confirm" data-rest-act="confirm"><i class="fas fa-cash-register"></i> ${t('rest.confirmBtn')}</button>`,
      cancel: `<button type="button" class="rest-btn rest-btn-cancel" data-rest-act="cancel"><i class="fas fa-ban"></i> ${t('rest.cancel')}</button>`
    };
    return actions.map(a => map[a]).filter(Boolean).join('');
  }

  function openOrderPopup(ord) {
    const veil = document.createElement('div');
    veil.id = 'restOrderVeil';
    veil.className = 'rest-popup-veil';
    const tot = RC.totals(ord);
    const actions = RC.availableActions(ord, me(), permsForOrder(ord));
    const rows = (ord.items || []).map(it =>
      `<div class="rest-popup-row"><span>${window.escHtml(it.name)} <small class="rest-popup-xqty">× ${RC.num(it.qty)}</small></span><b>${window.fmtMoney(it.price * it.qty)}</b></div>`
    ).join('');
    const fromName = (ord.from && ord.from.name) || '';
    veil.innerHTML = `
      <div class="rest-popup" role="dialog" aria-modal="true">
        <div class="rest-popup-head">
          <span class="rest-head-ico"><i class="fas fa-bell"></i></span>
          <span class="rest-head-txt">
            <b>${window.escHtml(t('rest.newOrder') || '')}</b>
            <span>${window.escHtml(fromName)}${fromName && ord.table ? ' · ' : ''}${window.escHtml(t('rest.tablePrefix') + ' ' + (ord.table || ''))}</span>
          </span>
          <button class="rest-icon-btn" type="button" data-rest-close aria-label="${window.escAttr(t('rest.close') || 'x')}"><i class="fas fa-times"></i></button>
        </div>
        <div class="rest-popup-body">
          <div class="rest-popup-meta">
            ${fromName ? `<span class="rest-chip"><i class="fas fa-user"></i> ${window.escHtml(fromName)}</span>` : ''}
            <span class="rest-chip"><i class="fas fa-chair"></i> ${window.escHtml(t('rest.tablePrefix') + ' ' + (ord.table || '—'))}</span>
            <span class="rest-chip"><i class="fas fa-clock"></i> ${window.escHtml(new Date(ord.createdAt || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</span>
            <span class="rest-chip"><i class="fas fa-layer-group"></i> ${window.escHtml(t('rest.itemsCount') || '')} ${(ord.items || []).length}</span>
          </div>
          <div class="rest-popup-items">${rows || `<div class="rest-popup-empty">—</div>`}</div>
          ${ord.notes ? `<div class="rest-popup-notes"><i class="fas fa-sticky-note"></i> ${window.escHtml(ord.notes)}</div>` : ''}
          <div class="rest-popup-total"><span>${window.escHtml(t('rest.total') || '')}</span><b>${window.fmtMoney(tot.total)}</b></div>
        </div>
        <div class="rest-popup-actions">${popupBtnHTML(actions) || `<div class="rest-popup-empty">${window.escHtml(t('rest.noActions') || '—')}</div>`}</div>
      </div>`;
    veil.addEventListener('click', (e) => {
      const actBtn = e.target.closest('[data-rest-act]');
      const x = e.target.closest('[data-rest-close]');
      if (x) { dismissPopup(); return; }
      if (e.target === veil) { dismissPopup(); return; }
      if (actBtn) {
        const action = actBtn.getAttribute('data-rest-act');
        if (action === 'confirm') {
          dismissPopup();
          openConfirmDialog(ord);
        } else {
          const res = updateStatus(ord.id, action, {});
          if (res.ok && action === 'inprogress') printKitchenTicket(ord.id);
          if (res.ok && (action === 'confirm' || action === 'cancel' || action === 'done')) toastForAction(action);
          dismissPopup();
        }
      }
    });
    // Escape works no matter where focus sits inside the page.
    if (state.orderEsc) document.removeEventListener('keydown', state.orderEsc, true);
    state.orderEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      dismissPopup();
    };
    document.addEventListener('keydown', state.orderEsc, true);
    document.body.appendChild(veil);
    const closeBtn = veil.querySelector('[data-rest-close]');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function toastForAction(action) {
    if (action === 'done') toast(t('rest.done'), 'ok');
    if (action === 'cancel') toast(t('rest.statusCancelled'), 'danger');
    if (action === 'inprogress') toast(t('rest.ticketPrinted'), 'ok');
  }

  // ===== confirm-sale dialog ==============================================

  function openConfirmDialog(ord) {
    // never stack two payment dialogs
    document.querySelectorAll('#restConfirmVeil').forEach(v => v.remove());
    const veil = document.createElement('div');
    veil.id = 'restConfirmVeil';
    veil.className = 'rest-popup-veil';
    const tot = RC.totals(ord);
    const customers = (typeof DB !== 'undefined' && DB.getCustomers) ? DB.getCustomers() : [];
    const custOpts = '<option value="">—</option>' + customers.map(c =>
      `<option value="${window.escAttr(c.id)}">${window.escHtml(c.name || c.id)}</option>`).join('');
    veil.innerHTML = `
      <div class="rest-popup" role="dialog" aria-modal="true" aria-label="${window.escAttr(t('rest.confirmTitle') || '')}">
        <div class="rest-popup-head">
          <span class="rest-head-ico"><i class="fas fa-cash-register"></i></span>
          <span class="rest-head-txt">
            <b>${window.escHtml(t('rest.confirmTitle') || '')}</b>
            <span>${window.escHtml(t('rest.confirmSub') || '')}</span>
          </span>
          <button class="rest-icon-btn" type="button" data-rest-do="x" aria-label="${window.escAttr(t('rest.close') || 'x')}"><i class="fas fa-times"></i></button>
        </div>
        <div class="rest-popup-body">
          <div class="rest-popup-total" style="margin:0 0 16px"><span>${window.escHtml(t('rest.total') || '')}</span><b>${window.fmtMoney(tot.total)}</b></div>
          <div class="form-group">
            <label for="restPayMethod">${window.escHtml(t('rest.payMethod') || '')}</label>
            <select id="restPayMethod" class="form-input">
              <option value="cash">${window.escHtml(t('rest.payCash') || '')}</option>
              <option value="ccp">${window.escHtml(t('rest.payCcp') || '')}</option>
              <option value="mixed">${window.escHtml(t('rest.payCash') || '')} + ${window.escHtml(t('rest.payCcp') || '')}</option>
            </select>
          </div>
          <div class="form-group">
            <label for="restPayCustomer">${window.escHtml(t('rest.customerLabel') || '')}</label>
            <select id="restPayCustomer" class="form-input">${custOpts}</select>
          </div>
          <div class="form-group" id="restCashRow" style="display:block">
            <label for="restPayCash">${window.escHtml(t('rest.payCash') || '')}</label>
            <input type="text" inputmode="decimal" id="restPayCash" class="form-input num-input" min="0" value="${tot.total}">
          </div>
          <div class="form-group" id="restCcpRow" style="display:none">
            <label for="restPayCcp">${window.escHtml(t('rest.payCcp') || '')}</label>
            <input type="text" inputmode="decimal" id="restPayCcp" class="form-input num-input" min="0" value="0">
          </div>
        </div>
        <div class="rest-dialog-foot">
          <button type="button" class="rest-btn rest-btn-ghost" data-rest-do="x"><i class="fas fa-times"></i> ${window.escHtml(t('rest.cancel') || '')}</button>
          <button type="button" class="rest-btn rest-btn-confirm" data-rest-do="confirm"><i class="fas fa-check"></i> ${window.escHtml(t('rest.payConfirm') || '')}</button>
        </div>
      </div>`;
    const methodSel = veil.querySelector('#restPayMethod');
    const cashRow = veil.querySelector('#restCashRow');
    const ccpRow = veil.querySelector('#restCcpRow');
    const cashInp = veil.querySelector('#restPayCash');
    const ccpInp = veil.querySelector('#restPayCcp');
    const closeDialog = () => {
      document.removeEventListener('keydown', escHandler, true);
      veil.remove();
      // an incoming order may have been held back while this dialog was open
      if (state.popupQueue.length && !state.popupShown && !orderVeilOpen()) {
        setTimeout(showNextPopup, 250);
      }
    };
    function escHandler(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      closeDialog();
    }
    document.addEventListener('keydown', escHandler, true);
    if (methodSel) {
      methodSel.addEventListener('change', () => {
        const m = methodSel.value;
        if (cashRow) cashRow.style.display = (m === 'cash' || m === 'mixed') ? 'block' : 'none';
        if (ccpRow) ccpRow.style.display = (m === 'ccp' || m === 'mixed') ? 'block' : 'none';
        if (m === 'cash' && cashInp) cashInp.value = tot.total;
        if (m === 'ccp' && ccpInp) ccpInp.value = tot.total;
      });
    }
    veil.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-rest-do]');
      if (!btn) { if (e.target === veil) closeDialog(); return; }
      if (btn.getAttribute('data-rest-do') === 'x') { closeDialog(); return; }
      const method = methodSel ? methodSel.value : 'cash';
      const pay = { method: method };
      if (method === 'mixed') {
        pay.cash = Number(cashInp && cashInp.value) || 0;
        pay.ccp = Number(ccpInp && ccpInp.value) || 0;
        pay.total = pay.cash + pay.ccp;
      } else {
        pay.total = Number((method === 'ccp' ? (ccpInp && ccpInp.value) : (cashInp && cashInp.value))) || 0;
      }
      const custEl = veil.querySelector('#restPayCustomer');
      const customerId = (custEl && custEl.value) || null;
      const res = await confirmOrderAsSale(ord, { pay: pay, customerId: customerId });
      closeDialog();
      if (!res.ok) {
        if (res.reason === 'STOCK') toast(t('rest.stockShort'), 'danger');
        else toast((res.error && res.error.message) || t('rest.failed'), 'danger');
        return;
      }
      toast(t('rest.saleOk'), 'ok');
    });
    document.body.appendChild(veil);
    const safe = veil.querySelector('[data-rest-do="confirm"]');
    if (safe) safe.focus({ preventScroll: true });
  }

  // Turn an order into a full DB sale + print the invoice.
  async function confirmOrderAsSale(ord, opts) {
    opts = opts || {};
    if (typeof RC === 'undefined' || typeof DB === 'undefined' || !window.SaleCore) {
      return { ok: false, reason: 'NO_DB' };
    }
    const createdBy = (ord.from && ord.from.name) || state.myName;
    const table = ord.table ? t('rest.tablePrefix') + ' ' + ord.table : '';
    const note = [table, t('rest.fromLabel') + ' ' + createdBy].filter(Boolean).join(' — ');

    const lines = [];
    const missing = [];
    for (const it of ord.items || []) {
      const alloc = window.SaleCore.allocateQty(DB, {
        name: it.name,
        barcode: it.barcode,
        qty: RC.num(it.qty),
        price: RC.num(it.price),
        lineDiscount: RC.num(it.lineDiscount)
      });
      if (!alloc.entries.length || alloc.shortQty > 0) {
        missing.push({ name: it.name, short: alloc.shortQty || alloc.entries.length ? 0 : alloc.availableTotal || 0 });
        continue;
      }
      lines.push({ name: it.name, barcode: it.barcode, entries: alloc.entries, lineDiscount: RC.num(it.lineDiscount) });
    }
    if (missing.length) return { ok: false, reason: 'STOCK', missing: missing };

    if (!lines.length) return { ok: false, reason: 'EMPTY' };

    // payment normalization
    const pay = opts.pay || {};
    const method = pay.method === 'ccp' || pay.method === 'mixed' ? pay.method : 'cash';
    const total = RC.num(totalsOfObj(ord));
    const paid = Math.max(0, RC.num(pay.total));
    const customerId = opts.customerId || null;
    const cust = customerId ? DB.getCustomer(customerId) : null;
    const discountPct = cust ? Math.max(0, RC.num(cust.discount)) : 0;
    const creditUsed = customerId ? Math.min(Math.max(0, RC.num(pay.creditUsed || 0)), Math.max(0, total - paid)) : 0;

    const res = window.SaleCore.executeSale(DB, {
      lines,
      customerId,
      customerDiscountPct: discountPct,
      extraDiscount: 0,
      creditUsed,
      pay: {
        method: method,
        cash: method === 'mixed' ? RC.num(pay.cash) : (method === 'cash' ? paid : 0),
        ccp: method === 'mixed' ? RC.num(pay.ccp) : (method === 'ccp' ? paid : 0),
        total: paid
      },
      seller: createdBy,
      sellerDevice: state.myName,
      note: note
    }, {
      fullPayment: t('sales.fullPaymentNote'),
      partialPayment: t('sales.partialPaymentNote'),
      custDiscType: t('sales.discountType'),
      extraDiscType: t('sales.discountManual'),
      lineDiscType: t('sales.lineDiscount')
    });
    if (!res.ok) return res;

    const st = updateStatus(ord.id, 'confirm', { invoiceId: res.invoiceId, invoiceNo: res.invoiceNumber });
    try { await printInvoiceHtml(buildInvoiceHtml(res.invoice || null, res, note, createdBy)); } catch (e) { console.warn('[Rest] invoice print:', e); }
    return { ok: true, invoiceId: res.invoiceId, invoiceNumber: res.invoiceNumber, totalAmount: res.totalAmount };
  }

  function totalsOfObj(ord) { return RC.totals(ord).total; }

  // ===== kitchen ticket ===================================================

  function buildKitchenHtml(ord) {
    const store = (typeof window.getPrintInfo === 'function') ? window.getPrintInfo() : { name: state.myName };
    const d = new Date();
    const stamp = d.toLocaleString('ar-DZ');
    const rows = (ord.items || []).map(it =>
      `<tr><td>${window.escHtml(it.name)}</td><td class="kq">x${(window.Unit && window.Unit.qtyUnit) ? window.Unit.qtyUnit(RC.num(it.qty), it) : RC.num(it.qty)}</td></tr>`
    ).join('');
    return `<html><head><meta charset="utf-8"><style>
      @page{ size:80mm auto; margin:2mm; }
      body{ font-family:'Courier New',monospace; font-size:11px; width:70mm; margin:0; }
      h2{ font-size:13px; margin:2px 0; text-align:center; }
      .h{ text-align:center; border-bottom:1px dashed #000; padding-bottom:4px; margin-bottom:6px; }
      .l{ margin:2px 0; }
      table{ width:100%; border-collapse:collapse; }
      td{ padding:2px 0; vertical-align:top; }
      .kq{ text-align:right; white-space:nowrap; }
      .f{ border-top:1px dashed #000; margin-top:6px; padding-top:4px; text-align:center; }
    </style></head><body>
      <div class="h"><h2>${window.escHtml(store.name || '')}</h2><div>${window.escHtml(t('rest.ticketTitle'))}</div></div>
      <div class="l">${t('rest.tablePrefix')} ${window.escHtml(ord.table)}</div>
      <div class="l">${t('rest.fromLabel')} ${window.escHtml((ord.from && ord.from.name) || '')}</div>
      <div class="l">${window.escHtml(stamp)}</div>
      ${ord.notes ? `<div class="l">${window.escHtml(ord.notes)}</div>` : ''}
      <table>${rows}</table>
      <div class="l"><b>${t('rest.total')} ${window.fmtMoney(RC.totals(ord).total)}</b></div>
      <div class="f">#${window.escHtml(ord.id)}</div>
    </body></html>`;
  }

  async function printKitchenTicket(orderOrId) {
    const ord = typeof orderOrId === 'object' ? orderOrId : findOrder(orderOrId);
    if (!ord) return { ok: false };
    const deviceName = state.kitchenPrinter || '';
    return await restPrint(buildKitchenHtml(ord), deviceName, 'kitchen');
  }

  // ===== invoice print =====================================================

  function buildInvoiceHtml(inv, res, note, seller) {
    const store = (typeof window.getPrintInfo === 'function') ? window.getPrintInfo() : { name: state.myName };
    const items = (res && res.items) || [];
    const rows = items.map(it =>
      `<tr><td>${window.escHtml(it.name)}</td><td class="r">${(window.Unit && window.Unit.qtyUnit) ? window.Unit.qtyUnit(RC.num(it.qty), it) : RC.num(it.qty)}</td><td class="r">${window.fmtMoney(it.price)}</td><td class="r">${window.fmtMoney(it.total)}</td></tr>`
    ).join('');
    const invNo = (inv && inv.invoiceNumber) || (res && res.invoiceNumber) || '';
    const d = new Date();
    return `<html><head><meta charset="utf-8"><style>
      @page{ size:80mm auto; margin:2mm; }
      body{ font-family:'Courier New',monospace; font-size:11px; width:70mm; margin:0; }
      h2{ font-size:13px; margin:2px 0; text-align:center; }
      .h{ text-align:center; border-bottom:1px dashed #000; padding-bottom:4px; margin-bottom:6px; }
      .l{ margin:2px 0; }
      table{ width:100%; border-collapse:collapse; }
      th,td{ padding:2px 0; vertical-align:top; text-align:left; }
      td.r,th.r{ text-align:right; white-space:nowrap; }
      .sum{ border-top:1px dashed #000; margin-top:6px; padding-top:4px; }
      .f{ margin-top:6px; padding-top:4px; border-top:1px dashed #000; text-align:center; }
    </style></head><body>
      <div class="h"><h2>${window.escHtml(store.name || '')}</h2>
        <div>${window.escHtml(store.address || '')} ${window.escHtml(store.phone || '')}</div>
        <div>${t('rest.invoiceTitle')} ${window.escHtml(invNo)}</div></div>
      <div class="l">${window.escHtml(d.toLocaleString('ar-DZ'))}</div>
      ${note ? `<div class="l">${window.escHtml(note)}</div>` : ''}
      <div class="l">${t('rest.sellerLabel')} ${window.escHtml(seller || '')}</div>
      <table>
        <thead><tr><th>${t('rest.itemCol')}</th><th class="r">Q</th><th class="r">P</th><th class="r">T</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="sum">
        <div class="l"><b>${t('rest.total')} ${window.fmtMoney((res && res.totalAmount) || 0)}</b></div>
        <div class="l">${t('rest.paidLabel')} ${window.fmtMoney((res && res.paidAmount) || 0)}</div>
        <div class="l">${t('rest.remainLabel')} ${window.fmtMoney((res && res.remaining) || 0)}</div>
      </div>
      <div class="f">${t('rest.thanks')}</div>
    </body></html>`;
  }

  async function printInvoiceHtml(html) {
    return await restPrint(html, '', 'invoice');
  }

  async function restPrint(html, deviceName, kind) {
    if (!window.electronAPI || !window.electronAPI.restPrint) {
      // browser fallback: try window.print on a popup
      try {
        const w = window.open('', '_blank', 'width=300,height=600');
        if (w) { w.document.write(html); setTimeout(() => { try { w.print(); } catch (e) {} }, 300); }
      } catch (e) {}
      return { ok: false, fallback: true };
    }
    try {
      const res = await window.electronAPI.restPrint({ html, deviceName, kind });
      if (!res || res.ok === false) throw new Error((res && res.error) || 'print failed');
      return { ok: true };
    } catch (e) {
      console.warn('[Rest] print failed', kind, e);
      return { ok: false, error: (e && e.message) || 'print failed' };
    }
  }

  async function listPrinters() {
    if (!window.electronAPI || !window.electronAPI.restListPrinters) return [];
    try { return await window.electronAPI.restListPrinters(); } catch (e) { return []; }
  }

  // ===== floating send sheet (sales page) ===================================

  var sendDraft = { items: [], toId: '', table: '', notes: '' };

  function panelEl() {
    return document.getElementById('restSendDrawer');
  }

  function fabEl() {
    return document.getElementById('restCartFab');
  }

  function scrimEl() {
    return document.getElementById('restDrawerScrim');
  }

  // Builds (once) the drawer, its scrim and the floating reopen button.
  function ensurePanel() {
    let el = panelEl();
    if (el) return el;

    const scrim = document.createElement('div');
    scrim.id = 'restDrawerScrim';
    scrim.className = 'rest-drawer-scrim';
    scrim.addEventListener('click', () => hideSendPanel());
    document.body.appendChild(scrim);

    el = document.createElement('aside');
    el.id = 'restSendDrawer';
    el.className = 'rest-drawer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-label', t('rest.cartTitle') || 'cart');
    document.body.appendChild(el);

    const fab = document.createElement('button');
    fab.id = 'restCartFab';
    fab.type = 'button';
    fab.className = 'rest-fab';
    fab.addEventListener('click', () => showSendPanel());
    document.body.appendChild(fab);

    return el;
  }

  function updateFab() {
    const fab = fabEl();
    if (!fab) return;
    const n = sendDraft.items.reduce((s, it) => s + (RC.num(it.qty) || 0), 0);
    const onSales = (window._currentPageId || '') === 'sales';
    const show = onSales && !panelIsOpen() && (n > 0 || canShowPanel());
    fab.classList.toggle('show', !!show);
    fab.innerHTML = (n > 0
      ? `<i class="fas fa-utensils"></i> ${window.escHtml(t('rest.cartTitle') || '')} <span class="rest-fab-badge">${n}</span>`
      : `<i class="fas fa-utensils"></i> ${window.escHtml(t('rest.cartTitle') || '')}`);
  }

  function panelIsOpen() {
    const el = panelEl();
    return !!(el && el.classList.contains('open'));
  }

  function restOrderGroup(idx) {
    if (!canOrderFromSales()) return;
    let g = null;
    try {
      if (typeof getSalesGroups === 'function') g = window.getSalesGroups()[idx];
      else if (window._salesGroupList) g = window._salesGroupList[idx];
    } catch (e) {}
    if (!g) return;
    const rep = (typeof groupViableRecords === 'function') ? groupViableRecords(g)[0] : (g.records || [])[0];
    const price = (typeof getGroupActivePrice === 'function') ? getGroupActivePrice(g) : (rep && rep.sellPrice) || 0;
    restOrderProduct({
      productId: (rep && rep.id) || '',
      name: g.name,
      barcode: g.barcode || '',
      price: price
    });
  }

  function restOrderProduct(product) {
    if (!canOrderFromSales()) return;
    RC.addDraftItem(sendDraft, product, 1);
    showSendPanel();
    toast(t('rest.addedToCart'), 'ok');
  }

  // Self-order entry points: add the product and open the send sheet with
  // «this device» preselected as the receiver.
  function restOrderGroupSelf(idx) {
    if (!canSelfOrder()) return;
    let g = null;
    try {
      if (typeof getSalesGroups === 'function') g = window.getSalesGroups()[idx];
      else if (window._salesGroupList) g = window._salesGroupList[idx];
    } catch (e) {}
    if (!g) return;
    const rep = (typeof groupViableRecords === 'function') ? groupViableRecords(g)[0] : (g.records || [])[0];
    const price = (typeof getGroupActivePrice === 'function') ? getGroupActivePrice(g) : (rep && rep.sellPrice) || 0;
    restOrderProductSelf({
      productId: (rep && rep.id) || '',
      name: g.name,
      barcode: g.barcode || '',
      price: price
    });
  }

  function restOrderProductSelf(product) {
    if (!canSelfOrder()) return;
    RC.addDraftItem(sendDraft, product, 1);
    sendDraft.toId = state.myId;
    showSendPanel();
    toast(t('rest.addedToCart'), 'ok');
  }

  function showSendPanel() {
    const el = ensurePanel();
    renderSendPanel();
    el.classList.add('open');
    const scrim = scrimEl();
    if (scrim) scrim.classList.add('open');
    updateFab();
    const first = el.querySelector('#restSendTo');
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) {} }
  }

  function hideSendPanel() {
    const el = panelEl();
    if (el) el.classList.remove('open');
    const scrim = scrimEl();
    if (scrim) scrim.classList.remove('open');
    updateFab();
  }

  function toggleSendPanel() {
    if (panelIsOpen()) hideSendPanel(); else showSendPanel();
  }

  function canShowPanel() {
    return canOrderFromSales() || sendDraft.items.length > 0;
  }

  function renderSendPanel() {
    const el = ensurePanel();
    const tot = RC.draftTotals(sendDraft);
    const count = sendDraft.items.reduce((s, it) => s + (RC.num(it.qty) || 0), 0);
    const selfOpt = canSelfOrder()
      ? `<option value="${window.escAttr(state.myId)}" ${state.myId && sendDraft.toId === state.myId ? 'selected' : ''}>${window.escHtml(t('rest.selfReceiver'))}</option>`
      : '';
    const receivers = receiverPeers().map(p =>
      `<option value="${window.escAttr(p.id)}" ${p.id === sendDraft.toId ? 'selected' : ''}>${window.escHtml(p.name)}</option>`
    ).join('') + selfOpt;
    const rows = sendDraft.items.map(it =>
      `<div class="rest-cart-row">
        <span class="rest-cart-name">${window.escHtml(it.name)}</span>
        <span class="rest-cart-qty">
          <button type="button" data-q="-1" data-id="${window.escAttr(it.productId)}" aria-label="-"><i class="fas fa-minus"></i></button>
          <b>${it.qty}</b>
          <button type="button" data-q="1" data-id="${window.escAttr(it.productId)}" aria-label="+"><i class="fas fa-plus"></i></button>
        </span>
        <span class="rest-cart-price">${window.fmtMoney(it.qty * it.price)}</span>
        <button type="button" class="rest-cart-rm" data-rm="${window.escAttr(it.productId)}" aria-label="${window.escAttr(t('rest.cancel') || 'x')}"><i class="fas fa-trash-alt"></i></button>
      </div>`
    ).join('');
    const empty = `
      <div class="rest-cart-empty">
        <i class="fas fa-shopping-basket"></i>
        <b>${window.escHtml(t('rest.emptyCart') || '')}</b>
        <span>${window.escHtml(t('rest.emptyCartHint') || '')}</span>
      </div>`;
    el.innerHTML = `
      <div class="rest-drawer-head">
        <span class="rest-head-ico"><i class="fas fa-utensils"></i></span>
        <span class="rest-head-txt">
          <b>${window.escHtml(t('rest.cartTitle') || '')}
            ${count ? `<span class="rest-drawer-count">${count}</span>` : ''}</b>
          <span>${window.escHtml(t('rest.cartSub') || '')}</span>
        </span>
        <button type="button" class="rest-head-clear" data-clear="1"><i class="fas fa-trash-alt"></i> ${window.escHtml(t('rest.clear') || '')}</button>
        <button type="button" class="rest-icon-btn" data-close="1" aria-label="${window.escAttr(t('rest.close') || 'x')}"><i class="fas fa-times"></i></button>
      </div>
      <div class="rest-cart-list">${rows || empty}</div>
      <div class="rest-send-fields">
        <div class="rest-send-field">
          <label for="restSendTo"><i class="fas fa-satellite-dish"></i>${window.escHtml(t('rest.receiverLabel') || '')}</label>
          <select id="restSendTo" class="form-input">${receivers || `<option value="">${window.escHtml(t('rest.noReceivers') || '')}</option>`}</select>
        </div>
        <div class="rest-send-field">
          <label for="restSendTable"><i class="fas fa-chair"></i>${window.escHtml(t('rest.tableLabel') || '')}</label>
          <input id="restSendTable" class="form-input" list="restTableList" placeholder="${window.escAttr(t('rest.tablePlaceholder') || '')}" value="${window.escAttr(sendDraft.table)}">
          <datalist id="restTableList">${state.tables.map(x => `<option value="${window.escAttr(x)}"></option>`).join('')}</datalist>
        </div>
        <div class="rest-send-field">
          <label for="restSendNotes"><i class="fas fa-sticky-note"></i>${window.escHtml(t('rest.notesLabel') || '')}</label>
          <input id="restSendNotes" class="form-input" placeholder="${window.escAttr(t('rest.notesPlaceholder') || '')}" value="${window.escAttr(sendDraft.notes)}">
        </div>
      </div>
      <div class="rest-send-foot">
        <span class="rest-foot-total">
          <span>${window.escHtml(t('rest.total') || '')}</span>
          <b>${window.fmtMoney(tot.total)}</b>
        </span>
        <button type="button" class="rest-send-go" id="restSendGo"><i class="fas fa-paper-plane"></i> ${window.escHtml(t('rest.send') || '')}</button>
      </div>`;

    el.querySelectorAll('[data-q]').forEach(btn => {
      btn.addEventListener('click', () => {
        RC.setDraftQty(sendDraft, btn.getAttribute('data-id'), RC.num(btn.getAttribute('data-q')));
        renderSendPanel();
      });
    });
    el.querySelectorAll('[data-rm], [data-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.hasAttribute('data-clear')) { sendDraft.items = []; }
        else RC.removeDraftItem(sendDraft, btn.getAttribute('data-rm'));
        renderSendPanel();
      });
    });
    const closeBtn = el.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', () => hideSendPanel());
    const toSel = el.querySelector('#restSendTo');
    const tableInp = el.querySelector('#restSendTable');
    const notesInp = el.querySelector('#restSendNotes');
    if (toSel) toSel.addEventListener('change', () => { sendDraft.toId = toSel.value; });
    if (tableInp) tableInp.addEventListener('input', () => { sendDraft.table = tableInp.value; });
    if (notesInp) notesInp.addEventListener('input', () => { sendDraft.notes = notesInp.value; });
    const go = el.querySelector('#restSendGo');
    if (go) go.addEventListener('click', () => {
      sendDraft.toId = toSel ? toSel.value : sendDraft.toId;
      sendDraft.table = tableInp ? tableInp.value : sendDraft.table;
      sendDraft.notes = notesInp ? notesInp.value : sendDraft.notes;
      const items = sendDraft.items.map(it => ({
        name: it.name,
        barcode: it.barcode,
        productId: it.productId,
        qty: it.qty,
        price: it.price
      }));
      const res = sendOrder({
        toId: sendDraft.toId,
        table: sendDraft.table,
        notes: sendDraft.notes,
        items
      });
      if (!res.ok) {
        if (res.reason === 'NO_RECEIVER') toast(t('rest.noReceivers'), 'danger');
        else if (res.reason === 'NO_TABLE') toast(t('rest.noTable'), 'danger');
        else if (res.reason === 'EMPTY') toast(t('rest.emptyCart'), 'danger');
        else toast(t('rest.failed'), 'danger');
        return;
      }
      // keep the receiver so the next order does not have to re-pick it
      sendDraft = { items: [], toId: sendDraft.toId, table: '', notes: '' };
      renderSendPanel();
      updateFab();
      toast(t('rest.orderSent') || t('rest.sent'), 'ok');
      hideSendPanel();
    });
    updateFab();
  }

  // ===== lifecycle ===========================================================

  function init() {
    if (state.initDone) return;
    state.initDone = true;
    loadConfig();

    window.addEventListener('zmt-lan-status', () => {
      if (state.enabled) { syncPresenceNow(); startHeartbeat(); } else { stopHeartbeat(); }
    });
    window.addEventListener('zmt-lan-message', (e) => { onLanMessage(e.detail); });
    if (state.enabled) { startHeartbeat(); syncPresenceNow(); }
    updateBadge();

    // Escape: confirm dialog installs its own capture listener; below it the
    // incoming-order popup wins over the cart drawer.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (orderVeilOpen()) { dismissPopup(); return; }
      if (document.querySelector('.rest-drawer.open')) hideSendPanel();
    });
    // Follow navigation: the cart drawer is a sales-page tool, so it closes when
    // we leave — but a non-empty draft keeps the floating reopen button alive
    // instead of silently losing it.
    //
    // This used to be an unconditional setInterval(..., 700): ~86 ticks a minute,
    // forever, each one reading the DOM and rewriting the FAB's innerHTML — even
    // when the restaurant module was switched OFF (the common case). It now does
    // the DOM work only while the module is enabled, on a coarser safety-net
    // tick, and reacts immediately to the zmt:navigate event instead of waiting.
    let lastPage = null;
    function fabTick() {
      const page = window._currentPageId || '';
      if (page !== lastPage) {
        lastPage = page;
        if (page && page !== 'sales') hideSendPanel();
      }
      if (state.enabled) updateFab();
    }
    setInterval(fabTick, 1500);
    window.addEventListener('zmt:navigate', fabTick);
    fabTick();
  }

  // storage toolbar text (used by connection page)
  function storageSyncBar() {
    const el = document.getElementById('restStorageStatus');
    if (el) el.textContent = state.enabled ? t('rest.enabled') : t('rest.disabled');
  }

  window.RestService = {
    init,
    getConfig,
    setConfig,
    me,
    isManagerUser,
    canOrderFromSales,
    canSelfOrder,
    permsFor,
    permsForMe,
    permsForOrder,
    savePermsById,
    storePerms,
    peersList,
    receiverPeers,
    orders: orderedVisible,
    incomingActive,
    unreadCount,
    sendOrder,
    updateStatus,
    confirmOrderAsSale,
    openConfirmDialog,
    printKitchenTicket,
    printInvoiceHtml,
    listPrinters,
    onLanMessage,
    restOrderProduct,
    restOrderGroup,
    restOrderGroupSelf,
    showSendPanel,
    hideSendPanel,
    toggleSendPanel,
    dirtyDraft: () => sendDraft,
    syncPresenceNow
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();