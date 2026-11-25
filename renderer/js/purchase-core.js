// ============================================================================
// ZMT PIECE — SHARED PURCHASE CORE
// ============================================================================
// The single source of truth for purchase-invoice discounts and real cost.
//
//  • A purchase line may carry a product-level discount percentage.
//  • The invoice may carry a global discount, either a percentage or a fixed
//    DA amount. The global discount applies to every line AFTER the product
//    discount (multiplicative): 100 → 95 (5%) → 85.50 (10%).
//  • A fixed global amount is distributed proportionally over the lines; the
//    rounding remainder is always adjusted on the LAST line so the sum of the
//    allocated amounts is exactly the requested discount.
//
// compute(items, mode, value)  -> per-line real cost + invoice totals.
// productRealCost(product)     -> stored real buy price (batch cost).
// itemCost(line, product)      -> cost of a sale/purchase line.
//
// Nothing here touches the DOM, localStorage or the DB: the desktop pages and
// any other caller share exactly the same arithmetic.
// ============================================================================
(function (root) {
  'use strict';

  var EPS = 1e-9;

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function r2(v) {
    var n = num(v);
    return Math.round((n + (n >= 0 ? EPS : -EPS)) * 100) / 100;
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, num(v)));
  }

  function isAmountMode(mode) {
    return mode === 'amount' || mode === 'fixed' || mode === 'da';
  }

  function lineDiscountPct(it) {
    if (!it) return 0;
    var v = (it.purchaseDiscountPct !== undefined && it.purchaseDiscountPct !== null)
      ? it.purchaseDiscountPct
      : it.discountPct;
    return clamp(v, 0, 100);
  }

  function baseLine(it) {
    var qty = Math.max(0, num(it && it.qty));
    var buy = Math.max(0, num(it && it.buyPrice));
    var pct = lineDiscountPct(it);
    var gross = r2(qty * buy);
    var productDiscount = r2(gross * pct / 100);
    var afterProduct = r2(gross - productDiscount);
    return {
      qty: qty,
      buyPrice: buy,
      purchaseDiscountPct: pct,
      gross: gross,
      productDiscount: productDiscount,
      afterProduct: afterProduct,
    };
  }

  // --------------------------------------------------------------------------
  // compute(items, mode, value)
  //   items : [{ qty, buyPrice, purchaseDiscountPct }]
  //   mode  : 'percent' (default) | 'amount'
  //   value : discount percentage or fixed DA amount
  // --------------------------------------------------------------------------
  function compute(items, mode, value) {
    var src = Array.isArray(items) ? items : [];
    var lines = src.map(baseLine);
    var amountMode = isAmountMode(mode);

    var gross = r2(lines.reduce(function (s, l) { return s + l.gross; }, 0));
    var productDiscountAmount = r2(lines.reduce(function (s, l) { return s + l.productDiscount; }, 0));
    var subtotal = r2(lines.reduce(function (s, l) { return s + l.afterProduct; }, 0));

    var pct = amountMode ? 0 : clamp(value, 0, 100);
    var requested = amountMode ? r2(clamp(value, 0, subtotal)) : r2(subtotal * pct / 100);
    var alloc = lines.map(function () { return 0; });

    if (requested > 0 && subtotal > 0 && lines.length) {
      if (amountMode) {
        // Proportional distribution; the LAST line absorbs the rounding
        // remainder so the allocated total matches the requested amount.
        var running = 0;
        for (var i = 0; i < lines.length; i++) {
          if (i === lines.length - 1) {
            alloc[i] = r2(requested - running);
          } else {
            alloc[i] = r2(requested * (lines[i].afterProduct / subtotal));
            running = r2(running + alloc[i]);
          }
        }
        // Rounding can never make the last share negative; if it somehow does
        // (pathological rounding), shift the surplus to the first line.
        if (alloc[alloc.length - 1] < 0) {
          var deficit = -alloc[alloc.length - 1];
          alloc[alloc.length - 1] = 0;
          for (var k = 0; k < alloc.length - 1 && deficit > 0; k++) {
            var take = Math.min(alloc[k], deficit);
            alloc[k] = r2(alloc[k] - take);
            deficit = r2(deficit - take);
          }
        }
      } else {
        for (var j = 0; j < lines.length; j++) {
          alloc[j] = r2(lines[j].afterProduct * pct / 100);
        }
      }
    }

    var resultLines = lines.map(function (l, idx) {
      var disc = alloc[idx];
      var realTotal = r2(l.afterProduct - disc);
      var realBuyPrice = l.qty > 0 ? r2(realTotal / l.qty) : 0;
      return {
        index: idx,
        qty: l.qty,
        buyPrice: l.buyPrice,
        purchaseDiscountPct: l.purchaseDiscountPct,
        gross: l.gross,
        productDiscount: l.productDiscount,
        afterProduct: l.afterProduct,
        globalDiscount: disc,
        realTotal: realTotal,
        realBuyPrice: realBuyPrice,
      };
    });

    var globalDiscountAmount = r2(alloc.reduce(function (s, v) { return s + v; }, 0));
    var total = r2(resultLines.reduce(function (s, l) { return s + l.realTotal; }, 0));

    return {
      mode: amountMode ? 'amount' : 'percent',
      value: amountMode ? requested : pct,
      gross: gross,
      productDiscountAmount: productDiscountAmount,
      subtotal: subtotal,
      globalDiscountAmount: globalDiscountAmount,
      total: total,
      lines: resultLines,
    };
  }

  // --------------------------------------------------------------------------
  // Cost helpers
  // --------------------------------------------------------------------------

  // The stored batch cost. Falls back to the displayed buy price minus the
  // product-level discount for rows saved before this feature existed.
  function productRealCost(p) {
    if (!p) return 0;
    var stored = p.realBuyPrice;
    if (stored !== undefined && stored !== null && stored !== '') {
      var r = num(stored);
      if (r > 0) return r2(r);
    }
    var bp = num(p.buyPrice);
    var pct = clamp(p.purchaseDiscountPct, 0, 100);
    return r2(bp * (1 - pct / 100));
  }

  // Cost of an invoice line: the sale snapshot wins (it froze the cost at sale
  // time), then the purchase line's real cost, then the product's batch cost.
  function itemCost(line, product) {
    if (line) {
      var snap = num(line.costPrice);
      if (snap > 0) return r2(snap);
      var real = num(line.realBuyPrice);
      if (real > 0) return r2(real);
    }
    return productRealCost(product);
  }

  var api = {
    compute: compute,
    productRealCost: productRealCost,
    itemCost: itemCost,
    round2: r2,
    isAmountMode: isAmountMode,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PurchaseCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
