#!/usr/bin/env bash
# Writes values from the GitHub environment into the host's .env before a deploy (TE-19, #1013, US-DEV-06).
# Usage: deploy.apply-env.sh <deploy-dir> <env-example>   with KEY=VALUE lines on stdin.
#   <deploy-dir>   folder that holds .env (app/config/deploy in the checkout)
#   <env-example>  the .env.example of the commit that is deployed; its keys (`KEY=` or `#KEY=` at the start of a line)
#                  minus the ones on its `# host-only:` line are the allowlist. It is also the template for a new .env.
# The deploy workflow sends the lines over SSH stdin, never as arguments. Every line is checked first; one bad line
# (unknown key, bad name, duplicate, a value with a line break, NUL, other control character, quote or backslash)
# stops the script before anything is written. Only the given keys are set or replaced; other lines and comments stay.
# A change is written atomically (temp file + mv, mode 600) after a timestamped backup .env.bak-<time> (mode 600, the
# newest 5 are kept). The log names keys and changed/added/unchanged, never a value.
# Rotation guard: keys on the template's `# init-only:` line take effect only when the database volume or the realm is
# first created (POSTGRES_PASSWORD, ...). A different value for such a key would split .env from the database, so a
# host value that is set (not empty, not a PUT_A_ placeholder) and differs stops the script, unless
# ALLOW_PASSWORD_ROTATION=1 (after the rotation steps of the runbook). Keys not on that line, such as
# DB_OWNER_PASSWORD and KEYCLOAK_DB_PASSWORD (set again by the one-shots on every `up`), are replaced freely.
# Pure bash builtins handle the values, so no value appears in the arguments of a process (`ps`).
set -euo pipefail
umask 077
export LC_ALL=C

die() {
  echo "apply-env: ERROR: $1 .env is unchanged." >&2
  exit 1
}

[ "$#" -eq 2 ] || die "usage: deploy.apply-env.sh <deploy-dir> <env-example> (values on stdin)."
dir="$1"
example="$2"
[ -d "$dir" ] || die "deploy folder $dir does not exist."
[ -r "$example" ] || die "template $example is not readable."
env_file="$dir/.env"
keep_backups=5

