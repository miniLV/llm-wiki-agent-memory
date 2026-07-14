import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperSource = path.join(repoRoot, "scripts", "daily-memory-workflow.mjs");

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function setupRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const helper = path.join(root, "scripts", "daily-memory-workflow.mjs");
  fs.mkdirSync(path.dirname(helper), { recursive: true });
  fs.copyFileSync(helperSource, helper);
  write(path.join(root, "SCHEMA.md"), "# Schema authority\n");
  write(path.join(root, "wiki", "templates", "Daily AI Chat Summary Template.md"), "# Daily template\n");
  write(path.join(root, ".vault-meta", "config.json"), JSON.stringify({ dailySummaryDetail: "detailed" }));
  return { root, helper };
}

function parsePrepare(stdout) {
  const resultEnd = stdout.indexOf("\n");
  const resultLine = resultEnd === -1 ? stdout : stdout.slice(0, resultEnd);
  const marker = "\n--- EVIDENCE SNAPSHOT ---\n";
  const markerAt = stdout.indexOf(marker);
  return {
    result: JSON.parse(resultLine),
    snapshot: markerAt === -1 ? "" : stdout.slice(markerAt + marker.length),
  };
}

test("prepare emits the persisted Evidence Snapshot bytes once and verify checks the Daily locally", () => {
  const { root, helper } = setupRoot("daily-memory-workflow-");
  const date = "2099-01-02";
  write(path.join(root, "scripts", "capture-ai-chats.mjs"), `
    import fs from "node:fs";
    import path from "node:path";
    const date = process.argv[2];
    const dir = path.join(process.cwd(), ".vault-meta", "captures", "ai-chats");
    const longGoal = "GOAL_BEGIN " + "g".repeat(700) + " GOAL_END_SENTINEL";
    const longOutcome = "OUTCOME_BEGIN " + "o".repeat(900) + " OUTCOME_END_SENTINEL";
    const cards = [{
      evidence_id: "codex-test-1",
      agent: "Codex",
      repo: "example",
      cwd: "/tmp/example",
      source_file: "/tmp/session-1.jsonl",
      last_timestamp: "2099-01-02T08:00:00.000Z",
      counts: { user_turns: 2, final_outcomes: 1, carryover_outcomes: 1, turns_without_final_outcome: 1 },
      warnings: [],
      carryover_outcomes: [{ text: "Carryover deployment completed" }],
      turns: [
        { turn_number: 1, goal: "Investigate", outcomes: [] },
        {
          turn_number: 2,
          goal: longGoal,
          decisive_evidence: { text: "Root cause verified from the runtime artifact" },
          outcomes: [{ text: longOutcome }],
        },
      ],
    }, {
      evidence_id: "claude-test-2",
      agent: "Claude Code",
      repo: "example",
      cwd: "/tmp/example",
      source_file: "/tmp/session-2.jsonl",
      last_timestamp: "2099-01-02T09:00:00.000Z",
      counts: { user_turns: 1, final_outcomes: 1, turns_without_final_outcome: 0 },
      warnings: [],
      turns: [{ turn_number: 1, goal: "Review", outcomes: [{ text: "Review complete" }] }],
    }];
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, \`${date}.capture.json\`), JSON.stringify({
      snapshot_kind: "bounded_daily_evidence",
      included_turns: 3,
      omitted_turns: 0,
      snapshot_mode: "all-turns",
      date,
      generated_at: new Date().toISOString(),
      capture_end_timestamp: null,
      evidence_card_count: cards.length,
      contains_vault_answer: false,
      warnings: [],
      cards,
    }, null, 2) + "\\n");
  `);
  write(path.join(root, "scripts", "wiki-lint.mjs"), `
    import fs from "node:fs";
    import path from "node:path";
    const file = path.join(process.cwd(), ".vault-meta", "reviews", "wiki-lint-latest.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ issues: [] }));
  `);

  const prepared = spawnSync(process.execPath, [helper, "prepare", date, "--emit-snapshot"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(prepared.status, 0, prepared.stderr);
  const { result, snapshot } = parsePrepare(prepared.stdout);
  const persistedSnapshot = fs.readFileSync(path.join(root, ".vault-meta", "captures", "ai-chats", `${date}.capture.json`), "utf8");
  assert.equal(result.status, "ready");
  assert.equal(result.evidenceCards, 2);
  assert.equal(result.captureTurns, 3);
  assert.equal(result.includedTurns, 3);
  assert.equal(result.omittedTurns, 0);
  assert.equal(result.snapshotMode, "all-turns");
  assert.equal(result.snapshotPersisted, true);
  assert.equal("snapshotLimitBytes" in result, false);
  assert.equal(result.snapshotBytes, Buffer.byteLength(persistedSnapshot));
  assert.equal(snapshot, persistedSnapshot);
  assert.equal(prepared.stdout.split("--- EVIDENCE SNAPSHOT ---").length - 1, 1);
  assert.match(snapshot, /codex-test-1/);
  assert.match(snapshot, /claude-test-2/);
  assert.match(snapshot, /GOAL_END_SENTINEL/);
  assert.match(snapshot, /OUTCOME_END_SENTINEL/);
  assert.match(snapshot, /Carryover deployment completed/);
  assert.doesNotMatch(snapshot, /\[truncated\]|field compacted locally/);

  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const missing = spawnSync(process.execPath, [helper, "verify", date], { cwd: root, encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(JSON.parse(missing.stdout).failure, /Daily page missing/);

  const dailyPath = path.join(root, "wiki", "sources", "ai-chats", `${date}.md`);
  const dailyText = `---
date: ${date}
---

## 关键会话

### Test
- 证据来源：[Codex · codex-test-1](../../../.vault-meta/captures/ai-chats/${date}.capture.json#codex-test-1)
`;
  write(dailyPath, dailyText);
  fs.utimesSync(dailyPath, new Date(0), new Date(0));
  const stale = spawnSync(process.execPath, [helper, "verify", date], { cwd: root, encoding: "utf8" });
  assert.equal(stale.status, 1);
  assert.match(JSON.parse(stale.stdout).failure, /Daily page was not written after current Evidence Snapshot/);

  write(dailyPath, dailyText);
  const freshTime = new Date(Date.now() + 1000);
  fs.utimesSync(dailyPath, freshTime, freshTime);
  write(path.join(root, "wiki", "log.md"), "log\n");
  const verified = spawnSync(process.execPath, [helper, "verify", date], { cwd: root, encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  const verification = JSON.parse(verified.stdout);
  assert.equal(verification.ok, true);
  assert.equal(verification.logAppended, true);
  assert.match(verification.logEntry, /compiled/);
});

test("prepare reports skipped when a date has no source sessions", () => {
  const { root, helper } = setupRoot("daily-memory-workflow-skip-");
  const date = "2099-01-04";
  write(path.join(root, "scripts", "capture-ai-chats.mjs"), `
    import fs from "node:fs";
    import path from "node:path";
    const date = process.argv[2];
    const dir = path.join(process.cwd(), ".vault-meta", "captures", "ai-chats");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, \`${date}.capture.json\`), JSON.stringify({
      snapshot_kind: "bounded_daily_evidence",
      included_turns: 0,
      omitted_turns: 0,
      snapshot_mode: "all-turns",
      date,
      generated_at: new Date().toISOString(),
      evidence_card_count: 0,
      contains_vault_answer: false,
      warnings: [],
      cards: [],
    }));
  `);

  const prepared = spawnSync(process.execPath, [helper, "prepare", date, "--emit-snapshot"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(prepared.status, 0, prepared.stderr);
  const { result, snapshot } = parsePrepare(prepared.stdout);
  assert.equal(result.status, "skipped_no_sources");
  assert.equal(snapshot, "");
});
