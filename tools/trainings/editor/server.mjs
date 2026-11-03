// Éditeur des formations : serveur local (aucune dépendance), http://localhost:8790/
// - /            l'éditeur (tools/trainings/editor/app/)
// - /site/...    le site lui-même (aperçu, images, PDF)
// - /api/...     lecture / enregistrement de content/trainings/ et content/training-settings.json, aperçu, envoi de fichiers, publication Git
// Ne répond qu'en local (127.0.0.1). Lancement : npm run formations   (ou node tools/trainings/editor/server.mjs)
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadContent, saveContent, trainingPage, withLabels, DEFAULT_LABELS, paths } from '../build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = paths.ROOT;
const APP = path.join(HERE, 'app');
const PORT = Number(process.env.PORT) || 8790;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveFile(response, base, relative) {
  const target = path.resolve(base, '.' + decodeURIComponent(relative));
  if (!target.startsWith(base)) return send(response, 403, { error: 'interdit' });
  let file = target;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return send(response, 404, { error: 'introuvable' });
  send(response, 200, fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
}

function readBody(request, limit = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => { size += chunk.length; if (size > limit) { reject(new Error('fichier trop lourd (50 Mo max)')); request.destroy(); } else chunks.push(chunk); });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function run(command, args) {
  return new Promise((resolve) => execFile(command, args, { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr: stderr || (error ? String(error) : '') })));
}

// Width / height of an uploaded PNG, JPEG, GIF or WebP, read from its header.
function imageSize(buffer) {
  if (buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (buffer.slice(0, 3).toString('ascii') === 'GIF') return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    const chunk = buffer.slice(12, 16).toString('ascii');
    if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const bits = buffer.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      offset += 2 + length;
    }
  }
  return { width: 0, height: 0 };
}

function safeName(name) {
  const extension = path.extname(name).toLowerCase();
  const stem = path.basename(name, path.extname(name)).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'fichier';
  return stem + extension;
}

// Same as tools/export/components.py fill_ninja_forms: the rendered Ninja Forms markup.
function fillNinjaForms(markup, lang) {
  return markup.replace(/<div id="nf-form-(\d+)(?:_(\d+))?-cont"[^>]*>\s*<div class="nf-loading-spinner"><\/div>\s*<\/div>/g, (match, formId, instance = '0') => {
    const file = path.join(ROOT, 'content', 'forms', `ninja-${formId}.${lang}.${instance}.html`);
    return fs.existsSync(file) ? match.replace('<div class="nf-loading-spinner"></div>', fs.readFileSync(file, 'utf8')) : match;
  });
}

// Preview pages are served from /site/<path of the page>/ so that their relative links work.
function previewHtml(content, trainingId, lang) {
  const training = content.trainings.find((item) => item.id === trainingId);
  if (!training) throw new Error('formation introuvable');
  return fillNinjaForms(trainingPage(withLabels(content), training, lang), lang);
}

const previews = new Map();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname === '/' || url.pathname.startsWith('/app/')) return serveFile(response, APP, url.pathname === '/' ? '/index.html' : url.pathname.slice(4));
    if (url.pathname.startsWith('/site/')) {
      const preview = previews.get(url.pathname);
      if (preview) return send(response, 200, preview, TYPES['.html']);
      return serveFile(response, ROOT, url.pathname.slice(5));
    }
    if (url.pathname === '/api/content' && request.method === 'GET') {
      const content = loadContent();
      return send(response, 200, { content, defaultLabels: DEFAULT_LABELS });
    }
    if (url.pathname === '/api/content' && request.method === 'PUT') {
      const { content } = JSON.parse((await readBody(request)).toString('utf8'));
      if (!content || !Array.isArray(content.trainings)) return send(response, 400, { error: 'contenu invalide' });
      saveContent(content);
      const written = build({ content: withLabels(content) });
      return send(response, 200, { ok: true, written: written.length });
    }
    if (url.pathname === '/api/preview' && request.method === 'POST') {
      const { content, trainingId, lang } = JSON.parse((await readBody(request)).toString('utf8'));
      const training = content.trainings.find((item) => item.id === trainingId);
      const pagePath = `/site/${lang === 'en' ? 'en/' : ''}trainings/${training[lang].slug || '_nouvelle-formation'}/__preview.html`;
      previews.set(pagePath, previewHtml(content, trainingId, lang));
      return send(response, 200, { url: pagePath });
    }
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      const kind = url.searchParams.get('kind') === 'documents' ? 'documents' : 'images';
      const name = safeName(url.searchParams.get('name') || 'fichier');
      const allowed = kind === 'documents' ? ['.pdf'] : ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      if (!allowed.includes(path.extname(name))) return send(response, 400, { error: `type de fichier non accepté (${allowed.join(', ')})` });
      const body = await readBody(request);
      const month = new Date().toISOString().slice(0, 7).replace('-', '/');
      let relative = path.join('assets', kind, month, name);
      for (let index = 2; fs.existsSync(path.join(ROOT, relative)); index++) relative = path.join('assets', kind, month, name.replace(/(\.[^.]+)$/, `-${index}$1`));
      fs.mkdirSync(path.dirname(path.join(ROOT, relative)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, relative), body);
      return send(response, 200, { path: relative.split(path.sep).join('/'), ...(kind === 'images' ? imageSize(body) : {}) });
    }
    if (url.pathname === '/api/files' && request.method === 'GET') {
      const kind = url.searchParams.get('kind') === 'documents' ? 'documents' : 'images';
      const base = path.join(ROOT, 'assets', kind);
      const files = [];
      const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (kind === 'documents' ? /\.pdf$/i.test(entry.name) : /\.(png|jpe?g|webp|gif)$/i.test(entry.name)) files.push(path.relative(ROOT, full).split(path.sep).join('/'));
      });
      if (fs.existsSync(base)) walk(base);
      return send(response, 200, { files: files.sort() });
    }
    if (url.pathname === '/api/status' && request.method === 'GET') {
      const status = await run('git', ['status', '--porcelain', '--', 'content', 'trainings', 'en/trainings', 'training', 'en/training', 'assets/images', 'assets/documents']);
      const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
      return send(response, 200, { branch: branch.stdout.trim(), changes: status.stdout.split('\n').filter(Boolean) });
    }
    if (url.pathname === '/api/publish' && request.method === 'POST') {
      const { message } = JSON.parse((await readBody(request)).toString('utf8'));
      const add = await run('git', ['add', '--', 'content', 'trainings', 'en/trainings', 'training', 'en/training', 'assets/images', 'assets/documents']);
      if (!add.ok) return send(response, 500, { error: add.stderr });
      const commit = await run('git', ['commit', '-m', `Formations : ${message || 'mise à jour'}`]);
      if (!commit.ok && !/nothing to commit|rien à valider/.test(commit.stdout + commit.stderr)) return send(response, 500, { error: commit.stderr || commit.stdout });
      const push = await run('git', ['push']);
      return send(response, push.ok ? 200 : 500, push.ok ? { ok: true, output: commit.stdout + push.stderr } : { error: push.stderr });
    }
    send(response, 404, { error: 'introuvable' });
  } catch (error) {
    send(response, 500, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Éditeur des formations : http://localhost:${PORT}/`));
