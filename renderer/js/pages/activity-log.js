// ===== ACTIVITY LOG (سجل النشاطات) =====
// Top-bar button, password-gated, with three tabs: payments, searches, invoices.
// Data is loaded lazily (only when a tab is opened) and paginated 20/page.

let _actLogUnlocked = false;
let _actLogTab = 'payments';
let _actLogPage = 0;
const _ACT_PAGE_SIZE = 20;
let _actLogFrom = '';
let _actLogTo = '';

function openActivityLog() {
  if (!_actCanView()) return;
  if (!_actLogUnlocked) {
    _showPasswordModal();
    return;
  }
  if (typeof Auth !== 'undefined' && typeof Auth.isManager === 'function' && !Auth.isManager()) {
    alert('للمدراء فقط');
    return;
  }
  _showActivityLogModal();
}

// Permission gate (manager can hide «سجل النشاطات» from a user). Defaults to
// visible so an existing user never loses the shortcut before the manager
// saves the permissions grid.
function _actCanView() {
  try {
    if (typeof Auth === 'undefined' || typeof Auth.canView !== 'function') return true;
    if (typeof Auth.isLoggedIn === 'function' && !Auth.isLoggedIn()) return true;
    return Auth.canView('activity-log');
  } catch (e) { return true; }
}

function _applyActivityLogPerm() {
  const btn = document.getElementById('btnActivityLog');
  if (btn) btn.style.display = _actCanView() ? '' : 'none';
}

