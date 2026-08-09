const DB = (() => {
  const DB_NAME = 'zmt_piece_db';
  const DB_VERSION = 3;
  const STORES = ['products', 'invoices', 'payments', 'customers', 'suppliers', 'discounts', 'returns', 'transfers', 'orders', 'meta', 'supplierReturns'];
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
        if (p.barcode) _idx.products['bc:' + p.barcode] = p;
        if (p.storeId) {
          if (!_idx.products['sid:' + p.storeId]) _idx.products['sid:' + p.storeId] = [];
          _idx.products['sid:' + p.storeId].push(p);
        }
        if (p.brandId) {
          if (!_idx.products['br:' + p.brandId]) _idx.products['br:' + p.brandId] = [];
          _idx.products['br:' + p.brandId].push(p);
        }
        if (p.category) {
          if (!_idx.products['cat:' + p.category.toLowerCase()]) _idx.products['cat:' + p.category.toLowerCase()] = [];
          _idx.products['cat:' + p.category.toLowerCase()].push(p);
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
    }
  }

  function _rebuildAll() {
    for (const s of STORES) _rebuildIndex(s);
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
  let _autoBackupLastTs = 0;
  const AUTO_BACKUP_MIN_GAP = 5 * 60 * 1000;
  function debounceAutoBackup() {
    if (_autoBackupSuppressed) return;
    if (_autoBackupTimer) clearTimeout(_autoBackupTimer);
    _autoBackupTimer = setTimeout(tryAutoBackup, 30000);
  }

  function suppressAutoBackup(on) {
    _autoBackupSuppressed = !!on;
    if (on && _autoBackupTimer) { clearTimeout(_autoBackupTimer); _autoBackupTimer = 0; }
  }

  async function tryAutoBackup() {
    if (_autoBackupSuppressed) return;
    if (!window.electronAPI?.getAppDataPath) return;
    if (_cache.products.length === 0 && _cache.invoices.length === 0 && _cache.customers.length === 0 && _cache.suppliers.length === 0) return;
    const now = Date.now();
    if (now - _autoBackupLastTs < AUTO_BACKUP_MIN_GAP) {
      _autoBackupTimer = setTimeout(tryAutoBackup, AUTO_BACKUP_MIN_GAP - (now - _autoBackupLastTs));
      return;
    }
    _autoBackupLastTs = now;
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
      await window.electronAPI.writeFileBinary(filePath, window._zmtGzipToBase64(backup));
      try {
        const dirResult = await window.electronAPI.readDirectory(appPath);
        if (dirResult.success) {
          const autoFiles = dirResult.files.filter(f => f.startsWith('auto_')).sort();
          while (autoFiles.length > 10) {
            await window.electronAPI.deleteFile(`${appPath}\\${autoFiles.shift()}`);
          }
        }
      } catch {}
    } catch {}
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
      await importAll(data);
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
    if (_cache.meta.lanTombstones && typeof _cache.meta.lanTombstones === 'object') {
      _tombstones = _cache.meta.lanTombstones;
    } else {
      _tombstones = {};
      _cache.meta.lanTombstones = _tombstones;
    }
    _tombstonesDirty = false;
    _rebuildAll();
    _ready = true;
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
    if (_cache.meta.lanTombstones && typeof _cache.meta.lanTombstones === 'object') {
      _tombstones = _cache.meta.lanTombstones;
    } else {
      _tombstones = {};
      _cache.meta.lanTombstones = _tombstones;
    }
    _tombstonesDirty = false;
    _ready = true;
    if (onProgress) onProgress(null, STORES.length, STORES.length, 0);
  }

  function _genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
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

    // ===== PRODUCTS =====
    getProducts() {
      const sid = _getStoreId();
      if (!sid) return _cache.products;
      return _idx.products['sid:' + sid] || _cache.products.filter(p => !p.storeId || p.storeId === sid);
    },

    getProduct(id) { return _idx.products[id] || null; },

    getProductByBarcode(code) { return _idx.products['bc:' + code] || null; },

    getProductsByBrand(brandId) {
      const sid = _getStoreId();
      const pool = sid ? (_idx.products['sid:' + sid] || _cache.products) : _cache.products;
      return pool.filter(p => p.brandId === brandId && (!sid || !p.storeId || p.storeId === sid));
    },

    getProductsByBrandCategory(brandId, category) {
      const sid = _getStoreId();
      const pool = sid ? (_idx.products['sid:' + sid] || _cache.products) : _cache.products;
      return pool.filter(p => p.brandId === brandId && p.category === category && (!sid || !p.storeId || p.storeId === sid));
    },

    addProduct(prod) {
      prod.id = _genId();
      prod.createdAt = Date.now();
      prod.updatedAt = Date.now();
      const sid = _getStoreId();
      if (sid) prod.storeId = sid;
      _cache.products.push(prod);
      _rebuildIndex('products');
      _queueWrite('products', prod);
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
        if (sid) prod.storeId = sid;
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
      return added;
    },

    updateProduct(id, changes) {
      const p = _idx.products[id];
      if (!p) return null;
      changes.updatedAt = Date.now();
      Object.assign(p, changes);
      _queueWrite('products', p);
      return p;
    },

    updateProductsBatch(updates) {
      const results = [];
      for (const { id, changes } of updates) {
        const p = _idx.products[id];
        if (!p) continue;
        changes.updatedAt = Date.now();
        Object.assign(p, changes);
        results.push(p);
      }
      _rebuildIndex('products');
      _idbPut('products', results).then(() => {
        _triggerCloudSync();
        debounceAutoBackup();
      });
      return results;
    },

    deleteProduct(id) {
      const idx = _cache.products.findIndex(p => p.id === id);
      if (idx === -1) return false;
      _cache.products.splice(idx, 1);
      _rebuildIndex('products');
      _queueDelete('products', id);
      return true;
    },

    // ===== INVOICES =====
    getInvoices() {
      const sid = _getStoreId();
      if (!sid) return _cache.invoices;
      return _idx.invoices['sid:' + sid] || _cache.invoices.filter(inv => !inv.storeId || inv.storeId === sid);
    },

    getInvoice(id) { return _idx.invoices[id] || null; },

    getInvoicesBySupplier(supplierId) {
      const sid = _getStoreId();
      return _cache.invoices.filter(inv => inv.supplierId === supplierId && (!sid || !inv.storeId || inv.storeId === sid));
    },

    addInvoice(inv) {
      inv.id = _genId();
      inv.createdAt = Date.now();
      inv.invoiceNumber = this.getNextInvoiceNumber();
      const sid = _getStoreId();
      if (sid) inv.storeId = sid;
      _cache.invoices.push(inv);
      _rebuildIndex('invoices');
      _queueWrite('invoices', inv);
      return inv;
    },

    getNextInvoiceNumber() {
      const counter = (_cache.meta.nextInvoiceCounter || 0) + 1;
      _updateMeta('nextInvoiceCounter', counter);
      const year = new Date().getFullYear();
      return `FACT-${year}-${String(counter).padStart(4, '0')}`;
    },

    updateInvoice(id, changes) {
      const inv = _idx.invoices[id];
      if (!inv) return null;
      Object.assign(inv, changes);
      _queueWrite('invoices', inv);
      return inv;
    },

    deleteInvoice(id) {
      const idx = _cache.invoices.findIndex(inv => inv.id === id);
      if (idx === -1) return false;
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

    // ===== CATEGORIES =====
    getCategories() {
      return ['محرك', 'فرامل', 'كشافات', 'ناقل حركة', 'تعليق', 'كهرباء', 'تبريد', 'عوادم', 'داخلية', 'هيكل'];
    },

    // ===== SUPPLIERS =====
    getSuppliers() { return _cache.suppliers; },

    saveSuppliers(list) {
      _cache.suppliers = list;
      _rebuildIndex('suppliers');
      _idbClear('suppliers').then(() => _idbPut('suppliers', list));
      _triggerCloudSync();
      _emitStoreReplace('suppliers', list);
    },

    // ===== PAYMENTS =====
    getPayments() { return _cache.payments; },

    savePayments(list) {
      _cache.payments = list;
      _rebuildIndex('payments');
      _idbClear('payments').then(() => _idbPut('payments', list));
      _triggerCloudSync();
      _emitStoreReplace('payments', list);
    },

    addPayment(pmt) {
      pmt.id = _genId();
      pmt.createdAt = pmt.createdAt || Date.now();
      _cache.payments.push(pmt);
      _rebuildIndex('payments');
      _queueWrite('payments', pmt);
      return pmt;
    },

    deletePayment(id) {
      const idx = _cache.payments.findIndex(p => p.id === id);
      if (idx === -1) return false;
      _cache.payments.splice(idx, 1);
      _rebuildIndex('payments');
      _queueDelete('payments', id);
      return true;
    },

    getSupplierPayments(supplierId) {
      return _cache.payments.filter(p => p.supplierId === supplierId);
    },

    getInvoicePayments(invoiceId) {
      return _idx.payments['inv:' + invoiceId] || _cache.payments.filter(p => p.invoiceId === invoiceId);
    },

    getInvoicePaidAmount(invoiceId) {
      return this.getInvoicePayments(invoiceId).reduce((sum, p) => sum + p.amount, 0);
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
    },

    // ===== CUSTOMERS =====
    getCustomers() { return _cache.customers; },

    saveCustomers(list) {
      _cache.customers = list;
      _rebuildIndex('customers');
      _idbClear('customers').then(() => _idbPut('customers', list));
      _triggerCloudSync();
      _emitStoreReplace('customers', list);
    },

    addCustomer(c) {
      c.id = _genId();
      c.createdAt = Date.now();
      c.balance = 0;
      c.totalPurchases = 0;
      _cache.customers.push(c);
      _rebuildIndex('customers');
      _queueWrite('customers', c);
      return c;
    },

    updateCustomer(id, changes) {
      const c = _idx.customers[id];
      if (!c) return null;
      changes.updatedAt = Date.now();
      Object.assign(c, changes);
      _queueWrite('customers', c);
      return c;
    },

    deleteCustomer(id) {
      const idx = _cache.customers.findIndex(c => c.id === id);
      if (idx === -1) return false;
      _cache.customers.splice(idx, 1);
      _rebuildIndex('customers');
      _queueDelete('customers', id);
      return true;
    },

    getCustomer(id) { return _idx.customers[id] || null; },

    getInvoicesByCustomer(customerId) {
      const sid = _getStoreId();
      return _cache.invoices.filter(inv => inv.customerId === customerId && (!sid || !inv.storeId || inv.storeId === sid));
    },

    getCustomerPayments(customerId) {
      return _cache.payments.filter(p => p.customerId === customerId);
    },

    // ===== DISCOUNTS =====
    getDiscounts() { return _cache.discounts; },

    saveDiscounts(list) {
      _cache.discounts = list;
      _idbClear('discounts').then(() => _idbPut('discounts', list));
      _triggerCloudSync();
      _emitStoreReplace('discounts', list);
    },

    addDiscount(d) {
      d.id = _genId();
      d.createdAt = Date.now();
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
    getReturns() { return _cache.returns; },

    saveReturns(list) {
      _cache.returns = list;
      _idbClear('returns').then(() => _idbPut('returns', list));
      _triggerCloudSync();
      _emitStoreReplace('returns', list);
    },

    addReturn(r) {
      r.id = _genId();
      r.createdAt = Date.now();
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
    getSupplierReturns() { return _cache.supplierReturns; },

    saveSupplierReturns(list) {
      _cache.supplierReturns = list;
      _idbClear('supplierReturns').then(() => _idbPut('supplierReturns', list));
      _triggerCloudSync();
      _emitStoreReplace('supplierReturns', list);
    },

    addSupplierReturn(r) {
      r.id = _genId();
      r.createdAt = Date.now();
      _cache.supplierReturns.push(r);
      _queueWrite('supplierReturns', r);
      _pushLocalChange('supplierReturn', 'create', r);
      return r;
    },

    updateSupplierReturn(id, changes) {
      const r = _cache.supplierReturns.find(x => x.id === id);
      if (!r) return null;
      changes.updatedAt = Date.now();
      Object.assign(r, changes);
      _queueWrite('supplierReturns', r);
      _pushLocalChange('supplierReturn', 'update', r);
      return r;
    },

    deleteSupplierReturn(id) {
      const idx = _cache.supplierReturns.findIndex(r => r.id === id);
      if (idx === -1) return false;
      _cache.supplierReturns.splice(idx, 1);
      _queueDelete('supplierReturns', id);
      _pushLocalChange('supplierReturn', 'delete', { id });
      return true;
    },

    // ===== ORDERS =====
    getOrders() {
      const sid = _getStoreId();
      if (!sid) return _cache.orders;
      return _cache.orders.filter(o => !o.storeId || o.storeId === sid);
    },

    getOrder(id) { return _idx.orders[id] || null; },

    addOrder(o) {
      o.id = _genId();
      o.createdAt = Date.now();
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
      if (!o) return null;
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
      const sid = _getStoreId();
      return _cache.products.filter(p => p.quantity <= t && p.quantity > 0 && (!sid || !p.storeId || p.storeId === sid));
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
      const header = 'name,barcode,brand,category,buyPrice,sellPrice,wholesalePrice,quantity';
      const rows = products.map(p => {
        const brand = brands.find(b => b.id === p.brandId);
        return [
          `"${(p.name || '').replace(/"/g, '""')}"`,
          p.barcode || '',
          brand ? brand.name : (p.brandId || ''),
          p.category || '',
          p.buyPrice || 0,
          p.sellPrice || 0,
          p.wholesalePrice || 0,
          p.quantity || 0,
        ].join(',');
      });
      return header + '\n' + rows.join('\n');
    },

    importProductsCSV(csvText) {
      const clean = csvText.replace(/^\ufeff/, '').replace(/\r/g, '');
      const lines = clean.trim().split('\n');
      if (lines.length < 2) return { count: 0, totalCost: 0 };
      const header = lines[0].toLowerCase().split(',').map(h => h.trim());
      const nameIdx = header.indexOf('name');
      const barIdx = header.indexOf('barcode');
      const brandIdx = header.indexOf('brand');
      const catIdx = header.indexOf('category');
      const buyIdx = header.indexOf('buyprice');
      const sellIdx = header.indexOf('sellprice');
      let wholeIdx = header.indexOf('wholesaleprice');
      if (wholeIdx === -1) wholeIdx = header.indexOf('سعر الجملة');
      if (wholeIdx === -1) wholeIdx = header.indexOf('جملة');
      let qtyIdx = header.indexOf('quantity');
      if (qtyIdx === -1) qtyIdx = header.indexOf('qty');
      if (qtyIdx === -1) qtyIdx = header.indexOf('stock');
      if (qtyIdx === -1) qtyIdx = header.indexOf('كمية');
      if (qtyIdx === -1) qtyIdx = header.indexOf('الكمية');
      if (nameIdx === -1) return { count: 0, totalCost: 0 };

      const brands = [...BRANDS.global, ...BRANDS.chinese];
      let count = 0;
      let totalCost = 0;
      const batchProducts = [];
      const productMeta = [];

      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
        if (!vals[nameIdx]) continue;
        const brandName = vals[brandIdx] || '';
        const brand = brands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
        const qty = parseInt(vals[qtyIdx]) || 1;
        const buyPrice = parseFloat(vals[buyIdx]) || 0;
        count++;
        const sid = _getStoreId();
        const now = Date.now();
        const prod = {
          id: _genId() + Math.random().toString(36).substr(2, 3),
          name: vals[nameIdx],
          barcode: vals[barIdx] || this.generateBarcode(),
          brandId: brand ? brand.id : (brands[0]?.id || 'bmw'),
          category: vals[catIdx] || 'محرك',
          buyPrice,
          sellPrice: parseFloat(vals[sellIdx]) || 0,
          wholesalePrice: wholeIdx !== -1 ? (parseFloat(vals[wholeIdx]) || 0) : 0,
          quantity: qty,
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
          note: `شراء مخزون عبر CSV (${count} منتج)`,
        });
      }

      return { count, totalCost, products: productMeta.map(p => p.prod) };
    },

    // ===== TRANSFERS =====
    getTransfers() { return _cache.transfers; },

    saveTransfers(list) {
      _cache.transfers = list;
      _idbClear('transfers').then(() => _idbPut('transfers', list));
      _triggerCloudSync();
      _emitStoreReplace('transfers', list);
    },

    addTransfer(t) {
      t.id = _genId();
      t.createdAt = Date.now();
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
      _emitStoreReplace('products', _cache.products);
      _emitStoreReplace('invoices', _cache.invoices);
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
      if (!ops) return;
      const sid = _getStoreId();
      const accepted = [];
      for (const op of ops) {
        const store = op.store;
        if (!_cache[store]) continue;
        const putItems = Array.isArray(op.put) ? op.put : [];
        const rawDel = Array.isArray(op.del) ? op.del : [];
        const delEntries = rawDel.map(d => {
          if (d && typeof d === 'object') return { id: String(d.id), ts: Number(d.ts) || 0 };
          return { id: String(d), ts: 0 };
        }).filter(d => d.id && d.id !== 'undefined');
        const filtered = putItems.filter(item => {
          if ((store === 'products' || store === 'invoices') && sid && item.storeId && item.storeId !== sid) return false;
          return true;
        });
        if (store === 'meta') {
          const changedMeta = [];
          for (const item of filtered) {
            if (!item || !item.id) continue;
            if (item.id === 'nextBarcode' || item.id === 'nextInvoiceCounter') {
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
            await _idbPut('meta', Object.entries(_cache.meta).map(([id, val]) => ({ id, val })));
          }
          continue;
        }
        let changed = false;
        let appliedItems = [];
        let storeDelIds = [];
        if (!_tombstones[store]) _tombstones[store] = {};
        const tmap = _tombstones[store];
        if (op.replace) {
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
              if (existing.updatedAt && item.updatedAt && item.updatedAt < existing.updatedAt) continue;
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
      _cache.meta = { nextBarcode: 100000, nextInvoiceCounter: 0 };
      _tombstones = {};
      _cache.meta.lanTombstones = _tombstones;
      _tombstonesDirty = false;
      _rebuildAll();
      for (const s of STORES) await _idbClear(s);
      await _idbPut('meta', [{ id: 'nextBarcode', val: 100000 }, { id: 'nextInvoiceCounter', val: 0 }]);
      for (const s of STORES) _emitStoreReplace(s, s === 'meta' ? [{ id: 'nextBarcode', val: 100000 }, { id: 'nextInvoiceCounter', val: 0 }] : []);
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
        meta: { ..._cache.meta },
      };
    },

    async importAll(data) {
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
      if (data.zmt_customers) mapped.customers = data.zmt_customers;
      if (data.zmt_suppliers) mapped.suppliers = data.zmt_suppliers;
      if (data.zmt_payments) mapped.payments = data.zmt_payments;
      if (data.zmt_returns) mapped.returns = data.zmt_returns;
      if (data.zmt_supplierReturns) mapped.supplierReturns = data.zmt_supplierReturns;
      if (data.zmt_transfers) mapped.transfers = data.zmt_transfers;
      if (data.zmt_discounts) mapped.discounts = data.zmt_discounts;
      if (data.zmt_orders) mapped.orders = data.zmt_orders;
      if (data.meta) mapped.meta = { ...(mapped.meta || {}), ...data.meta };
      if (mapped.products) _cache.products = mapped.products;
      if (mapped.invoices) _cache.invoices = mapped.invoices;
      if (mapped.payments) _cache.payments = mapped.payments;
      if (mapped.customers) _cache.customers = mapped.customers;
      if (mapped.suppliers) _cache.suppliers = mapped.suppliers;
      if (mapped.discounts) _cache.discounts = mapped.discounts;
      if (mapped.returns) _cache.returns = mapped.returns;
      if (mapped.transfers) _cache.transfers = mapped.transfers;
      if (mapped.orders) _cache.orders = mapped.orders;
      if (mapped.supplierReturns) _cache.supplierReturns = mapped.supplierReturns;
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
        _emitStoreReplace(s, items);
      }
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
      };
    },

    // ===== FLUSH (call on app close) =====
    async flush() {
      await _immediateFlush();
    },
  };
})();

// DB initialisation handled by app.js for progressive loading
