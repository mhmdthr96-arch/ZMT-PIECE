// ============================================================
// ZMT Connection Settings Page
// ============================================================

let _connSelectedType = 'main';

function init_connection() {
  connLoadUserInfo();
  connLoadBranches();
  connUpdateLastSync();
  connLoadPushSettings();

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
  document.querySelector(`.conn-tab[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.conn-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('connTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
}

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

// ===== SYNC =====
async function connUploadBackup() {
  const btn = document.getElementById('connUploadBtn');
  const result = document.getElementById('connSyncResult');

  if (!CloudService.isCloudConnected()) {
    alert(t('connection.cloudRequired'));
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('connection.uploading')}`;
  result.textContent = '';

  try {
    const uploadResult = await CloudService.uploadBackup();
    if (uploadResult.skipped) {
      if (uploadResult.reason === 'no_data') {
        result.innerHTML = `<span class="text-warning">${t('backup.noDataToBackup') || 'لا توجد بيانات للرفع'}</span>`;
      } else if (uploadResult.reason === 'lan_sub') {
        result.innerHTML = `<span class="text-warning"><i class="fas fa-info-circle"></i> ${t('connection.lanSubUploadMsg') || 'هذا الجهاز فرعي (LAN): رفع البيانات للسحابة يتم من السيرفر الرئيسي لهذا الموقع'}</span>`;
      } else {
        result.innerHTML = `<span class="text-success">${t('connection.alreadySynced') || 'البيانات محدثة في السحابة'}</span>`;
      }
    } else {
      result.innerHTML = `<span class="text-success">${t('connection.uploadSuccess')}</span>`;
    }
  } catch (e) {
    result.innerHTML = `<span class="text-danger">${t('common.error')}: ${e.message}</span>`;
  }

  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> ${t('connection.uploadBackupBtn')}`;
  connUpdateLastSync();
}

async function connDownloadBackup() {
  const btn = document.getElementById('connDownloadBtn');
  const result = document.getElementById('connSyncResult');

  if (!CloudService.isCloudConnected()) {
    alert(t('connection.cloudRequired'));
    return;
  }

  const storedPass = Auth.getStorePassword();
  if (storedPass) {
    const input = prompt(t('connection.enterStorePassword'));
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
    await DB.importAll(merged);

    for (const [key, value] of Object.entries(backup.data)) {
      if (key.startsWith('zmt_') && !['zmt_db', 'zmt_customers', 'zmt_suppliers', 'zmt_payments', 'zmt_returns', 'zmt_transfers', 'zmt_discounts', 'zmt_orders'].includes(key)) {
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
  const secretEl = document.getElementById('connPushSecret');
  if (!urlEl || !secretEl) return;
  urlEl.value = localStorage.getItem('zmt_push_site_url') || '';
  secretEl.value = localStorage.getItem('zmt_push_secret') || '';
}

function connSavePushSettings() {
  const urlEl = document.getElementById('connPushSiteUrl');
  const secretEl = document.getElementById('connPushSecret');
  const result = document.getElementById('connPushResult');
  if (!urlEl || !secretEl || !result) return;

  const url = (urlEl.value || '').trim().replace(/\/+$/, '');
  const secret = (secretEl.value || '').trim();

  if (!url) {
    result.innerHTML = `<span class="text-danger">${t('connection.pushUrlRequired')}</span>`;
    return;
  }
  if (!/^https?:\/\/.+/.test(url)) {
    result.innerHTML = `<span class="text-danger">${t('connection.pushUrlInvalid')}</span>`;
    return;
  }
  if (!secret) {
    result.innerHTML = `<span class="text-danger">${t('connection.pushSecretRequired')}</span>`;
    return;
  }

  localStorage.setItem('zmt_push_site_url', url);
  localStorage.setItem('zmt_push_secret', secret);
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
  const storedPass = Auth.getStorePassword();
  if (storedPass) {
    const input = prompt(t('connection.enterStorePasswordView'));
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
    content.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${t('common.product')}</th>
            <th>${t('connection.barcode')}</th>
            <th>${t('connection.brand')}</th>
            <th>${t('common.qty')}</th>
            <th>${t('inventory.col5')}</th>
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
              <td>DA${(p.buyPrice || 0).toFixed(2)}</td>
              <td>DA${(p.sellPrice || 0).toFixed(2)}</td>
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
      document.getElementById('connRecPassword').textContent = info.password;
      document.getElementById('connRecPassword').style.color = '#dc3545';
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
