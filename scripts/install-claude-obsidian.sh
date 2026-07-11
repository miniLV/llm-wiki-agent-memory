#!/usr/bin/env bash
set -euo pipefail

force=0
agents="${WIKI_QUERY_AGENTS:-codex}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      force=1
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
      echo "Usage: bash scripts/install-claude-obsidian.sh [--force] [--agents codex,claude]" >&2
      exit 2
      ;;
  esac
done

repo_url="${CLAUDE_OBSIDIAN_REPO:-https://github.com/AgriciDaniel/claude-obsidian.git}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
canonical_root="${repo_root}/.agent/external/claude-obsidian"
install_root="${CLAUDE_OBSIDIAN_DIR:-${canonical_root}}"
skill_path="${install_root}/skills/wiki-query"
required_skills=(wiki-query)

has_required_skills() {
  local skill
  for skill in "${required_skills[@]}"; do
    [[ -f "${install_root}/skills/${skill}/SKILL.md" ]] || return 1
  done
}

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

if [[ -d "$install_root/.git" && "$force" -eq 1 ]]; then
  echo "Updating claude-obsidian in $install_root"
  git -C "$install_root" pull --ff-only
elif ! has_required_skills; then
  if [[ -d "$install_root/.git" ]]; then
    echo "Updating claude-obsidian in $install_root"
    git -C "$install_root" pull --ff-only
  else
    if ! command -v git >/dev/null 2>&1; then
      echo "git is required to install Claude Obsidian automatically." >&2
      echo "Install git, then rerun: bash scripts/setup.sh" >&2
      exit 1
    fi

    mkdir -p "$(dirname "$install_root")"
    echo "Installing claude-obsidian from $repo_url"
    git clone --depth 1 "$repo_url" "$install_root"
  fi
fi

if ! has_required_skills; then
  echo "Could not find the required Claude Obsidian query skill under ${install_root}/skills." >&2
  echo "Required: wiki-query" >&2
  echo "Set CLAUDE_OBSIDIAN_DIR to a local claude-obsidian checkout and rerun setup." >&2
  exit 1
fi

install_real="$(cd "$install_root" && pwd -P)"
canonical_real=""

if [[ -L "$canonical_root" ]]; then
  canonical_real="$(cd "$canonical_root" 2>/dev/null && pwd -P || true)"
  if [[ "$canonical_real" != "$install_real" ]]; then
    rm "$canonical_root"
  fi
elif [[ -e "$canonical_root" ]]; then
  canonical_real="$(cd "$canonical_root" && pwd -P)"
  if [[ "$canonical_real" != "$install_real" ]]; then
    echo "Repo-local Claude Obsidian path already exists and differs from CLAUDE_OBSIDIAN_DIR: $canonical_root" >&2
    echo "Use the repo-local checkout or move the conflicting directory, then rerun setup." >&2
    exit 1
  fi
fi

if [[ ! -e "$canonical_root" ]]; then
  mkdir -p "$(dirname "$canonical_root")"
  ln -s "$install_real" "$canonical_root"
  echo "Linked repo-local Claude Obsidian checkout: $canonical_root -> $install_real"
fi

for skill in "${required_skills[@]}"; do
  if [[ ! -f "${canonical_root}/skills/${skill}/SKILL.md" ]]; then
    echo "Canonical repo-local Claude Obsidian skill is unavailable: ${canonical_root}/skills/${skill}/SKILL.md" >&2
    exit 1
  fi
done

echo "Claude Obsidian is available in this repo: $install_root"

if [[ "${EXPOSE_WIKI_QUERY_GLOBAL:-0}" != "1" ]]; then
  echo "No global skill link created; engineering-memory-loader reads the repo-local checkout."
  exit 0
fi

link_for_agent() {
  local agent="$1"
  local target_root target current
  target_root="$(target_root_for_agent "$agent")"
  target="${target_root}/wiki-query"
  mkdir -p "$target_root"

  if [[ -L "$target" ]]; then
    current="$(readlink "$target")"
    if [[ "$current" == "$skill_path" && "$force" -eq 0 ]]; then
      echo "Already linked for ${agent}: wiki-query -> $current"
      return
    fi
    if [[ -f "${target}/SKILL.md" && "$force" -eq 0 ]]; then
      echo "wiki-query already available for ${agent}: $target -> $current"
      return
    fi
    if [[ "$force" -eq 1 ]]; then
      rm "$target"
    else
      echo "Replacing stale wiki-query link for ${agent}: $target -> $current"
      rm "$target"
    fi
  elif [[ -e "$target" ]]; then
    echo "Warning: $target exists and is not a symlink; leaving it unchanged." >&2
    return
  fi

  ln -s "$skill_path" "$target"
  echo "Linked for ${agent}: wiki-query -> $target"
}

for agent in "${agent_list[@]}"; do
  agent="$(echo "$agent" | xargs)"
  [[ -n "$agent" ]] || continue
  link_for_agent "$agent"
done
