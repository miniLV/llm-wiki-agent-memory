import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uninstallSource = path.join(repoRoot, "scripts", "uninstall.sh");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-memory-uninstall-"));
  const repo = path.join(root, "repo");
  const home = path.join(root, "home");
  const codexHome = path.join(home, ".codex");
  const codexSkills = path.join(codexHome, "skills");
  const loader = path.join(repo, ".agent", "skills", "engineering-memory-loader");
  const external = path.join(repo, ".agent", "external");
  const obsidianSkill = path.join(external, "obsidian-skills", "skills", "defuddle");
  const otherSkill = path.join(root, "other-install", "wiki-query");
  const script = path.join(repo, "scripts", "uninstall.sh");
  for (const dir of [loader, obsidianSkill, otherSkill, codexSkills, path.join(repo, ".vault-meta"), path.join(repo, "wiki", "sources", "ai-chats")]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(uninstallSource, script);
  fs.writeFileSync(path.join(loader, "SKILL.md"), "loader\n");
  fs.writeFileSync(path.join(obsidianSkill, "SKILL.md"), "obsidian\n");
  fs.writeFileSync(path.join(otherSkill, "SKILL.md"), "other\n");
  fs.writeFileSync(path.join(repo, ".vault-meta", "config.json"), "{}\n");
  fs.writeFileSync(path.join(repo, "wiki", "sources", "ai-chats", "2026-07-15.md"), "memory\n");
  fs.symlinkSync(loader, path.join(codexSkills, "engineering-memory-loader"), "dir");
  fs.symlinkSync(obsidianSkill, path.join(codexSkills, "defuddle"), "dir");
  fs.symlinkSync(otherSkill, path.join(codexSkills, "wiki-query"), "dir");
  fs.mkdirSync(path.join(codexSkills, "obsidian-markdown"));
  return { codexHome, codexSkills, home, repo, script };
}

function run(context, args) {
  return spawnSync("bash", [context.script, ...args], {
    cwd: context.repo,
    env: { ...process.env, CODEX_HOME: context.codexHome, HOME: context.home },
    encoding: "utf8",
  });
}

test("uninstall requires explicit confirmation", () => {
  const context = fixture();
  const result = run(context, ["--json"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Refusing to uninstall without confirmation/);
  assert.equal(fs.existsSync(path.join(context.codexSkills, "engineering-memory-loader")), true);
});

test("dry-run reports repository-owned links without removing them", () => {
  const context = fixture();
  const result = run(context, ["--dry-run", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.ok(payload.removed.some((item) => item.label === "Codex engineering-memory-loader"));
  assert.ok(payload.removed.some((item) => item.label === "Codex defuddle"));
  assert.equal(fs.existsSync(path.join(context.codexSkills, "engineering-memory-loader")), true);
  assert.equal(fs.existsSync(path.join(context.codexSkills, "defuddle")), true);
});

test("uninstall removes only links owned by this repository and preserves memory", () => {
  const context = fixture();
  const result = run(context, ["--yes", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(fs.existsSync(path.join(context.codexSkills, "engineering-memory-loader")), false);
  assert.equal(fs.existsSync(path.join(context.codexSkills, "defuddle")), false);
  assert.equal(fs.existsSync(path.join(context.codexSkills, "wiki-query")), true);
  assert.equal(fs.existsSync(path.join(context.codexSkills, "obsidian-markdown")), true);
  assert.equal(fs.existsSync(path.join(context.repo, ".vault-meta", "config.json")), true);
  assert.equal(fs.readFileSync(path.join(context.repo, "wiki", "sources", "ai-chats", "2026-07-15.md"), "utf8"), "memory\n");
});

test("purge-local-state removes ignored state but never generated wiki pages", () => {
  const context = fixture();
  const result = run(context, ["--yes", "--purge-local-state", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.purged.length, 2);
  assert.equal(fs.existsSync(path.join(context.repo, ".vault-meta")), false);
  assert.equal(fs.existsSync(path.join(context.repo, ".agent", "external")), false);
  assert.equal(fs.readFileSync(path.join(context.repo, "wiki", "sources", "ai-chats", "2026-07-15.md"), "utf8"), "memory\n");
});
