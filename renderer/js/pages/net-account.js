function init_net_account() {
  // Always start on «اليوم» (day): the page markup is rebuilt from the cached
  // HTML on every navigation, so the .active highlight inside it would drift
  // away from the persisted _netPeriod otherwise (e.g. blue on «هذا الشهر»
  // while the numbers were still computed for «هذا الأسبوع»).
  setNetPeriod('day');
}

var _netPeriod = 'day';

function setNetPeriod(period) {
  _netPeriod = period;
  document.querySelectorAll('#page-net-account .period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  const rangeBox = document.getElementById('netDateRange');
  if (rangeBox) rangeBox.style.display = period === 'custom' ? 'block' : 'none';
  const dayBox = document.getElementById('netSingleDay');
  if (dayBox) dayBox.style.display = period === 'single-day' ? 'block' : 'none';
  calculateNet();
}

// Parse an ISO date (YYYY-MM-DD) in LOCAL time. `new Date(str)` treats a bare
// date as UTC, which shifts the selected day by one in UTC+ timezones such as
// Algeria — a "يوم محدد" would silently include the wrong transactions.
function _netParseLocalDate(value, fallback) {
  const raw = String(value || '');
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!m) return fallback;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return fallback;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function getNetDateRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  let fromTs;

  switch (_netPeriod) {
    case 'day':
      fromTs = new Date(y, m, d).getTime();
      return { from: fromTs, to: fromTs + 86399999 };
    case 'yesterday': {
      const yest = new Date(y, m, d - 1);
      yest.setHours(0, 0, 0, 0);
      return { from: yest.getTime(), to: yest.getTime() + 86399999 };
    }
    case 'custom': {
      const fromEl = document.getElementById('netDateFrom');
      const toEl = document.getElementById('netDateTo');
      let from = _netParseLocalDate(fromEl && fromEl.value, new Date(y, m, 1));
      let to = _netParseLocalDate(toEl && toEl.value, now);
      if (to.getTime() < from.getTime()) {
        // An inverted range is almost always a typo — show the intended span
        // instead of an empty report.
        const swap = from; from = to; to = swap;
      }
      if (to.getHours() === 0 && to.getMinutes() === 0 && to.getSeconds() === 0) {
        return { from: from.getTime(), to: to.getTime() + 86399999 };
      }
      return { from: from.getTime(), to: to.getTime() };
    }
    case 'single-day': {
      const dayEl = document.getElementById('netSingleDate');
      const day = _netParseLocalDate(dayEl && dayEl.value, new Date(y, m, d));
      return { from: day.getTime(), to: day.getTime() + 86399999 };
    }
    case 'week': {
      // Rolling last 7 days instead of «since Monday» (same behaviour as the
      // orders page): with a Monday-to-now window «اليوم» and «الأسبوع» used to
      // return the exact same figure whenever nothing was recorded between
      // Monday and yesterday.
      const start = new Date(now);
      start.setDate(d - 6);
      start.setHours(0, 0, 0, 0);
      fromTs = start.getTime();
      return { from: fromTs, to: now.getTime() };
    }
    case 'year':
      fromTs = new Date(y, 0, 1).getTime();
      break;
    default:
      fromTs = new Date(y, m, 1).getTime();
  }

  return { from: fromTs };
}

function netRangeLabel(range) {
  const fmt = ts => new Date(ts).toLocaleDateString('ar-EG-u-nu-latn');
  if (range.to) return fmt(range.from) + ' → ' + fmt(range.to);
  if (range.from) return fmt(range.from) + ' → ' + fmt(Date.now());
  return t('net.allTime') || 'الكل';
}

function _lineCostInfo(it, productMap) {
  if (!it) return { cost: 0, isEst: true };
  const prod = productMap && productMap[it.productId];
  const costSnap = (it.costPrice !== undefined && it.costPrice !== null) ? Number(it.costPrice) : NaN;
  if (typeof PurchaseCore !== 'undefined' && PurchaseCore && typeof PurchaseCore.itemCost === 'function') {
    return { cost: PurchaseCore.itemCost(it, prod), isEst: !isFinite(costSnap) };
  }
  const costCur = prod ? (prod.buyPrice || 0) : 0;
  const cost = isFinite(costSnap) ? costSnap : costCur;
  const isEst = !isFinite(costSnap);
  return { cost, isEst };
}

// تقسيم دفعة إلى قناتي الدفع كما هو مستعمل في السيولة (pages/zakat.js → zkParts):
// مبالغ مختلطة مسجّلة صراحة أولاً، ثم method=ccp، ثم mixed القديم دون تقسيم
// (نصف/نصف)، ثم نقداً افتراضياً. لا تستثني أي Tag هنا — يحدّد مستدعيها ما
// يُدخل في الخصم.
function _payParts(p) {
  const num = v => (isFinite(Number(v)) ? Number(v) : 0);
  const a = num(p.amount);
  if (p.cashAmount != null || p.ccpAmount != null) {
    return { cash: num(p.cashAmount), ccp: num(p.ccpAmount) };
  }
  if (p.method === 'ccp') return { cash: 0, ccp: a };
  if (p.method === 'mixed') return { cash: a / 2, ccp: a / 2 };
  return { cash: a, ccp: 0 };
}

// «مصروف يدوي» فقط كما اتُفق: قيد net_expense دون Tag. بهذا يُستبعد
// راتب الموظفين (tag:'salary') والزكاة (tag:'zakat') لأنهما خارج هذا
// الخصم، ويظل totalExpenses في computeNet بلا تغيير (هما مصروفات عامة).
function _isManualExpense(p) {
  return p.type === 'net_expense' && !p.tag;
}

