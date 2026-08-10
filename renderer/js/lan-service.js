const LANSync = (() => {
  let _role = '';
  let _ip = '';
  let _port = 4512;
  let _listening = false;
  let _connected = false;
  let _clients = 0;
  let _lastSync = 0;
  let _refreshTimer = null;
  let _activePort = 0;
  let _reconcileTimer = null;
  let _hookRegistered = false;

  const _SAFE_REFRESH_PAGES = ['dashboard', 'inventory', 'products', 'invoices', 'categories', 'customers', 'suppliers', 'reports', 'net-account', 'branches-monitor', 'shared-inventory', 'debts', 'customer-detail', 'supplier-detail', 'orders'];

  function getStoreId() {
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) return Auth.getUserCode() || '';
    return localStorage.getItem('zmt_store_code') || '';
  }

  function getConfig() {
    return {
      role: localStorage.getItem('zmt_lan_role') || '',
      ip: localStorage.getItem('zmt_lan_ip') || '',
      port: parseInt(localStorage.getItem('zmt_lan_port') || '4512', 10) || 4512,
    };
  }

  function saveConfig(role, ip, port) {
    localStorage.setItem('zmt_lan_role', role);
    localStorage.setItem('zmt_lan_ip', ip || '');
    localStorage.setItem('zmt_lan_port', String(port || 4512));
  }

  function getStatus() {
    return { role: _role, ip: _ip, port: _port, activePort: _activePort, listening: _listening, connected: _connected, clients: _clients, lastSync: _lastSync };
  }

  // Periodic full-snapshot reconciliation. Guarantees the two devices converge
  // even if a live ops message is ever dropped, so the "restart required"
  // symptom disappears. 25s is plenty for a small-shop LAN.
  function startReconcile() {
    stopReconcile();
    _reconcileTimer = setInterval(() => {
      if (_role && window.electronAPI?.lanSend) sendSnapshot();
    }, 25000);
  }

  function stopReconcile() {
    if (_reconcileTimer) { clearInterval(_reconcileTimer); _reconcileTimer = null; }
  }

  async function start() {
    const cfg = getConfig();
    _role = cfg.role;
    _ip = cfg.ip;
    _port = cfg.port;
    if (!_role) {
      stopReconcile();
      if (window.electronAPI?.lanConfigure) await window.electronAPI.lanConfigure({ role: '' });
      return;
    }
    if (!window.electronAPI?.lanConfigure) return;
    await window.electronAPI.lanConfigure({ role: _role, ip: _ip, port: _port });
    startReconcile();
  }

  async function reconfigure(role, ip, port) {
    saveConfig(role, ip, port);
    _role = role;
    _ip = ip || '';
    _port = parseInt(port || '4512', 10) || 4512;
    if (!_role) {
      stopReconcile();
      if (window.electronAPI?.lanConfigure) await window.electronAPI.lanConfigure({ role: '' });
      return;
    }
    if (window.electronAPI?.lanConfigure) {
      await window.electronAPI.lanConfigure({ role: _role, ip: _ip, port: _port });
    }
    startReconcile();
  }

  // ===== SEND HELPERS =====

  function filterForStore(items, store) {
    if (store !== 'products' && store !== 'invoices') return items;
    const sid = getStoreId();
    if (!sid) return items;
    return items.filter(it => !it.storeId || it.storeId === sid);
  }

  function buildSnapshot() {
    const data = (typeof DB !== 'undefined' && DB.exportAll) ? DB.exportAll() : {};
    for (const key of ['products', 'invoices']) {
      if (data[key]) data[key] = filterForStore(data[key], key);
    }
    if (typeof Auth !== 'undefined' && Auth.getAllUsersByCode) {
      data.users = Auth.getAllUsersByCode();
    }
    return data;
  }

  function sendSnapshot() {
    if (!window.electronAPI?.lanSend) return;
    if (typeof DB !== 'undefined' && typeof DB.ready === 'function' && !DB.ready()) return;
    window.electronAPI.lanSend({ type: 'snapshot', storeId: getStoreId(), data: buildSnapshot(), ts: Date.now() });
  }

  function sendOps(ops) {
    if (!window.electronAPI?.lanSend) return;
    const filtered = (ops || []).map(op => {
      let del = [];
      if (Array.isArray(op.del)) {
        del = op.del.map(id => {
          const ts = (typeof DB !== 'undefined' && DB.getTombstoneTs) ? (DB.getTombstoneTs(op.store, id) || 0) : 0;
          return { id, ts: ts || 0 };
        }).filter(d => d.id != null);
      }
      return {
        store: op.store,
        put: filterForStore(op.put || [], op.store),
        del,
        replace: !!op.replace,
      };
    }).filter(op => (op.put && op.put.length) || (op.del && op.del.length));
    if (!filtered.length) return;
    window.electronAPI.lanSend({ type: 'ops', storeId: getStoreId(), ops: filtered, ts: Date.now() });
  }

  // Push the full per-store user lists so an employee created/edited/deleted on
  // either LAN peer can log in from the other one immediately.
  function sendUsers() {
    if (!window.electronAPI?.lanSend) return;
    if (!_role) return;
    if (typeof Auth === 'undefined' || !Auth.getAllUsersByCode) return;
    const users = Auth.getAllUsersByCode();
    if (!Object.keys(users).length) return;
    window.electronAPI.lanSend({ type: 'users', storeId: getStoreId(), users, ts: Date.now() });
  }

  // ===== LOCAL CHANGE HOOK =====

  function hookDb() {
    if (typeof DB === 'undefined' || !DB.onLocalChange) return;
    if (_hookRegistered) return;
    _hookRegistered = true;
    DB.onLocalChange((queue) => {
      if (!_role) return;
      const ops = [];
      for (const [store, q] of Object.entries(queue || {})) {
        ops.push({ store, put: q.put || [], del: q.del || [] });
      }
      sendOps(ops);
    });
  }

  // ===== INCOMING MESSAGE HANDLER =====

  function handleMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'hello') {
      sendSnapshot();
      return;
    }
    if (msg.type === 'snapshot' && msg.data) {
      const apply = async () => {
        if (typeof DB !== 'undefined' && DB.applyRemoteChanges) {
          const groups = [];
          const data = msg.data || {};
          for (const s of ['products', 'invoices', 'payments', 'customers', 'suppliers', 'discounts', 'returns', 'transfers', 'orders', 'supplierReturns']) {
            if (Array.isArray(data[s]) && data[s].length) groups.push({ store: s, put: filterForStore(data[s], s) });
          }
          const metaRecs = [];
          const m = data.meta || {};
          if (m.nextBarcode != null) metaRecs.push({ id: 'nextBarcode', val: m.nextBarcode });
          if (m.nextInvoiceCounter != null) metaRecs.push({ id: 'nextInvoiceCounter', val: m.nextInvoiceCounter });
          if (m.lanTombstones) metaRecs.push({ id: 'lanTombstones', val: m.lanTombstones });
          if (metaRecs.length) groups.push({ store: 'meta', put: metaRecs });
          if (groups.length) await DB.applyRemoteChanges(groups);
        }
        if (msg.data.users && typeof Auth !== 'undefined' && Auth.applyUsersPayload) {
          Auth.applyUsersPayload(msg.data.users);
        }
      };
      apply().then(() => {
        _lastSync = Date.now();
        scheduleRefresh();
      }).catch(e => console.error('[LAN] Apply snapshot error:', e));
      return;
    }
    if (msg.type === 'users' && msg.users) {
      if (typeof Auth !== 'undefined' && Auth.applyUsersPayload) {
        Auth.applyUsersPayload(msg.users);
      }
      _lastSync = Date.now();
      scheduleRefresh();
      return;
    }
    if (msg.type === 'ops' && Array.isArray(msg.ops)) {
      const apply = async () => {
        if (typeof DB !== 'undefined' && DB.applyRemoteChanges) {
          await DB.applyRemoteChanges(msg.ops);
        }
      };
      apply().then(() => {
        _lastSync = Date.now();
        scheduleRefresh();
      }).catch(e => console.error('[LAN] Apply ops error:', e));
      return;
    }
  }

  function scheduleRefresh() {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(() => {
      _refreshTimer = null;
      refreshCurrentPage();
    }, 600);
  }

  function refreshCurrentPage() {
    const pageId = window._currentPageId || '';
    if (!pageId) return;
    // Work-in-progress pages (active cart/entry) get a lightweight sync handler
    // that refreshes pickers/lists without wiping the current state.
    const handler = window._pageSyncHandlers && window._pageSyncHandlers[pageId];
    if (handler) {
      try { handler(); } catch (e) { console.error('[LAN] Page sync handler error:', pageId, e); }
      return;
    }
    if (_SAFE_REFRESH_PAGES.indexOf(pageId) === -1) return;
    if (typeof window.refreshCurrentPageApp === 'function') {
      try { window.refreshCurrentPageApp(pageId); } catch (e) { console.error('[LAN] Page refresh error:', e); }
    }
  }

  // ===== STATUS LISTENER =====

  function applyStatus(st) {
    if (!st) return;
    _listening = !!st.listening;
    _connected = !!st.connected;
    _clients = st.clients || 0;
    _activePort = st.port || 0;
    if (st.role !== undefined && st.role !== _role) _role = st.role;
    const ev = new CustomEvent('zmt-lan-status', { detail: getStatus() });
    window.dispatchEvent(ev);
  }

  function init() {
    if (!window.electronAPI) return;
    if (window.electronAPI.onLanMessage) {
      window.electronAPI.onLanMessage((msg) => handleMessage(msg));
    }
    if (window.electronAPI.onLanStatus) {
      window.electronAPI.onLanStatus((st) => applyStatus(st));
    }
    // Explicitly request current status so a missed first event can never leave
    // the sub's _connected flag stuck at false.
    if (window.electronAPI.lanGetStatus) {
      window.electronAPI.lanGetStatus().then((st) => applyStatus(st)).catch(() => {});
    }
  }

  return {
    init,
    start,
    reconfigure,
    getConfig,
    saveConfig,
    getStatus,
    hookDb,
    sendSnapshot,
    sendUsers,
  };
})();

// Auto-init once app scripts are loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => LANSync.init());
} else {
  LANSync.init();
}
