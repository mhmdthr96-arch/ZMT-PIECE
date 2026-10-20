let _licenseState = {
  checked: false,
  valid: false,
  expired: false,
  noLicense: false,
  machineMismatch: false,
  invalidLegacy: false,
  license: null,
  remainingDays: 0,
  showWatermark: false,
  urgent: false,
  tampered: false,
};

let _watermarkInterval = null;
let _licenseMachineId = '';

async function checkAndEnforceLicense() {
  const result = await window.electronAPI.licenseCheck();
  const tamperResult = await window.electronAPI.licenseTimeTamper();

  // Online revocation cached locally (set when the cloud module detected the key
  // was revoked in the admin tool). Frozen offline too, until the next online
  // contact clears the flag. Never blocks the very first run when no key exists.
  if (typeof CloudService !== 'undefined' && typeof CloudService.isLicenseRevokedLocally === 'function'
      && CloudService.isLicenseRevokedLocally()) {
    _licenseState.checked = true;
    _licenseState.valid = false;
    showFreezeOverlay('تم إلغاء مفتاح التفعيل — تواصل مع الدعم');
    return false;
  }

  _licenseState.checked = true;

  if (tamperResult.tampered) {
    _licenseState.tampered = true;
    showFreezeOverlay(tamperResult.message);
    return false;
  }

  if (result.status === 'no_license') {
    _licenseState.valid = false;
    _licenseState.noLicense = true;
    // No license yet: we DO NOT block startup with the activation overlay.
    // Instead the login page is shown (see app.js), and after the store logs in
    // or registers, licenseGateAfterLogin() routes to the activation overlay.
    return false;
  }

  if (result.status === 'machine_mismatch') {
    _licenseState.valid = false;
    _licenseState.machineMismatch = true;
    // A leftover license bound to a different machine must NOT block startup
    // with the activation overlay. Route to the login page instead (like
    // no_license); after the store logs in, licenseGateAfterLogin() shows the
    // overlay with the mismatch message so the owner can report the device ID.
    return false;
  }

  if (result.status === 'invalid_legacy') {
    _licenseState.valid = false;
    _licenseState.invalidLegacy = true;
    // A license created by a retired pre-cloud embedded key is rejected by the
    // main process. Do NOT block startup with the overlay: route to the login
    // page (like no_license); licenseGateAfterLogin() then shows the overlay
    // with a clear message telling the owner to request a new cloud key.
    return false;
  }

  if (result.status === 'expired') {
    _licenseState.valid = false;
    _licenseState.expired = true;
    showFreezeOverlay('انتهت مدة التفعيل — أدخل مفتاح جديد للاستمرار');
    return false;
  }

  if (result.status === 'license_tampered') {
    _licenseState.valid = false;
    showFreezeOverlay(result.message || 'تم اكتشاف تعديل في ملف الترخيص');
    return false;
  }

  if (result.status === 'active') {
    _licenseState.valid = true;
    _licenseState.license = result.license;
    _licenseState.remainingDays = result.remainingDays;
    _licenseState.showWatermark = result.showWatermark;
    _licenseState.urgent = result.urgent;

    if (result.showWatermark) {
      startWatermarkCountdown(result);
    }

    return true;
  }

  return false;
}

