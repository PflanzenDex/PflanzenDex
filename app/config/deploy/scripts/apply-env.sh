#!/usr/bin/env bash
# Applies settings to the host's config/deploy/.env before deploy.sh runs (TE-19, #1013, US-DEV-06).
# Usage: apply-env.sh [path-to-.env]      (default: ../.env next to this script)
# stdin: one `KEY=value` per line. The deploy workflow sends the values of the GitHub environment this way, so they never
# appear in a command line, in `ps` or in a log.
# Only the given keys are replaced (or appended); every other line, comment and blank stays as it is. Commented-out
# lines (`#KEY=...`) are not touched. Before a change the old file is copied to `.env.bak.<UTC time>` (0600, the
# newest 5 are kept); the new file is written next to it and moved into place (atomic, mode 0600).
# Output: key names and `changed`, `added` or `unchanged` only, never a value.
# Rotation guard: the keys in `init_only` take effect only when the database volume or the realm is created, so a new
# value in .env alone would split it from the database. When the host already has a real value for one of them (not
# empty, not a PUT_A_ placeholder) and the input differs, the script stops without a change, unless
# ALLOW_PASSWORD_ROTATION=1 (runbook "Rotating a password"). DB_OWNER_PASSWORD and KEYCLOAK_DB_PASSWORD are not guarded:
# the one-shots `db-roles` and `keycloak-db` set those role passwords again on every `up` (alter role ... password).
# Exit codes: 0 ok (also with nothing to do), 1 invalid input, refused rotation or failed write (the file is left untouched).
set -euo pipefail
umask 077

fail() { echo "ERROR: apply-env: $1" >&2; exit 1; }

target="${1:-$(dirname "${BASH_SOURCE[0]}")/../.env}"
keep=5
init_only=" POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB KEYCLOAK_ADMIN_USER KEYCLOAK_ADMIN_PASSWORD SMTP_PASSWORD "
rotation="${ALLOW_PASSWORD_ROTATION:-0}"

keys=()
values=()
raw=()
declare -A seen=()
nl=$'\n'

# Reads and validates stdin completely before anything is written.
while IFS= read -r line || [ -n "$line" ]; do
  [ -n "$line" ] || continue
  case "$line" in
    [A-Z]*=*) ;;
    *) fail "invalid input line (expected KEY=value, key in capital letters)" ;;
  esac
  key="${line%%=*}"
  value="${line#*=}"
  [[ "$key" =~ ^[A-Z][A-Z0-9_]{0,63}$ ]] || fail "invalid key name: ${key:0:64}"
  [ -z "${seen[$key]:-}" ] || fail "key given twice: $key"
  [ -n "$value" ] || fail "empty value for $key (an empty value never overwrites)"
  # Control characters (newline, carriage return, tab, ...) and single quotes are refused: the file is sourced by
  # the shell and read by Compose, so they would split the line or end the quoting.
  if [[ "$value" =~ [[:cntrl:]] ]]; then fail "value of $key contains a control character"; fi
  case "$value" in *"'"*) fail "value of $key contains a single quote" ;; esac
  # Compose reads a backslash right before the closing quote as an escaped quote and then fails on the whole file.
  case "$value" in *\\) fail "value of $key ends with a backslash" ;; esac
  [ "${#value}" -le 4096 ] || fail "value of $key is longer than 4096 characters"
  seen[$key]=1
  keys+=("$key")
  raw+=("$value")
  # Plain values stay as they are; anything else (spaces, $, #, ...) is written in single quotes (literal for shell and Compose).
  if [[ "$value" =~ ^[A-Za-z0-9_@%+=:,./~-]+$ ]]; then values+=("$key=$value"); else values+=("$key='$value'"); fi
done

if [ "${#keys[@]}" -eq 0 ]; then echo "apply-env: no keys given, nothing to do"; exit 0; fi

dir="$(dirname "$target")"
[ -d "$dir" ] || fail "folder of the target does not exist: $dir"
if [ -e "$target" ] && [ ! -f "$target" ]; then fail "target is not a regular file: $target"; fi
[ -f "$target" ] || : > "$target"

tmp="$(mktemp "$dir/.env.new.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

declare -A state=()
done_keys=" "
while IFS= read -r existing || [ -n "$existing" ]; do
  replaced=0
  for i in "${!keys[@]}"; do
    k="${keys[$i]}"
    case "$existing" in
      "$k="*)
        replaced=1
        if [[ "$done_keys" == *" $k "* ]]; then break; fi # duplicate definition: the first one wins, later ones are dropped
        if [[ "$init_only" == *" $k "* ]] && [ "$rotation" != 1 ]; then
          current="${existing#*=}"
          if [[ ${#current} -ge 2 && ( ("$current" == \'*\') || ("$current" == \"*\") ) ]]; then current="${current:1:${#current}-2}"; fi
          if [ -n "$current" ] && [[ "$current" != PUT_A_* ]] && [ "$current" != "${raw[$i]}" ]; then
            fail "$k differs from the host value; rotating it needs the rotation steps in docs/guides/operations/staging-deploy-and-backup.md (\"Rotating a password\"), set ALLOW_PASSWORD_ROTATION=1 to override. .env is unchanged."
          fi
        fi
        done_keys+="$k "
        printf '%s\n' "${values[$i]}" >> "$tmp"
        if [ "$existing" = "${values[$i]}" ]; then state[$k]=unchanged; else state[$k]=changed; fi
        break
        ;;
    esac
  done
  [ "$replaced" -eq 1 ] || printf '%s\n' "$existing" >> "$tmp"
done < "$target"

for i in "${!keys[@]}"; do
  k="${keys[$i]}"
  if [ -z "${state[$k]:-}" ]; then
    printf '%s\n' "${values[$i]}" >> "$tmp"
    state[$k]=added
  fi
done

any=0
for k in "${keys[@]}"; do
  echo "apply-env: $k ${state[$k]}"
  [ "${state[$k]}" = unchanged ] || any=1
done

if [ "$any" -eq 0 ] && cmp -s "$tmp" "$target"; then
  echo "apply-env: unchanged, no backup written"
  exit 0
fi

# UTC time with nanoseconds (GNU date): fixed width, so the names sort by age even for runs within one second.
stamp="$(date -u +%Y%m%dT%H%M%S.%NZ)"
backup="$target.bak.$stamp"
[ ! -e "$backup" ] || fail "backup name already exists: $(basename "$backup")"
cp -p "$target" "$backup"
chmod 600 "$backup"
chmod 600 "$tmp"
mv "$tmp" "$target"
trap - EXIT

# Keep the newest $keep backups (the time stamp sorts by name).
mapfile -t backups < <(find "$dir" -maxdepth 1 -name "$(basename "$target").bak.*" | LC_ALL=C sort -r)
for old in "${backups[@]:$keep}"; do rm -f "$old"; done
echo "apply-env: backup written: $(basename "$backup")"
