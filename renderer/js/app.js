// ============================================================
// ZMT PIECE - Core App
// ============================================================

console.log('[App] Starting...');

const api = window.electronAPI || {};

// ===== WINDOW FOCUS FIX (Windows) =====
// After a native alert()/confirm() dialog closes, the frameless window can keep
// visual focus without keyboard focus — inputs freeze until the user clicks outside
// and back. Re-request window focus after every dialog to keep typing working.
(function() {
  const nativeAlert = window.alert;
  const nativeConfirm = window.confirm;
  function restoreFocus() {
    if (window.electronAPI && window.electronAPI.focusFix) window.electronAPI.focusFix();
  }
  window.alert = function(msg) {
    const r = nativeAlert.call(window, msg);
    restoreFocus();
    return r;
  };
  window.confirm = function(msg) {
    const r = nativeConfirm.call(window, msg);
    restoreFocus();
    return r;
  };
})();

// ===== SUPPLIERS STORAGE =====
if (!localStorage.getItem('zmt_suppliers')) {
  localStorage.setItem('zmt_suppliers', JSON.stringify([]));
}
// ===== BRANDS DATA =====
const BRANDS = {
  global: [
    // ——— ألمانيا ———
    { id:'bmw',        name:'BMW',           country:'ألمانيا', slug:'bmw',         color:'#0066B1' },
    { id:'mercedes',   name:'Mercedes-Benz',  country:'ألمانيا', slug:'mercedes',    color:'#00ADEF' },
    { id:'audi',       name:'Audi',           country:'ألمانيا', slug:'audi',        color:'#BB0A30' },
    { id:'volkswagen', name:'Volkswagen',     country:'ألمانيا', slug:'volkswagen',  color:'#001E50' },
    { id:'porsche',    name:'Porsche',        country:'ألمانيا', slug:'porsche',     color:'#B12B24' },
    { id:'opel',       name:'Opel',           country:'ألمانيا', slug:'opel',        color:'#F3E300' },
    { id:'smart',      name:'Smart',          country:'ألمانيا', slug:'smart',       color:'#1A1A1A' },
    { id:'man',        name:'MAN',            country:'ألمانيا', slug:'man',         color:'#002C5F' },
    // ——— اليابان ———
    { id:'toyota',     name:'Toyota',         country:'اليابان',    slug:'toyota',      color:'#EB0A1E' },
    { id:'honda',      name:'Honda',          country:'اليابان',    slug:'honda',       color:'#E60012' },
    { id:'nissan',     name:'Nissan',         country:'اليابان',    slug:'nissan',      color:'#C3002F' },
    { id:'mazda',      name:'Mazda',          country:'اليابان',    slug:'mazda',       color:'#101010' },
    { id:'subaru',     name:'Subaru',         country:'اليابان',    slug:'subaru',      color:'#013C7A' },
    { id:'mitsubishi', name:'Mitsubishi',     country:'اليابان',    slug:'mitsubishi',  color:'#E60012' },
    { id:'lexus',      name:'Lexus',          country:'اليابان',    slug:'lexus',       color:'#999999' },
    { id:'suzuki',     name:'Suzuki',         country:'اليابان',    slug:'suzuki',      color:'#E60012' },
    { id:'infiniti',   name:'Infiniti',       country:'اليابان',    slug:'infiniti',    color:'#1A1A1A' },
    { id:'acura',      name:'Acura',          country:'اليابان',    slug:'acura',       color:'#003D6B' },
    { id:'daihatsu',   name:'Daihatsu',       country:'اليابان',    slug:'daihatsu',    color:'#E50012' },
    { id:'isuzu',      name:'Isuzu',          country:'اليابان',    slug:'isuzu',       color:'#003366' },
    // ——— أمريكا ———
    { id:'ford',       name:'Ford',           country:'أمريكا',     slug:'ford',        color:'#003478' },
    { id:'chevrolet',  name:'Chevrolet',      country:'أمريكا',     slug:'chevrolet',   color:'#CDCDCD' },
    { id:'dodge',      name:'Dodge',          country:'أمريكا',     slug:'dodge',       color:'#333333' },
    { id:'jeep',       name:'Jeep',           country:'أمريكا',     slug:'jeep',        color:'#005A3C' },
    { id:'cadillac',   name:'Cadillac',       country:'أمريكا',     slug:'cadillac',    color:'#1A1A1A' },
    { id:'tesla',      name:'Tesla',          country:'أمريكا',     slug:'tesla',       color:'#E82127' },
    { id:'chrysler',   name:'Chrysler',       country:'أمريكا',     slug:'chrysler',    color:'#333333' },
    { id:'gmc',        name:'GMC',            country:'أمريكا',     slug:'gmc',         color:'#003E6B' },
    { id:'lincoln',    name:'Lincoln',        country:'أمريكا',     slug:'lincoln',     color:'#002856' },
    { id:'buick',      name:'Buick',          country:'أمريكا',     slug:'buick',       color:'#004E8C' },
    { id:'ram',        name:'Ram',            country:'أمريكا',     slug:'ram',         color:'#333333' },
    // ——— كوريا ———
    { id:'hyundai',    name:'Hyundai',        country:'كوريا',      slug:'hyundai',     color:'#003366' },
    { id:'kia',        name:'Kia',            country:'كوريا',      slug:'kia',         color:'#BB0A30' },
    { id:'genesis',    name:'Genesis',        country:'كوريا',      slug:'genesis',     color:'#1A1A1A' },
    { id:'ssangyong',  name:'SsangYong',      country:'كوريا',      slug:'ssangyong',   color:'#003366' },
    // ——— السويد ———
    { id:'volvo',      name:'Volvo',          country:'السويد',     slug:'volvo',       color:'#003057' },
    { id:'scania',     name:'Scania',         country:'السويد',     slug:'scania',      color:'#003366' },
    // ——— إيطاليا ———
    { id:'ferrari',    name:'Ferrari',        country:'إيطاليا',    slug:'ferrari',     color:'#FF2800' },
    { id:'lamborghini',name:'Lamborghini',    country:'إيطاليا',    slug:'lamborghini', color:'#DDBB00' },
    { id:'maserati',   name:'Maserati',       country:'إيطاليا',    slug:'maserati',    color:'#1A1A2E' },
    { id:'fiat',       name:'Fiat',           country:'إيطاليا',    slug:'fiat',        color:'#003366' },
    { id:'alfa-romeo', name:'Alfa Romeo',     country:'إيطاليا',    slug:'alfaromeo',   color:'#C00000' },
    { id:'lancia',     name:'Lancia',         country:'إيطاليا',    slug:'lancia',      color:'#003366' },
    { id:'iveco',      name:'Iveco',          country:'إيطاليا',    slug:'iveco',       color:'#004098' },
    // ——— بريطانيا ———
    { id:'jaguar',     name:'Jaguar',         country:'بريطانيا',   slug:'jaguar',      color:'#36454F' },
    { id:'land-rover', name:'Land Rover',     country:'بريطانيا',   slug:'landrover',   color:'#005A3C' },
    { id:'mini',       name:'Mini',           country:'بريطانيا',   slug:'mini',        color:'#005A3C' },
    { id:'bentley',    name:'Bentley',        country:'بريطانيا',   slug:'bentley',     color:'#1A1A1A' },
    { id:'rolls-royce',name:'Rolls-Royce',    country:'بريطانيا',   slug:'rollsroyce',  color:'#1A1A1A' },
    { id:'aston-martin',name:'Aston Martin',  country:'بريطانيا',   slug:'astonmartin', color:'#00665E' },
    { id:'mclaren',    name:'McLaren',        country:'بريطانيا',   slug:'mclaren',     color:'#FF6600' },
    { id:'lotus',      name:'Lotus',          country:'بريطانيا',   slug:'lotus',       color:'#005A3C' },
    // ——— فرنسا ———
    { id:'peugeot',    name:'Peugeot',        country:'فرنسا',      slug:'peugeot',     color:'#003E74' },
    { id:'renault',    name:'Renault',        country:'فرنسا',      slug:'renault',     color:'#FFCC00' },
    { id:'citroen',    name:'Citro\u00ebn',   country:'فرنسا',      slug:'citroen',     color:'#1C3F7A' },
    { id:'bugatti',    name:'Bugatti',        country:'فرنسا',      slug:'bugatti',     color:'#1A1A2E' },
    // ——— إسبانيا ———
    { id:'seat',       name:'SEAT',           country:'إسبانيا',    slug:'seat',        color:'#004B87' },
    // ——— التشيك ———
    { id:'skoda',      name:'Skoda',          country:'التشيك',     slug:'skoda',       color:'#006633' },
    // ——— رومانيا ———
    { id:'dacia',      name:'Dacia',          country:'رومانيا',    slug:'dacia',       color:'#003366' },
    // ——— الهند ———
    { id:'tata',       name:'Tata Motors',    country:'الهند',      slug:'tata',        color:'#1A1A8A' },
    { id:'mahindra',   name:'Mahindra',       country:'الهند',      slug:'mahindra',    color:'#DD1E2A' },
    // ——— هولندا ———
    { id:'daf',        name:'DAF Trucks',     country:'هولندا',     slug:'daf',         color:'#003366' },
  ],
  chinese: [
    { id:'byd',        name:'BYD',            country:'الصين', slug:'byd',           color:'#C71523' },
    { id:'geely',      name:'Geely',          country:'الصين', slug:'geely',         color:'#003399' },
    { id:'chery',      name:'Chery',          country:'الصين', slug:'chery',         color:'#B7202E' },
    { id:'jetour',     name:'Jetour',         country:'الصين', slug:'jetour',        color:'#003366' },
    { id:'great-wall', name:'Great Wall',     country:'الصين', slug:'greatwall',     color:'#333333' },
    { id:'ora',        name:'Ora',            country:'الصين', slug:'ora',           color:'#41B3A2' },
    { id:'nio',        name:'NIO',            country:'الصين', slug:'nio',           color:'#000000' },
    { id:'xpeng',      name:'XPeng',          country:'الصين', slug:'xpeng',         color:'#1A1A2E' },
    { id:'li-auto',    name:'Li Auto',        country:'الصين', slug:'li-auto',       color:'#333333' },
    { id:'saic',       name:'SAIC Motor',     country:'الصين', slug:'saic',          color:'#DC0028' },
    { id:'changan',    name:'Changan',        country:'الصين', slug:'changan',       color:'#003366' },
    { id:'gac',        name:'GAC Group',      country:'الصين', slug:'gac',           color:'#004098' },
    { id:'dongfeng',   name:'Dongfeng',       country:'الصين', slug:'dongfeng',      color:'#0066B1' },
    { id:'baic',       name:'BAIC',           country:'الصين', slug:'baic',          color:'#004EA1' },
    { id:'mg',         name:'MG',             country:'الصين', slug:'mg',            color:'#C8191E' },
    { id:'faw',        name:'FAW',            country:'الصين', slug:'faw',           color:'#DC0028' },
    { id:'jac',        name:'JAC Motors',     country:'الصين', slug:'jac',           color:'#004A98' },
    { id:'zeekr',      name:'Zeekr',          country:'الصين', slug:'zeekr',         color:'#2B2B2B' },
    { id:'aion',       name:'Aion',           country:'الصين', slug:'aion',          color:'#0066B1' },
    { id:'leapmotor',  name:'Leapmotor',      country:'الصين', slug:'leapmotor',     color:'#333333' },
    { id:'wm-motor',   name:'WM Motor',       country:'الصين', slug:'wm-motor',      color:'#005A9E' },
    { id:'hiphi',      name:'HiPhi',          country:'الصين', slug:'hiphi',         color:'#1A1A2E' },
    { id:'voyah',      name:'Voyah',          country:'الصين', slug:'voyah',         color:'#003D6B' },
    { id:'deepal',     name:'Deepal',         country:'الصين', slug:'deepal',        color:'#0066B1' },
    { id:'seres',      name:'Seres',          country:'الصين', slug:'seres',         color:'#002856' },
    { id:'dfsk',       name:'DFSK',           country:'الصين', slug:'dfsk',          color:'#004098' },
    { id:'bestune',    name:'Bestune',        country:'الصين', slug:'bestune',       color:'#DC0028' },
    { id:'venucia',    name:'Venucia',        country:'الصين', slug:'venucia',       color:'#004EA1' },
  ],
};

// Helper: brand image HTML (local file with PNG fallback and SVG badge fallback)
function brandImageHTML(b) {
  const c = b.color || '#0066B1';
  const initials = b.name.replace(/[^A-Za-z0-9]/g, '').substring(0, 2).toUpperCase();

  return `<img src="assets/brands/${b.slug}.svg" alt="${b.name}" data-png="assets/brands/${b.slug}.png" data-color="${c}" data-init="${initials}">`;
}

// ===== PAGE CACHE =====
const pageCache = {};
var _pendingFetchController = null;
var _currentPageId = null;

function cleanupPage() {
  // Destroy active infinite scroll pager
  if (window._activePager) {
    window._activePager.destroy();
    window._activePager = null;
  }
  if (window._pageListeners) {
    for (const { type, fn, target } of window._pageListeners) {
      (target || document).removeEventListener(type, fn);
    }
    window._pageListeners = [];
  }
  document.querySelectorAll('body > [id*="Modal"], body > [id*="modal"]').forEach(el => {
    if (el.parentNode === document.body) el.remove();
  });
  const prev = document.getElementById('invoicePreviewModal');
  if (prev) prev.remove();

  const container = document.getElementById('pageContainer');
  if (container) {
    container.querySelectorAll('canvas').forEach(c => {
      const chart = Chart.getChart && Chart.getChart(c);
      if (chart) { try { chart.destroy(); } catch(e) {} }
    });
    container.querySelectorAll('input, select, textarea').forEach(el => {
      el.value = '';
      el.checked = false;
    });
  }

  if (window._pageIntervals) {
    for (const id of window._pageIntervals) clearInterval(id);
    window._pageIntervals = [];
  }
}
if (!window._pageListeners) window._pageListeners = [];
if (!window._pageIntervals) window._pageIntervals = [];
if (!window._pageSyncHandlers) window._pageSyncHandlers = {};

function trackPageInterval(fn, delay) {
  const id = setInterval(fn, delay);
  if (!window._pageIntervals) window._pageIntervals = [];
  window._pageIntervals.push(id);
  return id;
}

function trackPageListener(type, fn, target) {
  if (!window._pageListeners) window._pageListeners = [];
  window._pageListeners.push({ type, fn, target });
  (target || document).addEventListener(type, fn);
}

// ===== BRAND IMAGE LOADER (local SVG/PNG with SVG badge fallback) =====
function setupBrandImages(scope) {
  const container = scope || document;
  container.querySelectorAll('.brand-card .brand-image img[data-png]').forEach(img => {
    const color = img.dataset.color || '#0066B1';
    const init = img.dataset.init || 'BR';
    let retried = false;

    function showFallback() {
      const svg = '<svg width="48" height="48" viewBox="0 0 100 100">'
        + '<circle cx="50" cy="50" r="48" fill="' + color + '"/>'
        + '<text x="50" y="50" text-anchor="middle" dy=".35em" fill="white" '
        + 'font-size="30" font-weight="bold" font-family="Arial,sans-serif">' + init + '</text></svg>';
      img.style.display = 'none';
      img.parentNode.innerHTML = svg;
    }

    function tryPNG() {
      if (retried) { showFallback(); return; }
      retried = true;
      img.src = img.dataset.png;
    }

    if (img.complete) {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) tryPNG();
      return;
    }

    img.addEventListener('error', () => tryPNG());
    img.addEventListener('load', () => {});
  });
}

// ===== ROUTER =====
function navigateTo(pageId) {
  console.log('[Router] Navigating to:', pageId);

  if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && !Auth.canView(pageId)) {
    console.warn('[Router] Access denied for:', pageId);
    pageId = 'dashboard';
  }

  cleanupPage();

  // Abort any pending fetch from previous navigation
  if (_pendingFetchController) {
    _pendingFetchController.abort();
    _pendingFetchController = null;
  }

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  const container = document.getElementById('pageContainer');
  if (!container) return;

  _currentPageId = pageId;

  if (pageCache[pageId]) {
    container.innerHTML = pageCache[pageId];
    applyTranslation();
    executePageScript(pageId);
    return;
  }

  _pendingFetchController = new AbortController();
  const signal = _pendingFetchController.signal;

  fetch(`pages/${pageId}.html`, { signal })
    .then(res => { if (!res.ok) throw new Error('Page not found: ' + pageId); return res.text(); })
    .then(html => {
      // Ignore stale responses if user navigated elsewhere
      if (_currentPageId !== pageId) return;
      pageCache[pageId] = html;
      container.innerHTML = html;
      applyTranslation();
      executePageScript(pageId);
    })
    .catch(err => {
      if (err.name === 'AbortError') return;
      console.error('[Router] Error:', err);
      container.innerHTML = `<div class="page"><div class="page-header"><div class="page-header-content"><h1><i class="fas fa-exclamation-triangle"></i> خطأ</h1><p>تعذر تحميل الصفحة: ${pageId}</p></div></div></div>`;
    })
    .finally(() => {
      if (_pendingFetchController && _pendingFetchController.signal === signal) {
        _pendingFetchController = null;
      }
    });
}

function executePageScript(pageId) {
  const scriptId = 'page-script-' + pageId;
  const old = document.getElementById(scriptId);
  if (old) old.remove();

  // A focused element that got removed from the DOM can leave keyboard input
  // frozen until the user clicks outside and back. Clear any such stale focus.
  const activeEl = document.activeElement;
  if (activeEl && activeEl !== document.body && activeEl.isConnected === false) {
    activeEl.blur();
    document.body.focus();
  }

  const script = document.createElement('script');
  script.id = scriptId;
  script.src = 'js/pages/' + pageId + '.js';
  script.onload = () => {
    const fn = window['init_' + pageId.replace(/-/g, '_')];
    if (typeof fn === 'function') {
      try { fn(); } catch (e) { console.error('[Router] init error for', pageId, e); }
    }
    setupBrandImages();
  };
  script.onerror = () => console.warn('[Router] No script for:', pageId);
  document.body.appendChild(script);
}

// ===== GLOBAL escHtml (regex-based, 100x faster than DOM) =====
if (typeof window.escHtml === 'undefined') {
  window.escHtml = function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
}

// ===== UTILITIES =====
function debounce(fn, ms) { let t; return function() { clearTimeout(t); const a=arguments, ctx=this; t = setTimeout(() => fn.apply(ctx, a), ms); }; }

// Normalize a search query: whitespace-only (or empty) input counts as no filter
function normSearch(v) { return String(v || '').trim(); }

// ===== ORDERS NAV BADGE =====
window.updateOrdersBadge = function() {
  const el = document.getElementById('ordersNavBadge');
  if (!el) return;
  let n = 0;
  try {
    if (typeof DB !== 'undefined' && DB.ready && DB.ready()) {
      n = (DB.getOrders() || []).filter(o => o.status === 'pending' || o.status === 'notAvailable').length;
    }
  } catch (e) {}
  el.textContent = n;
  el.style.display = n > 0 ? '' : 'none';
};

// ===== WEB PUSH NOTIFY (fire-and-forget) =====
// Notifies the manager's phone (via the website's /api/push-trigger) the
// moment an order or spoiled-goods return is created on the desktop. Settings
// live in localStorage (zmt_push_site_url / zmt_push_secret) and are filled in
// the Connection Settings page. Never blocks or throws.
window.notifyWebPush = function(type, payload) {
  try {
    const siteUrl = localStorage.getItem('zmt_push_site_url');
    const secret = localStorage.getItem('zmt_push_secret');
    if (!siteUrl || !secret) return;
    if (!/^https?:\/\/.+/.test(siteUrl)) return;

    const user = (typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function') ? Auth.getCurrentUser() : null;
    const storeCode = (typeof Auth !== 'undefined' && Auth.getUserCode) ? (Auth.getUserCode() || '') : '';
    const storeType = (typeof Auth !== 'undefined' && Auth.getStoreType) ? Auth.getStoreType() : 'main';
    const parentCode = (typeof Auth !== 'undefined' && Auth.getParentCode) ? (Auth.getParentCode() || '') : '';
    const storeName = (typeof Auth !== 'undefined' && Auth.getStoreName) ? (Auth.getStoreName() || '') : (user && (user.branchName || ''));

    const body = Object.assign({
      type: type,
      parentCode: parentCode || storeCode,
      storeCode: storeCode,
      storeName: storeName || '',
      createdAt: Date.now()
    }, payload || {});

    fetch(siteUrl.replace(/\/+$/, '') + '/api/push-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-zmt-secret': secret },
      body: JSON.stringify(body)
    }).catch(function() {});
  } catch (e) { /* ignore */ }
};

// ===== CONTROLS =====
document.getElementById('btnMinimize')?.addEventListener('click', () => api.minimize?.());
document.getElementById('btnMaximize')?.addEventListener('click', () => api.maximize?.());
document.getElementById('btnClose')?.addEventListener('click', () => api.close?.());

// ===== NAVIGATION =====
document.addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (item) { e.preventDefault(); const p = item.dataset.page; if (p) navigateTo(p); }
});