# --- Allowlist from the template ------------------------------------------------------------------------------------
declare -A allowed=()
declare -A host_only=()
declare -A init_only=()
template=()
while IFS= read -r line || [ -n "$line" ]; do
  template+=("$line")
  if [[ $line =~ ^#\ host-only:(.*)$ ]]; then
    for name in ${BASH_REMATCH[1]}; do host_only[$name]=1; done
  elif [[ $line =~ ^#\ init-only:(.*)$ ]]; then
    for name in ${BASH_REMATCH[1]}; do init_only[$name]=1; done
  elif [[ $line =~ ^#?([A-Z][A-Z0-9_]*)= ]]; then
    allowed[${BASH_REMATCH[1]}]=1
  fi
done < "$example"
for name in "${!host_only[@]}"; do unset "allowed[$name]"; done
[ "${#allowed[@]}" -gt 0 ] || die "template $example names no keys."

# --- Read and check stdin -------------------------------------------------------------------------------------------
# `read -d ''` stops at the first NUL byte and returns 0 only when it found one.
payload=""
if IFS= read -r -d '' payload; then die "the input contains a NUL byte."; fi

declare -A value_of=()
keys=()
while IFS= read -r line; do
  [ -n "$line" ] || continue
  [[ $line == *=* ]] || die "an input line has no '='."
  key="${line%%=*}"
  value="${line#*=}"
  [[ $key =~ ^[A-Z][A-Z0-9_]*$ ]] || die "an input key is not of the form [A-Z][A-Z0-9_]*."
  [ -n "${allowed[$key]:-}" ] || die "$key is not on the allowlist (keys of .env.example without host-only)."
  [ -z "${value_of[$key]+set}" ] || die "$key is given twice."
  [ -n "$value" ] || die "$key has an empty value (empty GitHub values are never sent)."
  [[ $value != *[[:cntrl:]]* ]] || die "the value of $key contains a line break or another control character."
  [[ $value != *\'* && $value != *\\* ]] || die "the value of $key contains a quote (') or a backslash, which .env cannot hold the same way for the shell and docker compose."
  value_of[$key]="$value"
  keys+=("$key")
done <<< "$payload"

if [ "${#keys[@]}" -eq 0 ]; then
  echo "apply-env: no values from the GitHub environment; .env is unchanged."
  exit 0
fi

# One rendering that `set -a; . ./.env` and docker compose `--env-file` read the same: plain when the value has only
# safe characters, otherwise in single quotes (both take the content literally: no `$` expansion, no escapes, `#` and
# spaces kept). Quotes and backslashes were refused above.
render() {
  if [[ $2 =~ ^[A-Za-z0-9_./:@,+=%-]+$ ]]; then
    printf -v rendered '%s=%s' "$1" "$2"
  else
    printf -v rendered "%s='%s'" "$1" "$2"
  fi
}

# --- Merge --------------------------------------------------------------------------------------------------------
created=0
lines=()
if [ -f "$env_file" ]; then
  while IFS= read -r line || [ -n "$line" ]; do lines+=("$line"); done < "$env_file"
else
  created=1
  lines=("${template[@]}")
fi

# The value of an existing line, without one pair of surrounding quotes.
host_value() {
  local v="${1#*=}"
  if [[ ${#v} -ge 2 && ( ($v == \'*\' ) || ($v == \"*\") ) ]]; then v="${v:1:${#v}-2}"; fi
  current="$v"
}

rotation="${ALLOW_PASSWORD_ROTATION:-}"
declare -A status=()
for key in "${keys[@]}"; do
  render "$key" "${value_of[$key]}"
  found=0
  for i in "${!lines[@]}"; do
    if [[ ${lines[$i]} == "$key="* ]]; then
      found=1
      host_value "${lines[$i]}"
      if [ "$current" = "${value_of[$key]}" ]; then
        status[$key]="${status[$key]:-unchanged}"
        continue
      fi
      if [ -n "${init_only[$key]:-}" ] && [ -n "$current" ] && [[ $current != PUT_A_* ]] && [ "$rotation" != 1 ]; then
        die "$key differs from the host value; rotating it needs the rotation steps in docs/guides/operations/staging-deploy-and-backup.md (\"Rotating a password\"), set ALLOW_PASSWORD_ROTATION=1 to override."
      fi
      lines[i]="$rendered"
      status[$key]=changed
    fi
  done
  if [ "$found" -eq 0 ]; then
    if [ -z "${appended:-}" ]; then
      lines+=("" "# --- Set by the deploy workflow from the GitHub environment (deploy.apply-env.sh) ---")
      appended=1
    fi
    lines+=("$rendered")
    status[$key]=added
  fi
done

changes=0
for key in "${keys[@]}"; do
  echo "apply-env: $key ${status[$key]}"
  [ "${status[$key]}" = unchanged ] || changes=$((changes + 1))
done

if [ "$changes" -eq 0 ] && [ "$created" -eq 0 ]; then
  chmod 600 "$env_file"
  echo "apply-env: ${#keys[@]} key(s), nothing changed; .env is unchanged."
  exit 0
fi

# --- Backup and atomic write -------------------------------------------------------------------------------------------
if [ "$created" -eq 0 ]; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup="$dir/.env.bak-$stamp"
  n=1
  while [ -e "$backup" ]; do backup="$dir/.env.bak-$stamp-$n"; n=$((n + 1)); done
  cp "$env_file" "$backup"
  chmod 600 "$backup"
  echo "apply-env: backup ${backup##*/}"
  # Keep the newest $keep_backups (the names sort by time).
  old=()
  for f in "$dir"/.env.bak-*; do [ -e "$f" ] && old+=("$f"); done
  while [ "${#old[@]}" -gt "$keep_backups" ]; do
    rm -f -- "${old[0]}"
    old=("${old[@]:1}")
  done
fi

tmp="$(mktemp "$dir/.env.tmp.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
printf '%s\n' "${lines[@]}" > "$tmp"
chmod 600 "$tmp"
mv -f -- "$tmp" "$env_file"
trap - EXIT

if [ "$created" -eq 1 ]; then echo "apply-env: .env was missing; created from the template."; fi
# Placeholders of the template that are still active lines: name them, the deploy would run with them.
left=()
for line in "${lines[@]}"; do
  if [[ $line =~ ^([A-Z][A-Z0-9_]*)=.*PUT_A_ ]]; then left+=("${BASH_REMATCH[1]}"); fi
done
if [ "${#left[@]}" -gt 0 ]; then
  echo "apply-env: WARNING: still a placeholder from .env.example: ${left[*]}" >&2
fi
echo "apply-env: $changes key(s) written to .env."
