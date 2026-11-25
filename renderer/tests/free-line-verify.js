// ============================================================================
// ZMT PIECE — سطر البيع الحر (F10): منتج غير مدرج في المخزن — فحص سلوكي
// Run: node renderer/tests/free-line-verify.js
//
// يشغّل الوحدات الحقيقية (units.js + sale-core.js + purchase-core.js +
// pages/sales.js) داخل vm فوق DOM مصغّر مبني من sales.html المشحونة نفسها،
// ثم يفتح النافذة بالمفتاح، ويكتب الكمية والسعر، ويؤكّد البيع بالمحرك الحقيقي.
// القواعد المثبَّتة: أي كاشير — أي كمية موجبة عشرية — الصفر والسالب مرفوضان —
// الاسم الافتراضي «منتج غير موجود في المخزن» — المبلغ يدخل في الصافي والدين —
// الربح = المبلغ كامل مع وسم ظاهر في التقارير — لا يُنقص مخزون ولا تُنشأ بطاقة.
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
  // Records that the field's text was highlighted, so "opens with the 1
  // selected" is a fact the test can read back.
  select() { this._selected = true; }
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
// combinator — enough for this app's lookups.
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
      // The inline style attribute is what tells the app a modal is closed.
      if (name === 'style') {
        String(val).split(';').forEach((d) => {
          const c = d.split(':');
          if (c.length === 2) el.style[c[0].trim()] = c[1].trim();
        });
      }
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

function loadShipped(file) {
  const html = read(file);
  const body = /<body[^>]*>([\s\S]*)$/i.exec(html);
  parseInto(body ? body[1] : html, doc.body);
}
// The REAL page markup: every getElementById below therefore proves the id
// exists in the shipped file, not in a fixture.
loadShipped('renderer/pages/sales.html');

// ------------------------------------------------------------- dictionary ---
// t() reads the shipped app.js dictionaries: the Arabic block first, so the
// strings the cashier sees are the strings the app really carries.
const appSrc = read('renderer/js/app.js');
const salesLines = appSrc.split(/\r?\n/).filter((l) => l.indexOf('scanPlaceholder:') !== -1 && l.indexOf('mixedPrice:') !== -1);
eq(salesLines.length, 4, 'قاموس sales موجود في اللغات الأربع داخل app.js');
function pairsOf(line) {
  const out = {};
  const re = /([A-Za-z]\w*):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  let m;
  while ((m = re.exec(line))) {
    const value = m[2] !== undefined ? m[2].replace(/\\'/g, "'") : m[3].replace(/\\"/g, '"');
    out[m[1]] = value;
  }
  return out;
}
const dictAr = pairsOf(salesLines[0]);
const dictEn = pairsOf(salesLines[1]);
const dictFr = pairsOf(salesLines[2]);
const dictZh = pairsOf(salesLines[3]);
const t = (k) => {
  const s = String(k).split('.');
  if (s[0] === 'sales' && dictAr[s[1]] != null) return dictAr[s[1]];
  return String(k);
};

// ------------------------------------------------------------- localStorage --
const store = {};
const localStorageStub = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const alerts = [];
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
  sandbox.addEventListener = () => {};
  Object.assign(sandbox, extra || {});
  vm.createContext(sandbox);
  (pre || []).forEach((f) => vm.runInContext(read(f), sandbox, { filename: f }));
  vm.runInContext(read(file), sandbox, { filename: file });
  return { api: sandbox.module.exports, sandbox };
}

