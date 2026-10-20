/* ============================================================
   ZMT PIECE — درج النقود (Cash drawer)
   ------------------------------------------------------------
   The cash drawer hangs off the printer's RJ11 kick port and opens
   only when the printer receives the raw ESC/POS pulse. That pulse
   cannot travel through webContents.print (which rasterises a page),
   so the low-level work lives in the main process (printer-net.js +
   the cash-drawer-* IPC channels) and this module is the one place
   the renderer calls it from:

     • after a confirmed sale  → CashDrawer.openFromSale()
     • the F12 shortcut        → CashDrawer.openManual()

   Both paths are non-blocking: a failure never holds up a sale, it
   only shows a short, dismissible toast. When the shop has turned on
   the optional fallback, a driver-printed page is attempted as a last
   resort. Nothing here touches the database, stock or LAN sync.
   ============================================================ */
(function () {
  'use strict';

  var busy = false;          // one open at a time (F12 spam guard)
  var toastTimer = 0;

  function T(key, fb) {
    try { var v = (typeof window.t === 'function') ? window.t(key) : ''; return v || fb; }
    catch (e) { return fb; }
  }

  function api() {
    return (window.electronAPI && window.electronAPI.cashDrawerOpen) ? window.electronAPI : null;
  }

  /* ---------- toast (short, non-blocking) ---------- */

  function toast(msg, kind) {
    var el = document.getElementById('cdToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cdToast';
      el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100060;' +
        'padding:11px 20px;border-radius:8px;font-size:13px;font-weight:700;color:#fff;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.25);transition:opacity .2s;direction:rtl;max-width:80vw;text-align:center';
      document.body.appendChild(el);
    }
    el.style.background = kind === 'err' ? '#e53935' : (kind === 'warn' ? '#e65100' : '#1a7f37');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, 2600);
  }

  /* ---------- optional driver-print fallback ---------- */

  // Off by default. A page is printed through the ordinary Windows driver;
  // because the driver's own init sequence often pulses the drawer, this can
  // open a drawer whose printer ignores our raw bytes. It wastes paper, so it
  // is only ever attempted when the shop explicitly asked for it.
  function fallbackPrint() {
    try {
      if (!window.electronAPI || !window.electronAPI.restPrint) return Promise.resolve(false);
      var label = T('drawer.title', 'درج النقود');
      var html = '<!doctype html><html dir="rtl"><head><meta charset="utf-8">' +
        '<style>@page{size:80mm auto;margin:2mm}body{font-family:Tahoma,sans-serif;text-align:center;color:#000;margin:0}' +
        '.k{font-size:34px;margin:18px 0 6px}</style></head><body><div class="k">' + label + '</div>' +
        '<div style="font-size:12px;color:#444">.</div></body></html>';
      // A tiny payload: some drivers pulse the drawer on any job's start.
      return window.electronAPI.restPrint({ bodyHtml: html, paperWidth: 80, copies: 1 })
        .then(function (r) { return !!(r && r.success); })
        .catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /* ---------- public API ---------- */

  // Manual open (F12): always allowed, even when auto-open is switched off.
  function openManual() {
    return open({ source: 'manual', quiet: false });
  }

  // After a confirmed sale: silent, never blocks the cashier.
  function openFromSale() {
    return open({ source: 'sale', quiet: true });
  }

  function open(opts) {
    opts = opts || {};
    var bridge = api();
    if (!bridge) return Promise.resolve({ ok: false, error: 'NO_ELECTRON' });
    if (busy) return Promise.resolve({ ok: false, error: 'BUSY' });
    busy = true;

    return bridge.cashDrawerOpen({ source: opts.source || 'manual' })
      .then(function (res) {
        busy = false;
        if (res && res.success) {
          if (!opts.quiet) toast(T('drawer.openedShort', 'تم فتح الدرج'), 'ok');
          return { ok: true };
        }
        // Auto mode is off → do not nag the cashier on every sale.
        if (res && res.skipped) return { ok: false, skipped: true };

        var reason = (res && res.errorAr) || '';

        // Optional, off-by-default last resort.
        return readCfg().then(function (cfg) {
          if (!cfg || !cfg.fallbackPrint) {
            if (!opts.quiet) toast(T('drawer.toastFail', 'تعذّر فتح درج النقود') + (reason ? ' — ' + reason : ''), 'err');
            return { ok: false, error: (res && res.error) || 'FAILED' };
          }
          return fallbackPrint().then(function (done) {
            if (done) {
              if (!opts.quiet) toast(T('drawer.fallbackTried', 'تم إرسال صفحة عبر مشغّل الطباعة لفتح الدرج'), 'warn');
              return { ok: true, viaFallback: true };
            }
            if (!opts.quiet) toast(T('drawer.toastFail', 'تعذّر فتح درج النقود') + (reason ? ' — ' + reason : ''), 'err');
            return { ok: false, error: (res && res.error) || 'FAILED' };
          });
        });
      })
      .catch(function (e) {
        busy = false;
        if (!opts.quiet) toast(T('drawer.toastFail', 'تعذّر فتح درج النقود'), 'err');
        return { ok: false, error: (e && e.message) || 'ERROR' };
      });
  }

  function readCfg() {
    try {
      if (!window.electronAPI || !window.electronAPI.cashDrawerGet) return Promise.resolve(null);
      return window.electronAPI.cashDrawerGet().then(function (r) {
        return (r && r.success && r.data) ? r.data : null;
      }).catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  // Is the feature usable at all on this machine (bridge present)?
  function isAvailable() {
    return !!api();
  }

  // The main process intercepts F12 and forwards it here (see main.js). This is
  // the primary path; shortcuts.js keeps a DOM listener as the safety net.
  function bindHotkey() {
    try {
      if (window.electronAPI && window.electronAPI.onCashDrawerHotkey) {
        window.electronAPI.onCashDrawerHotkey(function () { openManual(); });
      }
    } catch (e) {}
  }
  bindHotkey();

  window.CashDrawer = {
    open: open,
    openManual: openManual,
    openFromSale: openFromSale,
    isAvailable: isAvailable,
    toast: toast,
  };
})();
