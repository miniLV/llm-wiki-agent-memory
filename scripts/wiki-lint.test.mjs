import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "wiki-lint.mjs");

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function seedCore(root, rules = "No promoted rules yet.\n") {
  write(path.join(root, "wiki", "index.md"), "# Engineering Memory Index\n");
  write(path.join(root, "wiki", "log.md"), "# Operation Log\n");
  write(path.join(root, "wiki", "guardrails", "Agent Behavior Rules.md"), `# Agent Behavior Rules\n\n${rules}`);
}

function runLint(root, strict = false) {
  execFileSync(process.execPath, [script, ...(strict ? ["--strict"] : [])], {
    cwd: repoRoot,
    env: { ...process.env, LLM_WIKI_ROOT: root },
  });
  const report = fs.readFileSync(path.join(root, ".vault-meta", "reviews", "wiki-lint-latest.md"), "utf8");
  const json = JSON.parse(fs.readFileSync(path.join(root, ".vault-meta", "reviews", "wiki-lint-latest.json"), "utf8"));
  return { report, json };
}

test("wiki lint detects broken links and the behavior-rule cap", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-"));
  const rules = Array.from({ length: 11 }, (_, index) => `${index + 1}. Rule ${index + 1} [[Runtime Artifact Verification]]`).join("\n");
  seedCore(tmp, `${rules}\n`);
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-01.md"),
    `---
date: 2026-07-01
source_links:
  - ~/.codex/sessions/example.jsonl
lookup_keys: [PROJ-123456, rcvnc, source-map]
confidence: high
contains_vault_answer: false
---

# 2026-07-01 AI 协作总结

## 摘要

- PROJ-123456 验证了 build output。

## 关键会话

- 确认旧行为来自未重新构建的 bundle。

## 可复用经验

- 先验证运行产物。[[Missing Page]]
`,
  );
  write(path.join(tmp, "wiki", "concepts", "Runtime Artifact Verification.md"), "# Runtime Artifact Verification\n\nEvidence: [[sources/ai-chats/2026-07-01]]\n");

  const { report, json } = runLint(tmp);
  assert.match(report, /Broken wikilink: \[\[Missing Page\]\]/);
  assert.match(report, /Promoted behavior rules exceed cap: 11\/10/);
  assert.equal(json.stats.dailyPages, 1);
  assert.equal(json.stats.promotedRules, 11);
});

test("wiki lint enforces only the stable Daily schema", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-schema-"));
  seedCore(tmp);
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-02.md"),
    `---
date: 2026-07-01
source_links: []
lookup_keys: []
confidence: certain
contains_vault_answer: mixed
tickets: [BILLING7-88]
---

## 摘要

- BILLING7-88 调查。

## 关键会话

- 检查 API response。

## 可复用经验

- 无。
`,
  );

  const { report } = runLint(tmp);
  assert.match(report, /Unexpected frontmatter field: tickets/);
  assert.match(report, /Frontmatter date must match filename: 2026-07-02/);
  assert.match(report, /source_links must include at least one original session file/);
  assert.match(report, /confidence must be high, medium, or low/);
  assert.match(report, /contains_vault_answer must be true or false/);
});

test("wiki lint accepts a concise valid Daily page without content heuristics", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-valid-"));
  seedCore(tmp);
  const source = path.join(tmp, "sessions", "example.jsonl");
  write(source, "{}\n");
  write(
    path.join(tmp, ".vault-meta", "captures", "ai-chats", "2026-07-03.md"),
    `- Source file: ${source}\n`,
  );
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-03.md"),
    `---
date: 2026-07-03
source_links: [${source}]
lookup_keys: []
confidence: medium
contains_vault_answer: true
---

## 摘要

- 修复完成。

## 关键会话

- 验证通过。

## 可复用经验

- 无。
`,
  );

  const { json } = runLint(tmp, true);
  assert.equal(json.issues.length, 0);
});

test("wiki lint rejects Daily source links that are missing or absent from the dated capture", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-sources-"));
  seedCore(tmp);
  const listed = path.join(tmp, "sessions", "listed.jsonl");
  const missing = path.join(tmp, "sessions", "missing.jsonl");
  write(listed, "{}\n");
  write(
    path.join(tmp, ".vault-meta", "captures", "ai-chats", "2026-07-05.md"),
    `- Source file: ${listed}\n`,
  );
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-05.md"),
    `---
date: 2026-07-05
source_links: [${missing}]
lookup_keys: []
confidence: low
contains_vault_answer: false
---

## 摘要

- 缺失来源。

## 关键会话

- 无。

## 可复用经验

- 无。
`,
  );

  const { report } = runLint(tmp);
  assert.match(report, /source_link does not exist/);
  assert.match(report, /source_link is not listed by the dated capture/);
});

test("wiki lint rejects a shallow Daily when detailed capture evidence exists", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-detailed-"));
  seedCore(tmp);
  write(path.join(tmp, ".vault-meta", "config.json"), '{"dailySummaryDetail":"detailed"}\n');
  write(
    path.join(tmp, ".vault-meta", "captures", "ai-chats", "2026-07-04.md"),
    "## Capture Summary\n\n- Evidence cards: 2\n",
  );
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-04.md"),
    `---
date: 2026-07-04
source_links: [~/.codex/sessions/example.jsonl]
lookup_keys: []
confidence: high
contains_vault_answer: false
---

## 摘要

- 修复完成。

## 关键会话

- 验证通过。

## 可复用经验

- 无。
`,
  );

  const { report } = runLint(tmp);
  assert.match(report, /Detailed Daily is too shallow/);
  assert.match(report, /must preserve problem or goal/);
  assert.match(report, /must preserve impact or follow-up/);
});

test("wiki lint reports concepts without Daily evidence", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-concept-"));
  seedCore(tmp);
  write(path.join(tmp, "wiki", "concepts", "Unlinked Pattern.md"), "# Unlinked Pattern\n\nAlways inspect the runtime.\n");

  const { report } = runLint(tmp);
  assert.match(report, /Concept has no obvious Daily evidence link or date/);
});

test("wiki lint treats the empty starter as non-failing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-empty-"));
  seedCore(tmp);

  const { json } = runLint(tmp, true);
  assert.equal(json.issues.filter((issue) => issue.severity === "error").length, 0);
  assert.equal(json.stats.dailyPages, 0);
  assert.equal(json.stats.concepts, 0);
  assert.equal("canvases" in json.stats, false);
});
