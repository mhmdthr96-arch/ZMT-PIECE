const MIGRATION_PAGE_SIZE = 20;

let _migrationState = {
  step: 1,
  file: null,
  fileBuffer: null,
  filePath: null,
  fileType: null,
  parsedData: null,
  db: null,
  firebird: null,
  firebirdPagesLoaded: {},
  selectedTable: null,
  headers: [],
  rows: [],
  mapping: {},
  totalRows: 0,
  columnAnalysis: null,
  selectedBrands: [],
  brandConfirmed: false,
  tableRole: 'products',
  previewPage: 0,
  finalPage: 0,
  aiMode: false,
  aiResult: null,
  aiProcessing: false,
};

function openMigration() {
  // Permission gate: the manager can hide «ترحيل البيانات» from a user.
  try {
    if (typeof Auth !== 'undefined' && typeof Auth.canView === 'function' &&
        typeof Auth.isLoggedIn === 'function' && Auth.isLoggedIn() &&
        !Auth.canView('data-migration')) return;
  } catch (e) {}
  _migrationState = { step: 1, file: null, fileBuffer: null, filePath: null, fileType: null, parsedData: null, db: null, firebird: null, firebirdPagesLoaded: {}, selectedTable: null, headers: [], rows: [], mapping: {}, totalRows: 0, columnAnalysis: null, selectedBrands: [], brandConfirmed: false, tableRole: 'products', previewPage: 0, finalPage: 0, aiMode: false, aiResult: null, aiProcessing: false, gestionStock: false, mssqlBak: null, gssp: null };
  document.getElementById('migrationModal').style.display = 'flex';
  document.getElementById('migrationFileInput').value = '';
  document.getElementById('migrationFileInfo').style.display = 'none';
  document.getElementById('migrationDropZone').style.display = 'block';
  document.getElementById('migrationBrandPopup').style.display = 'none';
  document.getElementById('migrationAiChoice').style.display = 'block';
  document.getElementById('migrationStep1').style.display = 'none';
  document.getElementById('migrationNextBtn').disabled = true;
  document.getElementById('migrationBackBtn').style.display = 'none';
  document.getElementById('migrationFullImportPanel').style.display = 'none';
  document.getElementById('migrationFullBrandPopup').style.display = 'none';
  migrationUpdateStatus('', '');
  migrationAttachListeners();
}

function selectMigrationMode(mode) {
  _migrationState.aiMode = (mode === 'ai');
  document.getElementById('migrationAiChoice').style.display = 'none';
  document.getElementById('migrationStep1').style.display = 'block';
  document.getElementById('migrationNextBtn').disabled = true;
  showMigrationStep(1);
}

function backToModeChoice() {
  _migrationState.aiMode = false;
  _migrationState.aiResult = null;
  _migrationState.aiProcessing = false;
  resetMigrationFile();
  document.getElementById('migrationAiChoice').style.display = 'block';
  document.getElementById('migrationStep1').style.display = 'none';
  document.getElementById('migrationNextBtn').disabled = true;
  document.getElementById('migrationBackBtn').style.display = 'none';
  for (let i = 1; i <= 4; i++) {
    document.getElementById('migrationStep' + i).style.display = 'none';
  }
}

function closeMigration() {
  document.getElementById('migrationModal').style.display = 'none';
  if (_migrationState.db && _migrationState.db.close) {
    try { _migrationState.db.close(); } catch(e) {}
  }
}

function resetMigrationFile() {
  _migrationState.file = null;
  _migrationState.fileBuffer = null;
  _migrationState.filePath = null;
  _migrationState.fileType = null;
  _migrationState.parsedData = null;
  _migrationState.db = null;
  _migrationState.firebird = null;
  _migrationState.firebirdPagesLoaded = {};
  _migrationState.gssp = null;
  document.getElementById('migrationFileInput').value = '';
  const sel = document.getElementById('migrationForceType');
  if (sel) sel.value = 'auto';
  const fw = document.getElementById('migrationForceTypeWrap');
  if (fw) fw.style.display = 'none';
  document.getElementById('migrationFileInfo').style.display = 'none';
  document.getElementById('migrationDropZone').style.display = 'block';
  document.getElementById('migrationNextBtn').disabled = true;
}

function showMigrationStep(step) {
  _migrationState.step = step;
  for (let i = 1; i <= 4; i++) {
    document.getElementById('migrationStep' + i).style.display = i === step ? 'block' : 'none';
    const dot = document.getElementById('step' + i + 'dot');
    dot.style.background = i <= step ? 'var(--primary)' : 'var(--silver-300)';
    dot.style.color = i <= step ? '#fff' : 'var(--silver-600)';
  }
  for (let i = 1; i <= 3; i++) {
    document.getElementById('stepLine' + i).style.background = i < step ? 'var(--primary)' : 'var(--silver-300)';
  }
  
  const backBtn = document.getElementById('migrationBackBtn');
  const nextBtn = document.getElementById('migrationNextBtn');
  const importBtn = document.getElementById('migrationImportBtn');
  
  backBtn.style.display = step > 1 ? 'inline-flex' : 'none';
  nextBtn.style.display = step < 4 ? 'inline-flex' : 'none';
  importBtn.style.display = step === 4 ? 'inline-flex' : 'none';
  
  if (step === 1) nextBtn.disabled = !_migrationState.file;
  if (step === 2) nextBtn.disabled = false;
  if (step === 3) nextBtn.disabled = false;
}

async function migrationNextStep() {
  const step = _migrationState.step;
  if (step === 1 && !_migrationState.file) return;
  
  if (step === 1) {
    migrationUpdateStatus(t('migration.reading'), 'info');
    if (!(await migrationPreflight())) return;
    const parsed = await migrationAutoParse();
    if (!parsed) return;
    
    if (_migrationState.aiMode) {
      migrationUpdateStatus('AI: ' + (t('migration.aiAnalyzing') || 'جاري التحليل بالذكاء الاصطناعي...'), 'info');
      const programName = document.getElementById('migrationProgramName')?.value?.trim() || '';
      try {
        const aiResult = await AIAgent.analyzeData(_migrationState.headers, _migrationState.rows, programName);
        _migrationState.aiResult = aiResult;
        if (aiResult && aiResult.mapping) {
          const mapping = {};
          for (const [field, col] of Object.entries(aiResult.mapping)) {
            if (col && col !== 'null' && col !== 'undefined') {
              const idx = _migrationState.headers.indexOf(col);
              if (idx >= 0) mapping[field] = idx;
            }
          }
          _migrationState.mapping = mapping;
        }
        if (aiResult && aiResult.notes) {
          console.log('AI analysis notes:', aiResult.notes);
        }
      } catch (e) {
        migrationUpdateStatus((t('migration.aiError') || 'خطأ AI') + ': ' + e.message, 'error');
        return;
      }
      const modelInfo = AIAgent.getModelInfo ? AIAgent.getModelInfo() : null;
      const modelSuffix = modelInfo?.provider ? ' (' + modelInfo.provider + '/' + modelInfo.model + ')' : '';
      migrationUpdateStatus('AI ' + (t('migration.aiDone') || 'اكتمل التحليل') + modelSuffix, '');
    }
    
    migrationUpdateStatus('', '');
    showMigrationStep(2);
    if (!_migrationState.gestionStock) {
      showMigrationRoleChoice();
    }
    return;
  }
  
  if (step === 2) {
    if (_migrationState.gestionStock) return;
    if (!_migrationState.headers.length) return;
    const rolePopup = document.getElementById('migrationRolePopup');
    if (rolePopup) rolePopup.style.display = 'none';
    if (!_migrationState.aiMode || !_migrationState.mapping || Object.keys(_migrationState.mapping).length === 0) {
      _migrationState.mapping = smartDetectMapping(_migrationState.headers, _migrationState.rows, _migrationState.columnAnalysis);
    }
    autoAssignUnmappedFields();
    renderMigrationMapping();
  }
  if (step === 3) {
    renderMigrationFinal();
  }
  showMigrationStep(Math.min(step + 1, 4));
}

function migrationPrevStep() {
  showMigrationStep(Math.max(_migrationState.step - 1, 1));
}

let _migrationListenersAttached = false;

function migrationAttachListeners() {
  if (_migrationListenersAttached) return;
  _migrationListenersAttached = true;
  
  const input = document.getElementById('migrationFileInput');
  if (input) {
    input.addEventListener('change', handleMigrationFile);
  }
  
  const dropZone = document.getElementById('migrationDropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--primary)';
      dropZone.style.background = 'rgba(0,102,177,0.05)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--silver-400)';
      dropZone.style.background = '';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--silver-400)';
      dropZone.style.background = '';
      if (e.dataTransfer.files.length) {
        processMigrationFile(e.dataTransfer.files[0]);
      }
    });
  }
}

const KNOWN_BRANDS = [
  // ——— ألمانيا ———
  'BMW', 'Mercedes', 'Audi', 'Volkswagen', 'Porsche', 'Opel', 'Smart', 'MAN',
  // ——— اليابان ———
  'Toyota', 'Honda', 'Nissan', 'Mitsubishi', 'Mazda', 'Subaru', 'Suzuki', 'Lexus',
  'Infiniti', 'Acura', 'Daihatsu', 'Isuzu',
  // ——— أمريكا ———
  'Chevrolet', 'Ford', 'Dodge', 'Chrysler', 'Jeep', 'GMC', 'Cadillac', 'Tesla',
  'Lincoln', 'Buick', 'Ram',
  // ——— كوريا ———
  'Hyundai', 'Kia', 'Genesis', 'SsangYong',
  // ——— إيطاليا ———
  'Fiat', 'Alfa Romeo', 'Lancia', 'Iveco',
  // ——— بريطانيا ———
  'Jaguar', 'Land Rover', 'Mini', 'Bentley', 'Rolls-Royce', 'Aston Martin', 'McLaren', 'Lotus',
  // ——— فرنسا ———
  'Renault', 'Peugeot', 'Citroen', 'Bugatti',
  // ——— أوروبا أخرى ———
  'Volvo', 'SEAT', 'Skoda', 'Dacia', 'Scania', 'DAF',
  // ——— الصين ———
  'BYD', 'Geely', 'Chery', 'Jetour', 'Great Wall', 'Ora', 'NIO', 'XPeng',
  'Li Auto', 'SAIC', 'Changan', 'GAC', 'Dongfeng', 'BAIC', 'MG', 'FAW',
  'JAC', 'Zeekr', 'Aion', 'Leapmotor', 'HiPhi', 'Voyah', 'Deepal', 'Seres', 'DFSK', 'Bestune', 'Venucia',
  // ——— أخرى ———
  'Lada', 'Tata', 'Mahindra',
];

function migrationFieldsForRole(role) {
  const all = SmartDetector.ALL_FIELD_IDS || SmartDetector.ALL_FIELDS.map(f => f.id);
  if (role === 'customers') return all.filter(f => ['name', 'phone', 'address', 'notes', 'customer', 'paidAmount', 'invoiceDiscount'].includes(f));
  if (role === 'suppliers') return all.filter(f => ['name', 'phone', 'address', 'notes', 'supplier', 'paidAmount', 'invoiceDiscount'].includes(f));
  if (role === 'salesInvoices' || role === 'purchaseInvoices') return all.filter(f => ['invoiceRef', 'barcode', 'name', 'qty', 'unitPrice', 'invoiceDate', 'invoiceTotal', 'paidAmount', 'invoiceDiscount', 'customer', 'supplier'].includes(f));
  return all;
}

function showMigrationRoleChoice() {
  const popup = document.getElementById('migrationRolePopup');
  if (!popup) { chooseMigrationRole('products'); return; }
  const list = document.getElementById('migrationRoleList');
  const roles = [
    { id: 'products', icon: 'fa-cogs', label: t('migration.roleProducts') || 'قطع غيار / منتجات' },
    { id: 'customers', icon: 'fa-users', label: t('migration.roleCustomers') || 'عملاء' },
    { id: 'suppliers', icon: 'fa-truck', label: t('migration.roleSuppliers') || 'موردون' },
    { id: 'salesInvoices', icon: 'fa-receipt', label: t('migration.roleSalesInvoices') || 'فواتير البيع' },
    { id: 'purchaseInvoices', icon: 'fa-file-invoice-dollar', label: t('migration.rolePurchaseInvoices') || 'فواتير الشراء' },
  ];
  list.innerHTML = roles.map(r => `
    <label style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;cursor:pointer;font-size:13px;color:var(--silver-700);border:1px solid var(--silver-300);transition:all .15s"
           onclick="chooseMigrationRole('${r.id}')">
      <i class="fas ${r.icon}" style="color:var(--primary)"></i>
      <input type="radio" name="migrationRole" style="accent-color:var(--primary)">
      ${escapeHtml(r.label)}
    </label>
  `).join('');
  popup.style.display = 'block';
}

function chooseMigrationRole(role) {
  _migrationState.tableRole = role;
  const popup = document.getElementById('migrationRolePopup');
  if (popup) popup.style.display = 'none';
  document.getElementById('migrationNextBtn').disabled = false;
  if (role === 'products') {
    showBrandSelection();
  } else {
    _migrationState.brandConfirmed = true;
    migrationRunAnalysis();
  }
}

function closeMigrationRole() {
  const role = _migrationState.tableRole || 'products';
  chooseMigrationRole(role);
}

function showBrandSelection() {
  const el = document.getElementById('migrationBrandPopup');
  if (!el) { skipBrandSelection(); return; }
  const list = document.getElementById('migrationBrandList');
  el.style.display = 'block';
  document.getElementById('migrationBrandCustom').value = '';
  document.getElementById('migrationNextBtn').disabled = true;
  const selected = _migrationState.selectedBrands || [];
  list.innerHTML = KNOWN_BRANDS.map(b => `
    <label style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--silver-700);background:${selected.includes(b) ? '#e3f2fd' : 'transparent'};border:1px solid ${selected.includes(b) ? 'var(--primary)' : 'var(--silver-200)'}"
           data-brand="${b}">
      <input type="checkbox" value="${b}" ${selected.includes(b) ? 'checked' : ''} onchange="toggleBrand(this)" style="accent-color:var(--primary)">
      ${b}
    </label>
  `).join('');
}

