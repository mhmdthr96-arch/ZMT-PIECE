// ============================================================================
// ZMT PIECE — SCALE SYNC CORE (تنزيل قائمة الأصناف إلى الميزان)
// ============================================================================
// The mirror image of scale-core.js: that module READS a label the scale
// printed, this one WRITES the article list the scale must know to print it.
//
// A scale keeps its own memory of articles (PLU + name + unit price) and the
// shop loads that list into the machine — by file (USB stick), by serial cable
// or over the network. Every brand lays the file out differently, so nothing is
// hard-coded: a PROFILE describes one scale family (field order, separator,
// widths, encoding, line ending) and the shop picks or edits the profile that
// matches the machine on the counter.
//
// Everything here is pure — no DB, no document, no localStorage, no network —
// so the settings window, the export path and the Node tests all build the very
// same bytes from the very same product list.
// ============================================================================
'use strict';

const ScaleSyncCore = (() => {

  const META_KEY = 'scale_sync_cfg';

  // ---------- tiny helpers -------------------------------------------------

  function num(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function digitsOf(v) {
    return String(v == null ? '' : v).replace(/[^0-9]/g, '');
  }

  // PLU canonical key: printed "00123" and typed "123" reach the same article.
  function pluKey(v) {
    const d = digitsOf(v);
    if (!d) return '';
    return d.replace(/^0+/, '') || '0';
  }

  // ---------- names: many scales are Latin-only ----------------------------
  // A counter scale usually prints a Latin name, so an Arabic product name has
  // to be transliterated before it is sent. The map is deliberately small and
  // lossy: it is meant to be legible on a 20-character label, not reversible.
  const AR_MAP = {
    'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'a', 'ٱ': 'a', 'ى': 'a', 'ة': 'a', 'ء': '',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
    'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
    'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ؤ': 'w', 'ئ': 'y', 'ﻻ': 'la', 'لا': 'la',
  };
  // Arabic diacritics / tatweel carry no sound on a label.
  const AR_MARKS = /[\u064B-\u0652\u0670\u0640]/g;

  function translitAr(s) {
    let out = '';
    const str = String(s == null ? '' : s).replace(AR_MARKS, '');
    for (let i = 0; i < str.length; i++) {
      const ch = str.charAt(i);
      out += Object.prototype.hasOwnProperty.call(AR_MAP, ch) ? AR_MAP[ch] : ch;
    }
    return out;
  }

  // Fit a name to the scale: transliterate when asked, drop control characters,
  // collapse runs of spaces, then truncate to the machine's field width.
  function sanitizeName(name, maxLen, mode) {
    let s = String(name == null ? '' : name);
    if (mode === 'latin') s = translitAr(s);
    s = s
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/[|;,\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const max = Math.max(1, num(maxLen) || 20);
    return s.length > max ? s.slice(0, max).trim() : s;
  }

  // ---------- numeric fields ----------------------------------------------

  // Left-zero-padded, and clipped to the field width from the right when the
  // value does not fit (a 5-wide PLU field can only ever hold 5 digits).
  function padNum(v, width) {
    const w = Math.max(1, num(width) || 1);
    let s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    if (s.length > w) s = s.slice(s.length - w);
    while (s.length < w) s = '0' + s;
    return s;
  }

  function padText(v, width) {
    const w = Math.max(1, num(width) || 1);
    let s = String(v == null ? '' : v);
    if (s.length > w) s = s.slice(0, w);
    while (s.length < w) s = s + ' ';
    return s;
  }

  // The scale stores an integer price: 12.50 DA with 2 decimals is 1250.
  function priceInt(value, decimals) {
    const d = Math.max(0, Math.min(4, num(decimals)));
    const n = Math.round(num(value) * Math.pow(10, d));
    return String(Math.max(0, n));
  }

  // ---------- the layouts a shop can start from ----------------------------
  // Field order follows the article records these machines expect. Every value
  // is editable in the settings window; a shop can add its own profile.
  const PROFILES = [
    {
      id: 'csv-generic', key: 'scaleSync.profileCsv', format: 'csv',
      delimiter: ';', header: '', footer: '',
      encoding: 'utf8', lineEnding: 'crlf',
      nameMax: 30, nameMode: 'raw', pluWidth: 5, priceDecimals: 2, deptWidth: 2,
      columns: ['plu', 'name', 'price'],
    },
    {
      id: 'csv-latin', key: 'scaleSync.profileCsvLatin', format: 'csv',
      delimiter: ';', header: '', footer: '',
      encoding: 'latin1', lineEnding: 'crlf',
      nameMax: 20, nameMode: 'latin', pluWidth: 5, priceDecimals: 2, deptWidth: 2,
      columns: ['plu', 'name', 'price'],
    },
    {
      id: 'fixed-generic', key: 'scaleSync.profileFixed', format: 'fixed',
      delimiter: '', header: '', footer: '',
      encoding: 'ascii', lineEnding: 'crlf',
      nameMax: 20, nameMode: 'latin', pluWidth: 5, priceDecimals: 2, deptWidth: 2,
      columns: [
        { field: 'plu', width: 5 },
        { field: 'name', width: 20 },
        { field: 'price', width: 8 },
      ],
    },
    {
      id: 'cas', key: 'scaleSync.profileCas', format: 'fixed',
      delimiter: '', header: '', footer: '',
      encoding: 'ascii', lineEnding: 'crlf',
      nameMax: 24, nameMode: 'latin', pluWidth: 6, priceDecimals: 2, deptWidth: 2,
      columns: [
        { field: 'plu', width: 6 },
        { field: 'dept', width: 2 },
        { field: 'price', width: 7 },
        { field: 'name', width: 24 },
      ],
    },
    {
      id: 'bizerba', key: 'scaleSync.profileBizerba', format: 'fixed',
      delimiter: '', header: '', footer: '',
      encoding: 'latin1', lineEnding: 'crlf',
      nameMax: 20, nameMode: 'latin', pluWidth: 5, priceDecimals: 2, deptWidth: 2,
      columns: [
        { field: 'plu', width: 5 },
        { field: 'name', width: 20 },
        { field: 'price', width: 7 },
        { field: 'dept', width: 2 },
      ],
    },
    {
      id: 'mettler', key: 'scaleSync.profileMettler', format: 'fixed',
      delimiter: '', header: '', footer: '',
      encoding: 'latin1', lineEnding: 'crlf',
      nameMax: 22, nameMode: 'latin', pluWidth: 5, priceDecimals: 3, deptWidth: 2,
      columns: [
        { field: 'plu', width: 5 },
        { field: 'price', width: 8 },
        { field: 'name', width: 22 },
      ],
    },
    {
      id: 'digi', key: 'scaleSync.profileDigi', format: 'csv',
      delimiter: ',', header: '', footer: '',
      encoding: 'latin1', lineEnding: 'crlf',
      nameMax: 20, nameMode: 'latin', pluWidth: 5, priceDecimals: 2, deptWidth: 2,
      columns: ['plu', 'name', 'price', 'dept'],
    },
    {
      id: 'excell', key: 'scaleSync.profileExcell', format: 'fixed',
      delimiter: '', header: '', footer: '',
      encoding: 'ascii', lineEnding: 'lf',
      nameMax: 18, nameMode: 'latin', pluWidth: 4, priceDecimals: 2, deptWidth: 2,
      columns: [
        { field: 'plu', width: 4 },
        { field: 'name', width: 18 },
        { field: 'price', width: 7 },
      ],
    },
    {
      id: 'tscale', key: 'scaleSync.profileTScale', format: 'fixed',
      delimiter: '', header: '', footer: '',
      encoding: 'ascii', lineEnding: 'crlf',
      nameMax: 16, nameMode: 'latin', pluWidth: 5, priceDecimals: 2, deptWidth: 2,
      columns: [
        { field: 'plu', width: 5 },
        { field: 'price', width: 7 },
        { field: 'name', width: 16 },
      ],
    },
  ];

  const TRANSPORTS = ['file', 'com', 'raw-com', 'net'];

  function defaultConfig() {
    return {
      profileId: 'csv-generic',
      override: {},
      transport: 'file',
      comPort: '',
      baudRate: 9600,
      host: '',
      port: 9100,
      selection: { onlyWithPlu: true, onlyWeighed: false, brandId: '' },
      lastSync: null,
    };
  }

  const clampInt = (v, lo, hi, dflt) => {
    const n = Math.floor(Number(v));
    if (!isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  };

  function normalizeConfig(cfg) {
    const out = defaultConfig();
    if (!cfg || typeof cfg !== 'object') return out;
    out.profileId = PROFILES.some(p => p.id === cfg.profileId) ? String(cfg.profileId) : out.profileId;
    out.override = (cfg.override && typeof cfg.override === 'object') ? cfg.override : {};
    out.transport = TRANSPORTS.indexOf(cfg.transport) !== -1 ? String(cfg.transport) : out.transport;
    out.comPort = String(cfg.comPort == null ? '' : cfg.comPort).slice(0, 24);
    out.baudRate = clampInt(cfg.baudRate, 300, 115200, 9600);
    out.host = String(cfg.host == null ? '' : cfg.host).slice(0, 64);
    out.port = clampInt(cfg.port, 1, 65535, 9100);
    const s = (cfg.selection && typeof cfg.selection === 'object') ? cfg.selection : {};
    out.selection = {
      onlyWithPlu: s.onlyWithPlu !== false,
      onlyWeighed: !!s.onlyWeighed,
      brandId: String(s.brandId == null ? '' : s.brandId),
    };
    out.lastSync = (cfg.lastSync && typeof cfg.lastSync === 'object') ? cfg.lastSync : null;
    return out;
  }

  // The profile the config actually describes: the chosen preset with the
  // shop's overrides laid on top (a preset is a starting point, never a cage).
  function effectiveProfile(cfg) {
    const conf = normalizeConfig(cfg);
    const base = PROFILES.find(p => p.id === conf.profileId) || PROFILES[0];
    const p = JSON.parse(JSON.stringify(base));
    const ov = conf.override || {};
    ['delimiter', 'header', 'footer', 'encoding', 'lineEnding', 'nameMode'].forEach(k => {
      if (ov[k] != null && String(ov[k]) !== '') p[k] = String(ov[k]);
    });
    ['nameMax', 'pluWidth', 'priceDecimals', 'deptWidth'].forEach(k => {
      if (ov[k] != null && isFinite(Number(ov[k]))) p[k] = Number(ov[k]);
    });
    if (Array.isArray(ov.columns) && ov.columns.length) p.columns = ov.columns;
    // Guard rails: a profile must stay usable even if the override is junk.
    p.pluWidth = clampInt(p.pluWidth, 1, 8, 5);
    p.priceDecimals = clampInt(p.priceDecimals, 0, 4, 2);
    p.nameMax = clampInt(p.nameMax, 1, 40, 20);
    p.nameMode = (p.nameMode === 'latin') ? 'latin' : 'raw';
    p.encoding = ['utf8', 'latin1', 'ascii'].indexOf(p.encoding) !== -1 ? p.encoding : 'utf8';
    p.lineEnding = (p.lineEnding === 'lf') ? 'lf' : 'crlf';
    if (p.format !== 'csv') p.format = 'fixed';
    return p;
  }

  function normColumns(profile) {
    const cols = Array.isArray(profile.columns) ? profile.columns : [];
    const out = [];
    for (const c of cols) {
      if (!c) continue;
      if (typeof c === 'string') out.push({ field: c, width: 0 });
      else if (c.field) out.push({ field: String(c.field), width: clampInt(c.width, 0, 60, 0) });
    }
    if (!out.length) out.push({ field: 'plu', width: 5 }, { field: 'name', width: 20 }, { field: 'price', width: 8 });
    return out;
  }

  // ---------- product selection -------------------------------------------

  // Which products go to the scale. OnlyWithPlu is on by default: a card with no
  // PLU has no number the machine could print, so sending it would be noise.
  function selectProducts(products, cfg) {
    const conf = normalizeConfig(cfg);
    const sel = conf.selection;
    return (products || []).filter(p => {
      if (!p || !p.id) return false;
      if (sel.onlyWithPlu && !digitsOf(p.plu)) return false;
      if (sel.onlyWeighed && p.fixed !== true) return false;
      if (sel.brandId && String(p.brandId == null ? '' : p.brandId) !== sel.brandId) return false;
      return true;
    });
  }

  // ---------- article records ---------------------------------------------

  function buildArticles(products, cfg) {
    const prof = effectiveProfile(cfg);
    return selectProducts(products, cfg).map(p => ({
      id: p.id,
      plu: padNum(digitsOf(p.plu), prof.pluWidth),
      name: sanitizeName(p.scaleName || p.name, prof.nameMax, prof.nameMode),
      price: priceInt(p.sellPrice, prof.priceDecimals),
      dept: String(p.scaleDept == null ? '' : p.scaleDept),
      unit: p.unit === 'kg' ? 'kg' : 'pc',
    }));
  }

  // ---------- formatting ---------------------------------------------------

  function cell(article, col, profile) {
    const f = col.field;
    if (profile.format === 'fixed') {
      const w = col.width;
      if (f === 'plu') return padNum(article.plu, w);
      if (f === 'name') return padText(article.name, w);
      if (f === 'price') return padNum(article.price, w);
      if (f === 'dept') return padNum(article.dept || 0, w);
      if (f === 'unit') return padText(article.unit || '', w);
      return padText('', w);
    }
    if (f === 'plu') return article.plu;
    if (f === 'name') return article.name;
    if (f === 'price') return article.price;
    if (f === 'dept') return article.dept || '';
    if (f === 'unit') return article.unit || '';
    return '';
  }

  function formatText(articles, profile) {
    const cols = normColumns(profile);
    const sep = profile.format === 'fixed' ? '' : (profile.delimiter || ';');
    const eol = profile.lineEnding === 'lf' ? '\n' : '\r\n';
    const lines = [];
    if (profile.header) lines.push(String(profile.header));
    for (const a of (articles || [])) {
      lines.push(cols.map(c => cell(a, c, profile)).join(sep));
    }
    if (profile.footer) lines.push(String(profile.footer));
    return lines.length ? (lines.join(eol) + eol) : '';
  }

  // Convenience: products + config -> the exact file text.
  function buildText(products, cfg) {
    return formatText(buildArticles(products, cfg), effectiveProfile(cfg));
  }

  function previewLines(text, n) {
    const cap = Math.max(1, num(n) || 20);
    const lines = String(text == null ? '' : text).split(/\r?\n/);
    // A trailing newline yields one empty element; drop it before previewing.
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.slice(0, cap);
  }

  function contentHash(text) {
    let h = 5381;
    const s = String(text == null ? '' : text);
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  }

  // Products whose price no longer matches the last sync: their label would
  // print a stale amount, and the amount on the label is what the till trusts.
  function diffStale(products, cfg) {
    const conf = normalizeConfig(cfg);
    const prof = effectiveProfile(conf);
    const prices = (conf.lastSync && conf.lastSync.prices) || {};
    const out = [];
    for (const p of selectProducts(products, conf)) {
      const key = pluKey(p.plu);
      const cur = Number(priceInt(p.sellPrice, prof.priceDecimals));
      if (prices[key] == null || Number(prices[key]) !== cur) out.push(p);
    }
    return out;
  }

  // A snapshot of the prices that were actually sent, keyed by PLU.
  function priceSnapshot(products, cfg) {
    const prof = effectiveProfile(cfg);
    const snap = {};
    for (const p of selectProducts(products, cfg)) snap[pluKey(p.plu)] = Number(priceInt(p.sellPrice, prof.priceDecimals));
    return snap;
  }

  // ---------- consistency with the decoding side ---------------------------
  // The label the scale prints must be a code scale-core.js can read back: the
  // PLU width here has to match the PLU field of an enabled decode pattern.
  function checkConsistency(decodeCfg, cfg) {
    const prof = effectiveProfile(cfg);
    const warns = [];
    if (!decodeCfg || !decodeCfg.enabled) { warns.push('scaleSync.warnDecodeOff'); return warns; }
    const patterns = (decodeCfg.patterns || []).filter(p => p && p.enabled);
    if (!patterns.length) { warns.push('scaleSync.warnNoPattern'); return warns; }
    const okPlu = patterns.some(p => p.plu && Number(p.plu.len) === Number(prof.pluWidth));
    if (!okPlu) warns.push('scaleSync.warnPluWidth');
    return warns;
  }

  // Encoding names the main process can turn into bytes (Buffer understands
  // utf8 and latin1; 'ascii' is a safe Latin-1 subset for counter scales).
  function bufferEncoding(enc) {
    const e = String(enc || 'utf8').toLowerCase();
    if (e === 'utf8' || e === 'utf-8') return 'utf8';
    return 'latin1';
  }

  // ---------- incremental diff ---------------------------------------------
  function articleDiff(products, cfg) {
    const conf = normalizeConfig(cfg);
    const prof = effectiveProfile(conf);
    const selected = selectProducts(products, conf);
    const last = (conf.lastSync && Array.isArray(conf.lastSync.pluList)) ? conf.lastSync.pluList : [];
    const lastPrices = (conf.lastSync && conf.lastSync.prices) || {};
    const selKeys = selected.map(p => pluKey(p.plu));
    const added = [], changed = [], unchanged = [];
    for (const p of selected) {
      const k = pluKey(p.plu);
      if (last.indexOf(k) === -1) added.push(p);
      else {
        const cur = Number(priceInt(p.sellPrice, prof.priceDecimals));
        if (lastPrices[k] == null || Number(lastPrices[k]) !== cur) changed.push(p);
        else unchanged.push(p);
      }
    }
    const removed = last.filter(k => selKeys.indexOf(k) === -1);
    return { added, changed, removed, unchanged, selected };
  }

  // ---------- EAN check digits (self-contained) ----------------------------
  function ean13Check(d12) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += (d12.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10;
  }
  function ean8Check(d7) {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += (d7.charCodeAt(i) - 48) * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10;
  }

  // ---------- generate a scale barcode (Phase 4) -------------------------
  function generateScaleCode(decodeCfg, plu, weight) {
    const conf = decodeCfg || {};
    if (!conf.enabled) return null;
    const patterns = (conf.patterns || []).filter(p => p && p.enabled && p.plu && p.weight);
    if (!patterns.length) return null;
    const p = patterns[0];
    const digits = clampInt(p.digits, 8, 13, 13);
    const buf = new Array(digits).fill('0');
    const prefix = String(p.prefix || '').replace(/[^0-9*]/g, '');
    for (let i = 0; i < prefix.length && i < digits; i++) {
      const c = prefix.charAt(i);
      buf[i] = (c === '*') ? '0' : c;
    }
    const pluW = clampInt(p.plu.len, 1, digits, 5);
    const pluStr = padNum(digitsOf(plu), pluW);
    for (let i = 0; i < pluW; i++) {
      const pos = (p.plu.start || 0) + i;
      if (pos < digits) buf[pos] = pluStr.charAt(i);
    }
    const wDec = clampInt(p.weight.decimals, 0, 4, 3);
    const wLen = clampInt(p.weight.len, 1, digits, 5);
    const wInt = Math.round(num(weight) * Math.pow(10, wDec));
    const wStr = padNum(wInt, wLen);
    for (let i = 0; i < wLen; i++) {
      const pos = (p.weight.start || 0) + i;
      if (pos < digits) buf[pos] = wStr.charAt(i);
    }
    if (p.check) {
      const body = buf.slice(0, digits - 1).join('');
      let cd;
      if (digits === 13) cd = ean13Check(body);
      else if (digits === 8) cd = ean8Check(body);
      else cd = 0;
      buf[digits - 1] = String(cd);
    }
    return buf.join('');
  }

  return {
    META_KEY,
    PROFILES,
    TRANSPORTS,
    defaultConfig,
    normalizeConfig,
    effectiveProfile,
    normColumns,
    selectProducts,
    buildArticles,
    formatText,
    buildText,
    previewLines,
    contentHash,
    diffStale,
    articleDiff,
    priceSnapshot,
    checkConsistency,
    generateScaleCode,
    bufferEncoding,
    ean13Check,
    ean8Check,
    // pure field helpers (also used by the verifier)
    digitsOf,
    pluKey,
    translitAr,
    sanitizeName,
    padNum,
    padText,
    priceInt,
  };
})();

if (typeof window !== 'undefined') window.ScaleSyncCore = ScaleSyncCore;
if (typeof module !== 'undefined' && module.exports) module.exports = ScaleSyncCore;
