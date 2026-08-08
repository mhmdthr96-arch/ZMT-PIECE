// ============================================================
// SUPPLIER RETURNS — إرجاع السلع الفاسدة للمورد
// Statuses: pending (جاري الاسترجاع) → returned (تم الاسترجاع)
//           not_returned (لم تسترجع) + delete (cancel / reverse)
// ============================================================

async function init_supplier_returns() {
  renderSupplierReturns();
  try {
    await _srRefreshFromCloud();
  } catch (e) {
    console.warn('[SR] cloud refresh skipped:', e && e.message);
  }
}

function _srEsc(v) { return typeof escHtml === 'function' ? escHtml(v) : String(v == null ? '' : v); }

function _srList() {
  return (DB.getSupplierReturns && DB.getSupplierReturns()) || [];
}

// ===== VISIBILITY (network isolation by store) =====
let _srVisCache = { key: null, stores: null };
let _srBranchReturnsCache = { key: null, list: null };

function _srMyStoreCode() {
  if (typeof CloudService !== 'undefined' && typeof CloudService.getStoreCode === 'function') {
    return CloudService.getStoreCode() || '';
  }
  return '';
}

function _srStoreName() {
  return localStorage.getItem('zmt_store_name') ||
    (typeof Auth !== 'undefined' && typeof Auth.getStoreName === 'function' ? Auth.getStoreName() : '') ||
    '';
}

// Stores whose returns this device may see:
// - a branch sees ONLY its own store
// - a main store sees its own + its registered branches
async function _srLoadVisibleStores() {
  const myCode = _srMyStoreCode();
  const fallback = [{ code: myCode, name: _srStoreName() || myCode || '-', type: 'main' }];
  if (_srVisCache.key === myCode && _srVisCache.stores) return _srVisCache.stores;

  let stores = fallback;
  try {
    const isMain = typeof CloudService !== 'undefined' && typeof CloudService.getStoreType === 'function' &&
      CloudService.getStoreType() === 'main';
    if (isMain && typeof CloudService.listAccessibleStores === 'function') {
      const acc = await CloudService.listAccessibleStores();
      if (Array.isArray(acc) && acc.length) {
        stores = acc.map(s => ({
          code: s.code || '',
          name: (s.code === myCode ? (_srStoreName() || s.name) : (s.name || s.code)) || '',
          type: s.type || (s.code === myCode ? 'main' : 'branch'),
        }));
      }
    }
  } catch (e) {
    stores = fallback;
  }
  _srVisCache = { key: myCode, stores };
  return stores;
}

function _srVisibleCodes() {
  return (_srVisCache.stores || []).map(s => s.code);
}

// A main store pulls each remote branch's cloud backup to see its returns
// (view-only). Data arrives as of the branch main-server's last upload.
async function _srPullBranchReturns() {
  const myCode = _srMyStoreCode();
  if (!myCode) return [];
  if (_srBranchReturnsCache.key === myCode && _srBranchReturnsCache.list) return _srBranchReturnsCache.list;

  const stores = await _srLoadVisibleStores();
  const branches = (stores || []).filter(s => s.code && s.code !== myCode);
  const collected = [];
  if (typeof CloudService !== 'undefined' && typeof CloudService.downloadStoreBackup === 'function') {
    for (const b of branches) {
      try {
        const payload = await CloudService.downloadStoreBackup(b.code);
        const d = (payload && payload.data) || {};
        const list = d.zmt_supplierReturns || d.supplierReturns || [];
        if (Array.isArray(list)) {
          for (const r of list) {
            collected.push(Object.assign({}, r, {
              storeId: r.storeId || b.code,
              storeName: r.storeName || payload.storeName || b.name || b.code,
              _fromCloud: true,
            }));
          }
        }
      } catch (e) {
        // branch has no backup yet / not reachable: skip it
      }
    }
  }
  _srBranchReturnsCache = { key: myCode, list: collected };
  return collected;
}

// Merge local (LAN-synced) records with cloud-pulled branch records, dedup by id.
function _srAll() {
  const merged = new Map();
  for (const r of _srList()) merged.set(r.id, r);
  for (const r of (_srBranchReturnsCache.list || [])) if (!merged.has(r.id)) merged.set(r.id, r);
  return Array.from(merged.values());
}

async function _srRefreshFromCloud() {
  const myCode = _srMyStoreCode();
  if (!myCode) return;
  _srVisCache = { key: null, stores: null };
  _srBranchReturnsCache = { key: null, list: null };
  await _srLoadVisibleStores();
  await _srPullBranchReturns();
  renderSupplierReturns();
}

