/* ============================================================
   ZMT PIECE — price-display (شاشة عرض سعر السلع)
   ------------------------------------------------------------
   Full-screen customer stage:
     • store logo + store name (top)
     • local videos played back-to-back, looping forever
     • barcode scan  -> video pauses -> retail price for 3 s
     • white ticker footer with ZMT SOFTWARE contact info
     • lock button / Ctrl+Shift+P exits via the manager PIN
   ============================================================ */
(function () {
  'use strict';

  const PD_STORE_KEY = 'zmt_pd_settings';
  const PRICE_MS = 3000;
  const SCAN_GAP = 120;

  let cfg = null;
  let media = [];
  let mIdx = 0;
  let imageTimer = 0;
  let priceTimer = 0;
  let buf = '';
  let bufTimer = 0;
  let dialogOpen = false;
  let onPage = false;
  let lastCode = '';
  let lastCodeAt = 0;

  // ---- helpers -------------------------------------------------------
  function pdDefaults() {
    return {
      enabled: false,
      media: [],
      videos: [],
      logoPath: '',
      bg: '#0b1220',
      priceColor: '#ffd400',
      nameColor: '#ffffff',
      nameSize: 64,
      priceSize: 160,
      fontFamily: '',
      tickerOn: true,
      tickerPhone: '07.72.36.36.29',
      tickerMail: 'zmtsouftware@gmail.com',
      autoLogin: { enabled: false, code: '', username: '', password: '' },
      lockPin: ''
    };
  }

  function pdLoad() {
    let raw = '';
    try { raw = localStorage.getItem(PD_STORE_KEY) || ''; } catch (e) { raw = ''; }
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
    const d = pdDefaults();
    if (parsed && typeof parsed === 'object') {
      Object.keys(d).forEach(function (k) {
        if (typeof parsed[k] !== 'undefined' && typeof parsed[k] === typeof d[k]) d[k] = parsed[k];
      });
      if (!d.autoLogin || typeof d.autoLogin !== 'object') d.autoLogin = pdDefaults().autoLogin;
    }
    return d;
  }

  function fileUrl(p) {
    if (!p) return '';
    let s = String(p).replace(/\\/g, '/');
    if (!/^https?:|^file:|^data:/i.test(s)) {
      if (!/^\//.test(s)) s = '/' + s;
      s = 'file://' + s;
    }
    try { return encodeURI(s); } catch (e) { return s; }
  }

  function money(n) {
    const v = isFinite(n) ? Number(n) : 0;
    if (typeof window.fmtMoney === 'function') {
      try { return window.fmtMoney(v); } catch (e) { /* fall through */ }
    }
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }

  function storeName() {
    let n = '';
    try { if (typeof Auth !== 'undefined' && Auth.getStoreName) n = Auth.getStoreName(); } catch (e) {}
    if (!n) { try { n = localStorage.getItem('zmt_store_name') || ''; } catch (e) { n = ''; } }
    return n || 'ZMT PIECE';
  }

  // ---- appearance ----------------------------------------------------
  function applyLook() {
    const stage = document.getElementById('pdStage');
    if (!stage) return;
    const root = document.documentElement;
    root.style.setProperty('--pd-bg', cfg.bg || '#0b1220');
    root.style.setProperty('--pd-price-color', cfg.priceColor || '#ffd400');
    root.style.setProperty('--pd-name-color', cfg.nameColor || '#ffffff');
    root.style.setProperty('--pd-name-size', (Number(cfg.nameSize) || 64) + 'px');
    root.style.setProperty('--pd-price-size', (Number(cfg.priceSize) || 160) + 'px');
    if (cfg.fontFamily) root.style.setProperty('--pd-font', cfg.fontFamily);

    const nm = storeName();
    const nameEl = document.getElementById('pdStoreName');
    const priceStore = document.getElementById('pdPriceStore');
    if (nameEl) nameEl.textContent = nm;
    if (priceStore) priceStore.textContent = nm;

    const logo = document.getElementById('pdLogo');
    const plogo = document.getElementById('pdPriceLogo');
    const hasLogo = !!cfg.logoPath;
    [logo, plogo].forEach(function (el) {
      if (!el) return;
      if (hasLogo) { el.src = fileUrl(cfg.logoPath); el.style.display = ''; }
      else { el.removeAttribute('src'); el.style.display = 'none'; }
    });

    const footer = document.getElementById('pdFooter');
    if (footer) footer.style.display = cfg.tickerOn === false ? 'none' : '';
    const ph = document.getElementById('pdTickerPhone');
    const ml = document.getElementById('pdTickerMail');
    if (ph) ph.textContent = cfg.tickerPhone || '07.72.36.36.29';
    if (ml) ml.textContent = cfg.tickerMail || 'zmtsouftware@gmail.com';

    const track = document.getElementById('pdTickerTrack');
    if (track) track.classList.toggle('no-anim', !!cfg.tickerNoAnim);
  }

  // ---- media playlist (images + video, one ordered list) --------------
  // Each item: { id, name, path, type: 'image' | 'video', duration }.
  // Images stay on screen for their own `duration` (seconds); a video plays its
  // full length and then the next item starts. When the list ends it restarts.
  const IMG_DEFAULT_SECONDS = 5;

  // Older builds stored only `videos` — migrate them in place so an existing
  // installation keeps playing without the user re-adding anything.
  function normalizeMedia(c) {
    if (Array.isArray(c.media) && c.media.length) return c.media;
    const legacy = Array.isArray(c.videos) ? c.videos : [];
    return legacy.map(function (v, i) {
      return {
        id: v.id || ('m' + i),
        name: v.name || String(v.path || '').split(/[\\/]/).pop(),
        path: v.path,
        type: 'video',
        duration: IMG_DEFAULT_SECONDS,
      };
    });
  }

  function loadVideos() {
    media = normalizeMedia(cfg).filter(function (m) {
      return m && typeof m.path === 'string' && m.path.trim() !== '';
    });
    if (!media.length) { stopMedia(); return; }
    playAt(0);
  }

  function stopMedia() {
    const stage = document.getElementById('pdStage');
    if (stage) stage.classList.remove('has-video');
    const v = document.getElementById('pdVideo');
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }
    const img = document.getElementById('pdImage');
    if (img) { img.style.display = 'none'; img.removeAttribute('src'); }
  }
  const stopVideo = stopMedia; // keep the old name for any external caller

  function playAt(i) {
    const v = document.getElementById('pdVideo');
    const img = document.getElementById('pdImage');
    const stage = document.getElementById('pdStage');
    if (!media.length) { stopMedia(); return; }
    mIdx = ((i % media.length) + media.length) % media.length;
    const item = media[mIdx] || {};
    if (stage) stage.classList.add('has-video');
    clearTimeout(imageTimer);

    if (item.type === 'image') {
      // Image: show it, hide the video, and advance after its duration.
      if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }
      if (img) {
        img.src = fileUrl(item.path);
        img.style.display = '';
      }
      const secs = Math.min(60, Math.max(3, parseInt(item.duration, 10) || IMG_DEFAULT_SECONDS));
      imageTimer = setTimeout(function () { playAt(mIdx + 1); }, secs * 1000);
      return;
    }

    // Video: hide the image and let the full clip play.
    if (img) { img.style.display = 'none'; img.removeAttribute('src'); }
    if (!v) { stopMedia(); return; }
    try {
      v.src = fileUrl(item.path);
      v.currentTime = 0;
      const pr = v.play();
      if (pr && pr.catch) pr.catch(function () { /* autoplay blocked: retry on first interaction */ });
    } catch (e) { console.warn('[PD] video play failed:', e); }
  }

  function resumeVideo() {
    // Resume whatever is currently on screen: a paused video, or (for an image)
    // simply restart its remaining display window.
    const item = media[mIdx] || {};
    if (item.type === 'image') {
      const secs = Math.min(60, Math.max(3, parseInt(item.duration, 10) || IMG_DEFAULT_SECONDS));
      clearTimeout(imageTimer);
      imageTimer = setTimeout(function () { playAt(mIdx + 1); }, secs * 1000);
      return;
    }
    const v = document.getElementById('pdVideo');
    if (!v || !media.length) return;
    const pr = v.play();
    if (pr && pr.catch) pr.catch(function () {});
  }

  // ---- price layer ---------------------------------------------------
  function showPrice(prod) {
    const layer = document.getElementById('pdPriceLayer');
    const nameEl = document.getElementById('pdProdName');
    const priceEl = document.getElementById('pdPrice');
    if (!layer) return;

    if (nameEl) nameEl.textContent = (prod && prod.name) || '';
    if (priceEl) priceEl.textContent = money(prod ? (prod.sellPrice || prod.price || 0) : 0);
    layer.classList.toggle('miss', !prod);

    layer.classList.add('show');
    const v = document.getElementById('pdVideo');
    if (v) { try { v.pause(); } catch (e) {} }
    // Freeze the image countdown while the price is on screen.
    clearTimeout(imageTimer);

    clearTimeout(priceTimer);
    priceTimer = setTimeout(function () {
      layer.classList.remove('show', 'miss');
      resumeVideo();
    }, PRICE_MS);
  }

  function pdScan(rawCode) {
    if (!onPage) return;
    const code = String(rawCode || '').trim();
    if (!code) return;
    // A phone/remote scan reaches us twice (mapped-field Enter + zmt-phs-scan);
    // ignore the repeat so the 3 s price window is never restarted.
    const now = Date.now();
    if (code === lastCode && now - lastCodeAt < 300) return;
    lastCode = code;
    lastCodeAt = now;
    let prod = null;
    try {
      if (typeof DB !== 'undefined' && DB.getProductByBarcode) prod = DB.getProductByBarcode(code);
    } catch (e) { prod = null; }
    showPrice(prod);
  }

  // ---- keyboard (wedge scanner) --------------------------------------
  function onKeyDown(e) {
    if (!onPage || dialogOpen) return;
    if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); openLock(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Enter') {
      let code = '';
      const sf = document.getElementById('pdScannerField');
      if (e.target === sf && sf && sf.value) code = sf.value;
      else code = buf;
      buf = '';
      if (sf) sf.value = '';
      clearTimeout(bufTimer);
      if (code) pdScan(code);
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') { buf = ''; return; }
    if (e.key && e.key.length === 1 && /[0-9A-Za-z\-._]/.test(e.key)) {
      buf += e.key;
      clearTimeout(bufTimer);
      bufTimer = setTimeout(function () { buf = ''; }, SCAN_GAP);
    }
  }

  // ---- lock / exit ---------------------------------------------------
  function kioskActive() {
    return document.body.classList.contains('pd-kiosk');
  }

  function pdExitKiosk() {
    document.body.classList.remove('pd-kiosk');
    try {
      if (window.electronAPI && typeof window.electronAPI.windowSetKiosk === 'function') {
        window.electronAPI.windowSetKiosk(false);
      }
    } catch (e) {}
  }

  function doExit() {
    closeLock();
    pdExitKiosk();
    window.__pdKioskMode = false;
    // Leaving the kiosk ends its session: sign out and show the login screen so
    // the manager can come back with their own credentials.
    try { if (typeof Auth !== 'undefined') Auth.signOut(); } catch (e) {}
    if (typeof showLogin === 'function') showLogin();
    else if (typeof navigateTo === 'function') navigateTo('dashboard');
  }

  function openLock() {
    if (!kioskActive()) {
      if (typeof navigateTo === 'function') navigateTo('dashboard');
      return;
    }
    dialogOpen = true;
    const veil = document.getElementById('pdLockVeil');
    const inp = document.getElementById('pdLockInput');
    const st = document.getElementById('pdLockStatus');
    if (st) st.textContent = '';
    if (inp) inp.value = '';
    if (veil) veil.style.display = 'flex';
    setTimeout(function () { if (inp) inp.focus(); }, 60);
  }

  function closeLock() {
    dialogOpen = false;
    const veil = document.getElementById('pdLockVeil');
    if (veil) veil.style.display = 'none';
    // Keep the wedge scanner focused so the next barcode types into the field.
    const sf = document.getElementById('pdScannerField');
    if (sf && onPage) setTimeout(function () { try { sf.focus({ preventScroll: true }); } catch (e) {} }, 40);
  }

  function lockHasPin() {
    if (cfg && cfg.lockPin) return true;
    try {
      const code = (cfg && cfg.autoLogin && cfg.autoLogin.code) || localStorage.getItem('zmt_store_code') || '';
      if (typeof Auth !== 'undefined' && Auth.hasLocalPassData && code && Auth.hasLocalPassData(code)) return true;
    } catch (e) {}
    return false;
  }

  function lockVerify() {
    const st = document.getElementById('pdLockStatus');
    const inp = document.getElementById('pdLockInput');
    const val = inp ? inp.value : '';
    if (!val) { if (st) st.textContent = 'أدخل الرمز'; return; }

    if (cfg && cfg.lockPin) {
      if (val === cfg.lockPin) { doExit(); return; }
      if (st) st.textContent = 'الرمز غير صحيح';
      if (inp) { inp.value = ''; inp.focus(); }
      return;
    }

    const code = localStorage.getItem('zmt_store_code') || '';
    const done = function (ok) {
      if (ok) { doExit(); return; }
      if (st) st.textContent = 'الرمز غير صحيح';
      if (inp) { inp.value = ''; inp.focus(); }
    };
    if (typeof Auth !== 'undefined' && Auth.verifyLocalPassword && code) {
      Auth.verifyLocalPassword(code, val).then(done).catch(function () { done(false); });
    } else {
      done(false);
    }
  }

  // ---- init ----------------------------------------------------------
  window.init_price_display = function () {
    cfg = pdLoad();
    onPage = true;
    applyLook();
    loadVideos();

    const stage = document.getElementById('pdStage');
    if (stage) stage.style.background = cfg.bg || '#0b1220';

    if (window.__pdKioskMode) {
      document.body.classList.add('pd-kiosk');
      try {
        if (window.electronAPI && typeof window.electronAPI.windowSetKiosk === 'function') {
          window.electronAPI.windowSetKiosk(true);
        }
      } catch (e) {}
    }

    const v = document.getElementById('pdVideo');
    if (v) {
      v.addEventListener('ended', function () { playAt(mIdx + 1); });
      v.addEventListener('error', function () { setTimeout(function () { playAt(mIdx + 1); }, 600); });
    }
    const imgEl = document.getElementById('pdImage');
    if (imgEl) {
      imgEl.addEventListener('error', function () { setTimeout(function () { playAt(mIdx + 1); }, 600); });
    }

    const sf = document.getElementById('pdScannerField');
    if (sf) setTimeout(function () { try { sf.focus({ preventScroll: true }); } catch (e) {} }, 120);

    const lb = document.getElementById('pdLockBtn');
    if (lb) lb.addEventListener('click', openLock);
    const lx = document.getElementById('pdLockClose');
    if (lx) lx.addEventListener('click', closeLock);
    const lc = document.getElementById('pdLockCancel');
    if (lc) lc.addEventListener('click', closeLock);
    const lo = document.getElementById('pdLockOk');
    if (lo) lo.addEventListener('click', lockVerify);
    const li = document.getElementById('pdLockInput');
    if (li) li.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); lockVerify(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeLock(); }
    });

    if (typeof trackPageListener === 'function') {
      trackPageListener('keydown', onKeyDown, document);
      trackPageListener('zmt-phs-scan', function (ev) {
        const d = ev && ev.detail;
        if (d && d.code) pdScan(d.code);
      }, window);
    } else {
      document.addEventListener('keydown', onKeyDown);
    }

    if (sf) { try { sf.value = ''; } catch (e) {} }
    buf = '';

    // Alt+F4 while kiosk is on is forwarded by the main process as an exit
    // request — open the manager PIN dialog instead of closing the app. The
    // listener is bound once and always dispatches through window.pdOpenLock so
    // it survives page reloads (this script is re-evaluated on every visit).
    if (!window.__pdExitBound && window.electronAPI && typeof window.electronAPI.onPdExitRequest === 'function') {
      window.__pdExitBound = true;
      window.electronAPI.onPdExitRequest(function () {
        if (document.getElementById('pdLockVeil') && typeof window.pdOpenLock === 'function') window.pdOpenLock();
      });
    }
  };

  window.pdScan = pdScan;
  window.pdOpenLock = openLock;
  window.pdExitKiosk = pdExitKiosk;
})();
