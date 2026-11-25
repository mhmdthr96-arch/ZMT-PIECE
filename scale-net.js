// ============================================================================
// ZMT PIECE — SCALE LINK (تنزيل قائمة الأصناف إلى الميزان)
// ============================================================================
// The hardware half of the scale sync: it takes the text scale-sync-core.js
// built and pushes it into the machine over whichever link the shop has —
//   - COM     : [IO.Ports.SerialPort]        (a real RS-232 / USB-serial cable)
//   - RAW-COM : [IO.File]::Open('\\.\COMx')  (the port another app holds open)
//   - NET     : [Net.Sockets.TcpClient]      (a scale with an IP address)
// Everything runs through the same PowerShell 5.1 layer printer-net.js uses, so
// no native module is added and the Electron 22 / Windows 7 build is untouched.
// Every call resolves to a JSON object; a missing cable can never crash the app.
// ============================================================================

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// ---- Generic PowerShell runner (same contract as printer-net.js) ------------

function encode(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function wrapScript(expression, resultFile) {
  const q = resultFile.replace(/'/g, "''");
  return (
    "$ErrorActionPreference = 'Stop'\n" +
    'try {\n' +
    '  (\n' + expression + '\n  ) | ConvertTo-Json -Compress -Depth 6 | Out-File -Encoding utf8 -LiteralPath \'' + q + '\'\n' +
    '} catch {\n' +
    '  [pscustomobject]@{\n' +
    '    __error = ($_.Exception.Message | Out-String).Trim()\n' +
    '  } | ConvertTo-Json -Compress | Out-File -Encoding utf8 -LiteralPath \'' + q + '\'\n' +
    '}\n'
  );
}

function wrapScriptBlock(script, resultFile) {
  const q = resultFile.replace(/'/g, "''");
  return (
    "$ErrorActionPreference = 'Stop'\n" +
    'try {\n' +
    '  $__zmt = & {\n' + script + '\n  }\n' +
    '  $__zmt | ConvertTo-Json -Compress -Depth 6 | Out-File -Encoding utf8 -LiteralPath \'' + q + '\'\n' +
    '} catch {\n' +
    '  [pscustomobject]@{\n' +
    '    __error = ($_.Exception.Message | Out-String).Trim()\n' +
    '  } | ConvertTo-Json -Compress | Out-File -Encoding utf8 -LiteralPath \'' + q + '\'\n' +
    '}\n'
  );
}

function newResultFile() {
  return path.join(os.tmpdir(), 'zmt_scale_' + process.pid + '_' + crypto.randomBytes(6).toString('hex') + '.json');
}

function readResultFile(resultFile) {
  try {
    let raw = fs.readFileSync(resultFile, 'utf8');
    try { fs.unlinkSync(resultFile); } catch (e) {}
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function runPS(expression, timeoutMs) {
  return new Promise((resolve) => {
    const resultFile = newResultFile();
    let resolved = false;
    const safeResolve = (v) => { if (!resolved) { resolved = true; try { clearTimeout(timer); } catch (e) {} resolve(v); } };
    const child = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(wrapScript(expression, resultFile))],
      { windowsHide: true, shell: false }
    );
    let errOut = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      safeResolve({ success: false, error: 'TIMEOUT (' + (timeoutMs || 25000) + 'ms)' });
    }, timeoutMs || 25000);
    child.stderr.on('data', (d) => { errOut += d.toString(); });
    child.on('error', (e) => safeResolve({ success: false, error: e.message }));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (resolved) return;
      resolved = true;
      const data = readResultFile(resultFile);
      if (data && data.__error) { resolve({ success: false, error: data.__error }); return; }
      resolve({ success: code === 0, data, stderr: errOut });
    });
  });
}

function runPSBlock(script, timeoutMs) {
  return new Promise((resolve) => {
    const resultFile = newResultFile();
    let resolved = false;
    const safeResolve = (v) => { if (!resolved) { resolved = true; try { clearTimeout(timer); } catch (e) {} resolve(v); } };
    const child = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(wrapScriptBlock(script, resultFile))],
      { windowsHide: true, shell: false }
    );
    let errOut = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      safeResolve({ success: false, error: 'TIMEOUT (' + (timeoutMs || 25000) + 'ms)' });
    }, timeoutMs || 25000);
    child.stderr.on('data', (d) => { errOut += d.toString(); });
    child.on('error', (e) => safeResolve({ success: false, error: e.message }));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (resolved) return;
      resolved = true;
      const data = readResultFile(resultFile);
      if (data && data.__error) { resolve({ success: false, error: data.__error }); return; }
      resolve({ success: code === 0, data, stderr: errOut });
    });
  });
}

