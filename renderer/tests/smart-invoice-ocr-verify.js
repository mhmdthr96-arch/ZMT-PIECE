// ZMT PIECE — Smart Add (invoice OCR) parser verify
// Run: node renderer/tests/smart-invoice-ocr-verify.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', '..') + path.sep;
const read = (p) => fs.readFileSync(path.join(base, p), 'utf8');

let pass = 0, fail = 0;
const check = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => check(a === b, m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

const src = read('renderer/js/invoice-ocr.js');
const sandbox = {
  localStorage: { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } },
  console, URL: { createObjectURL: () => 'x', revokeObjectURL: () => {} },
  document: { createElement: () => ({}), head: { appendChild: () => {} } },
  fetch: async () => { throw new Error('no net'); },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'invoice-ocr.js' });
const OCR = sandbox.InvoiceOCR;

check(OCR && typeof OCR.parseRowsFromText === 'function', 'parser is exported');
check(typeof OCR.parseAmount === 'function', 'parseAmount is exported');

// French invoice exactly as the reported screenshot (INV24.FR)
const fr = [
  'Destinataire:',
  'Date de facturation: 12/07/2021',
  'Facture Nº 552',
  'Désignation Quantité Prix Total',
  'mon produit 2 50,00 100,00',
  'mon service 3 100,00 300,00',
  'Total: 400,00 €',
  'TVA(20%): 80,00 €',
  'Total TTC: 480,00 €',
].join('\n');
const rowsFr = OCR.parseRowsFromText(fr);
eq(rowsFr.length, 2, 'French invoice: 2 rows (totals/tva excluded)');
if (rowsFr.length === 2) {
  eq(rowsFr[0].name, 'mon produit', 'FR row1 name');
  eq(rowsFr[0].qty, 2, 'FR row1 qty');
  eq(rowsFr[0].price, 50, 'FR row1 unit price (FR comma decimal, total ignored)');
  eq(rowsFr[1].name, 'mon service', 'FR row2 name');
  eq(rowsFr[1].qty, 3, 'FR row2 qty (not merged into price 3100)');
  eq(rowsFr[1].price, 100, 'FR row2 unit price');
}

// ZMT PIECE proforma — OCR text must NOT read meta lines as products
// (reported: "N° FACT 1 30 / te août 25 2026 / Heure 21 21" became products).
const zmt = [
  'ZMT PIECE',
  'FACTURE PROFORMA',
  'N° FACT 1 30 te août 25 2026 Heure 21 21',
  'CLIENT ali Tél: 066586856 Adresse: uuu',
  'DÉSIGNATION QTÉ PRIX UNITAIRE TOTAL',
  'rr 100 1500.00 DA 150000.00 DA',
  'Net à payer 150000.00 DA',
  'Montant payé: 0.00 DA | Reste: 150000.00 DA',
  'CACHET & SIGNATURE',
].join('\n');
const rowsZmt = OCR.parseRowsFromText(zmt);
eq(rowsZmt.length, 1, 'ZMT proforma: only the real table row (meta lines skipped)');
if (rowsZmt.length === 1) {
  eq(rowsZmt[0].name, 'rr', 'ZMT row name');
  eq(rowsZmt[0].qty, 100, 'ZMT row qty');
  eq(rowsZmt[0].price, 1500, 'ZMT row unit price (total ignored)');
}

// Amount formats
eq(OCR.parseAmount('50,00'), 50, 'parseAmount FR decimal comma');
eq(OCR.parseAmount('1 234,56'), 1234.56, 'parseAmount FR spaced thousands + comma');
eq(OCR.parseAmount('1,234.56'), 1234.56, 'parseAmount US thousands + dot');
eq(OCR.parseAmount('100.00'), 100, 'parseAmount plain decimal');