function _showPasswordModal() {
  let m = document.getElementById('actPassModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'actPassModal';
    m.className = 'modal-overlay';
    m.style.zIndex = '99996';
    m.innerHTML = `
      <div class="modal" style="max-width:360px">
        <div class="modal-header"><h3><i class="fas fa-lock"></i> سجل النشاطات</h3><button class="modal-close" onclick="closeActPassModal()">&times;</button></div>
        <div class="modal-body" style="padding:16px">
          <label style="font-size:13px;font-weight:600">أدخل كلمة مرور البرنامج</label>
          <input type="password" id="actPassInput" style="width:100%;margin-top:8px;padding:8px;border:1px solid var(--silver-300);border-radius:4px;font-size:14px" onkeydown="if(event.key==='Enter')submitActPass()">
          <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn" onclick="closeActPassModal()">إلغاء</button>
            <button class="btn btn-primary" onclick="submitActPass()">تأكيد</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
  }
  const inp = document.getElementById('actPassInput');
  if (inp) inp.value = '';
  m.style.display = 'flex';
  setTimeout(() => { const i = document.getElementById('actPassInput'); if (i) i.focus(); }, 50);
}

function closeActPassModal() {
  const m = document.getElementById('actPassModal');
  if (m) m.style.display = 'none';
}

function submitActPass() {
  const inp = document.getElementById('actPassInput');
  const pwd = inp ? inp.value : '';
  let verified = false;
  try {
    if (typeof Auth !== 'undefined' && typeof Auth.getStorePassword === 'function') {
      const stored = Auth.getStorePassword();
      if (stored) verified = String(pwd) === String(stored);
    }
  } catch (e) { verified = false; }
  if (!verified && (typeof Auth === 'undefined' || !Auth.getStorePassword || !Auth.getStorePassword())) {
    if (typeof Auth !== 'undefined' && typeof Auth.isManager === 'function' && Auth.isManager()) verified = true;
  }
  if (!verified) { alert('كلمة مرور خاطئة'); return; }
  _actLogUnlocked = true;
  closeActPassModal();
  if (typeof Auth !== 'undefined' && typeof Auth.isManager === 'function' && !Auth.isManager()) {
    alert('للمدراء فقط');
    return;
  }
  _showActivityLogModal();
}

function _showActivityLogModal() {
  let modal = document.getElementById('activityLogModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'activityLogModal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '99995';
    modal.innerHTML = `
      <div class="modal" style="max-width:900px;width:95%;max-height:85vh;display:flex;flex-direction:column">
        <div class="modal-header">
          <h3><i class="fas fa-clipboard-list"></i> سجل النشاطات</h3>
          <button class="modal-close" onclick="closeActivityLog()">&times;</button>
        </div>
        <div class="modal-body" style="flex:1;overflow:auto;padding:12px">
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <button class="btn btn-sm" id="actTabPayments" onclick="switchActTab('payments')">سجل الدفعات</button>
            <button class="btn btn-sm" id="actTabSearches" onclick="switchActTab('searches')">سجل البحث</button>
            <button class="btn btn-sm" id="actTabInvoices" onclick="switchActTab('invoices')">سجل الفواتير</button>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
            <label>من</label>
            <input type="date" id="actFrom" style="padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px">
            <label>إلى</label>
            <input type="date" id="actTo" style="padding:4px 8px;border:1px solid var(--silver-300);border-radius:4px">
            <button class="btn btn-sm btn-primary" onclick="applyActFilter()">بحث</button>
          </div>
          <div id="actLogBody"></div>
          <div id="actLogPager" style="display:flex;gap:8px;justify-content:center;margin-top:12px"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  _actLogPage = 0;
  _actLogFrom = '';
  _actLogTo = '';
  const f = document.getElementById('actFrom'); if (f) f.value = '';
  const to = document.getElementById('actTo'); if (to) to.value = '';
  modal.style.display = 'flex';
  switchActTab('payments');
}

function closeActivityLog() {
  const m = document.getElementById('activityLogModal');
  if (m) m.style.display = 'none';
}

function switchActTab(tab) {
  _actLogTab = tab;
  _actLogPage = 0;
  ['payments','searches','invoices'].forEach(t => {
    const b = document.getElementById('actTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (b) b.classList.toggle('active', t === tab);
  });
  renderActLog();
}

function applyActFilter() {
  _actLogFrom = document.getElementById('actFrom') ? document.getElementById('actFrom').value : '';
  _actLogTo = document.getElementById('actTo') ? document.getElementById('actTo').value : '';
  _actLogPage = 0;
  renderActLog();
}

function _actInRange(ts) {
  if (_actLogFrom) {
    const f = new Date(_actLogFrom + 'T00:00:00').getTime();
    if (ts < f) return false;
  }
  if (_actLogTo) {
    const t = new Date(_actLogTo + 'T23:59:59').getTime();
    if (ts > t) return false;
  }
  return true;
}

function renderActLog() {
  const body = document.getElementById('actLogBody');
  const pager = document.getElementById('actLogPager');
  if (!body) return;
  body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--silver-500)"><i class="fas fa-spinner fa-spin"></i></div>';

  setTimeout(() => {
    let rows = [];
    if (_actLogTab === 'payments') {
      rows = (DB.getPayments() || []).slice().filter(p => _actInRange(p.createdAt || 0));
    } else if (_actLogTab === 'searches') {
      rows = (DB.getSearchLogs() || []).slice().filter(p => _actInRange(p.ts || 0));
    } else {
      rows = (DB.getAuditLogs() || []).filter(a => a.entity === 'invoice').filter(a => _actInRange(a.ts || 0));
    }
    rows.sort((a, b) => (b.createdAt || b.ts || 0) - (a.createdAt || a.ts || 0));

    const total = rows.length;
    const start = _actLogPage * _ACT_PAGE_SIZE;
    const page = rows.slice(start, start + _ACT_PAGE_SIZE);

    if (page.length === 0) {
      body.innerHTML = '<div class="placeholder-box" style="padding:20px"><i class="fas fa-inbox"></i><p>لا توجد سجلات</p></div>';
    } else {
      let html = '<table class="data-table"><thead><tr>';
      if (_actLogTab === 'payments') {
        html += '<th>التاريخ</th><th>المستخدم</th><th>المبلغ</th><th>الطريقة</th><th>الملاحظة</th><th>الفاتورة</th>';
      } else if (_actLogTab === 'searches') {
        html += '<th>التاريخ</th><th>المستخدم</th><th>الاستعلام</th><th>الصفحة</th>';
      } else {
        html += '<th>التاريخ</th><th>المستخدم</th><th>العملية</th><th>نوع الفاتورة</th><th>التفاصيل</th>';
      }
      html += '</tr></thead><tbody>';
      page.forEach(r => {
        const ts = r.createdAt || r.ts || 0;
        const dateStr = new Date(ts).toLocaleString('ar-EG-u-nu-latn');
        const user = r.manager || r.operator || '—';
        if (_actLogTab === 'payments') {
          html += `<tr><td>${dateStr}</td><td>${_actEsc(user)}</td><td>DA${fmtMoney(r.amount || 0)}</td><td>${_actEsc(r.method || '')}</td><td>${_actEsc(r.note || '')}</td><td>${_actEsc(r.invoiceId || '')}</td></tr>`;
        } else if (_actLogTab === 'searches') {
          const pageLabel = _actSearchContextLabel(r.context);
          html += `<tr><td>${dateStr}</td><td>${_actEsc(user)}</td><td>${_actEsc(r.query || '')}</td><td>${_actEsc(pageLabel)}</td></tr>`;
        } else {
          const act = r.action === 'delete' ? 'حذف' : (r.action === 'add' ? 'إضافة' : 'تعديل');
          const inv = (typeof DB !== 'undefined' && DB.getInvoice) ? DB.getInvoice(r.entityId) : null;
          const typeLabel = _actInvoiceTypeLabel(inv, r.detail);
          const cleanDetail = String(r.detail || '').replace(/\s*\[[^\]]*\]\s*$/, '');
          html += `<tr><td>${dateStr}</td><td>${_actEsc(user)}</td><td>${act}</td><td>${_actEsc(typeLabel)}</td><td>${_actEsc(cleanDetail)}</td></tr>`;
        }
      });
      html += '</tbody></table>';
      body.innerHTML = html;
    }

    // pager
    const pages = Math.ceil(total / _ACT_PAGE_SIZE);
    if (pages > 1) {
      pager.innerHTML = `
        <button class="btn btn-sm" onclick="actPrevPage()" ${_actLogPage === 0 ? 'disabled' : ''}>السابق</button>
        <span style="padding:4px 8px;font-size:12px">صفحة ${_actLogPage + 1} من ${pages}</span>
        <button class="btn btn-sm" onclick="actNextPage(${pages})" ${_actLogPage >= pages - 1 ? 'disabled' : ''}>التالي</button>`;
    } else {
      pager.innerHTML = '';
    }
  }, 10);
}