// PowerShell literal for a byte array; keep it tiny so it survives EncodedCommand.
function psBytes(bytes) {
  return '@(' + bytes.map((b) => String(b & 0xff)).join(',') + ')';
}

// ---- text -> bytes ----------------------------------------------------------

// A counter scale is fed ASCII/Latin bytes; a modern one accepts UTF-8. Node's
// Buffer knows both, so the encoding is decided by the chosen profile.
function textToBytes(text, encoding) {
  const enc = String(encoding || 'utf8').toLowerCase();
  const bufEnc = (enc === 'utf8' || enc === 'utf-8') ? 'utf8' : 'latin1';
  return Array.from(Buffer.from(String(text == null ? '' : text), bufEnc));
}

// ---- transport runners ------------------------------------------------------

function comExpr(port, baud, bytes, timeoutMs) {
  const p = String(port).replace(/'/g, "''");
  return `$sp = New-Object System.IO.Ports.SerialPort
$sp.PortName    = '${p}'
$sp.BaudRate    = ${parseInt(baud, 10) || 9600}
$sp.Parity      = 'None'
$sp.DataBits    = 8
$sp.StopBits    = 'One'
$sp.Handshake   = 'None'
$sp.WriteTimeout = ${Math.max(1000, parseInt(timeoutMs, 10) || 4000)}
$sp.ReadTimeout  = 500
$sp.Open()
try {
  $sp.Write(${psBytes(bytes)}, 0, ${bytes.length})
  $sp.BaseStream.Flush()
  Start-Sleep -Milliseconds 400
} finally { $sp.Close(); $sp.Dispose() }
[pscustomobject]@{ sent = ${bytes.length}; transport = 'com'; port = '${p}' }`;
}

function rawComExpr(port, bytes) {
  const p = String(port).replace(/'/g, "''");
  const dev = '\\\\.\\' + p;
  return `$fs = [System.IO.File]::Open('${dev}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
try {
  $fs.Write(${psBytes(bytes)}, 0, ${bytes.length})
  $fs.Flush()
  Start-Sleep -Milliseconds 400
} finally { $fs.Close(); $fs.Dispose() }
[pscustomobject]@{ sent = ${bytes.length}; transport = 'raw-com'; device = '${dev}' }`;
}

function netExpr(host, port, bytes, timeoutMs) {
  const h = String(host).replace(/'/g, "''");
  const ms = Math.max(1000, parseInt(timeoutMs, 10) || 5000);
  return `$client = New-Object System.Net.Sockets.TcpClient
$iar = $client.BeginConnect('${h}', ${parseInt(port, 10) || 9100}, $null, $null)
if (-not $iar.AsyncWaitHandle.WaitOne(${ms})) { $client.Close(); throw 'CONNECT_TIMEOUT' }
$client.EndConnect($iar)
$stream = $client.GetStream()
$stream.Write(${psBytes(bytes)}, 0, ${bytes.length})
$stream.Flush()
Start-Sleep -Milliseconds 400
$stream.Close(); $client.Close()
[pscustomobject]@{ sent = ${bytes.length}; transport = 'net'; host = '${h}' }`;
}

// Turn a raw PowerShell/exception string into an Arabic, actionable reason.
function errorReason(rawError, ctx) {
  const m = String(rawError || '');
  if (/CONNECT_TIMEOUT|timed out|timeout/i.test(m) && ctx && ctx.transport === 'net') {
    return { code: 'net_timeout', ar: 'لم يستجب الميزان على ' + (ctx.host || '') + ':' + (ctx.port || '') + ' خلال المهلة. تأكد أن الميزان على الشبكة وأن المنفذ مفتوح.' };
  }
  if (/Access.*denied|0x00000005|غير مسموح|being used|sharing/i.test(m)) {
    return { code: 'denied', ar: 'الوصول مرفوض: المنفذ مستعمل من برنامج آخر أو يحتاج صلاحية. أغلق البرامج التي تستعمل المنفذ وحاول مجددًا.' };
  }
  if (/does not exist|cannot find|not found|no such/i.test(m)) {
    return { code: 'no_port', ar: 'المنفذ غير موجود. وصّل الميزان ثم أعد المسح.' };
  }
  return { code: 'failed', ar: 'فشل الإرسال إلى الميزان: ' + (m || 'سبب غير معروف') };
}

// ---- scan: enumerate serial ports ------------------------------------------

async function scanPorts() {
  const comExpr = `@(Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | ForEach-Object {
    [pscustomobject]@{
      port        = $_.DeviceID
      description = $_.Description
      name        = $_.Name
      pnpId       = $_.PNPDeviceID
    }
  })`;
  const netExpr = `@(try { [System.IO.Ports.SerialPort]::GetPortNames() } catch { @() })`;
  const [r, r2] = await Promise.all([runPS(comExpr, 25000), runPS(netExpr, 10000)]);
  let list = (r && r.success && Array.isArray(r.data)) ? r.data : [];
  if (r && r.success && r.data && !Array.isArray(r.data) && r.data.port) list = [r.data];
  let netPorts = (r2 && r2.success && Array.isArray(r2.data)) ? r2.data : (r2 && r2.success && r2.data ? [r2.data] : []);
  const have = new Set(list.map(c => String(c.port || c).trim().toUpperCase()));
  for (const np of netPorts) {
    const pn = String(np || '').trim();
    if (pn && !have.has(pn.toUpperCase())) { list.push({ port: pn, description: 'Serial port', name: pn, pnpId: '' }); have.add(pn.toUpperCase()); }
  }
  if (list.length === 0) {
    const pnpExpr = `@(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'COM\\d+' } | ForEach-Object { [pscustomobject]@{ port = ([regex]::Match($_.Name, 'COM\\d+')).Value; description = $_.Name; name = $_.Name; pnpId = $_.PNPDeviceID } })`;
    const r3 = await runPS(pnpExpr, 25000);
    let list3 = (r3 && r3.success && Array.isArray(r3.data)) ? r3.data : [];
    if (r3 && r3.success && r3.data && !Array.isArray(r3.data) && r3.data.port) list3 = [r3.data];
    for (const c of list3) {
      const pn = String(c.port || '').trim();
      if (pn && !have.has(pn.toUpperCase())) { list.push(c); have.add(pn.toUpperCase()); }
    }
  }
  const ports = list.map((c) => {
    const port = String(c.port || '').trim();
    const desc = c.description ? String(c.description) : (c.name ? String(c.name) : '');
    return {
      port,
      description: desc,
      label: port + (desc ? ' — ' + desc : ''),
      // A USB→serial adapter is a virtual port that can usually be written raw
      // even while another program holds it open.
      virtual: /USB\d+/i.test(String(c.pnpId || '')) || /USB/i.test(desc),
    };
  }).filter((p) => p.port);
  return { success: true, data: { ports } };
}

// ---- send -------------------------------------------------------------------

// Send `bytes` over the chosen transport. Never throws.
async function sendBytes(cfg, bytes) {
  const transport = (cfg && cfg.transport) || 'com';
  const timeoutMs = Math.max(1000, parseInt((cfg && cfg.timeoutMs) || 5000, 10));
  if (!bytes || !bytes.length) return { success: false, error: 'EMPTY', errorAr: 'لا يوجد ما يُرسل — قائمة الأصناف فارغة.' };

  if (transport === 'net') {
    const host = String((cfg && cfg.host) || '').trim();
    const port = parseInt((cfg && cfg.port) || 9100, 10) || 9100;
    if (!host) return { success: false, error: 'NO_HOST', errorAr: 'لم يُحدَّد أي عنوان IP للميزان.' };
    const r = await runPSBlock(netExpr(host, port, bytes, timeoutMs), timeoutMs + 8000);
    if (!r.success) return { success: false, error: r.error, errorAr: errorReason(r.error, { transport: 'net', host, port }).ar };
    return { success: true, data: r.data, transport: 'net' };
  }

  if (transport === 'raw-com') {
    const port = String((cfg && cfg.comPort) || '').trim();
    if (!port) return { success: false, error: 'NO_COM_PORT', errorAr: 'لم تُحدَّد أي منفذ COM.' };
    const r = await runPSBlock(rawComExpr(port, bytes), timeoutMs + 8000);
    if (!r.success) return { success: false, error: r.error, errorAr: errorReason(r.error, { transport: 'raw-com', port }).ar };
    return { success: true, data: r.data, transport: 'raw-com' };
  }

  // Default: a real serial port.
  const port = String((cfg && cfg.comPort) || '').trim();
  if (!port) return { success: false, error: 'NO_COM_PORT', errorAr: 'لم تُحدَّد أي منفذ COM.' };
  const r = await runPSBlock(comExpr(port, cfg && cfg.baudRate, bytes, timeoutMs), timeoutMs + 8000);
  if (!r.success) return { success: false, error: r.error, errorAr: errorReason(r.error, { transport: 'com', port }).ar };
  return { success: true, data: r.data, transport: 'com' };
}

// The renderer hands us the finished text plus its encoding; we turn it into the
// exact bytes the machine expects and push them down the wire.
async function sendText(cfg, text, encoding) {
  const bytes = textToBytes(text, encoding);
  const res = await sendBytes(cfg, bytes);
  return Object.assign({ byteCount: bytes.length }, res);
}

module.exports = {
  scanPorts,
  sendBytes,
  sendText,
  textToBytes,
  errorReason,
};
