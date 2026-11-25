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
    // A product's sale floor is enforced by the engine itself, so the desktop
    // page, the phone sale and every other caller obey the same limit. The
    // clamp happens before any discount split, keeping the ratios consistent.
    const floorOf = (entry) => {
      if (!entry || !entry.productId) return 0;
      const prod = DB.getProduct(entry.productId);
      return prod ? Math.max(0, num(prod.minPrice)) : 0;
    };
    const lines = (opts.lines || []).map((line) => Object.assign({}, line, {
      entries: (line.entries || []).map((e) => {
        const floor = floorOf(e);
        return floor > num(e.price) ? Object.assign({}, e, { price: floor }) : e;
      }),
    }));
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
        const bundleId = (entry.productId && String(entry.productId).startsWith('bundle:')) ? String(entry.productId).slice('bundle:'.length) : null;
        const bundle = bundleId ? (DB.getBundle ? DB.getBundle(bundleId) : null) : null;
        if (bundle) {
          const want = rq(entry.qty);
          if (want <= 0) continue;
          for (const c of (bundle.components || [])) {
            const p = DB.getProduct(c.productId);
            if (p && p.fixed !== true) {
              const need = rq((parseFloat(c.qty) || 0) * want);
              if (rq(p.quantity || 0) < need) {
                return { ok: false, error: { code: 'STOCK', name: entry.name || bundle.name || '', available: p.quantity || 0, qty: need } };
              }
            }
          }
          continue;
        }
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
        const bundleId = (entry.productId && String(entry.productId).startsWith('bundle:')) ? String(entry.productId).slice('bundle:'.length) : null;
        const bundle = bundleId ? (DB.getBundle ? DB.getBundle(bundleId) : null) : null;
        const prod = bundle ? null : DB.getProduct(entry.productId);
        const price = num(entry.price);
        const baseEntryTotal = price * qty;
        const baseTot = lineBase || baseEntryTotal || 1;
        const entryLineDisc = num(line.lineDiscount) * (baseEntryTotal / baseTot);
        const entryCustDisc = baseEntryTotal !== 0 ? custDiscAmount * (baseEntryTotal / (subTotal || 1)) : 0;
        const entryExtraDisc = baseEntryTotal !== 0 ? extraDiscAmount * (baseEntryTotal / (subTotal || 1)) : 0;
        // Dividing by the quantity is only safe for a real positive quantity.
        const finalPrice = price - (entryLineDisc / qty) - (entryCustDisc / qty) - (entryExtraDisc / qty);
        const itemTotal = finalPrice * qty;
        let costSnapshot = 0;
        if (bundle) {
          costSnapshot = (bundle.components || []).reduce((s, c) => {
            const p = DB.getProduct(c.productId);
            return s + ((p && p.buyPrice) || 0) * (parseFloat(c.qty) || 0);
          }, 0);
        } else {
          costSnapshot = (typeof PurchaseCore !== 'undefined' && PurchaseCore && typeof PurchaseCore.productRealCost === 'function')
            ? PurchaseCore.productRealCost(prod)
            : (prod ? (prod.buyPrice || 0) : 0);
        }
        totalProfit += (finalPrice - costSnapshot) * qty;
        if (bundle) {
          for (const c of (bundle.components || [])) {
            const p = DB.getProduct(c.productId);
            if (p && p.fixed !== true) {
              const compQty = rq((parseFloat(c.qty) || 0) * qty);
              productUpdates.push({ id: c.productId, changes: { quantity: rq((p.quantity || 0) - compQty) } });
            }
          }
        } else if (prod && prod.fixed !== true) {
          productUpdates.push({ id: entry.productId, changes: { quantity: rq((prod.quantity || 0) - qty) } });
        }
        const unitSnap = unitSnapshot(prod || entry);
        const item = Object.assign({
          productId: entry.productId,
          barcode: entry.barcode || (prod && prod.barcode) || (bundle && bundle.barcode) || '',
          name: entry.name || (prod && prod.name) || (bundle && bundle.name) || '',
          // Product snapshot for the optional invoice columns (Référence /
          // Marque). Copied at sale time so later product edits never rewrite
          // an already issued document.
          reference: (prod && prod.reference) || entry.reference || '',
          mark: (prod && prod.mark) || entry.mark || '',
          qty,
          price: finalPrice,
          total: itemTotal,
          originalPrice: price,
          discount: entryLineDisc + entryCustDisc + entryExtraDisc,
          lineDiscount: entryLineDisc,
          costPrice: costSnapshot,
          lineProfit: +Math.max((finalPrice - costSnapshot) * qty, 0).toFixed(2),
          isBundle: !!bundle,
          bundleId: bundle ? bundle.id : undefined,
        }, unitSnap);
        if (bundle) {
          const comps = (bundle.components || []).map(c => {
            const cp = DB.getProduct(c.productId);
            return {
              productId: c.productId,
              name: (cp && cp.name) || c.name || '',
              barcode: (cp && cp.barcode) || c.barcode || '',
              qtyPerBundle: rq(parseFloat(c.qty) || 0),
              sellPrice: num(cp && cp.sellPrice),
            };
          });
          // Each component carries its share of the bundle's *final* unit
          // price, so a later partial return can credit exactly what the
          // customer paid for that component (bundle discounts included).
          const retailTotal = comps.reduce((s, c) => s + c.sellPrice * c.qtyPerBundle, 0);
          const equalShare = comps.length ? finalPrice / comps.length : 0;
          comps.forEach(c => {
            c.valuePerBundle = retailTotal > 0
              ? finalPrice * ((c.sellPrice * c.qtyPerBundle) / retailTotal)
              : equalShare;
            delete c.sellPrice;
          });
          item.bundleComponents = comps;
          item.returnedComponents = {};
          item.bundleReturnCredit = 0;
        }
        // A scale line arrives with the label's place-count: 0.25 stored,
        // "0.250" printed. Nothing else on the invoice changes.
        if (line.qtyDecimals != null) item.qtyDecimals = line.qtyDecimals;
        // No product record means no cost to subtract: the whole amount is
        // margin. The flag is what makes a report say so out loud.
        if (!entry.productId && !bundle) item.freeLine = true;
        invoiceItems.push(item);
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
    if (!supMode && !(opts.customerId || opts.allowOverpay) && paidAmount + creditUsed > totalAmount) {
      return { ok: false, error: { code: 'PAID_EXCEEDS', total: totalAmount, paid: paidAmount + creditUsed } };
    }

    // 1) stock first (fixed products are skipped)
    if (res.productUpdates.length > 0) DB.updateProductsBatch(res.productUpdates);

    // Customer tree (optional). A sub-customer is ONLY metadata on the parent's
    // invoice/payment: `opts.customerId` is never replaced, and no second
    // balance write is introduced below. With the flag OFF these values are all
    // empty, so the persisted objects are byte-for-byte the old shape.
    const ct = (typeof window !== 'undefined') ? window.CustomerTree : null;
    const subOn = !!(ct && typeof ct.enabled === 'function' && ct.enabled() && !supMode && opts.customerId);
    let subInfo = subOn ? (opts.subCustomer || (opts.subCustomerId ? {
      id: opts.subCustomerId,
      name: opts.subCustomerName || '',
      parentId: opts.customerId,
      parentName: opts.parentCustomerName || '',
    } : null)) : null;
    if (subInfo && !subInfo.name && ct && typeof ct.findChild === 'function') {
      subInfo = ct.findChild(subInfo.id) || subInfo;
    }
    const parentCustomer = (!supMode && opts.customerId) ? DB.getCustomer(opts.customerId) : null;
    const subMeta = (subInfo && ct && typeof ct.metaFor === 'function') ? (ct.metaFor(subInfo, parentCustomer) || {}) : {};
    const payMeta = subMeta.subCustomerId
      ? { subCustomerId: subMeta.subCustomerId, subCustomerName: subMeta.subCustomerName }
      : {};
    const invNote = opts.note
      ? String(opts.note)
      : ((subInfo && ct && typeof ct.noteFor === 'function') ? (ct.noteFor(subInfo, parentCustomer) || '') : '');

    // 2) the invoice
    const inv = DB.addInvoice({
      customerId: supMode ? null : (opts.customerId || null),
      ...subMeta,
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
      note: invNote ? invNote.trim().slice(0, 300) : undefined,
    });

    // 3) payment
    if (paidAmount > 0) {
      const pmt = {
        customerId: supMode ? undefined : (opts.customerId || undefined),
        ...payMeta,
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

  // ---- bundle returns -------------------------------------------------------
  //
  // A bundle line on an invoice is one row, but its components are real stock
  // cards. Editing that row must return the right components — all of them when
  // the whole bundle quantity drops, or only the ones the customer actually
  // handed back when the return is partial. The helpers below are shared by the
  // two invoice-edit screens so both behave exactly like a normal return.

  function bundleIdOf(item) {
    if (!item) return null;
    if (item.bundleId) return item.bundleId;
    const pid = item.productId ? String(item.productId) : '';
    return pid.indexOf('bundle:') === 0 ? pid.slice('bundle:'.length) : null;
  }

  function isBundleItem(item) {
    return !!(item && (item.isBundle || bundleIdOf(item)));
  }

  function bundleComponents(DB, item) {
    if (!isBundleItem(item)) return [];
    const out = [];
    const add = (productId, name, barcode, qtyPerBundle, valuePerBundle) => {
      productId = productId || '';
      if (!productId) return;
      const q = rq(qtyPerBundle);
      if (q <= 0) return;
      const existing = out.find(c => c.productId === productId);
      if (existing) {
        existing.qtyPerBundle = rq(existing.qtyPerBundle + q);
        existing.valuePerBundle = num(existing.valuePerBundle) + num(valuePerBundle);
        return;
      }
      out.push({
        productId,
        name: name || '',
        barcode: barcode || '',
        qtyPerBundle: q,
        valuePerBundle: num(valuePerBundle),
      });
    };

    if (Array.isArray(item.bundleComponents) && item.bundleComponents.length) {
      item.bundleComponents.forEach(c => {
        if (!c) return;
        add(c.productId, c.name, c.barcode,
          c.qtyPerBundle != null ? c.qtyPerBundle : c.qty,
          c.valuePerBundle);
      });
    } else {
      const bundle = bundleIdOf(item) && DB.getBundle ? DB.getBundle(bundleIdOf(item)) : null;
      if (bundle) {
        (bundle.components || []).forEach(c => {
          const p = DB.getProduct(c.productId);
          add(c.productId, (p && p.name) || c.name, (p && p.barcode) || c.barcode, c.qty, 0);
        });
      }
    }

    // Invoices written before this version have no component snapshot/values:
    // rebuild both from the live bundle. A component's share of the *line*
    // price is proportional to its standalone sale price; equal split is the
    // fallback when every component is priceless.
    const unitPrice = num(item.price) ||
      (num(item.qty) ? num(item.total) / num(item.qty) : 0);
    const retails = out.map(c => {
      const p = DB.getProduct(c.productId);
      return Math.max(0, num(p && p.sellPrice)) * c.qtyPerBundle;
    });
    const retailTotal = retails.reduce((s, v) => s + v, 0);
    const equalShare = out.length ? unitPrice / out.length : 0;
    out.forEach((c, i) => {
      if (!(num(c.valuePerBundle) > 0)) {
        c.valuePerBundle = retailTotal > 0
          ? unitPrice * (retails[i] / retailTotal)
          : equalShare;
      }
    });

    item.bundleComponents = out;
    if (!item.returnedComponents || typeof item.returnedComponents !== 'object') {
      item.returnedComponents = {};
    }
    if (item.bundleReturnCredit == null) item.bundleReturnCredit = 0;
    return out;
  }

  // Components still in the customer's hands for this line: sold per bundle ×
  // line quantity, minus whatever was already returned on an earlier edit.
  function bundleHeldComponents(DB, item) {
    const comps = bundleComponents(DB, item);
    const qty = num(item.qty);
    return comps.map(c => {
      const soldQty = rq(c.qtyPerBundle * qty);
      const returnedQty = Math.max(0, rq(item.returnedComponents[c.productId] || 0));
      return Object.assign({}, c, {
        soldQty,
        returnedQty,
        heldQty: Math.max(0, rq(soldQty - returnedQty)),
      });
    });
  }

  // Restore stock + write a normal return row for each requested component.
  // returns: [{ productId, qty }] — quantities are capped by what is still held.
  // opts.track === false is for a bundle *quantity* decrease: the smaller line
  // quantity already removes those bundles, so the pieces must not also be
  // stored in returnedComponents (that would count them twice).
  // Returns { credit, applied:[{productId,name,qty,value}] }.
  function applyBundleComponentReturns(DB, invoiceId, item, returns, reason, opts) {
    const comps = bundleComponents(DB, item);
    if (!comps.length) return { credit: 0, applied: [] };
    const track = !(opts && opts.track === false);
    const held = bundleHeldComponents(DB, item);
    const applied = [];
    let credit = 0;
    (returns || []).forEach(r => {
      const pid = r && r.productId;
      if (!pid) return;
      const c = held.find(x => x.productId === pid);
      if (!c || c.heldQty <= 0) return;
      const want = rq(r.qty);
      const qty = Math.min(want, c.heldQty);
      if (qty <= 0) return;
      const prod = DB.getProduct(pid);
      // «غير محدود» cards are fed by the scale, never inflated by a return —
      // exactly the rule the normal (non-bundle) return path follows.
      if (prod && prod.fixed !== true) {
        DB.updateProduct(pid, { quantity: rq((prod.quantity || 0) + qty) });
      }
      // Snapshot the exact money this component return removes from the
      // invoice. The return invoice prints these figures, so it can never
      // disagree with the credit the customer actually received.
      const value = num(c.valuePerBundle) * qty;
      DB.addReturn({
        invoiceId: invoiceId,
        productId: pid,
        productName: (prod && prod.name) || c.name || '',
        qty,
        price: qty > 0 ? value / qty : 0,
        total: value,
        unit: prod && prod.unit,
        unitLabel: prod && prod.unitLabel,
        qtyDecimals: prod && prod.qtyDecimals,
        reason: reason || 'تعديل فاتورة (إرجاع مكوّن باقة)',
        isBundleComponent: true,
        bundleId: bundleIdOf(item) || undefined,
      });
      if (track) item.returnedComponents[pid] = rq((item.returnedComponents[pid] || 0) + qty);
      credit += value;
      applied.push({ productId: pid, name: (prod && prod.name) || c.name || '', qty, value });
    });
    if (track) item.bundleReturnCredit = num(item.bundleReturnCredit) + credit;
    return { credit, applied };
  }

  return {
    num,
    allocateQty,
    computeSale,
    executeSale,
    isBundleItem,
    bundleComponents,
    bundleHeldComponents,
    applyBundleComponentReturns,
  };
})();

if (typeof window !== 'undefined') window.SaleCore = SaleCore;
if (typeof module !== 'undefined' && module.exports) module.exports = SaleCore;