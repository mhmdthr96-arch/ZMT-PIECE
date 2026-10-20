/* ============================================================
   ZMT PIECE — Brands (العلامات التجارية)
   Two-level navigation:
     1) Kinds grid (أصناف: قطع غيار، ملابس وموضة، ... + إضافة أخرى)
     2) Brands grid filtered by the selected kind.
   Built-in car brands are treated as kind "قطع غيار".
   Custom kinds & brands are persisted in localStorage.
   ============================================================ */

const ZMT_FAV_BRANDS_KEY = 'zmt_fav_brands';
const ZMT_CUSTOM_KINDS_KEY = 'zmt_custom_kinds';
const ZMT_CUSTOM_BRANDS_KEY = 'zmt_custom_brands';
const DEFAULT_BRAND_KIND = 'قطع غيار';

// Static kinds shipped with the app (icons = FontAwesome classes)
const STATIC_KINDS = [
  { name: 'قطع غيار',        icon: 'fas fa-car',                 color: '#0066B1' },
  { name: 'ملابس وموضة',     icon: 'fas fa-tshirt',              color: '#e91e63' },
  { name: 'مواد غذائية',     icon: 'fas fa-utensils',            color: '#43a047' },
  { name: 'صيدلية',          icon: 'fas fa-pills',               color: '#00897b' },
  { name: 'شبه صيدلية',      icon: 'fas fa-hand-holding-medical', color: '#26a69a' },
  { name: 'عطور وزيوت',      icon: 'fas fa-spray-can',           color: '#8e24aa' },
  { name: 'اكسيسوار',        icon: 'fas fa-gem',                 color: '#6d4c41' },
  { name: 'كهرومنزلية',      icon: 'fas fa-plug',                color: '#f9a825' },
  { name: 'هواتف وحواسيب',  icon: 'fas fa-mobile-alt',           color: '#3949ab' },
  { name: 'مخازن',           icon: 'fas fa-warehouse',           color: '#546e7a' },
  { name: 'مواد بناء',       icon: 'fas fa-hard-hat',            color: '#c62828' },
  { name: 'مطاعم',           icon: 'fas fa-concierge-bell',      color: '#ef6c00' },
];

// ---- localStorage helpers ----
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function getCustomKinds() { return lsGet(ZMT_CUSTOM_KINDS_KEY, []); }
function getCustomBrands() { return lsGet(ZMT_CUSTOM_BRANDS_KEY, []); }
function getFavBrands() { return lsGet(ZMT_FAV_BRANDS_KEY, []); }
function saveFavBrands(list) { lsSet(ZMT_FAV_BRANDS_KEY, list); }

// Combined list of all kinds (static + custom)
function getAllKinds() {
  return [...STATIC_KINDS, ...getCustomKinds()];
}

// Kind of a brand: built-in car brands default to قطع غيار; custom brands carry kind.
function kindOfBrand(b) {
  return (b && b.kind) ? b.kind : DEFAULT_BRAND_KIND;
}

// All brands available for a given kind (built-in car brands included when قطع غيار).
function brandsForKind(kind) {
  const builtins = (kind === DEFAULT_BRAND_KIND)
    ? [...BRANDS.global, ...BRANDS.chinese]
    : [];
  const customs = getCustomBrands().filter(b => kindOfBrand(b) === kind);
  // De-dupe by id (custom overrides built-in if same id)
  const map = new Map();
  builtins.forEach(b => map.set(b.id, b));
  customs.forEach(b => map.set(b.id, b));
  return [...map.values()];
}

