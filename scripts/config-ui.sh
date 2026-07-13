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

if command -v lsof >/dev/null 2>&1; then
  listener_pid="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "$listener_pid" ]]; then
    listener_command="$(ps -p "$listener_pid" -o command= 2>/dev/null || true)"
    listener_cwd="$(lsof -a -p "$listener_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)"
    if [[ "$listener_command" == *"${repo_root}/scripts/config-server.mjs"* ||
          ( "$listener_cwd" == "$repo_root" && "$listener_command" == *"scripts/config-server.mjs"* ) ]]; then
      echo "Agent Memory Control is already running at ${url}; reusing it."
      if [[ " $* " == *" --open "* ]]; then
        if command -v open >/dev/null 2>&1; then
          open "$url"
        elif command -v xdg-open >/dev/null 2>&1; then
          xdg-open "$url"
        fi
      fi
      exit 0
    fi
    echo "Port ${port} is already in use by another process (PID ${listener_pid})." >&2
    echo "Stop that process or choose another port with --port=<port>." >&2
    exit 1
  fi
fi

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
