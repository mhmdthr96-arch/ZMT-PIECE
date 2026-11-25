// ============================================================================
// ZMT PIECE — تفاصيل الديون (Debt Details)
// ----------------------------------------------------------------------------
// A standalone dashboard reachable from the coloured top-bar shortcut:
//   • four receivable / payable totals:
//       – debts owed to us by customers,
//       – debts we owe to suppliers,
//       – debts we owe to customers,
//       – debts owed to us by suppliers;
//   • two export dropdowns (customers / suppliers) offering, for each of three
//     filters (all · those who owe us · those we owe), a styled Excel export
//     and an on-page table view.
//
// Everything here is additive: the existing «الديون» page and all of its
// features (party details, payment from debts, balance tools) stay untouched.
// ============================================================================

// Balance tolerance used everywhere in the app (mirrors debts.js / sales.js).
var DD_TOL = 0.005;

// Currently displayed results (used by print / live sync).
var _ddViewKind = null;   // 'customer' | 'supplier'
var _ddViewFilter = null; // 'all' | 'owing' | 'owed'
var _ddMode = 'view';     // 'view' (dropdown list) | 'search' (name search)
var _ddSearchQuery = '';
var _ddSearchTimer = null;
var _ddPrintMode = null;  // 'color' | 'bw' — null means "follow shared PrintMode"

// ---- small helpers ---------------------------------------------------------

function ddT(key, fb) {
  try { var v = (typeof t === 'function') ? t(key) : ''; if (v) return v; } catch (e) {}
  return fb || '';
}