function toggleBrand(cb) {
  if (!cb) return;
  const label = cb.closest('label');
  if (!label) return;
  if (cb.checked) {
    if (!_migrationState.selectedBrands.includes(cb.value)) _migrationState.selectedBrands.push(cb.value);
    label.style.background = '#e3f2fd';
    label.style.borderColor = 'var(--primary)';
  } else {
    _migrationState.selectedBrands = _migrationState.selectedBrands.filter(b => b !== cb.value);
    label.style.background = 'transparent';
    label.style.borderColor = 'var(--silver-200)';
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function addCustomBrand() {
  const input = document.getElementById('migrationBrandCustom');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  if (_migrationState.selectedBrands.includes(val)) { input.value = ''; return; }
  _migrationState.selectedBrands.push(val);
  input.value = '';
  const list = document.getElementById('migrationBrandList');
  if (!list) return;
  const safe = escapeHtml(val);
  list.innerHTML += `
    <label style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--silver-700);background:#e3f2fd;border:1px solid var(--primary)">
      <input type="checkbox" value="${safe}" checked onchange="toggleBrand(this)" style="accent-color:var(--primary)">
      ${safe}
    </label>
  `;
}

function skipBrandSelection() {
  _migrationState.selectedBrands = [];
  _migrationState.brandConfirmed = true;
  const popup = document.getElementById('migrationBrandPopup');
  if (popup) popup.style.display = 'none';
  document.getElementById('migrationNextBtn').disabled = false;
  migrationRunAnalysis();
}

function confirmBrandSelection() {
  _migrationState.brandConfirmed = true;
  const popup = document.getElementById('migrationBrandPopup');
  if (popup) popup.style.display = 'none';
  document.getElementById('migrationNextBtn').disabled = false;
  SmartDetector.selectedBrands = _migrationState.selectedBrands;
  migrationRunAnalysis();
}

function migrationRunAnalysis() {
  const headers = _migrationState.headers;
  if (!headers.length) return;
  const rows = _migrationState.rows;
  const values = rows.slice(0, 100);
  const analysis = {};
  for (const h of headers) {
    const colVals = values.map(r => r[h]);
    analysis[h] = SmartDetector.analyzeColumn(colVals, h);
  }
  _migrationState.columnAnalysis = analysis;
  renderMigrationPreview();
}

async function handleMigrationFile(e) {
  if (e.target.files.length) {
    await processMigrationFile(e.target.files[0]);
  }
}

// Manual format override. "auto" keeps every historical behaviour; choosing a
// concrete reader only affects the file currently loaded in step 1. It is the
// guaranteed escape hatch for legacy backups whose extension lies about their
// real content.
function migrationForcedType() {
  const sel = document.getElementById('migrationForceType');
  const v = sel ? String(sel.value || 'auto') : 'auto';
  return v && v !== 'auto' ? v : null;
}

function migrationEngineHint(type, err) {
  const msg = (err && err.message) ? err.message : String(err || '');
  let hint = '';
  if (type === 'mssql-bak') hint = t('migration.engineHintSql');
  else if (type === 'firebird') hint = t('migration.engineHintFirebird');
  else if (type === 'sqlite') hint = t('migration.engineHintSqlite');
  else hint = t('migration.engineHintGeneric');
  return (hint ? hint + ' — ' : '') + msg;
}

// Lightweight check only: never installs anything, never duplicates the real
// parser's work. A missing IPC bridge used to surface as a generic read error.
async function migrationPreflight() {
  const type = _migrationState.fileType;
  const api = window.electronAPI || {};
  try {
    if (type === 'mssql-bak' && typeof api.mssqlBakEnsure !== 'function') throw new Error('mssqlBakEnsure unavailable');
    if (type === 'firebird' && typeof api.firebirdDetect !== 'function') throw new Error('firebirdDetect unavailable');
    if (type === 'sqlite' && (!window.FileParsers || typeof window.FileParsers.parseSQLite !== 'function')) {
      throw new Error('parseSQLite unavailable');
    }
  } catch (err) {
    migrationUpdateStatus(migrationEngineHint(type, err), 'error');
    return false;
  }
  return true;
}

async function processMigrationFile(file) {
  try {
    migrationUpdateStatus(t('migration.reading'), 'info');

    const sel = document.getElementById('migrationForceType');
    if (sel) sel.value = 'auto';
    const fw = document.getElementById('migrationForceTypeWrap');
    if (fw) fw.style.display = 'block';

    const buffer = await file.arrayBuffer();
    _migrationState.file = file;
    _migrationState.fileBuffer = buffer;
    _migrationState.filePath = (file && file.path) || null;

    const detected = FileDetector.detect(file.name, buffer);
    const ext = file.name.split('.').pop().toUpperCase();
    const forced = migrationForcedType();
    _migrationState.fileType = forced || detected.type;
    // Backward-compatible fallback only: the detector already maps .bak, but
    // keep the old behaviour if it ever returns nothing conclusive.
    if (!forced && ext === 'BAK' && (!_migrationState.fileType || _migrationState.fileType === 'unknown')) {
      _migrationState.fileType = 'mssql-bak';
    }
    const sizeKB = (file.size / 1024).toFixed(1);
    document.getElementById('migrationFileName').textContent = file.name;
    document.getElementById('migrationFileType').textContent =
      `${ext} • ${sizeKB} KB • ${detected.type}` + (forced ? ` → ${forced}` : '');
    document.getElementById('migrationFileInfo').style.display = 'block';
    document.getElementById('migrationDropZone').style.display = 'none';

    migrationUpdateStatus('', '');
    document.getElementById('migrationNextBtn').disabled = false;

  } catch (err) {
    // Keep the file visible so the user can inspect its type / use the manual
    // override instead of seeing a bare, unexplained "read error".
    const info = document.getElementById('migrationFileInfo');
    if (info) info.style.display = 'block';
    const typeEl = document.getElementById('migrationFileType');
    if (typeEl && !typeEl.textContent) {
      typeEl.textContent = `${String(file && file.name || '')} • ${((file && file.size || 0) / 1024).toFixed(1)} KB`;
    }
    migrationUpdateStatus(t('migration.readError') + ': ' +
      ((err && err.message) ? err.message : String(err)), 'error');
  }
}

async function migrationAutoParse() {
  const buffer = _migrationState.fileBuffer;
  const type = _migrationState.fileType;
  
  try {
    if (type === 'csv' || type === 'text') {
      const result = await FileParsers.parseCSV(buffer);
      _migrationState.headers = result.headers;
      _migrationState.rows = result.rows;
      _migrationState.totalRows = result.totalRows;
      return true;
    }
    
    if (type === 'excel') {
      const result = await FileParsers.parseExcel(buffer);
      _migrationState.headers = result.headers;
      _migrationState.rows = result.rows;
      _migrationState.totalRows = result.totalRows;
      return true;
    }
    
    if (type === 'json') {
      const result = await FileParsers.parseJSON(buffer);
      _migrationState.headers = result.headers;
      _migrationState.rows = result.rows;
      _migrationState.totalRows = result.totalRows;
      return true;
    }
    
    if (type === 'xml') {
      const result = await FileParsers.parseXML(buffer);
      _migrationState.headers = result.headers;
      _migrationState.rows = result.rows;
      _migrationState.totalRows = result.totalRows;
      return true;
    }
    
    if (type === 'sql') {
      const result = await FileParsers.parseSQL(buffer);
      _migrationState.headers = result.headers;
      _migrationState.rows = result.rows;
      _migrationState.totalRows = result.totalRows;
      return true;
    }
    
    if (type === 'dbf') {
      const result = await FileParsers.parseDBF(buffer);
      _migrationState.headers = result.headers;
      _migrationState.rows = result.rows;
      _migrationState.totalRows = result.totalRows;
      return true;
    }
    
    if (type === 'sqlite') {
      const { db, tables } = await FileParsers.parseSQLite(buffer);
      _migrationState.db = db;
      renderMigrationTableSelect(tables);
      return true;
    }
    
    if (type === 'access') {
      migrationUpdateStatus(t('migration.unsupportedDbType') + ' — ' + t('migration.exportHint'), 'warning');
      return false;
    }
    
    if (type === 'firebird') {
      return await migrationParseFirebird();
    }
    
    if (type === 'mssql-bak') {
      return await migrationParseMssqlBak();
    }

    if (type === 'gssp') {
      return await migrationParseGssp();
    }

    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    if (text.length > 0) {
      const result = await FileParsers.parseCSV(buffer);
      _migrationState.headers = result.headers;
      _migrationState.rows = result.rows;
      _migrationState.totalRows = result.totalRows;
      return true;
    }
    
    migrationUpdateStatus(t('migration.cannotRead'), 'error');
    return false;
    
  } catch (err) {
    migrationUpdateStatus(t('migration.parseError') + ': ' + migrationEngineHint(type, err), 'error');
    return false;
  }
}

function renderMigrationTableSelect(tables) {
  const el = document.getElementById('migrationTableList');
  document.getElementById('migrationTableSelect').style.display = 'block';
  document.getElementById('migrationPreview').style.display = 'none';
  
  const handler = _migrationState.firebird ? 'selectFirebirdTable' : (_migrationState.mssqlBak ? 'selectMssqlBakTable' : 'selectMigrationTable');
  el.innerHTML = tables.map(t_name => `
    <div style="padding:12px 16px;margin-bottom:8px;background:var(--silver-100);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:12px;border:2px solid transparent;transition:all 0.2s"
         onclick="${handler}('${t_name}')"
         onmouseover="this.style.borderColor='var(--primary)'"
         onmouseout="this.style.borderColor='transparent'"
         class="migration-table-item" data-table="${t_name}">
      <i class="fas fa-table" style="color:var(--primary);font-size:18px"></i>
      <strong style="color:var(--silver-800)">${t_name}</strong>
    </div>
  `).join('');
}

async function selectMigrationTable(tableName) {
  _migrationState.selectedTable = tableName;
  _migrationState.tableRole = 'products';
  _migrationState.brandConfirmed = false;
  const rolePopup = document.getElementById('migrationRolePopup');
  if (rolePopup) rolePopup.style.display = 'none';
  
  document.querySelectorAll('.migration-table-item').forEach(el => {
    el.style.borderColor = el.dataset.table === tableName ? 'var(--primary)' : 'transparent';
    el.style.background = el.dataset.table === tableName ? '#e3f2fd' : 'var(--silver-100)';
  });
  
  const result = FileParsers.readSQLiteTable(_migrationState.db, tableName);
  _migrationState.headers = result.headers;
  _migrationState.rows = result.rows;
  _migrationState.totalRows = result.totalRows;
  
  showMigrationRoleChoice();
}

async function migrationParseFirebird() {
  const dbPath = _migrationState.filePath;
  if (!dbPath) {
    migrationUpdateStatus(t('migration.firebirdNoPath') || 'تعذر الوصول إلى مسار الملف لقاعدة Firebird', 'error');
    return false;
  }
  const opts = { charset: 'WIN1252' };
  try {
    const ext = String(dbPath).split('.').pop().toLowerCase();
    let openPath = dbPath;
    if (ext === 'fbk') {
      migrationUpdateStatus(t('migration.restoringBackup') || 'جاري استرجاع النسخة الاحتياطية (gbak)...', 'info');
      const res = await window.electronAPI.firebirdRestore(dbPath, { charset: 'WIN1252' });
      if (!res.success) throw new Error(res.error);
      openPath = res.data.path;
    }
    const det = await window.electronAPI.firebirdDetect(openPath, opts);
    if (!det.success) throw new Error(det.error);
    const tablesRes = await window.electronAPI.firebirdTables(openPath, opts);
    if (!tablesRes.success) throw new Error(tablesRes.error);
    const tables = tablesRes.data || [];
    if (!tables.length) {
      migrationUpdateStatus(t('migration.firebirdNoTables') || 'لا توجد جداول قابلة للقراءة في قاعدة البيانات', 'warning');
      return false;
    }
    _migrationState.firebird = { dbPath: openPath, sourcePath: dbPath, isBackup: ext === 'fbk', options: opts, ods: det.data.odsVersion + '.' + det.data.odsMinor };
    document.getElementById('migrationFileType').textContent =
      (document.getElementById('migrationFileType').textContent || '') + ' • Firebird ' + det.data.odsVersion + '.' + det.data.odsMinor;
    const isGestionStock = detectGestionStockSchema(tables.map(t => t.name));
    _migrationState.gestionStock = isGestionStock;
    if (isGestionStock) {
      renderGestionStockFullImportPanel();
    } else {
      renderMigrationTableSelect(tables.map(t => t.name));
    }
    return true;
  } catch (err) {
    migrationUpdateStatus(t('migration.firebirdOpenError') + ': ' + migrationEngineHint('firebird', err), 'error');
    return false;
  }
}

async function migrationParseMssqlBak() {
  try {
    const dbPath = _migrationState.filePath;
    if (!dbPath) {
      migrationUpdateStatus(t('migration.mssqlNoPath') || 'تعذر الوصول إلى مسار ملف النسخة الاحتياطية', 'error');
      return false;
    }
    migrationUpdateStatus(t('migration.preparingEngine') || 'جاري تجهيز محرّك SQL Server...', 'info');
    const ensure = await window.electronAPI.mssqlBakEnsure();
    if (!ensure || !ensure.success || !ensure.data || !ensure.data.ok) {
      throw new Error((ensure && ensure.error) || (ensure && ensure.data && ensure.data.error) || 'engine not ready');
    }
    migrationUpdateStatus(t('migration.restoringBackup') || 'جاري استعادة النسخة الاحتياطية...', 'info');
    const det = await window.electronAPI.mssqlBakDetect(dbPath);
    if (!det.success) throw new Error(det.error);
    const tables = det.data.tables || [];
    if (!tables.length) {
      migrationUpdateStatus(t('migration.mssqlNoTables') || 'لا توجد جداول قابلة للقراءة في نسخة SQL Server', 'warning');
      return false;
    }
    _migrationState.mssqlBak = { bakPath: dbPath };
    _migrationState.firebird = null;
    const isGestionStock = true; // .bak = Gestion Stock SQL Server variant
    _migrationState.gestionStock = isGestionStock;
    document.getElementById('migrationFileType').textContent =
      (document.getElementById('migrationFileType').textContent || '') + ' • SQL Server .bak';
    if (isGestionStock) {
      renderGestionStockFullImportPanel();
    } else {
      // Pre-export all tables so the browse/preview path can read them from cache.
      migrationUpdateStatus(t('migration.restoringBackup') || 'جاري استخراج الجداول...', 'info');
      const exp = await window.electronAPI.mssqlBakExport(dbPath);
      if (!exp || !exp.success) throw new Error((exp && exp.error) || 'export failed');
      _migrationState.mssqlBak.exported = exp.data || {};
      _migrationState.mssqlBak.tableNames = Object.keys(_migrationState.mssqlBak.exported);
      renderMigrationTableSelect(_migrationState.mssqlBak.tableNames);
    }
    return true;
  } catch (err) {
    migrationUpdateStatus((t('migration.mssqlOpenError') || 'تعذر فتح نسخة SQL Server (.bak)') + ': ' + migrationEngineHint('mssql-bak', err), 'error');
    return false;
  }
}

async function selectFirebirdTable(tableName) {
  _migrationState.selectedTable = tableName;
  _migrationState.tableRole = 'products';
  _migrationState.brandConfirmed = false;
  const rolePopup = document.getElementById('migrationRolePopup');
  if (rolePopup) rolePopup.style.display = 'none';
  _migrationState.firebirdPagesLoaded = {};

  document.querySelectorAll('.migration-table-item').forEach(el => {
    el.style.borderColor = el.dataset.table === tableName ? 'var(--primary)' : 'transparent';
    el.style.background = el.dataset.table === tableName ? '#e3f2fd' : 'var(--silver-100)';
  });

  const { dbPath, options } = _migrationState.firebird;
  try {
    const colsRes = await window.electronAPI.firebirdColumns(dbPath, tableName, options);
    if (!colsRes.success) throw new Error(colsRes.error);
    const cols = (colsRes.data || []).map(c => c.name);
    const countRes = await window.electronAPI.firebirdCount(dbPath, tableName, options);
    if (!countRes.success) throw new Error(countRes.error);
    const total = countRes.data || 0;

    _migrationState.headers = cols;
    _migrationState.totalRows = total;
    _migrationState.rows = new Array(total);
    _migrationState.rows.fill(null);

    await ensureFirebirdRows(0, Math.min(200, total));
    showMigrationRoleChoice();
  } catch (err) {
    migrationUpdateStatus(t('migration.firebirdTableError') + ': ' + err.message, 'error');
  }
}

async function selectMssqlBakTable(tableName) {
  _migrationState.selectedTable = tableName;
  _migrationState.tableRole = 'products';
  _migrationState.brandConfirmed = false;
  const rolePopup = document.getElementById('migrationRolePopup');
  if (rolePopup) rolePopup.style.display = 'none';
  document.querySelectorAll('.migration-table-item').forEach(el => {
    el.style.borderColor = el.dataset.table === tableName ? 'var(--primary)' : 'transparent';
    el.style.background = el.dataset.table === tableName ? '#e3f2fd' : 'var(--silver-100)';
  });
  try {
    const rows = (_migrationState.mssqlBak.exported || {})[tableName] || [];
    const cols = rows.length ? Object.keys(rows[0]) : [];
    _migrationState.headers = cols;
    _migrationState.totalRows = rows.length;
    _migrationState.rows = rows.slice();
    showMigrationRoleChoice();
  } catch (err) {
    migrationUpdateStatus((t('migration.firebirdTableError') || 'تعذر قراءة الجدول') + ': ' + err.message, 'error');
  }
}

async function loadFirebirdPage(page) {
  if (!_migrationState.firebird) return;
  if (_migrationState.firebirdPagesLoaded[page]) return;
  const { dbPath, options } = _migrationState.firebird;
  const table = _migrationState.selectedTable;
  const headers = _migrationState.headers;
  const start = page * MIGRATION_PAGE_SIZE;
  const end = Math.min(start + MIGRATION_PAGE_SIZE, _migrationState.totalRows);
  if (start >= end) return;
  try {
    const res = await window.electronAPI.firebirdQuery(dbPath, table, headers, start, end, options);
    if (!res.success) throw new Error(res.error);
    const pageRows = res.data || [];
    for (let i = 0; i < pageRows.length; i++) {
      _migrationState.rows[start + i] = pageRows[i];
    }
    _migrationState.firebirdPagesLoaded[page] = true;
  } catch (err) {
    console.error('[Migration] Firebird page error:', err);
  }
}

async function ensureFirebirdRows(start, end) {
  if (!_migrationState.firebird) return;
  const firstPage = Math.floor(start / MIGRATION_PAGE_SIZE);
  const lastPage = Math.floor(Math.max(end - 1, start) / MIGRATION_PAGE_SIZE);
  for (let p = firstPage; p <= lastPage; p++) {
    await loadFirebirdPage(p);
  }
}

function renderPagination(containerId, total, page, onChange) {
  const totalPages = Math.max(1, Math.ceil(total / MIGRATION_PAGE_SIZE));
  const el = document.getElementById(containerId);
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  let html = '<div style="display:flex;align-items:center;gap:4px;justify-content:center;margin-top:8px;flex-wrap:wrap">';
  html += `<button class="btn btn-sm" ${page === 0 ? 'disabled' : ''} onclick="${onChange}(0)"><i class="fas fa-angle-double-right"></i></button>`;
  html += `<button class="btn btn-sm" ${page === 0 ? 'disabled' : ''} onclick="${onChange}(${page - 1})"><i class="fas fa-angle-right"></i></button>`;
  const start = Math.max(0, page - 2);
  const end = Math.min(totalPages, page + 3);
  if (start > 0) html += `<button class="btn btn-sm" onclick="${onChange}(0)">1</button>...`;
  for (let i = start; i < end; i++) {
    html += `<button class="btn btn-sm" style="${i === page ? 'background:var(--primary);color:#fff' : ''}" onclick="${onChange}(${i})">${i + 1}</button>`;
  }
  if (end < totalPages) html += `...<button class="btn btn-sm" onclick="${onChange}(${totalPages - 1})">${totalPages}</button>`;
  html += `<button class="btn btn-sm" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="${onChange}(${page + 1})"><i class="fas fa-angle-left"></i></button>`;
  html += `<button class="btn btn-sm" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="${onChange}(${totalPages - 1})"><i class="fas fa-angle-double-left"></i></button>`;
  html += `<span style="font-size:11px;color:var(--silver-500);margin-right:8px">${page + 1}/${totalPages}</span>`;
  html += '</div>';
  el.innerHTML = html;
}

function migrationPreviewGoTo(page) {
  _migrationState.previewPage = page;
  renderMigrationPreview();
}

function migrationFinalGoTo(page) {
  _migrationState.finalPage = page;
  renderMigrationFinal();
}

async function renderMigrationPreview() {
  const headers = _migrationState.headers;
  const rows = _migrationState.rows;
  const analysis = _migrationState.columnAnalysis || {};
  const page = _migrationState.previewPage || 0;
  const totalPages = Math.max(1, Math.ceil(rows.length / MIGRATION_PAGE_SIZE));
  if (page >= totalPages) _migrationState.previewPage = totalPages - 1;
  await ensureFirebirdRows(page * MIGRATION_PAGE_SIZE, (page + 1) * MIGRATION_PAGE_SIZE);

  document.getElementById('migrationTableSelect').style.display = 'none';
  document.getElementById('migrationPreview').style.display = 'block';
  
  document.getElementById('migrationRowCount').textContent = `(${rows.length} / ${_migrationState.totalRows})`;
  document.getElementById('migrationColCount').textContent = `${headers.length} ${t('migration.columns')}`;
  
  document.getElementById('migrationAiBadge').style.display = _migrationState.aiMode ? 'inline-flex' : 'none';
  if (_migrationState.aiMode && _migrationState.aiResult) {
    const badgeEl = document.getElementById('migrationAiBadge');
    const modelInfo = AIAgent.getModelInfo ? AIAgent.getModelInfo() : null;
    const modelLabel = modelInfo?.provider ? ' [' + modelInfo.provider + '/' + modelInfo.model + ']' : '';
    badgeEl.innerHTML = '<i class="fas fa-robot"></i> AI' + modelLabel + ': ' + (t('migration.aiAnalyzed') || 'تم التحليل بالذكاء الاصطناعي') + ' — الثقة: ' + (_migrationState.aiResult.confidence || '—') + '%';
  }

  const table = document.getElementById('migrationPreviewTable');
  const start = _migrationState.previewPage * MIGRATION_PAGE_SIZE;
  const pageRows = rows.slice(start, start + MIGRATION_PAGE_SIZE);
  
  function badge(score) {
    if (score >= 80) return '<span style="background:#28a745;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px">عالي</span>';
    if (score >= 55) return '<span style="background:#ffc107;color:#333;padding:1px 6px;border-radius:4px;font-size:10px">متوسط</span>';
    return '<span style="background:#dc3545;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px">منخفض</span>';
  }
  function aiBadge() {
    return '<span style="background:#9c27b0;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px"><i class="fas fa-robot"></i> AI</span>';
  }

  let html = '<thead><tr>';
  headers.forEach(h => {
    html += `<th style="padding:8px 12px;background:var(--silver-200);text-align:left;font-size:11px;font-weight:700;color:var(--silver-700);white-space:nowrap">${h}</th>`;
  });
  html += '</tr><tr>';
  headers.forEach(h => {
    const info = analysis[h];
    const top = info?.candidates?.[0];
    const aiMapped = _migrationState.aiMode && _migrationState.aiResult?.mapping ? Object.entries(_migrationState.aiResult.mapping).find(([, col]) => col === h) : null;
    const aiLabel = aiMapped ? aiBadge() + ' ' + SmartDetector.fieldLabel(aiMapped[0]) : '';
    if (top) {
      html += `<td style="padding:2px 12px;font-size:10px;color:var(--silver-600);white-space:nowrap;border:none">${badge(top.score)} ${SmartDetector.fieldLabel(top.field)}${aiLabel ? ' ' + aiLabel : ''}</td>`;
    } else if (aiLabel) {
      html += `<td style="padding:2px 12px;font-size:10px;color:var(--silver-600);white-space:nowrap;border:none">${aiLabel}</td>`;
    } else {
      html += `<td style="padding:2px 12px;font-size:10px;color:#999;white-space:nowrap;border:none">—</td>`;
    }
  });
  html += '</tr></thead><tbody>';
  
  pageRows.forEach(row => {
    html += '<tr>';
    headers.forEach(h => {
      const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
      html += `<td style="padding:6px 12px;border-bottom:1px solid var(--silver-200);color:var(--silver-700);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${val}</td>`;
    });
    html += '</tr>';
  });
  
  if (pageRows.length === 0) {
    html += `<tr><td colspan="${headers.length}" style="padding:20px;text-align:center;color:var(--silver-500)">${t('common.noData') || 'لا توجد بيانات'}</td></tr>`;
  }
  
  html += '</tbody>';
  table.innerHTML = html;
  renderPagination('migrationPreviewPaginator', rows.length, _migrationState.previewPage, 'migrationPreviewGoTo');
}

function renderMigrationMapping() {
  const el = document.getElementById('migrationMapping');
  const headers = _migrationState.headers;
  const mapping = _migrationState.mapping;
  const analysis = _migrationState.columnAnalysis || {};
  const fields = migrationFieldsForRole(_migrationState.tableRole || 'products');
  
  // Build reverse index: which field is assigned to each header index
  const assigned = {};
  for (const [field, idx] of Object.entries(mapping)) {
    assigned[idx] = field;
  }

  const noMapping = t('migration.noMapping') || 'بدون';
  
  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
  
  fields.forEach(field => {
    const label = KeywordMatcher.getFieldLabel(field);
    const matchedIdx = mapping[field];
    const matchedHeader = matchedIdx !== undefined ? headers[matchedIdx] : '';

    let bestSuggestion = null;
    let bestScore = 0;
    for (let i = 0; i < headers.length; i++) {
      const info = analysis[headers[i]];
      const match = info?.candidates?.find(c => c.field === field);
      if (match && match.score > bestScore && !assigned[i]) {
        bestScore = match.score;
        bestSuggestion = { idx: i, header: headers[i], score: match.score, detail: match.detail };
      }
    }

    const autoIdx = bestSuggestion?.idx;
    const defaultMapping = matchedIdx !== undefined ? matchedIdx : (autoIdx !== undefined ? autoIdx : '');

    function confBadge(score) {
      if (score >= 80) return '<span style="background:#28a745;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px">تلقائي</span>';
      if (score >= 55) return '<span style="background:#ffc107;color:#333;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px">مقترح</span>';
      return '';
    }

    html += `
      <div style="padding:10px 14px;background:var(--silver-100);border-radius:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="min-width:90px;flex-shrink:0">
            <div style="font-size:10px;color:var(--silver-500)">${label}</div>
            <div style="font-weight:700;color:var(--silver-800);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${matchedHeader || (bestSuggestion ? headers[autoIdx] : '—')} ${bestSuggestion ? confBadge(bestScore) : ''}
            </div>
          </div>
          <i class="fas fa-arrow-left" style="color:var(--silver-400);font-size:11px;flex-shrink:0"></i>
          <div style="flex:1;min-width:0">
            <select style="width:100%;padding:6px 8px;border:1px solid var(--silver-300);border-radius:6px;font-size:12px;background:#fff;color:var(--silver-800)"
                    onchange="updateMigrationMapping('${field}', this.value)">
              <option value="">— ${noMapping} —</option>
              ${headers.map((h, i) => {
                const info = analysis[h];
                const match = info?.candidates?.find(c => c.field === field);
                const alreadyAssigned = assigned[i] && assigned[i] !== field;
                const scoreLabel = match ? ` [${match.score}%]` : '';
                const assignedLabel = alreadyAssigned ? ` ← ${KeywordMatcher.getFieldLabel(assigned[i])}` : '';
                const sel = String(i) === String(defaultMapping) ? 'selected' : '';
                return `<option value="${i}" ${sel}>${h}${scoreLabel}${assignedLabel}</option>`;
              }).join('')}
            </select>
            ${bestSuggestion && matchedIdx === undefined ? `<div style="font-size:9px;color:#28a745;margin-top:3px">✓ ${bestSuggestion.detail}</div>` : ''}
            ${matchedIdx !== undefined && bestSuggestion && bestSuggestion.idx !== matchedIdx ? `<div style="font-size:9px;color:var(--silver-400);margin-top:3px">تم التحديد يدوياً</div>` : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  el.innerHTML = html;
}

function smartDetectMapping(headers, rows, analysis) {
  const mapping = {};
  const used = new Set();
  const fields = migrationFieldsForRole(_migrationState.tableRole || 'products');

  const byHeader = SmartDetector.matchColumns(headers);
  for (const [field, idx] of Object.entries(byHeader)) {
    if (!used.has(idx)) { mapping[field] = idx; used.add(idx); }
  }

  for (const field of fields) {
    if (mapping[field] !== undefined) continue;
    let best = { idx: -1, score: 0 };
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const info = analysis?.[headers[i]];
      const match = info?.candidates?.find(c => c.field === field);
      if (match && match.score > best.score) { best = { idx: i, score: match.score }; }
    }
    if (best.idx >= 0 && best.score >= 55) { mapping[field] = best.idx; used.add(best.idx); }
  }

  for (const field of fields) {
    if (mapping[field] !== undefined) continue;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const info = analysis?.[headers[i]];
      const match = info?.candidates?.find(c => c.field === field);
      if (match) { mapping[field] = i; used.add(i); break; }
    }
  }

  return mapping;
}

function autoAssignUnmappedFields() {
  const headers = _migrationState.headers;
  const analysis = _migrationState.columnAnalysis || {};
  const fields = migrationFieldsForRole(_migrationState.tableRole || 'products');
  const used = new Set(Object.values(_migrationState.mapping));
  for (const f of fields) {
    if (_migrationState.mapping[f] !== undefined) continue;
    let best = { idx: -1, score: 0 };
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const info = analysis[headers[i]];
      const match = info?.candidates?.find(c => c.field === f);
      if (match && match.score > best.score) { best = { idx: i, score: match.score }; }
    }
    if (best.idx >= 0) {
      _migrationState.mapping[f] = best.idx;
      used.add(best.idx);
    }
  }
}

function updateMigrationMapping(field, value) {
  const idx = value === '' ? undefined : parseInt(value);
  const headers = _migrationState.headers;
  const analysis = _migrationState.columnAnalysis || {};
  const fields = migrationFieldsForRole(_migrationState.tableRole || 'products');

  // Remove old mapping for this field
  delete _migrationState.mapping[field];

  // If a column was assigned, remove any other field mapping to the same column
  if (idx !== undefined) {
    for (const f of fields) {
      if (f !== field && _migrationState.mapping[f] === idx) {
        delete _migrationState.mapping[f];
      }
    }
    _migrationState.mapping[field] = idx;
  }

  autoAssignUnmappedFields();
  renderMigrationMapping();
}

async function renderMigrationFinal() {
  const mapping = _migrationState.mapping;
  const headers = _migrationState.headers;
  const rows = _migrationState.rows;
  const page = _migrationState.finalPage || 0;
  const totalPages = Math.max(1, Math.ceil(rows.length / MIGRATION_PAGE_SIZE));
  if (page >= totalPages) _migrationState.finalPage = totalPages - 1;
  await ensureFirebirdRows(page * MIGRATION_PAGE_SIZE, (page + 1) * MIGRATION_PAGE_SIZE);
  
  const mappedFields = Object.keys(mapping);
  document.getElementById('migrationFinalCount').textContent = rows.length;
  document.getElementById('migrationMappedCount').textContent = mappedFields.length;
  
  const mappedHeaders = mappedFields.map(f => KeywordMatcher.getFieldLabel(f));
  
  const table = document.getElementById('migrationFinalTable');
  const start = _migrationState.finalPage * MIGRATION_PAGE_SIZE;
  const pageRows = rows.slice(start, start + MIGRATION_PAGE_SIZE);
  
  let html = '<thead><tr>';
  mappedHeaders.forEach(h => {
    html += `<th style="padding:8px 12px;background:#28a745;color:#fff;text-align:left;font-size:11px;font-weight:700;white-space:nowrap">${h}</th>`;
  });
  html += '</tr></thead><tbody>';
  
  pageRows.forEach(row => {
    html += '<tr>';
    mappedFields.forEach(field => {
      const idx = mapping[field];
      const val = idx !== undefined && row[headers[idx]] !== undefined ? String(row[headers[idx]]) : '';
      html += `<td style="padding:6px 12px;border-bottom:1px solid var(--silver-200);color:var(--silver-700);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${val}</td>`;
    });
    html += '</tr>';
  });
  
  if (pageRows.length === 0) {
    html += `<tr><td colspan="${mappedHeaders.length}" style="padding:20px;text-align:center;color:var(--silver-500)">${t('common.noData') || 'لا توجد بيانات'}</td></tr>`;
  }
  
  html += '</tbody>';
  table.innerHTML = html;
  renderPagination('migrationFinalPaginator', rows.length, _migrationState.finalPage, 'migrationFinalGoTo');
}