// ------------------------------------------------------------------ the DB ---
// The minimum-margin settings live in DB.getMeta: the holder lets a section
// turn the rule on and off without touching any other file.
const marginCfg = { value: null };
const products = {
  real: { id: 'real', name: 'دولكس', barcode: '1111', buyPrice: 100, sellPrice: 250,
    wholesalePrice: 200, quantity: 4, unit: 'piece', createdAt: 1 },
};
const customers = [{ id: 'c1', name: 'عميل التجربة', balance: 0, discount: 0, phone: '' }];
const writes = { merges: 0, productUpdates: [], invoices: [], payments: [], discounts: [] };
const DB = {
  getProducts: () => Object.keys(products).map((k) => products[k]),
  getProduct: (id) => (id && products[id]) || null,
  getProductByBarcode: (b) => Object.keys(products).map((k) => products[k]).find((p) => p.barcode === b) || null,
  getCustomers: () => customers,
  getCustomer: (id) => customers.find((c) => c.id === id) || null,
  saveCustomers: () => {},
  getSuppliers: () => [],
  saveSuppliers: () => {},
  addOrMergeProduct: (item) => { writes.merges++; return { ok: true, product: item }; },
  updateProduct: () => { writes.merges++; return { ok: true }; },
  updateProductsBatch: (list) => { writes.productUpdates.push(...list); return { ok: true }; },
  addInvoice: (inv) => { writes.invoices.push(inv); return Object.assign({ id: 'inv1', invoiceNumber: 'FV-1' }, inv); },
  addPayment: (p) => { writes.payments.push(p); return p; },
  addDiscount: (d) => { writes.discounts.push(d); return d; },
  getLowStockThreshold: () => 5,
  getMeta: (k) => (k === 'sales_margin_cfg' ? marginCfg.value : null),
  generateBarcode: () => 'GEN1',
};

const S = loadModule('renderer/js/pages/sales.js', {
  DB, t,
  debounce: (fn) => fn,
  escHtml: (s) => String(s == null ? '' : s),
  fmtMoney: (v) => Number(v || 0).toFixed(2),
  normSearch: (s) => String(s || ''),
  productSearchScore: () => 1,
  getExpirySettings: () => ({ enabled: false, required: false, warnDays: 30 }),
  getPharmacyMode: () => false,
  trackPageListener: () => {},
  navigateTo: () => {},
  Auth: { buyPriceVisible: () => true, isManager: () => true },
  ExtraPrices: { fields: () => [] },
  _currentPageId: 'sales',
}, ['renderer/js/lib/units.js', 'renderer/js/purchase-core.js', 'renderer/js/sale-core.js']).sandbox;

const Unit = S.Unit;
const SaleCore = S.SaleCore;
check(typeof S.openSalesFreeLine === 'function' && typeof S.addSalesFreeLine === 'function',
  'صفحة البيع الحقيقية محمّلة وفيها دوال السطر الحر');
check(!!Unit && !!SaleCore, 'الوحدات المشتركة (Unit و SaleCore) محمّلة في نفس السياق');

// The shipped markup wires the inline handlers; the behavioural calls below
// drive the very same functions the browser would call.
const salesHtml = read('renderer/pages/sales.html');
const has = (needle, msg) => check(salesHtml.indexOf(needle) !== -1, msg);
console.log('\n--- 0. النافذة مشحونة في الصفحة ---');
has('id="salesFreeModal"', 'sales.html فيها نافذة السطر الحر');
has('id="salesFreeQty"', 'sales.html فيها حقل الكمية');
has('id="salesFreePrice"', 'sales.html فيها حقل السعر');
has('id="salesFreeName"', 'sales.html فيها حقل الاسم الاختياري');
has('id="salesFreeTotal"', 'sales.html فيها إجمالي حي');
has('id="salesFreeLineBtn"', 'sales.html فيها زر ظاهر لسطر F10');
has('onclick="openSalesFreeLine()"', 'الزر يفتح النافذة بنفس الدالة التي يفتحها المفتاح');
has('onkeydown="salesFreeKeyNav(event)"', 'النافذة تستقبل الأسهم و Enter و Esc');
has('oninput="updateSalesFreeTotal()"', 'الكمية والسعر يحدّثان الإجمالي أثناء الكتابة');
has('onclick="confirmSalesFreeLine()"', 'النافذة فيها زر إضافة للسلة');

console.log('\n--- 1. F10: النافذة تفتح على الكمية والقيمة 1 محددة ---');
const modal = doc.getElementById('salesFreeModal');
const fName = doc.getElementById('salesFreeName');
const fQty = doc.getElementById('salesFreeQty');
const fPrice = doc.getElementById('salesFreePrice');
const scan = doc.getElementById('salesBarcodeScan');
const keyEv = (key, target) => ({
  key, code: key, target, defaultPrevented: false, _stopped: false,
  preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this._stopped = true; },
});