function actPrevPage() { if (_actLogPage > 0) { _actLogPage--; renderActLog(); } }
function actNextPage(pages) { if (_actLogPage < pages - 1) { _actLogPage++; renderActLog(); } }

function _actInvoiceTypeLabel(inv, detail) {
  const t = inv && inv.type ? inv.type : '';
  let type = t;
  if (!type && detail) {
    const m = String(detail).match(/\[([^\]]+)\]/);
    if (m) type = m[1];
  }
  if (type === 'customer') return 'بيع (عميل)';
  if (type === 'supplier') return 'شراء (مورد)';
  if (type === 'purchase') return 'شراء (بدون مورد)';
  if (type === 'sup_sale') return 'بيع لمورد';
  if (type === 'payment') return 'سند قبض';
  if (type === 'transfer') return 'تحويل';
  if (type === 'transfer_receive') return 'استلام';
  if (type === 'dispatch') return 'إرسال';
  if (type === 'waybill') return 'فاتورة طريق';
  if (type === 'proforma') return 'شكلية';
  if (type) return type;
  return '—';
}

function _actSearchContextLabel(ctx) {
  const map = {
    'sales-products': 'صفحة البيع — منتجات',
    'sales-customers': 'صفحة البيع — عملاء',
    'sup-sale-supplier': 'صفحة البيع — بيع لمورد',
    'inventory-product': 'صفحة المخزون — منتجات',
    'inventory-supplier': 'صفحة المخزون — موردون',
    'category-products': 'التصنيفات/المنتجات',
    'category-suppliers': 'التصنيفات/الموردون',
    'edit-product': 'تعديل فاتورة — منتج',
    'purchase-product': 'الشراء — منتج',
    'purchase-supplier': 'الشراء — مورد',
    'waybill-customer': 'فاتورة طريق — عميل',
    'dispatch-supplier': 'إرسال — مورد',
    'dispatch-customer': 'إرسال — عميل',
    'transfer-product': 'التحويل — منتج',
  };
  if (map[ctx]) return map[ctx];
  // delegated: 'page:inventory field:invProdSearch'
  if (ctx && ctx.indexOf('page:') === 0) {
    const m = ctx.match(/page:(\S+)\s+field:(\S+)/);
    if (m) {
      const pageMap = { 'inventory': 'المخزون', 'sales': 'البيع', 'invoices': 'الفواتير', 'customers': 'العملاء', 'suppliers': 'الموردون', 'quick-entry': 'الإدخال السريع' };
      const pname = pageMap[m[1]] || m[1];
      return pname + ' — ' + m[2];
    }
    return ctx.replace('page:', 'صفحة: ');
  }
  return ctx || '—';
}

