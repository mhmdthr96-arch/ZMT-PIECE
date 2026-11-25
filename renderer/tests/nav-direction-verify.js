// ============================================================
// ZMT PIECE — arrow-key direction follows the UI language
// Run: node renderer/tests/nav-direction-verify.js
//
// The cashier must never have to guess: in Arabic the first cell is on
// the right, so Right walks backwards and Left forwards; in English /
// French / Chinese the same arrows walk the visual direction of the
// layout. Vertical arrows are unchanged. The real handlers are copied out
// of the page scripts and executed against a tiny DOM, so this test fails
// if the shipped logic ever drifts.
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const qeSrc = read('renderer/js/pages/quick-entry.js');
const smartSrc = read('renderer/js/pages/invoices-smart.js');
const salesSrc = read('renderer/js/pages/sales.js');

let fails = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
const check = (cond, m) => (cond ? ok(m) : bad(m));

function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing function ' + name);
  let depth = 0, started = false, end = i;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { end = j + 1; break; } }
  }
  return src.slice(i, end);
}
function grabAssignment(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) throw new Error('missing assignment: ' + marker);
  let depth = 0, started = false, end = i;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { end = j + 1; break; } }
  }
  return src.slice(i, end);
}
function newCtx(extra) {
  const sandbox = Object.assign({ console }, extra || {});
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}
const ev = (key) => ({ key, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} });

// ============================================================
console.log('============================================');
console.log('arrow-key navigation follows <html dir>');
console.log('============================================');

// ---------------------------------------------------------- 1. source ----
console.log('\n--- 1. handlers read the direction helper ---');
{
  const qeNav = qeSrc.slice(qeSrc.indexOf('function navigate('), qeSrc.indexOf('function onProductKey('));
  check(/window\.isRTL/.test(qeNav), 'quick-entry navigate consults isRTL');
  check(/rtl \? Math\.max\(0, ci - 1\) : Math\.min/.test(qeNav),
    'quick-entry Right walks back in RTL and forward in LTR');

  const smart = smartSrc.slice(smartSrc.indexOf('window.smartKeydown = function (e)'), smartSrc.indexOf('// Attach once at document level'));
  check(/window\.isRTL/.test(smart), 'smart invoice grid consults isRTL');

  const free = salesSrc.slice(salesSrc.indexOf('function salesFreeKeyNav('), salesSrc.indexOf('function addToSalesCart('));
  check(/window\.isRTL/.test(free), 'sales free-line form consults isRTL');

  const qk = grabFn(salesSrc, '_qkHandler');
  check(/_qkRtl/.test(qk) && /window\.isRTL/.test(qk), 'sales quantity modal consults isRTL');
  check(/_qkUp \|\| \(_qkRtl \? _qkRight : _qkLeft\)/.test(qk), 'quantity modal keeps Up/Down and flips Left/Right');
}

// ---------------------------------------------------------- 2. quick-entry ----
console.log('\n--- 2. quick-entry row navigation ---');
{
  const cells = [0, 1, 2].map(() => ({
    _i: 0,
    focus() { this._focused = true; },
    select() { this._selected = true; },
  }));
  cells.forEach((c, i) => { c._i = i; c.closest = () => ({ dataset: { uid: '1' } }); });
  const target = { id: 'qeRow_1' };
  let rtl = true;
  const box = newCtx({
    _qeRows: [{ uid: 1 }],
    rowNavEls: () => cells,
    document: { getElementById: (id) => (id === 'qeRow_1' ? target : null) },
    isRTL: () => rtl,
    findNavKeyIn: () => null,
    navKeyOf: () => 'col:qty',
  });
  vm.runInContext(grabFn(qeSrc, 'navigate'), box, { filename: 'quick-entry.js#navigate' });
  const press = (from, key) => {
    cells.forEach((c) => { c._focused = false; });
    box.navigate(cells[from], key);
    return cells.findIndex((c) => c._focused);
  };

  rtl = true;
  check(press(1, 'ArrowRight') === 0, 'AR: Right moves to the cell on the right (previous index)');
  check(press(1, 'ArrowLeft') === 2, 'AR: Left moves to the cell on the left (next index)');
  check(press(1, 'ArrowUp') === 1 && press(1, 'ArrowDown') === 1, 'AR: Up/Down keep the same column');

  rtl = false;
  check(press(1, 'ArrowRight') === 2, 'LTR: Right advances');
  check(press(1, 'ArrowLeft') === 0, 'LTR: Left goes back');
  check(press(1, 'ArrowUp') === 1 && press(1, 'ArrowDown') === 1, 'LTR: Up/Down keep the same column');
}

