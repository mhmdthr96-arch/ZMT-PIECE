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

  const _SAFE_REFRESH_PAGES = ['dashboard', 'inventory', 'products', 'invoices', 'categories', 'customers', 'suppliers', 'reports', 'net-account', 'branches-monitor', 'shared-inventory'];

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

  async function start() {
    const cfg = getConfig();
    _role = cfg.role;
    _ip = cfg.ip;
    _port = cfg.port;
    if (!_role) {
      if (window.electronAPI?.lanConfigure) await window.electronAPI.lanConfigure({ role: '' });
      return;
    }
    if (!window.electronAPI?.lanConfigure) return;
    await window.electronAPI.lanConfigure({ role: _role, ip: _ip, port: _port });
  }

  async function reconfigure(role, ip, port) {
    saveConfig(role, ip, port);
    _role = role;
    _ip = ip || '';
    _port = parseInt(port || '4512', 10) || 4512;
    if (!_role) {
      if (window.electronAPI?.lanConfigure) await window.electronAPI.lanConfigure({ role: '' });
      return;
    }
    if (window.electronAPI?.lanConfigure) {
      await window.electronAPI.lanConfigure({ role: _role, ip: _ip, port: _port });
    }
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
    return data;
  }

  function sendSnapshot() {
    if (!window.electronAPI?.lanSend) return;
    window.electronAPI.lanSend({ type: 'snapshot', storeId: getStoreId(), data: buildSnapshot(), ts: Date.now() });
  }

  function sendOps(ops) {
    if (!window.electronAPI?.lanSend) return;
    const filtered = (ops || []).map(op => ({
      store: op.store,
      put: filterForStore(op.put || [], op.store),
      del: op.del || [],
      replace: !!op.replace,
    })).filter(op => (op.put && op.put.length) || (op.del && op.del.length));
    if (!filtered.length) return;
    window.electronAPI.lanSend({ type: 'ops', storeId: getStoreId(), ops: filtered, ts: Date.now() });
  }

  // ===== LOCAL CHANGE HOOK =====

  function hookDb() {
    if (typeof DB === 'undefined' || !DB.onLocalChange) return;
    DB.onLocalChange((queue) => {
      if (!_role) return;
      if (_role === 'sub' && !_connected) return;
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
          await DB.applyRemoteChanges([{ store: 'products', put: msg.data.products || [] }, { store: 'invoices', put: msg.data.invoices || [] }].filter(o => o.put.length));
        }
      };
      apply().then(() => {
        _lastSync = Date.now();
        if (_role === 'main') sendSnapshot();
        scheduleRefresh();
      }).catch(e => console.error('[LAN] Apply snapshot error:', e));
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
    if (_SAFE_REFRESH_PAGES.indexOf(pageId) === -1) return;
    if (typeof window.refreshCurrentPageApp === 'function') {
      try { window.refreshCurrentPageApp(pageId); } catch (e) { console.error('[LAN] Page refresh error:', e); }
    }
  }

  // ===== STATUS LISTENER =====

  function init() {
    if (!window.electronAPI) return;
    if (window.electronAPI.onLanMessage) {
      window.electronAPI.onLanMessage((msg) => handleMessage(msg));
    }
    if (window.electronAPI.onLanStatus) {
      window.electronAPI.onLanStatus((st) => {
        _listening = !!st.listening;
        _connected = !!st.connected;
        _clients = st.clients || 0;
        _activePort = st.port || 0;
        if (st.role !== undefined && st.role !== _role) _role = st.role;
        const ev = new CustomEvent('zmt-lan-status', { detail: getStatus() });
        window.dispatchEvent(ev);
      });
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
  };
})();

// Auto-init once app scripts are loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => LANSync.init());
} else {
  LANSync.init();
}
