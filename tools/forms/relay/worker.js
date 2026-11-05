// Form relay for q-leap.eu (Cloudflare Worker): the static site posts its forms here (contact,
// training registrations, job applications with their CV) and the relay mails them to the team
// through Brevo's transactional API. Nothing is stored: each request becomes one e-mail.
//
// POST /          multipart form data from assets/js/main.js (initForms). Fields starting with "_"
//                 are instructions, not content: _subject (mail subject), _replyto (visitor's
//                 address, used as Reply-To). Files are attached. Answers {"ok": true} or
//                 {"ok": false, "error": "…"}; the site shows its e-mail fallback on any failure.
// GET  /health    {"ok": true} when Brevo accepts the API key (used by tools/verify/forms_monitor.py).
//
// Settings (wrangler.toml [vars] and secrets): BREVO_API_KEY (secret), RECIPIENT, SENDER_EMAIL,
// SENDER_NAME, ALLOWED_ORIGINS (comma-separated). Swapping Brevo for another provider means
// rewriting sendMail() only.

const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // CV and cover letter together, before base64
const MAX_FIELDS = 60;
const MAX_FIELD_LENGTH = 10000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET' && url.pathname === '/health') return health(env, cors);
    if (request.method !== 'POST' || url.pathname !== '/') return json({ ok: false, error: 'Not found' }, 404, cors);
    if (!cors['Access-Control-Allow-Origin']) return json({ ok: false, error: 'Origin not allowed' }, 403, cors);

    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ ok: false, error: 'Expected multipart form data' }, 400, cors);
    }

    const fields = [];
    const files = [];
    let instructions = {};
    let total = 0;
    for (const [name, value] of form) {
      if (fields.length + files.length >= MAX_FIELDS) return json({ ok: false, error: 'Too many fields' }, 413, cors);
      if (typeof value === 'string') {
        if (name.startsWith('_')) instructions[name] = value.slice(0, 500);
        else fields.push([name.slice(0, 300), value.slice(0, MAX_FIELD_LENGTH)]);
      } else if (value.size) {
        total += value.size;
        if (total > MAX_TOTAL_BYTES) return json({ ok: false, error: 'Attachments too large' }, 413, cors);
        files.push({ label: name, file: value });
      }
    }
    if (!fields.length) return json({ ok: false, error: 'Empty form' }, 400, cors);

    try {
      await sendMail(env, {
        subject: (instructions._subject || 'Formulaire du site').replace(/[\r\n]+/g, ' '),
        replyTo: validEmail(instructions._replyto) ? instructions._replyto : null,
        html: renderHtml(fields, files),
        attachments: await Promise.all(files.map(async ({ file }) => ({ name: file.name || 'piece-jointe', content: base64(await file.arrayBuffer()) }))),
      });
    } catch (error) {
      console.error('Brevo send failed:', error.message);
      return json({ ok: false, error: 'Sending failed' }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
  },
};

async function sendMail(env, { subject, replyTo, html, attachments }) {
  const body = {
    sender: { email: env.SENDER_EMAIL, name: env.SENDER_NAME || 'Site q-leap.eu' },
    to: [{ email: env.RECIPIENT }],
    subject,
    htmlContent: html,
  };
  if (replyTo) body.replyTo = { email: replyTo };
  if (attachments.length) body.attachment = attachments;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
}

async function health(env, cors) {
  try {
    const response = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' } });
    return json({ ok: response.ok, brevo: response.status }, response.ok ? 200 : 502, cors);
  } catch {
    return json({ ok: false, brevo: 0 }, 502, cors);
  }
}

// Same layout as the old FormSubmit "table" template: one row per field, files listed at the end.
function renderHtml(fields, files) {
  const rows = fields.map(([name, value]) => `<tr><th style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;color:#555;font-weight:600">${escape(name)}</th><td style="padding:6px 0;white-space:pre-wrap">${linkify(escape(value))}</td></tr>`);
  if (files.length) rows.push(`<tr><th style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;color:#555;font-weight:600">Pièces jointes</th><td style="padding:6px 0">${files.map(({ label, file }) => `${escape(file.name)} (${escape(label)})`).join('<br>')}</td></tr>`);
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><table style="border-collapse:collapse">${rows.join('')}</table></div>`;
}

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((entry) => entry.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type', Vary: 'Origin' } : { Vary: 'Origin' };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function validEmail(value) {
  return typeof value === 'string' && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) && value.length < 255;
}

function escape(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function linkify(text) {
  return text.replace(/https?:\/\/[^\s<]+/g, (link) => `<a href="${link}">${link}</a>`);
}

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