eq(modal.style.display, 'none', 'النافذة مغلقة قبل الضغط (كما في markup المشحون)');
S._salesPageKeyHandler(keyEv('F10', scan));
eq(modal.style.display, 'flex', 'F10 يفتح النافذة');
eq(doc._activeElement && doc._activeElement.id, 'salesFreeQty', 'التركيز يقع على حقل الكمية فور الفتح');
eq(fQty.value, '1', 'الكمية تأتي 1 تلقائياً');
eq(fQty._selected, true, 'الـ 1 محددة فيكتب فوقها مباشرة');

console.log('\n--- 2. التنقل بالأسهم و Enter و Esc ---');
S.salesFreeKeyNav(keyEv('ArrowDown', fQty));
eq(doc._activeElement && doc._activeElement.id, 'salesFreePrice', 'السهم لأسفل من الكمية ينزل للسعر');
S.salesFreeKeyNav(keyEv('ArrowUp', fPrice));
eq(doc._activeElement && doc._activeElement.id, 'salesFreeQty', 'السهم لأعلى يرجع للكمية');
S.salesFreeKeyNav(keyEv('ArrowUp', fQty));
eq(doc._activeElement && doc._activeElement.id, 'salesFreeName', 'صعود آخر يصل لحقل الاسم');
S.salesFreeKeyNav(keyEv('ArrowDown', fName));
eq(doc._activeElement && doc._activeElement.id, 'salesFreeQty', 'نزول من الاسم يرجع للكمية');
// الحقلان الطرفيان: التركيز يُوضع فيهما أولاً، لأن السهم في آخر/أول حقل
// يجب أن يبقي التركيز حيث هو (لا دوران في نافذة من ثلاثة حقول).
fPrice.focus();
S.salesFreeKeyNav(keyEv('ArrowLeft', fPrice));
eq(doc._activeElement && doc._activeElement.id, 'salesFreePrice', 'السهم لا يتخطى آخر حقل');
fName.focus();
S.salesFreeKeyNav(keyEv('ArrowRight', fName));
eq(doc._activeElement && doc._activeElement.id, 'salesFreeName', 'ولا يتخطى أول حقل');
const qtyBefore = S._salesCart.length;
S.salesFreeKeyNav(keyEv('Escape', fQty));
eq(modal.style.display, 'none', 'Esc يغلق النافذة');
eq(S._salesCart.length, qtyBefore, 'Esc لا يضيف أي سطر');
eq(doc._activeElement && doc._activeElement.id, 'salesBarcodeScan', 'التركيز يعود لخانة المسح الضوئي');
// Enter هو طريق الكاشير السريع: يضيف ويغلق ويعيد التركيز للمسح.
S._salesPageKeyHandler(keyEv('F10', scan));
fName.value = ''; fQty.value = '2'; fPrice.value = '35';
const enterBefore = S._salesCart.length;
S.salesFreeKeyNav(keyEv('Enter', fQty));
eq(S._salesCart.length, enterBefore + 1, 'Enter يضيف السطر إلى السلة');
eq(S._salesCart[enterBefore].total, 70, 'والمبلغ = 2 × 35');
eq(modal.style.display, 'none', 'وEnter يغلق النافذة');
eq(doc._activeElement && doc._activeElement.id, 'salesBarcodeScan', 'ويرجع التركيز لخانة المسح');
// Tab يجب أن يبقى للتنقل بين الحقول: المعالج لا يبتلع المفتاح غير المذكور.
S._salesPageKeyHandler(keyEv('F10', scan));
const tabEv = keyEv('Tab', fQty);
const tabFocus = doc._activeElement && doc._activeElement.id;
S.salesFreeKeyNav(tabEv);
eq(tabEv.defaultPrevented, false, 'Tab لا يُبتلع في نافذة السطر الحر');
eq(doc._activeElement && doc._activeElement.id, tabFocus, 'وTab لا ينقل التركيز قسراً');
S.closeSalesFreeLine();
S._salesCart.length = 0;

console.log('\n--- 3. يعمل من سلة فارغة، ويحترم النوافذ المفتوحة ---');
eq(S._salesCart.length, 0, 'السلة فارغة أصلاً');
S._salesPageKeyHandler(keyEv('F10', doc.getElementById('salesBarcodeScan')));
eq(modal.style.display, 'flex', 'F10 يفتح والكاشير يكتب في البحث');
eq(doc._activeElement && doc._activeElement.id, 'salesFreeQty', 'ويضع التركيز على الكمية كذلك');
S.closeSalesFreeLine();
// A different modal already on screen (substitutes, transfer, history) must
// keep F10 silent — the cashier is finishing something else.
const other = doc.createElement('div');
other.className = 'modal-overlay';
other.style.display = 'flex';
doc.body.appendChild(other);
S._salesPageKeyHandler(keyEv('F10', scan));
eq(modal.style.display, 'none', 'F10 لا يفتح فوق نافذة أخرى مفتوحة');
other.remove();