function _ddSetText(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

function ddUserName() {
  try {
    if (typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function') {
      var u = Auth.getCurrentUser();
      if (u) return u.name || u.username || '';
    }
  } catch (e) {}
  return '';
}

function ddTodayStr() {
  var d = new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// ============================================================================
// PURE LOGIC (unit-tested by renderer/tests/debt-details-verify.js)
// ============================================================================

// Four totals computed from the raw party lists.
function _ddTotalsFrom(customers, suppliers) {
  var out = { onCustomers: 0, toCustomers: 0, toSuppliers: 0, fromSuppliers: 0 };
  (customers || []).forEach(function (c) {
    var b = parseFloat(c.balance) || 0;
    if (b > DD_TOL) out.onCustomers += b;          // customer owes us
    else if (b < -DD_TOL) out.toCustomers += Math.abs(b); // we owe customer
  });
  (suppliers || []).forEach(function (s) {
    var b = parseFloat(s.balance) || 0;
    if (b > DD_TOL) out.toSuppliers += b;          // we owe supplier
    else if (b < -DD_TOL) out.fromSuppliers += Math.abs(b); // supplier owes us
  });
  return out;
}

// Filter a party list.
//   kind   : 'customer' | 'supplier'
//   filter : 'all' | 'owing' (they owe us) | 'owed' (we owe them)
function _ddFilterParties(kind, filter, list) {
  var isSup = kind === 'supplier';
  return (list || []).filter(function (p) {
    var b = parseFloat(p.balance) || 0;
    if (filter === 'owing') return isSup ? (b < -DD_TOL) : (b > DD_TOL);
    if (filter === 'owed') return isSup ? (b > DD_TOL) : (b < -DD_TOL);
    return true;
  });
}

// Which side of the ledger a party sits on → 'owingUs' | 'weOwe' | ''.
function _ddStatusKey(kind, balance) {
  var b = parseFloat(balance) || 0;
  var isSup = kind === 'supplier';
  if (b > DD_TOL) return isSup ? 'weOwe' : 'owingUs';
  if (b < -DD_TOL) return isSup ? 'owingUs' : 'weOwe';
  return '';
}

// Normalise a name/phone for tolerant matching: lower-case, drop Arabic
// diacritics/tatweel, unify alef / ya / ta-marbuta / hamza forms and Westernise
// digits. Keeps the search forgiving for Arabic spellings.
function _ddNorm(s) {
  var v = String(s == null ? '' : s);
  try { if (typeof window.toLatinDigits === 'function') v = window.toLatinDigits(v); } catch (e) {}
  return v
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .toLowerCase()
    .trim();
}

// Search both lists by name or phone. Returns [{ kind, party, score }] ordered
// by relevance (name prefix first), then by absolute balance, then by name.
// Pure — never mutates the source lists (used by the unit test).
function _ddSearchAll(query, customers, suppliers) {
  var q = _ddNorm(query);
  var out = [];
  if (!q) return out;
  function scan(list, kind) {
    (list || []).forEach(function (p) {
      var name = _ddNorm(p.name);
      var phone = _ddNorm(p.phone);
      var inName = name.indexOf(q);
      var inPhone = phone.indexOf(q);
      if (inName === -1 && inPhone === -1) return;
      var score = inName === 0 ? 0 : (inName !== -1 ? 1 : 2);
      out.push({ kind: kind, party: p, score: score });
    });
  }
  scan(customers, 'customer');
  scan(suppliers, 'supplier');
  out.sort(function (a, b) {
    if (a.score !== b.score) return a.score - b.score;
    var d = Math.abs(parseFloat(b.party.balance) || 0) - Math.abs(parseFloat(a.party.balance) || 0);
    if (Math.abs(d) > 1e-9) return d;
    return String(a.party.name || '').localeCompare(String(b.party.name || ''), 'ar');
  });
  return out;
}

// Build the Excel array-of-arrays. `L` carries resolved labels, `meta` the
// document header values. Kept DOM-free so it can be tested directly.
function _ddBuildAoa(kind, filter, parties, L, meta) {
  meta = meta || {};
  parties = parties || [];
  var headers = [L.colIndex, L.colName, L.colPhone, L.colAddress, L.colBalance, L.colStatus];
  var aoa = [
    [L.title],
    [L.dateLabel + ': ' + (meta.date || ''), L.countLabel + ': ' + parties.length,
      (L.by || '') + (meta.user ? ': ' + meta.user : '')],
    [],
    headers,
  ];
  var total = 0;
  parties.forEach(function (p, i) {
    var b = parseFloat(p.balance) || 0;
    total += b;
    var sk = _ddStatusKey(kind, b);
    var status = sk === 'owingUs' ? L.statusOwingUs : (sk === 'weOwe' ? L.statusWeOwe : '');
    aoa.push([i + 1, p.name || '', p.phone || '', p.address || '', b, status]);
  });
  aoa.push([]);
  aoa.push([L.total, '', '', '', total, '']);
  return { aoa: aoa, total: total, count: parties.length, dataStart: 4 };
}

// ============================================================================
// DATA ACCESS
// ============================================================================

function _ddCustomers() {
  try { return (typeof DB !== 'undefined' && DB.getCustomers) ? (DB.getCustomers() || []) : []; }
  catch (e) { return []; }
}

function _ddSuppliers() {
  try { return (typeof DB !== 'undefined' && DB.getSuppliers) ? (DB.getSuppliers() || []) : []; }
  catch (e) { return []; }
}

function _ddParties(kind, filter) {
  var list = kind === 'supplier' ? _ddSuppliers() : _ddCustomers();
  return _ddFilterParties(kind, filter, list);
}

// Largest debt first, then name — filter() above already returned a copy so the
// DB cache is never mutated.
function _ddSorted(kind, filter) {
  return _ddParties(kind, filter).sort(function (a, b) {
    var d = Math.abs(parseFloat(b.balance) || 0) - Math.abs(parseFloat(a.balance) || 0);
    if (Math.abs(d) > 1e-9) return d;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
  });
}

// ============================================================================
// LABELS (resolved from i18n with Arabic fallbacks)
// ============================================================================

function _ddFilterTitle(kind, filter) {
  var isSup = kind === 'supplier';
  if (filter === 'owing') return isSup ? ddT('debtDetails.filterOwingSup', 'الموردون الذين يدينون لنا') : ddT('debtDetails.filterOwingCust', 'العملاء الذين عليهم دين');
  if (filter === 'owed') return isSup ? ddT('debtDetails.filterOwedSup', 'الموردون الذين علينا دين لهم') : ddT('debtDetails.filterOwedCust', 'العملاء الذين ندين لهم');
  return isSup ? ddT('debtDetails.filterAllSup', 'كل الموردين') : ddT('debtDetails.filterAllCust', 'كل العملاء');
}

function _ddLabels(kind, filter) {
  return {
    title: ddT('debtDetails.sheetTitle', 'تفاصيل الديون') + ' — ' + _ddFilterTitle(kind, filter),
    sheetTitle: ddT('debtDetails.sheetTitle', 'تفاصيل الديون'),
    dateLabel: ddT('debtDetails.dateLabel', 'تاريخ التصدير'),
    countLabel: ddT('debtDetails.countLabel', 'عدد الأطراف'),
    by: ddT('debtDetails.by', 'بواسطة'),
    colIndex: ddT('debtDetails.colIndex', '#'),
    colName: ddT('debtDetails.colName', 'الاسم'),
    colPhone: ddT('debtDetails.colPhone', 'الهاتف'),
    colAddress: ddT('debtDetails.colAddress', 'العنوان'),
    colBalance: ddT('debtDetails.colBalance', 'الرصيد'),
    colStatus: ddT('debtDetails.colStatus', 'الحالة'),
    total: ddT('debtDetails.total', 'الإجمالي'),
    statusOwingUs: ddT('debtDetails.statusOwingUs', 'يدين لنا'),
    statusWeOwe: ddT('debtDetails.statusWeOwe', 'ندين له'),
  };
}

// ============================================================================
// PAGE INIT
// ============================================================================

function init_debt_details() {
  _ddViewKind = null;
  _ddViewFilter = null;
  _ddMode = 'view';
  _ddSearchQuery = '';
  _ddCritQuery = '';
  // Fresh critical-debts computation on every visit (data may have changed
  // elsewhere while the page was away).
  _ddCritCache = null;
  var si = document.getElementById('ddSearchInput');
  if (si) si.value = '';
  var sc = document.getElementById('ddSearchClear');
  if (sc) sc.style.display = 'none';
  var ci = document.getElementById('ddCritSearch');
  if (ci) ci.value = '';
  var cc = document.getElementById('ddCritClear');
  if (cc) cc.style.display = 'none';
  // The alerts configuration is a manager-only tool.
  var ab = document.getElementById('ddAlertsBtn');
  if (ab) ab.style.display = _ddIsManager() ? '' : 'none';
  ddRenderSummary();
  ddRenderEmpty();
  _ddBindGlobalOnce();
  ddRenderAlertsState();
  // Show the critical list whenever the feature is on, or when the reminder's
  // «عرض» button asked for it.
  if (_ddAlertCfg().enabled) ddShowCritical();
  if (window._ddOpenCriticalOnInit) { window._ddOpenCriticalOnInit = false; ddShowCritical(); }
}
window.init_debt_details = init_debt_details;

function ddRenderSummary() {
  var tt = _ddTotalsFrom(_ddCustomers(), _ddSuppliers());
  _ddSetText('ddOnCustomers', 'DA' + fmtMoney(tt.onCustomers));
  _ddSetText('ddToSuppliers', 'DA' + fmtMoney(tt.toSuppliers));
  _ddSetText('ddToCustomers', 'DA' + fmtMoney(tt.toCustomers));
  _ddSetText('ddFromSuppliers', 'DA' + fmtMoney(tt.fromSuppliers));
}

function ddRenderEmpty() {
  var host = document.getElementById('ddResults');
  if (!host) return;
  host.innerHTML = '<div class="placeholder-box"><i class="fas fa-hand-pointer"></i><p>' +
    ddT('debtDetails.emptyResults', 'اختر خيار عرض من الأزرار أعلاه لعرض القائمة') + '</p></div>';
}

// ============================================================================
// DROPDOWNS
// ============================================================================

function _ddSetMenuOpen(menuEl, open) {
  if (!menuEl) return;
  menuEl.classList.toggle('open', !!open);
  var wrap = menuEl.closest ? menuEl.closest('.dd-dropdown') : null;
  if (wrap) wrap.classList.toggle('open', !!open);
}

function ddToggleMenu(which, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  var target = document.getElementById(which);
  ['ddCustMenu', 'ddSupMenu'].forEach(function (id) {
    if (id !== which) _ddSetMenuOpen(document.getElementById(id), false);
  });
  if (target) _ddSetMenuOpen(target, !target.classList.contains('open'));
}

function ddCloseMenus() {
  ['ddCustMenu', 'ddSupMenu'].forEach(function (id) {
    _ddSetMenuOpen(document.getElementById(id), false);
  });
}

function _ddBindGlobalOnce() {
  if (window._ddOutsideBound) return;
  window._ddOutsideBound = true;
  document.addEventListener('click', function (e) {
    var node = e.target;
    if (node && node.closest && node.closest('.dd-dropdown')) return;
    ddCloseMenus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') ddCloseMenus();
  });
}

// ============================================================================
// VIEW (on-page table)
// ============================================================================

function ddView(kind, filter) {
  ddCloseMenus();
  _ddMode = 'view';
  _ddSearchQuery = '';
  var sc = document.getElementById('ddSearchClear');
  if (sc) sc.style.display = 'none';
  var si = document.getElementById('ddSearchInput');
  if (si) si.value = '';
  _ddViewKind = kind;
  _ddViewFilter = filter;
  var host = document.getElementById('ddResults');
  if (!host) return;

  var parties = _ddSorted(kind, filter);
  var title = _ddFilterTitle(kind, filter);
  var total = parties.reduce(function (s, p) { return s + (parseFloat(p.balance) || 0); }, 0);
  var totalCls = total > DD_TOL ? 'dd-bal-pos' : (total < -DD_TOL ? 'dd-bal-neg' : 'dd-bal-zero');

  var rows = parties.map(function (p, i) {
    var b = parseFloat(p.balance) || 0;
    var sk = _ddStatusKey(kind, b);
    var stLabel = sk === 'owingUs' ? ddT('debtDetails.statusOwingUs', 'يدين لنا')
      : (sk === 'weOwe' ? ddT('debtDetails.statusWeOwe', 'ندين له') : '—');
    var stCls = sk === 'owingUs' ? 'dd-st-owing' : (sk === 'weOwe' ? 'dd-st-owe' : 'dd-st-zero');
    var balCls = b > DD_TOL ? 'dd-bal-pos' : (b < -DD_TOL ? 'dd-bal-neg' : 'dd-bal-zero');
    var sign = b < 0 ? '-' : '';
    return '<tr>' +
      '<td class="dd-c-idx">' + (i + 1) + '</td>' +
      '<td class="dd-c-name">' + escHtml(p.name || '') + '</td>' +
      '<td class="dd-c-phone" dir="ltr">' + escHtml(p.phone || '') + '</td>' +
      '<td class="dd-c-addr">' + escHtml(p.address || '') + '</td>' +
      '<td class="dd-c-bal ' + balCls + '">' + sign + 'DA' + fmtMoney(Math.abs(b)) + '</td>' +
      '<td class="dd-c-status"><span class="dd-chip ' + stCls + '">' + stLabel + '</span></td>' +
      '</tr>';
  }).join('');

  host.innerHTML =
    '<div class="dd-res-head">' +
      '<div class="dd-res-title"><i class="fas fa-list-ul"></i> ' + escHtml(title) + '</div>' +
      '<div class="dd-res-meta">' +
        '<span class="dd-res-count">' + ddT('debtDetails.countLabel', 'عدد الأطراف') + ': <strong>' + parties.length + '</strong></span>' +
        '<span class="dd-res-total">' + ddT('debtDetails.total', 'الإجمالي') + ': <strong class="' + totalCls + '">' +
          (total < 0 ? '-' : '') + 'DA' + fmtMoney(Math.abs(total)) + '</strong></span>' +
        (parties.length ? '<button class="btn btn-sm" onclick="ddPrint()"><i class="fas fa-print"></i> ' +
          ddT('debtDetails.print', 'طباعة') + '</button>' : '') +
      '</div>' +
    '</div>' +
    (parties.length === 0
      ? '<div class="placeholder-box" style="padding:30px 0"><i class="fas fa-inbox"></i><p>' +
          ddT('debtDetails.noMatch', 'لا يوجد أطراف مطابقون لهذا الفلتر') + '</p></div>'
      : '<div class="dd-table-wrap"><table class="data-table dd-table">' +
          '<thead><tr>' +
            '<th class="dd-c-idx">' + ddT('debtDetails.colIndex', '#') + '</th>' +
            '<th class="dd-c-name">' + ddT('debtDetails.colName', 'الاسم') + '</th>' +
            '<th class="dd-c-phone">' + ddT('debtDetails.colPhone', 'الهاتف') + '</th>' +
            '<th class="dd-c-addr">' + ddT('debtDetails.colAddress', 'العنوان') + '</th>' +
            '<th class="dd-c-bal">' + ddT('debtDetails.colBalance', 'الرصيد') + '</th>' +
            '<th class="dd-c-status">' + ddT('debtDetails.colStatus', 'الحالة') + '</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '<tfoot><tr>' +
            '<td colspan="4" class="dd-foot-label">' + ddT('debtDetails.total', 'الإجمالي') + '</td>' +
            '<td class="dd-c-bal ' + totalCls + '">' + (total < 0 ? '-' : '') + 'DA' + fmtMoney(Math.abs(total)) + '</td>' +
            '<td></td>' +
          '</tr></tfoot>' +
        '</table></div>');
}

// ============================================================================
// SEARCH (customers + suppliers, by name or phone)
// ============================================================================

function ddSearchInput(value) {
  var clearBtn = document.getElementById('ddSearchClear');
  if (clearBtn) clearBtn.style.display = String(value || '').length ? 'flex' : 'none';
  if (_ddSearchTimer) clearTimeout(_ddSearchTimer);
  _ddSearchTimer = setTimeout(function () { ddSearch(value); }, 160);
}

function ddSearchKey(ev) {
  if (ev && ev.key === 'Enter') {
    if (_ddSearchTimer) clearTimeout(_ddSearchTimer);
    ddSearch(ev.target ? ev.target.value : '');
  } else if (ev && ev.key === 'Escape') {
    ddClearSearch();
  }
}

function ddClearSearch() {
  if (_ddSearchTimer) clearTimeout(_ddSearchTimer);
  var si = document.getElementById('ddSearchInput');
  if (si) { si.value = ''; si.focus(); }
  var sc = document.getElementById('ddSearchClear');
  if (sc) sc.style.display = 'none';
  _ddMode = 'view';
  _ddSearchQuery = '';
  ddRenderEmpty();
}

function ddSearch(rawQuery) {
  var query = String(rawQuery == null ? '' : rawQuery).trim();
  _ddMode = 'search';
  _ddSearchQuery = query;
  _ddViewKind = null;
  _ddViewFilter = null;
  var host = document.getElementById('ddResults');
  if (!host) return;

  // Empty box → back to the neutral placeholder.
  if (!query) { ddRenderEmpty(); return; }

  var results = _ddSearchAll(query, _ddCustomers(), _ddSuppliers());
  var custCount = results.filter(function (r) { return r.kind === 'customer'; }).length;
  var supCount = results.length - custCount;

  var rows = results.map(function (r, i) {
    var p = r.party, kind = r.kind;
    var b = parseFloat(p.balance) || 0;
    var sk = _ddStatusKey(kind, b);
    var stLabel = sk === 'owingUs' ? ddT('debtDetails.statusOwingUs', 'يدين لنا')
      : (sk === 'weOwe' ? ddT('debtDetails.statusWeOwe', 'ندين له') : '—');
    var stCls = sk === 'owingUs' ? 'dd-st-owing' : (sk === 'weOwe' ? 'dd-st-owe' : 'dd-st-zero');
    var balCls = b > DD_TOL ? 'dd-bal-pos' : (b < -DD_TOL ? 'dd-bal-neg' : 'dd-bal-zero');
    var typeLabel = kind === 'supplier' ? ddT('debtDetails.typeSupplier', 'مورّد') : ddT('debtDetails.typeCustomer', 'عميل');
    var typeCls = kind === 'supplier' ? 'dd-type-sup' : 'dd-type-cust';
    var sign = b < 0 ? '-' : '';
    return '<tr>' +
      '<td class="dd-c-idx">' + (i + 1) + '</td>' +
      '<td class="dd-c-type"><span class="dd-type ' + typeCls + '">' + typeLabel + '</span></td>' +
      '<td class="dd-c-name">' + escHtml(p.name || '') + '</td>' +
      '<td class="dd-c-phone" dir="ltr">' + escHtml(p.phone || '') + '</td>' +
      '<td class="dd-c-addr">' + escHtml(p.address || '') + '</td>' +
      '<td class="dd-c-bal ' + balCls + '">' + sign + 'DA' + fmtMoney(Math.abs(b)) + '</td>' +
      '<td class="dd-c-status"><span class="dd-chip ' + stCls + '">' + stLabel + '</span></td>' +
      '</tr>';
  }).join('');

  host.innerHTML =
    '<div class="dd-res-head">' +
      '<div class="dd-res-title"><i class="fas fa-magnifying-glass"></i> ' +
        ddT('debtDetails.searchResults', 'نتائج البحث') + ': "' + escHtml(query) + '"</div>' +
      '<div class="dd-res-meta">' +
        '<span class="dd-res-count">' + ddT('debtDetails.typeCustomer', 'عميل') + ': <strong>' + custCount +
          '</strong> · ' + ddT('debtDetails.typeSupplier', 'مورّد') + ': <strong>' + supCount + '</strong></span>' +
        (results.length ? '<button class="btn btn-sm" onclick="ddPrint()"><i class="fas fa-print"></i> ' +
          ddT('debtDetails.print', 'طباعة') + '</button>' : '') +
      '</div>' +
    '</div>' +
    (results.length === 0
      ? '<div class="placeholder-box" style="padding:30px 0"><i class="fas fa-user-slash"></i><p>' +
          ddT('debtDetails.noSearchResults', 'لا توجد نتائج مطابقة') + '</p></div>'
      : '<div class="dd-table-wrap"><table class="data-table dd-table">' +
          '<thead><tr>' +
            '<th class="dd-c-idx">' + ddT('debtDetails.colIndex', '#') + '</th>' +
            '<th class="dd-c-type">' + ddT('debtDetails.colType', 'النوع') + '</th>' +
            '<th class="dd-c-name">' + ddT('debtDetails.colName', 'الاسم') + '</th>' +
            '<th class="dd-c-phone">' + ddT('debtDetails.colPhone', 'الهاتف') + '</th>' +
            '<th class="dd-c-addr">' + ddT('debtDetails.colAddress', 'العنوان') + '</th>' +
            '<th class="dd-c-bal">' + ddT('debtDetails.colBalance', 'الرصيد') + '</th>' +
            '<th class="dd-c-status">' + ddT('debtDetails.colStatus', 'الحالة') + '</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>');
}

// ============================================================================
// DEBT ALERTS + CRITICAL-DEBTS LIST
// ----------------------------------------------------------------------------
// A manager configures a scope (customers / suppliers / both) and a duration
// (week · two weeks · month · two months). Any party in that scope who owes us
// and whose outstanding debt is at least that old lands in «قائمة الديون
// الحرجة». When the feature is enabled a once-a-day reminder greets the
// operator on start-up, with a «عرض» button that opens the list.
//
// Everything is additive and stored in localStorage (key zmt_debt_alerts), so
// no database, invoice, print or sync path is touched.
// ============================================================================

var DD_ALERTS_KEY = 'zmt_debt_alerts';
var DD_ALERT_SHOWN_KEY = 'zmt_debt_alert_shown';
var DD_ALERT_DAYS = [7, 14, 30, 60]; // أسبوع · أسبوعان · شهر · شهران

var _ddAlertDraft = null;   // modal working copy
var _ddCritQuery = '';      // critical-list search text
var _ddCritTimer = null;
var _ddCritCache = null;    // { key, list } — cheap invalidation by data shape

function _ddIsManager() {
  try {
    if (typeof Auth === 'undefined') return true;
    if (typeof Auth.isManager === 'function') return Auth.isManager();
    return true;
  } catch (e) { return true; }
}

// ---- config (localStorage) -------------------------------------------------

function _ddAlertCfg() {
  var def = { enabled: false, scope: 'both', days: 30 };
  try {
    var raw = localStorage.getItem(DD_ALERTS_KEY);
    if (!raw) return def;
    var o = JSON.parse(raw) || {};
    var scope = (o.scope === 'customers' || o.scope === 'suppliers' || o.scope === 'both') ? o.scope : 'both';
    var days = parseInt(o.days, 10);
    if (DD_ALERT_DAYS.indexOf(days) === -1) days = 30;
    return { enabled: !!o.enabled, scope: scope, days: days };
  } catch (e) { return def; }
}

function _ddSaveAlertCfg(cfg) {
  try { localStorage.setItem(DD_ALERTS_KEY, JSON.stringify(cfg)); } catch (e) {}
}

// ---- pure aging (sign-aware FIFO) ------------------------------------------

function _ddDaysAgo(ts) {
  var t = Number(ts) || 0;
  if (!t) return 0;
  var d = Math.floor((Date.now() - t) / 86400000);
  return d < 0 ? 0 : d;
}

// Business timestamp of a ledger entry. Records migrated/imported from another
// system keep the real movement date in `date` while `createdAt` is only the
// import time — so aging by `createdAt` would make every imported debt look
// brand new. Prefer the business `date` when it parses, fall back to the entry
// timestamp (which is `createdAt`). Pure.
function _ddEntryTs(e) {
  var d = e && e.date;
  var t = 0;
  if (typeof d === 'number') t = d;
  else if (typeof d === 'string' && /^\d+$/.test(d)) t = parseInt(d, 10);
  else if (d) t = new Date(d).getTime();
  if (isFinite(t) && t > 0) return t;
  return Number(e && e.ts) || 0;
}

// Allocate `owed` (what the party owes US) newest-first over the ledger entries
// that represent debt in our favour. `dir` is +1 for customers (delta > 0 =
// they owe us) and −1 for suppliers (delta < 0 = they owe us). Whatever the
// recorded movements cannot cover comes from the derived opening balance, whose
// exact age is unknown — it is treated as the oldest (365 days). Entries are
// dated by their business `date` when present, so imported rows (whose
// `createdAt` is only the import time) keep their real movement age. Returns
// the age of the oldest still-outstanding slice. Pure — unit-tested directly.
function _ddAgingForOwed(entries, owed, dir) {
  var out = { oldestDays: 0, allocated: 0, unmatched: 0 };
  owed = parseFloat(owed) || 0;
  if (owed <= DD_TOL) return out;
  var debts = (entries || []).filter(function (e) {
    if (!e || e.informational) return false;
    var d = dir < 0 ? -(parseFloat(e.delta) || 0) : (parseFloat(e.delta) || 0);
    return d > DD_TOL;
  });
  debts.sort(function (a, b) { return _ddEntryTs(b) - _ddEntryTs(a); });
  var left = owed;
  debts.forEach(function (e) {
    if (left <= DD_TOL) return;
    var d = dir < 0 ? -(parseFloat(e.delta) || 0) : (parseFloat(e.delta) || 0);
    var take = Math.min(left, d);
    left -= take;
    if (take > 0) out.oldestDays = Math.max(out.oldestDays, _ddDaysAgo(_ddEntryTs(e)));
  });
  if (left > DD_TOL) {
    out.unmatched = left;
    out.oldestDays = Math.max(out.oldestDays, 365);
  }
  out.allocated = owed - left;
  return out;
}

// The critical list: parties in scope who owe us and whose oldest outstanding
// debt is at least `cfg.days` old. `buildFn` is injectable for unit tests; by
// default it uses the shared PartyMovements ledger. Pure w.r.t. its inputs.
function _ddCriticalDebts(cfg, customers, suppliers, buildFn) {
  cfg = cfg || _ddAlertCfg();
  if (!cfg || !cfg.enabled) return [];
  var days = parseInt(cfg.days, 10) || 30;
  var scope = cfg.scope || 'both';
  // Prefer the shared memoised ledger: with alerts enabled the page used to
  // rebuild every owing party's history on each visit. `buildCached` returns
  // the very same object `build` would, and falls back to `build` when the DB
  // has no revision counter — so results are unchanged either way.
  var build = buildFn ||
    ((typeof PartyMovements !== 'undefined' && PartyMovements.buildCached) ? PartyMovements.buildCached :
     ((typeof PartyMovements !== 'undefined' && PartyMovements.build) ? PartyMovements.build : null));
  var out = [];
  function scan(list, kind) {
    (list || []).forEach(function (p) {
      var b = parseFloat(p.balance) || 0;
      var owed, dir;
      if (kind === 'supplier') { if (b >= -DD_TOL) return; owed = -b; dir = -1; }
      else { if (b <= DD_TOL) return; owed = b; dir = 1; }
      var res = null;
      try { res = build ? build(kind, p) : null; } catch (e) { res = null; }
      var ag = _ddAgingForOwed(res ? res.entries : [], owed, dir);
      if (ag.oldestDays >= days) out.push({ kind: kind, party: p, owed: owed, oldestDays: ag.oldestDays });
    });
  }
  if (scope === 'customers' || scope === 'both') scan(customers, 'customer');
  if (scope === 'suppliers' || scope === 'both') scan(suppliers, 'supplier');
  out.sort(function (a, b) { return (b.oldestDays - a.oldestDays) || (b.owed - a.owed); });
  return out;
}

function _ddCritKey(cfg) {
  // The old key watched only list lengths: editing an invoice/balance left the
  // "critical debts" panel stale until a page reload. Folding in the DB data
  // revision (when available) fixes that without changing the feature.
  var ver = '';
  try { if (typeof DB !== 'undefined' && DB && typeof DB.dataVersion === 'function') ver = DB.dataVersion(); } catch (e) {}
  var scope = '';
  try { scope = (localStorage.getItem('zmt_active_company') || '') + '|' + (localStorage.getItem('zmt_store_code') || ''); } catch (e) {}
  return (cfg.enabled ? 1 : 0) + '|' + cfg.scope + '|' + cfg.days + '|' + ver + '|' + scope + '|' +
    _ddCustomers().length + '|' + _ddSuppliers().length;
}

// Cached critical list (invalidated when the data shape or config changes).
function _ddCritList() {
  var cfg = _ddAlertCfg();
  if (!cfg.enabled) return [];
  var key = _ddCritKey(cfg);
  if (_ddCritCache && _ddCritCache.key === key) return _ddCritCache.list;
  var list = _ddCriticalDebts(cfg, _ddCustomers(), _ddSuppliers());
  _ddCritCache = { key: key, list: list };
  return list;
}

// ---- settings modal --------------------------------------------------------

function ddOpenAlerts() {
  if (!_ddIsManager()) return;
  var cfg = _ddAlertCfg();
  _ddAlertDraft = { enabled: cfg.enabled, scope: cfg.scope, days: cfg.days };
  var m = document.getElementById('ddAlertsModal');
  if (!m) return;
  // The page root (.page) and the content container carry a transform/contain
  // (perf optimisation), which turns them into the containing block for
  // position:fixed children — a modal left inside the page would be centred in
  // the whole (tall) page instead of the viewport, appearing far below. Hoist it
  // to <body> while open, exactly like settings.js / sales.js do, and restore it
  // on close so re-navigation re-injects a single copy.
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  m.style.display = 'flex';
  _ddPaintAlertsModal();
}

function _ddPaintAlertsModal() {
  var d = _ddAlertDraft || { enabled: false, scope: 'both', days: 30 };
  var seg = document.getElementById('ddAlertScope');
  if (seg) seg.querySelectorAll('button').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-scope') === d.scope);
  });
  var en = document.getElementById('ddAlertEnable');
  if (en) en.querySelectorAll('button').forEach(function (b) {
    b.classList.toggle('active', (b.getAttribute('data-en') === '1') === d.enabled);
  });
  var du = document.getElementById('ddAlertDuration');
  if (du) du.querySelectorAll('button').forEach(function (b) {
    b.classList.toggle('active', parseInt(b.getAttribute('data-days'), 10) === d.days);
  });
  var durField = document.getElementById('ddAlertDurationField');
  if (durField) durField.style.display = d.enabled ? '' : 'none';
}

