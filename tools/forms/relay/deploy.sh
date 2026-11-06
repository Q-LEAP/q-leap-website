#!/bin/sh
# Deploys the relay to the Cloudflare account wrangler is logged in to, then writes its address in
# the two places that use it (FORM_ENDPOINT in assets/js/main.js, FORM_RELAY in
# tools/verify/forms_monitor.py) and checks /health. Run it again after any change to worker.js.
# Usage: tools/forms/relay/deploy.sh   (once before: npx wrangler login)
set -e
cd "$(dirname "$0")"
ROOT=../../..

npx wrangler whoami | grep -i -E 'logged in|account name|│' || true
if ! npx wrangler secret list 2>/dev/null | grep -q BREVO_API_KEY; then
  echo "La clé Brevo n'est pas encore enregistrée sur ce Worker : collez-la (rien n'est écrit dans le dépôt)."
  npx wrangler secret put BREVO_API_KEY
fi

npx wrangler deploy | tee deploy.log
URL=$(grep -o 'https://qleap-forms\.[a-z0-9-]*\.workers\.dev' deploy.log | head -1)
rm -f deploy.log
[ -n "$URL" ] || { echo "Adresse du Worker introuvable dans la sortie de wrangler deploy." >&2; exit 1; }

# Replaces the placeholder or a previous address, so the script can be run again safely.
sed -i -E "s#https://qleap-forms\.[A-Za-z0-9_-]+\.workers\.dev/#$URL/#" "$ROOT/assets/js/main.js" "$ROOT/tools/verify/forms_monitor.py"
grep -n "$URL" "$ROOT/assets/js/main.js" "$ROOT/tools/verify/forms_monitor.py"

echo "État du relais ($URL/health) :"
curl -s "$URL/health"; echo
echo '"ok": true  -> prêt : committer main.js et forms_monitor.py, fusionner dans dev, puis faire un vrai envoi de test.'
echo '"authenticated": false -> Brevo ne voit pas encore q-leap.eu comme authentifié (DNS, voir docs/ovh-switch.md).'
