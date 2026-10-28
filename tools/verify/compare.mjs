// Layout/style diff between q-guard.app and the local static build, in headless Chrome.
// Usage: node compare.mjs [page ...]
import fs from 'fs';
import puppeteer from 'puppeteer-core';

const LIVE = 'https://q-guard.app/';
const LOCAL = 'http://localhost:8765/';
const PAGES = { home: '', 'about-us': 'about-us/', features: 'features/', contact: 'contact/', 'support-help-faq': 'support-help-faq/', 'privacy-policy': 'privacy-policy/' };
const VIEWPORTS = {
  desktop: { width: 1920, height: 902 },
  tablet: { width: 1024, height: 1366, isMobile: true, hasTouch: true },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const only = process.argv.slice(2);

async function collect(page) {
  return page.evaluate(async () => {
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
    document.querySelectorAll('body > header.banner:not(.headhesive--clone), .wrap, .prefooter, body > footer').forEach(root =>
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
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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
