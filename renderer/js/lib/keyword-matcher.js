window.KeywordMatcher = {
  FIELD_KEYWORDS: {
    barcode: ['barcode', 'bar_code', 'bar-code', 'code', 'reference', 'ref', 'coded', 'cod', 'code_barre', 'code-barre', 'رقم', 'باركود', 'كود', 'مرجع', 'reference_produit', 'art_code', 'artcode'],
    name: ['name', 'nom', 'description', 'desc', 'designation', 'libelle', 'libellé', 'article', 'piece', 'part', 'nom_produit', 'nomproduit', 'product_name', 'اسم', 'اسم_المنتج', 'قطعة', 'سمية'],
    buyPrice: ['buy_price', 'buyprice', 'prix_achat', 'prix_achat_ht', 'purchase_price', 'cost', 'cost_price', 'cout', 'coût', 'prix_de_revient', 'premier_prix', 'harga_beli', 'سعر_الشراء', 'ثمن_الشراء', 'cost_price', 'buy'],
    sellPrice: ['sell_price', 'sellprice', 'prix', 'prix_vente', 'prix_vente_ht', 'price', 'sale_price', 'tarif', 'tarif_prix', 'tarifht', '售价', 'سعر', 'ثمن', 'prix_vente_ttc', 'prix_vente2', 'pvp', 'sell'],
    qty: ['qty', 'quantity', 'quantite', 'quantité', 'stock', 'qte', 'qte_stock', 'stock_actuel', ' disponibles', 'available', 'كمية', 'كمية_المخزون', 'المخزون', 'stock_initial', 'inventaire'],
    brand: ['brand', 'marque', 'make', 'fabricant', 'manufacturer', 'العلامة', 'العلامة_التجارية', 'brand_name', 'brandname'],
    category: ['category', 'categorie', 'cat', 'type', 'famille', 'gamme', 'التصنيف', 'الفئة', 'category_name', 'cat_name'],
    supplier: ['supplier', 'fournisseur', 'vendor', 'provid', 'المورد', 'fournisseur_nom', 'supplier_name'],
    customer: ['customer', 'client', 'buyer', 'acheteur', 'عميل', 'زبون', 'customer_name', 'client_nom'],
    phone: ['phone', 'tel', 'mobile', 'telephone', 'تéléphone', 'هاتف', 'جوال', 'موبايل', 'phone_number', 'telephone', 'contact'],
    address: ['address', 'adresse', 'adr', 'adresse_', 'addr', 'عنوان', 'المكان', 'location', 'lieu', 'city', 'ville', 'commune'],
    invoiceDate: ['date', 'invoice_date', 'facture_date', 'تاريخ', 'التاريخ', 'تاريخ_الفاتورة', 'date_facture', 'invoice_date', 'order_date', 'purchase_date', 'datum', 'fecha', 'data'],
    invoiceTotal: ['total', 'montant', 'amount', 'إجمالي', 'مجموع', 'invoice_total', 'facture_montant', 'total_ht', 'total_ttc', 'grand_total'],
    invoiceRef: ['ref', 'reference', 'invoice_no', 'num_facture', 'رقم_الفاتورة', 'invoice_number', 'facture_num', 'order_no', 'order_ref', 'n_facture', 'facture', 'n_invoice', 'invoice_ref', 'invoice'],
    notes: ['notes', 'note', 'comment', 'remark', 'ملاحظات', 'observations', 'remarque', 'description_longue'],
    sellPrice2: ['prix2', 'prix_vente2', 'prix_vente_ttc', 'price2', 'second_price'],
    paidAmount: ['paid', 'payment', 'montant_paye', 'montantpaye', 'verse', 'versement', 'amount_paid', 'amountpaid', 'مدفوع', 'مدفوعة', 'مدفوعات', 'المدفوع', 'المتبقي', 'rest', 'restant', 'reste_a_payer', 'resteapayer', 'credit', 'solde'],
    invoiceDiscount: ['discount', 'remise', 'rabais', 'reduction', 'réduction', 'خصم', 'تخفيض', 'discount_amount', 'discountamount', 'remise_montant', 'disc', 'disccount'],
    unitPrice: ['unit_price', 'unitprice', 'prix_unitaire', 'prixunitaire', 'prix_unit', 'price_unit', 'priceunit', 'سعر_الوحدة', 'سعر_القطعة', 'سعر_الوحدة', 'pu_ht', 'pu_ttc', 'pu'],
    mark: ['mark', 'mrc', 'المارك', 'مارك', 'brand_mark'],
  },

  matchColumns(headers) {
    const result = {};
    const used = new Set();

    const kwScore = (h, kw) => {
      if (h === kw) return 1000 - kw.length;
      if (h.startsWith(kw)) return 900 - kw.length;
      if (h.endsWith(kw)) return 800 - kw.length;
      if (h.includes(kw)) return 100 - kw.length;
      return 0;
    };

    for (const [field, keywords] of Object.entries(this.FIELD_KEYWORDS)) {
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
          if (score > bestScore) {
            bestScore = score;
            bestMatch = i;
          }
        }
      }

      if (bestMatch !== null) {
        result[field] = bestMatch;
        used.add(bestMatch);
      }
    }

    return result;
  },

  getFieldLabel(field) {
    const labels = {
      barcode: { ar: 'باركود', en: 'Barcode', fr: 'Code-barre', zh: '条码' },
      name: { ar: 'اسم المنتج', en: 'Name', fr: 'Nom', zh: '名称' },
      buyPrice: { ar: 'سعر الشراء', en: 'Buy Price', fr: 'Prix Achat', zh: '进价' },
      sellPrice: { ar: 'سعر البيع', en: 'Sell Price', fr: 'Prix Vente', zh: '售价' },
      qty: { ar: 'الكمية', en: 'Quantity', fr: 'Quantité', zh: '数量' },
      brand: { ar: 'العلامة التجارية', en: 'Brand', fr: 'Marque', zh: '品牌' },
      mark: { ar: 'المارك', en: 'Mark', fr: 'Marque produit', zh: '标记' },
      category: { ar: 'التصنيف', en: 'Category', fr: 'Catégorie', zh: '分类' },
      supplier: { ar: 'المورد', en: 'Supplier', fr: 'Fournisseur', zh: '供应商' },
      customer: { ar: 'العميل', en: 'Customer', fr: 'Client', zh: '客户' },
      phone: { ar: 'رقم الهاتف', en: 'Phone', fr: 'Téléphone', zh: '电话' },
      address: { ar: 'العنوان', en: 'Address', fr: 'Adresse', zh: '地址' },
      invoiceDate: { ar: 'تاريخ الفاتورة', en: 'Invoice Date', fr: 'Date Facture', zh: '发票日期' },
      invoiceTotal: { ar: 'إجمالي الفاتورة', en: 'Invoice Total', fr: 'Total Facture', zh: '发票总额' },
      invoiceRef: { ar: 'رقم الفاتورة', en: 'Invoice Ref', fr: 'Réf Facture', zh: '发票编号' },
      notes: { ar: 'ملاحظات', en: 'Notes', fr: 'Notes', zh: '备注' },
      sellPrice2: { ar: 'سعر البيع 2', en: 'Sell Price 2', fr: 'Prix Vente 2', zh: '售价2' },
      paidAmount: { ar: 'المبلغ المدفوع', en: 'Paid Amount', fr: 'Montant Payé', zh: '已付金额' },
      invoiceDiscount: { ar: 'الخصم', en: 'Invoice Discount', fr: 'Remise', zh: '发票折扣' },
      unitPrice: { ar: 'سعر الوحدة', en: 'Unit Price', fr: 'Prix Unitaire', zh: '单价' },
    };
    const lang = window.__lang || 'ar';
    return labels[field]?.[lang] || labels[field]?.en || field;
  }
};
