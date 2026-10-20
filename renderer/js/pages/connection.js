// ============================================================
// ZMT Connection Settings Page
// ============================================================

let _connSelectedType = 'main';

function init_connection() {
  connLoadUserInfo();
  connLoadBranches();
  connUpdateLastSync();
  connLoadPushSettings();
  setupPhoneScanner();
  setupPhoneSale();
  setupRestaurant();
  setupCashDrawer();
  pdInit();

  const autoSync = localStorage.getItem('zmt_cloud_autosync') === '1';
  document.getElementById('connAutoSync').checked = autoSync;
  document.getElementById('connAutoSyncSettings').style.display = autoSync ? '' : 'none';
  const savedInterval = localStorage.getItem('zmt_cloud_autosync_interval');
  if (savedInterval) {
    const sel = document.getElementById('connSyncInterval');
    if (sel) sel.value = savedInterval;
  }
}

// ===== TAB SWITCHING =====
function connSwitchTab(tab) {
  document.querySelectorAll('.conn-tab').forEach(t => t.classList.remove('active'));
  const target = document.querySelector(`.conn-tab[data-tab="${tab}"]`);
  if (target) target.classList.add('active');
  document.querySelectorAll('.conn-tab-content').forEach(c => c.classList.remove('active'));
  const panel = document.getElementById('connTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (panel) {
    panel.classList.add('active');
    if (tab === 'scanner') phsRefresh();
    if (tab === 'drawer') drawerInit();
  }
}

// ===== PHONE BARCODE SCANNER =====
let _phsStatus = null;
let _phsSelectedIp = '';
let _phsLastErr = '';

function setupPhoneScanner() {
  // preload bridge presence check
  if (!window.electronAPI || !window.electronAPI.phsStatus) return;

  _phsSelectedIp = localStorage.getItem('zmt_phs_ip') || '';
  if (window.electronAPI.onPhsPairRequest) {
    window.electronAPI.onPhsPairRequest((p) => phsShowPairModal(p));
  }
  if (window.electronAPI.onPhsStatus) {
    window.electronAPI.onPhsStatus((st) => { _phsStatus = st; phsRenderStatus(st); });
  }
  if (window.electronAPI.onPhsClients) {
    window.electronAPI.onPhsClients((c) => { if (c && _phsStatus) { _phsStatus.clients = c.clients; _phsStatus.connected = c.list; phsRenderStatus(_phsStatus); } });
  }

  phsLoadEnabledState();
  phsRefresh();
}

function phsLoadEnabledState() {
  const box = document.getElementById('phsEnable');
  if (!box) return;
  const stored = localStorage.getItem('zmt_phs_enabled');
  if (stored !== null) box.checked = stored === '1';
}

// ---- shared link/QR helpers -------------------------------------------------

function phsActiveIp() {
  if (_phsSelectedIp) return _phsSelectedIp;
  const st = _phsStatus;
  if (st && st.ip) return st.ip;
  return '192.168.1.1';
}

function phsActivePort() {
  return (_phsStatus && _phsStatus.port) || 4520;
}

function phsScannerUrl() { return `https://${phsActiveIp()}:${phsActivePort()}`; }
function phsSaleUrl() { return `https://${phsActiveIp()}:${phsActivePort()}/sale/`; }

function phsPickIp(ip) {
  _phsSelectedIp = ip || '';
  try {
    if (_phsSelectedIp) localStorage.setItem('zmt_phs_ip', _phsSelectedIp);
    else localStorage.removeItem('zmt_phs_ip');
  } catch (e) {}
  const running = !!(_phsStatus && _phsStatus.status === 'running');
  phsRenderQr(running);
  psaleRenderStatus();
}

function phsRenderIpPicker() {
  const wrap = document.getElementById('phsIpPickWrap');
  const sel = document.getElementById('phsIpSelect');
  if (!wrap || !sel) return;
  const opts = (_phsStatus && _phsStatus.ipOptions) || [];
  if (opts.length < 2) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  const current = phsActiveIp();
  sel.innerHTML = opts.map((o) => {
    const tag = o.virtual ? ' <span style="color:#c98a00;">(' + (t('connection.scannerIpVirtual') || 'وهمي') + ')</span>' : '';
    return `<option value="${escHtml(o.ip)}"${o.ip === current ? ' selected' : ''}>${escHtml(o.ip)} — ${escHtml(o.name || '')}${tag}</option>`;
  }).join('');
}

function phsErrText(code) {
  const c = String(code || '');
  if (c === 'PORT_IN_USE' || c === 'EADDRINUSE') return t('connection.scannerErrPort') || 'المنفذ مستخدم من برنامج آخر — سيُجرّب منفذ بديل تلقائيًا';
  if (c.indexOf('CERT_') === 0 || c === 'cert_generation_failed' || c === 'no_cert_material') return t('connection.scannerErrCert') || 'تعذّر توليد شهادة الأمان المحلية';
  if (c === 'TIMEOUT') return t('connection.scannerErrTimeout') || 'انتهت المهلة أثناء التشغيل';
  if (c === 'listen_failed') return t('connection.scannerErrPort') || 'تعذّر فتح منفذ الشبكة';
  return c;
}

function phsShowErrDetail() {
  const d = document.getElementById('phsErrDetail');
  if (d) d.style.display = (d.style.display === 'none' || !d.style.display) ? 'block' : 'none';
}

function phsCopyLink(kind, btn) {
  const url = kind === 'sale' ? phsSaleUrl() : phsScannerUrl();
  const done = () => {
    if (!btn) return;
    const prev = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-check"></i> ${t('connection.copyDone') || 'تم النسخ'}`;
    setTimeout(() => { btn.innerHTML = prev; }, 1300);
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => phsCopyFallback(url, done));
    } else { phsCopyFallback(url, done); }
  } catch (e) { phsCopyFallback(url, done); }
}

function phsCopyFallback(url, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); done();
  } catch (e) {}
}

function phsToggleEnable() {
  const box = document.getElementById('phsEnable');
  const result = document.getElementById('phsToggleResult');
  const enabled = box.checked;
  if (enabled) {
    localStorage.setItem('zmt_phs_enabled', '1');
    result.innerHTML = `<span class="text-muted">${t('connection.scannerStarting') || 'جاري تشغيل الخدمة…'}</span>`;
    window.electronAPI.phsStart().then((r) => {
      if (r && r.success) {
        result.innerHTML = `<span class="text-success">${t('connection.scannerStarted') || 'ماسح الجوال يعمل الآن'}</span>`;
        phsRenderStatus(r.data);
      } else {
        box.checked = false;
        localStorage.setItem('zmt_phs_enabled', '0');
        _phsLastErr = (r && r.error) || '';
        const msg = phsErrText(_phsLastErr);
        result.innerHTML = `<span class="text-danger">${t('connection.scannerStartError') || 'تعذر التشغيل'}: ${escHtml(msg)}</span>`
          + (_phsLastErr ? ` <a href="#" onclick="phsShowErrDetail();return false;" style="font-size:12px;">${t('connection.scannerDetails') || 'تفاصيل'}</a>` : '')
          + `<div id="phsErrDetail" class="phs-err-detail" style="display:none;">${escHtml(_phsLastErr)}</div>`;
      }
    }).catch((e) => {
      box.checked = false;
      localStorage.setItem('zmt_phs_enabled', '0');
      _phsLastErr = e.message;
      result.innerHTML = `<span class="text-danger">${t('common.error')}: ${escHtml(phsErrText(e.message))}</span>`;
    });
  } else {
    const running = _phsStatus && (_phsStatus.status === 'running' || _phsStatus.status === 'starting');
    if (running) {
      window.electronAPI.phsStop();
    }
    localStorage.setItem('zmt_phs_enabled', '0');
    result.innerHTML = `<span class="text-muted">${t('connection.scannerStopped') || 'تم إيقاف ماسح الجوال'}</span>`;
    if (_phsStatus) { _phsStatus.status = 'stopped'; phsRenderStatus(_phsStatus); }
  }
}
function phsStatusTxt(st) {
  if (!st) return '—';
  if (st.status === 'running') return t('connection.scannerRunning') || 'يعمل';
  if (st.status === 'starting') return t('connection.scannerStarting') || 'جاري التشغيل…';
  if (st.status === 'error') return (t('connection.scannerError') || 'خطأ') + ': ' + phsErrText(st.error);
  return t('connection.scannerStopped') || 'متوقف';
}

function phsRenderStatus(st) {
  if (!st) return;
  const strip = document.getElementById('phsStatusStrip');
  if (!strip) return;
  strip.style.display = 'flex';
  const icon = document.getElementById('phsStatusIcon');
  const title = document.getElementById('phsStatusTitle');
  const ips = document.getElementById('phsStatusIps');
  const clients = document.getElementById('phsStatusClients');

  const running = st.status === 'running';
  icon.className = 'phs-status-icon' + (running ? ' ok' : (st.status === 'error' ? ' err' : ''));
  icon.innerHTML = running ? '<i class="fas fa-check-circle"></i>' : (st.status === 'error' ? '<i class="fas fa-exclamation-triangle"></i>' : '<i class="fas fa-circle-notch fa-spin"></i>');
  title.textContent = phsStatusTxt(st);

  if (running) {
    const ip = st.ip || '';
    ips.textContent = Array.isArray(st.ips) && st.ips.length
      ? st.ips.map(i => `https://${i}:${st.port}`).join('  ·  ')
      : '';
    phsRenderQr(running);
    clients.innerHTML = st.clients > 0
      ? (st.connected || []).map(c => `<span class="phs-badge"><i class="fas fa-mobile-alt"></i> ${escHtml(c.name)}</span>`).join(' ')
      : '';
    const box = document.getElementById('phsEnable');
    if (box) box.checked = true;
  } else {
    ips.textContent = '';
    clients.innerHTML = '';
  }
  phsRenderIpPicker();
  phsRenderDevices();
  psaleRenderStatus();
}

function phsRefresh() {
  if (!window.electronAPI || !window.electronAPI.phsStatus) return;
  window.electronAPI.phsStatus().then((st) => {
    _phsStatus = st;
    phsRenderStatus(st);
    if (st && st.status === 'running') {
      const box = document.getElementById('phsEnable');
      if (box) box.checked = true;
    }
  }).catch(() => {});
  phsRenderDevices();
}

// ===== QR CODE =====
function phsRenderQr(on) {
  const box = document.getElementById('phsQr');
  if (!box) return;
  const urlEl = document.getElementById('phsQrUrl');
  if (!on) { box.innerHTML = ''; if (urlEl) urlEl.textContent = ''; return; }
  const url = phsScannerUrl();
  box.innerHTML = '';
  if (urlEl) urlEl.textContent = url;

  // Needs window.qrcodegen (patched UMD). Draw modules to a canvas.
  drawQr(url, box);
}

