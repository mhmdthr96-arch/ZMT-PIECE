function init_discounts() {
  renderDiscounts();
}

function renderDiscounts() {
  const container = document.getElementById('discBody');
  if (!container) return;
  const discounts = DB.getDiscounts().sort((a, b) => b.createdAt - a.createdAt);

  let totalAmount = 0;
  const html = discounts.map((d, i) => {
    totalAmount += d.amount || 0;
    const date = new Date(d.createdAt);
    const dateStr = date.toLocaleDateString('ar-EG-u-nu-latn');
    const timeStr = date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    return `<tr>
      <td>${i + 1}</td>
      <td>${dateStr} ${timeStr}</td>
      <td dir="ltr">${d.invoiceId ? d.invoiceId.substring(0, 8) : '-'}</td>
      <td>${d.customerName || t('discounts.unregistered')}</td>
      <td><span class="badge badge-${d.type === t('common.customer') ? 'success' : 'warning'}">${d.type}</span></td>
      <td>${d.percentage > 0 ? d.percentage + '%' : '-'}</td>
      <td style="color:#e65100;font-weight:600">-DA${(d.amount || 0).toFixed(2)}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteDiscountItem('${d.id}')"><i class="fas fa-trash"></i></button></td>
    </tr>`;
  }).join('');

  document.getElementById('discTotalCount').textContent = discounts.length;
  document.getElementById('discTotalAmount').textContent = `DA${totalAmount.toFixed(2)}`;

  if (discounts.length === 0) {
    container.innerHTML = `<tr><td colspan="8" class="empty-row"><i class="fas fa-percent"></i> ${t('discounts.empty')}</td></tr>`;
    return;
  }
  container.innerHTML = html;
}

function deleteDiscountItem(id) {
  if (!confirm(t('discounts.deleteConfirm'))) return;
  DB.deleteDiscount(id);
  renderDiscounts();
}