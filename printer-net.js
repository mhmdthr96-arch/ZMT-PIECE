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

// Run PowerShell elevated via UAC: shows a consent prompt; the child writes a
// result file, we wait, then read it. A denied/cancelled prompt surfaces as a
// needsPermission flag instead of an exception so the UI can show a manual hint
// (mirrors lan-ensure-firewall).
function runPSElevated(expression, timeoutMs) {
  return new Promise((resolve) => {
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
};