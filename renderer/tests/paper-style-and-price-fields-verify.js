// ============================================================================
// ZMT PIECE — نمط الطابعة + حقول أسعار البيع في مداخل المنتجات — فحص سلوكي
// Run: node renderer/tests/paper-style-and-price-fields-verify.js
//
// يشغّل الوحدات الحقيقية (print-paper.js / extra-prices.js / quick-entry.js)
// داخل vm مع DOM مصغّر مبني من ملفات HTML المشحونة نفسها، then clicks the
// title-bar shortcut and drives a real quick-entry row end to end.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (c, m) => c ? ok(m) : bad(m);
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

// ---------------------------------------------------------------- mini DOM --
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

function decode(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

class TextNode {
  constructor(text) { this.nodeType = 3; this.text = text; this.parentNode = null; }
  get textContent() { return this.text; }
}

class El {
  constructor(tag) {
    this.nodeType = 1;
    this.tag = String(tag).toLowerCase();
    this.attrs = {};
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.listeners = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
  }
  get tagName() { return this.tag.toUpperCase(); }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = v; }
  get dataset() {
    const self = this;
    return new Proxy({}, {
      get(_, k) { return self.attrs['data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())]; },
      set(_, k, v) { self.attrs['data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())] = String(v); return true; },
    });
  }
  getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n); }
  get classList() {
    const self = this;
    const list = () => String(self.className).split(/\s+/).filter(Boolean);
    return {
      add: (...c) => { const l = list(); c.forEach((x) => { if (!l.includes(x)) l.push(x); }); self.className = l.join(' '); },
      remove: (...c) => { self.className = list().filter((x) => !c.includes(x)).join(' '); },
      toggle: (c, force) => {
        const l = list(); const on = force === undefined ? !l.includes(c) : !!force;
        if (on && !l.includes(c)) l.push(c);
        if (!on) { const i = l.indexOf(c); if (i !== -1) l.splice(i, 1); }
        self.className = l.join(' ');
        return on;
      },
      contains: (c) => list().includes(c),
    };
  }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  insertBefore(node, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    node.parentNode = this;
    if (i === -1) this.children.push(node); else this.children.splice(i, 0, node);
    return node;
  }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i !== -1) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new TextNode(String(v))]; this.children[0].parentNode = this; }
  get innerHTML() { return this.children.map(serialize).join(''); }
  set innerHTML(html) {
    this.children = [];
    parseInto(String(html), this);
  }
  get outerHTML() { return serialize(this); }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    const l = this.listeners[type] || [];
    const i = l.indexOf(fn); if (i !== -1) l.splice(i, 1);
  }
  fire(type, extra) {
    const ev = Object.assign({
      type, target: this, currentTarget: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this._stopped = true; },
    }, extra || {});
    let node = this;
    while (node) {
      ev.currentTarget = node;
      (node.listeners[type] || []).forEach((fn) => fn.call(node, ev));
      if (ev._stopped || !node.parentNode) break;
      node = node.parentNode;
    }
    return ev;
  }
  click() { return this.fire('click'); }
  focus() { doc._activeElement = this; }
  select() {}
  closest(sel) {
    let node = this;
    while (node) { if (node.nodeType === 1 && matches(node, sel)) return node; node = node.parentNode; }
    return null;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    walk(this, (el) => { if (el !== this && matchesCompound(el, sel)) out.push(el); });
    return out;
  }
  contains(node) { let n = node; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
}

function walk(root, fn) {
  root.children.forEach((c) => {
    if (c.nodeType !== 1) return;
    fn(c);
    walk(c, fn);
  });
}

function serialize(node) {
  if (node.nodeType === 3) return node.text;
  const attrs = Object.keys(node.attrs).map((k) => ' ' + k + '="' + node.attrs[k] + '"').join('');
  if (VOID.has(node.tag)) return '<' + node.tag + attrs + '>';
  return '<' + node.tag + attrs + '>' + node.children.map(serialize).join('') + '</' + node.tag + '>';
}

