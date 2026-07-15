#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
force=0
full=0
non_interactive=0
json_mode=0

usage() {
  cat <<'USAGE'
Usage: bash scripts/setup.sh [--full] [--non-interactive] [--json] [--force]

  --full             Install all local resources, link the Codex query skill,
                     and confirm the default Codex and Claude session sources.
  --non-interactive  Never open an application or download page.
  --json             Emit one machine-readable result to stdout.
  --force            Refresh managed links and dependency checkouts when safe.

Codex App automations are intentionally created by the setup skill with the
official automation-management tool, not by this shell script.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full)
      full=1
      shift
      ;;
    --non-interactive)
      non_interactive=1
      shift
      ;;
    --json)
      json_mode=1
      shift
      ;;
    --force)
      force=1
      shift
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

required_files=(
  README.md
  SCHEMA.md
  AGENTS.md
  CLAUDE.md
  .agent/skills/agent-memory-setup/SKILL.md
  .agent/skills/agent-memory-uninstall/SKILL.md
  .agent/skills/ai-session-wiki-ingest/SKILL.md
  .agent/skills/agent-memory-reconcile/SKILL.md
  .agent/skills/engineering-memory-loader/SKILL.md
  wiki/index.md
  wiki/log.md
  "wiki/guardrails/Agent Behavior Rules.md"
  "wiki/templates/Daily AI Chat Summary Template.md"
  scripts/config-server.mjs
  scripts/config-ui.sh
  scripts/capture-ai-chats.mjs
  scripts/daily-memory-workflow.mjs
  scripts/install-claude-obsidian.sh
  scripts/install-resources.sh
  scripts/link-skills.sh
  scripts/uninstall.sh
)

failures=()
for file in "${required_files[@]}"; do
  if [[ ! -s "${repo_root}/${file}" ]]; then
    failures+=("Missing required seed file: ${file}")
  fi
done
for command in node git bash; do
  if ! command -v "$command" >/dev/null 2>&1; then
    failures+=("Missing required command: ${command}")
  fi
done
if [[ ! -w "$repo_root" ]]; then
  failures+=("Repository is not writable: ${repo_root}")
fi
codex_root="${CODEX_HOME:-${HOME}/.codex}"
if [[ -e "$codex_root" ]]; then
  if [[ ! -w "$codex_root" ]]; then
    failures+=("Codex home is not writable: ${codex_root}")
  fi
elif [[ ! -w "${HOME}" ]]; then
  failures+=("Home directory is not writable: ${HOME}")
fi

if [[ "${#failures[@]}" -gt 0 ]]; then
  echo "Setup prerequisites missing:" >&2
  printf '  - %s\n' "${failures[@]}" >&2
  exit 1
fi

mkdir -p \
  "${repo_root}/.agent/skills/ai-session-wiki-ingest" \
  "${repo_root}/.agent/skills/agent-memory-reconcile" \
  "${repo_root}/.agent/skills/engineering-memory-loader" \
  "${repo_root}/scripts" \
  "${repo_root}/wiki/sources/ai-chats" \
  "${repo_root}/wiki/concepts" \
  "${repo_root}/wiki/guardrails" \
  "${repo_root}/wiki/templates" \
  "${repo_root}/.vault-meta/captures/ai-chats" \
  "${repo_root}/.vault-meta/reviews" \
  "${repo_root}/examples"

touch "${repo_root}/.vault-meta/reviews/Agent Memory Reconcile Reviews.md"

run_step() {
  if [[ "$json_mode" -eq 1 ]]; then
    "$@" >&2
  else
    "$@"
  fi
}

if [[ "$full" -eq 1 ]]; then
  resource_args=("${repo_root}/scripts/install-resources.sh" install-all)
  [[ "$force" -eq 1 ]] && resource_args+=(--force)
  [[ "$non_interactive" -eq 1 ]] && resource_args+=(--non-interactive)
  run_step bash "${resource_args[@]}"
  run_step bash "${repo_root}/scripts/link-skills.sh" --force --prune --agents codex
else
  dependency_args=("${repo_root}/scripts/install-claude-obsidian.sh")
  link_args=("${repo_root}/scripts/link-skills.sh")
  if [[ "$force" -eq 1 ]]; then
    dependency_args+=(--force)
    link_args+=(--force)
  fi
  run_step bash "${dependency_args[@]}"
  run_step bash "${link_args[@]}"
fi

config_path="${repo_root}/.vault-meta/config.json"
if [[ "$full" -eq 1 ]]; then
  node - "$config_path" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const configPath = process.argv[2];
let current = {};
try {
  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) current = parsed;
} catch {}
const next = {
  ...current,
  codexSourcesEnabled: true,
  claudeSourcesEnabled: true,
  sourcesConfirmed: true,
  memorySkillCodexEnabled: true,
  memorySkillClaudeEnabled: false,
};
fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
NODE
fi

if [[ "$json_mode" -eq 1 ]]; then
  resources_json="$(bash "${repo_root}/scripts/install-resources.sh" status --json)"
  node - "$repo_root" "$config_path" "$resources_json" "$codex_root" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [repoRoot, configPath, resourcesJson, codexRoot] = process.argv.slice(2);
const skillPath = path.join(codexRoot, "skills", "engineering-memory-loader");
let memorySkillRealTarget = "";
try { memorySkillRealTarget = fs.realpathSync(skillPath); } catch {}
let config = {};
try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch {}
process.stdout.write(JSON.stringify({
  ok: true,
  mode: "full-local-setup",
  repoRoot,
  configPath,
  config,
  resources: JSON.parse(resourcesJson),
  memorySkill: {
    path: skillPath,
    realTarget: memorySkillRealTarget,
    ready: fs.existsSync(path.join(skillPath, "SKILL.md")),
  },
  automations: {
    managedBy: "Codex automation-management tool",
    installedByThisCommand: false,
  },
}, null, 2));
NODE
else
  echo
  echo "Local setup complete."
  if [[ "$full" -eq 1 ]]; then
    echo "The Agent must now create or update the Daily and Weekly Codex App automations."
  else
    echo "Run a full Agent setup to configure sources and Codex App automations."
  fi
fi
