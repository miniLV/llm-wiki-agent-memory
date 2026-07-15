#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dependency_root="${repo_root}/.agent/external"
obsidian_skills_repo="${OBSIDIAN_SKILLS_REPO:-https://github.com/kepano/obsidian-skills.git}"
obsidian_skills_dir="${OBSIDIAN_SKILLS_DIR:-${dependency_root}/obsidian-skills}"
claude_obsidian_repo="${CLAUDE_OBSIDIAN_REPO:-https://github.com/AgriciDaniel/claude-obsidian.git}"
claude_obsidian_dir="${CLAUDE_OBSIDIAN_DIR:-${dependency_root}/claude-obsidian}"
codex_skills_dir="${HOME}/.codex/skills"
obsidian_download_url="https://obsidian.md/download"

usage() {
  cat <<USAGE
Usage: bash scripts/install-resources.sh <status|open-obsidian|install-obsidian-app|install-obsidian-skills|install-claude-obsidian|install-all> [--json] [--non-interactive]

Required:
  install-claude-obsidian   Install Claude Obsidian.

Recommended optional tools:
  open-obsidian             Open the official Obsidian download page.
  install-obsidian-app      Install the Obsidian desktop app when Homebrew is available.
  install-obsidian-skills   Install general Obsidian skills for CLI, Canvas, and Bases.

Convenience:
  install-all               Install Claude Obsidian, Obsidian Skills, and Obsidian App.
USAGE
}

json_mode=0
force=0
non_interactive=0
action="${1:-status}"
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      json_mode=1
      shift
      ;;
    --force)
      force=1
      shift
      ;;
    --non-interactive)
      non_interactive=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

detect_obsidian_app() {
  /usr/bin/env node <<'NODE'
const fs = require("fs");
const os = require("os");
const path = require("path");
const under = (root, ...parts) => root ? path.join(root, ...parts) : "";
const candidates = [
  under(process.env.LOCALAPPDATA, "Programs", "Obsidian", "Obsidian.exe"),
  under(process.env.LOCALAPPDATA, "Obsidian", "Obsidian.exe"),
  under(process.env.ProgramFiles || process.env.PROGRAMFILES, "Obsidian", "Obsidian.exe"),
  under(process.env["ProgramFiles(x86)"] || process.env["PROGRAMFILES(X86)"], "Obsidian", "Obsidian.exe"),
  "/Applications/Obsidian.app",
  path.join(os.homedir(), "Applications", "Obsidian.app"),
];
process.stdout.write(candidates.find((candidate) => candidate && fs.existsSync(candidate)) || "");
NODE
}

open_obsidian() {
  if command_exists open; then
    open "$obsidian_download_url"
  elif command_exists xdg-open; then
    xdg-open "$obsidian_download_url"
  else
    echo "$obsidian_download_url"
  fi
}

install_obsidian_app() {
  local installed_path
  installed_path="$(detect_obsidian_app)"
  if [[ -n "$installed_path" ]]; then
    echo "Obsidian App is already installed: ${installed_path}"
    return
  fi

  if command_exists brew; then
    if brew install --cask obsidian; then
      return
    fi
    if [[ "$non_interactive" -eq 1 ]]; then
      echo "Optional Obsidian App was not installed: Homebrew installation failed." >&2
      return 0
    fi
    echo "Homebrew could not install Obsidian. Opening the official download page instead." >&2
  else
    if [[ "$non_interactive" -eq 1 ]]; then
      echo "Optional Obsidian App was skipped: Homebrew is not installed." >&2
      return 0
    fi
    echo "Homebrew is not installed. Opening the official Obsidian download page instead."
  fi
  open_obsidian
}

