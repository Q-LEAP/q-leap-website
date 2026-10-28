// Compare two local servers page by page (same paths): full-page screenshots at a given width,
// pixel difference ratio and the first differing rows. Dev tool, no dependency.
// Usage: node tools/verify/pair-diff.mjs <baseA> <baseB> <out dir> <width> <path> [path ...]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [, , baseA, baseB, outDir, widthArg, ...paths] = process.argv;
const width = Number(widthArg) || 1440;
const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${fs.mkdtempSync('/tmp/pair-')}`, '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {} await sleep(250); }
const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (socket.onopen = r));
let id = 0; const pending = {}; let events = [];
socket.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d.result); delete pending[d.id]; } else events.push(d); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; socket.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 800 });
fs.mkdirSync(outDir, { recursive: true });
async function shot(url) {
  events = []; await send('Page.navigate', { url });
  for (let i = 0; i < 300 && !events.some((e) => e.method === 'Page.loadEventFired'); i++) await sleep(100);
  await send('Runtime.evaluate', { awaitPromise: true, expression: `(async()=>{document.querySelectorAll('.elementor-invisible').forEach(e=>e.classList.remove('elementor-invisible'));const s=document.createElement('style');s.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';document.head.appendChild(s);document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager');await Promise.race([Promise.all([...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))),new Promise(r=>setTimeout(r,8000))]);await document.fonts.ready;await new Promise(r=>setTimeout(r,800))})()` });
  const { result } = await send('Runtime.evaluate', { returnByValue: true, expression: 'document.documentElement.scrollHeight' });
  const height = Math.min(result.value, 12000);
  const data = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
  return { png: Buffer.from(data.data, 'base64'), height };
}
const summary = [];
for (const p of paths) {
  const name = p.replace(/\W+/g, '_') || 'home';
  const a = await shot(baseA + p); const b = await shot(baseB + p);
  fs.writeFileSync(`${outDir}/${name}.a.png`, a.png); fs.writeFileSync(`${outDir}/${name}.b.png`, b.png);
  summary.push({ path: p, heightA: a.height, heightB: b.height });
  console.log(p, a.height, b.height);
}
fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 1));
socket.close(); chrome.kill();
