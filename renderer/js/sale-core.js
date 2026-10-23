// ============================================================================
// ZMT PIECE — SHARED SALE CORE
// ============================================================================
// The one-and-only engine that turns a sales cart into an invoice + stock
// + payments. Both the DESKTOP checkout page (pages/sales.js) and the PHONE
// POS (phone-sale-service.js) call these functions, so the two paths can
// NEVER drift apart: identical totals, identical discounts, identical stock
// writes, identical numbering.
//
// computeSale(DB, opts)   — pure computation (no writes). Mirrors exactly the
//                           calculation in the old confirmSalesCheckout().
// executeSale(DB, opts)   — computeSale + the whole DB write sequence
//                           (products → invoice → payment → discounts →
//                           balances). Returns { ok, invoice, ... }.
// allocateQty(DB, spec)   — mirrors the sales page's per-line allocation
//                           (FIFO across batches, pharmacy expiry blocking,
//                           "fixed" unlimited items) so a phone line resolves
//                           into the same batch entries the desktop uses.
// ============================================================================
'use strict';

const SaleCore = (() => {

  // Smallest positive quantity the engine will honour. Quantities are decimal
  // (0.00006 is a real sale), so this is only a float-noise floor, NOT a
  // "minimum 1 piece" rule.
  const MIN = 0.000001;
  const QTY_DECIMALS = 6;

  const num = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  // Quantities are rounded to 6 decimals on every write so 0.1 + 0.2 never
  // becomes 0.30000000000000004 in stock or on an invoice line. Money is left
  // to the existing float pipeline (formatted at display time) so no existing
  // total/discount/accounting behaviour changes.
  const rq = (v) => {
    const n = num(v);
    const f = Math.pow(10, QTY_DECIMALS);
    return Math.round(n * f) / f;
  };

  // Snapshot of a product's unit for the invoice line (history never rewrites).
  function unitSnapshot(prod) {
    if (typeof window !== 'undefined' && window.Unit && window.Unit.snapshot) {
      return window.Unit.snapshot(prod);
    }
    const code = prod && prod.unit ? String(prod.unit) : 'piece';
    const out = { unit: code };
    if (code === 'custom' && prod && prod.unitLabel) out.unitLabel = String(prod.unitLabel);
    return out;
  }

  // ---- pharmacy/expiry helpers (mirrors sales.js) --------------------------

  function pharmOn() {
    return typeof window !== 'undefined' && typeof window.getPharmacyMode === 'function' && !!window.getPharmacyMode();
  }
  function todayMs() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  function warnDays() {
    try {
      const s = typeof getExpirySettings === 'function' ? getExpirySettings() : null;
      return (s && s.warnDays) || 30;
    } catch (e) { return 30; }
  }
  function expiryMs(r) {
    if (!r || !r.expiryDate) return null;
    const t = new Date(String(r.expiryDate).slice(0, 10) + 'T00:00:00').getTime();
    return isNaN(t) ? null : t;
  }
  function expiryClass(r) {
    const t = expiryMs(r);
    if (t === null) return 'none';
    const today = todayMs();
    if (t < today) return 'expired';
    if (t <= today + warnDays() * 86400000) return 'expiring';
    return 'ok';
  }
  function isFixed(r) { return !!(r && r.fixed === true); }
  function keyOf(name, barcode) { return String(name || '') + '\u0001' + String(barcode || ''); }

  // ---- line allocation (mirrors sales.js allocateSalesLine + getSalesGroups) -

  // spec: { name, barcode, productId, qty, price }
  // Resolves the group the sales page would use for that product, breaks the
  // requested qty into batch entries FIFO (by createdAt), skips expired batches
  // in pharmacy mode and treats "fixed" products as unlimited.
  function allocateQty(DB, spec) {
    spec = spec || {};
    let records = [];
    if (spec.name || spec.barcode) {
      const key = keyOf(spec.name, spec.barcode);
      records = (DB.getProducts() || []).filter(p => keyOf(p.name, p.barcode) === key);
    }
    if (!records.length && spec.productId) {
      records = (DB.getProducts() || []).filter(p => p.id === spec.productId);
    }
    records = records.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const pharm = pharmOn();
    const entries = [];
    // Decimal quantities are first-class: 0.25 kg or 0.00006 L must survive
    // allocation untouched. Only a real zero is rejected.
    let remaining = rq(spec.qty);
    if (remaining < 0) remaining = 0;
    if (remaining > 0 && remaining < MIN) remaining = MIN;
    let requested = remaining;
    let blockedExpired = 0;
    let anyFixed = false;
    for (const r of records) {
      if (pharm && !isFixed(r) && (r.quantity || 0) > 0 && expiryClass(r) === 'expired') {
        blockedExpired += (r.quantity || 0);
        continue;
      }
      if (isFixed(r)) anyFixed = true;
      if (remaining <= 0) break;
      const take = rq(isFixed(r) ? remaining : Math.min(r.quantity || 0, remaining));
      if (take > 0) {
        const price = num(spec.price);
        entries.push({ productId: r.id, name: r.name || '', barcode: r.barcode || '', qty: take, price, total: take * price });
        remaining = rq(remaining - take);
      }
    }
    const baseTotal = entries.reduce((s, e) => s + e.total, 0);
    return {
      entries,
      baseTotal,
      qty: rq(entries.reduce((s, e) => s + e.qty, 0)),
      requested,
      shortQty: rq(remaining),
      blockedExpired,
      anyFixed,
      recordCount: records.length,
    };
  }

  // ---- pure computation ------------------------------------------------------

  // opts: {
  //   lines: [{ entries: [{ productId, qty, price, name?, barcode? }], lineDiscount }],
  //   customerDiscountPct, extraDiscount,
  //   customerId, supplierId, supMode,
  // }
  // Returns { ok:true, subTotal, custDiscAmount, afterCustDisc, extraDiscAmount,
  //           totalLineDiscount, totalAmount, invoiceItems, productUpdates,
  //           totalProfit } — OR { ok:false, error:{ code:'STOCK', ... } }.
  function computeSale(DB, opts) {
    opts = opts || {};
    const lines = opts.lines || [];
    const custDiscPct = Math.max(0, num(opts.customerDiscountPct));
    let extraDiscAmount = Math.max(0, num(opts.extraDiscount));

    const lineBaseTotal = (line) => (line.entries || []).reduce((s, e) => s + (num(e.price) * rq(e.qty)), 0);
    const subTotal = lines.reduce((s, line) => s + lineBaseTotal(line), 0);
    const custDiscAmount = subTotal * (custDiscPct / 100);
    const afterCustDisc = subTotal - custDiscAmount;
    if (extraDiscAmount > afterCustDisc) extraDiscAmount = afterCustDisc;
    const totalLineDiscount = lines.reduce((s, line) => s + num(line.lineDiscount), 0);
    const totalAmount = afterCustDisc - extraDiscAmount - totalLineDiscount;

    // stock validation (absolute per-batch, mirrors the checkout guard)
    const productUpdates = [];
    for (const line of lines) {
      for (const entry of (line.entries || [])) {
        const prod = DB.getProduct(entry.productId);
        if (!prod) continue;
        const want = rq(entry.qty);
        if (want <= 0) continue;
        if (prod.fixed !== true && rq(prod.quantity || 0) < want) {
          return { ok: false, error: { code: 'STOCK', name: entry.name || prod.name || '', available: prod.quantity || 0, qty: want } };
        }
      }
    }

    const invoiceItems = [];
    let totalProfit = 0;
    for (const line of lines) {
      const entries = line.entries || [];
      const lineBase = lineBaseTotal(line);
      for (const entry of entries) {
        const qty = rq(entry.qty);
        if (qty <= 0) continue;                    // never emit a zero-quantity line
        const prod = DB.getProduct(entry.productId);
        const price = num(entry.price);
        const baseEntryTotal = price * qty;
        const baseTot = lineBase || baseEntryTotal || 1;
        const entryLineDisc = num(line.lineDiscount) * (baseEntryTotal / baseTot);
        const entryCustDisc = baseEntryTotal !== 0 ? custDiscAmount * (baseEntryTotal / (subTotal || 1)) : 0;
        const entryExtraDisc = baseEntryTotal !== 0 ? extraDiscAmount * (baseEntryTotal / (subTotal || 1)) : 0;
        // Dividing by the quantity is only safe for a real positive quantity.
        const finalPrice = price - (entryLineDisc / qty) - (entryCustDisc / qty) - (entryExtraDisc / qty);
        const itemTotal = finalPrice * qty;
        const buyPrice = prod ? (prod.buyPrice || 0) : 0;
        const costSnapshot = buyPrice;
        totalProfit += (finalPrice - costSnapshot) * qty;
        if (prod && prod.fixed !== true) {
          productUpdates.push({ id: entry.productId, changes: { quantity: rq((prod.quantity || 0) - qty) } });
        }
        const unitSnap = unitSnapshot(prod || entry);
        invoiceItems.push(Object.assign({
          productId: entry.productId,
          barcode: entry.barcode || (prod && prod.barcode) || '',
          name: entry.name || (prod && prod.name) || '',
          qty,
          price: finalPrice,
          total: itemTotal,
          originalPrice: price,
          discount: entryLineDisc + entryCustDisc + entryExtraDisc,
          lineDiscount: entryLineDisc,
          costPrice: costSnapshot,
          lineProfit: +Math.max((finalPrice - costSnapshot) * qty, 0).toFixed(2),
        }, unitSnap));
      }
    }

    return {
      ok: true,
      subTotal,
      custDiscAmount,
      afterCustDisc,
      extraDiscAmount,
      totalLineDiscount,
      totalAmount,
      invoiceItems,
      productUpdates,
      totalProfit,
    };
  }

  // ---- full execution --------------------------------------------------------

  // opts add: { pay:{method,cash,ccp,total}, creditUsed, seller, sellerDevice }
  // labels:  { fullPayment, partialPayment, custDiscType, extraDiscType,
  //            lineDiscType }
  function executeSale(DB, opts, labels) {
    opts = opts || {};
    labels = labels || {};
    const pay = opts.pay || {};
    const method = pay.method === 'ccp' || pay.method === 'mixed' ? pay.method : 'cash';
    const paidAmount = Math.max(0, num(pay.total));
    const supMode = !!opts.supMode;

    const res = computeSale(DB, opts);
    if (!res.ok) return res;
    const totalAmount = res.totalAmount;

    const creditUsed = !supMode && opts.customerId ? Math.min(Math.max(0, num(opts.creditUsed)), totalAmount) : 0;
    const custCreditBefore = !supMode && opts.customerId ? Math.min(0, parseFloat((DB.getCustomer(opts.customerId) || {}).balance) || 0) : 0;
    if (paidAmount + creditUsed > totalAmount) {
      return { ok: false, error: { code: 'PAID_EXCEEDS', total: totalAmount, paid: paidAmount + creditUsed } };
    }

    // 1) stock first (fixed products are skipped)
    if (res.productUpdates.length > 0) DB.updateProductsBatch(res.productUpdates);

    // 2) the invoice
    const inv = DB.addInvoice({
      customerId: supMode ? null : (opts.customerId || null),
      supplierId: supMode ? (opts.supplierId || undefined) : undefined,
      type: supMode ? 'sup_sale' : 'customer',
      date: Date.now(),
      items: res.invoiceItems,
      totalAmount,
      customerDiscount: Math.max(0, num(opts.customerDiscountPct)),
      extraDiscount: res.extraDiscAmount,
      profit: res.totalProfit,
      creditUsed,
      custCreditBefore,
      seller: opts.seller ? String(opts.seller).slice(0, 120) : undefined,
      sellerDevice: opts.sellerDevice ? String(opts.sellerDevice).slice(0, 120) : undefined,
      note: opts.note ? String(opts.note).trim().slice(0, 300) : undefined,
    });

    // 3) payment
    if (paidAmount > 0) {
      const pmt = {
        customerId: supMode ? undefined : (opts.customerId || undefined),
        supplierId: supMode ? (opts.supplierId || undefined) : undefined,
        invoiceId: inv.id,
        amount: paidAmount,
        note: paidAmount >= totalAmount ? (labels.fullPayment || 'دفع كامل') : (labels.partialPayment || 'دفع جزئي'),
        method,
      };
      if (method === 'mixed') {
        pmt.cashAmount = num(pay.cash);
        pmt.ccpAmount = num(pay.ccp);
      }
      DB.addPayment(pmt);
    }

    // 4) discount records (customer % / manual extra / line discounts)
    if (res.custDiscAmount > 0) {
      DB.addDiscount({
        invoiceId: inv.id,
        customerId: opts.customerId || null,
        customerName: opts.customerId ? (DB.getCustomer(opts.customerId) || {}).name || '' : '',
        type: labels.custDiscType || 'Remise client',
        amount: res.custDiscAmount,
        percentage: Math.max(0, num(opts.customerDiscountPct)),
        originalTotal: res.subTotal,
        finalTotal: res.afterCustDisc,
      });
    }
    if (!supMode && res.extraDiscAmount > 0) {
      DB.addDiscount({
        invoiceId: inv.id,
        customerId: opts.customerId || null,
        customerName: opts.customerId ? (DB.getCustomer(opts.customerId) || {}).name || '' : '',
        type: labels.extraDiscType || 'Remise manuelle',
        amount: res.extraDiscAmount,
        percentage: 0,
        originalTotal: res.afterCustDisc,
        finalTotal: res.totalAmount,
      });
    }
    if (!supMode && res.totalLineDiscount > 0) {
      DB.addDiscount({
        invoiceId: inv.id,
        customerId: opts.customerId || null,
        customerName: opts.customerId ? (DB.getCustomer(opts.customerId) || {}).name || '' : '',
        type: labels.lineDiscType || 'Remise ligne',
        amount: res.totalLineDiscount,
        percentage: 0,
        originalTotal: res.afterCustDisc,
        finalTotal: res.totalAmount,
      });
    }

    // 5) customer balance (only the unpaid remainder accrues)
    if (opts.customerId) {
      const customers = DB.getCustomers();
      const cIdx = customers.findIndex(c => c.id === opts.customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + (totalAmount - paidAmount);
        DB.saveCustomers(customers);
      }
    }

    // 6) sale-to-supplier settlement (mirrors the desktop sup_sale flow)
    if (supMode && opts.supplierId) {
      const suppliers = DB.getSuppliers();
      const sIdx = suppliers.findIndex(s => s.id === opts.supplierId);
      if (sIdx !== -1) {
        const debtBefore = Math.max(0, parseFloat(suppliers[sIdx].balance) || 0);
        const supName = suppliers[sIdx].name || '';
        const onAccount = totalAmount - paidAmount;
        const supExpense = Math.min(onAccount, debtBefore);
        const supNetDue = Math.max(0, onAccount - debtBefore);
        suppliers[sIdx].balance = (parseFloat(suppliers[sIdx].balance) || 0) - onAccount;
        DB.saveSuppliers(suppliers);
        if (supExpense > 0) {
          try {
            DB.addPayment({
              supplierId: opts.supplierId,
              amount: supExpense,
              note: 'بيع لمورد — ' + supName + ' — فاتورة ' + (inv.invoiceNumber || ''),
              method: 'cash',
              isSupSaleExpense: true,
              refInvoiceId: inv.id,
            });
          } catch (e) {}
        }
        try { DB.updateInvoice(inv.id, { supExpense: supExpense, supNetDue: supNetDue, supDebtBefore: debtBefore }); } catch (e) {}
      }
    }

    const remaining = Math.max(0, totalAmount - paidAmount - creditUsed);
    return {
      ok: true,
      invoice: inv,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber || '',
      totalAmount,
      paidAmount,
      creditUsed,
      remaining,
      items: res.invoiceItems,
    };
  }

  return {
    num,
    allocateQty,
    computeSale,
    executeSale,
  };
})();

if (typeof window !== 'undefined') window.SaleCore = SaleCore;
if (typeof module !== 'undefined' && module.exports) module.exports = SaleCore;