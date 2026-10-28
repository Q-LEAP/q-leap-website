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
      // eslint-disable-next-line no-new
      new window.Swiper(slider, {
        freeMode: Number(data.freeMode) > 0,
        direction,
        initialSlide: 0,
        speed: data.speed !== undefined ? Number(data.speed) : 600,
        loop: (data.loop === undefined || Number(data.loop) > 0) && data.slidesOverflow !== '1',
        loopedSlides: perView,
        slidesPerView: perView,
        spaceBetween: Number(data.slidesSpace) || 0,
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
    const animation = element.animate([{ opacity: show ? 0 : 1 }, { opacity: show ? 1 : 0 }], { duration, easing: swing });
    if (!show) animation.onfinish = () => { element.style.display = 'none'; };
  }

  // Qwery mobile menu (full-screen panel) and vertical menus: arrow toggles for sub-menus.
  function initMobileMenu() {
    const menu = document.querySelector('.menu_mobile');
    if (!menu) return;
    const overlay = menu.previousElementSibling?.classList.contains('menu_mobile_overlay') ? menu.previousElementSibling : null;
    let opener = null;
    const open = (button) => {
      opener = button;
      menu.classList.add('opened');
      if (overlay) fade(overlay, true);
      document.body.classList.add('menu_mobile_opened');
      setTimeout(() => menu.querySelector('a')?.focus(), 100);
    };
    const close = (skipFocus) => {
      menu.classList.remove('opened');
      if (overlay) fade(overlay, false);
      document.body.classList.remove('menu_mobile_opened');
      if (!skipFocus) opener?.focus();
    };
    document.querySelectorAll('.sc_layouts_menu_mobile_button > a, .menu_mobile_button').forEach((button) => {
      button.addEventListener('click', (event) => { event.preventDefault(); open(button); });
    });
    overlay?.addEventListener('click', (event) => { event.preventDefault(); close(); });
    const closeButton = menu.querySelector('.menu_mobile_close');
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

  document.querySelectorAll('.ql-hero').forEach(initHero);
  initSessionRegistration();
  initPopups();
  initElementorPosts();
  initTrainingCatalogue();
  initElementorTabs();
  initMobileMenu();
  initEntranceAnimations();
  initMenus();
  initSchemeWatchers();
  initSkills();
  initSliders();
})();
