// Responsive check of every page of sitemap.xml (or the paths given), at phone, tablet and desktop
// widths: horizontal overflow (and the elements sticking out of the screen), images that fail to
// load, requests in error and script errors. Read-only, sends no form.
// Usage: npm install, then node responsive.mjs [base URL] [out.json] [path ...]
//        base URL: the published test site, the live site or a local server (default: LOCAL)
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { CHROME, LOCAL } from './chrome.mjs';

const BASE = (process.argv[2] || LOCAL).replace(/\/?$/, '/');
const OUT = process.argv[3] || 'responsive.json';
const only = process.argv.slice(4);
const sitemap = fs.readFileSync(new URL('../../sitemap.xml', import.meta.url), 'utf8');
const pages = only.length ? only : [...sitemap.matchAll(/<loc>https:\/\/q-leap\.eu\/([^<]*)<\/loc>/g)].map(m => m[1]);
// One load per device class, then the other widths of the class by resizing.
const CLASSES = [
  { mobile: true, widths: [320, 375, 414], height: 800 },
  { mobile: true, widths: [768, 1024], height: 1100 },
  { mobile: false, widths: [1366, 1920], height: 900 },
];
const IGNORE = /recaptcha|google|gstatic|doubleclick|facebook|linkedin|hotjar|clarity|youtube|vimeo|maps/i;

async function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const visible = e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity !== 0; };
    // Elements whose right edge passes the screen, unless an ancestor clips them (overflow hidden/auto/clip).
    const clipped = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') return true; } return false; };
    const out = [];
    for (const e of document.body.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || (r.right <= vw + 1 && r.left >= -1)) continue;
      if (!visible(e) || clipped(e) || getComputedStyle(e).position === 'fixed') continue;
      if (e.closest('.swiper-wrapper,.slick-track,.owl-stage,[aria-hidden="true"],.sc_layouts_panel,.menu_mobile,.search_wrap')) continue;
      // keep the outermost element only
      if (out.some(o => o.el.contains(e))) continue;
      const id = e.id ? '#' + e.id : '';
      const cls = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      out.push({ el: e, sel: e.tagName.toLowerCase() + id + cls, dataId: e.closest('[data-id]')?.dataset.id || null, left: Math.round(r.left), right: Math.round(r.right), text: (e.innerText || '').trim().slice(0, 50) });
    }
    const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const brokenImgs = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.currentSrc && visible(i)).map(i => i.currentSrc);
    return { scroll: docW - vw, bodyOverflowX: getComputedStyle(document.body).overflowX, offenders: out.slice(0, 8).map(({ el, ...o }) => o), brokenImgs };
  });
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight * 0.8) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
    scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 800));
}

async function check(browser, path) {
  const result = { path: '/' + path, widths: {}, errors: new Set(), failed: new Set() };
  for (const cls of CLASSES) {
    const page = await browser.newPage();
    page.on('pageerror', e => result.errors.add(e.message.split('\n')[0]));
    page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text()) && !/Failed to load resource/.test(m.text())) result.errors.add(m.text().slice(0, 200)); });
    page.on('response', r => { if (r.status() >= 400 && !IGNORE.test(r.url())) result.failed.add(`${r.status()} ${r.url()}`); });
    page.on('requestfailed', r => { if (!IGNORE.test(r.url()) && !/ERR_ABORTED/.test(r.failure()?.errorText || '')) result.failed.add(`${r.failure()?.errorText} ${r.url()}`); });
    const [first, ...rest] = cls.widths;
    await page.setViewport({ width: first, height: cls.height, isMobile: cls.mobile, hasTouch: cls.mobile });
    try {
      const res = await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 60000 });
      result.status = res.status();
    } catch (e) { result.errors.add('load: ' + e.message); await page.close(); continue; }
    await scrollThrough(page);
    result.widths[first] = await measure(page);
    for (const w of rest) {
      await page.setViewport({ width: w, height: cls.height, isMobile: cls.mobile, hasTouch: cls.mobile });
      await new Promise(r => setTimeout(r, 700));
      result.widths[w] = await measure(page);
    }
    await page.close();
  }
  return { ...result, errors: [...result.errors], failed: [...result.failed] };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const report = [];
const queue = [...pages];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const path = queue.shift();
    const r = await check(browser, path);
    report.push(r);
    const bad = Object.entries(r.widths).filter(([, m]) => m.scroll > 0 || m.offenders.length || m.brokenImgs.length).map(([w]) => w);
    console.log(`${report.length}/${pages.length} /${path}${bad.length ? '  ⚠ ' + bad.join(',') : ''}${r.errors.length ? '  JS×' + r.errors.length : ''}${r.failed.length ? '  HTTP×' + r.failed.length : ''}`);
  }
}));
await browser.close();
report.sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log('→ ' + OUT);
