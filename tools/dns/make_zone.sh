#!/bin/sh
# Builds the OVH zone of q-leap.eu: the records of WordPress.com (records.txt, values read live
# from ns1.wordpress.com) with the web pointed at GitHub Pages. Dropped on purpose:
# the WordPress A records, "* CNAME q-leap.eu" (a wildcard on GitHub Pages lets any subdomain
# be claimed) and _domainconnect (WordPress.com only). Each record keeps its WordPress.com TTL
# (internal: 300 s). The web records get 300 s, so a correction spreads within minutes.
# Brevo's records (brevo.txt, copied from Brevo) are added at the end.
# Usage: tools/dns/make_zone.sh > zone.txt
cd "$(dirname "$0")"
SERVER=${1:-ns1.wordpress.com}
cat <<'ZONE'
@                                              300   IN A      185.199.108.153
@                                              300   IN A      185.199.109.153
@                                              300   IN A      185.199.110.153
@                                              300   IN A      185.199.111.153
@                                              300   IN AAAA   2606:50c0:8000::153
@                                              300   IN AAAA   2606:50c0:8001::153
@                                              300   IN AAAA   2606:50c0:8002::153
@                                              300   IN AAAA   2606:50c0:8003::153
www                                            300   IN CNAME  q-leap.github.io.
ZONE
grep -v '^#' records.txt | while read -r name type; do
  [ -z "$name" ] && continue
  [ "$name" = www ] && continue
  fqdn=$([ "$name" = @ ] && echo q-leap.eu || echo "$name.q-leap.eu")
  answer=$(dig +noall +answer "$fqdn" "$type" @"$SERVER")
  [ -z "$answer" ] && { echo "MISSING $name $type" >&2; continue; }
  printf '%s\n' "$answer" | while read -r _ ttl _ _ value; do
    printf '%-46s %-5s IN %-6s %s\n' "$name" "$ttl" "$type" "$value"
  done
done
grep -v '^#' brevo.txt | grep -v '^ *$' || true
