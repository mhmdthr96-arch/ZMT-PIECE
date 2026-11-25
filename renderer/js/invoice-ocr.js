/* ============================================================
   ZMT PIECE — Smart Add (Invoice OCR)
   Parses PDFs (text layer) and images (OCR) into line items,
   then opens a F1-like preview for editing.
   Engine: local Tesseract.js only — fully offline, no cloud calls,
   no API keys and no CDN fallback. Progress and cancellation are
   reported to the caller while a file is being read.
   ============================================================ */
(function () {
  'use strict';

  // ---------- number parsing (FR "50,00" / US "1,234.56" / "1 234,56") ----------
  const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
  function toLatinDigits(s) {
    return String(s).replace(/[٠-٩۰-۹]/g, (ch) => AR_DIGITS[ch] || ch).replace(/ /g, ' ').replace(/[  _ ]/g, ' ');
  }
  // Thin/light strokes make Tesseract read zero as the letter O ("15O,00",
  // "6,300.OO", "1OO"). Fold O/o to 0 only inside whitespace-delimited
  // tokens that already contain a digit, so words like "BOUCHON" survive.
  // Char-for-char: indexes into the original line stay valid for name slicing.
  function foldOcrDigits(s) {
    const str = String(s || '');
    if (!/[Oo]/.test(str)) return str;
    const chars = str.split('');
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] !== 'O' && chars[i] !== 'o') continue;
      let a = i;
      while (a > 0 && !/\s/.test(chars[a - 1])) a--;
      let b = i;
      while (b < chars.length && !/\s/.test(chars[b])) b++;
      const token = str.slice(a, b);
      if (!/\d/.test(token)) continue;
      const prev = chars[i - 1] || '';
      const next = chars[i + 1] || '';
      if (/[\d.,]/.test(prev) || /[\d.,]/.test(next)) chars[i] = '0';
    }
    return chars.join('');
  }
  function parseAmount(raw) {
    if (raw == null) return NaN;
    let s = foldOcrDigits(toLatinDigits(raw)).trim();
    if (!s) return NaN;
    s = s.replace(/(€|\$|DA|Fcfa|CFA)/gi, ' ').replace(/[^\d.,]/g, ' ').trim();
    if (!s) return NaN;
    // thousands spaces: "1 234" -> "1234"
    s = s.replace(/\s+/g, '');
    const hasDot = s.includes('.');
    const hasComma = s.includes(',');
    if (hasDot && hasComma) {
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastDot > lastComma) s = s.replace(/,/g, ''); // US: 1,234.56
      else s = s.replace(/\./g, '').replace(',', '.'); // FR: 1.234,56
    } else if (hasComma) {
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        s = parts[0] + '.' + parts[1]; // FR decimal: 50,00 -> 50.00
      } else if (parts.length > 2) {
        s = parts.join(''); // 1,234,567 thousands
      } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
        s = parts[0] + parts[1]; // 1,000 thousands
      } else {
        s = parts[0] + '.' + parts[1];
      }
    } else if (hasDot) {
      const parts = s.split('.');
      if (parts.length > 2) s = parts.join(''); // 1.234.567 thousands
    }
    const v = parseFloat(s);
    return isFinite(v) ? v : NaN;
  }

  // ---------- table parser ----------
  // Header/footer of invoices — never products (N° FACT-2026-0030, dates,
  // client block, totals). Text is OCR output, so be tolerant of split words.
  const SKIP_LINE_RE = /(fact(ure|e|a)?\s*n[°ºo]|fact[-\s]?202|proforma|facturation|échéance|ech[ée]ance|destinataire|siret|num[ée]ro de tva|net\s+[ãà]?\s*payer|total\s+[ãà]\s+payer|total\s+net|total\s+facture|total\s+en\s+euros|tva\s*\d*\s*%|montant\s+pay[ée]|reste\s*:|total\s*ttc|total\s*ht|tva\s*\(|iban|swift|bic|t[ée]l[ée]?phone|adresse|nif\s*:|cachet|signature|document\s+sans\s+valeur|zmt\s+piece|lu\s+et\s+approuv[ée]|sans\s+valeur\s+commerciale|client\s*:|d[ée]signation\s+quantit|invoice\s*no|\bheure\b|\bdate\b)/i;
  // Contact/address header block. OCR can split the table labels into separate
  // lines, so these lines must be ignored even when the table header is not
  // recognized ("Tél: 06 ..." + a total must never become qty=6 / price=121).
  const META_LINE_RE = /(\bt[ée]l(?:[ée]phone)?\s*:|\bphone\s*:|\btel(?:efone)?\s*:|\bt[ée]l(?:[ée]phone)?\s+\d{2}\b|\btel(?:efone)?\s+\d{2}\b|\bphone\s+\d{2}\b|\b(e-?mail|site\s*web|n[°º]\s*siren|siren)\s*:)/i;
  const ADDRESS_META_RE = /^\s*\d{1,4}\s+(avenue|av\.?|rue|boulevard|bd\.?|impasse|place|chemin|all[ée]e|route)\b/i;
  const NON_PRODUCT_NAME_RE = /(^|\s)(tva|siren|siret|iban|swift|bic|telephone|téléphone|paris|toulouse|marseille|facture|client|vendeur|montant|total)(\s|$)/i;
  const MONTHS_RE = /\b(janv|f[ée]vr|mars|avr|mai|juin|juill|ao[ûu]t|sept|oct|nov|d[ée]c)\b/i;
  const SKIP_NAME_RE = /^(total|tva|montant|sous.?total|rest[eé]|merci|conditions?|page\s*\d+|net|heure|date|facture|proforma|t[ée]l|tel|t[ée]l[ée]phone|telephone|client|debitor|adresse|email|site)$/i;
  // Arabic VENTE-COMPTOIR invoices: header / summary / meta lines. These must
  // never become products. Header columns (left→right in the photo):
  // الرقم | الصنف | العلب | المحتوى | القطع | سعر الوحدة | المجموع
  const AR_HEADER_TOKENS = ['العلب', 'المحتوى', 'القطع', 'المجموع', 'الرقم', 'الصنف', 'سعر', 'الوحدة', 'الكمية', 'البيان', 'المنتج'];
  const AR_FOOTER_RE = /(مبلغ\s*الوصل|المبلغ\s*المدفوع|الدين\s*(القديم|الجديد)|عدد\s*(العلب|القطع|المبلغ|الأصناف)|مجموع\s*(الفاتورة|المبلغ)|الاجمالي|الإجمالي|عزيزي\s+الزبون|تأكد\s+من\s+سلعتك|مسدد|مسد|مدفوع|المبلغ\s*المتبقي|الباقي)/;
  const AR_SKIP_RE = /(الزبون|الهاتف|العنوان|سند\s*رقم|التاريخ|الوادي|VENTE[\s-]*COMPTOIR|الصفحة|رقم\s*الفاتورة|اسم\s*المور|المور[ّد]?)/;
  function isArabicHeaderLine(line) {
    const s = String(line || '');
    if (!/[\u0600-\u06FF]/.test(s)) return false;
    let hits = 0;
    for (const t of AR_HEADER_TOKENS) if (s.includes(t)) hits++;
    // Compact table header: at least three column labels at once.
    return hits >= 3;
  }
  function isArabicFooterLine(line) {
    const s = String(line || '').trim();
    if (AR_FOOTER_RE.test(s)) return true;
    // A summary amount standing alone ("33 223.00") is the printed total,
    // never a product. Small wrapped tails ("09") are NOT totals.
    if (/^\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{2})?$/.test(s)) {
      const v = parseAmount(s);
      if (isFinite(v) && v >= 1000) return true;
    }
    if (/^[^\d]{1,12}\s+\d{4,}(?:[.,]\d{2})?$/.test(s) && s.length <= 20 && /[\u0600-\u06FF]/.test(s)) return true;
    return false;
  }
  function isArabicSkipLine(line) {
    const s = String(line || '').trim();
    if (!s) return true;
    if (AR_FOOTER_RE.test(s)) return true;
    if (/VENTE[\s-]*COMPTOIR/i.test(s)) return true;
    // Invoice meta (date/phone/address/invoice number) is never a product,
    // even when an Arabic word is followed by digits ("الواديء 12:25...").
    if (/(التاريخ|الهاتف|العنوان|سند\s*رقم|الصفحة|رقم\s*الفاتورة)/.test(s)) return true;
    if (AR_SKIP_RE.test(s) && !/[\u0600-\u06FF]{3,}\s+\d{2,}/.test(s)) return true;
    return false;
  }
  const HEADER_RE = /(d[ée]signation|d[ée]scription|article|libell[ée]?|produit|prestation)/i;
  const FOOTER_RE = /(sous[\s-]*total\s*ht|net\s+[ãà]\s*payer|montant\s+pay|total\s+[ãà]\s*payer|total\s+net|total\s+facture|total\s+en\s+euros|montant\s+ht|tva\s*[ãà]?\s*\(|tva\s*\d*\s*%|total\s*(ht|ttc|tva)|cachet|signature|lu\s+et\s+approuv)/i;
  // A product named "mon produit" must not become a table header. Header text
  // is OCR output, so be tolerant of accents, wrapped words and digit/letter
  // confusions ("DESI GNATION", "DESIGNAT1ON") while still rejecting money
  // rows and product lines.
  function normalizeHeaderText(line) {
    return String(line || '')
      .toLowerCase()
      .replace(/0/g, 'o').replace(/1/g, 'i').replace(/5/g, 's')
      .replace(/6/g, 'g').replace(/8/g, 'b')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z]/g, '');
  }
  // OCR drops or substitutes accent letters ("D?SIGNATION", "D SIGNATION"),
  // so compare labels with the vowels removed as well.
  function withoutVowels(s) { return String(s || '').replace(/[aeiouy]/g, ''); }
  const PRODUCT_LABELS = ['designation', 'description', 'article', 'libelle', 'produit', 'prestation'];
  function isHeaderLine(line) {
    if (/[€$]/.test(line) || /\d+[.,]\d{2}/.test(line)) return false;
    const nh = normalizeHeaderText(line);
    if (!nh) return false;
    if (nh === 'description' || nh === 'designation') return true;
    const nhSlim = withoutVowels(nh);
    const hasProductLabel = PRODUCT_LABELS.some((w) => nh.includes(w) || nhSlim.includes(withoutVowels(w)));
    if (!hasProductLabel) return false;
    if (nh.includes('designation') || nhSlim.includes(withoutVowels('designation'))) return true;
    const colWords = ['qte', 'quantite', 'prix', 'montant', 'total', 'unite', 'unit', 'tva', 'ht', 'ttc'];
    return colWords.filter((w) => nh.includes(w)).length >= 2;
  }
  // Standalone column labels that OCR can emit as their own lines above a
  // column-wise table ("QT?", "PRIX", "UNITAIRE", "TOTAL", "Prix unitaire
  // HT"). They are never products. A trailing HT/TTC/TVA qualifier on the
  // price/total label is part of the label, not of a product name.
  const COLUMN_HEADER_RE = /^(qt[eé]?|qty|qnt|quantit[eé]?|prix(?:\s+unitai?re)?(?:\s+ht)?|p\.?u\.?|unit[eé]?|unitai?re(?:\s+ht)?|total.*|montant.*|tva.*|ht|ttc)$/i;
  function isColumnHeader(line) {
    const t = String(line || '').trim();
    if (!t || /\d/.test(t)) return false;
    const nh = normalizeHeaderText(t);
    if (!nh) return false;
    if (COLUMN_HEADER_RE.test(t) || COLUMN_HEADER_RE.test(nh)) return true;
    // Tolerate case/accent drift by matching on the normalized text as well.
    const stripped = t.replace(/\s+(ht|ttc|tva)$/i, '');
    return stripped !== t && (COLUMN_HEADER_RE.test(stripped) || COLUMN_HEADER_RE.test(normalizeHeaderText(stripped)));
  }
  function near(a, b) { const t = Math.max(1, Math.abs(b) * 0.02); return Math.abs(a - b) <= t; }
  // A quantity/price token must be a standalone number, not the digits of
  // a product name ("TD27", "2L/3L/5L", "98-09" stay in the name).
  function isStandaloneNumber(line, tok) {
    const before = tok.i > 0 ? line[tok.i - 1] : '';
    const after = line[tok.i + tok.raw.length] || '';
    return !/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/.test(before) && !/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/.test(after);
  }
  // Model numbers inside product names (TD27, 2L/3L/5L, 98-09, 4PRTE) must
  // not be read as quantity/price columns. A line with no money/decimal
  // amount whose digits are embedded in words is a product name.
  function looksLikeProductNameLine(line) {
    const s = String(line || '');
    if (/[€$]/.test(s) || /\bDA\b/i.test(s) || /\d[.,]\d{2}\b/.test(s)) return false;
    const tokens = s.split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;
    if (!/\d/.test(s)) return false;
    let plainNumber = false;
    for (const t of tokens) {
      if (!/\d/.test(t)) continue;
      if (/[A-Za-zÀ-ÖØ-öø-ÿ\u0600-\u06FF]/.test(t)) continue;          // TD27, 2L, 4PRTE
      if (/[-–—\/]$/.test(t)) continue;                    // wrapped "98-"
      if (/^\d{1,4}$/.test(t)) { plainNumber = true; continue; }
      return false;
    }
    if (!plainNumber) return true;
    const first = s.search(/\d/);
    return /[A-Za-zÀ-ÖØ-öø-ÿ\u0600-\u06FF]{2,}/.test(s.slice(0, first)) &&
      /[A-Za-zÀ-ÖØ-öø-ÿ\u0600-\u06FF]{2,}/.test(s.slice(first));
  }
  function isIntLike(v) {
    return isFinite(v) && Math.abs(v - Math.round(v)) < 0.001;
  }
  // Printed grand total of the invoice being parsed (0 = unknown). A line
  // total larger than it can never be a real product row.
  let _arabicPrintedTotal = 0;
  function segHasLetters(seg) {
    return /[A-Za-zÀ-ÖØ-öø-ÿ\u0600-\u06FF]{2,}/.test(String(seg || ''));
  }
  function segTextBetween(line, aTok, bTok) {
    const a = aTok ? aTok.i + aTok.raw.length : 0;
    const b = bTok ? bTok.i : line.length;
    return line.slice(a, b);
  }
  // Best (qty, price, total) triple for Arabic VENTE-COMPTOIR rows.
  // Columns: [num] name [boxes] [content] pieces price total
  // The total is the last token (or the first in fully reversed RTL output).
  // qty is the integer that multiplies the price exactly; boxes/content are
  // validated by boxes × content ≈ pieces. Model numbers inside the name
  // (30, T9, 24) never satisfy the triple, so they are not columns.
  function findArabicTriple(line, tokens) {
    const toks = tokens.filter((t) => isStandaloneNumber(line, t));
    if (toks.length < 3) return null;
    let best = null;
    let bestScore = -Infinity;
    for (let qi = 0; qi < toks.length; qi++) {
      for (let pi = 0; pi < toks.length; pi++) {
        if (pi === qi) continue;
        for (let ti = 0; ti < toks.length; ti++) {
          if (ti === qi || ti === pi) continue;
          const q = toks[qi], p = toks[pi], t = toks[ti];
          if (!(q.v > 0) || !(p.v > 0) || !(t.v > 0)) continue;
          if (!(q.v <= 100000) || !(p.v <= 1000000) || !(t.v <= 1000000000)) continue;
          // Total must sit at an end (last in visual order, first reversed).
          // A trailing single-digit noise token (",9" after the total) is
          // allowed: the real total is then second-last.
          const isEnd = ti === toks.length - 1 || ti === toks.length - 2;
          if (ti !== 0 && !isEnd) continue;
          // Small integer tokens (7, 12) are row numbers / boxes, never totals.
          if (!(t.v >= 100 || /[.,]/.test(t.raw))) continue;
          // Price must sit next to the total.
          if (Math.abs(pi - ti) !== 1) continue;
          const direct = q.v * p.v;
          let effP = p, effT = t, scaled = false;
          if (!near(direct, t.v)) {
            // Decimal-shift misreads: "6600.00" -> 660000 (total ×100) or
            // "42.00" -> 4200 (price ×100). Accept the clean qty/price and
            // correct the shifted column instead of corrupting the other.
            // The shifted column must itself be a money token (decimals,
            // >=100) — small integer tokens (12, 4) must never act as totals.
            // Price read without its dot ("28500" for 285.00 with a clean
            // total "3420.00"): correcting the price beats inventing a total.
            const kP = p.v >= 1000 && p.v % 100 === 0 && /[.,]/.test(t.raw)
              ? [100, 10].find((k) => near(q.v * (p.v / k), t.v) && p.v / k >= 1 && p.v / k <= 5000)
              : null;
            if (kP) { effP = { v: p.v / kP, i: p.i, raw: p.raw }; scaled = true; }
            else {
              const kT = t.v >= 1000
                ? [100, 10, 0.01, 0.1].find((k) => near(direct, t.v * k))
                : null;
              if (kT) { effT = { v: direct, i: t.i, raw: t.raw }; scaled = true; }
              else continue;
            }
          }
          let score = 100 - (scaled ? 8 : 0);
          if (isIntLike(q.v)) score += 25; else score -= 40;
          if (/[.,]/.test(q.raw)) score -= 20; else score += 6;
          if (/[.,]/.test(p.raw)) score += 15;
          if (isIntLike(effP.v) && effP.v >= 10) score += 5;
          if (q.v <= 1000) score += 5;
          if (q.v <= 100) score += 3;
          // qty closest to price wins (pieces, not boxes / row number).
          score -= Math.abs(qi - pi) * 2;
          if (ti === toks.length - 1) score += 10; // visual order preferred
          // Prefer a qty that is not the leading row number when another
          // identical qty sits closer to the price (12 / 12, 40 / 40).
          score += qi * 0.5;
          if (score > bestScore) {
            bestScore = score;
            best = { qTok: q, pTok: effP, tTok: effT, qi, pi, ti, toks, reversed: ti === 0, score, scaled };
          }
        }
      }
    }
    return best;
  }
  function healArabicTriple(line, tokens) {
    const toks = tokens.filter((t) => isStandaloneNumber(line, t));
    if (toks.length < 3) return null;
    const t = toks[0].i < toks[toks.length - 1].i ? toks[toks.length - 1] : toks[0];
    const ends = t.i === toks[0].i ? [toks[0], toks[1], toks[2]] : [toks[toks.length - 3], toks[toks.length - 2], t];
    const q0 = ends[0], p0 = ends[1];
    if (t.i !== toks[toks.length - 1].i) return null; // only heal visual order
    if (!(q0 && p0 && q0.v > 0 && p0.v > 0 && t.v > 0) || near(q0.v * p0.v, t.v)) return null;
    const candQ = t.v / p0.v;
    const rq = Math.round(candQ);
    if (isFinite(rq) && rq > 0 && rq !== q0.v && rq <= 100000 && near(rq * p0.v, t.v)) {
      return { qTok: { v: rq, i: q0.i, raw: q0.raw }, pTok: p0, tTok: t, qi: 0, pi: 1, ti: 2, toks, reversed: false, healed: true };
    }
    const candP = t.v / q0.v;
    const rp = Math.round(candP * 100) / 100;
    if (isFinite(rp) && rp > 0 && rp !== p0.v && near(q0.v * rp, t.v)) {
      return { qTok: q0, pTok: { v: rp, i: p0.i, raw: p0.raw }, tTok: t, qi: 0, pi: 1, ti: 2, toks, reversed: false, healed: true };
    }
    return null;
  }
  // Name for an Arabic row: text between the column chain and the previous
  // token. The chain is pieces plus up to two preceding columns (boxes,
  // content) that multiply to pieces. Anything before the chain — row number,
  // name, model number — is the name region; leading row number is stripped.
  function extractArabicName(line, triple) {
    const toks = triple.toks;
    const qPos = toks.findIndex((t) => t === triple.qTok || t.i === triple.qTok.i);
    const pPos = toks.findIndex((t) => t === triple.pTok || t.i === triple.pTok.i);
    if (qPos < 0) return '';
    if (!triple.reversed) {
      let chainStart = qPos;
      let chainProduct = triple.qTok.v;
      let chainCount = 0;
      while (chainStart > 0 && chainCount < 2) {
        const prev = toks[chainStart - 1];
        const seg = segTextBetween(line, prev, toks[chainStart]);
        if (segHasLetters(seg)) break;
        // content column: equals pieces; boxes column: boxes × content ≈ pieces.
        if (isIntLike(prev.v) && (Math.abs(prev.v - chainProduct) < 0.001 || Math.abs(prev.v * chainProduct - triple.qTok.v) < 0.001)) {
          chainProduct = Math.abs(prev.v * chainProduct - triple.qTok.v) < 0.001 ? triple.qTok.v : prev.v;
          chainStart--;
          chainCount++;
        } else break;
      }
      const chainTok = toks[chainStart];
      // Name region runs from after the row-number token (if the line starts
      // with one) up to the column chain, INCLUDING model numbers inside the
      // name ("كندر ماكسي 18 حبة", "هابي كيدز 30"). Taking only the segment
      // after the model token would keep just "حبة".
      let leftPos = 0;
      if (chainStart === 0) {
        leftPos = 0;
      } else if (chainStart === 1) {
        // toks[0] is the row number only when no letters precede it;
        // otherwise it is the boxes column and the name lies before it.
        const beforeFirst = line.slice(0, toks[0].i);
        leftPos = segHasLetters(beforeFirst) ? 0 : toks[0].i + toks[0].raw.length;
      } else {
        const beforeFirst = line.slice(0, toks[0].i);
        leftPos = segHasLetters(beforeFirst) ? 0 : toks[0].i + toks[0].raw.length;
      }
      let nameRaw = line.slice(leftPos, chainTok.i);
      // When the first token is a model number inside the name ("... 24" +
      // pieces), the segment after it is empty: widen to include it.
      if (!segHasLetters(nameRaw) && chainStart > 0) {
        nameRaw = line.slice(0, chainTok.i);
      }
      // If the name region still starts with a lone row number, strip it.
      nameRaw = nameRaw.replace(/^\s*\d{1,3}\s+(?=[\u0600-\u06FFA-Za-z])/, '');
      return nameRaw;
    }
    // Reversed (total first): name follows the boxes/content chain.
    let chainEnd = qPos;
    let chainCount = 0;
    while (chainEnd < toks.length - 1 && chainCount < 2) {
      const next = toks[chainEnd + 1];
      const seg = segTextBetween(line, toks[chainEnd], next);
      if (segHasLetters(seg)) break;
      if (isIntLike(next.v) && Math.abs(next.v - triple.qTok.v) < 0.001) {
        chainEnd++;
        chainCount++;
      } else break;
    }
    const afterTok = toks[chainEnd];
    const nextTok = chainEnd < toks.length - 1 ? toks[chainEnd + 1] : null;
    let nameRaw = segTextBetween(line, afterTok, nextTok);
    if (!segHasLetters(nameRaw) && nextTok) {
      const afterNext = chainEnd < toks.length - 2 ? toks[chainEnd + 2] : null;
      const wider = segTextBetween(line, afterTok, afterNext);
      if (segHasLetters(wider)) nameRaw = wider;
    }
    nameRaw = nameRaw.replace(/\s+\d{1,3}\s*$/, '');
    return nameRaw;
  }
  // Clean (pieces, price) pair ignoring a misread total: qty is a small
  // integer without decimals, price carries decimals. Handles both the
  // normal case (pieces, price, total) and a missing total (pieces, price).
  // A price read without its dot ("4200" for 42.00) is scaled back when the
  // scaled value is a plausible unit price.
  function cleanArabicPair(line, tokens) {
    const toks = tokens.filter((t) => isStandaloneNumber(line, t));
    if (toks.length < 2) return null;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < toks.length - 1; i++) {
      const q = toks[i], p = toks[i + 1];
      if (!(q.v > 0) || !(p.v > 0)) continue;
      if (!isIntLike(q.v) || q.v > 1000) continue;
      if (/[.,]/.test(q.raw)) continue;
      let effP = p, scaledPrice = false;
      if (!/[.,]/.test(p.raw)) {
        // Integer price token: only accept a decimal-shifted reading.
        if (!(p.v >= 1000 && p.v % 100 === 0)) continue;
        effP = { v: p.v / 100, i: p.i, raw: p.raw };
        scaledPrice = true;
      }
      if (effP.v < 1 || effP.v > 200000) continue;
      const lineTotal = q.v * effP.v;
      if (lineTotal > 200000) continue;
      let score = 50 - (scaledPrice ? 8 : 0);
      if (q.v <= 100) score += 10;
      if (isIntLike(effP.v)) score += 5;
      // Prefer the pair closest to the end (last columns), like the triple.
      score += i * 0.5;
      if (score > bestScore) {
        bestScore = score;
        // tTok is the following token when present (for name extraction),
        // otherwise the price token itself with a computed total.
        const tTok = toks[i + 2] || { v: lineTotal, i: p.i + p.raw.length, raw: '' };
        best = { qTok: q, pTok: effP, tTok, qi: i, pi: i + 1, ti: i + 2 < toks.length ? i + 2 : i + 1, toks, reversed: false, cleanPair: true };
      }
    }
    return best;
  }
  function parseArabicRowLine(line) {
    const tokens = pickNumbers(line);
    if (tokens.length < 2) return null;
    let triple = findArabicTriple(line, tokens);
    if (!triple) triple = cleanArabicPair(line, tokens);
    if (!triple) {
      const healed = healArabicTriple(line, tokens);
      // Heal only onto clean integers with a plausible line total; a heal
      // that invents 18.75 / 0.06 / qty 4000 from a bad total is rejected so
      // the numeric-cell retry can re-read the row instead.
      if (healed && isIntLike(healed.qTok.v) && healed.qTok.v <= 1000 &&
          isIntLike(healed.pTok.v) && healed.pTok.v >= 1 && healed.qTok.v * healed.pTok.v <= 200000 &&
          healed.qTok.v * healed.pTok.v >= 10) {
        triple = healed;
      } else return null;
    }
    const qty = triple.qTok.v;
    const price = triple.pTok.v;
    if (!(qty > 0) || !(price > 0)) return null;
    // Arabic VENTE rows: pieces quantity is integer; a fractional qty like
    // 2.541 is a misread total, never a product quantity.
    if (!isIntLike(qty)) return null;
    if (qty > 1000 || price > 200000) return null;
    if (price < 0.5) return null;
    if (_arabicPrintedTotal > 0 && qty * price > _arabicPrintedTotal * 1.05) return null;
    if (qty === 2026 || price === 2026) return null; // year misread as money
    const nameRaw = extractArabicName(line, triple);
    let name = nameRaw.replace(/(€|\$|\bDA\b|[-–—_|:])+/gi, ' ').replace(/\s+/g, ' ').trim();
    name = name.replace(/[.\s]+$/g, '').trim();
    if (!name || name.length < 2) return null;
    if (!/[\u0600-\u06FFA-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(name)) return null;
    // OCR footer fragments ("er \ 223.00 33 === =") are not products.
    if (/[\\=]/.test(name)) return null;
    if (/^[A-Za-z]{1,3}$/.test(name.trim())) return null;
    if (isArabicHeaderLine(name) || isArabicFooterLine(name) || isArabicSkipLine(name)) return null;
    if (/^(total|tva|montant|sous.?total)$/i.test(name)) return null;
    const verified = !triple.healed && !triple.cleanPair;
    return { name, qty, price, verified, lineTotal: qty * price };
  }
  // ---------- printed Latin table rows (Bon de Caisse, factures) ----------
  // These tables print `3,800.00` (comma thousands + dot decimals). The
  // generic tokenizer splits that into 3800 and 00, so a row band read must
  // use a money-shaped scanner: only tokens with decimals are amounts, the
  // last two are (unit price, line total), and the quantity is the small
  // standalone integer just before the unit price.
  const LATIN_MONEY_RE = /\d{1,3}(?:[ \u00A0]\d{3})+(?:[.,]\d{1,2})?|\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})/g;
  // Split a printed row band into its leading reference/SKU column and the
  // product name. The reference tokens are the same ones the name cleaner has
  // always dropped; we now keep them so Smart Add can match on Réference.
  function splitLatinName(raw) {
    let s = String(raw || '')
      .replace(/[\u200e\u200f\u061c]/g, ' ')
      .replace(/[|[\]{}_=~^\\]+/g, ' ')
      .replace(/[^\p{L}\p{N}*\/.+'()\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Leading row number ("01 ", "6] ") is the table's N° column.
    s = s.replace(/^\d{1,3}[.)\]]?\s+/, '');
    // Leading reference/SKU tokens (they carry digits) are not the name.
    let parts = s.split(' ').filter(Boolean);
    const looksRef = (t) => /^[A-Z0-9][A-Z0-9.'*\/+-]+$/i.test(t) && (/\d/.test(t) || /[\/'*]$/.test(t));
    const refParts = [];
    let guard = 0;
    let afterRef = false;
    while (parts.length > 1 && guard++ < 8) {
      const t = parts[0];
      if (looksRef(t)) { parts.shift(); refParts.push(t); afterRef = true; continue; }
      // A wrapped reference can leave a lone uppercase tail ("SN", "ZN")
      // right after a reference token.
      if (afterRef && parts.length > 2 && /^[A-Z]{1,2}$/.test(t)) { parts.shift(); continue; }
      // A reference split by OCR ("STF 722") leaves an uppercase prefix.
      if (parts.length > 3 && /^[A-Z]{2,6}$/.test(t) && /^\d{2,6}$/.test(parts[1])) {
        parts.shift();
        refParts.push(t);
        afterRef = true;
        continue;
      }
      break;
    }
    s = parts.join(' ');
    // Trailing lone digits are a misread quantity column.
    parts = s.split(' ').filter(Boolean);
    while (parts.length > 1 && /^\d{1,3}$/.test(parts[parts.length - 1])) parts.pop();
    const name = parts.join(' ').replace(/[.\s]+$/, '').trim();
    // A multi-token reference is re-joined without a space (the OCR read one
    // column as two runs); a lone token is kept verbatim.
    return { reference: refParts.join(''), name };
  }
  function cleanLatinName(raw) {
    return splitLatinName(raw).name;
  }
  // OCR often reads the French decimal dot as a thousands separator
  // ("13,000.00" -> "13.000.00"). Money tokens therefore cannot go through
  // parseAmount: the last group is the decimals, every earlier group is
  // thousands.
  function parseLatinMoney(raw) {
    const s = String(raw || '').replace(/[^\d.,\s]/g, ' ').trim();
    if (!s) return NaN;
    const parts = s.split(/[.,\s]+/).filter(Boolean);
    if (!parts.length) return NaN;
    if (parts.length === 1) return parseFloat(parts[0]);
    const last = parts[parts.length - 1];
    if (last.length <= 2) return parseFloat(parts.slice(0, -1).join('') + '.' + last);
    return parseFloat(parts.join(''));
  }
  function parseLatinRowLine(line, opts) {
    const relax = !!(opts && opts.relax);
    const s = String(line || '').trim();
    if (!s) return null;
    LATIN_MONEY_RE.lastIndex = 0;
    const money = [];
    let m;
    while ((m = LATIN_MONEY_RE.exec(s))) {
      const v = parseLatinMoney(m[0]);
      if (isFinite(v)) money.push({ v, i: m.index, raw: m[0] });
    }
    // OCR sometimes drops both separators ("3.500.00" -> "350000"). Those
    // bare integers are the amount in centimes, so they still parse as money
    // when no separated token exists.
    if (money.length < 2) {
      for (const im of s.matchAll(/(?<!\d)\d{4,9}(?!\d)/g)) {
        const v = parseInt(im[0], 10);
        if (v >= 1000) money.push({ v: v / 100, i: im.index, raw: im[0] });
      }
    }
    if (money.length < 2) return null;
    const totalTok = money[money.length - 1];
    const priceTok = money[money.length - 2];
    if (!(totalTok.v > 0) || !(priceTok.v > 0)) return null;
    const before = s.slice(0, priceTok.i);
    const ints = [...before.matchAll(/(?:^|\s)(\d{1,4})(?=\s|$)/g)];
    let qty = 0;
    let qtyAt = -1;
    for (let i = ints.length - 1; i >= 0; i--) {
      const v = parseInt(ints[i][1], 10);
      if (v > 0 && v <= 10000) {
        qty = v;
        qtyAt = ints[i].index + ints[i][0].indexOf(ints[i][1]);
        break;
      }
    }
    let total = totalTok.v;
    let price = priceTok.v;
    let verified = true;
    const tol = Math.max(0.02, total * 0.001);
    if (!(qty > 0) || Math.abs(qty * price - total) > tol) {
      // A small gap (one digit misread in the money columns) is resolved in
      // favour of quantity × unit price: on these tables the PUV is mostly
      // cleaner than the wide Montant column, and a 5-10% gap is almost
      // always a single-digit misread of one column, not a lost digit.
      const gap = total > 0 ? Math.abs(qty * price - total) / total : 1;
      if (qty > 0 && gap <= 0.10) {
        total = qty * price;
        verified = false;
      } else {
        // The unit price lost a digit ("3,800.00" -> "2,212.00") while the
        // line total is intact and divisible by the quantity. Only accept a
        // derived price of the same order of magnitude as the printed one.
        const fromTotal = qty > 0 ? total / qty : 0;
        const ratio = price > 0 ? fromTotal / price : 0;
        if (fromTotal >= 1 && fromTotal <= 1000000 &&
            Math.abs(fromTotal - Math.round(fromTotal * 100) / 100) <= 0.001 &&
            ratio >= 0.4 && ratio <= 2.5) {
          price = fromTotal;
          verified = false;
        } else {
          // Printed quantity cell unreadable: derive it from the line total.
          const derived = Math.round((total / price) * 1000) / 1000;
          if (derived > 0 && derived <= 10000 && Math.abs(derived - Math.round(derived)) <= 0.001 &&
              Math.abs(derived * price - total) <= tol) {
            qty = derived;
            qtyAt = -1;
          } else if (relax && qty > 0 && qty <= 1000) {
            // The line total lost a leading digit ("11,600.00" -> "1.600.00").
            // Trust the quantity × unit price when it is a plausible amount.
            const implied = qty * price;
            if (!(implied > 0) || implied > 20000000) return null;
            total = implied;
            verified = false;
          } else {
            return null;
          }
        }
      }
    }
    const split = splitLatinName(opts && opts.name ? opts.name : (qtyAt > 0 ? s.slice(0, qtyAt) : s.slice(0, priceTok.i)));
    const name = split.name;
    if (!name || name.length < 2) return null;
    if (!/[\p{L}]{2,}/u.test(name)) return null;
    if (/^(total|tva|montant|sous.?total|net|remise|ancien|cr[ée]dit|report)$/i.test(name)) return null;
    return { name, ...(split.reference ? { reference: split.reference } : {}), qty, price, verified, lineTotal: total };
  }
  // Build a row from two separate single-cell reads: the PUV crop carries
  // (qty, unit price) and the Montant crop the line total. The last money
  // token of each crop is used, so junk prefixes from the neighbouring
  // column ("0.09 13,000.00") are ignored.
  function cellPairLatinRow(pwText, twText, name) {
    const toks = (t) => {
      const out = [];
      LATIN_MONEY_RE.lastIndex = 0;
      let m;
      while ((m = LATIN_MONEY_RE.exec(String(t || '')))) {
        const v = parseLatinMoney(m[0]);
        if (isFinite(v) && v > 0) out.push({ v, i: m.index });
      }
      return out;
    };
    const pw = toks(pwText);
    const tw = toks(twText);
    if (!pw.length || !tw.length) return null;
    const priceTok = pw[pw.length - 1];
    const totalTok = tw[tw.length - 1];
    const price = priceTok.v;
    const total = totalTok.v;
    if (!(price > 0) || !(total > 0)) return null;
    const before = String(pwText || '').slice(0, priceTok.i);
    const ints = [...before.matchAll(/(?:^|\s)(\d{1,4})(?=\s|$)/g)];
    let qty = 0;
    for (let i = ints.length - 1; i >= 0; i--) {
      const v = parseInt(ints[i][1], 10);
      if (v > 0 && v <= 10000) { qty = v; break; }
    }
    if (!(qty > 0) || price > 1000000 || total > 20000000) return null;
    const tol = Math.max(0.02, total * 0.001);
    let verified = true;
    let lineTotal = total;
    let outPrice = price;
    if (Math.abs(qty * price - total) > tol) {
      const gap = total > 0 ? Math.abs(qty * price - total) / total : 1;
      if (gap <= 0.10) {
        lineTotal = qty * price;
        verified = false;
      } else {
        const fromTotal = total / qty;
        const ratio = price > 0 ? fromTotal / price : 0;
        if (fromTotal >= 1 && fromTotal <= 1000000 && ratio >= 0.4 && ratio <= 2.5 &&
            Math.abs(fromTotal - Math.round(fromTotal * 100) / 100) <= 0.001) {
          outPrice = fromTotal;
          verified = false;
        } else {
          return null;
        }
      }
    }
    const clean = cleanLatinName(name);
    if (!clean || clean.length < 2) return null;
    if (!/[\p{L}]{2,}/u.test(clean)) return null;
    if (/^(total|tva|montant|sous.?total|net|remise|ancien|cr[ée]dit|report)$/i.test(clean)) return null;
    return { name: clean, qty, price: outPrice, verified, lineTotal };
  }
  // Latin printed tables extracted from a PDF text layer (or any clean text):
  // the generic row parser glues footers and splits money, so scan the
  // product region (between the table header and the totals block) with
  // the money-shaped row scanner instead. Wrapping designation lines that
  // precede a data line are its head.
  function latinTextRows(text, genericRows) {
    const t = String(text || '');
    if (!t) return null;
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // Header switch: the "Reference/Designation..." line. Footers switch:
    // totals block; both bound the product region.
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/r[ée]f[ée]rence/i.test(lines[i]) && /d[ée]signation/i.test(lines[i])) { start = i + 1; break; }
    }
    if (start < 0) return null;
    let end = lines.length;
    for (let i = start; i < lines.length; i++) {
      if (/total\s+montant\s+bon/i.test(lines[i]) || /^total\s/i.test(lines[i])) { end = i; break; }
    }
    const region = lines.slice(start, end);
    if (region.length < 3) return null;
    const moneyIn = (l) => (String(l).match(/\d{1,3}(?:[ \u00A0]\d{3})+(?:[.,]\d{1,2})?|\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})/g) || []).length;
    const looksData = (l) => /^\d{1,3}\s/.test(String(l || '')) && moneyIn(l) >= 2;
    // Printed grand total reconciliation (products total, not Total G).
    let printedTotal = 0;
    {
      // The amount must sit on the *same* line as the label. A plain \s also
      // matches the newline, so "…Prix U  Total" followed by the next row
      // "1  53812-0K010/…" used to read that row's N° as the printed total
      // ("1 53812" -> 153812) and break the reconciliation below, making the
      // whole Latin lane return null for this supplier's table shape.
      const SP = '[^\\S\\r\\n]';
      const m = t.match(new RegExp('total' + SP + '+montant' + SP + '+bon' + SP + '*:?' + SP + '*([0-9][0-9 .,\\u00A0]*[0-9])', 'i')) ||
        t.match(new RegExp('total(?!' + SP + '*g\\b)' + SP + '*:?' + SP + '*([0-9][0-9 .,\\u00A0]*[0-9])', 'i'));
      if (m) printedTotal = parseLatinMoney(m[1]) || 0;
    }
    // Group region lines: a data line (N° + money) plus the preceding
    // non-money lines as its designation head.
    const rows = [];
    let head = [];
    for (const line of region) {
      if (/^(total|montant|ancien|reste|cr[ée]dit|remise|versement|nombre)/i.test(line)) continue;
      if (looksData(line)) {
        const row = parseLatinRowLine((head.length ? head.join(' ') + ' ' : '') + line) ||
          parseLatinRowLine((head.length ? head.join(' ') + ' ' : '') + line, { relax: true }) ||
          parseLatinRowLine(line) || parseLatinRowLine(line, { relax: true });
        if (row) rows.push(row);
        head = [];
      } else {
        head.push(line);
      }
    }
    if (rows.length < 3) return null;
    if (printedTotal > 0) {
      const sum = rows.reduce((s, r) => s + ((r.qty || 0) * (r.price || 0)), 0);
      // Only trust the text lane when it reconciles (or nearly) with the
      // printed products total; otherwise keep the generic rows.
      if (Math.abs(sum - printedTotal) / printedTotal > 0.06) return null;
    }
    return rows;
  }
  // Pick the (qty, unit-price) pair for a row. The last token is the line
  // total; intermediate columns may include Unité / % TVA / Total TVA
  // ("2 session 120,00 0% 0,00 240,00"), so the last three tokens are only
  // a fallback when no (qty × price ≈ total) triple checks out.
  function pickQtyPrice(line, tokens) {
    if (tokens.length < 2) return null;
    if (tokens.length === 2) return { qtyTok: tokens[0], priceTok: tokens[1], exact: false };
    const totalTok = tokens[tokens.length - 1];
    let best = null;
    const keepExact = (q, p) => {
      // Digits can occur inside a product title. The real quantity is the
      // one closest to the unit price, so do not stop at the first exact
      // triple ("CAISSON PLUS 2 ARMOIRES 2" must keep the whole title).
      if (!best || q.i > best.qtyTok.i) best = { qtyTok: q, priceTok: p, exact: true };
    };
    for (let i = 0; i <= tokens.length - 3; i++) {
      const q = tokens[i];
      if (!(q.v > 0) || !isStandaloneNumber(line, q)) continue;
      for (let j = i + 1; j <= tokens.length - 2; j++) {
        const p = tokens[j];
        if (!(p.v > 0) || !isStandaloneNumber(line, p)) continue;
        const direct = q.v * p.v;
        if (near(direct, totalTok.v)) {
          keepExact(q, p);
          continue;
        }
        // TVA column after the price (HT → TTC).
        for (let k = j + 1; k <= tokens.length - 2; k++) {
          const r = tokens[k].v;
          if (r > 0 && r < 100 && near(direct * (1 + r / 100), totalTok.v)) {
            keepExact(q, p);
            break;
          }
        }
      }
    }
    if (best) return best;
    // Thin-stroke digit misreads break (qty × price ≈ total). Heal a single
    // wrong column from the printed row total when the healed values
    // reconcile exactly — invoice arithmetic is exact by definition.
    // Quantity first (a lone qty digit is the most fragile), then unit price.
    {
      const q0 = tokens[tokens.length - 3];
      const p0 = tokens[tokens.length - 2];
      if (q0 && p0 && q0.v > 0 && p0.v > 0 && totalTok.v > 0 && !near(q0.v * p0.v, totalTok.v)) {
        const candQ = totalTok.v / p0.v;
        const rq = Math.round(candQ * 1000) / 1000;
        if (isFinite(rq) && rq > 0 && rq < 100000 && rq !== q0.v && near(rq * p0.v, totalTok.v)) {
          return { qtyTok: { v: rq, i: q0.i, raw: q0.raw }, priceTok: p0, exact: false, corrected: true };
        }
        const candP = totalTok.v / q0.v;
        const rp = Math.round(candP * 100) / 100;
        if (isFinite(rp) && rp > 0 && rp !== p0.v && near(q0.v * rp, totalTok.v)) {
          return { qtyTok: q0, priceTok: { v: rp, i: p0.i, raw: p0.raw }, exact: false, corrected: true };
        }
      }
    }
    // Standard 3-column rows (Désignation | Qté | Prix | Total).
    return { qtyTok: tokens[tokens.length - 3], priceTok: tokens[tokens.length - 2], exact: false };
  }
  // Two tokenisations: split = plain columns (US-thousands aware so
  // "6,000.00" stays one token); merged = spaced-thousands aware ("1 234,56").
  // Scoring picks the one whose (qty × price ≈ total) triple checks out.
  // Each token keeps its index in the line so model numbers INSIDE product
  // names (TD27, 2L/3L/5L 98-09) survive; only the qty/price/total columns
  // are cut from the name.
  function tokenize(re, line) {
    const out = [];
    for (const m of line.matchAll(re)) {
      const v = parseAmount(m[0]);
      if (isFinite(v)) out.push({ v, i: m.index, raw: m[0] });
    }
    return out;
  }
  // Granular number pieces. French invoices write spaced thousands as
  // "3 150,00", but OCR spaces also separate qty / price / total. A blanket
  // merge therefore turns "9 350,00" into 9,350. We generate the few
  // plausible tokenisations (with/without merging adjacent thousands groups)
  // and let the (qty × price ≈ total) check choose the right one.
  function chunkTokens(line) {
    const folded = foldOcrDigits(line);
    const out = [];
    for (const m of folded.matchAll(/\d+(?:[.,]\d+)?/g)) {
      const v = parseAmount(m[0]);
      if (isFinite(v)) out.push({ v, i: m.index, raw: m[0] });
    }
    return out;
  }
  function mergedToken(line, chunks, a, b) {
    const start = chunks[a].i;
    const end = chunks[b].i + chunks[b].raw.length;
    const raw = line.slice(start, end);
    return { v: parseAmount(raw), i: start, raw };
  }
  function canMerge(line, chunks, a, b) {
    if (b <= a) return false;
    const raw = line.slice(chunks[a].i, chunks[b].i + chunks[b].raw.length);
    return /^\d{1,3}(?: \d{3})+(?:[.,]\d+)?$/.test(raw) ||
      /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw);
  }
  function tokenizations(line, chunks) {
    if (chunks.length > 14) return [chunks];
    const results = [];
    function dfs(pos, list) {
      if (results.length >= 512) return;
      if (pos >= chunks.length) { results.push(list.slice()); return; }
      list.push(chunks[pos]);
      dfs(pos + 1, list);
      list.pop();
      for (let end = pos + 1; end < chunks.length; end++) {
        if (!canMerge(line, chunks, pos, end)) break;
        const tok = mergedToken(line, chunks, pos, end);
        if (!isFinite(tok.v)) continue;
        list.push(tok);
        dfs(end + 1, list);
        list.pop();
      }
    }
    dfs(0, []);
    return results;
  }
  function pickNumbers(line) {
    const chunks = chunkTokens(line);
    if (!chunks.length) return [];
    let best = chunks;
    let bestScore = -Infinity;
    for (const tokens of tokenizations(line, chunks)) {
      if (!tokens.length) continue;
      const pair = pickQtyPrice(line, tokens);
      let score = 0;
      if (pair && pair.exact) score += 100;
      if (tokens.length >= 2) score += 10;
      if (tokens.length === 3) score += 5;
      if (pair) {
        const name = line.slice(0, pair.qtyTok.i).trim();
        if (name.length >= 2) score += Math.min(20, name.length);
        if (Math.abs(pair.qtyTok.v) <= 100000) score += 2;
        // Money shapes decide spaced-thousands merges ("1 480.00" = 1480):
        // quantities are plain integers, prices/totals carry decimals. A
        // qty read as "480.00" with price "1" is a thousands fragment.
        if (/[.,]/.test(pair.qtyTok.raw)) score -= 18; else score += 6;
        if (/[.,]/.test(pair.priceTok.raw)) score += 12;
        // A merged qty ("9 105.00" -> 9105) means two columns were glued:
        // quantities never contain a thousands space.
        if (/\s/.test(pair.qtyTok.raw)) score -= 25;
        // Implausible prices (glued columns) lose to clean readings.
        if (pair.priceTok.v > 20000) score -= 50;
        else if (pair.priceTok.v > 5000) score -= 20;
      }
      if (tokens.length < 10) score += (10 - tokens.length) * 0.1;
      if (score > bestScore) { bestScore = score; best = tokens; }
    }
    return best;
  }
  // ---- 4-column header order (Des. | Qte | Prix | Total, any order) ----
  // detectColumnOrder reads the column order directly off the header line
  // ("Prix Quantite Designation Total") so the data rows can be cut in the
  // same order instead of guessing from the first number's position.
  const ROLE_PATTERNS = [
    ['name', /(designation|description|article|libelle|produit|prestation)/],
    ['qty', /(quantite|quantity|qte|qty|qnt)/],
    ['price', /(prix|price|unitaire|unit)/],
    ['total', /(montant|total)/],
  ];
  function detectColumnOrder(line) {
    const nh = normalizeHeaderText(line);
    if (!nh) return null;
    const found = [];
    for (const [role, re] of ROLE_PATTERNS) {
      const at = nh.search(re);
      if (at >= 0) found.push([role, at]);
    }
    if (found.length < 4) return null;
    found.sort((a, b) => a[1] - b[1]);
    const roles = found.map((f) => f[0]);
    return new Set(roles).size === 4 ? roles : null;
  }
  // Role of a standalone column label line ("Quantite", "Prix unitaire HT").
  function singleColumnRole(line) {
    const nh = normalizeHeaderText(line);
    if (!nh) return null;
    if (/^(designation|description|article|libelle|produit|prestation)/.test(nh)) return 'name';
    if (/^(quantite|quantity|qte|qty|qnt)/.test(nh)) return 'qty';
    if (/^(prix|price|unit)/.test(nh)) return 'price';
    if (/^(montant|total)/.test(nh)) return 'total';
    return null;
  }
  function parseRowsFromText(text) {
    if (!text) return [];
    _arabicPrintedTotal = (() => {
      const m = String(text).match(/مبلغ\s*الوصل?\s*:?\s*([0-9][0-9 ]*[.,][0-9]{2})/) ||
        String(text).match(/المبلغ\s*المدفوع\s*:?\s*([0-9][0-9 ]*[.,][0-9]{2})/);
      if (!m) return 0;
      const v = parseAmount(m[1]);
      return isFinite(v) && v > 100 ? v : 0;
    })();
    const lines = toLatinDigits(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = [];
    // Header-aware parsing: once the table header (DÉSIGNATION/QTÉ/PRIX/TOTAL)
    // is found, only rows until the footer (Net à payer / TVA / Total TTC)
    // are products. Invoice meta (N° FACT, dates, client block) is skipped.
    // colOrder holds the 4-column order read off the header; it is null for
    // headerless tables, where the (qty × price ≈ total) check must decide.
    let inTable = false;
    let colOrder = null;
    let pendingCols = [];
    let arabicTable = false;
    let arabicClosed = false;
    const hasHeader = lines.some(isHeaderLine) || lines.some(isArabicHeaderLine);
    // Shared helpers (also used by the headerless permutation search below).
    const cleanLineName = (raw) => {
      let name = raw.replace(/(€|\$|\bDA\b|[-–—_|:])+/gi, ' ').replace(/\s+/g, ' ').trim();
      return name.replace(/\s[×x·•]\s*$/i, '').replace(/[×·•]+\s*$/g, '').replace(/[.\s]+$/g, '').trim();
    };
    const validProductName = (name) =>
      !!name && name.length >= 2 && !SKIP_NAME_RE.test(name) && !NON_PRODUCT_NAME_RE.test(name) &&
      !/^(d[ée]signation|quantit|prix|total)$/i.test(name) &&
      /[A-Za-zÀ-ÖØ-öø-ÿ\u0600-\u06FF]{2,}/.test(name) && !/^[.\s]*[Oo]{2,}[.\s]*$/.test(name);
    // Move a leading SKU/reference column out of the product name. Two shapes
    // are recognised: a letter-prefixed SKU ("b010 Souris Optique") and a
    // "Num | Réference" table ("1 53812 0K010/TYF091LA AILE …", the hyphen
    // already folded to a space by cleanLineName). A token belongs to the
    // reference only while it carries a digit or a "/", and never when it is a
    // bare model/size token that lives inside product names ("2L/3L/5L",
    // "2M40"). Returns { reference, name }.
    const splitRowRef = (nameIn) => {
      const name = String(nameIn || '');
      const refMatch = name.match(/^([A-Za-z]{1,3}\d{3,}(?:-\d+)?)\s+(.+)$/);
      if (refMatch && refMatch[2].trim().length >= 2 &&
          !/^(d[ée]signation|quantit|prix|total)$/i.test(refMatch[2].trim())) {
        return { reference: refMatch[1], name: refMatch[2].trim() };
      }
      const toks = name.split(' ');
      const isRefTok = (t) => /[\d\/]/.test(t) &&
        !/^\d+[A-Z]{1,2}\d*$/.test(t) && !/^\d+[A-Z]{1,2}\/\d/.test(t);
      if (/^\d{1,3}$/.test(toks[0]) && toks.length > 2) {
        let n = 1;
        const picked = [];
        while (n < toks.length && picked.length < 2 && isRefTok(toks[n])) { picked.push(toks[n]); n++; }
        const rest = toks.slice(n).join(' ').trim();
        if (picked.length && rest && !/^\d/.test(rest) && validProductName(rest)) {
          return { reference: picked.join(''), name: rest };
        }
      }
      return { reference: '', name };
    };
    const makeRow = (nameRaw, qty, price) => {
      const split = splitRowRef(cleanLineName(nameRaw));
      const name = split.name;
      if (!validProductName(name)) return null;
      return { name, ...(split.reference ? { reference: split.reference } : {}), qty: qty > 1000 ? 1 : qty, price };
    };
    // Parse a 3-token row strictly by the header's column order (Total last).
    const parseByOrder = (line, tokens, order) => {
      if (!order || tokens.length !== 3) return null;
      const numericRoles = order.filter((r) => r !== 'name');
      if (numericRoles.length !== 3 || numericRoles[2] !== 'total') return null;
      const [t0, t1, t2] = tokens;
      const tokByRole = {};
      numericRoles.forEach((r, i) => { tokByRole[r] = tokens[i]; });
      const qtyTok = tokByRole.qty;
      const priceTok = tokByRole.price;
      if (!qtyTok || !priceTok) return null;
      if (!(qtyTok.v > 0) || !(priceTok.v > 0) ||
          !isStandaloneNumber(line, qtyTok) || !isStandaloneNumber(line, priceTok)) return null;
      if (!near(qtyTok.v * priceTok.v, t2.v)) return null;
      const numsBefore = order.slice(0, order.indexOf('name')).filter((r) => r !== 'name').length;
      let nameRaw;
      if (numsBefore === 0) nameRaw = line.slice(0, t0.i);
      else if (numsBefore === 1) nameRaw = line.slice(t0.i + t0.raw.length, t1.i);
      else if (numsBefore === 2) nameRaw = line.slice(t1.i + t1.raw.length, t2.i);
      else return null;
      return makeRow(nameRaw, qtyTok.v, priceTok.v);
    };
    // Headerless 4-column rows: try the 6 placements of (name, qty, price)
    // against the printed total, scored by money shapes (qty is normally a
    // small integer, the price carries decimals). The natural order wins ties.
    const parseHeaderless = (line, tokens) => {
      if (tokens.length !== 3) return null;
      const [t0, t1, t2] = tokens;
      const segs = [
        line.slice(0, t0.i),
        line.slice(t0.i + t0.raw.length, t1.i),
        line.slice(t1.i + t1.raw.length, t2.i),
      ];
      const defs = [
        { seg: 0, q: t0, p: t1 }, { seg: 0, q: t1, p: t0 },
        { seg: 1, q: t0, p: t1 }, { seg: 1, q: t1, p: t0 },
        { seg: 2, q: t0, p: t1 }, { seg: 2, q: t1, p: t0 },
      ];
      let best = null;
      let bestScore = -Infinity;
      for (const d of defs) {
        if (!(d.q.v > 0) || !(d.p.v > 0) || !near(d.q.v * d.p.v, t2.v)) continue;
        if (!isStandaloneNumber(line, d.q) || !isStandaloneNumber(line, d.p)) continue;
        const row = makeRow(segs[d.seg], d.q.v, d.p.v);
        if (!row) continue;
        let score = 0;
        if (d.seg === 0) score += 4;
        if (/[.,]/.test(d.q.raw)) score -= 18; else score += 6;
        if (/[.,]/.test(d.p.raw)) score += 12;
        if (d.p.v > d.q.v) score += 3;
        if (d.q.v <= 1000) score += 3;
        score += Math.min(10, row.name.length / 2);
        if (score > bestScore) { bestScore = score; best = row; }
      }
      return best;
    };
    for (const line of lines) {
      // Arabic VENTE-COMPTOIR table: header opens it, summary/footer closes it.
      if (isArabicHeaderLine(line)) {
        arabicTable = true;
        inTable = true;
        arabicClosed = false;
        continue;
      }
      if (isArabicFooterLine(line)) {
        if (arabicTable) arabicClosed = true;
        inTable = false;
        pendingCols = [];
        continue;
      }
      if (arabicTable && !arabicClosed) {
        // Inside the Arabic table only arithmetic-verified rows survive.
        // Latin/Arabic mixed names go through the same triple check;
        // date/meta/garbage lines are skipped, never products.
        const arRow = parseArabicRowLine(line);
        if (arRow) { rows.push(arRow); continue; }
        if (isArabicSkipLine(line) || /^\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}/.test(line) || /\d{1,2}:\d{2}(:\d{2})?/.test(line)) continue;
        continue;
      }
      if (!arabicClosed && !hasHeader && /[\u0600-\u06FF]/.test(line)) {
        const arRow = parseArabicRowLine(line);
        if (arRow) { rows.push(arRow); continue; }
        // Arabic-dominant invoice without a readable header: a line the
        // Arabic parser cannot verify is noise, never a generic row.
        const arabicLines = lines.filter((l) => /[\u0600-\u06FF]/.test(l)).length;
        if (arabicLines >= 4 && arabicLines >= lines.length / 2) continue;
      }
      if (isArabicSkipLine(line) && !arabicTable) continue;
      if (isHeaderLine(line)) {
        inTable = true;
        const order = detectColumnOrder(line);
        if (order) { colOrder = order; pendingCols = []; }
        // Split headers: labels seen before this one (e.g. "Quantite" before
        // "Designation") keep their relative order, the name label is next.
        else if (!pendingCols.includes('name')) pendingCols.push('name');
        continue;
      }
      // Standalone column labels after a header ("Quantite", "Prix unitaire
      // HT", "Total HT" each on their own line) complete the column order.
      // They can also precede the name label itself, so they are collected
      // whenever a header exists somewhere and no order was fixed yet. This
      // must run BEFORE the footer check: a bare "Total HT" is a column
      // label, while "Total HT : 1 550,00 €" (with digits) is the footer.
      if (hasHeader && !colOrder && isColumnHeader(line)) {
        const role = singleColumnRole(line);
        if (role && !pendingCols.includes(role)) pendingCols.push(role);
        if (pendingCols.includes('total') && pendingCols.length >= 4) {
          colOrder = pendingCols.slice();
          pendingCols = [];
        }
        continue;
      }
      if (hasHeader && FOOTER_RE.test(line)) { inTable = false; pendingCols = []; continue; }
      if (hasHeader && !inTable) continue;
      if (META_LINE_RE.test(line) || ADDRESS_META_RE.test(line)) continue;
      if (SKIP_LINE_RE.test(line)) continue;
      if (MONTHS_RE.test(line)) continue;
      // skip date/time lines (12/07/2021, 12.04.2026, 21:21).
      if (/^\d{1,2}[.\/\-:]\d{1,2}[.\/\-:]\d{2,4}$/.test(line) || /^\d{1,2}:\d{2}/.test(line)) continue;
      if (/^\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}/.test(line)) continue;
      // Invoice-meta value lines at the start of a row (invoice no + dates)
      // are metadata, never a product row.
      if (/\b[A-Z]{2,}\s*-\s*\d{3,4}\s*-\s*\d+\b/.test(line) && /\b\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}\b/.test(line)) continue;
      // Model digits inside a product name are not quantity/price columns
      // ("S BLOC NS TD27 LAME PM", "FLEXIBLE ... 2L/3L/5L 98-09").
      if (looksLikeProductNameLine(line)) continue;
      const tokens = pickNumbers(line);
      if (tokens.length < 2) {
        // Service invoices can have a name and a single amount
        // ("Création de logo 1 000 €"): qty defaults to one.
        if (tokens.length === 1 && inTable) {
          let serviceName = cleanLineName(line.slice(0, tokens[0].i));
          if ((!serviceName || serviceName.length < 2) && line.length > tokens[0].i + tokens[0].raw.length) {
            serviceName = cleanLineName(line.slice(tokens[0].i + tokens[0].raw.length));
          }
          if (serviceName && serviceName.length >= 2 && !SKIP_NAME_RE.test(serviceName) &&
              !NON_PRODUCT_NAME_RE.test(serviceName) && !(tokens[0].v <= 0)) {
            rows.push({ name: serviceName, qty: 1, price: tokens[0].v });
            continue;
          }
        }
        // Wrapped product name: a numberless (or tail-only) line inside the
        // table is the continuation of the previous product name
        // (e.g. "COROLLA", the "09" of "98-09").
        const isTail = tokens.length <= 1 && line.length <= 14;
        if (inTable && rows.length && isTail && !SKIP_LINE_RE.test(line)) {
          let tail = line.replace(/(€|\$|DA|[-–—_|:])+/gi, ' ').replace(/\s+/g, ' ').trim();
          tail = tail.replace(/[.\s]+$/g, '').trim();
          if (tail && tail.length >= 1 && !SKIP_NAME_RE.test(tail)) {
            rows[rows.length - 1].name += ' ' + tail;
          }
        }
        continue;
      }
      // 4-column tables: prefer the header's column order, then the
      // headerless permutation search — both are exact-arithmetic checked.
      if (colOrder && tokens.length === 3) {
        const mapped = parseByOrder(line, tokens, colOrder);
        if (mapped) { rows.push(mapped); continue; }
      }
      if (!colOrder && tokens.length === 3) {
        const hl = parseHeaderless(line, tokens);
        if (hl) { rows.push(hl); continue; }
      }
      const pair = pickQtyPrice(line, tokens);
      if (!pair) continue;
      const qty = pair.qtyTok.v;
      const price = pair.priceTok.v;
      const qtyPos = pair.qtyTok.i;
      const pricePos = pair.priceTok.i;
      if (!(qty > 0) || !(price > 0)) {
        // Spaced thousands in a single-amount service row can tokenize as
        // qty=1 / price=0 ("1 000 €"). Reconstruct that amount directly.
        const firstDigit = line.search(/\d/);
        const serviceName = firstDigit >= 0 ? cleanLineName(line.slice(0, firstDigit)) : '';
        const serviceAmount = firstDigit >= 0 ? parseAmount(line.slice(firstDigit)) : NaN;
        if (inTable && serviceName.length >= 2 && isFinite(serviceAmount) && serviceAmount > 0 &&
            /[€$]/.test(line) && !SKIP_NAME_RE.test(serviceName) && !NON_PRODUCT_NAME_RE.test(serviceName)) {
          rows.push({ name: serviceName, qty: 1, price: serviceAmount });
        }
        continue;
      }
      // The product name is normally before the qty column. In qty-first
      // invoices ("1 Grand brun ... 100 100"), it is between qty and price;
      // in price/qty-first invoices it can sit between price and the total.
      let name = cleanLineName(line.slice(0, qtyPos));
      if (!name || name.length < 2 || SKIP_NAME_RE.test(name) || NON_PRODUCT_NAME_RE.test(name)) {
        name = cleanLineName(line.slice(qtyPos + pair.qtyTok.raw.length, pricePos));
      }
      if (!name || name.length < 2 || SKIP_NAME_RE.test(name) || NON_PRODUCT_NAME_RE.test(name)) {
        const totalTok = tokens[tokens.length - 1];
        if (totalTok && totalTok.i > pricePos) {
          name = cleanLineName(line.slice(pricePos + pair.priceTok.raw.length, totalTok.i));
        }
      }
      // A leading SKU/reference column often arrives concatenated with the
      // product name ("b010 Souris Optique", "1 53812-0K010/TYF091LA AILE …").
      // Move it to the reference field.
      const splitRef = splitRowRef(name);
      const reference = splitRef.reference;
      name = splitRef.name;
      // A wrapped name may carry digits-only tail parts (e.g. "...98-"); the
      // numberless continuation above already appended plain text tails.
      if (!name || name.length < 2 || SKIP_NAME_RE.test(name) || NON_PRODUCT_NAME_RE.test(name)) continue;
      // drop pure header words
      if (/^(d[ée]signation|quantit|prix|total)$/i.test(name)) continue;
      // A real product name contains letters; money-only totals must not
      // become rows with a name like ".OO".
      if (!/[A-Za-zÀ-ÖØ-öø-ÿ\u0600-\u06FF]{2,}/.test(name) || /^[.\s]*[Oo]{2,}[.\s]*$/.test(name)) continue;
      rows.push({ name, ...(reference ? { reference } : {}), qty: qty > 1000 ? 1 : qty, price });
    }
    // Column-wise OCR fallback: some engines emit table columns one after
    // another ("Article" × 6, then the quantities, then the unit prices, then
    // the totals). The line parser above cannot pair them, so rebuild rows
    // only when the (qty × price ≈ total) check validates every group.
    // Always evaluate it: the line parser may already have produced one or
    // two bogus rows from column blocks without creating real products.
    // Arabic VENTE tables have 5–7 numeric columns per row, which this
    // 3-numbers-per-row grouping cannot rebuild — never let it override
    // Arabic rows.
    if (!arabicTable) {
    {
      const cleanNameText = (line) => {
        let name = line.replace(/(€|\$|\bDA\b|[-–—_|:])+/gi, ' ').replace(/\s+/g, ' ').trim();
        name = name.replace(/\s[×x·•]\s*$/i, '').replace(/[×·•]+\s*$/g, '').replace(/[.\s]+$/g, '').trim();
        return name;
      };
      // Numeric-only column lines ("6", "1 050,00 DA", "6,300.OO DA").
      // Currency tokens are ignored; OCR confusions (O/o for zero) are folded
      // before the text test so "6,300.OO DA" is read as 6300.
      const CURRENCY_TOKEN_RE = /^(€|\$|DA|DZD|MAD|TND|EUR|USD|FCFA|CFA)$/i;
      const numericValues = (line) => {
        let s = foldOcrDigits(String(line || '')).replace(/[€$]/g, ' ');
        s = s.replace(/\b(DA|DZD|MAD|TND|EUR|USD|FCFA|CFA)\b/gi, ' ');
        s = s.replace(/(\d)[Oo](\d)/g, '$10$2')
          .replace(/([.,])[Oo]{1,3}\b/g, (m, p) => p + '0'.repeat(m.length - 1));
        if (/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(s)) return [];
        const out = [];
        const dec = [];
        let last = 0;
        const re = /\d+(?:[., \u00A0]\d{3})*(?:[.,]\d{1,3})?/g;
        let m;
        while ((m = re.exec(s))) {
          if (/[^\s.,\-–—|:]/.test(s.slice(last, m.index))) return [];
          const v = parseAmount(m[0]);
          if (!isFinite(v)) return [];
          out.push(v);
          dec.push(/[.,]\d/.test(m[0]) && !/^\d{1,3}(?:[.,]\d{3})+$/.test(m[0]));
          last = m.index + m[0].length;
        }
        if (/[^\s.,\-–—|:]/.test(s.slice(last))) out.length = 0;
        out.dec = dec;
        return out;
      };
      const expandNames = (name) => {
        if (!name || name.length < 2 || SKIP_NAME_RE.test(name) || isColumnHeader(name) ||
            /^(d[ée]signation|quantit|prix|total)$/i.test(name)) return [];
        const words = name.split(/\s+/).filter(Boolean);
        if (words.length > 1 && words.every((w) => w.toLowerCase() === words[0].toLowerCase())) {
          return words.map(() => words[0]);
        }
        return [name];
      };
      const events = lines.map((rawLine) => {
        const line = rawLine;
        if (isHeaderLine(line)) return { type: 'header' };
        // A bare "Total HT" is a split-column label; only a totals line with
        // an amount closes the table.
        if (isColumnHeader(line) && !/\d/.test(line)) return { type: 'skip' };
        if (FOOTER_RE.test(line)) return { type: 'footer' };
        if (META_LINE_RE.test(line) || ADDRESS_META_RE.test(line) || SKIP_LINE_RE.test(line) ||
            MONTHS_RE.test(line) || /^\d{1,2}[.\/\-:]\d{1,2}[.\/\-:]\d{2,4}$/.test(line) ||
            /^\d{1,2}:\d{2}/.test(line) || /^\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}/.test(line)) {
          return { type: 'skip' };
        }
        const values = numericValues(line);
        if (values.length) {
          // "09" is the wrapped tail of a model number ("98-09"), not a qty.
          if (/^0\d$/.test(line.trim())) return { type: 'name', names: expandNames(cleanNameText(line)) };
          return { type: 'values', values, dec: values.dec || values.map(() => false) };
        }
        // Model digits inside a product name (TD27, 2L/3L/5L) belong to the
        // name column, not to the numeric columns.
        if (looksLikeProductNameLine(line)) {
          return { type: 'name', names: expandNames(cleanNameText(line)) };
        }
        const toks = pickNumbers(line);
        if (!toks.length) return { type: 'name', names: expandNames(cleanNameText(line)) };
        const firstDigit = line.search(/\d/);
        const namePart = firstDigit >= 0 ? cleanNameText(line.slice(0, firstDigit)) : '';
        const names = expandNames(namePart);
        if (names.length) return { type: 'rowstart', names, values: toks.map((t) => t.v), dec: toks.map((t) => /[.,]/.test(t.raw)) };
        // A line starting with a model/size token ("2L/3L/5L", "4PRTE")
        // has no leading name part; keep it as a name so wrapped lines survive.
        if (firstDigit === 0 && /[A-Za-z]/.test(line)) {
          const whole = expandNames(cleanNameText(line));
          if (whole.length) return { type: 'name', names: whole };
        }
        return { type: 'skip' };
      });
      // Column-wise OCR can split a wrapped product name into extra lines
      // ("... HILUX" / "COROLLA"). When more name lines than table rows are
      // present, merge the best continuation candidates into the line above.
      const mergeNameLines = (list0, target) => {
        const list = list0.slice();
        while (list.length > target) {
          let bestIdx = -1;
          let bestScore = Infinity;
          for (let i = 1; i < list.length; i++) {
            const t = String(list[i] || '').trim();
            if (!t) continue;
            const prev = String(list[i - 1] || '').trim();
            // Never glue a repeated standalone label onto the line before it
            // ("Article" × 6 is six products, not one wrapped title).
            if (!prev || t.toLowerCase() === prev.toLowerCase()) continue;
            if (t.toLowerCase() === prev.split(/\s+/).pop().toLowerCase()) continue;
            let sc;
            if (t.length <= 3) sc = 0;
            else if (!/\s/.test(t) && /\d/.test(t) && /^[A-Za-z0-9\/\-.+]+$/.test(t)) sc = 1;
            else if (!/\s/.test(t) && t.length <= 10 && t === t.toUpperCase()) sc = 2 + t.length / 10;
            else if (/[-–—\/]$/.test(list[i - 1])) sc = 3;
            else sc = 100 + t.length;
            if (sc < bestScore) { bestScore = sc; bestIdx = i; }
          }
          // No continuation-like line left: the extra "names" are separate
          // rows/headers, not wrapped titles — reject this alignment.
          if (bestIdx < 0 || bestScore >= 100) return null;
          list[bestIdx - 1] = (list[bestIdx - 1] + ' ' + list[bestIdx]).replace(/\s+/g, ' ').trim();
          list.splice(bestIdx, 1);
        }
        return list.length === target ? list : null;
      };
      const tryGroup = (names, nums, decs) => {
        const n = names.length;
        const D = decs || nums.map(() => false);
        // The header's numeric order is authoritative when we read it; for
        // headerless tables the decimal shapes decide (prices carry cents,
        // quantities are usually plain integers).
        const headerPriceFirst = colOrder
          ? colOrder.filter((r) => r !== 'name')[0] === 'price'
          : null;
        const tryBlocks = (columnBlocks, priceFirst) => {
          const res = [];
          let qDec = 0;
          let pDec = 0;
          let qSum = 0;
          let pSum = 0;
          for (let i = 0; i < n; i++) {
            const firstIdx = columnBlocks ? i : i * 3;
            const secondIdx = columnBlocks ? n + i : i * 3 + 1;
            const tIdx = columnBlocks ? n * 2 + i : i * 3 + 2;
            const first = nums[firstIdx];
            const second = nums[secondIdx];
            const t = nums[tIdx];
            const q = priceFirst ? second : first;
            const p = priceFirst ? first : second;
            if (!(q > 0) || !(p > 0) || !(t > 0) || !near(q * p, t)) return null;
            if (D[priceFirst ? firstIdx : secondIdx]) pDec++;
            if (D[priceFirst ? secondIdx : firstIdx]) qDec++;
            qSum += q;
            pSum += p;
            res.push({ name: names[i], qty: q > 1000 ? 1 : q, price: p });
          }
          const score = ((pDec - qDec) / Math.max(1, n)) * 10 +
            (qSum <= pSum ? 2 : 0) + (columnBlocks ? 1 : 0) + (priceFirst ? 0 : 0.5);
          return { rows: res, score };
        };
        const modes = [];
        if (headerPriceFirst === true) modes.push([true, true], [false, true]);
        else if (headerPriceFirst === false) modes.push([true, false], [false, false]);
        else modes.push([true, false], [true, true], [false, false], [false, true]);
        let best = null;
        for (const [blocks, swapped] of modes) {
          const cand = tryBlocks(blocks, swapped);
          if (cand && (!best || cand.score > best.score)) best = cand;
        }
        return best ? best.rows : [];
      };
      const tryGroupFrom = (names, nums, decs) => {
        if (names.length < 2 || nums.length < 6) return [];
        // Prefer the largest row count that reconciles; only merge name lines
        // when there are more names than qty/price/total groups.
        const maxRows = Math.min(names.length, Math.floor(nums.length / 3));
        for (let n = maxRows; n >= 2; n--) {
          const useNames = n === names.length ? names : mergeNameLines(names, n);
          if (!useNames) continue;
          const grouped = tryGroup(useNames, nums, decs);
          if (grouped.length) return grouped;
        }
        return [];
      };
      // Search every contiguous run of name/value events. This finds a table
      // after the invoice header, or a headerless table whose black header
      // was not OCRed, while rejecting address / footer fragments.
      let bestCandidate = [];
      for (let start = 0; start < events.length; start++) {
        let names = [];
        let nums = [];
        let decs = [];
        let bestForStart = [];
        for (let j = start; j < events.length; j++) {
          const ev = events[j];
          if (ev.type === 'footer') break;
          if (ev.type === 'header' || ev.type === 'skip') continue;
          if (ev.type === 'name') {
            // Numeric blocks can precede the name block (qty-first etc.): the
            // names are still being filled while names < nums, so only stop
            // when names already outnumber the collected numbers.
            if (nums.length > 0 && names.length > 0 && names.length >= nums.length && nums.length < names.length * 3) break;
            names.push(...ev.names);
          } else if (ev.type === 'values') {
            // Numeric columns can precede the name column (qty-first etc.),
            // so values are collected regardless of names seen so far.
            nums.push(...ev.values);
            decs.push(...(ev.dec || ev.values.map(() => false)));
          } else if (ev.type === 'rowstart') {
            if (nums.length > 0 && names.length > 0 && names.length >= nums.length && nums.length < names.length * 3) break;
            names.push(...ev.names);
            nums.push(...ev.values);
            decs.push(...(ev.dec || ev.values.map(() => false)));
          }
          const candidate = tryGroupFrom(names, nums, decs);
          if (candidate.length && candidate.length > bestForStart.length) bestForStart = candidate;
        }
        if (bestForStart.length > bestCandidate.length) bestCandidate = bestForStart;
      }
      if (bestCandidate.length > rows.length) {
        return bestCandidate.filter((r) => r && r.name && !isArabicFooterLine(r.name) &&
          !/^(مسد|مسدد|مدفوع|المبلغ|الدين|الوصل)$/.test(String(r.name).trim()));
      }
    }
    }
    // Final safety net: a summary total that leaked into the rows ("مسد" with
    // price = printed total) is never a product. Drop footer-like names and
    // any row whose price equals the printed grand total.
    const printedTotal = (() => {
      const m = text.match(/مبلغ\s*الوصل\D*([0-9][0-9 ]*[.,][0-9]{2})/) ||
        text.match(/الاجمالي\D*([0-9][0-9 ]*[.,][0-9]{2})/) ||
        text.match(/الإجمالي\D*([0-9][0-9 ]*[.,][0-9]{2})/);
      if (!m) return 0;
      const v = parseAmount(m[1]);
      return isFinite(v) ? v : 0;
    })();
    const cleaned = rows.filter((r) => {
      if (!r || !r.name) return false;
      if (isArabicFooterLine(r.name)) return false;
      if (/[\\=]/.test(String(r.name))) return false;
      if (/^(مسد|مسدد|مدفوع|المبلغ|الدين|الوصل)$/.test(String(r.name).trim())) return false;
      if (printedTotal > 0 && Math.abs((parseFloat(r.price) || 0) - printedTotal) < 0.5 && String(r.name).trim().length <= 6) return false;
      return true;
    });
    return cleaned;
  }

  // ---------- lazy library loading (100% local, no CDN) ----------
  let _libsPromise = null;
  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
      // Never let a missing file keep the UI waiting forever.
      if (typeof setTimeout === 'function') setTimeout(() => resolve(false), 15000);
    });
  }
  // Every OCR asset is bundled in renderer/vendor/** so Smart Add works with
  // no internet connection at all.
  // NOTE: Web Workers reject relative URLs in importScripts()/new Worker(),
  // so worker/core/lang paths are turned into absolute file:// URLs at runtime.
  function absUrl(rel) {
    try {
      const base = (typeof document !== 'undefined' && document.baseURI) ? document.baseURI : (typeof location !== 'undefined' && location.href) || '';
      return new URL(rel, base).href;
    } catch (e) { return rel; }
  }
  const LOCAL_LIBS = {
    pdfjs: 'vendor/pdfjs/pdf.min.js',
    pdfWorker: 'vendor/pdfjs/pdf.worker.min.js',
    tesseract: 'vendor/tesseract/tesseract.min.js',
    tesseractWorker: 'vendor/tesseract/worker.min.js',
    tesseractCore: 'vendor/tesseract/core/',
    tesseractLang: 'vendor/tesseract/lang/',
  };
  function absWorkerPaths() {
    return {
      workerPath: absUrl(LOCAL_LIBS.tesseractWorker),
      corePath: absUrl(LOCAL_LIBS.tesseractCore),
      langPath: absUrl(LOCAL_LIBS.tesseractLang),
    };
  }
  function ensureLibs() {
    if (_libsPromise) return _libsPromise;
    _libsPromise = (async () => {
      const jobs = [];
      if (typeof pdfjsLib === 'undefined') jobs.push(loadScript(absUrl(LOCAL_LIBS.pdfjs)));
      if (typeof Tesseract === 'undefined') jobs.push(loadScript(absUrl(LOCAL_LIBS.tesseract)));
      if (jobs.length) await Promise.all(jobs);
      if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = absUrl(LOCAL_LIBS.pdfWorker);
      }
      return {
        pdfjs: typeof pdfjsLib !== 'undefined',
        tesseract: typeof Tesseract !== 'undefined',
      };
    })();
    return _libsPromise;
  }

  // ---------- pdf text layer ----------
  // Join the runs of one visual line in column order. A wrapped cell keeps
  // its hyphen/slash only when the next run starts in the same column
  // ("01-" + "07" -> "01-07"), never across columns ("11122-54020/" + "TOYOTA").
  // Runs closer than a column gap are one cell (a price printed as "1" +
  // "850.00" must stay "1 850.00"); real column boundaries get two spaces so
  // the row scanners keep the table shape (a lone "6" N° followed by the
  // reference "54613-8H318" must never read as the thousands-grouped amount
  // "6 546").
  const PDF_COLUMN_GAP = 12;
  function joinPdfRuns(runs) {
    const sorted = runs.slice().sort((a, b) => a.x - b.x);
    let out = '';
    let prevX = null;
    for (const r of sorted) {
      const s = String(r.str == null ? '' : r.str).trim();
      if (!s) continue;
      const sameCol = prevX != null && Math.abs(prevX - r.x) < PDF_COLUMN_GAP;
      if (!out) out = s;
      else if (sameCol && /[-/]$/.test(out)) out += s;
      else out += (sameCol ? ' ' : '  ') + s;
      prevX = r.x;
    }
    return out;
  }
  // Rebuild visual lines from PDF text items. Grouping runs by y alone is not
  // enough for printed tables: a designation cell wraps around the row's
  // numeric baseline (lines printed above *and* below it), so a plain y sort
  // splits one product in two and hands its continuation to the next row —
  // which is how the N° column and the reference ended up inside product
  // names. Rows are anchored on the baselines carrying two or more numeric
  // cells (N°, qty, unit price, total); every other run joins the closest
  // baseline while it stays inside that row's band, and the row is emitted
  // in column order (N° Reference Designation Marque Qtx PUV Montant).
  function pdfVisualLines(items) {
    const runs = [];
    for (const it of items || []) {
      const str = it && typeof it.str === 'string' ? it.str : '';
      if (!str.trim()) continue;
      const tr = (it && it.transform) || [0, 0, 0, 0, 0, 0];
      runs.push({ str, x: tr[4] || 0, y: tr[5] || 0 });
    }
    if (!runs.length) return [];
    const clusters = [];
    for (const r of runs) {
      let c = clusters.find((k) => Math.abs(k.y - r.y) < 2.5);
      if (!c) { c = { y: r.y, runs: [] }; clusters.push(c); }
      c.runs.push(r);
    }
    // A table row baseline carries at least two numeric cells.
    const NUMERIC = /^\d[\d\s.,\u00A0+*\/-]*$/;
    const isNum = (s) => NUMERIC.test(String(s || '').trim());
    const anchors = clusters
      .map((c) => ({ y: c.y, runs: c.runs, num: c.runs.filter((r) => isNum(r.str)).length }))
      .filter((c) => c.num >= 2)
      .sort((a, b) => b.y - a.y);
    if (anchors.length < 2) {
      // No table grid on this page: keep the plain visual lines.
      return clusters.sort((a, b) => b.y - a.y).map((c) => joinPdfRuns(c.runs));
    }
    const rows = anchors.map((a) => ({ y: a.y, runs: [] }));
    const stray = [];
    for (const r of runs) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < rows.length; i++) {
        const d = Math.abs(rows[i].y - r.y);
        if (d < bestD) { bestD = d; best = i; }
      }
      // Never reach past the neighbouring baseline: that line belongs to the
      // next (or previous) product. Row spacing follows the cell height, so
      // half the gap (plus a small slack for a 3-4 line cell) is the band.
      const gapPrev = best > 0 ? Math.abs(rows[best - 1].y - rows[best].y) : Infinity;
      const gapNext = best < rows.length - 1 ? Math.abs(rows[best + 1].y - rows[best].y) : Infinity;
      const limit = Math.min(gapPrev, gapNext) * 0.5 + 3;
      if (bestD <= limit) rows[best].runs.push(r);
      else stray.push(r);
    }
    const lines = rows.map((row) => ({ y: row.y, text: joinPdfRuns(row.runs) })).filter((l) => l.text);
    const strayGroups = [];
    for (const r of stray) {
      let g = strayGroups.find((k) => Math.abs(k.y - r.y) < 2.5);
      if (!g) { g = { y: r.y, runs: [] }; strayGroups.push(g); }
      g.runs.push(r);
    }
    for (const g of strayGroups) {
      const text = joinPdfRuns(g.runs);
      if (text) lines.push({ y: g.y, text });
    }
    lines.sort((a, b) => b.y - a.y);
    return lines.map((l) => l.text);
  }
  async function pdfText(file) {
    try {
      const buf = await file.arrayBuffer();
      if (typeof pdfjsLib !== 'undefined') {
        if (pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc = absUrl(LOCAL_LIBS.pdfWorker);
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        let all = '';
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          const lines = pdfVisualLines(tc.items);
          if (lines.length) all += lines.join('\n') + '\n';
        }
        return all;
      }
    } catch (e) { console.warn('[OCR] pdf text failed', e); }
    return null;
  }

  // ---------- scanned PDF -> page images ----------
  // The text layer is empty for scanned invoices. Rendering the first pages to
  // canvases lets the same offline Tesseract engine read them instead of
  // failing silently on a file it cannot decode.
  async function pdfPageBlobs(file, opts) {
    const o = opts || {};
    if (typeof pdfjsLib === 'undefined') return [];
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const total = Math.min(doc.numPages || 0, Math.max(1, o.maxPages || 2));
    const out = [];
    try {
      for (let i = 1; i <= total; i++) {
        throwIfAborted(o.signal);
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const target = o.targetWidth || 1800;
        const scale = Math.min(3, Math.max(1, target / Math.max(1, base.width)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.toBlob) continue;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b || null), 'image/png'));
        if (blob) out.push({ blob, page: i, pages: total });
        if (typeof o.onProgress === 'function') {
          o.onProgress({
            stage: 'render',
            message: 'تحويل الصفحة ' + i + ' من ' + total + ' إلى صورة…',
            progress: total > 1 ? (i - 1) / total : null,
          });
        }
      }
    } finally {
      try { if (doc && typeof doc.destroy === 'function') await doc.destroy(); } catch (e) {}
    }
    return out;
  }

  // ---------- image OCR (Tesseract.js, bundled locally) ----------
  async function loadOcrImage(blob) {
    const url = URL.createObjectURL(blob);
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    return { img, url };
  }
  async function createImageVariant(blob, options) {
    // Cheap image preprocessing used only when the full-page OCR misses the
    // table body. Cropping + enlarging puts Tesseract on a single clean
    // table block instead of a whole small screenshot. Options:
    //  invert   — flip black/white (white-on-black header bands).
    //  contrast — gamma-darken light-gray strokes (thin fonts) so
    //             binarization keeps them instead of erasing them.
    //  threshold — hard binarize at thresholdValue (default 185, tuned so
    //             light-gray strokes stay black while the paper stays white).
    //  smooth: false — nearest-neighbour upscale keeps tiny digit edges
    //             crisp instead of blurring a 5 into an 8/6.
    try {
      const opts = options || {};
      const type = blob && blob.type ? String(blob.type) : '';
      if (!type.startsWith('image/') || typeof Image === 'undefined' ||
          typeof document === 'undefined' || typeof document.createElement !== 'function') return blob;
      const loaded = await loadOcrImage(blob);
      const img = loaded.img;
      const W = img.naturalWidth || img.width;
      const H = img.naturalHeight || img.height;
      if (!W || !H) return blob;
      const crop = opts.crop || {};
      const sw = Math.max(1, Math.floor(W * (crop.w || 1)));
      const sh = Math.max(1, Math.floor(H * (crop.h || 1)));
      // Tiny bands (a one-pixel table line, a cropped logo) only produce
      // Tesseract noise ("Image too small to scale!!"). Skip them.
      if (sw < 200 || sh < 40) return blob;
      const sx = Math.min(W - 1, Math.floor(W * (crop.x || 0)));
      const sy = Math.min(H - 1, Math.floor(H * (crop.y || 0)));
      const targetWidth = opts.targetWidth || Math.min(2400, Math.max(1200, sw));
      const scale = Math.max(1, Math.min(3.5, targetWidth / sw));
      const canvas = document.createElement('canvas');
      const skewDeg = Number(opts.skew) || 0;
      const skewRad = (skewDeg * Math.PI) / 180;
      const pad = skewRad ? Math.ceil(Math.abs(Math.sin(skewRad)) * Math.max(sw, sh) * scale) + 8 : 0;
      canvas.width = Math.max(1, Math.round(sw * scale) + pad * 2);
      canvas.height = Math.max(1, Math.round(sh * scale) + pad * 2);
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.toBlob) return blob;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = opts.smooth !== false;
      if (opts.smooth !== false) ctx.imageSmoothingQuality = 'high';
      if (skewRad) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(skewRad);
        ctx.drawImage(img, sx, sy, sw, sh, -sw * scale / 2, -sh * scale / 2, sw * scale, sh * scale);
        ctx.restore();
      } else {
        ctx.drawImage(img, sx, sy, sw, sh, pad, pad, canvas.width - pad * 2, canvas.height - pad * 2);
      }
      if (opts.invert || opts.contrast || opts.threshold) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        const thr = Number(opts.thresholdValue) || 185;
        for (let i = 0; i < d.length; i += 4) {
          let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (opts.invert) lum = 255 - lum;
          if (opts.contrast) {
            // Gamma 1.8 pulls light gray (e.g. 170) down to ~122 so thin
            // strokes survive the binarization below.
            const x = Math.max(0, Math.min(1, lum / 255));
            lum = 255 * Math.pow(x, 1.8);
          }
          const v = opts.threshold ? (lum > thr ? 255 : 0) : Math.max(0, Math.min(255, Math.round(lum)));
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      }
      URL.revokeObjectURL(loaded.url);
      return await new Promise((resolve) => canvas.toBlob((b) => resolve(b || blob), 'image/png'));
    } catch (e) {
      return blob;
    }
  }
  async function upscaleImageForOcr(blob) {
    // Tesseract's word segmentation is very weak on small invoice screenshots.
    // A 2-3x upscale is cheap and usually turns a garbled table into text.
    try {
      const type = blob && blob.type ? String(blob.type) : '';
      if (!type.startsWith('image/') || typeof Image === 'undefined' ||
          typeof document === 'undefined' || typeof document.createElement !== 'function') return blob;
      const url = URL.createObjectURL(blob);
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
      });
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height || width >= 1600) return blob;
      const scale = Math.min(3, Math.max(1, 1800 / Math.max(1, width)));
      if (scale <= 1) return blob;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.toBlob) return blob;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      return await new Promise((resolve) => canvas.toBlob((b) => resolve(b || blob), 'image/png'));
    } catch (e) {
      return blob;
    }
  }
  // ---------- offline OCR engine (one reused worker + watchdog) ----------
  const ATTEMPT_TIMEOUT_MS = 45000;
  const TOTAL_BUDGET_MS = 150000;
  const WORKER_IDLE_MS = 120000;
  const TESS_STATUS_LABEL = {
    'loading tesseract core': 'تحميل محرك القراءة…',
    'initializing tesseract': 'تهيئة محرك القراءة…',
    'loading language traineddata': 'تحميل بيانات اللغة…',
    'initializing api': 'تجهيز محرك القراءة…',
    'recognizing text': 'قراءة النص…',
  };

  let _worker = null;
  let _workerLang = null;
  let _workerIdleTimer = null;
  let _activeLogger = null;

  function ocrError(code, message) {
    const err = new Error(message || code);
    err.code = code;
    return err;
  }
  function isAborted(signal) { return !!(signal && signal.aborted); }
  function throwIfAborted(signal) {
    if (isAborted(signal)) throw ocrError('aborted', 'تم إلغاء العملية');
  }
  // createWorker binds its logger once; the module-level indirection lets every
  // recognize() call report through its own callback.
  function workerLogger(m) {
    if (typeof _activeLogger === 'function' && m) {
      try { _activeLogger(m); } catch (e) {}
    }
  }
  function clearWorkerIdle() {
    if (_workerIdleTimer && typeof clearTimeout === 'function') clearTimeout(_workerIdleTimer);
    _workerIdleTimer = null;
  }
  async function disposeWorker() {
    clearWorkerIdle();
    const w = _worker;
    _worker = null;
    _workerLang = null;
    if (w) { try { await w.terminate(); } catch (e) {} }
  }
  function scheduleWorkerIdle() {
    clearWorkerIdle();
    if (!_worker || typeof setTimeout !== 'function') return;
    // Keep the worker warm for the next invoice, then release its memory.
    _workerIdleTimer = setTimeout(() => { disposeWorker(); }, WORKER_IDLE_MS);
    if (_workerIdleTimer && typeof _workerIdleTimer.unref === 'function') _workerIdleTimer.unref();
  }
  async function getWorker(lang) {
    const want = lang || 'fra+eng';
    if (_worker && _workerLang === want) { clearWorkerIdle(); return _worker; }
    if (_worker) await disposeWorker();
    if (typeof Tesseract === 'undefined' || typeof Tesseract.createWorker !== 'function') {
      throw ocrError('lib-missing', 'محرّك القراءة المحلي غير محمّل');
    }
    const paths = absWorkerPaths();
    const w = await Tesseract.createWorker(want, 1, {
      workerPath: paths.workerPath,
      corePath: paths.corePath,
      langPath: paths.langPath,
      logger: workerLogger,
      gzip: true,
      errorHandler: (msg) => { console.warn('[OCR] tesseract worker:', msg); },
    });
    _worker = w;
    _workerLang = want;
    return w;
  }
  function withTimeout(promise, ms, code) {
    if (!(ms > 0) || typeof setTimeout !== 'function') return promise;
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(ocrError(code || 'timeout', 'انتهت مدة المحاولة')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }
  async function tesseractOcr(image, lang, psm, ctx) {
    ctx = ctx || {};
    const w = await getWorker(lang);
    throwIfAborted(ctx.signal);
    // PSM 6 = one uniform block (invoice table), PSM 3 = auto page layout.
    const params = {
      tessedit_pageseg_mode: String(psm || 3),
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    };
    // Numeric cells only: a digit whitelist stops Tesseract from inventing
    // letters ("rse0c0" for 7,500.00) on tiny phone-screenshot columns.
    if (ctx.whitelist) params.tessedit_char_whitelist = String(ctx.whitelist);
    await w.setParameters(params);
    throwIfAborted(ctx.signal);
    _activeLogger = (m) => {
      if (!m || typeof ctx.onProgress !== 'function') return;
      const label = TESS_STATUS_LABEL[m.status];
      if (!label) return;
      ctx.onProgress({
        stage: 'recognize',
        message: (ctx.label ? ctx.label + ' — ' : '') + label,
        progress: m.status === 'recognizing text' && typeof m.progress === 'number' ? m.progress : null,
        status: m.status,
      });
    };
    try {
      const res = await withTimeout(w.recognize(image), ctx.attemptTimeoutMs || ATTEMPT_TIMEOUT_MS, 'timeout');
      const data = res && res.data ? res.data : null;
      if (!data) return null;
      const text = data.text || null;
      if (ctx.withLines) {
        // Line boxes are needed to align two independent reads (names vs.
        // numbers) by their vertical position instead of their text order.
        const lines = Array.isArray(data.lines)
          ? data.lines
              .map((l) => ({
                text: String((l && l.text) || '').replace(/\s+/g, ' ').trim(),
                bbox: l && l.bbox ? l.bbox : null,
                confidence: l && typeof l.confidence === 'number' ? l.confidence : null,
                words: Array.isArray(l && l.words)
                  ? l.words
                      .map((w) => ({
                        text: String((w && w.text) || '').replace(/\s+/g, ' ').trim(),
                        bbox: w && w.bbox ? w.bbox : null,
                        confidence: w && typeof w.confidence === 'number' ? w.confidence : null,
                      }))
                      .filter((w) => w.text && w.bbox)
                  : [],
              }))
              .filter((l) => l.text && l.bbox)
          : [];
        return { text, lines };
      }
      return text;
    } finally {
      _activeLogger = null;
    }
  }
  function scoreOcrResult(text, rows) {
    const txt = String(text || '');
    const nh = normalizeHeaderText(txt);
    let score = rows.length * 15;
    if (nh.includes('designation') || nh.includes('description')) score += 30;
    if (nh.includes('qte') || nh.includes('quantite')) score += 15;
    if (nh.includes('prix')) score += 15;
    if (nh.includes('montant') || nh.includes('total')) score += 15;
    score += Math.min(15, (txt.match(/\bArticle\b/gi) || []).length * 2);
    // Arabic VENTE-COMPTOIR headers and totals are first-class evidence.
    for (const w of ['العلب', 'القطع', 'المحتوى', 'المجموع', 'الصنف', 'سعر الوحدة']) {
      if (txt.includes(w)) score += 10;
    }
    if (isArabicHeaderLine(txt)) score += 20;
    // Only CJK/Thai-like scripts are suspicious noise; Arabic is a real
    // invoice language (the old penalty punished every Arabic candidate).
    const suspicious = (txt.match(/[一-鿿぀-ヿ]/g) || []).length;
    score -= Math.min(50, suspicious);
    // A table candidate also has to reconcile with the printed totals.
    // HT lines ("MONTANT HT", "Sous-total HT", "Total HT") must equal the
    // rows sum; TTC lines must equal that sum plus the printed TVA rate.
    const expectedOf = (re) => {
      const m = txt.match(re);
      if (!m) return 0;
      const v = parseAmount(m[1]);
      return isFinite(v) ? v : 0;
    };
    const actual = rows && rows.length
      ? rows.reduce((s, r) => s + ((parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0)), 0)
      : 0;
    const rewardReconcile = (expected, actualSum) => {
      if (!(expected > 0) || !(actualSum > 0)) return 0;
      const ratio = Math.abs(actualSum - expected) / Math.max(1, expected);
      if (ratio < 0.05) return 25;
      if (ratio < 0.30) return 10;
      return -Math.min(100, ratio * 10);
    };
    const htExpected =
      expectedOf(/MONTANT\s*HT\D*([0-9][0-9 ]*[.,][0-9]{2})/i) ||
      expectedOf(/SOUS[\s-]*TOTAL\s*HT\D*([0-9][0-9 ]*[.,][0-9]{2})/i) ||
      expectedOf(/TOTAL\s*HT\s*:?\s*([0-9][0-9 ]*[.,][0-9]{2})/i);
    if (htExpected > 0) score += rewardReconcile(htExpected, actual);
    const ttcExpected = expectedOf(/TOTAL\s*TTC\D*([0-9][0-9 ]*[.,][0-9]{2})/i);
    if (ttcExpected > 0) {
      const vat = expectedOf(/TVA\s*\(?\s*(\d+)\s*%\)?/i);
      const ttcActual = vat > 0 && vat < 100 ? actual * (1 + vat / 100) : actual;
      score += rewardReconcile(ttcExpected, ttcActual);
    }
    // Arabic printed total: "مبلغ الوصل : 33 223.00" must equal the rows sum.
    // An Arabic candidate whose rows reconcile with it beats any Latin
    // gibberish that happens to have more (bogus) rows.
    const arExpected =
      expectedOf(/مبلغ\s*الوصل\D*([0-9][0-9 ]*[.,][0-9]{2})/) ||
      expectedOf(/المجموع\s*العام\D*([0-9][0-9 ]*[.,][0-9]{2})/) ||
      expectedOf(/الاجمالي\D*([0-9][0-9 ]*[.,][0-9]{2})/) ||
      expectedOf(/الإجمالي\D*([0-9][0-9 ]*[.,][0-9]{2})/);
    if (arExpected > 0) score += rewardReconcile(arExpected, actual);
    // Printed pieces total: "عدد القطع 188" must equal the rows qty sum.
    const arPieces = expectedOf(/عدد\s*القطع\D*([0-9][0-9 ]*)/);
    if (arPieces > 0 && rows && rows.length) {
      const qtySum = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
      if (Math.abs(qtySum - arPieces) < 0.5) score += 25;
      else score -= Math.min(60, Math.abs(qtySum - arPieces));
    }
    (rows || []).forEach((r) => {
      const q = parseFloat(r.qty) || 0;
      const p = parseFloat(r.price) || 0;
      if (q > 0 && q <= 1000 && p > 0 && p <= 100000 && q * p <= 1000000000) score += 3;
      else score -= 8;
      if (r.verified) score += 4;
      // Arabic product names are strong evidence on Arabic invoices: a
      // Latin-gibberish candidate must never beat a real Arabic table.
      if (/[\u0600-\u06FF]/.test(String(r.name || ''))) score += 10;
      // Fractional pieces ("2.541") and year-like prices ("2026") are
      // misreads of totals/dates, never real product rows.
      if (q > 0 && Math.abs(q - Math.round(q)) > 0.001) score -= 15;
      if (q === 2026 || p === 2026) score -= 15;
    });
    return score;
  }
  function parseRowsSafe(text) {
    if (!text) return [];
    try { return parseRowsFromText(text) || []; } catch (e) { return []; }
  }
  // Text lane used by the manual "paste invoice text" box: the printed
  // Latin-table reader is far more accurate than the generic row scanner when
  // the text carries a "Référence | Désignation" header (it keeps the
  // reference column and the exact prices), and it returns null otherwise, so
  // every other format falls back to the generic scanner untouched.
  function parseInvoiceText(text) {
    const generic = parseRowsSafe(text);
    try {
      const latin = latinTextRows(text, generic);
      if (latin && latin.length) return latin;
    } catch (e) {}
    return generic;
  }
  // Estimate photo tilt by horizontal-projection sharpness on a downscaled
  // copy. Rotating back by the best angle makes Tesseract's line segmentation
  // work on phone photos. Returns degrees to rotate by (0 if straight).
  async function estimateSkewAngle(blob) {
    try {
      const type = blob && blob.type ? String(blob.type) : '';
      if (!type.startsWith('image/') || typeof Image === 'undefined' ||
          typeof document === 'undefined' || typeof document.createElement !== 'function') return 0;
      const loaded = await loadOcrImage(blob);
      const img = loaded.img;
      const W = Math.min(700, img.naturalWidth || img.width || 700);
      const H = Math.max(1, Math.round((img.naturalHeight || img.height || W) * (W / (img.naturalWidth || W))));
      if (!W || !H || H < 80) { URL.revokeObjectURL(loaded.url); return 0; }
      const base = document.createElement('canvas');
      base.width = W; base.height = H;
      const bctx = base.getContext('2d');
      if (!bctx) { URL.revokeObjectURL(loaded.url); return 0; }
      bctx.fillStyle = '#ffffff';
      bctx.fillRect(0, 0, W, H);
      bctx.drawImage(img, 0, 0, W, H);
      const scoreAt = (deg) => {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const cx = c.getContext('2d');
        if (!cx) return -Infinity;
        cx.fillStyle = '#ffffff';
        cx.fillRect(0, 0, W, H);
        cx.save();
        cx.translate(W / 2, H / 2);
        cx.rotate((deg * Math.PI) / 180);
        cx.drawImage(base, 0, 0, W, H, -W / 2, -H / 2, W, H);
        cx.restore();
        const data = cx.getImageData(0, 0, W, H).data;
        const proj = new Float32Array(H);
        for (let y = 0; y < H; y++) {
          let dark = 0;
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (lum < 140) dark++;
          }
          proj[y] = dark;
        }
        let mean = 0;
        for (let y = 0; y < H; y++) mean += proj[y];
        mean /= H;
        let varSum = 0;
        for (let y = 0; y < H; y++) varSum += (proj[y] - mean) * (proj[y] - mean);
        return varSum;
      };
      let bestDeg = 0;
      let bestScore = scoreAt(0);
      for (let d = -4; d <= 4; d++) {
        if (d === 0) continue;
        const s = scoreAt(d);
        if (s > bestScore) { bestScore = s; bestDeg = d; }
      }
      URL.revokeObjectURL(loaded.url);
      // The angle that maximises sharpness IS the correction to apply.
      return bestDeg && bestScore > scoreAt(0) * 1.05 ? bestDeg : 0;
    } catch (e) { return 0; }
  }
  // Table row bands from horizontal grid lines (printed tables). Falls back to
  // equal bands over the table area when no grid is found. Fractions are
  // relative to the full image.
  async function detectRowBands(blob) {
    const FALLBACK = { top: 0.16, bottom: 0.64, count: 12 };
    try {
      const type = blob && blob.type ? String(blob.type) : '';
      if (!type.startsWith('image/') || typeof Image === 'undefined' ||
          typeof document === 'undefined' || typeof document.createElement !== 'function') return FALLBACK;
      const loaded = await loadOcrImage(blob);
      const img = loaded.img;
      const W = Math.min(900, img.naturalWidth || img.width || 900);
      const H = Math.max(1, Math.round((img.naturalHeight || img.height || W) * (W / (img.naturalWidth || W))));
      if (!W || !H || H < 200) { URL.revokeObjectURL(loaded.url); return FALLBACK; }
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const cx = c.getContext('2d');
      if (!cx) { URL.revokeObjectURL(loaded.url); return FALLBACK; }
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, W, H);
      cx.drawImage(img, 0, 0, W, H);
      const data = cx.getImageData(0, 0, W, H).data;
      const ratio = new Float32Array(H);
      for (let y = 0; y < H; y++) {
        let dark = 0;
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (lum < 150) dark++;
        }
        ratio[y] = dark / W;
      }
      URL.revokeObjectURL(loaded.url);
      // Horizontal grid lines: dark across most of the width.
      const lines = [];
      let runStart = -1;
      for (let y = 0; y < H; y++) {
        const isLine = ratio[y] > 0.55;
        if (isLine && runStart < 0) runStart = y;
        if (!isLine && runStart >= 0) {
          if (y - runStart >= 1 && y - runStart <= 6) lines.push(Math.round((runStart + y - 1) / 2));
          runStart = -1;
        }
      }
      const usable = lines.filter((y) => y > H * 0.08 && y < H * 0.85);
      if (usable.length < 4) return FALLBACK;
      // Bands between consecutive lines with table-like heights. A missed
      // grid line (compressed rows, phone photo blur) leaves a gap taller
      // than the usual row: split it evenly instead of losing a product row.
      const heights = [];
      for (let i = 0; i < usable.length - 1; i++) heights.push(usable[i + 1] - usable[i]);
      const sorted = heights.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] || 0;
      const bands = [];
      for (let i = 0; i < usable.length - 1; i++) {
        const y0 = usable[i];
        const y1 = usable[i + 1];
        const h = y1 - y0;
        if (h <= 0 || h >= H * 0.10) continue;
        if (median > 0 && h > median * 1.6) {
          const n = Math.round(h / median);
          if (n >= 2 && n <= 4) {
            const step = h / n;
            for (let k = 0; k < n; k++) {
              bands.push({ y0: (y0 + step * k) / H, y1: (y0 + step * (k + 1)) / H });
            }
            continue;
          }
        }
        if (h >= H * 0.010) bands.push({ y0: y0 / H, y1: y1 / H });
      }
      if (bands.length < 4) return FALLBACK;
      return { top: bands[0].y0, bottom: bands[bands.length - 1].y1, count: bands.length, bands };
    } catch (e) { return FALLBACK; }
  }
  function langLabel(lang) {
    const l = String(lang || '').toLowerCase();
    if (l.indexOf('ara') >= 0) return 'عربي';
    if (l.indexOf('fra') >= 0) return 'فرنسي';
    if (l.indexOf('eng') >= 0) return 'إنجليزي';
    return l || 'تلقائي';
  }

  // ---------- printed VENTE-COMPTOIR table ----------
  // These POS receipts print the product name on the right and every amount
  // on the left. One psm-4 read of the whole table yields all rows in order
  // but interleaves the columns; a second, English-only read of the numeric
  // block yields exact figures. Merging both by vertical position (never by
  // text order) is what finally makes every row line up.
  const VENTE_BAND = { x: 0.05, y: 0.18, w: 0.92, h: 0.36 };
  const VENTE_HEADER_LABELS = ['المجموع', 'الوحدة', 'سعر', 'القطع', 'المحتوى', 'العلب', 'الكمية', 'المبلغ'];
  function arabicLetterCount(s) {
    return (String(s || '').match(/[\u0600-\u06FF]/g) || []).length;
  }
  function latinLetterCount(s) {
    return (String(s || '').match(/[A-Za-z]/g) || []).length;
  }
  function venteNameQuality(name) {
    const s = String(name || '').trim();
    if (!s) return -Infinity;
    const ar = arabicLetterCount(s);
    const la = latinLetterCount(s);
    const di = (s.match(/[0-9]/g) || []).length;
    const junk = (s.match(/[|<>\[\]{}_=~^*\\/]/g) || []).length;
    return ar * 2 - la - di * 2 - junk * 2 + (ar >= 3 ? 4 : 0);
  }
  function cleanVenteName(name) {
    let s = String(name || '');
    s = s.replace(/[\u200e\u200f\u061c]/g, ' ');
    // Keep letters, digits, spaces and the hyphen inside names like
    // "ب-ريادي"; every other glyph is OCR noise from the numeric columns.
    s = s.replace(/[^\p{L}\p{N}\s-]/gu, ' ');
    // Row numbers and stray column digits are not part of the product name.
    s = s.replace(/[0-9]+/g, ' ');
    s = s.replace(/[\u0660-\u0669\u06f0-\u06f9]+/g, ' ');
    s = s.replace(/(^|\s)-+(\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    // Drop isolated Latin letters left behind by a misread Arabic word.
    s = s.replace(/(^|\s)[A-Za-z](\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    // A lone letter at the start/end of a multi-word name is column noise
    // ("بابو كارووو باكي صغير ق" -> "بابو كارووو باكي صغير").
    let parts = s.split(' ').filter(Boolean);
    while (parts.length > 1 && parts[parts.length - 1].length === 1) parts.pop();
    while (parts.length > 1 && parts[0].length === 1) parts.shift();
    return parts.join(' ');
  }
  function venteNameFromWords(words, nameStart) {
    // Arabic reads right to left. Tesseract sometimes returns a line's words
    // in left-to-right order, which reverses the product name, so always sort
    // by x descending instead of trusting the reported order.
    return (words || [])
      .filter((w) => w && w.text && w.bbox && w.bbox.x0 >= nameStart)
      .slice()
      .sort((a, b) => b.bbox.x0 - a.bbox.x0)
      .map((w) => w.text)
      .join(' ')
      .trim();
  }
  function venteNumbersFromWords(words) {
    // The total is the left-most amount, so read the cells left to right
    // instead of trusting Tesseract's (sometimes reversed) word order.
    const ordered = (words || [])
      .filter((w) => w && w.text && w.bbox)
      .slice()
      .sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const tokens = [];
    for (const w of ordered) {
      const t = toLatinDigits(String(w.text || ''))
        .replace(/[^0-9.,]/g, ' ')
        .trim();
      if (!t) continue;
      for (const piece of t.split(/\s+/)) if (piece) tokens.push(piece);
    }
    // Re-join thousands groups Tesseract split into two words ("3 420.00").
    const nums = [];
    for (let i = 0; i < tokens.length; i++) {
      const a = tokens[i];
      const b = tokens[i + 1];
      if (/^\d{1,3}$/.test(a) && b && /^\d{3}([.,]\d{1,2})?$/.test(b)) {
        const v = parseFloat(a + b.replace(',', '.'));
        if (isFinite(v)) nums.push(v);
        i += 1;
      } else {
        const v = parseFloat(a.replace(',', '.'));
        if (isFinite(v)) nums.push(v);
      }
    }
    return nums;
  }
  function venteTriple(nums) {
    if (!nums || nums.length < 3) return null;
    const total = nums[0];
    if (!(total > 0)) return null;
    // --- Strategy A: price x qty matches the (possibly scaled) printed total.
    // OCR can pad the total with zeros ("4000.00" -> "400000") or drop a
    // decimal point, so accept price x qty = total / 100 or / 10; and (b) read
    // the price without its dot ("4200" for 42.00), so accept price / 100 or
    // / 10 when the price token is an integer. Exact match (scale 1) always
    // wins; corrected totals/prices are flagged derived.
    const totalScales = [1, 0.01, 0.1];
    for (const ts of totalScales) {
      const target = total * ts;
      const tol2 = Math.max(1, target * 0.02);
      for (let i = 1; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
          let price = nums[i];
          const qty = nums[j];
          if (!(qty > 0)) continue;
          const priceScales = [1];
          if (isIntLike(price) && price >= 1000 && price % 100 === 0) priceScales.push(0.01);
          else if (isIntLike(price) && price >= 100 && price % 10 === 0) priceScales.push(0.1);
          for (const ps of priceScales) {
            const p = price * ps;
            if (!(p > 0) || qty > 10000 || p > 200000) continue;
            if (ts !== 1 && !isIntLike(qty)) continue;
            if (Math.abs(p * qty - target) <= tol2) {
              return { total: p * qty, price: p, qty, derived: ts !== 1 || ps !== 1 };
            }
          }
        }
      }
    }
    // --- Strategy B: derive price from the printed total (total correct,
    // price cell misread). Quantity is almost always a small integer; ties in
    // frequency resolve to the SMALLEST value (the larger is normally the
    // unit price, e.g. rest [780, 2] -> qty 2, price 780).
    const rest = nums.slice(1).filter((v) => v > 0 && v !== total);
    let candidateB = null;
    if (rest.length) {
      const ints = rest.filter((v) => isIntLike(v) && v <= 1000 && v >= 1);
      let qtyB = 0;
      let bestQtyCount = 0;
      if (ints.length) {
        const counts = new Map();
        for (const v of ints) counts.set(v, (counts.get(v) || 0) + 1);
        for (const [v, c] of counts) {
          if (c > bestQtyCount || (c === bestQtyCount && v < qtyB)) { qtyB = v; bestQtyCount = c; }
        }
      }
      if (!(qtyB > 0)) qtyB = Math.min(...rest);
      if (qtyB > 0) {
        // A two-decimal unit price times a whole number of pieces always lands
        // on exact cents. When total ÷ pieces cannot, the printed total is
        // itself the misread cell (the leftmost المجموع column is the least
        // reliable one), so the unit price comes from its own column instead.
        const cents = Math.round(total * 100);
        const impossible = isIntLike(qtyB) && cents % Math.round(qtyB) !== 0;
        const priceCol = impossible ? rest.find((v) => v !== qtyB) : null;
        if (priceCol > 0 && priceCol <= 200000) {
          candidateB = {
            total: Math.round(priceCol * qtyB * 100) / 100,
            price: priceCol,
            qty: qtyB,
            derived: true,
            score: 105,
          };
        } else {
          const priceB = total / qtyB;
          if (isFinite(priceB) && priceB >= 1 && priceB <= 200000) {
            let scoreB = 100;
            if (priceB > 5000) scoreB -= 40; // unrealistically high unit price
            if (isIntLike(priceB)) scoreB += 10;
            if (qtyB <= 100) scoreB += 5;
            candidateB = { total, price: Math.round(priceB * 100) / 100, qty: qtyB, derived: true, score: scoreB };
          }
        }
      }
    }
    // --- Strategy C: derive the total from price x qty when the printed
    // total itself is misread (extra digits / wrong digit). Only consider a
    // (price, qty) pair when there is decimal-shift evidence on the price
    // (strong OCR signal) or qty < price (normal unit relationship).
    let candidateC = null;
    for (let i = 1; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        // Try i as price, j as qty (normal array order: price before qty)
        let price = nums[i];
        const qty = nums[j];
        if (!(qty > 0) || qty > 10000 || !(price > 0) || price > 2000000) continue;
        const priceVariants = [price];
        // /100 فقط: "4200" → 42.00. /10 محذوفة لأنها خطيرة جداً (780 سعر شرعي، ليست 78.0).
        if (isIntLike(price) && price >= 1000 && price % 100 === 0) priceVariants.push(price / 100);
        for (const p of priceVariants) {
          const pShifted = p !== price; // تحريك عشري لهذا التنويع تحديداً
          if (!(p >= 1) || p > 200000) continue;
          const rowTotal = p * qty;
          if (!(rowTotal > 0) || rowTotal > 20000000) continue;
          // Derived total must match nums[0] (the presumed printed total)
          if (rowTotal !== nums[0]) continue;
          if (!pShifted && !(qty < p)) continue; // لا دليل تحريك وعلاقة غير طبيعية
          let scoreC = 100;
          if (pShifted) scoreC += 30; // تحريك العشري دليل قوي على خطأ OCR
          if (p >= qty) scoreC += 12;
          if (isIntLike(qty) && qty >= 2 && qty <= 1000) scoreC += 8; // qty=1 مش كمية منتج طبيعية
          if (qty >= 2 && qty <= 100) scoreC += 4; // qty=1 لا تحافز
          if (p >= 10) scoreC += 2;
          if (!pShifted && p === price) scoreC += 5;
          if (!candidateC || scoreC > candidateC.score) candidateC = { total: rowTotal, price: p, qty, derived: true, score: scoreC };
        }
        // Also try i as qty, j as price (Arabic OCR often puts qty before price)
        price = nums[j];
        const qty2 = nums[i];
        if (!(qty2 > 0) || qty2 > 10000 || !(price > 0) || price > 2000000) continue;
        const priceVariants2 = [price];
        if (isIntLike(price) && price >= 1000 && price % 100 === 0) priceVariants2.push(price / 100);
        for (const p of priceVariants2) {
          const pShifted = p !== price;
          if (!(p >= 1) || p > 200000) continue;
          const rowTotal2 = p * qty2;
          if (!(rowTotal2 > 0) || rowTotal2 > 20000000) continue;
          // Derived total must match nums[0] (the presumed printed total)
          if (rowTotal2 !== nums[0]) continue;
          if (!pShifted && !(qty2 < p)) continue;
          let scoreC2 = 100;
          if (pShifted) scoreC2 += 30;
          if (p >= qty2) scoreC2 += 12;
          if (isIntLike(qty2) && qty2 >= 2 && qty2 <= 1000) scoreC2 += 8;
          if (qty2 >= 2 && qty2 <= 100) scoreC2 += 4;
          if (p >= 10) scoreC2 += 2;
          if (!pShifted && p === price) scoreC2 += 5;
          if (!candidateC || scoreC2 > candidateC.score) candidateC = { total: rowTotal2, price: p, qty: qty2, derived: true, score: scoreC2 };
        }
      }
    }
    // Pick the best of B and C (A already returned above when it matched).
    if (candidateB && (!candidateC || candidateB.score >= candidateC.score)) return candidateB;
    if (candidateC) return candidateC;
    return null;
  }
  function nearestByY(list, y, tol) {
    let best = null;
    let bestD = Infinity;
    for (const item of list || []) {
      const d = Math.abs(item.y - y);
      if (d < bestD) { bestD = d; best = item; }
    }
    return bestD <= tol ? best : null;
  }
  function medianSpacing(list) {
    const ys = (list || []).map((l) => l.y).sort((a, b) => a - b);
    const diffs = [];
    for (let i = 1; i < ys.length; i++) diffs.push(ys[i] - ys[i - 1]);
    if (!diffs.length) return 0.03;
    diffs.sort((a, b) => a - b);
    return diffs[Math.floor(diffs.length / 2)] || 0.03;
  }
  async function imageDimensions(blob) {
    try {
      const loaded = await loadOcrImage(blob);
      const img = loaded.img;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      URL.revokeObjectURL(loaded.url);
      return { w, h };
    } catch (e) { return { w: 0, h: 0 }; }
  }
  async function readVenteTable(source, opts) {
    const o = opts || {};
    const emit = typeof o.emit === 'function' ? o.emit : null;
    const band = Object.assign({}, VENTE_BAND, o.band || {});
    const tableCrop = { x: band.x, y: band.y, w: band.w, h: band.h };
    const nameCrop = { x: 0.54, y: band.y, w: 0.42, h: band.h };
    const numCrop = { x: 0.06, y: Math.max(0, band.y - 0.03), w: 0.40, h: band.h + 0.03 };

    const readLines = async (crop, lang, psm, label, targetWidth) => {
      throwIfAborted(o.signal);
      const img = await createImageVariant(source, { crop, targetWidth: Math.round(targetWidth || 3000) });
      if (!img || img === source) return null;
      const dim = await imageDimensions(img);
      if (!dim.w || !dim.h) return null;
      if (emit) emit({ stage: 'recognize', message: label, progress: null });
      let res = null;
      try {
        res = await tesseractOcr(img, lang, psm, {
          signal: o.signal,
          attemptTimeoutMs: o.attemptTimeoutMs,
          label,
          withLines: true,
        });
      } catch (e) {
        if (e && e.code === 'aborted') throw e;
        console.warn('[OCR] vente read failed', label, e);
        await disposeWorker();
        if (e && e.code === 'timeout') throw e;
        return null;
      }
      if (!res || typeof res !== 'object') return null;
      const lines = (res.lines || []).map((l) => ({
        text: l.text,
        words: (l.words || []).map((w) => ({
          text: w.text,
          bbox: {
            x0: crop.x + (w.bbox.x0 / dim.w) * crop.w,
            x1: crop.x + (w.bbox.x1 / dim.w) * crop.w,
          },
        })),
        y: crop.y + (((l.bbox.y0 + l.bbox.y1) / 2) / dim.h) * crop.h,
      }));
      return { text: res.text || '', lines };
    };

    const table = await readLines(tableCrop, 'ara+eng', 4, 'قراءة جدول الفاتورة العربية…', 3400);
    if (!table || !table.lines.length) return null;

    // Keep the body rows that follow the column header. Each body row carries
    // Arabic text and at least one digit; summary/footer lines are excluded.
    const headerIdx = table.lines.findIndex((l) => isArabicHeaderLine(l.text));
    // No Arabic column header means this is not a printed VENTE table; let the
    // generic pipeline handle it instead of guessing rows.
    if (headerIdx < 0) return null;
    const isBody = (l) => l && l.text && /\d/.test(l.text) &&
      !isArabicHeaderLine(l.text) && !isArabicFooterLine(l.text) &&
      !isArabicSkipLine(l.text) &&
      arabicLetterCount(l.text) >= 1;
    const body = table.lines.slice(headerIdx + 1).filter(isBody);
    if (body.length < 2) return null;

    // Two name passes: psm 4 keeps the short first row, psm 6 reads the
    // longer names better. Each row takes whichever candidate is clearly
    // richer than the mixed table read.
    const names4 = await readLines(nameCrop, 'ara+eng', 4, 'قراءة أسماء المنتجات…', 1800);
    const names6 = await readLines(nameCrop, 'ara+eng', 6, 'تدقيق أسماء المنتجات…', 1800);
    const numbers = await readLines(numCrop, 'eng', 4, 'قراءة أرقام الجدول…', 1600);
    const tol = Math.max(0.012, medianSpacing(body) * 0.55);

    // The name column starts just right of the last numeric header label.
    const header = table.lines[headerIdx];
    let nameStart = band.x + band.w * 0.55;
    if (header && header.words && header.words.length) {
      let numericRight = 0;
      for (const w of header.words) {
        if (VENTE_HEADER_LABELS.some((t) => w.text.includes(t))) {
          numericRight = Math.max(numericRight, w.bbox.x1);
        }
      }
      if (numericRight > 0) nameStart = numericRight + 0.04;
    }

    const rows = [];
    const picks = [];
    for (const line of body) {
      const numLine = nearestByY(numbers && numbers.lines, line.y, tol);
      const nameLine4 = nearestByY(names4 && names4.lines, line.y, tol);
      const nameLine6 = nearestByY(names6 && names6.lines, line.y, tol);
      let nums = numLine ? venteNumbersFromWords(numLine.words) : null;
      // The nearest number line can be a blank separator ("-------"); fall back
      // to the nearest number line that actually carries digits so a product
      // row is not lost to a separator line.
      if (!nums || nums.length === 0) {
        const alt = (numbers && numbers.lines || [])
          .filter((l) => l && /\d/.test(l.text))
          .sort((a, b) => Math.abs(a.y - line.y) - Math.abs(b.y - line.y))[0];
        nums = alt ? venteNumbersFromWords(alt.words) : null;
      }
      if (!nums) {
        nums = venteNumbersFromWords((line.words || []).filter((w) => w.bbox.x1 <= nameStart));
      }
      const triple = venteTriple(nums);
      if (!triple) continue;
      const fromTable = cleanVenteName(venteNameFromWords(line.words, nameStart));
      const fromNames4 = nameLine4 ? cleanVenteName(venteNameFromWords(nameLine4.words, 0)) : '';
      const fromNames6 = nameLine6 ? cleanVenteName(venteNameFromWords(nameLine6.words, 0)) : '';
      // A name crop only wins when it is clearly richer: its extra words are
      // sometimes bleed-through from the numeric columns.
      const qTable = venteNameQuality(fromTable);
      const q4 = venteNameQuality(fromNames4);
      const q6 = venteNameQuality(fromNames6);
      let name = fromTable;
      if (q4 > qTable + 4 && q4 >= q6) name = fromNames4;
      if (q6 > qTable + 4 && q6 > q4) name = fromNames6;
      if (o.debug) picks.push({ y: +line.y.toFixed(4), fromTable, fromNames4, fromNames6, qTable, q4, q6, chosen: name });
      const lineTotal = Math.round(triple.qty * triple.price * 100) / 100;
      rows.push({
        name: name || fromNames6 || fromNames4 || fromTable || ('منتج ' + (rows.length + 1)),
        qty: triple.qty,
        price: triple.price,
        // A row reconciles when its own total equals qty × unit price. A price
        // derived from the printed total still verifies once it reproduces
        // that total exactly.
        verified: Math.abs(lineTotal - triple.total) <= Math.max(0.02, triple.total * 0.001),
        lineTotal: triple.total,
      });
    }
    if (rows.length < 3) return null;
    const out = { text: table.text, rows, lines: body };
    if (o.debug) {
      out.debug = {
        nameStart,
        tol,
        body: body.map((l) => ({ y: +l.y.toFixed(4), text: l.text })),
        names4: (names4 && names4.lines || []).map((l) => ({ y: +l.y.toFixed(4), text: l.text })),
        names6: (names6 && names6.lines || []).map((l) => ({ y: +l.y.toFixed(4), text: l.text })),
        numbers: (numbers && numbers.lines || []).map((l) => ({ y: +l.y.toFixed(4), text: l.text })),
        picks,
      };
    }
    return out;
  }
  // Bounded candidate search. The old code started a brand-new Tesseract worker
  // for up to ~27 recognitions (each reloading the language data), which looked
  // frozen. Now one worker is reused, the default path is 2 attempts per page
  // and the crop pass runs only when nothing usable was found.
  async function ocrImages(images, opts) {
    const o = opts || {};
    const emit = typeof o.onProgress === 'function' ? o.onProgress : null;
    const requested = o.lang ? String(o.lang) : null;
    const fullCandidates = requested
      ? [{ lang: requested, psm: 6 }, { lang: requested, psm: 3 }]
      : [
          { lang: 'fra+eng', psm: 6 },
          { lang: 'ara+eng', psm: 6 },
          { lang: 'ara+eng', psm: 3 },
          { lang: 'fra+eng', psm: 3 },
        ];
    const cropCandidates = requested
      ? [{ lang: requested, psm: 6 }]
      : [
          { lang: 'fra+eng', psm: 6 },
          { lang: 'ara+eng', psm: 6 },
          { lang: 'fra+eng', psm: 3 },
          { lang: 'ara+eng', psm: 3 },
        ];
    // 120 ≈ 3 rows (45) + Description (30) + Qte (15) + Prix (15) + Total (15):
    // header + rows + sane numbers, no need to keep trying worse variants.
    const GOOD_SCORE = 120;
    let deadline = Date.now() + (o.budgetMs || TOTAL_BUDGET_MS);
    let best = { text: '', rows: [], score: -Infinity };
    let attemptNo = 0;
    // The deskewed variant below has white padding, which shifts every crop
    // fraction. Keep the untouched upscale for the table reader.
    const originalSource = images && images[0] && images[0].blob ? images[0].blob : null;

    // Phone photos are often tilted a few degrees. Deskew first (cheap
    // projection estimate) so every later OCR sees straight lines.
    let workImages = images;
    try {
      const src = images && images[0] && images[0].blob;
      if (src && src.type && String(src.type).startsWith('image/')) {
        const deg = await estimateSkewAngle(src);
        if (deg) {
          if (emit) emit({ stage: 'deskew', message: 'تصحيح ميلان الصورة (' + deg + '°)…', progress: null });
          const straight = await createImageVariant(src, { skew: deg, targetWidth: 2200 });
          if (straight && straight !== src) {
            // Try the corrected image first but keep the original as a
            // fallback: a wrong deskew must never be the only evidence.
            workImages = [{ blob: straight, label: 'الصورة المصححة' }, { blob: src, label: 'الصورة الأصلية' }];
            images = workImages;
          }
        }
      }
    } catch (e) { /* deskew is best-effort */ }

    let arabicEvidence = false;
    let venteTried = false;
    const attempt = async (image, c) => {
      throwIfAborted(o.signal);
      if (Date.now() > deadline) throw ocrError('timeout', 'تجاوز الوقت المسموح للقراءة');
      attemptNo += 1;
      const label = 'محاولة ' + attemptNo + ' · ' + langLabel(c.lang) + ' (نمط ' + c.psm + ')';
      if (emit) emit({ stage: 'recognize', message: label + ' — جارٍ القراءة…', progress: null, attempt: attemptNo });
      let text = null;
      try {
        text = await tesseractOcr(image, c.lang, c.psm, {
          signal: o.signal,
          onProgress: emit,
          attemptTimeoutMs: o.attemptTimeoutMs,
          label,
        });
      } catch (e) {
        if (e && e.code === 'aborted') throw e;
        console.warn('[OCR] candidate failed', c, e);
        // A hung/timed-out worker cannot be trusted: drop it so the next
        // attempt starts from a clean process.
        await disposeWorker();
        if (e && e.code === 'timeout') throw e;
        return null;
      }
      if (!text) return null;
      // Track Arabic evidence even when a Latin candidate ends up with the
      // higher score: it decides whether the VENTE table reader is used.
      if (/[\u0600-\u06FF]{2,}/.test(text)) arabicEvidence = true;
      const rows = parseRowsSafe(text);
      const score = scoreOcrResult(text, rows);
      if (score > best.score) best = { text, rows, score };
      if (emit) {
        emit({
          stage: 'parse',
          message: 'تمت قراءة نص — ' + rows.length + ' صف محتمل',
          progress: null,
          rows: rows.length,
        });
      }
      return { text, rows };
    };

    // Printed Arabic VENTE-COMPTOIR receipts: the generic crop search burns
    // the whole budget on 20+ variants without ever reading the table body.
    // The dedicated table + numeric-block reader is arithmetic-checked row by
    // row, so it may end the search immediately.
    const runVente = async () => {
      if (!originalSource) return null;
      if (emit) emit({ stage: 'table', message: 'قراءة جدول الفاتورة العربية…', progress: null });
      try {
        const vente = await readVenteTable(originalSource, {
          signal: o.signal,
          emit,
          attemptTimeoutMs: o.attemptTimeoutMs,
        });
        if (vente && vente.rows.length >= 3) {
          venteTried = true; // only mark as tried when we actually got a result
          const score = scoreOcrResult(vente.text, vente.rows);
          if (score > best.score || vente.rows.length > best.rows.length) {
            best = { text: vente.text, rows: vente.rows, score };
          }
          if (vente.rows.length >= 5) {
            return { text: vente.text, rows: vente.rows };
          }
        }
      } catch (e) {
        if (e && e.code === 'aborted') throw e;
        console.warn('[OCR] vente table pass failed', e);
      }
      return null;
    };

    for (let i = 0; i < images.length; i++) {
      const img = images[i] || {};
      if (emit) {
        emit({
          stage: 'page',
          message: (images.length > 1 ? 'الصفحة ' + (i + 1) + ' من ' + images.length + ' — ' : '') + 'جارٍ تحليل الجدول…',
          progress: images.length > 1 ? i / images.length : null,
        });
      }
      for (const c of fullCandidates) {
        await attempt(img.blob, c);
        // An Arabic receipt goes straight to the VENTE table reader; more
        // full-page variants only repeat the same misread.
        if (arabicEvidence) {
          const v = await runVente();
          if (v) return v;
          // If vente table returned null, keep trying other candidates
          // instead of giving up on the first Arabic pass.
          continue;
        }
        if (best.score >= GOOD_SCORE && best.rows.length >= 2) {
          // Latin money tables ("3,800.00") still need the row-band pass:
          // their generic rows glue the client block to row 1 and split the
          // money columns, so a high score here is not trustworthy. The
          // check must look at the printed header too: OCR often reads
          // "3.500.00" as "350000" (no separators), and the money-shape
          // guard alone would early-return the garbage generic rows before
          // the Latin pass can run.
          const latinMoney = ((best.text || '').match(/\d{1,3}(?:[.,]\d{3})[.,]\d{2}/g) || []).length >= 2;
          const latinKw = /d[ée]signation|bon\s+de\s+caisse|r[ée]f[ée]rence|p\.?\s*u\.?\s*v|montant/i.test(best.text || '');
          // Early exit only when the printed grand total reconciles (or no
          // total was printed). Bogus rows can score high on count alone.
          const tm = (best.text || '').match(/مبلغ\s*الوصل\s*:?\s*([0-9][0-9 ]*[.,][0-9]{2})/) ||
            (best.text || '').match(/TOTAL\s*TTC\D*([0-9][0-9 ]*[.,][0-9]{2})/i) ||
            (best.text || '').match(/MONTANT\s*HT\D*([0-9][0-9 ]*[.,][0-9]{2})/i);
          if (!latinKw && !latinMoney && !tm) return { text: best.text, rows: best.rows };
          const expected = latinMoney ? 0 : tm ? parseAmount(tm[1]) : 0;
          const actual = best.rows.reduce((s, r) => s + ((parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0)), 0);
          if (!latinKw && !latinMoney && expected > 0 && actual > 0 && Math.abs(actual - expected) / Math.max(1, expected) < 0.02) {
            return { text: best.text, rows: best.rows };
          }
        }
        // Arabic table detected but unreconciled: stop burning full-page
        // attempts and go to row-band + numeric-cell reading instead.
        if (/[\u0600-\u06FF]/.test(best.text || '') && best.rows.length >= 3) break;
      }
    }

    // A couple of bogus rows (date/summary misread as products) must not stop
    // the crop pass: only a reconciled, high-scoring table is "good enough".
    const reconciles = () => {
      if (!best.rows.length) return false;
      const txt = best.text || '';
      const m = txt.match(/مبلغ\s*الوصل\s*:?\s*([0-9][0-9 ]*[.,][0-9]{2})/) ||
        txt.match(/TOTAL\s*TTC\D*([0-9][0-9 ]*[.,][0-9]{2})/i) ||
        txt.match(/MONTANT\s*HT\D*([0-9][0-9 ]*[.,][0-9]{2})/i);
      if (!m) return true; // no printed total to reconcile against
      const expected = parseAmount(m[1]);
      if (!(expected > 0)) return true;
      const actual = best.rows.reduce((s, r) => s + ((parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0)), 0);
      return actual > 0 && Math.abs(actual - expected) / Math.max(1, expected) < 0.02;
    };
    const isGood = () => best.score >= GOOD_SCORE && best.rows.length >= 2 && reconciles();

    if (!isGood()) {
      // Re-OCR only the table band. A small screenshot makes the whole page
      // see the header, grid lines and footer, but loses the product rows.
      const cropSpecs = [
        { crop: { x: 0.02, y: 0.22, w: 0.96, h: 0.62 }, targetWidth: 2400 },
        { crop: { x: 0.02, y: 0.24, w: 0.96, h: 0.60 }, targetWidth: 2400, threshold: true },
        // Arabic VENTE-COMPTOIR: table only (header + rows, summary excluded
        // so "مبلغ الوصل / عدد القطع" can never become product rows).
        { crop: { x: 0.03, y: 0.16, w: 0.94, h: 0.48 }, targetWidth: 2400, threshold: true, thresholdValue: 175 },
        { crop: { x: 0.03, y: 0.15, w: 0.94, h: 0.52 }, targetWidth: 2400, contrast: true, threshold: true, thresholdValue: 160 },
        // Thin fonts: gamma-darken first so binarization keeps strokes.
        { crop: { x: 0.02, y: 0.22, w: 0.96, h: 0.62 }, targetWidth: 2400, contrast: true, threshold: true, thresholdValue: 150 },
        // White-on-black header bands (dark table head): inverted text.
        { crop: { x: 0.02, y: 0.22, w: 0.96, h: 0.62 }, targetWidth: 2400, invert: true, threshold: true },
      ];
      const source = images[0] && images[0].blob;
      for (const spec of cropSpecs) {
        if (!source || Date.now() > deadline) break;
        if (isGood()) break;
        const cropped = await createImageVariant(source, spec);
        if (cropped === source) continue;
        if (emit) emit({ stage: 'crop', message: 'تحسين صورة الجدول وإعادة القراءة…', progress: null });
        for (const c of cropCandidates) {
          await attempt(cropped, c);
          // A bogus first candidate (Latin gibberish on an Arabic table) must
          // not stop the Arabic candidate on the same crop.
          if (isGood()) break;
        }
      }
    }

    // Row-band pass: when full-page and cropped reads still do not reconcile
    // (digits misread as 35 / 1 / 0.06, rows dropped), OCR the table one row
    // at a time. Single-line segmentation is far more reliable for printed
    // Arabic tables, and each band is arithmetic-checked against its printed
    // line total. Numeric cells are re-read with English-only digit data
    // (Western digits) when the Arabic pass fails the triple check.
    const rowsReconcile = () => {
      if (!best.rows.length) return false;
      const m = (best.text || '').match(/مبلغ\s*الوصل\s*:?\s*([0-9][0-9 ]*[.,][0-9]{2})/);
      if (!m) return false;
      const expected = parseAmount(m[1]);
      if (!(expected > 0)) return false;
      const actual = best.rows.reduce((s, r) => s + ((parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0)), 0);
      return Math.abs(actual - expected) / Math.max(1, expected) < 0.02;
    };
    const isArabicInvoice = /[\u0600-\u06FF]/.test(best.text || '') || /مبلغ\s*الوصل/.test(best.text || '');
    // A Latin invoice whose printed header is already clear ("Désignation"/
    // "Bon de Caisse"/"Référence"/"PUV"/"Montant") never needs the Arabic
    // row-band retry: that pass burns most of the budget on Arabic UI/footer
    // text of phone screenshots and can push the Latin pass past the deadline.
    const latinHeaderStrong = /d[ée]signation|bon\s+de\s+caisse|r[ée]f[ée]rence|p\.?\s*u\.?\s*v|montant/i.test(best.text || '');
    if (isArabicInvoice && !latinHeaderStrong && (best.rows.length < 2 || best.score < GOOD_SCORE || !rowsReconcile()) && Date.now() < deadline) {
      try {
        const source = (images && images[0] && images[0].blob) || null;
        if (source) {
          if (emit) emit({ stage: 'rows', message: 'قراءة الجدول صف-بصف…', progress: null });
          const det = await detectRowBands(source);
          const bands = det.bands || (() => {
            const list = [];
            const h = (det.bottom - det.top) / Math.max(1, det.count);
            for (let i = 0; i < det.count; i++) list.push({ y0: det.top + h * i, y1: det.top + h * (i + 1) });
            return list;
          })();
          const bandLines = [];
          for (const band of bands) {
            if (Date.now() > deadline) break;
            // Band crop with a little vertical padding so strokes are not cut.
            const pad = Math.max(0.002, (band.y1 - band.y0) * 0.12);
            const spec = { crop: { x: 0.02, y: Math.max(0, band.y0 - pad), w: 0.96, h: Math.min(1, band.y1 + pad) - Math.max(0, band.y0 - pad) }, targetWidth: 2000, threshold: true, thresholdValue: 180 };
            const bandImg = await createImageVariant(source, spec);
            if (!bandImg || bandImg === source) continue;
            let bandText = null;
            for (const c of [{ lang: 'ara+eng', psm: 6 }, { lang: 'fra+eng', psm: 6 }]) {
              if (Date.now() > deadline) break;
              attemptNo += 1;
              try {
                const txt = await tesseractOcr(bandImg, c.lang, c.psm, { signal: o.signal, attemptTimeoutMs: o.attemptTimeoutMs, label: 'صف' });
                if (txt && txt.trim()) {
                  const rows = parseRowsSafe(txt);
                  if (rows.length) { bandText = txt.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || txt.trim(); break; }
                  if (!bandText) bandText = txt.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || txt.trim();
                }
              } catch (e) {
                if (e && e.code === 'aborted') throw e;
                await disposeWorker();
                if (e && e.code === 'timeout') throw e;
              }
            }
            bandLines.push(bandText || '');
          }
          if (bandLines.length >= 3) {
            const printed = (best.text || '').match(/مبلغ\s*الوصل\s*:?\s*([0-9][0-9 ]*[.,][0-9]{2})/);
            const combined = bandLines.join('\n') +
              '\nالرقم الصنف العلب المحتوى القطع سعر الوحدة المجموع' +
              (printed ? '\nمبلغ الوصل : ' + printed[1] : '');
            const rows = parseRowsSafe(combined);
            const score = scoreOcrResult(combined, rows);
            const verifiedCount = (list) => (list || []).filter((r) => r && r.verified).length;
            if (rows.length > best.rows.length || score > best.score || verifiedCount(rows) > verifiedCount(best.rows)) {
              best = { text: combined, rows, score };
            }
            // Numeric-cell retry for bands that did not yield a row: read the
            // right-hand numeric columns with English digits only.
            if (!rowsReconcile() && Date.now() < deadline) {
              const fixed = [];
              for (let i = 0; i < bands.length; i++) {
                const line = bandLines[i] || '';
                const parsed = parseArabicRowLine(line);
                // Verified rows keep their line; healed/clean-pair rows (bad
                // total, missing total) are re-read from the numeric cells.
                if (parsed && parsed.verified) { fixed.push(line); continue; }
                const band = bands[i];
                const pad = Math.max(0.002, (band.y1 - band.y0) * 0.12);
                const y0 = Math.max(0, band.y0 - pad);
                const numSpec = { crop: { x: 0.55, y: y0, w: 0.44, h: Math.min(1, band.y1 + pad) - y0 }, targetWidth: 1600, threshold: true, thresholdValue: 180 };
                const numImg = await createImageVariant(source, numSpec);
                if (!numImg || numImg === source) { fixed.push(line); continue; }
                let numText = '';
                try {
                  attemptNo += 1;
                  numText = (await tesseractOcr(numImg, 'eng', 6, { signal: o.signal, attemptTimeoutMs: o.attemptTimeoutMs, label: 'أرقام الصف' })) || '';
                } catch (e) {
                  if (e && e.code === 'aborted') throw e;
                  await disposeWorker();
                }
                const nameSpec = { crop: { x: 0.02, y: y0, w: 0.56, h: Math.min(1, band.y1 + pad) - y0 }, targetWidth: 1600, threshold: true, thresholdValue: 180 };
                const nameImg = await createImageVariant(source, nameSpec);
                let nameText = line;
                if (nameImg && nameImg !== source) {
                  try {
                    attemptNo += 1;
                    nameText = (await tesseractOcr(nameImg, 'ara+eng', 6, { signal: o.signal, attemptTimeoutMs: o.attemptTimeoutMs, label: 'اسم الصف' })) || line;
                    nameText = String(nameText).trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || line;
                  } catch (e) {
                    if (e && e.code === 'aborted') throw e;
                    await disposeWorker();
                  }
                }
                const merged = (nameText + ' ' + String(numText).trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ')).trim();
                fixed.push(parseArabicRowLine(merged) ? merged : line);
              }
              const fixedText = fixed.join('\n');
              const fixedRows = parseRowsSafe(fixedText);
              const fixedScore = scoreOcrResult(best.text, fixedRows);
              if (fixedRows.length > best.rows.length || fixedScore > best.score || verifiedCount(fixedRows) > verifiedCount(best.rows)) {
                best = { text: fixedText, rows: fixedRows, score: fixedScore };
              }
            }
          }
        }
      } catch (e) {
        if (e && e.code === 'aborted') throw e;
        console.warn('[OCR] row-band pass failed', e);
      }
    }

    // Latin printed tables (Bon de Caisse, factures): the full-page read
    // glues the client block to the first row and splits the money columns.
    // Read the table one row band at a time and parse each band with the
    // money-shaped scanner (comma thousands + dot decimals). A phone
    // screenshot of a Latin invoice often contains Arabic UI chrome, so this
    // gate is driven by the printed table header / money shapes, never by the
    // absence of Arabic.
    const latinEvidence =
      /d[ée]signation|bon\s+de\s+caisse|r[ée]f[ée]rence|p\.?\s*u\.?\s*v|montant/i.test(best.text || '') ||
      ((best.text || '').match(/\d{1,3}(?:[.,]\d{3})[.,]\d{2}/g) || []).length >= 3;
    const latinSuspicious = best.rows.length < 2 || best.rows.some((r) => {
      const q = parseFloat(r.qty) || 0;
      const p = parseFloat(r.price) || 0;
      return !(q > 0) || !(p > 0) || q > 100000 || p > 1000000 || q * p > 10000000 ||
        Math.abs(q - Math.round(q)) > 0.001;
    });
    // A printed Latin grand total that the generic rows already match means
    // the fast path was right; only then skip the extra row-band reads.
    const latinPrintedTotal = (() => {
      const m = (best.text || '').match(/(?:total\s*g?|montant\s*total)\s*:?\s*([0-9][0-9 .,]*[0-9])/i);
      return m ? parseLatinMoney(m[1]) : 0;
    })();
    const latinRowsSum = best.rows.reduce((s, r) => s + ((parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0)), 0);
    const latinReconciles = latinPrintedTotal > 0 && latinRowsSum > 0 &&
      Math.abs(latinRowsSum - latinPrintedTotal) / latinPrintedTotal < 0.02;
    // The Latin pass always gets its own time slice: the generic + Arabic
    // passes can eat the shared deadline on slower machines before this
    // section runs, and the generic rows must not win by timeout.
    if (latinEvidence && (!latinReconciles || latinSuspicious || o.debugLatin)) {
      deadline = Math.max(deadline, Date.now() + 90000);
      try {
        const source = (images && images[0] && images[0].blob) || null;
        if (source) {
          if (emit) emit({ stage: 'rows', message: 'قراءة جدول الفاتورة صف-بصف…', progress: null });
          const det = await detectRowBands(source);
          // Fallback when the grid is dashed and no lines were found: split
          // the table span evenly (same fallback as the Arabic pass).
          const bands = det.bands || (() => {
            const list = [];
            const h = (det.bottom - det.top) / Math.max(1, det.count || 12);
            for (let i = 0; i < (det.count || 12); i++) list.push({ y0: det.top + h * i, y1: det.top + h * (i + 1) });
            return list;
          })();
          // Column fractions: read the header band's word boxes so the name
          // and money crops follow the printed table instead of a guessed
          // layout. Falls back to the common N°/Référence/Désignation/Marque/
          // Qté/PUV/Montant proportions.
          let cols = { nameX: 0.19, nameW: 0.38, numX: 0.70, numW: 0.25 };
          for (const band of bands.slice(0, 3)) {
            if (Date.now() > deadline) break;
            const pad = Math.max(0.002, (band.y1 - band.y0) * 0.12);
            const y0 = Math.max(0, band.y0 - pad);
            const spec = {
              crop: { x: 0.02, y: y0, w: 0.96, h: Math.min(1, band.y1 + pad) - y0 },
              targetWidth: 2400,
              threshold: true,
              thresholdValue: 190,
            };
            const img = await createImageVariant(source, spec);
            if (!img || img === source) continue;
            let res = null;
            try {
              attemptNo += 1;
              res = await tesseractOcr(img, 'fra+eng', 4, {
                withLines: true,
                signal: o.signal,
                attemptTimeoutMs: o.attemptTimeoutMs,
                label: 'ترويسة',
              });
            } catch (e) {
              if (e && e.code === 'aborted') throw e;
              await disposeWorker();
              continue;
            }
            const words = (res && res.lines ? res.lines : []).reduce((a, l) => a.concat(l.words || []), []);
            const dims = await imageDimensions(img);
            if (!words.length || !dims || !dims.w) continue;
            const fx = (px) => 0.02 + 0.96 * (px / dims.w);
            const des = words.find((w) => /d[ée]signation/i.test(w.text) && w.bbox);
            const mar = words.find((w) => /^marque$/i.test(w.text) && w.bbox);
            const qte = words.find((w) => /^(qt[ée]|qte)$/i.test(w.text) && w.bbox);
            if (!des || !mar) continue;
            const nx = Math.max(0.02, fx(des.bbox.x0) - 0.012);
            const nw = Math.min(0.98 - nx, fx(mar.bbox.x1) - nx + 0.006);
            const mx = qte ? Math.max(nx + nw + 0.005, fx(qte.bbox.x0) - 0.01) : nx + nw + 0.012;
            // Header word boxes are unreliable on narrow phone screenshots
            // (the Désignation box can land far right and slice names in
            // half). Only trust a detected layout that stays in the printed
            // table's plausible column range; otherwise keep the defaults
            // that are validated against real Bon de Caisse photos.
            const plausible = nx >= 0.10 && nx <= 0.30 && nw >= 0.20 && nw <= 0.60 &&
              mx >= 0.55 && mx <= 0.82 && (0.98 - mx) >= 0.14;
            if (plausible) {
              cols = { nameX: nx, nameW: nw, numX: mx, numW: Math.max(0.12, 0.98 - mx) };
            }
            break;
          }
          const flat = (t) => String(t || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ');
          // Printed product total (not Total G, which adds old credit) lets
          // the pass choose between per-config readings that disagree on one
          // digit (5 read as 6/8 in both money columns of a row). The
          // full-page text often mangles the Total block, so read the strip
          // just below the table separately and search every candidate
          // target (labels or lone money tokens) for the best reconciliation.
          const productsTargets = (() => {
            const m = (best.text || '').match(/total\s*(?!g\b)\s*:?\s*([0-9][0-9 .,]*[0-9])/i);
            return m ? parseLatinMoney(m[1]) : 0;
          })() || 0;
          const targetSet = new Set(productsTargets > 0 ? [productsTargets] : []);
          const pullMoney = (text) => {
            (String(text || '').match(/\d[\d\s.,]*[.,]\d{2}/g) || []).slice(0, 40).forEach((tok) => {
              const v = parseLatinMoney(tok);
              if (v > 0) targetSet.add(v);
            });
          };
          pullMoney(best.text);
          const bandGroups = [];
          // One row-band read: name crop, several numbers configs, two
          // single-cell reads, and a full-band fallback. Candidates
          // accumulate in bandGroups. In light (window) mode only the two
          // best configs run so many windows stay affordable.
          const collectBand = async (y0c, y1c, light) => {
            if (Date.now() > deadline) return;
            const pad = Math.max(0.002, (y1c - y0c) * 0.12);
            const y0 = Math.max(0, y0c - pad);
            const h = Math.min(1, y1c + pad) - y0;
            if (h < 0.004) return;
            let nameText = '';
            try {
              attemptNo += 1;
              const img = await createImageVariant(source, {
                crop: { x: cols.nameX, y: y0, w: cols.nameW, h },
                targetWidth: 2400,
                threshold: true,
                thresholdValue: 190,
              });
              if (img && img !== source) {
                nameText = flat(await tesseractOcr(img, 'fra+eng', 4, {
                  signal: o.signal,
                  attemptTimeoutMs: o.attemptTimeoutMs,
                  label: 'اسم الصف',
                }));
              }
            } catch (e) {
              if (e && e.code === 'aborted') throw e;
              await disposeWorker();
            }
            // Money columns: a digit whitelist keeps Tesseract from inventing
            // letters ("rse0c0") on tiny phone-screenshot columns. No single
            // binarization reads every row (a 5 is seen as 6/8 under one
            // threshold and cleanly under another), so several configs are
            // tried and their parsed readings collected as candidates.
            const configs = light
              ? [{ tw: 3000, thr: 190 }, { tw: 3000, thr: 190, smooth: false }]
              : [
                { tw: 3000, thr: 190 },
                { tw: 3000, thr: 190, smooth: false },
                { tw: 3000, smooth: false },
                { tw: 3000, thr: 170 },
                { tw: 3000, thr: 170, smooth: false },
                { tw: 3000 },
              ];
            const cands = new Map();
            const addCand = (row) => {
              if (!row || !(row.price > 0) || !(row.lineTotal > 0) || !(row.qty > 0)) return;
              const key = row.qty + '|' + row.price + '|' + row.lineTotal;
              const prev = cands.get(key);
              if (prev) {
                prev.count += 1;
                if (row.verified) prev.verifiedCount += 1;
              } else {
                cands.set(key, { row, count: 1, verifiedCount: row.verified ? 1 : 0 });
              }
            };
            const confirmedExact = () =>
              [...cands.values()].some((c) => c.verifiedCount >= 2);
            for (const cfg of configs) {
              if (Date.now() > deadline) break;
              if (confirmedExact()) break;
              try {
                attemptNo += 1;
                const img = await createImageVariant(source, {
                  crop: { x: cols.numX, y: y0, w: cols.numW, h },
                  targetWidth: cfg.tw,
                  threshold: cfg.thr != null,
                  thresholdValue: cfg.thr,
                  smooth: cfg.smooth,
                });
                if (!img || img === source) continue;
                const t = flat(await tesseractOcr(img, 'eng', 4, {
                  whitelist: '0123456789., ',
                  signal: o.signal,
                  attemptTimeoutMs: o.attemptTimeoutMs,
                  label: 'أرقام الصف',
                }));
                if (t) {
                  addCand(parseLatinRowLine(t, { name: nameText }) ||
                    parseLatinRowLine(t, { name: nameText, relax: true }));
                }
              } catch (e) {
                if (e && e.code === 'aborted') throw e;
                await disposeWorker();
              }
            }
            // Single-cell reads: PUV (qty + unit price) and Montant crops
            // with psm 7 isolate one column per read. A cell-specific config
            // often reads a digit the combined crop gets wrong ("10,500"
            // greyscale-only read is exact where the thresholded pair read
            // 10,800 in both columns).
            if (!confirmedExact()) {
              const cellRead = async (x, w, cfg) => {
                if (Date.now() > deadline) return '';
                try {
                  attemptNo += 1;
                  const img = await createImageVariant(source, {
                    crop: { x, y: y0, w, h },
                    targetWidth: cfg.tw || 2400,
                    threshold: cfg.thr != null,
                    thresholdValue: cfg.thr,
                    smooth: cfg.smooth,
                  });
                  if (!img || img === source) return '';
                  return flat(await tesseractOcr(img, 'eng', 7, {
                    whitelist: '0123456789., ',
                    signal: o.signal,
                    attemptTimeoutMs: o.attemptTimeoutMs,
                    label: 'خلية الصف',
                  }));
                } catch (e) {
                  if (e && e.code === 'aborted') throw e;
                  await disposeWorker();
                  return '';
                }
              };
              const pwX = Math.max(0.02, cols.numX - 0.02);
              const twX = Math.min(0.93, cols.numX + 0.10);
              let pwText = await cellRead(pwX, 0.15, { thr: 190 });
              let twText = await cellRead(twX, 0.15, { thr: 190 });
              addCand(cellPairLatinRow(pwText, twText, nameText));
              if (!confirmedExact() && Date.now() < deadline) {
                pwText = await cellRead(pwX, 0.15, { smooth: false });
                twText = await cellRead(twX, 0.15, { thr: 190 });
                addCand(cellPairLatinRow(pwText, twText, nameText));
              }
            }
            if (!cands.size) {
              // Fallback: the whole band with its own inline name column.
              try {
                attemptNo += 1;
                const img = await createImageVariant(source, {
                  crop: { x: 0.02, y: y0, w: 0.96, h },
                  targetWidth: 2400,
                  threshold: true,
                  thresholdValue: 190,
                });
                if (img && img !== source) {
                  const bandText = flat(await tesseractOcr(img, 'fra+eng', 4, {
                    signal: o.signal,
                    attemptTimeoutMs: o.attemptTimeoutMs,
                    label: 'صف',
                  }));
                  addCand(parseLatinRowLine(bandText) || parseLatinRowLine(bandText, { relax: true }));
                }
              } catch (e) {
                if (e && e.code === 'aborted') throw e;
                await disposeWorker();
              }
            }
            if (cands.size) {
              bandGroups.push({ candidates: [...cands.values()] });
            }
          };
          for (const band of bands) {
            if (Date.now() > deadline) break;
            await collectBand(band.y0, band.y1);
          }
          // Last resort when grid detection produced nothing (faint dotted
          // rules, dark background): overlapping uniform windows over the
          // table span so some window fully covers every digit line.
          if (bandGroups.length < 3) {
            const top2 = 0.10;
            const bottom2 = Math.min(0.95, (det.bottom != null ? det.bottom : 0.64) + 0.30);
            const N = 24;
            const span = Math.max(0.20, bottom2 - top2);
            const step = span / N;
            const win = step * 2.4;
            for (let k = 0; k < N - 1; k++) {
              if (Date.now() > deadline) break;
              if (bandGroups.length >= 10) break;
              const wy0 = Math.max(0, top2 + k * step - win * 0.25);
              const wy1 = Math.min(1, wy0 + win);
              await collectBand(wy0, wy1, true);
            }
          }
          if (bandGroups.length < 3 && best.text) {
            // Last lane when band crops yield too few groups (blurry photo):
            // parse each full-page OCR line that carries qty + two money
            // tokens. Bare integers ("350000") count as centimes.
            const lines2 = String(best.text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const txtGroups = [];
            for (const line of lines2) {
              if (Date.now() > deadline) break;
              const row = parseLatinRowLine(line) || parseLatinRowLine(line, { relax: true });
              if (row) txtGroups.push({ candidates: [{ row, count: 1, verifiedCount: row.verified ? 1 : 0 }] });
            }
            if (txtGroups.length > bandGroups.length) {
              bandGroups.splice(0, bandGroups.length, ...txtGroups);
            }
          }
          const scoreOf = (c) => (c.row.verified ? 100 : 30) + (c.count - 1) * 10 + Math.min(c.verifiedCount, 2) * 5;
          for (const g of bandGroups) {
            g.candidates.sort((a, b) => scoreOf(b) - scoreOf(a));
            g.candidates = g.candidates.slice(0, 6);
          }
          // Totals strip below the table: read it directly (the full-page
          // text mangles "Total"/"Total G" on phone screenshots) to find the
          // printed product total for reconciliation.
          if (Date.now() < deadline && bands.length) {
            try {
              const lastBand = bands[bands.length - 1];
              const ty0 = Math.min(0.96, lastBand.y1 + 0.004);
              const th = Math.min(1 - ty0, 0.16);
              if (th >= 0.03) {
                attemptNo += 1;
                const timg = await createImageVariant(source, {
                  crop: { x: 0.02, y: ty0, w: 0.96, h: th },
                  targetWidth: 2400,
                  threshold: true,
                  thresholdValue: 190,
                });
                if (timg && timg !== source) {
                  const ttext = flat(await tesseractOcr(timg, 'fra+eng', 4, {
                    signal: o.signal,
                    attemptTimeoutMs: o.attemptTimeoutMs,
                    label: 'مجاميع الفاتورة',
                  }));
                  if (ttext) {
                    const labelled = ttext.match(/total\s*(?!g\b)[^\n]*?(\d{1,3}(?:[.,]\d{3})[.,]\d{2})/i);
                    if (labelled) {
                      const lv = parseLatinMoney(labelled[1]);
                      if (lv > 0) targetSet.add(lv);
                    }
                    pullMoney(ttext);
                  }
                }
                // Values-only right column with the digit whitelist (the
                // same setup that reads the row money crops).
                if (Date.now() < deadline) {
                  attemptNo += 1;
                  const vimg = await createImageVariant(source, {
                    crop: { x: 0.70, y: ty0, w: 0.27, h: th },
                    targetWidth: 3000,
                    threshold: true,
                    thresholdValue: 190,
                  });
                  if (vimg && vimg !== source) {
                    const vtext = flat(await tesseractOcr(vimg, 'eng', 4, {
                      whitelist: '0123456789., ',
                      signal: o.signal,
                      attemptTimeoutMs: o.attemptTimeoutMs,
                      label: 'قيم المجاميع',
                    }));
                    if (vtext) pullMoney(vtext);
                  }
                }
              }
            } catch (e) {
              if (e && e.code === 'aborted') throw e;
              await disposeWorker();
            }
          }
          const latinRows = [];
          const groups = bandGroups;
          // Printable products total from pair differences when the Total
          // line itself is unreadable: Total G − Ancien Crédit = Total.
          if (targetSet.size >= 2) {
            const base = [...targetSet];
            for (let i = 0; i < base.length; i++) {
              for (let j = i + 1; j < base.length; j++) {
                const d = Math.abs(base[i] - base[j]);
                if (d > 0) targetSet.add(Math.round(d * 100) / 100);
              }
            }
          }
          // Global reconciliation: pick one candidate per row so the sum of
          // line totals matches the printed product total. Only applied when
          // the printed total itself looks readable (best combo within 2%).
          let picked = null;
          if (targetSet.size && groups.length >= 2 && groups.length <= 8) {
            const targets = [...targetSet].filter((v) => v > 0);
            let bestCombo = null;
            let bestCost = Infinity;
            let bestDiff = Infinity;
            for (const productsTotal of targets) {
              const totalCombos = groups.reduce((n, g) => n * g.candidates.length, 1);
              for (let n = 0; n < totalCombos; n++) {
                let rest = n;
                let sum = 0;
                let unv = 0;
                for (let i = 0; i < groups.length; i++) {
                  const c = groups[i].candidates[rest % groups[i].candidates.length];
                  rest = Math.floor(rest / groups[i].candidates.length);
                  sum += c.row.lineTotal;
                  if (!c.row.verified) unv += 1;
                }
                const diff = Math.abs(sum - productsTotal);
                const cost = diff + 25 * unv;
                if (cost < bestCost) {
                  bestCost = cost;
                  bestDiff = diff;
                  bestCombo = { combo: [], sum, diff, target: productsTotal };
                  let r = n;
                  for (let i = 0; i < groups.length; i++) {
                    bestCombo.combo.push(groups[i].candidates[r % groups[i].candidates.length]);
                    r = Math.floor(r / groups[i].candidates.length);
                  }
                }
              }
            }
            if (bestCombo && bestCombo.target > 0 && bestDiff / bestCombo.target <= 0.02) {
              picked = bestCombo.combo.map((c) => c.row);
            }
          }
          if (!picked) {
            picked = groups.map((g) => g.candidates[0].row);
          }
          latinRows.push(...picked);
          if (latinRows.length >= 3) {
            const score = scoreOcrResult(best.text, latinRows);
            // When the generic rows are suspicious (fractional quantities,
            // absurd totals) and never reconciled, the band/text candidates
            // win even if the garbage parse happens to score higher on
            // row count alone.
            if (latinRows.length >= best.rows.length || score > best.score || (latinSuspicious && !latinReconciles)) {
              best = { text: best.text, rows: latinRows, score };
            }
          }
        }
      } catch (e) {
        if (e && e.code === 'aborted') throw e;
        console.warn('[OCR] latin row-band pass failed', e);
      }
    }
    return { text: best.text, rows: best.rows };
  }

  // ---------- main entry ----------
  function finalizeOcr(res, source, pages, rawText) {
    const rows = (res && res.rows) || [];
    const text = (res && res.text) || rawText || '';
    if (rows.length) return { source, rows, rawText: text, pages };
    return { source: 'none', rows: [], rawText: text, pages, reason: text ? 'no-table' : 'no-text' };
  }

  async function ocrFile(file, opts) {
    opts = opts || {};
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const signal = opts.signal || null;
    const emit = (p) => {
      if (!onProgress) return;
      try { onProgress(Object.assign({ at: Date.now() }, p)); } catch (e) {}
    };
    const fileName = String((file && file.name) || '');
    const fileType = String((file && file.type) || '').toLowerCase();
    const isPdf = /\.pdf$/i.test(fileName) || fileType === 'application/pdf';
    const isImg = /\.(png|jpe?g|jfif|webp|gif|bmp|tiff?|avif)$/i.test(fileName) || /^image\//.test(fileType);
    if (!file) throw ocrError('no-file', 'لم يتم اختيار ملف');
    if (!isPdf && !isImg) throw ocrError('unsupported', 'صيغة الملف غير مدعومة');
    if (isAborted(signal)) throw ocrError('aborted', 'تم إلغاء العملية');

    emit({ stage: 'init', message: 'جارٍ تحضير محرك القراءة المحلي…', progress: null });
    const libs = await ensureLibs();
    if (!libs || !libs.tesseract) {
      throw ocrError('lib-missing', 'محرّك القراءة المحلي غير متوفّر');
    }

    // Cancelling the UI must free the worker immediately, not at the end of a
    // 45-second recognition.
    const onAbort = () => { disposeWorker(); };
    if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort);

    try {
      let lastRawText = '';
      let pages = 1;

      // 1) PDF text layer first — fastest and most accurate when it exists.
      if (isPdf) {
        emit({ stage: 'pdf-text', message: 'محاولة قراءة النص المضمّن في PDF…', progress: null });
        let text = null;
        try {
          text = await withTimeout(pdfText(file), 30000, 'pdf-timeout');
        } catch (e) {
          console.warn('[OCR] pdf text layer unavailable', e);
          text = null;
        }
        if (text) lastRawText = text;
        const textRows = parseRowsSafe(text);
        if (textRows.length) {
          const latin = latinTextRows(text, textRows);
          if (latin) {
            emit({ stage: 'done', message: 'تمت القراءة من نص PDF مباشرة', progress: 1, rows: latin.length });
            return { source: 'pdf-text', rows: latin, rawText: text, pages: 1 };
          }
          emit({ stage: 'done', message: 'تمت القراءة من نص PDF مباشرة', progress: 1, rows: textRows.length });
          return { source: 'pdf-text', rows: textRows, rawText: text, pages: 1 };
        }
        throwIfAborted(signal);

        // 2) Scanned PDF: render the first pages and OCR them as images.
        emit({ stage: 'render', message: 'PDF بلا طبقة نص — تحويل الصفحات إلى صور…', progress: null });
        let pageBlobs = [];
        try {
          pageBlobs = await pdfPageBlobs(file, {
            maxPages: 2,
            targetWidth: 1800,
            signal,
            onProgress: emit,
          });
        } catch (e) {
          if (e && e.code === 'aborted') throw e;
          console.warn('[OCR] pdf render failed', e);
        }
        if (!pageBlobs.length) {
          if (lastRawText) {
            return { source: 'pdf-text', rows: [], rawText: lastRawText, pages: 1, reason: 'no-table' };
          }
          throw ocrError('pdf-render', 'تعذّر تحويل صفحات PDF إلى صور');
        }
        pages = pageBlobs.length;
        const images = pageBlobs.map((p) => ({ blob: p.blob, label: 'صفحة ' + p.page }));
        const ocr = await ocrImages(images, {
          signal,
          onProgress: emit,
          attemptTimeoutMs: opts.attemptTimeoutMs,
          budgetMs: opts.budgetMs,
          lang: opts.lang,
          debugLatin: opts.debugLatin,
        });
        if (ocr.text) lastRawText = ocr.text;
        return finalizeOcr(ocr, 'tesseract', pages, lastRawText);
      }

      // 3) Image: upscale small screenshots, then OCR.
      emit({ stage: 'prepare', message: 'تحسين الصورة قبل القراءة…', progress: null });
      const image = await upscaleImageForOcr(file);
      throwIfAborted(signal);
      const ocr = await ocrImages([{ blob: image, label: 'الصورة' }], {
        signal,
        onProgress: emit,
        attemptTimeoutMs: opts.attemptTimeoutMs,
        budgetMs: opts.budgetMs,
        lang: opts.lang,
        debugLatin: opts.debugLatin,
      });
      return finalizeOcr(ocr, 'tesseract', 1, ocr.text);
    } finally {
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort);
      scheduleWorkerIdle();
    }
  }

  window.InvoiceOCR = {
    ocrFile, parseRowsFromText, parseInvoiceText, parseAmount,
  };
})();
