// ============================================================
// ZMT Login Page Logic
// ============================================================

let _loginCurrentAction = 'manager';

// Pending manager credentials after password verification — the
// company selection step comes next before final login.
let _managerPendingCode = '';
let _managerPendingPassword = '';

async function initLoginView() {
  if (typeof ensureLoginHtml === 'function') await ensureLoginHtml();
  _bindLoginCompanyLoaders();
  if (Auth.isLoggedIn()) {
    hideLogin();
    return;
  }
  // Restore the last-used store code so the user doesn't have to re-type it.
  try {
    const lastCode = localStorage.getItem('zmt_last_code') || '';
    const mc = document.getElementById('loginManagerCode');
    const uc = document.getElementById('loginUserCode');
    const bc = document.getElementById('loginBranchCode');
    if (lastCode && mc && !mc.value) mc.value = lastCode;
    if (lastCode && uc && !uc.value) uc.value = lastCode;
    if (lastCode && bc && !bc.value) bc.value = lastCode;
  } catch (e) {}
  showLogin();
}

// Attach per-tab company loaders: whenever the user types a valid
// 10-digit code in any tab, load the matching companies into the
// dropdown (and refresh the employee list on the user tab).
function _bindLoginCompanyLoaders() {
  const userCode = document.getElementById('loginUserCode');
  if (userCode && !userCode.dataset.companyBound) {
    userCode.dataset.companyBound = '1';
    userCode.addEventListener('input', () => {
      const c = userCode.value.trim();
      if (/^\d{10}$/.test(c)) {
        loginLoadCompanies(c, 'loginUserCompany', 'loginUserCompanyField', true);
        loginLoadEmployeeList(c);
      } else {
        const field = document.getElementById('loginUserCompanyField');
        if (field) field.style.display = 'none';
        const empList = document.getElementById('loginEmployeeList');
        if (empList) empList.innerHTML = '';
      }
    });
  }
  const branchCode = document.getElementById('loginBranchCode');
  if (branchCode && !branchCode.dataset.companyBound) {
    branchCode.dataset.companyBound = '1';
    branchCode.addEventListener('input', () => {
      const c = branchCode.value.trim();
      if (/^\d{10}$/.test(c)) {
        loginLoadCompanies(c, 'loginBranchCompany', 'loginBranchCompanyField', true);
      } else {
        const field = document.getElementById('loginBranchCompanyField');
        if (field) field.style.display = 'none';
      }
    });
  }
  const managerCode = document.getElementById('loginManagerCode');
  if (managerCode && !managerCode.dataset.companyBound) {
    managerCode.dataset.companyBound = '1';
    managerCode.addEventListener('input', () => {
      const c = managerCode.value.trim();
      if (/^\d{10}$/.test(c)) {
        loginLoadCompanies(c, 'loginManagerCompany', 'loginManagerCompanyField', true);
      } else {
        const field = document.getElementById('loginManagerCompanyField');
        if (field) field.style.display = 'none';
      }
    });
    // If the field was pre-filled (from localStorage), trigger the loader.
    if (managerCode.value.trim().length === 10) {
      loginLoadCompanies(managerCode.value.trim(), 'loginManagerCompany', 'loginManagerCompanyField', true);
    }
  }
}

async function showLogin() {
  _managerPendingCode = '';
  _managerPendingPassword = '';
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'flex';
  const app = document.querySelector('.app-container');
  if (app) app.style.display = 'none';
  if (typeof ensureLoginHtml === 'function') await ensureLoginHtml();
  resetLoginForm();
  setTimeout(() => {
    const firstInput = document.getElementById('loginManagerCode');
    if (firstInput) firstInput.focus();
  }, 100);
}