function _manualExpenseSplit(payments, from, to) {
  const out = { cash: 0, ccp: 0 };
  (payments || []).forEach(p => {
    if (!p || p.isProvisional || !_isManualExpense(p)) return;
    const ts = p.createdAt || 0;
    if (from != null && ts < from) return;
    if (to != null && ts > to) return;
    const parts = _payParts(p);
    out.cash += parts.cash;
    out.ccp += parts.ccp;
  });
  return out;
}

function canSeeProfit() {
  try {
    if (typeof Auth === 'undefined' || !Auth) return false;
    if (typeof Auth.isManager === 'function' && Auth.isManager()) return true;
    if (typeof Auth.buyPriceVisible === 'function' && Auth.buyPriceVisible()) return true;
    return false;
  } catch (e) {
    return false;
  }
}

// دفعات الموردين (والمصروفات) داخل النطاق — تنقص من «النقد (فترة)».
function _supplierExpenseSplit(payments, invById, from, to) {
  const out = { cash: 0, ccp: 0 };
  (payments || []).forEach(p => {
    if (!p || p.isProvisional) return;
    // replicate isNetExpensePayment logic
    let isExp = false;
    if (p.supplierId || p.type === 'stock_purchase' || p.type === 'dispatch') {
      const inv = p.invoiceId ? invById[p.invoiceId] : null;
      if (inv && (inv.type === 'sup_sale' || inv.type === 'customer')) isExp = false;
      else isExp = true;
    } else {
      const inv = p.invoiceId ? invById[p.invoiceId] : null;
      isExp = !!inv && (inv.type === 'supplier' || inv.type === 'purchase');
    }
    if (!isExp) return;
    if (p.type === 'net_purchase' || p.type === 'net_expense') return;
    const ts = p.createdAt || 0;
    if (from != null && ts < from) return;
    if (to != null && ts > to) return;
    const parts = _payParts(p);
    out.cash += parts.cash;
    out.ccp += parts.ccp;
  });
  return out;
}
// One snapshot per calculation. The old path re-read every DB store (and
// getInvoiceCompletionTs/getInvoicePaymentMethods rescanned ALL payments for
// EVERY invoice) several times per click. These maps make it O(I + P) while
// keeping the exact same values — no accounting rule is changed here.
function _netSnapshot() {
  const invoices = DB.getInvoices();
  const suppliers = DB.getSuppliers();
  const customers = DB.getCustomers();
  const payments = DB.getPayments();
  const products = DB.getProducts();

  const invById = new Map();
  invoices.forEach(i => { if (i && i.id) invById.set(i.id, i); });
  const supplierById = new Map();
  suppliers.forEach(s => { if (s && s.id) supplierById.set(s.id, s); });
  const customerById = new Map();
  customers.forEach(c => { if (c && c.id) customerById.set(c.id, c); });
  const productMap = Object.create(null);
  products.forEach(p => { if (p && p.id) productMap[p.id] = p; });

  const paysByInv = new Map();
  payments.forEach(p => {
    if (!p || !p.invoiceId) return;
    let rows = paysByInv.get(p.invoiceId);
    if (!rows) { rows = []; paysByInv.set(p.invoiceId, rows); }
    rows.push(p);
  });
  const invoicePayments = id => paysByInv.get(id) || [];

  const paidCache = new Map();
  function effectivePaid(inv) {
    if (!inv) return 0;
    const key = (inv.id || '') + '|' + (inv.creditUsed || 0);
    if (paidCache.has(key)) return paidCache.get(key);
    const value = invoicePayments(inv.id)
      .reduce((sum, p) => sum + (p.amount || 0), 0) + (inv.creditUsed || 0);
    paidCache.set(key, value);
    return value;
  }

  const completionCache = new Map();
  function completionTs(inv) {
    if (!inv || inv.type !== 'customer' || inv.isProvisional) return 0;
    const key = inv.id || inv;
    if (completionCache.has(key)) return completionCache.get(key);
    const invoiceTs = inv.createdAt || inv.date || 0;
    const total = Number(inv.totalAmount) || 0;
    let running = Number(inv.creditUsed) || 0;
    let ts = 0;
    if (running >= total - 0.005) {
      ts = invoiceTs;
    } else {
      const rows = invoicePayments(inv.id).slice()
        .sort((a, b) => (a.createdAt || a.date || 0) - (b.createdAt || b.date || 0));
      for (const p of rows) {
        running += Number(p.amount) || 0;
        if (running >= total - 0.005) { ts = p.createdAt || p.date || invoiceTs; break; }
      }
    }
    completionCache.set(key, ts);
    return ts;
  }

  const methodCache = new Map();
  function paymentMethods(id) {
    if (methodCache.has(id)) return methodCache.get(id);
    let cash = 0, ccp = 0;
    invoicePayments(id).forEach(p => {
      const amt = p.amount || 0;
      if (p.method === 'ccp') ccp += amt;
      else if (p.method === 'mixed') {
        cash += (p.cashAmount || 0);
        ccp += (p.ccpAmount || 0);
      } else cash += amt;
    });
    const result = { cash, ccp };
    methodCache.set(id, result);
    return result;
  }

  return {
    invoices, suppliers, customers, payments, products,
    invById, supplierById, customerById, productMap,
    invoicePayments, effectivePaid, completionTs, paymentMethods,
  };
}