async function importPeople(role) {
  const mapping = _migrationState.mapping;
  const headers = _migrationState.headers;
  const rows = _migrationState.rows;

  if (mapping.name === undefined && mapping[role === 'customers' ? 'customer' : 'supplier'] === undefined) {
    migrationUpdateStatus(t('migration.needName'), 'error');
    return;
  }

  if (_migrationState.firebird) {
    migrationUpdateStatus(t('migration.importing'), 'info');
    await ensureFirebirdRows(0, _migrationState.totalRows);
  }
  migrationUpdateStatus(t('migration.importing'), 'info');

  const rv = (row, field) => {
    const idx = mapping[field];
    return idx !== undefined ? String(row[headers[idx]] || '') : '';
  };
  const rn = (row, field) => {
    const idx = mapping[field];
    if (idx === undefined) return 0;
    return parseFloat(String(row[headers[idx]] || '').replace(/[^0-9.\-]/g, '')) || 0;
  };

  const norm = s => String(s || '').trim().toLowerCase();
  const seen = new Set();
  const added = [];
  const isCustomers = role === 'customers';

  if (isCustomers) {
    const existing = new Set(DB.getCustomers().map(c => norm(c.name)));
    const credits = new Map();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = rv(row, 'name') || rv(row, 'customer');
      if (!name || seen.has(norm(name)) || existing.has(norm(name))) continue;
      seen.add(norm(name));
      const credit = rn(row, 'paidAmount');
      if (credit) credits.set(norm(name), credit);
      added.push(DB.addCustomer({
        name: name.trim(),
        phone: rv(row, 'phone'),
        address: rv(row, 'address') || rv(row, 'notes'),
        discount: rn(row, 'invoiceDiscount'),
      }));
      if (added.length % 200 === 0) {
        setImportStatus(`${t('migration.roleCustomers') || 'العملاء'}: ${added.length}`);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    if (credits.size) {
      const all = DB.getCustomers();
      for (const c of added) {
        const cr = credits.get(norm(c.name));
        if (cr) c.balance = cr;
      }
      DB.saveCustomers(all);
    }
  } else {
    const existing = new Set(DB.getSuppliers().map(s => norm(s.name)));
    const newList = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = rv(row, 'name') || rv(row, 'supplier');
      if (!name || seen.has(norm(name)) || existing.has(norm(name))) continue;
      seen.add(norm(name));
      newList.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + i,
        name: name.trim(),
        phone: rv(row, 'phone'),
        address: rv(row, 'address') || rv(row, 'notes'),
        balance: rn(row, 'paidAmount'),
      });
      if (newList.length % 200 === 0) {
        setImportStatus(`${t('migration.roleSuppliers') || 'الموردون'}: ${newList.length}`);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    const all = DB.getSuppliers();
    for (const s of newList) all.push(s);
    DB.saveSuppliers(all);
    added.push(...newList);
  }

  const label = isCustomers ? (t('migration.roleCustomers') || 'عميل') : (t('migration.roleSuppliers') || 'مورد');
  migrationUpdateStatus(`✓ ${t('migration.importDone') || 'تم الاستيراد بنجاح'}: ${added.length} ${label}`, 'success');

  document.getElementById('migrationImportBtn').style.display = 'none';
  document.getElementById('migrationNextBtn').style.display = 'none';
}

async function migrationLoadTableFull(tableName) {
  if (!tableName) return [];
  try {
    if (_migrationState.firebird) {
      const { dbPath, options } = _migrationState.firebird;
      const colsRes = await window.electronAPI.firebirdColumns(dbPath, tableName, options);
      if (!colsRes.success) return [];
      const cols = (colsRes.data || []).map(c => c.name);
      const cntRes = await window.electronAPI.firebirdCount(dbPath, tableName, options);
      const total = cntRes.success ? (cntRes.data || 0) : 0;
      if (total <= 0 || !cols.length) return [];
      const q = await window.electronAPI.firebirdQuery(dbPath, tableName, cols, 0, total, options);
      return q.success ? (q.data || []) : [];
    }
    if (_migrationState.db) {
      const r = FileParsers.readSQLiteTable(_migrationState.db, tableName);
      return r.rows || [];
    }
  } catch (err) {
    console.warn('[Migration] load table failed:', tableName, err);
  }
  return [];
}

async function importInvoices(role) {
  const isSales = role === 'salesInvoices';
  const mapping = _migrationState.mapping;
  const selectedUp = String(_migrationState.selectedTable || '').toUpperCase();
  const standardDetail = isSales ? 'DETAIL_FACTURE_CLIENT' : 'DETAIL_FACTURE_FOURNISSEUR';
  const standardHeader = isSales ? 'FACTURE_CLIENT' : 'FACTURE_FOURNISSEUR';
  const partyTable = isSales ? 'CLIENT' : 'FOURNISSEUR';
  const partyCodeCol = isSales ? 'CODE_CLIENT' : 'CODE_FOURNISSEUR';
  const partyNameCol = isSales ? 'NOM_CLIENT' : 'NOM_FOURNISSEUR';

  migrationUpdateStatus(t('migration.importing'), 'info');
  if (_migrationState.firebird) await ensureFirebirdRows(0, _migrationState.totalRows);

  const num = (v) => { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
  const txt = (v) => String(v === undefined || v === null ? '' : v).trim();

  let detailRows = selectedUp === standardDetail ? _migrationState.rows : null;
  let headerRows = selectedUp === standardHeader ? _migrationState.rows : null;

  const partyRows = await migrationLoadTableFull(partyTable);
  const articleRows = await migrationLoadTableFull('ARTICLES');
  const articleMap = {};
  for (const r of articleRows) {
    const ref = txt(r['REFERENCE']);
    if (ref) articleMap[ref] = { name: txt(r['DESIGNATION']), buyPrice: num(r['PRIX_ACHAT']), sellPrice: num(r['PRIX1']), mark: txt(r['MARQUE']) };
  }

  if (detailRows === null) detailRows = await migrationLoadTableFull(standardDetail);
  if (headerRows === null) headerRows = await migrationLoadTableFull(standardHeader);

  const selectedHeaders = _migrationState.headers;
  const readRow = (row, field, fallback) => {
    if (mapping[field] !== undefined && mapping[field] < selectedHeaders.length) {
      const v = row[selectedHeaders[mapping[field]]];
      if (v !== undefined && v !== null && txt(v) !== '') return v;
    }
    if (row[fallback] !== undefined && row[fallback] !== null) return row[fallback];
    return '';
  };

  const partyByCode = {};
  for (const r of partyRows) {
    const code = txt(r[partyCodeCol]);
    if (code) partyByCode[code] = { name: txt(r[partyNameCol]), phone: txt(r['TEL']) || txt(r['MOBILE']), address: txt(r['ADRESSE']) };
  }

  const headerByNum = new Map();
  for (const r of headerRows) {
    const fnum = txt(r['N_FACTURE']);
    if (!fnum) continue;
    headerByNum.set(fnum, {
      partyCode: txt(r[partyCodeCol]),
      date: txt(r['DATE_FACTURE']),
      paid: num(r['VERSEMENT']),
      discount: isSales ? num(r['TOTAL_REMISE']) : 0,
    });
  }

  const itemsByNum = new Map();
  for (const row of detailRows) {
    const fnum = txt(readRow(row, 'invoiceRef', 'N_FACTURE'));
    const barcode = txt(readRow(row, 'barcode', 'REFERENCE_ARTICLE'));
    if (!fnum || !barcode) continue;
    const qty = num(readRow(row, 'qty', 'QUANTITE')) || 1;
    const price = num(readRow(row, 'unitPrice', isSales ? 'PUV' : 'PRIX1'));
    if (!itemsByNum.has(fnum)) itemsByNum.set(fnum, []);
    itemsByNum.get(fnum).push({ barcode, qty, price });
  }

  const newProducts = new Map();
  if (!isSales) {
    for (const items of itemsByNum.values()) {
      for (const it of items) {
        if (DB.getProductByBarcode(it.barcode) || newProducts.has(it.barcode)) continue;
        const a = articleMap[it.barcode];
        newProducts.set(it.barcode, {
          name: (a && a.name) || it.barcode,
          barcode: it.barcode,
          brandId: '',
          mark: (a && a.mark) || '',
          category: '',
          buyPrice: (a && a.buyPrice) || it.price,
          sellPrice: (a && a.sellPrice) || it.price,
          quantity: 0,
          supplierId: '',
          notes: t('migration.importedNote') || 'مستورد',
        });
      }
    }
  }
  let productsCreated = 0;
  if (newProducts.size) {
    const created = await DB.addProductsBatch([...newProducts.values()], null, { source: 'import-invoices' });
    productsCreated = created.length;
    for (const p of created) newProducts.set(p.barcode, p);
  }

  const findSupplier = (name) => name ? (DB.getSuppliers().find(s => s.name.toLowerCase() === name.trim().toLowerCase()) || null) : null;
  const findCustomer = (name) => name ? (DB.getCustomers().find(c => c.name.toLowerCase() === name.trim().toLowerCase()) || null) : null;

  const supplierCache = {};
  const customerCache = {};
  const newSuppliers = [];
  const getSupplierId = (name, code) => {
    const fb = (name || ('مورد - ' + (code || '')));
    const ex = findSupplier(fb);
    if (ex) return ex.id;
    if (supplierCache[fb]) return supplierCache[fb];
    const s = { id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5), name: fb, phone: '', address: '', balance: 0 };
    supplierCache[fb] = s.id;
    newSuppliers.push(s);
    return s.id;
  };
  const getCustomer = (name, phone, address) => {
    if (!name) return null;
    const ex = findCustomer(name);
    if (ex) return ex;
    if (customerCache[name]) return customerCache[name];
    const c = DB.addCustomer({ name, phone: phone || '', address: address || '', discount: 0 });
    customerCache[name] = c;
    return c;
  };

  let invoicesCreated = 0;
  let linesCreated = 0;
  const allNums = new Set([...headerByNum.keys(), ...itemsByNum.keys()]);

  for (const fnum of allNums) {
    const items = itemsByNum.get(fnum) || [];
    if (!items.length) continue;
    const hdr = headerByNum.get(fnum);

    let customerId = '';
    let walkinName = '';
    let supplierId = '';
    let partyName = '';
    let phone = '';
    let address = '';
    if (hdr) {
      const p = partyByCode[hdr.partyCode];
      if (p) { partyName = p.name; phone = p.phone; address = p.address; }
    }

    if (isSales) {
      const cust = getCustomer(partyName, phone, address);
      if (cust) customerId = cust.id;
      else walkinName = partyName || ('عميل - ' + (hdr ? hdr.partyCode : ''));
    } else {
      supplierId = getSupplierId(partyName, hdr ? hdr.partyCode : '');
    }

    const invItems = [];
    for (const it of items) {
      let pid = DB.getProductByBarcode(it.barcode);
      if (!pid) { const np = newProducts.get(it.barcode); if (np && np.id) pid = np; }
      if (!pid) continue;
      invItems.push({ productId: pid.id, barcode: it.barcode, name: pid.name || it.barcode, qty: it.qty, price: it.price, total: it.qty * it.price });
    }
    if (!invItems.length) continue;

    const totalAmount = invItems.reduce((s, it) => s + it.total, 0);
    const paid = hdr ? hdr.paid : 0;
    const discount = hdr ? hdr.discount : 0;
    const invData = {
      type: isSales ? 'customer' : 'supplier',
      date: Date.now(),
      items: invItems,
      totalAmount,
      extraDiscount: discount,
      note: (t('migration.oldInvoiceNote') || 'فاتورة مستوردة') + (fnum ? ' — ' + fnum : ''),
    };
    if (hdr && hdr.date) {
      const parsed = new Date(hdr.date);
      if (!isNaN(parsed.getTime())) invData.date = parsed.getTime();
    }
    if (isSales) {
      if (customerId) invData.customerId = customerId;
      else { invData.walkinName = walkinName; invData.walkinPhone = ''; invData.walkinAddress = ''; }
      invData.profit = invItems.reduce((sum, it) => {
        const p = DB.getProductByBarcode(it.barcode);
        return sum + it.total - (p ? it.qty * (p.buyPrice || 0) : 0);
      }, 0);
    } else {
      invData.supplierId = supplierId;
    }

    const inv = DB.addInvoice(invData);

    if (paid > 0) {
      const pmt = { amount: paid, invoiceId: inv.id, note: t('migration.oldPaymentNote') || 'مدفوعات مستوردة' };
      if (isSales) pmt.customerId = customerId || undefined;
      else pmt.supplierId = supplierId;
      DB.addPayment(pmt);
    }

    for (const it of invItems) {
      const p = DB.getProductByBarcode(it.barcode);
      if (!p) continue;
      if (isSales) DB.updateProduct(p.id, { quantity: Math.max(0, (p.quantity || 0) - it.qty) });
      else DB.updateProduct(p.id, { quantity: (p.quantity || 0) + it.qty });
    }

    if (!isSales && supplierId) {
      const list = DB.getSuppliers();
      const si = list.findIndex(s => s.id === supplierId);
      if (si >= 0) { list[si].balance = (parseFloat(list[si].balance) || 0) + (totalAmount - paid); DB.saveSuppliers(list); }
    } else if (isSales && customerId) {
      const list = DB.getCustomers();
      const ci = list.findIndex(c => c.id === customerId);
      if (ci >= 0) { list[ci].balance = (parseFloat(list[ci].balance) || 0) + (totalAmount - paid - discount); DB.saveCustomers(list); }
    }

    invoicesCreated++;
    linesCreated += invItems.length;
    if (invoicesCreated % 25 === 0) {
      setImportStatus(`${isSales ? (t('migration.roleSalesInvoices') || 'فواتير البيع') : (t('migration.rolePurchaseInvoices') || 'فواتير الشراء')}: ${invoicesCreated}`);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  if (newSuppliers.length) {
    const all = DB.getSuppliers();
    for (const s of newSuppliers) all.push(s);
    DB.saveSuppliers(all);
  }

  const roleLabel = isSales ? (t('migration.roleSalesInvoices') || 'فاتورة بيع') : (t('migration.rolePurchaseInvoices') || 'فاتورة شراء');
  migrationUpdateStatus(`✓ ${t('migration.importDone') || 'تم الاستيراد بنجاح'}: ${invoicesCreated} ${roleLabel}`, 'success');
  document.getElementById('migrationImportBtn').style.display = 'none';
  document.getElementById('migrationNextBtn').style.display = 'none';
}

async function migrationDoImport() {
  const role = _migrationState.tableRole || 'products';
  if (role === 'customers' || role === 'suppliers') {
    await importPeople(role);
    return;
  }
  if (role === 'salesInvoices' || role === 'purchaseInvoices') {
    await importInvoices(role);
    return;
  }
  const mapping = _migrationState.mapping;
  const headers = _migrationState.headers;
  const rows = _migrationState.rows;
  
  // Auto-map wholesale/sell prices when PRIX columns exist but weren't detected
  if (mapping.wholesalePrice === undefined) {
    const pi = headers.findIndex(h => h && String(h).toUpperCase().replace(/[^A-Z0-9]/g, '') === 'PRIX1');
    if (pi !== -1) mapping.wholesalePrice = pi;
  }
  if (mapping.sellPrice === undefined) {
    const pi = headers.findIndex(h => h && String(h).toUpperCase().replace(/[^A-Z0-9]/g, '') === 'PRIX2');
    if (pi !== -1) mapping.sellPrice = pi;
  }
  
  if (!mapping.name && !mapping.barcode) {
    migrationUpdateStatus(t('migration.needNameOrBarcode'), 'error');
    return;
  }
  
  if (_migrationState.firebird) {
    migrationUpdateStatus(t('migration.importing'), 'info');
    await ensureFirebirdRows(0, _migrationState.totalRows);
  }
  
  migrationUpdateStatus(t('migration.importing'), 'info');
  
  try {
    const allBrands = [...BRANDS.global, ...BRANDS.chinese];
    const resolveBrand = (name) => {
      if (!name) return '';
      const match = allBrands.find(b => b.name.toLowerCase() === name.trim().toLowerCase());
      return match ? match.id : '';
    };

    const findSupplier = (name) => {
      if (!name) return null;
      return DB.getSuppliers().find(s => s.name.toLowerCase() === name.trim().toLowerCase()) || null;
    };

    const findCustomer = (name) => {
      if (!name) return null;
      return DB.getCustomers().find(c => c.name.toLowerCase() === name.trim().toLowerCase()) || null;
    };

    const newSuppliers = {};
    const newCustomers = {};
    const productById = {}; // barcode → productId

    const total = rows.length;
    const CHUNK = 200;

    const rv = (row, field) => {
      const idx = mapping[field];
      return idx !== undefined ? String(row[headers[idx]] || '') : '';
    };
    const rn = (row, field) => {
      const idx = mapping[field];
      if (idx === undefined) return 0;
      return parseFloat(String(row[headers[idx]] || '').replace(/[^0-9.\-]/g, '')) || 0;
    };

    const hasInvoiceRef = mapping.invoiceRef !== undefined;
    const hasSupplier = mapping.supplier !== undefined;
    const hasCustomer = mapping.customer !== undefined;
    const hasSupplierOrCustomer = hasSupplier || hasCustomer;
    const invoiceMode = role === 'products' ? false : (hasInvoiceRef || hasSupplierOrCustomer);

    // ============ PHASE 1: Unique products ============
    const prodMap = new Map();
    for (let i = 0; i < total; i++) {
      const row = rows[i];
      const barcode = rv(row, 'barcode') || 'IMP' + String(i + 1).padStart(8, '0');
      const name = rv(row, 'name') || ('منتج ' + (i + 1));
      const key = barcode;

      if (prodMap.has(key) || DB.getProductByBarcode(key)) continue;
      
      const rawSup = role === 'products' ? '' : rv(row, 'supplier');
      let sid = '';
      if (rawSup) {
        const ex = findSupplier(rawSup);
        if (ex) { sid = ex.id; }
        else if (!newSuppliers[rawSup]) {
          newSuppliers[rawSup] = { id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5), name: rawSup, phone: '', address: '', balance: 0 };
          sid = newSuppliers[rawSup].id;
        } else { sid = newSuppliers[rawSup].id; }
      }

      const rawCust = role === 'products' ? '' : rv(row, 'customer');
      if (rawCust && !findCustomer(rawCust) && !newCustomers[rawCust]) {
        newCustomers[rawCust] = { name: rawCust, phone: '', address: '', discount: 0, photo: '' };
      }

      const rawBrand = rv(row, 'brand');
      const resolvedBrandId = resolveBrand(rawBrand);

      prodMap.set(key, {
        name,
        barcode,
        brandId: resolvedBrandId,
        mark: rv(row, 'mark') || rawBrand,
        category: rv(row, 'category'),
        buyPrice: invoiceMode ? 0 : (rn(row, 'buyPrice') || rn(row, 'unitPrice') || 0),
        sellPrice: invoiceMode ? 0 : (rn(row, 'sellPrice') || rn(row, 'unitPrice') || 0),
        wholesalePrice: invoiceMode ? 0 : (rn(row, 'wholesalePrice') || rn(row, 'buyPrice') || 0),
        quantity: invoiceMode ? 0 : (rn(row, 'qty') || 0),
        supplierId: sid,
        notes: rv(row, 'notes'),
      });
    }

    const allProds = [...prodMap.values()];
    let prodsImported = 0;

    for (let start = 0; start < allProds.length; start += CHUNK) {
      const chunk = allProds.slice(start, start + CHUNK);
      const created = await DB.addProductsBatch(chunk, null, { source: 'import-invoices' });
      for (const p of created) productById[p.barcode] = p.id;
      prodsImported += chunk.length;
      setImportStatus(`المنتجات: ${prodsImported}/${allProds.length}`);
      await new Promise(r => setTimeout(r, 0));
    }

    // Existing products are skipped above — backfill an empty mark from the
    // source rows so a re-run repairs products imported before mark support.
    const backfill = [];
    for (let i = 0; i < total; i++) {
      const row = rows[i];
      const srcMark = rv(row, 'mark') || rv(row, 'brand');
      if (!srcMark) continue;
      const existing = DB.getProductByBarcode(rv(row, 'barcode') || ('IMP' + String(i + 1).padStart(8, '0')));
      if (!existing || String(existing.mark || '').trim()) continue;
      backfill.push({ id: existing.id, changes: { mark: srcMark } });
    }
    if (backfill.length) DB.updateProductsBatch(backfill);

    // Save new suppliers
    const suppKeys = Object.keys(newSuppliers);
    if (suppKeys.length) {
      const existing = DB.getSuppliers();
      for (const key of suppKeys) existing.push(newSuppliers[key]);
      DB.saveSuppliers(existing);
    }
    const custKeys = Object.keys(newCustomers);
    if (custKeys.length) {
      for (const key of custKeys) DB.addCustomer(newCustomers[key]);
    }

    // ============ PHASE 2: Invoices ============
    let invoicesCreated = 0;

    if (invoiceMode) {

      // Helper: build items array for a set of rows
      const buildItems = (itemRows) => {
        const items = [];
        for (const r of itemRows) {
          const bc = rv(r, 'barcode') || 'IMP';
          let pid = productById[bc];
          if (!pid) {
            const existing = DB.getProductByBarcode(bc);
            if (existing) pid = existing.id;
          }
          if (!pid) continue;
          const q = rn(r, 'qty') || 1;
          const up = rn(r, 'unitPrice') || rn(r, 'sellPrice') || rn(r, 'buyPrice') || 0;
          items.push({ productId: pid, barcode: bc, name: rv(r, 'name') || 'منتج', qty: q, price: up, total: q * up });
        }
        return items;
      };

      if (hasInvoiceRef) {
        // Group by invoiceRef
        const groups = new Map();
        for (let i = 0; i < total; i++) {
          const row = rows[i];
          const ref = rv(row, 'invoiceRef');
          if (!ref) {
            // Rows without invoiceRef become single-item invoices
            groups.set('__single__' + i, { rows: [row], supplier: rv(row, 'supplier'), customer: rv(row, 'customer'), date: rv(row, 'invoiceDate') });
            continue;
          }
          if (!groups.has(ref)) groups.set(ref, { rows: [], supplier: '', customer: '', date: '' });
          const g = groups.get(ref);
          g.rows.push(row);
          if (!g.supplier) g.supplier = rv(row, 'supplier');
          if (!g.customer) g.customer = rv(row, 'customer');
          if (!g.date) g.date = rv(row, 'invoiceDate');
        }

        for (const [, group] of groups) {
          const items = buildItems(group.rows);
          if (!items.length) continue;
          invoicesCreated += createInvoice(group, items, rn, rv, findSupplier, findCustomer) ? 1 : 0;
          if (invoicesCreated % 20 === 0) {
            setImportStatus(`الفواتير: ${invoicesCreated}`);
            await new Promise(r => setTimeout(r, 0));
          }
        }

      } else {
        // No invoiceRef: each row is an independent invoice
        for (let i = 0; i < total; i++) {
          const row = rows[i];
          const items = buildItems([row]);
          if (!items.length) continue;
          const group = { rows: [row], supplier: rv(row, 'supplier'), customer: rv(row, 'customer'), date: rv(row, 'invoiceDate') };
          invoicesCreated += createInvoice(group, items, rn, rv, findSupplier, findCustomer) ? 1 : 0;
          if (invoicesCreated % 20 === 0) {
            setImportStatus(`الفواتير: ${invoicesCreated}`);
            await new Promise(r => setTimeout(r, 0));
          }
        }
      }
    }

    // ============ Result message ============
    const parts = [`${prodsImported} منتج`];
    if (invoicesCreated) parts.push(`${invoicesCreated} فاتورة`);
    if (suppKeys.length) parts.push(`${suppKeys.length} مورد`);
    if (custKeys.length) parts.push(`${custKeys.length} عميل`);

    migrationUpdateStatus(`✓ تم الاستيراد بنجاح: ${parts.join('، ')}`, 'success');

    document.getElementById('migrationImportBtn').style.display = 'none';
    document.getElementById('migrationNextBtn').style.display = 'none';

  } catch (err) {
    migrationUpdateStatus(t('migration.importError') + ': ' + err.message, 'error');
    console.error('[Migration] Import error:', err);
  }
}

// Create a single invoice from a group of rows sharing the same invoiceRef
function createInvoice(group, items, rn, rv, findSupplier, findCustomer) {
  const hasSupplier = !!group.supplier;
  const hasCustomer = !!group.customer;

  let invoiceType = 'purchase';
  let supplierId = '';
  let customerId = '';
  let walkinName = '';

  if (hasCustomer) {
    invoiceType = 'customer';
    const cust = findCustomer(group.customer);
    if (cust) { customerId = cust.id; }
    else { walkinName = group.customer; }
  } else if (hasSupplier) {
    invoiceType = 'supplier';
    supplierId = findSupplier(group.supplier)?.id || '';
    if (!supplierId) {
      const sid = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      const s = { id: sid, name: group.supplier, phone: '', address: '', balance: 0 };
      const all = DB.getSuppliers();
      all.push(s);
      DB.saveSuppliers(all);
      supplierId = sid;
    }
  }

  const totalAmount = items.reduce((s, it) => s + it.total, 0);
  const discount = group.rows.length ? rn(group.rows[0], 'invoiceDiscount') || 0 : 0;
  const paid = group.rows.length ? rn(group.rows[0], 'paidAmount') || 0 : 0;

  let invoiceDate = Date.now();
  if (group.date) {
    const parsed = new Date(group.date);
    if (!isNaN(parsed.getTime())) invoiceDate = parsed.getTime();
  }

  const invData = { type: invoiceType, date: invoiceDate, items, totalAmount, extraDiscount: discount };

  if (invoiceType === 'customer') {
    if (customerId) invData.customerId = customerId;
    else { invData.walkinName = walkinName; invData.walkinPhone = ''; invData.walkinAddress = ''; }
    invData.profit = items.reduce((sum, it) => {
      const p = DB.getProductByBarcode(it.barcode);
      return sum + it.total - (p ? it.qty * (p.buyPrice || 0) : 0);
    }, 0);
  } else {
    invData.supplierId = supplierId;
  }

  const inv = DB.addInvoice(invData);

  // Payment
  if (paid > 0) {
    const pmt = { amount: paid, invoiceId: inv.id, note: 'مدفوعات مستوردة' };
    if (invoiceType === 'customer') pmt.customerId = customerId || undefined;
    else pmt.supplierId = supplierId;
    DB.addPayment(pmt);
  }

  // Stock and balances
  for (const it of items) {
    const p = DB.getProductByBarcode(it.barcode);
    if (!p) continue;
    if (invoiceType === 'customer') {
      DB.updateProduct(p.id, { quantity: Math.max(0, (p.quantity || 0) - it.qty) });
    } else {
      DB.updateProduct(p.id, { quantity: (p.quantity || 0) + it.qty });
    }
  }

  // Update party balance
  if (invoiceType === 'supplier' && supplierId) {
    const list = DB.getSuppliers();
    const si = list.findIndex(s => s.id === supplierId);
    if (si >= 0) { list[si].balance = (parseFloat(list[si].balance) || 0) + totalAmount; DB.saveSuppliers(list); }
  } else if (invoiceType === 'customer' && customerId) {
    const list = DB.getCustomers();
    const ci = list.findIndex(c => c.id === customerId);
    if (ci >= 0) { list[ci].balance = (parseFloat(list[ci].balance) || 0) + (totalAmount - paid - discount); DB.saveCustomers(list); }
  }

  return inv;
}

function setImportStatus(msg) {
  const el = document.getElementById('migrationStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function migrationUpdateStatus(msg, type) {
  const el = document.getElementById('migrationStatus');
  if (!msg) { el.style.display = 'none'; return; }
  el.textContent = msg;
  el.style.display = 'block';
  el.style.backgroundColor = type === 'error' ? '#f8d7da' : type === 'success' ? '#d4edda' : type === 'warning' ? '#fff3cd' : '#d1ecf1';
  el.style.color = '#333';
}

// ===========================================================================
// FULL GESTION STOCK IMPORT (Sable Stock / Gestion Stock Firebird databases)
// ===========================================================================

function detectGestionStockSchema(tableNames) {
  const up = new Set((tableNames || []).map(n => String(n).toUpperCase().split('.').pop()));
  return ['FACTURE_CLIENT', 'DETAIL_FACTURE_CLIENT', 'CLIENT', 'FOURNISSEUR', 'ARTICLES'].every(t => up.has(t));
}

function detectGestionStockSqlSchema(tableNames) {
  const up = new Set((tableNames || []).map(n => String(n).toUpperCase().split('.').pop()));
  return ['STOCK', 'CLIENTBIS', 'FOURNISSEURBIS', 'FACT1', 'FACT2'].every(t => up.has(t));
}

function renderGestionStockFullImportPanel(variant) {
  const panel = document.getElementById('migrationFullImportPanel');
  if (!panel) return;
  panel.style.display = 'block';
  const tableSelect = document.getElementById('migrationTableSelect');
  if (tableSelect) tableSelect.style.display = 'none';
  const preview = document.getElementById('migrationPreview');
  if (preview) preview.style.display = 'none';
  const rolePopup = document.getElementById('migrationRolePopup');
  if (rolePopup) rolePopup.style.display = 'none';
  // A Sable Stock backup (.gssp / .zgssp) carries every table already, so the
  // two Firebird-only "sync from STOCK.FDB" buttons are meaningless here and are
  // hidden. The panel description is switched to the GSSP wording (and its
  // data-i18n attribute is re-pointed so a later language switch stays correct).
  const isGssp = variant === 'gssp';
  const balBtn = document.getElementById('migrationBalanceSyncBtn');
  const stkBtn = document.getElementById('migrationStockSyncBtn');
  if (balBtn) balBtn.style.display = isGssp ? 'none' : '';
  if (stkBtn) stkBtn.style.display = isGssp ? 'none' : '';
  const desc = document.getElementById('migrationFullImportDesc');
  if (desc) {
    const key = isGssp ? 'migration.gsspPanelDesc' : 'migration.fullImportPanelDesc';
    desc.setAttribute('data-i18n', key);
    desc.textContent = t(key) || desc.textContent;
  }
}

async function startGestionStockFullImport() {
  const isGssp = !!_migrationState.gssp;
  const isSql = !isGssp && !!_migrationState.mssqlBak && !_migrationState.firebird;
  if (isGssp) {
    if (!_migrationState.gssp) return;
  } else if (isSql) {
    if (!_migrationState.mssqlBak) return;
  } else {
    if (!_migrationState.firebird) return;
  }
  const popup = document.getElementById('migrationFullBrandPopup');
  if (popup) popup.style.display = 'none';
  const btn = document.getElementById('migrationFullImportBtn');
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span data-i18n="migration.importing">جاري الاستيراد...</span>';
    }
    if (isGssp) await importSableStockFull();
    else if (isSql) await importGestionStockSqlFull(null);
    else await importGestionStockFull(null);
  } catch (err) {
    console.error('[Migration] Full import error:', err);
    migrationUpdateStatus((t('migration.importError') || 'خطأ أثناء الاستيراد') + ': ' + (err && err.message || err), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-rocket"></i> <span data-i18n="migration.fullImportBtn">استيراد شامل</span>';
    }
  }
}

