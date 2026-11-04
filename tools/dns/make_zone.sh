#!/bin/sh
# Builds the OVH zone of q-leap.eu: the records of WordPress.com (records.txt, values read live
# from ns1.wordpress.com) with the web pointed at GitHub Pages. Dropped on purpose:
# the WordPress A records, "* CNAME q-leap.eu" (a wildcard on GitHub Pages lets any subdomain
# be claimed) and _domainconnect (WordPress.com only). Usage: tools/dns/make_zone.sh > zone.txt
cd "$(dirname "$0")"
SERVER=${1:-ns1.wordpress.com}
cat <<'ZONE'
@                     IN A      185.199.108.153
@                     IN A      185.199.109.153
@                     IN A      185.199.110.153
@                     IN A      185.199.111.153
@                     IN AAAA   2606:50c0:8000::153
@                     IN AAAA   2606:50c0:8001::153
@                     IN AAAA   2606:50c0:8002::153
@                     IN AAAA   2606:50c0:8003::153
www                   IN CNAME  q-leap.github.io.
ZONE
grep -v '^#' records.txt | while read -r name type; do
  [ -z "$name" ] && continue
  [ "$name" = www ] && continue
  fqdn=$([ "$name" = @ ] && echo q-leap.eu || echo "$name.q-leap.eu")
  dig +short "$fqdn" "$type" @"$SERVER" | while read -r value; do
    [ -z "$value" ] && { echo "MISSING $name $type" >&2; continue; }
    printf '%-46s IN %-6s %s\n' "$name" "$type" "$value"
  done
done
