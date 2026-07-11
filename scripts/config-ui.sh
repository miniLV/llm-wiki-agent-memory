#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${PORT:-8765}"
pass_args=()

for arg in "$@"; do
  case "$arg" in
    --port=*)
      port="${arg#--port=}"
      pass_args+=("$arg")
      ;;
    --open)
      ;;
    *)
      pass_args+=("$arg")
      ;;
  esac
done

url="http://127.0.0.1:${port}"

if [[ " $* " == *" --open "* ]]; then
  if command -v open >/dev/null 2>&1; then
    (sleep 1 && open "$url") >/dev/null 2>&1 &
  elif command -v xdg-open >/dev/null 2>&1; then
    (sleep 1 && xdg-open "$url") >/dev/null 2>&1 &
  fi
fi

if [[ "${#pass_args[@]}" -gt 0 ]]; then
  node "${repo_root}/scripts/config-server.mjs" --port="${port}" "${pass_args[@]}"
else
  node "${repo_root}/scripts/config-server.mjs" --port="${port}"
fi
