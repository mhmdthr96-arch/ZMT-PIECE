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
  _migrationState = { step: 1, file: null, fileBuffer: null, filePath: null, fileType: null, parsedData: null, db: null, firebird: null, firebirdPagesLoaded: {}, selectedTable: null, headers: [], rows: [], mapping: {}, totalRows: 0, columnAnalysis: null, selectedBrands: [], brandConfirmed: false, tableRole: 'products', previewPage: 0, finalPage: 0, aiMode: false, aiResult: null, aiProcessing: false, gestionStock: false };
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
  document.getElementById('migrationFileInput').value = '';
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

async function processMigrationFile(file) {
  try {
    migrationUpdateStatus(t('migration.reading'), 'info');
    
    const buffer = await file.arrayBuffer();
    _migrationState.file = file;
    _migrationState.fileBuffer = buffer;
    _migrationState.filePath = (file && file.path) || null;
    
    const detected = FileDetector.detect(file.name, buffer);
    _migrationState.fileType = detected.type;
    
    const ext = file.name.split('.').pop().toUpperCase();
    const sizeKB = (file.size / 1024).toFixed(1);
    document.getElementById('migrationFileName').textContent = file.name;
    document.getElementById('migrationFileType').textContent = `${ext} • ${sizeKB} KB • ${detected.type}`;
    document.getElementById('migrationFileInfo').style.display = 'block';
    document.getElementById('migrationDropZone').style.display = 'none';
    
    migrationUpdateStatus('', '');
    document.getElementById('migrationNextBtn').disabled = false;
    
  } catch (err) {
    migrationUpdateStatus(t('migration.readError') + ': ' + err.message, 'error');
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
    migrationUpdateStatus(t('migration.parseError') + ': ' + err.message, 'error');
    return false;
  }
}

function renderMigrationTableSelect(tables) {
  const el = document.getElementById('migrationTableList');
  document.getElementById('migrationTableSelect').style.display = 'block';
  document.getElementById('migrationPreview').style.display = 'none';
  
  const handler = _migrationState.firebird ? 'selectFirebirdTable' : 'selectMigrationTable';
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
    migrationUpdateStatus(t('migration.firebirdOpenError') + ': ' + err.message, 'error');
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
    if (ref) articleMap[ref] = { name: txt(r['DESIGNATION']), buyPrice: num(r['PRIX_ACHAT']), sellPrice: num(r['PRIX1']) };
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
    const created = await DB.addProductsBatch([...newProducts.values()]);
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
      if (si >= 0) { list[si].balance = (parseFloat(list[si].balance) || 0) + totalAmount; DB.saveSuppliers(list); }
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

      prodMap.set(key, {
        name,
        barcode,
        brandId: resolveBrand(rv(row, 'brand')),
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
      const created = await DB.addProductsBatch(chunk);
      for (const p of created) productById[p.barcode] = p.id;
      prodsImported += chunk.length;
      setImportStatus(`المنتجات: ${prodsImported}/${allProds.length}`);
      await new Promise(r => setTimeout(r, 0));
    }

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
  const up = new Set((tableNames || []).map(n => String(n).toUpperCase()));
  return ['FACTURE_CLIENT', 'DETAIL_FACTURE_CLIENT', 'CLIENT', 'FOURNISSEUR', 'ARTICLES'].every(t => up.has(t));
}

function renderGestionStockFullImportPanel() {
  const panel = document.getElementById('migrationFullImportPanel');
  if (!panel) return;
  panel.style.display = 'block';
  const tableSelect = document.getElementById('migrationTableSelect');
  if (tableSelect) tableSelect.style.display = 'none';
  const preview = document.getElementById('migrationPreview');
  if (preview) preview.style.display = 'none';
  const rolePopup = document.getElementById('migrationRolePopup');
  if (rolePopup) rolePopup.style.display = 'none';
}

async function startGestionStockFullImport() {
  if (!_migrationState.firebird) return;
  const popup = document.getElementById('migrationFullBrandPopup');
  if (popup) popup.style.display = 'none';
  const btn = document.getElementById('migrationFullImportBtn');
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span data-i18n="migration.importing">جاري الاستيراد...</span>';
    }
    await importGestionStockFull(null);
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
    const json = JSON.stringify(backup, (k, v) => {
      if (typeof v === 'bigint') return String(v);
      if (v === undefined) return null;
      return v;
    });
    await window.electronAPI.writeFile(filePath, json);
    return filePath;
  } catch (err) {
    console.warn('[Migration] Pre-import backup failed:', err);
    return null;
  }
}

