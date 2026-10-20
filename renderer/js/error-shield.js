// ============================================================
// ZMT Error Shield — renders instead of a blank (white) window.
// Captures any uncaught renderer exception or rejected promise and shows a
// readable, dismissible banner (Arabic) plus keeps a small ring buffer for
// support diagnostics. It is loaded FIRST in index.html so it also catches
// crashes during the init phase — the exact "صفحة بيضاء" class of bug.
//
// The shield NEVER throws: every path is guarded so it cannot hide the real
// problem, and it degrades to console-only if the DOM/localStorage is missing.
// ============================================================
(function () {
  if (window.__zmtErrorShield) return;
  window.__zmtErrorShield = true;

  var _ringKey = 'zmt_renderer_errors';
  var _ring = [];

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _loadRing() {
    try { _ring = JSON.parse(localStorage.getItem(_ringKey) || '[]'); } catch (e) { _ring = []; }
    if (!Array.isArray(_ring)) _ring = [];
  }

  function _saveRing() {
    try { localStorage.setItem(_ringKey, JSON.stringify(_ring.slice(-80))); } catch (e) {}
  }

  function _capture(kind, msg, source, lineno, colno, error) {
    var entry = {
      t: Date.now(),
      kind: kind,
      msg: String(msg || '').slice(0, 600),
      src: String(source || '').slice(0, 400),
      line: lineno || 0,
      col: colno || 0,
      stack: (error && error.stack) ? String(error.stack).slice(0, 1500) : '',
    };
    _ring.push(entry);
    _saveRing();
    try {
      console.error('[ErrorShield]', kind, msg || '', source || '', lineno || '',
        (error && error.stack) || '');
    } catch (e) {}
  }

  function _show(text) {
    try {
      if (document.getElementById('zmtErrorShield') || !document.body) return;
      var shield = document.createElement('div');
      shield.id = 'zmtErrorShield';
      shield.style.cssText =
        'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;' +
        'background:#3a0d0d;color:#ffd7d7;border:1px solid #ff6b6b;border-radius:10px;' +
        'padding:10px 14px;font-family:Consolas,monospace;font-size:12px;' +
        'direction:rtl;text-align:right;box-shadow:0 6px 24px rgba(0,0,0,.55);' +
        'max-height:170px;overflow:auto;opacity:.97';
      var head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px';
      var title = document.createElement('b');
      title.style.color = '#ff8f8f';
      title.textContent = 'خطأ في الواجهة — بياناتك سليمة. صحّح المشكلة ثم أعد الفتح، أو انسخ النص للدعم:';
      var close = document.createElement('span');
      close.textContent = '✕';
      close.style.cssText = 'cursor:pointer;color:#fff;font-weight:bold;margin-inline-start:auto';
      close.addEventListener('click', function () { shield.remove(); });
      head.appendChild(title);
      head.appendChild(close);
      var body = document.createElement('div');
      body.style.whiteSpace = 'pre-wrap';
      body.style.wordBreak = 'break-word';
      body.textContent = String(text).slice(0, 1600);
      shield.appendChild(head);
      shield.appendChild(body);
      document.body.appendChild(shield);
    } catch (e) { /* never throw inside the shield */ }
  }

  window.addEventListener('error', function (ev) {
    _capture('error', ev.message, ev.filename, ev.lineno, ev.colno, ev.error);
    _show(ev.message || 'خطأ غير معروف');
  }, true);

  window.addEventListener('unhandledrejection', function (ev) {
    var reason = (ev && ev.reason) || {};
    var msg;
    if (reason instanceof Error) msg = reason.message + (reason.stack ? ' — ' + reason.stack : '');
    else msg = String(reason);
    _capture('promise', msg, '', 0, 0, reason instanceof Error ? reason : null);
    _show(reason instanceof Error ? reason.message : String(reason));
  });

  // Support/diagnostic hook: window.__zmtErrorShieldRing() returns the buffer.
  window.__zmtErrorShieldRing = function () { return _ring.slice(); };
  _loadRing();
})();