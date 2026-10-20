// ============================================================
// ZMT PIECE - Sound Engine
// ============================================================
// Very light on purpose:
//  - ONE shared <Audio> element for every button click (reused forever).
//  - Sound files are tiny (button ~74 KB, intro ~98 KB) and are loaded
//    lazily: nothing is decoded until the user actually clicks / the splash
//    starts, so RAM and the CPU stay untouched while the app is idle.
//  - A single document-level listener (no per-button listeners).
//  - Both sounds can be turned off from the settings page at any moment.
(function () {
  var LS_BUTTONS = 'zmt_sound_buttons';
  var LS_INTRO = 'zmt_sound_intro';
  var CLICK_URL = 'assets/sounds/click.mp3';
  var INTRO_URL = 'assets/sounds/intro.mp3';

  var enabled = {
    buttons: localStorage.getItem(LS_BUTTONS) !== '0',
    intro: localStorage.getItem(LS_INTRO) !== '0'
  };

  var clickEl = null;
  var introEl = null;

  function safePlay(audio) {
    try {
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  // Re-usable "click" sound. currentTime is reset to 0 so rapid clicks
  // restart the sound instantly without creating any new Audio object.
  function click() {
    if (!enabled.buttons) return;
    if (!clickEl) {
      clickEl = new Audio(CLICK_URL);
      clickEl.preload = 'auto';
      clickEl.volume = 1;
      clickEl.playbackRate = 4;
    }
    try { clickEl.currentTime = 0; } catch (e) {}
    safePlay(clickEl);
  }

  // One-shot startup "intro" sound (played by the splash screen). Once it
  // finishes the buffer is released so the memory is freed again.
  function intro() {
    if (!enabled.intro) return;
    if (!introEl) {
      introEl = new Audio(INTRO_URL);
      introEl.preload = 'auto';
      introEl.onended = function () {
        try { introEl.removeAttribute('src'); introEl.load(); } catch (e) {}
      };
    }
    try { introEl.currentTime = 0; } catch (e) {}
    safePlay(introEl);
  }

  // Small feedback sounds (for attendance scanner results)
  function _beep(freq, dur, vol) {
    try {
      const ctx = window.AudioContext || window.webkitAudioContext;
      if (!ctx) return;
      const ac = new ctx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.linearRampToValueAtTime(vol || 0.12, ac.currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + dur);
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(0); osc.stop(ac.currentTime + dur + 0.01);
    } catch (e) {}
  }
  function successBeep() { if (!enabled.buttons) return; _beep(880, 0.08, 0.12); setTimeout(function(){ _beep(1320, 0.08, 0.12); }, 40); }
  function errorBeep()   { if (!enabled.buttons) return; _beep(220, 0.14, 0.16); }


  // Persist the two on/off toggles (buttons / intro) and update the live
  // `enabled` object so open listeners behave immediately.
  function setEnabled(kind, value) {
    if (kind !== 'buttons' && kind !== 'intro') return;
    enabled[kind] = !!value;
    try {
      localStorage.setItem(kind === 'buttons' ? LS_BUTTONS : LS_INTRO, enabled[kind] ? '1' : '0');
    } catch (e) {}
  }

  // ---- Global click feedback ---------------------------------------------
  // Capture phase + a single listener, so this covers every interactive
  // element in the whole app (pages, settings, modals, docks, title bar...).
  function onClick(e) {
    if (!enabled.buttons) return;
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    if (!t.closest) return;
    var el = t.closest(
      'button, a[onclick], input[type="button"], input[type="submit"], ' +
      '[role="button"], select, .btn, .nav-item, .dock-item, ' +
      '.tb-btn, .tb-dropdown-item, .login-tab, .login-action, ' +
      '.license-activate-btn, .license-switch-btn, .eula-show-btn, .modal-close'
    );
    if (el) click();
  }
  document.addEventListener('click', onClick, true);

  window.ZmtSound = { click: click, intro: intro, setEnabled: setEnabled, success: successBeep, error: errorBeep };
})();