function resetLoginForm() {
  _managerPendingCode = '';
  _managerPendingPassword = '';
  // Reuse the last-entered code (persisted and never wiped) so the 10-digit
  // code the user typed stays visible even after signing out, falling back to
  // the persisted store identity when the last code isn't available yet.
  const savedCode = (typeof localStorage !== 'undefined')
    ? (localStorage.getItem('zmt_last_code') || localStorage.getItem('zmt_store_code') || '') : '';
  ['loginManagerCode','loginUserCode','loginBranchCode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = savedCode;
  });
  ['loginManagerPassword','loginUserPassword','loginBranchPassword','loginEmail','loginPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['loginManagerStatus','loginUserStatus','loginCreateStatus','loginBranchStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  ['recoveryEmail','recoveryNewPass','recoveryConfirmPass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const ers = document.getElementById('recoveryEmailStatus');
  if (ers) ers.textContent = '';
  const rrs = document.getElementById('recoveryResetStatus');
  if (rrs) rrs.textContent = '';
  recoveryShowStep(1);
  loginSwitchAction('manager');
}

function hideLogin() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'none';
  const app = document.querySelector('.app-container');
  if (app) app.style.display = '';
}

function loginSwitchAction(action) {
  _loginCurrentAction = action;
  document.querySelectorAll('.login-tab').forEach(t => { if (t) t.classList.remove('active'); });
  const tab = document.querySelector(`.login-tab[data-action="${action}"]`);
  if (tab) tab.classList.add('active');
  document.querySelectorAll('.login-action').forEach(a => { if (a) a.style.display = 'none'; });
  const map = {
    manager: 'loginActionManager',
    user: 'loginActionUser',
    create: 'loginActionCreate',
    branch: 'loginActionBranch',
  };
  const target = document.getElementById(map[action]);
  if (target) target.style.display = '';

  // Populate the company dropdown for tabs that support it.
  // All three tabs operate from a main-store code (the field is the main store
  // / branch onboarding code), so we surface every company saved for that main
  // store here. Per-branch company scoping (storeCodes) is enforced later inside
  // the monitoring/shared-inventory views using the resolved storeType, not here.
  if (action === 'manager') {
    const mc = document.getElementById('loginManagerCode') ? document.getElementById('loginManagerCode').value.trim() : '';
    loginLoadCompanies(mc, 'loginManagerCompany', 'loginManagerCompanyField', true);
  } else if (action === 'user') {
    const code = document.getElementById('loginUserCode').value.trim();
    loginLoadCompanies(code, 'loginUserCompany', 'loginUserCompanyField', true);
    loginLoadEmployeeList(code);
  } else if (action === 'branch') {
    const code = document.getElementById('loginBranchCode').value.trim();
    loginLoadCompanies(code, 'loginBranchCompany', 'loginBranchCompanyField', true);
  }
}

// Unified company loader for all tabs. `all` (manager) shows every
// company saved on this device; otherwise only companies authorized
// for the given store/branch code.
function loginLoadCompanies(storeCode, selectId, fieldId, all) {
  const select = document.getElementById(selectId);
  const field = document.getElementById(fieldId);
  if (!select) return;
  let companies = [];
  try {
    if (all) {
      companies = (typeof DB !== 'undefined' && DB.getCompanies) ? DB.getCompanies() : [];
    } else if (storeCode) {
      companies = (typeof DB !== 'undefined' && DB.getCompaniesForStore)
        ? DB.getCompaniesForStore(storeCode) : [];
    }
  } catch (e) { companies = []; }
  const placeholder = (companies.length > 1) ? (window.t ? window.t('login.chooseCompany') : 'اختر الشركة') : '';
  select.innerHTML = '<option value="">' + placeholder + '</option>';
  companies.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });
  if (field) {
    field.style.display = (companies.length > 1) ? '' : (companies.length === 1 ? '' : 'none');
  }
  if (!companies.length) {
    select.value = '';
    return;
  }
  // Always settle on a concrete company so login can never fall back to the
  // default by accident: auto-select the user's last-entered company, else the
  // first available company. (One-company case simply selects that one.)
  let chosen = '';
  try { chosen = localStorage.getItem('zmt_active_company') || ''; } catch {}
  const exists = companies.some(c => c.id === chosen);
  select.value = (exists && chosen) ? chosen : companies[0].id;
}

