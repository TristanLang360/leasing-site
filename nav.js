// Header starts transparent over the page; gains a dark background once the
// visitor scrolls so the links stay legible over content.
(function () {
  function init() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var update = function () { nav.classList.toggle('is-scrolled', window.scrollY > 24); };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