// Only the store that owns a record may change its status / delete it.
function _srOwned(r) {
  const myCode = _srMyStoreCode();
  if (!r.storeId || !myCode) return true;
  return r.storeId === myCode;
}

function _srStatusLabel(status) {
  switch (status) {
    case 'returned': return t('supplierReturns.statusReturned') || 'تم الاسترجاع';
    case 'not_returned': return t('supplierReturns.statusNotReturned') || 'لم تسترجع';
    default: return t('supplierReturns.statusPending') || 'جاري الاسترجاع';
  }
}

function _srStatusBadge(status) {
  const cls = status === 'returned' ? 'badge-success' : (status === 'not_returned' ? 'badge-info' : 'badge-warning');
  return `<span class="badge ${cls}">${_srStatusLabel(status)}</span>`;
}

function _srFiltered() {
  const q = (document.getElementById('srSearch')?.value || '').toLowerCase().trim();
  const st = document.getElementById('srStatusFilter')?.value || 'all';
  let list = _srAll();
  const visible = _srVisibleCodes();
  if (visible.length) list = list.filter(r => !r.storeId || visible.includes(r.storeId));
  if (st !== 'all') list = list.filter(r => r.status === st);
  if (q) list = list.filter(r =>
    (r.productName || '').toLowerCase().includes(q) ||
    (r.supplierName || '').toLowerCase().includes(q) ||
    (r.invoiceNumber || '').toLowerCase().includes(q) ||
    (r.invoiceId || '').toLowerCase().includes(q)
  );
  return list.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function renderSupplierReturns() {
  const container = document.getElementById('srBody');
  if (!container) return;
  const list = _srFiltered();

  if (list.length === 0) {
    container.innerHTML = `<tr><td colspan="10" class="empty-row"><i class="fas fa-box-open"></i> ${t('supplierReturns.empty')}</td></tr>`;
    return;
  }

  container.innerHTML = list.map((r, i) => {
    const d = new Date(r.createdAt || Date.now());
    const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn');
    const timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    let actions = '';
    if (_srOwned(r)) {
      if (r.status === 'pending') {
        actions = `
        <button class="btn btn-sm btn-success" onclick="markSupplierReturned('${r.id}')" title="${t('supplierReturns.markReturned')}"><i class="fas fa-check"></i></button>
        <button class="btn btn-sm" onclick="markSupplierNotReturned('${r.id}')" title="${t('supplierReturns.markNotReturned')}"><i class="fas fa-times"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteSupplierReturn('${r.id}')" title="${t('supplierReturns.delete')}"><i class="fas fa-trash"></i></button>`;
      } else if (r.status === 'returned') {
        actions = `<button class="btn btn-sm btn-danger" onclick="deleteSupplierReturn('${r.id}')" title="${t('supplierReturns.deleteReverse')}"><i class="fas fa-undo-alt"></i></button>`;
      } else {
        actions = `<button class="btn btn-sm btn-danger" onclick="deleteSupplierReturn('${r.id}')" title="${t('supplierReturns.delete')}"><i class="fas fa-trash"></i></button>`;
      }
    } else {
      actions = '<span class="text-muted">-</span>';
    }
    return `<tr>
      <td>${i + 1}</td>
      <td>${_srEsc(r.storeName || r.storeId || '-')}</td>
      <td><strong>${_srEsc(r.productName)}</strong></td>
      <td>${r.qty}</td>
      <td>DA${Number(r.amount || 0).toFixed(2)}</td>
      <td>${_srEsc(r.supplierName || '-')}</td>
      <td dir="ltr">${_srEsc(r.invoiceNumber || (r.invoiceId || '').slice(0, 8))}</td>
      <td>${dateStr} ${timeStr}</td>
      <td>${_srStatusBadge(r.status)}</td>
      <td style="white-space:nowrap">${actions}</td>
    </tr>`;
  }).join('');
}

// ========== CREATE (from inventory / category-products) ==========

function openSupplierReturnModal(productId) {
  const prod = DB.getProduct(productId);
  if (!prod) { alert(t('supplierReturns.noProduct')); return; }

  const suppliers = DB.getSuppliers();
  const sup = prod.supplierId ? suppliers.find(s => s.id === prod.supplierId) : null;
  const supName = sup ? sup.name : '';

  // Purchase invoices containing this product, with remaining qty still in stock per invoice
  const existing = _srList().filter(r => r.productId === productId && (r.status === 'pending' || r.status === 'returned'));
  const candidates = DB.getInvoices()
    .filter(inv => (inv.type === 'supplier' || inv.type === 'purchase') && !inv.isProvisional)
    .map(inv => {
      const line = (inv.items || []).find(it => it.productId === productId && (it.qty || 0) > 0);
      if (!line) return null;
      const already = existing.filter(r => r.invoiceId === inv.id).reduce((s, r) => s + (r.qty || 0), 0);
      const remaining = Math.max(0, (line.qty || 0) - already);
      if (remaining <= 0) return null;
      return { inv, line, remaining };
    })
    .filter(Boolean)
    .sort((a, b) => ((b.inv.date || b.inv.createdAt) || 0) - ((a.inv.date || a.inv.createdAt) || 0));

  if (candidates.length === 0) {
    alert(t('supplierReturns.noInvoice') + ' — ' + (prod.name || ''));
    return;
  }

  const invLabel = x => {
    const num = x.inv.invoiceNumber || (x.inv.id || '').slice(0, 8).toUpperCase();
    const d = new Date(x.inv.date || x.inv.createdAt);
    const ds = d.toLocaleDateString('ar-EG-u-nu-latn');
    const sup2 = x.inv.supplierId ? suppliers.find(s => s.id === x.inv.supplierId) : null;
    return `${num} — ${ds}${sup2 ? ' — ' + sup2.name : ''} (${x.remaining} ${t('common.piece')})`;
  };

  const opts = candidates.map((x, i) => `<option value="${i}">${_srEsc(invLabel(x))}</option>`).join('');

  const body = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="padding:12px 14px;border-radius:8px;background:var(--silver-100);border:1px solid var(--silver-200)">
        <div style="font-weight:600;font-size:14px;color:var(--silver-800)"><i class="fas fa-cube"></i> ${_srEsc(prod.name)}</div>
        <div style="font-size:11px;color:var(--silver-500);margin-top:5px;display:flex;gap:16px;flex-wrap:wrap">
          <span>${t('supplierReturns.stock')}: <strong style="color:var(--silver-700)">${prod.quantity}</strong></span>
          <span>${t('supplierReturns.supplier')}: <strong style="color:var(--silver-700)">${_srEsc(supName || '-')}</strong></span>
        </div>
      </div>
      <label style="font-size:12px;color:var(--silver-600)">${t('supplierReturns.qty')}
        <input type="number" id="srQty" min="1" max="${prod.quantity}" value="1" class="form-input" style="width:100%;margin-top:6px">
      </label>
      <label style="font-size:12px;color:var(--silver-600)">${t('supplierReturns.invoice')}
        <select id="srInvoice" class="form-input" style="width:100%;margin-top:6px">${opts}</select>
      </label>
      <label style="font-size:12px;color:var(--silver-600)">${t('supplierReturns.note')}
        <input type="text" id="srNote" class="form-input" placeholder="${t('supplierReturns.notePlaceholder')}" style="width:100%;margin-top:6px">
      </label>
    </div>`;

  _srShowModal(t('supplierReturns.modalTitle'), body, () => {
    const qtyEl = document.getElementById('srQty');
    const invEl = document.getElementById('srInvoice');
    const noteEl = document.getElementById('srNote');
    if (!qtyEl || !invEl) return false;
    const qty = parseInt(qtyEl.value, 10);
    const sel = candidates[parseInt(invEl.value, 10)];
    if (!sel || !qty || qty < 1) { alert(t('supplierReturns.invalidQty')); return false; }
    if (qty > prod.quantity) { alert(t('supplierReturns.qtyExceedsStock')); return false; }
    if (qty > sel.remaining) { alert(t('supplierReturns.qtyExceedsInvoice')); return false; }

    const supplierId = sel.inv.supplierId || prod.supplierId || null;
    const supplierName = supplierId ? (suppliers.find(s => s.id === supplierId) || {}).name : '';
    const price = sel.line.price || 0;

    DB.addSupplierReturn({
      productId: prod.id,
      productName: prod.name,
      barcode: prod.barcode || '',
      supplierId,
      supplierName: supplierName || supName,
      invoiceId: sel.inv.id,
      invoiceNumber: sel.inv.invoiceNumber || '',
      qty,
      price,
      amount: price * qty,
      note: (noteEl.value || '').trim(),
      status: 'pending',
      storeId: _srMyStoreCode(),
      storeName: _srStoreName(),
    });
    alert(t('supplierReturns.created'));
    if (typeof window.notifyWebPush === 'function') {
      window.notifyWebPush('supplierReturn', { productName: prod.name, qty: qty, amount: price * qty });
    }
    return true;
  });
}

function _srShowModal(title, bodyHtml, onConfirm) {
  const existing = document.getElementById('srModalOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'srModalOverlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `<div class="modal" style="max-width:520px">
    <div class="modal-header">
      <h3><i class="fas fa-undo-alt"></i> ${title}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>
    <div class="modal-footer">
      <button class="btn" onclick="this.closest('.modal-overlay').remove()">${t('common.cancel')}</button>
      <button class="btn btn-success" id="srModalConfirm"><i class="fas fa-check"></i> ${t('common.save')}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('srModalConfirm').onclick = () => { if (onConfirm()) overlay.remove(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ========== STATUS TRANSITIONS ==========

function _srInvoiceTotal(items) {
  return (items || []).reduce((s, it) => s + ((it.qty || 0) * (it.price || 0)), 0);
}

function markSupplierReturned(id) {
  const r = _srList().find(x => x.id === id);
  if (!r || r.status === 'returned') return;
  if (!_srOwned(r)) { alert(t('supplierReturns.notOwned')); return; }
  if (!confirm(t('supplierReturns.confirmReturned'))) return;

  const prod = DB.getProduct(r.productId);
  const inv = DB.getInvoice(r.invoiceId);

  if (prod && (prod.quantity || 0) < r.qty) {
    alert(t('supplierReturns.insufficientStock') + ` (${prod.quantity})`);
    return;
  }
  if (!inv) { alert(t('supplierReturns.invoiceMissing')); return; }
  const line = (inv.items || []).find(it => it.productId === r.productId);
  if (!line || (line.qty || 0) < r.qty) { alert(t('supplierReturns.lineMissing')); return; }

  const oldTotal = inv.totalAmount || _srInvoiceTotal(inv.items);
  const oldPaid = DB.getInvoicePaidAmount(inv.id);

  // 1) reduce the item line on the original supplier invoice
  line.qty = (line.qty || 0) - r.qty;
  line.total = line.qty * (line.price || 0);
  const newItems = (inv.items || []).filter(it => (it.qty || 0) > 0);
  const newTotal = _srInvoiceTotal(newItems);

  // 2) if the invoice was over-paid, refund the excess back to the payments
  DB.reduceInvoicePayments(inv.id, newTotal);
  const newPaid = DB.getInvoicePaidAmount(inv.id);

  // 3) persist the adjusted invoice
  DB.updateInvoice(inv.id, { items: newItems, totalAmount: newTotal, modifiedAt: Date.now() });

  // 4) supplier balance: invoice reduced by R, refunded payments raise it back by P
  if (inv.supplierId) {
    const suppliers = DB.getSuppliers();
    const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
    if (sIdx !== -1) {
      const delta = (oldTotal - newTotal) - (oldPaid - newPaid);
      suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) - delta;
      DB.saveSuppliers(suppliers);
    }
  }

  // 5) decrease inventory
  if (prod) DB.updateProduct(r.productId, { quantity: (prod.quantity || 0) - r.qty });

  // 6) record the applied snapshot for exact reversal
  DB.updateSupplierReturn(id, { status: 'returned', applied: { total: oldTotal, paid: oldPaid } });

  alert(t('supplierReturns.returnedSuccess'));
  renderSupplierReturns();
}

function markSupplierNotReturned(id) {
  const r = _srList().find(x => x.id === id);
  if (!r || r.status !== 'pending') return;
  if (!_srOwned(r)) { alert(t('supplierReturns.notOwned')); return; }
  if (!confirm(t('supplierReturns.confirmNotReturned'))) return;
  DB.updateSupplierReturn(id, { status: 'not_returned' });
  renderSupplierReturns();
}

// ========== DELETE / REVERSE ==========

function deleteSupplierReturn(id) {
  const r = _srList().find(x => x.id === id);
  if (!r) return;
  if (!_srOwned(r)) { alert(t('supplierReturns.notOwned')); return; }
  if (r.status === 'returned') {
    if (!confirm(t('supplierReturns.deleteReturnedConfirm'))) return;
    _srReverseEffects(r);
  } else {
    if (!confirm(t('supplierReturns.deleteConfirm'))) return;
  }
  DB.deleteSupplierReturn(id);
  renderSupplierReturns();
  alert(t('supplierReturns.deleted'));
}

function _srReverseEffects(r) {
  const prod = DB.getProduct(r.productId);
  if (prod) DB.updateProduct(r.productId, { quantity: (prod.quantity || 0) + r.qty });

  const inv = DB.getInvoice(r.invoiceId);
  if (!inv) return;

  const items = (inv.items || []).slice();
  const line = items.find(it => it.productId === r.productId);
  if (line) {
    line.qty = (line.qty || 0) + r.qty;
    line.total = line.qty * (line.price || 0);
  } else {
    items.push({ productId: r.productId, barcode: r.barcode || '', name: r.productName, qty: r.qty, price: r.price || 0, total: (r.price || 0) * r.qty });
  }
  const newTotal = _srInvoiceTotal(items);
  const oldTotal = inv.totalAmount || _srInvoiceTotal(inv.items);
  const currentPaid = DB.getInvoicePaidAmount(inv.id);

  // restore payments that were capped when the return was applied
  const appliedPaid = (r.applied && r.applied.paid) || 0;
  const restorePay = Math.max(0, appliedPaid - currentPaid);
  if (restorePay > 0) _srRestorePayments(inv.id, restorePay);
  const newPaid = DB.getInvoicePaidAmount(inv.id);

  DB.updateInvoice(inv.id, { items, totalAmount: newTotal, modifiedAt: Date.now() });

  if (inv.supplierId) {
    const suppliers = DB.getSuppliers();
    const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
    if (sIdx !== -1) {
      const delta = (newTotal - oldTotal) - (newPaid - currentPaid);
      suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) + delta;
      DB.saveSuppliers(suppliers);
    }
  }
}

function _srRestorePayments(invoiceId, amount) {
  if (amount <= 0) return;
  const payments = DB.getInvoicePayments(invoiceId);
  const all = DB.getPayments();
  if (payments.length > 0) {
    const target = payments.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).pop();
    const idx = all.findIndex(p => p.id === target.id);
    if (idx !== -1) {
      all[idx].amount = (all[idx].amount || 0) + amount;
      DB.savePayments(all);
      return;
    }
  }
  // no surviving payment: record a compensation payment for the refund
  const inv = DB.getInvoice(invoiceId);
  DB.addPayment({
    invoiceId,
    supplierId: inv ? inv.supplierId : null,
    amount,
    method: 'cash',
    note: t('supplierReturns.refundNote') || 'استرجاع بضاعة مورد',
    createdAt: Date.now(),
  });
}

// ========== EXPORT ==========

function exportSupplierReturns() {
  const list = _srFiltered();
  if (list.length === 0) { alert(t('supplierReturns.noExport')); return; }

  const rows = list.map((r, i) => {
    const d = new Date(r.createdAt || Date.now());
    return {
      '#': i + 1,
      [t('supplierReturns.colStore')]: r.storeName || r.storeId || '',
      [t('common.product')]: r.productName || '',
      [t('common.qty')]: r.qty || 0,
      [t('common.price')]: r.price || 0,
      [t('common.total')]: r.amount || 0,
      [t('supplierReturns.colSupplier')]: r.supplierName || '',
      [t('supplierReturns.colInvoice')]: r.invoiceNumber || r.invoiceId || '',
      [t('common.date')]: d.toLocaleDateString('ar-EG-u-nu-latn'),
      [t('supplierReturns.colStatus')]: _srStatusLabel(r.status),
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 24 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t('supplierReturns.title'));
  const fileName = `ZMT_PIECE_SupplierReturns_${new Date().toISOString().slice(0, 10)}.xlsx`;

  if (window.electronAPI && window.electronAPI.saveFile) {
    window.electronAPI.saveFile({
      defaultPath: fileName,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    }).then(result => {
      if (!result.canceled && result.filePath) {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        let binary = '';
        for (let i = 0; i < wbout.length; i++) binary += String.fromCharCode(wbout[i]);
        window.electronAPI.writeFileBinary(result.filePath, btoa(binary)).then(res => {
          if (res.success) alert(t('supplierReturns.exportSuccess'));
          else alert(t('supplierReturns.exportError') + res.error);
        });
      }
    });
  } else {
    XLSX.writeFile(wb, fileName);
  }
}

// ===== LAN SYNC: live list refresh =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['supplier-returns'] = function supplierReturnsSyncData() {
  renderSupplierReturns();
};
