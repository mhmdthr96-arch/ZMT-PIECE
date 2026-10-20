'use strict';
// ============================================================================
// ZMT PIECE — LOCAL PHONE SCANNER CERTIFICATE ENGINE (pure JavaScript)
// ============================================================================
// Generates the local CA + server certificate used by the phone scanner's
// HTTPS/WSS server WITHOUT PowerShell.
//
// Why: the previous implementation relied on `New-SelfSignedCertificate -Type
// Custom`, which does not exist on Windows 7 and can be blocked by execution
// policy / antivirus on newer Windows -> the service failed to start and the
// QR code never appeared.
//
// This module uses only Node's built-in crypto (fast RSA keygen) plus
// node-forge (X.509 signing + PKCS#12 export), so it works on every Windows
// version the app supports, with no admin rights and no external tools.
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');

const CERT_CN = 'ZMT-PHONE-CA';
const CERT_ORG = 'ZMT SOFTWARE';

// Virtual / non-LAN adapter name patterns (deprioritized for the QR address).
const VIRTUAL_RE = /(vethernet|vmware|virtualbox|hyper-?v|loopback|wsl|tailscale|zerotier|wireguard|npcap|docker|bluetooth|\btap\b|\btun\b|vpn)/i;

function certFiles(dir) {
  return {
    meta: path.join(dir, 'phone-scanner-meta.json'),
    pfx: path.join(dir, 'phone-server.pfx'),
    pfxPass: path.join(dir, 'phone-server-pass.txt'),
    ca: path.join(dir, 'phone-ca.crt'),
    caKey: path.join(dir, 'phone-ca-key.pem'),
  };
}

// Returns [{ name, ip, virtual }] for every usable local IPv4, real LAN cards
// first. Loopback and APIPA (169.254.x) are dropped entirely.
function getIpDetails() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const ip = iface.address;
      if (!ip || ip.startsWith('169.254.')) continue;
      out.push({ name, ip, virtual: VIRTUAL_RE.test(name) });
    }
  }
  out.sort((a, b) => (a.virtual - b.virtual) || a.name.localeCompare(b.name) || a.ip.localeCompare(b.ip));
  // de-dupe identical addresses (some virtual stacks expose the same IP twice)
  const seen = new Set();
  return out.filter((x) => (seen.has(x.ip) ? false : (seen.add(x.ip), true)));
}

function getLocalIps() {
  return getIpDetails().map((x) => x.ip);
}

function genKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  return { privateKey, publicKey };
}

function randomSerial() {
  const b = crypto.randomBytes(16);
  b[0] = b[0] & 0x7f; // keep it positive
  return b.toString('hex');
}

function createCA(caKeys) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(caKeys.publicKey);
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
  const attrs = [
    { name: 'commonName', value: CERT_CN },
    { name: 'organizationName', value: CERT_ORG },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: true },
  ]);
  cert.sign(forge.pki.privateKeyFromPem(caKeys.privateKey), forge.md.sha256.create());
  return cert;
}

function createServer(srvKeys, caCert, caKeyPem, altNames) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(srvKeys.publicKey);
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
  cert.setSubject([
    { name: 'commonName', value: os.hostname() },
    { name: 'organizationName', value: CERT_ORG },
  ]);
  cert.setIssuer(caCert.subject.attributes);
  const san = altNames.map((a) => (a.ip ? { type: 7, ip: a.ip } : { type: 2, value: a.dns }));
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: san },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: caCert.generateSubjectKeyIdentifier().getBytes() },
  ]);
  cert.sign(forge.pki.privateKeyFromPem(caKeyPem), forge.md.sha256.create());
  return cert;
}

function toPfx(srvKeyPem, srvCert, caCert, pass) {
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    forge.pki.privateKeyFromPem(srvKeyPem),
    [srvCert, caCert],
    pass,
    { algorithm: '3des', generateLocalKeyId: true, friendlyName: os.hostname() }
  );
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

// Ensure the CA + server material exist and are valid for the current IP set.
// Returns { success, error?, pfx, pass, ips }.
function ensureCert(dir) {
  const c = certFiles(dir);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const ips = getLocalIps();

  // --- 1) CA (kept stable across runs so the phone only trusts it once) ---
  let caKeyPem = null;
  let caCert = null;
  try {
    if (fs.existsSync(c.caKey) && fs.existsSync(c.ca)) {
      caKeyPem = fs.readFileSync(c.caKey, 'utf8');
      caCert = forge.pki.certificateFromPem(fs.readFileSync(c.ca, 'utf8'));
      // regenerate if it expires within 30 days
      if (!caCert.validity || caCert.validity.notAfter.getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000) {
        caCert = null;
        caKeyPem = null;
      }
    }
  } catch (e) { caCert = null; caKeyPem = null; }

  let caRegenerated = false;
  if (!caCert) {
    const keys = genKeyPair();
    caCert = createCA(keys);
    caKeyPem = keys.privateKey;
    fs.writeFileSync(c.caKey, caKeyPem, 'utf8');
    fs.writeFileSync(c.ca, forge.pki.certificateToPem(caCert), 'utf8');
    caRegenerated = true;
  }

  // --- 2) reuse a cached server PFX when the IP set is unchanged ---
  if (!caRegenerated && fs.existsSync(c.pfx) && fs.existsSync(c.pfxPass) && fs.existsSync(c.meta)) {
    try {
      const meta = JSON.parse(fs.readFileSync(c.meta, 'utf8'));
      if (Array.isArray(meta.ips) && JSON.stringify(meta.ips) === JSON.stringify(ips)) {
        return {
          success: true,
          pfx: fs.readFileSync(c.pfx),
          pass: fs.readFileSync(c.pfxPass, 'utf8').trim(),
          ips,
        };
      }
    } catch (e) { /* fall through to regenerate */ }
  }

  // --- 3) (re)generate the server certificate for the current IP set ---
  try {
    const srvKeys = genKeyPair();
    const host = os.hostname();
    const altNames = [{ dns: host }].concat(ips.map((ip) => ({ ip })));
    const srvCert = createServer(srvKeys, caCert, caKeyPem, altNames);
    const pass = crypto.randomBytes(16).toString('hex');
    const pfx = toPfx(srvKeys.privateKey, srvCert, caCert, pass);
    fs.writeFileSync(c.pfx, pfx);
    fs.writeFileSync(c.pfxPass, pass, 'utf8');
    fs.writeFileSync(c.meta, JSON.stringify({ ips, generatedAt: new Date().toISOString() }), 'utf8');
    return { success: true, pfx, pass, ips };
  } catch (e) {
    return { success: false, error: 'CERT_GENERATION_FAILED: ' + (e && e.message ? e.message : String(e)) };
  }
}

module.exports = { ensureCert, getLocalIps, getIpDetails, certFiles, CERT_CN };
