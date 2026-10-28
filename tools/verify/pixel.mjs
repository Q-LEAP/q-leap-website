// Full-page pixel diff: q-guard.app vs local static build (headless Chrome + pixelmatch).
// Usage: node pixel.mjs [page ...]
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const LIVE = 'https://q-guard.app/';
const LOCAL = 'http://localhost:8765/';
const PAGES = { home: '', 'about-us': 'about-us/', features: 'features/', contact: 'contact/', 'support-help-faq': 'support-help-faq/', 'privacy-policy': 'privacy-policy/' };
const VIEWPORTS = {
  desktop: { width: 1920, height: 902 },
  tablet: { width: 1024, height: 1366, isMobile: true, hasTouch: true },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const only = process.argv.slice(2);
fs.mkdirSync('shots', { recursive: true });

async function freeze(page) {
  await page.evaluate(async () => {
    document.querySelectorAll('.elementor-invisible').forEach(e => e.classList.remove('elementor-invisible'));
    document.querySelectorAll('.animated').forEach(e => e.classList.remove('animated'));
    document.body.classList.add('loaded');
    document.querySelectorAll('.swiper').forEach(el => {
      if (!el.swiper) return;
      el.swiper.autoplay?.stop();
    });
    // Third-party / time-based content: geometry is verified separately, pixels vary per load.
    const style = document.createElement('style');
    style.textContent = 'video, .frm-g-recaptcha > *, .elementor-custom-embed iframe { visibility: hidden !important; } *, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }';
    document.head.appendChild(style);
    window.scrollTo(0, 0);
    await document.fonts.ready;
    document.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
    const imagesReady = Promise.all([...document.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
    await Promise.race([imagesReady, new Promise(r => setTimeout(r, 15000))]);
    await new Promise(r => setTimeout(r, 1500));
  });
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  protocolTimeout: 180000,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
const summary = {};
for (const [name, path] of Object.entries(PAGES)) {
  if (only.length && !only.includes(name)) continue;
  for (const [device, viewport] of Object.entries(VIEWPORTS)) {
    const images = {};
    for (const [side, base] of [['live', LIVE], ['local', LOCAL]]) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      await page.goto(base + path, { waitUntil: 'networkidle2', timeout: 90000 });
      await freeze(page);
      const file = `shots/${name}-${device}-${side}.png`;
      await page.screenshot({ path: file, fullPage: true });
      images[side] = PNG.sync.read(fs.readFileSync(file));
      await page.close();
    }
    const { live, local } = images;
    const width = Math.min(live.width, local.width);
    const height = Math.min(live.height, local.height);
    const crop = png => {
      const out = new PNG({ width, height });
      PNG.bitblt(png, out, 0, 0, width, height, 0, 0);
      return out;
    };
    const a = crop(live), b = crop(local), diff = new PNG({ width, height });
    const mismatched = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1, includeAA: false });
    fs.writeFileSync(`shots/${name}-${device}-diff.png`, PNG.sync.write(diff));
    // Rows with differences, grouped into bands, to locate hotspots.
    const bands = [];
    for (let y = 0; y < height; y++) {
      let rowDiff = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) rowDiff++;
      }
      if (rowDiff) {
        const last = bands[bands.length - 1];
        if (last && y - last.to <= 8) { last.to = y; last.px += rowDiff; } else bands.push({ from: y, to: y, px: rowDiff });
      }
    }
    summary[`${name}/${device}`] = { size: [[live.width, live.height], [local.width, local.height]], mismatched, pct: +(100 * mismatched / (width * height)).toFixed(4), bands: bands.filter(b => b.px > 20).slice(0, 12) };
    console.log(`${name}/${device}: ${mismatched} px differ (${summary[`${name}/${device}`].pct}%)  bands: ${summary[`${name}/${device}`].bands.map(b => `${b.from}-${b.to}:${b.px}`).join(' ')}`);
  }
}
await browser.close();
fs.writeFileSync('pixel-report.json', JSON.stringify(summary, null, 1));
