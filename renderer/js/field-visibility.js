/* ============================================================
   ZMT PIECE — Field Visibility (إظهار/إخفاء حقول)
   Per-device (localStorage) toggles for optional product fields:
   plu, discount, reference, country, mark, minPrice.
   Applied as body classes `fv-hide-<key>` so CSS (and JS) can react.
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'zmt_field_visibility';
  var FIELDS = ['plu', 'discount', 'reference', 'country', 'mark', 'minPrice'];
  var DEFAULTS = {};
  FIELDS.forEach(function (k) { DEFAULTS[k] = true; });

  function load() {
    var out = {};
    FIELDS.forEach(function (k) { out[k] = DEFAULTS[k]; });
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          FIELDS.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = (obj[k] !== false);
          });
        }
      }
    } catch (e) {}
    return out;
  }
  function save(cfg) {
    try { localStorage.setItem(KEY, JSON.stringify(cfg || load())); } catch (e) {}
  }
  function apply(cfg) {
    cfg = cfg || load();
    var body = document.body;
    if (!body) return;
    FIELDS.forEach(function (k) {
      if (cfg[k] === false) body.classList.add('fv-hide-' + k);
      else body.classList.remove('fv-hide-' + k);
    });
    // Sync toggle button colors (blue = visible, gray = hidden).
    try {
      var btns = document.querySelectorAll('[data-fv]');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        var key = b.getAttribute('data-fv');
        if (FIELDS.indexOf(key) < 0) continue;
        var on = (cfg[key] !== false);
        b.classList.toggle('fv-toggle-on', on);
        b.classList.toggle('fv-toggle-off', !on);
        b.style.background = on ? 'var(--bmw-blue-1)' : '#9aa0a6';
        b.style.color = '#fff';
        b.style.borderColor = on ? 'var(--bmw-blue-1)' : '#9aa0a6';
      }
    } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('zmt:field-visibility-changed', { detail: cfg })); } catch (e) {}
  }
  function isVisible(key) { return load()[key] !== false; }
  function toggle(key) {
    if (FIELDS.indexOf(key) < 0) return false;
    var cfg = load();
    cfg[key] = (cfg[key] === false);
    save(cfg);
    apply(cfg);
    return cfg[key];
  }
  function set(key, val) {
    if (FIELDS.indexOf(key) < 0) return false;
    var cfg = load();
    cfg[key] = !!val;
    save(cfg);
    apply(cfg);
    return cfg[key];
  }
  window.FV = { FIELDS: FIELDS, load: load, save: save, apply: apply, isVisible: isVisible, toggle: toggle, set: set };
  function init() { apply(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
