/* Hero scene: a spiral of real deck cards, built from 3D slabs. It turns slowly and leans toward the pointer. Decorative only. */
(function () {
  var spin = document.getElementById('sculpt-spin');
  if (!spin) return;
  var TONE = { COMMON: '#E8D3B4', RARE: '#FFB45A', EPIC: '#FF8A3C', MYTHIC: '#FFD27A' };
  var deck = [
    { n: 'Rally', t: 'COMMON', e: 0, s: 'rally' }, { n: 'Prophecy', t: 'RARE', e: 20, s: 'prophecy' },
    { n: 'Inferno', t: 'EPIC', e: 50, s: 'inferno' }, { n: 'Ember', t: 'COMMON', e: 5, s: 'ember' },
    { n: 'Supernova', t: 'MYTHIC', e: 100, s: 'supernova' }, { n: 'Hedge', t: 'COMMON', e: 5, s: 'hedge' },
    { n: 'Harvest', t: 'EPIC', e: 50, s: 'harvest' }, { n: 'Black Hole', t: 'EPIC', e: 50, s: 'blackhole' }
  ];
  var N = deck.length;
  deck.forEach(function (c, i) {
    var d = document.createElement('div');
    d.className = 'slab' + (c.t === 'EPIC' || c.t === 'MYTHIC' ? ' hot' : '');
    d.style.setProperty('--tone', TONE[c.t]);
    d.style.transform = 'translateY(' + ((i - (N - 1) / 2) * 30) + 'px) rotateY(' + (i * 45) + 'deg) translateZ(142px) rotateX(-6deg)';
    d.innerHTML = '<i class="f real"><span class="rc-host" data-card="' + c.n.replace(/ /g, '') + '" data-scale="0.5583"></span></i>' +
      '<i class="k"></i><i class="e1"></i><i class="e2"></i><i class="e3"></i><i class="e4"></i>';
    spin.appendChild(d);
  });
  /* the real card designs are drawn by the landing card module: now if it is loaded, otherwise when it announces itself */
  var drawCards = function () { if (window.RCmount) window.RCmount(spin); };
  drawCards(); addEventListener('rc-cards-ready', drawCards);
  var rig = spin.parentNode;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  addEventListener('pointermove', function (e) {
    var x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    rig.style.transform = 'rotateX(' + (-14 + y * -10) + 'deg) rotateZ(' + (x * 8) + 'deg)';
  }, { passive: true });
})();

/* The floating play button appears once the hero is behind you and steps aside for the closing section. */
(function () {
  var fab = document.getElementById('fab'), hero = document.getElementById('top'), end = document.querySelector('.close');
  if (!fab || !hero || !end || !('IntersectionObserver' in window)) return;
  var heroSeen = true, endSeen = false;
  function set() {
    var on = !heroSeen && !endSeen;
    fab.classList.toggle('show', on); fab.tabIndex = on ? 0 : -1; fab.setAttribute('aria-hidden', on ? 'false' : 'true');
  }
  new IntersectionObserver(function (es) { heroSeen = es[0].isIntersecting; set(); }).observe(hero);
  new IntersectionObserver(function (es) { endSeen = es[0].isIntersecting; set(); }, { rootMargin: '0px 0px -10% 0px' }).observe(end);
})();

/* Each omen has its own colour (the same ones the app uses to tint the background while an omen is active). */
(function () {
  var C = { 'Full Moon': '#C9D6FF', 'Thunder': '#6C8CFF', 'Ghost Ember': '#FF7A3D', 'Treasure': '#FFC83D', 'Squall': '#35E0CC', 'Oracle': '#B57BFF', 'Iron Vault': '#9FB0C8', 'Windfall': '#5BE6A4', 'Gold Rush': '#FFD24A', 'Drought': '#E0A640', 'Low Tide': '#3FA7FF', 'Blood Moon': '#FF3B3B', 'Fog': '#B4BAC4' };
  document.querySelectorAll('.omen').forEach(function (o) {
    var t = o.querySelector('.title-2'), c = t && C[t.textContent.trim()];
    if (!c) return;
    o.style.setProperty('--tc', c);
    var i = o.querySelector('.i'); if (i) { i.style.color = c; i.style.filter = 'drop-shadow(0 0 10px ' + c + '99)'; }
  });
})();
