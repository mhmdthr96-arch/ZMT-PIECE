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
  if (btnMigration) btnMigration.addEventListener('click', () => openMigration());

  function getAllData() {
    const dbExport = DB.exportAll();
    const data = {};
    data.zmt_db = {
      products: dbExport.products,
      invoices: dbExport.invoices,
      orders: dbExport.orders,
      nextBarcode: dbExport.meta.nextBarcode || 100000,
      nextInvoiceCounter: dbExport.meta.nextInvoiceCounter || 0,
    };
    data.zmt_customers = dbExport.customers;
    data.zmt_suppliers = dbExport.suppliers;
    data.zmt_payments = dbExport.payments;
    data.zmt_returns = dbExport.returns;
    data.zmt_transfers = dbExport.transfers;
    data.zmt_discounts = dbExport.discounts;
    data.zmt_orders = dbExport.orders;
    const settingsKeys = [
      'zmt_store_name', 'zmt_store_address', 'zmt_store_phone',
      'zmt_tva_rate', 'zmt_timbre_enabled', 'zmt_timbre_rate',
      'zmt_invoice_prefix', 'zmt_next_invoice', 'zmt_low_stock_threshold',
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

  async function setAllData(data) {
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
    await DB.importAll(merged);
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('zmt_') && !_BACKUP_EXCLUDE.includes(k) && !['zmt_db', 'zmt_customers', 'zmt_suppliers', 'zmt_payments', 'zmt_returns', 'zmt_transfers', 'zmt_discounts', 'zmt_orders'].includes(k)) {
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
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
    return { products, invoices, customers, suppliers, payments, returns, discounts, orders };
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

    const base64 = window._zmtGzipToBase64(backup);

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
      const confirmed = confirm(
        `${t('backup.restoreConfirm')}\n\n` +
        `${t('backup.store')}${backup.storeName || t('backup.unknown')}\n` +
        `${t('backup.date')}${new Date(backup.createdAt).toLocaleDateString('ar-EG-u-nu-latn')}\n\n` +
        `${t('backup.content')}\n` +
        `• ${t('backup.products')}: ${s.products}\n` +
        `• ${t('backup.invoices')}: ${s.invoices}\n` +
        `• ${t('backup.customers')}: ${s.customers}\n` +
        `• ${t('backup.suppliers')}: ${s.suppliers}\n` +
        `• ${t('backup.payments')}: ${s.payments}\n` +
        `• ${t('backup.returns')}: ${s.returns}\n` +
        `• ${t('backup.discounts')}: ${s.discounts}\n\n` +
        `${t('backup.dataWarning')}`
      );

      if (!confirmed) {
        setStatus(t('backup.restoreCancelled'), 'warning');
        return;
      }

      await DB.waitForReady();
      await setAllData(backup.data);
      setStatus(`${t('backup.restoreSuccess')}`, 'success');
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
      if (!confirm(`${t('backup.restoreFromFileConfirm')}\n${t('backup.restoreFromFileWarning')}`)) return;
      await DB.waitForReady();
      await setAllData(backup.data);
      setStatus(`${t('backup.restoreFromFileSuccess')}${filename}`, 'success');
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

    const _KEEP = ['zmt_auth_user', 'zmt_store_code', 'zmt_store_type', 'zmt_parent_code', 'zmt_cloud_autosync', 'zmt_cloud_autosync_interval', 'zmt_cloud_last_sync'];
    const keys = Object.keys(localStorage).filter(k => k.startsWith('zmt_') && !_KEEP.includes(k));
    for (const key of keys) localStorage.removeItem(key);
    if (typeof DB !== 'undefined' && DB.reset) DB.reset();

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
