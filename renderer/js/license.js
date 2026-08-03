let _licenseState = {
  checked: false,
  valid: false,
  expired: false,
  license: null,
  remainingDays: 0,
  showWatermark: false,
  urgent: false,
  tampered: false,
};

let _watermarkInterval = null;

async function checkAndEnforceLicense() {
  const result = await window.electronAPI.licenseCheck();
  const tamperResult = await window.electronAPI.licenseTimeTamper();

  _licenseState.checked = true;

  if (tamperResult.tampered) {
    _licenseState.tampered = true;
    showFreezeOverlay(tamperResult.message);
    return false;
  }

  if (result.status === 'no_license') {
    _licenseState.valid = false;
    showLicenseOverlay();
    return false;
  }

  if (result.status === 'machine_mismatch') {
    _licenseState.valid = false;
    showLicenseOverlay('هذا المفتاح مربوط بجهاز آخر');
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

    window.electronAPI.licenseSaveSnapshot(Date.now());

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

  if (errorMsg) {
    const status = document.getElementById('licenseStatus');
    if (status) {
      status.textContent = errorMsg;
      status.className = 'license-status error';
      status.style.display = 'block';
    }
  }
}

function hideLicenseOverlay() {
  const overlay = document.getElementById('licenseOverlay');
  if (overlay) overlay.style.display = 'none';
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
        <input type="text" id="freezeKeyInput" class="license-input"
               placeholder="مفتاح التفعيل الجديد..." dir="ltr" autocomplete="off" spellcheck="false">
      </div>
      <div class="license-status" id="freezeStatus" style="display:none"></div>
      <button class="license-activate-btn" onclick="doFreezeActivate()">
        <i class="fas fa-key"></i> تفعيل واستمرار
      </button>
      <div class="license-footer" style="margin-top:20px">
        <span>ZMT SOFTWARE — ZERIBIT MOHAMMED TAHAR</span>
      </div>
    </div>
  `;
  document.body.appendChild(div);
}

async function doLicenseActivate() {
  const input = document.getElementById('licenseKeyInput');
  const status = document.getElementById('licenseStatus');
  const btn = document.getElementById('licenseActivateBtn');

  if (!input || !input.value.trim()) {
    showLicenseStatus(status, 'يرجى إدخال مفتاح التفعيل', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';

  const result = await window.electronAPI.licenseActivate(input.value.trim());

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-key"></i> تفعيل البرنامج';

  if (result.success) {
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

async function doFreezeActivate() {
  const input = document.getElementById('freezeKeyInput');
  const status = document.getElementById('freezeStatus');

  if (!input || !input.value.trim()) {
    showFreezeStatus(status, 'يرجى إدخال مفتاح التفعيل', 'error');
    return;
  }

  const result = await window.electronAPI.licenseActivate(input.value.trim());

  if (result.success) {
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

    window.electronAPI.licenseSaveSnapshot(Date.now());

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
