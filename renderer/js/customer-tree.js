// ============================================================
// ZMT PIECE — Customer tree (شجرة العملاء)
//
// DESIGN INVARIANT — READ BEFORE CHANGING ANYTHING:
// A sub-customer is a LABEL inside the parent customer, never a second
// financial account. Every invoice, every payment and every receipt voucher
// keeps `customerId = parentId`. The optional `subCustomerId` /
// `subCustomerName` fields are display/classification metadata ONLY.
// There is no code path here that calls DB.addPayment(), DB.addInvoice() or
// writes a customer balance. All money is still moved exactly once by the
// original sale / payment / voucher code paths.
//
// One level only: A -> C / N / D. A child can never have children of its own.
// Deleting a child removes the tag; historical records keep their snapshot.
// ============================================================
(function (global) {
  'use strict';

  var KEY = 'zmt_customer_tree';

  function enabled() {
    try {
      return !!(global.localStorage && global.localStorage.getItem(KEY) === '1');
    } catch (e) {
      return false;
    }
  }

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function round2(v) {
    return Math.round((num(v) + (num(v) >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
  }

  // db.js declares `const DB = (() => {...})();` at classic-script top level.
  // That is a GLOBAL LEXICAL binding, not a property of window — reading only
  // `window.DB` returned null in the real app and produced the misleading
  // «noDB» failure even though every other page used DB successfully.
  function db() {
    try {
      if (typeof DB !== 'undefined' && DB) return DB;
    } catch (e) { /* temporal dead zone: fall through to the property form */ }
    try {
      if (global && global.DB) return global.DB;
    } catch (e) { /* non-fatal */ }
    return null;
  }

  function allCustomers() {
    var D = db();
    var list = D && typeof D.getCustomers === 'function' ? D.getCustomers() : [];
    return Array.isArray(list) ? list : [];
  }

  function findParent(customerId, list) {
    var id = String(customerId || '');
    if (!id) return null;
    var customers = list || allCustomers();
    for (var i = 0; i < customers.length; i++) {
      if (String(customers[i] && customers[i].id) === id) return customers[i];
    }
    // Fallback for a customer held by the indexed cache but filtered out of
    // getCustomers() by a stale store/company scope snapshot.
    var D = db();
    if (!list && D && typeof D.getCustomer === 'function') {
      try {
        var one = D.getCustomer(customerId);
        if (one && String(one.id) === id) return one;
      } catch (e) { /* non-fatal */ }
    }
    return null;
  }

  // Normalise both new records and any hand-edited/imported legacy value.
  // `children` is always flat: nested children are deliberately discarded.
  function normalize(raw) {
    if (!raw) return null;
    var name = String(raw.name || raw.subCustomerName || '').trim();
    if (!name) return null;
    return {
      id: String(raw.id || ''),
      name: name,
      phone: String(raw.phone || ''),
      address: String(raw.address || ''),
      createdAt: raw.createdAt || Date.now(),
    };
  }

  function rawChildren(customerId, list) {
    var parent = findParent(customerId, list);
    if (!parent || !Array.isArray(parent.children)) return [];
    return parent.children;
  }

  function childrenOf(customerId, list) {
    if (!enabled() || !customerId) return [];
    var out = [];
    rawChildren(customerId, list).forEach(function (raw) {
      var child = normalize(raw);
      if (child) out.push(child);
    });
    return out;
  }

  function genId() {
    var rnd = '';
    try {
      var bytes = new Uint8Array(4);
      if (global.crypto && global.crypto.getRandomValues) {
        global.crypto.getRandomValues(bytes);
        for (var i = 0; i < bytes.length; i++) {
          var h = bytes[i].toString(16);
          rnd += (h.length < 2 ? '0' : '') + h;
        }
      }
    } catch (e) { /* non-fatal fallback */ }
    return 'ct_' + Date.now().toString(36) + '_' + (rnd || Math.floor(Math.random() * 1e9).toString(36));
  }

  // Persist the flat label list and PROVE it was written. The old code returned
  // a child object even when updateCustomer() silently failed, and returned
  // null with no reason — which is why the UI showed «name required» although a
  // name had been typed. Every caller now gets a definite ok/error result.
  function persistChildren(customerId, kids) {
    var D = db();
    if (!D) return false;
    var wrote = false;
    if (typeof D.updateCustomer === 'function') {
      try {
        var updated = D.updateCustomer(String(customerId), { children: kids });
        if (updated) wrote = true;
      } catch (e) {
        console.warn('[CustomerTree] updateCustomer failed, trying saveCustomers', e);
      }
    }
    if (!wrote && typeof D.saveCustomers === 'function') {
      var list = allCustomers().slice();
      var idx = list.findIndex(function (c) { return String(c && c.id) === String(customerId); });
      if (idx !== -1) {
        // Copy the row too: a failed save must not leave the in-memory cache
        // looking saved while nothing was actually written to storage.
        var row = {};
        for (var k in list[idx]) {
          if (Object.prototype.hasOwnProperty.call(list[idx], k)) row[k] = list[idx][k];
        }
        row.children = kids;
        list[idx] = row;
        try { D.saveCustomers(list); wrote = true; } catch (e) {
          console.warn('[CustomerTree] saveCustomers failed', e);
        }
      }
    }
    if (!wrote) return false;
    var saved = findParent(customerId);
    if (!saved || !Array.isArray(saved.children)) return false;
    return saved.children.length === kids.length;
  }

  // Detailed result kept separate from addChild() so old callers stay intact.
  function addChildEx(customerId, data) {
    if (!enabled()) return { ok: false, error: 'disabled' };
    var D = db();
    if (!D) return { ok: false, error: 'noDB' };
    var parent = findParent(customerId);
    if (!parent) return { ok: false, error: 'noParent' };
    var input = data || {};
    var name = String(input.name || '').trim();
    if (!name) return { ok: false, error: 'emptyName' };
    var child = {
      id: genId(),
      name: name.slice(0, 120),
      phone: String(input.phone || '').trim().slice(0, 60),
      address: String(input.address || '').trim().slice(0, 240),
      createdAt: Date.now(),
    };
    var kids = rawChildren(customerId).filter(normalize);
    kids.push(child);
    if (!persistChildren(customerId, kids)) return { ok: false, error: 'persist' };
    return { ok: true, child: child };
  }

  // Add a label under parent A. Name is required; phone/address optional.
  // Never creates a DB customer record.
  function addChild(customerId, data) {
    var res = addChildEx(customerId, data);
    return res.ok ? res.child : null;
  }

  function updateChild(customerId, childId, data) {
    if (!enabled()) return null;
    var parent = findParent(customerId);
    if (!parent) return null;
    var input = data || {};
    var name = String(input.name || '').trim();
    if (!name) return null;
    var kids = rawChildren(customerId);
    var idx = kids.findIndex(function (k) { return String(k && k.id) === String(childId); });
    if (idx === -1) return null;
    var merged = normalize(kids[idx]) || {};
    merged.name = name.slice(0, 120);
    if (input.phone != null) merged.phone = String(input.phone).trim().slice(0, 60);
    if (input.address != null) merged.address = String(input.address).trim().slice(0, 240);
    kids[idx] = merged;
    return persistChildren(customerId, kids) ? merged : null;
  }

  // Remove the LABEL only. Invoices/payments already carry a snapshot of the
  // name in `subCustomerName`, so history is untouched by this operation.
  function removeChild(customerId, childId) {
    if (!enabled()) return false;
    if (!findParent(customerId)) return false;
    var kids = rawChildren(customerId).filter(function (k) {
      return String(k && k.id) !== String(childId);
    });
    return persistChildren(customerId, kids);
  }

  function findChild(childId, list) {
    if (!enabled() || !childId) return null;
    var customers = list || allCustomers();
    for (var i = 0; i < customers.length; i++) {
      var parent = customers[i];
      var kids = Array.isArray(parent && parent.children) ? parent.children : [];
      for (var j = 0; j < kids.length; j++) {
        if (String(kids[j] && kids[j].id) === String(childId)) {
          var child = normalize(kids[j]);
          if (!child) return null;
          child.parentId = String(parent.id);
          child.parentName = String(parent.name || '');
          return child;
        }
      }
    }
    return null;
  }

  // Metadata attached to invoices / payments / vouchers. Empty object when the
  // feature is OFF or when the id cannot be resolved — callers can spread it
  // unconditionally without changing the old object shape.
  function metaFor(child, parent) {
    if (!enabled() || !child) return {};
    var c = (typeof child === 'string') ? findChild(child) : normalize(child);
    if (!c) return {};
    var p = parent || (c.parentId ? findParent(c.parentId) : null);
    var meta = { subCustomerId: c.id || String(child), subCustomerName: c.name };
    if (p && p.name) meta.parentCustomerName = String(p.name);
    return meta;
  }

  function escHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // Populate a payment/voucher modal selector with the parent's children.
  // Returns true when the selector is useful (feature ON and children exist).
  function fillSelect(selectEl, customerId, noneLabel) {
    if (!selectEl) return false;
    var kids = childrenOf(customerId);
    var useful = !!(enabled() && kids.length);
    selectEl.innerHTML = '<option value="">' + escHtml(noneLabel || '') + '</option>' +
      kids.map(function (k) {
        return '<option value="' + escHtml(k.id) + '">' + escHtml(k.name) + '</option>';
      }).join('');
    selectEl.value = '';
    return useful;
  }

  // When a payment form is opened from an EXISTING invoice, its child selector
  // must open on that invoice's own label — not on «no sub-customer». The
  // invoice snapshot stays untouched; this only preselects a display option.
  // Falls back to matching the historical name when the id is missing/legacy,
  // and to '' when the label was removed (history is still shown separately).
  function selectInvoiceChild(selectEl, inv, customerId) {
    if (!selectEl || !inv || !enabled()) return '';
    var kids = childrenOf(customerId || inv.customerId);
    var wanted = String(inv.subCustomerId || '');
    if (!wanted) {
      var name = String(inv.subCustomerName || '').trim();
      for (var i = 0; i < kids.length; i++) {
        if (String(kids[i].name || '') === name) { wanted = String(kids[i].id); break; }
      }
    }
    var exists = false;
    for (var j = 0; j < kids.length; j++) {
      if (String(kids[j].id) === wanted) { exists = true; break; }
    }
    selectEl.value = exists ? wanted : '';
    return exists ? wanted : '';
  }

  function metaFromSelect(selectEl, parent) {
    if (!enabled() || !selectEl || !selectEl.value) return {};
    return metaFor(selectEl.value, parent);
  }

  function noteFor(child, parent) {
    if (!enabled() || !child) return '';
    var c = (typeof child === 'string') ? findChild(child) : normalize(child);
    if (!c || !c.name) return '';
    var p = parent || (c.parentId ? findParent(c.parentId) : null);
    var parentName = (p && p.name) ? String(p.name) : (c.parentName || '');
    if (!parentName) return '';
    return 'Cette facture est destinée à ' + c.name + ', envoyée par ' + parentName + '.';
  }

  // Outstanding amount of the invoices tagged with one child. The payments
  // themselves are the source of truth (DB.getInvoicePaidAmount), so a partial
  // payment immediately reduces the child's shown debt. Voucher invoices carry
  // no items and must be ignored here.
  function childRawDebt(invoices, childId, D) {
    if (!enabled() || !childId) return 0;
    var database = D || db();
    var list = Array.isArray(invoices) ? invoices : [];
    var total = 0;
    list.forEach(function (inv) {
      if (!inv || inv.type === 'payment' || inv.type === 'sup_sale') return;
      if (String(inv.subCustomerId || '') !== String(childId)) return;
      var paid = (database && typeof database.getInvoicePaidAmount === 'function')
        ? database.getInvoicePaidAmount(inv.id)
        : num(inv.paidAmount);
      var due = num(inv.totalAmount) - num(paid) - num(inv.creditUsed);
      if (due > 0) total += due;
    });
    return round2(total);
  }

  // Parent's balance is the ONLY financial truth. Scale the per-child display
  // debts so they can never exceed it; once A settles everything they all drop
  // to zero automatically, even for payments made by a generic receipt voucher.
  function childDebts(parent, children, invoices, D) {
    var out = {};
    if (!enabled() || !parent) return out;
    var database = D || db();
    var kids = Array.isArray(children) ? children : [];
    if (!kids.length) return out;
    var raw = kids.map(function (c) {
      return { id: String(c.id), amount: childRawDebt(invoices, c.id, database) };
    });
    var totalRaw = raw.reduce(function (s, r) { return s + r.amount; }, 0);
    var balance = round2(num(parent.balance));
    if (totalRaw <= 0 || balance <= 0) {
      raw.forEach(function (r) { out[r.id] = 0; });
      return out;
    }
    if (totalRaw <= balance) {
      raw.forEach(function (r) { out[r.id] = round2(r.amount); });
      return out;
    }
    var allocated = 0;
    raw.forEach(function (r, i) {
      if (i === raw.length - 1) {
        out[r.id] = round2(Math.max(0, balance - allocated));
      } else {
        var v = round2(r.amount / totalRaw * balance);
        out[r.id] = v;
        allocated += v;
      }
    });
    return out;
  }

  // Backwards-friendly wrapper: one child's capped debt.
  function childDebt(parent, childId, invoices, D) {
    var debts = childDebts(parent, [{ id: childId }], invoices, D);
    return debts[String(childId)] || 0;
  }

  global.CustomerTree = {
    KEY: KEY,
    enabled: enabled,
    childrenOf: childrenOf,
    addChild: addChild,
    addChildEx: addChildEx,
    updateChild: updateChild,
    removeChild: removeChild,
    findChild: findChild,
    metaFor: metaFor,
    fillSelect: fillSelect,
    selectInvoiceChild: selectInvoiceChild,
    metaFromSelect: metaFromSelect,
    noteFor: noteFor,
    childRawDebt: childRawDebt,
    childDebts: childDebts,
    childDebt: childDebt,
  };
})(typeof window !== 'undefined' ? window : globalThis);
