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
  const costCur = prod ? (prod.buyPrice || 0) : 0;
  const cost = isFinite(costSnap) ? costSnap : costCur;
  const isEst = !isFinite(costSnap);
  return { cost, isEst };
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

function calcMarginSplit(salesInvoices, productMap) {
  let marginCash = 0, marginCcp = 0, collectedCash = 0, collectedCcp = 0;
  salesInvoices.forEach(inv => {
    if (inv.isProvisional) return;
    if (DB.getInvoiceEffectivePaid(inv) < (inv.totalAmount || 0)) return;
    let margin = 0;
    (inv.items || []).forEach(it => {
      const prod = productMap[it.productId];
      const info = _lineCostInfo(it, productMap); const buyPrice = info.cost;
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
  return `DA${fmtMoney(margin)}
    <div style="font-size:10px;font-weight:400;margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;color:rgba(255,255,255,0.85)">
      <span>💵 ${t('net.cashLabel')}: DA${fmtMoney(split.collected.cash)}</span>
      <span>📮 CCP: DA${fmtMoney(split.collected.ccp)}</span>
    </div>
    <div style="font-size:10px;font-weight:400;margin-top:2px;color:rgba(255,255,255,0.6)">
      ${t('net.marginLabel')} — 💵 DA${fmtMoney(split.margin.cash)} · 📮 DA${fmtMoney(split.margin.ccp)}
    </div>`;
}

function computeNet(range) {
  const invoices = DB.getInvoices();
  const suppliers = DB.getSuppliers();
  const customers = DB.getCustomers();
  const payments = DB.getPayments();

  const invById = {};
  invoices.forEach(i => { invById[i.id] = i; });

  // الدفعة مصروف إذا: لها مورد، أو مشتريات مخزون، أو إرسال (فاتورة إرسال)، أو
  // مرتبطة بفاتورة شراء (بمورد أو بدونه). أما الدفعات المرتبطة بفاتورة
  // «بيع لمورد» (sup_sale) أو فاتورة عميل فهي مبيعات — فالمورد هنا مشترٍ
  // وليس بائعاً، والفرق جوهري بين «فاتورة شراء من مورد» و«فاتورة بيع لمورد».
  function isNetExpensePayment(p) {
    if (p.supplierId || p.type === 'stock_purchase' || p.type === 'dispatch') {
      const inv = p.invoiceId ? invById[p.invoiceId] : null;
      if (inv && (inv.type === 'sup_sale' || inv.type === 'customer')) return false;
      return true;
    }
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
    if (!inRange(ts)) return;
    // Payment vouchers settle balances (سند قبض) and are tracked as their own
    // invoice type — never let a linked Payment row leak into sales/expenses.
    const invRef = p.invoiceId ? invById[p.invoiceId] : null;
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

  const productMap = {};
  for (const p of DB.getProducts()) productMap[p.id] = p;

  // الدفعة مصروف إذا: لها مورد، أو مشتريات مخزون، أو إرسال (فاتورة إرسال)، أو
  // مرتبطة بفاتورة شراء (بمورد أو بدونه). أما الدفعات المرتبطة بفاتورة
  // «بيع لمورد» (sup_sale) أو فاتورة عميل فهي مبيعات — فالمورد هنا مشترٍ
  // وليس بائعاً، والفرق جوهري بين «فاتورة شراء من مورد» و«فاتورة بيع لمورد».
  function isNetExpensePayment(p) {
    if (p.supplierId || p.type === 'stock_purchase' || p.type === 'dispatch') {
      const inv = p.invoiceId ? invById[p.invoiceId] : null;
      if (inv && (inv.type === 'sup_sale' || inv.type === 'customer')) return false;
      return true;
    }
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
    // المقاصّة عند بيع لمورد = تسوية رصيد محايدة لا تظهر في سجل المعاملات.
    if (p.isSupSaleExpense) return;
    // قيود الإدخال المباشر من صفحة صافي الحساب
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
      });
      return;
    }
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
      const invRef = p.invoiceId ? invById[p.invoiceId] : null;
      const invLink = (invRef && invRef.type === 'customer') ? invRef : null;
      txLog.push({
        date: new Date(p.createdAt),
        desc: (p.note ? `${desc} (${p.note})` : desc) + methodNote,
        type: t('net.salesPaid'),
        amount: p.amount, // موجب = دخل
        badge: 'success',
        ts: p.createdAt,
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

  txLog.slice(0, 30).forEach(tx => {
    const dateStr = tx.date.toLocaleDateString('ar-EG-u-nu-latn');
    const amtColor = tx.amount < 0 ? '#dc3545' : '#28a745';
    const hasDetail = !!(tx.invoice && (tx.invoice.items || []).length);
    const toggleCell = hasDetail
      ? `<i id="net-inv-toggle-${rowIdx}" class="fas fa-chevron-down" style="cursor:pointer;color:#8ab4f8;font-size:11px" data-row="${rowIdx}"></i>`
      : '';
    html += `<tr>
      <td>${dateStr}</td>
      <td>${tx.desc}</td>
      <td><span class="badge badge-${tx.badge}">${tx.type}</span></td>
      <td style="color:${amtColor}">${tx.amount < 0 ? '-' : '+'}DA${fmtMoney(Math.abs(tx.amount))}</td>
      <td style="text-align:center">${toggleCell}</td>
    </tr>`;

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
        detRows += `<tr>
          <td>${it.name || ''}${estMark}</td>
          <td style="text-align:center">${it.qty}</td>
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
