/* ============================================================================
 * ZMT PIECE — Update manager (GitHub Releases)
 * ----------------------------------------------------------------------------
 * Distribution model: the developer publishes four NSIS installers + an
 * `update.json` manifest as assets of a GitHub Release tagged `vX.Y.Z`
 * (see tools/publish-update.js). Clients read the *stable* "latest" URLs:
 *
 *   manifest : https://github.com/<repo>/releases/latest/download/update.json
 *   asset    : https://github.com/<repo>/releases/latest/download/<file.exe>
 *
 * No secret ever lives in the client — it can only READ. Channel selection
 * (modern/win7 × x64/ia32) is decided in the main process (update-system-info).
 *
 * UX:
 *   - a title-bar button with a red-dot badge while an update is available,
 *   - a persistent toast that stays on screen until the user chooses
 *     "تحديث الآن" or "لاحقاً" (no auto-hide, no repeated beeping),
 *   - a persistent panel (click the button/toast) to download & install,
 *   - "لاحقاً" only hides the toast for the current session; the red badge
 *     stays, and the toast returns on the next launch,
 *   - "عدم الإظهار مجددًا" mutes the popup AND the badge for THAT version only;
 *     it returns automatically when a newer version is published.
 * ========================================================================== */
(function () {
  'use strict';

  var REPO = 'mhmdthr96-arch/ZMT-PIECE';
  var MANIFEST_URL = 'https://github.com/' + REPO + '/releases/latest/download/update.json';
  var MUTE_KEY = 'zmt_update_muted_version';
  var CHECK_INTERVAL_MS = 120000; // re-check for an even newer version
  var FIRST_CHECK_DELAY_MS = 8000; // let the app settle before the first check

  var api = (typeof window !== 'undefined') ? window.electronAPI : null;

  function _el(id) { return document.getElementById(id); }
  function _mutedVersion() { try { return localStorage.getItem(MUTE_KEY) || ''; } catch (e) { return ''; } }
  function _setMuted(v) { try { localStorage.setItem(MUTE_KEY, v || ''); } catch (e) {} }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  var State = {
    info: null,       // system info from main
    manifest: null,   // last check result
    updating: false,
    toastDismissedFor: '', // version dismissed with "لاحقاً" in this session
    checkTimer: null,
  };

  function injectStyles() {
    if (_el('zmt-updater-styles')) return;
    var css = '' +
      '.tb-update{position:relative}' +
      '.tb-update.tb-update-has{color:#ff5252}' +
      '.tb-update-badge{position:absolute;top:2px;left:2px;width:9px;height:9px;border-radius:50%;background:#ff1744;box-shadow:0 0 0 2px rgba(0,0,0,.35);animation:zmtUpdPulse 1.6s infinite}' +
      '@keyframes zmtUpdPulse{0%{transform:scale(1);opacity:1}50%{transform:scale(1.35);opacity:.55}100%{transform:scale(1);opacity:1}}' +
      '.zmt-upd-overlay{position:fixed;top:46px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none}' +
      '.zmt-upd-toast{pointer-events:auto;cursor:pointer;background:#1f2530;color:#fff;border:1px solid #38404f;border-left:4px solid #ff1744;border-radius:10px;padding:12px 16px;min-width:280px;max-width:420px;box-shadow:0 10px 30px rgba(0,0,0,.45);font-family:inherit;opacity:0;transform:translateY(-12px);transition:opacity .25s,transform .25s}' +
      '.zmt-upd-toast.show{opacity:1;transform:translateY(0)}' +
      '.zmt-upd-toast .t-title{font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px}' +
      '.zmt-upd-toast .t-title i{color:#ff5252}' +
      '.zmt-upd-toast .t-sub{font-size:12px;opacity:.8;margin-top:4px}' +
      '.zmt-upd-toast-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}' +
      '.zmt-upd-toast-actions .zmt-upd-btn{font-size:12px;padding:7px 12px}' +
      '.zmt-upd-panel{pointer-events:auto;background:#1f2530;color:#fff;border:1px solid #38404f;border-radius:12px;padding:18px;width:440px;max-width:92vw;box-shadow:0 16px 44px rgba(0,0,0,.5);font-family:inherit}' +
      '.zmt-upd-panel h3{margin:0 0 10px;font-size:16px;display:flex;align-items:center;gap:8px}' +
      '.zmt-upd-panel h3 i{color:#4fc3f7}' +
      '.zmt-upd-row{font-size:13px;margin:4px 0;opacity:.9;display:flex;justify-content:space-between;gap:12px}' +
      '.zmt-upd-notes{font-size:12px;opacity:.85;background:#171c24;border:1px solid #2b323d;border-radius:8px;padding:10px;margin:10px 0;max-height:140px;overflow:auto;white-space:pre-wrap;line-height:1.6}' +
      '.zmt-upd-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px}' +
      '.zmt-upd-btn{border:0;border-radius:8px;padding:9px 14px;font-family:inherit;font-size:13px;cursor:pointer;transition:filter .15s}' +
      '.zmt-upd-btn:hover{filter:brightness(1.12)}' +
      '.zmt-upd-btn.primary{background:#2e7d32;color:#fff}' +
      '.zmt-upd-btn.ghost{background:#2b323d;color:#cfd6e0}' +
      '.zmt-upd-btn.mute{background:transparent;color:#8b93a1;text-decoration:underline}' +
      '.zmt-upd-btn[disabled]{opacity:.5;cursor:default;filter:none}' +
      '.zmt-upd-progress{height:8px;background:#2b323d;border-radius:6px;overflow:hidden;margin:12px 0 4px;display:none}' +
      '.zmt-upd-progress.show{display:block}' +
      '.zmt-upd-progress > span{display:block;height:100%;width:0;background:linear-gradient(90deg,#4fc3f7,#2e7d32);transition:width .2s}' +
      '.zmt-upd-err{color:#ff8a80;font-size:12px;margin-top:6px;min-height:14px}';
    var s = document.createElement('style');
    s.id = 'zmt-updater-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function ensureOverlay() {
    var ov = _el('zmtUpdOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'zmtUpdOverlay';
    ov.className = 'zmt-upd-overlay';
    document.body.appendChild(ov);
    return ov;
  }

  function hideToast() {
    var t = _el('zmtUpdToast');
    if (!t) return;
    t.classList.remove('show');
    setTimeout(function () { if (t && t.parentNode && !t.classList.contains('show')) t.parentNode.removeChild(t); }, 300);
  }

  function showToast(m) {
    if (!m || !m.hasUpdate) return;
    var ov = ensureOverlay();
    var t = document.createElement('div');
    t.id = 'zmtUpdToast';
    t.className = 'zmt-upd-toast';
    t.setAttribute('role', 'status');
    t.innerHTML =
      '<div class="t-title"><i class="fas fa-arrow-circle-up"></i> يتوفر تحديث جديد (' + _esc(m.latest) + ')</div>' +
      '<div class="t-sub">ثبّت الإصدار الجديد الآن، أو اختر «لاحقاً» وستجد النقطة الحمراء على زر التحديث.</div>' +
      '<div class="zmt-upd-toast-actions">' +
        '<button type="button" class="zmt-upd-btn primary" id="zmtUpdToastNow"><i class="fas fa-download"></i> تحديث الآن</button>' +
        '<button type="button" class="zmt-upd-btn ghost" id="zmtUpdToastLater">لاحقاً</button>' +
      '</div>';
    // The toast itself opens the details panel; the two buttons act directly.
    t.addEventListener('click', function () { hideToast(); openPanel(); });
    ov.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });

    var nowBtn = _el('zmtUpdToastNow');
    if (nowBtn) nowBtn.addEventListener('click', function (e) {
      if (e) e.stopPropagation();
      hideToast();
      openPanel();
      // One click on "تحديث الآن" starts the download/install flow; the panel
      // shows the progress bar and any error.
      setTimeout(function () {
        var go = _el('zmtUpdGo');
        if (go) go.click();
      }, 60);
    });
    var laterBtn = _el('zmtUpdToastLater');
    if (laterBtn) laterBtn.addEventListener('click', function (e) {
      if (e) e.stopPropagation();
      // Session-only dismissal: the badge stays and the toast returns when the
      // app is reopened (or when a newer version than this one is published).
      State.toastDismissedFor = m.latest || '';
      hideToast();
    });

    try { if (api && api.updaterBeep) api.updaterBeep(); } catch (e) {}
  }

  function closePanel() {
    var p = _el('zmtUpdPanel');
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }

  function openPanel() {
    hideToast();
    closePanel();
    var m = State.manifest;
    var ov = ensureOverlay();
    var chosen = State.info && State.info.channel ? (State.info.channel === 'win7' ? 'ويندوز 7' : 'حديث') : '';
    var missing = m && m.hasUpdate && !m.asset;
    var p = document.createElement('div');
    p.id = 'zmtUpdPanel';
    p.className = 'zmt-upd-panel';
    p.innerHTML =
      '<h3><i class="fas fa-cloud-arrow-down"></i> التحديثات</h3>' +
      '<div class="zmt-upd-row"><span>الإصدار الحالي</span><b>' + _esc(m ? m.current : (State.info ? State.info.version : '—')) + '</b></div>' +
      '<div class="zmt-upd-row"><span>أحدث إصدار متاح</span><b>' + _esc(m && m.latest ? m.latest : (m && m.ok ? 'محدّث بالفعل' : '—')) + '</b></div>' +
      (chosen ? '<div class="zmt-upd-row"><span>قناة الجهاز</span><b>' + _esc(chosen + (State.info.arch === 'ia32' ? ' (32-bit)' : ' (64-bit)')) + '</b></div>' : '') +
      (m && m.notes ? '<div class="zmt-upd-notes">' + _esc(m.notes) + '</div>' : '') +
      (missing ? '<div class="zmt-upd-err">لا يوجد ملف تحديث لقناة هذا الجهاز في هذا الإصدار.</div>' : '') +
      (m && !m.ok ? '<div class="zmt-upd-err">تعذّر الاتصال بالخادم. حاول لاحقًا.</div>' : '') +
      '<div class="zmt-upd-progress" id="zmtUpdProgress"><span></span></div>' +
      '<div class="zmt-upd-err" id="zmtUpdErr"></div>' +
      '<div class="zmt-upd-actions">' +
      (m && m.hasUpdate && m.asset ? '<button class="zmt-upd-btn primary" id="zmtUpdGo"><i class="fas fa-download"></i> تنزيل وتثبيت</button>' : '') +
      '<button class="zmt-upd-btn ghost" id="zmtUpdCheck"><i class="fas fa-rotate"></i> التحقق الآن</button>' +
      '<button class="zmt-upd-btn ghost" id="zmtUpdClose">إغلاق</button>' +
      (m && m.hasUpdate ? '<button class="zmt-upd-btn mute" id="zmtUpdMute">عدم الإظهار مجددًا</button>' : '') +
      '</div>';
    ov.appendChild(p);

    _el('zmtUpdClose').addEventListener('click', closePanel);
    var checkBtn = _el('zmtUpdCheck');
    if (checkBtn) checkBtn.addEventListener('click', async function () {
      checkBtn.disabled = true;
      checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ التحقق';
      try { await check(false); } catch (e) {}
      checkBtn.disabled = false;
      checkBtn.innerHTML = '<i class="fas fa-rotate"></i> التحقق الآن';
      openPanel();
    });
    var muteBtn = _el('zmtUpdMute');
    if (muteBtn) muteBtn.addEventListener('click', function () {
      if (m) _setMuted(m.latest);
      hideToast();
      _updateBadge(false);
      closePanel();
    });
    var go = _el('zmtUpdGo');
    if (go) go.addEventListener('click', _startUpdate);
  }

  function _releaseUrl() { return 'https://github.com/' + REPO + '/releases/latest'; }

  // Turns a raw updater error into a sentence the user can act on, plus the
  // two recovery paths (manual download / diagnostic log).
  function _describeUpdateError(raw) {
    var msg = String(raw == null ? '' : raw);
    if (/sha256|size mismatch|incomplete|damaged/i.test(msg)) {
      return 'الملف الذي تم تنزيله تالف أو ناقص. تحقّق من الاتصال ثم أعد المحاولة.';
    }
    if (/not a Windows installer|installer is incomplete/i.test(msg)) {
      return 'الملف الذي تم تنزيله ليس مثبّتاً صالحاً (غالباً صفحة خطأ من الشبكة). أعد المحاولة أو نزّله يدوياً.';
    }
    if (/EACCES|EPERM|access is denied|operation not permitted/i.test(msg)) {
      return 'منع نظام الحماية (مضاد الفيروسات) تشغيل المثبّت. اسمح للبرنامج في مضاد الفيروسات ثم أعد المحاولة، أو نزّل التحديث يدوياً.';
    }
    if (/ENOENT|spawn|installer could not start/i.test(msg)) {
      return 'تعذّر تشغيل المثبّت. نزّل التحديث يدوياً من صفحة الإصدارات.';
    }
    if (/HTTP \d+|too many redirects|https required|timeout|ENOTFOUND|ECONN/i.test(msg)) {
      return 'تعذّر تنزيل التحديث بسبب مشكلة في الشبكة. تحقّق من الاتصال ثم أعد المحاولة.';
    }
    return msg || 'خطأ غير معروف';
  }

  function _showUpdateRecovery(errEl, raw) {
    if (!errEl) return;
    errEl.innerHTML = 'فشل التحديث: ' + _esc(_describeUpdateError(raw)) +
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<button type="button" class="zmt-upd-btn ghost" id="zmtUpdManual"><i class="fas fa-download"></i> تحميل يدوي</button>' +
      '<button type="button" class="zmt-upd-btn ghost" id="zmtUpdOpenFolder">مجلد التنزيل</button>' +
      '<button type="button" class="zmt-upd-btn mute" id="zmtUpdOpenLog">عرض السجل</button>' +
      '</div>';
    var manual = _el('zmtUpdManual');
    if (manual) manual.addEventListener('click', function () {
      try { if (api && api.openExternal) api.openExternal(_releaseUrl()); } catch (e) {}
    });
    var folder = _el('zmtUpdOpenFolder');
    if (folder && api && api.updaterOpenFolder) folder.addEventListener('click', function () {
      try { api.updaterOpenFolder(); } catch (e) {}
    });
    var log = _el('zmtUpdOpenLog');
    if (log && api && api.updaterOpenLog) log.addEventListener('click', function () {
      try { api.updaterOpenLog(); } catch (e) {}
    });
  }

  async function _startUpdate() {
    if (!api) return;
    if (State.updating) return;
    var m = State.manifest;
    if (!m || !m.asset) return;
    State.updating = true;
    var go = _el('zmtUpdGo');
    var errEl = _el('zmtUpdErr');
    var prog = _el('zmtUpdProgress');
    if (go) { go.disabled = true; go.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ التنزيل'; }
    if (errEl) errEl.textContent = '';
    if (prog) prog.classList.add('show');

    try {
      var assetName = m.asset.asset || m.asset.name || ('ZMT-PIECE-' + (State.info ? State.info.channelKey : 'x64') + '.exe');
      var url = 'https://github.com/' + REPO + '/releases/latest/download/' + encodeURIComponent(assetName);
      var dl = await api.updaterDownload({
        url: url,
        sha256: m.asset.sha256 || '',
        size: m.asset.size || 0,
        fileName: assetName,
      });
      if (!dl || !dl.ok) throw new Error((dl && dl.error) || 'download failed');
      if (go) go.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ التثبيت';
      var inst = await api.updaterInstall(dl.filePath);
      if (!inst || !inst.ok) throw new Error((inst && inst.error) || 'install failed');
      // app.quit() is triggered by the main process once the installer starts.
    } catch (e) {
      State.updating = false;
      if (go) { go.disabled = false; go.innerHTML = '<i class="fas fa-download"></i> إعادة المحاولة'; }
      _showUpdateRecovery(errEl, (e && e.message) || e);
      if (prog) prog.classList.remove('show');
    }
  }

  function _updateBadge(show) {
    var badge = _el('updateBadge');
    var btn = _el('btnUpdate');
    // The title-bar button is always visible so the user can open the update
    // panel and run a manual check at any time; only the red badge reflects an
    // actually-available (and un-muted) update.
    if (btn) {
      btn.style.display = '';
      btn.classList.toggle('tb-update-has', !!show);
    }
    if (badge) badge.style.display = show ? '' : 'none';
  }

  async function check(showToastIfAny) {
    if (!api || typeof api.updaterCheck !== 'function') return;
    try {
      if (!State.info) State.info = await (api.updaterSystemInfo ? api.updaterSystemInfo() : Promise.resolve(null));
      var res = await api.updaterCheck(MANIFEST_URL);
      State.manifest = res;
      var muted = _mutedVersion();
      // If a NEWER version than the muted one appears, unmute automatically.
      if (muted && res && res.ok && res.latest && res.latest !== muted) {
        _setMuted('');
        muted = '';
      }
      var active = !!(res && res.ok && res.hasUpdate && res.latest !== muted);
      _updateBadge(active);
      if (!active) {
        // Already up to date (or muted for this exact version): nothing to show.
        State.toastDismissedFor = '';
        hideToast();
        return;
      }
      // A newer version than the one dismissed with "لاحقاً" must speak again.
      if (State.toastDismissedFor && res.latest !== State.toastDismissedFor) {
        State.toastDismissedFor = '';
      }
      // Persistent notice: show it once and let it stay until the user chooses
      // "تحديث الآن" or "لاحقاً". Never recreate it on the 2-minute poll, and
      // never cover an already-open details panel.
      if (showToastIfAny && !_el('zmtUpdToast') && !_el('zmtUpdPanel') &&
          res.latest !== State.toastDismissedFor) {
        showToast(res);
      }
    } catch (e) {
      // Silent: updates must never disrupt normal use.
    }
  }

  function init() {
    if (!api || typeof api.updaterCheck !== 'function') return;
    // The F1 quick-entry window reuses index.html; only the main window owns the
    // update badge/toast/panel so we never show duplicates.
    try {
      if (window.location && /(?:^|[?&])standalone=quick-entry(?:&|$)/.test(window.location.search)) {
        var qeBtn = _el('btnUpdate');
        if (qeBtn) qeBtn.style.display = 'none';
        return;
      }
    } catch (e) {}
    injectStyles();
    var btn = _el('btnUpdate');
    if (btn) btn.addEventListener('click', function () { openPanel(); });
    if (api.onUpdaterProgress) {
      api.onUpdaterProgress(function (p) {
        var bar = _el('zmtUpdProgress');
        if (bar && bar.firstChild) bar.firstChild.style.width = (p && p.percent ? p.percent : 0) + '%';
      });
    }
    setTimeout(function () { check(true); }, FIRST_CHECK_DELAY_MS);
    if (State.checkTimer) clearInterval(State.checkTimer);
    State.checkTimer = setInterval(function () { check(true); }, CHECK_INTERVAL_MS);
  }

  window.Updater = { init: init, check: check, openPanel: openPanel };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
