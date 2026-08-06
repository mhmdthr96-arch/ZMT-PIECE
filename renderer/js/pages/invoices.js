// ===== INVOICES PAGE =====
var _invAllInvoices = [];
var _invFiltered = [];
var _invDetailId = null;
var _invSearchDebounce = null;
var _invCustomersCache = null;
var _invSuppliersCache = null;
var _invPager = null;

function init_invoices() {
  _invAllInvoices = DB.getInvoices().sort((a, b) => b.createdAt - a.createdAt);
  _invCustomersCache = null;
  _invSuppliersCache = null;
  if (_invPager) { _invPager.destroy(); _invPager = null; }
  _invPager = new InfiniteScrollPager({
    data: _invFiltered,
    container: document.getElementById('allInvoicesList'),
    pageSize: 50,
    renderItem: _renderInvCard,
    renderEmpty: () => `<div class="placeholder-box"><i class="fas fa-file-invoice" style="font-size:48px;color:#555"></i><p>${t('invoices.noMatch')}</p></div>`,
    scrollContainer: document.querySelector('.main-content') || window,
  });
  window._activePager = _invPager;
  filterInvoices();
}

// ===== FILTERS =====

function filterInvoices() {
  const q = normSearch(document.getElementById('invSearchInput').value || '').toLowerCase();
  const dateFrom = document.getElementById('invDateFrom').value;
  const dateTo = document.getElementById('invDateTo').value;
  const typeFilter = document.getElementById('invTypeFilter').value;

  if (!_invCustomersCache) {
    _invCustomersCache = {};
    DB.getCustomers().forEach(c => { _invCustomersCache[c.id] = c; });
  }
  if (!_invSuppliersCache) {
    _invSuppliersCache = {};
    DB.getSuppliers().forEach(s => { _invSuppliersCache[s.id] = s; });
  }

  _invFiltered = _invAllInvoices.filter(inv => {
    if (typeFilter !== 'all' && inv.type !== typeFilter) return false;

    if (q) {
      const numMatch = inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q);
      const custMatch = inv.customerId && (_invCustomersCache[inv.customerId]?.name || '').toLowerCase().includes(q);
      const supMatch = inv.supplierId && (_invSuppliersCache[inv.supplierId]?.name || '').toLowerCase().includes(q);
      const walkinMatch = inv.walkinName && inv.walkinName.toLowerCase().includes(q);
      if (!numMatch && !custMatch && !supMatch && !walkinMatch) return false;
    }

    if (dateFrom) {
      const from = new Date(dateFrom).setHours(0,0,0,0);
      if (inv.createdAt < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo).setHours(23,59,59,999);
      if (inv.createdAt > to) return false;
    }

    return true;
  });

  const pagEl = document.getElementById('invPagination');
  if (pagEl) pagEl.style.display = 'none';
  const infoEl = document.getElementById('invResultsInfo');
  if (infoEl) infoEl.textContent = _invFiltered.length + t('invoices.resultsInfo');
  if (_invPager) _invPager.updateData(_invFiltered);
}

function setupInvSearchDebounce() {
  const input = document.getElementById('invSearchInput');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('input', debounce(function() { filterInvoices(); }, 300));
}

function resetInvoiceFilters() {
  document.getElementById('invSearchInput').value = '';
  document.getElementById('invDateFrom').value = '';
  document.getElementById('invDateTo').value = '';
  document.getElementById('invTypeFilter').value = 'all';
  filterInvoices();
}

// (deprecated — kept for onclick compatibility in HTML)
function changeInvoicePage(delta) {}

// ===== RENDER =====

function _renderInvCard(inv, idx) {
  const suppliers = _invSuppliersCache || {};
  const customers = _invCustomersCache || {};
  const date = new Date(inv.createdAt).toLocaleDateString('ar-EG-u-nu-latn');
  const sup = inv.supplierId ? suppliers[inv.supplierId] : null;
  const cust = inv.customerId ? customers[inv.customerId] : null;
  const paidAmount = DB.getInvoicePaidAmount(inv.id);
  const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);
  const payRatio = inv.totalAmount > 0 ? (paidAmount / inv.totalAmount) : 0;

  let type, typeColor, typeIcon;
  if (inv.type === 'customer') {
    type = t('invoices.typeSale');
    typeColor = 'badge-success';
    typeIcon = 'fas fa-hand-holding-usd';
  } else if (inv.type === 'supplier') {
    type = t('invoices.typeSupplier');
    typeColor = 'badge-warning';
    typeIcon = 'fas fa-truck';
  } else if (inv.type === 'waybill') {
    type = t('invoices.typeWaybill');
    typeColor = 'badge-info';
    typeIcon = 'fas fa-tasks';
  } else if (inv.type === 'proforma') {
    type = t('invoices.typeProforma');
    typeColor = 'badge-info';
    typeIcon = 'fas fa-file-alt';
  } else if (inv.type === 'dispatch') {
    type = t('invoices.typeDispatch');
    typeColor = 'badge-info';
    typeIcon = 'fas fa-share-square';
  } else if (inv.type === 'transfer') {
    type = t('invoices.typeTransfer');
    typeColor = 'badge-info';
    typeIcon = 'fas fa-exchange-alt';
  } else if (inv.type === 'transfer_receive') {
    type = t('invoices.typeReception');
    typeColor = 'badge-success';
    typeIcon = 'fas fa-clipboard-check';
  } else {
    type = t('invoices.typePurchase');
    typeColor = 'badge-info';
    typeIcon = 'fas fa-shopping-cart';
  }

  const partyName = cust ? cust.name : (sup ? sup.name : (inv.walkinName || ''));

  return `<div class="inv-card" data-type="${inv.type || 'purchase'}" onclick="showInvDetail('${inv.id}')">
    <div class="inv-card-top">
      <div class="inv-card-type">
        <span class="badge ${typeColor}"><i class="${typeIcon}" style="margin-left:4px"></i>${type}</span>
        ${inv.isProvisional && inv.type !== 'proforma' ? `<span class="badge badge-warning" style="margin-right:4px">${t('invoices.badgeProvisional')}</span>` : ''}
        <strong class="inv-card-num">${inv.invoiceNumber || '—'}</strong>
      </div>
      <div class="inv-card-date">${date}</div>
    </div>
    <div class="inv-card-body">
      <div class="inv-card-party">${partyName ? `<i class="fas fa-user" style="margin-left:4px;color:var(--silver-500)"></i>${escHtml(partyName)}` : '<span style="color:var(--silver-400)">—</span>'}</div>
      <div class="inv-card-items">${inv.items ? inv.items.length + ' ' + t('invoices.itemCount') : '—'}</div>
      <div class="inv-card-total"><strong>DA${(inv.totalAmount || 0).toFixed(2)}</strong></div>
    </div>
    <div class="inv-card-footer">
      <div class="inv-card-progress">
        <div class="inv-progress-bar" style="width:${Math.min(payRatio * 100, 100)}%"></div>
      </div>
      <div class="inv-card-paid">
        ${payRatio >= 1
          ? `<span style="color:#28a745"><i class="fas fa-check-circle"></i> ${t('invoices.paidLabel')}</span>`
          : payRatio > 0
            ? `<span style="color:#e65100">DA${paidAmount.toFixed(2)}</span>`
            : `<span style="color:var(--silver-400)">${t('invoices.unpaidLabel')}</span>`
        }
        ${remaining > 0 ? `<span style="color:#e65100;font-size:11px">| ${t('invoices.remainingLabel')} DA${remaining.toFixed(2)}</span>` : ''}
      </div>
    </div>
  </div>`;
}

// ===== ADD INVOICE MENU =====

function showAddInvoiceMenu() {
  document.getElementById('addInvoiceMenuModal').style.display = 'flex';
}

function closeAddInvoiceMenu() {
  document.getElementById('addInvoiceMenuModal').style.display = 'none';
}

// ===== INVOICE DETAIL =====

function showInvDetail(invoiceId) {
  const inv = DB.getInvoice(invoiceId);
  if (!inv) return;
  _invDetailId = invoiceId;

  const modal = document.getElementById('invDetailModal');
  const body = document.getElementById('invDetailBody');
  const title = document.getElementById('invDetailTitle');
  const footer = document.getElementById('invDetailFooter');

  document.getElementById('invPayTotal').textContent = 'DA' + (inv.totalAmount || 0).toFixed(2);
  const paidAmount = DB.getInvoicePaidAmount(invoiceId);
  document.getElementById('invPayPaid').textContent = 'DA' + paidAmount.toFixed(2);
  document.getElementById('invPayRemaining').textContent = 'DA' + Math.max(0, (inv.totalAmount || 0) - paidAmount).toFixed(2);
  document.getElementById('invPayAmount').value = Math.max(0, (inv.totalAmount || 0) - paidAmount).toFixed(2);

  const invNum = inv.invoiceNumber || '—';
  let typeLabel;
  if (inv.type === 'customer') typeLabel = 'FACTURE DE VENTE';
  else if (inv.type === 'supplier') typeLabel = "FACTURE D'ACHAT";
  else if (inv.type === 'waybill') typeLabel = 'BON DE LIVRAISON';
  else if (inv.type === 'proforma') typeLabel = 'FACTURE PROFORMA';
  else if (inv.type === 'dispatch') typeLabel = "BON D'ENVOI";
  else if (inv.type === 'transfer') typeLabel = 'BON DE TRANSFERT';
  else if (inv.type === 'transfer_receive') typeLabel = 'BON DE RÉCEPTION';
  else typeLabel = "FACTURE D'ACHAT";

  title.innerHTML = `<i class="fas fa-file-invoice"></i> ${invNum}`;

  body.innerHTML = buildInvoiceDetailHTML(inv, typeLabel, paidAmount);
  modal.style.display = 'flex';
}

