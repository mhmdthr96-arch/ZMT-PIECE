/**
 * ZMT PIECE - اختبار تدفق استيراد البيانات (النسخ الاحتياطي)
 * 
 * يختبر هذا الملف:
 * 1. إنشاء ملف Excel تجريبي ببيانات قطع غيار حقيقية
 * 2. تحليل الأعمدة عبر SmartDetector (منقول للـ Node)
 * 3. مطابقة الكلمات المفتاحية عبر KeywordMatcher
 * 4. تدفق المطابقة التلقائية الكامل
 * 5. محاكاة AI Agent (بناء الـ prompt)
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// ===================================================================
// إحصائيات النتائج
// ===================================================================
let testsPassed = 0;
let testsFailed = 0;
const results = [];

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    results.push(`  ✅ ${message}`);
  } else {
    testsFailed++;
    results.push(`  ❌ ${message}`);
  }
}

function assertEq(actual, expected, message) {
  const pass = actual === expected;
  if (pass) {
    testsPassed++;
    results.push(`  ✅ ${message}`);
  } else {
    testsFailed++;
    results.push(`  ❌ ${message} — حصلنا على: ${JSON.stringify(actual)}، متوقع: ${JSON.stringify(expected)}`);
  }
}

// ===================================================================
// تعريفات الأنواع (نسخة خفيفة من SmartDetector + KeywordMatcher)
// ===================================================================
const ALL_FIELDS = [
  { id: 'barcode', ar: 'باركود / كود', en: 'Barcode / Code' },
  { id: 'name', ar: 'اسم المنتج', en: 'Product Name' },
  { id: 'brand', ar: 'العلامة التجارية', en: 'Brand' },
  { id: 'category', ar: 'التصنيف / الفئة', en: 'Category' },
  { id: 'buyPrice', ar: 'سعر الشراء', en: 'Buy Price' },
  { id: 'sellPrice', ar: 'سعر البيع', en: 'Sell Price' },
  { id: 'qty', ar: 'الكمية / المخزون', en: 'Quantity / Stock' },
  { id: 'supplier', ar: 'المورد', en: 'Supplier' },
  { id: 'customer', ar: 'العميل / الزبون', en: 'Customer' },
  { id: 'phone', ar: 'رقم الهاتف', en: 'Phone Number' },
  { id: 'invoiceDate', ar: 'تاريخ الفاتورة', en: 'Invoice Date' },
  { id: 'invoiceTotal', ar: 'إجمالي الفاتورة', en: 'Invoice Total' },
  { id: 'invoiceRef', ar: 'رقم الفاتورة', en: 'Invoice Ref' },
  { id: 'notes', ar: 'ملاحظات', en: 'Notes' },
];
const ALL_FIELD_IDS = ALL_FIELDS.map(f => f.id);

// Keywords from keyword-matcher.js
const FIELD_KEYWORDS = {
  barcode: ['barcode', 'bar_code', 'bar-code', 'code', 'coded', 'cod', 'code_barre', 'code-barre', 'رقم', 'باركود', 'كود', 'art_code', 'artcode'],
  name: ['name', 'nom', 'description', 'desc', 'designation', 'libelle', 'libellé', 'article', 'piece', 'part', 'nom_produit', 'nomproduit', 'product_name', 'اسم', 'اسم_المنتج', 'قطعة', 'سمية'],
  buyPrice: ['buy_price', 'buyprice', 'prix_achat', 'prix_achat_ht', 'purchase_price', 'cost', 'cost_price', 'cout', 'coût', 'prix_de_revient', 'premier_prix', 'harga_beli', 'سعر_الشراء', 'ثمن_الشراء', 'cost_price', 'buy'],
  sellPrice: ['sell_price', 'sellprice', 'prix', 'prix_vente', 'prix_vente_ht', 'price', 'sale_price', 'tarif', 'tarif_prix', 'tarifht', '售价', 'سعر', 'ثمن', 'prix_vente_ttc', 'prix_vente2', 'pvp', 'sell'],
  qty: ['qty', 'quantity', 'quantite', 'quantité', 'stock', 'qte', 'qte_stock', 'stock_actuel', ' disponibles', 'available', 'كمية', 'كمية_المخزون', 'المخزون', 'stock_initial', 'inventaire'],
  brand: ['brand', 'marque', 'make', 'fabricant', 'manufacturer', 'العلامة', 'العلامة_التجارية', 'brand_name', 'brandname'],
  category: ['category', 'categorie', 'cat', 'type', 'famille', 'gamme', 'التصنيف', 'الفئة', 'category_name', 'cat_name'],
  supplier: ['supplier', 'fournisseur', 'vendor', 'provid', 'المورد', 'fournisseur_nom', 'supplier_name'],
  customer: ['customer', 'client', 'buyer', 'acheteur', 'عميل', 'زبون', 'customer_name', 'client_nom'],
  phone: ['phone', 'tel', 'mobile', 'telephone', 'تéléphone', 'هاتف', 'جوال', 'موبايل', 'phone_number', 'telephone', 'contact'],
  invoiceDate: ['date', 'invoice_date', 'facture_date', 'تاريخ', 'التاريخ', 'تاريخ_الفاتورة', 'date_facture', 'invoice_date', 'order_date', 'purchase_date', 'datum', 'fecha', 'data'],
  invoiceTotal: ['total', 'montant', 'amount', 'إجمالي', 'مجموع', 'invoice_total', 'facture_montant', 'total_ht', 'total_ttc', 'grand_total'],
  invoiceRef: ['ref', 'reference', 'invoice_no', 'num_facture', 'رقم_الفاتورة', 'invoice_number', 'facture_num', 'order_no', 'order_ref'],
  notes: ['notes', 'note', 'comment', 'remark', 'ملاحظات', 'observations', 'remarque', 'description_longue'],
  sellPrice2: ['prix2', 'prix_vente2', 'prix_vente_ttc', 'price2', 'second_price'],
};

// Header matching from SmartDetector.matchHeader
function matchHeader(header) {
  if (!header || header === '') return [];
  const stripAccents = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const h = stripAccents(String(header).toLowerCase().trim().replace(/[_\-\s]+/g, ''));
  const map = {
    barcode: ['barcode', 'barcode', 'bar_code', 'code', 'cod', 'باركود', 'كود', 'باركود'],
    name: ['name', 'nom', 'description', 'designation', 'libelle', 'article', 'product', 'اسم', 'منتج', 'قطعة'],
    brand: ['brand', 'marque', 'make', 'fabricant', 'manufacturer', 'العلامة', 'الماركة'],
    category: ['category', 'categorie', 'cat', 'type', 'famille', 'class', 'تصنيف', 'فئة', 'نوع'],
    buyPrice: ['buy', 'purchase', 'cost', 'achat', 'prix_achat', 'سعر_الشراء', 'ثمن_الشراء'],
    sellPrice: ['sell', 'price', 'vente', 'prix', 'tarif', 'سعر', 'ثمن'],
    qty: ['qty', 'quantity', 'quantite', 'stock', 'qte', 'كمية', 'مخزون'],
    supplier: ['supplier', 'fournisseur', 'vendor', 'مورد'],
    customer: ['customer', 'client', 'buyer', 'عميل', 'زبون'],
    phone: ['phone', 'tel', 'mobile', 'telephone', 'هاتف', 'جوال', 'موبايل'],
    invoiceDate: ['date', 'invoice_date', 'facture_date', 'تاريخ', 'التاريخ', 'تاريخ_الفاتورة', 'datum', 'fecha', 'data'],
    invoiceTotal: ['total', 'montant', 'amount', 'إجمالي', 'مجموع'],
    invoiceRef: ['ref', 'reference', 'invoice_no', 'رقم_الفاتورة'],
    notes: ['notes', 'note', 'comment', 'remark', 'ملاحظات'],
  };
  // Prefer the single best (longest) keyword match so a generic word such as
  // "سعر" does not beat the more specific "سعر_الشراء", and a tie keeps the
  // field that appears first in the map (barcode before name, buyPrice before sellPrice).
  let bestField = null;
  let bestLen = 0;
  for (const [field, keywords] of Object.entries(map)) {
    for (const kw of keywords) {
      const k = stripAccents(kw.toLowerCase().replace(/[_\-\s]+/g, ''));
      if (h === k || h.includes(k) || k.includes(h)) {
        if (k.length > bestLen) { bestLen = k.length; bestField = field; }
      }
    }
  }
  if (!bestField) return [];
  return [{ field: bestField, boost: 90 }];
}

// Keyword matching (from SmartDetector.matchColumns + KeywordMatcher.matchColumns)
function keywordMatchColumns(headers) {
  const result = {};
  const used = new Set();
  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
    let bestMatch = null;
    let bestScore = 0;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const stripAccents = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const h = stripAccents(headers[i].toLowerCase().trim().replace(/[\s-]+/g, '_'));
      for (const kw of keywords) {
        if (h === kw || h.includes(kw) || kw.includes(h)) {
          const score = kw.length;
          if (score > bestScore) { bestScore = score; bestMatch = i; }
        }
      }
    }
    if (bestMatch !== null) { result[field] = bestMatch; used.add(bestMatch); }
  }
  return result;
}

// Column analysis (from SmartDetector.analyzeColumn)
function analyzeColumn(values, header) {
  const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined && v !== 0 && v !== '0');
  const valid = nonEmpty.map(v => String(v).trim());
  if (valid.length < 2) return { candidates: [], summary: 'بيانات قليلة جداً' };

  const candidates = [];
  const numVals = valid.map(v => parseFloat(v.replace(/[^0-9.\-]/g, '')));
  const numericCount = numVals.filter(v => !isNaN(v)).length;
  // A value must be purely numeric to count as numeric — alphanumeric codes such as
  // "BRK001" must not be parsed as 1 and misclassified as quantities/prices.
  const isNumeric = numericCount === valid.length && valid.every(v => /^[0-9.\-]+$/.test(v));

  if (isNumeric) {
    analyzeNumeric(valid, numVals, candidates);
  } else {
    analyzeText(valid, candidates);
  }

  const headerHints = matchHeader(header);
  for (const hint of headerHints) {
    const existing = candidates.find(c => c.field === hint.field);
    if (existing) {
      existing.score = Math.min(99, existing.score + hint.boost);
    } else {
      candidates.push({ field: hint.field, score: Math.min(99, hint.boost), detail: `مطابقة عنوان: ${header}` });
    }
  }

  const added = new Set();
  for (const f of ALL_FIELD_IDS) {
    if (!candidates.find(c => c.field === f)) {
      added.add(f);
    }
  }
  for (const f of added) {
    candidates.push({ field: f, score: 5, detail: '' });
  }

  candidates.sort((a, b) => b.score - a.score);
  return { candidates, summary: getSummary(candidates) };
}

function analyzeNumeric(valid, numVals, candidates) {
  const floats = numVals.filter(v => !isNaN(v));
  const avg = floats.reduce((s, v) => s + v, 0) / floats.length;
  const max = Math.max(...floats);
  const min = Math.min(...floats);
  const allIntegers = floats.every(v => Number.isInteger(v) || v === Math.floor(v));
  const hasDecimals = floats.some(v => v !== Math.floor(v));

  if (avg > 1000000 && allIntegers) {
    candidates.push({ field: 'qty', score: 50, detail: `أعداد كبيرة ${avg.toFixed(0)}` });
    candidates.push({ field: 'invoiceTotal', score: 75, detail: `إجمالي فاتورة (${avg.toFixed(0)})` });
    return;
  }
  if (avg > 100000) {
    candidates.push({ field: 'invoiceTotal', score: 70, detail: `قيمة كبيرة (${avg.toFixed(0)})` });
  }
  if (hasDecimals || (!allIntegers && avg > 10)) {
    candidates.push({ field: 'sellPrice', score: 65, detail: `قيم عشرية (متوسط ${avg.toFixed(2)})` });
    candidates.push({ field: 'buyPrice', score: 50, detail: `احتمال سعر شراء` });
    if (avg > 100000) {
      candidates.push({ field: 'invoiceTotal', score: 75, detail: `مجموع فاتورة` });
    }
  }
  if (allIntegers) {
    if (avg < 100000) {
      candidates.push({ field: 'qty', score: 85, detail: `أعداد صحيحة (متوسط ${avg.toFixed(0)})` });
    }
    if (avg < 50 && avg > 0) {
      candidates.push({ field: 'buyPrice', score: 45, detail: 'أعداد صحيحة صغيرة' });
    }
    if (avg > 40000 && avg < 60000 && max - min > 30) {
      candidates.push({ field: 'invoiceDate', score: 55, detail: 'احتمال تواريخ (أرقام Excel تسلسلية)' });
    }
  }
  if (avg >= 50 && avg <= 100000 && allIntegers) {
    candidates.push({ field: 'sellPrice', score: 45, detail: `قيم متوسطة (${avg.toFixed(0)})` });
  }
  if (floats.length > 0 && max - min === 0 && allIntegers) {
    candidates.push({ field: 'qty', score: 30, detail: 'كل القيم متساوية' });
  }
}

const BRAND_KEYWORDS = [
  'bmw', 'mercedes', 'toyota', 'honda', 'nissan', 'hyundai', 'kia',
  'ford', 'chevrolet', 'renault', 'peugeot', 'citroen', 'fiat', 'volkswagen',
  'mitsubishi', 'mazda', 'subaru', 'suzuki', 'lexus', 'volvo', 'jeep',
  'opel', 'seat', 'skoda', 'dacia', 'chery', 'byd', 'geely'
];

const CATEGORY_KEYWORDS = [
  'motor', 'moteur', 'engine', 'محرك',
  'brake', 'frein', 'فرامل',
  'filter', 'filtre', 'فلتر',
  'bearing', 'roulement', 'رمان',
  'suspension', 'amortisseur', 'تعليق',
  'exhaust', 'عادم',
  'radiator', 'ردياتير',
  'battery', 'بطارية',
  'clutch', 'كلتش',
  'pump', 'مضخة',
  'sensor', 'حساس',
  'gasket', 'حشية',
  'belt', 'سير',
  'light', 'كشافات',
  'tire', 'اطار',
  'turbo', 'توربو',
  'alternator', 'دينامو',
  'starter', 'مارش',
  'injector', 'حقن',
];

function analyzeText(valid, candidates) {
  const lengths = valid.map(v => v.length);
  const avgLen = lengths.reduce((s, v) => s + v, 0) / lengths.length;
  const hasSpaces = valid.filter(v => /\s/.test(v)).length;
  const allShortCodes = valid.every(v => v.length >= 3 && v.length <= 30 && /^[A-Za-z0-9\-_/.]+$/.test(v));
  const mixedAlphaNum = valid.filter(v => /[A-Za-z]/.test(v) && /[0-9]/.test(v)).length;
  const onlyDigits = valid.every(v => /^[0-9]+$/.test(v));
  const arabicCount = valid.filter(v => /[\u0600-\u06FF]/.test(v)).length;
  const phoneLike = valid.filter(v => /^[\+\d\s\-\(\)]{7,20}$/.test(v)).length;
  const emailLike = valid.filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).length;
  const dateLike = valid.filter(v => /^\d{2,4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,4}$/.test(v) || /^\d{8}$/.test(v) || !isNaN(Date.parse(v))).length;

  if (allShortCodes && mixedAlphaNum / valid.length > 0.3) {
    candidates.push({ field: 'barcode', score: 90, detail: 'رموز أبجدية رقمية قصيرة' });
  }
  if (onlyDigits && valid.every(v => v.length >= 5 && v.length <= 20)) {
    candidates.push({ field: 'barcode', score: 75, detail: 'أرقام فقط (باركود)' });
  }
  if (phoneLike / valid.length > 0.5) {
    candidates.push({ field: 'phone', score: 90, detail: 'أرقام هواتف' });
  }
  if (emailLike / valid.length > 0.5) {
    candidates.push({ field: 'customer', score: 60, detail: 'عناوين بريد' });
  }
  if (dateLike / valid.length > 0.5) {
    candidates.push({ field: 'invoiceDate', score: 85, detail: 'تواريخ' });
  }

  const brandHits = valid.filter(v => BRAND_KEYWORDS.some(kw => v.toLowerCase().includes(kw))).length;
  if (brandHits / valid.length > 0.25) {
    candidates.push({ field: 'brand', score: Math.min(90, Math.round(70 + brandHits / valid.length * 25)), detail: `يحتوي على علامات تجارية (${brandHits}/${valid.length})` });
  } else if (brandHits / valid.length > 0.1) {
    candidates.push({ field: 'brand', score: 50, detail: `بعض القيم تشبه علامات تجارية (${brandHits}/${valid.length})` });
  }

  const catHits = valid.filter(v => CATEGORY_KEYWORDS.some(kw => v.toLowerCase().includes(kw))).length;
  if (catHits / valid.length > 0.25) {
    candidates.push({ field: 'category', score: Math.min(85, Math.round(60 + catHits / valid.length * 25)), detail: `يحتوي على تصنيفات (${catHits}/${valid.length})` });
  } else if (catHits / valid.length > 0.1) {
    candidates.push({ field: 'category', score: 45, detail: `بعض القيم تشبه تصنيفات (${catHits}/${valid.length})` });
  }

  if (hasSpaces / valid.length > 0.5 && avgLen > 15) {
    candidates.push({ field: 'name', score: 85, detail: `نصوص طويلة (متوسط ${avgLen.toFixed(0)} حرف)` });
  } else if (hasSpaces / valid.length > 0.3 && avgLen > 8) {
    candidates.push({ field: 'name', score: 65, detail: `نصوص متوسطة (${avgLen.toFixed(0)} حرف)` });
  }

  if (allShortCodes && brandHits / valid.length < 0.1 && catHits / valid.length < 0.1) {
    candidates.push({ field: 'invoiceRef', score: 40, detail: 'رموز قصيرة' });
  }

  if (arabicCount / valid.length > 0.3 && avgLen > 6) {
    candidates.push({ field: 'supplier', score: 35, detail: 'نصوص عربية' });
    candidates.push({ field: 'customer', score: 35, detail: 'نصوص عربية' });
  }
}

function getSummary(candidates) {
  if (candidates.length === 0) return 'غير معروف';
  const top = candidates[0];
  if (top.score >= 80) return `← ${top.field} (ثقة عالية)`;
  if (top.score >= 55) return `← ${top.field} (ثقة متوسطة)`;
  return `ربما ${top.field}`;
}

// AI Agent prompt builder (from ai-agent.js)
function buildSamplePayload(headers, rows, maxSample = 50) {
  const sample = rows.slice(0, maxSample);
  return {
    headers,
    totalRows: rows.length,
    sampleCount: sample.length,
    sampleRows: sample.slice(0, 20),
    allSampleValues: headers.map(h => ({
      column: h,
      sampleValues: sample.map(r => r[h] !== undefined && r[h] !== null ? String(r[h]) : '').filter(Boolean).slice(0, 15),
    })),
  };
}

function buildAIPrompt(headers, rows) {
  const payload = buildSamplePayload(headers, rows);
  return `
أسماء الأعمدة: ${JSON.stringify(headers)}
إجمالي الصفوف: ${rows.length}

عينة القيم لكل عمود:
${JSON.stringify(payload.allSampleValues, null, 2)}

مثال من البيانات (أول 5 صفوف):
${JSON.stringify(rows.slice(0, 5), null, 2)}
`;
}

// Auto-mapping logic (from data-migration.js)
function smartDetectMapping(headers, rows, columnAnalysis) {
  const mapping = {};
  const usedCols = new Set();

  const kwMapping = keywordMatchColumns(headers);
  for (const [field, idx] of Object.entries(kwMapping)) {
    if (idx < headers.length && !usedCols.has(idx)) {
      mapping[field] = idx;
      usedCols.add(idx);
    }
  }

  const priority = ['barcode', 'name', 'sellPrice', 'buyPrice', 'qty', 'brand', 'category', 'supplier', 'customer', 'phone', 'invoiceDate', 'invoiceTotal', 'invoiceRef', 'notes', 'sellPrice2'];
  for (const field of priority) {
    if (mapping[field] !== undefined) continue;
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < headers.length; i++) {
      if (usedCols.has(i)) continue;
      const analysis = columnAnalysis?.[headers[i]];
      if (!analysis) continue;
      const c = analysis.candidates?.find(c => c.field === field);
      if (c && c.score > bestScore) {
        bestScore = c.score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= 30) {
      mapping[field] = bestIdx;
      usedCols.add(bestIdx);
    }
  }

  return mapping;
}

// Simulate AI result
function simulateAIResult(headers) {
  const mapping = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (h.includes('باركود') || h.includes('كود') || h.includes('code')) mapping.barcode = h;
    else if (h.includes('اسم') || h.includes('product') || h.includes('name')) mapping.name = h;
    else if (h.includes('العلامة') || h.includes('brand')) mapping.brand = h;
    else if (h.includes('تصنيف') || h.includes('category') || h.includes('type')) mapping.category = h;
    else if (h.includes('سعر') || h.includes('price') || h.includes('prix')) {
      if (h.includes('شراء') || h.includes('buy') || h.includes('achat')) mapping.buyPrice = h;
      else mapping.sellPrice = h;
    }
    else if (h.includes('كمية') || h.includes('كمية') || h.includes('stock') || h.includes('qty')) mapping.qty = h;
    else if (h.includes('مورد') || h.includes('supplier') || h.includes('fournisseur')) mapping.supplier = h;
    else if (h.includes('تاريخ') || h.includes('تاريخ') || h.includes('date')) mapping.invoiceDate = h;
    else if (h.includes('رقم') || h.includes('ref') || h.includes('reference')) mapping.invoiceRef = h;
    else if (h.includes('ملاحظات') || h.includes('notes')) mapping.notes = h;
  }
  return { mapping, confidence: 82, notes: 'تحليل تلقائي' };
}

// ===================================================================
// بيانات الاختبار: ملف Excel نموذجي من برنامج سابق
// ===================================================================
console.log('============================================');
console.log('اختبار تدفق استيراد البيانات - ZMT PIECE');
console.log('============================================\n');

// --- مجموعة 1: ملف برنامج سابق (رؤوس عربية مختلطة) ---
console.log('--- مجموعة 1: ملف Excel برؤوس عربية مختلطة ---');

const sampleData1 = [
  ['كود القطعة', 'اسم القطعة', 'العلامة التجارية', 'التصنيف', 'سعر الشراء', 'سعر البيع', 'الكمية', 'المورد', 'تاريخ الفاتورة', 'رقم الفاتورة', 'ملاحظات'],
  ['BRK001', 'فردان فرامل أمامي', 'Toyota', 'فرامل', 4500, 6500, 50, 'شركة السلام للتجارة', '2024/01/15', 'INV-001', ''],
  ['FLT002', 'فلتر زيت', 'BMW', 'فلتر', 1200, 1800, 200, 'العالمية لقطع الغيار', '2024/01/15', 'INV-001', 'أصلي الماني'],
  ['BGT003', 'بوجي شمعة احتراق', 'Mercedes', 'محرك', 800, 1500, 150, 'شركة السلام للتجارة', '2024/02/20', 'INV-002', ''],
  ['BRK004', 'طقم كلتش كامل', 'Hyundai', 'قابض', 8500, 12500, 30, 'العالمية لقطع الغيار', '2024/03/10', 'INV-003', 'ضمان 6 شهور'],
  ['FLT005', 'فلتر هواء', 'Nissan', 'فلتر', 900, 1400, 180, 'شركة الاتقان', '2024/03/10', 'INV-003', ''],
  ['BRK006', 'مساعدات أمامية', 'Toyota', 'تعليق', 12000, 18500, 20, 'شركة السلام للتجارة', '2024/04/05', 'INV-004', ''],
  ['BRK007', 'رمان عجل أمامي', 'Kia', 'رمان', 3500, 5500, 75, 'العالمية لقطع الغيار', '2024/04/05', 'INV-004', ''],
  ['BGT008', 'دينامو', 'Mercedes', 'محرك', 15000, 22000, 10, 'شركة الاتقان', '2024/05/12', 'INV-005', '60 أمبير'],
  ['FLT009', 'حساس الأوكسجين', 'BMW', 'حساس', 4500, 7500, 40, 'شركة السلام للتجارة', '2024/05/12', 'INV-005', ''],
  ['BRK010', 'سير تيمين', 'Hyundai', 'سير', 2500, 4000, 60, 'العالمية لقطع الغيار', '2024/06/18', 'INV-006', ''],
];

// Write test file
const testDir = path.join(__dirname, '..', '..', 'test-files');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

function writeExcel(headers, rows, filename) {
  const wb = XLSX.utils.book_new();
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const filePath = path.join(testDir, filename);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

// Test 1: Write and Parse Excel
console.log('\n--- اختبار 1: كتابة وقراءة ملف Excel ---');
const filePath1 = writeExcel(sampleData1[0], sampleData1.slice(1), 'test_import_1.xlsx');
assert(fs.existsSync(filePath1), 'تم إنشاء ملف Excel التجريبي');

const wb1 = XLSX.readFile(filePath1);
const sheet1 = wb1.Sheets[wb1.SheetNames[0]];
const data1 = XLSX.utils.sheet_to_json(sheet1, { header: 1 });
const parsedHeaders1 = data1[0].map(h => String(h || ''));
const parsedRows1 = data1.slice(1).map(row => {
  const obj = {};
  parsedHeaders1.forEach((h, i) => obj[h] = row[i] !== undefined ? row[i] : '');
  return obj;
});

assertEq(parsedHeaders1.length, 11, 'عدد الأعمدة = 11');
assertEq(parsedRows1.length, 10, 'عدد الصفوف = 10');

// Test 2: Keyword Matching
console.log('\n--- اختبار 2: مطابقة الكلمات المفتاحية ---');
const km = keywordMatchColumns(parsedHeaders1);
assertEq(km.barcode, 0, 'مطابقة الباركود → العمود 0');
assertEq(km.name, 1, 'مطابقة الاسم → العمود 1');
assertEq(km.brand, 2, 'مطابقة العلامة التجارية → العمود 2');
assertEq(km.category, 3, 'مطابقة التصنيف → العمود 3');
assertEq(km.buyPrice, 4, 'مطابقة سعر الشراء → العمود 4');
assertEq(km.sellPrice, 5, 'مطابقة سعر البيع → العمود 5');
assertEq(km.qty, 6, 'مطابقة الكمية → العمود 6');
assertEq(km.supplier, 7, 'مطابقة المورد → العمود 7');
assertEq(km.invoiceDate, 8, 'مطابقة تاريخ الفاتورة → العمود 8');
assertEq(km.invoiceRef, 9, 'مطابقة رقم الفاتورة → العمود 9');
assertEq(km.notes, 10, 'مطابقة الملاحظات → العمود 10');

// Test 3: Column Analysis
console.log('\n--- اختبار 3: تحليل الأعمدة ---');
const analysis = {};
for (const h of parsedHeaders1) {
  const colVals = parsedRows1.map(r => r[h]);
  analysis[h] = analyzeColumn(colVals, h);
}

function checkAnalysis(header, expectedField) {
  const a = analysis[header];
  const top = a.candidates?.[0];
  return top && top.field === expectedField;
}

assert(checkAnalysis('كود القطعة', 'barcode'), 'تحليل "كود القطعة" → barcode');
assert(checkAnalysis('اسم القطعة', 'name'), 'تحليل "اسم القطعة" → name');
assert(checkAnalysis('العلامة التجارية', 'brand'), 'تحليل "العلامة التجارية" → brand');
assert(checkAnalysis('سعر الشراء', 'buyPrice'), 'تحليل "سعر الشراء" → buyPrice');
assert(checkAnalysis('سعر البيع', 'sellPrice'), 'تحليل "سعر البيع" → sellPrice');
assert(checkAnalysis('الكمية', 'qty'), 'تحليل "الكمية" → qty');
assert(checkAnalysis('المورد', 'supplier'), 'تحليل "المورد" → supplier');
assert(checkAnalysis('تاريخ الفاتورة', 'invoiceDate'), 'تحليل "تاريخ الفاتورة" → invoiceDate');

// Test 4: Auto Mapping
console.log('\n--- اختبار 4: المطابقة التلقائية ---');
const autoMapping = smartDetectMapping(parsedHeaders1, parsedRows1, analysis);
assertEq(autoMapping.barcode, 0, 'المطابقة التلقائية: باركود ← 0');
assertEq(autoMapping.name, 1, 'المطابقة التلقائية: اسم ← 1');
assertEq(autoMapping.brand, 2, 'المطابقة التلقائية: علامة ← 2');
assertEq(autoMapping.category, 3, 'المطابقة التلقائية: تصنيف ← 3');
assertEq(autoMapping.buyPrice, 4, 'المطابقة التلقائية: سعر شراء ← 4');
assertEq(autoMapping.sellPrice, 5, 'المطابقة التلقائية: سعر بيع ← 5');
assertEq(autoMapping.qty, 6, 'المطابقة التلقائية: كمية ← 6');
assertEq(autoMapping.supplier, 7, 'المطابقة التلقائية: مورد ← 7');
assertEq(autoMapping.invoiceDate, 8, 'المطابقة التلقائية: تاريخ ← 8');
assertEq(autoMapping.invoiceRef, 9, 'المطابقة التلقائية: رقم فاتورة ← 9');
assertEq(autoMapping.notes, 10, 'المطابقة التلقائية: ملاحظات ← 10');

// Test 5: AI Simulation
console.log('\n--- اختبار 5: محاكاة AI Agent ---');
const aiResult = simulateAIResult(parsedHeaders1);
assert(aiResult.mapping.barcode === 'كود القطعة', 'AI: باركود');
assert(aiResult.mapping.name === 'اسم القطعة', 'AI: اسم');
assert(aiResult.mapping.brand === 'العلامة التجارية', 'AI: علامة');
assert(aiResult.mapping.qty === 'الكمية', 'AI: كمية');
assert(aiResult.mapping.supplier === 'المورد', 'AI: مورد');
assert(aiResult.mapping.invoiceDate === 'تاريخ الفاتورة', 'AI: تاريخ');
assert(aiResult.confidence >= 0 && aiResult.confidence <= 100, 'AI: الثقة بين 0-100');

// Test 6: AI Prompt Builder
console.log('\n--- اختبار 6: بناء طلب AI ---');
const prompt = buildAIPrompt(parsedHeaders1, parsedRows1);
assert(prompt.includes('كود القطعة'), 'الـ prompt يحتوي على أسماء الأعمدة');
assert(prompt.includes('BRK001'), 'الـ prompt يحتوي على عينة بيانات');
assert(prompt.includes('10'), 'الـ prompt يحتوي على إجمالي الصفوف');

// Test 7: ملف برؤوس إنجليزية
console.log('\n--- مجموعة 2: ملف برؤوس إنجليزية ---');
const sampleData2 = [
  ['Barcode', 'Product Name', 'Brand', 'Category', 'Purchase Price', 'Selling Price', 'Stock Qty', 'Supplier', 'Date', 'Reference'],
  ['BRK001', 'Brake Pads Front', 'Toyota', 'Brakes', 4500, 6500, 50, 'Al Salam Trading', '15/01/2024', 'INV-001'],
  ['FLT002', 'Oil Filter', 'BMW', 'Filters', 1200, 1800, 200, 'Global Spare Parts', '15/01/2024', 'INV-001'],
  ['BGT003', 'Spark Plug', 'Mercedes', 'Engine', 800, 1500, 150, 'Al Salam Trading', '20/02/2024', 'INV-002'],
  ['BRK004', 'Clutch Kit', 'Hyundai', 'Clutch', 8500, 12500, 30, 'Global Spare Parts', '10/03/2024', 'INV-003'],
  ['FLT005', 'Air Filter', 'Nissan', 'Filters', 900, 1400, 180, 'Al Itqan Co', '10/03/2024', 'INV-003'],
];

const filePath2 = writeExcel(sampleData2[0], sampleData2.slice(1), 'test_import_2.xlsx');
const wb2 = XLSX.readFile(filePath2);
const sheet2 = wb2.Sheets[wb2.SheetNames[0]];
const data2 = XLSX.utils.sheet_to_json(sheet2, { header: 1 });
const parsedHeaders2 = data2[0].map(h => String(h || ''));
const parsedRows2 = data2.slice(1).map(row => {
  const obj = {};
  parsedHeaders2.forEach((h, i) => obj[h] = row[i] !== undefined ? row[i] : '');
  return obj;
});

const km2 = keywordMatchColumns(parsedHeaders2);
assertEq(km2.barcode, 0, 'EN: مطابقة الباركود');
assertEq(km2.name, 1, 'EN: مطابقة الاسم');
assertEq(km2.brand, 2, 'EN: مطابقة العلامة');
assertEq(km2.category, 3, 'EN: مطابقة التصنيف');
assertEq(km2.buyPrice, 4, 'EN: مطابقة سعر الشراء');
assertEq(km2.sellPrice, 5, 'EN: مطابقة سعر البيع');
assertEq(km2.qty, 6, 'EN: مطابقة الكمية');
assertEq(km2.supplier, 7, 'EN: مطابقة المورد');
assertEq(km2.invoiceDate, 8, 'EN: مطابقة التاريخ');
assertEq(km2.invoiceRef, 9, 'EN: مطابقة المرجع');

// Test 8: تحليل بيانات رقمية لتاريخ Excel
console.log('\n--- اختبار 8: كشف أرقام Excel التسلسلية للتواريخ ---');
const excelSerialDates = [45292, 45345, 45408, 45470, 45531, 45592]; // بعض التواريخ بصيغة Excel
const analysisDate = analyzeColumn(excelSerialDates, 'Date');
assert(analysisDate.candidates.some(c => c.field === 'invoiceDate'), 'كشف أرقام Excel التسلسلية كتواريخ');

// Test 9: ملف برؤوس فرنسية
console.log('\n--- مجموعة 3: ملف برؤوس فرنسية ---');
const sampleData3 = [
  ['Code', 'Désignation', 'Marque', 'Catégorie', 'Prix Achat', 'Prix Vente', 'Quantité', 'Fournisseur', 'Date Facture', 'Réf'],
  ['DIS001', 'Disque de frein', 'Renault', 'Frein', 3500, 5500, 40, 'Fournitures Auto SA', '15/01/2024', 'F001'],
  ['AMP002', 'Ampoule phare', 'Peugeot', 'Éclairage', 300, 600, 200, 'Pièces Auto Plus', '20/02/2024', 'F001'],
];

const filePath3 = writeExcel(sampleData3[0], sampleData3.slice(1), 'test_import_3.xlsx');
const wb3 = XLSX.readFile(filePath3);
const sheet3 = wb3.Sheets[wb3.SheetNames[0]];
const data3 = XLSX.utils.sheet_to_json(sheet3, { header: 1 });
const parsedHeaders3 = data3[0].map(h => String(h || ''));

const km3 = keywordMatchColumns(parsedHeaders3);
assertEq(km3.barcode, 0, 'FR: مطابقة الكود');
assertEq(km3.name, 1, 'FR: مطابقة التسمية');
assertEq(km3.brand, 2, 'FR: مطابقة الماركة');
assertEq(km3.category, 3, 'FR: مطابقة الفئة');
assertEq(km3.buyPrice, 4, 'FR: مطابقة سعر الشراء');
assertEq(km3.sellPrice, 5, 'FR: مطابقة سعر البيع');
assertEq(km3.qty, 6, 'FR: مطابقة الكمية');
assertEq(km3.supplier, 7, 'FR: مطابقة المورد');
assertEq(km3.invoiceDate, 8, 'FR: مطابقة تاريخ الفاتورة');

// Test 10: ملف برؤوس مختلطة عربي/إنجليزي (حالة واقعية)
console.log('\n--- مجموعة 4: ملف برؤوس مختلطة (حالة واقعية) ---');
const sampleData4 = [
  ['Code', 'Product', 'سعر البيع', 'الكمية', 'Total', 'Date'],
  ['OIL-001', 'زيت محرك 10W40', 8500, 120, 1020000, '2024/01/15'],
  ['OIL-002', 'زيت جير ATF', 12000, 80, 960000, '2024/01/15'],
  ['FLT-001', 'فلتر زيت', 2500, 300, 750000, '2024/02/20'],
  ['BRK-001', 'فردان فرامل', 6500, 100, 650000, '2024/03/10'],
  ['BGT-001', 'بطارية 60 أمبير', 18000, 50, 900000, '2024/03/10'],
];

const filePath4 = writeExcel(sampleData4[0], sampleData4.slice(1), 'test_import_4.xlsx');
const wb4 = XLSX.readFile(filePath4);
const sheet4 = wb4.Sheets[wb4.SheetNames[0]];
const data4 = XLSX.utils.sheet_to_json(sheet4, { header: 1 });
const parsedHeaders4 = data4[0].map(h => String(h || ''));
const parsedRows4 = data4.slice(1).map(row => {
  const obj = {};
  parsedHeaders4.forEach((h, i) => obj[h] = row[i] !== undefined ? row[i] : '');
  return obj;
});

const analysis4 = {};
for (const h of parsedHeaders4) {
  const colVals = parsedRows4.map(r => r[h]);
  analysis4[h] = analyzeColumn(colVals, h);
}

const km4 = keywordMatchColumns(parsedHeaders4);
assertEq(km4.barcode, 0, 'مختلط: مطابقة الكود');
assertEq(km4.sellPrice, 2, 'مختلط: مطابقة سعر البيع');
assertEq(km4.qty, 3, 'مختلط: مطابقة الكمية');
assertEq(km4.invoiceDate, 5, 'مختلط: مطابقة التاريخ');

const autoMapping4 = smartDetectMapping(parsedHeaders4, parsedRows4, analysis4);
assert(autoMapping4.barcode === 0, 'مختلط: باركود ← 0');
assert(autoMapping4.name === 1, 'مختلط: اسم ← 1 (Product يحتوي على نصوص)');
assert(autoMapping4.sellPrice === 2, 'مختلط: سعر بيع ← 2');
assert(autoMapping4.qty === 3, 'مختلط: كمية ← 3');
assert(autoMapping4.invoiceDate === 5, 'مختلط: تاريخ ← 5');

// Clean up test files
console.log('\n--- تنظيف ---');
[filePath1, filePath2, filePath3, filePath4].forEach(f => {
  try { fs.unlinkSync(f); } catch {}
});
fs.rmdirSync(testDir);
console.log('  تم حذف ملفات الاختبار');

// ===================================================================
// النتائج النهائية
// ===================================================================
console.log('\n============================================');
console.log('النتائج النهائية');
console.log('============================================');
results.forEach(r => console.log(r));
console.log(`\n✅ نجح: ${testsPassed}  ❌ فشل: ${testsFailed}  المجموع: ${testsPassed + testsFailed}`);
console.log('============================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
