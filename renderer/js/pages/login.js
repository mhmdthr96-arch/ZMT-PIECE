// ============================================================
// ZMT Login Page Logic
// ============================================================

let _loginCurrentAction = 'manager';

function initLoginView() {
  if (Auth.isLoggedIn()) {
    hideLogin();
    return;
  }
  showLogin();
}

function showLogin() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'flex';
  const app = document.querySelector('.app-container');
  if (app) app.style.display = 'none';
  resetLoginForm();
  setTimeout(() => {
    const firstInput = document.getElementById('loginManagerCode');
    if (firstInput) firstInput.focus();
  }, 100);
}

function resetLoginForm() {
  ['loginManagerCode','loginManagerPassword','loginUserCode','loginUserUsername','loginUserPassword','loginEmail','loginPassword','loginBranchCode','loginBranchPassword'].forEach(id => {
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
  document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.login-tab[data-action="${action}"]`).classList.add('active');
  document.querySelectorAll('.login-action').forEach(a => a.style.display = 'none');
  const map = {
    manager: 'loginActionManager',
    user: 'loginActionUser',
    create: 'loginActionCreate',
    branch: 'loginActionBranch',
  };
  document.getElementById(map[action]).style.display = '';
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

  try {
    await Auth.loginWithCode(code);

    try {
      const verified = await Auth.verifyCloudPassword(code, password || '');
      if (!verified) {
        status.innerHTML = '<span style="color:#dc3545;">كلمة مرور المحل غير صحيحة</span>';
        Auth.signOut();
        return;
      }
    } catch (e) {
      if (password) {
        status.innerHTML = '<span style="color:#dc3545;">كلمة مرور المحل غير صحيحة</span>';
        Auth.signOut();
        return;
      }
    }

    if (password) {
      localStorage.setItem('zmt_store_password', password);
      const { hash, salt } = await Auth.hashPassword(password);
      localStorage.setItem('zmt_local_pass', JSON.stringify({ code, hash, salt }));
    }

    loginShowDashboard();
    return;
  } catch (e) {
    // Online login failed - try offline
  }

  // Offline login
  if (!Auth.hasLocalPassData(code)) {
    status.innerHTML = '<span style="color:#dc3545;">لا يمكن الدخول بدون إنترنت لأول مرة</span>';
    return;
  }

  try {
    const verified = await Auth.verifyLocalPassword(code, password || '');
    if (!verified) {
      status.innerHTML = '<span style="color:#dc3545;">كلمة المرور غير صحيحة</span>';
      return;
    }

    localStorage.setItem('zmt_auth_user', JSON.stringify({
      userId: code,
      code: code,
      email: '',
      storeType: 'main',
      parentCode: '',
    }));
    localStorage.setItem('zmt_store_code', code);
    localStorage.setItem('zmt_store_type', 'main');
    if (password) localStorage.setItem('zmt_store_password', password);

    loginShowDashboard();
  } catch (e) {
    status.innerHTML = '<span style="color:#dc3545;">خطأ: ' + e.message + '</span>';
  }
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
    await Auth.loginAsUser(storeCode, username, password);
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
    await Auth.connectAsBranch(mainCode, password);
    loginShowDashboard();
  } catch (e) {
    status.innerHTML = '<span style="color:#dc3545;">خطأ: ' + e.message + '</span>';
  }
}

function loginShowDashboard() {
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

  if (typeof navigateTo === 'function') {
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
  document.getElementById('loginStep1').style.display = 'none';
  document.getElementById('loginStep2').style.display = 'none';
  document.getElementById('recoveryOverlay').style.display = 'flex';
  recoveryShowStep(1);
  document.getElementById('recoveryEmail').value = '';
  document.getElementById('recoveryNewPass').value = '';
  document.getElementById('recoveryConfirmPass').value = '';
  document.getElementById('recoveryEmailStatus').textContent = '';
  document.getElementById('recoveryResetStatus').textContent = '';
}

function recoveryClose() {
  document.getElementById('recoveryOverlay').style.display = 'none';
  document.getElementById('loginStep1').style.display = '';
  document.getElementById('loginStep2').style.display = 'none';
}

function recoveryShowStep(step) {
  document.querySelectorAll('.recovery-step').forEach(s => s.style.display = 'none');
  document.getElementById('recoveryStep' + step).style.display = '';
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