// ---------------------------------------------------------- 3. smart grid ----
console.log('\n--- 3. smart invoice grid ---');
{
  const modal = { style: { display: '' } };
  let rtl = true;
  let focus = null;
  const box = newCtx({
    _smartRows: [{}, {}],
    smartCols: () => ['name', 'qty', 'price', 'sell'],
    smartFocus: (col, row) => { focus = { col, row }; },
    document: { getElementById: (id) => (id === 'smartEditModal' ? modal : null) },
    isRTL: () => rtl,
    closeSmartEdit: () => {},
    addSmartRow: () => {},
  });
  vm.runInContext(grabAssignment(smartSrc, 'window.smartKeydown = function (e) {'), box, { filename: 'invoices-smart.js#smartKeydown' });
  const press = (key, colIndex) => {
    const input = { dataset: { col: ['name', 'qty', 'price', 'sell'][colIndex], row: '1' }, tagName: 'INPUT' };
    focus = null;
    box.smartKeydown(Object.assign(ev(key), { target: input }));
    return focus;
  };

  rtl = true;
  check(JSON.stringify(press('ArrowRight', 1)) === JSON.stringify({ col: 'name', row: 1 }), 'AR: Right moves right (name)');
  check(JSON.stringify(press('ArrowLeft', 1)) === JSON.stringify({ col: 'price', row: 1 }), 'AR: Left moves left (price)');
  check(JSON.stringify(press('ArrowUp', 1)) === JSON.stringify({ col: 'qty', row: 0 }), 'AR: Up stays in the same column');

  rtl = false;
  check(JSON.stringify(press('ArrowRight', 1)) === JSON.stringify({ col: 'price', row: 1 }), 'LTR: Right advances (price)');
  check(JSON.stringify(press('ArrowLeft', 1)) === JSON.stringify({ col: 'name', row: 1 }), 'LTR: Left goes back (name)');
  check(JSON.stringify(press('ArrowDown', 1)) === JSON.stringify({ col: 'qty', row: 1 }), 'LTR: Down stays in the same column');
}

// ---------------------------------------------------------- 4. sales free line ----
console.log('\n--- 4. sales free-line form ---');
{
  let rtl = true;
  const fields = ['a', 'b', 'c'];
  const els = {};
  fields.forEach((id) => { els[id] = { id, focus() { this._focused = true; }, select() {} }; });
  const box = newCtx({
    FREE_FIELDS: fields,
    document: { getElementById: (id) => els[id] || null },
    isRTL: () => rtl,
    closeSalesFreeLine: () => {},
    confirmSalesFreeLine: () => {},
  });
  vm.runInContext(grabFn(salesSrc, 'salesFreeKeyNav'), box, { filename: 'sales.js#salesFreeKeyNav' });
  const press = (from, key) => {
    fields.forEach((id) => { els[id]._focused = false; });
    box.salesFreeKeyNav(Object.assign(ev(key), { target: { id: fields[from] } }));
    return fields.findIndex((id) => els[id]._focused);
  };

  rtl = true;
  check(press(1, 'ArrowDown') === 2, 'AR: Down advances');
  check(press(1, 'ArrowLeft') === 2, 'AR: Left advances');
  check(press(1, 'ArrowRight') === 0, 'AR: Right goes back');
  check(press(1, 'ArrowUp') === 0, 'AR: Up goes back');

  rtl = false;
  check(press(1, 'ArrowDown') === 2, 'LTR: Down advances');
  check(press(1, 'ArrowRight') === 2, 'LTR: Right advances');
  check(press(1, 'ArrowLeft') === 0, 'LTR: Left goes back');
  check(press(1, 'ArrowUp') === 0, 'LTR: Up goes back');
}

// ---------------------------------------------------------- 5. sales qty modal ----
console.log('\n--- 5. sales quantity modal ---');
{
  let rtl = true;
  let renders = 0;
  const scan = { value: '' };
  const box = newCtx({
    _qkOpen: true,
    _salesCart: [{}, {}, {}],
    _qkIndex: 1,
    _qkBuffer: 'x',
    _qkRender: () => { renders++; },
    document: { getElementById: (id) => (id === 'salesBarcodeScan' ? scan : null) },
    isRTL: () => rtl,
    closeSalesQtyQuick: () => {},
    removeFromSalesCart: () => {},
    salesLineMaxQty: () => 99,
  });
  vm.runInContext(grabFn(salesSrc, '_qkHandler'), box, { filename: 'sales.js#_qkHandler' });
  const press = (key) => { box._qkIndex = 1; box._qkBuffer = null; box._qkHandler(ev(key)); return box._qkIndex; };

  rtl = true;
  check(press('ArrowRight') === 0, 'AR: Right selects the previous item');
  check(press('ArrowLeft') === 2, 'AR: Left selects the next item');
  check(press('ArrowUp') === 0, 'AR: Up selects the previous item');
  check(press('ArrowDown') === 2, 'AR: Down selects the next item');

  rtl = false;
  check(press('ArrowRight') === 2, 'LTR: Right selects the next item');
  check(press('ArrowLeft') === 0, 'LTR: Left selects the previous item');
  check(press('ArrowUp') === 0, 'LTR: Up selects the previous item');
  check(press('ArrowDown') === 2, 'LTR: Down selects the next item');
  check(renders > 0, 'the modal repaints on every move');
}

console.log('\n============================================');
console.log((fails === 0 ? 'PASS' : 'FAIL') + ' — fail=' + fails);
console.log('============================================');
process.exit(fails === 0 ? 0 : 1);