// Manual + supplier expense splits in ONE pass instead of four. The filters
// and timestamps are copied line-for-line from _manualExpenseSplit and
// _supplierExpenseSplit so the cash split and margin deductions stay identical.
function _netExpenseSplits(payments, invById, from, to) {
  const blank = () => ({
    manual: { cash: 0, ccp: 0 },
    supplier: { cash: 0, ccp: 0 },
    combined: { cash: 0, ccp: 0 },
  });
  const out = { total: blank(), period: blank() };
  const inPeriod = ts => (from == null || ts >= from) && (to == null || ts <= to);
  const add = (bucket, parts) => { bucket.cash += parts.cash; bucket.ccp += parts.ccp; };

  (payments || []).forEach(p => {
    if (!p || p.isProvisional) return;
    const ts = p.createdAt || 0;
    const period = inPeriod(ts);

    if (_isManualExpense(p)) {
      const parts = _payParts(p);
      add(out.total.manual, parts);
      if (period) add(out.period.manual, parts);
    }

    // Same supplier/purchase test as _supplierExpenseSplit.
    let isExp = false;
    if (p.supplierId || p.type === 'stock_purchase' || p.type === 'dispatch') {
      const inv = p.invoiceId ? invById.get(p.invoiceId) : null;
      if (inv && (inv.type === 'sup_sale' || inv.type === 'customer')) isExp = false;
      else isExp = true;
    } else {
      const inv = p.invoiceId ? invById.get(p.invoiceId) : null;
      isExp = !!inv && (inv.type === 'supplier' || inv.type === 'purchase');
    }
    if (!isExp || p.type === 'net_purchase' || p.type === 'net_expense') return;
    const parts = _payParts(p);
    add(out.total.supplier, parts);
    if (period) add(out.period.supplier, parts);
  });

  ['total', 'period'].forEach(k => {
    out[k].combined.cash = out[k].manual.cash + out[k].supplier.cash;
    out[k].combined.ccp = out[k].manual.ccp + out[k].supplier.ccp;
  });
  return out;
}

function calcMargin(salesInvoices, productMap) {
  let margin = 0;
  salesInvoices.forEach(inv => {
    if (inv.isProvisional) return;
    (inv.items || []).forEach(it => {
      const info = _lineCostInfo(it, productMap);
      margin += (it.price - info.cost) * it.qty;
    });
  });
  return margin;
}

function calcMarginSplit(salesInvoices, productMap, manualExpenses, snap) {
  let marginCash = 0, marginCcp = 0, collectedCash = 0, collectedCcp = 0;
  salesInvoices.forEach(inv => {
    if (inv.isProvisional) return;
    const paid = snap ? snap.effectivePaid(inv) : DB.getInvoiceEffectivePaid(inv);
    if (paid < (inv.totalAmount || 0)) return;
    let margin = 0;
    (inv.items || []).forEach(it => {
      const prod = productMap[it.productId];
      const info = _lineCostInfo(it, productMap); const buyPrice = info.cost;
      margin += (it.price - buyPrice) * it.qty;
    });
    const m = snap ? snap.paymentMethods(inv.id) : DB.getInvoicePaymentMethods(inv.id);
    collectedCash += m.cash;
    collectedCcp += m.ccp;
    const totalPaid = m.cash + m.ccp;
    if (totalPaid > 0 && m.ccp > 0) {
      const ccpRatio = m.ccp / totalPaid;
      marginCcp += margin * ccpRatio;
      marginCash += margin * (1 - ccpRatio);
    } else {
      marginCash += margin;
    }
  });
  // خصم المصروفات اليدوية من سطر النقد/CCP فقط (وليس من سطر الهامش).
  // المبلغ في كل قناة لا ينزل إلى ما تحت الصفر؛ فالمقبوض قناة جمع مبيعات
  // لا رصيد سيولة.
  const me = manualExpenses || { cash: 0, ccp: 0 };
  collectedCash = Math.max(0, collectedCash - (Number(me.cash) || 0));
  collectedCcp = Math.max(0, collectedCcp - (Number(me.ccp) || 0));
  return { margin: { cash: marginCash, ccp: marginCcp }, collected: { cash: collectedCash, ccp: collectedCcp } };
}

function formatMarginSplitCard(margin, split) {
  return `DA${fmtMoney(margin)}
    <div style="font-size:10px;font-weight:400;margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;color:rgba(255,255,255,0.85)">
      <span>💵 ${t('net.cashLabel')}: DA${fmtMoney(split.collected.cash)}</span>
      <span>📮 CCP: DA${fmtMoney(split.collected.ccp)}</span>
    </div>
    <div style="font-size:10px;font-weight:400;margin-top:2px;color:rgba(255,255,255,0.6)">
      ${t('net.marginLabel')} — 💵 DA${fmtMoney(split.margin.cash)} · 📮 DA${fmtMoney(split.margin.ccp)}
    </div>`;
}

