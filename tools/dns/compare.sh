#!/bin/sh
# Compares every record of records.txt on WordPress.com and on another server (the OVH zone):
# identical values print "ok". Usage: tools/dns/compare.sh dnsXX.ovh.net
cd "$(dirname "$0")"
OTHER=$1
fail=0
grep -v '^#' records.txt | while read -r name type; do
  [ -z "$name" ] && continue
  [ "$name" = www ] && continue
  fqdn=$([ "$name" = @ ] && echo q-leap.eu || echo "$name.q-leap.eu")
  a=$(dig +short "$fqdn" "$type" @ns1.wordpress.com | sort | tr '[:upper:]' '[:lower:]')
  b=$(dig +short "$fqdn" "$type" @"$OTHER" | sort | tr '[:upper:]' '[:lower:]')
  if [ "$a" = "$b" ]; then echo "ok    $name $type"; else echo "DIFF  $name $type"; echo "  wp:  $a"; echo "  ovh: $b"; fi
done
for check in "q-leap.eu A" "q-leap.eu AAAA" "www.q-leap.eu CNAME"; do
  set -- $check
  echo "web   $1 $2: $(dig +short "$1" "$2" @"$OTHER" | tr '\n' ' ')"
done
