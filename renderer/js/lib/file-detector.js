window.FileDetector = {
  detect(filename, buffer) {
    const ext = filename.split('.').pop().toLowerCase();
    const type = this.detectByExtension(ext);
    let magic = this.detectByMagic(buffer);

    // Binary database formats whose headers can be misread by text sniffing
    // (e.g. the Firebird header page looks like text and may contain commas).
    // Trust the file extension for these. Sable Stock backups (.gssp / .zgssp)
    // belong here too: the encrypted ZIP starts with the ZIP magic ("PK") and
    // the plain dump contains "CREATE TABLE", yet both must stay 'gssp'.
    if (type === 'firebird' || type === 'access' || type === 'dbf' || type === 'mssql-bak' || type === 'gssp') {
      magic = null;
    }

    let finalType = magic || type;

    // A ".bak" is not always a SQL Server backup — other legacy programs use
    // the same extension for SQLite dumps, plain SQL dumps, JSON/XML, etc.
    // Redirect ONLY on positive header evidence; an unrecognised binary header
    // keeps the historical mssql-bak default (Gestion Stock) untouched.
    if (ext === 'bak' && type === 'mssql-bak') {
      const strong = this.sniffStrongType(buffer);
      if (strong) finalType = strong;
    }

    return {
      extension: ext,
      typeByExt: type,
      typeByMagic: magic,
      type: finalType,
      isDatabase: ['sqlite', 'db', 'access', 'firebird', 'mssql-bak'].includes(finalType),
      isFlatFile: ['csv', 'excel', 'json', 'xml', 'sql', 'dbf', 'text'].includes(finalType),
    };
  },

  // Unambiguous signatures only. Used to rescue legacy ".bak" files that
  // actually contain another SUPPORTED format. Returns null when the header
  // is inconclusive, so the caller keeps its existing default behaviour.
  sniffStrongType(buffer) {
    if (!buffer || buffer.byteLength < 4) return null;
    const head = new Uint8Array(buffer.slice(0, 16));
    const startsWith = (s) => {
      if (buffer.byteLength < s.length) return false;
      for (let i = 0; i < s.length; i++) {
        if (head[i] !== s.charCodeAt(i)) return false;
      }
      return true;
    };
    if (startsWith('SQLite format 3\u0000')) return 'sqlite';
    if (head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0) return 'excel';
    if (this.isTextData(buffer)) {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 1024));
      const t = text.trim();
      if (t.startsWith('{') || t.startsWith('[')) return 'json';
      if (t.startsWith('<?xml') || t.startsWith('<')) return 'xml';
      if (text.includes('CREATE TABLE') || text.includes('INSERT INTO')) return 'sql';
    }
    return null;
  },

  detectByExtension(ext) {
    const map = {
      'csv': 'csv', 'tsv': 'csv', 'txt': 'text',
      'xlsx': 'excel', 'xls': 'excel',
      'json': 'json', 'xml': 'xml',
      'sql': 'sql',
      'db': 'sqlite', 'sqlite': 'sqlite', 'sqlite3': 'sqlite',
      'mdb': 'access', 'accdb': 'access',
      'gdb': 'firebird', 'fdb': 'firebird', 'fbk': 'firebird',
      'bak': 'mssql-bak',
      'dbf': 'dbf',
      'gssp': 'gssp', 'zgssp': 'gssp',
    };
    return map[ext] || 'unknown';
  },

  detectByMagic(buffer) {
    if (!buffer || buffer.byteLength < 4) return null;
    const bytes = new Uint8Array(buffer.slice(0, 16));

    if (bytes[0] === 0x53 && bytes[1] === 0x51 && bytes[2] === 0x4C && bytes[3] === 0x69) return 'sqlite';

    if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) return 'excel';

    if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) return 'excel';

    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';

    if (bytes[0] === 0x03 || bytes[0] === 0x83 || bytes[0] === 0x30) return 'dbf';

    if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return 'access';

    if (this.isTextData(buffer)) {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 1024));
      if (text.includes('CREATE TABLE') || text.includes('INSERT INTO')) return 'sql';
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) return 'json';
      if (text.trim().startsWith('<?xml') || text.trim().startsWith('<')) return 'xml';
      if (text.includes(',') || text.includes('\t') || text.includes(';')) return 'csv';
      return 'text';
    }

    return null;
  },

  isTextData(buffer) {
    const bytes = new Uint8Array(buffer.slice(0, 1024));
    let nonText = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0) { nonText++; break; }
      if (b < 32 && b !== 9 && b !== 10 && b !== 13) nonText++;
    }
    return nonText < 10;
  }
};