function computeNet(range, suppliedSnap, suppliedCash, suppliedSplits) {
  // Optional arguments let calculateNet() share one snapshot/range/cash result
  // with the log and the cards. Older callers (reports, zakat) still work with
  // just a range and get the identical numbers through the same formulas.
  const snap = suppliedSnap || _netSnapshot();
  const invoices = snap.invoices;
  const suppliers = snap.suppliers;
  const customers = snap.customers;
  const payments = snap.payments;
  const invById = snap.invById;
  const productMap = snap.productMap;

  // الدفعة مصروف إذا: لها مورد، أو مشتريات مخزون، أو إرسال (فاتورة إرسال)، أو
  // مرتبطة بفاتورة شراء (بمورد أو بدونه). أما الدفعات المرتبطة بفاتورة
  // «بيع لمورد» (sup_sale) أو فاتورة عميل فهي مبيعات — فالمورد هنا مشترٍ
  // وليس بائعاً، والفرق جوهري بين «فاتورة شراء من مورد» و«فاتورة بيع لمورد».
  function isNetExpensePayment(p) {
    if (p.supplierId || p.type === 'stock_purchase' || p.type === 'dispatch') {
      const inv = p.invoiceId ? invById.get(p.invoiceId) : null;
      if (inv && (inv.type === 'sup_sale' || inv.type === 'customer')) return false;
      return true;
    }
    const inv = p.invoiceId ? invById.get(p.invoiceId) : null;
    return !!inv && (inv.type === 'supplier' || inv.type === 'purchase');
  }

  const inRange = ts => {
    const t = ts || 0;
    if (range && range.from && t < range.from) return false;
    if (range && range.to && t > range.to) return false;
    return true;
  };

  let totalPurchases = 0;      // قيمة فواتير المشتريات (للموردين) داخل النطاق
  let totalSales = 0;          // المبيعات = المدفوع فعلاً من العملاء فقط داخل النطاق
  let totalExpenses = 0;       // المصروفات = المدفوع فعلاً للموردين فقط داخل النطاق
  let supplierDebt = 0;        // دين علينا (للموردين) - الرصيد الحالي
  let customerDebt = 0;        // دين لنا (على العملاء) - الرصيد الحالي

  // ديون الفترة لكل طرف = فواتير الطرف داخل النطاق − دفعات الطرف داخل النطاق (بشرط ≥ 0)
  const supRange = {};
  const custRange = {};

  invoices.forEach(inv => {
    if (inv.isProvisional) return;
    const ts = inv.createdAt || inv.date || 0;
    if (inv.type === 'supplier' || inv.type === 'purchase' || inv.type === 'transfer' || inv.type === 'transfer_receive') {
      if (inRange(ts)) totalPurchases += inv.totalAmount;
    }
    if (inv.type === 'supplier' && inv.supplierId && inRange(ts)) {
      supRange[inv.supplierId] = (supRange[inv.supplierId] || 0) + inv.totalAmount;
    }
    if (inv.type === 'customer' && inv.customerId && inRange(ts)) {
      custRange[inv.customerId] = (custRange[inv.customerId] || 0) + inv.totalAmount;
    }
  });

  // ديون الموردين الحالية: الرصيد الموجب = دين علينا، الرصيد السالب = دين لنا
  suppliers.forEach(s => {
    const b = parseFloat(s.balance) || 0;
    if (b > 0) supplierDebt += b;
    else customerDebt += Math.abs(b);
  });

  // ديون العملاء الحالية (كل فاتورة عميل غير مسددة) = دين لنا
  customers.forEach(c => {
    customerDebt += Math.max(0, parseFloat(c.balance) || 0);
  });

  payments.forEach(p => {
    if (p.isProvisional) return;
    const ts = p.createdAt || 0;
    if (!inRange(ts)) return;
    // Payment vouchers settle balances (سند قبض) and are tracked as their own
    // invoice type — never let a linked Payment row leak into sales/expenses.
    const invRef = p.invoiceId ? invById.get(p.invoiceId) : null;
    if (invRef && invRef.type === 'payment') return;
    // المقاصّة عند بيع لمورد (بضاعة سوّت ديننا القديم) = تسوية رصيد محايدة:
    // لا تُحتسب في المبيعات ولا في المصروفات، لكنها تُخفض دين الفترة للمورد.
    if (p.isSupSaleExpense) {
      if (p.supplierId) supRange[p.supplierId] = (supRange[p.supplierId] || 0) - p.amount;
      return;
    }
    // قيود الإدخال المباشر من صفحة صافي الحساب: تذهب للمشتريات أو المصروفات مباشرة
    if (p.type === 'net_purchase' || p.type === 'net_expense') {
      if (p.type === 'net_purchase') totalPurchases += p.amount;
      else totalExpenses += p.amount;
      return;
    }
    const isExp = isNetExpensePayment(p);
    if (isExp) {
      totalExpenses += p.amount;
      if (p.supplierId) supRange[p.supplierId] = (supRange[p.supplierId] || 0) - p.amount;
    }
    // Cash coming IN (sale payments, walk-in and direct customer payments) is
    // added below from DB.getCashInEvents(), which also includes «سند قبض»
    // vouchers and prevents a linked Payment row from being counted twice.
  });

  // إيرادات الفترة = كل تحصيل بماله، بتاريخ العملية لا تاريخ الفاتورة.
  // قبض المورد إيراد أيضاً، ويُخفض في الوقت نفسه ما بقي لنا عليه من دين الفترة.
  const cashEvents = suppliedCash || DB.getCashInEvents({ from: range && range.from, to: range && range.to });
  cashEvents.forEach(c => {
    totalSales += c.amount;
    if (c.customerId) custRange[c.customerId] = (custRange[c.customerId] || 0) - c.amount;
    if (c.supplierId) supRange[c.supplierId] = (supRange[c.supplierId] || 0) - c.amount;
  });

  let supplierDebtPeriod = 0;
  let customerDebtPeriod = 0;
  Object.values(supRange).forEach(v => { if (v > 0) supplierDebtPeriod += v; });
  Object.values(custRange).forEach(v => { if (v > 0) customerDebtPeriod += v; });

  // صافي الربح = إجمالي المبيعات (المقبوضات) - إجمالي المصروفات (المدفوعات)
  const profit = totalSales - totalExpenses;
  const pendingTotal = supplierDebt + customerDebt;
  const pendingPeriod = supplierDebtPeriod + customerDebtPeriod;

  // هامش الربح = (سعر البيع - سعر الشراء) لكل قطعة مباعة
  const salesInvoices = invoices.filter(inv => inv.type === 'customer');

  const totalMargin = calcMargin(salesInvoices, productMap);

  // الربح يُحتسب في الفترة التي تمّ فيها السداد الكامل للفاتورة، لا تاريخ بيعها.
  // الدفعات الجزئية لا تُظهر ربحاً بعد؛ اكتمال السداد هو ما ينقل الربح.
  const periodInvoices = salesInvoices.filter(inv => inRange(snap.completionTs(inv)));
  const periodMargin = calcMargin(periodInvoices, productMap);

  const splits = suppliedSplits || _netExpenseSplits(payments, invById, range && range.from, range && range.to);
  const totalSplit = calcMarginSplit(salesInvoices, productMap, splits.total.combined, snap);
  const periodSplit = calcMarginSplit(periodInvoices, productMap, splits.period.combined, snap);

  return {
    totalSales, totalPurchases, totalExpenses, profit,
    supplierDebt, customerDebt, pendingTotal,
    supplierDebtPeriod, customerDebtPeriod, pendingPeriod,
    totalMargin, periodMargin, totalSplit, periodSplit,
  };
}

