#!/bin/zsh
# Run every scripts/*.test.ts and refuse to call a silent suite a passing one.
#
# The reason this exists: when the resolve hook stopped registering, eight suites
# began crashing before their first assertion. They printed a stack trace and no
# summary — and every ad-hoc "grep for N passed" loop treated that as nothing to
# report. A suite that does not run must be as loud as a suite that fails, so this
# insists on a summary line from each one and reports a total to compare against.
setopt NULL_GLOB
cd "${0:A:h}/.."

typeset -i suites=0 assertions=0 broken=0
typeset -a bad

for t in scripts/*.test.ts; do
  name="${t:t:r}"                                   # e.g. chain.test
  out=$(node --import ./scripts/ts-ext-hook.mjs "$t" 2>&1)
  code=$?
  # the prefix is conventional, not required — a suite must not be skipped over a
  # cosmetic difference in how it announces itself, only over announcing nothing
  line=$(print -r -- "$out" | grep -E "^(${name}: )?[0-9]+ passed, [0-9]+ failed$" | tail -1)

  if [[ -z "$line" ]]; then
    printf "  %-30s NO SUMMARY (exit %d) — the suite did not run\n" "$name" $code
    print -r -- "$out" | grep -E "Error|error:" | head -3 | sed 's/^/      /'
    bad+=("$name"); (( broken++ )); continue
  fi

  passed=${${line##*: }%% passed*}
  failed=${${line##*, }%% failed*}
  (( assertions += passed )); (( suites++ ))
  if (( failed > 0 || code != 0 )); then
    printf "  %-30s %s  ✗\n" "$name" "$line"
    print -r -- "$out" | grep -E "^(FAIL|✗)" | head -8 | sed 's/^/      /'
    bad+=("$name"); (( broken++ ))
  else
    printf "  %-30s %d passed\n" "$name" $passed
  fi
done

print -- "─────────────────────────────────────────────"
printf "%d suites, %d assertions\n" $suites $assertions
if (( broken )); then
  print -- "FAILED: ${bad}"
  exit 1
fi
print -- "all green"