function _actEsc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Global delegated search logger: catches searches even if page-specific
// functions are cached or bypassed. Debounced per element to avoid spam.
const _actSearchDebounce = new WeakMap();
document.addEventListener('input', function (e) {
  const el = e.target;
  if (!el || el.tagName !== 'INPUT') return;
  const id = el.id || '';
  if (!/search/i.test(id)) return;
  const q = String(el.value || '').trim();
  if (q.length < 2) return;
  const now = Date.now();
  const last = _actSearchDebounce.get(el) || { q: '', t: 0 };
  if (last.q === q) return;
  if (now - last.t < 600) return;
  _actSearchDebounce.set(el, { q: q, t: now });
  const ctx = 'page:' + (window._currentPageId || '') + ' field:' + id;
  try { DB.logSearch({ query: q, context: ctx }); } catch (err) {}
}, true);

// Wire top-bar button
function _injectActivityLogBtn() {
  if (document.getElementById('btnActivityLog')) { _applyActivityLogPerm(); return; }
  const btn = document.createElement('button');
  btn.className = 'tb-btn tb-support-btn';
  btn.id = 'btnActivityLog';
  btn.title = 'سجل النشاطات';
  btn.innerHTML = '<svg class="tb-svg-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M9 3v18M15 3v18"></path><path d="M9 9h6"></path></svg>';
  btn.onclick = openActivityLog;
  const support = document.getElementById('tbSupport');
  if (support && support.parentNode) {
    support.parentNode.insertBefore(btn, support);
  } else {
    // fallback: append to title-bar-controls
    const ctr = document.querySelector('.title-bar-controls');
    if (ctr) ctr.insertBefore(btn, ctr.firstChild);
  }
  _applyActivityLogPerm();
}
// Keep the shortcut in step with permissions after every navigation/login.
window.addEventListener('zmt:navigate', _applyActivityLogPerm);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _injectActivityLogBtn);
} else {
  _injectActivityLogBtn();
}
window.openActivityLog = openActivityLog;
window.closeActivityLog = closeActivityLog;
window.switchActTab = switchActTab;
window.applyActFilter = applyActFilter;
window.actPrevPage = actPrevPage;
window.actNextPage = actNextPage;
window.closeActPassModal = closeActPassModal;
window.submitActPass = submitActPass;