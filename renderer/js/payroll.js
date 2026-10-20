/**
 * ZMT PIECE - payroll.js
 * محرك حساب رواتب الموظفين (نقية بلا DOM — قابلة للاختبار بـ node).
 *
 * القواعد المتفق عليها:
 *  - الشهر الشهري = 30 وحدة: dayRate = الراتب الشهري ÷ 30.
 *    الغياب في يوم عمل ينقص وحدة. شهر فبراير (28/29) والمصر (31) لا ينقصان
 *    تلقائيًا: نافذة الحساب هي أيام 1..min(30, أيام_الشهر) فقط، فأيام
 *    الزيادة (اليوم 31) لا تُحتسب أصلًا، وأيام النقص (فبراير) لا تُخصم.
 *  - اليومي: dayRate = الراتب اليومي، والمحسوب = أيام الحضور في أيام العمل
 *    + أيام الراحة المدفوعة.
 *  - راحة غير مدفوعة بلا حضور تُخصم (وحدة في الشهري، ولا تُضاف في اليومي)،
 *    أما بوجود حضور فتُعامل كيوم عمل مدفوع.
 *  - التأخر/الانصراف المبكر: خصم بالثانية
 *      سعر_الثانية = dayRate ÷ دقائق_الوردية ÷ 60   (1000÷480÷60 = 3.47222…)
 *      مع سماحية (graceMinutes) تُطرح من الثواني الفعلية.
 *  - الصافي = max(0، الإجمالي − الخصم).
 */