function ddSetAlertScope(scope) { if (_ddAlertDraft) { _ddAlertDraft.scope = scope; _ddPaintAlertsModal(); } }
function ddSetAlertEnabled(v) { if (_ddAlertDraft) { _ddAlertDraft.enabled = !!v; _ddPaintAlertsModal(); } }
function ddSetAlertDuration(days) { if (_ddAlertDraft) { _ddAlertDraft.days = parseInt(days, 10) || 30; _ddPaintAlertsModal(); } }

function ddCloseAlerts() {
  var m = document.getElementById('ddAlertsModal');
  if (!m) return;
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
}

function ddSaveAlerts() {
  if (!_ddAlertDraft) return;
  _ddSaveAlertCfg(_ddAlertDraft);
  _ddCritCache = null;
  ddCloseAlerts();
  ddRenderAlertsState();
  var panel = document.getElementById('ddCriticalPanel');
  if (_ddAlertDraft.enabled) ddShowCritical();
  else if (panel) panel.style.display = 'none';
  try { alert(ddT('debtDetails.alertsSaved', 'تم حفظ إعدادات التنبيهات')); } catch (e) {}
}

// Small badge on the toolbar button: number of critical parties (when enabled).
function ddRenderAlertsState() {
  var chip = document.getElementById('ddAlertsChip');
  if (!chip) return;
  var cfg = _ddAlertCfg();
  if (!cfg.enabled) { chip.style.display = 'none'; return; }
  var list = [];
  try { list = _ddCritList(); } catch (e) {}
  chip.style.display = '';
  chip.textContent = list.length;
  chip.classList.toggle('is-zero', list.length === 0);
}

