// ============================================================
// ZMT PIECE — guards for the five requested enhancements
// Run: node renderer/tests/requested-features-verify.js
//
//   1. sale invoice lines can be removed and hand-typed lines added,
//      with stock / returns / totals / profit recomputed — in BOTH edit
//      entry points (invoices page and customer-detail page).
//   2. the «اختيار زبون تابع» button exists in Sales, follows the tree flag
//      and the selected parent, and F5 still opens the tree.
//   3. a direct customer payment deducts debt, allows a negative balance,
//      and can be edited / deleted (all as one Payment row).
//   4. Display Settings exposes the two FormLayout price fill buttons,
//      which write only missing / zero prices, rounded to 2 decimals.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log('  FAIL ' + m); } };
const section = (m) => console.log('\n=== ' + m + ' ===');

const inv = read('renderer/js/pages/invoices.js');
const cd = read('renderer/js/pages/customer-detail.js');
const salesJs = read('renderer/js/pages/sales.js');
const salesHtml = read('renderer/pages/sales.html');
const cdHtml = read('renderer/pages/customer-detail.html');
const ds = read('renderer/js/display-settings.js');

section('1) sale invoice line deletion + manual line');
check(/function markInvEditRemove\(i\)/.test(inv), 'invoices page can mark a line for removal');
check(/function addInvEditFreeLine\(\)/.test(inv), 'invoices page can stage a hand-typed line');
check(/_isFree: true, freeLine: true/.test(inv), 'hand-typed line is flagged freeLine without a product');
check(/_invEditRemoved\.includes\(i\)/.test(inv), 'live totals skip removed lines');
check(/تعديل فاتورة \(حذف سطر\)/.test(inv), 'removed sale line writes a return row');
check(/reason: 'تعديل فاتورة \(حذف سطر\)'/.test(inv), 'return reason recorded on line removal');
check(/const newProfit = updatedItems\.reduce/.test(inv), 'profit recomputed from the remaining lines');
check(/function markCdEditRemove\(i\)/.test(cd), 'customer-detail can mark a line for removal');
check(/function addCdFreeLine\(\)/.test(cd), 'customer-detail can stage a hand-typed line');
check(/freeLine: true/.test(cd), 'customer-detail free line carries freeLine flag');
check(/_cdEditRemoved\.includes\(i\)/.test(cd), 'customer-detail preview skips removed lines');
check(/ch\.removed/.test(cd), 'customer-detail applies stock returns for removed lines');
check(/const newProfit = inv\.items\.reduce/.test(cd), 'customer-detail recomputes profit');

section('2) «اختيار زبون تابع» button + F5');
check(/id="salesPickSubBtn"/.test(salesHtml), 'button exists in the sales markup');
check(/onclick="openSalesSubCustomerModal\(\)"/.test(salesHtml), 'button opens the sub-customer picker');
check(/data-i18n-title="sales\.pickSubCustomer"/.test(salesHtml), 'button title is localised');
check(/function _syncSalesPickSubBtn\(\)/.test(salesJs), 'visibility is synchronised');
check(/_salesTreeEnabled\(\) && !!_salesCustomerId/.test(salesJs), 'button hidden when tree off or no parent');
check(/_syncSalesPickSubBtn\(\);/.test(salesJs), 'sync is called on customer changes');
check(/e\.key === 'F5' \|\| e\.code === 'F5'/.test(salesJs), 'F5 shortcut still handled');
check(!/e\.key === 'F5'[\s\S]{0,120}return;\s*\/\/ disabled/.test(salesJs), 'F5 not disabled by the button');

section('3) direct customer payment');
check(/id="cdDirectPaymentModal"/.test(cdHtml), 'direct-payment modal exists');
check(/onclick="openCdDirectPayment\(\)"/.test(cdHtml), 'add button opens the modal');
check(/function saveCdDirectPayment\(\)/.test(cd), 'save handler exists');
check(/type: 'customer_direct'/.test(cd), 'payment tagged as a direct collection');
check(/DB\.updatePayment\(_cdDirectPayEditId/.test(cd), 'editing updates the same payment row');
check(/DB\.deletePayment\(id\)/.test(cd), 'deleting removes the payment row');
check(/_cdAdjustBalance\(-amount\)/.test(cd), 'payment reduces the customer debt');
check(/_cdAdjustBalance\(\(Number\(old\.amount\) \|\| 0\) - amount\)/.test(cd), 'editing replaces the old deduction');
check(/_cdAdjustBalance\(Number\(p\.amount\) \|\| 0\)/.test(cd), 'deleting restores the balance');
check(!/Math\.max\(0,[\s\S]{0,60}balance/.test(cd.slice(cd.indexOf('function _cdAdjustBalance'), cd.indexOf('function _cdAdjustBalance') + 500)), 'balance is allowed to go negative');
check(/getCashInEvents\(opts\)/.test(read('renderer/js/db.js')), 'cash-in helper is defined in db.js');
check(/p\.type === 'customer_direct' \? 'direct' : 'payment'/.test(read('renderer/js/db.js')), 'cash-in helper books direct payments as revenue');

section('4) display-settings price tools');
check(/id="dsApplyMinPrice"/.test(ds), 'min-price button exists');
check(/id="dsApplySellPrice"/.test(ds), 'sell-price button exists');
check(/dsApplyPrice\('minPrice'\)/.test(ds), 'min-price button applies the minPrice band');
check(/dsApplyPrice\('sellPrice'\)/.test(ds), 'sell-price button applies the sell band');
check(/FL\.bands\(\)/.test(ds), 'bands come from FormLayout');
check(/FL\.bandFor\(base, bands\)/.test(ds), 'band chosen from the buy price');
check(/sellPrice: 'sell', minPrice: 'minPrice'/.test(ds), 'product sellPrice maps to FormLayout sell band key');
check(/pcts\[pctKey\]/.test(ds), 'percentage read from the mapped band key');
check(/FL\.applyPercent\(base, pct\)/.test(ds), 'percentage applied with FormLayout helper');
check(/isFinite\(current\) && current > 0\) return/.test(ds), 'existing non-zero prices are never overwritten');
check(/Math\.round\(value \* 100\) \/ 100/.test(ds), 'written prices rounded to 2 decimals');
check(/if \(!confirm\(msg\)\) return/.test(ds), 'confirmation shows the product count');
check(/%n/.test(ds), 'product count is shown in the confirmation');

const summary = fails ? 'FAILED (' + fails + ')' : 'ALL PASS';
console.log('\n' + summary);
process.exitCode = fails ? 1 : 0;
