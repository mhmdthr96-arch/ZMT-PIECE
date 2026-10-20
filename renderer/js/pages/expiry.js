/* ============================================================
   ZMT PIECE — Expiry page
   Shows products that are expired or expiring within the
   configured warning window (zmt_expiry_warn_days).
   ============================================================ */

function init_expiry() {
  setupExpirySearch();
  renderExpiry();
}

function getExpirySettingsSafe() {
  return (typeof getExpirySettings === 'function') ? getExpirySettings() : { enabled: true, required: false, warnDays: 30 };
}

function expiryClassOf(p) {
  if (!p.expiryDate) return 'none';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const exp = new Date(p.expiryDate + 'T00:00:00').getTime();
  if (isNaN(exp)) return 'none';
  const warnMs = (getExpirySettingsSafe().warnDays || 30) * 86400000;
  if (exp < today) return 'expired';
  if (exp <= today + warnMs) return 'expiring';
  return 'ok';
}

function expiryBadgeHTML(p) {
  const c = expiryClassOf(p);
  if (!p.expiryDate || c === 'none') return '<span class="expiry-badge none">' + (typeof t === 'function' ? t('expiry.noDate') : '—') + '</span>';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const exp = new Date(p.expiryDate + 'T00:00:00').getTime();
  const days = Math.floor((exp - today) / 86400000);
  let label, cls;
  if (days < 0) { cls = 'expired'; label = (typeof t === 'function' ? t('expiry.expired') : 'منتهي') + ' (' + Math.abs(days) + ' ' + (typeof t === 'function' ? t('expiry.days') : 'يوم') + ')'; }
  else if (days === 0) { cls = 'expired'; label = (typeof t === 'function' ? t('expiry.expiresToday') : 'ينتهي اليوم'); }
  else { cls = 'expiring'; label = (typeof t === 'function' ? t('expiry.inDays') : 'بعد') + ' ' + days + ' ' + (typeof t === 'function' ? t('expiry.days') : 'يوم'); }
  return '<span class="expiry-badge ' + cls + '">' + label + '</span>';
}

function productExpirySummaryHTML(p) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let days = null;
  if (p.expiryDate) {
    const exp = new Date(p.expiryDate + 'T00:00:00').getTime();
    if (!isNaN(exp)) days = Math.floor((exp - today) / 86400000);
  }
  return (days === null)
    ? (typeof t === 'function' ? t('expiry.noDate') : '—')
    : (days < 0 ? (typeof t === 'function' ? t('expiry.overdue') : 'متأخر') + ' ' : '') + Math.abs(days) + ' ' + (typeof t === 'function' ? t('expiry.days') : 'يوم');
}

function renderExpirySummary() {
  const el = document.getElementById('expirySummary');
  if (!el) return;
  const products = DB.getProducts() || [];
  const withDate = products.filter(p => p.expiryDate);
  let expired = 0, expiring = 0;
  withDate.forEach(p => {
    const c = expiryClassOf(p);
    if (c === 'expired') expired++;
    else if (c === 'expiring') expiring++;
  });
  const days = getExpirySettingsSafe().warnDays || 30;
  el.innerHTML =
    '<div class="expiry-stat expired"><strong>' + expired + '</strong><span>' + (typeof t === 'function' ? t('expiry.sumExpired') : 'منتهي') + '</span></div>' +
    '<div class="expiry-stat expiring"><strong>' + expiring + '</strong><span>' + (typeof t === 'function' ? t('expiry.sumExpiring') : 'قريب الانتهاء') + '</span></div>' +
    '<div class="expiry-stat hint"><strong>' + days + '</strong><span>' + (typeof t === 'function' ? t('expiry.sumWarnWindow') : 'أيام التحذير') + '</span></div>';
}

