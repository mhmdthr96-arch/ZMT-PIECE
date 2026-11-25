'use strict';
// ============================================================================
// Shared minimal DOM for the behavioural verifiers.
//
// It parses REAL shipped markup, so every getElementById inside a page script
// under test only resolves when the id actually exists in the .html file the
// app loads. Nothing here writes to disk.
// ============================================================================
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
    this.style = {
      setProperty(k, v) { this[k] = v; },
      getPropertyValue(k) { return this[k] == null ? '' : this[k]; },
      removeProperty(k) { delete this[k]; },
    };
    this.listeners = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
  }
  get tagName() { return this.tag.toUpperCase(); }
  // The app refuses to paint into a container that is not in the document; a
  // detached mini-DOM node has to answer the same way the browser does.
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node.nodeType === 9;
  }
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
  appendChild(node) {
    // Browsers MOVE an existing child to the end; duplicating it would corrupt
    // the drag-reordering verifiers (the real pages rely on this behaviour).
    if (node.parentNode) {
      const i = node.parentNode.children.indexOf(node);
      if (i !== -1) node.parentNode.children.splice(i, 1);
    }
    node.parentNode = this; this.children.push(node); return node;
  }
  insertBefore(node, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    node.parentNode = this;
    if (i === -1) this.children.push(node); else this.children.splice(i, 0, node);
    return node;
  }
  replaceChild(node, old) {
    const i = this.children.indexOf(old);
    if (i === -1) return old;
    node.parentNode = this;
    this.children[i] = node;
    old.parentNode = null;
    return old;
  }
  cloneNode(deep) {
    const c = new El(this.tag);
    c.attrs = Object.assign({}, this.attrs);
    c.style = Object.assign({}, this.style);
    c.value = this.value;
    c.checked = this.checked;
    c.disabled = this.disabled;
    if (deep) {
      this.children.forEach((ch) => {
        c.appendChild(ch.nodeType === 1 ? ch.cloneNode(true) : new TextNode(ch.text));
      });
    }
    return c;
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
  // Modal builders append the element they just parsed out of a template
  // string, so the element-only child accessors have to answer.
  get firstElementChild() { return this.children.filter((c) => c.nodeType === 1)[0] || null; }
  get lastElementChild() { const els = this.children.filter((c) => c.nodeType === 1); return els[els.length - 1] || null; }
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
  focus() {
    // Walk to this node's own document: the verifiers run more than one page
    // tree side by side, and the focus has to land where the browser would put it.
    let root = this;
    while (root && root.parentNode) root = root.parentNode;
    if (root && root.nodeType === 9 && '_activeElement' in root) root._activeElement = this;
    else doc._activeElement = this;
  }
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
  // :not(.cls) and friends — the pickers ask for "the rows that are not
  // disabled", so an unsupported :not would count exactly the wrong ones.
  const negated = [];
  const plain = String(sel).replace(/:not\(([^)]*)\)/g, (m, inner) => { negated.push(inner.trim()); return ''; });
  if (negated.some((n) => matches(el, n))) return false;
  return matchesSimple(el, plain);
}

function matchesSimple(el, sel) {
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

function createDoc() {
  const d = {
    readyState: 'complete',
    _activeElement: null,
    children: [],
    nodeType: 9,
    createElement: (t) => new El(t),
    getElementById(id) {
      let hit = null;
      walk(d, (el) => { if (!hit && el.id === String(id)) hit = el; });
      return hit;
    },
    querySelector(sel) { return d.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const out = [];
      walk(d, (el) => { if (matchesCompound(el, sel)) out.push(el); });
      return out;
    },
    addEventListener(type, fn) { (d.listeners[type] = d.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      const l = d.listeners[type] || [];
      const i = l.indexOf(fn);
      if (i !== -1) l.splice(i, 1);
    },
    // Page scripts announce config changes with custom events; the app also cleans
    // up its global handlers on unload, so both need to be answered.
    dispatchEvent(ev) {
      const type = ev && ev.type;
      (d.listeners[type] || []).forEach((fn) => { try { fn(ev); } catch (e) { console.log('listener threw: ' + e.message); } });
      return true;
    },
    listeners: {},
  };
  d.head = new El('head'); d.head.parentNode = d; d.children.push(d.head);
  d.body = new El('body'); d.body.parentNode = d; d.children.push(d.body);
  d.documentElement = new El('html'); d.documentElement.parentNode = d;
  return d;
}

const doc = createDoc();
doc.fire = function (type, extra) {
  const ev = Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, extra || {});
  (this.listeners[type] || []).forEach((fn) => fn(ev));
  return ev;
};

module.exports = { El, TextNode, doc, createDoc, parseInto, serialize, walk, matchesCompound, matches, syncControls };
