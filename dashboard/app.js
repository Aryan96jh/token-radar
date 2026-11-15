// Token Radar dashboard (radar-2). Static page, no network: all data comes
// from window.RADAR, written by main.ts into ../data.js. Views are
// deep-linkable (?tab, ?q, ?category, ?chain, ?watchlist, ?detail) so any
// state can be opened directly.

(function () {
  var D = window.RADAR;
  if (!D) {
    document.body.innerHTML = '<p style="padding:24px">No data loaded.</p>';
    return;
  }
  var rows = D.rows;
  var live = D.live;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + String(Math.round(n));
  }

  function pct(n) {
    if (n == null) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n >= 0 ? 'pos' : 'neg') + '">' + s + '</span>';
  }

  function age(n) {
    if (n >= 365) return (n / 365).toFixed(1) + 'y';
    return n + 'd';
  }

  function chains(c) {
    if (!c || c.length === 0) return '—';
    return c.length === 1 ? c[0] : c[0] + ' +' + (c.length - 1);
  }

  var params = new URLSearchParams(location.search);
  var state = {
    tab: params.get('tab') || 'board',
    sortKey: 'implied_value_usd',
    sortDir: -1,
    q: params.get('q') || '',
    category: params.get('category') || '',
    chain: params.get('chain') || '',
    watchlist: params.get('watchlist') === '1',
    detail: params.get('detail') || '',
  };

  // ---- header stats -------------------------------------------------
  document.getElementById('asOf').textContent = D.as_of;
  document.getElementById('stats').innerHTML = [
    [D.counts.protocols, 'protocols scanned'],
    [D.counts.watchlist, 'watchlist'],
    [D.counts.board, 'board rows'],
    [D.counts.live, 'live tokens'],
  ]
    .map(function (s) {
      return '<div class="stat"><b>' + s[0] + '</b><span>' + s[1] + '</span></div>';
    })
    .join('');

  // ---- tabs ----------------------------------------------------------
  var tabBtns = document.querySelectorAll('.tabs button');
  function showTab(name) {
    state.tab = name;
    tabBtns.forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    ['board', 'live', 'how'].forEach(function (t) {
      document.getElementById('tab-' + t).hidden = t !== name;
    });
  }
  tabBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      showTab(b.dataset.tab);
    });
  });

  // ---- filter controls ------------------------------------------------
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('category');
  var chainEl = document.getElementById('chain');
  var wlEl = document.getElementById('watchlist');

  var cats = Array.from(new Set(rows.map(function (r) { return r.category || ''; }))).sort();
  cats.forEach(function (c) {
    if (c) catEl.insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>');
  });
  var chainsSet = Array.from(new Set(rows.flatMap(function (r) { return r.chains; }))).sort();
  chainsSet.forEach(function (c) {
    chainEl.insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>');
  });

  qEl.value = state.q;
  catEl.value = state.category;
  chainEl.value = state.chain;
  wlEl.checked = state.watchlist;

  qEl.addEventListener('input', function () { state.q = qEl.value; renderTable(); });
  catEl.addEventListener('change', function () { state.category = catEl.value; renderTable(); });
  chainEl.addEventListener('change', function () { state.chain = chainEl.value; renderTable(); });
  wlEl.addEventListener('change', function () { state.watchlist = wlEl.checked; renderTable(); });

  // ---- board table ----------------------------------------------------
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.watchlist && !r.watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function sorted(list) {
    var k = state.sortKey;
    var dir = state.sortDir;
    return list.slice().sort(function (a, b) {
      var va = k === 'chains' ? (a.chains[0] || '') : a[k];
      var vb = k === 'chains' ? (b.chains[0] || '') : b[k];
      if (va == null) va = -Infinity;
      if (vb == null) vb = -Infinity;
      var cmp = va < vb ? -1 : va > vb ? 1 : 0;
      if (cmp === 0) cmp = a.slug < b.slug ? -1 : 1;
      return cmp * dir;
    });
  }

  var tbody = document.getElementById('rows');
  function renderTable() {
    var list = sorted(filtered());
    document.getElementById('rowCount').textContent = list.length + ' of ' + rows.length + ' rows';
    tbody.innerHTML = list
      .map(function (r) {
        return (
          '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="selected"' : '') + '>' +
          '<td>' + r.rank + '</td>' +
          '<td><b>' + esc(r.name) + '</b><br><span class="slug">' + esc(r.slug) + '</span>' +
          (r.watchlist ? '<span class="pill">WATCHLIST</span>' : '') + '</td>' +
          '<td>' + esc(r.category || '—') + '</td>' +
          '<td>' + esc(chains(r.chains)) + '</td>' +
          '<td>' + money(r.tvl_usd) + '</td>' +
          '<td>' + pct(r.change_7d) + '</td>' +
          '<td>' + age(r.age_days) + '</td>' +
          '<td class="num">' + money(r.implied_value_usd) + '</td></tr>'
        );
      })
      .join('');
  }

  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.dataset.key;
      if (state.sortKey === k) state.sortDir = -state.sortDir;
      else {
        state.sortKey = k;
        state.sortDir = k === 'name' || k === 'category' || k === 'chains' ? 1 : -1;
      }
      renderTable();
    });
  });

  tbody.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr');
    if (tr) showDetail(tr.dataset.slug);
  });

  // ---- detail panel ---------------------------------------------------
  var detailEl = document.getElementById('detail');
  function showDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    state.detail = slug;
    var mult = (r.base_multiple * r.growth_mult * r.maturity_mult * r.breadth_mult).toFixed(3);
    detailEl.hidden = false;
    detailEl.innerHTML =
      '<h2>' + esc(r.name) + ' <span class="slug">' + esc(r.slug) + '</span>' +
      (r.watchlist ? '<span class="pill">WATCHLIST</span>' : '') + '</h2>' +
      '<div>Rank #' + r.rank + ' &nbsp;·&nbsp; Implied value <span class="big">' + money(r.implied_value_usd) + '</span></div>' +
      '<div class="grid"><span>Category <b>' + esc(r.category || '—') + '</b></span>' +
      '<span>TVL <b>' + money(r.tvl_usd) + '</b></span>' +
      '<span>7d <b>' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b></span>' +
      '<span>Age <b>' + age(r.age_days) + '</b></span>' +
      '<span>Chains <b>' + esc(r.chains.join(', ')) + '</b></span></div>' +
      '<h3>Model breakdown</h3>' +
      '<div class="breakdown">' + money(r.tvl_usd) + ' × <b>' + r.base_multiple.toFixed(2) + '</b> base × <b>' +
      r.growth_mult.toFixed(3) + '</b> growth × <b>' + r.maturity_mult.toFixed(3) + '</b> maturity × <b>' +
      r.breadth_mult.toFixed(2) + '</b> breadth = ×<b>' + mult + '</b> → ' + money(r.implied_value_usd) + '</div>' +
      '<h3>Farm plan</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol>';
    renderTable();
    detailEl.scrollIntoView({ block: 'nearest' });
  }

  // ---- live tab ---------------------------------------------------------
  document.getElementById('liveRows').innerHTML = live
    .map(function (r, i) {
      return (
        '<tr><td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(r.name) + '</b><br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(chains(r.chains)) + '</td>' +
        '<td>' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td>' + pct(r.change_7d) + '</td></tr>'
      );
    })
    .join('');

  // ---- initial render ---------------------------------------------------
  showTab(state.tab);
  renderTable();
  if (state.detail) showDetail(state.detail);
})();