function buildInvoiceDetailHTML(inv, typeLabel, paidAmount) {
  const store = getStoreInfo();
  const remaining = Math.max(0, (inv.totalAmount || 0) - paidAmount);
  const date = new Date(inv.createdAt);
  const dateStr = date.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const totalQty = inv.items ? inv.items.reduce((s, it) => s + it.qty, 0) : 0;

  const sup = inv.supplierId ? DB.getSuppliers().find(s => s.id === inv.supplierId) : null;
  const cust = inv.customerId ? DB.getCustomers().find(c => c.id === inv.customerId) : null;
  const party = cust || sup;
  const isCustomer = !!inv.customerId || inv.type === 'waybill' || inv.type === 'proforma' || inv.type === 'customer';
  const walkinCust = (!cust && !sup && inv.walkinName) ? { name: inv.walkinName, phone: inv.walkinPhone, address: inv.walkinAddress } : null;

  return `
    <div id="invDetailPrintArea" style="padding:30px 35px;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#222;direction:ltr;text-align:left" dir="ltr">
      <table style="width:100%;border-collapse:collapse" dir="ltr">
        <tr>
          <td style="vertical-align:top;width:60%">
            <div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">${escHtml(store.name)}</div>
            <div style="font-size:10px;color:#999;margin-top:1px;text-transform:uppercase;letter-spacing:0.5px">${inv.type === 'proforma' ? 'Document proforma — sans valeur commerciale' : 'Document commercial'}</div>
            ${store.address ? `<div style="font-size:11px;color:#555;margin-top:4px">${escHtml(store.address)}</div>` : ''}
            ${store.phone ? `<div style="font-size:11px;color:#555">Tél: ${escHtml(store.phone)}</div>` : ''}
            <div style="font-size:10px;color:#999;margin-top:2px">NIF: — | RC: —</div>
          </td>
          <td style="vertical-align:top;text-align:right;width:40%">
            <div style="font-size:26px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:2px">${typeLabel}</div>
            <div style="font-size:10px;font-weight:600;color:#888;margin-top:1px;text-transform:uppercase;letter-spacing:1px">${inv.type === 'proforma' ? 'PROFORMA' : 'Original'}</div>
            <div style="font-size:14px;font-weight:700;color:#333;margin-top:6px">N° ${inv.invoiceNumber || '—'}</div>
            <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6">
              <div>Date: ${dateStr}</div>
              <div>Heure: ${timeStr}</div>
            </div>
          </td>
        </tr>
      </table>

      <div style="border-top:2px solid #1a1a1a;margin:16px 0 14px"></div>
      <div style="height:1px;background:#ddd;margin-bottom:16px"></div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px" dir="ltr">
        <tr>
          <td style="vertical-align:top;width:50%">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">${isCustomer ? 'Client' : 'Fournisseur'}</div>
            ${party
              ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(party.name)}</div>
                 ${party.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(party.phone)}</div>` : ''}
                 ${party.address ? `<div style="font-size:11px;color:#666">Adresse: ${escHtml(party.address)}</div>` : ''}`
              : walkinCust
                ? `<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">${escHtml(walkinCust.name)}</div>
                   ${walkinCust.phone ? `<div style="font-size:11px;color:#666">Tél: ${escHtml(walkinCust.phone)}</div>` : ''}
                   ${walkinCust.address ? `<div style="font-size:11px;color:#666">Adresse: ${escHtml(walkinCust.address)}</div>` : ''}`
                : `<div style="font-size:14px;color:#888">${isCustomer ? 'Client non enregistré' : '—'}</div>`
            }
          </td>
          <td style="vertical-align:top;text-align:right;width:50%">
            ${inv.isProvisional || inv.type === 'proforma'
              ? `<div style="font-size:10px;color:#999;font-style:italic">Document sans valeur commerciale</div>`
              : paidAmount >= (inv.totalAmount || 0)
                ? `<div style="display:inline-block;padding:4px 14px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:4px;font-size:11px;font-weight:700">SOLDÉE</div>`
                : paidAmount > 0
                  ? `<div style="display:inline-block;padding:4px 14px;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:4px;font-size:11px;font-weight:700">PARTIELLEMENT SOLDÉE</div>`
                  : paidAmount === 0 && inv.type === 'waybill'
                    ? `<div style="display:inline-block;padding:4px 14px;background:#f5f5f5;color:#888;border:1px solid #ddd;border-radius:4px;font-size:11px;font-weight:700">NON SOLDÉE</div>`
                    : ''
            }
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:12px" dir="ltr">
        <thead>
          <tr style="background:#f2f2f2;border-bottom:2px solid #1a1a1a">
            <th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd">Désignation</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:50px">Qté</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:90px">Prix unitaire</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:90px">Total</th>
          </tr>
        </thead>
        <tbody>
          ${(inv.items || []).map((item, i) => `
            <tr style="${i % 2 === 0 ? 'background:#fafafa' : ''}">
              <td style="padding:7px 10px;border:1px solid #eee;font-size:12px;color:#333">${escHtml(item.name)}</td>
              <td style="padding:7px 10px;border:1px solid #eee;text-align:center;font-size:12px;color:#333">${item.qty}</td>
              <td style="padding:7px 10px;border:1px solid #eee;text-align:right;font-size:12px;color:#333">
                ${(inv.type !== 'waybill' && item.originalPrice && item.originalPrice !== item.price) ? `<span style="text-decoration:line-through;color:#999;font-size:10px">${item.originalPrice.toFixed(2)}</span> ` : ''}
                ${item.price.toFixed(2)} DA
              </td>
              <td style="padding:7px 10px;border:1px solid #eee;text-align:right;font-size:12px;font-weight:600;color:#333">${(item.price * item.qty).toFixed(2)} DA</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-top:10px" dir="ltr">
        <tr>
          <td style="width:60%"></td>
          <td style="width:40%">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr style="border-top:2px solid #1a1a1a">
                <td style="padding:6px 10px;text-align:left;font-weight:800;font-size:15px;color:#1a1a1a">Net à payer</td>
                <td style="padding:6px 10px;text-align:right;font-weight:900;font-size:17px;color:#0066B1">${(inv.totalAmount || 0).toFixed(2)} DA</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${paidAmount > 0 || remaining > 0 ? `
      <div style="margin-top:14px;padding:10px 14px;border-radius:6px;font-size:12px;${paidAmount >= (inv.totalAmount || 0) ? 'background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32' : 'background:#fff3e0;border:1px solid #ffcc80;color:#e65100'}" dir="ltr">
        <strong>Montant payé:</strong> ${paidAmount.toFixed(2)} DA
        ${remaining > 0 ? `&nbsp;|&nbsp; <strong>Reste:</strong> ${remaining.toFixed(2)} DA` : ''}
      </div>` : ''}

      <div style="border-top:2px solid #1a1a1a;margin-top:24px;padding-top:14px">
        <table style="width:100%;border-collapse:collapse" dir="ltr">
          <tr>
            <td style="width:50%;vertical-align:bottom">
              <div style="font-size:10px;color:#888;margin-bottom:4px">${escHtml(store.name)}</div>
              <div style="font-size:9px;color:#999">${store.address ? escHtml(store.address) + '<br>' : ''}Tél: ${store.phone || '—'}</div>
              <div style="font-size:9px;color:#999;margin-top:2px">NIF: — | Facture N° ${inv.invoiceNumber || '—'}</div>
            </td>
            <td style="width:50%;text-align:right;vertical-align:bottom">
              <div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px">Cachet &amp; signature</div>
              <div style="height:50px;margin-top:6px;border-bottom:1px solid #ccc;width:180px;margin-left:auto"></div>
              <div style="font-size:9px;color:#999;margin-top:2px">Lu et approuvé</div>
            </td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin-top:12px;font-size:9px;color:#bbb;letter-spacing:0.5px">
        ${escHtml(store.name)} &middot; ${dateStr} &middot; ${inv.invoiceNumber || '—'}
      </div>
    </div>`;
}

// ===== DETAIL ACTIONS =====

function closeInvDetail() {
  document.getElementById('invDetailModal').style.display = 'none';
  _invDetailId = null;
}

function printInvFromDetail() {
  const content = document.getElementById('invDetailPrintArea');
  if (!content) return;
  const win = window.open('', '', 'width=800,height=600');
  if (!win) { alert(t('invoices.allowPopups')); return; }
  const styles = document.querySelectorAll('link[rel="stylesheet"], style');
  let sh = '';
  styles.forEach(s => sh += s.outerHTML);
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Facture</title>' + sh + '<style>@page{margin:10mm;size:A4}body{margin:0;padding:0;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif}*{box-sizing:border-box}@media print{body{margin:0;padding:0}}</style></head><body>' + content.outerHTML + '<script>window.print();window.close();<\/script></body></html>');
  win.document.close();
}

function showInvPaymentSection() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  if (inv.type === 'transfer_receive') { alert(t('invoices.cannotPayReception')); return; }
  if (inv.isProvisional) { alert(t('invoices.cannotPayProforma')); return; }
  const paid = DB.getInvoicePaidAmount(_invDetailId);
  const remaining = Math.max(0, (inv.totalAmount || 0) - paid);
  if (remaining <= 0) { alert(t('invoices.fullyPaidAlert')); return; }
  document.getElementById('invPayTotal').textContent = 'DA' + (inv.totalAmount || 0).toFixed(2);
  document.getElementById('invPayPaid').textContent = 'DA' + paid.toFixed(2);
  document.getElementById('invPayRemaining').textContent = 'DA' + remaining.toFixed(2);
  document.getElementById('invPayAmount').value = remaining.toFixed(2);
  document.getElementById('invPayModal').style.display = 'flex';
}

function closeInvPay() {
  document.getElementById('invPayModal').style.display = 'none';
}

function confirmInvPayment() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  const paid = DB.getInvoicePaidAmount(_invDetailId);
  const remaining = Math.max(0, (inv.totalAmount || 0) - paid);
  const amount = parseFloat(document.getElementById('invPayAmount').value) || 0;
  if (amount <= 0 || amount > remaining) { alert(t('invoices.invalidAmount')); return; }

  DB.addPayment({
    customerId: inv.customerId || undefined,
    supplierId: inv.supplierId || undefined,
    invoiceId: _invDetailId,
    amount,
    method: (document.getElementById('invPayMethod')?.value) || 'cash',
    note: inv.type === 'transfer' ? t('invoices.transferPayNote') : t('invoices.regularPayNote'),
  });

  // Update balance
  if (inv.customerId) {
    const customers = DB.getCustomers();
    const cIdx = customers.findIndex(c => c.id === inv.customerId);
    if (cIdx !== -1) {
      customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - amount;
      DB.saveCustomers(customers);
    }
  }
  if (inv.supplierId) {
    const suppliers = DB.getSuppliers();
    const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
    if (sIdx !== -1) {
      suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) - amount;
      DB.saveSuppliers(suppliers);
    }
  }

  // Update invoice paidAmount
  const newPaid = paid + amount;
  DB.updateInvoice(_invDetailId, { paidAmount: newPaid });

  // Transfer payment sync: also update receiver's reception invoice
  if (inv.type === 'transfer' && inv.toCode) {
    const raw = DB._getRawData();
    const receiverInvIdx = raw.invoices.findIndex(i =>
      i.storeId === inv.toCode && i.type === 'transfer_receive' && i.date === inv.date
    );
    if (receiverInvIdx !== -1) {
      raw.invoices[receiverInvIdx].paidAmount = newPaid;
      DB._saveRawData(raw);
    }
  }

  closeInvPay();
  showInvDetail(_invDetailId);
  filterInvoices();
  alert(t('invoices.paymentSaved'));
}

var _invEditNewItems = [];
var _invEditNewIdx = 0;

function showInvEditSection() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || !inv.items || inv.items.length === 0) return;
  if (inv.type === 'dispatch') { alert(t('invoices.cannotEditDispatch')); return; }
  if (inv.type === 'transfer_receive') { alert(t('invoices.cannotEditReception')); return; }
  if (inv.type === 'transfer') { showTransferEditSection(inv); return; }
  if (inv.isProvisional && inv.type === 'waybill') { alert(t('invoices.cannotEditProformaWaybill')); return; }

  _invEditNewItems = [];
  _invEditNewIdx = 0;

  const body = document.getElementById('invDetailBody');

  let editHtml = `<div style="padding:20px;direction:rtl;text-align:right">
    <div style="font-size:14px;font-weight:700;color:var(--silver-800);margin-bottom:12px">
      <i class="fas fa-edit"></i> ${t('invoices.editTitle')} — ${inv.invoiceNumber || ''}
    </div>
    <p style="font-size:12px;color:var(--silver-500);margin-bottom:14px">
      ${inv.type === 'supplier' || inv.type === 'purchase'
        ? t('invoices.editHelpSupplier')
        : t('invoices.editHelpCustomer')}
    </p>
    <div style="margin-bottom:14px;padding:10px;background:#f0f7ff;border:1px solid #cce5ff;border-radius:8px;display:flex;gap:8px;align-items:center">
      <i class="fas fa-barcode" style="font-size:18px;color:var(--bmw-blue-1)"></i>
      <input type="text" id="editBarcodeScan" placeholder="${t('invoices.scanPlaceholder')}" dir="ltr" style="flex:1;padding:6px 10px;border:1px solid var(--silver-300);border-radius:4px;font-size:13px" onkeydown="handleEditBarcodeKey(event)">
      <div id="editScanStatus" style="font-size:11px;color:#888">${t('invoices.scanReady')}</div>
    </div>
    <div id="editSearchResults" style="margin-bottom:10px;max-height:150px;overflow-y:auto"></div>
    <table class="data-table">
      <thead><tr>
        <th>${t('invoices.editColProduct')}</th><th>${t('invoices.editColCurrentQty')}</th><th>${t('invoices.editColNewQty')}</th>
      </tr></thead>
      <tbody id="editItemsBody">
        ${inv.items.map((item, i) => `
          <tr>
            <td>${escHtml(item.name)}</td>
            <td style="text-align:center">${item.qty}</td>
            <td style="text-align:center">
              <input type="number" class="no-spinner" id="editQty_${i}" value="${item.qty}" min="0" style="width:70px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-primary" onclick="saveInvEdit()"><i class="fas fa-save"></i> ${t('invoices.saveEdits')}</button>
      <button class="btn" onclick="showInvDetail('${_invDetailId}')">${t('common.cancel')}</button>
    </div>
  </div>`;

  body.innerHTML = editHtml;
  document.getElementById('invDetailFooter').style.display = 'none';
  setTimeout(() => {
    const scanInput = document.getElementById('editBarcodeScan');
    if (scanInput) scanInput.focus();
  }, 200);
}

function handleEditBarcodeKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('editBarcodeScan');
    const q = input.value.trim();
    if (!q) return;
    const status = document.getElementById('editScanStatus');
    const prod = DB.getProductByBarcode(q);
    if (prod) {
      addEditProduct(prod.id);
      status.textContent = t('invoices.scanDone');
      status.style.color = '#28a745';
      input.value = '';
      setTimeout(() => { status.textContent = t('invoices.scanReady'); status.style.color = '#888'; }, 1500);
    } else {
      // Search by name
      const matches = DB.getProducts().filter(p =>
        p.name.toLowerCase().includes(q.toLowerCase())
      );
      const results = document.getElementById('editSearchResults');
      if (matches.length === 0) {
        status.textContent = t('invoices.scanNotFound');
        status.style.color = '#e65100';
        setTimeout(() => { status.textContent = t('invoices.scanReady'); status.style.color = '#888'; }, 1500);
      } else {
        status.textContent = `${matches.length} ${t('invoices.resultCount')}`;
        results.innerHTML = matches.slice(0, 10).map(p =>
          `<div class="search-result-item" onclick="addEditProduct('${p.id}');document.getElementById('editSearchResults').innerHTML='';document.getElementById('editBarcodeScan').value=''">
            <strong>${escHtml(p.name)}</strong>
            <span class="text-muted">${p.barcode} | ${t('invoices.availableStock')} ${p.quantity}</span>
          </div>`
        ).join('');
      }
      input.value = '';
    }
  }
}

