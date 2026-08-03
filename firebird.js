const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Firebird Embedded (2.5) reader built on top of the bundled isql.exe
// Reads .fdb / .gdb files directly from disk without installing a server.

let _runtimeDir = null;

function setRuntimeDir(dir) {
  _runtimeDir = dir;
}

function getRuntimeDir() {
  if (_runtimeDir && fs.existsSync(_runtimeDir)) return _runtimeDir;
  if (process.env.FIREBIRD_RUNTIME && fs.existsSync(process.env.FIREBIRD_RUNTIME)) {
    return process.env.FIREBIRD_RUNTIME;
  }
  if (process.resourcesPath) {
    const p = path.join(process.resourcesPath, 'firebird');
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, 'firebird-runtime');
}

function runIsql(dbPath, sql, options = {}) {
  return new Promise((resolve, reject) => {
    const dir = getRuntimeDir();
    const exe = path.join(dir, 'isql.exe');
    if (!fs.existsSync(exe)) {
      return reject(new Error('Firebird engine not found at ' + exe));
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const sqlFile = path.join(os.tmpdir(), 'zmtfb_' + id + '.sql');
    const outFile = path.join(os.tmpdir(), 'zmtfb_' + id + '.out');

    fs.writeFileSync(sqlFile, sql, 'utf8');

    const args = [
      '-user', options.user || 'SYSDBA',
      '-password', options.password || 'masterkey',
      '-charset', options.charset || 'WIN1252',
      dbPath,
      '-i', sqlFile,
      '-o', outFile,
    ];

    let child;
    try {
      child = spawn(exe, args, {
        cwd: dir,
        env: {
          ...process.env,
          FIREBIRD: dir,
          PATH: dir + path.delimiter + (process.env.PATH || ''),
        },
        windowsHide: true,
      });
    } catch (err) {
      cleanup();
      return reject(err);
    }

    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      cleanup();
      reject(new Error('Firebird query timed out'));
    }, options.timeout || 120000);

    child.on('error', (err) => {
      clearTimeout(timer);
      cleanup();
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const buf = fs.existsSync(outFile) ? fs.readFileSync(outFile) : Buffer.alloc(0);
        resolve({ code, output: buf, stderr });
      } catch (err) {
        reject(err);
      } finally {
        cleanup();
      }
    });

    function cleanup() {
      try { fs.unlinkSync(sqlFile); } catch (e) {}
      try { fs.unlinkSync(outFile); } catch (e) {}
    }
  });
}

// ---------------------------------------------------------------------------
// Parsing helpers (isql `SET LIST ON` output is deterministic for the bundled
// isql.exe: each line = <column-name padded to 32> + <value>)
// ---------------------------------------------------------------------------

function decodeOutput(buf, encoding) {
  const enc = encoding || 'win1252';
  try {
    if (enc === 'utf8') return buf.toString('utf8');
    if (enc === 'latin1') return buf.toString('latin1');
    const iconv = require('iconv-lite');
    return iconv.decode(buf, enc);
  } catch (e) {
    return buf.toString('utf8');
  }
}

// Split `SET LIST ON` output into records. Each record has `colCount` values
// aligned with the aliases c0..cN that generated the query.
function parseListOn(text, colCount) {
  const records = [];
  let current = [];
  const lines = text.split(/\r?\n/);
  for (let raw of lines) {
    let line = raw.replace(/\r$/, '');
    if (!line.trim()) {
      if (current.length) {
        records.push(current);
        current = [];
      }
      continue;
    }
    // The column-name field is padded to 32 chars by isql.
    let value = line.length > 32 ? line.slice(32) : '';
    value = value.trim();
    // Defensive: if the name field width differs (never expected), try to
    // strip a leading run of spaces after a short token instead.
    if (value === '' && line.trim().length > 0) {
      const m = line.match(/^\s*[^\s]+\s+(.*)$/);
      value = m ? m[1].trim() : '';
    }
    current.push(value);
  }
  if (current.length) records.push(current);
  return records;
}

// ---------------------------------------------------------------------------
// High level API (all synchronous work is delegated to isql sub-process)
// ---------------------------------------------------------------------------