// ===== I18N TRANSLATIONS =====
const LANG = {
  ar: {
    appTitle: 'ZMT PIECE',
    online: 'متصل', offline: 'غير متصل',
    nav: {
      main: 'الرئيسية', manage: 'إدارة', finance: 'المالية', system: 'النظام',
      dashboard: 'لوحة التحكم', brands: 'العلامات التجارية', sales: 'البيع', invoices: 'الفواتير',
      inventory: 'المخزون', suppliers: 'الموردين', customers: 'العملاء', debts: 'الديون',
      supplierReturns: 'السلع الفاسدة',
      netAccount: 'صافي الحساب', discounts: 'التخفيضات', returns: 'المرتجعات',
      reports: 'التقارير', backup: 'النسخ الاحتياطي', settings: 'الاعدادات',
      connection: 'اعدادات الاتصال',
      storeDebts: 'ديون المحلات', branchesMonitor: 'مراقبة الفروع', sharedInventory: 'المخزون المشترك',
      orders: 'الطلبات',
    },
    dash: {
      title: 'لوحة التحكم', sub: 'نظرة عامة على المبيعات والمخزون',
      s1: 'قطعة في المخزون', s2: 'فاتورة هذا الشهر', s3: 'عميل مسجل', s4: 'إجمالي المبيعات',
      chart: 'المبيعات مقابل المخزون والمرتجعات', months: 'عدد الأشهر:',
      m1: 'شهر', m2: 'شهرين', m3: 'أشهر', m4: 'أشهر', m5: 'أشهر', m6: 'أشهر',
      netProfit: 'صافي الربح', cost: 'التكلفة',
      lowStockItems: ' منتج أقل من حد المخزون',
      andMore: 'و', moreItems: 'أخرى...',
      lowStock: 'منتجات تحت حد المخزون', estimatedProfit: 'إجمالي الربح المقدر', monthSales: 'مبيعات هذا الشهر', profitCostDist: 'توزيع الربح والتكلفة',
    },
    brands: { title: 'العلامات التجارية', sub: 'إدارة العلامات التجارية لقطع الغيار', search: 'بحث عن علامة تجارية...', favAdd: 'إضافة إلى المفضلة', favRemove: 'إزالة من المفضلة' },
    sales: {
      title: 'البيع', sub: 'إنشاء فاتورة بيع جديدة',
      searchParts: 'بحث القطع', searchPlaceholder: 'ابحث باسم القطعة أو رقمها...',
      emptySearch: 'اكتب لبدء البحث عن قطع الغيار',
      cart: 'سلة المشتريات', cartEmpty: 'السلة فارغة', total: 'المجموع:',
      checkout: 'إتمام البيع',
    },
    invoices: {
      title: 'الفواتير', sub: 'جميع فواتير البيع والمشتريات',
      search: 'بحث عن فاتورة...', newInvoice: 'فاتورة جديدة',
      col1: 'رقم الفاتورة', col2: 'التاريخ', col3: 'العميل', col4: 'المبلغ', col5: 'الحالة', col6: 'إجراءات',
      empty: 'لا توجد فواتير بعد',
    },
    inventory: {
      title: 'المخزون', sub: 'إدارة مخزون قطع الغيار',
      search: 'بحث في المخزون...', add: 'إضافة قطعة', export: 'تصدير',
      col1: 'الرمز', col2: 'اسم القطعة', col3: 'العلامة', col4: 'الكمية', col5: 'سعر الشراء', col6: 'سعر البيع', col7: 'إجراءات',
      empty: 'المخزون فارغ',
    },
    suppliers: {
      title: 'الموردين', sub: 'إدارة موردي قطع الغيار',
      search: 'بحث عن مورد...', add: 'إضافة مورد',
      col1: 'الاسم', col2: 'الهاتف', col3: 'البريد', col4: 'العلامات', col5: 'الرصيد', col6: 'إجراءات',
      empty: 'لا يوجد موردين',
      addModalTitle: 'إضافة مورد جديد', editModalTitle: 'تعديل المورد',
      formName: 'اسم المورد', formNamePl: 'مثال: مؤسسة XX لقطع الغيار',
      formPhone: 'رقم الهاتف', formAddress: 'العنوان', formAddressPl: 'مثال: الرياض - شارع الملك فهد',
      cancel: 'إلغاء', save: 'حفظ',
    },
    customers: {
      title: 'العملاء', sub: 'إدارة العملاء',
      search: 'بحث عن عميل...', add: 'إضافة عميل',
      col1: 'الاسم', col2: 'الهاتف', col3: 'العنوان', col4: 'المشتريات', col5: 'الرصيد', col6: 'إجراءات',
      empty: 'لا يوجد عملاء',
      addModalTitle: 'إضافة عميل جديد', editModalTitle: 'تعديل العميل',
      formName: 'اسم العميل', formNamePl: 'مثال: أحمد علي',
      formPhone: 'رقم الهاتف', formAddress: 'العنوان', formAddressPl: 'مثال: الجزائر العاصمة',
      formType: 'نوع العميل', typeUnit: 'قطعة', typeWhole: 'جملة', formTypeHelp: 'يحدد السعر الافتراضي في صفحة البيع (يمكن تغييره لكل منتج داخل السلة)',
      formDiscount: 'نسبة الخصم (%)', formDiscountHelp: 'من 0.001% إلى 100% - اختياري',
      cancel: 'إلغاء', save: 'حفظ',
      totalDebts: 'إجمالي الديون على العملاء',
      totalPaid: 'إجمالي المدفوع',
      totalCount: 'إجمالي العملاء',
    },
    debts: {
      title: 'الديون', sub: 'إدارة الديون والذمم',
      youOwe: 'ديون عليك (للموردين)', youOwed: 'ديون لك (على العملاء)',
      noDebts: 'لا توجد ديون مستحقة',
      logTitle: 'سجل الديون',
      col1: 'التاريخ', col2: 'النوع', col3: 'الطرف', col4: 'المبلغ', col5: 'الحالة', col6: 'إجراءات',
      empty: 'لا توجد معاملات',
      totalInvoices: 'إجمالي الفواتير', totalPurchases: 'إجمالي المشتريات',
      balance: 'الرصيد', paid: 'المدفوع', paidToThem: 'المدفوع لهم',
      invoices: 'الفواتير', noInvoices: 'لا توجد فواتير',
      payments: 'الدفعات', noPayments: 'لا توجد دفعات',
      net: 'صافي الذمم', chooseSide: 'اختر طرفاً من القائمة', back: 'رجوع',
      searchPlaceholder: 'ابحث بالاسم أو رقم الهاتف...', tabCustomers: 'العملاء', tabSuppliers: 'الموردين',
      totalCustomerDebts: 'ديون لنا (على العملاء)', totalSupplierDebts: 'ديون علينا (للموردين)',
    },
    net: {
      title: 'صافي الحساب', sub: 'ملخص الحسابات المالية',
      s1: 'إجمالي المبيعات', s2: 'إجمالي المشتريات', s3: 'صافي الربح', s4: 'المبالغ المعلقة',
      logTitle: 'سجل المعاملات',
      col1: 'التاريخ', col2: 'الوصف', col3: 'النوع', col4: 'المبلغ', col5: 'الرصيد',
      empty: 'لا توجد معاملات حديثة',
      customerDebt: 'دين لنا', supplierDebt: 'دين علينا',
      purchaseInvoice: 'فاتورة شراء', purchaseFrom: 'فاتورة من',
      transferInvoice: 'فاتورة تحويل', receptionInvoice: 'فاتورة استلام',
      purchases: 'مشتريات', paymentFrom: 'دفعة من',
      paymentNote: 'دفعة', paymentWalkin: 'دفعة من زبون',
      salesPaid: 'مبيعات (مدفوع)', paymentTo: 'دفعة لـ',
      paymentToSupplier: 'دفعة لمورد', expenses: 'مصروفات',
      stockPurchase: 'شراء مخزون', stockPurchases: 'مشتريات مخزون',
      totalExpenses: 'إجمالي المصروفات',
      marginTitle: 'هامش الربح', periodLabel: 'الفترة:', today: 'اليوم',
      totalMargin: 'هامش الربح الكلي', periodMargin: 'هامش الربح للفترة', allTime: 'منذ البداية',
      cashLabel: 'نقداً', marginLabel: 'هامش', ccpPaidNote: 'مدفوعة CCP',
    },
    discounts: {
      title: 'التخفيضات', sub: 'إدارة العروض والتخفيضات',
      add: 'إضافة تخفيض',
      col1: 'المنتج', col2: 'نسبة التخفيض', col3: 'تاريخ البداية', col4: 'تاريخ النهاية', col5: 'الحالة', col6: 'إجراءات',
      empty: 'لا توجد تخفيضات',
      unregistered: 'غير مسجل', deleteConfirm: 'حذف سجل التخفيض؟',
      totalDiscounts: 'إجمالي التخفيضات', totalValue: 'القيمة الإجمالية للتخفيضات',
      colDate: 'التاريخ', colInvoice: 'الفاتورة', colCustomer: 'العميل', colType: 'النوع', colRatio: 'النسبة', colAmount: 'المبلغ', colActions: 'إجراءات',
    },
    returns: {
      title: 'المرتجعات', sub: 'إدارة المرتجعات والاسترجاع',
      add: 'تسجيل مرتجع', export: 'تصدير',
      col1: 'رقم المرتجع', col2: 'الفاتورة', col3: 'القطعة', col4: 'الكمية', col5: 'السبب', col6: 'التاريخ', col7: 'إجراءات',
      empty: 'لا توجد مرتجعات',
      time: 'الوقت', defaultReason: 'تعديل فاتورة',
      deleteConfirm: 'حذف سجل المرتجع؟',
      noReturnsExport: 'لا توجد مرتجعات للتصدير',
      exportSuccess: 'تم تصدير المرتجعات بنجاح',
      exportError: 'حدث خطأ أثناء الحفظ: ',
    },
    supplierReturns: {
      title: 'السلع الفاسدة', sub: 'إدارة إرجاع السلع الفاسدة للموردين',
      export: 'تصدير', filterAll: 'الكل',
      statusPending: 'جاري الاسترجاع', statusReturned: 'تم الاسترجاع', statusNotReturned: 'لم تسترجع',
      colProduct: 'المنتج', colQty: 'الكمية', colAmount: 'القيمة',
      colSupplier: 'المورد', colInvoice: 'الفاتورة', colDate: 'التاريخ',
      colStatus: 'الحالة', colActions: 'إجراءات', colStore: 'المحل/الفرع',
      empty: 'لا توجد طلبات إرجاع',
      noProduct: 'المنتج غير موجود', noInvoice: 'لا توجد فاتورة شراء لهذا المنتج',
      stock: 'المتوفر', supplier: 'المورد', qty: 'الكمية المرتجعة', invoice: 'فاتورة الدخول',
      note: 'ملاحظة', notePlaceholder: 'اختياري...',
      modalTitle: 'إرجاع سلعة للمورد',
      notOwned: 'لا يمكن تعديل طلبات محل آخر',
      invalidQty: 'أدخل كمية صحيحة', qtyExceedsStock: 'الكمية أكبر من المتوفر في المخزون',
      qtyExceedsInvoice: 'الكمية أكبر مما ورد في هذه الفاتورة',
      created: 'تم تسجيل طلب الإرجاع',
      confirmReturned: 'تأكيد تم الاسترجاع؟\nسيتم خصم الكمية من المخزون وتخفيض فاتورة المورد والأثر على صافي الحساب.',
      confirmNotReturned: 'تأكيد عدم استرجاع السلعة؟\nلن يحدث أي تغيير على المخزون أو الفاتورة.',
      insufficientStock: 'المخزون الحالي لا يكفي للخصم', invoiceMissing: 'فاتورة الشراء غير موجودة',
      lineMissing: 'المنتج لم يعد موجودًا في الفاتورة',
      returnedSuccess: 'تم الاسترجاع: خُصمت الكمية من المخزون وخفّضت فاتورة المورد',
      delete: 'حذف الطلب', deleteReverse: 'تراجع عن الاسترجاع',
      deleteConfirm: 'حذف طلب الإرجاع؟', deleteReturnedConfirm: 'حذف الطلب؟\nسيتم التراجع عن كل التأثيرات (إعادة الكمية للمخزون ورفع الفاتورة).',
      deleted: 'تم حذف الطلب',
      refundNote: 'استرجاع بضاعة مورد',
      noExport: 'لا توجد بيانات للتصدير', exportSuccess: 'تم التصدير بنجاح', exportError: 'حدث خطأ أثناء الحفظ: ',
    },
    reports: {
      title: 'التقارير', sub: 'تقارير المبيعات والمخزون المتقدمة',
      c1: 'تقرير المبيعات', c1desc: 'تحليل المبيعات اليومية والأسبوعية والشهرية',
      c2: 'تقرير المخزون', c2desc: 'حالة المخزون وحركة القطع',
      c3: 'تقرير الأرباح', c3desc: 'الأرباح والخسائر',
      c4: 'تقرير العملاء', c4desc: 'تحليل قاعدة العملاء',
      dailySales: 'المبيعات اليومية', categoryDist: 'المبيعات حسب الفئة',
      bestSellers: 'أفضل المنتجات مبيعاً', brandSales: 'المبيعات حسب العلامة',
      dailyBreakdown: 'تفصيل المبيعات اليومية',
      period: 'الفترة:', exportPDF: 'تصدير PDF',
      period7: 'آخر 7 أيام', period30: 'آخر 30 يوم', period90: 'آخر 3 أشهر',
      period365: 'آخر سنة', periodAll: 'الكل',
      noSales: 'لا توجد مبيعات', profit: 'الربح',
      returnsPieces: 'المرتجعات (قطع)', pieces: ' قطعة',
      reportTitle: 'تقرير المبيعات والمرتجعات',
      periodLabel: 'الفترة:', totalSales: 'إجمالي المبيعات: ',
      totalProfit: 'إجمالي الربح: ', salesInvoiceCount: 'عدد فواتير البيع: ',
      returnsCount: 'عدد المرتجعات: ', netSales: 'صافي المبيعات: ',
      dailyDetails: 'التفصيل اليومي:', invoicesWord: ' فواتير',
      period2: 'الفترة:', thisWeek: 'هذا الأسبوع', thisMonth: 'هذا الشهر', thisYear: 'هذه السنة', custom: 'مخصص', specificDay: 'يوم محدد',
      from: 'من:', to: 'إلى:', date2: 'التاريخ:', totalSales2: 'إجمالي المبيعات', invoices2: 'فاتورة', pieces2: 'قطعة',
      profit2: 'ربح', paid2: 'مدفوع', remaining2: 'متبقي', returnCount: 'عدد المرتجعات', value: 'قيمة',
      netSales2: 'صافي المبيعات', returnRatio: 'نسبة العائد', profitMargin: 'هامش الربح',
      totalProfitMargin: 'هامش الربح الكلي', ratioLabel: 'النسبة', allTimeLabel: 'إجمالي عام',
      salesVsReturns: 'المبيعات vs المرتجعات', net: 'صافي', dailySalesVsReturns: 'المبيعات اليومية vs المرتجعات',
      salesTrend: 'اتجاه المبيعات', returnsTrend: 'اتجاه المرتجعات', salesByCategory: 'المبيعات حسب الفئة',
      returnsByReason: 'المرتجعات حسب السبب', topProducts: 'أفضل المنتجات مبيعاً',
      productCol: 'المنتج', barcodeCol: 'الباركود', qtySoldCol: 'الكمية المباعة', totalCol: 'الإجمالي', profitCol: 'الربح',
      dailyDetail2: 'تفصيل المبيعات والمرتجعات اليومي', dateCol: 'التاريخ',
      salesInvoicesCol: 'فواتير البيع', piecesSoldCol: 'قطع مباعة', salesValueCol: 'قيمة المبيعات',
      returnsCol: 'مرتجعات', piecesReturnedCol: 'قطع مرتجعة', netDayCol: 'صافي اليوم',
    },
    reportsNet: {
      title: 'صافي الحساب', period: 'الفترة:', year: 'السنة:', specificDate: 'تاريخ محدد',
      range: 'نطاق', sales: 'إجمالي المبيعات', purchases: 'إجمالي المشتريات',
      expenses: 'إجمالي المصروفات', profit: 'صافي الربح',
      periodDebt: 'المبالغ المعلقة للفترة', currentDebt: 'المبالغ المعلقة الحالية',
      customerDebt: 'دين لنا', supplierDebt: 'دين علينا',
      periodMargin: 'هامش الربح للفترة', totalMargin: 'هامش الربح الكلي',
    },
    backup: {
      title: 'النسخ الاحتياطي', sub: 'إدارة النسخ الاحتياطية للبيانات',
      c1: 'إنشاء نسخة احتياطية', c1desc: 'حفظ نسخة من قاعدة البيانات',
      c1btn: '<i class="fas fa-save"></i> تصدير',
      c2: 'استعادة نسخة', c2desc: 'استرجاع البيانات من نسخة سابقة',
      c2btn: '<i class="fas fa-upload"></i> استيراد',
      prevTitle: 'النسخ السابقة',
      empty: 'لا توجد نسخ احتياطية سابقة',
      restore: 'استعادة', creating: 'جاري إنشاء النسخة الاحتياطية...',
      operationCancelled: 'تم إلغاء العملية',
      createSuccess: '✓ تم إنشاء النسخة بنجاح — ',
      createFailed: '✗ فشل الحفظ: ',
      readingFile: 'جاري قراءة الملف...',
      readFileFailed: '✗ فشل قراءة الملف: ',
      invalidFile: '✗ الملف غير صالح — لا يحتوي على بيانات',
      restoreConfirm: 'استعادة النسخة الاحتياطية?',
      store: 'المتجر: ', date: 'التاريخ: ',
      content: 'المحتوى:\n',
      products: 'المنتجات', invoices: 'الفواتير',
      customers: 'العملاء', suppliers: 'الموردين',
      payments: 'المدفوعات', returns: 'المرتجعات',
      discounts: 'التخفيضات', unknown: 'غير معروف',
      dataWarning: '⚠️ سيتم استبدال جميع البيانات الحالية بالكامل!',
      restoreCancelled: 'تم إلغاء الاستعادة',
      restoreSuccess: '✓ تمت استعادة البيانات بنجاح. أعد فتح الصفحات لتحديث العرض.',
      restoreError: '✗ خطأ: ',
      readFileFailed2: '✗ فشل القراءة: ',
      invalidFile2: '✗ الملف غير صالح',
      restoreFromFileConfirm: 'استعادة',
      restoreFromFileWarning: 'سيتم استبدال جميع البيانات الحالية.',
      restoreFromFileSuccess: '✓ تمت الاستعادة من ',
      deleteAllConfirm: '⚠️ حذف كل البيانات?',
      deleteAllDetails: 'سيتم مسح جميع المنتجات، الفواتير، العملاء، الموردين، المدفوعات، المرتجعات، التخفيضات.',
      deleteAllWarning: 'هذا الإجراء لا يمكن التراجع عنه!',
      deleteAllBackupHint: 'تأكد من إنشاء نسخة احتياطية قبل المتابعة.',
      deleteAllFinalConfirm: 'تأكيد نهائي: حذف كل البيانات?\nلن تتمكن من استعادتها بدون نسخة احتياطية.',
      deleteAllDone: '✓ تم مسح كل البيانات. استخدم "استعادة نسخة" لاسترجاع البيانات.',
      clearData: 'مسح البيانات', clearDataDesc: 'مسح كل البيانات من التطبيق — يُستخدم لاختبار استعادة النسخة الاحتياطية',
      deleteAllBtn: 'حذف كل البيانات',
    },
    sharedInventory: {
      title: 'المخزون المشترك', sub: 'عرض مخزون المحل الرئيسي والفروع المرتبطة',
      searchAll: 'بحث في جميع المحلات', searchAllPlaceholder: 'ابحث بالاسم أو الباركود لمعرفة أي محل فيه المنتج...',
      loading: 'جاري تحميل البيانات...', backToList: 'رجوع للقائمة',
    },
    migration: {
      title: 'تحميل نسخة من برنامج سابق', cardTitle: 'تحميل نسخة من برنامج سابق',
      cardDesc: 'استيراد بيانات من أي برنامج آخر (CSV, Excel, قواعد بيانات...)',
      cardBtn: 'استيراد من برنامج سابق',
      dropHere: 'اسحب الملف هنا أو اضغط للاختيار',
      supportedFormats: 'يدعم: CSV, Excel, JSON, XML, SQL, SQLite (.db), dBASE (.dbf), Firebird (.fdb), أي نص',
      reading: 'جاري قراءة الملف...', readError: 'خطأ في قراءة الملف',
      selectTable: 'اختر الجدول الذي يحتوي على قطع الغيار:',
      preview: 'معاينة البيانات', columns: 'عمود',
      mapColumns: 'مطابقة الأعمدة',
      mapHint: 'البرنامج حاول مطابقة الأعمدة تلقائياً — راجع وعدّل حسب الحاجة',
      noMapping: 'بدون مطابقة',
      back: 'السابق', next: 'التالي',
      totalRows: 'إجمالي الصفوف:', mappedFields: 'الحقول المطابقة:',
      moreRows: 'صفوف إضافية...',
      importBtn: 'استيراد البيانات',
      needNameOrBarcode: 'يجب مطابقة حقل اسم المنتج أو الباركود على الأقل',
      importing: 'جاري الاستيراد...', importSuccess: 'تم الاستيراد بنجاح',
      productsImported: 'منتج تم استيراده', importError: 'خطأ في الاستيراد',
      cannotRead: 'لا يمكن قراءة الملف', parseError: 'خطأ في تحليل الملف',
      unsupportedDbType: 'قاعدة بيانات هذا النوع تحتاج تصدير أولاً',
      exportHint: 'قم بتصدير البيانات من برنامجك القديم كملف CSV أو Excel ثم حاول مرة أخرى',
      aiAnalyzing: 'جاري التحليل بالذكاء الاصطناعي...',
      aiError: 'خطأ في الذكاء الاصطناعي',
      aiDone: 'اكتمل التحليل بالذكاء الاصطناعي',
      aiAnalyzed: 'تم التحليل بالذكاء الاصطناعي',
      chooseMode: 'اختر طريقة المعالجة',
      modeHint: 'المعالجة المحلية سريعة وتعتمد على المطابقة التلقائية. المعالجة بالذكاء الاصطناعي تحلل البيانات بذكاء لفهم النصوص غير المنظمة.',
      localMode: 'معالجة محلية',
      localHint: 'مطابقة تلقائية سريعة',
      aiMode: 'معالجة بالذكاء الاصطناعي',
      aiHint: 'تحليل ذكي عبر مزود AI تختاره',
      aiRequiresKey: '* المعالجة بالذكاء الاصطناعي تتطلب مفتاح API مضبوط في الإعدادات',
      firebirdNoPath: 'تعذر الوصول إلى مسار ملف قاعدة Firebird',
      firebirdNoTables: 'لا توجد جداول قابلة للقراءة في قاعدة البيانات',
      firebirdOpenError: 'تعذر فتح قاعدة بيانات Firebird',
      firebirdTableError: 'تعذر قراءة الجدول',
      selectRole: 'ماذا يحتوي هذا الجدول؟',
      roleHint: 'حدد نوع البيانات ليُستورد بالشكل الصحيح',
      roleProducts: 'قطع غيار / منتجات',
      roleCustomers: 'العملاء',
      roleSuppliers: 'الموردون',
      needName: 'يجب مطابقة حقل الاسم على الأقل',
      importDone: 'تم الاستيراد بنجاح',
      roleSalesInvoices: 'فواتير البيع',
      rolePurchaseInvoices: 'فواتير الشراء',
      importedNote: 'مستورد',
      oldInvoiceNote: 'فاتورة مستوردة',
      oldPaymentNote: 'مدفوعات مستوردة',
      restoringBackup: 'جاري استرجاع النسخة الاحتياطية (gbak)...',
      loadingBrands: 'جاري قراءة العلامات التجارية...',
      brandEmpty: 'بدون علامة',
      fullImportPanelTitle: 'استيراد شامل لكل البيانات',
      fullImportPanelDesc: 'تم اكتشاف قاعدة بيانات Sable Stock / Gestion Stock — يمكن استيراد كل شيء دفعة واحدة: العملاء، الموردون، المنتجات بالأسعار، الفواتير والمرتجعات.',
      fullImportBtn: 'استيراد شامل',
      fullImportPopupTitle: 'اختر العلامات التجارية للاستيراد',
      fullImportPopupHint: 'حدد العلامات التجارية التي تريد استيراد منتجاتها. المنتجات التي لا تحمل علامة تُستورد دائماً.',
      selectAll: 'تحديد الكل',
      cancelImport: 'إلغاء',
      confirmImport: 'بدء الاستيراد',
      creatingBackup: 'جاري إنشاء نسخة احتياطية قبل الاستيراد...',
      productsNone: 'لم يتم استيراد أي منتج (تأكد من تحديد العلامات)',
      fullImportDone: 'اكتمل الاستيراد الشامل',
      returnsCount: 'المرتجعات',
      avoirReason: 'مرتجع (Avoir)',
      walkin: 'عميل عابر',
    },
    brandCat: { brand: 'العلامة', category: 'اختر نوع القطعة', searchPlaceholder: 'بحث عن نوع...', addProduct: 'إضافة منتج' },
    catProducts: { title: 'المنتجات', sub: 'المنتجات المتوفرة', searchPlaceholder: 'بحث عن منتج...', addProduct: 'إضافة منتج', empty: 'لا توجد منتجات في هذا التصنيف', addInvoiceTitle: 'إضافة منتج للفاتورة', scanPlaceholder: 'امسح الباركود ضوئياً...', scannerReady: 'جاهز للمسح', searchProduct: 'بحث عن منتج', newProduct: 'منتج جديد', searchExisting: 'ابحث بالاسم أو الباركود', searchExistingPlaceholder: 'اسم المنتج أو الباركود...', name: 'اسم المنتج', namePlaceholder: 'اسم القطعة', barcode: 'الباركود', barcodePlaceholder: 'أدخل الباركود', generate: 'توليد', qty: 'الكمية', buyPrice: 'سعر الشراء', sellPrice: 'سعر البيع', supplier: 'المورد', supplierPlaceholder: 'ابحث عن مورد بالاسم...', cancel: 'إلغاء', addToCart: 'إضافة إلى سلة الفاتورة', cartTitle: 'سلة الفاتورة', total: 'الإجمالي:', clear: 'تفريغ',       confirmInvoice: 'تأكيد الفاتورة', fiscalStamp: 'طابع جبائي (Timbre Fiscal)', wholesalePrice: 'سعر البيع بالجملة' },
    settings: {
      title: 'الاعدادات', sub: 'إعدادات البرنامج',
      general: 'الإعدادات العامة',
      storeName: 'اسم المتجر', currency: 'العملة', language: 'اللغة',
      notif: 'إشعارات المخزون المنخفض',       autoBackup: 'نسخ احتياطي تلقائي',
      info: 'معلومات البرنامج',
      version: 'الإصدار', developer: 'مطور البرنامج', company: 'الشركة المطورة', lastUpdate: 'آخر تحديث',
    },
    chart: { sales: 'المبيعات', inventory: 'المخزون', returns: 'المرتجعات' },
    connection: {
      title: 'اعدادات الاتصال', sub: 'إعدادات الاتصال السحابي وإدارة المحلات',
    },
    btn: {
      newInvoice: 'فاتورة جديدة', addPart: 'إضافة قطعة', export: 'تصدير',
      addSupplier: 'إضافة مورد', addCustomer: 'إضافة عميل', addDiscount: 'إضافة تخفيض',
      addReturn: 'تسجيل مرتجع',
    },
    common: {
      save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', edit: 'تعديل', confirm: 'تأكيد',
      close: 'إغلاق', print: 'طباعة', loading: 'جاري التحميل...', processing: 'جاري المعالجة...',
      noResults: 'لا توجد نتائج', empty: 'فارغ', search: 'بحث',
      page: 'صفحة', of: 'من', product: 'منتج', piece: 'قطعة', invoice: 'فاتورة',
      qty: 'الكمية', total: 'الإجمالي', paid: 'المدفوع', remaining: 'المتبقي', debt: 'دين',
      date: 'التاريخ', name: 'الاسم', status: 'الحالة', actions: 'إجراءات',
      yes: 'نعم', no: 'لا', success: 'تم بنجاح', error: 'خطأ', warning: 'تنبيه',
      areYouSure: 'هل أنت متأكد؟', stock: 'المخزون', price: 'السعر',
      addItem: 'إضافة', removeItem: 'إزالة', clearCart: 'تفريغ السلة',
      ready: 'جاهز', done: 'تم ✓', notFound: 'غير موجود', outOfStock: 'غير متوفر',
      lowStock: 'مخزون منخفض', new: 'جديد', provisional: 'شكلي',
      paidFull: 'مدفوعة كلياً', paidPartial: 'دفعة جزئية', unpaid: 'غير مدفوعة',
      manual: 'يدوي', customer: 'عميل',
      back: 'رجوع', pay: 'دفع', payFull: 'دفع كلياً', searchAll: 'بحث في الكل', refresh: 'تحديث', confirmPay: 'تأكيد الدفع',
      barcode: 'الباركود', brand: 'العلامة التجارية', category: 'التصنيف', supplier: 'المورد',
      address: 'العنوان', phone: 'رقم الهاتف', email: 'البريد الإلكتروني', username: 'اسم المستخدم', password: 'كلمة المرور',
      generate: 'توليد', fiscalStamp: 'الطابع الجبائي', cart: 'السلة', clear: 'تفريغ',
      subtotal: 'المجموع الفرعي', discount: 'الخصم', totalAfterDiscount: 'الإجمالي بعد الخصم',
      payNow: 'المبلغ المدفوع الآن', remainingDebt: 'المتبقي (دين)', fullPayment: 'دفع كامل', noPayment: 'بدون دفع',
      real: 'حقيقي', formal: 'شكلي', customerDiscount: 'خصم العميل', additionalDiscount: 'تخفيض إضافي',
    },
    sales: {
      title: 'البيع', sub: 'إنشاء فاتورة بيع جديدة',
      searchParts: 'بحث القطع', searchPlaceholder: 'ابحث باسم القطعة أو رقمها...',
      emptySearch: 'اكتب لبدء البحث عن قطع الغيار',
      emptyResults: 'لا توجد نتائج للبحث', emptyProducts: 'لا توجد منتجات',
      cart: 'سلة المشتريات', cartEmpty: 'السلة فارغة', total: 'المجموع:',
      checkout: 'إتمام البيع',
      unavailable: 'غير متوفر', lowStockTip: 'مخزون منخفض',
      scannerReady: 'جاهز', scannerDone: 'تم ✓', scannerNotFound: 'غير موجود', scannerUnavailable: 'غير متوفر',
      noCustResults: 'لا توجد نتائج', discount: 'خصم',
      del: 'حذف',
      fullyPaid: 'مدفوعة كلياً', partialPay: 'دفعة جزئية', enterPaid: 'أدخل المبلغ المدفوع',
      cartEmptyAlert: 'السلة فارغة', notAvailableQty: 'غير متوفر بالكمية المطلوبة', available: 'المتوفر:',
      paidExceedsTotal: 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي',
      fullPaymentNote: 'دفع كامل عند البيع', partialPaymentNote: 'دفع جزئي عند البيع',
      discountType: 'عميل', discountManual: 'يدوي',
      clearCartConfirm: 'تفريغ سلة المشتريات؟',
      customer: 'العميل', customerPlaceholder: 'ابحث عن عميل...', unregistered: 'زبون غير مسجل', remove: 'إزالة',
      cartTitle: 'سلة المشتريات', subtotal: 'المجموع الفرعي', customerDiscount: 'خصم العميل', additionalDiscount: 'تخفيض إضافي',
      totalLabel: 'الإجمالي', paidLabel: 'المبلغ المدفوع', payFull: 'دفع كلياً', remainingLabel: 'الباقي',
      clear: 'تفريغ', checkout: 'إتمام البيع', emptyCartTitle: 'السلة فارغة', emptyCartHint: 'امسح باركود القطعة أو اخترها من قائمة المنتجات',
      scanPlaceholder: 'امسح الباركود ضوئياً...', searchPlaceholder2: 'ابحث باسم القطعة أو الباركود...', productsCount: '0 منتج', multiBatches: 'دفعات متعددة', mixedPrice: 'أسعار متعددة', unit: 'قطعة', wholesale: 'جملة',
      payMethod: 'طريقة الدفع', payCash: 'نقداً', payCcp: 'CCP', payBoth: 'الاثنان معاً',
      cashAmount: 'المبلغ النقدي', ccpAmount: 'مبلغ CCP',
    },
    orders: {
      title: 'الطلبات', sub: 'طلب القطع الناقصة من الموردين',
      tabMine: 'طلباتي', tabBranches: 'طلبات الفروع',
      suggestions: 'اقتراحات النقص', noSuggestions: 'لا توجد منتجات منخفضة أو نافدة — رائع!',
      search: 'ابحث باسم القطعة أو الباركود...',
      all: 'الكل', today: 'اليوم', week: 'الأسبوع', month: 'الشهر', year: 'السنة',
      refresh: 'تحديث',
      empty: 'لا توجد طلبات بعد — أضف من اقتراحات النقص أو ابحث',
      statusPending: 'قيد الانتظار', statusDone: 'منجز', statusNotAvailable: 'لا يوجد',
      btnDone: 'منجز', btnNotAvailable: 'لا يوجد', btnDelete: 'حذف',
      deleteConfirm: 'حذف هذا الطلب؟',
      cloudRequired: 'يتطلب اتصالاً بالسحابة لعرض طلبات الفروع',
      loading: 'جاري تحميل طلبات الفروع...',
      noBranchOrders: 'لا توجد طلبات من الفروع بعد',
    },
    invoices: {
      title: 'الفواتير', sub: 'جميع فواتير البيع والمشتريات',
      search: 'بحث عن فاتورة...', newInvoice: 'فاتورة جديدة',
      col1: 'رقم الفاتورة', col2: 'التاريخ', col3: 'العميل', col4: 'المبلغ', col5: 'الحالة', col6: 'إجراءات',
      empty: 'لا توجد فواتير بعد', noMatch: 'لا توجد فواتير مطابقة',
      resultsInfo: ' فاتورة',
      typeSale: 'فاتورة بيع', typeSupplier: 'فاتورة مورد', typeWaybill: 'فاتورة طريق',
      typeProforma: 'فاتورة شكلية', typeDispatch: 'فاتورة إرسال', typeTransfer: 'فاتورة تحويل',
      typeReception: 'فاتورة استلام', typePurchase: 'فاتورة شراء',
      badgeProvisional: 'شكلي',
      itemCount: 'منتج', paidLabel: 'مدفوعة', unpaidLabel: 'غير مدفوعة', remainingLabel: 'متبقي',
      pageInfo: 'الصفحة', allowPopups: 'الرجاء السماح بالنوافذ المنبثقة للطباعة',
      cannotPayReception: 'لا يمكن إضافة دفعة لفاتورة استلام — فاتورة مرجعية فقط',
      cannotPayProforma: 'لا يمكن إضافة دفعة لفاتورة شكلية',
      fullyPaidAlert: 'هذه الفاتورة مسددة بالكامل', invalidAmount: 'المبلغ غير صحيح',
      transferPayNote: 'دفعة على فاتورة تحويل', regularPayNote: 'دفعة عبر الفواتير',
      paymentSaved: 'تم تسجيل الدفعة بنجاح',
      cannotEditDispatch: 'لا يمكن تعديل فاتورة إرسال',
      cannotEditReception: 'لا يمكن تعديل فاتورة استلام — فاتورة مرجعية فقط',
      cannotEditProformaWaybill: 'لا يمكن تعديل فاتورة طريق شكلية',
      editTitle: 'تعديل الفاتورة',
      editHelpSupplier: 'فاتورة مورد: زيادة الكمية تزيد المخزون ورصيد المورد، نقص الكمية يقلل المخزون ورصيد المورد.',
      editHelpCustomer: 'قم بتعديل الكميات. الزيادة تُخصم من المخزون، النقصان يُرجع للمخزون ويُسجل كمرتجع.',
      scanPlaceholder: 'امسح الباركود أو اكتب اسم المنتج...',
      editColProduct: 'المنتج', editColCurrentQty: 'الكمية الحالية', editColNewQty: 'الكمية الجديدة',
      saveEdits: 'حفظ التعديلات', cancelEdit: 'إلغاء',
      scanDone: 'تم ✓', scanReady: 'جاهز', scanNotFound: 'غير موجود', resultCount: 'نتيجة',
      availableStock: 'متوفر:', notInStock: 'غير متوفر في المخزон', badgeNew: 'جديد',
      cannotBelowZero: 'لا يمكن جعل كمية "..." أقل من الصفر في المخزون',
      insufficientStock: 'المخزون غير كافٍ لـ "..."',
      noQtyChanged: 'لم يتم تغيير أي كمية',
      invoiceEdited: 'تم تعديل الفاتورة بنجاح',
      deleteConfirm: 'هل أنت متأكد من حذف هذه الفاتورة بالكامل؟ سيتم إرجاع المنتجات للمخزون وحذف الدفعات والمرتجعات المرتبطة.',
      cannotDeleteReception: 'لا يمكن حذف فاتورة استلام — فاتورة مرجعية فقط',
      cannotDeleteSold: 'لا يمكن حذف فاتورة المورد لأن المنتج "..." تم بيعه بالفعل',
      invoiceDeleted: 'تم حذف الفاتورة',
      transferEditTitle: 'تعديل فاتورة التحويل',
      transferEditHelp: 'تعديل كمية الأصناف. الزيادة تنقص من مخزونك وتُضاف للمُستلم. النقصان يُضاف لمخزونك وينقص من المُستلم.',
      currentTotal: 'الإجمالي الحالي:', editColSellPrice: 'ثمن البيع',
      newTotal: 'الإجمالي الجديد:', diff: 'الفرق:',
    },
    inventory: {
      title: 'المخزون', sub: 'إدارة مخزون قطع الغيار',
      search: 'بحث في المخزون...', add: 'إضافة قطعة', export: 'تصدير',
      col1: 'الرمز', col2: 'اسم القطعة', col3: 'العلامة', col4: 'الكمية', col5: 'سعر الشراء', col6: 'سعر البيع', col7: 'إجراءات',
      empty: 'المخزون فارغ',
      transferBranch: 'نقل المنتجات إلى فرع أو محل رئيسي',
      transferMain: 'نقل منتجات إلى الفروع',
      scannerReady: 'جاهز للمسح', scannerProcessing: 'جاري المعالجة...',
      scannerFound: 'تم العثور على:', scannerDone: 'تم المسح',
      scannerNewBarcode: 'منتج جديد - الباركود', scannerNew: 'منتج جديد',
      noResults: 'لا توجد نتائج',
      enterName: 'الرجاء إدخال اسم المنتج', enterBarcode: 'الرجاء إدخال الباركود',
      clearCartConfirm: 'تفريغ سلة الفاتورة؟', cartEmpty: 'سلة الفاتورة فارغة',
      invoiceSaved: 'تم تسجيل فاتورة بقيمة', fiscalStamp: 'طابع جبائي',
      includes: 'تشمل', productUnit: 'منتج', pieceUnit: 'قطعة',
      editLabelName: 'اسم المنتج', editLabelBarcode: 'الباركود', editLabelBrand: 'العلامة',
      editLabelCategory: 'التصنيف', editLabelQty: 'الكمية', editLabelBuyPrice: 'سعر الشراء', editLabelSellPrice: 'سعر البيع', editLabelWholesale: 'سعر البيع بالجملة',
      editTitle: 'تعديل المنتج',
      deleteConfirm: 'هل أنت متأكد من حذف هذا المنتج؟',
      importSuccess: 'تم استيراد', importSuccessEnd: 'منتج بنجاح',
      importCost: 'تكلفة المشتريات:', importRecorded: 'مسجلة في صافي الحساب',
      importFailed: 'فشل الاستيراد. تأكد من تنسيق الملف',
      addWithInvoice: 'إضافة مخزون + فاتورة', transferBtn: 'نقل منتجات', exportCSV: 'تصدير CSV', importCSV: 'استيراد CSV',
      addTitle: 'إضافة مخزون + فاتورة', scanPlaceholder2: 'امسح الباركود ضوئياً...',
      searchExisting: 'ابحث عن منتج موجود (بالاسم أو الباركود)', searchExistingPlaceholder: 'اسم المنتج أو الباركود...',
      category: 'التصنيف', name: 'اسم المنتج', barcode: 'الباركود', generate2: 'توليد',
      qty: 'الكمية', buyPrice: 'سعر الشراء', sellPrice: 'سعر البيع', wholesalePrice: 'سعر البيع بالجملة', supplierOptional: 'المورد (اختياري)',
      supplierSearchPlaceholder: 'ابحث عن مورد...', addToCart: 'إضافة إلى سلة الفاتورة',
      invoiceCart: 'سلة الفاتورة', fiscalStamp2: 'الطابع الجبائي (Timbre Fiscal)', totalLabel: 'الإجمالي:',
      clear2: 'تفريغ', confirmInvoice: 'تأكيد الفاتورة', categoryCol: 'التصنيف',
    },
    transfer: {
      loading: 'جاري التحميل...', chooseDest: 'اختر الوجهة', mainStore: 'المحل الرئيسي',
      loadError: 'خطأ في تحميل الوجهات',
      scannerProcessing: 'جاري المعالجة...', scannerFound: 'تم العثور على:', scannerDone: 'تم المسح',
      scannerNotFound: 'لا يوجد منتج بالباركود', scannerNotInStock: 'في مخزونك', scannerNotFoundShort: 'غير موجود',
      noResults: 'لا توجد نتائج', stock: 'المخزون:',
      selectDestFirst: 'الرجاء اختيار محل الوجهة أولاً',
      searchFirst: 'الرجاء البحث عن منتج أولاً', qtyZero: 'الكمية يجب أن تكون أكبر من صفر',
      qtyExceeds: 'الكمية المطلوبة', qtyExceedsAvail: 'تتجاوز المتوفر',
      buyPriceZero: 'سعر الشراء يجب أن يكون أكبر من صفر',
      donationLabel: 'إرسال المنتجات دون مقابل (تبرع)',
      donationWarning: 'تحذير: فاتورة النقل ستظهر برصيد 0، وفاتورة الاستلام ستظهر للمستلم برصيد 0.',
      donationNote: 'تبرع (نقل دون مقابل)',
      available: 'المتوفر:',
      clearCartConfirm: 'تفريغ سلة فاتورة النقل؟', scannerReady: 'جاهز للمسح',
      selectDest: 'الرجاء اختيار محل الوجهة', cartEmpty: 'سلة النقل فارغة',
      paidExceedsTotal: 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي',
      confirmTitle: 'تأكيد النقل:', confirmFrom: 'من:', confirmTo: 'إلى:',
      confirmProducts: 'المنتجات:', confirmTotal: 'الإجمالي:', confirmPaid: 'المدفوع:', confirmRemaining: 'المتبقي (دين):',
      confirmContinue: 'هل تريد المتابعة؟',
      productNotFound: 'المنتج "..." غير موجود في المخزون',
      stockLessThanNeeded: 'الكمية المتوفرة للمنتج "..." أقل من المطلوبة',
      payNote: 'دفع - نقل إلى',
      transferSuccess: 'تم تنفيذ فاتورة النقل بنجاح!',
      transferredProducts: 'المنتجات المنقولة:', transferTotal: 'الإجمالي:',
      transferPaid: 'المدفوع:', transferRemaining: 'المتبقي (دين):',
      transferError: 'حدث خطأ أثناء تنفيذ النقل:',
      sub: 'نقل منتجات من محل إلى آخر مع تسجيل ديون',
      senderStore: 'المحل المرسل', destination: 'الوجهة',
      chooseDestination2: '-- اختر الوجهة --', selectDestination: 'اختر محل الوجهة',
      scanPlaceholder2: 'امسح الباركود ضوئياً...', searchExisting: 'ابحث عن منتج في المخزون (بالاسم أو الباركود)',
      searchPlaceholder2: 'اسم المنتج أو الباركود...', productDataTitle: 'بيانات المنتج للنقل',
      productName: 'اسم المنتج', availableQty: 'الكمية المتوفرة', transferQty: 'الكمية للنقل',
      buyPrice: 'سعر الشراء', sellPrice2: 'سعر البيع', brand2: 'العلامة التجارية', category2: 'التصنيف',
      addToCart2: 'إضافة إلى سلة النقل', transferCart: 'سلة فاتورة النقل', totalLabel2: 'الإجمالي:',
      clear3: 'تفريغ', paymentSection: 'الدفع والديون', payNow2: 'المبلغ المدفوع الآن',
      remainingDebt2: 'المتبقي (دين):', fullPayment2: 'دفع كامل', noPayment2: 'بدون دفع',
      confirmTransfer: 'تأكيد وتنفيذ فاتورة النقل',
    },
    settings: {
      title: 'الاعدادات', sub: 'إعدادات البرنامج',
      general: 'الإعدادات العامة',
      storeName: 'اسم المتجر', currency: 'العملة', language: 'اللغة',
      notif: 'إشعارات المخزون المنخفض',       autoBackup: 'نسخ احتياطي تلقائي',
      info: 'معلومات البرنامج',
      version: 'الإصدار', developer: 'مطور البرنامج', company: 'الشركة المطورة', lastUpdate: 'آخر تحديث',
      settingsSaved: 'تم حفظ الإعدادات',
      wrongPassword: 'كلمة المرور الحالية غير صحيحة',
      verifyError: 'خطأ في التحقق:',
      passwordMinLength: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل',
      passwordsNoMatch: 'كلمتا المرور غير متطابقتين',
      passwordSaved: 'تم حفظ كلمة المرور بنجاح',
      errorPrefix: 'خطأ:',
      colPage: 'الصفحة', colView: 'عرض', colEdit: 'تعديل', colDelete: 'حذف',
      enterUsername: 'الرجاء إدخال اسم المستخدم', enterPassword: 'الرجاء إدخال كلمة المرور',
      userUpdated: 'تم تحديث المستخدم بنجاح', userCreated: 'تم إنشاء المستخدم بنجاح',
      noPerms: 'بدون صلاحيات',
      delete_user_confirm: 'هل أنت متأكد من حذف المستخدم "..."؟',
      storeAddress: 'عنوان المحل', phoneNumber: 'رقم الهاتف', enableFiscalStamp: 'تفعيل الطابع الجبائي في الفواتير',
      fiscalRatio: 'النسبة:', fiscalMin: 'الحد الأدنى 5 دج - الحد الأقصى 10,000 دج',
      fiscalPercent: '% (0% للأنظمة المبسطة)', lowStockThreshold: 'حد المخزون المنخفض',
      lowStockHint: 'أقل من هذا الرقم يُعتبر مخزون منخفض', saveSettings: 'حفظ الإعدادات',
      storePasswordCard: 'كلمة مرور المحل', storePasswordDesc: 'لحماية المحل، أنشئ كلمة مرور. لا يمكن الدخول كمدير بدونها.',
      currentPassword: 'كلمة المرور الحالية', currentPasswordPlaceholder: 'اتركها فارغة إذا جديدة',
      newPassword: 'كلمة المرور الجديدة', newPasswordPlaceholder: 'كلمة مرور المحل',
      confirmPassword: 'تأكيد كلمة المرور', confirmPasswordPlaceholder: 'أعد إدخال كلمة المرور',
      savePassword: 'حفظ كلمة المرور',
      lanCard: 'مزامنة الشبكة المحلية (LAN)',
      lanDesc: 'اربط هذا الجهاز بجهاز آخر في نفس المحل عبر الراوتر لمزامنة فورية لكل عمليات البيع والإدخال والتعديل.',
      lanRole: 'دور هذا الجهاز',
      lanOff: 'معطل',
      lanMain: 'سيرفر رئيسي (الجهاز الذي يملك IP ثابت)',
      lanSub: 'سيرفر فرعي (جهاز الكاشير الثاني)',
      lanLocalIps: 'عناوين IP هذا الجهاز',
      lanLocalIpHint: 'ثبّت أحد هذه العناوين كعنوان IP ثابت في إعدادات Windows/الراوتر، وأدخل نفس العنوان في الجهاز الفرعي.',
      lanServerIp: 'عنوان IP السيرفر الرئيسي',
      lanPort: 'المنفذ',
      lanPortHint: 'يبدأ بـ 4512 ويتغيّر تلقائيًا إن كان مشغولًا',
      lanStatus: 'حالة المزامنة',
      lanStatusOff: 'المزامنة معطلة',
      lanStatusMainOn: 'السيرفر الرئيسي يعمل',
      lanStatusMainOff: 'السيرفر الرئيسي متوقف',
      lanStatusClients: 'الأجهزة المتصلة',
      lanStatusSubOn: 'متصل بالسيرفر الرئيسي',
      lanStatusSubOff: 'غير متصل بالسيرفر الرئيسي',
      lanListeningPort: 'المنفذ الفعلي',
      lanFirewallHint: 'إن لم يتصل الجهاز الفرعي، اسمح لهذا البرنامج عبر جدار حماية Windows (شبكة خاصة): الإعدادات ← خصوصية وأمان ← جدار حماية Windows ← السماح لتطبيق عبر جدار الحماية.',
      lanTest: 'اختبار الاتصال',
      lanTestWait: 'جارٍ الاختبار...',
      lanTestOk: 'الاتصال ناجح — السيرفر متاح على هذا المنفذ',
      lanTestFail: 'فشل الاتصال',
      lanTestRefused: 'لا يوجد سيرفر على هذا العنوان/المنفذ',
      lanTestTimeout: 'انتهت المهلة — قد يكون المنفذ محجوبًا أو العنوان خاطئًا',
      lanTestUnreachable: 'العنوان لا يمكن الوصول إليه — تأكد من أن الجهازين على نفس الشبكة',
      lanSaved: 'تم حفظ إعدادات المزامنة بنجاح',
      lanIpRequired: 'أدخل عنوان IP السيرفر الرئيسي أولاً',
      usersCard: 'إدارة المستخدمين', usersDesc: 'أنشئ مستخدمين وحدد صلاحياتهم للبرنامج.',
      addUser: 'إضافة مستخدم', newUser: 'مستخدم جديد',
      userName: 'اسم المستخدم', userNamePlaceholder: 'اسم المستخدم',
      userPassword: 'كلمة المرور', userPasswordPlaceholder: 'كلمة المرور',
      permissions: 'الصلاحيات',
    },
    storeDebts: {
      title: 'ديون المحلات', sub: 'ديون المحلات حسب فواتير التحويل',
      storeCount: 'عدد المحلات', owedToUs: 'لدينا ( عليهم )', weOwe: 'عليهم ( لنا )',
      netDebt: 'صافي الديون', transferInvoices: ' فاتورة تحويل',
      owedLabel: 'عليهم:', weOweLabel: 'لنا:', paidLabel: 'مدفوع:',
      totalDebt: 'إجمالي الدين', totalInvoices: 'إجمالي الفواتير',
      paid: 'المدفوع', remaining: 'المتبقي',
      typeTransfer: 'تحويل صادر', typeReception: 'استلام',
      statusPaid: 'مدفوع', statusRemaining: 'متبقي',
      noTransfers: 'لا توجد فواتير تحويل',
      payTitle: 'تسديد دفعة', total: 'الإجمالي:', paidPreviously: 'المدفوع سابقاً:',
      payAmount: 'مبلغ الدفعة', confirmPay: 'تأكيد الدفع', back: 'رجوع',
      noInvoices: 'لا توجد فواتير', invoiceDetails: 'تفاصيل الفاتورة',
      invoiceActionsPrint: 'طباعة', invoiceActionsPay: 'دفع', invoiceActionsEdit: 'تعديل',
      invoiceActionsDelete: 'حذف', invoiceActionsClose: 'إغلاق',
      totalDebtLabel: 'إجمالي الدين', emptyPlaceholder: 'لا توجد فواتير تحويل',
    },
    branchesMonitor: {
      title: 'مراقبة الفروع', sub: 'مراقبة وإدارة جميع فروعك من مكان واحد',
      loading: 'جاري تحميل البيانات...',
      online: 'متصل', offline: 'غير متصل',
      productCount: ' منتج', saleCount: ' مبيعة',
      viewDetails: 'عرض التفاصيل',
      noData: 'لا توجد بيانات متاحة', noInventory: 'لا يوجد مخزون', noInvoices: 'لا توجد فواتير',
      productsLabel: 'عدد المنتجات:', invoicesLabel: 'عدد الفواتير:',
      tabInventory: 'المخزون', tabInvoices: 'الفواتير', tabPurchases: 'المشتريات', tabNet: 'صافي الحساب',
      notAvailable: 'غير متاح',
      sold: 'مدفوع', provisional: 'معلق',
      transferIncome: 'مداخيل التحويل', transferCost: 'مصاريف التحويل',
      totalSales: 'إجمالي المبيعات', totalPurchases: 'إجمالي المشتريات',
      netAccount: 'صافي الحساب',
      searchPlaceholder: 'بحث في المنتجات...',
      noSearchResults: 'لا توجد نتائج في أي محل',
      outOfStock: 'نفذ', inStock: 'متوفر',
      searchAll: 'بحث في جميع المحلات', searchAllPlaceholder: 'ابحث بالاسم أو الباركود لمعرفة أي محل فيه المنتج...',
      branchCount: 'عدد الفروع', totalProducts: 'إجمالي المنتجات', totalRevenue: 'إجمالي الإيرادات',
      branchesList: 'قائمة الفروع', refresh: 'تحديث', noBranches: 'لا توجد فروع مسجلة',
      backToList: 'رجوع للقائمة', products: 'المنتجات', invoices: 'الفواتير',
      sales: 'المبيعات', purchases: 'فواتير الشراء', loadingPlaceholder: 'جاري التحميل...',
    },
    chart: { sales: 'المبيعات', inventory: 'المخزون', returns: 'المرتجعات' },
    btn: {
      newInvoice: 'فاتورة جديدة', addPart: 'إضافة قطعة', export: 'تصدير',
      addSupplier: 'إضافة مورد', addCustomer: 'إضافة عميل', addDiscount: 'إضافة تخفيض',
      addReturn: 'تسجيل مرتجع',
    },
    connection: {
      title: 'اعدادات الاتصال', sub: 'إعدادات الاتصال السحابي وإدارة المحلات',
      connected: 'متصل بالسحابة',
      mainConnected: 'محل رئيسي - متصل بـ Supabase',
      branchConnectedMsg: 'فرع متصل بالمحل الرئيسي',
      mainStore: 'محل رئيسي', branch: 'فرع',
      branchParenthetical: '(فرع)',
      enterCredentials: 'أدخل بيانات الاتصال للبدء',
      logoutConfirm: 'هل أنت متأكد من تسجيل الخروج؟',
      cloudRequired: 'الرجاء الاتصال بالسحابة أولاً',
      uploading: 'جاري الرفع...', noChanges: 'لا توجد تغييرات للرفع',
      uploadSuccess: 'تم الرفع بنجاح',
      uploadBackupBtn: 'رفع نسخة احتياطية',
      lanSubUploadMsg: 'هذا الجهاز فرعي (LAN): رفع البيانات للسحابة يتم من السيرفر الرئيسي لهذا الموقع',
      enterStorePassword: 'أدخل كلمة مرور المحل للتحميل:',
      wrongPassword: 'كلمة المرور غير صحيحة',
      verificationError: 'خطأ في التحقق: ',
      backupEmpty: 'النسخة الاحتياطية فارغة',
      restoreSuccessMsg: 'تم الاسترداد بنجاح - أعد تشغيل البرنامج',
      restoreBackupBtn: 'استرداد نسخة احتياطية',
      lastSync: 'آخر مزامنة: ',
      branchNameRequired: 'الرجاء إدخال اسم الفرع',
      passwordRequired: 'الرجاء إدخال كلمة المرور',
      branchCreated: 'تم إنشاء الفرع بنجاح - الرمز: ',
      passwordLabel: 'كلمة المرور: ',
      viewStock: 'عرض المخزون', deleteBranchBtn: 'حذف الفرع',
      deleteBranchConfirm1: 'هل أنت متأكد من حذف فرع "',
      deleteBranchConfirm2: 'لن تتمكن من استعادته.',
      enterStorePasswordView: 'أدخل كلمة مرور المحل لعرض مخزون الفرع:',
      noBranchStock: 'لا يوجد مخزون لهذا الفرع',
      barcode: 'الباركود', brand: 'العلامة', sellPrice: 'سعر البيع',
      emailRequired: 'الرجاء إدخال بريد صحيح',
      searching: 'جاري البحث...', noPassword: 'لا توجد كلمة مرور',
      savingPassword: 'جاري حفظ كلمة المرور الجديدة...',
      userInfoTitle: 'معلومات المستخدم', emailLabel: 'البريد الإلكتروني', codeLabel: 'الرمز الخاص',
      storeTypeLabel: 'نوع المحل', mainCodeLabel: 'الرمز الرئيسي',
      statusTitle: 'غير متصل', statusDesc: 'أدخل بيانات الاتصال لل 시작',
      statusBadge: 'غير متصل', connTab: 'الاتصال', backupTab: 'النسخ الاحتياطي',
      branchesTab: 'الفروع', recoveryTab: 'استرداد الحساب',
      cloudStatusCard: 'حالة الاتصال السحابي', cloudStatusDesc: 'الاتصال بالسحابة تلقائي. جميع بياناتك محفوظة بأمان.',
      logoutBtn: 'تسجيل خروج', uploadCard: 'رفع نسخة احتياطية', uploadDesc: 'سيتم استبدال النسخة الموجودة في السحابة...',
      pushTitle: 'إشعارات الجوال', pushDesc: 'عند إنشاء طلب منتج أو استرجاع سلعة فاسدة، يُرسل إشعار فوري لهاتفك حتى عندما يكون الموقع مغلقًا.',
      siteUrlLabel: 'رابط الموقع', siteUrlPlaceholder: 'https://...',
      pushSecretLabel: 'المفتاح السري', pushSecretPlaceholder: 'المفتاح السري الخاص بك',
      pushSaveBtn: 'حفظ', pushUrlRequired: 'أدخل رابط الموقع', pushUrlInvalid: 'رابط الموقع غير صالح',
      pushSecretRequired: 'أدخل المفتاح السري', pushSaved: 'تم حفظ الإعدادات',
      autoBackup: 'النسخ الاحتياطي التلقائي', backupInterval: 'الفترة (بالدقائق)',
      min1: '1 دقيقة', min2: '2 دقيقة', min5: '5 دقائق', min10: '10 دقائق', min30: '30 دقيقة',
      uploadBtn: 'رفع نسخة احتياطية', restoreBtn: 'استرداد نسخة احتياطية',
      branchesCard: 'الفروع', branchesDesc: 'إدارة الفروع متاحة فقط للمحل الرئيسي.',
      addBranch: 'إضافة فرع جديد', branchName: 'اسم الفرع', branchNamePlaceholder: 'مثال: فرع وسط المدينة',
      branchPassword: 'كلمة مرور', branchPasswordPlaceholder: 'كلمة مرور الفرع',
      saveBranch: 'حفظ الفرع', cancel2: 'إلغاء', addNewBranch: 'اضافة فرع جديد', refreshBtn: 'تحديث',
      noBranches2: 'لا توجد فروع مسجلة', branchStock: 'مخزون الفرع: ',
      recoveryCard: 'استرداد الحساب / كلمة المرور', recoveryDesc: 'أدخل البريد الإلكتروني المرتبط بالحساب...',
      search2: 'بحث', storeNameLabel: 'اسم المحل', codeResult: 'الرمز', passwordResult: 'كلمة المرور',
      changePassword: 'تغيير كلمة المرور', searchAgain: 'بحث مرة أخرى',
      newPasswordLabel: 'كلمة المرور الجديدة', newPasswordPlaceholder2: '4 أحرف على الأقل',
      confirmPasswordLabel: 'تأكيد كلمة المرور', confirmPasswordPlaceholder2: 'أعد إدخال كلمة المرور',
      saveNewPassword: 'حفظ كلمة المرور الجديدة',       backBtn: 'رجوع',
    },
    login: {
      loginSubtitle: 'اختر طريقة الدخول', managerTab: 'مدير', userTab: 'مستخدم', newAccountTab: 'حساب جديد', branchTab: 'فرع',
      codeLabel: 'الرمز المكون من 10 أرقام', storePassword: 'كلمة مرور المحل', passwordPlaceholder: 'أدخل كلمة المرور',
      loginManager: 'دخول كمدير', forgotPassword: 'نسيت كلمة المرور؟',
      storeCode: 'كود المحل', storeCodePlaceholder: 'أدخل كود المحل (10 أرقام)',
      usernameLabel: 'اسم المستخدم', usernamePlaceholder: 'اسم المستخدم',
      userPassword: 'كلمة المرور', loginAsUser: 'دخول كمستخدم',
      emailLabel: 'البريد الإلكتروني', createAccount: 'إنشاء حساب',
      mainStoreCode: 'الرمز الرئيسي للمحل', branchPassword: 'كلمة مرور الفرع', branchLogin: 'اتصال كفرع',
      accountCreatedTitle: 'تم إنشاء الحساب بنجاح!', accountCreatedDesc: 'احفظ هذا الرمز في مكان آمن. ستحتاجه لاستعادة بياناتك.',
      accountCreatedWarning: 'هذا الرمز لا يمكن استرجاعه. اكتبه أو صوره.', enterApp: 'الدخول للبرنامج',
      recoveryTitle: 'استرداد كلمة المرور', recoverySubtitle: 'أدخل بريدك الإلكتروني لعرض الرمز وكلمة المرور',
      searchBtn: 'بحث', backToLogin: 'العودة لتسجيل الدخول',
      storeNameSpan: 'اسم المحل:', codeSpan: 'الرمز:', passwordSpan: 'كلمة المرور:',
      loginWithCode: 'دخول بالرمز', resetPassword: 'إعادة تعيين كلمة المرور',
      searchAgainLink: 'بحث مرة أخرى', newPasswordTitle: 'تعيين كلمة مرور جديدة',
      newPassLabel: 'كلمة المرور الجديدة', newPassPlaceholder: 'أدخل كلمة المرور الجديدة',
      confirmPassLabel: 'تأكيد كلمة المرور', confirmPassPlaceholder: 'أعد إدخال كلمة المرور',
      saveNewPass: 'حفظ كلمة المرور الجديدة', backLink: 'العودة',
    },
  },
  en: {
    appTitle: 'ZMT PIECE',
    online: 'Online', offline: 'Offline',
    nav: {
      main: 'Main', manage: 'Management', finance: 'Finance', system: 'System',
      dashboard: 'Dashboard', brands: 'Brands', sales: 'Sales', invoices: 'Invoices',
      inventory: 'Inventory', suppliers: 'Suppliers', customers: 'Customers', debts: 'Debts',
      supplierReturns: 'Spoiled Goods',
      netAccount: 'Net Account', discounts: 'Discounts', returns: 'Returns',
      reports: 'Reports', backup: 'Backup', settings: 'Settings',
      connection: 'Connection Settings',
      storeDebts: 'Store Debts', branchesMonitor: 'Branch Monitor', sharedInventory: 'Shared Inventory',
      orders: 'Orders',
    },
    dash: {
      title: 'Dashboard', sub: 'Sales & Inventory Overview',
      s1: 'Items in Stock', s2: 'Invoices This Month', s3: 'Registered Customers', s4: 'Total Sales',
      chart: 'Sales vs Inventory vs Returns', months: 'Months:',
      m1: 'Month', m2: 'Months', m3: 'Months', m4: 'Months', m5: 'Months', m6: 'Months',
      netProfit: 'Net Profit', cost: 'Cost',
      lowStockItems: ' products below stock threshold',
      andMore: 'and', moreItems: 'more...',
      lowStock: 'Low Stock Products', estimatedProfit: 'Estimated Total Profit', monthSales: 'This Month Sales', profitCostDist: 'Profit & Cost Distribution',
    },
    brands: { title: 'Brands', sub: 'Manage Car Parts Brands', search: 'Search for a brand...', favAdd: 'Add to favorites', favRemove: 'Remove from favorites' },
    sales: {
      title: 'Sales', sub: 'Create New Sales Invoice',
      searchParts: 'Search Parts', searchPlaceholder: 'Search by part name or number...',
      emptySearch: 'Type to start searching for parts',
      cart: 'Shopping Cart', cartEmpty: 'Cart is empty', total: 'Total:',
      checkout: 'Checkout',
    },
    invoices: {
      title: 'Invoices', sub: 'All Sales & Purchase Invoices',
      search: 'Search for invoice...', newInvoice: 'New Invoice',
      col1: 'Invoice #', col2: 'Date', col3: 'Customer', col4: 'Amount', col5: 'Status', col6: 'Actions',
      empty: 'No invoices yet',
    },
    inventory: {
      title: 'Inventory', sub: 'Manage Parts Inventory',
      search: 'Search inventory...', add: 'Add Part', export: 'Export',
      col1: 'Code', col2: 'Part Name', col3: 'Brand', col4: 'Quantity', col5: 'Buy Price', col6: 'Sell Price', col7: 'Actions',
      empty: 'Inventory is empty',
    },
    suppliers: {
      title: 'Suppliers', sub: 'Manage Parts Suppliers',
      search: 'Search for supplier...', add: 'Add Supplier',
      col1: 'Name', col2: 'Phone', col3: 'Email', col4: 'Brands', col5: 'Balance', col6: 'Actions',
      empty: 'No suppliers',
      addModalTitle: 'Add New Supplier', editModalTitle: 'Edit Supplier',
      formName: 'Supplier Name', formNamePl: 'e.g. XX Auto Parts Co.',
      formPhone: 'Phone Number', formAddress: 'Address', formAddressPl: 'e.g. Riyadh - King Fahd Rd',
      cancel: 'Cancel', save: 'Save',
    },
    customers: {
      title: 'Customers', sub: 'Manage Customers',
      search: 'Search for customer...', add: 'Add Customer',
      col1: 'Name', col2: 'Phone', col3: 'Address', col4: 'Purchases', col5: 'Balance', col6: 'Actions',
      empty: 'No customers',
      addModalTitle: 'Add New Customer', editModalTitle: 'Edit Customer',
      formName: 'Customer Name', formNamePl: 'e.g. Ahmed Ali',
      formPhone: 'Phone Number', formAddress: 'Address', formAddressPl: 'e.g. Algiers',
      formType: 'Customer Type', typeUnit: 'Unit', typeWhole: 'Wholesale', formTypeHelp: 'Sets the default price in the sales page (can be changed per product in the cart)',
      formDiscount: 'Discount (%)', formDiscountHelp: 'From 0.001% to 100% - Optional',
      cancel: 'Cancel', save: 'Save',
      totalDebts: 'Total Customer Debts',
      totalPaid: 'Total Paid',
      totalCount: 'Total Customers',
    },
    debts: {
      title: 'Debts', sub: 'Manage Debts & Receivables',
      youOwe: 'Debts You Owe (to Suppliers)', youOwed: 'Debts Owed to You (from Customers)',
      noDebts: 'No outstanding debts',
      logTitle: 'Debt Log',
      col1: 'Date', col2: 'Type', col3: 'Party', col4: 'Amount', col5: 'Status', col6: 'Actions',
      empty: 'No transactions',
      totalInvoices: 'Total Invoices', totalPurchases: 'Total Purchases',
      balance: 'Balance', paid: 'Paid', paidToThem: 'Paid to them',
      invoices: 'Invoices', noInvoices: 'No invoices',
      payments: 'Payments', noPayments: 'No payments',
      net: 'Net Receivables', chooseSide: 'Choose a party from the list', back: 'Back',
      searchPlaceholder: 'Search by name or phone number...', tabCustomers: 'Customers', tabSuppliers: 'Suppliers',
      totalCustomerDebts: 'Debts Owed to You (from Customers)', totalSupplierDebts: 'Debts You Owe (to Suppliers)',
    },
    net: {
      title: 'Net Account', sub: 'Financial Summary',
      s1: 'Total Sales', s2: 'Total Purchases', s3: 'Net Profit', s4: 'Pending Amounts',
      logTitle: 'Transaction Log',
      col1: 'Date', col2: 'Description', col3: 'Type', col4: 'Amount', col5: 'Balance',
      empty: 'No recent transactions',
      customerDebt: 'Owed to us', supplierDebt: 'We owe',
      purchaseInvoice: 'Purchase invoice', purchaseFrom: 'Invoice from',
      transferInvoice: 'Transfer invoice', receptionInvoice: 'Reception invoice',
      purchases: 'Purchases', paymentFrom: 'Payment from',
      paymentNote: 'Payment', paymentWalkin: 'Payment from walk-in',
      salesPaid: 'Sales (paid)', paymentTo: 'Payment to',
      paymentToSupplier: 'Payment to supplier', expenses: 'Expenses',
      stockPurchase: 'Stock purchase', stockPurchases: 'Stock purchases',
      totalExpenses: 'Total Expenses',
      marginTitle: 'Profit Margin', periodLabel: 'Period:', today: 'Today',
      totalMargin: 'Total Profit Margin', periodMargin: 'Period Profit Margin', allTime: 'All time',
      cashLabel: 'Cash', marginLabel: 'Margin', ccpPaidNote: 'Paid via CCP',
    },
    discounts: {
      title: 'Discounts', sub: 'Manage Offers & Discounts',
      add: 'Add Discount',
      col1: 'Product', col2: 'Discount %', col3: 'Start Date', col4: 'End Date', col5: 'Status', col6: 'Actions',
      empty: 'No discounts',
      unregistered: 'Unregistered', deleteConfirm: 'Delete discount record?',
      totalDiscounts: 'Total Discounts', totalValue: 'Total Discount Value',
      colDate: 'Date', colInvoice: 'Invoice', colCustomer: 'Customer', colType: 'Type', colRatio: 'Ratio', colAmount: 'Amount', colActions: 'Actions',
    },
    returns: {
      title: 'Returns', sub: 'Manage Returns & Refunds',
      add: 'Record Return', export: 'Export',
      col1: 'Return #', col2: 'Invoice', col3: 'Part', col4: 'Qty', col5: 'Reason', col6: 'Date', col7: 'Actions',
      empty: 'No returns',
      time: 'Time', defaultReason: 'Invoice adjustment',
      deleteConfirm: 'Delete return record?',
      noReturnsExport: 'No returns to export',
      exportSuccess: 'Returns exported successfully',
      exportError: 'Error saving: ',
    },
    supplierReturns: {
      title: 'Spoiled Goods', sub: 'Manage returned spoiled goods to suppliers',
      export: 'Export', filterAll: 'All',
      statusPending: 'Being Returned', statusReturned: 'Returned', statusNotReturned: 'Not Returned',
      colProduct: 'Product', colQty: 'Qty', colAmount: 'Amount',
      colSupplier: 'Supplier', colInvoice: 'Invoice', colDate: 'Date',
      colStatus: 'Status', colActions: 'Actions', colStore: 'Store / Branch',
      empty: 'No return requests',
      noProduct: 'Product not found', noInvoice: 'No purchase invoice for this product',
      stock: 'In stock', supplier: 'Supplier', qty: 'Return qty', invoice: 'Entry invoice',
      note: 'Note', notePlaceholder: 'Optional...',
      modalTitle: 'Return Goods to Supplier',
      notOwned: 'You cannot modify another store\'s requests',
      invalidQty: 'Enter a valid quantity', qtyExceedsStock: 'Quantity exceeds current stock',
      qtyExceedsInvoice: 'Quantity exceeds the amount on this invoice',
      created: 'Return request created',
      confirmReturned: 'Confirm returned?\nQuantity will be deducted from stock, the supplier invoice reduced and net account affected.',
      confirmNotReturned: 'Confirm not returned?\nNo change will be made to stock or invoice.',
      insufficientStock: 'Current stock is not enough to deduct', invoiceMissing: 'Purchase invoice not found',
      lineMissing: 'Product no longer exists on the invoice',
      returnedSuccess: 'Returned: deducted from stock and reduced the supplier invoice',
      delete: 'Delete request', deleteReverse: 'Undo return',
      deleteConfirm: 'Delete return request?', deleteReturnedConfirm: 'Delete request?\nAll effects will be reversed (stock restored and invoice raised).',
      deleted: 'Request deleted',
      refundNote: 'Supplier goods return',
      noExport: 'Nothing to export', exportSuccess: 'Exported successfully', exportError: 'Error saving: ',
    },
    reports: {
      title: 'Reports', sub: 'Advanced Sales & Inventory Reports',
      c1: 'Sales Report', c1desc: 'Daily, weekly and monthly sales analysis',
      c2: 'Inventory Report', c2desc: 'Inventory status and parts movement',
      c3: 'Profit Report', c3desc: 'Profits and losses',
      c4: 'Customer Report', c4desc: 'Customer base analysis',
      dailySales: 'Daily Sales', categoryDist: 'Sales by Category',
      bestSellers: 'Best Selling Products', brandSales: 'Sales by Brand',
      dailyBreakdown: 'Daily Sales Breakdown',
      period: 'Period:', exportPDF: 'Export PDF',
      period7: 'Last 7 Days', period30: 'Last 30 Days', period90: 'Last 3 Months',
      period365: 'Last Year', periodAll: 'All Time',
      noSales: 'No sales', profit: 'Profit',
      returnsPieces: 'Returns (pieces)', pieces: ' pieces',
      reportTitle: 'Sales & Returns Report',
      periodLabel: 'Period:', totalSales: 'Total Sales: ',
      totalProfit: 'Total Profit: ', salesInvoiceCount: 'Sales invoices: ',
      returnsCount: 'Returns count: ', netSales: 'Net Sales: ',
      dailyDetails: 'Daily breakdown:', invoicesWord: ' invoices',
      period2: 'Period:', thisWeek: 'This Week', thisMonth: 'This Month', thisYear: 'This Year', custom: 'Custom', specificDay: 'Specific Day',
      from: 'From:', to: 'To:', date2: 'Date:', totalSales2: 'Total Sales', invoices2: 'invoices', pieces2: 'pieces',
      profit2: 'Profit', paid2: 'Paid', remaining2: 'Remaining', returnCount: 'Returns Count', value: 'Value',
      netSales2: 'Net Sales', returnRatio: 'Return Ratio', profitMargin: 'Profit Margin',
      totalProfitMargin: 'Total Profit Margin', ratioLabel: 'Ratio', allTimeLabel: 'Overall Total',
      salesVsReturns: 'Sales vs Returns', net: 'Net', dailySalesVsReturns: 'Daily Sales vs Returns',
      salesTrend: 'Sales Trend', returnsTrend: 'Returns Trend', salesByCategory: 'Sales by Category',
      returnsByReason: 'Returns by Reason', topProducts: 'Top Selling Products',
      productCol: 'Product', barcodeCol: 'Barcode', qtySoldCol: 'Qty Sold', totalCol: 'Total', profitCol: 'Profit',
      dailyDetail2: 'Daily Sales & Returns Detail', dateCol: 'Date',
      salesInvoicesCol: 'Sales Invoices', piecesSoldCol: 'Pieces Sold', salesValueCol: 'Sales Value',
      returnsCol: 'Returns', piecesReturnedCol: 'Pieces Returned', netDayCol: 'Net Day',
    },
    reportsNet: {
      title: 'Net Account', period: 'Period:', year: 'Year:', specificDate: 'Specific Date',
      range: 'Range', sales: 'Total Sales', purchases: 'Total Purchases',
      expenses: 'Total Expenses', profit: 'Net Profit',
      periodDebt: 'Pending (Period)', currentDebt: 'Pending (Current)',
      customerDebt: 'Owed to us', supplierDebt: 'We owe',
      periodMargin: 'Period Profit Margin', totalMargin: 'Total Profit Margin',
    },
    backup: {
      title: 'Backup', sub: 'Manage Data Backups',
      c1: 'Create Backup', c1desc: 'Save a copy of the database',
      c1btn: '<i class="fas fa-save"></i> Export',
      c2: 'Restore Backup', c2desc: 'Restore data from a previous backup',
      c2btn: '<i class="fas fa-upload"></i> Import',
      prevTitle: 'Previous Backups',
      empty: 'No previous backups',
      restore: 'Restore', creating: 'Creating backup...',
      operationCancelled: 'Operation cancelled',
      createSuccess: '✓ Backup created — ',
      createFailed: '✗ Save failed: ',
      readingFile: 'Reading file...',
      readFileFailed: '✗ Failed to read: ',
      invalidFile: '✗ Invalid file — no data',
      restoreConfirm: 'Restore backup?',
      store: 'Store: ', date: 'Date: ',
      content: 'Content:\n',
      products: 'Products', invoices: 'Invoices',
      customers: 'Customers', suppliers: 'Suppliers',
      payments: 'Payments', returns: 'Returns',
      discounts: 'Discounts', unknown: 'Unknown',
      dataWarning: '⚠️ All current data will be completely replaced!',
      restoreCancelled: 'Restore cancelled',
      restoreSuccess: '✓ Data restored successfully. Reopen pages to refresh.',
      restoreError: '✗ Error: ',
      readFileFailed2: '✗ Read failed: ',
      invalidFile2: '✗ Invalid file',
      restoreFromFileConfirm: 'Restore',
      restoreFromFileWarning: 'All current data will be replaced.',
      restoreFromFileSuccess: '✓ Restored from ',
      deleteAllConfirm: '⚠️ Delete all data?',
      deleteAllDetails: 'All products, invoices, customers, suppliers, payments, returns, and discounts will be cleared.',
      deleteAllWarning: 'This action cannot be undone!',
      deleteAllBackupHint: 'Make sure to create a backup before continuing.',
      deleteAllFinalConfirm: 'Final confirmation: Delete all data?\nYou won\'t be able to restore without a backup.',
      deleteAllDone: '✓ All data cleared. Use "Restore" to recover data.',
      clearData: 'Clear Data', clearDataDesc: 'Clear all data from the app — used to test backup restoration',
      deleteAllBtn: 'Delete All Data',
    },
    sharedInventory: {
      title: 'Shared Inventory', sub: 'View main store and linked branches inventory',
      searchAll: 'Search All Stores', searchAllPlaceholder: 'Search by name or barcode to find which store has the product...',
      loading: 'Loading data...', backToList: 'Back to List',
    },
    migration: {
      title: 'Import from Previous Program', cardTitle: 'Import from Previous Program',
      cardDesc: 'Import data from any other program (CSV, Excel, databases...)',
      cardBtn: 'Import from Previous Program',
      dropHere: 'Drag & drop a file here or click to browse',
      supportedFormats: 'Supports: CSV, Excel, JSON, XML, SQL, SQLite (.db), dBASE (.dbf), Firebird (.fdb), any text',
      reading: 'Reading file...', readError: 'Error reading file',
      selectTable: 'Select the table containing your parts:',
      preview: 'Data Preview', columns: 'columns',
      mapColumns: 'Column Mapping',
      mapHint: 'Auto-mapping attempted — review and adjust as needed',
      noMapping: 'No mapping',
      back: 'Back', next: 'Next',
      totalRows: 'Total rows:', mappedFields: 'Mapped fields:',
      moreRows: 'more rows...',
      importBtn: 'Import Data',
      needNameOrBarcode: 'At least product name or barcode must be mapped',
      importing: 'Importing...', importSuccess: 'Import completed successfully',
      productsImported: 'products imported', importError: 'Import error',
      cannotRead: 'Cannot read file', parseError: 'Error parsing file',
      unsupportedDbType: 'This database type requires manual export',
      exportHint: 'Export data from your old program as CSV or Excel, then try again',
      aiAnalyzing: 'AI analyzing...',
      aiError: 'AI Error',
      aiDone: 'AI analysis completed',
      aiAnalyzed: 'Analyzed by AI',
      chooseMode: 'Choose Processing Method',
      modeHint: 'Local processing is fast and uses automatic matching. AI processing intelligently analyzes data to understand unstructured text.',
      localMode: 'Local Processing',
      localHint: 'Fast automatic matching',
      aiMode: 'AI Processing',
      aiHint: 'Smart analysis via your chosen AI provider',
      aiRequiresKey: '* AI processing requires an API key configured in Settings',
      firebirdNoPath: 'Could not access the Firebird database file path',
      firebirdNoTables: 'No readable tables found in the database',
      firebirdOpenError: 'Could not open Firebird database',
      firebirdTableError: 'Could not read table',
      selectRole: 'What does this table contain?',
      roleHint: 'Choose the data type so it imports correctly',
      roleProducts: 'Parts / Products',
      roleCustomers: 'Customers',
      roleSuppliers: 'Suppliers',
      needName: 'At least the name field must be mapped',
      importDone: 'Import completed successfully',
      roleSalesInvoices: 'Sales Invoices',
      rolePurchaseInvoices: 'Purchase Invoices',
      importedNote: 'Imported',
      oldInvoiceNote: 'Imported invoice',
      oldPaymentNote: 'Imported payment',
      restoringBackup: 'Restoring backup (gbak)...',
      loadingBrands: 'Reading brands...',
      brandEmpty: 'No brand',
      fullImportPanelTitle: 'Full Data Import',
      fullImportPanelDesc: 'Sable Stock / Gestion Stock database detected — you can import everything at once: customers, suppliers, products with prices, invoices and returns.',
      fullImportBtn: 'Full Import',
      fullImportPopupTitle: 'Select brands to import',
      fullImportPopupHint: 'Select the brands you want to import products for. Products without a brand are always imported.',
      selectAll: 'Select All',
      cancelImport: 'Cancel',
      confirmImport: 'Start Import',
      creatingBackup: 'Creating backup before import...',
      productsNone: 'No products were imported (check brand selection)',
      fullImportDone: 'Full import completed',
      returnsCount: 'Returns',
      avoirReason: 'Return (Avoir)',
      walkin: 'Walk-in customer',
    },
    brandCat: { brand: 'Brand', category: 'Choose Part Type', searchPlaceholder: 'Search for type...', addProduct: 'Add Product' },
    catProducts: { title: 'Products', sub: 'Available Products', searchPlaceholder: 'Search for product...', addProduct: 'Add Product', empty: 'No products in this category', addInvoiceTitle: 'Add Product to Invoice', scanPlaceholder: 'Scan barcode...', scannerReady: 'Ready to scan', searchProduct: 'Search for product', newProduct: 'New Product', searchExisting: 'Search by name or barcode', searchExistingPlaceholder: 'Product name or barcode...', name: 'Product Name', namePlaceholder: 'Part name', barcode: 'Barcode', barcodePlaceholder: 'Enter barcode', generate: 'Generate', qty: 'Quantity', buyPrice: 'Buy Price', sellPrice: 'Sell Price', supplier: 'Supplier', supplierPlaceholder: 'Search for supplier by name...', cancel: 'Cancel', addToCart: 'Add to Invoice Cart', cartTitle: 'Invoice Cart', total: 'Total:', clear: 'Clear',       confirmInvoice: 'Confirm Invoice', fiscalStamp: 'Fiscal Stamp (Timbre Fiscal)', wholesalePrice: 'Wholesale Price' },
    settings: {
      title: 'Settings', sub: 'Application Settings',
      general: 'General Settings',
      storeName: 'Store Name', currency: 'Currency', language: 'Language',
      notif: 'Low Stock Notifications',       autoBackup: 'Auto Backup',
      info: 'About',
      version: 'Version', developer: 'Developer', lastUpdate: 'Last Update',
    },
    chart: { sales: 'Sales', inventory: 'Inventory', returns: 'Returns' },
    connection: {
      title: 'Connection Settings', sub: 'Cloud connection and store management',
    },
    btn: {
      newInvoice: 'New Invoice', addPart: 'Add Part', export: 'Export',
      addSupplier: 'Add Supplier', addCustomer: 'Add Customer', addDiscount: 'Add Discount',
      addReturn: 'Record Return',
    },
    common: {
      save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', confirm: 'Confirm',
      close: 'Close', print: 'Print', loading: 'Loading...', processing: 'Processing...',
      noResults: 'No results', empty: 'Empty', search: 'Search',
      page: 'Page', of: 'of', product: 'Product', piece: 'Piece', invoice: 'Invoice',
      qty: 'Qty', total: 'Total', paid: 'Paid', remaining: 'Remaining', debt: 'Debt',
      date: 'Date', name: 'Name', status: 'Status', actions: 'Actions',
      yes: 'Yes', no: 'No', success: 'Success', error: 'Error', warning: 'Warning',
      areYouSure: 'Are you sure?', stock: 'Stock', price: 'Price',
      addItem: 'Add', removeItem: 'Remove', clearCart: 'Clear Cart',
      ready: 'Ready', done: 'Done', notFound: 'Not found', outOfStock: 'Out of stock',
      lowStock: 'Low stock', new: 'New', provisional: 'Provisional',
      paidFull: 'Fully paid', paidPartial: 'Partial payment', unpaid: 'Unpaid',
      manual: 'Manual', customer: 'Customer',
      back: 'Back', pay: 'Pay', payFull: 'Pay Full', searchAll: 'Search All', refresh: 'Refresh', confirmPay: 'Confirm Payment',
      barcode: 'Barcode', brand: 'Brand', category: 'Category', supplier: 'Supplier',
      address: 'Address', phone: 'Phone', email: 'Email', username: 'Username', password: 'Password',
      generate: 'Generate', fiscalStamp: 'Fiscal Stamp', cart: 'Cart', clear: 'Clear',
      subtotal: 'Subtotal', discount: 'Discount', totalAfterDiscount: 'Total After Discount',
      payNow: 'Amount Paid Now', remainingDebt: 'Remaining (Debt)', fullPayment: 'Full Payment', noPayment: 'No Payment',
      real: 'Real', formal: 'Formal', customerDiscount: 'Customer Discount', additionalDiscount: 'Additional Discount',
    },
    sales: {
      title: 'Sales', sub: 'Create New Sales Invoice',
      searchParts: 'Search Parts', searchPlaceholder: 'Search by part name or number...',
      emptySearch: 'Type to start searching for parts',
      emptyResults: 'No search results', emptyProducts: 'No products',
      cart: 'Shopping Cart', cartEmpty: 'Cart is empty', total: 'Total:',
      checkout: 'Checkout',
      unavailable: 'Unavailable', lowStockTip: 'Low stock',
      scannerReady: 'Ready', scannerDone: 'Done', scannerNotFound: 'Not found', scannerUnavailable: 'Unavailable',
      noCustResults: 'No results', discount: 'Discount',
      del: 'Delete',
      fullyPaid: 'Fully paid', partialPay: 'Partial payment', enterPaid: 'Enter paid amount',
      cartEmptyAlert: 'Cart is empty', notAvailableQty: 'Not available in required qty', available: 'Available:',
      paidExceedsTotal: 'Paid amount cannot exceed total',
      fullPaymentNote: 'Full payment at sale', partialPaymentNote: 'Partial payment at sale',
      discountType: 'Customer', discountManual: 'Manual',
      clearCartConfirm: 'Clear purchase cart?',
      customer: 'Customer', customerPlaceholder: 'Search for customer...', unregistered: 'Unregistered customer', remove: 'Remove',
      cartTitle: 'Shopping Cart', subtotal: 'Subtotal', customerDiscount: 'Customer Discount', additionalDiscount: 'Additional Discount',
      totalLabel: 'Total', paidLabel: 'Amount Paid', payFull: 'Pay Full', remainingLabel: 'Remaining',
      clear: 'Clear', checkout: 'Checkout', emptyCartTitle: 'Cart is Empty', emptyCartHint: 'Scan item barcode or select from product list',
      scanPlaceholder: 'Scan barcode...', searchPlaceholder2: 'Search by part name or barcode...', productsCount: '0 products', multiBatches: 'Multiple batches', mixedPrice: 'Mixed price', unit: 'Unit', wholesale: 'Wholesale',
      payMethod: 'Payment Method', payCash: 'Cash', payCcp: 'CCP', payBoth: 'Both',
      cashAmount: 'Cash Amount', ccpAmount: 'CCP Amount',
    },
    orders: {
      title: 'Orders', sub: 'Order missing parts from suppliers',
      tabMine: 'My Orders', tabBranches: 'Branch Orders',
      suggestions: 'Low stock suggestions', noSuggestions: 'No low or out-of-stock products — great!',
      search: 'Search by part name or barcode...',
      all: 'All', today: 'Today', week: 'Week', month: 'Month', year: 'Year',
      refresh: 'Refresh',
      empty: 'No orders yet — add from suggestions or search',
      statusPending: 'Pending', statusDone: 'Done', statusNotAvailable: 'Not available',
      btnDone: 'Done', btnNotAvailable: 'Not available', btnDelete: 'Delete',
      deleteConfirm: 'Delete this order?',
      cloudRequired: 'Cloud connection required to view branch orders',
      loading: 'Loading branch orders...',
      noBranchOrders: 'No branch orders yet',
    },
    invoices: {
      title: 'Invoices', sub: 'All Sales & Purchase Invoices',
      search: 'Search for invoice...', newInvoice: 'New Invoice',
      col1: 'Invoice #', col2: 'Date', col3: 'Customer', col4: 'Amount', col5: 'Status', col6: 'Actions',
      empty: 'No invoices yet', noMatch: 'No matching invoices',
      resultsInfo: ' invoices',
      typeSale: 'Sale Invoice', typeSupplier: 'Supplier Invoice', typeWaybill: 'Waybill',
      typeProforma: 'Proforma Invoice', typeDispatch: 'Dispatch Invoice', typeTransfer: 'Transfer Invoice',
      typeReception: 'Reception Invoice', typePurchase: 'Purchase Invoice',
      badgeProvisional: 'Provisional',
      itemCount: 'items', paidLabel: 'Paid', unpaidLabel: 'Unpaid', remainingLabel: 'Remaining',
      pageInfo: 'Page', allowPopups: 'Please allow popups for printing',
      cannotPayReception: 'Cannot add payment to reception invoice - reference only',
      cannotPayProforma: 'Cannot add payment to proforma invoice',
      fullyPaidAlert: 'Invoice is fully paid', invalidAmount: 'Invalid amount',
      transferPayNote: 'Payment on transfer invoice', regularPayNote: 'Payment via invoices',
      paymentSaved: 'Payment recorded successfully',
      cannotEditDispatch: 'Cannot edit dispatch invoice',
      cannotEditReception: 'Cannot edit reception invoice - reference only',
      cannotEditProformaWaybill: 'Cannot edit provisional waybill',
      editTitle: 'Edit Invoice',
      editHelpSupplier: 'Supplier invoice: increasing qty increases stock and supplier balance, decreasing reduces both.',
      editHelpCustomer: 'Edit quantities. Increase deducts from stock, decrease returns to stock and records as return.',
      scanPlaceholder: 'Scan barcode or type product name...',
      editColProduct: 'Product', editColCurrentQty: 'Current Qty', editColNewQty: 'New Qty',
      saveEdits: 'Save Edits', cancelEdit: 'Cancel',
      scanDone: 'Done', scanReady: 'Ready', scanNotFound: 'Not found', resultCount: 'result',
      availableStock: 'Available:', notInStock: 'Not in stock', badgeNew: 'New',
      cannotBelowZero: 'Cannot set qty of "..." below zero in stock',
      insufficientStock: 'Insufficient stock for "..."',
      noQtyChanged: 'No quantity changed',
      invoiceEdited: 'Invoice edited successfully',
      deleteConfirm: 'Delete this invoice completely? Products will be returned to stock and linked payments/returns will be deleted.',
      cannotDeleteReception: 'Cannot delete reception invoice - reference only',
      cannotDeleteSold: 'Cannot delete supplier invoice - product "..." has been sold',
      invoiceDeleted: 'Invoice deleted',
      transferEditTitle: 'Edit Transfer Invoice',
      transferEditHelp: 'Edit item quantities. Increase reduces your stock and adds to receiver. Decrease adds to your stock and reduces receiver.',
      currentTotal: 'Current Total:', editColSellPrice: 'Sell Price',
      newTotal: 'New Total:', diff: 'Difference:',
    },
    inventory: {
      title: 'Inventory', sub: 'Manage Parts Inventory',
      search: 'Search inventory...', add: 'Add Part', export: 'Export',
      col1: 'Code', col2: 'Part Name', col3: 'Brand', col4: 'Quantity', col5: 'Buy Price', col6: 'Sell Price', col7: 'Actions',
      empty: 'Inventory is empty',
      transferBranch: 'Transfer products to branch or main store',
      transferMain: 'Transfer products to branches',
      scannerReady: 'Ready to scan', scannerProcessing: 'Processing...',
      scannerFound: 'Found:', scannerDone: 'Scan complete',
      scannerNewBarcode: 'New product - Barcode', scannerNew: 'New product',
      noResults: 'No results',
      enterName: 'Please enter product name', enterBarcode: 'Please enter barcode',
      clearCartConfirm: 'Clear invoice cart?', cartEmpty: 'Invoice cart is empty',
      invoiceSaved: 'Invoice registered for', fiscalStamp: 'Fiscal stamp',
      includes: 'includes', productUnit: 'products', pieceUnit: 'pieces',
      editLabelName: 'Product Name', editLabelBarcode: 'Barcode', editLabelBrand: 'Brand',
      editLabelCategory: 'Category', editLabelQty: 'Quantity', editLabelBuyPrice: 'Buy Price', editLabelSellPrice: 'Sell Price', editLabelWholesale: 'Wholesale Price',
      editTitle: 'Edit Product',
      deleteConfirm: 'Are you sure you want to delete this product?',
      importSuccess: 'Imported', importSuccessEnd: 'products successfully',
      importCost: 'Purchase cost:', importRecorded: 'Recorded in net account',
      importFailed: 'Import failed. Check file format.',
      addWithInvoice: 'Add Stock + Invoice', transferBtn: 'Transfer Products', exportCSV: 'Export CSV', importCSV: 'Import CSV',
      addTitle: 'Add Stock + Invoice', scanPlaceholder2: 'Scan barcode...',
      searchExisting: 'Search existing product (by name or barcode)', searchExistingPlaceholder: 'Product name or barcode...',
      category: 'Category', name: 'Product Name', barcode: 'Barcode', generate2: 'Generate',
      qty: 'Quantity', buyPrice: 'Buy Price', sellPrice: 'Sell Price', wholesalePrice: 'Wholesale Price', supplierOptional: 'Supplier (optional)',
      supplierSearchPlaceholder: 'Search for supplier...', addToCart: 'Add to Invoice Cart',
      invoiceCart: 'Invoice Cart', fiscalStamp2: 'Fiscal Stamp (Timbre Fiscal)', totalLabel: 'Total:',
      clear2: 'Clear', confirmInvoice: 'Confirm Invoice', categoryCol: 'Category',
    },
    transfer: {
      loading: 'Loading...', chooseDest: 'Choose destination', mainStore: 'Main Store',
      loadError: 'Error loading destinations',
      scannerProcessing: 'Processing...', scannerFound: 'Found:', scannerDone: 'Scan complete',
      scannerNotFound: 'No product with barcode', scannerNotInStock: 'in your stock', scannerNotFoundShort: 'Not found',
      noResults: 'No results', stock: 'Stock:',
      selectDestFirst: 'Please select destination store first',
      searchFirst: 'Please search for a product first', qtyZero: 'Quantity must be greater than zero',
      qtyExceeds: 'Requested quantity', qtyExceedsAvail: 'exceeds available',
      buyPriceZero: 'Buy price must be greater than zero',
      donationLabel: 'Send products free of charge (donation)',
      donationWarning: 'Warning: the transfer invoice will show a balance of 0, and the receiving invoice will also show a balance of 0 for the recipient.',
      donationNote: 'Donation (free transfer)',
      available: 'Available:',
      clearCartConfirm: 'Clear transfer cart?', scannerReady: 'Ready to scan',
      selectDest: 'Please select destination store', cartEmpty: 'Transfer cart is empty',
      paidExceedsTotal: 'Paid amount cannot exceed total',
      confirmTitle: 'Confirm Transfer:', confirmFrom: 'From:', confirmTo: 'To:',
      confirmProducts: 'Products:', confirmTotal: 'Total:', confirmPaid: 'Paid:', confirmRemaining: 'Remaining (Debt):',
      confirmContinue: 'Do you want to continue?',
      productNotFound: 'Product "..." not found in stock',
      stockLessThanNeeded: 'Available qty for "..." is less than needed',
      payNote: 'Payment - Transfer to',
      transferSuccess: 'Transfer invoice created successfully!',
      transferredProducts: 'Transferred products:', transferTotal: 'Total:',
      transferPaid: 'Paid:', transferRemaining: 'Remaining (Debt):',
      transferError: 'Error during transfer:',
      sub: 'Transfer products between stores with debt tracking',
      senderStore: 'Sending Store', destination: 'Destination',
      chooseDestination2: '-- Choose Destination --', selectDestination: 'Select destination store',
      scanPlaceholder2: 'Scan barcode...', searchExisting: 'Search product in stock (by name or barcode)',
      searchPlaceholder2: 'Product name or barcode...', productDataTitle: 'Product Data for Transfer',
      productName: 'Product Name', availableQty: 'Available Qty', transferQty: 'Transfer Qty',
      buyPrice: 'Buy Price', sellPrice2: 'Sell Price', brand2: 'Brand', category2: 'Category',
      addToCart2: 'Add to Transfer Cart', transferCart: 'Transfer Invoice Cart', totalLabel2: 'Total:',
      clear3: 'Clear', paymentSection: 'Payment & Debts', payNow2: 'Amount Paid Now',
      remainingDebt2: 'Remaining (Debt):', fullPayment2: 'Full Payment', noPayment2: 'No Payment',
      confirmTransfer: 'Confirm & Execute Transfer Invoice',
    },
    settings: {
      title: 'Settings', sub: 'Application Settings',
      general: 'General Settings',
      storeName: 'Store Name', currency: 'Currency', language: 'Language',
      notif: 'Low Stock Notifications', autoBackup: 'Auto Backup',
      info: 'About',
      version: 'Version', developer: 'Developer', lastUpdate: 'Last Update',
      settingsSaved: 'Settings saved',
      wrongPassword: 'Current password is incorrect',
      verifyError: 'Verification error:',
      passwordMinLength: 'Password must be at least 4 characters',
      passwordsNoMatch: 'Passwords do not match',
      passwordSaved: 'Password saved successfully',
      errorPrefix: 'Error:',
      colPage: 'Page', colView: 'View', colEdit: 'Edit', colDelete: 'Delete',
      enterUsername: 'Please enter username', enterPassword: 'Please enter password',
      userUpdated: 'User updated successfully', userCreated: 'User created successfully',
      noPerms: 'No permissions',
      delete_user_confirm: 'Are you sure you want to delete user "..."?',
      storeAddress: 'Store Address', phoneNumber: 'Phone Number', enableFiscalStamp: 'Enable Fiscal Stamp in Invoices',
      fiscalRatio: 'Ratio:', fiscalMin: 'Min 5 DA - Max 10,000 DA',
      fiscalPercent: '% (0% for basic systems)', lowStockThreshold: 'Low Stock Threshold',
      lowStockHint: 'Below this number is considered low stock', saveSettings: 'Save Settings',
      storePasswordCard: 'Store Password', storePasswordDesc: 'To protect the store, create a password. Cannot login as manager without it.',
      currentPassword: 'Current Password', currentPasswordPlaceholder: 'Leave empty if new',
      newPassword: 'New Password', newPasswordPlaceholder: 'Store password',
      confirmPassword: 'Confirm Password', confirmPasswordPlaceholder: 'Re-enter password',
      savePassword: 'Save Password',
      lanCard: 'LAN Sync',
      lanDesc: 'Link this device to another device of the same store over your router for instant sync of all sales, inputs and edits.',
      lanRole: 'Device role',
      lanOff: 'Disabled',
      lanMain: 'Main server (device with static IP)',
      lanSub: 'Sub server (second register)',
      lanLocalIps: 'This device IP addresses',
      lanLocalIpHint: 'Set one of these as a static IP in Windows/router settings and enter the same address on the sub device.',
      lanServerIp: 'Main server IP address',
      lanPort: 'Port',
      lanPortHint: 'Starts at 4512 and shifts automatically if busy',
      lanStatus: 'Sync status',
      lanStatusOff: 'Sync is disabled',
      lanStatusMainOn: 'Main server is running',
      lanStatusMainOff: 'Main server is stopped',
      lanStatusClients: 'Connected devices',
      lanStatusSubOn: 'Connected to main server',
      lanStatusSubOff: 'Not connected to main server',
      lanListeningPort: 'Actual port',
      lanFirewallHint: 'If the sub device cannot connect, allow this app through Windows Firewall (private network): Settings → Privacy & Security → Windows Firewall → Allow an app through firewall.',
      lanTest: 'Test connection',
      lanTestWait: 'Testing...',
      lanTestOk: 'Connection successful — server is available on this port',
      lanTestFail: 'Connection failed',
      lanTestRefused: 'No server on this address/port',
      lanTestTimeout: 'Timeout — the port may be blocked or the address is wrong',
      lanTestUnreachable: 'Address unreachable — make sure both devices are on the same network',
      lanSaved: 'Sync settings saved successfully',
      lanIpRequired: 'Enter the main server IP address first',
      usersCard: 'User Management', usersDesc: 'Create users and set their application permissions.',
      addUser: 'Add User', newUser: 'New User',
      userName: 'Username', userNamePlaceholder: 'Username',
      userPassword: 'Password', userPasswordPlaceholder: 'Password',
      permissions: 'Permissions',
    },
    storeDebts: {
      title: 'Store Debts', sub: 'Debts by transfer invoices',
      storeCount: 'Stores', owedToUs: 'Owed to Us', weOwe: 'We Owe',
      netDebt: 'Net Debt', transferInvoices: ' transfer invoices',
      owedLabel: 'Owed:', weOweLabel: 'We owe:', paidLabel: 'Paid:',
      totalDebt: 'Total Debt', totalInvoices: 'Total Invoices',
      paid: 'Paid', remaining: 'Remaining',
      typeTransfer: 'Outgoing', typeReception: 'Reception',
      statusPaid: 'Paid', statusRemaining: 'Remaining',
      noTransfers: 'No transfer invoices',
      payTitle: 'Pay Installment', total: 'Total:', paidPreviously: 'Paid Previously:',
      payAmount: 'Payment Amount', confirmPay: 'Confirm Payment', back: 'Back',
      noInvoices: 'No invoices', invoiceDetails: 'Invoice Details',
      invoiceActionsPrint: 'Print', invoiceActionsPay: 'Pay', invoiceActionsEdit: 'Edit',
      invoiceActionsDelete: 'Delete', invoiceActionsClose: 'Close',
      totalDebtLabel: 'Total Debt', emptyPlaceholder: 'No transfer invoices',
    },
    branchesMonitor: {
      title: 'Branch Monitor', sub: 'Monitor and manage all branches from one place',
      loading: 'Loading data...',
      online: 'Online', offline: 'Offline',
      productCount: ' products', saleCount: ' sales',
      viewDetails: 'View Details',
      noData: 'No data available', noInventory: 'No inventory', noInvoices: 'No invoices',
      productsLabel: 'Products:', invoicesLabel: 'Invoices:',
      tabInventory: 'Inventory', tabInvoices: 'Invoices', tabPurchases: 'Purchases', tabNet: 'Net Account',
      notAvailable: 'N/A',
      sold: 'Paid', provisional: 'Provisional',
      transferIncome: 'Transfer Income', transferCost: 'Transfer Cost',
      totalSales: 'Total Sales', totalPurchases: 'Total Purchases',
      netAccount: 'Net Account',
      searchPlaceholder: 'Search products...',
      noSearchResults: 'No results in any store',
      outOfStock: 'Out of stock', inStock: 'In stock',
      searchAll: 'Search All Stores', searchAllPlaceholder: 'Search by name or barcode to find which store has the product...',
      branchCount: 'Branches', totalProducts: 'Total Products', totalRevenue: 'Total Revenue',
      branchesList: 'Branch List', refresh: 'Refresh', noBranches: 'No registered branches',
      backToList: 'Back to List', products: 'Products', invoices: 'Invoices',
      sales: 'Sales', purchases: 'Purchase Invoices', loadingPlaceholder: 'Loading...',
    },
    chart: { sales: 'Sales', inventory: 'Inventory', returns: 'Returns' },
    connection: {
      title: 'Connection Settings', sub: 'Cloud connection and store management',
      connected: 'Connected to cloud',
      mainConnected: 'Main store - connected to Supabase',
      branchConnectedMsg: 'Branch connected to main store',
      mainStore: 'Main store', branch: 'Branch',
      branchParenthetical: '(Branch)',
      enterCredentials: 'Enter credentials to start',
      logoutConfirm: 'Are you sure you want to logout?',
      cloudRequired: 'Please connect to cloud first',
      uploading: 'Uploading...', noChanges: 'No changes to upload',
      uploadSuccess: 'Upload successful',
      uploadBackupBtn: 'Upload backup',
      lanSubUploadMsg: 'This device is a LAN sub server: uploading to the cloud is done from this location\'s main server',
      enterStorePassword: 'Enter store password to download:',
      wrongPassword: 'Wrong password',
      verificationError: 'Verification error: ',
      backupEmpty: 'Backup is empty',
      restoreSuccessMsg: 'Restored successfully - restart the app',
      restoreBackupBtn: 'Restore backup',
      lastSync: 'Last sync: ',
      branchNameRequired: 'Please enter branch name',
      passwordRequired: 'Please enter password',
      branchCreated: 'Branch created - Code: ',
      passwordLabel: 'Password: ',
      viewStock: 'View stock', deleteBranchBtn: 'Delete branch',
      deleteBranchConfirm1: 'Delete branch "',
      deleteBranchConfirm2: 'You won\'t be able to restore it.',
      enterStorePasswordView: 'Enter store password to view branch stock:',
      noBranchStock: 'No inventory for this branch',
      barcode: 'Barcode', brand: 'Brand', sellPrice: 'Sell Price',
      emailRequired: 'Please enter a valid email',
      searching: 'Searching...', noPassword: 'No password',
      savingPassword: 'Saving new password...',
      userInfoTitle: 'User Info', emailLabel: 'Email', codeLabel: 'Your Code',
      storeTypeLabel: 'Store Type', mainCodeLabel: 'Main Code',
      statusTitle: 'Disconnected', statusDesc: 'Enter connection credentials to start',
      statusBadge: 'Disconnected', connTab: 'Connection', backupTab: 'Backup',
      branchesTab: 'Branches', recoveryTab: 'Account Recovery',
      cloudStatusCard: 'Cloud Connection Status', cloudStatusDesc: 'Cloud connection is automatic. All your data is safely stored.',
      logoutBtn: 'Logout', uploadCard: 'Upload Backup', uploadDesc: 'The existing backup in the cloud will be replaced...',
      pushTitle: 'Mobile Notifications', pushDesc: 'When a product order or spoiled-goods return is created, an instant notification is sent to your phone even while the website is closed.',
      siteUrlLabel: 'Website URL', siteUrlPlaceholder: 'https://...',
      pushSecretLabel: 'Secret Key', pushSecretPlaceholder: 'Your secret key',
      pushSaveBtn: 'Save', pushUrlRequired: 'Please enter the website URL', pushUrlInvalid: 'The website URL is not valid',
      pushSecretRequired: 'Please enter the secret key', pushSaved: 'Settings saved',
      autoBackup: 'Auto Backup', backupInterval: 'Interval (minutes)',
      min1: '1 min', min2: '2 min', min5: '5 min', min10: '10 min', min30: '30 min',
      uploadBtn: 'Upload Backup', restoreBtn: 'Restore Backup',
      branchesCard: 'Branches', branchesDesc: 'Branch management is only available for the main store.',
      addBranch: 'Add New Branch', branchName: 'Branch Name', branchNamePlaceholder: 'e.g. Downtown Branch',
      branchPassword: 'Password', branchPasswordPlaceholder: 'Branch password',
      saveBranch: 'Save Branch', cancel2: 'Cancel', addNewBranch: 'Add New Branch', refreshBtn: 'Refresh',
      noBranches2: 'No registered branches', branchStock: 'Branch stock: ',
      recoveryCard: 'Account / Password Recovery', recoveryDesc: 'Enter the email associated with the account...',
      search2: 'Search', storeNameLabel: 'Store Name', codeResult: 'Code', passwordResult: 'Password',
      changePassword: 'Change Password', searchAgain: 'Search Again',
      newPasswordLabel: 'New Password', newPasswordPlaceholder2: 'At least 4 characters',
      confirmPasswordLabel: 'Confirm Password', confirmPasswordPlaceholder2: 'Re-enter password',
      saveNewPassword: 'Save New Password',       backBtn: 'Back',
    },
    login: {
      loginSubtitle: 'Choose login method', managerTab: 'Manager', userTab: 'User', newAccountTab: 'New Account', branchTab: 'Branch',
      codeLabel: '10-digit code', storePassword: 'Store Password', passwordPlaceholder: 'Enter password',
      loginManager: 'Login as Manager', forgotPassword: 'Forgot password?',
      storeCode: 'Store Code', storeCodePlaceholder: 'Enter store code (10 digits)',
      usernameLabel: 'Username', usernamePlaceholder: 'Username',
      userPassword: 'Password', loginAsUser: 'Login as User',
      emailLabel: 'Email', createAccount: 'Create Account',
      mainStoreCode: 'Main Store Code', branchPassword: 'Branch Password', branchLogin: 'Connect as Branch',
      accountCreatedTitle: 'Account Created Successfully!', accountCreatedDesc: 'Save this code somewhere safe. You will need it to recover your data.',
      accountCreatedWarning: 'This code cannot be recovered. Write it down or take a photo.', enterApp: 'Enter App',
      recoveryTitle: 'Password Recovery', recoverySubtitle: 'Enter your email to view code and password',
      searchBtn: 'Search', backToLogin: 'Back to Login',
      storeNameSpan: 'Store Name:', codeSpan: 'Code:', passwordSpan: 'Password:',
      loginWithCode: 'Login with Code', resetPassword: 'Reset Password',
      searchAgainLink: 'Search Again', newPasswordTitle: 'Set New Password',
      newPassLabel: 'New Password', newPassPlaceholder: 'Enter new password',
      confirmPassLabel: 'Confirm Password', confirmPassPlaceholder: 'Re-enter password',
      saveNewPass: 'Save New Password', backLink: 'Back',
    },
  },
  fr: {
    appTitle: 'ZMT PIECE',
    online: 'En Ligne', offline: 'Hors Ligne',
    nav: {
      main: 'Principal', manage: 'Gestion', finance: 'Finances', system: 'Système',
      dashboard: 'Tableau de Bord', brands: 'Marques', sales: 'Ventes', invoices: 'Factures',
      inventory: 'Stock', suppliers: 'Fournisseurs', customers: 'Clients', debts: 'Dettes',
      supplierReturns: 'Marchandises Abîmées',
      netAccount: 'Compte Net', discounts: 'Remises', returns: 'Retours',
      reports: 'Rapports', backup: 'Sauvegarde', settings: 'Paramètres',
      connection: 'Paramètres de Connexion',
      storeDebts: 'Dettes Magasins', branchesMonitor: 'Moniteur Succursales', sharedInventory: 'Stock Partagé',
      orders: 'Commandes',
    },
    dash: {
      title: 'Tableau de Bord', sub: 'Aperçu des Ventes et des Stocks',
      s1: 'Articles en Stock', s2: 'Factures ce Mois', s3: 'Clients Inscrits', s4: 'Ventes Totales',
      chart: 'Ventes vs Stock vs Retours', months: 'Mois:',
      m1: 'Mois', m2: 'Mois', m3: 'Mois', m4: 'Mois', m5: 'Mois', m6: 'Mois',
      netProfit: 'Bénéfice Net', cost: 'Coût',
      lowStockItems: ' produits en dessous du seuil',
      andMore: 'et', moreItems: 'autres...',
      lowStock: 'Produits sous le seuil', estimatedProfit: 'Profit Total Estimé', monthSales: 'Ventes ce Mois', profitCostDist: 'Distribution Profit & Coût',
    },
    brands: { title: 'Marques', sub: 'Gérer les Marques de Pièces', search: 'Rechercher une marque...', favAdd: 'Ajouter aux favoris', favRemove: 'Retirer des favoris' },
    sales: {
      title: 'Ventes', sub: 'Créer une Nouvelle Facture de Vente',
      searchParts: 'Rechercher Pièces', searchPlaceholder: 'Rechercher par nom ou numéro...',
      emptySearch: 'Tapez pour rechercher des pièces',
      cart: 'Panier', cartEmpty: 'Le panier est vide', total: 'Total:',
      checkout: 'Finaliser',
    },
    invoices: {
      title: 'Factures', sub: 'Toutes les Factures',
      search: 'Rechercher une facture...', newInvoice: 'Nouvelle Facture',
      col1: 'Facture #', col2: 'Date', col3: 'Client', col4: 'Montant', col5: 'Statut', col6: 'Actions',
      empty: 'Aucune facture',
    },
    inventory: {
      title: 'Stock', sub: 'Gérer le Stock de Pièces',
      search: 'Rechercher dans le stock...', add: 'Ajouter Pièce', export: 'Exporter',
      col1: 'Code', col2: 'Nom Pièce', col3: 'Marque', col4: 'Quantité', col5: 'Prix Achat', col6: 'Prix Vente', col7: 'Actions',
      empty: 'Le stock est vide',
    },
    suppliers: {
      title: 'Fournisseurs', sub: 'Gérer les Fournisseurs',
      search: 'Rechercher un fournisseur...', add: 'Ajouter Fournisseur',
      col1: 'Nom', col2: 'Tél', col3: 'Email', col4: 'Marques', col5: 'Solde', col6: 'Actions',
      empty: 'Aucun fournisseur',
      addModalTitle: 'Ajouter un Fournisseur', editModalTitle: 'Modifier le Fournisseur',
      formName: 'Nom du Fournisseur', formNamePl: 'Ex: Société XX Pièces Auto',
      formPhone: 'Numéro de Téléphone', formAddress: 'Adresse', formAddressPl: 'Ex: Riyad - Rue Roi Fahd',
      cancel: 'Annuler', save: 'Enregistrer',
    },
    customers: {
      title: 'Clients', sub: 'Gérer les Clients',
      search: 'Rechercher un client...', add: 'Ajouter Client',
      col1: 'Nom', col2: 'Tél', col3: 'Adresse', col4: 'Achats', col5: 'Solde', col6: 'Actions',
      empty: 'Aucun client',
      addModalTitle: 'Ajouter un Client', editModalTitle: 'Modifier le Client',
      formName: 'Nom du Client', formNamePl: 'Ex: Ahmed Ali',
      formPhone: 'Numéro de Téléphone', formAddress: 'Adresse', formAddressPl: 'Ex: Alger',
      formType: 'Type de client', typeUnit: 'Détail', typeWhole: 'Gros', formTypeHelp: 'Définit le prix par défaut dans la page de vente (modifiable par produit dans le panier)',
      formDiscount: 'Remise (%)', formDiscountHelp: 'De 0.001% à 100% - Optionnel',
      cancel: 'Annuler', save: 'Enregistrer',
      totalDebts: 'Total Dettes des Clients',
      totalPaid: 'Total Payé',
      totalCount: 'Total Clients',
    },
    debts: {
      title: 'Dettes', sub: 'Gérer les Dettes',
      youOwe: 'Dettes dues (aux Fournisseurs)', youOwed: 'Dettes dues par les Clients',
      noDebts: 'Aucune dette en cours',
      logTitle: 'Registre des Dettes',
      col1: 'Date', col2: 'Type', col3: 'Partie', col4: 'Montant', col5: 'Statut', col6: 'Actions',
      empty: 'Aucune transaction',
      totalInvoices: 'Total Factures', totalPurchases: 'Total Achats',
      balance: 'Solde', paid: 'Payé', paidToThem: 'Payé à eux',
      invoices: 'Factures', noInvoices: 'Aucune facture',
      payments: 'Paiements', noPayments: 'Aucun paiement',
      net: 'Créances Nettes', chooseSide: 'Choisir une partie de la liste', back: 'Retour',
      searchPlaceholder: 'Rechercher par nom ou numéro de téléphone...', tabCustomers: 'Clients', tabSuppliers: 'Fournisseurs',
      totalCustomerDebts: 'Dettes dues par les Clients', totalSupplierDebts: 'Dettes dues aux Fournisseurs',
    },
    net: {
      title: 'Compte Net', sub: 'Résumé Financier',
      s1: 'Ventes Totales', s2: 'Achats Totaux', s3: 'Bénéfice Net', s4: 'Montants en Attente',
      logTitle: 'Registre des Transactions',
      col1: 'Date', col2: 'Description', col3: 'Type', col4: 'Montant', col5: 'Solde',
      empty: 'Aucune transaction récente',
      customerDebt: 'Dû à nous', supplierDebt: 'Nous devons',
      purchaseInvoice: 'Facture d\'achat', purchaseFrom: 'Facture de',
      transferInvoice: 'Facture de transfert', receptionInvoice: 'Facture de réception',
      purchases: 'Achats', paymentFrom: 'Paiement de',
      paymentNote: 'Paiement', paymentWalkin: 'Paiement client',
      salesPaid: 'Ventes (payé)', paymentTo: 'Paiement à',
      paymentToSupplier: 'Paiement fournisseur', expenses: 'Dépenses',
      stockPurchase: 'Achat stock', stockPurchases: 'Achats stock',
      totalExpenses: 'Total Dépenses',
      marginTitle: 'Marge Bénéficiaire', periodLabel: 'Période:', today: "Aujourd'hui",
      totalMargin: 'Marge Bénéficiaire Totale', periodMargin: 'Marge de la Période', allTime: 'Depuis le début',
      cashLabel: 'Espèces', marginLabel: 'Marge', ccpPaidNote: 'Payée par CCP',
    },
    discounts: {
      title: 'Remises', sub: 'Gérer les Offres et Remises',
      add: 'Ajouter Remise',
      col1: 'Produit', col2: 'Remise %', col3: 'Date Début', col4: 'Date Fin', col5: 'Statut', col6: 'Actions',
      empty: 'Aucune remise',
      unregistered: 'Non enregistré', deleteConfirm: 'Supprimer cet enregistrement?',
      totalDiscounts: 'Total Remises', totalValue: 'Valeur Totale des Remises',
      colDate: 'Date', colInvoice: 'Facture', colCustomer: 'Client', colType: 'Type', colRatio: 'Taux', colAmount: 'Montant', colActions: 'Actions',
    },
    returns: {
      title: 'Retours', sub: 'Gérer les Retours et Remboursements',
      add: 'Enregistrer Retour', export: 'Exporter',
      col1: 'Retour #', col2: 'Facture', col3: 'Pièce', col4: 'Qté', col5: 'Raison', col6: 'Date', col7: 'Actions',
      empty: 'Aucun retour',
      time: 'Heure', defaultReason: 'Ajustement facture',
      deleteConfirm: 'Supprimer cet enregistrement?',
      noReturnsExport: 'Aucun retour à exporter',
      exportSuccess: 'Retours exportés avec succès',
      exportError: 'Erreur lors de la sauvegarde: ',
    },
    supplierReturns: {
      title: 'Marchandises Abîmées', sub: 'Gérer les retours de marchandises abîmées aux fournisseurs',
      export: 'Exporter', filterAll: 'Tous',
      statusPending: 'En cours de retour', statusReturned: 'Retourné', statusNotReturned: 'Non retourné',
      colProduct: 'Produit', colQty: 'Qté', colAmount: 'Montant',
      colSupplier: 'Fournisseur', colInvoice: 'Facture', colDate: 'Date',
      colStatus: 'Statut', colActions: 'Actions', colStore: 'Magasin / Succursale',
      empty: 'Aucune demande de retour',
      noProduct: 'Produit introuvable', noInvoice: 'Aucune facture d\'achat pour ce produit',
      stock: 'En stock', supplier: 'Fournisseur', qty: 'Qté retournée', invoice: 'Facture d\'entrée',
      note: 'Note', notePlaceholder: 'Facultatif...',
      modalTitle: 'Retourner la Marchandise au Fournisseur',
      notOwned: 'Vous ne pouvez pas modifier les demandes d\'un autre magasin',
      invalidQty: 'Saisissez une quantité valide', qtyExceedsStock: 'La quantité dépasse le stock actuel',
      qtyExceedsInvoice: 'La quantité dépasse celle de cette facture',
      created: 'Demande de retour enregistrée',
      confirmReturned: 'Confirmer le retour ?\nLa quantité sera déduite du stock, la facture du fournisseur réduite et le compte net affecté.',
      confirmNotReturned: 'Confirmer non retourné ?\nAucun changement sur le stock ni la facture.',
      insufficientStock: 'Le stock actuel est insuffisant', invoiceMissing: 'Facture d\'achat introuvable',
      lineMissing: 'Le produit n\'existe plus sur la facture',
      returnedSuccess: 'Retourné : déduit du stock et facture du fournisseur réduite',
      delete: 'Supprimer la demande', deleteReverse: 'Annuler le retour',
      deleteConfirm: 'Supprimer la demande de retour ?', deleteReturnedConfirm: 'Supprimer la demande ?\nTous les effets seront annulés (stock restauré et facture augmentée).',
      deleted: 'Demande supprimée',
      refundNote: 'Retour de marchandise fournisseur',
      noExport: 'Rien à exporter', exportSuccess: 'Exporté avec succès', exportError: 'Erreur de sauvegarde : ',
    },
    reports: {
      title: 'Rapports', sub: 'Rapports Avancés de Ventes et Stock',
      c1: 'Rapport des Ventes', c1desc: 'Analyse quotidienne, hebdomadaire et mensuelle',
      c2: 'Rapport du Stock', c2desc: 'État du stock et mouvement des pièces',
      c3: 'Rapport des Bénéfices', c3desc: 'Bénéfices et pertes',
      c4: 'Rapport des Clients', c4desc: 'Analyse de la base clients',
      dailySales: 'Ventes Quotidiennes', categoryDist: 'Ventes par Catégorie',
      bestSellers: 'Meilleures Ventes', brandSales: 'Ventes par Marque',
      dailyBreakdown: 'Détail Quotidien',
      period: 'Période:', exportPDF: 'Exporter PDF',
      period7: '7 Derniers Jours', period30: '30 Derniers Jours', period90: '3 Derniers Mois',
      period365: 'Dernière Année', periodAll: 'Tout',
      noSales: 'Aucune vente', profit: 'Bénéfice',
      returnsPieces: 'Retours (pièces)', pieces: ' pièces',
      reportTitle: 'Rapport des Ventes et Retours',
      periodLabel: 'Période:', totalSales: 'Ventes Totales: ',
      totalProfit: 'Bénéfice Total: ', salesInvoiceCount: 'Factures de vente: ',
      returnsCount: 'Nombre de retours: ', netSales: 'Ventes Nettes: ',
      dailyDetails: 'Détail quotidien:', invoicesWord: ' factures',
      period2: 'Période:', thisWeek: 'Cette Semaine', thisMonth: 'Ce Mois', thisYear: 'Cette Année', custom: 'Personnalisé', specificDay: 'Jour Spécifique',
      from: 'Du:', to: 'Au:', date2: 'Date:', totalSales2: 'Ventes Totales', invoices2: 'factures', pieces2: 'pièces',
      profit2: 'Bénéfice', paid2: 'Payé', remaining2: 'Reste', returnCount: 'Nombre de Retours', value: 'Valeur',
      netSales2: 'Ventes Nettes', returnRatio: 'Taux de Retour', profitMargin: 'Marge Bénéficiaire',
      totalProfitMargin: 'Marge Bénéficiaire Totale', ratioLabel: 'Taux', allTimeLabel: 'Total Global',
      salesVsReturns: 'Ventes vs Retours', net: 'Net', dailySalesVsReturns: 'Ventes vs Retours Quotidiens',
      salesTrend: 'Tendance des Ventes', returnsTrend: 'Tendance des Retours', salesByCategory: 'Ventes par Catégorie',
      returnsByReason: 'Retours par Raison', topProducts: 'Meilleurs Produits',
      productCol: 'Produit', barcodeCol: 'Code-barres', qtySoldCol: 'Qté Vendue', totalCol: 'Total', profitCol: 'Bénéfice',
      dailyDetail2: 'Détail Quotidien Ventes & Retours', dateCol: 'Date',
      salesInvoicesCol: 'Factures de Vente', piecesSoldCol: 'Pièces Vendues', salesValueCol: 'Valeur des Ventes',
      returnsCol: 'Retours', piecesReturnedCol: 'Pièces Retournées', netDayCol: 'Net du Jour',
    },
    reportsNet: {
      title: 'Compte Net', period: 'Période :', year: 'Année :', specificDate: 'Date Précise',
      range: 'Plage', sales: 'Total des Ventes', purchases: 'Total des Achats',
      expenses: 'Total des Dépenses', profit: 'Bénéfice Net',
      periodDebt: 'En attente (Période)', currentDebt: 'En attente (Actuel)',
      customerDebt: 'Dû à nous', supplierDebt: 'Nous devons',
      periodMargin: 'Marge de la Période', totalMargin: 'Marge Totale',
    },
    backup: {
      title: 'Sauvegarde', sub: 'Gérer les Sauvegardes',
      c1: 'Créer une Sauvegarde', c1desc: 'Enregistrer une copie de la base',
      c1btn: '<i class="fas fa-save"></i> Exporter',
      c2: 'Restaurer une Sauvegarde', c2desc: 'Restaurer les données depuis une sauvegarde',
      c2btn: '<i class="fas fa-upload"></i> Importer',
      prevTitle: 'Sauvegardes Précédentes',
      empty: 'Aucune sauvegarde précédente',
      restore: 'Restaurer', creating: 'Création de la sauvegarde...',
      operationCancelled: 'Opération annulée',
      createSuccess: '✓ Sauvegarde créée — ',
      createFailed: '✗ Échec de la sauvegarde: ',
      readingFile: 'Lecture du fichier...',
      readFileFailed: '✗ Échec de lecture: ',
      invalidFile: '✗ Fichier invalide — aucune donnée',
      restoreConfirm: 'Restaurer la sauvegarde?',
      store: 'Magasin: ', date: 'Date: ',
      content: 'Contenu:\n',
      products: 'Produits', invoices: 'Factures',
      customers: 'Clients', suppliers: 'Fournisseurs',
      payments: 'Paiements', returns: 'Retours',
      discounts: 'Remises', unknown: 'Inconnu',
      dataWarning: '⚠️ Toutes les données actuelles seront remplacées!',
      restoreCancelled: 'Restauration annulée',
      restoreSuccess: '✓ Données restaurées. Rouvrez les pages pour actualiser.',
      restoreError: '✗ Erreur: ',
      readFileFailed2: '✗ Échec de lecture: ',
      invalidFile2: '✗ Fichier invalide',
      restoreFromFileConfirm: 'Restaurer',
      restoreFromFileWarning: 'Toutes les données actuelles seront remplacées.',
      restoreFromFileSuccess: '✓ Restauré depuis ',
      deleteAllConfirm: '⚠️ Supprimer toutes les données?',
      deleteAllDetails: 'Tous les produits, factures, clients, fournisseurs, paiements, retours et remises seront effacés.',
      deleteAllWarning: 'Cette action est irréversible!',
      deleteAllBackupHint: 'Créez une sauvegarde avant de continuer.',
      deleteAllFinalConfirm: 'Confirmation finale: Supprimer toutes les données?\nImpossible de restaurer sans sauvegarde.',
      deleteAllDone: '✓ Données effacées. Utilisez "Restaurer" pour récupérer.',
      clearData: 'Effacer les Données', clearDataDesc: 'Effacer toutes les données de l\'application — utilisé pour tester la restauration de sauvegarde',
      deleteAllBtn: 'Supprimer Toutes les Données',
    },
    sharedInventory: {
      title: 'Stock Partagé', sub: 'Afficher le stock du magasin principal et des succursales',
      searchAll: 'Rechercher Tous les Magasins', searchAllPlaceholder: 'Recherchez par nom ou code-barres pour trouver quel magasin a le produit...',
      loading: 'Chargement des données...', backToList: 'Retour à la Liste',
    },
    migration: {
      title: 'Importer depuis un ancien programme', cardTitle: 'Importer depuis un ancien programme',
      cardDesc: 'Importer les données depuis un autre programme (CSV, Excel, bases de données...)',
      cardBtn: 'Importer depuis un ancien programme',
      dropHere: 'Glissez-déposez un fichier ici ou cliquez pour parcourir',
      supportedFormats: 'Supporte : CSV, Excel, JSON, XML, SQL, SQLite (.db), dBASE (.dbf), Firebird (.fdb), tout texte',
      reading: 'Lecture du fichier...', readError: 'Erreur de lecture du fichier',
      selectTable: 'Sélectionnez la table contenant vos pièces :',
      preview: 'Aperçu des données', columns: 'colonnes',
      mapColumns: 'Correspondance des colonnes',
      mapHint: 'Auto-correspondance tentative — vérifiez et ajustez si nécessaire',
      noMapping: 'Pas de correspondance',
      back: 'Retour', next: 'Suivant',
      totalRows: 'Total des lignes :', mappedFields: 'Champs correspondants :',
      moreRows: 'lignes supplémentaires...',
      importBtn: 'Importer les Données',
      needNameOrBarcode: 'Au moins le nom du produit ou le code-barres doit être mappé',
      importing: 'Importation...', importSuccess: 'Importation terminée avec succès',
      productsImported: 'produits importés', importError: "Erreur d'importation",
      cannotRead: 'Impossible de lire le fichier', parseError: "Erreur d'analyse du fichier",
      unsupportedDbType: 'Ce type de base de données nécessite une exportation manuelle',
      exportHint: 'Exportez les données depuis votre ancien programme en CSV ou Excel, puis réessayez',
      aiAnalyzing: 'Analyse IA en cours...',
      aiError: 'Erreur IA',
      aiDone: 'Analyse IA terminée',
      aiAnalyzed: 'Analysé par IA',
      chooseMode: 'Choisir la méthode de traitement',
      modeHint: 'Le traitement local est rapide et utilise la correspondance automatique. Le traitement IA analyse intelligemment les données pour comprendre le texte non structuré.',
      localMode: 'Traitement local',
      localHint: 'Correspondance automatique rapide',
      aiMode: "Traitement IA",
      aiHint: 'Analyse intelligente via votre fournisseur IA',
      aiRequiresKey: '* Le traitement IA nécessite une clé API configurée dans Paramètres',
      firebirdNoPath: "Impossible d'accéder au chemin du fichier de base Firebird",
      firebirdNoTables: 'Aucune table lisible trouvée dans la base de données',
      firebirdOpenError: "Impossible d'ouvrir la base de données Firebird",
      firebirdTableError: 'Impossible de lire la table',
      selectRole: 'Que contient cette table ?',
      roleHint: 'Choisissez le type de données pour une importation correcte',
      roleProducts: 'Pièces / Produits',
      roleCustomers: 'Clients',
      roleSuppliers: 'Fournisseurs',
      needName: 'Au moins le champ nom doit être mappé',
      importDone: 'Importation terminée avec succès',
      roleSalesInvoices: 'Factures de Vente',
      rolePurchaseInvoices: "Factures d'Achat",
      importedNote: 'Importé',
      oldInvoiceNote: 'Facture importée',
      oldPaymentNote: 'Paiement importé',
      restoringBackup: 'Restauration de la sauvegarde (gbak)...',
      loadingBrands: 'Lecture des marques...',
      brandEmpty: 'Sans marque',
      fullImportPanelTitle: 'Importation complète des données',
      fullImportPanelDesc: 'Base Sable Stock / Gestion Stock détectée — vous pouvez tout importer en une fois : clients, fournisseurs, produits avec prix, factures et avoirs.',
      fullImportBtn: 'Importation complète',
      fullImportPopupTitle: 'Choisir les marques à importer',
      fullImportPopupHint: 'Sélectionnez les marques dont vous voulez importer les produits. Les produits sans marque sont toujours importés.',
      selectAll: 'Tout sélectionner',
      cancelImport: 'Annuler',
      confirmImport: 'Démarrer l\'importation',
      creatingBackup: 'Création d\'une sauvegarde avant importation...',
      productsNone: 'Aucun produit importé (vérifiez la sélection des marques)',
      fullImportDone: 'Importation complète terminée',
      returnsCount: 'Retours',
      avoirReason: 'Retour (Avoir)',
      walkin: 'Client de passage',
    },
    brandCat: { brand: 'Marque', category: 'Choisir le Type de Pièce', searchPlaceholder: 'Rechercher un type...', addProduct: 'Ajouter Produit' },
    catProducts: { title: 'Produits', sub: 'Produits Disponibles', searchPlaceholder: 'Rechercher un produit...', addProduct: 'Ajouter Produit', empty: 'Aucun produit dans cette catégorie', addInvoiceTitle: 'Ajouter un Produit à la Facture', scanPlaceholder: 'Scannez le code-barres...', scannerReady: 'Prêt à scanner', searchProduct: 'Rechercher un produit', newProduct: 'Nouveau Produit', searchExisting: 'Rechercher par nom ou code-barres', searchExistingPlaceholder: 'Nom du produit ou code-barres...', name: 'Nom du Produit', namePlaceholder: 'Nom de la pièce', barcode: 'Code-barres', barcodePlaceholder: 'Entrez le code-barres', generate: 'Générer', qty: 'Quantité', buyPrice: 'Prix d\'Achat', sellPrice: 'Prix de Vente', supplier: 'Fournisseur', supplierPlaceholder: 'Rechercher un fournisseur par nom...', cancel: 'Annuler', addToCart: 'Ajouter au Panier de Facture', cartTitle: 'Panier de Facture', total: 'Total:', clear: 'Vider',       confirmInvoice: 'Confirmer la Facture', fiscalStamp: 'Timbre Fiscal (Timbre Fiscal)', wholesalePrice: 'Prix de Gros' },
    settings: {
      title: 'Paramètres', sub: 'Paramètres de l\'Application',
      general: 'Paramètres Généraux',
      storeName: 'Nom du Magasin', currency: 'Devise', language: 'Langue',
      notif: 'Notifications de Stock Bas',       autoBackup: 'Sauvegarde Auto',
      info: 'À Propos',
      version: 'Version', developer: 'Développeur', company: 'Société', lastUpdate: 'Dernière Mise à Jour',
    },
    chart: { sales: 'Ventes', inventory: 'Stock', returns: 'Retours' },
    connection: {
      title: 'Paramètres de Connexion', sub: 'Connexion cloud et gestion des magasins',
    },
    btn: {
      newInvoice: 'Nouvelle Facture', addPart: 'Ajouter Pièce', export: 'Exporter',
      addSupplier: 'Ajouter Fournisseur', addCustomer: 'Ajouter Client', addDiscount: 'Ajouter Remise',
      addReturn: 'Enregistrer Retour',
    },
    common: {
      save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', edit: 'Modifier', confirm: 'Confirmer',
      close: 'Fermer', print: 'Imprimer', loading: 'Chargement...', processing: 'Traitement...',
      noResults: 'Aucun résultat', empty: 'Vide', search: 'Rechercher',
      page: 'Page', of: 'de', product: 'Produit', piece: 'Pièce', invoice: 'Facture',
      qty: 'Qté', total: 'Total', paid: 'Payé', remaining: 'Reste', debt: 'Dette',
      date: 'Date', name: 'Nom', status: 'Statut', actions: 'Actions',
      yes: 'Oui', no: 'Non', success: 'Succès', error: 'Erreur', warning: 'Attention',
      areYouSure: 'Êtes-vous sûr?', stock: 'Stock', price: 'Prix',
      addItem: 'Ajouter', removeItem: 'Retirer', clearCart: 'Vider le Panier',
      ready: 'Prêt', done: 'Fait', notFound: 'Introuvable', outOfStock: 'Rupture de stock',
      lowStock: 'Stock bas', new: 'Nouveau', provisional: 'Provisoire',
      paidFull: 'Totalement payé', paidPartial: 'Paiement partiel', unpaid: 'Impayé',
      manual: 'Manuel', customer: 'Client',
      back: 'Retour', pay: 'Payer', payFull: 'Payer Tout', searchAll: 'Tout Rechercher', refresh: 'Actualiser', confirmPay: 'Confirmer le Paiement',
      barcode: 'Code-barres', brand: 'Marque', category: 'Catégorie', supplier: 'Fournisseur',
      address: 'Adresse', phone: 'Téléphone', email: 'Email', username: 'Nom d\'utilisateur', password: 'Mot de passe',
      generate: 'Générer', fiscalStamp: 'Timbre Fiscal', cart: 'Panier', clear: 'Vider',
      subtotal: 'Sous-total', discount: 'Remise', totalAfterDiscount: 'Total Après Remise',
      payNow: 'Montant Payé', remainingDebt: 'Reste (Dette)', fullPayment: 'Paiement Complet', noPayment: 'Aucun Paiement',
      real: 'Réel', formal: 'Formel', customerDiscount: 'Remise Client', additionalDiscount: 'Remise Supplémentaire',
    },
    sales: {
      title: 'Ventes', sub: 'Créer une Nouvelle Facture de Vente',
      searchParts: 'Rechercher Pièces', searchPlaceholder: 'Rechercher par nom ou numéro...',
      emptySearch: 'Tapez pour rechercher des pièces',
      emptyResults: 'Aucun résultat', emptyProducts: 'Aucun produit',
      cart: 'Panier', cartEmpty: 'Le panier est vide', total: 'Total:',
      checkout: 'Finaliser',
      unavailable: 'Indisponible', lowStockTip: 'Stock bas',
      scannerReady: 'Prêt', scannerDone: 'Fait', scannerNotFound: 'Introuvable', scannerUnavailable: 'Indisponible',
      noCustResults: 'Aucun résultat', discount: 'Remise',
      del: 'Supprimer',
      fullyPaid: 'Totalement payé', partialPay: 'Paiement partiel', enterPaid: 'Montant payé',
      cartEmptyAlert: 'Le panier est vide', notAvailableQty: 'Non disponible en quantité requise', available: 'Disponible:',
      paidExceedsTotal: 'Le montant payé ne peut pas dépasser le total',
      fullPaymentNote: 'Paiement complet à la vente', partialPaymentNote: 'Paiement partiel à la vente',
      discountType: 'Client', discountManual: 'Manuel',
      clearCartConfirm: 'Vider le panier d\'achat?',
      customer: 'Client', customerPlaceholder: 'Rechercher un client...', unregistered: 'Client non enregistré', remove: 'Retirer',
      cartTitle: 'Panier', subtotal: 'Sous-total', customerDiscount: 'Remise Client', additionalDiscount: 'Remise Supplémentaire',
      totalLabel: 'Total', paidLabel: 'Montant Payé', payFull: 'Payer Tout', remainingLabel: 'Reste',
      clear: 'Vider', checkout: 'Finaliser', emptyCartTitle: 'Le Panier est Vide', emptyCartHint: 'Scannez le code-barres ou sélectionnez dans la liste',
      scanPlaceholder: 'Scannez le code-barres...', searchPlaceholder2: 'Rechercher par nom ou code-barres...', productsCount: '0 produits', multiBatches: 'Plusieurs lots', mixedPrice: 'Prix mixte', unit: 'Unité', wholesale: 'Gros',
      payMethod: 'Moyen de paiement', payCash: 'Espèces', payCcp: 'CCP', payBoth: 'Les deux',
      cashAmount: 'Montant espèces', ccpAmount: 'Montant CCP',
    },
    orders: {
      title: 'Commandes', sub: 'Commander les pièces manquantes aux fournisseurs',
      tabMine: 'Mes commandes', tabBranches: 'Commandes des succursales',
      suggestions: 'Suggestions de stock faible', noSuggestions: 'Aucun produit en stock faible ou épuisé — parfait !',
      search: 'Rechercher par nom ou code-barres...',
      all: 'Tout', today: 'Aujourd\'hui', week: 'Semaine', month: 'Mois', year: 'Année',
      refresh: 'Actualiser',
      empty: 'Aucune commande pour le moment — ajoutez depuis les suggestions ou la recherche',
      statusPending: 'En attente', statusDone: 'Terminée', statusNotAvailable: 'Indisponible',
      btnDone: 'Terminée', btnNotAvailable: 'Indisponible', btnDelete: 'Supprimer',
      deleteConfirm: 'Supprimer cette commande ?',
      cloudRequired: 'Connexion cloud requise pour voir les commandes des succursales',
      loading: 'Chargement des commandes des succursales...',
      noBranchOrders: 'Aucune commande de succursale pour le moment',
    },
    invoices: {
      title: 'Factures', sub: 'Toutes les Factures',
      search: 'Rechercher une facture...', newInvoice: 'Nouvelle Facture',
      col1: 'Facture #', col2: 'Date', col3: 'Client', col4: 'Montant', col5: 'Statut', col6: 'Actions',
      empty: 'Aucune facture', noMatch: 'Aucune facture correspondante',
      resultsInfo: ' factures',
      typeSale: 'Facture de Vente', typeSupplier: 'Facture Fournisseur', typeWaybill: 'Bon de Livraison',
      typeProforma: 'Facture Proforma', typeDispatch: 'Bon d\'Envoi', typeTransfer: 'Bon de Transfert',
      typeReception: 'Bon de Réception', typePurchase: 'Facture d\'Achat',
      badgeProvisional: 'Provisoire',
      itemCount: 'articles', paidLabel: 'Payé', unpaidLabel: 'Impayé', remainingLabel: 'Reste',
      pageInfo: 'Page', allowPopups: 'Veuillez autoriser les popups pour l\'impression',
      cannotPayReception: 'Impossible d\'ajouter un paiement à une facture de réception',
      cannotPayProforma: 'Impossible d\'ajouter un paiement à une facture proforma',
      fullyPaidAlert: 'Facture entièrement payée', invalidAmount: 'Montant invalide',
      transferPayNote: 'Paiement sur facture de transfert', regularPayNote: 'Paiement via factures',
      paymentSaved: 'Paiement enregistré avec succès',
      cannotEditDispatch: 'Impossible de modifier le bon d\'envoi',
      cannotEditReception: 'Impossible de modifier la facture de réception',
      cannotEditProformaWaybill: 'Impossible de modifier le bon de livraison provisoire',
      editTitle: 'Modifier la Facture',
      editHelpSupplier: 'Facture fournisseur: augmentation du stock et du solde fournisseur.',
      editHelpCustomer: 'Modifier les quantités. Augmentation déduit du stock, diminution retourne au stock.',
      scanPlaceholder: 'Scannez le barcode ou tapez le nom...',
      editColProduct: 'Produit', editColCurrentQty: 'Qté Actuelle', editColNewQty: 'Nouvelle Qté',
      saveEdits: 'Enregistrer', cancelEdit: 'Annuler',
      scanDone: 'Fait', scanReady: 'Prêt', scanNotFound: 'Introuvable', resultCount: 'résultat',
      availableStock: 'Disponible:', notInStock: 'Pas en stock', badgeNew: 'Nouveau',
      cannotBelowZero: 'Impossible de mettre "..." à moins de zéro',
      insufficientStock: 'Stock insuffisant pour "..."',
      noQtyChanged: 'Aucune quantité modifiée',
      invoiceEdited: 'Facture modifiée avec succès',
      deleteConfirm: 'Supprimer cette facture? Les produits seront retournés au stock.',
      cannotDeleteReception: 'Impossible de supprimer la facture de réception',
      cannotDeleteSold: 'Impossible de supprimer - le produit "..." a été vendu',
      invoiceDeleted: 'Facture supprimée',
      transferEditTitle: 'Modifier la Facture de Transfert',
      transferEditHelp: 'Modifier les quantités. Augmentation réduit votre stock, diminution l\'augmente.',
      currentTotal: 'Total Actuel:', editColSellPrice: 'Prix Vente',
      newTotal: 'Nouveau Total:', diff: 'Différence:',
    },
    inventory: {
      title: 'Stock', sub: 'Gérer le Stock de Pièces',
      search: 'Rechercher dans le stock...', add: 'Ajouter Pièce', export: 'Exporter',
      col1: 'Code', col2: 'Nom Pièce', col3: 'Marque', col4: 'Quantité', col5: 'Prix Achat', col6: 'Prix Vente', col7: 'Actions',
      empty: 'Le stock est vide',
      transferBranch: 'Transférer vers un autre magasin',
      transferMain: 'Transférer vers les succursales',
      scannerReady: 'Prêt à scanner', scannerProcessing: 'Traitement...',
      scannerFound: 'Trouvé:', scannerDone: 'Scan terminé',
      scannerNewBarcode: 'Nouveau produit - Barcode', scannerNew: 'Nouveau produit',
      noResults: 'Aucun résultat',
      enterName: 'Veuillez entrer le nom du produit', enterBarcode: 'Veuillez entrer le barcode',
      clearCartConfirm: 'Vider le panier?', cartEmpty: 'Le panier est vide',
      invoiceSaved: 'Facture enregistrée pour', fiscalStamp: 'Timbre fiscal',
      includes: 'inclut', productUnit: 'produits', pieceUnit: 'pièces',
      editLabelName: 'Nom du Produit', editLabelBarcode: 'Barcode', editLabelBrand: 'Marque',
      editLabelCategory: 'Catégorie', editLabelQty: 'Quantité', editLabelBuyPrice: 'Prix Achat', editLabelSellPrice: 'Prix Vente', editLabelWholesale: 'Prix de Gros',
      editTitle: 'Modifier le Produit',
      deleteConfirm: 'Êtes-vous sûr de vouloir supprimer ce produit?',
      importSuccess: 'Importé', importSuccessEnd: 'produits avec succès',
      importCost: 'Coût d\'achat:', importRecorded: 'Enregistré dans le compte net',
      importFailed: 'Échec de l\'import. Vérifiez le format du fichier.',
      addWithInvoice: 'Ajouter Stock + Facture', transferBtn: 'Transférer Produits', exportCSV: 'Exporter CSV', importCSV: 'Importer CSV',
      addTitle: 'Ajouter Stock + Facture', scanPlaceholder2: 'Scannez le code-barres...',
      searchExisting: 'Rechercher un produit existant (par nom ou code-barres)', searchExistingPlaceholder: 'Nom du produit ou code-barres...',
      category: 'Catégorie', name: 'Nom du Produit', barcode: 'Code-barres', generate2: 'Générer',
      qty: 'Quantité', buyPrice: 'Prix Achat', sellPrice: 'Prix Vente', wholesalePrice: 'Prix de Gros', supplierOptional: 'Fournisseur (optionnel)',
      supplierSearchPlaceholder: 'Rechercher un fournisseur...', addToCart: 'Ajouter au Panier',
      invoiceCart: 'Panier de Facture', fiscalStamp2: 'Timbre Fiscal', totalLabel: 'Total:',
      clear2: 'Vider', confirmInvoice: 'Confirmer la Facture', categoryCol: 'Catégorie',
    },
    transfer: {
      loading: 'Chargement...', chooseDest: 'Choisir la destination', mainStore: 'Magasin Principal',
      loadError: 'Erreur de chargement des destinations',
      scannerProcessing: 'Traitement...', scannerFound: 'Trouvé:', scannerDone: 'Scan terminé',
      scannerNotFound: 'Aucun produit avec ce barcode', scannerNotInStock: 'dans votre stock', scannerNotFoundShort: 'Introuvable',
      noResults: 'Aucun résultat', stock: 'Stock:',
      selectDestFirst: 'Veuillez choisir la destination d\'abord',
      searchFirst: 'Veuillez rechercher un produit d\'abord', qtyZero: 'La quantité doit être supérieure à zéro',
      qtyExceeds: 'La quantité demandée', qtyExceedsAvail: 'dépasse la disponibilité',
      buyPriceZero: 'Le prix d\'achat doit être supérieur à zéro',
      donationLabel: 'Envoyer les produits gratuitement (don)',
      donationWarning: 'Attention: la facture de transfert affichera un solde de 0, et la facture de réception affichera aussi un solde de 0 pour le destinataire.',
      donationNote: 'Don (transfert gratuit)',
      available: 'Disponible:',
      clearCartConfirm: 'Vider le panier de transfert?', scannerReady: 'Prêt à scanner',
      selectDest: 'Veuillez choisir la destination', cartEmpty: 'Le panier de transfert est vide',
      paidExceedsTotal: 'Le montant payé ne peut pas dépasser le total',
      confirmTitle: 'Confirmer le Transfert:', confirmFrom: 'De:', confirmTo: 'Vers:',
      confirmProducts: 'Produits:', confirmTotal: 'Total:', confirmPaid: 'Payé:', confirmRemaining: 'Reste (Dette):',
      confirmContinue: 'Voulez-vous continuer?',
      productNotFound: 'Produit "..." introuvable en stock',
      stockLessThanNeeded: 'Stock insuffisant pour "..."',
      payNote: 'Paiement - Transfert vers',
      transferSuccess: 'Facture de transfert créée avec succès!',
      transferredProducts: 'Produits transférés:', transferTotal: 'Total:',
      transferPaid: 'Payé:', transferRemaining: 'Reste (Dette):',
      transferError: 'Erreur lors du transfert:',
      sub: 'Transférer des produits entre magasins avec suivi des dettes',
      senderStore: 'Magasin Envoyeur', destination: 'Destination',
      chooseDestination2: '-- Choisir la Destination --', selectDestination: 'Sélectionner le magasin de destination',
      scanPlaceholder2: 'Scannez le code-barres...', searchExisting: 'Rechercher un produit en stock (par nom ou code-barres)',
      searchPlaceholder2: 'Nom du produit ou code-barres...', productDataTitle: 'Données du Produit pour Transfert',
      productName: 'Nom du Produit', availableQty: 'Qté Disponible', transferQty: 'Qté à Transférer',
      buyPrice: 'Prix Achat', sellPrice2: 'Prix Vente', brand2: 'Marque', category2: 'Catégorie',
      addToCart2: 'Ajouter au Panier de Transfert', transferCart: 'Panier Facture de Transfert', totalLabel2: 'Total:',
      clear3: 'Vider', paymentSection: 'Paiement & Dettes', payNow2: 'Montant Payé',
      remainingDebt2: 'Reste (Dette):', fullPayment2: 'Paiement Complet', noPayment2: 'Aucun Paiement',
      confirmTransfer: 'Confirmer et Exécuter la Facture de Transfert',
    },
    settings: {
      title: 'Paramètres', sub: 'Paramètres de l\'Application',
      general: 'Paramètres Généraux',
      storeName: 'Nom du Magasin', currency: 'Devise', language: 'Langue',
      notif: 'Notifications de Stock Bas', autoBackup: 'Sauvegarde Auto',
      info: 'À Propos',
      version: 'Version', developer: 'Développeur', company: 'Société', lastUpdate: 'Dernière Mise à Jour',
      settingsSaved: 'Paramètres enregistrés',
      wrongPassword: 'Mot de passe actuel incorrect',
      verifyError: 'Erreur de vérification:',
      passwordMinLength: 'Le mot de passe doit contenir au moins 4 caractères',
      passwordsNoMatch: 'Les mots de passe ne correspondent pas',
      passwordSaved: 'Mot de passe enregistré avec succès',
      errorPrefix: 'Erreur:',
      colPage: 'Page', colView: 'Voir', colEdit: 'Modifier', colDelete: 'Supprimer',
      enterUsername: 'Veuillez entrer le nom d\'utilisateur', enterPassword: 'Veuillez entrer le mot de passe',
      userUpdated: 'Utilisateur mis à jour avec succès', userCreated: 'Utilisateur créé avec succès',
      noPerms: 'Aucune permission',
      delete_user_confirm: 'Êtes-vous sûr de vouloir supprimer l\'utilisateur "..."?',
      storeAddress: 'Adresse du Magasin', phoneNumber: 'Numéro de Téléphone', enableFiscalStamp: 'Activer le Timbre Fiscal dans les Factures',
      fiscalRatio: 'Taux:', fiscalMin: 'Min 5 DA - Max 10,000 DA',
      fiscalPercent: '% (0% pour les systèmes basiques)', lowStockThreshold: 'Seuil de Stock Bas',
      lowStockHint: 'En dessous de ce nombre est considéré stock bas', saveSettings: 'Enregistrer les Paramètres',
      storePasswordCard: 'Mot de Passe du Magasin', storePasswordDesc: 'Pour protéger le magasin, créez un mot de passe. Impossible de se connecter en tant que gérant sans.',
      currentPassword: 'Mot de Passe Actuel', currentPasswordPlaceholder: 'Laisser vide si nouveau',
      newPassword: 'Nouveau Mot de Passe', newPasswordPlaceholder: 'Mot de passe du magasin',
      confirmPassword: 'Confirmer le Mot de Passe', confirmPasswordPlaceholder: 'Ressaisir le mot de passe',
      savePassword: 'Enregistrer le Mot de Passe',
      lanCard: 'Synchronisation LAN',
      lanDesc: 'Reliez cet appareil à un autre appareil du même magasin via votre routeur pour une synchronisation instantanée de toutes les ventes, saisies et modifications.',
      lanRole: 'Rôle de cet appareil',
      lanOff: 'Désactivée',
      lanMain: 'Serveur principal (appareil avec IP fixe)',
      lanSub: 'Serveur secondaire (deuxième caisse)',
      lanLocalIps: 'Adresses IP de cet appareil',
      lanLocalIpHint: 'Définissez l\'une de ces adresses comme IP fixe dans Windows/le routeur et saisissez la même adresse sur l\'appareil secondaire.',
      lanServerIp: 'Adresse IP du serveur principal',
      lanPort: 'Port',
      lanPortHint: 'Démarre à 4512 et se décale automatiquement s\'il est occupé',
      lanStatus: 'État de la synchronisation',
      lanStatusOff: 'Synchronisation désactivée',
      lanStatusMainOn: 'Serveur principal en cours',
      lanStatusMainOff: 'Serveur principal arrêté',
      lanStatusClients: 'Appareils connectés',
      lanStatusSubOn: 'Connecté au serveur principal',
      lanStatusSubOff: 'Non connecté au serveur principal',
      lanListeningPort: 'Port réel',
      lanFirewallHint: 'Si l\'appareil secondaire ne peut pas se connecter, autorisez ce programme via le pare-feu Windows (réseau privé) : Paramètres → Confidentialité et sécurité → Pare-feu Windows → Autoriser une application via le pare-feu.',
      lanTest: 'Tester la connexion',
      lanTestWait: 'Test en cours...',
      lanTestOk: 'Connexion réussie — le serveur est disponible sur ce port',
      lanTestFail: 'Échec de la connexion',
      lanTestRefused: 'Aucun serveur sur cette adresse/ce port',
      lanTestTimeout: 'Délai dépassé — le port peut être bloqué ou l\'adresse est erronée',
      lanTestUnreachable: 'Adresse inaccessible — assurez-vous que les deux appareils sont sur le même réseau',
      lanSaved: 'Paramètres de synchronisation enregistrés',
      lanIpRequired: 'Saisissez d\'abord l\'adresse IP du serveur principal',
      usersCard: 'Gestion des Utilisateurs', usersDesc: 'Créez des utilisateurs et définissez leurs permissions.',
      addUser: 'Ajouter Utilisateur', newUser: 'Nouvel Utilisateur',
      userName: 'Nom d\'utilisateur', userNamePlaceholder: 'Nom d\'utilisateur',
      userPassword: 'Mot de passe', userPasswordPlaceholder: 'Mot de passe',
      permissions: 'Permissions',
    },
    storeDebts: {
      title: 'Dettes des Magasins', sub: 'Dettes par factures de transfert',
      storeCount: 'Magasins', owedToUs: 'Dus à Nous', weOwe: 'Nous Devons',
      netDebt: 'Dette Nette', transferInvoices: ' factures de transfert',
      owedLabel: 'Dus:', weOweLabel: 'Nous devons:', paidLabel: 'Payé:',
      totalDebt: 'Dette Totale', totalInvoices: 'Total Factures',
      paid: 'Payé', remaining: 'Reste',
      typeTransfer: 'Sortant', typeReception: 'Réception',
      statusPaid: 'Payé', statusRemaining: 'Reste',
      noTransfers: 'Aucune facture de transfert',
      payTitle: 'Payer une Tranche', total: 'Total:', paidPreviously: 'Déjà Payé:',
      payAmount: 'Montant du Paiement', confirmPay: 'Confirmer le Paiement', back: 'Retour',
      noInvoices: 'Aucune facture', invoiceDetails: 'Détails de la Facture',
      invoiceActionsPrint: 'Imprimer', invoiceActionsPay: 'Payer', invoiceActionsEdit: 'Modifier',
      invoiceActionsDelete: 'Supprimer', invoiceActionsClose: 'Fermer',
      totalDebtLabel: 'Dette Totale', emptyPlaceholder: 'Aucune facture de transfert',
    },
    branchesMonitor: {
      title: 'Moniteur des Succursales', sub: 'Surveillez et gérez toutes les succursales en un seul endroit',
      loading: 'Chargement des données...',
      online: 'En ligne', offline: 'Hors ligne',
      productCount: ' produits', saleCount: ' ventes',
      viewDetails: 'Voir les Détails',
      noData: 'Aucune donnée', noInventory: 'Aucun stock', noInvoices: 'Aucune facture',
      productsLabel: 'Produits:', invoicesLabel: 'Factures:',
      tabInventory: 'Stock', tabInvoices: 'Factures', tabPurchases: 'Achats', tabNet: 'Compte Net',
      notAvailable: 'N/A',
      sold: 'Payé', provisional: 'Provisoire',
      transferIncome: 'Revenu Transfert', transferCost: 'Coût Transfert',
      totalSales: 'Ventes Totales', totalPurchases: 'Achats Totaux',
      netAccount: 'Compte Net',
      searchPlaceholder: 'Rechercher des produits...',
      noSearchResults: 'Aucun résultat dans aucun magasin',
      outOfStock: 'Rupture', inStock: 'En stock',
      searchAll: 'Rechercher Tous les Magasins', searchAllPlaceholder: 'Recherchez par nom ou code-barres pour trouver quel magasin a le produit...',
      branchCount: 'Succursales', totalProducts: 'Total Produits', totalRevenue: 'Revenu Total',
      branchesList: 'Liste des Succursales', refresh: 'Actualiser', noBranches: 'Aucune succursale enregistrée',
      backToList: 'Retour à la Liste', products: 'Produits', invoices: 'Factures',
      sales: 'Ventes', purchases: 'Factures d\'Achat', loadingPlaceholder: 'Chargement...',
    },
    chart: { sales: 'Ventes', inventory: 'Stock', returns: 'Retours' },
    connection: {
      title: 'Paramètres de Connexion', sub: 'Connexion cloud et gestion des magasins',
      connected: 'Connecté au cloud',
      mainConnected: 'Magasin principal - connecté à Supabase',
      branchConnectedMsg: 'Succursale connectée au magasin principal',
      mainStore: 'Magasin principal', branch: 'Succursale',
      branchParenthetical: '(Succursale)',
      enterCredentials: 'Entrez vos identifiants pour commencer',
      logoutConfirm: 'Êtes-vous sûr de vouloir vous déconnecter?',
      cloudRequired: 'Veuillez vous connecter au cloud d\'abord',
      uploading: 'Téléchargement...', noChanges: 'Aucun changement à télécharger',
      uploadSuccess: 'Téléchargement réussi',
      uploadBackupBtn: 'Télécharger la sauvegarde',
      lanSubUploadMsg: 'Cet appareil est un serveur LAN sub : l\'envoi vers le cloud se fait depuis le serveur principal de cet emplacement',
      enterStorePassword: 'Entrez le mot de passe du magasin:',
      wrongPassword: 'Mot de passe incorrect',
      verificationError: 'Erreur de vérification: ',
      backupEmpty: 'La sauvegarde est vide',
      restoreSuccessMsg: 'Restauré avec succès - redémarrez l\'application',
      restoreBackupBtn: 'Restaurer la sauvegarde',
      lastSync: 'Dernière synchronisation: ',
      branchNameRequired: 'Veuillez entrer le nom de la succursale',
      passwordRequired: 'Veuillez entrer le mot de passe',
      branchCreated: 'Succursale créée - Code: ',
      passwordLabel: 'Mot de passe: ',
      viewStock: 'Voir le stock', deleteBranchBtn: 'Supprimer la succursale',
      deleteBranchConfirm1: 'Supprimer la succursale "',
      deleteBranchConfirm2: 'Vous ne pourrez pas la restaurer.',
      enterStorePasswordView: 'Entrez le mot de passe pour voir le stock:',
      noBranchStock: 'Aucun stock pour cette succursale',
      barcode: 'Code-barres', brand: 'Marque', sellPrice: 'Prix de vente',
      emailRequired: 'Veuillez entrer un email valide',
      searching: 'Recherche...', noPassword: 'Aucun mot de passe',
      savingPassword: 'Enregistrement du nouveau mot de passe...',
      userInfoTitle: 'Info Utilisateur', emailLabel: 'Email', codeLabel: 'Votre Code',
      storeTypeLabel: 'Type de Magasin', mainCodeLabel: 'Code Principal',
      statusTitle: 'Déconnecté', statusDesc: 'Entrez vos identifiants pour commencer',
      statusBadge: 'Déconnecté', connTab: 'Connexion', backupTab: 'Sauvegarde',
      branchesTab: 'Succursales', recoveryTab: 'Récupération de Compte',
      cloudStatusCard: 'État de la Connexion Cloud', cloudStatusDesc: 'La connexion cloud est automatique. Toutes vos données sont stockées en sécurité.',
      logoutBtn: 'Déconnexion', uploadCard: 'Télécharger Sauvegarde', uploadDesc: 'La sauvegarde existante dans le cloud sera remplacée...',
      pushTitle: 'Notifications Mobiles', pushDesc: 'Lorsqu\'une commande de produit ou un retour de marchandise avariée est créé, une notification instantanée est envoyée à votre téléphone même lorsque le site est fermé.',
      siteUrlLabel: 'URL du site', siteUrlPlaceholder: 'https://...',
      pushSecretLabel: 'Clé secrète', pushSecretPlaceholder: 'Votre clé secrète',
      pushSaveBtn: 'Enregistrer', pushUrlRequired: 'Veuillez saisir l\'URL du site', pushUrlInvalid: 'L\'URL du site est invalide',
      pushSecretRequired: 'Veuillez saisir la clé secrète', pushSaved: 'Paramètres enregistrés',
      autoBackup: 'Sauvegarde Auto', backupInterval: 'Intervalle (minutes)',
      min1: '1 min', min2: '2 min', min5: '5 min', min10: '10 min', min30: '30 min',
      uploadBtn: 'Télécharger Sauvegarde', restoreBtn: 'Restaurer la Sauvegarde',
      branchesCard: 'Succursales', branchesDesc: 'La gestion des succursales est réservée au magasin principal.',
      addBranch: 'Ajouter une Succursale', branchName: 'Nom de la Succursale', branchNamePlaceholder: 'Ex: Succursale Centre-Ville',
      branchPassword: 'Mot de passe', branchPasswordPlaceholder: 'Mot de passe de la succursale',
      saveBranch: 'Enregistrer', cancel2: 'Annuler', addNewBranch: 'Ajouter une Succursale', refreshBtn: 'Actualiser',
      noBranches2: 'Aucune succursale enregistrée', branchStock: 'Stock de la succursale: ',
      recoveryCard: 'Récupération de Compte / Mot de Passe', recoveryDesc: 'Entrez l\'email associé au compte...',
      search2: 'Rechercher', storeNameLabel: 'Nom du Magasin', codeResult: 'Code', passwordResult: 'Mot de passe',
      changePassword: 'Changer le Mot de Passe', searchAgain: 'Rechercher à Nouveau',
      newPasswordLabel: 'Nouveau Mot de Passe', newPasswordPlaceholder2: '4 caractères minimum',
      confirmPasswordLabel: 'Confirmer le Mot de Passe', confirmPasswordPlaceholder2: 'Ressaisir le mot de passe',
      saveNewPassword: 'Sauvegarder le Nouveau Mot de Passe',       backBtn: 'Retour',
    },
    login: {
      loginSubtitle: 'Choisir la méthode de connexion', managerTab: 'Gérant', userTab: 'Utilisateur', newAccountTab: 'Nouveau Compte', branchTab: 'Succursale',
      codeLabel: 'Code à 10 chiffres', storePassword: 'Mot de passe du magasin', passwordPlaceholder: 'Entrez le mot de passe',
      loginManager: 'Connexion en tant que Gérant', forgotPassword: 'Mot de passe oublié?',
      storeCode: 'Code du Magasin', storeCodePlaceholder: 'Entrez le code du magasin (10 chiffres)',
      usernameLabel: 'Nom d\'utilisateur', usernamePlaceholder: 'Nom d\'utilisateur',
      userPassword: 'Mot de passe', loginAsUser: 'Connexion en tant qu\'Utilisateur',
      emailLabel: 'Email', createAccount: 'Créer un Compte',
      mainStoreCode: 'Code du Magasin Principal', branchPassword: 'Mot de passe de la Succursale', branchLogin: 'Connecter en tant que Succursale',
      accountCreatedTitle: 'Compte Créé avec Succès!', accountCreatedDesc: 'Sauvegardez ce code en lieu sûr. Vous en aurez besoin pour récupérer vos données.',
      accountCreatedWarning: 'Ce code ne peut pas être récupéré. Notez-le ou photographiez-le.', enterApp: 'Entrer dans l\'App',
      recoveryTitle: 'Récupération de Mot de Passe', recoverySubtitle: 'Entrez votre email pour voir le code et le mot de passe',
      searchBtn: 'Rechercher', backToLogin: 'Retour à la Connexion',
      storeNameSpan: 'Nom du Magasin:', codeSpan: 'Code:', passwordSpan: 'Mot de passe:',
      loginWithCode: 'Connexion avec le Code', resetPassword: 'Réinitialiser le Mot de Passe',
      searchAgainLink: 'Rechercher à Nouveau', newPasswordTitle: 'Définir un Nouveau Mot de Passe',
      newPassLabel: 'Nouveau Mot de Passe', newPassPlaceholder: 'Entrez le nouveau mot de passe',
      confirmPassLabel: 'Confirmer le Mot de Passe', confirmPassPlaceholder: 'Ressaisir le mot de passe',
      saveNewPass: 'Sauvegarder le Nouveau Mot de Passe', backLink: 'Retour',
    },
  },
  zh: {
    appTitle: 'ZMT PIECE',
    online: '在线', offline: '离线',
    nav: {
      main: '主页', manage: '管理', finance: '财务', system: '系统',
      dashboard: '控制面板', brands: '品牌', sales: '销售', invoices: '发票',
      inventory: '库存', suppliers: '供应商', customers: '客户', debts: '债务',
      supplierReturns: '损坏商品',
      netAccount: '净账户', discounts: '折扣', returns: '退货',
      reports: '报告', backup: '备份', settings: '设置',
      connection: '连接设置',
      storeDebts: '商店债务', branchesMonitor: '分支监控', sharedInventory: '共享库存',
      orders: '订单',
    },
    dash: {
      title: '控制面板', sub: '销售与库存概览',
      s1: '库存物品', s2: '本月发票', s3: '注册客户', s4: '总销售额',
      chart: '销售额与库存和退货对比', months: '月数:',
      m1: '月', m2: '月', m3: '月', m4: '月', m5: '月', m6: '月',
      netProfit: '净利润', cost: '成本',
      lowStockItems: ' 个产品低于库存阈值',
      andMore: '和', moreItems: '更多...',
      lowStock: '低库存产品', estimatedProfit: '预计总利润', monthSales: '本月销售额', profitCostDist: '利润与成本分布',
    },
    brands: { title: '品牌', sub: '管理汽车零部件品牌', search: '搜索品牌...', favAdd: '添加到收藏', favRemove: '从收藏中移除' },
    sales: {
      title: '销售', sub: '创建新的销售发票',
      searchParts: '搜索零件', searchPlaceholder: '按零件名称或编号搜索...',
      emptySearch: '输入以开始搜索零件',
      cart: '购物车', cartEmpty: '购物车为空', total: '总计:',
      checkout: '结账',
    },
    invoices: {
      title: '发票', sub: '所有销售和采购发票',
      search: '搜索发票...', newInvoice: '新建发票',
      col1: '发票号', col2: '日期', col3: '客户', col4: '金额', col5: '状态', col6: '操作',
      empty: '暂无发票',
    },
    inventory: {
      title: '库存', sub: '管理零件库存',
      search: '搜索库存...', add: '添加零件', export: '导出',
      col1: '代码', col2: '零件名称', col3: '品牌', col4: '数量', col5: '进价', col6: '售价', col7: '操作',
      empty: '库存为空',
    },
    suppliers: {
      title: '供应商', sub: '管理零件供应商',
      search: '搜索供应商...', add: '添加供应商',
      col1: '名称', col2: '电话', col3: '邮箱', col4: '品牌', col5: '余额', col6: '操作',
      empty: '暂无供应商',
      addModalTitle: '添加新供应商', editModalTitle: '编辑供应商',
      formName: '供应商名称', formNamePl: '例如：XX汽配公司',
      formPhone: '电话号码', formAddress: '地址', formAddressPl: '例如：利雅得 - 法赫德国王路',
      cancel: '取消', save: '保存',
    },
    customers: {
      title: '客户', sub: '管理客户',
      search: '搜索客户...', add: '添加客户',
      col1: '名称', col2: '电话', col3: '地址', col4: '购买', col5: '余额', col6: '操作',
      empty: '暂无客户',
      addModalTitle: '添加新客户', editModalTitle: '编辑客户',
      formName: '客户名称', formNamePl: '例如：艾哈迈德',
      formPhone: '电话号码', formAddress: '地址', formAddressPl: '例如：阿尔及尔',
      formType: '客户类型', typeUnit: '零售', typeWhole: '批发', formTypeHelp: '设置销售页面的默认价格（可在购物车中按产品更改）',
      formDiscount: '折扣 (%)', formDiscountHelp: '从0.001%到100% - 可选',
      cancel: '取消', save: '保存',
      totalDebts: '客户总债务',
      totalPaid: '已付总额',
      totalCount: '客户总数',
    },
    debts: {
      title: '债务', sub: '管理债务与应收款',
      youOwe: '欠供应商的债务', youOwed: '客户欠您的债务',
      noDebts: '无未偿债务',
      logTitle: '债务记录',
      col1: '日期', col2: '类型', col3: '方', col4: '金额', col5: '状态', col6: '操作',
      empty: '无交易',
      totalInvoices: '发票总额', totalPurchases: '采购总额',
      balance: '余额', paid: '已付', paidToThem: '已付给他们',
      invoices: '发票', noInvoices: '无发票',
      payments: '付款', noPayments: '无付款',
      net: '净应收', chooseSide: '从列表中选择一方', back: '返回',
      searchPlaceholder: '按姓名或电话号码搜索...', tabCustomers: '客户', tabSuppliers: '供应商',
      totalCustomerDebts: '客户欠您的债务', totalSupplierDebts: '您欠供应商的债务',
    },
    net: {
      title: '净账户', sub: '财务摘要',
      s1: '总销售额', s2: '总采购额', s3: '净利润', s4: '待处理金额',
      logTitle: '交易记录',
      col1: '日期', col2: '描述', col3: '类型', col4: '金额', col5: '余额',
      empty: '无近期交易',
      customerDebt: '欠我们的', supplierDebt: '我们欠的',
      purchaseInvoice: '采购发票', purchaseFrom: '发票来自',
      transferInvoice: '转移发票', receptionInvoice: '接收发票',
      purchases: '采购', paymentFrom: '付款来自',
      paymentNote: '付款', paymentWalkin: '客户付款',
      salesPaid: '销售（已付）', paymentTo: '付款给',
      paymentToSupplier: '付给供应商', expenses: '支出',
      stockPurchase: '库存采购', stockPurchases: '库存采购',
      totalExpenses: '总支出',
      marginTitle: '利润率', periodLabel: '期间：', today: '今天',
      totalMargin: '总利润率', periodMargin: '期间利润率', allTime: '自始至终',
      cashLabel: '现金', marginLabel: '利润', ccpPaidNote: '通过CCP支付',
    },
    discounts: {
      title: '折扣', sub: '管理优惠和折扣',
      add: '添加折扣',
      col1: '产品', col2: '折扣率', col3: '开始日期', col4: '结束日期', col5: '状态', col6: '操作',
      empty: '暂无折扣',
      unregistered: '未注册', deleteConfirm: '删除此折扣记录？',
      totalDiscounts: '折扣总数', totalValue: '折扣总价值',
      colDate: '日期', colInvoice: '发票', colCustomer: '客户', colType: '类型', colRatio: '比例', colAmount: '金额', colActions: '操作',
    },
    returns: {
      title: '退货', sub: '管理退货和退款',
      add: '记录退货', export: '导出',
      col1: '退货号', col2: '发票', col3: '零件', col4: '数量', col5: '原因', col6: '日期', col7: '操作',
      empty: '暂无退货',
      time: '时间', defaultReason: '发票调整',
      deleteConfirm: '删除此退货记录？',
      noReturnsExport: '无退货可导出',
      exportSuccess: '退货导出成功',
      exportError: '保存时出错: ',
    },
    supplierReturns: {
      title: '损坏商品', sub: '管理退回给供应商的损坏商品',
      export: '导出', filterAll: '全部',
      statusPending: '退回中', statusReturned: '已退回', statusNotReturned: '未退回',
      colProduct: '商品', colQty: '数量', colAmount: '金额',
      colSupplier: '供应商', colInvoice: '发票', colDate: '日期',
      colStatus: '状态', colActions: '操作', colStore: '店铺/分店',
      empty: '暂无退回申请',
      noProduct: '商品不存在', noInvoice: '该商品没有采购发票',
      stock: '库存', supplier: '供应商', qty: '退回数量', invoice: '入库发票',
      note: '备注', notePlaceholder: '可选...',
      modalTitle: '将商品退回给供应商',
      notOwned: '无法修改其他店铺的申请',
      invalidQty: '请输入有效数量', qtyExceedsStock: '数量超过当前库存',
      qtyExceedsInvoice: '数量超过该发票上的数量',
      created: '退回申请已登记',
      confirmReturned: '确认已退回？\n将从库存中扣减数量、减少供应商发票并影响净账户。',
      confirmNotReturned: '确认未退回？\n库存和发票均不会发生变化。',
      insufficientStock: '当前库存不足', invoiceMissing: '未找到采购发票',
      lineMissing: '商品已不在该发票中',
      returnedSuccess: '已退回：从库存扣减并减少了供应商发票',
      delete: '删除申请', deleteReverse: '撤销退回',
      deleteConfirm: '删除退回申请？', deleteReturnedConfirm: '删除申请？\n所有影响将被撤销（恢复库存并增加发票）。',
      deleted: '申请已删除',
      refundNote: '供应商商品退回',
      noExport: '没有可导出的数据', exportSuccess: '导出成功', exportError: '保存时出错: ',
    },
    reports: {
      title: '报告', sub: '高级销售和库存报告',
      c1: '销售报告', c1desc: '每日、每周和每月销售分析',
      c2: '库存报告', c2desc: '库存状态和零件流动',
      c3: '利润报告', c3desc: '利润和亏损',
      c4: '客户报告', c4desc: '客户群分析',
      dailySales: '每日销售', categoryDist: '按类别销售',
      bestSellers: '最畅销产品', brandSales: '按品牌销售',
      dailyBreakdown: '每日销售明细',
      period: '期间:', exportPDF: '导出PDF',
      period7: '最近7天', period30: '最近30天', period90: '最近3个月',
      period365: '最近一年', periodAll: '全部',
      noSales: '无销售', profit: '利润',
      returnsPieces: '退货（件）', pieces: ' 件',
      reportTitle: '销售与退货报告',
      periodLabel: '期间:', totalSales: '总销售额: ',
      totalProfit: '总利润: ', salesInvoiceCount: '销售发票数: ',
      returnsCount: '退货数: ', netSales: '净销售额: ',
      dailyDetails: '每日明细:', invoicesWord: ' 张发票',
      period2: '时段：', thisWeek: '本周', thisMonth: '本月', thisYear: '今年', custom: '自定义', specificDay: '指定日期',
      from: '从：', to: '到：', date2: '日期：', totalSales2: '总销售额', invoices2: '张发票', pieces2: '件',
      profit2: '利润', paid2: '已付', remaining2: '剩余', returnCount: '退货数量', value: '价值',
      netSales2: '净销售额', returnRatio: '退货率', profitMargin: '利润率',
      totalProfitMargin: '总利润率', ratioLabel: '比率', allTimeLabel: '总合计',
      salesVsReturns: '销售 vs 退货', net: '净', dailySalesVsReturns: '每日销售 vs 退货',
      salesTrend: '销售趋势', returnsTrend: '退货趋势', salesByCategory: '按类别销售',
      returnsByReason: '按原因退货', topProducts: '热销产品',
      productCol: '产品', barcodeCol: '条码', qtySoldCol: '已售数量', totalCol: '总计', profitCol: '利润',
      dailyDetail2: '每日销售与退货明细', dateCol: '日期',
      salesInvoicesCol: '销售发票', piecesSoldCol: '已售件数', salesValueCol: '销售价值',
      returnsCol: '退货', piecesReturnedCol: '退回件数', netDayCol: '当日净额',
    },
    reportsNet: {
      title: '净账户', period: '期间：', year: '年份：', specificDate: '指定日期',
      range: '范围', sales: '总销售额', purchases: '总采购额',
      expenses: '总支出', profit: '净利润',
      periodDebt: '待定（期间）', currentDebt: '待定（当前）',
      customerDebt: '欠我们的', supplierDebt: '我们欠的',
      periodMargin: '期间利润', totalMargin: '总利润',
    },
    backup: {
      title: '备份', sub: '管理数据备份',
      c1: '创建备份', c1desc: '保存数据库副本',
      c1btn: '<i class="fas fa-save"></i> 导出',
      c2: '恢复备份', c2desc: '从以前的备份恢复数据',
      c2btn: '<i class="fas fa-upload"></i> 导入',
      prevTitle: '以前的备份',
      empty: '没有以前的备份',
      restore: '恢复', creating: '正在创建备份...',
      operationCancelled: '操作已取消',
      createSuccess: '✓ 备份已创建 — ',
      createFailed: '✗ 保存失败: ',
      readingFile: '正在读取文件...',
      readFileFailed: '✗ 读取失败: ',
      invalidFile: '✗ 无效文件 — 无数据',
      restoreConfirm: '恢复备份？',
      store: '商店: ', date: '日期: ',
      content: '内容:\n',
      products: '产品', invoices: '发票',
      customers: '客户', suppliers: '供应商',
      payments: '付款', returns: '退货',
      discounts: '折扣', unknown: '未知',
      dataWarning: '⚠️ 所有当前数据将被完全替换！',
      restoreCancelled: '恢复已取消',
      restoreSuccess: '✓ 数据恢复成功。重新打开页面以刷新。',
      restoreError: '✗ 错误: ',
      readFileFailed2: '✗ 读取失败: ',
      invalidFile2: '✗ 无效文件',
      restoreFromFileConfirm: '恢复',
      restoreFromFileWarning: '所有当前数据将被替换。',
      restoreFromFileSuccess: '✓ 已从恢复 ',
      deleteAllConfirm: '⚠️ 删除所有数据？',
      deleteAllDetails: '所有产品、发票、客户、供应商、付款、退货和折扣将被清除。',
      deleteAllWarning: '此操作不可撤销！',
      deleteAllBackupHint: '请在继续前创建备份。',
      deleteAllFinalConfirm: '最终确认：删除所有数据？\n没有备份将无法恢复。',
      deleteAllDone: '✓ 所有数据已清除。使用"恢复"来恢复数据。',
      clearData: '清除数据', clearDataDesc: '清除应用中所有数据 — 用于测试备份恢复',
      deleteAllBtn: '删除所有数据',
    },
    sharedInventory: {
      title: '共享库存', sub: '查看主店和关联分店库存',
      searchAll: '搜索所有商店', searchAllPlaceholder: '按名称或条码搜索哪个商店有该产品...',
      loading: '加载数据中...', backToList: '返回列表',
    },
    migration: {
      title: '从以前的程序导入', cardTitle: '从以前的程序导入',
      cardDesc: '从其他程序导入数据（CSV、Excel、数据库...）',
      cardBtn: '从以前的程序导入',
      dropHere: '拖放文件到此处或点击浏览',
      supportedFormats: '支持：CSV、Excel、JSON、XML、SQL、SQLite (.db)、dBASE (.dbf)、Firebird (.fdb)、任何文本',
      reading: '读取文件中...', readError: '读取文件出错',
      selectTable: '选择包含零件的表：',
      preview: '数据预览', columns: '列',
      mapColumns: '列映射',
      mapHint: '已尝试自动映射 — 请检查并按需调整',
      noMapping: '未映射',
      back: '上一步', next: '下一步',
      totalRows: '总行数：', mappedFields: '已映射字段：',
      moreRows: '更多行...',
      importBtn: '导入数据',
      needNameOrBarcode: '至少需要映射产品名称或条码',
      importing: '导入中...', importSuccess: '导入成功完成',
      productsImported: '个产品已导入', importError: '导入错误',
      cannotRead: '无法读取文件', parseError: '解析文件错误',
      unsupportedDbType: '此数据库类型需要手动导出',
      exportHint: '从旧程序导出为CSV或Excel格式，然后重试',
      aiAnalyzing: 'AI分析中...',
      aiError: 'AI错误',
      aiDone: 'AI分析完成',
      aiAnalyzed: '已由AI分析',
      chooseMode: '选择处理方法',
      modeHint: '本地处理快速，使用自动匹配。AI处理智能分析数据以理解非结构化文本。',
      localMode: '本地处理',
      localHint: '快速自动匹配',
      aiMode: 'AI处理',
      aiHint: '通过您选择的AI提供商进行智能分析',
      aiRequiresKey: '* AI处理需要在设置中配置API密钥',
      firebirdNoPath: '无法访问Firebird数据库文件路径',
      firebirdNoTables: '数据库中找不到可读的表',
      firebirdOpenError: '无法打开Firebird数据库',
      firebirdTableError: '无法读取表',
      selectRole: '该表包含什么？',
      roleHint: '选择数据类型以便正确导入',
      roleProducts: '零件 / 产品',
      roleCustomers: '客户',
      roleSuppliers: '供应商',
      needName: '至少需要映射名称字段',
      importDone: '导入成功完成',
      roleSalesInvoices: '销售发票',
      rolePurchaseInvoices: '采购发票',
      importedNote: '已导入',
      oldInvoiceNote: '导入的发票',
      oldPaymentNote: '导入的付款',
      restoringBackup: '正在恢复备份 (gbak)...',
      loadingBrands: '正在读取品牌...',
      brandEmpty: '无品牌',
      fullImportPanelTitle: '完整数据导入',
      fullImportPanelDesc: '检测到 Sable Stock / Gestion Stock 数据库 — 您可以一次性导入所有内容：客户、供应商、带价格的产品、发票和退货。',
      fullImportBtn: '完整导入',
      fullImportPopupTitle: '选择要导入的品牌',
      fullImportPopupHint: '选择您要导入产品的品牌。无品牌的产品始终会被导入。',
      selectAll: '全选',
      cancelImport: '取消',
      confirmImport: '开始导入',
      creatingBackup: '导入前正在创建备份...',
      productsNone: '未导入任何产品（请检查品牌选择）',
      fullImportDone: '完整导入完成',
      returnsCount: '退货',
      avoirReason: '退货 (Avoir)',
      walkin: '散客',
    },
    brandCat: { brand: '品牌', category: '选择零件类型', searchPlaceholder: '搜索类型...', addProduct: '添加产品' },
    catProducts: { title: '产品', sub: '可用产品', searchPlaceholder: '搜索产品...', addProduct: '添加产品', empty: '此分类无产品', addInvoiceTitle: '添加产品到发票', scanPlaceholder: '扫描条码...', scannerReady: '准备扫描', searchProduct: '搜索产品', newProduct: '新产品', searchExisting: '按名称或条码搜索', searchExistingPlaceholder: '产品名称或条码...', name: '产品名称', namePlaceholder: '零件名称', barcode: '条码', barcodePlaceholder: '输入条码', generate: '生成', qty: '数量', buyPrice: '进价', sellPrice: '售价', supplier: '供应商', supplierPlaceholder: '按名称搜索供应商...', cancel: '取消', addToCart: '添加到发票购物车', cartTitle: '发票购物车', total: '总计:', clear: '清空',       confirmInvoice: '确认发票', fiscalStamp: '印花税 (Timbre Fiscal)', wholesalePrice: '批发价' },
    settings: {
      title: '设置', sub: '应用程序设置',
      general: '常规设置',
      storeName: '店铺名称', currency: '货币', language: '语言',
      notif: '低库存通知',       autoBackup: '自动备份',
      info: '关于',
      version: '版本', developer: '开发者', company: '公司', lastUpdate: '最后更新',
    },
    chart: { sales: '销售额', inventory: '库存', returns: '退货' },
    connection: {
      title: '连接设置', sub: '云连接和商店管理',
    },
    btn: {
      newInvoice: '新建发票', addPart: '添加零件', export: '导出',
      addSupplier: '添加供应商', addCustomer: '添加客户', addDiscount: '添加折扣',
      addReturn: '记录退货',
    },
    common: {
      save: '保存', cancel: '取消', delete: '删除', edit: '编辑', confirm: '确认',
      close: '关闭', print: '打印', loading: '加载中...', processing: '处理中...',
      noResults: '无结果', empty: '空', search: '搜索',
      page: '页', of: '/', product: '产品', piece: '件', invoice: '发票',
      qty: '数量', total: '总计', paid: '已付', remaining: '剩余', debt: '债务',
      date: '日期', name: '名称', status: '状态', actions: '操作',
      yes: '是', no: '否', success: '成功', error: '错误', warning: '警告',
      areYouSure: '确定吗？', stock: '库存', price: '价格',
      addItem: '添加', removeItem: '移除', clearCart: '清空购物车',
      ready: '就绪', done: '完成', notFound: '未找到', outOfStock: '缺货',
      lowStock: '库存不足', new: '新', provisional: '临时',
      paidFull: '全额付款', paidPartial: '部分付款', unpaid: '未付款',
      manual: '手动', customer: '客户',
      back: '返回', pay: '付款', payFull: '全额付款', searchAll: '搜索全部', refresh: '刷新', confirmPay: '确认付款',
      barcode: '条码', brand: '品牌', category: '分类', supplier: '供应商',
      address: '地址', phone: '电话', email: '邮箱', username: '用户名', password: '密码',
      generate: '生成', fiscalStamp: '税票', cart: '购物车', clear: '清空',
      subtotal: '小计', discount: '折扣', totalAfterDiscount: '折扣后总额',
      payNow: '已付金额', remainingDebt: '剩余(债务)', fullPayment: '全额付款', noPayment: '无付款',
      real: '真实', formal: '形式', customerDiscount: '客户折扣', additionalDiscount: '额外折扣',
    },
    sales: {
      title: '销售', sub: '创建新的销售发票',
      searchParts: '搜索零件', searchPlaceholder: '按零件名称或编号搜索...',
      emptySearch: '输入以开始搜索零件',
      emptyResults: '无搜索结果', emptyProducts: '无产品',
      cart: '购物车', cartEmpty: '购物车为空', total: '总计:',
      checkout: '结账',
      unavailable: '不可用', lowStockTip: '库存不足',
      scannerReady: '就绪', scannerDone: '完成', scannerNotFound: '未找到', scannerUnavailable: '不可用',
      noCustResults: '无结果', discount: '折扣',
      del: '删除',
      fullyPaid: '全额付款', partialPay: '部分付款', enterPaid: '输入已付金额',
      cartEmptyAlert: '购物车为空', notAvailableQty: '所需数量不可用', available: '可用:',
      paidExceedsTotal: '已付金额不能超过总计',
      fullPaymentNote: '销售时全额付款', partialPaymentNote: '销售时部分付款',
      discountType: '客户', discountManual: '手动',
      clearCartConfirm: '清空购物车？',
      customer: '客户', customerPlaceholder: '搜索客户...', unregistered: '未注册客户', remove: '移除',
      cartTitle: '购物车', subtotal: '小计', customerDiscount: '客户折扣', additionalDiscount: '额外折扣',
      totalLabel: '总计', paidLabel: '已付金额', payFull: '全额付款', remainingLabel: '剩余',
      clear: '清空', checkout: '结账', emptyCartTitle: '购物车为空', emptyCartHint: '扫描商品条码或从产品列表选择',
      scanPlaceholder: '扫描条码...', searchPlaceholder2: '按名称或条码搜索...', productsCount: '0 件产品', multiBatches: '多批次', mixedPrice: '混合价格', unit: '件', wholesale: '批发',
      payMethod: '支付方式', payCash: '现金', payCcp: 'CCP', payBoth: '两者',
      cashAmount: '现金金额', ccpAmount: 'CCP金额',
    },
    orders: {
      title: '订单', sub: '向供应商订购缺失零件',
      tabMine: '我的订单', tabBranches: '分店订单',
      suggestions: '库存不足建议', noSuggestions: '没有库存不足或缺货的产品——很好！',
      search: '按名称或条码搜索...',
      all: '全部', today: '今天', week: '本周', month: '本月', year: '今年',
      refresh: '刷新',
      empty: '暂无订单——请从建议或搜索中添加',
      statusPending: '待处理', statusDone: '已完成', statusNotAvailable: '无货',
      btnDone: '已完成', btnNotAvailable: '无货', btnDelete: '删除',
      deleteConfirm: '删除此订单？',
      cloudRequired: '查看分店订单需要云连接',
      loading: '正在加载分店订单...',
      noBranchOrders: '暂无分店订单',
    },
    invoices: {
      title: '发票', sub: '所有销售和采购发票',
      search: '搜索发票...', newInvoice: '新建发票',
      col1: '发票号', col2: '日期', col3: '客户', col4: '金额', col5: '状态', col6: '操作',
      empty: '暂无发票', noMatch: '无匹配发票',
      resultsInfo: ' 张发票',
      typeSale: '销售发票', typeSupplier: '供应商发票', typeWaybill: '发货单',
      typeProforma: '形式发票', typeDispatch: '发送单', typeTransfer: '转移发票',
      typeReception: '接收发票', typePurchase: '采购发票',
      badgeProvisional: '临时',
      itemCount: '件', paidLabel: '已付', unpaidLabel: '未付', remainingLabel: '剩余',
      pageInfo: '页', allowPopups: '请允许弹出窗口以进行打印',
      cannotPayReception: '不能为接收发票添加付款',
      cannotPayProforma: '不能为形式发票添加付款',
      fullyPaidAlert: '发票已全额支付', invalidAmount: '金额无效',
      transferPayNote: '转移发票付款', regularPayNote: '通过发票付款',
      paymentSaved: '付款记录成功',
      cannotEditDispatch: '不能编辑发送单',
      cannotEditReception: '不能编辑接收发票',
      cannotEditProformaWaybill: '不能编辑临时发货单',
      editTitle: '编辑发票',
      editHelpSupplier: '供应商发票：增加数量增加库存和供应商余额。',
      editHelpCustomer: '编辑数量。增加从库存扣除，减少返回库存。',
      scanPlaceholder: '扫描条码或输入产品名称...',
      editColProduct: '产品', editColCurrentQty: '当前数量', editColNewQty: '新数量',
      saveEdits: '保存编辑', cancelEdit: '取消',
      scanDone: '完成', scanReady: '就绪', scanNotFound: '未找到', resultCount: '结果',
      availableStock: '可用:', notInStock: '无库存', badgeNew: '新',
      cannotBelowZero: '不能将"..."的数量设为零以下',
      insufficientStock: '"..."库存不足',
      noQtyChanged: '未更改任何数量',
      invoiceEdited: '发票编辑成功',
      deleteConfirm: '确定删除此发票？产品将退回库存。',
      cannotDeleteReception: '不能删除接收发票',
      cannotDeleteSold: '不能删除 - 产品"..."已被售出',
      invoiceDeleted: '发票已删除',
      transferEditTitle: '编辑转移发票',
      transferEditHelp: '编辑数量。增加减少您的库存并添加到接收方。减少添加到您的库存。',
      currentTotal: '当前总计:', editColSellPrice: '售价',
      newTotal: '新总计:', diff: '差额:',
    },
    inventory: {
      title: '库存', sub: '管理零部件库存',
      search: '搜索库存...', add: '添加零件', export: '导出',
      col1: '编码', col2: '零件名称', col3: '品牌', col4: '数量', col5: '进价', col6: '售价', col7: '操作',
      empty: '库存为空',
      transferBranch: '转移到分店或总店',
      transferMain: '转移到分店',
      scannerReady: '准备扫描', scannerProcessing: '处理中...',
      scannerFound: '找到:', scannerDone: '扫描完成',
      scannerNewBarcode: '新产品 - 条码', scannerNew: '新产品',
      noResults: '无结果',
      enterName: '请输入产品名称', enterBarcode: '请输入条码',
      clearCartConfirm: '清空发票购物车？', cartEmpty: '发票购物车为空',
      invoiceSaved: '发票已登记，金额', fiscalStamp: '印花税',
      includes: '包含', productUnit: '产品', pieceUnit: '件',
      editLabelName: '产品名称', editLabelBarcode: '条码', editLabelBrand: '品牌',
      editLabelCategory: '类别', editLabelQty: '数量', editLabelBuyPrice: '进价', editLabelSellPrice: '售价', editLabelWholesale: '批发价',
      editTitle: '编辑产品',
      deleteConfirm: '确定删除此产品？',
      importSuccess: '已导入', importSuccessEnd: '件产品',
      importCost: '采购成本:', importRecorded: '已记录到净账户',
      importFailed: '导入失败。请检查文件格式。',
      addWithInvoice: '添加库存 + 发票', transferBtn: '转移产品', exportCSV: '导出CSV', importCSV: '导入CSV',
      addTitle: '添加库存 + 发票', scanPlaceholder2: '扫描条码...',
      searchExisting: '搜索现有产品（按名称或条码）', searchExistingPlaceholder: '产品名称或条码...',
      category: '类别', name: '产品名称', barcode: '条码', generate2: '生成',
      qty: '数量', buyPrice: '进价', sellPrice: '售价', wholesalePrice: '批发价', supplierOptional: '供应商（可选）',
      supplierSearchPlaceholder: '搜索供应商...', addToCart: '添加到发票购物车',
      invoiceCart: '发票购物车', fiscalStamp2: '印花税', totalLabel: '总计:',
      clear2: '清空', confirmInvoice: '确认发票', categoryCol: '类别',
    },
    transfer: {
      loading: '加载中...', chooseDest: '选择目的地', mainStore: '总店',
      loadError: '加载目的地时出错',
      scannerProcessing: '处理中...', scannerFound: '找到:', scannerDone: '扫描完成',
      scannerNotFound: '没有条码为', scannerNotInStock: '的产品', scannerNotFoundShort: '未找到',
      noResults: '无结果', stock: '库存:',
      selectDestFirst: '请先选择目的地商店',
      searchFirst: '请先搜索产品', qtyZero: '数量必须大于零',
      qtyExceeds: '请求的数量', qtyExceedsAvail: '超过可用量',
      buyPriceZero: '进价必须大于零',
      donationLabel: '免费发送产品（捐赠）',
      donationWarning: '警告：转移发票将显示余额为0，接收发票对接收方也将显示余额为0。',
      donationNote: '捐赠（免费转移）',
      available: '可用:',
      clearCartConfirm: '清空转移购物车？', scannerReady: '准备扫描',
      selectDest: '请选择目的地商店', cartEmpty: '转移购物车为空',
      paidExceedsTotal: '已付金额不能超过总计',
      confirmTitle: '确认转移:', confirmFrom: '从:', confirmTo: '到:',
      confirmProducts: '产品:', confirmTotal: '总计:', confirmPaid: '已付:', confirmRemaining: '剩余(债务):',
      confirmContinue: '是否继续？',
      productNotFound: '产品"..."在库存中未找到',
      stockLessThanNeeded: '"..."的可用量不足',
      payNote: '付款 - 转移到',
      transferSuccess: '转移发票创建成功！',
      transferredProducts: '已转移产品:', transferTotal: '总计:',
      transferPaid: '已付:', transferRemaining: '剩余(债务):',
      transferError: '转移时出错:',
      sub: '在商店之间转移产品并记录债务',
      senderStore: '发送商店', destination: '目的地',
      chooseDestination2: '-- 选择目的地 --', selectDestination: '选择目标商店',
      scanPlaceholder2: '扫描条码...', searchExisting: '在库存中搜索产品（按名称或条码）',
      searchPlaceholder2: '产品名称或条码...', productDataTitle: '转移产品数据',
      productName: '产品名称', availableQty: '可用数量', transferQty: '转移数量',
      buyPrice: '进价', sellPrice2: '售价', brand2: '品牌', category2: '类别',
      addToCart2: '添加到转移购物车', transferCart: '转移发票购物车', totalLabel2: '总计:',
      clear3: '清空', paymentSection: '付款与债务', payNow2: '已付金额',
      remainingDebt2: '剩余(债务):', fullPayment2: '全额付款', noPayment2: '无付款',
      confirmTransfer: '确认并执行转移发票',
    },
    settings: {
      title: '设置', sub: '应用设置',
      general: '常规设置',
      storeName: '商店名称', currency: '货币', language: '语言',
      notif: '低库存通知', autoBackup: '自动备份',
      info: '关于',
      version: '版本', developer: '开发者', company: '公司', lastUpdate: '最后更新',
      settingsSaved: '设置已保存',
      wrongPassword: '当前密码不正确',
      verifyError: '验证错误:',
      passwordMinLength: '密码至少需要4个字符',
      passwordsNoMatch: '密码不匹配',
      passwordSaved: '密码保存成功',
      errorPrefix: '错误:',
      colPage: '页面', colView: '查看', colEdit: '编辑', colDelete: '删除',
      enterUsername: '请输入用户名', enterPassword: '请输入密码',
      userUpdated: '用户更新成功', userCreated: '用户创建成功',
      noPerms: '无权限',
      delete_user_confirm: '确定删除用户"..."？',
      storeAddress: '商店地址', phoneNumber: '电话号码', enableFiscalStamp: '在发票中启用印花税',
      fiscalRatio: '比例:', fiscalMin: '最低 5 DA - 最高 10,000 DA',
      fiscalPercent: '%（基本系统为0%）', lowStockThreshold: '低库存阈值',
      lowStockHint: '低于此数量视为低库存', saveSettings: '保存设置',
      storePasswordCard: '商店密码', storePasswordDesc: '为保护商店，请创建密码。没有密码无法以经理身份登录。',
      currentPassword: '当前密码', currentPasswordPlaceholder: '如果是新密码请留空',
      newPassword: '新密码', newPasswordPlaceholder: '商店密码',
      confirmPassword: '确认密码', confirmPasswordPlaceholder: '再次输入密码',
      savePassword: '保存密码',
      lanCard: '局域网同步',
      lanDesc: '通过路由器将此设备与同一商店的另一台设备连接，实时同步所有销售、入库和编辑操作。',
      lanRole: '设备角色',
      lanOff: '已禁用',
      lanMain: '主服务器（静态IP设备）',
      lanSub: '从服务器（第二个收银台）',
      lanLocalIps: '本设备IP地址',
      lanLocalIpHint: '在Windows/路由器设置中将其中一个设为静态IP，并在从设备上输入相同地址。',
      lanServerIp: '主服务器IP地址',
      lanPort: '端口',
      lanPortHint: '从4512开始，若被占用则自动更换',
      lanStatus: '同步状态',
      lanStatusOff: '同步已禁用',
      lanStatusMainOn: '主服务器运行中',
      lanStatusMainOff: '主服务器已停止',
      lanStatusClients: '已连接设备',
      lanStatusSubOn: '已连接主服务器',
      lanStatusSubOff: '未连接主服务器',
      lanListeningPort: '实际端口',
      lanFirewallHint: '如果从设备无法连接，请允许此程序通过Windows防火墙（专用网络）：设置 → 隐私和安全 → Windows防火墙 → 允许应用通过防火墙。',
      lanTest: '测试连接',
      lanTestWait: '正在测试...',
      lanTestOk: '连接成功 — 服务器在此端口可用',
      lanTestFail: '连接失败',
      lanTestRefused: '此地址/端口上没有服务器',
      lanTestTimeout: '超时 — 端口可能被阻止或地址错误',
      lanTestUnreachable: '地址无法访问 — 请确保两台设备在同一网络',
      lanSaved: '同步设置保存成功',
      lanIpRequired: '请先输入主服务器IP地址',
      usersCard: '用户管理', usersDesc: '创建用户并设置应用权限。',
      addUser: '添加用户', newUser: '新用户',
      userName: '用户名', userNamePlaceholder: '用户名',
      userPassword: '密码', userPasswordPlaceholder: '密码',
      permissions: '权限',
    },
    storeDebts: {
      title: '商店债务', sub: '按转移发票分类的债务',
      storeCount: '商店数', owedToUs: '应收', weOwe: '应付',
      netDebt: '净债务', transferInvoices: ' 张转移发票',
      owedLabel: '应收:', weOweLabel: '应付:', paidLabel: '已付:',
      totalDebt: '总债务', totalInvoices: '总发票',
      paid: '已付', remaining: '剩余',
      typeTransfer: '转出', typeReception: '接收',
      statusPaid: '已付', statusRemaining: '剩余',
      noTransfers: '无转移发票',
      payTitle: '支付分期', total: '总计:', paidPreviously: '已付:',
      payAmount: '支付金额', confirmPay: '确认付款', back: '返回',
      noInvoices: '无发票', invoiceDetails: '发票详情',
      invoiceActionsPrint: '打印', invoiceActionsPay: '付款', invoiceActionsEdit: '编辑',
      invoiceActionsDelete: '删除', invoiceActionsClose: '关闭',
      totalDebtLabel: '总债务', emptyPlaceholder: '无转移发票',
    },
    branchesMonitor: {
      title: '分支监控', sub: '从一处监控和管理所有分支',
      loading: '加载数据中...',
      online: '在线', offline: '离线',
      productCount: ' 件产品', saleCount: ' 笔销售',
      viewDetails: '查看详情',
      noData: '无数据', noInventory: '无库存', noInvoices: '无发票',
      productsLabel: '产品:', invoicesLabel: '发票:',
      tabInventory: '库存', tabInvoices: '发票', tabPurchases: '采购', tabNet: '净账户',
      notAvailable: '无',
      sold: '已付', provisional: '临时',
      transferIncome: '转移收入', transferCost: '转移成本',
      totalSales: '总销售', totalPurchases: '总采购',
      netAccount: '净账户',
      searchPlaceholder: '搜索产品...',
      noSearchResults: '所有商店无结果',
      outOfStock: '缺货', inStock: '有库存',
      searchAll: '搜索所有商店', searchAllPlaceholder: '按名称或条码搜索哪个商店有该产品...',
      branchCount: '分支数', totalProducts: '总产品数', totalRevenue: '总收入',
      branchesList: '分支列表', refresh: '刷新', noBranches: '无注册分支',
      backToList: '返回列表', products: '产品', invoices: '发票',
      sales: '销售', purchases: '采购发票', loadingPlaceholder: '加载中...',
    },
    chart: { sales: '销售额', inventory: '库存', returns: '退货' },
    connection: {
      title: '连接设置', sub: '云连接和商店管理',
      connected: '已连接到云端',
      mainConnected: '总店 - 已连接到 Supabase',
      branchConnectedMsg: '分店已连接到总店',
      mainStore: '总店', branch: '分店',
      branchParenthetical: '(分店)',
      enterCredentials: '输入凭证以开始',
      logoutConfirm: '确定要退出登录吗？',
      cloudRequired: '请先连接到云端',
      uploading: '正在上传...', noChanges: '没有更改需要上传',
      uploadSuccess: '上传成功',
      uploadBackupBtn: '上传备份',
      lanSubUploadMsg: '此设备为 LAN 从服务器：数据上传由该站点的主服务器完成',
      enterStorePassword: '输入商店密码以下载:',
      wrongPassword: '密码错误',
      verificationError: '验证错误: ',
      backupEmpty: '备份为空',
      restoreSuccessMsg: '恢复成功 - 请重启应用',
      restoreBackupBtn: '恢复备份',
      lastSync: '上次同步: ',
      branchNameRequired: '请输入分店名称',
      passwordRequired: '请输入密码',
      branchCreated: '分店已创建 - 代码: ',
      passwordLabel: '密码: ',
      viewStock: '查看库存', deleteBranchBtn: '删除分店',
      deleteBranchConfirm1: '确定删除分店 "',
      deleteBranchConfirm2: '无法恢复。',
      enterStorePasswordView: '输入商店密码以查看分店库存:',
      noBranchStock: '此分店无库存',
      barcode: '条码', brand: '品牌', sellPrice: '售价',
      emailRequired: '请输入有效邮箱',
      searching: '搜索中...', noPassword: '无密码',
      savingPassword: '正在保存新密码...',
      userInfoTitle: '用户信息', emailLabel: '邮箱', codeLabel: '您的代码',
      storeTypeLabel: '商店类型', mainCodeLabel: '主代码',
      statusTitle: '未连接', statusDesc: '输入连接凭证以开始',
      statusBadge: '未连接', connTab: '连接', backupTab: '备份',
      branchesTab: '分店', recoveryTab: '账户恢复',
      cloudStatusCard: '云连接状态', cloudStatusDesc: '云连接是自动的。所有数据安全存储。',
      logoutBtn: '退出登录', uploadCard: '上传备份', uploadDesc: '云端现有备份将被替换...',
      pushTitle: '手机通知', pushDesc: '创建产品订单或变质商品退货时，即使网站已关闭，也会立即向您的手机发送通知。',
      siteUrlLabel: '网站链接', siteUrlPlaceholder: 'https://...',
      pushSecretLabel: '密钥', pushSecretPlaceholder: '您的密钥',
      pushSaveBtn: '保存', pushUrlRequired: '请输入网站链接', pushUrlInvalid: '网站链接无效',
      pushSecretRequired: '请输入密钥', pushSaved: '设置已保存',
      autoBackup: '自动备份', backupInterval: '间隔（分钟）',
      min1: '1分钟', min2: '2分钟', min5: '5分钟', min10: '10分钟', min30: '30分钟',
      uploadBtn: '上传备份', restoreBtn: '恢复备份',
      branchesCard: '分店', branchesDesc: '分店管理仅限总店使用。',
      addBranch: '添加新分店', branchName: '分店名称', branchNamePlaceholder: '例如：市中心分店',
      branchPassword: '密码', branchPasswordPlaceholder: '分店密码',
      saveBranch: '保存分店', cancel2: '取消', addNewBranch: '添加新分店', refreshBtn: '刷新',
      noBranches2: '无注册分店', branchStock: '分店库存: ',
      recoveryCard: '账户/密码恢复', recoveryDesc: '输入关联账户的邮箱...',
      search2: '搜索', storeNameLabel: '商店名称', codeResult: '代码', passwordResult: '密码',
      changePassword: '更改密码', searchAgain: '再次搜索',
      newPasswordLabel: '新密码', newPasswordPlaceholder2: '至少4个字符',
      confirmPasswordLabel: '确认密码', confirmPasswordPlaceholder2: '再次输入密码',
      saveNewPassword: '保存新密码',       backBtn: '返回',
    },
    login: {
      loginSubtitle: '选择登录方式', managerTab: '经理', userTab: '用户', newAccountTab: '新账户', branchTab: '分店',
      codeLabel: '10位数代码', storePassword: '商店密码', passwordPlaceholder: '输入密码',
      loginManager: '以经理身份登录', forgotPassword: '忘记密码？',
      storeCode: '商店代码', storeCodePlaceholder: '输入商店代码（10位数）',
      usernameLabel: '用户名', usernamePlaceholder: '用户名',
      userPassword: '密码', loginAsUser: '以用户身份登录',
      emailLabel: '邮箱', createAccount: '创建账户',
      mainStoreCode: '总店代码', branchPassword: '分店密码', branchLogin: '以分店身份连接',
      accountCreatedTitle: '账户创建成功！', accountCreatedDesc: '请将此代码保存在安全处，恢复数据时需要。',
      accountCreatedWarning: '此代码无法恢复，请写下或拍照。', enterApp: '进入应用',
      recoveryTitle: '密码恢复', recoverySubtitle: '输入邮箱查看代码和密码',
      searchBtn: '搜索', backToLogin: '返回登录',
      storeNameSpan: '商店名称：', codeSpan: '代码：', passwordSpan: '密码：',
      loginWithCode: '使用代码登录', resetPassword: '重置密码',
      searchAgainLink: '再次搜索', newPasswordTitle: '设置新密码',
      newPassLabel: '新密码', newPassPlaceholder: '输入新密码',
      confirmPassLabel: '确认密码', confirmPassPlaceholder: '再次输入密码',
      saveNewPass: '保存新密码', backLink: '返回',
    },
  },
};
const LANG_ORDER = ['ar', 'en', 'fr', 'zh'];
const LANG_LABELS = { ar: 'AR', en: 'EN', fr: 'FR', zh: '中文' };
let __lang = 'ar';