function drawQr(text, targetEl) {
  if (!window.qrcodegen) {
    // Lazy-load the patched UMD build, then draw. The main page already includes
    // it, but this keeps the tab working even if that script was missed/cached.
    const s = document.createElement('script');
    s.src = 'js/vendor/qrcodegen.js';
    s.onload = () => drawQr(text, targetEl);
    s.onerror = () => { targetEl.innerHTML = `<span class="text-danger">${t('common.error')}: qrcodegen failed to load</span>`; };
    document.body.appendChild(s);
    return;
  }
  try {
    const qr = window.qrcodegen(0, 'M'); // auto type number, medium EC
    qr.addData(text, 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    const cssSize = 190;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const size = Math.round(cssSize * dpr);
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    canvas.style.width = cssSize + 'px'; canvas.style.height = cssSize + 'px';
    canvas.style.imageRendering = 'pixelated';
    const ctx = canvas.getContext('2d');
    const cell = size / count;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(Math.floor(c * cell), Math.floor(r * cell), Math.ceil(cell) + (c === count - 1 ? 1 : 0), Math.ceil(cell) + (r === count - 1 ? 1 : 0));
      }
    }
    targetEl.appendChild(canvas);
  } catch (e) {
    targetEl.innerHTML = `<span class="text-danger">${t('common.error')}: ${e.message}</span>`;
  }
}

// ===== FIREWALL =====
function phsEnsureFirewall() {
  const result = document.getElementById('phsFirewallResult');
  if (!window.electronAPI || !window.electronAPI.phsEnsureFirewall) return;
  result.innerHTML = `<span class="text-muted">${t('connection.scannerFwChecking') || 'جاري التحقق…'}</span>`;
  window.electronAPI.phsEnsureFirewall().then((r) => {
    if (r && r.success) {
      result.innerHTML = `<span class="text-success">${t('connection.scannerFwOk') || 'أذونات الجدار الناري سليمة'}</span>`;
    } else if (r && r.needsPermission) {
      result.innerHTML = `<span class="text-warning">${t('connection.scannerFwNeedsPermission') || 'تم الرفض — ستحتاج لتشغيل الزر كمسؤول (UAC)'}</span>`;
    }
  }).catch((e) => {
    result.innerHTML = `<span class="text-danger">${t('common.error')}: ${e.message}</span>`;
  });
}

// ===== PAIRING MODAL =====
function phsShowPairModal(p) {
  const existing = document.getElementById('phsPairModalBackdrop');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'phsPairModalBackdrop';
  overlay.innerHTML = `
    <div id="phsPairModal">
      <i class="fas fa-mobile-alt" style="font-size:30px;color:#0066B1;"></i>
      <h3>${t('connection.scannerPairTitle') || 'طلب اقتران ماسح'}</h3>
      <div class="phs-pair-device-name" style="font-size:18px;font-weight:800;margin-top:4px;">${escHtml(p.deviceName)}</div>
      <div class="phs-pair-id" dir="ltr" style="font-family:monospace;color:#888;font-size:12px;">${escHtml(p.deviceId)}</div>
      <div class="phs-pair-ip"><i class="fas fa-network-wired"></i> ${escHtml(p.ip)}</div>
      <div class="phs-pair-btns">
        <button class="phs-btn-always" onclick="phsPairDecide('${p.requestId}','always')"><i class="fas fa-check"></i> ${t('connection.scannerPairAlways') || 'دائمًا'}</button>
        <button class="phs-btn-session" onclick="phsPairDecide('${p.requestId}','session')"><i class="fas fa-hourglass-half"></i> ${t('connection.scannerPairSession') || 'هذه الجلسة'}</button>
        <button class="phs-btn-deny" onclick="phsPairDecide('${p.requestId}','deny')"><i class="fas fa-ban"></i> ${t('connection.scannerPairDeny') || 'رفض'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function phsPairDecide(requestId, decision) {
  if (window.electronAPI && window.electronAPI.phsDecide) {
    window.electronAPI.phsDecide(requestId, decision).then(() => phsRefreshDevices());
  }
  const overlay = document.getElementById('phsPairModalBackdrop');
  if (overlay) overlay.remove();
}

function phsRefreshDevices() {
  if (!window.electronAPI || !window.electronAPI.phsListApproved) return;
  window.electronAPI.phsListApproved().then((r) => {
    if (r && r.success) phsRenderDevices(r.data);
  }).catch(() => {});
}

function phsRenderDevices(list) {
  const render = document.getElementById('phsDevicesList');
  if (!render) return;
  if (!list) {
    if (!window.electronAPI || !window.electronAPI.phsListApproved) return;
    window.electronAPI.phsListApproved().then((r) => { if (r && r.success) phsRenderDevices(r.data); }).catch(() => {});
    return;
  }
  const empty = document.getElementById('phsDevicesEmpty');
  if (!list.length) { render.innerHTML = ''; if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';
  render.innerHTML = list.map(d => `
    <div class="phs-device-item">
      <i class="fas fa-mobile-alt" style="color:#0066B1;"></i>
      <div>
        <div class="name">${escHtml(d.deviceName)}</div>
        <div class="id" dir="ltr">${escHtml(d.deviceId)}</div>
      </div>
      <label class="phs-sell-toggle" style="margin-right:auto;display:flex;align-items:center;gap:6px;font-size:12px;color:#3d9970;cursor:pointer;" title="${t('connection.scannerSellTitle') || 'السماح لهذا الهاتف بالبيع'}">
        <input type="checkbox" ${d.sell ? 'checked' : ''} onchange="psaleSetDeviceSell('${escAttr(d.deviceId)}', this.checked)">
        ${t('connection.scannerSell') || 'البيع'}
      </label>
      <button class="btn btn-sm btn-danger" style="margin-left:10px;" onclick="phsRemoveDevice('${escAttr(d.deviceId)}')">
        <i class="fas fa-trash"></i> ${t('connection.scannerRemove') || 'إزالة'}
      </button>
    </div>`).join('');
}

// ===== PHONE POS («البيع») =====
function setupPhoneSale() {
  if (!window.electronAPI) return;
  if (window.electronAPI.onPsaleEnabled) {
    window.electronAPI.onPsaleEnabled((st) => { psaleRenderEnabled(!!(st && st.enabled)); });
  }
  psaleLoadEnabledState();
  if (window.electronAPI.psaleGetEnabled) {
    window.electronAPI.psaleGetEnabled().then((r) => { psaleRenderEnabled(!!(r && r.enabled)); }).catch(() => {});
  }
}

function psaleLoadEnabledState() {
  const box = document.getElementById('psaleEnable');
  if (!box) return;
  // Authority lives in the main-process store; the checkbox reflects status booleans.
  box.checked = false;
}

function psaleRenderEnabled(enabled) {
  const box = document.getElementById('psaleEnable');
  if (box) box.checked = enabled;
  psaleRenderStatus();
}

function psaleToggleEnable() {
  const box = document.getElementById('psaleEnable');
  const result = document.getElementById('psaleToggleResult');
  const enabled = box.checked;
  if (!window.electronAPI || !window.electronAPI.psaleSetEnabled) return;
  if (enabled) {
    // The scanner server must be up to serve the /sale/ page.
    return window.electronAPI.phsStart().then((r) => {
      return window.electronAPI.psaleSetEnabled(true).then(() => {
        result.innerHTML = `<span class="text-success">${t('connection.psaleEnabled') || 'البيع من الهاتف مفعّل الآن'}</span>`;
        psaleRenderStatus();
        phsRefresh();
      });
    }).catch(() => {
      box.checked = false;
      result.innerHTML = `<span class="text-danger">${t('common.error')}</span>`;
    });
  }
  return window.electronAPI.psaleSetEnabled(false).then(() => {
    result.innerHTML = `<span class="text-muted">${t('connection.psaleDisabled') || 'تم إيقاف البيع من الهاتف'}</span>`;
    psaleRenderStatus();
  }).catch(() => { box.checked = true; });
}

function psaleSetDeviceSell(deviceId, sell) {
  if (window.electronAPI && window.electronAPI.psaleSetDeviceSell) {
    window.electronAPI.psaleSetDeviceSell(deviceId, sell).catch(() => {});
  }
}

function psaleRenderStatus() {
  const strip = document.getElementById('psaleStatusStrip');
  if (!strip) return;
  const enabled = (document.getElementById('psaleEnable') || {}).checked === true;
  const running = _phsStatus && _phsStatus.status === 'running';
  if (!running) {
    strip.style.display = 'none';
    psaleQrClear();
    return;
  }
  strip.style.display = 'flex';
  const icon = document.getElementById('psaleStatusIcon');
  const title = document.getElementById('psaleStatusTitle');
  const ips = document.getElementById('psaleStatusIps');
  const clients = document.getElementById('psaleStatusClients');
  icon.className = 'phs-status-icon ' + (enabled ? 'ok' : '');
  icon.innerHTML = enabled ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-link"></i>';
  title.textContent = enabled
    ? (t('connection.psaleRunning') || 'البيع من الهاتف مفعّل')
    : (t('connection.psalePaused') || 'البيع متوقف — فعّله أعلاه');
  if (running) {
    ips.textContent = Array.isArray(_phsStatus.ips) && _phsStatus.ips.length
      ? _phsStatus.ips.map(i => `https://${i}:${_phsStatus.port}/sale/`).join('  ·  ')
      : '';
    clients.innerHTML = (_phsStatus.connected || []).filter(c => c.sell)
      .map(c => `<span class="phs-badge"><i class="fas fa-cash-register"></i> ${escHtml(c.name)}</span>`).join(' ');
    psaleRenderQr();
  }
}

function psaleRenderQr() {
  const box = document.getElementById('psaleQr');
  if (!box) return;
  const url = phsSaleUrl();
  box.innerHTML = '';
  const u = document.getElementById('psaleQrUrl');
  if (u) u.textContent = url;
  drawQr(url, box);
}

function psaleQrClear() {
  const box = document.getElementById('psaleQr');
  if (box) box.innerHTML = '';
  const url = document.getElementById('psaleQrUrl');
  if (url) url.textContent = '';
}

function phsRemoveDevice(deviceId) {
  if (!confirm(t('connection.scannerRemoveConfirm') || 'إزالة هذا الجهاز ومنع اقترانه؟')) return;
  if (window.electronAPI && window.electronAPI.phsRemoveDevice) {
    window.electronAPI.phsRemoveDevice(deviceId).then(() => { phsRefreshDevices(); phsRefresh(); }).catch(() => {});
  }
}

// ===== TAB SWITCHING =====