// ---- critical list (on-page) ----------------------------------------------

function ddShowCritical() {
  var panel = document.getElementById('ddCriticalPanel');
  if (!panel) return;
  panel.style.display = '';
  ddRenderCritical();
  try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
}

function ddCritSearchInput(value) {
  var clearBtn = document.getElementById('ddCritClear');
  if (clearBtn) clearBtn.style.display = String(value || '').length ? 'flex' : 'none';
  if (_ddCritTimer) clearTimeout(_ddCritTimer);
  _ddCritTimer = setTimeout(function () { _ddCritQuery = String(value || '').trim(); ddRenderCritical(); }, 160);
}

function ddCritKey(ev) {
  if (ev && ev.key === 'Enter') { if (_ddCritTimer) clearTimeout(_ddCritTimer); _ddCritQuery = String(ev.target ? ev.target.value : '').trim(); ddRenderCritical(); }
  else if (ev && ev.key === 'Escape') ddCritClear();
}

function ddCritClear() {
  if (_ddCritTimer) clearTimeout(_ddCritTimer);
  _ddCritQuery = '';
  var si = document.getElementById('ddCritSearch');
  if (si) { si.value = ''; si.focus(); }
  var sc = document.getElementById('ddCritClear');
  if (sc) sc.style.display = 'none';
  ddRenderCritical();
}

