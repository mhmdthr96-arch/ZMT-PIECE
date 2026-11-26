// ============================================================================
// ZMT PIECE — قابلية تثبيت تطبيقي الهاتف كـ PWA + الأيقونات
// Run: node renderer/tests/phone-pwa-install-verify.js
//
// السبب: الـ manifest والأيقونات وحدها تعطي "اختصار شاشة" فقط على أندرويد؛
// Chrome يشترط عامل خدمة (service worker) مع fetch handler ليُظهر زر
// "تثبيت التطبيق" ويُطلق beforeinstallprompt. كلا التطبيقين كانا يملكان sw.js
// دون أي تسجيل له. هذا الاختبار يمنع عودة المشكلة مع التحقق من الأيقونات.
// ============================================================================
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..') + path.sep;
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok  ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };
const check = (c, m) => c ? ok(m) : bad(m);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const has = (src, needle) => src.indexOf(needle) !== -1;

function bodyOf(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return '';
}

const apps = [
  { dir: 'phone-scanner', cache: 'zmt-scanner-v4', label: 'ماسح القراءة فقط' },
  { dir: 'phone-sales', cache: 'zmt-psale-v3', label: 'البيع من الهاتف' },
];

// ---------------------------------------------------------------------------
console.log('\n=== 1. تسجيل عامل الخدمة (شرط التثبيت الحقيقي على أندرويد) ===');
// ---------------------------------------------------------------------------
for (const app of apps) {
  const js = read('renderer/' + app.dir + '/app.js');
  check(has(js, 'function registerServiceWorker()'), app.label + ': دالة تسجيل عامل الخدمة موجودة');
  check(has(js, "navigator.serviceWorker.register("), app.label + ': يتم استدعاء register فعلياً');
  check(has(js, "new URL('sw.js', location.href).href"), app.label + ': مسار السكربت محسوب من الرابط الحالي');
  check(has(js, "{ scope: new URL('./', location.href).href }"), app.label + ': النطاق يغطي صفحة التطبيق فقط');
  check(has(js, 'registerServiceWorker();\n    setupInstall();'), app.label + ': التسجيل يُستدعى عند الإقلاع قبل واجهة التثبيت');

  // Execute the real function body with controlled stubs.
  const body = bodyOf(js, 'function registerServiceWorker()');
  check(!!body, app.label + ': تم استخراج جسم دالة التسجيل من الكود الحقيقي');
  if (body) {
    const calls = [];
    const nav = { serviceWorker: {
      register: (script, opts) => { calls.push({ script, opts }); return Promise.resolve({ scope: opts.scope }); },
    } };
    const fn = new Function('navigator', 'window', 'location', 'console', body);
    fn(nav, { isSecureContext: true }, { href: 'https://192.168.1.5:4520' + (app.dir === 'phone-sales' ? '/sale/' : '/') }, { info() {}, warn() {} });
    check(calls.length === 1, app.label + ': register استُدعيت مرة واحدة في الاستخدام الطبيعي');
    if (calls.length) {
      check(calls[0].script.indexOf('/sw.js') >= 0, app.label + ': سكربت العامل هو sw.js');
      check(calls[0].opts.scope.endsWith(app.dir === 'phone-sales' ? '/sale/' : '/'),
        app.label + ': النطاق الصحيح (' + calls[0].opts.scope + ')');
    }

    // Insecure context must not throw — selling/scanning stays alive.
    let threw = false;
    try {
      const nav2 = { serviceWorker: { register() { throw new Error('must not be called'); } } };
      new Function('navigator', 'window', 'location', 'console', body)(
        nav2, { isSecureContext: false }, { href: 'https://192.168.1.5:4520/' }, { info() {}, warn() {} }
      );
    } catch (e) { threw = true; }
    check(!threw, app.label + ': عدم ثقة الشهادة لا يكسر الصفحة (لا استدعاء تسجيل)');
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== 2. واجهة التثبيت في التطبيقين ===');
// ---------------------------------------------------------------------------
for (const app of apps) {
  const js = read('renderer/' + app.dir + '/app.js');
  const html = read('renderer/' + app.dir + '/index.html');
  check(has(js, "addEventListener('beforeinstallprompt'"), app.label + ': يستقبل حدث التثبيت');
  check(has(js, "addEventListener('appinstalled'"), app.label + ': يخفي الزر بعد التثبيت');
  check(has(js, "/iphone|ipad|ipod/"), app.label + ': يعالج iOS بشكل مستقل');
  check(has(js, "!window.isSecureContext"), app.label + ': تلميح عند تجاوز تحذير الشهادة');
  check(has(html, 'id="installBtn"'), app.label + ': زر التثبيت موجود في HTML');
  check(has(html, 'id="iosHint"'), app.label + ': تلميح آيفون موجود في HTML');
  check(has(html, 'id="insecureHint"'), app.label + ': تلميح الرابط غير الآمن موجود في HTML');
}

// ---------------------------------------------------------------------------
console.log('\n=== 3. عامل الخدمة: كاش صحيح+navigation ===');
// ---------------------------------------------------------------------------
for (const app of apps) {
  const sw = read('renderer/' + app.dir + '/sw.js');
  check(has(sw, "const CACHE = '" + app.cache + "'"), app.label + ': إصدار الكاش مرفوع (' + app.cache + ')');
  check(has(sw, "self.addEventListener('fetch'"), app.label + ': معالج fetch موجود (شرط Chrome)');
  check(has(sw, "'icons/icon-180.png'") && has(sw, "'favicon.ico'"), app.label + ': الأيقونات الجديدة داخل الكاش');
  check(app.dir === 'phone-sales' ? has(sw, "'./', 'index.html'") : has(sw, "const CORE = ['/'"),
    app.label + ': جذر الكاش يطابق صفحة التطبيق');
}
const saleSw = read('renderer/phone-sales/sw.js');
check(has(saleSw, "'./', 'index.html'"), 'عامل البيع يخزّن صفحة البيع لا صفحة الماسح');
check(!/const CORE = \[[^\]]*'\/'/.test(saleSw), 'عامل البيع لم يعد يخزّن حقل الجذر "/" بالخطأ');
const scanSw = read('renderer/phone-scanner/sw.js');
check(has(scanSw, "const CORE = ['/'"), 'عامل الماسح يحتفظ بجذره "/" كصفحته الرئيسية');

// ---------------------------------------------------------------------------
console.log('\n=== 4. الأيقونات وملفات Manifest ===');
// ---------------------------------------------------------------------------
for (const app of apps) {
  const dir = path.join(root, 'renderer', app.dir, 'icons');
  const manifestPath = path.join(root, 'renderer', app.dir, 'manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const icons = manifest.icons || [];
  const srcs = icons.map(i => i.src);
  for (const f of ['icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon.ico']) {
    check(srcs.indexOf('icons/' + f) >= 0 || srcs.indexOf(f) >= 0, app.label + ': manifest يسجّل ' + f);
    const file = (f === 'favicon.ico')
      ? path.join(root, 'renderer', app.dir, 'favicon.ico') // conventional site-root favicon
      : path.join(dir, f);
    check(fs.existsSync(file), app.label + ': ملف ' + f + ' موجود على القرص');
  }
  check(icons.some(i => i.src === 'icons/icon-192.png' && i.sizes === '192x192' && i.purpose === 'any') &&
        icons.some(i => i.src === 'icons/icon-512.png' && i.sizes === '512x512' && i.purpose === 'any'),
    app.label + ': أيقونتا 192 و512 بـ purpose=any (شرط التثبيت)');
  check(icons.some(i => i.src === 'favicon.ico' && i.type === 'image/x-icon'),
    app.label + ': favicon.ico مسجّل كأيقونة احتياطية للاختصار');

  const html = read('renderer/' + app.dir + '/index.html');
  check(has(html, '<link rel="apple-touch-icon" sizes="180x180" href="icons/icon-180.png">'),
    app.label + ': apple-touch-icon 180x180 لأيقونة آيفون');
  check(has(html, '<link rel="icon" href="favicon.ico" type="image/x-icon"'), app.label + ': رابط favicon.ico في HTML');
  check(has(html, '<link rel="icon" href="icons/icon.svg" type="image/svg+xml">'), app.label + ': رابط SVG محفوظ');

  const png = fs.readFileSync(path.join(dir, 'icon-180.png'));
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  check(w === 180 && h === 180 && png.slice(1, 4).toString() === 'PNG', app.label + ': icon-180.png صالح (180x180)');
  const ico = fs.readFileSync(path.join(root, 'renderer', app.dir, 'favicon.ico'));
  check(ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1 && ico.length > 10000,
    app.label + ': favicon.ico صالح بعدة أحجام');
}
check(read('renderer/phone-scanner/icons/icon.svg') !== read('renderer/phone-sales/icons/icon.svg'),
  'أيقونتا SVG مختلفتان (أزرق للماسح وأخضر للبيع)');
check(fs.readFileSync(path.join(root, 'renderer/phone-scanner/icons/icon-192.png')).toString('base64') !==
      fs.readFileSync(path.join(root, 'renderer/phone-sales/icons/icon-192.png')).toString('base64'),
  'أيقونتا PNG مختلفتان فعلياً (البيع أخضر)');

// ---------------------------------------------------------------------------
console.log('\n=== 5. الخادم يقدّم الأيقونات بنوع MIME صحيح ===');
// ---------------------------------------------------------------------------
const server = read('phone-scanner.js');
check(has(server, "'.ico': 'image/x-icon'"), 'الخادم يعرف نوع ICO');
check(has(server, "'.png': 'image/png'"), 'الخادم يعرف نوع PNG');
check(has(server, "'.svg': 'image/svg+xml'"), 'الخادم يعرف نوع SVG');
check(has(server, "'.webmanifest': 'application/manifest+json'"), 'الخادم يعرف نوع manifest');

// ---------------------------------------------------------------------------
console.log('\n=== 6. صفحة /cert-help وخدمة الشهادة ===');
// ---------------------------------------------------------------------------
const certPage = read('renderer/phone-scanner/cert-help.html');
check(fs.existsSync(path.join(root, 'renderer/phone-scanner/cert-help.html')), 'صفحة دليل الشهادة موجودة على القرص');
check(has(certPage, '<html lang="ar" dir="rtl">'), 'صفحة الشهادة عربية بالكامل');
check(has(certPage, 'href="/cert" download="ZMT-PHONE-CA.crt"'), 'زر تنزيل الشهادة يشير إلى /cert');
check(has(certPage, 'شهادة CA') && has(certPage, 'تمكين الثقة الكاملة'), 'خطوات أندرويد وآيفون موضّحة');
check(!has(certPage, '文件名') && !has(certPage, ' as above') && !has(certPage, 'كما above'), 'لا نصوص أجنبية أو تالفة داخل الصفحة');
check(has(certPage, '%%ZMT_CERT_PEM%%'), 'موضع حقن الشهادة موجود داخل الصفحة');
check(has(certPage, 'id="certPem"') && has(certPage, 'copyCertPem()'), 'نسخ محتوى الشهادة متاح بلا طلب شبكة');
check(has(certPage, 'data:application/octet-stream;base64,'), 'تنزيل من البيانات المضمّنة متاح كبديل');
check(has(server, "if (url === '/cert-help') { handleCertHelp(res); return; }"), 'الخادم يوجّه /cert-help إلى دليل مُحقن بالشهادة');
check(has(server, 'function handleCertHelp(res)'), 'دالة تقديم الدليل المُحقن موجودة');
check(has(server, "html.replace('%%ZMT_CERT_PEM%%', safe"), 'الشهادة تُحقن فعلياً في HTML');
check(has(server, "if (url === '/cert') { handleCert(req, res); return; }"), 'مسار تنزيل الشهادة الأصلي محفوظ');
check(has(server, 'function handleCert(req, res)'), 'تنزيل الشهادة يستقبل الطلب لدعم Range');
check(has(server, "'Content-Length': total") && has(server, "'Content-Length': part.length"), 'طول المحتوى مُرسل في الاستجابتين');
check(has(server, "'Accept-Ranges': 'bytes'") && has(server, "'Content-Range'"), 'دعم الاستئناف مُعلن ومطبَّق');
check(has(server, 'res.writeHead(206,'), 'طلب Range يحصل على 206 Partial Content');
check(has(server, "'Content-Type': 'application/octet-stream'"), 'التنزيل ملف عادي لا مهمة تثبيت وسط الطلب');
check(server.indexOf("if (url === '/cert-help')") < server.indexOf('const file = readStatic(url);'),
  'التوجيه تتم قبل readStatic (لا 404)');
for (const app of apps) {
  const sw = read('renderer/' + app.dir + '/sw.js');
  check(has(sw, "url.pathname === '/cert-help'") && has(sw, "url.pathname === '/cert'"),
    app.label + ': عامل الخدمة لا يخزّن الشهادة ولا دليلها (لا شهادة قديمة)');
}

// Execute the real download handler with controlled stubs (full + Range).
{
  const body = bodyOf(server, 'function handleCert(req, res)');
  check(!!body, 'تم استخراج جسم دالة تنزيل الشهادة من الكود الحقيقي');
  if (body) {
    const payload = Buffer.from('CERTDATA');
    const run = (req) => {
      const out = { status: 0, headers: null, body: null };
      const res = {
        writeHead: (s, h) => { out.status = s; out.headers = h; },
        end: (b) => { out.body = b; },
      };
      new Function('fs', 'certFiles', 'req', 'res', body)(
        { existsSync: () => true, readFileSync: () => payload },
        () => ({ ca: 'x' }), req, res
      );
      return out;
    };
    const full = run({ headers: {} });
    check(full.status === 200 && full.headers['Content-Length'] === 8 && full.body.toString() === 'CERTDATA',
      'تنزيل كامل: 200 بطول صحيح وملف سليم');
    const part = run({ headers: { range: 'bytes=2-5' } });
    check(part.status === 206 && part.headers['Content-Range'] === 'bytes 2-5/8' && part.body.toString() === 'RTDA',
      'استئناف: 206 مع الجزء الصحيح لا إعادة للملف كاملاً');
    const suffix = run({ headers: { range: 'bytes=-4' } });
    check(suffix.status === 206 && suffix.headers['Content-Range'] === 'bytes 4-7/8' && suffix.body.toString() === 'DATA',
      'نطاق بصيغة البادئة من الطرف يعمل بشكل صحيح');
  }
}

// Execute the real guide handler and verify the certificate is embedded.
{
  const body = bodyOf(server, 'function handleCertHelp(res)');
  check(!!body, 'تم استخراج جسم دالة الدليل من الكود الحقيقي');
  if (body) {
    const out = { status: 0, text: '' };
    const res = {
      writeHead: (s) => { out.status = s; },
      end: (t) => { out.text = t; },
    };
    new Function('fs', 'path', '__dirname', 'certFiles', 'MIME', 'res', body)(
      {
        existsSync: (p) => p === 'x' || String(p).endsWith('.html'),
        readFileSync: (p) => String(p).endsWith('.html') ? '<textarea>%%ZMT_CERT_PEM%%</textarea>' : 'PEMDATA',
      },
      { join: (...a) => a.join('/') }, '',
      () => ({ ca: 'x' }), { '.html': 'text/html; charset=utf-8' }, res
    );
    check(out.status === 200 && has(out.text, 'PEMDATA') && !has(out.text, '%%ZMT_CERT_PEM%%'),
      'صفحة الدليل تُرسل والشهادة مدمجة فيها فعلاً');
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== 7. رابط الشهادة في إعدادات الاتصال ===');
// ---------------------------------------------------------------------------
const connJs = read('renderer/js/pages/connection.js');
const connHtml = read('renderer/pages/connection.html');
check(has(connJs, 'function phsCertHelpUrl()'), 'دالة رابط دليل الشهادة موجودة');
check(has(connJs, ':${phsActivePort()}/cert-help'), 'الرابط يستخدم عنوان IP والمنفذ النشطين');
check(has(connJs, "kind === 'cert' ? phsCertHelpUrl()"), 'زر نسخ الرابط يدعم نوع cert');
check(has(connJs, "document.getElementById('phsCertQr')"), 'رسم QR لرابط الشهادة مُضاف');
check(has(connJs, "document.getElementById('phsCertHelpLink')"), 'رابط فتح الدليل يُحدَّث مع تغيّر IP');
check(has(connHtml, 'id="phsCertQr"') && has(connHtml, 'id="phsCertUrl"'), 'عنصرا QR ورابط الشهادة في صفحة الاتصال');
check(has(connHtml, "phsCopyLink('cert', this)"), 'زر نسخ رابط الدليل موجود');
check(has(connHtml, '<button class="btn btn-primary" id="phsCertHelpLink"'), 'فتح الدليل زر حقيقي لا رابط جديد فارغ');
check(has(connHtml, 'onclick="phsOpenCertHelp()"'), 'الزر يستدعي دالة الفتح الآمنة');
check(has(connHtml, 'style="display:none" onclick="phsOpenCertHelp()"'), 'الزر مخفي حتى يظهر رابط صالح');
check(!has(connHtml, 'id="phsCertHelpLink" href="#"'), 'لم يبق href="#" يفتح نافذة بيضاء');
check(!has(connHtml, 'id="phsCertHelpLink" href="#" target="_blank"'), 'لم يبق target="_blank" على زر الدليل');
check(has(connJs, 'certLink.dataset.url = certUrl') && has(connJs, 'delete certLink.dataset.url'), 'الرابط يُخزَّن في الزر ويُمسح عند التوقف');
check(has(connJs, 'function phsOpenCertHelp()'), 'دالة فتح الدليل في المتصفح موجودة');
check(has(connJs, 'window.electronAPI.openExternal(url)'), 'الدليل يُفتح عبر المتصفح الافتراضي');
check(has(connJs, "window.open(url, '_blank', 'noopener')"), 'بديل آمن إن لم تتوفر electronAPI');
const appJs = read('renderer/js/app.js');
check((appJs.match(/certHelpTitle:/g) || []).length === 4, 'ترجمة عنوان الشهادة مضافة للغات الأربع');
check((appJs.match(/certHelpDesc:/g) || []).length === 4, 'ترجمة شرح الشهادة مضافة للغات الأربع');

// Execute the real URL helper with controlled IP/port stubs.
{
  const body = bodyOf(connJs, 'function phsCertHelpUrl()');
  check(!!body, 'تم استخراج جسم دالة رابط الدليل من الكود الحقيقي');
  const url = body ? new Function('phsActiveIp', 'phsActivePort', body)(() => '192.168.1.9', () => 4520) : '';
  check(url === 'https://192.168.1.9:4520/cert-help', 'رابط الدليل المولّد صحيح: ' + url);
}

// Execute the real open handler: valid URL -> browser, no URL -> clear message,
// and never an empty about:blank window.
{
  const body = bodyOf(connJs, 'function phsOpenCertHelp()');
  check(!!body, 'تم استخراج جسم دالة فتح الدليل من الكود الحقيقي');
  if (body) {
    const external = [], opened = [];
    const run = (url) => {
      const result = { textContent: '' };
      const el = { dataset: url ? { url } : {} };
      const doc = {
        getElementById: (id) => id === 'phsCertHelpLink' ? el : (id === 'phsCertResult' ? result : null),
      };
      const win = {
        electronAPI: { openExternal: (u) => { external.push(u); return Promise.resolve({ success: true }); } },
        open: (u) => { opened.push(u); },
      };
      new Function('document', 'window', body)(doc, win);
      return result.textContent;
    };
    const okMsg = run('https://192.168.1.9:4520/cert-help');
    check(okMsg === '' && external.length === 1 && external[0].endsWith('/cert-help'),
      'رابط صالح: يُفتح في المتصفح الافتراضي بلا رسالة خطأ');
    const badMsg = run('');
    check(has(badMsg, 'شغّل خدمة الهاتف أولاً') && external.length === 1 && opened.length === 0,
      'بلا رابط: رسالة واضحة ولا نافذة فارغة');
  }
}

// ---------------------------------------------------------------------------
console.log('\n=== 8. تشخيص عند الطلب + إعادة المحاولة عند ثقة الشهادة ===');
// ---------------------------------------------------------------------------
for (const app of apps) {
  const js = read('renderer/' + app.dir + '/app.js');
  const html = read('renderer/' + app.dir + '/index.html');
  check(has(js, 'function showDiagnostics()'), app.label + ': دالة التشخيص موجودة');
  check(has(js, 'function setupDiagnostics()'), app.label + ': تهيئة زر التشخيص موجودة');
  check(has(js, 'setupDiagnostics();\n    setConn') || has(js, 'setupDiagnostics();\n    setStatus') ||
        has(js, 'setupDiagnostics();'), app.label + ': التشخيص يُهيّأ عند الإقلاع');
  check(has(js, "addEventListener('visibilitychange'"), app.label + ': إعادة محاولة عند عودة الصفحة');
  check(has(js, 'registerServiceWorker();\n    });'), app.label + ': إعادة المحاولة تستدعي تسجيل العامل');
  check(has(js, 'window.__zmtInstallPromptSeen = true'), app.label + ': يتتبّع إطلاق beforeinstallprompt');
  check(has(js, 'navigator.serviceWorker.getRegistration()'), app.label + ': يقرأ حالة التسجيل الفعلية');
  check(has(js, "'manifest.webmanifest'") && has(js, "'icons/icon-192.png'"), app.label + ': يفحص الـ manifest والأيقونات');
  check(has(html, 'id="diagBtn"') && has(html, 'id="diagPanel"'), app.label + ': زر ولوحة التشخيص في HTML');
  check(has(html, '<a href="/cert-help"'), app.label + ': تلميح الرابط غير الآمن يفتح دليل الشهادة');
  check(has(html, 'style="display:none;"'), app.label + ': لوحة التشخيص مخفية افتراضياً');
}

console.log('\n========================================');
console.log(fail === 0 ? 'PHONE PWA INSTALL VERIFY PASSED (' + pass + ')' : 'PHONE PWA INSTALL VERIFY FAILED: ' + fail);
console.log('========================================');
process.exit(fail ? 1 : 0);
