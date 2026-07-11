#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

required_files=(
  README.md
  SCHEMA.md
  AGENTS.md
  CLAUDE.md
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
  scripts/install-claude-obsidian.sh
  scripts/install-resources.sh
)

for file in "${required_files[@]}"; do
  if [[ ! -s "${repo_root}/${file}" ]]; then
    echo "Missing required seed file: ${file}" >&2
    exit 1
  fi
done

if [[ "${1:-}" == "--force" ]]; then
  bash "${repo_root}/scripts/install-claude-obsidian.sh" --force
  bash "${repo_root}/scripts/link-skills.sh" --force
else
  bash "${repo_root}/scripts/install-claude-obsidian.sh"
  bash "${repo_root}/scripts/link-skills.sh"
fi

echo
echo "Setup complete."
echo
echo "Next steps:"
echo "  bash scripts/config-ui.sh --open"
echo "  Open Automation in the local web UI, then copy the Codex App prompt."
echo
echo "Then ask an agent to use engineering-memory-loader for history or behavior-rule queries."
