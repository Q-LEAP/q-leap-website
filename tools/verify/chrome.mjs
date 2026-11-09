// Chrome for the verify scripts: CHROME_PATH if set, otherwise the usual install path on Windows,
// macOS or Linux. Shared by pixel.mjs, compare.mjs, audit.mjs, responsive.mjs and pair-diff.mjs.
import fs from 'node:fs';

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export const CHROME = candidates.find((path) => path && fs.existsSync(path));
if (!CHROME) throw new Error('Chrome not found: set CHROME_PATH to the Chrome or Chromium executable.');

// The live WordPress site the static copy reproduces, and where the verify scripts expect the
// repository to be served (e.g. python -m http.server 8765 from the repository root).
export const LIVE = 'https://q-leap.eu/';
export const LOCAL = process.env.LOCAL_BASE || 'http://localhost:8765/';
