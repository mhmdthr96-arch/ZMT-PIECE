// ============================================================
// ZMT PIECE — Sable Stock (GSSP / ss2021) backup reader
// ------------------------------------------------------------
// Reads a Sable Stock backup without the legacy program:
//   • `.zgssp`  = a ZipCrypto-encrypted ZIP that holds ONE entry,
//                 a plain MySQL dump named  dbss2021_<y>_<m>_<d>.gssp
//   • `.gssp`   = that plain MySQL dump (older backups are not zipped)
//
// The ZIP password is a fixed constant of the Sable Stock backup tool
// (SSBackUp_.exe) and is identical for every installation, so it is
// embedded here. If a future build changes it, `read()` throws a clear
// error instead of returning garbage.
//
// The dump is parsed with a small, strict MySQL-dump reader that keeps
// only the tables the importer asks for (personnez, articlesliste,
// bonsliv, journsortie, ...). It understands the backslash escaping
// mysqldump 5.5 emits, multi-row INSERTs, and values that contain
// commas / parentheses / binary bytes (product photos).
//
// This file is additive: it only defines window.GsspReader and never
// touches any other module.
// ============================================================
(function () {
  'use strict';

  var GSSP_PASSWORD = "@8#YGLjrg3$~a7`'";

  // ---------------------------------------------------------------- CRC32 --
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(crc, byte) {
    return (CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
  }

  // -------------------------------------------------------- ZipCrypto keys --
  function Keys(password) {
    this.k0 = 0x12345678;
    this.k1 = 0x23456789;
    this.k2 = 0x34567890;
    for (var i = 0; i < password.length; i++) this.update(password.charCodeAt(i) & 0xff);
  }
  Keys.prototype.update = function (b) {
    this.k0 = crc32(this.k0, b);
    this.k1 = (Math.imul((this.k1 + (this.k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    this.k2 = crc32(this.k2, (this.k1 >>> 24) & 0xff);
  };
  Keys.prototype.streamByte = function () {
    var temp = (this.k2 | 2) >>> 0;
    // Math.imul keeps the low 32 bits exact (a plain * loses them past 2^53).
    return (Math.imul(temp, temp ^ 1) >>> 8) & 0xff;
  };
  // Decrypts one byte in place and advances the keystream.
  Keys.prototype.decrypt = function (c) {
    var p = this.streamByte();
    this.update(c ^ p);
    return (c ^ p) & 0xff;
  };

  // --------------------------------------------------------------- helpers --
  function u8(buffer) {
    if (buffer instanceof Uint8Array) return buffer;
    if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
    if (buffer && buffer.buffer) return new Uint8Array(buffer.buffer, buffer.byteOffset || 0, buffer.byteLength);
    return new Uint8Array(buffer || []);
  }

  function readU16(b, o) { return b[o] | (b[o + 1] << 8); }
  function readU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function inflateRaw(bytes) {
    if (typeof pako !== 'undefined' && pako && typeof pako.inflateRaw === 'function') {
      return pako.inflateRaw(bytes);
    }
    throw new Error('pako (inflate) is not available');
  }

  function decodeUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    // Fallback: build from char codes (dump is UTF-8; best effort).
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  }

  // ---------------------------------------------------------------- ZIP read --
  function isZip(bytes) {
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
  }

  // Locate the first entry's metadata from the End Of Central Directory.
  function firstEntry(bytes) {
    var eocd = -1;
    var min = Math.max(0, bytes.length - 22 - 0xFFFF);
    for (var i = bytes.length - 22; i >= min; i--) {
      if (readU32(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP: end-of-central-directory not found');
    var count = readU16(bytes, eocd + 10);
    var cdOff = readU32(bytes, eocd + 16);
    if (!count) throw new Error('ZIP: archive is empty');
    if (readU32(bytes, cdOff) !== 0x02014b50) throw new Error('ZIP: bad central-directory entry');
    var flags = readU16(bytes, cdOff + 8);
    var method = readU16(bytes, cdOff + 10);
    var crc = readU32(bytes, cdOff + 16);
    var csize = readU32(bytes, cdOff + 20);
    var usize = readU32(bytes, cdOff + 24);
    var nlen = readU16(bytes, cdOff + 28);
    var elen = readU16(bytes, cdOff + 30);
    var clen = readU16(bytes, cdOff + 32);
    var lho = readU32(bytes, cdOff + 42);
    var name = decodeUtf8(bytes.slice(cdOff + 46, cdOff + 46 + nlen));
    if (readU32(bytes, lho) !== 0x04034b50) throw new Error('ZIP: bad local file header');
    var lnameLen = readU16(bytes, lho + 26);
    var lextraLen = readU16(bytes, lho + 28);
    var dataStart = lho + 30 + lnameLen + lextraLen;
    return { name: name, flags: flags, method: method, crc: crc, csize: csize, usize: usize, dataStart: dataStart, encrypted: !!(flags & 1) };
  }

  function unzip(bytes, password) {
    var e = firstEntry(bytes);
    var raw = bytes.slice(e.dataStart, e.dataStart + e.csize);
    var payload;
    if (e.encrypted) {
      var keys = new Keys(password);
      var dec = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) dec[i] = keys.decrypt(raw[i]);
      // 12-byte ZipCrypto header; last byte is a check value.
      var check = dec[11];
      var wantCrc = (e.crc >>> 24) & 0xff;
      if (check !== wantCrc && check !== 0x00) {
        // Some tools use the DOS-time high byte; if neither matches, the
        // password is wrong for this archive.
        throw new Error('GSSP_PASSWORD');
      }
      payload = dec.subarray(12);
    } else {
      payload = raw;
    }
    var data;
    if (e.method === 8) data = inflateRaw(payload);
    else if (e.method === 0) data = payload;
    else throw new Error('ZIP: unsupported compression method ' + e.method);
    return { name: e.name, data: u8(data) };
  }

  // ---------------------------------------------------------- dump parsing --
  function unescapeMysqlString(s) {
    if (s.indexOf('\\') < 0) return s;
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '\\') {
        var n = s[i + 1];
        i++;
        switch (n) {
          case '0': out += '\0'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'Z': out += '\x1a'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case '\\': out += '\\'; break;
          case "'": out += "'"; break;
          case '"': out += '"'; break;
          default: out += (n === undefined ? '' : n);
        }
      } else out += c;
    }
    return out;
  }

  function finishValue(raw, wasQuoted) {
    if (wasQuoted) return unescapeMysqlString(raw);
    var t = raw.trim();
    if (t === 'NULL' || t === 'null') return null;
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return parseFloat(t);
    return unescapeMysqlString(raw);
  }

  // Parse the value list of one INSERT (everything after VALUES). Returns rows.
  function parseTuples(str) {
    var rows = [];
    var i = 0, n = str.length;
    while (i < n) {
      while (i < n && str[i] !== '(') i++;
      if (i >= n) break;
      i++;
      var row = [], cur = '', inStr = false, wasQuoted = false;
      while (i < n) {
        var c = str[i];
        if (inStr) {
          if (c === '\\') { cur += c + (str[i + 1] || ''); i += 2; continue; }
          if (c === "'") { inStr = false; i++; continue; }
          cur += c; i++; continue;
        }
        if (c === "'") { inStr = true; wasQuoted = true; i++; continue; }
        if (c === ',') { row.push(finishValue(cur, wasQuoted)); cur = ''; wasQuoted = false; i++; continue; }
        if (c === ')') { row.push(finishValue(cur, wasQuoted)); i++; break; }
        cur += c; i++;
      }
      rows.push(row);
    }
    return rows;
  }

  // Parse a MySQL dump, keeping only `wanted` tables (array or Set).
  // Returns { tables: { name: { columns: [], rows: [[]] } }, counts: { name: n } }
  function parseDump(text, wanted) {
    var wantedSet = wanted instanceof Set ? wanted : new Set(wanted || []);
    var tables = {};
    var counts = {};
    var lines = text.split(/\r?\n/);
    var curCreate = null;
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      if (!line.length) continue;
      var ch = line.charCodeAt(0);
      if (ch === 0x43) { // 'C'
        if (line.lastIndexOf('CREATE TABLE `', 0) === 0) {
          var mc = line.match(/^CREATE TABLE `([^`]+)`/);
          if (mc) {
            curCreate = mc[1];
            if (wantedSet.has(curCreate)) {
              if (!tables[curCreate]) tables[curCreate] = { columns: [], rows: [] };
            } else curCreate = null;
          }
        }
        continue;
      }
      if (curCreate) {
        var t = tables[curCreate];
        var trimmed = line.replace(/^[ \t]+/, '');
        if (trimmed.charCodeAt(0) === 0x60) { // backtick column definition
          var cm = trimmed.match(/^`([^`]+)`/);
          if (cm) t.columns.push(cm[1]);
        }
        if (line.charAt(0) === ')') curCreate = null;
        continue;
      }
      if (ch === 0x49) { // 'I'
        if (line.lastIndexOf('INSERT INTO `', 0) !== 0) continue;
        var mi = line.match(/^INSERT INTO `([^`]+)`/);
        if (!mi) continue;
        var tbl = mi[1];
        counts[tbl] = (counts[tbl] || 0) + 1;
        if (!wantedSet.has(tbl)) continue;
        var rest = line.slice(mi[0].length);
        var vIdx = rest.search(/\bVALUES\b/i);
        if (vIdx < 0) continue;
        var head = rest.slice(0, vIdx);
        var cols = null;
        var lp = head.indexOf('(');
        if (lp >= 0) {
          var rp = head.lastIndexOf(')');
          cols = head.slice(lp + 1, rp).split(',').map(function (s) { return s.replace(/[`\s]/g, ''); });
        }
        var payload = rest.slice(vIdx).replace(/^\s*VALUES\s*/i, '');
        if (payload.charAt(payload.length - 1) === ';') payload = payload.slice(0, -1);
        var t2 = tables[tbl] || (tables[tbl] = { columns: [], rows: [] });
        if (!t2.columns.length && cols) t2.columns = cols;
        var rows = parseTuples(payload);
        for (var ri = 0; ri < rows.length; ri++) t2.rows.push(rows[ri]);
      }
    }
    return { tables: tables, counts: counts };
  }

  // ------------------------------------------------------------------ API --
  window.GsspReader = {
    PASSWORD: GSSP_PASSWORD,
    isZip: function (buffer) { return isZip(u8(buffer)); },

    // Read a backup (.zgssp or plain .gssp) into its MySQL-dump text.
    // Returns { text, entryName, encrypted, wasZip }.
    read: function (buffer, opts) {
      opts = opts || {};
      var password = opts.password || GSSP_PASSWORD;
      var bytes = u8(buffer);
      if (isZip(bytes)) {
        var entry = unzip(bytes, password);
        return {
          text: decodeUtf8(entry.data),
          entryName: entry.name,
          encrypted: true,
          wasZip: true,
        };
      }
      // Plain dump (older backups): decode as UTF-8 text.
      return { text: decodeUtf8(bytes), entryName: '', encrypted: false, wasZip: false };
    },

    parseDump: parseDump,
    _unescapeMysqlString: unescapeMysqlString,
    _parseTuples: parseTuples,
    _Keys: Keys,
    _crc32: crc32,
  };

  // Expose for CommonJS test harnesses (no effect in the browser).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.GsspReader;
  }
})();