function connLoadUserInfo() {
  const statusCard = document.getElementById('connStatusCard');
  const statusIcon = document.getElementById('connStatusIcon');
  const statusTitle = document.getElementById('connStatusTitle');
  const statusDesc = document.getElementById('connStatusDesc');
  const statusBadge = document.getElementById('connStatusBadge');

  if (Auth.isLoggedIn()) {
    const user = Auth.getCurrentUser();
    const email = Auth.getUserEmail();
    const code = Auth.getUserCode();
    const type = Auth.getStoreType();
    const parent = Auth.getParentCode();

    document.getElementById('connUserInfo').style.display = '';

    const isMainOwner = type === 'main' && user.role !== 'user';
    const emailRow = document.getElementById('connEmailRow');
    if (isMainOwner) {
      emailRow.style.display = '';
      document.getElementById('connUserEmail').textContent = email;
    } else {
      emailRow.style.display = 'none';
    }

    document.getElementById('connUserCode').textContent = code;
    document.getElementById('connUserStoreType').textContent = type === 'main' ? t('connection.mainStore') : t('connection.branch');

    if (type === 'branch' && parent) {
      document.getElementById('connUserParentRow').style.display = '';
      document.getElementById('connUserParentCode').textContent = parent;
    } else {
      document.getElementById('connUserParentRow').style.display = 'none';
    }

    statusCard.className = 'conn-status-card connected';
    statusIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
    statusTitle.textContent = t('connection.connected');
    statusDesc.textContent = type === 'main' ? t('connection.mainConnected') : t('connection.branchConnectedMsg');
    statusBadge.textContent = t('online');
    statusBadge.className = 'conn-status-badge online';

    // ===== BRANCH: Hide tabs that don't apply =====
    if (type === 'branch') {
      const recoverTabBtn = document.getElementById('connTabRecoverBtn');
      if (recoverTabBtn) recoverTabBtn.style.display = 'none';

      document.getElementById('connBranchesNotMain').style.display = '';
      document.getElementById('connBranchesMain').style.display = 'none';

      document.getElementById('connTabRecover').style.display = 'none';

      const syncTabBtn = document.getElementById('connTabSyncBtn');
      if (syncTabBtn) syncTabBtn.style.display = '';

      connSwitchTab('setup');
    } else {
      const recoverTabBtn = document.getElementById('connTabRecoverBtn');
      if (recoverTabBtn) recoverTabBtn.style.display = '';
      document.getElementById('connTabRecover').style.display = '';
      const syncTabBtn = document.getElementById('connTabSyncBtn');
      if (syncTabBtn) syncTabBtn.style.display = '';
      document.getElementById('connTabSync').style.display = '';
    }
  } else {
    document.getElementById('connUserInfo').style.display = 'none';
    statusCard.className = 'conn-status-card';
    statusIcon.innerHTML = '<i class="fas fa-cloud"></i>';
    statusTitle.textContent = t('offline');
    statusDesc.textContent = t('connection.enterCredentials');
    statusBadge.textContent = t('offline');
    statusBadge.className = 'conn-status-badge';
  }
}

// ===== LOGOUT =====
function connLogout() {
  if (!confirm(t('connection.logoutConfirm'))) return;
  Auth.signOut();
  CloudService.stopAutoSync();
  if (typeof CloudService.stopCommandPolling === 'function') {
    CloudService.stopCommandPolling();
  }
  showLogin();
}

// Ask for the store password WITHOUT prompt() (unsupported in Electron).
// Resolves with the entered string, or null if the user cancels/closes.
function connPromptPassword(message) {
  return new Promise((resolve) => {
    const id = 'zmt_conn_prompt_' + Math.random().toString(36).slice(2);
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: '999999',
    });
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: '#fff', borderRadius: '8px', padding: '20px', minWidth: '320px',
      fontFamily: 'sans-serif', direction: 'rtl', textAlign: 'right',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    });
    card.innerHTML =
      '<p style="margin:0 0 12px;">' + (message || 'أدخل كلمة مرور المحل:') + '</p>' +
      '<input id="' + id + '_in" type="password" style="width:100%;padding:8px;box-sizing:border-box;margin-bottom:12px;font-size:14px;">' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button id="' + id + '_cancel" type="button" style="padding:6px 14px;">' + (t('common.cancel') || 'إلغاء') + '</button>' +
      '<button id="' + id + '_ok" type="button" style="padding:6px 14px;background:#0066B1;color:#fff;border:none;border-radius:4px;">' + (t('common.ok') || 'تأكيد') + '</button>' +
      '</div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    const input = card.querySelector('#' + id + '_in');
    input.focus();
    const finish = (v) => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      resolve(v);
    };
    card.querySelector('#' + id + '_ok').onclick = () => finish(input.value);
    card.querySelector('#' + id + '_cancel').onclick = () => finish(null);
    input.onkeydown = (ev) => { if (ev.key === 'Enter') finish(input.value); if (ev.key === 'Escape') finish(null); };
    overlay.onclick = (ev) => { if (ev.target === overlay) finish(null); };
  });
}

// Render a standardized upload "skipped" result message.
function connUploadResultMessage(uploadResult) {
  if (!uploadResult || !uploadResult.skipped) return null;
  if (uploadResult.reason === 'no_data') {
    return `<span class="text-warning">${t('backup.noDataToBackup') || 'لا توجد بيانات للرفع'}</span>`;
  }
  if (uploadResult.reason === 'lan_sub') {
    return `<span class="text-warning"><i class="fas fa-info-circle"></i> ${t('connection.lanSubUploadMsg') || 'هذا الجهاز فرعي (LAN): رفع البيانات للسحابة يتم من السيرفر الرئيسي لهذا الموقع'}</span>`;
  }
  return `<span class="text-success">${t('connection.alreadySynced') || 'البيانات محدثة في السحابة'}</span>`;
}

// ===== SYNC =====
async function connUploadBackup() {
  const btn = document.getElementById('connUploadBtn');
  const result = document.getElementById('connSyncResult');

  let code = Auth.getUserCode();
  if (!code || !CloudService.isCloudConnected()) {
    alert(t('connection.cloudRequired'));
    return;
  }

  // If the password isn't stored locally, we will hit the cloud-auth gate and get
  // a cryptic RLS error. Ask once up-front instead of letting it fail then retry.
  if (!Auth.hasStorePassword()) {
    const input = await connPromptPassword(t('connection.enterStorePassword') || 'أدخل كلمة مرور المحل للمزامنة مع السحابة');
    if (input && code) {
      const verified = await Auth.verifyCloudPassword(code, input);
      if (!verified) {
        result.innerHTML = `<span class="text-danger">${t('connection.wrongPassword') || 'كلمة مرور المحل غير صحيحة'}</span>`;
        return;
      }
    }
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('connection.uploading')}`;
  result.textContent = '';

  let resetter = () => { btn.disabled = false; btn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> ${t('connection.uploadBackupBtn')}`; };

  // Top-level guard: the button is ALWAYS re-enabled, even if something
  // unexpected throws (including prompt()/alert()-free failures).
  try {
    const uploadResult = await Promise.race([
      CloudService.uploadBackup(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('انتهت مهلة الرفع الكلية (60 ثانية) — تحقق من سرعة الإنترنت وحاول مرة أخرى')), 60000)
      ),
    ]);
    if (uploadResult.skipped) {
      const msg = connUploadResultMessage(uploadResult);
      result.innerHTML = msg || `<span class="text-success">${t('connection.alreadySynced') || 'البيانات محدثة في السحابة'}</span>`;
    } else {
      result.innerHTML = `<span class="text-success">${t('connection.uploadSuccess')}</span>`;
    }
    resetter();
    connUpdateLastSync();
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    // The store password is stored locally, so backups must run silently — never
    // prompt. CloudService.uploadBackup() already self-heals stale tokens (clears
    // and re-mints once), and auto-sync retries on its own schedule. Just surface
    // the error and re-enable the button.
    result.innerHTML = `<span class="text-danger">${t('common.error')}: ${msg}</span>`;
    resetter();
  }
}

async function connDownloadBackup() {
  const btn = document.getElementById('connDownloadBtn');
  const result = document.getElementById('connSyncResult');

  if (!CloudService.isCloudConnected()) {
    alert(t('connection.cloudRequired'));
    return;
  }

  // The store password is stored locally, so the cloud token is minted silently
  // by the service — never prompt. We only ask when no password is stored yet
  // (first-time account) so the token can be minted at all.
  if (!Auth.hasStorePassword()) {
    const input = await connPromptPassword(t('connection.enterStorePassword') || 'أدخل كلمة مرور المحل لاستعادة النسخة');
    if (!input) return;
    try {
      const verified = await Auth.verifyCloudPassword(Auth.getUserCode(), input);
      if (!verified) {
        result.innerHTML = `<span class="text-danger">${t('connection.wrongPassword')}</span>`;
        return;
      }
    } catch (e) {
      result.innerHTML = `<span class="text-danger">${t('connection.verificationError')}${e.message}</span>`;
      return;
    }
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('common.loading')}`;
  result.textContent = '';

  try {
    await DB.waitForReady();
    const backup = await CloudService.downloadBackup();
    if (!backup || !backup.data) throw new Error(t('connection.backupEmpty'));

    const dbData = backup.data.zmt_db || {};
    const merged = {};
    if (dbData.products) merged.products = dbData.products;
    if (dbData.invoices) merged.invoices = dbData.invoices;
    if (dbData.orders) merged.orders = dbData.orders;
    merged.meta = {};
    if (dbData.nextBarcode) merged.meta.nextBarcode = dbData.nextBarcode;
    if (dbData.nextInvoiceCounter) merged.meta.nextInvoiceCounter = dbData.nextInvoiceCounter;
    if (dbData.nextPaymentCounter) merged.meta.nextPaymentCounter = dbData.nextPaymentCounter;
    if (backup.data.products) merged.products = backup.data.products;
    if (backup.data.invoices) merged.invoices = backup.data.invoices;
    if (backup.data.orders) merged.orders = backup.data.orders;
    if (backup.data.meta) merged.meta = backup.data.meta;
    if (backup.data.zmt_customers) merged.customers = backup.data.zmt_customers;
    if (backup.data.zmt_suppliers) merged.suppliers = backup.data.zmt_suppliers;
    if (backup.data.zmt_payments) merged.payments = backup.data.zmt_payments;
    if (backup.data.zmt_returns) merged.returns = backup.data.zmt_returns;
    if (backup.data.zmt_transfers) merged.transfers = backup.data.zmt_transfers;
    if (backup.data.zmt_discounts) merged.discounts = backup.data.zmt_discounts;
    if (backup.data.zmt_orders) merged.orders = backup.data.zmt_orders;
    if (backup.data.zmt_companies) merged.companies = backup.data.zmt_companies;
    if (backup.data.zmt_employees) merged.employees = backup.data.zmt_employees;
    if (backup.data.zmt_attendance) merged.attendance = backup.data.zmt_attendance;
    await DB.importAll(merged);

    for (const [key, value] of Object.entries(backup.data)) {
      if (key.startsWith('zmt_') && !['zmt_db', 'zmt_customers', 'zmt_suppliers', 'zmt_payments', 'zmt_returns', 'zmt_transfers', 'zmt_discounts', 'zmt_orders', 'zmt_companies', 'zmt_employees', 'zmt_attendance'].includes(key)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    }

    result.innerHTML = `<span class="text-success">${t('connection.restoreSuccessMsg')}</span>`;
    setTimeout(() => location.reload(), 2000);
  } catch (e) {
    result.innerHTML = `<span class="text-danger">${t('common.error')}: ${e.message}</span>`;
  }

  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-cloud-download-alt"></i> ${t('connection.restoreBackupBtn')}`;
}

