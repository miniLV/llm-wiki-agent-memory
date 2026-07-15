import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverSource = path.join(repoRoot, "scripts", "config-server.mjs");
const appSource = path.join(repoRoot, "scripts", "config-ui", "app.js");
const configUiScript = path.join(repoRoot, "scripts", "config-ui.sh");
const installResourcesScript = path.join(repoRoot, "scripts", "install-resources.sh");

test("open actions use configured paths without the full config workflow", () => {
  const source = fs.readFileSync(serverSource, "utf8");
  assert.match(source, /open-detected-obsidian-app[\s\S]*?resourceStatus\(config\)\.obsidianApp\?\.path/);
  assert.match(source, /command -v cmd\.exe[\s\S]*?cmd\.exe \/c start/);
  assert.match(source, /open-detected-obsidian-skills[\s\S]*?openPathCommand\(config\.obsidianSkillsDir/);
  assert.match(source, /command -v explorer\.exe[\s\S]*?explorer\.exe "\$target"/);
  assert.match(fs.readFileSync(appSource, "utf8"), /runActionOnly\(button\.dataset\.openAction\)/);
});

test("one-click local setup installs local requirements and leaves only the Codex loop", () => {
  const source = fs.readFileSync(serverSource, "utf8");
  const app = fs.readFileSync(appSource, "utf8");
  assert.match(source, /action === "complete-local-setup"[\s\S]*?install-resources\.sh install-all[\s\S]*?link-skills\.sh --force --prune --agents codex/);
  assert.match(source, /action === "complete-local-setup" && result\.code === 0[\s\S]*?sourcesConfirmed: true/);
  assert.match(app, /"complete-local-setup"/);
  assert.match(app, /steps\.some\(\(step\) => step\.key !== "runner" && !step\.ok\)/);
});

test("config UI reuses a relative-path server only when its cwd is this repo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "config-ui-listener-"));
  const binDir = path.join(root, "bin");
  const openedFile = path.join(root, "opened.txt");
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(binDir, "lsof"), [
    "#!/bin/sh",
    'if [ "$1" = "-tiTCP:8765" ]; then echo 12345; exit 0; fi',
    'printf "p12345\\nfcwd\\nn%s\\n" "$FAKE_LISTENER_CWD"',
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(binDir, "ps"), "#!/bin/sh\necho '/tmp/node scripts/config-server.mjs --port=8765'\n");
  fs.writeFileSync(path.join(binDir, "open"), "#!/bin/sh\nprintf '%s' \"$1\" > \"$OPENED_FILE\"\n");
  for (const name of ["lsof", "ps", "open"]) fs.chmodSync(path.join(binDir, name), 0o755);

  const run = (listenerCwd) => spawnSync("bash", [configUiScript, "--open"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${binDir}:/usr/bin:/bin`,
      FAKE_LISTENER_CWD: listenerCwd,
      OPENED_FILE: openedFile,
    },
    encoding: "utf8",
  });

  const sameRepo = run(repoRoot);
  assert.equal(sameRepo.status, 0);
  assert.match(sameRepo.stdout, /reusing it/);
  assert.equal(fs.readFileSync(openedFile, "utf8"), "http://127.0.0.1:8765");

  const otherRepo = run(path.join(root, "other-repo"));
  assert.equal(otherRepo.status, 1);
  assert.match(otherRepo.stderr, /already in use by another process/);
});

test("config server reuses its Node binary when PATH omits Node", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "config-server-node-path-"));
  const serverFile = path.join(root, "scripts", "config-server.mjs");
  const resourcesFile = path.join(root, "scripts", "install-resources.sh");
  fs.mkdirSync(path.dirname(serverFile), { recursive: true });
  fs.copyFileSync(serverSource, serverFile);
  fs.copyFileSync(installResourcesScript, resourcesFile);

  const port = await freePort();
  const child = spawn(process.execPath, [serverFile, `--port=${port}`], {
    cwd: root,
    env: {
      ...process.env,
      HOME: path.join(root, "home"),
      CODEX_HOME: path.join(root, "codex"),
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  await waitForStartup(child);

  const status = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
  assert.equal(status.commandPaths.node, process.execPath);
  assert.equal(status.resources.error, undefined);
  assert.equal(typeof status.resources.obsidianApp.installed, "boolean");
});

test("config server recognizes a Codex skill by its final link target", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "config-server-skill-link-"));
  const serverFile = path.join(root, "scripts", "config-server.mjs");
  const resourcesFile = path.join(root, "scripts", "install-resources.sh");
  const source = path.join(root, ".agent", "skills", "engineering-memory-loader");
  const alias = path.join(root, "skill-alias");
  const home = path.join(root, "home");
  const destination = path.join(home, ".codex", "skills", "engineering-memory-loader");
  fs.mkdirSync(path.dirname(serverFile), { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(serverSource, serverFile);
  fs.copyFileSync(installResourcesScript, resourcesFile);
  fs.writeFileSync(path.join(source, "SKILL.md"), "source skill\n");
  fs.symlinkSync(source, alias, "dir");
  fs.symlinkSync(alias, destination, "dir");

  const port = await freePort();
  const child = spawn(process.execPath, [serverFile, `--port=${port}`], {
    cwd: root,
    env: { ...process.env, HOME: home, CODEX_HOME: path.join(root, "codex") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  await waitForStartup(child);

  const status = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
  const codex = status.memorySkillMappings.find((mapping) => mapping.id === "codex");
  assert.equal(codex.skill.linkedToExpected, true);
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForStartup(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("config server did not start")), 5000);
    child.once("exit", (code) => reject(new Error(`config server exited with ${code}`)));
    child.stdout.on("data", (chunk) => {
      if (!chunk.toString().includes("Agent Memory Control running")) return;
      clearTimeout(timer);
      resolve();
    });
  });
}

test("config server rejects simple cross-site POSTs and staggers schedule defaults", async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "agent memory path with spaces ")));
  const tomlRoot = process.platform === "win32"
    ? root.replaceAll("\\", "\\\\")
    : root.replaceAll("/", "\\u002f");
  const serverFile = path.join(root, "scripts", "config-server.mjs");
  const codexHome = path.join(root, "codex");
  fs.mkdirSync(path.dirname(serverFile), { recursive: true });
  fs.copyFileSync(serverSource, serverFile);
  for (const [id, name, model, reasoningEffort] of [
    ["llm-wiki-agent-memory-daily", "LLM Wiki Agent Memory - Daily", "user-selected-daily", "high"],
    ["llm-wiki-agent-memory-weekly", "LLM Wiki Agent Memory - Weekly", "user-selected-weekly", "low"],
  ]) {
    const automationDir = path.join(codexHome, "automations", id);
    fs.mkdirSync(automationDir, { recursive: true });
    fs.writeFileSync(path.join(automationDir, "automation.toml"), [
      `id = "${id}"`,
      `name = "${name}"`,
      'status = "ACTIVE"',
      `model = "${model}"`,
      `reasoning_effort = "${reasoningEffort}"`,
      `cwds = ["${tomlRoot}"]`,
      "",
    ].join("\n"));
  }

  const port = await freePort();
  const child = spawn(process.execPath, [serverFile, `--port=${port}`], {
    cwd: root,
    env: { ...process.env, HOME: path.join(root, "home"), CODEX_HOME: codexHome },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  await waitForStartup(child);

  const base = `http://127.0.0.1:${port}`;
  const rejected = await fetch(`${base}/api/config`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    },
    body: "{}",
  });
  assert.equal(rejected.status, 415);

  const accepted = await fetch(`${base}/api/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(accepted.status, 200);
  const config = await accepted.json();
  assert.equal(config.dailyAutoTime, "17:00");
  assert.equal(config.weeklyAutoDay, "5");
  assert.equal(config.weeklyAutoTime, "17:30");
  assert.equal(config.dailySummaryDetail, "detailed");
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.automation.codexApp.daily.model, "user-selected-daily");
  assert.equal(status.automation.codexApp.daily.reasoningEffort, "high");
  assert.equal(status.automation.codexApp.weekly.model, "user-selected-weekly");
  assert.equal(status.automation.codexApp.weekly.reasoningEffort, "low");
  const url = `http://127.0.0.1:${port}/api/config`;
  const save = async (dailySummaryDetail) => (await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dailySummaryDetail }),
  })).json();
  assert.equal((await save("concise")).dailySummaryDetail, "concise");
  assert.equal((await save("verbose")).dailySummaryDetail, "detailed");
});

