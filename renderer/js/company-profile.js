// Company-isolated profile bootstrap.
//
// This script is loaded BEFORE auth.js/db.js so the launch company can be
// pinned synchronously from `index.html?company=<id>`. The actual migration is
// asynchronous and runs once from bootApp() after DB.initProgressive().
//
// Isolation guarantees:
//   * one Electron process + one userData folder per company;
//   * snapshot import is company-scoped and verified against the launch id;
//   * no auth session is copied — every company window requires its own login;
//   * the shared main instance remains the only LAN/cloud owner.
var CompanyProfile = (function () {
  var READY_KEY = 'zmt_company_profile_ready';
  var SNAPSHOT_AT_KEY = 'zmt_company_profile_snapshot_at';

  function _queryCompanyId() {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = params.get('company') || '';
      return /^[A-Za-z0-9_-]{1,120}$/.test(raw) ? raw : '';
    } catch (e) {
      return '';
    }
  }

  var COMPANY_ID = _queryCompanyId();
  var ISOLATED = !!COMPANY_ID;

  // Pin the scope before DB/auth initialise: DB._getCompanyId() reads this key.
  if (ISOLATED) {
    window.__zmtCompanyIsolated = true;
    window.__zmtLaunchCompanyId = COMPANY_ID;
    try {
      localStorage.setItem('zmt_active_company', COMPANY_ID);
      localStorage.setItem('zmt_company_profile_marker', COMPANY_ID);
    } catch (e) {}
  }

  var _initPromise = null;

  var OPERATIONAL_STORES = [
    'products', 'invoices', 'payments', 'customers', 'suppliers',
    'discounts', 'returns', 'transfers', 'supplierReturns', 'routeDocs',
    'orders', 'employees', 'attendance', 'auditLogs',
  ];

  // Settings/identity keys copied from the shared profile at migration time.
  // The session itself is deliberately excluded: a fresh login is mandatory in
  // every company window, otherwise one company could inherit another's role.
  var STORAGE_EXCLUDE = [
    'zmt_auth_user',
    'zmt_active_company',
    'zmt_remembered_company',
    'zmt_scope_log',
    'zmt_last_scope',
  ];

  function _isMainOnlyKey(key) {
    if (STORAGE_EXCLUDE.indexOf(key) !== -1) return true;
    // LAN / cloud ownership stays in the main instance. Company processes get
    // clean defaults even if the shared profile had those toggles enabled.
    if (/^zmt_(lan|cloud|phs|psale)_/.test(key)) return true;
    return false;
  }

  function _applyLocalStorage(mirror) {
    if (!mirror || typeof mirror !== 'object') return;
    Object.keys(mirror).forEach(function (key) {
      if (!/^zmt_/.test(key) || _isMainOnlyKey(key)) return;
      try { localStorage.setItem(key, mirror[key]); } catch (e) {}
    });
    // Re-pin after applying the mirror (a stale snapshot must not move scope).
    try { localStorage.setItem('zmt_active_company', COMPANY_ID); } catch (e) {}
  }

  function _defaultCompanyId(snapshot) {
    var meta = (snapshot && snapshot.db && snapshot.db.meta) || {};
    if (meta.defaultCompanyId) return meta.defaultCompanyId;
    var companies = (snapshot && snapshot.db && snapshot.db.companies) || [];
    var byId = companies.find(function (c) { return c && c.id === 'zmt-default-company'; });
    if (byId) return byId.id;
    var oldest = companies.slice().sort(function (a, b) {
      return (a && a.createdAt ? a.createdAt : 0) - (b && b.createdAt ? b.createdAt : 0);
    })[0];
    return oldest ? oldest.id : '';
  }

  // Keep ONLY this company's operational rows. Legacy rows without a companyId
  // belong to the snapshot's default company, so they are included only when
  // this company IS that default. This prevents "default" leftovers from
  // leaking into a newly-created isolated company.
  function _scopeDb(snapshot) {
    var src = (snapshot && snapshot.db) || {};
    var defaultId = _defaultCompanyId(snapshot);
    var includeLegacy = !defaultId || defaultId === COMPANY_ID;
    var out = { meta: Object.assign({}, src.meta || {}, { defaultCompanyId: COMPANY_ID }) };

    OPERATIONAL_STORES.forEach(function (store) {
      var rows = Array.isArray(src[store]) ? src[store] : null;
      if (!rows) return;
      out[store] = rows.filter(function (row) {
        if (!row || typeof row !== 'object') return false;
        if (row.companyId === COMPANY_ID) return true;
        return includeLegacy && !row.companyId;
      });
    });

    var company = (snapshot && snapshot.company) || null;
    var self = (Array.isArray(src.companies) && src.companies.find(function (c) { return c && c.id === COMPANY_ID; })) || company || {
      id: COMPANY_ID,
      name: (snapshot && snapshot.companyName) || COMPANY_ID,
      createdAt: Date.now(),
    };
    out.companies = [Object.assign({}, self, { id: COMPANY_ID })];
    return out;
  }

  function _ensureSelfCompany(snapshot) {
    if (typeof DB === 'undefined' || !DB.importAll) return Promise.resolve();
    var company = (snapshot && snapshot.company) || {
      id: COMPANY_ID,
      name: (snapshot && snapshot.companyName) || COMPANY_ID,
      createdAt: Date.now(),
    };
    return Promise.resolve(DB.importAll({
      companies: [Object.assign({}, company, { id: COMPANY_ID })],
      meta: { defaultCompanyId: COMPANY_ID },
    }));
  }

  // After importing, drop the auto-created default company when this profile is
  // a different company. The selector then shows exactly one company, so there
  // is nothing to accidentally switch to.
  function _removeForeignCompanies() {
    if (typeof DB === 'undefined' || !DB.getCompanies || !DB.removeCompany) return;
    try {
      DB.getCompanies().forEach(function (c) {
        if (c && c.id && c.id !== COMPANY_ID) DB.removeCompany(c.id);
      });
    } catch (e) {}
  }

  function _run() {
    if (!ISOLATED) return Promise.resolve({ skipped: true });
    if (typeof DB === 'undefined' || !DB.importAll) {
      return Promise.resolve({ skipped: true, error: 'DB_NOT_READY' });
    }

    var api = window.electronAPI || {};
    if (!api.getBaseAppDataPath || !api.readFile) {
      return _ensureSelfCompany(null).then(function () {
        return { migrated: false, error: 'SNAPSHOT_API_UNAVAILABLE' };
      });
    }

    return Promise.resolve(api.getBaseAppDataPath()).then(function (base) {
      var snapshotPath = String(base).replace(/[\\/]+$/, '') + '/company-profiles/' + COMPANY_ID + '/migration.json';
      return Promise.resolve(api.readFile(snapshotPath)).then(function (res) {
        var snap = null;
        if (res && res.success && res.data) {
          try { snap = JSON.parse(res.data); } catch (e) { snap = null; }
        }

        var stamp = snap ? String(snap.createdAt || '') : '';
        if (!snap) {
          var readyWithoutSnapshot = '';
          try { readyWithoutSnapshot = localStorage.getItem(READY_KEY) || ''; } catch (e) {}
          if (readyWithoutSnapshot) return { skipped: true, reason: 'READY' };
          return _ensureSelfCompany(null).then(function () {
            try {
              localStorage.setItem(READY_KEY, 'empty');
              localStorage.setItem(SNAPSHOT_AT_KEY, '');
            } catch (e) {}
            return { migrated: false, reason: 'SNAPSHOT_MISSING' };
          });
        }

        if (snap.companyId && snap.companyId !== COMPANY_ID) {
          throw new Error('SNAPSHOT_COMPANY_MISMATCH');
        }
        if (stamp && localStorage.getItem(SNAPSHOT_AT_KEY) === stamp && localStorage.getItem(READY_KEY) === COMPANY_ID) {
          return { skipped: true, reason: 'UP_TO_DATE' };
        }

        _applyLocalStorage(snap.localStorage);
        return Promise.resolve(DB.importAll(_scopeDb(snap), { mergeNewer: false })).then(function () {
          _removeForeignCompanies();
          try {
            localStorage.setItem(READY_KEY, COMPANY_ID);
            localStorage.setItem(SNAPSHOT_AT_KEY, stamp);
            localStorage.setItem('zmt_active_company', COMPANY_ID);
          } catch (e) {}
          return { migrated: true, at: stamp };
        });
      });
    }).catch(function (e) {
      console.error('[CompanyProfile] migration failed:', e);
      return { migrated: false, error: (e && e.message) || String(e) };
    });
  }

  return {
    COMPANY_ID: COMPANY_ID,
    isolated: ISOLATED,
    readyKey: READY_KEY,
    // Idempotent: every call returns the same in-flight promise.
    init: function () {
      if (!_initPromise) _initPromise = _run();
      return _initPromise;
    },
    scopeDb: _scopeDb,
  };
})();