// ZMT PIECE purchase (7 rows, US-thousands totals + PD27 model digits)
const zmt7 = [
  'ZMT PIECE',
  "FACTURE D'ACHAT",
  'N° FACT-2026-0214',
  'Date: 04 octobre 2026',
  'Heure: 15:42',
  'FOURNISSEUR SALMI FRERE Tél: Adresse: ALGER',
  'DÉSIGNATION QTÉ PRIX UNITAIRE TOTAL',
  'BOUCHON RADIATEUR YARIS HILUX COROLLA 6 1,050.00 DA 6,300.00 DA',
  'S BLOC NS TD27 LAME PM 40 150.00 DA 6,000.00 DA',
  'S BLOC NS TD27 LAME GM 16 170.00 DA 2,720.00 DA',
  'FLEXIBLE ALTER HILUX 2L/3L/5L 98- 2 1,500.00 DA 3,000.00 DA',
  '09',
  'PLAQUE DE FREIN NS TD27 4 2,750.00 DA 11,000.00 DA',
  'COURO I ALTER TD27 6 950.00 DA 5,700.00 DA',
  'POMPE EMBRAYAGE INF HILUX 2L/3L/5L 2 1,900.00 DA 3,800.00 DA',
  'Net à payer 38520.00 DA',
  'Montant payé: 0.00 DA | Reste: 38520.00 DA',
].join('\n');
const rowsZmt7 = OCR.parseRowsFromText(zmt7);
eq(rowsZmt7.length, 7, 'ZMT 7-row purchase: all 7 products read');
const expect7 = [
  ['BOUCHON RADIATEUR YARIS HILUX COROLLA', 6, 1050], ['S BLOC NS TD27 LAME PM', 40, 150], ['S BLOC NS TD27 LAME GM', 16, 170],
  ['FLEXIBLE ALTER HILUX 2L/3L/5L 98 09', 2, 1500], ['PLAQUE DE FREIN NS TD27', 4, 2750], ['COURO I ALTER TD27', 6, 950],
  ['POMPE EMBRAYAGE INF HILUX 2L/3L/5L', 2, 1900],
];
expect7.forEach((e, i) => {
  const r = rowsZmt7[i];
  eq(r && r.name, e[0], 'ZMT7 row' + (i + 1) + ' exact name (model numbers kept)');
  eq(r && r.qty, e[1], 'ZMT7 row' + (i + 1) + ' qty');
  eq(r && r.price, e[2], 'ZMT7 row' + (i + 1) + ' unit price (total ignored)');
});
// The same screenshot when the OCR engine emits the table column by column
// (all names, then QT?, then PRIX UNITAIRE, then TOTAL) — Windows OCR output.
const zmtColsText = [
  'D?SIGNATION',
  'BOUCHON RADIATEUR YARIS HILUX', 'COROLLA',
  'S BLOC NS TD27 LAME PM', 'S BLOC NS TD27 LAME GM',
  'FLEXIBLE ALTER HILUX 2L/3L/5L 98-', '09',
  'PLAQUE DE FREIN NS TD27', 'COUROI ALTER TD27',
  'POMPE EMBRAYAGE INF HILUX', '2L/3L/5L',
  'QT?', '6', '40', '16', '2', '4', '6', '2',
  'PRIX', 'UNITAIRE',
  '1,050.00 DA', '150.00 DA', '170.00 DA', '1,500.00 DA', '2,750.00 DA', '950.00 DA', '1,900.00 DA',
  'TOTAL',
  '6,300.OO DA', '6,000.OO DA', '2,720.OO DA', '3,000.00 DA', '11,000.00 DA', '5,700.OO DA', '3,800.00 DA',
].join('\n');
const rowsZmtCols = OCR.parseRowsFromText(zmtColsText);
eq(rowsZmtCols.length, 7, 'ZMT 7-row (column-wise OCR): all 7 products rebuilt');
const expectCols = [
  ['BOUCHON RADIATEUR YARIS HILUX COROLLA', 6, 1050],
  ['S BLOC NS TD27 LAME PM', 40, 150],
  ['S BLOC NS TD27 LAME GM', 16, 170],
  ['FLEXIBLE ALTER HILUX 2L/3L/5L 98 09', 2, 1500],
  ['PLAQUE DE FREIN NS TD27', 4, 2750],
  ['COUROI ALTER TD27', 6, 950],
  ['POMPE EMBRAYAGE INF HILUX 2L/3L/5L', 2, 1900],
];
expectCols.forEach((e, i) => {
  const r = rowsZmtCols[i];
  eq(r && r.name, e[0], 'ZMT cols row' + (i + 1) + ' merged name');
  eq(r && r.qty, e[1], 'ZMT cols row' + (i + 1) + ' qty');
  eq(r && r.price, e[2], 'ZMT cols row' + (i + 1) + ' unit price');
});
// Heavily damaged OCR (only ~10 of 21 numbers captured): the parser may give
// up, but it must never turn the client block or totals into products.
const parcDamaged = [
  'Parc Info', '10', '38000 Grenoble', 'Votre commande numéro : 94',
  'CASSON PLUS 2 ARMOIRES 2 PORTES', 'TABLE POUR ORDINATEUR', 'CHAISE EN BOIS',
  'CHAISE FIXE', 'CHAISE ROUL', 'TABLE DE TRAVAIL MDF', 'BIBLIOTHEQUE APR TE',
  'Montant total HT :', 'TVA :', 'Montant total TTC :', "blablab'a blablabla",
  'Madame Laura Tatouille', 'Votre ville', 'DNO', '17525', '7550', '305,90',
  '501,10', '525, 75', '1 035,oo', '580,30', '4 17645', '835,29', '5 011,74',
].join('\n');
const rowsParc = OCR.parseRowsFromText(parcDamaged);
check(rowsParc.every((r) => !/Madame|Montant|TVA|commande|Grenoble|ville/i.test(r.name)),
  'damaged invoice: client/totals never become products');

