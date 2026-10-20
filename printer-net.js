// ============================================================================
// ZMT PIECE — LAN PRINTER SHARING & INSTALLATION
// Runs everything through PowerShell 5.1 so both sides of the shop LAN can
// share, discover and install the cash-register printer without shelling out
// to unreliable native tools. Admin-requiring operations self-elevate through
// UAC (Start-Process -Verb RunAs) exactly like the existing LAN firewall flow;
// the app never crashes — every call resolves to a JSON object.
// ============================================================================

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// ---- Generic PowerShell runner -------------------------------------------------

// Encode a script for -EncodedCommand (UTF-16LE base64) so no quoting/escaping
// hell survives the trip through PowerShell and Start-Process.
function encode(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

// Wrap a PowerShell expression so its output (or a caught error) is saved as a
// UTF-8 JSON file we can read back reliably from Node (avoids OEM codepage
// mangling of Arabic printer/driver names on stdout).
function wrapScript(expression, resultFile) {
  const q = resultFile.replace(/'/g, "''");
  return (
    "$ErrorActionPreference = 'Stop'\n" +
    'try {\n' +
    '  (\n' +
    expression +
    '\n  ) | ConvertTo-Json -Compress -Depth 6 | Out-File -Encoding utf8 -LiteralPath \'' +
    q +
    '\'\n' +
    '} catch {\n' +
    '  [pscustomobject]@{\n' +
    '    __error = ($_.Exception.Message | Out-String).Trim()\n' +
    '  } | ConvertTo-Json -Compress | Out-File -Encoding utf8 -LiteralPath \'' +
    q +
    '\'\n' +
    '}\n'
  );
}

function newResultFile() {
  return path.join(os.tmpdir(), 'zmt_ps_' + process.pid + '_' + crypto.randomBytes(6).toString('hex') + '.json');
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

// Run PowerShell in-process (not elevated): used for read-only/list queries.
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
    child.on('error', (e) => {
      safeResolve({ success: false, error: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (resolved) return;
      resolved = true;
      const data = readResultFile(resultFile);
      if (data && data.__error) {
        resolve({ success: false, error: data.__error });
        return;
      }
      resolve({ success: code === 0, data, stderr: errOut });
    });
  });
}

// Like wrapScript, but for a MULTI-STATEMENT body. wrapScript puts the expression
// inside "( ... )" so it can be piped to ConvertTo-Json — that only parses for a
// single pipeline. Serial/network sends need several statements (open, write,
// close), so here the body runs as-is and must end by emitting the object to the
// pipeline itself (or call `return`).
function wrapScriptBlock(script, resultFile) {
  const q = resultFile.replace(/'/g, "''");
  return (
    "$ErrorActionPreference = 'Stop'\n" +
    'try {\n' +
    '  $__zmt = & {\n' +
    script +
    '\n  }\n' +
    '  $__zmt | ConvertTo-Json -Compress -Depth 6 | Out-File -Encoding utf8 -LiteralPath \'' +
    q +
    '\'\n' +
    '} catch {\n' +
    '  [pscustomobject]@{\n' +
    '    __error = ($_.Exception.Message | Out-String).Trim()\n' +
    '  } | ConvertTo-Json -Compress | Out-File -Encoding utf8 -LiteralPath \'' +
    q +
    '\'\n' +
    '}\n'
  );
}

// Same contract as runPS() but takes a multi-statement script block.
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
    child.on('error', (e) => {
      safeResolve({ success: false, error: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (resolved) return;
      resolved = true;
      const data = readResultFile(resultFile);
      if (data && data.__error) {
        resolve({ success: false, error: data.__error });
        return;
      }
      resolve({ success: code === 0, data, stderr: errOut });
    });
  });
}

// Run PowerShell elevated via UAC: shows a consent prompt; the child writes a
// result file, we wait, then read it. A denied/cancelled prompt surfaces as a
// needsPermission flag instead of an exception so the UI can show a manual hint
// (mirrors lan-ensure-firewall).
function runPSElevated(expression, timeoutMs) {  return new Promise((resolve) => {
    const resultFile = newResultFile();
    let resolved = false;
    const safeResolve = (v) => { if (!resolved) { resolved = true; try { clearTimeout(timer); } catch (e) {} resolve(v); } };
    const childScript = encode(wrapScript(expression, resultFile));
    const wrapper =
      "Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait " +
      "-ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','" +
      childScript +
      "'";
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrapper], {
      windowsHide: true,
      shell: true,
    });
    const timer = setTimeout(() => {
      try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch (e) {}
      safeResolve({ success: false, needsPermission: true, error: 'TIMEOUT (' + (timeoutMs || 45000) + 'ms)' });
    }, (timeoutMs || 45000) + 10000);
    child.stderr.on('data', () => {});
    child.on('error', (e) => {
      safeResolve({ success: false, error: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (resolved) return;
      resolved = true;
      if (code !== 0) {
        // Elevation was refused/cancelled (UAC) — never treat as a crash.
        resolve({ success: false, needsPermission: true, error: 'ELEVATION_DENIED' });
        return;
      }
      const data = readResultFile(resultFile);
      if (data && data.__error) {
        resolve({ success: false, error: data.__error });
        return;
      }
      resolve({ success: true, data });
    });
  });
}

// ---- Shared printer model (local machine) ------------------------------------
// Pseudo/software printers cannot meaningfully be shared, so flag them.
// eslint-disable-next-line no-control-regex
const _PSEUDO_RE = /microsoft (print to pdf|xps document writer)|one note|fax/i;

// ---- Query operations (no elevation) ------------------------------------------

async function listLocalPrinters() {
  const r = await runPS(`@(Get-Printer | ForEach-Object {
    [pscustomobject]@{
      name       = $_.Name
      shared     = [bool]$_.Shared
      shareName  = $_.ShareName
      driverName = $_.DriverName
      portName   = $_.PortName
    }
  })`);
  if (!r.success) return { success: false, error: r.error };
  const printers = Array.isArray(r.data) ? r.data : [];
  const def = await runPS(
    `(Get-CimInstance Win32_Printer -Filter 'Default=$true' -ErrorAction SilentlyContinue).Name`
  );
  const defaultName = (def.success && def.data) ? String(def.data).trim() : '';
  return {
    success: true,
    data: printers.map((p) => ({
      name: p.name,
      shared: !!p.shared,
      shareName: p.shareName || null,
      driverName: p.driverName || '',
      portName: p.portName || '',
      isDefault: p.name === defaultName,
      shareable: !_PSEUDO_RE.test(p.name || ''),
    })),
  };
}

async function listLocalDrivers() {
  const r = await runPS(
    `@(Get-PrinterDriver -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name -Unique | Sort-Object)`
  );
  if (!r.success) return { success: false, error: r.error };
  const names = (Array.isArray(r.data) ? r.data : []).map((n) => String(n));
  return { success: true, data: names };
}

async function getDefaultPrinter() {
  const r = await runPS(
    `(Get-CimInstance Win32_Printer -Filter 'Default=$true' -ErrorAction SilentlyContinue).Name`
  );
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: r.data ? String(r.data).trim() : null };
}

async function getComputerName() {
  const r = await runPS(`$env:COMPUTERNAME`);
  if (!r.success) return { success: false, error: r.error };
  return { success: true, data: (r.data || '').toString().trim() };
}

async function restartSpooler() {
  const r = await runPSElevated(`Restart-Service Spooler -Force
[pscustomobject]@{ restarted = $true; status = (Get-Service Spooler).Status }`);
  if (!r.success) return r;
  return { success: true, data: r.data };
}

// ---- Share / unshare (elevated) -------------------------------------------------

function sanitizeShareName(name, computerName) {
  const base = String(name || '')
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .toUpperCase();
  const share = base || 'PRINTER';
  const unc = '\\\\' + (computerName || 'SERVER') + '\\' + share;
  return { share, unc };
}

// Locate the actual shared printer; returns a normalized alias for the NIC name
// of the share. Uses Set-Printer (privileged) on the local spooler.
async function sharePrinter(printerName, requestedShareName) {
  if (!printerName) return { success: false, error: 'PRINTER_NOT_SPECIFIED' };
  const cn = await getComputerName();
  const host = cn.success ? cn.data : 'SERVER';
  const { share, unc } = sanitizeShareName(requestedShareName || printerName, host);

  const expr =
    `$name = '${printerName.replace(/'/g, "''")}'
$share = '${share.replace(/'/g, "''")}'
$p = Get-Printer -Name $name -ErrorAction Stop
if (-not $p) { throw 'PRINTER_NOT_FOUND' }
Set-Printer -Name $name -Shared $true -ShareName $share -Published $true
Start-Sleep -Milliseconds 400
$p2 = Get-Printer -Name $name
[pscustomobject]@{
  name        = $p2.Name
  shared      = [bool]$p2.Shared
  shareName   = $p2.ShareName
  driverName  = $p2.DriverName
  unc         = '${unc.replace(/'/g, "''")}'
}`;
  const r = await runPSElevated(expr);
  if (!r.success) {
    return { ...r, hint: r.error === 'ELEVATION_DENIED' ? 'elevation' : 'share_failed' };
  }
  return { success: true, data: r.data };
}

async function unsharePrinter(printerName) {
  if (!printerName) return { success: false, error: 'PRINTER_NOT_SPECIFIED' };
  const expr = `Set-Printer -Name '${printerName.replace(/'/g, "''")}' -Shared $false
[pscustomobject]@{ unshared = $true; name = '${printerName.replace(/'/g, "''")}' }`;
  const r = await runPSElevated(expr);
  if (!r.success) return r;
  return { success: true, data: r.data };
}

// ---- Browse a remote server's shared printers (no elevation) -------------------
// Primary path is the print-spooler RPC (Get-Printer -ComputerName). If that
// fails we give a clear, actionable hint instead of a raw exception.
async function browseServerPrinters(host) {
  const h = String(host || '').trim();
  if (!h) return { success: false, error: 'HOST_REQUIRED' };
  const r = await runPS(
    `@(Get-Printer -ComputerName '${h.replace(/'/g, "''")}' -ErrorAction Stop | ForEach-Object {
      [pscustomobject]@{
        name       = $_.Name
        shareName  = $_.ShareName
        shared     = [bool]$_.Shared
        driverName = $_.DriverName
        portName   = $_.PortName
        unc        = '\\\\${h.replace(/'/g, "''")}\\' + $_.ShareName
      }
    })`,
    35000
  );
  if (!r.success) {
    const msg = (r.error || '').toLowerCase();
    // 0x0000070A/5 (RPC) etc: the remote spooler refused access.
    return {
      success: false,
      error: r.error,
      hint: /0x00000005|0x0000070a|access is denied|accessdenied/i.test(msg)
        ? 'access_denied'
        : /0x0000007b|not found|reached/i.test(msg)
          ? 'host_unreachable'
          : 'spooler',
    };
  }
  const list = (Array.isArray(r.data) ? r.data : []).filter((p) => p.shared);
  return {
    success: true,
    data: list.map((p) => ({
      name: p.name,
      shareName: p.shareName || '',
      driverName: p.driverName || '',
      portName: p.portName || '',
      unc: p.unc || '\\\\' + h + '\\' + (p.shareName || ''),
    })),
  };
}

// ---- Driver installation (elevated; local INF or copied from a share) -----------

async function installDriver(infPath) {
  if (!infPath) return { success: false, error: 'INF_REQUIRED' };
  const inf = String(infPath).replace(/'/g, "''");
  const expr =
    `if (-not (Test-Path -LiteralPath '${inf}')) { throw 'INF_NOT_FOUND' }
$out = pnputil /add-driver '${inf}' /install 2>&1 | Out-String
[pscustomobject]@{ output = ($out -replace '\\r?\\n', ' | ').Trim() }`;
  const r = await runPSElevated(expr, 90000);
  if (!r.success) {
    if (r.needsPermission) return r;
    return { success: false, error: (r.data && r.data.output) || r.error || 'DRIVER_INSTALL_FAILED' };
  }
  return { success: true, data: r.data };
}

// Copy a whole printer-driver folder from a UNC share to temp, then stage every
// INF found (pnputil /add-driver). Deals with multi-file driver packages.
async function installDriverFromShare(uncFolder) {
  const folder = String(uncFolder || '').trim().replace(/[/\\]+$/, '');
  if (!folder || !/^\\\\/.test(folder)) return { success: false, error: 'SHARE_REQUIRED' };
  const dest = path.join(os.tmpdir(), 'zmt-printer-drvs');
  const copyExpr =
    `$dest = '${dest.replace(/'/g, "''")}'
$src = '${folder.replace(/'/g, "''")}'
if (-not (Test-Path -LiteralPath $src)) { throw 'SHARE_UNREACHABLE' }
if (Test-Path -LiteralPath $dest) { Remove-Item -Recurse -Force -LiteralPath $dest }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Path (Join-Path $src '*') -Destination $dest -Recurse -Force
@(Get-ChildItem -LiteralPath $dest -Recurse -Filter *.inf | Select-Object -ExpandProperty FullName)`;
  const copy = await runPS(copyExpr, 60000);
  if (!copy.success) return { success: false, ...copy };
  const infs = (Array.isArray(copy.data) ? copy.data : []).map((f) => String(f));
  if (!infs.length) return { success: false, error: 'NO_DRIVER_INF' };

  const quoted = infs.map((f) => "'" + f.replace(/'/g, "''") + "'").join(', ');
  const expr =
    `$infs = @(${quoted})
$log = foreach ($inf in $infs) {
  (pnputil /add-driver $inf /install 2>&1 | Out-String) -replace '\\r?\\n', ' | '
}
[pscustomobject]@{ infs = $infs; output = ($log -join ' ;; ').Trim(); count = $infs.Count }`;
  const r = await runPSElevated(expr, 120000);
  if (!r.success) {
    if (r.needsPermission) return r;
    return { success: false, error: (r.data && r.data.output) || r.error || 'DRIVER_INSTALL_FAILED' };
  }
  try { fs.rmSync(dest, { recursive: true, force: true }); } catch (e) {}
  return { success: true, data: r.data };
}

// ---- Connect a network printer + set it as the system default (no elevation) ----

// Register the server as a trusted point-and-print host and add the connection.
// Driver presence is checked by the caller (listLocalDrivers) so the elevated
// driver staging already happened when needed.
async function connectNetworkPrinter(unc) {
  const u = String(unc || '').trim();
  if (!/^\\\\/.test(u)) return { success: false, error: 'UNC_REQUIRED' };
  const expr =
    `$unc = '${u.replace(/'/g, "''")}'
$net = New-Object -ComObject WScript.Network
$net.AddWindowsPrinterConnection($unc)
Start-Sleep -Milliseconds 500
$name = (Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.PortName -like '*${u.replace(/'/g, "''")}*' -or $_.Name -eq $unc } | Select-Object -First 1).Name
if (-not $name) { $name = $unc }
[pscustomobject]@{ connected = $true; name = $name }`;
  const r = await runPS(expr, 60000);
  if (!r.success) {
    const msg = (r.error || '').toLowerCase();
    return {
      success: false,
      error: r.error,
      hint: /0x000006e5|0x00000005|driver|nightmare|0x0000007b|0x00000709|0x0000011b/i.test(msg)
        ? 'driver_or_nightmare'
        : 'connect_failed',
    };
  }
  return { success: true, data: r.data };
}

async function setDefaultPrinter(name) {
  const n = String(name || '').trim();
  if (!n) return { success: false, error: 'PRINTER_NOT_SPECIFIED' };
  const expr =
    `$name = '${n.replace(/'/g, "''")}'
$net = New-Object -ComObject WScript.Network
$net.SetDefaultPrinter($name)
Start-Sleep -Milliseconds 400
[pscustomobject]@{
  default = (Get-CimInstance Win32_Printer -Filter 'Default=$true' -ErrorAction SilentlyContinue).Name
}`;
  const r = await runPS(expr);
  if (!r.success) return { success: false, error: r.error };
  const cur = r.data && r.data.default ? String(r.data.default).trim() : '';
  return { success: true, data: { default: cur, ok: cur === n } };
}

// ---- PrintNightmare / 0x0000011b / 0x00000709 fix (elevated) --------------------
// Disable RPC auth-level privacy (the widely used fix for 0x0000011b after
// Windows updates), whitelist point-and-print trust so connecting to the LAN
// printer does not throw the "trust this printer" prompt, then bounce the
// spooler so everything takes effect.
async function fixPrintNightmare(trustedHost) {
  const host = String(trustedHost || '').trim().replace(/'/g, "''");
  const serversImplant = host
    ? `New-ItemProperty -Path $pp -Name 'ServerList' -PropertyType MultiString -Value @('${host}', '$env:COMPUTERNAME') -Force | Out-Null
`
    : '';
  const expr =
    `$print  = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print'
$pp     = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Print\\PointAndPrint'
if (-not (Test-Path $pp)) { New-Item -Path $pp -Force | Out-Null }
New-ItemProperty -Path $print -Name 'RpcAuthnLevelPrivacyEnabled' -Value 0 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $pp -Name 'NoWarningNoElevationOnInstall' -Value 0 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $pp -Name 'Restricted' -Value 0 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $pp -Name 'UpdatePromptSettings' -Value 0 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $pp -Name 'InForest' -Value 1 -PropertyType DWord -Force | Out-Null
${serversImplant}Restart-Service Spooler -Force
[pscustomobject]@{
  applied = (Get-ItemProperty $print).RpcAuthnLevelPrivacyEnabled
  spooler = (Get-Service Spooler).Status
}`;
  const r = await runPSElevated(expr, 60000);
  if (!r.success) return r;
  return { success: true, data: r.data };
}

// ============================================================================
// CASH DRAWER («درج النقود»)
// ----------------------------------------------------------------------------
// A cash drawer is a dumb mechanical box wired to the RJ11 kick port of a
// thermal printer: it opens only when the printer receives the ESC/POS pulse
// (ESC p m t1 t2). Two consequences drive everything below:
//   * the pulse must be RAW bytes — webContents.print() sends a rasterised page,
//     so it can never open a drawer; and
//   * if the printer has no ESC/POS kick support, NO software can open it.
// We therefore speak to the drawer over several transports, all through the same
// PowerShell 5.1 layer the LAN printer module already uses (no native modules,
// so the Electron 22 / Windows 7 build is untouched):
//   - COM     : [IO.Ports.SerialPort]
//   - LAN     : [Net.Sockets.TcpClient] to a JetDirect-style IP:9100
//   - RAW-USB : [IO.File]::Open('\\.\USB00x') — best-effort, bypasses the spooler
//   - RAW-COM : [IO.File]::Open('\\.\COMx')   — when another app holds the port
//   - WIN     : the printer's own port, resolved from Win32_Printer
// Stored per device in userData/cash-drawer.json (see main.js).
// ============================================================================

// Default ESC/POS kick command, plus the variants that real printers accept.
// Some models ignore m/t1/t2 differences, others need the init first, and a few
// only react on the pin-5 (ring/bell) line — so we try them in order and keep
// whichever one the shop's hardware actually answered to.
const DRAWER_PULSES = [
  { id: 'kick-a', label: 'ESC p 0 25 250', hex: '1B 70 00 19 FA' },
  { id: 'kick-b', label: 'ESC p 0 25 0', hex: '1B 70 00 19 00' },
  { id: 'kick-c', label: 'ESC p 1 25 250', hex: '1B 70 01 19 FA' },
  { id: 'init-kick', label: 'ESC @ + kick', hex: '1B 40 1B 70 00 19 FA' },
  { id: 'bell', label: 'Bell (pin 5 line)', hex: '07 1B 70 00 19 FA' },
];

function drawerDefaults() {
  return {
    enabled: false,           // open the drawer automatically after each sale
    transport: 'auto',        // auto | com | net | win
    comPort: '',              // e.g. COM3
    baudRate: 9600,
    host: '',                 // e.g. 192.168.1.50
    port: 9100,
    printerName: '',          // Windows printer whose port carries the drawer
    rawUsbPort: '',           // USB001/USB002 — reached as \\.\USB002 (best effort)
    pulseId: 'kick-a',
    customHex: '',            // when set, overrides pulseId
    timeoutMs: 4000,
    lastGood: null,           // { transport, pulseId, hex, at } — fastest path
    fallbackPrint: false,     // last-resort: print a kick page through the driver
  };
}

// Accept "1B 70 00 19 FA", "1b700019fa" or "1B,70,00,19,FA" alike.
function parseHexBytes(hex) {
  const clean = String(hex || '').replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  if (!clean || clean.length % 2 !== 0) return null;
  const out = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out.every((b) => Number.isFinite(b)) ? out : null;
}

// PowerShell literal for a byte array; keep it tiny so it survives EncodedCommand.
function psBytes(bytes) {
  return '@(' + bytes.map((b) => String(b)).join(',') + ')';
}

// Resolve the pulse the user configured (custom hex wins over the preset).
function resolvePulse(cfg) {
  const custom = parseHexBytes(cfg && cfg.customHex);
  if (custom && custom.length) return { id: 'custom', label: 'custom', bytes: custom, hex: custom.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') };
  const want = String((cfg && cfg.pulseId) || 'kick-a');
  const found = DRAWER_PULSES.find((p) => p.id === want) || DRAWER_PULSES[0];
  return { id: found.id, label: found.label, bytes: parseHexBytes(found.hex), hex: found.hex };
}

// ---- PowerShell version probe (Windows 7 may ship 2.0, which lacks Get-Printer) ----
let _psInfo = null;
async function detectPowerShell() {
  if (_psInfo) return _psInfo;
  // Resolve the real executable rather than trusting PATH: on a few locked-down
  // Win7 images the PATH entry is missing even though the shell is installed.
  // NOTE: runPS wraps the expression in "( ... )" and pipes it to ConvertTo-Json,
  // so it must be ONE pipeline — no leading assignments (they break the grouping).
  const r = await runPS(
    `[pscustomobject]@{
  version       = $PSVersionTable.PSVersion.Major
  exe           = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
  hasGetPrinter = [bool](Get-Command Get-Printer -ErrorAction SilentlyContinue)
  exeFallback   = [bool](Test-Path -LiteralPath (Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'))
}`,
    20000
  );
  const d = (r && r.success && r.data) ? r.data : {};
  _psInfo = {
    success: !!(r && r.success),
    version: parseInt(d.version, 10) || 2,
    exe: d.exe || '',
    hasGetPrinter: !!d.hasGetPrinter,
    // Win32_Printer is the WMI fallback that works on PowerShell 2.0 as well.
    useWmi: !d.hasGetPrinter,
  };
  return _psInfo;
}

// ---- Scan: enumerate every target a drawer could hang off -------------------
async function scanDrawerTargets() {
  const ps = await detectPowerShell();

  // Serial ports (drawer wired straight to COM, or through a USB→Serial adapter).
  const comExpr = `@(Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | ForEach-Object {
    [pscustomobject]@{
      port        = $_.DeviceID
      description = $_.Description
      name        = $_.Name
      pnpId       = $_.PNPDeviceID
    }
  })`;

  // Printers + their ports. Prefer Get-Printer (Win8+/WMF3+); fall back to WMI
  // so a bare Windows 7 with PowerShell 2.0 still returns a usable list.
  const printerExpr = ps.useWmi
    ? `@(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | ForEach-Object {
        [pscustomobject]@{
          name        = $_.Name
          portName    = $_.PortName
          driverName  = $_.DriverName
          isDefault   = [bool]$_.Default
          shared      = [bool]$_.Shared
          printerStatus = $_.PrinterStatus
        }
      })`
    : `@(Get-Printer -ErrorAction SilentlyContinue | ForEach-Object {
        [pscustomobject]@{
          name        = $_.Name
          portName    = $_.PortName
          driverName  = $_.DriverName
          isDefault   = [bool]$_.Default
          shared      = [bool]$_.Shared
          printerStatus = 3
        }
      })`;

  const [comRes, prnRes] = await Promise.all([
    runPS(comExpr, 25000),
    runPS(printerExpr, 25000),
  ]);

  const comList = (comRes && comRes.success && Array.isArray(comRes.data)) ? comRes.data : [];
  const prnList = (prnRes && prnRes.success && Array.isArray(prnRes.data)) ? prnRes.data : [];
  if (prnList.length === 0 && prnRes && prnRes.data && !Array.isArray(prnRes.data)) {
    prnList.push(prnRes.data);
  }

  // Thermal / POS printer names worth trusting for ESC/POS kick support.
  const THERMAL_RE = /epson|tm-|xprinter|xp-|rongta|goojprt|bixolon|star |citizen|pos-?80|pos-?58|thermal|receipt|zebra|gprinter|hoin|snbc|munbyn|beeprt|hprt|aisino|sewoo|seri(es)? ?80/i;
  // Ports that carry raw ESC/POS: real serial or a TCP address.
  const RAW_PORT_RE = /^(COM\d+|\\\\|\\\\[^\\]+\\)/i;
  const USB_PORT_RE = /^USB\d{3}$/i;   // spooler's virtual USB port — not raw-sendable
  const VIRTUAL_PORT_RE = /^(PORTPROMPT|FILE|NUL|SHRFAX|Microsoft)/i;

  const targets = [];

  comList.forEach((c) => {
    const port = String(c.port || '').trim();
    if (!port) return;
    const desc = c.description ? ' — ' + c.description : (c.name ? ' — ' + c.name : '');
    targets.push({
      kind: 'com',
      id: 'com:' + port,
      label: port + desc,
      port,
      escpos: 'unknown',
      note: 'منفذ تسلسلي: يمكن إرسال النبضة الخام مباشرة.',
      noteEn: 'Serial port: raw ESC/POS pulse can be sent directly.',
    });
    // Same port, reached as a raw device file — the fallback when another
    // program already holds the serial port open.
    targets.push({
      kind: 'raw-com',
      id: 'raw-com:' + port,
      label: port + desc + '  [كتابة خام]',
      port,
      comPort: port,
      escpos: 'maybe',
      note: 'بديل خام عبر \\\\.\\' + port + ': يمرّ حتى لو كان المنفذ مشغولًا ببرنامج آخر.',
      noteEn: 'Raw fallback via \\\\.\\' + port + ': works even when the port is held open.',
    });
  });

  prnList.forEach((p) => {
    const name = String(p.name || '').trim();
    if (!name) return;
    if (_PSEUDO_RE.test(name)) return;              // PDF/XPS/Fax — never a drawer
    const port = String(p.portName || '').trim();
    const looksThermal = THERMAL_RE.test(name) || THERMAL_RE.test(String(p.driverName || ''));
    const isVirtual = VIRTUAL_PORT_RE.test(port);
    const isUsbVirtual = USB_PORT_RE.test(port);
    const isRaw = RAW_PORT_RE.test(port) && !isUsbVirtual;

    let escpos = 'unknown';
    let note;
    if (isVirtual) {
      escpos = 'no';
      note = 'منفذ افتراضي (لا يقبل بايتات خام) — لن تُفتح النبضة عبره.';
    } else if (isUsbVirtual) {
      // The single most common real-world blocker: the printer is online and
      // prints fine, but Windows owns USB001 so we cannot inject raw bytes.
      escpos = looksThermal ? 'maybe' : 'unknown';
      note = 'منفذ USB افتراضي: قد لا يقبل النبضة الخام. جرّب COM أو الشبكة إن فشل.';
    } else if (isRaw) {
      escpos = looksThermal ? 'yes' : 'maybe';
      note = 'منفذ خام: يمكن إرسال النبضة مباشرة.';
    } else {
      escpos = looksThermal ? 'maybe' : 'unknown';
      note = looksThermal ? 'طابعة حرارية معروفة — يُرجّح دعم النبضة.' : 'غير معروف — جرّب الاختبار.';
    }
    targets.push({
      kind: 'win',
      id: 'win:' + name,
      label: name + (port ? '  [' + port + ']' : '') + (p.isDefault ? '  ⭐' : ''),
      printerName: name,
      port,
      driverName: String(p.driverName || ''),
      isDefault: !!p.isDefault,
      looksThermal,
      escpos,
      note,
    });

    // A virtual USB spooler port cannot take raw bytes through the spooler, but
    // it can sometimes be opened as a raw device file. Offer that as a distinct,
    // explicitly best-effort target so the shopkeeper can try it on demand.
    if (isUsbVirtual && looksThermal) {
      targets.push({
        kind: 'raw-usb',
        id: 'raw-usb:' + port,
        label: name + '  —  ' + port + '  [كتابة خام]',
        rawUsbPort: port,
        printerName: name,
        escpos: 'maybe',
        note: 'منفذ USB افتراضي: يجري إرسال خام عبر \\\\.\\' + port + ' — قد ينجح أو يفشل حسب الطابعة والمشغّل.',
        noteEn: 'Virtual USB port: raw send via \\\\.\\' + port + ' — may or may not work.',
      });
    }
  });

  return {
    success: true,
    data: {
      targets,
      comCount: comList.length,
      printerCount: prnList.length,
      powerShell: ps,
      pulsePresets: DRAWER_PULSES.map((p) => ({ id: p.id, label: p.label, hex: p.hex })),
    },
  };
}

// ---- Transport runners ------------------------------------------------------
// Each returns { success, error? } and is deliberately self-contained so a
// failure on one transport never poisons the next attempt.

function drawerComExpr(port, baud, bytes, timeoutMs) {
  const p = String(port).replace(/'/g, "''");
  return `$sp = New-Object System.IO.Ports.SerialPort
$sp.PortName    = '${p}'
$sp.BaudRate    = ${parseInt(baud, 10) || 9600}
$sp.Parity      = 'None'
$sp.DataBits    = 8
$sp.StopBits    = 'One'
$sp.Handshake   = 'None'
$sp.WriteTimeout = ${Math.max(500, parseInt(timeoutMs, 10) || 4000)}
$sp.ReadTimeout  = 500
$sp.Open()
try {
  $sp.Write(${psBytes(bytes)}, 0, ${bytes.length})
  $sp.BaseStream.Flush()
  Start-Sleep -Milliseconds 250
} finally { $sp.Close(); $sp.Dispose() }
[pscustomobject]@{ sent = ${bytes.length}; transport = 'com'; port = '${p}' }`;
}

function drawerNetExpr(host, port, bytes, timeoutMs) {
  const h = String(host).replace(/'/g, "''");
  const ms = Math.max(500, parseInt(timeoutMs, 10) || 4000);
  return `$client = New-Object System.Net.Sockets.TcpClient
$iar = $client.BeginConnect('${h}', ${parseInt(port, 10) || 9100}, $null, $null)
if (-not $iar.AsyncWaitHandle.WaitOne(${ms})) { $client.Close(); throw 'CONNECT_TIMEOUT' }
$client.EndConnect($iar)
$stream = $client.GetStream()
$stream.Write(${psBytes(bytes)}, 0, ${bytes.length})
$stream.Flush()
Start-Sleep -Milliseconds 250
$stream.Close(); $client.Close()
[pscustomobject]@{ sent = ${bytes.length}; transport = 'net'; host = '${h}' }`;
}

// A Windows printer is reached through whatever its port really is. A virtual
// spooler port (USB001/PORTPROMPT) cannot take raw bytes, so we say so plainly
// instead of reporting a misleading failure.
function drawerWinExpr(printerName, bytes) {
  const n = String(printerName).replace(/'/g, "''");
  return `$prn = Get-CimInstance Win32_Printer -Filter "Name='${n}'" -ErrorAction SilentlyContinue
if (-not $prn) { throw 'PRINTER_NOT_FOUND' }
$port = [string]$prn.PortName
if ($port -match '^COM\\d+$') {
  $sp = New-Object System.IO.Ports.SerialPort
  $sp.PortName = $port; $sp.BaudRate = 9600; $sp.Parity = 'None'
  $sp.DataBits = 8; $sp.StopBits = 'One'; $sp.Handshake = 'None'
  $sp.WriteTimeout = 4000
  $sp.Open()
  try { $sp.Write(${psBytes(bytes)}, 0, ${bytes.length}); $sp.BaseStream.Flush(); Start-Sleep -Milliseconds 250 }
  finally { $sp.Close(); $sp.Dispose() }
  [pscustomobject]@{ sent = ${bytes.length}; transport = 'win-com'; port = $port }
} elseif ($port -match '^(USB\\d+|PORTPROMPT|FILE|NUL|SHRFAX|Microsoft)' -or $port -eq '') {
  throw "VIRTUAL_PORT:$port"
} else {
  throw "UNSUPPORTED_PORT:$port"
}`;
}

// A raw device-file write: open the port as a file and push the bytes straight
// through it, bypassing the spooler *and* the SerialPort class.
//   [IO.File]::Open('\\.\USB002','Open','Write')   ← virtual USB printer port
//   [IO.File]::Open('\\.\COM3','Open','Write')     ← COM held open by another app
// It is the only software route that could ever reach a USB00x virtual port, but
// it is best-effort by nature: many Windows builds (and drivers) refuse to share
// the device node, so a failure here is expected and never fatal. FileShare is
// set to ReadWrite so we ask for sharing rather than demanding exclusive access.
function drawerRawExpr(devicePath, bytes) {
  // Escape for a single-quoted PowerShell literal: backslashes are literal there,
  // only the quote itself doubles. The path already looks like \\.\USB002.
  const p = String(devicePath).replace(/'/g, "''");
  return `$fs = [System.IO.File]::Open('${p}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
try {
  $fs.Write(${psBytes(bytes)}, 0, ${bytes.length})
  $fs.Flush()
  Start-Sleep -Milliseconds 250
} finally { $fs.Close(); $fs.Dispose() }
[pscustomobject]@{ sent = ${bytes.length}; transport = 'raw'; device = '${p}' }`;
}

// Turn a raw PowerShell/exception string into an Arabic, actionable reason.
function drawerErrorReason(rawError, ctx) {
  const m = String(rawError || '');
  if (/VIRTUAL_PORT/i.test(m)) {
    const p = (m.split('VIRTUAL_PORT:')[1] || '').trim();
    return {
      code: 'virtual_port',
      ar: 'المنفذ «' + (p || 'افتراضي') + '» منفذ ويندوز افتراضي ولا يقبل بايتات خام. ' +
          'إن كان الدرج على COM أو الشبكة فاختره من قائمة المسح، وإلا فطابعتك لا تدعم الفتح البرمجي ' +
          '(استعمل المفتاح المعدني أو استبدلها بطابعة ESC/POS).',
    };
  }
  if (/UNSUPPORTED_PORT/i.test(m)) {
    const p = (m.split('UNSUPPORTED_PORT:')[1] || '').trim();
    return { code: 'unsupported_port', ar: 'منفذ غير مدعوم للنقل الخام: «' + (p || '?') + '». اختر منفذ COM أو عنوان IP من قائمة المسح.' };
  }
  if (/CONNECT_TIMEOUT|timed out|timeout/i.test(m) && ctx && ctx.transport === 'net') {
    return { code: 'net_timeout', ar: 'لم يستجب الجهاز على ' + (ctx.host || '') + ':' + (ctx.port || '') + ' خلال المهلة. تأكد أن الطابعة على الشبكة وأن المنفذ 9100 مفتوح.' };
  }
  if (/PRINTER_NOT_FOUND/i.test(m)) return { code: 'not_found', ar: 'لم يُعثر على الطابعة المحددة. أعد المسح واختر من جديد.' };
  // The best-effort raw device write: a refusal here is normal, not a bug.
  if (/^raw/i.test(String((ctx && ctx.transport) || '')) && /denied|0x00000005|استعمل|being used|sharing|not available/i.test(m)) {
    return { code: 'raw_denied',
      ar: 'مشغّل الطباعة يحتفظ بالمنفذ «' + ((ctx && ctx.device) || '') + '» ولا يسمح بالكتابة الخام. ' +
          'هذا متوقَّع على كثير من نسخ ويندوز. إن أمكن وصّل الطابعة على COM أو الشبكة، أو استعمل المفتاح المعدني للدرج.' };
  }
  if (/Access.*denied|0x00000005|غير مسموح/i.test(m)) return { code: 'denied', ar: 'الوصول مرفوض: المنفذ مستعمل من برنامج آخر أو يحتاج صلاحية. أغلق البرامج التي تستعمل المنفذ وحاول مجددًا.' };
  if (/does not exist|cannot find|not found/i.test(m)) return { code: 'no_port', ar: 'المنفذ غير موجود. وصّل الجهاز ثم أعد المسح.' };
  return { code: 'failed', ar: 'فشل الإرسال: ' + (m || 'سبب غير معروف') };
}

// Send `bytes` over the chosen transport. Never throws.
async function sendDrawerBytes(cfg, bytes, transportHint) {
  const transport = transportHint || (cfg && cfg.transport) || 'auto';
  const timeoutMs = Math.max(500, parseInt((cfg && cfg.timeoutMs) || 4000, 10));

  if (transport === 'com') {
    const port = String((cfg && cfg.comPort) || '').trim();
    if (!port) return { success: false, error: 'NO_COM_PORT', errorAr: 'لم تُحدَّد أي منفذ COM.' };
    const r = await runPSBlock(drawerComExpr(port, cfg && cfg.baudRate, bytes, timeoutMs), timeoutMs + 8000);
    if (!r.success) return { success: false, error: r.error, errorAr: drawerErrorReason(r.error, { transport: 'com', port }).ar };
    return { success: true, data: r.data, transport: 'com' };
  }

  if (transport === 'net') {
    const host = String((cfg && cfg.host) || '').trim();
    const port = parseInt((cfg && cfg.port) || 9100, 10) || 9100;
    if (!host) return { success: false, error: 'NO_HOST', errorAr: 'لم يُحدَّد أي عنوان IP.' };
    const r = await runPSBlock(drawerNetExpr(host, port, bytes, timeoutMs), timeoutMs + 8000);
    if (!r.success) return { success: false, error: r.error, errorAr: drawerErrorReason(r.error, { transport: 'net', host, port }).ar };
    return { success: true, data: r.data, transport: 'net' };
  }

  if (transport === 'win') {
    const name = String((cfg && cfg.printerName) || '').trim();
    if (!name) return { success: false, error: 'NO_PRINTER', errorAr: 'لم تُحدَّد أي طابعة.' };
    const r = await runPSBlock(drawerWinExpr(name, bytes), timeoutMs + 8000);
    if (!r.success) return { success: false, error: r.error, errorAr: drawerErrorReason(r.error, { transport: 'win', printerName: name }).ar };
    return { success: true, data: r.data, transport: 'win' };
  }

  // Raw device-file write — best effort, bypasses the spooler entirely.
  //   raw-usb : \\.\USB00x  (a virtual spooler port: the only hope for a drawer
  //             wired to a USB printer whose port Windows owns)
  //   raw-com : \\.\COMx    (a COM port another program currently holds open)
  if (transport === 'raw-usb' || transport === 'raw-com') {
    const dev = transport === 'raw-usb'
      ? String((cfg && cfg.rawUsbPort) || '').trim()
      : String((cfg && cfg.comPort) || '').trim();
    if (!dev) {
      return {
        success: false,
        error: transport === 'raw-usb' ? 'NO_RAW_USB' : 'NO_COM_PORT',
        errorAr: transport === 'raw-usb' ? 'لم يُحدَّد أي منفذ USB خام.' : 'لم تُحدَّد أي منفذ COM.',
      };
    }
    const devicePath = '\\\\.\\' + dev;
    const r = await runPSBlock(drawerRawExpr(devicePath, bytes), timeoutMs + 8000);
    if (!r.success) {
      return {
        success: false,
        error: r.error,
        errorAr: drawerErrorReason(r.error, { transport, device: dev }).ar,
      };
    }
    return { success: true, data: r.data, transport };
  }

  // auto: try the recorded good path, then every configured transport in turn.
  const order = [];
  if (cfg && cfg.lastGood && cfg.lastGood.transport) order.push(cfg.lastGood.transport);
  ['com', 'net', 'raw-usb', 'raw-com', 'win'].forEach((t) => { if (order.indexOf(t) === -1) order.push(t); });
  const usable = order.filter((t) => {
    if (t === 'com') return !!String((cfg && cfg.comPort) || '').trim();
    if (t === 'net') return !!String((cfg && cfg.host) || '').trim();
    if (t === 'win') return !!String((cfg && cfg.printerName) || '').trim();
    if (t === 'raw-usb') return !!String((cfg && cfg.rawUsbPort) || '').trim();
    if (t === 'raw-com') return !!String((cfg && cfg.comPort) || '').trim();
    return false;
  });
  if (!usable.length) {
    return { success: false, error: 'NO_TARGET', errorAr: 'لم يُحدَّد أي هدف. امسح الأجهزة ثم اختر المنفذ أو الطابعة.' };
  }
  let lastErr = null;
  for (const t of usable) {
    // eslint-disable-next-line no-await-in-loop
    const r = await sendDrawerBytes(cfg, bytes, t);
    if (r.success) return r;
    lastErr = r;
  }
  return lastErr || { success: false, error: 'FAILED', errorAr: 'فشلت كل المسارات المتاحة.' };
}

// ---- Test: walk the pulse list until the drawer answers ---------------------
// Every transport is silent on success AND on failure (a kick port sends no
// reply), so "the drawer opened" is ultimately confirmed by the shopkeeper.
// We report the first pulse that the hardware accepted without error and store
// it as lastGood so the sales path never has to guess again.
async function testDrawer(cfg) {
  const conf = Object.assign(drawerDefaults(), cfg || {});
  const ps = await detectPowerShell();
  const presets = parseHexBytes(conf.customHex) && conf.customHex
    ? [{ id: 'custom', label: 'custom', bytes: parseHexBytes(conf.customHex) }]
    : DRAWER_PULSES.map((p) => ({ id: p.id, label: p.label, bytes: parseHexBytes(p.hex) }));

  const attempts = [];
  for (const pulse of presets) {
    if (!pulse.bytes || !pulse.bytes.length) continue;
    // eslint-disable-next-line no-await-in-loop
    const started = Date.now();
    const r = await sendDrawerBytes(conf, pulse.bytes);
    const elapsed = Date.now() - started;
    attempts.push({
      pulseId: pulse.id,
      pulseLabel: pulse.label,
      transport: r.transport || conf.transport,
      ok: !!r.success,
      elapsedMs: elapsed,
      error: r.success ? null : (r.error || 'FAILED'),
      errorAr: r.success ? null : (r.errorAr || ''),
    });
    if (r.success) {
      return {
        success: true,
        data: {
          opened: true,
          pulseId: pulse.id,
          hex: pulse.id === 'custom'
            ? String(conf.customHex || '')
            : ((DRAWER_PULSES.find((x) => x.id === pulse.id) || {}).hex || ''),
          transport: r.transport,
          elapsedMs: elapsed,
          attempts,
          powerShell: ps,
          virtualPort: /USB\d+/i.test(String(conf.comPort || '')),
        },
      };
    }
    // Some failures are identical for every pulse, so stop early instead of
    // hammering the hardware: a virtual/unsupported Windows port, a missing
    // printer, or an unreachable network host all fail the same way each time.
    // A raw device-file refusal is deliberately NOT in this list: it may succeed
    // for a different port/pulse, so we let the loop continue.
    if (/virtual_port|unsupported_port|no_port|not_found|connect_timeout|net_timeout/i.test(String(r.error || '')) &&
        !/^raw/i.test(String(r.transport || ''))) {
      return { success: false, data: { opened: false, attempts, powerShell: ps }, error: r.error, errorAr: r.errorAr };
    }
  }
  const firstErr = attempts.find((a) => !a.ok);
  return {
    success: false,
    data: { opened: false, attempts, powerShell: ps },
    error: firstErr ? firstErr.error : 'FAILED',
    errorAr: firstErr ? firstErr.errorAr : 'لم ينجح أي أمر في فتح الدرج — طابعتك قد لا تدعم الفتح البرمجي.',
  };
}

// ---- Open: the fast path used by the sale confirm + F12 ---------------------
// Uses the recorded lastGood pulse when available (one shot, no probing), and
// only falls back to the full test when nothing has been proven yet.
async function openDrawer(cfg) {
  const conf = Object.assign(drawerDefaults(), cfg || {});
  let bytes = null;
  let pulseId = conf.pulseId;
  let hex = '';

  if (conf.lastGood && conf.lastGood.hex) {
    bytes = parseHexBytes(conf.lastGood.hex);
    pulseId = conf.lastGood.pulseId || pulseId;
    hex = conf.lastGood.hex;
  }
  if (!bytes || !bytes.length) {
    const pulse = resolvePulse(conf);
    bytes = pulse.bytes;
    pulseId = pulse.id;
    hex = pulse.hex;
  }
  if (!bytes || !bytes.length) return { success: false, error: 'NO_PULSE', errorAr: 'لا يوجد أمر فتح صالح.' };

  const started = Date.now();
  const r = await sendDrawerBytes(conf, bytes);
  return Object.assign({}, r, {
    pulseId,
    hex,
    elapsedMs: Date.now() - started,
  });
}

module.exports = {
  listLocalPrinters,
  listLocalDrivers,
  getDefaultPrinter,
  getComputerName,
  restartSpooler,
  sharePrinter,
  unsharePrinter,
  browseServerPrinters,
  installDriver,
  installDriverFromShare,
  connectNetworkPrinter,
  setDefaultPrinter,
  fixPrintNightmare,
  // Cash drawer
  DRAWER_PULSES,
  drawerDefaults,
  parseHexBytes,
  detectPowerShell,
  scanDrawerTargets,
  testDrawer,
  openDrawer,
  drawerRawExpr,
};