function toggleFullBrand(cb) {
  const label = cb.closest('label');
  if (!label) return;
  if (cb.checked) {
    label.style.background = '#e3f2fd';
    label.style.borderColor = 'var(--primary)';
  } else {
    label.style.background = 'transparent';
    label.style.borderColor = 'var(--silver-200)';
  }
}

function selectAllFullBrands(checked) {
  document.querySelectorAll('#migrationFullBrandList input').forEach(cb => {
    cb.checked = !!checked;
    const label = cb.closest('label');
    if (label) {
      label.style.background = checked ? '#e3f2fd' : 'transparent';
      label.style.borderColor = checked ? 'var(--primary)' : 'var(--silver-200)';
    }
  });
}

function confirmGestionStockFullImport() {
  const selected = new Set();
  document.querySelectorAll('#migrationFullBrandList input:checked').forEach(cb => selected.add(cb.value));
  document.getElementById('migrationFullBrandPopup').style.display = 'none';
  importGestionStockFull(selected);
}

async function createPreImportBackup() {
  try {
    if (!window.electronAPI?.getAppDataPath || !window.electronAPI?.writeFile) return null;
    const appPath = await window.electronAPI.getAppDataPath();
    if (!appPath) return null;
    const dbExport = DB.exportAll();
    const backup = {
      version: 3,
      createdAt: new Date().toISOString(),
      storeName: localStorage.getItem('zmt_store_name') || '',
      summary: {
        products: dbExport.products.length,
        invoices: dbExport.invoices.length,
        customers: dbExport.customers.length,
        suppliers: dbExport.suppliers.length,
        payments: dbExport.payments.length,
        returns: dbExport.returns.length,
        discounts: dbExport.discounts.length,
      },
      data: dbExport,
      note: 'pre-import-auto-backup',
    };
    const dateStr = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const filePath = appPath + '\\pre_import_' + dateStr + '.zmt-backup';
    const clean = JSON.parse(JSON.stringify(backup, (k, v) => {
      if (typeof v === 'bigint') return String(v);
      if (v === undefined) return null;
      return v;
    }));
    await window.electronAPI.writeFileBinary(filePath, window._zmtGzipToBase64Async ? await window._zmtGzipToBase64Async(clean) : window._zmtGzipToBase64(clean));
    return filePath;
  } catch (err) {
    console.warn('[Migration] Pre-import backup failed:', err);
    return null;
  }
}

async function importGestionStockInvoices(ctx) {
  const { dbPath, options, load, num, txt, parseDate, custCodeToId, supCodeToId, prodByRef, prodByBar, ensureProduct, results } = ctx;

  const applyPayment = (pmt) => {
    const p = DB.addPayment(pmt);
    if (pmt.customerId) {
      const list = DB.getCustomers();
      const ci = list.findIndex(c => c.id === pmt.customerId);
      if (ci >= 0) { list[ci].balance = (parseFloat(list[ci].balance) || 0) - (pmt.amount || 0); DB.saveCustomers(list); }
    } else if (pmt.supplierId) {
      const list = DB.getSuppliers();
      const si = list.findIndex(s => s.id === pmt.supplierId);
      if (si >= 0) { list[si].balance = (parseFloat(list[si].balance) || 0) - (pmt.amount || 0); DB.saveSuppliers(list); }
    }
    return p;
  };

  // ===== 4) PURCHASE INVOICES =====
  ctx.migrationUpdateStatus((t('migration.rolePurchaseInvoices') || 'فواتير الشراء') + '...', 'info');
  const purHeaders = await load('FACTURE_FOURNISSEUR');
  const purDetails = await load('DETAIL_FACTURE_FOURNISSEUR');
  const purByNum = new Map();
  for (const r of purHeaders) {
    const n = txt(r['N_FACTURE']);
    if (!n) continue;
    purByNum.set(n, {
      supCode: txt(r['CODE_FOURNISSEUR']),
      date: parseDate(r['DATE_FACTURE']),
      paid: num(r['VERSEMENT']),
      total: num(r['MONTANT_TTC']),
    });
  }
  const purItems = new Map();
  for (const r of purDetails) {
    const n = txt(r['N_FACTURE']);
    const ref = txt(r['REFERENCE_ARTICLE']);
    if (!n || !ref) continue;
    if (!purItems.has(n)) purItems.set(n, []);
    purItems.get(n).push({ ref, qty: num(r['QUANTITE']) || 0, price: num(r['PRIX_ACHAT']) || num(r['PRIX1']) });
  }

  for (const [n, items] of purItems) {
    const hdr = purByNum.get(n);
    const invItems = [];
    for (const it of items) {
      const p = await ensureProduct(it.ref, it.ref, '', it.price);
      if (!p) continue;
      invItems.push({ productId: p.id, barcode: p.barcode, name: p.name || it.ref, qty: it.qty, price: it.price, total: it.qty * it.price });
    }
    if (!invItems.length) continue;
    const totalAmount = (hdr && hdr.total > 0) ? hdr.total : invItems.reduce((s, it) => s + it.total, 0);
    let supplierId = '';
    if (hdr) supplierId = supCodeToId[hdr.supCode] || '';
    if (!supplierId) supplierId = (DB.getSuppliers()[0] || {}).id || '';
    const invData = { type: 'supplier', date: hdr ? hdr.date : Date.now(), items: invItems, totalAmount, extraDiscount: 0, supplierId, note: (t('migration.oldInvoiceNote') || 'فاتورة مستوردة') + ' — ' + n };
    const inv = DB.addInvoice(invData);
    if (hdr && hdr.paid > 0) applyPayment({ amount: hdr.paid, invoiceId: inv.id, supplierId, note: t('migration.oldPaymentNote') || 'مدفوعات مستوردة' });
    // Stock is intentionally NOT touched here: the legacy program already keeps
    // ARTICLES.QUANTITE as a running balance that INCLUDES this invoice, so
    // replaying it on top double-counted every product (5 -> 10, 2 -> 4, ...).
    // Invoices are imported for reports/history only.
    if (supplierId) {
      const list = DB.getSuppliers();
      const si = list.findIndex(s => s.id === supplierId);
      if (si >= 0) { list[si].balance = (parseFloat(list[si].balance) || 0) + totalAmount; DB.saveSuppliers(list); }
    }
    results.buyInvoices++;
    if (results.buyInvoices % 25 === 0) {
      ctx.setImportStatus((t('migration.rolePurchaseInvoices') || 'فواتير الشراء') + ': ' + results.buyInvoices);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // ===== 5) SALES INVOICES =====
  ctx.migrationUpdateStatus((t('migration.roleSalesInvoices') || 'فواتير البيع') + '...', 'info');
  const cliHeaders = await load('FACTURE_CLIENT');
  const cliDetails = await load('DETAIL_FACTURE_CLIENT');
  const cliByNum = new Map();
  for (const r of cliHeaders) {
    const n = txt(r['N_FACTURE']);
    if (!n) continue;
    cliByNum.set(n, {
      custCode: txt(r['CODE_CLIENT']),
      date: parseDate(r['DATE_FACTURE']),
      paid: num(r['VERSEMENT']),
      discount: num(r['TOTAL_REMISE']),
      total: num(r['MONTANT_TTC']),
    });
  }
  const cliItems = new Map();
  for (const r of cliDetails) {
    const n = txt(r['N_FACTURE']);
    const ref = txt(r['REFERENCE_ARTICLE']);
    if (!n || !ref) continue;
    if (!cliItems.has(n)) cliItems.set(n, []);
    cliItems.get(n).push({ ref, qty: num(r['QUANTITE']) || 0, price: num(r['PUV']) });
  }

  for (const [n, items] of cliItems) {
    const hdr = cliByNum.get(n);
    const invItems = [];
    for (const it of items) {
      const p = await ensureProduct(it.ref, it.ref, '', it.price);
      if (!p) continue;
      invItems.push({ productId: p.id, barcode: p.barcode, name: p.name || it.ref, qty: it.qty, price: it.price, total: it.qty * it.price });
    }
    if (!invItems.length) continue;
    const totalAmount = (hdr && hdr.total > 0) ? hdr.total : invItems.reduce((s, it) => s + it.total, 0);
    const paid = hdr ? hdr.paid : 0;
    const discount = hdr ? hdr.discount : 0;
    const invData = { type: 'customer', date: hdr ? hdr.date : Date.now(), items: invItems, totalAmount, extraDiscount: discount, note: (t('migration.oldInvoiceNote') || 'فاتورة مستوردة') + ' — ' + n };
    const customerId = hdr ? custCodeToId[hdr.custCode] : '';
    if (customerId) {
      invData.customerId = customerId;
    } else {
      invData.walkinName = (t('migration.walkin') || 'عميل عابر') + ' — ' + (hdr ? hdr.custCode : n);
      invData.walkinPhone = '';
      invData.walkinAddress = '';
    }
    invData.profit = invItems.reduce((sum, it) => {
      const p = DB.getProductByBarcode(it.barcode);
      return sum + it.total - (p ? it.qty * (p.buyPrice || 0) : 0);
    }, 0);
    const inv = DB.addInvoice(invData);
    if (paid > 0) applyPayment({ amount: paid, invoiceId: inv.id, customerId: customerId || undefined, note: t('migration.oldPaymentNote') || 'مدفوعات مستوردة' });
    // Stock untouched — see the purchase-invoice note above. This also removes
    // the old Math.max(0, ...) clamp that zeroed 615 products with positive
    // legacy stock.
    if (customerId) {
      const list = DB.getCustomers();
      const ci = list.findIndex(c => c.id === customerId);
      if (ci >= 0) { list[ci].balance = (parseFloat(list[ci].balance) || 0) + (totalAmount - discount); DB.saveCustomers(list); }
    }
    results.saleInvoices++;
    if (results.saleInvoices % 25 === 0) {
      ctx.setImportStatus((t('migration.roleSalesInvoices') || 'فواتير البيع') + ': ' + results.saleInvoices);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // ===== 6) AVOIRS (returns) =====
  ctx.migrationUpdateStatus((t('migration.returnsCount') || 'المرتجعات') + '...', 'info');
  const avoirHeaders = await load('AVOIR_CLIENT');
  const avoirDetails = await load('DETAIL_AVOIR_CLIENT');
  const avoirByNum = new Map();
  for (const r of avoirHeaders) {
    const n = txt(r['N_AVOIR']);
    if (!n) continue;
    avoirByNum.set(n, {
      custCode: txt(r['CODE_CLIENT']),
      date: parseDate(r['DATE_AVOIR']),
      total: num(r['TOTAL_TTC']),
    });
  }
  const avoirItems = new Map();
  for (const r of avoirDetails) {
    const n = txt(r['N_AVOIR']);
    const ref = txt(r['REFERENCE_ARTICLE']);
    if (!n || !ref) continue;
    if (!avoirItems.has(n)) avoirItems.set(n, []);
    avoirItems.get(n).push({ ref, qty: num(r['QUANTITE']) || num(r['NBR']) || 0, price: num(r['PUV']) });
  }

  const returnsList = DB.getReturns();
  let returnsSaved = false;
  for (const [n, items] of avoirItems) {
    const hdr = avoirByNum.get(n);
    const customerId = hdr ? custCodeToId[hdr.custCode] : '';
    for (const it of items) {
      const p = await ensureProduct(it.ref, it.ref, '', it.price);
      if (!p) continue;
      returnsList.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + results.returns,
        createdAt: hdr ? hdr.date : Date.now(),
        invoiceId: '',
        relatedTo: customerId,
        customerId: customerId || '',
        productId: p.id,
        productName: p.name || it.ref,
        qty: it.qty,
        reason: (t('migration.avoirReason') || 'مرتجع (Avoir)') + ' — ' + n,
        totalAmount: it.qty * it.price,
      });
      // Stock untouched — ARTICLES.QUANTITE already nets these returns.
      results.returns++;
    }
    if (customerId && hdr && hdr.total > 0) {
      const list = DB.getCustomers();
      const ci = list.findIndex(c => c.id === customerId);
      if (ci >= 0) { list[ci].balance = Math.max(0, (parseFloat(list[ci].balance) || 0) - hdr.total); DB.saveCustomers(list); }
    }
    if (results.returns % 25 === 0) {
      ctx.setImportStatus((t('migration.returnsCount') || 'المرتجعات') + ': ' + results.returns);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  if (returnsList.length && !returnsSaved) {
    DB.saveReturns(returnsList);
    returnsSaved = true;
  }

  // ===== 7) RECEIPTS (VERSEMENT_CLIENT / VERSEMENT_FOURNISSEUR) =====
  ctx.migrationUpdateStatus((t('migration.oldPaymentNote') || 'المدفوعات') + '...', 'info');
  const versCli = await load('VERSEMENT_CLIENT');
  for (const r of versCli) {
    const customerId = custCodeToId[txt(r['CODE_CLIENT'])];
    const amount = num(r['VERSEMENT']);
    if (!customerId || amount <= 0) continue;
    applyPayment({
      amount,
      customerId,
      date: parseDate(r['DATE_VERSEMENT']),
      note: (t('migration.oldPaymentNote') || 'مدفوعات مستوردة') + ' — R' + txt(r['N_RECU']),
    });
  }
  const versSup = await load('VERSEMENT_FOURNISSEUR');
  for (const r of versSup) {
    const supplierId = supCodeToId[txt(r['CODE_FOURNISSEUR'])];
    const amount = num(r['VERSEMENT']);
    if (!supplierId || amount <= 0) continue;
    applyPayment({
      amount,
      supplierId,
      date: parseDate(r['DATE_VERSEMENT']),
      note: (t('migration.oldPaymentNote') || 'مدفوعات مستوردة') + ' — R' + txt(r['N_RECU_F']),
    });
  }

  // ===== 8) SUPPLIER AVOIRS =====
  const avoirSupHeaders = await load('AVOIR_FOURNISSEUR');
  for (const r of avoirSupHeaders) {
    const supplierId = supCodeToId[txt(r['CODE_FOURNISSEUR'])];
    const total = num(r['TOTAL_TTC']);
    if (!supplierId || total <= 0) continue;
    const list = DB.getSuppliers();
    const si = list.findIndex(s => s.id === supplierId);
    if (si >= 0) { list[si].balance = (parseFloat(list[si].balance) || 0) - total; DB.saveSuppliers(list); }
  }
}

async function importGestionStockFull(selectedBrands) {
  if (!_migrationState.firebird) return;
  const { dbPath, options } = _migrationState.firebird;
  if (DB && DB.suppressAutoBackup) DB.suppressAutoBackup(true);

  migrationUpdateStatus(t('migration.creatingBackup') || 'جاري إنشاء نسخة احتياطية قبل الاستيراد...', 'info');
  const backupPath = await createPreImportBackup();
  if (backupPath) console.log('[Migration] Pre-import backup saved:', backupPath);

  const num = (v) => { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
  const txt = (v) => String(v === undefined || v === null ? '' : v).trim();

  const parseDate = (v) => {
    const s = txt(v);
    if (!s) return Date.now();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d.getTime()) ? Date.now() : d.getTime(); }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); return isNaN(d.getTime()) ? Date.now() : d.getTime(); }
    const d = new Date(s);
    return isNaN(d.getTime()) ? Date.now() : d.getTime();
  };

  const load = async (tbl) => {
    try {
      const colsRes = await window.electronAPI.firebirdColumns(dbPath, tbl, options);
      if (!colsRes.success) return [];
      const cols = (colsRes.data || []).map(c => c.name);
      const cntRes = await window.electronAPI.firebirdCount(dbPath, tbl, options);
      const total = cntRes.success ? (cntRes.data || 0) : 0;
      if (!cols.length || total <= 0) return [];
      const q = await window.electronAPI.firebirdQuery(dbPath, tbl, cols, 0, total, options);
      return q.success ? (q.data || []) : [];
    } catch (err) {
      console.warn('[Migration] load ' + tbl + ' failed:', err);
      return [];
    }
  };

  const allBrands = [...BRANDS.global, ...BRANDS.chinese];
  const norm = (s) => String(s || '').trim().toLowerCase();
  const resolveBrand = (name) => {
    if (!name) return '';
    const n = norm(name);
    const exact = allBrands.find(b => norm(b.name) === n);
    if (exact) return exact.id;
    const partial = allBrands.find(b => norm(b.name).indexOf(n) >= 0 || n.indexOf(norm(b.name)) >= 0);
    return partial ? partial.id : '';
  };

  // ===== resolve price columns from LIBELLE_PRIX =====
  let sellCol = 'PRIX2';
  let wholeCol = 'PRIX1';
  const lp = await load('LIBELLE_PRIX');
  const priceRows = lp.map(r => ({ id: num(r['ID_PRIX'] ?? r['ID']), label: txt(r['LIBELLE_PRIX']) }));
  const det = priceRows.find(r => /d.tail|detail|vente|retail/i.test(r.label));
  const gros = priceRows.find(r => /gros|gross|wholesale/i.test(r.label));
  if (det) sellCol = 'PRIX' + det.id;
  if (gros) wholeCol = 'PRIX' + gros.id;
  console.log('[Migration] Price columns: sell=' + sellCol + ' whole=' + wholeCol);

  const results = { customers: 0, suppliers: 0, products: 0, buyInvoices: 0, saleInvoices: 0, returns: 0 };

  // ===== 1) CUSTOMERS =====
  migrationUpdateStatus((t('migration.roleCustomers') || 'العملاء') + '...', 'info');
  const clientRows = await load('CLIENT');
  const existingCust = new Set(DB.getCustomers().map(c => norm(c.name)));
  const custCodeToId = {};
  const creditByCustCode = {};
  for (const r of clientRows) {
    const name = txt(r['NOM_CLIENT']);
    if (!name || /vente\s*a\s*comptoir|a\s*comptoir/i.test(name)) continue;
    const key = norm(name);
    const code = txt(r['CODE_CLIENT']);
    creditByCustCode[code] = num(r['CREDIT_CLIENT']);
    if (existingCust.has(key)) {
      const ex = DB.getCustomers().find(c => norm(c.name) === key);
      if (ex) custCodeToId[code] = ex.id;
      continue;
    }
    const c = DB.addCustomer({
      name: name.trim(),
      phone: txt(r['TEL']) || txt(r['MOBILE']),
      address: txt(r['ADRESSE']) || txt(r['VILLE']),
      discount: 0,
    });
    c.balance = num(r['CREDIT_INITIAL']) || 0;
    custCodeToId[code] = c.id;
    results.customers++;
  }
  if (results.customers > 0) {
    // Persist balances of newly imported customers even when they have no invoices.
    DB.saveCustomers(DB.getCustomers());
  }
  migrationUpdateStatus((t('migration.roleCustomers') || 'العملاء') + ': ' + results.customers, 'info');
  await new Promise(r => setTimeout(r, 0));

  // ===== 2) SUPPLIERS =====
  migrationUpdateStatus((t('migration.roleSuppliers') || 'الموردون') + '...', 'info');
  const fourRows = await load('FOURNISSEUR');
  const existingSup = new Set(DB.getSuppliers().map(s => norm(s.name)));
  const supCodeToId = {};
  const creditBySupCode = {};
  const newSuppliers = [];
  for (const r of fourRows) {
    const name = txt(r['NOM_FOURNISSEUR']);
    if (!name) continue;
    const key = norm(name);
    const code = txt(r['CODE_FOURNISSEUR']);
    creditBySupCode[code] = num(r['CREDIT_FOURNISSEUR']);
    if (existingSup.has(key)) {
      const ex = DB.getSuppliers().find(s => norm(s.name) === key);
      if (ex) supCodeToId[code] = ex.id;
      continue;
    }
    const s = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: name.trim(),
      phone: txt(r['TEL']) || txt(r['MOBILE']),
      address: txt(r['ADRESSE']) || txt(r['VILLE']),
      balance: num(r['CREDIT_INITIAL']) || 0,
    };
    newSuppliers.push(s);
    supCodeToId[code] = s.id;
  }
  if (newSuppliers.length) {
    const all = DB.getSuppliers();
    for (const s of newSuppliers) all.push(s);
    DB.saveSuppliers(all);
  }
  results.suppliers = newSuppliers.length;
  migrationUpdateStatus((t('migration.roleSuppliers') || 'الموردون') + ': ' + results.suppliers, 'info');
  await new Promise(r => setTimeout(r, 0));

  // ===== 3) PRODUCTS =====
  migrationUpdateStatus((t('migration.roleProducts') || 'المنتجات') + '...', 'info');
  const articleRows = await load('ARTICLES');
  const keepMarques = selectedBrands ? new Set(selectedBrands) : null;
  const productMap = new Map();
  for (const r of articleRows) {
    const marque = txt(r['MARQUE']);
    if (keepMarques && marque && !keepMarques.has(marque)) continue;
    const ref = txt(r['REFERENCE']);
    const bar = txt(r['CODE_BAR']) || ref;
    if (!ref && !bar) continue;
    const barcode = bar || ('REF-' + ref);
    if (productMap.has(barcode) || DB.getProductByBarcode(barcode)) continue;
    const designation = txt(r['DESIGNATION']) || ref || barcode;
    const qty = num(r['QUANTITE']);
    productMap.set(barcode, {
      name: designation,
      barcode,
      brandId: resolveBrand(marque),
      mark: marque,
      reference: ref,
      category: '',
      buyPrice: num(r['PRIX_ACHAT']),
      sellPrice: num(r[sellCol]) || num(r['PRIX2']),
      wholesalePrice: num(r[wholeCol]) || num(r['PRIX1']),
      quantity: qty,
      supplierId: '',
      notes: (marque ? 'Sable: ' + marque : ''),
    });
  }
  const productsToAdd = [...productMap.values()];
  let productsCreated = [];
  for (let i = 0; i < productsToAdd.length; i += 200) {
    const chunk = productsToAdd.slice(i, i + 200);
    const created = await DB.addProductsBatch(chunk, null, { source: 'import-firebird' });
    productsCreated.push(...created);
    results.products += chunk.length;
    migrationUpdateStatus((t('migration.roleProducts') || 'المنتجات') + ': ' + results.products + '/' + productsToAdd.length, 'info');
    await new Promise(r => setTimeout(r, 0));
  }
  if (results.products === 0) {
    migrationUpdateStatus((t('migration.productsNone') || 'لم يتم استيراد أي منتج (تأكد من تحديد العلامات)'), 'warning');
  }

  // Backfill: products imported before the `mark` field existed are kept
  // (the loop above skips duplicates), so fill their empty mark/reference.
  const markBackfill = [];
  for (const r of articleRows) {
    const marque = txt(r['MARQUE']);
    if (!marque) continue;
    if (keepMarques && !keepMarques.has(marque)) continue;
    const ref = txt(r['REFERENCE']);
    const bar = txt(r['CODE_BAR']) || ref;
    if (!ref && !bar) continue;
    const existing = DB.getProductByBarcode(bar || ('REF-' + ref));
    if (!existing) continue;
    const changes = {};
    if (!String(existing.mark || '').trim()) changes.mark = marque;
    if (!String(existing.reference || '').trim() && ref) changes.reference = ref;
    if (Object.keys(changes).length) markBackfill.push({ id: existing.id, changes });
  }
  if (markBackfill.length) {
    DB.updateProductsBatch(markBackfill);
    migrationUpdateStatus((t('migration.roleProducts') || 'المنتجات') + ': ' + (t('migration.markBackfilled') || 'تم استرجاع المارك') + ' — ' + markBackfill.length, 'info');
    await new Promise(r => setTimeout(r, 0));
  }

  // Maps for invoice import
  const prodByRef = {};
  const prodByBar = {};
  const marqueByRef = {};
  for (const p of productsCreated) {
    if (p.barcode) prodByBar[p.barcode] = p;
  }
  for (const r of articleRows) {
    const marque = txt(r['MARQUE']);
    if (keepMarques && marque && !keepMarques.has(marque)) continue;
    const ref = txt(r['REFERENCE']);
    const bar = txt(r['CODE_BAR']) || ref;
    if (ref && marque && !marqueByRef[ref]) marqueByRef[ref] = marque;
    const found = prodByBar[bar || ('REF-' + ref)];
    if (found && ref) prodByRef[ref] = found;
  }

  const ensureProduct = async (barcode, ref, name, price) => {
    const bc = barcode || ref;
    if (!bc) return null;
    const existing = DB.getProductByBarcode(bc);
    if (existing) return existing;
    if (prodByBar[bc]) return prodByBar[bc];
    if (ref && prodByRef[ref]) return prodByRef[ref];
    const fallbackMarque = (ref && marqueByRef[ref]) || '';
    const created = await DB.addProductsBatch([{
      name: name || ref || bc,
      barcode: bc,
      brandId: '',
      mark: fallbackMarque,
      category: '',
      buyPrice: 0,
      sellPrice: price || 0,
      wholesalePrice: 0,
      quantity: 0,
      supplierId: '',
      notes: fallbackMarque ? 'Sable: ' + fallbackMarque : 'Sable',
    }], null, { source: 'import-firebird' });
    const p = created[0];
    if (p) { prodByBar[bc] = p; if (ref) prodByRef[ref] = p; }
    return p || null;
  };

  try {
    await importGestionStockInvoices({ dbPath, options, load, num, txt, parseDate, custCodeToId, supCodeToId, prodByRef, prodByBar, ensureProduct, results, migrationUpdateStatus, setImportStatus, t });
    // Enforce the legacy master credit (CREDIT_CLIENT / CREDIT_FOURNISSEUR) as
    // the authoritative final balance for every party listed in the legacy
    // database — including already-existing parties and zero balances — so
    // transaction-derived residuals never inflate the debts. Hybrid parties
    // (the same economic person recorded BOTH as a client and as a supplier,
    // e.g. TAYEB NISSAN or BEN AMAR CHAKER/BEN AMAR ACHRAF) are then corrected
    // to their TRUE NET balance so a single party never carries two phantom
    // mirror amounts: client record = NET, supplier record = −NET.
    const custs = DB.getCustomers();
    let custChanged = false;
    for (const c of custs) {
      const mc = creditByCustCode[Object.keys(custCodeToId).find(k => custCodeToId[k] === c.id)];
      if (mc !== undefined) { c.balance = mc === null || isNaN(mc) ? (parseFloat(c.balance) || 0) : mc; custChanged = true; }
    }
    const sups = DB.getSuppliers();
    let supChanged = false;
    for (const s of sups) {
      const mc = creditBySupCode[Object.keys(supCodeToId).find(k => supCodeToId[k] === s.id)];
      if (mc !== undefined) { s.balance = mc === null || isNaN(mc) ? (parseFloat(s.balance) || 0) : mc; supChanged = true; }
    }
    // True "double-role" parties: the SAME person recorded once as a client and
    // once as a supplier (identical normalized name) with REAL activity on both
    // sides (sales/purchases/payments). The legacy program classified such a
    // person as a SUPPLIER trading both ways, so its two stored records carry the
    // same business and the correct balance is the NET (client credit − supplier
    // credit): client record = NET, supplier record = −NET. All other parties keep
    // their OWN stored legacy figure from the step above.
    const fcRows = await load('FACTURE_CLIENT');
    const vcRows = await load('VERSEMENT_CLIENT');
    const ffRows = await load('FACTURE_FOURNISSEUR');
    const vfRows = await load('VERSEMENT_FOURNISSEUR');
    const codeSetOf = (rows, key) => { const s = new Set(); for (const r of rows) s.add(txt(r[key])); return s; };
    const fcSet = codeSetOf(fcRows, 'CODE_CLIENT');
    const vcSet = codeSetOf(vcRows, 'CODE_CLIENT');
    const ffSet = codeSetOf(ffRows, 'CODE_FOURNISSEUR');
    const vfSet = codeSetOf(vfRows, 'CODE_FOURNISSEUR');
    const netPairs = _detectTrueDoubles(clientRows, fourRows, fcSet, vcSet, ffSet, vfSet);
    for (const pair of CONFIRMED_DOUBLE_CODES) {
      const cRow = clientRows.find(r => txt(r['CODE_CLIENT']) === pair[0]);
      const fRow = fourRows.find(r => txt(r['CODE_FOURNISSEUR']) === pair[1]);
      if (!cRow || !fRow || netPairs.some(d => d.cCode === pair[0] && d.fCode === pair[1])) continue;
      netPairs.push({
        cCode: pair[0], fCode: pair[1],
        cName: txt(cRow['NOM_CLIENT']), fName: txt(fRow['NOM_FOURNISSEUR']),
        basis: 'confirmed',
        creditClient: num(cRow['CREDIT_CLIENT']),
        creditFournisseur: num(fRow['CREDIT_FOURNISSEUR']),
        net: num(cRow['CREDIT_CLIENT']) - num(fRow['CREDIT_FOURNISSEUR']),
      });
    }
    for (const d of netPairs) {
      const cId = custCodeToId[d.cCode];
      const sId = supCodeToId[d.fCode];
      if (cId) {
        const c = custs.find(x => x.id === cId);
        if (c) { c.balance = d.net; custChanged = true; }
      }
      if (sId) {
        const s = sups.find(x => x.id === sId);
        if (s) { s.balance = -d.net; supChanged = true; }
      }
    }
    // Confirmed manual corrections: legacy records whose stored figure does not
    // reflect the real debt and carry NO backing transactions. BEN ABDALLAH
    // OUSSAMA (supplier 11, initial-only 199,300 with zero purchases/payments):
    // the person's real debt is 9,500 and lives on CLIENT 164, so the phantom
    // supplier figure is cleared to zero.
    const zeroSupCodes = ['11'];
    for (const code of zeroSupCodes) {
      const sId = supCodeToId[code];
      if (!sId) continue;
      const s = sups.find(x => x.id === sId);
      if (s && Math.abs(parseFloat(s.balance) || 0) >= 0.005) { s.balance = 0; supChanged = true; }
    }
    if (custChanged) DB.saveCustomers(custs);
    if (supChanged) DB.saveSuppliers(sups);
  } finally {
    if (DB && DB.suppressAutoBackup) DB.suppressAutoBackup(false);
  }
  migrationUpdateStatus('', '');
  if (migrationUpdateStatus && (t('migration.fullImportDone') || 'اكتمل الاستيراد الشامل').length) {
    migrationUpdateStatus(`✓ ${t('migration.fullImportDone') || 'اكتمل الاستيراد الشامل'}: ` +
      `${results.products} ${t('migration.roleProducts') || 'منتج'} • ${results.customers} ${t('migration.roleCustomers') || 'عميل'} • ` +
      `${results.suppliers} ${t('migration.roleSuppliers') || 'مورد'} • ${results.saleInvoices} ${t('migration.roleSalesInvoices') || 'فاتورة بيع'} • ` +
      `${results.buyInvoices} ${t('migration.rolePurchaseInvoices') || 'فاتورة شراء'} • ${results.returns} ${t('migration.returnsCount') || 'مرتجع'}`, 'success');
  }
}

