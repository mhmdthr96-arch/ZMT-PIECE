// The general-settings' own company. Uses DB.getDefaultCompany (deterministic and
// stable across restarts); falls back to the fixed default id, the single existing
// company, or the currently-active company.
function _settingsResolveDefaultCompany() {
  if (typeof DB === 'undefined') return null;
  if (typeof DB.getDefaultCompany === 'function') {
    try { const d = DB.getDefaultCompany(); if (d) return d; } catch (e) {}
  }
  if (typeof DB.getCompanies !== 'function') return null;
  let all = [];
  try { all = DB.getCompanies() || []; } catch (e) { all = []; }
  if (!all.length) return null;
  const byId = all.find(c => c.id === 'zmt-default-company');
  if (byId) return byId;
  if (all.length === 1) return all[0];
  const activeId = (typeof Auth !== 'undefined' && Auth.getCompanyId) ? Auth.getCompanyId() : '';
  return all.find(c => c.id === activeId) || all[0];
}

// The company the user is currently inside (if any). Used so the general
// settings name + legal/profile fields reflect the ACTIVE company instead of a
// shared global value — making each company's identity independent.
function _settingsActiveCompany() {
  try {
    let cid = '';
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) {
      cid = (typeof Auth.getCompanyId === 'function') ? (Auth.getCompanyId() || '') : '';
    }
    if (!cid) {
      cid = localStorage.getItem('zmt_active_company') || '';
    }
    if (!cid) return null;
    if (typeof DB !== 'undefined' && DB.getCompany) {
      return DB.getCompany(cid) || null;
    }
  } catch (e) {}
  return null;
}

// Populate the general-settings name + profile/legal fields. When a company is
// entered the fields reflect ONLY that company's own record (a fresh company
// appears empty — never the previous/global values). With no company entered we
// show the default company, falling back to shared localStorage (legacy).
function settingsPopulateCompanyFields() {
  const entered = _settingsActiveCompany();
  const target = entered || _settingsResolveDefaultCompany();
  const fallback = !entered; // global/local fallback only when NOT inside a company

  const val = (companyVal, gkey) =>
    companyVal || (fallback ? (localStorage.getItem(gkey) || '') : '');
  const nameEl = document.getElementById('settingsCompanyName');
  if (nameEl) {
    const name = entered
      ? (entered.name || '')
      : (target && target.name) || localStorage.getItem('zmt_company_name') || localStorage.getItem('zmt_store_name') || 'ZMT PIECE';
    nameEl.value = name;
  }
  // Store name belongs to the company: show the active/default company's own
  // storeName, falling back to the shared local store name (a company that has
  // not set one yet inherits the device's current store name on first save).
  const storeNameEl = document.getElementById('settingsStoreName');
  if (storeNameEl) {
    storeNameEl.value = (target && target.storeName) || localStorage.getItem('zmt_store_name') || 'ZMT PIECE';
  }
  const phoneEl = document.getElementById('settingsStorePhone');
  if (phoneEl) phoneEl.value = val(target && target.phone, 'zmt_store_phone');
  const addrEl = document.getElementById('settingsStoreAddress');
  if (addrEl) addrEl.value = val(target && target.address, 'zmt_store_address');
  const mapFil = (id, field) => {
    const el = document.getElementById(id);
    if (el) el.value = val(target && target[field], 'zmt_store_' + field);
  };
  mapFil('settingsStoreNis', 'nis');
  mapFil('settingsStoreNif', 'nif');
  mapFil('settingsStoreRcc', 'rcc');
  mapFil('settingsStoreArticle', 'article');
}

// Live-reflect the pharmacy toggle on the settings card (chips + preview).
function settingsSyncPharmacyCard() {
  const card = document.getElementById('pharmacyCard');
  const input = document.getElementById('settingsPharmacyMode');
  const on = !!(input && input.checked);
  if (card) card.classList.toggle('active', on);
}

function init_settings() {
  const threshold = DB.getLowStockThreshold();
  document.getElementById('settingsLowStock').value = threshold;

  // Name + profile/legal fields come from the active (or default) company so the
  // settings page reflects the company currently in scope, not a shared global.
  // Populated once near the end of init by settingsUpdateActiveCompanyBar(),
  // which is also the refresh hook used on company switch.
  document.getElementById('settingsTimbreEnabled').checked = localStorage.getItem('zmt_timbre_enabled') === '1';
  document.getElementById('settingsTimbreRate').value = localStorage.getItem('zmt_timbre_rate') || '1';
  document.getElementById('settingsTvaRate').value = localStorage.getItem('zmt_tva_rate') || '0';
  const expShow = document.getElementById('settingsExpiryShow');
  if (expShow) expShow.checked = localStorage.getItem('zmt_expiry_enabled') !== '0';
  const expReq = document.getElementById('settingsExpiryRequired');
  if (expReq) expReq.checked = localStorage.getItem('zmt_expiry_required') === '1';
  const expWarn = document.getElementById('settingsExpiryWarn');
  if (expWarn) expWarn.value = localStorage.getItem('zmt_expiry_warn_days') || '30';

  const pharmMode = document.getElementById('settingsPharmacyMode');
  if (pharmMode) {
    pharmMode.checked = localStorage.getItem('zmt_pharmacy_mode') === '1';
    pharmMode.addEventListener('change', settingsSyncPharmacyCard);
    settingsSyncPharmacyCard();
  }

  const btnSnd = document.getElementById('settingsButtonSound');
  if (btnSnd) btnSnd.checked = localStorage.getItem('zmt_sound_buttons') !== '0';
  const introSnd = document.getElementById('settingsIntroSound');
  if (introSnd) introSnd.checked = localStorage.getItem('zmt_sound_intro') !== '0';

  // Customer tree: default OFF. Persist on every change so the last chosen
  // state survives even when the user leaves without pressing «حفظ».
  const cTreeEl = document.getElementById('settingsCustomerTree');
  if (cTreeEl) {
    cTreeEl.checked = localStorage.getItem('zmt_customer_tree') === '1';
    if (!cTreeEl._zmtCustomerTreeBound) {
      cTreeEl._zmtCustomerTreeBound = true;
      cTreeEl.addEventListener('change', function () {
        localStorage.setItem('zmt_customer_tree', cTreeEl.checked ? '1' : '0');
      });
    }
  }

  // Product QR codes: OFF unless explicitly enabled, remembered immediately.
  const productQrEl = document.getElementById('settingsProductQR');
  if (productQrEl) {
    productQrEl.checked = (typeof ProductQR !== 'undefined')
      ? ProductQR.enabled()
      : localStorage.getItem('zmt_product_qr_enabled') === '1';
    if (!productQrEl._zmtProductQrBound) {
      productQrEl._zmtProductQrBound = true;
      productQrEl.addEventListener('change', function () {
        if (typeof ProductQR !== 'undefined') ProductQR.set(productQrEl.checked);
        else localStorage.setItem('zmt_product_qr_enabled', productQrEl.checked ? '1' : '0');
        if (typeof ProductQR !== 'undefined') ProductQR.refreshCards();
      });
    }
  }

  const bcLayoutEl = document.getElementById('settingsBarcodeLayout');
  if (bcLayoutEl) bcLayoutEl.value = localStorage.getItem('zmt_barcode_input_layout') || 'auto';
  const bcCaseEl = document.getElementById('settingsBarcodeCase');
  if (bcCaseEl) bcCaseEl.value = localStorage.getItem('zmt_barcode_force_case') || 'none';

  document.getElementById('settingsLegalCustomer').checked = localStorage.getItem('zmt_inv_legal_customer') === '1';
  document.getElementById('settingsLegalSupplier').checked = localStorage.getItem('zmt_inv_legal_supplier') === '1';
  document.getElementById('settingsLegalEmployee').checked = localStorage.getItem('zmt_inv_legal_employee') === '1';

  // Party legal lines default to ON: anything but an explicit '0' is enabled.
  const _plc = document.getElementById('settingsPartyLegalCustomer');
  const _pls = document.getElementById('settingsPartyLegalSupplier');
  if (_plc) _plc.checked = localStorage.getItem('zmt_inv_party_legal_customer') !== '0';
  if (_pls) _pls.checked = localStorage.getItem('zmt_inv_party_legal_supplier') !== '0';

  // Show the real installed app version (matches the installer).
  if (window.electronAPI && window.electronAPI.appVersion) {
    window.electronAPI.appVersion().then(function (v) {
      const el = document.getElementById('settingsAppVersion');
      if (el && v) el.textContent = String(v);
    }).catch(function () {});
  }

  const langSelect = document.getElementById('settingsLang');
  if (langSelect && window.__lang) langSelect.value = window.__lang;

  // LAN sync radio listeners
  document.querySelectorAll('input[name="lanRole"]').forEach(r => {
    r.addEventListener('change', settingsShowLanSections);
  });

  settingsLoadLan();
  settingsLoadUsers();
  settingsLoadCompanies();
  settingsUpdateActiveCompanyBar();
  settingsApplyCompanyScope();
  settingsUpdateKeyStatus();
  settingsLoadProvider();
  settingsLoadLicense();
  _scheduleAuditLogLoad();
  prtInit();
  if (typeof settingsInitInvoiceLogo === 'function') settingsInitInvoiceLogo();
  if (typeof settingsInitDeleteProducts === 'function') settingsInitDeleteProducts();
}

const PROVIDER_INFO = {
  gemini: { label: 'Google Gemini', keyPlaceholder: 'AIzaSy...', keyLabel: '\u0645\u0641\u062A\u0627\u062D Gemini API',
    help: '\u0627\u062D\u0635\u0644 \u0639\u0644\u0649 \u0645\u0641\u062A\u0627\u062D \u0645\u062C\u0627\u0646\u064A \u0645\u0646 <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--primary)">Google AI Studio</a>',
    baseUrl: false },
  openai: { label: 'OpenAI (ChatGPT)', keyPlaceholder: 'sk-...', keyLabel: '\u0645\u0641\u062A\u0627\u062D OpenAI API',
    help: '\u0627\u062D\u0635\u0644 \u0639\u0644\u0649 \u0645\u0641\u062A\u0627\u062D \u0645\u0646 <a href="https://platform.openai.com/api-keys" target="_blank" style="color:var(--primary)">OpenAI Dashboard</a>',
    baseUrl: false },
  kimi: { label: 'Kimi (Moonshot AI)', keyPlaceholder: 'sk-...', keyLabel: '\u0645\u0641\u062A\u0627\u062D Kimi API',
    help: '\u0627\u062D\u0635\u0644 \u0639\u0644\u0649 \u0645\u0641\u062A\u0627\u062D \u0645\u0646 <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" style="color:var(--primary)">Moonshot AI</a>',
    baseUrl: true, defaultBaseUrl: 'https://api.moonshot.ai/v1/' },
  groq: { label: 'Groq (LPU Inference)', keyPlaceholder: 'gsk_...', keyLabel: '\u0645\u0641\u062A\u0627\u062D Groq API',
    help: '\u0627\u062D\u0635\u0644 \u0639\u0644\u0649 \u0645\u0641\u062A\u0627\u062D \u0645\u062C\u0627\u0646\u064A \u0645\u0646 <a href="https://console.groq.com/keys" target="_blank" style="color:var(--primary)">Groq Console</a>',
    baseUrl: false },
  custom: { label: 'Custom / Other API', keyPlaceholder: '\u0645\u0641\u062A\u0627\u062D API', keyLabel: '\u0645\u0641\u062A\u0627\u062D API',
    help: '\u0623\u062F\u062E\u0644 Base URL \u0644\u0645\u0632\u0648\u062F API \u0645\u062A\u0648\u0627\u0641\u0642 \u0645\u0639 OpenAI',
    baseUrl: true, defaultBaseUrl: '' },
};

async function settingsLoadProvider() {
  const provider = await AIAgent.getProvider();
  const select = document.getElementById('settingsAiProvider');
  if (select) select.value = provider;
  settingsApplyProvider(provider);
}

async function settingsChangeProvider() {
  const provider = document.getElementById('settingsAiProvider').value;
  await AIAgent.saveStored('zmt_ai_provider', provider);
  settingsApplyProvider(provider);
  settingsUpdateKeyStatus();
}

function settingsApplyProvider(provider) {
  const info = PROVIDER_INFO[provider];
  if (!info) return;

  document.getElementById('settingsAiKeyLabel').textContent = info.keyLabel;
  const input = document.getElementById('settingsAiKey');
  input.placeholder = info.keyPlaceholder;
  input.value = '';

  const helpRow = document.getElementById('settingsAiHelpText');
  helpRow.innerHTML = info.help;

  const baseUrlRow = document.getElementById('settingsBaseUrlRow');
  if (info.baseUrl) {
    baseUrlRow.style.display = '';
    const baseInput = document.getElementById('settingsAiBaseUrl');
    baseInput.value = info.defaultBaseUrl || '';
    baseInput.placeholder = info.defaultBaseUrl || 'https://api.example.com/v1/';
  } else {
    baseUrlRow.style.display = 'none';
  }
}

