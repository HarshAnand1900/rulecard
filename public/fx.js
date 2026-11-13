/* Scroll and pointer polish shared by the landing, the inner pages and the app: progress line, header state on scroll,
   a soft spotlight that follows the pointer across glass surfaces, and staggered reveals for app panels. */
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var G = '.panel, .card, .stat, .coin-card, .way, .pc, .bc, .treemap, .chron-card, .door';
  var bar = document.createElement('div'); bar.id = 'fx-prog'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
  var hero = document.querySelector('.hero'), pars = [].slice.call(document.querySelectorAll('.sec-head, .hand, .raid-visual, .proof-grid'));
  // a line draws across the top of each landing section as it arrives
  if (!document.getElementById('root') && !reduce && 'IntersectionObserver' in window) {
    var lio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('on'); lio.unobserve(e.target); } }); }, { threshold: 0.5 });
    [].forEach.call(document.querySelectorAll('main > section'), function (sec, i) { if (i === 0) return; var l = document.createElement('i'); l.className = 'sline'; l.setAttribute('aria-hidden', 'true'); sec.insertBefore(l, sec.firstChild); lio.observe(l); });
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var h = document.documentElement.scrollHeight - innerHeight, y = scrollY;
      bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0) + ')';
      document.body.classList.toggle('scrolled', y > 8);
      if (hero && !reduce) { var hp = Math.max(0, Math.min(1, y / (hero.offsetHeight * 0.8))); hero.style.setProperty('--hp', hp.toFixed(3)); }
      if (!reduce) pars.forEach(function (el) { var r = el.getBoundingClientRect(); if (r.bottom < -200 || r.top > innerHeight + 200) return; el.style.translate = '0 ' + (((r.top + r.height / 2 - innerHeight / 2) * -0.07).toFixed(1)) + 'px'; });
    });
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  var px = 0, py = 0, pend = false;
  addEventListener('pointermove', function (e) {
    px = e.clientX; py = e.clientY; if (pend) return; pend = true;
    requestAnimationFrame(function () {
      pend = false;
      var el = document.elementFromPoint(px, py), g = el && el.closest && el.closest(G);
      if (!g) return;
      var r = g.getBoundingClientRect(); g.style.setProperty('--mx', (px - r.left) + 'px'); g.style.setProperty('--my', (py - r.top) + 'px');
    });
  }, { passive: true });

  // app panels rise in as they enter the screen, a little after their neighbours
  var root = document.getElementById('root');
  if (!root || reduce || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('fx-on');
  var SEL = '.panel, .card, .coin-card, .stat, .tm-block, .chron-card, .round, .tabs, .ritual-hero, .omen-banner, main > section > h1';
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('fx-in'); io.unobserve(e.target); } }); }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  function scan(n) {
    var list = n.matches && n.matches(SEL) ? [n] : []; if (n.querySelectorAll) list = list.concat([].slice.call(n.querySelectorAll(SEL)));
    list.forEach(function (el) {
      if (el.__fx) return; el.__fx = 1;
      var i = el.parentElement ? [].indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty('--fd', (Math.min(i, 7) * 70) + 'ms'); el.classList.add('fx-r'); io.observe(el);
    });
  }
  new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); }); }).observe(root, { childList: true, subtree: true });
  scan(root);
})();
