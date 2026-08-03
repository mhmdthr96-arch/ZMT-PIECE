window.FileParsers = {
  async parseCSV(buffer) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const delimiter = text.includes('\t') ? '\t' : (text.includes(';') ? ';' : ',');
    const result = Papa.parse(text, {
      delimiter,
      skipEmptyLines: true,
      header: true,
    });
    return {
      headers: result.meta.fields || [],
      rows: result.data,
      totalRows: result.data.length,
    };
  },

  async parseExcel(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (data.length === 0) return { headers: [], rows: [], totalRows: 0 };
    const headers = data[0].map(h => String(h || ''));
    const rows = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i] !== undefined ? row[i] : '');
      return obj;
    });
    return {
      headers,
      rows,
      totalRows: rows.length,
      sheetNames: wb.SheetNames,
    };
  },

  async parseJSON(buffer) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const root = JSON.parse(text);

    function _deepFindArrays(obj, path = '') {
      const results = [];
      if (Array.isArray(obj) && obj.length > 0) {
        results.push({ path, data: obj });
      } else if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          results.push(..._deepFindArrays(obj[k], path ? `${path}.${k}` : k));
        }
      }
      return results;
    }

    const arrays = _deepFindArrays(root);
    if (arrays.length === 0) {
      return { headers: [], rows: [], totalRows: 0 };
    }

    let best = arrays[0];
    for (const a of arrays) {
      if (/product|item|piece/i.test(a.path)) { best = a; break; }
      if (a.data.length > best.data.length) best = a;
    }

    const data = best.data;
    const headers = [...new Set(data.flatMap(Object.keys))];
    return { headers, rows: data, totalRows: data.length };
  },

  async parseXML(buffer) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const rows = [];
    const items = doc.querySelectorAll('*');
    const tagCounts = {};
    items.forEach(el => {
      const tag = el.tagName;
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
    let mainTag = null;
    let maxCount = 0;
    for (const [tag, count] of Object.entries(tagCounts)) {
      if (count > maxCount && count > 1 && tag !== '#document') {
        maxCount = count;
        mainTag = tag;
      }
    }
    if (!mainTag) return { headers: [], rows: [], totalRows: 0 };

    const elements = doc.querySelectorAll(mainTag);
    const headersSet = new Set();
    elements.forEach(el => {
      const obj = {};
      Array.from(el.children).forEach(child => {
        obj[child.tagName] = child.textContent.trim();
        headersSet.add(child.tagName);
      });
      if (Object.keys(obj).length > 0) rows.push(obj);
    });
    return { headers: [...headersSet], rows, totalRows: rows.length };
  },

  async parseSQL(buffer) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const insertRegex = /INSERT\s+INTO\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi;
    const tableData = {};
    let match;
    while ((match = insertRegex.exec(text)) !== null) {
      const tableName = match[1];
      const columns = match[2].split(',').map(c => c.trim().replace(/[`"']/g, ''));
      const values = match[3];

      if (!tableData[tableName]) {
        tableData[tableName] = { headers: columns, rows: [] };
      }

      const vals = this.parseSQLValues(values);
      const row = {};
      columns.forEach((col, i) => row[col] = vals[i] !== undefined ? vals[i] : '');
      tableData[tableName].rows.push(row);
    }

    const tables = Object.keys(tableData);
    if (tables.length === 0) return { tables: [], headers: [], rows: [], totalRows: 0 };

    const allHeaders = [...new Set(Object.values(tableData).flatMap(t => t.headers))];
    const allRows = Object.values(tableData).flatMap(t => t.rows);

    return {
      tables: tables.map(name => ({ name, rowCount: tableData[name].rows.length })),
      headers: allHeaders,
      rows: allRows,
      totalRows: allRows.length,
    };
  },

  parseSQLValues(valuesStr) {
    const values = [];
    let current = '';
    let inQuote = false;
    let quoteChar = "'";

    for (let i = 0; i < valuesStr.length; i++) {
      const c = valuesStr[i];
      if (inQuote) {
        if (c === quoteChar && valuesStr[i+1] !== quoteChar) {
          inQuote = false;
        } else if (c === quoteChar && valuesStr[i+1] === quoteChar) {
          current += quoteChar;
          i++;
        } else {
          current += c;
        }
      } else {
        if (c === "'" || c === '"') {
          inQuote = true;
          quoteChar = c;
        } else if (c === ',') {
          values.push(current.trim());
          current = '';
        } else {
          current += c;
        }
      }
    }
    values.push(current.trim());
    return values.map(v => {
      if (v === 'NULL' || v === 'null') return '';
      if (v.match(/^-?\d+\.?\d*$/)) return parseFloat(v);
      return v.replace(/^['"]|['"]$/g, '');
    });
  },

  async parseSQLite(buffer) {
    if (typeof initSqlJs === 'undefined') {
      throw new Error('sql.js not loaded');
    }
    const SQL = await initSqlJs();
    const db = new SQL.Database(new Uint8Array(buffer));

    const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tables = tablesResult.length > 0
      ? tablesResult[0].values.map(r => r[0])
      : [];

    return { db, tables, _db: db };
  },

  readSQLiteTable(db, tableName, limit = 50000) {
    const result = db.exec(`SELECT * FROM "${tableName}" LIMIT ${limit}`);
    if (result.length === 0) return { headers: [], rows: [], totalRows: 0 };

    const headers = result[0].columns;
    const rows = result[0].values.map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i] !== null ? row[i] : '');
      return obj;
    });

    const countResult = db.exec(`SELECT COUNT(*) FROM "${tableName}"`);
    const totalRows = countResult[0]?.values[0][0] || rows.length;

    return { headers, rows, totalRows };
  },

  async parseDBF(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 32) throw new Error('File too small');

    const numRecords = bytes[4] + bytes[5] * 256 + bytes[6] * 65536 + bytes[7] * 16777216;
    const headerSize = bytes[8] + bytes[9] * 256;
    const recordSize = bytes[10] + bytes[11] * 256;

    const fields = [];
    let offset = 32;
    while (offset < headerSize - 1) {
      if (bytes[offset] === 0x0D) break;
      const name = String.fromCharCode(...bytes.slice(offset, offset + 11)).replace(/\0/g, '').trim();
      const type = String.fromCharCode(bytes[offset + 11]);
      fields.push({ name, type, offset });
      offset += 32;
    }

    const rows = [];
    let dataOffset = headerSize;
    const headers = fields.map(f => f.name);

    for (let r = 0; r < numRecords && r < 1000; r++) {
      if (bytes[dataOffset] === 0x2A) {
        dataOffset += recordSize;
        continue;
      }
      const row = {};
      let fieldOffset = dataOffset + 1;
      for (const field of fields) {
        const fieldLen = this.getDBFFieldLength(field, bytes, dataOffset + 1, fields);
        const raw = String.fromCharCode(...bytes.slice(fieldOffset, fieldOffset + fieldLen)).trim();

        switch (field.type) {
          case 'C': row[field.name] = raw; break;
          case 'N': row[field.name] = parseFloat(raw) || 0; break;
          case 'F': row[field.name] = parseFloat(raw) || 0; break;
          case 'D': row[field.name] = raw; break;
          case 'L': row[field.name] = raw === 'Y' || raw === 'y' || raw === 'T' || raw === 't'; break;
          default: row[field.name] = raw;
        }
        fieldOffset += fieldLen;
      }
      rows.push(row);
      dataOffset += recordSize;
    }

    return { headers, rows, totalRows: numRecords, fieldTypes: fields.map(f => ({ name: f.name, type: f.type })) };
  },

  getDBFFieldLength(field, bytes, startOffset, allFields) {
    const fieldIndex = allFields.indexOf(field);
    const headerOffset = 32 + fieldIndex * 32;
    return bytes[headerOffset + 16];
  },

  async parseAccess(buffer) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const tables = [];
    const tableRegex = /(?:TABLE|CREATE)\s+[`"']?(\w+)/gi;
    let m;
    while ((m = tableRegex.exec(text)) !== null) {
      tables.push(m[1]);
    }
    return { tables, note: 'access_partial' };
  }
};
