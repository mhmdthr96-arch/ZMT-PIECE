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

  // ===== ACCOUNT CREATION =====
  async function createAccount(email) {
    const supabase = _getDB();
    if (!supabase) throw new Error('الرجاء الاتصال بالسحابة أولاً');

    const { data: existing } = await supabase.from('stores').select('*').eq('email', email).single();
    if (existing) {
      const user = {
        userId: existing.id,
        code: existing.code,
        email: existing.email,
        storeType: 'main',
        parentCode: '',
        createdAt: existing.created_at,
      };
      saveUser(user);
      localStorage.setItem('zmt_store_code', user.code);
      localStorage.setItem('zmt_store_type', 'main');
      return { user, isNew: false };
    }

    let code;
    let codeExists = true;
    while (codeExists) {
      code = generateCode();
      const { data: check } = await supabase.from('stores').select('id').eq('code', code).single();
      codeExists = !!check;
    }

    const tempAuthPass = 'zmt_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    const { error: insertErr } = await supabase.from('stores').insert({
      code,
      email,
      store_name: 'ZMT PIECE',
      auth_password: tempAuthPass,
    });
    if (insertErr) throw new Error('فشل إنشاء الحساب: ' + insertErr.message);

    try {
      const { error: authErr } = await supabase.auth.signUp({
        email,
        password: tempAuthPass,
        options: { data: { store_code: code } },
      });
      if (authErr) {
        console.warn('[Auth] Supabase Auth signUp error:', authErr.message);
      } else {
        console.log('[Auth] Supabase Auth signUp success for:', email);
      }
    } catch (e) {
      console.warn('[Auth] Supabase Auth signUp exception:', e.message);
    }

    const user = { userId: code, code, email, storeType: 'main', parentCode: '', createdAt: new Date().toISOString() };
    saveUser(user);
    localStorage.setItem('zmt_store_code', code);
    localStorage.setItem('zmt_store_type', 'main');

    return { user, isNew: true };
  }

  // ===== LOGIN =====
  async function loginWithCode(code) {
    const supabase = _getDB();
    if (!supabase) throw new Error('الرجاء الاتصال بالسحابة أولاً');

    const { data: store } = await supabase.from('stores').select('*').eq('code', code).single();
    if (!store) throw new Error('الرمز غير صحيح أو غير موجود');

    const user = {
      userId: store.id,
      code: store.code,
      email: store.email,
      storeType: 'main',
      parentCode: '',
      createdAt: store.created_at,
    };
    saveUser(user);
    localStorage.setItem('zmt_store_code', user.code);
    localStorage.setItem('zmt_store_type', 'main');

    return user;
  }

  async function loginAsBranch(branchCode) {
    const supabase = _getDB();
    if (!supabase) throw new Error('الرجاء الاتصال بالسحابة أولاً');

    const { data: branch } = await supabase.from('branches').select('*, stores(*)').eq('code', branchCode).single();
    if (!branch) throw new Error('الرمز غير صحيح أو غير موجود');

    const user = {
      userId: branch.code,
      code: branch.code,
      email: '',
      storeType: 'branch',
      parentCode: branch.stores?.code || '',
      branchName: branch.name,
      createdAt: branch.created_at,
    };
    saveUser(user);
    localStorage.setItem('zmt_store_code', user.code);
    localStorage.setItem('zmt_store_type', 'branch');
    localStorage.setItem('zmt_parent_code', user.parentCode);

    return user;
  }

  async function connectAsBranch(mainCode, password) {
    const supabase = _getDB();
    if (!supabase) throw new Error('الرجاء الاتصال بالسحابة أولاً');

    const { data: store } = await supabase.from('stores').select('id').eq('code', mainCode).single();
    if (!store) throw new Error('الرمز الرئيسي غير موجود');

    const { data: branch } = await supabase.from('branches')
      .select('*').eq('store_id', store.id).eq('password', password).single();
    if (!branch) throw new Error('كلمة المرور غير صحيحة');

    const user = {
      userId: branch.code,
      code: branch.code,
      email: '',
      storeType: 'branch',
      parentCode: mainCode,
      branchName: branch.name,
      createdAt: branch.created_at,
    };
    saveUser(user);
    localStorage.setItem('zmt_store_code', user.code);
    localStorage.setItem('zmt_store_type', 'branch');
    localStorage.setItem('zmt_parent_code', mainCode);

    return user;
  }

  // ===== SIGN OUT =====
  function signOut() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('zmt_store_code');
    localStorage.removeItem('zmt_store_type');
    localStorage.removeItem('zmt_parent_code');
    localStorage.removeItem('zmt_store_password');
  }

  function isSupabaseConfigured() {
    return typeof CloudService !== 'undefined' && CloudService.isCloudConnected();
  }

  // ===== STORE PASSWORD =====
  async function setStorePassword(password) {
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
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const { data: store } = await supabase.from('stores').select('password_hash, password_salt').eq('code', code).single();
    if (!store) {
      const { data: branch } = await supabase.from('branches').select('password').eq('code', code).single();
      if (branch) return branch.password === password;
      throw new Error('الرمز غير موجود');
    }

    if (store.password_hash && store.password_salt) {
      return await verifyPasswordHash(password, store.password_hash, store.password_salt);
    }
    return !password;
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

  // ===== PASSWORD RECOVERY (Direct lookup by email) =====
  async function recoverByEmail(email) {
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const { data: store } = await supabase.from('stores').select('code, email, password_plain, store_name').eq('email', email).single();
    if (!store) throw new Error('البريد الإلكتروني غير مسجل في النظام');

    return {
      code: store.code,
      email: store.email,
      storeName: store.store_name || 'ZMT PIECE',
      password: store.password_plain || '',
      hasPassword: !!(store.password_plain),
    };
  }

  async function resetPasswordByEmail(email, newPassword) {
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const { data: store } = await supabase.from('stores').select('*').eq('email', email).single();
    if (!store) throw new Error('البريد غير مسجل');

    const { hash, salt } = await hashPassword(newPassword);

    const { error } = await supabase.from('stores').update({
      password_hash: hash,
      password_salt: salt,
      password_plain: newPassword,
      last_password_hash: store.password_hash || '',
      last_password_salt: store.password_salt || '',
    }).eq('id', store.id);
    if (error) throw new Error('فشل حفظ كلمة المرور: ' + error.message);

    _saveLocalPassData(store.code, hash, salt);

    return store.code;
  }

  async function removePasswordByEmail(email) {
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const { data: store } = await supabase.from('stores').select('id, code').eq('email', email).single();
    if (!store) throw new Error('البريد غير مسجل');

    const { error } = await supabase.from('stores').update({
      password_hash: '',
      password_salt: '',
      password_plain: '',
    }).eq('id', store.id);
    if (error) throw new Error('فشل حفظ التغييرات: ' + error.message);

    return store.code;
  }

  async function getRecoveryInfo(email) {
    const supabase = _getDB();
    if (!supabase) return null;

    const { data: store } = await supabase.from('stores').select('*').eq('email', email).single();
    if (!store) return null;
    return {
      code: store.code,
      email: store.email,
      storeType: 'main',
      hasPassword: !!(store.password_hash && store.password_salt),
    };
  }

  // ===== BRANCHES =====
  async function createBranch(name, password) {
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
    });
    if (error) throw new Error('فشل إنشاء الفرع: ' + error.message);

    return { code: branchCode, name, password };
  }

  async function listBranchesFull(mainCode) {
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
      parentCode: code,
      createdAt: b.created_at,
    }));
  }

  async function deleteBranch(branchCode) {
    const supabase = _getDB();
    if (!supabase) throw new Error('Supabase غير متصل');

    const { error } = await supabase.from('branches').delete().eq('code', branchCode);
    if (error) throw new Error('فشل حذف الفرع: ' + error.message);

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

      const text = await data.text();
      const backup = JSON.parse(text);
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

      const text = await data.text();
      const backup = JSON.parse(text);
      if (!backup.data) throw new Error('النسخة فارغة');

      return { backup, storeType: 'branch', parentCode: mainCode, name: branch.name, users: null, storePassword: '' };
    }

    throw new Error('الرمز غير صحيح أو غير موجود');
  }

  // ===== USERS MANAGEMENT (LOCAL STORAGE) =====
  const DEFAULT_PAGES = {
    'dashboard': { view: true, edit: false, del: false },
    'sales': { view: true, edit: true, del: false },
    'invoices': { view: true, edit: true, del: true },
    'customers': { view: true, edit: true, del: true },
    'suppliers': { view: true, edit: true, del: true },
    'brands': { view: true, edit: true, del: true },
    'inventory': { view: true, edit: true, del: true },
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
    'invoices': 'الفواتير',
    'customers': 'العملاء',
    'suppliers': 'الموردين',
    'brands': 'العلامات التجارية',
    'inventory': 'المخزون',
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
      storeCode: code,
    };

    users.push(newUser);
    _saveLocalUsers(users);

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

    Object.assign(users[idx], updates);
    _saveLocalUsers(users);
    return true;
  }

  function deleteUser(userId) {
    const users = _loadLocalUsers();
    const filtered = users.filter(u => u.id !== userId);
    if (filtered.length === users.length) throw new Error('المستخدم غير موجود');
    _saveLocalUsers(filtered);
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
    getPermissions,
    canView,
    canEdit,
    canDelete,
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
