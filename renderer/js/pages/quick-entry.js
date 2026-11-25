/* ============================================================
   ZMT PIECE — Quick Entry (F1)  [FULL PAGE]
   Fast purchase-invoice entry opened as a full page (not a modal).
    ONE flat row per product:
      product · qty · buy · sell · wholesale · brand · reference · plu ·
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
      scanPlaceholder: 'امسح باركود المنتج...', scanReady: 'جاهز للمسح',
      scanAdded: 'تمت إضافة', scanIncremented: 'زيادة الكمية', scanNew: 'منتج جديد — أكمل بياناته',
      addRow: 'إضافة سطر', qty: 'الكمية', buyPrice: 'سعر الشراء', sellPrice: 'سعر البيع', wholesalePrice: 'سعر البيع بالجملة',
      brand: 'العلامة', reference: 'المرجع', plu: 'PLU الميزان', pluPlaceholder: 'مثال: 00123', barcode: 'الباركود', countryOfOrigin: 'البلد المنشأ', mark: 'المارك', storageLocation: 'مكان التخزين',
      family: 'العائلة', extraPrices: 'أسعار بيع إضافية (اختياري)',
      confirm: 'تأكيد الفاتورة', cancel: 'إلغاء', total: 'الإجمالي', timbre: 'طابع جبائي',
      purchaseDiscount: 'خصم الشراء %', invoiceDiscount: 'خصم الفاتورة',
      purchaseAmount: 'مبلغ المشتريات', purchaseAmountBtn: 'إظهار مبلغ المشتريات', hidePurchaseAmount: 'إخفاء مبلغ المشتريات', productInfo: 'معلومات المنتج',
      grossTotal: 'الإجمالي قبل الخصم', productDiscount: 'خصم المنتجات', realTotal: 'الإجمالي الحقيقي',
      fixedAmount: 'مبلغ ثابت',
      noSupplierWarn: 'يرجى اختيار المورّد أولاً', emptyWarn: 'أضف منتجاً واحداً على الأقل',
      success: 'تم تسجيل فاتورة بقيمة', barcodeConflict: 'هذا الباركود مسجّل لمنتج آخر',
      expiryRequired: 'تاريخ انتهاء الصلاحية إلزامي — الرجاء إدخاله في جميع الأسطر',
      familyRequired: 'الرجاء إدخال عائلة المنتج في جميع الأسطر (وضع الصيدلية)',
      editInvoice: 'تعديل الفاتورة',
      editInvoiceHint: 'أضف أو احذف الأسطر ثم عد لشاشة التعديل — لا يُحفظ شيء قبل ضغط «حفظ التعديلات»',
      returnAdds: 'إرجاع بالأسطر',
      nothingChanged: 'لم يتغيّر أي سطر — أضف أو عدّل أو احذف ثم أعد المحاولة',
      addSupplier: 'إنشاء مورد', newSupplierTitle: 'إنشاء مورد جديد', saveAndSelect: 'حفظ واختيار',
      paidNow: 'المدفوع الآن', remaining: 'المتبقي',
      needSupplierForPay: 'اختر مورداً أو أنشئه قبل تسجيل الدفعة',
      moveUp: 'تحريك السطر للأعلى', moveDown: 'تحريك السطر للأسفل'
    },
    en: {
      title: 'Quick Entry', subtitle: 'Fast purchase invoice — F1 to close',
      hint: 'F1 to close • Arrows to navigate • + new row',
      selectSupplier: 'Search supplier by name...', supplier: 'Supplier', noSupplier: 'No supplier found',
      searchProduct: 'Search product (name, barcode, mark)...', createNew: 'Create new product',
      scanPlaceholder: 'Scan a product barcode...', scanReady: 'Ready to scan',
      scanAdded: 'Added', scanIncremented: 'Quantity increased', scanNew: 'New product — complete its details',
      addRow: 'Add row', qty: 'Qty', buyPrice: 'Buy price', sellPrice: 'Sell price', wholesalePrice: 'Wholesale price',
      brand: 'Brand', reference: 'Reference', plu: 'Scale PLU', pluPlaceholder: 'e.g. 00123', barcode: 'Barcode', countryOfOrigin: 'Country of origin', mark: 'Mark', storageLocation: 'Storage location',
      family: 'Family', extraPrices: 'Extra sale prices (optional)',
      confirm: 'Confirm invoice', cancel: 'Cancel', total: 'Total', timbre: 'Fiscal stamp',
      purchaseDiscount: 'Purchase disc. %', invoiceDiscount: 'Invoice discount',
      purchaseAmount: 'Purchase amount', purchaseAmountBtn: 'Show purchase amount', hidePurchaseAmount: 'Hide purchase amount', productInfo: 'Product info',
      grossTotal: 'Total before discount', productDiscount: 'Product discount', realTotal: 'Real total',
      fixedAmount: 'Fixed amount',
      noSupplierWarn: 'Please select a supplier first', emptyWarn: 'Add at least one product',
      success: 'Invoice registered for', barcodeConflict: 'This barcode is already registered to another product',
      expiryRequired: 'Expiry date is required — please fill it in all rows',
      familyRequired: 'Please enter the product family on all rows (pharmacy mode)',
      editInvoice: 'Edit invoice',
      editInvoiceHint: 'Add or remove lines, then return to the edit screen — nothing is saved until you press Save edits',
      returnAdds: 'Return with lines',
      nothingChanged: 'No line changed — add, edit or remove and try again',
      addSupplier: 'Add supplier', newSupplierTitle: 'New supplier', saveAndSelect: 'Save and select',
      paidNow: 'Paid now', remaining: 'Remaining',
      needSupplierForPay: 'Select or create a supplier before recording a payment',
      moveUp: 'Move row up', moveDown: 'Move row down'
    },
    fr: {
      title: 'Saisie Rapide', subtitle: 'Facture d\'achat rapide — F1 pour fermer',
      hint: 'F1 pour fermer • Flèches pour naviguer • + nouvelle ligne',
      selectSupplier: 'Rechercher un fournisseur par nom...', supplier: 'Fournisseur', noSupplier: 'Aucun fournisseur trouvé',
      searchProduct: 'Rechercher un produit (nom, code, marque)...', createNew: 'Créer un nouveau produit',
      scanPlaceholder: 'Scannez le code-barres du produit...', scanReady: 'Prêt au scan',
      scanAdded: 'Ajouté', scanIncremented: 'Quantité augmentée', scanNew: 'Nouveau produit — complétez ses informations',
      addRow: 'Ajouter une ligne', qty: 'Qté', buyPrice: 'Prix d\'achat', sellPrice: 'Prix de vente', wholesalePrice: 'Prix de gros',
      brand: 'Marque', reference: 'Référence', plu: 'PLU balance', pluPlaceholder: 'ex : 00123', barcode: 'Code-barres', countryOfOrigin: 'Pays d\'origine', mark: 'Marque', storageLocation: 'Emplacement de stockage',
      family: 'Famille', extraPrices: 'Prix de vente supplémentaires (facultatif)',
      confirm: 'Confirmer la facture', cancel: 'Annuler', total: 'Total', timbre: 'Timbre fiscal',
      purchaseDiscount: 'Remise achat %', invoiceDiscount: 'Remise facture',
      purchaseAmount: 'Montant d\'achat', purchaseAmountBtn: 'Afficher le montant d\'achat', hidePurchaseAmount: 'Masquer le montant d\'achat', productInfo: 'Infos produit',
      grossTotal: 'Total avant remise', productDiscount: 'Remise produits', realTotal: 'Total réel',
      fixedAmount: 'Montant fixe',
      noSupplierWarn: 'Veuillez sélectionner un fournisseur d\'abord', emptyWarn: 'Ajoutez au moins un produit',
      success: 'Facture enregistrée pour', barcodeConflict: 'Ce code-barres est déjà enregistré pour un autre produit',
      familyRequired: 'Veuillez saisir la famille du produit sur toutes les lignes (mode pharmacie)',
      editInvoice: 'Modifier la facture',
      editInvoiceHint: 'Ajoutez ou supprimez des lignes puis revenuez à l\'écran de modification — rien n\'est enregistré avant «Enregistrer les modifications»',
      returnAdds: 'Retourner avec les lignes',
      nothingChanged: 'Aucune ligne modifiée — ajoutez, modifiez ou supprimez puis réessayez',
      addSupplier: 'Créer un fournisseur', newSupplierTitle: 'Nouveau fournisseur', saveAndSelect: 'Enregistrer et sélectionner',
      paidNow: 'Payé maintenant', remaining: 'Restant',
      needSupplierForPay: 'Sélectionnez ou créez un fournisseur avant d\'enregistrer un paiement',
      moveUp: 'Monter la ligne', moveDown: 'Descendre la ligne'
    },
    zh: {
      title: '快速录入', subtitle: '快速采购发票 — F1 关闭',
      hint: 'F1 关闭 • 方向键导航 • + 新行',
      selectSupplier: '按名称搜索供应商...', supplier: '供应商', noSupplier: '未找到供应商',
      searchProduct: '搜索产品（名称、条码、品牌）...', createNew: '创建新产品',
      scanPlaceholder: '扫描产品条码...', scanReady: '准备扫描',
      scanAdded: '已添加', scanIncremented: '数量增加', scanNew: '新产品 — 请补全信息',
      addRow: '添加行', qty: '数量', buyPrice: '进货价', sellPrice: '售价', wholesalePrice: '批发价',
      brand: '品牌', reference: '参考号', plu: '秤码 PLU', pluPlaceholder: '例如：00123', barcode: '条码', countryOfOrigin: '原产国', mark: '商标', storageLocation: '存放位置',
      family: '家族', extraPrices: '额外售价（可选）',
      confirm: '确认发票', cancel: '取消', total: '总计', timbre: '印花税',
      purchaseDiscount: '进货折扣 %', invoiceDiscount: '发票折扣',
      purchaseAmount: '采购金额', purchaseAmountBtn: '显示采购金额', hidePurchaseAmount: '隐藏采购金额', productInfo: '产品信息',
      grossTotal: '折扣前总计', productDiscount: '产品折扣', realTotal: '实际总计',
      fixedAmount: '固定金额',
      noSupplierWarn: '请先选择供应商', emptyWarn: '请至少添加一个产品',
      success: '已登记发票，金额', barcodeConflict: '此条码已注册给其他产品',
      familyRequired: '请输入每行的产品家族（药房模式）',
      editInvoice: '编辑发票',
      editInvoiceHint: '添加或删除行后返回编辑屏幕 — 在点击保存修改之前不会保存任何内容',
      returnAdds: '带着行返回',
      nothingChanged: '没有行被修改 — 请添加、编辑或删除后重试',
      addSupplier: '添加供应商', newSupplierTitle: '新建供应商', saveAndSelect: '保存并选择',
      paidNow: '已支付', remaining: '剩余',
      needSupplierForPay: '请先选择或新建供应商，再记录付款',
      moveUp: '上移行', moveDown: '下移行'
    }
  };
  if (typeof LANG !== 'undefined') {
    for (var _l in QE_I18N) {
      if (!LANG[_l]) continue;
      if (!LANG[_l].quickEntry) LANG[_l].quickEntry = {};
      for (var _k in QE_I18N[_l]) {
        if (LANG[_l].quickEntry[_k] === undefined) LANG[_l].quickEntry[_k] = QE_I18N[_l][_k];
      }
    }
  }
  function _t(k) { return (typeof t === 'function') ? t('quickEntry.' + k) : (QE_I18N.ar[k] || k); }

  // ===== CENT (.00) DISPLAY TOGGLE =====================================
  // Shared with Smart Add through one localStorage key. Fresh installs start
  // OFF. This only rewrites the visible text of money inputs: row values,
  // totals, PDF output and DB records remain plain numbers.
  window.CentFormat = window.CentFormat || (function () {
    var KEY = 'zmt_cent_format_on';
    function enabled() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
    function set(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} }
    function format(value) {
      if (value == null || String(value).trim() === '') return '';
      var s = String(value).trim()
        .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
        .replace(/,/g, '.').replace(/[^\d.\-]/g, '');
      if (!s) return '';
      var n = parseFloat(s);
      return isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : '';
    }
    function display(value) { return enabled() ? format(value) : value; }
    return { key: KEY, enabled: enabled, set: set, format: format, display: display };
  })();

  /* ---------- state ---------- */
  var _qeRows = [];
  var _qeUid = 0;
  var _qeSupplierId = null;
  // Invoice-edit "add from scratch" mode (إضافة من العدم): when set, confirm()
  // does NOT write to the DB — it returns the rows to the invoice edit screen.
  var _qeInvMode = null;
  // Whole-invoice purchase discount: percentage by default, or a fixed DA
  // amount distributed over the lines by PurchaseCore (feature 5 arithmetic).
  var _qeDiscMode = 'percent';
  var QE_COLS = ['product', 'qty', 'unit', 'buy', 'pdisc', 'sell', 'whole', 'brand', 'reference', 'plu', 'barcode', 'country', 'mark', 'minPrice', 'storage', 'family', 'expiry'];
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
  function openAddSupplier() {
    var m = document.getElementById('qeAddSupplierModal');
    if (m) { m.style.display = 'flex'; }
    var n = document.getElementById('qeNewSupName'); if (n) { n.value = ''; n.focus(); }
    ['qeNewSupPhone','qeNewSupAddress'].forEach(function (id) { var e = document.getElementById(id); if (e) e.value = ''; });
    if (typeof ZmtPartyLegal === 'object' && ZmtPartyLegal && typeof ZmtPartyLegal.clear === 'function') {
      ZmtPartyLegal.clear('qeNewSup');
    } else {
      ['Rc','Nif','Nis','Article'].forEach(function (s) { var e = document.getElementById('qeNewSup' + s); if (e) e.value = ''; });
    }
  }
  function closeAddSupplier() {
    var m = document.getElementById('qeAddSupplierModal'); if (m) m.style.display = 'none';
  }
  function confirmAddSupplier() {
    var name = (document.getElementById('qeNewSupName').value || '').trim();
    if (!name) { alert('الرجاء إدخال اسم المورد'); return; }
    var suppliers = DB.getSuppliers() || [];
    var added = Object.assign({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: name,
      phone: (document.getElementById('qeNewSupPhone').value || '').trim(),
      address: (document.getElementById('qeNewSupAddress').value || '').trim(),
      email: '',
      balance: 0,
    }, (typeof ZmtPartyLegal === 'object' && ZmtPartyLegal && typeof ZmtPartyLegal.read === 'function')
      ? ZmtPartyLegal.read('qeNewSup')
      : ((typeof _supLegalRead === 'function') ? _supLegalRead('qeNewSup') : {}));
    suppliers.push(added);
    DB.saveSuppliers(suppliers);
    try { DB.logAudit({ action: 'add', entity: 'supplier', entityId: added.id, detail: name }); } catch (e) {}
    closeAddSupplier();
    selectSupplier(added.id);
  }
  function clearSupplier() {
    _qeSupplierId = null;
    document.getElementById('qeSupplierSearch').value = '';
    document.getElementById('qeSupplierResults').innerHTML = '';
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
      reference: '', plu: '', countryOfOrigin: '', mark: '', storageLocation: '', family: '', expiryDate: '', minPrice: 0,
      qty: 1, unit: Unit.DEFAULT, unitLabel: '', buy: 0, pdisc: 0, sell: 0, whole: 0,
      extras: {}
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

  /* ---------- per-line purchase amount (الكمية × سعر الشراء) ---------- */
  // The column sits right after سعر الشراء and stays collapsed until the
  // toolbar button «إظهار مبلغ المشتريات» turns it on. The choice is kept per
  // machine and shared with the Smart-Add grid through the same localStorage
  // key, so both grids agree on one setting.
  var AMOUNT_KEY = 'zmt_show_purchase_amount';
  function showPurchaseAmount() {
    try { return localStorage.getItem(AMOUNT_KEY) === '1'; } catch (e) { return false; }
  }
  function setShowPurchaseAmount(on) {
    try { localStorage.setItem(AMOUNT_KEY, on ? '1' : '0'); } catch (e) {}
    applyAmountVisibility(on);
    updateTotal();
  }
  function toggleAmount() { setShowPurchaseAmount(!showPurchaseAmount()); }
  function applyAmountVisibility(on) {
    if (on == null) on = showPurchaseAmount();
    var body = document.body;
    if (body && body.classList) body.classList.toggle('qe-show-amount', !!on);
    var btn = document.getElementById('qeAmountBtn');
    if (btn) {
      if (btn.classList) btn.classList.toggle('is-on', !!on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      var lbl = btn.querySelector('span');
      if (lbl) lbl.textContent = on ? _t('hidePurchaseAmount') : _t('purchaseAmountBtn');
    }
    // The amount column's track collapses to 0px while hidden; rebuild the
    // generated grid so header and every row keep the same template.
    applyQELayout();
  }

  /* ---------- .00 cent display (shared with Smart Add) ---------- */
  var QE_MONEY_COLS = { buy: 1, sell: 1, whole: 1, minPrice: 1 };
  function centOn() { return !!(window.CentFormat && CentFormat.enabled()); }
  function isQeMoneyInput(el) {
    if (!el || !el.getAttribute) return false;
    return !!(QE_MONEY_COLS[el.getAttribute('data-col')] || el.getAttribute('data-extra-price-id'));
  }
  function applyCentFormatting() {
    if (!centOn() || !document.querySelectorAll) return;
    var inputs = document.querySelectorAll('#qeRows input');
    for (var i = 0; i < inputs.length; i++) {
      if (!isQeMoneyInput(inputs[i]) || inputs[i].value === '') continue;
      var formatted = CentFormat.format(inputs[i].value);
      if (formatted) inputs[i].value = formatted;
    }
    var paid = document.getElementById('qePaidAmount');
    if (paid && paid.value !== '') {
      var fp = CentFormat.format(paid.value);
      if (fp) paid.value = fp;
    }
  }
  function stripCentFormatting() {
    if (!document.querySelectorAll) return;
    var inputs = document.querySelectorAll('#qeRows input');
    for (var i = 0; i < inputs.length; i++) {
      if (!isQeMoneyInput(inputs[i])) continue;
      if (/\.00$/.test(inputs[i].value)) inputs[i].value = inputs[i].value.slice(0, -3);
    }
    var paid = document.getElementById('qePaidAmount');
    if (paid && /\.00$/.test(paid.value)) paid.value = paid.value.slice(0, -3);
  }
  function paintCentBtn() {
    var btn = document.getElementById('qeCentBtn');
    if (!btn) return;
    var on = centOn();
    if (btn.classList) btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function toggleCent() {
    var on = !centOn();
    if (window.CentFormat) CentFormat.set(on);
    paintCentBtn();
    if (on) applyCentFormatting(); else stripCentFormatting();
  }

  /* ---------- row colour state (جديد / موجود / كمية منخفضة) ---------- */
  // برتقالي = منتج غير موجود (سيُنشأ) · أخضر = منتج موجود · أحمر = موجود لكن
  // كميته صفر أو دون حدّ التنبيه. سطر فارغ بلا لون.
  function lowThreshold() {
    try { return (typeof DB !== 'undefined' && DB.getLowStockThreshold) ? (DB.getLowStockThreshold() || 0) : 0; }
    catch (e) { return 0; }
  }
  function probeExistingByName(name) {
    var q = String(name || '').trim().toLowerCase();
    if (!q) return null;
    var all = (typeof DB !== 'undefined' && DB.getProducts) ? (DB.getProducts() || []) : [];
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].name || '').trim().toLowerCase() === q) return all[i];
    }
    return null;
  }
  function rowState(row) {
    if (!row) return '';
    var p = null;
    if (row.productId && typeof DB !== 'undefined' && DB.getProduct) p = DB.getProduct(row.productId);
    if (!p && String(row.name || '').trim()) p = probeExistingByName(row.name);
    if (p) return ((parseFloat(p.quantity) || 0) <= lowThreshold()) ? 'low' : 'ok';
    if (String(row.name || '').trim()) return 'new';
    return '';
  }
  function refreshRowState(row) {
    var el = document.getElementById('qeRow_' + row.uid);
    if (!el || !el.classList) return;
    el.classList.remove('qe-row-new', 'qe-row-ok', 'qe-row-low');
    var st = rowState(row);
    if (st) el.classList.add('qe-row-' + st);
    var idx = el.querySelector('.qe-idx');
    if (idx && idx.classList) idx.classList.toggle('qe-idx-click', st === 'ok' || st === 'low');
  }
  function renumberRows() {
    for (var i = 0; i < _qeRows.length; i++) {
      var idxEl = document.querySelector('#qeRow_' + _qeRows[i].uid + ' .qe-idx');
      if (idxEl) idxEl.textContent = String(i + 1);
    }
  }
  // Row number → product card. Only a line tied to an existing article opens it;
  // everyone may view it (no permission gate), exactly like the inventory «i».
  function showRowProduct(uid) {
    var row = findRow(uid);
    if (!row) return;
    var id = row.productId;
    if (!id && String(row.name || '').trim()) {
      var p = probeExistingByName(row.name);
      if (p) id = p.id;
    }
    if (!id) return;
    if (typeof showProductDetails === 'function') showProductDetails(id);
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
      '<div class="qe-cell qe-col-idx fl-drag-handle" data-col-cell="idx">' +
        '<button type="button" class="fl-move" onclick="QE.moveRow(' + row.uid + ',-1)" title="' + escHtml(_t('moveUp')) + '">↑</button>' +
        '<span class="qe-idx" title="' + escHtml(_t('productInfo')) + '" onclick="QE.showRowProduct(' + row.uid + ')">' + (_qeRows.indexOf(row) + 1) + '</span>' +
        '<button type="button" class="fl-move" onclick="QE.moveRow(' + row.uid + ',1)" title="' + escHtml(_t('moveDown')) + '">↓</button>' +
      '</div>' +
      '<div class="qe-cell qe-col-product" data-col-cell="product"><div class="qe-prod-wrap">' +
        '<input class="qe-input qe-prod-search" type="text" autocomplete="off" data-col="product" placeholder="' + escHtml(_t('searchProduct')) + '" value="' + escHtml(row.name) + '" ' +
          'oninput="QE.onProductInput(' + row.uid + ', this.value)" onkeydown="QE.onProductKey(event, ' + row.uid + ')">' +
        '<div class="qe-prod-results" id="qeProdResults_' + row.uid + '"></div>' +
      '</div></div>' +
      '<div class="qe-cell qe-col-num" data-col-cell="qty"><input class="qe-input qe-num num-input" type="text" inputmode="decimal" min="0" step="any" data-col="qty" value="' + Unit.fmtQty(row.qty) + '" oninput="QE.setField(' + row.uid + ',\'qty\',this.value);QE.updateTotal()"></div>' +
      '<div class="qe-cell qe-col-unit" data-col-cell="unit" id="qeUnitCell_' + row.uid + '">' + unitCellHTML(row) + '</div>' +
      '<div class="qe-cell qe-col-num" data-col-cell="buy"><input class="qe-input qe-num num-input" type="text" inputmode="decimal" min="0" data-col="buy" id="qeBuy_' + row.uid + '" value="' + row.buy + '" oninput="QE.setField(' + row.uid + ',\'buy\',this.value);QE.updateTotal()"></div>' +
      '<div class="qe-cell qe-col-amount" data-col-cell="amount" id="qeAmount_' + row.uid + '">DA' + fmtMoney((parseFloat(row.qty) || 0) * (parseFloat(row.buy) || 0)) + '</div>' +
      '<div class="qe-cell qe-col-num qe-col-disc" data-col-cell="pdisc">' +
        '<input class="qe-input qe-num num-input qe-pdisc" type="text" inputmode="decimal" min="0" max="100" data-col="pdisc" id="qePdisc_' + row.uid + '" value="' + (parseFloat(row.pdisc) || 0) + '" oninput="QE.setField(' + row.uid + ',\'pdisc\',this.value);QE.updateTotal()" onblur="QE.normalizePdisc(' + row.uid + ',this)">' +
        '<div class="qe-realcost qe-disc-detail" id="qeReal_' + row.uid + '">DA0</div>' +
      '</div>' +
      '<div class="qe-cell qe-col-num" data-col-cell="sell"><input class="qe-input qe-num num-input" type="text" inputmode="decimal" min="0" data-col="sell" id="qeSell_' + row.uid + '" value="' + row.sell + '" oninput="QE.setField(' + row.uid + ',\'sell\',this.value);QE.updateTotal()"></div>' +
      '<div class="qe-cell qe-col-num" data-col-cell="whole"><input class="qe-input qe-num num-input" type="text" inputmode="decimal" min="0" data-col="whole" id="qeWhole_' + row.uid + '" value="' + row.whole + '" oninput="QE.setField(' + row.uid + ',\'whole\',this.value);QE.updateTotal()"></div>' +
      '<div class="qe-cell" data-col-cell="brand"><select class="qe-input" data-col="brand" id="qeBrand_' + row.uid + '" onchange="QE.setField(' + row.uid + ',\'brandId\',this.value)">' + brandOpts + '</select></div>' +
      '<div class="qe-cell fv-reference" data-col-cell="reference"><input class="qe-input" type="text" dir="ltr" data-col="reference" id="qeReference_' + row.uid + '" value="' + escHtml(row.reference) + '" oninput="QE.setField(' + row.uid + ',\'reference\',this.value)"></div>' +
      // The scale code the till asks for on a weighed label. Same 8-digit cap
      // and numeric keypad as the product card, so a receipt codes the article
      // once instead of sending the operator back to المخزون.
      '<div class="qe-cell qe-col-plu fv-plu" data-col-cell="plu"><input class="qe-input" type="text" dir="ltr" inputmode="numeric" maxlength="8" data-col="plu" id="qePlu_' + row.uid + '" value="' + escHtml(row.plu) + '" placeholder="' + escHtml(_t('pluPlaceholder')) + '" oninput="QE.setField(' + row.uid + ',\'plu\',this.value)"></div>' +
      '<div class="qe-cell" data-col-cell="barcode"><input class="qe-input qe-barcode" type="text" dir="ltr" data-col="barcode" id="qeBarcode_' + row.uid + '" value="' + escHtml(row.barcode) + '" oninput="QE.setField(' + row.uid + ',\'barcode\',this.value)" placeholder="' + escHtml(_t('barcode')) + '"></div>' +
      '<div class="qe-cell fv-country" data-col-cell="country"><input class="qe-input" type="text" data-col="country" id="qeCountry_' + row.uid + '" value="' + escHtml(row.countryOfOrigin) + '" oninput="QE.setField(' + row.uid + ',\'countryOfOrigin\',this.value)"></div>' +
      '<div class="qe-cell fv-mark" data-col-cell="mark"><input class="qe-input" type="text" data-col="mark" id="qeMark_' + row.uid + '" value="' + escHtml(row.mark) + '" oninput="QE.setField(' + row.uid + ',\'mark\',this.value)"></div>' +
      '<div class="qe-cell qe-col-minprice fv-minPrice" data-col-cell="minPrice"><input class="qe-input qe-num num-input" type="number" min="0" step="any" data-col="minPrice" id="qeMinPrice_' + row.uid + '" value="' + (row.minPrice || 0) + '" oninput="QE.setField(' + row.uid + ',\'minPrice\',this.value)"></div>' +
      '<div class="qe-cell" data-col-cell="storage"><input class="qe-input" type="text" data-col="storage" id="qeStorage_' + row.uid + '" value="' + escHtml(row.storageLocation) + '" oninput="QE.setField(' + row.uid + ',\'storageLocation\',this.value)"></div>' +
      '<div class="qe-cell" data-col-cell="family"><input class="qe-input" type="text" list="familyDatalist" data-col="family" id="qeFamily_' + row.uid + '" value="' + escHtml(row.family || '') + '" placeholder="' + escHtml(_t('family')) + '" oninput="QE.setField(' + row.uid + ',\'family\',this.value)"></div>' +
      '<div class="qe-cell" data-col-cell="expiry"><input class="qe-input" type="date" data-col="expiry" id="qeExpiry_' + row.uid + '" value="' + escHtml(row.expiryDate || '') + '" oninput="QE.setField(' + row.uid + ',\'expiryDate\',this.value)"></div>' +
      '<div class="qe-cell qe-col-del" data-col-cell="del"><button type="button" class="qe-del" onclick="QE.deleteRow(' + row.uid + ')" title="×"><i class="fas fa-times"></i></button></div>' +
      // Extra sale prices span the whole row: the sheet is already wider than
      // the screen, so they get a band instead of two more columns.
      '<div class="qe-cell qe-col-extras" id="qeExtras_' + row.uid + '">' + extrasBandHTML(row) + '</div>';
    cont.appendChild(el);
    applyRowLayout(el);
    paintPriceMarks(row);
    refreshRowState(row);
    applyCentFormatting();
  }

  function extrasBandHTML(row) {
    if (typeof ExtraPrices === 'undefined' || !ExtraPrices) return '';
    var html = ExtraPrices.inputsHTML(extrasScope(row), { extraPrices: row.extras });
    if (!html) return '';
    return '<div class="extra-price-section">' +
      '<div class="extra-price-section-title"><i class="fas fa-tags"></i> ' + escHtml(_t('extraPrices')) + '</div>' +
      html + '</div>';
  }

  // One scope per row so a value typed on line 3 is never read by line 1.
  function extrasScope(row) { return 'qe' + row.uid; }

  function refreshExtrasBand(row) {
    var cell = document.getElementById('qeExtras_' + row.uid);
    if (cell) cell.innerHTML = extrasBandHTML(row);
    sortExtraBand(document.getElementById('qeRow_' + row.uid));
    paintPriceMarks(row);
    applyCentFormatting();
  }

  function readExtras(row) {
    if (typeof ExtraPrices === 'undefined' || !ExtraPrices) return {};
    return ExtraPrices.readInputs(extrasScope(row));
  }

  // Row values over the product's own map, so a field added after this row was
  // painted (empty inputs) never wipes prices already stored on the product.
  function mergeExtras(row, prod) {
    return Object.assign({}, (prod && prod.extraPrices) || {}, readExtras(row));
  }

  /* lock/unlock the detail columns for existing vs new product */
  function applyDetailInputs(row, disabled) {
    var map = { brandId: 'qeBrand_', reference: 'qeReference_', plu: 'qePlu_', barcode: 'qeBarcode_', countryOfOrigin: 'qeCountry_', mark: 'qeMark_', storageLocation: 'qeStorage_', expiryDate: 'qeExpiry_' };
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
     qty is editable there, exactly like the classic edit screen.
     The extra sale-price band is deliberately NOT locked: it is an attribute of
     the product, never of the invoice line, so the operator can fill it while
     editing (that is the only place its values are ever entered). */
  function lockPriceInputs(row, locked) {
    var map = ['qeBuy_', 'qePdisc_', 'qeSell_', 'qeWhole_'];
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
    // The scale code belongs to the card that was un-selected, not to this new
    // product — carrying it over would hand one article's PLU to another.
    var pluInp = document.getElementById('qePlu_' + uid);
    if (pluInp) { pluInp.value = ''; row.plu = ''; }
    // Un-selecting a product must also drop its sale floor: a floor belongs to
    // that article, never to the new one the operator is about to type.
    row.minPrice = 0;
    var minInp = document.getElementById('qeMinPrice_' + uid);
    if (minInp) minInp.value = 0;
    row.extras = {};
    refreshExtrasBand(row);
    var nameInp = document.querySelector('#qeRow_' + uid + ' .qe-prod-search');
    if (nameInp) nameInp.focus();
    refreshRowState(row);
  }

  function setField(uid, field, value) {
    var row = findRow(uid); if (!row) return;
    if (field === 'pdisc') value = clampPct(value);
    row[field] = value;
    // Tiered auto-fill: typing a sale/wholesale/minimum price locks ONLY that
    // cell; editing the buy price recalculates the unlocked (auto-filled) ones.
    if (typeof FormLayout !== 'undefined' && FormLayout.enabled()) {
      if (field === 'sell' || field === 'whole' || field === 'minPrice') {
        FormLayout.lockPrice(FormLayout.priceState(row), field);
        paintPriceMarks(row);
      } else if (field === 'buy') {
        autoFillRow(row, 'buy');
      }
    }
  }
  function clampPct(v) { return Math.min(100, Math.max(0, parseFloat(v) || 0)); }
  // Product-level real cost only (the edited invoice's own global discount is
  // re-applied later by the invoice edit screen, not here).
  function rowRealCost(row) {
    var buy = parseFloat(row.buy) || 0;
    var pct = clampPct(row.pdisc);
    if (typeof PurchaseCore !== 'undefined' && PurchaseCore && PurchaseCore.compute) {
      return PurchaseCore.compute([{ qty: 1, buyPrice: buy, purchaseDiscountPct: pct }], 'percent', 0).lines[0].realBuyPrice;
    }
    return Math.round(buy * (1 - pct / 100) * 100) / 100;
  }
  function normalizePdisc(uid, input) {
    var row = findRow(uid); if (!row || !input) return;
    var v = clampPct(input.value);
    row.pdisc = v;
    input.value = v;
    updateTotal();
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
      var pluInp = document.getElementById('qePlu_' + uid);
      if (pluInp) { pluInp.value = ''; row.plu = ''; }
      // Leaving the selected product drops its floor with the rest of its data.
      row.minPrice = 0;
      var minInp = document.getElementById('qeMinPrice_' + uid);
      if (minInp) minInp.value = 0;
      row.extras = {};
      refreshExtrasBand(row);
    }
    // Invoice-edit mode: changing the product on a prefilled row turns it into a
    // normal "add" row (the original invoice/staged line stays untouched — it is
    // then dropped only if the user deletes this row).
    if (row._src) {
      row._src = null; row._itemIdx = null; row._stagedIdx = null; row._origQty = null;
      lockPriceInputs(row, false);
    }
    searchProduct(val, uid);
    refreshRowState(row);
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
    row.pdisc = clampPct(p.purchaseDiscountPct);
    row.sell = p.sellPrice || 0;
    row.whole = p.wholesalePrice || 0;
    row.brandId = p.brandId || '';
    row.reference = p.reference || '';
    row.plu = p.plu || '';
    row.countryOfOrigin = p.countryOfOrigin || '';
    row.mark = p.mark || '';
    row.storageLocation = p.storageLocation || '';
    row.family = p.family || '';
    row.expiryDate = p.expiryDate || '';
    // Show the stored floor so editing it here updates that product's floor
    // instead of silently sending 0 (which never wipes an existing value).
    row.minPrice = Math.max(0, parseFloat(p.minPrice) || 0);
    row.barcode = p.barcode || '';
    row.unit = Unit.normalize(p.unit);
    row.unitLabel = (row.unit === 'custom') ? (p.unitLabel || '') : '';
    row.extras = (p.extraPrices && typeof p.extraPrices === 'object') ? Object.assign({}, p.extraPrices) : {};
    // A different product means a fresh set of prices: clear per-cell locks so
    // a lock left over from the previous article cannot block auto-fill here.
    if (typeof FormLayout !== 'undefined') row._priceState = { locked: {}, auto: {} };
    refreshRowInputs(row);
    refreshExtrasBand(row);
    applyDetailInputs(row, true);
    refreshRowState(row);
    document.getElementById('qeProdResults_' + uid).innerHTML = '';
    updateTotal();
    autoFillRow(row, 'toggle');
  }

  function refreshRowInputs(row) {
    var el = document.getElementById('qeRow_' + row.uid); if (!el) return;
    var search = el.querySelector('.qe-prod-search'); if (search) search.value = row.name;
    var setVal = function (col, v) { var i = el.querySelector('[data-col="' + col + '"]'); if (i) i.value = v; };
    setVal('qty', row.qty); setVal('buy', row.buy); setVal('pdisc', parseFloat(row.pdisc) || 0); setVal('sell', row.sell); setVal('whole', row.whole);
    setVal('brand', row.brandId); setVal('reference', row.reference);
    setVal('plu', row.plu);
    setVal('barcode', row.barcode);
    setVal('country', row.countryOfOrigin); setVal('mark', row.mark); setVal('storage', row.storageLocation);
    setVal('family', row.family || '');
    setVal('expiry', row.expiryDate || '');
    // The sale floor follows the row that owns it: prefilled from the selected
    // product, cleared again when the row turns into a brand-new product.
    setVal('minPrice', row.minPrice || 0);
    unitRedraw(row, false);
    applyCentFormatting();
  }

  function deleteRow(uid) {
    _qeRows = _qeRows.filter(function (r) { return r.uid !== uid; });
    var el = document.getElementById('qeRow_' + uid); if (el) el.remove();
    if (_qeRows.length === 0) addRow();
    renumberRows();
    updateTotal();
  }

  /* ---------- keyboard ---------- */
  function onQeKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    // "i" reveals the hidden cost breakdown — ignored while typing in a field.
    if ((e.code === 'KeyI' || e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      var t = e.target;
      var tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      e.preventDefault();
      toggleDiscReveal();
      return;
    }
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
      if (!navKeyOf(inp)) return;
      e.preventDefault();
      navigate(inp, e.key);
    }
  }
  // A row's keyboard path is its grid columns and then the extra sale-price
  // band as a tail, so the fields added after QE_COLS was written are reachable.
  function navKeyOf(el) {
    if (!el || !el.dataset) return null;
    if (el.dataset.col) return 'col:' + el.dataset.col;
    if (el.dataset.extraPriceId) return 'extra:' + el.dataset.extraPriceId;
    return null;
  }
  function rowNavEls(rowEl) {
    var out = [];
    for (var i = 0; i < QE_COLS.length; i++) {
      var cell = rowEl.querySelector('[data-col="' + QE_COLS[i] + '"]');
      if (cell) out.push(cell);
    }
    var band = rowEl.querySelector('.qe-col-extras');
    if (band) {
      var inputs = band.querySelectorAll('input');
      for (var j = 0; j < inputs.length; j++) out.push(inputs[j]);
    }
    return out;
  }
  function findNavKeyIn(rowEl, key) {
    if (key.indexOf('col:') === 0) return rowEl.querySelector('[data-col="' + key.slice(4) + '"]');
    var band = rowEl.querySelector('.qe-col-extras');
    return band ? band.querySelector('[data-extra-price-id="' + key.slice(6) + '"]') : null;
  }
  function navigate(inp, key) {
    var rowEl = inp.closest('.qe-row'); if (!rowEl) return;
    var cells = rowNavEls(rowEl);
    var ci = cells.indexOf(inp);
    if (ci < 0) return;
    var ri = _qeRows.findIndex(function (r) { return r.uid === parseInt(rowEl.dataset.uid, 10); });
    if (ri < 0) return;
    // In RTL the first cell sits on the right, so Right walks back; in LTR it
    // walks forward. Vertical arrows are direction-independent.
    var rtl = (typeof window.isRTL === 'function') ? window.isRTL() : ((window.__lang || 'ar') === 'ar');
    if (key === 'ArrowRight') ci = rtl ? Math.max(0, ci - 1) : Math.min(cells.length - 1, ci + 1);
    else if (key === 'ArrowLeft') ci = rtl ? Math.min(cells.length - 1, ci + 1) : Math.max(0, ci - 1);
    else if (key === 'ArrowUp') ri = Math.max(0, ri - 1);
    else if (key === 'ArrowDown') ri = Math.min(_qeRows.length - 1, ri + 1);
    var targetRow = _qeRows[ri]; if (!targetRow) return;
    var targetEl = document.getElementById('qeRow_' + targetRow.uid); if (!targetEl) return;
    var targetCells = rowNavEls(targetEl);
    // A vertical move keeps the cashier on the same field; a horizontal move
    // steps along the path, so the extra-price band sits right after `expiry`.
    var next = (key === 'ArrowUp' || key === 'ArrowDown')
      ? (findNavKeyIn(targetEl, navKeyOf(inp)) || targetCells[ci])
      : targetCells[ci];
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

  /* ---------- scanner (USB keyboard + phone bridge) ---------- */
  // A blank line is one the operator has not touched yet: no product, no name,
  // no barcode, and not a prefilled invoice-edit line.
  function isBlankRow(r) {
    return !!r && !r.productId && !r._src &&
      !String(r.name || '').trim() && !String(r.barcode || '').trim();
  }

  function findBlankRow() {
    for (var i = 0; i < _qeRows.length; i++) if (isBlankRow(_qeRows[i])) return _qeRows[i];
    return null;
  }

  function flashRow(uid) {
    var el = document.getElementById('qeRow_' + uid);
    if (!el) return;
    var prev = el.style.background;
    el.style.background = 'rgba(40,167,69,.14)';
    if (typeof setTimeout === 'function') {
      setTimeout(function () { el.style.background = prev || ''; }, 900);
    }
  }

  function setScanStatus(text, kind) {
    var el = document.getElementById('qeScanStatus');
    if (!el) return;
    el.textContent = text || _t('scanReady');
    el.style.color = kind === 'ok' ? '#28a745' : (kind === 'warn' ? '#f39c12' : '#888');
    if (typeof clearTimeout === 'function') clearTimeout(setScanStatus._t);
    if (typeof setTimeout !== 'function') return;
    setScanStatus._t = setTimeout(function () {
      var again = document.getElementById('qeScanStatus');
      if (again) { again.textContent = _t('scanReady'); again.style.color = '#888'; }
    }, 3500);
  }

  // Resolve one scanned code against the catalogue:
  //  - existing product already on the sheet  → +1 qty on its line
  //  - existing product not on the sheet      → fill the first blank line
  //  - unknown code                           → a "new product" line with the
  //                                             barcode already filled in
  function scanProduct(code) {
    var raw = code == null ? '' : String(code);
    var cleaned = (typeof window.cleanScannedCode === 'function')
      ? window.cleanScannedCode(raw, { scanner: true })
      : raw.replace(/[\r\n\t]/g, '').trim();
    if (!cleaned) return { ok: false };

    var prod = findByBarcode(cleaned);
    if (!prod && typeof DB.getProductByBarcode === 'function') prod = DB.getProductByBarcode(cleaned);

    if (prod) {
      var existing = null;
      for (var i = 0; i < _qeRows.length; i++) {
        if (_qeRows[i].productId === prod.id) { existing = _qeRows[i]; break; }
      }
      if (existing) {
        existing.qty = (parseFloat(existing.qty) || 0) + 1;
        refreshRowInputs(existing);
        updateTotal();
        flashRow(existing.uid);
        setScanStatus(_t('scanIncremented') + ': ' + prod.name, 'ok');
        return { ok: true, product: prod, row: existing, incremented: true };
      }

      var target = findBlankRow();
      if (!target) { addRow(); target = _qeRows[_qeRows.length - 1]; }
      selectProduct(target.uid, prod.id);
      flashRow(target.uid);
      // Leave a fresh empty line ready for the next scan, but keep the caret in
      // the scanner field so scanning never interrupts the operator's flow.
      if (!findBlankRow()) {
        addRow();
        var scanInp = document.getElementById('qeScanInput');
        if (scanInp) { try { scanInp.focus(); } catch (e) {} }
      }
      updateTotal();
      setScanStatus(_t('scanAdded') + ': ' + prod.name, 'ok');
      return { ok: true, product: prod, row: target };
    }

    var newRow = findBlankRow();
    if (!newRow) { addRow(); newRow = _qeRows[_qeRows.length - 1]; }
    setNewMode(newRow.uid);
    newRow.name = '';
    newRow.barcode = cleaned;
    var nameInp = document.querySelector('#qeRow_' + newRow.uid + ' .qe-prod-search');
    if (nameInp) nameInp.value = '';
    var barInp = document.getElementById('qeBarcode_' + newRow.uid);
    if (barInp) barInp.value = cleaned;
    flashRow(newRow.uid);
    setScanStatus(_t('scanNew') + ' — ' + cleaned, 'warn');
    return { ok: true, product: null, row: newRow, barcode: cleaned };
  }

  function handleScanKey(e) {
    if (!e || (e.key !== 'Enter' && e.keyCode !== 13)) return;
    e.preventDefault();
    var inp = document.getElementById('qeScanInput');
    var code = inp ? inp.value : '';
    scanProduct(code);
    if (inp) { inp.value = ''; try { inp.focus(); } catch (err) {} }
  }

  // Fallback for the phone bridge when no mapped field was available. The
  // bridge normally injects into qeScanInput and fires Enter, so this listener
  // only covers the "target missing" path and never double-adds a product.
  function onRemoteScan(ev) {
    if (!isOpen()) return;
    var detail = ev && ev.detail;
    if (!detail || !detail.code || detail.ignored) return;
    scanProduct(detail.code);
  }

  /* ---------- purchase discount (per line + whole invoice) ---------- */
  function discValue() {
    var el = document.getElementById('qeDiscValue');
    return parseFloat(el && el.value) || 0;
  }

  function discModeLabel(computed) {
    if (computed.mode === 'amount') return _t('invoiceDiscount') + ' (' + _t('fixedAmount') + ')';
    return _t('invoiceDiscount') + ' (' + fmtMoney(computed.value) + '%)';
  }

  // One shared computation for the live footer and the final confirm, so what
  // the operator sees is exactly what gets saved.
  function computeTotals() {
    var items = _qeRows.map(function (r) {
      return {
        qty: Unit.roundQty(Unit.parse(r.qty)),
        buyPrice: parseFloat(r.buy) || 0,
        purchaseDiscountPct: clampPct(r.pdisc)
      };
    });
    if (typeof PurchaseCore !== 'undefined' && PurchaseCore && PurchaseCore.compute) {
      return PurchaseCore.compute(items, _qeDiscMode, discValue());
    }
    // Defensive fallback: never break entry if the shared core is missing.
    var lines = items.map(function (it, i) {
      var gross = Math.round((it.qty * it.buyPrice) * 100) / 100;
      return {
        index: i, qty: it.qty, buyPrice: it.buyPrice, purchaseDiscountPct: 0,
        gross: gross, productDiscount: 0, afterProduct: gross,
        globalDiscount: 0, realTotal: gross, realBuyPrice: it.buyPrice
      };
    });
    var total = Math.round(lines.reduce(function (s, l) { return s + l.realTotal; }, 0) * 100) / 100;
    return {
      mode: 'percent', value: 0, gross: total, productDiscountAmount: 0,
      subtotal: total, globalDiscountAmount: 0, total: total, lines: lines
    };
  }

  function setDiscMode(mode) {
    _qeDiscMode = (mode === 'amount') ? 'amount' : 'percent';
    var pctBtn = document.getElementById('qeDiscModePct');
    var amtBtn = document.getElementById('qeDiscModeAmt');
    if (pctBtn) pctBtn.classList.toggle('is-active', _qeDiscMode === 'percent');
    if (amtBtn) amtBtn.classList.toggle('is-active', _qeDiscMode === 'amount');
    updateTotal();
  }

  // "i" reveals the cost breakdown inside this window only (never printed).
  function toggleDiscReveal(force) {
    var on = (force === undefined) ? !document.body.classList.contains('qe-disc-on') : !!force;
    document.body.classList.toggle('qe-disc-on', on);
    var btn = document.getElementById('qeRevealBtn');
    if (btn) {
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    return on;
  }

  function updateTotal() {
    var computed = computeTotals();
    var el = document.getElementById('qeTotal');
    if (el) el.innerHTML = '<span>' + escHtml(_t('total')) + ':</span> DA' + fmtMoney(computed.total);

    var sumEl = document.getElementById('qeDiscSummary');
    if (sumEl) {
      sumEl.innerHTML =
        '<div class="pur-sum-row"><span>' + escHtml(_t('grossTotal')) + '</span><b>DA' + fmtMoney(computed.gross) + '</b></div>' +
        '<div class="pur-sum-row"><span>' + escHtml(_t('productDiscount')) + '</span><b>DA' + fmtMoney(computed.productDiscountAmount) + '</b></div>' +
        '<div class="pur-sum-row"><span>' + escHtml(discModeLabel(computed)) + '</span><b>DA' + fmtMoney(computed.globalDiscountAmount) + '</b></div>' +
        '<div class="pur-sum-row pur-sum-real"><span>' + escHtml(_t('realTotal')) + '</span><b>DA' + fmtMoney(computed.total) + '</b></div>';
    }

    // Per-line real cost chips (hidden until "i") and the live purchase amount
    // (الكمية × سعر الشراء) that the toolbar button reveals.
    for (var i = 0; i < _qeRows.length; i++) {
      var chip = document.getElementById('qeReal_' + _qeRows[i].uid);
      var line = computed.lines[i];
      if (chip) chip.textContent = 'DA' + fmtMoney(line ? line.realBuyPrice : 0);
      var amtEl = document.getElementById('qeAmount_' + _qeRows[i].uid);
      if (amtEl) amtEl.textContent = 'DA' + fmtMoney((parseFloat(_qeRows[i].qty) || 0) * (parseFloat(_qeRows[i].buy) || 0));
    }
    updatePayPreview();
  }

function updatePayPreview() {
    var el = document.getElementById('qePayPreview');
    if (!el) return;
    var total = (typeof computeTotals === 'function') ? (computeTotals().total || 0) : 0;
    // The paid-amount input is optional in this layout; when it is absent the
    // invoice is simply unpaid, never a thrown null dereference.
    var paidEl = document.getElementById('qePaidAmount');
    var paid = paidEl ? (parseFloat(paidEl.value) || 0) : 0;
    if (paid < 0) paid = 0;
    if (paid > total) paid = total;
    var debt = Math.max(0, total - paid);
    el.textContent = _t('remaining') + ': DA' + fmtMoney(debt);
  }
  function refreshFieldVisibility() { if (typeof FV !== 'undefined' && FV.apply) FV.apply(); }
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
    var payBlock = document.querySelector('.qe-pay-block');
    var subSpan = document.querySelector('.page-header-content p [data-i18n="quickEntry.subtitle"]');
    var confirmBtn = document.getElementById('qeConfirmBtn');
    var discCtrl = document.getElementById('qeDiscCtrl');
    var old = document.getElementById('qeInvBanner');
    if (old) old.remove();
    if (_qeInvMode) {
      if (supBar) supBar.style.display = 'none';
      if (timbre) timbre.style.display = 'none';
      // The invoice being edited is paid from its own edit screen, not here.
      if (payBlock) payBlock.style.display = 'none';
      // The invoice being edited already owns its global discount; the per-line
      // discount stays editable for the lines added here.
      if (discCtrl) discCtrl.style.display = 'none';
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
      if (payBlock) payBlock.style.display = '';
      if (discCtrl) discCtrl.style.display = '';
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
    var paidEl = document.getElementById('qePaidAmount'); if (paidEl) paidEl.value = '0';
    paintCentBtn();
    if (paidEl && centOn()) paidEl.value = CentFormat.format(paidEl.value);
    _qeDiscMode = 'percent';
    var discVal = document.getElementById('qeDiscValue'); if (discVal) discVal.value = '0';
    var pctBtn = document.getElementById('qeDiscModePct'); if (pctBtn) pctBtn.classList.add('is-active');
    var amtBtn = document.getElementById('qeDiscModeAmt'); if (amtBtn) amtBtn.classList.remove('is-active');
    toggleDiscReveal(false);
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
          reference: d.reference || '', plu: d.plu || '', countryOfOrigin: d.countryOfOrigin || '', mark: d.mark || '',
          storageLocation: d.storageLocation || '', family: d.family || '', expiryDate: d.expiryDate || '',
          qty: d.qty != null ? d.qty : 1, buy: d.price != null ? d.price : 0,
          pdisc: clampPct(d.purchaseDiscountPct), sell: d.sell || 0, whole: d.whole || 0,
          extras: (d.extraPrices && typeof d.extraPrices === 'object') ? Object.assign({}, d.extraPrices) : {},
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
      // The invoice already owns its whole-invoice discount (the control stays
      // hidden in edit mode), so mirror it here: the footer total then matches
      // the net that saveInvEdit will compute with the stored discount.
      _qeDiscMode = (prefill.discMode === 'amount') ? 'amount' : 'percent';
      var pDiscVal = document.getElementById('qeDiscValue');
      if (pDiscVal) pDiscVal.value = String(parseFloat(prefill.discValue) || 0);
      applyInvoiceModeUI();
      applyExpirySettings();
      applyFamilySettings();
      updateTotal();
      applyQELayout();
      bindGridInteractions();
      return;
    }
    applyInvoiceModeUI();
    addRow();
    applyExpirySettings();
    applyFamilySettings();
    updateTotal();
    applyQELayout();
    bindGridInteractions();
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
  // A PLU is the number the scale asks for at the till, so one code may name
  // exactly one article: a code already on another card — or typed twice in the
  // same receipt — would make every weighed scan ambiguous. Refuse the whole
  // entry before any product is written, like a duplicate barcode, and put the
  // focus back on the field the operator got wrong.
  function checkPluClashes() {
    if (typeof DB.findProductsByPlu !== 'function') return true;
    var fold = (typeof ScaleCore !== 'undefined' && ScaleCore && ScaleCore.pluKey) ? ScaleCore.pluKey : null;
    var seen = {};
    for (var i = 0; i < _qeRows.length; i++) {
      var row = _qeRows[i];
      // Existing cards keep their own code (its field is locked here), and a
      // prefilled edit line already passed this check when it was staged, so
      // only the rows that will create a product can introduce a clash.
      if (row.mode === 'existing' || row._src) continue;
      var plu = String(row.plu || '').trim();
      if (!plu) continue;
      var k = fold ? fold(plu) : plu;
      if (!k) continue;
      var hits = DB.findProductsByPlu(plu) || [];
      var other = seen[k];
      for (var h = 0; !other && h < hits.length; h++) {
        if (hits[h].id !== row.productId) other = hits[h];
      }
      if (other) {
        alert(((typeof t === 'function') ? t('inventory.pluConflict') : 'هذا الرمز مستعمل لدى منتج آخر') +
          ': ' + (other.name || '') + ' (' + (other.barcode || '-') + ')');
        var inp = document.getElementById('qePlu_' + row.uid);
        if (inp) { inp.focus(); try { inp.select(); } catch (e) {} }
        return false;
      }
      seen[k] = row;
    }
    return true;
  }

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

    if (!checkPluClashes()) return;

    for (var i = 0; i < _qeRows.length; i++) {
      var r = _qeRows[i];
      if (r.mode === 'search') {
        if (!r.name || !r.name.trim()) { alert(_t('emptyWarn')); return; }
        r.mode = 'new';
        if (!r.barcode) r.barcode = (DB.generateBarcode ? DB.generateBarcode() : ('P' + Date.now()));
      }
    }

    var computed = computeTotals();
    var totalAmount = computed.total;
    var invoiceItems = [];
    var suppliers = DB.getSuppliers() || [];
    var supIdx = suppliers.findIndex(function (s) { return s.id === _qeSupplierId; });

    // الدفع سندٌ على المورّد: بلا مورّد لا رصيد يُخصم ولا دفعة تُسجَّل، فالتاريخ
    // أن يُكتب المبلغ ويختفي. نوقف التأكيد ونعيد المؤشر إلى الحقل الناقص.
    var paidNow = 0;
    var qePaidEl = document.getElementById('qePaidAmount');
    if (qePaidEl) {
      paidNow = parseFloat(qePaidEl.value) || 0;
      if (paidNow < 0) paidNow = 0;
      if (paidNow > totalAmount) paidNow = totalAmount;
    }
    if (paidNow > 0 && supIdx === -1) {
      alert(_t('needSupplierForPay'));
      var paySupInp = document.getElementById('qeSupplierSearch');
      if (paySupInp) { try { paySupInp.focus(); } catch (e) {} }
      return;
    }

    // Set when a stock write is rejected (out-of-scope / missing) so the invoice
    // below is NOT saved while quantities went unapplied.
    var qeBlocked = null;

    for (var j = 0; j < _qeRows.length; j++) {
      var row = _qeRows[j];
      var qty = Unit.roundQty(Unit.parse(row.qty));
      var buy = parseFloat(row.buy) || 0;
      var sell = parseFloat(row.sell) || 0;
      var whole = parseFloat(row.whole) || 0;
      var pdisc = clampPct(row.pdisc);
      var extras = readExtras(row);
      var line = computed.lines[j] || {};
      var realBuyPrice = (line.realBuyPrice != null) ? line.realBuyPrice : Math.round(buy * (1 - pdisc / 100) * 100) / 100;
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
            extraPrices: mergeExtras(row, prod),
            purchaseDiscountPct: pdisc, realBuyPrice: realBuyPrice,
            quantity: qty, supplierId: _qeSupplierId,
            unit: row.unit, unitLabel: row.unitLabel,
            reference: row.reference || '',
            plu: row.plu || '',
            countryOfOrigin: row.countryOfOrigin || '',
            mark: row.mark || '',
            minPrice: (parseFloat(row.minPrice) || 0),
            storageLocation: row.storageLocation || '',
            family: row.family || '',
            expiryDate: row.expiryDate || ''
          }, { source: 'quick-entry-existing' });
          if (mergeRes && mergeRes.ok) {
            prod = mergeRes.product;
          } else {
            var ures = DB.updateProduct(prod.id, { quantity: (parseFloat(prod.quantity) || 0) + qty, supplierId: _qeSupplierId || prod.supplierId, family: row.family || '', minPrice: (parseFloat(row.minPrice) || prod.minPrice || 0), extraPrices: mergeExtras(row, prod) });
            if (ures && ures.ok === false) qeBlocked = ures.reason;
          }
        } else {
          var ures2 = DB.updateProduct(prod.id, { quantity: (parseFloat(prod.quantity) || 0) + qty, supplierId: _qeSupplierId || prod.supplierId, family: row.family || '', minPrice: (parseFloat(row.minPrice) || prod.minPrice || 0), extraPrices: mergeExtras(row, prod) });
          if (ures2 && ures2.ok === false) qeBlocked = ures2.reason;
        }
      } else {
        var res = DB.addOrMergeProduct({
          name: row.name.trim(),
          barcode: (row.barcode || '').trim() || (DB.generateBarcode ? DB.generateBarcode() : ('P' + Date.now())),
          brandId: row.brandId || '',
          buyPrice: buy, sellPrice: sell, wholesalePrice: whole,
          extraPrices: extras,
          purchaseDiscountPct: pdisc, realBuyPrice: realBuyPrice,
          quantity: qty, supplierId: _qeSupplierId,
          unit: row.unit, unitLabel: row.unitLabel,
          reference: row.reference || '',
          plu: row.plu || '',
          countryOfOrigin: row.countryOfOrigin || '',
          mark: row.mark || '',
          // Without this line the field was painted but never persisted, so the
          // sales page had no floor to enforce.
          minPrice: Math.max(0, parseFloat(row.minPrice) || 0),
          storageLocation: row.storageLocation || '',
          family: row.family || '',
          expiryDate: row.expiryDate || ''
        }, { source: 'quick-entry-new' });
        if (!res.ok) { alert(_t('barcodeConflict') + ': ' + (res.existing ? res.existing.name : '')); return; }
        prod = res.product;
      }
      var itemTotal = qty * buy;
      invoiceItems.push(Object.assign({
        productId: prod.id, barcode: prod.barcode, name: prod.name,
        qty: qty, price: buy, total: itemTotal,
        // Displayed buy price stays on the printed invoice; the real cost is
        // hidden and stripped from print (feature 5).
        purchaseDiscountPct: pdisc,
        realBuyPrice: realBuyPrice,
        realTotal: (line.realTotal != null) ? line.realTotal : itemTotal,
        globalDiscount: line.globalDiscount || 0
      }, Unit.snapshot(prod || row)));
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

    var _qeInv = DB.addInvoice(Object.assign({
      supplierId: _qeSupplierId || null, type: _qeSupplierId ? 'supplier' : 'purchase',
      date: Date.now(), items: invoiceItems, totalAmount: totalAmount, timbreFiscal: timbreFiscal
    }, {
      purchaseDiscountMode: computed.mode,
      purchaseDiscountValue: computed.value,
      purchaseDiscountAmount: computed.globalDiscountAmount,
      purchaseProductDiscount: computed.productDiscountAmount,
      purchaseGross: computed.gross
    }));
    // paidNow was clamped (and the supplier guard run) before any write above.
    if (supIdx !== -1) {
      suppliers[supIdx].balance = (parseFloat(suppliers[supIdx].balance) || 0) + (totalAmount - paidNow);
      DB.saveSuppliers(suppliers);
      if (paidNow > 0) {
        try {
          DB.addPayment({
            supplierId: _qeSupplierId,
            invoiceId: _qeInv && _qeInv.id ? _qeInv.id : undefined,
            amount: paidNow,
            method: 'cash',
            note: 'دفعة عند الإدخال السريع',
          });
        } catch (e) {}
      }
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

    if (!checkPluClashes()) return;

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
        var addReal = rowRealCost(row);
        additions.push({
          productId: row.productId, barcode: row.barcode || '', name: row.name, qty: qty,
          price: parseFloat(row.buy) || 0, unit: row.unit, unitLabel: row.unitLabel,
          extraPrices: readExtras(row),
          purchaseDiscountPct: clampPct(row.pdisc), realBuyPrice: addReal,
          realTotal: Math.round(addReal * qty * 100) / 100
        });
      } else {
        // Brand-new product: the payload is created at SAVE time on the edit
        // screen (no orphan product if the edit is abandoned).
        var addRealNew = rowRealCost(row);
        var payload = {
          name: (row.name || '').trim(), barcode: (row.barcode || '').trim(), brandId: row.brandId || '',
          buyPrice: parseFloat(row.buy) || 0, sellPrice: parseFloat(row.sell) || 0, wholesalePrice: parseFloat(row.whole) || 0,
          extraPrices: readExtras(row),
          purchaseDiscountPct: clampPct(row.pdisc), realBuyPrice: addRealNew,
          unit: row.unit, unitLabel: row.unitLabel,
          reference: row.reference || '', plu: row.plu || '', countryOfOrigin: row.countryOfOrigin || '', mark: row.mark || '',
          minPrice: (parseFloat(row.minPrice) || 0),
          storageLocation: row.storageLocation || '', family: row.family || '', expiryDate: row.expiryDate || ''
        };
        additions.push({
          payload: payload, qty: qty, price: payload.buyPrice,
          purchaseDiscountPct: clampPct(row.pdisc), realBuyPrice: addRealNew,
          realTotal: Math.round(addRealNew * qty * 100) / 100
        });
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
    // Phone-scanner fallback (the bridge normally injects into qeScanInput).
    trackPageListener('zmt-phs-scan', onRemoteScan);
    var scan = document.getElementById('qeScanInput');
    if (scan && !scan._zmtCleanBound) {
      scan._zmtCleanBound = true;
      scan.addEventListener('input', function () {
        var cleaned = (typeof window.cleanScannedCode === 'function')
          ? window.cleanScannedCode(this.value, { scanner: true })
          : this.value;
        if (cleaned !== this.value) this.value = cleaned;
      });
    }
    // ".00" is applied when a money field is committed (blur / arrow keys),
    // never on every keystroke — otherwise typing "1" would become "1.00"
    // and the next digit would land after the decimals ("1.003").
    var grid = document.getElementById('qeRows');
    if (grid && !grid._zmtCentBound) {
      grid._zmtCentBound = true;
      grid.addEventListener('focusout', function (e) {
        if (!centOn() || !isQeMoneyInput(e.target) || e.target.value === '') return;
        var f = CentFormat.format(e.target.value);
        if (f) e.target.value = f;
      });
    }
    var paid = document.getElementById('qePaidAmount');
    if (paid && !paid._zmtCentBound) {
      paid._zmtCentBound = true;
      paid.addEventListener('focusout', function () {
        if (!centOn() || this.value === '') return;
        var f = CentFormat.format(this.value);
        if (f) this.value = f;
      });
    }
    open();
    applyAmountVisibility();
    setScanStatus(_t('scanReady'), 'idle');
    if (typeof FV !== 'undefined' && FV.apply) FV.apply();
  };

  /* ---------- shared field layout: order / widths / tiered auto-fill ----- */
  // Header, rows and the CSS tracks are all rebuilt from one stored order and
  // one stored width per column. # and delete stay pinned at the two ends;
  // FV-hidden cells keep their slot in the order but are never emitted anew.
  var _qeGridBound = false;

  function qeNativeCols() {
    var head = document.querySelector('.qe-grid-head');
    if (!head || typeof FormLayout === 'undefined') return [];
    var keys = [];
    var cells = head.querySelectorAll('[data-col]');
    for (var i = 0; i < cells.length; i++) {
      var k = cells[i].getAttribute('data-col');
      if (keys.indexOf(k) < 0) keys.push(k);
    }
    return FormLayout.sortKeys(keys, FormLayout.PAGE_QE);
  }

  function reorderChildren(parent, cols) {
    if (!parent) return;
    var byCol = {};
    var kids = Array.prototype.slice.call(parent.children || []);
    kids.forEach(function (ch) {
      if (ch.getAttribute) {
        // Row wrappers use data-col-cell so they never shadow the real inputs'
        // data-col lookups; the header still uses plain data-col.
        var k = ch.getAttribute('data-col-cell') || ch.getAttribute('data-col');
        if (k) byCol[k] = ch;
      }
    });
    cols.forEach(function (k) { if (byCol[k]) parent.appendChild(byCol[k]); });
    // The extra-price band has no data-col (it spans the whole row); it always
    // stays last so CSS grid never pushes an empty strip into the middle.
    kids.forEach(function (ch) {
      var k = ch.getAttribute ? (ch.getAttribute('data-col-cell') || ch.getAttribute('data-col')) : null;
      if (!k || cols.indexOf(k) < 0) parent.appendChild(ch);
    });
  }

  function sortExtraBand(rowEl) {
    if (!rowEl || typeof FormLayout === 'undefined') return;
    var bands = rowEl.querySelectorAll('.qe-col-extras .extra-price-grid');
    for (var b = 0; b < bands.length; b++) {
      var fields = bands[b].querySelectorAll('.extra-price-field');
      var ranked = [];
      for (var i = 0; i < fields.length; i++) {
        var inp = fields[i].querySelector('[data-extra-price-id]');
        var id = inp ? inp.getAttribute('data-extra-price-id') : '';
        var order = FormLayout.current().order;
        var rank = order.indexOf(FormLayout.extraKey(id));
        ranked.push({ el: fields[i], rank: rank < 0 ? 9999 : rank });
      }
      ranked.sort(function (a, c) { return a.rank - c.rank; });
      ranked.forEach(function (x) { bands[b].appendChild(x.el); });
    }
  }

  function applyRowLayout(rowEl) {
    if (typeof FormLayout === 'undefined') return;
    reorderChildren(rowEl, qeNativeCols());
    sortExtraBand(rowEl);
  }

  function applyQELayout() {
    if (typeof FormLayout === 'undefined') return;
    var cols = qeNativeCols();
    if (!cols.length) return;
    var opts = { amountOff: !showPurchaseAmount() };
    var tracks = FormLayout.tracksFor(FormLayout.PAGE_QE, cols, opts);
    var wrap = document.querySelector('.qe-grid-wrap');
    if (wrap) {
      wrap.style.setProperty('--qe-cols', tracks);
      wrap.style.setProperty('--qe-minw', FormLayout.minWidthFor(FormLayout.PAGE_QE, cols, opts) + 'px');
    }
    reorderChildren(document.querySelector('.qe-grid-head'), cols);
    var rows = document.querySelectorAll('#qeRows .qe-row');
    for (var i = 0; i < rows.length; i++) reorderChildren(rows[i], cols);
    for (var j = 0; j < rows.length; j++) sortExtraBand(rows[j]);
    updateAutoBtn();
    paintCentBtn();
    applyCentFormatting();
  }

  function priceCell(row, key) {
    if (key === 'sell' || key === 'whole') {
      var inp = document.getElementById((key === 'sell' ? 'qeSell_' : 'qeWhole_') + row.uid);
      return inp ? inp.closest('.qe-cell') : null;
    }
    if (key === 'minPrice') {
      var minInp = document.getElementById('qeMinPrice_' + row.uid);
      return minInp ? minInp.closest('.qe-cell') : null;
    }
    if (FormLayout.isExtraKey(key)) {
      var extra = document.querySelector('[data-extra-scope="qe' + row.uid + '"][data-extra-price-id="' + FormLayout.extraId(key) + '"]');
      return extra ? extra.closest('.extra-price-field') : null;
    }
    return null;
  }
  function paintPriceMarks(row) {
    if (typeof FormLayout === 'undefined') return;
    var el = document.getElementById('qeRow_' + row.uid);
    if (!el) return;
    var cells = el.querySelectorAll('.qe-locked-price, .qe-auto-price');
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove('qe-locked-price', 'qe-auto-price');
    var st = FormLayout.priceState(row);
    ['sell', 'whole', 'minPrice'].forEach(function (k) {
      var c = priceCell(row, k); if (!c) return;
      if (st.locked[k]) c.classList.add('qe-locked-price');
      else if (st.auto[k]) c.classList.add('qe-auto-price');
    });
    var extras = (typeof ExtraPrices !== 'undefined' && ExtraPrices) ? ExtraPrices.fields() : [];
    extras.forEach(function (f) {
      var c = priceCell(row, FormLayout.extraKey(f.id)); if (!c) return;
      if (st.locked[FormLayout.extraKey(f.id)]) c.classList.add('qe-locked-price');
      else if (st.auto[FormLayout.extraKey(f.id)]) c.classList.add('qe-auto-price');
    });
  }

  function autoFillRow(row, mode) {
    if (typeof FormLayout === 'undefined' || !FormLayout.enabled() || !row) return 0;
    var st = FormLayout.priceState(row);
    var targets = [
      { key: 'sell', value: row.sell, set: function (v) {
        row.sell = v; var el = document.getElementById('qeSell_' + row.uid); if (el) el.value = v;
      } },
      { key: 'whole', value: row.whole, set: function (v) {
        row.whole = v; var el = document.getElementById('qeWhole_' + row.uid); if (el) el.value = v;
      } },
      { key: 'minPrice', value: row.minPrice, set: function (v) {
        row.minPrice = v; var el = document.getElementById('qeMinPrice_' + row.uid); if (el) el.value = v;
      } },
    ];
    var extras = (typeof ExtraPrices !== 'undefined' && ExtraPrices) ? ExtraPrices.fields() : [];
    extras.forEach(function (f) {
      var key = FormLayout.extraKey(f.id);
      var inp = document.querySelector('[data-extra-scope="qe' + row.uid + '"][data-extra-price-id="' + f.id + '"]');
      targets.push({ key: key, value: inp ? inp.value : ((row.extras || {})[f.id] || 0), set: function (v) {
        if (inp) inp.value = v;
        if (!row.extras || typeof row.extras !== 'object') row.extras = {};
        if (parseFloat(v) > 0) row.extras[f.id] = parseFloat(v); else delete row.extras[f.id];
      } });
    });
    var n = FormLayout.fillRow(parseFloat(row.buy) || 0, st, targets, mode);
    if (n) paintPriceMarks(row);
    return n;
  }

  function updateAutoBtn() {
    var btn = document.getElementById('qeAutoBtn');
    if (!btn || typeof FormLayout === 'undefined') return;
    var on = FormLayout.enabled();
    if (btn.classList) btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function toggleAutoFill() {
    if (typeof FormLayout === 'undefined') return;
    var on = !FormLayout.enabled();
    FormLayout.setLive({ autoFill: { enabled: on } });
    if (on) _qeRows.forEach(function (r) { autoFillRow(r, 'toggle'); });
    updateAutoBtn();
  }

  function openLayout() {
    if (typeof FormLayout !== 'undefined') FormLayout.open(FormLayout.PAGE_QE);
  }

  function placeRowsInDom() {
    var cont = document.getElementById('qeRows');
    if (!cont) return;
    _qeRows.forEach(function (r) {
      var el = document.getElementById('qeRow_' + r.uid);
      if (el) cont.appendChild(el);
    });
    renumberRows();
  }

  function moveRow(uid, dir) {
    var from = -1;
    for (var i = 0; i < _qeRows.length; i++) if (_qeRows[i].uid === uid) { from = i; break; }
    var to = from + (dir < 0 ? -1 : 1);
    if (from < 0 || to < 0 || to >= _qeRows.length) return;
    var moved = _qeRows.splice(from, 1)[0];
    _qeRows.splice(to, 0, moved);
    placeRowsInDom();
  }

  function reorderRows(fromUid, toUid) {
    var from = -1, to = -1;
    for (var i = 0; i < _qeRows.length; i++) {
      if (_qeRows[i].uid === fromUid) from = i;
      if (_qeRows[i].uid === toUid) to = i;
    }
    if (from < 0 || to < 0 || from === to) return;
    var moved = _qeRows.splice(from, 1)[0];
    _qeRows.splice(to, 0, moved);
    placeRowsInDom();
  }

  function bindGridInteractions() {
    if (_qeGridBound) return;
    var cont = document.getElementById('qeRows');
    if (!cont || !cont.addEventListener) return;
    _qeGridBound = true;
    var from = null;
    cont.addEventListener('dragstart', function (e) {
      var handle = e.target && e.target.closest ? e.target.closest('.fl-drag-handle') : null;
      var rowEl = handle ? handle.closest('.qe-row') : null;
      if (!rowEl) { if (e.preventDefault) e.preventDefault(); return; }
      from = parseInt(rowEl.getAttribute('data-uid'), 10);
      rowEl.classList.add('fl-row-drag');
      if (e.dataTransfer) { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(from)); } catch (x) {} }
    });
    cont.addEventListener('dragover', function (e) {
      var rowEl = e.target && e.target.closest ? e.target.closest('.qe-row') : null;
      if (rowEl && from != null && typeof rowEl.classList.add === 'function') {
        if (e.preventDefault) e.preventDefault();
        rowEl.classList.add('fl-row-over');
      }
    });
    cont.addEventListener('dragleave', function (e) {
      var rowEl = e.target && e.target.closest ? e.target.closest('.qe-row') : null;
      if (rowEl) rowEl.classList.remove('fl-row-over');
    });
    cont.addEventListener('drop', function (e) {
      var rowEl = e.target && e.target.closest ? e.target.closest('.qe-row') : null;
      if (!rowEl || from == null) return;
      if (e.preventDefault) e.preventDefault();
      reorderRows(from, parseInt(rowEl.getAttribute('data-uid'), 10));
      from = null;
    });
    cont.addEventListener('dragend', function () {
      from = null;
      var all = cont.querySelectorAll('.fl-row-drag, .fl-row-over');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('fl-row-drag', 'fl-row-over');
    });
    // A hand-typed extra price locks only that one cell.
    cont.addEventListener('input', function (e) {
      var el = e.target;
      if (typeof FormLayout === 'undefined' || !el || !el.getAttribute) return;
      var id = el.getAttribute('data-extra-price-id');
      if (!id) return;
      var scope = String(el.getAttribute('data-extra-scope') || '');
      var uid = parseInt(scope.replace(/^qe/, ''), 10);
      var row = findRow(uid);
      if (!row) return;
      FormLayout.lockPrice(FormLayout.priceState(row), FormLayout.extraKey(id));
      paintPriceMarks(row);
    });
  }

  if (typeof FormLayout !== 'undefined' && FormLayout.onApply) {
    FormLayout.onApply(function () { applyQELayout(); });
  }

  /* ---------- expose ---------- */
  window.QE = {
    open: open, close: close, isOpen: isOpen, updatePayPreview: updatePayPreview, refreshFieldVisibility: refreshFieldVisibility,
    searchSupplier: searchSupplier, selectSupplier: selectSupplier, clearSupplier: clearSupplier,
openAddSupplier: openAddSupplier, closeAddSupplier: closeAddSupplier, confirmAddSupplier: confirmAddSupplier,
    addRow: addRow, deleteRow: deleteRow, setField: setField,
    // The unit cell is built with inline onchange/oninput/onblur attributes, and
    // those run in the page's global scope — without these three published, the
    // whole page lives inside a closure, so picking a unit threw
    // "QE.setUnit is not a function" and the line silently kept the default unit.
    setUnit: setUnit, setUnitLabel: setUnitLabel, unitBlur: unitBlur,
    onProductInput: onProductInput, onProductKey: onProductKey,
    searchProduct: searchProduct, selectProduct: selectProduct,
    setNewMode: setNewMode, confirm: confirm, updateTotal: updateTotal,
    setDiscMode: setDiscMode, toggleDiscReveal: toggleDiscReveal,
    normalizePdisc: normalizePdisc, computeTotals: computeTotals,
    toggleAmount: toggleAmount, applyAmountVisibility: applyAmountVisibility, showRowProduct: showRowProduct,
    toggleCent: toggleCent, paintCentBtn: paintCentBtn, applyCentFormatting: applyCentFormatting,
    handleScanKey: handleScanKey, scanProduct: scanProduct,
    // Field order / widths / tiered auto-fill (additive, never touches totals).
    moveRow: moveRow, reorderRows: reorderRows, toggleAutoFill: toggleAutoFill,
    openLayout: openLayout, applyLayout: applyQELayout, autoFillRow: autoFillRow,
    _rows: function () { return _qeRows; }
  };
})();