function calculateNet() {
  // One range, one DB snapshot, one cash-in result and one expense pass for
  // the whole page. Previously each of these was recomputed several times.
  const snap = _netSnapshot();
  const range = getNetDateRange();
  const cashEvents = DB.getCashInEvents({ from: range && range.from, to: range && range.to });
  const splits = _netExpenseSplits(snap.payments, snap.invById, range && range.from, range && range.to);
  const res = computeNet(range, snap, cashEvents, splits);

  document.getElementById('netTotalSales').textContent = `DA${fmtMoney(res.totalSales)}`;
  document.getElementById('netTotalPurchases').textContent = `DA${fmtMoney(res.totalPurchases)}`;
  document.getElementById('netTotalExpenses').textContent = `DA${fmtMoney(res.totalExpenses)}`;
  document.getElementById('netProfit').textContent = `DA${fmtMoney(res.profit)}`;

  // عرض الديون الحالية: دين علينا + دين لنا
  let pendingHtml = `DA${fmtMoney(res.pendingTotal)}`;
  if (res.customerDebt > 0 || res.supplierDebt > 0) {
    pendingHtml += `<div style="font-size:10px;font-weight:400;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
      ${res.customerDebt > 0 ? `<span style="color:#28a745">${t('net.customerDebt')}: DA${fmtMoney(res.customerDebt)}</span>` : ''}
      ${res.supplierDebt > 0 ? `<span style="color:#e65100">${t('net.supplierDebt')}: DA${fmtMoney(res.supplierDebt)}</span>` : ''}
    </div>`;
  }
  document.getElementById('netPending').innerHTML = pendingHtml;

  document.getElementById('netTotalMargin').innerHTML = formatMarginSplitCard(res.totalMargin, res.totalSplit);
  document.getElementById('netPeriodMargin').innerHTML = formatMarginSplitCard(res.periodMargin, res.periodSplit);
  // «إيرادات الفترة (نقداً)» = actual money collected in the selected period,
  // including sale payments, walk-in, «سند قبض» vouchers, supplier receipts and
  // direct customer payments. Manual expenses are still netted out as before.
  let _cashInCash = 0, _cashInCcp = 0;
  cashEvents.forEach(c => {
    if (c.method === 'ccp') _cashInCcp += c.amount;
    else if (c.method === 'mixed') { _cashInCash += c.amount / 2; _cashInCcp += c.amount / 2; }
    else _cashInCash += c.amount;
  });
  const _cashMe = splits.period.manual;
  _cashInCash = Math.max(0, _cashInCash - _cashMe.cash);
  _cashInCcp = Math.max(0, _cashInCcp - _cashMe.ccp);
  const _periodCash = _cashInCash + _cashInCcp;
  const _netPeriodCashEl = document.getElementById('netPeriodCash');
  if (_netPeriodCashEl) _netPeriodCashEl.textContent = `DA${fmtMoney(_periodCash)}`;
  const _netPeriodCashSub = document.getElementById('netPeriodCashSub');
  if (_netPeriodCashSub) {
    const _m = res.periodMargin || 0;
    const _ratio = _periodCash > 0 ? Math.round((_m / _periodCash) * 100) : 0;
    _netPeriodCashSub.textContent = `${t('net.marginLabel')}: DA${fmtMoney(_m)}  ·  ${_ratio}%`;
  }
  const netRangeLabelEl = document.getElementById('netPeriodLabel');
  if (netRangeLabelEl) netRangeLabelEl.textContent = netRangeLabel(range);

  renderNetTransactions(snap);
}