// ===== FAVORITES =====
function toggleFavBrand(brandId, btn) {
  if (!brandId) return;
  let favs = getFavBrands();
  const idx = favs.indexOf(brandId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(brandId);
  saveFavBrands(favs);
  const card = btn ? btn.closest('.brand-card') : null;
  if (card) {
    btn.classList.toggle('active', idx < 0);
    card.classList.toggle('fav-true', idx < 0);
  }
  renderBrandsGrid();
}

// ===== KINDS GRID =====
function renderKindsGrid() {
  const grid = document.getElementById('kindsGrid');
  if (!grid) return;
  const kinds = getAllKinds();
  const cards = kinds.map(k => {
    const count = brandsForKind(k.name).length;
    return `<div class="brand-card kind-card" onclick="selectKind('${escHtml(k.name)}')">
        <div class="brand-image" style="background:${k.color}18;border-color:${k.color}45">
          <i class="${k.icon || 'fas fa-box'}" style="font-size:26px;color:${k.color}"></i>
        </div>
        <div class="brand-name">${escHtml(k.name)}</div>
        <div class="brand-country">${count} ${(typeof t === 'function' ? t('brands.brandsWord') : 'علامة')}</div>
      </div>`;
  });
  // "إضافة أخرى" card
  const addCard = `<div class="brand-card kind-card add-kind-card" onclick="openAddKindModal()">
      <div class="brand-image" style="border-style:dashed">
        <i class="fas fa-plus" style="font-size:26px;color:var(--silver-500)"></i>
      </div>
      <div class="brand-name">${(typeof t === 'function' && t('brands.addOther')) || 'إضافة أخرى'}</div>
      <div class="brand-country">${(typeof t === 'function' && t('brands.addOtherHint')) || 'إضافة صنف جديد'}</div>
    </div>`;
  grid.innerHTML = cards.join('') + addCard;
}

// Select a kind → show its brands
function selectKind(kind) {
  window.brandCtx = { kind };
  const kindsGrid = document.getElementById('kindsGrid');
  const brandsGrid = document.getElementById('allBrandsGrid');
  const ctxBar = document.getElementById('brandsContextBar');
  if (kindsGrid) kindsGrid.style.display = 'none';
  if (brandsGrid) brandsGrid.style.display = '';
  if (ctxBar) ctxBar.style.display = 'flex';
  const crumb = document.getElementById('brandsCrumbKind');
  if (crumb) crumb.textContent = kind;
  const kindSel = document.getElementById('addBrandKind');
  if (kindSel) {
    kindSel.value = kind;
    kindSel.innerHTML = `<option value="${escHtml(kind)}">${escHtml(kind)}</option>`;
  }
  renderBrandsGrid();
}

function returnToKinds() {
  window.brandCtx = null;
  const kindsGrid = document.getElementById('kindsGrid');
  const brandsGrid = document.getElementById('allBrandsGrid');
  const ctxBar = document.getElementById('brandsContextBar');
  if (kindsGrid) kindsGrid.style.display = '';
  if (brandsGrid) brandsGrid.style.display = 'none';
  if (ctxBar) ctxBar.style.display = 'none';
  renderKindsGrid();
}

// ===== BRANDS GRID =====
function renderBrandsGrid() {
  const container = document.getElementById('allBrandsGrid');
  if (!container) return;
  const ctx = window.brandCtx;
  const kind = (ctx && ctx.kind) ? ctx.kind : DEFAULT_BRAND_KIND;
  const all = brandsForKind(kind);
  const favs = getFavBrands();
  const byId = new Map(all.map(b => [b.id, b]));
  const favList = favs.map(id => byId.get(id)).filter(Boolean);
  const rest = all.filter(b => !favs.includes(b.id));
  const sorted = [...favList, ...rest];

  if (sorted.length === 0) {
    container.innerHTML = `<div class="brands-empty">
        <i class="fas fa-box-open"></i>
        <p>${(typeof t === 'function' && t('brands.noBrands')) || 'لا توجد علامات في هذا الصنف بعد'}</p>
        <button class="btn btn-primary" onclick="openAddBrandModal()"><i class="fas fa-plus"></i> ${(typeof t === 'function' && t('brands.addBrand')) || 'إضافة علامة'}</button>
      </div>`;
    return;
  }

  const customs = getCustomBrands();
  container.innerHTML = sorted.map(b => {
    const isFav = favs.includes(b.id);
    const isCustom = customs.some(c => c.id === b.id);
    const favIcon = `<button class="brand-fav ${isFav ? 'active' : ''}" title="${isFav ? ((t('brands.favRemove') || 'إزالة من المفضلة')) : ((t('brands.favAdd') || 'إضافة إلى المفضلة'))}" onclick="event.stopPropagation();toggleFavBrand('${b.id}', this)"><i class="fas fa-star"></i></button>`;
    const delBtn = isCustom
      ? `<button class="brand-del" title="${(typeof t === 'function' && t('brands.deleteBrand')) || 'حذف العلامة'}" onclick="event.stopPropagation();deleteCustomBrand('${b.id}')"><i class="fas fa-trash"></i></button>`
      : '';
    return `<div class="brand-card ${isFav ? 'fav-true' : ''}" data-brand="${b.id}" onclick="openBrandCategories('${b.id}')">
        ${favIcon}
        ${delBtn}
        <div class="brand-image">${brandCardImage(b)}</div>
        <div class="brand-name">${b.name}</div>
        <div class="brand-country">${b.country}</div>
      </div>`;
  }).join('');
}

// Brand image with a graceful fallback to colored initials when the asset is missing.
function brandImgFallback(el) {
  if (!el) return;
  const init = el.dataset.init || '?';
  const color = el.dataset.color || '#0066B1';
  const span = document.createElement('span');
  span.className = 'brand-fallback';
  span.style.fontSize = '20px';
  span.style.fontWeight = '700';
  span.style.color = color;
  span.textContent = init;
  if (el.parentNode) el.parentNode.replaceChild(span, el);
}

function brandCardImage(b) {
  const c = b.color || '#0066B1';
  const initials = (b.name || '').replace(/[^A-Za-z0-9\u0600-\u06FF]/g, '').substring(0, 2).toUpperCase();
  const slug = b.slug || 'fallback';
  return `<img src="assets/brands/${slug}.svg" alt="${(b.name||'').replace(/"/g,'&quot;')}" data-png="assets/brands/${slug}.png" data-color="${c}" data-init="${initials}" onerror="brandImgFallback(this)">`;
}

// ===== OPEN BRAND PRODUCTS =====
function openBrandCategories(brandId) {
  const ctx = window.brandCtx;
  window.brandCtx = { brandId, kind: ctx ? ctx.kind : DEFAULT_BRAND_KIND };
  navigateTo('category-products');
}

// ===== PAGE INIT =====
function init_brands() {
  // If we navigated here with a kind already selected (e.g. back from a brand),
  // resume showing that kind's brand grid instead of the kinds overview.
  const kind = window.brandCtx && window.brandCtx.kind;
  const kindsGrid = document.getElementById('kindsGrid');
  const brandsGrid = document.getElementById('allBrandsGrid');
  const ctxBar = document.getElementById('brandsContextBar');
  if (kind) {
    if (kindsGrid) kindsGrid.style.display = 'none';
    if (brandsGrid) brandsGrid.style.display = '';
    if (ctxBar) ctxBar.style.display = 'flex';
    const crumb = document.getElementById('brandsCrumbKind');
    if (crumb) crumb.textContent = kind;
    const kindSel = document.getElementById('addBrandKind');
    if (kindSel) {
      kindSel.value = kind;
      kindSel.innerHTML = `<option value="${escHtml(kind)}">${escHtml(kind)}</option>`;
    }
    renderBrandsGrid();
  } else {
    renderKindsGrid();
    if (kindsGrid) kindsGrid.style.display = '';
    if (brandsGrid) brandsGrid.style.display = 'none';
    if (ctxBar) ctxBar.style.display = 'none';
  }

  // Search filtering for brands grid
  const searchInput = document.getElementById('brandSearch');
  if (searchInput) {
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);
    const runBrandFilter = function () {
      const q = this.value.toLowerCase();
      document.querySelectorAll('#allBrandsGrid .brand-card').forEach(card => {
        const name = card.querySelector('.brand-name') ? card.querySelector('.brand-name').textContent.toLowerCase() : '';
        const country = card.querySelector('.brand-country') ? card.querySelector('.brand-country').textContent.toLowerCase() : '';
        card.style.display = name.includes(q) || country.includes(q) ? '' : 'none';
      });
    };
    newInput.addEventListener('input', (typeof debounce === 'function') ? debounce(runBrandFilter, 180) : runBrandFilter);
  }
}