function ddRenderCritical() {
  var host = document.getElementById('ddCriticalBody');
  if (!host) return;
  var cfg = _ddAlertCfg();
  var countEl = document.getElementById('ddCritCount');

  if (!cfg.enabled) {
    if (countEl) countEl.textContent = '';
    host.innerHTML = '<div class="placeholder-box" style="padding:26px 0"><i class="fas fa-bell-slash"></i><p>' +
      ddT('debtDetails.criticalDisabled', 'تنبيهات الديون غير مفعّلة') + '</p></div>';
    return;
  }

  var list = _ddCritList();
  var q = _ddNorm(_ddCritQuery);
  if (q) {
    list = list.filter(function (r) {
      return _ddNorm(r.party.name).indexOf(q) !== -1 || _ddNorm(r.party.phone).indexOf(q) !== -1;
    });
  }
  if (countEl) countEl.textContent = list.length ? ('(' + list.length + ')') : '';

  if (!list.length) {
    host.innerHTML = '<div class="placeholder-box" style="padding:26px 0"><i class="fas fa-circle-check"></i><p>' +
      (_ddCritQuery ? ddT('debtDetails.noSearchResults', 'لا توجد نتائج مطابقة') : ddT('debtDetails.criticalEmpty', 'لا توجد ديون حرجة حالياً')) +
      '</p></div>';
    return;
  }

  var total = list.reduce(function (s, r) { return s + r.owed; }, 0);
  var rows = list.map(function (r, i) {
    var kind = r.kind;
    var typeLabel = kind === 'supplier' ? ddT('debtDetails.typeSupplier', 'مورّد') : ddT('debtDetails.typeCustomer', 'عميل');
    var typeCls = kind === 'supplier' ? 'dd-type-sup' : 'dd-type-cust';
    var days = r.oldestDays;
    var ageCls = days >= 60 ? 'dd-age-red' : (days >= 30 ? 'dd-age-orange' : 'dd-age-amber');
    return '<tr>' +
      '<td class="dd-c-idx">' + (i + 1) + '</td>' +
      '<td class="dd-c-type"><span class="dd-type ' + typeCls + '">' + typeLabel + '</span></td>' +
      '<td class="dd-c-name">' + escHtml(r.party.name || '') + '</td>' +
      '<td class="dd-c-phone" dir="ltr">' + escHtml(r.party.phone || '') + '</td>' +
      '<td class="dd-c-addr">' + escHtml(r.party.address || '') + '</td>' +
      '<td class="dd-c-bal dd-bal-pos">DA' + fmtMoney(r.owed) + '</td>' +
      '<td class="dd-c-age"><span class="dd-age-chip ' + ageCls + '">' + days + ' ' +
        ddT('debtDetails.daysUnit', 'يوم') + '</span></td>' +
      '</tr>';
  }).join('');

  host.innerHTML =
    '<div class="dd-res-head">' +
      '<div class="dd-res-meta">' +
        '<span class="dd-res-count">' + ddT('debtDetails.countLabel', 'عدد الأطراف') + ': <strong>' + list.length + '</strong></span>' +
        '<span class="dd-res-total">' + ddT('debtDetails.total', 'الإجمالي') + ': <strong class="dd-bal-pos">DA' + fmtMoney(total) + '</strong></span>' +
      '</div>' +
    '</div>' +
    '<div class="dd-table-wrap"><table class="data-table dd-table">' +
      '<thead><tr>' +
        '<th class="dd-c-idx">' + ddT('debtDetails.colIndex', '#') + '</th>' +
        '<th class="dd-c-type">' + ddT('debtDetails.colType', 'النوع') + '</th>' +
        '<th class="dd-c-name">' + ddT('debtDetails.colName', 'الاسم') + '</th>' +
        '<th class="dd-c-phone">' + ddT('debtDetails.colPhone', 'الهاتف') + '</th>' +
        '<th class="dd-c-addr">' + ddT('debtDetails.colAddress', 'العنوان') + '</th>' +
        '<th class="dd-c-bal">' + ddT('debtDetails.colOwed', 'المبلغ المستحق') + '</th>' +
        '<th class="dd-c-age">' + ddT('debtDetails.colAge', 'العمر (أيام)') + '</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr>' +
        '<td colspan="5" class="dd-foot-label">' + ddT('debtDetails.total', 'الإجمالي') + '</td>' +
        '<td class="dd-c-bal dd-bal-pos">DA' + fmtMoney(total) + '</td>' +
        '<td></td>' +
      '</tr></tfoot>' +
    '</table></div>';
}

