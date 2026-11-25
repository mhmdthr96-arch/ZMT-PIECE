var _empAll = [];
var _empFiltered = [];
var _empPager = null;
var _empPhotoData = '';
var _empEditId = null;
var _empRestPlan = { 0: 'work', 1: 'work', 2: 'work', 3: 'work', 4: 'work', 5: 'work', 6: 'work' };
var _empRecId = null;
var _empDayCtx = null;
var _empPayCtx = null;
var _empBadgeCtx = null;
var _empSettleOpen = false;

function _empEsc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function _empMoney(n) {
  return 'DA' + fmtMoney(n);
}

function _empLocale() {
  return __lang === 'ar' ? 'ar-EG-u-nu-latn' : (__lang === 'zh' ? 'zh-CN' : (__lang === 'fr' ? 'fr-FR' : 'en-US'));
}

function _empTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString(_empLocale(), { hour: '2-digit', minute: '2-digit' });
}

function _empDowName(dow) {
  return new Date(2024, 0, 7 + dow).toLocaleDateString(_empLocale(), { weekday: 'short' });
}

function _empBeep(ok) {
  try {
    if (window.ZmtSound) {
      if (ok) window.ZmtSound.success && window.ZmtSound.success();
      else   window.ZmtSound.error   && window.ZmtSound.error();
    }
  } catch (e) {}
}
function _empToast(html, ok) {
  try {
    if (typeof window.zmtScanToast === 'function') { window.zmtScanToast(ok ? 'ok' : 'warn', html); return; }
  } catch (e) {}
  if (!html) return;
  const el = document.createElement('div');
  el.innerHTML = html;
  el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,.85);color:#fff;font-size:13px;font-weight:600;box-shadow:0 6px 18px rgba(0,0,0,.25);opacity:0;transition:.15s;white-space:nowrap;max-width:90vw;text-align:center';
  document.body.appendChild(el);
  requestAnimationFrame(function(){ el.style.opacity='1'; });
  setTimeout(function(){ el.style.opacity='0'; setTimeout(function(){ el.remove(); },150); }, 1600);
}

function _empPeriod() {
  const d = new Date();
  return PAY.periodKey(d.getFullYear(), d.getMonth() + 1);
}

function _empMonthValue() {
  const el = document.getElementById('empMonth');
  return (el && el.value) || _empPeriod();
}

function _empMonthParts(period) {
  const p = String(period).split('-');
  return { y: Number(p[0]) || new Date().getFullYear(), m: Number(p[1]) || (new Date().getMonth() + 1) };
}

function _empLateEarly(emp, row) {
  const out = { lateSec: 0, earlySec: 0 };
  if (!emp || !emp.timingEnabled || !row) return out;
  const sm = PAY.shiftMinutes(emp);
  if (!sm) return out;
  const grace = PAY.graceSec(emp);
  if (row.inTs) {
    const startMin = PAY.minutesOfDay(emp.workStart || '08:00');
    out.lateSec = Math.max(0, (function (ts) { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; })(row.inTs) * 60 - startMin * 60 - grace);
  }
  if (row.outTs) {
    const endMin = PAY.minutesOfDay(emp.workEnd || '16:00');
    const d = new Date(row.outTs);
    const outMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    out.earlySec = Math.max(0, (endMin - outMin) * 60 - grace);
  }
  return out;
}

function _empDayChip(emp, row) {
  const rest = emp.restDaysEnabled && PAY.dayKind(emp, new Date().getDay()) !== 'work';
  if (!row || (!row.inTs && !row.outTs)) {
    if (rest) return `<span class="badge" style="background:#eceff1;color:#546e7a">${t('employees.todayRest')}</span>`;
    return `<span class="badge badge-warning">${t('employees.todayAbsent')}</span>`;
  }
  if (row.inTs && !row.outTs) {
    return `<span class="badge badge-warning">${t('employees.todayPresent')} ${_empTime(row.inTs)}</span>`;
  }
  return `<span class="badge" style="background:#e8f5e9;color:#2e7d32">${t('employees.todayPresent')} ${_empTime(row.inTs)} → ${_empTime(row.outTs)}</span>`;
}

// ===== INIT =====

function init_employees() {
  _empAll = DB.getEmployees();
  _empFiltered = [..._empAll];
  if (_empPager) { _empPager.destroy(); _empPager = null; }
  _empPager = new Pager({
    data: _empFiltered,
    container: document.getElementById('employeesList'),
    pageSize: 12,
    render: renderEmpPage,
  });
  setupEmpSearch();
  const sc = document.getElementById('empScanInput');
  if (sc && !sc._zmtCleanBound) {
    sc._zmtCleanBound = true;
    sc.addEventListener('input', function () {
      const cleaned = cleanScannedCode(this.value, { scanner: true });
      if (cleaned !== this.value) this.value = cleaned;
    });
  }
  const m = document.getElementById('empMonth');
  if (m && !m.value) m.value = _empPeriod();
  ['empMonthly', 'empDaily', 'empWorkStart', 'empWorkEnd', 'empGrace'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._empBound) { el._empBound = true; el.addEventListener('input', _empUpdatePerSecond); }
  });
  renderEmpStats();
  renderEmpToday();
  if (_empSettleOpen) renderEmpSettlement();
}

function renderEmployees() {
  _empAll = DB.getEmployees();
  applyEmpFilter();
  renderEmpStats();
  renderEmpToday();
  if (_empSettleOpen) renderEmpSettlement();
}

// ===== LIST =====

