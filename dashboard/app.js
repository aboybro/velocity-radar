// Velocity Radar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a velocity-tier filter, a per-protocol detail
// drawer with the model's own arithmetic and the protocol's farm plan. No network: every
// byte it shows ships with data.js. The page recomputes a row's implied value from the
// snapshot figures, so the page's code and board.json are visibly the same arithmetic.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var params = new URLSearchParams(window.location.search);
  var state = {
    q: params.get('q') || '',
    category: params.get('category') || 'all',
    chain: params.get('chain') || 'all',
    tier: params.get('tier') || 'ALL',
    watch: params.get('watch') === '1',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') === 'asc' ? 1 : -1,
    selected: params.get('detail') || null,
  };

  var fmtUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return fmtUsd.format(n);
  }
  function pct(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(digits === undefined ? 2 : digits) + '%';
  }
  function age(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // The velocity model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries.
  function impliedOf(row, model) {
    var g = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var momentum = 1 + (g / 100) * model.momentum_weight;
    var a = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var runway = model.runway_floor + (Math.min(Math.max(a, 0), model.runway_days) / model.runway_days) * model.runway_range;
    var surge = g >= model.surge_threshold ? model.surge_multiplier : g <= model.fade_threshold ? model.fade_multiplier : 1;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * momentum * runway * surge));
  }
  function tierOf(g) {
    if (g >= 25) return 'SURGE';
    if (g >= 10) return 'HOT';
    if (g > -10) return 'STEADY';
    if (g > -25) return 'COOLING';
    return 'FADING';
  }

  var watchSet = {};
  // Watchlist membership comes from data.js, so the page and board.json agree.
  var watchlist = DATA.watchlist_slugs || [];
  watchlist.forEach(function (s) { watchSet[s] = true; });

  function filtered() {
    var rows = DATA.rows.filter(function (r) {
      if (state.watch && !watchSet[r.slug]) return false;
      if (state.tier !== 'ALL' && r.tier !== state.tier) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'velocity') d = a.velocity_pct_per_day - b.velocity_pct_per_day;
      else if (key === 'growth') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (key === 'age') d = (a.age_days || 0) - (b.age_days || 0);
      if (d === 0) d = a.slug < b.slug ? -1 : 1;
      return d * state.dir;
    });
    return rows;
  }

  function rowHtml(r, maxImplied) {
    var cls = (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg');
    var w = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
    return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
      '<td class="num">' + r.rank + '</td>' +
      '<td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + '</span></td>' +
      '<td><span class="badge ' + r.tier + '">' + r.tier + '</span>' + (watchSet[r.slug] ? '<span class="badge WATCH">WATCHLIST</span>' : '<span class="badge EARLY">EARLY</span>') + '</td>' +
      '<td class="num">' + usd(r.tvl_usd) + '</td>' +
      '<td class="num ' + cls + '">' + pct(r.change_7d) + '</td>' +
      '<td class="num ' + cls + '">' + pct(r.velocity_pct_per_day, 2) + '/day</td>' +
      '<td class="num">' + age(r.age_days) + '</td>' +
      '<td class="num"><b>' + usd(r.implied_value_usd) + '</b><div class="bar"><i style="width:' + w + '%"></i></div></td>' +
      '</tr>';
  }

  function detailHtml(r) {
    var m = DATA.model;
    var g = Math.min(m.growth_cap, Math.max(m.growth_floor, r.change_7d === null ? 0 : r.change_7d));
    var recomputed = impliedOf(r, m);
    var steps = r.farm_steps.map(function (s, i) {
      var parts = s.split(' Cost: ');
      var cost = '';
      var time = '';
      var text = parts[0];
      if (parts[1]) {
        var t = parts[1].split(' Time: ');
        cost = t[0] || '';
        time = (t[1] || '').replace(/\.$/, '');
      }
      return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(text) + '<br><span class="cost">Cost: ' + esc(cost) + ' · Time: ' + esc(time) + '</span></li>';
    }).join('');
    return '<div class="drawer" role="dialog" aria-label="Protocol detail">' +
      '<button class="close" id="close-detail">Close ✕</button>' +
      '<h2>Detail — rank #' + r.rank + '</h2>' +
      '<h3>' + esc(r.name) + '</h3>' +
      '<p class="small dim">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') + ' · listed ' + esc(r.listed_at || 'unknown') + '</p>' +
      '<p><span class="badge ' + r.tier + '">' + r.tier + '</span>' + (watchSet[r.slug] ? '<span class="badge WATCH">WATCHLIST</span>' : '<span class="badge EARLY">EARLY</span>') + '</p>' +
      '<p>TVL <b class="mono">' + usd(r.tvl_usd) + '</b> · 7d <b class="mono">' + pct(r.change_7d) + '</b> · velocity <b class="mono">' + pct(r.velocity_pct_per_day, 2) + '/day</b> · age <b class="mono">' + age(r.age_days) + '</b></p>' +
      '<p>Implied value <b class="mono" style="font-size:19px;color:var(--green)">' + usd(r.implied_value_usd) + '</b></p>' +
      '<div class="math">implied = TVL × ' + m.base_multiple + ' × momentum × runway × surge\n' +
      '        = ' + usd(r.tvl_usd) + ' × ' + m.base_multiple + ' × ' + r.momentum_multiplier + ' × ' + r.runway_multiplier + ' × ' + r.surge_multiplier + '\n' +
      '        = ' + usd(recomputed) + '  [= board.json ' + (recomputed === r.implied_value_usd ? '✓' : '✗ differs') + ']\n' +
      'growth clamped: ' + pct(r.change_7d) + ' → ' + pct(g) + ' · tier ' + r.tier + ' (' + tierOf(g) + ')' + '</div>' +
      '<h2>How to farm it</h2><ol class="farm">' + steps + '</ol>' +
      '<p class="risk"><b>Risk note:</b> ' + esc(r.name) + ' records no token — that is DefiLlama\u2019s record, not proof it has none, and a protocol may never issue one. Never pay to claim, never connect a wallet holding funds you cannot lose, and treat the implied value as this radar\u2019s own claim, not a price.</p>' +
      '</div>';
  }

  function render() {
    var rows = filtered();
    var maxImplied = DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1;
    var cats = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      cats[r.category || 'Uncategorised'] = true;
      r.chains.forEach(function (c) { chains[c] = true; });
    });
    var catOpts = ['<option value="all">All categories</option>'].concat(Object.keys(cats).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');
    var chainOpts = ['<option value="all">All chains</option>'].concat(Object.keys(chains).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');
    var tiers = ['ALL', 'SURGE', 'HOT', 'STEADY', 'COOLING', 'FADING'];
    var chips = tiers.map(function (t) {
      var n = t === 'ALL' ? DATA.rows.length : (DATA.tier_counts[t] || 0);
      return '<button class="chip' + (state.tier === t ? ' on' : '') + '" data-tier="' + t + '">' + t + ' · ' + n + '</button>';
    }).join('');
    var fastest = DATA.rows.slice().sort(function (a, b) { return b.velocity_pct_per_day - a.velocity_pct_per_day; }).slice(0, 5);
    var surge = fastest.map(function (r) {
      return '<div class="surge-card" data-slug="' + esc(r.slug) + '"><div class="v">' + pct(r.velocity_pct_per_day, 2) + '/day</div><div class="n">' + esc(r.name) + '</div><div class="small dim">#' + r.rank + ' · ' + usd(r.implied_value_usd) + ' implied · 7d ' + pct(r.change_7d) + '</div></div>';
    }).join('');
    var sortLabel = { implied: 'Implied value', tvl: 'TVL', velocity: 'Velocity', growth: '7d growth', age: 'Age' }[state.sort];
    var sel = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    var live = DATA.live.map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b><br><span class="small dim">' + esc(p.category || 'Uncategorised') + '</span></td><td class="num">' + usd(p.tvl_usd) + '</td><td class="num">' + usd(p.mcap_usd) + '</td><td class="num ' + (p.change_7d !== null && p.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(p.change_7d) + '</td></tr>';
    }).join('');

    app.innerHTML =
      '<div class="wrap">' +
      '<header class="hero"><div><h1><span class="radar-dot">◉</span> Velocity Radar</h1>' +
      '<p class="sub">Pre-token protocols ranked by <b>launch velocity</b> — how fast their TVL is moving right now — not by what their category is worth. A protocol surging +25% in a week prices higher than a bigger one standing still. Data: sealed DefiLlama snapshot, ' + esc(DATA.as_of) + '.</p></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + DATA.board_size + '</b><span>protocols ranked</span></div>' +
      '<div class="stat"><b>' + DATA.watchlist_size + '</b><span>watchlist covered</span></div>' +
      '<div class="stat"><b>' + (DATA.tier_counts.SURGE || 0) + '</b><span>surging now</span></div>' +
      '<div class="stat"><b>' + usd(DATA.rows[0] ? DATA.rows[0].implied_value_usd : 0) + '</b><span>top implied value</span></div>' +
      '</div></header>' +
      '<section><h2>⚡ Fastest movers — top 5 by velocity (TVL % per day)</h2><div class="surge-strip">' + surge + '</div></section>' +
      '<section><div class="filters">' +
      '<input type="search" id="f-q" placeholder="Search name or slug…" value="' + esc(state.q) + '">' +
      '<select id="f-cat">' + catOpts + '</select>' +
      '<select id="f-chain">' + chainOpts + '</select>' +
      '<label><input type="checkbox" id="f-watch"' + (state.watch ? ' checked' : '') + '> Watchlist only</label>' +
      '<select id="f-sort">' + ['implied', 'tvl', 'velocity', 'growth', 'age'].map(function (k) { return '<option value="' + k + '"' + (state.sort === k ? ' selected' : '') + '>Sort: ' + ({ implied: 'Implied value', tvl: 'TVL', velocity: 'Velocity', growth: '7d growth', age: 'Age' })[k] + (state.dir === -1 ? ' ↓' : ' ↑') + '</option>'; }).join('') + '</select>' +
      '</div><div style="margin-top:8px">' + chips + '</div>' +
      '<p class="count-line">Showing <b>' + rows.length + '</b> of ' + DATA.board_size + ' ranked protocols · sorted by ' + sortLabel + (state.dir === -1 ? ' (highest first)' : ' (lowest first)') + ' · click a row for its velocity maths and farm plan.</p>' +
      '<table class="board"><thead><tr><th class="num">#</th><th>Protocol</th><th>Tier</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Velocity</th><th class="num">Age</th><th class="num">Implied value</th></tr></thead>' +
      '<tbody>' + rows.map(function (r) { return rowHtml(r, maxImplied); }).join('') + '</tbody></table></section>' +
      '<section class="grid2"><div class="card"><h2>The velocity model (velocity-1)</h2>' +
      '<p><code>implied = TVL × 0.22 × momentum × runway × surge</code></p>' +
      '<p><code>momentum = 1 + clamp(7d, −50%, +100%) ÷ 100 × 1.5</code> — velocity is the dominant driver.</p>' +
      '<p><code>runway = 0.75 + min(age, 1460d) ÷ 1460 × 0.45</code> — longer with no token, more pent-up launch value.</p>' +
      '<p><code>surge = 1.15 at +25% or more, 0.85 at −25% or less, else 1.00</code></p>' +
      '<p class="small dim">No category anchor, no name is special-cased: the same function scores every row from the snapshot\u2019s own figures. Growth is clamped so one wild week cannot price a protocol. A protocol records no token — never that it has none.</p>' +
      '<div class="legend"><span><span class="badge SURGE">SURGE</span> ≥ +25%</span><span><span class="badge HOT">HOT</span> +10–25%</span><span><span class="badge STEADY">STEADY</span> ±10%</span><span><span class="badge COOLING">COOLING</span> −10–25%</span><span><span class="badge FADING">FADING</span> ≤ −25%</span></div>' +
      '</div><div class="card"><h2>Live tokens — already trading (market value, not a model)</h2>' +
      '<table class="live"><thead><tr><th>Token</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>' + live + '</tbody></table>' +
      '<p class="small dim">These protocols already have a token, so the board never ranks them: their market caps are shown so a reader can see what trading tokens are worth next to the radar\u2019s claims.</p></div></section>' +
      '<footer>Velocity Radar · model velocity-1 · snapshot ' + esc(DATA.as_of) + ' · ' + esc(DATA.source) + ' · Implied values are this radar\u2019s own claim, never a price and never a prediction that a token will be issued.</footer>' +
      '</div>' +
      (sel ? detailHtml(sel) : '');

    document.getElementById('f-q').addEventListener('input', function (e) { state.q = e.target.value; render(); var q = document.getElementById('f-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
    document.getElementById('f-cat').addEventListener('change', function (e) { state.category = e.target.value; render(); });
    document.getElementById('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
    document.getElementById('f-watch').addEventListener('change', function (e) { state.watch = e.target.checked; render(); });
    document.getElementById('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (c) {
      c.addEventListener('click', function () { state.tier = c.getAttribute('data-tier'); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-slug]'), function (el) {
      el.addEventListener('click', function () { state.selected = el.getAttribute('data-slug'); render(); });
    });
    var close = document.getElementById('close-detail');
    if (close) close.addEventListener('click', function () { state.selected = null; render(); });
    app.setAttribute('aria-busy', 'false');
    window.__shotReady = true;
  }

  render();
})();
