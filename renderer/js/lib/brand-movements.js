// ============================================================================
// ZMT PIECE — Brand movements (حركات المارك)
// ----------------------------------------------------------------------------
// READ-ONLY analytics over the records the program already keeps:
//   • marks  -> the free-text `mark` typed on each product (NOT BRANDS/brandId)
//   • sales  -> invoices[].items[] (productId / barcode / name)
//   • returns -> DB.getReturns()           (مرتجعات العملاء)
//   • damaged -> DB.getSupplierReturns()   (السلع الفاسدة / مرتجعات الموردين)
//
// The view is rendered INSIDE #pmList of the customer-movements page. It never
// writes to the database, changes a balance, or alters an existing ledger: the
// party-movements engine simply routes its own handlers here while this mode is
// active, and everything goes back to normal as soon as the user presses back.
// ============================================================================
(function (root) {
  'use strict';

  var state = {
    active: false,
    markId: '',
    search: '',
    from: '',
    to: '',
    expanded: {},
    printMode: null,
    _oldPlaceholder: null,
  };

  // Older callers used `state.brandId` for this view. Keep it as a live alias so
  // nothing outside the module breaks, while the code itself uses `markId`.
  try {
    Object.defineProperty(state, 'brandId', {
      get: function () { return state.markId; },
      set: function (v) { state.markId = v || ''; },
      enumerable: false,
      configurable: true,
    });
  } catch (e) {}

  // ---------------------------------------------------------------- helpers --
  function tr(key, fallback) {
    try {
      if (typeof root.t === 'function') {
        var v = root.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function dateStr(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function timeStr(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function tsOf(rec) {
    if (!rec) return 0;
    if (rec.createdAt) return num(rec.createdAt);
    if (rec.date) {
      var t = new Date(rec.date).getTime();
      return isFinite(t) ? t : 0;
    }
    return 0;
  }

  function fmt(n) {
    try { if (typeof root.fmtMoney === 'function') return root.fmtMoney(n); } catch (e) {}
    return (Math.round((num(n) + (num(n) >= 0 ? 1e-9 : -1e-9)) * 100) / 100).toFixed(2);
  }

  function fmtQty(n) { return String(Math.round(num(n) * 1000) / 1000); }
  function fmtInt(n) { return String(Math.round(num(n))); }
  function rate(part, base) { return base > 0 ? Math.round((num(part) / num(base)) * 1000) / 10 : 0; }

  function storeInfo() {
    try { if (typeof root.getStoreInfo === 'function') return root.getStoreInfo(); } catch (e) {}
    try {
      var A = (typeof Auth !== 'undefined') ? Auth : root.Auth;
      return {
        name: (A && A.getStoreName && A.getStoreName()) ||
          (root.localStorage && root.localStorage.getItem('zmt_store_name')) || 'ZMT PIECE',
        address: (root.localStorage && root.localStorage.getItem('zmt_store_address')) || '',
        phone: (root.localStorage && root.localStorage.getItem('zmt_store_phone')) || '',
      };
    } catch (e2) {}
    return { name: 'ZMT PIECE', address: '', phone: '' };
  }

  // ---------------------------------------------------------------- marks ---
  // «المارك» في هذه الشاشة هو النص الحر الذي يُدخله المستخدم في حقل `mark`
  // عند إضافة/تعديل المنتج (إدخال سريع، مخزون، إضافة ذكية). ليس هو دليل
  // «العلامات التجارية» (BRANDS / brandId). المنتجات بلا مارك تُجمع في مجموعة
  // مستقلة حتى تبقى كل المنتجات قابلة للعرض دون حذف أو تعديل بيانات.
  var NO_MARK_ID = '__none__';
  var _bmMarksCache = { version: null, list: null };
  var _bmProductsCache = { version: null, list: null };
  var _bmCollectCache = { key: null, data: null };

  function _bmDataVersion() {
    try {
      if (DB && typeof DB.dataVersion === 'function') return DB.dataVersion();
    } catch (e) {}
    return null;
  }

  function _bmProducts() {
    var ver = _bmDataVersion();
    if (ver !== null && _bmProductsCache.version === ver && _bmProductsCache.list) return _bmProductsCache.list;
    var list = [];
    try { list = ((DB && typeof DB.getProducts === 'function') ? (DB.getProducts() || []) : []).slice(); } catch (e) { list = []; }
    if (ver !== null) _bmProductsCache = { version: ver, list: list };
    return list;
  }

  function markIdOf(p) {
    var raw = (p && p.mark != null) ? String(p.mark) : '';
    var key = norm(raw);
    return key ? key : NO_MARK_ID;
  }

  function listMarks() {
    var ver = _bmDataVersion();
    if (ver !== null && _bmMarksCache.version === ver && _bmMarksCache.list) return _bmMarksCache.list;
    var map = {};
    _bmProducts().forEach(function (p) {
      if (!p) return;
      var id = markIdOf(p);
      var label = (id === NO_MARK_ID) ? tr('bm.noMark', 'بدون مارك') : String(p.mark).trim();
      if (!map[id]) map[id] = { id: id, name: label, kind: '', fav: false, count: 0 };
      map[id].count++;
    });
    var list = Object.keys(map).map(function (id) { return map[id]; });
    list.sort(function (a, b) {
      if (a.id === NO_MARK_ID) return 1;
      if (b.id === NO_MARK_ID) return -1;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar') || String(a.id).localeCompare(String(b.id));
    });
    if (ver !== null) _bmMarksCache = { version: ver, list: list };
    return list;
  }

  function findMark(id) {
    if (!id) return null;
    var list = listMarks();
    for (var i = 0; i < list.length; i++) { if (list[i].id === String(id)) return list[i]; }
    return null;
  }

  function productsForMark(markId) {
    if (!markId) return [];
    var id = String(markId);
    return _bmProducts().filter(function (p) { return p && markIdOf(p) === id; });
  }

  // Compatibility aliases: older callers/tests said "brand" for this view.
  // They now resolve against the product's `mark` field, not BRANDS/brandId.
  function listBrands() { return listMarks(); }
  function findBrand(id) { return findMark(id); }
  function productsFor(mark) { return productsForMark(mark && mark.id != null ? mark.id : mark); }

  function bounds() {
    var from = null, to = null;
    if (state.from) {
      var f = new Date(state.from + 'T00:00:00').getTime();
      if (isFinite(f)) from = f;
    }
    if (state.to) {
      var t = new Date(state.to + 'T23:59:59').getTime();
      if (isFinite(t)) to = t;
    }
    return { from: from, to: to };
  }

  function rangeLabel() {
    if (!state.from && !state.to) return tr('bm.allTime', 'كل الفترات');
    return (state.from || '…') + ' → ' + (state.to || '…');
  }

  // ------------------------------------------------------------ aggregation --
  function bucket() { return { ops: 0, qty: 0, value: 0 }; }

  function _collectUncached(markId) {
    var mark = findMark(markId);
    var products = productsForMark(markId);
    var alias = {}, byId = {};
    var b = bounds();

    products.forEach(function (p) {
      if (!p || p.id == null) return;
      var row = {
        id: String(p.id), name: p.name || '', barcode: p.barcode || '',
        sales: bucket(), returns: bucket(), damaged: bucket(),
        damagedPending: 0, damagedReturned: 0, ops: [],
      };
      byId[row.id] = row;
      alias[row.id] = row;
      if (p.barcode) alias['b:' + norm(p.barcode)] = row;
      if (p.name) alias['n:' + norm(p.name)] = row;
    });

    var rows = Object.keys(byId).map(function (k) { return byId[k]; });

    function inRange(ts) {
      return (b.from == null || ts >= b.from) && (b.to == null || ts <= b.to);
    }

    function resolve(rec) {
      if (!rec) return null;
      if (rec.productId != null && alias[String(rec.productId)]) return alias[String(rec.productId)];
      if (rec.barcode && alias['b:' + norm(rec.barcode)]) return alias['b:' + norm(rec.barcode)];
      if (rec.productName && alias['n:' + norm(rec.productName)]) return alias['n:' + norm(rec.productName)];
      return null;
    }

    function push(kind, rec, qty, value, extra) {
      var row = resolve(rec);
      if (!row) return false;
      var tgt = row[kind];
      tgt.ops++;
      tgt.qty += qty;
      tgt.value += value;
      var op = {
        kind: kind, ts: tsOf(rec), date: dateStr(tsOf(rec)), time: timeStr(tsOf(rec)),
        ref: rec.invoiceNumber || rec.invoiceRef || '', qty: qty, value: value,
        note: (rec && (rec.reason || rec.note)) || '', status: (rec && rec.status) || '',
      };
      if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) op[k] = extra[k]; } }
      row.ops.push(op);
      return true;
    }

    // --- sales -------------------------------------------------------------
    var saleInvoices = 0;
    try {
      var invoices = ((DB && typeof DB.getInvoices === 'function') ? (DB.getInvoices() || []) : []);
      invoices.forEach(function (inv) {
        if (!inv || inv.type === 'payment' || inv.type === 'supplier_payment') return;
        var ts = tsOf(inv);
        if (!inRange(ts)) return;
        var touched = false;
        (inv.items || []).forEach(function (it) {
          if (!it) return;
          var qty = num(it.qty);
          var value = num(it.total);
          if (!value && it.price != null) value = num(it.price) * qty;
          if (push('sales', it, qty, value, { ref: inv.invoiceNumber || inv.id || '' })) touched = true;
          (it.components || []).forEach(function (c) {
            if (!c || c.productId == null) return;
            var cq = num(c.qtyPerBundle != null ? c.qtyPerBundle : c.qty) * (num(it.qty) || 1);
            push('sales', c, cq, num(c.value), { ref: inv.invoiceNumber || inv.id || '', component: true });
          });
        });
        if (touched) saleInvoices++;
      });
    } catch (e) {}

    // --- customer returns --------------------------------------------------
    try {
      ((DB && typeof DB.getReturns === 'function') ? (DB.getReturns() || []) : []).forEach(function (r) {
        if (!inRange(tsOf(r))) return;
        var qty = num(r && r.qty);
        var value = num(r && r.total);
        if (!value && r && r.price != null) value = num(r.price) * qty;
        push('returns', r, qty, value);
      });
    } catch (e) {}

    // --- spoiled goods (supplier returns) ---------------------------------
    try {
      ((DB && typeof DB.getSupplierReturns === 'function') ? (DB.getSupplierReturns() || []) : []).forEach(function (r) {
        if (!inRange(tsOf(r))) return;
        var qty = num(r && r.qty);
        var value = num(r && r.amount);
        if (!value && r && r.price != null) value = num(r.price) * qty;
        var drow = resolve(r);
        if (push('damaged', r, qty, value, { supplier: (r && r.supplierName) || '' }) && drow) {
          if (r && r.status === 'returned') drow.damagedReturned++;
          else drow.damagedPending++;
        }
      });
    } catch (e) {}

    rows.sort(function (a, b) { return b.sales.value - a.sales.value || String(a.name).localeCompare(String(b.name), 'ar'); });

    var totals = {
      sales: bucket(), returns: bucket(), damaged: bucket(),
      damagedPending: 0, damagedReturned: 0, invoices: saleInvoices, productCount: rows.length,
    };
    rows.forEach(function (r) {
      ['sales', 'returns', 'damaged'].forEach(function (k) {
        totals[k].ops += r[k].ops;
        totals[k].qty += r[k].qty;
        totals[k].value += r[k].value;
      });
      totals.damagedPending += r.damagedPending;
      totals.damagedReturned += r.damagedReturned;
    });

    var info = mark || { id: String(markId || ''), name: String(markId || ''), kind: '' };
    return {
      brand: info, mark: info,
      products: rows, totals: totals, range: b, rangeLabel: rangeLabel(),
      generatedAt: Date.now(), store: storeInfo(),
    };
  }

  // Same dataVersion key used by the party ledger: rebuilding the mark report
  // on every keystroke or print-mode click was pure waste. The cached payload is
  // read-only; a fresh timestamp/store is attached on each retrieval so reports
  // still show when they were generated.
  function collect(markId) {
    var key = String(markId || '') + '|' + String(state.from || '') + '|' + String(state.to || '') +
      '|' + String(_bmDataVersion());
    var hit = _bmCollectCache;
    if (hit.key === key && hit.data) {
      var d = hit.data;
      return {
        brand: d.brand, mark: d.mark, products: d.products, totals: d.totals,
        range: d.range, rangeLabel: d.rangeLabel,
        generatedAt: Date.now(), store: storeInfo(),
      };
    }
    var data = _collectUncached(markId);
    _bmCollectCache = { key: key, data: data };
    return data;
  }

  // ---------------------------------------------------------------- render ---
  function kpi(label, value, sub, color) {
    return '<div class="bm-kpi" style="border-top-color:' + color + '">' +
      '<div class="bm-kpi-label">' + esc(label) + '</div>' +
      '<div class="bm-kpi-val" style="color:' + color + '">' + esc(value) + '</div>' +
      '<div class="bm-kpi-sub">' + esc(sub) + '</div></div>';
  }

  function kpisHTML(t) {
    return '<div class="bm-kpis">' +
      kpi(tr('bm.salesCard', 'المبيعات'), fmtInt(t.sales.ops) + ' ' + tr('bm.opsUnit', 'عملية'),
        tr('bm.qtyShort', 'الكمية') + ': ' + fmtQty(t.sales.qty) + ' · DA' + fmt(t.sales.value), '#1d4ed8') +
      kpi(tr('bm.returnsCard', 'المرتجعات'), fmtInt(t.returns.ops) + ' ' + tr('bm.opsUnit', 'عملية'),
        tr('bm.qtyShort', 'الكمية') + ': ' + fmtQty(t.returns.qty) + ' · DA' + fmt(t.returns.value), '#b45309') +
      kpi(tr('bm.damagedCard', 'السلع الفاسدة'), fmtInt(t.damaged.ops) + ' ' + tr('bm.opsUnit', 'عملية'),
        tr('bm.qtyShort', 'الكمية') + ': ' + fmtQty(t.damaged.qty) + ' · DA' + fmt(t.damaged.value), '#b91c1c') +
      kpi(tr('bm.productsCard', 'منتجات الماركة'), fmtInt(t.productCount),
        tr('bm.invoicesShort', 'فواتير') + ': ' + fmtInt(t.invoices), '#0f766e') +
      '</div>';
  }

  function headerHTML() {
    return '<div class="bm-head">' +
      '<div class="bm-head-title"><i class="fas fa-tags"></i> ' + esc(tr('bm.title', 'حركات المارك')) + '</div>' +
      '<div class="bm-head-actions">' +
        '<button type="button" class="bm-mode-btn' + (printMode() === 'color' ? ' active' : '') +
          '" data-mode="color" onclick="bmPrintColor()"><i class="fas fa-palette"></i> ' + esc(tr('invoices.printColor', 'طباعة ملوّنة')) + '</button>' +
        '<button type="button" class="bm-mode-btn' + (printMode() === 'bw' ? ' active' : '') +
          '" data-mode="bw" onclick="bmPrintBw()"><i class="fas fa-adjust"></i> ' + esc(tr('invoices.printBw', 'طباعة أبيض وأسود')) + '</button>' +
        '<button type="button" class="bm-back" onclick="bmClose()"><i class="fas fa-arrow-right"></i> ' +
          esc(tr('bm.back', 'رجوع لحركات العملاء')) + '</button>' +
      '</div></div>';
  }

  function controlsHTML(data) {
    var q = norm(state.search);
    var options = '<option value="">' + esc(tr('bm.pickBrand', '— اختر المارك —')) + '</option>';
    listMarks().forEach(function (m) {
      if (q && norm(m.name).indexOf(q) < 0) return;
      options += '<option value="' + esc(m.id) + '"' + (String(m.id) === String(state.markId) ? ' selected' : '') + '>' +
        esc(m.name) + '</option>';
    });
    return '<div class="bm-controls">' +
      '<label class="bm-field"><span>' + esc(tr('bm.brandLabel', 'المارك')) + '</span>' +
        '<select id="bmMarkSelect" onchange="bmOnMarkChange(this.value)">' + options + '</select></label>' +
      '<div class="bm-period"><i class="fas fa-calendar-days"></i> ' + esc(data ? data.rangeLabel : rangeLabel()) + '</div>' +
      '<div class="bm-search-note"><i class="fas fa-magnifying-glass"></i> ' +
        esc(tr('bm.searchHint', 'ابحث عن المارك أو منتجها من شريط البحث أعلى الصفحة')) + '</div>' +
      '</div>';
  }

  function rateClass(v, warn, danger) {
    return v >= danger ? 'bm-rate bm-rate-bad' : (v >= warn ? 'bm-rate bm-rate-warn' : 'bm-rate bm-rate-ok');
  }

  function detailHTML(row) {
    var ops = row.ops.slice().sort(function (a, b) { return b.ts - a.ts; });
    if (!ops.length) return '<div class="bm-no-detail">' + esc(tr('bm.noDetail', 'لا توجد عمليات في الفترة المحددة')) + '</div>';
    var head = '<div class="bm-detail-title">' + esc(tr('bm.detailTitle', 'تفاصيل العمليات')) + ' — ' + esc(row.name) + '</div>';
    var rows = ops.map(function (o) {
      var kindLabel = o.kind === 'sales'
        ? tr('bm.kindSale', 'بيع') : (o.kind === 'returns' ? tr('bm.kindReturn', 'مرتجع') : tr('bm.kindDamaged', 'سلعة فاسدة'));
      return '<tr><td>' + esc(o.date + ' ' + o.time) + '</td><td>' + esc(kindLabel) + '</td>' +
        '<td dir="ltr">' + esc(o.ref || '—') + '</td><td>' + esc(o.note || (o.supplier || '—')) + '</td>' +
        '<td class="bm-c">' + fmtQty(o.qty) + '</td><td class="bm-c">DA' + fmt(o.value) + '</td></tr>';
    }).join('');
    return head + '<table class="bm-detail-table"><thead><tr>' +
      '<th>' + esc(tr('bm.colDate', 'التاريخ')) + '</th><th>' + esc(tr('bm.kind', 'النوع')) + '</th>' +
      '<th>' + esc(tr('bm.colRef', 'المرجع')) + '</th><th>' + esc(tr('bm.colNote', 'البيان')) + '</th>' +
      '<th class="bm-c">' + esc(tr('bm.colQty', 'الكمية')) + '</th><th class="bm-c">' + esc(tr('bm.colValue', 'القيمة')) + '</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function tableHTML(data, forPrint) {
    var head = '<tr>' +
      '<th>' + esc(tr('bm.colProduct', 'المنتج')) + '</th>' +
      '<th class="bm-c">' + esc(tr('bm.colSales', 'المبيعات (عملية / كمية / قيمة)')) + '</th>' +
      '<th class="bm-c">' + esc(tr('bm.colReturns', 'المرتجعات')) + '</th>' +
      '<th class="bm-c">' + esc(tr('bm.colDamaged', 'السلع الفاسدة')) + '</th>' +
      '<th class="bm-c">' + esc(tr('bm.colReturnRate', 'نسبة المرتجع')) + '</th>' +
      '<th class="bm-c">' + esc(tr('bm.colDamageRate', 'نسبة الهدر')) + '</th>' +
      '<th class="bm-c">' + esc(tr('bm.colNet', 'الصافي')) + '</th></tr>';
    var body = data.products.map(function (r) {
      var rr = rate(r.returns.qty, r.sales.qty);
      var dr = rate(r.damaged.qty, r.sales.qty);
      var net = r.sales.value - r.returns.value - r.damaged.value;
      var open = !!state.expanded[r.id];
      var row = '<tr class="bm-row' + (open ? ' bm-row-open' : '') + '"' +
        (forPrint ? '' : ' onclick="bmToggleProduct(\'' + esc(r.id) + '\')"') + '>' +
        '<td class="bm-prod">' + (forPrint ? '' : '<i class="fas ' + (open ? 'fa-chevron-down' : 'fa-chevron-left') + '"></i> ') +
          '<b>' + esc(r.name || '—') + '</b>' + (r.barcode ? '<small dir="ltr">' + esc(r.barcode) + '</small>' : '') + '</td>' +
        '<td class="bm-c">' + fmtInt(r.sales.ops) + ' / ' + fmtQty(r.sales.qty) + ' / <b>DA' + fmt(r.sales.value) + '</b></td>' +
        '<td class="bm-c">' + fmtInt(r.returns.ops) + ' / ' + fmtQty(r.returns.qty) + ' / DA' + fmt(r.returns.value) + '</td>' +
        '<td class="bm-c">' + fmtInt(r.damaged.ops) + ' / ' + fmtQty(r.damaged.qty) + ' / DA' + fmt(r.damaged.value) + '</td>' +
        '<td class="bm-c"><span class="' + rateClass(rr, 5, 15) + '">' + rr + '%</span></td>' +
        '<td class="bm-c"><span class="' + rateClass(dr, 3, 10) + '">' + dr + '%</span></td>' +
        '<td class="bm-c"><b style="color:' + (net < 0 ? '#b91c1c' : '#15803d') + '">DA' + fmt(net) + '</b></td></tr>';
      if (open && !forPrint) row += '<tr class="bm-detail-row"><td colspan="7">' + detailHTML(r) + '</td></tr>';
      return row;
    }).join('');
    if (!body) {
      body = '<tr><td colspan="7" class="bm-empty">' + esc(tr('bm.noProducts', 'لا توجد منتجات في هذه الماركة')) + '</td></tr>';
    }
    return '<div class="bm-table-wrap"><table class="bm-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function panelHTML(data) {
    var t = data.totals;
    var foot = '<div class="bm-foot">' + esc(data.store.name || 'ZMT PIECE') + ' — ' +
      esc(tr('bm.generated', 'تقرير مُولَّد آلياً من سجلّات البرنامج')) + ' — ' +
      esc(dateStr(data.generatedAt)) + ' ' + esc(timeStr(data.generatedAt)) + '</div>';
    return '<div class="bm-panel">' + headerHTML() + controlsHTML(data) + kpisHTML(t) + tableHTML(data) + foot + '</div>';
  }

  function render() {
    if (!state.active) return null;
    var list = typeof document !== 'undefined' ? document.getElementById('pmList') : null;
    if (!list) return null;
    var chips = document.getElementById('pmChips');
    if (chips) chips.innerHTML = '';
    var chart = document.getElementById('pmChartWrap');
    if (chart) chart.style.display = 'none';
    var legend = document.querySelector ? document.querySelector('.pmp-legend') : null;
    if (legend) legend.style.display = 'none';

    var data = state.markId ? collect(state.markId) : null;
    if (!state.markId) {
      list.innerHTML = '<div class="bm-panel">' + headerHTML() + controlsHTML(null) +
        '<div class="bm-empty bm-empty-big"><i class="fas fa-tags"></i><p>' +
        esc(tr('bm.chooseFirst', 'اختر ماركاً من القائمة أو ابحث عنه في شريط البحث')) + '</p></div></div>';
    } else {
      list.innerHTML = panelHTML(data);
    }
    return data;
  }

  // ------------------------------------------------------------ printable ---
  var REPORT_CSS =
    '.bm-doc{direction:rtl;font-family:"Segoe UI","Tahoma",Arial,sans-serif;color:#1a1a1a;background:#fff;padding:14px 18px}' +
    '.bm-doc *{box-sizing:border-box}' +
    '.bm-doc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #0d6efd;padding-bottom:10px;margin-bottom:12px}' +
    '.bm-doc-store{font-size:20px;font-weight:900}' +
    '.bm-doc-meta{font-size:11px;color:#666;margin-top:3px;line-height:1.6}' +
    '.bm-doc-title{font-size:17px;font-weight:900;color:#0d6efd;text-align:left}' +
    '.bm-doc-title small{display:block;font-size:11px;color:#666;font-weight:600;margin-top:4px}' +
    '.bm-kpis{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px}' +
    '.bm-kpi{flex:1 1 150px;border:1px solid #d7dee8;border-top:3px solid #0d6efd;border-radius:8px;padding:8px 12px;background:#f7fafc}' +
    '.bm-kpi-label{font-size:11px;color:#667;font-weight:700}' +
    '.bm-kpi-val{font-size:16px;font-weight:900;margin-top:2px}' +
    '.bm-kpi-sub{font-size:10px;color:#778;margin-top:2px}' +
    'table.bm-table{width:100%;border-collapse:collapse;font-size:11px}' +
    'table.bm-table th,table.bm-table td{border:1px solid #dbe3ec;padding:6px 7px;text-align:right;vertical-align:top}' +
    'table.bm-table thead th{background:#f0f4f9;font-weight:800;color:#334}' +
    '.bm-c{text-align:center}' +
    '.bm-prod b{display:block}.bm-prod small{display:block;color:#889;font-size:9px;direction:ltr}' +
    '.bm-rate{display:inline-block;padding:1px 6px;border-radius:8px;font-weight:800;font-size:10px}' +
    '.bm-rate-ok{color:#15803d;background:#eefaf1}.bm-rate-warn{color:#b45309;background:#fff7ec}.bm-rate-bad{color:#b91c1c;background:#fff2f2}' +
    '.bm-foot{margin-top:10px;font-size:10px;color:#889;text-align:center}' +
    '@media print{.bm-doc{padding:0}}';

  function reportHTML(data) {
    var store = data.store || storeInfo();
    var head = '<div class="bm-doc-head"><div><div class="bm-doc-store">' + esc(store.name || 'ZMT PIECE') + '</div>' +
      '<div class="bm-doc-meta">' + (store.address ? esc(store.address) + '<br>' : '') +
      (store.phone ? esc(tr('bm.phone', 'الهاتف')) + ': ' + esc(store.phone) : '') + '</div></div>' +
      '<div class="bm-doc-title">' + esc(tr('bm.reportTitle', 'تقرير حركات المارك')) + ' — ' + esc(data.brand.name) +
      '<small>' + esc(tr('bm.period', 'الفترة')) + ': ' + esc(data.rangeLabel) + '</small>' +
      '<small>' + esc(tr('bm.generatedAt', 'تاريخ الإصدار')) + ': ' + esc(dateStr(data.generatedAt)) + ' ' + esc(timeStr(data.generatedAt)) + '</small>' +
      '</div></div>';
    var totals = data.totals;
    var grand = '<div class="bm-kpis">' +
      kpi(tr('bm.salesCard', 'المبيعات'), fmtInt(totals.sales.ops), 'DA' + fmt(totals.sales.value) + ' · ' + fmtQty(totals.sales.qty), '#1d4ed8') +
      kpi(tr('bm.returnsCard', 'المرتجعات'), fmtInt(totals.returns.ops), 'DA' + fmt(totals.returns.value), '#b45309') +
      kpi(tr('bm.damagedCard', 'السلع الفاسدة'), fmtInt(totals.damaged.ops), 'DA' + fmt(totals.damaged.value), '#b91c1c') +
      kpi(tr('bm.productsCard', 'منتجات الماركة'), fmtInt(totals.productCount), tr('bm.invoicesShort', 'فواتير') + ': ' + fmtInt(totals.invoices), '#0f766e') +
      '</div>';
    return '<div class="bm-doc"><style>' + REPORT_CSS + '</style>' + head + grand +
      tableHTML(data, true) + '<div class="bm-foot">' + esc(store.name || 'ZMT PIECE') + ' — ' +
      esc(tr('bm.generated', 'تقرير مُولَّد آلياً من سجلّات البرنامج')) + '</div></div>';
  }

  function printMode() {
    var m = state.printMode;
    if (m !== 'bw' && m !== 'color') {
      try { m = (root.PrintMode && typeof root.PrintMode.get === 'function') ? root.PrintMode.get() : 'color'; }
      catch (e) { m = 'color'; }
    }
    return m === 'bw' ? 'bw' : 'color';
  }

  function setPrintMode(mode) {
    state.printMode = (mode === 'bw') ? 'bw' : 'color';
    try { if (root.PrintMode && typeof root.PrintMode.set === 'function') root.PrintMode.set(state.printMode); } catch (e) {}
    try {
      var all = typeof document !== 'undefined' && document.querySelectorAll ? document.querySelectorAll('.bm-mode-btn') : [];
      for (var i = 0; i < all.length; i++) {
        if (all[i] && all[i].classList) all[i].classList.toggle('active', all[i].getAttribute('data-mode') === state.printMode);
      }
    } catch (e2) {}
    try { if (root.PartyMovements && typeof root.PartyMovements.setPrintMode === 'function') root.PartyMovements.setPrintMode(state.printMode); } catch (e3) {}
    return state.printMode;
  }

  function showReport() {
    if (!state.markId) {
      if (typeof root.alert === 'function') root.alert(tr('bm.chooseFirst', 'اختر ماركاً لعرض حركاته'));
      return;
    }
    var data = collect(state.markId);
    var title = (data.store.name || 'ZMT PIECE') + ' — ' + tr('bm.reportTitle', 'تقرير حركات المارك') + ': ' + data.brand.name;
    var html = reportHTML(data);
    try {
      if (root.PrintMode && typeof root.PrintMode.openPreview === 'function') {
        if (root.PrintMode.openPreview(title, html, { mode: printMode() })) return;
      }
    } catch (e) {}
    var win = null;
    try { win = root.open('', '', 'width=900,height=700'); } catch (e2) {}
    if (!win) {
      if (typeof root.alert === 'function') root.alert(tr('movements.allowPopups', 'يرجى السماح بالنوافذ المنبثقة للطباعة'));
      return;
    }
    win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(title) + '</title></head><body>' +
      html + '<script>window.print()<\/script></body></html>');
    win.document.close();
  }

  // Switching the print mode is only a preference change. Generating the report
  // and opening a preview belongs to the existing «عرض كتقرير» button (which
  // routes here while this view is active). No rebuild, no extra print window.
  function printColor() { setPrintMode('color'); }
  function printBw() { setPrintMode('bw'); }

  // ---------------------------------------------------------------- export ---
  function exportCsv() {
    if (!state.markId) { if (typeof root.alert === 'function') root.alert(tr('bm.chooseFirst', 'اختر ماركاً أولاً')); return; }
    var data = collect(state.markId);
    var q = function (v) { var s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var head = [tr('bm.colProduct', 'المنتج'), tr('bm.colSales', 'المبيعات'), tr('bm.colReturns', 'المرتجعات'),
      tr('bm.colDamaged', 'السلع الفاسدة'), tr('bm.colNet', 'الصافي')];
    var lines = [head.map(q).join(',')];
    data.products.forEach(function (r) {
      lines.push([r.name,
        fmtInt(r.sales.ops) + '/' + fmtQty(r.sales.qty) + '/' + fmt(r.sales.value),
        fmtInt(r.returns.ops) + '/' + fmtQty(r.returns.qty) + '/' + fmt(r.returns.value),
        fmtInt(r.damaged.ops) + '/' + fmtQty(r.damaged.qty) + '/' + fmt(r.damaged.value),
        fmt(r.sales.value - r.returns.value - r.damaged.value),
      ].map(q).join(','));
    });
    try {
      var blob = new root.Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      var url = root.URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'mark-' + String(state.markId).replace(/[^\w\u0600-\u06FF-]/g, '_') + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (e) {
      if (typeof root.alert === 'function') root.alert(tr('movements.exportFail', 'تعذّر التصدير'));
    }
  }

  // ------------------------------------------------------------------ mode ---
  function refresh() {
    if (root.PartyMovements && typeof root.PartyMovements.refresh === 'function') root.PartyMovements.refresh();
    else render();
  }

  function activate() {
    if (state.active) return;
    state.active = true;
    state.expanded = {};
    try {
      var el = document.getElementById('pmSearch');
      if (el) {
        state._oldPlaceholder = el.getAttribute('placeholder') || '';
        el.placeholder = tr('bm.searchPh', 'ابحث عن مارك أو منتج...');
      }
      var f = document.getElementById('pmDateFrom');
      var t = document.getElementById('pmDateTo');
      state.from = f ? f.value : '';
      state.to = t ? t.value : '';
    } catch (e) {}
  }

  function deactivate() {
    if (!state.active) return;
    state.active = false;
    state.expanded = {};
    try {
      var el = document.getElementById('pmSearch');
      if (el && state._oldPlaceholder != null) el.placeholder = state._oldPlaceholder;
      // The ledger refresh that follows restores the chart on its own; here we
      // only un-hide the legend that the brand view had temporarily hidden.
      var legend = document.querySelector ? document.querySelector('.pmp-legend') : null;
      if (legend) legend.style.display = '';
    } catch (e) {}
  }

  function open() {
    activate();
    if (!state.markId) {
      var marks = listMarks();
      var best = null;
      marks.forEach(function (m) {
        if (m.id !== NO_MARK_ID && (!best || m.count > best.count)) best = m;
      });
      state.markId = best ? best.id : (marks.length ? marks[0].id : '');
    }
    refresh();
  }

  function close() {
    deactivate();
    // The shared search box was used to find a mark; clear it so the party
    // ledger does not reopen filtered by a mark name the user forgot.
    var restored = false;
    try {
      var el = document.getElementById('pmSearch');
      if (el) el.value = '';
      if (root.pmOnSearch) { root.pmOnSearch(''); restored = true; }
    } catch (e) {}
    if (!restored) refresh();
  }
  function isActive() { return !!state.active; }

  function onMarkChange(id) {
    state.markId = id || '';
    state.expanded = {};
    render();
  }

  // Legacy handler name kept for any page markup that still references it.
  function onBrandChange(id) { onMarkChange(id); }

  function onSearch(v) {
    state.search = v || '';
    render();
  }

  function _setInputs(from, to) {
    try {
      var f = document.getElementById('pmDateFrom');
      var t = document.getElementById('pmDateTo');
      if (f) f.value = from || '';
      if (t) t.value = to || '';
    } catch (e) {}
  }

  function onRange(from, to) {
    state.from = from || '';
    state.to = to || '';
    render();
  }

  function _todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function quickRange(kind) {
    if (kind === 'all') {
      state.from = ''; state.to = ''; _setInputs('', '');
      render(); return;
    }
    var today = new Date();
    var from = new Date(today.getTime());
    if (kind === 'today') { /* from == today */ }
    else if (kind === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);
    else if (kind === '7') from.setDate(from.getDate() - 6);
    else from.setDate(from.getDate() - 29); // '30'
    var f = from.getFullYear() + '-' + pad2(from.getMonth() + 1) + '-' + pad2(from.getDate());
    var t = _todayStr();
    state.from = f; state.to = t;
    _setInputs(f, t);
    render();
  }

  function toggleProduct(id) {
    state.expanded[String(id)] = !state.expanded[String(id)];
    render();
  }

  var api = {
    isActive: isActive, activate: activate, deactivate: deactivate,
    open: open, close: close, render: render, refresh: refresh,
    onMarkChange: onMarkChange, onBrandChange: onBrandChange,
    onSearch: onSearch, onRange: onRange,
    quickRange: quickRange, toggleProduct: toggleProduct,
    setPrintMode: setPrintMode, printMode: printMode, showReport: showReport,
    exportCsv: exportCsv, collect: collect,
    listMarks: listMarks, findMark: findMark, productsForMark: productsForMark,
    // legacy names — same mark-based implementation
    listBrands: listBrands, findBrand: findBrand, productsFor: productsFor,
    reportHTML: reportHTML,
    state: state,
  };

  root.BrandMovements = api;
  root.bmOpen = open;
  root.bmClose = close;
  root.bmOnMarkChange = onMarkChange;
  root.bmOnBrandChange = onBrandChange;
  root.bmToggleProduct = toggleProduct;
  root.bmQuickRange = quickRange;
  root.bmPrintColor = printColor;
  root.bmPrintBw = printBw;
  root.bmShowReport = showReport;
  root.bmExportCsv = exportCsv;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
