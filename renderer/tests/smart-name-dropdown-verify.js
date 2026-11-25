// ZMT PIECE — Smart Add: name dropdown on focus / click
// Run: node renderer/tests/smart-name-dropdown-verify.js
//
// The typed autocomplete already existed (it fires on `oninput`). The gap this
// test locks down: clicking / focusing a name that is ALREADY filled (e.g. read
// from the invoice) must show the same "similar products" list, so an existing
// article can be picked without retyping — and doing so must NEVER clear the
// barcode/reference that were matched automatically.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dom = require('./dom-lite');

// dom-lite has no insertAdjacentHTML; the preview grid uses exactly one call.
dom.El.prototype.insertAdjacentHTML = function (position, html) {
  if (position !== 'beforeend') throw new Error('unsupported position: ' + position);
  const tmp = new dom.El('div');
  dom.parseInto(String(html), tmp);
  tmp.children.slice().forEach((child) => this.appendChild(child));
};

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const products = [
  { id: 'p1', name: 'زيت مائدة 5L', barcode: '6130000000017', reference: 'REF-Z5', mark: 'ZMT', countryOfOrigin: 'DZ', buyPrice: 900, quantity: 10 },
  { id: 'p2', name: 'زيت مائدة 1L', barcode: '6130000000024', reference: 'REF-Z1', mark: 'ZMT', countryOfOrigin: 'DZ', buyPrice: 200, quantity: 10 },
  { id: 'p3', name: 'سكر أبيض 1كغ', barcode: '6130000000031', reference: 'REF-S1', mark: 'SUC', countryOfOrigin: 'DZ', buyPrice: 120, quantity: 10 },
  { id: 'p4', name: 'AILE ARRIERE VIGO 2010', barcode: '6130000000048', reference: 'REF-A4', mark: 'ZMT', countryOfOrigin: 'DZ', buyPrice: 1500, quantity: 5 },
];
const detailsCalls = [];
const store = {};
const sandbox = {
  console,
  document: dom.createDoc(),
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  setTimeout, clearTimeout, Date, Math, JSON, String, Number, parseFloat, parseInt, isFinite,
  escHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  normSearch: (s) => String(s || '').toLowerCase().trim(),
  // A faithful-enough scorer: every token must appear in one of the product
  // fields; a name hit ranks above a barcode/reference/mark/country hit.
  productSearchScore: (name, barcode, q, mark, reference, country) => {
    const nq = String(q || '').toLowerCase().trim();
    if (!nq) return 1;
    const hay = [name, barcode, mark, reference, country].map((x) => String(x || '').toLowerCase());
    const toks = nq.split(/\s+/).filter(Boolean);
    let s = 0;
    for (const t of toks) {
      let hit = 0;
      hay.forEach((h, idx) => { if (h.indexOf(t) !== -1) hit = Math.max(hit, idx === 0 ? 4 : 2); });
      if (!hit) return 0;
      s += hit;
    }
    return s;
  },
  alert: () => {},
  filterInvoices: () => {},
  isRTL: () => true,
  showProductDetails: (id) => { detailsCalls.push(id); },
  FV: { toggle: () => {}, isVisible: () => true, apply: () => {} },
  ExtraPrices: { fields: () => [] },
  InvoiceOCR: { getEngine: () => 'tesseract', saveEngine: () => {}, getKeys: () => [], saveKeys: () => {}, ocrFile: async () => ({ rows: [], rawText: '' }), parseRowsFromText: () => [] },
  DB: {
    getProducts: () => products,
    getProductByBarcode: () => null,
    getProduct: (id) => products.find((p) => p.id === id) || null,
    getSuppliers: () => [],
    generateBarcode: () => 'BC1',
    getLowStockThreshold: () => 5,
    addOrMergeProduct: (item) => {
      products.push(Object.assign({}, item, { id: 'p' + (products.length + 1) }));
      return { ok: true, product: products[products.length - 1] };
    },
    addInvoice: (inv) => Object.assign({}, inv, { id: 'inv1' }),
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('renderer/js/pages/invoices-smart.js'), sandbox, { filename: 'invoices-smart.js' });

const doc = sandbox.document;
const box = (i) => doc.getElementById('smartNameResults_' + i);
const nameInput = (i) => doc.querySelector('[data-col="name"][data-row="' + i + '"]');
const fieldVal = (col, i) => {
  const el = doc.querySelector('[data-col="' + col + '"][data-row="' + i + '"]');
  return el ? el.value : null;
};

(async function main() {
  sandbox.openSmartEdit();
  sandbox.addSmartRow(); // row 0, empty name

  // ---------- an empty name shows nothing (no arbitrary product list) -------
  sandbox.smartNameFocus(0, '');
  check(box(0).style.display !== 'block', 'focusing an empty name shows no dropdown');

  // ---------- a filled name (as read from the invoice) opens the list -------
  sandbox.updateSmartRow(0, 'name', 'زيت مائدة 5L');
  eq(fieldVal('barcode', 0), '6130000000017', 'the exact name auto-fills the barcode');
  eq(fieldVal('reference', 0), 'REF-Z5', 'the exact name auto-fills the reference');

  sandbox.smartNameFocus(0, 'زيت مائدة 5L');
  eq(box(0).style.display, 'block', 'focusing a filled name opens the dropdown');
  check(box(0).textContent.indexOf('زيت مائدة 5L') >= 0, 'the dropdown lists the matching product');
  // The whole point of the safety rule: focus is display-only.
  eq(fieldVal('barcode', 0), '6130000000017', 'focusing the name KEEPS the auto-filled barcode');
  eq(fieldVal('reference', 0), 'REF-Z5', 'focusing the name KEEPS the auto-filled reference');

  // ---------- partial name lists every similar product, no unrelated ones ----
  sandbox.smartNameFocus(0, 'زيت');
  eq(box(0).style.display, 'block', 'a partial name opens the dropdown');
  check(box(0).textContent.indexOf('زيت مائدة 5L') >= 0, 'lists the 5L oil');
  check(box(0).textContent.indexOf('زيت مائدة 1L') >= 0, 'lists the 1L oil');
  check(box(0).textContent.indexOf('سكر') < 0, 'does not list an unrelated product');
  const items = box(0).querySelectorAll('.smart-name-item');
  check(items.length === 2, 'exactly the two similar products are offered (got ' + items.length + ')');

  // ---------- fuzzy: 4 shared letters, any order / any wording --------------
  // The strict scorer needs every word of the query to appear, so it returns 0
  // for a differently-worded product; the fuzzy layer must still offer it.
  sandbox.smartNameFocus(0, 'AILE AVANT VIGO');
  eq(box(0).style.display, 'block', 'a differently-worded name still opens the dropdown');
  check(box(0).textContent.indexOf('AILE ARRIERE VIGO 2010') >= 0,
    'a product sharing 4+ letters (any order) is offered');
  check(box(0).textContent.indexOf('زيت') < 0, 'an unrelated product is not offered for a Latin query');

  // ---------- the dropdown has an explicit close / cancel button -----------
  sandbox.smartNameFocus(0, 'زيت');
  eq(box(0).style.display, 'block', 'the list is open before using the close button');
  const closeBtn = box(0).querySelector('.smart-name-close');
  check(!!closeBtn, 'the dropdown shows a close button');
  check(String(closeBtn && closeBtn.textContent).indexOf('إغلاق') >= 0, 'the close button is labelled «إغلاق»');
  const beforeName = nameInput(0).value;
  sandbox.smartCloseNameList(0);
  eq(box(0).style.display, 'none', 'the close button dismisses the dropdown');
  eq(nameInput(0).value, beforeName, 'closing the list leaves the name untouched');
  check(box(0).querySelectorAll('.smart-name-item').length === 0, 'no product is selected by closing the list');

  // ---------- typing a new name still drops the stale auto-fill --------------
  // (the auto values came from the name match above and are still marked `_auto`)
  sandbox.smartNameInput(0, 'منتج آخر تماما');
  eq(fieldVal('barcode', 0), '', 'typing a new name still clears the stale auto barcode (unchanged behaviour)');
  eq(fieldVal('reference', 0), '', 'typing a new name still clears the stale auto reference (unchanged behaviour)');

  // ---------- picking a suggestion fills the row and closes the list --------
  sandbox.smartNameFocus(0, 'زيت');
  sandbox.smartPickProduct(0, 'p2');
  eq(nameInput(0).value, 'زيت مائدة 1L', 'picking a suggestion sets the name');
  eq(fieldVal('barcode', 0), '6130000000024', 'picking a suggestion fills its barcode');
  check(box(0).style.display !== 'block', 'the dropdown is closed after picking');
  eq(doc._activeElement && doc._activeElement.getAttribute('data-col'), 'qty', 'focus jumps to the quantity after picking');

  // ---------- blur closes the list ------------------------------------------
  sandbox.smartNameFocus(0, 'زيت');
  eq(box(0).style.display, 'block', 'the list is open before blur');
  sandbox.smartNameBlur(0);
  await wait(220);
  eq(box(0).style.display, 'none', 'blur closes the dropdown');

  // ---------- Escape closes the list first, the modal second ----------------
  sandbox.smartNameFocus(0, 'زيت');
  const modal = doc.getElementById('smartEditModal');
  eq(modal.style.display, 'flex', 'the smart edit modal is open');
  eq(box(0).style.display, 'block', 'the list is open before Escape');
  sandbox.smartKeydown({ key: 'Escape', target: nameInput(0), preventDefault() {} });
  eq(box(0).style.display, 'none', 'the first Escape closes the dropdown');
  eq(modal.style.display, 'flex', 'the first Escape leaves the modal open');
  sandbox.smartKeydown({ key: 'Escape', target: nameInput(0), preventDefault() {} });
  eq(modal.style.display, 'none', 'the second Escape closes the modal');

  console.log('\n============================================');
  if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
  else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
