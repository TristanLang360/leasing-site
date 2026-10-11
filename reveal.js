// Scroll animations for the editorial pages.
//   [data-reveal]            fade + rise into view (once)
//   [data-reveal="fade"]     fade only
//   [data-reveal="ink"]      text darkens from light grey to ink
//   [data-stagger]           children reveal one after another
//   .split                   letters slide up from behind a mask (replays when
//                            scrolled back above it, like the reference site)
//   [data-parallax]          image drifts inside its frame while scrolling
// Plus, when the Lenis library is loaded: inertial smooth scrolling, so even a
// fast wheel flick glides and the animations play out slowly.
// The html.js-reveal class (set inline in <head>) hides elements until revealed;
// without this script running, the page renders normally.
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__revealReady = true;
  var lenis = null;

  function smoothScroll() {
    if (reduce || typeof window.Lenis !== 'function') return;
    lenis = new window.Lenis({ lerp: 0.08, wheelMultiplier: 1.2 });
    window.lenis = lenis;
    var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // In-page links glide too (offset for the sticky header).
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        var target = id.length > 1 && document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: -90, duration: 1.6 });
      });
    });
    // Pause while the mobile menu is open.
    new MutationObserver(function () {
      if (document.body.classList.contains('menu-open')) lenis.stop(); else lenis.start();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function splitLetters(el) {
    // Runs after i18n has translated the page, so we split the final text.
    var words = el.textContent.trim().split(/\s+/);
    var total = words.join('').length;
    var spread = 500; // ms across all letters, like the reference's stagger "amount"
    var n = 0;
    el.innerHTML = words.map(function (w) {
      var chars = Array.prototype.map.call(w, function (c) {
        return '<span class="ch" style="transition-delay:' + Math.round(n++ * spread / Math.max(total - 1, 1)) + 'ms">' + c + '</span>';
      }).join('');
      return '<span class="split-wrap">' + chars + '</span>';
    }).join(' ');
    el.setAttribute('aria-label', words.join(' '));
  }

  // Page-load intro (homepage): hero photo shrinks from full-screen into its
  // frame while the header slides down and the intro rises.
  function intro() {
    if (!root.classList.contains('intro-pending')) return;
    if (reduce) { root.classList.remove('intro-pending'); return; }
    var img = document.querySelector('.home-hero img');
    var go = function () { setTimeout(function () { root.classList.remove('intro-pending'); }, 450); };
    if (!img || img.complete) go();
    else { img.addEventListener('load', go, { once: true }); img.addEventListener('error', go, { once: true }); }
  }

  function init() {
    smoothScroll();
    intro();
    document.querySelectorAll('.split').forEach(splitLetters);
    document.querySelectorAll('[data-stagger]').forEach(function (group) {
      var step = Number(group.getAttribute('data-stagger')) || 300;
      Array.prototype.forEach.call(group.children, function (child, i) {
        if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', '');
        child.style.transitionDelay = (i * step) + 'ms';
      });
    });

    var targets = document.querySelectorAll('[data-reveal]');
    var splits = document.querySelectorAll('.split');
    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('in'); });
      splits.forEach(function (el) { el.classList.add('in'); });
    } else {
      // Cards/blocks: start when their top passes ~90% of the screen.
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
      targets.forEach(function (el) { io.observe(el); });
      // Big lettering: plays when it reaches 60% of the screen height and
      // resets once it drops back below the screen, so it replays.
      var sio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) e.target.classList.add('in');
          else if (e.boundingClientRect.top > 0) e.target.classList.remove('in');
        });
      }, { rootMargin: '0px 0px -40% 0px', threshold: 0 });
      splits.forEach(function (el) { sio.observe(el); });
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