// FACTURE service invoice with thin/light font (white-on-black header in
// some copies). The footer is "Sous-total HT : 1 550,00 €" / "TVA (20 %)" /
// "Total TTC : 1 860,00 €" and the client block must not become products.
const facture = [
  'FACTURE', 'Numéro :', 'Date :',
  'MARIANNE GIRARD', 'hello@reallygreatsite.com', '123 Anywhere St., Any City, ST', '12345',
  'Client', 'Thierry Bonnet', '123 Anywhere St., Any City, ST', '12345',
  'Description Quantité Prix unitaire HT Total HT',
  'Audit de sécurité 1 500,00 € 500,00 €',
  'Formation équipe IT 2 300,00 € 600,00 €',
  'Maintenance serveur 3 150,00 € 450,00 €',
  'Sous-total HT : 1 550,00 €', 'TVA (20 %) : 310,00 €',
  'Conditions de paiement : Paiement à effectuer avant le [date limite]',
  'Total TTC : 1 860,00 €', 'Mode de paiement accepté : [Virement, Carte, Chèque, etc.]',
  '@reallygreatsite',
].join('\n');
const rowsFacture = OCR.parseRowsFromText(facture);
eq(rowsFacture.length, 3, 'FACTURE service invoice: all 3 products (no client/totals rows)');
const factureExpect = [
  ['Audit de sécurité', 1, 500], ['Formation équipe IT', 2, 300], ['Maintenance serveur', 3, 150],
];
factureExpect.forEach((e, i) => {
  const r = rowsFacture[i];
  eq(r && r.name, e[0], 'FACTURE row' + (i + 1) + ' name');
  eq(r && r.qty, e[1], 'FACTURE row' + (i + 1) + ' qty');
  eq(r && r.price, e[2], 'FACTURE row' + (i + 1) + ' price');
});
// Same invoice with standalone header lines ("Prix unitaire HT" alone) and
// lost accents — all three rows must survive and the header alone is no row.
const factureSplitHeader = [
  'FACTURE', 'MARIANNE GIRARD', 'Client', 'Thierry Bonnet',
  'Description', 'Quantité', 'Prix unitaire HT', 'Total HT',
  'Audit de securite 1 500,00 € 500,00 €',
  'Formation equipe IT 2 300,00 € 600,00 €',
  'Maintenance serveur 3 150,00 € 450,00 €',
  'Sous-total HT : 1 550,00 €', 'Total TTC : 1 860,00 €',
].join('\n');
const rowsFactureSplit = OCR.parseRowsFromText(factureSplitHeader);
eq(rowsFactureSplit.length, 3, 'FACTURE (split header): all 3 products, header lines skipped');
if (rowsFactureSplit.length === 3) {
  eq(rowsFactureSplit[1].name, 'Formation equipe IT', 'FACTURE (split header) row2 name');
  eq(rowsFactureSplit[2].qty, 3, 'FACTURE (split header) row3 qty');
}
// Thin-stroke digit confusions must be healed: a qty read as 7 instead of 1
// is repaired by the printed row total, and "15O,00" is read as 150,00.
const factureNoisy = facture
  .replace('Audit de sécurité 1 500,00', 'Audit de sécurité 7 500,00')
  .replace('Maintenance serveur 3 150,00', 'Maintenance serveur 3 15O,00');
