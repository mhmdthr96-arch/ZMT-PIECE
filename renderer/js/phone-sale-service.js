// ============================================================================
// ZMT PIECE — PHONE SALE SERVICE (runs inside the DESKTOP renderer)
// ============================================================================
// The renderer is the single writer of the database, so every request coming
// from a phone (via main-process IPC) is handled HERE, synchronously, against
// DB. Sales reuse window.SaleCore, so phone sales and desktop sales produce
// byte-identical invoices/stock/payments.
//
// window.phoneSaleEnabled  — set by main.js when the phone POS feature is on
//                            and the current device allows it (see preload).
// ============================================================================
'use strict';

const PhoneSaleService = (() => {

  const num = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };
  const keyOf = (name, barcode) => String(name || '') + '\u0001' + String(barcode || '');
  const escName = (s) => String(s || '').slice(0, 200);

  // ---- desktop group semantics duplicated (see pages/sales.js 245–335) -----

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
  function expiryClass(r) {
    if (!r || !r.expiryDate) return 'none';
    const t = new Date(String(r.expiryDate).slice(0, 10) + 'T00:00:00').getTime();
    if (isNaN(t)) return 'none';
    const today = todayMs();
    if (t < today) return 'expired';
    if (t <= today + warnDays() * 86400000) return 'expiring';
    return 'ok';
  }
  function isFixedRecord(r) { return !!(r && r.fixed === true); }

  // Immutable snapshot the phone app may NOT see buyPrice/profit from.
  function buildGroups() {
    const products = DB.getProducts() || [];
    const map = new Map();
    for (const p of products) {
      const key = keyOf(p.name, p.barcode);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    const out = [];
    for (const [, records] of map) {
      records.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const rep = records[0];
      const pharm = pharmOn();
      const fixed = records.some(isFixedRecord);
      let available = 0;
      let hasExpired = false;
      for (const r of records) {
        if (r.fixed === true) continue;
        if (pharm && expiryClass(r) === 'expired') { if ((r.quantity || 0) > 0) hasExpired = true; continue; }
        available += r.quantity || 0;
      }
      const viable = records.filter(r => isFixedRecord(r) || (r.quantity || 0) > 0 && (!pharm || expiryClass(r) !== 'expired'));
      const first = viable[0] || rep || {};
      out.push({
        id: rep.id,
        name: escName(rep.name),
        barcode: rep.barcode || '',
        mark: rep.mark || '',
        brandId: rep.brandId || '',
        reference: rep.reference || '',
        unit: rep.unit || '',
        family: rep.family || '',
        fixed,
        available,
        hasExpired,
        batches: records.length,
        sellPrice: num(first.sellPrice),
        wholesalePrice: num(first.wholesalePrice) || num(first.sellPrice),
      });
    }
    out.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    return out;
  }

  function norm(q) {
    return String(q || '')
      .trim()
      .toLowerCase()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[،,;؛]/g, ' ');
  }

  // ---- public request handlers ----------------------------------------------

  function handle(reqName, payload) {
    payload = payload || {};
    switch (reqName) {
      case 'settings/get': return settingsGet();
      case 'users': return usersList();
      case 'products/search': return productsSearch(payload.q, payload.page);
      case 'product/barcode': return barcodeLookup(payload.code);
      case 'customers/search': return customersSearch(payload.q);
      case 'suppliers/search': return suppliersSearch(payload.q);
      case 'sale/submit': return submitSale(payload);
      case 'invoices/list': return invoicesList(payload);
      case 'invoice/get': return invoiceGet(payload);
    }
    throw { code: 'UNKNOWN', msg: 'طلب غير معروف' };
  }

  function settingsGet() {
    let storeName = '';
    try { storeName = Auth.getStoreName(); } catch (e) {}
    return {
      enabled: isEnabled(),
      storeName: storeName || 'ZMT',
      currency: 'DA',
      pharmacy: pharmOn(),
      sellAllowed: isEnabled(),
    };
  }

  function usersList() {
    const users = [];
    try {
      const list = (typeof Auth !== 'undefined' && Auth.listUsers) ? (Auth.listUsers() || []) : [];
      for (const u of list) {
        if (!u || !u.username) continue;
        users.push({ id: u.id, name: String(u.username).slice(0, 120), code: u.storeCode || '' });
      }
    } catch (e) {}
    return { users };
  }

  function productsSearch(q, page) {
    const all = buildGroups();
    const query = norm(q);
    const maxPage = 60;
    let list;
    if (query) {
      const isNum = /^\d{2,}$/.test(String(q || '').trim());
      list = all.filter(g =>
        (isNum && g.barcode && String(g.barcode).replace(/\s/g, '') === String(q).trim().replace(/\s/g, '')) ||
        norm(g.name).includes(query) ||
        norm(g.barcode).includes(query) ||
        norm(g.mark).includes(query) ||
        norm(g.reference).includes(query) ||
        norm(g.family).includes(query)
      );
    } else {
      list = all;
    }
    const start = (num(page) || 0) * maxPage;
    return {
      results: list.slice(start, start + maxPage),
      total: list.length,
      hasMore: start + maxPage < list.length,
    };
  }

  function barcodeLookup(code) {
    const raw = String(code || '').trim();
    if (!raw) return { product: null };
    const p = DB.getProductByBarcode ? DB.getProductByBarcode(raw) : null;
    if (!p) return { product: null };
    // Return the same group view (never raw products / buyPrice).
    const g = buildGroups().find(x => x.barcode === (p.barcode || '') && x.name === (p.name || ''));
    if (g) return { product: g };
    const product = buildGroups().find(x => x.id === p.id) || null;
    return { product };
  }

  function customersSearch(q) {
    const query = norm(q);
    const all = DB.getCustomers() || [];
    let list = all;
    if (query) {
      list = all.filter(c => norm(c.name).includes(query) || norm(c.phone).includes(query));
    }
    return { results: list.slice(0, 30).map(c => ({ id: c.id, name: escName(c.name), phone: c.phone || '', balance: num(c.balance), discount: num(c.discount) })) };
  }

  function suppliersSearch(q) {
    const query = norm(q);
    const all = DB.getSuppliers() || [];
    let list = all;
    if (query) {
      list = all.filter(s => norm(s.name).includes(query) || norm(s.phone).includes(query));
    }
    return { results: list.slice(0, 30).map(s => ({ id: s.id, name: escName(s.name), phone: s.phone || '', balance: num(s.balance) })) };
  }

  // ---- submit a sale from a phone -------------------------------------------

  function submitSale(p) {
    requireEnabled();

    // 1) seller identity is mandatory (chosen from usersList())
    let seller = '';
    let sellerDevice = '';
    if (p.seller && p.seller.id) {
      try {
        const hit = (Auth.listUsers() || []).find(u => u.id === p.seller.id);
        if (!hit) throw { code: 'SELLER', msg: 'الموظف غير موجود' };
        seller = String(hit.username).slice(0, 120);
      } catch (e) {
        if (e && e.code === 'SELLER') throw e;
        throw { code: 'SELLER', msg: 'تعذر التحقق من الموظف' };
      }
    } else if (p.sellerName) {
      seller = String(p.sellerName).slice(0, 120);
    } else {
      throw { code: 'SELLER', msg: 'اختر الموظف أولاً (مطلوب)' };
    }
    if (p.deviceName) sellerDevice = String(p.deviceName).slice(0, 120);

    // 2) normalize input
    const supMode = !!p.supMode;
    const customerId = supMode ? null : (p.customerId || null);
    const supplierId = supMode ? (p.supplierId || null) : null;
    const pay = p.pay || {};
    const payMethod = pay.method === 'ccp' || pay.method === 'mixed' ? pay.method : 'cash';
    const paidCash = payMethod === 'mixed' ? Math.max(0, num(pay.cash)) : (payMethod === 'cash' ? Math.max(0, num(pay.total)) : 0);
    const paidCcp = payMethod === 'mixed' ? Math.max(0, num(pay.ccp)) : (payMethod === 'ccp' ? Math.max(0, num(pay.total)) : 0);
    const paidTotal = payMethod === 'mixed' ? (paidCash + paidCcp) : Math.max(0, num(pay.total));

    // 3) resolve customer discount the SAME way desktop does
    let custDiscPct = 0;
    if (customerId) {
      const c = DB.getCustomer(customerId);
      if (!c) throw { code: 'CUSTOMER', msg: 'العميل غير موجود' };
      if (c.discount > 0) custDiscPct = num(c.discount);
    }

    // 4) resolve + allocate every cart line
    const rawLines = Array.isArray(p.lines) ? p.lines : [];
    if (!rawLines.length) throw { code: 'EMPTY', msg: 'السلة فارغة' };
    const lines = [];
    for (const raw of rawLines) {
      const qty = Math.round(num(raw.qty));
      if (qty < 1) continue;
      let price = num(raw.price);
      if (price < 0) price = 0;
      const alloc = window.SaleCore.allocateQty(DB, {
        name: raw.name,
        barcode: raw.barcode,
        productId: raw.productId,
        qty,
        price,
      });
      if (!alloc.entries.length) {
        throw { code: 'STOCK', name: escName(raw.name), available: alloc.availableTotal || 0, qty, msg: 'المنتج غير متوفر' };
      }
      if (alloc.shortQty > 0) {
        throw { code: 'STOCK', name: escName(raw.name), available: alloc.qty, qty, msg: 'الكمية غير متوفرة' };
      }
      const lineDiscount = Math.max(0, num(raw.discount));
      lines.push({
        name: escName(raw.name),
        barcode: raw.barcode,
        entries: alloc.entries,
        lineDiscount,
      });
    }
    if (!lines.length) throw { code: 'EMPTY', msg: 'السلة فارغة' };

    // 5) credit: only the real, unpaid credit a customer has may be used
    let creditUsed = 0;
    if (customerId) {
      const balance = num((DB.getCustomer(customerId) || {}).balance);
      const maxCredit = Math.max(0, -balance);
      creditUsed = Math.min(Math.max(0, num(p.creditUsed)), maxCredit);
    }

    // 6) dispatch to the SAME core the desktop uses
    const res = window.SaleCore.executeSale(DB, {
      lines,
      customerId,
      supplierId,
      supMode,
      customerDiscountPct: custDiscPct,
      extraDiscount: Math.max(0, num(p.extraDiscount)),
      pay: { method: payMethod, cash: paidCash, ccp: paidCcp, total: paidTotal },
      creditUsed,
      seller,
      sellerDevice,
    }, {
      fullPayment: t('sales.fullPaymentNote'),
      partialPayment: t('sales.partialPaymentNote'),
      custDiscType: t('sales.discountType'),
      extraDiscType: t('sales.discountManual'),
      lineDiscType: t('sales.lineDiscount'),
    });
    if (!res.ok) {
      if (res.error && res.error.code === 'PAID_EXCEEDS') {
        throw { code: 'PAID_EXCEEDS', msg: t('sales.paidExceedsTotal'), total: res.error.total };
      }
      if (res.error && res.error.code === 'STOCK') {
        throw { code: 'STOCK', name: res.error.name, available: res.error.available, qty: res.error.qty, msg: t('sales.notAvailableQty') };
      }
      throw { code: 'SALE', msg: (res.error && res.error.message) || 'فشل البيع' };
    }

    const customerName = customerId ? (DB.getCustomer(customerId) || {}).name || '' : '';
    const supplierName = supplierId ? (DB.getSuppliers().find(s => s.id === supplierId) || {}).name || '' : '';
    return {
      ok: true,
      invoiceId: res.invoiceId,
      invoiceNumber: res.invoiceNumber,
      totalAmount: res.totalAmount,
      paidAmount: res.paidAmount,
      creditUsed: res.creditUsed,
      remaining: res.remaining,
      customerName,
      supplierName,
      items: res.items.map(it => ({
        name: it.name,
        barcode: it.barcode,
        qty: it.qty,
        price: it.price,
        total: it.total,
      })),
    };
  }

  function invoicesList(p) {
    const type = p.type || 'customer';
    const limit = Math.min(50, Math.max(1, num(p.limit) || 20));
    let list = DB.getInvoices() || [];
    if (type === 'all') { /* keep both kinds */ }
    else if (type === 'sup_sale') list = list.filter(i => i.type === 'sup_sale');
    else list = list.filter(i => i.type !== 'sup_sale');
    if (p.customerId) list = list.filter(i => i.customerId === p.customerId);
    if (p.supplierId) list = list.filter(i => i.supplierId === p.supplierId);
    list = list.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit);
    let custName = '', supName = '';
    try { if (p.customerId) custName = (DB.getCustomer(p.customerId) || {}).name || ''; } catch (e) {}
    try { if (p.supplierId) supName = (DB.getSuppliers().find(s => s.id === p.supplierId) || {}).name || ''; } catch (e) {}
    return {
      list: list.map(i => ({
        id: i.id,
        number: i.invoiceNumber || '',
        type: i.type || 'customer',
        date: i.createdAt || 0,
        totalAmount: num(i.totalAmount),
        paidAmount: num(DB.getInvoicePaidAmount(i.id)),
        remaining: Math.max(0, num(i.totalAmount) - num(DB.getInvoicePaidAmount(i.id))),
        customerId: i.customerId || null,
        supplierId: i.supplierId || null,
        customerName: (i.customerId ? (DB.getCustomer(i.customerId) || {}).name : custName) || '',
        supplierName: (i.supplierId ? (DB.getSuppliers().find(s => s.id === i.supplierId) || {}).name : supName) || '',
        seller: i.seller || '',
        itemsCount: (i.items || []).reduce((s, x) => s + (x.qty || 0), 0),
      })),
    };
  }

  function invoiceGet(p) {
    const inv = DB.getInvoice(p.id);
    if (!inv) throw { code: 'INVOICE', msg: 'الفاتورة غير موجودة' };
    const customerName = inv.customerId ? (DB.getCustomer(inv.customerId) || {}).name || '' : '';
    const supplierName = inv.supplierId ? (DB.getSuppliers().find(s => s.id === inv.supplierId) || {}).name || '' : '';
    const paidAmount = num(DB.getInvoicePaidAmount(inv.id));
    return {
      id: inv.id,
      number: inv.invoiceNumber || '',
      type: inv.type || 'customer',
      date: inv.createdAt || 0,
      totalAmount: num(inv.totalAmount),
      paidAmount,
      remaining: Math.max(0, num(inv.totalAmount) - paidAmount),
      customerName,
      supplierName,
      seller: inv.seller || '',
      items: (inv.items || []).map(it => ({ name: it.name, barcode: it.barcode || '', qty: it.qty, price: it.price, total: it.total })),
    };
  }

  // ---- helpers ----------------------------------------------------------------

  function isEnabled() {
    return typeof window !== 'undefined' && window.phoneSaleEnabled === true;
  }
  function requireEnabled() {
    if (!isEnabled()) throw { code: 'DISABLED', msg: 'البيع من الهاتف غير مفعل' };
  }

  return { handle, isEnabled };
})();

if (typeof window !== 'undefined') window.PhoneSaleService = PhoneSaleService;
if (typeof module !== 'undefined' && module.exports) module.exports = PhoneSaleService;