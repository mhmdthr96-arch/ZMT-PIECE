// ============================================================================
// ZMT PIECE — مزامنة الميزان (scale sync) UI
// ============================================================================
// Opens from the «مزامنة الميزان» button on the inventory page. It reads the
// product list, builds the article text through ScaleSyncCore, and sends it to
// the scale over a file, a COM port or the network — using the main-process
// link in scale-net.js (exposed as window.electronAPI.scaleSync*).
//
// The dialog is manager-only. The decode side (scale-core.js) is untouched;
// only the article list that the machine must know is being written here.
// ============================================================================
(function (root) {
  'use strict';

  var MODAL_ID = 'scaleSyncModal';
  var _cfg = null;
  var _ports = [];
  var _incremental = false;
  var _printCode = '';
  var _status = { msg: '', bad: false };
  var _saving = false;

  function tr(key, fallback) { try { if (typeof root.t === 'function') { var v = root.t(key); if (v) return v; } } catch (e) {} return fallback || key; }
  function esc(s) { if (typeof root.escHtml === 'function') return root.escHtml(s == null ? '' : String(s)); return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function el(id) { try { return root.document ? root.document.getElementById(id) : null; } catch (e) { return null; } }
  function notify(msg) { try { root.alert(msg); } catch (e) {} }
  function confirmMsg(msg) { try { if (typeof root.confirm === 'function') return !!root.confirm(msg); } catch (e) {} return true; }

  function core() { return root.ScaleSyncCore || null; }
  function db() { try { if (typeof DB !== 'undefined' && DB) return DB; } catch (e) {} return root.DB || null; }
  function products() { var d = db(); if (!d || typeof d.getProducts !== 'function') return []; return d.getProducts() || []; }
  function getMeta(key) { var d = db(); try { if (d && typeof d.getMeta === 'function') return d.getMeta(key); } catch (e) {} return null; }
  function setMeta(key, val) { var d = db(); try { if (d && typeof d.setMeta === 'function') d.setMeta(key, val); } catch (e) {} }

  function allowed() {
    try { if (root.Auth && typeof root.Auth.isManager === 'function') return !!root.Auth.isManager(); } catch (e) {}
    return true;
  }

  function ea() { return root.electronAPI || null; }

  async function loadCfg() {
    var raw = null;
    var api = ea();
    if (api && typeof api.scaleSyncGet === 'function') {
      try { var r = await api.scaleSyncGet(); if (r && r.success) raw = r.data; } catch (e) { raw = null; }
    }
    if (!raw) raw = getMeta('scale_sync_cfg');
    var C = core();
    _cfg = C ? C.normalizeConfig(raw) : (raw || {});
  }

  async function saveCfg() {
    syncFromForm();
    var C = core();
    if (C) _cfg = C.normalizeConfig(_cfg);
    var api = ea();
    if (api && typeof api.scaleSyncSave === 'function') {
      try { await api.scaleSyncSave(_cfg); } catch (e) {}
    }
    setMeta('scale_sync_cfg', _cfg);
  }

  function syncFromForm() {
    if (!_cfg) _cfg = {};
    var overlay = el(MODAL_ID);
    if (!overlay) return;
    var get = (name) => overlay.querySelector('[data-ss="' + name + '"]');
    var val = (name) => { var e = get(name); return e ? e.value : ''; };
    var chk = (name) => { var e = get(name); return !!(e && e.checked); };
    var num = (name, dflt) => { var v = val(name); if (String(v).trim() === '') return dflt; var n = Number(v); return isFinite(n) ? n : dflt; };
    _cfg.profileId = val('profile');
    _cfg.transport = val('transport');
    _cfg.comPort = val('comPortManual') || val('comPort');
    _cfg.baudRate = num('baudRate', 9600);
    _cfg.host = val('host');
    _cfg.port = num('port', 9100);
    _cfg.selection = _cfg.selection || {};
    _cfg.selection.onlyWithPlu = chk('onlyWithPlu');
    _cfg.selection.onlyWeighed = chk('onlyWeighed');
    _cfg.selection.brandId = val('brandId');
    _incremental = chk('incremental');
    _cfg.override = _cfg.override || {};
    _cfg.override.pluWidth = num('pluWidth', 0) || _cfg.override.pluWidth;
    _cfg.override.priceDecimals = num('priceDecimals', -1);
    if (_cfg.override.priceDecimals < 0) delete _cfg.override.priceDecimals;
    _cfg.override.nameMax = num('nameMax', 0) || _cfg.override.nameMax;
    _cfg.override.nameMode = val('nameMode');
    _cfg.override.delimiter = val('delimiter');
    _cfg.override.encoding = val('encoding');
    _cfg.override.lineEnding = val('lineEnding');
  }

  function setStatus(msg, bad) {
    _status = { msg: msg || '', bad: !!bad };
    var box = el('ssStatus');
    if (box) {
      box.textContent = _status.msg;
      box.style.color = _status.bad ? '#dc3545' : '#28a745';
    }
  }

  // ---------- modal shell ---------------------------------------------------

  function modalHTML() {
    var C = core();
    var profiles = (C && C.PROFILES) ? C.PROFILES : [];
    var profileOpts = profiles.map(p =>
      `<option value="${esc(p.id)}">${esc(tr(p.key, p.id))}</option>`).join('');
    var transportOpts = ['file','com','raw-com','net'].map(t =>
      `<option value="${t}">${esc(tr('scaleSync.transport.' + t, t))}</option>`).join('');
    var encOpts = ['utf8','latin1'].map(e =>
      `<option value="${e}">${e}</option>`).join('');
    var leOpts = ['crlf','lf'].map(e =>
      `<option value="${e}">${e}</option>`).join('');
    var nmOpts = ['raw','latin'].map(e =>
      `<option value="${e}">${esc(tr('scaleSync.nameMode' + (e === 'latin' ? 'Latin' : 'Raw'), e))}</option>`).join('');
    return '' +
      '<div class="modal" style="max-width:980px;width:96%">' +
        '<div class="modal-header">' +
          '<h3><i class="fas fa-cloud-upload-alt"></i> <span data-i18n="scaleSync.title">مزامنة الميزان (تنزيل قائمة الأصناف)</span></h3>' +
          '<button class="modal-close" type="button" onclick="ScaleSync.close()">&times;</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<p class="sc-sub" data-i18n="scaleSync.sub">أرسل قائمة الأصناف (PLU + اسم + سعر) إلى الميزان لكي يطبع اللاصقات. المبلغ المطبوع على اللاصقة هو المرجع عند البيع.</p>' +
          '<div class="ss-grid">' +
            '<div class="ss-card">' +
              '<label class="ss-label" data-i18n="scaleSync.profile">ملف تعريف الميزان</label>' +
              `<select class="form-input" data-ss="profile">${profileOpts}</select>` +
              '<label class="ss-label" data-i18n="scaleSync.transport">طريقة الربط</label>' +
              `<select class="form-input" data-ss="transport">${transportOpts}</select>` +
              '<div data-ss="deviceFields"></div>' +
            '</div>' +
            '<div class="ss-card">' +
              '<label class="ss-label" data-i18n="scaleSync.selection">اختيار الأصناف</label>' +
              '<label class="ss-check"><input type="checkbox" data-ss="onlyWithPlu"> <span data-i18n="scaleSync.onlyWithPlu">أصناف لها PLU فقط</span></label>' +
              '<label class="ss-check"><input type="checkbox" data-ss="onlyWeighed"> <span data-i18n="scaleSync.onlyWeighed">الأصناف الموزونة (غير محدود) فقط</span></label>' +
              '<label class="ss-label" data-i18n="scaleSync.brandId">الماركة (اختياري)</label>' +
              '<input type="text" class="form-input" data-ss="brandId" placeholder="brand id">' +
              '<div class="ss-summary">' +
                '<span><i class="fas fa-list-ol"></i> <span data-i18n="scaleSync.count">عدد الأصناف</span>: <b data-ss="count">0</b></span>' +
                '<span><i class="fas fa-exclamation-triangle"></i> <span data-i18n="scaleSync.stale">أصناف تغيّر سعرها</span>: <b data-ss="stale">0</b></span>' +
                '<span><i class="fas fa-minus-circle"></i> <span data-i18n="scaleSync.removed">أصناف مُزالَة</span>: <b data-ss="removed">0</b></span>' +
              '</div>' +
              '<label class="ss-check"><input type="checkbox" data-ss="incremental"> <span data-i18n="scaleSync.incremental">إرسال المتغيّر فقط (تزايد)</span></label>' +
            '</div>' +
            '<div class="ss-card" style="grid-column:1/-1">' +
              '<label class="ss-label" data-i18n="scaleSync.articles">الأصناف المختارة (اسم ميزان + قسم)</label>' +
              '<div class="ss-articles-wrap"><table class="data-table ss-articles"><thead><tr>' +
                '<th data-i18n="scaleSync.colPlu">PLU</th>' +
                '<th data-i18n="scaleSync.colName">اسم (ميزان)</th>' +
                '<th data-i18n="scaleSync.colDept">قسم</th>' +
                '<th data-i18n="scaleSync.colPrice">سعر</th>' +
                '<th></th>' +
              '</tr></thead><tbody data-ss="articles"></tbody></table></div>' +
              '<button class="btn btn-sm" type="button" onclick="ScaleSync.saveArticles()" style="margin-top:8px"><i class="fas fa-save"></i> <span data-i18n="scaleSync.saveArticles">حفظ الأصناف</span></button>' +
            '</div>' +
          '</div>' +
          '<details class="ss-advanced" open>' +
            '<summary data-i18n="scaleSync.advanced">متقدّم</summary>' +
            '<div class="ss-adv-grid">' +
              '<label class="ss-label" data-i18n="scaleSync.pluWidth">عرض PLU</label>' +
              '<input type="number" class="form-input" data-ss="pluWidth" min="1" max="8">' +
              '<label class="ss-label" data-i18n="scaleSync.priceDecimals">منازل سعر البيع</label>' +
              '<input type="number" class="form-input" data-ss="priceDecimals" min="0" max="4">' +
              '<label class="ss-label" data-i18n="scaleSync.nameMax">أقصى طول للاسم</label>' +
              '<input type="number" class="form-input" data-ss="nameMax" min="1" max="40">' +
              '<label class="ss-label" data-i18n="scaleSync.nameMode">وضع الاسم</label>' +
              `<select class="form-input" data-ss="nameMode">${nmOpts}</select>` +
              '<label class="ss-label" data-i18n="scaleSync.delimiter">الفاصل (CSV)</label>' +
              '<input type="text" class="form-input" data-ss="delimiter" maxlength="3">' +
              '<label class="ss-label" data-i18n="scaleSync.encoding">الترميز</label>' +
              `<select class="form-input" data-ss="encoding">${encOpts}</select>` +
              '<label class="ss-label" data-i18n="scaleSync.lineEnding">نهاية السطر</label>' +
              `<select class="form-input" data-ss="lineEnding">${leOpts}</select>` +
            '</div>' +
          '</details>' +
          '<div class="ss-warns" data-ss="warns"></div>' +
          '<div class="ss-preview-wrap">' +
            '<div class="ss-preview-title" data-i18n="scaleSync.preview">معاينة الملف</div>' +
            '<pre class="ss-preview" data-ss="preview"></pre>' +
          '</div>' +
          '<details class="ss-advanced">' +
            '<summary data-i18n="scaleSync.printLabel">طباعة لاصقة ميزان (بديل)</summary>' +
            '<div class="ss-print-row">' +
              '<label class="ss-label" data-i18n="scaleSync.printArticle">الصنف</label>' +
              '<select class="form-input" data-ss="printArticle"></select>' +
              '<label class="ss-label" data-i18n="scaleSync.printWeight">الوزن</label>' +
              '<input type="number" step="0.001" class="form-input" data-ss="printWeight" value="1">' +
              '<button class="btn" type="button" onclick="ScaleSync.generatePrintCode()"><i class="fas fa-barcode"></i> <span data-i18n="scaleSync.genCode">توليد الكود</span></button>' +
              '<button class="btn btn-primary" type="button" onclick="ScaleSync.printScaleLabel()"><i class="fas fa-print"></i> <span data-i18n="scaleSync.printNow">طباعة</span></button>' +
            '</div>' +
            '<div class="ss-print-code" data-ss="printCode"></div>' +
          '</details>' +
          '<div id="ssStatus" class="ss-status"></div>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn" type="button" onclick="ScaleSync.scanPorts()"><i class="fas fa-search"></i> <span data-i18n="scaleSync.scanPorts">مسح المنافذ</span></button>' +
          '<button class="btn" type="button" onclick="ScaleSync.refreshPreview()"><i class="fas fa-eye"></i> <span data-i18n="scaleSync.preview">معاينة</span></button>' +
          '<button class="btn" type="button" onclick="ScaleSync.close()"><span data-i18n="common.cancel">إلغاء</span></button>' +
          '<button class="btn" type="button" onclick="ScaleSync.exportFile()"><i class="fas fa-file-download"></i> <span data-i18n="scaleSync.exportFile">تصدير ملف</span></button>' +
          '<button class="btn btn-primary" type="button" onclick="ScaleSync.sendToDevice()"><i class="fas fa-paper-plane"></i> <span data-i18n="scaleSync.send">إرسال إلى الميزان</span></button>' +
        '</div>' +
      '</div>';
  }

  function ensureModal() {
    var doc = root.document;
    if (!doc) return null;
    var modal = doc.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = doc.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = MODAL_ID;
    modal.style.display = 'none';
    modal.style.zIndex = '99992';
    modal.innerHTML = modalHTML();
    doc.body.appendChild(modal);
    modal.addEventListener('mousedown', function (e) { if (e.target === modal) close(); });
    // transport change re-renders device fields
    var tr = modal.querySelector('[data-ss="transport"]');
    if (tr) tr.addEventListener('change', function () { renderDeviceFields(); });
    var prof = modal.querySelector('[data-ss="profile"]');
    if (prof) prof.addEventListener('change', function () { syncFromForm(); render(); });
    // advanced inputs refresh preview on change
    modal.addEventListener('input', function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-ss')) {
        syncFromForm();
        // debounced preview
        if (_previewTimer) clearTimeout(_previewTimer);
        _previewTimer = setTimeout(refreshPreview, 250);
      }
    });
    if (typeof root.applyTranslation === 'function') {
      try { root.applyTranslation(modal); } catch (e) {}
    }
    return modal;
  }

  var _previewTimer = null;

  function renderDeviceFields() {
    var overlay = el(MODAL_ID);
    if (!overlay) return;
    var box = overlay.querySelector('[data-ss="deviceFields"]');
    if (!box) return;
    syncFromForm();
    var t = _cfg.transport;
    var html = '';
    if (t === 'com' || t === 'raw-com') {
      html += '<label class="ss-label" data-i18n="scaleSync.comPort">منفذ COM</label>';
      html += '<select class="form-input" data-ss="comPort">' +
        (_ports.length ? _ports.map(p => `<option value="${esc(p.port)}">${esc(p.label)}</option>`).join('') : `<option value="${esc(_cfg.comPort)}">${esc(_cfg.comPort || '—')}</option>`) +
        '</select>';
      html += '<input type="text" class="form-input" data-ss="comPortManual" placeholder="COM3" value="' + esc(_cfg.comPort || '') + '" style="margin-top:6px" title="' + esc(tr('scaleSync.comPortManual', 'أو اكتب المنفذ يدوياً (COM3)')) + '">';
      if (_ports.length) {
        html += '<div class="ss-port-chips">' + _ports.map(p =>
          '<button type="button" class="ss-chip" onclick="ScaleSync.pickPort(\'' + esc(p.port) + '\')">' + esc(p.label) + '</button>'
        ).join('') + '</div>';
      } else {
        html += '<p class="ms-hint" style="margin-top:6px">' + esc(tr('scaleSync.noPortsFound', 'لم يُعثر على منافذ تلقائياً. اكتب المنفذ يدوياً (COM3) أو جرّب «شبكة (IP)» إن كان الميزان يمتلك عنوان IP.')) + '</p>';
      }
      html += '<label class="ss-label" data-i18n="scaleSync.baudRate">سرعة البود</label>';
      html += `<input type="number" class="form-input" data-ss="baudRate" value="${esc(_cfg.baudRate)}">`;
    } else if (t === 'net') {
      html += '<label class="ss-label" data-i18n="scaleSync.host">عنوان IP</label>';
      html += `<input type="text" class="form-input" data-ss="host" value="${esc(_cfg.host)}" dir="ltr">`;
      html += '<label class="ss-label" data-i18n="scaleSync.port">المنفذ</label>';
      html += `<input type="number" class="form-input" data-ss="port" value="${esc(_cfg.port)}">`;
    } else {
      html += '<p class="ms-hint" style="margin-top:8px">' + esc(tr('scaleSync.fileHint', 'سيتم حفظ ملف نصي (CSV/TXT) على القرص، ثم حمّله إلى الميزان عبر USB أو بطاقة ذاكرة.')) + '</p>';
    }
    box.innerHTML = html;
    // restore selected comPort
    var sel = box.querySelector('[data-ss="comPort"]');
    if (sel && _cfg.comPort) sel.value = _cfg.comPort;
  }

  function render() {
    var overlay = el(MODAL_ID);
    if (!overlay || !_cfg) return;
    syncFromForm();
    var C = core();
    if (C) _cfg = C.normalizeConfig(_cfg);
    // profile select
    var profSel = overlay.querySelector('[data-ss="profile"]');
    if (profSel) profSel.value = _cfg.profileId;
    var trSel = overlay.querySelector('[data-ss="transport"]');
    if (trSel) trSel.value = _cfg.transport;
    // checkboxes
    var ow = overlay.querySelector('[data-ss="onlyWithPlu"]');
    if (ow) ow.checked = !!((_cfg.selection || {}).onlyWithPlu !== false);
    var owg = overlay.querySelector('[data-ss="onlyWeighed"]');
    if (owg) owg.checked = !!((_cfg.selection || {}).onlyWeighed);
    var brand = overlay.querySelector('[data-ss="brandId"]');
    if (brand) brand.value = (_cfg.selection || {}).brandId || '';
    // advanced
    var prof = C ? C.effectiveProfile(_cfg) : null;
    var setNum = (name, v) => { var e = overlay.querySelector('[data-ss="' + name + '"]'); if (e) e.value = (v == null ? '' : v); };
    setNum('pluWidth', (prof ? prof.pluWidth : '') );
    setNum('priceDecimals', (prof ? prof.priceDecimals : '') );
    setNum('nameMax', (prof ? prof.nameMax : '') );
    var nm = overlay.querySelector('[data-ss="nameMode"]');
    if (nm && prof) nm.value = prof.nameMode;
    var del = overlay.querySelector('[data-ss="delimiter"]');
    if (del && prof) del.value = prof.delimiter || '';
    var enc = overlay.querySelector('[data-ss="encoding"]');
    if (enc && prof) enc.value = prof.encoding || 'utf8';
    var le = overlay.querySelector('[data-ss="lineEnding"]');
    if (le && prof) le.value = prof.lineEnding || 'crlf';
    // baud
    var baud = overlay.querySelector('[data-ss="baudRate"]');
    if (baud) baud.value = _cfg.baudRate;
    var host = overlay.querySelector('[data-ss="host"]');
    if (host) host.value = _cfg.host;
    var port = overlay.querySelector('[data-ss="port"]');
    if (port) port.value = _cfg.port;
    var cp = overlay.querySelector('[data-ss="comPort"]');
    if (cp) cp.value = _cfg.comPort;

    renderDeviceFields();

    // summary + warnings
    var prods = products();
    var articles = C ? C.buildArticles(prods, _cfg) : [];
    var countEl = overlay.querySelector('[data-ss="count"]');
    if (countEl) countEl.textContent = articles.length;
    var staleEl = overlay.querySelector('[data-ss="stale"]');
    if (staleEl) staleEl.textContent = C ? C.diffStale(prods, _cfg).length : 0;
    var removedEl = overlay.querySelector('[data-ss="removed"]');
    if (removedEl) {
      var diff = C ? C.articleDiff(prods, _cfg) : { removed: [] };
      removedEl.textContent = diff.removed.length;
    }
    var incCb = overlay.querySelector('[data-ss="incremental"]');
    if (incCb) incCb.checked = _incremental;

    // articles table (editable scaleName / scaleDept)
    var tbody = overlay.querySelector('[data-ss="articles"]');
    if (tbody) {
      tbody.innerHTML = articles.map(a => {
        const p = prods.find(x => x.id === a.id) || {};
        return '<tr data-art="' + esc(a.id) + '">' +
          '<td dir="ltr">' + esc(a.plu) + '</td>' +
          '<td><input type="text" class="form-input ss-in" data-field="scaleName" data-id="' + esc(a.id) + '" value="' + esc(p.scaleName || '') + '" placeholder="' + esc(p.name || '') + '"></td>' +
          '<td><input type="text" class="form-input ss-in ss-in-sm" data-field="scaleDept" data-id="' + esc(a.id) + '" value="' + esc(p.scaleDept || '') + '"></td>' +
          '<td dir="ltr">' + esc(a.price) + '</td>' +
          '<td><button class="btn btn-sm" type="button" onclick="ScaleSync.printArticle(\'' + esc(a.id) + '\')"><i class="fas fa-print"></i></button></td>' +
        '</tr>';
      }).join('') || '<tr><td colspan="5" class="empty-row">' + esc(tr('scaleSync.noProducts','لا توجد أصناف مختارة')) + '</td></tr>';
    }

    // print dropdown
    var printSel = overlay.querySelector('[data-ss="printArticle"]');
    if (printSel) {
      const prev = printSel.value;
      printSel.innerHTML = articles.map(a => {
        const p = prods.find(x => x.id === a.id) || {};
        return '<option value="' + esc(a.id) + '">' + esc(p.name || a.id) + ' (' + esc(a.plu) + ')</option>';
      }).join('') || '<option value="">' + esc(tr('scaleSync.noProducts','—')) + '</option>';
      if (prev) printSel.value = prev;
    }

    var warnsBox = overlay.querySelector('[data-ss="warns"]');
    if (warnsBox) {
      var warns = [];
      var decodeCfg = null;
      try { if (typeof scaleConfig === 'function') decodeCfg = scaleConfig(); } catch (e) {}
      if (C && decodeCfg) warns = C.checkConsistency(decodeCfg, _cfg);
      warnsBox.innerHTML = warns.map(w => `<div class="ss-warn"><i class="fas fa-exclamation-triangle"></i> ${esc(tr(w, w))}</div>`).join('');
    }
    refreshPreview();
    if (_status.msg) setStatus(_status.msg, _status.bad);
  }

  function refreshPreview() {
    var overlay = el(MODAL_ID);
    if (!overlay || !_cfg) return;
    syncFromForm();
    var C = core();
    if (C) _cfg = C.normalizeConfig(_cfg);
    var prods = products();
    var text = C ? C.buildText(prods, _cfg) : '';
    var lines = C ? C.previewLines(text, 24) : String(text).split(/\n/).slice(0,24);
    var pre = overlay.querySelector('[data-ss="preview"]');
    if (pre) pre.textContent = lines.join('\n') + (lines.length ? '\n…' : '');
  }

  async function open() {
    if (!allowed()) { notify(tr('scaleSync.noPermission', 'لا تملك صلاحية المزامنة — للمدير فقط.')); return; }
    var modal = ensureModal();
    if (!modal) return;
    await loadCfg();
    modal.style.display = 'flex';
    render();
    // scan ports in background
    scanPorts(true);
  }

  function close() {
    var modal = el(MODAL_ID);
    if (modal) modal.style.display = 'none';
    saveCfg();
  }

  async function scanPorts(silent) {
    var api = ea();
    if (!api || typeof api.scaleSyncScan !== 'function') { if (!silent) setStatus(tr('scaleSync.noHardware', 'غير متاح في هذا الإصدار.'), true); return; }
    var r = await api.scaleSyncScan();
    if (r && r.success) {
      _ports = (r.data && r.data.ports) ? r.data.ports : [];
      syncFromForm();
      if (_ports.length && !_cfg.comPort) _cfg.comPort = _ports[0].port;
      if (_cfg.transport === 'file' || !_cfg.transport) {
        _cfg.transport = 'com';
        var trSel = el(MODAL_ID) ? el(MODAL_ID).querySelector('[data-ss="transport"]') : null;
        if (trSel) trSel.value = 'com';
      }
      renderDeviceFields();
      var cpSel = el(MODAL_ID) ? el(MODAL_ID).querySelector('[data-ss="comPort"]') : null;
      if (cpSel && _cfg.comPort) cpSel.value = _cfg.comPort;
      if (!silent) setStatus(tr('scaleSync.scanned', 'تم مسح ' + _ports.length + ' منفذ.'), false);
    } else {
      if (!silent) setStatus((r && (r.errorAr || r.error)) || 'scan failed', true);
    }
  }

  async function exportFile() {
    if (!allowed()) { notify(tr('scaleSync.noPermission', 'لا تملك صلاحية المزامنة — للمدير فقط.')); return; }
    syncFromForm();
    var C = core();
    if (C) _cfg = C.normalizeConfig(_cfg);
    var prods = products();
    var diff = C ? C.articleDiff(prods, _cfg) : { selected: prods, added: [], changed: [], removed: [], unchanged: [] };
    var toSendProds = _incremental ? diff.added.concat(diff.changed) : diff.selected;
    var articles = C ? C.buildArticles(toSendProds, _cfg) : [];
    if (!articles.length) { setStatus(tr('scaleSync.noProducts', 'لا توجد أصناف مختارة.'), true); return; }
    var text = C ? C.buildText(toSendProds, _cfg) : '';
    var profile = C ? C.effectiveProfile(_cfg) : { format: 'csv' };
    var ext = profile.format === 'fixed' ? 'txt' : 'csv';
    var fileName = 'scale-plu.' + ext;
    var path = null;
    var api = ea();
    if (api && typeof api.saveFile === 'function') {
      var r = await api.saveFile({ defaultPath: fileName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
      if (r && !r.canceled && r.filePath) path = r.filePath;
    } else {
      try {
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
        path = 'downloaded';
      } catch (e) { path = null; }
    }
    if (!path) { setStatus(tr('common.cancel', 'إلغاء'), false); return; }
    if (api && typeof api.writeFile === 'function' && path !== 'downloaded') {
      var w = await api.writeFile(path, text);
      if (!w || !w.success) { setStatus((w && w.error) || 'write failed', true); return; }
    }
    // record last sync
    var fullSelected = C ? C.selectProducts(prods, _cfg) : prods;
    _cfg.lastSync = { at: Date.now(), count: fullSelected.length, sent: articles.length, hash: (C ? C.contentHash(text) : ''), prices: (C ? C.priceSnapshot(prods, _cfg) : {}), pluList: fullSelected.map(p => (C ? C.pluKey(p.plu) : String(p.plu || ''))) };
    await saveCfg();
    setStatus(tr('scaleSync.exported', 'تم تصدير {n} صنف.').replace('{n}', String(articles.length)), false);
    render();
  }

  async function sendToDevice() {
    if (!allowed()) { notify(tr('scaleSync.noPermission', 'لا تملك صلاحية المزامنة — للمدير فقط.')); return; }
    syncFromForm();
    var C = core();
    if (C) _cfg = C.normalizeConfig(_cfg);
    var prods = products();
    var diff = C ? C.articleDiff(prods, _cfg) : { selected: prods, added: [], changed: [], removed: [], unchanged: [] };
    var toSendProds = _incremental ? diff.added.concat(diff.changed) : diff.selected;
    var articles = C ? C.buildArticles(toSendProds, _cfg) : [];
    if (!articles.length) { setStatus(tr('scaleSync.noProducts', 'لا توجد أصناف مختارة.'), true); return; }
    var text = C ? C.buildText(toSendProds, _cfg) : '';
    var profile = C ? C.effectiveProfile(_cfg) : { encoding: 'utf8' };
    var api = ea();
    if (!api || typeof api.scaleSyncSend !== 'function') { setStatus(tr('scaleSync.noHardware', 'غير متاح في هذا الإصدار.'), true); return; }
    setStatus(tr('common.loading', 'جاري…'), false);
    var r = await api.scaleSyncSend({ cfg: _cfg, text: text, encoding: profile.encoding });
    if (r && r.success) {
      var fullSelected = C ? C.selectProducts(prods, _cfg) : prods;
    _cfg.lastSync = { at: Date.now(), count: fullSelected.length, sent: articles.length, hash: (C ? C.contentHash(text) : ''), prices: (C ? C.priceSnapshot(prods, _cfg) : {}), pluList: fullSelected.map(p => (C ? C.pluKey(p.plu) : String(p.plu || ''))) };
      await saveCfg();
      setStatus(tr('scaleSync.sent', 'تم إرسال {n} بايت إلى الميزان.').replace('{n}', String(r.byteCount || (r.data && r.data.sent) || 0)), false);
      render();
    } else {
      setStatus((r && (r.errorAr || r.error)) || 'send failed', true);
    }
  }

  async function saveArticles() {
    if (!allowed()) { notify(tr('scaleSync.noPermission', 'لا تملك صلاحية المزامنة — للمدير فقط.')); return; }
    var overlay = el(MODAL_ID);
    if (!overlay) return;
    var d = db();
    if (!d || typeof d.updateProduct !== 'function') { setStatus('DB unavailable', true); return; }
    var inputs = overlay.querySelectorAll('[data-field]');
    var byId = {};
    inputs.forEach(inp => {
      var id = inp.getAttribute('data-id');
      var field = inp.getAttribute('data-field');
      if (!byId[id]) byId[id] = {};
      byId[id][field] = inp.value;
    });
    var n = 0;
    for (var id in byId) {
      if (!Object.prototype.hasOwnProperty.call(byId, id)) continue;
      var changes = {};
      if (byId[id].scaleName !== undefined) changes.scaleName = String(byId[id].scaleName || '').trim();
      if (byId[id].scaleDept !== undefined) changes.scaleDept = String(byId[id].scaleDept || '').trim();
      if (Object.keys(changes).length) { d.updateProduct(id, changes); n++; }
    }
    setStatus(tr('scaleSync.savedArticles', 'تم حفظ {n} صنف.').replace('{n}', String(n)), false);
    render();
  }

  function printArticle(id) {
    var sel = el(MODAL_ID) ? el(MODAL_ID).querySelector('[data-ss="printArticle"]') : null;
    if (sel && id) sel.value = id;
    setStatus(tr('scaleSync.printReady', 'أدخل الوزن ثم اضغط «توليد الكود».'), false);
  }

  function generatePrintCode() {
    var overlay = el(MODAL_ID);
    if (!overlay) return;
    var sel = overlay.querySelector('[data-ss="printArticle"]');
    var id = sel ? sel.value : '';
    var wIn = overlay.querySelector('[data-ss="printWeight"]');
    var weight = wIn ? Number(wIn.value) : 1;
    if (!isFinite(weight) || weight <= 0) weight = 1;
    var C = core();
    if (!C) { setStatus('ScaleSyncCore missing', true); return; }
    var prods = products();
    var p = prods.find(x => x.id === id);
    if (!p) { setStatus(tr('scaleSync.noProducts', 'لا توجد أصناف مختارة.'), true); return; }
    var decodeCfg = null;
    try { if (typeof scaleConfig === 'function') decodeCfg = scaleConfig(); } catch (e) {}
    var code = C.generateScaleCode(decodeCfg, p.plu, weight);
    if (!code) { setStatus(tr('scaleSync.noPatternForPrint', 'لا يوجد نمط قراءة (PLU+وزن) مفعّل — أضفه في «إعدادات الميزان».'), true); return; }
    _printCode = code;
    var box = overlay.querySelector('[data-ss="printCode"]');
    if (box) box.textContent = code + '  (PLU ' + (p.plu || '') + ', ' + weight + ')';
    setStatus(tr('scaleSync.codeGenerated', 'تم توليد الكود.'), false);
  }

  function printScaleLabel() {
    if (!_printCode) { generatePrintCode(); if (!_printCode) return; }
    var overlay = el(MODAL_ID);
    var sel = overlay ? overlay.querySelector('[data-ss="printArticle"]') : null;
    var id = sel ? sel.value : '';
    var prods = products();
    var p = prods.find(x => x.id === id) || {};
    var wIn = overlay ? overlay.querySelector('[data-ss="printWeight"]') : null;
    var weight = wIn ? Number(wIn.value) : 1;
    var code = _printCode;
    var info = (typeof root.getPrintInfo === 'function') ? root.getPrintInfo() : {};
    var shop = (info && info.name) ? info.name : '';
    // Render the barcode in THIS window (JsBarcode is already loaded here) and
    // embed the resulting SVG, so the print window needs no external script.
    var svgMarkup = '';
    try {
      if (typeof root.JsBarcode === 'function') {
        var svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        var fmt = code.length === 13 ? 'EAN13' : (code.length === 8 ? 'EAN8' : 'CODE128');
        root.JsBarcode(svgEl, code, { format: fmt, width: 2, height: 60, displayValue: false });
        svgMarkup = svgEl.outerHTML;
      }
    } catch (e) { svgMarkup = ''; }
    if (!svgMarkup) svgMarkup = '<div style="font-family:monospace;direction:ltr">' + esc(code) + '</div>';
    var win = null;
    try { win = root.open('', '_blank', 'width=420,height=320'); } catch (e) { win = null; }
    if (!win) { notify(tr('invoices.allowPopups', 'الرجاء السماح بالنوافذ المنبثقة')); return; }
    var html = '<div style="padding:10px;font-family:Arial,sans-serif;text-align:center">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:4px">' + esc(p.name || '') + '</div>' +
      (shop ? '<div style="font-size:10px;color:#666;margin-bottom:6px">' + esc(shop) + '</div>' : '') +
      svgMarkup +
      '<div style="font-size:11px;margin-top:4px;direction:ltr">' + esc(code) + '</div>' +
      '<div style="font-size:11px;margin-top:2px">' + esc(tr('scaleSync.printWeight','الوزن')) + ': ' + esc(String(weight)) + '  ·  ' + esc(String(p.sellPrice || '')) + '</div>' +
      '</div>';
    win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>label</title></head><body>' + html + '<script>window.print();window.close();<\\/script></body></html>');
    win.document.close();
  }

  function pickPort(port) {
    _cfg.comPort = port;
    var cpSel = el(MODAL_ID) ? el(MODAL_ID).querySelector('[data-ss="comPort"]') : null;
    if (cpSel) cpSel.value = port;
    syncFromForm();
    renderDeviceFields();
    setStatus(tr('scaleSync.portPicked', 'تم اختيار المنفذ: ') + port, false);
  }

  root.ScaleSync = {
    open: open,
    close: close,
    render: render,
    refreshPreview: refreshPreview,
    scanPorts: scanPorts,
    pickPort: pickPort,
    exportFile: exportFile,
    sendToDevice: sendToDevice,
    saveArticles: saveArticles,
    printArticle: printArticle,
    generatePrintCode: generatePrintCode,
    printScaleLabel: printScaleLabel,
    // pure-ish helpers exposed for convenience
    loadCfg: loadCfg,
  };
})(window);
