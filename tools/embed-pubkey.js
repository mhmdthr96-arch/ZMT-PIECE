#!/usr/bin/env node
// ZMT PIECE — embeds the accepted PUBLIC key(s) of the phone license signer
// into license.js so the desktop app can verify phone-issued *.zmtlic files.
//
// The list is REPLACED with exactly the PEM files you pass (see rotation note
// below), so always pass the full set of keys you still trust:
//
//   node tools/embed-pubkey.js tools/keys/phone-key.pub.pem [another.pub.pem ...]
//
// How it works:
//   * generates the same single-line XOR-obfuscated hex that license.js uses
//     (_MASK + _deobf), so the PEM never appears in plaintext in the bundle;
//   * rewrites the `_PHONE_KEYS_OBF = [ ... ];` block inside license.js;
//   * prints a summary + a reminder to bump the version and rebuild.
//
// Rotation: after the Android app generates its own Keystore key, add its
// public key here and rebuild the installers. Keep old keys in the list until
// every installed customer has updated, then drop them.

const fs = require('fs');
const path = require('path');

const MASK = [0x5a, 0x33, 0xc7, 0x81, 0x1e];

function obf(s) {
  let hex = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) ^ MASK[i % MASK.length];
    hex += (c < 16 ? '0' : '') + c.toString(16);
  }
  return hex;
}

const LICENSE_PATH = path.join(__dirname, '..', 'license.js');
const pemFiles = process.argv.slice(2);

if (pemFiles.length === 0) {
  console.error('الاستخدام: node tools/embed-pubkey.js <public.pem> [public2.pem ...]');
  process.exit(1);
}

const pems = pemFiles.map((f) => {
  const abs = path.resolve(f);
  if (!fs.existsSync(abs)) {
    console.error('غير موجود: ' + abs);
    process.exit(1);
  }
  const pem = fs.readFileSync(abs, 'utf8').trim();
  if (!pem.startsWith('-----BEGIN PUBLIC KEY-----')) {
    console.error('يجب أن يكون الملف مفتاحاً عاماً بصيغة PEM (SPKI): ' + abs);
    process.exit(1);
  }
  return { file: f, pem };
});

const obfuscated = pems.map((p) => "'" + obf(p.pem) + "'");

let src = fs.readFileSync(LICENSE_PATH, 'utf8');

const re = /(const _PHONE_KEYS_OBF\s*=\s*\[)[\s\S]*?(\];)/;
if (!re.test(src)) {
  console.error('تعذّر العثور على وسم `const _PHONE_KEYS_OBF = [ ... ];` في license.js');
  process.exit(1);
}

const indent = '  ';
const joined = obfuscated.map((o) => indent + o).join(',\n');
src = src.replace(re, (m, pre, post) => pre + '\n' + joined + '\n' + post);

fs.writeFileSync(LICENSE_PATH, src, 'utf8');

console.log('حُدّث license.js — المفاتيح العامة المقبولة الآن (' + pems.length + '):');
for (const p of pems) {
  const sha = require('crypto').createHash('sha256').update(p.pem).digest('hex').slice(0, 16);
  console.log('  ' + p.file + '  (sha256:' + sha + ')');
}
console.log('\nهام: بُني هذ المثبّت برقم إصدار سابق — ارفع الإصدار وأعد البناء (npm run dist && npm run dist:win7).');