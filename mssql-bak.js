const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let _sessions = new Map(); // bakPath -> { dataDir, dbName, tables }

function getScriptPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'mssql', 'mssql-bak.ps1'),
    path.join(__dirname, 'mssql-bak.ps1'),
    path.join(__dirname, 'scripts', 'mssql-bak.ps1'),
    path.join(process.cwd(), 'mssql-bak.ps1'),
  ];
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch (e) {}
  }
  return null;
}

function findSqlLocalDb() {
  const candidates = [];
  // PATH
  try {
    const r = spawnSync('sqllocaldb', ['info'], { windowsHide: true, encoding: 'utf8' });
    if (r.status === 0) return 'sqllocaldb';
  } catch (e) {}
  // known install locations
  const bases = [
    'C:\\Program Files\\Microsoft SQL Server',
    'C:\\Program Files (x86)\\Microsoft SQL Server',
  ];
  for (const b of bases) {
    try {
      if (!fs.existsSync(b)) continue;
      for (const ver of fs.readdirSync(b)) {
        const exe = path.join(b, ver, 'Tools', 'Binn', 'SqlLocalDB.exe');
        if (fs.existsSync(exe)) candidates.push(exe);
      }
    } catch (e) {}
  }
  return candidates.length ? candidates[0] : null;
}

function runSqlLocalDb(args) {
  const exe = findSqlLocalDb();
  if (!exe) return { status: -1, stdout: '', stderr: 'sqllocaldb not found' };
  const r = spawnSync(exe, args, { windowsHide: true, encoding: 'utf8', timeout: 60000 });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function runPowerShell(scriptPath, psArgs) {
  return new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath].concat(psArgs);
    let child;
    try {
      child = spawn('powershell.exe', args, { windowsHide: true });
    } catch (err) {
      return reject(err);
    }
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      reject(new Error('PowerShell timed out'));
    }, 590000);
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function ensureEngine() {
  // check if already available
  const info = runSqlLocalDb(['info', 'MSSQLLocalDB']);
  if (info.status === 0) {
    // ensure started
    runSqlLocalDb(['start', 'MSSQLLocalDB']);
    return { ok: true, already: true, installed: false };
  }
  // find MSI
  const msiCandidates = [
    path.join(process.resourcesPath || '', 'mssql', 'SqlLocalDB.msi'),
    path.join(__dirname, 'resources', 'mssql', 'SqlLocalDB.msi'),
    path.join(__dirname, 'mssql', 'SqlLocalDB.msi'),
    path.join(process.cwd(), 'resources', 'mssql', 'SqlLocalDB.msi'),
  ];
  let msi = null;
  for (const c of msiCandidates) { try { if (c && fs.existsSync(c)) { msi = c; break; } } catch (e) {} }
  if (!msi) {
    return { ok: false, error: 'SqlLocalDB.msi not found. Please install SQL Server Express LocalDB manually.' };
  }
  // run msiexec silently
  const r = spawnSync('msiexec.exe', ['/i', msi, '/qn', '/norestart', 'IACCEPTSQLLOCALDBLICENSETERMS=YES'], {
    windowsHide: true, timeout: 600000,
  });
  if (r.status !== 0) {
    return { ok: false, error: 'LocalDB install failed (code ' + r.status + '): ' + (r.stderr || r.stdout || '') };
  }
  // verify
  const info2 = runSqlLocalDb(['info', 'MSSQLLocalDB']);
  if (info2.status !== 0) {
    return { ok: false, error: 'LocalDB installed but instance not available: ' + (info2.stderr || '') };
  }
  runSqlLocalDb(['start', 'MSSQLLocalDB']);
  return { ok: true, already: false, installed: true };
}

async function detect(bakPath) {
  const script = getScriptPath();
  if (!script) return { success: false, error: 'mssql-bak.ps1 not found' };
  const eng = await ensureEngine();
  if (!eng.ok) return { success: false, error: eng.error };
  const dataDir = path.join(os.tmpdir(), 'zmtbak_' + Date.now().toString(36));
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
  const r = await runPowerShell(script, ['-BakPath', bakPath, '-DataDir', dataDir, '-Instance', '(localdb)\\MSSQLLocalDB', '-Mode', 'detect']);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout.trim()); } catch (e) {
    // try last line
    const lines = r.stdout.trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      try { parsed = JSON.parse(lines[i]); break; } catch (e2) {}
    }
  }
  if (!parsed || !parsed.ok) {
    return { success: false, error: (parsed && parsed.error) || r.stderr || ('detect failed (code ' + r.code + ')') };
  }
  // keep session
  _sessions.set(bakPath, { dataDir, dbName: null, tables: parsed.tables || [] });
  return { success: true, data: { tables: parsed.tables || [], logical: parsed.logical || [] } };
}

async function exportAll(bakPath) {
  const script = getScriptPath();
  if (!script) return { success: false, error: 'mssql-bak.ps1 not found' };
  const eng = await ensureEngine();
  if (!eng.ok) return { success: false, error: eng.error };
  let sess = _sessions.get(bakPath);
  const dataDir = (sess && sess.dataDir) ? sess.dataDir : path.join(os.tmpdir(), 'zmtbak_' + Date.now().toString(36));
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
  const tables = 'Stock,Client,Clientbis,Fournisseur,Fournisseurbis,Fact1,Fact2,Fact1four,Fact2Four,credit_clients,mouvement_caisse';
  const r = await runPowerShell(script, ['-BakPath', bakPath, '-DataDir', dataDir, '-Instance', '(localdb)\\MSSQLLocalDB', '-Mode', 'export', '-Tables', tables]);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout.trim()); } catch (e) {
    const lines = r.stdout.trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      try { parsed = JSON.parse(lines[i]); break; } catch (e2) {}
    }
  }
  if (!parsed || !parsed.ok) {
    return { success: false, error: (parsed && parsed.error) || r.stderr || ('export failed (code ' + r.code + ')') };
  }
  // read each table JSON
  const data = {};
  for (const t of (parsed.tables || [])) {
    const fp = t.file;
    try {
      let raw = fs.readFileSync(fp, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      data[t.name] = JSON.parse(raw);
    } catch (e) {
      data[t.name] = [];
    }
  }
  _sessions.set(bakPath, { dataDir, dbName: null, tables: parsed.tables || [] });
  return { success: true, data, dataDir };
}

async function readTable(bakPath, table) {
  const sess = _sessions.get(bakPath);
  if (!sess) return { success: false, error: 'No active session. Call detect/export first.' };
  const fp = path.join(sess.dataDir, table + '.json');
  try {
    let raw = fs.readFileSync(fp, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return { success: true, data: JSON.parse(raw) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function dispose(bakPath) {
  const sess = _sessions.get(bakPath);
  if (sess && sess.dataDir) {
    try {
      // drop any leftover temp db files
      fs.rmSync(sess.dataDir, { recursive: true, force: true });
    } catch (e) {}
  }
  _sessions.delete(bakPath);
  return { success: true };
}

module.exports = {
  ensureEngine,
  detect,
  exportAll,
  readTable,
  dispose,
  getScriptPath,
};
