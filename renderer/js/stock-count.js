// ============================================================================
// ZMT PIECE — جرد المخزون (stock count / inventory reconciliation)
//
// A manager-only tool opened from the Zakat page. The manager adds the products
// to count, types the physical quantities, and saves: only the products whose
// counted quantity differs from the system quantity are written back, through a
// single audited batch update (DB.updateProductsBatch). No expense, no invoice
// and no sale is ever recorded — the count only sets quantities.
//
// Design notes:
//   • Products with `fixed === true` (non-quantified / menu items) ARE listed so
//     the manager can count them; they are NOT valued in the zakat total (the
//     zakat inventory computation keeps skipping them by design).
//   • Bundles are virtual and never appear here: DB.getProducts() only returns
//     real products (bundles live in a separate collection).
//   • The in-progress count is persisted per user in localStorage so an
//     accidental page switch does not lose work; it is cleared on save.
//
// Loaded globally (index.html) because it is opened from the Zakat page header.
// ============================================================================

(function (root) {
  'use strict';

  var MODAL_ID = 'stockCountModal';
  var SESSION_PREFIX = 'stock_count_session_';
  var SEARCH_CAP = 40;

  // ---------- tiny helpers -------------------------------------------------

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function roundQty(v) {
    var U = root.Unit;
    if (U && typeof U.roundQty === 'function') return U.roundQty(v);
    return Math.round(num(v) * 1000000) / 1000000;
  }

  function esc(s) {
    if (typeof root.escHtml === 'function') return root.escHtml(s == null ? '' : String(s));
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function tr(key, fallback) {
    try {
      if (typeof root.t === 'function') {
        var v = root.t(key);
        if (v) return v;
      }
    } catch (e) { /* dictionary not ready */ }
    return fallback || key;
  }

  function notify(msg) {
    try { root.alert(msg); } catch (e) { /* headless */ }
  }

  function confirmMsg(msg) {
    try {
      if (typeof root.confirm === 'function') return !!root.confirm(msg);
    } catch (e) { /* headless */ }
    return true;
  }

  function qtyText(q, row) {
    var U = root.Unit;
    if (U && typeof U.fmtQty === 'function') return U.fmtQty(q, row && row.qtyDecimals);
    return String(roundQty(q));
  }

  // Parse a typed quantity, tolerating Arabic-Indic digits (the app's global
  // toLatinDigits) so a keyboard on an Arabic layout still counts correctly.
  function parseQty(v) {
    var s = String(v == null ? '' : v);
    try { if (typeof root.toLatinDigits === 'function') s = root.toLatinDigits(s); } catch (e) { /* noop */ }
    return roundQty(num(s));
  }

  function el(id) {
    try { return root.document ? root.document.getElementById(id) : null; } catch (e) { return null; }
  }

  // ---------- access -------------------------------------------------------

  function getDB() {
    try { if (typeof DB !== 'undefined' && DB) return DB; } catch (e) { /* not in this realm */ }
    return root.DB || null;
  }

  function products() {
    var db = getDB();
    if (!db || typeof db.getProducts !== 'function') return [];
    return db.getProducts() || [];
  }

  function findProduct(id) {
    var db = getDB();
    if (!db || !id) return null;
    if (typeof db.getProduct === 'function') {
      var p = db.getProduct(id);
      if (p) return p;
    }
    var list = products();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  // Manager-only. When Auth is unavailable (tests, very early boot) we allow,
  // mirroring the convention used elsewhere (e.g. zkCanRecordZakat).
  function allowed() {
    try {
      if (root.Auth && typeof root.Auth.isManager === 'function') return !!root.Auth.isManager();
    } catch (e) { /* fall through */ }
    return true;
  }

  function userCode() {
    try {
      if (root.Auth && typeof root.Auth.getUserCode === 'function') {
        return root.Auth.getUserCode() || 'default';
      }
    } catch (e) { /* fall through */ }
    return 'default';
  }

  // ---------- pure model ---------------------------------------------------

  function makeRow(p, actualQty) {
    var systemQty = roundQty(p && p.quantity);
    return {
      id: p && p.id,
      name: (p && p.name) || '',
      barcode: (p && p.barcode) || '',
      mark: (p && p.mark) || '',
      reference: (p && p.reference) || '',
      countryOfOrigin: (p && p.countryOfOrigin) || '',
      unit: p && p.unit,
      unitLabel: p && p.unitLabel,
      qtyDecimals: p && p.qtyDecimals,
      fixed: !!(p && p.fixed === true),
      sellPrice: num(p && p.sellPrice),
      systemQty: systemQty,
      actualQty: (actualQty == null) ? systemQty : roundQty(actualQty),
    };
  }

  // Build one row per product. `actualById` seeds counted quantities (used when
  // restoring a session / in tests); products absent from it keep the system qty.
  function buildRows(list, actualById) {
    var seed = actualById || {};
    return (list || []).map(function (p) {
      var has = Object.prototype.hasOwnProperty.call(seed, p.id);
      return makeRow(p, has ? seed[p.id] : null);
    });
  }

  function diffOf(row) {
    if (!row) return 0;
    return roundQty(num(row.actualQty) - num(row.systemQty));
  }

  // Only the differing rows become updates; each carries a quantity-only change
  // so DB.updateProductsBatch never touches buy price or any other field.
  function computeUpdates(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || !r.id) return;
      var d = diffOf(r);
      if (d === 0) return;
      out.push({ id: r.id, changes: { quantity: roundQty(num(r.actualQty)) } });
    });
    return out;
  }

  function fallbackMatch(p, q) {
    var text;
    if (typeof root.normalizeSearchText === 'function') {
      text = root.normalizeSearchText([p.name, p.barcode, p.mark, p.reference, p.countryOfOrigin].filter(Boolean).join(' '));
      q = root.normalizeSearchText(q);
    } else {
      text = [p.name, p.barcode].filter(Boolean).join(' ').toLowerCase();
      q = String(q || '').toLowerCase();
    }
    return !!q && text.indexOf(q) !== -1;
  }

  // Products matching `query`, ranked by the app's shared search score. Rows
  // already on the count list are excluded. Empty query returns the first
  // `limit` products so the manager can browse.
  function filterProducts(list, query, excludeIds, limit) {
    var q = String(query == null ? '' : query).trim();
    var exclude = excludeIds || {};
    var cap = (limit && limit > 0) ? limit : SEARCH_CAP;
    var scored = [];
    for (var i = 0; i < (list || []).length; i++) {
      var p = list[i];
      if (!p || !p.id || exclude[p.id]) continue;
      var score = 1;
      if (q) {
        if (typeof root.productSearchScore === 'function') {
          score = root.productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin);
        } else {
          score = fallbackMatch(p, q) ? 1 : 0;
        }
        if (!score) continue;
      }
      scored.push({ p: p, s: score });
    }
    if (q) scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, cap).map(function (x) { return x.p; });
  }

  // ---------- session persistence -----------------------------------------

  function storageKey() {
    return SESSION_PREFIX + userCode();
  }

  function sessionSave(rows, query) {
    try {
      var data = {
        v: 1,
        at: Date.now(),
        query: query || '',
        rows: (rows || []).map(function (r) { return { id: r.id, actualQty: r.actualQty }; }),
      };
      root.localStorage.setItem(storageKey(), JSON.stringify(data));
    } catch (e) { /* storage unavailable */ }
  }

  function sessionLoad() {
    try {
      var raw = root.localStorage.getItem(storageKey());
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.rows)) return null;
      return data;
    } catch (e) { return null; }
  }

  function sessionClear() {
    try { root.localStorage.removeItem(storageKey()); } catch (e) { /* noop */ }
  }

  // ---------- runtime state ------------------------------------------------

  var _rows = [];
  var _query = '';
  var _results = [];
  var _saveTimer = null;
  var _suppressSessionSave = false;

  function scheduleSessionSave() {
    if (_suppressSessionSave) return;
    if (_saveTimer) { try { clearTimeout(_saveTimer); } catch (e) { /* noop */ } }
    try {
      _saveTimer = setTimeout(function () { _saveTimer = null; sessionSave(_rows, _query); }, 400);
    } catch (e) {
      sessionSave(_rows, _query);
    }
  }

  function cancelSessionSave() {
    if (_saveTimer) { try { clearTimeout(_saveTimer); } catch (e) { /* noop */ } }
    _saveTimer = null;
  }

  function hasRow(id) {
    for (var i = 0; i < _rows.length; i++) { if (_rows[i].id === id) return true; }
    return false;
  }

  function findRow(id) {
    for (var i = 0; i < _rows.length; i++) { if (_rows[i].id === id) return _rows[i]; }
    return null;
  }

  function currentIds() {
    var out = {};
    _rows.forEach(function (r) { out[r.id] = true; });
    return out;
  }

  function restoreSession() {
    var data = sessionLoad();
    var list = products();
    if (!data || !data.rows || !data.rows.length) { _rows = []; return; }
    var byId = {};
    list.forEach(function (p) { byId[p.id] = p; });
    var actual = {};
    var order = [];
    data.rows.forEach(function (r) {
      if (r && r.id) { order.push(r.id); actual[r.id] = r.actualQty; }
    });
    _rows = [];
    order.forEach(function (id) {
      var p = byId[id];
      if (p) _rows.push(makeRow(p, actual[id]));
    });
    _query = data.query || '';
  }

  // ---------- DOM: modal shell --------------------------------------------

  function modalHTML() {
    return '' +
      '<div class="modal" style="max-width:940px;width:96%">' +
        '<div class="modal-header">' +
          '<h3><i class="fas fa-clipboard-list"></i> <span data-i18n="zakat.countBtn">جرد المخزون</span></h3>' +
          '<button class="modal-close" type="button" onclick="StockCount.close()">&times;</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<p class="sc-sub" data-i18n="zakat.countSub">عدّ الكميات الفعلية وطابقها مع كميات النظام؛ تُصحَّح الكميات المخالفة فقط عند الحفظ.</p>' +
          '<div class="sc-toolbar">' +
            '<div class="sc-search-wrap">' +
              '<i class="fas fa-search"></i>' +
              '<input id="scSearch" class="form-input" type="text" autocomplete="off"' +
                ' data-i18n-placeholder="zakat.countSearch" placeholder="ابحث بالاسم أو الباركود...">' +
            '</div>' +
            '<button class="btn" type="button" onclick="StockCount.addFirstMatch()">' +
              '<i class="fas fa-plus"></i> <span data-i18n="zakat.countAdd">إضافة</span></button>' +
            '<button class="btn" type="button" onclick="StockCount.addAll()">' +
              '<i class="fas fa-layer-group"></i> <span data-i18n="zakat.countAddAll">إضافة كل المنتجات</span></button>' +
            '<button class="btn btn-danger" type="button" onclick="StockCount.clear()">' +
              '<i class="fas fa-broom"></i> <span data-i18n="zakat.countClear">تفريغ القائمة</span></button>' +
          '</div>' +
          '<div id="scResults" class="sc-results" style="display:none"></div>' +
          '<div class="table-container sc-table-wrap">' +
            '<table class="data-table sc-table">' +
              '<thead><tr>' +
                '<th data-i18n="zakat.countColProduct">المنتج</th>' +
                '<th style="text-align:center" data-i18n="zakat.countColSystem">كمية النظام</th>' +
                '<th style="text-align:center" data-i18n="zakat.countColActual">الكمية الفعلية</th>' +
                '<th style="text-align:center" data-i18n="zakat.countColDiff">الفرق</th>' +
                '<th></th>' +
              '</tr></thead>' +
              '<tbody id="scRows"></tbody>' +
            '</table>' +
          '</div>' +
          '<div id="scSummary" class="sc-summary"></div>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn" type="button" onclick="StockCount.printSheet()">' +
            '<i class="fas fa-print"></i> <span data-i18n="zakat.countPrint">طباعة ورقة الجرد</span></button>' +
          '<button class="btn" type="button" onclick="StockCount.close()">' +
            '<span data-i18n="common.cancel">إلغاء</span></button>' +
          '<button class="btn btn-primary" type="button" onclick="StockCount.save()">' +
            '<i class="fas fa-save"></i> <span data-i18n="zakat.countSave">حفظ الجرد</span></button>' +
        '</div>' +
      '</div>';
  }

  function ensureModal() {
    var doc = root.document;
    if (!doc) return null;
    var modal = doc.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = doc.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = MODAL_ID;
    modal.style.display = 'none';
    modal.innerHTML = modalHTML();
    doc.body.appendChild(modal);

    // Click on the dim backdrop closes the dialog.
    modal.addEventListener('mousedown', function (e) {
      if (e.target === modal) close();
    });

    var search = doc.getElementById('scSearch');
    if (search) {
      search.addEventListener('input', function () { onSearchInput(this.value); });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); addFirstMatch(); }
      });
    }

    var tbody = doc.getElementById('scRows');
    if (tbody) {
      tbody.addEventListener('input', function (e) {
        var inp = e.target;
        if (!inp || !inp.getAttribute || !inp.getAttribute('data-id')) return;
        setActual(inp.getAttribute('data-id'), inp.value);
      });
      tbody.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-remove]') : null;
        if (!btn) return;
        e.preventDefault();
        removeRow(btn.getAttribute('data-remove'));
      });
    }

    if (typeof root.applyTranslation === 'function') {
      try { root.applyTranslation(modal); } catch (e) { /* translations optional */ }
    }
    return modal;
  }

  // ---------- DOM: rendering ----------------------------------------------

  function rowHTML(r) {
    var d = diffOf(r);
    var diffCls = d > 0 ? 'sc-diff-pos' : (d < 0 ? 'sc-diff-neg' : 'sc-diff-zero');
    var diffTxt = d === 0 ? '—' : ((d > 0 ? '+' : '−') + qtyText(Math.abs(d), r));
    var name = esc(r.name || '—');
    var sub = [];
    if (r.barcode) sub.push(esc(r.barcode));
    if (r.reference) sub.push(esc(r.reference));
    return '<tr data-row="' + esc(r.id) + '">' +
      '<td class="sc-cell-product">' +
        '<div class="sc-name">' + name +
          (r.fixed ? ' <span class="sc-fixed-tag" data-i18n-title="zakat.countFixedNote" title="منتج غير مُكمّم — لا يُحتسب في قيمة الزكاة"><i class="fas fa-infinity"></i></span>' : '') +
        '</div>' +
        (sub.length ? '<div class="sc-sub-line">' + sub.join(' · ') + '</div>' : '') +
      '</td>' +
      '<td class="sc-cell-sys">' + esc(qtyText(r.systemQty, r)) + '</td>' +
      '<td class="sc-cell-actual">' +
        '<input type="text" inputmode="decimal" class="form-input sc-input" data-id="' + esc(r.id) + '"' +
          ' value="' + esc(String(r.actualQty)) + '">' +
      '</td>' +
      '<td class="sc-cell-diff ' + diffCls + '" data-diff="' + esc(r.id) + '">' + esc(diffTxt) + '</td>' +
      '<td class="sc-cell-remove">' +
        '<button class="sc-remove" type="button" data-remove="' + esc(r.id) + '" title="' + esc(tr('zakat.countColRemove', 'حذف')) + '">' +
          '<i class="fas fa-times"></i></button>' +
      '</td>' +
    '</tr>';
  }

  function renderRows() {
    var tbody = el('scRows');
    if (!tbody) return;
    if (!_rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">' +
        esc(tr('zakat.countEmpty', 'لم تُضف أي منتج بعد. ابحث وأضف المنتجات أو استخدم «إضافة كل المنتجات».')) +
        '</td></tr>';
      return;
    }
    tbody.innerHTML = _rows.map(rowHTML).join('');
  }

  function refreshRow(id) {
    var r = findRow(id);
    var cell = el('scRows') ? el('scRows').querySelector('[data-diff="' + cssEscape(id) + '"]') : null;
    if (!r || !cell) return;
    var d = diffOf(r);
    cell.className = 'sc-cell-diff ' + (d > 0 ? 'sc-diff-pos' : (d < 0 ? 'sc-diff-neg' : 'sc-diff-zero'));
    cell.textContent = d === 0 ? '—' : ((d > 0 ? '+' : '−') + qtyText(Math.abs(d), r));
  }

  function cssEscape(v) {
    return String(v == null ? '' : v).replace(/["\\]/g, '\\$&');
  }

  function refreshSummary() {
    var box = el('scSummary');
    if (!box) return;
    var diffs = 0;
    _rows.forEach(function (r) { if (diffOf(r) !== 0) diffs++; });
    box.innerHTML =
      '<span><i class="fas fa-list-ol"></i> ' + esc(tr('zakat.countRows', 'عدد الأسطر')) + ': <b>' + _rows.length + '</b></span>' +
      '<span class="' + (diffs ? 'sc-sum-pos' : '') + '"><i class="fas fa-triangle-exclamation"></i> ' +
        esc(tr('zakat.countDiffs', 'أسطر مختلفة')) + ': <b>' + diffs + '</b></span>';
  }

  function renderResults() {
    var box = el('scResults');
    if (!box) return;
    if (!_query) { box.style.display = 'none'; box.innerHTML = ''; return; }
    if (!_results.length) {
      box.style.display = 'block';
      box.innerHTML = '<div class="sc-result-empty">' + esc(tr('zakat.countNoResults', 'لا توجد نتائج مطابقة')) + '</div>';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = _results.map(function (p) {
      return '<button type="button" class="sc-result" data-add="' + esc(p.id) + '">' +
        '<span class="sc-result-name">' + esc(p.name || '—') +
          (p.fixed ? ' <span class="sc-fixed-tag"><i class="fas fa-infinity"></i></span>' : '') +
        '</span>' +
        '<span class="sc-result-meta">' + esc(p.barcode || '') +
          ' · ' + esc(qtyText(p.quantity, p)) + '</span>' +
      '</button>';
    }).join('');
    // Delegated click: add the picked product.
    if (!box._wired) {
      box._wired = true;
      box.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-add]') : null;
        if (b) addProduct(b.getAttribute('data-add'));
      });
    }
  }

  function render() {
    renderRows();
    refreshSummary();
    renderResults();
  }

  // ---------- public actions ----------------------------------------------

  function open() {
    if (!allowed()) { notify(tr('zakat.countNoPermission', 'لا تملك صلاحية الجرد — للمدير فقط.')); return; }
    var modal = ensureModal();
    if (!modal) return;
    _suppressSessionSave = false;
    restoreSession();
    var search = el('scSearch');
    if (search) search.value = _query || '';
    _results = filterProducts(products(), _query, currentIds(), SEARCH_CAP);
    modal.style.display = 'flex';
    render();
    try { if (search) setTimeout(function () { search.focus(); }, 60); } catch (e) { /* noop */ }
  }

  function close() {
    var modal = el(MODAL_ID);
    if (modal) modal.style.display = 'none';
    scheduleSessionSave();
  }
  function onSearchInput(value) {
    _query = String(value == null ? '' : value);
    _results = filterProducts(products(), _query, currentIds(), SEARCH_CAP);
    renderResults();
  }

  function addProduct(id) {
    if (!id) return;
    if (hasRow(id)) { notify(tr('zakat.countAlreadyAdded', 'المنتج مضاف مسبقاً إلى قائمة الجرد.')); return; }
    var p = findProduct(id);
    if (!p) return;
    _rows.push(makeRow(p, null));
    _query = '';
    var search = el('scSearch');
    if (search) search.value = '';
    _results = [];
    render();
    scheduleSessionSave();
    try { if (search) search.focus(); } catch (e) { /* noop */ }
  }

  function addFirstMatch() {
    if (!_query) return; // nothing searched yet — use the results list
    if (!_results.length) {
      _results = filterProducts(products(), _query, currentIds(), SEARCH_CAP);
    }
    if (_results.length) addProduct(_results[0].id);
  }

  function addAll() {
    var list = products();
    var seen = currentIds();
    var added = 0;
    list.forEach(function (p) {
      if (p && p.id && !seen[p.id]) { _rows.push(makeRow(p, null)); seen[p.id] = true; added++; }
    });
    _query = '';
    var search = el('scSearch');
    if (search) search.value = '';
    _results = [];
    render();
    if (added) scheduleSessionSave();
  }

  function clear() {
    if (!_rows.length) return;
    if (!confirmMsg(tr('zakat.countClearConfirm', 'سيتم تفريغ قائمة الجرد بالكامل. متابعة؟'))) return;
    _rows = [];
    cancelSessionSave();
    sessionClear();
    render();
  }

  function removeRow(id) {
    for (var i = 0; i < _rows.length; i++) {
      if (_rows[i].id === id) { _rows.splice(i, 1); break; }
    }
    render();
    scheduleSessionSave();
  }

  function setActual(id, value) {
    var r = findRow(id);
    if (!r) return;
    var raw = String(value == null ? '' : value).trim();
    // Blank means "unchanged": fall back to the system quantity so a cleared
    // field never silently zeroes stock. Type 0 explicitly to count zero.
    r.actualQty = raw === '' ? r.systemQty : parseQty(raw);
    refreshRow(id);
    refreshSummary();
    scheduleSessionSave();
  }

  function save() {
    if (!allowed()) { notify(tr('zakat.countNoPermission', 'لا تملك صلاحية الجرد — للمدير فقط.')); return; }
    var updates = computeUpdates(_rows);
    if (!updates.length) {
      notify(tr('zakat.countNoChanges', 'لا توجد فروق لحفظها — الكميات الفعلية مطابقة لكميات النظام.'));
      return;
    }
    var msg = String(tr('zakat.countConfirm', 'سيتم تصحيح كميات {n} منتج في المخزون. لا يُسجَّل أي مصروف أو بيع. متابعة؟'))
      .replace('{n}', String(updates.length));
    if (!confirmMsg(msg)) return;

    var db = getDB();
    if (!db || typeof db.updateProductsBatch !== 'function') {
      notify('DB unavailable');
      return;
    }
    db.updateProductsBatch(updates);
    cancelSessionSave();
    sessionClear();
    _suppressSessionSave = true;
    close();
    _suppressSessionSave = false;
    try { if (typeof root.calculateZakat === 'function') root.calculateZakat(); } catch (e) { /* noop */ }
    notify(String(tr('zakat.countSaved', 'تم حفظ الجرد وتصحيح {n} منتج.')).replace('{n}', String(updates.length)));
  }

  // ---------- print count sheet -------------------------------------------

  function storeName() {
    var db = getDB();
    try {
      if (db && typeof db.getStoreName === 'function') {
        var n = db.getStoreName();
        if (n) return n;
      }
    } catch (e) { /* noop */ }
    try { if (typeof root.getPrintInfo === 'function') return (root.getPrintInfo() || {}).name || ''; } catch (e) { /* noop */ }
    return '';
  }

  function isRTL() {
    try {
      if (typeof root.isRTL === 'function') return !!root.isRTL();
      return (root.document && root.document.documentElement.getAttribute('dir')) === 'rtl';
    } catch (e) { return true; }
  }

  function buildSheetHTML() {
    var dir = isRTL() ? 'rtl' : 'ltr';
    var dateStr = '';
    try { dateStr = new Date().toLocaleDateString(isRTL() ? 'ar-EG-u-nu-latn' : 'en-GB'); } catch (e) { dateStr = ''; }
    var title = tr('zakat.countSheetTitle', 'ورقة جرد المخزون');
    var rows = _rows.map(function (r, i) {
      return '<tr>' +
        '<td style="padding:5px 8px;border:1px solid #ddd;text-align:center;width:34px">' + (i + 1) + '</td>' +
        '<td style="padding:5px 8px;border:1px solid #ddd">' + esc(r.name) +
          (r.fixed ? ' <span style="font-size:9px;color:#999">(' + esc(tr('zakat.countFixedNote', 'غير مُكمّم')) + ')</span>' : '') + '</td>' +
        '<td style="padding:5px 8px;border:1px solid #ddd;text-align:center">' + esc(r.barcode || '') + '</td>' +
        '<td style="padding:5px 8px;border:1px solid #ddd;text-align:center">' + esc(qtyText(r.systemQty, r)) + '</td>' +
        '<td style="padding:5px 8px;border:1px solid #ddd;text-align:center"></td>' +
        '<td style="padding:5px 8px;border:1px solid #ddd;text-align:center"></td>' +
      '</tr>';
    }).join('');
    if (!rows) {
      rows = '<tr><td colspan="6" style="padding:10px;text-align:center;color:#999">' +
        esc(tr('zakat.countEmpty', 'لا توجد أسطر')) + '</td></tr>';
    }
    return '<div id="stockCountPrintArea" style="padding:18px 22px;font-family:\'Segoe UI\',Arial,sans-serif;direction:' + dir + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0066B1;padding-bottom:8px;margin-bottom:14px">' +
        '<div><h1 style="font-size:19px;color:#0066B1;margin:0">' + esc(title) + '</h1>' +
          '<div style="font-size:12px;color:#777">' + esc(storeName()) + '</div></div>' +
        '<div style="font-size:12px;color:#777;text-align:left">' +
          '<div>' + esc(tr('zakat.countDate', 'تاريخ الجرد')) + ': ' + esc(dateStr) + '</div>' +
          '<div>' + esc(tr('zakat.countRows', 'عدد الأسطر')) + ': ' + _rows.length + '</div>' +
        '</div>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr style="background:#f0f5fa;color:#004080">' +
          '<th style="padding:6px 8px;border:1px solid #ddd">#</th>' +
          '<th style="padding:6px 8px;border:1px solid #ddd">' + esc(tr('zakat.countColProduct', 'المنتج')) + '</th>' +
          '<th style="padding:6px 8px;border:1px solid #ddd">' + esc(tr('inventory.barcode', 'الباركود')) + '</th>' +
          '<th style="padding:6px 8px;border:1px solid #ddd">' + esc(tr('zakat.countColSystem', 'كمية النظام')) + '</th>' +
          '<th style="padding:6px 8px;border:1px solid #ddd">' + esc(tr('zakat.countColActual', 'الكمية الفعلية')) + '</th>' +
          '<th style="padding:6px 8px;border:1px solid #ddd">' + esc(tr('zakat.countColDiff', 'الفرق')) + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody>' +
      '</table>' +
      '<div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12px;color:#555">' +
        '<div>' + esc(tr('zakat.countSign', 'توقيع الجارد')) + ': ______________________</div>' +
        '<div>' + esc(tr('zakat.countSignManager', 'توقيع المدير')) + ': ______________________</div>' +
      '</div>' +
    '</div>';
  }

  function printSheet() {
    if (!_rows.length) { notify(tr('zakat.countEmpty', 'لم تُضف أي منتج بعد.')); return; }
    var win = null;
    try { win = root.open('', '_blank', 'width=820,height=640'); } catch (e) { win = null; }
    if (!win) { notify(tr('invoices.allowPopups', 'الرجاء السماح بالنوافذ المنبثقة')); return; }
    var sh = '';
    try {
      var styles = root.document.querySelectorAll('link[rel="stylesheet"], style');
      Array.prototype.forEach.call(styles, function (s) { sh += s.outerHTML; });
    } catch (e) { /* styles optional */ }
    var pp = root.PrintPaper;
    var ppRule = (pp && typeof pp.pageRule === 'function') ? pp.pageRule(10) : '@page{size:A4;margin:10mm}';
    win.document.write(
      '<!DOCTYPE html><html dir="' + (isRTL() ? 'rtl' : 'ltr') + '"><head><meta charset="UTF-8"><title>' +
        esc(tr('zakat.countSheetTitle', 'ورقة جرد المخزون')) + '</title>' + sh +
        '<style>' + ppRule + 'body{margin:0;padding:0;font-family:"Segoe UI",Arial,sans-serif}*{box-sizing:border-box}</style>' +
      '</head><body>' + buildSheetHTML() +
      '<script>window.print();window.close();<\/script></body></html>'
    );
    win.document.close();
  }

  // ---------- export -------------------------------------------------------

  root.StockCount = {
    // actions
    open: open,
    close: close,
    save: save,
    printSheet: printSheet,
    addProduct: addProduct,
    addFirstMatch: addFirstMatch,
    addAll: addAll,
    clear: clear,
    removeRow: removeRow,
    setActual: setActual,
    onSearchInput: onSearchInput,
    // pure helpers (also used by the verifier)
    makeRow: makeRow,
    buildRows: buildRows,
    diffOf: diffOf,
    computeUpdates: computeUpdates,
    filterProducts: filterProducts,
    parseQty: parseQty,
    storageKey: storageKey,
    sessionSave: sessionSave,
    sessionLoad: sessionLoad,
    sessionClear: sessionClear,
    allowed: allowed,
  };
})(window);