function addEditProduct(productId) {
  const prod = DB.getProduct(productId);
  if (!prod) return;
  const inv = DB.getInvoice(_invDetailId);
  const isSupplier = inv && (inv.type === 'supplier' || inv.type === 'purchase');
  if (!isSupplier && prod.quantity <= 0) { alert(`"${prod.name}" ${t('invoices.notInStock')}`); return; }

  const idx = _invEditNewIdx++;
  const price = isSupplier ? (prod.buyPrice || 0) : (prod.sellPrice || 0);
  _invEditNewItems.push({ _idx: idx, productId: prod.id, barcode: prod.barcode, name: prod.name, price, qty: 1, originalPrice: price, discount: 0 });

  const tbody = document.getElementById('editItemsBody');
  const row = document.createElement('tr');
  row.id = `editNewRow_${idx}`;
  row.innerHTML = `
    <td>${escHtml(prod.name)} <span style="font-size:10px;color:var(--bmw-blue-1);font-weight:600">(${t('invoices.badgeNew')})</span></td>
    <td style="text-align:center">—</td>
    <td style="text-align:center">
      <input type="number" class="no-spinner" id="editNewQty_${idx}" value="1" min="1" style="width:70px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px">
      <button class="btn btn-sm btn-danger" onclick="removeEditNewItem(${idx})" style="margin-right:4px;padding:2px 6px;font-size:10px"><i class="fas fa-times"></i></button>
    </td>`;
  tbody.appendChild(row);
}

function removeEditNewItem(idx) {
  const row = document.getElementById(`editNewRow_${idx}`);
  if (row) row.remove();
  _invEditNewItems = _invEditNewItems.filter(it => it._idx !== idx);
}

function saveInvEdit() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || !inv.items) return;

  const isProvisional = inv.isProvisional;

  const changes = [];
  let totalChanged = false;
  let newTotalAmount = 0;
  const updatedItems = [];

  // Process existing items
  for (let i = 0; i < inv.items.length; i++) {
    const item = inv.items[i];
    const input = document.getElementById('editQty_' + i);
    if (!input) { updatedItems.push(item); newTotalAmount += item.price * item.qty; continue; }
    let newQty = parseInt(input.value);
    if (isNaN(newQty) || newQty < 0) newQty = item.qty;
    const diff = newQty - item.qty;

    if (diff !== 0 && !isProvisional) {
      const prod = DB.getProduct(item.productId);
      if (!prod) { updatedItems.push(item); newTotalAmount += item.price * item.qty; continue; }

      if (inv.type === 'supplier' || inv.type === 'purchase') {
        if (diff > 0) {
          DB.updateProduct(item.productId, { quantity: (prod.quantity || 0) + diff });
        } else {
          const newQty = (prod.quantity || 0) - Math.abs(diff);
          if (newQty < 0) {
            alert(t('invoices.cannotBelowZero').replace('...', item.name));
            return;
          }
          DB.updateProduct(item.productId, { quantity: newQty });
        }
      } else {
        if (diff > 0) {
          if (prod.quantity < diff) {
            alert(t('invoices.insufficientStock').replace('...', item.name));
            return;
          }
          DB.updateProduct(item.productId, { quantity: prod.quantity - diff });
        } else {
          DB.updateProduct(item.productId, { quantity: prod.quantity + Math.abs(diff) });
          DB.addReturn({
            invoiceId: _invDetailId,
            productId: item.productId,
            productName: item.name,
            qty: Math.abs(diff),
            reason: 'تعديل فاتورة (نقص كمية)',
          });
        }
      }
    }

    const newTotal = item.price * newQty;
    updatedItems.push({ ...item, qty: newQty, total: newTotal });
    newTotalAmount += newTotal;
    if (diff !== 0) { changes.push({ name: item.name, oldQty: item.qty, newQty, diff }); totalChanged = true; }
  }

  // Process new items added during edit
  for (const newItem of _invEditNewItems) {
    const qtyInput = document.getElementById('editNewQty_' + newItem._idx);
    const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : newItem.qty;
    const prod = DB.getProduct(newItem.productId);
    if (!prod) continue;

    if (!isProvisional) {
      if (inv.type === 'supplier' || inv.type === 'purchase') {
        DB.updateProduct(newItem.productId, { quantity: (prod.quantity || 0) + qty });
      } else {
        if (prod.quantity < qty) {
          alert(t('invoices.insufficientStock').replace('...', newItem.name));
          return;
        }
        DB.updateProduct(newItem.productId, { quantity: prod.quantity - qty });
      }
    }

    const fallbackPrice = (inv.type === 'supplier' || inv.type === 'purchase') ? (prod.buyPrice || 0) : (prod.sellPrice || 0);
    const total = (newItem.price || fallbackPrice) * qty;
    updatedItems.push({
      productId: newItem.productId,
      barcode: newItem.barcode,
      name: newItem.name,
      qty,
      price: newItem.price || fallbackPrice,
      total,
      originalPrice: newItem.originalPrice || fallbackPrice,
      discount: 0,
    });
    newTotalAmount += total;
    changes.push({ name: newItem.name, oldQty: 0, newQty: qty, diff: qty });
    totalChanged = true;
  }

  _invEditNewItems = [];

  if (!totalChanged) {
    alert(t('invoices.noQtyChanged'));
    return;
  }

  // Update invoice
  const oldTotal = inv.totalAmount;
  inv.totalAmount = newTotalAmount;
  const isSaleEdit = inv.type !== 'supplier' && inv.type !== 'purchase';
  const paidBefore = DB.getInvoicePaidAmount(_invDetailId);
  if (isSaleEdit) DB.reduceInvoicePayments(_invDetailId, newTotalAmount);
  const actualPaid = DB.getInvoicePaidAmount(_invDetailId);
  if (actualPaid > newTotalAmount) inv.paidAmount = newTotalAmount;
  else inv.paidAmount = actualPaid;

  const updateData = { items: updatedItems, totalAmount: newTotalAmount, paidAmount: inv.paidAmount };
  if (inv.type !== 'supplier' && inv.type !== 'purchase') {
    const newProfit = updatedItems.reduce((s, item) => {
      const prod = DB.getProduct(item.productId);
      const buyPrice = prod ? (prod.buyPrice || 0) : 0;
      return s + ((item.price - buyPrice) * item.qty);
    }, 0);
    updateData.profit = newProfit;
  }
  if (inv.timbreFiscal !== undefined) {
    const tRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
    let newTimbre = newTotalAmount * (tRate / 100);
    if (newTimbre < 5) newTimbre = 5;
    if (newTimbre > 10000) newTimbre = 10000;
    updateData.timbreFiscal = newTimbre;
  }
  DB.updateInvoice(_invDetailId, updateData);

  // Update customer/supplier balance if total changed
  if (oldTotal !== newTotalAmount) {
    const diff = newTotalAmount - oldTotal;
    const balanceChange = (isSaleEdit && newTotalAmount < paidBefore) ? (paidBefore - oldTotal) : diff;
    if (inv.customerId) {
      const customers = DB.getCustomers();
      const cIdx = customers.findIndex(c => c.id === inv.customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + balanceChange;
        DB.saveCustomers(customers);
      }
    }
    if (inv.supplierId) {
      const suppliers = DB.getSuppliers();
      const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
      if (sIdx !== -1) {
        suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) + diff;
        DB.saveSuppliers(suppliers);
      }
    }
  }

  document.getElementById('invDetailFooter').style.display = 'flex';
  showInvDetail(_invDetailId);
  filterInvoices();
  alert(t('invoices.invoiceEdited'));
}

