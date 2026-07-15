import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const linkSkillsScript = path.join(repoRoot, "scripts", "link-skills.sh");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "link-skills-windows-"));
  const testRepo = path.join(root, "repo with spaces");
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  const script = path.join(testRepo, "scripts", "link-skills.sh");
  const source = path.join(testRepo, ".agent", "skills", "engineering-memory-loader");
  const wikiQuery = path.join(testRepo, ".agent", "external", "claude-obsidian", "skills", "wiki-query", "SKILL.md");
  const destination = path.join(home, ".codex", "skills", "engineering-memory-loader");

  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(path.dirname(wikiQuery), { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.copyFileSync(linkSkillsScript, script);
  fs.writeFileSync(path.join(source, "SKILL.md"), "source skill\n");
  fs.writeFileSync(wikiQuery, "wiki query\n");
  fs.writeFileSync(path.join(bin, "ln"), "#!/bin/sh\ncp -R \"$2\" \"$3\"\n");
  fs.chmodSync(path.join(bin, "ln"), 0o755);

  return { bin, destination, home, script, source };
}

function runLink({ bin, home, script }) {
  return spawnSync("bash", [script, "--force", "--agents", "codex"], {
    env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
    encoding: "utf8",
  });
}

test("Codex skill remains linked when Git Bash ln would copy directories", () => {
  const context = fixture();
  const result = runLink(context);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.realpathSync(context.destination), fs.realpathSync(context.source));
});

test("macOS creates and reuses a native directory symlink", { skip: process.platform !== "darwin" }, () => {
  const context = fixture();
  const first = runLink(context);

  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.equal(fs.lstatSync(context.destination).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(context.destination), context.source);

  const second = runLink(context);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.match(second.stdout, /Already linked for codex: engineering-memory-loader/);
});

test("force migrates an unchanged Git Bash skill copy to a live link", () => {
  const context = fixture();
  fs.cpSync(context.source, context.destination, { recursive: true });
  const result = runLink(context);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.realpathSync(context.destination), fs.realpathSync(context.source));
});