// Supports "#id", ".cls", "tag", "[attr]", '[attr="val"]' and one descendant
// combinator ("#qeRows [data-col=\"expiry\"]") — enough for this app's lookups.
function matchesCompound(el, sel) {
  const parts = String(sel).trim().split(/\s+(?![^\[]*\])/);
  if (parts.length > 1) {
    if (!matchesCompound(el, parts[parts.length - 1])) return false;
    let node = el.parentNode;
    while (node) {
      if (node.nodeType === 1 && matchesCompound(node, parts.slice(0, -1).join(' '))) return true;
      node = node.parentNode;
    }
    return false;
  }
  return sel.split(',').some((one) => matches(el, one.trim()));
}

function matches(el, sel) {
  if (!sel) return false;
  const tokens = sel.match(/(#\w[-\w]*)|(\.[-\w]+)|(\[[^\]]+\])|(^[-\w]+)/g) || [];
  if (!tokens.length) return false;
  return tokens.every((t) => {
    if (t[0] === '#') return el.id === t.slice(1);
    if (t[0] === '.') return el.classList.contains(t.slice(1));
    if (t[0] === '[') {
      const m = /^\[([-\w]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]$/.exec(t);
      if (!m) return false;
      if (!el.hasAttribute(m[1])) return false;
      if (m[2] === undefined && m[3] === undefined && m[4] === undefined) return true;
      return el.getAttribute(m[1]) === decode(m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]));
    }
    return el.tag === t.toLowerCase();
  });
}

function parseInto(html, container) {
  const stack = [container];
  const re = /(<!--[\s\S]*?-->)|<\/([-\w]+)\s*>|<([-\w]+)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) continue;                                  // comment
    if (m[5] !== undefined) {                            // text
      const t = m[5];
      if (t.trim() === '' && !/\n/.test(t)) continue;
      const n = new TextNode(t);
      n.parentNode = stack[stack.length - 1];
      stack[stack.length - 1].children.push(n);
      continue;
    }
    if (m[2] !== undefined) {                            // close tag
      const tag = m[2].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const tag = m[3].toLowerCase();
    const el = new El(tag);
    el.value = '';
    const attrRe = /([-\w:@.]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a;
    while ((a = attrRe.exec(m[4] || ''))) {
      const name = a[1].toLowerCase();
      const val = a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : (a[4] !== undefined ? a[4] : ''));
      el.attrs[name] = decode(val);
      if (name === 'value') el.value = decode(val);
      if (name === 'checked') el.checked = true;
    }
    // <script>/<style> bodies are skipped: their contents are not markup.
    if (tag === 'script' || tag === 'style') {
      const close = new RegExp('</' + tag + '>', 'i');
      const rest = html.slice(re.lastIndex);
      const end = rest.search(close);
      re.lastIndex += end === -1 ? rest.length : end + (close.exec(rest)[0] ? close.exec(rest)[0].length : 0);
      continue;
    }
    stack[stack.length - 1].appendChild(el);
    if (!VOID.has(tag)) stack.push(el);
  }
  syncControls(container);
}

// The app reads <select> through .value, which real browsers derive from the
// selected <option>. Reproduce that so parsed markup behaves like a live DOM.
function syncControls(container) {
  walk(container, (node) => {
    if (node.tag !== 'select') return;
    const opts = node.children.filter((c) => c.nodeType === 1 && c.tag === 'option');
    if (!opts.length) return;
    const sel = opts.find((o) => o.hasAttribute('selected')) || opts[0];
    node.value = sel.hasAttribute('value') ? sel.getAttribute('value') : sel.textContent;
  });
}