const PAY = (() => {
  const WINDOW_DAYS = 30;

  function pad2(n) { return String(n).padStart(2, '0'); }

  function dateKey(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

  function periodKey(y, m) { return y + '-' + pad2(m); }

  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

  // 0=Sunday … 6=Saturday (JS convention)
  function dowOf(y, m, d) { return new Date(y, m - 1, d).getDay(); }

  function todayKey() {
    const d = new Date();
    return dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function minutesOfDay(hhmm) {
    const s = String(hhmm || '').split(':');
    const h = Number(s[0]); const mi = Number(s[1]);
    if (!isFinite(h) || !isFinite(mi)) return null;
    return h * 60 + mi;
  }

  // Minutes since local midnight of a timestamp.
  function minuteOfDayOf(ts) {
    const d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  function dayRate(emp) {
    if (!emp) return 0;
    if ((emp.salaryType || 'monthly') === 'daily') return Number(emp.dailySalary) || 0;
    return (Number(emp.monthlySalary) || 0) / WINDOW_DAYS;
  }

  function shiftMinutes(emp) {
    if (!emp || !emp.timingEnabled) return 0;
    const s = minutesOfDay(emp.workStart || '08:00');
    const e = minutesOfDay(emp.workEnd || '16:00');
    if (s == null || e == null) return 0;
    let diff = e - s;
    if (diff <= 0) diff += 24 * 60; // وردية تعبر منتصف الليل
    return diff;
  }

  function perSecondRate(emp) {
    const sm = shiftMinutes(emp);
    if (!sm) return 0;
    return dayRate(emp) / sm / 60;
  }

  function graceSec(emp) {
    return Math.max(0, Number(emp && emp.graceMinutes) || 0) * 60;
  }

  // 'work' | 'rest-paid' | 'rest-unpaid'
  function dayKind(emp, dow) {
    if (!emp || !emp.restDaysEnabled) return 'work';
    const plan = emp.restPlan || {};
    const v = plan[dow] !== undefined ? plan[dow] : plan[String(dow)];
    if (v === 'rest-paid') return 'rest-paid';
    if (v === 'rest-unpaid') return 'rest-unpaid';
    return 'work';
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  /**
   * حساب شهر كامل لموظف.
   * @param {object} emp    سجل الموظف
   * @param {number} year
   * @param {number} month  1..12
   * @param {object|Array} rowsOrMap  خريطة date→row أو مصفوفة صفوف الحضور
   */
  function calculate(emp, year, month, rowsOrMap) {
    const dim = daysInMonth(year, month);
    const windowDays = Math.min(WINDOW_DAYS, dim);
    const map = {};
    if (Array.isArray(rowsOrMap)) {
      for (const r of rowsOrMap) if (r && r.date) map[r.date] = r;
    } else if (rowsOrMap && typeof rowsOrMap === 'object') {
      Object.assign(map, rowsOrMap);
    }

    const rate = dayRate(emp);
    const sm = shiftMinutes(emp);
    const pSec = perSecondRate(emp);
    const gSec = graceSec(emp);
    const monthly = (emp && emp.salaryType || 'monthly') !== 'daily';

    const days = [];
    let absences = 0, presentDays = 0, countedDays = 0;
    let paidRestDays = 0, unpaidRestDays = 0, workDays = 0;
    let lateSecTotal = 0, earlySecTotal = 0;
    let deductUnits = 0;

    for (let d = 1; d <= windowDays; d++) {
      const date = dateKey(year, month, d);
      const kind = dayKind(emp, dowOf(year, month, d));
      const row = map[date] || null;
      const inTs = row && row.inTs ? Number(row.inTs) : 0;
      const outTs = row && row.outTs ? Number(row.outTs) : 0;
      const present = !!(inTs || outTs);

      let lateSec = 0;
      let earlySec = 0;
      if (emp && emp.timingEnabled && sm) {
        if (inTs) {
          const startMin = minutesOfDay(emp.workStart || '08:00');
          lateSec = Math.max(0, (minuteOfDayOf(inTs) - startMin) * 60 - gSec);
        }
        if (outTs) {
          const endMin = minutesOfDay(emp.workEnd || '16:00');
          let raw = (endMin - minuteOfDayOf(outTs)) * 60;
          if (raw < 0) raw = 0; // وردية عادية: الخروج بعد النهاية ليس مبكرًا
          earlySec = Math.max(0, raw - gSec);
        }
      }

      let counted = false;   // يُدفع هذا اليوم؟
      let unitLoss = false;  // ينقص وحدة في النظام الشهري؟
      if (kind === 'work') {
        workDays++;
        if (present) { presentDays++; counted = true; }
        else { absences++; unitLoss = true; }
      } else if (kind === 'rest-paid') {
        paidRestDays++;
        counted = true; // راحة مدفوعة: تُحتسب دائمًا (شهري: بلا خصم، يومي: تُضاف)
        if (present) presentDays++;
      } else { // rest-unpaid
        unpaidRestDays++;
        if (present) {
          presentDays++;
          counted = true; // حضر في راحة غير مدفوعة = يوم عمل مدفوع
          if (monthly) counted = false; // الشهري: لا يزيد فوق ال30، ببساطة لا يُخصم
        } else {
          unitLoss = true;
        }
      }

      if (monthly && unitLoss) deductUnits++;
      if (!monthly && counted) countedDays++;

      if (lateSec > 0) lateSecTotal += lateSec;
      if (earlySec > 0) earlySecTotal += earlySec;

      days.push({
        day: d, date, kind, present, inTs, outTs,
        lateSec: Math.round(lateSec),
        earlySec: Math.round(earlySec),
        absence: kind === 'work' && !present,
        unitLoss,
        counted: monthly ? !unitLoss : counted,
      });
    }

    let gross;
    let units = null;
    if (monthly) {
      units = Math.max(0, WINDOW_DAYS - deductUnits);
      gross = units * rate;
    } else {
      units = countedDays;
      gross = countedDays * rate;
    }

    const lateDeduction = lateSecTotal * pSec;
    const earlyDeduction = earlySecTotal * pSec;
    const deduction = lateDeduction + earlyDeduction;
    const net = Math.max(0, gross - deduction);

    return {
      salaryType: monthly ? 'monthly' : 'daily',
      year, month,
      windowDays, daysInMonth: dim,
      dayRate: rate,
      shiftMinutes: sm,
      perSecondRate: pSec,
      graceSec: gSec,
      workDays, presentDays, absences,
      paidRestDays, unpaidRestDays,
      paidUnits: units,             // شهري: الوحدات المدفوعة من ال30 — يومي: الأيام المدفوعة
      deductUnits: monthly ? deductUnits : 0,
      lateSec: Math.round(lateSecTotal),
      earlySec: Math.round(earlySecTotal),
      gross: round2(gross),
      lateDeduction: round2(lateDeduction),
      earlyDeduction: round2(earlyDeduction),
      deduction: round2(deduction),
      net: round2(net),
      days,
    };
  }

  // إجمالي المدفوع فعلًا لموظف في شهر معيّن (من صفوف payments بـ tag salary).
  function paidSum(payments, employeeId, period) {
    let sum = 0;
    for (const p of (payments || [])) {
      if (!p || p.tag !== 'salary') continue;
      if (p.employeeId !== employeeId || p.period !== period) continue;
      sum += Number(p.amount) || 0;
    }
    return round2(sum);
  }

  function salaryPayments(payments, employeeId, period) {
    return (payments || []).filter(p => p && p.tag === 'salary'
      && p.employeeId === employeeId && p.period === period);
  }

  return {
    WINDOW_DAYS,
    dateKey, periodKey, daysInMonth, dowOf, todayKey,
    minutesOfDay, dayRate, shiftMinutes, perSecondRate, graceSec, dayKind,
    calculate, paidSum, salaryPayments, round2,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PAY;