async function settingsUpdateKeyStatus() {
  const status = document.getElementById('settingsKeyStatus');
  if (!status) return;
  const configured = await AIAgent.isConfigured();
  status.innerHTML = configured
    ? '<span style="color:#28a745"><i class="fas fa-check-circle"></i> ' + (t('settings.aiKeySet') || 'المفتاح مضبوط') + '</span>'
    : '<span style="color:var(--silver-500)"><i class="fas fa-times-circle"></i> ' + (t('settings.aiKeyNotSet') || 'لم يتم تعيين المفتاح بعد') + '</span>';
}

let _settingsKeyVisible = false;
function settingsToggleKeyVisibility() {
  _settingsKeyVisible = !_settingsKeyVisible;
  const input = document.getElementById('settingsAiKey');
  const eye = document.getElementById('settingsKeyEye');
  if (input) { input.type = _settingsKeyVisible ? 'text' : 'password'; }
  if (eye) { eye.className = _settingsKeyVisible ? 'fas fa-eye-slash' : 'fas fa-eye'; }
}

async function settingsSaveAiKey() {
  const result = document.getElementById('settingsAiResult');
  const input = document.getElementById('settingsAiKey');
  const key = input.value.trim();
  if (!key) {
    result.innerHTML = '<span style="color:#dc3545;">' + (t('settings.enterApiKey') || '\u0627\u0644\u0631\u062C\u0627\u0621 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0645\u0641\u062A\u0627\u062D') + '</span>';
    return;
  }
  try {
    const provider = await AIAgent.getProvider();
    const baseInput = document.getElementById('settingsAiBaseUrl');
    if (baseInput && baseInput.style.display !== 'none') {
      const baseUrl = baseInput.value.trim();
      if (baseUrl) {
        await AIAgent.saveStored('zmt_ai_base_url', baseUrl);
      } else {
        await AIAgent.clearStored('zmt_ai_base_url');
      }
    }
    await AIAgent.saveApiKey(provider, key);
    input.value = '';
    result.innerHTML = '<span style="color:#28a745;"><i class="fas fa-check-circle"></i> ' + (t('settings.apiKeySaved') || '\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0628\u0634\u0643\u0644 \u0622\u0645\u0646') + '</span>';
    settingsUpdateKeyStatus();
  } catch (e) {
    result.innerHTML = '<span style="color:#dc3545;">' + (t('settings.errorPrefix') || '\u062E\u0637\u0623: ') + e.message + '</span>';
  }
}

async function settingsClearAiKey() {
  if (!confirm(t('settings.confirmClearKey') || '\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u0645\u0633\u062D \u0627\u0644\u0645\u0641\u062A\u0627\u062D\u061F')) return;
  const result = document.getElementById('settingsAiResult');
  try {
    const provider = await AIAgent.getProvider();
    await AIAgent.clearApiKey(provider);
    result.innerHTML = '<span style="color:#28a745;"><i class="fas fa-check-circle"></i> ' + (t('settings.apiKeyCleared') || '\u062A\u0645 \u0645\u0633\u062D \u0627\u0644\u0645\u0641\u062A\u0627\u062D') + '</span>';
    settingsUpdateKeyStatus();
  } catch (e) {
    result.innerHTML = '<span style="color:#dc3545;">' + e.message + '</span>';
  }
}

async function settingsTestAiKey() {
  const result = document.getElementById('settingsAiResult');
  const provider = await AIAgent.getProvider();
  const info = PROVIDER_INFO[provider];
  result.innerHTML = '<span style="color:var(--silver-500)"><i class="fas fa-spinner fa-spin"></i> ' + (t('settings.testing') || '\u062C\u0627\u0631\u064A \u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644...') + ' (' + (info?.label || provider) + ')</span>';
  try {
    const configured = await AIAgent.isConfigured(provider);
    if (!configured) {
      result.innerHTML = '<span style="color:#dc3545;">' + (t('settings.aiKeyNotSet') || '\u0627\u0644\u0645\u0641\u062A\u0627\u062D \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637') + '</span>';
      return;
    }
    const test = await AIAgent._call('Respond with just "OK".', 'You are a test assistant.');
    const modelInfo = AIAgent.getModelInfo ? AIAgent.getModelInfo() : null;
    const label = (info?.label || provider) + (modelInfo?.model ? ' [' + modelInfo.model + ']' : '');
    result.innerHTML = '<span style="color:#28a745;"><i class="fas fa-check-circle"></i> ' + (t('settings.testSuccess') || '\u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0646\u0627\u062C\u062D') + ' (' + label + '): ' + test.slice(0, 100) + '</span>';
  } catch (e) {
    result.innerHTML = '<span style="color:#dc3545;"><i class="fas fa-times-circle"></i> ' + (t('settings.testFailed') || '\u0641\u0634\u0644 \u0627\u0644\u0627\u062A\u0635\u0627\u0644: ') + e.message + '</span>';
  }
}

function saveSettings() {
  const threshold = parseInt(document.getElementById('settingsLowStock').value) || 5;
  DB.saveLowStockThreshold(threshold);

  const storeName = document.getElementById('settingsStoreName').value.trim() || 'ZMT PIECE';
  localStorage.setItem('zmt_store_name', storeName);

  // The general settings' name + profile/legal fields map to a company record:
  // the ACTIVE company when the user is inside one, otherwise the default
  // company. This keeps each company's identity independent so entering company
  // B shows and edits B's own name/legal info — not the previous company's.
  try {
    if (typeof DB !== 'undefined' && DB.getCompany && DB.updateCompany) {
      const target = _settingsActiveCompany() || _settingsResolveDefaultCompany();
      if (target) {
        const newName = document.getElementById('settingsCompanyName') ? document.getElementById('settingsCompanyName').value.trim() : '';
        const companyName = newName || target.name || storeName;
        // Persist the fallback so the field survives a restart even if the
        // company record is momentarily unavailable; the company stays in sync.
        if (newName) localStorage.setItem('zmt_company_name', newName);
        const profile = {
          name: companyName,
          storeName: storeName,
          phone: document.getElementById('settingsStorePhone').value.trim(),
          address: document.getElementById('settingsStoreAddress').value.trim(),
          nis: document.getElementById('settingsStoreNis').value.trim(),
          nif: document.getElementById('settingsStoreNif').value.trim(),
          rcc: document.getElementById('settingsStoreRcc').value.trim(),
          article: document.getElementById('settingsStoreArticle').value.trim(),
        };
        DB.updateCompany(target.id, profile);
        // Keep the active-company name visible in the current session.
        try {
          if (typeof DB.logAudit === 'function') {
            const active = _settingsActiveCompany();
            if (active && active.id === target.id) {
              DB.logAudit({ action: 'update', entity: 'company', entityId: target.id, detail: newName || companyName });
            }
          }
        } catch (e) {}
      }
    }
  } catch (e) { /* non-fatal: store fields still saved locally */ }

  // Refresh the company management cards so a saved store name (or any other
  // profile change) is immediately reflected under its company.
  if (typeof settingsLoadCompanies === 'function') {
    try { settingsLoadCompanies(); } catch (e) { /* non-fatal */ }
  }

  const storeAddress = document.getElementById('settingsStoreAddress').value.trim();
  localStorage.setItem('zmt_store_address', storeAddress);

  const storePhone = document.getElementById('settingsStorePhone').value.trim();
  localStorage.setItem('zmt_store_phone', storePhone);

  localStorage.setItem('zmt_timbre_enabled', document.getElementById('settingsTimbreEnabled').checked ? '1' : '0');
  localStorage.setItem('zmt_timbre_rate', document.getElementById('settingsTimbreRate').value);
  localStorage.setItem('zmt_tva_rate', document.getElementById('settingsTvaRate').value || '0');

  localStorage.setItem('zmt_barcode_input_layout', document.getElementById('settingsBarcodeLayout').value);
  localStorage.setItem('zmt_barcode_force_case', document.getElementById('settingsBarcodeCase').value);

  localStorage.setItem('zmt_store_nis', document.getElementById('settingsStoreNis').value.trim());
  localStorage.setItem('zmt_store_nif', document.getElementById('settingsStoreNif').value.trim());
  localStorage.setItem('zmt_store_rcc', document.getElementById('settingsStoreRcc').value.trim());
  localStorage.setItem('zmt_store_article', document.getElementById('settingsStoreArticle').value.trim());
  localStorage.setItem('zmt_inv_legal_customer', document.getElementById('settingsLegalCustomer').checked ? '1' : '0');
  localStorage.setItem('zmt_inv_legal_supplier', document.getElementById('settingsLegalSupplier').checked ? '1' : '0');
  localStorage.setItem('zmt_inv_legal_employee', document.getElementById('settingsLegalEmployee').checked ? '1' : '0');
  const _plcSave = document.getElementById('settingsPartyLegalCustomer');
  const _plsSave = document.getElementById('settingsPartyLegalSupplier');
  if (_plcSave) localStorage.setItem('zmt_inv_party_legal_customer', _plcSave.checked ? '1' : '0');
  if (_plsSave) localStorage.setItem('zmt_inv_party_legal_supplier', _plsSave.checked ? '1' : '0');

  localStorage.setItem('zmt_expiry_enabled', document.getElementById('settingsExpiryShow').checked ? '1' : '0');
  localStorage.setItem('zmt_expiry_required', document.getElementById('settingsExpiryRequired').checked ? '1' : '0');
  localStorage.setItem('zmt_expiry_warn_days', document.getElementById('settingsExpiryWarn').value || '30');

  // Pharmacy mode: turns on the expiry workflow (field shown, not mandatory) and
  // recolours the whole UI to the green/white/red medical skin.
  const pharmEl = document.getElementById('settingsPharmacyMode');
  const pharmOn = !!(pharmEl && pharmEl.checked);
  localStorage.setItem('zmt_pharmacy_mode', pharmOn ? '1' : '0');
  if (pharmOn) {
    localStorage.setItem('zmt_expiry_enabled', '1');
    const expShowEl = document.getElementById('settingsExpiryShow');
    if (expShowEl) expShowEl.checked = true;
  }
  if (typeof window.setPharmacyMode === 'function') window.setPharmacyMode(pharmOn);
  settingsSyncPharmacyCard();

  const btnSndEl = document.getElementById('settingsButtonSound');
  const introSndEl = document.getElementById('settingsIntroSound');
  localStorage.setItem('zmt_sound_buttons', btnSndEl && btnSndEl.checked ? '1' : '0');
  localStorage.setItem('zmt_sound_intro', introSndEl && introSndEl.checked ? '1' : '0');
  const cTreeSaveEl = document.getElementById('settingsCustomerTree');
  localStorage.setItem('zmt_customer_tree', cTreeSaveEl && cTreeSaveEl.checked ? '1' : '0');
  if (window.ZmtSound && typeof window.ZmtSound.setEnabled === 'function') {
    window.ZmtSound.setEnabled('buttons', !!(btnSndEl && btnSndEl.checked));
    window.ZmtSound.setEnabled('intro', !!(introSndEl && introSndEl.checked));
  }

  const lang = document.getElementById('settingsLang').value;
  if (lang && window.__lang !== lang && typeof window.setLanguage === 'function') {
    window.setLanguage(lang);
  }

  alert(t('settings.settingsSaved'));

  if (typeof CloudService !== 'undefined' && CloudService.isCloudConnected() && CloudService.hasData() && localStorage.getItem('zmt_cloud_autosync') === '1') {
    CloudService.triggerSync();
  }
}

// ===== STORE PASSWORD =====
async function settingsSavePassword() {
  const current = document.getElementById('settingsCurrentPass').value;
  const newPass = document.getElementById('settingsNewPass').value;
  const confirm = document.getElementById('settingsConfirmPass').value;
  const result = document.getElementById('settingsPassResult');

  const existing = Auth.getStorePassword();
  if (existing) {
    if (current !== existing) {
      result.innerHTML = `<span style="color:#dc3545;">${t('settings.wrongPassword')}</span>`;
      return;
    }
  } else {
    try {
      const verified = await Auth.verifyCloudPassword(Auth.getUserCode(), current || '');
      if (!verified && current) {
        result.innerHTML = `<span style="color:#dc3545;">${t('settings.wrongPassword')}</span>`;
        return;
      }
    } catch (e) {
      if (current) {
        result.innerHTML = `<span style="color:#dc3545;">${t('settings.verifyError')} ${e.message}</span>`;
        return;
      }
    }
  }

  if (!newPass || newPass.length < 4) {
    result.innerHTML = `<span style="color:#dc3545;">${t('settings.passwordMinLength')}</span>`;
    return;
  }
  if (newPass !== confirm) {
    result.innerHTML = `<span style="color:#dc3545;">${t('settings.passwordsNoMatch')}</span>`;
    return;
  }

  try {
    await Auth.setStorePassword(newPass);
    result.innerHTML = `<span style="color:#28a745;">${t('settings.passwordSaved')}</span>`;
    document.getElementById('settingsCurrentPass').value = '';
    document.getElementById('settingsNewPass').value = '';
    document.getElementById('settingsConfirmPass').value = '';
  } catch (e) {
    result.innerHTML = `<span style="color:#dc3545;">${t('settings.errorPrefix')} ${e.message}</span>`;
  }
}

// ===== USERS MANAGEMENT =====
let _settingsEditingUser = null;