function t(key) {
  const parts = key.split('.');
  let val = LANG[__lang] || LANG.ar;
  for (const part of parts) {
    if (val && typeof val === 'object') val = val[part];
    else return '';
  }
  return val || '';
}
window.t = t;

function applyTranslation() {
  const dir = __lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const translated = t(key);
    if (translated) el.innerHTML = translated;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const translated = t(key);
    if (translated) el.placeholder = translated;
  });
  const label = document.getElementById('langLabel');
  if (label) label.textContent = LANG_LABELS[__lang] || 'AR';
  const titleEl = document.getElementById('appTitleText');
  if (titleEl) titleEl.textContent = t('appTitle');
  document.title = t('appTitle');
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.classList.add('transitioning');
  if (isDark) {
    html.removeAttribute('data-theme');
    localStorage.setItem('zmt_theme', 'light');
    document.getElementById('btnTheme').innerHTML = '<i class="fas fa-moon"></i>';
    document.getElementById('btnTheme').title = t('settings.darkMode') || 'الوضع الليلي';
  } else {
    html.setAttribute('data-theme', 'dark');
    localStorage.setItem('zmt_theme', 'dark');
    document.getElementById('btnTheme').innerHTML = '<i class="fas fa-sun"></i>';
    document.getElementById('btnTheme').title = t('settings.lightMode') || 'الوضع النهاري';
  }
  setTimeout(() => html.classList.remove('transitioning'), 300);
}

