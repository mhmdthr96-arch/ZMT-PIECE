// ============================================================================
// ZMT PIECE — تواريخ الفواتير المستوردة من البرنامج القديم — فحص دائم
// Run: node renderer/tests/imported-invoice-dates-verify.js
//
// يثبّت أن:
//   1) مستورد الفواتير (بيع + شراء) يمرّر keepCreatedAt و numberYear الصحيحين،
//      فتُحفظ التواريخ التاريخية بدل تاريخ يوم الاستيراد من الآن فصاعداً.
//   2) إصلاح البيانات الموجودة يلمس `createdAt` فقط، وفقط للفواتير المستوردة،
//      ولا يغيّر الأرقام أو المبالغ أو المنتجات أو العملاء أو الدفعات أو الوسوم.
//   3) الإصلاح idempotent ولا يلمس الفواتير العادية ولا سندات الأطفال.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const section = (name) => console.log('\n=== ' + name + ' ===');

const migSrc = read('renderer/js/pages/data-migration.js');
const dbJs = read('renderer/js/db.js');

// ---------------------------------------------------------------- 1) ثابت ====
section('1) مستورد البرنامج القديم يحتفظ بالتاريخ الصحيح');
for (const [prefix, label] of [
  ['فاتورة مستوردة من البرنامج القديم', 'فواتير البيع'],
  ['فاتورة شراء مستوردة', 'فواتير الشراء'],
]) {
  const at = migSrc.indexOf("note: '" + prefix + " — '");
  check(at !== -1, label + ': نموذج الملاحظة موجود');
  if (at !== -1) {
    const window = migSrc.slice(Math.max(0, at - 300), at + 900);
    check(window.includes('createdAt: invDate'), label + ': createdAt يُملأ بالتاريخ التاريخي');
    check(/DB\.addInvoice\(invData, \{ keepCreatedAt: true, numberYear: invYear \}\)/.test(window),
      label + ': addInvoice يستلم keepCreatedAt و numberYear');
    check(window.includes('const invYear = new Date(invDate).getFullYear();'),
      label + ': سنة الرقم مأخوذة من تاريخ الفاتورة');
  }
}

// ------------------------------------------------------- 2) الإصلاح ثابتاً ====
section('2) إصلاح البيانات الموجودة: نطاق ضيّق جدا');
const START = '  const _IMPORTED_INVOICE_NOTES = [';
const END = '  // END imported invoice date repair';
const s = dbJs.indexOf(START);
const e = dbJs.indexOf(END);
check(s !== -1 && e !== -1 && e > s, 'كتلة الإصلاح موجودة في db.js');
const repairBlock = (s !== -1 && e !== -1) ? dbJs.slice(s, e) : '';
check(repairBlock.includes('async function _repairImportedInvoiceDates()'), 'دالة الإصلاح معرّفة');
check(repairBlock.includes("'فاتورة مستوردة من البرنامج القديم'"), 'تغطي فواتير البيع المستوردة');
check(repairBlock.includes("'فاتورة شراء مستوردة'"), 'تغطي فواتير الشراء المستوردة');
check((dbJs.match(/_repairImportedInvoiceDates\(\);/g) || []).length === 2,
  'الإصلاح مستدعٍ في مساري التهيئة openDB و initProgressive');
check(!/modifiedAt|updatedAt|updateInvoice|logAudit|addPayment/.test(repairBlock),
  'الإصلاح لا يكتب modifiedAt ولا سجلات تدقيق ولا دفعات');
check(/inv\.createdAt = d;/.test(repairBlock) && !/inv\.date\s*=/.test(repairBlock),
  'الإصلاح يغيّر createdAt فقط ويترك date كما هو');

// ------------------------------------------------------ 3) سلوك الإصلاح ====
section('3) سلوك الإصلاح على نسخة طبق الأصل من البيانات');
const HIST = new Date(2022, 0, 15, 10, 30).getTime();
const TODAY = new Date(2026, 10, 24, 5, 8).getTime();
function mk(o) { return Object.assign({ items: [{ name: 'x', qty: 1, price: 10 }], totalAmount: 100, invoiceNumber: 'FACT-2026-1', customerId: 'A', paidAmount: 0 }, o); }