clone_or_update() {
  local repo="$1"
  local dir="$2"
  mkdir -p "$(dirname "$dir")"
  if [[ -d "${dir}/.git" ]]; then
    git -C "$dir" pull --ff-only
  else
    if [[ -e "$dir" ]]; then
      if [[ ! -d "$dir" || -n "$(find "$dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
        echo "Refusing to replace non-empty non-git path: $dir" >&2
        return 1
      fi
    fi
    git clone --depth 1 "$repo" "$dir"
  fi
}

link_skill() {
  local name="$1"
  local source="$2"
  local target="${codex_skills_dir}/${name}"
  mkdir -p "$codex_skills_dir"
  if [[ -f "${target}/SKILL.md" && "$force" -eq 0 ]]; then
    echo "Codex skill already available: ${name} -> ${target}"
    return
  fi
  if [[ -L "$target" && "$(readlink "$target")" == "$source" ]]; then
    echo "Skill already linked: ${name}"
    return
  fi
  if [[ -e "$target" || -L "$target" ]]; then
    if [[ "$force" -eq 1 && -L "$target" ]]; then
      rm "$target"
    else
    echo "Skip existing skill ${name}: ${target}" >&2
    return
    fi
  fi
  ln -s "$source" "$target"
  echo "Linked skill: ${name}"
}

codex_skill_ready() {
  local name="$1"
  [[ -f "${codex_skills_dir}/${name}/SKILL.md" ]]
}

install_obsidian_skills() {
  local required_skills=(
    defuddle
    obsidian-markdown
    obsidian-bases
    obsidian-cli
    json-canvas
  )
  local missing=0
  for skill in "${required_skills[@]}"; do
    if ! codex_skill_ready "$skill"; then
      missing=1
      break
    fi
  done
  if [[ "$missing" -eq 0 && "$force" -eq 0 ]]; then
    echo "Obsidian Skills already available to Codex in ${codex_skills_dir}; skipping download."
    return
  fi
  clone_or_update "$obsidian_skills_repo" "$obsidian_skills_dir"
  while IFS= read -r skill_file; do
    local skill_dir name
    skill_dir="$(dirname "$skill_file")"
    name="$(basename "$skill_dir")"
    link_skill "$name" "$skill_dir"
  done < <(find "${obsidian_skills_dir}/skills" -mindepth 2 -maxdepth 2 -name SKILL.md -print | sort)
}

install_claude_obsidian() {
  if [[ "$force" -eq 1 ]]; then
    CLAUDE_OBSIDIAN_REPO="$claude_obsidian_repo" CLAUDE_OBSIDIAN_DIR="$claude_obsidian_dir" \
      bash "${repo_root}/scripts/install-claude-obsidian.sh" --force
  else
    CLAUDE_OBSIDIAN_REPO="$claude_obsidian_repo" CLAUDE_OBSIDIAN_DIR="$claude_obsidian_dir" \
      bash "${repo_root}/scripts/install-claude-obsidian.sh"
  fi
}

status_json() {
  local obsidian_app_path
  obsidian_app_path="$(detect_obsidian_app)"
  /usr/bin/env node - "$obsidian_skills_dir" "$claude_obsidian_dir" "$codex_skills_dir" "$obsidian_download_url" "$obsidian_app_path" <<'NODE'
const fs = require("fs");
const path = require("path");
const os = require("os");
const [obsidianSkillsDir, claudeObsidianDir, codexSkillsDir, obsidianDownloadUrl, obsidianAppPath] = process.argv.slice(2);
function exists(p) { return fs.existsSync(p); }
function linkInfo(root, name) {
  const target = path.join(root, name);
  let linkTarget = "";
  let realTarget = "";
  let available = false;
  try {
    const stat = fs.lstatSync(target);
    linkTarget = stat.isSymbolicLink() ? fs.readlinkSync(target) : target;
    realTarget = fs.realpathSync(target);
    available = exists(path.join(target, "SKILL.md"));
  } catch {}
  return { linked: available, target: linkTarget, realTarget };
}
const obsidianSkillNames = ["defuddle", "obsidian-markdown", "obsidian-bases", "obsidian-cli", "json-canvas"];
const obsidianSkillLinks = Object.fromEntries(obsidianSkillNames.map((name) => [
  name,
  linkInfo(codexSkillsDir, name),
]));
const claudeObsidianSkillNames = ["wiki-query"];
const claudeObsidianSkills = Object.fromEntries(claudeObsidianSkillNames.map((name) => [
  name,
  exists(path.join(claudeObsidianDir, "skills", name, "SKILL.md")),
]));
const adapterSkillsReady = Object.values(claudeObsidianSkills).every(Boolean);
const repoWikiQueryPath = path.join(claudeObsidianDir, "skills", "wiki-query");
const repoWikiQueryReady = exists(path.join(repoWikiQueryPath, "SKILL.md"));
const wikiQuery = linkInfo(codexSkillsDir, "wiki-query");
const claudeWikiQuery = linkInfo(path.join(os.homedir(), ".claude", "skills"), "wiki-query");
process.stdout.write(JSON.stringify({
  obsidianDownloadUrl,
  obsidianApp: {
    installed: Boolean(obsidianAppPath),
    path: obsidianAppPath,
  },
  obsidianSkills: {
    repoDir: obsidianSkillsDir,
    cloned: exists(path.join(obsidianSkillsDir, ".git")),
    linked: Object.fromEntries(Object.entries(obsidianSkillLinks).map(([name, info]) => [name, info.linked])),
    links: obsidianSkillLinks,
  },
  claudeObsidian: {
    repoDir: claudeObsidianDir,
    cloned: exists(path.join(claudeObsidianDir, ".git")),
    adapterSkills: claudeObsidianSkills,
    adapterSkillsReady,
    wikiQueryLinked: repoWikiQueryReady,
    wikiQueryTarget: repoWikiQueryPath,
    wikiQueryRealTarget: repoWikiQueryPath,
    globalWikiQueryLinked: wikiQuery.linked,
    globalWikiQueryTarget: wikiQuery.target,
    globalWikiQueryRealTarget: wikiQuery.realTarget,
    wikiQueryClaudeLinked: claudeWikiQuery.linked,
    wikiQueryClaudeTarget: claudeWikiQuery.target,
    wikiQueryClaudeRealTarget: claudeWikiQuery.realTarget,
  },
}, null, 2));
NODE
}

case "$action" in
  status)
    if [[ "$json_mode" -eq 1 ]]; then
      status_json
    else
      status_json | /usr/bin/env node -e 'const fs=require("fs"); const s=JSON.parse(fs.readFileSync(0,"utf8")); console.log(`Obsidian app: installed=${s.obsidianApp.installed} ${s.obsidianApp.path || ""}`); console.log(`Obsidian download: ${s.obsidianDownloadUrl}`); console.log(`obsidian-skills: cloned=${s.obsidianSkills.cloned}`); console.log(`claude-obsidian: cloned=${s.claudeObsidian.cloned} query-ready=${s.claudeObsidian.adapterSkillsReady}`);'
    fi
    ;;
  open-obsidian)
    open_obsidian
    ;;
  install-obsidian-app)
    install_obsidian_app
    ;;
  install-obsidian-skills)
    install_obsidian_skills
    ;;
  install-claude-obsidian)
    install_claude_obsidian
    ;;
  install-all)
    install_claude_obsidian
    install_obsidian_skills
    install_obsidian_app
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown action: $action" >&2
    usage >&2
    exit 2
    ;;
esac