function switchLanguage() {
  const idx = LANG_ORDER.indexOf(__lang);
  __lang = LANG_ORDER[(idx + 1) % LANG_ORDER.length];
  window.__lang = __lang;
  applyTranslation();
  applyConnectionText();

  // Re-render chart if on dashboard
  if (typeof renderChart === 'function') {
    const sel = document.getElementById('monthSelect');
    if (sel) renderChart(parseInt(sel.value));
  }
}

// ===== CONNECTION STATUS =====
function applyConnectionText() {
  const dot = document.getElementById('connDot');
  const text = document.getElementById('connText');
  if (!dot || !text) return;
  const online = navigator.onLine;
  const t = LANG[__lang] || LANG.ar;
  dot.className = 'conn-dot' + (online ? '' : ' offline');
  text.textContent = online ? t.online : t.offline;
}

function setupConnectionStatus() {
  applyConnectionText();
  window.addEventListener('online', applyConnectionText);
  window.addEventListener('offline', applyConnectionText);
}

// ===== PAGER CLASS =====
/**
 * Smart pagination component.
 * Usage: new Pager({ data, container, render, pageSize?, infoEl?, controlsEl? })
 */
class Pager {
  constructor(opts) {
    this._data = opts.data || [];
    this._container = opts.container;
    this._render = opts.render;
    this._pageSize = opts.pageSize || 20;
    this._infoEl = opts.infoEl || null;
    this._controlsEl = opts.controlsEl || null;
    this._page = 1;
    this._totalPages = Math.max(1, Math.ceil(this._data.length / this._pageSize));
    this._onchange = opts.onchange || null;
    this._bar = null;
    this._keyHandler = null;
    this._buildDOM();
    this.goTo(1);
  }

