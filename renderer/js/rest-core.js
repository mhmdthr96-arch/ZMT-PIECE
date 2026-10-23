// ============================================================
// ZMT PIECE - Restaurant orders CORE (pure logic, no DOM/Electron)
// ============================================================
// Roles:  'send'    = طالب (مرسل publishes orders to a receiver)
//         'receive' = مستلم (kitchen/cashier receives orders)
// Perms:  send    → allowed to publish new orders
//         control → allowed to move status (inprogress/done/cancel)
//         confirm → allowed to confirm the sale (full invoice)
// Status: new → inprogress → done → confirmed | cancelled
// Visibility is strictly local: an order is visible only on its own sender
// device and on the receiver it was addressed to (never broadcast to the LAN).
(function () {
  'use strict';

  var ROLE_SEND = 'send';
  var ROLE_RECEIVE = 'receive';
  var ROLE_NONE = 'none';

  var STATUS = {
    NEW: 'new',
    INPROGRESS: 'inprogress',
    DONE: 'done',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled'
  };

  var TERMINAL = { confirmed: true, cancelled: true };

  function genId() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---- permission helpers ---------------------------------------------

  // Defaults: a sender may publish; a receiver may control + confirm. Every
  // manager override merges on top of these defaults.
  function defaultPerms(role) {
    if (role === ROLE_RECEIVE) {
      return { send: false, control: true, confirm: true };
    }
    return { send: true, control: false, confirm: false };
  }

  function clampPerms(p) {
    p = p || {};
    return {
      send: !!p.send,
      control: !!p.control,
      confirm: !!p.confirm
    };
  }

  function mergePerms(base, patch) {
    base = base || {};
    patch = patch || {};
    return {
      send: typeof patch.send === 'boolean' ? patch.send : !!base.send,
      control: typeof patch.control === 'boolean' ? patch.control : !!base.control,
      confirm: typeof patch.confirm === 'boolean' ? patch.confirm : !!base.confirm
    };
  }

  function permsEqual(a, b) {
    a = a || {};
    b = b || {};
    return !!a.send === !!b.send && !!a.control === !!b.control && !!a.confirm === !!b.confirm;
  }

  function canSend(perms) { return !!(perms && perms.send); }
  function canControl(perms) { return !!(perms && perms.control); }
  function canConfirm(perms) { return !!(perms && perms.confirm); }

  // ---- order model -----------------------------------------------------

  function num(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // Quantities are decimal everywhere (0.25 kg, 0.00006 L). Rounded to 6
  // decimals only to kill float noise, exactly like sale-core/units.js.
  function qtyRound(v) {
    const n = num(v);
    return Math.round(n * 1e6) / 1e6;
  }

  function cloneItem(it) {
    it = it || {};
    const q = qtyRound(it.qty);
    return {
      name: String(it.name || '').trim(),
      barcode: String(it.barcode || '').trim(),
      qty: q > 0 ? q : 1,
      price: Math.max(0, num(it.price)),
      lineDiscount: Math.max(0, num(it.lineDiscount))
    };
  }

  function createOrder(opts) {
    opts = opts || {};
    return {
      id: opts.id || genId(),
      table: String(opts.table || '').trim(),
      notes: String(opts.notes || '').trim(),
      items: (opts.items || []).map(cloneItem),
      from: {
        id: String(opts.fromId || ''),
        name: String(opts.fromName || '').trim(),
        device: String(opts.fromDevice || '').trim()
      },
      to: String(opts.toId || ''),
      status: STATUS.NEW,
      statusBy: '',
      statusByDevice: '',
      statusTs: null,
      createdAt: opts.createdAt || Date.now(),
      updatedAt: null,
      invoiceId: opts.invoiceId || undefined,
      invoiceNo: opts.invoiceNo || undefined
    };
  }

  function itemSubtotal(it) {
    const qty = Math.max(0, num(it.qty));
    const price = Math.max(0, num(it.price));
    return qty * price;
  }

  function itemTotal(it) {
    const subtotal = itemSubtotal(it);
    const disc = Math.min(Math.max(0, num(it.lineDiscount)), subtotal);
    return subtotal - disc;
  }

  function totals(order) {
    let itemsTotal = 0;
    let discount = 0;
    for (const it of (order && order.items) || []) {
      itemsTotal += itemSubtotal(it);
      discount += itemSubtotal(it) - itemTotal(it);
    }
    return {
      itemsTotal,
      discount,
      total: itemsTotal - discount
    };
  }

  function itemCount(order) {
    return ((order && order.items) || []).reduce((s, it) => s + num(it.qty), 0);
  }

  // ---- transitions -----------------------------------------------------

  function nextStatus(action) {
    switch (action) {
      case 'inprogress': return STATUS.INPROGRESS;
      case 'done': return STATUS.DONE;
      case 'confirm': return STATUS.CONFIRMED;
      case 'cancel': return STATUS.CANCELLED;
    }
    return '';
  }

  // A sender may always cancel their own NEW order (no special perm needed).
  function canCancel(order, actor) {
    if (!order || order.status !== STATUS.NEW) return false;
    if (!actor || actor.id == null) return false;
    return String(actor.id) === String((order.from && order.from.id) || '');
  }

  function canTransition(order, action, perms, actor) {
    if (!order || !actor || actor.id == null) return false;
    if (TERMINAL[order.status]) return false;
    const isSender = String(actor.id) === String((order.from && order.from.id) || '');
    const isReceiver = String(actor.id) === String(order.to || '');
    if (action === 'cancel') return canCancel(order, actor);
    if (action === 'inprogress') {
      // kitchen starts preparing (also covers re-open after a failed sale)
      if (!canControl(perms)) return false;
      if (order.status !== STATUS.NEW && order.status !== STATUS.DONE) return false;
      return isReceiver;
    }
    if (action === 'done') {
      if (!canControl(perms)) return false;
      if (order.status !== STATUS.INPROGRESS) return false;
      return isReceiver;
    }
    if (action === 'confirm') {
      if (!canConfirm(perms)) return false;
      if (order.status !== STATUS.DONE && order.status !== STATUS.INPROGRESS && order.status !== STATUS.NEW) return false;
      // anyone with confirm perm may validate (manager-granted, e.g. sender/cashier)
      return true;
    }
    return false;
  }

  function availableActions(order, actor, perms) {
    const out = [];
    for (const a of ['inprogress', 'done', 'confirm', 'cancel']) {
      if (canTransition(order, a, perms, actor)) out.push(a);
    }
    return out;
  }

  function applyStatus(order, action, actor, extra) {
    const st = nextStatus(action);
    if (!st) return { ok: false, reason: 'BAD_ACTION' };
    const next = Object.assign({}, order, {
      status: st,
      statusBy: actor && actor.id != null ? String(actor.id) : '',
      statusByDevice: actor && actor.device ? String(actor.device) : '',
      statusTs: Date.now(),
      updatedAt: Date.now()
    });
    if (action === 'confirm' && extra) {
      if (extra.invoiceId) next.invoiceId = extra.invoiceId;
      if (extra.invoiceNo) next.invoiceNo = extra.invoiceNo;
    }
    return { ok: true, order: next };
  }

  // ---- visibility --------------------------------------------------------

  function isVisible(order, meId, role) {
    if (!order) return false;
    const me = String(meId || '');
    if (role === ROLE_SEND) {
      return me !== '' && me === String((order.from && order.from.id) || '');
    }
    if (role === ROLE_RECEIVE) {
      return me !== '' && me === String(order.to || '');
    }
    // any active role: show only orders this device is part of
    return me !== '' && (me === String(order.to || '') || me === String((order.from && order.from.id) || ''));
  }

  // ---- send-sheet draft helpers ------------------------------------------

  function findDraftItem(draft, productId) {
    return (draft && draft.items || []).find(it => String(it.productId || '') === String(productId || ''));
  }

  function addDraftItem(draft, product, qty) {
    draft = draft || { items: [] };
    if (!isValidProduct(product)) return draft;
    const pid = String(product.productId || '');
    const hit = findDraftItem(draft, pid);
    const q = qtyRound(qty);
    qty = q > 0 ? q : 1;
    if (hit) {
      hit.qty = qtyRound(hit.qty + qty);
    } else {
      draft.items.push({
        productId: pid,
        name: String(product.name || ''),
        barcode: String(product.barcode || ''),
        price: Math.max(0, num(product.price)),
        qty
      });
    }
    return draft;
  }

  function setDraftQty(draft, productId, qty) {
    const hit = findDraftItem(draft, productId);
    if (!hit) return;
    qty = qtyRound(qty);
    if (qty <= 0) {
      draft.items = draft.items.filter(it => String(it.productId || '') !== String(productId || ''));
    } else {
      hit.qty = qty;
    }
  }

  function removeDraftItem(draft, productId) {
    draft.items = (draft.items || []).filter(it => String(it.productId || '') !== String(productId || ''));
  }

  function draftTotals(draft) {
    const items = (draft && draft.items) || [];
    let itemsTotal = 0;
    for (const it of items) {
      itemsTotal += num(it.qty) * num(it.price);
    }
    return { itemsTotal, total: itemsTotal, count: items.length };
  }

  function isValidProduct(product) {
    return !!(product && (product.name || product.barcode));
  }

  // ---- misc ---------------------------------------------------------------

  var STATUS_LABELS = {
    new: 'rest.statusNew',
    inprogress: 'rest.statusInprogress',
    done: 'rest.statusDone',
    confirmed: 'rest.statusConfirmed',
    cancelled: 'rest.statusCancelled'
  };

  var STATUS_BADGE = {
    new: 'info',
    inprogress: 'warn',
    done: 'ok',
    confirmed: 'ok',
    cancelled: 'danger'
  };

  function statusLabelKey(status) {
    return STATUS_LABELS[status] || 'rest.statusNew';
  }

  function statusBadgeClass(status) {
    return STATUS_BADGE[status] || 'info';
  }

  function isReceiverPeer(peer) {
    return !!(peer && peer.role === ROLE_RECEIVE);
  }

  function isSenderPeer(peer) {
    return !!(peer && peer.role === ROLE_SEND);
  }

  const RestCore = {
    ROLE_SEND,
    ROLE_RECEIVE,
    ROLE_NONE,
    STATUS,
    TERMINAL,
    genId,
    num,
    defaultPerms,
    clampPerms,
    mergePerms,
    permsEqual,
    canSend,
    canControl,
    canConfirm,
    createOrder,
    cloneItem,
    itemSubtotal,
    itemTotal,
    totals,
    itemCount,
    nextStatus,
    canCancel,
    canTransition,
    availableActions,
    applyStatus,
    isVisible,
    findDraftItem,
    addDraftItem,
    setDraftQty,
    removeDraftItem,
    draftTotals,
    statusLabelKey,
    statusBadgeClass,
    isReceiverPeer,
    isSenderPeer
  };

  if (typeof window !== 'undefined') window.RestCore = RestCore;
  if (typeof module !== 'undefined' && module.exports) module.exports = RestCore;
})();