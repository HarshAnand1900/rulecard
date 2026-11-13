/* Shared header, mobile menu and footer for the inner pages (enter, rules, launch). */
(function () {
  var cur = location.pathname.replace(/\/index\.html$/, '/');
  var links = [['/#how', 'How it works'], ['/rules/', 'Rules'], ['/launch/', 'Launch a coin'], ['/#proof', 'Proof'], ['/#faq', 'FAQ']];
  var nav = links.map(function (l) { return '<a href="' + l[0] + '"' + (cur === l[0] ? ' aria-current="page"' : '') + '>' + l[1] + '</a>'; }).join('');
  var sheet = links.map(function (l, i) { return '<a class="heading-4" href="' + l[0] + '" style="--n:' + i + '">' + l[1] + '</a>'; }).join('');
  var head = '<a class="skip body-5" href="#main">Skip to content</a>' +
    '<header class="nav" id="nav"><a class="logo title-3" href="/" aria-label="Rulecard home"><span class="mark" aria-hidden="true"><i class="ph-bold ph-cards"></i></span>Rulecard</a>' +
    '<nav class="nav-links body-5" aria-label="Main">' + nav + '</nav>' +
    '<div class="nav-end"><a class="btn button-sm" href="/enter/">Play</a><button class="toggle" id="toggle" aria-expanded="false" aria-controls="sheet" aria-label="Open menu"><span></span><span></span></button></div></header>' +
    '<div class="sheet" id="sheet" aria-hidden="true">' + sheet + '</div>';
  var foot = '<footer><div class="wrap foot"><div style="display:flex;flex-direction:column;gap:var(--s75)"><a class="logo title-3" href="/"><span class="mark" aria-hidden="true"><i class="ph-bold ph-cards"></i></span>Rulecard</a><p class="caption-2 muted" style="max-width:420px">Built for the NEAR hackathon. Testnet only, not financial advice.</p></div>' +
    '<ul class="body-5 muted"><li><a href="/enter/">Play</a></li><li><a href="/rules/">Rules</a></li><li><a href="/launch/">Launch a coin</a></li><li><a href="https://github.com/HarshAnand1900/rulecard">Source code</a></li><li><a href="/privacy.html">Privacy</a></li><li><a href="/terms.html">Terms</a></li></ul></div></footer>';
  document.body.insertAdjacentHTML('afterbegin', head);
  document.body.insertAdjacentHTML('beforeend', foot);
  var toggle = document.getElementById('toggle'), sheet = document.getElementById('sheet');
  function set(open) { sheet.classList.toggle('open', open); sheet.setAttribute('aria-hidden', !open); toggle.setAttribute('aria-expanded', open); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); document.body.style.overflow = open ? 'hidden' : ''; }
  toggle.addEventListener('click', function () { set(!sheet.classList.contains('open')); });
  sheet.addEventListener('click', function (e) { if (e.target.tagName === 'A') set(false); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  // reveal on scroll, once
  var rv = document.querySelectorAll('.rv');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { rv.forEach(function (e) { e.classList.add('in'); }); return; }
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.15 });
  rv.forEach(function (e) { io.observe(e); });
})();