  _buildDOM() {
    this._bar = document.createElement('div');
    this._bar.className = 'pagination-bar';
    this._bar.style.display = 'none';

    // Info
    this._info = document.createElement('div');
    this._info.className = 'pagination-info';
    this._bar.appendChild(this._info);

    // Controls wrapper
    const ctrlWrap = document.createElement('div');
    ctrlWrap.className = 'pagination-controls';
    this._bar.appendChild(ctrlWrap);

    // Page size
    const sizeSel = document.createElement('select');
    sizeSel.className = 'pagination-size-select';
    [10, 20, 50, 100].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === this._pageSize) opt.selected = true;
      sizeSel.appendChild(opt);
    });
    sizeSel.addEventListener('change', () => {
      this._pageSize = parseInt(sizeSel.value);
      this._totalPages = Math.max(1, Math.ceil(this._data.length / this._pageSize));
      this.goTo(1);
    });
    ctrlWrap.appendChild(sizeSel);

    // Prev button
    this._prevBtn = this._makeBtn('‹', () => this.goTo(this._page - 1));
    ctrlWrap.appendChild(this._prevBtn);

    // Numbered buttons container
    this._numContainer = document.createElement('div');
    this._numContainer.className = 'pagination-controls';
    ctrlWrap.appendChild(this._numContainer);

    // Next button
    this._nextBtn = this._makeBtn('›', () => this.goTo(this._page + 1));
    ctrlWrap.appendChild(this._nextBtn);

    // Insert after container
    if (this._controlsEl) {
      this._controlsEl.appendChild(this._bar);
    } else if (this._container && this._container.parentNode) {
      this._container.parentNode.insertBefore(this._bar, this._container.nextSibling);
    }
  }

  _makeBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'pagination-btn';
    btn.innerHTML = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  goTo(page) {
    this._page = Math.max(1, Math.min(page, this._totalPages));
    const start = (this._page - 1) * this._pageSize;
    const end = Math.min(start + this._pageSize, this._data.length);
    const slice = this._data.slice(start, end);

    // Animate container
    if (this._container) {
      this._container.classList.remove('pagination-page-animate');
      void this._container.offsetWidth;
      this._container.classList.add('pagination-page-animate');
    }

    this._render(slice, {
      page: this._page,
      totalPages: this._totalPages,
      start: this._data.length > 0 ? start + 1 : 0,
      end,
      total: this._data.length,
      pageSize: this._pageSize,
    });

    this._updateControls();
    if (this._onchange) this._onchange(this._page);
  }

  _updateControls() {
    const total = this._data.length;
    if (total === 0 || this._totalPages <= 1) {
      this._bar.style.display = 'none';
      return;
    }
    this._bar.style.display = 'flex';
    this._info.textContent = `${this._page > 1 ? ((this._page - 1) * this._pageSize + 1) : 1}–${Math.min(this._page * this._pageSize, total)} من ${total}`;

    this._prevBtn.disabled = this._page <= 1;
    this._nextBtn.disabled = this._page >= this._totalPages;

    // Build number buttons
    this._numContainer.innerHTML = '';
    const tp = this._totalPages;
    const cp = this._page;
    const pages = [];

    if (tp <= 7) {
      for (let i = 1; i <= tp; i++) pages.push(i);
    } else {
      pages.push(1);
      if (cp > 3) pages.push('...');
      const startP = Math.max(2, cp - 1);
      const endP = Math.min(tp - 1, cp + 1);
      for (let i = startP; i <= endP; i++) pages.push(i);
      if (cp < tp - 2) pages.push('...');
      pages.push(tp);
    }

    pages.forEach(p => {
      if (p === '...') {
        const el = document.createElement('span');
        el.className = 'pagination-btn ellipsis';
        el.textContent = '…';
        this._numContainer.appendChild(el);
      } else {
        const btn = this._makeBtn(p, () => this.goTo(p));
        if (p === cp) btn.classList.add('active');
        this._numContainer.appendChild(btn);
      }
    });
  }

  /** Update data array (e.g., after search/filter) and reset to page 1 */
  updateData(newData) {
    this._data = newData;
    this._totalPages = Math.max(1, Math.ceil(this._data.length / this._pageSize));
    this.goTo(1);
  }

  /** Clean up DOM */
  destroy() {
    if (this._bar && this._bar.parentNode) this._bar.parentNode.removeChild(this._bar);
  }
}