async function importGestionStockInvoices(ctx) {
  const { dbPath, options, load, num, txt, parseDate, custCodeToId, supCodeToId, prodByRef, prodByBar, ensureProduct, results } = ctx;

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
    });
  }
  const purItems = new Map();
  for (const r of purDetails) {
    const n = txt(r['N_FACTURE']);
    const ref = txt(r['REFERENCE_ARTICLE']);
    if (!n || !ref) continue;
    if (!purItems.has(n)) purItems.set(n, []);
    purItems.get(n).push({ ref, qty: num(r['QUANTITE']) || 1, price: num(r['PRIX_ACHAT']) || num(r['PRIX1']) });
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
    const totalAmount = invItems.reduce((s, it) => s + it.total, 0);
    let supplierId = '';
    if (hdr) supplierId = supCodeToId[hdr.supCode] || '';
    if (!supplierId) supplierId = (DB.getSuppliers()[0] || {}).id || '';
    const invData = { type: 'supplier', date: hdr ? hdr.date : Date.now(), items: invItems, totalAmount, extraDiscount: 0, supplierId, note: (t('migration.oldInvoiceNote') || 'فاتورة مستوردة') + ' — ' + n };
    const inv = DB.addInvoice(invData);
    if (hdr && hdr.paid > 0) DB.addPayment({ amount: hdr.paid, invoiceId: inv.id, supplierId, note: t('migration.oldPaymentNote') || 'مدفوعات مستوردة' });
    for (const it of invItems) {
      const p = DB.getProductByBarcode(it.barcode);
      if (p) DB.updateProduct(p.id, { quantity: (p.quantity || 0) + it.qty });
    }
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
    });
  }
  const cliItems = new Map();
  for (const r of cliDetails) {
    const n = txt(r['N_FACTURE']);
    const ref = txt(r['REFERENCE_ARTICLE']);
    if (!n || !ref) continue;
    if (!cliItems.has(n)) cliItems.set(n, []);
    cliItems.get(n).push({ ref, qty: num(r['QUANTITE']) || 1, price: num(r['PUV']) });
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
    const totalAmount = invItems.reduce((s, it) => s + it.total, 0);
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
    if (paid > 0) DB.addPayment({ amount: paid, invoiceId: inv.id, customerId: customerId || undefined, note: t('migration.oldPaymentNote') || 'مدفوعات مستوردة' });
    for (const it of invItems) {
      const p = DB.getProductByBarcode(it.barcode);
      if (p) DB.updateProduct(p.id, { quantity: Math.max(0, (p.quantity || 0) - it.qty) });
    }
    if (customerId) {
      const list = DB.getCustomers();
      const ci = list.findIndex(c => c.id === customerId);
      if (ci >= 0) { list[ci].balance = (parseFloat(list[ci].balance) || 0) + (totalAmount - paid - discount); DB.saveCustomers(list); }
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
    avoirItems.get(n).push({ ref, qty: num(r['QUANTITE']) || num(r['NBR']) || 1, price: num(r['PUV']) });
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
      DB.updateProduct(p.id, { quantity: (p.quantity || 0) + it.qty });
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
  for (const r of clientRows) {
    const name = txt(r['NOM_CLIENT']);
    if (!name || /vente\s*a\s*comptoir|a\s*comptoir/i.test(name)) continue;
    const key = norm(name);
    if (existingCust.has(key)) {
      const ex = DB.getCustomers().find(c => norm(c.name) === key);
      if (ex) custCodeToId[txt(r['CODE_CLIENT'])] = ex.id;
      continue;
    }
    const c = DB.addCustomer({
      name: name.trim(),
      phone: txt(r['TEL']) || txt(r['MOBILE']),
      address: txt(r['ADRESSE']) || txt(r['VILLE']),
      discount: 0,
    });
    custCodeToId[txt(r['CODE_CLIENT'])] = c.id;
    results.customers++;
  }
  migrationUpdateStatus((t('migration.roleCustomers') || 'العملاء') + ': ' + results.customers, 'info');
  await new Promise(r => setTimeout(r, 0));

  // ===== 2) SUPPLIERS =====
  migrationUpdateStatus((t('migration.roleSuppliers') || 'الموردون') + '...', 'info');
  const fourRows = await load('FOURNISSEUR');
  const existingSup = new Set(DB.getSuppliers().map(s => norm(s.name)));
  const supCodeToId = {};
  const newSuppliers = [];
  for (const r of fourRows) {
    const name = txt(r['NOM_FOURNISSEUR']);
    if (!name) continue;
    const key = norm(name);
    if (existingSup.has(key)) continue;
    const s = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: name.trim(),
      phone: txt(r['TEL']) || txt(r['MOBILE']),
      address: txt(r['ADRESSE']) || txt(r['VILLE']),
      balance: 0,
    };
    newSuppliers.push(s);
    supCodeToId[txt(r['CODE_FOURNISSEUR'])] = s.id;
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
    const created = await DB.addProductsBatch(chunk);
    productsCreated.push(...created);
    results.products += chunk.length;
    migrationUpdateStatus((t('migration.roleProducts') || 'المنتجات') + ': ' + results.products + '/' + productsToAdd.length, 'info');
    await new Promise(r => setTimeout(r, 0));
  }
  if (results.products === 0) {
    migrationUpdateStatus((t('migration.productsNone') || 'لم يتم استيراد أي منتج (تأكد من تحديد العلامات)'), 'warning');
  }

  // Maps for invoice import
  const prodByRef = {};
  const prodByBar = {};
  for (const p of productsCreated) {
    if (p.barcode) prodByBar[p.barcode] = p;
  }
  for (const r of articleRows) {
    const marque = txt(r['MARQUE']);
    if (keepMarques && marque && !keepMarques.has(marque)) continue;
    const ref = txt(r['REFERENCE']);
    const bar = txt(r['CODE_BAR']) || ref;
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
    const created = await DB.addProductsBatch([{
      name: name || ref || bc,
      barcode: bc,
      brandId: '',
      category: '',
      buyPrice: 0,
      sellPrice: price || 0,
      wholesalePrice: 0,
      quantity: 0,
      supplierId: '',
      notes: 'Sable',
    }]);
    const p = created[0];
    if (p) { prodByBar[bc] = p; if (ref) prodByRef[ref] = p; }
    return p || null;
  };

  try {
    await importGestionStockInvoices({ dbPath, options, load, num, txt, parseDate, custCodeToId, supCodeToId, prodByRef, prodByBar, ensureProduct, results, migrationUpdateStatus, setImportStatus, t });
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