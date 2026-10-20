// ============================================================================
// ZMT PIECE — PHONE SCANNER PWA (runs in the phone's browser, served over HTTPS)
// ============================================================================
// Flow:
//   1. Generate a stable deviceId + friendly deviceName from the browser's
//      storage so reconnecting a "Always approved" phone is frictionless.
//   2. POST /api/pair to the local ZMT server. If this phone is already
//      approved the server returns a token immediately; otherwise it parks the
//      request until the operator approves/refuses in the desktop app.
//   3. On an approved token, open a WSS /ws connection and authenticate.
//   4. Use the phone camera + ZXing to decode barcodes, buffer slow reads, de-
//      duplicate repeats, and forward { type:'scan', code } over the socket.
// ============================================================================

(function () {
  'use strict';

  var deviceId = localStorage.getItem('zmt_ph_device_id') || (function () {
    var id = 'ph-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36);
    localStorage.setItem('zmt_ph_device_id', id);
    return id;
  })();
  var deviceName = (function () {
    // Best-effort friendly name; the user can rename inside the desktop app.
    var n = localStorage.getItem('zmt_ph_device_name');
    return (n && n.trim()) ? n.trim() : 'Phone Scanner';
  })();

  var els = {
    dot: document.getElementById('connDot'),
    label: document.getElementById('connLabel'),
    sub: document.getElementById('connSub'),
    bootLogo: document.getElementById('bootLogo'),
    video: document.getElementById('video'),
    videoWrap: document.getElementById('videoWrap'),
    scanline: document.getElementById('scanline'),
    status: document.getElementById('statusText'),
    pairing: document.getElementById('pairing'),
    pairName: document.getElementById('pairName'),
    history: document.getElementById('history'),
    retry: document.getElementById('retryBtn'),
    install: document.getElementById('installBtn'),
    iosHint: document.getElementById('iosHint'),
  };

  var ws = null;
  var wsReady = false;
  var token = null;
  var heartbeat = null;
  var lastSentCode = '';
  var lastSentAt = 0;

  // ---- status + feedback ----------------------------------------------------

  function setStatus(text, cls) {
    els.status.textContent = text || '';
    els.status.className = 'status' + (cls ? ' ' + cls : '');
  }

  function setConn(ok, sub) {
    els.dot.className = 'dot' + (ok ? ' ok' : '');
    els.sub.textContent = sub || '';
  }

  function addHistory(code) {
    var now = new Date();
    var item = document.createElement('div');
    item.className = 'h-item';
    var time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    item.innerHTML = '<span class="tick">&#10003;</span><span class="code"></span><span class="time">' + time + '</span>';
    item.querySelector('.code').textContent = code;
    els.history.prepend(item);
    while (els.history.childNodes.length > 12) els.history.removeChild(els.history.lastChild);
  }

  // ---- WebSocket ------------------------------------------------------------

  function closeWS() {
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    wsReady = false;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  }

  function startHeartbeat() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(function () {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {}
      }
    }, 20000);
  }

  function sendScan(code) {
    if (!wsReady || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (!code) return;
    // De-duplicate a very fast re-read of the same code within 800ms.
    var now = Date.now();
    if (code === lastSentCode && (now - lastSentAt) < 800) return;
    lastSentCode = code;
    lastSentAt = now;
    try {
      ws.send(JSON.stringify({ type: 'scan', code: code }));
      addHistory(code);
    } catch (e) {}
  }

  function connectWS() {
    closeWS();
    if (!token) return;
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    var url = proto + location.host + '/ws';
    try {
      ws = new WebSocket(url);
    } catch (e) {
      setStatus('Socket error — restarting', 'error');
      setTimeout(connectWS, 2000);
      return;
    }
    ws.onopen = function () {
      try { ws.send(JSON.stringify({ type: 'auth', token: token })); } catch (e) {}
    };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg) return;
      if (msg.type === 'auth') {
        if (msg.ok) {
          wsReady = true;
          startHeartbeat();
          setConn(true, 'online');
          setStatus('Scanner ready — point at a barcode', 'ok');
          startCamera();
        } else {
          wsReady = false;
          setStatus('Session rejected — tap Retry', 'error');
          els.retry.style.display = '';
        }
      } else if (msg.type === 'unpaired') {
        // The operator revoked this phone; clear the persistent token so the
        // next connect goes through the approval modal again.
        localStorage.removeItem('zmt_ph_token');
        token = null;
        closeWS();
        setStatus('Device unpaired — tap Retry to re-pair', 'error');
        els.retry.style.display = '';
      }
    };
    ws.onclose = function () { wsReady = false; setConn(false, 'offline'); };
    ws.onerror = function () { /* handled by close */ };
  }

  // ---- pairing ---------------------------------------------------------------

  function pair() {
    els.pairing.style.display = '';
    els.pairName.textContent = deviceName;
    setStatus('Pairing with ZMT PIECE…');
    fetch('/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId, deviceName: deviceName }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      els.pairing.style.display = 'none';
      if (res && (res.status === 'approved') && res.token) {
        token = res.token;
        localStorage.setItem('zmt_ph_token', token);
        connectWS();
      } else if (res && res.status === 'timeout') {
        setStatus('Approval timed out — tap Retry', 'error');
        els.retry.style.display = '';
      } else {
        setStatus('Denied by operator — tap Retry', 'error');
        els.retry.style.display = '';
      }
    }).catch(function (e) {
      els.pairing.style.display = 'none';
      setStatus('Cannot reach server — ' + e.message, 'error');
      els.retry.style.display = '';
    });
  }

  // ---- camera + barcode decode (ZXing) ---------------------------------------

  var cameraActive = false;
  var decoder = null;
  var frameCount = 0;

  function startCamera() {
    if (cameraActive) return;
    cameraActive = true;
    if (els.retry.style.display) els.retry.style.display = 'none';

    if (window.ZXing && window.ZXing.BrowserBarcodeReader) {
      try {
        decoder = new ZXing.BrowserBarcodeReader(window.ZXing.BarcodeFormat);
        decoder.decodeFromVideoDevice(undefined, 'video', function (result, err, controls) {
          if (result && result.text) {
            sendScan(String(result.text).trim());
          }
          frameCount++;
        }).then(function (controls) {
          els.bootLogo.style.display = 'none';
        }).catch(function (e) {
          cameraActive = false;
          setStatus('Camera unavailable — ' + (e.message || 'permission denied'), 'error');
          els.retry.style.display = '';
        });
        return;
      } catch (e) {
        /* fall through to manual hacks below */
      }
    }

    // Fallback: use getUserMedia directly (old bundler or camera variants).
    els.bootLogo.style.display = 'none';
    var video = els.video;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Camera not supported', 'error');
      els.retry.style.display = '';
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
      video.srcObject = stream;
      els.scanline.classList.add('active');
      video.setAttribute('playsinline', '');
      var stopped = false;
      var running = true;
      function tick() {
        if (!running || stopped) return;
        if (video.readyState >= 2) {
          try {
            var cv = window.document.createElement('canvas');
            cv.width = video.videoWidth; cv.height = video.videoHeight;
            cv.getContext('2d').drawImage(video, 0, 0);
            var res = window.decodeBarcodeFromCanvas(cv);
            if (res) sendScan(String(res).trim());
          } catch (e) {}
        }
        requestAnimationFrame(tick);
      }
      tick();
    }).catch(function (e) {
      cameraActive = false;
      setStatus('Camera permission denied', 'error');
      els.retry.style.display = '';
    });
  }

  // ---- install as PWA ---------------------------------------------------------

  // true once the app runs from the home-screen icon (standalone mode).
  function isInstalled() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function setupInstall() {
    if (isInstalled()) return;
    const ua = (navigator.userAgent || '').toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) && !window.MSStream;

    if (isIos) {
      // No beforeinstallprompt on iOS — show how-to text pointing to the
      // browser's Share → "Add to Home Screen".
      els.install.style.display = '';
      els.install.onclick = function () { els.iosHint.style.display = ''; };
      return;
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      window.__installPrompt = e;
      els.install.style.display = '';
      els.install.onclick = function () {
        var p = window.__installPrompt;
        if (!p) return;
        p.prompt();
        p.userChoice.then(function () {
          els.install.style.display = 'none';
        }).catch(function () {});
      };
    });

    // If a PWA is already installed in Chrome Android this still fires, but the
    // lifecycle event keeps hiding the button; guard against double prompting.
    window.addEventListener('appinstalled', function () { els.install.style.display = 'none'; });
  }

  // ---- boot -------------------------------------------------------------------

  function boot() {
    setupInstall();
    els.retry.onclick = function () {
      els.retry.style.display = 'none';
      setStatus('Retrying…');
      var storedToken = localStorage.getItem('zmt_ph_token');
      if (storedToken) {
        token = storedToken;
        connectWS();
      } else {
        pair();
      }
    };
    setConn(false, 'offline');
    var storedToken = localStorage.getItem('zmt_ph_token');
    if (storedToken) {
      // Try straight to the socket with the persisted token; if the server
      // no longer knows it, the auth response (or error) will fall back to
      // pairing via Retry.
      token = storedToken;
      connectWS();
      // After a short grace, if the socket never reached "ready", offer retry.
      setTimeout(function () {
        if (!wsReady) setStatus('Not connected — tap Retry', 'error');
      }, 8000);
    } else {
      pair();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.__phs = { deviceId: deviceId, deviceName: deviceName };
})();