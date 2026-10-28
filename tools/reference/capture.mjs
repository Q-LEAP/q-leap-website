// Captures de référence du site WordPress (q-leap.eu) pour la reproduction statique.
// Le fichier Elementor custom-frontend.min.css manquant sur le serveur (404 depuis le 28/10 13:38)
// est remplacé à la volée par custom-frontend.min.css (reconstitué : tablette 1279 px).
// Usage : node capture.mjs <urls,séparées,par,virgules> <dossier de sortie> [desktop,tablet,mobile]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [, , list, outDir, viewportList = 'desktop,tablet,mobile'] = process.argv;
const here = path.dirname(new URL(import.meta.url).pathname);
const fixedCss = fs.readFileSync(path.join(here, 'custom-frontend.min.css')).toString('base64');
const viewports = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true },
  mobile: { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
};
const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync('/tmp/qleap-capture-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {} await sleep(250); }
const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (socket.onopen = r));
let nextId = 0; const pending = {}; let events = [];
const send = (method, params = {}) => new Promise((r) => { const id = ++nextId; pending[id] = r; socket.send(JSON.stringify({ id, method, params })); });
socket.onmessage = async (message) => {
  const data = JSON.parse(message.data);
  if (data.id && pending[data.id]) { pending[data.id](data.result || data.error); delete pending[data.id]; return; }
  if (data.method === 'Fetch.requestPaused') {
    const { requestId, request } = data.params;
    if (request.url.includes('/uploads/elementor/css/custom-frontend.min.css')) {
      send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/css' }], body: fixedCss });
    } else send('Fetch.continueRequest', { requestId });
    return;
  }
  events.push(data);
};
await send('Page.enable'); await send('Runtime.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*custom-frontend.min.css*' }] });
fs.mkdirSync(outDir, { recursive: true });
for (const url of list.split(',')) {
  for (const name of viewportList.split(',')) {
    const viewport = viewports[name];
    await send('Emulation.setDeviceMetricsOverride', viewport);
    await send('Emulation.setUserAgentOverride', { userAgent: viewport.mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36' });
    events = [];
    await send('Page.navigate', { url });
    let loaded = false; for (let i = 0; i < 600 && !(loaded = events.some((e) => e.method === 'Page.loadEventFired')); i++) await sleep(100);
    if (process.env.DEBUG) console.log('loaded', loaded, (await send('Runtime.evaluate', { returnByValue: true, expression: 'document.readyState+" "+location.href+" "+document.body.innerText.length' })).result.value);
    // Scroll through the page so lazy images and scroll animations run, then back to the top.
    await send('Runtime.evaluate', { awaitPromise: true, expression: `(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=400){scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}scrollTo(0,0);await new Promise(r=>setTimeout(r,1500))})()` });
    const { result } = await send('Runtime.evaluate', { returnByValue: true, expression: 'document.documentElement.scrollHeight' });
    const height = Math.min(result.value, 16000);
    const slug = new URL(url).pathname.replace(/^\/|\/$/g, '').replace(/\//g, '__') || 'home';
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: viewport.width, height, scale: 1 } });
    fs.writeFileSync(path.join(outDir, `${slug}.${name}.png`), Buffer.from(shot.data, 'base64'));
    if (name === 'desktop') {
      const dom = await send('Runtime.evaluate', { returnByValue: true, expression: 'document.documentElement.outerHTML' });
      fs.writeFileSync(path.join(outDir, `${slug}.html`), dom.result.value);
    }
    console.log(name, url, height);
  }
}
socket.close(); chrome.kill();