test("config server copies UTF-8 prompts when launchd provides no locale", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-memory-clipboard-"));
  const serverFile = path.join(root, "scripts", "config-server.mjs");
  const binDir = path.join(root, "bin");
  const clipboardOutput = path.join(root, "clipboard.txt");
  const localeOutput = path.join(root, "locale.txt");
  fs.mkdirSync(path.dirname(serverFile), { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.copyFileSync(serverSource, serverFile);

  const fakePbcopy = path.join(binDir, "pbcopy");
  fs.writeFileSync(fakePbcopy, [
    "#!/bin/sh",
    'printf "%s" "$LC_CTYPE" > "$LOCALE_OUTPUT"',
    'cat > "$CLIPBOARD_OUTPUT"',
    "",
  ].join("\n"));
  fs.chmodSync(fakePbcopy, 0o755);
  const fakeOpen = path.join(binDir, "open");
  fs.writeFileSync(fakeOpen, [
    "#!/bin/sh",
    'if [ "$1" = "-a" ] && [ "$2" = "Finder" ]; then sleep 1; fi',
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeOpen, 0o755);
  const bashEnv = path.join(root, "bash-env.sh");
  fs.writeFileSync(bashEnv, `export PATH="${binDir}:/usr/bin:/bin"\n`);

  const env = {
    ...process.env,
    HOME: path.join(root, "home"),
    CODEX_HOME: path.join(root, "codex"),
    PATH: `${binDir}:${process.env.PATH}`,
    CLIPBOARD_OUTPUT: clipboardOutput,
    LOCALE_OUTPUT: localeOutput,
    BASH_ENV: bashEnv,
  };
  delete env.LANG;
  delete env.LC_CTYPE;

  const port = await freePort();
  const child = spawn(process.execPath, [serverFile, `--port=${port}`], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  await waitForStartup(child);

  const response = await fetch(`http://127.0.0.1:${port}/api/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "prepare-codex-recent-week", config: {} }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.code, 0);
  assert.equal(fs.readFileSync(localeOutput, "utf8"), "en_US.UTF-8");
  const prompt = fs.readFileSync(clipboardOutput, "utf8");
  assert.match(prompt, /^整理最近一周的 LLM wiki memory。/);
  assert.match(prompt, /为这个日期启动一个新的子 agent（独立线程\/上下文，不是父 agent 自己继续处理）/);
  assert.match(prompt, /只传 repo、日期和 skill 路径，不携带前几天的编译内容/);
  assert.match(prompt, /metadata → persisted Snapshot 路径，以固定大小、互不重叠的片段顺序读取完整文件/);
  assert.match(prompt, /固定大小、互不重叠的片段顺序读取完整文件/);
  assert.match(prompt, /included \/ omitted 是证据筛选统计，不是传输数量/);
  assert.match(prompt, /Evidence Snapshot 路径/);
  assert.match(prompt, /included \/ omitted turn 数/);
  assert.match(prompt, /7 个日期都完成或明确 skipped 后/);
  assert.match(prompt, /禁止搜索或回放旧 agent session 里的 reconcile 结果/);

  const automationResponse = await fetch(`http://127.0.0.1:${port}/api/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "prepare-codex-automation", config: {} }),
  });
  assert.equal(automationResponse.status, 200);
  const automationResult = await automationResponse.json();
  assert.equal(automationResult.code, 0);
  const automationPrompt = fs.readFileSync(clipboardOutput, "utf8");
  assert.match(automationPrompt, /read `\.agent\/skills\/ai-session-wiki-ingest\/SKILL\.md` completely and follow it as the sole workflow source of truth/);
  assert.match(automationPrompt, /read `\.agent\/skills\/agent-memory-reconcile\/SKILL\.md` completely and follow it as the sole workflow source of truth/);
  assert.match(automationPrompt, /Preserve the current model and reasoning effort when updating/);
  assert.match(automationPrompt, /creation default model: gpt-5\.6-luna[\s\S]*?creation default reasoning effort: medium/);
  assert.match(automationPrompt, /creation default model: gpt-5\.6-sol[\s\S]*?creation default reasoning effort: medium/);
  assert.doesNotMatch(automationPrompt, /automation memory files|fresh `gpt-5\.6-.*` subagent|latest seven Daily pages/);
  assert.match(fs.readFileSync(appSource, "utf8"), /entry\.model[\s\S]*?reasoningEffort/);

  const openStartedAt = Date.now();
  const openResponse = await fetch(`http://127.0.0.1:${port}/api/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "open-vault", config: {} }),
  });
  const openResult = await openResponse.json();
  assert.equal(openResult.code, 0);
  assert.equal(Object.hasOwn(openResult, "status"), false);
  assert.ok(Date.now() - openStartedAt < 750, "open action waited for Finder");
});

test("config server copies prompts and opens Codex on Windows", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-memory-windows-codex-"));
  const serverFile = path.join(root, "scripts", "config-server.mjs");
  const binDir = path.join(root, "bin");
  const clipboardOutput = path.join(root, "clipboard.txt");
  const commandOutput = path.join(root, "command.txt");
  fs.mkdirSync(path.dirname(serverFile), { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.copyFileSync(serverSource, serverFile);

  fs.writeFileSync(path.join(binDir, "clip.exe"), "#!/bin/sh\ncat > \"$CLIPBOARD_OUTPUT\"\n");
  fs.writeFileSync(path.join(binDir, "cmd.exe"), "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$COMMAND_OUTPUT\"\n");
  fs.chmodSync(path.join(binDir, "clip.exe"), 0o755);
  fs.chmodSync(path.join(binDir, "cmd.exe"), 0o755);
  const bashEnv = path.join(root, "bash-env.sh");
  fs.writeFileSync(bashEnv, `export PATH="${binDir}:/bin"\n`);

  const port = await freePort();
  const child = spawn(process.execPath, [serverFile, `--port=${port}`], {
    cwd: root,
    env: {
      ...process.env,
      HOME: path.join(root, "home"),
      PATH: `${binDir}:/bin`,
      BASH_ENV: bashEnv,
      CLIPBOARD_OUTPUT: clipboardOutput,
      COMMAND_OUTPUT: commandOutput,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  await waitForStartup(child);

  const base = `http://127.0.0.1:${port}`;
  const runResponse = await fetch(`${base}/api/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "prepare-codex-automation", config: {} }),
  });
  const runResult = await runResponse.json();
  assert.equal(runResult.code, 0);
  assert.ok(fs.existsSync(clipboardOutput), runResult.output);
  assert.match(fs.readFileSync(clipboardOutput, "utf8"), /^Create or update these two Codex App Automations/);
  assert.match(fs.readFileSync(commandOutput, "utf8"), /codex:\/\/threads\/new/);

  const clipboardResponse = await fetch(`${base}/api/clipboard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Windows clipboard" }),
  });
  assert.equal(clipboardResponse.status, 200);
  assert.equal(fs.readFileSync(clipboardOutput, "utf8"), "Windows clipboard");
});
