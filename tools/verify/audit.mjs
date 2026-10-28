// SEO/GEO audit of the local build (checks from the SEO implementation plan, 2026-09).
// Usage: node audit.mjs [out.json] -- serve the repo on http://localhost:8765/ first.
import fs from 'fs';
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:8765/';
const sitemap = fs.readFileSync(new URL('../../sitemap.xml', import.meta.url), 'utf8');
const pages = [...sitemap.matchAll(/<loc>https:\/\/q-guard\.app\/([^<]*)<\/loc>/g)].map(m => m[1]);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const report = []; const linkSet = new Set();
for (const path of pages) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/recaptcha|google|maps|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.setViewport({ width: 1440, height: 900 });
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 60000 });
  const d = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const meta = n => q(`meta[name="${n}"]`)?.content ?? q(`meta[property="${n}"]`)?.content ?? null;
    const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => h.offsetParent !== null || h.closest('.elementor-tab-content,.elementor-toggle'));
    const levels = heads.map(h => +h.tagName[1]);
    const skips = []; for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1 && !heads[i].closest('footer')) skips.push(`${heads[i-1].tagName}->${heads[i].tagName} "${heads[i].textContent.trim().slice(0,30)}"`);
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { const j = JSON.parse(s.textContent); return (j['@graph'] || [j]).map(x => x['@type']).join('+'); } catch (e) { return 'INVALID:' + e.message; } });
    const main = document.querySelector('.wrap')?.innerText || '';
    return {
      lang: document.documentElement.lang, title: document.title, desc: meta('description'), ogLocale: meta('og:locale'), ogTitle: meta('og:title'), ogDesc: meta('og:description'),
      canonical: q('link[rel=canonical]')?.href, hreflang: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(l => l.hreflang),
      robots: meta('robots'), h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()), skips, ld,
      emptyLinks: [...document.querySelectorAll('a[href="#"], a[href=""]')].map(a => a.textContent.trim()),
      links: [...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => h.startsWith(location.origin)),
      imgNoAlt: [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length,
      figures: (main.match(/\b\d+\s?%|\b\d+\s+Hours\b/g) || []),
      stale: (main.match(/end of 2024|Mathias Hardt|Q-BOT\b|linkedin\.com\/company\/?$/g) || []),
      frenchLeftovers: document.documentElement.lang === 'en' ? [...document.querySelectorAll('[aria-label],[data-invmsg]')].map(e => e.getAttribute('aria-label') || e.dataset.invmsg).filter(t => /\bsur\b|non valide|Carrousel/.test(t)) : [],
      words: main.split(/\s+/).filter(Boolean).length,
      bookDemoAboveFold: [...document.querySelectorAll('.wrap a')].some(a => /book a demo|réserver une démo/i.test(a.textContent) && a.getBoundingClientRect().bottom < innerHeight && a.getBoundingClientRect().top > 0),
    };
  });
  const overflow = {};
  for (const [w, h] of [[390, 844], [1024, 1366], [1920, 1080]]) {
    await page.setViewport({ width: w, height: h, isMobile: w < 1025, hasTouch: w < 1025 });
    await new Promise(r => setTimeout(r, 400));
    overflow[w] = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  }
  d.links.forEach(l => linkSet.add(l.split('#')[0]));
  report.push({ path: '/' + path, status: res.status(), ...d, links: undefined, overflow, errors });
  await page.close();
}
const broken = [];
for (const l of linkSet) { const r = await fetch(l); if (r.status !== 200) broken.push(`${r.status} ${l}`); }
for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt']) { const r = await fetch(BASE + f); report.push({ file: f, status: r.status }); }
await browser.close();
fs.writeFileSync(process.argv[2] || 'audit.json', JSON.stringify({ report, broken }, null, 1));
console.log(JSON.stringify({ report, broken }, null, 1));