async function runRepair(rows, putImpl) {
  const _cache = { invoices: rows };
  const calls = [];
  const _idbPut = putImpl || ((store, items) => { calls.push({ store, items }); return Promise.resolve(); });
  const factory = new Function('_cache', 'db', '_idbPut', 'console',
    repairBlock + '\nreturn _repairImportedInvoiceDates;');
  const repair = factory(_cache, {}, _idbPut, { error: () => {}, log: () => {}, warn: () => {} });
  const n = await repair();
  return { n, rows, calls };
}

(async () => {
  const sale = mk({ id: 'sale', note: 'فاتورة مستوردة من البرنامج القديم — 0001', date: HIST, createdAt: TODAY, subCustomerName: 'N' });
  const buy = mk({ id: 'buy', note: 'فاتورة شراء مستوردة — 0002', date: HIST, createdAt: TODAY, supplierId: 'S' });
  const ok = mk({ id: 'ok', note: 'فاتورة مستوردة من البرنامج القديم — 0003', date: HIST, createdAt: HIST });
  const normal = mk({ id: 'normal', note: 'بيع عادي', date: HIST, createdAt: TODAY });
  const child = mk({ id: 'child', note: 'Cette facture est destinée à N, envoyée par A.', date: HIST, createdAt: TODAY });
  const bad = mk({ id: 'bad', note: 'فاتورة مستوردة من البرنامج القديم — 0004', date: 'not-a-date', createdAt: TODAY });
  const zero = mk({ id: 'zero', note: 'فاتورة شراء مستوردة — 0005', date: 0, createdAt: TODAY });
  const rows = [sale, buy, ok, normal, child, bad, zero];
  const snapshot = rows.map(r => JSON.parse(JSON.stringify(r)));

  const r = await runRepair(rows);
  eq(r.n, 2, 'فقط فاتورتان تاريخهما خاطئ');
  eq(sale.createdAt, HIST, 'فاتورة البيع المستوردة تعود لتاريخها');
  eq(buy.createdAt, HIST, 'فاتورة الشراء المستوردة تعود لتاريخها');
  eq(ok.createdAt, HIST, 'المُصحَّحة سلفاً لا تُلمس');
  eq(normal.createdAt, TODAY, 'الفاتورة العادية لا تُلمس');
  eq(child.createdAt, TODAY, 'فاتورة ملاحظة الابن لا تُلمس');
  eq(bad.createdAt, TODAY, 'تاريخ غير صالح لا يُطبّق');
  eq(zero.createdAt, TODAY, 'تاريخ صفر لا يُطبّق');
  eq(r.calls.length, 1, 'دفعة حفظ واحدة');
  eq(r.calls[0].store, 'invoices', 'الحفظ في مخزن الفواتير فقط');
  eq(r.calls[0].items.length, 2, 'صفّان فقط كُتبا');

  rows.forEach((row, i) => {
    const before = snapshot[i];
    const after = Object.assign({}, row);
    delete after.createdAt;
    delete before.createdAt;
    check(JSON.stringify(after) === JSON.stringify(before),
      row.id + ': كل الحقول الأخرى بقيت كما هي (رقم، مبلغ، منتجات، عميل، وسم)');
    check(!('modifiedAt' in row) && !('updatedAt' in row), row.id + ': لم يُضف طابع تعديل');
  });

  const again = await runRepair(rows);
  eq(again.n, 0, 'تشغيل ثانٍ لا يغيّر شيئاً (idempotent)');
  eq(again.calls.length, 0, 'تشغيل ثانٍ لا يكتب شيئاً');

  const x = mk({ id: 'x', note: 'فاتورة مستوردة من البرنامج القديم — 9', date: HIST, createdAt: TODAY });
  const failedWrite = await runRepair([x], () => Promise.reject(new Error('disk full')));
  eq(failedWrite.n, 1, 'فشل الحفظ لا يُخفي عدد الصفوف المُصلَحة');
  eq(x.createdAt, HIST, 'الذاكرة تُصلَح حتى لو تعذّر الحفظ (تُعاد المحاولة عند الإقلاع)');

  console.log('\n============================================');
  console.log('PASS ' + pass + '  FAIL ' + fail + '  TOTAL ' + (pass + fail));
  console.log('============================================');
  if (fail) process.exit(1);
})();