function showLicenseOverlay(errorMsg) {
  const overlay = document.getElementById('licenseOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  prefillLicenseForm();
  wirePhoneLicenseInput();

  if (errorMsg) {
    const status = document.getElementById('licenseStatus');
    if (status) {
      status.textContent = errorMsg;
      status.className = 'license-status error';
      status.style.display = 'block';
    }
  }
}

// Pre-fills the activation form: shows this machine's hardware ID (needed by
// the admin to bind the license) and the last-known store code/password so the
// owner only has to type the license key.
function prefillLicenseForm() {
  const codeEl = document.getElementById('licenseStoreCode');
  if (codeEl && !codeEl.value) {
    codeEl.value = localStorage.getItem('zmt_store_code') || '';
  }
  const passEl = document.getElementById('licenseStorePassword');
  if (passEl && !passEl.value) {
    passEl.value = localStorage.getItem('zmt_store_password') || '';
  }
  const fcode = document.getElementById('freezeStoreCode');
  if (fcode && !fcode.value) fcode.value = localStorage.getItem('zmt_store_code') || '';
  const fpass = document.getElementById('freezeStorePassword');
  if (fpass && !fpass.value) fpass.value = localStorage.getItem('zmt_store_password') || '';
  const idEl = document.getElementById('licenseDeviceId');
  if (idEl && idEl.value === '') {
    idEl.value = 'جارٍ قراءة الجهاز...';
    // Show a busy state in the QR box while the (possibly slow) hardware probe
    // runs on some PCs — otherwise it looks like the QR never gets generated.
    const busyQr = document.getElementById('licenseQrBox');
    if (busyQr) {
      busyQr.style.display = 'inline-block';
      busyQr.innerHTML = '<span class="qr-busy"><i class="fas fa-spinner fa-spin"></i> جارٍ تجهيز رمز QR...</span>';
    }
    window.electronAPI.licenseMachineId().then((fp) => {
      if (idEl) idEl.value = fp || 'غير متاح';
      _licenseMachineId = fp || '';
      renderLicenseQr();
    }).catch(() => {
      if (idEl) idEl.value = 'غير متاح';
      _licenseMachineId = '';
      renderLicenseQr();
    });
  }
  const storeCodeEl = document.getElementById('licenseStoreCode');
  if (storeCodeEl && !storeCodeEl.dataset.qrwired) {
    storeCodeEl.dataset.qrwired = '1';
    storeCodeEl.addEventListener('input', () => renderLicenseQr());
  }
  renderLicenseQr();
}

// ===== COPY + QR for the offline phone flow =====
// The QR carries both the machine id and the store code (format ZMT1|m|s) so the
// distributor's phone license editor pre-fills both fields after scanning.

function licenseQrPayload(storeCodeOverride) {
  const storeEl = document.getElementById('licenseStoreCode');
  const store = storeCodeOverride !== undefined
    ? (storeCodeOverride || '')
    : ((storeEl && storeEl.value.trim()) || localStorage.getItem('zmt_store_code') || '');
  return _licenseMachineId ? 'ZMT1|' + _licenseMachineId + '|' + store : '';
}

function renderLicenseQr(boxId) {
  const id = boxId || 'licenseQrBox';
  const box = document.getElementById(id);
  if (!box) return;
  const payload = licenseQrPayload();
  if (!payload) {
    box.style.display = 'none';
    return;
  }
  box.innerHTML = '';
  box.style.display = 'inline-block';
  drawLicenseQr(payload, box);
}

function drawLicenseQr(text, targetEl) {
  if (!window.qrcodegen) {
    const s = document.createElement('script');
    s.src = 'js/vendor/qrcodegen.js';
    s.onload = () => drawLicenseQr(text, targetEl);
    s.onerror = () => { targetEl.innerHTML = '<span class="text-danger">تعذّر تحميل مكتبة QR</span>'; };
    document.body.appendChild(s);
    return;
  }
  try {
    const qr = window.qrcodegen(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    // 230 px canvas with a real white quiet zone (~9%) so a phone camera
    // reliably finds the finder patterns -> faster scans on any screen.
    const size = 230;
    const quiet = Math.max(2, Math.floor(size * 0.09));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    // Integer edges (floor) keep every module crisp with no hairline gaps.
    const pp = (size - quiet * 2) / count;
    ctx.fillStyle = '#000000';
    for (let r = 0; r < count; r++) {
      const y1 = Math.floor(quiet + r * pp);
      const y2 = Math.floor(quiet + (r + 1) * pp);
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          const x1 = Math.floor(quiet + c * pp);
          const x2 = Math.floor(quiet + (c + 1) * pp);
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        }
      }
    }
    targetEl.appendChild(canvas);
  } catch (e) {
    targetEl.innerHTML = '<span class="text-danger">تعذّر رسم رمز QR</span>';
  }
}