// ===== KINDS CRUD =====
function openAddKindModal() {
  document.getElementById('addKindModal').style.display = 'flex';
  const inp = document.getElementById('addKindName');
  if (inp) inp.focus();
}
function closeAddKindModal() {
  document.getElementById('addKindModal').style.display = 'none';
  document.getElementById('addKindName').value = '';
  document.getElementById('addKindIcon').value = '';
  document.getElementById('addKindColor').value = '#0066B1';
}
function saveNewKind() {
  const nameEl = document.getElementById('addKindName');
  const name = nameEl.value.trim();
  if (!name) { alert((typeof t === 'function' && t('brands.kindRequired')) || 'يرجى إدخال اسم الصنف'); return; }
  const kinds = getCustomKinds();
  if (kinds.some(k => k.name === name) || STATIC_KINDS.some(k => k.name === name)) {
    alert((typeof t === 'function' && t('brands.kindExists')) || 'هذا الصنف موجود بالفعل'); return;
  }
  kinds.push({
    name,
    icon: (document.getElementById('addKindIcon').value.trim() || 'fas fa-box'),
    color: document.getElementById('addKindColor').value || '#0066B1',
  });
  lsSet(ZMT_CUSTOM_KINDS_KEY, kinds);
  closeAddKindModal();
  renderKindsGrid();
}

