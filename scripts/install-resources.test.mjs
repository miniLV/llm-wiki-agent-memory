import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "install-resources.sh");

test("resource installer preserves a non-empty non-git target", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "install-resources-"));
  const target = path.join(root, "important-files");
  const sentinel = path.join(target, "keep.txt");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(sentinel, "keep\n");

  const result = spawnSync("bash", [script, "install-obsidian-skills"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: path.join(root, "home"),
      OBSIDIAN_SKILLS_DIR: target,
      OBSIDIAN_SKILLS_REPO: "https://invalid.example/unused.git",
    },
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to replace non-empty non-git path/);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "keep\n");
});
