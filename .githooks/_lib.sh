# Shared helpers for the git hooks (US-DEV-02). Enabled by `make hooks` (core.hooksPath=.githooks).
root="$(git rev-parse --show-toplevel)"
app="$root/app"
need_setup() {
  [ -d "$app/node_modules" ] || { echo "hook: app/node_modules is missing. Run: make setup" >&2; exit 1; }
  node "$app/tools/check/supply/check-deps.mjs" || { echo "hook: run: make setup" >&2; exit 1; }
}
