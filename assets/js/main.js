// Q-Leap runtime: replaces jQuery, Elementor, Slider Revolution and the Qwery theme scripts.
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Slider Revolution "hero3": each slide lasts data-hero-duration ms; its layers leave
  // 1000 ms before the end, then the next slide fades in over 1200 ms.
  function initHero(hero) {
    const slides = [...hero.querySelectorAll('.ql-hero__slide')];
    if (!slides.length) return;
    const slideDuration = Number(hero.dataset.heroDuration) || 9000;
    const layersOutBefore = 1000;
    let current = -1;
    let outTimer;
    let nextTimer;

    function show(index) {
      clearTimeout(outTimer);
      clearTimeout(nextTimer);
      const target = (index + slides.length) % slides.length;
      slides.forEach((slide, position) => {
        if (position === target) return;
        slide.classList.remove('is-active', 'is-in');
        if (position === current) {
          slide.classList.add('is-out');
          setTimeout(() => slide.classList.remove('is-out'), 1200);
        }
      });
      const slide = slides[target];
      slide.classList.remove('is-out', 'is-in');
      // Restart the background zoom from its first frame.
      const image = slide.querySelector('.ql-hero__background img');
      if (image) { image.style.animation = 'none'; void image.offsetWidth; image.style.animation = ''; }
      slide.classList.add('is-active');
      requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('is-in')));
      current = target;
      if (reducedMotion) return;
      outTimer = setTimeout(() => { slide.classList.remove('is-in'); slide.classList.add('is-out'); }, slideDuration - layersOutBefore);
      nextTimer = setTimeout(() => show(current + 1), slideDuration);
    }

    hero.querySelector('.ql-hero__button--next')?.addEventListener('click', () => show(current + 1));
    hero.querySelector('.ql-hero__button--previous')?.addEventListener('click', () => show(current - 1));
    show(0);
  }

  // ThemeREX menus stay hidden (visibility + max-height) until their script marks them "inited".
  // Sub-menus open on hover / focus, like superfish with the "none" animation set in the theme.
  function initMenus() {
    document.querySelectorAll('.sc_layouts_menu').forEach((menu) => menu.classList.add('inited'));
    document.querySelectorAll('.sc_layouts_menu_nav li.menu-item-has-children').forEach((item) => {
      const subMenu = item.querySelector(':scope > ul');
      if (!subMenu) return;
      let hideTimer;
      const open = () => { clearTimeout(hideTimer); item.classList.add('sfHover'); subMenu.style.display = 'block'; };
      const close = () => { hideTimer = setTimeout(() => { item.classList.remove('sfHover'); subMenu.style.display = ''; }, 300); };
      item.addEventListener('mouseenter', open);
      item.addEventListener('mouseleave', close);
      item.addEventListener('focusin', open);
      item.addEventListener('focusout', (event) => { if (!item.contains(event.relatedTarget)) close(); });
    });
  }

  // trx_addons "watch_scheme": an element takes the colour scheme of the last section
  // (in document order) that contains its centre, re-evaluated on scroll.
  function initSchemeWatchers() {
    const watchers = [...document.querySelectorAll('.watch_scheme')];
    if (!watchers.length) return;
    const schemeOf = (element) => [...element.classList].find((name) => name.startsWith('scheme_'));
    const update = () => {
      const sections = [...document.querySelectorAll('[class*="scheme_"]')].filter((section) => section.offsetParent !== null && !watchers.includes(section));
      watchers.forEach((watcher) => {
        const box = watcher.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        let scheme = '';
        sections.forEach((section) => {
          const area = section.getBoundingClientRect();
          if (area.left < x && area.right > x && area.top < y && area.bottom > y) scheme = schemeOf(section) || scheme;
        });
        const current = schemeOf(watcher);
        if (current === scheme) return;
        if (current) watcher.classList.remove(current);
        if (scheme) watcher.classList.add(scheme);
      });
    };
    let queued = false;
    window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  document.querySelectorAll('.ql-hero').forEach(initHero);
  initMenus();
  initSchemeWatchers();
})();