// ===========================================================================
// FULL GESTION STOCK IMPORT (SQL Server .bak) — Gestion Stock variant
// ===========================================================================
async function importGestionStockSqlFull(selectedBrands) {
  if (!_migrationState.mssqlBak) return;
  const { bakPath } = _migrationState.mssqlBak;
  if (DB && DB.suppressAutoBackup) DB.suppressAutoBackup(true);

  migrationUpdateStatus(t('migration.creatingBackup') || 'جاري إنشاء نسخة احتياطية قبل الاستيراد...', 'info');
  const backupPath = await createPreImportBackup();
  if (backupPath) console.log('[Migration] Pre-import backup saved:', backupPath);

  const num = (v) => { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
  const txt = (v) => String(v === undefined || v === null ? '' : v).trim();
  const norm = (s) => String(s || '').trim().toLowerCase();
  const parseDate = (v) => {
    const s = txt(v);
    if (!s) return Date.now();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d.getTime()) ? Date.now() : d.getTime(); }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); return isNaN(d.getTime()) ? Date.now() : d.getTime(); }
    const d = new Date(s); return isNaN(d.getTime()) ? Date.now() : d.getTime();
  };

  migrationUpdateStatus(t('migration.restoringBackup') || 'جاري استخراج البيانات من النسخة الاحتياطية...', 'info');
  const exp = await window.electronAPI.mssqlBakExport(bakPath);
  if (!exp || !exp.success) throw new Error((exp && exp.error) || 'export failed');
  const D = exp.data || {};
  const load = (tbl) => Array.isArray(D[tbl]) ? D[tbl] : [];

  const results = { customers: 0, suppliers: 0, products: 0, buyInvoices: 0, saleInvoices: 0, returns: 0 };
  const custByName = new Map();
  const supByName = new Map();
  const prodById = new Map();
  const prodByBar = new Map();

  const lastSalePrice = new Map();
  for (const r of load('Fact2')) {
    const pid = num(r['id_designation']);
    const price = num(r['Prix Unitaire'] !== undefined ? r['Prix Unitaire'] : r['PU Vente']);
    if (!pid || price <= 0) continue;
    const d = parseDate(r['dateop']);
    if (!lastSalePrice.has(pid) || d > lastSalePrice.get(pid).date) lastSalePrice.set(pid, { price, date: d });
  }
  const lastBuy = new Map();
  for (const r of load('Fact2Four')) {
    const pid = num(r['id_designation']);
    if (!pid) continue;
    const buy = num(r['PU Achat']);
    const whole = num(r['PU Vente']);
    const d = parseDate(r['dateop']);
    const cur = lastBuy.get(pid) || { buy: 0, whole: 0, date: -1 };
    if (d >= cur.date) lastBuy.set(pid, { buy: buy > 0 ? buy : cur.buy, whole: whole > 0 ? whole : cur.whole, date: d });
  }

  // ===== 1) CUSTOMERS (Clientbis) =====
  migrationUpdateStatus((t('migration.roleCustomers') || 'العملاء') + '...', 'info');
  const clientRows = load('Clientbis');
  const existingCust = new Set(DB.getCustomers().map(c => norm(c.name)));
  for (const r of clientRows) {
    const name = txt(r['Client']);
    if (!name || /comptoir/i.test(name)) continue;
    const key = norm(name);
    if (existingCust.has(key)) {
      const ex = DB.getCustomers().find(c => norm(c.name) === key);
      if (ex) custByName.set(key, ex);
      continue;
    }
    const c = DB.addCustomer({ name: name, phone: txt(r['Tel']), address: txt(r['Adresse']), email: txt(r['email']), discount: 0 });
    c.balance = num(r['Solde']);
    DB.saveCustomers(DB.getCustomers());
    custByName.set(key, c);
    results.customers++;
  }
  migrationUpdateStatus((t('migration.roleCustomers') || 'العملاء') + ': ' + results.customers, 'info');
  await new Promise(r => setTimeout(r, 0));

  // ===== 2) SUPPLIERS (Fournisseurbis) =====
  migrationUpdateStatus((t('migration.roleSuppliers') || 'الموردون') + '...', 'info');
  const supRows = load('Fournisseurbis');
  const existingSup = new Set(DB.getSuppliers().map(s => norm(s.name)));
  for (const r of supRows) {
    const name = txt(r['Client']);
    if (!name) continue;
    const key = norm(name);
    if (existingSup.has(key)) {
      const ex = DB.getSuppliers().find(s => norm(s.name) === key);
      if (ex) supByName.set(key, ex);
      continue;
    }
    const s = { id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5), name: name, phone: txt(r['Tel']), address: txt(r['Adresse']), email: txt(r['email']), balance: num(r['Solde']) };
    const all = DB.getSuppliers();
    all.push(s);
    DB.saveSuppliers(all);
    supByName.set(key, s);
    results.suppliers++;
  }
  migrationUpdateStatus((t('migration.roleSuppliers') || 'الموردون') + ': ' + results.suppliers, 'info');
  await new Promise(r => setTimeout(r, 0));

  // ===== 3) PRODUCTS (Stock) =====
  migrationUpdateStatus((t('migration.roleProducts') || 'المنتجات') + '...', 'info');
  const stockRows = load('Stock');
  const productsToAdd = [];
  for (const r of stockRows) {
    const rawDes = txt(r['designation']);
    const idx = rawDes.lastIndexOf('...');
    let name = idx >= 0 ? rawDes.slice(0, idx).trim() : rawDes.trim();
    name = name.replace(/^[*#\s]+/, '').trim();
    if (!name) name = 'منتج ' + r['id_stock'];
    let ref = idx >= 0 ? rawDes.slice(idx + 3).trim() : '';
    const idStock = num(r['id_stock']);
    const barcode = ref || ('STK-' + idStock);
    const pv = num(r['P Vente']);
    const pv2 = num(r['P Vente2']);
    const pv3 = num(r['p vente3']);
    const pu = num(r['Prix Unitaire']);
    const pm = num(r['Prix Moyen']);
    const lb = lastBuy.get(idStock) || { buy: 0, whole: 0 };
    const buyPrice = (pu > 0 ? pu : (lb.buy > 0 ? lb.buy : pm));
    let sellPrice = (pv > 0 ? pv : (lastSalePrice.get(idStock) ? lastSalePrice.get(idStock).price : 0));
    if (pv3 > 0 && sellPrice === 0) sellPrice = pv3;
    let wholesalePrice = (pv2 > 0 ? pv2 : (lb.whole > 0 ? lb.whole : (pv > 0 ? pv : 0)));
    if (wholesalePrice > 0 && sellPrice > 0 && wholesalePrice > sellPrice) wholesalePrice = sellPrice * 0.95;
    productsToAdd.push({ name, barcode, reference: ref, mark: txt(r['marque']), category: txt(r['famille']), unit: txt(r['unite']), buyPrice: Math.round(buyPrice*100)/100, realBuyPrice: Math.round(buyPrice*100)/100, purchaseDiscountPct: 0, sellPrice: Math.round(sellPrice*100)/100, wholesalePrice: Math.round(wholesalePrice*100)/100, extraPrices: {}, minPrice: 0, quantity: num(r['Stock']), minStock: num(r['stock min']), supplierId: null, notes: txt(r['obs']), _idStock: idStock });
  }
  const seenBar = new Set(DB.getProducts().map(p => p.barcode));
  const unique = [];
  for (const p of productsToAdd) {
    let bc = p.barcode;
    if (seenBar.has(bc)) bc = bc + '-' + Math.random().toString(36).slice(2, 6);
    p.barcode = bc;
    seenBar.add(bc);
    unique.push(p);
  }
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const created = await DB.addProductsBatch(chunk, null, { source: 'import-sql' });
    if (Array.isArray(created)) {
      for (let j = 0; j < created.length; j++) {
        const p = created[j];
        if (p && chunk[j] && chunk[j]._idStock != null) { prodById.set(chunk[j]._idStock, p); }
        if (p) { delete p._idStock; if (p.barcode) prodByBar.set(p.barcode, p); }
        if (chunk[j]) delete chunk[j]._idStock;
      }
    }
    results.products += chunk.length;
    migrationUpdateStatus((t('migration.roleProducts') || 'المنتجات') + ': ' + results.products + '/' + unique.length, 'info');
    await new Promise(r => setTimeout(r, 0));
  }
  for (const r of stockRows) {
    const rawDes = txt(r['designation']);
    const idx = rawDes.lastIndexOf('...');
    let ref = idx >= 0 ? rawDes.slice(idx + 3).trim() : '';
    const idStock = num(r['id_stock']);
    const barcode = ref || ('STK-' + idStock);
    const p = DB.getProductByBarcode(barcode);
    if (p) prodById.set(idStock, p);
    if (p && p.barcode) prodByBar.set(p.barcode, p);
  }
  migrationUpdateStatus((t('migration.roleProducts') || 'المنتجات') + ': ' + results.products, 'info');
  await new Promise(r => setTimeout(r, 0));

  // ===== 4) SALES INVOICES (Fact1 + Fact2) =====
  migrationUpdateStatus((t('migration.roleSalesInvoices') || 'فواتير البيع') + '...', 'info');
  const fact1Rows = load('Fact1');
  const fact1ByNum = new Map();
  for (const r of fact1Rows) fact1ByNum.set(txt(r['Numero']), r);
  const itemsByInv = new Map();
  for (const r of load('Fact2')) {
    const n = txt(r['Numero']);
    if (!n) continue;
    if (!itemsByInv.has(n)) itemsByInv.set(n, []);
    itemsByInv.get(n).push(r);
  }
  for (const [num_, rows] of itemsByInv) {
    const h = fact1ByNum.get(num_);
    if (!h) continue;
    const items = [];
    for (const r of rows) {
      const p = prodById.get(num(r['id_designation']));
      const qty = num(r['Quantite']);
      const price = num(r['Prix Unitaire']);
      let total = num(r['Montant']);
      if (!total) total = qty * price;
      items.push({ productId: p ? p.id : '', barcode: p ? p.barcode : '', name: p ? p.name : txt(r['designation']), qty: Math.round(qty*100)/100, price: Math.round(price*100)/100, total: Math.round(total*100)/100, costPrice: p ? p.buyPrice : 0 });
    }
    if (!items.length) continue;
    const totalAmount = num(h['Total TTC']) || items.reduce((s, i) => s + i.total, 0);
    const cust = custByName.get(norm(h['client']));
    // Keep the REAL historical date in createdAt too: reports and the invoice
    // list read createdAt, so without keepCreatedAt every imported sale would
    // be shown on the import day instead of its true DateAchat.
    const invDate = parseDate(h['DateAchat']);
    const invYear = new Date(invDate).getFullYear();
    const invData = { type: 'customer', invoiceNumber: num_, date: invDate, items: items, totalAmount: Math.round(totalAmount*100)/100, extraDiscount: num(h['Remise']), timbreFiscal: num(h['Timbre']), note: 'فاتورة مستوردة من البرنامج القديم — ' + num_, profit: num(h['Benefice']), createdAt: invDate };
    if (cust) invData.customerId = cust.id;
    else { invData.walkinName = txt(h['client']); invData.walkinPhone = ''; invData.walkinAddress = ''; }
    const inv = DB.addInvoice(invData, { keepCreatedAt: true, numberYear: invYear });
    results.saleInvoices++;
    const avance = num(h['Avance']);
    if (avance > 0) {
      const pmt = { amount: Math.round(avance*100)/100, invoiceId: inv.id, date: parseDate(h['DateAchat']), note: 'دفعة مستوردة — فاتورة ' + num_, method: 'cash' };
      if (cust) pmt.customerId = cust.id;
      DB.addPayment(pmt);
    }
  }
  migrationUpdateStatus((t('migration.roleSalesInvoices') || 'فواتير البيع') + ': ' + results.saleInvoices, 'info');
  await new Promise(r => setTimeout(r, 0));

  // ===== 5) PURCHASE INVOICES (Fact1four + Fact2Four) =====
  migrationUpdateStatus((t('migration.rolePurchaseInvoices') || 'فواتير الشراء') + '...', 'info');
  const fact1fRows = load('Fact1four');
  const fact1fByNum = new Map();
  for (const r of fact1fRows) fact1fByNum.set(txt(r['Numero']), r);
  const items4ByInv = new Map();
  for (const r of load('Fact2Four')) {
    const n = txt(r['Numero']);
    if (!n) continue;
    if (!items4ByInv.has(n)) items4ByInv.set(n, []);
    items4ByInv.get(n).push(r);
  }
  for (const [num_, rows] of items4ByInv) {
    const h = fact1fByNum.get(num_);
    if (!h) continue;
    const items = [];
    for (const r of rows) {
      const p = prodById.get(num(r['id_designation']));
      const qty = num(r['Quantite']);
      const price = num(r['PU Achat']);
      let total = num(r['Montant']);
      if (!total) total = qty * price;
      items.push({ productId: p ? p.id : '', barcode: p ? p.barcode : '', name: p ? p.name : txt(r['designation']), qty: Math.round(qty*100)/100, price: Math.round(price*100)/100, total: Math.round(total*100)/100, costPrice: p ? p.buyPrice : 0 });
    }
    if (!items.length) continue;
    const totalAmount = num(h['Total TTC']) || items.reduce((s, i) => s + i.total, 0);
    const sup = supByName.get(norm(h['client']));
    // Same rule as sales: the historical DateAchat is the invoice's date,
    // not the day the migration was run.
    const invDate = parseDate(h['DateAchat']);
    const invYear = new Date(invDate).getFullYear();
    const invData = { type: 'purchase', invoiceNumber: num_, date: invDate, items: items, totalAmount: Math.round(totalAmount*100)/100, extraDiscount: num(h['Remise']), timbreFiscal: num(h['Timbre']), supplierId: sup ? sup.id : '', note: 'فاتورة شراء مستوردة — ' + num_, createdAt: invDate };
    const inv = DB.addInvoice(invData, { keepCreatedAt: true, numberYear: invYear });
    results.buyInvoices++;
    const avance = num(h['Avance']);
    if (avance > 0) {
      const pmt = { amount: Math.round(avance*100)/100, invoiceId: inv.id, date: parseDate(h['DateAchat']), note: 'دفعة مستوردة — فاتورة شراء ' + num_, method: 'cash' };
      if (sup) pmt.supplierId = sup.id;
      DB.addPayment(pmt);
    }
  }
  migrationUpdateStatus((t('migration.rolePurchaseInvoices') || 'فواتير الشراء') + ': ' + results.buyInvoices, 'info');
  await new Promise(r => setTimeout(r, 0));

  // ===== 6) STANDALONE PAYMENTS =====
  migrationUpdateStatus((t('migration.rolePayments') || 'الدفعات') + '...', 'info');
  for (const r of load('Client')) {
    if (txt(r['Numero']) !== 'Versement' && txt(r['Numero']) !== 'Versment') continue;
    const amt = num(r['Avance']);
    if (!(amt > 0)) continue;
    const cust = custByName.get(norm(r['Client']));
    if (!cust) continue;
    DB.addPayment({ amount: Math.round(amt*100)/100, customerId: cust.id, date: parseDate(r['Date Operation']), note: 'سند قبض مستورد', method: 'cash' });
  }
  for (const r of load('Fournisseur')) {
    if (txt(r['Numero']) !== 'Versement' && txt(r['Numero']) !== 'Versment') continue;
    const amt = num(r['Avance']);
    if (!(amt > 0)) continue;
    const sup = supByName.get(norm(r['client']));
    if (!sup) continue;
    DB.addPayment({ amount: Math.round(amt*100)/100, supplierId: sup.id, date: parseDate(r['Date Operation']), note: 'سند دفع مستورد', method: 'cash' });
  }

  // ===== 7) FORCE AUTHORITATIVE BALANCES =====
  const custs = DB.getCustomers();
  for (const c of custs) {
    const master = clientRows.find(r => norm(r['Client']) === norm(c.name));
    if (master) c.balance = num(master['Solde']);
  }
  DB.saveCustomers(custs);
  const sups = DB.getSuppliers();
  for (const s of sups) {
    const master = supRows.find(r => norm(r['Client']) === norm(s.name));
    if (master) s.balance = num(master['Solde']);
  }
  DB.saveSuppliers(sups);

  // ===== 8) CLEANUP =====
  try { await window.electronAPI.mssqlBakDispose(bakPath); } catch (e) {}

  if (DB && DB.suppressAutoBackup) DB.suppressAutoBackup(false);
  migrationUpdateStatus('', '');
  migrationUpdateStatus(`✓ ${t('migration.fullImportDone') || 'اكتمل الاستيراد الشامل'}: ` +
    `${results.products} ${t('migration.roleProducts') || 'منتج'} • ${results.customers} ${t('migration.roleCustomers') || 'عميل'} • ` +
    `${results.suppliers} ${t('migration.roleSuppliers') || 'مورد'} • ${results.saleInvoices} ${t('migration.roleSalesInvoices') || 'فاتورة بيع'} • ` +
    `${results.buyInvoices} ${t('migration.rolePurchaseInvoices') || 'فاتورة شراء'}`, 'success');
}

