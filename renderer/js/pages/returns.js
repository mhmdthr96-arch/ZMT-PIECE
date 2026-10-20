function init_returns() {
  renderReturns();
}

function renderReturns() {
  const container = document.getElementById('returnsGrid');
  if (!container) return;
  const returns = DB.getReturns();

  if (returns.length === 0) {
    container.innerHTML = `<div class="placeholder-box" style="grid-column:1/-1;padding:48px"><i class="fas fa-undo" style="font-size:48px;color:#555"></i><p>${t('returns.empty')}</p></div>`;
    return;
  }

  container.innerHTML = returns.sort((a, b) => b.createdAt - a.createdAt).map((r, i) => {
    const d = new Date(r.createdAt);
    const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn');
    const timeStr = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    return `<div class="prod-card">
      <div class="prod-card-head">
        <div>
          <div class="prod-card-title">${escHtml(r.productName || '-')}</div>
          <div class="prod-card-sub">${t('returns.col1')}: ${escHtml(r.id ? r.id.substring(0, 8).toUpperCase() : '')}</div>
        </div>
        <span class="prod-card-badge">${r.qty} ${t('common.piece')}</span>
      </div>
      <div class="prod-card-fields">
        <div class="prod-field"><span class="prod-field-label">${t('returns.col2')}</span><span class="prod-field-value mono">${escHtml(r.invoiceId ? r.invoiceId.substring(0, 8) : '-')}</span></div>
        <div class="prod-field"><span class="prod-field-label">${t('returns.col5')}</span><span class="prod-field-value">${escHtml(r.reason || t('returns.defaultReason'))}</span></div>
        <div class="prod-field full"><span class="prod-field-label">${t('returns.col6')}</span><span class="prod-field-value">${dateStr} ${timeStr}</span></div>
      </div>
      <div class="prod-card-actions">
        <button class="btn btn-sm btn-danger" onclick="deleteReturn('${r.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
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
  _styleSheet(ws);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t('returns.title'));

  const fileName = `ZMT_PIECE_Returns_${new Date().toISOString().slice(0, 10)}.xlsx`;

  if (window.electronAPI && window.electronAPI.saveFile) {
    window.electronAPI.saveFile({
      defaultPath: fileName,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    }).then(result => {
      if (!result.canceled && result.filePath) {
        const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
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

// FACULITE-style formatting: blue bold header + thin borders on every cell.
function _styleSheet(ws, opts) {
  opts = opts || {};
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
  if (!range) return;
  const THIN = { style: 'thin', color: { rgb: 'B0C4DE' } };
  const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
  const headRow = (opts.headerRow != null ? opts.headerRow : 1);
  const nCols = range.e.c + 1;
  for (let c = 0; c < nCols; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headRow, c: c })];
    if (!cell) continue;
    cell.s = {
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '2F5496' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: BORDER,
    };
  }
  for (let r = headRow + 1; r <= range.e.r; r++) {
    const zebra = ((r - headRow - 1) % 2) === 1;
    for (let c = 0; c < nCols; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
      if (!cell) continue;
      cell.s = cell.s || {};
      cell.s.font = { name: 'Calibri', sz: 11 };
      if (zebra) cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'F2F7FD' } };
      cell.s.alignment = { horizontal: 'center', vertical: 'center' };
      cell.s.border = BORDER;
      if (typeof cell.v === 'number') cell.s.numFmt = '#,##0.00';
    }
  }
  ws['!views'] = [{ RTL: true }];
}

// ===== LAN SYNC: live list refresh =====
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['returns'] = function returnsSyncData() {
  window.syncPreserveRefresh({ render: renderReturns });
};