console.log('\n--- 4. المدخلات: أي موجب عشري، ولا صفر ولا سالب ولا نص ---');
const addWith = (name, qty, price) => {
  S.openSalesFreeLine();
  fName.value = name; fQty.value = qty; fPrice.value = price;
  const before = S._salesCart.length;
  alerts.length = 0;
  S.confirmSalesFreeLine();
  return { added: S._salesCart.length - before, alert: alerts[0] || '' };
};
let r = addWith('', '0', '100');
eq(r.added, 0, 'الكمية صفر تُرفض');
eq(r.alert, dictAr.freeQtyBad, 'وترسّله رسالة رفض الكمية (من قاموس الصفحة)');
eq(modal.style.display, 'flex', 'الرفض يبقي النافذة مفتوحة لتصحيح الكمية');
eq(doc._activeElement && doc._activeElement.id, 'salesFreeQty', 'والتركيز يعود لحقل الكمية');
r = addWith('', '-3', '100');
eq(r.added, 0, 'الكمية السالبة تُرفض (ولا تُقرأ موجبة)');
r = addWith('', 'abc', '100');
eq(r.added, 0, 'النص في الكمية يُرفض');
r = addWith('', '0.001', '50');
eq(r.added, 1, 'أي موجب عشري يُقبل: 0.001');
eq(S._salesCart[0].qty, 0.001, 'وتبقى الكمية كما كُتبت');
S._salesCart.length = 0;
r = addWith('', '2', '');
eq(r.added, 0, 'السعر الفارغ يُرفض');
eq(r.alert, dictAr.freePriceBad, 'وترسّله رسالة رفض السعر');
r = addWith('', '17', '2.5');
eq(r.added, 1, 'كمية صحيحة كبيرة وسعر عشري يُقبلان');
eq(S._salesCart[0].baseTotal, 42.5, 'الإجمالي = 17 × 2.5');
S._salesCart.length = 0;

console.log('\n--- 5. الاسم والقيمة والمجموع ---');
r = addWith('', '3', '100');
eq(r.added, 1, 'سطر مضاف');
eq(S._salesCart[0].name, dictAr.freeDefaultName, 'اسم بلا كتابة يظهر «منتج غير موجود في المخزن»');
eq(String(dictAr.freeDefaultName), 'منتج غير موجود في المخزن', 'وهو فعلاً الاسم العربي المتفق عليه');
eq(S._salesCart[0].total, 300, '3 × 100 = 300 يدخل إجمالي السطر');
eq(String(S._salesCart[0].key).slice(0, 5), 'free:', 'ومفتاحه لا يطابق أي منتج');
S._salesCart.length = 0;
r = addWith('   سلك 2 متر   ', '2', '50');
eq(S._salesCart[0].name, 'سلك 2 متر', 'والاسم المكتوب يبقى كما هو بعد تشذيبه');
eq(S._salesCart[0].total, 100, 'وكمية 2 × 50 = 100');
fQty.value = '4'; fPrice.value = '10';
eq(S.salesFreeTotal(), 40, 'الإجمالي الحي في النافذة = الكمية × السعر');