const rowsFactureNoisy = OCR.parseRowsFromText(factureNoisy);
eq(rowsFactureNoisy.length, 3, 'FACTURE (noisy digits): all 3 products');
if (rowsFactureNoisy.length === 3) {
  eq(rowsFactureNoisy[0].qty, 1, 'FACTURE (noisy digits) row1 qty repaired 7->1');
  eq(rowsFactureNoisy[0].price, 500, 'FACTURE (noisy digits) row1 price');
  eq(rowsFactureNoisy[2].qty, 3, 'FACTURE (noisy digits) row3 qty');
  eq(rowsFactureNoisy[2].price, 150, 'FACTURE (noisy digits) row3 price 15O->150');
}
// Header lost entirely (dark banner not read): column-wise or row-wise
// products must still be recovered by arithmetic, not client meta.
const factureNoHeader = [
  'FACTURE', 'MARIANNE GIRARD', 'Thierry Bonnet',
  'Audit de sécurité 1 500,00 € 500,00 €',
  'Formation équipe IT 2 300,00 € 600,00 €',
  'Maintenance serveur 3 150,00 € 450,00 €',
  'Sous-total HT : 1 550,00 €', 'TVA (20 %) : 310,00 €', 'Total TTC : 1 860,00 €',
].join('\n');
eq(OCR.parseRowsFromText(factureNoHeader).length, 3, 'FACTURE (header lost): 3 products by arithmetic');
const rows2 = OCR.parseRowsFromText('زيت 5 لتر 2 1500,00 3000,00\nFilter Oil 10 450.50 4505.00');
eq(rows2.length, 2, 'two more rows');
if (rows2.length === 2) {
  eq(rows2[0].qty, 2, 'AR row qty = second-to-last triple qty');
  eq(rows2[0].price, 1500, 'AR row price');
  eq(rows2[1].qty, 10, 'EN row qty');
  eq(rows2[1].price, 450.5, 'EN row price (dot decimal)');
}

// Association invoice: invoice-meta line must not become a product, and the
// Unité / % TVA / Total TVA columns must not shift qty & unit price.
const asso = [
  'Association', 'Client',
  'Association Culture & Partage', 'Mairie de quartier',
  'Date de facturation', 'Numéro de facture', 'Échéance', 'Paiement', 'Référence',
  '12.04.2026 ASSO-2026-006 26.04.2026 Virement Atelier culturel',
  'Informations additionnelles',
  'Description Quantité Unité Prix unitaire HT % TVA Total TVA Total TTC',
  "Organisation d'atelier 2 session 120,00 € 0 % 0,00 € 240,00 €",
  'Matériel pédagogique 1 lot 60,00 € 0 % 0,00 € 60,00 €',
  'Total HT 300,00 €', 'Total TVA 0,00 €', 'Total TTC 300,00 €',
].join('\n');
const rowsAsso = OCR.parseRowsFromText(asso);
eq(rowsAsso.length, 2, 'Association invoice: only the two table rows (no date/invoice-number row)');
if (rowsAsso.length === 2) {
  eq(rowsAsso[0].name, "Organisation d'atelier", 'Association row1 name');
  eq(rowsAsso[0].qty, 2, 'Association row1 qty');
  eq(rowsAsso[0].price, 120, 'Association row1 unit price (before % TVA)');
  eq(rowsAsso[1].name, 'Matériel pédagogique', 'Association row2 name (da inside word kept)');
  eq(rowsAsso[1].qty, 1, 'Association row2 qty');
  eq(rowsAsso[1].price, 60, 'Association row2 unit price');
}

// Same columns with non-zero TVA: unit HT × qty + TVA = Total TTC.
const tvaRows = OCR.parseRowsFromText([
  'Description Quantité Unité Prix unitaire HT % TVA Total TVA Total TTC',
  'Service B 2 jour 100,00 € 20 % 40,00 € 240,00 €',
  'Total TTC 240,00 €',
].join('\n'));
eq(tvaRows.length, 1, 'TVA invoice: 1 row');
if (tvaRows.length === 1) {
  eq(tvaRows[0].qty, 2, 'TVA row qty');
  eq(tvaRows[0].price, 100, 'TVA row price is HT unit price');
}

