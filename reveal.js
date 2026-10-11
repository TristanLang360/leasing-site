// Scroll animations for the editorial pages.
//   [data-reveal]            fade + rise into view (once)
//   [data-reveal="fade"]     fade only
//   [data-reveal="ink"]      text darkens from light grey to ink
//   [data-stagger]           children reveal one after another
//   .split                   letters slide up from behind a mask
//   [data-parallax]          image drifts inside its frame while scrolling
// The html.js-reveal class (set inline in <head>) hides elements until revealed;
// without this script running, the page renders normally.
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__revealReady = true;

  function splitLetters(el) {
    // Runs after i18n has translated the page, so we split the final text.
    var words = el.textContent.trim().split(/\s+/);
    var n = 0;
    el.innerHTML = words.map(function (w) {
      var chars = Array.prototype.map.call(w, function (c) {
        return '<span class="ch" style="transition-delay:' + (n++ * 28) + 'ms">' + c + '</span>';
      }).join('');
      return '<span class="split-wrap">' + chars + '</span>';
    }).join(' ');
    el.setAttribute('aria-label', words.join(' '));
  }

  function init() {
    document.querySelectorAll('.split').forEach(splitLetters);
    document.querySelectorAll('[data-stagger]').forEach(function (group) {
      var step = Number(group.getAttribute('data-stagger')) || 120;
      Array.prototype.forEach.call(group.children, function (child, i) {
        if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', '');
        child.style.transitionDelay = (i * step) + 'ms';
      });
    });

    var targets = document.querySelectorAll('[data-reveal], .split, .home-hero');
    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
      targets.forEach(function (el) { io.observe(el); });
    }

    // Parallax: the image moves at a fraction of the scroll speed inside its frame.
    var px = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
    if (px.length && !reduce) {
      var ticking = false;
      var update = function () {
        ticking = false;
        var vh = window.innerHeight;
        px.forEach(function (img) {
          var frame = img.parentElement.getBoundingClientRect();
          if (frame.bottom < 0 || frame.top > vh) return;
          var progress = (vh - frame.top) / (vh + frame.height); // 0 → 1 as it crosses the screen
          var range = Number(img.getAttribute('data-parallax')) || 10;   // % of frame height
          img.style.transform = 'translate3d(0,' + ((0.5 - progress) * range * 2) + '%,0)';
        });
      };
      var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      update();
    }

    // Carousel dots (scroll-snap track)
    document.querySelectorAll('[data-carousel]').forEach(function (track) {
      var dots = document.querySelector(track.getAttribute('data-carousel'));
      if (!dots) return;
      var items = track.children;
      dots.innerHTML = Array.prototype.map.call(items, function (_, i) {
        return '<button type="button" aria-label="' + (i + 1) + '"' + (i === 0 ? ' class="on"' : '') + '></button>';
      }).join('');
      Array.prototype.forEach.call(dots.children, function (b, i) {
        b.addEventListener('click', function () { track.scrollTo({ left: items[i].offsetLeft - track.offsetLeft, behavior: 'smooth' }); });
      });
      track.addEventListener('scroll', function () {
        var w = items[0].getBoundingClientRect().width;
        var idx = Math.round(track.scrollLeft / (w + 32));
        Array.prototype.forEach.call(dots.children, function (b, i) { b.classList.toggle('on', i === idx); });
      }, { passive: true });
    });
  }

  // Wait for DOMContentLoaded even though this script is deferred: the i18n
  // script translates the page on DOMContentLoaded, and the letter-split must
  // run on the translated text (deferred scripts execute just before it fires).
  if (document.readyState === 'complete') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