// ---- critical export / print ----------------------------------------------

function _ddCriticalLabels() {
  return {
    title: ddT('debtDetails.criticalTitle', 'قائمة الديون الحرجة'),
    dateLabel: ddT('debtDetails.dateLabel', 'تاريخ التصدير'),
    countLabel: ddT('debtDetails.countLabel', 'عدد الأطراف'),
    by: ddT('debtDetails.by', 'بواسطة'),
    colIndex: ddT('debtDetails.colIndex', '#'),
    colType: ddT('debtDetails.colType', 'النوع'),
    colName: ddT('debtDetails.colName', 'الاسم'),
    colPhone: ddT('debtDetails.colPhone', 'الهاتف'),
    colOwed: ddT('debtDetails.colOwed', 'المبلغ المستحق'),
    colAge: ddT('debtDetails.colAge', 'العمر (أيام)'),
    total: ddT('debtDetails.total', 'الإجمالي'),
    typeCustomer: ddT('debtDetails.typeCustomer', 'عميل'),
    typeSupplier: ddT('debtDetails.typeSupplier', 'مورّد'),
  };
}

// 6 columns — same shape as _ddBuildAoa so _ddStyleSheet applies unchanged.
function _ddBuildCriticalAoa(list, L, meta) {
  meta = meta || {};
  list = list || [];
  var headers = [L.colIndex, L.colType, L.colName, L.colPhone, L.colOwed, L.colAge];
  var aoa = [
    [L.title],
    [L.dateLabel + ': ' + (meta.date || ''), L.countLabel + ': ' + list.length,
      (L.by || '') + (meta.user ? ': ' + meta.user : '')],
    [],
    headers,
  ];
  var total = 0;
  list.forEach(function (r, i) {
    total += r.owed;
    aoa.push([i + 1, r.kind === 'supplier' ? L.typeSupplier : L.typeCustomer,
      r.party.name || '', r.party.phone || '', r.owed, r.oldestDays]);
  });
  aoa.push([]);
  aoa.push([L.total, '', '', '', total, '']);
  return { aoa: aoa, total: total, count: list.length, dataStart: 4 };
}