// ===== PUSH NOTIFICATIONS =====
function connLoadPushSettings() {
  const urlEl = document.getElementById('connPushSiteUrl');
  if (!urlEl) return;
  const saved = localStorage.getItem('zmt_push_site_url');
  const def = (typeof window.ZMT_PUSH_SITE_URL === 'string') ? window.ZMT_PUSH_SITE_URL : '';
  urlEl.value = saved || def || '';
}

function connSavePushSettings() {
  const urlEl = document.getElementById('connPushSiteUrl');
  const result = document.getElementById('connPushResult');
  if (!urlEl || !result) return;

  const url = (urlEl.value || '').trim().replace(/\/+$/, '');

  if (!url) {
    result.innerHTML = `<span class="text-danger">${t('connection.pushUrlRequired')}</span>`;
    return;
  }
  if (!/^https?:\/\/.+/.test(url)) {
    result.innerHTML = `<span class="text-danger">${t('connection.pushUrlInvalid')}</span>`;
    return;
  }

  localStorage.setItem('zmt_push_site_url', url);
  localStorage.removeItem('zmt_push_secret');
  result.innerHTML = `<span class="text-success">${t('connection.pushSaved')}</span>`;
}

// ===== AUTO SYNC =====
function connToggleAutoSync() {
  const enabled = document.getElementById('connAutoSync').checked;
  localStorage.setItem('zmt_cloud_autosync', enabled ? '1' : '0');
  document.getElementById('connAutoSyncSettings').style.display = enabled ? '' : 'none';

  if (enabled) {
    if (!CloudService.isCloudConnected()) {
      alert(t('connection.cloudRequired'));
      document.getElementById('connAutoSync').checked = false;
      localStorage.setItem('zmt_cloud_autosync', '0');
      document.getElementById('connAutoSyncSettings').style.display = 'none';
      return;
    }
    if (typeof CloudService.isLanSubDevice === 'function' && CloudService.isLanSubDevice()) {
      alert(t('connection.lanSubUploadMsg') || 'هذا الجهاز فرعي (LAN): رفع البيانات للسحابة يتم من السيرفر الرئيسي لهذا الموقع');
    }
    const interval = parseInt(document.getElementById('connSyncInterval').value);
    localStorage.setItem('zmt_cloud_autosync_interval', interval);
    CloudService.startAutoSync(interval);
  } else {
    CloudService.stopAutoSync();
  }
}

function connUpdateSyncInterval() {
  const interval = parseInt(document.getElementById('connSyncInterval').value);
  localStorage.setItem('zmt_cloud_autosync_interval', interval);
  if (document.getElementById('connAutoSync').checked) {
    CloudService.startAutoSync(interval);
  }
}

function connUpdateLastSync() {
  const lastSync = localStorage.getItem('zmt_cloud_last_sync');
  const info = document.getElementById('connLastSyncInfo');
  if (info && lastSync) {
    const d = new Date(lastSync);
    info.textContent = t('connection.lastSync') + d.toLocaleString('ar-EG-u-nu-latn');
  } else if (info) {
    info.textContent = '';
  }
}

// ===== BRANCHES =====
function connShowAddBranch() {
  document.getElementById('connAddBranchForm').style.display = '';
  document.getElementById('connBranchName').value = '';
  document.getElementById('connBranchPassword').value = '';
  document.getElementById('connAddBranchResult').textContent = '';
}

function connCancelAddBranch() {
  document.getElementById('connAddBranchForm').style.display = 'none';
}

async function connSaveBranch() {
  const name = document.getElementById('connBranchName').value.trim();
  const password = document.getElementById('connBranchPassword').value.trim();
  const result = document.getElementById('connAddBranchResult');

  if (!name) {
    result.innerHTML = `<span class="text-danger">${t('connection.branchNameRequired')}</span>`;
    return;
  }
  if (!password) {
    result.innerHTML = `<span class="text-danger">${t('connection.passwordRequired')}</span>`;
    return;
  }

  try {
    const branch = await Auth.createBranch(name, password);
    result.innerHTML = `<span class="text-success">${t('connection.branchCreated')}${branch.code}</span>`;
    document.getElementById('connBranchName').value = '';
    document.getElementById('connBranchPassword').value = '';
    connRefreshBranches();
  } catch (e) {
    result.innerHTML = `<span class="text-danger">${t('common.error')}: ${e.message}</span>`;
  }
}

async function connRefreshBranches() {
  if (Auth.getStoreType() !== 'main') return;

  const list = document.getElementById('connBranchesList');
  const empty = document.getElementById('connBranchesEmpty');

  try {
    const branches = await Auth.listBranchesFull();
    if (branches.length === 0) {
      list.innerHTML = '';
      empty.style.display = '';
      return;
    }

    empty.style.display = 'none';
    list.innerHTML = branches.map(b => `
      <div class="conn-branch-card">
        <div class="conn-branch-icon"><i class="fas fa-store"></i></div>
        <div class="conn-branch-info">
          <div class="conn-branch-name">${b.name}</div>
          <div class="conn-branch-code" dir="ltr">${b.code}</div>
          <div class="conn-branch-pass">${t('connection.passwordLabel')}${b.password}</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="connViewBranchInv('${b.code}')" title="${t('connection.viewStock')}">
          <i class="fas fa-warehouse"></i>
        </button>
        <button class="btn btn-sm btn-danger" onclick="connDeleteBranch('${b.code}', '${b.name}')" title="${t('connection.deleteBranchBtn')}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="conn-empty-state"><p class="text-danger">${t('common.error')}: ${e.message}</p></div>`;
  }
}

function connLoadBranches() {
  if (Auth.getStoreType() === 'main' && CloudService.isCloudConnected()) {
    connRefreshBranches();
  }
}

async function connDeleteBranch(branchCode, branchName) {
  if (!confirm(`${t('connection.deleteBranchConfirm1')}"${branchName}"?\n${t('connection.deleteBranchConfirm2')}`)) return;

  try {
    await Auth.deleteBranch(branchCode);
    connRefreshBranches();
  } catch (e) {
    alert(t('common.error') + ': ' + e.message);
  }
}

async function connViewBranchInv(branchCode) {
  // The store password is stored locally, so the cloud token is minted silently
  // by the service — never prompt. We only ask when no password is stored yet
  // (first-time account) so the token can be minted at all.
  if (!Auth.hasStorePassword()) {
    const input = await connPromptPassword(t('connection.enterStorePasswordView') || 'أدخل كلمة مرور المحل لعرض مخزون الفرع');
    if (!input) return;
    try {
      const verified = await Auth.verifyCloudPassword(Auth.getUserCode(), input);
      if (!verified) {
        alert(t('connection.wrongPassword'));
        return;
      }
    } catch (e) {
      alert(t('connection.verificationError') + e.message);
      return;
    }
  }

  const card = document.getElementById('connBranchInvCard');
  const title = document.getElementById('connBranchInvTitle');
  const content = document.getElementById('connBranchInvContent');

  title.textContent = branchCode;
  card.style.display = '';
  content.innerHTML = `<p>${t('common.loading')}</p>`;

  try {
    const products = await CloudService.downloadBranchInventory(branchCode);
    if (products.length === 0) {
      content.innerHTML = `<p class="text-muted">${t('connection.noBranchStock')}</p>`;
      return;
    }

    const brands = [...BRANDS.global, ...BRANDS.chinese];
    const isManager = Auth.isManager();
    const showBuy = Auth.buyPriceVisible();
    content.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${t('common.product')}</th>
            <th>${t('connection.barcode')}</th>
            <th>${t('connection.brand')}</th>
            <th>${t('common.qty')}</th>
            ${showBuy ? `<th>${t('inventory.col5')}</th>` : ''}
            <th>${t('connection.sellPrice')}</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((p, i) => {
            const brand = brands.find(b => b.id === p.brandId);
            return `<tr>
              <td>${i + 1}</td>
              <td>${p.name}</td>
              <td dir="ltr">${p.barcode}</td>
              <td>${brand ? brand.name : p.brandId || '-'}</td>
              <td>${p.quantity}</td>
              ${showBuy ? `<td>DA${fmtMoney((p.buyPrice || 0))}</td>` : ''}
              <td>DA${fmtMoney((p.sellPrice || 0))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    content.innerHTML = `<p class="text-danger">${t('common.error')}: ${e.message}</p>`;
  }
}

function connCloseBranchInv() {
  document.getElementById('connBranchInvCard').style.display = 'none';
}

// ===== ACCOUNT RECOVERY (Direct lookup by email) =====
let _connRecEmail = '';

function connRecShowStep(step) {
  document.getElementById('connRecStep1').style.display = 'none';
  document.getElementById('connRecStep2').style.display = 'none';
  document.getElementById('connRecStep3').style.display = 'none';
  document.getElementById('connRecStep' + step).style.display = '';
}

async function connRecLookup() {
  const email = document.getElementById('connRecEmail').value.trim();
  const status = document.getElementById('connRecEmailStatus');

  if (!email || !email.includes('@')) {
    status.innerHTML = `<span class="text-danger">${t('connection.emailRequired')}</span>`;
    return;
  }

  status.innerHTML = `<span class="text-muted">${t('connection.searching')}</span>`;
  document.getElementById('connRecLookupBtn').disabled = true;

  try {
    const info = await Auth.recoverByEmail(email);
    _connRecEmail = email;

    document.getElementById('connRecStoreName').textContent = info.storeName;
    document.getElementById('connRecCode').textContent = info.code;

    if (info.hasPassword) {
      document.getElementById('connRecPassword').textContent = '••••••••';
      document.getElementById('connRecPassword').style.color = '#666';
    } else {
      document.getElementById('connRecPassword').textContent = t('connection.noPassword');
      document.getElementById('connRecPassword').style.color = '#666';
    }

    status.textContent = '';
    connRecShowStep(2);
  } catch (e) {
    status.innerHTML = `<span class="text-danger">${t('common.error')}: ${e.message}</span>`;
  }

  document.getElementById('connRecLookupBtn').disabled = false;
}

function connRecBackToStep1() {
  connRecShowStep(1);
}

function connRecShowResetForm() {
  document.getElementById('connRecNewPass').value = '';
  document.getElementById('connRecConfirmPass').value = '';
  document.getElementById('connRecResetStatus').textContent = '';
  connRecShowStep(3);
}

function connRecBackToStep2() {
  connRecShowStep(2);
}

async function connRecDoReset() {
  const newPass = document.getElementById('connRecNewPass').value;
  const confirm = document.getElementById('connRecConfirmPass').value;
  const status = document.getElementById('connRecResetStatus');

  if (!newPass || newPass.length < 4) {
    status.innerHTML = `<span class="text-danger">${t('settings.passwordMinLength')}</span>`;
    return;
  }
  if (newPass !== confirm) {
    status.innerHTML = `<span class="text-danger">${t('settings.passwordsNoMatch')}</span>`;
    return;
  }

  status.innerHTML = `<span class="text-muted">${t('connection.savingPassword')}</span>`;
  document.getElementById('connRecResetBtn').disabled = true;

  try {
    await Auth.resetPasswordByEmail(_connRecEmail, newPass);
    localStorage.setItem('zmt_store_password', newPass);
    const { hash, salt } = await Auth.hashPassword(newPass);
    localStorage.setItem('zmt_local_pass', JSON.stringify({ code: Auth.getUserCode(), hash, salt }));

    status.innerHTML = `<span style="color:#28a745;">${t('settings.passwordSaved')}</span>`;

    document.getElementById('connRecPassword').textContent = newPass;
    document.getElementById('connRecPassword').style.color = '#28a745';

    setTimeout(() => connRecShowStep(2), 1500);
  } catch (e) {
    status.innerHTML = `<span class="text-danger">${t('common.error')}: ${e.message}</span>`;
  }

  document.getElementById('connRecResetBtn').disabled = false;
}

// ===== RESTAURANT («المطعم») =====
let _restPermEdits = {};

function setupRestaurant() {
  if (!window.RestService) return;
  const cfg = RestService.getConfig();
  const enable = document.getElementById('restEnable');
  if (enable) enable.checked = !!cfg.enabled;
  const roleEl = document.querySelector('input[name="restRole"][value="' + cfg.role + '"]');
  if (roleEl) roleEl.checked = true;
  const nameEl = document.getElementById('restName');
  if (nameEl) nameEl.value = cfg.myName || '';
  if (!window._restWired) {
    window._restWired = true;
    window.addEventListener('rest:peers', () => { restRefreshStatus(); restRenderPerms(); });
    window.addEventListener('rest:perms', () => restRenderPerms());
    window.addEventListener('rest:config', () => restRefreshUI());
  }
  restRenderTables();
  restLoadPrinters();
  restRefreshStatus();
  restRefreshUI();
}

function restRefreshUI() {
  if (!window.RestService) return;
  const cfg = RestService.getConfig();
  const show = cfg.enabled;
  const role = cfg.role;
  const sections = ['restRoleSection', 'restIdentitySection', 'restTablesSection', 'restPrinterSection'];
  sections.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; });
  const hint = document.getElementById('restRoleHint');
  if (hint) {
    hint.textContent = role === 'send' ? t('rest.pageSub') : role === 'receive' ? t('rest.pageSub') : t('rest.roleNoneHint');
  }
  const perms = document.getElementById('restPermsSection');
  if (perms) perms.style.display = (show && RestService.isManagerUser()) ? '' : 'none';
  const result = document.getElementById('restToggleResult');
  if (result) result.innerHTML = `<span class="text-muted">${show ? t('rest.enabled') : t('rest.disabled')}</span>`;
  restRefreshStatus();
  restRenderPerms();
}

function restToggleEnable() {
  if (!window.RestService) return;
  const box = document.getElementById('restEnable');
  const enabled = !!box.checked;
  const res = RestService.setConfig({ enabled });
  const result = document.getElementById('restToggleResult');
  if (result) {
    setTimeout(() => { result.innerHTML = `<span class="text-muted">${enabled ? t('rest.enabled') : t('rest.disabled')}</span>`; }, 60);
  }
  restRefreshUI();
}

function restApplyRole() {
  if (!window.RestService) return;
  const el = document.querySelector('input[name="restRole"]:checked');
  const role = el ? el.value : 'none';
  RestService.setConfig({ role });
  const nameEl = document.getElementById('restName');
  if (role === 'send' && nameEl && !nameEl.value) nameEl.value = RestService.getConfig().myName;
  restRefreshUI();
}

function restSaveName() {
  if (!window.RestService) return;
  const nameEl = document.getElementById('restName');
  if (!nameEl) return;
  RestService.setConfig({ name: nameEl.value });
}

function restAddTable() {
  if (!window.RestService) return;
  const inp = document.getElementById('restNewTable');
  const v = inp ? inp.value.trim() : '';
  if (!v) return;
  const cur = RestService.getConfig().tables;
  if (cur.indexOf(v) === -1) cur.push(v);
  RestService.setConfig({ tables: cur });
  restRenderTables();
  if (inp) inp.value = '';
}

function restRemoveTable(x) {
  if (!window.RestService) return;
  const cur = RestService.getConfig().tables.filter(t => t !== x);
  RestService.setConfig({ tables: cur });
  restRenderTables();
}

function restRenderTables() {
  if (!window.RestService) return;
  const list = document.getElementById('restTablesList');
  if (!list) return;
  const tables = RestService.getConfig().tables;
  list.innerHTML = tables.map(x2 =>
    `<span class="rest-table-chip">${escHtml(x2)} <button type="button" class="rest-table-x" onclick="restRemoveTable(${JSON.stringify(x2).replace(/"/g, '&quot;')})"><i class="fas fa-times"></i></button></span>`
  ).join('');
}