function copyLicenseMachineId() {
  const btn = document.getElementById('licenseCopyIdBtn');
  const id = _licenseMachineId;
  if (!id) return;
  const storeEl = document.getElementById('licenseStoreCode');
  const store = (storeEl && storeEl.value.trim()) || localStorage.getItem('zmt_store_code') || '';
  const val = store ? 'معرف الجهاز: ' + id + '\nرمز المتجر: ' + store : 'معرف الجهاز: ' + id;
  const done = () => {
    if (!btn) return;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => { btn.innerHTML = original; }, 1200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(val).then(done).catch(() => { fallbackCopy(val); done(); });
  } else {
    fallbackCopy(val);
    done();
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}

function hideLicenseOverlay() {
  const overlay = document.getElementById('licenseOverlay');
  if (overlay) overlay.style.display = 'none';
}

// Called after the login/registration flow completes: a store may be logged in
// but still have no activated license on this machine. Route to the activation
// overlay (pre-filled with the store code/password) instead of the dashboard.
function licenseGateAfterLogin() {
  if (_licenseState.valid) return true;
  if (_licenseState.tampered) {
    showFreezeOverlay('تم اكتشاف تعديل في ملف الترخيص');
    return false;
  }
  if (_licenseState.expired) {
    showFreezeOverlay('انتهت مدة التفعيل — أدخل مفتاح جديد للاستمرار');
    return false;
  }
  if (_licenseState.machineMismatch) {
    showLicenseOverlay('هذا المفتاح مربوط بجهاز آخر');
    return false;
  }
  if (_licenseState.invalidLegacy) {
    showLicenseOverlay('المفتاح القديم ملغي — استخدم المفتاح الجديد من الموزّع');
    return false;
  }
  showLicenseOverlay();
  return false;
}

function showFreezeOverlay(message) {
  const freeze = document.getElementById('freezeOverlay');
  if (!freeze) {
    createFreezeOverlay();
    return showFreezeOverlay(message);
  }
  freeze.style.display = 'flex';

  const mainContent = document.getElementById('pageContainer');
  const sidebar = document.getElementById('sidebar');
  const titleBar = document.querySelector('.title-bar');
  if (mainContent) mainContent.style.opacity = '0.1';
  if (sidebar) sidebar.style.opacity = '0.1';
  if (titleBar) titleBar.style.opacity = '0.1';

  if (message) {
    const freezeCard = freeze.querySelector('.freeze-card');
    const h1 = freezeCard?.querySelector('h1');
    const p = freezeCard?.querySelector('p');
    if (h1) h1.textContent = message;
  }

  // Populate device ID + QR and wire the .zmtlic import for the static overlay
  populateFreezeDeviceId();
  wireFreezePhoneLicenseInput();
}

function hideFreezeOverlay() {
  const freeze = document.getElementById('freezeOverlay');
  if (freeze) freeze.style.display = 'none';

  const mainContent = document.getElementById('pageContainer');
  const sidebar = document.getElementById('sidebar');
  const titleBar = document.querySelector('.title-bar');
  if (mainContent) mainContent.style.opacity = '';
  if (sidebar) sidebar.style.opacity = '';
  if (titleBar) titleBar.style.opacity = '';
}

function createFreezeOverlay() {
  if (document.getElementById('freezeOverlay')) return;
  const div = document.createElement('div');
  div.id = 'freezeOverlay';
  div.className = 'freeze-overlay';
  div.style.display = 'none';
  div.innerHTML = `
    <div class="freeze-card">
      <div class="freeze-icon"><i class="fas fa-lock"></i></div>
      <h1>انتهت مدة التفعيل</h1>
      <p style="color:var(--silver-500);margin-bottom:8px">يرجى إدخال مفتاح تفعيل جديد لاستمرار العمل</p>
      <p style="color:var(--silver-400);font-size:12px;margin-bottom:20px">بياناتك محفوظة وستعود بعد التفعيل</p>

      <div class="freeze-input-group">
        <label style="font-size:12px;color:var(--silver-400)">معرف هذا الجهاز (للإخبار به عند الطلب)</label>
        <div class="zmt-device-row">
          <input type="text" id="freezeDeviceId" class="license-input license-input-readonly"
                 readonly dir="ltr" placeholder="جارٍ قراءة الجهاز...">
          <button type="button" class="zmt-copy-btn" id="freezeCopyIdBtn"
                  onclick="copyFreezeMachineId()" title="نسخ معرف الجهاز" aria-label="نسخ معرف الجهاز">
            <i class="fas fa-copy"></i>
          </button>
        </div>
        <div class="zmt-qr-box" id="freezeQrBox" style="display:none"></div>
      </div>

      <div class="freeze-input-group">
        <input type="text" id="freezeStoreCode" class="license-input"
               placeholder="رمز المتجر" dir="ltr" autocomplete="off" spellcheck="false">
      </div>
      <div class="freeze-input-group">
        <input type="password" id="freezeStorePassword" class="license-input"
               placeholder="كلمة مرور المتجر" dir="ltr" autocomplete="off" spellcheck="false">
      </div>
      <div class="freeze-input-group">
        <input type="text" id="freezeKeyInput" class="license-input"
               placeholder="مفتاح التفعيل الجديد (ZMT-XXXX-XXXX-XXXX)" dir="ltr" autocomplete="off" spellcheck="false">
      </div>

      <div class="license-divider"><span>أو — تمديد بمدة جديدة من هاتف الموزّع</span></div>
      <button type="button" class="license-switch-btn license-import-btn"
              onclick="document.getElementById('freezePhoneFile').click()">
        <i class="fas fa-mobile-alt"></i> استيراد ملف ترخيص من الهاتف (USB / أي طريقة)
      </button>
      <input type="file" id="freezePhoneFile" accept=".zmtlic,.json,application/json,text/plain" style="display:none">

      <div class="eula-box">
        <button type="button" class="eula-show-btn" onclick="openEulaModal()">
          <i class="fas fa-file-contract"></i> عرض الشروط والأحكام كاملة
        </button>
        <div class="eula-text" id="eulaText">
          باستخدام برنامج ZMT PIECE فإنك تقر بأن المسؤولية القانونية عن استخدام البرنامج تقع على المستخدم، وأن البرنامج يُقدَّم كما هو دون أي ضمانات صريحة أو ضمنية. جميع البيانات المدخلة تبقى تحت مسؤوليتك. يُحظر إعادة بيع أو توزيع أو اختراق البرنامج دون إذن خطي من ZMT SOFTWARE. بموافقتك تقر بقبول هذه الشروط.
        </div>
        <label class="eula-check">
          <input type="checkbox" id="eulaAccept">
          <span>أقر بقراءة الشروط وأوافق على استخدام البرنامج</span>
        </label>
      </div>

      <div class="license-status" id="freezeStatus" style="display:none"></div>
      <button class="license-activate-btn" onclick="doFreezeActivate()">
        <i class="fas fa-key"></i> تفعيل واستمرار
      </button>
      <button type="button" class="license-switch-btn" id="freezeSyncTimeBtn"
              onclick="doLicenseSyncTime()" style="width:100%;margin-top:8px">
        <i class="fas fa-clock"></i> تصحيح ساعة الجهاز الآن
      </button>
      <div class="license-switch">
        <button class="license-switch-btn license-switch-danger" onclick="doLicenseDeactivate()">
          <i class="fas fa-trash"></i> حذف مفتاح التفعيل نهائياً
        </button>
        <button class="license-switch-btn" onclick="doLicenseReject()">
          <i class="fas fa-sign-out-alt"></i> لا أوافق (رجوع لتسجيل الدخول)
        </button>
      </div>
      <div class="license-footer" style="margin-top:20px">
        <span>ZMT SOFTWARE — ZERIBIT MOHAMMED TAHAR</span>
      </div>
    </div>
  `;
  const acc = div.querySelector('#eulaAccept');
  if (acc && localStorage.getItem('zmt_eula_accepted') === '1') acc.checked = true;
  document.body.appendChild(div);
  wirePhoneLicenseInput();
  wireFreezePhoneLicenseInput();
  populateFreezeDeviceId();
}

function openEulaModal() {
  const m = document.getElementById('eulaModal');
  if (!m) return;
  const body = m.querySelector('#eulaModalBody');
  const src = document.getElementById('eulaText') || document.getElementById('eulaTextPage');
  if (body && src && !body.textContent) body.textContent = src.textContent;
  m.style.display = 'flex';
}

function closeEulaModal() {
  const m = document.getElementById('eulaModal');
  if (m) m.style.display = 'none';
}

async function doLicenseReject() {
  if (!confirm('باختيار "لا أوافق" سيتم تسجيل الخروج والعودة لشاشة الدخول. متابعة؟')) return;
  try { if (typeof Auth !== 'undefined' && Auth.signOut) Auth.signOut(); } catch (e) {}
  hideFreezeOverlay();
  if (typeof showLogin === 'function') showLogin();
  else if (window.location) window.location.reload();
}

// ===== FREEZE OVERLAY: device ID + QR + .zmtlic import + clock sync =====

function populateFreezeDeviceId() {
  const idEl = document.getElementById('freezeDeviceId');
  const qrBox = document.getElementById('freezeQrBox');
  if (!idEl) return;
  idEl.value = 'جارٍ قراءة الجهاز...';
  if (qrBox) {
    qrBox.style.display = 'inline-block';
    qrBox.innerHTML = '<span class="qr-busy"><i class="fas fa-spinner fa-spin"></i> جارٍ تجهيز رمز QR...</span>';
  }
  window.electronAPI.licenseMachineId().then((fp) => {
    if (idEl) idEl.value = fp || 'غير متاح';
    _licenseMachineId = fp || '';
    renderLicenseQr('freezeQrBox');
  }).catch(() => {
    if (idEl) idEl.value = 'غير متاح';
    _licenseMachineId = '';
  });
}

function copyFreezeMachineId() {
  const btn = document.getElementById('freezeCopyIdBtn');
  const id = _licenseMachineId;
  if (!id) return;
  const storeEl = document.getElementById('freezeStoreCode');
  const store = (storeEl && storeEl.value.trim()) || localStorage.getItem('zmt_store_code') || '';
  const val = store ? 'معرف الجهاز: ' + id + '\nرمز المتجر: ' + store : 'معرف الجهاز: ' + id;
  const done = () => {
    if (!btn) return;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => { btn.innerHTML = original; }, 1200);
  };
  try {
    navigator.clipboard.writeText(val).then(done, () => { fallbackCopy(val); done(); });
  } catch (e) { fallbackCopy(val); done(); }
}

