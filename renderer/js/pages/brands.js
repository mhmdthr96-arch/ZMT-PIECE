function init_brands() {
  const container = document.getElementById('allBrandsGrid');
  if (container) {
    const all = [...BRANDS.global, ...BRANDS.chinese];
    container.innerHTML = all.map(b =>
      `<div class="brand-card" data-brand="${b.id}" onclick="openBrandCategories('${b.id}')">
        <div class="brand-image">${brandImageHTML(b)}</div>
        <div class="brand-name">${b.name}</div>
        <div class="brand-country">${b.country}</div>
      </div>`
    ).join('');
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