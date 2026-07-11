/* Defensive Pedal — landing page interactions */
(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---------- Footer year ---------- */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Sticky nav background on scroll ---------- */
  const nav = $('#nav');
  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle('is-scrolled', window.scrollY > 20);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Mobile menu toggle ---------- */
  const toggle = $('.nav__toggle');
  const mobileMenu = $('#mobileMenu');
  if (toggle && mobileMenu) {
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      mobileMenu.hidden = !open;
    };
    toggle.addEventListener('click', () => {
      setOpen(!nav.classList.contains('is-open'));
    });
    // close menu when a link is tapped
    $$('a', mobileMenu).forEach((a) => {
      a.addEventListener('click', () => setOpen(false));
    });
    // close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) setOpen(false);
    });
  }

  /* ---------- Sticky mobile CTA visibility ---------- */
  // Show after the hero leaves view; hide once final-cta is in view (it has its own big CTA)
  const mobileCta = $('#mobileCta');
  const hero = $('.hero');
  const finalCta = $('.final-cta');
  if (mobileCta && hero && finalCta && 'IntersectionObserver' in window) {
    let heroVisible = true;
    let finalVisible = false;
    const update = () => {
      const show = !heroVisible && !finalVisible;
      mobileCta.hidden = !show;
    };
    new IntersectionObserver(
      ([entry]) => { heroVisible = entry.isIntersecting; update(); },
      { threshold: 0.1 }
    ).observe(hero);
    new IntersectionObserver(
      ([entry]) => { finalVisible = entry.isIntersecting; update(); },
      { threshold: 0.1 }
    ).observe(finalCta);
  }

  /* ---------- Reveal-on-scroll animation ---------- */
  if ('IntersectionObserver' in window) {
    const candidates = [
      ...$$('.section-head'),
      ...$$('.stat-card'),
      ...$$('.step'),
      ...$$('.feature'),
      ...$$('.testimonial'),
      ...$$('.endorsement-block'),
      ...$$('.logo-card'),
      ...$$('.faq__item'),
      ...$$('.team__copy'),
      ...$$('.team__mascot'),
      ...$$('.compare__table'),
      ...$$('.reveal__copy'),
      ...$$('.reveal__viz'),
      ...$$('.final-cta__inner'),
    ];
    candidates.forEach((el, i) => {
      el.classList.add('reveal-on-scroll');
      // grouped stagger — siblings in the same row animate in sequence
      const parent = el.parentElement;
      const idx = parent ? Array.from(parent.children).indexOf(el) : i;
      el.style.transitionDelay = `${Math.min(idx, 5) * 70}ms`;
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    candidates.forEach((el) => io.observe(el));
  }

  /* ---------- Count-up animation for numbers ---------- */
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Decimal multipliers like "2.1x" / "2,1x" — one leading number, a decimal
  // separator, a single decimal digit, then a non-digit suffix.
  const DECIMAL_VALUE = /^(\d+)([.,])(\d)(\D*)$/;

  function countUp(el) {
    const original = (el.dataset.original || el.textContent).trim();
    el.dataset.original = original;

    if (reducedMotion) { el.textContent = original; return; }

    const decMatch = original.match(DECIMAL_VALUE);
    if (decMatch) {
      // Animate in tenths (e.g. 0,0x → 2,1x), keeping the original separator.
      const target = parseInt(decMatch[1], 10) * 10 + parseInt(decMatch[3], 10);
      const fmt = (n) => Math.floor(n / 10) + decMatch[2] + (n % 10) + decMatch[4];
      const start = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(0);
      function tickDecimal(now) {
        const p = Math.min(1, (now - start) / 1200);
        el.textContent = fmt(Math.round(ease(p) * target));
        if (p < 1) requestAnimationFrame(tickDecimal);
      }
      requestAnimationFrame(tickDecimal);
      return;
    }

    const numMatch = original.replace(/,/g, '').match(/\d+/);
    if (!numMatch) return;

    const target = parseInt(numMatch[0], 10);
    const hasComma = /,/.test(original);
    const cleaned = original.replace(/,/g, '');
    const prefix = cleaned.slice(0, numMatch.index);
    const suffix = cleaned.slice(numMatch.index + numMatch[0].length);

    const fmt = (n) => prefix + (hasComma ? n.toLocaleString('en-US') : String(n)) + suffix;
    const duration = target > 1000 ? 1600 : 1200;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    el.textContent = fmt(0);
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      el.textContent = fmt(Math.round(ease(p) * target));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const countables = [
    ...$$('.big-number__value'),
    ...$$('.team__stats strong'),
  ];

  if (!reducedMotion && 'IntersectionObserver' in window && countables.length) {
    // Snapshot originals, then reset to "0" while still off-screen
    countables.forEach((el) => {
      el.dataset.original = el.textContent.trim();
      const dec = el.dataset.original.match(DECIMAL_VALUE);
      if (dec) {
        el.textContent = '0' + dec[2] + '0' + dec[4];
        return;
      }
      const cleaned = el.dataset.original.replace(/,/g, '');
      const match = cleaned.match(/\d+/);
      if (match) {
        const prefix = cleaned.slice(0, match.index);
        const suffix = cleaned.slice(match.index + match[0].length);
        el.textContent = prefix + '0' + suffix;
      }
    });
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          countUp(entry.target);
          cio.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    countables.forEach((el) => cio.observe(el));
  }
  // If reduced-motion is on or IO is missing, leave the original HTML values in place.

  /* ---------- FAQ: only one open at a time ---------- */
  const faqItems = $$('.faq__item');
  faqItems.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (item.open) {
        faqItems.forEach((other) => {
          if (other !== item) other.open = false;
        });
      }
    });
  });

  /* ---------- Platform-aware store links (nav button + sticky mobile CTA) ---------- */
  // Hero and final CTA show both stores explicitly; single-slot CTAs point to
  // Google Play by default and switch to the App Store on iOS devices.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
  if (isIOS) {
    $$('a[data-ios-href]').forEach((link) => {
      link.href = link.dataset.iosHref;
      if (link.dataset.iosAriaLabel) link.setAttribute('aria-label', link.dataset.iosAriaLabel);
      const label = $('[data-ios-label]', link);
      if (label) label.textContent = label.dataset.iosLabel;
      const playIcon = $('.store-icon--play', link);
      const appleIcon = $('.store-icon--apple', link);
      if (playIcon) playIcon.style.display = 'none';
      if (appleIcon) appleIcon.style.display = '';
    });
  }

  /* ---------- Anchor offset for fixed nav ---------- */
  // CSS scroll-padding handles most cases, but ensure all hash links account for nav height.
  document.documentElement.style.scrollPaddingTop = '88px';

  /* ---------- Scroll progress bar ---------- */
  const progress = $('#scrollProgress');
  if (progress) {
    let ticking = false;
    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(1, scrollTop / docHeight) : 0;
      progress.style.transform = `scaleX(${pct})`;
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(updateProgress);
        ticking = true;
      }
    }, { passive: true });
    window.addEventListener('resize', updateProgress, { passive: true });
    updateProgress();
  }

  /* ---------- Pause idle animations when off-viewport (perf) ---------- */
  if (!reducedMotion && 'IntersectionObserver' in window) {
    const idleAnimated = [
      ...$$('.problem__mascot'),
      ...$$('.reveal__mascot'),
      ...$$('.team__mascot'),
      ...$$('.final-cta__mascot'),
      ...$$('.step__mascot'),
      ...$$('.feature__mascot'),
      ...$$('.hero__phone'),
      ...$$('.hero__bg'),
      ...$$('.hero__glow'),
    ];
    const pauseIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
      });
    }, { rootMargin: '50px 0px' });
    idleAnimated.forEach((el) => pauseIO.observe(el));
  }
})();