// Debitoor invoice: the phone/client block and the header "Total à payer" must
// not become a product, and "Nom du produit ..." must not be read as a header.
const debitoor = [
  'Client', '70 avenue de Clichy', '75017 Paris', 'France', 'Tél: 06 XXX XXX XXX',
  'FACTURE', 'Date de facture 1 janvier 2020', 'Numero de facture 0000001',
  'Conditions de paiement 14 jours', 'Date d échéance 15 janvier 2020', 'Total à payer 121€',
  'DESCRIPTION QUANTITÉ UNITÉ PRIX MONTANT',
  'Nom du produit ou service 1 Unité 100€ 100€',
  'TOTAL NET 100€', 'TVA 20% 20€', 'TOTAL FACTURE EN EUROS 120€',
].join('\n');
const rowsDebitoor = OCR.parseRowsFromText(debitoor);
eq(rowsDebitoor.length, 1, 'Debitoor invoice: only the table row (no Tél/phone row)');
if (rowsDebitoor.length === 1) {
  eq(rowsDebitoor[0].name, 'Nom du produit ou service', 'Debitoor row name');
  eq(rowsDebitoor[0].qty, 1, 'Debitoor row qty (not the phone 06)');
  eq(rowsDebitoor[0].price, 100, 'Debitoor row price (not Total à payer 121)');
}

// Even when OCR splits the table labels over several lines (so no header is
// recognized), the contact block must never become a product.
const debitoorSplitHeader = OCR.parseRowsFromText([
  'DESCRIPTION', 'QUANTITÉ', 'UNITÉ', 'PRIX', 'MONTANT',
  'Tél: 06 XXX XXX XXX 121€',
  'Nom du produit ou service 1 Unité 100€ 100€',
  'TOTAL NET 100€', 'TVA 20% 20€', 'TOTAL FACTURE EN EUROS 120€',
].join('\n'));
eq(debitoorSplitHeader.length, 1, 'Debitoor split-header: only the table row (no Tél 6 / 121 row)');
if (debitoorSplitHeader.length === 1) {
  eq(debitoorSplitHeader[0].name, 'Nom du produit ou service', 'Debitoor split-header name');
  eq(debitoorSplitHeader[0].qty, 1, 'Debitoor split-header qty');
  eq(debitoorSplitHeader[0].price, 100, 'Debitoor split-header price');
}

// Six-row invoice: all products are named "Article" and French spaced
// thousands ("3 150,00") must not turn the quantity into part of the price.
const articleRows = OCR.parseRowsFromText([
  'DESIGNATION QTE PRIX UNIT MONTANT',
  'Article 9 350,00 € 3 150,00 €',
  'Article 7 120,00 € 840,00 €',
  'Article 8 360,00 € 2 880,00 €',
  'Article 9 3,00 € 27,00 €',
  'Article 15 15,00 € 225,00 €',
  'Article 20 5,00 € 100,00 €',
  'MONTANT HT 7 222,00 €', 'TVA 14% 1 011,08 €', 'TOTAL TTC 8 233,08 €',
].join('\n'));
eq(articleRows.length, 6, 'Article invoice: all six rows (no footer rows)');
if (articleRows.length === 6) {
  eq(articleRows[0].qty, 9, 'Article row1 qty');
  eq(articleRows[0].price, 350, 'Article row1 unit price (not 3)');
  eq(articleRows[2].price, 360, 'Article row3 unit price');
  eq(articleRows[5].qty, 20, 'Article row6 qty');
  eq(articleRows[5].price, 5, 'Article row6 unit price');
}

// Same table when OCR emits columns instead of rows (names, then quantities,
// then prices, then totals) must be rebuilt and validated arithmetically.
const articleCols = OCR.parseRowsFromText([
  'DESIGNATION QTE PRIX UNIT MONTANT',
  'Article', 'Article', 'Article', 'Article', 'Article', 'Article',
  '9', '7', '8', '9', '15', '20',
  '350,00 €', '120,00 €', '360,00 €', '3,00 €', '15,00 €', '5,00 €',
  '3 150,00 €', '840,00 €', '2 880,00 €', '27,00 €', '225,00 €', '100,00 €',
  'MONTANT HT 7 222,00 €', 'TVA 14% 1 011,08 €', 'TOTAL TTC 8 233,08 €',
].join('\n'));
eq(articleCols.length, 6, 'Article invoice (column-wise OCR): all six rows rebuilt');
if (articleCols.length === 6) {
  eq(articleCols[0].qty, 9, 'Column-wise row1 qty');
  eq(articleCols[0].price, 350, 'Column-wise row1 price');
  eq(articleCols[5].qty, 20, 'Column-wise row6 qty');
  eq(articleCols[5].price, 5, 'Column-wise row6 price');
}

