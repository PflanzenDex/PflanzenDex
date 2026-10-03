# Gemeinsame Helfer der Git-Hooks (US-DEV-02). Aktiviert durch `make hooks` (core.hooksPath=.githooks).
root="$(git rev-parse --show-toplevel)"
app="$root/app"
need_setup() {
  [ -d "$app/node_modules" ] || { echo "Hook: app/node_modules fehlt. Bitte zuerst: make setup" >&2; exit 1; }
}
