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
    // When WordPress marked no current item in a menu, trx_addons marks the items that link to the
    // current page (e.g. the language switcher on training pages). Superfish flags parent links.
    const here = location.href.split('#')[0];
    document.querySelectorAll('.sc_layouts_menu_nav').forEach((menu) => {
      const hasCurrent = menu.querySelector('.current-menu-item, .current-menu-parent, .current-menu-ancestor');
      menu.querySelectorAll('li > a[href]').forEach((link) => {
        if (!hasCurrent && link.href.split('#')[0] === here) link.parentElement.classList.add('current-menu-item');
        if (link.nextElementSibling?.matches('ul')) link.classList.add('sf-with-ul');
      });
    });
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

  // Run callback once, the first time the element enters the viewport (trx_addons_in_viewport).
  function whenVisible(element, callback) {
    if (!('IntersectionObserver' in window)) { callback(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); callback(); }
    });
    observer.observe(element);
  }

  // trx_addons skills counters. "odometer": digit n rolls n*10 + its final value times, the
  // rolls of one digit share (duration - 300) ms, and digit n waits n roll lengths before starting.
  // "counter": the number counts up by data-step every data-speed ms.
  function animateOdometerDigit(digit, index, finalValue, duration) {
    const ribbon = digit.querySelector('.sc_skills_digit_ribbon');
    const firstValue = digit.querySelector('.sc_skills_digit_value');
    if (!ribbon || !firstValue) return;
    const rounds = index * 10 + finalValue;
    const delay = Math.floor((duration - 300) / Math.max(1, rounds));
    let round = 0;
    let skipped = 0;
    const step = () => {
      if (round >= rounds) return;
      if (skipped++ < index) { setTimeout(step, delay); return; }
      round += 1;
      const current = ribbon.querySelector('.sc_skills_digit_value');
      const next = current.cloneNode(true);
      next.textContent = String(round % 10);
      current.after(next);
      const height = current.offsetHeight;
      const animation = ribbon.animate([{ top: '0px' }, { top: `-${height}px` }], { duration: delay, easing: 'linear' });
      animation.onfinish = () => { current.remove(); ribbon.style.top = '0px'; step(); };
    };
    step();
  }

  function initSkills() {
    document.querySelectorAll('.sc_skills_item').forEach((item) => {
      const total = item.querySelector('.sc_skills_total');
      if (!total) return;
      whenVisible(item, () => {
        item.classList.add('trx_addons_in_viewport', 'inited');
        const stop = parseFloat(total.dataset.stop);
        const start = parseFloat(total.dataset.start) || 0;
        const step = parseFloat(total.dataset.step) || 1;
        const speed = parseInt(total.dataset.speed, 10) || 15;
        const duration = parseInt(total.dataset.duration, 10) || Math.ceil((parseInt(total.dataset.max, 10) || stop) / step) * speed;
        if (reducedMotion) {
          if (total.dataset.style !== 'odometer') total.textContent = stop + (total.dataset.ed || '');
          else total.querySelectorAll('.sc_skills_digit').forEach((digit, index) => { const value = digit.querySelector('.sc_skills_digit_value'); if (value) value.textContent = String(stop).charAt(index); });
          return;
        }
        if (total.dataset.style === 'odometer') {
          const digits = String(stop);
          total.querySelectorAll('.sc_skills_digit').forEach((digit, index) => animateOdometerDigit(digit, index, Number(digits.charAt(index)) || 0, duration));
          return;
        }
        const decimals = Math.max(0, ...[start, stop].map((value) => (String(value).split('.')[1] || '').length));
        let value = start;
        const tick = () => {
          value = Math.min(stop, value + step);
          total.textContent = value.toFixed(decimals) + (total.dataset.ed || '');
          if (value < stop) setTimeout(tick, speed);
        };
        tick();
      });
    });
  }

  // trx_addons sliders: same Swiper (5.4.5) and the same options trx_addons_init_sliders passes.
  function slidesPerView(slider) {
    let perView = Number(slider.dataset.slidesPerView) || 1;
    try {
      const breakpoints = JSON.parse(slider.dataset.slidesPerViewBreakpoints || 'null');
      if (breakpoints) {
        for (const max of Object.keys(breakpoints)) { if (window.innerWidth <= Number(max)) { perView = breakpoints[max]; break; } }
      }
    } catch {}
    return perView;
  }

  function initSliders() {
    if (!window.Swiper) return;
    document.querySelectorAll('.slider_swiper:not(.inited)').forEach((slider, index) => {
      if (!slider.id) slider.id = `ql_swiper_${index}`;
      const outer = slider.parentElement.classList.contains('slider_swiper_outer') ? slider.parentElement : slider;
      if (outer !== slider && !outer.id) outer.id = `${slider.id}_outer`;
      slider.querySelectorAll('.swiper-slide').forEach((slide, number) => slide.setAttribute('data-slide-number', number));
      slider.style.display = 'block';
      slider.style.opacity = '0';
      slider.classList.add('inited');
      const data = slider.dataset;
      const direction = data.direction === 'vertical' ? 'vertical' : 'horizontal';
      const minWidth = data.slidesMinWidth !== undefined ? Number(data.slidesMinWidth) : 150;
      let perView = slidesPerView(slider);
      const width = slider.offsetWidth || slider.parentElement.offsetWidth;
      if (direction === 'horizontal' && width / perView < minWidth) perView = Math.max(1, Math.floor(width / minWidth));
      // trx_addons uses a random 5-10 s interval when the slider sets none.
      const interval = data.interval === undefined ? Math.round(5000 * (1 + Math.random())) : (parseInt(data.interval, 10) || 0);
      const pagination = slider.classList.contains('slider_pagination')
        ? outer.querySelector(':scope > .slider_pagination_wrap') || slider.querySelector(':scope > .slider_pagination_wrap')
        : null;
      const controls = slider.classList.contains('slider_controls');
      const control = (name) => slider.querySelector(`:scope > .slider_controls_wrap > .slider_${name}`) || slider.parentElement.querySelector(`:scope > .slider_controls_wrap > .slider_${name}`);
      const autoplay = slider.classList.contains('slider_noautoplay') || data.autoplay === '0' || reducedMotion ? false : { delay: interval, disableOnInteraction: true };
      // trx_addons_resize_sliders: under 1440 px the space between slides is capped at twice the
      // padding of the "extended" Elementor column gap (e.g. 60 px becomes 30 px on a tablet).
      const slidesSpace = () => {
        const space = Number(data.slidesSpace) || 0;
        if (window.innerWidth >= 1440) return space;
        const column = document.querySelector('.elementor-column-gap-extended > .elementor-row > .elementor-column > .elementor-element-populated, .elementor-column-gap-extended > .elementor-column > .elementor-element-populated');
        const gap = column ? parseInt(getComputedStyle(column).paddingLeft, 10) * 2 : 0;
        return gap >= 20 && space > gap ? gap : space;
      };
      const swiper = new window.Swiper(slider, {
        freeMode: Number(data.freeMode) > 0,
        direction,
        initialSlide: 0,
        speed: data.speed !== undefined ? Number(data.speed) : 600,
        loop: (data.loop === undefined || Number(data.loop) > 0) && data.slidesOverflow !== '1',
        loopedSlides: perView,
        slidesPerView: perView,
        spaceBetween: slidesSpace(),
        centeredSlides: data.slidesCentered === '1',
        grabCursor: true,
        autoHeight: false,
        preloadImages: true,
        updateOnImagesReady: true,
        effect: data.effect || 'slide',
        pagination: { el: pagination, clickable: Boolean(pagination), type: data.pagination || 'bullets' },
        navigation: { nextEl: controls ? control('next') : null, prevEl: controls ? control('prev') : null },
        autoplay,
      });
      slider.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' });
      window.addEventListener('resize', () => {
        const space = slidesSpace();
        if (swiper.params.spaceBetween !== space) { swiper.params.spaceBetween = space; swiper.update(); }
      });
    });
  }

  // Elementor entrance animations: an .elementor-invisible element with an "_animation" (widgets)
  // or "animation" (sections, columns) setting gets "animated <name>" when any part of it enters
  // the viewport, after its delay. Device-specific settings (_tablet / _mobile) win when set.
  function elementorDevice() {
    if (window.innerWidth <= 767) return 'mobile';
    if (window.innerWidth <= 1279) return 'tablet';
    return '';
  }

  function initEntranceAnimations() {
    const device = elementorDevice();
    document.querySelectorAll('.elementor-invisible[data-settings]').forEach((element) => {
      let settings = {};
      try { settings = JSON.parse(element.dataset.settings); } catch {}
      const pick = (key) => (device && settings[`${key}_${device}`]) || settings[key];
      const animation = pick('_animation') || pick('animation');
      if (!animation || animation === 'none' || reducedMotion) { element.classList.remove('elementor-invisible'); return; }
      const delay = Number(settings._animation_delay || settings.animation_delay || 0);
      whenVisible(element, () => setTimeout(() => {
        element.classList.remove('elementor-invisible');
        element.classList.add('animated', animation);
      }, delay));
    });
  }

  // jQuery slideDown / slideUp / fadeIn / fadeOut equivalents ("swing" easing, 400 ms default).
  const swing = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
  function slide(element, open, duration = 400) {
    if (open) {
      element.style.display = 'block';
      const height = element.scrollHeight;
      element.animate([{ height: '0px', overflow: 'hidden' }, { height: `${height}px`, overflow: 'hidden' }], { duration, easing: swing });
    } else {
      const height = element.offsetHeight;
      const animation = element.animate([{ height: `${height}px`, overflow: 'hidden' }, { height: '0px', overflow: 'hidden' }], { duration, easing: swing });
      animation.onfinish = () => { element.style.display = 'none'; };
    }
  }
  function fade(element, show, duration = 400) {
    if (show) element.style.display = 'block';
    // Like jQuery, to and from the element's own opacity (the search overlay is a 20 % veil).
    const opacity = getComputedStyle(element).opacity;
    const animation = element.animate([{ opacity: show ? 0 : opacity }, { opacity: show ? opacity : 0 }], { duration, easing: swing });
    if (!show) animation.onfinish = () => { element.style.display = 'none'; };
  }

  // Elementor Pro gallery, "justified" layout (E-Gallery 1.2.0 with the settings the Elementor Pro
  // handler passes): rows of images at the ideal row height, scaled to fill the width, positioned by
  // CSS variables the gallery stylesheet reads; images load when they come into view. Without it the
  // gallery has no height and its photos never show (join-us/, en/career/).
  function initGalleries() {
    // Elementor's active breakpoints on this site (mobile up to 767 px, tablet up to 1279 px).
    const device = () => (window.innerWidth < 767 ? 'mobile' : window.innerWidth < 1279 ? 'tablet' : 'desktop');
    document.querySelectorAll('.elementor-widget-gallery').forEach((widget) => {
      const container = widget.querySelector('.elementor-gallery__container');
      let settings = {};
      try { settings = JSON.parse(widget.dataset.settings || '{}'); } catch { return; }
      if (!container || settings.gallery_layout !== 'justified') return;
      // elementorFrontend.getDeviceSetting: mobile falls back to tablet, tablet to desktop.
      const setting = (name) => {
        const chain = { mobile: ['_mobile', '_tablet', ''], tablet: ['_tablet', ''], desktop: [''] }[device()];
        const found = chain.map((suffix) => settings[name + suffix]).find((value) => value && value.size !== '' && value.size !== undefined);
        return found ? Number(found.size) : 0;
      };
      const lazy = settings.lazyload === 'yes';
      const items = [...container.querySelectorAll('.e-gallery-item')];
      const images = items.map((item) => item.querySelector('.e-gallery-image'));
      const data = images.map((image) => {
        const width = Number(image.dataset.width), height = Number(image.dataset.height);
        return { thumbnail: image.dataset.thumbnail, width, height, ratio: width / height, loading: false };
      });
      container.classList.add('e-gallery-container', 'e-gallery-justified', 'e-gallery--ltr');
      if (lazy) container.classList.add('e-gallery--lazyload');
      else images.forEach((image, index) => { image.style.backgroundImage = `url("${data[index].thumbnail}")`; });

      const layout = () => {
        const width = container.clientWidth;
        const ideal = setting('ideal_row_height');
        const gap = setting('gap');
        container.style.setProperty('--hgap', `${gap}px`);
        container.style.setProperty('--vgap', `${gap}px`);
        container.style.setProperty('--animation-duration', '350ms');
        const rowHeights = [];
        let rowsCount = 0;
        const fit = (from, to, rowWidth) => {
          const gapCount = to - from - 1;
          let start = 0;
          for (let index = from; index < to; index += 1) {
            const image = data[index], item = items[index], share = image.computedWidth / rowWidth;
            item.style.setProperty('--item-width', share);
            item.style.setProperty('--gap-count', gapCount);
            item.style.setProperty('--item-height', `${(image.height / image.width) * 100}%`);
            item.style.setProperty('--item-start', start);
            item.style.setProperty('--item-row-index', index - from);
            start += share;
            if (index === from) {
              item.classList.add('e-gallery-first-row-item');
              rowHeights.push((share * (width - gapCount * gap)) / image.ratio);
            } else item.classList.remove('e-gallery-first-row-item');
          }
        };
        let rowStart = 0;
        rows: for (;;) {
          let rowWidth = 0;
          for (let index = rowStart; ; index += 1) {
            const image = data[index];
            const itemWidth = Math.min(Math.round(ideal * image.ratio), width);
            const next = rowWidth + itemWidth;
            if (next > width && width - rowWidth < next - width) {
              fit(rowStart, index, rowWidth);
              rowsCount += 1;
              rowStart = index;
              continue rows;
            }
            image.computedWidth = itemWidth;
            if (index === data.length - 1) {
              fit(rowStart, index + 1, next / width >= 0.7 ? next : width); // lastRow "normal"
              break rows;
            }
            rowWidth = next;
          }
        }
        const total = rowHeights.reduce((sum, height) => sum + height, 0) + rowsCount * gap;
        const percents = rowHeights.map((height) => (height / total) * 100);
        let row = -1, top = 0;
        items.forEach((item) => {
          if (item.style.getPropertyValue('--item-row-index') === '0' && ++row) top += percents[row - 1];
          item.style.setProperty('--item-top', `${top}%`);
          item.style.setProperty('--item-height', `${percents[row]}%`);
          item.style.setProperty('--row', row);
        });
        container.style.setProperty('--container-aspect-ratio', total / width);
      };
      const loadVisible = () => {
        items.forEach((item, index) => {
          const image = data[index], box = item.getBoundingClientRect();
          if (image.loading || box.top > window.innerHeight || box.bottom < 0) return;
          image.loading = true;
          const loader = new Image();
          loader.onload = () => { images[index].style.backgroundImage = `url("${image.thumbnail}")`; images[index].classList.add('e-gallery-image-loaded'); };
          loader.src = image.thumbnail;
        });
      };
      // E-Gallery runs (and reruns on resize) through a 300 ms debounce, then loads the visible images.
      let timer;
      const run = () => { clearTimeout(timer); timer = setTimeout(() => { layout(); if (lazy) setTimeout(loadVisible, 300); }, 300); };
      run();
      window.addEventListener('resize', run);
      if (lazy) {
        let scrollTimer;
        window.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(loadVisible, 16); }, { passive: true });
      }
    });
  }

  // Elementor "stretch section" (frontend handler StretchElement): a stretched section takes the
  // inner width of the kit's container (.page_wrap on this site, the window if absent) and is pulled
  // left by its offset inside it, so it spans the page even inside a padded content column (blog).
  function initStretchedSections() {
    const sections = [...document.querySelectorAll('.elementor-section.elementor-section-stretched')];
    if (!sections.length) return;
    const stretch = () => {
      const container = document.querySelector('.page_wrap');
      sections.forEach((section) => {
        section.style.width = '';
        section.style.left = '';
        const containerWidth = container ? container.clientWidth : document.documentElement.clientWidth;
        const elementOffset = section.getBoundingClientRect().left + window.scrollX;
        const containerOffset = container ? container.getBoundingClientRect().left + window.scrollX : 0;
        const offset = container && elementOffset > containerOffset ? elementOffset - containerOffset : elementOffset;
        section.style.width = `${containerWidth}px`;
        section.style.left = `${-offset}px`;
      });
    };
    stretch();
    window.addEventListener('resize', stretch);
  }

  // The Events Calendar views (calendar, home event list): the plugin's breakpoints.js adds
  // tribe-common--breakpoint-xsmall / -medium / -full to the view from its own width; the plugin's
  // CSS switches to the desktop layout (search bar, month grid without the mobile list) on them.
  function initEventsBreakpoints() {
    const views = [...document.querySelectorAll('[data-js="tribe-events-view"]')];
    if (!views.length) return;
    const breakpoints = [['tribe-common--breakpoint-xsmall', 500], ['tribe-common--breakpoint-medium', 768], ['tribe-common--breakpoint-full', 960]];
    const update = () => views.forEach((view) => {
      breakpoints.forEach(([className, minWidth]) => view.classList.toggle(className, view.offsetWidth >= minWidth));
    });
    update();
    window.addEventListener('resize', update);
  }

  // Qwery mobile menu (full-screen panel) and vertical menus: arrow toggles for sub-menus.
  function initMobileMenu() {
    const menu = document.querySelector('.menu_mobile');
    if (!menu) return;
    const overlay = menu.previousElementSibling?.classList.contains('menu_mobile_overlay') ? menu.previousElementSibling : null;
    let opener = null;
    const english = document.documentElement.lang.startsWith('en');
    const buttons = [...document.querySelectorAll('.sc_layouts_menu_mobile_button > a, .menu_mobile_button')];
    const expanded = (value) => buttons.forEach((button) => button.setAttribute('aria-expanded', String(value)));
    const open = (button) => {
      opener = button;
      expanded(true);
      menu.classList.add('opened');
      if (overlay) fade(overlay, true);
      document.body.classList.add('menu_mobile_opened');
      setTimeout(() => menu.querySelector('a')?.focus(), 100);
    };
    const close = (skipFocus) => {
      expanded(false);
      menu.classList.remove('opened');
      if (overlay) fade(overlay, false);
      document.body.classList.remove('menu_mobile_opened');
      if (!skipFocus) opener?.focus();
    };
    // The burger is an icon-only link and the close cross a focusable span whose text is "Close" in
    // both languages: screen readers get named buttons.
    buttons.forEach((button) => {
      if (!button.textContent.trim() && !button.getAttribute('aria-label')) button.setAttribute('aria-label', english ? 'Open the menu' : 'Ouvrir le menu');
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', (event) => { event.preventDefault(); open(button); });
    });
    overlay?.addEventListener('click', (event) => { event.preventDefault(); close(); });
    const closeButton = menu.querySelector('.menu_mobile_close');
    closeButton?.setAttribute('role', 'button');
    closeButton?.setAttribute('aria-label', english ? 'Close the menu' : 'Fermer le menu');
    closeButton?.addEventListener('click', (event) => { event.preventDefault(); close(); });
    closeButton?.addEventListener('keyup', (event) => { if (event.key === 'Enter' && menu.classList.contains('opened')) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && menu.classList.contains('opened')) close(); });

    document.querySelectorAll('.menu_mobile, .sc_layouts_menu_dir_vertical').forEach((container) => {
      container.querySelectorAll('.menu-item-has-children > a').forEach((link) => {
        if (!link.querySelector('.open_child_menu')) link.insertAdjacentHTML('beforeend', '<span class="open_child_menu"></span>');
      });
      container.addEventListener('click', (event) => {
        const link = event.target.closest('li a');
        if (!link || !container.contains(link)) return;
        const arrow = event.target.classList.contains('open_child_menu');
        const item = link.parentElement;
        if (item.classList.contains('menu-item-has-children') && (arrow || link.getAttribute('href') === '#')) {
          event.preventDefault();
          const subMenu = item.querySelector(':scope > ul');
          if (!subMenu) return;
          if (getComputedStyle(subMenu).display !== 'none') { slide(subMenu, false); item.classList.remove('opened'); return; }
          [...item.parentElement.children].filter((sibling) => sibling !== item).forEach((sibling) => {
            sibling.querySelectorAll('ul.sub-menu, ul.sc_layouts_submenu').forEach((other) => {
              if (getComputedStyle(other).display !== 'none') { slide(other, false); other.parentElement.classList.remove('opened'); }
            });
          });
          slide(subMenu, true);
          item.classList.add('opened');
          return;
        }
        if (container === menu && !arrow) close(true);
      });
    });
  }

  // Qwery "modern" header search (skin.js): the magnifier drops the search panel from the top of the
  // window and fades the overlay in; the close button, the overlay and Escape play the theme's
  // closing animation (body.search_out_anim, 800 ms) before the panel goes back up.
  function initHeaderSearch() {
    document.querySelectorAll('.search_modern .search_wrap:not(.inited)').forEach((panel) => {
      panel.classList.add('inited');
      const container = panel.parentElement;
      const opener = panel.previousElementSibling?.classList.contains('search_submit') ? panel.previousElementSibling : null;
      const overlay = panel.nextElementSibling?.classList.contains('search_overlay') ? panel.nextElementSibling : null;
      const field = panel.querySelector('.search_field');
      const closeButton = panel.querySelector('.search_close');
      if (!opener || !field) return;
      const english = document.documentElement.lang.startsWith('en');
      // The theme drew these as a bare span and an <a> without href: keyboard and screen readers get buttons.
      opener.setAttribute('role', 'button');
      opener.setAttribute('tabindex', '0');
      opener.setAttribute('aria-label', english ? 'Search' : 'Rechercher');
      opener.setAttribute('aria-expanded', 'false');
      closeButton?.setAttribute('role', 'button');
      closeButton?.setAttribute('tabindex', '0');
      closeButton?.setAttribute('aria-label', english ? 'Close search' : 'Fermer la recherche');
      let closing = false;

      const open = () => {
        container.classList.add('search_active');
        document.body.classList.add('search_active');
        if (panel.classList.contains('search_opened')) {
          if (field.value.trim()) panel.querySelector('form')?.requestSubmit();
          else close();
          return;
        }
        panel.classList.add('search_opened');
        opener.setAttribute('aria-expanded', 'true');
        document.body.classList.add('search_open_anim');
        if (overlay) fade(overlay, true);
        setTimeout(() => field.focus(), 500);
      };
      const close = () => {
        if (closing || !panel.classList.contains('search_opened')) return;
        closing = true;
        document.body.classList.add('search_out_anim');
        setTimeout(() => {
          panel.classList.remove('search_opened');
          opener.setAttribute('aria-expanded', 'false');
          document.body.classList.remove('search_open_anim', 'search_out_anim');
          if (overlay) fade(overlay, false);
        }, 800);
        setTimeout(() => {
          container.classList.remove('search_active');
          document.body.classList.remove('search_active');
          closing = false;
          opener.focus({ preventScroll: true });
        }, 1200);
      };

      opener.addEventListener('click', (event) => { event.preventDefault(); open(); });
      opener.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      });
      [closeButton, overlay].forEach((element) => element?.addEventListener('click', (event) => { event.preventDefault(); close(); }));
      closeButton?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); close(); }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel.classList.contains('search_opened')) { field.value = ''; close(); }
      });
    });
  }

  // ThemeREX side panels (sc_layouts_panel, e.g. the socials / contact panel behind the header's
  // "⋮" icon): a link to "#<panel id>" opens or closes the panel, like trx_addons; the cross inside
  // and Escape close it. Class names are written out in full so optimize.py keeps their CSS rules.
  function initLayoutPanels() {
    const openedOnSide = { left: 'sc_layouts_panel_opened_left', right: 'sc_layouts_panel_opened_right', top: 'sc_layouts_panel_opened_top', bottom: 'sc_layouts_panel_opened_bottom' };
    document.querySelectorAll('.sc_layouts_panel[id]:not(.inited)').forEach((panel) => {
      panel.classList.add('inited');
      const links = [...document.querySelectorAll(`a[href="#${CSS.escape(panel.id)}"]`)];
      if (!links.length) return;
      const bodyClasses = ['sc_layouts_panel_opened', openedOnSide[panel.dataset.panelPosition], panel.dataset.panelClass && `${panel.dataset.panelClass}_opened`].filter(Boolean);
      let opener = null;
      const open = (link) => {
        opener = link;
        panel.classList.add('sc_layouts_panel_opened');
        document.body.classList.add(...bodyClasses);
        links.forEach((each) => each.setAttribute('aria-expanded', 'true'));
        setTimeout(() => panel.querySelector('a[href], button')?.focus({ preventScroll: true }), 300);
      };
      const close = () => {
        panel.classList.remove('sc_layouts_panel_opened');
        document.body.classList.remove(...bodyClasses);
        links.forEach((each) => each.setAttribute('aria-expanded', 'false'));
        opener?.focus({ preventScroll: true });
      };
      links.forEach((link) => {
        link.classList.add('trx_addons_panel_link');
        link.setAttribute('aria-controls', panel.id);
        link.setAttribute('aria-expanded', 'false');
        if (!link.textContent.trim() && !link.getAttribute('aria-label')) {
          link.setAttribute('aria-label', document.documentElement.lang.startsWith('en') ? 'Social networks and contact' : 'Réseaux sociaux et contact');
        }
        link.addEventListener('click', (event) => {
          event.preventDefault();
          if (panel.classList.contains('sc_layouts_panel_opened')) close(); else open(link);
        });
      });
      panel.addEventListener('click', (event) => {
        if (event.target.closest('.sc_layouts_panel_close')) { event.preventDefault(); close(); }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel.classList.contains('sc_layouts_panel_opened')) close();
      });
    });
  }

  // Links the theme left without any text for screen readers and keyboards: card overlays that
  // repeat a named link of the same card (title, "Read more", phone number) leave the tab order;
  // logo widgets with no image are empty tab stops; a logo whose image is decorative gets a name.
  function initAccessibleNames() {
    const english = document.documentElement.lang.startsWith('en');
    const named = (element) => element.textContent.trim() || element.getAttribute('aria-label') || element.getAttribute('title')
      || [...element.querySelectorAll('img[alt]')].some((image) => image.alt.trim());
    const hide = (link) => { link.setAttribute('aria-hidden', 'true'); link.setAttribute('tabindex', '-1'); };
    document.querySelectorAll('a[href]').forEach((link) => {
      if (named(link)) return;
      const href = link.getAttribute('href');
      let container = link.parentElement;
      for (let level = 0; container && level < 4; level += 1, container = container.parentElement) {
        const twin = [...container.querySelectorAll('a[href]')].find((other) => other !== link && other.getAttribute('href') === href && named(other));
        if (twin) { hide(link); return; }
      }
      if (link.matches('.sc_layouts_logo')) {
        if (link.querySelector('img, svg')) link.setAttribute('aria-label', english ? 'Q-Leap, home page' : "Q-Leap, page d'accueil");
        else hide(link);
      }
    });
    document.querySelectorAll('svg.decor-svg').forEach((svg) => svg.setAttribute('aria-hidden', 'true'));

    // Ninja Forms hides its labels (label-hidden) and names fields with placeholders only; the
    // hidden label is empty or a lone "*", and aria-labelledby points to it, so the field has no
    // name. The placeholder becomes the name (required is already announced by aria-required).
    const hasWords = (text) => /\p{L}/u.test(text || '');
    document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select').forEach((field) => {
      if (field.getAttribute('aria-label') || !field.placeholder) return;
      const labelledBy = (field.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent).join(' ');
      const labels = [...(field.labels || [])].map((label) => label.textContent).join(' ');
      if (hasWords(labelledBy) || hasWords(labels) || hasWords(field.title)) return;
      field.removeAttribute('aria-labelledby');
      field.setAttribute('aria-label', field.placeholder);
    });
  }

  // Elementor accordion / toggle / tabs (frontend handler "base-tabs"): accordion opens its first
  // item at load and closes the previous one; toggle starts closed and items are independent;
  // both slide 400 ms and close an open item when its title is clicked again. Tabs switch instantly.
  function initElementorTabs() {
    const kinds = [
      { selector: '.elementor-accordion', autoExpand: true, hidePrevious: true, toggleSelf: true, animate: true },
      { selector: '.elementor-toggle', autoExpand: false, hidePrevious: false, toggleSelf: true, animate: true },
      { selector: '.elementor-tabs', autoExpand: true, hidePrevious: true, toggleSelf: false, animate: false },
    ];
    kinds.forEach((kind) => document.querySelectorAll(kind.selector).forEach((widget) => {
      const titles = [...widget.querySelectorAll('.elementor-tab-title')];
      const contentFor = (tab) => widget.querySelectorAll(`.elementor-tab-content[data-tab="${tab}"]`);
      const titlesFor = (tab) => titles.filter((title) => title.dataset.tab === tab);
      const setOpen = (tab, open, animate) => {
        titlesFor(tab).forEach((title) => { title.classList.toggle('elementor-active', open); title.setAttribute('aria-expanded', String(open)); title.setAttribute('aria-selected', String(open)); });
        contentFor(tab).forEach((content) => {
          content.classList.toggle('elementor-active', open);
          if (animate && kind.animate) slide(content, open);
          else content.style.display = open ? 'block' : 'none';
        });
      };
      const isOpen = (tab) => titlesFor(tab).some((title) => title.classList.contains('elementor-active'));
      const activate = (tab, animate = true) => {
        if (isOpen(tab)) { if (kind.toggleSelf) setOpen(tab, false, animate); return; }
        if (kind.hidePrevious) titles.forEach((title) => { if (title.dataset.tab !== tab && isOpen(title.dataset.tab)) setOpen(title.dataset.tab, false, animate); });
        setOpen(tab, true, animate);
      };
      titles.forEach((title) => {
        title.addEventListener('click', (event) => { event.preventDefault(); activate(title.dataset.tab); });
        title.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(title.dataset.tab); } });
      });
      if (kind.autoExpand && titles.length) activate(titles[0].dataset.tab, false);
    }));
  }

  // Training catalogue: Ajax Search Pro filters + Elementor posts grid, done in the browser.
  // A training matches when, for every filter group with ticked boxes, it has at least one of
  // them (OR inside a group, AND between groups) and its title contains every searched word
  // (2 characters minimum, accents ignored). 6 cards per page, Elementor's Previous / Next.
  function initTrainingCatalogue() {
    const grid = document.querySelector('.elementor-posts-container[data-cards-per-page]');
    if (!grid) return;
    const cards = [...grid.querySelectorAll('article.elementor-post')];
    const perPage = Number(grid.dataset.cardsPerPage) || 6;
    const settings = document.getElementById('ajaxsearchprobsettings1_1');
    const search = document.querySelector('.asp_m input.orig');
    const navigation = grid.parentElement.querySelector('.elementor-pagination');
    const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let page = 1;
    let timer;

    const selected = () => {
      const groups = {};
      settings?.querySelectorAll('fieldset[class*="asp_filter_cf_"]').forEach((fieldset) => {
        const name = (fieldset.className.match(/asp_filter_cf_([a-z]+)/) || [])[1];
        const values = [...fieldset.querySelectorAll('input[type=checkbox]:checked')].map((input) => input.value.replace(/&amp;/g, '&'));
        if (name && values.length) groups[name] = values;
      });
      return groups;
    };
    const matches = (card, groups, words) => {
      for (const [name, values] of Object.entries(groups)) {
        let own = [];
        try { own = JSON.parse(card.getAttribute(`data-filter-${name}`) || '[]'); } catch {}
        if (!values.some((value) => own.includes(value))) return false;
      }
      const title = fold(card.dataset.title || card.textContent);
      return words.every((word) => title.includes(word));
    };
    const renderNavigation = (pages) => {
      if (!navigation) return;
      navigation.hidden = pages <= 1;
      const previous = grid.dataset.labelPrevious || 'Précédent';
      const next = grid.dataset.labelNext || 'Suivant';
      navigation.innerHTML = `\n\t\t\t${page > 1 ? `<a class="page-numbers prev" href="#">${previous}</a>` : `<span class="page-numbers prev">${previous}</span>`}\n${page < pages ? `<a class="page-numbers next" href="#">${next}</a>` : `<span class="page-numbers next">${next}</span>`}\t\t`;
    };
    const apply = () => {
      const groups = selected();
      const words = fold(search?.value || '').split(/\s+/).filter((word) => word.length >= 2);
      const visible = cards.filter((card) => matches(card, groups, words));
      const pages = Math.max(1, Math.ceil(visible.length / perPage));
      page = Math.min(page, pages);
      cards.forEach((card) => { card.hidden = true; });
      visible.slice((page - 1) * perPage, page * perPage).forEach((card) => { card.hidden = false; });
      renderNavigation(pages);
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; apply(); }, 300); };

    settings?.querySelectorAll('.asp_option').forEach((option) => {
      const input = option.querySelector('input[type=checkbox]');
      if (!input) return;
      const toggle = () => { input.checked = !input.checked; option.setAttribute('aria-checked', String(input.checked)); schedule(); };
      option.addEventListener('click', (event) => { event.preventDefault(); toggle(); });
      option.addEventListener('keydown', (event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggle(); } });
    });
    search?.addEventListener('input', schedule);
    search?.closest('form')?.addEventListener('submit', (event) => { event.preventDefault(); page = 1; apply(); });
    navigation?.addEventListener('click', (event) => {
      const link = event.target.closest('a.page-numbers');
      if (!link) return;
      event.preventDefault();
      page += link.classList.contains('next') ? 1 : -1;
      apply();
      grid.scrollIntoView({ block: 'start' });
    });
    apply();
  }

  // trx_addons blogger "advanced pages" pagination (blog listings). The theme loaded each page with
  // Ajax; tools/blog/build.py writes every post in the list and this shows them a page at a time,
  // with the same navigation markup (First / Prev / numbers / Next / Last, "Page x of y").
  function initBlogPagination() {
    document.querySelectorAll('.sc_blogger_content[data-cards-per-page]').forEach((list) => {
      const navigation = list.parentElement.querySelector('nav[data-blog-pagination]');
      const items = [...list.children].filter((item) => item.matches('article'));
      const perPage = Number(list.dataset.cardsPerPage) || 6;
      const pages = Math.max(1, Math.ceil(items.length / perPage));
      const windowSize = 5;
      const link = (page, label, className = '', title = '') =>
        `<a href="#" class="page-numbers${className ? ` ${className}` : ''}" data-page="${page}"${title ? ` title="${title}"` : ''}>${label}</a>`;
      const show = (page) => {
        items.forEach((item, index) => { item.hidden = Math.floor(index / perPage) !== page - 1; });
        if (!navigation) return;
        const first = Math.max(1, Math.min(page - Math.floor(windowSize / 2), pages - windowSize + 1));
        const last = Math.min(pages, first + windowSize - 1);
        let links = page > 1 ? link(1, 'First', 'first', 'First page') + link(page - 1, 'Prev', 'prev', 'Previous page') : '';
        for (let number = first; number <= last; number += 1) {
          links += number === page ? `<span class="page-numbers current">${number}</span>` : link(number, number);
        }
        if (page < pages) links += link(page + 1, 'Next', 'next', 'Next page') + link(pages, 'Last', 'last', 'Last page');
        navigation.innerHTML = `\n\t\t\t<div class="nav-links">${links}</div><span class="page-numbers page-count">Page ${page} of ${pages}</span>`;
      };
      navigation?.addEventListener('click', (event) => {
        const target = event.target.closest('a.page-numbers[data-page]');
        if (!target) return;
        event.preventDefault();
        show(Number(target.dataset.page));
        list.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      show(1);
    });
  }

  // Elementor Pro posts widget (cards / classic skins): the container gets elementor-has-item-ratio
  // (images become absolutely positioned inside a fixed-ratio box) and each thumbnail whose image
  // is flatter than the box gets elementor-fit-height (the image fills the height instead).
  function initElementorPosts() {
    document.querySelectorAll('.elementor-posts-container.elementor-posts--skin-cards, .elementor-posts-container.elementor-posts--skin-classic').forEach((container) => {
      container.classList.add('elementor-has-item-ratio');
      const fit = () => container.querySelectorAll('.elementor-post__thumbnail').forEach((thumbnail) => {
        const image = thumbnail.querySelector('img');
        if (!image || !image.naturalWidth || !thumbnail.offsetWidth) return;
        thumbnail.classList.toggle('elementor-fit-height', image.naturalHeight / image.naturalWidth < thumbnail.offsetHeight / thumbnail.offsetWidth);
      });
      container.querySelectorAll('.elementor-post__thumbnail img').forEach((image) => { if (!image.complete) image.addEventListener('load', fit, { once: true }); });
      window.addEventListener('resize', fit);
      fit();
    });
  }

  // Popup Maker: settings come from each popup's data-popmake attribute. "click_open" triggers are
  // .popmake-<id>, links to #popmake-<id> and the popup's extra selectors. Fade in / out at the
  // popup's animation speed; "center" popups are centred in the window, "top" ones sit
  // position_top px from the top.
  function initPopups() {
    const popups = [...document.querySelectorAll('.pum[data-popmake]')];
    popups.forEach((popup) => {
      let settings;
      try { settings = JSON.parse(popup.dataset.popmake); } catch { return; }
      const container = popup.querySelector('.pum-container');
      const display = settings.meta?.display || {};
      const speed = reducedMotion ? 0 : Number(display.animation_speed) || 350;
      const position = () => {
        container.style.left = `${popup.clientWidth / 2}px`;
        if (/top/.test(display.location)) container.style.top = `${Number(display.position_top) || 0}px`;
        else if (/bottom/.test(display.location)) container.style.top = `${Math.max(0, popup.clientHeight - container.offsetHeight - (Number(display.position_bottom) || 0))}px`;
        else container.style.top = `${Math.max(0, (popup.clientHeight - container.offsetHeight) / 2)}px`;
      };
      const open = () => {
        document.documentElement.classList.add('pum-open', 'pum-open-overlay', 'pum-open-scrollable');
        popup.classList.add('pum-active');
        popup.style.display = 'block';
        Object.assign(container.style, { minWidth: display.responsive_min_width || '0%', maxWidth: display.responsive_max_width || '100%', display: 'block' });
        position();
        popup.animate([{ opacity: 0 }, { opacity: 1 }], { duration: speed, fill: 'forwards' });
        container.animate([{ opacity: 0 }, { opacity: 1 }], { duration: speed, fill: 'forwards' });
        setTimeout(() => (container.querySelector('input:not([type=hidden]), button, a[href]'))?.focus({ preventScroll: true }), speed);
      };
      const close = () => {
        const fadeOut = popup.animate([{ opacity: 1 }, { opacity: 0 }], { duration: speed, fill: 'forwards' });
        fadeOut.onfinish = () => {
          popup.style.display = 'none';
          popup.classList.remove('pum-active');
          if (!document.querySelector('.pum.pum-active')) document.documentElement.classList.remove('pum-open', 'pum-open-overlay', 'pum-open-scrollable');
        };
      };
      const selectors = [`.popmake-${settings.id}`, `a[href$="#popmake-${settings.id}"]`];
      (settings.triggers || []).filter((trigger) => trigger.type === 'click_open').forEach((trigger) => {
        String(trigger.settings?.extra_selectors || '').split(',').map((selector) => selector.trim()).filter(Boolean).forEach((selector) => selectors.push(selector));
      });
      document.addEventListener('click', (event) => {
        const trigger = selectors.map((selector) => { try { return event.target.closest(selector); } catch { return null; } }).find(Boolean);
        if (!trigger || popup.contains(trigger)) return;
        event.preventDefault();
        open();
      });
      popup.querySelectorAll('.pum-close, .popmake-close').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); close(); }));
      if (settings.meta?.close?.overlay_click) popup.addEventListener('click', (event) => { if (event.target === popup) close(); });
      if (settings.meta?.close?.esc_press) document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && popup.classList.contains('pum-active')) close(); });
      window.addEventListener('resize', () => { if (popup.classList.contains('pum-active')) position(); });
    });
  }

  // Training sessions (child theme custom-script.js): « S'inscrire » fills the registration form's
  // hidden fields with the session id, the training name and the start date.
  function initSessionRegistration() {
    document.querySelectorAll('.trainings_page_sessions .form-ninja-popup').forEach((button) => {
      button.addEventListener('click', () => {
        const values = { 'nf-field-16': button.dataset.postId, 'nf-field-19': button.dataset.nameSs, 'nf-field-76': button.dataset.startDate };
        for (const [name, value] of Object.entries(values)) {
          document.querySelectorAll(`input[name="${name}"]`).forEach((input) => { input.value = value ?? ''; input.dispatchEvent(new Event('change', { bubbles: true })); });
        }
      });
    });
  }

  // Site search (tools/search/build.py): the search forms open search/?s=… (en/search/ in
  // English), where the blog card list is filled with the pages whose title, description or text
  // contain every searched word. Runs before initBlogPagination, which pages the results.
  const siteRoot = new URL('../../', document.querySelector('script[src*="assets/js/main.js"]')?.src || location.href);
  function initSearch() {
    const english = document.documentElement.lang.startsWith('en');
    const searchPage = new URL(english ? 'en/search/' : 'search/', siteRoot);
    const query = new URLSearchParams(location.search).get('s');
    if (query !== null && !document.querySelector('[data-ql-search]')) {
      location.replace(`${searchPage.href}?s=${encodeURIComponent(query)}`);
      return Promise.resolve();
    }
    document.querySelectorAll('form[role="search"]').forEach((form) => {
      if (form.closest('.asp_m, .asp_w, .tribe-events-c-search')) return;
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = form.querySelector('input[name="s"]')?.value.trim() || '';
        location.href = `${searchPage.href}?s=${encodeURIComponent(value)}`;
      });
    });
    const list = document.querySelector('[data-ql-search]');
    if (!list) return Promise.resolve();
    document.querySelectorAll('form[role="search"] input[name="s"]').forEach((input) => { input.value = query || ''; });
    const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const words = fold(query || '').split(/\s+/).filter(Boolean);
    const escape = (text) => text.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
    const message = (text) => { list.innerHTML = `<p class="ql-search-message">${escape(text)}</p>`; };
    if (!words.length) { message(english ? 'Enter a word to search the site.' : 'Saisissez un mot pour chercher sur le site.'); return Promise.resolve(); }
    return fetch(new URL(`assets/search/${english ? 'en' : 'fr'}.json`, siteRoot))
      .then((response) => response.json())
      .then((pages) => {
        const scored = pages.map((page) => {
          const title = fold(page.t);
          const all = `${title} ${fold(page.d)} ${fold(page.x)}`;
          if (!words.every((word) => all.includes(word))) return null;
          return { page, score: words.filter((word) => title.includes(word)).length * 10 + words.filter((word) => fold(page.d).includes(word)).length };
        }).filter(Boolean).sort((a, b) => b.score - a.score);
        if (!scored.length) { message(english ? `No results for “${query}”.` : `Aucun résultat pour « ${query} ».`); return; }
        const more = english ? 'Read more' : 'Lire plus';
        list.innerHTML = scored.map(({ page }) => {
          const href = new URL(page.u, siteRoot).href;
          const excerpt = (page.d || page.x).slice(0, 220).replace(/\s\S*$/, '') + '…';
          const image = page.i ? `<div class="post_featured with_thumb hover_dots post_featured_bg" data-ratio="1:1"><span class="post_thumb post_thumb_bg bg_in" style="background-image: url(&quot;${escape(new URL(page.i, siteRoot).href)}&quot;);"></span><div class="mask"></div><a href="${escape(href)}" aria-hidden="true" class="icons"><span></span><span></span><span></span></a></div>` : '';
          return `<article class="post_item post_item_container post_layout_band post_format_standard post type-post${page.i ? ' has-post-thumbnail' : ''}">${image}<div class="post_content_wrap"><div class="post_header entry-header"><h4 class="post_title entry-title"><a href="${escape(href)}" rel="bookmark">${escape(page.t)}</a></h4></div><div class="post_content entry-content"><div class="post_content_inner">${escape(excerpt)}</div></div><div class="more-wrap"><a class="post-more-link" href="${escape(href)}"><span class="link-text">${more}</span><span class="more-link-icon"></span></a></div></div></article>`;
        }).join('');
      })
      .catch(() => message(english ? 'Search is unavailable for now.' : 'La recherche est indisponible pour le moment.'));
  }

  // WP Job Openings filters (join-us/, en/career/): WordPress filtered the listing through
  // admin-ajax; here the cards are filtered in place by the search words and the selected terms.
  function initJobFilters() {
    document.querySelectorAll('.awsm-job-wrap').forEach((wrap) => {
      const form = wrap.querySelector('.awsm-filter-wrap form');
      const items = [...wrap.querySelectorAll('.awsm-job-listing-item')];
      if (!form || !items.length) return;
      const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const search = form.querySelector('input[name="jq"]');
      const close = form.querySelector('.awsm-job-search-close-btn');
      const apply = () => {
        const words = fold(search?.value || '').split(/\s+/).filter(Boolean);
        const terms = [...form.querySelectorAll('select')].filter((select) => select.value && select.selectedIndex > 0)
          .map((select) => ({ name: select.name, term: fold(select.selectedOptions[0].textContent) }));
        items.forEach((item) => {
          const text = fold(item.textContent);
          const specs = [...item.querySelectorAll('.awsm-job-specification-term')].map((term) => fold(term.textContent));
          item.hidden = !(words.every((word) => text.includes(word)) && terms.every(({ term }) => specs.includes(term)));
        });
        close?.classList.toggle('awsm-job-hide', !search?.value);
      };
      form.addEventListener('submit', (event) => { event.preventDefault(); apply(); });
      form.querySelectorAll('select').forEach((select) => select.addEventListener('change', apply));
      search?.addEventListener('input', apply);
      close?.addEventListener('click', () => { search.value = ''; apply(); });
      wrap.querySelector('.awsm-filter-toggle')?.addEventListener('click', (event) => {
        event.preventDefault();
        const open = event.currentTarget.getAttribute('aria-pressed') !== 'true';
        event.currentTarget.setAttribute('aria-pressed', String(open));
        wrap.querySelector('.awsm-filter-items')?.classList.toggle('awsm-on', open);
      });
    });
  }

  // Forms (Ninja Forms registration, Contact Form 7, WP Job Openings applications): GitHub Pages
  // cannot receive them, our relay (tools/forms/relay: a Cloudflare Worker sending through Brevo)
  // mails them to the address WordPress used (digital@q-leap.eu for all three). Every form, CV
  // included, is sent in the background and shows the plugin's own success message. If the relay
  // fails or is slow (15 s, 60 s with a CV), the visitor gets a link that opens their mail app with
  // the filled-in request instead. (FormSubmit was used until 2026-11-05; it stayed down with HTTP
  // 522 for two days.)
  const FORM_RECIPIENT = 'digital@q-leap.eu';
  const FORM_ENDPOINT = 'https://qleap-forms.qleapdigital.workers.dev/';
  const FORM_TIMEOUT = 15000;
  const FORM_TIMEOUT_WITH_FILE = 60000;
  const FORM_MAX_FILE_BYTES = 4 * 1024 * 1024; // Brevo's limit per attachment, also checked by the relay
  // Mail subjects sorted in three families, always in French so the team's mailbox rules match them
  // whatever the page language: « Candidature : <poste> » (or « Candidature spontanée »),
  // « Inscription formation : <formation> – session du <date> » / « Demande formation : <formation> »,
  // « Contact : <sujet> ». The body repeats the family and the site language.
  const pageTitle = () => document.title.replace(/\s+[-–|]\s+Q-Leap\s*$/, '').trim();

  // Qwery skin.js decorations of Contact Form 7 forms: the send button sits in a span that draws its
  // paper-plane icon (span.submit-style-in), and every "style-line" field gets its grey underline
  // (span.line). Without them the contact forms lose the icon and the lines, and the button moves.
  function initContactFormStyles() {
    document.querySelectorAll('.wpcf7-submit').forEach((button) => {
      if (button.parentElement.classList.contains('wpcf7-submit-style')) return;
      const wrapper = document.createElement('span');
      wrapper.className = 'wpcf7-submit-style';
      button.before(wrapper);
      wrapper.append(button);
      button.insertAdjacentHTML('afterend', '<span class="submit-style-in"></span>');
      // Contact Form 7's own script puts its (hidden) spinner after "has-spinner" buttons; it takes room.
      if (button.classList.contains('has-spinner') && !wrapper.nextElementSibling?.classList.contains('wpcf7-spinner')) {
        wrapper.insertAdjacentHTML('afterend', '<span class="wpcf7-spinner"></span>');
      }
    });
    document.querySelectorAll('div.wpcf7 .style-line .wpcf7-form-control-wrap').forEach((field) => {
      if (!field.querySelector(':scope > .line')) field.insertAdjacentHTML('beforeend', '<span class="line"></span>');
    });
  }

  // WP Job Openings phone fields (intl-tel-input 29 in the plugin): country button (flag, arrow,
  // dial code) inside the field, a searchable country list (inline, above or below the field; a
  // full-screen popup up to 500 px wide), the selected country's example number as placeholder.
  // The default country renders at once; the list (assets/js/phone-countries.json: iso2, dial
  // code, name, example) loads on first opening. The form sends "+<dial code> <number>".
  function initPhoneFields() {
    const english = document.documentElement.lang.startsWith('en');
    const known = { lu: ['lu', '352', 'Luxembourg', '628 123 456'] };
    let countries = null;
    const loadCountries = () => countries || (countries = fetch(new URL('assets/js/phone-countries.json', siteRoot))
      .then((response) => response.json()).catch(() => Object.values(known)));
    const checkSvg = '<span class="iti__country-check" aria-hidden="true"><svg class="iti__country-check-svg" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l3 3 7-7"></path></svg></span>';
    document.querySelectorAll('.awsm-job-form-iti-wrapper').forEach((wrapper, index) => {
      const input = wrapper.querySelector('input[type="tel"]');
      if (!input) return;
      // The example placeholder must not become the field's label in the notification e-mail.
      input.dataset.qlLabel = wrapper.querySelector('label')?.textContent.replace('*', '').trim() || input.name;
      let country = known[(wrapper.dataset.defaultCountry || 'LU').toLowerCase()] || known.lu;
      const id = `iti-${index}`;
      const container = document.createElement('div');
      container.className = 'iti iti--input-container iti--has-country-selector iti--show-flags iti--inline-country-selector awsm-job-form-control';
      container.innerHTML = `<div class="iti__country-container"><button type="button" class="iti__selected-country" aria-expanded="false" aria-haspopup="dialog" aria-controls="${id}__country-selector"><div class="iti__selected-country-primary"><div class="iti__flag"></div><div class="iti__arrow" aria-hidden="true"></div></div><div class="iti__selected-dial-code"></div></button></div>`;
      input.before(container);
      container.append(input);
      input.classList.add('iti__tel-input');
      input.setAttribute('autocomplete', 'tel');
      input.setAttribute('inputmode', 'tel');
      const button = container.querySelector('.iti__selected-country');
      const countryContainer = container.querySelector('.iti__country-container');
      const show = () => {
        const [iso, dial, name, example] = country;
        button.querySelector('.iti__flag').className = `iti__flag iti__${iso}`;
        button.querySelector('.iti__selected-dial-code').textContent = `+${dial}`;
        button.title = name;
        button.setAttribute('aria-label', `${english ? 'Change country for phone number, currently selected' : 'Changer le pays du numéro, actuellement'} ${name} (+${dial})`);
        input.placeholder = example;
        input.dataset.qlDialCode = dial;
        input.style.paddingLeft = `${button.offsetWidth + 6}px`;
      };
      show();

      let selector = null, popup = null, highlighted = null, countryList = null;
      const close = (focusButton) => {
        if (!selector || selector.classList.contains('iti__hide')) return;
        selector.classList.add('iti__hide');
        button.setAttribute('aria-expanded', 'false');
        button.querySelector('.iti__arrow').classList.remove('iti__arrow--up');
        if (popup) { popup.remove(); popup = null; countryContainer.append(selector); }
        if (focusButton) button.focus();
      };
      const highlight = (item, scroll) => {
        highlighted?.classList.remove('iti__highlight');
        highlighted = item;
        if (!item) return;
        item.classList.add('iti__highlight');
        selector.querySelector('.iti__search-input').setAttribute('aria-activedescendant', item.id);
        if (scroll) item.scrollIntoView({ block: 'nearest' });
      };
      const choose = (item) => {
        country = countryList.find((entry) => entry[0] === item.dataset.iso2);
        selector.querySelectorAll('.iti__country').forEach((other) => {
          other.setAttribute('aria-selected', String(other === item));
          other.querySelector('.iti__country-check')?.remove();
        });
        item.insertAdjacentHTML('beforeend', checkSvg);
        close(false);
        show();
        input.focus();
      };
      const build = (list) => {
        selector = document.createElement('div');
        selector.id = `${id}__country-selector`;
        selector.className = 'iti__country-selector iti__hide';
        selector.setAttribute('role', 'dialog');
        selector.setAttribute('aria-modal', 'true');
        selector.innerHTML = `<div class="iti__search-input-wrapper"><span class="iti__search-icon" aria-hidden="true"><svg class="iti__search-icon-svg" width="14" height="14" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></span><input id="${id}__search-input" type="search" class="iti__search-input" role="combobox" aria-expanded="true" aria-controls="${id}__country-listbox" aria-autocomplete="list" autocomplete="off"></div><span class="iti__a11y-text"></span><div class="iti__no-results iti__hide" aria-hidden="true"></div><ul id="${id}__country-listbox" class="iti__country-list" role="listbox"></ul>`;
        const search = selector.querySelector('.iti__search-input');
        search.placeholder = english ? 'Search' : 'Rechercher';
        search.setAttribute('aria-label', search.placeholder);
        selector.querySelector('.iti__no-results').textContent = english ? 'No results found' : 'Aucun résultat';
        const listbox = selector.querySelector('.iti__country-list');
        listbox.setAttribute('aria-label', english ? 'List of countries' : 'Liste des pays');
        listbox.innerHTML = list.map(([iso, dial, name]) => `<li id="${id}__item-${iso}" class="iti__country" tabindex="-1" role="option" aria-selected="false" data-dial-code="${dial}" data-iso2="${iso}"><div class="iti__flag iti__${iso}"></div><span class="iti__country-name"></span></li>`).join('');
        [...listbox.children].forEach((item, position) => {
          item.querySelector('.iti__country-name').innerHTML = '<span class="iti__dial-code"></span>';
          item.querySelector('.iti__country-name').prepend(`${list[position][2]} `);
          item.querySelector('.iti__dial-code').textContent = `(+${list[position][1]})`;
        });
        const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const filter = () => {
          const query = fold(search.value.trim());
          let count = 0, first = null;
          [...listbox.children].forEach((item, position) => {
            const [iso, dial, name] = list[position];
            const words = fold(name).split(/[\s(),.-]+/);
            const match = !query || words.some((word) => word.startsWith(query)) || fold(name).startsWith(query)
              || iso === query || dial.startsWith(query.replace(/^\+/, ''));
            item.classList.toggle('iti__hide', !match);
            if (match) { count += 1; first = first || item; }
          });
          selector.querySelector('.iti__no-results').classList.toggle('iti__hide', count > 0);
          selector.querySelector('.iti__a11y-text').textContent = english ? `${count} results found` : `${count} résultats`;
          highlight(query ? first : listbox.querySelector('[aria-selected="true"]') || first, true);
        };
        search.addEventListener('input', filter);
        search.addEventListener('keydown', (event) => {
          const visible = [...listbox.children].filter((item) => !item.classList.contains('iti__hide'));
          const position = visible.indexOf(highlighted);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            highlight(visible[Math.max(0, Math.min(visible.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)))], true);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (highlighted) choose(highlighted);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            close(true);
          }
        });
        listbox.addEventListener('mouseover', (event) => { const item = event.target.closest('.iti__country'); if (item) highlight(item, false); });
        listbox.addEventListener('click', (event) => { const item = event.target.closest('.iti__country'); if (item) choose(item); });
        countryContainer.append(selector);
        const current = listbox.querySelector(`[data-iso2="${country[0]}"]`);
        current?.setAttribute('aria-selected', 'true');
        current?.insertAdjacentHTML('beforeend', checkSvg);
      };
      const open = async () => {
        if (!countryList) {
          countryList = await loadCountries();
          build(countryList);
        }
        const search = selector.querySelector('.iti__search-input');
        search.value = '';
        selector.removeAttribute('style');
        selector.classList.remove('iti--flexible-dropdown-width');
        if (window.innerWidth <= 500) {
          // Full-screen popup, detached at the end of the body like intl-tel-input on small screens.
          popup = document.createElement('div');
          popup.className = 'iti iti--detached-country-selector iti--fullscreen-popup awsm-job-form-control';
          selector.classList.add('iti--flexible-dropdown-width');
          popup.append(selector);
          document.body.append(popup);
        } else {
          selector.style.width = `${container.offsetWidth}px`;
        }
        selector.classList.remove('iti__hide');
        if (!popup) {
          // Opens downwards, or upwards when it does not fit below but fits above.
          const box = container.getBoundingClientRect();
          const height = selector.offsetHeight;
          if (box.bottom + height > window.innerHeight && box.top - height > 0) selector.style.bottom = `${container.offsetHeight}px`;
        }
        button.setAttribute('aria-expanded', 'true');
        button.querySelector('.iti__arrow').classList.add('iti__arrow--up');
        search.dispatchEvent(new Event('input'));
        search.focus();
      };
      button.addEventListener('click', () => (selector && !selector.classList.contains('iti__hide') ? close(true) : open()));
      document.addEventListener('click', (event) => {
        if (selector && !selector.contains(event.target) && !button.contains(event.target)) close(false);
      });
      window.addEventListener('resize', () => { input.style.paddingLeft = `${button.offsetWidth + 6}px`; });
    });
  }

  function initForms() {
    const english = document.documentElement.lang.startsWith('en');
    const t = (fr, en) => (english ? en : fr);
    const labelOf = (field) => field.dataset.qlLabel || field.placeholder || field.closest('label')?.textContent.trim()
      || document.querySelector(`label[for="${field.id}"]`)?.textContent.replace('*', '').trim() || field.name;
    const collect = (form, subject, kind) => {
      const data = new FormData();
      data.append('Type de demande', kind);
      data.append('Langue du site', english ? 'EN' : 'FR');
      form.querySelectorAll('input, textarea, select').forEach((field) => {
        if (!field.name || field.disabled || ['submit', 'button'].includes(field.type) || field.name.startsWith('_')) return;
        if (/recaptcha|nonce|^action$|^lang$|nf-field-hp|_wp_http_referer|^form_sub$/.test(field.name)) return;
        if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) return;
        if (field.type === 'file') { [...field.files].forEach((file) => data.append(labelOf(field), file)); return; }
        const value = field.value.trim();
        // Phone fields with a country selector: the number goes with its dial code (initPhoneFields).
        if (value) data.append(labelOf(field), field.dataset.qlDialCode && !value.startsWith('+') ? `+${field.dataset.qlDialCode} ${value}` : value);
      });
      data.append('Page', location.href);
      data.append('_subject', subject);
      // Replying to the notification e-mail answers the visitor.
      const email = form.querySelector('input[type="email"]')?.value.trim();
      if (email) data.append('_replyto', email);
      return data;
    };
    const missing = (form) => [...form.querySelectorAll('[required], [aria-required="true"]')]
      .filter((field) => (field.type === 'checkbox' ? !field.checked : field.type === 'file' ? !field.files.length : !field.value.trim()));
    const send = async (data) => {
      const timeout = [...data.values()].some((value) => value instanceof File) ? FORM_TIMEOUT_WITH_FILE : FORM_TIMEOUT;
      const response = await fetch(FORM_ENDPOINT,
        { method: 'POST', body: data, headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) throw new Error(result.error || response.status);
    };
    // The same request as an e-mail written by the visitor's mail app (nothing is lost if the service is down).
    const fallback = (data, reason = t("Le service d'envoi ne répond pas pour le moment.", 'The sending service is not responding right now.')) => {
      const lines = [...data].filter(([name, value]) => !name.startsWith('_') && !(value instanceof File)).map(([name, value]) => `${name} : ${value}`);
      const href = `mailto:${FORM_RECIPIENT}?subject=${encodeURIComponent(data.get('_subject') || 'Q-Leap')}&body=${encodeURIComponent(lines.join('\n'))}`;
      return `<p>${reason} `
        + `<a href="${href}">${t('Envoyez votre demande par e-mail', 'Send your request by e-mail')}</a> `
        + `${t('(le message est déjà rempli).', '(the message is already filled in).')}</p>`;
    };
    const honeypot = (form) => [...form.querySelectorAll('input[name="nf-field-hp"], textarea[name="_wpcf7_ak_hp_textarea"]')].some((field) => field.value);

    // Ninja Forms (training registration and requests): the placeholders name the fields.
    document.querySelectorAll('.nf-form-layout form').forEach((form) => {
      const hidden = { 15: t('Formation (id)', 'Training (id)'), 16: 'Session (id)', 76: t('Date de la session', 'Session date'), 19: t('Formation', 'Training') };
      form.querySelectorAll('input[type="hidden"]').forEach((input) => {
        const id = input.name.match(/^nf-field-(\d+)/)?.[1];
        if (hidden[id]) input.dataset.qlLabel = hidden[id];
      });
      form.querySelectorAll('.ninja-forms-field').forEach((field) => {
        const key = field.closest('[data-testid]')?.dataset.testid || '';
        if (/prenom/.test(key)) field.dataset.qlLabel = t('Prénom', 'First name');
        if (field.type === 'text' && field.defaultValue && /prenom/.test(key)) { field.placeholder = field.defaultValue; field.value = ''; }
      });
      const wrap = form.closest('.nf-form-wrap');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (honeypot(form)) return;
        const empty = missing(form);
        form.querySelectorAll('.nf-error-wrap').forEach((error) => { error.textContent = ''; });
        empty.forEach((field) => {
          const error = form.querySelector(`#nf-error-${field.id.replace('nf-field-', '')}`);
          if (error) error.textContent = t('Ce champ est obligatoire.', 'This is a required field.');
        });
        if (empty.length) { empty[0].focus(); return; }
        const button = form.querySelector('[type="submit"], .submit-wrap input');
        if (button) button.disabled = true;
        const session = form.querySelector('input[name^="nf-field-16"]')?.value;
        const training = form.querySelector('input[name^="nf-field-19"]')?.value
          || (/\/trainings\//.test(location.pathname) ? pageTitle() : '');
        const day = (form.querySelector('input[name^="nf-field-76"]')?.value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        let subject = `Demande formation : ${training || `non précisée (page « ${pageTitle()} »)`}`;
        let kind = 'Demande formation';
        if (session && training) {
          subject = `Inscription formation : ${training}${day ? ` – session du ${day[3]}/${day[2]}/${day[1]}` : ''}`;
          kind = 'Inscription à une session';
        }
        const data = collect(form, subject, kind);
        // Ninja Forms' stylesheet hides the message area (its script used to reveal it): show it here.
        const respond = (html) => {
          const message = wrap.querySelector('.nf-response-msg');
          message.innerHTML = html;
          message.style.display = 'block';
        };
        respond(`<p>${t('Envoi en cours…', 'Sending…')}</p>`);
        try {
          await send(data);
          respond(`<p>${t('Votre message a bien été envoyé.', 'Your message has been sent.')}</p>`);
          form.hidden = true;
        } catch {
          respond(fallback(data));
          if (button) button.disabled = false;
        }
      });
      form.querySelector('.submit-wrap input, input[type="button"]')?.addEventListener('click', (event) => { event.preventDefault(); form.requestSubmit(); });
    });

    // Contact Form 7 (contact page FR/EN).
    document.querySelectorAll('form.wpcf7-form').forEach((form) => {
      form.setAttribute('novalidate', '');
      form.querySelectorAll('textarea[name="your-message"]').forEach((field) => { field.dataset.qlLabel = 'Message'; });
      const output = form.querySelector('.wpcf7-response-output');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (honeypot(form)) return;
        form.querySelectorAll('.wpcf7-not-valid-tip').forEach((tip) => tip.remove());
        const empty = missing(form);
        const email = form.querySelector('input[type="email"]');
        if (email && email.value && !email.checkValidity()) empty.push(email);
        empty.forEach((field) => field.closest('.wpcf7-form-control-wrap')?.insertAdjacentHTML('beforeend',
          `<span class="wpcf7-not-valid-tip" aria-hidden="true">${field === email && email.value ? t("L'adresse e-mail n'est pas valide.", 'Please enter an email address.') : t('Veuillez renseigner ce champ.', 'Please fill out this field.')}</span>`));
        const status = (state, text) => {
          form.dataset.status = state;
          form.className = form.className.replace(/\b(init|invalid|sent|failed|submitting)\b/g, '').trim() + ` ${state}`;
          if (output) { output.textContent = text; output.removeAttribute('aria-hidden'); }
        };
        if (empty.length) { status('invalid', t('Un ou plusieurs champs contiennent une erreur. Veuillez vérifier et essayer à nouveau.', 'One or more fields have an error. Please check and try again.')); empty[0].focus(); return; }
        status('submitting', '');
        const data = collect(form, `Contact : ${form.querySelector('[name="subject"]')?.value.trim() || 'sans objet'}`, 'Contact général');
        try {
          await send(data);
          status('sent', t('Merci pour votre message. Il a été envoyé.', 'Thank you for your message. It was sent.'));
          form.reset();
        } catch {
          status('failed', '');
          if (output) output.innerHTML = fallback(data);
        }
      });
    });

    // WP Job Openings drag-and-drop upload (Dropzone in the plugin): the zone keeps its look and
    // states (dz-clickable, dz-drag-hover, dz-started, dz-preview, invalid border); a hidden file
    // input behind it holds the file the form sends. Click, Enter/Space or a drop fill it.
    document.querySelectorAll('form.awsm-application-form').forEach((form) => {
      form.querySelectorAll('.awsm-form-drag-and-drop-file-control').forEach((zone) => {
        const hidden = zone.parentElement.querySelector('input[type="hidden"][name^="awsm_file"]');
        const label = zone.parentElement.querySelector('label')?.textContent.replace('*', '').trim() || 'CV';
        const accepted = (zone.dataset.accept || '.pdf').split(',').map((extension) => extension.trim().toLowerCase());
        const maxFiles = Number(zone.dataset.maxFiles) || 1;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accepted.join(',');
        input.name = hidden?.name || 'awsm_file';
        input.id = input.name;
        input.className = 'awsm-job-form-field awsm-job-form-control';
        input.hidden = true;
        // Not "required": the browser cannot point at a hidden field; missing() checks aria-required.
        if (zone.dataset.required === '1') input.setAttribute('aria-required', 'true');
        input.dataset.qlLabel = label;
        input.qlZone = zone;
        hidden?.remove();
        zone.before(input);
        zone.classList.add('dz-clickable');
        zone.tabIndex = 0;
        zone.setAttribute('role', 'button');
        zone.setAttribute('aria-label', label);
        const render = () => {
          zone.querySelector('.dz-preview')?.remove();
          zone.classList.remove('awsm-form-drag-and-drop-invalid-control');
          zone.classList.toggle('dz-started', input.files.length > 0);
          zone.classList.toggle('dz-max-files-reached', input.files.length >= maxFiles);
          [...input.files].forEach((file) => {
            zone.insertAdjacentHTML('beforeend', '<div class="dz-preview dz-file-preview dz-complete"><div class="dz-image"></div><div class="dz-details"><div class="dz-size"><span><strong></strong> MB</span></div><div class="dz-filename"><span></span></div></div><a class="dz-remove" href="#"></a></div>');
            const preview = zone.lastElementChild;
            preview.querySelector('.dz-size strong').textContent = (file.size / 1e6).toFixed(1);
            preview.querySelector('.dz-filename span').textContent = file.name;
            preview.querySelector('.dz-remove').textContent = t('Supprimer le fichier', 'Remove file');
          });
        };
        const choose = () => input.click();
        zone.addEventListener('click', (event) => {
          event.preventDefault();
          if (event.target.closest('.dz-remove')) { input.value = ''; render(); return; }
          choose();
        });
        zone.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
        });
        zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('dz-drag-hover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dz-drag-hover'));
        zone.addEventListener('drop', (event) => {
          event.preventDefault();
          zone.classList.remove('dz-drag-hover');
          const files = new DataTransfer();
          [...event.dataTransfer.files]
            .filter((file) => accepted.some((extension) => file.name.toLowerCase().endsWith(extension)))
            .slice(0, maxFiles)
            .forEach((file) => files.items.add(file));
          input.files = files.files;
          render();
        });
        input.addEventListener('change', render);
      });
      const title = pageTitle();
      const spontaneous = /spontan|unsolicited/i.test(title + location.pathname);
      const message = form.parentElement.querySelector('.awsm-application-message');
      const show = (html) => {
        if (!message) return;
        message.style.display = '';
        message.innerHTML = html;
      };
      const button = form.querySelector('[type="submit"]');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const empty = missing(form);
        if (empty.length) {
          const zone = empty[0].qlZone;
          if (zone) { zone.classList.add('awsm-form-drag-and-drop-invalid-control'); zone.focus(); return; }
          empty[0].reportValidity?.(); empty[0].focus(); return;
        }
        const data = collect(form, spontaneous ? 'Candidature spontanée' : `Candidature : ${title}`, spontaneous ? 'Candidature spontanée' : 'Candidature à une offre');
        data.append('Poste visé', spontaneous ? 'Candidature spontanée' : title);
        const attachByHand = (html) => html.replace('</p>', ` ${t('Joignez votre CV au message.', 'Please attach your CV to the e-mail.')}</p>`);
        if ([...data.values()].some((value) => value instanceof File && value.size > FORM_MAX_FILE_BYTES)) {
          show(attachByHand(fallback(data, t("Votre fichier dépasse 4 Mo, la limite de l'envoi en ligne.", 'Your file is larger than 4 MB, the limit for sending online.'))));
          return;
        }
        if (button) button.disabled = true;
        show(`<p>${t('Envoi en cours…', 'Sending…')}</p>`);
        try {
          await send(data);
          show(`<p>${t('Votre candidature a bien été envoyée. Merci !', 'Your application has been submitted. Thank you!')}</p>`);
          form.hidden = true;
        } catch {
          show(attachByHand(fallback(data)));
          if (button) button.disabled = false;
        }
      });
    });
  }

  // trx_addons "typed" titles (jQuery Typed.js 1.x): types each string, waits backDelay, deletes
  // it and types the next one (looped). Delay per character = typeSpeed + random 0-70 ms, as in
  // Typed.js. typeSpeed = (11 - data-speed) * 10, backDelay = data-delay s. Starts when the bottom
  // of the element is in the window.
  function initTyped() {
    document.querySelectorAll('.sc_typed_entry[data-strings]').forEach((element) => {
      let strings;
      try { strings = JSON.parse(element.dataset.strings); } catch { return; }
      if (!strings.length || reducedMotion) return;
      const speed = Number(element.dataset.speed);
      const typeSpeed = speed > 0 ? (11 - Math.max(1, Math.min(10, speed))) * 10 : 50;
      const delay = Number(element.dataset.delay);
      const backDelay = delay > 0 ? Math.max(0, Math.min(10, delay)) * 1000 : 1000;
      const loop = element.dataset.loop === '1';
      const humanize = (base) => Math.round(Math.random() * 70) + base;
      if (element.dataset.cursor === '1') element.insertAdjacentHTML('afterend', `<span class="typed-cursor">${element.dataset.cursorChar ?? '|'}</span>`);
      let index = 0;
      const type = (text, position) => {
        setTimeout(() => {
          element.textContent = text.slice(0, position);
          if (position < text.length) { type(text, position + 1); return; }
          if (index === strings.length - 1 && !loop) return;
          setTimeout(() => erase(text, text.length), backDelay);
        }, humanize(typeSpeed));
      };
      const erase = (text, position) => {
        setTimeout(() => {
          element.textContent = text.slice(0, position);
          if (position > 0) { erase(text, position - 1); return; }
          index = (index + 1) % strings.length;
          type(strings[index], 0);
        }, humanize(0));
      };
      const start = () => { element.classList.add('sc_typed_inited'); element.textContent = ''; type(strings[0], 0); };
      const check = () => {
        const box = element.getBoundingClientRect();
        if (box.bottom >= 0 && box.bottom <= window.innerHeight) { window.removeEventListener('scroll', check); start(); }
      };
      window.addEventListener('scroll', check, { passive: true });
      check();
    });
  }

  document.querySelectorAll('.ql-hero').forEach(initHero);
  initStretchedSections();
  initEventsBreakpoints();
  initGalleries();
  initTyped();
  initSessionRegistration();
  initContactFormStyles();
  initPhoneFields();
  initForms();
  initJobFilters();
  initPopups();
  initElementorPosts();
  initTrainingCatalogue();
  initSearch().then(initBlogPagination);
  initElementorTabs();
  initMobileMenu();
  initHeaderSearch();
  initLayoutPanels();
  initAccessibleNames();
  initEntranceAnimations();
  initMenus();
  initSchemeWatchers();
  initSkills();
  initSliders();
})();