function settingsBuildPermissionsGrid(perms) {
  const grid = document.getElementById('settingsPermissionsGrid');
  if (!grid) return;
  const pages = Auth.DEFAULT_PAGES;
  const names = Auth.PAGE_NAMES;
  let html = `<table class="settings-perm-table"><thead><tr><th>${t('settings.colPage')}</th><th>${t('settings.colView')}</th><th>${t('settings.colEdit')}</th><th>${t('settings.colDelete')}</th></tr></thead><tbody>`;
  for (const [key, defaults] of Object.entries(pages)) {
    const p = perms[key] || defaults;
    html += `<tr>
      <td>${names[key] || key}</td>
      <td><input type="checkbox" data-page="${key}" data-perm="view" ${p.view ? 'checked' : ''}></td>
      <td><input type="checkbox" data-page="${key}" data-perm="edit" ${p.edit ? 'checked' : ''}></td>
      <td><input type="checkbox" data-page="${key}" data-perm="del" ${p.del ? 'checked' : ''}></td>
    </tr>`;
  }
  html += '</tbody></table>';
  grid.innerHTML = html;
}

function settingsShowAddUser() {
  _settingsEditingUser = null;
  document.getElementById('settingsAddUserForm').style.display = '';
  document.getElementById('settingsNewUsername').value = '';
  document.getElementById('settingsNewUserPass').value = '';
  document.getElementById('settingsUserResult').textContent = '';
  settingsRenderUserCompanyList(null);
  settingsBuildPermissionsGrid(Auth.DEFAULT_PAGES);
}

function settingsCancelAddUser() {
  document.getElementById('settingsAddUserForm').style.display = 'none';
  _settingsEditingUser = null;
}

function settingsGetPermissionsFromGrid() {
  const perms = {};
  document.querySelectorAll('#settingsPermissionsGrid input[type="checkbox"]').forEach(cb => {
    const page = cb.dataset.page;
    const perm = cb.dataset.perm;
    if (!perms[page]) perms[page] = {};
    perms[page][perm] = cb.checked;
  });
  return perms;
}

async function settingsSaveUser() {
  const username = document.getElementById('settingsNewUsername').value.trim();
  const password = document.getElementById('settingsNewUserPass').value;
  const result = document.getElementById('settingsUserResult');
  const perms = settingsGetPermissionsFromGrid();

  if (!username) {
    result.innerHTML = `<span style="color:#dc3545;">${t('settings.enterUsername')}</span>`;
    return;
  }
  if (!password && !_settingsEditingUser) {
    result.innerHTML = `<span style="color:#dc3545;">${t('settings.enterPassword')}</span>`;
    return;
  }

  try {
    // Multi-company assignment: read the checked companies from the checkbox list.
    const companyIds = settingsReadUserCompanyChecks();
    if (companyIds.some(id => settingsPermittedCompanyIds().indexOf(id) === -1)) {
      result.innerHTML = `<span style="color:#dc3545;">${t('settings.companyNotPermitted')}</span>`;
      return;
    }
    if (_settingsEditingUser) {
      const updates = { permissions: perms };
      if (password) updates.password = password;
      updates.companyIds = companyIds.length ? companyIds : [];
      await Auth.updateUser(_settingsEditingUser.id, updates);
      if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'update', entity: 'user', entityId: _settingsEditingUser.id, detail: username });
      result.innerHTML = `<span style="color:#28a745;">${t('settings.userUpdated')}</span>`;
    } else {
      const created = await Auth.createUser(username, password, perms, companyIds);
      if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'add', entity: 'user', entityId: (created && created.id) || null, detail: username });
      result.innerHTML = `<span style="color:#28a745;">${t('settings.userCreated')}</span>`;
    }
    document.getElementById('settingsNewUsername').value = '';
    document.getElementById('settingsNewUserPass').value = '';
    _settingsEditingUser = null;
    settingsRenderUserCompanyList(null);
    settingsLoadUsers();
    if (typeof LANSync !== 'undefined' && LANSync.sendUsers) LANSync.sendUsers();
  } catch (e) {
    result.innerHTML = `<span style="color:#dc3545;">${t('settings.errorPrefix')} ${e.message}</span>`;
  }
}

async function settingsLoadUsers() {
  const list = document.getElementById('settingsUsersList');
  const empty = document.getElementById('settingsUsersEmpty');
  if (!list) return;

  try {
    const users = await Auth.listUsers();
    if (users.length === 0) {
      list.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = users.map(u => {
      const pages = Auth.PAGE_NAMES;
      const permList = Object.entries(u.permissions || {})
        .filter(([, v]) => v.view || v.edit || v.del)
        .map(([k]) => pages[k] || k)
        .join('، ');
      return `<div class="settings-user-card">
        <div class="settings-user-info">
          <div class="settings-user-name"><i class="fas fa-user"></i> ${u.username}</div>
          <div class="settings-user-perms">${permList || t('settings.noPerms')}</div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="settingsEditUser('${u.id}')" title="${t('settings.colEdit')}"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger" onclick="settingsDeleteUser('${u.id}', '${u.username}')" title="${t('settings.colDelete')}"><i class="fas fa-trash"></i></button>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<p style="color:#dc3545;">${t('settings.errorPrefix')} ${e.message}</p>`;
  }
}

async function settingsEditUser(userId) {
  const users = await Auth.listUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;
  _settingsEditingUser = user;
  document.getElementById('settingsAddUserForm').style.display = '';
  document.getElementById('settingsNewUsername').value = user.username;
  document.getElementById('settingsNewUserPass').value = '';
  document.getElementById('settingsUserResult').textContent = '';
  settingsRenderUserCompanyList(user);
  settingsBuildPermissionsGrid(user.permissions || Auth.DEFAULT_PAGES);
}

// Render the multi-company checkbox list for the user form. `user` carries the
// current assignment (companyIds / companyId); checked boxes default to those.
// The branch owner only sees the companies granted to his branch's code.
function settingsRenderUserCompanyList(user) {
  const container = document.getElementById('settingsNewUserCompanyList');
  if (!container) return;
  let companies = [];
  try {
    if (typeof Auth !== 'undefined' && Auth.getCompaniesForThisDevice) {
      companies = Auth.getCompaniesForThisDevice();
    } else if (typeof DB !== 'undefined' && DB.getCompanies) {
      companies = DB.getCompanies();
    }
  } catch (e) { companies = []; }

  const permitted = settingsPermittedCompanyIds();
  // Keep assignments that are no longer permitted so editing never silently
  // drops them; they are shown but disabled.
  const foreign = [];
  if (user) {
    const assigned = Array.isArray(user.companyIds) ? user.companyIds
      : (user.companyId ? [user.companyId] : []);
    assigned.forEach(id => {
      if (permitted.indexOf(id) === -1 && !companies.find(c => c.id === id)) {
        const c = (typeof DB !== 'undefined' && DB.getCompany) ? DB.getCompany(id) : null;
        foreign.push({ id, name: (c && c.name) ? c.name : id });
      }
    });
  }

  const all = companies.concat(foreign);
  if (!all.length) {
    container.innerHTML = '<span class="text-muted" style="font-size:12px">' + t('settings.companyNoPermitted') + '</span>';
    return;
  }
  const assigned = (user)
    ? (Array.isArray(user.companyIds) ? user.companyIds : (user.companyId ? [user.companyId] : []))
    : [];
  container.innerHTML = all.map(c => {
    const checked = assigned.indexOf(c.id) !== -1;
    const disallowed = permitted.indexOf(c.id) === -1;
    const value = c.id.replace(/'/g, "\\'");
    return `<label class="settings-company-chip" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--silver-300);border-radius:20px;background:#fff;cursor:pointer;font-size:13px;${disallowed ? 'opacity:.6' : ''}">
      <input type="checkbox" data-user-company="${value}" ${checked ? 'checked' : ''} ${disallowed ? 'disabled' : ''}>
      ${c.name}
    </label>`;
  }).join('');
}

// Read the currently checked companies from the user form.
function settingsReadUserCompanyChecks() {
  const container = document.getElementById('settingsNewUserCompanyList');
  if (!container) return [];
  return Array.prototype.map.call(
    container.querySelectorAll('input[type=checkbox][data-user-company]:checked'),
    el => el.getAttribute('data-user-company')
  ).filter(Boolean);
}

async function settingsDeleteUser(userId, username) {
  if (!confirm(t('settings.delete_user_confirm').replace('...', username))) return;
  try {
    await Auth.deleteUser(userId);
    if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'delete', entity: 'user', entityId: userId, detail: username });
    settingsLoadUsers();
    if (typeof LANSync !== 'undefined' && LANSync.sendUsers) LANSync.sendUsers();
  } catch (e) {
    alert(t('settings.errorPrefix') + ' ' + e.message);
  }
}

// ===== COMPANIES MANAGEMENT =====
let _settingsEditingCompany = null;

function settingsUpdateActiveCompanyBar() {
  const bar = document.getElementById('settingsActiveCompanyBar');
  const nameEl = document.getElementById('settingsActiveCompanyName');
  if (!bar) return;
  const cid = (typeof Auth !== 'undefined' && Auth.getCompanyId) ? Auth.getCompanyId() : '';
  if (!cid) {
    bar.style.display = 'none';
  } else {
    const name = (typeof Auth !== 'undefined' && Auth.getCompanyName) ? Auth.getCompanyName() : cid;
    if (nameEl) nameEl.textContent = name || cid;
    bar.style.display = '';
  }
  // Refresh the name/profile fields when entering or exiting a company so they
  // always show the correct scope (active company vs default/global).
  settingsPopulateCompanyFields();
}

// Only the main store may create/edit/delete companies. Branch stores can only
// assign employees to the companies that authorize them (via storeCodes).
function settingsCompaniesManageable() {
  // A company process is a single-company appliance: no create/switch/delete.
  if (typeof window !== 'undefined' && window.CompanyProfile && window.CompanyProfile.isolated) return false;
  return (typeof Auth !== 'undefined' && Auth.getStoreType)
    ? Auth.getStoreType() === 'main'
    : true;
}

// Hide the company-management card on branch stores so employees at a branch
// cannot create or edit companies — they only assign staff to their companies.
function settingsApplyCompanyScope() {
  const card = document.getElementById('settingsCompaniesCard');
  if (!card) return;
  card.style.display = settingsCompaniesManageable() ? '' : 'none';
}

// Company ids permitted for the current device (filtered by its store/branch
// code), so a branch can only assign staff to the companies that include it.
function settingsPermittedCompanyIds() {
  let companies = [];
  try {
    if (typeof Auth !== 'undefined' && Auth.getCompaniesForThisDevice) {
      companies = Auth.getCompaniesForThisDevice();
    } else if (typeof DB !== 'undefined' && DB.getCompanies) {
      companies = DB.getCompanies();
    }
  } catch (e) { companies = []; }
  return companies.map(c => c.id);
}

// Fill the multi-select with the store's created branches. Companies are
// run-level (stored in the MAIN store's backup), so this must run on the main
// store where branch management is available. Read-only per the isolation
// rules: only branch NAMES/CODES are listed, never another store's data.
async function settingsPopulateBranchOptions() {
  const select = document.getElementById('settingsNewCompanyStoreCodes');
  const status = document.getElementById('settingsCompanyBranchesStatus');
  if (!select) return;
  select.innerHTML = '';
  let branches = [];
  try {
    if (typeof Auth !== 'undefined' && typeof Auth.listBranchesFull === 'function') {
      branches = (await Auth.listBranchesFull()) || [];
    }
  } catch (e) {
    branches = [];
  }
  if (!branches.length) {
    if (status) status.textContent = t('settings.companyNoBranches') || 'لا توجد فروع منشأة بعد';
    return;
  }
  if (status) status.textContent = t('settings.companyStoreCodesHint') || 'اختر فرعًا أو أكثر (تركه فارغًا = لن تظهر هذه الشركة لأي فرع)';
  branches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.code;
    opt.textContent = (b.name || b.code) + ' (' + b.code + ')';
    select.appendChild(opt);
  });
}

function settingsSetSelectedBranches(codes) {
  const select = document.getElementById('settingsNewCompanyStoreCodes');
  if (!select) return;
  const set = new Set((codes || []).map(String));
  Array.from(select.options).forEach(o => { o.selected = set.has(o.value); });
}

async function settingsShowAddCompany() {
  if (!settingsCompaniesManageable()) {
    alert(t('settings.companyManageDenied'));
    return;
  }
  _settingsEditingCompany = null;
  document.getElementById('settingsAddCompanyForm').style.display = '';
  document.getElementById('settingsNewCompanyName').value = '';
  document.getElementById('settingsNewCompanyStoreName').value = '';
  document.getElementById('settingsNewCompanyPass').value = '';
  settingsSetSelectedBranches([]);
  document.getElementById('settingsCompanyResult').textContent = '';
  await settingsPopulateBranchOptions();
}

function settingsCancelAddCompany() {
  document.getElementById('settingsAddCompanyForm').style.display = 'none';
  settingsSetSelectedBranches([]);
  _settingsEditingCompany = null;
}

