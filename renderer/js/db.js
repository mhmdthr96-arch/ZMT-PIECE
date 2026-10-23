const DB = (() => {
  const DB_NAME = 'zmt_piece_db';
  const DB_VERSION = 7;
  const STORES = ['products', 'invoices', 'payments', 'customers', 'suppliers', 'discounts', 'returns', 'transfers', 'orders', 'meta', 'supplierReturns', 'auditLogs', 'companies', 'employees', 'attendance'];
  const AUDIT_CAP = 2000;
  let db = null;
  let _ready = false;

  // ===== IN-MEMORY CACHE + INDEXES =====
  const _cache = {};
  const _idx = {};
  function _initCache() {
    for (const s of STORES) { _cache[s] = []; _idx[s] = {}; }
    _cache.meta = {};
  }
  _initCache();

  // ===== LOCAL CHANGE LISTENERS (LAN sync hook) =====
  let _localChangeListeners = [];

  // ===== DELETE TOMBSTONES (LAN sync) =====
  // Map store -> recordId -> delete timestamp (ms). Persisted inside meta so
  // deletes survive restarts and never resurrect on the peer device.
  let _tombstones = {};
  let _tombstonesDirty = false;

  function _emitLocalChange(ops) {
    for (const cb of _localChangeListeners) {
      try { cb(ops); } catch (e) { console.error('[DB] Change listener error:', e); }
    }
    // Cross-window bus: every persisted write is announced so OTHER windows
    // (e.g. the F1 quick-entry child vs the main window) re-sync their caches
    // live instead of needing a full app restart to see each other's changes.
    try {
      if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.dbChangedNotify === 'function') {
        window.electronAPI.dbChangedNotify();
      }
    } catch (e) { /* best effort, never block a write */ }
  }

  function _emitStoreReplace(store, list) {
    _emitLocalChange({ [store]: { put: list || [], replace: true } });
  }

  // ===== TOMBSTONE HELPERS =====

  function _recordTombstone(store, id, ts) {
    if (store === 'meta' || id == null) return;
    if (!_tombstones[store]) _tombstones[store] = {};
    const cur = _tombstones[store][id] || 0;
    const t = Number(ts) || Date.now();
    if (t >= cur) {
      _tombstones[store][id] = t;
      _tombstonesDirty = true;
      _persistTombstones();
    }
  }

  function _mergeTombstones(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    for (const store of Object.keys(incoming)) {
      const map = incoming[store];
      if (!map || typeof map !== 'object') continue;
      if (!_tombstones[store]) _tombstones[store] = {};
      for (const id of Object.keys(map)) {
        const cur = _tombstones[store][id] || 0;
        const t = Number(map[id]) || 0;
        if (t > cur) {
          _tombstones[store][id] = t;
          _tombstonesDirty = true;
        }
      }
    }
  }

  function _persistTombstones() {
    if (!_tombstonesDirty) return;
    if (!_batchQueue['meta']) _batchQueue['meta'] = { put: [], del: [] };
    const rec = { id: 'lanTombstones', val: _tombstones };
    const arr = _batchQueue['meta'].put;
    const idx = arr.findIndex(x => x && x.id === 'lanTombstones');
    if (idx !== -1) arr[idx] = rec;
    else arr.push(rec);
    _scheduleFlush();
  }

  async function _persistTombstonesIdb() {
    if (!_tombstonesDirty) return;
    await _idbPut('meta', [{ id: 'lanTombstones', val: _tombstones }]);
    _tombstonesDirty = false;
  }

  // Remove any cached items that are still covered by a tombstone (used after
  // remote changes so a deleted record never lingers in the local cache).
  async function _applyTombstoneSweep() {
    let removedAny = false;
    for (const store of Object.keys(_tombstones)) {
      if (store === 'meta' || !_cache[store]) continue;
      const tmap = _tombstones[store];
      const removed = [];
      _cache[store] = _cache[store].filter(x => {
        const tts = tmap[x.id];
        if (tts && (!x.updatedAt || x.updatedAt <= tts)) { removed.push(x.id); return false; }
        if (tts) delete tmap[x.id];
        return true;
      });
      if (removed.length) {
        removedAny = true;
        _rebuildIndex(store);
        await _idbDelete(store, removed);
      }
    }
    if (removedAny) {
      _tombstonesDirty = true;
      await _persistTombstonesIdb();
    }
  }

  function _rebuildIndex(store) {
    _idx[store] = {};
    const arr = _cache[store] || [];
    if (store === 'products') {
      for (const p of arr) {
        _idx.products[p.id] = p;
        if (p.barcode) {
          _idx.products['bc:' + p.barcode] = p;
          _idx.products['bcn:' + canonBarcode(p.barcode)] = p;
        }
        if (p.storeId) {
          if (!_idx.products['sid:' + p.storeId]) _idx.products['sid:' + p.storeId] = [];
          _idx.products['sid:' + p.storeId].push(p);
        }
        if (p.brandId) {
          if (!_idx.products['br:' + p.brandId]) _idx.products['br:' + p.brandId] = [];
          _idx.products['br:' + p.brandId].push(p);
        }
      }
    } else if (store === 'invoices') {
      for (const inv of arr) {
        _idx.invoices[inv.id] = inv;
        if (inv.storeId) {
          if (!_idx.invoices['sid:' + inv.storeId]) _idx.invoices['sid:' + inv.storeId] = [];
          _idx.invoices['sid:' + inv.storeId].push(inv);
        }
        if (inv.supplierId) {
          if (!_idx.invoices['sup:' + inv.supplierId]) _idx.invoices['sup:' + inv.supplierId] = [];
          _idx.invoices['sup:' + inv.supplierId].push(inv);
        }
        if (inv.customerId) {
          if (!_idx.invoices['cust:' + inv.customerId]) _idx.invoices['cust:' + inv.customerId] = [];
          _idx.invoices['cust:' + inv.customerId].push(inv);
        }
        if (inv.invoiceNumber) {
          _idx.invoices['invno:' + inv.invoiceNumber] = inv;
        }
      }
    } else if (store === 'customers') {
      for (const c of arr) {
        _idx.customers[c.id] = c;
        if (c.name) {
          const key = 'name:' + c.name.toLowerCase().slice(0, 50);
          if (!_idx.customers[key]) _idx.customers[key] = [];
          _idx.customers[key].push(c);
        }
        if (c.phone) {
          const key = 'phone:' + c.phone.replace(/[\s\-\(\)]/g, '');
          if (!_idx.customers[key]) _idx.customers[key] = [];
          _idx.customers[key].push(c);
        }
      }
    } else if (store === 'suppliers') {
      for (const s of arr) {
        _idx.suppliers[s.id] = s;
        if (s.name) {
          const key = 'name:' + s.name.toLowerCase().slice(0, 50);
          if (!_idx.suppliers[key]) _idx.suppliers[key] = [];
          _idx.suppliers[key].push(s);
        }
        if (s.phone) {
          const key = 'phone:' + s.phone.replace(/[\s\-\(\)]/g, '');
          if (!_idx.suppliers[key]) _idx.suppliers[key] = [];
          _idx.suppliers[key].push(s);
        }
      }
    } else if (store === 'payments') {
      for (const p of arr) {
        _idx.payments[p.id] = p;
        if (p.invoiceId) {
          if (!_idx.payments['inv:' + p.invoiceId]) _idx.payments['inv:' + p.invoiceId] = [];
          _idx.payments['inv:' + p.invoiceId].push(p);
        }
        if (p.supplierId) {
          if (!_idx.payments['sup:' + p.supplierId]) _idx.payments['sup:' + p.supplierId] = [];
          _idx.payments['sup:' + p.supplierId].push(p);
        }
        if (p.customerId) {
          if (!_idx.payments['cust:' + p.customerId]) _idx.payments['cust:' + p.customerId] = [];
          _idx.payments['cust:' + p.customerId].push(p);
        }
      }
    } else if (store === 'orders') {
      for (const o of arr) {
        _idx.orders[o.id] = o;
      }
    } else if (store === 'employees') {
      for (const e of arr) {
        _idx.employees[e.id] = e;
        if (e.barcode) {
          _idx.employees['bc:' + e.barcode] = e;
          _idx.employees['bcn:' + canonBarcode(e.barcode)] = e;
        }
      }
    } else if (store === 'attendance') {
      for (const a of arr) {
        _idx.attendance[a.id] = a;
        if (a.employeeId && a.date) {
          const key = 'emp:' + a.employeeId + ':' + a.date;
          if (!_idx.attendance[key]) _idx.attendance[key] = [];
          _idx.attendance[key].push(a);
        }
      }
    }
  }

  function _rebuildAll() {
    for (const s of STORES) _rebuildIndex(s);
  }

  // Incremental single-record index maintenance: adds `item` to the in-memory
  // products index WITHOUT re-scanning the whole store (O(1) per write). This
  // keeps barcode-scan "add product" workflows fast even at ~1M rows, where the
  // old addProduct -> _rebuildIndex('products') path cost O(n) per product.
  // Non-product stores fall back to a full rebuild (small collections, rare).
  function _indexSingle(store, item) {
    if (store !== 'products' || !item || item.id == null) {
      _rebuildIndex(store);
      return;
    }
    _idx.products[item.id] = item;
    if (item.barcode) {
      _idx.products['bc:' + item.barcode] = item;
      _idx.products['bcn:' + canonBarcode(item.barcode)] = item;
    }
    const push = (key) => {
      if (!_idx.products[key]) _idx.products[key] = [];
      _idx.products[key].push(item);
    };
    if (item.storeId) push('sid:' + item.storeId);
    if (item.brandId) push('br:' + item.brandId);
  }

  function _indexRemove(store, item) {
    if (store !== 'products' || !item) { _rebuildIndex(store); return; }
    delete _idx.products[item.id];
    if (item.barcode) {
      delete _idx.products['bc:' + item.barcode];
      delete _idx.products['bcn:' + canonBarcode(item.barcode)];
    }
    const pull = (key) => {
      const arr = _idx.products[key];
      if (!arr) return;
      const i = arr.indexOf(item);
      if (i !== -1) arr.splice(i, 1);
      if (!arr.length) delete _idx.products[key];
    };
    if (item.storeId) pull('sid:' + item.storeId);
    if (item.brandId) pull('br:' + item.brandId);
  }

  function _getStoreId() {
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) return Auth.getUserCode() || '';
    return localStorage.getItem('zmt_store_code') || '';
  }

  // Normalize a timestamp (number ms or ISO string) to ms; 0 if invalid.
  function _normTs(v) {
    if (v === undefined || v === null || v === '') return 0;
    const n = typeof v === 'number' ? v : Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }

  // Multi-company-safe merge for restore/import. Restoring one company's backup
  // on a device that also holds other companies must never destroy those other
  // companies' records, nor lose any local data it is not replacing. Rules:
  //   - every local row is kept unless a remote row carries the SAME id AND the
  //     same company scope (same companyId, or both untagged),
  //   - a matching same-scope row is replaced by the backup copy when
  //     `backupWins` (manual restore: the backup is the truth for the restored
  //     company), or last-write-wins merged when `backupWins` is false
  //     (auto/background restore must not clobber fresher local edits),
  //   - a cross-company same-id collision (different companyId) always keeps the
  //     local row and drops the incoming one, so one company never overwrites
  //     another's record, and
  //   - remote rows with no local counterpart are appended.
  // Companies are run-level (no companyId) so they merge by id within this rule,
  // preserving any company not present in the incoming list.
  // Canonical scope key: an untagged row (companyId undefined) and a row tagged
  // with an empty companyId ('') are the SAME scope. Previously
  // `(a && a.companyId) === (b && b.companyId)` compared undefined vs '' as
  // different, so such a pair bypassed the same-scope guard and one side could
  // silently overwrite the other (a root cause of blank product/invoice details).
  const _scopeKeyOf = (x) => (x && x.companyId) ? String(x.companyId) : '';

  // Field-preserving record merge: `base` supplies the winning values, and any
  // field entirely ABSENT from `base` is carried over from `other`. This stops a
  // partial/older backup from blanking out fields the local row still holds
  // (e.g. price/quantity), while never resurrecting a field that was explicitly
  // cleared (present but empty) on the winner.
  function _mergeRecordPreserving(base, other) {
    if (!base) return other;
    if (!other) return base;
    let out = base;
    for (const k of Object.keys(other)) {
      if (!Object.prototype.hasOwnProperty.call(base, k)) {
        if (out === base) out = Object.assign({}, base);
        out[k] = other[k];
      }
    }
    return out;
  }

  // Last import report (catastrophic-shrink guard). Exposed via lastImportReport()
  // and broadcast as a `zmt:import-guard` window event so the UI can warn instead
  // of losing data silently.
  let _lastImportReport = null;

  function _notifyDbWarning(kind, detail) {
    try {
      window.dispatchEvent(new CustomEvent('zmt:db-warning', { detail: Object.assign({ kind }, detail || {}) }));
    } catch (e) { /* non-fatal */ }
  }

  function _mergeCompaniesPreserving(localArr, remoteArr, backupWins) {
    const local = Array.isArray(localArr) ? localArr : [];
    const remote = Array.isArray(remoteArr) ? remoteArr : [];
    const byId = new Map();
    for (const r of remote) if (r && r.id != null) byId.set(r.id, r);
    const sameScope = (a, b) => _scopeKeyOf(a) === _scopeKeyOf(b);
    const out = [];
    const seen = new Set();
    for (const l of local) {
      const r = (l && l.id != null) ? byId.get(l.id) : undefined;
      if (r && sameScope(l, r)) {
        if (backupWins) { out.push(_mergeRecordPreserving(r, l)); }
        else {
          const lTs = _normTs(l.updatedAt || l.createdAt);
          const rTs = _normTs(r.updatedAt || r.createdAt);
          out.push(rTs > lTs ? _mergeRecordPreserving(r, l) : _mergeRecordPreserving(l, r));
        }
      } else {
        out.push(l);
      }
      if (l && l.id != null) seen.add(l.id);
    }
    for (const r of remote) {
      if (r && r.id != null && !seen.has(r.id)) { out.push(r); seen.add(r.id); }
    }
    return out;
  }

  // ===== IndexedDB Layer =====
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        for (const s of STORES) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function _idbGetAll(store) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  const CHUNK_SIZE = 500;

  async function _idbPut(store, items) {
    if (!items.length) return;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        for (const item of chunk) os.put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (i + CHUNK_SIZE < items.length) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  function _idbDelete(store, ids) {
    if (!ids.length) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      for (const id of ids) os.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function _idbClear(store) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ===== BATCH WRITE QUEUE =====
  let _batchQueue = {};
  let _batchTimer = null;

  function _queueWrite(store, item) {
    if (!_batchQueue[store]) _batchQueue[store] = { put: [], del: [] };
    _batchQueue[store].put.push(item);
    _scheduleFlush();
  }

  function _queueDelete(store, id) {
    if (!_batchQueue[store]) _batchQueue[store] = { put: [], del: [] };
    _batchQueue[store].del.push(id);
    _recordTombstone(store, id, Date.now());
    _scheduleFlush();
  }

  function _scheduleFlush() {
    if (_batchTimer) return;
    _batchTimer = setTimeout(_flushBatch, 50);
  }

  // ===== AUDIT LOG (per-manager action trail) =====
  // Audit entries are kept in _cache.auditLogs and flushed to their own IDB
  // store on a short debounce. They never participate in the cloud-sync batch
  // (to avoid spamming the backup), but are included in exportAll()/importAll()
  // so a store restore preserves its history.
  let _auditTimer = null;
  // Records appended since the last flush, and ids dropped off the front of the
  // capped ring buffer. Written as a delta (see below) instead of re-putting the
  // whole array.
  let _auditPending = [];
  let _auditDropped = [];
  function _dropAuditPending() { _auditPending = []; _auditDropped = []; }
  function _scheduleAuditFlush() {
    if (_auditTimer) return;
    _auditTimer = setTimeout(async () => {
      _auditTimer = null;
      try {
        if (!db) return;
        // auditLogs is a capped ring buffer. The old flush re-wrote the ENTIRE
        // array on every action — a single recorded action re-serialised up to
        // AUDIT_CAP records into IndexedDB. The store is keyed on `id`, so only
        // the rows appended since the last flush need putting, and only the rows
        // shifted off the front need deleting.
        const put = _auditPending;
        const del = _auditDropped;
        _auditPending = [];
        _auditDropped = [];
        if (put.length) await _idbPut('auditLogs', put);
        if (del.length) await _idbDelete('auditLogs', del);
      } catch (e) { /* best effort */ }
    }, 1500);
  }

  async function _flushBatch() {
    _batchTimer = null;
    const queue = _batchQueue;
    _batchQueue = {};
    for (const [store, ops] of Object.entries(queue)) {
      try {
        if (ops.put.length) await _idbPut(store, ops.put);
        if (ops.del.length) await _idbDelete(store, ops.del);
      } catch (e) { console.error('[DB] Flush error:', store, e); }
    }
    _tombstonesDirty = false;
    debounceAutoBackup();
    if (typeof CloudService !== 'undefined' && CloudService.isCloudConnected() && CloudService.hasData() && localStorage.getItem('zmt_cloud_autosync') === '1') {
      CloudService.triggerSync();
    }
    _emitLocalChange(queue);
  }

  async function _immediateFlush() {
    if (_batchTimer) { clearTimeout(_batchTimer); _batchTimer = null; }
    const queue = _batchQueue;
    _batchQueue = {};
    for (const [store, ops] of Object.entries(queue)) {
      try {
        if (ops.put.length) await _idbPut(store, ops.put);
        if (ops.del.length) await _idbDelete(store, ops.del);
      } catch (e) { console.error('[DB] Flush error:', store, e); }
    }
    _tombstonesDirty = false;
    _emitLocalChange(queue);
  }

  // ===== AUTO-BACKUP =====
  let _autoBackupTimer = 0;
  let _autoBackupSuppressed = false;
  let _autoBackupRunning = false;
  let _autoBackupLastTs = 0;
  const AUTO_BACKUP_MIN_GAP = 5 * 60 * 1000;
  // Schedule a local auto-backup. Deliberately NOT a rolling debounce: the old
  // version cleared and restarted a 30s timer on EVERY write, so any sustained
  // activity (a busy sales session, an LAN sync, a cloud reconcile) postponed the
  // backup indefinitely — it only ever ran after the operator went idle. A
  // pending timer is now left alone: the deadline is set once and kept.
  // tryAutoBackup() still enforces AUTO_BACKUP_MIN_GAP between actual runs and
  // re-arms itself when it fires too early.
  function debounceAutoBackup() {
    if (_autoBackupSuppressed) return;
    if (_autoBackupTimer) return; // a run is already scheduled — don't push it back
    _autoBackupTimer = setTimeout(tryAutoBackup, 30000);
  }

  function suppressAutoBackup(on) {
    _autoBackupSuppressed = !!on;
    if (on && _autoBackupTimer) { clearTimeout(_autoBackupTimer); _autoBackupTimer = 0; }
  }

  async function tryAutoBackup() {
    // This is invoked as the timer callback, so clear the pending-slot marker
    // first: debounceAutoBackup() uses it to avoid stacking timers, and leaving
    // it set here would permanently block every future backup (the timer no
    // longer self-cancels). The re-arm below re-establishes it when needed.
    _autoBackupTimer = 0;
    if (_autoBackupSuppressed || _autoBackupRunning) return;
    if (!window.electronAPI?.getAppDataPath) return;
    if (_cache.products.length === 0 && _cache.invoices.length === 0 && _cache.customers.length === 0 && _cache.suppliers.length === 0) return;
    const now = Date.now();
    if (now - _autoBackupLastTs < AUTO_BACKUP_MIN_GAP) {
      _autoBackupTimer = setTimeout(tryAutoBackup, AUTO_BACKUP_MIN_GAP - (now - _autoBackupLastTs));
      return;
    }
    _autoBackupLastTs = now;
    _autoBackupRunning = true;
    try {
      const appPath = await window.electronAPI.getAppDataPath();
      if (!appPath) return;
      const backupData = {};
      for (const s of STORES) backupData[s] = _cache[s];
      backupData._meta = _cache.meta;
      const backup = {
        version: 3,
        createdAt: new Date().toISOString(),
        storeName: localStorage.getItem('zmt_store_name') || '',
        summary: { products: _cache.products.length, invoices: _cache.invoices.length },
        data: backupData,
      };
      const dateStr = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const filePath = `${appPath}\\auto_${dateStr}.zmt-backup`;
      // Compression happens off the main thread (blob-utils); the synchronous
      // gzip of the whole database used to stall the UI for hundreds of ms.
      const gz = window._zmtGzipToBase64Async
        ? await window._zmtGzipToBase64Async(backup)
        : window._zmtGzipToBase64(backup);
      await window.electronAPI.writeFileBinary(filePath, gz);
      try {
        const dirResult = await window.electronAPI.readDirectory(appPath);
        if (dirResult.success) {
          const autoFiles = dirResult.files.filter(f => f.startsWith('auto_')).sort();
          while (autoFiles.length > 10) {
            await window.electronAPI.deleteFile(`${appPath}\\${autoFiles.shift()}`);
          }
        }
      } catch {}
    } catch (e) {
      console.warn('[DB] Auto-backup failed:', e && e.message);
    } finally {
      _autoBackupRunning = false;
    }
  }

  // ===== OFFLINE AUTO-RESTORE =====
  // Safety net: when offline and the local database is empty, load the newest
  // auto_*.zmt-backup from disk so the app is never shown blank.
  async function tryOfflineRestore() {
    if (typeof navigator !== 'undefined' && navigator.onLine) return { restored: false, reason: 'online' };
    if (!window.electronAPI?.getAppDataPath || !window.electronAPI?.readDirectory || !window.electronAPI?.readFile) {
      return { restored: false, reason: 'no-api' };
    }
    const hasData = STORES.some(s => _cache[s] && (Array.isArray(_cache[s]) ? _cache[s].length : Object.keys(_cache[s]).length) > 0);
    if (hasData) return { restored: false, reason: 'has-data' };
    try {
      const appPath = await window.electronAPI.getAppDataPath();
      if (!appPath) return { restored: false, reason: 'no-path' };
      const dirResult = await window.electronAPI.readDirectory(appPath);
      if (!dirResult.success) return { restored: false, reason: 'list-fail' };
      const autoFiles = dirResult.files.filter(f => f.startsWith('auto_') && f.endsWith('.zmt-backup')).sort();
      if (!autoFiles.length) return { restored: false, reason: 'no-backup' };
      const newest = autoFiles[autoFiles.length - 1];
      const readResult = await window.electronAPI.readFileBuffer(appPath + '\\' + newest);
      if (!readResult.success) return { restored: false, reason: 'read-fail' };
      const backup = window._zmtParseBase64(readResult.data);
      const data = backup && backup.data ? backup.data : backup;
      if (data._meta && !data.meta) data.meta = data._meta;
      // Auto-restore is a safety net, never a bully: merge with last-write-wins so
      // a stale disk backup can never overwrite newer local rows.
      await importAll(data, { mergeNewer: true });
      console.log('[DB] Offline restore from', newest);
      return { restored: true, file: newest };
    } catch (e) {
      console.error('[DB] Offline restore error:', e);
      return { restored: false, reason: 'error' };
    }
  }

  // ===== INIT =====
  async function init() {
    await openDB();
    for (const s of STORES) {
      try { _cache[s] = await _idbGetAll(s); } catch (e) { _cache[s] = []; }
    }
    if (Array.isArray(_cache.meta)) {
      const flat = {};
      for (const entry of _cache.meta) flat[entry.id] = entry.val;
      _cache.meta = flat;
    }
    if (!_cache.meta.nextBarcode) _cache.meta.nextBarcode = 100000;
    if (!_cache.meta.nextInvoiceCounter) _cache.meta.nextInvoiceCounter = 0;
    if (!_cache.meta.nextPaymentCounter) _cache.meta.nextPaymentCounter = 0;
    if (_cache.meta.lanTombstones && typeof _cache.meta.lanTombstones === 'object') {
      _tombstones = _cache.meta.lanTombstones;
    } else {
      _tombstones = {};
      _cache.meta.lanTombstones = _tombstones;
    }
    _tombstonesDirty = false;
    _backfillMissingStoreId();
    await _ensureDefaultCompany();
    _backfillCompanyIds();
    _rebuildAll();
    _ready = true;
    _reportDataIntegrity();
  }

  /** Progressive init: loads stores one at a time with progress callbacks */
  async function initProgressive(onProgress) {
    await openDB();
    for (let si = 0; si < STORES.length; si++) {
      const s = STORES[si];
      try {
        _cache[s] = await _idbGetAll(s);
      } catch (e) {
        _cache[s] = [];
      }
      if (s === 'meta' && Array.isArray(_cache.meta)) {
        const flat = {};
        for (const entry of _cache.meta) flat[entry.id] = entry.val;
        _cache.meta = flat;
      }
      _rebuildIndex(s);
      if (onProgress) onProgress(s, si + 1, STORES.length, _cache[s]?.length || 0);
      await new Promise(r => setTimeout(r, 0));
    }
    if (!_cache.meta.nextBarcode) _cache.meta.nextBarcode = 100000;
    if (!_cache.meta.nextInvoiceCounter) _cache.meta.nextInvoiceCounter = 0;
    if (!_cache.meta.nextPaymentCounter) _cache.meta.nextPaymentCounter = 0;
    if (_cache.meta.lanTombstones && typeof _cache.meta.lanTombstones === 'object') {
      _tombstones = _cache.meta.lanTombstones;
    } else {
      _tombstones = {};
      _cache.meta.lanTombstones = _tombstones;
    }
    _tombstonesDirty = false;
    // storeId feeds the products/invoices index ('sid:' buckets), so the indexes
    // must be rebuilt if the backfill rewrote rows. When it didn't (the normal
    // case) the per-store loop above already built them — the unconditional
    // rebuild that used to sit here cost two extra full scans on every boot.
    const backfilledStoreId = _backfillMissingStoreId();
    await _ensureDefaultCompany();
    _backfillCompanyIds();
    if (backfilledStoreId) {
      _rebuildIndex('products');
      _rebuildIndex('invoices');
    }
    _ready = true;
    _reportDataIntegrity();
    if (onProgress) onProgress(null, STORES.length, STORES.length, 0);
  }

  function _genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
  }

  // Products/invoices created while offline (no store logged in) can lack a
  // storeId — and any record without one used to be DROPPED from cloud backups
  // (supabase-service filters `p.storeId === targetCode`). Backfill them at boot
  // so every row is always backed up and never silently lost on restore.
  function _backfillMissingStoreId() {
    const sid = _getStoreId();
    if (!sid) return 0;
    const prodOut = [];
    const invOut = [];
    const now = Date.now();
    for (const p of _cache.products) {
      if (!p.storeId) { p.storeId = sid; p.updatedAt = now; prodOut.push(p); }
    }
    for (const inv of _cache.invoices) {
      if (!inv.storeId) { inv.storeId = sid; inv.updatedAt = now; invOut.push(inv); }
    }
    if (!prodOut.length && !invOut.length) return 0;
    if (db) {
      if (prodOut.length) { _idbPut('products', prodOut); }
      if (invOut.length) { _idbPut('invoices', invOut); }
    }
    return prodOut.length + invOut.length;
  }

  // Fixed, stable id for the "default" company created from the general-settings
  // fields (the first company device data is attributed to). Persisted so it can
  // be referenced deterministically across sessions and LAN sync.
  const _DEFAULT_COMPANY_ID = 'zmt-default-company';

  // Reads the current store code (the device's own store/branch code).
  function _getOwnStoreCode() {
    try {
      if (typeof Auth !== 'undefined' && Auth.getUserCode) {
        const uc = Auth.getUserCode();
        if (uc) return String(uc);
      }
    } catch (e) {}
    return localStorage.getItem('zmt_store_code') || '';
  }

  // Build a company profile object from the general-settings localStorage fields.
  function _readDefaultCompanyProfile(name) {
    return {
      name: name || localStorage.getItem('zmt_store_name') || 'ZMT PIECE',
      phone: localStorage.getItem('zmt_store_phone') || '',
      address: localStorage.getItem('zmt_store_address') || '',
      nis: localStorage.getItem('zmt_store_nis') || '',
      nif: localStorage.getItem('zmt_store_nif') || '',
      rcc: localStorage.getItem('zmt_store_rcc') || '',
      article: localStorage.getItem('zmt_store_article') || '',
    };
  }

// Resolve the company that legacy/untagged records should belong to AND that is
// bound to the general-settings company-name field. Uses a PERSISTED reference
// (`meta.defaultCompanyId`) so the default is deterministic across restarts — the
// raw array order is NOT stable (IndexedDB returns records in key order), so
// relying on all[0] caused legacy data to be attributed to a random company.
function _resolveDefaultCompany() {
  const all = Array.isArray(_cache.companies) ? _cache.companies : [];
  if (!all.length) return null;
  const savedId = _cache.meta && _cache.meta.defaultCompanyId;
  if (savedId) {
    const saved = all.find(c => c.id === savedId);
    if (saved) return saved;
  }
  const byId = all.find(c => c.id === _DEFAULT_COMPANY_ID);
  if (byId) return byId;
  // Oldest-created company wins as the fallback default — this is the user's
  // original company (data was created there first), NOT whichever record sorts
  // first. Reliable for both fresh and migrated installs.
  const oldest = all.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
  return oldest || all[0];
}

// Ensure a stable default-company reference exists. Called once at init:
//  - no companies at all            -> create the default company (fixed id).
//  - companies exist, no saved ref  -> pick the single existing company (or the
//    fixed-id default) and PERSIST it as the default so every future boot and
//    every `addCompany` attribution is deterministic.
async function _ensureDefaultCompany() {
  const all = Array.isArray(_cache.companies) ? _cache.companies : [];
  if (!all.length) {
    const ownCode = _getOwnStoreCode();
    const profile = _readDefaultCompanyProfile();
    const cmp = {
      id: _DEFAULT_COMPANY_ID,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      storeCodes: ownCode ? [ownCode] : [],
    };
    Object.assign(cmp, profile);
    _normalizeCompanyProfile(cmp);
    _cache.companies.push(cmp);
    // Persist the default company synchronously (not via the 50ms-deferred
    // batch queue) so it can never be lost if the app is closed right after
    // startup. Errors are surfaced to the console instead of swallowed so a
    // failed write is visible rather than silently dropping user companies.
    if (db) {
      try {
        await _idbPut('companies', [cmp]);
      } catch (e) {
        console.error('[DB] failed to persist default company:', e);
      }
    }
    try { _cache.meta.defaultCompanyId = cmp.id; _updateMeta('defaultCompanyId', cmp.id); } catch (e) {}
    return cmp;
  }
  if (!(_cache.meta && _cache.meta.defaultCompanyId)) {
    const def = _resolveDefaultCompany();
    if (def) {
      try { _cache.meta.defaultCompanyId = def.id; _updateMeta('defaultCompanyId', def.id); } catch (e) {}
      return def;
    }
  }
  return _resolveDefaultCompany();
}

  // Attribute every operational record that currently has NO companyId to the
  // default company. Idempotent: only touches untagged rows, so it is safe on
  // every boot (cheap no-op once data is tagged). This is what keeps legacy
  // devices' data inside ONE company so a newly created second company starts
  // truly empty.
  function _backfillCompanyIds() {
    try {
      // Cheap counting pass first. This runs on EVERY boot over every store, but
      // after the first backfill there is normally nothing left to tag — so a
      // single scan that finds zero candidates returns immediately instead of
      // also walking every store a second time to collect (and rewrite) the rows.
      const skipped = { meta: 1, auditLogs: 1, companies: 1 };
      let missing = 0;
      for (const s of STORES) {
        if (skipped[s]) continue;
        const arr = _cache[s];
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i++) {
          const rec = arr[i];
          if (rec && typeof rec === 'object' && !rec.companyId) missing++;
        }
      }
      if (!missing) return;

      const def = _resolveDefaultCompany();
      const defId = def && def.id;
      if (!defId) return;
      const now = Date.now();
      const touched = {};
      for (const s of STORES) {
        if (skipped[s]) continue;
        const arr = _cache[s];
        if (!Array.isArray(arr)) continue;
        const out = [];
        for (let i = 0; i < arr.length; i++) {
          const rec = arr[i];
          if (rec && typeof rec === 'object' && !rec.companyId) {
            rec.companyId = defId;
            rec.updatedAt = now;
            out.push(rec);
          }
        }
        if (out.length) touched[s] = out;
      }
      if (db) {
        for (const s of Object.keys(touched)) _idbPut(s, touched[s]).catch(() => {});
      }
    } catch (e) { /* non-fatal: retried next boot */ }
  }

  // Boot-time data-integrity probe. Counts records that will render as a blank
  // card / invisible row because the field the view reads is missing, and stores
  // the result in localStorage `zmt_data_integrity` (same diagnostic style as
  // Auth.reportScope). This turns a vague "my inventory is empty / invoices are
  // missing" report into the actual culprit: whether rows are absent, or present
  // but malformed. Read-only — never mutates data.
  function _reportDataIntegrity() {
    try {
      const products = _cache.products || [];
      const invoices = _cache.invoices || [];
      let badProducts = 0, badInvoices = 0;
      const samples = [];
      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (!p || p.name == null || p.name === '' || p.quantity == null) {
          badProducts++;
          if (samples.length < 3) samples.push({ store: 'products', id: p && p.id, name: p && p.name });
        }
      }
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        if (!inv || (inv.invoiceNumber == null && !inv.id)) {
          badInvoices++;
          if (samples.length < 3) samples.push({ store: 'invoices', id: inv && inv.id });
        }
      }
      const row = {
        at: new Date().toISOString(),
        products: products.length,
        invoices: invoices.length,
        badProducts,
        badInvoices,
        samples,
      };
      try { localStorage.setItem('zmt_data_integrity', JSON.stringify(row)); } catch (e) {}
      if (badProducts || badInvoices) {
        console.warn('[Integrity] records that render blank:', JSON.stringify(row));
      }
      return row;
    } catch (e) { return null; }
  }

  function _updateMeta(key, val) {
    _cache.meta[key] = val;
    _queueWrite('meta', { id: key, val });
  }

  function _triggerCloudSync() {
    if (typeof CloudService !== 'undefined' && CloudService.isCloudConnected() && CloudService.hasData() && localStorage.getItem('zmt_cloud_autosync') === '1') {
      CloudService.triggerSync();
    }
  }

  // Push a local change (order / supplier return) to the website immediately via
  // the delta channel. NOT gated by autosync: the website should see desktop
  // changes within seconds even when full-backup auto-upload is off.
  function _pushLocalChange(kind, op, record) {
    if (typeof CloudService !== 'undefined' && typeof CloudService.pushLocalChange === 'function') {
      try { CloudService.pushLocalChange(kind, op, record); } catch (e) { console.warn('[DB] pushLocalChange:', e); }
    }
  }

  // Two products are the "same product" only when name, brand, barcode, country of origin, and mark match.
  function isSameProductIdentity(a, b) {
    const na = String(a.name || '').trim().toLowerCase();
    const nb = String(b.name || '').trim().toLowerCase();
    const ba = String(a.brandId || '').trim().toLowerCase();
    const bb = String(b.brandId || '').trim().toLowerCase();
    const bc = String(a.barcode || '').trim().toLowerCase();
    const bd = String(b.barcode || '').trim().toLowerCase();
    const ca = String(a.countryOfOrigin || '').trim().toLowerCase();
    const cb = String(b.countryOfOrigin || '').trim().toLowerCase();
    const ma = String(a.mark || '').trim().toLowerCase();
    const mb = String(b.mark || '').trim().toLowerCase();
    const ra = String(a.reference || '').trim().toLowerCase();
    const rb = String(b.reference || '').trim().toLowerCase();
    return na === nb && ba === bb && bc === bd && ca === cb && ma === mb && ra === rb;
  }

  // Returns the product (if any) that already holds the same canonical barcode
  // but with a different identity — i.e. a barcode that must not be reused.
  function _findBarcodeConflict(item) {
    const canon = canonBarcode(item.barcode);
    if (!canon) return null;
    const s = _scopeSnapshot();
    for (const p of _cache.products) {
      if (!_inScopeWith(s, p)) continue; // ignore products outside the active company
      if (p.id && item.id && p.id === item.id) continue;
      if (p.barcode && canonBarcode(p.barcode) === canon && !isSameProductIdentity(p, item)) {
        return p;
      }
    }
    return null;
  }

  // ===== MULTI-COMPANY HELPERS =====
  // The current company context comes from the active Auth session. A record is
  // `inScope` when: the row is global run-level data (no companyId), the active
  // scope is an unbound admin (no company entered), or the row belongs to the
  // active company. Once a company is entered the view is locked to that company
  // for every role (owner/admin included) — full isolation between companies.
  function _getCompanyId() {
    try {
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) {
        const fromAuth = Auth.getCompanyId ? (Auth.getCompanyId() || '') : '';
        const fromLs = localStorage.getItem('zmt_active_company') || '';
        return fromAuth || fromLs;
      }
    } catch (e) {}
    return localStorage.getItem('zmt_active_company') || '';
  }

  function _isAdminScope() {
    // When a user has entered a specific company, the view is ALWAYS locked to
    // that company — even for owner/admin/superadmin. This is what guarantees each
    // company's data (invoices, stock, suppliers, expenses, net account...) is
    // fully isolated: entering company B never shows company A's data.
    if (_hasEnteredCompany()) return false;
    try {
      if (typeof Auth !== 'undefined' && Auth.getRole && Auth.isLoggedIn && Auth.isLoggedIn()) {
        const r = Auth.getRole ? (Auth.getRole() || '') : '';
        return r === 'admin' || r === 'superadmin' || r === 'owner';
      }
    } catch (e) {}
    const role = localStorage.getItem('zmt_role') || '';
    return role === 'admin' || role === 'superadmin' || role === 'owner';
  }

  // True once a company has been explicitly entered (login company selection,
  // enterCompany, or any auth path that binds a companyId). While true the active
  // companyId is the sole data scope.
  function _hasEnteredCompany() {
    try {
      if (typeof Auth !== 'undefined' && Auth.getCompanyId && Auth.isLoggedIn && Auth.isLoggedIn()) {
        return !!Auth.getCompanyId();
      }
    } catch (e) {}
    return !!localStorage.getItem('zmt_active_company');
  }

  function _tagCompany(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (!obj.companyId) {
      const cid = _getCompanyId();
      if (cid) obj.companyId = cid;
    }
    return obj;
  }

  // The id of the "default" company — legacy/untagged records belong here and
  // nowhere else, so a second company never accidentally inherits old data.
  function _defaultCompanyId() {
    try {
      const def = _resolveDefaultCompany();
      return def ? def.id : '';
    } catch (e) { return ''; }
  }

  // A record is in scope when a company is active:
  //   - explicitly tagged to the active company, OR
  //   - untagged (legacy/run-level) AND the active company IS the default company.
  // An untagged record is NEVER shown in a non-default company, guaranteeing a
  // newly created company starts empty even before the backfill has run.
  function _inScope(rec) {
    return _inScopeWith(_scopeSnapshot(), rec);
  }

  // Scope snapshots capture the active company/store ONCE so hot loops that
  // test thousands of rows (barcode lookups, getProducts, LAN exports) stop
  // re-reading localStorage and re-resolving the default company per element.
  // On a 3.6k product database a single barcode scan used to perform roughly
  // 30k localStorage accesses purely for scope checks.
  //
  // The active id is validated against the companies actually stored on this
  // device. A stale zmt_active_company / session companyId (left behind by a
  // deleted company, or by a previous identity on a shared device) used to lock
  // every scope filter onto a company that owns no rows — which is exactly what
  // makes product cards render blank and invoices vanish. An unknown id now
  // falls back to the default company instead of hiding everything.
  function _resolveActiveCompanyId() {
    const raw = _getCompanyId();
    if (!raw) return '';
    const list = _cache.companies;
    if (!Array.isArray(list) || !list.length) return raw; // nothing to validate yet
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c && c.id === raw) return raw;
    }
    return ''; // unknown/deleted company → treat as unbound
  }

  function _scopeSnapshot() {
    const defId = _defaultCompanyId();
    const cid = _resolveActiveCompanyId() || defId; // never unbounded if companies exist
    return { cid, defId: cid ? defId : '', sid: _getStoreId() };
  }

  function _inScopeWith(s, rec) {
    if (!rec) return false;
    if (!s.cid) return true; // truly no companies at all (fresh or run-level)
    if (!rec.companyId) {
      // untagged legacy/run-level row is visible only in the default company —
      // never leaks into a second company.
      return s.cid === s.defId;
    }
    // tagged operational row belongs to exactly one company.
    return rec.companyId === s.cid;
  }

  function _scopeFilterWith(s, list) {
    if (!s.cid) return list; // truly no companies at all
    const cid = s.cid, defId = s.defId;
    return list.filter(x => {
      if (x && x.companyId) return x.companyId === cid;
      return cid === defId; // untagged legacy belongs to default only
    });
  }

  function _scopeFilter(list) {
    return _scopeFilterWith(_scopeSnapshot(), list);
  }

  // A product is visible when it is in the active company scope AND (if any store
  // is currently active) belongs to that store. Mirrors getProducts() so single-
  // record lookups (by id / barcode) never surface a product of another store of
  // the same company during search or sale.
  function _inProductScope(p) {
    return _inProductScopeWith(_scopeSnapshot(), p);
  }

  function _inProductScopeWith(s, p) {
    if (!_inScopeWith(s, p)) return false;
    if (!s.sid) return true;
    return !p.storeId || p.storeId === s.sid;
  }

  // Merge-save helper: replaces only the current company's records in a store
  // while leaving all other companies' data untouched.  Callers typically do
  //   const list = DB.getSuppliers(); // scoped to active company
  //   list[idx].balance += delta;
  //   DB.saveSuppliers(list);
  // Without this merge the old save* methods wiped the entire cache, destroying
  // other companies' records until the next page reload.
  function _mergeSave(key, scopedList) {
    const cid = _getCompanyId() || _defaultCompanyId();
    const defId = _defaultCompanyId();
    if (!cid) {
      _cache[key] = scopedList.slice();
    } else {
      _cache[key] = _cache[key].filter(r => {
        if (r.companyId && r.companyId !== cid) return true;
        if (!r.companyId && cid !== defId) return true;
        return false;
      }).concat(scopedList);
    }
    _rebuildIndex(key);
    _idbClear(key).then(() => _idbPut(key, _cache[key]));
  }

  // Normalize a storeCodes field into a clean array of trimmed non-empty codes
  // (even if it was provided as a comma/space separated string).
  function _normalizeStoreCodes(val) {
    if (Array.isArray(val)) {
      return val.map(x => String(x).trim()).filter(Boolean);
    }
    if (typeof val === 'string') {
      return val.split(/[\s,،]+/).map(x => x.trim()).filter(Boolean);
    }
    return [];
  }

  // Company legal/profile fields. Complete/empty missing string fields to ''.
  // Touching them in both add & update keeps old records upgrade-safe when DB_VERSION bumps.
  const _COMPANY_PROFILE_KEYS = ['storeName', 'phone', 'address', 'nis', 'nif', 'rcc', 'article'];
  function _normalizeCompanyProfile(cmp) {
    if (!cmp || typeof cmp !== 'object') return cmp;
    for (const k of _COMPANY_PROFILE_KEYS) {
      if (!(k in cmp)) cmp[k] = '';
      cmp[k] = (cmp[k] == null ? '' : String(cmp[k]));
    }
    return cmp;
  }

  // ===== PUBLIC API =====
  return {
    ready() { return _ready; },

    async waitForReady() {
      if (_ready) return;
      return new Promise(r => { const t = setInterval(() => { if (_ready) { clearInterval(t); r(); } }, 20); });
    },

    init,
    initProgressive,
    tryOfflineRestore,
    reportDataIntegrity: _reportDataIntegrity,
    lastImportReport() { return _lastImportReport; },

    // ===== PRODUCTS =====
    getProducts() {
      const s = _scopeSnapshot();
      const scoped = _scopeFilterWith(s, _cache.products);
      if (!s.sid) return scoped;
      return scoped.filter(p => !p.storeId || p.storeId === s.sid);
    },

    getProduct(id) {
      const p = _idx.products[id];
      if (!p) return null;
      return _inProductScopeWith(_scopeSnapshot(), p) ? p : null;
    },

    getProductByBarcode(code) {
      // One snapshot for the whole lookup: the index hits below are O(1), but a
      // miss used to fall back to a full scan that re-read localStorage for
      // every one of the ~3.6k products.
      const s = _scopeSnapshot();
      const variants = barcodeVariants(code);
      for (const v of variants) {
        const p = _idx.products['bc:' + v];
        if (p && _inProductScopeWith(s, p)) return p;
        const pn = _idx.products['bcn:' + v];
        if (pn && _inProductScopeWith(s, pn)) return pn;
      }
      const canon = variants[variants.length - 1];
      if (canon) {
        for (const p of _cache.products) {
          if (_inProductScopeWith(s, p) && p.barcode && canonBarcode(p.barcode) === canon) return p;
        }
      }
      return null;
    },

    findProductsByBarcode(code) {
      const canon = canonBarcode(code);
      if (!canon) return [];
      const s = _scopeSnapshot();
      return _cache.products.filter(p => _inProductScopeWith(s, p) && p.barcode && canonBarcode(p.barcode) === canon);
    },

    isSameProductIdentity(a, b) { return isSameProductIdentity(a, b); },

    // Add a product to stock following the barcode reuse rules:
    //  - barcode already held by a DIFFERENT product  -> { ok:false, conflict, existing }
    //  - same product + same buy/sell/wholesale price -> merge quantity into it (one row)
    //  - same product but different prices            -> separate stock row, same barcode
    //  - brand new barcode                            -> new product
    addOrMergeProduct(item) {
      const barcode = normBarcode(item.barcode);
      if (!barcode) return { ok: false, conflict: true, existing: null };

      const conflict = _findBarcodeConflict({ id: item.id, barcode, name: item.name, brandId: item.brandId });
      if (conflict) return { ok: false, conflict: true, existing: conflict };

      const candidates = this.findProductsByBarcode(barcode);
      const same = candidates.find(c => isSameProductIdentity(c, item)) || null;

      if (!same) {
        const prod = this.addProduct(Object.assign({}, item, { barcode }));
        return { ok: true, created: true, product: prod };
      }

      const samePrices =
        (parseFloat(same.buyPrice) || 0) === (parseFloat(item.buyPrice) || 0) &&
        (parseFloat(same.sellPrice) || 0) === (parseFloat(item.sellPrice) || 0) &&
        (parseFloat(same.wholesalePrice) || 0) === (parseFloat(item.wholesalePrice) || 0);

      // الفصل الذكي يشمل أيضاً تاريخ انتهاء الصلاحية: إذا اختلف التاريخ بين
      // المنتج الموجود والمنتج الوارد (وقيمة الواردة غير فارغة) يُفصلان كدفعتين
      // مختلفتين بدلاً من دمج الكميات، حتى لو تساوت الأسعار.
      // (عند انتهاء الصلاحية: نفس الهوية + نفس السعر + نفس التاريخ => دمج؛
      //  اختلاف التاريخ => فصل)
      const sameExpiry = (same.expiryDate || '') === (item.expiryDate || '');

      if (samePrices && sameExpiry) {
        // Decimal quantities: 0.25 kg + 0.5 kg = 0.75 kg (never parseInt).
        const incomingQty = Math.round(((parseFloat(item.quantity) || parseFloat(item.qty) || 0)) * 1e6) / 1e6;
        const changes = { quantity: Math.round(((same.quantity || 0) + incomingQty) * 1e6) / 1e6 };
        if (item.supplierId) changes.supplierId = item.supplierId;
        // A unit typed on the incoming row is only adopted when the existing
        // product has none yet (never silently rewrites a chosen unit).
        if (item.unit && !same.unit) {
          changes.unit = item.unit;
          if (item.unit === 'custom' && item.unitLabel) changes.unitLabel = item.unitLabel;
        }
        // العائلة ربط تصنيفي تنتقل مع المنتج عند الدمج (لا تدخل في الهوية).
        if (item.family != null && String(item.family).trim()) changes.family = String(item.family).trim();
        this.updateProduct(same.id, changes);
        return { ok: true, created: false, merged: true, product: Object.assign({}, same, changes) };
      }

      const prod = this.addProduct(Object.assign({}, item, { barcode }));
      return { ok: true, created: true, separate: true, product: prod };
    },

    getProductsByBrand(brandId) {
      const s = _scopeSnapshot();
      const scoped = _scopeFilterWith(s, _cache.products);
      return scoped.filter(p => p.brandId === brandId && (!s.sid || !p.storeId || p.storeId === s.sid));
    },

    addProduct(prod) {
      prod.id = _genId();
      prod.createdAt = Date.now();
      prod.updatedAt = Date.now();
      if (prod.barcode) prod.barcode = normBarcode(prod.barcode);
      _tagCompany(prod);
      const sid = _getStoreId();
      if (sid) prod.storeId = sid;
      _cache.products.push(prod);
      _indexSingle('products', prod);
      _queueWrite('products', prod);
      this.logAudit({ action: 'add', entity: 'product', entityId: prod.id, detail: prod.name || '' });
      return prod;
    },

    async addProductsBatch(prods, onProgress) {
      const sid = _getStoreId();
      const now = Date.now();
      const added = [];
      for (const prod of prods) {
        prod.id = _genId() + Math.random().toString(36).substr(2, 3);
        prod.createdAt = now;
        prod.updatedAt = now;
        if (prod.barcode) prod.barcode = normBarcode(prod.barcode);
        if (sid) prod.storeId = sid;
        _tagCompany(prod);
        _cache.products.push(prod);
        added.push(prod);
      }
      _rebuildIndex('products');
      const total = added.length;
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = added.slice(i, i + CHUNK_SIZE);
        await new Promise((resolve, reject) => {
          const tx = db.transaction('products', 'readwrite');
          const os = tx.objectStore('products');
          for (const item of chunk) os.put(item);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        if (onProgress) onProgress(Math.min(i + CHUNK_SIZE, total), total);
        if (i + CHUNK_SIZE < total) await new Promise(r => setTimeout(r, 0));
      }
      _triggerCloudSync();
      debounceAutoBackup();
      this.logAudit({ action: 'add', entity: 'product', detail: `${added.length} منتج (جماعي)` });
      return added;
    },

    updateProduct(id, changes) {
      const p = _idx.products[id];
      if (!p) {
        console.warn('[DB] updateProduct: product not found — save skipped', id);
        _notifyDbWarning('product_not_found', { id });
        return { ok: false, reason: 'not_found' };
      }
      // Use the SAME visibility predicate as getProducts()/getProduct() so that
      // "what the user sees is what the user can edit". A save that would be
      // silently dropped now warns and reports instead of pretending to succeed.
      const s = _scopeSnapshot();
      if (!_inProductScopeWith(s, p)) {
        console.warn('[DB] updateProduct: product out of active scope — save skipped', id, { productCompany: p.companyId, productStore: p.storeId, activeCompany: s.cid, activeStore: s.sid });
        _notifyDbWarning('product_out_of_scope', { id, productCompany: p.companyId, productStore: p.storeId, activeCompany: s.cid, activeStore: s.sid });
        return { ok: false, reason: 'scope', company: p.companyId, store: p.storeId };
      }
      this.logAudit({ action: 'update', entity: 'product', entityId: id, detail: p.name || '' });
      if (changes.barcode != null) {
        const newBar = normBarcode(changes.barcode);
        if (canonBarcode(newBar) !== canonBarcode(p.barcode)) {
          const check = {
            id,
            barcode: newBar,
            name: changes.hasOwnProperty('name') ? changes.name : p.name,
            brandId: changes.hasOwnProperty('brandId') ? changes.brandId : p.brandId,
          };
          const conflict = _findBarcodeConflict(check);
          if (conflict) return { ok: false, conflict: true, existing: conflict };
        }
        changes.barcode = newBar;
      }
      changes.updatedAt = Date.now();
      Object.assign(p, changes);
      _queueWrite('products', p);
      return p;
    },

    updateProductsBatch(updates) {
      const results = [];
      const skipped = [];
      const s = _scopeSnapshot();
      for (const { id, changes } of updates) {
        const p = _idx.products[id];
        if (!p || !_inScopeWith(s, p)) { skipped.push(id); continue; }
        changes.updatedAt = Date.now();
        Object.assign(p, changes);
        results.push(p);
      }
      if (skipped.length) {
        console.warn('[DB] updateProductsBatch: skipped ' + skipped.length + ' out-of-scope product(s)', skipped.slice(0, 10), { activeCompany: s.cid, activeStore: s.sid });
      }
      _rebuildIndex('products');
      _idbPut('products', results).then(() => {
        _triggerCloudSync();
        debounceAutoBackup();
      });
      this.logAudit({ action: 'update', entity: 'product', detail: `${updates.length} منتج (جماعي)` });
      return results;
    },

    deleteProduct(id) {
      const idx = _cache.products.findIndex(p => p.id === id);
      if (idx === -1) return false;
      const p = _cache.products[idx];
      if (!_inScope(p)) {
        console.warn('[DB] deleteProduct: product out of active scope — delete skipped', id, { productCompany: p.companyId, activeCompany: _getCompanyId() });
        return false;
      }
      this.logAudit({ action: 'delete', entity: 'product', entityId: id, detail: (p && p.name) || '' });
      _cache.products.splice(idx, 1);
      _indexRemove('products', p);
      _queueDelete('products', id);
      return true;
    },

    // ===== INVOICES =====
    getInvoices() {
      const sid = _getStoreId();
      const scoped = _scopeFilter(_cache.invoices);
      if (!sid) return scoped;
      return scoped.filter(inv => !inv.storeId || inv.storeId === sid);
    },

    getInvoice(id) {
      const inv = _idx.invoices[id];
      if (!inv) return null;
      return _inScope(inv) ? inv : null;
    },

    getInvoicesBySupplier(supplierId) {
      const sid = _getStoreId();
      return _scopeFilter(_cache.invoices).filter(inv => inv.supplierId === supplierId && (!sid || !inv.storeId || inv.storeId === sid));
    },

    addInvoice(inv, opts) {
      inv.id = _genId();
      inv.createdAt = Date.now();
      inv.invoiceNumber = opts && opts.payment ? this.getNextPaymentInvoiceNumber() : inv.type === 'sup_sale' ? this.getNextSupSaleNumber() : this.getNextInvoiceNumber(opts && opts.numberYear);
      _tagCompany(inv);
      const sid = _getStoreId();
      if (sid) inv.storeId = sid;
      _cache.invoices.push(inv);
      _rebuildIndex('invoices');
      _queueWrite('invoices', inv);
      this.logAudit({ action: 'add', entity: 'invoice', entityId: inv.id, detail: inv.invoiceNumber || '' });
      return inv;
    },

    // `year` is an explicit four-digit year used for the number prefix. It is
    // passed ONLY by the waybill-merge flow (which lets the user back-date the
    // consolidated sale invoice to the year of the chosen date). Every other
    // caller omits it and keeps today's year, exactly as before — including the
    // data-migration import, whose dates are historical strings.
    getNextInvoiceNumber(year) {
      const counter = (_cache.meta.nextInvoiceCounter || 0) + 1;
      _updateMeta('nextInvoiceCounter', counter);
      const y = (typeof year === 'number' && isFinite(year)) ? year : new Date().getFullYear();
      return `FACT-${y}-${String(counter).padStart(4, '0')}`;
    },

    getNextPaymentInvoiceNumber() {
      const counter = (_cache.meta.nextPaymentCounter || 0) + 1;
      _updateMeta('nextPaymentCounter', counter);
      const year = new Date().getFullYear();
      return `PAY-${year}-${String(counter).padStart(4, '0')}`;
    },

    getNextSupSaleNumber() {
      const counter = (_cache.meta.nextSupSaleCounter || 0) + 1;
      _updateMeta('nextSupSaleCounter', counter);
      const year = new Date().getFullYear();
      return `SELL-${year}-${String(counter).padStart(4, '0')}`;
    },

    // Net amount a supplier still owes us on a "sale to supplier" invoice after
    // it settled our existing debt to him (max(0, unpaid − debt we owed him)).
    // New invoices persist supNetDue/supDebtBefore; legacy ones are derived from
    // the supplier's live balance (balanceAfter = balanceBefore − onAccount).
    getSupSaleNetDue(inv) {
      if (!inv || inv.type !== 'sup_sale') return 0;
      const onAccount = Math.max(0, (inv.totalAmount || 0) - this.getInvoicePaidAmount(inv.id));
      if (typeof inv.supDebtBefore === 'number' && isFinite(inv.supDebtBefore)) {
        return Math.max(0, onAccount - Math.max(0, inv.supDebtBefore));
      }
      if (typeof inv.supNetDue === 'number' && isFinite(inv.supNetDue)) {
        return Math.max(0, Math.min(inv.supNetDue, onAccount));
      }
      let bal = 0;
      if (inv.supplierId) {
        try {
          const s = this.getSuppliers().find(x => x.id === inv.supplierId);
          bal = parseFloat(s && s.balance) || 0;
        } catch (e) {}
      }
      return Math.max(0, onAccount - Math.max(0, bal + onAccount));
    },

    updateInvoice(id, changes) {
      const inv = _idx.invoices[id];
      if (!inv) return null;
      if (!_inScope(inv)) return null;
      Object.assign(inv, changes);
      _queueWrite('invoices', inv);
      this.logAudit({ action: 'update', entity: 'invoice', entityId: id, detail: inv.invoiceNumber || '' });
      return inv;
    },

    deleteInvoice(id) {
      const idx = _cache.invoices.findIndex(inv => inv.id === id);
      if (idx === -1) return false;
      const inv = _cache.invoices[idx];
      if (!_inScope(inv)) return false;
      this.logAudit({ action: 'delete', entity: 'invoice', entityId: id, detail: (inv && inv.invoiceNumber) || '' });
      _cache.invoices.splice(idx, 1);
      _rebuildIndex('invoices');
      _queueDelete('invoices', id);
      return true;
    },

    // ===== BARCODE =====
    generateBarcode() {
      const code = String(_cache.meta.nextBarcode || 100000);
      _updateMeta('nextBarcode', (_cache.meta.nextBarcode || 100000) + 1);
      return code;
    },

    // ===== SUPPLIERS =====
    getSuppliers() { return _scopeFilter(_cache.suppliers); },

    saveSuppliers(list) {
      _mergeSave('suppliers', list);
      _triggerCloudSync();
      _emitStoreReplace('suppliers', _cache.suppliers);
    },

    // ===== PAYMENTS =====
    getPayments() { return _scopeFilter(_cache.payments); },

    savePayments(list) {
      _mergeSave('payments', list);
      _triggerCloudSync();
      _emitStoreReplace('payments', _cache.payments);
    },

    addPayment(pmt) {
      pmt.id = _genId();
      pmt.createdAt = pmt.createdAt || Date.now();
      _tagCompany(pmt);
      _cache.payments.push(pmt);
      _rebuildIndex('payments');
      _queueWrite('payments', pmt);
      this.logAudit({ action: 'add', entity: 'payment', entityId: pmt.id, detail: (pmt.note || pmt.method || '') });
      return pmt;
    },

    deletePayment(id) {
      const p = _cache.payments.find(p => p.id === id);
      if (!p || !_inScope(p)) return false;
      const idx = _cache.payments.indexOf(p);
      this.logAudit({ action: 'delete', entity: 'payment', entityId: id, detail: (p && (p.note || p.method)) || '' });
      _cache.payments.splice(idx, 1);
      _rebuildIndex('payments');
      _queueDelete('payments', id);
      return true;
    },

    getSupplierPayments(supplierId) {
      return _scopeFilter(_cache.payments).filter(p => p.supplierId === supplierId);
    },

    getInvoicePayments(invoiceId) {
      return _idx.payments['inv:' + invoiceId] || _cache.payments.filter(p => p.invoiceId === invoiceId);
    },

    getInvoicePaidAmount(invoiceId) {
      return this.getInvoicePayments(invoiceId).reduce((sum, p) => sum + p.amount, 0);
    },

    // Amount considered paid on an invoice = actual cash/CCP payment rows plus
    // any customer credit that was applied to it at sale time (inv.creditUsed).
    // Used by displays and "fully paid" checks so a credit-settled invoice is
    // counted as settled. Accepts an invoice object or an id.
    getInvoiceEffectivePaid(inv) {
      const invoice = typeof inv === 'string' ? this.getInvoice(inv) : inv;
      if (!invoice) return 0;
      return this.getInvoicePaidAmount(invoice.id) + (invoice.creditUsed || 0);
    },

    // Outstanding amount the party still has to pay in money, after deducting
    // any customer credit already applied (inv.creditUsed).
    getInvoiceRemaining(inv) {
      const invoice = typeof inv === 'string' ? this.getInvoice(inv) : inv;
      if (!invoice) return 0;
      return Math.max(0, (invoice.totalAmount || 0) - this.getInvoiceEffectivePaid(invoice));
    },

    // Sum of payment-voucher invoices (type 'payment') for a given party.
    // These vouchers settle balances without carrying sale/purchase value, so
    // reports and stats exclude them via this helper.
    getPaymentInvoiceTotal(opts) {
      opts = opts || {};
      return _scopeFilter(_cache.invoices).filter(inv =>
        inv.type === 'payment' &&
        (opts.customerId ? inv.customerId === opts.customerId : true) &&
        (opts.supplierId ? inv.supplierId === opts.supplierId : true)
      ).reduce((s, inv) => s + (inv.totalAmount || 0), 0);
    },

    getInvoicePaymentMethods(invoiceId) {
      let cash = 0, ccp = 0;
      this.getInvoicePayments(invoiceId).forEach(p => {
        const amt = p.amount || 0;
        if (p.method === 'ccp') ccp += amt;
        else if (p.method === 'mixed') {
          cash += (p.cashAmount || 0);
          ccp += (p.ccpAmount || 0);
        } else {
          cash += amt;
        }
      });
      return { cash, ccp };
    },

    reduceInvoicePayments(invoiceId, maxTotal) {
      const payments = this.getInvoicePayments(invoiceId);
      const sum = payments.reduce((s, p) => s + (p.amount || 0), 0);
      if (sum <= maxTotal) return;
      let excess = sum - maxTotal;
      const ordered = payments.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      for (let i = ordered.length - 1; i >= 0 && excess > 0; i--) {
        const p = ordered[i];
        const cut = Math.min(p.amount || 0, excess);
        p.amount = (p.amount || 0) - cut;
        excess -= cut;
      }
      const all = this.getPayments().filter(p => p.invoiceId !== invoiceId || (p.amount || 0) > 0);
      this.savePayments(all);
    },

    deletePaymentsByInvoice(invoiceId) {
      const toDelete = this.getInvoicePayments(invoiceId).map(p => p.id);
      _cache.payments = _cache.payments.filter(p => p.invoiceId !== invoiceId);
      _rebuildIndex('payments');
      for (const id of toDelete) _queueDelete('payments', id);
      this.logAudit({ action: 'delete', entity: 'payment', detail: `فاتورة ${invoiceId}` });
    },

    // ===== CUSTOMERS =====
    getCustomers() { return _scopeFilter(_cache.customers); },

    saveCustomers(list) {
      _mergeSave('customers', list);
      _triggerCloudSync();
      _emitStoreReplace('customers', _cache.customers);
    },

    addCustomer(c) {
      c.id = _genId();
      c.createdAt = Date.now();
      c.balance = 0;
      c.totalPurchases = 0;
      _tagCompany(c);
      _cache.customers.push(c);
      _rebuildIndex('customers');
      _queueWrite('customers', c);
      return c;
    },

    updateCustomer(id, changes) {
      const c = _idx.customers[id];
      if (!c || !_inScope(c)) return null;
      changes.updatedAt = Date.now();
      Object.assign(c, changes);
      _queueWrite('customers', c);
      return c;
    },

    deleteCustomer(id) {
      const c = _cache.customers.find(c => c.id === id);
      if (!c || !_inScope(c)) return false;
      const idx = _cache.customers.indexOf(c);
      _cache.customers.splice(idx, 1);
      _rebuildIndex('customers');
      _queueDelete('customers', id);
      return true;
    },

    getCustomer(id) {
      const c = _idx.customers[id];
      return (c && _inScope(c)) ? c : null;
    },

    getInvoicesByCustomer(customerId) {
      const sid = _getStoreId();
      return _scopeFilter(_cache.invoices).filter(inv => inv.customerId === customerId && (!sid || !inv.storeId || inv.storeId === sid));
    },

    getCustomerPayments(customerId) {
      return _scopeFilter(_cache.payments).filter(p => p.customerId === customerId);
    },

    // ===== EMPLOYEES =====
    getEmployees() { return _scopeFilter(_cache.employees || []); },

    saveEmployees(list) {
      _mergeSave('employees', list);
      _triggerCloudSync();
      _emitStoreReplace('employees', _cache.employees);
    },

    addEmployee(e) {
      e.id = _genId();
      e.createdAt = Date.now();
      e.updatedAt = e.createdAt;
      _tagCompany(e);
      (_cache.employees || (_cache.employees = [])).push(e);
      _rebuildIndex('employees');
      _queueWrite('employees', e);
      this.logAudit({ action: 'add', entity: 'employee', entityId: e.id, detail: e.name || '' });
      return e;
    },

    updateEmployee(id, changes) {
      const e = _idx.employees && _idx.employees[id];
      if (!e || !_inScope(e)) return null;
      changes.updatedAt = Date.now();
      Object.assign(e, changes);
      _rebuildIndex('employees');
      _queueWrite('employees', e);
      return e;
    },

    // Removes the employee plus every attendance row that belongs to them.
    // Salary payouts already recorded in `payments` are kept: financial history
    // must survive an employee being deleted.
    deleteEmployee(id) {
      const e = (_cache.employees || []).find(x => x.id === id);
      if (!e || !_inScope(e)) return false;
      _cache.employees.splice(_cache.employees.indexOf(e), 1);
      const rows = (_cache.attendance || []).filter(a => a && a.employeeId === id);
      if (rows.length) {
        _cache.attendance = _cache.attendance.filter(a => !(a && a.employeeId === id));
        for (const r of rows) _queueDelete('attendance', r.id);
      }
      _rebuildIndex('employees');
      _rebuildIndex('attendance');
      _queueDelete('employees', id);
      this.logAudit({ action: 'delete', entity: 'employee', entityId: id, detail: e.name || '' });
      return true;
    },

    getEmployee(id) {
      const e = _idx.employees && _idx.employees[id];
      return (e && _inScope(e)) ? e : null;
    },

    getEmployeeByBarcode(code) {
      if (!code) return null;
      const raw = String(code).trim();
      const direct = _idx.employees && _idx.employees['bc:' + raw];
      if (direct && _inScope(direct)) return direct;
      const canon = canonBarcode(raw);
      const e = _idx.employees && _idx.employees['bcn:' + canon];
      return (e && _inScope(e)) ? e : null;
    },

    // Uniqueness guard used before save: returns another employee already
    // holding this barcode (canonical compare), or null when the code is free.
    findEmployeeBarcodeConflict(code, ignoreId) {
      if (!code) return null;
      const canon = canonBarcode(String(code).trim());
      const list = this.getEmployees();
      for (const e of list) {
        if (ignoreId && e.id === ignoreId) continue;
        if (e.barcode && canonBarcode(String(e.barcode).trim()) === canon) return e;
      }
      return null;
    },

    // ===== ATTENDANCE =====
    getAttendanceRows() { return _scopeFilter(_cache.attendance || []); },

    getAttendance(employeeId, date) {
      const key = 'emp:' + employeeId + ':' + date;
      const list = (_idx.attendance && _idx.attendance[key]) || [];
      for (const a of list) if (_inScope(a)) return a;
      return null;
    },

    getAttendanceForDate(date) {
      return this.getAttendanceRows().filter(a => a.date === date);
    },

    getEmployeeAttendanceMonth(employeeId, year, month) {
      const prefix = String(year) + '-' + String(month).padStart(2, '0') + '-';
      return this.getAttendanceRows()
        .filter(a => a.employeeId === employeeId && a.date && a.date.indexOf(prefix) === 0)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    },

    // Create-or-update the single row of (employeeId, date). `changes` carries
    // inTs / outTs / manual / note — only the provided keys are written.
    upsertAttendance(employeeId, date, changes) {
      const existing = this.getAttendance(employeeId, date);
      if (existing) {
        Object.assign(existing, changes, { updatedAt: Date.now() });
        _rebuildIndex('attendance');
        _queueWrite('attendance', existing);
        return existing;
      }
      const row = {
        id: _genId(),
        employeeId,
        date,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        manual: false,
        ...changes,
      };
      _tagCompany(row);
      (_cache.attendance || (_cache.attendance = [])).push(row);
      _rebuildIndex('attendance');
      _queueWrite('attendance', row);
      return row;
    },

    updateAttendance(id, changes) {
      const a = (_cache.attendance || []).find(x => x.id === id);
      if (!a || !_inScope(a)) return null;
      changes.updatedAt = Date.now();
      Object.assign(a, changes);
      _rebuildIndex('attendance');
      _queueWrite('attendance', a);
      return a;
    },

    deleteAttendance(id) {
      const a = (_cache.attendance || []).find(x => x.id === id);
      if (!a || !_inScope(a)) return false;
      _cache.attendance.splice(_cache.attendance.indexOf(a), 1);
      _rebuildIndex('attendance');
      _queueDelete('attendance', id);
      return true;
    },

    // ===== DISCOUNTS =====
    getDiscounts() { return _scopeFilter(_cache.discounts); },

    saveDiscounts(list) {
      _mergeSave('discounts', list);
      _triggerCloudSync();
      _emitStoreReplace('discounts', _cache.discounts);
    },

    addDiscount(d) {
      d.id = _genId();
      d.createdAt = Date.now();
      _tagCompany(d);
      _cache.discounts.push(d);
      _queueWrite('discounts', d);
      return d;
    },

    deleteDiscount(id) {
      const idx = _cache.discounts.findIndex(d => d.id === id);
      if (idx === -1) return false;
      _cache.discounts.splice(idx, 1);
      _queueDelete('discounts', id);
      return true;
    },

    deleteDiscountsByInvoice(invoiceId) {
      const toDelete = _cache.discounts.filter(d => d.invoiceId === invoiceId).map(d => d.id);
      _cache.discounts = _cache.discounts.filter(d => d.invoiceId !== invoiceId);
      for (const id of toDelete) _queueDelete('discounts', id);
    },

    getInvoiceDiscounts(invoiceId) {
      return _cache.discounts.filter(d => d.invoiceId === invoiceId);
    },

    getInvoiceDiscountTotal(invoiceId) {
      return this.getInvoiceDiscounts(invoiceId).reduce((s, d) => s + (d.amount || 0), 0);
    },

    // ===== RETURNS =====
    getReturns() { return _scopeFilter(_cache.returns); },

    saveReturns(list) {
      _mergeSave('returns', list);
      _triggerCloudSync();
      _emitStoreReplace('returns', _cache.returns);
    },

    addReturn(r) {
      r.id = _genId();
      r.createdAt = Date.now();
      _tagCompany(r);
      _cache.returns.push(r);
      _queueWrite('returns', r);
      return r;
    },

    deleteReturnsByInvoice(invoiceId) {
      const toDelete = _cache.returns.filter(r => r.invoiceId === invoiceId).map(r => r.id);
      _cache.returns = _cache.returns.filter(r => r.invoiceId !== invoiceId);
      for (const id of toDelete) _queueDelete('returns', id);
    },

    // ===== SUPPLIER RETURNS (spoiled goods) =====
    getSupplierReturns() { return _scopeFilter(_cache.supplierReturns); },

    saveSupplierReturns(list) {
      _mergeSave('supplierReturns', list);
      _triggerCloudSync();
      _emitStoreReplace('supplierReturns', _cache.supplierReturns);
    },

    addSupplierReturn(r) {
      r.id = _genId();
      r.createdAt = Date.now();
      _tagCompany(r);
      _cache.supplierReturns.push(r);
      _queueWrite('supplierReturns', r);
      _pushLocalChange('supplierReturn', 'create', r);
      return r;
    },

    updateSupplierReturn(id, changes) {
      const r = _cache.supplierReturns.find(x => x.id === id);
      if (!r || !_inScope(r)) return null;
      changes.updatedAt = Date.now();
      Object.assign(r, changes);
      _queueWrite('supplierReturns', r);
      _pushLocalChange('supplierReturn', 'update', r);
      return r;
    },

    deleteSupplierReturn(id) {
      const r = _cache.supplierReturns.find(x => x.id === id);
      if (!r || !_inScope(r)) return false;
      const idx = _cache.supplierReturns.indexOf(r);
      _cache.supplierReturns.splice(idx, 1);
      _queueDelete('supplierReturns', id);
      _pushLocalChange('supplierReturn', 'delete', { id });
      return true;
    },

    // ===== PRODUCT HISTORY HELPERS =====
    // Purchase invoices (type supplier/purchase) containing the product. One row
    // per purchase line, with buy price and date.
    getProductPurchaseHistory(productId) {
      const sid = _getStoreId();
      const supNames = {};
      (_scopeFilter(_cache.suppliers) || []).forEach(s => { supNames[s.id] = s.name || ''; });
      const out = [];
      const invoices = _scopeFilter(_cache.invoices).filter(inv =>
        (inv.type === 'supplier' || inv.type === 'purchase') &&
        (!sid || !inv.storeId || inv.storeId === sid)
      );
      for (const inv of invoices) {
        const line = (inv.items || []).find(it => it.productId === productId);
        if (!line) continue;
        const supId = inv.supplierId || null;
        out.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber || '',
          date: inv.date || inv.createdAt || 0,
          supplierId: supId,
          supplierName: inv.supplierName || (supId ? (supNames[supId] || '') : ''),
          qty: line.qty || 0,
          price: line.price || 0,
          total: line.total || (line.qty || 0) * (line.price || 0),
        });
      }
      out.sort((a, b) => _normTs(b.date) - _normTs(a.date));
      return out;
    },

    // Sale invoices (type customer) containing the product. One row per sale line.
    getProductSalesHistory(productId) {
      const sid = _getStoreId();
      const custNames = {};
      (_scopeFilter(_cache.customers) || []).forEach(c => { custNames[c.id] = c.name || ''; });
      const out = [];
      const invoices = _scopeFilter(_cache.invoices).filter(inv =>
        inv.type === 'customer' &&
        (!sid || !inv.storeId || inv.storeId === sid)
      );
      for (const inv of invoices) {
        const line = (inv.items || []).find(it => it.productId === productId);
        if (!line) continue;
        const custId = inv.customerId || null;
        out.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber || '',
          date: inv.date || inv.createdAt || 0,
          customerId: custId,
          customerName: inv.customerName || (custId ? (custNames[custId] || '') : (inv.walkinName || '')),
          qty: line.qty || 0,
          price: line.price || 0,
          total: line.total || ((line.qty || 0) * (line.price || 0)),
          discount: line.lineDiscount || line.discount || 0,
        });
      }
      out.sort((a, b) => _normTs(b.date) - _normTs(a.date));
      return out;
    },

    // Combined returns count for a product: customer returns + supplier returns.
    getProductReturnsCount(productId) {
      const sid = _getStoreId();
      let n = 0;
      (this.getReturns() || []).forEach(r => {
        if (r.productId === productId && (!sid || !r.storeId || r.storeId === sid)) n++;
      });
      (this.getSupplierReturns() || []).forEach(r => {
        if (r.productId === productId && (!sid || !r.storeId || r.storeId === sid)) n++;
      });
      return n;
    },

    // ===== ORDERS =====
    getOrders() {
      const sid = _getStoreId();
      const scoped = _scopeFilter(_cache.orders);
      if (!sid) return scoped;
      return scoped.filter(o => !o.storeId || o.storeId === sid);
    },

    getOrder(id) {
      const o = _idx.orders[id];
      return (o && _inScope(o)) ? o : null;
    },

    addOrder(o) {
      o.id = _genId();
      o.createdAt = Date.now();
      _tagCompany(o);
      const sid = _getStoreId();
      if (sid) o.storeId = sid;
      _cache.orders.push(o);
      _rebuildIndex('orders');
      _queueWrite('orders', o);
      _pushLocalChange('order', 'create', o);
      return o;
    },

    updateOrder(id, changes) {
      const o = _idx.orders[id];
      if (!o || !_inScope(o)) return null;
      changes.updatedAt = Date.now();
      Object.assign(o, changes);
      _queueWrite('orders', o);
      _pushLocalChange('order', 'update', o);
      return o;
    },

    deleteOrder(id) {
      const idx = _cache.orders.findIndex(o => o.id === id);
      if (idx === -1) return false;
      _cache.orders.splice(idx, 1);
      _rebuildIndex('orders');
      _queueDelete('orders', id);
      _recordTombstone('orders', id, Date.now());
      _pushLocalChange('order', 'delete', { id });
      return true;
    },

    // Merge orders that were created/changed on the website into the local DB.
    // Inserts by id; updates a record only when the remote one is newer (updatedAt).
    // Never imports orders belonging to another store.
    mergeOrders(remoteOrders) {
      if (!Array.isArray(remoteOrders) || remoteOrders.length === 0) return 0;
      const sid = _getStoreId();
      let changed = 0;
      for (const r of remoteOrders) {
        if (!r || typeof r.id !== 'string' || !r.id) continue;
        if (sid && r.storeId && r.storeId !== sid) continue;
        // Never merge back an order the local user deleted (same tombstone guard
        // as applyOrderCommand) — otherwise the cloud backup still holding the
        // stale copy would resurrect it on every full sync.
        const tts = (_tombstones.orders && _tombstones.orders[r.id]) || 0;
        if (tts && _normTs(r.updatedAt || r.createdAt) <= tts) continue;
        const local = _idx.orders[r.id];
        if (!local) {
          const copy = Object.assign({}, r);
          if (sid && !copy.storeId) copy.storeId = sid;
          _cache.orders.push(copy);
          _queueWrite('orders', copy);
          changed++;
          continue;
        }
        const rTs = _normTs(r.updatedAt || r.createdAt);
        const lTs = _normTs(local.updatedAt || local.createdAt);
        if (rTs > lTs) {
          Object.assign(local, r);
          _queueWrite('orders', local);
          changed++;
        }
      }
      if (changed) _rebuildIndex('orders');
      return changed;
    },

    // Apply a command issued by the website (create/update/delete) to the local
    // DB. Idempotent: re-applying an already-applied command is a no-op, so the
    // desktop can safely re-scan the whole commands file on every poll.
    applyOrderCommand(op, cmd) {
      if (!cmd || typeof cmd.op !== 'string') return false;
      const orderId = cmd.orderId || (cmd.order && cmd.order.id);
      if (!orderId) return false;
      const sid = _getStoreId();
      if (sid && cmd.storeCode && cmd.storeCode !== sid) return false;

      if (op === 'create' || op === 'update') {
        const order = cmd.order;
        if (!order || typeof order.id !== 'string') return false;
        if (sid && order.storeId && order.storeId !== sid) return false;
        // A desktop-side delete is final: never resurrect an order the local
        // user deleted after the website created/updated it.
        const tts = (_tombstones.orders && _tombstones.orders[order.id]) || 0;
        if (tts && _normTs(order.updatedAt || order.createdAt) <= tts) return false;
        const local = _idx.orders[order.id];
        if (!local) {
          const copy = Object.assign({}, order);
          if (sid && !copy.storeId) copy.storeId = sid;
          _cache.orders.push(copy);
          _rebuildIndex('orders');
          _queueWrite('orders', copy);
          return true;
        }
        const rTs = _normTs(order.updatedAt || order.createdAt);
        const lTs = _normTs(local.updatedAt || local.createdAt);
        if (rTs > lTs) {
          Object.assign(local, order);
          _queueWrite('orders', local);
          return true;
        }
        return false;
      }

      if (op === 'delete') {
        // Record a tombstone so a stale create/update still sitting in the
        // website's command file cannot resurrect this order on a later poll.
        _recordTombstone('orders', orderId, Date.now());
        const local = _idx.orders[orderId];
        if (!local) return false;
        const idx = _cache.orders.findIndex(o => o.id === orderId);
        if (idx !== -1) {
          _cache.orders.splice(idx, 1);
          _rebuildIndex('orders');
          _queueDelete('orders', orderId);
          return true;
        }
        return false;
      }

      return false;
    },

    getLowStockProducts(threshold) {
      const t = threshold || 5;
      const s = _scopeSnapshot();
      return _scopeFilterWith(s, _cache.products).filter(p => p.quantity <= t && p.quantity > 0 && (!s.sid || !p.storeId || p.storeId === s.sid));
    },

    // ===== LOW STOCK THRESHOLD =====
    getLowStockThreshold() {
      const v = localStorage.getItem('zmt_low_stock_threshold');
      return v ? parseInt(v) : 5;
    },

    saveLowStockThreshold(val) {
      localStorage.setItem('zmt_low_stock_threshold', String(val));
    },

    // ===== EXPORT / IMPORT =====
    exportProductsCSV() {
      const products = this.getProducts();
      const brands = [...BRANDS.global, ...BRANDS.chinese];
      const header = 'name,barcode,brand,buyPrice,sellPrice,wholesalePrice,quantity,reference,countryOfOrigin,mark,storageLocation';
      const rows = products.map(p => {
        const brand = brands.find(b => b.id === p.brandId);
        return [
          `"${(p.name || '').replace(/"/g, '""')}"`,
          p.barcode || '',
          brand ? brand.name : (p.brandId || ''),
          p.buyPrice || 0,
          p.sellPrice || 0,
          p.wholesalePrice || 0,
          p.quantity || 0,
          `"${(p.reference || '').replace(/"/g, '""')}"`,
          `"${(p.countryOfOrigin || '').replace(/"/g, '""')}"`,
          `"${(p.mark || '').replace(/"/g, '""')}"`,
          `"${(p.storageLocation || '').replace(/"/g, '""')}"`,
        ].join(',');
      });
      return header + '\n' + rows.join('\n');
    },

    // ===== EXPORT TO EXCEL (.xlsx) WITH FULL STYLES =====
    // Same visual language as FACULITE: title line, meta line, styled blue
    // header row, thin borders on every cell, RTL view.
    exportProductsXLSX(includeBuyPrice, labels) {
      const products = this.getProducts();
      const brands = [...BRANDS.global, ...BRANDS.chinese];
      labels = labels || {};

      const headers = labels.headers && labels.headers.length ? labels.headers : [];
      const hs = headers.slice();
      if (!includeBuyPrice) hs.splice(8, 1);
      const totalCols = hs.length;

      const dateStr = new Date().toLocaleString('ar-EG-u-nu-latn');
      const aoa = [
        [(labels.title || 'ZMT PIECE') + (labels.storeName ? ' — ' + labels.storeName : '')],
        [labels.date + ': ' + dateStr,
         labels.count + ': ' + products.length,
         (labels.by || '') + (labels.user ? ': ' + labels.user : '')],
        [],
        hs,
      ];

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const brand = brands.find(b => b.id === p.brandId);
        const row = [
          p.name || '',
          p.barcode || '',
          brand ? brand.name : (p.brandId || ''),
          p.mark || '',
          p.reference || '',
          p.countryOfOrigin || '',
          p.storageLocation || '',
          p.quantity || 0,
          p.buyPrice || 0,
          p.sellPrice || 0,
          p.wholesalePrice || 0,
          p.expiryDate || '',
        ];
        if (!includeBuyPrice) row.splice(8, 1);
        aoa.push(row);
      }

      const totalCount = products.length;
      const totalQty = products.reduce((s, p) => s + (p.quantity || 0), 0);
      const totalBuy = products.reduce((s, p) => s + (p.buyPrice || 0), 0);
      const totalSell = products.reduce((s, p) => s + (p.sellPrice || 0), 0);
      const totalWhole = products.reduce((s, p) => s + (p.wholesalePrice || 0), 0);
      const totalRow = [labels.total || ''];
      for (let c = 1; c < totalCols; c++) totalRow.push('');
      totalRow[7] = totalQty;
      const priceValues = includeBuyPrice ? [totalBuy, totalSell, totalWhole] : [totalSell, totalWhole];
      for (let c = 0; c < priceValues.length; c++) totalRow[8 + c] = priceValues[c];
      aoa.push([]);
      aoa.push(totalRow);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, labels.sheetName || 'ZMT PIECE');

      const widths = includeBuyPrice
        ? [32, 16, 16, 14, 14, 16, 18, 10, 14, 14, 14, 13]
        : [32, 16, 16, 14, 14, 16, 18, 10, 14, 14, 13];
      if (totalCols) {
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }];
        ws['!cols'] = widths.slice(0, totalCols).map(w => ({ wch: w }));
      }
      ws['!views'] = [{ RTL: true }];

      const THIN = { style: 'thin', color: { rgb: '9DB6D8' } };
      const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
      const enc = r => c => XLSX.utils.encode_cell({ r: r, c: c });

      // Row 0: title
      {
        const cl = ws[enc(0)(0)];
        cl.s = cl.s || {};
        cl.s.font = { name: 'Calibri', sz: 14, bold: true, color: { rgb: '1F3864' } };
        cl.s.alignment = { horizontal: 'center', vertical: 'center' };
      }
      // Row 1: meta
      for (let c = 0; c < (aoa[1] || []).length; c++) {
        const cl = ws[enc(1)(c)];
        if (!cl) continue;
        cl.s = cl.s || {};
        cl.s.font = { name: 'Calibri', sz: 10, color: { rgb: '595959' } };
        cl.s.alignment = { horizontal: 'center', vertical: 'center' };
      }
      // Row 3: blue header
      for (let c = 0; c < totalCols; c++) {
        const cl = ws[enc(3)(c)];
        if (!cl) continue;
        cl.s = cl.s || {};
        cl.s.font = { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } };
        cl.s.fill = { patternType: 'solid', fgColor: { rgb: '2F5496' } };
        cl.s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
        cl.s.border = BORDER;
      }
      // Data rows
      for (let r = 4; r < 4 + products.length; r++) {
        const zebra = ((r - 4) % 2) === 1;
        for (let c = 0; c < totalCols; c++) {
          const cl = ws[enc(r)(c)];
          if (!cl) continue;
          cl.s = cl.s || {};
          cl.s.font = { name: 'Calibri', sz: 11 };
          if (zebra) cl.s.fill = { patternType: 'solid', fgColor: { rgb: 'EDF3FB' } };
          cl.s.alignment =
            c === 0 || c === 2
              ? { horizontal: 'left', vertical: 'center' }
              : { horizontal: 'center', vertical: 'center' };
          cl.s.border = BORDER;
          if (c === 7) cl.s.numFmt = '0';
          else if (c >= 8 && typeof cl.v === 'number') cl.s.numFmt = '#,##0.00';
        }
      }
      // Total row
      const tr = 5 + products.length;
      for (let c = 0; c < totalCols; c++) {
        const cl = ws[enc(tr)(c)];
        if (!cl) continue;
        cl.s = cl.s || {};
        cl.s.font = { name: 'Calibri', sz: 11, bold: true, color: { rgb: '1F3864' } };
        cl.s.fill = { patternType: 'solid', fgColor: { rgb: 'D9E2F3' } };
        cl.s.alignment = { horizontal: 'center', vertical: 'center' };
        cl.s.border = BORDER;
        if (c === 7) cl.s.numFmt = '0';
        else if (c >= 8 && typeof cl.v === 'number') cl.s.numFmt = '#,##0.00';
      }

      return wb;
    },

    importProductsCSV(csvText) {
      const clean = (csvText || '').replace(/^\ufeff/, '').replace(/\r/g, '');
      const lines = clean.trim().split('\n');
      if (lines.length < 2) return { count: 0, totalCost: 0 };
      const headerRow = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
      const dataRows = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        dataRows.push(lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim()));
      }
      return this.importProductsRows(headerRow, dataRows);
    },

    importProductsXLSX(buffer) {
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) return { count: 0, totalCost: 0 };
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const headerRow = (rows[0] || []).map(h => String(h == null ? '' : h).replace(/^"|"$/g, '').trim());
      return this.importProductsRows(headerRow, rows.slice(1));
    },

    // Shared importer for both CSV and Excel: headers are auto-matched using
    // Arabic / French / English aliases so files exported by any tool work.
    importProductsRows(headerRow, dataRows) {
      const norm = s => String(s == null ? '' : s).toLowerCase().replace(/^\ufeff/, '').replace(/\s+/g, '');
      const H = (headerRow || []).map(norm);
      const find = aliases => {
        for (let k = 0; k < aliases.length; k++) {
          const ix = H.indexOf(aliases[k]);
          if (ix !== -1) return ix;
        }
        return -1;
      };

      const nameIdx = find(['name','nom','designation','اسم','اسمالمنتج','المنتج','القطعة','اسمالقطعة']);
      const barIdx  = find(['barcode','code','codebarres','code-barres','الباركود','باركود']);
      const brandIdx = find(['brand','marque','العلامة','العلامةالتجارية','الماركة']);
      const buyIdx  = find(['buyprice','prixachat','prixdachat','سعرالشراء','سعرشراء','شراء']);
      const sellIdx = find(['sellprice','prixvente','سعرالبيع','سعربيع','بيع']);
      const wholeIdx = find(['wholesaleprice','wholesale','سعرالجملة','جملة','prixgros','prixdegros']);
      const qtyIdx  = find(['quantity','qty','stock','quantite','qte','الكمية','كمية','kmi']);
      const refIdx  = find(['reference','ref','المرجع','مرجع']);
      const countryIdx = find(['countryoforigin','country','pays','paysdorigine','بلد','بلدالمنشأ','المنشأ']);
      const markIdx = find(['mark','المارك','مارك']);
      const storageIdx = find(['storagelocation','storage','emplacement','التخزين','مكانالتخزين','موقعالتخزين','location']);
      const expIdx  = find(['expirydate','expiry','dateexpiration','expiration','تاريخالانتهاء','صلاحية']);
      if (nameIdx === -1) return { count: 0, totalCost: 0 };

      const brands = [...BRANDS.global, ...BRANDS.chinese];
      const str = (row, ix) => (ix !== -1 && row && row[ix] != null) ? String(row[ix]).replace(/^"|"$/g, '').trim() : '';
      const num = (row, ix) => { const s = str(row, ix); return s ? (parseFloat(s.replace(/,/g, '')) || 0) : 0; };
      const cnt = (row, ix) => { const n = parseInt(str(row, ix), 10); return isNaN(n) ? 1 : Math.max(0, n); };

      let count = 0;
      let totalCost = 0;
      const batchProducts = [];
      const productMeta = [];

      for (let i = 0; i < dataRows.length; i++) {
        const r = dataRows[i];
        if (!r || !str(r, nameIdx)) continue;
        const brandName = str(r, brandIdx);
        const brand = brandName ? brands.find(b => b.name.toLowerCase() === brandName.toLowerCase()) : null;
        const qty = cnt(r, qtyIdx);
        const buyPrice = num(r, buyIdx);
        count++;
        const sid = _getStoreId();
        const now = Date.now();
        const prod = {
          id: _genId() + Math.random().toString(36).substr(2, 3),
          name: str(r, nameIdx),
          barcode: str(r, barIdx) || this.generateBarcode(),
          brandId: brand ? brand.id : (brands[0]?.id || 'bmw'),
          buyPrice,
          sellPrice: num(r, sellIdx),
          wholesalePrice: num(r, wholeIdx),
          quantity: qty,
          reference: str(r, refIdx),
          countryOfOrigin: str(r, countryIdx),
          mark: str(r, markIdx),
          storageLocation: str(r, storageIdx),
          expiryDate: str(r, expIdx),
          createdAt: now,
          updatedAt: now,
        };
        if (sid) prod.storeId = sid;
        batchProducts.push(prod);
        productMeta.push({ prod, qty, buyPrice });
        totalCost += qty * buyPrice;
      }

      this.addProductsBatch(batchProducts);

      if (totalCost > 0) {
        const items = productMeta.map(p => ({
          productId: p.prod.id,
          barcode: p.prod.barcode,
          name: p.prod.name,
          qty: p.qty,
          price: p.buyPrice,
          total: p.qty * p.buyPrice,
        }));
        const inv = this.addInvoice({
          type: 'purchase',
          date: Date.now(),
          items,
          totalAmount: totalCost,
          paidAmount: totalCost,
          supplierId: null,
          isProvisional: false,
        });
        this.addPayment({
          invoiceId: inv.id,
          type: 'stock_purchase',
          amount: totalCost,
          note: `شراء مخزون (${count} منتج)`,
        });
      }

      return { count, totalCost, products: productMeta.map(p => p.prod) };
    },

    // ===== TRANSFERS =====
    getTransfers() { return _scopeFilter(_cache.transfers); },

    saveTransfers(list) {
      _mergeSave('transfers', list);
      _triggerCloudSync();
      _emitStoreReplace('transfers', _cache.transfers);
    },

    addTransfer(t) {
      t.id = _genId();
      t.createdAt = Date.now();
      _tagCompany(t);
      _cache.transfers.push(t);
      _queueWrite('transfers', t);
      return t;
    },

    // ===== RAW DB ACCESS =====
    _getRawData() {
      return {
        products: _cache.products,
        invoices: _cache.invoices,
        nextBarcode: _cache.meta.nextBarcode || 100000,
      };
    },

    async _saveRawData(d) {
      if (d.products) _cache.products = d.products;
      if (d.invoices) _cache.invoices = d.invoices;
      if (d.nextBarcode) _cache.meta.nextBarcode = d.nextBarcode;
      _rebuildAll();
      await _idbPut('products', _cache.products);
      await new Promise(r => setTimeout(r, 0));
      await _idbPut('invoices', _cache.invoices);
      await new Promise(r => setTimeout(r, 0));
      await _idbPut('meta', Object.entries(_cache.meta).map(([id, val]) => ({ id, val })));
      debounceAutoBackup();
      _triggerCloudSync();
      // products & invoices are broadcast as plain put-ops (no replace flag):
      // the LAN peer merges them last-write-wins instead of wholesale-wiping its
      // local rows, so a raw import here can never erase a peer's edited barcode.
      _emitLocalChange({ products: { put: _cache.products.slice() } });
      _emitLocalChange({ invoices: { put: _cache.invoices.slice() } });
    },

    // ===== LAN SYNC HOOKS =====
    onLocalChange(cb) {
      _localChangeListeners.push(cb);
    },

    // ===== AUTO-BACKUP CONTROL =====
    suppressAutoBackup(on) {
      suppressAutoBackup(on);
    },

    getTombstoneTs(store, id) {
      return (_tombstones[store] || {})[id] || 0;
    },

    // Apply remote changes received via LAN sync. Filters by storeId to
    // guarantee strict isolation between different stores. Accepts del entries
    // as either bare ids [id] or [{ id, ts }] so delete timestamps propagate.
    async applyRemoteChanges(ops) {
      if (!ops) return { dataChanged: false, metaOnly: false };
      const sid = _getStoreId();
      const cid = _getCompanyId();
      const accepted = [];
      // Result flags let consumers (LAN sync) distinguish user-visible data
      // movement from internal counter convergence — only the former warrants a
      // page re-render.
      let dataChanged = false;
      let metaOnly = false;
      for (const op of ops) {
        const store = op.store;
        // Lazy-init any store (e.g. 'companies' on a peer that never created one)
        // so remote records are applied instead of silently dropped.
        if (!Array.isArray(_cache[store])) _cache[store] = _cache[store] || [];
        if (!_cache[store]) continue;
        const putItems = Array.isArray(op.put) ? op.put : [];
        const rawDel = Array.isArray(op.del) ? op.del : [];
        const delEntries = rawDel.map(d => {
          if (d && typeof d === 'object') return { id: String(d.id), ts: Number(d.ts) || 0 };
          return { id: String(d), ts: 0 };
        }).filter(d => d.id && d.id !== 'undefined');
        const filtered = putItems.filter(item => {
          if (!item) return false;
          if ((store === 'products' || store === 'invoices') && sid && item.storeId && item.storeId !== sid) return false;
          // Company isolation: never let a LAN peer push records that belong to a
          // different company into this device's active view. Untagged (legacy)
          // records and run-level stores (companies/meta) are not filtered.
          if (store !== 'meta' && store !== 'companies' && cid && item.companyId && item.companyId !== cid) return false;
          return true;
        });
        if (store === 'meta') {
          const changedMeta = [];
          for (const item of filtered) {
            if (!item || !item.id) continue;
            if (item.id === 'nextBarcode' || item.id === 'nextInvoiceCounter' || item.id === 'nextPaymentCounter') {
              const cur = Number(_cache.meta[item.id]) || 0;
              const val = Number(item.val) || 0;
              if (val > cur) { _cache.meta[item.id] = val; changedMeta.push(item); }
            } else if (item.id === 'lanTombstones') {
              _mergeTombstones(item.val);
              _cache.meta.lanTombstones = _tombstones;
              changedMeta.push(item);
            } else if (_cache.meta[item.id] !== item.val) {
              _cache.meta[item.id] = item.val;
              changedMeta.push(item);
            }
          }
          for (const d of delEntries) delete _cache.meta[d.id];
          if (changedMeta.length || delEntries.length) {
            metaOnly = true;
            await _idbPut('meta', Object.entries(_cache.meta).map(([id, val]) => ({ id, val })));
          }
          continue;
        }
        let changed = false;
        let appliedItems = [];
        let storeDelIds = [];
        if (!_tombstones[store]) _tombstones[store] = {};
        const tmap = _tombstones[store];
        // products & invoices never accept a wholesale `replace` from a peer: a
        // restore/import/reset on the other device must never wipe locally-edited
        // rows (e.g. a freshly-edited barcode). They always walk the per-record
        // last-write-wins merge below instead.
        const useReplace = op.replace && store !== 'products' && store !== 'invoices';
        if (useReplace) {
          const newItems = [];
          for (const item of filtered) {
            const tts = tmap[item.id];
            if (tts && (!item.updatedAt || item.updatedAt <= tts)) continue;
            if (tts) { delete tmap[item.id]; _tombstonesDirty = true; }
            newItems.push(item);
          }
          const oldIds = new Set(_cache[store].map(x => x.id));
          const newIds = new Set(newItems.map(x => x.id));
          storeDelIds = [...oldIds].filter(id => !newIds.has(id));
          _cache[store] = newItems;
          appliedItems = newItems;
          _rebuildIndex(store);
          changed = true;
        } else {
          for (const item of filtered) {
            const tts = tmap[item.id];
            if (tts && (!item.updatedAt || item.updatedAt <= tts)) continue;
            if (tts) { delete tmap[item.id]; _tombstonesDirty = true; }
            const idx = _cache[store].findIndex(x => x.id === item.id);
            if (idx === -1) {
              _cache[store].push(item);
            } else {
              const existing = _cache[store][idx];
              // Last-write-wins by timestamp (updatedAt, falling back to createdAt).
              // A record arriving without any timestamp (legacy snapshot) never
              // overwrites a local record that carries timing info.
              const eTs = _normTs(existing.updatedAt || existing.createdAt);
              const iTs = _normTs(item.updatedAt || item.createdAt);
              if (eTs > 0 && iTs < eTs) continue;
              Object.assign(existing, item);
            }
            appliedItems.push(item);
            changed = true;
          }
          if (delEntries.length) {
            storeDelIds = delEntries.map(d => d.id);
            for (const d of delEntries) {
              const curTs = tmap[d.id] || 0;
              if (d.ts > curTs) { tmap[d.id] = d.ts; _tombstonesDirty = true; }
            }
            const delSet = new Set(delEntries.map(d => d.id));
            const before = _cache[store].length;
            _cache[store] = _cache[store].filter(x => !delSet.has(x.id));
            if (_cache[store].length !== before) changed = true;
          }
        }
        if (changed) {
          dataChanged = true;
          _rebuildIndex(store);
          accepted.push({ store, items: appliedItems, delIds: storeDelIds });
        }
      }
      if (_tombstonesDirty) await _persistTombstonesIdb();
      await _applyTombstoneSweep();
      for (const a of accepted) {
        if (a.items.length) await _idbPut(a.store, a.items);
        if (a.delIds.length) await _idbDelete(a.store, a.delIds);
      }
      if (accepted.length) {
        debounceAutoBackup();
        _triggerCloudSync();
      }
      return { dataChanged, metaOnly };
    },

    // ===== RESET =====
    async reset() {
      _cache.products = [];
      _cache.invoices = [];
      _cache.payments = [];
      _cache.customers = [];
      _cache.suppliers = [];
      _cache.discounts = [];
      _cache.returns = [];
      _cache.transfers = [];
      _cache.orders = [];
      _cache.supplierReturns = [];
      _cache.auditLogs = [];
      _dropAuditPending();
      _cache.companies = [];
      _cache.employees = [];
      _cache.attendance = [];
      _cache.meta = { nextBarcode: 100000, nextInvoiceCounter: 0, nextPaymentCounter: 0 };
      _tombstones = {};
      _cache.meta.lanTombstones = _tombstones;
      _tombstonesDirty = false;
      _rebuildAll();
      for (const s of STORES) await _idbClear(s);
      await _idbPut('meta', [{ id: 'nextBarcode', val: 100000 }, { id: 'nextInvoiceCounter', val: 0 }, { id: 'nextPaymentCounter', val: 0 }]);
      for (const s of STORES) _emitStoreReplace(s, s === 'meta' ? [{ id: 'nextBarcode', val: 100000 }, { id: 'nextInvoiceCounter', val: 0 }, { id: 'nextPaymentCounter', val: 0 }] : []);
    },

    // ===== BACKUP EXPORT / IMPORT =====
    exportAll() {
      return {
        products: _cache.products.slice(),
        invoices: _cache.invoices.slice(),
        payments: _cache.payments.slice(),
        customers: _cache.customers.slice(),
        suppliers: _cache.suppliers.slice(),
        discounts: _cache.discounts.slice(),
        returns: _cache.returns.slice(),
        transfers: _cache.transfers.slice(),
        orders: _cache.orders.slice(),
        supplierReturns: _cache.supplierReturns.slice(),
        companies: (_cache.companies || []).slice(),
        employees: (_cache.employees || []).slice(),
        attendance: (_cache.attendance || []).slice(),
        auditLogs: _cache.auditLogs.slice(),
        meta: { ..._cache.meta },
      };
    },

    // Incremental LAN delta: only records with updatedAt newer than `ts`, per
    // store. Used by the periodic reconciler between full snapshots so a 600k-row
    // device stops pushing the whole dataset every 10 seconds.
    exportDeltaSince(ts) {
      const since = Math.max(0, Number(ts) || 0);
      if (!since) return undefined;
      const out = {};
      for (const s of ['products', 'invoices', 'payments', 'customers', 'suppliers', 'discounts', 'returns', 'transfers', 'orders', 'supplierReturns', 'companies', 'employees', 'attendance']) {
        const rows = (_cache[s] || []).filter(r => r && r.updatedAt && r.updatedAt > since);
        if (rows.length) out[s] = rows;
      }
      return out;
    },

    // ===== AUDIT LOG API =====
    // Records a per-manager action. `manager`/`storeCode` are captured from the
    // active session automatically; `entry` carries { action, entity, entityId, detail }.
    logAudit(entry) {
      try {
        const user = (typeof Auth !== 'undefined' && Auth.getCurrentUser && Auth.getCurrentUser()) || null;
        const rec = {
          id: _genId(),
          ts: Date.now(),
          manager: user ? (user.username || user.name || '—') : '—',
          storeCode: (typeof Auth !== 'undefined' && Auth.getUserCode && Auth.getUserCode()) || '',
          action: (entry && entry.action) || 'unknown',
          entity: (entry && entry.entity) || '',
          entityId: entry && entry.entityId != null ? String(entry.entityId) : '',
          detail: (entry && entry.detail) || '',
        };
        const cid = _getCompanyId();
        if (cid) rec.companyId = cid;
        if (!_cache.auditLogs) _cache.auditLogs = [];
        _cache.auditLogs.push(rec);
        _auditPending.push(rec);
        while (_cache.auditLogs.length > AUDIT_CAP) {
          const gone = _cache.auditLogs.shift();
          if (gone && gone.id) _auditDropped.push(gone.id);
        }
        _scheduleAuditFlush();
        return rec;
      } catch (e) { return null; }
    },

    getAuditLogs() {
      const cid = _getCompanyId() || _defaultCompanyId();
      const defId = _defaultCompanyId();
      let list = (_cache.auditLogs || []).slice();
      if (cid) {
        list = list.filter(r => {
          if (r.companyId) return r.companyId === cid;
          return cid === defId;
        });
      }
      list.sort((a, b) => b.ts - a.ts);
      return list;
    },

    clearAuditLogs() {
      _cache.auditLogs = [];
      _dropAuditPending();
      try { if (db) _idbClear('auditLogs'); } catch (e) {}
    },

    async importAll(data, opts) {
      if (!data) return;
      if (!db) await openDB();
      const mapped = {};
      if (data.zmt_db) {
        const dbData = data.zmt_db;
        if (dbData.products) mapped.products = dbData.products;
        if (dbData.invoices) mapped.invoices = dbData.invoices;
        if (dbData.orders) mapped.orders = dbData.orders;
        if (dbData.nextBarcode) mapped.meta = { ...(mapped.meta || {}), nextBarcode: dbData.nextBarcode };
        if (dbData.nextInvoiceCounter) mapped.meta = { ...(mapped.meta || {}), nextInvoiceCounter: dbData.nextInvoiceCounter };
        if (dbData.nextPaymentCounter) mapped.meta = { ...(mapped.meta || {}), nextPaymentCounter: dbData.nextPaymentCounter };
      }
      if (data.products) mapped.products = data.products;
      if (data.invoices) mapped.invoices = data.invoices;
      if (data.orders) mapped.orders = data.orders;
      if (data.payments) mapped.payments = data.payments;
      if (data.customers) mapped.customers = data.customers;
      if (data.suppliers) mapped.suppliers = data.suppliers;
      if (data.discounts) mapped.discounts = data.discounts;
      if (data.returns) mapped.returns = data.returns;
      if (data.transfers) mapped.transfers = data.transfers;
      if (data.supplierReturns) mapped.supplierReturns = data.supplierReturns;
      if (data.companies) mapped.companies = data.companies;
      if (data.employees) mapped.employees = data.employees;
      if (data.attendance) mapped.attendance = data.attendance;
      if (data.zmt_companies) mapped.companies = data.zmt_companies;
      if (data.zmt_employees) mapped.employees = data.zmt_employees;
      if (data.zmt_attendance) mapped.attendance = data.zmt_attendance;
      if (data.zmt_customers) mapped.customers = data.zmt_customers;
      if (data.zmt_suppliers) mapped.suppliers = data.zmt_suppliers;
      if (data.zmt_payments) mapped.payments = data.zmt_payments;
      if (data.zmt_returns) mapped.returns = data.zmt_returns;
      if (data.zmt_supplierReturns) mapped.supplierReturns = data.zmt_supplierReturns;
      if (data.zmt_transfers) mapped.transfers = data.zmt_transfers;
      if (data.zmt_discounts) mapped.discounts = data.zmt_discounts;
      if (data.zmt_orders) mapped.orders = data.zmt_orders;
      if (data.meta) mapped.meta = { ...(mapped.meta || {}), ...data.meta };
      // Restore mode: by default the backup is the truth for the restored
      // company (backupWins); mergeNewer keeps the newest version of every row
      // so an automatic/background restore never clobbers fresher local edits.
      // Either way the merge is company-preserving: records belonging to OTHER
      // companies on this device are never wiped by restoring one company.
      const mergeNewer = !!(opts && opts.mergeNewer);
      const backupWins = !mergeNewer;
      // ===== Catastrophic-shrink guard =====
      // A truncated or empty backup (the "blank products / missing invoices"
      // symptom seen when a stale/partial cloud copy is imported) must never wipe
      // a healthy local store. For substantial operational stores we refuse an
      // incoming list that is empty while the local store holds rows, or that
      // shrinks the store by more than half. The local data is kept and the event
      // is reported (window event + lastImportReport) instead of vanishing.
      const _GUARD_STORES = ['products', 'invoices', 'orders', 'payments', 'customers', 'suppliers', 'discounts', 'returns', 'transfers', 'supplierReturns', 'employees', 'attendance'];
      const _guardOk = (key, incoming) => {
        if (!Array.isArray(incoming)) return true;
        const localLen = (_cache[key] || []).length;
        const incomingLen = incoming.length;
        if (localLen > 0 && incomingLen === 0) return false;
        if (localLen >= 25 && incomingLen < localLen * 0.5) return false;
        return true;
      };
      const guardSkipped = [];
      const _applyMerge = (key) => {
        if (!mapped[key]) return;
        if (_GUARD_STORES.indexOf(key) !== -1 && !_guardOk(key, mapped[key])) {
          guardSkipped.push({ store: key, local: (_cache[key] || []).length, incoming: mapped[key].length });
          return;
        }
        _cache[key] = _mergeCompaniesPreserving(_cache[key] || [], mapped[key], backupWins);
      };
      _applyMerge('products');
      _applyMerge('invoices');
      _applyMerge('orders');
      _applyMerge('payments');
      _applyMerge('customers');
      _applyMerge('suppliers');
      _applyMerge('discounts');
      _applyMerge('returns');
      _applyMerge('transfers');
      _applyMerge('supplierReturns');
      _applyMerge('employees');
      _applyMerge('attendance');
      // Companies merge is never guarded: a company list may legitimately shrink,
      // and company-preservation is handled inside _mergeCompaniesPreserving.
      if (mapped.companies) _cache.companies = _mergeCompaniesPreserving(_cache.companies || [], mapped.companies, backupWins);
      if (guardSkipped.length) {
        _lastImportReport = { ts: Date.now(), skipped: guardSkipped };
        console.warn('[DB] importAll: catastrophic-shrink guard kept local data for', guardSkipped);
        _notifyDbWarning('import_guard', { skipped: guardSkipped });
      }
      if (mapped.meta) Object.assign(_cache.meta, mapped.meta);
      if (_cache.meta.lanTombstones && typeof _cache.meta.lanTombstones === 'object') {
        _tombstones = _cache.meta.lanTombstones;
      } else {
        _tombstones = {};
        _cache.meta.lanTombstones = _tombstones;
      }
      _tombstonesDirty = false;
      if (!_cache.meta.nextBarcode) _cache.meta.nextBarcode = 100000;
      if (!_cache.meta.nextInvoiceCounter) _cache.meta.nextInvoiceCounter = 0;
    if (!_cache.meta.nextPaymentCounter) _cache.meta.nextPaymentCounter = 0;
      _rebuildAll();
      if (Array.isArray(_cache.meta)) {
        const flat = {};
        for (const entry of _cache.meta) flat[entry.id] = entry.val;
        _cache.meta = flat;
      }
      for (const s of STORES) {
        const items = s === 'meta' ? Object.entries(_cache.meta).map(([id, val]) => ({ id, val })) : _cache[s];
        await _idbClear(s);
        if (items.length) await _idbPut(s, items);
        await new Promise(r => setTimeout(r, 0));
      }
      debounceAutoBackup();
      _triggerCloudSync();
      for (const s of STORES) {
        const items = s === 'meta' ? Object.entries(_cache.meta).map(([id, val]) => ({ id, val })) : _cache[s];
        if (s === 'products' || s === 'invoices') {
          // Broadcast as plain put-ops (no replace flag) so a LAN peer merges
          // them last-write-wins instead of having its local rows wiped.
          _emitLocalChange({ [s]: { put: items.slice() } });
        } else {
          _emitStoreReplace(s, items);
        }
      }
    },

    // ===== COMPANIES (multi-company management) =====
    // Companies are run-level rows (companyId absent) so admins manage them from
    // any scope; each company's operational data is scoped by its companyId.
    getCompanies() {
      return (_cache.companies || _cache.companies === undefined ? _cache.companies || [] : _cache.companies)
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    },

    getCompany(id) {
      return (_cache.companies || []).find(c => c.id === id) || null;
    },

    // Deterministic default company (see _resolveDefaultCompany). Exposed so page
    // logic (settings general fields) binds to the same company DB uses for data.
    getDefaultCompany() {
      return _resolveDefaultCompany();
    },

    // Name of the store belonging to the active company: prefers the company's
    // own storeName (persisted per-company in the backup), falling back to its
    // name, then to the shared local store name.
    getActiveCompanyStoreName() {
      let cid = '';
      try { cid = (typeof Auth !== 'undefined' && Auth.getCompanyId) ? (Auth.getCompanyId() || '') : ''; } catch (e) {}
      const candidates = [];
      if (cid && (this.getCompany && this.getCompany(cid))) {
        const c = this.getCompany(cid);
        candidates.push(c.storeName || '', c.name || '');
      }
      let local = '';
      try { local = localStorage.getItem('zmt_store_name') || ''; } catch (e) {}
      const fallback = (typeof Auth !== 'undefined' && Auth.getStoreName) ? Auth.getStoreName() : '';
      for (const v of candidates.concat([local, fallback])) {
        if (v && String(v).trim()) return String(v).trim();
      }
      return '';
    },

    addCompany(cmp) {
      cmp = cmp || {};
      cmp.id = _genId();
      cmp.createdAt = Date.now();
      cmp.updatedAt = Date.now();
      if (!_cache.companies) _cache.companies = [];
      delete cmp.companyId; // companies are run-level
      cmp.storeCodes = _normalizeStoreCodes(cmp.storeCodes);
      _normalizeCompanyProfile(cmp);
      _cache.companies.push(cmp);
      _queueWrite('companies', cmp);
      // A new company must start empty: lock any still-untagged legacy records to
      // the DEFAULT company (not the just-created one) before returning.
      _backfillCompanyIds();
      this.logAudit({ action: 'add', entity: 'company', entityId: cmp.id, detail: cmp.name || '' });
      return cmp;
    },

    updateCompany(id, changes) {
      const c = (_cache.companies || []).find(x => x.id === id);
      if (!c) return null;
      Object.assign(c, (changes || {}));
      c.updatedAt = Date.now();
      delete c.companyId;
      if (changes && 'storeCodes' in changes) c.storeCodes = _normalizeStoreCodes(changes.storeCodes);
      _normalizeCompanyProfile(c);
      _queueWrite('companies', c);
      this.logAudit({ action: 'update', entity: 'company', entityId: c.id, detail: c.name || '' });
      return c;
    },

    // Companies allowed for a specific store/branch code. A company with no
    // storeCodes (empty/absent) is treated as global/allowed for every store.
    getCompaniesForStore(storeCode) {
      const code = String(storeCode || '').trim();
      return this.getCompanies().filter(c => {
        const sc = Array.isArray(c.storeCodes) ? c.storeCodes : _normalizeStoreCodes(c.storeCodes);
        if (!code) return true; // no store context (main/global) → all companies
        return sc.indexOf(code) !== -1; // branch → ONLY explicitly included
      });
    },

    removeCompany(id) {
      const before = (_cache.companies || []).length;
      _cache.companies = (_cache.companies || []).filter(c => c.id !== id);
      _queueDelete('companies', id);
      this.logAudit({ action: 'delete', entity: 'company', entityId: id });
      return _cache.companies.length !== before;
    },

    // Permanently remove every operational record belonging to a company. Used to
    // "reset" a company so it starts truly empty. Only touches records tagged to
    // that company — never other companies' data. Non-reversible (user confirms).
    async deleteCompanyData(id) {
      const operational = ['products', 'invoices', 'payments', 'customers', 'suppliers', 'discounts', 'returns', 'supplierReturns', 'orders', 'transfers', 'employees', 'attendance'];
      let removed = 0;
      for (const s of operational) {
        const arr = _cache[s];
        if (!Array.isArray(arr)) continue;
        const doomed = arr.filter(r => r && r.id != null && r.companyId === id);
        if (!doomed.length) continue;
        const ids = doomed.map(r => r.id);
        _cache[s] = arr.filter(r => !(r && r.id != null && r.companyId === id));
        _rebuildIndex(s);
        removed += ids.length;
        for (const did of ids) _queueDelete(s, did);
        if (db) { try { await _idbDelete(s, ids); } catch (e) { /* best effort */ } }
      }
      if (removed) this.logAudit({ action: 'delete', entity: 'company_data', entityId: id, detail: `${removed} record` });
      return removed;
    },

    getSummary() {
      return {
        products: _cache.products.length,
        invoices: _cache.invoices.length,
        customers: _cache.customers.length,
        suppliers: _cache.suppliers.length,
        payments: _cache.payments.length,
        returns: _cache.returns.length,
        supplierReturns: _cache.supplierReturns.length,
        discounts: _cache.discounts.length,
        orders: _cache.orders.length,
        employees: (_cache.employees || []).length,
        attendance: (_cache.attendance || []).length,
      };
    },

    // Public meta get/set. Stored inside DB.meta so values survive, sync over
    // LAN (buildSnapshot exports the whole meta) and cross backup/restore.
    setMeta(key, val) {
      _updateMeta(String(key), val);
    },

    getMeta(key) {
      return _cache.meta[String(key)];
    },

    // ===== FLUSH (call on app close) =====
    async flush() {
      await _immediateFlush();
    },
  };
})();

// DB initialisation handled by app.js for progressive loading
