#!/usr/bin/env bash
set -euo pipefail

force=0
agents="codex"
prune=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      force=1
      shift
      ;;
    --prune)
      prune=1
      shift
      ;;
    --agents)
      agents="${2:?Missing value for --agents}"
      shift 2
      ;;
    --agents=*)
      agents="${1#--agents=}"
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: bash scripts/link-skills.sh [--force] [--prune] [--agents codex,claude]" >&2
      exit 2
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
claude_obsidian_root="${repo_root}/.agent/external/claude-obsidian/skills"
if [[ ! -f "${claude_obsidian_root}/wiki-query/SKILL.md" ]]; then
  echo "Missing repo-local wiki-query skill: ${claude_obsidian_root}/wiki-query/SKILL.md" >&2
  echo "Run: bash scripts/install-claude-obsidian.sh" >&2
  exit 1
fi

skills=(
  engineering-memory-loader
)

target_root_for_agent() {
  case "$1" in
    codex) echo "${HOME}/.codex/skills" ;;
    claude) echo "${HOME}/.claude/skills" ;;
    *)
      echo "Unsupported agent: $1" >&2
      echo "Supported agents: codex, claude" >&2
      exit 2
      ;;
  esac
}

IFS=',' read -r -a agent_list <<< "$agents"
supported_agents=(codex claude)

agent_selected() {
  local wanted="$1"
  for selected in "${agent_list[@]}"; do
    selected="$(echo "$selected" | xargs)"
    if [[ "$selected" == "$wanted" ]]; then
      return 0
    fi
  done
  return 1
}

if [[ "$prune" -eq 1 ]]; then
  for agent in "${supported_agents[@]}"; do
    if agent_selected "$agent"; then
      continue
    fi
    target_root="$(target_root_for_agent "$agent")"
    for skill in "${skills[@]}"; do
      src="${repo_root}/.agent/skills/${skill}"
      dest="${target_root}/${skill}"
      if [[ -L "$dest" && "$(readlink "$dest")" == "$src" ]]; then
        rm "$dest"
        echo "Removed ${agent} skill link: $skill"
      fi
    done
  done
fi

for agent in "${agent_list[@]}"; do
  agent="$(echo "$agent" | xargs)"
  [[ -n "$agent" ]] || continue
  target_root="$(target_root_for_agent "$agent")"
  mkdir -p "$target_root"

  for skill in "${skills[@]}"; do
    src="${repo_root}/.agent/skills/${skill}"
    dest="${target_root}/${skill}"

    if [[ ! -f "${src}/SKILL.md" ]]; then
      echo "Missing local skill entrypoint: ${src}/SKILL.md" >&2
      exit 1
    fi

    if [[ -L "$dest" ]]; then
      current="$(readlink "$dest")"
      if [[ "$current" == "$src" ]]; then
        echo "Already linked for ${agent}: $skill"
        continue
      fi

      if [[ "$force" -eq 1 ]]; then
        rm "$dest"
      else
        echo "Warning: $dest points to $current; skipping. Pass --force to replace the symlink." >&2
        continue
      fi
    elif [[ -e "$dest" ]]; then
      echo "Warning: $dest exists and is not a symlink; skipping." >&2
      continue
    fi

    ln -s "$src" "$dest"
    echo "Linked for ${agent}: $skill -> $dest"
  done
done

if [[ "${agents}" == *codex* ]]; then
  echo "engineering-memory-loader uses repo-local Claude Obsidian."
fi