function wireFreezePhoneLicenseInput() {
  const fileInput = document.getElementById('freezePhoneFile');
  if (!fileInput || fileInput.dataset.wired) return;
  fileInput.dataset.wired = '1';
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const status = document.getElementById('freezeStatus');
    try {
      const text = await f.text();
      const result = await window.electronAPI.licenseImport({ fileName: f.name, data: text });
      if (result && result.success) {
        _licenseState.valid = true;
        _licenseState.tampered = false;
        _licenseState.license = result.license;
        hideFreezeOverlay();
        if (typeof bootApp === 'function') bootApp();
        else if (typeof navigateTo === 'function') navigateTo('dashboard');
      } else {
        showFreezeStatus(status, (result && result.message) || 'فشل استيراد ملف الترخيص', 'error');
      }
    } catch (e) {
      showFreezeStatus(status, 'تعذّرت معالجة الملف: ' + (e && e.message ? e.message : e), 'error');
    }
    fileInput.value = '';
  });
}

async function doLicenseSyncTime() {
  const btn = document.getElementById('freezeSyncTimeBtn');
  const status = document.getElementById('freezeStatus');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ تصحيح الساعة...'; }
  try {
    const r = await window.electronAPI.licenseSyncTime();
    if (r && r.tampered === false) {
      // Clock was corrected and tamper check now passes
      _licenseState.tampered = false;
      hideFreezeOverlay();
      // Re-run the license check so the app boots normally
      const licOk = await checkAndEnforceLicense();
      if (licOk) {
        if (typeof bootApp === 'function') await bootApp();
      } else if (typeof showLicenseOverlay === 'function') {
        showLicenseOverlay();
      }
    } else {
      // Still tampered — show the reason
      const msg = (r && r.tamperMessage) || 'الساعة لم تُصحّح بعد — تحقق من وقت النظام يدويًا';
      showFreezeStatus(status, msg, 'error');
    }
  } catch (e) {
    showFreezeStatus(status, 'تعذّر تصحيح الساعة: ' + (e && e.message ? e.message : e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-clock"></i> تصحيح ساعة الجهاز الآن'; }
  }
}

async function doLicenseActivate() {
  const keyEl = document.getElementById('licenseKeyInput');
  const codeEl = document.getElementById('licenseStoreCode');
  const passEl = document.getElementById('licenseStorePassword');
  const status = document.getElementById('licenseStatus');
  const btn = document.getElementById('licenseActivateBtn');

  const key = keyEl ? keyEl.value.trim() : '';
  const code = (codeEl && codeEl.value.trim()) || localStorage.getItem('zmt_store_code') || '';
  const password = (passEl && passEl.value) || localStorage.getItem('zmt_store_password') || '';

  if (!key) {
    showLicenseStatus(status, 'يرجى إدخال مفتاح التفعيل', 'error');
    return;
  }
  if (!code) {
    showLicenseStatus(status, 'يرجى إدخال رمز المتجر', 'error');
    return;
  }
  if (!password) {
    showLicenseStatus(status, 'يرجى إدخال كلمة مرور المتجر', 'error');
    return;
  }

  const acc = document.getElementById('eulaAccept') || document.getElementById('eulaAcceptPage');
  if (!acc || !acc.checked) {
    showLicenseStatus(status, 'يجب قبول شروط الاستخدام أولاً للمتابعة', 'error');
    return;
  }

  if (codeEl) localStorage.setItem('zmt_store_code', code);
  if (passEl && password) localStorage.setItem('zmt_store_password', password);

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';

  let result;
  try {
    result = await window.electronAPI.licenseActivate({ key, code, password });
  } catch (e) {
    showLicenseStatus(status, 'تعذّر إتمام التفعيل (' + (e && e.message ? e.message : e) + ') — أعد المحاولة', 'error');
    return;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-key"></i> تفعيل البرنامج';
  }

  if (result.success) {
    try { localStorage.setItem('zmt_eula_accepted', '1'); } catch (e) {}
    showLicenseStatus(status, result.message, 'success');
    document.getElementById('licenseFormSection').style.display = 'none';
    const successSection = document.getElementById('licenseSuccessSection');
    successSection.style.display = 'block';
    document.getElementById('licenseSuccessLabel').textContent = result.license.label;
    _licenseState.valid = true;
    _licenseState.license = result.license;
  } else {
    showLicenseStatus(status, result.message, 'error');
  }
}

// ===== OFFLINE PHONE-LICENSE IMPORT (*.zmtlic) =====
// The distributor signs a machine-bound license on their phone (Android app or
// the reference Node tool) and the customer transfers the file over USB /
// WhatsApp / flash drive. Picking the file routes to IPC `license-import` which
// verifies signature + machineId + dates in the main process, then stores the
// standard signed+watermarked license — checkLicense() needs no changes.

function licenseImportFileReady(file, statusId) {
  const status = document.getElementById(statusId);
  if (!file) return;

  // A valid .zmtlic is a few KB of JSON text; files beyond 2 MB can never be one.
  if (file.size > 2 * 1024 * 1024) {
    showLicenseStatus(status, 'الملف أكبر من أن يكون ملف ترخيص', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => showLicenseStatus(status, 'تعذّر قراءة الملف', 'error');
  reader.onload = async () => {
    try {
      const text = String(reader.result || '');
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
      // v1: signed JSON with a visible `sig`. v2: opaque encrypted envelope
      // (iv/data) whose inner fields are only readable by the main process —
      // so store-code pre-check is skipped for envelopes (real validation
      // happens inside license.js:importPhoneLicense anyway).
      const isV1 = !!(parsed && typeof parsed === 'object' && typeof parsed.sig === 'string');
      const isV2 = !!(parsed && typeof parsed === 'object' && parsed.v === 2 && typeof parsed.iv === 'string' && typeof parsed.data === 'string');
      if (!isV1 && !isV2) {
        showLicenseStatus(status, 'هذا الملف ليس ملف ترخيص صالحاً (.zmtlic)', 'error');
        return;
      }
      if (isV1 && parsed.storeCode) {
        const localCode = localStorage.getItem('zmt_store_code') || '';
        if (localCode && localCode !== String(parsed.storeCode)) {
          showLicenseStatus(status,
            'ملف الترخيص تابع للمتجر (' + parsed.storeCode + ') بينما الحساب الحالي (' + localCode +
            ') — ادخل بحساب المتجر الصحيح ثم استورد', 'error');
          return;
        }
      }

      const result = await window.electronAPI.licenseImport({ fileName: file.name, data: text });

      if (result && result.success) {
        try { localStorage.setItem('zmt_eula_accepted', '1'); } catch (e) {}
        showLicenseStatus(status, result.message, 'success');
        _licenseState.valid = true;
        _licenseState.expired = false;
        _licenseState.machineMismatch = false;
        _licenseState.invalidLegacy = false;
        _licenseState.tampered = false;
        _licenseState.license = result.license;

        if (result.license) {
          const remainingMs = result.license.expiresAt - Date.now();
          const remainingDays = Math.ceil(remainingMs / 86400000);
          if (remainingDays <= 12) startWatermarkCountdown({ remainingDays });
        }

        const freeze = document.getElementById('freezeOverlay');
        if (freeze && freeze.style.display === 'flex') {
          // Renewed from the expiry freeze screen: dismiss it and re-enter.
          hideFreezeOverlay();
          if (typeof bootApp === 'function') bootApp();
          else if (typeof navigateTo === 'function') navigateTo('dashboard');
          return;
        }

        document.getElementById('licenseFormSection').style.display = 'none';
        const successSection = document.getElementById('licenseSuccessSection');
        if (successSection) successSection.style.display = 'block';
        const label = document.getElementById('licenseSuccessLabel');
        if (label) label.textContent = (result.license && result.license.label) || 'تم التفعيل';
      } else {
        showLicenseStatus(status, (result && result.message) || 'تعذّر استيراد ملف الترخيص', 'error');
      }
    } catch (err) {
      showLicenseStatus(status, 'تعذّر استيراد الملف (' + (err && err.message ? err.message : err) + ')', 'error');
    }
  };
  reader.readAsText(file);
}

function wirePhoneLicenseInput() {
  const overlayInput = document.getElementById('licensePhoneFile');
  if (overlayInput && !overlayInput.dataset.wired) {
    overlayInput.dataset.wired = '1';
    overlayInput.addEventListener('change', () => {
      licenseImportFileReady(overlayInput.files && overlayInput.files[0], 'licenseStatus');
      overlayInput.value = '';
    });
  }
  const freezeInput = document.getElementById('freezePhoneFile');
  if (freezeInput && !freezeInput.dataset.wired) {
    freezeInput.dataset.wired = '1';
    freezeInput.addEventListener('change', () => {
      licenseImportFileReady(freezeInput.files && freezeInput.files[0], 'freezeStatus');
      freezeInput.value = '';
    });
  }
}

async function doFreezeActivate() {
  const keyEl = document.getElementById('freezeKeyInput');
  const codeEl = document.getElementById('freezeStoreCode');
  const passEl = document.getElementById('freezeStorePassword');
  const status = document.getElementById('freezeStatus');

  const key = keyEl ? keyEl.value.trim() : '';
  const code = (codeEl && codeEl.value.trim()) || localStorage.getItem('zmt_store_code') || '';
  const password = (passEl && passEl.value) || localStorage.getItem('zmt_store_password') || '';

  if (!key) {
    showFreezeStatus(status, 'يرجى إدخال مفتاح التفعيل', 'error');
    return;
  }
  if (!code) {
    showFreezeStatus(status, 'يرجى إدخال رمز المتجر', 'error');
    return;
  }
  if (!password) {
    showFreezeStatus(status, 'يرجى إدخال كلمة مرور المتجر', 'error');
    return;
  }

  const acc = document.getElementById('eulaAccept') || document.getElementById('eulaAcceptFreeze');
  if (!acc || !acc.checked) {
    showFreezeStatus(status, 'يجب قبول شروط الاستخدام أولاً للمتابعة', 'error');
    return;
  }

  if (codeEl) localStorage.setItem('zmt_store_code', code);
  if (passEl && password) localStorage.setItem('zmt_store_password', password);

  let result;
  try {
    result = await window.electronAPI.licenseActivate({ key, code, password });
  } catch (e) {
    showFreezeStatus(status, 'تعذّر إتمام التفعيل (' + (e && e.message ? e.message : e) + ') — أعد المحاولة', 'error');
    return;
  }

  if (result.success) {
    try { localStorage.setItem('zmt_eula_accepted', '1'); } catch (e) {}
    hideFreezeOverlay();
    _licenseState.valid = true;
    _licenseState.expired = false;
    _licenseState.license = result.license;

    if (result.license) {
      const remainingMs = result.license.expiresAt - Date.now();
      const remainingDays = Math.ceil(remainingMs / 86400000);
      if (remainingDays <= 12) {
        startWatermarkCountdown({ remainingDays });
      }
    }

    if (typeof bootApp === 'function') {
      bootApp();
    } else if (typeof navigateTo === 'function') {
      navigateTo('dashboard');
    }
  } else {
    showFreezeStatus(status, result.message, 'error');
  }
}

function doLicenseEnterApp() {
  hideLicenseOverlay();
  if (typeof bootApp === 'function') {
    bootApp();
    return;
  }
  if (typeof navigateTo === 'function') {
    navigateTo('dashboard');
  }
}

// Resets the license state after a permanent deactivation so the app returns
// to the login/activation screen instead of treating the deletion as tampering.
function resetLicenseAfterDeactivation() {
  _licenseState.valid = false;
  _licenseState.noLicense = true;
  _licenseState.expired = false;
  _licenseState.machineMismatch = false;
  _licenseState.invalidLegacy = false;
  _licenseState.tampered = false;
  _licenseState.license = null;
  if (_watermarkInterval) clearInterval(_watermarkInterval);
  hideLicenseOverlay();
  hideFreezeOverlay();
}

// Permanently deletes the local activation key from any screen (freeze overlay,
// activation overlay, or settings). After deletion the app returns to the
// activation form so a new key can be entered.
async function doLicenseDeactivate() {
  if (!confirm('هل تريد حذف مفتاح التفعيل نهائياً من هذا الجهاز؟\n\nسيُحذف المفتاح وستحتاج مفتاحاً جديداً للاستمرار. بياناتك محفوظة.')) return;
  let res;
  try {
    res = await window.electronAPI.licenseDeactivate({});
  } catch (e) {
    alert('تعذر حذف المفتاح: ' + e.message);
    return;
  }
  if (!res || !res.success) {
    alert((res && res.message) || 'لا يوجد مفتاح تفعيل لحذفه');
    return;
  }
  if (typeof Auth !== 'undefined' && typeof Auth.signOut === 'function') Auth.signOut();
  resetLicenseAfterDeactivation();
  if (typeof CloudService !== 'undefined' && typeof CloudService.stopAutoSync === 'function') CloudService.stopAutoSync();
  showLicenseOverlay();
}

function doLicenseSwitchAccount() {
  if (typeof Auth !== 'undefined' && typeof Auth.signOut === 'function') {
    Auth.signOut();
  }
  _licenseState.valid = false;
  _licenseState.noLicense = false;
  _licenseState.expired = false;
  _licenseState.machineMismatch = false;
  _licenseState.invalidLegacy = false;
  _licenseState.tampered = false;
  _licenseState.license = null;
  hideLicenseOverlay();
  hideFreezeOverlay();
  if (typeof initLoginView === 'function') {
    initLoginView();
  } else if (typeof showLogin === 'function') {
    showLogin();
  }
}

function showLicenseStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'license-status ' + type;
  el.style.display = 'block';
}

function showFreezeStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'license-status ' + type;
  el.style.display = 'block';
}

function startWatermarkCountdown(licenseResult) {
  const watermark = document.getElementById('watermarkCountdown');
  if (!watermark) return;

  watermark.style.display = 'block';

  if (licenseResult.urgent || _licenseState.urgent) {
    watermark.className = 'watermark-countdown urgent';
  } else if (licenseResult.remainingDays <= 7 || _licenseState.remainingDays <= 7) {
    watermark.className = 'watermark-countdown warning';
  } else {
    watermark.className = 'watermark-countdown info';
  }

  updateWatermarkText();

  if (_watermarkInterval) clearInterval(_watermarkInterval);
  _watermarkInterval = setInterval(updateWatermarkText, 60000);
}

function updateWatermarkText() {
  const textEl = document.getElementById('watermarkText');
  if (!textEl) return;

  const rt = _licenseState.license
    ? { days: Math.max(0, Math.floor((_licenseState.license.expiresAt - Date.now()) / 86400000)),
        hours: Math.max(0, Math.floor(((_licenseState.license.expiresAt - Date.now()) % 86400000) / 3600000)),
        minutes: Math.max(0, Math.floor(((_licenseState.license.expiresAt - Date.now()) % 3600000) / 60000)) }
    : null;

  if (!rt || rt.days < 0) {
    textEl.textContent = 'منتهي';
    if (_watermarkInterval) clearInterval(_watermarkInterval);
    return;
  }

  if (rt.days > 0) {
    textEl.textContent = 'متبقي ' + rt.days + ' يوم ' + rt.hours + ' ساعة';
  } else {
    textEl.textContent = 'متبقي ' + rt.hours + ' ساعة ' + rt.minutes + ' دقيقة';
  }

  const watermark = document.getElementById('watermarkCountdown');
  if (watermark && rt.days <= 3) {
    watermark.className = 'watermark-countdown urgent';
    _licenseState.urgent = true;
  }
}

function getLicenseState() {
  return { ..._licenseState };
}

// ===== Online enforcement events (emitted by the cloud module) =====
// A key revoked from the admin tool (Q18) freezes the UI immediately.
window.addEventListener('zmt:license-revoked', function () {
  _licenseState.valid = false;
  showFreezeOverlay('تم إلغاء مفتاح التفعيل — تواصل مع الدعم');
});
// A local clock wildly off from the server (Q10: tamper with date to dodge expiry)
// is treated like license tampering and freezes the UI. 2.4.9: gated on an
// actually ACTIVE license, so the login/registration flow is never blanked out
// by a clock drift the owner cannot see (this is what surfaced as a "white
// screen" after re-registering on a drifting-clock Win7); and the message now
// states the exact minutes + direction for an honest, actionable fix instead of
// a generic "تم رصد تعديل".
window.addEventListener('zmt:license-clock', function (ev) {
  if (!_licenseState || !_licenseState.valid) return; // no active license → never freeze
  _licenseState.valid = false;
  const d = (ev && ev.detail) || {};
  let msg = 'تم رصد تعديل في ساعة الجهاز — صحّح وقت النظام للمتابعة';
  if (typeof d.driftMinutes === 'number' && isFinite(d.driftMinutes)) {
    const mins = Math.abs(d.driftMinutes);
    const dir = d.driftMinutes > 0 ? 'متأخرة عن' : 'متقدمة على';
    msg = 'ساعة الجهاز ' + dir + ' خادم التفعيل بـ ' + mins + ' دقيقة — صحّح وقت النظام للمتابعة';
  }
  console.warn('[License] Clock-drift freeze:', d);
  showFreezeOverlay(msg);
});
