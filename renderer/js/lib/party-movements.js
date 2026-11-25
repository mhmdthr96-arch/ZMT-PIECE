// ============================================================================
// ZMT PIECE — Party movements engine (customers & suppliers)
// ----------------------------------------------------------------------------
// Builds a single, chronological, running-balance ledger for a customer or a
// supplier out of the records the app already keeps:
//
//   • sale / purchase invoices  -> increase the party's outstanding balance
//   • «بيع للمورد» (sup_sale)   -> decreases what we owe the supplier
//   • receipt / debt-note vouchers (type 'payment') -> move the balance by the
//     voucher direction (a customer collection reduces the debt, a supplier
//     debt note increases it)
//   • payment rows -> reduce the balance (money actually handed over)
//
// The current stored balance is the source of truth: the opening balance is
// derived as `currentBalance − Σdeltas`, so the running curve always ENDS on
// exactly the balance the rest of the app shows. Nothing here writes to the
// database — it is a pure read + render module, shared by the two movements
// pages and by their printable reports.
//
// Settlement («تسوية رصيد»): whenever a reducing movement (a payment or a
// collection voucher) brings the running balance back to ≈0, a marker is
// attached to that exact entry (date + time). A party may settle several times
// over its life, so every crossing is recorded.
// ============================================================================
(function (root) {
  'use strict';

  var TOL = 0.005; // half a centime — same tolerance the app uses for "zero"

  // ---------------------------------------------------------------- helpers --
  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function tr(key, fallback) {
    try {
      if (typeof root.t === 'function') {
        var v = root.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function fmt(n) {
    try {
      if (typeof root.fmtMoney === 'function') return root.fmtMoney(n);
    } catch (e) {}
    return (Math.round((num(n) + (num(n) >= 0 ? 1e-9 : -1e-9)) * 100) / 100).toFixed(2);
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
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function stamp(ts) { return dateStr(ts) + ' ' + timeStr(ts); }

  function tsOf(rec) {
    if (!rec) return 0;
    if (rec.createdAt) return num(rec.createdAt);
    if (rec.date) {
      var t = new Date(rec.date).getTime();
      return isFinite(t) ? t : 0;
    }
    return 0;
  }

  function fmtQty(n) {
    var v = num(n);
    return String(Math.round(v * 1000) / 1000);
  }

  function daysAgo(ts) {
    if (!ts) return 0;
    return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
  }

  // Shallow copy that keeps `for..in` off the prototype chain (older WebViews).
  function shallow(o) {
    var r = {};
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; }
    return r;
  }

  // A return carries its money under `total` (customer) or `amount` (supplier),
  // with a price × qty fallback for legacy rows written before the fields existed.
  function returnValue(r) {
    if (r && r.total != null && isFinite(num(r.total))) return num(r.total);
    if (r && r.amount != null && isFinite(num(r.amount))) return num(r.amount);
    return num(r && r.price) * num(r && r.qty);
  }

  function invoiceRef(r) {
    if (!r) return '';
    try {
      if (r.invoiceId && DB && typeof DB.getInvoice === 'function') {
        var inv = DB.getInvoice(r.invoiceId);
        if (inv && inv.invoiceNumber) return inv.invoiceNumber;
      }
    } catch (e) {}
    if (r.invoiceNumber) return r.invoiceNumber;
    return r.invoiceId ? String(r.invoiceId).slice(0, 8).toUpperCase() : '';
  }

  // Returns belonging to one party. Customer returns are often written from the
  // invoice editor without a customerId, so they are also matched through the
  // invoice they were taken from. Supplier returns only count once the goods
  // were actually handed back (status 'returned').
  //
  // Previously this scanned the whole returns list once PER party (O(parties ×
  // returns)). The list is now indexed once per DB revision and kind, then each
  // party is answered by lookup. Matching rules and row order are unchanged.
  var _pmReturnsIndex = { key: null, map: null };

  function _pmKey(v) {
    if (v === undefined) return 'u:';
    if (v === null) return 'n:';
    return (typeof v) + ':' + String(v);
  }

  function _pmReturnsIndexFor(kind) {
    var ver = _pmDataVersion();
    var key = String(ver) + '|' + kind;
    if (ver !== null && _pmReturnsIndex.key === key && _pmReturnsIndex.map) return _pmReturnsIndex.map;

    var map = { byParty: {}, byInvoice: {} };
    var raw = [];
    try {
      if (kind !== 'supplier') raw = (DB && DB.getReturns) ? (DB.getReturns() || []) : [];
      else raw = (DB && DB.getSupplierReturns) ? (DB.getSupplierReturns() || []) : [];
    } catch (e) { raw = []; }

    function put(bucket, key2, item) {
      if (!bucket[key2]) bucket[key2] = [];
      bucket[key2].push(item);
    }

    raw.forEach(function (r, i) {
      if (!r) return;
      if (kind === 'supplier' && String(r.status || '') !== 'returned') return;
      var item = { i: i, r: r };
      var explicit = false;
      if (kind !== 'supplier') {
        if (r.customerId !== undefined && r.customerId !== null) { put(map.byParty, _pmKey(r.customerId), item); explicit = true; }
        if (r.relatedTo !== undefined && r.relatedTo !== null) { put(map.byParty, _pmKey(r.relatedTo), item); explicit = true; }
        if (!r.customerId && !r.relatedTo && r.invoiceId) put(map.byInvoice, _pmKey(r.invoiceId), item);
      } else {
        if (r.supplierId !== undefined && r.supplierId !== null) { put(map.byParty, _pmKey(r.supplierId), item); explicit = true; }
        if (!r.supplierId && r.invoiceId) put(map.byInvoice, _pmKey(r.invoiceId), item);
      }
      // `explicit` documents the branch: a return carrying a party is never
      // also picked up through an invoice of another party.
      if (explicit) item.explicit = true;
    });

    if (ver !== null) _pmReturnsIndex = { key: key, map: map };
    return map;
  }

  function returnsFor(kind, partyId, partyInvoices) {
    var map = _pmReturnsIndexFor(kind);
    var found = [];
    var seen = {};
    function add(item) {
      if (!item || seen[item.i]) return;
      seen[item.i] = true;
      found.push(item);
    }
    (map.byParty[_pmKey(partyId)] || []).forEach(add);
    (partyInvoices || []).forEach(function (inv) {
      if (inv && inv.id) (map.byInvoice[_pmKey(inv.id)] || []).forEach(add);
    });
    found.sort(function (a, b) { return a.i - b.i; });
    return found.map(function (x) { return x.r; });
  }

  function storeInfo() {
    try { if (typeof root.getStoreInfo === 'function') return root.getStoreInfo(); } catch (e) {}
    try {
      var A = (typeof Auth !== 'undefined') ? Auth : root.Auth;
      return {
        name: (A && A.getStoreName && A.getStoreName()) || (root.localStorage && root.localStorage.getItem('zmt_store_name')) || 'ZMT PIECE',
        address: (root.localStorage && root.localStorage.getItem('zmt_store_address')) || '',
        phone: (root.localStorage && root.localStorage.getItem('zmt_store_phone')) || '',
      };
    } catch (e2) {}
    return { name: 'ZMT PIECE', address: '', phone: '' };
  }

  // ------------------------------------------------------------- the ledger --
  // kind: 'customer' | 'supplier'
  function build(kind, party, opts) {
    opts = opts || {};
    var includeReturns = opts.includeReturns !== false;
    var isCust = kind !== 'supplier';
    var id = party && party.id;
    var out = {
      kind: kind,
      party: party || null,
      id: id,
      name: (party && party.name) || '',
      phone: (party && party.phone) || '',
      address: (party && party.address) || '',
      opening: 0,
      closing: 0,
      entries: [],
      settlements: [],
      totals: { debt: 0, paid: 0, net: 0 },
      aging: { b0: 0, b30: 0, b60: 0, b90: 0, total: 0, oldestDays: 0 },
      hasActivity: false,
    };
    if (!id || typeof DB === 'undefined') return out;

    var invoices = isCust ? DB.getInvoicesByCustomer(id) : DB.getInvoicesBySupplier(id);
    var payments = isCust ? DB.getCustomerPayments(id) : DB.getSupplierPayments(id);
    invoices = invoices || [];
    payments = payments || [];

    // Payment-voucher invoices already carry the movement; the individual
    // payment rows that point at them must not be counted twice.
    var voucherIds = {};
    invoices.forEach(function (inv) { if (inv && inv.type === 'payment') voucherIds[inv.id] = true; });

    var entries = [];

    invoices.forEach(function (inv) {
      if (!inv) return;
      var total = num(inv.totalAmount);
      var delta, label, tag, ref = inv.invoiceNumber || '';
      if (inv.type === 'payment') {
        // Customer collection voucher reduces the debt; supplier debt note
        // increases it (mirrors confirmPaymentInvoice in invoices.js).
        if (isCust) delta = (inv.direction === 'out') ? total : -total;
        else delta = (inv.direction === 'in') ? -total : total;
        label = inv.direction === 'out'
          ? tr('movements.entryDebtNote', 'سند دين')
          : tr('movements.entryReceipt', 'سند قبض');
        tag = 'voucher';
      } else if (!isCust && inv.type === 'sup_sale') {
        delta = -total;
        label = tr('movements.entrySupSale', 'بيع للمورد');
        tag = 'sale';
      } else {
        delta = total;
        label = isCust ? tr('movements.entrySale', 'فاتورة بيع') : tr('movements.entryPurchase', 'فاتورة شراء');
        tag = 'sale';
      }
      entries.push({
        ts: tsOf(inv),
        type: tag,
        label: label,
        ref: ref,
        note: inv.note || '',
        // Customer tree: display-only label. No extra entry/delta is created.
        subCustomerName: inv.subCustomerName || '',
        desc: (inv.items && inv.items.length)
          ? (inv.items.length + ' ' + tr('movements.itemsNoun', 'منتج'))
          : label,
        delta: delta,
        amount: total,
        invoiceId: inv.id,
        invoiceType: inv.type,
        createdAt: inv.createdAt || 0,
        date: inv.date || '',
      });
    });

    payments.forEach(function (p) {
      if (!p) return;
      if (p.invoiceId && voucherIds[p.invoiceId]) return; // represented by the voucher
      var amt = num(p.amount);
      if (!amt) return;
      entries.push({
        ts: tsOf(p),
        type: 'payment',
        label: tr('movements.entryPayment', 'دفعة'),
        ref: p.method || '',
        note: p.note || '',
        subCustomerName: p.subCustomerName || '',
        desc: p.note || tr('movements.entryPayment', 'دفعة'),
        delta: -amt,
        amount: amt,
        method: p.method || '',
        invoiceId: p.invoiceId || '',
        createdAt: p.createdAt || 0,
        date: p.date || '',
      });
    });

    entries.sort(function (a, b) { return (a.ts - b.ts) || 0; });

    // Returns (مرتجعات): INFORMATIONAL rows. A return never moves the balance
    // here — the invoice row already shows the app's stored, post-return total,
    // so counting the return again would double the credit. It is shown so the
    // operator sees the goods that came back, when, and why.
    if (includeReturns) {
      returnsFor(kind, id, invoices).forEach(function (r) {
        var ts = tsOf(r);
        var value = returnValue(r);
        var qty = num(r.qty);
        entries.push({
          ts: ts,
          type: 'return',
          label: tr('movements.entryReturn', 'مرتجع'),
          ref: invoiceRef(r),
          note: r.reason || '',
          desc: (r.productName ? r.productName : tr('movements.entryReturn', 'مرتجع')) + (qty ? ' × ' + fmtQty(qty) : ''),
          delta: 0,
          amount: value,
          informational: true,
          returnId: r.id,
          productName: r.productName || '',
          qty: qty,
          price: num(r.price),
          value: value,
          reason: r.reason || '',
          invoiceId: r.invoiceId || '',
          createdAt: r.createdAt || 0,
        });
      });
      entries.sort(function (a, b) { return (a.ts - b.ts) || 0; });
    }

    var sumDelta = entries.reduce(function (s, e) { return s + e.delta; }, 0);
    var current = num(party && party.balance);
    var opening = current - sumDelta;

    var running = opening;
    var settlements = [];
    var totalDebt = 0, totalPaid = 0;
    entries.forEach(function (e, i) {
      e.index = i + 1;
      var before = running;
      running += e.delta;
      e.balance = running;
      e.before = before;
      if (e.delta > 0) totalDebt += e.delta; else totalPaid += Math.abs(e.delta);

      // Settlement: a reducing movement that lands the balance back on zero.
      if (e.delta < 0 && Math.abs(running) <= TOL && Math.abs(before) > TOL) {
        var mark = {
          ts: e.ts,
          date: dateStr(e.ts),
          time: timeStr(e.ts),
          amount: e.amount,
          index: e.index,
        };
        e.settlement = mark;
        settlements.push(mark);
      }
    });

    out.opening = opening;
    out.closing = running;
    out.entries = entries;
    out.settlements = settlements;
    out.totals = { debt: totalDebt, paid: totalPaid, net: current };
    out.aging = aging(out);
    out.hasActivity = entries.length > 0;
    return out;
  }

  // ---------------------------------------------------------------- aging ----
  // FIFO debt aging. A payment settles the OLDEST invoice first, so whatever is
  // still outstanding belongs to the most recent invoices — that is why the
  // remaining balance is allocated from the newest debt backwards. Buckets:
  // 0-30, 31-60, 61-90, +90 days. Informational rows (returns) never carry debt.
  function aging(res) {
    var out = { b0: 0, b30: 0, b60: 0, b90: 0, total: 0, oldestDays: 0 };
    if (!res) return out;
    var bal = num(res.totals && res.totals.net);
    if (bal <= TOL) return out;
    var debts = (res.entries || []).filter(function (e) { return e.delta > 0 && !e.informational; });
    debts.sort(function (a, b) { return b.ts - a.ts; });
    var left = bal;
    debts.forEach(function (e) {
      if (left <= TOL) return;
      var take = Math.min(left, e.delta);
      var days = daysAgo(e.ts);
      if (days <= 30) out.b0 += take;
      else if (days <= 60) out.b30 += take;
      else if (days <= 90) out.b60 += take;
      else out.b90 += take;
      left -= take;
      if (take > 0) out.oldestDays = days;
    });
    if (left > TOL) {
      // The balance outlives every recorded debt: it comes from the derived
      // opening balance, whose exact age is unknown — treat it as the oldest.
      out.b90 += left;
      out.oldestDays = Math.max(out.oldestDays, 365);
    }
    out.total = bal;
    return out;
  }

  // ------------------------------------------------------------ time range --
  // Narrow a built ledger to [from, to] (ms timestamps or Date; null = open).
  // The slice opens on the balance the party carried INTO the range and the
  // running curve is recomputed, so the in-range balance column stays true.
  function sliceRange(res, from, to) {
    if (!res) return res;
    var fromTs = from == null ? null : (from instanceof Date ? from.getTime() : num(from));
    var toTs = to == null ? null : (to instanceof Date ? to.getTime() : num(to));
    if (fromTs == null && toTs == null) return res;

    var opening = num(res.opening);
    var kept = [];
    (res.entries || []).forEach(function (e) {
      if (fromTs != null && e.ts < fromTs) { opening += e.delta; return; }
      kept.push(e);
    });
    if (toTs != null) kept = kept.filter(function (e) { return e.ts <= toTs; });

    var out = shallow(res);
    out.opening = opening;
    out.entries = [];
    out.settlements = [];
    var running = opening;
    var debt = 0, paid = 0;
    kept.forEach(function (e, i) {
      var ne = shallow(e);
      ne.index = i + 1;
      var before = running;
      running += ne.delta;
      ne.balance = running;
      ne.before = before;
      ne.settlement = null;
      if (ne.delta > 0) debt += ne.delta; else paid += Math.abs(ne.delta);
      if (ne.delta < 0 && Math.abs(running) <= TOL && Math.abs(before) > TOL) {
        ne.settlement = { ts: ne.ts, date: dateStr(ne.ts), time: timeStr(ne.ts), amount: ne.amount, index: ne.index };
        out.settlements.push(ne.settlement);
      }
      out.entries.push(ne);
    });
    out.closing = running;
    out.totals = { debt: debt, paid: paid, net: num(res.totals && res.totals.net) };
    out.range = { from: fromTs, to: toTs };
    return out;
  }

  function buildAll(kind, opts) {
    var list = (kind === 'supplier')
      ? (DB && DB.getSuppliers ? DB.getSuppliers() : [])
      : (DB && DB.getCustomers ? DB.getCustomers() : []);
    return (list || []).map(function (p) { return build(kind, p, opts); });
  }

  // --------------------------------------------------------- returns ledger --
  // One party's returns, ready for the printable report. Independent from the
  // movements ledger so «تقرير المرتجعات» can be printed on its own.
  function buildReturns(kind, party, opts) {
    opts = opts || {};
    var isCust = kind !== 'supplier';
    var id = party && party.id;
    var out = {
      kind: kind, id: id, party: party || null,
      name: (party && party.name) || '', phone: (party && party.phone) || '',
      returns: [], count: 0, qty: 0, total: 0,
    };
    if (!id || typeof DB === 'undefined') return out;
    var invoices = isCust
      ? (DB.getInvoicesByCustomer ? DB.getInvoicesByCustomer(id) : [])
      : (DB.getInvoicesBySupplier ? DB.getInvoicesBySupplier(id) : []);
    var raw = returnsFor(kind, id, invoices).slice().sort(function (a, b) { return tsOf(a) - tsOf(b); });
    raw.forEach(function (r) {
      var ts = tsOf(r);
      var value = returnValue(r);
      var qty = num(r.qty);
      out.returns.push({
        ts: ts, date: dateStr(ts), time: timeStr(ts),
        product: r.productName || '', qty: qty, price: num(r.price),
        value: value, reason: r.reason || '', invoiceRef: invoiceRef(r),
      });
      out.count++; out.qty += qty; out.total += value;
    });
    return out;
  }

  // ------------------------------------------------------------- rendering --
  var CSS =
    '.pm-doc{direction:rtl;font-family:"Segoe UI","Tahoma",Arial,sans-serif;color:#1a1a1a;background:#fff;padding:14px 18px}' +
    '.pm-doc *{box-sizing:border-box}' +
    '.pm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #0d6efd;padding-bottom:10px;margin-bottom:12px}' +
    '.pm-store{font-size:20px;font-weight:900;letter-spacing:.5px}' +
    '.pm-store-meta{font-size:11px;color:#666;margin-top:3px;line-height:1.6}' +
    '.pm-title{font-size:18px;font-weight:900;color:#0d6efd;text-align:left}' +
    '.pm-title small{display:block;font-size:11px;color:#666;font-weight:600;margin-top:4px}' +
    '.pm-summary{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px}' +
    '.pm-sum-card{flex:1 1 150px;border:1px solid #d7dee8;border-radius:8px;padding:8px 12px;background:#f7fafc}' +
    '.pm-sum-label{font-size:11px;color:#667;font-weight:700}' +
    '.pm-sum-val{font-size:16px;font-weight:900;margin-top:2px}' +
    '.pm-party{border:1px solid #d7dee8;border-radius:10px;margin:0 0 16px;overflow:hidden;page-break-inside:auto}' +
    '.pm-party-head{display:flex;justify-content:space-between;align-items:center;gap:12px;background:linear-gradient(90deg,#eef4ff,#f8fbff);padding:9px 14px;border-bottom:1px solid #d7dee8}' +
    '.pm-party-name{font-size:15px;font-weight:900}' +
    '.pm-party-meta{font-size:11px;color:#667;font-weight:600;margin-top:2px}' +
    '.pm-party-bal{font-size:14px;font-weight:900;white-space:nowrap}' +
    'table.pm-table{width:100%;border-collapse:collapse;font-size:11.5px}' +
    'table.pm-table th,table.pm-table td{border-bottom:1px solid #e6ebf2;padding:6px 8px;text-align:right;vertical-align:top}' +
    'table.pm-table thead th{background:#f0f4f9;font-weight:800;font-size:11px;color:#334;border-bottom:2px solid #cfd8e3}' +
    'table.pm-table tbody tr:nth-child(even){background:#fafcfe}' +
    '.pm-c{text-align:center}' +
    '.pm-debit{color:#b45309;font-weight:800;white-space:nowrap}' +
    '.pm-credit{color:#15803d;font-weight:800;white-space:nowrap}' +
    '.pm-bal{font-weight:800;white-space:nowrap}' +
    '.pm-tag{display:inline-block;font-size:10px;font-weight:800;padding:1px 7px;border-radius:9px;border:1px solid}' +
    '.pm-tag-sale{color:#1d4ed8;border-color:#bfd3ff;background:#eef4ff}' +
    '.pm-tag-payment{color:#15803d;border-color:#b6e6c6;background:#eefaf1}' +
    '.pm-tag-voucher{color:#7c3aed;border-color:#d8c8ff;background:#f5f0ff}' +
    '.pm-tag-return{color:#b45309;border-color:#f2d3a8;background:#fff7ec}' +
    '.pm-tag-info{color:#8899aa;border-color:#dde3ea;background:#f4f6f9}' +
    '.pm-age-strip{display:flex;gap:6px;flex-wrap:wrap;padding:7px 14px;border-top:1px solid #e6ebf2;background:#fbfdff;font-size:10.5px}' +
    '.pm-age-cell{flex:1 1 90px;border:1px solid #dde3ea;border-radius:6px;padding:4px 8px;text-align:center}' +
    '.pm-age-cell b{display:block;font-size:12px}' +
    '.pm-age-fresh{border-color:#b6e6c6;background:#f2fbf5}' +
    '.pm-age-warn{border-color:#f2dfa8;background:#fffbf0}' +
    '.pm-age-late{border-color:#f6c9a8;background:#fff6f0}' +
    '.pm-age-old{border-color:#f3b4b4;background:#fff2f2}' +
    '.pm-limit{display:inline-block;font-size:10px;font-weight:800;padding:1px 8px;border-radius:9px;border:1px solid #f3b4b4;background:#fff2f2;color:#b91c1c;margin-right:6px}' +
    '.pm-settle td{background:#eefaf1!important;border-bottom:1px solid #b6e6c6!important;color:#0f7a37;font-weight:800;font-size:11px}' +
    '.pm-empty{padding:22px;text-align:center;color:#889;font-size:12px}' +
    '.pm-foot{margin-top:10px;font-size:10px;color:#889;text-align:center}' +
    '.pm-grand{border:2px solid #0d6efd;border-radius:10px;padding:10px 14px;background:#f5f9ff;display:flex;gap:20px;flex-wrap:wrap;justify-content:space-between}' +
    '.pm-grand b{font-size:15px}' +
    '@media print{.pm-party{page-break-inside:avoid}.pm-page-break{page-break-before:always}}';

  function tagClass(t) {
    if (t === 'payment') return 'pm-tag pm-tag-payment';
    if (t === 'voucher') return 'pm-tag pm-tag-voucher';
    if (t === 'return') return 'pm-tag pm-tag-return';
    return 'pm-tag pm-tag-sale';
  }

  function ageClass(days) {
    if (days > 90) return 'pm-age-old';
    if (days > 60) return 'pm-age-late';
    if (days > 30) return 'pm-age-warn';
    return 'pm-age-fresh';
  }

  function agingStrip(ag) {
    if (!ag || ag.total <= TOL) return '';
    return '<div class="pm-age-strip">' +
      '<div class="pm-age-cell pm-age-fresh">' + esc(tr('movements.age0', '0-30 يوم')) + '<b>DA' + fmt(ag.b0) + '</b></div>' +
      '<div class="pm-age-cell pm-age-warn">' + esc(tr('movements.age30', '31-60 يوم')) + '<b>DA' + fmt(ag.b30) + '</b></div>' +
      '<div class="pm-age-cell pm-age-late">' + esc(tr('movements.age60', '61-90 يوم')) + '<b>DA' + fmt(ag.b60) + '</b></div>' +
      '<div class="pm-age-cell pm-age-old">' + esc(tr('movements.age90', 'أكثر من 90 يوم')) + '<b>DA' + fmt(ag.b90) + '</b></div>' +
      '</div>';
  }

  function partyBlock(res, opts) {
    opts = opts || {};
    var isCust = res.kind !== 'supplier';
    var rows = '';
    if (!res.entries.length) {
      rows = '<tr><td colspan="8" class="pm-empty">' + esc(tr('movements.noMovements', 'لا توجد حركات مسجّلة')) + '</td></tr>';
    } else {
      res.entries.forEach(function (e) {
        rows += '<tr>' +
          '<td class="pm-c">' + e.index + '</td>' +
          '<td class="pm-c" dir="ltr">' + esc(dateStr(e.ts)) + '</td>' +
          '<td class="pm-c" dir="ltr">' + esc(timeStr(e.ts)) + '</td>' +
          '<td><span class="' + tagClass(e.type) + '">' + esc(e.label) + '</span>' +
            (e.desc && e.desc !== e.label ? ' <span style="color:#334">' + esc(e.desc) + '</span>' : '') +
            (e.note ? ' <span style="color:#667">' + esc(e.note) + '</span>' : '') +
            (e.informational ? ' <span style="color:#b45309;font-weight:800">DA' + fmt(e.value) + '</span>' : '') + '</td>' +
          '<td dir="ltr">' + esc(e.ref || '—') + '</td>' +
          '<td class="pm-debit">' + (e.delta > 0 ? 'DA' + fmt(e.delta) : '—') + '</td>' +
          '<td class="pm-credit">' + (e.delta < 0 ? 'DA' + fmt(Math.abs(e.delta)) : '—') + '</td>' +
          '<td class="pm-bal" style="color:' + (Math.abs(e.balance) <= TOL ? '#15803d' : '#334') + '">DA' + fmt(e.balance) + '</td>' +
          '</tr>';
        if (e.settlement) {
          rows += '<tr class="pm-settle"><td colspan="8" class="pm-c">' +
            '✔ ' + esc(tr('movements.settledTag', 'تسوية رصيد')) +
            ' — <span dir="ltr">' + esc(e.settlement.date + ' ' + e.settlement.time) + '</span>' +
            ' — ' + esc(tr('movements.balanceAfter', 'الرصيد بعدها')) + ': DA0.00' +
            '</td></tr>';
        }
      });
    }

    var openRow = '<tr>' +
      '<td class="pm-c">0</td><td class="pm-c" dir="ltr">—</td><td class="pm-c" dir="ltr">—</td>' +
      '<td><span class="pm-tag pm-tag-voucher">' + esc(tr('movements.opening', 'رصيد سابق')) + '</span></td>' +
      '<td dir="ltr">—</td><td class="pm-debit">—</td><td class="pm-credit">—</td>' +
      '<td class="pm-bal">DA' + fmt(res.opening) + '</td></tr>';

    var balColor = Math.abs(res.totals.net) <= TOL ? '#15803d' : (res.totals.net > 0 ? '#b45309' : '#15803d');
    var lim = num(res.party && res.party.creditLimit);
    var overLimit = (lim > 0 && res.totals.net > lim + TOL);
    return '<div class="pm-party">' +
      '<div class="pm-party-head">' +
        '<div><div class="pm-party-name">' + esc(res.name || '—') + '</div>' +
          '<div class="pm-party-meta">' +
            (res.phone ? esc(res.phone) + ' · ' : '') +
            esc(tr('movements.movCount', 'عدد الحركات')) + ': ' + res.entries.length +
            (res.settlements.length ? ' · ' + esc(tr('movements.settleCount', 'مرات التسوية')) + ': ' + res.settlements.length : '') +
            (overLimit ? ' · <span class="pm-limit">' + esc(tr('movements.overLimit', 'تجاوز سقف الدين')) + ' DA' + fmt(lim) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="pm-party-bal" style="color:' + balColor + '">' +
          esc(isCust ? tr('movements.currentDue', 'الرصيد الحالي') : tr('movements.currentDue', 'الرصيد الحالي')) +
          ': DA' + fmt(res.totals.net) + '</div>' +
      '</div>' +
      '<table class="pm-table">' +
        '<thead><tr>' +
          '<th class="pm-c">#</th>' +
          '<th class="pm-c">' + esc(tr('movements.colDate', 'التاريخ')) + '</th>' +
          '<th class="pm-c">' + esc(tr('movements.colTime', 'الوقت')) + '</th>' +
          '<th>' + esc(tr('movements.colDesc', 'البيان')) + '</th>' +
          '<th>' + esc(tr('movements.colRef', 'المرجع')) + '</th>' +
          '<th>' + esc(tr('movements.colDebit', 'مدين (+)')) + '</th>' +
          '<th>' + esc(tr('movements.colCredit', 'دائن (−)')) + '</th>' +
          '<th>' + esc(tr('movements.colBalance', 'الرصيد')) + '</th>' +
        '</tr></thead><tbody>' + openRow + rows + '</tbody>' +
      '</table>' +
      (opts.showAging === false ? '' : agingStrip(res.aging)) +
      (opts.showTotals === false ? '' :
        '<div style="display:flex;gap:18px;flex-wrap:wrap;padding:8px 14px;background:#f7fafc;border-top:1px solid #d7dee8;font-size:12px">' +
          '<span>' + esc(tr('movements.totalDebit', 'إجمالي المدين')) + ': <b style="color:#b45309">DA' + fmt(res.totals.debt) + '</b></span>' +
          '<span>' + esc(tr('movements.totalCredit', 'إجمالي الدائن')) + ': <b style="color:#15803d">DA' + fmt(res.totals.paid) + '</b></span>' +
          '<span>' + esc(tr('movements.finalBalance', 'الرصيد النهائي')) + ': <b>DA' + fmt(res.totals.net) + '</b></span>' +
        '</div>') +
      '</div>';
  }

  function reportHTML(results, kind, opts) {
    opts = opts || {};
    var isCust = kind !== 'supplier';
    var store = storeInfo();
    var now = Date.now();
    var rtl = true;
    try { if (typeof root.isRTL === 'function') rtl = root.isRTL(); } catch (e) {}

    var title = isCust
      ? (results.length === 1 ? tr('movements.reportTitleOneCust', 'كشف حركات العميل') : tr('movements.reportTitleAllCust', 'كشف حركات العملاء'))
      : (results.length === 1 ? tr('movements.reportTitleOneSup', 'كشف حركات المورد') : tr('movements.reportTitleAllSup', 'كشف حركات الموردين'));

    var gDebt = 0, gPaid = 0, gNet = 0;
    results.forEach(function (r) { gDebt += r.totals.debt; gPaid += r.totals.paid; gNet += r.totals.net; });

    var head =
      '<div class="pm-head">' +
        '<div>' +
          '<div class="pm-store">' + esc(store.name || 'ZMT PIECE') + '</div>' +
          '<div class="pm-store-meta">' +
            (store.address ? esc(store.address) + '<br>' : '') +
            (store.phone ? esc(tr('movements.phone', 'الهاتف')) + ': ' + esc(store.phone) : '') +
          '</div>' +
        '</div>' +
        '<div class="pm-title">' + esc(title) +
          (opts.rangeLabel ? '<small>' + esc(tr('movements.period', 'الفترة')) + ': <span dir="ltr">' + esc(opts.rangeLabel) + '</span></small>' : '') +
          '<small>' + esc(tr('movements.generatedAt', 'تاريخ الإصدار')) + ': <span dir="ltr">' + esc(stamp(now)) + '</span></small>' +
        '</div>' +
      '</div>';

    var summary =
      '<div class="pm-summary">' +
        '<div class="pm-sum-card"><div class="pm-sum-label">' + esc(isCust ? tr('movements.sumParties', 'عدد العملاء') : tr('movements.sumPartiesSup', 'عدد الموردين')) + '</div>' +
          '<div class="pm-sum-val">' + results.length + '</div></div>' +
        '<div class="pm-sum-card"><div class="pm-sum-label">' + esc(tr('movements.totalDebit', 'إجمالي المدين')) + '</div>' +
          '<div class="pm-sum-val" style="color:#b45309">DA' + fmt(gDebt) + '</div></div>' +
        '<div class="pm-sum-card"><div class="pm-sum-label">' + esc(tr('movements.totalCredit', 'إجمالي الدائن')) + '</div>' +
          '<div class="pm-sum-val" style="color:#15803d">DA' + fmt(gPaid) + '</div></div>' +
        '<div class="pm-sum-card"><div class="pm-sum-label">' + esc(tr('movements.netTotal', 'صافي الأرصدة')) + '</div>' +
          '<div class="pm-sum-val">DA' + fmt(gNet) + '</div></div>' +
      '</div>';

    var body = results.map(function (r, i) {
      return '<div class="' + (i > 0 ? 'pm-page-break' : '') + '">' + partyBlock(r, opts) + '</div>';
    }).join('');

    var grand = opts.showGrand && results.length > 1
      ? '<div class="pm-grand"><span>' + esc(tr('movements.grandTotal', 'الإجمالي العام')) + '</span>' +
          '<span>' + esc(tr('movements.totalDebit', 'إجمالي المدين')) + ': <b style="color:#b45309">DA' + fmt(gDebt) + '</b></span>' +
          '<span>' + esc(tr('movements.totalCredit', 'إجمالي الدائن')) + ': <b style="color:#15803d">DA' + fmt(gPaid) + '</b></span>' +
          '<span>' + esc(tr('movements.netTotal', 'صافي الأرصدة')) + ': <b>DA' + fmt(gNet) + '</b></span>' +
        '</div>'
      : '';

    var foot = '<div class="pm-foot">' + esc(store.name || 'ZMT PIECE') + ' — ' + esc(tr('movements.footNote', 'كشف حركات مُولَّد آلياً من سجلّات البرنامج')) + '</div>';

    return '<div class="pm-doc" dir="' + (rtl ? 'rtl' : 'ltr') + '"><style>' + CSS + '</style>' +
      head + summary + body + grand + foot + '</div>';
  }

  // Self-contained print window (mirrors openPrintWindow from invoices.js so the
  // feature works even if the invoices page has not been opened yet). Shared by
  // the movements report, the returns report and the monthly statement.
  // Fallback used only when the shared PrintMode helper is not loaded (e.g. a
  // unit test sandbox). The real app always goes through PrintMode.openPreview.
  function _pmBwCssFallback() {
    return '#pmSheet,#pmSheet *{color:#000!important;background:#fff!important;background-color:#fff!important;' +
      'border-color:#000!important;filter:grayscale(100%)!important}' +
      '#pmSheet table thead th,#pmSheet table tfoot td,#pmSheet .pm-sum-card,' +
      '#pmSheet .pm-party-head,#pmSheet .pm-grand,#pmSheet .pm-age-strip,' +
      '#pmSheet .pm-settle td{background:#ececec!important;background-color:#ececec!important}';
  }

  function printDoc(title, html, mode) {
    // Additive: the shared helper produces the same sheet, the same @page rule
    // and the same print button, plus the colour / black & white choice.
    try {
      if (root.PrintMode && typeof root.PrintMode.openPreview === 'function') {
        if (root.PrintMode.openPreview(title, html, { mode: mode || root.PrintMode.get() })) return;
      }
    } catch (ePm) {}

    var win = null;
    try { win = root.open('', '', 'width=900,height=700'); } catch (e) {}
    if (!win) {
      if (typeof root.alert === 'function') root.alert(tr('movements.allowPopups', 'يرجى السماح بالنوافذ المنبثقة للطباعة'));
      return;
    }
    var ppRule = '@page{size:A4;margin:10mm}';
    try {
      if (root.PrintPaper && typeof root.PrintPaper.pageRule === 'function') ppRule = root.PrintPaper.pageRule(10);
    } catch (e2) {}
    var previewW = '210mm';
    try {
      if (root.PrintPaper && typeof root.PrintPaper.previewWidthCss === 'function') previewW = root.PrintPaper.previewWidthCss();
    } catch (e3) {}
    var bar = '<div class="pm-bar">' +
      '<span class="pm-bar-title">' + esc(title) + '</span>' +
      '<button type="button" class="pm-bar-btn pm-bar-print" onclick="window.print()">' + esc(tr('movements.print', 'طباعة')) + '</button>' +
      '<button type="button" class="pm-bar-btn" onclick="window.close()">' + esc(tr('movements.close', 'إغلاق')) + '</button>' +
      '</div>';
    var css = ppRule +
      'html,body{margin:0;padding:0;background:#fff}' +
      '.pm-bar{position:sticky;top:0;z-index:9;display:flex;align-items:center;gap:10px;padding:10px 16px;background:#263238;color:#fff}' +
      '.pm-bar-title{font-weight:700;font-size:14px;flex:1}' +
      '.pm-bar-btn{cursor:pointer;border:1px solid #546e7a;background:#37474f;color:#fff;border-radius:4px;padding:6px 14px;font-size:13px}' +
      '.pm-bar-print{background:#1e88e5;border-color:#1e88e5;font-weight:700}' +
      '#pmSheet{background:#fff;max-width:' + previewW + ';margin:14px auto;box-shadow:0 2px 10px rgba(0,0,0,.25)}' +
      '@media print{.pm-bar{display:none!important}body{background:#fff}#pmSheet{max-width:none;margin:0;box-shadow:none}}' +
      (mode === 'bw' ? _pmBwCssFallback() : '');
    win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(title) + '</title>' +
      '<style>' + css + '</style></head><body>' + bar + '<div id="pmSheet">' + html + '</div></body></html>');
    win.document.close();
  }

  function printReport(results, kind, opts) {
    opts = opts || {};
    var title = (storeInfo().name || 'ZMT PIECE') + ' — ' + tr('movements.printTitle', 'كشف الحركات');
    printDoc(title, reportHTML(results, kind, opts), opts.mode);
  }

  // ------------------------------------------------------- returns report ---
  function returnsReportHTML(results, kind, opts) {
    opts = opts || {};
    var isCust = kind !== 'supplier';
    var store = storeInfo();
    var now = Date.now();
    var rtl = true;
    try { if (typeof root.isRTL === 'function') rtl = root.isRTL(); } catch (e) {}

    var title = isCust
      ? (results.length === 1 ? tr('movements.retTitleOneCust', 'تقرير مرتجعات العميل') : tr('movements.retTitleAllCust', 'تقرير مرتجعات العملاء'))
      : (results.length === 1 ? tr('movements.retTitleOneSup', 'تقرير مرتجعات المورد') : tr('movements.retTitleAllSup', 'تقرير مرتجعات الموردين'));

    var gTotal = 0, gQty = 0, gCount = 0;
    results.forEach(function (r) { gTotal += r.total; gQty += r.qty; gCount += r.count; });

    var head =
      '<div class="pm-head">' +
        '<div>' +
          '<div class="pm-store">' + esc(store.name || 'ZMT PIECE') + '</div>' +
          '<div class="pm-store-meta">' +
            (store.address ? esc(store.address) + '<br>' : '') +
            (store.phone ? esc(tr('movements.phone', 'الهاتف')) + ': ' + esc(store.phone) : '') +
          '</div>' +
        '</div>' +
        '<div class="pm-title">' + esc(title) +
          (opts.rangeLabel ? '<small>' + esc(tr('movements.period', 'الفترة')) + ': <span dir="ltr">' + esc(opts.rangeLabel) + '</span></small>' : '') +
          '<small>' + esc(tr('movements.generatedAt', 'تاريخ الإصدار')) + ': <span dir="ltr">' + esc(stamp(now)) + '</span></small>' +
        '</div>' +
      '</div>';

    var summary =
      '<div class="pm-summary">' +
        '<div class="pm-sum-card"><div class="pm-sum-label">' + esc(isCust ? tr('movements.sumParties', 'عدد العملاء') : tr('movements.sumPartiesSup', 'عدد الموردين')) + '</div>' +
          '<div class="pm-sum-val">' + results.length + '</div></div>' +
        '<div class="pm-sum-card"><div class="pm-sum-label">' + esc(tr('movements.retCount', 'عدد المرتجعات')) + '</div>' +
          '<div class="pm-sum-val">' + gCount + '</div></div>' +
        '<div class="pm-sum-card"><div class="pm-sum-label">' + esc(tr('movements.retQty', 'إجمالي الكمية')) + '</div>' +
          '<div class="pm-sum-val">' + fmtQty(gQty) + '</div></div>' +
        '<div class="pm-sum-card"><div class="pm-sum-label">' + esc(tr('movements.retValue', 'قيمة المرتجعات')) + '</div>' +
          '<div class="pm-sum-val" style="color:#b45309">DA' + fmt(gTotal) + '</div></div>' +
      '</div>';

    var body = results.map(function (r, i) {
      var rows = r.returns.map(function (x) {
        return '<tr>' +
          '<td class="pm-c" dir="ltr">' + esc(x.date) + '</td>' +
          '<td class="pm-c" dir="ltr">' + esc(x.time) + '</td>' +
          '<td dir="ltr">' + esc(x.invoiceRef || '—') + '</td>' +
          '<td>' + esc(x.product || '—') + '</td>' +
          '<td class="pm-c">' + fmtQty(x.qty) + '</td>' +
          '<td class="pm-debit">DA' + fmt(x.value) + '</td>' +
          '<td>' + esc(x.reason || '—') + '</td>' +
          '</tr>';
      }).join('');
      return '<div class="' + (i > 0 ? 'pm-page-break' : '') + '"><div class="pm-party">' +
        '<div class="pm-party-head">' +
          '<div><div class="pm-party-name">' + esc(r.name || '—') + '</div>' +
            '<div class="pm-party-meta">' + (r.phone ? esc(r.phone) + ' · ' : '') +
              esc(tr('movements.retCount', 'عدد المرتجعات')) + ': ' + r.count + '</div></div>' +
          '<div class="pm-party-bal" style="color:#b45309">DA' + fmt(r.total) + '</div>' +
        '</div>' +
        '<table class="pm-table"><thead><tr>' +
          '<th class="pm-c">' + esc(tr('movements.colDate', 'التاريخ')) + '</th>' +
          '<th class="pm-c">' + esc(tr('movements.colTime', 'الوقت')) + '</th>' +
          '<th>' + esc(tr('movements.colInvoice', 'الفاتورة')) + '</th>' +
          '<th>' + esc(tr('movements.colProduct', 'المنتج')) + '</th>' +
          '<th class="pm-c">' + esc(tr('movements.colQty', 'الكمية')) + '</th>' +
          '<th>' + esc(tr('movements.colValue', 'القيمة')) + '</th>' +
          '<th>' + esc(tr('movements.colReason', 'السبب')) + '</th>' +
        '</tr></thead><tbody>' + (rows || '<tr><td colspan="7" class="pm-empty">' + esc(tr('movements.noMovements', 'لا توجد حركات مسجّلة')) + '</td></tr>') + '</tbody></table>' +
        '</div></div>';
    }).join('');

    var grand = opts.showGrand && results.length > 1
      ? '<div class="pm-grand"><span>' + esc(tr('movements.grandTotal', 'الإجمالي العام')) + '</span>' +
          '<span>' + esc(tr('movements.retCount', 'عدد المرتجعات')) + ': <b>' + gCount + '</b></span>' +
          '<span>' + esc(tr('movements.retValue', 'قيمة المرتجعات')) + ': <b style="color:#b45309">DA' + fmt(gTotal) + '</b></span>' +
        '</div>'
      : '';

    var foot = '<div class="pm-foot">' + esc(store.name || 'ZMT PIECE') + ' — ' + esc(tr('movements.footNote', 'كشف حركات مُولَّد آلياً من سجلّات البرنامج')) + '</div>';

    return '<div class="pm-doc" dir="' + (rtl ? 'rtl' : 'ltr') + '"><style>' + CSS + '</style>' +
      head + summary + body + grand + foot + '</div>';
  }

  function printReturnsReport(results, kind, opts) {
    opts = opts || {};
    var title = (storeInfo().name || 'ZMT PIECE') + ' — ' + tr('movements.retPrintTitle', 'تقرير المرتجعات');
    printDoc(title, returnsReportHTML(results, kind, opts), opts.mode);
  }

  // ----------------------------------------------------- on-screen page UI --
  // Shared by BOTH movements pages (customer-movements / supplier-movements).
  // Keeping one implementation here guarantees the two pages can never drift
  // apart and keeps each page script a three-line wrapper.
  var _pmState = { kind: 'customer', partyId: 'all', search: '', from: '', to: '', includeReturns: true, chart: null, printMode: null };
  var _pmOpen = {}; // partyId -> expanded?
  var _pmSettlePartyId = null;
  var _pmSig = { canvas: null, ctx: null, drawing: false, dirty: false };

  // ---- derived-data memoisation (additive, never changes `build`) ----------
  // `build()` stays a pure function: every direct call still recomputes exactly
  // as before. Only the page/report path reuses the whole ledger list while the
  // DB revision is unchanged. When the DB exposes no revision (test fakes and
  // embedded reuse) caching is disabled, so those callers are unaffected.
  var _pmLedgerCache = { version: null, kind: null, includeReturns: null, list: null };
  var _pmSingleCache = { version: null, entries: {} };
  var _pmPartiesCache = { version: null, kind: null, list: null };
  var _pmSearchTimer = null;
  var _pmChartTimer = null;
  var _pmVisibleLimit = 200;

  // Optional diagnostics: add ?perf=1 to the page URL to log ledger/paint/chart
  // timings. Off by default — no timers, no console output in normal use.
  var _pmPerfEnabled = false;
  try { _pmPerfEnabled = /[?&]perf=1\b/.test(String((root.location && root.location.search) || '')); } catch (e) {}
  function _pmPerfLog(label, t0) {
    if (!_pmPerfEnabled) return;
    try {
      if (root.console && typeof root.console.debug === 'function') {
        root.console.debug('[zmt-perf] ' + label + ': ' + (Date.now() - t0) + 'ms');
      }
    } catch (e) {}
  }

  function _pmDataVersion() {
    var ver = null;
    try {
      if (typeof DB !== 'undefined' && DB && typeof DB.dataVersion === 'function') ver = DB.dataVersion();
    } catch (e) {}
    if (ver == null) return null; // no revision available → do not memoise
    // Company/store switches are written straight to localStorage by Auth and
    // the settings page (no DB write). Folding them into the key prevents a
    // cached ledger of company A from ever surfacing in company B.
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        ver += '|' + (localStorage.getItem('zmt_active_company') || '') +
          '|' + (localStorage.getItem('zmt_store_code') || '');
      }
    } catch (e) {}
    return ver;
  }

  function _pmRangeBounds() {
    var from = null, to = null;
    if (_pmState.from) {
      var f = new Date(_pmState.from + 'T00:00:00').getTime();
      if (isFinite(f)) from = f;
    }
    if (_pmState.to) {
      var t = new Date(_pmState.to + 'T23:59:59').getTime();
      if (isFinite(t)) to = t;
    }
    return { from: from, to: to };
  }

  function _pmRangeActive() {
    var b = _pmRangeBounds();
    return b.from != null || b.to != null;
  }

  function _pmRangeLabel() {
    if (!_pmRangeActive()) return '';
    return (_pmState.from || '…') + ' → ' + (_pmState.to || '…');
  }

  function _pmApplyRange(res) {
    if (!_pmRangeActive()) return res;
    var b = _pmRangeBounds();
    return sliceRange(res, b.from, b.to);
  }

  function _pmPartiesUncached() {
    var list = (_pmState.kind === 'supplier')
      ? (DB && DB.getSuppliers ? DB.getSuppliers() : [])
      : (DB && DB.getCustomers ? DB.getCustomers() : []);
    return (list || []).slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });
  }

  function _pmParties() {
    var ver = _pmDataVersion();
    if (ver === null) return _pmPartiesUncached();
    if (_pmPartiesCache.version === ver && _pmPartiesCache.kind === _pmState.kind) return _pmPartiesCache.list;
    var list = _pmPartiesUncached();
    _pmPartiesCache = { version: ver, kind: _pmState.kind, list: list };
    return list;
  }

  // The expensive part: one ledger per party. Cached as a whole so a keystroke,
  // a card toggle or a report never rebuilds every party's history.
  function _pmAllLedgers(kind, opts) {
    var ver = _pmDataVersion();
    if (ver === null) return _pmParties().map(function (p) { return build(kind, p, opts); });
    var inc = opts.includeReturns !== false;
    if (_pmLedgerCache.version === ver && _pmLedgerCache.kind === kind &&
        _pmLedgerCache.includeReturns === inc && _pmLedgerCache.list) {
      return _pmLedgerCache.list;
    }
    var list = _pmParties().map(function (p) { return build(kind, p, opts); });
    _pmLedgerCache = { version: ver, kind: kind, includeReturns: inc, list: list };
    if (_pmSingleCache.version !== ver) _pmSingleCache = { version: ver, entries: {} };
    list.forEach(function (r) { _pmSingleCache.entries[kind + '|' + r.id + '|' + (inc ? 1 : 0)] = r; });
    return list;
  }

  // Shared by the debt-alerts panel: reuses the very same ledger `build()`
  // would produce — either from the whole-list cache or from a small per-party
  // cache — instead of rebuilding one per owing party on every page visit.
  function buildCached(kind, party, opts) {
    if (!party || !party.id) return build(kind, party, opts);
    var ver = _pmDataVersion();
    if (ver === null) return build(kind, party, opts);
    var inc = !opts || opts.includeReturns !== false;
    var key = kind + '|' + party.id + '|' + (inc ? 1 : 0);
    if (_pmSingleCache.version === ver && _pmSingleCache.entries[key]) return _pmSingleCache.entries[key];
    var res = null;
    if (_pmLedgerCache.version === ver && _pmLedgerCache.kind === kind &&
        _pmLedgerCache.includeReturns === inc && _pmLedgerCache.list) {
      for (var i = 0; i < _pmLedgerCache.list.length; i++) {
        if (_pmLedgerCache.list[i].id === party.id) { res = _pmLedgerCache.list[i]; break; }
      }
    }
    if (!res) res = build(kind, party, opts);
    if (_pmSingleCache.version !== ver) _pmSingleCache = { version: ver, entries: {} };
    _pmSingleCache.entries[key] = res;
    return res;
  }

  function _pmMatch(q, res) {
    if (!q) return true;
    var hay = [res.name, res.phone, res.address].map(function (x) { return String(x || '').toLowerCase(); }).join(' ');
    if (hay.indexOf(q) !== -1) return true;
    return res.entries.some(function (e) {
      return String(e.ref || '').toLowerCase().indexOf(q) !== -1 ||
        String(e.note || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function _pmResults() {
    var q = String(_pmState.search || '').trim().toLowerCase();
    var opts = { includeReturns: _pmState.includeReturns !== false };
    var all = _pmAllLedgers(_pmState.kind, opts).map(_pmApplyRange);
    if (_pmState.partyId && _pmState.partyId !== 'all') {
      all = all.filter(function (r) { return r.id === _pmState.partyId; });
    }
    // With a date range on, a party with nothing inside the window is noise.
    if (_pmRangeActive()) all = all.filter(function (r) { return r.entries.length > 0; });
    if (q) all = all.filter(function (r) { return _pmMatch(q, r); });
    return all;
  }

  function _pmEntryRow(e) {
    var rowCls = '';
    if (e.delta > 0 && !e.informational) {
      var d = daysAgo(e.ts);
      rowCls = d > 90 ? ' pmp-row-old' : (d > 60 ? ' pmp-row-late' : (d > 30 ? ' pmp-row-warn' : ' pmp-row-fresh'));
    }
    var rows = '<tr class="' + rowCls.trim() + '">' +
      '<td class="pmp-c">' + e.index + '</td>' +
      '<td class="pmp-c" dir="ltr">' + esc(dateStr(e.ts)) + '</td>' +
      '<td class="pmp-c" dir="ltr">' + esc(timeStr(e.ts)) + '</td>' +
      '<td><span class="' + tagClass(e.type) + '">' + esc(e.label) + '</span>' +
        (e.desc && e.desc !== e.label ? ' <span class="pmp-desc">' + esc(e.desc) + '</span>' : '') +
        (e.note ? ' <span class="pmp-note">' + esc(e.note) + '</span>' : '') +
        (e.subCustomerName ? ' <span class="pmp-ct-chip"><i class="fas fa-user-tag"></i> ' + esc(e.subCustomerName) + '</span>' : '') +
        (e.informational ? ' <span class="pmp-value">DA' + fmt(e.value) + '</span>' : '') + '</td>' +
      '<td dir="ltr">' + esc(e.ref || '—') + '</td>' +
      '<td class="pmp-debit">' + (e.delta > 0 ? 'DA' + fmt(e.delta) : '—') + '</td>' +
      '<td class="pmp-credit">' + (e.delta < 0 ? 'DA' + fmt(Math.abs(e.delta)) : '—') + '</td>' +
      '<td class="pmp-bal" style="color:' + (Math.abs(e.balance) <= TOL ? '#15803d' : 'inherit') + '">DA' + fmt(e.balance) + '</td>' +
      '</tr>';
    if (e.settlement) {
      rows += '<tr class="pmp-settle"><td colspan="8" class="pmp-c">' +
        '<i class="fas fa-circle-check"></i> ' + esc(tr('movements.settledTag', 'تسوية رصيد')) +
        ' — <span dir="ltr">' + esc(e.settlement.date + ' ' + e.settlement.time) + '</span>' +
        ' — ' + esc(tr('movements.balanceAfter', 'الرصيد بعدها')) + ': DA0.00</td></tr>';
    }
    return rows;
  }

  function _pmAgeStrip(ag) {
    if (!ag || ag.total <= TOL) return '';
    return '<div class="pmp-age-strip">' +
      '<span class="pmp-age-cell pmp-age-fresh">' + esc(tr('movements.age0', '0-30 يوم')) + '<b>DA' + fmt(ag.b0) + '</b></span>' +
      '<span class="pmp-age-cell pmp-age-warn">' + esc(tr('movements.age30', '31-60 يوم')) + '<b>DA' + fmt(ag.b30) + '</b></span>' +
      '<span class="pmp-age-cell pmp-age-late">' + esc(tr('movements.age60', '61-90 يوم')) + '<b>DA' + fmt(ag.b60) + '</b></span>' +
      '<span class="pmp-age-cell pmp-age-old">' + esc(tr('movements.age90', 'أكثر من 90 يوم')) + '<b>DA' + fmt(ag.b90) + '</b></span>' +
      '</div>';
  }

  function _pmCard(res) {
    var open = _pmState.partyId !== 'all' || _pmOpen[res.id];
    var balColor = Math.abs(res.totals.net) <= TOL ? '#15803d' : (res.totals.net > 0 ? '#b45309' : '#15803d');
    var lim = num(res.party && res.party.creditLimit);
    var overLimit = (lim > 0 && res.totals.net > lim + TOL);
    var ag = res.aging;
    var ageBadge = '';
    if (ag && ag.total > TOL && ag.oldestDays > 0) {
      ageBadge = '<span class="pmp-age-badge ' + ageClass(ag.oldestDays) + '" title="' + esc(tr('movements.aging', 'أعمار الديون')) + '">' +
        '<i class="fas fa-clock"></i> ' + esc(tr('movements.oldest', 'أقدم دين')) + ': ' + ag.oldestDays + ' ' + esc(tr('movements.days', 'يوم')) + '</span>';
    }
    var limitBadge = overLimit
      ? '<span class="pmp-limit-badge"><i class="fas fa-triangle-exclamation"></i> ' + esc(tr('movements.overLimit', 'تجاوز سقف الدين')) + ' (DA' + fmt(lim) + ')</span>'
      : '';
    var rows = '';
    if (!res.entries.length) {
      rows = '<tr><td colspan="8" class="pmp-empty">' + esc(tr('movements.noMovements', 'لا توجد حركات مسجّلة')) + '</td></tr>';
    } else {
      rows = '<tr class="pmp-open-row">' +
        '<td class="pmp-c">0</td><td class="pmp-c" dir="ltr">—</td><td class="pmp-c" dir="ltr">—</td>' +
        '<td><span class="pm-tag pm-tag-voucher">' + esc(tr('movements.opening', 'رصيد سابق')) + '</span></td>' +
        '<td dir="ltr">—</td><td class="pmp-debit">—</td><td class="pmp-credit">—</td>' +
        '<td class="pmp-bal">DA' + fmt(res.opening) + '</td></tr>' +
        res.entries.map(_pmEntryRow).join('');
    }
    return '<div class="pmp-card' + (open ? ' is-open' : '') + '" data-party="' + esc(res.id) + '">' +
      '<div class="pmp-card-head" onclick="pmToggleParty(\'' + esc(res.id) + '\')">' +
        '<div class="pmp-card-id">' +
          '<i class="fas fa-chevron-' + (open ? 'down' : 'left') + ' pmp-caret"></i>' +
          '<div><div class="pmp-card-name">' + esc(res.name || '—') + '</div>' +
            '<div class="pmp-card-meta">' +
              (res.phone ? esc(res.phone) + ' · ' : '') +
              esc(tr('movements.movCount', 'عدد الحركات')) + ': ' + res.entries.length +
              (res.settlements.length ? ' · <span style="color:#15803d">' + esc(tr('movements.settleCount', 'مرات التسوية')) + ': ' + res.settlements.length + '</span>' : '') +
              (ageBadge ? ' · ' + ageBadge : '') +
              (limitBadge ? ' · ' + limitBadge : '') +
              ((typeof window !== 'undefined' && window.CustomerTree && window.CustomerTree.enabled())
                ? (function () {
                    var kids = window.CustomerTree.childrenOf(res.id);
                    return kids.length
                      ? ' · <span class="pmp-ct-badge"><i class="fas fa-sitemap"></i> ' + esc(kids.map(function (k) { return k.name; }).join(' · ')) + '</span>'
                      : '';
                  })()
                : '') +
            '</div></div>' +
        '</div>' +
        '<div class="pmp-card-right">' +
          '<span class="pmp-card-bal" style="color:' + balColor + '">DA' + fmt(res.totals.net) + '</span>' +
          '<button class="btn btn-sm pmp-settle-btn" onclick="event.stopPropagation();pmSettle(\'' + esc(res.id) + '\')" title="' + esc(tr('movements.settleNow', 'تسوية رصيد')) + '">' +
            '<i class="fas fa-hand-holding-dollar"></i><span> ' + esc(tr('movements.settleNow', 'تسوية رصيد')) + '</span></button>' +
          '<button class="btn btn-sm pmp-report-one" onclick="event.stopPropagation();pmReportOne(\'' + esc(res.id) + '\')" title="' + esc(tr('movements.viewReport', 'عرض كتقرير')) + '">' +
            '<i class="fas fa-file-pdf"></i> ' + esc(tr('movements.viewReport', 'عرض كتقرير')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="pmp-card-body">' +
        '<table class="pmp-table"><thead><tr>' +
          '<th class="pmp-c">#</th>' +
          '<th class="pmp-c">' + esc(tr('movements.colDate', 'التاريخ')) + '</th>' +
          '<th class="pmp-c">' + esc(tr('movements.colTime', 'الوقت')) + '</th>' +
          '<th>' + esc(tr('movements.colDesc', 'البيان')) + '</th>' +
          '<th>' + esc(tr('movements.colRef', 'المرجع')) + '</th>' +
          '<th>' + esc(tr('movements.colDebit', 'مدين (+)')) + '</th>' +
          '<th>' + esc(tr('movements.colCredit', 'دائن (−)')) + '</th>' +
          '<th>' + esc(tr('movements.colBalance', 'الرصيد')) + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
        _pmAgeStrip(ag) +
        '<div class="pmp-card-foot">' +
          '<span>' + esc(tr('movements.totalDebit', 'إجمالي المدين')) + ': <b style="color:#b45309">DA' + fmt(res.totals.debt) + '</b></span>' +
          '<span>' + esc(tr('movements.totalCredit', 'إجمالي الدائن')) + ': <b style="color:#15803d">DA' + fmt(res.totals.paid) + '</b></span>' +
          '<span>' + esc(tr('movements.finalBalance', 'الرصيد النهائي')) + ': <b>DA' + fmt(res.totals.net) + '</b></span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function _pmBrandActive() {
    try {
      return !!(root.BrandMovements && typeof root.BrandMovements.isActive === 'function' && root.BrandMovements.isActive());
    } catch (e) { return false; }
  }

  function _pmPrintMode() {
    var m = _pmState.printMode;
    if (m !== 'bw' && m !== 'color') {
      try { m = (root.PrintMode && typeof root.PrintMode.get === 'function') ? root.PrintMode.get() : 'color'; }
      catch (e) { m = 'color'; }
    }
    return m === 'bw' ? 'bw' : 'color';
  }

  function _pmSyncModeButtons() {
    var mode = _pmPrintMode();
    try {
      var all = (typeof document !== 'undefined' && document.querySelectorAll)
        ? document.querySelectorAll('.pm-print-mode') : [];
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el && typeof el.classList === 'object') {
          el.classList.toggle('active', el.getAttribute('data-mode') === mode);
        }
      }
      // Keep the brand panel's own print buttons in sync too (no recursion:
      // this only touches the DOM, it does not call BrandMovements.setPrintMode).
      var bmBtns = document.querySelectorAll('.bm-mode-btn');
      for (var j = 0; j < bmBtns.length; j++) {
        if (bmBtns[j] && typeof bmBtns[j].classList === 'object') {
          bmBtns[j].classList.toggle('active', bmBtns[j].getAttribute('data-mode') === mode);
        }
      }
    } catch (e) {}
  }

  function pmSetPrintMode(mode) {
    _pmState.printMode = (mode === 'bw') ? 'bw' : 'color';
    try { if (root.PrintMode && typeof root.PrintMode.set === 'function') root.PrintMode.set(_pmState.printMode); } catch (e) {}
    _pmSyncModeButtons();
    return _pmState.printMode;
  }

  // Switching colour mode is a preference only. The report is generated by the
  // existing «عرض كتقرير» button, so a mode click no longer rebuilds every
  // ledger, builds a huge HTML sheet and opens a print window.
  function pmPrintColor() { pmSetPrintMode('color'); }
  function pmPrintBw() { pmSetPrintMode('bw'); }

  function renderPage(kind, opts) {
    opts = opts || {};
    // Entering either movements page always restores the normal party ledger:
    // the brand view is an in-page mode of the CUSTOMER page only.
    try { if (root.BrandMovements && typeof root.BrandMovements.deactivate === 'function') root.BrandMovements.deactivate(); } catch (eB) {}
    var prevChart = _pmState.chart;
    _pmState = { kind: kind, partyId: 'all', search: '', from: '', to: '', includeReturns: true, chart: prevChart, printMode: _pmPrintMode() };
    _pmOpen = {};
    _pmVisibleLimit = 200;
    _pmSettlePartyId = null;

    var sel = document.getElementById('pmPartySelect');
    var parties = _pmParties();
    if (sel) {
      var html = '<option value="all">' +
        esc(kind === 'supplier' ? tr('movements.allSuppliers', 'كل الموردين') : tr('movements.allCustomers', 'كل العملاء')) +
        '</option>';
      parties.forEach(function (p) {
        html += '<option value="' + esc(p.id) + '">' + esc(p.name || '') + '</option>';
      });
      sel.innerHTML = html;
      sel.value = 'all';
    }
    var searchEl = document.getElementById('pmSearch');
    if (searchEl) searchEl.value = '';
    var fromEl = document.getElementById('pmDateFrom');
    if (fromEl) fromEl.value = '';
    var toEl = document.getElementById('pmDateTo');
    if (toEl) toEl.value = '';
    var retEl = document.getElementById('pmIncludeReturns');
    if (retEl) retEl.checked = true;
    pmRefresh();
  }

  function pmRefresh(opts) {
    opts = opts || {};
    // Brand view reuses #pmList / #pmChips entirely; the original ledger path
    // below is untouched and runs whenever the brand view is not active.
    if (_pmBrandActive()) {
      try { root.BrandMovements.render(); } catch (eBrand) {}
      return;
    }
    var tLedger = _pmPerfEnabled ? Date.now() : 0;
    var results = _pmResults();
    _pmPerfLog('ledger', tLedger);
    var chips = document.getElementById('pmChips');
    var list = document.getElementById('pmList');
    var isCust = _pmState.kind !== 'supplier';

    var gDebt = 0, gPaid = 0, gNet = 0, gSettle = 0, gReturns = 0;
    results.forEach(function (r) {
      gDebt += r.totals.debt; gPaid += r.totals.paid; gNet += r.totals.net; gSettle += r.settlements.length;
      (r.entries || []).forEach(function (e) { if (e.informational) gReturns++; });
    });

    if (chips) {
      chips.innerHTML =
        _pmChip(isCust ? tr('movements.sumParties', 'عدد العملاء') : tr('movements.sumPartiesSup', 'عدد الموردين'), String(results.length), '#1d4ed8') +
        _pmChip(tr('movements.totalDebit', 'إجمالي المدين'), 'DA' + fmt(gDebt), '#b45309') +
        _pmChip(tr('movements.totalCredit', 'إجمالي الدائن'), 'DA' + fmt(gPaid), '#15803d') +
        _pmChip(tr('movements.netTotal', 'صافي الأرصدة'), 'DA' + fmt(gNet), '#0f766e') +
        _pmChip(tr('movements.settleCount', 'مرات التسوية'), String(gSettle), '#7c3aed') +
        _pmChip(tr('movements.retCount', 'عدد المرتجعات'), String(gReturns), '#b45309');
    }

    // Expanding a single card does not change the result set, so the chart is
    // left untouched — destroying/recreating it was pure wasted work.
    // Typing also defers the chart: the cards paint first, then the chart is
    // drawn once instead of on every debounced keystroke.
    if (!opts.skipChart) {
      if (opts.deferChart && typeof root.setTimeout === 'function') {
        _pmScheduleChart(results);
      } else {
        var tChart = _pmPerfEnabled ? Date.now() : 0;
        _pmRenderChart(results);
        _pmPerfLog('chart', tChart);
      }
    }

    if (!list) return;
    if (!results.length) {
      list.innerHTML = '<div class="placeholder-box"><i class="fas fa-inbox" style="font-size:40px;color:#555"></i><p>' +
        esc(tr('movements.emptyList', 'لا توجد نتائج مطابقة')) + '</p></div>';
      return;
    }
    // Very large ledgers: paint the first page only. Printing, CSV, Excel,
    // WhatsApp/e-mail and every total still read the FULL `_pmResults()` list,
    // so no data or feature is lost — only the initial DOM work is deferred.
    var shown = _pmVisibleLimit > 0 ? results.slice(0, _pmVisibleLimit) : results;
    var rest = results.length - shown.length;
    var tPaint = _pmPerfEnabled ? Date.now() : 0;
    list.innerHTML = shown.map(_pmCard).join('') +
      (rest > 0
        ? '<button class="btn btn-sm pmp-show-more" onclick="pmShowMore()">' +
          esc(tr('movements.showMore', 'عرض المزيد')) + ' (' + rest + ')</button>'
        : '');
    _pmPerfLog('paint', tPaint);
  }

  // Debounced chart painting for search input. Only the most recent result set
  // is ever drawn; the DOM cards and all totals remain synchronous.
  function _pmScheduleChart(results) {
    if (_pmChartTimer && typeof root.clearTimeout === 'function') root.clearTimeout(_pmChartTimer);
    _pmChartTimer = root.setTimeout(function () {
      _pmChartTimer = null;
      var t = _pmPerfEnabled ? Date.now() : 0;
      _pmRenderChart(results);
      _pmPerfLog('chart (deferred)', t);
    }, 90);
  }

  // Mini balance chart (Chart.js when the dashboard has already loaded it).
  function _pmRenderChart(results) {
    var wrap = document.getElementById('pmChartWrap');
    var canvas = document.getElementById('pmChart');
    if (!wrap || !canvas) return;
    if (_pmState.chart && typeof _pmState.chart.destroy === 'function') {
      try { _pmState.chart.destroy(); } catch (e) {}
      _pmState.chart = null;
    }
    if (typeof root.Chart !== 'function' || typeof canvas.getContext !== 'function' || !results.length) {
      wrap.style.display = 'none';
      return;
    }
    try {
      if (results.length === 1) {
        var res = results[0];
        // A long ledger can hold thousands of rows. The chart is a visual aid:
        // draw the most recent 300 points with a correct starting balance,
        // while totals, cards, CSV and print keep reading the full ledger.
        var allEntries = res.entries || [];
        var sliced = allEntries.length > 300;
        var entries = sliced ? allEntries.slice(allEntries.length - 300) : allEntries;
        var base = (sliced && entries.length)
          ? (num(entries[0].balance) - num(entries[0].delta))
          : num(res.opening);
        var labels = ['0'].concat(entries.map(function (e) { return dateStr(e.ts); }));
        var data = [Math.round(base * 100) / 100].concat(entries.map(function (e) { return Math.round(num(e.balance) * 100) / 100; }));
        wrap.style.display = '';
        _pmState.chart = new root.Chart(canvas.getContext('2d'), {
          type: 'line',
          data: { labels: labels, datasets: [{ label: tr('movements.colBalance', 'الرصيد'), data: data, borderColor: '#0d6efd', backgroundColor: 'rgba(13,110,253,.12)', fill: true, tension: .25, pointRadius: 2 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
        });
      } else {
        var top = results.slice().sort(function (a, b) { return Math.abs(b.totals.net) - Math.abs(a.totals.net); }).slice(0, 12);
        wrap.style.display = '';
        _pmState.chart = new root.Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: top.map(function (r) { return r.name; }),
            datasets: [{
              label: tr('movements.colBalance', 'الرصيد'),
              data: top.map(function (r) { return Math.round(num(r.totals.net) * 100) / 100; }),
              backgroundColor: top.map(function (r) { return r.totals.net > TOL ? '#b45309' : (r.totals.net < -TOL ? '#15803d' : '#8899aa'); }),
            }],
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
        });
      }
    } catch (e) { try { wrap.style.display = 'none'; } catch (e2) {} }
  }

  function _pmChip(label, value, color) {
    return '<div class="pmp-chip"><span class="pmp-chip-label">' + esc(label) + '</span>' +
      '<span class="pmp-chip-val" style="color:' + color + '">' + esc(value) + '</span></div>';
  }

  // ---- global handlers (referenced by the page markup) ----
  function pmOnPartyChange(v) {
    if (_pmBrandActive()) return; // brand view owns #pmList while active
    _pmState.partyId = v || 'all';
    pmRefresh();
  }

  function pmOnSearch(v) {
    _pmState.search = v || '';
    if (_pmBrandActive()) {
      try { if (root.BrandMovements && typeof root.BrandMovements.onSearch === 'function') root.BrandMovements.onSearch(v || ''); } catch (e) {}
      return;
    }
    // Inline `oninput="pmOnSearch(this.value)"` handlers run with a live
    // window.event in Chromium; batch rapid keystrokes there. Programmatic
    // calls (tests, sync hooks, other scripts) stay synchronous as before.
    var fromInput = false;
    try { fromInput = !!(root.event && root.event.type === 'input'); } catch (e) {}
    if (_pmSearchTimer && typeof root.clearTimeout === 'function') root.clearTimeout(_pmSearchTimer);
    _pmSearchTimer = null;
    if (fromInput && typeof root.setTimeout === 'function') {
      _pmVisibleLimit = 200;
      _pmSearchTimer = root.setTimeout(function () { _pmSearchTimer = null; pmRefresh({ deferChart: true }); }, 120);
    } else {
      pmRefresh();
    }
  }

  function pmShowMore() {
    if (_pmBrandActive()) return;
    _pmVisibleLimit += 200;
    pmRefresh({ skipChart: true });
  }

  function pmToggleParty(id) {
    if (_pmBrandActive()) return;
    _pmOpen[id] = !_pmOpen[id];
    // Replace ONLY this card: rebuilding hundreds of cards (and the chart)
    // just to expand one row was the largest interactive slowdown.
    var list = document.getElementById('pmList');
    var el = null;
    if (list && list.children) {
      for (var i = 0; i < list.children.length; i++) {
        var c = list.children[i];
        if (c && typeof c.getAttribute === 'function' && c.getAttribute('data-party') === String(id)) {
          el = c;
          break;
        }
      }
    }
    if (el && typeof document.createElement === 'function' && typeof list.replaceChild === 'function') {
      try {
        var results = _pmResults();
        var found = null;
        for (var j = 0; j < results.length; j++) {
          if (results[j].id === id) { found = results[j]; break; }
        }
        if (found) {
          var tmp = document.createElement('div');
          tmp.innerHTML = _pmCard(found);
          var node = tmp.firstElementChild;
          if (node) { list.replaceChild(node, el); return; }
        }
      } catch (e) { /* fall back to a full, correct repaint */ }
    }
    pmRefresh({ skipChart: true });
  }

  function pmShowReport() {
    if (_pmBrandActive()) {
      try { if (root.BrandMovements && typeof root.BrandMovements.showReport === 'function') root.BrandMovements.showReport(); } catch (e) {}
      return;
    }
    var results = _pmResults();
    if (!results.length) {
      if (typeof root.alert === 'function') root.alert(tr('movements.nothingToPrint', 'لا توجد بيانات للطباعة'));
      return;
    }
    printReport(results, _pmState.kind, { showGrand: true, rangeLabel: _pmRangeLabel(), mode: _pmPrintMode() });
  }

  function pmReportOne(id) {
    if (_pmBrandActive()) return;
    var party = _pmPartyById(id);
    var res = build(_pmState.kind, party, { includeReturns: _pmState.includeReturns !== false });
    if (!res || !res.id) return;
    var sliced = _pmApplyRange(res);
    printReport([sliced], _pmState.kind, { showGrand: false, rangeLabel: _pmRangeLabel(), mode: _pmPrintMode() });
  }

  // ---- time range ----
  function pmOnRange(from, to) {
    if (from !== undefined) _pmState.from = from || '';
    if (to !== undefined) _pmState.to = to || '';
    if (_pmBrandActive()) {
      try { if (root.BrandMovements && typeof root.BrandMovements.onRange === 'function') root.BrandMovements.onRange(_pmState.from, _pmState.to); } catch (e) {}
      return;
    }
    pmRefresh();
  }

  function _pmSetDateInputs(from, to) {
    var f = document.getElementById('pmDateFrom');
    if (f) f.value = from || '';
    var t = document.getElementById('pmDateTo');
    if (t) t.value = to || '';
  }

  function _pmTodayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function pmQuickRange(kind) {
    if (_pmBrandActive()) {
      try { if (root.BrandMovements && typeof root.BrandMovements.quickRange === 'function') root.BrandMovements.quickRange(kind); } catch (e) {}
      return;
    }
    if (kind === 'all') {
      _pmState.from = ''; _pmState.to = '';
      _pmSetDateInputs('', '');
      pmRefresh();
      return;
    }
    var today = new Date();
    var from = new Date(today.getTime());
    if (kind === 'today') { /* from == today */ }
    else if (kind === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);
    else if (kind === '7') from.setDate(from.getDate() - 6);
    else from.setDate(from.getDate() - 29); // '30'
    var f = from.getFullYear() + '-' + pad2(from.getMonth() + 1) + '-' + pad2(from.getDate());
    var t = _pmTodayStr();
    _pmState.from = f; _pmState.to = t;
    _pmSetDateInputs(f, t);
    pmRefresh();
  }

  function pmOnReturnsToggle(v) {
    _pmState.includeReturns = !!v;
    if (_pmBrandActive()) return;
    pmRefresh();
  }

  // ---- returns report ----
  function pmShowReturnsReport() {
    if (_pmBrandActive()) {
      try { if (root.BrandMovements && typeof root.BrandMovements.showReport === 'function') root.BrandMovements.showReport(); } catch (e) {}
      return;
    }
    var kind = _pmState.kind;
    var parties = (_pmState.partyId && _pmState.partyId !== 'all')
      ? [_pmPartyById(_pmState.partyId)]
      : _pmParties();
    var results = (parties || []).filter(Boolean).map(function (p) { return buildReturns(kind, p); });
    var b = _pmRangeBounds();
    if (b.from != null || b.to != null) {
      results.forEach(function (r) {
        r.returns = r.returns.filter(function (x) {
          return (b.from == null || x.ts >= b.from) && (b.to == null || x.ts <= b.to);
        });
        r.count = r.returns.length;
        r.total = r.returns.reduce(function (s, x) { return s + x.value; }, 0);
        r.qty = r.returns.reduce(function (s, x) { return s + x.qty; }, 0);
      });
    }
    results = results.filter(function (r) { return r.count > 0; });
    if (!results.length) {
      if (typeof root.alert === 'function') root.alert(tr('movements.noReturns', 'لا توجد مرتجعات مسجّلة'));
      return;
    }
    printReturnsReport(results, kind, { showGrand: true, rangeLabel: _pmRangeLabel(), mode: _pmPrintMode() });
  }

  function pmMonthlyStatement() {
    if (_pmBrandActive()) {
      try {
        if (root.BrandMovements && typeof root.BrandMovements.quickRange === 'function') root.BrandMovements.quickRange('month');
        if (root.BrandMovements && typeof root.BrandMovements.showReport === 'function') root.BrandMovements.showReport();
      } catch (e) {}
      return;
    }
    pmQuickRange('month');
    pmShowReport();
  }

  // ---- Excel / CSV export ----
  function _pmCsvCell(v) {
    var s = String(v == null ? '' : v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function pmExportCsv() {
    if (_pmBrandActive()) {
      try { if (root.BrandMovements && typeof root.BrandMovements.exportCsv === 'function') root.BrandMovements.exportCsv(); } catch (e) {}
      return;
    }
    var results = _pmResults();
    if (!results.length) {
      if (typeof root.alert === 'function') root.alert(tr('movements.nothingToExport', 'لا توجد بيانات للتصدير'));
      return;
    }
    var isCust = _pmState.kind !== 'supplier';
    var header = [
      tr('movements.colParty', 'الطرف'), tr('movements.colDate', 'التاريخ'), tr('movements.colTime', 'الوقت'),
      tr('movements.colDesc', 'البيان'), tr('movements.colRef', 'المرجع'),
      tr('movements.colDebit', 'مدين'), tr('movements.colCredit', 'دائن'), tr('movements.colBalance', 'الرصيد'),
    ];
    var rows = [header];
    results.forEach(function (res) {
      (res.entries || []).forEach(function (e) {
        rows.push([
          res.name, dateStr(e.ts), timeStr(e.ts),
          e.label + (e.desc && e.desc !== e.label ? ' - ' + e.desc : '') + (e.note ? ' - ' + e.note : ''),
          e.ref || '', e.delta > 0 ? e.delta : '', e.delta < 0 ? Math.abs(e.delta) : '', e.balance,
        ]);
      });
    });
    var fname = 'ZMT_' + (isCust ? 'Customers' : 'Suppliers') + '_Movements_' + _pmTodayStr();
    var api = root.electronAPI;

    if (root.XLSX && root.XLSX.utils) {
      try {
        var ws = root.XLSX.utils.aoa_to_sheet(rows);
        var wb = root.XLSX.utils.book_new();
        root.XLSX.utils.book_append_sheet(wb, ws, tr('movements.printTitle', 'كشف الحركات'));
        if (api && api.saveFile && api.writeFileBinary) {
          api.saveFile({ defaultPath: fname + '.xlsx', filters: [{ name: 'Excel', extensions: ['xlsx'] }] }).then(function (r) {
            if (r && !r.canceled && r.filePath) {
              var b64 = root.XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
              api.writeFileBinary(r.filePath, b64).then(function (res2) {
                if (typeof root.alert === 'function') root.alert(res2 && res2.success ? tr('movements.exportOk', 'تم التصدير بنجاح') : tr('movements.exportFail', 'تعذّر التصدير'));
              });
            }
          });
        } else {
          root.XLSX.writeFile(wb, fname + '.xlsx');
        }
        return;
      } catch (e) { /* fall through to CSV */ }
    }

    var csv = '\ufeff' + rows.map(function (r) { return r.map(_pmCsvCell).join(','); }).join('\r\n');
    if (api && api.saveFile && api.writeFile) {
      api.saveFile({ defaultPath: fname + '.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] }).then(function (r) {
        if (r && !r.canceled && r.filePath) {
          api.writeFile(r.filePath, csv).then(function (res2) {
            if (typeof root.alert === 'function') root.alert(res2 && res2.success ? tr('movements.exportOk', 'تم التصدير بنجاح') : tr('movements.exportFail', 'تعذّر التصدير'));
          });
        }
      });
      return;
    }
    try {
      var blob = new root.Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var a = document.createElement('a');
      a.href = root.URL.createObjectURL(blob);
      a.download = fname + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (e2) {
      if (typeof root.alert === 'function') root.alert(tr('movements.exportFail', 'تعذّر التصدير'));
    }
  }

  function _pmStatementText() {
    var results = _pmResults();
    var store = storeInfo();
    var lines = [];
    lines.push(store.name || 'ZMT PIECE');
    lines.push(tr('movements.printTitle', 'كشف الحركات') + ' — ' + stamp(Date.now()));
    if (_pmRangeActive()) lines.push(tr('movements.period', 'الفترة') + ': ' + _pmRangeLabel());
    results.forEach(function (r) {
      lines.push('• ' + (r.name || '—') + ': DA' + fmt(r.totals.net) +
        ' (' + tr('movements.movCount', 'عدد الحركات') + ': ' + r.entries.length + ')');
    });
    if (results.length > 1) {
      var g = results.reduce(function (s, r) { return s + r.totals.net; }, 0);
      lines.push(tr('movements.netTotal', 'صافي الأرصدة') + ': DA' + fmt(g));
    }
    return lines.join('\n');
  }

  function _pmOpenExternal(url) {
    try {
      if (root.electronAPI && typeof root.electronAPI.openExternal === 'function') { root.electronAPI.openExternal(url); return; }
    } catch (e) {}
    try { root.open(url, '_blank'); } catch (e2) {}
  }

  function _pmPhoneDigits(p) {
    var d = String(p || '').replace(/[^\d]/g, '');
    if (!d) return '';
    if (d.charAt(0) === '0') d = '213' + d.slice(1);
    else if (d.length === 9) d = '213' + d;
    return d;
  }

  function pmSendWhatsApp() {
    var results = _pmResults();
    if (!results.length) { if (typeof root.alert === 'function') root.alert(tr('movements.nothingToSend', 'لا توجد بيانات للإرسال')); return; }
    var text = _pmStatementText();
    var digits = '';
    if (results.length === 1) {
      var p = _pmPartyById(results[0].id);
      digits = _pmPhoneDigits(p && p.phone);
    }
    var url = digits
      ? ('https://wa.me/' + digits + '?text=' + encodeURIComponent(text))
      : ('https://wa.me/?text=' + encodeURIComponent(text));
    _pmOpenExternal(url);
  }

  function _pmSmtp() {
    try {
      var ls = root.localStorage;
      if (!ls) return null;
      var host = ls.getItem('zmt_smtp_host') || '';
      if (!host) return null;
      return {
        host: host,
        port: ls.getItem('zmt_smtp_port') || '587',
        user: ls.getItem('zmt_smtp_user') || '',
        pass: ls.getItem('zmt_smtp_pass') || '',
        from: ls.getItem('zmt_smtp_from') || ls.getItem('zmt_smtp_user') || '',
        secure: ls.getItem('zmt_smtp_secure') === '1',
      };
    } catch (e) { return null; }
  }

  function _pmVal(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '') : '';
  }

  function pmSendEmail() {
    var results = _pmResults();
    if (!results.length) { if (typeof root.alert === 'function') root.alert(tr('movements.nothingToSend', 'لا توجد بيانات للإرسال')); return; }
    var party = results.length === 1 ? _pmPartyById(results[0].id) : null;
    var to = (party && party.email) || '';
    var subject = tr('movements.printTitle', 'كشف الحركات') + ' — ' + (storeInfo().name || 'ZMT PIECE');
    var container = document.getElementById('pageContainer') || document.body;
    var m = document.getElementById('pmEmailModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'pmEmailModal';
      m.className = 'modal-overlay';
      m.style.zIndex = '100005';
      m.addEventListener('click', function (e) { if (e.target === m) pmEmailCancel(); });
      container.appendChild(m);
    }
    m.innerHTML = '<div class="modal" style="max-width:520px">' +
      '<div class="modal-header"><h3><i class="fas fa-envelope"></i> ' + esc(tr('movements.sendEmail', 'إرسال بالبريد')) + '</h3>' +
        '<button class="modal-close" onclick="pmEmailCancel()">&times;</button></div>' +
      '<div class="modal-body pm-modal-body">' +
        '<label class="pm-label">' + esc(tr('movements.emailTo', 'إلى')) + '</label>' +
        '<input id="pmEmailTo" class="form-input" type="email" value="' + esc(to) + '" dir="ltr">' +
        '<label class="pm-label">' + esc(tr('movements.emailSubject', 'الموضوع')) + '</label>' +
        '<input id="pmEmailSubject" class="form-input" value="' + esc(subject) + '">' +
        '<label class="pm-label">' + esc(tr('movements.emailBody', 'النص')) + '</label>' +
        '<textarea id="pmEmailMsg" class="form-input" rows="7" dir="rtl">' + esc(_pmStatementText()) + '</textarea>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary" onclick="pmEmailCancel()">' + esc(tr('movements.cancel', 'إلغاء')) + '</button>' +
        '<button class="btn btn-primary" onclick="pmEmailSend()"><i class="fas fa-paper-plane"></i> ' + esc(tr('movements.send', 'إرسال')) + '</button>' +
      '</div></div>';
    m.style.display = 'flex';
  }

  function pmEmailCancel() {
    var m = document.getElementById('pmEmailModal');
    if (m) m.style.display = 'none';
  }

  function pmEmailSend() {
    var to = _pmVal('pmEmailTo').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      if (typeof root.alert === 'function') root.alert(tr('movements.emailInvalid', 'بريد إلكتروني غير صالح'));
      return;
    }
    var subject = _pmVal('pmEmailSubject').trim() || tr('movements.printTitle', 'كشف الحركات');
    var text = _pmVal('pmEmailMsg') || _pmStatementText();
    var smtp = _pmSmtp();
    var api = root.electronAPI;
    if (smtp && api && typeof api.sendEmail === 'function') {
      api.sendEmail({ to: to, subject: subject, text: text, smtp: smtp }).then(function (r) {
        pmEmailCancel();
        if (typeof root.alert === 'function') {
          root.alert(r && r.success ? tr('movements.emailSent', 'تم إرسال البريد') : (tr('movements.emailFail', 'تعذّر إرسال البريد') + ' ' + ((r && r.error) || '')));
        }
      });
      return;
    }
    var url = 'https://mail.google.com/mail/?view=cm&to=' + encodeURIComponent(to) +
      '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
    _pmOpenExternal(url);
    pmEmailCancel();
  }

  // ---- one-click settlement (تسوية رصيد) ----
  function _pmSigReset() { _pmSig = { canvas: null, ctx: null, drawing: false, dirty: false }; }

  function pmSigClear() {
    if (_pmSig.ctx && _pmSig.canvas) {
      try { _pmSig.ctx.clearRect(0, 0, _pmSig.canvas.width, _pmSig.canvas.height); } catch (e) {}
    }
    _pmSig.dirty = false;
  }

  function pmSigData() {
    if (!_pmSig.dirty || !_pmSig.canvas || typeof _pmSig.canvas.toDataURL !== 'function') return '';
    try { return _pmSig.canvas.toDataURL('image/png'); } catch (e) { return ''; }
  }

  function _pmSigInit() {
    _pmSigReset();
    var c = document.getElementById('pmSigPad');
    if (!c || typeof c.getContext !== 'function') return;
    var ctx = null;
    try { ctx = c.getContext('2d'); } catch (e) { return; }
    if (!ctx) return;
    _pmSig.canvas = c;
    _pmSig.ctx = ctx;
    try { ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b3d91'; } catch (e2) {}
    var pos = function (ev) {
      var r = (c.getBoundingClientRect ? c.getBoundingClientRect() : { left: 0, top: 0, width: c.width || 1, height: c.height || 1 });
      var sx = (c.width || r.width || 1) / (r.width || c.width || 1);
      var sy = (c.height || r.height || 1) / (r.height || c.height || 1);
      var cx = (ev.clientX != null ? ev.clientX : 0);
      var cy = (ev.clientY != null ? ev.clientY : 0);
      return { x: (cx - (r.left || 0)) * sx, y: (cy - (r.top || 0)) * sy };
    };
    var start = function (ev) { _pmSig.drawing = true; _pmSig.dirty = true; var p = pos(ev); try { ctx.beginPath(); ctx.moveTo(p.x, p.y); } catch (e) {} if (ev.preventDefault) ev.preventDefault(); };
    var move = function (ev) { if (!_pmSig.drawing) return; var p = pos(ev); try { ctx.lineTo(p.x, p.y); ctx.stroke(); } catch (e) {} if (ev.preventDefault) ev.preventDefault(); };
    var end = function () { _pmSig.drawing = false; };
    if (c.addEventListener) {
      c.addEventListener('mousedown', start);
      c.addEventListener('mousemove', move);
      c.addEventListener('mouseup', end);
      c.addEventListener('mouseleave', end);
      c.addEventListener('touchstart', start, { passive: false });
      c.addEventListener('touchmove', move, { passive: false });
      c.addEventListener('touchend', end);
    }
  }

  function pmSettle(partyId) {
    // Never let a settlement be written while the brand report is on screen.
    if (_pmBrandActive()) {
      if (typeof root.alert === 'function') {
        root.alert(tr('movements.brandSettleBlocked', 'ارجع لحركات العملاء قبل تسوية الرصيد'));
      }
      return;
    }
    var id = partyId || (_pmState.partyId !== 'all' ? _pmState.partyId : '');
    if (!id) { if (typeof root.alert === 'function') root.alert(tr('movements.pickOneParty', 'اختر طرفاً محدداً أولاً')); return; }
    var party = _pmPartyById(id);
    if (!party) return;
    _pmSettlePartyId = id;
    var isCust = _pmState.kind !== 'supplier';
    var bal = num(party.balance);
    var prefill = Math.abs(bal) > TOL ? String(Math.round(Math.abs(bal) * 100) / 100) : '';
    var container = document.getElementById('pageContainer') || document.body;
    var m = document.getElementById('pmSettleModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'pmSettleModal';
      m.className = 'modal-overlay';
      m.style.zIndex = '100006';
      m.addEventListener('click', function (e) { if (e.target === m) pmSettleCancel(); });
      container.appendChild(m);
    }
    var methodOpts =
      '<option value="cash">' + esc(tr('movements.mCash', 'نقداً')) + '</option>' +
      '<option value="ccp">' + esc(tr('movements.mCcp', 'CCP')) + '</option>' +
      '<option value="check">' + esc(tr('movements.mCheck', 'شيك')) + '</option>' +
      '<option value="transfer">' + esc(tr('movements.mTransfer', 'تحويل')) + '</option>';
    m.innerHTML = '<div class="modal" style="max-width:560px">' +
      '<div class="modal-header"><h3><i class="fas fa-hand-holding-dollar"></i> ' + esc(tr('movements.settleNow', 'تسوية رصيد')) + '</h3>' +
        '<button class="modal-close" onclick="pmSettleCancel()">&times;</button></div>' +
      '<div class="modal-body pm-modal-body">' +
        '<div class="pm-settle-head">' +
          '<div><div class="pm-settle-name">' + esc(party.name || '—') + '</div>' +
            '<div class="pm-settle-sub">' + esc(isCust ? tr('movements.customer', 'عميل') : tr('movements.supplier', 'مورد')) + '</div></div>' +
          '<div class="pm-settle-bal">' + esc(tr('movements.currentDue', 'الرصيد الحالي')) + ': DA' + fmt(bal) + '</div>' +
        '</div>' +
        '<label class="pm-label">' + esc(tr('movements.settleAmount', 'المبلغ')) + '</label>' +
        '<input id="pmSettleAmount" class="form-input" type="text" inputmode="decimal" value="' + esc(prefill) + '" dir="ltr">' +
        '<label class="pm-label">' + esc(tr('movements.settleMethod', 'طريقة الدفع')) + '</label>' +
        '<select id="pmSettleMethod" class="form-input">' + methodOpts + '</select>' +
        '<label class="pm-label">' + esc(tr('movements.settleNote', 'ملاحظة')) + '</label>' +
        '<input id="pmSettleNote" class="form-input" value="' + esc(tr('movements.settleDefaultNote', 'تسوية رصيد')) + '">' +
        '<label class="pm-label">' + esc(tr('movements.signature', 'التوقيع الإلكتروني')) + '</label>' +
        '<canvas id="pmSigPad" class="pm-sig-pad" width="520" height="150"></canvas>' +
        '<div class="pm-sig-tools"><button type="button" class="btn btn-sm" onclick="pmSigClear()"><i class="fas fa-eraser"></i> ' + esc(tr('movements.clearSig', 'مسح التوقيع')) + '</button></div>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary" onclick="pmSettleCancel()">' + esc(tr('movements.cancel', 'إلغاء')) + '</button>' +
        '<button class="btn btn-primary" onclick="pmSettleConfirm()"><i class="fas fa-circle-check"></i> ' + esc(tr('movements.settleSave', 'حفظ التسوية')) + '</button>' +
      '</div></div>';
    m.style.display = 'flex';
    _pmSigInit();
  }

  function pmSettleCancel() {
    var m = document.getElementById('pmSettleModal');
    if (m) m.style.display = 'none';
    _pmSettlePartyId = null;
    _pmSigReset();
  }

  function _pmAdjustBalance(kind, id, delta) {
    var D = DB;
    if (!D || !delta) return;
    try {
      if (kind === 'customer') {
        var list = D.getCustomers ? D.getCustomers() : [];
        var c = null;
        for (var i = 0; i < list.length; i++) { if (list[i].id === id) { c = list[i]; break; } }
        if (!c) return;
        c.balance = num(c.balance) + delta;
        if (typeof D.saveCustomers === 'function') D.saveCustomers(list);
        else if (typeof D.updateCustomer === 'function') D.updateCustomer(id, { balance: c.balance });
      } else {
        var list2 = D.getSuppliers ? D.getSuppliers() : [];
        var s = null;
        for (var j = 0; j < list2.length; j++) { if (list2[j].id === id) { s = list2[j]; break; } }
        if (!s) return;
        s.balance = num(s.balance) + delta;
        if (typeof D.saveSuppliers === 'function') D.saveSuppliers(list2);
        else if (typeof D.updateSupplier === 'function') D.updateSupplier(id, { balance: s.balance });
      }
    } catch (e) {}
  }

  function pmSettleConfirm() {
    var id = _pmSettlePartyId;
    if (!id) return;
    var amount = num(_pmVal('pmSettleAmount'));
    if (!(amount > 0)) { if (typeof root.alert === 'function') root.alert(tr('movements.invalidAmount', 'يرجى إدخال مبلغ صحيح')); return; }
    var method = _pmVal('pmSettleMethod') || 'cash';
    var note = _pmVal('pmSettleNote');
    var sig = pmSigData();
    var isCust = _pmState.kind !== 'supplier';
    var D = DB;
    try {
      if (D && typeof D.addInvoice === 'function') {
        D.addInvoice({
          type: 'payment',
          direction: isCust ? 'in' : 'out',
          customerId: isCust ? id : undefined,
          supplierId: isCust ? undefined : id,
          totalAmount: amount,
          paidAmount: amount,
          items: [],
          date: new Date().toISOString().slice(0, 10),
          method: method,
          note: note || tr('movements.settleDefaultNote', 'تسوية رصيد'),
          isProvisional: false,
          settlement: true,
          signature: sig || undefined,
        }, { payment: true });
      }
      // Customer settlement collects money (balance down); a supplier debt note
      // is money we owe (balance up) — exactly confirmPaymentInvoice's rule.
      _pmAdjustBalance(isCust ? 'customer' : 'supplier', id, isCust ? -amount : amount);
    } catch (e) {
      if (typeof root.alert === 'function') root.alert((e && e.message) || String(e));
      return;
    }
    pmSettleCancel();
    pmRefresh();
    if (typeof root.alert === 'function') root.alert(tr('movements.settleSaved', 'تم تسجيل التسوية بنجاح'));
  }

  function _pmPartyById(id) {
    var list = _pmParties();
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  var api = {
    TOL: TOL,
    build: build,
    buildCached: buildCached,
    buildAll: buildAll,
    buildReturns: buildReturns,
    aging: aging,
    sliceRange: sliceRange,
    reportHTML: reportHTML,
    returnsReportHTML: returnsReportHTML,
    printReport: printReport,
    printReturnsReport: printReturnsReport,
    printDoc: printDoc,
    setPrintMode: pmSetPrintMode,
    printMode: _pmPrintMode,
    partyHTML: partyBlock,
    renderPage: renderPage,
    refresh: pmRefresh,
    storeInfo: storeInfo,
    dateStr: dateStr,
    timeStr: timeStr,
    stamp: stamp,
    esc: esc,
    num: num,
  };

  root.PartyMovements = api;
  root.pmSetPrintMode = pmSetPrintMode;
  root.pmPrintColor = pmPrintColor;
  root.pmPrintBw = pmPrintBw;
  root.pmOnPartyChange = pmOnPartyChange;
  root.pmOnSearch = pmOnSearch;
  root.pmToggleParty = pmToggleParty;
  root.pmShowMore = pmShowMore;
  root.pmShowReport = pmShowReport;
  root.pmReportOne = pmReportOne;
  root.pmOnRange = pmOnRange;
  root.pmQuickRange = pmQuickRange;
  root.pmOnReturnsToggle = pmOnReturnsToggle;
  root.pmShowReturnsReport = pmShowReturnsReport;
  root.pmMonthlyStatement = pmMonthlyStatement;
  root.pmExportCsv = pmExportCsv;
  root.pmExportExcel = pmExportCsv;
  root.pmSendWhatsApp = pmSendWhatsApp;
  root.pmSendEmail = pmSendEmail;
  root.pmEmailCancel = pmEmailCancel;
  root.pmEmailSend = pmEmailSend;
  root.pmSettle = pmSettle;
  root.pmSettleCancel = pmSettleCancel;
  root.pmSettleConfirm = pmSettleConfirm;
  root.pmSigClear = pmSigClear;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