// ===========================================================================
// FULL SABLE STOCK IMPORT (GSSP / ss2021)
// ---------------------------------------------------------------------------
// A Sable Stock backup is a plain MySQL dump (inside a ZipCrypto ZIP when the
// extension is .zgssp). It carries EVERYTHING in one file, so — unlike the
// Firebird path — there is no table browsing or brand picking: we read the dump
// once and rebuild the shop in ZMT PIECE.
//
// Historical fidelity rules (identical to the Firebird/SQL importers):
//   • invoices & payments keep their REAL date (date + createdAt);
//   • the invoice number prefix follows the real invoice year;
//   • product stock comes from articlesliste.QTE and is NEVER replayed from
//     invoices (the legacy QTE is already a running balance);
//   • customer/supplier balances come from personnez.solde and are set ONCE,
//     on creation — never overwritten and never mutated by the invoice import.
// ===========================================================================

async function migrationParseGssp() {
  const buffer = _migrationState.fileBuffer;
  if (!buffer || typeof GsspReader === 'undefined') {
    migrationUpdateStatus(t('migration.cannotRead') || 'لا يمكن قراءة الملف', 'error');
    return false;
  }
  try {
    migrationUpdateStatus(t('migration.gsspReading') || 'جاري فتح نسخة Sable Stock...', 'info');
    const res = GsspReader.read(buffer);
    const wanted = ['personnez', 'articlesliste', 'categoris', 'unites', 'depots', 'codbar',
      'bonsliv', 'journsortie', 'boncont', 'factures', 'factpro',
      'product_type', 'classification'];
    const parsed = GsspReader.parseDump(res.text, wanted);
    const tables = parsed.tables || {};
    if (!tables.personnez || !tables.articlesliste || !tables.bonsliv) {
      migrationUpdateStatus(t('migration.gsspNotSable') || 'هذا الملف ليس نسخة Sable Stock صالحة', 'warning');
      return false;
    }
    _migrationState.gssp = {
      tables: tables,
      counts: parsed.counts || {},
      entryName: res.entryName || '',
      encrypted: !!res.encrypted,
      wasZip: !!res.wasZip,
    };
    _migrationState.gestionStock = true;
    const ftEl = document.getElementById('migrationFileType');
    if (ftEl) ftEl.textContent = (ftEl.textContent || '') + ' • Sable Stock (GSSP)';
    renderGestionStockFullImportPanel('gssp');
    return true;
  } catch (err) {
    if (err && err.message === 'GSSP_PASSWORD') {
      migrationUpdateStatus(t('migration.gsspBadPassword') || 'تعذر فتح نسخة Sable Stock — كلمة مرور النسخة غير معروفة لهذا الإصدار', 'error');
    } else {
      migrationUpdateStatus((t('migration.parseError') || 'خطأ في تحليل الملف') + ': ' + (err && err.message || err), 'error');
    }
    return false;
  }
}

async function importSableStockFull() {
  const gssp = _migrationState.gssp;
  if (!gssp || !gssp.tables) return;
  const T = gssp.tables;
  if (DB && DB.suppressAutoBackup) DB.suppressAutoBackup(true);

  const num = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const txt = (v) => String(v === undefined || v === null ? '' : v).trim();
  const norm = (s) => String(s || '').trim().toLowerCase();
  const parseDate = (v) => {
    const s = txt(v);
    if (!s) return Date.now();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      return isNaN(d.getTime()) ? Date.now() : d.getTime();
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); return isNaN(d.getTime()) ? Date.now() : d.getTime(); }
    const d = new Date(s);
    return isNaN(d.getTime()) ? Date.now() : d.getTime();
  };
  const yearOf = (v) => { const m = txt(v).match(/^(\d{4})/); return m ? +m[1] : 0; };

  const idxOf = (tbl, name) => (tbl && tbl.columns) ? tbl.columns.indexOf(name) : -1;

  const results = { customers: 0, suppliers: 0, products: 0, saleInvoices: 0, cashInvoices: 0, payments: 0, skipped: 0 };

  try {
    migrationUpdateStatus(t('migration.creatingBackup') || 'جاري إنشاء نسخة احتياطية قبل الاستيراد...', 'info');
    const backupPath = await createPreImportBackup();
    if (backupPath) console.log('[Migration] Pre-import backup saved:', backupPath);

    // De-dup keys of everything already present, so re-running the import — or
    // merging the OLDER backup afterwards — never creates a second copy.
    const existingInvKeys = new Set();
    for (const inv of DB.getInvoices()) { if (inv && inv.migKey) existingInvKeys.add(inv.migKey); }
    const existingPayKeys = new Set();
    for (const p of DB.getPayments()) { if (p && p.migKey) existingPayKeys.add(p.migKey); }

    // ---------------------------------------------------------- lookups ----
    const catById = {};
    if (T.categoris) {
      const iId = idxOf(T.categoris, 'idCategori'), iNom = idxOf(T.categoris, 'NomCat');
      for (const r of T.categoris.rows) { const id = num(r[iId]); const nom = txt(r[iNom]); if (id && nom) catById[id] = nom; }
    }
    const mapUnit = (u) => {
      const s = txt(u).toUpperCase();
      if (s === 'KG') return 'kg';
      if (s === 'L' || s === 'LITRE' || s === 'LT' || s === 'LTR') return 'L';
      return 'piece';
    };
    const barcodeByRef = {};
    if (T.codbar) {
      const iRef = idxOf(T.codbar, 'RefArt'), iBar = idxOf(T.codbar, 'idcodBar');
      for (const r of T.codbar.rows) { const ref = txt(r[iRef]), bar = txt(r[iBar]); if (ref && bar && !barcodeByRef[ref]) barcodeByRef[ref] = bar; }
    }

    // ===== 1) CUSTOMERS (personnez idType = 1) =====
    migrationUpdateStatus((t('migration.roleCustomers') || 'العملاء') + '...', 'info');
    const pers = T.personnez;
    const iPersId = idxOf(pers, 'idPers'), iName = idxOf(pers, 'raiSocial'), iType = idxOf(pers, 'idType'),
      iSolde = idxOf(pers, 'solde'), iTel = idxOf(pers, 'tel'), iMobile = idxOf(pers, 'mobile'),
      iAdr = idxOf(pers, 'adrese'), iMax = idxOf(pers, 'maxCredit');
    const custByPersId = {};
    const custByName = new Map();
    for (const c of DB.getCustomers()) { const k = norm(c.name); if (k && !custByName.has(k)) custByName.set(k, c); }
    let custChanged = false;
    for (const r of pers.rows) {
      if (num(r[iType]) !== 1) continue;
      const name = txt(r[iName]);
      if (!name) continue;
      const pid = txt(r[iPersId]);
      const key = norm(name);
      const existing = custByName.get(key);
      if (existing) { if (pid) custByPersId[pid] = existing.id; continue; }
      const c = DB.addCustomer({
        name: name,
        phone: txt(r[iTel]) || txt(r[iMobile]),
        address: txt(r[iAdr]),
        discount: 0,
        creditLimit: num(r[iMax]),
      });
      // Balance is the legacy master figure (personnez.solde), set ONCE here on
      // creation. Existing customers are never touched, so merging the older
      // backup or re-running the import keeps the true balance.
      c.balance = num(r[iSolde]);
      custByName.set(key, c);
      if (pid) custByPersId[pid] = c.id;
      custChanged = true;
      results.customers++;
    }
    if (custChanged) DB.saveCustomers(DB.getCustomers());
    migrationUpdateStatus((t('migration.roleCustomers') || 'العملاء') + ': ' + results.customers, 'info');
    await new Promise(r => setTimeout(r, 0));

    // ===== 2) SUPPLIERS (personnez idType = 2) =====
    migrationUpdateStatus((t('migration.roleSuppliers') || 'الموردون') + '...', 'info');
    const supByPersId = {};
    const supByName = new Map();
    for (const s of DB.getSuppliers()) { const k = norm(s.name); if (k && !supByName.has(k)) supByName.set(k, s); }
    const newSuppliers = [];
    for (const r of pers.rows) {
      if (num(r[iType]) !== 2) continue;
      const name = txt(r[iName]);
      if (!name) continue;
      const pid = txt(r[iPersId]);
      const key = norm(name);
      const existing = supByName.get(key);
      if (existing) { if (pid) supByPersId[pid] = existing.id; continue; }
      const s = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: name,
        phone: txt(r[iTel]) || txt(r[iMobile]),
        address: txt(r[iAdr]),
        balance: num(r[iSolde]),
        createdAt: Date.now(),
      };
      newSuppliers.push(s);
      supByName.set(key, s);
      if (pid) supByPersId[pid] = s.id;
      results.suppliers++;
    }
    if (newSuppliers.length) { const all = DB.getSuppliers(); for (const s of newSuppliers) all.push(s); DB.saveSuppliers(all); }
    migrationUpdateStatus((t('migration.roleSuppliers') || 'الموردون') + ': ' + results.suppliers, 'info');
    await new Promise(r => setTimeout(r, 0));

    // ===== 3) PRODUCTS (articlesliste) =====
    migrationUpdateStatus((t('migration.roleProducts') || 'المنتجات') + '...', 'info');
    const art = T.articlesliste;
    const iRefA = idxOf(art, 'RefArt'), iNomA = idxOf(art, 'NomArt'), iNomAR = idxOf(art, 'NomArtAR'),
      iQ = idxOf(art, 'QTE'), iVD = idxOf(art, 'PrixVD'), iVG = idxOf(art, 'PrixVG'),
      iPA = idxOf(art, 'PrixAchat'), iCat = idxOf(art, 'idCat'), iUnit = idxOf(art, 'idunite'),
      iAlarm = idxOf(art, 'AlarmQte'), iMinP = idxOf(art, 'PrixVenteMin'), iEmp = idxOf(art, 'EmplacementHV');
    const productsToAdd = [];
    const seenBarcode = new Set();
    for (const r of art.rows) {
      const ref = txt(r[iRefA]);
      if (!ref) continue;
      const bar = barcodeByRef[ref] || ref;
      const barKey = norm(bar);
      if (seenBarcode.has(barKey)) continue;
      seenBarcode.add(barKey);
      if (DB.getProductByBarcode(bar)) continue; // already imported — keep as is
      productsToAdd.push({
        name: txt(r[iNomA]) || txt(r[iNomAR]) || ref,
        barcode: bar,
        reference: ref,
        buyPrice: num(r[iPA]),
        sellPrice: num(r[iVD]),
        wholesalePrice: num(r[iVG]),
        quantity: num(r[iQ]),
        minStock: num(r[iAlarm]),
        minPrice: num(r[iMinP]),
        family: catById[num(r[iCat])] || '',
        category: '',
        unit: mapUnit(r[iUnit]),
        storageLocation: txt(r[iEmp]),
        supplierId: '',
        extraPrices: {},
        notes: 'Sable Stock',
      });
    }
    for (let i = 0; i < productsToAdd.length; i += 200) {
      const chunk = productsToAdd.slice(i, i + 200);
      await DB.addProductsBatch(chunk, null, { source: 'import-sable' });
      results.products += chunk.length;
      migrationUpdateStatus((t('migration.roleProducts') || 'المنتجات') + ': ' + results.products + '/' + productsToAdd.length, 'info');
      await new Promise(r => setTimeout(r, 0));
    }
    // RefArt → product, so invoice lines link to the real product.
    const refToProd = {};
    for (const r of art.rows) {
      const ref = txt(r[iRefA]);
      if (!ref || refToProd[ref]) continue;
      const bar = barcodeByRef[ref] || ref;
      const p = DB.getProductByBarcode(bar);
      if (p) refToProd[ref] = p;
    }

    // ===== 4) SALES INVOICES (bonsliv + journsortie) =====
    migrationUpdateStatus((t('migration.roleSalesInvoices') || 'فواتير البيع') + '...', 'info');
    const js = T.journsortie;
    const jBL = idxOf(js, 'idBL'), jBC = idxOf(js, 'idbonCont'), jDoss = idxOf(js, 'idDoss'),
      jYear = idxOf(js, 'idyears'), jRef = idxOf(js, 'RefArt'), jQ = idxOf(js, 'Qte'),
      jP = idxOf(js, 'Prix'), jDesign = idxOf(js, 'design'), jNomAR = idxOf(js, 'nomArtAR');
    const linesByBL = new Map();
    const linesByBC = new Map();
    for (const r of js.rows) {
      const bl = txt(r[jBL]);
      if (bl) {
        const k = txt(r[jDoss]) + '|' + txt(r[jYear]) + '|' + bl;
        let arr = linesByBL.get(k); if (!arr) { arr = []; linesByBL.set(k, arr); }
        arr.push(r);
        continue;
      }
      const bc = txt(r[jBC]);
      if (bc) {
        const k = txt(r[jDoss]) + '|' + bc;
        let arr = linesByBC.get(k); if (!arr) { arr = []; linesByBC.set(k, arr); }
        arr.push(r);
      }
    }
    const buildItems = (rows) => {
      const items = [];
      let profit = 0;
      for (const lr of rows) {
        const ref = txt(lr[jRef]);
        const p = ref ? refToProd[ref] : null;
        const qty = num(lr[jQ]);
        const price = num(lr[jP]);
        const total = qty * price;
        items.push({
          productId: p ? p.id : '',
          barcode: p ? p.barcode : (ref || ''),
          name: (p && p.name) || txt(lr[jNomAR]) || txt(lr[jDesign]) || ref || '',
          qty: qty,
          price: price,
          total: total,
          unit: p ? p.unit : undefined,
        });
        profit += total - qty * (p ? (parseFloat(p.buyPrice) || 0) : 0);
      }
      return { items: items, profit: Math.round(profit * 100) / 100 };
    };

    const bl = T.bonsliv;
    const bBL = idxOf(bl, 'idBonLiv'), bDoss = idxOf(bl, 'idDoss'), bYear = idxOf(bl, 'idyears'),
      bDate = idxOf(bl, 'DateBL'), bTotal = idxOf(bl, 'Total'), bClient = idxOf(bl, 'Client'),
      bRegl = idxOf(bl, 'MontRegl'), bRem = idxOf(bl, 'MRemise'), bMode = idxOf(bl, 'modepai'),
      bObs = idxOf(bl, 'Observ'), bNomC = idxOf(bl, 'nomCstmer'), bTelC = idxOf(bl, 'telCstmer'),
      bAdrC = idxOf(bl, 'adreseCstmer');
    let processed = 0;
    for (const r of bl.rows) {
      const blId = txt(r[bBL]);
      const doss = txt(r[bDoss]), year = txt(r[bYear]);
      const migKey = 'gssp|BL|' + doss + '|' + year + '|' + blId;
      if (existingInvKeys.has(migKey)) { results.skipped++; continue; }
      const dateMs = parseDate(r[bDate]);
      const realYear = yearOf(r[bDate]) || (parseInt(year, 10) || new Date().getFullYear());
      const built = buildItems(linesByBL.get(doss + '|' + year + '|' + blId) || []);
      const items = built.items;
      const legacyTotal = num(r[bTotal]);
      const discount = num(r[bRem]);
      let totalAmount = legacyTotal;
      if (!items.length) {
        // Header-only waybill (no detail rows): keep the document with a single
        // synthetic line so its historical total is preserved verbatim.
        const label = txt(r[bNomC]) || txt(r[bObs]) || (t('migration.gsspSaleLine') || 'بيع');
        items.push({ productId: '', barcode: '', name: label, qty: 1, price: legacyTotal, total: legacyTotal });
        totalAmount = legacyTotal;
      } else if (!(legacyTotal > 0)) {
        totalAmount = items.reduce((s, it) => s + it.total, 0);
      }
      const customerId = custByPersId[txt(r[bClient])] || '';
      const invData = {
        type: 'customer',
        date: dateMs,
        createdAt: dateMs,
        items: items,
        totalAmount: totalAmount,
        extraDiscount: discount,
        profit: built.profit,
        migKey: migKey,
        note: (t('migration.gsspInvoiceNote') || 'فاتورة Sable Stock') + ' — ' + blId,
      };
      if (customerId) invData.customerId = customerId;
      else {
        invData.walkinName = txt(r[bNomC]) || (t('migration.walkin') || 'عميل عابر');
        invData.walkinPhone = txt(r[bTelC]);
        invData.walkinAddress = txt(r[bAdrC]);
      }
      const inv = DB.addInvoice(invData, { keepCreatedAt: true, numberYear: realYear });
      existingInvKeys.add(migKey);
      results.saleInvoices++;
      const paid = num(r[bRegl]);
      if (paid > 0) {
        const payKey = 'gssp|PAYBL|' + doss + '|' + year + '|' + blId;
        if (!existingPayKeys.has(payKey)) {
          DB.addPayment({
            amount: Math.round(paid * 100) / 100,
            invoiceId: inv.id,
            customerId: customerId || undefined,
            date: dateMs,
            createdAt: dateMs,
            method: txt(r[bMode]) || 'cash',
            migKey: payKey,
            note: (t('migration.gsspPaymentNote') || 'دفعة Sable Stock') + ' — ' + blId,
          });
          existingPayKeys.add(payKey);
          results.payments++;
        }
      }
      processed++;
      if (processed % 50 === 0) {
        migrationUpdateStatus((t('migration.roleSalesInvoices') || 'فواتير البيع') + ': ' + results.saleInvoices, 'info');
        await new Promise(r2 => setTimeout(r2, 0));
      }
    }

    // ===== 5) CASH SALES (boncont + journsortie) =====
    const bcT = T.boncont;
    if (bcT) {
      const cBC = idxOf(bcT, 'idbonCont'), cDoss = idxOf(bcT, 'idDoss'), cDate = idxOf(bcT, 'dat'),
        cTotal = idxOf(bcT, 'Total'), cPay = idxOf(bcT, 'Mpayer'), cRem = idxOf(bcT, 'MRemise'),
        cNom = idxOf(bcT, 'NomCli'), cTel = idxOf(bcT, 'Tel'), cAdr = idxOf(bcT, 'Adrese'),
        cDel = idxOf(bcT, 'deleted');
      for (const r of bcT.rows) {
        if (cDel >= 0 && num(r[cDel]) === 1) continue; // deleted ticket
        const total = num(r[cTotal]);
        if (!(total > 0)) continue; // empty / aborted ticket
        const bcId = txt(r[cBC]); const doss = txt(r[cDoss]);
        const migKey = 'gssp|BC|' + doss + '|' + bcId;
        if (existingInvKeys.has(migKey)) { results.skipped++; continue; }
        const dateMs = parseDate(r[cDate]);
        const realYear = yearOf(r[cDate]) || new Date().getFullYear();
        const built = buildItems(linesByBC.get(doss + '|' + bcId) || []);
        const items = built.items;
        if (!items.length) items.push({ productId: '', barcode: '', name: (t('migration.gsspCashLine') || 'بيع نقدي'), qty: 1, price: total, total: total });
        const invData = {
          type: 'customer',
          date: dateMs,
          createdAt: dateMs,
          items: items,
          totalAmount: total,
          extraDiscount: num(r[cRem]),
          profit: built.profit,
          migKey: migKey,
          note: (t('migration.gsspCashNote') || 'فاتورة نقدية Sable Stock') + ' — ' + bcId,
        };
        invData.walkinName = txt(r[cNom]) || (t('migration.walkin') || 'عميل عابر');
        invData.walkinPhone = txt(r[cTel]);
        invData.walkinAddress = txt(r[cAdr]);
        const inv = DB.addInvoice(invData, { keepCreatedAt: true, numberYear: realYear });
        existingInvKeys.add(migKey);
        results.cashInvoices++;
        const paid = num(r[cPay]);
        if (paid > 0) {
          const payKey = 'gssp|PAYBC|' + doss + '|' + bcId;
          if (!existingPayKeys.has(payKey)) {
            DB.addPayment({
              amount: Math.round(paid * 100) / 100,
              invoiceId: inv.id,
              date: dateMs,
              createdAt: dateMs,
              migKey: payKey,
              note: (t('migration.gsspPaymentNote') || 'دفعة Sable Stock') + ' — ' + bcId,
            });
            existingPayKeys.add(payKey);
            results.payments++;
          }
        }
      }
    }

    migrationUpdateStatus('', '');
    migrationUpdateStatus(`✓ ${t('migration.fullImportDone') || 'اكتمل الاستيراد الشامل'}: ` +
      `${results.products} ${t('migration.roleProducts') || 'منتج'} • ${results.customers} ${t('migration.roleCustomers') || 'عميل'} • ` +
      `${results.suppliers} ${t('migration.roleSuppliers') || 'مورد'} • ${results.saleInvoices} ${t('migration.roleSalesInvoices') || 'فاتورة بيع'} • ` +
      `${results.cashInvoices} ${t('migration.gsspCashLabel') || 'فاتورة نقدية'} • ${results.payments} ${t('migration.rolePayments') || 'الدفعات'}` +
      (results.skipped ? ` • ${results.skipped} ${t('migration.gsspSkipped') || 'موجود مسبقاً'}` : ''), 'success');
  } finally {
    if (DB && DB.suppressAutoBackup) DB.suppressAutoBackup(false);
  }
}