function deleteInvoiceFromDetail() {
  if (!_invDetailId) return;
  if (!confirm(t('invoices.deleteConfirm'))) return;

  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  if (inv.type === 'transfer_receive') { alert(t('invoices.cannotDeleteReception')); return; }

  // Prevent deleting supplier/purchase invoices if any product has been sold
  if (inv.type === 'supplier' || inv.type === 'purchase') {
    const allInvoices = DB.getInvoices();
    for (const item of (inv.items || [])) {
      const sold = allInvoices.some(other =>
        other.id !== _invDetailId &&
        (other.type === 'customer' || other.type === 'waybill' || other.type === 'dispatch') &&
        other.items &&
        other.items.some(oi => oi.productId === item.productId)
      );
      if (sold) {
        alert(t('invoices.cannotDeleteSold').replace('...', item.name));
        return;
      }
    }
  }

  // Rollback inventory (skip for provisional & dispatch)
  if (inv.type === 'transfer') {
    // Transfer: reverse inventory in both sender and receiver using raw data
    const raw = DB._getRawData();
    const allProducts = raw.products || [];

    // Return products to sender (add back)
    (inv.items || []).forEach(item => {
      const idx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.fromCode);
      if (idx !== -1) {
        allProducts[idx].quantity += item.qty;
        allProducts[idx].updatedAt = Date.now();
      } else {
        allProducts.push({
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          name: item.name, barcode: item.barcode || DB.generateBarcode(),
          brandId: '', category: '', buyPrice: item.price, sellPrice: item.price,
          quantity: item.qty, storeId: inv.fromCode,
          createdAt: Date.now(), updatedAt: Date.now(),
        });
      }
    });

    // Remove products from receiver (subtract)
    (inv.items || []).forEach(item => {
      const idx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.toCode);
      if (idx !== -1) {
        allProducts[idx].quantity -= item.qty;
        allProducts[idx].updatedAt = Date.now();
        if (allProducts[idx].quantity <= 0) allProducts.splice(idx, 1);
      }
    });

    // Also delete the corresponding reception invoice in receiver's data
    const receiverInvIdx = raw.invoices.findIndex(i => i.storeId === inv.toCode && i.type === 'transfer_receive' && i.date === inv.date);
    if (receiverInvIdx !== -1) raw.invoices.splice(receiverInvIdx, 1);

    raw.products = allProducts;
    DB._saveRawData(raw);
  } else if (!inv.isProvisional && inv.type !== 'dispatch') {
    (inv.items || []).forEach(item => {
      const prod = DB.getProduct(item.productId);
      if (prod) {
        if (inv.type === 'customer' || inv.type === 'waybill') {
          DB.updateProduct(item.productId, { quantity: prod.quantity + item.qty });
        } else {
          const newQty = prod.quantity - item.qty;
          if (newQty <= 0) DB.deleteProduct(item.productId);
          else DB.updateProduct(item.productId, { quantity: newQty });
        }
      }
    });
  }

  const payments = DB.getInvoicePayments(_invDetailId);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  DB.deletePaymentsByInvoice(_invDetailId);
  DB.deleteReturnsByInvoice(_invDetailId);
  DB.deleteDiscountsByInvoice(_invDetailId);

  if (!inv.isProvisional) {
    if (inv.type === 'dispatch') {
      // Dispatch: reverse the original balance effect
      if (inv.supplierId) {
        const suppliers = DB.getSuppliers();
        const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
        if (sIdx !== -1) {
          // At creation we subtracted totalAmount → add it back
          suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) + (inv.totalAmount || 0);
          DB.saveSuppliers(suppliers);
        }
      }
      if (inv.customerId) {
        const customers = DB.getCustomers();
        const cIdx = customers.findIndex(c => c.id === inv.customerId);
        if (cIdx !== -1) {
          // At creation we added (totalAmount - payAmount) → remove unpaid portion
          customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - ((inv.totalAmount || 0) - totalPaid);
          DB.saveCustomers(customers);
        }
      }
    } else {
      // Regular invoices
      if (inv.supplierId) {
        const suppliers = DB.getSuppliers();
        const sIdx = suppliers.findIndex(s => s.id === inv.supplierId);
        if (sIdx !== -1) {
          suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) - ((inv.totalAmount || 0) - totalPaid);
          DB.saveSuppliers(suppliers);
        }
      }
      if (inv.customerId) {
        const customers = DB.getCustomers();
        const cIdx = customers.findIndex(c => c.id === inv.customerId);
        if (cIdx !== -1) {
          customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) - ((inv.totalAmount || 0) - totalPaid);
          DB.saveCustomers(customers);
        }
      }
    }
  }

  // Also delete receiver's reception invoice + its payments (for transfer invoices)
  if (inv.type === 'transfer' && inv.toCode) {
    const raw2 = DB._getRawData();
    const receiverInvIdx2 = raw2.invoices.findIndex(i =>
      i.storeId === inv.toCode && i.type === 'transfer_receive' && i.date === inv.date
    );
    if (receiverInvIdx2 !== -1) {
      const receiverInvId = raw2.invoices[receiverInvIdx2].id;
      raw2.invoices.splice(receiverInvIdx2, 1);
      DB._saveRawData(raw2);
      DB.deletePaymentsByInvoice(receiverInvId);
    } else {
      DB._saveRawData(raw2);
    }
  }

  DB.deleteInvoice(_invDetailId);
  closeInvDetail();
  _invAllInvoices = DB.getInvoices().sort((a, b) => b.createdAt - a.createdAt);
  filterInvoices();
  alert(t('invoices.invoiceDeleted'));
}

// ===== TRANSFER INVOICE EDIT =====

