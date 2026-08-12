function init_net_account() {
  calculateNet();
}

var _netPeriod = 'month';

function setNetPeriod(period) {
  _netPeriod = period;
  document.querySelectorAll('#page-net-account .period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  calculateNet();
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
    case 'week': {
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(d - diff);
      monday.setHours(0, 0, 0, 0);
      fromTs = monday.getTime();
      break;
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

function calcMargin(salesInvoices, productMap) {
  return salesInvoices.reduce((s, inv) => {
    if (inv.isProvisional) return s;
    if (DB.getInvoicePaidAmount(inv.id) < (inv.totalAmount || 0)) return s;
    (inv.items || []).forEach(it => {
      const prod = productMap[it.productId];
      const buyPrice = prod ? (prod.buyPrice || 0) : 0;
      s += (it.price - buyPrice) * it.qty;
    });
    return s;
  }, 0);
}

function calcMarginSplit(salesInvoices, productMap) {
  let marginCash = 0, marginCcp = 0, collectedCash = 0, collectedCcp = 0;
  salesInvoices.forEach(inv => {
    if (inv.isProvisional) return;
    if (DB.getInvoicePaidAmount(inv.id) < (inv.totalAmount || 0)) return;
    let margin = 0;
    (inv.items || []).forEach(it => {
      const prod = productMap[it.productId];
      const buyPrice = prod ? (prod.buyPrice || 0) : 0;
      margin += (it.price - buyPrice) * it.qty;
    });
    const m = DB.getInvoicePaymentMethods(inv.id);
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
  return { margin: { cash: marginCash, ccp: marginCcp }, collected: { cash: collectedCash, ccp: collectedCcp } };
}

function formatMarginSplitCard(margin, split) {
  return `DA${margin.toFixed(2)}
    <div style="font-size:10px;font-weight:400;margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;color:rgba(255,255,255,0.85)">
      <span>💵 ${t('net.cashLabel')}: DA${split.collected.cash.toFixed(2)}</span>
      <span>📮 CCP: DA${split.collected.ccp.toFixed(2)}</span>
    </div>
    <div style="font-size:10px;font-weight:400;margin-top:2px;color:rgba(255,255,255,0.6)">
      ${t('net.marginLabel')} — 💵 DA${split.margin.cash.toFixed(2)} · 📮 DA${split.margin.ccp.toFixed(2)}
    </div>`;
}

function computeNet(range) {
  const invoices = DB.getInvoices();
  const suppliers = DB.getSuppliers();
  const customers = DB.getCustomers();
  const payments = DB.getPayments();

  const invById = {};
  invoices.forEach(i => { invById[i.id] = i; });

  // الدفعة مصروف إذا: لها مورد، أو مشتريات مخزون، أو إرسال (فاتورة إرسال)، أو مرتبطة بفاتورة شراء (بمورد أو بدونه)
  function isNetExpensePayment(p) {
    if (p.supplierId || p.type === 'stock_purchase' || p.type === 'dispatch') return true;
    const inv = p.invoiceId ? invById[p.invoiceId] : null;
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
    const isExp = isNetExpensePayment(p);
    if (!inRange(ts)) return;
    if (isExp) {
      totalExpenses += p.amount;
      if (p.supplierId) supRange[p.supplierId] = (supRange[p.supplierId] || 0) - p.amount;
    } else {
      totalSales += p.amount;
      if (p.customerId) custRange[p.customerId] = (custRange[p.customerId] || 0) - p.amount;
    }
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
  const productMap = {};
  for (const p of DB.getProducts()) productMap[p.id] = p;
  const salesInvoices = invoices.filter(inv => inv.type === 'customer');

  const totalMargin = calcMargin(salesInvoices, productMap);

  const periodInvoices = salesInvoices.filter(inv => inRange(inv.createdAt || inv.date || 0));
  const periodMargin = calcMargin(periodInvoices, productMap);

  const totalSplit = calcMarginSplit(salesInvoices, productMap);
  const periodSplit = calcMarginSplit(periodInvoices, productMap);

  return {
    totalSales, totalPurchases, totalExpenses, profit,
    supplierDebt, customerDebt, pendingTotal,
    supplierDebtPeriod, customerDebtPeriod, pendingPeriod,
    totalMargin, periodMargin, totalSplit, periodSplit,
  };
}

function calculateNet() {
  const res = computeNet(getNetDateRange());

  document.getElementById('netTotalSales').textContent = `DA${res.totalSales.toFixed(2)}`;
  document.getElementById('netTotalPurchases').textContent = `DA${res.totalPurchases.toFixed(2)}`;
  document.getElementById('netTotalExpenses').textContent = `DA${res.totalExpenses.toFixed(2)}`;
  document.getElementById('netProfit').textContent = `DA${res.profit.toFixed(2)}`;

  // عرض الديون الحالية: دين علينا + دين لنا
  let pendingHtml = `DA${res.pendingTotal.toFixed(2)}`;
  if (res.customerDebt > 0 || res.supplierDebt > 0) {
    pendingHtml += `<div style="font-size:10px;font-weight:400;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
      ${res.customerDebt > 0 ? `<span style="color:#28a745">${t('net.customerDebt')}: DA${res.customerDebt.toFixed(2)}</span>` : ''}
      ${res.supplierDebt > 0 ? `<span style="color:#e65100">${t('net.supplierDebt')}: DA${res.supplierDebt.toFixed(2)}</span>` : ''}
    </div>`;
  }
  document.getElementById('netPending').innerHTML = pendingHtml;

  document.getElementById('netTotalMargin').innerHTML = formatMarginSplitCard(res.totalMargin, res.totalSplit);
  document.getElementById('netPeriodMargin').innerHTML = formatMarginSplitCard(res.periodMargin, res.periodSplit);
  const netRangeLabelEl = document.getElementById('netPeriodLabel');
  if (netRangeLabelEl) netRangeLabelEl.textContent = netRangeLabel(getNetDateRange());

  renderNetTransactions();
}

function renderNetTransactions() {
  const invoices = DB.getInvoices();
  const suppliers = DB.getSuppliers();
  const customers = DB.getCustomers();
  const payments = DB.getPayments();
  const invById = {};
  invoices.forEach(i => { invById[i.id] = i; });

  // الدفعة مصروف إذا: لها مورد، أو مشتريات مخزون، أو إرسال (فاتورة إرسال)، أو مرتبطة بفاتورة شراء (بمورد أو بدونه)
  function isNetExpensePayment(p) {
    if (p.supplierId || p.type === 'stock_purchase' || p.type === 'dispatch') return true;
    const inv = p.invoiceId ? invById[p.invoiceId] : null;
    return !!inv && (inv.type === 'supplier' || inv.type === 'purchase');
  }

  // Transaction log
  const container = document.getElementById('netTransactions');
  const txLog = [];

  // فواتير المشتريات (تسجيل مرجعي فقط)
  invoices.forEach(inv => {
    if (inv.isProvisional) return;
    if (inv.type !== 'supplier' && inv.type !== 'purchase' && inv.type !== 'transfer' && inv.type !== 'transfer_receive') return;
    const date = new Date(inv.createdAt);
    const sup = inv.supplierId ? suppliers.find(s => s.id === inv.supplierId) : null;
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
    });
  });

  // الدفعات: المصروفات (موردون/مشتريات/إرسال) مقابل المبيعات (عملاء + walk-in)
  payments.forEach(p => {
    if (p.isProvisional) return;
    if (isNetExpensePayment(p)) {
      if (p.supplierId) {
        const s = suppliers.find(x => x.id === p.supplierId);
        const desc = s ? `${t('net.paymentTo')}${s.name}` : t('net.paymentToSupplier');
        txLog.push({
          date: new Date(p.createdAt),
          desc: p.note ? `${desc} (${p.note})` : desc,
          type: t('net.expenses'),
          amount: -p.amount,
          badge: 'danger',
          ts: p.createdAt,
        });
      } else {
        txLog.push({
          date: new Date(p.createdAt),
          desc: p.note || t('net.stockPurchase'),
          type: t('net.stockPurchases'),
          amount: -p.amount,
          badge: 'warning',
          ts: p.createdAt,
        });
      }
    } else {
      const c = p.customerId ? customers.find(x => x.id === p.customerId) : null;
      const desc = c ? `${t('net.paymentFrom')}${c.name}` : (p.note?.includes('دفع') ? `${t('net.paymentNote')} - ${p.note}` : t('net.paymentWalkin'));
      const methodNote = p.method === 'ccp' || p.method === 'mixed' ? ` (${t('net.ccpPaidNote')})` : '';
      txLog.push({
        date: new Date(p.createdAt),
        desc: (p.note ? `${desc} (${p.note})` : desc) + methodNote,
        type: t('net.salesPaid'),
        amount: p.amount, // موجب = دخل
        badge: 'success',
        ts: p.createdAt,
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
      <th>${t('net.col1')}</th><th>${t('net.col2')}</th><th>${t('net.col3')}</th><th>${t('net.col4')}</th>
    </tr></thead><tbody>`;

  txLog.slice(0, 30).forEach(tx => {
    const dateStr = tx.date.toLocaleDateString('ar-EG-u-nu-latn');
      const amtColor = tx.amount < 0 ? '#dc3545' : '#28a745';
      html += `<tr>
        <td>${dateStr}</td>
        <td>${tx.desc}</td>
        <td><span class="badge badge-${tx.badge}">${tx.type}</span></td>
        <td style="color:${amtColor}">${tx.amount < 0 ? '-' : '+'}DA${Math.abs(tx.amount).toFixed(2)}</td>
      </tr>`;
  });

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}