/**
 * Infinite scroll pager — appends items in batches as user scrolls.
 * Unlike Pager, this does NOT use page buttons; it loads progressively.
 */
class InfiniteScrollPager {
  constructor(opts) {
    this._data = opts.data || [];
    this._container = opts.container;
    this._renderItem = opts.renderItem;
    this._renderEmpty = opts.renderEmpty || null;
    this._pageSize = opts.pageSize || 50;
    this._scrollContainer = opts.scrollContainer || window;
    this._onchange = opts.onchange || null;
    this._loaded = 0;
    this._loading = false;
    this._destroyed = false;
    this._boundScroll = this._onScroll.bind(this);
    this._scrollContainer.addEventListener('scroll', this._boundScroll, { passive: true });
    this._loadMore();
  }

  _onScroll() {
    if (this._loading || this._destroyed) return;
    if (this._loaded >= this._data.length) return;
    const scrollEl = this._scrollContainer;
    const threshold = (scrollEl === window ? window.innerHeight : scrollEl.clientHeight) + 500;
    const scrollPos = scrollEl === window ? window.scrollY : scrollEl.scrollTop;
    const scrollHeight = scrollEl === window ? document.documentElement.scrollHeight : scrollEl.scrollHeight;
    if (scrollPos + threshold >= scrollHeight) {
      this._loadMore();
    }
  }