function _ddWriteWorkbook(built, fname, sheetName) {
  var api = window.electronAPI;
  try {
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(built.aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
    _ddStyleSheet(ws, built);
    if (api && api.saveFile && api.writeFileBinary) {
      api.saveFile({ defaultPath: fname + '.xlsx', filters: [{ name: 'Excel', extensions: ['xlsx'] }] }).then(function (r) {
        if (!r || r.canceled || !r.filePath) return;
        var b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        api.writeFileBinary(r.filePath, b64).then(function (res) {
          alert(res && res.success ? ddT('debtDetails.exportOk', 'تم التصدير بنجاح') : ddT('debtDetails.exportFail', 'تعذّر التصدير'));
        });
      });
    } else {
      XLSX.writeFile(wb, fname + '.xlsx');
      alert(ddT('debtDetails.exportOk', 'تم التصدير بنجاح'));
    }
  } catch (e) {
    alert(ddT('debtDetails.exportFail', 'تعذّر التصدير'));
  }
}

function ddCritExport() {
  var list = _ddCritList();
  if (!list.length) { alert(ddT('debtDetails.nothingToExport', 'لا توجد بيانات للتصدير')); return; }
  var L = _ddCriticalLabels();
  var meta = { date: new Date().toLocaleString('ar-EG-u-nu-latn'), user: ddUserName() };
  var built = _ddBuildCriticalAoa(list, L, meta);
  _ddWriteWorkbook(built, 'ZMT_CriticalDebts_' + ddTodayStr(), L.title);
}

function ddCritPrint() {
  var list = _ddCritList();
  if (!list.length) { alert(ddT('debtDetails.nothingToExport', 'لا توجد بيانات للتصدير')); return; }
  var L = _ddCriticalLabels();
  var total = list.reduce(function (s, r) { return s + r.owed; }, 0);
  var body = list.map(function (r, i) {
    var typeLabel = r.kind === 'supplier' ? L.typeSupplier : L.typeCustomer;
    return '<tr><td>' + (i + 1) + '</td><td>' + escHtml(typeLabel) + '</td>' +
      '<td style="text-align:right">' + escHtml(r.party.name || '') + '</td>' +
      '<td dir="ltr">' + escHtml(r.party.phone || '') + '</td>' +
      '<td>DA' + fmtMoney(r.owed) + '</td><td>' + r.oldestDays + '</td></tr>';
  }).join('');
  var foot = '<tr><td colspan="4">' + escHtml(L.total) + '</td><td>DA' + fmtMoney(total) + '</td><td></td></tr>';
  _ddPrintDoc(L.title, [L.colIndex, L.colType, L.colName, L.colPhone, L.colOwed, L.colAge], body, foot);
}

// ---- start-up reminder -----------------------------------------------------

function ddCloseReminder() {
  var m = document.getElementById('ddReminderModal');
  if (m && m.parentNode) m.parentNode.removeChild(m);
}

function ddOpenCriticalFromAlert() {
  ddCloseReminder();
  // Already on the page → just reveal the list (re-navigating to the same page
  // does not re-run the init hook).
  if (window._currentPageId === 'debt-details') { ddShowCritical(); return; }
  window._ddOpenCriticalOnInit = true;
  if (typeof navigateTo === 'function') navigateTo('debt-details');
  else ddShowCritical();
}

// Builds and shows the reminder window; returns the number of critical parties
// (0 → nothing shown). Called once a day from app.js.
window.ddShowDebtAlertReminder = function () {
  var cfg = _ddAlertCfg();
  if (!cfg.enabled) return 0;
  var list = [];
  try { list = _ddCriticalDebts(cfg, _ddCustomers(), _ddSuppliers()); } catch (e) { return 0; }
  if (!list.length) return 0;

  ddCloseReminder();
  var total = list.reduce(function (s, r) { return s + r.owed; }, 0);
  var cust = list.filter(function (r) { return r.kind !== 'supplier'; });
  var sup = list.filter(function (r) { return r.kind === 'supplier'; });
  var custSum = cust.reduce(function (s, r) { return s + r.owed; }, 0);
  var supSum = sup.reduce(function (s, r) { return s + r.owed; }, 0);

  // Show the most critical few of EACH type so a long list of old customer
  // debts can never hide the suppliers who owe us.
  var PER_TYPE = 3;
  var pick = cust.slice(0, PER_TYPE).concat(sup.slice(0, PER_TYPE));
  var top = pick.map(function (r) {
    var typeLabel = r.kind === 'supplier' ? ddT('debtDetails.typeSupplier', 'مورّد') : ddT('debtDetails.typeCustomer', 'عميل');
    return '<li><span class="dd-rem-type">' + typeLabel + '</span>' +
      '<span class="dd-rem-name">' + escHtml(r.party.name || '') + '</span>' +
      '<b class="dd-rem-amt">DA' + fmtMoney(r.owed) + '</b>' +
      '<span class="dd-rem-age">' + r.oldestDays + ' ' + ddT('debtDetails.daysUnit', 'يوم') + '</span></li>';
  }).join('');
  var more = list.length > pick.length ? '<li class="dd-rem-more">+' + (list.length - pick.length) + ' …</li>' : '';
  var split = '<p class="dd-reminder-split">' +
      '<span class="dd-rem-split-item dd-rem-split-cust">' + ddT('debtDetails.scopeCustomers', 'عملاء') +
        ' <b>' + cust.length + '</b> · <span class="dd-rem-split-amt">DA' + fmtMoney(custSum) + '</span></span>' +
      '<span class="dd-rem-split-item dd-rem-split-sup">' + ddT('debtDetails.scopeSuppliers', 'موردون') +
        ' <b>' + sup.length + '</b> · <span class="dd-rem-split-amt">DA' + fmtMoney(supSum) + '</span></span>' +
    '</p>';

  var html = '<div class="dd-reminder-overlay" id="ddReminderModal">' +
    '<div class="dd-reminder">' +
      '<div class="dd-reminder-head">' +
        '<span class="dd-reminder-ic"><i class="fas fa-bell"></i></span>' +
        '<h3>' + ddT('debtDetails.reminderTitle', 'تنبيه: ديون حرجة') + '</h3>' +
      '</div>' +
      '<div class="dd-reminder-body">' +
        '<p>' + ddT('debtDetails.reminderMsg1', 'يوجد') + ' <b>' + list.length + '</b> ' +
          ddT('debtDetails.reminderMsg2', 'طرفاً بديون تجاوزت المدة المحددة') + '</p>' +
        '<p class="dd-reminder-total">' + ddT('debtDetails.reminderTotal', 'إجمالي المبالغ المستحقة') +
          ': <b>DA' + fmtMoney(total) + '</b></p>' +
        split +
        '<ul class="dd-reminder-list">' + top + more + '</ul>' +
      '</div>' +
      '<div class="dd-reminder-foot">' +
        '<button type="button" class="dd-rem-view" onclick="ddOpenCriticalFromAlert()"><i class="fas fa-eye"></i> ' +
          ddT('debtDetails.view', 'عرض') + '</button>' +
        '<button type="button" class="dd-rem-later" onclick="ddCloseReminder()">' +
          ddT('debtDetails.later', 'لاحقاً') + '</button>' +
      '</div>' +
    '</div></div>';

  var wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstChild);
  return list.length;
};

// ============================================================================
// EXCEL EXPORT
// ============================================================================

function _ddStyleSheet(ws, built) {
  try {
    var totalCols = 6;
    var widths = [6, 32, 16, 26, 16, 14];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }];
    ws['!cols'] = widths.map(function (w) { return { wch: w }; });
    ws['!views'] = [{ RTL: true }];

    var THIN = { style: 'thin', color: { rgb: '9DB6D8' } };
    var BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    var enc = function (r) { return function (c) { return XLSX.utils.encode_cell({ r: r, c: c }); }; };
    var cell = function (r, c) { return ws[enc(r)(c)]; };

    // Row 0 — title
    var c0 = cell(0, 0);
    if (c0) {
      c0.s = c0.s || {};
      c0.s.font = { name: 'Calibri', sz: 14, bold: true, color: { rgb: '1F3864' } };
      c0.s.alignment = { horizontal: 'center', vertical: 'center' };
    }
    // Row 1 — meta line
    for (var m = 0; m < 3; m++) {
      var mc = cell(1, m);
      if (!mc) continue;
      mc.s = mc.s || {};
      mc.s.font = { name: 'Calibri', sz: 10, color: { rgb: '595959' } };
      mc.s.alignment = { horizontal: 'center', vertical: 'center' };
    }
    // Row 3 — blue header
    for (var h = 0; h < totalCols; h++) {
      var hc = cell(3, h);
      if (!hc) continue;
      hc.s = hc.s || {};
      hc.s.font = { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } };
      hc.s.fill = { patternType: 'solid', fgColor: { rgb: '2F5496' } };
      hc.s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
      hc.s.border = BORDER;
    }
    // Data rows
    var start = built.dataStart || 4;
    for (var r = start; r < start + built.count; r++) {
      var zebra = ((r - start) % 2) === 1;
      for (var cc = 0; cc < totalCols; cc++) {
        var dc = cell(r, cc);
        if (!dc) continue;
        dc.s = dc.s || {};
        dc.s.font = { name: 'Calibri', sz: 11 };
        if (zebra) dc.s.fill = { patternType: 'solid', fgColor: { rgb: 'EDF3FB' } };
        dc.s.alignment = (cc === 1 || cc === 3)
          ? { horizontal: 'left', vertical: 'center' }
          : { horizontal: 'center', vertical: 'center' };
        dc.s.border = BORDER;
        if (cc === 4 && typeof dc.v === 'number') dc.s.numFmt = '#,##0.00';
      }
    }
    // Total row
    var tr = start + built.count + 1;
    for (var tc = 0; tc < totalCols; tc++) {
      var tcell = cell(tr, tc);
      if (!tcell) continue;
      tcell.s = tcell.s || {};
      tcell.s.font = { name: 'Calibri', sz: 11, bold: true, color: { rgb: '1F3864' } };
      tcell.s.fill = { patternType: 'solid', fgColor: { rgb: 'D9E2F3' } };
      tcell.s.alignment = { horizontal: 'center', vertical: 'center' };
      tcell.s.border = BORDER;
      if (tc === 4 && typeof tcell.v === 'number') tcell.s.numFmt = '#,##0.00';
    }
  } catch (e) { /* styling is best-effort — the data still exports */ }
}

function ddExport(kind, filter) {
  ddCloseMenus();
  var parties = _ddSorted(kind, filter);
  if (!parties.length) {
    alert(ddT('debtDetails.nothingToExport', 'لا توجد بيانات للتصدير'));
    return;
  }
  var L = _ddLabels(kind, filter);
  var meta = { date: new Date().toLocaleString('ar-EG-u-nu-latn'), user: ddUserName() };
  var built = _ddBuildAoa(kind, filter, parties, L, meta);
  var tag = filter === 'owing' ? 'Owing' : (filter === 'owed' ? 'Owed' : 'All');
  var fname = 'ZMT_' + (kind === 'supplier' ? 'Suppliers' : 'Customers') + '_' + tag + '_' + ddTodayStr();
  _ddWriteWorkbook(built, fname, L.sheetTitle || 'Debt Details');
}