// Populate the employee list panel for the current branch/store code.
function loginLoadEmployeeList(storeCode) {
  const list = document.getElementById('loginEmployeeList');
  if (!list) return;
  if (!storeCode || storeCode.length !== 10) {
    list.innerHTML = '';
    return;
  }
  // Read employees directly from localStorage using the store code —
  // Auth.listUsers() requires an active session which doesn't exist yet at
  // login time, so it always returns [].
  let users = [];
  try {
    users = JSON.parse(localStorage.getItem('zmt_users_' + storeCode) || '[]');
  } catch (e) { users = []; }
  if (!users.length) {
    list.innerHTML = '<div style="padding:8px;font-size:12px;color:#999;">لا يوجد موظفين مسجّلين</div>';
    return;
  }
  list.innerHTML = users.map(u => {
    const id = (u.id || '').replace(/'/g, "\\'");
    const name = (u.username || '').replace(/'/g, "\\'");
    return `<div class="login-employee-item" data-employee-id="${id}" data-employee-name="${name}"
      style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--silver-200);font-size:13px;"
      onclick="loginSelectEmployee('${id}','${name}')"
      onmouseover="this.style.background='var(--silver-100)'" onmouseout="this.style.background=''">
      <i class="fas fa-user" style="color:var(--bmw-blue-1)"></i>
      <span>${name}</span>
    </div>`;
  }).join('');
}

function loginToggleEmployeeList() {
  const list = document.getElementById('loginEmployeeList');
  if (!list) return;
  list.style.display = (list.style.display === 'none' || !list.style.display) ? '' : 'none';
}

// Select an employee from the panel into the username field.
function loginSelectEmployee(id, name) {
  const userEl = document.getElementById('loginUserUsername');
  if (userEl) userEl.value = name;
  const list = document.getElementById('loginEmployeeList');
  if (list) list.style.display = 'none';
}

async function loginManagerDo() {
  const code = document.getElementById('loginManagerCode').value.trim();
  const password = document.getElementById('loginManagerPassword').value;
  const status = document.getElementById('loginManagerStatus');

  if (!code || code.length !== 10 || !/^\d{10}$/.test(code)) {
    status.innerHTML = '<span style="color:#dc3545;">الرمز يجب أن يكون 10 أرقام</span>';
    return;
  }

  status.innerHTML = '<span style="color:#0066B1;">جاري الدخول...</span>';

  let verified = false;
  try {
    await Auth.loginWithCode(code);
    try {
      const v = await Auth.verifyCloudPassword(code, password || '');
      if (v) verified = true;
    } catch (e) {
      if (password) {
        status.innerHTML = '<span style="color:#dc3545;">كلمة مرور المحل غير صحيحة</span>';
        Auth.signOut();
        return;
      }
    }
  } catch (e) { /* fall through to offline */ }

  if (!verified) {
    if (!Auth.hasLocalPassData(code)) {
      status.innerHTML = '<span style="color:#dc3545;">لا يمكن الدخول بدون إنترنت لأول مرة</span>';
      return;
    }
    try {
      const v = await Auth.verifyLocalPassword(code, password || '');
      if (!v) {
        status.innerHTML = '<span style="color:#dc3545;">كلمة المرور غير صحيحة</span>';
        return;
      }
    } catch (e) {
      status.innerHTML = '<span style="color:#dc3545;">خطأ: ' + e.message + '</span>';
      return;
    }
  }

  if (password) {
    localStorage.setItem('zmt_store_password', password);
    const { hash, salt } = await Auth.hashPassword(password);
    localStorage.setItem('zmt_local_pass', JSON.stringify({ code, hash, salt }));
  }
  // Store pending credentials for the company-selection step.
  _managerPendingCode = code;
  _managerPendingPassword = password;
  // Remember the code so it's pre-filled on next login.
  try { localStorage.setItem('zmt_last_code', code); } catch {}
  // Show the company selection step.
  const field = document.getElementById('loginManagerCompanyField');
  if (field) field.style.display = '';
  loginLoadCompanies(code, 'loginManagerCompany', 'loginManagerCompanyField', true);
  status.innerHTML = '<span style="color:#0066B1;">اختر الشركة التي تريد الدخول إليها</span>';
  // Swap the button action to finalize the login.
  const btn = document.querySelector('#loginActionManager .login-btn-primary');
  if (btn) {
    btn.setAttribute('onclick', '_loginManagerFinalize()');
    const span = btn.querySelector('span');
    if (span) span.textContent = (window.t && window.t('login.enterNow')) || 'دخول';
    btn.querySelector('i').setAttribute('class', 'fas fa-arrow-right');
  }
  return;
}

// Complete the manager login: the company was chosen from the
// dropdown (or auto-selected) and the credentials are already
// verified. Bind the selected company to the session and enter.
function _loginManagerFinalize() {
  const companySel = document.getElementById('loginManagerCompany');
  const companyId = companySel ? companySel.value : '';
  const status = document.getElementById('loginManagerStatus');
  const code = _managerPendingCode;
  const password = _managerPendingPassword;

  if (!code) {
    status.innerHTML = '<span style="color:#dc3545;">خطأ في الجلسة، حاول مجدداً</span>';
    return;
  }

  // Never bind an empty company: a blank selection would silently scope to the
  // default company. Require an explicit, existing choice instead.
  if (!companyId) {
    status.innerHTML = '<span style="color:#dc3545;">' + ((window.t && window.t('login.needCompany')) || 'الرجاء اختيار الشركة أولاً') + '</span>';
    return;
  }

  // Ensure the session record is fresh from the server, then bind
  // the selected company. BOTH outcomes share one binder: when the server
  // lookup rejects (shop machine has no internet), no session exists yet and
  // updateSession() alone would silently no-op — leaving the app session-less
  // and view-only. _finishManagerLogin() creates the manager session locally
  // in that case, from the credentials already verified in step 1.
  const _enterManager = function () {
    _finishManagerLogin(code, companyId);
    // Restore the button.
    const btn = document.querySelector('#loginActionManager .login-btn-primary');
    if (btn) {
      btn.setAttribute('onclick', 'loginManagerDo()');
      const span = btn.querySelector('span');
      if (span) span.textContent = (window.t && window.t('login.loginManager')) || 'دخول كمدير';
      btn.querySelector('i').setAttribute('class', 'fas fa-user-shield');
    }
    _managerPendingCode = '';
    _managerPendingPassword = '';
    loginShowDashboard();
  };

  try {
    Auth.loginWithCode(code).then(_enterManager, _enterManager);
  } catch (e) {
    _enterManager();
  }
}

// Bind the chosen company to the manager session — runs on the online path
// (loginWithCode resolved, session already persisted with role=admin) and on
// the offline fallback (rejected: verify offline via zmt_local_pass data).
function _finishManagerLogin(code, companyId) {
  try {
    const cur = (typeof Auth.getCurrentUser === 'function') ? Auth.getCurrentUser() : null;
    if (cur && typeof Auth.updateSession === 'function') {
      // getCurrentUser() re-parses localStorage on every call, so the old
      // read→mutate→(never saved) sequence threw every change away and the
      // session kept the previous company/scope. updateSession() persists.
      Auth.updateSession({
        companyId: companyId,
        companyIds: companyId ? [companyId] : [],
        role: 'owner',
      });
    } else if (typeof Auth.startLocalSession === 'function') {
      // Offline first login on this boot: build the full manager session from
      // verified local credentials so the app never starts session-less.
      Auth.startLocalSession({
        userId: code,
        code: code,
        email: '',
        storeType: 'main',
        parentCode: '',
        role: 'owner',
        companyId: companyId,
        companyIds: companyId ? [companyId] : [],
      });
    }
    // Keep the localStorage mirror in step with the session — DB._getCompanyId()
    // treats the two as interchangeable sources of truth.
    try { localStorage.setItem('zmt_active_company', companyId); } catch {}
    // The user explicitly chose a company today — remember it for the next
    // boot so the daily login restores it automatically in one step.
    try { localStorage.setItem('zmt_remembered_company', JSON.stringify({ code: code, companyId: companyId })); } catch (e) {}
  } catch (e2) {}
}

async function loginUserDo() {
  const storeCode = document.getElementById('loginUserCode').value.trim();
  const username = document.getElementById('loginUserUsername').value.trim();
  const password = document.getElementById('loginUserPassword').value;
  const status = document.getElementById('loginUserStatus');

  if (!storeCode || storeCode.length !== 10 || !/^\d{10}$/.test(storeCode)) {
    status.innerHTML = '<span style="color:#dc3545;">الرجاء إدخال كود المحل (10 أرقام)</span>';
    return;
  }
  if (!username) {
    status.innerHTML = '<span style="color:#dc3545;">الرجاء إدخال اسم المستخدم</span>';
    return;
  }
  if (!password) {
    status.innerHTML = '<span style="color:#dc3545;">الرجاء إدخال كلمة المرور</span>';
    return;
  }

  status.innerHTML = '<span style="color:#0066B1;">جاري الدخول...</span>';

  try {
    const companyId = document.getElementById('loginUserCompany') ? document.getElementById('loginUserCompany').value : '';
    await Auth.loginAsUser(storeCode, username, password, companyId);
    try { localStorage.setItem('zmt_last_code', storeCode); } catch {}
    loginShowDashboard();
  } catch (e) {
    status.innerHTML = '<span style="color:#dc3545;">خطأ: ' + e.message + '</span>';
  }
}

async function loginCreateAccount() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword') ? document.getElementById('loginPassword').value : '';
  const status = document.getElementById('loginCreateStatus');

  if (!email || !email.includes('@')) {
    status.innerHTML = '<span style="color:#dc3545;">الرجاء إدخال بريد صحيح</span>';
    return;
  }
  if (password && password.length < 4) {
    status.innerHTML = '<span style="color:#dc3545;">كلمة المرور يجب أن تكون 4 أحرف على الأقل</span>';
    return;
  }

  status.innerHTML = '<span style="color:#0066B1;">جاري إنشاء الحساب...</span>';

  try {
    const result = await Auth.createAccount(email, password || '');
    if (password) {
      localStorage.setItem('zmt_store_password', password);
      const { hash, salt } = await Auth.hashPassword(password);
      localStorage.setItem('zmt_local_pass', JSON.stringify({ code: result.user.code, hash, salt }));
    }
    document.getElementById('loginGeneratedCode').textContent = result.user.code;
    document.getElementById('loginStep1').style.display = 'none';
    document.getElementById('loginStep2').style.display = '';
    document.getElementById('loginSubtitle').textContent = 'حسابك جاهز!';
  } catch (e) {
    status.innerHTML = '<span style="color:#dc3545;">خطأ: ' + e.message + '</span>';
  }
}

async function loginConnectBranch() {
  const mainCode = document.getElementById('loginBranchCode').value.trim();
  const password = document.getElementById('loginBranchPassword').value;
  const status = document.getElementById('loginBranchStatus');

  if (!mainCode || mainCode.length !== 10 || !/^\d{10}$/.test(mainCode)) {
    status.innerHTML = '<span style="color:#dc3545;">الرمز يجب أن يكون 10 أرقام</span>';
    return;
  }

  if (!password) {
    status.innerHTML = '<span style="color:#dc3545;">الرجاء إدخال كلمة المرور</span>';
    return;
  }

  status.innerHTML = '<span style="color:#0066B1;">جاري الاتصال...</span>';

  try {
    const companyId = document.getElementById('loginBranchCompany') ? document.getElementById('loginBranchCompany').value : '';
    // Post-validate: ensure the selected company belongs to this main store.
    // (Branch storeCodes scoping is applied later, inside monitoring views.)
    if (companyId) {
      const all = (typeof DB !== 'undefined' && DB.getCompanies) ? DB.getCompanies() : [];
      const permittedIds = all.map(c => c.id);
      if (permittedIds.length && permittedIds.indexOf(companyId) === -1) {
        status.innerHTML = '<span style="color:#dc3545;">هذه الشركة غير مسموح بها لهذا المحل</span>';
        return;
      }
    }
    await Auth.connectAsBranch(mainCode, password, companyId);
    try { localStorage.setItem('zmt_last_code', mainCode); } catch {}
    loginShowDashboard();
  } catch (e) {
    status.innerHTML = '<span style="color:#dc3545;">خطأ: ' + e.message + '</span>';
  }
}

function loginShowDashboard() {
  // Safety: NEVER enter the app without a session. Auth.getPermissions()
  // returns {} (not null) for a session-less state, so every canEdit()/canDelete()
  // denies while pages stay visible — the user sees "I have no permissions"
  // and nothing works, even after a reboot (each boot wipes the session and
  // repeats the same path). Send the login screen back instead.
  if (typeof Auth.isLoggedIn === 'function' && !Auth.isLoggedIn()) {
    const msg = '<span style="color:#dc3545;">انتهت الجلسة — الرجاء تسجيل الدخول مرة أخرى</span>';
    ['loginManagerStatus', 'loginUserStatus', 'loginBranchStatus', 'loginCreateStatus'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = msg;
    });
    console.warn('[Auth] loginShowDashboard blocked — no active session');
    return;
  }

  hideLogin();

  // License gate: even after a successful login/registration this machine may
  // not have an activated license yet. Route to the activation overlay (which
  // pre-fills code + password) before entering the dashboard.
  if (typeof licenseGateAfterLogin === 'function' && !licenseGateAfterLogin()) {
    return;
  }

  document.querySelectorAll('.nav-item').forEach(nav => { nav.style.display = ''; });
  document.body.classList.remove('user-mode');

  if (!Auth.isManager()) {
    document.body.classList.add('user-mode');
    document.querySelectorAll('.nav-item').forEach(nav => {
      const page = nav.dataset.page;
      if (page && !Auth.canView(page)) {
        nav.style.display = 'none';
      }
    });
  }

  if (window.__standaloneQuickEntry) {
    navigateTo('quick-entry');
  } else if (typeof navigateTo === 'function') {
    const landing = (typeof Auth.firstViewablePage === 'function') ? Auth.firstViewablePage() : null;
    navigateTo(landing || 'dashboard');
  }
  if (typeof LANSync !== 'undefined') {
    LANSync.hookDb();
    LANSync.start();
  }
  if (typeof CloudService !== 'undefined' && CloudService.isCloudConnected()) {
    CloudService.startAutoSync(CloudService.getAutoSyncInterval());
  }
}

