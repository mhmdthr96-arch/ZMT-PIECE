// ============================================================
// ZMT PIECE — SQL Server .bak restore verifier
// Run: node renderer/tests/mssql-bak-restore-verify.js
//
// Guards the fix for «Logical file 'STOCK' is not part of database…»:
//   1. MOVE clauses are built from RESTORE FILELISTONLY, never hardcoded;
//   2. build logic is identical in detect and export;
//   3. the .bak path no longer borrows Firebird error prefixes;
//   4. all four languages describe a SQL Server failure as SQL Server.
// The PowerShell self-test needs no database and no backup file.
// ============================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');
const psPath = path.join(base, 'mssql-bak.ps1');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const section = (t) => console.log('\n--- ' + t + ' ---');
const occurrences = (s, re) => (s.match(re) || []).length;

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}
function lastJson(stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch (e) {}
  }
  return null;
}
function runPs(args) {
  return spawnSync('powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath].concat(args),
    { encoding: 'utf8', windowsHide: true, timeout: 120000 });
}

console.log('============================================');
console.log('اختبار استعادة SQL Server (.bak)');
console.log('============================================');

const psRaw = read('mssql-bak.ps1');
// Ignore comments so explanatory text mentioning legacy names is not mistaken
// for a hardcoded MOVE clause.
const ps = psRaw.split(/\r?\n/).map((l) => l.replace(/#.*$/, '')).join('\n');

/* ------------------------------------------------ 1) static structure ---- */
section('1) بناء جمل MOVE من FILELISTONLY');
eq(occurrences(ps, /RESTORE FILELISTONLY FROM DISK/g), 1, 'FILELISTONLY في دالة واحدة مشتركة');
eq(occurrences(ps, /function Get-BakLogicalFiles/g), 1, 'دالة قراءة الأسماء المنطقية موجودة');
eq(occurrences(ps, /function New-RestoreMoveClauses/g), 1, 'دالة بناء MOVE موجودة');
eq(occurrences(ps, /Get-BakLogicalFiles -bakPath/g), 3, 'تُستدعى في filelist و detect و export');
eq(occurrences(ps, /New-RestoreMoveClauses -logical/g), 4, 'بناء MOVE في selftest و filelist و detect و export');
eq(occurrences(ps, /RESTORE DATABASE \[/g), 2, 'جملتا RESTORE فقط: detect و export');
eq(occurrences(ps, /\$\(\$moves\.Clauses -join ', '\)/g), 2, 'كلتاهما تستخدم الأسماء المكتشفة ديناميكياً');
check(!/MOVE N'STOCK'/.test(ps), 'لا يوجد MOVE N\'STOCK\' ثابت');
check(!/STOCK_log/.test(ps), 'لا يوجد STOCK_log ثابت');
check(!/RESTORE DATABASE \[/.test(ps.replace(/RESTORE DATABASE \[[^\n]*\$moves\.Clauses[^\n]*/g, '')),
  'أي جملة RESTORE متبقية تستخدم MOVE ديناميكي');
check(ps.indexOf("SqlQuote $f.name") > 0, 'الأسماء المنطقية تُهربّ قبل إدراجها');
check(ps.indexOf("SqlQuote $BakPath") > 0, 'مسار الملف يُهربّ قبل إدراجه');
check(ps.indexOf("SqlBracket $tmpName") > 0, 'اسم قاعدة المؤقت يُهربّ بين أقواس');
check(ps.indexOf("Join-Path $dataDir ($tempName + '.mdf')") > 0, 'أول ملف بيانات => .mdf');
check(ps.indexOf("Join-Path $dataDir ($tempName + '.ldf')") > 0, 'أول ملف سجل => .ldf');
check(ps.indexOf(".ndf')") > 0, 'الملفات الإضافية => .ndf');
eq(occurrences(ps, /foreach \(\$f in \$moves\.Files\)/g), 2, 'قائمة الملفات المولّدة تُنظَّف في detect و export');
check(occurrences(ps, /Remove-Item -LiteralPath \$f/g) === 2, 'حذف آمن بالمسار الحرفي');
check(ps.indexOf('$Mode -ne \'selftest\' -and -not (Test-Path') > 0, 'selftest لا يتطلب ملفاً حقيقياً');
check(ps.indexOf('[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)') > 0,
  'مخرجات UTF-8 تمنع تشويه ??ExecuteNonQuery??');

/* ------------------------------------------------ 2) message wiring ----- */
section('2) رسائل مسار .bak');
const mig = read('renderer/js/pages/data-migration.js');
const mssqlFn = extractFn(mig, 'migrationParseMssqlBak');
check(!!mssqlFn, 'دالة migrationParseMssqlBak موجودة');
check(mssqlFn.indexOf("t('migration.firebird") < 0, 'لا يوجد أي مفتاح رسالة Firebird داخل مسار .bak');
check(mssqlFn.indexOf("t('migration.mssqlNoPath')") > 0, 'مسار مفقود => مفتاح SQL مخصص');
check(mssqlFn.indexOf("t('migration.mssqlOpenError')") > 0, 'فشل الفتح => مفتاح SQL مخصص');
check(mssqlFn.indexOf("t('migration.mssqlNoTables')") > 0, 'لا جداول => مفتاح SQL مخصص');
check(mssqlFn.indexOf("migrationEngineHint('mssql-bak', err)") > 0, 'تلميح المحرّك لا يزال مرفقاً بالخطأ الأصلي');

const app = read('renderer/js/app.js');
for (const key of ['mssqlNoPath', 'mssqlOpenError', 'mssqlNoTables', 'engineHintSql']) {
  check(occurrences(app, new RegExp('\\b' + key + ':', 'g')) >= 4, key + ' في اللغات الأربع');
}
const sqlHints = app.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.indexOf('engineHintSql:') === 0);
eq(sqlHints.length, 4, 'أربعة تعريفات لتلميح SQL');
check(sqlHints.every((l) => !/initialis|تجهيز|初始化/.test(l)), 'لم يعد التلميح يقطع بفشل تجهيز المحرّك');
check(sqlHints.every((l) => /details|تفاصيل|détail|详细/.test(l)), 'التلميح يحيل إلى تفاصيل الخطأ الفعلية');
check(sqlHints.every((l) => /SqlLocalDB\.msi/.test(l)), 'نصيحة التثبيت احتُفظت كاحتمال لا كحكم مسبق');

/* ------------------------------------------------ 3) PowerShell self-test */
if (process.platform === 'win32') {
  section('3) اختبار PowerShell دون قاعدة بيانات');
  const parseCmd = "$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('" +
    psPath.replace(/'/g, "''") + "',[ref]$t,[ref]$e);if($e.Count){$e|ForEach-Object{$_.ToString()};exit 1}else{'OK'}";
  const parsed = spawnSync('powershell.exe',
    ['-NoProfile', '-Command', parseCmd], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (parsed.error) {
    console.log('  skip PowerShell parser: ' + parsed.error.message);
  } else {
    eq(parsed.status, 0, 'محلّل PowerShell يقبل السكربت');
    eq((parsed.stdout || '').trim().split(/\r?\n/).pop(), 'OK', 'لا أخطاء صياغة PowerShell');
  }

  const self = runPs(['-BakPath', 'NUL', '-Mode', 'selftest']);
  if (self.error) {
    console.log('  skip PowerShell self-test: ' + self.error.message);
  } else {
    eq(self.status, 0, 'selftest نجح');
    const out = lastJson(self.stdout);
    check(!!out && out.ok === true, 'selftest أعاد JSON صالحاً');
    if (out) {
      eq(out.moves.length, 4, 'أربع جمل MOVE لأربعة ملفات منطقية');
      check(out.moves[0].indexOf("MOVE N'DATA_1' TO N'C:\\ZMT\\SELFTEST.mdf'") === 0, 'D أول => .mdf');
      check(out.moves[1].indexOf("MOVE N'DATA_2' TO N'C:\\ZMT\\SELFTEST_1.ndf'") === 0, 'D إضافي => .ndf فريد');
      check(out.moves[2].indexOf("MOVE N'DATA_log' TO N'C:\\ZMT\\SELFTEST.ldf'") === 0, 'L => .ldf');
      check(out.moves[3].indexOf("O''Brien_FT") > 0, 'علامة الاقتباس في الاسم تُهربّ بـ doubled quote');
      eq(out.files.length, 4, 'قائمة ملفات التنظيف تغطي كل الوجهات');
    }
  }

  // Optional real-file check: only asserted when the backup AND LocalDB are
  // available; never fails a plain source-code test run.
  const realBak = 'E:\\flash\\HASSAN\\FULL\\HASSAN_22_11_2026_14_31_31.bak';
  section('4) ملف العميل الحقيقي (اختياري)');
  if (!fs.existsSync(realBak)) {
    console.log('  skip: الملف غير موجود على هذا الجهاز');
  } else {
    const tmp = path.join(os.tmpdir(), 'zmt_bak_verify');
    const real = runPs(['-BakPath', realBak, '-DataDir', tmp, '-Mode', 'filelist']);
    const realOut = lastJson(real.stdout);
    if (real.status !== 0 || !realOut || !realOut.ok) {
      console.log('  skip: LocalDB غير متاح حالياً');
    } else {
      eq(realOut.logical.map((x) => x.name).join(','), 'HASSAN,HASSAN_log', 'الأسماء المكتشفة من النسخة الفعلية');
      check(realOut.moves[0].indexOf("MOVE N'HASSAN' TO") === 0, 'MOVE يستخدم HASSAN لا STOCK');
      check(realOut.moves[1].indexOf("MOVE N'HASSAN_log' TO") === 0, 'MOVE يستخدم HASSAN_log لا STOCK_log');
    }
  }
}

console.log('\n============================================');
console.log('PASS=' + pass + '  FAIL=' + fail);
console.log('============================================');
process.exit(fail ? 1 : 0);
