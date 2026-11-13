/* Hero scene: a glossy black booster pack that tears open and fans out five cards, on a loop. Real 3D slabs, decorative only. */
(function () {
  var spin = document.getElementById('sculpt-spin');
  if (!spin) return;
  var art = ['1-common-grin', '2-rare-laugh', '3-epic-wink', '4-mythic-starry', '5-wild-shades'];
  var tone = ['#FFB45A', '#FF9A3C', '#FFD08A', '#FF7A1A', '#FFC27A'];
  var html = '<div class="burst"></div>';
  // five cards sit inside the pack and rise out of it
  for (var i = 0; i < 5; i++) {
    html += '<div class="pcard" style="--i:' + i + ';--tone:' + tone[i] + '">' +
      '<i class="cf"><span class="sym" style="--m:url(/bg/jokers/' + art[i] + '.png)"></span><b>' + ['♠', '♦', '♣', '♥', '★'][i] + '</b></i>' +
      '<i class="ck"></i><i class="ce1"></i><i class="ce2"></i><i class="ce3"></i><i class="ce4"></i></div>';
  }
  // the pack: front, back, four sides, and the top flap that tears away
  html += '<div class="pack">' +
    '<i class="pf"><span class="crimp t"></span><span class="foil"></span><em class="pmark">RULECARD</em><em class="plabel">PACK · 5 CARDS</em><span class="crimp b"></span><span class="pshine"></span></i>' +
    '<i class="pb"></i><i class="ps l"></i><i class="ps r"></i><i class="ps t"></i><i class="ps u"></i>' +
    '<i class="pflap"><span class="crimp t"></span></i></div>';
  spin.innerHTML = html;
  var rig = spin.parentNode;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  addEventListener('pointermove', function (e) {
    var x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    rig.style.transform = 'rotateX(' + (-10 + y * -10) + 'deg) rotateZ(' + (x * 6) + 'deg)';
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
