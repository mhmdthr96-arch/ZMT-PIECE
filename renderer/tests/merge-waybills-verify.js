'use strict';
/*
 * Permanent verifier for release 2.8.0:
 *
 *   1) the «فاتورة طريق» -> «فاتورة طريق / وصل تسليم» rename is applied in every
 *      user-visible place and in all four languages (internal type stays
 *      'waybill');
 *   2) the waybill-merge feature ships with all its UI hooks, i18n keys and the
 *      non-negotiable invariants (stock untouched, exact totals, balance delta,
 *      snapshot + audit, no schema change);
 *   3) the behavioral test (merge-waybills-behavior.js) still passes.
 *
 * Run:  npm run verify:merge   (node renderer/tests/merge-waybills-verify.js)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = (...p) => path.join(__dirname, '..', ...p);
const read = (...p) => fs.readFileSync(R(...p), 'utf8');

const invoicesHtml = read('pages', 'invoices.html');
const cdHtml = read('pages', 'customer-detail.html');
const appJs = read('js', 'app.js');
const cdJs = read('js', 'pages', 'customer-detail.js');
const invoicesJs = read('js', 'pages', 'invoices.js');
const dbJs = read('js', 'db.js');
const css = read('css', 'main.css');
const pkg = JSON.parse(read('..', 'package.json'));
let notes = '';
try { notes = read('..', 'release-notes.md'); } catch (e) { notes = ''; }

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) pass++; else { fail++; failures.push(label); }
}
function has(text, needle, label) {
  ok(text.indexOf(needle) !== -1, label);
}
function hasNot(text, needle, label) {
  ok(text.indexOf(needle) === -1, label);
}

// ===========================================================================
// 1) THE RENAME
// ===========================================================================
const AR_NEW = 'فاتورة طريق / وصل تسليم';

has(invoicesHtml, 'data-i18n="invoices.typeWaybill">' + AR_NEW + '</span>',
  'rename: new-invoice menu label is «فاتورة طريق / وصل تسليم»');
ok(/data-i18n="invoices\.typeWaybill"[\s\S]{0,40}وصل تسليم/.test(invoicesHtml),
  'rename: waybill form title carries «وصل تسليم»');
has(invoicesHtml, 'وصل تسليم — Bon de livraison',
  'rename: menu subtitle shows the delivery-note wording');
hasNot(invoicesHtml, 'data-i18n="invoices.typeWaybill">فاتورة طريق<',
  'rename: the bare old label is gone from the menu');

has(appJs, "typeWaybill: '" + AR_NEW + "'", 'rename: ar label updated');
ok(/typeWaybill: '[^']*Delivery Note[^']*'/.test(appJs), 'rename: en label mentions Delivery Note');
ok(/typeWaybill: '[^']*送货单[^']*'/.test(appJs), 'rename: zh label mentions 送货单');
ok(!/typeWaybill: 'فاتورة طريق',/.test(appJs), 'rename: no bare ar label remains in app.js');
// fr keeps 'Bon de Livraison', which already means "وصل تسليم"
ok(/typeWaybill: 'Bon de Livraison'/.test(appJs), 'rename: fr keeps Bon de Livraison (means delivery note)');

has(invoicesJs, "if (inv.type === 'waybill') return 'BON DE LIVRAISON';",
  'rename: printed document type line unchanged (French = delivery note)');
has(notes || 'x', '2.8.0', 'rename: release-notes.md has a 2.8.0 section');

// The internal type must NOT change.
has(cdJs, "inv.type === 'waybill'", 'invariant: detection still keys on internal type "waybill"');
has(cdJs, "type: 'customer'", 'invariant: the merged invoice is a sale invoice (type customer)');

// ===========================================================================
// 2) MERGE UI HOOKS
// ===========================================================================
['cdMergeBtn', 'cdMergeCount', 'cdMergeModal', 'cdMergeList', 'cdMergeDate', 'cdMergeTime',
  'cdMergeSinglePay', 'cdMergeMixedPay', 'cdMergePaid', 'cdMergeCash', 'cdMergeCcp',
  'cdMergeRecorded', 'cdMergeSummary', 'cdMergeConfirmBtn'].forEach(id => {
  has(cdHtml, 'id="' + id + '"', 'ui: customer-detail.html has #' + id);
});
has(cdHtml, 'onclick="openCdMerge()"', 'ui: merge button is wired to openCdMerge()');
has(cdHtml, 'data-i18n="merge.button"', 'ui: merge button label is translated');
has(cdHtml, 'data-i18n="merge.stockSafe"', 'ui: dialog reassures that stock is not affected');
has(cdHtml, "onclick=\"cdMergeSetMethod('cash')\"", 'ui: cash method pill');
has(cdHtml, "onclick=\"cdMergeSetMethod('ccp')\"", 'ui: ccp method pill');
has(cdHtml, "onclick=\"cdMergeSetMethod('mixed')\"", 'ui: mixed method pill');

[['cd-merge-list', 'list container'], ['cd-merge-row', 'row'], ['cd-merge-block', 'section block'],
  ['cd-merge-summary', 'summary box'], ['cd-merge-sum-line', 'summary line']].forEach(([cls, what]) => {
  has(css, '.' + cls, 'ui: css has .' + cls + ' (' + what + ')');
});

// ===========================================================================
// 3) MERGE LOGIC + INVARIANTS
// ===========================================================================
const mergeSection = cdJs.slice(cdJs.indexOf('// ===== MERGE WAYBILLS'));

['openCdMerge', 'closeCdMerge', 'cdMergeSelectAll', 'cdMergeSelectNone', 'cdMergeToggle',
  'cdMergeSetMethod', 'cdMergeGetPay', 'cdMergeBuildItems', 'cdMergeRenderList',
  'cdMergeRefresh', 'cdMergeConfirm', 'cdUpdateMergeBtn', 'cdWaybills', 'cdMergeSelected',
  'cdMergePayFull', '_cdMergeRecorded', '_cdMergeOldRemaining', '_cdLocalParts'].forEach(fn => {
  has(mergeSection, 'function ' + fn + '(', 'logic: defines ' + fn + '()');
});

has(mergeSection, 'function cdMergeBuildItems', 'logic: item merging is implemented');
ok(/productId[\s\S]{0,120}price[\s\S]{0,120}\.toFixed\(4\)/.test(mergeSection),
  'logic: item identity key = product + price (+ discount) -> identical lines only');
has(mergeSection, 'inv.isProvisional', 'logic: proforma waybills are excluded');

// exact totals
has(mergeSection, 'const totalAmount = sel.reduce((s, w) => s + (w.totalAmount || 0), 0);',
  'logic: totalAmount is the exact sum of the waybills');
ok(/extraDiscount = sel\.reduce/.test(mergeSection), 'logic: extraDiscount is summed, not recomputed');
ok(/timbreFiscal = sel\.reduce/.test(mergeSection), 'logic: timbreFiscal is summed');
ok(/profit = sel\.reduce/.test(mergeSection), 'logic: profit is summed');

// stock must never be touched
hasNot(mergeSection, 'updateProduct(', 'invariant: merge never calls updateProduct()');
hasNot(mergeSection, 'updateProductsBatch(', 'invariant: merge never calls updateProductsBatch()');
hasNot(mergeSection, 'addReturn(', 'invariant: merge never creates a return');
hasNot(mergeSection, 'deleteReturnsByInvoice', 'invariant: merge never deletes returns');
hasNot(mergeSection, 'deleteDiscountsByInvoice', 'invariant: merge never deletes discounts');
hasNot(mergeSection, 'rollback', 'invariant: no stock rollback path in the merge');
has(mergeSection, 'DB.deleteInvoice(', 'invariant: waybills are removed via deleteInvoice only (records)');

// payments
has(mergeSection, 'DB.deletePaymentsByInvoice(', 'logic: old waybill payments are removed');
has(mergeSection, 'DB.addPayment(', 'logic: the chosen payment is recorded');
ok(/method: pay\.method/.test(mergeSection), 'logic: payment method is stored');
has(mergeSection, 'pmt.cashAmount = pay.cash;', 'logic: mixed split stores the cash part');
has(mergeSection, 'pmt.ccpAmount = pay.ccp;', 'logic: mixed split stores the CCP part');

// returns / discounts re-pointed
has(mergeSection, 'DB.saveReturns(', 'logic: returns are re-pointed via saveReturns');
has(mergeSection, 'DB.saveDiscounts(', 'logic: discounts are re-pointed via saveDiscounts');
ok(/r\.invoiceId = inv\.id/.test(mergeSection), 'logic: return.invoiceId is re-pointed to the new invoice');
ok(/d\.invoiceId = inv\.id/.test(mergeSection), 'logic: discount.invoiceId is re-pointed to the new invoice');

// balance delta
ok(/balanceDelta = remaining - _cdMergeOldRemaining\(sel\)/.test(mergeSection),
  'logic: balance delta = new remainder - old remainders (== old paid - new paid)');
has(mergeSection, 'customers[cIdx].balance = (parseFloat(customers[cIdx].balance) || 0) + balanceDelta;',
  'logic: the delta is applied to the customer balance');
ok(/if \(Math\.abs\(balanceDelta\) > 0\.004\)/.test(mergeSection),
  'logic: no balance write at all when the debt does not change');

// date / createdAt / number
has(mergeSection, 'date: chosenTs', 'logic: invoice date = the chosen date+time');
has(mergeSection, 'DB.updateInvoice(inv.id, { createdAt: chosenTs })',
  'logic: createdAt is aligned so period reports count the chosen month');
has(dbJs, 'getNextInvoiceNumber(year)', 'logic: getNextInvoiceNumber accepts an explicit year');
has(dbJs, 'const y = (typeof year === \'number\' && isFinite(year)) ? year : new Date().getFullYear();',
  'logic: number year falls back to today for every other caller');
has(dbJs, 'this.getNextInvoiceNumber(opts && opts.numberYear)',
  'logic: addInvoice only overrides the year when explicitly asked');
has(cdJs, "{ numberYear: chosen.getFullYear() }", 'logic: the merge asks for the chosen year');
hasNot(dbJs, 'getNextInvoiceNumber(inv.date)',
  'invariant: normal and imported invoices keep today\'s year (scoped change)');

// snapshot + audit
has(mergeSection, 'mergeSnapshot: snapshot', 'logic: a full snapshot of the merged waybills is stored');
has(mergeSection, 'mergedFrom,', 'logic: the mergedFrom list is stored on the invoice');
has(mergeSection, "action: 'merge'", 'logic: an audit entry is written');
ok(/DB\.getInvoicePayments\(w\.id\)/.test(mergeSection), 'logic: snapshot keeps each waybill payment');
ok(/DB\.getReturns\(\)\.filter/.test(mergeSection), 'logic: snapshot keeps each waybill return');

// permissions: available to everyone (no gating)
hasNot(mergeSection, 'can(', 'invariant: no permission gate on the merge');
hasNot(mergeSection, 'hasPermission', 'invariant: no permission gate on the merge');
hasNot(mergeSection, 'Auth.', 'invariant: merge does not require any role');

// ===========================================================================
// 4) VERSION
// ===========================================================================
function semverGte(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return true;
}
ok(semverGte(pkg.version, '2.8.0'), 'version: package.json is >= 2.8.0 (got ' + pkg.version + ')');
ok(!!(pkg.scripts && pkg.scripts['verify:merge']), 'version: npm run verify:merge is wired');

// ===========================================================================
// 5) i18n COMPLETENESS (merge.* in ar / en / fr / zh)
// ===========================================================================
const MERGE_KEYS = ['button', 'title', 'hint', 'listTitle', 'selectAll', 'selectNone', 'none',
  'empty', 'dateTime', 'date', 'time', 'payTitle', 'recorded', 'summary', 'selCount',
  'sumTotal', 'sumPaid', 'sumRemaining', 'debtDelta', 'stockSafe', 'confirm', 'selectAtLeast',
  'needDate', 'paidExceeds', 'confirmTitle', 'confirmMsg', 'done', 'payNote', 'mergedNote', 'waybillNo'];

const i18nStart = appJs.indexOf('function mergeI18n');
const i18nEnd = appJs.indexOf('const LANG_LABELS', i18nStart);
const i18nBlock = appJs.slice(i18nStart, i18nEnd);
ok(i18nStart !== -1 && i18nEnd > i18nStart, 'i18n: mergeI18n block exists before LANG_LABELS');

const langPos = ['ar', 'en', 'fr', 'zh']
  .map(l => ({ l, p: i18nBlock.indexOf('\n    ' + l + ': {') }))
  .filter(x => x.p >= 0)
  .sort((a, b) => a.p - b.p);
ok(langPos.length === 4, 'i18n: all four language sets present (got ' + langPos.length + ')');
langPos.forEach((x, i) => {
  const body = i18nBlock.slice(x.p, i + 1 < langPos.length ? langPos[i + 1].p : i18nBlock.length);
  const missing = MERGE_KEYS.filter(k => !new RegExp('\\b' + k + ':').test(body));
  ok(missing.length === 0, 'i18n: ' + x.l + ' defines all ' + MERGE_KEYS.length +
    ' merge keys' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
});

// ===========================================================================
// 6) i18n AT RUNTIME — execute the real mergeI18n IIFE against a LANG stub
// ===========================================================================
try {
  const iifeStart = appJs.indexOf('(function mergeI18n');
  const iifeEnd = appJs.indexOf('\n})();', iifeStart);
  ok(iifeStart !== -1 && iifeEnd > iifeStart, 'i18n(dynamic): mergeI18n IIFE located');
  const code = appJs.slice(iifeStart, iifeEnd + 5);
  const LANG = { ar: {}, en: {}, fr: {}, zh: {} };
  vm.runInContext(code, vm.createContext({ LANG }));
  ok(!!(LANG.ar.merge && LANG.en.merge && LANG.fr.merge && LANG.zh.merge),
    'i18n(dynamic): mergeI18n populates all four languages');
  ['ar', 'en', 'fr', 'zh'].forEach(l => {
    const m = (LANG[l] || {}).merge || {};
    const missing = MERGE_KEYS.filter(k => !(k in m));
    ok(missing.length === 0, 'i18n(dynamic): ' + l + ' resolves every merge key at runtime' +
      (missing.length ? ' (missing ' + missing.join(',') + ')' : ''));
  });
  ok(LANG.en.merge.button === 'Merge delivery notes', 'i18n(dynamic): en button text resolves');
  ok(LANG.ar.merge.button === 'دمج وصل التسليم', 'i18n(dynamic): ar button text resolves');
} catch (e) {
  fail = fail + 1;
  failures.push('i18n(dynamic): threw ' + (e && e.message ? e.message : e));
}

// ===========================================================================
// 7) BEHAVIORAL TEST
// ===========================================================================
try {
  const b = require('./merge-waybills-behavior.js').run();
  pass += b.pass;
  fail += b.fail;
  b.failures.forEach(f => failures.push('behavior: ' + f));
} catch (e) {
  fail++;
  failures.push('behavior: threw ' + (e && e.message ? e.message : e));
}

// ===========================================================================
const total = pass + fail;
console.log('\n' + '='.repeat(64));
console.log('merge-waybills verifier: ' + pass + '/' + total + ' checks passed');
console.log('='.repeat(64));
if (fail) {
  console.log('\nFAILED:');
  failures.forEach(f => console.log('  x ' + f));
  process.exit(1);
}
