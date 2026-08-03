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
    (inv.items || []).forEach(it => {
      const prod = productMap[it.productId];
      const buyPrice = prod ? (prod.buyPrice || 0) : 0;
      s += (it.price - buyPrice) * it.qty;
    });
    return s;
  }, 0);
}

function calculateNet() {
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

  let totalPurchases = 0;      // قيمة فواتير المشتريات (للموردين)
  let totalSales = 0;          // المبيعات = المدفوع فعلاً من العملاء فقط
  let totalExpenses = 0;       // المصروفات = المدفوع فعلاً للموردين فقط
  let totalSupplierDebt = 0;   // دين علينا (للموردين)
  let totalCustomerDebt = 0;   // دين لنا (على العملاء)

  // فواتير المشتريات (للموردين + مشتريات المخزون + تحويلات) كمرجع - لا تدخل في صافي الربح
  invoices.forEach(inv => {
    if (inv.isProvisional) return;
    if (inv.type === 'supplier' || inv.type === 'purchase' || inv.type === 'transfer' || inv.type === 'transfer_receive') {
      totalPurchases += inv.totalAmount;
    }
  });

  // ديون الموردين: الرصيد الموجب = دين علينا، الرصيد السالب = دين لنا (مورد يدان لنا)
  suppliers.forEach(s => {
    const b = parseFloat(s.balance) || 0;
    if (b > 0) totalSupplierDebt += b;
    else totalCustomerDebt += Math.abs(b);
  });

  // ديون العملاء (كل فاتورة عميل غير مسددة) = دين لنا
  customers.forEach(c => {
    totalCustomerDebt += Math.max(0, parseFloat(c.balance) || 0);
  });

  // المبيعات = كل دفعة ليست مصروفًا (عملاء مسجلين + walk-in)
  // المصروفات = مدفوعات الموردين + مشتريات المخزون + فواتير الشراء + فواتير الإرسال
  payments.forEach(p => {
    if (p.isProvisional) return; // تجاهل الدفعات الشكلية
    if (isNetExpensePayment(p)) {
      totalExpenses += p.amount;
    } else {
      totalSales += p.amount;
    }
  });

  // صافي الربح = إجمالي المبيعات (المقبوضات) - إجمالي المصروفات (المدفوعات)
  const profit = totalSales - totalExpenses;
  const pendingTotal = totalSupplierDebt + totalCustomerDebt;

  document.getElementById('netTotalSales').textContent = `DA${totalSales.toFixed(2)}`;
  document.getElementById('netTotalPurchases').textContent = `DA${totalPurchases.toFixed(2)}`;
  document.getElementById('netTotalExpenses').textContent = `DA${totalExpenses.toFixed(2)}`;
  document.getElementById('netProfit').textContent = `DA${profit.toFixed(2)}`;

  // عرض الديون: دين علينا + دين لنا
  let pendingHtml = `DA${pendingTotal.toFixed(2)}`;
  if (totalCustomerDebt > 0 || totalSupplierDebt > 0) {
    pendingHtml += `<div style="font-size:10px;font-weight:400;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
      ${totalCustomerDebt > 0 ? `<span style="color:#28a745">${t('net.customerDebt')}: DA${totalCustomerDebt.toFixed(2)}</span>` : ''}
      ${totalSupplierDebt > 0 ? `<span style="color:#e65100">${t('net.supplierDebt')}: DA${totalSupplierDebt.toFixed(2)}</span>` : ''}
    </div>`;
  }
  document.getElementById('netPending').innerHTML = pendingHtml;

  // هامش الربح = (سعر البيع - سعر الشراء) لكل قطعة مباعة
  const productMap = {};
  for (const p of DB.getProducts()) productMap[p.id] = p;
  const salesInvoices = invoices.filter(inv => inv.type === 'customer');

  const totalMargin = calcMargin(salesInvoices, productMap);

  const range = getNetDateRange();
  const periodInvoices = salesInvoices.filter(inv => {
    const tt = inv.createdAt || inv.date || 0;
    if (range.from && tt < range.from) return false;
    if (range.to && tt > range.to) return false;
    return true;
  });
  const periodMargin = calcMargin(periodInvoices, productMap);

  document.getElementById('netTotalMargin').textContent = `DA${totalMargin.toFixed(2)}`;
  document.getElementById('netPeriodMargin').textContent = `DA${periodMargin.toFixed(2)}`;
  const netRangeLabelEl = document.getElementById('netPeriodLabel');
  if (netRangeLabelEl) netRangeLabelEl.textContent = netRangeLabel(range);

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
      txLog.push({
        date: new Date(p.createdAt),
        desc: p.note ? `${desc} (${p.note})` : desc,
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
