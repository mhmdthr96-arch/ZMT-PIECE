// ZMT PIECE — حركات الموردين (supplier movements)
// Thin wrapper around the shared PartyMovements engine (js/lib/party-movements.js),
// which builds the ledger, the settlement markers and the printable report.
function init_supplier_movements() {
  if (!window.PartyMovements) return;
  window.PartyMovements.renderPage('supplier');
}

// Live refresh after any LAN/cloud sync so the ledger never shows stale figures.
window._pageSyncHandlers = window._pageSyncHandlers || {};
window._pageSyncHandlers['supplier-movements'] = function () {
  if (window.PartyMovements) window.PartyMovements.refresh();
};
