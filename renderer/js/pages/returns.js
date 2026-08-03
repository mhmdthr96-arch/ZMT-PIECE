function init_returns() {
  renderReturns();
}

function renderReturns() {
  const container = document.getElementById('returnsBody');
  if (!container) return;
  const returns = DB.getReturns();

  if (returns.length === 0) {
    container.innerHTML = `<tr><td colspan="7" class="empty-row"><i class="fas fa-undo"></i> ${t('returns.empty')}</td></tr>`;
    return;
  }

  container.innerHTML = returns.sort((a, b) => b.createdAt - a.createdAt).map((r, i) => {
    const d = new Date(r.createdAt);
    const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn');
    const timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    return `<tr>
      <td>${i + 1}</td>
      <td>${r.invoiceId ? r.invoiceId.substring(0, 8) : '-'}</td>
      <td>${r.productName}</td>
      <td>${r.qty}</td>
      <td>${r.reason || t('returns.defaultReason')}</td>
      <td>${dateStr} ${timeStr}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteReturn('${r.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function deleteReturn(id) {
  if (!confirm(t('returns.deleteConfirm'))) return;
  const list = DB.getReturns();
  const filtered = list.filter(r => r.id !== id);
  DB.saveReturns(filtered);
  renderReturns();
}

function exportReturnsExcel() {
  const returns = DB.getReturns();

  if (returns.length === 0) {
    alert(t('returns.noReturnsExport'));
    return;
  }

  const rows = returns
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r, i) => {
      const d = new Date(r.createdAt);
      return {
        '#': i + 1,
        [t('returns.col1')]: r.id ? r.id.substring(0, 8).toUpperCase() : '',
        [t('common.invoice')]: r.invoiceId || '',
        [t('common.product')]: r.productName || '',
        [t('common.qty')]: r.qty || 0,
        [t('returns.col5')]: r.reason || t('returns.defaultReason'),
        [t('common.date')]: d.toLocaleDateString('ar-EG-u-nu-latn'),
        [t('returns.time')]: d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }),
        [t('common.price')]: r.price || 0,
        [t('common.total')]: (r.price || 0) * (r.qty || 0),
      };
    });

  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 5 },
    { wch: 12 },
    { wch: 20 },
    { wch: 30 },
    { wch: 8 },
    { wch: 20 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t('returns.title'));

  const fileName = `ZMT_PIECE_Returns_${new Date().toISOString().slice(0, 10)}.xlsx`;

  if (window.electronAPI && window.electronAPI.saveFile) {
    window.electronAPI.saveFile({
      defaultPath: fileName,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    }).then(result => {
      if (!result.canceled && result.filePath) {
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        let binary = '';
        for (let i = 0; i < wbout.length; i++) {
          binary += String.fromCharCode(wbout[i]);
        }
        const base64 = btoa(binary);
        window.electronAPI.writeFileBinary(result.filePath, base64).then(res => {
          if (res.success) {
            alert(t('returns.exportSuccess'));
          } else {
            alert(t('returns.exportError') + res.error);
          }
        });
      }
    });
  } else {
    XLSX.writeFile(wb, fileName);
  }
}