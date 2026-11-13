/* "Active memecoins right now": reads the factory and each coin straight from NEAR testnet (view calls only, no wallet).
   If the chain can't be reached it shows labelled examples instead. */
(function () {
  var grid = document.getElementById('live-grid'), note = document.getElementById('live-note');
  if (!grid) return;
  var FACTORY = window.RC_FACTORY || 'demo2.harshtest1.testnet';
  var RPCS = ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'];

  function view(account, method, args) {
    var body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'optimistic', account_id: account, method_name: method, args_base64: btoa(JSON.stringify(args || {})) } });
    function go(i) {
      return fetch(RPCS[i], { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, signal: AbortSignal.timeout(8000) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j.error || !j.result || j.result.error) throw new Error('rpc'); return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result))); })
        .catch(function (e) { if (i + 1 < RPCS.length) return go(i + 1); throw e; });
    }
    return go(0);
  }
  var near = function (y) { return Number(BigInt(y) / 1000000000000000000n) / 1e6; };
  var tok = function (y) { return Number(BigInt(y) / 1000000000000000n) / 1e3; };
  var fmtN = function (n) { return n >= 1000 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2); };
  var fmtT = function (t) { return t >= 1e6 ? (t / 1e6).toFixed(2) + 'M' : t >= 1e3 ? (t / 1e3).toFixed(1) + 'k' : t.toFixed(0); };
  var tag = function (a) { return String(a).split('.')[0].toUpperCase(); };

  function spark(vals) {
    if (!vals || vals.length < 2) return '';
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || 1, w = 240, h = 54, pts = vals.map(function (v, i) { return (i / (vals.length - 1) * w).toFixed(1) + ',' + (h - 4 - (v - lo) / span * (h - 8)).toFixed(1); });
    var up = vals[vals.length - 1] >= vals[0];
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="g' + (spark.n = (spark.n || 0) + 1) + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FF7417" stop-opacity=".38"/><stop offset="1" stop-color="#FF7417" stop-opacity="0"/></linearGradient></defs>' +
      '<polygon points="0,' + h + ' ' + pts.join(' ') + ' ' + w + ',' + h + '" fill="url(#g' + spark.n + ')"/><polyline points="' + pts.join(' ') + '" fill="none" stroke="' + (up ? '#FFB45A' : '#FF8A5C') + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  function tile(c) {
    var el = document.createElement('a');
    el.className = 'lv' + (c.raid ? ' hot' : '');
    el.href = c.href || '/play/';
    var top = document.createElement('div'); top.className = 'lv-top';
    var av = document.createElement('span'); av.className = 'lv-av'; av.textContent = c.symbol.slice(0, 3); av.setAttribute('aria-hidden', 'true');
    var id = document.createElement('div'); id.className = 'lv-id';
    var s = document.createElement('b'); s.textContent = '$' + c.symbol; var n = document.createElement('small'); n.textContent = c.name; id.append(s, n);
    var st = document.createElement('span'); st.className = 'lv-st'; st.textContent = c.raid ? 'Raid live' : (c.status || 'At peace');
    top.append(av, id, st);
    var mc = document.createElement('div'); mc.className = 'lv-mc';
    var big = document.createElement('strong'); big.textContent = fmtN(c.mcap) + ' N'; var lab = document.createElement('small'); lab.textContent = 'market cap'; mc.append(big, lab);
    var sp = document.createElement('div'); sp.className = 'lv-spark'; sp.innerHTML = spark(c.series);
    var ft = document.createElement('div'); ft.className = 'lv-ft';
    [['Level', 'L' + c.level], ['Holders', String(c.holders)], ['Burned', fmtT(c.burned)]].forEach(function (p) { var d = document.createElement('span'); var k = document.createElement('small'); k.textContent = p[0]; var v = document.createElement('b'); v.textContent = p[1]; d.append(k, v); ft.append(d); });
    el.append(top, mc, sp, ft);
    if (c.raid) { var rd = document.createElement('div'); rd.className = 'lv-raid'; rd.textContent = c.raid; el.append(rd); }
    return el;
  }
  function paint(list, label) { grid.textContent = ''; list.forEach(function (c) { grid.append(tile(c)); }); grid.setAttribute('aria-busy', 'false'); if (note) note.textContent = label; }

  var SAMPLE = [
    { symbol: 'MOTH', name: 'Moth Lamp', mcap: 28.3, level: 2, holders: 16, burned: 14.7e6, raid: 'MOTH vs ZAP · round 2', series: [20, 21, 20.5, 23, 22, 25, 24, 27, 28.3] },
    { symbol: 'FROG', name: 'Frog Pond', mcap: 28.2, level: 2, holders: 22, burned: 9.2e6, status: 'At peace', series: [18, 19, 21, 20, 22, 24, 23, 26, 28.2] },
    { symbol: 'ZAP', name: 'Zap Cat', mcap: 25.9, level: 2, holders: 16, burned: 6.1e6, raid: 'ZAP vs MOTH · round 2', series: [22, 24, 23, 25, 24, 26, 25, 26.5, 25.9] }
  ];
  paint(SAMPLE, 'Examples while the chain loads.');

  function load() {
    view(FACTORY, 'list_coins', {}).then(function (coins) {
      return Promise.all(coins.map(function (e) {
        return Promise.all([view(e.account_id, 'get_coin', {}), view(e.account_id, 'get_raid', {}).catch(function () { return null; }), view(e.account_id, 'get_prices', {}).catch(function () { return []; })])
          .then(function (r) {
            var c = r[0], raid = r[1], pr = r[2] || [];
            return { symbol: c.symbol, name: c.name, mcap: near(c.mcap), level: c.level, holders: c.holders, burned: tok(c.burned), graduated: c.graduated, href: '/play/',
              raid: raid && raid.phase < 4 ? tag(raid.attacker) + ' vs ' + tag(raid.defender) + (raid.round ? ' · round ' + raid.round : '') : '',
              status: c.graduated ? 'Graduated' : 'At peace', series: pr.slice(-40).map(function (p) { return Number(BigInt(p.mcap) / 1000000000000000000n) / 1e6; }) };
          }).catch(function () { return null; });
      }));
    }).then(function (all) {
      var live = all.filter(function (x) { return x && !x.graduated; }).sort(function (a, b) { return b.mcap - a.mcap; }).slice(0, 3);
      if (!live.length) throw new Error('none');
      paint(live, 'Live from NEAR testnet, read straight from the coin contracts. Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.');
    }).catch(function () { paint(SAMPLE, 'Examples: the chain could not be reached just now.'); });
  }
  load();
  setInterval(function () { if (!document.hidden) load(); }, 60000);
})();