function showTransferEditSection(inv) {
  const body = document.getElementById('invDetailBody');
  const brands = [...BRANDS.global, ...BRANDS.chinese];

  let editHtml = `<div style="padding:20px;direction:rtl;text-align:right">
    <div style="font-size:14px;font-weight:700;color:var(--silver-800);margin-bottom:12px">
      <i class="fas fa-exchange-alt"></i> ${t('invoices.transferEditTitle')} — ${inv.invoiceNumber || ''}
    </div>
    <p style="font-size:12px;color:var(--silver-500);margin-bottom:14px">
      ${t('invoices.transferEditHelp')}
    </p>
    <div style="padding:10px;background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;margin-bottom:14px;font-size:12px;color:#e65100">
      <i class="fas fa-exclamation-triangle" style="margin-left:4px"></i>
      من: ${escHtml(inv.toName || inv.toCode)} | ${t('invoices.currentTotal')} DA${(inv.totalAmount || 0).toFixed(2)}
    </div>
    <table class="data-table">
      <thead><tr>
        <th>${t('invoices.editColProduct')}</th><th>${t('invoices.editColCurrentQty')}</th><th>${t('invoices.editColNewQty')}</th><th>${t('invoices.editColSellPrice')}</th>
      </tr></thead>
      <tbody id="editItemsBody">
        ${inv.items.map((item, i) => {
          const brand = brands.find(b => b.name === item.name || b.id === item.brandId);
          return `<tr>
            <td>${escHtml(item.name)}</td>
            <td style="text-align:center"><strong>${item.qty}</strong></td>
            <td style="text-align:center">
              <input type="number" class="no-spinner" id="editQty_${i}" value="${item.qty}" min="0" style="width:70px;text-align:center;padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px" onchange="updateTransferEditTotal()">
            </td>
            <td style="text-align:center">DA${item.price.toFixed(2)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div id="transferEditSummary" style="margin-top:14px;padding:12px;background:#f0f7ff;border:1px solid #cce5ff;border-radius:8px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span>${t('invoices.newTotal')}</span>
        <strong id="transferEditNewTotal">DA${(inv.totalAmount || 0).toFixed(2)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span>${t('invoices.diff')}</span>
        <strong id="transferEditDiff" style="color:#666">0 DA</strong>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-primary" onclick="saveTransferEdit()"><i class="fas fa-save"></i> ${t('invoices.saveEdits')}</button>
      <button class="btn" onclick="showInvDetail('${_invDetailId}')">${t('common.cancel')}</button>
    </div>
  </div>`;

  body.innerHTML = editHtml;
  document.getElementById('invDetailFooter').style.display = 'none';
}

function updateTransferEditTotal() {
  const inv = DB.getInvoice(_invDetailId);
  if (!inv) return;
  let newTotal = 0;
  inv.items.forEach((item, i) => {
    const input = document.getElementById('editQty_' + i);
    const qty = input ? (parseInt(input.value) || 0) : item.qty;
    newTotal += qty * item.price;
  });
  const diff = newTotal - (inv.totalAmount || 0);
  document.getElementById('transferEditNewTotal').textContent = 'DA' + newTotal.toFixed(2);
  const diffEl = document.getElementById('transferEditDiff');
  if (diff > 0) {
    diffEl.textContent = '+' + diff.toFixed(2) + ' DA';
    diffEl.style.color = '#c62828';
  } else if (diff < 0) {
    diffEl.textContent = diff.toFixed(2) + ' DA';
    diffEl.style.color = '#388e3c';
  } else {
    diffEl.textContent = '0 DA';
    diffEl.style.color = '#666';
  }
}

function saveTransferEdit() {
  if (!_invDetailId) return;
  const inv = DB.getInvoice(_invDetailId);
  if (!inv || inv.type !== 'transfer') return;

  const raw = DB._getRawData();
  const allProducts = raw.products || [];
  let totalChanged = false;
  let newTotalAmount = 0;
  const updatedItems = [];

  for (let i = 0; i < inv.items.length; i++) {
    const item = inv.items[i];
    const input = document.getElementById('editQty_' + i);
    const newQty = input ? Math.max(0, parseInt(input.value) || 0) : item.qty;
    const diff = newQty - item.qty;

    if (diff !== 0) {
      totalChanged = true;
      if (diff > 0) {
        // Increase: deduct MORE from sender, add MORE to receiver
        const senderIdx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.fromCode);
        if (senderIdx !== -1) {
          if (allProducts[senderIdx].quantity < diff) {
            alert(t('invoices.insufficientStock').replace('...', item.name));
            return;
          }
          allProducts[senderIdx].quantity -= diff;
          allProducts[senderIdx].updatedAt = Date.now();
          if (allProducts[senderIdx].quantity <= 0) allProducts.splice(senderIdx, 1);
        }
        const recvIdx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.toCode);
        if (recvIdx !== -1) {
          allProducts[recvIdx].quantity += diff;
          allProducts[recvIdx].updatedAt = Date.now();
        } else {
          allProducts.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: item.name, barcode: DB.generateBarcode(),
            brandId: '', category: '', buyPrice: item.price, sellPrice: item.price,
            quantity: diff, storeId: inv.toCode,
            createdAt: Date.now(), updatedAt: Date.now(),
          });
        }
      } else {
        // Decrease: add back to sender, remove from receiver
        const absDiff = Math.abs(diff);
        const senderIdx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.fromCode);
        if (senderIdx !== -1) {
          allProducts[senderIdx].quantity += absDiff;
          allProducts[senderIdx].updatedAt = Date.now();
        } else {
          allProducts.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: item.name, barcode: item.barcode || DB.generateBarcode(),
            brandId: '', category: '', buyPrice: item.price, sellPrice: item.price,
            quantity: absDiff, storeId: inv.fromCode,
            createdAt: Date.now(), updatedAt: Date.now(),
          });
        }
        const recvIdx = allProducts.findIndex(p => p.name === item.name && p.storeId === inv.toCode);
        if (recvIdx !== -1) {
          allProducts[recvIdx].quantity -= absDiff;
          allProducts[recvIdx].updatedAt = Date.now();
          if (allProducts[recvIdx].quantity <= 0) allProducts.splice(recvIdx, 1);
        }
      }
    }

    const newTotal = newQty * item.price;
    updatedItems.push({ ...item, qty: newQty, total: newTotal });
    newTotalAmount += newTotal;
  }

  if (!totalChanged) {
    alert(t('invoices.noQtyChanged'));
    return;
  }

  // Update sender's transfer invoice
  DB.updateInvoice(_invDetailId, { items: updatedItems, totalAmount: newTotalAmount });

  // Update receiver's reception invoice
  const receiverInvIdx = raw.invoices.findIndex(i =>
    i.storeId === inv.toCode && i.type === 'transfer_receive' && i.date === inv.date
  );
  if (receiverInvIdx !== -1) {
    const oldPaid = raw.invoices[receiverInvIdx].paidAmount || 0;
    raw.invoices[receiverInvIdx].items = updatedItems;
    raw.invoices[receiverInvIdx].totalAmount = newTotalAmount;
    raw.invoices[receiverInvIdx].paidAmount = Math.min(oldPaid, newTotalAmount);
  }

  // Save products
  raw.products = allProducts;
  DB._saveRawData(raw);

  // Update transfer record
  const transfers = DB.getTransfers();
  const tIdx = transfers.findIndex(t => t.id === inv.id);
  if (tIdx !== -1) {
    transfers[tIdx].totalAmount = newTotalAmount;
    transfers[tIdx].items = updatedItems.map(it => ({
      name: it.name, qty: it.qty, price: it.price,
    }));
    DB.saveTransfers(transfers);
  }

  document.getElementById('invDetailFooter').style.display = 'flex';
  showInvDetail(_invDetailId);
  filterInvoices();
  alert(t('invoices.invoiceEdited'));
}

// ===== WAYBILL FORM (Bon de livraison) =====

var _wbCart = [];
var _wbCustomerId = null;
var _wbAllProducts = [];
var _wbFormType = 'waybill'; // 'waybill' or 'proforma'

function showWaybillForm(type) {
  _wbFormType = type || 'waybill';
  _wbCart = [];
  _wbCustomerId = null;
  _wbAllProducts = DB.getProducts();
  document.getElementById('wbCustSearch').value = '';
  document.getElementById('wbCustResults').innerHTML = '';
  document.getElementById('wbCustBadge').style.display = 'none';
  document.getElementById('wbWalkinFields').style.display = 'none';
  document.getElementById('wbProdSearch').value = '';
  document.getElementById('wbExtraDisc').value = '0';
  document.getElementById('wbTimbreCheck').checked = false;
  document.getElementById('wbPayAmount').value = '0';

  if (type === 'proforma') {
    // Proforma is always provisional, hide registration mode
    document.getElementById('wbRegSection').style.display = 'none';
    document.getElementById('wbFormIcon').className = 'fas fa-file-alt';
    document.getElementById('wbFormTitleText').textContent = t('invoices.typeProforma') + ' — Facture Proforma';
    document.getElementById('wbConfirmBtnLabel').textContent = 'تسجيل الفاتورة الشكلية';
  } else {
    document.getElementById('wbRegSection').style.display = 'flex';
    document.getElementById('wbFormIcon').className = 'fas fa-truck';
    document.getElementById('wbFormTitleText').textContent = t('invoices.typeWaybill') + ' — Bon de livraison';
    document.getElementById('wbConfirmBtnLabel').textContent = 'تسجيل الفاتورة';
    document.querySelector('input[name="wbRegMode"][value="real"]').checked = true;
  }

  renderWbProducts();
  renderWbCart();
  updateWbTotals();
  document.getElementById('waybillFormModal').style.display = 'flex';
}

function closeWaybillForm() {
  document.getElementById('waybillFormModal').style.display = 'none';
}

// ===== WAYBILL CUSTOMER =====

function searchWbCustomer(q) {
  const results = document.getElementById('wbCustResults');
  q = normSearch(q);
  const customers = DB.getCustomers();
  const matches = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone && c.phone.includes(q))
      ).slice(0, 8)
    : customers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">لا توجد نتائج</div>'
    : matches.map(c => `<div class="search-result-item" onclick="selectWbCustomer('${c.id}')">
        <strong>${escHtml(c.name)}</strong>
        <span class="text-muted">${c.phone || ''}</span>
      </div>`).join('');
}

function selectWbCustomer(id) {
  const c = DB.getCustomer(id);
  if (!c) return;
  _wbCustomerId = c.id;
  document.getElementById('wbCustSearch').value = c.name;
  document.getElementById('wbCustResults').innerHTML = '';
  document.getElementById('wbCustBadge').style.display = '';
  document.getElementById('wbCustNameLabel').textContent = c.name;
  document.getElementById('wbCustPhoneLabel').textContent = c.phone || '';
  document.getElementById('wbWalkinFields').style.display = 'none';
}

function setWbWalkin() {
  _wbCustomerId = null;
  document.getElementById('wbCustSearch').value = '';
  document.getElementById('wbCustResults').innerHTML = '';
  document.getElementById('wbCustBadge').style.display = 'none';
  document.getElementById('wbWalkinFields').style.display = '';
  document.getElementById('wbWalkinName').focus();
}

function clearWbCustomer() {
  _wbCustomerId = null;
  document.getElementById('wbCustBadge').style.display = 'none';
  document.getElementById('wbCustSearch').value = '';
  document.getElementById('wbCustResults').innerHTML = '';
  document.getElementById('wbWalkinFields').style.display = 'none';
}

function getWbCustomerData() {
  if (_wbCustomerId) {
    const c = DB.getCustomer(_wbCustomerId);
    return c ? { id: c.id, name: c.name, phone: c.phone, address: c.address } : null;
  }
  const name = document.getElementById('wbWalkinName').value.trim();
  if (!name) { alert('الرجاء إدخال اسم العميل'); return null; }
  return {
    id: null,
    name,
    phone: document.getElementById('wbWalkinPhone').value.trim(),
    address: document.getElementById('wbWalkinAddress').value.trim(),
  };
}

// ===== WAYBILL PRODUCTS =====

function filterWbProducts(q) {
  renderWbProducts(q);
}

function renderWbProducts(filter) {
  const grid = document.getElementById('wbProductGrid');
  let list = _wbAllProducts;
  const f = normSearch(filter || '').toLowerCase();
  if (f) {
    list = list.filter(p => p.name.toLowerCase().includes(f) || p.barcode.includes(f));
  }
  if (list.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--silver-500)">لا توجد منتجات</div>';
    return;
  }
  grid.innerHTML = list.map(p => {
    const inCart = _wbCart.find(i => i.productId === p.id);
    return `<div class="wb-prod-card" onclick="${p.quantity > 0 ? `addToWbCart('${p.id}')` : ''}" title="${p.quantity <= 0 ? 'غير متوفر' : ''}" style="${p.quantity <= 0 ? 'opacity:0.4;cursor:not-allowed' : ''}">
      <div class="wb-prod-name">${escHtml(p.name)}</div>
      <div class="wb-prod-bar">${p.barcode}</div>
      <div class="wb-prod-footer">
        <span class="wb-prod-price">DA${p.sellPrice.toFixed(2)}</span>
        <span class="wb-prod-qty">${p.quantity}</span>
      </div>
      ${inCart ? '<div style="font-size:10px;color:var(--bmw-blue-1);font-weight:600">✓ في السلة</div>' : ''}
    </div>`;
  }).join('');
}

function addToWbCart(productId) {
  const prod = DB.getProduct(productId);
  if (!prod || prod.quantity <= 0) return;
  const existing = _wbCart.findIndex(i => i.productId === productId);
  if (existing !== -1) {
    _wbCart[existing].qty++;
    _wbCart[existing].total = _wbCart[existing].qty * _wbCart[existing].price;
  } else {
    _wbCart.push({
      productId: prod.id,
      name: prod.name,
      barcode: prod.barcode,
      qty: 1,
      price: prod.sellPrice,
      total: prod.sellPrice,
      originalPrice: prod.sellPrice,
    });
  }
  renderWbCart();
  updateWbTotals();
  renderWbProducts(document.getElementById('wbProdSearch').value);
  document.getElementById('wbProdSearch').focus();
}

function removeFromWbCart(idx) {
  _wbCart.splice(idx, 1);
  renderWbCart();
  updateWbTotals();
  renderWbProducts(document.getElementById('wbProdSearch').value);
}

function renderWbCart() {
  const items = document.getElementById('wbCartItems');
  const empty = document.getElementById('wbCartEmpty');
  const count = document.getElementById('wbCartCount');
  if (_wbCart.length === 0) {
    items.innerHTML = '';
    empty.style.display = '';
    if (count) count.textContent = '0';
    return;
  }
  empty.style.display = 'none';
  if (count) count.textContent = _wbCart.length;
  items.innerHTML = _wbCart.map((item, i) => `
    <div class="wb-cart-item">
      <div class="wb-cart-item-info">
        <div class="wb-cart-item-name">${escHtml(item.name)}</div>
        <div class="wb-cart-item-bar">${item.barcode}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="sc-qty-btn" onclick="decWbCartQty(${i})" ${item.qty <= 1 ? 'disabled' : ''}>−</button>
        <input type="number" class="no-spinner" value="${item.qty}" min="1" style="width:40px;text-align:center;padding:2px 4px;border:1px solid var(--silver-300);border-radius:4px;font-size:13px;font-weight:600" onchange="updateWbCartQty(${i},this.value)">
        <button class="sc-qty-btn" onclick="incWbCartQty(${i})">+</button>
        <input type="number" class="no-spinner" value="${item.price.toFixed(2)}" min="0" step="0.01" style="width:80px;text-align:center;padding:2px 4px;border:1px solid var(--silver-300);border-radius:4px;font-size:12px;font-weight:600" onchange="updateWbCartPrice(${i},this.value)">
        <span style="font-size:11px;color:var(--silver-500)">DA</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:14px;font-weight:700;color:var(--bmw-blue-1);min-width:70px;text-align:right">DA${(item.qty * item.price).toFixed(2)}</span>
        <button class="sc-item-remove" onclick="removeFromWbCart(${i})"><i class="fas fa-times"></i></button>
      </div>
    </div>
  `).join('');
}

function incWbCartQty(idx) {
  _wbCart[idx].qty++;
  _wbCart[idx].total = _wbCart[idx].qty * _wbCart[idx].price;
  renderWbCart();
  updateWbTotals();
}

function decWbCartQty(idx) {
  if (_wbCart[idx].qty > 1) {
    _wbCart[idx].qty--;
    _wbCart[idx].total = _wbCart[idx].qty * _wbCart[idx].price;
    renderWbCart();
    updateWbTotals();
  }
}

function updateWbCartQty(idx, val) {
  const qty = parseInt(val) || 1;
  _wbCart[idx].qty = Math.max(1, qty);
  _wbCart[idx].total = _wbCart[idx].qty * _wbCart[idx].price;
  renderWbCart();
  updateWbTotals();
}

function updateWbCartPrice(idx, val) {
  const price = parseFloat(val) || 0;
  _wbCart[idx].price = price;
  _wbCart[idx].total = _wbCart[idx].qty * price;
  renderWbCart();
  updateWbTotals();
}

// ===== WAYBILL TOTALS =====

function updateWbTotals() {
  const subtotal = _wbCart.reduce((s, i) => s + i.total, 0);
  const extraDisc = Math.min(parseFloat(document.getElementById('wbExtraDisc').value) || 0, subtotal);
  const afterDisc = subtotal - extraDisc;
  const timbreEnabled = document.getElementById('wbTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = afterDisc * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const total = afterDisc + timbreAmount;

  document.getElementById('wbSubtotal').textContent = 'DA' + subtotal.toFixed(2);
  const discRow = document.getElementById('wbDiscRow');
  const timbreRow = document.getElementById('wbTimbreRow');
  if (extraDisc > 0) {
    discRow.hidden = false;
    document.getElementById('wbDiscAmount').textContent = '-DA' + extraDisc.toFixed(2);
  } else {
    discRow.hidden = true;
  }
  if (timbreEnabled) {
    timbreRow.hidden = false;
    document.getElementById('wbTimbreAmount').textContent = 'DA' + timbreAmount.toFixed(2);
  } else {
    timbreRow.hidden = true;
  }
  document.getElementById('wbTotal').textContent = 'DA' + total.toFixed(2);
  updateWbPayRemaining();
}

function updateWbPayRemaining() {
  const totalEl = document.getElementById('wbTotal');
  const total = parseFloat(totalEl.textContent.replace('DA', '')) || 0;
  const paid = parseFloat(document.getElementById('wbPayAmount').value) || 0;
  const remaining = Math.max(0, total - paid);
  const el = document.getElementById('wbPayRemaining');
  if (paid >= total) {
    el.textContent = 'مدفوعة كلياً ✓';
    el.style.color = '#28a745';
  } else if (paid > 0) {
    el.textContent = 'الباقي: DA' + remaining.toFixed(2);
    el.style.color = '#e65100';
  } else {
    el.textContent = '';
  }
}

function setWbFullPay() {
  const totalEl = document.getElementById('wbTotal');
  const total = parseFloat(totalEl.textContent.replace('DA', '')) || 0;
  document.getElementById('wbPayAmount').value = total.toFixed(2);
  updateWbPayRemaining();
}

// ===== WAYBILL CONFIRM =====

function confirmWaybill() {
  if (_wbCart.length === 0) { alert('السلة فارغة'); return; }

  const custData = getWbCustomerData();
  if (!custData) return;

  const isProvisional = _wbFormType === 'proforma' || document.querySelector('input[name="wbRegMode"]:checked').value === 'provisional';
  const subtotal = _wbCart.reduce((s, i) => s + i.total, 0);
  const extraDisc = Math.min(parseFloat(document.getElementById('wbExtraDisc').value) || 0, subtotal);
  const afterDisc = subtotal - extraDisc;
  const timbreEnabled = document.getElementById('wbTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = afterDisc * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const totalAmount = afterDisc + timbreAmount;
  const paidAmount = Math.min(parseFloat(document.getElementById('wbPayAmount').value) || 0, totalAmount);

  // Create or get customer
  let customerId = _wbCustomerId;
  let walkinName, walkinPhone, walkinAddress;

  if (isProvisional) {
    // For provisional/proforma, store customer info directly (never create DB customer)
    customerId = null;
    if (_wbCustomerId) {
      const c = DB.getCustomer(_wbCustomerId);
      if (c) { walkinName = c.name; walkinPhone = c.phone; walkinAddress = c.address; }
    } else {
      walkinName = custData.name; walkinPhone = custData.phone; walkinAddress = custData.address;
    }
  } else {
    // Real waybill: create customer if walk-in
    if (!customerId && custData.name) {
      const newCust = DB.addCustomer({
        name: custData.name,
        phone: custData.phone || '',
        address: custData.address || '',
        discount: 0,
      });
      customerId = newCust.id;
    }
  }

  // Build items
  const items = _wbCart.map(item => ({
    productId: item.productId,
    barcode: item.barcode,
    name: item.name,
    qty: item.qty,
    price: item.price,
    total: item.qty * item.price,
    originalPrice: item.originalPrice || item.price,
    discount: 0,
  }));

  // Check stock & deduct inventory only if REAL
  if (!isProvisional) {
    for (const item of items) {
      const prod = DB.getProduct(item.productId);
      if (!prod) continue;
      if (prod.quantity < item.qty) {
        alert(t('invoices.insufficientStock').replace('...', item.name));
        return;
      }
    }
    items.forEach(item => {
      const prod = DB.getProduct(item.productId);
      if (prod) {
        DB.updateProduct(item.productId, { quantity: prod.quantity - item.qty });
      }
    });
  }

  // Calculate waybill profit
  const waybillProfit = items.reduce((s, item) => {
    const prod = DB.getProduct(item.productId);
    const buyPrice = prod ? (prod.buyPrice || 0) : 0;
    return s + ((item.price - buyPrice) * item.qty);
  }, 0);

  // Add invoice
  const inv = DB.addInvoice({
    customerId: isProvisional ? null : (customerId || null),
    type: _wbFormType,
    date: Date.now(),
    items,
    totalAmount,
    customerDiscount: 0,
    extraDiscount: extraDisc,
    timbreFiscal: timbreAmount,
    isProvisional,
    profit: waybillProfit,
    ...(isProvisional ? { walkinName, walkinPhone, walkinAddress } : {}),
  });

  // Payment only if REAL
  if (paidAmount > 0 && !isProvisional) {
    DB.addPayment({
      customerId: customerId || null,
      invoiceId: inv.id,
      amount: paidAmount,
      note: paidAmount >= totalAmount ? 'دفع كامل عند التسليم' : 'دفع جزئي عند التسليم',
    });
  }

  // Customer balance only if REAL and not fully paid
  if (!isProvisional && customerId) {
    const remaining = totalAmount - paidAmount;
    if (remaining > 0) {
      const customers = DB.getCustomers();
      const cIdx = customers.findIndex(c => c.id === customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + remaining;
        DB.saveCustomers(customers);
      }
    }
  }

  closeWaybillForm();

  // Show invoice preview
  const typeLabel = _wbFormType === 'proforma' ? t('invoices.typeProforma') : t('invoices.typeWaybill');
  if (typeof showInvoicePreview === 'function') {
    showInvoicePreview(inv);
  } else {
    alert(`تم تسجيل ال${typeLabel} ${inv.invoiceNumber}\nالمبلغ: DA${totalAmount.toFixed(2)}${isProvisional ? '\n(تسجيل شكلي)' : ''}`);
  }

  // Refresh
  _invAllInvoices = DB.getInvoices().sort((a, b) => b.createdAt - a.createdAt);
  filterInvoices();
}

function startNewInvoice(type) {
  closeAddInvoiceMenu();
  if (type === 'waybill' || type === 'proforma') {
    showWaybillForm(type);
    return;
  }
  if (type === 'purchase') {
    openInvPurModal();
    return;
  }
  if (type === 'dispatch') {
    openInvDispModal();
    return;
  }
  alert(`سيتم قريباً إضافة نموذج إدخال ${type || ''}`);
}

// ===== DISPATCH INVOICE FORM (فاتورة إرسال) =====

var _dispRecipientType = 'customer'; // 'supplier' | 'customer' | 'walkin'
var _dispSupplierId = null;
var _dispCustomerId = null;

function openInvDispModal() {
  _dispSupplierId = null;
  _dispCustomerId = null;
  document.getElementById('dispSupSearch').value = '';
  document.getElementById('dispSupResults').innerHTML = '';
  document.getElementById('dispSelectedSupplier').style.display = 'none';
  document.getElementById('dispCustSearch').value = '';
  document.getElementById('dispCustResults').innerHTML = '';
  document.getElementById('dispSelectedCustomer').style.display = 'none';
  document.getElementById('dispWalkinName').value = '';
  document.getElementById('dispWalkinPhone').value = '';
  document.getElementById('dispWalkinAddress').value = '';
  document.getElementById('dispAmount').value = '0';
  document.getElementById('dispTimbreCheck').checked = false;
  document.getElementById('dispTimbreAmount').style.display = 'none';
  document.getElementById('dispPayAmount').value = '0';
  document.getElementById('dispTotal').textContent = 'DA0';
  // Default to customer tab
  switchDispTab('customer');
  document.getElementById('invDispModal').style.display = 'flex';
  setTimeout(() => {
    if (_dispRecipientType === 'customer') document.getElementById('dispCustSearch').focus();
    else if (_dispRecipientType === 'supplier') document.getElementById('dispSupSearch').focus();
    else document.getElementById('dispWalkinName').focus();
  }, 200);
}

function closeInvDispModal() {
  document.getElementById('invDispModal').style.display = 'none';
}

function switchDispTab(tab) {
  _dispRecipientType = tab;
  // Reset selections
  _dispSupplierId = null;
  _dispCustomerId = null;
  document.getElementById('dispSelectedSupplier').style.display = 'none';
  document.getElementById('dispSelectedCustomer').style.display = 'none';
  document.getElementById('dispSupResults').innerHTML = '';
  document.getElementById('dispCustResults').innerHTML = '';

  // Toggle sections
  document.getElementById('dispSupplierSection').style.display = tab === 'supplier' ? '' : 'none';
  document.getElementById('dispCustomerSection').style.display = tab === 'customer' ? '' : 'none';
  document.getElementById('dispWalkinSection').style.display = tab === 'walkin' ? '' : 'none';
  document.getElementById('dispPaySection').style.display = tab === 'customer' ? '' : 'none';

  // Toggle tab buttons
  ['supplier','customer','walkin'].forEach(t => {
    const btn = document.getElementById('dispTab' + t.charAt(0).toUpperCase() + t.slice(1));
    btn.className = t === tab ? 'btn btn-primary' : 'btn';
  });

  dispRecalcTotal();
}

function dispRecalcTotal() {
  const amount = parseFloat(document.getElementById('dispAmount').value) || 0;
  const timbreEnabled = document.getElementById('dispTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = amount * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const total = amount + timbreAmount;
  document.getElementById('dispTotal').textContent = 'DA' + total.toFixed(2);
  const timbreEl = document.getElementById('dispTimbreAmount');
  if (timbreEnabled && timbreAmount > 0) {
    timbreEl.textContent = '+ DA' + timbreAmount.toFixed(2);
    timbreEl.style.display = '';
  } else {
    timbreEl.style.display = 'none';
  }
}

// --- Supplier search ---
function searchDispSupplier(q) {
  const results = document.getElementById('dispSupResults');
  q = normSearch(q);
  const suppliers = DB.getSuppliers();
  const matches = q
    ? suppliers.filter(s =>
        s.name.toLowerCase().includes(q.toLowerCase()) || (s.phone && s.phone.includes(q))
      ).slice(0, 8)
    : suppliers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">لا توجد نتائج</div>'
    : matches.map(s => `<div class="search-result-item" onclick="selectDispSupplier('${s.id}')">
        <strong>${escHtml(s.name)}</strong>
        <span class="text-muted">${s.phone || ''}</span>
      </div>`).join('');
}

function selectDispSupplier(id) {
  const s = DB.getSuppliers().find(x => x.id === id);
  if (!s) return;
  _dispSupplierId = s.id;
  document.getElementById('dispSupSearch').value = s.name;
  document.getElementById('dispSupResults').innerHTML = '';
  document.getElementById('dispSupName').textContent = s.name;
  document.getElementById('dispSelectedSupplier').style.display = '';
}

// --- Customer search ---
function searchDispCustomer(q) {
  const results = document.getElementById('dispCustResults');
  q = normSearch(q);
  const customers = DB.getCustomers();
  const matches = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone && c.phone.includes(q))
      ).slice(0, 8)
    : customers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">لا توجد نتائج</div>'
    : matches.map(c => `<div class="search-result-item" onclick="selectDispCustomer('${c.id}')">
        <strong>${escHtml(c.name)}</strong>
        <span class="text-muted">${c.phone || ''}</span>
      </div>`).join('');
}

function selectDispCustomer(id) {
  const c = DB.getCustomers().find(x => x.id === id);
  if (!c) return;
  _dispCustomerId = c.id;
  document.getElementById('dispCustSearch').value = c.name;
  document.getElementById('dispCustResults').innerHTML = '';
  document.getElementById('dispCustName').textContent = c.name;
  document.getElementById('dispSelectedCustomer').style.display = '';
}

// --- Confirm ---
function confirmDispatchInvoice() {
  const totalAmount = parseFloat(document.getElementById('dispAmount').value) || 0;
  if (totalAmount <= 0) { alert('الرجاء إدخال مبلغ صحيح'); return; }

  // Validate recipient
  let supplierId = null, customerId = null;
  let walkinName = '', walkinPhone = '', walkinAddress = '';

  if (_dispRecipientType === 'supplier') {
    if (!_dispSupplierId) { alert('الرجاء اختيار مورد'); return; }
    supplierId = _dispSupplierId;
  } else if (_dispRecipientType === 'customer') {
    if (!_dispCustomerId) { alert('الرجاء اختيار عميل'); return; }
    customerId = _dispCustomerId;
  } else {
    walkinName = document.getElementById('dispWalkinName').value.trim();
    if (!walkinName) { alert('الرجاء إدخال اسم المرسل إليه'); return; }
    walkinPhone = document.getElementById('dispWalkinPhone').value.trim();
    walkinAddress = document.getElementById('dispWalkinAddress').value.trim();
  }

  // Calculate timbre
  const timbreEnabled = document.getElementById('dispTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreFiscal = 0;
  if (timbreEnabled) {
    timbreFiscal = totalAmount * (timbreRate / 100);
    if (timbreFiscal < 5) timbreFiscal = 5;
    if (timbreFiscal > 10000) timbreFiscal = 10000;
  }

  const invTotal = totalAmount + timbreFiscal;

  // Build items array (single line: المبلغ المرسل)
  const items = [{
    productId: 'dispatch_' + Date.now(),
    barcode: 'DISPATCH',
    name: 'مبلغ الإرسال — Montant envoyé',
    qty: 1,
    price: invTotal,
    total: invTotal,
  }];

  // Create invoice
  const inv = DB.addInvoice({
    supplierId, customerId,
    walkinName, walkinPhone, walkinAddress,
    type: 'dispatch',
    date: Date.now(),
    items,
    totalAmount: invTotal,
    extraDiscount: 0,
    timbreFiscal,
    isProvisional: false,
    profit: 0,
  });

  // === HANDLE SUPPLIER DISPATCH ===
  if (supplierId) {
    // Reduce supplier balance (we paid them) — allow negative (overpayment)
    const suppliers = DB.getSuppliers();
    const sIdx = suppliers.findIndex(s => s.id === supplierId);
    if (sIdx !== -1) {
      suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) - invTotal;
      DB.saveSuppliers(suppliers);
    }
    // Record payment (expense in net account)
    DB.addPayment({
      supplierId,
      invoiceId: inv.id,
      amount: invTotal,
      type: 'stock_purchase',
      note: 'فاتورة إرسال — Bon d\'envoi',
      isProvisional: false,
    });
  }

  // === HANDLE CUSTOMER DISPATCH ===
  if (customerId) {
    const payAmount = Math.min(
      parseFloat(document.getElementById('dispPayAmount').value) || 0,
      totalAmount
    );

    // مبلغ الإرسال كاملاً = مصروف (خرج مال) — لا يُربط بالفاتورة حتى لا يتضاعف المبلغ المدفوع
    DB.addPayment({
      amount: invTotal,
      type: 'dispatch',
      note: 'فاتورة إرسال — Bon d\'envoi',
      isProvisional: false,
    });

    if (payAmount > 0) {
      // دفعة العميل الأولى = إيراد (بيع)
      DB.addPayment({
        customerId,
        invoiceId: inv.id,
        amount: payAmount,
        note: 'فاتورة إرسال — Bon d\'envoi',
        isProvisional: false,
      });
      // Update invoice paidAmount
      DB.updateInvoice(inv.id, { paidAmount: payAmount });
    }

    // Add unpaid remainder to customer balance (totalAmount without timbre)
    const remaining = totalAmount - payAmount;
    if (remaining > 0) {
      const customers = DB.getCustomers();
      const cIdx = customers.findIndex(c => c.id === customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + remaining;
        DB.saveCustomers(customers);
      }
    }
  }

  // === HANDLE WALKIN DISPATCH ===
  // (no balance tracking) — المبلغ المرسل يسجل كمصروف
  if (!supplierId && !customerId) {
    DB.addPayment({
      amount: invTotal,
      type: 'dispatch',
      note: walkinName ? `فاتورة إرسال — ${walkinName}` : 'فاتورة إرسال — Bon d\'envoi',
      isProvisional: false,
    });
  }

  closeInvDispModal();

  let msg = `تم تسجيل فاتورة إرسال بقيمة DA${invTotal.toFixed(2)}`;
  if (timbreFiscal > 0) msg += ` (طابع جبائي: DA${timbreFiscal.toFixed(2)})`;
  if (supplierId) msg += '\nالمبلغ خصم من رصيد المورد';
  if (customerId) {
    const payAmount = Math.min(parseFloat(document.getElementById('dispPayAmount').value) || 0, totalAmount);
    msg += `\nالمبلغ مسجل كمصروف DA${invTotal.toFixed(2)}`;
    if (payAmount > 0) msg += `، والدفعة الأولى DA${payAmount.toFixed(2)} إيراد — الباقي DA${(totalAmount - payAmount).toFixed(2)} كدين على العميل`;
  }
  alert(msg);

  _invAllInvoices = DB.getInvoices().sort((a, b) => b.createdAt - a.createdAt);
  filterInvoices();
}

// ===== PURCHASE INVOICE FORM (مثل إضافة مخزون + Timbre) =====

var _purCart = [];
var _purCartSupplierId = null;

function openInvPurModal() {
  _purCart = [];
  _purCartSupplierId = null;
  resetPurForm();
  populatePurBrands();
  populatePurCategories();
  renderPurCart();
  document.getElementById('invPurModal').style.display = 'flex';
  setTimeout(() => document.getElementById('purBarcodeScanner').focus(), 200);
}

function closeInvPurModal() {
  document.getElementById('invPurModal').style.display = 'none';
}

function populatePurBrands() {
  const sel = document.getElementById('purBrand');
  sel.innerHTML = [...BRANDS.global, ...BRANDS.chinese].map(b =>
    `<option value="${b.id}">${b.name}</option>`
  ).join('');
}

function populatePurCategories() {
  const sel = document.getElementById('purCategory');
  sel.innerHTML = DB.getCategories().map(c =>
    `<option value="${c}">${c}</option>`
  ).join('');
}

function resetPurForm() {
  document.getElementById('purBarcodeScanner').value = '';
  document.getElementById('purScannerStatus').textContent = 'جاهز للمسح';
  document.getElementById('purScannerResult').style.display = 'none';
  document.getElementById('purProdSearch').value = '';
  document.getElementById('purSearchResults').innerHTML = '';
  document.getElementById('purSelectedProduct').style.display = 'none';
  document.getElementById('purProdName').value = '';
  document.getElementById('purProdBar').value = '';
  document.getElementById('purQty').value = '1';
  document.getElementById('purBuyPrice').value = '0';
  document.getElementById('purSellPrice').value = '0';
  document.getElementById('purWholePrice').value = '0';
  document.getElementById('purSupSearch').value = '';
  document.getElementById('purSupResults').innerHTML = '';
  document.getElementById('purSelectedSupplier').style.display = 'none';
  document.getElementById('purTimbreCheck').checked = false;
  document.getElementById('purTimbreAmount').style.display = 'none';
}

// --- Barcode scan ---
function handlePurBarcodeScan(e) {
  if (e.key !== 'Enter') return;
  const val = e.target.value.trim();
  if (!val) return;
  const status = document.getElementById('purScannerStatus');
  const result = document.getElementById('purScannerResult');
  const prod = DB.getProducts().find(p => p.barcode === val);
  if (prod) {
    status.textContent = '✓ تم العثور على المنتج';
    status.style.color = '#28a745';
    result.style.display = '';
    result.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
      <span><strong>${escHtml(prod.name)}</strong></span>
      <span style="font-size:11px;color:var(--silver-500)">${Auth.isManager() ? 'DA' + prod.buyPrice.toFixed(2) + ' / ' : ''}DA${prod.sellPrice.toFixed(2)} | المخزون: ${prod.quantity}</span>
    </div><button class="btn btn-sm" onclick="fillPurFromScan('${prod.id}')" style="font-size:11px"><i class="fas fa-check"></i> استخدام هذا المنتج</button>`;
  } else {
    status.textContent = '✗ منتج غير موجود — سيتم إدخال منتج جديد';
    status.style.color = '#e65100';
    result.style.display = '';
    result.innerHTML = `<div style="font-size:12px;color:var(--silver-600);padding:4px 0">الباركود: <strong dir="ltr">${val}</strong></div>`;
    document.getElementById('purProdBar').value = val;
    document.getElementById('purProdName').focus();
  }
}

function fillPurFromScan(id) {
  const p = DB.getProduct(id);
  if (!p) return;
  document.getElementById('purBarcodeScanner').value = '';
  document.getElementById('purScannerResult').style.display = 'none';
  document.getElementById('purScannerStatus').textContent = 'جاهز للمسح';
  document.getElementById('purScannerStatus').style.color = '';
  document.getElementById('purProdSearch').value = p.name;
  document.getElementById('purSelName').textContent = p.name;
  document.getElementById('purSelBarcode').textContent = p.barcode;
  document.getElementById('purSelectedProduct').style.display = '';
  document.getElementById('purProdName').value = p.name;
  document.getElementById('purProdBar').value = p.barcode;
  document.getElementById('purQty').value = '1';
  document.getElementById('purBuyPrice').value = p.buyPrice;
  document.getElementById('purSellPrice').value = p.sellPrice;
  document.getElementById('purWholePrice').value = p.wholesalePrice || 0;
  document.getElementById('purBrand').value = p.brandId;
  document.getElementById('purCategory').value = p.category;
}

// --- Product search ---
function searchPurProduct(q) {
  const results = document.getElementById('purSearchResults');
  q = normSearch(q);
  const products = DB.getProducts();
  const matches = q
    ? products.filter(p =>
        p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q)
      ).slice(0, 8)
    : products.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">لا توجد نتائج</div>'
    : matches.map(p => `<div class="search-result-item" onclick="fillPurFromSearch('${p.id}')">
        <strong>${escHtml(p.name)}</strong>
        <span class="text-muted">${p.barcode}</span>
      </div>`).join('');
}

