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

  // Patch the persisted session in place. getCurrentUser() re-reads localStorage
  // and re-parses on EVERY call, so mutating the returned object and never saving
  // it (the old login flow) silently discarded every companyId/role change. All
  // cross-page session edits must go through here so the write is guaranteed.
  function updateSession(patch) {
    const user = getCurrentUser();
    if (!user) {
      // Diagnostic trail: this silent no-op once left an offline manager
      // login with NO session at all (view-only app, "lost permissions").
      console.warn('[Auth] updateSession ignored — no active session', Object.keys(patch || {}));
      return null;
    }
    const next = Object.assign({}, user, patch || {});
    saveUser(next);
    return next;
  }

  // Open a session directly from ALREADY-VERIFIED local credentials when the
  // server lookup (loginWithCode) is unreachable — e.g. a shop machine with no
  // internet. Without this, an offline manager login ends with no session at
  // all: getPermissions() then returns {} (not null) so every canEdit() denies
  // and the whole app renders view-only — reported as "the manager lost all
  // permissions", persisting across restarts because each boot wipes the
  // session and repeats the same failing login path.
  function startLocalSession(user) {
    if (!user || !user.code) return null;
    const next = Object.assign({ createdAt: new Date().toISOString() }, user);
    saveUser(next);
    try { localStorage.setItem('zmt_store_code', next.code); } catch (e) {}
    try { localStorage.setItem('zmt_store_type', next.storeType || 'main'); } catch (e) {}
    if (next.parentCode) {
      try { localStorage.setItem('zmt_parent_code', next.parentCode); } catch (e) {}
    }
    // Keep the localStorage mirror in step with the session — DB._getCompanyId()
    // treats the two as interchangeable sources of truth.
    if (next.companyId) {
      try { localStorage.setItem('zmt_active_company', next.companyId); } catch (e) {}
    } else {
      try { localStorage.removeItem('zmt_active_company'); } catch (e) {}
    }
    resetBuyVisibility();
    reportScope('local-session');
    return next;
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
      role: 'admin',
      createdAt: store.createdAt,
    };
    resetBuyVisibility();
    saveUser(user);
    localStorage.setItem('zmt_store_code', user.code);
    localStorage.setItem('zmt_store_type', 'main');
    // The session above is brand new and carries NO companyId. Drop any stale
    // active-company key right away: DB._getCompanyId() falls back to this key,
    // so a leftover value from a previous identity would silently scope the new
    // session to a foreign company (blank products / missing invoices). The
    // re-bind below restores it only for the SAME store code.
    try { localStorage.removeItem('zmt_active_company'); } catch (e) {}

    // Restore the previously entered company for THIS store code. The app keeps
    // the binding in zmt_remembered_company across restarts (see
    // requirePasswordOnStart) so a manager no longer has to go to Settings →
    // "تسجيل الدخول إلى الشركة" every morning to see and edit company data.
    // Re-binds only when the exact same store code logs in — a different identity
    // on the same device never inherits a foreign company's scope.
    try {
      const recalled = JSON.parse(localStorage.getItem('zmt_remembered_company') || 'null');
      if (recalled && recalled.code === code && recalled.companyId) {
        user.companyId = recalled.companyId;
        user.role = user.role || 'admin';
        user.enteredCompany = true;
        saveUser(user);
        try { localStorage.setItem('zmt_active_company', recalled.companyId); } catch {}
      }
    } catch (e) {}
    reportScope('manager-login');

    return user;
  }

  // After a successful branch login/connection, pull the parent's company list in
  // the background (without blocking sign-in) so the company picker and any
  // company-scoped view can show exactly the companies this branch is bound to.
  function _pullCompaniesInBackground(parentCode) {
    if (!parentCode) return;
    try {
      if (typeof CloudService !== 'undefined') {
        const fn = CloudService && CloudService.pullCompaniesFromMain;
        if (typeof fn === 'function') { try { Promise.resolve(fn()).catch(() => {}); } catch (e) {} }
      }
    } catch (e) { /* never block login on a company-pull failure */ }
  }

  async function loginAsBranch(branchCode, companyId) {
    const { ok, data } = await _siteFetch('/api/push-trigger', { action: 'token', mode: 'lookup', code: branchCode });
    if (!ok || !data || !data.found || !data.store || data.store.type !== 'branch') {
      throw new Error('الرمز غير صحيح أو غير موجود');
    }

    const s = data.store;
    const ids = Array.isArray(companyId) ? companyId : (companyId ? [companyId] : []);
    const user = {
      userId: s.code,
      code: s.code,
      email: '',
      storeType: 'branch',
      parentCode: s.parentCode || '',
      branchName: s.storeName,
      createdAt: s.createdAt || new Date().toISOString(),
      companyId: ids[0] || companyId || '',
      companyIds: ids,
    };
    resetBuyVisibility();
    saveUser(user);
    localStorage.setItem('zmt_store_code', user.code);
    localStorage.setItem('zmt_store_type', 'branch');
    localStorage.setItem('zmt_parent_code', user.parentCode);
    if (user.companyId) {
      try { localStorage.setItem('zmt_active_company', user.companyId); } catch {}
    }

    // After a successful branch login, make sure this device holds the parent's
    // company list so the login/company picker can show only the companies this
    // branch is bound to. Non-blocking: never delays login and never throws.
    _pullCompaniesInBackground(user.parentCode);
    reportScope('branch-login');

    return user;
  }

  async function connectAsBranch(mainCode, password, companyId) {
    const { ok, data } = await _siteFetch('/api/push-trigger', { action: 'token', mode: 'authBranch', code: mainCode, password });
    if (!ok || !data || !data.token || !data.store) throw new Error('كلمة المرور غير صحيحة');

    _storeCloudToken(data.token, data.expiresAt);

    const s = data.store;
    const ids = Array.isArray(companyId) ? companyId : (companyId ? [companyId] : []);
    const user = {
      userId: s.code,
      code: s.code,
      email: '',
      storeType: 'branch',
      parentCode: mainCode,
      branchName: s.storeName,
      createdAt: s.createdAt || new Date().toISOString(),
      companyId: ids[0] || companyId || '',
      companyIds: ids,
    };
    resetBuyVisibility();
    saveUser(user);
    localStorage.setItem('zmt_store_code', user.code);
    localStorage.setItem('zmt_store_type', 'branch');
    localStorage.setItem('zmt_parent_code', mainCode);
    localStorage.setItem('zmt_store_password', password);
    if (user.companyId) {
      try { localStorage.setItem('zmt_active_company', user.companyId); } catch {}
    }

    _pullCompaniesInBackground(mainCode);
    reportScope('branch-connect');

    return user;
  }

  // ===== SIGN OUT =====
  function signOut() {
    resetBuyVisibility();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('zmt_store_code');
    localStorage.removeItem('zmt_store_type');
    localStorage.removeItem('zmt_parent_code');
    localStorage.removeItem('zmt_store_password');
    // Leaving a company MUST clear the bound company too, otherwise a fresh login
    // inherits the previous company's scope and can show its data elsewhere.
    try { localStorage.removeItem('zmt_active_company'); } catch (e) {}
    try { localStorage.removeItem('zmt_remembered_company'); } catch (e) {}
    try {
      if (typeof CloudService !== 'undefined' && typeof CloudService.clearAccessToken === 'function') {
        CloudService.clearAccessToken();
      }
    } catch (e) {}
  }

  // Force a fresh login on every app start: clears only the persisted session so
  // isLoggedIn() returns false at boot and the password screen is always shown,
  // while keeping store identity (code/type/parent) intact until real sign-in.
  function requirePasswordOnStart() {
    // Remember the active company for THIS store code BEFORE wiping the session,
    // so the next successful login restores the exact data scope in one step.
    // Otherwise every app start resets to the default/unbound view and edits
    // saved under a company scope look "reverted" the next day. Re-authentication
    // is still required: the session itself is cleared and the binding is only
    // re-applied when the SAME store code logs back in.
    try {
      const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const code = (prev && (prev.code || prev.userId)) || localStorage.getItem('zmt_store_code') || '';
      const companyId = (prev && prev.companyId) || localStorage.getItem('zmt_active_company') || '';
      if (code && companyId) {
        try { localStorage.setItem('zmt_remembered_company', JSON.stringify({ code, companyId })); } catch (e) {}
      }
    } catch (e) {}
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    // A boot starts with no entered company (session fully cleared). The remembered
    // company id is re-validated and restored only after a successful login, so no
    // stale company leaks into the data scope before re-authentication.
    try { localStorage.removeItem('zmt_active_company'); } catch (e) {}
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
    'local-orders': { view: true, edit: false, del: false },
    'invoices': { view: true, edit: true, del: true },
    'customers': { view: true, edit: true, del: true },
    'employees': { view: true, edit: true, del: true },
    'suppliers': { view: true, edit: true, del: true },
    'brands': { view: true, edit: true, del: true },
    'inventory': { view: true, edit: true, del: true },
    'expiry': { view: true, edit: true, del: false },
    'quick-entry': { view: true, edit: true, del: false },
    'supplier-returns': { view: true, edit: true, del: true },
    'debts': { view: true, edit: true, del: true },
    'returns': { view: true, edit: true, del: false },
    'discounts': { view: true, edit: true, del: true },
    'reports': { view: true, edit: false, del: false },
    'zakat': { view: true, edit: false, del: false },
    'net-account': { view: true, edit: false, del: false },
    'expenses': { view: true, edit: true, del: false },
    'settings': { view: false, edit: false, del: false },
    'backup': { view: true, edit: true, del: false },
    'connection': { view: false, edit: false, del: false },
    'store-debts': { view: true, edit: true, del: true },
    'branches-monitor': { view: true, edit: false, del: false },
    'shared-inventory': { view: true, edit: false, del: false },
    'product-details': { view: false, edit: false, del: false },
    'price-display': { view: false, edit: false, del: false },
  };

  const PAGE_NAMES = {
    'dashboard': 'لوحة التحكم',
    'sales': 'المبيعات',
    'orders': 'الطلبات',
    'local-orders': 'الطلبات المحلية',
    'invoices': 'الفواتير',
    'customers': 'العملاء',
    'employees': 'الموظفين',
    'suppliers': 'الموردين',
    'brands': 'العلامات التجارية',
    'inventory': 'المخزون',
    'expiry': 'انتهاء الصلاحية',
    'quick-entry': 'الإدخال السريع',
    'supplier-returns': 'السلع الفاسدة',
    'debts': 'الديون',
    'returns': 'المرتجعات',
    'discounts': 'التخفيضات',
    'reports': 'التقارير',
    'zakat': 'الزكاة',
    'net-account': 'صافي الحساب',
    'expenses': 'المصاريف',
    'settings': 'الاعدادات',
    'backup': 'النسخ الاحتياطي',
    'connection': 'اعدادات الاتصال',
    'store-debts': 'ديون المحلات',
    'branches-monitor': 'مراقبة الفروع',
    'shared-inventory': 'المخزون المشترك',
    'product-details': 'تفاصيل المنتج',
    'price-display': 'شاشة عرض السعر',
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

  // Normalize company assignment. Accepts either a single id or an array and
  // always returns a de-duplicated array of ids (the source of truth for
  // "which companies may this employee log into"). Falls back to the current
  // session's company, then to all companies permitted for this device.
  function _normalizeUserCompanyIds(companyIds) {
    let list = [];
    if (Array.isArray(companyIds)) list = companyIds.slice();
    else if (typeof companyIds === 'string' && companyIds) list = [companyIds];
    else if (companyIds && typeof companyIds === 'object' && companyIds.id) list = [companyIds.id];
    const selfCompany = getCompanyId();
    if (selfCompany && list.indexOf(selfCompany) === -1) list.push(selfCompany);
    const seen = {};
    return list.filter(id => id && !seen[id] && (seen[id] = 1));
  }

  function createUser(username, password, permissions, companyId) {
    const code = getUserCode();
    if (!code) throw new Error('الرجاء تسجيل الدخول أولاً');

    const users = _loadLocalUsers();
    if (users.some(u => u.username === username)) {
      throw new Error('اسم المستخدم موجود مسبقاً');
    }

    const companyIds = _normalizeUserCompanyIds(companyId);
    const newUser = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      username,
      password,
      permissions: permissions || JSON.parse(JSON.stringify(DEFAULT_PAGES)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      storeCode: code,
      companyId: companyIds[0] || companyId || getCompanyId(),
      companyIds: companyIds,
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

    if (updates && ('companyIds' in updates || 'companyId' in updates)) {
      const normalized = _normalizeUserCompanyIds(
        Array.isArray(updates.companyIds) ? updates.companyIds
          : ('companyId' in updates ? updates.companyId : undefined)
      );
      updates.companyIds = normalized;
      if (!('companyId' in updates)) updates.companyId = normalized[0] || '';
    }

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

  function loginAsUser(storeCode, username, password, companyId) {
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

    // Resolve the bound company: explicit selection wins, else the employee's
    // first authorized company.
    const allowed = _userAllowedCompanyIds(user, storeCode);
    let boundCompany = companyId || (allowed.length ? allowed[0] : '');
    if (allowed.length && boundCompany && allowed.indexOf(boundCompany) === -1) {
      boundCompany = allowed[0];
    }

    const authUser = {
      userId: user.id,
      code: storeCode,
      email: '',
      storeType: storeType,
      parentCode: parentCode,
      role: 'user',
      username: user.username,
      permissions: user.permissions,
      companyId: boundCompany,
      companyIds: allowed,
      createdAt: user.createdAt,
    };
    resetBuyVisibility();
    saveUser(authUser);

    localStorage.setItem('zmt_store_code', storeCode);
    localStorage.setItem('zmt_store_type', storeType);
    if (parentCode) localStorage.setItem('zmt_parent_code', parentCode);
    if (authUser.companyId) {
      try { localStorage.setItem('zmt_active_company', authUser.companyId); } catch {}
    } else {
      // No company granted to this employee: clear the key so DB._getCompanyId()
      // never falls back to a company left behind by a previous session.
      try { localStorage.removeItem('zmt_active_company'); } catch {}
    }
    reportScope('user-login');

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

  // ===== BUY PRICE VISIBILITY (owner/manager only) =====
  // سعر الشراء يبدأ ظاهراً للمدير في بداية كل جلسة (الوصول الكامل)، ويمكنه
  // إخفاءه/إظهاره متى شاء بـ Ctrl+X. الموظفون (role=user) محكومون بالصلاحيات
  // ولا يتأثرون بهذا المفتاح إطلاقاً — السعر لا يظهر لهم أبداً.
  let _buyVisible = true;

  function resetBuyVisibility() {
    _buyVisible = true;
  }

  function buyPriceVisible() {
    return isManager() && _buyVisible;
  }

  function toggleBuyPrice() {
    _buyVisible = !_buyVisible;
    return _buyVisible;
  }

  function getRole() {
    const user = getCurrentUser();
    return user ? (user.role || (user.storeType === 'branch' ? 'manager' : 'admin')) : '';
  }

  // ===== MULTI-COMPANY =====
  // The active company belongs to the current session. Users can belong to a
  // company (companyId set) or be run-level admins managing multiple companies.
  function getCompanyId() {
    const user = getCurrentUser();
    return user ? (user.companyId || '') : '';
  }

  // ===== SCOPE DIAGNOSTICS =====
  // Writes a small ring-buffer record (localStorage zmt_scope_log / zmt_last_scope)
  // of the active data scope whenever it changes (boot, login, company enter).
  // Invisible to the user, zero cost — used only to diagnose "my edit reverted"
  // reports: the stored row shows which company/store the session was scoped to.
  function reportScope(tag) {
    try {
      const row = {
        at: new Date().toISOString(),
        tag: tag || '',
        cid: getCompanyId(),
        ls: localStorage.getItem('zmt_active_company') || '',
        store: getUserCode(),
        companies: 0,
      };
      try {
        if (typeof DB !== 'undefined' && DB.getCompanies) {
          row.companies = (DB.getCompanies() || []).length;
        }
      } catch (e) {}
      try {
        localStorage.setItem('zmt_last_scope', JSON.stringify(row));
        const arr = JSON.parse(localStorage.getItem('zmt_scope_log') || '[]');
        arr.push(row);
        while (arr.length > 12) arr.shift();
        localStorage.setItem('zmt_scope_log', JSON.stringify(arr));
      } catch (e) {}
      console.info('[Scope]', JSON.stringify(row));
    } catch (e) {}
  }

  function getCompanyName() {
    try {
      if (typeof DB !== 'undefined' && DB.getCompany && getCompanyId()) {
        const c = DB.getCompany(getCompanyId());
        if (c && c.name) return c.name;
      }
    } catch (e) {}
    return '';
  }

  function getActiveCompany() {
    const id = getCompanyId();
    if (!id) return null;
    try {
      if (typeof DB !== 'undefined' && DB.getCompany) return DB.getCompany(id) || null;
    } catch (e) {}
    return { id };
  }

  // Switch the current session's active company (admin only). Non-admin users
  // stay locked to their own companyId.
  function setActiveCompany(companyId) {
    const user = getCurrentUser();
    if (!user) return false;
    if (user.role && user.role !== 'user') {
      user.companyId = companyId || '';
      saveUser(user);
      if (companyId) {
        try { localStorage.setItem('zmt_active_company', companyId); } catch {}
      } else {
        try { localStorage.removeItem('zmt_active_company'); } catch {}
      }
      reportScope('set-active-company');
      return true;
    }
    return false;
  }

  function getDeviceId() {
    let deviceId = localStorage.getItem('zmt_device_id');
    if (!deviceId) {
      deviceId = generateCode() + '-' + Date.now().toString(36);
      localStorage.setItem('zmt_device_id', deviceId);
    }
    return deviceId;
  }

  // Companies that are allowed for the current device (its store/branch code).
  // Delegates to DB so the same filtering (incl. global companies) is shared.
  function getCompaniesForThisDevice() {
    const code = getUserCode();
    try {
      if (typeof DB !== 'undefined' && DB.getCompaniesForStore) {
        return DB.getCompaniesForStore(code);
      }
    } catch (e) {}
    return [];
  }

  // Bind an arbitrary company to the current session (used at login time for
  // cashiers/branches). Unlike setActiveCompany (admin-only), this works for any
  // session so a logged-in employee is scoped to the selected company.
  function _bindCompanyToSession(companyId) {
    const user = getCurrentUser();
    if (!user) return;
    user.companyId = companyId || '';
    saveUser(user);
    if (companyId) {
      try { localStorage.setItem('zmt_active_company', companyId); } catch {}
    } else {
      try { localStorage.removeItem('zmt_active_company'); } catch {}
    }
    reportScope('bind-company');
  }

  // The companies an employee may log into on THIS device/role/company context:
  //  - explicit user.companyIds[] (the multi-company assignment made by the
  //    owner), intersected with the companies authorized for the user's store
  //    code (so a branch owner cannot expose companies not granted to the branch)
  //  - fallback: all companies authorized for the user's store code.
  function _userAllowedCompanyIds(user, storeCode) {
    const code = storeCode || user.storeCode || getUserCode();
    const storeCompanies = (typeof DB !== 'undefined' && DB.getCompaniesForStore)
      ? (function(){ try { return DB.getCompaniesForStore(code); } catch (e) { return []; } })()
      : [];
    const storeIds = storeCompanies.map(function (c) { return c.id; });
    const explicit = Array.isArray(user.companyIds) ? user.companyIds.slice()
      : (user.companyId ? [user.companyId] : []);
    if (explicit.length) {
      return explicit.filter(function (id) { return storeIds.indexOf(id) !== -1; }) || [];
    }
    return storeIds;
  }

  // Public helper for the login screen: full list of companies available to a
  // given login context, merged with full company objects (for the dropdown).
  //   - role='owner' / manager: all companies saved on this device
  //   - role='user': the user's companyIds ∩ store-authorized
  //   - role='branch'/code: companies authorized for that branch code
  function getLoginCompaniesForUser(userOrRole, code) {
    var companies = [];
    try { companies = (typeof DB !== 'undefined' && DB.getCompanies) ? DB.getCompanies() : []; }
    catch (e) { companies = []; }
    if (!companies.length) return [];

    var role = (typeof userOrRole === 'string') ? userOrRole : (userOrRole && userOrRole.role);
    var srcCode = code || (userOrRole && (userOrRole.storeCode || userOrRole.code)) || getUserCode();

    if (!role || role === 'owner' || role === 'manager' || role === 'admin') {
      return companies;
    }
    if (role === 'branch' || role === 'sub') {
      return (typeof DB !== 'undefined' && DB.getCompaniesForStore)
        ? (function(){ try { return DB.getCompaniesForStore(srcCode); } catch (e) { return []; } })()
        : [];
    }
    // employee / cashier
    var storeCompanies = (typeof DB !== 'undefined' && DB.getCompaniesForStore)
      ? (function(){ try { return DB.getCompaniesForStore(srcCode); } catch (e) { return []; } })()
      : [];
    var storeIds = storeCompanies.map(function (c) { return c.id; });
    var explicit = Array.isArray(userOrRole.companyIds) ? userOrRole.companyIds.slice()
      : (userOrRole.companyId ? [userOrRole.companyId] : []);
    if (explicit.length) {
      return companies.filter(function (c) { return explicit.indexOf(c.id) !== -1 && storeIds.indexOf(c.id) !== -1; });
    }
    return storeCompanies;
  }

  // ===== COMPANY MANAGER LOGIN =====
  // Login as the manager of a specific company. Verifies the company's password
  // (configured in the DB.companies record) then opens a session bound to that
  // companyId. Requires an existing company password chain.
  async function _getCompanyPassData(companyId) {
    try {
      if (typeof DB !== 'undefined' && DB.getCompany) {
        const c = DB.getCompany(companyId);
        if (c && c.passwordHash && c.passwordSalt) {
          return { hash: c.passwordHash, salt: c.passwordSalt, company: c };
        }
        if (c) return { company: c, plain: c.password || '' };
      }
    } catch (e) {}
    return null;
  }

  async function verifyCompanyPassword(companyId, password) {
    const data = await _getCompanyPassData(companyId);
    if (!data) return false;
    if (data.hash && data.salt) {
      return await verifyPasswordHash(password, data.hash, data.salt);
    }
    return !!data.plain && data.plain === password;
  }

  // Admin/manager enters a company by code. `password` is the company password
  // when one is set; otherwise the caller (e.g. an admin) is already authorized.
  async function enterCompany(companyId, password) {
    const cid = companyId || '';
    if (!cid) throw new Error('معرف الشركة غير صحيح');
    if (password) {
      const ok = await verifyCompanyPassword(cid, password);
      if (!ok) throw new Error('كلمة مرور الشركة غير صحيحة');
    }
    // Refuse to bind on an empty/foreign session: the previous code did
    // `getCurrentUser() || {}` and then saved the result, producing a session
    // record with no userId/code at all (a corrupted identity that then scopes
    // data through DB._getCompanyId()). Re-authentication is mandatory.
    const current = getCurrentUser();
    if (!current || !(current.code || current.userId)) {
      throw new Error('يجب تسجيل الدخول أولاً قبل اختيار الشركة');
    }
    const user = Object.assign({}, current, {
      companyId: cid,
      // Preserve the real role. Falling back to 'admin' only when the session
      // carries no role at all (legacy record) keeps an employee's 'user' role
      // intact instead of silently widening it.
      role: current.role || 'admin',
      enteredCompany: true,
    });
    saveUser(user);
    try { localStorage.setItem('zmt_active_company', cid); } catch {}
    // Remember the binding for the next boot's loginWithCode (same store code).
    try {
      const code = getUserCode();
      if (code) {
        localStorage.setItem('zmt_remembered_company', JSON.stringify({ code, companyId: cid }));
      }
    } catch (e) {}
    reportScope('enter-company');
    return user;
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
    saveUser,
    updateSession,
    startLocalSession,
    isLoggedIn,
    requirePasswordOnStart,
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
    getRole,
    buyPriceVisible,
    toggleBuyPrice,
    resetBuyVisibility,
    getCompanyId,
    getCompanyName,
    getActiveCompany,
    setActiveCompany,
    getCompaniesForThisDevice,
    getLoginCompaniesForUser,
    getDeviceId,
    verifyCompanyPassword,
    enterCompany,
    reportScope,
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
