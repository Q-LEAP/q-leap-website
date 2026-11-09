// Form relay for q-leap.eu (Cloudflare Worker): the static site posts its forms here (contact,
// training registrations, job applications with their CV) and the relay mails them to the team
// through Brevo's transactional API. Nothing is stored: each request becomes one e-mail.
//
// POST /          multipart form data from assets/js/main.js (initForms). Fields starting with "_"
//                 are instructions, not content: _subject (mail subject), _replyto (visitor's
//                 address, used as Reply-To), and for the automatic reply _autoreply (contact,
//                 training or job), _lang (fr or en) and _topic (training or job title). Files are
//                 attached. Answers {"ok": true} or {"ok": false, "error": "…"}; the site shows its
//                 e-mail fallback on any failure.
//                 Automatic reply: once the team's mail is sent, the visitor gets an acknowledgement
//                 in the page's language (English when unknown), from fixed texts (AUTOREPLIES): only
//                 the training or job title comes from the request, escaped and shortened, so the
//                 relay cannot be used to send someone else's words. A failed acknowledgement is only
//                 logged: the request did reach the team. AUTOREPLY = "off" in [vars] disables it.
// GET  /health    {"ok": true} when Brevo accepts the API key and sees the sender's domain as
//                 authenticated (used by tools/verify/forms_monitor.py).
//
// Settings (wrangler.toml [vars] and secrets): BREVO_API_KEY (secret), RECIPIENT, SENDER_EMAIL,
// SENDER_NAME, ALLOWED_ORIGINS (comma-separated). Swapping Brevo for another provider means
// rewriting sendMail() only.

// Brevo refuses attachments over 4 MB and any extension outside its list: such files are turned
// down here with a clear error (the site then offers the e-mail fallback) rather than by Brevo.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // CV and cover letter together, before base64
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'jpg', 'jpeg', 'png'];
const MAX_FIELDS = 60;
const MAX_FIELD_LENGTH = 10000;
const MAX_TOPIC_LENGTH = 150;

// Acknowledgements sent to the visitor. {topic} = the training or job title (escaped), when known.
const AUTOREPLIES = {
  fr: {
    contact: {
      subject: 'Nous avons bien reçu votre message',
      text: ['Merci pour votre message. Nous l’avons bien reçu et notre équipe vous répondra dans les meilleurs délais.'],
    },
    training: {
      subject: 'Nous avons bien reçu votre demande de formation',
      text: ['Merci pour votre demande concernant la formation <strong>{topic}</strong>. Nous l’avons bien reçue.',
        'Ce message confirme sa réception : notre équipe revient vers vous pour en préciser les détails (session, modalités) et confirmer votre inscription.'],
      textWithoutTopic: ['Merci pour votre demande de formation. Nous l’avons bien reçue.',
        'Ce message confirme sa réception : notre équipe revient vers vous pour en préciser les détails (formation, session, modalités).'],
    },
    job: {
      subject: 'Nous avons bien reçu votre candidature',
      text: ['Merci pour votre candidature au poste <strong>{topic}</strong>. Nous l’avons bien reçue, avec les documents joints.',
        'Notre équipe l’étudie avec attention et reviendra vers vous si votre profil correspond à nos besoins.'],
      textWithoutTopic: ['Merci pour votre candidature spontanée. Nous l’avons bien reçue, avec les documents joints.',
        'Notre équipe l’étudie avec attention et reviendra vers vous si votre profil correspond à nos besoins.'],
    },
    hello: 'Bonjour,',
    signature: 'L’équipe Q-Leap',
    automatic: 'Ce message est envoyé automatiquement. Pour compléter votre demande, répondez simplement à cet e-mail.',
  },
  en: {
    contact: {
      subject: 'We have received your message',
      text: ['Thank you for your message. We have received it and our team will get back to you as soon as possible.'],
    },
    training: {
      subject: 'We have received your training request',
      text: ['Thank you for your request about the <strong>{topic}</strong> training. We have received it.',
        'This message confirms that we received it: our team will get back to you with the details (session, practical information) and to confirm your registration.'],
      textWithoutTopic: ['Thank you for your training request. We have received it.',
        'This message confirms that we received it: our team will get back to you with the details (training, session, practical information).'],
    },
    job: {
      subject: 'We have received your application',
      text: ['Thank you for applying for the <strong>{topic}</strong> position. We have received your application and the attached documents.',
        'Our team will review it carefully and get back to you if your profile matches our needs.'],
      textWithoutTopic: ['Thank you for your unsolicited application. We have received it, along with the attached documents.',
        'Our team will review it carefully and get back to you if your profile matches our needs.'],
    },
    hello: 'Hello,',
    signature: 'The Q-Leap team',
    automatic: 'This message was sent automatically. To add anything to your request, simply reply to this e-mail.',
  },
};

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
        if (value.size > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES) return json({ ok: false, error: 'Attachments too large' }, 413, cors);
        if (!ALLOWED_EXTENSIONS.includes(extension(value.name))) return json({ ok: false, error: 'File type not allowed' }, 415, cors);
        files.push({ label: name, file: value });
      }
    }
    if (!fields.length) return json({ ok: false, error: 'Empty form' }, 400, cors);

    const visitor = validEmail(instructions._replyto) ? instructions._replyto : null;
    try {
      await sendMail(env, {
        to: env.RECIPIENT,
        subject: (instructions._subject || 'Formulaire du site').replace(/[\r\n]+/g, ' '),
        replyTo: visitor,
        html: renderHtml(fields, files),
        attachments: await Promise.all(files.map(async ({ file }) => ({ name: file.name, content: base64(await file.arrayBuffer()) }))),
      });
    } catch (error) {
      console.error('Brevo send failed:', error.message);
      return json({ ok: false, error: 'Sending failed' }, 502, cors);
    }
    const reply = visitor && env.AUTOREPLY !== 'off' && autoreply(instructions);
    if (reply) {
      try {
        await sendMail(env, { to: visitor, subject: reply.subject, replyTo: env.RECIPIENT, html: reply.html, attachments: [] });
      } catch (error) {
        console.error('Brevo autoreply failed:', error.message);
      }
    }
    return json({ ok: true }, 200, cors);
  },
};

