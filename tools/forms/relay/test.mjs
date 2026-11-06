// Tests the relay without Cloudflare or Brevo: worker.js runs in Node with Brevo's API simulated.
// Usage: node tools/forms/relay/test.mjs
import assert from 'node:assert/strict';
import worker from './worker.js';

const env = {
  BREVO_API_KEY: 'test-key',
  RECIPIENT: 'digital@q-leap.eu',
  SENDER_EMAIL: 'formulaires@q-leap.eu',
  SENDER_NAME: 'Site q-leap.eu',
  ALLOWED_ORIGINS: 'https://q-leap.eu,https://q-leap.github.io',
};
const SITE = 'https://q-leap.eu';

let sent = [];
let brevo = { send: 201, domain: { status: 200, body: { domain: 'q-leap.eu', verified: true, authenticated: true } } };
globalThis.fetch = async (url, init = {}) => {
  assert.equal(init.headers['api-key'], 'test-key');
  if (url === 'https://api.brevo.com/v3/smtp/email') {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ messageId: '<x@brevo>' }), { status: brevo.send });
  }
  if (url === 'https://api.brevo.com/v3/senders/domains/q-leap.eu') {
    return new Response(JSON.stringify(brevo.domain.body), { status: brevo.domain.status });
  }
  throw new Error(`unexpected fetch ${url}`);
};

const post = (form, origin = SITE) => worker.fetch(new Request('https://relay.test/', { method: 'POST', body: form, headers: { Origin: origin } }), env);
const pdf = (name, size) => new File([new Uint8Array(size).fill(37)], name, { type: 'application/pdf' });
const application = (files) => {
  const form = new FormData();
  form.append('Type de demande', 'Candidature spontanée');
  form.append('Nom', 'Test <b>Lucas</b>');
  form.append('E-mail', 'candidat@example.com');
  form.append('_subject', 'Candidature spontanée\r\nBcc: evil@example.com');
  form.append('_replyto', 'candidat@example.com');
  files.forEach(([label, file]) => form.append(label, file));
  return form;
};
const tests = [];
const test = (name, run) => tests.push([name, run]);

test('application with CV and cover letter: one mail, both attached', async () => {
  const response = await post(application([['CV', pdf('cv.pdf', 300_000)], ['Lettre de motivation', pdf('lettre.pdf', 1000)]]));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.equal(sent.length, 1);
  const [mail] = sent;
  assert.deepEqual(mail.to, [{ email: 'digital@q-leap.eu' }]);
  assert.equal(mail.sender.email, 'formulaires@q-leap.eu');
  assert.equal(mail.subject, 'Candidature spontanée Bcc: evil@example.com', 'no header injection');
  assert.deepEqual(mail.replyTo, { email: 'candidat@example.com' });
  assert.deepEqual(mail.attachment.map((file) => file.name), ['cv.pdf', 'lettre.pdf']);
  assert.equal(Buffer.from(mail.attachment[0].content, 'base64').length, 300_000);
  assert.match(mail.htmlContent, /Test &lt;b&gt;Lucas&lt;\/b&gt;/, 'fields are escaped');
  assert.doesNotMatch(mail.htmlContent, /_subject|_replyto/);
});

test('contact form without file', async () => {
  const form = new FormData();
  form.append('Type de demande', 'Contact général');
  form.append('Message', 'Bonjour');
  form.append('_subject', 'Contact : devis');
  const response = await post(form);
  assert.equal(response.status, 200);
  assert.equal(sent[0].attachment, undefined);
  assert.equal(sent[0].replyTo, undefined);
});

test('CV over 4 MB is refused before Brevo', async () => {
  const response = await post(application([['CV', pdf('cv.pdf', 4 * 1024 * 1024 + 1)]]));
  assert.equal(response.status, 413);
  assert.equal(sent.length, 0);
});

test('file type Brevo would refuse', async () => {
  const response = await post(application([['CV', new File(['x'], 'cv.exe')]]));
  assert.equal(response.status, 415);
  assert.equal(sent.length, 0);
});

test('unknown origin is refused', async () => {
  const response = await post(application([]), 'https://evil.example');
  assert.equal(response.status, 403);
  assert.equal(sent.length, 0);
});

test('Brevo failure becomes a 502 (the site shows its e-mail fallback)', async () => {
  brevo.send = 400;
  const response = await post(application([]));
  brevo.send = 201;
  assert.equal(response.status, 502);
  assert.equal((await response.json()).ok, false);
});

test('preflight', async () => {
  const response = await worker.fetch(new Request('https://relay.test/', { method: 'OPTIONS', headers: { Origin: SITE } }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), SITE);
});

test('health: OK only when the domain is authenticated', async () => {
  const health = () => worker.fetch(new Request('https://relay.test/health'), env);
  assert.equal((await health()).status, 200);
  brevo.domain.body = { domain: 'q-leap.eu', verified: true, authenticated: false };
  const pending = await health();
  assert.equal(pending.status, 502);
  assert.equal((await pending.json()).authenticated, false);
  brevo.domain = { status: 401, body: { code: 'unauthorized' } };
  assert.equal((await health()).status, 502);
  brevo.domain = { status: 200, body: { domain: 'q-leap.eu', verified: true, authenticated: true } };
});

let failed = 0;
for (const [name, run] of tests) {
  sent = [];
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}
console.log(failed ? `${failed} test(s) failed` : `${tests.length} tests passed`);
process.exit(failed ? 1 : 0);
