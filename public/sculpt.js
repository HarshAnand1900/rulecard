/* A spiral of glossy cards built from real 3D slabs: it turns slowly and leans toward the pointer. Decorative only. */
(function () {
  var spin = document.getElementById('sculpt-spin');
  if (!spin) return;
  var N = 9, glyphs = ['♠', '♦', '♣', '♥'];
  for (var i = 0; i < N; i++) {
    var d = document.createElement('div');
    d.className = 'slab' + (i % 3 === 0 ? ' hot' : '');
    d.style.transform = 'translateY(' + ((i - (N - 1) / 2) * 30) + 'px) rotateY(' + (i * 42) + 'deg) translateZ(128px) rotateX(-6deg)';
    d.innerHTML = '<i class="f"><b>' + glyphs[i % 4] + '</b><u>' + glyphs[i % 4] + '</u></i><i class="k"></i><i class="e1"></i><i class="e2"></i><i class="e3"></i><i class="e4"></i>';
    spin.appendChild(d);
  }
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