async function sendMail(env, { to, subject, replyTo, html, attachments }) {
  const body = {
    sender: { email: env.SENDER_EMAIL, name: to === env.RECIPIENT ? env.SENDER_NAME || 'Site q-leap.eu' : 'Q-Leap' },
    to: [{ email: to }],
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

// The key alone is not enough: q-leap.eu has DMARC p=reject, so until Brevo sees the sender's
// domain as authenticated (brevo-code TXT and DKIM in the zone) every mail it sends is rejected.
async function health(env, cors) {
  const domain = String(env.SENDER_EMAIL).split('@')[1];
  try {
    const response = await fetch(`https://api.brevo.com/v3/senders/domains/${encodeURIComponent(domain)}`,
      { headers: { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' } });
    const result = await response.json().catch(() => ({}));
    const ok = response.ok && result.authenticated === true;
    return json({ ok, brevo: response.status, domain, authenticated: result.authenticated === true }, ok ? 200 : 502, cors);
  } catch {
    return json({ ok: false, brevo: 0, domain, authenticated: false }, 502, cors);
  }
}

// Same layout as the old FormSubmit "table" template: one row per field, files listed at the end.
function renderHtml(fields, files) {
  const rows = fields.map(([name, value]) => `<tr><th style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;color:#555;font-weight:600">${escape(name)}</th><td style="padding:6px 0;white-space:pre-wrap">${linkify(escape(value))}</td></tr>`);
  if (files.length) rows.push(`<tr><th style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;color:#555;font-weight:600">Pièces jointes</th><td style="padding:6px 0">${files.map(({ label, file }) => `${escape(file.name)} (${escape(label)})`).join('<br>')}</td></tr>`);
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><table style="border-collapse:collapse">${rows.join('')}</table></div>`;
}

// The visitor's acknowledgement: fixed text in their language, same look as the site (dark header,
// violet accent), no image so it reads the same with images blocked.
function autoreply(instructions) {
  const texts = AUTOREPLIES[instructions._lang === 'fr' ? 'fr' : 'en'];
  const kind = texts[instructions._autoreply];
  if (!kind || !['contact', 'training', 'job'].includes(instructions._autoreply)) return null;
  const topic = escape(String(instructions._topic || '').replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_TOPIC_LENGTH));
  const paragraphs = topic || !kind.textWithoutTopic ? kind.text.map((line) => line.replace('{topic}', topic)) : kind.textWithoutTopic;
  const p = (html, style = '') => `<p style="margin:0 0 16px;line-height:1.6;${style}">${html}</p>`;
  const html = `<div style="background:#f4f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;margin:0 auto;background:#ffffff;border-collapse:collapse">
<tr><td style="background:#1a1726;padding:18px 28px;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.5px">Q-Leap</td></tr>
<tr><td style="padding:28px">${p(texts.hello)}${paragraphs.map((line) => p(line)).join('')}${p(texts.signature, 'margin-bottom:0')}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e5e5ea;font-size:12px;line-height:1.5;color:#777">${texts.automatic}<br>Q-Leap · 10B, rue des Mérovingiens · L-8070 Bertrange · +352 20 21 17 · <a href="https://q-leap.eu/" style="color:#6d28d9">q-leap.eu</a></td></tr>
</table></div>`;
  return { subject: `${kind.subject} – Q-Leap`, html };
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

function extension(fileName) {
  return /\.([a-z0-9]+)$/i.exec(fileName || '')?.[1].toLowerCase() || '';
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