async function settingsSaveCompany() {
  const name = document.getElementById('settingsNewCompanyName').value.trim();
  const storeName = document.getElementById('settingsNewCompanyStoreName').value.trim();
  const password = document.getElementById('settingsNewCompanyPass').value;
  const select = document.getElementById('settingsNewCompanyStoreCodes');
  const storeCodes = Array.from(select ? select.selectedOptions : []).map(o => o.value);
  const result = document.getElementById('settingsCompanyResult');
  if (!name) {
    result.innerHTML = `<span style="color:#dc3545;">${t('settings.companyNameRequired')}</span>`;
    return;
  }
  // Company profile / legal info shown on invoices, receipts and barcode label.
  const legalFields = {
    storeName: storeName,
    phone: document.getElementById('settingsNewCompanyPhone').value.trim(),
    address: document.getElementById('settingsNewCompanyAddress').value.trim(),
    nis: document.getElementById('settingsNewCompanyNis').value.trim(),
    nif: document.getElementById('settingsNewCompanyNif').value.trim(),
    rcc: document.getElementById('settingsNewCompanyRcc').value.trim(),
    article: document.getElementById('settingsNewCompanyArticle').value.trim()
  };
  try {
    if (_settingsEditingCompany) {
      const updates = { name, storeCodes, ...legalFields };
      if (password) {
        const { hash, salt } = await Auth.hashPassword(password);
        updates.passwordHash = hash;
        updates.passwordSalt = salt;
      }
      await DB.updateCompany(_settingsEditingCompany.id, updates);
      if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'update', entity: 'company', entityId: _settingsEditingCompany.id, detail: name });
      result.innerHTML = `<span style="color:#28a745;">${t('settings.companyUpdated')}</span>`;
    } else {
      const data = { name, storeCodes, ...legalFields };
      if (password) {
        const { hash, salt } = await Auth.hashPassword(password);
        data.passwordHash = hash;
        data.passwordSalt = salt;
      }
      const created = DB.addCompany(data);
      if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'add', entity: 'company', entityId: (created && created.id) || null, detail: name });
      result.innerHTML = `<span style="color:#28a745;">${t('settings.companyCreated')}</span>`;
    }
    document.getElementById('settingsNewCompanyName').value = '';
    document.getElementById('settingsNewCompanyStoreName').value = '';
    document.getElementById('settingsNewCompanyPass').value = '';
    document.getElementById('settingsNewCompanyStoreCodes').value = '';
    document.getElementById('settingsNewCompanyPhone').value = '';
    document.getElementById('settingsNewCompanyAddress').value = '';
    document.getElementById('settingsNewCompanyNis').value = '';
    document.getElementById('settingsNewCompanyNif').value = '';
    document.getElementById('settingsNewCompanyRcc').value = '';
    document.getElementById('settingsNewCompanyArticle').value = '';
    _settingsEditingCompany = null;
    settingsLoadCompanies();
    settingsUpdateActiveCompanyBar();
  } catch (e) {
    result.innerHTML = `<span style="color:#dc3545;">${t('settings.errorPrefix')} ${e.message}</span>`;
  }
}