function renderEmpPage(slice, info) {
  const container = document.getElementById('employeesList');
  if (info.total === 0) {
    container.innerHTML = `<div class="placeholder-box"><i class="fas fa-id-badge" style="font-size:48px;color:#555"></i><p>${t('employees.empty')}</p></div>`;
    renderEmpStats();
    return;
  }
  const today = PAY.todayKey();
  const period = _empMonthValue();
  const { y, m } = _empMonthParts(period);
  const payments = DB.getPayments();

  const html = slice.map(e => {
    const row = DB.getAttendance(e.id, today);
    const rows = DB.getEmployeeAttendanceMonth(e.id, y, m);
    const calc = PAY.calculate(e, y, m, rows);
    const paid = PAY.paidSum(payments, e.id, period);
    const typeLabel = (e.salaryType === 'daily') ? t('employees.salaryDaily') : t('employees.salaryMonthly');
    const salaryVal = (e.salaryType === 'daily') ? (Number(e.dailySalary) || 0) : (Number(e.monthlySalary) || 0);
    const inactive = e.status === 'inactive';

    return `<div class="supplier-card" style="${inactive ? 'opacity:.6;' : ''}" onclick="openEditEmpModal('${e.id}')">
      <div class="sup-card-avatar" style="${e.photo ? 'background:none;overflow:hidden' : ''}">
        ${e.photo ? `<img src="${e.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : `<i class="fas fa-id-badge"></i>`}
      </div>
      <div class="sup-card-body">
        <div class="sup-card-name">${_empEsc(e.name)}</div>
        <div class="sup-card-meta">
          <span><i class="fas fa-money-bill-wave"></i> ${_empMoney(salaryVal)} / ${e.salaryType === 'daily' ? t('employees.days').replace(/s$/, '') : t('employees.month')}</span>
          <span class="cust-type-chip ${e.salaryType === 'daily' ? 'whole' : 'unit'}">${typeLabel}</span>
          <span><i class="far fa-calendar-check"></i> ${t('employees.formPayDay')}: ${e.payDay || 28}</span>
          <span dir="ltr"><i class="fas fa-barcode"></i> ${_empEsc(e.barcode)}</span>
          ${inactive ? `<span class="badge badge-warning">${t('employees.statusInactive')}</span>` : ''}
        </div>
      </div>
      <div class="sup-card-stats">
        <div class="sup-stat">
          <span class="sup-stat-label">${t('employees.colIn')}</span>
          <span class="sup-stat-value" style="color:#2e7d32">${calc.presentDays}</span>
        </div>
        <div class="sup-stat">
          <span class="sup-stat-label">${t('employees.colAbsents')}</span>
          <span class="sup-stat-value" style="color:#e53935">${calc.absences}</span>
        </div>
        <div class="sup-stat">
          <span class="sup-stat-label">${t('employees.colNet')}</span>
          <span class="sup-stat-value" style="color:#1565c0">${_empMoney(calc.net)}</span>
        </div>
      </div>
      <div class="sup-card-action" style="gap:6px">
        ${_empDayChip(e, row)}
        <button class="rec-card-btn" onclick="event.stopPropagation();openEmpRec('${e.id}')" title="${t('employees.recTitle')}">
          <i class="fas fa-clipboard-list"></i><span>${t('employees.recTitle')}</span>
        </button>
        <button class="rec-card-btn" onclick="event.stopPropagation();openEmpBadge('${e.id}')" title="${t('employees.badgeTitle')}">
          <i class="fas fa-barcode"></i><span>${t('employees.badgePrint')}</span>
        </button>
        <i class="fas fa-chevron-left"></i>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="supplier-grid">${html}</div>`;
}

function applyEmpFilter() {
  const q = normSearch(document.getElementById('empSearch')?.value || '').toLowerCase();
  _empFiltered = q
    ? _empAll.filter(e => (e.name || '').toLowerCase().includes(q)
      || (e.phone && e.phone.includes(q))
      || (e.barcode && e.barcode.includes(q)))
    : [..._empAll];
  if (_empPager) _empPager.updateData(_empFiltered);
}

function setupEmpSearch() {
  const input = document.getElementById('empSearch');
  if (!input) return;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('input', (typeof debounce === 'function') ? debounce(applyEmpFilter, 180) : applyEmpFilter);
}

// ===== STATS + TODAY =====

function renderEmpStats() {
  const today = PAY.todayKey();
  const period = _empMonthValue();
  const { y, m } = _empMonthParts(period);
  const payments = DB.getPayments();
  let due = 0, paidTotal = 0, present = 0;
  _empAll.forEach(e => {
    const rows = DB.getEmployeeAttendanceMonth(e.id, y, m);
    const calc = PAY.calculate(e, y, m, rows);
    const paid = PAY.paidSum(payments, e.id, period);
    due += Math.max(0, calc.net - paid);
    paidTotal += paid;
    const r = DB.getAttendance(e.id, today);
    if (r && r.inTs) present++;
  });
  const el = id => document.getElementById(id);
  if (el('empStatTotal')) el('empStatTotal').textContent = _empAll.length;
  if (el('empStatPresent')) el('empStatPresent').textContent = present;
  if (el('empStatDue')) el('empStatDue').textContent = _empMoney(due);
  if (el('empStatPaid')) el('empStatPaid').textContent = _empMoney(paidTotal);
}

function renderEmpToday() {
  const box = document.getElementById('empTodayBox');
  if (!box) return;
  const today = PAY.todayKey();
  const list = _empAll.filter(e => e.status !== 'inactive');
  if (!list.length) { box.innerHTML = ''; return; }

  const html = list.map(e => {
    const row = DB.getAttendance(e.id, today);
    const hasIn = !!(row && row.inTs);
    const hasOut = !!(row && row.outTs);
    const le = _empLateEarly(e, row || {});
    return `<div class="stat-card" style="min-width:240px;flex:1;margin-bottom:8px">
      <div class="stat-info" style="flex:1">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <b>${_empEsc(e.name)}</b>
          ${_empDayChip(e, row)}
        </div>
        <div style="font-size:11px;color:var(--silver-500);margin-top:4px" dir="ltr">
          ${hasIn ? `${t('employees.recIn')} ${_empTime(row.inTs)}` : ''}
          ${hasOut ? ` → ${t('employees.recOut')} ${_empTime(row.outTs)}` : ''}
          ${hasIn && !hasOut ? ` · ${t('employees.notOutYet')}` : ''}
          ${le.lateSec > 0 ? ` · ${t('employees.colLate')}: ${Math.round(le.lateSec)}` : ''}
          ${le.earlySec > 0 ? ` · ${t('employees.colEarly')}: ${Math.round(le.earlySec)}` : ''}
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-sm" ${hasIn ? 'disabled' : ''} onclick="empManualIn('${e.id}')"><i class="fas fa-sign-in-alt"></i> ${t('employees.btnCheckIn')}</button>
          <button class="btn btn-sm" ${(!hasIn || hasOut) ? 'disabled' : ''} onclick="empManualOut('${e.id}')"><i class="fas fa-sign-out-alt"></i> ${t('employees.btnCheckOut')}</button>
          ${row ? `<button class="btn btn-sm" onclick="empManualDel('${e.id}')" title="${t('employees.btnDelDay')}"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  box.innerHTML = `<div style="font-weight:700;margin-bottom:8px"><i class="fas fa-calendar-day"></i> ${t('employees.presentToday')} — ${new Date().toLocaleDateString(_empLocale(), { dateStyle: 'medium' })}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${html}</div>`;
}

// ===== SCANNER / MANUAL ATTENDANCE =====

function empApplyScan(code) {
  if (!code) return { consumed: false };
  const emp = DB.getEmployeeByBarcode(code);
  if (!emp) return { consumed: false };
  const today = PAY.todayKey();
  const row = DB.getAttendance(emp.id, today);
  let action = '';
  let tsNow = Date.now();
  if (emp.status === 'inactive') {
    _empToast(`<i class="fas fa-exclamation-triangle"></i> ${_empEsc(emp.name)} — ${t('employees.statusInactive')}`, false);
    _empBeep(false);
    renderEmpToday(); renderEmpStats(); renderEmployees();
    return { consumed: true, employee: emp, state: 'inactive' };
  }
  if (!row || (!row.inTs && !row.outTs)) {
    DB.upsertAttendance(emp.id, today, { inTs: tsNow, manual: false });
    action = t('employees.scanIn');
    _empToast(`<i class="fas fa-check-circle"></i> ${_empEsc(emp.name)} — ${action} ${_empTime(tsNow)}`, true);
    _empBeep(true);
  } else if (row.inTs && !row.outTs) {
    DB.upsertAttendance(emp.id, today, { outTs: tsNow, manual: false });
    action = t('employees.scanOut');
    _empToast(`<i class="fas fa-sign-out-alt"></i> ${_empEsc(emp.name)} — ${action} ${_empTime(tsNow)}`, true);
    _empBeep(true);
  } else {
    action = t('employees.scanDone');
    _empToast(`<i class="fas fa-info-circle"></i> ${_empEsc(emp.name)} — ${action} (in ${_empTime(row.inTs)} → out ${_empTime(row.outTs)})`, true);
    _empBeep(true);
  }
  const fresh = DB.getAttendance(emp.id, today);
  const le = _empLateEarly(emp, fresh || {});
  if (le.lateSec > 0 || le.earlySec > 0) {
    const parts = [];
    if (le.lateSec > 0) parts.push(t('employees.colLate') + ' ' + Math.round(le.lateSec) + t('employees.seconds'));
    if (le.earlySec > 0) parts.push(t('employees.colEarly') + ' ' + Math.round(le.earlySec) + t('employees.seconds'));
    if (parts.length) _empToast(`<small>${parts.join(' · ')}</small>`, true);
  }
  renderEmpToday(); renderEmpStats(); renderEmployees();
  return { consumed: true, employee: emp, action: action, row: fresh };
}

// The scanner field's onkeydown calls this. The real in/out rules live in
// empApplyScan (shared with the phone-scanner bridge), so a USB scanner, a
// phone scan and the manual buttons all follow the exact same logic.
function handleEmpScan(e) {
  if (!e || (e.key !== 'Enter' && e.keyCode !== 13)) return;
  e.preventDefault();
  const input = document.getElementById('empScanInput');
  const raw = input ? input.value : '';
  const code = (typeof cleanScannedCode === 'function')
    ? cleanScannedCode(raw, { scanner: true })
    : String(raw || '').replace(/[\r\n\t]/g, '').trim();
  if (!code) return;

  const status = document.getElementById('empScanStatus');
  const resultBox = document.getElementById('empScanResult');

  let res = null;
  try { res = empApplyScan(code); } catch (err) { res = null; }

  // Always clear and refocus, so the next badge can be scanned immediately.
  if (input) {
    input.value = '';
    try { input.focus(); } catch (err) {}
  }

  if (res && res.consumed) {
    const emp = res.employee || {};
    const inactive = res.state === 'inactive';
    const action = res.action || (inactive ? t('employees.statusInactive') : t('employees.scanDone'));
    if (status) {
      status.textContent = action;
      status.style.color = inactive ? '#e53935' : '#28a745';
    }
    if (resultBox) {
      resultBox.style.display = 'flex';
      resultBox.className = 'scanner-result ' + (inactive ? 'scanner-warning' : 'scanner-success');
      resultBox.innerHTML = '<i class="fas fa-' + (inactive ? 'exclamation-triangle' : 'check-circle') + '"></i> ' +
        '<strong>' + _empEsc(emp.name || '') + '</strong> — ' + _empEsc(action) +
        (emp.barcode ? ' <span dir="ltr" class="text-muted">' + _empEsc(emp.barcode) + '</span>' : '');
    }
  } else {
    const msg = t('employees.scanNotFound');
    if (status) { status.textContent = msg; status.style.color = '#e53935'; }
    if (resultBox) {
      resultBox.style.display = 'flex';
      resultBox.className = 'scanner-result scanner-warning';
      resultBox.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ' +
        _empEsc(msg) + ' <strong dir="ltr">' + _empEsc(code) + '</strong>';
    }
    _empToast('<i class="fas fa-exclamation-triangle"></i> ' + _empEsc(msg), false);
    _empBeep(false);
  }

  if (typeof clearTimeout === 'function') clearTimeout(handleEmpScan._reset);
  if (typeof setTimeout === 'function') handleEmpScan._reset = setTimeout(function () {
    if (status) { status.textContent = t('employees.scanReady'); status.style.color = '#888'; }
  }, 3200);
}

function empManualIn(id) {
  const emp = DB.getEmployee(id);
  if (!emp) return;
  DB.upsertAttendance(id, PAY.todayKey(), { inTs: Date.now(), manual: true });
  renderEmpToday(); renderEmpStats(); renderEmployees();
}

function empManualOut(id) {
  const emp = DB.getEmployee(id);
  if (!emp) return;
  const today = PAY.todayKey();
  const row = DB.getAttendance(id, today);
  if (!row || !row.inTs) return;
  DB.upsertAttendance(id, today, { outTs: Date.now(), manual: true });
  renderEmpToday(); renderEmpStats(); renderEmployees();
}

function empManualDel(id) {
  const row = DB.getAttendance(id, PAY.todayKey());
  if (!row) return;
  DB.deleteAttendance(row.id);
  renderEmpToday(); renderEmpStats(); renderEmployees();
}

// ===== ADD / EDIT MODAL =====

function _empFillRestDays() {
  const box = document.getElementById('empRestDays');
  if (!box) return;
  const states = ['work', 'rest-paid', 'rest-unpaid'];
  box.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(d => {
    const st = _empRestPlan[d] || 'work';
    const cls = st === 'work' ? 'btn' : (st === 'rest-paid' ? 'btn btn-success' : 'btn btn-primary');
    const label = st === 'work' ? t('employees.restWork') : (st === 'rest-paid' ? t('employees.restPaid') : t('employees.restUnpaid'));
    return `<button class="${cls}" style="min-width:96px" onclick="_empCycleRest(${d})">${_empDowName(d)} — ${label}</button>`;
  }).join('');
  void states;
}

function _empCycleRest(d) {
  const states = ['work', 'rest-paid', 'rest-unpaid'];
  const cur = states.indexOf(_empRestPlan[d] || 'work');
  _empRestPlan[d] = states[(cur + 1) % states.length];
  _empFillRestDays();
}

function empGenBarcode() {
  const el = document.getElementById('empBarcode');
  if (el) el.value = DB.generateBarcode();
}

function empSalaryTypeChanged() {
  const type = document.getElementById('empSalaryType').value;
  document.getElementById('empMonthlyBox').style.display = type === 'daily' ? 'none' : '';
  document.getElementById('empDailyBox').style.display = type === 'daily' ? '' : 'none';
  _empUpdatePerSecond();
}

function empTimingChanged() {
  const on = document.getElementById('empTimingEnabled').checked;
  document.getElementById('empTimingBox').style.display = on ? '' : 'none';
  _empUpdatePerSecond();
}

function empRestChanged() {
  const on = document.getElementById('empRestEnabled').checked;
  document.getElementById('empRestBox').style.display = on ? '' : 'none';
}

function _empFormEmp() {
  return {
    salaryType: document.getElementById('empSalaryType').value === 'daily' ? 'daily' : 'monthly',
    monthlySalary: parseFloat(document.getElementById('empMonthly').value) || 0,
    dailySalary: parseFloat(document.getElementById('empDaily').value) || 0,
    timingEnabled: document.getElementById('empTimingEnabled').checked,
    workStart: document.getElementById('empWorkStart').value || '08:00',
    workEnd: document.getElementById('empWorkEnd').value || '16:00',
    graceMinutes: parseInt(document.getElementById('empGrace').value, 10) || 0,
  };
}

function _empUpdatePerSecond() {
  const el = document.getElementById('empPerSecond');
  if (!el) return;
  const ps = PAY.perSecondRate(_empFormEmp());
  el.textContent = ps > 0 ? ps.toFixed(6) + ' DA (' + (ps * 100).toFixed(4) + ' ' + t('employees.seconds') + ')' : '—';
}

function openAddEmpModal() {
  if (!Auth.canEdit('employees') && !Auth.isManager()) return;
  _empEditId = null;
  _empPhotoData = '';
  document.getElementById('empModalTitle').textContent = t('employees.addModalTitle');
  document.getElementById('empName').value = '';
  document.getElementById('empPhone').value = '';
  document.getElementById('empBarcode').value = '';
  document.getElementById('empSalaryType').value = 'monthly';
  document.getElementById('empMonthly').value = '0';
  document.getElementById('empDaily').value = '0';
  document.getElementById('empPayDay').value = '28';
  document.getElementById('empTimingEnabled').checked = false;
  document.getElementById('empWorkStart').value = '08:00';
  document.getElementById('empWorkEnd').value = '16:00';
  document.getElementById('empGrace').value = '0';
  document.getElementById('empRestEnabled').checked = false;
  document.getElementById('empStatus').value = 'active';
  document.getElementById('empNote').value = '';
  document.getElementById('empPhotoPreview').innerHTML = '<i class="fas fa-user" style="font-size:24px;color:var(--silver-400)"></i>';
  document.getElementById('empPhotoInput').value = '';
  document.getElementById('empDeleteBtn').style.display = 'none';
  _empRestPlan = { 0: 'work', 1: 'work', 2: 'work', 3: 'work', 4: 'work', 5: 'work', 6: 'work' };
  empSalaryTypeChanged();
  empTimingChanged();
  empRestChanged();
  _empFillRestDays();
  _empUpdatePerSecond();
  document.getElementById('empModal').style.display = 'flex';
  setTimeout(() => document.getElementById('empName').focus(), 150);
}

function openEditEmpModal(id) {
  const e = DB.getEmployee(id);
  if (!e) return;
  if (!Auth.canEdit('employees') && !Auth.isManager()) return;
  _empEditId = id;
  _empPhotoData = e.photo || '';
  document.getElementById('empModalTitle').textContent = t('employees.editModalTitle');
  document.getElementById('empName').value = e.name || '';
  document.getElementById('empPhone').value = e.phone || '';
  document.getElementById('empBarcode').value = e.barcode || '';
  document.getElementById('empSalaryType').value = e.salaryType === 'daily' ? 'daily' : 'monthly';
  document.getElementById('empMonthly').value = e.monthlySalary != null ? e.monthlySalary : 0;
  document.getElementById('empDaily').value = e.dailySalary != null ? e.dailySalary : 0;
  document.getElementById('empPayDay').value = e.payDay || 28;
  document.getElementById('empTimingEnabled').checked = !!e.timingEnabled;
  document.getElementById('empWorkStart').value = e.workStart || '08:00';
  document.getElementById('empWorkEnd').value = e.workEnd || '16:00';
  document.getElementById('empGrace').value = e.graceMinutes || 0;
  document.getElementById('empRestEnabled').checked = !!e.restDaysEnabled;
  document.getElementById('empStatus').value = e.status === 'inactive' ? 'inactive' : 'active';
  document.getElementById('empNote').value = e.note || '';
  document.getElementById('empPhotoPreview').innerHTML = _empPhotoData
    ? `<img src="${_empPhotoData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : '<i class="fas fa-user" style="font-size:24px;color:var(--silver-400)"></i>';
  document.getElementById('empPhotoInput').value = '';
  document.getElementById('empDeleteBtn').style.display = (Auth.canDelete('employees') || Auth.isManager()) ? '' : 'none';
  _empRestPlan = { 0: 'work', 1: 'work', 2: 'work', 3: 'work', 4: 'work', 5: 'work', 6: 'work' };
  if (e.restPlan) {
    Object.keys(e.restPlan).forEach(k => {
      const v = e.restPlan[k];
      if (v === 'work' || v === 'rest-paid' || v === 'rest-unpaid') _empRestPlan[Number(k)] = v;
    });
  }
  empSalaryTypeChanged();
  empTimingChanged();
  empRestChanged();
  _empFillRestDays();
  _empUpdatePerSecond();
  document.getElementById('empModal').style.display = 'flex';
}

function closeEmpModal() {
  document.getElementById('empModal').style.display = 'none';
}

function saveEmp() {
  const name = document.getElementById('empName').value.trim();
  if (!name) { alert(t('employees.nameRequired')); return; }
  const type = document.getElementById('empSalaryType').value === 'daily' ? 'daily' : 'monthly';
  const monthly = parseFloat(document.getElementById('empMonthly').value) || 0;
  const daily = parseFloat(document.getElementById('empDaily').value) || 0;
  if ((type === 'monthly' && monthly <= 0) || (type === 'daily' && daily <= 0)) {
    alert(t('employees.invalidNumber'));
    return;
  }
  let barcode = document.getElementById('empBarcode').value.trim();
  if (!barcode) barcode = DB.generateBarcode();
  const conflict = DB.findEmployeeBarcodeConflict(barcode, _empEditId);
  if (conflict) { alert(t('employees.barcodeTaken')); return; }
  try {
    if (DB.getProductByBarcode && DB.getProductByBarcode(barcode)) {
      alert(t('employees.barcodeTaken'));
      return;
    }
  } catch (e) {}
  let payDay = parseInt(document.getElementById('empPayDay').value, 10);
  if (!isFinite(payDay)) payDay = 28;
  payDay = Math.min(31, Math.max(1, payDay));

  const payload = {
    name,
    phone: document.getElementById('empPhone').value.trim(),
    barcode,
    salaryType: type,
    monthlySalary: monthly,
    dailySalary: daily,
    payDay,
    timingEnabled: document.getElementById('empTimingEnabled').checked,
    workStart: document.getElementById('empWorkStart').value || '08:00',
    workEnd: document.getElementById('empWorkEnd').value || '16:00',
    graceMinutes: Math.max(0, parseInt(document.getElementById('empGrace').value, 10) || 0),
    restDaysEnabled: document.getElementById('empRestEnabled').checked,
    restPlan: Object.assign({}, _empRestPlan),
    status: document.getElementById('empStatus').value === 'inactive' ? 'inactive' : 'active',
    note: document.getElementById('empNote').value.trim(),
    photo: _empPhotoData || '',
  };

  if (_empEditId) DB.updateEmployee(_empEditId, payload);
  else DB.addEmployee(payload);

  closeEmpModal();
  renderEmployees();
}

function deleteEmpFromModal() {
  if (!_empEditId) return;
  if (!confirm(t('employees.confirmDelete'))) return;
  DB.deleteEmployee(_empEditId);
  closeEmpModal();
  renderEmployees();
}

function _empPhotoHandler(e) {
  if (e.target.id === 'empPhotoInput') {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      _empPhotoData = ev.target.result;
      const pv = document.getElementById('empPhotoPreview');
      if (pv) pv.innerHTML = `<img src="${_empPhotoData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    };
    reader.readAsDataURL(file);
  }
}
document.removeEventListener('change', _empPhotoHandler);
document.addEventListener('change', _empPhotoHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'change', fn: _empPhotoHandler });

// ===== ATTENDANCE RECORDS =====

function openEmpRec(id) {
  const e = DB.getEmployee(id);
  if (!e) return;
  _empRecId = id;
  document.getElementById('empRecName').textContent = e.name;
  const m = document.getElementById('empRecMonth');
  m.value = _empMonthValue();
  renderEmpRec();
  document.getElementById('empRecModal').style.display = 'flex';
}

function closeEmpRec() {
  document.getElementById('empRecModal').style.display = 'none';
  _empRecId = null;
}

function renderEmpRec() {
  if (!_empRecId) return;
  const e = DB.getEmployee(_empRecId);
  const m = document.getElementById('empRecMonth').value || _empPeriod();
  const { y, mo } = (function (p) { const a = String(p).split('-'); return { y: Number(a[0]), mo: Number(a[1]) }; })(m);
  const rows = DB.getEmployeeAttendanceMonth(_empRecId, y, mo);
  const calc = PAY.calculate(e, y, mo, rows);
  document.getElementById('empRecSummary').textContent =
    `${calc.presentDays} ${t('employees.colIn')} · ${calc.absences} ${t('employees.colAbsents')} · ${t('employees.colLate')} ${calc.lateSec}${t('employees.seconds')} · ${t('employees.colNet')} ${_empMoney(calc.net)}`;

  const listBox = document.getElementById('empRecList');
  if (!rows.length) {
    listBox.innerHTML = `<div class="rec-empty"><i class="fas fa-calendar-times"></i><p>${t('employees.recEmpty')}</p></div>`;
    return;
  }
  listBox.innerHTML = `<table class="data-table"><thead><tr>
      <th>${t('employees.dayOf')}</th><th>${t('employees.recIn')}</th><th>${t('employees.recOut')}</th>
      <th>${t('employees.colLate')}</th><th>${t('employees.colEarly')}</th><th>${t('employees.recManual')}</th><th></th>
    </tr></thead><tbody>${rows.map(r => {
      const le = _empLateEarly(e, r);
      const d = new Date(r.date + 'T00:00:00');
      return `<tr>
        <td dir="ltr">${r.date} <small>${isNaN(d) ? '' : _empDowName(d.getDay())}</small></td>
        <td dir="ltr">${_empTime(r.inTs)}</td>
        <td dir="ltr">${_empTime(r.outTs)}</td>
        <td style="${le.lateSec > 0 ? 'color:#e53935;font-weight:700' : ''}">${Math.round(le.lateSec)}</td>
        <td style="${le.earlySec > 0 ? 'color:#e65100;font-weight:700' : ''}">${Math.round(le.earlySec)}</td>
        <td>${r.manual ? `<span class="badge badge-warning">${t('employees.recManual')}</span>` : ''}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" onclick="openEmpDay('${_empRecId}','${r.date}')" title="${t('employees.btnFixDay')}"><i class="fas fa-pen"></i></button>
          <button class="btn btn-sm" onclick="empDeleteRecRow('${r.id}')" title="${t('employees.btnDelDay')}"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function empDeleteRecRow(id) {
  DB.deleteAttendance(id);
  renderEmpRec();
  renderEmpToday(); renderEmpStats(); renderEmployees();
}

function openEmpDay(empId, date) {
  _empDayCtx = { employeeId: empId, date };
  const row = DB.getAttendance(empId, date);
  document.getElementById('empDayTitle').textContent = date;
  document.getElementById('empDayIn').value = row && row.inTs ? _empTime(row.inTs) : '';
  document.getElementById('empDayOut').value = row && row.outTs ? _empTime(row.outTs) : '';
  document.getElementById('empDayModal').style.display = 'flex';
}

function closeEmpDay() {
  document.getElementById('empDayModal').style.display = 'none';
  _empDayCtx = null;
}

function _empTsFromTime(dateStr, hhmm) {
  if (!hhmm) return 0;
  const p = dateStr.split('-').map(Number);
  const t2 = hhmm.split(':').map(Number);
  return new Date(p[0], p[1] - 1, p[2], t2[0] || 0, t2[1] || 0, 0, 0).getTime();
}

function saveEmpDay() {
  if (!_empDayCtx) return;
  const { employeeId, date } = _empDayCtx;
  const inTs = _empTsFromTime(date, document.getElementById('empDayIn').value);
  const outTs = _empTsFromTime(date, document.getElementById('empDayOut').value);
  const row = DB.getAttendance(employeeId, date);
  if (!inTs && !outTs) {
    if (row) DB.deleteAttendance(row.id);
  } else {
    DB.upsertAttendance(employeeId, date, { inTs, outTs, manual: true });
  }
  closeEmpDay();
  renderEmpRec();
  renderEmpToday(); renderEmpStats(); renderEmployees();
}

// ===== SETTLEMENT =====

function toggleEmpSettlement() {
  _empSettleOpen = !_empSettleOpen;
  const box = document.getElementById('empSettlement');
  box.style.display = _empSettleOpen ? '' : 'none';
  if (_empSettleOpen) renderEmpSettlement();
}

function renderEmpSettlement() {
  const period = _empMonthValue();
  const { y, m } = _empMonthParts(period);
  const payments = DB.getPayments();
  let sumNet = 0, sumPaid = 0, sumDue = 0, anyNoRows = false;

  const rowsHtml = _empAll.map(e => {
    const rows = DB.getEmployeeAttendanceMonth(e.id, y, m);
    if (!rows.length) anyNoRows = true;
    const calc = PAY.calculate(e, y, m, rows);
    const paid = PAY.paidSum(payments, e.id, period);
    const due = Math.max(0, calc.net - paid);
    sumNet += calc.net;
    sumPaid += paid;
    sumDue += due;
    const state = paid <= 0
      ? `<span class="badge badge-warning">${t('employees.unpaid')}</span>`
      : (due <= 0
        ? `<span class="badge" style="background:#e8f5e9;color:#2e7d32">${t('employees.paid')}</span>`
        : `<span class="badge badge-warning">${t('employees.partial')} ${_empMoney(paid)}</span>`);
    const canPay = (Auth.canEdit('employees') || Auth.isManager()) && due > 0;
    const canUndo = paid > 0 && (Auth.canDelete('employees') || Auth.isManager());

    return `<tr>
      <td><b>${_empEsc(e.name)}</b><br><small dir="ltr" style="color:var(--silver-500)">${_empEsc(e.barcode)}</small></td>
      <td>${calc.presentDays}<br><small>${calc.paidUnits}${e.salaryType === 'daily' ? ' ' + t('employees.days') : '/30 ' + t('employees.units')}</small></td>
      <td style="color:#e53935">${calc.absences}</td>
      <td>${calc.paidRestDays ? `<span style="color:#2e7d32">+${calc.paidRestDays}</span>` : ''} ${calc.unpaidRestDays ? `<span style="color:#e53935">-${calc.unpaidRestDays}</span>` : ''}</td>
      <td style="${calc.lateSec ? 'color:#e53935;font-weight:700' : ''}">${calc.lateSec}</td>
      <td style="${calc.earlySec ? 'color:#e65100;font-weight:700' : ''}">${calc.earlySec}</td>
      <td style="color:#e53935">${_empMoney(calc.deduction)}</td>
      <td>${_empMoney(calc.gross)}</td>
      <td><b style="color:#1565c0">${_empMoney(calc.net)}</b></td>
      <td>${state}
        ${canPay ? `<br><button class="btn btn-sm btn-success" style="margin-top:4px" onclick="openEmpPay('${e.id}','${period}')"><i class="fas fa-cash-register"></i> ${t('employees.btnPay')}</button>` : ''}
        ${canUndo ? `<br><button class="btn btn-sm" style="margin-top:4px;color:#e53935" onclick="undoEmpPay('${e.id}','${period}')"><i class="fas fa-undo"></i> ${t('employees.btnUnpay')}</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  document.getElementById('empSettleWarn').innerHTML = anyNoRows
    ? `<div class="scanner-result scanner-warning" style="display:flex;margin-bottom:10px"><i class="fas fa-exclamation-triangle"></i> ${t('employees.noAttendance')}</div>`
    : '';
  document.getElementById('empSettleSummary').textContent =
    `${t('employees.colGross')}: ${_empMoney(sumNet)} · ${t('employees.paid')}: ${_empMoney(sumPaid)} · ${t('employees.dueThisMonth')}: ${_empMoney(sumDue)}`;

  const tableBox = document.getElementById('empSettleTable');
  if (!_empAll.length) {
    tableBox.innerHTML = `<div class="placeholder-box"><i class="fas fa-id-badge" style="font-size:48px;color:#555"></i><p>${t('employees.empty')}</p></div>`;
    return;
  }
  tableBox.innerHTML = `<table class="data-table"><thead><tr>
      <th>${t('employees.formName')}</th>
      <th>${t('employees.colIn')}</th>
      <th>${t('employees.colAbsents')}</th>
      <th>${t('employees.colRest')}</th>
      <th>${t('employees.colLate')} (${t('employees.seconds')})</th>
      <th>${t('employees.colEarly')} (${t('employees.seconds')})</th>
      <th>${t('employees.colDeduct')}</th>
      <th>${t('employees.colGross')}</th>
      <th>${t('employees.colNet')}</th>
      <th>${t('employees.colState')}</th>
    </tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

// ===== PAYOUT =====

function openEmpPay(empId, period) {
  const e = DB.getEmployee(empId);
  if (!e) return;
  const { y, m } = _empMonthParts(period);
  const rows = DB.getEmployeeAttendanceMonth(empId, y, m);
  const calc = PAY.calculate(e, y, m, rows);
  const paid = PAY.paidSum(DB.getPayments(), empId, period);
  const due = Math.max(0, calc.net - paid);
  if (due <= 0) { alert(t('employees.payNothing')); return; }
  _empPayCtx = { employeeId: empId, period, net: calc.net, paid };
  document.getElementById('empPayWho').textContent = `${e.name} — ${period} · ${t('employees.colNet')} ${_empMoney(calc.net)} · ${t('employees.dueThisMonth')} ${_empMoney(due)}`;
  document.getElementById('empPayAmount').value = Math.round(due * 100) / 100;
  document.getElementById('empPayMethod').value = 'cash';
  document.getElementById('empPayNote').value = '';
  document.getElementById('empPayModal').style.display = 'flex';
}

function closeEmpPay() {
  document.getElementById('empPayModal').style.display = 'none';
  _empPayCtx = null;
}

function confirmEmpPay() {
  if (!_empPayCtx) return;
  const amount = parseFloat(document.getElementById('empPayAmount').value);
  if (!(amount > 0)) { alert(t('employees.invalidNumber')); return; }
  const e = DB.getEmployee(_empPayCtx.employeeId);
  const method = document.getElementById('empPayMethod').value === 'ccp' ? 'ccp' : 'cash';
  const note = document.getElementById('empPayNote').value.trim();
  DB.addPayment({
    type: 'net_expense',
    tag: 'salary',
    employeeId: _empPayCtx.employeeId,
    period: _empPayCtx.period,
    amount,
    method,
    note: note || `${t('employees.payTitle')}: ${e ? e.name : ''} — ${_empPayCtx.period}`,
  });
  closeEmpPay();
  renderEmployees();
  renderEmpStats();
}

function undoEmpPay(empId, period) {
  if (!confirm(t('employees.unpayConfirm'))) return;
  PAY.salaryPayments(DB.getPayments(), empId, period).forEach(p => DB.deletePayment(p.id));
  renderEmployees();
  renderEmpStats();
}

// ===== BADGE =====

function openEmpBadge(id) {
  const e = DB.getEmployee(id);
  if (!e) return;
  _empBadgeCtx = e;
  const gen = BP.genBarcodeSVG(e.barcode || '');
  const salary = e.salaryType === 'daily' ? (Number(e.dailySalary) || 0) : (Number(e.monthlySalary) || 0);
  document.getElementById('empBadgePreview').innerHTML = `
    <div style="border:1px solid var(--silver-300);border-radius:10px;padding:14px;display:inline-block;min-width:220px;background:#fff;color:#111">
      <div style="width:56px;height:56px;border-radius:50%;overflow:hidden;margin:0 auto 8px;background:#eee">
        ${e.photo ? `<img src="${e.photo}" style="width:100%;height:100%;object-fit:cover">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%"><i class="fas fa-user" style="font-size:24px;color:#888"></i></div>`}
      </div>
      <div style="font-weight:800;font-size:15px">${_empEsc(e.name)}</div>
      <div style="font-size:11px;color:#555">${e.salaryType === 'daily' ? t('employees.salaryDaily') : t('employees.salaryMonthly')} · ${_empMoney(salary)}</div>
      <div style="margin-top:8px">${gen.ok ? gen.svg : `<small style="color:red">${_empEsc(gen.error)}</small>`}</div>
      <div dir="ltr" style="font-family:monospace;font-size:13px;margin-top:4px">${_empEsc(e.barcode)}</div>
    </div>`;
  document.getElementById('empBadgeModal').style.display = 'flex';
}

function closeEmpBadge() {
  document.getElementById('empBadgeModal').style.display = 'none';
  _empBadgeCtx = null;
}

// Print the badge at its physical card size (54mm x 86mm, portrait). The
// barcode is generated with the same BP module used everywhere else, so the
// printed bars are the same CODE128/EAN the rest of the app reads. Actual
// printer selection stays in the OS/Chromium print dialog.
function printEmpBadge() {
  const e = _empBadgeCtx;
  if (!e) return;
  const code = String(e.barcode || '').trim();
  if (!code) { alert(t('employees.barcodeMissing') || 'لا يوجد باركود لهذا الموظف'); return; }

  const gen = (typeof BP !== 'undefined' && BP && typeof BP.genBarcodeSVG === 'function')
    ? BP.genBarcodeSVG(code)
    : { ok: false, error: 'وحدة الباركود غير محمّلة' };
  if (!gen.ok) { alert(gen.error || 'تعذر توليد الباركود'); return; }

  const shop = (typeof getPrintInfo === 'function') ? (getPrintInfo().name || '') : '';
  const initial = String(e.name || '؟').trim().charAt(0).toUpperCase() || '؟';
  const photo = e.photo
    ? '<img src="' + e.photo + '" alt="">'
    : '<span class="zmt-badge-initial">' + _empEsc(initial) + '</span>';

  const html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">'
    + '<title>' + _empEsc(e.name || '') + '</title>'
    + '<style>'
    + '@page{size:54mm 86mm;margin:0;}'
    + 'html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + 'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#111;}'
    + '.zmt-badge{width:54mm;height:86mm;box-sizing:border-box;padding:4mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;overflow:hidden;}'
    + '.zmt-badge-shop{font-size:2.6mm;font-weight:700;color:#444;letter-spacing:.2mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}'
    + '.zmt-badge-photo{width:18mm;height:18mm;border-radius:50%;overflow:hidden;background:#eee;border:0.4mm solid #ccc;display:flex;align-items:center;justify-content:center;}'
    + '.zmt-badge-photo img{width:100%;height:100%;object-fit:cover;display:block;}'
    + '.zmt-badge-initial{font-size:8mm;font-weight:800;color:#90a4ae;line-height:1;}'
    + '.zmt-badge-name{font-size:4mm;font-weight:800;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.zmt-badge-barcode{width:44mm;height:15mm;display:flex;align-items:center;justify-content:center;}'
    + '.zmt-badge-barcode svg{width:100%;height:100%;display:block;}'
    + '.zmt-badge-code{font-family:"ZMT Digits","Courier New",monospace;font-size:3.2mm;font-weight:700;letter-spacing:.6mm;direction:ltr;}'
    + '.zmt-badge-foot{font-size:2.2mm;color:#777;}'
    + '@media print{body{background:#fff}}'
    + '</style></head><body>'
    + '<div class="zmt-badge">'
    +   (shop ? '<div class="zmt-badge-shop">' + _empEsc(shop) + '</div>' : '')
    +   '<div class="zmt-badge-photo">' + photo + '</div>'
    +   '<div class="zmt-badge-name">' + _empEsc(e.name || '') + '</div>'
    +   '<div class="zmt-badge-barcode">' + gen.svg + '</div>'
    +   '<div class="zmt-badge-code">' + _empEsc(code) + '</div>'
    +   '<div class="zmt-badge-foot">' + _empEsc(t('employees.badgeTitle')) + '</div>'
    + '</div>'
    + '<script>'
    + 'function go(){try{window.focus();window.print();window.close();}catch(e){}}'
    + 'window.onload=function(){var img=document.querySelector("img");'
    + 'if(img&&!img.complete){img.onload=go;img.onerror=go;setTimeout(go,1200);}else{setTimeout(go,150);}};'
    + '<\/script></body></html>';

  const win = window.open('', '', 'width=520,height=760');
  if (!win) { alert(t('employees.allowPopups') || 'الرجاء السماح بالنوافذ المنبثقة للطباعة'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}


window.empApplyScan = empApplyScan;
window._empToast = _empToast;
window._empBeep = _empBeep;

// ===== MODAL CLOSE ON OVERLAY =====

function _empModalHandler(e) {
  ['empModal', 'empRecModal', 'empDayModal', 'empPayModal', 'empBadgeModal'].forEach(id => {
    const m = document.getElementById(id);
    if (m && e.target === m) {
      if (id === 'empModal') closeEmpModal();
      if (id === 'empRecModal') closeEmpRec();
      if (id === 'empDayModal') closeEmpDay();
      if (id === 'empPayModal') closeEmpPay();
      if (id === 'empBadgeModal') closeEmpBadge();
    }
  });
}
document.removeEventListener('click', _empModalHandler);
document.addEventListener('click', _empModalHandler);
if (window._pageListeners) window._pageListeners.push({ type: 'click', fn: _empModalHandler });

// ===== LAN SYNC HANDLER =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['employees'] = function employeesSyncData() {
  window.syncPreserveRefresh({
    search: ['empSearch'],
    render: () => {
      _empAll = DB.getEmployees();
      const q = normSearch(document.getElementById('empSearch')?.value || '').toLowerCase();
      _empFiltered = q
        ? _empAll.filter(e => (e.name || '').toLowerCase().includes(q)
          || (e.phone && e.phone.includes(q))
          || (e.barcode && e.barcode.includes(q)))
        : [..._empAll];
      if (_empPager) _empPager.updateDataKeepPage(_empFiltered);
      renderEmpStats();
      renderEmpToday();
      if (_empSettleOpen) renderEmpSettlement();
    },
  });
};
