# Form relay (Cloudflare Worker + Brevo)

The site is static (GitHub Pages) and cannot send e-mail. Its forms (contact, training
registrations, job applications with a CV) post to this small Worker, which turns each request into
one e-mail to `digital@q-leap.eu` through Brevo's transactional API. Nothing is stored.

- `worker.js`: the relay. `POST /` sends, `GET /health` checks that Brevo accepts the key.
- `wrangler.toml`: name, recipient, sender, allowed origins.
- The site side is `initForms()` in `assets/js/main.js` (`FORM_ENDPOINT`); the hourly check is
  `tools/verify/forms_monitor.py`. Both keep working if the provider changes: only `sendMail()` in
  `worker.js` knows about Brevo.

## Automatic reply

Once the team's mail is sent, the visitor (the form's e-mail field) gets an acknowledgement from
`bot@q-leap.eu` (« Q-Leap »), in the page's language: French on French pages, English otherwise.
The site tells the relay which form it is (`_autoreply`: contact, training or job), the language
(`_lang`) and the training or job title (`_topic`). The texts are fixed, in `AUTOREPLIES` at the
top of `worker.js` (edit them there, then redeploy): only the title comes from the request, escaped
and cut at 150 characters, so nobody can use the relay to send their own words to someone else.
Replying to the acknowledgement reaches `RECIPIENT`. If it fails, the request still counts as sent
(the team has it). `AUTOREPLY = "off"` in `[vars]` turns it off.

## Setup (once)

1. Brevo: a free account for Q-Leap (check first whether one exists: q-leap.eu's SPF already
   includes `spf.sendinblue.com`). Senders, domains & dedicated IPs > Domains > add `q-leap.eu`.
2. DNS: Brevo shows a `brevo-code` TXT and two DKIM CNAMEs. Paste them, uncommented, in
   `tools/dns/brevo.txt`: `tools/dns/make_zone.sh` adds them to the OVH zone and
   `tools/dns/compare.sh` checks them. q-leap.eu has DMARC `p=reject`: without them every mail is
   rejected. Brevo validates the domain only once it can read them, i.e. once the zone served for
   q-leap.eu holds them (OVH after the switch, or WordPress.com > Domains > DNS records before it).
3. Brevo: the sender (`SENDER_EMAIL` of `wrangler.toml`, `bot@q-leap.eu`) must be a verified
   sender (it is); SMTP & API > API keys > create a key named `qleap-forms`.
4. Deploy: `npx wrangler login` (the Q-Leap Cloudflare account), then
   `tools/forms/relay/deploy.sh`. It asks for the Brevo key the first time (stored as a Worker
   secret, never in the repository), deploys, writes the Worker's address in `FORM_ENDPOINT`
   (main.js) and `FORM_RELAY` (forms_monitor.py), and prints `/health`.
5. `/health` answers `"ok": true` once Brevo accepts the key and sees q-leap.eu as authenticated.
   Then commit the two files, merge into `dev`, and send one real test of each form.

## Tests

`node tools/forms/relay/test.mjs`: the Worker in Node with Brevo simulated (attachments, header
injection, size and type limits, origins, Brevo failure, health). No account needed.

## Limits

Brevo free plan: 300 e-mails a day, i.e. about 150 forms with their acknowledgement. Attachments: PDF, Word, ODT, RTF, TXT, JPEG or PNG, 4 MB per
file (Brevo's limit) and 8 MB per form; beyond that the site offers the e-mail fallback right away
(CV attached by hand). Only the origins listed in `ALLOWED_ORIGINS` (and localhost) may post.