/* ===== Balance Sync Tool: مزامنة أرصدة العملاء والموردين من STOCK.FDB ===== */

const _syncNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const _syncLoadTableAll = async (dbPath, tbl, options) => {
  const colsRes = await window.electronAPI.firebirdColumns(dbPath, tbl, options);
  if (!colsRes.success || !colsRes.data || !colsRes.data.length) return null;
  const cols = colsRes.data.map(c => c.name);
  const cntRes = await window.electronAPI.firebirdCount(dbPath, tbl, options);
  const total = cntRes.success ? (cntRes.data || 0) : -1;
  if (total < 0) return null;
  if (total === 0) return [];
  const q = await window.electronAPI.firebirdQuery(dbPath, tbl, cols, 0, total, options);
  return q.success ? (q.data || []) : null;
};

const _syncAmountOf = (row, preferred) => {
  for (const p of preferred) {
    if (row[p] !== undefined && row[p] !== null && row[p] !== '') return _syncNum(row[p]);
  }
  const keys = Object.keys(row || {});
  const cand = keys.filter(k => /montant|versement|credit|paiement/i.test(k) && !/date|n_|_n\b|code|id$/i.test(k));
  for (const k of cand) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return _syncNum(row[k]);
  }
  return 0;
};

const _genPartyId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

// Build "hybrid" parties — economic parties recorded in BOTH legacy master
// tables (CLIENT and FOURNISSEUR) because the business buys from them AND
// sells to them AND settles cash both ways. Storing the CREDIT side of each
// table separately leaves two mirror balances for one party (e.g. TAYEB NISSAN
// shows 537,200 in both, so the TRUTH is 0). The real balance is the NET:
//   NET = CLIENT.CREDIT_CLIENT − FOURNISSEUR.CREDIT_FOURNISSEUR
//   client record balance = NET          (positive ⇒ he owes us)
//   supplier record balance = −NET       (positive ⇒ we owe him)
// Pairing precedence keeps every legacy code in exactly one pair:
//   1) official linkage  : CLIENT_FOURNISSEUR table rows, then CODE_CF columns
//      (a client row references its supplier counterpart and vice-versa),
//   2) identical names   : same normalized name in both tables (e.g.
//      BEN AMARA SADOK 93/15, MAJOURI BACHIR 6/3) that qualify as one party.
// Ambiguous overlaps (official link vs same name on another code) stay in the
// per-party table for manual review rather than being double-counted.
function _buildHybridPairs(clientRows, fourRows, linkRows) {
  const norm = s => String(s || '').trim().toLowerCase();
  const skipComp = s => /vente\s*a\s*comptoir|a\s*comptoir/i.test(s || '');
  const clByCode = {};
  const frByCode = {};
  for (const r of (clientRows || [])) clByCode[String(r.CODE_CLIENT || '').trim()] = r;
  for (const r of (fourRows || [])) frByCode[String(r.CODE_FOURNISSEUR || '').trim()] = r;
  const usedC = new Set();
  const usedF = new Set();
  const pairs = [];
  const addPair = (cRow, fRow, basis) => {
    if (!cRow || !fRow) return;
    const cc = String(cRow.CODE_CLIENT || '').trim();
    const fc = String(fRow.CODE_FOURNISSEUR || '').trim();
    if (!cc || !fc || usedC.has(cc) || usedF.has(fc)) return;
    const cName = String(cRow.NOM_CLIENT || '').trim();
    const fName = String(fRow.NOM_FOURNISSEUR || '').trim();
    if (!cName || !fName || skipComp(cName) || skipComp(fName)) return;
    const creditClient = _syncNum(cRow.CREDIT_CLIENT);
    const creditFournisseur = _syncNum(fRow.CREDIT_FOURNISSEUR);
    pairs.push({
      cCode: cc, fCode: fc, cName, fName, basis,
      creditClient, creditFournisseur,
      net: creditClient - creditFournisseur,
    });
    usedC.add(cc);
    usedF.add(fc);
  };
  // 1a) official linkage from the CLIENT_FOURNISSEUR join table
  for (const r of (linkRows || [])) {
    const cc = String(r.CODE_CLIENT || '').trim();
    const fc = String(r.CODE_FOURNISSEUR || '').trim();
    if (cc && fc) addPair(clByCode[cc], frByCode[fc], 'cf');
  }
  // 1b) CODE_CF columns (covers pairs newer than the join table)
  for (const r of (clientRows || [])) {
    const fc = String(r.CODE_CF || '').trim();
    if (fc && fc !== '-1') addPair(r, frByCode[fc], 'cf');
  }
  for (const r of (fourRows || [])) {
    const cc = String(r.CODE_CF || '').trim();
    if (cc && cc !== '-1') addPair(clByCode[cc], r, 'cf');
  }
  // 2) same normalized name in both tables
  const clByName = {};
  for (const r of (clientRows || [])) {
    const key = norm(r.NOM_CLIENT);
    if (key && !clByName[key]) clByName[key] = r;
  }
  for (const r of (fourRows || [])) {
    const key = norm(r.NOM_FOURNISSEUR);
    if (key && clByName[key]) addPair(clByName[key], r, 'name');
  }
  return pairs;
}

// Pairs the user has explicitly confirmed as ONE and the same person recorded
// twice (even though the given names differ slightly, e.g. CHAKER / ACHRAF).
const CONFIRMED_DOUBLE_CODES = [
  ['31', '61'], // BEN AMAR CHAKER (client) ⇄ BEN AMAR ACHRAF (supplier)
];

// True double-role parties: the SAME normalized name appears in BOTH the CLIENT
// and FOURNISSEUR tables AND both records have real activity (a sale invoice or
// receipt on the client side; a purchase invoice or payment on the supplier
// side). The legacy program classified such a person as a SUPPLIER trading both
// ways, so the two stored records carry the same business and must NET together:
// client record = NET, supplier record = −NET. Every other party is independent.
function _detectTrueDoubles(clientRows, fourRows, fcCodes, vcCodes, ffCodes, vfCodes) {
  const norm = s => String(s || '').trim().toLowerCase();
  const clByName = {};
  for (const r of (clientRows || [])) {
    const key = norm(r.NOM_CLIENT);
    if (key && !clByName[key]) clByName[key] = r;
  }
  const usedF = new Set();
  const pairs = [];
  for (const r of (fourRows || [])) {
    const fCode = String(r.CODE_FOURNISSEUR || '').trim();
    if (!fCode || usedF.has(fCode)) continue;
    const cRow = clByName[norm(r.NOM_FOURNISSEUR)];
    if (!cRow) continue;
    const cCode = String(cRow.CODE_CLIENT || '').trim();
    if (!cCode) continue;
    const actC = (fcCodes && fcCodes.has(cCode)) || (vcCodes && vcCodes.has(cCode));
    const actF = (ffCodes && ffCodes.has(fCode)) || (vfCodes && vfCodes.has(fCode));
    if (!actC || !actF) continue;
    const creditClient = _syncNum(cRow.CREDIT_CLIENT);
    const creditFournisseur = _syncNum(r.CREDIT_FOURNISSEUR);
    pairs.push({
      cCode, fCode,
      cName: String(cRow.NOM_CLIENT || '').trim(),
      fName: String(r.NOM_FOURNISSEUR || '').trim(),
      basis: 'double',
      creditClient, creditFournisseur,
      net: creditClient - creditFournisseur,
    });
    usedF.add(fCode);
  }
  return pairs;
}

