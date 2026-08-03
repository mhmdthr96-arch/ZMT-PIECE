window.AIAgent = {
  PROVIDERS: {
    gemini: {
      label: 'Google Gemini',
      models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      defaultModel: 'gemini-2.0-flash',
      apiBase: 'https://generativelanguage.googleapis.com/v1beta/models/',
      chatEndpoint(model) { return `${this.apiBase}${model}:generateContent`; },
      headers(apiKey) { return { 'Content-Type': 'application/json' }; },
      auth(apiKey) { return { key: apiKey }; },
      buildBody(prompt, systemInstruction) {
        const body = {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096, topP: 0.95 },
        };
        if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
        return body;
      },
      extractText(data) {
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      },
    },
    openai: {
      label: 'OpenAI (ChatGPT)',
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      defaultModel: 'gpt-4o-mini',
      apiBase: 'https://api.openai.com/v1/',
      chatEndpoint() { return `${this.apiBase}chat/completions`; },
      headers(apiKey) { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }; },
      auth(apiKey) { return {}; },
      buildBody(prompt, systemInstruction) {
        const messages = [];
        if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
        messages.push({ role: 'user', content: prompt });
        return {
          model: this.defaultModel,
          messages,
          temperature: 0.1,
          max_tokens: 4096,
        };
      },
      extractText(data) {
        return data?.choices?.[0]?.message?.content || '';
      },
    },
    kimi: {
      label: 'Kimi (Moonshot AI)',
      models: ['kimi-k3', 'kimi-k2.7-code-highspeed', 'kimi-k2.7-code', 'kimi-k2.6'],
      defaultModel: 'kimi-k3',
      apiBase: 'https://api.moonshot.ai/v1/',
      chatEndpoint() { return `${this.apiBase}chat/completions`; },
      headers(apiKey) { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }; },
      auth(apiKey) { return {}; },
      buildBody(prompt, systemInstruction) {
        const messages = [];
        if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
        messages.push({ role: 'user', content: prompt });
        return {
          model: this.defaultModel,
          messages,
          temperature: 0.1,
          max_tokens: 4096,
        };
      },
      extractText(data) {
        return data?.choices?.[0]?.message?.content || '';
      },
    },
    groq: {
      label: 'Groq (LPU Inference)',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
      defaultModel: 'llama-3.3-70b-versatile',
      apiBase: 'https://api.groq.com/openai/v1/',
      chatEndpoint() { return `${this.apiBase}chat/completions`; },
      headers(apiKey) { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }; },
      auth(apiKey) { return {}; },
      buildBody(prompt, systemInstruction) {
        const messages = [];
        if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
        messages.push({ role: 'user', content: prompt });
        return {
          model: this.defaultModel,
          messages,
          temperature: 0.1,
          max_tokens: 4096,
        };
      },
      extractText(data) {
        return data?.choices?.[0]?.message?.content || '';
      },
    },
    custom: {
      label: 'Custom / Other API',
      headers(apiKey) { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }; },
      auth(apiKey) { return {}; },
      buildBody(prompt, systemInstruction) {
        const messages = [];
        if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
        messages.push({ role: 'user', content: prompt });
        return { model: this.defaultModel, messages, temperature: 0.1, max_tokens: 4096 };
      },
      extractText(data) {
        return data?.choices?.[0]?.message?.content || '';
      },
    },
  },

  _storageKey(provider) { return 'zmt_ai_key_' + provider; },

  async getProvider() {
    return (await this.getStored('zmt_ai_provider')) || 'gemini';
  },

  async getStored(key) {
    const val = localStorage.getItem(key);
    if (!val) return '';
    const dec = await CryptoUtils.loadSecurely(key);
    return dec || val;
  },

  async saveStored(key, value) {
    await CryptoUtils.saveSecurely(key, value);
  },

  async clearStored(key) {
    await CryptoUtils.saveSecurely(key, '');
    localStorage.removeItem(key);
  },

  async getApiKey(provider) {
    provider = provider || await this.getProvider();
    return this.getStored(this._storageKey(provider));
  },

  async saveApiKey(provider, key) {
    await this.saveStored(this._storageKey(provider), key);
  },

  async clearApiKey(provider) {
    await this.clearStored(this._storageKey(provider));
  },

  async isConfigured(provider) {
    provider = provider || await this.getProvider();
    const encrypted = localStorage.getItem(this._storageKey(provider));
    if (!encrypted) return false;
    const key = await CryptoUtils.loadSecurely(this._storageKey(provider));
    return key && key.length > 0;
  },

  async _call(prompt, systemInstruction) {
    const provider = await this.getProvider();
    const cfg = this.PROVIDERS[provider];
    if (!cfg) throw new Error('مزود AI غير معروف: ' + provider);

    const apiKey = await this.getApiKey(provider);
    if (!apiKey) {
      const names = { gemini: 'Gemini', openai: 'OpenAI', kimi: 'Kimi', groq: 'Groq', custom: 'Custom' };
      throw new Error('مفتاح ' + (names[provider] || provider) + ' API غير مضبوط. الرجاء إدخاله في الإعدادات.');
    }

    if (provider === 'custom' || provider === 'kimi') {
      const baseUrl = await this.getStored('zmt_ai_base_url');
      if (baseUrl) cfg.apiBase = baseUrl.replace(/\/+$/, '') + '/';
    }

    const errors = [];
    const tryModel = async (model, timeoutMs = 120000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = cfg.chatEndpoint(model);
        const body = cfg.buildBody(prompt, systemInstruction);
        body.model = model;

        const authParams = cfg.auth(apiKey);
        let fullUrl = url;
        if (authParams.key) {
          fullUrl += (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(authParams.key);
        }

        const hdrs = cfg.headers(apiKey);
        const res = await fetch(fullUrl, { method: 'POST', headers: hdrs, body: JSON.stringify(body), signal: controller.signal });
        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json();
          const text = cfg.extractText(data);
          this._activeProvider = provider;
          this._activeModel = model;
          return { ok: true, text };
        }

        const errText = await res.text();
        let msg = '';
        try {
          const err = JSON.parse(errText);
          msg = err.error?.message || JSON.stringify(err);
        } catch { msg = errText; }
        return { ok: false, model, msg };
      } catch (netErr) {
        clearTimeout(timer);
        return { ok: false, model, msg: netErr.name === 'AbortError' ? 'Timeout (' + (timeoutMs / 1000) + 's)' : 'Network error: ' + netErr.message };
      }
    };

    const isQuotaError = (msg) => /quota|rate.limit|insufficient.?(balance|quota)|limit.*exceeded|suspended/i.test(msg);
    const isNetworkError = (msg) => /Network error|Timeout|Failed to fetch/i.test(msg);

    const tryWithFallback = async () => {
      for (let i = 0; i < cfg.models.length; i++) {
        let result = await tryModel(cfg.models[i]);
        if (result.ok) return result.text;
        errors.push(`${cfg.models[i]}: ${result.msg}`);
        if (i === 0 && isNetworkError(result.msg)) {
          result = await tryModel(cfg.models[0]);
          if (result.ok) return result.text;
          errors.push(`${cfg.models[0]} (retry): ${result.msg}`);
        }
        if (!isQuotaError(result.msg) && !isNetworkError(result.msg)) break;
      }
      throw new Error('فشل الاتصال بـ ' + cfg.label + ':\n' + errors.join('\n'));
    };

    return tryWithFallback();
  },

  getModelInfo() {
    return {
      provider: this._activeProvider || 'unknown',
      model: this._activeModel || 'unknown',
      usedFallback: false,
    };
  },

  _extractJson(text) {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;
    try { return JSON.parse(jsonStr); }
    catch {
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try { return JSON.parse(jsonStr.slice(start, end + 1)); }
        catch {}
      }
      return null;
    }
  },

  _buildSamplePayload(headers, rows, maxSample = 50) {
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
  },

  _buildProgramHint(programName) {
    if (!programName) return '';
    const db = {
      'quickbooks': 'QuickBooks يستخدم حقولاً مثل: Name, Description, Purchase Cost, Sales Price, Quantity on Hand, Vendor, Customer, Bill Number, Invoice Number. الفواتير مخزنة في جداول منفصلة (Sales Receipt, Bill, Invoice)',
      'sage': 'Sage يستخدم: Stock Code, Description, Supplier, Customer, Qty in Stock, Unit Cost, Unit Sell Price, Invoice No, Invoice Date. الفواتير مقسمة إلى Sales Orders و Purchase Orders',
      'ciel': 'Ciel/comptabilité يستخدم: Code Article, Libellé, Prix Achat HT, Prix Vente HT, Qte, Fournisseur, Client, Num Facture, Date Facture',
      'odoo': 'Odoo/OpenERP يستخدم: Product Name, Internal Reference, Barcode, Cost Price, Sale Price, Quantity On Hand, Vendor, Customer, Invoice Number',
      'erpnext': 'ERPNext يستخدم: Item Code, Item Name, Item Group, Brand, Purchase Rate, Selling Rate, Stock Qty, Supplier, Customer',
      'peachtree': 'Peachtree/Sage 50 يستخدم: Item ID, Description, Cost Price, Unit Price, Stock Quantity, Vendor ID, Customer ID',
      'dynamics': 'Microsoft Dynamics GP/Business Central يستخدم: Item Number, Description, Unit Cost, Unit Price, Current Quantity, Vendor Number, Customer Number',
      'pastel': 'Pastel Accounting يستخدم: Stock Code, Description, Cost Price, Selling Price, Qty on Hand, Supplier, Customer',
      'excel': 'ملفات Excel غالباً تحتوي على أعمدة مباشرة مثل: كود/باركود, اسم المنتج, سعر الشراء, سعر البيع, الكمية, المورد, العميل, رقم الفاتورة, تاريخ الفاتورة',
    };
    const key = Object.keys(db).find(k => programName.toLowerCase().includes(k));
    if (key) return `البرنامج المحدد من قبل المستخدم: "${programName}". معلومة: ${db[key]}. استخدم هذه المعرفة لتحسين دقة المطابقة.\n`;
    return `البرنامج المحدد من قبل المستخدم: "${programName}". قد يكون هذا البرنامج معروفاً في السوق المحلي. ابحث في أسماء الأعمدة عن دلائل تناسب هيكل بيانات البرامج المحاسبية العربية.\n`;
  },

  SYSTEM_PROMPT_AR: `أنت خبير في استيراد وهيكلة بيانات قطع غيار السيارات.
مهمتك: تحليل أعمدة ملف المستخدم وتحديد أي عمود يمثل أي حقل من الحقول التالية:

الحقول المتاحة: barcode (الباركود/الكود), name (اسم المنتج), buyPrice (سعر الشراء), sellPrice (سعر البيع), qty (الكمية/المخزون), brand (العلامة التجارية), category (التصنيف/الفئة), supplier (المورد), customer (العميل), phone (رقم الهاتف), invoiceDate (تاريخ الفاتورة), invoiceTotal (إجمالي الفاتورة), invoiceRef (رقم الفاتورة), notes (ملاحظات), paidAmount (المبلغ المدفوع), invoiceDiscount (الخصم), unitPrice (سعر الوحدة).

تعليمات هامة:
1. حلل أسماء الأعمدة والقيم النموذجية لكل عمود
2. إذا كان العمود يحتوي على ماركات سيارات (BMW, Toyota, إلخ) فهو brand
3. إذا كان يحتوي على تصنيفات (محرك، فرامل، فلتر) فهو category
4. الأعمدة الرقمية الكبيرة (>1000) قد تكون كميات أو أسعار
5. أعمدة العملاء قد تحتوي على أسماء أشخاص أو شركات
6. أعمدة الموردين قد تحتوي على أسماء موردين
7. أرقام الهواتف تبدأ بـ 0 أو + وتحوي 7-15 رقم
8. paidAmount = المبلغ المدفوع (قد يكون أقل من إجمالي الفاتورة)
9. invoiceDiscount = الخصم على الفاتورة (رقم عشري أو نسبة)
10. unitPrice = سعر الوحدة للصنف في الفاتورة (يختلف عن buyPrice/sellPrice)

أعد JSON فقط بالهيكل التالي بدون أي نص إضافي:
{
  "mapping": {
    "barcode": "اسم_العمود_أو_null",
    "name": "...",
    "buyPrice": "...",
    "sellPrice": "...",
    "qty": "...",
    "brand": "...",
    "category": "...",
    "supplier": "...",
    "customer": "...",
    "phone": "...",
    "invoiceDate": "...",
    "invoiceTotal": "...",
    "invoiceRef": "...",
    "notes": "...",
    "paidAmount": "...",
    "invoiceDiscount": "...",
    "unitPrice": "..."
  },
  "confidence": 85,
  "notes": "ملاحظات عن التحليل"
}`,

  async analyzeData(headers, rows, programName) {
    const payload = this._buildSamplePayload(headers, rows);
    const programHint = this._buildProgramHint(programName);
    const prompt = `قم بتحليل أعمدة هذا الملف وتحديد الحقول المناسبة لكل عمود.

${programHint}أسماء الأعمدة: ${JSON.stringify(headers)}
إجمالي الصفوف: ${rows.length}

عينة القيم لكل عمود:
${JSON.stringify(payload.allSampleValues, null, 2)}

مثال من البيانات (أول 5 صفوف):
${JSON.stringify(rows.slice(0, 5), null, 2)}

أعد JSON فقط بالمطابقات كما هو موضح في التعليمات.`;

    const raw = await this._call(prompt, this.SYSTEM_PROMPT_AR);
    return this._extractJson(raw);
  },

  async analyzeSingleColumn(header, sampleValues) {
    const prompt = `قم بتحليل العمود التالي من ملف استيراد قطع غيار:

اسم العمود: "${header}"
القيم النموذجية: ${JSON.stringify(sampleValues.slice(0, 20))}

ما هو الحقل الأنسب لهذا العمود من الخيارات التالية؟
barcode, name, buyPrice, sellPrice, qty, brand, category, supplier, customer, phone, invoiceDate, invoiceTotal, invoiceRef, notes

أعد JSON فقط: { "field": "اسم_الحقل", "confidence": 0-100, "reason": "سبب التصنيف" }`;

    const raw = await this._call(prompt);
    return this._extractJson(raw);
  },

  async enhanceMapping(currentMapping, headers, rows, analysis) {
    const unmapped = Object.entries(currentMapping).filter(([, v]) => v === undefined || v === null).map(([k]) => k);
    if (unmapped.length === 0) return currentMapping;

    const prompt = `لدي ملف استيراد قطع غيار بالأعمدة التالية:
${JSON.stringify(headers, null, 2)}

المطابقات الحالية:
${JSON.stringify(currentMapping, null, 2)}

الحقول غير المطابقة بعد: ${unmapped.join(', ')}

قيم الأعمدة غير المطابقة:
${unmapped.map(f => {
  const col = headers.find((h, i) => {
    const info = analysis?.[h];
    return info?.candidates?.some(c => c.field === f);
  });
  return `- ${f}: أول أعمدة قد يناسب هو ${col || 'غير معروف'}`;
}).join('\n')}

حاول إيجاد أفضل عمود لكل حقل غير مطابق بناءً على أسماء الأعمدة.
أعد JSON فقط بالمطابقات الكاملة (كل الحقول): { "mapping": { ... } }`;

    const raw = await this._call(prompt);
    const result = this._extractJson(raw);
    if (result && result.mapping) return result.mapping;
    return currentMapping;
  },

  async validateAndCorrectMapping(mapping, headers, rows) {
    const prompt = `لدي ملف استيراد قطع غيار بالمطابقات التالية:

أسماء الأعمدة: ${JSON.stringify(headers)}
المطابقات المقترحة: ${JSON.stringify(mapping, null, 2)}
عينة بيانات (أول 3 صفوف): ${JSON.stringify(rows.slice(0, 3), null, 2)}

هل هذه المطابقات صحيحة؟ إذا كان هناك خطأ، صححه.
أعد JSON فقط: { "mapping": { ... }, "confidence": 0-100, "corrections": ["تصحيح1", ...] }`;

    const raw = await this._call(prompt);
    return this._extractJson(raw);
  },

  async processBatch(fields, rows, mapping) {
    const batchSize = 50;
    const results = [];
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const prompt = `قم بتنظيف وهيكلة بيانات قطع الغيار التالية حسب الحقول المحددة.

الحقول: ${JSON.stringify(fields)}
المطابقات: ${JSON.stringify(mapping)}
البيانات: ${JSON.stringify(batch)}

أعد JSON فقط: { "rows": [ { "barcode": "...", "name": "...", ... } ] }`;

      const raw = await this._call(prompt);
      const result = this._extractJson(raw);
      if (result && result.rows) results.push(...result.rows);
      else results.push(...batch);
    }
    return results;
  },
};