function restLoadPrinters() {
  const sel = document.getElementById('restPrinter');
  if (!sel || !window.RestService) return;
  sel.innerHTML = `<option value="">${t('rest.printerDefault')}</option>`;
  if (typeof RestService.listPrinters !== 'function') return;
  RestService.listPrinters().then(list => {
    const cur = RestService.getConfig().kitchenPrinter;
    (list || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = (p.displayName || p.name) + (p.isDefault ? ' ✓' : '');
      sel.appendChild(opt);
    });
    sel.value = cur || '';
    if (!sel.value && list && list.length) {
      const def = list.find(p => p.isDefault);
      if (def) sel.value = def.name;
    }
  }).catch(() => {});
}

function restSavePrinter() {
  if (!window.RestService) return;
  const sel = document.getElementById('restPrinter');
  if (!sel) return;
  RestService.setConfig({ kitchenPrinter: sel.value });
}

function restRefreshStatus() {
  const strip = document.getElementById('restStatusStrip');
  if (!strip || !window.RestService) { if (strip) strip.style.display = 'none'; return; }
  if (!RestService.getConfig().enabled) { strip.style.display = 'none'; return; }
  strip.style.display = '';
  const icon = document.getElementById('restStatusIcon');
  const title = document.getElementById('restStatusTitle');
  const peers = document.getElementById('restStatusPeers');
  const cfg = RestService.getConfig();
  const recv = RestService.receiverPeers ? RestService.receiverPeers().length : 0;
  const send = (RestService.peersList && RestService.peersList('send') || []).length;
  if (icon) icon.innerHTML = `<i class="fas fa-circle" style="color:#28a745;"></i>`;
  if (title) {
    const roleTxt = cfg.role === 'send' ? t('rest.roleSend') : cfg.role === 'receive' ? t('rest.roleReceive') : t('rest.roleNone');
    title.textContent = cfg.enabled ? `● ${RestService.me().name} — ${roleTxt}` : t('rest.disabled');
  }
  if (peers) peers.textContent = `${send} ${t('rest.roleSend').split('—')[0].trim()} / ${recv} ${t('rest.roleReceive').split('—')[0].trim()}`;
}

function restRoleLabel(role) {
  return role === 'send' ? t('rest.roleSend') : role === 'receive' ? t('rest.roleReceive') : t('rest.roleNone');
}

function restRenderPerms() {
  const grid = document.getElementById('restPermsGrid');
  if (!grid || !window.RestService) return;
  const cfg = RestService.getConfig();
  if (!cfg.enabled || !RestService.isManagerUser()) { grid.innerHTML = ''; return; }
  const rows = [];
  const mine = { id: cfg.myId, name: cfg.myName, role: cfg.role, self: true };
  rows.push(mine);
  (RestService.peersList && RestService.peersList() || []).forEach(p => { if (String(p.id) !== cfg.myId) rows.push({ id: p.id, name: p.name, role: p.role }); });
  const edit = _restPermEdits;
  grid.innerHTML = `
    <table class="rest-perm-table">
      <thead><tr>
        <th>${t('rest.deviceCol')}</th>
        <th>${t('rest.nameCol')}</th>
        <th>${t('rest.roleCol')}</th>
        <th>${t('rest.permSend')}</th>
        <th>${t('rest.permControl')}</th>
        <th>${t('rest.permConfirm')}</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => {
          // the self row shows what actually applies to self-addressed orders
          const cur = r.self && RestService.permsForOrder
            ? Object.assign({}, RestService.permsForOrder({ from: { id: cfg.myId }, to: cfg.myId }))
            : Object.assign({}, RestService.permsFor(r.id));
          const ov = edit[r.id] || {};
          const vis = {};
          ['send', 'control', 'confirm'].forEach(k => { vis[k] = k in ov ? !!ov[k] : cur[k]; });
          return `<tr ${r.self ? 'class="rest-perm-self"' : ''}>
            <td class="rest-perm-id mono">${escHtml(String(r.id).slice(-6))}</td>
            <td>${escHtml(r.name || '')}${r.self ? ' <small>(' + t('rest.myDevice') + ')</small>' : ''}</td>
            <td>${escHtml(restRoleLabel(r.role))}</td>
            <td><input type="checkbox" data-dev="${escAttr(r.id)}" data-perm="send" ${vis.send ? 'checked' : ''}></td>
            <td><input type="checkbox" data-dev="${escAttr(r.id)}" data-perm="control" ${vis.control ? 'checked' : ''}></td>
            <td><input type="checkbox" data-dev="${escAttr(r.id)}" data-perm="confirm" ${vis.confirm ? 'checked' : ''}></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const dev = cb.getAttribute('data-dev');
      const perm = cb.getAttribute('data-perm');
      if (!edit[dev]) edit[dev] = {};
      edit[dev][perm] = cb.checked;
    });
  });
}

function restSavePerms() {
  if (!window.RestService) return;
  const result = document.getElementById('restPermsResult');
  const edit = _restPermEdits;
  for (const dev of Object.keys(edit)) {
    RestService.savePermsById(dev, edit[dev]);
  }
  _restPermEdits = {};
  RestService.storePerms();
  restRenderPerms();
  if (result) result.innerHTML = `<span style="color:#28a745;">${t('rest.permSaved')}</span>`;
  setTimeout(() => { if (result) result.innerHTML = ''; }, 2600);
}


// ============================================================
// PRICE DISPLAY (شاشة عرض السعر) — settings tab
// ============================================================
const PD_STORE_KEY = 'zmt_pd_settings';

function pdDefaults() {
  return {
    enabled: false,
    videos: [],
    logoPath: '',
    bg: '#0b1220',
    priceColor: '#ffd400',
    nameColor: '#ffffff',
    nameSize: 64,
    priceSize: 160,
    fontFamily: 'Segoe UI, Tahoma, sans-serif',
    tickerOn: true,
    tickerPhone: '07.72.36.36.29',
    tickerMail: 'zmtsouftware@gmail.com',
    autoLogin: { enabled: false, code: '', username: '', password: '' },
    lockPin: ''
  };
}

