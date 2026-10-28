// Mesure la géométrie et les styles calculés d'éléments du site d'origine (avec le CSS Elementor reconstitué).
// Usage : node probe.mjs <url> <sélecteur CSS> <délai ms avant mesure> [desktop,tablet,mobile]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [, , url, selector, delay = '3000', viewportList = 'desktop,tablet,mobile'] = process.argv;
const here = path.dirname(new URL(import.meta.url).pathname);
const fixedCss = fs.readFileSync(path.join(here, 'custom-frontend.min.css')).toString('base64');
const viewports = { desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, tablet: { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true }, mobile: { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } };
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${fs.mkdtempSync('/tmp/qleap-probe-')}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {} await sleep(250); }
const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (socket.onopen = r));
let nextId = 0; const pending = {}; let events = [];
const send = (method, params = {}) => new Promise((r) => { const id = ++nextId; pending[id] = r; socket.send(JSON.stringify({ id, method, params })); });
socket.onmessage = (message) => { const data = JSON.parse(message.data); if (data.id && pending[data.id]) { pending[data.id](data.result || data.error); delete pending[data.id]; return; }
  if (data.method === 'Fetch.requestPaused') { const { requestId, request } = data.params; if (request.url.includes('custom-frontend.min.css')) send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/css' }], body: fixedCss }); else send('Fetch.continueRequest', { requestId }); return; }
  events.push(data); };
await send('Page.enable'); await send('Runtime.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*custom-frontend.min.css*' }] });
const result = {};
for (const name of viewportList.split(',')) {
  const viewport = viewports[name];
  await send('Emulation.setDeviceMetricsOverride', viewport);
  events = []; await send('Page.navigate', { url });
  for (let i = 0; i < 600 && !events.some((e) => e.method === 'Page.loadEventFired'); i++) await sleep(100);
  await sleep(Number(delay));
  const shot = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${process.env.OUT || "/tmp"}/${name}.png`, Buffer.from(shot.data, "base64")); const { result: r } = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.getClientRects().length).map(e => { const b = e.getBoundingClientRect(); const c = getComputedStyle(e);
    return { tag: e.tagName.toLowerCase(), id: e.id, cls: (e.className && e.className.baseVal === undefined ? e.className : '').toString().slice(0, 80), text: (e.childElementCount ? '' : e.textContent.trim().slice(0, 50)),
      box: [b.left, b.top + scrollY, b.width, b.height].map(Math.round), font: c.fontFamily.split(',')[0], size: c.fontSize, weight: c.fontWeight, lh: c.lineHeight, ls: c.letterSpacing, color: c.color, bg: c.backgroundColor,
      bgImage: c.backgroundImage.slice(0, 120), transform: c.transform, opacity: c.opacity, padding: c.padding, margin: c.margin, tt: c.textTransform, ta: c.textAlign, ws: c.whiteSpace, zi: c.zIndex }; }))()` });
  result[name] = r.value;
}
console.log(JSON.stringify(result, null, 1));
socket.close(); chrome.kill();
