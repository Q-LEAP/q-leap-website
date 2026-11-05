# Form relay (Cloudflare Worker + Brevo)

The site is static (GitHub Pages) and cannot send e-mail. Its forms (contact, training
registrations, job applications with a CV) post to this small Worker, which turns each request into
one e-mail to `digital@q-leap.eu` through Brevo's transactional API. Nothing is stored.

- `worker.js`: the relay. `POST /` sends, `GET /health` checks that Brevo accepts the key.
- `wrangler.toml`: name, recipient, sender, allowed origins.
- The site side is `initForms()` in `assets/js/main.js` (`FORM_ENDPOINT`); the hourly check is
  `tools/verify/forms_monitor.py`. Both keep working if the provider changes: only `sendMail()` in
  `worker.js` knows about Brevo.

## Setup (once)

1. Brevo: a free account for Q-Leap. Senders, domains & dedicated IPs > Domains > add `q-leap.eu`
   and add the records Brevo shows (a `brevo-code` TXT and two DKIM CNAMEs) to the DNS zone.
   q-leap.eu has DMARC `p=reject`: without this authentication every mail would be rejected.
   SPF already includes Brevo (`include:spf.sendinblue.com`).
2. Brevo: SMTP & API > API keys > create a key named `qleap-forms`.
3. Deploy, from this folder:
   ```
   npx wrangler login
   npx wrangler secret put BREVO_API_KEY
   npx wrangler deploy
   ```
   The Worker answers at `https://qleap-forms.<account>.workers.dev`: put that address in
   `FORM_ENDPOINT` (main.js) and `FORM_RELAY` (forms_monitor.py).

## Limits

Brevo free plan: 300 e-mails a day. Attachments: 8 MB in total per form (checked here); Brevo's own
limit applies on top. Only the origins listed in `ALLOWED_ORIGINS` (and localhost) may post.