function pdLoad() {
  let raw = '';
  try { raw = localStorage.getItem(PD_STORE_KEY) || ''; } catch (e) { raw = ''; }
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
  const d = pdDefaults();
  if (parsed && typeof parsed === 'object') {
    Object.keys(d).forEach(function (k) {
      if (typeof parsed[k] !== 'undefined' && typeof parsed[k] === typeof d[k]) d[k] = parsed[k];
    });
    if (!d.autoLogin || typeof d.autoLogin !== 'object') d.autoLogin = pdDefaults().autoLogin;
  }
  return d;
}

function pdSave(cfg) {
  try { localStorage.setItem(PD_STORE_KEY, JSON.stringify(cfg)); } catch (e) {}
}

function pdResult(id, msg, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<span style="color:' + (ok ? '#28a745' : '#dc2545') + ';">' + escHtml(msg) + '</span>';
  clearTimeout(el._pdT);
  el._pdT = setTimeout(function () { el.innerHTML = ''; }, 2600);
}

function pdFileUrl(p) {
  if (!p) return '';
  let s2 = String(p).replace(/\\/g, '/');
  if (!/^https?:|^file:|^data:/i.test(s2)) {
    if (!/^\//.test(s2)) s2 = '/' + s2;
    s2 = 'file://' + s2;
  }
  try { return encodeURI(s2); } catch (e) { return s2; }
}

// ---- init --------------------------------------------------------
function pdInit() {
  const cfg = pdLoad();

  const en = document.getElementById('pdEnable');
  if (en) en.checked = !!cfg.enabled;

  const bg = document.getElementById('pdBg');
  const pc = document.getElementById('pdPriceColor');
  const nc = document.getElementById('pdNameColor');
  const ns = document.getElementById('pdNameSize');
  const ps = document.getElementById('pdPriceSize');
  const fn = document.getElementById('pdFont');
  if (bg) bg.value = cfg.bg || '#0b1220';
  if (pc) pc.value = cfg.priceColor || '#ffd400';
  if (nc) nc.value = cfg.nameColor || '#ffffff';
  if (ns) { ns.value = cfg.nameSize || 64; const l = document.getElementById('pdNameSizeVal'); if (l) l.textContent = ns.value; }
  if (ps) { ps.value = cfg.priceSize || 160; const l = document.getElementById('pdPriceSizeVal'); if (l) l.textContent = ps.value; }
  if (fn) fn.value = cfg.fontFamily || 'Segoe UI, Tahoma, sans-serif';

  const tk = document.getElementById('pdTickerOn');
  const tp = document.getElementById('pdTickerPhone');
  const tm = document.getElementById('pdTickerMail');
  if (tk) tk.checked = cfg.tickerOn !== false;
  if (tp) tp.value = cfg.tickerPhone || '07.72.36.36.29';
  if (tm) tm.value = cfg.tickerMail || 'zmtsouftware@gmail.com';

  const pin = document.getElementById('pdPin');
  if (pin) pin.value = '';

  pdRenderVideos(cfg);
  pdRenderLogo(cfg);
  pdFillAccounts(cfg);
  pdLoadAutoStart();
}

// ---- enable ------------------------------------------------------
function pdSaveEnable() {
  const cfg = pdLoad();
  const en = document.getElementById('pdEnable');
  cfg.enabled = !!(en && en.checked);
  pdSave(cfg);
  pdResult('pdEnableResult', cfg.enabled ? (t('pd.enabled') || 'تم التفعيل') : (t('pd.disabled') || 'تم التعطيل'), true);
}

// ---- videos ------------------------------------------------------
function pdRenderVideos(cfg) {
  const list = document.getElementById('pdVideoList');
  const empty = document.getElementById('pdVideoEmpty');
  if (!list) return;
  const vids = cfg.videos || [];
  if (empty) empty.style.display = vids.length ? 'none' : '';
  list.innerHTML = vids.map(function (v, i) {
    const name = v.name || String(v.path || '').split(/[\\/]/).pop();
    return '<div class="pd-vid-row">' +
      '<span class="pd-vid-idx">' + (i + 1) + '</span>' +
      '<span class="pd-vid-name" title="' + escAttr(v.path || '') + '">' + escHtml(name) + '</span>' +
      '<button class="pd-icon-btn" type="button" title="↑" onclick="pdMoveVideo(' + i + ',-1)" ' + (i === 0 ? 'disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
      '<button class="pd-icon-btn" type="button" title="↓" onclick="pdMoveVideo(' + i + ',1)" ' + (i === vids.length - 1 ? 'disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
      '<button class="pd-icon-btn danger" type="button" title="X" onclick="pdRemoveVideo(' + i + ')"><i class="fas fa-trash"></i></button>' +
      '</div>';
  }).join('');
}

async function pdAddVideo() {
  const api = window.electronAPI;
  if (!api || !api.openFile) { pdResult('pdVideoResult', t('common.error') || 'خطأ', false); return; }
  const res = await api.openFile({
    title: 'Select videos',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v', 'wmv', 'mpg', 'mpeg'] }]
  });
  if (!res || res.canceled || !res.filePaths || !res.filePaths.length) return;
  const out = document.getElementById('pdVideoResult');
  if (out) out.innerHTML = '<span class="text-muted">' + (t('connection.uploading') || '...') + '</span>';
  const cfg = pdLoad();
  cfg.videos = Array.isArray(cfg.videos) ? cfg.videos : [];
  for (const p of res.filePaths) {
    const base = String(p).split(/[\\/]/).pop();
    if (cfg.videos.some(function (v) { return v.path === p; })) continue;
    if (api.pdImportMedia) {
      const r = await api.pdImportMedia(p, 'video');
      if (r && r.success && r.path) cfg.videos.push({ id: 'v' + Date.now() + Math.random().toString(36).slice(2, 7), name: base, path: r.path });
      else cfg.videos.push({ id: 'v' + Date.now() + Math.random().toString(36).slice(2, 7), name: base, path: p });
    } else {
      cfg.videos.push({ id: 'v' + Date.now() + Math.random().toString(36).slice(2, 7), name: base, path: p });
    }
  }
  pdSave(cfg);
  pdRenderVideos(cfg);
  pdResult('pdVideoResult', t('pd.videoAdded') || 'تمت الإضافة', true);
}

function pdRemoveVideo(i) {
  const cfg = pdLoad();
  if (!Array.isArray(cfg.videos)) cfg.videos = [];
  const removed = cfg.videos.splice(i, 1)[0];
  pdSave(cfg);
  pdRenderVideos(cfg);
  if (removed && removed.path && window.electronAPI && window.electronAPI.pdRemoveMedia) {
    try { window.electronAPI.pdRemoveMedia(removed.path); } catch (e) {}
  }
}

function pdMoveVideo(i, dir) {
  const cfg = pdLoad();
  if (!Array.isArray(cfg.videos)) cfg.videos = [];
  const j = i + dir;
  if (j < 0 || j >= cfg.videos.length) return;
  const tmp = cfg.videos[i];
  cfg.videos[i] = cfg.videos[j];
  cfg.videos[j] = tmp;
  pdSave(cfg);
  pdRenderVideos(cfg);
}

// ---- logo --------------------------------------------------------
function pdRenderLogo(cfg) {
  const box = document.getElementById('pdLogoBox');
  const clr = document.getElementById('pdLogoClearBtn');
  if (!box) return;
  if (cfg.logoPath) {
    box.innerHTML = '<img src="' + escAttr(pdFileUrl(cfg.logoPath)) + '" alt="">';
    if (clr) clr.style.display = '';
  } else {
    box.innerHTML = '<i class="fas fa-image"></i>';
    if (clr) clr.style.display = 'none';
  }
}

async function pdPickLogo() {
  const api = window.electronAPI;
  if (!api || !api.openFile) { pdResult('pdLogoResult', t('common.error') || 'خطأ', false); return; }
  const res = await api.openFile({
    title: 'Select logo',
    properties: ['openFile'],
    filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }]
  });
  if (!res || res.canceled || !res.filePaths || !res.filePaths.length) return;
  const src = res.filePaths[0];
  let dest = src;
  if (api.pdImportMedia) {
    const r = await api.pdImportMedia(src, 'image');
    if (r && r.success && r.path) dest = r.path;
  }
  const cfg = pdLoad();
  cfg.logoPath = dest;
  pdSave(cfg);
  pdRenderLogo(cfg);
  pdResult('pdLogoResult', t('pd.logoSaved') || 'تم حفظ اللوغو', true);
}

function pdClearLogo() {
  const cfg = pdLoad();
  const old = cfg.logoPath;
  cfg.logoPath = '';
  pdSave(cfg);
  pdRenderLogo(cfg);
  if (old && window.electronAPI && window.electronAPI.pdRemoveMedia) {
    try { window.electronAPI.pdRemoveMedia(old); } catch (e) {}
  }
}

// ---- look (colors / sizes / font) -------------------------------
function pdSaveLook() {
  const cfg = pdLoad();
  const bg = document.getElementById('pdBg');
  const pc = document.getElementById('pdPriceColor');
  const nc = document.getElementById('pdNameColor');
  const ns = document.getElementById('pdNameSize');
  const ps = document.getElementById('pdPriceSize');
  const fn = document.getElementById('pdFont');
  if (bg) cfg.bg = bg.value;
  if (pc) cfg.priceColor = pc.value;
  if (nc) cfg.nameColor = nc.value;
  if (ns) { cfg.nameSize = parseInt(ns.value, 10) || 64; const l = document.getElementById('pdNameSizeVal'); if (l) l.textContent = ns.value; }
  if (ps) { cfg.priceSize = parseInt(ps.value, 10) || 160; const l = document.getElementById('pdPriceSizeVal'); if (l) l.textContent = ps.value; }
  if (fn) cfg.fontFamily = fn.value;
  pdSave(cfg);
}

// ---- ticker ------------------------------------------------------
function pdSaveTicker() {
  const cfg = pdLoad();
  const tk = document.getElementById('pdTickerOn');
  const tp = document.getElementById('pdTickerPhone');
  const tm = document.getElementById('pdTickerMail');
  if (tk) cfg.tickerOn = !!tk.checked;
  if (tp) cfg.tickerPhone = tp.value.trim();
  if (tm) cfg.tickerMail = tm.value.trim();
  pdSave(cfg);
}

// ---- auto login --------------------------------------------------
function pdFillAccounts(cfg) {
  const sel = document.getElementById('pdAutoUser');
  if (!sel) return;
  let users = [];
  try { users = (typeof Auth !== 'undefined' && Auth.listUsers) ? (Auth.listUsers() || []) : []; } catch (e) { users = []; }
  const al = (cfg && cfg.autoLogin) || { enabled: false, code: '', username: '', password: '' };
  const cur = (function () { try { return Auth.getCurrentUser(); } catch (e) { return null; } })();
  const storeCode = al.code || (cur && cur.code) || localStorage.getItem('zmt_store_code') || '';

  let html = '<option value="">' + escHtml(t('pd.noAccount') || '— اختر حسابًا —') + '</option>';
  users.forEach(function (u) {
    if (!u || !u.username) return;
    const v = u.username + '@@' + storeCode;
    html += '<option value="' + escAttr(v) + '">' + escHtml(u.username) + '</option>';
  });
  sel.innerHTML = html;

  const match = al.username && storeCode ? (al.username + '@@' + storeCode) : '';
  if (match && Array.prototype.some.call(sel.options, function (o) { return o.value === match; })) sel.value = match;

  const box = document.getElementById('pdAutoLogin');
  if (box) box.checked = !!al.enabled;
  const pw = document.getElementById('pdAutoPass');
  if (pw) pw.value = al.password || '';
}

function pdSaveAutoLogin() {
  const cfg = pdLoad();
  const box = document.getElementById('pdAutoLogin');
  const sel = document.getElementById('pdAutoUser');
  const pw = document.getElementById('pdAutoPass');
  const res = document.getElementById('pdAutoLoginResult');

  const enabled = !!(box && box.checked);
  const raw = sel ? sel.value : '';
  const parts = raw ? raw.split('@@') : [];
  const username = parts[0] || '';
  const code = parts[1] || localStorage.getItem('zmt_store_code') || '';
  const password = pw ? pw.value : '';

  if (enabled && (!username || !password)) {
    if (res) res.innerHTML = '<span style="color:#dc2545;">' + escHtml(t('pd.autoLoginNeed') || 'اختر الحساب وأدخل كلمة المرور') + '</span>';
    if (box) box.checked = false;
    cfg.autoLogin = { enabled: false, code: '', username: '', password: '' };
    pdSave(cfg);
    return;
  }

  cfg.autoLogin = { enabled: enabled, code: code, username: username, password: password };
  pdSave(cfg);
  if (enabled && !cfg.lockPin) {
    const msg = t('pd.autoLoginOn') || 'تم التفعيل';
    pdResult('pdAutoLoginResult', msg, true);
  } else {
    pdResult('pdAutoLoginResult', enabled ? (t('pd.enabled') || 'تم التفعيل') : (t('pd.disabled') || 'تم التعطيل'), true);
  }
}

// ---- auto start (Windows) ---------------------------------------
function pdLoadAutoStart() {
  const box = document.getElementById('pdAutoStart');
  if (!box) return;
  const api = window.electronAPI;
  if (!api || !api.autoLaunchGet) { box.disabled = true; return; }
  api.autoLaunchGet().then(function (r) {
    box.checked = !!(r && r.enabled);
  }).catch(function () { box.disabled = true; });
}

async function pdSaveAutoStart() {
  const box = document.getElementById('pdAutoStart');
  const res = document.getElementById('pdAutoStartResult');
  const api = window.electronAPI;
  if (!box || !api || !api.autoLaunchSet) return;
  if (res) res.innerHTML = '<span class="text-muted">...</span>';
  try {
    const r = await api.autoLaunchSet(!!box.checked);
    if (r && r.success) pdResult('pdAutoStartResult', t('pd.saved') || 'تم الحفظ', true);
    else pdResult('pdAutoStartResult', (r && r.error) || 'Error', false);
  } catch (e) {
    pdResult('pdAutoStartResult', (e && e.message) || 'Error', false);
  }
}

// ---- lock pin ----------------------------------------------------
function pdSavePin() {
  const cfg = pdLoad();
  const inp = document.getElementById('pdPin');
  const val = inp ? inp.value.trim() : '';
  if (val && val.length < 3) { pdResult('pdPinResult', t('pd.pinShort') || '3 خانات على الأقل', false); return; }
  cfg.lockPin = val;
  pdSave(cfg);
  if (inp) inp.value = '';
  pdResult('pdPinResult', t('pd.saved') || 'تم الحفظ', true);
}

// ============================================================
// CASH DRAWER («درج النقود») — managers only
// Settings live in userData/cash-drawer.json via the preload bridge; the
// renderer never touches the file directly. The tab is hidden for non-managers
// exactly like the other privileged controls in this page.
// ============================================================

let _drawerCfg = null;        // last loaded config
let _drawerTargets = [];      // last scan results
let _drawerScanMeta = null;   // { targets, powerShell, pulsePresets }

// Fallback preset list used when the scan has not run yet, so the pulse <select>
// is never empty (main.js keeps the authoritative copy).
const DRAWER_PULSE_FALLBACK = [
  { id: 'kick-a', label: 'ESC p 0 25 250', hex: '1B 70 00 19 FA' },
  { id: 'kick-b', label: 'ESC p 0 25 0', hex: '1B 70 00 19 00' },
  { id: 'kick-c', label: 'ESC p 1 25 250', hex: '1B 70 01 19 FA' },
  { id: 'init-kick', label: 'ESC @ + kick', hex: '1B 40 1B 70 00 19 FA' },
  { id: 'bell', label: 'Bell (pin 5 line)', hex: '07 1B 70 00 19 FA' },
];

function drawerApi() {
  return (window.electronAPI && window.electronAPI.cashDrawerGet) ? window.electronAPI : null;
}

// Managers only: hide the tab button (and its panel) for everyone else.
function drawerApplyRole() {
  const btn = document.getElementById('connTabDrawerBtn');
  const isMgr = (typeof Auth !== 'undefined' && Auth && typeof Auth.isManager === 'function') ? !!Auth.isManager() : false;
  if (btn) btn.style.display = isMgr ? '' : 'none';
  if (!isMgr) {
    const panel = document.getElementById('connTabDrawer');
    if (panel) panel.classList.remove('active');
    const active = document.querySelector('.conn-tab.active');
    if (active && active.getAttribute('data-tab') === 'drawer') connSwitchTab('setup');
  }
  return isMgr;
}

// Called once from init_connection() — wires role visibility + first load.
function setupCashDrawer() {
  drawerApplyRole();
  const api = drawerApi();
  if (!api) return;                       // browser / phone build: silently off
  drawerFillPulseOptions(DRAWER_PULSE_FALLBACK);
  if (drawerApplyRole()) drawerInit();
}

// Called every time the tab is opened.
async function drawerInit() {
  if (!drawerApplyRole()) return;
  const api = drawerApi();
  if (!api) return;
  const res = await api.cashDrawerGet();
  if (res && res.success && res.data) {
    _drawerCfg = res.data;
    drawerRenderConfig(_drawerCfg);
  }
  drawerRenderStatus();
}

function drawerRenderConfig(cfg) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const chk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

  chk('drawerEnabled', cfg.enabled);
  chk('drawerFallback', cfg.fallbackPrint);
  set('drawerTransport', cfg.transport || 'auto');
  set('drawerComPort', cfg.comPort || '');
  set('drawerHost', cfg.host || '');
  set('drawerPort', cfg.port || 9100);
  set('drawerPrinterName', cfg.printerName || '');
  set('drawerRawUsb', cfg.rawUsbPort || '');
  set('drawerTimeout', cfg.timeoutMs || 4000);
  set('drawerCustomHex', cfg.customHex || '');

  drawerFillPulseOptions(_drawerScanMeta && _drawerScanMeta.pulsePresets ? _drawerScanMeta.pulsePresets : DRAWER_PULSE_FALLBACK);
  const pulseSel = document.getElementById('drawerPulse');
  if (pulseSel) pulseSel.value = cfg.pulseId || 'kick-a';

  drawerOnTransportChange();
}