  _loadMore() {
    if (this._loading) return;
    this._loading = true;
    const start = this._loaded;
    const end = Math.min(start + this._pageSize, this._data.length);
    if (start >= end) { this._loading = false; return; }
    let html = '';
    for (let i = start; i < end; i++) {
      html += this._renderItem(this._data[i], i);
    }
    if (this._loaded === 0 && !html && this._renderEmpty) {
      this._container.innerHTML = this._renderEmpty();
    } else if (html) {
      this._container.insertAdjacentHTML('beforeend', html);
    }
    this._loaded = end;
    this._loading = false;
    if (this._onchange) this._onchange(this._loaded, this._data.length);
    if (this._loaded >= this._data.length) {
      this._scrollContainer.removeEventListener('scroll', this._boundScroll);
    }
  }

  /** Replace data and reset (e.g., after search) */
  updateData(newData) {
    this._data = newData;
    this._loaded = 0;
    this._container.innerHTML = '';
    this._scrollContainer.addEventListener('scroll', this._boundScroll, { passive: true });
    this._loading = false;
    this._loadMore();
  }

  destroy() {
    this._destroyed = true;
    this._scrollContainer.removeEventListener('scroll', this._boundScroll);
    this._data = [];
    this._container = null;
  }
}

// ===== PAGE LISTENER REGISTRY =====
window._pageListeners = [];