// ===== PASSWORD RECOVERY =====
let _recoveryEmail = '';
let _recoveryCode = '';

function loginShowRecovery() {
  const s1 = document.getElementById('loginStep1');
  const s2 = document.getElementById('loginStep2');
  const ov = document.getElementById('recoveryOverlay');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = 'none';
  if (ov) ov.style.display = 'flex';
  recoveryShowStep(1);
  const re = document.getElementById('recoveryEmail');
  if (re) re.value = '';
  const rn = document.getElementById('recoveryNewPass');
  if (rn) rn.value = '';
  const rc = document.getElementById('recoveryConfirmPass');
  if (rc) rc.value = '';
  const res = document.getElementById('recoveryEmailStatus');
  if (res) res.textContent = '';
  const rrs = document.getElementById('recoveryResetStatus');
  if (rrs) rrs.textContent = '';
}

function recoveryClose() {
  const ov = document.getElementById('recoveryOverlay');
  if (ov) ov.style.display = 'none';
  const s1 = document.getElementById('loginStep1');
  if (s1) s1.style.display = '';
  const s2 = document.getElementById('loginStep2');
  if (s2) s2.style.display = 'none';
}

function recoveryShowStep(step) {
  document.querySelectorAll('.recovery-step').forEach(s => { if (s) s.style.display = 'none'; });
  const target = document.getElementById('recoveryStep' + step);
  if (target) target.style.display = '';
}

