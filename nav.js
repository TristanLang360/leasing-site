// Header behaviour: shadow state once scrolled, and the mobile menu
// (the burger button opens the nav links as a full-screen panel).
(function () {
  function init() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var update = function () { nav.classList.toggle('is-scrolled', window.scrollY > 24); };
    update();
    window.addEventListener('scroll', update, { passive: true });

    var inner = nav.querySelector('.nav-inner');
    var burger = nav.querySelector('.nav-burger');
    if (!burger && inner) {
      burger = document.createElement('button');
      burger.type = 'button';
      burger.className = 'nav-burger';
      burger.setAttribute('aria-label', 'Menu');
      burger.setAttribute('aria-expanded', 'false');
      burger.innerHTML = '<span></span><span></span>';
      inner.appendChild(burger);
    }
    if (!burger) return;
    var setOpen = function (open) {
      nav.classList.toggle('open', open);
      document.body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    burger.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
    nav.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