function drawerFillPulseOptions(list) {
  const sel = document.getElementById('drawerPulse');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = (list || []).map(p =>
    '<option value="' + escAttr(p.id) + '">' + escHtml(p.label) + '  (' + escHtml(p.hex) + ')</option>'
  ).join('');
  if (cur) sel.value = cur;
}

// Show only the fields that match the selected transport (auto shows all).
function drawerOnTransportChange() {
  const t = (document.getElementById('drawerTransport') || {}).value || 'auto';
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  show('drawerComField', t === 'auto' || t === 'com' || t === 'raw-com');
  show('drawerHostField', t === 'auto' || t === 'net');
  show('drawerPortField', t === 'auto' || t === 'net');
  show('drawerPrinterField', t === 'auto' || t === 'win');
  show('drawerRawUsbField', t === 'auto' || t === 'raw-usb');
}

// Collect the current form into a config patch.
function drawerReadForm() {
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const chk = (id) => { const el = document.getElementById(id); return el ? !!el.checked : false; };
  return {
    enabled: chk('drawerEnabled'),
    fallbackPrint: chk('drawerFallback'),
    transport: val('drawerTransport') || 'auto',
    comPort: String(val('drawerComPort') || '').trim(),
    host: String(val('drawerHost') || '').trim(),
    port: parseInt(val('drawerPort'), 10) || 9100,
    printerName: String(val('drawerPrinterName') || '').trim(),
    rawUsbPort: String(val('drawerRawUsb') || '').trim(),
    timeoutMs: parseInt(val('drawerTimeout'), 10) || 4000,
    pulseId: val('drawerPulse') || 'kick-a',
    customHex: String(val('drawerCustomHex') || '').trim(),
  };
}

async function drawerSaveConfig(silent) {
  const api = drawerApi();
  if (!api) return null;
  const patch = drawerReadForm();
  const res = await api.cashDrawerSave(patch);
  if (res && res.success && res.data) {
    _drawerCfg = res.data;
    if (!silent) drawerResult('drawerEnableResult', t('drawer.saved') || 'تم الحفظ', true);
  }
  drawerRenderStatus();
  return res;
}

function drawerToggleEnabled() {
  const on = !!((document.getElementById('drawerEnabled') || {}).checked);
  drawerSaveConfig(true).then(() => {
    drawerResult('drawerEnableResult',
      on ? (t('drawer.enabled') || 'تم تفعيل الفتح التلقائي بعد البيع')
         : (t('drawer.disabled') || 'تم تعطيل الفتح التلقائي'),
      true);
  });
}

function drawerResult(id, msg, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<span style="color:' + (ok ? '#28a745' : '#dc2545') + ';">' + escHtml(msg) + '</span>';
  clearTimeout(el._drT);
  el._drT = setTimeout(function () { el.innerHTML = ''; }, 4000);
}

// ---- Scan ----------------------------------------------------------------
async function drawerScan() {
  const api = drawerApi();
  if (!api) return;
  const out = document.getElementById('drawerScanResult');
  if (out) out.innerHTML = '<span class="text-muted">' + (t('drawer.scanning') || 'جارٍ المسح…') + '</span>';
  const res = await api.cashDrawerScan();
  if (!res || !res.success || !res.data) {
    drawerResult('drawerScanResult', (t('drawer.scanFail') || 'فشل المسح') + ': ' + ((res && res.error) || ''), false);
    return;
  }
  _drawerScanMeta = res.data;
  _drawerTargets = res.data.targets || [];
  drawerRenderTargets(_drawerTargets);
  drawerRenderPsInfo(res.data.powerShell);
  drawerResult('drawerScanResult',
    (t('drawer.scanDone') || 'اكتمل المسح') + ': ' + _drawerTargets.length + ' ' + (t('drawer.targetsCount') || 'هدف'), true);
}

