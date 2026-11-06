#!/usr/bin/env bash
# Pinned check tools without an npm package (gitleaks). Prints the path to the binary.
# actionlint is not here: tools/lint/actionlint.sh runs its pinned Docker image, which ships shellcheck (FR-QG-01).
# Uses the binary from PATH if it has the pinned version; otherwise downloads it to .cache/tools/ and verifies the checksum.
# Usage: bin="$(tools/lint/tool.sh gitleaks)"
set -euo pipefail

name="${1:?usage: $0 <gitleaks>}"
root="$(git rev-parse --show-toplevel)"
platform="$(uname -s)_$(uname -m)"

# Tool, version, platform -> asset suffix and SHA-256 from the project's official checksums file.
case "$name:$platform" in
  gitleaks:Linux_x86_64) v=8.30.1 a=linux_x64 s=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb ;;
  gitleaks:Linux_aarch64) v=8.30.1 a=linux_arm64 s=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080 ;;
  gitleaks:Darwin_x86_64) v=8.30.1 a=darwin_x64 s=dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709 ;;
  gitleaks:Darwin_arm64) v=8.30.1 a=darwin_arm64 s=b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5 ;;
  *) echo "tool: no pinned $name for $platform; please install it yourself" >&2; exit 1 ;;
esac
case "$name" in
  gitleaks) url="https://github.com/gitleaks/gitleaks/releases/download/v$v/gitleaks_${v}_$a.tar.gz" ;;
esac

if command -v "$name" >/dev/null && "$name" --version 2>/dev/null | grep -q "$v"; then command -v "$name"; exit 0; fi

dir="$root/.cache/tools/$name-$v"
if [ ! -x "$dir/$name" ]; then
  mkdir -p "$dir"
  tgz="$dir/$name.tar.gz"
  curl -fsSL -o "$tgz" "$url"
  if command -v sha256sum >/dev/null; then actual="$(sha256sum "$tgz" | cut -d' ' -f1)"; else actual="$(shasum -a 256 "$tgz" | cut -d' ' -f1)"; fi
  [ "$actual" = "$s" ] || { rm -f "$tgz"; echo "tool: checksum mismatch for $name, aborting" >&2; exit 1; }
  tar -xzf "$tgz" -C "$dir" "$name" && rm -f "$tgz"
fi
echo "$dir/$name"
