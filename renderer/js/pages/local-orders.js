// ============================================================
// ZMT PIECE - Local Orders page («الطلبات المحلية»)
// ============================================================
// Shows the orders this device is allowed to see on the restaurant
// feature (own sent orders for a sender, incoming ones for a receiver)
// and lets the operator drive the status + confirm the sale.

let _restLoFilter = 'all';
let _restLoTime = '';

function init_local_orders() {
  restLoBind();
  restLoRender();
}

function restLoBind() {
  if (window._restLoWired) return;
  window._restLoWired = true;
  window.addEventListener('rest:orders', restLoRender);
  window.addEventListener('rest:config', restLoRender);
  window.addEventListener('rest:perms', restLoRender);
  window.addEventListener('rest:peers', restLoRender);
}

function restLoFilter(f) {
  _restLoFilter = f;
  const bar = document.getElementById('restLoToolbar');
  if (bar) bar.querySelectorAll('.rest-orders-tab').forEach(b2 => b2.classList.toggle('active', b2.getAttribute('data-f') === f));
  restLoRender();
}

function restLoRefresh() {
  if (window.RestService && RestService.syncPresenceNow) RestService.syncPresenceNow();
  restLoRender();
}

function restLoRoleLabel(role) {
  return role === 'send' ? t('rest.roleSend') : role === 'receive' ? t('rest.roleReceive') : t('rest.roleNone');
}

function restLoHeader() {
  const status = document.getElementById('restLoStatus');
  const toolbar = document.getElementById('restLoToolbar');
  const list = document.getElementById('restLoList');
  const empty = document.getElementById('restLoEmpty');
  const title = document.getElementById('restLoStatusTitle');
  const sub = document.getElementById('restLoStatusSub');
  const tabs = document.getElementById('restLoTabs');
  const count = document.getElementById('restLoCount');
  const icon = document.getElementById('restLoStatusIcon');

  if (!window.RestService) { if (status) status.style.display = 'none'; if (toolbar) toolbar.style.display = 'none'; if (empty) empty.style.display = ''; return; }
  const cfg = RestService.getConfig();

  if (!cfg.enabled) {
    if (status) { status.style.display = ''; if (title) title.textContent = t('rest.disabled'); if (sub) sub.textContent = t('rest.roleNoneHint'); }
    if (toolbar) toolbar.style.display = 'none';
    setLoEmpty(true, false);
    return;
  }

  if (status) {
    status.style.display = '';
    if (icon) icon.innerHTML = `<i class="fas ${cfg.enabled ? 'fa-utensils' : 'fa-pause-circle'}"></i>`;
    if (title) title.textContent = cfg.enabled
      ? `${RestService.me().name} — ${restLoRoleLabel(cfg.role)}`
      : t('rest.disabled');
    if (sub) sub.textContent = cfg.enabled
      ? (cfg.role === 'send'
          ? `${(RestService.receiverPeers ? RestService.receiverPeers() : []).length} ${t('rest.receiverLabel')}`
          : (RestService.peersList() || []).length + ' ' + t('rest.deviceCol'))
      : t('rest.roleNoneHint');
  }

  if (toolbar) toolbar.style.display = '';
  if (tabs) {
    const statuses = [
      ['all', t('rest.all')],
      ['new', t('rest.statusNew')],
      ['inprogress', t('rest.statusInprogress')],
      ['done', t('rest.statusDone')],
      ['confirmed', t('rest.statusConfirmed')],
      ['cancelled', t('rest.statusCancelled')]
    ];
    tabs.innerHTML = statuses.map(s =>
      `<button class="rest-orders-tab ${_restLoFilter === s[0] ? 'active' : ''}" data-f="${s[0]}" onclick="restLoFilter('${s[0]}')">${escHtml(s[1])}</button>`
    ).join('');
  }
  const orders = RestService.orders();
  if (count) count.textContent = `${orders.length} ${t('nav.localOrders')}`;
  return orders;
}

function setLoEmpty(show, enabled) {
  const empty = document.getElementById('restLoEmpty');
  if (!empty) return;
  empty.style.display = show ? '' : 'none';
  if (!show) return;
  const p = empty.querySelector('p');
  const s = empty.querySelector('span');
  if (p) p.textContent = t('rest.ordersEmpty');
  if (s) s.textContent = enabled ? t('rest.emptyCartHint') : t('rest.roleNoneHint');
}

function restLoAct(id, action) {
  if (!window.RestService) return;
  const ord = (RestService.orders() || []).find(o => o.id === id);
  if (!ord) return;
  if (action === 'confirm') { RestService.openConfirmDialog(ord); return; }
  if (action === 'inprogress' || action === 'done' || action === 'cancel') {
    const res = RestService.updateStatus(id, action, {});
    if (res && res.ok && action === 'inprogress') RestService.printKitchenTicket(id);
    if (res && res.ok) restLoRender();
  }
}