function drawerRenderPsInfo(ps) {
  const el = document.getElementById('drawerPsInfo');
  if (!el || !ps) return;
  const ver = ps.version || '?';
  const note = ps.hasGetPrinter ? '' : ' (' + (t('drawer.wmiFallback') || 'وضع التوافق: Win32_Printer') + ')';
  el.textContent = 'PowerShell ' + ver + note;
}

function drawerRenderTargets(targets) {
  const box = document.getElementById('drawerTargetsList');
  if (!box) return;
  if (!targets || !targets.length) {
    box.innerHTML = '<div class="conn-info-text">' + (t('drawer.noTargets') || 'لم يُعثر على أي منفذ أو طابعة.') + '</div>';
    return;
  }
  const badge = (t, kind, isRaw) => {
    if (isRaw) {
      return '<span style="display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;color:#fff;background:#e67e22;">'
        + escHtml(t('drawer.rawMayWork') || 'قد ينجح') + '</span>';
    }
    const color = kind === 'yes' ? '#28a745' : (kind === 'maybe' ? '#e6a817' : (kind === 'no' ? '#dc2545' : '#8899aa'));
    const label = kind === 'yes' ? (t('drawer.escposYes') || 'مدعوم')
      : kind === 'maybe' ? (t('drawer.escposMaybe') || 'يُرجّح')
      : kind === 'no' ? (t('drawer.escposNo') || 'غير مدعوم')
      : (t('drawer.escposUnknown') || 'غير معروف');
    return '<span style="display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;color:#fff;background:' + color + ';">' + escHtml(label) + '</span>';
  };
  box.innerHTML = targets.map((tg, i) => {
    return '<div class="conn-list-row" style="display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid var(--silver-200,#eef1f6);">'
      + '<input type="radio" name="drawerTarget" value="' + escAttr(tg.id) + '" onchange="drawerPickTarget(' + i + ')">'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(tg.label || tg.id) + '</div>'
      +   '<div class="conn-info-text" style="margin:0;">' + escHtml(tg.note || '') + '</div>'
      + '</div>'
      + badge(t, tg.escpos, /^raw-/.test(String(tg.kind)))
      + '</div>';
  }).join('');
}

// Selecting a scanned target fills the manual fields so the test uses it.
function drawerPickTarget(i) {
  const tg = _drawerTargets[i];
  if (!tg) return;
  if (tg.kind === 'com') {
    document.getElementById('drawerTransport').value = 'com';
    document.getElementById('drawerComPort').value = tg.port || '';
  } else if (tg.kind === 'raw-com') {
    document.getElementById('drawerTransport').value = 'raw-com';
    document.getElementById('drawerComPort').value = tg.comPort || tg.port || '';
  } else if (tg.kind === 'raw-usb') {
    document.getElementById('drawerTransport').value = 'raw-usb';
    document.getElementById('drawerRawUsb').value = tg.rawUsbPort || '';
    if (tg.printerName) document.getElementById('drawerPrinterName').value = tg.printerName;
  } else if (tg.kind === 'win') {
    document.getElementById('drawerTransport').value = 'win';
    document.getElementById('drawerPrinterName').value = tg.printerName || '';
  } else if (tg.kind === 'net') {
    document.getElementById('drawerTransport').value = 'net';
    document.getElementById('drawerHost').value = tg.host || '';
    if (tg.port) document.getElementById('drawerPort').value = tg.port;
  }
  drawerOnTransportChange();
  drawerSaveConfig(true);
}

async function drawerUseLastGood() {
  const cfg = _drawerCfg || {};
  if (!cfg.lastGood) { drawerResult('drawerScanResult', t('drawer.noLastGood') || 'لا يوجد مسار ناجح محفوظ بعد.', false); return; }
  const t2 = cfg.lastGood.transport;
  if (t2 === 'com') { document.getElementById('drawerTransport').value = 'com'; }
  else if (t2 === 'net') { document.getElementById('drawerTransport').value = 'net'; }
  else if (t2 === 'win') { document.getElementById('drawerTransport').value = 'win'; }
  else if (t2 === 'raw-usb') { document.getElementById('drawerTransport').value = 'raw-usb'; }
  else if (t2 === 'raw-com') { document.getElementById('drawerTransport').value = 'raw-com'; }
  if (cfg.lastGood.pulseId) { const ps = document.getElementById('drawerPulse'); if (ps) ps.value = cfg.lastGood.pulseId; }
  drawerOnTransportChange();
  await drawerSaveConfig(true);
  drawerResult('drawerScanResult', t('drawer.lastGoodRestored') || 'تم استرجاع آخر مسار ناجح.', true);
  drawerRenderStatus();
}

// ---- Test ---------------------------------------------------------------
let _drawerTesting = false;
async function drawerTest() {
  const api = drawerApi();
  if (!api || _drawerTesting) return;
  _drawerTesting = true;
  const btn = document.getElementById('drawerTestBtn');
  drawerResult('drawerTestResult', t('drawer.testing') || 'جارٍ الإرسال… جرّب الأوامر واحدًا واحدًا.', true);
  const attemptsBox = document.getElementById('drawerAttempts');
  if (attemptsBox) attemptsBox.innerHTML = '';

  const cfg = drawerReadForm();
  const res = await api.cashDrawerTest(cfg);
  _drawerTesting = false;

  const data = (res && res.data) || {};
  drawerRenderAttempts(data.attempts || []);

  if (res && res.success && data.opened) {
    // Persist the winning pulse so sales + F12 are a single fast shot.
    await api.cashDrawerSave({ lastGood: { transport: data.transport, pulseId: data.pulseId, hex: data.hex, at: Date.now() }, pulseId: data.pulseId });
    const r = await api.cashDrawerGet();
    if (r && r.success) { _drawerCfg = r.data; drawerRenderConfig(_drawerCfg); }
    drawerResult('drawerTestResult', t('drawer.opened') || 'تم إرسال أمر الفتح بنجاح — إن لم يُفتح الدرج فطابعتك لا تدعم النبضة.', true);
  } else {
    drawerResult('drawerTestResult', (res && res.errorAr) || (t('drawer.testFail') || 'فشل فتح الدرج.'), false);
  }
  drawerRenderStatus();
}

// Advanced: force ONLY the raw device-file path (raw-usb / raw-com), so a
// manager can test that specific route without the full auto loop. Best-effort
// by design — a refusal is reported plainly and is never fatal.
let _drawerTestingRaw = false;
async function drawerTestRaw() {
  const api = drawerApi();
  if (!api || _drawerTestingRaw) return;
  _drawerTestingRaw = true;
  drawerResult('drawerTestResult', t('drawer.testing') || 'جارٍ الإرسال… جرّب الأوامر واحدًا واحدًا.', true);
  const attemptsBox = document.getElementById('drawerAttempts');
  if (attemptsBox) attemptsBox.innerHTML = '';

  const cur = drawerReadForm();
  const wantUsb = /^USB\d+/i.test(String(cur.rawUsbPort || ''));
  const cfg = Object.assign({}, cur, { transport: wantUsb ? 'raw-usb' : 'raw-com' });

  const res = await api.cashDrawerTest(cfg);
  _drawerTestingRaw = false;

  const data = (res && res.data) || {};
  drawerRenderAttempts(data.attempts || []);

  if (res && res.success && data.opened) {
    await api.cashDrawerSave({ lastGood: { transport: data.transport, pulseId: data.pulseId, hex: data.hex, at: Date.now() }, pulseId: data.pulseId });
    const r = await api.cashDrawerGet();
    if (r && r.success) { _drawerCfg = r.data; drawerRenderConfig(_drawerCfg); }
    drawerResult('drawerTestResult', t('drawer.rawOk') || 'نجح المسار الخام — إن لم يُفتح الدرج فطابعتك لا تدعم النبضة.', true);
  } else {
    drawerResult('drawerTestResult', (res && res.errorAr) || (t('drawer.rawFail') || 'المسار الخام لم ينجح على هذا الجهاز — هذا متوقَّع.'), false);
  }
  drawerRenderStatus();
}

function drawerRenderAttempts(attempts) {
  const box = document.getElementById('drawerAttempts');
  if (!box) return;
  if (!attempts.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<table style="width:100%;font-size:12px;margin-top:8px;border-collapse:collapse;">'
    + '<thead><tr style="text-align:right;color:var(--silver-600,#667);">'
    + '<th>' + escHtml(t('drawer.colPulse') || 'الأمر') + '</th>'
    + '<th>' + escHtml(t('drawer.colTransport') || 'المسار') + '</th>'
    + '<th>' + escHtml(t('drawer.colTime') || 'الزمن') + '</th>'
    + '<th>' + escHtml(t('drawer.colResult') || 'النتيجة') + '</th></tr></thead><tbody>'
    + attempts.map(a => '<tr style="border-top:1px solid var(--silver-200,#eef1f6);">'
      + '<td style="padding:3px 4px;">' + escHtml(a.pulseLabel || a.pulseId || '') + '</td>'
      + '<td style="padding:3px 4px;">' + escHtml(a.transport || '') + '</td>'
      + '<td style="padding:3px 4px;">' + (a.elapsedMs || 0) + 'ms</td>'
      + '<td style="padding:3px 4px;color:' + (a.ok ? '#28a745' : '#dc2545') + ';">' + escHtml(a.ok ? (t('drawer.ok') || 'نجح') : (a.errorAr || a.error || '')) + '</td>'
      + '</tr>').join('')
    + '</tbody></table>';
}

// ---- Status strip --------------------------------------------------------
function drawerRenderStatus() {
  const cfg = _drawerCfg || {};
  const icon = document.getElementById('drawerStatusIcon');
  const title = document.getElementById('drawerStatusTitle');
  const sub = document.getElementById('drawerStatusSub');
  const good = cfg.lastGood;

  let cls = '', ico = 'fa-circle-notch fa-spin', ttl = t('drawer.statusIdle') || 'لم يُختبر بعد', subTxt = '';

  if (good && good.transport) {
    cls = 'ok'; ico = 'fa-check-circle';
    ttl = t('drawer.statusReady') || 'جاهز';
    const when = good.at ? new Date(good.at).toLocaleString() : '';
    subTxt = (t('drawer.statusVia') || 'المسار') + ': ' + good.transport + (good.pulseId ? ' · ' + good.pulseId : '') + (when ? ' · ' + when : '');
    if (/^raw-/.test(String(good.transport))) {
      subTxt += ' · ' + (t('drawer.rawWarn') || 'مسار غير مضمون — قد يتوقّف بعد إعادة التشغيل');
    }
  } else if (cfg.transport && cfg.transport !== 'auto') {
    subTxt = (t('drawer.statusSelected') || 'هدف محدَّد') + ': ' + cfg.transport;
  }
  if (!cfg.enabled) subTxt += (subTxt ? ' · ' : '') + (t('drawer.statusAutoOff') || 'الفتح التلقائي بعد البيع مُعطَّل');

  if (icon) {
    icon.className = 'phs-status-icon' + (cls ? ' ' + cls : '');
    icon.innerHTML = '<i class="fas ' + ico + '"></i>';
  }
  if (title) title.textContent = ttl;
  if (sub) sub.textContent = subTxt;
}