async function recoveryLookup() {
  const email = document.getElementById('recoveryEmail').value.trim();
  const status = document.getElementById('recoveryEmailStatus');

  if (!email || !email.includes('@')) {
    status.innerHTML = '<span style="color:#dc3545;">الرجاء إدخال بريد صحيح</span>';
    return;
  }

  status.innerHTML = '<span style="color:#0066B1;">جاري البحث...</span>';

  try {
    const info = await Auth.recoverByEmail(email);
    _recoveryEmail = email;
    _recoveryCode = info.code;

    document.getElementById('recoveryStoreName').textContent = info.storeName;
    document.getElementById('recoveryCodeDisplay').textContent = info.code;

    if (info.hasPassword) {
      document.getElementById('recoveryPassDisplay').textContent = '••••••••';
    } else {
      document.getElementById('recoveryPassDisplay').textContent = 'لا توجد كلمة مرور';
    }

    status.textContent = '';
    recoveryShowStep(2);
  } catch (e) {
    status.innerHTML = '<span style="color:#dc3545;">' + e.message + '</span>';
  }
}

function recoveryBackToStep1() {
  recoveryShowStep(1);
}

function recoveryShowResetForm() {
  document.getElementById('recoveryNewPass').value = '';
  document.getElementById('recoveryConfirmPass').value = '';
  document.getElementById('recoveryResetStatus').textContent = '';
  recoveryShowStep(3);
}