function fillPurFromSearch(id) {
  const p = DB.getProduct(id);
  if (!p) return;
  document.getElementById('purProdSearch').value = p.name;
  document.getElementById('purSearchResults').innerHTML = '';
  document.getElementById('purSelName').textContent = p.name;
  document.getElementById('purSelBarcode').textContent = p.barcode;
  document.getElementById('purSelectedProduct').style.display = '';
  document.getElementById('purProdName').value = p.name;
  document.getElementById('purProdBar').value = p.barcode;
  document.getElementById('purQty').value = '1';
  document.getElementById('purBuyPrice').value = p.buyPrice;
  document.getElementById('purSellPrice').value = p.sellPrice;
  document.getElementById('purWholePrice').value = p.wholesalePrice || 0;
  document.getElementById('purBrand').value = p.brandId;
  document.getElementById('purCategory').value = p.category;
}

// --- Supplier search ---
function searchPurSupplier(q) {
  const results = document.getElementById('purSupResults');
  q = normSearch(q);
  const suppliers = DB.getSuppliers();
  const matches = q
    ? suppliers.filter(s =>
        s.name.toLowerCase().includes(q.toLowerCase()) || (s.phone && s.phone.includes(q))
      ).slice(0, 8)
    : suppliers.slice(0, 8);
  results.innerHTML = matches.length === 0
    ? '<div class="search-result-item disabled">لا توجد نتائج</div>'
    : matches.map(s => `<div class="search-result-item" onclick="selectPurSupplier('${s.id}')">
        <strong>${escHtml(s.name)}</strong>
        <span class="text-muted">${s.phone || ''}</span>
      </div>`).join('');
}

