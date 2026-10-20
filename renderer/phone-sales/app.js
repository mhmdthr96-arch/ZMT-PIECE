// ============================================================================
// ZMT PIECE — PHONE POS PWA («البيع»): runs in the phone's browser on the same
// LAN as the desktop app. Every action is sent as { type:'req' } over WSS and
// EXECUTED BY THE DESKTOP (single writer). The phone only renders results.
// ============================================================================
(function () {
  'use strict';

  // ---- identity (shared with the scanner app so one pairing works for both) --
  var deviceId = localStorage.getItem('zmt_ph_device_id') || (function () {
    var id = 'ph-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36);
    localStorage.setItem('zmt_ph_device_id', id);
    return id;
  })();
  var deviceName = (function () {
    var n = localStorage.getItem('zmt_ph_device_name');
    return (n && n.trim()) ? n.trim() : 'Phone POS';
  })();
  var token = localStorage.getItem('zmt_ph_token') || null;

  // ---- state -----------------------------------------------------------------
  var ws = null, wsReady = false, heartbeat = null, reqSeq = 0;
  var pending = {};                                 // requestId -> {resolve, reject, timer}
  var settings = { enabled: false, storeName: '', pharmacy: false };
  var state = {
    mode: 'unit',
    products: [], hasMore: false, page: 0,
    cart: [],                                      // {key,name,barcode,productId,price,qty,discount}
    partyType: 'customer',                          // customer | supplier
    customer: null, supplier: null,
    payMethod: 'cash', creditUsed: 0, paidTouched: false,
    seller: null, sellers: [],
    invType: 'all', invoices: [],
    scannerOn: false,
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    connDot: $('connDot'), storeName: $('storeName'), sellerName: $('sellerName'),
    tabPos: $('tabPos'), tabInv: $('tabInv'),
    searchInput: $('searchInput'), productList: $('productList'),
    partyInput: $('partyInput'), partyResults: $('partyResults'), supToggle: $('supToggle'),
    cartWrap: $('cartWrap'), cartList: $('cartList'), totalsBox: $('totalsBox'),
    invoiceList: $('invoiceList'), successView: $('successView'),
    lockScreen: $('lockScreen'), lockTitle: $('lockTitle'), lockDesc: $('lockDesc'),
    toast: $('toast'), sellerList: $('sellerList'), sellerOverlay: $('sellerOverlay'),
    checkoutOverlay: $('checkoutOverlay'), coLines: $('coLines'), checkoutInfo: $('checkoutInfo'),
    openCheckout: $('openCheckout'), checkoutSub: $('checkoutSub'),
  };

  // ---- helpers ---------------------------------------------------------------

  function toDigits(s) {
    return String(s == null ? '' : s).replace(/[\u0660-\u0669\u06F0-\u06F9]/g, function (d) {
      var c = d.charCodeAt(0);
      return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660);
    });
  }
  function numFmt(n) {
    n = (Number(toDigits(n)) || 0);
    n = Math.round(n * 100) / 100;
    var neg = n < 0; if (neg) n = -n;
    var s = String(Math.floor(n));
    var parts = [];
    while (s.length > 3) { parts.unshift(s.slice(-3)); s = s.slice(0, -3); }
    parts.unshift(s);
    var dec = Math.round((n - Math.floor(n)) * 100);
    return (neg ? '-' : '') + parts.join(',') + '.' + String(dec).padStart(2, '0');
  }
  function fmt(n) {
    return numFmt(n) + ' دج';
  }
  // Global digit guard: Arabic/Persian digits typed or pasted anywhere become
  // 0-9 instantly; .num-input fields also drop non-numeric characters.
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || typeof el.value !== 'string') return;
    var tag = (el.tagName || '').toUpperCase();
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
    var fixed = toDigits(el.value);
    if (el.classList && el.classList.contains('num-input')) {
      var im = String(el.getAttribute('inputmode') || '').toLowerCase();
      if (im === 'numeric') fixed = fixed.replace(/[^0-9]/g, '');
      else if (im === 'decimal') {
        fixed = fixed.replace(/[^0-9.]/g, '');
        var dot = fixed.indexOf('.');
        if (dot !== -1) fixed = fixed.slice(0, dot + 1) + fixed.slice(dot + 1).replace(/\./g, '');
      }
    }
    if (fixed !== el.value) el.value = fixed;
  }, true);
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var toastTimer = null;
  function toast(msg, cls) {
    els.toast.textContent = msg;
    els.toast.className = 'toast' + (cls ? ' ' + cls : '');
    els.toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.style.display = 'none'; }, 3200);
  }

  // ---- WebSocket -------------------------------------------------------------

  function closeWS() {
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    wsReady = false;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  }
  function startHeartbeat() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(function () {
      if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} }
    }, 20000);
  }
  function wsSend(obj) {
    if (!wsReady || !ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }
  function nextReqId() { return 'r' + (++reqSeq) + '-' + Date.now().toString(36); }

  // Fire a request and await the desktop's answer as a Promise.
  function req(name, payload) {
    return new Promise(function (resolve, reject) {
      if (!wsReady) return reject({ code: 'OFFLINE', msg: 'غير متصل بالمتجر' });
      var id = nextReqId();
      var t = setTimeout(function () {
        delete pending[id];
        reject({ code: 'TIMEOUT', msg: 'انتهت المهلة' });
      }, 40000);
      pending[id] = { resolve: resolve, reject: reject, timer: t };
      if (!wsSend({ type: 'req', requestId: id, req: name, payload: payload || {} })) {
        clearTimeout(t);
        delete pending[id];
        reject({ code: 'OFFLINE', msg: 'غير متصل بالمتجر' });
      }
    });
  }

  function connectWS() {
    closeWS();
    if (!token) { pair(); return; }
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    try { ws = new WebSocket(proto + location.host + '/ws'); }
    catch (e) { setTimeout(connectWS, 2000); return; }
    ws.onopen = function () { try { ws.send(JSON.stringify({ type: 'auth', token: token })); } catch (e) {} };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg) return;
      if (msg.type === 'auth') {
        if (msg.ok) { wsReady = true; startHeartbeat(); setConn(true); afterAuth(); }
        else { wsReady = false; lock('الجلبة غير صالحة', 'أعد المحاولة أو أعد الاقتران.'); }
      } else if (msg.type === 'res') {
        var p = pending[msg.requestId];
        if (!p) return;
        clearTimeout(p.timer);
        delete pending[msg.requestId];
        if (msg.ok) p.resolve(msg.data);
        else p.reject((msg.error && msg.error.msg) ? { code: msg.error.code, msg: msg.error.msg } : { code: 'ERROR', msg: 'خطأ' });
      } else if (msg.type === 'unpaired') {
        localStorage.removeItem('zmt_ph_token');
        token = null;
        closeWS();
        setConn(false);
        lock('زمز اقتران منتهي', 'أعد المحاولة لإعادة الاقتران.');
      } else if (msg.type === 'selloff') {
        lock('البيع معطّل لهذا الجهاز', 'فعّل البيع لهذا الهاتف من إعدادات الاتصال في برنامج ZMT.');
      } else if (msg.type === 'sellon') {
        if (els.lockScreen.style.display === 'flex') { els.lockScreen.style.display = 'none'; afterAuth(); }
      }
    };
    ws.onclose = function () { wsReady = false; setConn(false); scheduleReconnect(); };
    ws.onerror = function () {};
  }

  var reconnectTimer = null;
  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWS, 2500);
  }
  function setConn(ok) {
    els.connDot.className = 'dot' + (ok ? ' ok' : '');
  }

  // ---- pairing ---------------------------------------------------------------

  function pair() {
    fetch('/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId, deviceName: deviceName }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.status === 'approved' && res.token) {
        token = res.token;
        localStorage.setItem('zmt_ph_token', token);
        connectWS();
      } else {
        lock('في انتظار الموافقة', 'افتح إعدادات الاتصال في برنامج ZMT PIECE ووافق على اقتران هذا الهاتف.');
      }
    }).catch(function (e) {
      lock('لا يمكن الوصول إلى المتجر', 'تأكد من اتصال الهاتف بنفس شبكة المتجر ومن تشغيل الخادم.');
    });
  }

  function lock(title, desc) {
    els.lockTitle.textContent = title;
    els.lockDesc.textContent = desc;
    els.lockScreen.style.display = 'flex';
  }
  function retryConnect() {
    els.lockScreen.style.display = 'none';
    var t = localStorage.getItem('zmt_ph_token');
    if (t) { token = t; connectWS(); } else pair();
  }

  // ---- boot after auth -------------------------------------------------------

  function afterAuth() {
    req('settings/get', {}).then(function (s) {
      settings = s || settings;
      if (!s || !s.enabled) {
        lock('البيع غير مفعّل', 'فعّل «البيع من الهاتف» من إعدادات الاتصال في برنامج ZMT PIECE.');
        return;
      }
      els.storeName.textContent = s.storeName || 'ZMT البيع';
      loadSellers();
      loadProducts('');
    }).catch(function (e) {
      lock('تعذر التحميل', e.msg || 'أعد المحاولة.');
    });
  }

  function loadSellers() {
    req('users', {}).then(function (d) {
      state.sellers = (d && d.users) || [];
      renderSellerPicker();
      if (!state.seller && state.sellers.length === 1) {
        state.seller = state.sellers[0];
        els.sellerName.textContent = state.seller.name;
      }
    }).catch(function () {});
  }

  // ---- views -----------------------------------------------------------------

  function switchView(name) {
    $('view-pos').classList.toggle('active', name === 'pos');
    $('view-invoices').classList.toggle('active', name === 'invoices');
    els.tabPos.classList.toggle('active', name === 'pos');
    els.tabInv.classList.toggle('active', name === 'invoices');
    if (name === 'invoices') loadInvoices();
    else updateProductsGrid();
  }

  // ---- product search ---------------------------------------------------------

  var searchTimer = null;
  if (els.searchInput) {
    els.searchInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { loadProducts(els.searchInput.value.trim()); }, 350);
    });
  }

  function priceOf(prod) {
    if (state.mode === 'wholesale') return prod.wholesalePrice || prod.sellPrice || 0;
    return prod.sellPrice || 0;
  }

  function loadProducts(q) {
    state.page = 0;
    req('products/search', { q: q || '', page: 0 }).then(function (d) {
      state.products = (d && d.results) || [];
      state.hasMore = !!(d && d.hasMore);
      updateProductsGrid();
    }).catch(function (e) {
      els.productList.innerHTML = '<div class="empty">' + esc(e.msg || 'تعذر البحث') + '</div>';
    });
  }

  function updateProductsGrid() {
    if (els.searchInput && document.activeElement !== els.searchInput) {
      // no-op guard
    }
    var list = state.products;
    if (!list.length) { els.productList.innerHTML = '<div class="empty">لا منتجات متاحة</div>'; return; }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var button;
      if (p.fixed) button = '<button class="add" onclick="__PS.addByIndex(' + i + ')">+</button>';
      else if (p.available <= 0) button = '<button class="add" disabled style="opacity:.35">+</button>';
      else button = '<button class="add" onclick="__PS.addByIndex(' + i + ')">+</button>';
      html += '<div class="prod' + (p.available <= 0 && !p.fixed ? ' oos' : '') + '">' +
        '<div class="info">' +
          '<div class="name">' + esc(p.name) + '</div>' +
          '<div class="meta">' + (p.barcode ? 'باركود: <span dir="ltr">' + esc(p.barcode) + '</span>' : esc(p.mark || p.reference || '')) +
            (p.fixed ? ' <span class="tag">غير محدود</span>' : '') +
            (p.hasExpired ? ' <span class="tag">يوجد كميات منتهية</span>' : '') +
          '</div>' +
          (p.fixed ? '' : '<div class="stock">المتوفر: ' + p.available + '</div>') +
          '<div class="prices">' +
            '<span class="price"><span class="lbl">وحدة</span> DA' + fmt(p.sellPrice) + '</span>' +
            (p.wholesalePrice > 0 && p.wholesalePrice !== p.sellPrice ? '<span class="price"><span class="lbl">جملة</span> DA' + fmt(p.wholesalePrice) + '</span>' : '') +
          '</div>' +
        '</div>' +
        button +
      '</div>';
    }
    els.productList.innerHTML = html;
  }

  function addByIndex(i) {
    var p = state.products[i];
    if (!p) return;
    addToCart(p);
  }

  function cartKey(p) { return (p.name || '') + '\u0001' + (p.barcode || ''); }

  function addToCart(p) {
    if (!p.fixed && p.available <= 0) { toast('الكمية غير متوفرة لهذا المنتج', 'err'); return; }
    var key = cartKey(p);
    var line = null;
    for (var i = 0; i < state.cart.length; i++) {
      if (state.cart[i].key === key) { line = state.cart[i]; break; }
    }
    if (line) {
      if (!p.fixed && line.qty + 1 > p.available) { toast('الكمية المتوفرة: ' + p.available + ' فقط', 'err'); return; }
      line.qty += 1;
    } else {
      var price = priceOf(p);
      state.cart.push({ key: key, name: p.name, barcode: p.barcode || '', productId: p.id, price: price, qty: 1, discount: 0 });
    }
    if (!p.fixed && state.mode === 'manual') {
      // hint the cashier to type the agreed price
      toast('سعر اليوم اليدوي: عدّل السعر في السلة', 'ok');
    }
    renderCart();
  }

  function setQty(key, delta) {
    var line = state.cart.filter(function (l) { return l.key === key; })[0];
    if (!line) return;
    var p = findProduct(line);
    var qty = line.qty + delta;
    if (!p || (p && p.fixed)) { line.qty = Math.max(1, qty); }
    else {
      if (qty > p.available) { toast('الكمية المتوفرة: ' + p.available + ' فقط', 'err'); qty = p.available; }
      if (qty < 1) qty = 1;
      line.qty = qty;
    }
    renderCart();
  }
  function setQtyVal(key, val) {
    var line = state.cart.filter(function (l) { return l.key === key; })[0];
    if (!line) return;
    var q = Math.max(1, Math.round(Number(val) || 1));
    var p = findProduct(line);
    if (p && p.fixed) line.qty = q;
    else line.qty = Math.min(q, p ? p.available : q);
    renderCart();
  }
  function findProduct(line) {
    for (var i = 0; i < state.products.length; i++) {
      if (state.products[i].id === line.productId) return state.products[i];
    }
    return null;
  }
  function setPrice(key, val) { setLineNum(key, 'price', val); }
  function setDisc(key, val) { setLineNum(key, 'discount', val); }
  function setLineNum(key, field, val) {
    var line = state.cart.filter(function (l) { return l.key === key; })[0];
    if (!line) return;
    line[field] = Math.max(0, Number(val) || 0);
    renderCart();
  }
  function removeLine(key) {
    state.cart = state.cart.filter(function (l) { return l.key !== key; });
    renderCart();
  }

  function renderCart() {
    var wrap = els.cartWrap;
    var has = state.cart.length > 0;
    wrap.style.display = has ? 'flex' : 'none';
    if (!has) return;
    productListPadding();
    var html = '';
    for (var i = 0; i < state.cart.length; i++) {
      var l = state.cart[i];
      var base = l.price * l.qty;
      var disc = Math.min(l.discount, base);
      html += '<div class="cart-item">' +
        '<div class="row1"><span class="name">' + esc(l.name) + '</span>' +
          '<button class="del" onclick="__PS.removeLine(' + JSON.stringify(l.key).replace(/"/g, '&quot;') + ')">✕</button></div>' +
        '<div class="row2">' +
          '<div class="qty">' +
            '<button onclick="__PS.setQty(' + JSON.stringify(l.key).replace(/"/g, '&quot;') + ',-1)">−</button>' +
            '<input type="text" inputmode="numeric" class="num-input" dir="ltr" value="' + l.qty + '" onchange="__PS.setQtyVal(' + JSON.stringify(l.key).replace(/"/g, '&quot;') + ',this.value)">' +
            '<button onclick="__PS.setQty(' + JSON.stringify(l.key).replace(/"/g, '&quot;') + ',1)">+</button>' +
          '</div>' +
          '<div class="field"><label>السعر</label><input type="text" inputmode="decimal" class="num-input" dir="ltr" value="' + l.price + '" onchange="__PS.setPrice(' + JSON.stringify(l.key).replace(/"/g, '&quot;') + ',this.value)"></div>' +
          '<div class="field"><label>خصم القد</label><input type="text" inputmode="decimal" class="num-input" dir="ltr" value="' + l.discount + '" onchange="__PS.setDisc(' + JSON.stringify(l.key).replace(/"/g, '&quot;') + ',this.value)"></div>' +
        '</div>' +
      '</div>';
    }
    els.cartList.innerHTML = html;
    renderTotals();
  }

  function productListPadding() {
    // give the cart room to expand; cart handles its own scroll
  }

  // ---- checkout bottom sheet ----------------------------------------------------

  function openCheckoutSheet() {
    if (!state.cart.length) { toast('السلة فارغة', 'err'); return; }
    if (!state.seller) { toast('اختر الموظف أولاً', 'err'); openSellerPicker(); return; }
    buildCoLines();
    renderTotals();
    els.checkoutOverlay.style.display = 'flex';
  }
  function closeCheckoutSheet() { els.checkoutOverlay.style.display = 'none'; }
  function buildCoLines() {
    var rows = state.cart.map(function (l) {
      var base = l.price * l.qty;
      return '<div class="co-line"><span class="n">' + esc(l.name) + '</span><span class="q">×' + l.qty + '</span><span class="p">' + fmt(base) + '</span></div>';
    });
    var items = state.cart.reduce(function (s, l) { return s + l.qty; }, 0);
    els.coLines.innerHTML = rows.join('');
    els.checkoutInfo.textContent = '(' + state.cart.length + ' منتج، ' + items + ' قطعة)';
  }
  function emptyCart() {
    state.cart = [];
    state.paidTouched = false;
    renderCart();
    els.totalsBox.dataset.extra = '0';
    ['paidSingle', 'paidCash', 'paidCcp'].forEach(function (id) { $(id).value = '0'; });
    closeCheckoutSheet();
    toast('تم تفريغ السلة', 'ok');
  }

  // ---- totals + payment --------------------------------------------------------

  function saleMath() {
    var subTotal = 0, totalLineDisc = 0;
    for (var i = 0; i < state.cart.length; i++) {
      var l = state.cart[i];
      var base = l.price * l.qty;
      subTotal += base;
      totalLineDisc += Math.min(l.discount || 0, base);
    }
    var custDiscPct = 0;
    if (state.partyType === 'customer' && state.customer) custDiscPct = Number(state.customer.discount) || 0;
    var custDiscAmount = subTotal * (custDiscPct / 100);
    var afterCustDisc = subTotal - custDiscAmount;
    var extraDisc = Number($('totalsBox').dataset.extra || 0) || 0;
    var extraDiscAmount = Math.min(Math.max(0, extraDisc), afterCustDisc);
    var totalAmount = afterCustDisc - extraDiscAmount - totalLineDisc;
    return { subTotal: subTotal, custDiscPct: custDiscPct, custDiscAmount: custDiscAmount, afterCustDisc: afterCustDisc, extraDiscAmount: extraDiscAmount, totalAmount: totalAmount };
  }

  function renderTotals() {
    var m = saleMath();
    var creditAvail = state.partyType === 'customer' && state.customer ? Math.max(0, -Number(state.customer.balance || 0)) : 0;
    var credit = (creditAvail > 0 && $('creditChk') && $('creditChk').checked) ? Math.min(creditAvail, m.totalAmount) : 0;
    state.creditUsed = credit;
    // Full payment is the default until the cashier edits the field by hand.
    // Credit is subtracted first so paid + credit can never exceed the total.
    if (!state.paidTouched) syncPaidToTotal();
    var paid = paidTotal();
    var remain = m.totalAmount - paid - credit;
    $('creditAvail').textContent = fmt(creditAvail);
    $('creditRow').style.display = (creditAvail > 0 && state.partyType === 'customer') ? 'flex' : 'none';

    var html =
      '<div class="trow"><span>المجموع قبل الخصم</span><b>' + fmt(m.subTotal) + '</b></div>' +
      (m.custDiscAmount > 0 ? '<div class="trow"><span>خصم العميل (' + m.custDiscPct + '%)</span><b style="color:var(--danger)">− ' + fmt(m.custDiscAmount) + '</b></div>' : '') +
      '<div class="trow"><span>خصم إضافي</span><input class="inp num-input" type="text" inputmode="decimal" dir="ltr" id="extraDiscInp" value="' + (Number($('totalsBox').dataset.extra) || 0) + '" onchange="setExtraDisc(this.value)"></div>' +
      (mitem('خصومات الخطوط', -totalLineDiscSum())) +
      '<div class="trow total"><span>الإجمالي النهائي</span><b>' + fmt(m.totalAmount) + '</b></div>';

    els.totalsBox.dataset.extra = String(Number($('totalsBox').dataset.extra) || 0);
    els.totalsBox.innerHTML = html;
    var extraInp = $('extraDiscInp');
    if (extraInp && document.activeElement !== extraInp) {
      // keep current value
    }

    $('remainingTxt').textContent = remain > 0 ? 'المتبقي: ' + fmt(remain) : (remain < 0 ? 'المدفوع أكبر من الإجمالي' : 'تم السداد');
    $('remainingTxt').style.color = remain < 0 ? 'var(--danger)' : 'var(--warn)';
    $('confirmSub').textContent = paid > 0 ? 'المدفوع: ' + fmt(paid) + (credit > 0 ? ' + رصيد ' + fmt(credit) : '') : 'لم يُدفع بعد';
    var confirmBtn = $('confirmBtn');
    confirmBtn.disabled = (!state.seller) || remain < -0.001;
    if (!state.seller) confirmBtn.disabled = true;
    if (els.checkoutSub) els.checkoutSub.textContent = fmt(m.totalAmount) + ' — ' + (state.cart.length ? state.cart.length + ' منتج' : '');
    var led = $('ledTotal');
    if (led) led.textContent = numFmt(m.totalAmount) + ' دج';
  }

  function mitem(label, amount) {
    if (!amount) return '';
    return '<div class="trow"><span>' + label + '</span><b style="color:var(--danger)">− ' + fmt(Math.abs(amount)) + '</b></div>';
  }
  function totalLineDiscSum() {
    var s = 0;
    for (var i = 0; i < state.cart.length; i++) s += Math.min(state.cart[i].discount || 0, state.cart[i].price * state.cart[i].qty);
    return s;
  }

  function setExtraDisc(v) {
    els.totalsBox.dataset.extra = String(Math.max(0, Number(v) || 0));
    renderTotals();
  }

  function paidTotal() {
    if (state.payMethod === 'mixed') {
      return (Number($('paidCash').value) || 0) + (Number($('paidCcp').value) || 0);
    }
    return Number($('paidSingle').value) || 0;
  }

  // Full payment is the default: the paid amount is what is owed (total −
  // customer credit). Floored to cents so paid + credit can never edge past
  // the total on the desktop and trip PAID_EXCEEDS.
  function autoPaidAmount() {
    var m = saleMath();
    var owed = Math.max(0, m.totalAmount - (state.creditUsed || 0));
    return Math.floor(owed * 100) / 100;
  }

  function syncPaidToTotal() {
    var v = String(autoPaidAmount());
    if (state.payMethod === 'mixed') {
      $('paidCash').value = v;
      $('paidCcp').value = '0';
    } else {
      $('paidSingle').value = v;
      $('paidCash').value = v;
    }
  }

  function setPayMethod(m) {
    var before = paidTotal();                     // read with the OLD method
    state.payMethod = m;
    $('pmCash').classList.toggle('active', m === 'cash');
    $('pmCcp').classList.toggle('active', m === 'ccp');
    $('pmMixed').classList.toggle('active', m === 'mixed');
    $('paidSingle').style.display = (m === 'mixed') ? 'none' : '';
    $('paidCash').style.display = (m === 'mixed') ? '' : 'none';
    $('paidCcp').style.display = (m === 'mixed') ? '' : 'none';
    if (state.paidTouched) {
      // carry the amount the cashier already typed into the new layout
      if (m === 'mixed') {
        $('paidCash').value = String(before);
        $('paidCcp').value = '0';
      } else {
        $('paidSingle').value = String(before);
        $('paidCash').value = String(before);
      }
    } else {
      syncPaidToTotal();
    }
    renderTotals();
  }
  ['paidSingle', 'paidCash', 'paidCcp'].forEach(function (id) {
    $(id).addEventListener('input', function () { state.paidTouched = true; renderTotals(); });
  });
  if ($('creditChk')) $('creditChk').addEventListener('change', renderTotals);

  // ---- party (customer / supplier) ---------------------------------------------

  function toggleSupMode() {
    if (state.partyType === 'customer') {
      state.partyType = 'supplier';
      els.supToggle.textContent = 'عميل';
      els.supToggle.classList.add('on');
      state.customer = null;
    } else {
      state.partyType = 'customer';
      els.supToggle.textContent = 'مورد';
      els.supToggle.classList.remove('on');
      state.supplier = null;
    }
    els.searchInput && (els.partyInput.value = '');
    els.partyResults.style.display = 'none';
    renderCart();
  }

  var partyTimer = null;
  els.partyInput.addEventListener('input', function () {
    clearTimeout(partyTimer);
    partyTimer = setTimeout(searchParty, 300);
  });
  els.partyInput.addEventListener('focus', function () { if (els.partyInput.value.trim()) searchParty(); });

  function searchParty() {
    var q = els.partyInput.value.trim();
    if (!q) { els.partyResults.style.display = 'none'; return; }
    var isSup = state.partyType === 'supplier';
    req(isSup ? 'suppliers/search' : 'customers/search', { q: q }).then(function (d) {
      var rows = (d && d.results) || [];
      if (!rows.length) { els.partyResults.style.display = 'none'; return; }
      els.partyResults.style.display = 'block';
      els.partyResults.innerHTML = rows.map(function (r, i) {
        var isSel = isSup ? (state.supplier && state.supplier.id === r.id) : (state.customer && state.customer.id === r.id);
        var sub = isSup ? ('الرصيد: ' + fmt(r.balance)) : ('الرصيد: ' + fmt(r.balance) + (r.discount ? ' · خصم ' + r.discount + '%' : ''));
        return '<div class="prow' + (isSel ? ' selected' : '') + '" onclick="__PS.selectParty(' + i + ')"><div class="n">' + esc(r.name) + '</div><div class="m">' + esc(r.phone || '') + ' · ' + sub + '</div></div>';
      }).join('');
      state._partyResults = rows;
    }).catch(function () {});
  }

  function selectParty(i) {
    var rows = state._partyResults || [];
    var r = rows[i];
    if (!r) return;
    if (state.partyType === 'supplier') { state.supplier = r; state.customer = null; }
    else { state.customer = r; state.supplier = null; }
    els.partyInput.value = r.name;
    els.partyResults.style.display = 'none';
    renderCart();
  }

  // ---- seller picker -----------------------------------------------------------

  function openSellerPicker() {
    if (els.lockScreen.style.display === 'flex') return;
    renderSellerPicker();
    els.sellerOverlay.style.display = 'flex';
  }
  function closeSellerPicker() { els.sellerOverlay.style.display = 'none'; }
  function renderSellerPicker() {
    if (!state.sellers.length) { els.sellerList.innerHTML = '<div class="empty">لا يوجد موظفون</div>'; return; }
    els.sellerList.innerHTML = state.sellers.map(function (s) {
      return '<div class="emp' + (state.seller && state.seller.id === s.id ? ' sel' : '') + '" onclick="__PS.pickSeller(' + JSON.stringify(s.id) + ')">' + esc(s.name) + '</div>';
    }).join('');
  }
  function pickSeller(id) {
    var s = state.sellers.filter(function (x) { return x.id === id; })[0];
    if (s) { state.seller = s; els.sellerName.textContent = s.name; }
    closeSellerPicker();
    renderTotals();
  }

  // ---- confirm sale -------------------------------------------------------------

  function confirmSale() {
    var m = saleMath();
    if (!state.cart.length) { toast('السلة فارغة', 'err'); return; }
    if (!state.seller) { toast('اختر الموظف أولاً', 'err'); openSellerPicker(); return; }
    var pay = state.payMethod === 'mixed'
      ? { method: 'mixed', cash: Number($('paidCash').value) || 0, ccp: Number($('paidCcp').value) || 0, total: paidTotal() }
      : { method: state.payMethod, cash: state.payMethod === 'cash' ? paidTotal() : 0, ccp: state.payMethod === 'ccp' ? paidTotal() : 0, total: Math.max(0, paidTotal()) };
    var payload = {
      seller: { id: state.seller.id, name: state.seller.name },
      deviceName: deviceName,
      supMode: state.partyType === 'supplier',
      customerId: state.partyType === 'customer' ? (state.customer ? state.customer.id : null) : null,
      supplierId: state.partyType === 'supplier' ? (state.supplier ? state.supplier.id : null) : null,
      lines: state.cart.map(function (l) {
        return { productId: l.productId, name: l.name, barcode: l.barcode, qty: l.qty, price: l.price, discount: l.discount };
      }),
      extraDiscount: m.extraDiscAmount,
      pay: pay,
      creditUsed: state.creditUsed,
    };
    var btn = $('confirmBtn');
    btn.disabled = true;
    btn.querySelector('.sub').textContent = 'جارٍ الحفظ…' + ' (انقر مجددًا إذا تأخر)';
    req('sale/submit', payload).then(function (res) {
      state.cart = [];
      state.paidTouched = false;
      renderCart();
      $('paidSingle').value = '0';
      $('paidCash').value = '0';
      $('paidCcp').value = '0';
      els.totalsBox.dataset.extra = '0';
      closeCheckoutSheet();
      showSuccess(res);
    }).catch(function (e) {
      btn.disabled = false;
      renderTotals();
      toast(mapErr(e), 'err');
    });
  }

  function mapErr(e) {
    switch (e.code) {
      case 'SELLER': return 'تعذر التحقق من الموظف';
      case 'CUSTOMER': return 'العميل غير موجود';
      case 'EMPTY': return 'السلة فارغة';
      case 'STOCK': return 'الكمية غير متوفرة للمنتج المحدد';
      case 'PAID_EXCEEDS': return 'المبلغ المدفوع أكبر من الإجمالي';
      case 'NOT_ALLOWED': return 'البيع معطّل لهذا الجهاز';
      case 'DISABLED': return 'البيع من الهاتف غير مفعّل';
      case 'OFFLINE': return 'غير متصل بالمتجر';
      case 'TIMEOUT': return 'انتهت المهلة — تحقق من وصول الفاتورة في القائمة';
      default: return e.msg || 'فشل البيع';
    }
  }

  function showSuccess(res) {
    var html =
      '<div class="big">&#10003;</div>' +
      '<h2>تم إتمام البيع</h2>' +
      '<div class="num">' + esc(res.invoiceNumber) + '</div>' +
      '<div style="margin-top:14px;font-size:16px;"><b>' + fmt(res.totalAmount) + '</b></div>' +
      (res.paidAmount ? '<div style="margin-top:4px;color:var(--dim);font-size:13px;">المدفوع: ' + fmt(res.paidAmount) +
        (res.creditUsed ? ' + رصيد ' + fmt(res.creditUsed) : '') + '</div>' : '') +
      (res.remaining > 0 ? '<div style="color:var(--warn);font-size:13px;margin-top:2px;">متبقي: ' + fmt(res.remaining) + '</div>' : '') +
      '<div class="items">' + (res.items || []).map(function (it) {
        return '<div class="srow"><span>' + esc(it.name) + ' × ' + it.qty + '</span><b>' + fmt(it.price) + '</b></div>';
      }).join('') + '</div>' +
      '<button class="sbtn" onclick="__PS.newSale()">فاتورة جديدة</button>' +
      '<button class="sbtn ghost" onclick="__PS.seeInvoices()">عرض الفواتير</button>';
    els.successView.innerHTML = html;
    els.successView.style.display = 'flex';
  }
  function newSale() {
    els.successView.style.display = 'none';
    $('searchInput').focus();
  }
  function seeInvoices() {
    els.successView.style.display = 'none';
    switchView('invoices');
  }

  // ---- invoices -----------------------------------------------------------------

  function loadInvoices() {
    $('invoiceList').innerHTML = '<div class="empty">جارٍ التحميل…</div>';
    req('invoices/list', { type: state.invType, limit: 25 }).then(function (d) {
      var list = (d && d.list) || [];
      var chips = '<div class="modes" style="position:sticky;top:0;z-index:5;">' +
        '<button class="mode' + (state.invType === 'all' ? ' active' : '') + '" onclick="__PS.invType(\'all\')">الكل</button>' +
        '<button class="mode' + (state.invType === 'customer' ? ' active' : '') + '" onclick="__PS.invType(\'customer\')">عملاء</button>' +
        '<button class="mode' + (state.invType === 'sup_sale' ? ' active' : '') + '" onclick="__PS.invType(\'sup_sale\')">مورد</button>' +
      '</div>';
      if (!list.length) {
        $('invoiceList').innerHTML = chips + '<div class="empty">لا فواتير بعد</div>';
        return;
      }
      $('invoiceList').innerHTML = chips + list.map(function (iv) {
        var who = iv.customerName || iv.supplierName || 'زبون';
        var when = new Date(iv.date).toLocaleString('ar-DZ', { dateStyle: 'short', timeStyle: 'short' });
        return '<div class="inv" onclick="__PS.invoiceDetail(' + JSON.stringify(iv.id) + ')">' +
          '<div class="h"><span class="n">' + esc(iv.number) + '</span><span class="d">' + esc(when) + '</span></div>' +
          '<div class="who">' + esc(who) + (iv.seller ? ' — ' + esc(iv.seller) : '') + '</div>' +
          '<div class="sub"><span>الفاتورة: <span class="amt">' + fmt(iv.totalAmount) + '</span></span>' +
          (iv.remaining > 0 ? '<span style="color:var(--warn)">متبقي: ' + fmt(iv.remaining) + '</span>' : '<span style="color:var(--ok)">مسددة</span>') +
          '</div>' +
        '</div>';
      }).join('');
    }).catch(function () {
      $('invoiceList').innerHTML = '<div class="empty">تعذر تحميل الفواتير</div>';
    });
  }

  function invType(t) {
    state.invType = t;
    loadInvoices();
  }

  function invoiceDetail(id) {
    req('invoice/get', { id: id }).then(function (iv) {
      var when = new Date(iv.date).toLocaleString('ar-DZ', { dateStyle: 'short', timeStyle: 'short' });
      var who = iv.customerName || iv.supplierName || 'زبون';
      var html =
        '<h3>الفاتورة ' + esc(iv.number) + ' <button class="x" onclick="this.closest(\'.overlay\').style.display=\'none\'">✕</button></h3>' +
        '<div style="font-size:13px;color:var(--dim);line-height:1.9">' +
          '<div>الزبون: <b style="color:var(--txt)">' + esc(who) + '</b></div>' +
          '<div>التاريخ: ' + esc(when) + '</div>' +
          (iv.seller ? '<div>الموظف: ' + esc(iv.seller) + '</div>' : '') +
          '<div>الإجمالي: <b style="color:var(--accent)">' + fmt(iv.totalAmount) + '</b></div>' +
          '<div>المدفوع: ' + fmt(iv.paidAmount) + '</div>' +
          (iv.remaining > 0 ? '<div style="color:var(--warn)">المتبقي: ' + fmt(iv.remaining) + '</div>' : '') +
        '</div>' +
        '<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:8px;">' +
          (iv.items || []).map(function (it) {
            return '<div class="srow"><span>' + esc(it.name) + ' × ' + it.qty + '</span><b>' + fmt(it.price) + '</b></div>';
          }).join('') +
        '</div>';
      var ov = document.createElement('div');
      ov.className = 'overlay';
      ov.style.display = 'flex';
      ov.innerHTML = '<div class="sheet">' + html + '</div>';
      ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
      document.body.appendChild(ov);
    }).catch(function (e) { toast(e.msg || 'تعذر تحميل الفاتورة', 'err'); });
  }

  // ---- barcode camera ------------------------------------------------------------

  var cameraActive = false;
  function toggleScanner() {
    if (cameraActive) { cameraActive = false; document.getElementById('scanVideo').style.display = 'none'; return; }
    cameraActive = true;
    var video = document.getElementById('scanVideo');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('الكاميرا غير متاحة', 'err'); cameraActive = false; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
      video.srcObject = stream;
      video.style.display = 'block';
      video.style.position = 'fixed';
      video.style.top = '0'; video.style.left = '0'; video.style.width = '100vw'; video.style.height = '100vh';
      video.style.objectFit = 'cover'; video.style.zIndex = '80';
      video.setAttribute('playsinline', '');
      toast('وجّه الكاميرا نحو الباركود');
      var base = window.ZXing ? new ZXing.BrowserBarcodeReader(window.ZXing.BarcodeFormat) : null;
      var stop = function () {
        cameraActive = false;
        video.style.display = 'none';
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        if (base && base.stopContinuousDecode) { try { base.stopContinuousDecode(); } catch (e) {} }
      };
      video.onclick = stop;
      if (base) {
        base.decodeFromVideoDevice(undefined, 'scanVideo', function (result) {
          if (result && result.text) {
            onScanned(String(result.text).trim());
            window.setTimeout(stop, 700);
          }
        }).catch(function () { toast('تعذّر تشغيل محلل الباركود', 'err'); cameraActive = false; });
      } else {
        toast('المحلل غير متاح', 'err');
        stop();
      }
    }).catch(function () { cameraActive = false; toast('رفض إذن الكاميرا', 'err'); });
  }

  function onScanned(code) {
    req('product/barcode', { code: code }).then(function (d) {
      if (d && d.product) {
        addToCart(d.product);
        toast('أُضيف: ' + d.product.name, 'ok');
      } else {
        toast('المنتج غير موجود: ' + code, 'err');
      }
    }).catch(function (e) { toast(e.msg || 'تعذر البحث بالباركود', 'err'); });
  }

  // ---- public API for inline handlers --------------------------------------------

  window.__PS = {
    addByIndex: addByIndex,
    addToCart: addToCart,
    setQty: setQty, setQtyVal: setQtyVal,
    setPrice: setPrice, setDisc: setDisc,
    removeLine: removeLine,
    setExtraDisc: setExtraDisc,
    setPayMethod: setPayMethod,
    toggleSupMode: toggleSupMode,
    selectParty: selectParty,
    pickSeller: pickSeller,
    confirmSale: confirmSale,
    emptyCart: emptyCart,
    openCheckoutSheet: openCheckoutSheet,
    newSale: newSale,
    seeInvoices: seeInvoices,
    invoiceDetail: invoiceDetail,
    invType: invType,
  };
  window.switchView = switchView;
  window.setMode = function (m) { state.mode = m; document.querySelectorAll('.mode[data-mode]').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === m); }); loadProducts(els.searchInput.value.trim()); };
  window.toggleScanner = toggleScanner;
  window.openSellerPicker = openSellerPicker;
  window.retryConnect = retryConnect;
  // inline onclick handlers in index.html resolve against window — expose them
  window.confirmSale = confirmSale;
  window.setPayMethod = setPayMethod;
  window.toggleSupMode = toggleSupMode;
  window.closeSellerPicker = closeSellerPicker;
  window.openCheckoutSheet = openCheckoutSheet;
  window.closeCheckoutSheet = closeCheckoutSheet;

  // ---- boot ------------------------------------------------------------------------

  function boot() {
    setConn(false);
    $('confirmBtn').disabled = true;
    ['paidSingle', 'paidCash', 'paidCcp'].forEach(function (id) { $(id).value = '0'; });
    // apply the default payment layout (cash → paidSingle visible, full amount)
    setPayMethod(state.payMethod);
    setTimeout(function () {
      var t = localStorage.getItem('zmt_ph_token');
      if (t) { token = t; connectWS(); }
      else pair();
    }, 200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.addEventListener('beforeunload', function () {
    closeWS();
    if (heartbeat) clearInterval(heartbeat);
  });
})();