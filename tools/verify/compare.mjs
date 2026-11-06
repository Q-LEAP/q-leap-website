// Layout/style diff between the live WordPress site (q-leap.eu) and the local static build, in headless Chrome.
// Usage: npm install, serve the repository on http://localhost:8765/, then node compare.mjs [page ...]
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { CHROME, LIVE, LOCAL } from './chrome.mjs';

const PAGES = { home: '', en: 'en/', 'about-us': 'about-us/', testing: 'testing-service/', training: 'training/', contact: 'contact/', blog: 'blog/', 'our-events': 'our-events/', 'en-about-us': 'en/about-us/', 'join-us': 'join-us/', 'en-career': 'en/career/', innovations: 'innovations/', 'q-leap-factory': 'q-leap-factory/',
  'test-automation': 'automatisation-des-tests/', accessibility: 'tests-daccessibilite/', calendar: 'calendrier-formation/', references: 'our-references/', 'training-istqb-fl': 'trainings/istqb-certified-tester-foundation-level/', post: 'le-lien-entre-la-qualite-et-linnovation/', privacy: 'data-protection-notice/',
  'portfolio-luxair': 'portfolio/luxair/', 'jobs-spontaneous': 'jobs/candidature-spontanee/', 'en-post': 'en/quality-is-not-tested-but-built/' };
const VIEWPORTS = {
  desktop: { width: 1920, height: 902 },
  tablet: { width: 1024, height: 1366, isMobile: true, hasTouch: true },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const only = process.argv.slice(2);

async function collect(page) {
  return page.evaluate(async () => {
    // The live site's LSTE 2026 promo bar (58 px, in the flow) is not part of the static copy: it would shift every box.
    document.getElementById('lste-promo')?.remove();
    document.querySelectorAll('.elementor-invisible').forEach(e => e.classList.remove('elementor-invisible'));
    document.querySelectorAll('.animated').forEach(e => e.classList.remove('animated'));
    document.body.classList.add('loaded');
    document.querySelectorAll('video').forEach(v => v.pause());
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 1200));
    const box = e => { const r = e.getBoundingClientRect(); return [r.left, r.top + scrollY, r.width, r.height].map(Math.round); };
    const boxes = {};
    document.querySelectorAll('[data-id]').forEach(e => { if (!e.closest('.swiper')) boxes[e.dataset.id] = box(e); });
    const styles = [];
    document.querySelectorAll('header.top_panel, .page_content_wrap, footer.footer_wrap').forEach(root =>
      root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,li,span,button,input,textarea,label,img,i').forEach(e => {
        if (e.closest('.swiper, .flexslider') || !e.getClientRects().length) return; // only rendered nodes; hidden flexslider adds nav
        const c = getComputedStyle(e);
        styles.push({
          tag: e.tagName, text: e.tagName === 'IMG' ? (e.getAttribute('src') || '').split('/').pop().split('?')[0] : (e.textContent || '').trim().slice(0, 40), box: box(e),
          font: c.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: c.fontSize, weight: c.fontWeight, lh: c.lineHeight,
          color: c.color, ls: c.letterSpacing, tt: c.textTransform, bg: c.backgroundColor, radius: c.borderRadius,
          shadow: c.boxShadow, border: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`, display: c.display, opacity: c.opacity,
        });
      }));
    return { height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth, boxes, styles };
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
});
const report = {};
for (const [name, path] of Object.entries(PAGES)) {
  if (only.length && !only.includes(name)) continue;
  for (const [device, viewport] of Object.entries(VIEWPORTS)) {
    const results = {};
    for (const [side, base] of [['live', LIVE], ['local', LOCAL]]) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      await page.goto(base + path, { waitUntil: 'networkidle2', timeout: 90000 });
      results[side] = await collect(page);
      if (process.env.SHOTS) await page.screenshot({ path: `shots/${name}-${device}-${side}.png`, fullPage: true });
      await page.close();
    }
    const { live, local } = results;
    const diff = { height: [live.height, local.height], width: [live.width, local.width], boxes: [], styles: [] };
    for (const id of new Set([...Object.keys(live.boxes), ...Object.keys(local.boxes)])) {
      const a = live.boxes[id], b = local.boxes[id];
      if (a && !b && a.every(v => v === 0)) continue; // never-rendered on live, removed locally
      if (!a || !b || a.some((v, i) => Math.abs(v - b[i]) > 1)) diff.boxes.push({ id, live: a, local: b });
    }
    const count = Math.max(live.styles.length, local.styles.length);
    for (let i = 0; i < count; i++) {
      const a = live.styles[i], b = local.styles[i];
      if (!a || !b) { diff.styles.push({ i, live: a, local: b }); continue; }
      const changed = Object.keys(a).filter(k => k === 'box' ? a.box.some((v, j) => Math.abs(v - b.box[j]) > 1) : a[k] !== b[k]);
      if (changed.length) diff.styles.push({ i, tag: a.tag, text: a.text, changed: Object.fromEntries(changed.map(k => [k, [a[k], b[k]]])) });
    }
    report[`${name}/${device}`] = diff;
    console.log(`${name}/${device}: height ${live.height}/${local.height}  boxes ${diff.boxes.length}  styles ${diff.styles.length}  (of ${live.styles.length})`);
  }
}
await browser.close();
fs.writeFileSync('compare-report.json', JSON.stringify(report, null, 1));
