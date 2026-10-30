#!/usr/bin/env bash
# Image vulnerability scan, report only (#761, NFR-10): Grype over every container image of the stack. Same command
# locally and in the nightly run (FR-QG-01). Findings never fail the run; a scan that cannot run does (P-10).
# Images: every `image:` of the deploy and dev compose files (pulled by Grype itself by their pinned digest) and the two
# images built from this checkout (api; web, whose base is also the proxy's `caddy` stage), handed over as archives.
# Grype gets no Docker socket: it runs pinned by digest, as the calling user, without capabilities.
# Report: app/.cache/image-scan.md (also the job summary in CI).
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
app="$root/app"
cache="$app/.cache"
report="$cache/image-scan.md"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
# Renovate updates the pin (docker manager, `config:best-practices`).
grype_image="anchore/grype:v0.121.0@sha256:621d56d1d68106b787022c81546f7e0a36202a25d1239f0c20195fab8c16f7ea"
mkdir -p "$cache/grype-db"

grype() {
  # The image's /tmp belongs to root; a tmpfs gives the unprivileged user its scratch space.
  docker run --rm --security-opt no-new-privileges:true --cap-drop ALL --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,mode=1777 -e HOME=/tmp -e GRYPE_DB_CACHE_DIR=/db -e GRYPE_CHECK_FOR_APP_UPDATE=false \
    -v "$cache/grype-db:/db" -v "$work:/in:ro" "$grype_image" "$@"
}

mapfile -t images < <(grep -hE '^\s+image: \S+$' "$app"/config/deploy/*.yml "$app"/config/dev/*.yaml |
  sed -E 's/^\s+image: //' | sort -u)
if [ "${#images[@]}" -eq 0 ]; then echo "image-scan: no images found in the compose files" >&2; exit 1; fi

targets=()
for image in "${images[@]}"; do targets+=("registry:$image"); done
for name in api web; do
  docker build --quiet -f "$app/config/deploy/docker/$name.Dockerfile" -t "pflanzendex-scan/$name" "$app" > /dev/null
  docker save "pflanzendex-scan/$name" -o "$work/$name.tar"
  chmod a+r "$work/$name.tar"
  targets+=("docker-archive:/in/$name.tar")
done

grype db update > /dev/null
{
  echo "## Image scan (Grype, report only)"
  echo
  echo "| Image | Critical | High | Medium | Low | Fix available (critical/high) |"
  echo "| --- | ---: | ---: | ---: | ---: | ---: |"
} > "$work/report.md"
details=""
for target in "${targets[@]}"; do
  label="${target#*:}"
  label="${label#/in/}"
  label="${label%%@sha256:*}"
  grype "$target" -o json > "$work/result.json"
  jq -r --arg label "$label" '
    [.matches[] | .vulnerability] as $v
    | def n(s): [$v[] | select(.severity == s)] | length;
    "| `\($label)` | \(n("Critical")) | \(n("High")) | \(n("Medium")) | \(n("Low")) | \([$v[] | select((.severity == "Critical" or .severity == "High") and .fix.state == "fixed")] | length) |"
  ' "$work/result.json" >> "$work/report.md"
  details+="$(jq -r --arg label "$label" '
    .matches[] | select(.vulnerability.severity == "Critical" or .vulnerability.severity == "High")
    | "| `\($label)` | \(.vulnerability.id) | \(.vulnerability.severity) | \(.artifact.name) \(.artifact.version) | \(.vulnerability.fix.versions | join(", ") | if . == "" then "none" else . end) |"
  ' "$work/result.json")"$'\n'
done
{
  echo
  if [ -n "${details//$'\n'/}" ]; then
    echo "### Critical and high findings"
    echo
    echo "| Image | Vulnerability | Severity | Package | Fixed in |"
    echo "| --- | --- | --- | --- | --- |"
    printf '%s' "$details" | sed '/^$/d'
  else
    echo "No critical or high findings."
  fi
  echo
  echo "Scanned with \`${grype_image%%@*}\` on $(date -u +%Y-%m-%d). Reproduce with \`make image-scan\`."
} >> "$work/report.md"
mv "$work/report.md" "$report"
echo "image-scan: report in ${report#"$root"/} (${#targets[@]} images)"
