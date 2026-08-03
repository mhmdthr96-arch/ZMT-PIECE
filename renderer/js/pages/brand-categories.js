var CAT_ICONS = {
  'محرك':'fas fa-engine', 'فرامل':'fas fa-brake-warning', 'كشافات':'fas fa-lightbulb',
  'ناقل حركة':'fas fa-cogs', 'تعليق':'fas fa-car', 'كهرباء':'fas fa-bolt',
  'تبريد':'fas fa-snowflake', 'عوادم':'fas fa-smog', 'داخلية':'fas fa-chair',
  'هيكل':'fas fa-caravan'
};
var CAT_COLORS = {
  'محرك':'#c0392b','فرامل':'#e74c3c','كشافات':'#f39c12','ناقل حركة':'#2980b9',
  'تعليق':'#8e44ad','كهرباء':'#2c3e50','تبريد':'#16a085','عوادم':'#7f8c8d',
  'داخلية':'#d35400','هيكل':'#2c3e50'
};

function init_brand_categories() {
  const ctx = window.brandCtx;
  if (!ctx) { navigateTo('brands'); return; }

  const brand = [...BRANDS.global, ...BRANDS.chinese].find(b => b.id === ctx.brandId);
  if (!brand) { navigateTo('brands'); return; }

  document.getElementById('brandTitle').textContent = brand.name;
  document.getElementById('brandSub').textContent = 'اختر نوع القطعة';

  const cats = DB.getCategories();
  const grid = document.getElementById('categoriesGrid');

  grid.innerHTML = cats.map(cat => {
    const count = DB.getProductsByBrandCategory(ctx.brandId, cat).length;
    const icon = CAT_ICONS[cat] || 'fas fa-box';
    const color = CAT_COLORS[cat] || '#0066B1';
    return `<div class="brand-card" onclick="openCategory('${cat}')">
      <div class="brand-image" style="background:${color}20;border-color:${color}40">
        <i class="${icon}" style="font-size:28px;color:${color}"></i>
      </div>
      <div class="brand-name">${cat}</div>
      <div class="brand-country">${count} منتج</div>
    </div>`;
  }).join('');

  document.getElementById('catSearch').oninput = function() {
    const q = this.value.toLowerCase();
    grid.querySelectorAll('.brand-card').forEach(card => {
      card.style.display = card.querySelector('.brand-name').textContent.includes(q) ? '' : 'none';
    });
  };
}

function openCategory(category) {
  window.catCtx = { brandId: window.brandCtx.brandId, category };
  navigateTo('category-products');
}