function renderExpiry() {
  const search = document.getElementById('expirySearch')?.value || '';
  const filter = document.getElementById('expiryFilter')?.value || 'all';
  const q = (typeof normSearch === 'function') ? normSearch(search) : search.toLowerCase().trim();
  const grid = document.getElementById('expiryGrid');
  if (!grid) return;

  const all = DB.getProducts() || [];
  const filtered = all.filter(p => {
    const c = expiryClassOf(p);
    // "الكل" يعرض فقط المنتهي والقريب من الانتهاء (لا المنتجات السليمة أو بلا تاريخ)
    if (filter === 'all' && c !== 'expired' && c !== 'expiring') return false;
    if (filter === 'expired' && c !== 'expired') return false;
    if (filter === 'expiring' && c !== 'expiring') return false;
    if (q) {
      const name = (p.name || '').toLowerCase();
      const bar = (p.barcode || '').toLowerCase();
      const mark = (p.mark || '').toLowerCase();
      if (!name.includes(q) && !bar.includes(q) && !mark.includes(q)) return false;
    }
    return true;
  });
  // sort: expired first, then expiring, by date asc
  filtered.sort((a, b) => {
    const ca = expiryClassOf(a), cb = expiryClassOf(b);
    const order = { expired: 0, expiring: 1, ok: 2, none: 3 };
    if (order[ca] !== order[cb]) return order[ca] - order[cb];
    return String(a.expiryDate || '').localeCompare(String(b.expiryDate || ''));
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="expiry-empty">' + (typeof t === 'function' ? t('expiry.empty') : 'لا توجد منتجات مطابقة') + '</div>';
    renderExpirySummary();
    return;
  }

  const isManager = (typeof Auth !== 'undefined') && Auth.isManager();
  const brands = (typeof BRANDS !== 'undefined') ? [...BRANDS.global, ...BRANDS.chinese] : [];
  const brandName = (id) => { const b = brands.find(x => x.id === id); return b ? b.name : (id || '-'); };

  grid.innerHTML = filtered.map(p => {
    const c = expiryClassOf(p);
    return '<div class="expiry-row ' + c + '" data-id="' + p.id + '">' +
      '<div class="expiry-cell name"><strong>' + escHtml(p.name) + '</strong>' +
        '<div class="expiry-meta">' + escHtml(p.barcode || '-') + ' · ' + escHtml(brandName(p.brandId)) + '</div></div>' +
      '<div class="expiry-cell qty">' + (p.quantity || 0) + '</div>' +
      '<div class="expiry-cell date" dir="ltr">' + escHtml(p.expiryDate || '-') + '</div>' +
      '<div class="expiry-cell days">' + expiryBadgeHTML(p) + '</div>' +
      '<div class="expiry-cell actions">' +
        (isManager ? '<button class="btn btn-sm" onclick="editExpiryProduct(\'' + p.id + '\')"><i class="fas fa-edit"></i></button>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  renderExpirySummary();
}

function editExpiryProduct(id) {
  if (!(typeof Auth !== 'undefined') || !Auth.isManager()) { if (typeof t === 'function') alert(t('common.noPermission')); else alert('لا صلاحية'); return; }
  const p = DB.getProduct(id);
  if (!p) return;
  const newDate = prompt((typeof t === 'function' ? t('expiry.editPrompt') : 'تاريخ انتهاء الصلاحية الجديد (YYYY-MM-DD):'), p.expiryDate || '');
  if (newDate === null) return;
  const v = newDate.trim();
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { alert((typeof t === 'function' ? t('expiry.invalidDate') : 'صيغة التاريخ غير صحيحة')); return; }
  DB.updateProduct(id, { expiryDate: v });
  renderExpiry();
}

function setupExpirySearch() {
  const input = document.getElementById('expirySearch');
  if (!input) return;
  const fresh = input.cloneNode(true);
  input.parentNode.replaceChild(fresh, input);
  fresh.addEventListener('input', (typeof debounce === 'function') ? debounce(renderExpiry, 250) : renderExpiry);
  const filter = document.getElementById('expiryFilter');
  if (filter) filter.addEventListener('change', renderExpiry);
}

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['expiry'] = function expirySyncData() {
  window.syncPreserveRefresh({
    search: ['expirySearch'],
    render: renderExpiry,
  });
};