// Same table when OCR groups each column into a single multi-value line.
const articleBlocks = OCR.parseRowsFromText([
  'DESIGNATION QTE PRIX UNIT MONTANT',
  'Article Article Article Article Article Article',
  '9 7 8 9 15 20',
  '350,00 € 120,00 € 360,00 € 3,00 € 15,00 € 5,00 €',
  '3 150,00 € 840,00 € 2 880,00 € 27,00 € 225,00 € 100,00 €',
  'MONTANT HT 7 222,00 €', 'TVA 14% 1 011,08 €', 'TOTAL TTC 8 233,08 €',
].join('\n'));
eq(articleBlocks.length, 6, 'Article invoice (column blocks): all six rows rebuilt');
if (articleBlocks.length === 6) {
  eq(articleBlocks[0].qty, 9, 'Column-blocks row1 qty');
  eq(articleBlocks[0].price, 350, 'Column-blocks row1 price');
  eq(articleBlocks[5].qty, 20, 'Column-blocks row6 qty');
  eq(articleBlocks[5].price, 5, 'Column-blocks row6 price');
}

// Even if the black table header was not OCRed, the same structure is
// recovered from the repeated names and arithmetic-valid numbers.
const articleNoHeader = OCR.parseRowsFromText([
  'Numéro de facture 101', 'Date de facturation 14/09/2020', 'Vendeur', 'Mon Entreprise',
  '31200 TOULOUSE', 'Client', 'Tearlach Fortier', '13006 MARSEILLE',
  'Article', 'Article', 'Article', 'Article', 'Article', 'Article',
  '9', '7', '8', '9', '15', '20',
  '350,00 €', '120,00 €', '360,00 €', '3,00 €', '15,00 €', '5,00 €',
  '3 150,00 €', '840,00 €', '2 880,00 €', '27,00 €', '225,00 €', '100,00 €',
  'MONTANT HT 7 222,00 €', 'TVA 14% 1 011,08 €', 'TOTAL TTC 8 233,08 €',
].join('\n'));
eq(articleNoHeader.length, 6, 'Article invoice (header not OCRed): all six rows rebuilt');
if (articleNoHeader.length === 6) {
  eq(articleNoHeader[0].name, 'Article', 'Headerless row1 name');
  eq(articleNoHeader[0].qty, 9, 'Headerless row1 qty');
  eq(articleNoHeader[0].price, 350, 'Headerless row1 price');
  eq(articleNoHeader[5].qty, 20, 'Headerless row6 qty');
  eq(articleNoHeader[5].price, 5, 'Headerless row6 price');
}

// Service invoice: one amount per line means qty=1.
const serviceRows = OCR.parseRowsFromText([
  'FACTURE #12345',
  'Description',
  'Création de logo 1 000 €',
  'Carte de visite 300 €',
  'Refonte du site web 900 €',
  'Bannière publicitaire 250 €',
  'Sous total : 2 450 €', 'TVA (20%) : 490 €', 'TOTAL : 2 940 €',
].join('\n'));
eq(serviceRows.length, 4, 'Service invoice: four one-amount rows');
if (serviceRows.length === 4) {
  eq(serviceRows[0].name, 'Création de logo', 'Service row1 name');
  eq(serviceRows[0].qty, 1, 'Service row1 qty defaults to one');
  eq(serviceRows[0].price, 1000, 'Service row1 spaced-thousands amount');
  eq(serviceRows[3].price, 250, 'Service row4 price');
}

// Quantity-first columns: QTÉ | DÉSIGNATION | PRIX | MONTANT.
const qteRows = OCR.parseRowsFromText([
  'QTÉ DÉSIGNATION PRIX UNIT. HT MONTANT HT',
  '1 Grand brun escargot pour manger 100.00 100.00',
  '2 Petit marinère uniforme en bleu 15.00 30.00',
  '3 Façade à jouer accordéon 5.00 15.00',
  'Total HT 145.00', 'TVA 20,0% 29.00', 'TOTAL 174.00 €',
].join('\n'));
eq(qteRows.length, 3, 'Quantity-first invoice: three rows');
if (qteRows.length === 3) {
  eq(qteRows[0].name, 'Grand brun escargot pour manger', 'Quantity-first row1 name');
  eq(qteRows[0].qty, 1, 'Quantity-first row1 qty');
  eq(qteRows[0].price, 100, 'Quantity-first row1 price');
  eq(qteRows[2].price, 5, 'Quantity-first row3 price');
}

