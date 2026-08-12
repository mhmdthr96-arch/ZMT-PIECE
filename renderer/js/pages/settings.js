function init_settings() {
  const threshold = DB.getLowStockThreshold();
  document.getElementById('settingsLowStock').value = threshold;
  document.getElementById('settingsStoreName').value = localStorage.getItem('zmt_store_name') || 'ZMT PIECE';
  document.getElementById('settingsStoreAddress').value = localStorage.getItem('zmt_store_address') || '';
  document.getElementById('settingsStorePhone').value = localStorage.getItem('zmt_store_phone') || '';
  document.getElementById('settingsTimbreEnabled').checked = localStorage.getItem('zmt_timbre_enabled') === '1';
  document.getElementById('settingsTimbreRate').value = localStorage.getItem('zmt_timbre_rate') || '1';
  document.getElementById('settingsTvaRate').value = localStorage.getItem('zmt_tva_rate') || '0';

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
  settingsUpdateKeyStatus();
  settingsLoadProvider();
  settingsLoadLicense();
  loadAuditLog();
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

  const storeAddress = document.getElementById('settingsStoreAddress').value.trim();
  localStorage.setItem('zmt_store_address', storeAddress);

  const storePhone = document.getElementById('settingsStorePhone').value.trim();
  localStorage.setItem('zmt_store_phone', storePhone);

  localStorage.setItem('zmt_timbre_enabled', document.getElementById('settingsTimbreEnabled').checked ? '1' : '0');
  localStorage.setItem('zmt_timbre_rate', document.getElementById('settingsTimbreRate').value);
  localStorage.setItem('zmt_tva_rate', document.getElementById('settingsTvaRate').value || '0');

  const lang = document.getElementById('settingsLang').value;
  if (lang && window.__lang && window.__lang !== lang && typeof window.switchLanguage === 'function') {
    const LANG_ORDER = ['ar', 'en', 'fr', 'zh'];
    const currentIdx = LANG_ORDER.indexOf(window.__lang);
    const targetIdx = LANG_ORDER.indexOf(lang);
    if (targetIdx !== -1) {
      const diff = (targetIdx - currentIdx + 4) % 4;
      for (let i = 0; i < diff; i++) window.switchLanguage();
    }
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
    if (_settingsEditingUser) {
      const updates = { permissions: perms };
      if (password) updates.password = password;
      await Auth.updateUser(_settingsEditingUser.id, updates);
      if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'update', entity: 'user', entityId: _settingsEditingUser.id, detail: username });
      result.innerHTML = `<span style="color:#28a745;">${t('settings.userUpdated')}</span>`;
    } else {
      const created = await Auth.createUser(username, password, perms);
      if (typeof DB !== 'undefined' && DB.logAudit) DB.logAudit({ action: 'add', entity: 'user', entityId: (created && created.id) || null, detail: username });
      result.innerHTML = `<span style="color:#28a745;">${t('settings.userCreated')}</span>`;
    }
    document.getElementById('settingsNewUsername').value = '';
    document.getElementById('settingsNewUserPass').value = '';
    _settingsEditingUser = null;
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
  settingsBuildPermissionsGrid(user.permissions || Auth.DEFAULT_PAGES);
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

function getStoreInfo() {
  return {
    name: localStorage.getItem('zmt_store_name') || 'ZMT PIECE',
    address: localStorage.getItem('zmt_store_address') || '',
    phone: localStorage.getItem('zmt_store_phone') || '',
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
    settingsUpdateLanStatus();
  });
}

// Reload the users list when the other LAN device adds/edits/deletes a user.
window.addEventListener('zmt-users-synced', () => {
  const list = document.getElementById('settingsUsersList');
  if (list && typeof settingsLoadUsers === 'function') settingsLoadUsers();
});

// ===== AUDIT LOG (per-manager action trail) =====
function _auditEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    container.innerHTML = '<div class="placeholder-box" style="padding:20px"><i class="fas fa-inbox"></i><p>لا توجد عمليات مسجلة</p></div>';
    return;
  }
  const actionLabel = { add: 'إضافة', update: 'تعديل', delete: 'حذف', unknown: '—' };
  const entityLabel = { product: 'منتج', invoice: 'فاتورة', payment: 'دفعة', supplier: 'مورد', customer: 'عميل', branch: 'فرع', user: 'مستخدم' };
  let html = '<table class="data-table"><thead><tr><th>التاريخ</th><th>المدير</th><th>العملية</th><th>الكيان</th><th>التفاصيل</th></tr></thead><tbody>';
  for (const l of logs.slice(0, 500)) {
    const dateStr = new Date(l.ts).toLocaleString('ar-EG-u-nu-latn');
    const act = actionLabel[l.action] || l.action;
    const actColor = l.action === 'delete' ? '#dc3545' : (l.action === 'add' ? '#28a745' : '#e69500');
    const ent = entityLabel[l.entity] || l.entity;
    html += `<tr><td>${dateStr}</td><td>${_auditEsc(l.manager)}</td>` +
      `<td><span style="color:${actColor};font-weight:600">${act}</span></td>` +
      `<td>${_auditEsc(ent)}</td><td>${_auditEsc(l.detail)}</td></tr>`;
  }
  html += '</tbody></table>';
  if (logs.length > 500) html += `<div style="font-size:12px;color:var(--silver-500);padding:8px">عرض أول 500 من ${logs.length} عملية</div>`;
  container.innerHTML = html;
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


