/**
 * ZMT PIECE - payroll unit tests (محرك رواتب الموظفين)
 * Run: node renderer/tests/payroll-test.js
 */
const PAY = require('../js/payroll.js');

let passed = 0, failed = 0;
const lines = [];
function assert(cond, msg) {
  if (cond) { passed++; lines.push('  ok ' + msg); }
  else { failed++; lines.push('  FAIL ' + msg); }
}
function assertEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; lines.push('  ok ' + msg); }
  else { failed++; lines.push('  FAIL ' + msg + ' — got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected)); }
}
function assertClose(actual, expected, msg, tol) {
  const t = tol == null ? 0.011 : tol;
  const ok = Math.abs(Number(actual) - Number(expected)) <= t;
  if (ok) { passed++; lines.push('  ok ' + msg); }
  else { failed++; lines.push('  FAIL ' + msg + ' — got ' + actual + ', expected ~' + expected); }
}

// local-time timestamp helper
function ts(y, m, d, h, mi) { return new Date(y, m - 1, d, h, mi || 0, 0, 0).getTime(); }

function baseEmp(over) {
  return Object.assign({
    salaryType: 'monthly', monthlySalary: 30000, dailySalary: 0,
    timingEnabled: true, workStart: '08:00', workEnd: '16:00', graceMinutes: 0,
    restDaysEnabled: false, restPlan: {},
  }, over || {});
}

// rows: every window day present (in 08:00 / out 16:00) except holes[]
function fullRows(y, m, holes) {
  const dim = PAY.daysInMonth(y, m);
  const win = Math.min(30, dim);
  const rows = [];
  for (let d = 1; d <= win; d++) {
    if ((holes || []).indexOf(d) !== -1) continue;
    rows.push({ date: PAY.dateKey(y, m, d), inTs: ts(y, m, d, 8, 0), outTs: ts(y, m, d, 16, 0) });
  }
  return rows;
}

// ============ dayRate / per-second rules ============
assertEq(PAY.dayRate(baseEmp()), 1000, 'شهري 30000 → 1000/يوم (÷30 دائمًا)');
assertEq(PAY.dayRate(baseEmp({ salaryType: 'daily', dailySalary: 1500 })), 1500, 'يومي 1500 → 1500/يوم');
assertClose(PAY.perSecondRate(baseEmp()), 1000 / 480 / 60, 'سعر الثانية = 1000/480/60 = 0.034722 دج', 1e-9);
assertClose(PAY.perSecondRate(baseEmp()) * 100, 3.4722, 'سعر الثانية = 3.4722 سنتيم (مثال المستخدم)', 1e-4);
assertEq(PAY.shiftMinutes(baseEmp()), 480, 'الوردية 08:00→16:00 = 480 دقيقة');
assertEq(PAY.shiftMinutes(baseEmp({ timingEnabled: false })), 0, 'بدون توقيت → لا وردية');

// ============ window rules (28 / 30 / 31) ============
assertEq(PAY.daysInMonth(2026, 2), 28, 'فبراير 2026 = 28 يومًا');
let r = PAY.calculate(baseEmp(), 2026, 2, fullRows(2026, 2, []));
assertEq(r.windowDays, 28, 'نافذة فبراير = 28 (لا يُخصم شيء لعدم وجود الأيام)');
assertEq(r.absences, 0, 'فبراير كامل الحضور → صفر غياب');
assertEq(r.paidUnits, 30, 'فبراير: الوحدات = 30 (الشهر يُحسب 30)');
assertEq(r.net, 30000, 'فبراير كامل → الراتب كامل 30000');

r = PAY.calculate(baseEmp(), 2026, 3, fullRows(2026, 3, []));
assertEq(r.windowDays, 30, 'مصر 31 يومًا → النافذة 30');
assertEq(r.days.length, 30, 'اليوم 31 خارج النافذة');
assertEq(r.paidUnits, 30, 'مصر بلا غياب → 30 وحدة');
assertEq(r.net, 30000, 'مصر بلا غياب → 30000');

r = PAY.calculate(baseEmp(), 2026, 3, fullRows(2026, 3, [15]));
assertEq(r.absences, 1, 'غياب يوم عمل واحد');
assertEq(r.paidUnits, 29, 'غيابًا واحدًا → 29 وحدة');
assertEq(r.net, 29000, 'غيابًا واحدًا → 29000 (ناقص يوم كامل)');

r = PAY.calculate(baseEmp(), 2026, 3, fullRows(2026, 3, [31]));
assertEq(r.windowDays, 30, 'غياب اليوم 31 لا يُحتسب');
assertEq(r.paidUnits, 30, 'اليوم 31 غائبًا → الوحدات 30');
assertEq(r.net, 30000, 'اليوم 31 غائبًا → الراتب كامل');

r = PAY.calculate(baseEmp(), 2026, 3, []);
assertEq(r.absences, 30, 'لا سجل إطلاقًا → 30 غياب (_window)');
assertEq(r.net, 0, 'لا سجل إطلاقًا → 0 (يظهر تحذير في الواجهة)');

// ============ rest days ============
// أول جمعة في مارس 2026
let firstFri = 0, friCount = 0;
for (let d = 1; d <= 30; d++) {
  if (PAY.dowOf(2026, 3, d) === 5) { if (!firstFri) firstFri = d; friCount++; }
}
assert(firstFri > 0 && friCount >= 4, 'مارس 2026 فيه جمعات داخل النافذة (' + friCount + ')');

const restUnpaid = baseEmp({ restDaysEnabled: true, restPlan: { 5: 'rest-unpaid' } });
// حضور كل الأيام ما عدا الجُمع (راحة غير مدفوعة بلا حضور)
r = PAY.calculate(restUnpaid, 2026, 3, fullRows(2026, 3, [firstFri, firstFri + 7, firstFri + 14, firstFri + 21, firstFri + 28].filter(d => d <= 30)));
assertEq(r.absences, 0, 'راحة غير مدفوعة ليست غيابًا');
assertEq(r.paidUnits, 30 - friCount, 'راحة غير مدفوعة بلا حضور → تُخصم من ال30 (' + friCount + ' أيام)');
assertEq(r.net, (30 - friCount) * 1000, 'صافي الشهري بعد خصم الراحة غير المدفوعة');

// حضور في راحة غير مدفوعة → لا خصم
r = PAY.calculate(restUnpaid, 2026, 3, fullRows(2026, 3, []));
assertEq(r.paidUnits, 30, 'راحة غير مدفوعة بوجود حضور → بلا خصم');
assertEq(r.net, 30000, 'راحة غير مدفوعة بوجود حضور → كامل');

const restPaid = baseEmp({ restDaysEnabled: true, restPlan: { 5: 'rest-paid' } });
r = PAY.calculate(restPaid, 2026, 3, fullRows(2026, 3, [firstFri]));
assertEq(r.paidUnits, 30, 'راحة مدفوعة بلا حضور → لا تُخصم');
assertEq(r.net, 30000, 'راحة مدفوعة → الراتب كامل');

// ============ lateness / early-out / grace ============
r = PAY.calculate(baseEmp(), 2026, 3, [{ date: '2026-03-01', inTs: ts(2026, 3, 1, 8, 10), outTs: ts(2026, 3, 1, 16, 0) }]);
assertEq(r.lateSec, 600, 'تأخر 10 دقائق = 600 ثانية');
assertClose(r.lateDeduction, 600 * (1000 / 480 / 60), 'خصم التأخر = 600 × 0.034722', 0.005);
assertEq(r.lateDeduction, 20.83, 'خصم التأخر = 20.83 دج (600 × 3.4722 سنتيم)');
assertEq(r.gross, 1000, 'حضور يوم واحد فقط → وحدة واحدة (29 غياب)');
assertEq(r.net, 979.17, 'الصافي = 1000 − 20.83');

let graceRows = [{ date: '2026-03-01', inTs: ts(2026, 3, 1, 8, 10), outTs: ts(2026, 3, 1, 16, 0) }];
r = PAY.calculate(baseEmp({ graceMinutes: 5 }), 2026, 3, graceRows);
assertEq(r.lateSec, 300, 'تأخر 10د − سماحية 5د = 300 ثانية');

r = PAY.calculate(baseEmp(), 2026, 3, [{ date: '2026-03-01', inTs: ts(2026, 3, 1, 8, 0), outTs: ts(2026, 3, 1, 15, 52) }]);
assertEq(r.earlySec, 480, 'انصراف 15:52 = مبكر 480 ثانية');
assertClose(r.earlyDeduction, 480 * (1000 / 480 / 60), 'خصم المبكر = 480 × 0.034722 = 16.67', 0.005);

r = PAY.calculate(baseEmp({ timingEnabled: false }), 2026, 3,
  [{ date: '2026-03-01', inTs: ts(2026, 3, 1, 10, 30), outTs: ts(2026, 3, 1, 12, 0) }]);
assertEq(r.deduction, 0, 'التوقيت معطّل → لا خصم تأخر/مبكر');

// صافي لا ينزل تحت الصفر
r = PAY.calculate(baseEmp(), 2026, 3,
  Array.from({ length: 30 }, (_, i) => ({ date: PAY.dateKey(2026, 3, i + 1), inTs: ts(2026, 3, i + 1, 23, 59), outTs: ts(2026, 3, i + 1, 0, 1) })));
assert(r.net >= 0, 'الصافي لا يقل عن صفر مهما كبر الخصم');

// ============ daily salary model ============
const dailyEmp = baseEmp({ salaryType: 'daily', dailySalary: 1500 });
r = PAY.calculate(dailyEmp, 2026, 3, fullRows(2026, 3, []));
assertEq(r.paidUnits, 30, 'يومي: 30 يوم حضور = 30 وحدة');
assertEq(r.net, 45000, 'يومي: 30 × 1500 = 45000');

r = PAY.calculate(dailyEmp, 2026, 3, fullRows(2026, 3, [2, 3, 4, 5, 6]));
assertEq(r.paidUnits, 25, 'يومي: غياب 5 أيام → 25 يومًا مدفوعًا');
assertEq(r.net, 37500, 'يومي: 25 × 1500 = 37500');

const dailyRestPaid = baseEmp({ salaryType: 'daily', dailySalary: 1500, restDaysEnabled: true, restPlan: { 5: 'rest-paid' } });
r = PAY.calculate(dailyRestPaid, 2026, 3, fullRows(2026, 3, [firstFri]));
assertEq(r.paidUnits, 30, 'يومي: راحة مدفوعة تُضاف حتى بلا حضور (30 يومًا في النافذة)');
assertEq(r.net, 45000, 'يومي: راحة مدفوعة → 30 × 1500');

// فبراير يومي: 28 يومًا فقط متاحة
r = PAY.calculate(dailyEmp, 2026, 2, fullRows(2026, 2, []));
assertEq(r.paidUnits, 28, 'يومي فبراير: 28 يومًا فقط (لا يوجد 29/30 أصلًا)');
assertEq(r.net, 42000, 'يومي فبراير: 28 × 1500');

// ============ payouts ============
const payments = [
  { tag: 'salary', employeeId: 'e1', period: '2026-03', amount: 10000 },
  { tag: 'salary', employeeId: 'e1', period: '2026-03', amount: 5000 },
  { tag: 'salary', employeeId: 'e2', period: '2026-03', amount: 777 },
  { type: 'net_expense', amount: 999 },
];
assertEq(PAY.paidSum(payments, 'e1', '2026-03'), 15000, 'paidSum يجمع دفعات الموظف/الشهر فقط');
assertEq(PAY.paidSum(payments, 'e1', '2026-04'), 0, 'paidSum صفر لشهر غير مدفوع');
assertEq(PAY.salaryPayments(payments, 'e2', '2026-03').length, 1, 'salaryPayments يفلتر correctly');
assertEq(PAY.periodKey(2026, 3), '2026-03', 'periodKey');
assertEq(PAY.dateKey(2026, 3, 5), '2026-03-05', 'dateKey');

// ============ manual row (حضور يدوي بلا انصراف) ============
r = PAY.calculate(baseEmp(), 2026, 3, [{ date: '2026-03-01', inTs: ts(2026, 3, 1, 8, 0), manual: true }]);
assertEq(r.presentDays, 1, 'حضور بلا انصراف يُحتسب حضورًا');
assertEq(r.earlySec, 0, ' بلا انصراف → لا خصم مبكر');
assertEq(r.absences, 29, '29 يوم غياب في مارس');

console.log(lines.join('\n'));
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
