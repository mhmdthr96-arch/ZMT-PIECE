// ============================================================================
// ZMT PIECE — FACTURE DE RETOUR (return invoice)
//
// One French A4 document per original invoice. It prints only the products the
// customer actually returned, using the exact money snapshotted on each return
// row (`price` / `total`). Legacy returns without a snapshot fall back to the
// original invoice line (or the bundle component share), so old data still
// prints a coherent document.
//
// The module is loaded globally (index.html) because it is used from two page
// scripts that are injected independently:
//   • renderer/js/pages/invoices.js  — footer button + card badge
//   • renderer/js/pages/returns.js   — «طباعة فاتورة إرجاع» action
// ============================================================================

(function (root) {
  'use strict';

  // ---------- tiny helpers -------------------------------------------------

  function getDB() {
    try { if (typeof DB !== 'undefined' && DB) return DB; } catch (e) { /* not in this realm */ }
    return root.DB || null;
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function roundQty(v) {
    var U = root.Unit;
    if (U && typeof U.roundQty === 'function') return U.roundQty(v);
    return Math.round(num(v) * 1000000) / 1000000;
  }

  function roundMoney(v) {
    return Math.round(num(v) * 100) / 100;
  }

  function esc(s) {
    if (typeof root.escHtml === 'function') return root.escHtml(s == null ? '' : String(s));
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function money(v) {
    if (typeof root.fmtMoney === 'function') return root.fmtMoney(v);
    return num(v).toFixed(2);
  }

  function tr(key, fallback) {
    try {
      if (typeof root.t === 'function') {
        var v = root.t(key);
        if (v) return v;
      }
    } catch (e) { /* dictionary not ready */ }
    return fallback || key;
  }

  function notify(msg) {
    try { root.alert(msg); } catch (e) { /* headless */ }
  }

  function qtyHTML(line) {
    var U = root.Unit;
    if (U && typeof U.qtyUnit === 'function') return esc(U.qtyUnit(line.qty, line));
    return esc(String(line.qty));
  }

  function dateFR(ts) {
    var n = Number(ts);
    if (!isFinite(n) || n <= 0) return '—';
    try {
      return new Date(n).toLocaleDateString('fr-DZ', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch (e) { return '—'; }
  }

  function timeFR(ts) {
    var n = Number(ts);
    if (!isFinite(n) || n <= 0) return '—';
    try {
      return new Date(n).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '—'; }
  }

  function dayKey(ts) {
    var n = Number(ts);
    if (!isFinite(n) || n <= 0) return '';
    var d = new Date(n);
    if (!isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function getStore() {
    if (typeof root.getPrintInfo === 'function') return root.getPrintInfo() || {};
    var ls = root.localStorage;
    return {
      name: (ls && ls.getItem('zmt_store_name')) || 'ZMT PIECE',
      address: (ls && ls.getItem('zmt_store_address')) || '',
      phone: (ls && ls.getItem('zmt_store_phone')) || '',
      nis: (ls && ls.getItem('zmt_store_nis')) || '',
      nif: (ls && ls.getItem('zmt_store_nif')) || '',
      rcc: (ls && ls.getItem('zmt_store_rcc')) || '',
      article: (ls && ls.getItem('zmt_store_article')) || ''
    };
  }

  function legalParts(rec) {
    var parts = [];
    if (!rec) return parts;
    if (rec.nis) parts.push('NIS: ' + esc(rec.nis));
    if (rec.nif) parts.push('NIF: ' + esc(rec.nif));
    if (rec.rc || rec.rcc) parts.push('RC: ' + esc(rec.rc || rec.rcc));
    if (rec.article) parts.push('ART: ' + esc(rec.article));
    return parts;
  }

  function storeLegalHTML(store) {
    var parts = legalParts(store);
    return parts.length
      ? '<div style="font-size:10px;color:#777;margin-top:3px;direction:ltr;text-align:left">' + parts.join(' | ') + '</div>'
      : '';
  }

  function partyLegalHTML(party) {
    var parts = legalParts(party);
    return parts.length
      ? '<div style="font-size:10px;color:#777;margin-top:3px">' + parts.join(' | ') + '</div>'
      : '';
  }

  function invoiceLabel(inv) {
    if (!inv) return '—';
    if (inv.invoiceNumber) return String(inv.invoiceNumber);
    if (inv.id) return String(inv.id).substring(0, 8).toUpperCase();
    return '—';
  }

  function returnNumber(inv) {
    return 'RET-' + invoiceLabel(inv);
  }

  function partyOf(inv) {
    var db = getDB();
    if (!db || !inv) return null;
    if (inv.customerId && typeof db.getCustomers === 'function') {
      var customers = db.getCustomers() || [];
      for (var i = 0; i < customers.length; i++) {
        if (customers[i] && customers[i].id === inv.customerId) return customers[i];
      }
    }
    if (inv.supplierId && typeof db.getSuppliers === 'function') {
      var suppliers = db.getSuppliers() || [];
      for (var j = 0; j < suppliers.length; j++) {
        if (suppliers[j] && suppliers[j].id === inv.supplierId) return suppliers[j];
      }
    }
    if (inv.walkinName) {
      return { name: inv.walkinName, phone: inv.walkinPhone, address: inv.walkinAddress };
    }
    return null;
  }

  function productMeta(productId) {
    var db = getDB();
    if (!db || !productId || typeof db.getProduct !== 'function') return null;
    var p = db.getProduct(productId);
    if (!p) return null;
    return {
      name: p.name || '',
      unit: p.unit,
      unitLabel: p.unitLabel,
      qtyDecimals: p.qtyDecimals
    };
  }

  // The invoice line that produced this return, used only as a fallback for
  // legacy rows that were saved before price/total snapshots existed.
  function invoiceLineMeta(inv, r) {
    var items = (inv && inv.items) || [];
    var i, j, it, comps, c;

    // Bundle components: prefer the exact bundle named on the return row.
    if (r && (r.isBundleComponent || r.bundleId)) {
      var ordered = [];
      for (i = 0; i < items.length; i++) {
        it = items[i];
        if (!it) continue;
        var isTarget = r.bundleId && (it.bundleId === r.bundleId || it.productId === 'bundle:' + r.bundleId);
        if (isTarget) ordered.unshift(it); else ordered.push(it);
      }
      for (i = 0; i < ordered.length; i++) {
        it = ordered[i];
        comps = it.bundleComponents || [];
        for (j = 0; j < comps.length; j++) {
          c = comps[j];
          if (c && c.productId === r.productId) {
            return {
              name: c.name || it.name || r.productName || '',
              price: num(c.valuePerBundle),
              unit: c.unit || it.unit,
              unitLabel: c.unitLabel || it.unitLabel,
              qtyDecimals: c.qtyDecimals != null ? c.qtyDecimals : it.qtyDecimals,
              isBundleComponent: true
            };
          }
        }
      }
      return null;
    }

    // Ordinary line: the invoice stores the final paid unit price.
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it || it.productId !== r.productId) continue;
      var q = num(it.qty);
      var price = num(it.price);
      if (!price && q) price = num(it.total) / q;
      return {
        name: it.name || r.productName || '',
        price: price,
        unit: it.unit,
        unitLabel: it.unitLabel,
        qtyDecimals: it.qtyDecimals
      };
    }
    return null;
  }

  // Resolve one return row into the line printed on the return invoice.
  function resolveLine(r, inv) {
    var qty = num(r && r.qty);
    var price = null;
    var total = null;

    // 1) Snapshot written at return time (new rows).
    if (r && r.total != null && r.total !== '' && isFinite(Number(r.total))) {
      total = num(r.total);
      if (r.price != null && r.price !== '' && isFinite(Number(r.price))) price = num(r.price);
      else price = qty ? total / qty : 0;
    } else if (r && r.price != null && r.price !== '' && isFinite(Number(r.price))) {
      price = num(r.price);
      total = price * qty;
    }

    // 2) Legacy fallback: original invoice line / bundle component share.
    var meta = invoiceLineMeta(inv, r) || productMeta(r && r.productId);
    if (price == null || total == null) {
      if (meta && meta.price != null && isFinite(meta.price)) {
        price = num(meta.price);
        total = price * qty;
      } else {
        price = 0;
        total = 0;
      }
    }

    return {
      productId: (r && r.productId) || '',
      name: (meta && meta.name) || (r && r.productName) || '—',
      price: roundMoney(price),
      total: roundMoney(total),
      qty: qty,
      unit: (meta && meta.unit) || (r && r.unit),
      unitLabel: (meta && meta.unitLabel) || (r && r.unitLabel),
      qtyDecimals: (meta && meta.qtyDecimals != null) ? meta.qtyDecimals : (r && r.qtyDecimals),
      reason: (r && r.reason) || '',
      dateTs: num(r && r.createdAt),
      isBundleComponent: !!(r && (r.isBundleComponent || r.bundleId))
    };
  }

  // Group identical lines (same product, same unit price, same return date) so
  // a repeated return on the same day reads as one clean line. Different dates
  // stay separate: the document must keep each product's return date.
  function buildLines(inv, returns) {
    var groups = Object.create(null);
    (returns || []).forEach(function (r) {
      var line = resolveLine(r, inv);
      if (!line || !line.qty) return;
      var key = (line.productId || line.name) + '|' + line.price.toFixed(4) + '|' + dayKey(line.dateTs);
      var g = groups[key];
      if (!g) {
        g = {
          productId: line.productId,
          name: line.name,
          price: line.price,
          qty: 0,
          total: 0,
          unit: line.unit,
          unitLabel: line.unitLabel,
          qtyDecimals: line.qtyDecimals,
          dateTs: line.dateTs,
          reasons: [],
          isBundleComponent: line.isBundleComponent
        };
        groups[key] = g;
      }
      g.qty = roundQty(g.qty + line.qty);
      g.total = roundMoney(g.total + line.total);
      if (line.reason && g.reasons.indexOf(line.reason) === -1) g.reasons.push(line.reason);
      if (line.dateTs && (!g.dateTs || line.dateTs < g.dateTs)) g.dateTs = line.dateTs;
    });
    return Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return (a.dateTs || 0) - (b.dateTs || 0); })
      .map(function (g) { g.reason = g.reasons.join(' · '); return g; });
  }

  function hasReturns(invoiceId) {
    if (!invoiceId) return false;
    var db = getDB();
    if (!db || typeof db.getReturns !== 'function') return false;
    var list = db.getReturns() || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].invoiceId === invoiceId) return true;
    }
    return false;
  }

  function returnsFor(invoiceId) {
    var db = getDB();
    if (!db || !invoiceId || typeof db.getReturns !== 'function') return [];
    return (db.getReturns() || []).filter(function (r) {
      return r && r.invoiceId === invoiceId;
    }).sort(function (a, b) {
      return num(a.createdAt) - num(b.createdAt);
    });
  }

  // ---------- the document -------------------------------------------------

  function buildHTML(invoiceId) {
    var db = getDB();
    if (!db || typeof db.getInvoice !== 'function') return '';
    var inv = db.getInvoice(invoiceId);
    if (!inv) return '';

    var returns = returnsFor(invoiceId);
    if (!returns.length) return '';
    var lines = buildLines(inv, returns);
    if (!lines.length) return '';

    var total = roundMoney(lines.reduce(function (s, l) { return s + num(l.total); }, 0));
    var latestTs = returns.reduce(function (m, r) { return Math.max(m, num(r.createdAt)); }, 0);
    var firstTs = returns.reduce(function (m, r) {
      var n = num(r.createdAt);
      if (!n) return m;
      return (m === 0 || n < m) ? n : m;
    }, 0);

    var store = getStore();
    var party = partyOf(inv);
    var number = returnNumber(inv);
    var dateStr = dateFR(latestTs);
    var timeStr = timeFR(latestTs);
    var invoiceDateStr = dateFR(inv.createdAt);

    var leftCell =
      '<div style="font-size:20px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:1px">' + esc(store.name) + '</div>' +
      '<div style="font-size:10px;color:#999;margin-top:1px;text-transform:uppercase;letter-spacing:0.5px">Document commercial — Retour</div>' +
      (store.address ? '<div style="font-size:11px;color:#555;margin-top:4px">' + esc(store.address) + '</div>' : '') +
      (store.phone ? '<div style="font-size:11px;color:#555">Tél: ' + esc(store.phone) + '</div>' : '') +
      storeLegalHTML(store);

    var rightCell =
      '<div style="font-size:26px;font-weight:900;color:#1a1a1a;text-transform:uppercase;letter-spacing:2px">FACTURE DE RETOUR</div>' +
      '<div style="font-size:10px;font-weight:600;color:#888;margin-top:1px;text-transform:uppercase;letter-spacing:1px">Original</div>' +
      '<div style="font-size:14px;font-weight:700;color:#333;margin-top:6px">N° ' + esc(number) + '</div>' +
      '<div style="font-size:11px;color:#555;margin-top:4px;line-height:1.6">' +
        '<div>Date du retour: ' + esc(dateStr) + '</div>' +
        '<div>Heure: ' + esc(timeStr) + '</div>' +
      '</div>';

    var L = root.InvoiceLogo;
    var header = (L && typeof L.headerRow === 'function')
      ? L.headerRow(leftCell, rightCell)
      : '<table style="width:100%;border-collapse:collapse" dir="ltr"><tr>' +
          '<td style="vertical-align:top;width:60%">' + leftCell + '</td>' +
          '<td style="vertical-align:top;text-align:right;width:40%">' + rightCell + '</td>' +
        '</tr></table>';

    var partyName = party ? (party.name || '') : '';
    var partyPhone = party ? (party.phone || '') : '';
    var partyAddress = party ? (party.address || '') : '';

    var rows = lines.map(function (line, i) {
      var zebra = i % 2 === 0 ? 'background:#fafafa' : '';
      return '<tr style="' + zebra + '">' +
        '<td style="padding:8px 10px;border:1px solid #eee;font-size:12px;color:#333;vertical-align:top">' +
          '<div style="font-weight:600;color:#222">' + esc(line.name) + '</div>' +
          (line.reason ? '<div style="font-size:10px;color:#777;margin-top:2px">' + esc(line.reason) + '</div>' : '') +
        '</td>' +
        '<td style="padding:8px 10px;border:1px solid #eee;text-align:center;font-size:11px;color:#555;white-space:nowrap">' + esc(dateFR(line.dateTs)) + '</td>' +
        '<td style="padding:8px 10px;border:1px solid #eee;text-align:center;font-size:12px;color:#333">' + qtyHTML(line) + '</td>' +
        '<td style="padding:8px 10px;border:1px solid #eee;text-align:right;font-size:12px;color:#333">' + money(line.price) + ' DA</td>' +
        '<td style="padding:8px 10px;border:1px solid #eee;text-align:right;font-size:12px;font-weight:600;color:#333">' + money(line.total) + ' DA</td>' +
      '</tr>';
    }).join('');

    var rangeLine = (firstTs && latestTs && dayKey(firstTs) !== dayKey(latestTs))
      ? '<div style="margin-top:2px">Retours enregistrés du <b>' + esc(dateFR(firstTs)) + '</b> au <b>' + esc(dateFR(latestTs)) + '</b></div>'
      : '';

    return '<div id="returnInvoicePrintArea" style="padding:30px 35px;font-family:\'Segoe UI\',\'Helvetica Neue\',Arial,sans-serif;color:#222;direction:ltr;text-align:left" dir="ltr">' +
      header +
      '<div style="border-top:2px solid #1a1a1a;margin:16px 0 14px"></div>' +
      '<div style="height:1px;background:#ddd;margin-bottom:16px"></div>' +

      '<table style="width:100%;border-collapse:collapse;margin-bottom:16px" dir="ltr"><tr>' +
        '<td style="vertical-align:top;width:50%">' +
          '<div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Client</div>' +
          (partyName
            ? '<div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-top:2px">' + esc(partyName) + '</div>' +
              (partyPhone ? '<div style="font-size:11px;color:#666">Tél: ' + esc(partyPhone) + '</div>' : '') +
              (partyAddress ? '<div style="font-size:11px;color:#666">Adresse: ' + esc(partyAddress) + '</div>' : '') +
              partyLegalHTML(party)
            : '<div style="font-size:14px;color:#888">Client non enregistré</div>') +
        '</td>' +
        '<td style="vertical-align:top;text-align:right;width:50%">' +
          '<div style="display:inline-block;padding:4px 14px;background:#fff5f5;color:#b71c1c;border:1px solid #f0b8b8;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Retour de marchandises</div>' +
          '<div style="font-size:10px;color:#999;font-style:italic;margin-top:6px">Document généré automatiquement</div>' +
        '</td>' +
      '</tr></table>' +

      '<div style="margin:0 0 14px;padding:9px 12px;border:1px solid #e6e6e6;border-radius:6px;background:#fafafa;font-size:11px;color:#555;line-height:1.8" dir="ltr">' +
        '<div><b>Facture d\'origine:</b> N° ' + esc(invoiceLabel(inv)) + ' du ' + esc(invoiceDateStr) + '</div>' +
        '<div><b>Date du retour:</b> ' + esc(dateStr) + ' &nbsp;|&nbsp; <b>Nombre de retours:</b> ' + returns.length + '</div>' +
        rangeLine +
      '</div>' +

      '<table style="width:100%;border-collapse:collapse;font-size:12px" dir="ltr">' +
        '<thead><tr style="background:#f2f2f2;border-bottom:2px solid #1a1a1a">' +
          '<th style="padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd">Désignation</th>' +
          '<th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:100px">Date retour</th>' +
          '<th style="padding:8px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:80px">Qté</th>' +
          '<th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:100px">Prix unitaire</th>' +
          '<th style="padding:8px 10px;text-align:right;font-size:10px;text-transform:uppercase;color:#555;letter-spacing:0.5px;border:1px solid #ddd;width:100px">Total</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +

      '<table style="width:100%;border-collapse:collapse;margin-top:10px" dir="ltr"><tr>' +
        '<td style="width:60%"></td>' +
        '<td style="width:40%">' +
          '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
            '<tr style="border-top:2px solid #1a1a1a">' +
              '<td style="padding:6px 10px;text-align:left;font-weight:800;font-size:15px;color:#1a1a1a">TOTAL RETOURNÉ</td>' +
              '<td style="padding:6px 10px;text-align:right;font-weight:900;font-size:17px;color:#0066B1">' + money(total) + ' DA</td>' +
            '</tr>' +
          '</table>' +
        '</td>' +
      '</tr></table>' +

      '<div style="margin-top:14px;padding:10px 14px;border:1px solid #e6e6e6;border-radius:6px;background:#fafafa;font-size:11px;color:#555;line-height:1.7" dir="ltr">' +
        '<b>Note de retour:</b> Les articles ci-dessus ont été retournés par le client et sont déduits de la facture d\'origine.' +
      '</div>' +

      '<div style="border-top:2px solid #1a1a1a;margin-top:24px;padding-top:14px">' +
        '<table style="width:100%;border-collapse:collapse" dir="ltr"><tr>' +
          '<td style="width:50%;vertical-align:bottom">' +
            '<div style="font-size:10px;color:#888;margin-bottom:4px">' + esc(store.name) + '</div>' +
            '<div style="font-size:9px;color:#999">' + (store.address ? esc(store.address) + '<br>' : '') + 'Tél: ' + esc(store.phone || '—') + '</div>' +
            '<div style="font-size:9px;color:#999;margin-top:2px">NIF: ' + esc(store.nif || '—') + ' | Facture de retour N° ' + esc(number) + '</div>' +
          '</td>' +
          '<td style="width:50%;text-align:right;vertical-align:bottom">' +
            '<div style="font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px">Cachet &amp; signature</div>' +
            '<div style="height:50px;margin-top:6px;border-bottom:1px solid #ccc;width:180px;margin-left:auto"></div>' +
            '<div style="font-size:9px;color:#999;margin-top:2px">Lu et approuvé</div>' +
          '</td>' +
        '</tr></table>' +
      '</div>' +
      '<div style="text-align:center;margin-top:12px;font-size:9px;color:#bbb;letter-spacing:0.5px">' +
        esc(store.name) + ' · ' + esc(dateStr) + ' · ' + esc(number) +
      '</div>' +
    '</div>';
  }

  // ---------- printing -----------------------------------------------------

  function openDocPrintWindow(title, bodyHtml) {
    var win = root.open('', '', 'width=800,height=600');
    if (!win) {
      notify(tr('invoices.allowPopups', 'Veuillez autoriser les fenêtres pop-up pour imprimer.'));
      return;
    }
    var sh = '';
    try {
      var styles = root.document.querySelectorAll('link[rel="stylesheet"], style');
      Array.prototype.forEach.call(styles, function (s) { sh += s.outerHTML; });
    } catch (e) { /* styles are optional */ }
    var pp = root.PrintPaper;
    var ppRule = (pp && typeof pp.pageRule === 'function') ? pp.pageRule(10) : '@page{margin:10mm;size:A4}';
    win.document.write(
      '<!DOCTYPE html><html dir="ltr"><head><meta charset="UTF-8"><title>' + esc(title) + '</title>' + sh +
      '<style>' + ppRule +
        'body{margin:0;padding:0;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif}' +
        '*{box-sizing:border-box}' +
        '@media print{body{margin:0;padding:0}}' +
      '</style></head><body>' + bodyHtml +
      '<script>window.print();window.close();<\/script>' +
      '</body></html>'
    );
    win.document.close();
  }

  function print(invoiceId) {
    var db = getDB();
    if (!db || typeof db.getInvoice !== 'function') return;
    var inv = db.getInvoice(invoiceId);
    if (!inv) {
      notify(tr('returnInvoice.invoiceMissing', 'Facture introuvable : impossible d\'imprimer la facture de retour.'));
      return;
    }
    if (!hasReturns(invoiceId)) {
      notify(tr('returnInvoice.noReturns', 'Aucun retour enregistré pour cette facture.'));
      return;
    }

    var run = function () {
      var html = buildHTML(invoiceId);
      if (!html) {
        notify(tr('returnInvoice.noReturns', 'Aucun retour enregistré pour cette facture.'));
        return;
      }
      openDocPrintWindow('Facture de retour ' + returnNumber(inv), html);
    };

    var L = root.InvoiceLogo;
    if (L && typeof L.isEnabled === 'function' && L.isEnabled() && typeof L.warm === 'function') {
      Promise.resolve(L.warm()).then(run).catch(run);
    } else {
      run();
    }
  }

  root.ReturnInvoice = {
    hasReturns: hasReturns,
    returnsFor: returnsFor,
    numberFor: returnNumber,
    buildHTML: buildHTML,
    print: print
  };
})(window);