function settingsLoadCompanies() {
  const list = document.getElementById('settingsCompaniesList');
  const empty = document.getElementById('settingsCompaniesEmpty');
  if (!list) return;
  const companies = (typeof DB !== 'undefined' && DB.getCompanies) ? DB.getCompanies() : [];
  if (companies.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  const activeId = (typeof Auth !== 'undefined' && Auth.getCompanyId) ? Auth.getCompanyId() : '';
  list.innerHTML = companies.map(c => {
    const isActive = c.id === activeId;
    const safeName = String(c.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div class="settings-user-card">
      <div class="settings-user-info">
        <div class="settings-user-name"><i class="fas fa-building"></i> ${c.name}${c.storeName ? `<div style="font-size:11px;opacity:.7;margin-top:2px">${escHtml(c.storeName)}</div>` : ''}</div>
        <div class="settings-user-perms">${isActive ? '<span style="color:#28a745;font-weight:700">✓ ' + t('settings.companyIsActive') + '</span>' : ''}</div>
      </div>
      ${isActive ? '' : `<button class="btn btn-sm btn-primary" onclick="settingsEnterCompany('${c.id}')" title="${t('settings.enterCompany')}"><i class="fas fa-sign-in-alt"></i></button>`}
      <button class="btn btn-sm btn-primary settings-company-action" onclick="settingsOpenIsolated('${c.id}', '${safeName}')" title="${t('settings.openIsolated')}"><i class="fas fa-external-link-alt"></i> <span data-i18n="settings.openIsolated">فتح نافذة مستقلة</span></button>
      <button class="btn btn-sm settings-company-action" onclick="settingsCreateCompanyShortcut('${c.id}', '${safeName}')" title="${t('settings.createShortcut')}"><i class="fas fa-desktop"></i> <span data-i18n="settings.createShortcut">اختصار سطح المكتب</span></button>
      <button class="btn btn-sm" onclick="settingsEditCompany('${c.id}')" title="${t('settings.colEdit')}"><i class="fas fa-edit"></i></button>
      <button class="btn btn-sm" onclick="settingsResetCompanyData('${c.id}', '${safeName}')" title="${t('settings.resetCompanyData')}"><i class="fas fa-broom"></i></button>
      <button class="btn btn-sm btn-danger" onclick="settingsDeleteCompany('${c.id}', '${safeName}')" title="${t('settings.colDelete')}"><i class="fas fa-trash"></i></button>
    </div>`;
  }).join('');
}

// An installed build can be older than the renderer (main.js is read once at
// startup). Ask the main process before invoking: a missing channel now yields
// a clear localised message instead of Electron's raw English IPC error.
async function settingsCompanyIpcReady() {
  const api = (typeof window !== 'undefined') ? window.electronAPI : null;
  if (api && typeof api.companyIpcStatus === 'function') {
    try {
      const status = await api.companyIpcStatus();
      if (status && status.ok) return;
    } catch (e) { /* fall through to the stale-build message */ }
  }
  throw new Error(t('settings.staleBuild'));
}

// Prepare a company-scoped snapshot for its own Electron process / userData.
// The main process writes migration.json (keeping a .bak) first; the isolated
// process imports it once on boot and then never reads the shared DB again.
async function settingsPrepareCompanySnapshot(companyId, companyName) {
  const api = (typeof window !== 'undefined') ? window.electronAPI : null;
  if (!api || typeof api.prepareCompanySnapshot !== 'function') {
    throw new Error(t('settings.snapshotError') + ' Electron API');
  }
  await settingsCompanyIpcReady();
  const db = (typeof DB !== 'undefined' && DB.exportAll) ? DB.exportAll() : null;
  if (!db) throw new Error(t('settings.snapshotError') + ' DB');

  let defaultId = '';
  try { defaultId = (DB.getDefaultCompany && DB.getDefaultCompany() || {}).id || ''; } catch (e) {}
  const isDefault = !defaultId || defaultId === companyId;
  const stores = [
    'products', 'invoices', 'payments', 'customers', 'suppliers',
    'discounts', 'returns', 'transfers', 'supplierReturns', 'routeDocs',
    'orders', 'employees', 'attendance', 'auditLogs',
  ];
  const scopedDb = {
    meta: Object.assign({}, db.meta || {}, { defaultCompanyId: companyId }),
    companies: [Object.assign({}, DB.getCompany(companyId) || {}, { id: companyId, name: companyName || (DB.getCompany(companyId) || {}).name || companyId })],
  };
  stores.forEach(key => {
    const rows = Array.isArray(db[key]) ? db[key] : null;
    if (!rows) return;
    scopedDb[key] = rows.filter(row => {
      if (!row || typeof row !== 'object') return false;
      if (row.companyId === companyId) return true;
      return isDefault && !row.companyId;
    });
  });

  const localStorageMirror = {};
  const exclude = ['zmt_auth_user', 'zmt_active_company', 'zmt_remembered_company', 'zmt_scope_log', 'zmt_last_scope'];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('zmt_')) continue;
    if (exclude.indexOf(key) !== -1) continue;
    // LAN/phone/cloud ownership remains with the shared main instance.
    if (/^zmt_(lan|cloud|phs|psale)_/.test(key)) continue;
    localStorageMirror[key] = localStorage.getItem(key);
  }

  const payload = {
    version: 1,
    companyId,
    companyName: companyName || '',
    createdAt: Date.now(),
    db: scopedDb,
    localStorage: localStorageMirror,
  };
  const result = await api.prepareCompanySnapshot(companyId, payload);
  if (!result || !result.success) {
    throw new Error((result && result.error) || 'UNKNOWN');
  }
  return result;
}

async function settingsOpenIsolated(companyId, companyName) {
  if (window.CompanyProfile && window.CompanyProfile.isolated) {
    alert(t('settings.isolatedOnly'));
    return;
  }
  try {
    await settingsPrepareCompanySnapshot(companyId, companyName);
    const api = window.electronAPI || {};
    const res = await api.openCompanyWindow(companyId);
    if (!res || !res.success) throw new Error((res && res.error) || 'UNKNOWN');
    alert(t('settings.openDone'));
  } catch (e) {
    alert(t('settings.openError') + ' ' + (e && e.message ? e.message : String(e)));
  }
}

async function settingsCreateCompanyShortcut(companyId, companyName) {
  if (window.CompanyProfile && window.CompanyProfile.isolated) {
    alert(t('settings.isolatedOnly'));
    return;
  }
  try {
    await settingsPrepareCompanySnapshot(companyId, companyName);
    const api = window.electronAPI || {};
    const res = await api.createCompanyShortcut(companyId, companyName);
    if (!res || !res.success) throw new Error((res && res.error) || 'UNKNOWN');
    alert(t('settings.shortcutDone'));
  } catch (e) {
    alert(t('settings.shortcutError') + ' ' + (e && e.message ? e.message : String(e)));
  }
}

async function settingsEditCompany(companyId) {
  if (!settingsCompaniesManageable()) {
    alert(t('settings.companyManageDenied'));
    return;
  }
  const c = DB.getCompany(companyId);
  if (!c) return;
  _settingsEditingCompany = c;
  document.getElementById('settingsAddCompanyForm').style.display = '';
  document.getElementById('settingsNewCompanyName').value = c.name || '';
  document.getElementById('settingsNewCompanyStoreName').value = c.storeName || '';
  document.getElementById('settingsNewCompanyPass').value = '';
  document.getElementById('settingsNewCompanyPhone').value = c.phone || '';
  document.getElementById('settingsNewCompanyAddress').value = c.address || '';
  document.getElementById('settingsNewCompanyNis').value = c.nis || '';
  document.getElementById('settingsNewCompanyNif').value = c.nif || '';
  document.getElementById('settingsNewCompanyRcc').value = c.rcc || '';
  document.getElementById('settingsNewCompanyArticle').value = c.article || '';
  document.getElementById('settingsCompanyResult').textContent = '';
  await settingsPopulateBranchOptions();
  settingsSetSelectedBranches(c.storeCodes);
}

async function settingsDeleteCompany(companyId, companyName) {
  if (!settingsCompaniesManageable()) {
    alert(t('settings.companyManageDenied'));
    return;
  }
  if (!confirm(t('settings.confirmDeleteCompany').replace('...', companyName || ''))) return;
  try {
    DB.removeCompany(companyId);
    if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'delete', entity: 'company', entityId: companyId, detail: companyName });
    if ((typeof Auth !== 'undefined' && Auth.getCompanyId ? Auth.getCompanyId() : '') === companyId) {
      settingsExitCompany();
    }
    settingsLoadCompanies();
    settingsUpdateActiveCompanyBar();
  } catch (e) {
    alert(t('settings.errorPrefix') + ' ' + e.message);
  }
}

async function settingsEnterCompany(companyId) {
  try {
    await Auth.enterCompany(companyId, '');
    const verifyCid = (typeof Auth.getCompanyId === 'function') ? Auth.getCompanyId() : '';
    if (verifyCid !== companyId) {
      try { localStorage.setItem('zmt_active_company', companyId); } catch {}
    }
    if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'update', entity: 'session', entityId: companyId, detail: 'enter_company' });
    settingsLoadCompanies();
    settingsUpdateActiveCompanyBar();
    if (typeof applyTranslation === 'function') applyTranslation();
    try { if (typeof renderSidebarCompany === 'function') renderSidebarCompany(); } catch (e) {}
    alert(t('settings.enteredCompany'));
  } catch (e) {
    alert(t('settings.errorPrefix') + ' ' + e.message);
  }
}

async function settingsResetCompanyData(companyId, companyName) {
  if (!settingsCompaniesManageable()) {
    alert(t('settings.companyManageDenied'));
    return;
  }
  const name = companyName || '';
  if (!confirm(t('settings.confirmResetCompanyData').replace('...', name + ' — '))) return;
  if (!confirm(t('settings.confirmResetCompanyDataFinal'))) return;
  try {
    const n = (typeof DB !== 'undefined' && DB.deleteCompanyData) ? await DB.deleteCompanyData(companyId) : 0;
    if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'delete', entity: 'company_data', entityId: companyId, detail: name + ' (' + n + ')', data: { company: companyId, removed: n } });
    alert(t('settings.resetCompanyDataDone').replace('...', String(n)));
    settingsLoadCompanies();
  } catch (e) {
    alert(t('settings.errorPrefix') + ' ' + e.message);
  }
}

function settingsExitCompany() {
  try {
    if (typeof Auth !== 'undefined' && Auth.setActiveCompany) Auth.setActiveCompany('');
    if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'update', entity: 'session', entityId: '', detail: 'exit_company' });
  } catch (e) {}
  settingsLoadCompanies();
  settingsUpdateActiveCompanyBar();
  if (typeof applyTranslation === 'function') applyTranslation();
  try { if (typeof renderSidebarCompany === 'function') renderSidebarCompany(); } catch (e) {}
}

function getStoreInfo() {
  // Centralized in barcode-print.js: returns the active company when set,
  // otherwise falls back to the store's stored values.
  if (typeof window.getPrintInfo === 'function') return window.getPrintInfo();
  return {
    name: localStorage.getItem('zmt_store_name') || 'ZMT PIECE',
    address: localStorage.getItem('zmt_store_address') || '',
    phone: localStorage.getItem('zmt_store_phone') || '',
    nis: localStorage.getItem('zmt_store_nis') || '',
    nif: localStorage.getItem('zmt_store_nif') || '',
    rcc: localStorage.getItem('zmt_store_rcc') || '',
    article: localStorage.getItem('zmt_store_article') || '',
  };
}

// Whether the company's legal identifiers (NIS/NIF/RC/ARTICLE) should appear
// on a printed invoice, depending on the invoice's party type.
function getLegalInfoVisibility() {
  return {
    customer: localStorage.getItem('zmt_inv_legal_customer') === '1',
    supplier: localStorage.getItem('zmt_inv_legal_supplier') === '1',
    employee: localStorage.getItem('zmt_inv_legal_employee') === '1',
  };
}

function getTimbreConfig() {
  return {
    enabled: localStorage.getItem('zmt_timbre_enabled') === '1',
    rate: parseFloat(localStorage.getItem('zmt_timbre_rate') || '1'),
  };
}

function getTvaRate() {
  return parseFloat(localStorage.getItem('zmt_tva_rate') || '0');
}

// Pharmacy mode flag (green/white/red skin + expiry workflow). Global.
function getPharmacyMode() {
  return localStorage.getItem('zmt_pharmacy_mode') === '1';
}

// Customer tree flag. Default OFF; the last explicit choice is persisted.
function getCustomerTreeEnabled() {
  return localStorage.getItem('zmt_customer_tree') === '1';
}
if (typeof window !== 'undefined') window.getCustomerTreeEnabled = getCustomerTreeEnabled;

// ===== LAN SYNC SETTINGS =====
function settingsLoadLan() {
  const cfg = (typeof LANSync !== 'undefined') ? LANSync.getConfig() : { role: '', ip: '', port: 4512 };
  const off = document.getElementById('lanRoleOff');
  const main = document.getElementById('lanRoleMain');
  const sub = document.getElementById('lanRoleSub');
  if (off) off.checked = cfg.role === '' || !cfg.role;
  if (main) main.checked = cfg.role === 'main';
  if (sub) sub.checked = cfg.role === 'sub';
  const port = document.getElementById('lanPort');
  if (port) port.value = cfg.port || 4512;
  const ip = document.getElementById('lanServerIp');
  if (ip) ip.value = cfg.ip || '';
  settingsShowLanSections();
  settingsUpdateLanStatus();
  settingsLoadLanIps();
}

function settingsShowLanSections() {
  const role = document.querySelector('input[name="lanRole"]:checked')?.value || '';
  document.getElementById('lanMainSection').style.display = role === 'main' ? '' : 'none';
  document.getElementById('lanSubSection').style.display = role === 'sub' ? '' : 'none';
}

async function settingsLoadLanIps() {
  const el = document.getElementById('lanLocalIps');
  if (!el) return;
  el.textContent = '-';
  try {
    if (window.electronAPI?.lanGetLocalIp) {
      const ips = await window.electronAPI.lanGetLocalIp();
      el.textContent = (ips && ips.length) ? ips.join('  /  ') : '-';
    }
  } catch (e) { el.textContent = '-'; }
}

function settingsUpdateLanStatus() {
  const box = document.getElementById('lanStatusBox');
  if (!box) return;
  const cfg = (typeof LANSync !== 'undefined') ? LANSync.getConfig() : { role: '', ip: '', port: 4512 };
  const st = (typeof LANSync !== 'undefined') ? LANSync.getStatus() : null;
  if (!cfg.role) {
    box.innerHTML = `<span style="color:var(--silver-500)">${t('settings.lanStatusOff')}</span>`;
    return;
  }
  if (cfg.role === 'main') {
    const clients = st ? st.clients : 0;
    const running = st ? st.listening : false;
    const activePort = st ? st.activePort : 0;
    const dot = running ? '<span style="color:#28a745">●</span>' : '<span style="color:#dc3545">●</span>';
    let html = `${dot} ${running ? t('settings.lanStatusMainOn') : t('settings.lanStatusMainOff')} — ${t('settings.lanStatusClients')}: ${clients}`;
    if (running && activePort) {
      html += ` — ${t('settings.lanListeningPort')}: <span style="font-family:monospace" dir="ltr">${activePort}</span>`;
    }
    box.innerHTML = html;
    return;
  }
  const connected = st ? st.connected : false;
  const dot = connected ? '<span style="color:#28a745">●</span>' : '<span style="color:#dc3545">●</span>';
  box.innerHTML = `${dot} ${connected ? t('settings.lanStatusSubOn') : t('settings.lanStatusSubOff')}`;
}

async function settingsSaveLan() {
  const role = document.querySelector('input[name="lanRole"]:checked')?.value || '';
  const ip = document.getElementById('lanServerIp')?.value.trim() || '';
  const port = parseInt(document.getElementById('lanPort')?.value || '4512', 10) || 4512;
  const result = document.getElementById('lanResult');
  if (role === 'sub' && !ip) {
    if (result) result.innerHTML = `<span style="color:#dc3545;">${t('settings.lanIpRequired')}</span>`;
    return;
  }
  try {
    if (typeof LANSync !== 'undefined') {
      await LANSync.reconfigure(role, ip, port);
    } else {
      localStorage.setItem('zmt_lan_role', role);
      localStorage.setItem('zmt_lan_ip', ip);
      localStorage.setItem('zmt_lan_port', String(port));
    }
    settingsShowLanSections();
    settingsUpdateLanStatus();
    if (result) result.innerHTML = `<span class="text-success">${t('settings.lanSaved')}</span>`;
    if (role === 'main') settingsEnsureFirewall();
    else if (role === 'sub') settingsWatchSubConnect();
  } catch (e) {
    if (result) result.innerHTML = `<span style="color:#dc3545;">${t('common.error')}: ${e.message}</span>`;
  }
}

async function settingsTestLan() {
  const ip = document.getElementById('lanServerIp')?.value.trim() || '';
  const port = parseInt(document.getElementById('lanPort')?.value || '4512', 10) || 4512;
  const el = document.getElementById('lanTestResult');
  const btn = document.getElementById('lanTestBtn');
  if (!ip) {
    if (el) el.innerHTML = `<span style="color:#dc3545;">${t('settings.lanIpRequired')}</span>`;
    return;
  }
  if (el) el.innerHTML = `<span style="color:var(--silver-500)">${t('settings.lanTestWait')}</span>`;
  if (btn) btn.disabled = true;
  try {
    const res = await window.electronAPI?.lanTestConnection?.(ip, port);
    if (res && res.ok) {
      if (el) el.innerHTML = `<span style="color:#28a745;"><i class="fas fa-check-circle"></i> ${t('settings.lanTestOk')}</span>`;
    } else {
      let msg = t('settings.lanTestFail');
      if (res && res.reason === 'REFUSED') msg += ` — ${t('settings.lanTestRefused')}`;
      else if (res && res.reason === 'TIMEOUT') msg += ` — ${t('settings.lanTestTimeout')}`;
      else if (res && res.reason === 'UNREACHABLE') msg += ` — ${t('settings.lanTestUnreachable')}`;
      else if (res && res.reason === 'NO_IP') msg = t('settings.lanIpRequired');
      if (el) el.innerHTML = `<span style="color:#dc3545;"><i class="fas fa-times-circle"></i> ${msg}</span>`;
    }
  } catch (e) {
    if (el) el.innerHTML = `<span style="color:#dc3545;"><i class="fas fa-times-circle"></i> ${t('common.error')}: ${e.message}</span>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function settingsRemoteResetBranch() {
  const result = document.getElementById('lanRemoteResetResult');
  if (result) result.textContent = '';
  const confirmed = confirm(t('settings.lanRemoteResetConfirm'));
  if (!confirmed) return;
  if (typeof LANSync === 'undefined' || !LANSync.sendRaw) {
    if (result) result.innerHTML = `<span style="color:#dc3545;">${t('settings.lanRemoteReset')} — LAN غير متاح</span>`;
    return;
  }
  try {
    LANSync.sendRaw({ type: 'remote-reset', ts: Date.now() });
    if (result) result.innerHTML = `<span style="color:#28a745;"><i class="fas fa-check-circle"></i> ${t('settings.lanRemoteResetSent')}</span>`;
  } catch (e) {
    if (result) result.innerHTML = `<span style="color:#dc3545;">${t('settings.lanRemoteReset')} — ${e.message}</span>`;
  }
}
window.settingsRemoteResetBranch = settingsRemoteResetBranch;

// ===== Firewall auto-allow =====
async function settingsEnsureFirewall() {
  const out = document.getElementById('lanFirewallResult');
  try {
    const res = await window.electronAPI?.lanEnsureFirewall?.();
    if (res && res.success) {
      if (out) out.innerHTML = '<span style="color:#28a745"><i class="fas fa-check-circle"></i> تم السماح عبر جدار الحماية</span>';
    } else {
      settingsShowFirewallModal('تم رفض منح الصلاحية — اسمح يدويًا أو أعد المحاولة.');
    }
  } catch (e) {
    settingsShowFirewallModal(e && e.message ? e.message : 'تعذّر السماح تلقائياً');
  }
}

// True only while the settings page is the active page. The module is loaded
// once and its window listeners live for the whole session — without this
// guard they would keep rebuilding settings lists on unrelated LAN events.
function _settingsPageVisible() {
  return (window._currentPageId === 'settings') && !!document.getElementById('page-settings');
}

// If a sub device can't reach the main within a few seconds, prompt the user
// to allow the firewall (the block is almost always on the MAIN machine).
// Keep the timer handle so leaving Settings cancels the prompt instead of
// popping a modal on top of another page eight seconds later.
let _settingsLanWatchTimer = null;
function settingsWatchSubConnect() {
  clearTimeout(_settingsLanWatchTimer);
  _settingsLanWatchTimer = setTimeout(async () => {
    _settingsLanWatchTimer = null;
    if (!_settingsPageVisible()) return;
    try {
      const st = (typeof LANSync !== 'undefined') ? LANSync.getStatus() : null;
      if (!st || !st.connected) {
        settingsShowFirewallModal('لم يتصل الفرع بالرئيسي — ربما يحتاج الجهاز الرئيسي للسماح عبر جدار الحماية.');
      }
    } catch (e) { /* ignore */ }
  }, 8000);
}

window.addEventListener('zmt:navigate', function (ev) {
  if (!ev || !ev.detail || ev.detail.pageId !== 'settings') {
    clearTimeout(_settingsLanWatchTimer);
    _settingsLanWatchTimer = null;
  }
});

function settingsShowFirewallModal(msg) {
  const m = document.getElementById('lanFirewallModal');
  const r = document.getElementById('lanFirewallModalResult');
  if (r && msg) r.innerHTML = `<span style="color:#dc3545">${msg}</span>`;
  if (m) m.style.display = 'flex';
}

function settingsHideFirewallModal() {
  const m = document.getElementById('lanFirewallModal');
  if (m) m.style.display = 'none';
}

async function settingsAllowFirewall() {
  const r = document.getElementById('lanFirewallModalResult');
  if (r) r.innerHTML = '<span style="color:var(--silver-500)">جارٍ محاولة السماح...</span>';
  try {
    const res = await window.electronAPI?.lanEnsureFirewall?.();
    if (res && res.success) {
      if (r) r.innerHTML = '<span style="color:#28a745"><i class="fas fa-check-circle"></i> تمت الإضافة بنجاح</span>';
      const out = document.getElementById('lanFirewallResult');
      if (out) out.innerHTML = '<span style="color:#28a745"><i class="fas fa-check-circle"></i> تم السماح عبر جدار الحماية</span>';
      setTimeout(settingsHideFirewallModal, 1200);
    } else {
      if (r) r.innerHTML = '<span style="color:#dc3545">تم الرفض — وافق على طلب UAC أو اسمح يدويًا.</span>';
    }
  } catch (e) {
    if (r) r.innerHTML = `<span style="color:#dc3545">${e && e.message ? e.message : 'فشل'}</span>`;
  }
}

window.settingsShowFirewallModal = settingsShowFirewallModal;
window.settingsHideFirewallModal = settingsHideFirewallModal;
window.settingsAllowFirewall = settingsAllowFirewall;
window.settingsEnsureFirewall = settingsEnsureFirewall;

// ===== LICENSE / ACTIVATION =====
function settingsLoadLicense() {
  const statusEl = document.getElementById('settingsLicStatus');
  if (!statusEl || !window.electronAPI?.licenseCheck) return;
  window.electronAPI.licenseCheck().then(function (res) {
    const storeRow = document.getElementById('settingsLicStoreRow');
    const expiryRow = document.getElementById('settingsLicExpiryRow');
    const deactivateBtn = document.getElementById('settingsDeactivateBtn');
    if (res && res.status === 'active' && res.license) {
      statusEl.innerHTML = '<span style="color:#28a745"><i class="fas fa-check-circle"></i> ' + (t('settings.licenseActive') || 'مفعّل') + '</span>';
      const storeEl = document.getElementById('settingsLicStore');
      if (storeEl) storeEl.textContent = res.license.storeCode || '—';
      const expiryEl = document.getElementById('settingsLicExpiry');
      if (expiryEl) expiryEl.textContent = res.license.expiresAt ? new Date(res.license.expiresAt).toLocaleDateString('fr-DZ') : '—';
      if (storeRow) storeRow.style.display = '';
      if (expiryRow) expiryRow.style.display = '';
      if (deactivateBtn) deactivateBtn.style.display = '';
    } else {
      statusEl.innerHTML = '<span style="color:var(--silver-500)"><i class="fas fa-times-circle"></i> ' + (t('settings.licenseInactive') || 'غير مفعّل') + '</span>';
      if (storeRow) storeRow.style.display = 'none';
      if (expiryRow) expiryRow.style.display = 'none';
      if (deactivateBtn) deactivateBtn.style.display = 'none';
    }
  }).catch(function () {
    statusEl.textContent = '—';
  });
}

async function settingsDeactivateLicense() {
  if (!confirm(t('settings.confirmDeactivateLicense') || 'هل تريد إلغاء التفعيل وحذف مفتاح الترخيص نهائياً من هذا الجهاز؟\n\nبعد الحذف سيعود البرنامج إلى شاشة التفعيل ولن يعمل حتى إدخال مفتاح جديد.')) return;
  const result = document.getElementById('settingsLicResult');
  const btn = document.getElementById('settingsDeactivateBtn');
  const adminSecretEl = document.getElementById('settingsLicAdminSecret');
  const adminSecret = adminSecretEl ? adminSecretEl.value.trim() : '';
  if (btn) btn.disabled = true;
  if (result) result.innerHTML = '<span style="color:var(--silver-500)"><i class="fas fa-spinner fa-spin"></i> ' + (t('settings.deactivating') || 'جاري إلغاء التفعيل...') + '</span>';
  try {
    const res = await window.electronAPI.licenseDeactivate({ adminSecret });
    if (res && res.success) {
      if (result) result.innerHTML = '<span style="color:#28a745"><i class="fas fa-check-circle"></i> ' + res.message + '</span>';
      if (typeof Auth !== 'undefined' && typeof Auth.signOut === 'function') Auth.signOut();
      if (typeof resetLicenseAfterDeactivation === 'function') resetLicenseAfterDeactivation();
      if (typeof CloudService !== 'undefined' && typeof CloudService.stopAutoSync === 'function') CloudService.stopAutoSync();
      setTimeout(function () {
        if (typeof initLoginView === 'function') initLoginView();
        else if (typeof showLogin === 'function') showLogin();
      }, 900);
    } else {
      if (result) result.innerHTML = '<span style="color:#dc3545">' + ((res && res.message) || (t('settings.deactivateFailed') || 'فشل إلغاء التفعيل')) + '</span>';
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    if (result) result.innerHTML = '<span style="color:#dc3545">' + e.message + '</span>';
    if (btn) btn.disabled = false;
  }
}

// Listen for status changes while settings page is open
if (typeof window.addEventListener === 'function') {
  window.addEventListener('zmt-lan-status', () => {
    if (_settingsPageVisible()) settingsUpdateLanStatus();
  });
}

// Reload the users list when the other LAN device adds/edits/deletes a user.
window.addEventListener('zmt-users-synced', () => {
  if (!_settingsPageVisible()) return;
  const list = document.getElementById('settingsUsersList');
  if (list && typeof settingsLoadUsers === 'function') settingsLoadUsers();
});

// ===== AUDIT LOG (per-manager action trail) =====
function _auditEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Building the audit table used to run synchronously inside init_settings():
// sort up to 2000 rows + 500 Intl date formats before the page was even shown.
// Defer it to idle time, then reuse the rendered rows until the data or a
// filter changes (audit rows are immutable and appended at the front).
let _auditRenderCache = { key: '', html: '', total: 0 };

function _scheduleAuditLogLoad() {
  const run = () => { if (_settingsPageVisible()) loadAuditLog(); };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 1500 });
  } else {
    setTimeout(run, 0);
  }
}

function loadAuditLog() {
  const mgrSel = document.getElementById('auditManagerFilter');
  if (!mgrSel) return;
  const users = (typeof Auth !== 'undefined' && Auth.listUsers) ? Auth.listUsers() : [];
  const current = mgrSel.value;
  mgrSel.innerHTML = '<option value="">كل المديرين</option>' +
    users.map(u => `<option value="${_auditEsc(u.username)}">${_auditEsc(u.username)}</option>`).join('');
  if (current) mgrSel.value = current;
  renderAuditLog();
}

function renderAuditLog() {
  const container = document.getElementById('auditLogTable');
  if (!container) return;
  const mgr = document.getElementById('auditManagerFilter') ? document.getElementById('auditManagerFilter').value : '';
  const action = document.getElementById('auditActionFilter') ? document.getElementById('auditActionFilter').value : '';
  const from = document.getElementById('auditFrom') ? document.getElementById('auditFrom').value : '';
  const to = document.getElementById('auditTo') ? document.getElementById('auditTo').value : '';
  let logs = (typeof DB !== 'undefined' && DB.getAuditLogs) ? DB.getAuditLogs() : [];
  if (mgr) logs = logs.filter(l => l.manager === mgr);
  if (action) logs = logs.filter(l => l.action === action);
  if (from) { const f = new Date(from).getTime(); logs = logs.filter(l => l.ts >= f); }
  if (to) { const t = new Date(to).getTime() + 86400000; logs = logs.filter(l => l.ts < t); }

  if (!logs.length) {
    _auditRenderCache = { key: '', html: '', total: 0 };
    container.innerHTML = '<div class="placeholder-box" style="padding:20px"><i class="fas fa-inbox"></i><p>لا توجد عمليات مسجلة</p></div>';
    return;
  }
  const newest = logs[0]; // DB.getAuditLogs() is sorted newest-first
  const signature = [
    (typeof DB !== 'undefined' && DB.dataVersion) ? DB.dataVersion() : 0,
    logs.length, newest && newest.id, newest && newest.ts, mgr, action, from, to
  ].join('|');

  if (signature !== _auditRenderCache.key) {
    const actionLabel = { add: 'إضافة', update: 'تعديل', delete: 'حذف', merge: 'دمج', split: 'فصل', product_conflict: 'تعارض باركود', unknown: '—' };
    const entityLabel = { product: 'منتج', invoice: 'فاتورة', payment: 'دفعة', supplier: 'مورد', customer: 'عميل', branch: 'فرع', user: 'مستخدم' };
    let rows = '';
    for (const l of logs.slice(0, 500)) {
      const dateStr = new Date(l.ts).toLocaleString('ar-EG-u-nu-latn');
      const act = actionLabel[l.action] || l.action;
      const actColor = l.action === 'delete' ? '#dc3545' : (l.action === 'add' ? '#28a745' : '#e69500');
      const ent = entityLabel[l.entity] || l.entity;
      rows += `<tr><td>${dateStr}</td><td>${_auditEsc(l.manager)}</td>` +
        `<td><span style="color:${actColor};font-weight:600">${act}</span></td>` +
        `<td>${_auditEsc(ent)}</td><td>${_auditEsc(l.detail)}</td></tr>`;
    }
    _auditRenderCache = { key: signature, html: rows, total: logs.length };
  }

  container.innerHTML = '<table class="data-table"><thead><tr><th>التاريخ</th><th>المدير</th><th>العملية</th><th>الكيان</th><th>التفاصيل</th></tr></thead><tbody>' +
    _auditRenderCache.html + '</tbody></table>' +
    (_auditRenderCache.total > 500
      ? `<div style="font-size:12px;color:var(--silver-500);padding:8px">عرض أول 500 من ${_auditRenderCache.total} عملية</div>`
      : '');
}

function exportAuditLogCSV() {
  const logs = (typeof DB !== 'undefined' && DB.getAuditLogs) ? DB.getAuditLogs() : [];
  if (!logs.length) { alert('لا توجد عمليات للتصدير'); return; }
  const header = ['timestamp', 'manager', 'storeCode', 'action', 'entity', 'entityId', 'detail'];
  const rows = logs.map(l => [new Date(l.ts).toISOString(), l.manager, l.storeCode, l.action, l.entity, l.entityId, l.detail]);
  const csv = [header, ...rows]
    .map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'audit_log_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clearAuditLogConfirm() {
  if (!confirm('سيؤدي مسح السجل إلى حذف كل سجل العمليات نهائياً. متابعة؟')) return;
  if (typeof DB !== 'undefined' && DB.clearAuditLogs) DB.clearAuditLogs();
  renderAuditLog();
}

// ===== LAN PRINTER SHARING UI =====
// Thin wrappers around the main-process (preload) printer bridge. Every call is
// funneled through a small spinner helper so the buttons never appear stuck and
// every failure maps to a clear translated message.

function _prtSet(elId, html) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = html;
}

function _prtBtn(id, busy, textId) {
  const b = document.getElementById(id);
  if (!b) return;
  b.disabled = !!busy;
  if (textId) {
    const span = b.querySelector('span');
    if (span) span.textContent = busy ? t('settings.printerWorking') : t(textId);
  }
}

function _prtErr(res) {
  if (!res) return t('settings.printerUnknownErr');
  if (res.needsPermission) return t('settings.printerNeedAdmin');
  if (res.error && String(res.error).indexOf('TIMEOUT') === 0) return t('settings.printerHostUnreachable');
  switch (res.hint) {
    case 'access_denied': return t('settings.printerAccessDenied');
    case 'host_unreachable': return t('settings.printerHostUnreachable');
    case 'driver_or_nightmare': return t('settings.printerDriverNightmare');
    case 'elevation': return t('settings.printerNeedAdmin');
    default: break;
  }
  if (!res.success) return res.error || t('settings.printerUnknownErr');
  return '';
}

async function prtLoadLocalPrinters() {
  const sel = document.getElementById('prtLocalSelect');
  if (!sel || !window.electronAPI?.printerListLocal) return;
  _prtSet('prtLocalDefault', ''); 
  sel.innerHTML = '<option value="">' + t('settings.printerLoading') + '...</option>';
  try {
    const res = await window.electronAPI.printerListLocal();
    if (!res.success) { _prtSet('prtLocalDefault', '<span style="color:#dc3545">' + _prtErr(res) + '</span>'); return; }
    const printers = res.data || [];
    sel.innerHTML = printers.length
      ? printers.map(p =>
        `<option value="${escHtmlAttr(p.name)}" data-share="${escHtmlAttr(p.shareName || '')}" data-drv="${escHtmlAttr(p.driverName || '')}" data-shareable="${p.shareable ? '1' : ''}">${escHtml(p.name)}${p.isDefault ? ' ★' : ''}</option>`).join('')
      : '<option value="">' + t('settings.printerNone') + '</option>';
    const def = printers.find(p => p.isDefault);
    const info = printers.length ? (printers.length + ' طابعة') : '';
    _prtSet('prtLocalDefault', `<span style="font-size:11px;color:var(--silver-500)">${info}${def ? ' — ' + t('settings.printerDefaultNow') + ': ' + escHtml(def.name) : ''}</span>`);
    prtShareNamePreview();
  } catch (e) { _prtSet('prtLocalDefault', '<span style="color:#dc3545">' + t('settings.printerUnknownErr') + '</span>'); }
}

function escHtmlAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Escape a UNC path for embedding inside an inline onclick JS string literal:
// backslashes become \\ so the literal '\\SERVER\Share' survives the attribute.
function _prtJsStr(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

async function prtInit() {
  const host = document.getElementById('prtServerHost');
  if (host) {
    const ip = document.getElementById('lanServerIp');
    if (ip && ip.value) host.value = ip.value.trim();
    else if (localStorage.getItem('zmt_lan_ip')) host.value = localStorage.getItem('zmt_lan_ip');
  }
  const name = document.getElementById('prtShareName');
  if (name && !name.value) {
    let preset = 'ZMT-';
    try {
      const cn = await window.electronAPI?.printerComputerName?.();
      if (cn && cn.success && cn.data) preset += String(cn.data).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 8);
    } catch (e) {}
    if (name.value !== 'ZMT-') name.value = (preset === 'ZMT-' ? '' : preset);
  }
  await prtLoadLocalPrinters();
  prtRefreshDefaultLine();
}

function prtShareNamePreview() {
  const nm = document.getElementById('prtShareName');
  if (!nm || !nm.value) return;
  if (nm.value.indexOf('\\\\') === 0) return;
}

async function prtShareNow() {
  const sel = document.getElementById('prtLocalSelect');
  const printer = sel ? sel.value : '';
  if (!printer) { alert(t('settings.printerSelectFirst')); return; }
  _prtBtn('prtShareBtn', true, 'settings.printerWorking');
  _prtSet('prtShareResult', '');
  try {
    const share = document.getElementById('prtShareName').value.trim().replace(/[^A-Za-z0-9_-]/g, '-') || 'PRINTER';
    const res = await window.electronAPI.printerShare(printer, share);
    if (res && res.success && res.data) {
      const d = res.data;
      _prtSet('prtShareResult', `<span class="text-success"><i class="fas fa-check-circle"></i> ${t('settings.printerSharedOk')}</span><div style="margin-top:6px;background:#f0f7ff;border:1px solid #cce5ff;border-radius:8px;padding:8px 12px;font-family:monospace;direction:ltr;text-align:left">${escHtml(d.unc || '')}</div><div style="font-size:11px;color:var(--silver-500);margin-top:4px">Driver: ${escHtml(d.driverName || '—')}</div>`);
      if (prtRefreshDefaultLine) prtRefreshDefaultLine();
    } else {
      _prtSet('prtShareResult', '<span style="color:#dc3545;">' + _prtErr(res) + '</span>');
    }
  } catch (e) { _prtSet('prtShareResult', '<span style="color:#dc3545;">' + t('settings.printerUnknownErr') + '</span>'); }
  _prtBtn('prtShareBtn', false, 'settings.printerShareNow');
}

async function prtUnshareNow() {
  const sel = document.getElementById('prtLocalSelect');
  const printer = sel ? sel.value : '';
  if (!printer) { alert(t('settings.printerSelectFirst')); return; }
  _prtBtn('prtUnshareBtn', true, 'settings.printerWorking');
  _prtSet('prtShareResult', '');
  try {
    const res = await window.electronAPI.printerUnshare(printer);
    if (res && res.success) { _prtSet('prtShareResult', '<span class="text-success">' + t('settings.printerUnsharedOk') + '</span>'); }
    else _prtSet('prtShareResult', '<span style="color:#dc3545;">' + _prtErr(res) + '</span>');
  } catch (e) { _prtSet('prtShareResult', '<span style="color:#dc3545;">' + t('settings.printerUnknownErr') + '</span>'); }
  _prtBtn('prtUnshareBtn', false, 'settings.printerUnshare');
}

async function prtBrowse() {
  const host = document.getElementById('prtServerHost').value.trim();
  if (!host) { alert(t('settings.printerHostRequired')); return; }
  _prtBtn('prtBrowseBtn', true, 'settings.printerWorking');
  _prtSet('prtBrowseResult', `<span style="color:var(--silver-500)">${t('settings.printerBusy')}...</span>`);
  try {
    const res = await window.electronAPI.printerBrowse(host);
    if (!res.success) { _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + _prtErr(res) + '</span>'); return; }
    const list = res.data || [];
    if (!list.length) { _prtSet('prtBrowseResult', '<span style="color:var(--silver-500)">' + t('settings.printerNoneShared') + '</span>'); return; }
    _prtSet('prtRemoteList', '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px">' +
      list.map((p, i) => `<div style="border:1px solid var(--silver-200);border-radius:8px;padding:10px">
        <div style="font-weight:700;font-size:12.5px">${escHtml(p.name)}</div>
        <div style="font-size:11px;color:var(--silver-500);font-family:monospace;direction:ltr;text-align:left">${escHtml(p.unc)}</div>
        <div style="font-size:10.5px;color:var(--silver-500);margin:4px 0 8px">Driver: ${escHtml(p.driverName || '—')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="prtConnectUnc('${_prtJsStr(p.unc)}', '${_prtJsStr(p.driverName || '')}', this)"><i class="fas fa-plug"></i> ${t('settings.printerConnect')}</button>
          <button class="btn btn-secondary btn-sm" onclick="prtSetDefaultByName('${_prtJsStr(p.unc)}', this)"><i class="fas fa-check"></i> ${t('settings.printerMakeDefault')}</button>
        </div>
      </div>`).join('') + '</div>');
  } catch (e) { _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + t('settings.printerUnknownErr') + '</span>'); }
  _prtBtn('prtBrowseBtn', false, 'settings.printerBrowse');
}

