// ============================================================
// ZMT Auth - Database-Based Authentication System
// ============================================================

const Auth = (() => {
  const STORAGE_KEY = 'zmt_auth_user';

  // ===== SHA-256 PASSWORD HASHING =====
  async function _hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(salt + password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function _generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function hashPassword(password) {
    const salt = _generateSalt();
    const hash = await _hashPassword(password, salt);
    return { hash, salt };
  }

  async function verifyPasswordHash(password, storedHash, storedSalt) {
    const hash = await _hashPassword(password, storedSalt);
    return hash === storedHash;
  }

  function generateCode() {
    let code = '';
    for (let i = 0; i < 10; i++) code += Math.floor(Math.random() * 10);
    return code;
  }

  // ===== SESSION =====
  function getCurrentUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveUser(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  function isLoggedIn() {
    return !!getCurrentUser();
  }

  function getUserId() {
    const user = getCurrentUser();
    return user ? user.userId : null;
  }

  function getUserCode() {
    const user = getCurrentUser();
    return user ? user.code : null;
  }

  function getUserEmail() {
    const user = getCurrentUser();
    return user ? user.email : null;
  }

  function getStoreType() {
    const user = getCurrentUser();
    return user ? (user.storeType || 'main') : 'main';
  }

  function getParentCode() {
    const user = getCurrentUser();
    return user ? (user.parentCode || '') : '';
  }

  function getStoreName() {
    return localStorage.getItem('zmt_store_name') || '';
  }

  // ===== DATABASE HELPERS =====
  function _getDB() {
    const supabase = CloudService.getClient();
    return supabase;
  }

  // ===== WEBSITE IDENTITY BROKER =====
  // Account creation, login, recovery and cloud access-token minting all go
  // through the website's API now — never through the publishable Supabase key
  // (which is locked behind RLS claims). The site URL reuses the connection
  // settings value (same as push notifications), with a built-in default.
  function _getSiteBase() {
    const url = localStorage.getItem('zmt_push_site_url') ||
      (typeof window.ZMT_PUSH_SITE_URL === 'string' ? window.ZMT_PUSH_SITE_URL : 'https://zmt-website.vercel.app');
    return url.replace(/\/+$/, '');
  }

  async function _siteFetch(path, payload) {
    let resp;
    try {
      resp = await fetch(_getSiteBase() + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
    } catch (e) {
      throw new Error('لا يمكن الوصول للخادم');
    }
    let data = null;
    try { data = await resp.json(); } catch (e) { data = null; }
    return { ok: resp.ok, status: resp.status, data };
  }

  function _storeCloudToken(token, expiresAt) {
    try {
      if (typeof CloudService !== 'undefined' && typeof CloudService.storeAccessToken === 'function') {
        CloudService.storeAccessToken(token, expiresAt);
      }
    } catch (e) {}
  }

  // ===== ACCOUNT CREATION =====
  // `password` is optional but recommended for the license flow: it is stored
  // server-side at creation (password_hash/password_salt), so the store can
  // immediately activate its granted license key without a second setup step.
  async function createAccount(email, password) {
    const { ok, data } = await _siteFetch('/api/push-trigger', { action: 'register', email, password: password || '' });
    if (!ok || !data) throw new Error('فشل إنشاء الحساب: ' + (data?.error || 'لا يمكن الوصول للخادم'));

    const user = {
      userId: data.code,
      code: data.code,
      email: data.email || email,
      storeType: 'main',
      parentCode: '',
      createdAt: new Date().toISOString(),
    };
    saveUser(user);
    localStorage.setItem('zmt_store_code', user.code);
    localStorage.setItem('zmt_store_type', 'main');
    if (password) localStorage.setItem('zmt_store_password', password);

    return { user, isNew: !!data.isNew };
  }

  // ===== LOGIN =====
  async function loginWithCode(code) {
    const { ok, data } = await _siteFetch('/api/push-trigger', { action: 'token', mode: 'lookup', code });
    if (!ok || !data || !data.found || !data.store) throw new Error('الرمز غير صحيح أو غير موجود');

    const store = data.store;
    const user = {
      userId: store.storeId,
      code: store.code,
      email: store.email || '',
      storeType: 'main',
      parentCode: '',
      createdAt: store.createdAt,
    };
    saveUser(user);
    localStorage.setItem('zmt_store_code', user.code);
    localStorage.setItem('zmt_store_type', 'main');

    return user;
  }

  async function loginAsBranch(branchCode) {
    const { ok, data } = await _siteFetch('/api/push-trigger', { action: 'token', mode: 'lookup', code: branchCode });
    if (!ok || !data || !data.found || !data.store || data.store.type !== 'branch') {
      throw new Error('الرمز غير صحيح أو غير موجود');
    }

    const s = data.store;
    const user = {
      userId: s.code,
      code: s.code,
      email: '',
      storeType: 'branch',
      parentCode: s.parentCode || '',
      branchName: s.storeName,
      createdAt: s.createdAt || new Date().toISOString(),
    };
    saveUser(user);
    localStorage.setItem('zmt_store_code', user.code);
    localStorage.setItem('zmt_store_type', 'branch');
    localStorage.setItem('zmt_parent_code', user.parentCode);

    return user;
  }

  async function connectAsBranch(mainCode, password) {
    const { ok, data } = await _siteFetch('/api/push-trigger', { action: 'token', mode: 'authBranch', code: mainCode, password });
    if (!ok || !data || !data.token || !data.store) throw new Error('كلمة المرور غير صحيحة');

    _storeCloudToken(data.token, data.expiresAt);

    const s = data.store;
    const user = {
      userId: s.code,
      code: s.code,
      email: '',
      storeType: 'branch',
      parentCode: mainCode,
      branchName: s.storeName,
      createdAt: s.createdAt || new Date().toISOString(),
    };
    saveUser(user);
    localStorage.setItem('zmt_store_code', user.code);
    localStorage.setItem('zmt_store_type', 'branch');
    localStorage.setItem('zmt_parent_code', mainCode);
    localStorage.setItem('zmt_store_password', password);

    return user;
  }

  // ===== SIGN OUT =====
  function signOut() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('zmt_store_code');
    localStorage.removeItem('zmt_store_type');
    localStorage.removeItem('zmt_parent_code');
    localStorage.removeItem('zmt_store_password');
    try {
      if (typeof CloudService !== 'undefined' && typeof CloudService.clearAccessToken === 'function') {
        CloudService.clearAccessToken();
      }
    } catch (e) {}
  }

  function isSupabaseConfigured() {
    return typeof CloudService !== 'undefined' && CloudService.isCloudConnected();
  }

  // ===== STORE PASSWORD =====
  async function setStorePassword(password) {
    try {
      if (typeof CloudService !== 'undefined' && typeof CloudService.ensureAccessToken === 'function') {
        await CloudService.ensureAccessToken();
      }
    } catch (e) {}
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');
    const code = getUserCode();
    if (!code) throw new Error('الرجاء تسجيل الدخول أولاً');

    const { hash, salt } = await hashPassword(password);

    const { data: current } = await supabase.from('stores').select('password_hash, password_salt').eq('code', code).single();
    const lastHash = current?.password_hash || '';
    const lastSalt = current?.password_salt || '';

    const { error } = await supabase.from('stores').update({
      password_hash: hash,
      password_salt: salt,
      password_plain: password,
      last_password_hash: lastHash,
      last_password_salt: lastSalt,
    }).eq('code', code);
    if (error) throw new Error('فشل حفظ كلمة المرور: ' + error.message);

    _saveLocalPassData(code, hash, salt);
    localStorage.setItem('zmt_store_password', password);
  }

  async function verifyStorePassword(password) {
    try {
      if (typeof CloudService !== 'undefined' && typeof CloudService.ensureAccessToken === 'function') {
        await CloudService.ensureAccessToken();
      }
    } catch (e) {}
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');
    const code = getUserCode();
    if (!code) throw new Error('الرجاء تسجيل الدخول أولاً');

    const { data: store } = await supabase.from('stores').select('password_hash, password_salt').eq('code', code).single();
    if (!store) throw new Error('الرمز غير موجود');

    if (store.password_hash && store.password_salt) {
      return await verifyPasswordHash(password, store.password_hash, store.password_salt);
    }
    return !password;
  }

  async function verifyCloudPassword(code, password) {
    const parent = getParentCode();
    const { ok, data } = await _siteFetch('/api/push-trigger', {
      action: 'token',
      mode: 'auth',
      code,
      password,
      parentCode: parent || undefined,
    });
    if (ok && data && data.token) {
      _storeCloudToken(data.token, data.expiresAt);
      localStorage.setItem('zmt_store_password', password);
      return true;
    }
    return false;
  }

  function getStorePassword() {
    return localStorage.getItem('zmt_store_password') || '';
  }

  function hasStorePassword() {
    return !!getStorePassword();
  }

  // ===== LOCAL PASSWORD HASH (for offline login) =====
  function _getLocalPassData() {
    try {
      const raw = localStorage.getItem('zmt_local_pass');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function _saveLocalPassData(code, hash, salt) {
    localStorage.setItem('zmt_local_pass', JSON.stringify({ code, hash, salt }));
  }

  async function verifyLocalPassword(code, password) {
    const data = _getLocalPassData();
    if (!data || data.code !== code) return false;
    return await verifyPasswordHash(password, data.hash, data.salt);
  }

  function hasLocalPassData(code) {
    const data = _getLocalPassData();
    return data && data.code === code;
  }

  // ===== PASSWORD RECOVERY (via the website, never the publishable key) =====
  // Security change: the lookup no longer reveals the stored plaintext
  // password — it only reports whether one exists, and the owner resets it.
  async function recoverByEmail(email) {
    const { ok, data } = await _siteFetch('/api/push-trigger', { action: 'recovery', sub: 'lookup', email });
    if (!ok || !data || !data.found) throw new Error('البريد الإلكتروني غير مسجل في النظام');

    return {
      code: data.code,
      email,
      storeName: data.storeName || 'ZMT PIECE',
      password: '',
      hasPassword: !!data.hasPassword,
    };
  }

  async function resetPasswordByEmail(email, newPassword) {
    const { ok, data } = await _siteFetch('/api/push-trigger', { action: 'recovery', sub: 'reset', email, newPassword });
    if (!ok || !data || !data.found) throw new Error('البريد غير مسجل');

    const { hash, salt } = await hashPassword(newPassword);
    _saveLocalPassData(data.code, hash, salt);

    return data.code;
  }

  async function removePasswordByEmail(email) {
    const { ok, data } = await _siteFetch('/api/push-trigger', { action: 'recovery', sub: 'remove', email });
    if (!ok || !data || !data.found) throw new Error('البريد غير مسجل');

    return data.code;
  }

  async function getRecoveryInfo(email) {
    try {
      const info = await recoverByEmail(email);
      return {
        code: info.code,
        email,
        storeType: 'main',
        hasPassword: info.hasPassword,
      };
    } catch (e) {
      return null;
    }
  }

  // ===== BRANCHES =====
  async function createBranch(name, password) {
    try {
      if (typeof CloudService !== 'undefined' && typeof CloudService.ensureAccessToken === 'function') {
        await CloudService.ensureAccessToken();
      }
    } catch (e) {}
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const mainCode = getUserCode();
    if (!mainCode) throw new Error('الرجاء تسجيل الدخول أولاً');

    const { data: store } = await supabase.from('stores').select('id').eq('code', mainCode).single();
    if (!store) throw new Error('المحل الرئيسي غير موجود');

    let branchCode;
    let codeExists = true;
    while (codeExists) {
      branchCode = generateCode();
      const { data: check } = await supabase.from('branches').select('id').eq('code', branchCode).single();
      codeExists = !!check;
    }

    const { error } = await supabase.from('branches').insert({
      code: branchCode,
      name,
      password,
      store_id: store.id,
      parent_code: mainCode,
    });
    if (error) throw new Error('فشل إنشاء الفرع: ' + error.message);

    if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'add', entity: 'branch', entityId: branchCode, detail: name });
    return { code: branchCode, name, password };
  }

  async function listBranchesFull(mainCode) {
    try {
      if (typeof CloudService !== 'undefined' && typeof CloudService.ensureAccessToken === 'function') {
        await CloudService.ensureAccessToken();
      }
    } catch (e) {}
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const code = mainCode || getUserCode();
    const { data: store } = await supabase.from('stores').select('id').eq('code', code).single();
    if (!store) return [];

    const { data: branches } = await supabase.from('branches')
      .select('*').eq('store_id', store.id).order('created_at', { ascending: true });

    return (branches || []).map(b => ({
      code: b.code,
      name: b.name,
      password: b.password,
      parentCode: b.parent_code || code,
      createdAt: b.created_at,
    }));
  }

  async function deleteBranch(branchCode) {
    try {
      if (typeof CloudService !== 'undefined' && typeof CloudService.ensureAccessToken === 'function') {
        await CloudService.ensureAccessToken();
      }
    } catch (e) {}
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const { error } = await supabase.from('branches').delete().eq('code', branchCode);
    if (error) throw new Error('فشل حذف الفرع: ' + error.message);
    if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'delete', entity: 'branch', entityId: branchCode, detail: branchCode });

    try {
      const { data: branch } = await supabase.from('branches').select('store_id').eq('code', branchCode).single();
      if (branch) {
        const { data: store } = await supabase.from('stores').select('code').eq('id', branch.store_id).single();
        if (store) {
          await supabase.storage.from('zmt-backups').remove([store.code + '/' + branchCode + '_backup.json']);
        }
      }
    } catch {}

    return { success: true };
  }

  // ===== RECOVERY FROM CLOUD =====
  async function recoverByCode(code, password) {
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const { data: store } = await supabase.from('stores').select('*').eq('code', code).single();
    if (store) {
      if (store.password_hash && store.password_salt) {
        const verified = await verifyPasswordHash(password, store.password_hash, store.password_salt);
        if (!verified) throw new Error('كلمة المرور غير صحيحة');
      }

      const backupPath = code + '/' + code + '_backup.json';
      const { data, error } = await supabase.storage.from('zmt-backups').download(backupPath);
      if (error) throw new Error('لم يتم العثور على نسخة احتياطية');
      if (!data) throw new Error('النسخة فارغة');

      const backup = await window._zmtParseBlob(data);
      if (!backup.data) throw new Error('النسخة فارغة');

      const { data: users } = await supabase.from('app_users')
        .select('*').eq('store_id', store.id);

      const storePassword = getStorePassword();

      return { backup, storeType: 'main', parentCode: '', name: store.store_name, users, storePassword };
    }

    const { data: branch } = await supabase.from('branches').select('*, stores(*)').eq('code', code).single();
    if (branch) {
      if (branch.password !== password) throw new Error('كلمة المرور غير صحيحة');

      const mainCode = branch.stores?.code || '';
      const backupPath = mainCode + '/' + code + '_backup.json';
      const { data, error } = await supabase.storage.from('zmt-backups').download(backupPath);
      if (error) throw new Error('لم يتم العثور على نسخة احتياطية');

      const backup = await window._zmtParseBlob(data);
      if (!backup.data) throw new Error('النسخة فارغة');

      return { backup, storeType: 'branch', parentCode: mainCode, name: branch.name, users: null, storePassword: '' };
    }

    throw new Error('الرمز غير صحيح أو غير موجود');
  }

  // ===== USERS MANAGEMENT (LOCAL STORAGE) =====
  const DEFAULT_PAGES = {
    'dashboard': { view: true, edit: false, del: false },
    'sales': { view: true, edit: true, del: false },
    'orders': { view: true, edit: true, del: true },
    'invoices': { view: true, edit: true, del: true },
    'customers': { view: true, edit: true, del: true },
    'suppliers': { view: true, edit: true, del: true },
    'brands': { view: true, edit: true, del: true },
    'inventory': { view: true, edit: true, del: true },
    'supplier-returns': { view: true, edit: true, del: true },
    'debts': { view: true, edit: true, del: true },
    'returns': { view: true, edit: true, del: false },
    'discounts': { view: true, edit: true, del: true },
    'reports': { view: true, edit: false, del: false },
    'net-account': { view: true, edit: false, del: false },
    'settings': { view: false, edit: false, del: false },
    'backup': { view: true, edit: true, del: false },
    'connection': { view: false, edit: false, del: false },
    'store-debts': { view: true, edit: true, del: true },
    'branches-monitor': { view: true, edit: false, del: false },
    'shared-inventory': { view: true, edit: false, del: false },
  };

  const PAGE_NAMES = {
    'dashboard': 'لوحة التحكم',
    'sales': 'المبيعات',
    'orders': 'الطلبات',
    'invoices': 'الفواتير',
    'customers': 'العملاء',
    'suppliers': 'الموردين',
    'brands': 'العلامات التجارية',
    'inventory': 'المخزون',
    'supplier-returns': 'السلع الفاسدة',
    'debts': 'الديون',
    'returns': 'المرتجعات',
    'discounts': 'التخفيضات',
    'reports': 'التقارير',
    'net-account': 'صافي الحساب',
    'settings': 'الاعدادات',
    'backup': 'النسخ الاحتياطي',
    'connection': 'اعدادات الاتصال',
    'store-debts': 'ديون المحلات',
    'branches-monitor': 'مراقبة الفروع',
    'shared-inventory': 'المخزون المشترك',
  };

  function _getUsersKey() {
    const code = getUserCode();
    if (!code) return null;
    return 'zmt_users_' + code;
  }

  function _loadLocalUsers() {
    const key = _getUsersKey();
    if (!key) return [];
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  }

  function _saveLocalUsers(users) {
    const key = _getUsersKey();
    if (!key) throw new Error('الرجاء تسجيل الدخول أولاً');
    localStorage.setItem(key, JSON.stringify(users));
  }

  function _loadUsersByCode(code) {
    if (!code) return [];
    try {
      return JSON.parse(localStorage.getItem('zmt_users_' + code) || '[]');
    } catch {
      return [];
    }
  }

  function _getUsersRev(code) {
    try {
      return parseInt(localStorage.getItem('zmt_users_rev_' + code) || '0', 10) || 0;
    } catch { return 0; }
  }

  function _setUsersRev(code, rev) {
    localStorage.setItem('zmt_users_rev_' + code, String(rev));
  }

  function _bumpUsersRev(code) {
    const rev = _getUsersRev(code) + 1;
    _setUsersRev(code, rev);
    return rev;
  }

  // ===== USERS SYNC (LAN peers) =====
  // Collect every store's user list + revision, so LAN peers can exchange them
  // exactly like DB data and employees can log in from either device.
  function getAllUsersByCode() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('zmt_users_')) continue;
        const code = key.slice('zmt_users_'.length);
        if (!code || code.indexOf('_') !== -1) continue;
        let meta = {};
        try {
          meta = JSON.parse(localStorage.getItem('zmt_users_meta_' + code) || '{}');
        } catch {}
        out[code] = {
          list: _loadUsersByCode(code),
          rev: _getUsersRev(code),
          meta,
        };
      }
    } catch (e) {
      console.warn('[Auth] getAllUsersByCode error:', e.message);
    }
    return out;
  }

  // Union-merge two user lists by username, keeping the newest updatedAt entry.
  function _mergeUserLists(localList, incomingList) {
    const byName = new Map();
    for (const u of localList || []) byName.set(u.username, u);
    for (const u of incomingList || []) {
      const cur = byName.get(u.username);
      if (!cur) { byName.set(u.username, u); continue; }
      const a = (u.updatedAt || 0) - (cur.updatedAt || 0);
      if (a > 0) byName.set(u.username, u);
    }
    return Array.from(byName.values());
  }

  function _mergeUserMeta(localMeta, incomingMeta) {
    if (incomingMeta && typeof incomingMeta === 'object') {
      const merged = Object.assign({}, incomingMeta, localMeta || {});
      return merged;
    }
    return localMeta || incomingMeta || {};
  }

  function _sameUsersList(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // Apply a users payload received from a LAN peer.
  // Higher revision replaces the whole list (deletes propagate). Equal revision
  // (simultaneous edits) union-merges by username so no employee is lost.
  function applyUsersPayload(payload) {
    if (!payload || typeof payload !== 'object') return 0;
    let applied = 0;
    try {
      for (const code of Object.keys(payload)) {
        const entry = payload[code];
        if (!entry || !Array.isArray(entry.list)) continue;
        const incomingRev = parseInt(entry.rev || '0', 10) || 0;
        const localRev = _getUsersRev(code);
        if (incomingRev > localRev) {
          localStorage.setItem('zmt_users_' + code, JSON.stringify(entry.list));
          if (entry.meta && typeof entry.meta === 'object' && Object.keys(entry.meta).length) {
            localStorage.setItem('zmt_users_meta_' + code, JSON.stringify(entry.meta));
          }
          _setUsersRev(code, incomingRev);
          applied++;
        } else if (incomingRev === localRev && localRev > 0) {
          const merged = _mergeUserLists(_loadUsersByCode(code), entry.list);
          if (!_sameUsersList(merged, _loadUsersByCode(code))) {
            localStorage.setItem('zmt_users_' + code, JSON.stringify(merged));
            const mergedMeta = _mergeUserMeta(
              JSON.parse(localStorage.getItem('zmt_users_meta_' + code) || '{}'),
              entry.meta
            );
            localStorage.setItem('zmt_users_meta_' + code, JSON.stringify(mergedMeta));
            applied++;
          }
        }
      }
    } catch (e) {
      console.warn('[Auth] applyUsersPayload error:', e.message);
    }
    if (applied > 0) {
      try {
        window.dispatchEvent(new CustomEvent('zmt-users-synced', { detail: applied }));
      } catch (e) {}
    }
    return applied;
  }

  function createUser(username, password, permissions) {
    const code = getUserCode();
    if (!code) throw new Error('الرجاء تسجيل الدخول أولاً');

    const users = _loadLocalUsers();
    if (users.some(u => u.username === username)) {
      throw new Error('اسم المستخدم موجود مسبقاً');
    }

    const newUser = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      username,
      password,
      permissions: permissions || JSON.parse(JSON.stringify(DEFAULT_PAGES)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      storeCode: code,
    };

    users.push(newUser);
    _saveLocalUsers(users);
    _bumpUsersRev(code);
    if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'add', entity: 'user', entityId: newUser.id, detail: username });

    // Also save store metadata with users for login lookup
    const metaKey = 'zmt_users_meta_' + code;
    localStorage.setItem(metaKey, JSON.stringify({
      storeType: getStoreType(),
      parentCode: getParentCode(),
    }));

    return newUser;
  }

  function updateUser(userId, updates) {
    const users = _loadLocalUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('المستخدم غير موجود');

    Object.assign(users[idx], updates, { updatedAt: Date.now() });
    _saveLocalUsers(users);
    _bumpUsersRev(users[idx].storeCode || getUserCode());
    if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'update', entity: 'user', entityId: userId, detail: users[idx].username });
    return true;
  }

  function deleteUser(userId) {
    const users = _loadLocalUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('المستخدم غير موجود');
    const storeCode = users[idx].storeCode || getUserCode();
    const removed = users[idx];
    const filtered = users.filter(u => u.id !== userId);
    _saveLocalUsers(filtered);
    _bumpUsersRev(storeCode);
    if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'delete', entity: 'user', entityId: userId, detail: (removed && removed.username) || '' });
    return true;
  }

  function listUsers() {
    return _loadLocalUsers();
  }

  function loginAsUser(storeCode, username, password) {
    if (!storeCode || storeCode.length !== 10) throw new Error('كود المحل غير صحيح');

    const usersKey = 'zmt_users_' + storeCode;
    let users;
    try {
      users = JSON.parse(localStorage.getItem(usersKey) || '[]');
    } catch {
      users = [];
    }
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');

    // Read store metadata
    let storeType = 'main';
    let parentCode = '';
    try {
      const meta = JSON.parse(localStorage.getItem('zmt_users_meta_' + storeCode) || '{}');
      if (meta.storeType) storeType = meta.storeType;
      if (meta.parentCode) parentCode = meta.parentCode;
    } catch {}

    const authUser = {
      userId: user.id,
      code: storeCode,
      email: '',
      storeType: storeType,
      parentCode: parentCode,
      role: 'user',
      username: user.username,
      permissions: user.permissions,
      createdAt: user.createdAt,
    };
    saveUser(authUser);

    localStorage.setItem('zmt_store_code', storeCode);
    localStorage.setItem('zmt_store_type', storeType);
    if (parentCode) localStorage.setItem('zmt_parent_code', parentCode);

    return authUser;
  }

  function getPermissions() {
    const user = getCurrentUser();
    if (!user) return {};
    if (user.role !== 'user') return null;
    return user.permissions || {};
  }

  function canView(page) {
    const perms = getPermissions();
    if (perms === null) return true;
    return perms[page]?.view !== false;
  }

  function canEdit(page) {
    const perms = getPermissions();
    if (perms === null) return true;
    return perms[page]?.edit === true;
  }

  function canDelete(page) {
    const perms = getPermissions();
    if (perms === null) return true;
    return perms[page]?.del === true;
  }

  function firstViewablePage() {
    for (const page of Object.keys(DEFAULT_PAGES)) {
      if (canView(page)) return page;
    }
    return null;
  }

  function isManager() {
    const user = getCurrentUser();
    return user && user.role !== 'user';
  }

  // ===== MIGRATION FROM STORAGE TO DB =====
  async function migrateStorageToDB() {
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const { data: rootData } = await supabase.storage.from('zmt-backups').list('');
    if (!rootData) return { migrated: 0 };

    let migrated = 0;
    for (const folder of rootData) {
      if (folder.name === 'registry' || folder.name.endsWith(' actions')) continue;
      if (!/^\d{10}$/.test(folder.name)) continue;

      try {
        const { data: blob } = await supabase.storage.from('zmt-backups').download(folder.name + '/.registry.json');
        if (!blob) continue;
        const text = await blob.text();
        const reg = JSON.parse(text);

        if (reg.storeType === 'branch') continue;

        const { data: existing } = await supabase.from('stores').select('id').eq('code', reg.code).single();
        if (existing) continue;

        const { error } = await supabase.from('stores').insert({
          code: reg.code,
          email: reg.email || '',
          store_name: reg.name || 'ZMT PIECE',
          auth_password: reg.authPassword || '',
        });
        if (!error) migrated++;
      } catch (e) {
        console.warn('[Migrate] error:', folder.name, e.message);
      }
    }

    for (const folder of rootData) {
      if (folder.name === 'registry' || folder.name.endsWith(' actions')) continue;
      if (!/^\d{10}$/.test(folder.name)) continue;

      try {
        const { data: files } = await supabase.storage.from('zmt-backups').list(folder.name);
        if (!files) continue;

        for (const f of files) {
          if (!f.name.endsWith('_registry.json') || f.name === '.registry.json') continue;
          try {
            const { data: blob } = await supabase.storage.from('zmt-backups').download(folder.name + '/' + f.name);
            if (!blob) continue;
            const text = await blob.text();
            const bReg = JSON.parse(text);
            if (!bReg.code || bReg.type !== 'branch_registry') continue;

            const { data: parentStore } = await supabase.from('stores').select('id').eq('code', folder.name).single();
            if (!parentStore) continue;

            const { data: existingBranch } = await supabase.from('branches').select('id').eq('code', bReg.code).single();
            if (existingBranch) continue;

            await supabase.from('branches').insert({
              code: bReg.code,
              name: bReg.name || 'فرع',
              password: bReg.password || '',
              store_id: parentStore.id,
            });
          } catch {}
        }
      } catch {}
    }

    return { migrated };
  }

  // ===== SYNC USERS TO AUTH =====
  async function syncAllUsersToAuth() {
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const { data: stores } = await supabase.from('stores').select('id, code, email, auth_password');
    if (!stores || stores.length === 0) return { synced: 0, errors: 0, details: [{ email: 'لا توجد محلات مسجلة', status: 'error' }] };

    let synced = 0, errors = 0;
    const details = [];
    const seenEmails = new Set();

    for (const store of stores) {
      if (!store.email) {
        details.push({ email: store.code + ' (بدون بريد)', status: 'skip' });
        continue;
      }
      if (seenEmails.has(store.email)) {
        details.push({ email: store.email, status: 'skip', msg: 'مكرر' });
        continue;
      }
      seenEmails.add(store.email);

      const tempPass = store.auth_password || ('zmt_' + store.id);

      const { error: signInErr } = await supabase.auth.signIn({ email: store.email, password: tempPass });
      if (!signInErr) {
        if (!store.auth_password) {
          await supabase.from('stores').update({ auth_password: tempPass }).eq('id', store.id);
        }
        synced++;
        details.push({ email: store.email, status: 'exists' });
        continue;
      }

      const { error: signUpErr } = await supabase.auth.signUp({ email: store.email, password: tempPass });
      if (!signUpErr) {
        await supabase.from('stores').update({ auth_password: tempPass }).eq('id', store.id);
        synced++;
        details.push({ email: store.email, status: 'created' });
      } else {
        console.warn('[Sync] ' + store.email + ':', signUpErr.message);
        details.push({ email: store.email, status: 'error', msg: signUpErr.message });
        errors++;
      }
    }

    if (details.length === 0) {
      details.push({ email: 'لا يوجد حسابات للمزامنة', status: 'skip' });
    }

    return { synced, errors, details };
  }

  // ===== EXPORTS =====
  return {
    getCurrentUser,
    isLoggedIn,
    getUserId,
    getUserCode,
    getUserEmail,
    getStoreType,
    getParentCode,
    getStoreName,
    createAccount,
    createBranch,
    listBranchesFull,
    deleteBranch,
    loginWithCode,
    loginAsBranch,
    connectAsBranch,
    recoverByCode,
    signOut,
    isSupabaseConfigured,
    generateCode,
    setStorePassword,
    verifyStorePassword,
    verifyCloudPassword,
    getStorePassword,
    hasStorePassword,
    createUser,
    updateUser,
    deleteUser,
    listUsers,
    loginAsUser,
    getAllUsersByCode,
    applyUsersPayload,
    getPermissions,
    canView,
    canEdit,
    canDelete,
    firstViewablePage,
    isManager,
    DEFAULT_PAGES,
    PAGE_NAMES,
    hashPassword,
    verifyPasswordHash,
    recoverByEmail,
    resetPasswordByEmail,
    removePasswordByEmail,
    verifyLocalPassword,
    hasLocalPassData,
    syncAllUsersToAuth,
    migrateStorageToDB,
  };
})();
