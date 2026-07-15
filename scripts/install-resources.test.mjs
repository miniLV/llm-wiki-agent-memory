import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "install-resources.sh");

test("resource installer detects Windows Obsidian installations", () => {
  for (const relativePath of [
    ["Programs", "Obsidian", "Obsidian.exe"],
    ["Obsidian", "Obsidian.exe"],
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "install-resources-windows-"));
    const localAppData = path.join(root, "AppData", "Local");
    const obsidianExe = path.join(localAppData, ...relativePath);
    fs.mkdirSync(path.dirname(obsidianExe), { recursive: true });
    fs.writeFileSync(obsidianExe, "");

    const env = {
      ...process.env,
      HOME: path.join(root, "home"),
      LOCALAPPDATA: localAppData,
    };
    const status = spawnSync("bash", [script, "status", "--json"], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
    });
    assert.equal(status.status, 0, status.stderr);
    assert.deepEqual(JSON.parse(status.stdout).obsidianApp, {
      installed: true,
      path: obsidianExe,
    });

    const install = spawnSync("bash", [script, "install-obsidian-app"], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
    });
    assert.equal(install.status, 0, install.stderr);
    assert.equal(install.stdout.trim(), `Obsidian App is already installed: ${obsidianExe}`);
    assert.doesNotMatch(install.stdout, /Homebrew/);
  }
});

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
