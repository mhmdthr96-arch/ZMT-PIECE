// ============================================================================
// ZMT PIECE — SHARED SCALE BARCODE CORE
// ============================================================================
// A weighing scale prints its own in-store code: a prefix, the product's internal
// number (PLU), and the weight, the unit price or the amount printed on the
// label. Shops run different scales and every one of those positions moves, so
// nothing is hard-coded: a PATTERN describes one label layout and the shop picks
// or edits the patterns that match the machine on the counter.
//
// The money rule is fixed by the owner: the AMOUNT PRINTED ON THE LABEL wins, and
// the quantity is derived from it when the label carries no weight.
//
// decode() and normalizeConfig() are pure — no DB, no document, no localStorage —
// so the sales page, the returns paths, the settings preview and the Node tests
// all resolve a code the same way.
// ============================================================================
'use strict';

const ScaleCore = (() => {

  const META_KEY = 'scale_barcode_cfg';

  // Digits only: a scale code is digits, and anything else (spaces the cashier
  // typed, bidi junk from a keyboard layout) must not break a position.
  function digitsOf(raw) {
    return String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
  }

  // A prefix may contain '*' for "any digit" — that is how the in-store families
  // are specified (2* = 20..29, 9* = 90..99).
  function matchPrefix(digits, prefix) {
    const p = String(prefix || '');
    if (!p) return false;
    if (digits.length < p.length) return false;
    for (let i = 0; i < p.length; i++) {
      const c = p.charAt(i);
      if (c === '*') continue;
      if (digits.charAt(i) !== c) return false;
    }
    return true;
  }

  // ---- EAN check digits -----------------------------------------------------
  // EAN-13: the 12 body digits weighted 1,3,1,3… from the left.
  function ean13Check(d12) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += (d12.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10;
  }

  // EAN-8: the 7 body digits weighted 3,1,3,1… from the left.
  function ean8Check(d7) {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += (d7.charCodeAt(i) - 48) * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10;
  }

  function checkDigitFor(digits) {
    if (digits.length === 13) return ean13Check(digits.slice(0, 12));
    if (digits.length === 8) return ean8Check(digits.slice(0, 7));
    return null;
  }

  // ---- one numeric field of the label ---------------------------------------
  // The scale prints an integer with the decimal point implied: 00250 with
  // decimals 3 is 0.250 kg.
  function fieldValue(digits, f) {
    if (!f || !f.len) return null;
    const s = digits.substr(f.start, f.len);
    if (s.length !== f.len) return null;
    const dec = Math.max(0, Number(f.decimals) || 0);
    return Number(s) / Math.pow(10, dec);
  }

  // ---- the layouts a shop can start from ------------------------------------
  // Positions follow the code the scale prints: prefix, PLU, value, check digit.
  // Every one of these is editable in the settings window, and the shop can add
  // as many custom patterns as its scales need.
  const PRESETS = [
    {
      id: 'e13-21-weight', key: 'scale.preset21Weight',
      prefix: '21', digits: 13, plu: { start: 2, len: 5 },
      weight: { start: 7, len: 5, decimals: 3 }, check: true,
    },
    {
      id: 'e13-22-unit', key: 'scale.preset22Unit',
      prefix: '22', digits: 13, plu: { start: 2, len: 5 },
      price: { start: 7, len: 5, decimals: 2 }, check: true,
    },
    {
      id: 'e13-23-amount', key: 'scale.preset23Amount',
      prefix: '23', digits: 13, plu: { start: 2, len: 5 },
      amount: { start: 7, len: 5, decimals: 2 }, check: true,
    },
    {
      id: 'e13-24-count', key: 'scale.preset24Count',
      prefix: '24', digits: 13, plu: { start: 2, len: 5 },
      weight: { start: 7, len: 5, decimals: 0 }, check: true,
    },
    // Scales that pick another digit inside the 2x family for the weight field.
    {
      id: 'e13-2x-weight', key: 'scale.preset2xWeight',
      prefix: '2*', digits: 13, plu: { start: 2, len: 5 },
      weight: { start: 7, len: 5, decimals: 3 }, check: true,
    },
    // The 9x family (non-food weight codes) with the same shape.
    {
      id: 'e13-9x-weight', key: 'scale.preset9xWeight',
      prefix: '9*', digits: 13, plu: { start: 2, len: 5 },
      weight: { start: 7, len: 5, decimals: 3 }, check: true,
    },
    // 12-digit codes with no check digit at all (some counter scales).
    {
      id: 'ean12-21-weight', key: 'scale.preset12Weight',
      prefix: '21', digits: 12, plu: { start: 2, len: 4 },
      weight: { start: 6, len: 6, decimals: 3 }, check: false,
    },
  ];

  function defaultConfig() {
    return {
      enabled: false,
      // A code whose check digit does not add up is not a code from this scale.
      rejectBadCheck: true,
      patterns: PRESETS.map((p, i) => Object.assign({}, p, { enabled: i < 4 })),
    };
  }

  // ---- validation -----------------------------------------------------------
  // A pattern is usable only when every field sits inside the code and no two
  // fields share a position: an overlapping layout would silently read a weight
  // out of the PLU. A layout may carry only some of the fields — a 23 label
  // prints money and nothing else — so an absent field is not an error.
  function validatePattern(p, digits) {
    const spans = [];
    const push = (name, f) => {
      if (!f || !f.len) return true;
      const start = Math.max(0, Number(f.start) || 0);
      const len = Number(f.len) || 0;
      if (len <= 0) return;
      if (start + len > digits) { p._error = 'scale.errRange'; return false; }
      spans.push({ name, start, end: start + len });
      return true;
    };
    const prefixLen = String(p.prefix || '').length;
    if (!prefixLen) return false;
    if (!push('plu', p.plu)) return false;
    const fields = ['weight', 'price', 'amount'];
    for (const k of fields) {
      if (!push(k, p[k])) return false;
    }
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        if (spans[i].start < spans[j].end && spans[j].start < spans[i].end) {
          p._error = 'scale.errOverlap';
          return false;
        }
      }
    }
    // The prefix owns the first positions; a field must not start inside it.
    for (const s of spans) {
      if (s.start < prefixLen) { p._error = 'scale.errPrefix'; return false; }
    }
    return true;
  }

  const clampInt = (v, lo, hi, dflt) => {
    const n = Math.floor(Number(v));
    if (!isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  };

  // Keeps a stored config trustworthy: unknown shapes are dropped, numbers are
  // clamped to what a 8/12/13-digit code can actually hold.
  function normalizeConfig(cfg) {
    const out = {
      enabled: !!(cfg && cfg.enabled),
      rejectBadCheck: !(cfg && cfg.rejectBadCheck === false),
      patterns: [],
    };
    const list = (cfg && Array.isArray(cfg.patterns)) ? cfg.patterns : [];
    for (const raw of list) {
      if (!raw || !raw.id) continue;
      const digits = clampInt(raw.digits, 8, 13, 13);
      const p = {
        id: String(raw.id),
        key: raw.key ? String(raw.key) : undefined,
        label: raw.label ? String(raw.label) : '',
        prefix: String(raw.prefix || '').slice(0, 4).replace(/[^0-9*]/g, ''),
        digits,
        plu: null, weight: null, price: null, amount: null,
        check: raw.check !== false,
        enabled: raw.enabled !== false,
      };
      const field = (f) => {
        if (!f || !Number(f.len)) return null;
        return {
          start: clampInt(f.start, 0, digits - 1, 0),
          len: clampInt(f.len, 1, digits, 1),
          decimals: clampInt(f.decimals, 0, 4, 0),
        };
      };
      p.plu = field(raw.plu);
      p.weight = field(raw.weight);
      p.price = field(raw.price);
      p.amount = field(raw.amount);
      if (!p.prefix) continue;
      if (!validatePattern(p, digits)) continue;
      out.patterns.push(p);
    }
    if (!out.patterns.length) out.patterns = defaultConfig().patterns;
    return out;
  }

  // ---- decoding -------------------------------------------------------------
  // Returns the facts the label carries plus the quantity the app will sell:
  //   amount on the label  -> authoritative money (owner rule)
  //   weight on the label  -> that quantity
  //   no weight            -> quantity derived from the amount and the price
  // `qty` stays null when the only price available is on the product card, which
  // the caller knows and the decoder does not; the caller finishes the job with
  // resolve().
  function decode(raw, cfg) {
    const conf = normalizeConfig(cfg);
    if (!conf.enabled) return null;
    const digits = digitsOf(raw);
    if (!digits) return null;
    for (const p of conf.patterns) {
      if (!p.enabled) continue;
      if (digits.length !== p.digits) continue;
      if (!matchPrefix(digits, p.prefix)) continue;

      let checkOk = true;
      if (p.check) {
        const expect = checkDigitFor(digits);
        if (expect !== null) {
          checkOk = Number(digits.charAt(digits.length - 1)) === expect;
          if (!checkOk && conf.rejectBadCheck) continue;
        }
      }

      const weight = fieldValue(digits, p.weight);
      const unitPrice = fieldValue(digits, p.price);
      const amount = fieldValue(digits, p.amount);
      if (weight == null && unitPrice == null && amount == null) continue;

      const plu = p.plu ? digits.substr(p.plu.start, p.plu.len) : '';
      return {
        patternId: p.id,
        plu,
        weight,
        unitPrice,
        amount,
        checkOk,
        // The scale prints 00250 and the shop's layout says it means 0.250:
        // that place-count is how the cashier and the invoice must read it back.
        weightDecimals: p.weight ? Math.max(0, Number(p.weight.decimals) || 0) : null,
        // What the label alone already decides.
        qtyFromLabel: weight != null ? weight
          : (amount != null && unitPrice != null && unitPrice > 0 ? amount / unitPrice : null),
        amountFromLabel: amount != null ? amount
          : (unitPrice != null && weight != null ? unitPrice * weight : null),
        code: digits,
      };
    }
    return null;
  }

  // Finishes what the label started, with the product card in hand:
  //   price  — the label amount is authority, so the line price is amount ÷ qty
  //            whenever the label printed an amount; otherwise the label's unit
  //            price, otherwise the card's selling price.
  //   qty    — the label weight, or the amount ÷ the price that produced it.
  // A zero quantity on the label is not a sale: the caller must refuse it.
  function resolve(decoded, cardPrice) {
    if (!decoded) return null;
    const card = Math.max(0, Number(cardPrice) || 0);
    const labelAmount = decoded.amountFromLabel != null ? decoded.amountFromLabel : null;
    const labelPrice = decoded.unitPrice != null ? decoded.unitPrice : null;

    let qty = decoded.qtyFromLabel != null ? decoded.qtyFromLabel : null;
    let price = null;
    let total = null;

    if (qty != null && qty > 0) {
      if (labelAmount != null) { total = labelAmount; price = labelAmount / qty; }
      else if (labelPrice != null) { price = labelPrice; total = labelPrice * qty; }
      else { price = card; total = card * qty; }
    } else if (labelAmount != null && labelAmount > 0) {
      // Only the money is on the label: derive the quantity from a price.
      const base = labelPrice != null && labelPrice > 0 ? labelPrice : card;
      if (base > 0) { qty = labelAmount / base; price = base; total = labelAmount; }
    }

    if (!(qty > 0)) return null;
    return {
      qty,
      price,
      total,
      // The owner rule made the money, not the card: reports must be able to say
      // which number came off the label.
      amountFromLabel: labelAmount != null,
      // Only a printed weight keeps the label's place-count (0.250 kg); a
      // quantity derived from money is a computed number and stays as it is.
      qtyDecimals: decoded.weight != null ? decoded.weightDecimals : null,
      plu: decoded.plu,
      patternId: decoded.patternId,
      checkOk: decoded.checkOk,
    };
  }

  // A stored meta record is only a wish: whatever is missing, clamped or broken
  // falls back to a config decode() can trust.
  function configFromMeta(raw) {
    return normalizeConfig(raw && raw.patterns ? raw : defaultConfig());
  }

  // ---- PLU keys -------------------------------------------------------------
  // PLUs are printed with leading zeros ("00123") and typed without ("123"), and
  // both must reach the same card.
  function pluKey(v) {
    const d = digitsOf(v);
    if (!d) return '';
    return d.replace(/^0+/, '') || '0';
  }

  function pluMatches(stored, wanted) {
    const a = digitsOf(stored), b = digitsOf(wanted);
    if (!a || !b) return false;
    if (a === b) return true;
    return pluKey(a) === pluKey(b);
  }

  return {
    META_KEY,
    PRESETS,
    defaultConfig,
    normalizeConfig,
    configFromMeta,
    validatePattern,
    decode,
    resolve,
    digitsOf,
    pluKey,
    pluMatches,
    ean13Check,
    ean8Check,
    checkDigitFor,
    matchPrefix,
  };
})();

if (typeof window !== 'undefined') window.ScaleCore = ScaleCore;
if (typeof module !== 'undefined' && module.exports) module.exports = ScaleCore;