async function prtConnectUnc(unc, driverName, btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<span>' + t('settings.printerWorking') + '...</span>'; }
  try {
    // Client requirement (a): verify the driver is installed locally before
    // touching the network printer. Point-and-print would fail with a
    // security prompt if restricted, so guide the user to stage it first.
    if (driverName && window.electronAPI && window.electronAPI.printerListDrivers) {
      try {
        const dr = await window.electronAPI.printerListDrivers();
        const local = (dr && dr.success) ? (dr.data || []) : [];
        const pattern = String(driverName).toLowerCase();
        const found = local.some(n => String(n).toLowerCase().indexOf(pattern) !== -1);
        if (!found && local.length > 0) {
          _prtSet('prtBrowseResult', `<span style="color:#e65100"><i class="fas fa-exclamation-triangle"></i> ${t('settings.printerDriverMissing')} &quot;${escHtml(driverName)}&quot;<br><span style="font-size:11px">${t('settings.printerDriverMissingHint')}</span></span>`);
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plug"></i> ' + t('settings.printerConnect'); }
          return;
        }
      } catch (e) { /* connection below will surface real errors */ }
    }
    const res = await window.electronAPI.printerConnect(unc);
    if (res && res.success && res.data) {
      _prtSet('prtBrowseResult', `<span class="text-success"><i class="fas fa-check-circle"></i> ${t('settings.printerConnected')}: <b>${escHtml(res.data.name)}</b></span>`);
      await prtSetDefaultByResult(res.data.name);
    } else {
      _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + _prtErr(res) + '</span>');
    }
  } catch (e) { _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + t('settings.printerUnknownErr') + '</span>'); }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plug"></i> ' + t('settings.printerConnect'); }
}

