#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dry_run=0
confirmed=0
json_mode=0
purge_local_state=0

usage() {
  cat <<'USAGE'
Usage: bash scripts/uninstall.sh [--dry-run | --yes] [--purge-local-state] [--json]

Safely remove global Agent Memory skill links owned by this repository.
Codex App automations must be removed by the Agent with the official automation
tool before this script runs.

  --dry-run            Report what would be removed without changing files.
  --yes                Confirm removal of repository-owned global skill links.
  --purge-local-state  Also remove gitignored .vault-meta and .agent/external.
                       Generated wiki pages and Concepts are always preserved.
  --json               Emit one machine-readable result to stdout.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=1
      shift
      ;;
    --yes)
      confirmed=1
      shift
      ;;
    --purge-local-state)
      purge_local_state=1
      shift
      ;;
    --json)
      json_mode=1
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

if [[ "$dry_run" -eq 1 && "$confirmed" -eq 1 ]]; then
  echo "Choose either --dry-run or --yes, not both." >&2
  exit 2
fi
if [[ "$dry_run" -eq 0 && "$confirmed" -eq 0 ]]; then
  echo "Refusing to uninstall without confirmation. Use --dry-run to inspect or --yes to continue." >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to verify managed links safely." >&2
  exit 1
fi

codex_root="${CODEX_HOME:-${HOME}/.codex}"

node - "$repo_root" "$codex_root" "$HOME" "$dry_run" "$purge_local_state" "$json_mode" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [repoRootInput, codexRoot, home, dryRunRaw, purgeRaw, jsonRaw] = process.argv.slice(2);
const repoRoot = fs.realpathSync(repoRootInput);
const dryRun = dryRunRaw === "1";
const purgeLocalState = purgeRaw === "1";
const jsonMode = jsonRaw === "1";
const removed = [];
const skipped = [];
const purged = [];

function within(candidate, root) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function linkDestination(target) {
  try {
    const raw = fs.readlinkSync(target);
    const absolute = path.isAbsolute(raw) ? raw : path.resolve(path.dirname(target), raw);
    try { return fs.realpathSync(target); } catch { return path.resolve(absolute); }
  } catch {
    return "";
  }
}

function removeManagedLink(target, allowedRoot, label) {
  let stat;
  try { stat = fs.lstatSync(target); } catch {
    skipped.push({ label, path: target, reason: "not-installed" });
    return;
  }
  if (!stat.isSymbolicLink()) {
    skipped.push({ label, path: target, reason: "existing-non-link-preserved" });
    return;
  }
  const destination = linkDestination(target);
  if (!destination || !within(destination, allowedRoot)) {
    skipped.push({ label, path: target, destination, reason: "owned-by-another-installation" });
    return;
  }
  if (!dryRun) fs.unlinkSync(target);
  removed.push({ label, path: target, destination, dryRun });
}

const codexSkillRoots = [...new Set([
  path.join(codexRoot, "skills"),
  path.join(home, ".codex", "skills"),
])];
const claudeSkillRoot = path.join(home, ".claude", "skills");
const loaderRoot = path.join(repoRoot, ".agent", "skills", "engineering-memory-loader");
const externalRoot = path.join(repoRoot, ".agent", "external");
const obsidianSkillNames = ["defuddle", "obsidian-markdown", "obsidian-bases", "obsidian-cli", "json-canvas"];

for (const root of codexSkillRoots) {
  removeManagedLink(path.join(root, "engineering-memory-loader"), loaderRoot, "Codex engineering-memory-loader");
  removeManagedLink(path.join(root, "wiki-query"), externalRoot, "Codex wiki-query");
  for (const name of obsidianSkillNames) {
    removeManagedLink(path.join(root, name), externalRoot, `Codex ${name}`);
  }
}
removeManagedLink(path.join(claudeSkillRoot, "engineering-memory-loader"), loaderRoot, "Claude engineering-memory-loader");
removeManagedLink(path.join(claudeSkillRoot, "wiki-query"), externalRoot, "Claude wiki-query");

if (purgeLocalState) {
  for (const target of [path.join(repoRoot, ".vault-meta"), externalRoot]) {
    if (!fs.existsSync(target)) {
      skipped.push({ label: "local-state", path: target, reason: "not-present" });
      continue;
    }
    if (!dryRun) fs.rmSync(target, { recursive: true, force: true });
    purged.push({ path: target, dryRun });
  }
}

const result = {
  ok: true,
  dryRun,
  repoRoot,
  removed,
  skipped,
  purged,
  preserved: [
    path.join(repoRoot, "wiki"),
    ...(purgeLocalState ? [] : [path.join(repoRoot, ".vault-meta"), externalRoot]),
  ],
  automations: {
    managedBy: "Codex automation-management tool",
    removedByThisScript: false,
  },
};

if (jsonMode) {
  process.stdout.write(JSON.stringify(result, null, 2));
} else {
  const verb = dryRun ? "Would remove" : "Removed";
  for (const item of removed) console.log(`${verb}: ${item.label} -> ${item.path}`);
  for (const item of purged) console.log(`${dryRun ? "Would purge" : "Purged"}: ${item.path}`);
  for (const item of skipped) console.log(`Preserved: ${item.label} -> ${item.path} (${item.reason})`);
  console.log("Codex App automations are not removed by this script; use the Agent uninstall workflow.");
  console.log("Generated wiki pages and Concepts were preserved.");
}
NODE
