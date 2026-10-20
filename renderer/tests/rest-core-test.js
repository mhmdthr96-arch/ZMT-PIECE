/**
 * ZMT PIECE - اختبار حركة «المطعم» النقية (rest-core)
 *
 * يغطي: الأدوار، الحالات، الانتقالات، الصلاحيات، إنشاء الطلب،
 * القوائم المرئية للمرسل/المستلم، وعمليات السلة.
 */

const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;
const results = [];

function assert(cond, msg) {
  if (cond) { testsPassed++; results.push(`  ok ${msg}`); }
  else { testsFailed++; results.push(`  FAIL ${msg}`); }
}
function assertEq(actual, expected, msg) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (pass) { testsPassed++; results.push(`  ok ${msg}`); }
  else { testsFailed++; results.push(`  FAIL ${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
}

const RC = require('../js/rest-core.js');

console.log('============================================');
console.log('اختبار rest-core — حركة المطعم على الشبكة');
console.log('============================================\n');

// ---- الأدوار والصلاحيات ----------------------------------------------------

console.log('--- الصلاحيات الافتراضية والدمج ---');
{
  const send = RC.defaultPerms(RC.ROLE_SEND);
  assertEq(send, { send: true, control: false, confirm: false }, 'افتراضيات المرسل');
  const recv = RC.defaultPerms(RC.ROLE_RECEIVE);
  assertEq(recv, { send: false, control: true, confirm: true }, 'افتراضيات المستلم');

  const merged = RC.mergePerms(recv, { confirm: false });
  assertEq(merged, { send: false, control: true, confirm: false }, 'دمج يجعل confirm صفر');
  const keep = RC.mergePerms(recv, {});
  assertEq(keep, recv, 'دمج فارغ يبقي الافتراضي');
  assert(RC.permsEqual(recv, RC.mergePerms(recv, {})), 'permsEqual راضٍ بعد الدمج');

  const bad = RC.clampPerms({ send: true, control: true, confirm: true, extra: 1 });
  assertEq(bad, { send: true, control: true, confirm: true }, 'clampPerms يزيل الدخيل');
  assertEq(RC.canConfirm({ send: false, control: false, confirm: true }), true, 'canConfirm');
  assertEq(RC.canSend({ send: true, control: false, confirm: false }), true, 'canSend');
  assertEq(RC.canControl({ send: false, control: true, confirm: true }), true, 'canControl');
}

// ---- إنشاء الطلب والرؤية ---------------------------------------------------

const SENDER = { id: 'dev-sender', name: 'نادل', device: 'na-1' };
const KITCHEN = { id: 'dev-kitchen', name: 'مطبخ', device: 'kit-1' };

function makeOrder(overrides) {
  const o = RC.createOrder(Object.assign({
    items: [
      { productId: 'p1', name: 'برغر', barcode: 'B', qty: 2, price: 250 },
      { productId: 'p2', name: 'بيبسي', barcode: 'P', qty: 1, price: 100 },
    ],
    fromId: SENDER.id,
    fromName: SENDER.name,
    toId: KITCHEN.id,
    table: '5',
    notes: 'بدون بصل',
  }, overrides || {}));
  if (overrides && overrides.status) o.status = overrides.status;
  return o;
}

console.log('--- قوائم المرسل/المستلم ---');
{
  const order = makeOrder();
  assertEq(order.status, RC.STATUS.NEW, 'طلب جديد');
  assertEq(order.from.id, 'dev-sender', 'المرسل');
  assertEq(order.to, 'dev-kitchen', 'المستلم');
  assertEq(order.items.length, 2, 'بندان');
  assertEq(RC.totals(order).total, 600, 'الإجمالي 600');
  assert(RC.isVisible(order, SENDER.id), 'المرسل يرى طلبه');
  assert(RC.isVisible(order, KITCHEN.id), 'المستلم يرى طلبه');
  assert(!RC.isVisible(order, 'dev-other'), 'طرف ثالث لا يراه');
}

// ---- انتقالات الحالة -------------------------------------------------------

console.log('--- انتقالات الحالة وتوفر الإجراءات ---');
{
  assertEq(RC.nextStatus('confirm'), RC.STATUS.CONFIRMED, 'confirm → confirmed');
  assertEq(RC.nextStatus('cancel'), RC.STATUS.CANCELLED, 'cancel → cancelled');
  assertEq(RC.nextStatus('inprogress'), RC.STATUS.INPROGRESS, 'inprogress → inprogress');
  assertEq(RC.nextStatus('done'), RC.STATUS.DONE, 'done → done');

  // المرسل افتراضيًا: أرسل + ألغِ طلبه الجديد فقط
  const sPerms = RC.defaultPerms(RC.ROLE_SEND);
  const order = makeOrder();
  assertEq(RC.availableActions(order, SENDER, sPerms), ['cancel'], 'المرسل يلغي الجديد فقط');
  assertEq(RC.canCancel(order, SENDER), true, 'يمكن الإلغاء');
  assert(RC.canTransition(order, 'cancel', sPerms, SENDER), 'الانتقال إلى ملغي مسموح');

  // بعد قيد التنفيذ: إلغاء ممنوع
  const order2 = makeOrder({ status: RC.STATUS.INPROGRESS });
  assertEq(RC.availableActions(order2, SENDER, sPerms), [], 'لا إجراءات للمرسل بعد قيد التنفيذ');
  assertEq(RC.canCancel(order2, SENDER), false, 'لا إلغاء بعد قيد التنفيذ');

  // المستلم: يسيطر + يؤكد
  const rPerms = RC.defaultPerms(RC.ROLE_RECEIVE);
  const orderNew = makeOrder();
  assertEq(RC.availableActions(orderNew, KITCHEN, rPerms), ['inprogress', 'confirm'], 'المستلم: تنفيذ/تأكيد على الجديد');
  const inProg = RC.applyStatus(orderNew, 'inprogress', KITCHEN).order;
  assertEq(inProg.status, RC.STATUS.INPROGRESS, 'تطبيق قيد التنفيذ');
  assertEq(RC.availableActions(inProg, KITCHEN, rPerms), ['done', 'confirm'], 'المستلم على قيد التنفيذ: تم/تأكيد');
  const done = RC.applyStatus(inProg, 'done', KITCHEN).order;
  assertEq(done.status, RC.STATUS.DONE, 'تطبيق تم التنفيذ');
  assertEq(RC.availableActions(done, KITCHEN, rPerms), ['inprogress', 'confirm'], 'المستلم على تم: إعادة تحضير أو تأكيد');

  // المدير بصلاحيات confirm كاملة يؤكد من أي حالة
  const boss = { id: 'dev-boss', name: 'مدير', device: 'boss-1' };
  const bossPerms = { send: false, control: false, confirm: true };
  assertEq(RC.availableActions(orderNew, boss, bossPerms), ['confirm'], 'المدير يؤكد الجديد مباشرة');
}

console.log('--- التأكيد يحمل رقم الفاتورة ---');
{
  const kit = { id: 'dev-kitchen', name: 'مطبخ', device: 'kit-1' };
  const ord = makeOrder();
  const res = RC.applyStatus(ord, 'confirm', kit, { invoiceId: 'INV99', invoiceNo: 'A-0001' });
  assertEq(res.ok, true, 'تأكيد ناجح');
  assertEq(res.order.status, RC.STATUS.CONFIRMED, 'الملحوظة مؤكدة');
  assertEq(res.order.invoiceId, 'INV99', 'invoiceId محفوظ');
  assertEq(res.order.invoiceNo, 'A-0001', 'invoiceNo محفوظ');
}

console.log('--- منع الإجراءات على الحالات الطرفية ---');
{
  const kit = { id: 'dev-kitchen', name: 'مطبخ', device: 'kit-1' };
  const rPerms = RC.defaultPerms(RC.ROLE_RECEIVE);
  const conf = makeOrder({ status: RC.STATUS.CONFIRMED });
  const canc = makeOrder({ status: RC.STATUS.CANCELLED });
  assertEq(RC.availableActions(conf, kit, rPerms), [], 'لا إجراءات على مؤكد');
  assertEq(RC.availableActions(canc, kit, rPerms), [], 'لا إجراءات على ملغي');
}

// ---- الطلب الذاتي (الجهاز يطلب لنفسه) ---------------------------------------

console.log('--- الطلب الذاتي: من/from === إلى/to === الجهاز ---');
{
  const SELF = { id: 'dev-self', name: 'جهاز واحد', device: 'solo-1' };
  const selfOrder = RC.createOrder({
    items: [{ productId: 'p1', name: 'برغر', barcode: 'B', qty: 1, price: 250 }],
    fromId: SELF.id,
    fromName: SELF.name,
    toId: SELF.id,
    table: '7'
  });
  assertEq(selfOrder.from.id, SELF.id, 'المرسل = الجهاز');
  assertEq(selfOrder.to, SELF.id, 'المستلم = الجهاز');
  assertEq(selfOrder.status, RC.STATUS.NEW, 'الطلب الذاتي يبدأ جديدًا');

  // الرؤية: الدورين يشوفانه، والطرف الثالث لا
  assert(RC.isVisible(selfOrder, SELF.id, RC.ROLE_SEND), 'الدور المرسل يرى الطلب الذاتي');
  assert(RC.isVisible(selfOrder, SELF.id, RC.ROLE_RECEIVE), 'الدور المستلم يرى الطلب الذاتي');
  assert(RC.isVisible(selfOrder, SELF.id, RC.ROLE_NONE), 'بدون دور يرى طلبه الذاتي');
  assert(!RC.isVisible(selfOrder, 'dev-other', RC.ROLE_SEND), 'جهاز آخر لا يرى الطلب الذاتي');

  // الإجراءات بصلاحيات كاملة (как permsForOrder تمنحها للطلب الذاتي)
  const full = { send: true, control: true, confirm: true };
  assertEq(RC.availableActions(selfOrder, SELF, full), ['inprogress', 'confirm', 'cancel'], 'الجهاز: تنفيذ/تأكيد/إلغاء على الجديد');

  // دورة كاملة: inprogress → done → confirm
  let o = RC.applyStatus(selfOrder, 'inprogress', SELF).order;
  assertEq(o.status, RC.STATUS.INPROGRESS, 'ذاتي: قيد التنفيذ');
  assertEq(RC.availableActions(o, SELF, full), ['done', 'confirm'], 'ذاتي على قيد التنفيذ: تم/تأكيد');
  o = RC.applyStatus(o, 'done', SELF).order;
  assertEq(o.status, RC.STATUS.DONE, 'ذاتي: تم التنفيذ');
  o = RC.applyStatus(o, 'confirm', SELF, { invoiceId: 'INV1', invoiceNo: 'S-1' }).order;
  assertEq(o.status, RC.STATUS.CONFIRMED, 'ذاتي: مؤكدة');

  // صلاحيات مرسل افتراضية وحدها لا تكفي للتحكم (control/confirm مرفوضة)
  const sPerms = RC.defaultPerms(RC.ROLE_SEND);
  assertEq(RC.availableActions(selfOrder, SELF, sPerms), ['cancel'], 'بصلاحيات المرسل الافتراضية: إلغاء فقط');

  // cancel الذاتي مسموح للمالك
  assertEq(RC.canCancel(selfOrder, SELF), true, 'المالك يلغي طلبه الذاتي الجديد');
}

// ---- عمليات السلة ----------------------------------------------------------

console.log('--- سلة الإرسال ---');
{
  let draft = { items: [] };
  draft = RC.addDraftItem(draft, { productId: 'p1', name: 'برغر', barcode: 'B', price: 250 }, 1);
  draft = RC.addDraftItem(draft, { productId: 'p1', name: 'برغر', barcode: 'B', price: 250 }, 2);
  draft = RC.addDraftItem(draft, { productId: 'p2', name: 'بيبسي', barcode: 'P', price: 100 }, 1);
  assertEq(draft.items.length, 2, 'دمج الأصناف المتشابهة');
  assertEq(RC.findDraftItem(draft, 'p1').qty, 3, 'كمية p1 بعد الدمج 1+2');
  assertEq(RC.draftTotals(draft).total, 850, 'الإجمالي 3×250 + 100');
  assertEq(RC.draftTotals(draft).count, 2, 'بندان في السلة');

  RC.setDraftQty(draft, 'p1', 1);
  assertEq(RC.findDraftItem(draft, 'p1').qty, 1, 'ضبط كمية');
  RC.removeDraftItem(draft, 'p2');
  assertEq(draft.items.length, 1, 'حذف بند');
  RC.setDraftQty(draft, 'p1', 0);
  assertEq(draft.items.length, 0, 'كمية صفر تحذف البند');
}

console.log('--- addDraftItem يتجاهل منتجًا فارغًا ---');
{
  const d = RC.addDraftItem(null, {});
  assertEq(d.items, [], 'بداية سلة فارغة بلا صنف');
}

console.log('--- الطلبات المرئية مرتبة أبعد الأحدث ---');
{
  const o1 = makeOrder({ table: '1', createdAt: 100 });
  const o2 = makeOrder({ table: '2', createdAt: 200 });
  const vis = [o1, o2].filter(o => RC.isVisible(o, SENDER.id)).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)).map(o => o.table);
  assertEq(vis, ['2', '1'], 'أحدث الطاولات أولاً');
}

// ---- i18n ------------------------------------------------------------------

console.log('\n--- i18n: مفاتيح rest موجودة في اللغات الأربع ---');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const files = [
    path.join(__dirname, '..', 'js', 'rest-service.js'),
    path.join(__dirname, '..', 'js', 'pages', 'local-orders.js'),
    path.join(__dirname, '..', 'js', 'pages', 'connection.js'),
  ];
  const used = [];
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/t\('(rest\.[A-Za-z0-9_]+)'\)/g)) used.push(m[1]);
    for (const m of s.matchAll(/t\('(nav\.localOrders)'\)/g)) used.push(m[1]);
  }
  const keys = [...new Set(used)];
  assert(keys.length >= 30, `عدد المفاتيح المستعملة ${keys.length}`);
  assertEq(keys.indexOf('rest.total') !== -1, true, 'rest.total مستعمل');

  // استخرج كتل اللغة ثم داخل كل كتلة ابحث عن المفتاح داخل «rest: {...}»
  const tags = ['ar', 'en', 'fr', 'zh'];
  const langStarts = tags.map(t => src.indexOf('\n  ' + t + ': {'));
  langStarts.push(src.length);
  for (const key of keys) {
    let count = 0;
    for (let i = 0; i < tags.length; i++) {
      const start = langStarts[i];
      const scopeEnd = langStarts[i + 1];
      if (start === -1 || scopeEnd === -1) continue;
      if (key === 'nav.localOrders') {
        if (src.indexOf('nav: {', start) !== -1 && src.indexOf('localOrders:', start) < scopeEnd) count++;
        continue;
      }
      const r = src.indexOf('rest: {', start);
      if (r === -1 || r >= scopeEnd) continue;
      const bodyStart = src.indexOf('\n', r) + 1;
      const close = src.indexOf('\n    },', bodyStart);
      if (close === -1 || close >= scopeEnd) continue;
      const body = src.slice(bodyStart, close);
      const short = key.split('.').pop();
      if (new RegExp('^\\s*' + short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:', 'm').test(body)) count++;
    }
    assert(count >= 4, `مفتاح ${key} في اللغات الأربع (${count})`);
    if (count < 4) results.push(`  (key: ${key})`);
  }
}

// ===================================================================
console.log('\n============================================');
console.log('النتائج النهائية');
console.log('============================================');
results.forEach(r => console.log(r));
console.log(`\nنجح: ${testsPassed}  فشل: ${testsFailed}  المجموع: ${testsPassed + testsFailed}`);
console.log('============================================\n');

if (testsFailed > 0) process.exit(1);