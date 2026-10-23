/* ============================================================
   ZMT PIECE — Quick Entry (F1)  [FULL PAGE]
   Fast purchase-invoice entry opened as a full page (not a modal).
    ONE flat row per product:
      product · qty · buy · sell · wholesale · brand · reference ·
      barcode · country · mark · storage
   The program auto-detects EXISTING (matched by name/barcode →
   details auto-filled & locked) vs NEW (details editable).
   Opens with F1 from invoices / inventory / brands pages.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- i18n (ar / en / fr / zh) ---------- */
  var QE_I18N = {
    ar: {
      title: 'الإدخال السريع', subtitle: 'فاتورة شراء سريعة — F1 للإغلاق',
      hint: 'F1 للإغلاق • الأسهم للتنقّل • + سطر جديد',
      selectSupplier: 'اختيار المورّد بالاسم...', supplier: 'المورّد', noSupplier: 'لا يوجد مورّد بهذا الاسم',
      searchProduct: 'ابحث عن منتج (اسم، باركود، مارك)...', createNew: 'إنشاء منتج جديد',
      addRow: 'إضافة سطر', qty: 'الكمية', buyPrice: 'سعر الشراء', sellPrice: 'سعر البيع', wholesalePrice: 'سعر البيع بالجملة',
      brand: 'العلامة', reference: 'المرجع', barcode: 'الباركود', countryOfOrigin: 'البلد المنشأ', mark: 'المارك', storageLocation: 'مكان التخزين',
      family: 'العائلة',
      confirm: 'تأكيد الفاتورة', cancel: 'إلغاء', total: 'الإجمالي', timbre: 'طابع جبائي',
      noSupplierWarn: 'يرجى اختيار المورّد أولاً', emptyWarn: 'أضف منتجاً واحداً على الأقل',
      success: 'تم تسجيل فاتورة بقيمة', barcodeConflict: 'هذا الباركود مسجّل لمنتج آخر',
      expiryRequired: 'تاريخ انتهاء الصلاحية إلزامي — الرجاء إدخاله في جميع الأسطر',
      familyRequired: 'الرجاء إدخال عائلة المنتج في جميع الأسطر (وضع الصيدلية)',
      editInvoice: 'تعديل الفاتورة',
      editInvoiceHint: 'أضف أو احذف الأسطر ثم عد لشاشة التعديل — لا يُحفظ شيء قبل ضغط «حفظ التعديلات»',
      returnAdds: 'إرجاع بالأسطر',
      nothingChanged: 'لم يتغيّر أي سطر — أضف أو عدّل أو احذف ثم أعد المحاولة'
    },
    en: {
      title: 'Quick Entry', subtitle: 'Fast purchase invoice — F1 to close',
      hint: 'F1 to close • Arrows to navigate • + new row',
      selectSupplier: 'Search supplier by name...', supplier: 'Supplier', noSupplier: 'No supplier found',
      searchProduct: 'Search product (name, barcode, mark)...', createNew: 'Create new product',
      addRow: 'Add row', qty: 'Qty', buyPrice: 'Buy price', sellPrice: 'Sell price', wholesalePrice: 'Wholesale price',
      brand: 'Brand', reference: 'Reference', barcode: 'Barcode', countryOfOrigin: 'Country of origin', mark: 'Mark', storageLocation: 'Storage location',
      family: 'Family',
      confirm: 'Confirm invoice', cancel: 'Cancel', total: 'Total', timbre: 'Fiscal stamp',
      noSupplierWarn: 'Please select a supplier first', emptyWarn: 'Add at least one product',
      success: 'Invoice registered for', barcodeConflict: 'This barcode is already registered to another product',
      expiryRequired: 'Expiry date is required — please fill it in all rows',
      familyRequired: 'Please enter the product family on all rows (pharmacy mode)',
      editInvoice: 'Edit invoice',
      editInvoiceHint: 'Add or remove lines, then return to the edit screen — nothing is saved until you press Save edits',
      returnAdds: 'Return with lines',
      nothingChanged: 'No line changed — add, edit or remove and try again'
    },
    fr: {
      title: 'Saisie Rapide', subtitle: 'Facture d\'achat rapide — F1 pour fermer',
      hint: 'F1 pour fermer • Flèches pour naviguer • + nouvelle ligne',
      selectSupplier: 'Rechercher un fournisseur par nom...', supplier: 'Fournisseur', noSupplier: 'Aucun fournisseur trouvé',
      searchProduct: 'Rechercher un produit (nom, code, marque)...', createNew: 'Créer un nouveau produit',
      addRow: 'Ajouter une ligne', qty: 'Qté', buyPrice: 'Prix d\'achat', sellPrice: 'Prix de vente', wholesalePrice: 'Prix de gros',
      brand: 'Marque', reference: 'Référence', barcode: 'Code-barres', countryOfOrigin: 'Pays d\'origine', mark: 'Marque', storageLocation: 'Emplacement de stockage',
      family: 'Famille',
      confirm: 'Confirmer la facture', cancel: 'Annuler', total: 'Total', timbre: 'Timbre fiscal',
      noSupplierWarn: 'Veuillez sélectionner un fournisseur d\'abord', emptyWarn: 'Ajoutez au moins un produit',
      success: 'Facture enregistrée pour', barcodeConflict: 'Ce code-barres est déjà enregistré pour un autre produit',
      familyRequired: 'Veuillez saisir la famille du produit sur toutes les lignes (mode pharmacie)',
      editInvoice: 'Modifier la facture',
      editInvoiceHint: 'Ajoutez ou supprimez des lignes puis revenuez à l\'écran de modification — rien n\'est enregistré avant «Enregistrer les modifications»',
      returnAdds: 'Retourner avec les lignes',
      nothingChanged: 'Aucune ligne modifiée — ajoutez, modifiez ou supprimez puis réessayez'
    },
    zh: {
      title: '快速录入', subtitle: '快速采购发票 — F1 关闭',
      hint: 'F1 关闭 • 方向键导航 • + 新行',
      selectSupplier: '按名称搜索供应商...', supplier: '供应商', noSupplier: '未找到供应商',
      searchProduct: '搜索产品（名称、条码、品牌）...', createNew: '创建新产品',
      addRow: '添加行', qty: '数量', buyPrice: '进货价', sellPrice: '售价', wholesalePrice: '批发价',
      brand: '品牌', reference: '参考号', barcode: '条码', countryOfOrigin: '原产国', mark: '商标', storageLocation: '存放位置',
      family: '家族',
      confirm: '确认发票', cancel: '取消', total: '总计', timbre: '印花税',
      noSupplierWarn: '请先选择供应商', emptyWarn: '请至少添加一个产品',
      success: '已登记发票，金额', barcodeConflict: '此条码已注册给其他产品',
      familyRequired: '请输入每行的产品家族（药房模式）',
      editInvoice: '编辑发票',
      editInvoiceHint: '添加或删除行后返回编辑屏幕 — 在点击保存修改之前不会保存任何内容',
      returnAdds: '带着行返回',
      nothingChanged: '没有行被修改 — 请添加、编辑或删除后重试'
    }
  };
  if (typeof LANG !== 'undefined') {
    for (var _l in QE_I18N) { if (LANG[_l]) LANG[_l].quickEntry = QE_I18N[_l]; }
  }
  function _t(k) { return (typeof t === 'function') ? t('quickEntry.' + k) : (QE_I18N.ar[k] || k); }

  /* ---------- state ---------- */
  var _qeRows = [];
  var _qeUid = 0;
  var _qeSupplierId = null;
  // Invoice-edit "add from scratch" mode (إضافة من العدم): when set, confirm()
  // does NOT write to the DB — it returns the rows to the invoice edit screen.
  var _qeInvMode = null;
  var QE_COLS = ['product', 'qty', 'buy', 'sell', 'whole', 'brand', 'reference', 'barcode', 'country', 'mark', 'storage', 'family', 'expiry'];
  var RETURN_PAGE_KEY = '_qeReturnPage';

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- supplier ---------- */
  function searchSupplier(q) {
    var box = document.getElementById('qeSupplierResults');
    if (!box) return;
    q = normSearch(q);
    var list = DB.getSuppliers() || [];
    var matches = q ? list.filter(function (s) { return s.name.toLowerCase().indexOf(q.toLowerCase()) !== -1; }).slice(0, 10) : list.slice(0, 10);
    if (!matches.length) { box.innerHTML = q ? '<div class="qe-dropdown-item disabled">' + escHtml(_t('noSupplier')) + '</div>' : ''; return; }
    box.innerHTML = matches.map(function (s) {
      return '<div class="qe-dropdown-item" onclick="QE.selectSupplier(\'' + s.id + '\')"><strong>' + escHtml(s.name) + '</strong> <span class="text-muted">' + escHtml(s.phone || '') + '</span></div>';
    }).join('');
  }
  function selectSupplier(id) {
    var s = (DB.getSuppliers() || []).find(function (x) { return x.id === id; });
    if (!s) return;
    _qeSupplierId = s.id;
    document.getElementById('qeSupplierSearch').value = s.name;
    document.getElementById('qeSupplierResults').innerHTML = '';
    document.getElementById('qeSupplierName').textContent = s.name;
    document.getElementById('qeSelectedSupplier').style.display = 'flex';
  }
  function clearSupplier() {
    _qeSupplierId = null;
    document.getElementById('qeSupplierSearch').value = '';
    document.getElementById('qeSelectedSupplier').style.display = 'none';
  }

  /* ---------- brand options ---------- */
  function buildBrandOptions(selectedId) {
    if (typeof buildBrandSelectOptions === 'function') {
      return buildBrandSelectOptions(selectedId);
    }
    var brands = (typeof BRANDS !== 'undefined') ? BRANDS.global.concat(BRANDS.chinese || []) : [];
    return '<option value="">—</option>' + brands.map(function (b) {
      return '<option value="' + b.id + '"' + (selectedId === b.id ? ' selected' : '') + '>' + escHtml(b.name) + '</option>';
    }).join('');
  }

  /* ---------- rows ---------- */
  function addRow(prefillName) {
    var uid = ++_qeUid;
    var row = {
      uid: uid, mode: 'search', productId: null,
      name: prefillName || '', barcode: '', brandId: '',
      reference: '', countryOfOrigin: '', mark: '', storageLocation: '', family: '', expiryDate: '',
      qty: 1, unit: Unit.DEFAULT, unitLabel: '', buy: 0, sell: 0, whole: 0
    };
    _qeRows.push(row);
    renderRow(row);
    applyFamilySettings();
    var inp = document.querySelector('#qeRow_' + uid + ' .qe-prod-search');
    if (inp) { inp.focus(); if (prefillName) inp.select(); }
    updateTotal();
  }

  /* ---------- unit cell (built-in list or free text for "other") ---------- */
  function unitCellHTML(row) {
    if (Unit.isCustom(row.unit)) {
      return '<input class="qe-input qe-unit-custom" type="text" data-col="unit" value="' + escHtml(row.unitLabel || '') + '" placeholder="' + escHtml(Unit.name('custom')) + '" oninput="QE.setUnitLabel(' + row.uid + ',this.value)" onblur="QE.unitBlur(' + row.uid + ')">';
    }
    return '<select class="qe-input" data-col="unit" id="qeUnit_' + row.uid + '" onchange="QE.setUnit(' + row.uid + ',this.value)">' + Unit.optionsHTML(row.unit) + '</select>';
  }

  function unitRedraw(row, focus) {
    var cell = document.getElementById('qeUnitCell_' + row.uid);
    if (!cell) return;
    cell.innerHTML = unitCellHTML(row);
    if (focus && Unit.isCustom(row.unit)) {
      var inp = cell.querySelector('input');
      if (inp) { inp.focus(); try { inp.select(); } catch (e) {} }
    }
  }

  function setUnit(uid, val) {
    var row = findRow(uid); if (!row) return;
    row.unit = Unit.normalize(val);
    if (row.unit === 'custom') { if (!row.unitLabel) row.unitLabel = Unit.name('custom'); }
    else row.unitLabel = '';
    unitRedraw(row, true);
  }

  function setUnitLabel(uid, val) {
    var row = findRow(uid); if (row) row.unitLabel = String(val == null ? '' : val);
  }

  function unitBlur(uid) {
    var row = findRow(uid);
    if (!row || row.unit !== 'custom') return;
    if (!String(row.unitLabel || '').trim()) {
      row.unitLabel = Unit.name('custom');
      var inp = document.querySelector('#qeUnitCell_' + uid + ' input');
      if (inp) inp.value = row.unitLabel;
    }
  }

  function renderRow(row) {
    var cont = document.getElementById('qeRows');
    if (!cont) return;
    var el = document.createElement('div');
    el.className = 'qe-row';
    el.id = 'qeRow_' + row.uid;
    el.dataset.uid = row.uid;
    var brandOpts = buildBrandOptions(row.brandId);
    el.innerHTML =
      '<div class="qe-cell qe-col-product"><div class="qe-prod-wrap">' +
        '<input class="qe-input qe-prod-search" type="text" autocomplete="off" data-col="product" placeholder="' + escHtml(_t('searchProduct')) + '" value="' + escHtml(row.name) + '" ' +
          'oninput="QE.onProductInput(' + row.uid + ', this.value)" onkeydown="QE.onProductKey(event, ' + row.uid + ')">' +
        '<div class="qe-prod-results" id="qeProdResults_' + row.uid + '"></div>' +
      '</div></div>' +
      '<div class="qe-cell qe-col-num"><input class="qe-input qe-num num-input" type="text" inputmode="decimal" min="0" step="any" data-col="qty" value="' + Unit.fmtQty(row.qty) + '" oninput="QE.setField(' + row.uid + ',\'qty\',this.value);QE.updateTotal()"></div>' +
      '<div class="qe-cell qe-col-unit" id="qeUnitCell_' + row.uid + '">' + unitCellHTML(row) + '</div>' +
      '<div class="qe-cell qe-col-num"><input class="qe-input qe-num num-input" type="text" inputmode="decimal" min="0" data-col="buy" id="qeBuy_' + row.uid + '" value="' + row.buy + '" oninput="QE.setField(' + row.uid + ',\'buy\',this.value);QE.updateTotal()"></div>' +
      '<div class="qe-cell qe-col-num"><input class="qe-input qe-num num-input" type="text" inputmode="decimal" min="0" data-col="sell" id="qeSell_' + row.uid + '" value="' + row.sell + '" oninput="QE.setField(' + row.uid + ',\'sell\',this.value);QE.updateTotal()"></div>' +
      '<div class="qe-cell qe-col-num"><input class="qe-input qe-num num-input" type="text" inputmode="decimal" min="0" data-col="whole" id="qeWhole_' + row.uid + '" value="' + row.whole + '" oninput="QE.setField(' + row.uid + ',\'whole\',this.value);QE.updateTotal()"></div>' +
      '<div class="qe-cell"><select class="qe-input" data-col="brand" id="qeBrand_' + row.uid + '" onchange="QE.setField(' + row.uid + ',\'brandId\',this.value)">' + brandOpts + '</select></div>' +
      '<div class="qe-cell"><input class="qe-input" type="text" dir="ltr" data-col="reference" id="qeReference_' + row.uid + '" value="' + escHtml(row.reference) + '" oninput="QE.setField(' + row.uid + ',\'reference\',this.value)"></div>' +
      '<div class="qe-cell"><input class="qe-input qe-barcode" type="text" dir="ltr" data-col="barcode" id="qeBarcode_' + row.uid + '" value="' + escHtml(row.barcode) + '" oninput="QE.setField(' + row.uid + ',\'barcode\',this.value)" placeholder="' + escHtml(_t('barcode')) + '"></div>' +
      '<div class="qe-cell"><input class="qe-input" type="text" data-col="country" id="qeCountry_' + row.uid + '" value="' + escHtml(row.countryOfOrigin) + '" oninput="QE.setField(' + row.uid + ',\'countryOfOrigin\',this.value)"></div>' +
      '<div class="qe-cell"><input class="qe-input" type="text" data-col="mark" id="qeMark_' + row.uid + '" value="' + escHtml(row.mark) + '" oninput="QE.setField(' + row.uid + ',\'mark\',this.value)"></div>' +
      '<div class="qe-cell"><input class="qe-input" type="text" data-col="storage" id="qeStorage_' + row.uid + '" value="' + escHtml(row.storageLocation) + '" oninput="QE.setField(' + row.uid + ',\'storageLocation\',this.value)"></div>' +
      '<div class="qe-cell"><input class="qe-input" type="text" list="familyDatalist" data-col="family" id="qeFamily_' + row.uid + '" value="' + escHtml(row.family || '') + '" placeholder="' + escHtml(_t('family')) + '" oninput="QE.setField(' + row.uid + ',\'family\',this.value)"></div>' +
      '<div class="qe-cell"><input class="qe-input" type="date" data-col="expiry" id="qeExpiry_' + row.uid + '" value="' + escHtml(row.expiryDate || '') + '" oninput="QE.setField(' + row.uid + ',\'expiryDate\',this.value)"></div>' +
      '<div class="qe-cell qe-col-del"><button type="button" class="qe-del" onclick="QE.deleteRow(' + row.uid + ')" title="×"><i class="fas fa-times"></i></button></div>';
    cont.appendChild(el);
  }

  /* lock/unlock the detail columns for existing vs new product */
  function applyDetailInputs(row, disabled) {
    var map = { brandId: 'qeBrand_', reference: 'qeReference_', barcode: 'qeBarcode_', countryOfOrigin: 'qeCountry_', mark: 'qeMark_', storageLocation: 'qeStorage_', expiryDate: 'qeExpiry_' };
    for (var key in map) {
      var inp = document.getElementById(map[key] + row.uid);
      if (!inp) continue;
      inp.disabled = !!disabled;
      inp.classList.toggle('qe-locked', !!disabled);
    }
    // A product that already exists keeps its stored unit — never rewrite it here.
    var uEl = document.querySelector('#qeUnitCell_' + row.uid + ' [data-col="unit"]');
    if (uEl) { uEl.disabled = !!disabled; uEl.classList.toggle('qe-locked', !!disabled); }
  }

  /* invoice-edit mode: prefilled rows (invoice lines / staged rows) keep the
     line price locked — the invoice's stored price is authoritative. Only the
     qty is editable there, exactly like the classic edit screen. */
  function lockPriceInputs(row, locked) {
    var map = ['qeBuy_', 'qeSell_', 'qeWhole_'];
    for (var i = 0; i < map.length; i++) {
      var inp = document.getElementById(map[i] + row.uid);
      if (!inp) continue;
      inp.disabled = !!locked;
      inp.classList.toggle('qe-locked', !!locked);
    }
  }

  function setNewMode(uid) {
    var row = findRow(uid); if (!row) return;
    row.mode = 'new';
    row.productId = null;
    row.unit = Unit.DEFAULT; row.unitLabel = '';
    unitRedraw(row, false);
    var box = document.getElementById('qeProdResults_' + uid);
    if (box) box.innerHTML = '';
    applyDetailInputs(row, false);
    var barInp = document.getElementById('qeBarcode_' + uid);
    if (barInp) { barInp.value = ''; row.barcode = ''; }
    var nameInp = document.querySelector('#qeRow_' + uid + ' .qe-prod-search');
    if (nameInp) nameInp.focus();
  }

  function setField(uid, field, value) {
    var row = findRow(uid); if (row) row[field] = value;
  }
  function findRow(uid) { return _qeRows.find(function (r) { return r.uid === uid; }); }

  function onProductInput(uid, val) {
    var row = findRow(uid); if (!row) return;
    row.name = val;
    if (row.mode === 'existing') {
      row.mode = 'search'; row.productId = null;
      row.unit = Unit.DEFAULT; row.unitLabel = '';
      unitRedraw(row, false);
      applyDetailInputs(row, false);
      var barInp = document.getElementById('qeBarcode_' + uid);
      if (barInp) { barInp.value = ''; row.barcode = ''; }
    }
    // Invoice-edit mode: changing the product on a prefilled row turns it into a
    // normal "add" row (the original invoice/staged line stays untouched — it is
    // then dropped only if the user deletes this row).
    if (row._src) {
      row._src = null; row._itemIdx = null; row._stagedIdx = null; row._origQty = null;
      lockPriceInputs(row, false);
    }
    searchProduct(val, uid);
  }

  function searchProduct(q, uid) {
    var box = document.getElementById('qeProdResults_' + uid);
    if (!box) return;
    q = normSearch(q);
    var all = DB.getProducts() || [];
    var items;
    if (q) {
      items = all.map(function (p) { return { p: p, s: productSearchScore(p.name, p.barcode, q, p.mark, p.reference, p.countryOfOrigin) }; })
        .filter(function (x) { return x.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 12)
        .map(function (x) { return x.p; });
    } else {
      items = all.slice(0, 12);
    }
    var html = '';
    if (q && !items.some(function (p) { return p.name.toLowerCase() === q.toLowerCase(); })) {
      html += '<div class="qe-dropdown-item qe-create" onclick="QE.setNewMode(' + uid + ')"><i class="fas fa-plus-circle"></i> ' + escHtml(_t('createNew')) + ': <b>' + escHtml(q) + '</b></div>';
    }
    html += items.map(function (p) {
      return '<div class="qe-dropdown-item" onclick="QE.selectProduct(' + uid + ', \'' + p.id + '\')"><strong>' + escHtml(p.name) + '</strong>' +
        '<span class="text-muted" dir="ltr">' + escHtml(p.barcode || '') + '</span>' +
        (p.mark ? '<span class="qe-mark">' + escHtml(p.mark) + '</span>' : '') + '</div>';
    }).join('');
    box.innerHTML = html || '<div class="qe-dropdown-item disabled">' + escHtml(_t('searchProduct')) + '</div>';
  }

  function selectProduct(uid, id) {
    var row = findRow(uid);
    var p = DB.getProduct(id);
    if (!row || !p) return;
    row.mode = 'existing';
    row.productId = p.id;
    row.name = p.name;
    row.qty = 1;
    row.buy = p.buyPrice || 0;
    row.sell = p.sellPrice || 0;
    row.whole = p.wholesalePrice || 0;
row.brandId = p.brandId || '';
    row.reference = p.reference || '';
    row.countryOfOrigin = p.countryOfOrigin || '';
    row.mark = p.mark || '';
    row.storageLocation = p.storageLocation || '';
    row.family = p.family || '';
    row.expiryDate = p.expiryDate || '';
    row.barcode = p.barcode || '';
    row.unit = Unit.normalize(p.unit);
    row.unitLabel = (row.unit === 'custom') ? (p.unitLabel || '') : '';
    refreshRowInputs(row);
    applyDetailInputs(row, true);
    document.getElementById('qeProdResults_' + uid).innerHTML = '';
    updateTotal();
  }

  function refreshRowInputs(row) {
    var el = document.getElementById('qeRow_' + row.uid); if (!el) return;
    var search = el.querySelector('.qe-prod-search'); if (search) search.value = row.name;
    var setVal = function (col, v) { var i = el.querySelector('[data-col="' + col + '"]'); if (i) i.value = v; };
    setVal('qty', row.qty); setVal('buy', row.buy); setVal('sell', row.sell); setVal('whole', row.whole);
    setVal('brand', row.brandId); setVal('reference', row.reference);
    setVal('barcode', row.barcode);
    setVal('country', row.countryOfOrigin); setVal('mark', row.mark); setVal('storage', row.storageLocation);
    setVal('family', row.family || '');
    setVal('expiry', row.expiryDate || '');
    unitRedraw(row, false);
  }

  function deleteRow(uid) {
    _qeRows = _qeRows.filter(function (r) { return r.uid !== uid; });
    var el = document.getElementById('qeRow_' + uid); if (el) el.remove();
    if (_qeRows.length === 0) addRow();
    updateTotal();
  }

  /* ---------- keyboard ---------- */
  function onQeKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if ((e.key === '+' || e.key === '=') && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); addRow(); return; }
    if (e.ctrlKey && (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract')) {
      e.preventDefault();
      var tgt = e.target;
      var rEl = tgt && tgt.closest ? tgt.closest('.qe-row') : null;
      if (rEl) {
        var uid = parseInt(rEl.dataset.uid, 10);
        if (!isNaN(uid)) deleteRow(uid);
      }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      var inp = e.target;
      if (!inp.dataset || !inp.dataset.col) return;
      e.preventDefault();
      navigate(inp, e.key);
    }
  }
  function navigate(inp, key) {
    var rowEl = inp.closest('.qe-row'); if (!rowEl) return;
    var uid = parseInt(rowEl.dataset.uid, 10);
    var ci = QE_COLS.indexOf(inp.dataset.col);
    var ri = _qeRows.findIndex(function (r) { return r.uid === uid; });
    if (ri < 0) return;
    if (key === 'ArrowRight') ci = Math.max(0, ci - 1);
    else if (key === 'ArrowLeft') ci = Math.min(QE_COLS.length - 1, ci + 1);
    else if (key === 'ArrowUp') ri = Math.max(0, ri - 1);
    else if (key === 'ArrowDown') ri = Math.min(_qeRows.length - 1, ri + 1);
    var targetRow = _qeRows[ri]; if (!targetRow) return;
    var targetEl = document.getElementById('qeRow_' + targetRow.uid); if (!targetEl) return;
    var next = targetEl.querySelector('[data-col="' + QE_COLS[ci] + '"]');
    if (next) { next.focus(); if (next.select) next.select(); }
  }
  function onProductKey(e, uid) {
    if (e.key === 'Enter') {
      var val = (e.target.value || '').trim();
      var byBar = findByBarcode(val);
      if (byBar) {
        e.preventDefault();
        selectProduct(uid, byBar.id);
        addRow();
        return;
      }
      var box = document.getElementById('qeProdResults_' + uid);
      var first = box.querySelector('.qe-dropdown-item:not(.disabled)');
      if (first) { e.preventDefault(); first.click(); }
    }
  }

  function findByBarcode(q) {
    if (!q) return null;
    var all = DB.getProducts() || [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].barcode && String(all[i].barcode).trim() === q) return all[i];
    }
    return null;
  }

  function updateTotal() {
    var total = 0;
    for (var i = 0; i < _qeRows.length; i++) {
      var r = _qeRows[i];
      total += (parseFloat(r.qty) || 0) * (parseFloat(r.buy) || 0);
    }
    var el = document.getElementById('qeTotal');
    if (el) el.innerHTML = '<span>' + escHtml(_t('total')) + ':</span> DA' + fmtMoney(total);
  }

  /* ---------- open / close (page navigation) ---------- */
  /* ---------- expiry settings visibility ---------- */
  function applyExpirySettings() {
    var on = (typeof getExpirySettings === 'function') ? getExpirySettings().enabled : true;
    var head = document.getElementById('qeHeaderExpiry');
    if (head) head.style.display = on ? '' : 'none';
    var cells = document.querySelectorAll('#qeRows [data-col="expiry"]');
    for (var i = 0; i < cells.length; i++) cells[i].style.display = on ? '' : 'none';
  }

  /* ---------- family column visibility (pharmacy mode only) ---------- */
  function applyFamilySettings() {
    var on = (typeof window.getPharmacyMode === 'function') ? window.getPharmacyMode() : false;
    var head = document.getElementById('qeHeaderFamily');
    if (head) head.style.display = on ? '' : 'none';
    var cells = document.querySelectorAll('#qeRows [data-col="family"]');
    for (var i = 0; i < cells.length; i++) cells[i].style.display = on ? '' : 'none';
  }

  /* ---------- invoice-edit mode UI (banner, hidden supplier/timbre, labels) ---------- */
  function applyInvoiceModeUI() {
    var supBar = document.querySelector('.qe-supplier-bar');
    var timbre = document.querySelector('.qe-timbre');
    var subSpan = document.querySelector('.page-header-content p [data-i18n="quickEntry.subtitle"]');
    var confirmBtn = document.getElementById('qeConfirmBtn');
    var old = document.getElementById('qeInvBanner');
    if (old) old.remove();
    if (_qeInvMode) {
      if (supBar) supBar.style.display = 'none';
      if (timbre) timbre.style.display = 'none';
      if (subSpan) subSpan.textContent = _t('editInvoiceHint');
      if (confirmBtn) confirmBtn.innerHTML = '<i class="fas fa-level-down-alt"></i> ' + escHtml(_t('returnAdds'));
      var div = document.createElement('div');
      div.id = 'qeInvBanner';
      div.style.cssText = 'margin:10px 16px 0;padding:10px 14px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;font-size:13px;font-weight:700;color:#8d6e00;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
      div.innerHTML = '<i class="fas fa-file-invoice" style="font-size:16px"></i>' +
        '<span>' + escHtml(_t('editInvoice') + ': ' + (_qeInvMode.invoiceNumber || '')) + '</span>' +
        (_qeInvMode.supplierName ? '<span style="font-weight:400;color:var(--silver-600)">' + escHtml(_qeInvMode.supplierName) + '</span>' : '') +
        '<span style="font-weight:400;font-size:11px;color:#a0812c">' + escHtml(_t('editInvoiceHint')) + '</span>';
      var toolbar = document.querySelector('.qe-toolbar');
      if (toolbar && toolbar.parentNode) toolbar.parentNode.insertBefore(div, toolbar);
    } else {
      if (supBar) supBar.style.display = '';
      if (timbre) timbre.style.display = '';
      if (subSpan) subSpan.textContent = _t('subtitle');
      if (confirmBtn) confirmBtn.innerHTML = '<i class="fas fa-check"></i> ' + escHtml(_t('confirm'));
    }
  }

  function open() {
    _qeRows = []; _qeUid = 0; _qeSupplierId = null; _qeInvMode = null;
    var rows = document.getElementById('qeRows'); if (rows) rows.innerHTML = '';
    var supInp = document.getElementById('qeSupplierSearch'); if (supInp) supInp.value = '';
    var selSup = document.getElementById('qeSelectedSupplier'); if (selSup) selSup.style.display = 'none';
    var supRes = document.getElementById('qeSupplierResults'); if (supRes) supRes.innerHTML = '';
    var timbre = document.getElementById('qeTimbre'); if (timbre) timbre.checked = false;
    if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
    // Invoice-edit "add from scratch": prefill rows handed over by the invoices page.
    var prefill = window._qePrefill;
    window._qePrefill = null;
    if (prefill && prefill.rows && prefill.rows.length) {
      _qeInvMode = {
        invoiceId: prefill.invoiceId, invoiceNumber: prefill.invoiceNumber || '',
        supplierName: prefill.supplierName || '', itemCount: 0, stagedIdxList: []
      };
      for (var pi = 0; pi < prefill.rows.length; pi++) {
        var d = prefill.rows[pi];
        var row = {
          uid: ++_qeUid, mode: d.isNew ? 'new' : (d.productId ? 'existing' : 'new'), productId: d.productId || null,
          name: d.name || '', barcode: d.barcode || '', brandId: d.brandId || '',
          reference: d.reference || '', countryOfOrigin: d.countryOfOrigin || '', mark: d.mark || '',
          storageLocation: d.storageLocation || '', family: d.family || '', expiryDate: d.expiryDate || '',
          qty: d.qty != null ? d.qty : 1, buy: d.price != null ? d.price : 0, sell: d.sell || 0, whole: d.whole || 0,
          _src: d.src || null, _itemIdx: (d.itemIdx != null ? d.itemIdx : null),
          _stagedIdx: (d.stagedIdx != null ? d.stagedIdx : null), _origQty: (d.qty != null ? d.qty : 1)
        };
        if (d.src === 'item') _qeInvMode.itemCount = Math.max(_qeInvMode.itemCount, (d.itemIdx | 0) + 1);
        if (d.src === 'staged') _qeInvMode.stagedIdxList.push(d.stagedIdx);
        _qeRows.push(row);
        renderRow(row);
        if (row.mode === 'existing') applyDetailInputs(row, true);
        if (row._src === 'item' || row._src === 'staged') lockPriceInputs(row, true);
      }
      applyInvoiceModeUI();
      applyExpirySettings();
      applyFamilySettings();
      updateTotal();
      return;
    }
    applyInvoiceModeUI();
    addRow();
    applyExpirySettings();
    applyFamilySettings();
    updateTotal();
    if (supInp) supInp.focus();
  }
  function close() {
    // Invoice-edit mode: reopening the edit screen is driven by _invQEResume.
    // confirmInvoiceEditReturn() already set it (with its payload); an explicit
    // cancel (Esc / إلغاء) sets it too so the edit section reopens as it was.
    if (_qeInvMode && !window._invQEResume) {
      window._invQEResume = { invoiceId: _qeInvMode.invoiceId };
    }
    var back = window[RETURN_PAGE_KEY] || 'invoices';
    navigateTo(back);
  }
  function isOpen() { return (typeof _currentPageId !== 'undefined') && _currentPageId === 'quick-entry'; }

  /* ---------- confirm ---------- */
  function confirm() {
    // Invoice-edit "add from scratch": return the lines to the edit screen
    // instead of committing products/invoice/balance here.
    if (_qeInvMode) { confirmInvoiceEditReturn(); return; }
    if (_qeRows.length === 0) { alert(_t('emptyWarn')); return; }

    var expSettings = (typeof getExpirySettings === 'function') ? getExpirySettings() : { enabled: false, required: false };
    if (expSettings.enabled && expSettings.required) {
      for (var e = 0; e < _qeRows.length; e++) {
        var er = _qeRows[e];
        if (!er.expiryDate || !String(er.expiryDate).trim()) {
          alert(_t('expiryRequired'));
          return;
        }
      }
    }

    // وضع الصيدلية: العائلة إلزامية في كل الأسطر (جديدة أو موجودة).
    var pharmMode = (typeof window.getPharmacyMode === 'function') ? window.getPharmacyMode() : false;
    if (pharmMode) {
      for (var f = 0; f < _qeRows.length; f++) {
        var fr = _qeRows[f];
        if (!fr.family || !String(fr.family).trim()) {
          alert(_t('familyRequired'));
          return;
        }
      }
    }

    for (var i = 0; i < _qeRows.length; i++) {
      var r = _qeRows[i];
      if (r.mode === 'search') {
        if (!r.name || !r.name.trim()) { alert(_t('emptyWarn')); return; }
        r.mode = 'new';
        if (!r.barcode) r.barcode = (DB.generateBarcode ? DB.generateBarcode() : ('P' + Date.now()));
      }
    }

    var totalAmount = 0;
    var invoiceItems = [];
    var suppliers = DB.getSuppliers() || [];
    var supIdx = suppliers.findIndex(function (s) { return s.id === _qeSupplierId; });
    // Set when a stock write is rejected (out-of-scope / missing) so the invoice
    // below is NOT saved while quantities went unapplied.
    var qeBlocked = null;

    for (var j = 0; j < _qeRows.length; j++) {
      var row = _qeRows[j];
      var qty = Unit.roundQty(Unit.parse(row.qty));
      var buy = parseFloat(row.buy) || 0;
      var sell = parseFloat(row.sell) || 0;
      var whole = parseFloat(row.whole) || 0;
      var prod;
      if (row.mode === 'existing' && row.productId) {
        prod = DB.getProduct(row.productId);
        if (!prod) { alert(_t('barcodeConflict')); return; }
        // Mirror a purchase/supplier invoice: the product's stock must increase by
        // the added quantity. Route through addOrMergeProduct so it applies the same
        // smart-split rules (same identity+price -> merge quantity into one row;
        // different price -> keep a separate stock row). Falls back to a direct
        // quantity increment when the product has no barcode.
        if (prod.barcode) {
          var mergeRes = DB.addOrMergeProduct({
            id: prod.id,
            name: row.name.trim(),
            barcode: (row.barcode || '').trim() || prod.barcode,
            brandId: row.brandId || '',
            buyPrice: buy, sellPrice: sell, wholesalePrice: whole,
            quantity: qty, supplierId: _qeSupplierId,
            unit: row.unit, unitLabel: row.unitLabel,
            reference: row.reference || '',
            countryOfOrigin: row.countryOfOrigin || '',
            mark: row.mark || '',
            storageLocation: row.storageLocation || '',
            family: row.family || '',
            expiryDate: row.expiryDate || ''
          });
          if (mergeRes && mergeRes.ok) {
            prod = mergeRes.product;
          } else {
            var ures = DB.updateProduct(prod.id, { quantity: (parseFloat(prod.quantity) || 0) + qty, supplierId: _qeSupplierId || prod.supplierId, family: row.family || '' });
            if (ures && ures.ok === false) qeBlocked = ures.reason;
          }
        } else {
          var ures2 = DB.updateProduct(prod.id, { quantity: (parseFloat(prod.quantity) || 0) + qty, supplierId: _qeSupplierId || prod.supplierId, family: row.family || '' });
          if (ures2 && ures2.ok === false) qeBlocked = ures2.reason;
        }
      } else {
        var res = DB.addOrMergeProduct({
          name: row.name.trim(),
          barcode: (row.barcode || '').trim() || (DB.generateBarcode ? DB.generateBarcode() : ('P' + Date.now())),
          brandId: row.brandId || '',
          buyPrice: buy, sellPrice: sell, wholesalePrice: whole,
          quantity: qty, supplierId: _qeSupplierId,
          unit: row.unit, unitLabel: row.unitLabel,
          reference: row.reference || '',
          countryOfOrigin: row.countryOfOrigin || '',
          mark: row.mark || '',
          storageLocation: row.storageLocation || '',
          family: row.family || '',
          expiryDate: row.expiryDate || ''
        });
        if (!res.ok) { alert(_t('barcodeConflict') + ': ' + (res.existing ? res.existing.name : '')); return; }
        prod = res.product;
      }
      var itemTotal = qty * buy;
      totalAmount += itemTotal;
      invoiceItems.push(Object.assign({ productId: prod.id, barcode: prod.barcode, name: prod.name, qty: qty, price: buy, total: itemTotal }, Unit.snapshot(prod || row)));
    }

    var timbreFiscal = 0;
    if (document.getElementById('qeTimbre').checked) {
      var rate = parseFloat(localStorage.getItem('zmt_timbre_rate') || '1');
      timbreFiscal = totalAmount * (rate / 100);
      if (timbreFiscal < 5) timbreFiscal = 5;
      if (timbreFiscal > 10000) timbreFiscal = 10000;
    }

    if (qeBlocked) {
      alert(qeBlocked === 'not_found'
        ? 'لم يُحفظ المُدخل: المنتج غير موجود — أغلق نافذة الإدخال السريع وأعد فتحها ثم حاول'
        : 'لم يُحفظ المُدخل: المنتج خارج نطاق الشركة/المحل النشط. سجّل الدخول إلى شركتك أولاً ثم أعد المحاولة.');
      return;
    }

    DB.addInvoice({ supplierId: _qeSupplierId || null, type: _qeSupplierId ? 'supplier' : 'purchase', date: Date.now(), items: invoiceItems, totalAmount: totalAmount, timbreFiscal: timbreFiscal });
    if (supIdx !== -1) {
      suppliers[supIdx].balance = (parseFloat(suppliers[supIdx].balance) || 0) + totalAmount;
      DB.saveSuppliers(suppliers);
    }

    var count = invoiceItems.length;
    var totalQty = invoiceItems.reduce(function (s, it) { return s + it.qty; }, 0);
    alert(_t('success') + ' DA' + fmtMoney(totalAmount) + '  —  ' + count + ' / ' + totalQty);
if (typeof window.refreshFamilySuggestions === 'function') window.refreshFamilySuggestions();
    close();
  }

  /* ---------- confirm in invoice-edit mode: return lines, NO DB writes ---------- */
  function confirmInvoiceEditReturn() {
    if (!_qeInvMode) return;
    if (_qeRows.length === 0) { alert(_t('emptyWarn')); return; }

    // Rows the operator added in THIS session follow the normal F1 rules;
    // prefilled rows (invoice lines / previously staged) pass through untouched.
    var expSettings = (typeof getExpirySettings === 'function') ? getExpirySettings() : { enabled: false, required: false };
    var pharmMode = (typeof window.getPharmacyMode === 'function') ? window.getPharmacyMode() : false;
    for (var i = 0; i < _qeRows.length; i++) {
      var vr = _qeRows[i];
      if (vr._src) continue;
      if (vr.mode === 'search') {
        if (!vr.name || !vr.name.trim()) { alert(_t('emptyWarn')); return; }
        vr.mode = 'new';
        if (!vr.barcode) vr.barcode = (DB.generateBarcode ? DB.generateBarcode() : ('P' + Date.now()));
      }
      if (expSettings.enabled && expSettings.required && (!vr.expiryDate || !String(vr.expiryDate).trim())) {
        alert(_t('expiryRequired'));
        return;
      }
      if (pharmMode && (!vr.family || !String(vr.family).trim())) {
        alert(_t('familyRequired'));
        return;
      }
    }

    var itemQty = {};
    var removals = [];
    var stagedDeletes = [];
    var stagedUpdates = [];
    var additions = [];
    var keptItemIdx = {};
    var keptStaged = {};

    for (var j = 0; j < _qeRows.length; j++) {
      var row = _qeRows[j];
      var qty = Unit.roundQty(Unit.parse(row.qty));
      if (row._src === 'item') {
        keptItemIdx[row._itemIdx] = true;
        if (qty !== row._origQty) itemQty[row._itemIdx] = qty;
      } else if (row._src === 'staged') {
        keptStaged[row._stagedIdx] = true;
        if (qty !== row._origQty) stagedUpdates.push({ idx: row._stagedIdx, qty: qty });
      } else if (row.mode === 'existing' && row.productId) {
        // Existing catalog product picked in this session → add it to the invoice.
        additions.push({ productId: row.productId, barcode: row.barcode || '', name: row.name, qty: qty, price: parseFloat(row.buy) || 0, unit: row.unit, unitLabel: row.unitLabel });
      } else {
        // Brand-new product: the payload is created at SAVE time on the edit
        // screen (no orphan product if the edit is abandoned).
        var payload = {
          name: (row.name || '').trim(), barcode: (row.barcode || '').trim(), brandId: row.brandId || '',
          buyPrice: parseFloat(row.buy) || 0, sellPrice: parseFloat(row.sell) || 0, wholesalePrice: parseFloat(row.whole) || 0,
          unit: row.unit, unitLabel: row.unitLabel,
          reference: row.reference || '', countryOfOrigin: row.countryOfOrigin || '', mark: row.mark || '',
          storageLocation: row.storageLocation || '', family: row.family || '', expiryDate: row.expiryDate || ''
        };
        additions.push({ payload: payload, qty: qty, price: payload.buyPrice });
      }
    }

    // Prefilled invoice lines that are no longer in the grid were deleted → removals.
    for (var k = 0; k < _qeInvMode.itemCount; k++) if (!keptItemIdx[k]) removals.push(k);
    // Previously staged rows deleted here are simply unstaged.
    (_qeInvMode.stagedIdxList || []).forEach(function (sIdx) { if (!keptStaged[sIdx]) stagedDeletes.push(sIdx); });

    var nothingToDo = !removals.length && !stagedDeletes.length && !stagedUpdates.length && !additions.length &&
      Object.keys(itemQty).length === 0;
    if (nothingToDo) { alert(_t('nothingChanged')); return; }

    window._invQEAddResult = {
      itemQty: itemQty, removals: removals, stagedDeletes: stagedDeletes,
      stagedUpdates: stagedUpdates, additions: additions
    };
    window._invQEResume = { invoiceId: _qeInvMode.invoiceId };
    close();
  }

  /* ---------- page lifecycle ---------- */
  window.init_quick_entry = function () {
    // bind page-scoped keyboard nav (cleaned automatically on page leave)
    var body = document.getElementById('page-quick-entry');
    if (body) {
      trackPageListener('keydown', onQeKeydown, body);
    }
    open();
  };

  /* ---------- expose ---------- */
  window.QE = {
    open: open, close: close, isOpen: isOpen,
    searchSupplier: searchSupplier, selectSupplier: selectSupplier, clearSupplier: clearSupplier,
    addRow: addRow, deleteRow: deleteRow, setField: setField,
    onProductInput: onProductInput, onProductKey: onProductKey,
    searchProduct: searchProduct, selectProduct: selectProduct,
    setNewMode: setNewMode, confirm: confirm, updateTotal: updateTotal
  };
})();