// ===== BRANDS CRUD =====
function openAddBrandModal() {
  const ctx = window.brandCtx;
  const kind = (ctx && ctx.kind) ? ctx.kind : DEFAULT_BRAND_KIND;
  document.getElementById('addBrandModal').style.display = 'flex';
  const kindSel = document.getElementById('addBrandKind');
  if (kindSel) {
    kindSel.value = kind;
    kindSel.innerHTML = `<option value="${escHtml(kind)}">${escHtml(kind)}</option>`;
  }
  document.getElementById('addBrandName').focus();
}
function closeAddBrandModal() {
  document.getElementById('addBrandModal').style.display = 'none';
  document.getElementById('addBrandName').value = '';
  document.getElementById('addBrandCountry').value = '';
  document.getElementById('addBrandColor').value = '#0066B1';
}
function saveNewBrand() {
  const ctx = window.brandCtx;
  const kind = (ctx && ctx.kind) ? ctx.kind : DEFAULT_BRAND_KIND;
  const nameEl = document.getElementById('addBrandName');
  const name = nameEl.value.trim();
  if (!name) { alert((typeof t === 'function' && t('brands.brandNameRequired')) || 'يرجى إدخال اسم العلامة'); return; }
  const country = document.getElementById('addBrandCountry').value.trim();
  const color = document.getElementById('addBrandColor').value || '#0066B1';
  const id = 'cust_' + name.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/gi, '-') + '_' + Date.now().toString(36);
  const brands = getCustomBrands();
  brands.push({ id, name, country, color, kind, custom: true });
  lsSet(ZMT_CUSTOM_BRANDS_KEY, brands);
  closeAddBrandModal();
  renderBrandsGrid();
  // refresh kind count
  renderKindsGrid();
}

function deleteCustomBrand(id) {
  const brands = getCustomBrands();
  const idx = brands.findIndex(b => b.id === id);
  if (idx < 0) return;
  if (!confirm((typeof t === 'function' && t('brands.confirmDelete')) || 'حذف هذه العلامة؟')) return;
  brands.splice(idx, 1);
  lsSet(ZMT_CUSTOM_BRANDS_KEY, brands);
  renderBrandsGrid();
  renderKindsGrid();
}