function selectPurSupplier(id) {
  const s = DB.getSuppliers().find(x => x.id === id);
  if (!s) return;
  _purCartSupplierId = s.id;
  document.getElementById('purSupSearch').value = s.name;
  document.getElementById('purSupResults').innerHTML = '';
  document.getElementById('purSupName').textContent = s.name;
  document.getElementById('purSelectedSupplier').style.display = '';
}

// --- Cart ---
function purAddToCart() {
  const name = document.getElementById('purProdName').value.trim();
  const barcode = document.getElementById('purProdBar').value.trim();
  const brandId = document.getElementById('purBrand').value;
  const category = document.getElementById('purCategory').value;
  const qty = parseInt(document.getElementById('purQty').value) || 1;
  const buyPrice = parseFloat(document.getElementById('purBuyPrice').value) || 0;
  const sellPrice = parseFloat(document.getElementById('purSellPrice').value) || 0;
  const wholesalePrice = parseFloat(document.getElementById('purWholePrice').value) || 0;

  if (!name) { alert('الرجاء إدخال اسم المنتج'); return; }
  if (!barcode) { alert('الرجاء إدخال الباركود'); return; }

  _purCart.push({ name, barcode, brandId, category, qty, buyPrice, sellPrice, wholesalePrice });
  renderPurCart();
  resetPurForm();
  setTimeout(() => document.getElementById('purBarcodeScanner').focus(), 200);
}