async function detect(dbPath, options) {
  const sql = [
    'set list on;',
    'select mon$ods_major as c0, mon$ods_minor as c1 from mon$database;',
    'select rdb$character_set_name as c0 from rdb$database;',
    'exit;',
  ].join('\n');
  const res = await runIsql(dbPath, sql, options);
  if (res.code !== 0) {
    throw new Error(cleanError(res.stderr) || 'تعذر فتح ملف قاعدة البيانات');
  }
  const text = decodeOutput(res.output, options && options.encoding);
  const rows = parseListOn(text, 2);
  if (!rows.length) throw new Error('الملف ليس قاعدة بيانات Firebird صالحة');
  return {
    charset: rows.length > 1 ? rows[1][0] : '',
    odsVersion: rows[0][0],
    odsMinor: rows[0][1],
  };
}

async function listTables(dbPath, options) {
  const sql = [
    'set list on;',
    'select rdb$relation_name as c0, rdb$system_flag as c1 from rdb$relations where rdb$system_flag = 0 and rdb$view_blr is null order by rdb$relation_name;',
    'exit;',
  ].join('\n');
  const res = await runIsql(dbPath, sql, options);
  if (res.code !== 0) throw new Error(cleanError(res.stderr));
  const rows = parseListOn(decodeOutput(res.output, options && options.encoding), 2);
  const tables = rows
    .filter(r => r[0])
    .map(r => ({ name: r[0] }))
    .filter(t => !/^FIB\$|^MON\$|^RDB\$/.test(t.name));
  return tables;
}

async function getColumns(dbPath, table, options) {
  const sql = [
    'set list on;',
    'select rf.rdb$field_name as c0, fld.rdb$field_type as c1, fld.rdb$field_length as c2, fld.rdb$field_scale as c3 from rdb$relation_fields rf join rdb$fields fld on rf.rdb$field_source = fld.rdb$field_name where rf.rdb$relation_name = ' + str(table) + ' order by rf.rdb$field_position;',
    'exit;',
  ].join('\n');
  const res = await runIsql(dbPath, sql, options);
  if (res.code !== 0) throw new Error(cleanError(res.stderr));
  const rows = parseListOn(decodeOutput(res.output, options && options.encoding), 4);
  return rows
    .filter(r => r[0])
    .map(r => ({
      name: r[0],
      type: parseInt(r[1], 10) || 0,
      length: parseInt(r[2], 10) || 0,
      scale: parseInt(r[3], 10) || 0,
    }));
}

async function getRowCount(dbPath, table, options) {
  const sql = [
    'set list on;',
    'select count(*) as c0 from ' + quote(table) + ';',
    'exit;',
  ].join('\n');
  const res = await runIsql(dbPath, sql, options);
  if (res.code !== 0) throw new Error(cleanError(res.stderr));
  const rows = parseListOn(decodeOutput(res.output, options && options.encoding), 1);
  const n = rows.length && rows[0][0] ? parseInt(String(rows[0][0]).replace(/[^0-9]/g, ''), 10) : 0;
  return isNaN(n) ? 0 : n;
}

async function queryTable(dbPath, table, columns, from, to, options) {
  const cols = columns.map((c, i) => quote(c) + ' as c' + i);
  const range = (from > 0) ? (' rows ' + (from + 1) + ' to ' + to) : (' rows 1 to ' + to);
  const sql = [
    'set list on;',
    'select ' + cols.join(', ') + ' from ' + quote(table) + range + ';',
    'exit;',
  ].join('\n');
  const res = await runIsql(dbPath, sql, options);
  if (res.code !== 0) throw new Error(cleanError(res.stderr));
  const records = parseListOn(decodeOutput(res.output, options && options.encoding), columns.length);
  return records.map((rec) => {
    const obj = {};
    columns.forEach((c, i) => { obj[c] = rec[i] !== undefined ? rec[i] : ''; });
    return obj;
  });
}

function quote(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function str(name) {
  return "'" + String(name).replace(/'/g, "''") + "'";
}

function cleanError(stderr) {
  if (!stderr) return '';
  const lines = stderr.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return lines.slice(0, 6).join(' | ');
}

module.exports = {
  setRuntimeDir,
  getRuntimeDir,
  detect,
  listTables,
  getColumns,
  getRowCount,
  queryTable,
};
