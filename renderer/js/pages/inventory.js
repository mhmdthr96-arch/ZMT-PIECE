var _invCart = [];
var _invCartSupplierId = null;
var _invProducts = [];
var _invFiltered = [];
var _invPager = null;
var _invHideUntilSearch = false;
var _invViewMode = 'grid';

// ---------- measurement unit helpers (shared by every product form) ----------
// The <select> HTML is generated from Unit so the labels follow the UI language.
function invUnitFill(selId, value, customId) {
  Unit.fillSelect(selId, value, customId);
}

function invUnitSync(selId, customId) {
  Unit.syncCustom(selId, customId);
}

function invUnitRead(selId, customId) {
  return Unit.readSelect(selId, customId);
}

// ============================================================
// EXTRA SALE PRICE FIELDS (feature 3)
// ============================================================
// The field list itself is shared with the sales page through ExtraPrices.
// These helpers only paint the form section; the values live on each product
// as product.extraPrices = { [fieldId]: price }.
var _epfDraft = null;

function _invRenderExtraInputs(wrapId, scope, rec) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  if (typeof ExtraPrices === 'undefined' || !ExtraPrices) { wrap.innerHTML = ''; return; }
  const html = ExtraPrices.inputsHTML(scope, rec);
  if (!html) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<div class="extra-price-section">
    <div class="extra-price-section-title"><i class="fas fa-tags"></i> ${t('inventory.extraPricesTitle')}</div>
    ${html}
  </div>`;
}

function _invRefreshExtraInputs() {
  _invRenderExtraInputs('invExtraPricesWrap', 'invAdd', null);
  _invRenderExtraInputs('invExtraDirectWrap', 'invDirect', null);
  _invRenderExtraInputs('invExtraQuickWrap', 'invQuick', null);
}

function openExtraPriceFieldsModal() {
  if (typeof Auth !== 'undefined' && Auth && !Auth.isManager() && !Auth.canEdit('inventory')) {
    alert(t('common.noPermission'));
    return;
  }
  if (typeof ExtraPrices === 'undefined' || !ExtraPrices) {
    alert(t('inventory.extraPricesNotLoaded'));
    return;
  }
  const container = document.getElementById('pageContainer') || document.body;
  let overlay = document.getElementById('extraPriceFieldsModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'extraPriceFieldsModal';
    overlay.style.zIndex = '99993';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeExtraPriceFieldsModal(); });
    container.appendChild(overlay);
  }
  _epfDraft = ExtraPrices.fields().map(f => ({ id: f.id, name: f.name, color: f.color }));
  overlay.style.display = 'flex';
  _epfRender();
}

function closeExtraPriceFieldsModal() {
  const overlay = document.getElementById('extraPriceFieldsModal');
  if (overlay) overlay.style.display = 'none';
  _epfDraft = null;
}

function _epfSyncDraft() {
  const overlay = document.getElementById('extraPriceFieldsModal');
  if (!overlay || !_epfDraft) return;
  overlay.querySelectorAll('[data-epf-row]').forEach(row => {
    const i = Number(row.getAttribute('data-epf-row'));
    const f = _epfDraft[i];
    if (!f) return;
    const nameEl = row.querySelector('.epf-name');
    const colorEl = row.querySelector('.epf-color');
    if (nameEl) f.name = nameEl.value;
    if (colorEl) f.color = colorEl.value;
  });
}

function _epfRender() {
  const overlay = document.getElementById('extraPriceFieldsModal');
  if (!overlay || !_epfDraft) return;
  const rows = _epfDraft.map((f, i) => `<div class="epf-row" data-epf-row="${i}">
    <span class="epf-swatch" style="background:${escHtml(f.color || ExtraPrices.COLORS[i % ExtraPrices.COLORS.length])}"></span>
    <input type="text" class="form-input epf-name" value="${escHtml(f.name || '')}" placeholder="${t('inventory.fieldPlaceholder')}" oninput="_epfSyncDraft()">
    <input type="color" class="epf-color" value="${escHtml(f.color || ExtraPrices.COLORS[i % ExtraPrices.COLORS.length])}" title="${t('inventory.fieldColorTitle')}" oninput="_epfSyncDraft();_epfRepaintSwatch(${i})">
    <button type="button" class="btn btn-sm btn-danger" onclick="epfRemoveField(${i})" title="${t('common.delete')}"><i class="fas fa-trash"></i></button>
  </div>`).join('');

  overlay.innerHTML = `<div class="modal" style="max-width:620px">
    <div class="qk-head">
      <div class="qk-head-title"><i class="fas fa-tags" style="color:var(--bmw-blue-1)"></i> ${t('inventory.addExtraFieldsTitle')}</div>
      <button class="modal-close" type="button" onclick="closeExtraPriceFieldsModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body" style="padding:16px">
      <div class="ms-hint" style="margin-bottom:12px">
        ${t('inventory.extraFieldsHint').replace('{MAX}', String(ExtraPrices.MAX))}
      </div>
      <div class="epf-list">${rows || '<div class="ms-hint">' + t('inventory.noFieldsHint') + '</div>'}</div>
      <div class="epf-foot">
        <button type="button" class="btn btn-secondary" onclick="epfAddField()" ${_epfDraft.length >= ExtraPrices.MAX ? 'disabled' : ''}><i class="fas fa-plus"></i> ${t('inventory.addFieldBtn')}</button>
        <span style="flex:1"></span>
        <button type="button" class="btn btn-secondary" onclick="closeExtraPriceFieldsModal()">${t('common.cancel')}</button>
        <button type="button" class="btn btn-primary" onclick="epfSave()">${t('common.save')}</button>
      </div>
    </div>
  </div>`;
}

function _epfRepaintSwatch(i) {
  const overlay = document.getElementById('extraPriceFieldsModal');
  if (!overlay) return;
  const row = overlay.querySelector('[data-epf-row="' + i + '"]');
  if (!row) return;
  const colorEl = row.querySelector('.epf-color');
  const sw = row.querySelector('.epf-swatch');
  if (colorEl && sw) sw.style.background = colorEl.value;
}

function epfAddField() {
  _epfSyncDraft();
  if (!_epfDraft || _epfDraft.length >= ExtraPrices.MAX) return;
  const i = _epfDraft.length;
  _epfDraft.push({ id: '', name: '', color: ExtraPrices.COLORS[i % ExtraPrices.COLORS.length] });
  _epfRender();
  const overlay = document.getElementById('extraPriceFieldsModal');
  const input = overlay && overlay.querySelector('[data-epf-row="' + i + '"] .epf-name');
  if (input) input.focus();
}

function epfRemoveField(i) {
  _epfSyncDraft();
  if (!_epfDraft) return;
  _epfDraft.splice(i, 1);
  _epfRender();
}

function epfSave() {
  _epfSyncDraft();
  if (!_epfDraft) return;
  const named = _epfDraft.filter(f => String(f.name || '').trim());
  const seen = {};
  const clean = [];
  for (const f of named) {
    const name = String(f.name).trim();
    if (seen[name]) continue;
    seen[name] = 1;
    clean.push({ id: f.id || '', name, color: f.color });
  }
  if (_epfDraft.length && !clean.length) {
    alert(t('inventory.fieldNameRequired'));
    return;
  }
  try {
    ExtraPrices.saveFields(clean);
  } catch (e) {
    alert((e && e.message) || String(e));
    return;
  }
  closeExtraPriceFieldsModal();
  _invRefreshExtraInputs();
  renderInventory();
  try { document.dispatchEvent(new CustomEvent('zmt:extra-prices-changed')); } catch (e) {}
}

// ============================================================
// SCALE BARCODE SETTINGS
// ============================================================
// ScaleCore stays pure; this block is only the form the shop uses to describe
// the label its scale prints, plus a live "paste a real code" preview. One meta
// record (scale_barcode_cfg) is the output, read by the sales and returns paths.
var _scaleDraft = null;
var _scalePreviewText = '';

function scaleConfig() {
  if (typeof ScaleCore === 'undefined' || !ScaleCore) {
    return { enabled: false, rejectBadCheck: true, patterns: [] };
  }
  let raw = null;
  try { raw = DB.getMeta(ScaleCore.META_KEY); } catch (e) { raw = null; }
  return ScaleCore.configFromMeta(raw);
}

function _scalePatternLabel(p) {
  if (p.key) { const s = t(p.key); return s && s !== p.key ? s : p.key; }
  return p.label || t('scale.newPattern');
}

function _scaleIsPreset(id) {
  if (typeof ScaleCore === 'undefined' || !ScaleCore) return false;
  return ScaleCore.PRESETS.some(p => p.id === id);
}

function openScaleSettingsModal() {
  if (typeof Auth !== 'undefined' && Auth && !Auth.isManager() && !Auth.canEdit('inventory')) {
    alert(t('common.noPermission'));
    return;
  }
  if (typeof ScaleCore === 'undefined' || !ScaleCore) {
    alert(t('scale.moduleMissing'));
    return;
  }
  const container = document.getElementById('pageContainer') || document.body;
  let overlay = document.getElementById('scaleCfgModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'scaleCfgModal';
    overlay.style.zIndex = '99993';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeScaleSettingsModal(); });
    container.appendChild(overlay);
  }
  const cfg = scaleConfig();
  _scaleDraft = {
    enabled: !!cfg.enabled,
    rejectBadCheck: cfg.rejectBadCheck !== false,
    patterns: cfg.patterns.map(p => JSON.parse(JSON.stringify(p))),
  };
  overlay.style.display = 'flex';
  _scaleRender();
  const first = overlay.querySelector('.scale-preview-input');
  if (first) first.focus();
}

function closeScaleSettingsModal() {
  const overlay = document.getElementById('scaleCfgModal');
  if (overlay) overlay.style.display = 'none';
  _scaleDraft = null;
}

// The draft is the single source of truth: every control writes its own row, so
// the preview and the validation always see what is on screen.
function _scaleSyncRow(i) {
  const overlay = document.getElementById('scaleCfgModal');
  if (!overlay || !_scaleDraft) return;
  const row = overlay.querySelector('[data-scale-row="' + i + '"]');
  const p = _scaleDraft.patterns[i];
  if (!row || !p) return;
  const get = (name) => row.querySelector('[data-f="' + name + '"]');
  const val = (name) => { const el = get(name); return el ? el.value : ''; };
  const checked = (name) => { const el = get(name); return !!(el && el.checked); };
  const num = (name, dflt) => {
    const el = get(name);
    if (!el || String(el.value).trim() === '') return dflt;
    const n = Math.floor(Number(el.value));
    return isFinite(n) ? n : dflt;
  };
  const field = (prefix) => {
    const len = val(prefix + '.len');
    if (String(len).trim() === '' || Number(len) <= 0) return null;
    return {
      start: num(prefix + '.start', 0),
      len: num(prefix + '.len', 1),
      decimals: num(prefix + '.dec', 0),
    };
  };
  p.enabled = checked('enabled');
  p.check = checked('check');
  p.prefix = String(val('prefix')).replace(/[^0-9*]/g, '').slice(0, 4);
  p.digits = num('digits', 13);
  p.label = String(val('label'));
  p.plu = field('plu');
  p.weight = field('weight');
  p.price = field('price');
  p.amount = field('amount');
}

function _scaleRowError(p) {
  if (!p.prefix) return t('scale.errNoPrefix');
  const copy = JSON.parse(JSON.stringify(p));
  copy._error = '';
  if (ScaleCore.validatePattern(copy, copy.digits)) return '';
  if (copy._error) return t(copy._error);
  return t('scale.errRange');
}

// Typing in a position box must not repaint the modal (the caret would jump
// after every keystroke), so only the row's own error, the save button and the
// preview are refreshed.
function _scaleUpdateRow(i) {
  _scaleSyncRow(i);
  const overlay = document.getElementById('scaleCfgModal');
  if (!overlay || !_scaleDraft) return;
  const row = overlay.querySelector('[data-scale-row="' + i + '"]');
  const p = _scaleDraft.patterns[i];
  if (row && p) {
    const box = row.querySelector('[data-scale-row-error]');
    const err = _scaleRowError(p);
    if (box) { box.textContent = err; box.style.display = err ? '' : 'none'; }
  }
  const anyBad = _scaleDraft.patterns.some(x => _scaleRowError(x));
  const saveBtn = overlay.querySelector('[data-scale-save]');
  if (saveBtn) saveBtn.disabled = anyBad;
  const banner = overlay.querySelector('[data-scale-banner]');
  if (banner) banner.style.display = anyBad ? '' : 'none';
  scaleCfgPreview();
}

function _scaleFieldHTML(prefix, f, labelText, decAllowed, i) {
  const s = f ? f.start : '';
  const l = f ? f.len : '';
  const d = f ? f.decimals : '';
  const on = `oninput="_scaleUpdateRow(${i})"`;
  const box = `<span class="scale-triple">
    <input type="number" class="form-input scale-num" data-f="${prefix}.start" value="${s}" min="0" max="12" placeholder="â€”" title="${t('scale.pos')}" ${on}>
    <input type="number" class="form-input scale-num" data-f="${prefix}.len" value="${l}" min="0" max="13" placeholder="â€”" title="${t('scale.len')}" ${on}>
    ${decAllowed ? `<input type="number" class="form-input scale-num" data-f="${prefix}.dec" value="${d}" min="0" max="4" placeholder="0" title="${t('scale.dec')}" ${on}>` : ''}
  </span>`;
  return `<label class="scale-field">${labelText}${box}</label>`;
}

function _scaleRowHTML(p, i) {
  const preset = _scaleIsPreset(p.id);
  const digitsOpts = [8, 9, 10, 11, 12, 13].map(n =>
    `<option value="${n}"${n === p.digits ? ' selected' : ''}>${n}</option>`).join('');
  const err = _scaleRowError(p);
  return `<div class="scale-row${p.enabled ? '' : ' scale-row-off'}" data-scale-row="${i}">
    <div class="scale-row-head">
      <label class="scale-switch"><input type="checkbox" data-f="enabled" ${p.enabled ? 'checked' : ''} onchange="_scaleSyncRow(${i});_scaleRender()"> ${escHtml(_scalePatternLabel(p))}</label>
      ${preset ? '' : `<input type="text" class="form-input scale-label" data-f="label" value="${escHtml(p.label || '')}" placeholder="${t('scale.newPattern')}" oninput="_scaleUpdateRow(${i})">`}
      <span style="flex:1"></span>
      ${preset ? '' : `<button type="button" class="btn btn-sm btn-danger" onclick="scaleCfgRemovePattern(${i})" title="${t('common.delete')}"><i class="fas fa-trash"></i></button>`}
    </div>
    <div class="scale-grid">
      <label class="scale-field">${t('scale.colPrefix')}<input type="text" class="form-input scale-prefix" data-f="prefix" value="${escHtml(p.prefix)}" dir="ltr" maxlength="4" placeholder="21" oninput="_scaleUpdateRow(${i})"></label>
      <label class="scale-field">${t('scale.colDigits')}<select class="form-input" data-f="digits" onchange="_scaleSyncRow(${i});_scaleRender()">${digitsOpts}</select></label>
      <label class="scale-field">${t('scale.colCheck')}<input type="checkbox" class="scale-check" data-f="check" ${p.check ? 'checked' : ''} onchange="_scaleSyncRow(${i});scaleCfgPreview()"></label>
      ${_scaleFieldHTML('plu', p.plu, t('inventory.plu'), false, i)}
      ${_scaleFieldHTML('weight', p.weight, t('scale.colWeight'), true, i)}
      ${_scaleFieldHTML('price', p.price, t('scale.colUnitPrice'), true, i)}
      ${_scaleFieldHTML('amount', p.amount, t('scale.colAmount'), true, i)}
    </div>
    <div class="scale-row-error" data-scale-row-error="1" style="${err ? '' : 'display:none'}">${escHtml(err)}</div>
  </div>`;
}

// Built from the on-screen draft so what the operator edits is what is previewed.
function _scaleDraftCfg() {
  return {
    enabled: true,
    rejectBadCheck: !!(_scaleDraft && _scaleDraft.rejectBadCheck),
    patterns: (_scaleDraft ? _scaleDraft.patterns : []).map(p => Object.assign({}, p, { enabled: true })),
  };
}

function scaleCfgPreview() {
  const overlay = document.getElementById('scaleCfgModal');
  if (!overlay || !_scaleDraft) return;
  _scaleDraft.patterns.forEach((p, i) => _scaleSyncRow(i));
  const out = overlay.querySelector('.scale-preview-out');
  if (!out) return;
  const input = overlay.querySelector('.scale-preview-input');
  const raw = input ? input.value : '';
  _scalePreviewText = raw;
  if (!raw.trim()) { out.innerHTML = `<span class="ms-hint">${t('scale.previewHint')}</span>`; return; }
  const decoded = ScaleCore.decode(raw, _scaleDraftCfg());
  if (!decoded) {
    out.innerHTML = `<span class="scale-preview-bad"><i class="fas fa-times-circle"></i> ${escHtml(t('scale.previewNoMatch'))}</span>`;
    return;
  }
  const p = _scaleDraft.patterns.find(x => x.id === decoded.patternId) || {};
  const moneyOnLabel = decoded.amountFromLabel != null || decoded.unitPrice != null;
  const r = moneyOnLabel ? ScaleCore.resolve(decoded, 0) : null;
  const bits = [];
  bits.push(`<b>${escHtml(_scalePatternLabel(p))}</b>`);
  if (decoded.plu) bits.push(`${t('inventory.plu')}: ${escHtml(decoded.plu)}`);
  if (decoded.weight != null) bits.push(`${t('scale.colWeight')}: ${decoded.weight}`);
  if (decoded.unitPrice != null) bits.push(`${t('scale.colUnitPrice')}: ${decoded.unitPrice}`);
  if (decoded.amount != null) bits.push(`${t('scale.colAmount')}: ${decoded.amount}`);
  if (r) {
    bits.push(`${t('scale.qty')}: ${Unit.roundQty(r.qty)}`);
    bits.push(`${t('scale.total')}: ${r.total}`);
    if (r.amountFromLabel) bits.push(`<span class="scale-preview-tag">${t('scale.fromLabel')}</span>`);
  } else if (decoded.qtyFromLabel != null) {
    bits.push(`${t('scale.qty')}: ${Unit.roundQty(decoded.qtyFromLabel)}`);
    bits.push(`<span class="scale-preview-tag">${t('scale.priceFromCard')}</span>`);
  } else if (decoded.amountFromLabel != null) {
    // The settings window holds no product card, so the money is known here and
    // the quantity is not: it is the register that divides the amount by the price.
    bits.push(`<span class="scale-preview-tag">${t('scale.fromLabel')}</span>`);
  }
  bits.push(decoded.checkOk
    ? `<span class="scale-preview-ok">${t('scale.checkOk')}</span>`
    : `<span class="scale-preview-bad">${t('scale.checkBad')}</span>`);
  out.innerHTML = `<span class="scale-preview-good"><i class="fas fa-check-circle"></i></span> ` + bits.join(' â€” ');
}

function _scaleRender() {
  const overlay = document.getElementById('scaleCfgModal');
  if (!overlay || !_scaleDraft) return;
  const keepPreview = _scalePreviewText;
  const rows = _scaleDraft.patterns.map((p, i) => _scaleRowHTML(p, i)).join('');
  const invalid = _scaleDraft.patterns.some(p => _scaleRowError(p));
  overlay.innerHTML = `<div class="modal" style="max-width:900px">
    <div class="qk-head">
      <div class="qk-head-title"><i class="fas fa-weight-hanging" style="color:var(--bmw-blue-1)"></i> ${t('scale.settingsTitle')}</div>
      <button class="modal-close" type="button" onclick="closeScaleSettingsModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body scale-body">
      <div class="ms-hint">${t('scale.hint')}</div>
      <label class="scale-switch scale-master"><input type="checkbox" data-f="enabled" ${_scaleDraft.enabled ? 'checked' : ''} onchange="_scaleDraft.enabled=this.checked;scaleCfgPreview()"> ${t('scale.enable')}</label>
      <label class="scale-switch"><input type="checkbox" data-f="reject" ${_scaleDraft.rejectBadCheck ? 'checked' : ''} onchange="_scaleDraft.rejectBadCheck=this.checked;scaleCfgPreview()"> ${t('scale.rejectBadCheck')}</label>
      <div class="scale-preview">
        <div class="scale-preview-title">${t('scale.preview')}</div>
        <input type="text" class="form-input scale-preview-input" dir="ltr" value="${escHtml(keepPreview)}" placeholder="${t('scale.previewPlaceholder')}" oninput="scaleCfgPreview()">
        <div class="scale-preview-out"><span class="ms-hint">${t('scale.previewHint')}</span></div>
      </div>
      <div class="scale-list">${rows}</div>
      <div class="scale-row-error" data-scale-banner="1" style="${invalid ? '' : 'display:none'}"><i class="fas fa-exclamation-triangle"></i> ${t('scale.fixErrors')}</div>
      <div class="epf-foot">
        <button type="button" class="btn btn-secondary" onclick="scaleCfgAddPattern()"><i class="fas fa-plus"></i> ${t('scale.addField')}</button>
        <button type="button" class="btn btn-secondary" onclick="scaleCfgRestorePresets()"><i class="fas fa-undo"></i> ${t('scale.restorePresets')}</button>
        <span style="flex:1"></span>
        <button type="button" class="btn btn-secondary" onclick="closeScaleSettingsModal()">${t('common.cancel')}</button>
        <button type="button" class="btn btn-primary" data-scale-save="1" onclick="scaleCfgSave()" ${invalid ? 'disabled' : ''}>${t('common.save')}</button>
      </div>
    </div>
  </div>`;
  if (keepPreview) scaleCfgPreview();
}

function scaleCfgAddPattern() {
  if (!_scaleDraft) return;
  _scaleDraft.patterns.push({
    id: 'custom-' + Date.now(), key: undefined, label: '',
    prefix: '', digits: 13, plu: { start: 2, len: 5 },
    weight: { start: 7, len: 5, decimals: 3 }, price: null, amount: null,
    check: true, enabled: true,
  });
  _scaleRender();
}

function scaleCfgRestorePresets() {
  if (!_scaleDraft) return;
  if (!confirm(t('scale.restoreConfirm'))) return;
  _scaleDraft.patterns = ScaleCore.defaultConfig().patterns.map(p => Object.assign({}, p));
  _scaleRender();
}

function scaleCfgRemovePattern(i) {
  if (!_scaleDraft) return;
  _scaleDraft.patterns.splice(i, 1);
  _scaleRender();
}

function scaleCfgSave() {
  if (!_scaleDraft) return;
  _scaleDraft.patterns.forEach((p, i) => _scaleSyncRow(i));
  const bad = _scaleDraft.patterns.find(p => _scaleRowError(p));
  if (bad) { alert(t('scale.fixErrors')); _scaleRender(); return; }
  if (_scaleDraft.enabled && !_scaleDraft.patterns.some(p => p.enabled)) {
    alert(t('scale.needPattern'));
    return;
  }
  const cfg = ScaleCore.normalizeConfig({
    enabled: !!_scaleDraft.enabled,
    rejectBadCheck: !!_scaleDraft.rejectBadCheck,
    patterns: _scaleDraft.patterns,
  });
  if (cfg.patterns.length !== _scaleDraft.patterns.length) { alert(t('scale.fixErrors')); return; }
  DB.setMeta(ScaleCore.META_KEY, cfg);
  closeScaleSettingsModal();
  try { document.dispatchEvent(new CustomEvent('zmt:scale-config-changed')); } catch (e) {}
}

// Merged brand lookup, built once and reused for every card. _renderInvProductCard used
// to allocate a fresh [...BRANDS.global, ...BRANDS.chinese] array (and then do a
// linear find) for EACH of the 25 cards painted per page â€” 25 identical copies
// of the same list on every repaint. A single Map gives O(1) lookups.
var _invBrandMap = null;
function _invGetBrand(id) {
  if (!id) return null;
  if (!_invBrandMap) {
    _invBrandMap = new Map();
    const g = (typeof BRANDS !== 'undefined' && BRANDS.global) || [];
    const c = (typeof BRANDS !== 'undefined' && BRANDS.chinese) || [];
    for (let i = 0; i < g.length; i++) if (g[i] && g[i].id) _invBrandMap.set(g[i].id, g[i]);
    for (let i = 0; i < c.length; i++) if (c[i] && c[i].id) _invBrandMap.set(c[i].id, c[i]);
  }
  return _invBrandMap.get(id) || null;
}

function init_inventory() {
  _invProducts = DB.getProducts();
  _invHideUntilSearch = (function () { try { return localStorage.getItem('zmt_inv_hide_until_search') === '1'; } catch (e) { return false; } })();
  _invViewMode = (function () { try { return localStorage.getItem('zmt_inv_view_mode') === 'list' ? 'list' : 'grid'; } catch (e) { return 'grid'; } })();
  _invFiltered = _computeInvFiltered(normSearch(document.getElementById('invSearch')?.value || ''));
  if (_invPager) { _invPager.destroy(); _invPager = null; }
  _invPager = new InfiniteScrollPager({
    data: _invFiltered,
    container: document.getElementById('invGrid'),
    pageSize: 25,
    renderItem: _renderInvProductCard,
    renderEmpty: () => {
      const msg = _invHideState() ? t('inventory.hiddenUntilSearch') : t('inventory.empty');
      return `<div class="placeholder-box" style="grid-column:1/-1;padding:48px"><i class="fas fa-box-open" style="font-size:48px;color:#555"></i><p>${msg}</p></div>`;
    },
    scrollContainer: document.querySelector('.main-content') || window,
  });
  window._activePager = _invPager;
  invUnitFill('invUnit', Unit.DEFAULT, 'invUnitCustom');
  invUnitFill('invDirectUnit', Unit.DEFAULT, 'invDirectUnitCustom');
  setupInvSearch();
  _syncInvHideBtn();
  _invApplyToolbarPrefs();
  _applyInvViewMode();
  setupTransferButton();
  setupDirectAddButton();
  setupQuickAddButton();
  if (typeof FV !== 'undefined' && FV.apply) FV.apply();
  updateInvScopeChip();
  const sc = document.getElementById('invBarcodeScanner');
  if (sc && !sc._zmtCleanBound) {
    sc._zmtCleanBound = true;
    sc.addEventListener('input', function() {
      const cleaned = cleanScannedCode(this.value, { scanner: true });
      if (cleaned !== this.value) this.value = cleaned;
    });
  }
  const scDirect = document.getElementById('invDirectScanner');
  if (scDirect && !scDirect._zmtCleanBound) {
    scDirect._zmtCleanBound = true;
    scDirect.addEventListener('input', function() {
      const cleaned = cleanScannedCode(this.value, { scanner: true });
      if (cleaned !== this.value) this.value = cleaned;
    });
  }
  const directModal = document.getElementById('invAddDirectModal');
  if (directModal) directModal.addEventListener('click', function(e) {
    if (e.target === directModal) closeInvAddDirect();
  });
  const quickModal = document.getElementById('invQuickAddModal');
  if (quickModal) quickModal.addEventListener('click', function(e) {
    if (e.target === quickModal) closeQuickAddProduct();
  });
  // Hover + press E to edit the highlighted product (layout-independent via e.code).
  window._prodEditShortcut = function (id) { editInventoryItem(id); };
  _bindProdShortcuts();
  // Right-click context menu handlers for product cards (permissions mirror the card buttons).
  const isManager = Auth.isManager();
  window._registerProdCtxHandlers({
    edit: editInventoryItem,
    canEdit: isManager || Auth.canEdit('inventory'),
    ret: openSupplierReturnModal,
    canRet: isManager || Auth.canEdit('supplier-returns'),
    del: deleteInventoryItem,
    canDel: isManager,
  });
}

function setupTransferButton() {
  const btn = document.getElementById('btnTransferProducts');
  const text = document.getElementById('btnTransferText');
  if (!btn || typeof Auth === 'undefined') return;

  const type = Auth.getStoreType();
  if (type === 'branch') {
    btn.style.display = '';
    if (text) text.textContent = t('inventory.transferBranch');
  } else {
    btn.style.display = '';
    if (text) text.textContent = t('inventory.transferMain');
  }
}

function setupDirectAddButton() {
  const btn = document.getElementById('btnAddInvDirect');
  if (!btn || typeof Auth === 'undefined') return;
  btn.style.display = (Auth.isManager() || Auth.canEdit('inventory')) ? '' : 'none';
}

function setupQuickAddButton() {
  const btn = document.getElementById('btnQuickAddProduct');
  if (!btn || typeof Auth === 'undefined') return;
  btn.style.display = (Auth.isManager() || Auth.canEdit('inventory')) ? '' : 'none';
}

function populateInvBrands(selectedId) {
  const opts = (typeof buildBrandSelectOptions === 'function') ? buildBrandSelectOptions(selectedId) : '';
  const sel = document.getElementById('invBrand');
  if (sel && !selectedId) sel.innerHTML = opts;
  const selDirect = document.getElementById('invDirectBrand');
  if (selDirect && !selectedId) selDirect.innerHTML = opts;
  const selQuick = document.getElementById('qaBrand');
  if (selQuick && !selectedId) selQuick.innerHTML = opts;
}

function renderInventory() {
  _invProducts = DB.getProducts();
  applyInvFilter();
}

// Shows a small chip with the ACTIVE company scope + store so the user can
// immediately see which company/store the inventory list is bound to (and why a
// product may be hidden or an edit rejected). Hidden when no company is active.
function updateInvScopeChip() {
  const el = document.getElementById('invScopeChip');
  if (!el) return;
  try {
    const cid = (typeof Auth !== 'undefined' && Auth.getCompanyId) ? (Auth.getCompanyId() || '') : '';
    const ls = (function () { try { return localStorage.getItem('zmt_active_company') || ''; } catch (e) { return ''; } })();
    const c = cid || ls;
    const sid = (typeof Auth !== 'undefined' && Auth.getUserCode) ? (Auth.getUserCode() || '') : '';
    let name = '';
    if (c && typeof DB !== 'undefined' && DB.getCompany) {
      try {
        const comp = DB.getCompany(c);
        if (comp && comp.name) name = comp.name;
      } catch (e) {}
    }
    if (!c) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    el.style.display = 'inline-flex';
    el.innerHTML = '<i class="fas fa-building"></i><b>' + escHtml(name || ('#' + String(c).slice(0, 6))) + '</b>'
      + (sid ? '<span class="inv-scope-store">' + escHtml(sid) + '</span>' : '');
  } catch (e) {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function _renderInvProductCard(p, idx) {
  const brand = _invGetBrand(p.brandId);
  const isManager = Auth.isManager();
  const qtyBadge = p.quantity < 5 ? 'danger' : 'ok';
  const minFloor = Math.max(0, parseFloat(p.minPrice) || 0);
  const minFloorText = minFloor > 0 ? 'DA' + fmtMoney(minFloor) : '—';
  return `<div class="prod-card" data-id="${p.id}" ondblclick="${isManager ? `editInventoryItem('${p.id}')` : ''}">
    <div class="prod-card-head">
      <div class="prod-card-head-main">
        <div class="prod-card-title">${escHtml(p.name)}</div>
        <div class="prod-card-meta">
          <span class="prod-meta"><i class="fas fa-tag"></i> ${t('quickEntry.mark')}: <b>${escHtml(p.mark || '-')}</b></span>
          <span class="prod-meta mono"><i class="fas fa-barcode"></i> ${escHtml(p.barcode || '-')}</span>
          ${(typeof ProductQR !== 'undefined' ? ProductQR.htmlOf(p) : '')}
          ${p.family ? `<span class="prod-meta family-chip"><i class="fas fa-pills"></i> <b>${escHtml(p.family)}</b></span>` : ''}
          ${p.plu ? `<span class="prod-meta plu-chip"><i class="fas fa-weight-hanging"></i> ${t('inventory.plu')}: <b>${escHtml(p.plu)}</b></span>` : ''}
        </div>
      </div>
      <span class="prod-card-badge ${qtyBadge}">${p.quantity} ${t('inventory.col4')}</span>
    </div>
    <div class="prod-card-fields">
      <div class="prod-field full"><span class="prod-field-label"><i class="fas fa-hashtag"></i> ${t('quickEntry.reference')}</span><span class="prod-field-value">${referenceCellHTML(p.reference)}</span></div>
      <div class="prod-field full"><span class="prod-field-label"><i class="fas fa-globe"></i> ${t('quickEntry.countryOfOrigin')}</span><span class="prod-field-value">${escHtml(p.countryOfOrigin || '-')}</span></div>
      <div class="prod-field"><span class="prod-field-label"><i class="fas fa-warehouse"></i> ${t('quickEntry.storageLocation')}</span><span class="prod-field-value">${escHtml(p.storageLocation || '-')}</span></div>
      <div class="prod-field"><span class="prod-field-label"><i class="fas fa-trademark"></i> ${t('inventory.col3')}</span><span class="prod-field-value">${escHtml(brand ? brand.name : (p.brandId || '-'))}</span></div>
    </div>
    ${Auth.buyPriceVisible() ? `<div class="prod-card-cost"><span class="prod-field-label"><i class="fas fa-money-bill-wave"></i> ${t('inventory.col5')}</span><span class="prod-cost-value">DA${fmtMoney((p.buyPrice || 0))}</span></div>` : `<div class="prod-card-cost"><span class="prod-field-label"><i class="fas fa-money-bill-wave"></i> ${t('inventory.col5')}</span><span class="prod-cost-value">â€¢â€¢â€¢â€¢</span></div>`}
    <div class="prod-card-pricerow">
      <div class="price-pill price-unit"><span>${t('inventory.col6')}</span><b>DA${fmtMoney((p.sellPrice || 0))}</b></div>
      <div class="price-pill price-whole"><span>${t('quickEntry.wholesalePrice')}</span><b>DA${fmtMoney((p.wholesalePrice || 0))}</b></div>
      ${(typeof ExtraPrices !== 'undefined' && ExtraPrices ? ExtraPrices.fields().map(f => ExtraPrices.pillHTML(p, f)).join('') : '')}
      <div class="price-pill price-floor fv-minPrice"><span>${t('quickEntry.minPrice')}</span><b>${minFloorText}</b></div>
    </div>
    <div class="prod-card-actions" ondblclick="event.stopPropagation()">
      <button class="btn btn-sm" onclick="openPrintBarcodeModal('${p.id}')" title="${t('inventory.printBarcodeTitle')}"><i class="fas fa-barcode"></i></button>
      ${(isManager || Auth.canEdit('inventory')) ? `<button class="btn btn-sm" onclick="editInventoryItem('${p.id}')"><i class="fas fa-edit"></i></button>` : ''}
      ${(isManager || Auth.canEdit('supplier-returns')) ? `<button class="btn btn-sm btn-return" onclick="openSupplierReturnModal('${p.id}')" title="${t('supplierReturns.modalTitle')}"><i class="fas fa-undo-alt"></i></button>` : ''}
      ${isManager ? `<button class="btn btn-sm btn-danger" onclick="deleteInventoryItem('${p.id}')"><i class="fas fa-trash"></i></button>` : ''}
    </div>
  </div>`;
}

function applyInvFilter() {
  const q = normSearch(document.getElementById('invSearch')?.value || '');
  if (!_invPager) return;
  _invFiltered = _computeInvFiltered(q);
  _invPager.updateData(_invFiltered);
}

function _invHideState() {
  return _invHideUntilSearch && normSearch(document.getElementById('invSearch')?.value || '').trim().length < 2;
}

function _computeInvFiltered(q) {
  if (_invHideUntilSearch && (!q || q.trim().length < 2)) return [];
  if (q && q.trim().length >= 2) {
    // Same smart search as the sales page, but backed by the fast per-record
    // search cache (WeakMap) and capped so a 600k-row dataset never renders an
    // unbounded DOM; the pager above windows what gets drawn.
    return productsMatchingQuery(_invProducts, q, 60);
  }
  return _invProducts;
}

// Grid/list is a pure CSS switch over the unchanged .prod-card markup, so the
// pager, context menu, permissions, dblclick edit and every action stay wired.
function _applyInvViewMode() {
  const grid = document.getElementById('invGrid');
  if (grid) grid.classList.toggle('inv-list-view', _invViewMode === 'list');
  const gb = document.getElementById('invViewGridBtn');
  const lb = document.getElementById('invViewListBtn');
  if (gb) gb.classList.toggle('active', _invViewMode === 'grid');
  if (lb) lb.classList.toggle('active', _invViewMode === 'list');
}

function setInventoryView(mode) {
  _invViewMode = (mode === 'list') ? 'list' : 'grid';
  try { localStorage.setItem('zmt_inv_view_mode', _invViewMode); } catch (e) {}
  _applyInvViewMode();
}

function _syncInvHideBtn() {
  const btn = document.getElementById('invHideUntilSearchBtn');
  if (!btn) return;
  if (_invHideUntilSearch) {
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    btn.title = t('inventory.showOnlyProducts');
  } else {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
    btn.title = t('inventory.hideUntilSearch');
  }
}

function toggleInvHideUntilSearch() {
  _invHideUntilSearch = !_invHideUntilSearch;
  try { localStorage.setItem('zmt_inv_hide_until_search', _invHideUntilSearch ? '1' : '0'); } catch (e) {}
  _syncInvHideBtn();
  if (_invHideUntilSearch) {
    const input = document.getElementById('invSearch');
    if (input) setTimeout(function () { input.focus(); }, 60);
  }
  applyInvFilter();
}

function setupInvSearch() {
  const input = document.getElementById('invSearch');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('input', debounce(applyInvFilter, 300));
}

// ============================================================
// TOOLBAR CUSTOMIZER (تخصيص الأزرار)
// ============================================================
// The operator chooses which inventory buttons stay visible; the choice is kept
// per machine in localStorage and re-applied on every page load. Hiding is done
// through a class (not an inline display) so it never fights the permission
// logic that writes an inline display on some of these buttons.
var INV_TOOLBAR_HIDDEN_KEY = 'zmt_inv_toolbar_hidden';

function _invToolbarTools() {
  return [
    { id: 'invHideUntilSearchBtn', icon: 'fa-eye-slash' },
    { id: 'invViewGridBtn',        icon: 'fa-th-large' },
    { id: 'invViewListBtn',        icon: 'fa-list' },
    { id: 'btnInvAddInvoice',      icon: 'fa-plus' },
    { id: 'btnAddInvDirect',       icon: 'fa-cube' },
    { id: 'btnQuickAddProduct',    icon: 'fa-bolt' },
    { id: 'btnAddBundle',          icon: 'fa-gift' },
    { id: 'btnShowBundles',        icon: 'fa-list' },
    { id: 'btnExtraPriceFields',   icon: 'fa-tags' },
    { id: 'invScaleBtn',           icon: 'fa-weight-hanging' },
    { id: 'invScaleSyncBtn',       icon: 'fa-cloud-upload-alt' },
    { id: 'btnTransferProducts',   icon: 'fa-exchange-alt' },
    { id: 'btnInvExportExcel',     icon: 'fa-file-excel' },
    { id: 'btnInvImportCsv',       icon: 'fa-upload' },
  ];
}

function _invHiddenTools() {
  try {
    const raw = localStorage.getItem(INV_TOOLBAR_HIDDEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function _invApplyToolbarPrefs() {
  const hidden = _invHiddenTools();
  _invToolbarTools().forEach(function (t) {
    const el = document.getElementById(t.id);
    if (!el) return;
    if (hidden.indexOf(t.id) !== -1) el.classList.add('inv-tool-hidden');
    else el.classList.remove('inv-tool-hidden');
  });
}

function openInvToolbarSettings() {
  const container = document.getElementById('pageContainer') || document.body;
  let overlay = document.getElementById('invToolbarSettingsModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'invToolbarSettingsModal';
    overlay.style.zIndex = '99993';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeInvToolbarSettings(); });
    container.appendChild(overlay);
  }
  const hidden = _invHiddenTools();
  const rows = _invToolbarTools().map(function (t) {
    const btn = document.getElementById(t.id);
    if (!btn) return '';
    const labelEl = btn.querySelector('span');
    const label = ((labelEl ? labelEl.textContent : btn.textContent) || btn.getAttribute('aria-label') || '').trim() || t.id;
    const checked = hidden.indexOf(t.id) === -1 ? ' checked' : '';
    return `<label class="inv-tool-row">
      <input type="checkbox" data-inv-tool="${t.id}"${checked}>
      <span class="inv-tool-ico"><i class="fas ${t.icon}"></i></span>
      <span class="inv-tool-name">${escHtml(label)}</span>
    </label>`;
  }).join('');
  overlay.innerHTML = `<div class="modal" style="max-width:520px">
    <div class="qk-head">
      <div class="qk-head-title"><i class="fas fa-sliders-h" style="color:var(--bmw-blue-1)"></i> ${escHtml(t('inventory.customizeTitle') || 'تخصيص أزرار صفحة المخزون')}</div>
      <button class="modal-close" type="button" onclick="closeInvToolbarSettings()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body" style="padding:16px">
      <div class="ms-hint" style="margin-bottom:12px">${escHtml(t('inventory.customizeHint') || 'اختر الأزرار التي تريد إظهارها في صفحة المخزون. يُحفظ اختيارك تلقائيًا.')}</div>
      <div class="inv-tools-list">${rows || '<div class="ms-hint">' + escHtml(t('inventory.empty') || 'المخزون فارغ') + '</div>'}</div>
      <div class="inv-tool-foot">
        <button type="button" class="btn btn-secondary" onclick="invToolbarShowAll()"><i class="fas fa-eye"></i> ${escHtml(t('inventory.customizeShowAll') || 'إظهار الكل')}</button>
        <span style="flex:1"></span>
        <button type="button" class="btn btn-secondary" onclick="closeInvToolbarSettings()">${escHtml(t('common.cancel') || 'إلغاء')}</button>
        <button type="button" class="btn btn-primary" onclick="invToolbarSettingsSave()"><i class="fas fa-check"></i> ${escHtml(t('common.save') || 'حفظ')}</button>
      </div>
    </div>
  </div>`;
  overlay.style.display = 'flex';
}

function closeInvToolbarSettings() {
  const overlay = document.getElementById('invToolbarSettingsModal');
  if (overlay) overlay.style.display = 'none';
}

function invToolbarShowAll() {
  const overlay = document.getElementById('invToolbarSettingsModal');
  if (!overlay) return;
  overlay.querySelectorAll('[data-inv-tool]').forEach(function (cb) { cb.checked = true; });
}

function invToolbarSettingsSave() {
  const overlay = document.getElementById('invToolbarSettingsModal');
  if (!overlay) return;
  const hidden = [];
  overlay.querySelectorAll('[data-inv-tool]').forEach(function (cb) {
    if (!cb.checked) hidden.push(cb.getAttribute('data-inv-tool'));
  });
  try { localStorage.setItem(INV_TOOLBAR_HIDDEN_KEY, JSON.stringify(hidden)); } catch (e) {}
  _invApplyToolbarPrefs();
  closeInvToolbarSettings();
}

// ========== ADD INVENTORY MODAL ==========

function openInvAddModal() {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  populateInvBrands();
  document.getElementById('invAddModal').style.display = 'flex';
  resetInvForm();
  _invRenderExtraInputs('invExtraPricesWrap', 'invAdd', null);
  applyExpiryField('invExpiry');
  applyFamilyField('invFamily');
  if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
  setTimeout(() => { const s = document.getElementById('invSupSearch'); if (s) s.focus(); }, 200);
}

function closeInvAddModal() {
  document.getElementById('invAddModal').style.display = 'none';
}

// ========== ADD PRODUCT WITHOUT INVOICE ==========

function openInvAddDirect() {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  populateInvBrands();
  document.getElementById('invAddDirectModal').style.display = 'flex';
  resetInvDirectForm();
  _invRenderExtraInputs('invExtraDirectWrap', 'invDirect', null);
  applyExpiryField('invDirectExpiry');
  applyFamilyField('invDirectFamily');
  if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
  setTimeout(() => { const s = document.getElementById('invDirectScanner'); if (s) s.focus(); }, 200);
}

function closeInvAddDirect() {
  const el = document.getElementById('invAddDirectModal');
  if (el) el.style.display = 'none';
}

function resetInvDirectForm() {
  document.getElementById('invDirectName').value = '';
  document.getElementById('invDirectBar').value = '';
  document.getElementById('invDirectQty').value = '1';
  invUnitFill('invDirectUnit', Unit.DEFAULT, 'invDirectUnitCustom');
  document.getElementById('invDirectBuy').value = '0';
  document.getElementById('invDirectSell').value = '0';
  document.getElementById('invDirectWhole').value = '0';
  document.getElementById('invDirectReference').value = '';
  document.getElementById('invDirectCountry').value = '';
  document.getElementById('invDirectMark').value = '';
  document.getElementById('invDirectStorage').value = '';
  document.getElementById('invDirectScanner').value = '';
  const expiryDirectEl = document.getElementById('invDirectExpiry');
  if (expiryDirectEl) expiryDirectEl.value = '';
  const familyDirectEl = document.getElementById('invDirectFamily');
  if (familyDirectEl) familyDirectEl.value = '';
  const pluDirectEl = document.getElementById('invDirectPlu');
  if (pluDirectEl) pluDirectEl.value = '';
  const minDirectEl = document.getElementById('invDirectMinPrice');
  if (minDirectEl) minDirectEl.value = '0';
  const ledPurchase = document.getElementById('invDirectLedgerPurchase');
  if (ledPurchase) ledPurchase.checked = true;
  const ledExpense = document.getElementById('invDirectLedgerExpense');
  if (ledExpense) ledExpense.checked = false;
  document.getElementById('invDirectScannerStatus').textContent = t('inventory.scannerReady');
  document.getElementById('invDirectScannerStatus').style.color = '#888';
}

function handleInvDirectScan(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = document.getElementById('invDirectScanner');
  const code = cleanScannedCode(input.value, { scanner: true });
  if (!code) return;
  document.getElementById('invDirectBar').value = code;
  document.getElementById('invDirectName').focus();
  input.value = '';
}

// A PLU has to point at exactly one article â€” otherwise a weighed scan lands on
// the wrong card. The offending product is alerted and returned so the caller
// can abort; `keepId` lets the edit modal keep a product's own code.
function _pluTakenByOther(plu, keepId) {
  if (!plu || typeof DB.findProductsByPlu !== 'function') return null;
  const other = DB.findProductsByPlu(plu).find(p => p.id !== keepId);
  if (!other) return null;
  alert(`${t('inventory.pluConflict')}: ${other.name} (${other.barcode || '-'})`);
  return other;
}

function confirmInvAddDirect() {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  const name = document.getElementById('invDirectName').value.trim();
  const barcode = document.getElementById('invDirectBar').value.trim();
  const brandId = document.getElementById('invDirectBrand').value;
  const reference = document.getElementById('invDirectReference').value.trim() || '';
  const countryOfOrigin = document.getElementById('invDirectCountry').value.trim() || '';
  const mark = document.getElementById('invDirectMark').value.trim() || '';
  const storageLocation = document.getElementById('invDirectStorage').value.trim() || '';
  const plu = document.getElementById('invDirectPlu') ? document.getElementById('invDirectPlu').value.trim() : '';
const minPrice = (function(){ var el=document.getElementById('invDirectMinPrice'); var v=el?parseFloat(el.value):NaN; return isFinite(v)&&v>=0?v:0; })();

  if (!name) { alert(t('inventory.enterName')); return; }
  if (!barcode) { alert(t('inventory.enterBarcode')); return; }
  if (plu && _pluTakenByOther(plu, null)) return;

  const conflict = DB.findProductsByBarcode(barcode).find(p => !DB.isSameProductIdentity(p, { name, brandId }));
  if (conflict) {
    alert(`${t('inventory.barcodeConflict')}: ${conflict.name} (${conflict.barcode})`);
    return;
  }

  const qty = Unit.parse(document.getElementById('invDirectQty').value);
  const buyPrice = parseFloat(document.getElementById('invDirectBuy').value) || 0;
  const sellPrice = parseFloat(document.getElementById('invDirectSell').value) || 0;
  const wholesalePrice = parseFloat(document.getElementById('invDirectWhole').value) || 0;
  const unitSnap = invUnitRead('invDirectUnit', 'invDirectUnitCustom');
  if (!(qty > 0)) { alert(t('inventory.qtyInvalid')); return; }

  const expSettings = getExpirySettings();
  const expiryDate = document.getElementById('invDirectExpiry').value || '';
  if (expSettings.enabled && expSettings.required && !expiryDate) { alert(t('inventory.expiryRequired')); return; }

  const family = document.getElementById('invDirectFamily').value.trim() || '';
  if (window.getPharmacyMode() && !family) { alert(t('inventory.familyRequired')); return; }
  const extraPrices = (typeof ExtraPrices !== 'undefined' && ExtraPrices) ? ExtraPrices.readInputs('invDirect') : {};

  const res = DB.addOrMergeProduct({
    name, barcode, brandId,
    buyPrice, sellPrice, wholesalePrice: wholesalePrice || 0,
    extraPrices,
    quantity: Unit.roundQty(qty),
    unit: unitSnap.unit,
    unitLabel: unitSnap.unitLabel,
    reference, countryOfOrigin, mark, storageLocation,
    plu,
    minPrice,
    family,
    expiryDate,
  }, { source: 'inventory-direct-add' });
  if (!res.ok) {
    alert(res.existing ? `${t('inventory.barcodeConflict')}: ${res.existing.name} (${res.existing.barcode})` : t('inventory.invalidBarcode'));
    return;
  }

  // Financial entry: record the cost (buyPrice x qty) into whichever of
  // purchases / expenses was checked (both, one, or neither).
  const totalCost = qty * buyPrice;
  if (totalCost > 0) {
    if (document.getElementById('invDirectLedgerPurchase')?.checked) {
      DB.addPayment({ amount: totalCost, note: `${name} (${barcode})`, type: 'net_purchase', method: 'cash' });
    }
    if (document.getElementById('invDirectLedgerExpense')?.checked) {
      DB.addPayment({ amount: totalCost, note: `${name} (${barcode})`, type: 'net_expense', method: 'cash' });
    }
  }
  closeInvAddDirect();
  renderInventory();
}

// ========== QUICK ADD FIXED PRODUCT (no quantity / no buy price / no invoice) ==========

function openQuickAddProduct() {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  const modal = document.getElementById('invQuickAddModal');
  if (!modal) return;
  populateInvBrands();
  resetQuickAddForm();
  _invRenderExtraInputs('invExtraQuickWrap', 'invQuick', null);
  applyFamilyField('qaFamily');
  if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
  modal.style.display = 'flex';
  setTimeout(() => { const f = document.getElementById('qaName'); if (f) f.focus(); }, 150);
}

function closeQuickAddProduct() {
  const modal = document.getElementById('invQuickAddModal');
  if (modal) modal.style.display = 'none';
}

function resetQuickAddForm() {
  const nameEl = document.getElementById('qaName');
  const barEl = document.getElementById('qaBar');
  const familyEl = document.getElementById('qaFamily');
  const sellEl = document.getElementById('qaSell');
  if (nameEl) nameEl.value = '';
  if (barEl) barEl.value = '';
  if (familyEl) familyEl.value = '';
  if (sellEl) sellEl.value = '0';
}

function qaBarcodeKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const f = document.getElementById('qaName');
  if (f) f.focus();
}

function confirmQuickAddProduct() {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  const name = document.getElementById('qaName').value.trim();
  const barcode = document.getElementById('qaBar').value.trim();
  const brandId = document.getElementById('qaBrand').value;
  const family = document.getElementById('qaFamily').value.trim();
  const sellPrice = document.getElementById('qaSell').value;

  const extraPrices = (typeof ExtraPrices !== 'undefined' && ExtraPrices) ? ExtraPrices.readInputs('invQuick') : {};
  const res = quickAddProduct({ name, barcode, brandId, family, sellPrice, extraPrices });
  if (!res.ok) {
    alert(res.error || t('inventory.saveFailed'));
    return;
  }
  closeQuickAddProduct();
  renderInventory();
  const msgKey = res.updated ? 'inventory.quickAddUpdated' : 'inventory.quickAddSuccess';
  alert(`${t(msgKey) || t('inventory.productAdded')}: ${res.product.name}`);
}

function resetInvForm() {
  document.getElementById('invProdSearch').value = '';
  document.getElementById('invSearchResults').innerHTML = '';
  document.getElementById('invSelectedProduct').style.display = 'none';
  document.getElementById('invProdName').value = '';
  document.getElementById('invProdBar').value = '';
  document.getElementById('invQty').value = '1';
  invUnitFill('invUnit', Unit.DEFAULT, 'invUnitCustom');
  document.getElementById('invBuyPrice').value = '0';
  document.getElementById('invSellPrice').value = '0';
  document.getElementById('invWholePrice').value = '0';
  const expiryEl = document.getElementById('invExpiry');
  if (expiryEl) expiryEl.value = '';
  document.getElementById('invReference').value = '';
  document.getElementById('invCountry').value = '';
  document.getElementById('invMark').value = '';
  document.getElementById('invStorage').value = '';
  const familyEl = document.getElementById('invFamily');
  if (familyEl) familyEl.value = '';
  const pluEl = document.getElementById('invPlu');
  if (pluEl) pluEl.value = '';
  const minEl = document.getElementById('invMinPrice');
  if (minEl) minEl.value = '0';
  document.getElementById('invSupSearch').value = '';
  _invRenderExtraInputs('invExtraPricesWrap', 'invAdd', null);
  document.getElementById('invSupResults').innerHTML = '';
  document.getElementById('invSelectedSupplier').style.display = 'none';
  document.getElementById('invBarcodeScanner').value = '';
  document.getElementById('invScannerResult').style.display = 'none';
  document.getElementById('invScannerStatus').textContent = t('inventory.scannerReady');
  document.getElementById('invScannerStatus').style.color = '#888';
}

// --- Barcode Scanner ---

function handleInvBarcodeScan(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = document.getElementById('invBarcodeScanner');
    const code = cleanScannedCode(input.value, { scanner: true });
    if (!code) return;

    document.getElementById('invScannerStatus').textContent = t('inventory.scannerProcessing');
    document.getElementById('invScannerStatus').style.color = '#0066B1';

    const existing = DB.getProductByBarcode(code);
    const resultDiv = document.getElementById('invScannerResult');

    if (existing) {
      fillInvFromProduct(existing);
      resultDiv.style.display = 'flex';
      resultDiv.className = 'scanner-result scanner-success';
      resultDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${t('inventory.scannerFound')} <strong>${existing.name}</strong>`;
      document.getElementById('invScannerStatus').textContent = t('inventory.scannerDone');
      document.getElementById('invScannerStatus').style.color = '#28a745';
      setTimeout(() => document.getElementById('invQty').focus(), 100);
    } else {
      document.getElementById('invProdBar').value = code;
      document.getElementById('invProdName').focus();
      resultDiv.style.display = 'flex';
      resultDiv.className = 'scanner-result scanner-warning';
      resultDiv.innerHTML = `<i class="fas fa-qrcode"></i> ${t('inventory.scannerNewBarcode')} <strong dir="ltr">${code}</strong>`;
      document.getElementById('invScannerStatus').textContent = t('inventory.scannerNew');
      document.getElementById('invScannerStatus').style.color = '#f39c12';
    }
    input.value = '';
  }
}

