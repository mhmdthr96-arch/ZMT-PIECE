// ============================================================
// ZMT Cloud Service - Supabase Integration
// ============================================================

const CloudService = (() => {
  let client = null;
  const BUCKET = 'zmt-backups';
  let _syncTimer = null;
  let _commandTimer = null;
  let _lastSyncHash = '';
  const COMMAND_POLL_MS = 12000;

  // ===== HARDCODED SUPABASE CREDENTIALS (Developer Only) =====
  const SUPABASE_URL = 'https://dzqiybhpevqoolsmatat.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_8dlWp7k7vDyZ2CZxa0kG8w_WRN_3yGZ';

  function getConfig() {
    return { url: SUPABASE_URL, key: SUPABASE_KEY };
  }

  function saveConfig(cfg) {
    // No-op: credentials are hardcoded
  }

  function getClient() {
    if (client) return client;
    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      client._url = SUPABASE_URL;
      return client;
    } catch (e) {
      console.error('[Cloud] Supabase init error:', e);
      return null;
    }
  }

  // Supabase serves objects with `Cache-Control: public, max-age=3600` by
  // default, and Chromium's HTTP cache honors it for up to an hour. That made
  // the desktop poll a stale command/backup file and miss website changes
  // (e.g. an order deleted on the website kept showing in the program). This
  // helper bypasses the HTTP cache with a unique cache-busting query string so
  // every poll/merge reads the live object.
  async function _downloadFresh(path) {
    const url = SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path + '?ts=' + Date.now();
    const resp = await fetch(url, {
      cache: 'no-store',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    });
    if (!resp.ok) throw new Error('storage download failed: ' + resp.status + ' ' + path);
    return await resp.blob();
  }

  function getStoreCode() {
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      return Auth.getUserCode() || '';
    }
    return localStorage.getItem('zmt_store_code') || '';
  }

  function getStoreType() {
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      return Auth.getStoreType();
    }
    return localStorage.getItem('zmt_store_type') || 'main';
  }

  function getParentCode() {
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      return Auth.getParentCode();
    }
    return localStorage.getItem('zmt_parent_code') || '';
  }

  function generateStoreCode() {
    let code = '';
    for (let i = 0; i < 10; i++) code += Math.floor(Math.random() * 10);
    return code;
  }

  function getBackupPath() {
    const type = getStoreType();
    const code = getStoreCode();
    if (type === 'branch') {
      const parent = getParentCode() || code;
      return `${parent}/${code}_backup.json`;
    }
    return `${code}/${code}_backup.json`;
  }

  // A device configured as a LAN sub server never sends data to the cloud:
  // only the location's LAN main server uploads (the sub reaches the cloud
  // through the main server's backups after LAN sync).
  function isLanSubDevice() {
    return localStorage.getItem('zmt_lan_role') === 'sub';
  }

  function getMainBackupPath() {
    const code = getStoreCode();
    return `${code}/${code}_backup.json`;
  }

  function getCommandsPath() {
    const type = getStoreType();
    const code = getStoreCode();
    if (type === 'branch') {
      const parent = getParentCode() || code;
      return `${parent}/${code}_commands.json`;
    }
    return `${code}/${code}_commands.json`;
  }

  // Delta-push file: the desktop appends order / supplier-return changes here so
  // the website can merge them into its read responses within seconds — without
  // waiting for (or triggering) a full backup upload.
  function getDesktopCommandsPath() {
    const type = getStoreType();
    const code = getStoreCode();
    if (type === 'branch') {
      const parent = getParentCode() || code;
      return `${parent}/${code}_desktop_commands.json`;
    }
    return `${code}/${code}_desktop_commands.json`;
  }

  function isStoreConfigured() {
    return !!getStoreCode();
  }

  function isCloudConnected() {
    if (typeof Auth !== 'undefined') {
      return Auth.isLoggedIn();
    }
    return !!getStoreCode();
  }

  const _EXCLUDE_KEYS = ['zmt_auth_user', 'zmt_store_code', 'zmt_store_type', 'zmt_parent_code', 'zmt_cloud_autosync', 'zmt_cloud_autosync_interval', 'zmt_cloud_last_sync'];

  function collectAllData() {
    const sid = getStoreCode();
    const dbExport = DB.exportAll();
    const data = {};
    let products = dbExport.products;
    let invoices = dbExport.invoices;
    let orders = dbExport.orders;
    if (sid) {
      products = products.filter(p => !p.storeId || p.storeId === sid);
      invoices = invoices.filter(inv => !inv.storeId || inv.storeId === sid);
      orders = (orders || []).filter(o => !o.storeId || o.storeId === sid);
    }
    data.zmt_db = {
      products,
      invoices,
      orders,
      nextBarcode: dbExport.meta.nextBarcode || 100000,
      nextInvoiceCounter: dbExport.meta.nextInvoiceCounter || 0,
    };
    data.zmt_customers = dbExport.customers;
    data.zmt_suppliers = dbExport.suppliers;
    data.zmt_payments = dbExport.payments;
    data.zmt_returns = dbExport.returns;
    data.zmt_supplierReturns = dbExport.supplierReturns;
    data.zmt_transfers = dbExport.transfers;
    data.zmt_discounts = dbExport.discounts;
    data.zmt_orders = orders;
    const settingsKeys = [
      'zmt_store_name', 'zmt_store_address', 'zmt_store_phone',
      'zmt_tva_rate', 'zmt_timbre_enabled', 'zmt_timbre_rate',
      'zmt_invoice_prefix', 'zmt_next_invoice', 'zmt_low_stock_threshold',
    ];
    for (const k of settingsKeys) {
      const v = localStorage.getItem(k);
      if (v !== null) {
        try { data[k] = JSON.parse(v); } catch { data[k] = v; }
      }
    }
    const storeCode = getStoreCode();
    if (storeCode) {
      const usersKey = 'zmt_users_' + storeCode;
      const metaKey = 'zmt_users_meta_' + storeCode;
      const users = localStorage.getItem(usersKey);
      const meta = localStorage.getItem(metaKey);
      if (users) { try { data[usersKey] = JSON.parse(users); } catch { data[usersKey] = users; } }
      if (meta) { try { data[metaKey] = JSON.parse(meta); } catch { data[metaKey] = meta; } }
    }
    return data;
  }

  function hasData() {
    const summary = DB.getSummary();
    return summary.products > 0 || summary.invoices > 0 || summary.customers > 0 || summary.suppliers > 0 || summary.orders > 0;
  }

  function dataHash(data) {
    try {
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash |= 0;
      }
      return String(hash);
    } catch { return ''; }
  }

  async function ensureBucket() {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    try {
      const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
      if (listErr) {
        console.warn('[Cloud] listBuckets error:', listErr.message);
      }
      const exists = buckets?.some(b => b.name === BUCKET);
      if (exists) return;

      const { error } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ['application/json'],
      });
      if (error && !error.message?.includes('already exists')) {
        console.warn('[Cloud] createBucket:', error.message);
      }
    } catch (e) {
      console.warn('[Cloud] ensureBucket error:', e.message);
    }
  }

  async function uploadBackup(data) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    // ===== Apply website commands (create/update/delete) issued via the site =====
    // The website writes orders to the same cloud backup file AND to a small
    // per-store commands file. Applying the commands first guarantees website
    // deletes are honored and that the upload below never resurrects them.
    // Run before the no-data early return so website orders still reach the
    // desktop even when the local DB is (still) empty.
    try {
      await applyRemoteCommands();
    } catch (e) {
      console.warn('[Cloud] apply website commands skipped:', e.message);
    }

    if (!hasData()) return { success: true, skipped: true, reason: 'no_data' };

    // ===== Merge website orders into the local DB before uploading =====
    // Safety net for orders created/updated on the website: pull the cloud copy
    // back in first so the desktop and the website stay in sync.
    try {
      const own = await downloadBackup();
      const remoteOrders =
        (own && own.data && (own.data.zmt_orders || (own.data.zmt_db && own.data.zmt_db.orders))) || [];
      if (Array.isArray(remoteOrders) && remoteOrders.length && typeof DB.mergeOrders === 'function') {
        DB.mergeOrders(remoteOrders);
      }
    } catch (e) {
      // No backup yet or network hiccup: keep uploading local data as-is.
      console.warn('[Cloud] merge website orders skipped:', e.message);
    }

    if (!data) data = collectAllData();

    const hash = dataHash(data);
    if (hash === _lastSyncHash) return { success: true, skipped: true };

    // LAN sub devices still pull website commands/orders (above) but never
    // upload: only the location's LAN main server writes to the cloud.
    if (isLanSubDevice()) return { success: true, skipped: true, reason: 'lan_sub' };

    await ensureBucket();

    const path = getBackupPath();
    const payload = {
      version: 2,
      storeCode: getStoreCode(),
      storeType: getStoreType(),
      parentCode: getParentCode(),
      createdAt: new Date().toISOString(),
      storeName: localStorage.getItem('zmt_store_name') || '',
      data,
    };

    // Re-apply the website command queue one last time, immediately before the
    // write. The website appends a command BEFORE rewriting its backup, so any
    // change committed during this sync is already reflected here and the blind
    // full-file upload below never resurrects deleted orders or drops updates.
    try {
      await applyRemoteCommands();
    } catch (e) {
      console.warn('[Cloud] final applyRemoteCommands skipped:', e.message);
    }

    // Backups are gzip-compressed to keep the free Supabase tier under quota.
    const blob = window._zmtGzipBlob(payload);

    // Atomic upsert: NEVER remove-then-upload, otherwise a concurrent website
    // write can be lost in the gap between remove and upload.
    // The client uploads Blobs via FormData, so the Blob's own type is what the
    // server validates; this contentType option is ignored for Blob bodies.
    // 'application/gzip' is whitelisted on the zmt-backups bucket.
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: 'application/gzip',
      upsert: true,
      cacheControl: 'no-cache',
    });

    if (error) throw error;

    _lastSyncHash = hash;
    localStorage.setItem('zmt_cloud_last_sync', new Date().toISOString());
    return { success: true, path };
  }

  // Download the website's command file for THIS store and apply each command
  // (create/update/delete) to the local DB. Returns the number of commands that
  // actually changed local data. Commands are idempotent, so re-scanning the
  // whole file on every poll is safe.
  async function applyRemoteCommands() {
    const supabase = getClient();
    if (!supabase) return 0;
    const code = getStoreCode();
    if (!code) return 0;

    let file;
    try {
      const data = await _downloadFresh(getCommandsPath());
      file = JSON.parse(await data.text());
    } catch (e) {
      return 0;
    }

    if (!Array.isArray(file) || !file.length) return 0;

    // Watermark: commands carry a monotonic ts from the website. Skipping every
    // command already seen on an earlier poll keeps the append-only command file
    // from being re-applied forever, which used to resurrect orders the desktop
    // user had deleted. Stored locally, so the desktop never races the website's
    // append while clearing the file.
    const watermarkKey = 'zmt_applied_commands_ts_' + code;
    let watermark = 0;
    try { watermark = parseInt(localStorage.getItem(watermarkKey) || '0', 10) || 0; } catch (e) { watermark = 0; }

    let applied = 0;
    let maxTs = watermark;
    for (const cmd of file) {
      if (!cmd || typeof cmd.op !== 'string') continue;
      if (typeof cmd.ts === 'number' && cmd.ts <= watermark) continue;
      if (typeof cmd.ts === 'number' && cmd.ts > maxTs) maxTs = cmd.ts;
      if (typeof DB.applyOrderCommand === 'function' && DB.applyOrderCommand(cmd.op, cmd)) {
        applied++;
      }
    }
    try {
      if (maxTs > watermark) localStorage.setItem(watermarkKey, String(maxTs));
    } catch (e) {}
    return applied;
  }

  // Poll the website's command file every ~12s so orders created/updated/deleted
  // on the website reach the desktop quickly, independent of the full sync.
  async function pollCommands() {
    if (!isCloudConnected()) return;
    try {
      const applied = await applyRemoteCommands();
      if (applied > 0) {
        console.log('[Cloud] Applied website commands:', applied);
        if (typeof window.refreshCurrentPageApp === 'function') {
          try { window.refreshCurrentPageApp('orders'); } catch (e) {}
        }
      }
    } catch (e) {
      // Offline or transient: retry on the next tick.
    }
  }

  // ===== DESKTOP → WEBSITE DELTA PUSH =====
  // Orders and supplier returns created/updated/deleted on the desktop are pushed
  // immediately to a small per-store desktop_commands.json file. The website
  // merges these into its read responses, so website users see desktop changes
  // within seconds — independent of the (much heavier) full backup uploads.
  const COMMANDS_KEEP = 500;
  let _pushQueue = [];
  let _pushTimer = null;
  let _pushFlushing = false;

  // LAN sub devices never write to the cloud directly — only the location's LAN
  // main server does (their changes arrive via the full backup after LAN sync).
  function pushLocalChange(kind, op, record) {
    if (typeof kind !== 'string' || typeof op !== 'string') return;
    if (!isCloudConnected()) return;
    if (isLanSubDevice()) return;
    const code = getStoreCode();
    if (!code) return;
    const cmd = {
      op,
      kind,
      recordId: (record && record.id) || '',
      record: op === 'delete' ? undefined : record,
      storeCode: code,
      src: 'desktop',
      ts: Date.now(),
    };
    _pushQueue.push(cmd);
    if (_pushQueue.length > 1000) _pushQueue.splice(0, _pushQueue.length - 1000);
    _schedulePushFlush();
  }

  function _schedulePushFlush() {
    if (_pushTimer) return;
    _pushTimer = setTimeout(_flushPushQueue, 500);
  }

  async function _flushPushQueue() {
    if (_pushFlushing) return;
    _pushFlushing = true;
    _pushTimer = null;
    const pending = _pushQueue.splice(0, _pushQueue.length);
    if (!pending.length) { _pushFlushing = false; return; }

    const supabase = getClient();
    if (!supabase) {
      _pushQueue.unshift(...pending);
      _schedulePushFlush();
      _pushFlushing = false;
      return;
    }

    try {
      let existing = [];
      try {
        const data = await _downloadFresh(getDesktopCommandsPath());
        const parsed = JSON.parse(await data.text());
        if (Array.isArray(parsed)) existing = parsed;
      } catch (e) { /* first push: no file yet */ }

      const merged = existing.concat(pending);
      const trimmed = merged.slice(-COMMANDS_KEEP);
      const blob = new Blob([JSON.stringify(trimmed)], { type: 'application/json' });
      const { error } = await supabase.storage.from(BUCKET).upload(getDesktopCommandsPath(), blob, {
        contentType: 'application/json',
        upsert: true,
        cacheControl: 'no-cache',
      });
      if (error) throw error;
    } catch (e) {
      console.warn('[Cloud] pushLocalChanges failed:', e.message);
      _pushQueue.unshift(...pending);
      _schedulePushFlush();
    } finally {
      _pushFlushing = false;
    }
  }

  async function downloadBackup(storeCode) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    const code = storeCode || getStoreCode();
    const type = getStoreType();
    const parent = getParentCode() || code;

    let paths;
    if (type === 'branch') {
      paths = [`${parent}/${code}_backup.json`];
    } else {
      paths = [`${code}/${code}_backup.json`];
    }

    for (const path of paths) {
      try {
        const data = await _downloadFresh(path);
        return await window._zmtParseBlob(data);
      } catch (e) { /* try the next path */ }
    }

    throw new Error('لم يتم العثور على نسخة احتياطية لهذا الرمز');
  }

  async function requestStoreCode() {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    const code = generateStoreCode();

    const { data: existing } = await supabase.storage.from(BUCKET).list('');
    const folders = existing?.map(f => f.name) || [];

    if (folders.some(f => f === code)) {
      return requestStoreCode();
    }

    const placeholder = { type: 'store_registry', code, createdAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(placeholder)], { type: 'application/json' });

    await ensureBucket();

    const { error } = await supabase.storage.from(BUCKET).upload(`${code}/.registry.json`, blob, {
      contentType: 'application/json',
      upsert: true,
    });

    if (error) throw error;

    localStorage.setItem('zmt_store_code', code);
    localStorage.setItem('zmt_store_type', 'main');

    return code;
  }

  async function registerBranch(mainCode) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    const { data } = await supabase.storage.from(BUCKET).list(mainCode);
    if (!data || data.length === 0) throw new Error('الرمز الرئيسي غير موجود');

    const branchCode = generateStoreCode();
    const placeholder = {
      type: 'branch_registry',
      code: branchCode,
      parentCode: mainCode,
      createdAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(placeholder)], { type: 'application/json' });

    const { error } = await supabase.storage.from(BUCKET).upload(`${mainCode}/${branchCode}_registry.json`, blob, {
      contentType: 'application/json',
      upsert: true,
    });

    if (error) throw error;

    return branchCode;
  }

  async function listBranches(mainCode) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    const code = mainCode || getStoreCode();
    const { data, error } = await supabase.storage.from(BUCKET).list(code);
    if (error) throw error;

    const branches = (data || [])
      .filter(f => f.name.endsWith('_registry.json') && f.name !== '.registry.json')
      .map(f => {
        const parts = f.name.replace('_registry.json', '');
        return parts;
      });

    return branches;
  }

  async function downloadBranchInventory(branchCode) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    if (!(await _canAccessStore(branchCode))) {
      throw new Error('لا تملك صلاحية الوصول لهذا المحل');
    }

    const parentCode = getParentCode() || getStoreCode();
    const { data, error } = await supabase.storage.from(BUCKET).download(`${parentCode}/${branchCode}_backup.json`);
    if (error) throw error;

    const backup = await window._zmtParseBlob(data);
    const dbData = backup.data?.zmt_db;
    if (!dbData) return [];
    try {
      const parsed = typeof dbData === 'string' ? JSON.parse(dbData) : dbData;
      return parsed.products || [];
    } catch { return []; }
  }

  // Inventory-viewing access: a main store sees its branches; a branch sees its
  // own store + the main store it belongs to + sibling branches (same network).
  // Other networks are never accessible. This is VIEW-ONLY (products only) —
  // full backups remain gated by _canAccessStore.
  async function _canViewInventory(targetCode) {
    const myCode = getStoreCode();
    const type = getStoreType();

    if (targetCode === myCode) return true;

    try {
      if (type === 'main') {
        const branches = await Auth.listBranchesFull(myCode);
        return (branches || []).some(b => b.code === targetCode);
      }
      if (type === 'branch') {
        const parent = getParentCode();
        if (!parent) return false;
        if (targetCode === parent) return true;
        const branches = await Auth.listBranchesFull(parent);
        return (branches || []).some(b => b.code === targetCode);
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  // Download ONLY the inventory (products) of another store for viewing.
  // Never exposes invoices/payments/orders — transaction data stays isolated.
  async function downloadStoreInventory(targetCode) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    if (!(await _canViewInventory(targetCode))) {
      throw new Error('لا تملك صلاحية الوصول لهذا المحل');
    }

    let payload;
    const { data: branchData } = await supabase.from('branches').select('code, store_id, stores(code)').eq('code', targetCode).single();
    if (branchData) {
      const parentCode = branchData.stores?.code;
      const { data, error } = await supabase.storage.from(BUCKET).download(`${parentCode}/${targetCode}_backup.json`);
      if (error) throw new Error('لم يتم العثور على نسخة احتياطية');
      payload = await window._zmtParseBlob(data);
    } else {
      const { data: files } = await supabase.storage.from(BUCKET).list(targetCode);
      if (!files) throw new Error('لا توجد بيانات لهذا الرمز');
      const backupFile = files.find(f => f.name.endsWith('_backup.json') && !f.name.includes('registry'));
      if (!backupFile) throw new Error('لم يتم العثور على نسخة احتياطية');
      const { data, error } = await supabase.storage.from(BUCKET).download(`${targetCode}/${backupFile.name}`);
      if (error) throw error;
      payload = await window._zmtParseBlob(data);
    }

    const d = (payload && payload.data) || {};
    const db = typeof d.zmt_db === 'string' ? JSON.parse(d.zmt_db) : (d.zmt_db || {});
    return db.products || [];
  }

  async function _canAccessStore(targetCode) {
    const myCode = getStoreCode();
    const type = getStoreType();

    if (targetCode === myCode) return true;

    if (type !== 'main') return false;

    try {
      const branches = await Auth.listBranchesFull(myCode);
      return (branches || []).some(b => b.code === targetCode);
    } catch (e) {
      return false;
    }
  }

  async function downloadStoreBackup(targetCode) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    if (!(await _canAccessStore(targetCode))) {
      throw new Error('لا تملك صلاحية الوصول لهذا المحل');
    }

    const { data: branchData } = await supabase.from('branches').select('code, store_id, stores(code)').eq('code', targetCode).single();

    if (branchData) {
      const parentCode = branchData.stores?.code;
      if (!parentCode) throw new Error('لا يمكن تحديد المحل الرئيسي');
      if (targetCode !== getStoreCode() && parentCode !== getStoreCode()) throw new Error('لا تملك صلاحية الوصول لهذا المحل');

      const { data, error } = await supabase.storage.from(BUCKET).download(`${parentCode}/${targetCode}_backup.json`);
      if (error) throw new Error('لم يتم العثور على نسخة احتياطية');
      return await window._zmtParseBlob(data);
    }

    const { data: files } = await supabase.storage.from(BUCKET).list(targetCode);
    if (!files) throw new Error('لا توجد بيانات لهذا الرمز');

    const backupFile = files.find(f => f.name.endsWith('_backup.json') && !f.name.includes('registry'));
    if (!backupFile) throw new Error('لم يتم العثور على نسخة احتياطية');

    const { data, error } = await supabase.storage.from(BUCKET).download(`${targetCode}/${backupFile.name}`);
    if (error) throw error;

    return await window._zmtParseBlob(data);
  }

  async function listAccessibleStores() {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    const myCode = getStoreCode();
    const type = getStoreType();
    const parent = getParentCode();

    if (type === 'main') {
      const branches = await Auth.listBranchesFull(myCode);
      const result = [{ code: myCode, name: 'المحل الرئيسي', type: 'main' }];
      for (const b of branches) {
        result.push({ code: b.code, name: b.name, type: 'branch' });
      }
      return result;
    }

    if (type === 'branch') {
      const result = [];
      if (parent) {
        result.push({ code: parent, name: 'المحل الرئيسي', type: 'main' });
        const branches = await Auth.listBranchesFull(parent);
        for (const b of branches) {
          if (b.code !== myCode) {
            result.push({ code: b.code, name: b.name, type: 'branch' });
          }
        }
      }
      return result;
    }

    return [];
  }

  function startAutoSync(intervalMs) {
    const ms = intervalMs || 120000;
    if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
    _syncTimer = setInterval(async () => {
      if (!isCloudConnected() || !hasData()) return;
      try {
        await uploadBackup();
        console.log('[Cloud] Auto-sync completed');
      } catch (e) {
        console.error('[Cloud] Auto-sync error:', e.message);
      }
    }, ms);
    startCommandPolling();
    localStorage.setItem('zmt_cloud_autosync_interval', String(ms));
  }

  // Command polling runs INDEPENDENT of the full-backup auto-sync setting: the
  // website's order commands must reach the desktop every 12s even when
  // zmt_cloud_autosync is off. Started at boot and kept running across toggles.
  function startCommandPolling() {
    if (_commandTimer) return;
    if (!isCloudConnected()) return;
    _commandTimer = setInterval(pollCommands, COMMAND_POLL_MS);
    // First poll immediately so a long-open session picks up website changes fast.
    pollCommands();
  }

  function stopCommandPolling() {
    if (_commandTimer) { clearInterval(_commandTimer); _commandTimer = null; }
  }

  function stopAutoSync() {
    if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  }

  function getAutoSyncInterval() {
    return parseInt(localStorage.getItem('zmt_cloud_autosync_interval') || '120000');
  }

  function triggerSync() {
    if (_syncTimer) return;
    if (!isCloudConnected() || !hasData()) return;
    clearTimeout(window._zmt_syncDebounce);
    window._zmt_syncDebounce = setTimeout(async () => {
      try {
        await uploadBackup();
        console.log('[Cloud] Data sync triggered');
      } catch (e) {
        console.error('[Cloud] Sync trigger error:', e.message);
      }
    }, 3000);
  }

  async function uploadBackupForStore(targetCode, targetStoreType, targetParentCode) {
    const supabase = getClient();
    if (!supabase) throw new Error('Supabase غير متصل');

    if (isLanSubDevice()) return { success: true, skipped: true, reason: 'lan_sub' };

    await ensureBucket();

    let path;
    if (targetStoreType === 'branch') {
      const parent = targetParentCode || targetCode;
      path = `${parent}/${targetCode}_backup.json`;
    } else {
      path = `${targetCode}/${targetCode}_backup.json`;
    }

    const dbExport = DB.exportAll();
    const storeProducts = (dbExport.products || []).filter(p => p.storeId === targetCode);
    const storeInvoices = (dbExport.invoices || []).filter(inv => inv.storeId === targetCode);

    const storeData = {
      zmt_db: {
        products: storeProducts,
        invoices: storeInvoices,
        nextBarcode: dbExport.meta.nextBarcode || 100000,
      },
    };

    storeData.zmt_transfers = (dbExport.transfers || []).filter(t => t.fromCode === targetCode || t.toCode === targetCode);
    storeData.zmt_payments = dbExport.payments || [];

    const storeUsers = JSON.parse(localStorage.getItem('zmt_users_' + targetCode) || '[]');
    storeData['zmt_users_' + targetCode] = storeUsers;

    const storeUsersMeta = JSON.parse(localStorage.getItem('zmt_users_meta_' + targetCode) || '{}');
    storeData['zmt_users_meta_' + targetCode] = storeUsersMeta;

    const payload = {
      version: 2,
      storeCode: targetCode,
      storeType: targetStoreType || 'branch',
      parentCode: targetParentCode || '',
      createdAt: new Date().toISOString(),
      storeName: localStorage.getItem('zmt_store_name') || '',
      data: storeData,
    };

    // Backups are gzip-compressed to keep the free Supabase tier under quota.
    const blob = window._zmtGzipBlob(payload);

    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: 'application/gzip',
      upsert: true,
    });

    if (error) throw error;
    return { success: true, path };
  }

  return {
    getConfig,
    saveConfig,
    getClient,
    getStoreCode,
    getStoreType,
    getParentCode,
    getBackupPath,
    isStoreConfigured,
    isCloudConnected,
    hasData,
    collectAllData,
    uploadBackup,
    uploadBackupForStore,
    downloadBackup,
    applyRemoteCommands,
    pushLocalChange,
    getDesktopCommandsPath,
    requestStoreCode,
    registerBranch,
    listBranches,
    downloadBranchInventory,
    downloadStoreBackup,
    downloadStoreInventory,
    listAccessibleStores,
    _canAccessStore,
    isLanSubDevice,
    startAutoSync,
    stopAutoSync,
    startCommandPolling,
    stopCommandPolling,
    getAutoSyncInterval,
    triggerSync,
    ensureBucket,
  };
})();
