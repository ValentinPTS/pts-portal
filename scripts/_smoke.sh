#!/bin/zsh
# Before/after harness for the cleanup: every document, every page, hashed.
# Usage: ./scripts/_smoke.sh <port> <outfile>
PORT="${1:-3900}"; OUT="${2:-/tmp/smoke.txt}"
CURL=$(command -v curl)
DOCS="order plan stat-project invitation application registered registered-coded declaration protocol instruction results results-coded report certificate feedback"
PAGES="/ /files/testing /files/calibration /skins /skins/new /items /activity /users /apply /register /login
/schemes/26-01-T-1 /schemes/26-01-T-1/edit /schemes/26-01-T-1/participants /schemes/26-01-T-1/results
/schemes/26-01-T-1/traceability /schemes/26-01-T-1/applications /schemes/26-01-T-1/audit-pack
/schemes/26-01-T-1/build/plan /schemes/26-01-T-1/fill/declaration /schemes/26-01-T-1/doc/registered
/schemes/25-06-C-1 /schemes/25-06-C-1/edit /schemes/25-06-C-1/results /schemes/25-06-C-1/participants"

: > "$OUT"
for s in 26-01-T-1 25-06-C-1; do
  for d in ${=DOCS}; do
    for l in bg en; do
      u="http://localhost:$PORT/schemes/$s/doc/$d/print?lang=$l"
      code=$("$CURL" -s -o /tmp/_b -w "%{http_code}" --max-time 60 "$u")
      h=$(shasum -a 256 /tmp/_b | cut -c1-16)
      printf "doc  %-11s %-17s %s %s %s\n" "$s" "$d" "$l" "$code" "$h" >> "$OUT"
    done
  done
done
for p in ${=PAGES}; do
  code=$("$CURL" -s -o /tmp/_b -w "%{http_code}" --max-time 60 "http://localhost:$PORT$p")
  printf "page %-52s %s\n" "$p" "$code" >> "$OUT"
done
echo "$(wc -l < "$OUT" | tr -d ' ') checks -> $OUT"
bad=$(grep -vE "(^doc .* (200|30[0-9]) [0-9a-f]+$)|(^page .* (200|30[0-9])$)" "$OUT")
if [ -z "$bad" ]; then echo "  all ok"; else echo "$bad" | sed 's/^/  BAD: /'; fi