console.log('\n--- 6. السطر في السلة: تعديل السعر والكمية والخصم، وبلا دورات أسعار ---');
const idx = S._salesCart.length - 1;
S.updateSalesLinePrice(idx, '120');
eq(S._salesCart[idx].price, 120, 'سعر السطر الحر قابل للتعديل بعد الإضافة');
eq(S._salesCart[idx].baseTotal, 240, 'السعر الجديد يسري على الإجمالي: كمية 2 × 120');
S.updateSalesLinePrice(idx, '2');
eq(S._salesCart[idx].baseTotal, 4, '2 × 2 = 4');
S.updateSalesCartQty(idx, '500');
eq(S._salesCart[idx].qty, 500, 'كمية بلا سقف مخزون: 500 تُقبل');
S.toggleSalesLineMode(idx);
eq(S._salesCart[idx].mode, 'unit', 'ولا تدور على أسعار جملة/إضافية لأنه بلا بطاقة');
eq(S._salesCart[idx].price, 2, 'والسعر المكتوب لم يمسّه تبديل الوضع');
S.updateSalesCartQty(idx, '2');
S.updateSalesLinePrice(idx, '100');
S.updateSalesLineDiscount(idx, '60');
eq(S._salesCart[idx].total, 140, 'خصم السطر يخصم من الإجمالي (200 − 60)');
const cartHtml = doc.getElementById('salesCartItems').innerHTML;
check(cartHtml.indexOf('sc-free-badge') !== -1, 'السلة توسم السطر بأنه غير مدرج');
check(cartHtml.indexOf('sc-mode-btn') === -1, 'ولا تعرض له زر تبديل السعر');
S.incSalesCartQty(idx);
eq(S._salesCart[idx].qty, 3, 'وزر + يزيد الكمية كأي سطر');
S.removeFromSalesCart(idx);
eq(S._salesCart.length, 0, 'وزر × يحذف السطر');

console.log('\n--- 6b. حدّ أقل نسبة: السطر الحر لا يُضبط ولا يُضبط عليه ---');
marginCfg.value = { enabled: true, store: { retail: 20 } };
S._salesCart.length = 0;
S.addSalesLine('دولكس\u00011111');
S.updateSalesLinePrice(0, '1');
S.addSalesFreeLine({ name: '', qty: 1, price: 1 });
eq(S._salesCart.length, 2, 'سلة فيها منتج تحت التكلفة وسطراً حراً تحت أي حد');
const viol = S.salesMarginScan(0, 0);
eq(viol.length, 1, 'التحذير يذكر السطر الحقيقي وحده: بلا بطاقة لا تكلفة تُقارن بها');
eq(viol[0].idx, 0, 'والسطر الحر (الثاني) غير مذكور');
check(viol[0].name.indexOf('دولكس') === 0, 'والمذكور هو منتج دولكس');
marginCfg.value = null;
S._salesCart.length = 0;

console.log('\n--- 7. المحرك: ربح كامل، ولا مخزون، ولا بطاقة منتج ---');
products.real.quantity = 4;
customers[0].balance = 0;
writes.merges = 0; writes.productUpdates.length = 0;
writes.invoices.length = 0; writes.payments.length = 0; writes.discounts.length = 0;
S._salesCart.length = 0;
S.addSalesLine('دولكس\u00011111');
const freeLine = S.addSalesFreeLine({ name: '', qty: 3, price: 100 });
check(S._salesCart.length === 2, 'سلة مختلطة: منتج حقيقي + سطر حر');
eq(freeLine.free, true, 'والسطر الحر معلَم كحر في السلة');
eq(S._salesCart[0].total, 250, 'وسطر المنتج الحقيقي بسعر بطاقته (1 × 250)');
eq(writes.merges, 0, 'الإضافة لا تنشئ بطاقة منتج ولا تعدّل واحدة');
const res = SaleCore.executeSale(DB, {
  lines: S._salesCart.map((l) => ({ name: l.name, barcode: l.barcode, entries: l.entries, lineDiscount: l.discount || 0 })),
  customerId: 'c1', customerDiscountPct: 0, extraDiscount: 0,
  pay: { method: 'cash', cash: 250, ccp: 0, total: 250 }, creditUsed: 0,
}, {});
eq(res.ok, true, 'المحرك يقبل السلة المختلطة');
const items = res.invoice.items;
eq(items.length, 2, 'فاتورة بسطرين');
const realItem = items.find((i) => i.productId === 'real');
const freeItem = items.find((i) => !i.productId);
check(!!realItem && !!freeItem, 'سطر حر بلا productId وسطر حقيقي بمعرّفه');
eq(freeItem.freeLine, true, 'والوسم freeLine مكتوب على عنصر الفاتورة');
eq(realItem.freeLine, undefined, 'وسطر المنتج العادي بلا وسم');
eq(freeItem.name, dictAr.freeDefaultName, 'واسمه الاسم الافتراضي');
eq(freeItem.costPrice, 0, 'بلا تكلفة');
eq(freeItem.lineProfit, 300, 'وربح السطر = المبلغ كامل (3 × 100)');
eq(freeItem.total, 300, 'وإجماليه 300');
eq(res.totalAmount, 550, 'الإجمالي يشمل السطر الحر: 250 + 300');
eq(writes.productUpdates.length, 1, 'المخزون يُنقص للمنتج الحقيقي وحده');
eq(writes.productUpdates[0].id, 'real', 'ولا يمسّ سطراً حراً');
eq(writes.productUpdates[0].changes.quantity, 3, '4 − 1 = 3 للوحدة المخزونة');
eq(writes.invoices.length, 1, 'فاتورة واحدة كُتبت');
eq(writes.invoices[0].profit, 450, 'هامش الفاتورة = هامش المنتج (150) + مبلغ السطر الحر كامل (300)');
eq(writes.payments.length, 1, 'ودفعة واحدة');
eq(customers[0].balance, 300, 'ودين العميل هو المتبقي بعد الدفع (يشمل السطر الحر)');

