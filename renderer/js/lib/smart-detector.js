window.SmartDetector = {
  ALL_FIELDS: [
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
    { id: 'address', ar: 'العنوان', en: 'Address' },
    { id: 'invoiceDate', ar: 'تاريخ الفاتورة', en: 'Invoice Date' },
    { id: 'invoiceTotal', ar: 'إجمالي الفاتورة', en: 'Invoice Total' },
    { id: 'invoiceRef', ar: 'رقم الفاتورة', en: 'Invoice Ref' },
    { id: 'notes', ar: 'ملاحظات', en: 'Notes' },
    { id: 'paidAmount', ar: 'المبلغ المدفوع', en: 'Paid Amount' },
    { id: 'invoiceDiscount', ar: 'الخصم', en: 'Invoice Discount' },
    { id: 'unitPrice', ar: 'سعر الوحدة', en: 'Unit Price' },
  ],

  ALL_FIELD_IDS: null,

  _init() {
    if (!this.ALL_FIELD_IDS) {
      this.ALL_FIELD_IDS = this.ALL_FIELDS.map(f => f.id);
    }
  },

  BRAND_KEYWORDS: [
    'bmw', 'mercedes', 'mercedes-benz', 'benz', 'audi', 'volkswagen', 'vw',
    'toyota', 'honda', 'nissan', 'mitsubishi', 'mazda', 'subaru', 'suzuki',
    'hyundai', 'kia', 'chevrolet', 'ford', 'dodge', 'chrysler', 'jeep',
    'renault', 'peugeot', 'citroen', 'fiat', 'alfa romeo', 'lancia',
    'volvo', 'saab', 'jaguar', 'land rover', 'range rover', 'porsche',
    'ferrari', 'lamborghini', 'maserati', 'bentley', 'rolls-royce', 'mini',
    'opel', 'vauxhall', 'seat', 'skoda', 'dacia', 'daewoo', 'chev',
    'mg', 'rover', 'lexus', 'infiniti', 'acura', 'cadillac', 'gmc',
    'ram', 'tesla', 'polestar', 'cupra', 'lynk', 'great wall', 'chery',
    'geely', 'byd', 'nio', 'xpeng', 'zeekr', 'dongfeng', 'changan',
    'hino', 'isuzu', 'iveco', 'man', 'scania', 'daf', 'volvo_truck',
    'yamaha', 'kawasaki', 'suzuki_moto', 'honda_moto', 'ktm', 'ducati',
    'piaggio', 'vespa', 'sym', 'keeway', 'zontes', 'cfmoto',
  ],

  CATEGORY_KEYWORDS: [
    'motor', 'moteur', 'engine', 'محرك',
    'brake', 'frein', 'فرامل', 'brakes',
    'light', 'phare', 'lumiere', 'lumière', 'كشافات', 'اضاءة', 'إضاءة', 'لمبة', 'مصباح',
    'filter', 'filtre', 'فلتر', 'مرشح',
    'belt', 'courroie', 'سير', 'حزام',
    'bearing', 'roulement', 'رولمان', 'رمان',
    'suspension', 'amortisseur', 'تعليق', 'ممتص', 'مساعد',
    'exhaust', 'echappement', 'عادم', 'شكمان',
    'radiator', 'radiateur', 'ردياتير', 'مبرد',
    'battery', 'batterie', 'بطارية',
    'tire', 'pneu', 'اطار', 'عجلة',
    'clutch', 'embrayage', 'كلتش', 'قابض',
    'gear', 'engrenage', 'تروس', 'جير',
    'axle', 'essieu', 'محور', 'اكسل',
    'pump', 'pompe', 'مضخة', 'طلمبة',
    'sensor', 'capteur', 'حساس',
    'valve', 'vanne', 'صمام', 'بلف',
    'gasket', 'joint', 'حشية', 'وجه',
    'seal', 'joint_etancheite', 'مانع_تسرب',
    'hose', 'tuyau', 'خرطوم',
    'wiper', 'balai', 'مساحة',
    'spark', 'bougie', 'شمعة', 'بوجي',
    'injector', 'injecteur', 'حقن',
    'turbo', 'توربو',
    'alternator', 'alternateur', 'دينامو',
    'starter', 'demarreur', 'مارش',
    'ignition', 'allumage', 'اشعال',
    'fuse', 'fusible', 'فيوز', 'صمام',
    'lamp', 'ampoule', 'لمبة', 'bulb',
    'mirror', 'retroviseur', 'مرآة',
    'glass', 'vitre', 'زجاج',
    'door', 'porte', 'باب',
    'handle', 'poignee', 'مقبض',
    'lock', 'serrure', 'قفل',
    'window', 'fenetre', 'شباك',
    'seat', 'siège', 'مقعد',
    'airbag', 'وسادة_هوائية', 'ايرباج',
    'horn', 'klaxon', 'كلاكسون',
    'compressor', 'compresseur', 'كمبريسور',
    'condenser', 'condenseur', 'كوندنيسر',
    'heater', 'chauffage', 'سخان',
    'blower', 'soufflante', 'مروحة',
    'timing', 'distribution', 'تيمين',
    'chain', 'chaine', 'سلسلة', 'جنزير',
    'tensioner', 'tendeur', 'شداد',
    'pulley', 'poulie', 'بكرة', 'بولي',
    'flywheel', 'volant', 'دولاب_محرك',
    'piston', 'مكبس', 'بيستون',
    'ring', 'segment', 'حلقة', 'سلقون',
    'cylinder', 'cylindre', 'سلندر',
    'head', 'culasse', 'وش', 'رأس_سلندر',
    'valve_engine', 'soupape', 'صمام_محرك',
    'camshaft', 'arbre_a_cames', 'عامود_كامات',
    'crankshaft', 'vilebrequin', 'عامود_مرفق',
    'oil', 'huile', 'زيت',
    'coolant', 'liquide_refroidissement', 'مبرد_محرك',
    'brake_fluid', 'liquide_frein', 'زيت_فرامل',
    'power_steering', 'direction_assistee', 'زيت_دركسون',
    'transmission_oil', 'huile_boite', 'زيت_جير',
  ],

  NAMED_ENTITIES: {
    brand: [
      'bmw', 'mercedes', 'audi', 'toyota', 'honda', 'nissan', 'hyundai',
      'kia', 'ford', 'chevrolet', 'renault', 'peugeot', 'citroen', 'fiat',
      'volkswagen', 'vw', 'mitsubishi', 'mazda', 'subaru', 'suzuki', 'lexus',
      'volvo', 'jeep', 'dodge', 'chrysler', 'opel', 'seat', 'skoda',
      'land rover', 'range rover', 'jaguar', 'porsche',
    ],
    category: [
      'motor', 'moteur', 'محرك', 'engine',
      'brake', 'frein', 'فرامل', 'brakes',
      'light', 'phare', 'lumière', 'كشافات',
      'filter', 'filtre', 'فلتر',
      'belt', 'courroie', 'سير',
      'bearing', 'roulement', 'رمان',
      'suspension', 'amortisseur', 'تعليق',
      'exhaust', 'échappement', 'عادم',
      'radiator', 'radiateur', 'ردياتير',
      'battery', 'batterie', 'بطارية',
      'tire', 'pneu', 'اطار',
      'clutch', 'embrayage', 'كلتش',
      'pump', 'pompe', 'مضخة',
      'sensor', 'capteur', 'حساس',
      'gasket', 'joint', 'حشية',
      'hose', 'tuyau', 'خرطوم',
      'wiper', 'balai', 'مساحة',
      'spark plug', 'bougie', 'شمعة',
      'injector', 'injecteur', 'حقن',
      'turbo', 'توربو',
      'alternator', 'alternateur', 'دينامو',
      'starter', 'démarreur', 'مارش',
      'valve', 'soupape', 'صمام',
      'piston', 'مكبس',
      'cylinder', 'cylindre', 'سلندر',
      'timing chain', 'chaine distribution', 'سلسلة توقيت',
    ],
  },

  selectedBrands: [],

  matchColumns(headers) {
    this._init();
    const result = {};
    const used = new Set();
    const FIELD_KEYWORDS = window.KeywordMatcher?.FIELD_KEYWORDS || {};

    const kwScore = (h, kw) => {
      if (h === kw) return 1000 - kw.length;
      if (h.startsWith(kw)) return 900 - kw.length;
      if (h.endsWith(kw)) return 800 - kw.length;
      if (h.includes(kw)) return 100 - kw.length;
      return 0;
    };

    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
      let bestMatch = null;
      let bestScore = 0;
      for (let i = 0; i < headers.length; i++) {
        if (used.has(i)) continue;
        const h = headers[i].toLowerCase().trim().replace(/[\s-]+/g, '_');
        for (const kw of keywords) {
          let score = 0;
          if (h === kw || h.includes(kw) || (kw.includes(h) && h.length >= 4)) {
            score = kwScore(h, kw);
          }
          if (score > bestScore) { bestScore = score; bestMatch = i; }
        }
      }
      if (bestMatch !== null) { result[field] = bestMatch; used.add(bestMatch); }
    }
    return result;
  },

  analyzeColumn(values, header) {
    this._init();
    const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined && v !== 0 && v !== '0');
    const valid = nonEmpty.map(v => String(v).trim());
    if (valid.length < 2) return { candidates: [], summary: 'بيانات قليلة جداً' };

    const candidates = [];
    const numVals = valid.map(v => parseFloat(v.replace(/[^0-9.\-]/g, '')));
    const numericCount = numVals.filter(v => !isNaN(v)).length;
    const isNumeric = numericCount === valid.length;

    if (isNumeric) {
      this._analyzeNumeric(valid, numVals, candidates);
    } else {
      this._analyzeText(valid, candidates);
    }

    const headerHints = this.matchHeader(header);
    for (const hint of headerHints) {
      const existing = candidates.find(c => c.field === hint.field);
      if (existing) {
        existing.score = Math.min(99, existing.score + hint.boost);
      } else {
        candidates.unshift({ field: hint.field, score: Math.min(99, hint.boost), detail: `مطابقة عنوان: ${header}` });
      }
    }

    const added = new Set();
    for (const f of this.ALL_FIELD_IDS) {
      if (!candidates.find(c => c.field === f)) {
        added.add(f);
      }
    }
    for (const f of added) {
      candidates.push({ field: f, score: 5, detail: '' });
    }

    candidates.sort((a, b) => b.score - a.score);
    return { candidates, summary: this.getSummary(candidates) };
  },

  _analyzeNumeric(valid, numVals, candidates) {
    const floats = numVals.filter(v => !isNaN(v));
    const avg = floats.reduce((s, v) => s + v, 0) / floats.length;
    const max = Math.max(...floats);
    const min = Math.min(...floats);
    const allIntegers = floats.every(v => Number.isInteger(v) || v === Math.floor(v));
    const hasDecimals = floats.some(v => v !== Math.floor(v));
    const unique = new Set(floats).size;

    if (avg > 1000000 && allIntegers) {
      candidates.push({ field: 'qty', score: 50, detail: `أعداد كبيرة ${avg.toFixed(0)}` });
      candidates.push({ field: 'invoiceTotal', score: 75, detail: `إجمالي فاتورة (${avg.toFixed(0)})` });
      return;
    }
    if (avg > 100000) {
      candidates.push({ field: 'invoiceTotal', score: 70, detail: `قيمة كبيرة (${avg.toFixed(0)})` });
    }
    if (hasDecimals || (!allIntegers && avg > 10)) {
      candidates.push({ field: 'unitPrice', score: 40, detail: `قيم عشرية قد تكون سعر وحدة` });
      candidates.push({ field: 'sellPrice', score: 65, detail: `قيم عشرية (متوسط ${avg.toFixed(2)})` });
      candidates.push({ field: 'buyPrice', score: 50, detail: `احتمال سعر شراء` });
      if (avg > 100000) {
        candidates.push({ field: 'invoiceTotal', score: 75, detail: `مجموع فاتورة` });
      }
    }
    if (allIntegers && unique > 1) {
      if (avg < 100000) {
        candidates.push({ field: 'qty', score: 85, detail: `أعداد صحيحة (متوسط ${avg.toFixed(0)})` });
      }
      if (avg < 50 && avg > 0) {
        candidates.push({ field: 'buyPrice', score: 45, detail: `أعداد صحيحة صغيرة` });
      }
      if (avg > 40000 && avg < 60000 && max - min > 30) {
        candidates.push({ field: 'invoiceDate', score: 55, detail: `احتمال تواريخ (أرقام Excel تسلسلية)` });
      }
    }
    if (avg >= 50 && avg <= 100000 && allIntegers) {
      candidates.push({ field: 'sellPrice', score: 45, detail: `قيم متوسطة (${avg.toFixed(0)})` });
    }
    if (floats.length > 0 && max - min === 0 && allIntegers) {
      candidates.push({ field: 'qty', score: 30, detail: 'كل القيم متساوية' });
    }
  },

  _analyzeText(valid, candidates) {
    const lengths = valid.map(v => v.length);
    const avgLen = lengths.reduce((s, v) => s + v, 0) / lengths.length;
    const hasSpaces = valid.filter(v => /\s/.test(v)).length;
    const allShortCodes = valid.every(v => v.length >= 3 && v.length <= 30 && /^[A-Za-z0-9\-_/.]+$/.test(v));
    const mixedAlphaNum = valid.filter(v => /[A-Za-z]/.test(v) && /[0-9]/.test(v)).length;
    const hasLetters = valid.filter(v => /[A-Za-z\u0600-\u06FF]/.test(v)).length;
    const onlyDigits = valid.every(v => /^[0-9]+$/.test(v));
    const arabicCount = valid.filter(v => /[\u0600-\u06FF]/.test(v)).length;
    const phoneLike = valid.filter(v => /^[\+\d\s\-\(\)]{7,20}$/.test(v)).length;
    const emailLike = valid.filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).length;
    const dateLike = valid.filter(v => /^\d{2,4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,4}$/.test(v) || /^\d{8}$/.test(v) || !isNaN(Date.parse(v))).length;

    if (allShortCodes && mixedAlphaNum / valid.length > 0.3) {
      candidates.push({ field: 'barcode', score: 90, detail: 'رموز أبجدية رقمية قصيرة' });
    }
    if (onlyDigits && valid.every(v => v.length >= 5 && v.length <= 20)) {
      const brandHits = this.countHits(valid, this.selectedBrands.length ? this.selectedBrands : this.BRAND_KEYWORDS);
      if (brandHits / valid.length < 0.1) {
        candidates.push({ field: 'barcode', score: 75, detail: 'أرقام فقط (باركود)' });
      }
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

    const searchBrands = this.selectedBrands.length ? this.selectedBrands : this.BRAND_KEYWORDS;
    const brandHits = this.countHits(valid, searchBrands);
    if (brandHits / valid.length > 0.25) {
      candidates.push({ field: 'brand', score: Math.min(90, Math.round(70 + brandHits / valid.length * 25)), detail: `يحتوي على علامات تجارية (${brandHits}/${valid.length})` });
    } else if (brandHits / valid.length > 0.1) {
      candidates.push({ field: 'brand', score: 50, detail: `بعض القيم تشبه علامات تجارية (${brandHits}/${valid.length})` });
    }

    const catHits = this.countHits(valid, this.CATEGORY_KEYWORDS);
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

    if (candidates.length === 0 || candidates.every(c => c.score < 30)) {
      candidates.push({ field: 'name', score: 40, detail: 'نصوص غير مصنفة' });
      if (hasLetters / valid.length > 0.5) {
        candidates.push({ field: 'notes', score: 25, detail: 'ملاحظات' });
      }
    }
    if (candidates.every(c => !['barcode', 'name', 'invoiceRef'].includes(c.field)) && allShortCodes) {
      candidates.push({ field: 'barcode', score: 30, detail: 'احتمال باركود' });
    }
  },

  matchHeader(header) {
    if (!header || header === '') return [];
    const h = String(header).toLowerCase().trim().replace(/[_\-\s]+/g, '');
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
      paidAmount: ['paid', 'payment', 'montant_paye', 'verse', 'مدفوع', 'المدفوع', 'rest', 'restant'],
      invoiceDiscount: ['discount', 'remise', 'rabais', 'reduction', 'خصم', 'تخفيض'],
      unitPrice: ['unit_price', 'prix_unitaire', 'price_unit', 'سعر_الوحدة', 'سعر_القطعة', 'pu'],
    };
    const results = [];
    for (const [field, keywords] of Object.entries(map)) {
      for (const kw of keywords) {
        const k = kw.toLowerCase().replace(/[_\-\s]+/g, '');
        if (h === k || h.includes(k) || k.includes(h)) {
          results.push({ field, boost: 25 });
          break;
        }
      }
    }
    return results;
  },

  countHits(values, keywords) {
    let hits = 0;
    for (const v of values) {
      const lower = v.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) { hits++; break; }
      }
    }
    return hits;
  },

  getSummary(candidates) {
    if (candidates.length === 0) return 'غير معروف';
    const top = candidates[0];
    if (top.score >= 80) return `← ${this.fieldLabel(top.field)} (ثقة عالية)`;
    if (top.score >= 55) return `← ${this.fieldLabel(top.field)} (ثقة متوسطة)`;
    return `ربما ${this.fieldLabel(top.field)}`;
  },

  fieldLabel(field) {
    const f = this.ALL_FIELDS.find(x => x.id === field);
    return f ? f.ar : field;
  },
};
SmartDetector._init();
