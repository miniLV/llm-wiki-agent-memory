import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverSource = path.join(repoRoot, "scripts", "config-server.mjs");

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

test("config server rejects simple cross-site POSTs and uses 5 PM schedule defaults", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent memory path with spaces "));
  const serverFile = path.join(root, "scripts", "config-server.mjs");
  fs.mkdirSync(path.dirname(serverFile), { recursive: true });
  fs.copyFileSync(serverSource, serverFile);

  const port = await freePort();
  const child = spawn(process.execPath, [serverFile, `--port=${port}`], {
    cwd: root,
    env: { ...process.env, HOME: path.join(root, "home"), CODEX_HOME: path.join(root, "codex") },
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
  assert.equal(config.weeklyAutoTime, "17:00");
  assert.equal(config.dailySummaryDetail, "detailed");
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
  fs.writeFileSync(fakeOpen, "#!/bin/sh\nexit 0\n");
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
  assert.match(prompt, /禁止广泛搜索旧 Codex \/ Claude 会话/);
  assert.match(prompt, /现有 Daily 只能在 fresh candidate 完成后用于防回退比较/);
  assert.match(prompt, /只有 7 个日期都成功完成或属于 legitimate no-evidence skip 时/);
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
  assert.match(automationPrompt, /Read `\.agent\/skills\/ai-session-wiki-ingest\/SKILL\.md` completely and follow it as the source of truth/);
  assert.match(automationPrompt, /Read `\.agent\/skills\/agent-memory-reconcile\/SKILL\.md` completely and follow it as the source of truth/);
});