function renderNetTransactions(snap) {
  snap = snap || _netSnapshot();
  const invoices = snap.invoices;
  const suppliers = snap.suppliers;
  const customers = snap.customers;
  const payments = snap.payments;
  const invById = snap.invById;
  const productMap = snap.productMap;
  const supplierById = snap.supplierById;
  const customerById = snap.customerById;

  // «بقلم: ...» — السطر الذي ينفّذ العملية. الفواتير والدفعات القديمة لا تحمل
  // وسم المنفّذ، فتبقى بلا سطر بدل اختراع اسم أو نسبة العملية لمسؤول مجهول.
  // المدير يُعرض بلقبه لأنه قد لا يحمل اسماً (جلسة محلية بدون اسم مستخدم).
  function txOperatorHtml() {
    for (const rec of arguments) {
      if (!rec || !rec.operatorName) continue;
      const managerLabel = t('net.byManager');
      const name = rec.operatorName;
      const label = rec.operatorRole && rec.operatorRole !== 'user'
        ? (name === managerLabel ? managerLabel : `${managerLabel} (${name})`)
        : name;
      return `<div style="font-size:10px;color:#8a94a6;margin-top:2px">${escHtml(t('net.by') + ': ' + label)}</div>`;
    }
    return '';
  }

  // الدفعة مصروف إذا: لها مورد، أو مشتريات مخزون، أو إرسال (فاتورة إرسال)، أو
  // مرتبطة بفاتورة شراء (بمورد أو بدونه). أما الدفعات المرتبطة بفاتورة
  // «بيع لمورد» (sup_sale) أو فاتورة عميل فهي مبيعات — فالمورد هنا مشترٍ
  // وليس بائعاً، والفرق جوهري بين «فاتورة شراء من مورد» و«فاتورة بيع لمورد».
  function isNetExpensePayment(p) {
    if (p.supplierId || p.type === 'stock_purchase' || p.type === 'dispatch') {
      const inv = p.invoiceId ? invById.get(p.invoiceId) : null;
      if (inv && (inv.type === 'sup_sale' || inv.type === 'customer')) return false;
      return true;
    }
    const inv = p.invoiceId ? invById.get(p.invoiceId) : null;
    return !!inv && (inv.type === 'supplier' || inv.type === 'purchase');
  }

  // تفاصيل سجل مبنية من السجل نفسه (لا تحتاج كائن invoice): فاتورة مشتريات
  // تُعرض بمنتجاتها وسعر الشراء، ودفعة بمعلومات دفعها. فواتير البيع تظل على
  // جدول الأرباح الحالي عبر tx.invoice، ولا تُبنى لها detail هنا.
  function escTx(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function paymentDetailHtml(p) {
    const parts = _payParts(p);
    const hasSplit = p.cashAmount != null || p.ccpAmount != null;
    let methodHtml = '';
    if (p.method === 'mixed' || hasSplit) {
      const bits = [];
      if (parts.cash > 0) bits.push(`${t('sales.payCash')}: DA${fmtMoney(parts.cash)}`);
      if (parts.ccp > 0) bits.push(`CCP: DA${fmtMoney(parts.ccp)}`);
      methodHtml = bits.length ? bits.join(' + ') : t('sales.payCash');
    } else if (p.method === 'ccp') {
      methodHtml = `CCP: DA${fmtMoney(parts.ccp)}`;
    } else {
      methodHtml = `${t('sales.payCash')}: DA${fmtMoney(parts.cash)}`;
    }
    const note = p.note ? escTx(p.note) : '';
    const lines = [
      `<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0">
         <span style="color:#8a94a6">${t('net.detailAmount')}</span><b>DA${fmtMoney(Math.abs(p.amount || 0))}</b></div>`,
      `<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0">
         <span style="color:#8a94a6">${t('net.detailMethod')}</span><b>${methodHtml}</b></div>`,
    ];
    if (note) {
      lines.push(`<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0">
         <span style="color:#8a94a6">${t('net.detailNote')}</span><b style="white-space:pre-wrap;text-align:left">${note}</b></div>`);
    }
    return lines.join('');
  }

  // Transaction log
  const container = document.getElementById('netTransactions');
  const txLog = [];

  // فواتير المشتريات (تسجيل مرجعي فقط — مع منتجاتها للتفاصيل)
  invoices.forEach(inv => {
    if (inv.isProvisional) return;
    if (inv.type !== 'supplier' && inv.type !== 'purchase' && inv.type !== 'transfer' && inv.type !== 'transfer_receive') return;
    const date = new Date(inv.createdAt);
    const sup = inv.supplierId ? (supplierById.get(inv.supplierId) || null) : null;
    const desc = inv.items.map(it => it.name).join(', ').substring(0, 60);
    let label = t('net.purchaseInvoice') + ': ';
    if (inv.type === 'supplier' && sup) label = `${t('net.purchaseFrom')} ${sup.name}: `;
    else if (inv.type === 'transfer') label = t('net.transferInvoice') + ': ';
    else if (inv.type === 'transfer_receive') label = t('net.receptionInvoice') + ': ';
    txLog.push({
      date,
      desc: label + desc + (inv.items.length > 1 ? '...' : ''),
      type: t('net.purchases'),
      amount: -inv.totalAmount,
      badge: 'danger',
      ts: inv.createdAt,
      by: txOperatorHtml(inv),
      purchase: inv,
    });
  });

  // سندات القبض الواردة: تحصيل نقدي بتاريخ السند نفسه — من عميل أو من مورد.
  // أي دفعة مرتبطة بسند قبض تُستبعد من سطور الدفعات أدناه، فلا يُسجَّل المبلغ مرتين.
  invoices.forEach(inv => {
    if (inv.isProvisional || inv.type !== 'payment' || inv.direction !== 'in' || inv.isDebtNote) return;
    const c = inv.customerId ? (customerById.get(inv.customerId) || null) : null;
    const s = inv.supplierId ? (supplierById.get(inv.supplierId) || null) : null;
    const isSupplierReceipt = !!inv.supplierId && !inv.isDebtNote;
    const desc = s ? `${t('net.paymentFromSupplier')}${s.name}`
      : (c ? `${t('net.paymentFrom')}${c.name}` : t('net.paymentWalkin'));
    const note = inv.note ? ` (${inv.note})` : '';
    txLog.push({
      date: new Date(inv.createdAt || inv.date || 0),
      desc: desc + note,
      type: isSupplierReceipt ? t('net.supplierReceipt') : t('net.salesPaid'),
      amount: Number(inv.totalAmount) || 0,
      badge: 'success',
      ts: inv.createdAt || inv.date || 0,
      by: txOperatorHtml(inv),
      voucher: inv,
    });
  });

  // الدفعات: المصروفات (موردون/مشتريات/إرسال) مقابل المبيعات (عملاء + walk-in)
  payments.forEach(p => {
    if (p.isProvisional) return;
    // سند القبض يُسجَّل من فاتورته أعلاه؛ الدفعة المرتبطة به لا تُعرض مرتين.
    const voucherRef = p.invoiceId ? invById.get(p.invoiceId) : null;
    if (voucherRef && voucherRef.type === 'payment') return;
    // المقاصّة عند بيع لمورد = تسوية رصيد محايدة لا تظهر في سجل المعاملات.
    if (p.isSupSaleExpense) return;
    // قيود الإدخال المباشر من صفحة صافي الحساب / المصروفات
    if (p.type === 'net_purchase' || p.type === 'net_expense') {
      const isExpDirect = p.type === 'net_expense';
      const base = isExpDirect ? t('net.directExpense') : t('net.directPurchase');
      txLog.push({
        date: new Date(p.createdAt),
        desc: p.note ? `${base} — ${p.note}` : base,
        type: isExpDirect ? t('net.expenses') : t('net.purchases'),
        amount: -(p.amount || 0),
        badge: isExpDirect ? 'danger' : 'warning',
        ts: p.createdAt,
        by: txOperatorHtml(p),
        payment: p,
      });
      return;
    }
    if (isNetExpensePayment(p)) {
      if (p.supplierId) {
        const s = supplierById.get(p.supplierId) || null;
        const desc = s ? `${t('net.paymentTo')}${s.name}` : t('net.paymentToSupplier');
        txLog.push({
          date: new Date(p.createdAt),
          desc: p.note ? `${desc} (${p.note})` : desc,
          type: t('net.expenses'),
          amount: -p.amount,
          badge: 'danger',
          ts: p.createdAt,
          by: txOperatorHtml(p),
          payment: p,
        });
      } else {
        txLog.push({
          date: new Date(p.createdAt),
          desc: p.note || t('net.stockPurchase'),
          type: t('net.stockPurchases'),
          amount: -p.amount,
          badge: 'warning',
          ts: p.createdAt,
          by: txOperatorHtml(p),
          payment: p,
        });
      }
    } else {
      const c = p.customerId ? (customerById.get(p.customerId) || null) : null;
      const desc = c ? `${t('net.paymentFrom')}${c.name}` : (p.note?.includes('دفع') ? `${t('net.paymentNote')} - ${p.note}` : t('net.paymentWalkin'));
      const methodNote = p.method === 'ccp' || p.method === 'mixed' ? ` (${t('net.ccpPaidNote')})` : '';
      const invRef = p.invoiceId ? invById.get(p.invoiceId) : null;
      const invLink = (invRef && invRef.type === 'customer') ? invRef : null;
      // فاتورة الهاتف تحمل اسم بائعها بنفسها: عند وجوده هو صاحب العملية،
      // وإلا فالدافع هو من سجل السطر (وقد يختلف عن من أنشأ الفاتورة بالدين).
      const byRec = (invRef && invRef.seller) ? invRef : p;
      txLog.push({
        date: new Date(p.createdAt),
        desc: (p.note ? `${desc} (${p.note})` : desc) + methodNote,
        type: t('net.salesPaid'),
        amount: p.amount, // موجب = دخل
        badge: 'success',
        ts: p.createdAt,
        by: txOperatorHtml(byRec, p, invRef),
        invoice: invLink,
        invId: invLink ? invLink.id : null,
      });
    }
  });

  txLog.sort((a, b) => b.ts - a.ts);

  if (txLog.length === 0) {
    container.innerHTML = `<div class="placeholder-box"><i class="fas fa-exchange-alt" style="font-size:36px;color:#555"></i><p>${t('net.empty')}</p></div>`;
    return;
  }

  let html = `<div class="table-container"><table class="data-table">
    <thead><tr>
      <th>${t('net.col1')}</th><th>${t('net.col2')}</th><th>${t('net.col3')}</th><th>${t('net.col4')}</th><th style="width:28px"></th>
    </tr></thead><tbody>`;

  const seeProfit = canSeeProfit();
  let rowIdx = 0;

  function detailBlockHtml(tx, inner) {
    return `<tr id="net-line-detail-${rowIdx}" class="net-line-detail" style="display:none">
        <td colspan="${seeProfit ? 7 : 5}" style="padding:8px 12px;background:rgba(0,0,0,0.25)">
          ${inner}
        </td>
      </tr>`;
  }

  txLog.slice(0, 30).forEach(tx => {
    const dateStr = tx.date.toLocaleDateString('ar-EG-u-nu-latn');
    const amtColor = tx.amount < 0 ? '#dc3545' : '#28a745';
    // فاتورة بيع مرتبطة بأرباحها، أو فاتورة مشتريات، أو دفعة ببيان دفع.
    const hasDetail = !!(
      (tx.invoice && (tx.invoice.items || []).length) ||
      (tx.purchase && (tx.purchase.items || []).length) ||
      tx.payment
    );
    const toggleCell = hasDetail
      ? `<i id="net-inv-toggle-${rowIdx}" class="fas fa-chevron-down" style="cursor:pointer;color:#8ab4f8;font-size:11px" data-row="${rowIdx}"></i>`
      : '';
    html += `<tr>
      <td>${dateStr}</td>
      <td>${tx.desc}${tx.by || ''}</td>
      <td><span class="badge badge-${tx.badge}">${tx.type}</span></td>
      <td style="color:${amtColor}">${tx.amount < 0 ? '-' : '+'}DA${fmtMoney(Math.abs(tx.amount))}</td>
      <td style="text-align:center">${toggleCell}</td>
    </tr>`;

    if (tx.payment && !tx.invoice && !tx.purchase) {
      html += detailBlockHtml(tx,
        `<div style="font-size:11px"><div style="font-weight:700;margin-bottom:6px;color:#8a94a6;text-transform:uppercase">${t('net.detailTitle')}</div>${paymentDetailHtml(tx.payment)}</div>`);
      rowIdx++;
      return;
    }

    if (tx.purchase) {
      const items = tx.purchase.items;
      let detRows = '';
      let sumTotal = 0;
      items.forEach(it => {
        const lineTotal = (Number(it.price) || 0) * (Number(it.qty) || 0);
        sumTotal += lineTotal;
        detRows += `<tr>
          <td>${escTx(it.name || '')}</td>
          <td style="text-align:center">${Unit.qtyUnit(it.qty, it)}</td>
          <td style="text-align:center">DA${fmtMoney(Number(it.price) || 0)}</td>
          <td style="text-align:center">${lineTotal > 0 ? 'DA' + fmtMoney(lineTotal) : '—'}</td>
        </tr>`;
      });
      detRows += `<tr style="font-weight:700;background:rgba(255,255,255,0.04)">
        <td>${t('net.invoiceDetails')}</td>
        <td style="text-align:center"></td>
        <td style="text-align:center"></td>
        <td style="text-align:center">DA${fmtMoney(sumTotal)}</td>
      </tr>`;
      html += detailBlockHtml(tx,
        `<table class="data-table" style="width:100%;font-size:11px">
          <thead><tr>
            <th>${t('net.productCol')}</th>
            <th style="text-align:center">${t('net.qtyCol')}</th>
            <th style="text-align:center">${t('net.buyPriceCol')}</th>
            <th style="text-align:center">${t('net.lineTotalCol')}</th>
          </tr></thead>
          <tbody>${detRows}</tbody>
        </table>`);
      rowIdx++;
      return;
    }

    if (hasDetail) {
      const items = tx.invoice.items;
      let detRows = '';
      let sumProfit = 0;
      let sumTotal = 0;
      let anyEst = false;
      items.forEach(it => {
        const info = _lineCostInfo(it, productMap);
        if (info.isEst) anyEst = true;
        const lineTotal = (Number(it.price) || 0) * (Number(it.qty) || 0);
        const lineProfit = ((Number(it.price) || 0) - info.cost) * (Number(it.qty) || 0);
        sumProfit += lineProfit;
        sumTotal += lineTotal;
        const marginPct = lineTotal > 0 ? (lineProfit / lineTotal * 100) : null;
        const profitColor = lineProfit >= 0 ? '#28a745' : '#dc3545';
        const estMark = info.isEst ? '<span title="' + t('net.costEstimated') + '" style="color:#e65100">*</span>' : '';
        // An unlisted (F10) line really has no cost, so its whole amount is
        // margin. Say so, otherwise a 100.0% margin reads like a data error.
        const freeMark = it.freeLine ? ' <span class="sc-free-badge">' + t('sales.freeNoCost') + '</span>' : '';
        detRows += `<tr>
          <td>${it.name || ''}${estMark}${freeMark}</td>
          <td style="text-align:center">${Unit.qtyUnit(it.qty, it)}</td>
          ${seeProfit ? `<td style="text-align:center">DA${fmtMoney(info.cost)}</td>` : ''}
          <td style="text-align:center">DA${fmtMoney(Number(it.price) || 0)}</td>
          <td style="text-align:center">${lineTotal > 0 ? 'DA' + fmtMoney(lineTotal) : '—'}</td>
          ${seeProfit ? `<td style="text-align:center;color:${profitColor}">${lineTotal > 0 ? (lineProfit >= 0 ? '+' : '-') + 'DA' + fmtMoney(Math.abs(lineProfit)) : '—'}</td>` : ''}
          ${seeProfit ? `<td style="text-align:center;color:${profitColor}">${marginPct !== null ? marginPct.toFixed(1) + '%' : '—'}</td>` : ''}
        </tr>`;
      });
      const sumMarginPct = sumTotal > 0 ? (sumProfit / sumTotal * 100) : null;
      const sumColor = sumProfit >= 0 ? '#28a745' : '#dc3545';
      detRows += `<tr style="font-weight:700;background:rgba(255,255,255,0.04)">
        <td>${t('net.invoiceDetails')}${anyEst ? ' <span style="color:#e65100;font-weight:400">*</span>' : ''}</td>
        <td style="text-align:center"></td>
        ${seeProfit ? `<td style="text-align:center"></td>` : ''}
        <td style="text-align:center"></td>
        <td style="text-align:center">DA${fmtMoney(sumTotal)}</td>
        ${seeProfit ? `<td style="text-align:center;color:${sumColor}">${sumProfit >= 0 ? '+' : '-'}DA${fmtMoney(Math.abs(sumProfit))}</td>` : ''}
        ${seeProfit ? `<td style="text-align:center;color:${sumColor}">${sumMarginPct !== null ? sumMarginPct.toFixed(1) + '%' : '—'}</td>` : ''}
      </tr>`;

      html += `<tr id="net-line-detail-${rowIdx}" class="net-line-detail" style="display:none">
        <td colspan="${seeProfit ? 7 : 5}" style="padding:8px 12px;background:rgba(0,0,0,0.25)">
          <table class="data-table" style="width:100%;font-size:11px">
            <thead><tr>
              <th>${t('net.productCol')}</th>
              <th style="text-align:center">${t('net.qtyCol')}</th>
              ${seeProfit ? `<th style="text-align:center">${t('net.buyPriceCol')}</th>` : ''}
              <th style="text-align:center">${t('net.sellPriceCol')}</th>
              <th style="text-align:center">${t('net.lineTotalCol')}</th>
              ${seeProfit ? `<th style="text-align:center">${t('net.profitCol')}</th>` : ''}
              ${seeProfit ? `<th style="text-align:center">${t('net.marginPctCol')}</th>` : ''}
            </tr></thead>
            <tbody>${detRows}</tbody>
          </table>
        </td>
      </tr>`;
      rowIdx++;
    }
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;

  if (!container._netDetailBound) {
    container._netDetailBound = true;
    container.addEventListener('click', function (e) {
      const tg = e.target.closest('[id^="net-inv-toggle-"]');
      if (tg) {
        const r = tg.getAttribute('data-row');
        const det = document.getElementById('net-line-detail-' + r);
        if (det) {
          const open = det.style.display !== 'none';
          det.style.display = open ? 'none' : '';
          tg.className = open ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        }
        return;
      }
      const tr = e.target.closest('tr:not(.net-line-detail)');
      if (tr && tr.parentElement && tr.parentElement.tagName === 'TBODY') {
        const id = tr.id || '';
        if (id.startsWith('net-line-detail-')) return;
        const r = tr.querySelector('[id^="net-inv-toggle-"]');
        if (r) r.click();
      }
    });
  }
}

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['net-account'] = function netAccountSyncData() {
  // The dashboard/net view has no free-text search input, but it must reflect
  // fresh totals + transactions without a destructive page rebuild. calculateNet
  // re-renders only the result regions in place.
  calculateNet();
};
