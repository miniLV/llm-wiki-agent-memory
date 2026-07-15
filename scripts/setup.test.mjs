import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const setupSource = path.join(repoRoot, "scripts", "setup.sh");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-memory-setup-"));
  const home = path.join(root, "home");
  const codexHome = path.join(home, ".codex");
  const actionsFile = path.join(root, "actions.txt");
  const requiredFiles = [
    "README.md",
    "SCHEMA.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".agent/skills/agent-memory-setup/SKILL.md",
    ".agent/skills/agent-memory-uninstall/SKILL.md",
    ".agent/skills/ai-session-wiki-ingest/SKILL.md",
    ".agent/skills/agent-memory-reconcile/SKILL.md",
    ".agent/skills/engineering-memory-loader/SKILL.md",
    "wiki/index.md",
    "wiki/log.md",
    "wiki/guardrails/Agent Behavior Rules.md",
    "wiki/templates/Daily AI Chat Summary Template.md",
    "scripts/config-server.mjs",
    "scripts/config-ui.sh",
    "scripts/capture-ai-chats.mjs",
    "scripts/daily-memory-workflow.mjs",
    "scripts/install-claude-obsidian.sh",
    "scripts/install-resources.sh",
    "scripts/link-skills.sh",
    "scripts/setup.sh",
    "scripts/uninstall.sh",
  ];
  for (const relative of requiredFiles) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "fixture\n");
  }
  fs.copyFileSync(setupSource, path.join(root, "scripts", "setup.sh"));
  fs.writeFileSync(path.join(root, "scripts", "install-resources.sh"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'if [[ "${1:-}" == "status" ]]; then',
    "  printf '%s' '{\"obsidianApp\":{\"installed\":false},\"claudeObsidian\":{\"adapterSkillsReady\":true}}'",
    "  exit 0",
    "fi",
    'printf "resources:%s\\n" "$*" >> "$ACTIONS_FILE"',
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "scripts", "link-skills.sh"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'printf "links:%s\\n" "$*" >> "$ACTIONS_FILE"',
    'target="$CODEX_HOME/skills/engineering-memory-loader"',
    'mkdir -p "$target"',
    'printf "%s\\n" "fixture skill" > "$target/SKILL.md"',
    "",
  ].join("\n"));
  fs.mkdirSync(path.join(root, ".vault-meta"), { recursive: true });
  fs.writeFileSync(path.join(root, ".vault-meta", "config.json"), JSON.stringify({
    customSetting: "preserve-me",
    codexSourcesEnabled: false,
  }));
  fs.mkdirSync(home, { recursive: true });
  return { actionsFile, codexHome, home, root };
}

test("full non-interactive setup preserves config and emits JSON", () => {
  const context = fixture();
  const result = spawnSync("bash", ["scripts/setup.sh", "--full", "--non-interactive", "--json"], {
    cwd: context.root,
    env: {
      ...process.env,
      ACTIONS_FILE: context.actionsFile,
      CODEX_HOME: context.codexHome,
      HOME: context.home,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.memorySkill.ready, true);
  assert.equal(payload.automations.installedByThisCommand, false);
  assert.equal(payload.config.customSetting, "preserve-me");
  assert.equal(payload.config.codexSourcesEnabled, true);
  assert.equal(payload.config.claudeSourcesEnabled, true);
  assert.equal(payload.config.sourcesConfirmed, true);
  const actions = fs.readFileSync(context.actionsFile, "utf8");
  assert.match(actions, /resources:install-all --non-interactive/);
  assert.match(actions, /links:--force --prune --agents codex/);
});

test("setup reports every preflight failure before writing state", () => {
  const context = fixture();
  fs.rmSync(path.join(context.root, "SCHEMA.md"));
  fs.rmSync(path.join(context.root, ".agent", "skills", "agent-memory-reconcile", "SKILL.md"));
  const metaPath = path.join(context.root, ".vault-meta");
  fs.rmSync(metaPath, { recursive: true });

  const result = spawnSync("bash", ["scripts/setup.sh", "--full", "--non-interactive", "--json"], {
    cwd: context.root,
    env: { ...process.env, CODEX_HOME: context.codexHome, HOME: context.home },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required seed file: SCHEMA\.md/);
  assert.match(result.stderr, /Missing required seed file: \.agent\/skills\/agent-memory-reconcile\/SKILL\.md/);
  assert.equal(fs.existsSync(metaPath), false);
});
