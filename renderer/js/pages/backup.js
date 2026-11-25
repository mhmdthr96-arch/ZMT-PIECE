// ===== RESTORE OPTION: store-code re-tag =====
// The 10-digit store code is stamped on every product/invoice/order as its
// `storeId`, and the UI only shows rows whose storeId matches the ACTIVE code.
// A backup made under another code restores its rows intact but invisible, so
// the restore dialog offers an explicit, OFF-by-default option to re-stamp the
// incoming rows to the current code. Nothing here changes the default restore
// behaviour; the option only takes effect when the user ticks it.
function _bkEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _backupCurrentStoreCode() {
  try {
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn() && Auth.getUserCode) {
      const c = Auth.getUserCode();
      if (c) return String(c);
    }
  } catch (e) {}
  try { return localStorage.getItem('zmt_store_code') || ''; } catch (e) { return ''; }
}

// Modal that shows the backup summary and the (optional) re-tag checkbox.
// Resolves with { confirmed, retag }. Cancelling/X/backdrop ⇒ confirmed:false.
function showRestoreDialog(backup, summary) {
  return new Promise((resolve) => {
    const prev = document.getElementById('restoreBackupModal');
    if (prev) prev.remove();
    const storeCode = _backupCurrentStoreCode();
    const s = summary || {};
    const counts = [
      [t('backup.products'), s.products || 0],
      [t('backup.invoices'), s.invoices || 0],
      [t('backup.customers'), s.customers || 0],
      [t('backup.suppliers'), s.suppliers || 0],
      [t('backup.payments'), s.payments || 0],
      [t('backup.returns'), s.returns || 0],
      [t('backup.discounts'), s.discounts || 0],
    ];
    const rowsHtml = counts.map(r =>
      `<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0"><span style="color:var(--silver-600)">${_bkEsc(r[0])}</span><strong>${_bkEsc(r[1])}</strong></div>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'restoreBackupModal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal" style="max-width:520px;width:95%">
        <div class="modal-header">
          <h3><i class="fas fa-upload"></i> ${t('backup.restoreTitle')}</h3>
          <button class="modal-close" id="restoreModalX">&times;</button>
        </div>
        <div class="modal-body">
          <div style="background:var(--silver-50);border:1px solid var(--silver-300);border-radius:8px;padding:10px 12px;font-size:13px">
            <div><span style="color:var(--silver-600)">${t('backup.store')}</span><strong>${_bkEsc(backup.storeName || t('backup.unknown'))}</strong></div>
            <div style="margin-top:4px"><span style="color:var(--silver-600)">${t('backup.date')}</span><strong>${_bkEsc(backup.createdAt ? new Date(backup.createdAt).toLocaleDateString('ar-EG-u-nu-latn') : '—')}</strong></div>
            <div style="margin-top:8px;border-top:1px dashed var(--silver-300);padding-top:8px">${rowsHtml}</div>
          </div>
          <div style="margin-top:10px;background:#fff3cd;color:#856404;border:1px solid #ffe69c;border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.6">
            <i class="fas fa-exclamation-triangle"></i> ${t('backup.dataWarning')}
          </div>
          <label style="display:flex;gap:10px;align-items:flex-start;margin-top:12px;padding:10px 12px;border:1px solid var(--silver-300);border-radius:8px;cursor:pointer">
            <input type="checkbox" id="restoreRetagChk" style="margin-top:3px;width:16px;height:16px;flex:none">
            <span>
              <strong style="font-size:13px">${t('backup.retagLabel')}</strong>
              <span style="display:block;color:var(--silver-600);font-size:11.5px;margin-top:3px;line-height:1.6">${t('backup.retagHint')}</span>
              <span style="display:block;color:#dc3545;font-size:11.5px;margin-top:3px;line-height:1.6">${t('backup.retagWarn')}</span>
              <span style="display:block;color:var(--silver-500);font-size:11px;margin-top:3px;direction:ltr;text-align:start">${t('backup.retagCurrent')} <strong>${_bkEsc(storeCode || '—')}</strong></span>
            </span>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn" id="restoreModalCancel">${t('common.cancel')}</button>
          <button class="btn btn-success" id="restoreModalOk"><i class="fas fa-check"></i> ${t('backup.restore')}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      try { modal.remove(); } catch (e) {}
      resolve(val);
    };
    const chk = document.getElementById('restoreRetagChk');
    const cancel = () => done({ confirmed: false, retag: false });
    document.getElementById('restoreModalCancel').onclick = cancel;
    document.getElementById('restoreModalX').onclick = cancel;
    modal.addEventListener('click', (e) => { if (e.target === modal) cancel(); });
    document.getElementById('restoreModalOk').onclick = () => done({ confirmed: true, retag: !!(chk && chk.checked) });
    const focusTarget = document.getElementById('restoreModalOk');
    if (focusTarget) { try { focusTarget.focus(); } catch (e) {} }
  });
}

function init_backup() {
  const btnExport = document.getElementById('btnBackupCreate');
  const btnImport = document.getElementById('btnBackupRestore');
  const btnDelete = document.getElementById('btnDeleteData');
  const btnMigration = document.getElementById('btnDataMigration');
  const listEl = document.getElementById('backupList');
  const statusEl = document.getElementById('backupStatus');

  loadBackupList();

  btnExport.addEventListener('click', createBackup);
  btnImport.addEventListener('click', restoreBackup);
  btnDelete.addEventListener('click', resetAllData);
  if (btnMigration) {
    btnMigration.addEventListener('click', () => openMigration());
    // Permission gate: hide «ترحيل البيانات» when the user may not view it.
    try {
      if (typeof Auth !== 'undefined' && typeof Auth.canView === 'function' &&
          typeof Auth.isLoggedIn === 'function' && Auth.isLoggedIn() &&
          !Auth.canView('data-migration')) btnMigration.style.display = 'none';
    } catch (e) {}
  }

  function getAllData() {
    const dbExport = DB.exportAll();
    const data = {};
    data.zmt_db = {
      products: dbExport.products,
      invoices: dbExport.invoices,
      orders: dbExport.orders,
      nextBarcode: dbExport.meta.nextBarcode || 100000,
      nextInvoiceCounter: dbExport.meta.nextInvoiceCounter || 0,
      nextPaymentCounter: dbExport.meta.nextPaymentCounter || 0,
    };
    data.zmt_customers = dbExport.customers;
    data.zmt_suppliers = dbExport.suppliers;
    data.zmt_payments = dbExport.payments;
    data.zmt_returns = dbExport.returns;
    data.zmt_transfers = dbExport.transfers;
    data.zmt_discounts = dbExport.discounts;
    data.zmt_orders = dbExport.orders;
    data.zmt_companies = dbExport.companies || [];
    data.zmt_employees = dbExport.employees || [];
    data.zmt_attendance = dbExport.attendance || [];
    const settingsKeys = [
      'zmt_store_name', 'zmt_store_address', 'zmt_store_phone',
      'zmt_company_name', 'zmt_tva_rate', 'zmt_timbre_enabled', 'zmt_timbre_rate',
      'zmt_invoice_prefix', 'zmt_next_invoice', 'zmt_low_stock_threshold',
      'zmt_expiry_enabled', 'zmt_expiry_required', 'zmt_expiry_warn_days',
      'zmt_pharmacy_mode',
      'zmt_debt_alerts',
      'zmt_product_qr_enabled',
    ];
    for (const k of settingsKeys) {
      const v = localStorage.getItem(k);
      if (v !== null) {
        try { data[k] = JSON.parse(v); } catch { data[k] = v; }
      }
    }
    const storeCode = localStorage.getItem('zmt_store_code');
    if (storeCode) {
      const usersKey = 'zmt_users_' + storeCode;
      const metaKey = 'zmt_users_meta_' + storeCode;
      const users = localStorage.getItem(usersKey);
      const meta = localStorage.getItem(metaKey);
      if (users) { try { data[usersKey] = JSON.parse(users); } catch { data[usersKey] = users; } }
      if (meta) { try { data[metaKey] = JSON.parse(meta); } catch { data[metaKey] = meta; } }
    }
    data._meta = {
      storeName: localStorage.getItem('zmt_store_name') || 'مخزني',
      storePhone: localStorage.getItem('zmt_store_phone') || '',
    };
    return data;
  }

  const _BACKUP_EXCLUDE = ['zmt_auth_user', 'zmt_store_code', 'zmt_store_type', 'zmt_parent_code', 'zmt_cloud_autosync', 'zmt_cloud_autosync_interval', 'zmt_cloud_last_sync'];

  async function setAllData(data, opts) {
    opts = opts || {};
    // Optional store-code re-tag: when the caller opts in, every restored row
    // that carries a `storeId` (products / invoices / orders / route docs /
    // bundles) is re-stamped to the CURRENT store code so data coming from an
    // old code becomes visible again. Off by default ⇒ restore behaviour is
    // byte-for-byte identical to before.
    const retagTarget = opts.retag ? (_backupCurrentStoreCode() || '') : '';
    const dbData = data.zmt_db || {};
    const hasDbKeys = dbData.products || dbData.invoices;
    const hasDirectKeys = data.products || data.invoices;
    const merged = {};
    if (hasDbKeys) {
      merged.products = dbData.products || [];
      merged.invoices = dbData.invoices || [];
      merged.orders = dbData.orders || [];
      merged.meta = {};
      if (dbData.nextBarcode) merged.meta.nextBarcode = dbData.nextBarcode;
      if (dbData.nextInvoiceCounter) merged.meta.nextInvoiceCounter = dbData.nextInvoiceCounter;
      if (dbData.nextPaymentCounter) merged.meta.nextPaymentCounter = dbData.nextPaymentCounter;
    }
    if (hasDirectKeys) {
      merged.products = data.products || merged.products || [];
      merged.invoices = data.invoices || merged.invoices || [];
      if (data.meta) merged.meta = data.meta;
    }
    if (data.zmt_customers) merged.customers = data.zmt_customers;
    if (data.zmt_suppliers) merged.suppliers = data.zmt_suppliers;
    if (data.zmt_payments) merged.payments = data.zmt_payments;
    if (data.zmt_returns) merged.returns = data.zmt_returns;
    if (data.zmt_transfers) merged.transfers = data.zmt_transfers;
    if (data.zmt_discounts) merged.discounts = data.zmt_discounts;
    if (data.zmt_orders) merged.orders = data.zmt_orders;
    if (data.zmt_companies) merged.companies = data.zmt_companies;
    if (data.zmt_employees) merged.employees = data.zmt_employees;
    if (data.zmt_attendance) merged.attendance = data.zmt_attendance;
    await DB.importAll(merged, retagTarget ? { retagStoreId: retagTarget } : undefined);
    const DB_KEYS = ['zmt_db', 'zmt_customers', 'zmt_suppliers', 'zmt_payments', 'zmt_returns', 'zmt_transfers', 'zmt_discounts', 'zmt_orders', 'zmt_companies', 'zmt_employees', 'zmt_attendance'];
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith('zmt_') || _BACKUP_EXCLUDE.includes(k) || DB_KEYS.includes(k)) continue;
      // Per-store employee accounts (`zmt_users_<code>` / `zmt_users_meta_<code>`)
      // are keyed by the store code, exactly like the DB rows. When re-tagging,
      // mirror them onto the current code so the restored employees are usable
      // under the active store. We NEVER overwrite an existing current-code list:
      // the local accounts of the active store stay authoritative.
      const m = /^zmt_users(_meta)?_(.+)$/.exec(k);
      if (retagTarget && m) {
        const targetKey = 'zmt_users' + (m[1] || '') + '_' + retagTarget;
        if (localStorage.getItem(targetKey) === null) {
          let payload = v;
          if (Array.isArray(v)) {
            payload = v.map(u => (u && typeof u === 'object' && u.storeCode ? Object.assign({}, u, { storeCode: retagTarget }) : u));
          }
          localStorage.setItem(targetKey, typeof payload === 'string' ? payload : JSON.stringify(payload));
        }
        // Keep the original (old-code) copy too, so nothing is lost if the user
        // later logs in again with the old code.
      }
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    if (data._meta) {
      if (data._meta.storeName) localStorage.setItem('zmt_store_name', data._meta.storeName);
      if (data._meta.storePhone) localStorage.setItem('zmt_store_phone', data._meta.storePhone);
    }
  }

  function getSummary(data) {
    const db = data.zmt_db || {};
    const products = db.products?.length || 0;
    const invoices = db.invoices?.length || 0;
    const customers = data.zmt_customers?.length || 0;
    const suppliers = data.zmt_suppliers?.length || 0;
    const payments = data.zmt_payments?.length || 0;
    const returns = data.zmt_returns?.length || 0;
    const discounts = data.zmt_discounts?.length || 0;
    const orders = (data.zmt_orders || data.zmt_db?.orders)?.length || 0;
    const companies = data.zmt_companies?.length || 0;
    return { products, invoices, customers, suppliers, payments, returns, discounts, orders, companies };
  }

  async function createBackup() {
    setStatus(t('backup.creating'), 'info');

    const allData = getAllData();
    const summary = getSummary(allData);
    if (summary.products === 0 && summary.invoices === 0 && summary.customers === 0 && summary.suppliers === 0) {
      setStatus(t('backup.noDataToBackup') || 'لا توجد بيانات للنسخ الاحتياطي', 'warning');
      return;
    }
    const storeName = allData._meta?.storeName || 'مخزني';

    const backup = {
      version: 2,
      createdAt: new Date().toISOString(),
      storeName,
      summary,
      data: allData,
    };

    const base64 = window._zmtGzipToBase64Async ? await window._zmtGzipToBase64Async(backup) : window._zmtGzipToBase64(backup);

    const result = await window.electronAPI.saveFile({
      defaultPath: `${storeName}_${new Date().toLocaleDateString('ar-EG-u-nu-latn').replace(/\//g, '-')}.zmt-backup`,
      filters: [{ name: 'ZMT Backup', extensions: ['zmt-backup', 'json'] }],
    });

    if (result.canceled) {
      setStatus(t('backup.operationCancelled'), 'warning');
      return;
    }

    const writeResult = await window.electronAPI.writeFileBinary(result.filePath, base64);
    if (writeResult.success) {
      setStatus(`${t('backup.createSuccess')} ${result.filePath}`, 'success');
      loadBackupList();
    } else {
      setStatus(`${t('backup.createFailed')}${writeResult.error}`, 'error');
    }
  }

  async function restoreBackup() {
    const result = await window.electronAPI.openFile({
      filters: [{ name: 'ZMT Backup', extensions: ['zmt-backup', 'json'] }],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths?.length) return;

    const filePath = result.filePaths[0];

    try {
      setStatus(t('backup.readingFile'), 'info');
      const readResult = await window.electronAPI.readFileBuffer(filePath);
      if (!readResult.success) {
        setStatus(`${t('backup.readFileFailed')}${readResult.error}`, 'error');
        return;
      }

      const backup = window._zmtParseBase64(readResult.data);
      if (!backup.data) {
        setStatus(t('backup.invalidFile'), 'error');
        return;
      }

      const s = backup.summary || getSummary(backup.data);
      const answer = await showRestoreDialog(backup, s);

      if (!answer.confirmed) {
        setStatus(t('backup.restoreCancelled'), 'warning');
        return;
      }

      await DB.waitForReady();
      await setAllData(backup.data, { retag: answer.retag });
      setStatus(answer.retag ? `${t('backup.restoreSuccessRetag')}` : `${t('backup.restoreSuccess')}`, 'success');
      loadBackupList();
    } catch (err) {
      setStatus(`${t('backup.restoreError')}${err.message}`, 'error');
    }
  }

  async function loadBackupList() {
    try {
      const appDataPath = await window.electronAPI.getAppDataPath();
      const dirResult = await window.electronAPI.readDirectory(appDataPath);
      if (dirResult.success && dirResult.files.length > 0) {
        let html = '<div class="backup-file-list">';
        for (const f of dirResult.files) {
          const icon = f.includes('auto') ? '🔄' : '💾';
          html += `<div class="backup-file-item">
            <span>${icon} ${f}</span>
            <button class="btn btn-sm btn-outline" onclick="window._restoreFromFile('${f}')" data-i18n="backup.restore">${t('backup.restore')}</button>
          </div>`;
        }
        html += '</div>';
        listEl.innerHTML = html;
      } else {
        listEl.innerHTML = `<div class="placeholder-box">
          <i class="fas fa-database" style="font-size:36px;color:#555"></i>
          <p data-i18n="backup.empty">${t('backup.empty')}</p>
        </div>`;
      }
    } catch {
      listEl.innerHTML = `<div class="placeholder-box">
        <i class="fas fa-database" style="font-size:36px;color:#555"></i>
        <p>${t('backup.empty')}</p>
      </div>`;
    }
  }

  window._restoreFromFile = async (filename) => {
    try {
      const appDataPath = await window.electronAPI.getAppDataPath();
      const fullPath = `${appDataPath}\\${filename}`;
      const readResult = await window.electronAPI.readFileBuffer(fullPath);
      if (!readResult.success) {
        setStatus(`${t('backup.readFileFailed')}${readResult.error}`, 'error');
        return;
      }
      const backup = window._zmtParseBase64(readResult.data);
      if (!backup.data) {
        setStatus(t('backup.invalidFile2'), 'error');
        return;
      }
      const s = backup.summary || getSummary(backup.data);
      const answer = await showRestoreDialog(backup, s);
      if (!answer.confirmed) return;
      await DB.waitForReady();
      await setAllData(backup.data, { retag: answer.retag });
      setStatus(answer.retag
        ? `${t('backup.restoreFromFileSuccessRetag')}${filename}`
        : `${t('backup.restoreFromFileSuccess')}${filename}`, 'success');
    } catch (err) {
      setStatus(`${t('backup.restoreError')}${err.message}`, 'error');
    }
  };

  function resetAllData() {
    const confirmed = confirm(
      `${t('backup.deleteAllConfirm')}\n\n` +
      `${t('backup.deleteAllDetails')}\n\n` +
      `${t('backup.deleteAllWarning')}\n` +
      `${t('backup.deleteAllBackupHint')}`
    );
    if (!confirmed) return;

    const doubleConfirm = confirm(t('backup.deleteAllFinalConfirm'));
    if (!doubleConfirm) return;

    const _KEEP = ['zmt_auth_user', 'zmt_store_code', 'zmt_store_type', 'zmt_parent_code', 'zmt_cloud_autosync', 'zmt_cloud_autosync_interval', 'zmt_cloud_last_sync', 'zmt_lan_role', 'zmt_lan_ip', 'zmt_lan_port'];
    const keys = Object.keys(localStorage).filter(k => k.startsWith('zmt_') && !_KEEP.includes(k));
    for (const key of keys) localStorage.removeItem(key);
    if (typeof DB !== 'undefined' && DB.reset) {
      DB.reset().then(() => { setTimeout(() => location.reload(), 300); }).catch(() => { setTimeout(() => location.reload(), 300); });
    } else {
      setTimeout(() => location.reload(), 300);
    }

    setStatus(t('backup.deleteAllDone'), 'warning');
    loadBackupList();
  }

  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'backup-status ' + (type || '');
    statusEl.style.display = 'block';
    if (type === 'success') statusEl.style.backgroundColor = '#d4edda';
    else if (type === 'error') statusEl.style.backgroundColor = '#f8d7da';
    else if (type === 'warning') statusEl.style.backgroundColor = '#fff3cd';
    else if (type === 'info') statusEl.style.backgroundColor = '#d1ecf1';
    else statusEl.style.backgroundColor = '';
    statusEl.style.color = '#333';
    statusEl.style.padding = '10px 14px';
    statusEl.style.borderRadius = '8px';
    statusEl.style.marginBottom = '16px';
    setTimeout(() => {
      if (type === 'success' || type === 'info') {
        statusEl.style.display = 'none';
      }
    }, 8000);
  }
}