const _getSyncFirebirdDb = async () => {
  const st = _migrationState || {};
  if (st.firebird && st.firebird.dbPath) {
    return { dbPath: st.firebird.dbPath, options: (st.firebird.options || { charset: 'WIN1252' }) };
  }
  const result = await window.electronAPI.openFile({
    filters: [{ name: 'Firebird', extensions: ['fdb', 'fbk'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
  const src = result.filePaths[0];
  const opts = { charset: 'WIN1252' };
  try {
    const ext = String(src).split('.').pop().toLowerCase();
    let openPath = src;
    if (ext === 'fbk') {
      const res = await window.electronAPI.firebirdRestore(src, opts);
      if (!res.success) throw new Error(res.error);
      openPath = res.data.path;
    }
    const det = await window.electronAPI.firebirdDetect(openPath, opts);
    if (!det.success) throw new Error(det.error);
    await window.electronAPI.firebirdTables(openPath, opts);
    _migrationState.firebird = { dbPath: openPath, sourcePath: src, isBackup: ext === 'fbk', options: opts, ods: det.data.odsVersion + '.' + det.data.odsMinor };
    return { dbPath: openPath, options: opts };
  } catch (err) {
    alert((t('balanceTools.parseErr') || 'تعذر قراءة قاعدة البيانات القديمة') + ': ' + err.message);
    return null;
  }
};

window.startBalanceSyncFromGestion = async function () {
  if (!window._zmtCanEditBalance('debts')) {
    alert(t('balanceTools.cantEdit') || 'لا تملك صلاحية تعديل العملاء/الموردين');
    return;
  }
  const fb = await _getSyncFirebirdDb();
  if (!fb) return;
  const { dbPath, options } = fb;
  const norm = s => String(s || '').trim().toLowerCase();
  const skipName = s => /vente\s*a\s*comptoir|a\s*comptoir/i.test(s || '');
  const customers = DB.getCustomers();
  const suppliers = DB.getSuppliers();

  try {
    migrationUpdateStatus((t('balanceTools.syncTitle') || 'قراءة الأرشيف...') + '...', 'info');

    const cAgg = {};
    const fAgg = {};
    const fc = await _syncLoadTableAll(dbPath, 'FACTURE_CLIENT', options);
    if (fc) for (const r of fc) {
      const code = String(r['CODE_CLIENT'] || '').trim();
      if (!code) continue;
      const a = cAgg[code] || (cAgg[code] = { pay: 0, tot: 0 });
      a.tot += _syncNum(r['MONTANT_TTC']) - _syncNum(r['REMISE']);
      a.pay += _syncNum(r['VERSEMENT']);
    }
    const vc = await _syncLoadTableAll(dbPath, 'VERSEMENT_CLIENT', options);
    if (vc) for (const r of vc) {
      const code = String(r['CODE_CLIENT'] || '').trim();
      if (!code) continue;
      const a = cAgg[code] || (cAgg[code] = { pay: 0, tot: 0 });
      a.pay += _syncAmountOf(r, ['MONTANT', 'MONTANT_VERSEMENT', 'VERSEMENT']);
    }
    const ff = await _syncLoadTableAll(dbPath, 'FACTURE_FOURNISSEUR', options);
    if (ff) for (const r of ff) {
      const code = String(r['CODE_FOURNISSEUR'] || '').trim();
      if (!code) continue;
      const a = fAgg[code] || (fAgg[code] = { pay: 0, tot: 0 });
      a.tot += _syncNum(r['MONTANT_TTC']) - _syncNum(r['REMISE']);
      a.pay += _syncNum(r['VERSEMENT']);
    }
    const vf = await _syncLoadTableAll(dbPath, 'VERSEMENT_FOURNISSEUR', options);
    if (vf) for (const r of vf) {
      const code = String(r['CODE_FOURNISSEUR'] || '').trim();
      if (!code) continue;
      const a = fAgg[code] || (fAgg[code] = { pay: 0, tot: 0 });
      a.pay += _syncAmountOf(r, ['MONTANT', 'MONTANT_VERSEMENT', 'VERSEMENT']);
    }

    const rows = [];
    const clientRows = await _syncLoadTableAll(dbPath, 'CLIENT', options);
    if (clientRows) for (const r of clientRows) {
      const name = String(r['NOM_CLIENT'] || '').trim();
      if (!name || skipName(name)) continue;
      const code = String(r['CODE_CLIENT'] || '').trim();
      const rawStored = r['CREDIT_CLIENT'];
      const stored = (rawStored !== undefined && rawStored !== null && rawStored !== '') ? _syncNum(rawStored) : null;
      const agg = cAgg[code] || { pay: 0, tot: 0 };
      const computed = _syncNum(r['CREDIT_INITIAL']) + agg.tot - agg.pay;
      const cust = customers.find(c => norm(c.name) === norm(name));
      rows.push({ type: 'customer', name, code, id: cust ? cust.id : null, found: !!cust, current: cust ? (parseFloat(cust.balance) || 0) : null, stored, computed, checked: true });
    }
    const supRows = await _syncLoadTableAll(dbPath, 'FOURNISSEUR', options);
    if (supRows) for (const r of supRows) {
      const name = String(r['NOM_FOURNISSEUR'] || '').trim();
      if (!name) continue;
      const code = String(r['CODE_FOURNISSEUR'] || '').trim();
      const rawStored = r['CREDIT_FOURNISSEUR'];
      const stored = (rawStored !== undefined && rawStored !== null && rawStored !== '') ? _syncNum(rawStored) : null;
      const agg = fAgg[code] || { pay: 0, tot: 0 };
      const computed = _syncNum(r['CREDIT_INITIAL']) + agg.tot - agg.pay;
      const sup = suppliers.find(s => norm(s.name) === norm(name));
      rows.push({ type: 'supplier', name, code, id: sup ? sup.id : null, found: !!sup, current: sup ? (parseFloat(sup.balance) || 0) : null, stored, computed, checked: true });
    }

    // Hybrid parties (client ⇄ supplier) recorded on BOTH sides of the legacy
    // program: the true balance is the NET of the two ledgers, and each side of
    // the pair is written with the sign that matches its own role in the app.
    const linkRows = await _syncLoadTableAll(dbPath, 'CLIENT_FOURNISSEUR', options);
    const rawPairs = _buildHybridPairs(clientRows || [], supRows || [], linkRows);
    const codeSetOf = (rows, key) => { const s = new Set(); for (const r of rows) s.add(String(r[key] || '').trim()); return s; };
    const fcSet = codeSetOf(fc || [], 'CODE_CLIENT');
    const vcSet = codeSetOf(vc || [], 'CODE_CLIENT');
    const ffSet = codeSetOf(ff || [], 'CODE_FOURNISSEUR');
    const vfSet = codeSetOf(vf || [], 'CODE_FOURNISSEUR');
    const trueKeys = new Set();
    for (const d of _detectTrueDoubles(clientRows || [], supRows || [], fcSet, vcSet, ffSet, vfSet)) trueKeys.add(d.cCode + '|' + d.fCode);
    for (const pair of CONFIRMED_DOUBLE_CODES) trueKeys.add(pair[0] + '|' + pair[1]);
    const hybrid = rawPairs.map(p => {
      const cust = customers.find(c => norm(c.name) === norm(p.cName));
      const sup = suppliers.find(s => norm(s.name) === norm(p.fName));
      return {
        ...p,
        custId: cust ? cust.id : null,
        custFound: !!cust,
        custCur: cust ? (parseFloat(cust.balance) || 0) : null,
        supId: sup ? sup.id : null,
        supFound: !!sup,
        supCur: sup ? (parseFloat(sup.balance) || 0) : null,
        double: trueKeys.has(p.cCode + '|' + p.fCode),
        checked: true,
      };
    });

    migrationUpdateStatus('', '');
    _renderSyncModal(rows, hybrid);

  } catch (err) {
    console.error('[SyncBalances]', err);
    migrationUpdateStatus('', '');
    alert((t('balanceTools.parseErr') || 'تعذر قراءة قاعدة البيانات القديمة') + ': ' + err.message);
  }
};

function _renderSyncModal(rows, hybrid) {
  const old = document.getElementById('zmtSyncModal');
  if (old) old.remove();
  rows = rows || [];
  hybrid = hybrid || [];
  const normR = s => String(s || '').trim().toLowerCase();
  const money = (v) => { const n = Number(v) || 0; return fmtMoney(Math.abs(n)) + (n < 0 ? ' −' : n > 0 ? ' +' : ''); };
  const amountColor = (v) => v < 0 ? '#28a745' : v > 0 ? '#e65100' : 'var(--silver-500,#999)';
  const grayText = 'var(--silver-500,#999)';

  // Parties that belong to a hybrid (double-role) pair are governed by the NET
  // section below, so hide their individual rows from the stored/computed table.
  const hc = new Set(hybrid.map(p => p.cCode));
  const hf = new Set(hybrid.map(p => p.fCode));
  const single = rows.filter(r => !r.code || !((r.type === 'customer' && hc.has(r.code)) || (r.type === 'supplier' && hf.has(r.code))));
  const total = single.length;
  const changed = single.filter(r => r.found && r.stored !== null && Math.abs(r.stored - r.current) > 0.005).length;
  const confirmedCount = hybrid.filter(p => p.double).length;

  const rowHtml = single.map((r, i) => {
    const showStored = r.stored !== null ? money(r.stored) : '--';
    const showComp = money(r.computed);
    const showCur = r.found ? money(r.current) : '--';
    const match = r.found
      ? '<label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" class="zmt-sync-row" data-idx="' + i + '" checked> <span>' + (t('balanceTools.applyLabel') || 'تطبيق') + '</span></label>'
      : '<span style="font-size:10px;color:#e65100">' + (t('balanceTools.notMatched') || 'لم تُطابق') + '</span>';
    return '<tr style="' + (r.found ? '' : 'opacity:.45') + '">' +
      '<td style="font-size:11px;white-space:nowrap;color:' + grayText + '">' + (r.type === 'customer' ? (t('tab.customers') || 'عميل') : (t('tab.suppliers') || 'مورد')) + '</td>' +
      '<td style="font-weight:700">' + escHtml(r.name) + (r.code ? '<span style="font-size:10px;color:' + grayText + '"> #' + escHtml(r.code) + '</span>' : '') + '</td>' +
      '<td style="text-align:right;color:' + (r.found ? amountColor(r.current) : grayText) + '">' + showCur + '</td>' +
      '<td style="text-align:right">' + showStored + '</td>' +
      '<td style="text-align:right;color:var(--silver-600,#666)">' + showComp + '</td>' +
      '<td style="text-align:center">' + match + '</td>' +
    '</tr>';
  }).join('');

  const partyCell = (name, found, cur) => found
    ? '<div style="font-weight:700">' + escHtml(name) + '</div>' +
      '<div style="font-size:10px;color:' + amountColor(cur) + '">' + money(cur) + '</div>'
    : '<div style="font-weight:700">' + escHtml(name) + '</div>' +
      '<div style="font-size:10px;color:#e65100">' + (t('balanceTools.hybridCreate') || 'يُستحدث') + '</div>';

  const hyHtml = hybrid.map((r, i) => {
    const already = r.custFound && Math.abs((r.custCur || 0) - r.net) < 0.005 &&
      r.supFound && Math.abs((r.supCur || 0) - (-r.net)) < 0.005;
    const basis = r.basis === 'double' ? (t('balanceTools.basisDouble') || 'مورد ثنائي')
      : r.basis === 'confirmed' ? (t('balanceTools.basisConfirmed') || 'تأكيد يدوي')
      : r.basis === 'cf' ? (t('balanceTools.basisCf') || 'Code CF')
      : r.basis === 'both' ? (t('balanceTools.basisBoth') || 'CF + اسم')
      : (t('balanceTools.basisName') || 'الاسم');
    const status = r.double
      ? '<span style="display:inline-block;background:#e7f5e9;color:#1e7e34;border:1px solid #bfe7c8;border-radius:10px;padding:1px 9px;font-size:10px;font-weight:700">' + (t('balanceTools.hybridConfirmed') || 'مؤكد') + '</span>'
      : '<span style="display:inline-block;background:#fff7e6;color:#9a6700;border:1px solid #ffe2a8;border-radius:10px;padding:1px 9px;font-size:10px;font-weight:700">' + (t('balanceTools.hybridSuspect') || 'مراجعة') + '</span>';
    return '<tr style="' + (r.double ? '' : 'opacity:.85') + '">' +
      '<td style="vertical-align:top;padding:7px 8px">' + partyCell(r.cName, r.custFound, r.custCur) + (r.cCode ? '<div style="font-size:10px;color:' + grayText + '">#' + escHtml(r.cCode) + '</div>' : '') + '</td>' +
      '<td style="vertical-align:top;padding:7px 8px">' + partyCell(r.fName, r.supFound, r.supCur) + (r.fCode ? '<div style="font-size:10px;color:' + grayText + '">#' + escHtml(r.fCode) + '</div>' : '') + '</td>' +
      '<td style="vertical-align:top;padding:7px 8px;font-size:11px;color:' + grayText + '">' + basis + '<div style="margin-top:4px">' + status + '</div></td>' +
      '<td style="vertical-align:top;padding:7px 8px;text-align:right">' + money(r.creditClient) + '</td>' +
      '<td style="vertical-align:top;padding:7px 8px;text-align:right">' + money(r.creditFournisseur) + '</td>' +
      '<td style="vertical-align:top;padding:7px 8px;text-align:right;font-weight:800;color:' + amountColor(r.net) + '">' + money(r.net) + '</td>' +
      '<td style="vertical-align:top;padding:7px 8px;text-align:center"><label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" class="zmt-hybrid-row" data-idx="' + i + '"' + (already || !r.double ? '' : ' checked') + '> <span>' + (t('balanceTools.applyLabel') || 'تطبيق') + '</span></label></td>' +
    '</tr>';
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'zmtSyncModal';
  modal.style.display = 'flex';
  modal.innerHTML =
    '<div class="modal" style="max-width:980px;width:96vw">' +
      '<div class="modal-header">' +
        '<h3><i class="fas fa-exchange-alt"></i> ' + (t('balanceTools.syncTitle') || 'مزامنة الأرصدة من البرنامج القديم') + '</h3>' +
        '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div style="font-size:11px;color:var(--silver-500,#666);background:var(--silver-50,#f7f7f7);border:1px solid var(--silver-200,#e0e0e0);border-radius:8px;padding:8px 10px;margin-bottom:10px">' +
          (t('balanceTools.syncHint') || 'القيم أدناه مأخوذة من قاعدة البرنامج القديم: المخزّن = CREDIT_CLIENT/CREDIT_FOURNISSEUR، والمحسوب من مجاميع فواتير البيع/الشراء والدفعات.') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;margin:6px 0 4px">' +
          '<i class="fas fa-user"></i> ' + (t('balanceTools.sectionSingles') || 'أطراف مفردة') +
          ' <span style="font-size:11px;font-weight:600;color:var(--silver-500,#999)">(' + total + ')</span>' +
        '</div>' +
        '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:8px">' +
          '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600"><input type="radio" name="zmtSyncMode" value="stored" checked> ' + (t('balanceTools.modeStored') || 'استخدام الرصيد المخزّن (CREDIT)') + '</label>' +
          '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600"><input type="radio" name="zmtSyncMode" value="computed"> ' + (t('balanceTools.modeComputed') || 'استخدام الرصيد المحسوب من الأرشيف') + '</label>' +
          '<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-left:auto"><input type="checkbox" id="zmtSyncAll" checked> ' + (t('balanceTools.selectAll') || 'تحديد الكل') + '</label>' +
        '</div>' +
        '<div style="max-height:32vh;overflow:auto;border:1px solid var(--silver-200,#e0e0e0);border-radius:8px">' +
          '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:660px">' +
            '<thead><tr style="background:var(--silver-50,#f7f7f7)">' +
              '<th style="padding:7px 8px;text-align:right">' + (t('common.type') || 'النوع') + '</th>' +
              '<th style="padding:7px 8px;text-align:right">' + (t('common.party') || 'الطرف') + '</th>' +
              '<th style="padding:7px 8px;text-align:right">' + (t('balanceTools.current') || 'الرصيد الحالي') + '</th>' +
              '<th style="padding:7px 8px;text-align:right">' + (t('balanceTools.storedLabel') || 'المخزّن') + '</th>' +
              '<th style="padding:7px 8px;text-align:right">' + (t('balanceTools.computedLabel') || 'المحسوب') + '</th>' +
              '<th style="padding:7px 8px;text-align:center">✔</th>' +
            '</tr></thead>' +
            '<tbody>' + rowHtml + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin:14px 0 6px">' +
          '<span style="font-size:13px;font-weight:800;display:inline-flex;align-items:center;gap:8px"><i class="fas fa-retweet"></i> ' + (t('balanceTools.sectionHybrid') || 'الأطراف المزدوجة') +
          ' <span style="font-size:11px;font-weight:600;color:var(--silver-500,#999)">(' + hybrid.length + ' ' + (t('balanceTools.hybridPairCount') || 'زوج') + ')</span></span>' +
          '<span style="display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:700;margin-left:auto">' +
            '<span style="display:inline-block;background:#e7f5e9;color:#1e7e34;border:1px solid #bfe7c8;border-radius:10px;padding:1px 9px">' + (t('balanceTools.hybridConfirmed') || 'مؤكد') +
              ' ' + confirmedCount + '</span>' +
            '<span style="display:inline-block;background:#fff7e6;color:#9a6700;border:1px solid #ffe2a8;border-radius:10px;padding:1px 9px">' + (t('balanceTools.hybridSuspect') || 'مراجعة') +
              ' ' + (hybrid.length - confirmedCount) + '</span>' +
          '</span>' +
          '<label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="checkbox" id="zmtHybridAll"> ' + (t('balanceTools.selectAll') || 'تحديد الكل') + '</label>' +
        '</div>' +
        '<div style="font-size:11px;color:#7a5c00;background:#fff7e6;border:1px solid #ffe2a8;border-radius:8px;padding:8px 10px;margin-bottom:8px">' +
          (t('balanceTools.hybridHint') || '') +
          '<div style="margin-top:4px"><b>' + (t('balanceTools.hybridSignNote') || '') + '</b></div>' +
        '</div>' +
        (hybrid.length
          ? '<div style="max-height:30vh;overflow:auto;border:1px solid var(--silver-200,#e0e0e0);border-radius:8px">' +
              '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:780px">' +
                '<thead><tr style="background:#fff3d0">' +
                  '<th style="padding:7px 8px;text-align:right">' + (t('balanceTools.hybridCustCol') || 'العميل') + ' ⇄</th>' +
                  '<th style="padding:7px 8px;text-align:right">' + (t('balanceTools.hybridSupCol') || 'المورد') + '</th>' +
                  '<th style="padding:7px 8px;text-align:right">' + (t('balanceTools.hybridLinkCol') || 'الربط') + '</th>' +
                  '<th style="padding:7px 8px;text-align:right">' + (t('balanceTools.hybridCreditC') || 'رصيد العميل') + '</th>' +
                  '<th style="padding:7px 8px;text-align:right">' + (t('balanceTools.hybridCreditF') || 'رصيد المورد') + '</th>' +
                  '<th style="padding:7px 8px;text-align:right">' + (t('balanceTools.hybridNetCol') || 'NET الحقيقي') + '</th>' +
                  '<th style="padding:7px 8px;text-align:center">✔</th>' +
                '</tr></thead>' +
                '<tbody>' + hyHtml + '</tbody>' +
              '</table>' +
            '</div>'
          : '<div style="font-size:12px;color:var(--silver-500,#666);padding:6px 0">' + (t('balanceTools.noHybrids') || 'لا توجد أطراف مزدوجة') + '</div>') +
        '<div style="font-size:11px;color:var(--silver-500,#666);margin-top:10px">' +
          (t('balanceTools.matchedFor') || 'عدد الأطراف في القاعدة القديمة:') + ' ' + (total + hybrid.length * 2) + ' ' + (t('balanceTools.parties') || 'طرف') +
          ' • ' + changed + ' ' + (t('balanceTools.diffCount') || 'اختلاف عن الحالي') +
        '</div>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">' + (t('common.cancel') || 'إلغاء') + '</button>' +
        '<button class="btn btn-success" id="zmtSyncApply"><i class="fas fa-check"></i> ' + (t('balanceTools.applyLabel') || 'تطبيق') + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  document.getElementById('zmtSyncAll').addEventListener('change', function (e) {
    document.querySelectorAll('.zmt-sync-row').forEach(cb => { cb.checked = e.target.checked; });
  });
  const hyAll = document.getElementById('zmtHybridAll');
  if (hyAll) hyAll.addEventListener('change', function (e) {
    document.querySelectorAll('.zmt-hybrid-row').forEach(cb => { cb.checked = e.target.checked; });
  });

  document.getElementById('zmtSyncApply').addEventListener('click', async function () {
    const mode = document.querySelector('input[name="zmtSyncMode"]:checked').value;
    const apply = [];
    document.querySelectorAll('.zmt-sync-row').forEach(cb => {
      if (!cb.checked) return;
      const row = single[Number(cb.dataset.idx)];
      if (!row || !row.found || row.id == null) return;
      const val = mode === 'stored' ? row.stored : row.computed;
      if (val === null || val === undefined || isNaN(val)) return;
      if (Math.abs(val - row.current) < 0.005) return;
      apply.push({ type: row.type, id: row.id, name: row.name, old: row.current, next: val });
    });
    const hyApply = [];
    document.querySelectorAll('.zmt-hybrid-row').forEach(cb => {
      if (!cb.checked) return;
      const h = hybrid[Number(cb.dataset.idx)];
      if (!h) return;
      if (!(h.custFound && Math.abs((h.custCur || 0) - h.net) >= 0.005) &&
          !(h.supFound && Math.abs((h.supCur || 0) - (-h.net)) >= 0.005)) return;
      hyApply.push(h);
    });
    if (!apply.length && !hyApply.length) { alert(t('balanceTools.noChanges') || 'لا توجد تغييرات للتطبيق'); return; }
    if (typeof createPreImportBackup === 'function') { try { createPreImportBackup(); } catch (e) {} }
    const custList = DB.getCustomers();
    const supList = DB.getSuppliers();
    const audits = [];
    let custChanged = false, supChanged = false;

    for (const a of apply) {
      if (a.type === 'customer') {
        const rec = custList.find(c => c.id === a.id);
        if (!rec) continue;
        rec.balance = a.next; custChanged = true;
      } else {
        const rec = supList.find(s => s.id === a.id);
        if (!rec) continue;
        rec.balance = a.next; supChanged = true;
      }
      audits.push({ action: 'balance-sync', entity: a.type, entityId: a.id, detail: a.name + ' | ' + (Number(a.old) || 0).toFixed(2) + ' -> ' + (Number(a.next) || 0).toFixed(2) + ' (' + mode + ')' });
    }

    // Hybrid pairs: the twin of a party recorded on BOTH legacy ledgers. The
    // client record takes NET, the supplier record takes −NET, so neither side
    // carries a phantom mirror balance. A missing counterpart record is created
    // so every hybrid party is fully represented in both ledgers.
    for (const h of hyApply) {
      const cKey = normR(h.cName);
      const sKey = normR(h.fName);
      let cust = custList.find(c => normR(c.name) === cKey);
      const createdC = !cust;
      if (createdC) {
        cust = { id: _genPartyId(), name: h.cName.trim(), phone: '', address: '', discount: 0, balance: 0, totalPurchases: 0, createdAt: Date.now() };
        custList.push(cust);
      }
      const cOld = parseFloat(cust.balance) || 0;
      if (createdC || Math.abs(cOld - h.net) >= 0.005) {
        cust.balance = h.net; custChanged = true;
        audits.push({ action: 'balance-net', entity: 'customer', entityId: cust.id, detail: h.cName + ' (double ' + h.cCode + '⇄' + h.fCode + ') | ' + cOld.toFixed(2) + ' -> ' + h.net.toFixed(2) + (createdC ? ' [new]' : '') });
      }
      let sup = supList.find(s => normR(s.name) === sKey);
      const createdS = !sup;
      if (createdS) {
        sup = { id: _genPartyId(), name: h.fName.trim(), phone: '', address: '', balance: 0, createdAt: Date.now() };
        supList.push(sup);
      }
      const sOld = parseFloat(sup.balance) || 0;
      const sNew = -h.net;
      if (createdS || Math.abs(sOld - sNew) >= 0.005) {
        sup.balance = sNew; supChanged = true;
        audits.push({ action: 'balance-net', entity: 'supplier', entityId: sup.id, detail: h.fName + ' (double ' + h.cCode + '⇄' + h.fCode + ') | ' + sOld.toFixed(2) + ' -> ' + sNew.toFixed(2) + (createdS ? ' [new]' : '') });
      }
    }

    if (custChanged) DB.saveCustomers(custList);
    if (supChanged) DB.saveSuppliers(supList);
    if (typeof DB.logAudit === 'function') { for (const a of audits) { try { DB.logAudit(a); } catch (e) {} } }
    modal.remove();
    alert((t('balanceTools.applied') || 'تم تحديث الأرصدة:') + ' ' + audits.length + ' ' + (t('balanceTools.changedCount') || 'تعديل'));
    window.dispatchEvent(new CustomEvent('zmt:balances-updated'));
    if (window._refreshBalanceUIs) window._refreshBalanceUIs();
  });

  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
}

/* ===== Stock Sync Tool: مزامنة المخزون من STOCK.FDB =====
   Why this exists: the legacy program keeps ARTICLES.QUANTITE as a RUNNING
   BALANCE that already includes every purchase, sale and return. The full
   import seeded that value AND replayed the invoice history on top of it, so
   every product whose balance equalled its net movement came out exactly
   doubled (5 -> 10, 2 -> 4). Re-running the full import cannot repair it
   (existing products are skipped at line ~2141 while invoices are re-created),
   so stock has to be re-read from the master table on its own.
   This tool is idempotent: it only writes ARTICLES.QUANTITE onto matching
   products, touches no invoice, no balance and no price. */

const _stockSyncNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
};

const _stockSyncTxt = (v) => String(v === null || v === undefined ? '' : v).trim();

const _stockSyncKey = (v) => {
  const s = _stockSyncTxt(v);
  if (!s) return '';
  if (typeof canonBarcode === 'function') {
    try { const c = canonBarcode(s); if (c) return c; } catch (e) {}
  }
  return s.toLowerCase();
};

window.startStockSyncFromGestion = async function () {
  if (typeof Auth !== 'undefined' && Auth.canEdit && !Auth.canEdit('inventory')) {
    alert(t('stockTools.cantEdit') || 'لا تملك صلاحية تعديل المخزون');
    return;
  }
  const fb = await _getSyncFirebirdDb();
  if (!fb) return;
  const { dbPath, options } = fb;

  try {
    migrationUpdateStatus((t('stockTools.syncTitle') || 'مزامنة المخزون من البرنامج القديم') + '...', 'info');

    const articleRows = await _syncLoadTableAll(dbPath, 'ARTICLES', options);
    if (!articleRows || !articleRows.length) {
      migrationUpdateStatus('', '');
      alert(t('stockTools.empty') || 'لا توجد أصناف في قاعدة البرنامج القديم');
      return;
    }

    // Single pass over the local products, keyed by barcode AND by reference so
    // legacy rows carrying only REFERENCE still match.
    const byKey = new Map();
    for (const p of DB.getProducts()) {
      const kb = _stockSyncKey(p.barcode);
      if (kb && !byKey.has('bc:' + kb)) byKey.set('bc:' + kb, p);
      const kr = _stockSyncKey(p.reference);
      if (kr && !byKey.has('ref:' + kr)) byKey.set('ref:' + kr, p);
    }

    const diff = [];
    let matched = 0, unmatched = 0, same = 0, legacyTotal = 0, currentTotal = 0;
    const seen = new Set();
    for (const r of articleRows) {
      const ref = _stockSyncTxt(r['REFERENCE']);
      const bar = _stockSyncTxt(r['CODE_BAR']) || ref;
      if (!bar && !ref) continue;
      const legacy = _stockSyncNum(r['QUANTITE']);
      const p = (bar && byKey.get('bc:' + _stockSyncKey(bar))) ||
                (ref && byKey.get('ref:' + _stockSyncKey(ref))) || null;
      if (!p) { unmatched++; continue; }
      // Same legacy article can appear twice (REFERENCE + CODE_BAR rows).
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      matched++;
      legacyTotal += legacy;
      const current = Number(p.quantity) || 0;
      currentTotal += current;
      if (Math.abs(current - legacy) < 0.001) { same++; continue; }
      diff.push({ id: p.id, name: p.name || bar, barcode: p.barcode || bar, current, legacy });
    }

    migrationUpdateStatus('', '');
    if (!matched) {
      alert((t('stockTools.notMatched') || 'غير مطابق') + ': 0 — ' + (t('stockTools.unmatchedCount') || 'غير مطابق') + ' ' + unmatched);
      return;
    }
    _renderStockSyncModal(diff, { matched, same, unmatched, legacyTotal, currentTotal });
  } catch (err) {
    migrationUpdateStatus('', '');
    alert((t('stockTools.readError') || 'تعذر قراءة جدول ARTICLES من قاعدة البرنامج القديم') + ': ' + (err && err.message ? err.message : err));
  }
};

function _renderStockSyncModal(diff, stats) {
  const old = document.getElementById('zmtStockSyncModal');
  if (old) old.remove();
  diff = diff || [];
  const gray = 'var(--silver-500,#999)';
  const qty = (v) => String(Math.round((Number(v) || 0) * 1000) / 1000);
  const deltaColor = (v) => v > 0 ? '#1e7e34' : v < 0 ? '#c62828' : gray;

  const rowHtml = diff.map((r, i) => {
    const d = r.legacy - r.current;
    return '<tr>' +
      '<td style="font-weight:700">' + escHtml(r.name) + '</td>' +
      '<td style="font-size:11px;color:' + gray + ';white-space:nowrap">' + escHtml(r.barcode) + '</td>' +
      '<td style="text-align:right;color:' + deltaColor(-Math.abs(r.current)) + '">' + qty(r.current) + '</td>' +
      '<td style="text-align:right;font-weight:700">' + qty(r.legacy) + '</td>' +
      '<td style="text-align:right;font-weight:800;color:' + deltaColor(d) + '">' + (d > 0 ? '+' : '') + qty(d) + '</td>' +
      '<td style="text-align:center"><label style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px"><input type="checkbox" class="zmt-stock-row" data-idx="' + i + '" checked></label></td>' +
    '</tr>';
  }).join('');

  const emptyMsg = diff.length
    ? ''
    : '<div style="font-size:12px;color:var(--silver-600,#666);padding:14px;text-align:center">' + (t('stockTools.noChanges') || 'لا توجد فروقات — المخزون مطابق للبرنامج القديم') + '</div>';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'zmtStockSyncModal';
  modal.style.display = 'flex';
  modal.innerHTML =
    '<div class="modal" style="max-width:900px;width:96vw">' +
      '<div class="modal-header">' +
        '<h3><i class="fas fa-cubes"></i> ' + (t('stockTools.syncTitle') || 'مزامنة المخزون من البرنامج القديم') + '</h3>' +
        '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div style="font-size:11px;color:var(--silver-500,#666);background:var(--silver-50,#f7f7f7);border:1px solid var(--silver-200,#e0e0e0);border-radius:8px;padding:8px 10px;margin-bottom:10px">' +
          (t('stockTools.syncHint') || 'تُقرأ كمية كل صنف من جدول ARTICLES وتُطبَّق على المنتج المطابق. لا تُستعمل الفواتير لأن المخزون القديم يشملها بالفعل.') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:14px;font-size:12px;margin-bottom:8px;flex-wrap:wrap">' +
          '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700"><input type="checkbox" id="zmtStockAll" checked> ' + (t('stockTools.selectAll') || 'تحديد الكل') + '</label>' +
          '<span style="color:' + gray + '">' + (t('stockTools.matched') || 'مطابق') + ': <b>' + stats.matched + '</b></span>' +
          '<span style="color:' + gray + '">' + (t('stockTools.changed') || 'به فرق') + ': <b style="color:#e65100">' + diff.length + '</b></span>' +
          '<span style="color:' + gray + '">' + (t('stockTools.notMatched') || 'غير مطابق') + ': <b>' + stats.unmatched + '</b></span>' +
          '<span style="color:' + gray + '">' + (t('stockTools.currentTotal') || 'إجمالي الحالي') + ': <b>' + qty(stats.currentTotal) + '</b></span>' +
          '<span style="color:' + gray + '">' + (t('stockTools.legacyTotal') || 'إجمالي القديم') + ': <b>' + qty(stats.legacyTotal) + '</b></span>' +
        '</div>' +
        emptyMsg +
        (diff.length ?
        '<div style="max-height:52vh;overflow:auto;border:1px solid var(--silver-200,#e0e0e0);border-radius:8px">' +
          '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
            '<thead><tr style="background:var(--silver-50,#f7f7f7);position:sticky;top:0">' +
              '<th style="text-align:right;padding:7px 8px">' + (t('common.product') || 'المنتج') + '</th>' +
              '<th style="text-align:right;padding:7px 8px">' + (t('common.barcode') || 'الباركود') + '</th>' +
              '<th style="text-align:right;padding:7px 8px">' + (t('stockTools.current') || 'الكمية الحالية') + '</th>' +
              '<th style="text-align:right;padding:7px 8px">' + (t('stockTools.legacy') || 'كمية البرنامج القديم') + '</th>' +
              '<th style="text-align:right;padding:7px 8px">' + (t('stockTools.difference') || 'الفرق') + '</th>' +
              '<th style="text-align:center;padding:7px 8px">' + (t('stockTools.applyLabel') || 'تطبيق') + '</th>' +
            '</tr></thead>' +
            '<tbody>' + rowHtml + '</tbody>' +
          '</table>' +
        '</div>' : '') +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">' + (t('common.cancel') || 'إلغاء') + '</button>' +
        '<button class="btn btn-success" id="zmtStockSyncApply"' + (diff.length ? '' : ' disabled') + '><i class="fas fa-check"></i> ' + (t('stockTools.applyLabel') || 'تطبيق') + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  const all = document.getElementById('zmtStockAll');
  if (all) all.addEventListener('change', function (e) {
    document.querySelectorAll('.zmt-stock-row').forEach(cb => { cb.checked = e.target.checked; });
  });

  document.getElementById('zmtStockSyncApply').addEventListener('click', async function () {
    const apply = [];
    document.querySelectorAll('.zmt-stock-row').forEach(cb => {
      if (!cb.checked) return;
      const row = diff[Number(cb.dataset.idx)];
      if (!row || !row.id) return;
      if (Math.abs((Number(row.legacy) || 0) - (Number(row.current) || 0)) < 0.001) return;
      apply.push(row);
    });
    if (!apply.length) { alert(t('stockTools.noChanges') || 'لا توجد فروقات للتطبيق'); return; }

    let backedUp = false;
    if (typeof createPreImportBackup === 'function') {
      try { backedUp = !!(await createPreImportBackup()); } catch (e) {}
    }

    DB.updateProductsBatch(apply.map(r => ({ id: r.id, changes: { quantity: r.legacy } })));

    if (typeof DB.logAudit === 'function') {
      for (const r of apply) {
        try {
          DB.logAudit({ action: 'stock-sync', entity: 'product', entityId: r.id, detail: (r.name || r.barcode) + ' | ' + (Number(r.current) || 0) + ' -> ' + (Number(r.legacy) || 0) });
        } catch (e) {}
      }
    }

    modal.remove();
    alert((t('stockTools.applied') || 'تمت مزامنة المخزون لـ') + ' ' + apply.length + ' ' + (t('stockTools.changedCount') || 'منتج') +
      (backedUp ? '\n' + (t('stockTools.backupNote') || 'تم حفظ نسخة احتياطية قبل التطبيق.') : ''));

    window.dispatchEvent(new CustomEvent('zmt:stock-updated'));
    if (window._currentPageId === 'inventory' && typeof window.refreshCurrentPageApp === 'function') {
      try { window.refreshCurrentPageApp('inventory'); } catch (e) {}
    }
  });

  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
}