function renderPurCart() {
  const section = document.getElementById('purCartSection');
  const container = document.getElementById('purCartItems');
  const countEl = document.getElementById('purCartCount');
  const totalEl = document.getElementById('purCartTotal');

  if (_purCart.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  countEl.textContent = `(${_purCart.length})`;
  const total = _purCart.reduce((sum, item) => sum + item.qty * item.buyPrice, 0);
  totalEl.textContent = `DA${total.toFixed(2)}`;

  container.innerHTML = _purCart.map((item, i) =>
    `<div class="cart-item">
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span class="text-muted">${item.barcode}</span>
      </div>
      <div class="cart-item-details">
        <span>${item.qty} × DA${Auth.isManager() ? item.buyPrice.toFixed(2) : item.price.toFixed(2)}</span>
        <span class="cart-item-total">DA${(item.qty * (Auth.isManager() ? item.buyPrice : item.price)).toFixed(2)}</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="purRemoveFromCart(${i})"><i class="fas fa-times"></i></button>
    </div>`
  ).join('');
  purRecalcTotal();
}

function purRemoveFromCart(idx) {
  _purCart.splice(idx, 1);
  renderPurCart();
}

function purClearCart() {
  if (_purCart.length === 0) return;
  if (!confirm('تفريغ سلة الفاتورة؟')) return;
  _purCart = [];
  renderPurCart();
}

// --- Timbre & Total ---
function purRecalcTotal() {
  const subtotal = _purCart.reduce((s, i) => s + i.qty * i.buyPrice, 0);
  const timbreEnabled = document.getElementById('purTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = subtotal * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const total = subtotal + timbreAmount;
  document.getElementById('purCartTotal').textContent = 'DA' + total.toFixed(2);
  const timbreEl = document.getElementById('purTimbreAmount');
  if (timbreEnabled && timbreAmount > 0) {
    timbreEl.textContent = '+ DA' + timbreAmount.toFixed(2);
    timbreEl.style.display = '';
  } else {
    timbreEl.style.display = 'none';
  }
}

// --- Confirm ---
function purConfirmInvoice() {
  if (_purCart.length === 0) { alert('سلة الفاتورة فارغة'); return; }

  const supplierId = _purCartSupplierId;
  let totalAmount = 0;
  const invoiceItems = [];

  _purCart.forEach(item => {
    const itemTotal = item.qty * item.buyPrice;
    totalAmount += itemTotal;

    const prod = DB.addProduct({
      name: item.name, barcode: item.barcode,
      brandId: item.brandId, category: item.category,
      buyPrice: item.buyPrice, sellPrice: item.sellPrice,
      wholesalePrice: item.wholesalePrice || 0,
      quantity: item.qty, supplierId,
    });

    invoiceItems.push({
      productId: prod.id, barcode: item.barcode,
      name: item.name, qty: item.qty,
      price: item.buyPrice, total: itemTotal,
    });
  });

  const timbreEnabled = document.getElementById('purTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreFiscal = 0;
  if (timbreEnabled) {
    timbreFiscal = totalAmount * (timbreRate / 100);
    if (timbreFiscal < 5) timbreFiscal = 5;
    if (timbreFiscal > 10000) timbreFiscal = 10000;
  }

  if (supplierId) {
    DB.addInvoice({ supplierId, type: 'supplier', date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal });
    const suppliers = DB.getSuppliers();
    const idx = suppliers.findIndex(s => s.id === supplierId);
    if (idx !== -1) {
      suppliers[idx].balance = (parseFloat(suppliers[idx].balance) || 0) + totalAmount;
      DB.saveSuppliers(suppliers);
    }
  } else {
    DB.addInvoice({ supplierId: null, type: 'purchase', date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal });
  }

  _purCart = [];
  _purCartSupplierId = null;
  document.getElementById('purTimbreCheck').checked = false;
  renderPurCart();
  closeInvPurModal();

  const cnt = invoiceItems.length;
  const totalQty = invoiceItems.reduce((s, it) => s + it.qty, 0);
  let msg = `تم تسجيل فاتورة بقيمة DA${totalAmount.toFixed(2)}`;
  if (timbreFiscal > 0) msg += ` + طابع جبائي DA${timbreFiscal.toFixed(2)}`;
  msg += ` تشمل ${cnt} منتج (${totalQty} قطعة)`;
  alert(msg);

  _invAllInvoices = DB.getInvoices().sort((a, b) => b.createdAt - a.createdAt);
  filterInvoices();
}

// ===== UTILITY =====

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Settings helpers (duplicated for availability)
function getStoreInfo() {
  return {
    name: localStorage.getItem('zmt_store_name') || 'ZMT PIECE',
    address: localStorage.getItem('zmt_store_address') || '',
    phone: localStorage.getItem('zmt_store_phone') || '',
  };
}

// ===== LAN SYNC: refresh invoice list without disturbing open entry forms =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['invoices'] = function invoicesSyncData() {
  _invAllInvoices = DB.getInvoices().sort((a, b) => b.createdAt - a.createdAt);
  _invCustomersCache = null;
  _invSuppliersCache = null;
  filterInvoices();
};
