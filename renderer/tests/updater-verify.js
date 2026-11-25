#!/usr/bin/env node
/* ============================================================================
 * updater-verify — the update notice must be persistent and explicit.
 *
 * Regression this guards against: the old toast auto-hid after 3 seconds and
 * re-appeared every 2 minutes, so most users never saw the update. The new UX
 * keeps one toast on screen until the user chooses "تحديث الآن" or "لاحقاً".
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'updater.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name) { pass++; console.log('  ok  ' + name); }
function bad(name) { fail++; console.log('  FAIL ' + name); }
function has(s) { return src.indexOf(s) >= 0; }

console.log('=== 1. لا اختفاء تلقائي ===');
if (!has('TOAST_MS')) ok('لا يوجد ثابت مدة إخفاء تلقائي'); else bad('ما زال TOAST_MS موجوداً');
if (!has('_scheduleToastHide')) ok('لا يوجد جدولة إخفاء الإشعار'); else bad('_scheduleToastHide ما زالت موجودة');
if (!has('toastTimer')) ok('لا مؤقت إخفاء للإشعار'); else bad('toastTimer ما زال موجوداً');
if (!has("addEventListener('mouseleave'")) ok('لا إخفاء عند مغادرة المؤشر'); else bad('ما زال يخفي عند mouseleave');

console.log('\n=== 2. أزرار الإشعار ===');
if (has('zmtUpdToastNow')) ok('زر «تحديث الآن» موجود'); else bad('زر «تحديث الآن» مفقود');
if (has('zmtUpdToastLater')) ok('زر «لاحقاً» موجود'); else bad('زر «لاحقاً» مفقود');
if (has('تحديث الآن')) ok('نص «تحديث الآن» موجود'); else bad('نص «تحديث الآن» مفقود');
if (has('لاحقاً')) ok('نص «لاحقاً» موجود'); else bad('نص «لاحقاً» مفقود');
if (has("go.click()")) ok('«تحديث الآن» يبدأ التنزيل مباشرة'); else bad('«تحديث الآن» لا يبدأ التنزيل');
if (has('stopPropagation')) ok('الأزرار لا تفتح اللوحة بالخطأ'); else bad('الأزرار تفتح اللوحة أيضاً');

console.log('\n=== 3. الإغلاق الجلسي والنقطة الحمراء ===');
if (has('toastDismissedFor')) ok('«لاحقاً» يُسجَّل لجلسة التشغيل'); else bad('لا يوجد تتبّع لإغلاق «لاحقاً»');
if (has("State.toastDismissedFor = m.latest")) ok('الإغلاق مرتبط بالإصدار الحالي'); else bad('الإغلاق غير مرتبط بالإصدار');
if (has('_updateBadge(active)')) ok('النقطة الحمراء تُحدَّث باستقلال عن الإشعار'); else bad('النقطة الحمراء غير مرتبطة');
if (!has("_updateBadge(false)\n      closePanel")) ok('«لاحقاً» لا يخفي النقطة الحمراء'); else bad('«لاحقاً» يخفي النقطة الحمراء');

console.log('\n=== 4. عدم التكرار والتداخل ===');
if (has("!_el('zmtUpdToast')")) ok('لا يُعاد إنشاء الإشعار أثناء عرضه'); else bad('قد يُنشأ إشعار مكرر');
if (has("!_el('zmtUpdPanel')")) ok('الإشعار لا يغطي لوحة التفاصيل المفتوحة'); else bad('الإشعار قد يغطي اللوحة');
if (has("State.toastDismissedFor && res.latest !== State.toastDismissedFor")) ok('إصدار أحدث يُلغي «لاحقاً»'); else bad('إصدار أحدث لا يُظهر الإشعار');

console.log('\n=== 5. التوافق مع الكتم الدائم ===');
if (has('_mutedVersion()') && has("res.latest !== muted")) ok('«عدم الإظهار مجددًا» ما زال يعمل'); else bad('منطق الكتم الدائم تعطّل');
if (has('updaterBeep')) ok('التنبيه الصوتي موجود مرة واحدة عند الظهور'); else bad('التنبيه الصوتي مفقود');

console.log('\n=== 6. فشل التحديث: سبب واضح وبدائل ===');
if (has('size: m.asset.size')) ok('حجم الملف المتوقع يُمرَّر إلى التنزيل'); else bad('حجم الملف لا يُمرَّر (لا كشف لتنزيل ناقص)');
if (has('_describeUpdateError')) ok('أخطاء التحديث تُترجم إلى رسالة مفهومة'); else bad('لا توجد رسالة خطأ مفهومة');
if (has('EACCES') && has('sha256') && has('spawn')) ok('أسباب مضاد الفيروسات/الملف التالف/فشل التشغيل مغطاة'); else bad('أسباب الفشل الشائعة غير مغطاة');
if (has('zmtUpdManual') && has('تحميل يدوي')) ok('زر «تحميل يدوي» موجود عند الفشل'); else bad('لا يوجد بديل يدوي عند فشل التثبيت');
if (has('_releaseUrl()') && has('openExternal')) ok('«تحميل يدوي» يفتح صفحة الإصدارات'); else bad('رابط التحميل اليدوي غير موصول');
if (has('updaterOpenLog') && has('عرض السجل')) ok('سجل التحديث متاح من الواجهة'); else bad('لا يمكن فتح سجل التحديث');
if (has('_showUpdateRecovery(errEl')) ok('الفشل يعرض أزرار الاسترداد داخل اللوحة'); else bad('الفشل يترك رسالة بلا إجراء');

console.log('\n=== 7. أمان التثبيت في العملية الرئيسية ===');
const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
function mhas(s) { return mainSrc.indexOf(s) >= 0; }
if (mhas("app.getPath('userData'), 'updates'")) ok('التنزيل في userData\\updates (لا مجلد مؤقت قابل للتنظيف)'); else bad('التنزيل ما زال في مجلد مؤقت');
if (mhas('.part') && mhas('renameSync')) ok('التنزيل إلى ملف .part ثم إعادة تسمية ذرّية'); else bad('التنزيل غير ذرّي (ملف ناقص قد يُقبل)');
if (mhas('_isPeFile') && mhas('MIN_INSTALLER_BYTES')) ok('فحص ترويسة PE والحجم قبل التثبيت'); else bad('لا فحص لصلاحية المثبّت');
if (mhas('_reuseDownloadedInstaller')) ok('إعادة استخدام تنزيل مُتحقَّق بدل إعادة 120MB'); else bad('إعادة التنزيل كل مرة');
if (mhas("['/S', '--updated']")) ok('المثبّت يُشغَّل بصيغة التحديث الصامت --updated'); else bad('وسيط --updated مفقود');
if (mhas("child.once('spawn'")) ok('لا يُغلق التطبيق إلا بعد قبول النظام تشغيل المثبّت'); else bad('قد يُغلق التطبيق دون تشغيل المثبّت');
if (mhas("child.once('error'")) ok('أخطاء spawn (EACCES/ENOENT) تُلتقط وتُعاد للمستخدم'); else bad('أخطاء spawn غير ملتقطة (فشل صامت)');
if (mhas('_isInsideUpdateDir')) ok('لا يمكن تشغيل أي exe عشوائي عبر قناة التثبيت'); else bad('قناة التثبيت تقبل أي مسار');
if (mhas("UPDATE_LOG_FILE") && mhas('update.log')) ok('سجل update.log يوثّق كل محاولة'); else bad('لا يوجد سجل تشخيصي');

console.log('\n============================================');
console.log('updater verify: ' + pass + ' passed, ' + fail + ' failed');
console.log('============================================');
process.exit(fail ? 1 : 0);