console.log('\n--- 8. الوسم في التقارير وصافي الحساب ---');
const netSrc = read('renderer/js/pages/net-account.js');
const repSrc = read('renderer/js/pages/reports.js');
check(netSrc.indexOf('it.freeLine') !== -1, 'صافي الحساب يقرأ وسم freeLine');
check(netSrc.indexOf("t('sales.freeNoCost')") !== -1, 'وعرضه «بلا تكلفة»');
check(repSrc.indexOf("item.productId || ('free:'") !== -1, 'تقارير الأكثر مبيعاً تجمع السطور الحرة باسمها لا بمعرّف فارغ');
check(repSrc.indexOf("free: !item.productId") !== -1, 'الأكثر مبيعاً يحفظ علم «حر» لكل مجموعة');
check(repSrc.indexOf('prod ? escHtml(prod.name) : escHtml(data.name)') !== -1, 'وبلا بطاقة منتج يُعرض الاسم المكتوب عند الكاشير');
check(repSrc.indexOf("it.productId || ('free:'") !== -1, 'وأعلى منتج في اللوحة لا ينهار إلى معرّف فارغ');
// «بلا تكلفة» بيان تكلفة داخلي: لا مكانه على تذكرة الزبون ولا في معاينتها.
check(read('renderer/js/thermal-print.js').indexOf('freeNoCost') === -1, 'الوسم لا يُطبع على التذكرة الحرارية');
check(read('renderer/js/print-paper.js').indexOf('freeNoCost') === -1, 'ولا في معاينة الطباعة');

console.log('\n--- 9. الأجهزة الفرعية لا تصنع سطراً حراً ---');
const alloc = SaleCore.allocateQty(DB, { name: String(dictAr.freeDefaultName), qty: 2, price: 100 });
eq(alloc.entries.length, 0, 'المحرك المشترك لا يجد منتجاً باسم حر: لا كمية ولا سطر');
eq(alloc.recordCount, 0, 'ولا بطاقة تقابله');
const allocReal = SaleCore.allocateQty(DB, { name: 'دولكس', barcode: '1111', productId: 'real', qty: 2, price: 250 });
eq(allocReal.entries.length, 1, 'أما المنتج الحقيقي فيُخصّص كالمعتاد');
eq(allocReal.entries[0].productId, 'real', 'وبمعرّفه');
check(read('renderer/js/phone-sale-service.js').indexOf('freeLine') === -1,
  'خدمة بيع الهاتف لا تعرف السطر الحر أصلاً (لا منفذ التفاف هناك)');

console.log('\n--- 10. اللغات الأربع ---');
['freeBtn', 'freeTitle', 'freeHint', 'freeName', 'freeNamePh', 'freeQty', 'freePrice', 'freeTotal',
  'freeAdd', 'freeDefaultName', 'freeTag', 'freeNoCost', 'freeQtyBad', 'freePriceBad'].forEach((k) => {
  check(dictAr[k] && dictEn[k] && dictFr[k] && dictZh[k], 'sales.' + k + ' موجود في العربية والإنجليزية والفرنسية والصينية');
});

console.log('\n============================================');
console.log(fail === 0 ? 'كل الفحوص نجحت — pass=' + pass + ' fail=0' : 'فشل: pass=' + pass + ' fail=' + fail);
console.log('============================================');
if (fail) process.exitCode = 1;