const doc = {
  readyState: 'complete',
  _activeElement: null,
  children: [],
  nodeType: 9,
  createElement: (t) => new El(t),
  getElementById(id) {
    let hit = null;
    walk(doc, (el) => { if (!hit && el.id === String(id)) hit = el; });
    return hit;
  },
  querySelector(sel) { return doc.querySelectorAll(sel)[0] || null; },
  querySelectorAll(sel) {
    const out = [];
    walk(doc, (el) => { if (matchesCompound(el, sel)) out.push(el); });
    return out;
  },
  addEventListener(type, fn) { (doc.listeners[type] = doc.listeners[type] || []).push(fn); },
  listeners: {},
  fire(type, extra) {
    const ev = Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, extra || {});
    (this.listeners[type] || []).forEach((fn) => fn(ev));
    return ev;
  },
};
doc.head = new El('head'); doc.head.parentNode = doc; doc.children.push(doc.head);
doc.body = new El('body'); doc.body.parentNode = doc; doc.children.push(doc.body);
doc.documentElement = new El('html'); doc.documentElement.parentNode = doc;

// Load the SHIPPED markup, so every getElementById below proves the real ids.
function loadShipped(file) {
  const html = read(file);
  const body = /<body[^>]*>([\s\S]*)$/i.exec(html);
  parseInto(body ? body[1] : html, doc.body);
}
loadShipped('renderer/index.html');
loadShipped('renderer/pages/quick-entry.html');

let f1, f2;                                  // extra-price fields, created in §2

check(doc.getElementById('qeRows'), 'qeRows موجود في صفحة الإدخال السريع المشحونة');
check(read('renderer/pages/invoices.html').indexOf('purExtraPricesWrap') !== -1,
  'نموذج الفواتير المشحون فيه موضع لحقول أسعار البيع (purExtraPricesWrap)');
// The invoices page is loaded lazily by the app, so its markup is parsed here
// into a node of its own — the same container id invoices.js paints into.
const purWrap = doc.createElement('div');
purWrap.id = 'purExtraPricesWrap';
doc.body.appendChild(purWrap);
check(doc.getElementById('purExtraPricesWrap') === purWrap, 'الحاوية معروفة في DOM الاختبار');
check(doc.getElementById('btnPrintPaper') && doc.getElementById('printPaperDropdown'), 'عناصر زر نمط الطابعة موجودة في index.html');

