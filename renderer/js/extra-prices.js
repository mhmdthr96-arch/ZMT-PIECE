// ============================================================================
// ZMT PIECE — EXTRA SALE PRICE FIELDS (feature 3)
// ============================================================================
// The manager can declare up to 8 additional sale prices (e.g. «نصف جملة»,
// «سعر الجملة الكبيرة», «سعر خاص»). Each field has a name and a colour.
//
//   • The field list is global and lives in localStorage:
//         zmt_extra_price_fields = [{ id, name, color }, …]
//   • Each product stores its own values in  extraPrices = { [fieldId]: price }
//     so renaming or recolouring a field never touches the products.
//   • The sales cart cycles  قطعة → جملة → each extra price → قطعة, and every
//     extra field gets its own row in «نسبة البيع».
//
// Loaded at startup, before any lazily-loaded page script, so the inventory and
// sales pages can both use it even when they are the first page opened.
// ============================================================================
(function (root) {
  'use strict';

  var KEY = 'zmt_extra_price_fields';
  var MAX = 8;
  var COLORS = ['#6f42c1', '#0ea5e9', '#e11d48', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6'];

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function cleanColor(c, fallback) {
    var s = String(c || '').trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : (fallback || COLORS[0]);
  }

  function uid() {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalize(f, idx) {
    if (!f) return null;
    var name = String(f.name == null ? '' : f.name).trim();
    if (!name) return null;
    var id = String(f.id == null ? '' : f.id).trim();
    if (!id) id = uid();
    return { id: id, name: name, color: cleanColor(f.color, COLORS[idx % COLORS.length]) };
  }

  function fields() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { raw = []; }
    if (!Array.isArray(raw)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < raw.length && out.length < MAX; i++) {
      var f = normalize(raw[i], out.length);
      if (!f || seen[f.id]) continue;
      seen[f.id] = 1;
      out.push(f);
    }
    return out;
  }

  function saveFields(list) {
    var out = [];
    var seen = {};
    (Array.isArray(list) ? list : []).forEach(function (f) {
      if (out.length >= MAX) return;
      var n = normalize(f, out.length);
      if (!n || seen[n.id]) return;
      seen[n.id] = 1;
      out.push(n);
    });
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) {}
    return out;
  }

  function addField(name, color) {
    var list = fields();
    if (list.length >= MAX) return { ok: false, error: 'max', fields: list };
    var clean = String(name == null ? '' : name).trim();
    if (!clean) return { ok: false, error: 'name', fields: list };
    if (list.some(function (f) { return f.name === clean; })) {
      return { ok: false, error: 'duplicate', fields: list };
    }
    list.push({ id: uid(), name: clean, color: cleanColor(color, COLORS[list.length % COLORS.length]) });
    return { ok: true, fields: saveFields(list) };
  }

  function updateField(id, patch) {
    var list = fields();
    var hit = false;
    list = list.map(function (f) {
      if (f.id !== id) return f;
      hit = true;
      return {
        id: f.id,
        name: patch && patch.name != null ? String(patch.name).trim() || f.name : f.name,
        color: patch && patch.color != null ? cleanColor(patch.color, f.color) : f.color,
      };
    });
    if (!hit) return { ok: false, error: 'notfound', fields: list };
    return { ok: true, fields: saveFields(list) };
  }

  function removeField(id) {
    var list = fields().filter(function (f) { return f.id !== id; });
    return saveFields(list);
  }

  function fieldById(id) {
    var key = String(id == null ? '' : id);
    return fields().find(function (f) { return f.id === key; }) || null;
  }

  function priceOf(rec, id) {
    if (!rec || !rec.extraPrices || !id) return 0;
    return num(rec.extraPrices[id]);
  }

  // Remove empty values so a product never stores a field it no longer uses.
  function cleanPriceMap(map) {
    var out = {};
    if (!map || typeof map !== 'object') return out;
    Object.keys(map).forEach(function (id) {
      var v = num(map[id]);
      if (v > 0) out[id] = v;
    });
    return out;
  }

  // ---------------------------------------------------------------------
  // Form helpers. Inputs carry data-extra-scope so several forms can live in
  // the DOM at once (inventory add / direct add / edit) without cross-reading.
  // ---------------------------------------------------------------------
  function inputsHTML(scope, rec) {
    var list = fields();
    if (!list.length) return '';
    var pairs = list.map(function (f) {
      var v = priceOf(rec, f.id);
      return '<div class="form-group extra-price-field">' +
        '<label style="color:' + esc(f.color) + '"><i class="fas fa-tag"></i> ' + esc(f.name) + '</label>' +
        '<input type="text" class="form-input no-spinner num-input" inputmode="decimal" dir="ltr" min="0" ' +
        'data-extra-scope="' + esc(scope) + '" data-extra-price-id="' + esc(f.id) + '" ' +
        'value="' + (v ? esc(String(v)) : '0') + '">' +
      '</div>';
    }).join('');
    return '<div class="extra-price-grid">' + pairs + '</div>';
  }

  function readInputs(scope) {
    var out = {};
    if (typeof document === 'undefined') return out;
    var nodes = document.querySelectorAll('[data-extra-scope="' + String(scope).replace(/"/g, '\\"') + '"][data-extra-price-id]');
    Array.prototype.forEach.call(nodes, function (el) {
      var id = el.getAttribute('data-extra-price-id');
      var v = num(el.value);
      if (id && v > 0) out[id] = v;
    });
    return out;
  }

  function fillInputs(scope, rec) {
    if (typeof document === 'undefined') return;
    var nodes = document.querySelectorAll('[data-extra-scope="' + String(scope).replace(/"/g, '\\"') + '"][data-extra-price-id]');
    Array.prototype.forEach.call(nodes, function (el) {
      var id = el.getAttribute('data-extra-price-id');
      var v = priceOf(rec, id);
      el.value = v ? String(v) : '0';
    });
  }

  // Pill markup shared by the inventory and sales cards. Returns '' when the
  // product has no value for that field, so unused fields never clutter a card.
  function pillHTML(rec, field, extraClass) {
    var v = priceOf(rec, field && field.id);
    if (!v) return '';
    var color = cleanColor(field.color, COLORS[0]);
    return '<div class="price-pill price-extra ' + (extraClass || '') + '" ' +
      'style="background:' + color + '1a;color:' + color + ';border:1px solid ' + color + '40">' +
      '<span>' + esc(field.name) + '</span><b>DA' + (root.fmtMoney ? root.fmtMoney(v) : v.toFixed(2)) + '</b></div>';
  }

  var api = {
    KEY: KEY,
    MAX: MAX,
    COLORS: COLORS,
    fields: fields,
    saveFields: saveFields,
    addField: addField,
    updateField: updateField,
    removeField: removeField,
    fieldById: fieldById,
    priceOf: priceOf,
    cleanPriceMap: cleanPriceMap,
    inputsHTML: inputsHTML,
    readInputs: readInputs,
    fillInputs: fillInputs,
    pillHTML: pillHTML,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ExtraPrices = api;
})(typeof window !== 'undefined' ? window : globalThis);
