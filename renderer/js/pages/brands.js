const ZMT_FAV_BRANDS_KEY = 'zmt_fav_brands';

function getFavBrands() {
  try {
    const raw = localStorage.getItem(ZMT_FAV_BRANDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveFavBrands(list) {
  localStorage.setItem(ZMT_FAV_BRANDS_KEY, JSON.stringify(list));
}

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

function renderBrandsGrid() {
  const container = document.getElementById('allBrandsGrid');
  if (!container) return;
  const all = [...BRANDS.global, ...BRANDS.chinese];
  const favs = getFavBrands();
  const byId = new Map(all.map(b => [b.id, b]));
  const favList = favs.map(id => byId.get(id)).filter(Boolean);
  const rest = all.filter(b => !favs.includes(b.id));
  const sorted = [...favList, ...rest];
  container.innerHTML = sorted.map(b => {
    const isFav = favs.includes(b.id);
    const favIcon = `<button class="brand-fav ${isFav ? 'active' : ''}" title="${isFav ? (t('brands.favRemove') || 'إزالة من المفضلة') : (t('brands.favAdd') || 'إضافة إلى المفضلة')}" onclick="event.stopPropagation();toggleFavBrand('${b.id}', this)"><i class="fas fa-star"></i></button>`;
    return `<div class="brand-card ${isFav ? 'fav-true' : ''}" data-brand="${b.id}" onclick="openBrandCategories('${b.id}')">
        ${favIcon}
        <div class="brand-image">${brandImageHTML(b)}</div>
        <div class="brand-name">${b.name}</div>
        <div class="brand-country">${b.country}</div>
      </div>`;
  }).join('');
}

function init_brands() {
  const container = document.getElementById('allBrandsGrid');
  if (container) {
    renderBrandsGrid();
  }

  const searchInput = document.getElementById('brandSearch');
  if (searchInput) {
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);

    newInput.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      document.querySelectorAll('#allBrandsGrid .brand-card').forEach(card => {
        const name = card.querySelector('.brand-name').textContent.toLowerCase();
        const country = card.querySelector('.brand-country').textContent.toLowerCase();
        card.style.display = name.includes(q) || country.includes(q) ? '' : 'none';
      });
    });
  }
}

function openBrandCategories(brandId) {
  window.brandCtx = { brandId };
  navigateTo('brand-categories');
}