function restLoStatusKey(status) {
  if (window.RestCore && window.RestCore.statusLabelKey) return window.RestCore.statusLabelKey(status);
  return 'rest.statusNew';
}

function restLoStatusBadge(status) {
  if (window.RestCore && window.RestCore.statusBadgeClass) return window.RestCore.statusBadgeClass(status);
  return 'info';
}

function restLoRender() {
  const list = document.getElementById('restLoList');
  if (!list) return;
  const orders = restLoHeader() || [];

  const filtered = _restLoFilter === 'all' ? orders : orders.filter(o => o.status === _restLoFilter);
  setLoEmpty(filtered.length === 0, !!(window.RestService && RestService.getConfig().enabled));

  const cards = filtered.map(ord => {
    const tot = window.RestCore ? window.RestCore.totals(ord) : { itemsTotal: 0, discount: 0, total: 0 };
    const actions = window.RestCore ? window.RestCore.availableActions(ord, RestService.me(), RestService.permsForOrder ? RestService.permsForOrder(ord) : RestService.permsFor(RestService.me().id)) : [];
    const items = (ord.items || []).map(it =>
      `<div class="rest-lo-item"><span>${escHtml(it.name)}</span><small>${window.Unit ? window.Unit.qtyUnit(it.qty, it) : (window.RestCore ? window.RestCore.num(it.qty) : it.qty)} × ${fmtMoney(it.price)}</small></div>`
    ).join('');
    const peerName = RestService.me().id === String((ord.from || {}).id)
      ? (RestService.receiverPeers() || []).find(p => p.id === ord.to)
      : (RestService.peersList() || []).find(p => p.id === String((ord.from || {}).id));
    const peerTxt = (ord.from && RestService.me().id !== String(ord.from.id)) ? (ord.from.name || '') : (peerName ? peerName.name : '');
    const actBtns = [
      actions.indexOf('inprogress') !== -1 ? `<button type="button" class="rest-btn rest-btn-progress rest-btn-sm" onclick="restLoAct('${ord.id}','inprogress')"><i class="fas fa-fire"></i> ${escHtml(t('rest.inprogressBtn'))}</button>` : '',
      actions.indexOf('done') !== -1 ? `<button type="button" class="rest-btn rest-btn-done rest-btn-sm" onclick="restLoAct('${ord.id}','done')"><i class="fas fa-check"></i> ${escHtml(t('rest.doneBtn'))}</button>` : '',
      actions.indexOf('confirm') !== -1 ? `<button type="button" class="rest-btn rest-btn-confirm rest-btn-sm" onclick="restLoAct('${ord.id}','confirm')"><i class="fas fa-cash-register"></i> ${escHtml(t('rest.confirmBtn'))}</button>` : '',
      actions.indexOf('cancel') !== -1 ? `<button type="button" class="rest-btn rest-btn-cancel rest-btn-sm" onclick="restLoAct('${ord.id}','cancel')"><i class="fas fa-ban"></i> ${escHtml(t('rest.cancel'))}</button>` : ''
    ].filter(Boolean).join('') || `<span class="rest-lo-noact"><i class="fas fa-minus"></i> ${escHtml(t('rest.noActions'))}</span>`;

    const d = new Date(ord.createdAt);
    const timeStr = _restLoTime + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    return `<div class="rest-lo-card" data-status="${escAttr(ord.status)}">
      <div class="rest-lo-card-head">
        <span class="prod-card-badge ${restLoStatusBadge(ord.status)}">${escHtml(t(restLoStatusKey(ord.status)))}</span>
        <span class="rest-lo-id">#${escHtml(String(ord.id).slice(-6))}</span>
        ${ord.invoiceNo ? `<span class="rest-lo-inv">${escHtml(t('rest.invoiceTitle'))} ${escHtml(ord.invoiceNo)}</span>` : ''}
      </div>
      <div class="rest-lo-card-meta">
        <span><i class="fas fa-chair"></i> ${escHtml(t('rest.tablePrefix'))} ${escHtml(ord.table)}</span>
        <span><i class="fas fa-clock"></i> ${escHtml(timeStr)}</span>
        ${peerTxt ? `<span><i class="fas fa-user"></i> ${escHtml(peerTxt)}</span>` : ''}
      </div>
      <div class="rest-lo-items">${items}</div>
      ${ord.notes ? `<div class="rest-lo-notes"><i class="fas fa-comment-dots"></i> ${escHtml(ord.notes)}</div>` : ''}
      <div class="rest-lo-card-foot">
        <div class="rest-lo-total"><span>${escHtml(t('rest.total'))}</span><b>${fmtMoney(tot.total)}</b></div>
        <div class="rest-lo-actions">${actBtns}</div>
      </div>
    </div>`;
  }).join('');

  list.innerHTML = cards;
}

// refresh on navigation into the page
document.addEventListener('click', function (e) {
  if (e.target && e.target.closest && e.target.closest('[data-page="local-orders"]')) {
    _restLoTime = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ';
    restLoRender();
  }
});