function recoveryBackToStep2() {
  recoveryShowStep(2);
}

async function recoveryDoReset() {
  const newPass = document.getElementById('recoveryNewPass').value;
  const confirm = document.getElementById('recoveryConfirmPass').value;
  const status = document.getElementById('recoveryResetStatus');

  if (!newPass || newPass.length < 4) {
    status.innerHTML = '<span style="color:#dc3545;">كلمة المرور يجب أن تكون 4 أحرف على الأقل</span>';
    return;
  }
  if (newPass !== confirm) {
    status.innerHTML = '<span style="color:#dc3545;">كلمتا المرور غير متطابقتين</span>';
    return;
  }

  status.innerHTML = '<span style="color:#0066B1;">جاري حفظ كلمة المرور الجديدة...</span>';

  try {
    await Auth.resetPasswordByEmail(_recoveryEmail, newPass);
    localStorage.setItem('zmt_store_password', newPass);
    const { hash, salt } = await Auth.hashPassword(newPass);
    localStorage.setItem('zmt_local_pass', JSON.stringify({ code: _recoveryCode, hash, salt }));

    await Auth.loginWithCode(_recoveryCode);

    status.innerHTML = '<span style="color:#28a745;">تم الحفظ! جاري الدخول...</span>';
    setTimeout(() => {
      recoveryClose();
      loginShowDashboard();
    }, 1000);
  } catch (e) {
    status.innerHTML = '<span style="color:#dc3545;">' + e.message + '</span>';
  }
}

function recoveryLoginWithCode() {
  Auth.loginWithCode(_recoveryCode).then(() => {
    recoveryClose();
    loginShowDashboard();
  });
}
