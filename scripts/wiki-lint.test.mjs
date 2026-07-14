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

function captureCard({ date, id, agent = "Codex", source = "~/.codex/sessions/example.jsonl", containsVaultAnswer = false }) {
  return `${JSON.stringify({
    snapshot_kind: "bounded_daily_evidence",
    included_turns: 0,
    omitted_turns: 0,
    snapshot_mode: "all-turns",
    date,
    evidence_card_count: 1,
    contains_vault_answer: containsVaultAnswer,
    cards: [{ evidence_id: id, agent, source_file: source, turns: [] }],
  }, null, 2)}\n`;
}

function evidenceLink(date, id, agent = "Codex") {
  return `- 证据来源：[${agent} · ${id}](../../../.vault-meta/captures/ai-chats/${date}.capture.json#${id})`;
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
    path.join(tmp, ".vault-meta", "captures", "ai-chats", "2026-07-01.capture.json"),
    captureCard({ date: "2026-07-01", id: "codex-example" }),
  );
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-01.md"),
    `---
date: 2026-07-01
lookup_keys: [PROJ-123456, rcvnc, source-map]
confidence: high
contains_vault_answer: false
---

# 2026-07-01 AI 协作总结

## 摘要

- PROJ-123456 验证了 build output。

## 关键会话

### Runtime artifact

${evidenceLink("2026-07-01", "codex-example")}

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
  assert.match(report, /Unexpected frontmatter field: source_links/);
  assert.match(report, /confidence must be high, medium, or low/);
  assert.match(report, /contains_vault_answer must be true or false/);
});

test("wiki lint accepts a concise valid Daily page without content heuristics", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-valid-"));
  seedCore(tmp);
  write(path.join(tmp, ".vault-meta", "config.json"), '{"dailySummaryDetail":"concise"}\n');
  const source = path.join(tmp, "sessions", "example.jsonl");
  write(source, "{}\n");
  write(
    path.join(tmp, ".vault-meta", "captures", "ai-chats", "2026-07-03.capture.json"),
    captureCard({ date: "2026-07-03", id: "codex-example", source, containsVaultAnswer: true }),
  );
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-03.md"),
    `---
date: 2026-07-03
lookup_keys: []
confidence: medium
contains_vault_answer: true
---

## 摘要

- 修复完成。

## 关键会话

### Fix verification

${evidenceLink("2026-07-03", "codex-example")}

- 验证通过。

## 可复用经验

- 无。
`,
  );

  const { json } = runLint(tmp, true);
  assert.equal(json.issues.length, 0);
});

test("wiki lint enforces the Capture-derived flag and at most three topic links", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-topic-limits-"));
  const date = "2026-07-08";
  seedCore(tmp);
  write(path.join(tmp, ".vault-meta", "config.json"), '{"dailySummaryDetail":"concise"}\n');
  const cards = Array.from({ length: 4 }, (_, index) => ({
    evidence_id: `codex-card-${index + 1}`,
    agent: "Codex",
    source_file: `~/.codex/sessions/card-${index + 1}.jsonl`,
    turns: [],
  }));
  write(
    path.join(tmp, ".vault-meta", "captures", "ai-chats", `${date}.capture.json`),
    `${JSON.stringify({
      snapshot_kind: "bounded_daily_evidence",
      included_turns: 0,
      omitted_turns: 0,
      snapshot_mode: "all-turns",
      date,
      evidence_card_count: cards.length,
      contains_vault_answer: true,
      cards,
    }, null, 2)}\n`,
  );
  const links = cards.map((card) => `[Codex · ${card.evidence_id}](../../../.vault-meta/captures/ai-chats/${date}.capture.json#${card.evidence_id})`).join("、");
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", `${date}.md`),
    `---
date: ${date}
lookup_keys: []
confidence: medium
contains_vault_answer: false
---

## 摘要

- 调查完成。

## 关键会话

### Too many sources

- 证据来源：${links}

- 结果已验证。

## 可复用经验

- 无。
`,
  );

  const { report } = runLint(tmp);
  assert.match(report, /contains_vault_answer must match Capture: expected true/);
  assert.match(report, /must link one to three Evidence Cards/);
});

test("wiki lint rejects topic evidence links that do not resolve to a dated capture card", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-sources-"));
  seedCore(tmp);
  write(
    path.join(tmp, ".vault-meta", "captures", "ai-chats", "2026-07-05.capture.json"),
    captureCard({ date: "2026-07-05", id: "codex-listed" }),
  );
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-05.md"),
    `---
date: 2026-07-05
lookup_keys: []
confidence: low
contains_vault_answer: false
---

## 摘要

- 缺失来源。

## 关键会话

### Missing provenance

${evidenceLink("2026-07-05", "codex-missing")}

- 无。

## 可复用经验

- 无。
`,
  );

  const { report } = runLint(tmp);
  assert.match(report, /links missing Evidence ID: codex-missing/);
});

test("wiki lint requires every topic link to preserve the capture Agent label", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-agent-"));
  seedCore(tmp);
  write(
    path.join(tmp, ".vault-meta", "captures", "ai-chats", "2026-07-06.capture.json"),
    captureCard({ date: "2026-07-06", id: "claude-session", agent: "Claude Code", source: "~/.claude/projects/example/session.jsonl" }),
  );
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-06.md"),
    `---
date: 2026-07-06
lookup_keys: []
confidence: low
contains_vault_answer: false
---

## 摘要

- 调查完成。

## 关键会话

### Agent provenance

${evidenceLink("2026-07-06", "claude-session", "Codex")}

- 结果已验证。

## 可复用经验

- 无。
`,
  );

  const { report } = runLint(tmp);
  assert.match(report, /must label claude-session as "Claude Code · claude-session"/);
});

test("wiki lint rejects page-wide provenance and raw JSONL paths in Daily content", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-provenance-"));
  seedCore(tmp);
  write(
    path.join(tmp, ".vault-meta", "captures", "ai-chats", "2026-07-07.capture.json"),
    captureCard({ date: "2026-07-07", id: "codex-session" }),
  );
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-07.md"),
    `---
date: 2026-07-07
lookup_keys: []
confidence: low
contains_vault_answer: false
---

## 摘要

- 调查完成。

## 关键会话

- 证据来源：当天全部 cards

### Exact topic

${evidenceLink("2026-07-07", "codex-session")}

- 不应直接链接 /Users/example/.codex/sessions/2026/07/07/raw.jsonl。

## 可复用经验

- 无。
`,
  );

  const { report } = runLint(tmp);
  assert.match(report, /page-wide provenance or preamble is not allowed/);
  assert.match(report, /Daily must link capture Evidence Cards, not raw Codex or Claude JSONL paths/);
});

test("wiki lint rejects a shallow Daily when detailed capture evidence exists", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-lint-detailed-"));
  seedCore(tmp);
  write(path.join(tmp, ".vault-meta", "config.json"), '{"dailySummaryDetail":"detailed"}\n');
  const capture = JSON.parse(captureCard({ date: "2026-07-04", id: "codex-detailed" }));
  capture.evidence_card_count = 2;
  write(
    path.join(tmp, ".vault-meta", "captures", "ai-chats", "2026-07-04.capture.json"),
    `${JSON.stringify(capture, null, 2)}\n`,
  );
  write(
    path.join(tmp, "wiki", "sources", "ai-chats", "2026-07-04.md"),
    `---
date: 2026-07-04
lookup_keys: []
confidence: high
contains_vault_answer: false
---

## 摘要

- 修复完成。

## 关键会话

### Verification

${evidenceLink("2026-07-04", "codex-detailed")}

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
