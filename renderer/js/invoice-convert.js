// ============================================================================
// ZMT PIECE — SALE INVOICE → CUSTOMER CONVERSION CORE
// ============================================================================
// A walk-in sale is stored as a normal sale invoice with customerId:null and
// its cash payment rows carry no customerId. Converting it is a pure
// re-attribution of that SAME invoice (no new invoice, no stock movement):
//
//   walk-in  → the whole totalAmount is registered on the customer's balance
//              and the cash already recorded on the anonymous sale is
//              cancelled (the operator sees and confirms the exact amount).
//   reassign → an invoice already linked to a customer moves to another one:
//              the money already paid stays paid, only the outstanding
//              remainder follows the invoice (old −= remaining, new += remaining).
//
// The DB writes, confirmations and UI live in pages/invoices.js; everything
// arithmetic (and every rule) lives here so it can be unit-tested.
// ============================================================================
(function (root) {
  'use strict';

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function r2(v) {
    var n = num(v);
    return Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
  }

  // Errors surfaced to the operator:
  //   not_sale | provisional | has_returns | no_customer | same_customer | zero_total
  function plan(input) {
    var inp = input || {};
    if (inp.type !== 'customer') return { ok: false, error: 'not_sale' };
    if (inp.isProvisional) return { ok: false, error: 'provisional' };
    if (inp.hasReturns) return { ok: false, error: 'has_returns' };

    var target = inp.targetCustomerId ? String(inp.targetCustomerId) : '';
    if (!target) return { ok: false, error: 'no_customer' };

    var current = inp.currentCustomerId ? String(inp.currentCustomerId) : '';
    if (current && current === target) return { ok: false, error: 'same_customer' };

    var total = Math.max(0, r2(inp.totalAmount));
    if (total <= 0) return { ok: false, error: 'zero_total' };

    var recordedCash = Math.max(0, r2(inp.recordedCash));
    var creditUsed = Math.max(0, r2(inp.creditUsed));
    var effectivePaid = Math.max(0, r2(
      (inp.effectivePaid !== undefined && inp.effectivePaid !== null)
        ? inp.effectivePaid
        : recordedCash + creditUsed
    ));

    if (!current) {
      // Walk-in: full amount on the customer's account, anonymous cash cancelled.
      return {
        ok: true,
        mode: 'walkin',
        total: total,
        recordedCash: recordedCash,
        effectivePaid: effectivePaid,
        appliedPaid: 0,
        cancelledCash: recordedCash,
        cancelPayments: recordedCash > 0,
        retagPayments: false,
        newCustomerDelta: total,
        oldCustomerDelta: 0,
        newRemaining: total
      };
    }

    // Reassignment: paid money stays attached to the invoice, only the debt moves.
    var paid = Math.min(total, effectivePaid);
    var remaining = r2(Math.max(0, total - paid));
    return {
      ok: true,
      mode: 'reassign',
      total: total,
      recordedCash: recordedCash,
      effectivePaid: effectivePaid,
      appliedPaid: paid,
      cancelledCash: 0,
      cancelPayments: false,
      retagPayments: recordedCash > 0,
      newCustomerDelta: remaining,
      oldCustomerDelta: -remaining,
      newRemaining: remaining
    };
  }

  var api = { plan: plan, round2: r2 };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ConvertCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