// --- Product search ---

function invSearchKey(e) {
  const box = document.getElementById('invSearchResults');
  if (!box) return;
  const items = Array.prototype.slice.call(box.querySelectorAll('.search-result-item:not(.disabled)'));
  if (!items.length) return;
  let idx = items.findIndex(it => it.classList.contains('inv-sel'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    idx = (idx + 1) % items.length;
    invHighlightSearch(items, idx);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    idx = (idx - 1 + items.length) % items.length;
    invHighlightSearch(items, idx);
  } else if (e.key === 'Enter') {
    if (idx >= 0) { e.preventDefault(); items[idx].click(); }
  }
}

function invHighlightSearch(items, idx) {
  items.forEach((it, i) => it.classList.toggle('inv-sel', i === idx));
  if (items[idx].scrollIntoView) items[idx].scrollIntoView({ block: 'nearest' });
}

function searchInvProduct(q) {
  if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'inventory-product' }); } catch (e) {} }
  const results = document.getElementById('invSearchResults');
  q = normSearch(q);

  const products = DB.getProducts();
  const matches = q
    ? products
        .map(p => ({ p, score: productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(x => x.p)
    : products.slice(0, 10);

  if (matches.length === 0) {
    results.innerHTML = `<div class="search-result-item disabled">${t('inventory.noResults')}</div>`;
    return;
  }

  results.innerHTML = matches.map(p =>
    `<div class="search-result-item" onclick="fillInvFromProduct('${p.id}')">
      <strong>${p.name}</strong>
      <span class="text-muted" dir="ltr">${p.barcode}</span>
    </div>`
  ).join('');
}

function fillInvFromProduct(id) {
  const p = typeof id === 'string' ? DB.getProduct(id) : id;
  if (!p) return;

  document.getElementById('invProdSearch').value = p.name;
  document.getElementById('invSearchResults').innerHTML = '';
  document.getElementById('invSelectedProduct').style.display = 'flex';
  document.getElementById('invSelName').textContent = p.name;
  document.getElementById('invSelBarcode').textContent = p.barcode;

  document.getElementById('invProdName').value = p.name;
  document.getElementById('invProdBar').value = p.barcode;
  document.getElementById('invBrand').value = p.brandId;
  if (p.brandId) {
    const brandSel = document.getElementById('invBrand');
    if (brandSel && !new RegExp('value="' + p.brandId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(brandSel.innerHTML)) {
      const brandName = (typeof findBrandById === 'function') ? findBrandById(p.brandId) : null;
      brandSel.innerHTML += `<option value="${escHtml(p.brandId)}" selected>${escHtml(brandName ? brandName.name : p.brandId)}</option>`;
    }
  }
  document.getElementById('invBuyPrice').value = p.buyPrice;
  document.getElementById('invSellPrice').value = p.sellPrice;
  document.getElementById('invWholePrice').value = p.wholesalePrice || 0;
  // Prefill the floor so a save keeps it instead of silently sending 0.
  const minEl = document.getElementById('invMinPrice');
  if (minEl) minEl.value = String(Math.max(0, parseFloat(p.minPrice) || 0));
  document.getElementById('invQty').value = '1';
  if (typeof ExtraPrices !== 'undefined' && ExtraPrices) ExtraPrices.fillInputs('invAdd', p);
  const expiryEl = document.getElementById('invExpiry');
  if (expiryEl) expiryEl.value = p.expiryDate || '';
  const familyEl = document.getElementById('invFamily');
  if (familyEl) familyEl.value = p.family || '';
}

// --- Supplier search ---

function searchInvSupplier(q) {
  if (q && String(q).trim().length >= 2) { try { DB.logSearch({ query: q, context: 'inventory-supplier' }); } catch (e) {} }
  const results = document.getElementById('invSupResults');
  q = normSearch(q);

  const suppliers = DB.getSuppliers();
  const matches = q
    ? suppliers.filter(s => s.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : suppliers.slice(0, 10);

  if (matches.length === 0) { results.innerHTML = ''; return; }

  results.innerHTML = matches.map(s =>
    `<div class="search-result-item" onclick="selectInvSupplier('${s.id}')">
      <strong>${s.name}</strong>
      <span class="text-muted">${s.phone || ''}</span>
    </div>`
  ).join('');
}

function selectInvSupplier(id) {
  const s = DB.getSuppliers().find(x => x.id === id);
  if (!s) return;
  _invCartSupplierId = s.id;
  document.getElementById('invSelectedSupplier').style.display = 'flex';
  document.getElementById('invSupName').textContent = s.name;
  document.getElementById('invSupResults').innerHTML = '';
}

// --- Cart ---

function invAddToCart() {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  const name = document.getElementById('invProdName').value.trim();
  const barcode = document.getElementById('invProdBar').value.trim();
  const brandId = document.getElementById('invBrand').value;
  const qty = Unit.parse(document.getElementById('invQty').value);
  const unitSnap = invUnitRead('invUnit', 'invUnitCustom');
  const buyPrice = parseFloat(document.getElementById('invBuyPrice').value) || 0;
  const sellPrice = parseFloat(document.getElementById('invSellPrice').value) || 0;
  const wholesalePrice = parseFloat(document.getElementById('invWholePrice').value) || 0;
  const reference = document.getElementById('invReference').value.trim() || '';
  const countryOfOrigin = document.getElementById('invCountry').value.trim() || '';
  const mark = document.getElementById('invMark').value.trim() || '';
  const storageLocation = document.getElementById('invStorage').value.trim() || '';
  const plu = document.getElementById('invPlu') ? document.getElementById('invPlu').value.trim() : '';
const minPrice = (function(){ var el=document.getElementById('invMinPrice'); var v=el?parseFloat(el.value):NaN; return isFinite(v)&&v>=0?v:0; })();

  if (!name) { alert(t('inventory.enterName')); return; }
  if (!barcode) { alert(t('inventory.enterBarcode')); return; }
  if (!(qty > 0)) { alert(t('inventory.qtyInvalid')); return; }

  const expSettings = getExpirySettings();
  const expiry = document.getElementById('invExpiry').value || '';
  if (expSettings.enabled && expSettings.required && !expiry) { alert(t('inventory.expiryRequired')); return; }

  const family = document.getElementById('invFamily').value.trim() || '';
  if (window.getPharmacyMode() && !family) { alert(t('inventory.familyRequired')); return; }
  const extraPrices = (typeof ExtraPrices !== 'undefined' && ExtraPrices) ? ExtraPrices.readInputs('invAdd') : {};

  const conflict = DB.findProductsByBarcode(barcode).find(p => !DB.isSameProductIdentity(p, { name, brandId }));
  if (conflict) {
    alert(`${t('inventory.barcodeUsedBy')}: ${conflict.name} (${conflict.barcode})`);
    return;
  }
  if (plu && _pluTakenByOther(plu, null)) return;

  _invCart.push({ name, barcode, brandId, qty: Unit.roundQty(qty), unit: unitSnap.unit, unitLabel: unitSnap.unitLabel, buyPrice, sellPrice, wholesalePrice, extraPrices, reference, countryOfOrigin, mark, storageLocation, plu, minPrice, family, expiryDate: expiry });
  renderInvCart();
  resetInvForm();
  setTimeout(() => document.getElementById('invBarcodeScanner').focus(), 200);
}

function renderInvCart() {
  const section = document.getElementById('invCartSection');
  const container = document.getElementById('invCartItems');
  const countEl = document.getElementById('invCartCount');
  const totalEl = document.getElementById('invCartTotal');

  if (_invCart.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  countEl.textContent = `(${_invCart.length})`;
  const total = _invCart.reduce((sum, item) => sum + item.qty * item.buyPrice, 0);
  totalEl.textContent = `DA${fmtMoney(total)}`;

  container.innerHTML = _invCart.map((item, i) =>
    `<div class="cart-item">
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span class="text-muted">${item.barcode}</span>
      </div>
      <div class="cart-item-details">
        <span>${Unit.qtyUnit(item.qty, item)} — DA${fmtMoney(item.buyPrice)}</span>
        <span class="cart-item-total">DA${fmtMoney((item.qty * item.buyPrice))}</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="invRemoveFromCart(${i})"><i class="fas fa-times"></i></button>
    </div>`
  ).join('');
  invRecalcTotal();
}

function invRemoveFromCart(idx) {
  _invCart.splice(idx, 1);
  renderInvCart();
}

function invClearCart() {
  if (_invCart.length === 0) return;
  if (!confirm(t('inventory.clearCartConfirm'))) return;
  _invCart = [];
  renderInvCart();
}

function invRecalcTotal() {
  const subtotal = _invCart.reduce((s, i) => s + i.qty * i.buyPrice, 0);
  const timbreEnabled = document.getElementById('invTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreAmount = 0;
  if (timbreEnabled) {
    timbreAmount = subtotal * (timbreRate / 100);
    if (timbreAmount < 5) timbreAmount = 5;
    if (timbreAmount > 10000) timbreAmount = 10000;
  }
  const total = subtotal + timbreAmount;
  document.getElementById('invCartTotal').textContent = 'DA' + fmtMoney(total);
  const timbreEl = document.getElementById('invTimbreAmount');
  if (timbreEnabled && timbreAmount > 0) {
    timbreEl.textContent = '+ DA' + fmtMoney(timbreAmount);
    timbreEl.style.display = '';
  } else {
    timbreEl.style.display = 'none';
  }
}

function invConfirmInvoice() {
  if (_invCart.length === 0) { alert(t('inventory.cartEmpty')); return; }

  const supplierId = _invCartSupplierId;
  let totalAmount = 0;
  const invoiceItems = [];

  for (const item of _invCart) {
    if (item.barcode) {
      const conflict = DB.findProductsByBarcode(item.barcode).find(p => !DB.isSameProductIdentity(p, item));
      if (conflict) {
        _invCart = [];
        _invCartSupplierId = null;
        renderInvCart();
        closeInvAddModal();
        renderInventory();
        alert(`${t('inventory.barcodeUsedBy')}: ${conflict.name} (${conflict.barcode})`);
        return;
      }
    }
  }

  _invCart.forEach(item => {
    const itemTotal = item.qty * item.buyPrice;
    totalAmount += itemTotal;

    const res = DB.addOrMergeProduct({
      name: item.name, barcode: item.barcode,
      brandId: item.brandId,
      buyPrice: item.buyPrice, sellPrice: item.sellPrice,
      wholesalePrice: item.wholesalePrice || 0,
      extraPrices: item.extraPrices || {},
      quantity: item.qty, supplierId,
      unit: item.unit, unitLabel: item.unitLabel,
      reference: item.reference || '', countryOfOrigin: item.countryOfOrigin || '',
      mark: item.mark || '', storageLocation: item.storageLocation || '',
      plu: item.plu || '',
      minPrice: (typeof item.minPrice === 'number' ? item.minPrice : (parseFloat(item.minPrice) || 0)),
      family: item.family || '',
      expiryDate: item.expiryDate || '',
    }, { source: 'inventory-invoice' });
    if (!res.ok) {
      _invCart = [];
      _invCartSupplierId = null;
      renderInvCart();
      closeInvAddModal();
      renderInventory();
      alert(res.existing ? `${t('inventory.barcodeUsedBy')}: ${res.existing.name} (${res.existing.barcode})` : t('inventory.invalidBarcode'));
      return;
    }

    const prod = res.product;
    invoiceItems.push(Object.assign({
      productId: prod.id, barcode: prod.barcode,
      name: item.name, qty: Unit.roundQty(item.qty),
      price: item.buyPrice, total: itemTotal,
    }, Unit.snapshot(prod || item)));
  });

  // Calculate timbre fiscal
  const timbreEnabled = document.getElementById('invTimbreCheck').checked;
  const timbreRate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
  let timbreFiscal = 0;
  if (timbreEnabled) {
    timbreFiscal = totalAmount * (timbreRate / 100);
    if (timbreFiscal < 5) timbreFiscal = 5;
    if (timbreFiscal > 10000) timbreFiscal = 10000;
  }

  if (supplierId) {
    DB.addInvoice({ supplierId, type: 'supplier', date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal });
    const suppliers = DB.getSuppliers();
    const idx = suppliers.findIndex(s => s.id === supplierId);
    if (idx !== -1) {
      suppliers[idx].balance = (parseFloat(suppliers[idx].balance) || 0) + totalAmount;
      DB.saveSuppliers(suppliers);
    }
  } else {
    DB.addInvoice({ supplierId: null, type: 'purchase', date: Date.now(), items: invoiceItems, totalAmount, timbreFiscal });
  }

  _invCart = [];
  _invCartSupplierId = null;
  document.getElementById('invTimbreCheck').checked = false;
  renderInvCart();
  closeInvAddModal();
  renderInventory();

  const cnt = invoiceItems.length;
  const totalQty = invoiceItems.reduce((s, it) => s + it.qty, 0);
  let msg = `${t('inventory.invoiceSaved')} DA${fmtMoney(totalAmount)}`;
  if (timbreFiscal > 0) msg += ` + ${t('inventory.fiscalStamp')} DA${fmtMoney(timbreFiscal)}`;
  msg += ` ${t('inventory.includes')} ${cnt} ${t('inventory.productUnit')} (${totalQty} ${t('inventory.pieceUnit')})`;
  alert(msg);
}

// ========== EDIT / DELETE ==========

function editInventoryItem(id) {
  if (!Auth.isManager() && !Auth.canEdit('inventory')) { alert(t('common.noPermission')); return; }
  const p = DB.getProduct(id);
  if (!p) return;

  // Ensure the current brand is always present (even custom/unknown) then build favourites-first options.
  const brandName = (typeof findBrandById === 'function') ? findBrandById(p.brandId) : null;
  let brandOptions = (typeof buildBrandSelectOptions === 'function')
    ? buildBrandSelectOptions(p.brandId)
    : [...BRANDS.global, ...BRANDS.chinese].map(b => `<option value="${b.id}" ${b.id === p.brandId ? 'selected' : ''}>${b.name}</option>`).join('');
  if (p.brandId && !new RegExp('value="' + p.brandId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(brandOptions)) {
    const label = brandName ? brandName.name : p.brandId;
    brandOptions += `<option value="${escHtml(p.brandId)}" selected>${escHtml(label)}</option>`;
  }

  // خيار المورد نفسه في نماذج الإضافة: يبدأ فارغاً (اختياري) ويُعرض الحالي محدداً.
  const supplierList = DB.getSuppliers().slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  let supplierOptions = `<option value="" ${!p.supplierId ? 'selected' : ''}>${t('inventory.supplierOptional')}</option>` +
    supplierList.map(s => `<option value="${s.id}" ${s.id === p.supplierId ? 'selected' : ''}>${escHtml(s.name)}</option>`).join('');
  if (p.supplierId && !new RegExp('value="' + String(p.supplierId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(supplierOptions)) {
    supplierOptions += `<option value="${escHtml(p.supplierId)}" selected>${escHtml(p.supplierId)}</option>`;
  }

  const html = `
    <div class="form-group">
      <label>${t('inventory.editLabelName')}</label>
      <input type="text" class="form-input" id="invEditName" value="${escHtml(p.name)}">
    </div>
    <div class="form-group">
      <label>${t('inventory.editLabelBarcode')}</label>
      <input type="text" class="form-input" id="invEditBar" value="${p.barcode}" dir="ltr">
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label>${t('inventory.editLabelBrand')}</label>
        <select class="form-input" id="invEditBrand">${brandOptions}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>${t('inventory.editLabelQty')}</label>
        <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="invEditQty" value="${toLatinDigits(p.quantity)}" min="0" step="any" dir="ltr">
      </div>
      <div class="form-group">
        <label>${t('units.label')}</label>
        <select class="form-input" id="invEditUnit" onchange="invUnitSync('invEditUnit','invEditUnitCustom')"></select>
        <input type="text" class="form-input" id="invEditUnitCustom" style="display:none;margin-top:6px" placeholder="${t('units.customPlaceholder')}" value="${escHtml(p.unit === 'custom' ? (p.unitLabel || '') : '')}">
      </div>
      ${Auth.isManager() ? `
      <div class="form-group">
        <label>${t('inventory.editLabelBuyPrice')}</label>
        <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="invEditBuy" value="${toLatinDigits(p.buyPrice)}" min="0" dir="ltr">
      </div>` : ''}
      <div class="form-group">
        <label>${t('inventory.editLabelSellPrice')}</label>
        <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="invEditSell" value="${toLatinDigits(p.sellPrice)}" min="0" dir="ltr">
      </div>
    </div>
    <div class="form-group">
      <label>${t('inventory.editLabelWholesale')}</label>
      <input type="text" class="form-input no-spinner num-input" inputmode="decimal" id="invEditWhole" value="${toLatinDigits(p.wholesalePrice || 0)}" min="0" dir="ltr">
    </div>
    ${(typeof ExtraPrices !== 'undefined' && ExtraPrices) ? (function () {
      const html = ExtraPrices.inputsHTML('invEdit', p);
      return html ? `<div class="extra-price-section"><div class="extra-price-section-title"><i class="fas fa-tags"></i> ${t('inventory.extraPricesTitle')}</div>${html}</div>` : '';
    })() : ''}
    <div class="form-group" id="invEditExpiryRow">
      <label>${t('inventory.expiryDate')}</label>
      <input type="date" class="form-input" id="invEditExpiry" value="${escHtml(p.expiryDate || '')}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>${t('quickEntry.reference')}</label>
        <input type="text" class="form-input" id="invEditReference" value="${escHtml(p.reference || '')}" dir="ltr">
      </div>
      <div class="form-group">
        <label>${t('quickEntry.countryOfOrigin')}</label>
        <input type="text" class="form-input" id="invEditCountry" value="${escHtml(p.countryOfOrigin || '')}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>${t('quickEntry.mark')}</label>
        <input type="text" class="form-input" id="invEditMark" value="${escHtml(p.mark || '')}">
      </div>
      <div class="form-group">
        <label>${t('quickEntry.storageLocation')}</label>
        <input type="text" class="form-input" id="invEditStorage" value="${escHtml(p.storageLocation || '')}">
      </div>
    </div>
    <div class="form-group" id="invEditFamilyRow">
      <label>${t('inventory.family')}</label>
      <input type="text" class="form-input" id="invEditFamily" list="familyDatalist" value="${escHtml(p.family || '')}" placeholder="${t('inventory.family')}">
    </div>
    <div class="form-group" id="invEditPluRow">
      <label>${t('inventory.plu')}</label>
      <input type="text" class="form-input" id="invEditPlu" dir="ltr" inputmode="numeric" maxlength="8" value="${escHtml(p.plu || '')}" placeholder="${t('inventory.pluPlaceholder')}">
    </div>
    <div class="form-group" id="invEditMinPriceRow">
      <label>${t('quickEntry.minPrice')}</label>
      <input type="number" class="form-input" id="invEditMinPrice" inputmode="decimal" min="0" step="any" value="${toLatinDigits(p.minPrice || 0)}" placeholder="${t('quickEntry.minPricePlaceholder')}">
    </div>
    <div class="form-group">
      <label>${t('inventory.supplierOptional')}</label>
      <select class="form-input" id="invEditSupplier">${supplierOptions}</select>
    </div>
    <div id="invDiagPanel" style="display:none;margin-top:12px"></div>`;

  const diagBtn = `<button type="button" class="btn" style="margin-inline-end:auto" onclick="invShowDiagnosis('${id}')"><i class="fas fa-stethoscope"></i> ${t('inventory.diagnoseBtn')}</button>`;

  showModal(t('inventory.editTitle'), html, () => {
    const oldQty = p.quantity;
    const oldBuyPrice = p.buyPrice;
    const newQty = Unit.roundQty(Unit.parse(document.getElementById('invEditQty').value));
    if (!(newQty >= 0)) { alert(t('inventory.qtyInvalid')); return false; }
    const editUnit = invUnitRead('invEditUnit', 'invEditUnitCustom');
    const buyPriceInput = document.getElementById('invEditBuy');
    const newBuyPrice = (buyPriceInput && Auth.isManager()) ? (parseFloat(buyPriceInput.value) || 0) : oldBuyPrice;
    const newSellPrice = parseFloat(document.getElementById('invEditSell').value) || 0;
    const newWholePrice = parseFloat(document.getElementById('invEditWhole').value) || 0;

    const expSettings = getExpirySettings();
    const newExpiry = document.getElementById('invEditExpiry').value || '';
    if (expSettings.enabled && expSettings.required && !newExpiry) { alert(t('inventory.expiryRequired')); return false; }

    const pluEl = document.getElementById('invEditPlu');
    const newPlu = pluEl ? pluEl.value.trim() : (p.plu || '');
    if (newPlu && _pluTakenByOther(newPlu, id)) return false;

    const res = DB.updateProduct(id, {
      name: document.getElementById('invEditName').value.trim() || p.name,
      barcode: document.getElementById('invEditBar').value.trim() || p.barcode,
      brandId: document.getElementById('invEditBrand').value,
      quantity: newQty, buyPrice: newBuyPrice, sellPrice: newSellPrice, wholesalePrice: newWholePrice,
      extraPrices: (typeof ExtraPrices !== 'undefined' && ExtraPrices) ? ExtraPrices.readInputs('invEdit') : {},
      unit: editUnit.unit, unitLabel: editUnit.unitLabel,
      reference: document.getElementById('invEditReference').value.trim() || '',
      countryOfOrigin: document.getElementById('invEditCountry').value.trim() || '',
      mark: document.getElementById('invEditMark').value.trim() || '',
      storageLocation: document.getElementById('invEditStorage').value.trim() || '',
      plu: newPlu,
      minPrice: (function(){ var el=document.getElementById('invEditMinPrice'); var v=el?parseFloat(el.value):NaN; return isFinite(v)&&v>=0?v:(p.minPrice||0); })(),
      family: document.getElementById('invEditFamily').value.trim() || '',
      expiryDate: newExpiry,
      supplierId: (function(){ var el=document.getElementById('invEditSupplier'); return el && el.value ? el.value : null; })(),
    });
    if (res && res.ok === false) {
      // Never close the modal on a silent no-op: the edit was NOT persisted.
      alert(res.reason === 'not_found'
        ? t('inventory.productNotFoundEdit')
        : t('inventory.editOutOfScope'));
      return false;
    }

    if (oldQty !== newQty || oldBuyPrice !== newBuyPrice) {
      const invoices = DB.getInvoices().filter(inv => inv.supplierId);
      invoices.forEach(inv => {
        const item = inv.items.find(it => it.productId === id);
        if (item) {
          const oldTotal = item.total;
          item.qty = newQty;
          item.price = newBuyPrice;
          item.total = newQty * newBuyPrice;
          item.unit = editUnit.unit;
          if (editUnit.unitLabel) item.unitLabel = editUnit.unitLabel; else delete item.unitLabel;
          inv.totalAmount = inv.items.reduce((sum, it) => sum + it.total, 0);
          DB.updateInvoice(inv.id, { items: inv.items, totalAmount: inv.totalAmount });

          const suppliers = DB.getSuppliers();
          const supIdx = suppliers.findIndex(s => s.id === inv.supplierId);
          if (supIdx !== -1) {
            suppliers[supIdx].balance = (parseFloat(suppliers[supIdx].balance) || 0) - oldTotal + item.total;
            DB.saveSuppliers(suppliers);
          }
        }
      });
    }
    return true;
  }, () => renderInventory(), diagBtn);
  applyExpiryField('invEditExpiry');
  applyFamilyField('invEditFamily');
  invUnitFill('invEditUnit', p.unit, 'invEditUnitCustom');
}

// ===== PRODUCT DIAGNOSIS UI =====
// Read-only report rendered inside the product-edit modal (button «تشخيص»).
// It shows every sibling card, the reason each is kept separate, the supplier
// difference and the audit trail — so the user can see WHY a product appears as
// two cards (a smart split, a supplier difference, or an independent creation).
function _invDiagEsc(v) { return (typeof escHtml === 'function') ? escHtml(v == null ? '' : String(v)) : String(v == null ? '' : v); }
function _invDiagDate(ts) { return ts ? new Date(ts).toLocaleString('ar-EG-u-nu-latn') : '—'; }
function _invDiagMoney(v) { return (parseFloat(v) || 0).toFixed(2); }
function _invDiagChip(txt, color) {
  return `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600;background:${color}1a;color:${color};border:1px solid ${color}55">${_invDiagEsc(txt)}</span>`;
}

function _invDiagHtml(rep) {
  const p = rep.product;
  const warn = '#dc3545', good = '#28a745', info = '#0d6efd', mut = '#6c757d';
  let h = '';

  // --- summary ---
  h += `<div style="border:1px solid var(--silver-300);border-radius:8px;padding:10px 12px;background:var(--silver-50);font-size:13px">`;
  h += `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">`;
  h += `<strong><i class="fas fa-stethoscope"></i> ${t('inventory.diagTitle')}</strong>`;
  h += rep.duplicate ? _invDiagChip(t('inventory.diagDuplicateYes'), warn) : _invDiagChip(t('inventory.diagDuplicateNo'), good);
  h += `</div>`;
  h += `<div>${_invDiagEsc(p.name)} — <span dir="ltr">${_invDiagEsc(p.barcode)}</span></div>`;
  h += `<div style="color:var(--silver-600);margin-top:4px">${t('inventory.diagGroupCount')}: <strong>${rep.groupCount}</strong>`;
  if (p.createdVia) h += ` · ${t('inventory.diagSource')}: ${_invDiagEsc(p.createdVia)}`;
  h += `</div>`;
  const verdictMap = { single: 'diagVerdictSingle', split: 'diagVerdictSplit', independent_creation: 'diagVerdictIndependent', identity_mismatch: 'diagVerdictIdentity' };
  h += `<div style="margin-top:6px">${t('inventory.diagVerdictLabel')}: <strong>${t('inventory.' + (verdictMap[rep.verdict] || 'diagVerdictSingle'))}</strong></div>`;
  h += `<div style="color:var(--silver-600);margin-top:4px">${t('inventory.diagScope')}: ${t('inventory.diagCompany')} ${_invDiagEsc(rep.scope.companyId || '—')} · ${t('inventory.diagStore')} ${_invDiagEsc(rep.scope.storeId || '—')} · ${rep.scope.inScope ? _invDiagChip(t('inventory.diagInScope'), good) : _invDiagChip(t('inventory.diagOutScope'), warn)}</div>`;
  h += `</div>`;

  // --- supplier hint ---
  h += `<div style="margin-top:8px;font-size:12.5px">`;
  h += rep.supplierDiffers
    ? `<span style="color:${warn}"><i class="fas fa-exclamation-triangle"></i> ${t('inventory.diagSupplierDiff')}</span>`
    : `<span style="color:${mut}">${t('inventory.diagSupplierSame')}</span>`;
  h += `</div>`;

  // --- cards ---
  h += `<div style="margin-top:10px;overflow:auto"><table class="data-table" style="font-size:12px;min-width:600px"><thead><tr>`;
  h += `<th>#</th><th>${t('inventory.diagCreated')}</th><th>${t('inventory.diagSource')}</th><th>${t('inventory.diagSupplier')}</th><th>${t('inventory.diagQty')}</th><th>${t('inventory.diagBuy')}</th><th>${t('inventory.diagSell')}</th><th>${t('inventory.diagRealCost')}</th><th>${t('inventory.diagSplitReason')}</th>`;
  h += `</tr></thead><tbody>`;
  rep.group.forEach((r, i) => {
    const rowStyle = r.isCurrent ? 'background:var(--silver-100);font-weight:600' : '';
    h += `<tr style="${rowStyle}">`;
    h += `<td>${i + 1}${r.isCurrent ? ` <span style="color:${info}">(${t('inventory.diagCurrent')})</span>` : ''}</td>`;
    h += `<td style="white-space:nowrap">${_invDiagDate(r.createdAt)}</td>`;
    h += `<td>${_invDiagEsc(r.createdVia || '—')}`;
    if (r.splitFromId) {
      const oi = rep.group.findIndex(x => x.id === r.splitFromId);
      h += `<div style="font-size:10.5px;color:${mut}">${t('inventory.diagSplitFrom')} ${oi >= 0 ? ('#' + (oi + 1)) : _invDiagEsc(String(r.splitFromId).slice(0, 6))}</div>`;
    }
    h += `</td>`;
    h += `<td>${r.supplierName ? _invDiagEsc(r.supplierName) : (r.supplierId ? _invDiagEsc(r.supplierId) : `<span style="color:${mut}">${t('inventory.diagNone')}</span>`)}</td>`;
    h += `<td>${r.quantity}</td>`;
    h += `<td>${_invDiagMoney(r.buyPrice)}</td>`;
    h += `<td>${_invDiagMoney(r.sellPrice)}</td>`;
    h += `<td>${_invDiagMoney(r.realCost)}</td>`;
    h += `<td>${(!r.isCurrent && r.splitReason && r.splitReason !== 'none') ? _invDiagChip(r.splitReason, warn) : `<span style="color:${mut}">—</span>`}`;
    if (!r.isCurrent && r.identityDiffs && r.identityDiffs.length) {
      h += `<div style="font-size:10.5px;color:${warn}">${t('inventory.diagIdentityDiff')}: ${_invDiagEsc(r.identityDiffs.join(', '))}</div>`;
    }
    h += `</td>`;
    h += `</tr>`;
  });
  h += `</tbody></table></div>`;

  // --- quantity cross-check ---
  const tt = rep.totals;
  const qtyOk = Math.abs(tt.groupQty - tt.purchaseQty) < 1e-6;
  h += `<div style="margin-top:8px;font-size:12.5px">`;
  h += `<strong>${t('inventory.diagQtyCheck')}</strong>: ${t('inventory.diagGroupQty')} <strong>${tt.groupQty}</strong> · ${t('inventory.diagPurchaseQty')} <strong>${tt.purchaseQty}</strong> · ${t('inventory.diagPurchaseLines')} <strong>${tt.purchaseLineCount}</strong>`;
  h += `<div style="margin-top:3px;color:${qtyOk ? mut : warn}">${qtyOk ? t('inventory.diagQtyOk') : t('inventory.diagQtyMismatch')}</div>`;
  h += `</div>`;

  // --- audit trail ---
  h += `<div style="margin-top:10px;font-size:12.5px"><strong>${t('inventory.diagAudit')}</strong></div>`;
  if (!rep.audit.length) {
    h += `<div style="color:var(--silver-600);font-size:12px">${t('inventory.diagNoAudit')}</div>`;
  } else {
    h += `<div style="max-height:150px;overflow:auto;border:1px solid var(--silver-300);border-radius:6px;margin-top:4px">`;
    rep.audit.forEach(a => {
      const col = a.action === 'split' ? warn : (a.action === 'merge' ? good : (a.action === 'add' ? info : mut));
      h += `<div style="padding:4px 8px;border-bottom:1px solid var(--silver-200);font-size:11.5px">`;
      h += `<span style="color:${mut}">${_invDiagDate(a.ts)}</span> · <span style="color:${col};font-weight:600">${_invDiagEsc(a.action)}</span>`;
      if (a.source) h += ` · ${t('inventory.diagSource')}: ${_invDiagEsc(a.source)}`;
      if (a.reason) h += ` · ${t('inventory.diagReason')}: ${_invDiagEsc(a.reason)}`;
      if (a.detail) h += ` · ${_invDiagEsc(a.detail)}`;
      h += `</div>`;
    });
    h += `</div>`;
  }

  // --- hint ---
  h += `<div style="margin-top:8px;font-size:11.5px;color:var(--silver-600)"><i class="fas fa-info-circle"></i> ${t('inventory.diagHint')}</div>`;
  return h;
}

function invShowDiagnosis(id) {
  const panel = document.getElementById('invDiagPanel');
  if (!panel) return;
  let rep = null;
  try { rep = DB.diagnoseProduct(id); } catch (e) { rep = null; }
  if (!rep || !rep.ok) {
    panel.innerHTML = `<div class="placeholder-box" style="padding:12px">${t('inventory.diagNotFound')}</div>`;
    panel.style.display = 'block';
    return;
  }
  panel.innerHTML = _invDiagHtml(rep);
  panel.style.display = 'block';
  try { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
}

function deleteInventoryItem(id) {
  if (!Auth.isManager()) { alert(t('common.noPermission')); return; }
  if (!confirm(t('inventory.deleteConfirm'))) return;
  const p = DB.getProduct(id);
  if (!p) return;

  const invoices = DB.getInvoices();
  invoices.forEach(inv => {
    const itemIdx = inv.items.findIndex(it => it.productId === id);
    if (itemIdx !== -1) {
      const removedTotal = inv.items[itemIdx].total;
      inv.items.splice(itemIdx, 1);
      inv.totalAmount -= removedTotal;
      DB.updateInvoice(inv.id, { items: inv.items, totalAmount: inv.totalAmount });
      if (inv.supplierId) {
        const suppliers = DB.getSuppliers();
        const supIdx = suppliers.findIndex(s => s.id === inv.supplierId);
        if (supIdx !== -1) {
          suppliers[supIdx].balance = (parseFloat(suppliers[supIdx].balance) || 0) - removedTotal;
          DB.saveSuppliers(suppliers);
        }
      }
    }
  });

  DB.deleteProduct(id);
  renderInventory();
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ========== EXPORT / IMPORT EXCEL & CSV ==========

// Feature 7 â€” remember whether zero-quantity products are left out of the
// Excel sheet. The choice survives restarts and is reused by the Ctrl+X
// (buy-price hidden) shortcut path, which skips the options modal.
var INV_XLSX_EXCLUDE_ZERO_KEY = 'zmt_xlsx_exclude_zero_qty';

function invXlsxExcludeZeroPref() {
  try { return localStorage.getItem(INV_XLSX_EXCLUDE_ZERO_KEY) === '1'; } catch (e) { return false; }
}

function invXlsxSetExcludeZeroPref(v) {
  try { localStorage.setItem(INV_XLSX_EXCLUDE_ZERO_KEY, v ? '1' : '0'); } catch (e) {}
}

// A fixed (unlimited) record â€” restaurant menu item, service â€” carries quantity
// 0 by design and is still sellable, so it must never be filtered out as
// "zero quantity".
function invXlsxIsZeroQty(p) {
  return (Number(p && p.quantity) || 0) <= 0 && !(p && p.fixed === true);
}

function invXlsxZeroQtyCount() {
  return (DB.getProducts() || []).filter(invXlsxIsZeroQty).length;
}

// Read the modal checkbox (when present), persist it, close the modal and run.
function exportProductsExcelRun(includeBuyPrice) {
  const cb = document.getElementById('expExcludeZero');
  const exclude = cb ? !!cb.checked : invXlsxExcludeZeroPref();
  invXlsxSetExcludeZeroPref(exclude);
  const modal = document.getElementById('exportChoiceModal');
  if (modal) modal.remove();
  runExportProductsExcel(includeBuyPrice, exclude);
}

function _invExportDoneMsg(skipped) {
  let msg = t('inventory.exportSuccess');
  if (skipped > 0) {
    const label = t('inventory.exportSkippedZero');
    msg += '\n' + label + ' ' + skipped;
  }
  return msg;
}

// Ask the user whether the purchase price should be included or hidden, and
// whether zero-quantity products should be excluded from the sheet.
function exportProductsExcel() {
  // If buy-price visibility is currently hidden (Ctrl+X), export without it.
  if (typeof Auth !== 'undefined' && !Auth.buyPriceVisible()) {
    runExportProductsExcel(false, invXlsxExcludeZeroPref());
    return;
  }
  const existing = document.getElementById('exportChoiceModal');
  if (existing) existing.remove();

  const zeroCount = invXlsxZeroQtyCount();
  const excludeOn = invXlsxExcludeZeroPref();
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'exportChoiceModal';
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="modal" style="max-width:440px">
    <div class="modal-header">
      <h3><i class="fas fa-file-excel" style="color:#2F5496"></i> ${t('inventory.exportXlsxTitle')}</h3>
      <button class="modal-close" onclick="document.getElementById('exportChoiceModal').remove()">&times;</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
      <label class="exp-zero-opt" for="expExcludeZero">
        <input type="checkbox" id="expExcludeZero" ${excludeOn ? 'checked' : ''}>
        <span>
          <b>${t('inventory.exportExcludeZero')}</b>
          <small>${t('inventory.exportExcludeZeroHint')}${zeroCount ? ' — ' + zeroCount : ''}</small>
        </span>
      </label>
      <button class="btn btn-primary" onclick="exportProductsExcelRun(true)" style="width:100%">
        <i class="fas fa-coins"></i> ${t('inventory.exportWithBuy')}
      </button>
      <button class="btn" onclick="exportProductsExcelRun(false)" style="width:100%">
        <i class="fas fa-eye-slash"></i> ${t('inventory.exportWithoutBuy')}
      </button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function runExportProductsExcel(includeBuyPrice, excludeZero) {
  const allProducts = DB.getProducts() || [];
  const exclude = (excludeZero === undefined) ? invXlsxExcludeZeroPref() : !!excludeZero;
  const products = exclude
    ? allProducts.filter(p => !invXlsxIsZeroQty(p))
    : allProducts;
  const skipped = allProducts.length - products.length;
  if (!allProducts.length || !products.length) {
    alert(t('inventory.noExport'));
    return;
  }

  const user = (typeof Auth !== 'undefined' && Auth.getCurrentUser && Auth.getCurrentUser())
    ? (Auth.getCurrentUser().username || '') : '';
  const labels = {
    title: t('inventory.exportSheetTitle'),
    storeName: localStorage.getItem('zmt_store_name') || '',
    date: t('inventory.exportDate'),
    count: t('inventory.exportCount'),
    by: t('inventory.exportBy'),
    user,
    total: t('inventory.exportTotal'),
    sheetName: 'ZMT PIECE',
    headers: [
      t('inventory.colName'), t('inventory.colBarcode'), t('inventory.colBrand'),
      t('inventory.colMark'), t('inventory.colReference'), t('inventory.colCountry'),
      t('inventory.colStorage'), t('inventory.colQty'), t('inventory.colBuyPrice'),
      t('inventory.colSellPrice'), t('inventory.colWholePrice'), t('inventory.colExpiry'),
    ],
  };

  const wb = DB.exportProductsXLSX(includeBuyPrice, labels, { products });
  const today = new Date().toISOString().slice(0, 10);
  const fileName = `ZMT_PIECE_Products_${today}.xlsx`;
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

  if (window.electronAPI && window.electronAPI.saveFile) {
    window.electronAPI.saveFile({
      defaultPath: fileName,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    }).then(result => {
      if (!result.canceled && result.filePath) {
        window.electronAPI.writeFileBinary(result.filePath, base64).then(res => {
          if (res && res.success) alert(_invExportDoneMsg(skipped));
          else alert(t('inventory.exportError') + ((res && res.error) || ''));
        });
      }
    });
  } else {
    const arrayBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function importProductsCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
  const reader = new FileReader();
  reader.onload = function(e) {
    let result;
    try {
      result = isXlsx ? DB.importProductsXLSX(e.target.result) : DB.importProductsCSV(e.target.result);
    } catch (err) {
      alert(t('inventory.importFailed'));
      input.value = '';
      return;
    }
    if (result.count > 0) {
      renderInventory();
      let msg = `${t('inventory.importSuccess')} ${result.count} ${t('inventory.importSuccessEnd')}`;
      if (result.totalCost > 0) {
        msg += `\n${t('inventory.importCost')} DA${fmtMoney(result.totalCost)} (${t('inventory.importRecorded')})`;
      }
      alert(msg);
    } else {
      alert(t('inventory.importFailed'));
    }
    input.value = '';
  };
  if (isXlsx) reader.readAsArrayBuffer(file);
  else reader.readAsText(file, 'UTF-8');
}

// ========== GLOBAL MODAL ==========

function showModal(title, bodyHtml, onConfirm, onClose, extraFooterHtml) {
  const existing = document.getElementById('genericModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'genericModal';
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="modal" style="max-width:550px">
    <div class="modal-header">
      <h3><i class="fas fa-edit"></i> ${title}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>
    <div class="modal-footer">
      ${extraFooterHtml || ''}
      <button class="btn" onclick="this.closest('.modal-overlay').remove(); if(typeof onClose === 'function') onClose()">${t('common.cancel')}</button>
      <button class="btn btn-success" id="modalConfirmBtn"><i class="fas fa-check"></i> ${t('common.save')}</button>
    </div>
  </div>`;

  document.body.appendChild(modal);
  document.getElementById('modalConfirmBtn').onclick = function() {
    if (onConfirm()) {
      modal.remove();
      if (typeof onClose === 'function') onClose();
    }
  };
  modal.addEventListener('click', (e) => { if (e.target === modal) { modal.remove(); if (typeof onClose === 'function') onClose(); } });
}

function _invModalHandler(e) {
  const modal = document.getElementById('invAddModal');
  if (e.target === modal) closeInvAddModal();
}
document.removeEventListener('click', _invModalHandler);
document.addEventListener('click', _invModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _invModalHandler });

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['inventory'] = function inventorySyncData() {
  window.syncPreserveRefresh({
    search: ['invSearch'],
    render: () => {
      _invProducts = DB.getProducts();
      const q = normSearch(document.getElementById('invSearch')?.value || '');
      _invFiltered = _computeInvFiltered(q);
      _invPager.updateDataKeepScroll(_invFiltered);
    },
  });
};
window.addEventListener('zmt:buyprice-toggle', function(){ renderInventory(); });
/* ===== BUNDLE OFFERS (عروض الحزم) ===== */
var _bundleComponents = [];
var _bundleEditId = null;

function _bundleCalcPrice() {
  var total = _bundleComponents.reduce(function (s, c) { return s + (parseFloat(c.sellPrice) || 0) * (parseFloat(c.qty) || 0); }, 0);
  var el = document.getElementById('bundlePrice');
  if (el && (el.value === '' || el.dataset.auto === '1')) { el.value = total.toFixed(2); el.dataset.auto = '1'; }
}

function openBundleModal(editId) {
  _ensureBundleModals();
  /* Edit modal must sit above the list; hide the list while editing. */
  var listModal = document.getElementById('bundlesListModal');
  window._bundleListWasOpen = listModal && listModal.style.display !== 'none';
  if (listModal) listModal.style.display = 'none';
  _bundleEditId = editId || null;
  _bundleComponents = [];
  var modal = document.getElementById('bundleModal');
  if (!modal) return;
  document.getElementById('bundleModalTitle').textContent = editId ? t('inventory.bundleEditTitle') : t('inventory.bundleAddTitle');
  document.getElementById('bundleEditId').value = editId || '';
  document.getElementById('bundleName').value = '';
  document.getElementById('bundleBarcode').value = '';
  document.getElementById('bundlePrice').value = '';
  document.getElementById('bundlePrice').dataset.auto = '1';
  document.getElementById('bundleSearch').value = '';
  document.getElementById('bundleSearchResults').innerHTML = '';
  if (editId) {
    var b = DB.getBundle(editId);
    if (b) {
      document.getElementById('bundleName').value = b.name || '';
      document.getElementById('bundleBarcode').value = b.barcode || '';
      document.getElementById('bundlePrice').value = b.price || 0;
      document.getElementById('bundlePrice').dataset.auto = '0';
      _bundleComponents = (b.components || []).map(function (c) {
        var p = DB.getProduct(c.productId);
        return { productId: c.productId, name: (p && p.name) || c.name || '', qty: c.qty, buyPrice: (p && p.buyPrice) || 0, sellPrice: (p && p.sellPrice) || 0 };
      });
    }
  }
  renderBundleComponents();
  modal.style.display = 'flex';
}

function closeBundleModal() {
  var m = document.getElementById('bundleModal'); if (m) m.style.display = 'none';
  _bundleComponents = []; _bundleEditId = null;
  /* If we were editing from the list, re-open it (fresh) so the user can continue. */
  if (window._bundleListWasOpen) {
    window._bundleListWasOpen = false;
    if (typeof openBundlesList === 'function') openBundlesList();
  }
}

function generateBundleBarcode() {
  var code = (window.BP && typeof BP.generateUniqueBarcode === 'function')
    ? BP.generateUniqueBarcode(_bundleEditId)
    : DB.generateBarcode();
  document.getElementById('bundleBarcode').value = code;
}

function bundleSearchProducts(q) {
  var box = document.getElementById('bundleSearchResults');
  if (!box) return;
  q = (q || '').trim();
  if (!q) { box.innerHTML = ''; return; }
  var list = DB.getProducts() || [];
  var scored = list.map(function (p) { return { p: p, s: productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin) }; })
    .filter(function (x) { return x.s > 0; })
    .sort(function (a, b) { return b.s - a.s; })
    .slice(0, 12);
  if (!scored.length) { box.innerHTML = '<div style="padding:8px;color:var(--silver-500)">' + t('inventory.noItems') + '</div>'; return; }
  box.innerHTML = scored.map(function (x) {
    var p = x.p;
    return '<div style="padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--silver-100)" onclick="addBundleComponent(\'' + p.id + '\')">' +
      '<strong>' + escHtml(p.name) + '</strong> <span style="color:var(--silver-500);font-size:12px">' + escHtml(p.barcode || '') + ' · ' + t('inventory.availableLabel') + ': ' + (p.quantity || 0) + '</span></div>';
  }).join('');
}

function addBundleComponent(productId) {
  var p = DB.getProduct(productId);
  if (!p) return;
  var avail = parseFloat(p.quantity) || 0;
  var existing = _bundleComponents.find(function (c) { return c.productId === productId; });
  if (existing) {
    var next = (parseFloat(existing.qty) || 0) + 1;
    if (next > avail) {
      alert(t('inventory.qtyExceedsStock') + ': ' + (existing.name || p.name) + ' ' + t('inventory.availableParen') + ' ' + avail + ')');
      return;
    }
    existing.qty = next;
  } else {
    if (avail <= 0) {
      alert(t('inventory.noStockForProduct') + ': ' + p.name);
      return;
    }
    if (1 > avail) {
      alert(t('inventory.qtyExceedsStock') + ': ' + p.name + ' ' + t('inventory.availableParen') + ' ' + avail + ')');
      return;
    }
    _bundleComponents.push({ productId: p.id, name: p.name, qty: 1, buyPrice: p.buyPrice || 0, sellPrice: p.sellPrice || 0 });
  }
  renderBundleComponents();
  _bundleCalcPrice();
  document.getElementById('bundleSearch').value = '';
  document.getElementById('bundleSearchResults').innerHTML = '';
}

function renderBundleComponents() {
  var cont = document.getElementById('bundleComponents');
  if (!cont) return;
  if (!_bundleComponents.length) { cont.innerHTML = '<div style="color:var(--silver-500);font-size:12px">' + t('inventory.noComponentsYet') + '</div>'; return; }
  cont.innerHTML = _bundleComponents.map(function (c, i) {
    var _p = DB.getProduct(c.productId);
    var _avail = _p ? (parseFloat(_p.quantity) || 0) : 0;
    return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--silver-100)">' +
      '<span style="flex:1">' + escHtml(c.name) + ' <span style="font-size:11px;color:var(--silver-500)">' + t('inventory.availableParen') + ' ' + _avail + ')</span></span>' +
      '<input type="number" step="any" min="0.0001" value="' + c.qty + '" style="width:80px" onchange="updateBundleCompQty(' + i + ', this.value)">' +
      '<span style="font-size:12px;color:var(--silver-500)">× sell ' + (c.sellPrice || 0) + '</span>' +
      '<button type="button" class="btn btn-sm" onclick="removeBundleComp(' + i + ')"><i class="fas fa-times"></i></button>' +
      '</div>';
  }).join('');
}

function updateBundleCompQty(i, val) {
  var v = parseFloat(val);
  if (!isFinite(v) || v <= 0) v = 1;
  var comp = _bundleComponents[i];
  if (comp) {
    var p = DB.getProduct(comp.productId);
    var avail = p ? (parseFloat(p.quantity) || 0) : 0;
    if (v > avail) {
      alert(t('inventory.qtyExceedsStock') + ': ' + (comp.name || (p && p.name) || '') + ' ' + t('inventory.availableParen') + ' ' + avail + ')');
      v = avail > 0 ? avail : 1;
      renderBundleComponents();
    }
  }
  _bundleComponents[i].qty = v;
  _bundleCalcPrice();
}

function removeBundleComp(i) {
  _bundleComponents.splice(i, 1);
  renderBundleComponents();
  _bundleCalcPrice();
}

function confirmBundle() {
  var name = (document.getElementById('bundleName').value || '').trim();
  if (!name) {
    var n = (DB.getBundles() || []).length + 1;
    name = t('inventory.bundlePrefix') + ' ' + n;
    document.getElementById('bundleName').value = name;
  }
  if (!_bundleComponents.length) { alert(t('inventory.addAtLeastOne')); return; }
  /* Stock guard: never allow a bundle component qty to exceed available stock (decimals allowed). */
  for (var _ci = 0; _ci < _bundleComponents.length; _ci++) {
    var _cc = _bundleComponents[_ci];
    var _cp = DB.getProduct(_cc.productId);
    var _avail = _cp ? (parseFloat(_cp.quantity) || 0) : 0;
    var _want = parseFloat(_cc.qty) || 0;
    if (_want > _avail) {
      alert(t('inventory.qtyExceedsStock') + ': ' + (_cc.name || (_cp && _cp.name) || '') + ' ' + t('inventory.availableParen') + ' ' + _avail + ')');
      return;
    }
  }
  var barcode = (document.getElementById('bundleBarcode').value || '').trim();
  // Products and bundles are scanned through the same field, so a barcode may
  // belong to exactly one of them. A clash is refused with the owner's name
  // instead of silently printing a label that opens the wrong card.
  var barcodeOwner = (window.BP && typeof BP.barcodeOwner === 'function') ? BP.barcodeOwner : null;
  if (!barcode) {
    barcode = (window.BP && typeof BP.generateUniqueBarcode === 'function')
      ? BP.generateUniqueBarcode(_bundleEditId)
      : DB.generateBarcode();
    document.getElementById('bundleBarcode').value = barcode;
  } else if (barcodeOwner) {
    var owner = barcodeOwner(barcode, _bundleEditId);
    if (owner) {
      alert(owner.kind === 'product'
        ? t('inventory.barcodeUsedProduct') + ': ' + (owner.name || '')
        : t('inventory.barcodeUsedBundle') + ': ' + (owner.name || ''));
      return;
    }
  }
  var priceEl = document.getElementById('bundlePrice');
  var price = parseFloat(priceEl.value);
  if (!isFinite(price) || price < 0) price = _bundleComponents.reduce(function (s, c) { return s + (c.sellPrice || 0) * (c.qty || 0); }, 0);
  priceEl.dataset.auto = '0';
  var payload = {
    name: name, barcode: barcode, price: price,
    components: _bundleComponents.map(function (c) { return { productId: c.productId, qty: c.qty }; })
  };
  if (_bundleEditId) {
    DB.updateBundle(_bundleEditId, payload);
    closeBundleModal(); // also re-opens list if it was open
  } else {
    DB.addBundle(payload);
    closeBundleModal();
  }
  renderBundlesList();
  if (typeof window.invalidateSalesGroupsCache === 'function') window.invalidateSalesGroupsCache();
}

function openBundlesList() {
  _ensureBundleModals();
  var modal = document.getElementById('bundlesListModal');
  if (!modal) return;
  renderBundlesList();
  modal.style.display = 'flex';
}

function closeBundlesList() {
  var m = document.getElementById('bundlesListModal'); if (m) m.style.display = 'none';
}

function renderBundlesList() {
  var body = document.getElementById('bundlesListBody');
  if (!body) return;
  var list = DB.getBundles() || [];
  if (!list.length) { body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--silver-500)">' + t('inventory.noBundles') + '</div>'; return; }
  body.innerHTML = list.map(function (b) {
    var comps = (b.components || []).map(function (c) {
      var p = DB.getProduct(c.productId);
      return (p ? p.name : c.productId) + ' × ' + c.qty;
    }).join(', ');
    return '<div style="border:1px solid var(--silver-300);border-radius:8px;padding:10px;margin-bottom:8px;display:flex;align-items:center;gap:10px">' +
      '<div style="flex:1">' +
        '<div style="font-weight:700">' + escHtml(b.name) + '</div>' +
        '<div style="font-size:12px;color:var(--silver-500)">' + t('inventory.barcodeLabel') + ': ' + escHtml(b.barcode || '-') + ' · ' + t('inventory.priceLabel') + ': DA' + (b.price || 0) + '</div>' +
        '<div style="font-size:12px;color:var(--silver-600)">' + escHtml(comps) + '</div>' +
      '</div>' +
      '<button type="button" class="btn btn-sm" onclick="openBundleBarcodeModal(\'' + b.id + '\')" title="' + t('inventory.printBundleBarcode') + '"><i class="fas fa-barcode"></i></button>' +
      '<button type="button" class="btn btn-sm" onclick="openBundleModal(\'' + b.id + '\')"><i class="fas fa-edit"></i></button>' +
      '<button type="button" class="btn btn-sm" style="background:#dc3545;color:#fff" onclick="deleteBundle(\'' + b.id + '\')"><i class="fas fa-trash"></i></button>' +
      '</div>';
  }).join('');
}

function deleteBundle(id) {
  if (!confirm(t('inventory.deleteBundleConfirm'))) return;
  DB.deleteBundle(id);
  renderBundlesList();
  if (typeof window.invalidateSalesGroupsCache === 'function') window.invalidateSalesGroupsCache();
}

function bundleReservedQty(productId) {
  var bundles = DB.getBundles() || [];
  var maxq = 0;
  for (var i = 0; i < bundles.length; i++) {
    var b = bundles[i];
    var comp = (b.components || []).find(function (c) { return c.productId === productId; });
    if (comp) maxq = Math.max(maxq, parseFloat(comp.qty) || 0);
  }
  return maxq;
}
function _ensureBundleModals() {
  if (!document.getElementById('bundleModal')) {
    var m = document.createElement('div');
    m.id = 'bundleModal';
    m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;align-items:center;justify-content:center';
    m.innerHTML = '<div class="card" style="width:720px;max-width:95vw;max-height:90vh;overflow:auto;padding:18px">' +
      '<h3 style="margin:0 0 12px"><i class="fas fa-gift"></i> <span id="bundleModalTitle">' + t('inventory.bundleAddTitle') + '</span></h3>' +
      '<input type="hidden" id="bundleEditId">' +
      '<div class="form-group"><label>' + t('inventory.bundleNameLabel') + '</label><input class="form-input" id="bundleName" placeholder="' + t('inventory.bundleNamePh') + '"></div>' +
      '<div class="form-group"><label>' + t('inventory.barcodeLabel') + '</label><div style="display:flex;gap:6px"><input class="form-input" id="bundleBarcode" dir="ltr"><button type="button" class="btn btn-sm" onclick="generateBundleBarcode()">' + t('common.generate') + '</button></div></div>' +
      '<div class="form-group"><label>' + t('inventory.searchProductLabel') + '</label><input class="form-input" id="bundleSearch" placeholder="' + t('inventory.searchProductPh') + '" oninput="bundleSearchProducts(this.value)"><div id="bundleSearchResults" style="max-height:200px;overflow:auto;border:1px solid var(--silver-300);border-radius:8px;margin-top:4px"></div></div>' +
      '<div class="form-group"><label>' + t('inventory.componentsLabel') + '</label><div id="bundleComponents" style="border:1px solid var(--silver-300);border-radius:8px;padding:8px;min-height:60px"></div></div>' +
      '<div class="form-group"><label>' + t('inventory.bundlePriceLabel') + '</label><input class="form-input" id="bundlePrice" type="number" step="any" min="0"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn" onclick="closeBundleModal()">' + t('common.cancel') + '</button><button type="button" class="btn btn-primary" onclick="confirmBundle()">' + t('common.save') + '</button></div>' +
      '</div>';
    document.body.appendChild(m);
  }
  if (!document.getElementById('bundlesListModal')) {
    var m2 = document.createElement('div');
    m2.id = 'bundlesListModal';
    m2.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center';
    m2.innerHTML = '<div class="card" style="width:760px;max-width:95vw;max-height:90vh;overflow:auto;padding:18px"><h3 style="margin:0 0 12px"><i class="fas fa-gift"></i> ' + t('inventory.bundlesTitle') + '</h3><div id="bundlesListBody" style="min-height:60px"></div><div style="display:flex;justify-content:flex-end;margin-top:12px"><button type="button" class="btn" onclick="closeBundlesList()">' + t('common.close') + '</button></div></div>';
    document.body.appendChild(m2);
  }
}
