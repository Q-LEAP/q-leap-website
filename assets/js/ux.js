// UXEnhance: small behaviours that make the site easier to use, without changing its look.
(() => {
  // Whole cards act as their main link (the title link); other links inside keep working.
  const cardSelector = '.post_item.post_layout_band, .sc_blogger_item, .elementor-post__card';
  document.querySelectorAll(cardSelector).forEach((card) => {
    const main = card.querySelector('.post_title a, .sc_blogger_item_title a, .elementor-post__title a');
    if (!main) return;
    card.classList.add('ql-card-link');
    card.addEventListener('click', (event) => {
      if (event.target.closest('a, button, input, label') || window.getSelection()?.toString()) return;
      if (event.metaKey || event.ctrlKey) window.open(main.href, '_blank');
      else main.click();
    });
  });

  // The theme's "scroll to top" button (its script is not part of the static site).
  const toTop = document.querySelector('.trx_addons_scroll_to_top');
  if (toTop) {
    const update = () => toTop.classList.toggle('show', window.scrollY > window.innerHeight);
    window.addEventListener('scroll', update, { passive: true });
    update();
    toTop.addEventListener('click', (event) => {
      event.preventDefault();
      window.scrollTo(0, 0);
    });
  }
})();
