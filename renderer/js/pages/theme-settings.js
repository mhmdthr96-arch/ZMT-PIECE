// ===== THEME SETTINGS (تخصيص الألوان) =====
const _THEME_KEY = 'zmt_theme_colors';
const _THEME_DEFAULTS = {
  light: { pageBg: '#d4d4d4', cardBg: '#ffffff', text: '#2a2a2a', invoiceCardBg: '#ffffff' },
  dark:  { pageBg: '#2a2a2e', cardBg: '#222226', text: '#e8e8ef', invoiceCardBg: '#222226' },
};

function _themeLoad() {
  try {
    const raw = localStorage.getItem(_THEME_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      return Object.assign({}, _THEME_DEFAULTS, o, {
        light: Object.assign({}, _THEME_DEFAULTS.light, (o && o.light) || {}),
        dark: Object.assign({}, _THEME_DEFAULTS.dark, (o && o.dark) || {}),
      });
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(_THEME_DEFAULTS));
}

function _themeSave(obj) { try { localStorage.setItem(_THEME_KEY, JSON.stringify(obj)); } catch (e) {} }

function _currentThemeMode() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyThemeColors() {
  const obj = _themeLoad();
  const mode = _currentThemeMode();
  const c = obj[mode] || _THEME_DEFAULTS[mode];
  const r = document.documentElement;
  r.style.setProperty('--theme-page-bg', c.pageBg);
  r.style.setProperty('--theme-card-bg', c.cardBg);
  r.style.setProperty('--theme-text', c.text);
  r.style.setProperty('--theme-invoice-card-bg', c.invoiceCardBg);
}

function resetThemeColors() {
  try { localStorage.removeItem(_THEME_KEY); } catch (e) {}
  const r = document.documentElement;
  r.style.removeProperty('--theme-page-bg');
  r.style.removeProperty('--theme-card-bg');
  r.style.removeProperty('--theme-text');
  r.style.removeProperty('--theme-invoice-card-bg');
  applyThemeColors();
  const m = document.getElementById('themeSettingsModal');
  if (m) _populateThemeModal();
}

function _populateThemeModal() {
  const obj = _themeLoad();
  ['light', 'dark'].forEach(mode => {
    const c = obj[mode];
    ['pageBg', 'cardBg', 'text', 'invoiceCardBg'].forEach(k => {
      const el = document.getElementById('ts_' + mode + '_' + k);
      if (el) el.value = c[k];
      const lbl = document.getElementById('ts_' + mode + '_' + k + '_val');
      if (lbl) lbl.textContent = c[k];
    });
  });
}

function openThemeSettings() {
  if (!_themeCanView()) return;
  let m = document.getElementById('themeSettingsModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'themeSettingsModal';
    m.className = 'modal-overlay';
    m.style.zIndex = '99997';
    m.innerHTML = `
      <div class="modal" style="max-width:640px">
        <div class="modal-header">
          <h3><i class="fas fa-cog"></i> إعدادات الألوان</h3>
          <button class="modal-close" onclick="closeThemeSettings()">&times;</button>
        </div>
        <div class="modal-body" style="padding:16px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            ${['light', 'dark'].map(mode => `
              <div style="border:1px solid var(--silver-300);border-radius:8px;padding:12px">
                <div style="font-weight:700;margin-bottom:10px">${mode === 'light' ? 'الوضع النهاري' : 'الوضع الليلي'}</div>
                ${[
                  ['pageBg', 'لون الخلفية'],
                  ['cardBg', 'لون بطاقات المنتجات'],
                  ['text', 'لون الخط'],
                  ['invoiceCardBg', 'لون بطاقات الفواتير'],
                ].map(([k, label]) => `
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                    <input type="color" id="ts_${mode}_${k}" value="#ffffff" oninput="_themeLive('${mode}','${k}',this.value)" style="width:40px;height:30px;border:1px solid var(--silver-300);border-radius:4px;cursor:pointer">
                    <span style="font-size:12px;flex:1">${label}</span>
                    <span id="ts_${mode}_${k}_val" style="font-size:11px;color:var(--silver-500);font-family:monospace"></span>
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>
          <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn" onclick="resetThemeColors()">إعادة إلى الافتراضي</button>
            <button class="btn btn-primary" onclick="closeThemeSettings()">إغلاق</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
  }
  _populateThemeModal();
  m.style.display = 'flex';
}

function closeThemeSettings() {
  const m = document.getElementById('themeSettingsModal');
  if (m) m.style.display = 'none';
}

function _themeLive(mode, key, val) {
  const lbl = document.getElementById('ts_' + mode + '_' + key + '_val');
  if (lbl) lbl.textContent = val;
  const obj = _themeLoad();
  obj[mode][key] = val;
  _themeSave(obj);
  // apply if this is the active mode
  if (mode === _currentThemeMode()) applyThemeColors();
}

// Apply on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyThemeColors);
} else {
  applyThemeColors();
}

// Re-apply when theme toggles
const _origToggle = window.toggleTheme;
window.toggleTheme = function () {
  if (typeof _origToggle === 'function') _origToggle();
  applyThemeColors();
};

// Wire gear button
function _injectThemeBtn() {
  if (document.getElementById('btnThemeSettings')) { _applyThemePerm(); return; }
  const btn = document.createElement('button');
  btn.className = 'tb-btn tb-support-btn';
  btn.id = 'btnThemeSettings';
  btn.title = 'إعدادات الألوان';
  btn.innerHTML = '<svg class="tb-svg-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-7a9 9 0 0 1 18 0v7"></path><path d="M12 11v10"></path></svg>';
  btn.onclick = openThemeSettings;
  const support = document.getElementById('tbSupport');
  if (support && support.parentNode) {
    support.parentNode.insertBefore(btn, support);
  } else {
    const ctr = document.querySelector('.title-bar-controls');
    if (ctr) ctr.insertBefore(btn, ctr.firstChild);
  }
  _applyThemePerm();
}

// Permission gate — the manager can hide «إعدادات الألوان» from a user. It
// defaults to visible so nothing is lost before the manager saves the grid.
function _themeCanView() {
  try {
    if (typeof Auth === 'undefined' || typeof Auth.canView !== 'function') return true;
    if (typeof Auth.isLoggedIn === 'function' && !Auth.isLoggedIn()) return true;
    return Auth.canView('theme-settings');
  } catch (e) { return true; }
}

function _applyThemePerm() {
  const btn = document.getElementById('btnThemeSettings');
  if (btn) btn.style.display = _themeCanView() ? '' : 'none';
}
window.addEventListener('zmt:navigate', _applyThemePerm);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _injectThemeBtn);
} else {
  _injectThemeBtn();
}

window.openThemeSettings = openThemeSettings;
window.closeThemeSettings = closeThemeSettings;
window.resetThemeColors = resetThemeColors;
window.applyThemeColors = applyThemeColors;