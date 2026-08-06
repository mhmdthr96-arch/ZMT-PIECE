// ============================================================
// ZMT Cloud Service - Supabase Integration
// ============================================================

const CloudService = (() => {
  let client = null;
  const BUCKET = 'zmt-backups';
  let _syncTimer = null;
  let _lastSyncHash = '';

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

  function getMainBackupPath() {
    const code = getStoreCode();
    return `${code}/${code}_backup.json`;
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

    if (!hasData()) return { success: true, skipped: true, reason: 'no_data' };

    if (!data) data = collectAllData();

    const hash = dataHash(data);
    if (hash === _lastSyncHash) return { success: true, skipped: true };

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

    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'application/json' });

    const { error: delErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (delErr) console.warn('[Cloud] Remove old:', delErr.message);

    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: 'application/json',
      upsert: true,
    });

    if (error) throw error;

    _lastSyncHash = hash;
    localStorage.setItem('zmt_cloud_last_sync', new Date().toISOString());
    return { success: true, path };
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
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (!error && data) {
        const text = await data.text();
        return JSON.parse(text);
      }
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

    const text = await data.text();
    const backup = JSON.parse(text);
    const dbData = backup.data?.zmt_db;
    if (!dbData) return [];
    try {
      const parsed = typeof dbData === 'string' ? JSON.parse(dbData) : dbData;
      return parsed.products || [];
    } catch { return []; }
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
      const text = await data.text();
      return JSON.parse(text);
    }

    const { data: files } = await supabase.storage.from(BUCKET).list(targetCode);
    if (!files) throw new Error('لا توجد بيانات لهذا الرمز');

    const backupFile = files.find(f => f.name.endsWith('_backup.json') && !f.name.includes('registry'));
    if (!backupFile) throw new Error('لم يتم العثور على نسخة احتياطية');

    const { data, error } = await supabase.storage.from(BUCKET).download(`${targetCode}/${backupFile.name}`);
    if (error) throw error;

    const text = await data.text();
    return JSON.parse(text);
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
    stopAutoSync();
    const ms = intervalMs || 120000;
    _syncTimer = setInterval(async () => {
      if (!isCloudConnected() || !hasData()) return;
      try {
        await uploadBackup();
        console.log('[Cloud] Auto-sync completed');
      } catch (e) {
        console.error('[Cloud] Auto-sync error:', e.message);
      }
    }, ms);
    localStorage.setItem('zmt_cloud_autosync_interval', String(ms));
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

    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'application/json' });

    const { error: delErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (delErr) console.warn('[Cloud] Remove old target:', delErr.message);

    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: 'application/json',
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
    requestStoreCode,
    registerBranch,
    listBranches,
    downloadBranchInventory,
    downloadStoreBackup,
    listAccessibleStores,
    _canAccessStore,
    startAutoSync,
    stopAutoSync,
    getAutoSyncInterval,
    triggerSync,
    ensureBucket,
  };
})();