async function prtParseAndConnect(unc) {
  const res = await window.electronAPI.printerConnect(unc);
  if (res && res.success && res.data) await prtSetDefaultByResult(res.data.name);
  return res;
}

async function prtSetDefaultByResult(name) {
  const res = await window.electronAPI.printerSetDefault(name);
  if (res && res.success && res.data && res.data.ok) {
    _prtSet('prtBrowseResult', (_prtText || '') + '<div class="text-success">' + t('settings.printerDefaultSet') + ': <b>' + escHtml(res.data.default) + '</b></div>');
    if (prtRefreshDefaultLine) prtRefreshDefaultLine();
    return true;
  }
  if (res && !res.success) _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + _prtErr(res) + '</span>');
  return false;
}

let _prtText = '';
async function prtSetDefaultByName(unc, btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<span>' + t('settings.printerWorking') + '...</span>'; }
  _prtText = '';
  try {
    const res = await window.electronAPI.printerConnect(unc);
    if (res && res.success && res.data) {
      _prtText = `<span class="text-success">${t('settings.printerConnected')}: <b>${escHtml(res.data.name)}</b><br></span>`;
      await prtSetDefaultByResult(res.data.name);
    } else {
      _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + _prtErr(res) + '</span>');
    }
  } catch (e) { _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + t('settings.printerUnknownErr') + '</span>'); }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> ' + t('settings.printerMakeDefault'); }
}

async function prtFixNow() {
  _prtBtn('prtFixBtn', true, 'settings.printerWorking');
  _prtSet('prtFixResult', '');
  try {
    const host = document.getElementById('prtServerHost').value.trim() || '';
    const res = await window.electronAPI.printerFix(host);
    if (res && res.success) {
      _prtSet('prtFixResult', `<span class="text-success"><i class="fas fa-check-circle"></i> ${t('settings.printerFixOk')}</span>`);
      if (res.data) _prtSet('prtFixResult', `<span class="text-success"><i class="fas fa-check-circle"></i> ${t('settings.printerFixOk')}</span><div style="font-size:11px;color:var(--silver-500);margin-top:4px">RpcAuthnLevelPrivacyEnabled = ${escHtml(res.data.applied)} • Spooler: ${escHtml(res.data.spooler)}</div>`);
    } else {
      _prtSet('prtFixResult', '<span style="color:#dc3545;">' + _prtErr(res) + '</span>');
    }
  } catch (e) { _prtSet('prtFixResult', '<span style="color:#dc3545;">' + t('settings.printerUnknownErr') + '</span>'); }
  _prtBtn('prtFixBtn', false, 'settings.printerFixNow');
}

async function prtPickInf() {
  if (!window.electronAPI?.openFile) return;
  const res = await window.electronAPI.openFile({
    filters: [{ name: 'Printer driver', extensions: ['inf'] }],
    properties: ['openFile'],
  });
  if (res && !res.canceled && res.filePaths && res.filePaths[0]) {
    document.getElementById('prtDrvInf').value = res.filePaths[0];
  }
}

async function prtInstallInf() {
  const inf = document.getElementById('prtDrvInf').value.trim();
  if (!inf) { alert(t('settings.printerLookForDrv')); return; }
  _prtBtn('prtInstallInfBtn', true, 'settings.printerWorking');
  _prtSet('prtBrowseResult', `<span style="color:var(--silver-500)">${t('settings.printerInstalling')}...</span>`);
  try {
    const res = await window.electronAPI.printerInstallDriver(inf);
    if (res && res.success) _prtSet('prtBrowseResult', '<span class="text-success">' + t('settings.printerDriverInstalled') + '</span>');
    else _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + _prtErr(res) + '</span>');
  } catch (e) { _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + t('settings.printerUnknownErr') + '</span>'); }
  _prtBtn('prtInstallInfBtn', false, 'settings.printerInstallDriver');
}

async function prtInstallInfShare() {
  const share = document.getElementById('prtDrvShare').value.trim();
  if (!share) { alert(t('settings.printerHostRequired')); return; }
  _prtBtn('prtInstallInfShareBtn', true, 'settings.printerWorking');
  _prtSet('prtBrowseResult', `<span style="color:var(--silver-500)">${t('settings.printerInstalling')}...</span>`);
  try {
    const res = await window.electronAPI.printerInstallDriverShare(share);
    if (res && res.success) _prtSet('prtBrowseResult', '<span class="text-success">' + t('settings.printerDriverInstalled') + '</span>');
    else _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + _prtErr(res) + '</span>');
  } catch (e) { _prtSet('prtBrowseResult', '<span style="color:#dc3545;">' + t('settings.printerUnknownErr') + '</span>'); }
  _prtBtn('prtInstallInfShareBtn', false, 'settings.printerInstallDriverShare');
}

async function prtRefreshDefaultLine() {
  const el = document.getElementById('prtDefaultNow');
  if (!el || !window.electronAPI?.printerGetDefault) return;
  try {
    const res = await window.electronAPI.printerGetDefault();
    if (res && res.success && res.data) el.textContent = t('settings.printerDefaultNow') + ': ' + String(res.data);
  } catch (e) {}
}

function prtTestPrint() {
  const bodyHtml =
    `<div style="font-family:'Segoe UI',sans-serif;padding:24px;text-align:center">
      <h2 style="color:#0066B1;margin-bottom:4px">ZMT PIECE</h2>
      <div style="color:#555;font-size:12px;margin-bottom:20px">${t('settings.printerTestTitle')}</div>
      <div style="font-size:11px;color:#333;line-height:1.7;direction:ltr;display:inline-block;text-align:left">
        <div>— — — — — — — — — — — —</div>
        <div>12048174-123-456 = POINT-ABCdef</div>
        <div>— — — — — — — — — — — —</div>
      </div>
    </div>`;
  if (typeof window.openPrintWindow === 'function') openPrintWindow('ZMT PIECE — Test', bodyHtml);
  else window.print();
}

// ===== INVOICE LOGO (settings) ==========================================
// The logo is stored on this device only: the image is copied into the app's
// own folder and just its PATH is kept in localStorage. Nothing is uploaded to
// the cloud, and no logo is drawn on the thermal receipt or the 80mm cashier
// ticket. The buttons live here in Settings; the invoice screen only renders.

// A toast that works even if the invoices page (which owns invToast) has never
// been opened in this session — the settings page can be the very first page.
function settingsLogoToast(msg, type) {
  if (typeof window.invToast === 'function') { try { window.invToast(msg, type); return; } catch (e) {} }
  // invToast lives in invoices.js, a page script that only loads once the user
  // visits that page. Opening Settings first must still report the outcome, so
  // fall back to a self-contained toast rather than a silent console line.
  try {
    let host = document.getElementById('settingsLogoToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'settingsLogoToastHost';
      host.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:99999;' +
        'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
      (document.body || document.documentElement).appendChild(host);
    }
    const colors = { error: '#c62828', success: '#2e7d32', info: '#1565c0' };
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'background:' + (colors[type] || '#333') + ';color:#fff;padding:10px 16px;' +
      'border-radius:8px;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.25);max-width:80vw;text-align:center';
    host.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 4000);
  } catch (e) {}
  try { console.log('[logo]', msg); } catch (e) {}
}