// Re-run current page init safely (used after LAN sync receives remote changes)
window.refreshCurrentPageApp = function(pageId) {
  if (!pageId) return;
  if (typeof _currentPageId === 'string' && _currentPageId !== pageId) return;
  if (typeof executePageScript === 'function') {
    executePageScript(pageId);
  } else {
    const script = document.createElement('script');
    script.src = 'js/pages/' + pageId + '.js';
    script.onload = () => {
      const fn = window['init_' + pageId.replace(/-/g, '_')];
      if (typeof fn === 'function') { try { fn(); } catch (e) {} }
    };
    document.body.appendChild(script);
  }
};

// ===== INIT =====
function userLogout() {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  Auth.signOut();
  if (typeof CloudService !== 'undefined') CloudService.stopAutoSync();
  showLogin();
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] DOM ready');
  const _appStartTime = Date.now();
  window.__lang = __lang;
  window.switchLanguage = switchLanguage;
  window.toggleTheme = toggleTheme;
  setupConnectionStatus();
  applyTranslation();
  document.getElementById('btnLang')?.addEventListener('click', switchLanguage);

  // Restore theme
  const savedTheme = localStorage.getItem('zmt_theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const btn = document.getElementById('btnTheme');
    if (btn) { btn.innerHTML = '<i class="fas fa-sun"></i>'; btn.title = 'الوضع النهاري'; }
  }
  document.getElementById('btnTheme')?.addEventListener('click', toggleTheme);

  // ===== LICENSE CHECK =====
  const licenseOk = await checkAndEnforceLicense();
  if (!licenseOk) {
    console.log('[License] Not activated or expired — app will boot after activation');
    return;
  }

  await bootApp();

  // Close splash screen — app is ready (but let animation play at least ~3.5s)
  const MIN_SPLASH_MS = 3500;
  const elapsed = Date.now() - _appStartTime;
  const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }
  if (window.electronAPI?.splashClose) {
    window.electronAPI.splashClose();
  }

  // ===== PERIODIC LICENSE CHECK =====
  setInterval(async () => {
    const tamper = await window.electronAPI.licenseTimeTamper();
    if (tamper.tampered) {
      showFreezeOverlay(tamper.message);
      return;
    }
    const lic = await window.electronAPI.licenseCheck();
    if (lic && lic.status === 'expired') {
      _licenseState.expired = true;
      _licenseState.valid = false;
      showFreezeOverlay('انتهت مدة التفعيل — أدخل مفتاح جديد للاستمرار');
    }
  }, 5 * 60 * 1000);

  // Save time snapshot on window close
  window.addEventListener('beforeunload', () => {
    window.electronAPI.licenseSaveSnapshot(Date.now());
  });
});

// ===== BOOT =====
// Loads data + shows login or dashboard. Runs once at startup (after the
// license check passes) and again after activation from the license/freeze
// overlays, so the app is never left empty after entering a key.
let _bootFinalized = false;

async function bootApp() {
  // ===== PROGRESSIVE DATA LOADING =====
  const loadOverlay = document.createElement('div');
  loadOverlay.id = 'dataLoadOverlay';
  loadOverlay.style.cssText = 'position:fixed;inset:0;background:var(--bg, #1a1a2e);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;transition:opacity .4s';
  loadOverlay.innerHTML = '<div class="spinner" style="width:48px;height:48px;border:4px solid var(--silver-700,#333);border-top-color:var(--bmw-blue,#0066B1);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:20px"></div>'
    + '<div id="dataLoadText" style="color:var(--silver-400,#999);font-size:15px">جاري تحميل البيانات...</div>'
    + '<div id="dataLoadProgress" style="width:280px;height:6px;background:var(--silver-700,#333);border-radius:3px;margin-top:16px;overflow:hidden">'
    + '<div id="dataLoadBar" style="width:0%;height:100%;background:var(--bmw-blue,#0066B1);border-radius:3px;transition:width .3s"></div></div>';
  document.body.appendChild(loadOverlay);
  try {
    await DB.initProgressive((store, done, total, count) => {
      const textEl = document.getElementById('dataLoadText');
      const barEl = document.getElementById('dataLoadBar');
      if (!store) {
        if (textEl) textEl.textContent = 'تم تحميل جميع البيانات';
        if (barEl) barEl.style.width = '100%';
        return;
      }
      const names = { products: 'المنتجات', invoices: 'الفواتير', customers: 'العملاء', suppliers: 'الموردين', payments: 'المدفوعات', discounts: 'الخصومات', returns: 'المرتجعات', transfers: 'التحويلات', meta: 'الإعدادات' };
      const label = names[store] || store;
      if (textEl) textEl.textContent = `جاري تحميل ${label} (${count})`;
      if (barEl) barEl.style.width = Math.round((done / total) * 100) + '%';
    });

    // Offline safety net: if the local database is empty and we are offline,
    // restore the newest auto-backup saved to disk so the app is never blank.
    if (!navigator.onLine && typeof DB.tryOfflineRestore === 'function') {
      try {
        const restored = await DB.tryOfflineRestore();
        if (restored && restored.restored) {
          console.log('[App] Offline auto-restore from', restored.file);
        }
      } catch (e) {
        console.error('[App] Offline restore error:', e);
      }
    }
    if (typeof window.updateOrdersBadge === 'function') window.updateOrdersBadge();
  } catch (e) {
    console.error('[DB] Progressive init error:', e);
  } finally {
    loadOverlay.style.opacity = '0';
    setTimeout(() => { if (loadOverlay.parentNode) loadOverlay.parentNode.removeChild(loadOverlay); }, 400);
  }

  // Load login page HTML
  try {
    const res = await fetch('pages/login.html');
    if (res.ok) {
      const loginHtml = await res.text();
      document.getElementById('loginOverlay').innerHTML = loginHtml;
    }
  } catch (e) { console.warn('[Auth] Failed to load login.html:', e); }

  // Check auth state
  if (!Auth.isLoggedIn()) {
    document.querySelector('.app-container').style.display = 'none';
    document.getElementById('loginOverlay').style.display = 'flex';
    initLoginView();
    return;
  }

  // User is logged in - init app normally
  document.getElementById('loginOverlay').style.display = 'none';
  document.querySelector('.app-container').style.display = '';

  // Update sidebar user info
  const user = Auth.getCurrentUser();
  const nameEl = document.getElementById('sidebarUserName');
  if (user && nameEl) {
    nameEl.textContent = user.role === 'user' ? (user.username || 'مستخدم') : 'المدير';
  }

  if (!Auth.isManager()) {
    document.body.classList.add('user-mode');
    document.querySelectorAll('.nav-item').forEach(nav => {
      const page = nav.dataset.page;
      if (page && !Auth.canView(page)) {
        nav.style.display = 'none';
      }
    });
  } else {
    document.body.classList.remove('user-mode');
  }

  if (Auth.isLoggedIn()) {
    const navMonitor = document.getElementById('navBranchesMonitor');
    const navShared = document.getElementById('navSharedInventory');
    // Both main and branch can see branches monitor
    if (navMonitor) navMonitor.style.display = '';
    if (navShared) navShared.style.display = 'none';
  }

  navigateTo('dashboard');

  // One-time only: LAN + cloud init must not run again on re-boot after activation
  if (_bootFinalized) return;
  _bootFinalized = true;

  // Initialize LAN sync (main/sub server) — machine-level, persists across logins
  if (typeof LANSync !== 'undefined') {
    LANSync.hookDb();
    LANSync.start();
  }

  // Initialize cloud auto-sync if enabled
  if (typeof CloudService !== 'undefined' && localStorage.getItem('zmt_cloud_autosync') === '1' && CloudService.isCloudConnected()) {
    CloudService.startAutoSync(CloudService.getAutoSyncInterval());
    console.log('[Cloud] Auto-sync started');
  }
}