// French month-substring false positives: "Maintenance" contains "mai".
const tempoRows = OCR.parseRowsFromText([
  'Description Quantité Prix unitaire HT Total HT',
  'Audit de sécurité 1 500,00 € 500,00 €',
  'Formation équipe IT 2 300,00 € 600,00 €',
  'Maintenance serveur 3 150,00 € 450,00 €',
  'TVA (20 %) : 310,00 €', 'Total TTC : 1 860,00 €',
].join('\n'));
eq(tempoRows.length, 3, 'Tempo invoice: three rows (Maintenance is not a month)');
if (tempoRows.length === 3) {
  eq(tempoRows[2].name, 'Maintenance serveur', 'Maintenance row name');
  eq(tempoRows[2].qty, 3, 'Maintenance row qty');
  eq(tempoRows[2].price, 150, 'Maintenance row price');
}

// Product names containing numbers must remain complete; the row's first
// SKU column ("b010") belongs in the reference field instead.
const parcRows = OCR.parseRowsFromText([
  'b010 Souris Optique 19 16,10 305,90',
  'b001 CAISSON PLUS 2 ARMOIRES 2 PORTES 2 250,55 501,10',
  'b003 TABLE POUR ORDINATEUR 3 175,25 525,75',
  'b009 CHAISE EN BOIS 9 115,00 1 035,00',
  'b008 CHAISE FIXE 6 75,50 453,00',
  'b007 CHAISE ROUL 4 82,60 330,40',
  'b004 TABLE DE TRAVAIL 2M40 MDF 2 290,15 580,30',
  'b005 BIBLIOTHEQUE 4PRTE 1 445,00 445,00',
  'Montant total HT : 4 176,45', 'TVA : 20% 835,29', 'Montant total TTC : 5 011,74',
].join('\n'));
eq(parcRows.length, 8, 'Parc invoice: eight product rows');
if (parcRows.length === 8) {
  eq(parcRows[0].name, 'Souris Optique', 'Parc row1 name');
  eq(parcRows[0].reference, 'b010', 'Parc row1 reference extracted');
  eq(parcRows[1].name, 'CAISSON PLUS 2 ARMOIRES 2 PORTES', 'Parc row2 keeps model numbers');
  eq(parcRows[1].reference, 'b001', 'Parc row2 reference extracted');
  eq(parcRows[6].name, 'TABLE DE TRAVAIL 2M40 MDF', 'Parc row7 keeps 2M40');
}

// ---- offline-only contract: local Tesseract, no cloud, no keys, no CDN ----
check(typeof OCR.getKeys === 'undefined' && typeof OCR.saveKeys === 'undefined',
  'cloud key helpers are gone from the public API');
check(typeof OCR.getEngine === 'undefined' && typeof OCR.saveEngine === 'undefined',
  'cloud engine selector is gone from the public API');
check(!/vision\.googleapis\.com/.test(src), 'no Google Vision endpoint in OCR source');
check(!/AIza[0-9A-Za-z_\-]{10,}/.test(src), 'no Google API key embedded in OCR source');
check(!/cdn\.jsdelivr\.net/.test(src), 'no CDN fallback — OCR runs fully offline');
check(!/googleOcr|DEFAULT_GOOGLE_KEYS|KEY_STORAGE/.test(src), 'cloud-OCR code removed');
check(/createWorker/.test(src) && !/Tesseract\.recognize\(/.test(src),
  'one Tesseract worker is reused instead of a new one per attempt');
check(/onProgress/.test(src), 'ocrFile reports progress to the caller');
check(/ATTEMPT_TIMEOUT_MS/.test(src) && /withTimeout/.test(src),
  'recognition has a watchdog timeout');
check(/isAborted/.test(src) && /signal\.addEventListener/.test(src),
  'recognition can be cancelled through an AbortSignal');
check(/pdfPageBlobs/.test(src), 'scanned PDFs are rasterized before OCR');
check(!/psm:\s*11/.test(src), 'PSM 11 (sparse-text noise source) dropped');

console.log('\n============================================');
if (fail === 0) console.log('كل الفحوص نجحت — pass=' + pass + ' fail=0');
else { console.log('FAILED — pass=' + pass + ' fail=' + fail); process.exit(1); }