// ============================================================================
// PRINT
// ============================================================================

// ---- colour / black & white print mode (shared with the movements pages) ---
function _ddPrintModeGet() {
  if (_ddPrintMode === 'bw' || _ddPrintMode === 'color') return _ddPrintMode;
  try {
    if (window.PrintMode && typeof window.PrintMode.get === 'function') return window.PrintMode.get();
  } catch (e) {}
  return 'color';
}

function _ddSyncModeButtons() {
  var mode = _ddPrintModeGet();
  try {
    var all = document.querySelectorAll ? document.querySelectorAll('.pm-print-mode') : [];
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].classList) {
        all[i].classList.toggle('active', all[i].getAttribute('data-mode') === mode);
      }
    }
  } catch (e) {}
}

function ddSetPrintMode(mode) {
  _ddPrintMode = (mode === 'bw') ? 'bw' : 'color';
  try { if (window.PrintMode && typeof window.PrintMode.set === 'function') window.PrintMode.set(_ddPrintMode); } catch (e) {}
  _ddSyncModeButtons();
  return _ddPrintMode;
}

// Mode buttons only store the preference. The actual print button rendered by
// ddView()/ddSearchInput() still calls ddPrint(), so nothing is lost — but a
// mode click no longer rebuilds every row and opens a print window.
function ddPrintColor() { ddSetPrintMode('color'); }
function ddPrintBw() { ddSetPrintMode('bw'); }

// Shared print-document writer: builds a titled, RTL, styled sheet and opens it.
function _ddPrintDoc(title, headers, bodyHtml, footHtml) {
  var mode = _ddPrintModeGet();
  var bwCss = '';
  if (mode === 'bw') {
    try {
      bwCss = (window.PrintMode && typeof window.PrintMode.bwCss === 'function')
        ? window.PrintMode.bwCss('body') : '';
    } catch (e) { bwCss = ''; }
    if (!bwCss) {
      bwCss = 'body,body *{color:#000!important;background:#fff!important;background-color:#fff!important;' +
        'border-color:#000!important;box-shadow:none!important;filter:grayscale(100%)!important}' +
        'th{background:#ececec!important;color:#000!important}tfoot td{background:#ececec!important}';
    }
  }
  var html = '<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>' + escHtml(title) + '</title>' +
    '<style>body{font-family:"Segoe UI",Tahoma,sans-serif;padding:18px;color:#222}' +
    'h2{margin:0 0 4px;color:#1F3864}.meta{color:#666;font-size:12px;margin:0 0 12px}' +
    'table{width:100%;border-collapse:collapse;font-size:12px}' +
    'th,td{border:1px solid #c9d6e8;padding:6px 8px;text-align:center}' +
    'th{background:#2F5496;color:#fff}tfoot td{font-weight:700;background:#eaf1fb}' + bwCss +
    '</style></head><body>' +
    '<h2>' + escHtml(title) + '</h2>' +
    '<p class="meta">' + escHtml(ddT('debtDetails.dateLabel', 'تاريخ التصدير')) + ': ' +
      new Date().toLocaleString('ar-EG-u-nu-latn') + '</p>' +
    '<table><thead><tr>' + headers.map(function (h) { return '<th>' + escHtml(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + bodyHtml + '</tbody>' +
    (footHtml ? '<tfoot>' + footHtml + '</tfoot>' : '') +
    '</table><script>window.onload=function(){window.print();}<\/script></body></html>';

  var w = window.open('', '_blank');
  if (!w) { alert(ddT('movements.allowPopups', 'يرجى السماح بالنوافذ المنبثقة للطباعة')); return; }
  w.document.write(html);
  w.document.close();
}

function ddPrint() {
  if (_ddMode === 'search') return _ddPrintSearch();
  if (!_ddViewKind) return;
  var kind = _ddViewKind, filter = _ddViewFilter;
  var parties = _ddSorted(kind, filter);
  var L = _ddLabels(kind, filter);
  var total = parties.reduce(function (s, p) { return s + (parseFloat(p.balance) || 0); }, 0);
  var body = parties.map(function (p, i) {
    var b = parseFloat(p.balance) || 0;
    var sk = _ddStatusKey(kind, b);
    var stLabel = sk === 'owingUs' ? L.statusOwingUs : (sk === 'weOwe' ? L.statusWeOwe : '');
    return '<tr><td>' + (i + 1) + '</td><td style="text-align:right">' + escHtml(p.name || '') + '</td>' +
      '<td dir="ltr">' + escHtml(p.phone || '') + '</td><td style="text-align:right">' + escHtml(p.address || '') + '</td>' +
      '<td>' + (b < 0 ? '-' : '') + 'DA' + fmtMoney(Math.abs(b)) + '</td><td>' + stLabel + '</td></tr>';
  }).join('');
  var foot = '<tr><td colspan="4">' + escHtml(L.total) + '</td><td>' + (total < 0 ? '-' : '') + 'DA' +
    fmtMoney(Math.abs(total)) + '</td><td></td></tr>';
  _ddPrintDoc(L.title, [L.colIndex, L.colName, L.colPhone, L.colAddress, L.colBalance, L.colStatus], body, foot);
}

function _ddPrintSearch() {
  var query = _ddSearchQuery;
  var results = _ddSearchAll(query, _ddCustomers(), _ddSuppliers());
  var title = ddT('debtDetails.searchResults', 'نتائج البحث') + ': "' + query + '"';
  var body = results.map(function (r, i) {
    var p = r.party, kind = r.kind;
    var b = parseFloat(p.balance) || 0;
    var sk = _ddStatusKey(kind, b);
    var stLabel = sk === 'owingUs' ? ddT('debtDetails.statusOwingUs', 'يدين لنا')
      : (sk === 'weOwe' ? ddT('debtDetails.statusWeOwe', 'ندين له') : '');
    var typeLabel = kind === 'supplier' ? ddT('debtDetails.typeSupplier', 'مورّد') : ddT('debtDetails.typeCustomer', 'عميل');
    return '<tr><td>' + (i + 1) + '</td><td>' + escHtml(typeLabel) + '</td>' +
      '<td style="text-align:right">' + escHtml(p.name || '') + '</td>' +
      '<td dir="ltr">' + escHtml(p.phone || '') + '</td><td style="text-align:right">' + escHtml(p.address || '') + '</td>' +
      '<td>' + (b < 0 ? '-' : '') + 'DA' + fmtMoney(Math.abs(b)) + '</td><td>' + escHtml(stLabel) + '</td></tr>';
  }).join('');
  _ddPrintDoc(title, [ddT('debtDetails.colIndex', '#'), ddT('debtDetails.colType', 'النوع'),
    ddT('debtDetails.colName', 'الاسم'), ddT('debtDetails.colPhone', 'الهاتف'),
    ddT('debtDetails.colAddress', 'العنوان'), ddT('debtDetails.colBalance', 'الرصيد'),
    ddT('debtDetails.colStatus', 'الحالة')], body, '');
}

// ============================================================================
// LAN SYNC
// ============================================================================
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['debt-details'] = function debtDetailsSyncData() {
  try {
    window.syncPreserveRefresh({
      render: function () {
        _ddCritCache = null;
        ddRenderSummary();
        ddRenderAlertsState();
        if (_ddAlertCfg().enabled) ddRenderCritical();
        if (_ddMode === 'search' && _ddSearchQuery) ddSearch(_ddSearchQuery);
        else if (_ddViewKind) ddView(_ddViewKind, _ddViewFilter);
      },
    });
  } catch (e) {}
};
