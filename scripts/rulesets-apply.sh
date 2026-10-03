#!/usr/bin/env bash
# Rulesets als Code (FR-QG-02, FR-DEV-02, ADR 0001): `.github/rulesets/*.json` ist die Wahrheit, GitHub der Abzug.
# Aufruf: scripts/rulesets-apply.sh            wendet alle Dateien an (anlegen oder per Name aktualisieren)
#         scripts/rulesets-apply.sh --check    vergleicht nur und endet mit 1 bei Abweichung (Drift)
# Braucht `gh` mit Admin-Rechten am Repo und `jq`.
set -euo pipefail

repo="${GITHUB_REPOSITORY:-PflanzenDex/PflanzenDex}"
root="$(git rev-parse --show-toplevel)"
mode="${1:-apply}"
# Felder, die GitHub selbst ergänzt oder normalisiert; sie zählen beim Vergleich nicht.
normalize='{name,target,enforcement,conditions,bypass_actors,rules} | walk(if type == "array" then sort_by(tostring) else . end)'

live="$(gh api "repos/$repo/rulesets" --jq '.[] | "\(.name)\t\(.id)"')"
drift=0
for file in "$root"/.github/rulesets/*.json; do
  name="$(jq -r .name "$file")"
  id="$(awk -F'\t' -v n="$name" '$1 == n { print $2 }' <<<"$live")"
  if [ "$mode" = "--check" ]; then
    if [ -z "$id" ]; then echo "rulesets: fehlt auf GitHub: $name"; drift=1; continue; fi
    if ! diff <(jq -S "$normalize" "$file") <(gh api "repos/$repo/rulesets/$id" | jq -S "$normalize") >/dev/null; then
      echo "rulesets: Abweichung bei $name (Datei: ${file#"$root"/})"; drift=1
    fi
  elif [ -n "$id" ]; then
    gh api -X PUT "repos/$repo/rulesets/$id" --input "$file" --jq '"rulesets: aktualisiert \(.name)"'
  else
    gh api -X POST "repos/$repo/rulesets" --input "$file" --jq '"rulesets: angelegt \(.name)"'
  fi
done
[ "$mode" != "--check" ] || { [ "$drift" = 0 ] && echo "rulesets: keine Abweichung"; exit "$drift"; }