// Slider `input` fires on every pixel. Coalesce the writes into one save so
// dragging the logo size/opacity does not re-read and rewrite the image file
// dozens of times. The label still updates immediately.
let _settingsLogoSaveTimer = null;
function settingsSaveLogoLayoutSoon() {
  clearTimeout(_settingsLogoSaveTimer);
  _settingsLogoSaveTimer = setTimeout(function () {
    _settingsLogoSaveTimer = null;
    // The page may have been left while the timer was pending.
    if (!document.getElementById('settingsLogoSize') && !document.getElementById('settingsLogoOpacity')) return;
    settingsSaveLogoLayout();
  }, 200);
}

function settingsInitInvoiceLogo() {
  const L = window.InvoiceLogo;
  if (!L) return;

  const previewBtn = document.getElementById('settingsLogoPreviewBtn');
  const clearBtn = document.getElementById('settingsLogoClearBtn');
  const thumbWrap = document.getElementById('settingsLogoThumbWrap');
  const thumb = document.getElementById('settingsLogoThumb');
  const meta = document.getElementById('settingsLogoMeta');
  const controls = document.getElementById('settingsLogoControls');
  const sizeEl = document.getElementById('settingsLogoSize');
  const sizeVal = document.getElementById('settingsLogoSizeVal');
  const opEl = document.getElementById('settingsLogoOpacity');
  const opVal = document.getElementById('settingsLogoOpacityVal');

  const cfg = L.load();
  if (sizeEl) sizeEl.value = cfg.size;
  if (sizeVal) sizeVal.textContent = cfg.size + 'px';
  if (opEl) opEl.value = cfg.opacity;
  if (opVal) opVal.textContent = cfg.opacity + '%';
  settingsMarkLogoPosition(cfg.position);

  const has = L.isEnabled();
  // The preview button is always present (the user asked for both buttons side
  // by side); it is only disabled while no logo is loaded. Layout controls are
  // always shown so position/size/opacity can be set before uploading.
  if (previewBtn) {
    previewBtn.disabled = !has;
    previewBtn.style.display = '';
    if (has) previewBtn.removeAttribute('title');
    else previewBtn.setAttribute('title', 'حمّل لوغو أولاً');
  }
  if (clearBtn) clearBtn.style.display = has ? '' : 'none';
  if (controls) controls.style.display = '';
  if (thumbWrap) thumbWrap.style.display = has ? 'flex' : 'none';

  if (has && thumb) {
    // Reuse the shared reader so the thumbnail and the invoice agree.
    L.warm().then(function (url) {
      if (url) {
        thumb.src = url;
        if (meta) meta.textContent = settingsLogoFileLabel(cfg.path);
      }
    }).catch(function () {});
  }

  // Bind once PER ELEMENT, not per function: settings.html is rebuilt from the
  // page cache on every navigation, so the old function-level `_bound` flag
  // left the new sliders unbound after the first visit. Marking the elements
  // keeps a single listener on each DOM instance.
  if (sizeEl && !sizeEl._zmtLogoSizeBound) {
    sizeEl._zmtLogoSizeBound = true;
    sizeEl.addEventListener('input', function () {
      if (sizeVal) sizeVal.textContent = sizeEl.value + 'px';
      settingsSaveLogoLayoutSoon();
    });
  }
  if (opEl && !opEl._zmtLogoOpacityBound) {
    opEl._zmtLogoOpacityBound = true;
    opEl.addEventListener('input', function () {
      if (opVal) opVal.textContent = opEl.value + '%';
      settingsSaveLogoLayoutSoon();
    });
  }
  const grid = document.getElementById('settingsLogoPosGrid');
  if (grid && !grid._zmtLogoPosBound) {
    grid._zmtLogoPosBound = true;
    grid.addEventListener('click', function (ev) {
      const btn = ev.target.closest ? ev.target.closest('[data-logo-pos]') : null;
      if (!btn) return;
      const c = L.load();
      c.position = btn.getAttribute('data-logo-pos');
      L.save(c);
      settingsMarkLogoPosition(c.position);
    });
  }
}

function settingsLogoFileLabel(p) {
  const base = String(p || '').split(/[\\/]/).pop() || '';
  return base ? ('الملف: ' + base) : '';
}

function settingsMarkLogoPosition(pos) {
  const grid = document.getElementById('settingsLogoPosGrid');
  if (!grid) return;
  grid.querySelectorAll('[data-logo-pos]').forEach(function (b) {
    const on = b.getAttribute('data-logo-pos') === pos;
    b.classList.toggle('btn-primary', on);
    b.style.background = on ? '' : '#f0f0f0';
  });
}

function settingsSaveLogoLayout() {
  const L = window.InvoiceLogo;
  if (!L) return;
  const c = L.load();
  const sizeEl = document.getElementById('settingsLogoSize');
  const opEl = document.getElementById('settingsLogoOpacity');
  if (sizeEl) c.size = parseInt(sizeEl.value, 10) || c.size;
  if (opEl) c.opacity = parseInt(opEl.value, 10) || c.opacity;
  L.save(c);
}

async function settingsUploadInvoiceLogo() {
  const L = window.InvoiceLogo;
  const api = window.electronAPI;
  if (!L || !api || !api.openFile) return;
  try {
    const res = await api.openFile({
      title: 'Select business logo',
      properties: ['openFile'],
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }],
    });
    if (!res || res.canceled || !res.filePaths || !res.filePaths.length) return;
    const src = res.filePaths[0];
    const prev = L.load().path;
    let dest = src;
    if (api.invoiceLogoImport) {
      const r = await api.invoiceLogoImport(src, prev);
      if (r && r.success && r.path) dest = r.path;
      else { settingsLogoToast(t('settings.logoImportFailed') || 'تعذّر استيراد اللوغو', 'error'); return; }
    }
    const c = L.load();
    c.path = dest;
    L.save(c);
    L.invalidate();
    await L.warm();
    // Warn (but keep the logo) when the image is heavy. Nothing is uploaded to
    // the cloud, yet an oversized file still slows down the print path.
    let size = 0;
    try {
      const st = await api.readFileBuffer(dest);
      if (st && st.success && st.data) size = Math.floor(st.data.length * 0.75);
    } catch (e) {}
    if (size > 2 * 1024 * 1024) {
      settingsLogoToast('تم حفظ اللوغو، لكن حجمه يتجاوز 2MB (' + (size / 1048576).toFixed(1) + 'MB) — قد تُطبَع الفاتورة ببطء.', 'info');
    } else {
      settingsLogoToast(t('settings.logoSaved') || 'تم حفظ لوغو العمل', 'success');
    }
    settingsInitInvoiceLogo();
  } catch (e) {
    settingsLogoToast('خطأ: ' + (e && e.message ? e.message : e), 'error');
  }
}

function settingsClearInvoiceLogo() {
  const L = window.InvoiceLogo;
  if (!L) return;
  if (!confirm(t('settings.logoRemoveConfirm') || 'إزالة لوغو العمل من الفواتير؟')) return;
  L.clear();
  L.invalidate();
  settingsLogoToast(t('settings.logoRemoved') || 'تمت إزالة اللوغو', 'success');
  settingsInitInvoiceLogo();
}

// Renders the same header the printed invoice uses, so the preview is truthful.
async function settingsPreviewInvoiceLogo() {
  const L = window.InvoiceLogo;
  const modal = document.getElementById('settingsLogoPreviewModal');
  const stage = document.getElementById('settingsLogoPreviewStage');
  if (!L || !modal || !stage) return;
  if (!L.isEnabled()) { settingsLogoToast(t('settings.logoNone') || 'لا يوجد لوغو محمّل', 'info'); return; }
  await L.warm();
  settingsRenderLogoPreview();
  if (!modal._host) modal._host = modal.parentNode;
  if (modal.parentNode !== document.body) document.body.appendChild(modal);
  modal.style.display = 'flex';
}

function settingsCloseLogoPreview() {
  const modal = document.getElementById('settingsLogoPreviewModal');
  if (!modal) return;
  modal.style.display = 'none';
  if (modal._host && modal.parentNode === document.body) modal._host.appendChild(modal);
}

function settingsRenderLogoPreview() {
  const L = window.InvoiceLogo;
  const stage = document.getElementById('settingsLogoPreviewStage');
  if (!L || !stage) return;
  const bwEl = document.getElementById('settingsLogoPreviewBw');
  const mono = !!(bwEl && bwEl.checked);
  const store = (typeof getStoreInfo === 'function') ? getStoreInfo() : { name: 'ZMT PIECE' };
  const left = '<div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">' +
    L.esc(store.name || 'ZMT PIECE') + '</div>' +
    '<div style="font-size:10px;color:#999;margin-top:1px;text-transform:uppercase;letter-spacing:0.5px">Document commercial</div>';
  const right = '<div style="font-size:26px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:2px">FACTURE</div>' +
    '<div style="font-size:11px;font-weight:700;color:#0066B1;margin-top:-2px;text-transform:uppercase;letter-spacing:1.5px">DE VENTE</div>' +
    '<div style="font-size:13px;font-weight:700;color:#333;margin-top:6px">N° APERÇU</div>';
  stage.innerHTML = (typeof L.headerRow === 'function') ? L.headerRow(left, right, mono) : '';
  stage.style.background = '#fff';
  const img = stage.querySelector('img.zmt-doc-logo');
  if (img && mono) img.style.filter = 'grayscale(100%)';
}

// ===== DELETE PRODUCTS ONLY — PASSWORD-CONFIRMED DANGER ACTION =====
// DESIGN INVARIANT: this block calls ONLY DB.getProducts() + DB.deleteProduct().
// Invoice rows (including their item name snapshots), customers, suppliers,
// balances, payments, vouchers, returns and settings are never touched. An
// invoice keeps the product name inside `inv.items` after the catalogue row is
// gone, so historical documents remain exactly as they were printed.
function settingsInitDeleteProducts() {
  const pass = document.getElementById('settingsDeleteProductsPass');
  if (pass) pass.value = '';
  const result = document.getElementById('settingsDeleteProductsResult');
  if (result) { result.style.display = 'none'; result.textContent = ''; }
}

function settingsOpenDeleteProductsModal() {
  const m = document.getElementById('settingsDeleteProductsModal');
  if (!m) return;
  if (!m._host) m._host = m.parentNode;
  if (m.parentNode !== document.body) document.body.appendChild(m);
  settingsInitDeleteProducts();
  m.style.display = 'flex';
  const pass = document.getElementById('settingsDeleteProductsPass');
  if (pass) setTimeout(function () { try { pass.focus(); } catch (e) {} }, 80);
}

function settingsCloseDeleteProductsModal() {
  const m = document.getElementById('settingsDeleteProductsModal');
  if (!m) return;
  m.style.display = 'none';
  if (m._host && m.parentNode === document.body) m._host.appendChild(m);
  settingsInitDeleteProducts();
}

function settingsDeleteProductsMessage(msg, type) {
  const el = document.getElementById('settingsDeleteProductsResult');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
  el.style.color = type === 'success' ? '#28a745' : '#dc3545';
}

// Testable core: returns the number deleted, or -1 when the DB is unavailable.
// No other collection is read or written here, by design.
function settingsDeleteAllProductsOnly(D) {
  if (!D || typeof D.getProducts !== 'function' || typeof D.deleteProduct !== 'function') return -1;
  const products = D.getProducts();
  if (!Array.isArray(products)) return -1;
  // Capture ids FIRST: getProducts() can return the live cache when no company
  // is configured, and deleteProduct() splices that same array. Iterating the
  // live array would silently skip every second product.
  const ids = products.map(function (p) { return p && p.id; });
  let deleted = 0;
  for (let i = 0; i < ids.length; i++) {
    try { if (D.deleteProduct(ids[i])) deleted++; }
    catch (e) { console.warn('[Settings] deleteProduct failed', e); }
  }
  return deleted;
}
if (typeof window !== 'undefined') window.settingsDeleteAllProductsOnly = settingsDeleteAllProductsOnly;

function settingsConfirmDeleteProducts() {
  const passEl = document.getElementById('settingsDeleteProductsPass');
  const typed = passEl ? String(passEl.value || '') : '';
  const existing = (typeof Auth !== 'undefined' && typeof Auth.getStorePassword === 'function')
    ? Auth.getStorePassword() : '';

  if (existing) {
    if (typed !== existing) {
      settingsDeleteProductsMessage(t('settings.deleteProductsWrong'), 'error');
      return;
    }
  } else {
    const manager = (typeof Auth !== 'undefined' && typeof Auth.isManager === 'function' && Auth.isManager());
    if (!manager) {
      settingsDeleteProductsMessage(t('settings.deleteProductsManagerOnly'), 'error');
      return;
    }
  }

  const count = settingsDeleteAllProductsOnly(typeof DB !== 'undefined' ? DB : null);
  if (count < 0) { settingsDeleteProductsMessage(t('settings.deleteProductsFailed'), 'error'); return; }
  if (count === 0) { settingsDeleteProductsMessage(t('settings.deleteProductsEmpty'), 'error'); return; }

  if (passEl) passEl.value = '';
  settingsDeleteProductsMessage(
    String(t('settings.deleteProductsDone')).replace('{count}', count), 'success');
  try {
    if (typeof DB !== 'undefined' && typeof DB.logAudit === 'function') {
      DB.logAudit({ action: 'delete', entity: 'product', detail: `${count} منتج (حذف المنتجات فقط)` });
    }
  } catch (e) { /* audit is best-effort, never a blocker */ }
}