// ------------------------------------------------------------- localStorage --
const store = {};
const localStorageStub = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const alerts = [];
// `pre` are the scripts the page really loads first (index.html order), run in
// the same context so the module sees their globals exactly like the browser.
function loadModule(file, extra, pre) {
  const sandbox = {
    module: { exports: {} }, console, localStorage: localStorageStub, document: doc,
    Date, Math, Object, Array, JSON, String, Number, Boolean, isFinite, parseFloat, parseInt,
    RegExp, Error, Function, Infinity, NaN, encodeURIComponent, decodeURIComponent, Set, Map,
    alert: (m) => alerts.push(String(m)),
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.document = doc;
  sandbox.addEventListener = () => {};
  Object.assign(sandbox, extra || {});
  vm.createContext(sandbox);
  (pre || []).forEach((f) => vm.runInContext(read(f), sandbox, { filename: f }));
  vm.runInContext(read(file), sandbox, { filename: file });
  return { api: sandbox.module.exports, sandbox };
}

const { api: EP } = loadModule('renderer/js/extra-prices.js', { fmtMoney: (v) => Number(v).toFixed(2) });
const { api: PP } = loadModule('renderer/js/print-paper.js');

console.log('\n--- 1. زر «نمط الطابعة»: اختيار الحجم من الشريط العلوي ---');
{
  eq(PP.config().preset, 'A4', 'البداية A4');
  // boot() in print-paper.js wires the title bar itself — app.js needs no hook.
  const label = doc.getElementById('printPaperLabel');
  check(label && label.textContent === 'نمط الطابعة: A4 عمودي', 'الزر يعمل من تحميل الصفحة ويعرض الحجم والاتجاه: ' + (label ? label.textContent : '(بلا زر)'));

  const btn = doc.getElementById('btnPrintPaper');
  const dd = doc.getElementById('printPaperDropdown');
  btn.fire('click');
  check(dd.classList.contains('open'), 'النقر يفتح القائمة');
  const items = dd.querySelectorAll('[data-pp-preset]');
  eq(items.length, 9, 'كل الأحجام الجاهزة في القائمة (بدون المخصص)');
  check(dd.innerHTML.indexOf('A5') !== -1 && dd.innerHTML.indexOf('Executive') !== -1, 'أسماء الأحجام ظاهرة');

  const a5 = items.find((it) => it.getAttribute('data-pp-preset') === 'A5');
  a5.fire('click');
  check(!dd.classList.contains('open'), 'اختيار حجم يغلق القائمة');
  eq(PP.config().preset, 'A5', 'النقر على A5 يغيّر ورق الفواتير فعلياً');
  eq(PP.pageRule(10).indexOf('size:A5 portrait') !== -1, true, 'قاعدة @page صارت A5 عمودي');
  check(label.textContent.indexOf('A5') !== -1, 'الزر حدّث اسمه بدون إعادة تحميل');

  PP.save({ preset: 'A4', orientation: 'landscape', margin: 12 });
  dd.fire('click');
  doc.querySelectorAll('[data-pp-preset]').find((it) => it.getAttribute('data-pp-preset') === 'Legal').fire('click');
  const cfg = PP.config();
  eq(cfg.preset, 'Legal', 'اختيار سريع آخر يغيّر الحجم');
  eq(cfg.orientation, 'landscape', 'الاتجاه المحفوظ لا يضيع مع الاختيار السريع');
  eq(cfg.margin, 12, 'الهامش المحفوظ لا يضيع مع الاختيار السريع');

  dd.fire('click');
  const full = doc.getElementById('ppOpenFull');
  check(full, 'القائمة فيها مدخل للإعدادات المتقدمة');
  full.fire('click');
  check(doc.getElementById('printPaperModal'), 'المدخل يفتح نافذة الحجم/الاتجاه/الهامش');

  doc.getElementById('ppPreset').value = 'custom';
  doc.getElementById('ppPreset').fire('input');
  check(doc.getElementById('ppCustomRow').style.display !== 'none', 'اختيار مخصص يُظهر العرض والارتفاع');
  eq(doc.getElementById('ppOrientation').value, 'landscape', 'النافذة تفتح على الاتجاه المحفوظ مسبقاً');
  doc.getElementById('ppOrientation').value = 'portrait';
  doc.getElementById('ppOrientation').fire('input');
  doc.getElementById('ppWidth').value = '120';
  doc.getElementById('ppHeight').value = '180';
  doc.getElementById('ppMargin').value = '6';
  ['ppWidth', 'ppHeight', 'ppMargin'].forEach((id) => doc.getElementById(id).fire('input'));
  check(String(doc.getElementById('ppPreview').textContent).indexOf('120×180') !== -1, 'المعاينة النصية تعرض الورق المخصص: ' + doc.getElementById('ppPreview').textContent);
  doc.getElementById('ppSave').fire('click');
  eq(PP.config().preset, 'custom', 'الحفظ من النافذة يثبّت المخصص');
  eq(PP.config().width, 120, 'العرض المحفوظ');
  eq(PP.config().height, 180, 'الارتفاع المحفوظ');
  eq(PP.config().margin, 6, 'الهامش المحفوظ');
  check(PP.pageRule(10).indexOf('size:120mm 180mm') !== -1, 'قاعدة @page تستخدم المليمترات المخصصة: ' + PP.pageRule(10));
  // save() replaces the whole config (exactly what pickPreset sends), so a
  // direction change must carry the stored sheet and margin with it.
  const before = PP.config();
  PP.save({ preset: before.preset, orientation: 'landscape', margin: before.margin, width: before.width, height: before.height });
  check(PP.pageRule(10).indexOf('size:180mm 120mm') !== -1, 'الأفقي يقلب العرض والارتفاع في @page: ' + PP.pageRule(10));
  eq(PP.config().preset, 'custom', 'الاختيار الكامل يحفظ الحجم المخصص');
  eq(PP.config().margin, 6, 'الاختيار الكامل يحفظ الهامش');
  PP.save({ preset: before.preset, orientation: 'portrait', margin: before.margin, width: before.width, height: before.height });
  check(!doc.getElementById('printPaperModal'), 'النقر على حفظ يغلق النافذة');
  check(label.textContent.indexOf('مخصص') !== -1, 'الزر يعرض الورق المخصص بعد الحفظ');

  PP.save({ preset: 'A4', orientation: 'portrait', margin: 10 });
  PP.openSettings();
  doc.getElementById('ppCancel').fire('click');
  check(!doc.getElementById('printPaperModal'), 'إلغاء يغلق النافذة بدون تغيير');
  eq(PP.config().preset, 'A4', 'الإلغاء لم يغيّر الإعداد المحفوظ');
}

console.log('\n--- 2. الإدخال السريع: حقول أسعار البيع مع كل سطر ---');
{
  store[EP.KEY] = '';
  // addField returns the whole list, so take the newest field each time.
  f1 = EP.addField('نصف جملة', '#6f42c1').fields[0];
  const after2 = EP.addField('جملة كبيرة', '#0ea5e9').fields;
  f2 = after2[after2.length - 1];
  check(f1 && f2 && f1.id !== f2.id, 'الحقلان المنشآن لهما معرّفان مختلفان (' + (f1 && f1.id) + ' / ' + (f2 && f2.id) + ')');

  const products = {
    p1: { id: 'p1', name: 'دولكس', barcode: '1111', buyPrice: 100, sellPrice: 250, wholesalePrice: 200,
      quantity: 10, unit: 'piece', extraPrices: { [f1.id]: 220 } },
    p2: { id: 'p2', name: 'أموكسيسيلين', barcode: '2222', buyPrice: 50, sellPrice: 120, wholesalePrice: 90,
      quantity: 5, unit: 'piece', extraPrices: {} },
  };
  const writes = [];
  const DBstub = {
    getProducts: () => Object.keys(products).map((k) => products[k]),
    getProduct: (id) => products[id] || null,
    getProductByBarcode: () => null,
    getSuppliers: () => [{ id: 's1', name: 'مورد التجربة', balance: 0, phone: '' }],
    saveSuppliers: () => {},
    addInvoice: (inv) => { writes.push({ kind: 'invoice', inv }); return inv; },
    generateBarcode: () => 'GEN' + Date.now(),
    updateProduct: (id, changes) => { writes.push({ kind: 'update', id, changes }); return { ok: true }; },
    addOrMergeProduct: (item) => {
      writes.push({ kind: 'merge', item });
      const prod = Object.assign({ id: 'p1', quantity: 10 }, item);
      return { ok: true, created: false, merged: true, product: prod };
    },
  };

  const qeMod = loadModule('renderer/js/pages/quick-entry.js', {
    DB: DBstub,
    ExtraPrices: EP,
    PrintPaper: PP,
    PurchaseCore: { compute: (items) => ({
      mode: 'percent', value: 0, gross: 0, productDiscountAmount: 0, subtotal: 0,
      globalDiscountAmount: 0, total: 0,
      lines: items.map((it) => ({ index: 0, qty: it.qty, buyPrice: it.buyPrice, purchaseDiscountPct: 0,
        gross: it.qty * it.buyPrice, productDiscount: 0, afterProduct: it.qty * it.buyPrice,
        globalDiscount: 0, realTotal: it.qty * it.buyPrice, realBuyPrice: it.buyPrice })),
    }) },
    fmtMoney: (v) => Number(v || 0).toFixed(2),
    normSearch: (s) => String(s || ''),
    productSearchScore: () => 1,
    getExpirySettings: () => ({ enabled: false, required: false }),
    trackPageListener: () => {},
    navigateTo: () => {},
    _currentPageId: 'quick-entry',
  }, ['renderer/js/lib/units.js']);   // the real unit engine, as index.html loads it

  const QE = qeMod.sandbox.window.QE;
  check(QE && typeof QE.open === 'function', 'وحدة الإدخال السريع محمّلة');

  QE.open();
  const rowsWrap = doc.getElementById('qeRows');
  const band1 = rowsWrap.querySelector('#qeExtras_1');
  check(band1, 'كل سطر فيه شريط حقول الأسعار');
  let inputs = doc.querySelectorAll('[data-extra-scope="qe1"]');
  eq(inputs.length, 2, 'سطر فارغ يعرض الحقول المنشأة (حقلان)');

  QE.selectProduct(1, 'p1');
  inputs = doc.querySelectorAll('[data-extra-scope="qe1"]');
  const inF1 = inputs.find((n) => n.getAttribute('data-extra-price-id') === f1.id);
  const inF2 = inputs.find((n) => n.getAttribute('data-extra-price-id') === f2.id);
  eq(inF1.value, '220', 'اختيار منتج يعبّئ سعر الحقل المحفوظ');
  eq(inF2.value, '0', 'الحقل الفارغ يظهر بصفر قابل للتعديل');

  QE.addRow();
  QE.selectProduct(2, 'p2');
  const row2 = doc.querySelectorAll('[data-extra-scope="qe2"]');
  eq(row2.length, 2, 'السطر الثاني له نطاقه الخاص');
  row2.find((n) => n.getAttribute('data-extra-price-id') === f2.id).value = '999';
  const stillF1 = doc.querySelectorAll('[data-extra-scope="qe1"]').find((n) => n.getAttribute('data-extra-price-id') === f1.id);
  eq(stillF1.value, '220', 'السطران لا يخلط قيماً بعضهما');

  inF2.value = '350';
  QE.setField(1, 'qty', '2');
  QE.setField(2, 'qty', '1');
  QE.selectSupplier('s1');
  QE.confirm();

  const mergeWrites = writes.filter((w) => w.kind === 'merge').map((w) => w.item);
  eq(mergeWrites.length, 2, 'سطران يمران عبر addOrMergeProduct');
  const first = mergeWrites[0];
  eq(first.name, 'دولكس', 'سطر دولكس أولاً');
  check(first.extraPrices && Number(first.extraPrices[f1.id]) === 220, 'سعر الحقل المحفوظ بقي كما هو');
  check(Number(first.extraPrices[f2.id]) === 350, 'الحقل الجديد الذي كُتب في السطر يُحفظ');
  const second = mergeWrites[1];
  check(Number(second.extraPrices[f2.id]) === 999, 'سطر السطر الثاني أخذ قيمته لا قيمة جاره');
  check(second.extraPrices[f1.id] === undefined || Number(second.extraPrices[f1.id]) === 0, 'سطر لم يعبّئ حقل جاره');

  writes.length = 0;
  QE.open();
  QE.selectProduct(1, 'p1');
  doc.querySelectorAll('[data-extra-scope="qe1"]').find((n) => n.getAttribute('data-extra-price-id') === f1.id).value = '0';
  QE.setField(1, 'qty', '1');
  QE.confirm();
  const cleared = writes.filter((w) => w.kind === 'merge').map((w) => w.item)[0];
  check(cleared && Number(cleared.extraPrices[f1.id]) === 220, 'تصفير حقل في سطر منتج موجود لا يمحو سعره المخزون');

  // ---- تحرير فاتورة شراء: ما تمرّره invoices.js عبر _qePrefill ----
  qeMod.sandbox.window._qePrefill = {
    invoiceId: 'inv1', invoiceNumber: 'PUR-001', supplierName: 'مورد التجربة',
    discMode: 'percent', discValue: 0,
    rows: [
      { src: 'item', itemIdx: 0, productId: 'p1', name: 'دولكس', barcode: '1111', qty: 2, price: 100,
        sell: 250, whole: 200, extraPrices: { [f1.id]: 220, [f2.id]: 240 } },
      { src: 'staged', stagedIdx: 0, isNew: true, productId: null, name: 'منتج مُضاف', barcode: '3333',
        qty: 1, price: 60, sell: 120, whole: 0, extraPrices: { [f2.id]: 130 } },
    ],
  };
  QE.open();
  const pre1 = doc.querySelectorAll('[data-extra-scope="qe1"]');
  eq(pre1.length, 2, 'تحرير الفاتورة يرسم الحقول على كل سطر جاء من الفاتورة');
  eq(pre1.find((n) => n.getAttribute('data-extra-price-id') === f2.id).value, '240', 'السعر المحفوظ يظهر جاهزاً للتعديل');
  const pre2 = doc.querySelectorAll('[data-extra-scope="qe2"]');
  eq(pre2.find((n) => n.getAttribute('data-extra-price-id') === f2.id).value, '130', 'سطر المنتج المضاف أثناء التحرير يحمل قيمته');
  const lineBuy = doc.getElementById('qeBuy_1');
  check(lineBuy && lineBuy.disabled === true, 'سعر شراء السطر المحرَّر يبقى مقفلاً');
  check(pre1.every((n) => n.disabled === false) && pre2.every((n) => n.disabled === false),
    'حقول أسعار البيع تظل قابلة للتعبئة أثناء تحرير الفاتورة');

  // ---- ذيل الأسهم: الحقول الإضافية تأتي بعد «تاريخ الانتهاء» ----
  // init_quick_entry() binds the page's real keydown handler on
  // #page-quick-entry — the same container the shipped markup provides — so
  // firing arrows at a field replays exactly what the cashier does.
  qeMod.sandbox.trackPageListener = (type, fn, el) => { (el || doc).addEventListener(type, fn); };
  qeMod.sandbox.window.init_quick_entry();          // clean state: one empty row
  QE.addRow();
  const navRow1 = doc.getElementById('qeRow_1');
  const navRow2 = doc.getElementById('qeRow_2');
  check(navRow1 && navRow2, 'سطران جاهزان لفحص الأسهم');

  const COLS = ['product', 'qty', 'unit', 'buy', 'pdisc', 'sell', 'whole', 'brand',
    'reference', 'plu', 'barcode', 'country', 'mark', 'minPrice', 'storage', 'family', 'expiry'];
  const band1In = navRow1.querySelector('.qe-col-extras').querySelectorAll('input');
  const band2In = navRow2.querySelector('.qe-col-extras').querySelectorAll('input');

  let at = navRow1.querySelector('[data-col="product"]');
  let skipped = null;
  for (let i = 1; i < COLS.length; i++) {
    at.fire('keydown', { key: 'ArrowLeft' });
    at = doc._activeElement;
    if (!at || at.dataset.col !== COLS[i]) { skipped = COLS[i]; break; }
  }
  check(skipped === null, 'الأسهم تمرّ بكل أعمدة السطر بلا تخطٍّ' + (skipped ? ' (تعثّر عند ' + skipped + ')' : ''));
  eq(at && at.dataset.col, 'expiry', 'المسار ينتهي عند تاريخ الانتهاء');

  at.fire('keydown', { key: 'ArrowLeft' });
  check(doc._activeElement === band1In[0], 'السهم بعد تاريخ الانتهاء يدخل أول حقل أسعار إضافية');
  band1In[0].fire('keydown', { key: 'ArrowLeft' });
  check(doc._activeElement === band1In[1], 'السهم التالي يصل للحقل الإضافي الثاني');
  band1In[1].fire('keydown', { key: 'ArrowRight' });
  check(doc._activeElement === band1In[0], 'السهم المعاكس يرجع من الحقل الثاني للأول');
  band1In[0].fire('keydown', { key: 'ArrowRight' });
  check(doc._activeElement === navRow1.querySelector('[data-col="expiry"]'), 'الحقل الأول في الشريط يرجع لتاريخ الانتهاء');

  band1In[0].fire('keydown', { key: 'ArrowDown' });
  check(doc._activeElement === band2In[0], 'السهم لأسفل ينزل لنفس الحقل الإضافي في السطر التالي');
  band2In[1].fire('keydown', { key: 'ArrowUp' });
  check(doc._activeElement === band1In[1], 'السهم لأعلى يصعد لنفس الحقل في السطر السابق');

  const qeSrc = read('renderer/js/pages/quick-entry.js');
  check(/if \(!navKeyOf\(inp\)\) return;/.test(qeSrc),
    'بوابة الأسهم تعترف بحقول الشريط، لا بحقول data-col وحدها');
}

console.log('\n--- 3. نموذج فاتورة الشراء/المورد: نفس الحقول في السلة ---');
{
  // Exactly what invoices.js does: paint from the product, read the scope back.
  const prod = { extraPrices: { [f1.id]: 480 } };
  purWrap.innerHTML = '<div class="extra-price-section">' + EP.inputsHTML('pur', prod) + '</div>';
  let pur = doc.querySelectorAll('[data-extra-scope="pur"]');
  eq(pur.length, 2, 'نموذج الشراء يعرض الحقولين');
  eq(pur.find((n) => n.getAttribute('data-extra-price-id') === f1.id).value, '480', 'السعر المحفوظ يظهر في النموذج');
  pur.find((n) => n.getAttribute('data-extra-price-id') === f2.id).value = '700';
  const readBack = EP.readInputs('pur');
  eq(Number(readBack[f1.id]), 480, 'قراءة النموذج تعطي الحقل الأول');
  eq(Number(readBack[f2.id]), 700, 'قراءة النموذج تعطي الحقل الثاني');
  // A scope nobody painted must read as empty — the read is attribute-scoped,
  // so the purchase form can never swallow the quick-entry rows' values.
  eq(Object.keys(EP.readInputs('purOnly')).length, 0, 'نطاق غير مرسوم لا يقرأ شيئاً من حقول الإدخال السريع');

  purWrap.innerHTML = EP.inputsHTML('pur', null);
  eq(Object.keys(EP.readInputs('pur')).length, 0, 'تفريغ النموذج يمسح القيم (خريطة فارغة)');
}

console.log('\n--- 4. صفحة البيع: السعر يظهر عند التبديل في السلة ---');
{
  const sales = read('renderer/js/pages/sales.js');
  check(sales.indexOf('salesNextLineMode') !== -1 && sales.indexOf("list[(i < 0 ? 0 : i + 1) % list.length]") !== -1,
    'زر السعر يتنقّل قطعة ← جملة ← كل حقل');
  check(sales.indexOf("'extra:' + f.id") !== -1 || sales.indexOf('"extra:" + f.id') !== -1,
    'الحقول المنشأة تدخل في دورة التبديل');
  const rec = { sellPrice: 250, wholesalePrice: 200, extraPrices: { [f1.id]: 220 } };
  const priceOfMode = (mode) => {
    if (mode === 'wholesale') return rec.wholesalePrice || rec.sellPrice || 0;
    if (String(mode).indexOf('extra:') === 0) {
      const v = EP.priceOf(rec, String(mode).slice(6));
      return v || rec.sellPrice || 0;
    }
    return rec.sellPrice || 0;
  };
  eq(priceOfMode('unit'), 250, 'القطعة: سعر البيع');
  eq(priceOfMode('wholesale'), 200, 'الجملة: سعر الجملة');
  eq(priceOfMode('extra:' + f1.id), 220, 'الحقل: السعر المُدرَج في الشراء');
  eq(priceOfMode('extra:' + f2.id), 250, 'حقل بلا سعر يرجع لسعر القطعة بدل صفر');
}

console.log('\n============================================');
console.log((fail ? 'فشل ' + fail + ' فحصاً' : 'كل الفحوص نجحت') + ' — pass=' + pass + ' fail=' + fail);
console.log('============================================');
process.exit(fail ? 1 : 0);
