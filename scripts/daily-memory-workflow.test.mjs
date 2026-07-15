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
  return {
    result: JSON.parse(resultLine),
  };
}

function readAllChunks(helper, root, date) {
  const chunks = [];
  for (let expected = 1; expected <= 1000; expected++) {
    const run = spawnSync(process.execPath, [helper, "read", date], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    if (run.stdout.startsWith("{")) {
      const done = JSON.parse(run.stdout);
      assert.equal(done.done, true);
      assert.equal(chunks.length, done.totalChunks);
      return chunks;
    }
    const header = run.stdout.match(/^CHUNK (\d+)\/(\d+)\n/);
    assert.ok(header);
    assert.equal(Number(header[1]), expected);
    const label = `${header[1]}/${header[2]}`;
    const endMarker = `\nEND CHUNK ${label}\n`;
    assert.equal(run.stdout.endsWith(endMarker), true);
    chunks.push(run.stdout.slice(header[0].length, run.stdout.length - endMarker.length));
  }
  assert.fail("chunk reader did not finish");
}

test("prepare reports the persisted Evidence Snapshot path and verify checks the Daily locally", () => {
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

  const prepared = spawnSync(process.execPath, [helper, "prepare", date], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(prepared.status, 0, prepared.stderr);
  const { result } = parsePrepare(prepared.stdout);
  const persistedSnapshot = fs.readFileSync(path.join(root, ".vault-meta", "captures", "ai-chats", `${date}.capture.json`), "utf8");
  assert.equal(result.status, "ready");
  assert.equal(result.evidenceCards, 2);
  assert.equal(result.captureTurns, 3);
  assert.equal(result.includedTurns, 3);
  assert.equal(result.omittedTurns, 0);
  assert.equal(result.snapshotMode, "all-turns");
  assert.equal(result.snapshotPersisted, true);
  assert.equal(result.evidenceSnapshot, `.vault-meta/captures/ai-chats/${date}.capture.json`);
  assert.equal("snapshotLimitBytes" in result, false);
  assert.equal(result.snapshotBytes, Buffer.byteLength(persistedSnapshot));
  assert.doesNotMatch(prepared.stdout, /EVIDENCE SNAPSHOT/);
  assert.match(persistedSnapshot, /codex-test-1/);
  assert.match(persistedSnapshot, /claude-test-2/);
  assert.match(persistedSnapshot, /GOAL_END_SENTINEL/);
  assert.match(persistedSnapshot, /OUTCOME_END_SENTINEL/);
  assert.match(persistedSnapshot, /Carryover deployment completed/);
  assert.doesNotMatch(persistedSnapshot, /\[truncated\]|field compacted locally/);

  const obsoleteEmit = spawnSync(process.execPath, [helper, "prepare", date, "--emit-snapshot"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(obsoleteEmit.status, 1);
  assert.match(obsoleteEmit.stderr, /Usage:/);

  const unread = spawnSync(process.execPath, [helper, "verify", date], { cwd: root, encoding: "utf8" });
  assert.equal(unread.status, 1);
  assert.match(JSON.parse(unread.stdout).failure, /read ledger incomplete/);

  assert.equal(readAllChunks(helper, root, date).join(""), persistedSnapshot);

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

  const prepared = spawnSync(process.execPath, [helper, "prepare", date], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(prepared.status, 0, prepared.stderr);
  const { result } = parsePrepare(prepared.stdout);
  assert.equal(result.status, "skipped_no_sources");
  assert.doesNotMatch(prepared.stdout, /EVIDENCE SNAPSHOT/);
});

test("read serves helper-managed chunks with a completeness ledger", () => {
  const { root, helper } = setupRoot("daily-memory-workflow-read-");
  const date = "2099-01-06";
  write(path.join(root, "scripts", "capture-ai-chats.mjs"), `
    import fs from "node:fs";
    import path from "node:path";
    const date = process.argv[2];
    const dir = path.join(process.cwd(), ".vault-meta", "captures", "ai-chats");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, \`${date}.capture.json\`), JSON.stringify({
      snapshot_kind: "bounded_daily_evidence",
      included_turns: 1,
      omitted_turns: 0,
      snapshot_mode: "all-turns",
      date,
      generated_at: new Date().toISOString(),
      evidence_card_count: 1,
      contains_vault_answer: false,
      warnings: [],
      cards: [{
        evidence_id: "codex-big-1",
        turns: [{ turn_number: 1, goal: "\\u{1F4A1}".repeat(9000), outcomes: [{ text: "done" }] }],
      }],
    }));
  `);
  write(path.join(root, "scripts", "wiki-lint.mjs"), `
    import fs from "node:fs";
    import path from "node:path";
    const file = path.join(process.cwd(), ".vault-meta", "reviews", "wiki-lint-latest.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ issues: [] }));
  `);

  const prepared = spawnSync(process.execPath, [helper, "prepare", date], { cwd: root, encoding: "utf8" });
  assert.equal(prepared.status, 0, prepared.stderr);
  const { result } = parsePrepare(prepared.stdout);
  assert.equal(result.status, "ready");

  const snapshotPath = path.join(root, ".vault-meta", "captures", "ai-chats", `${date}.capture.json`);
  const snapshot = fs.readFileSync(snapshotPath, "utf8");
  const chunks = readAllChunks(helper, root, date);
  assert.equal(chunks.length >= 3, true);
  for (const [index, payload] of chunks.entries()) {
    const first = payload.charCodeAt(0);
    const last = payload.charCodeAt(payload.length - 1);
    assert.equal(first >= 0xdc00 && first <= 0xdfff, false, `chunk ${index + 1} starts on a lone low surrogate`);
    assert.equal(last >= 0xd800 && last <= 0xdbff, false, `chunk ${index + 1} ends on a lone high surrogate`);
  }
  assert.equal(chunks.join(""), snapshot);
  // a 7999-char chunk proves the boundary was shifted off a surrogate pair
  assert.equal(chunks.some((chunk) => chunk.length === 7999), true);

  const tampered = { ...JSON.parse(snapshot), generated_at: "2099-01-06T23:59:59.000Z" };
  fs.writeFileSync(snapshotPath, JSON.stringify(tampered), "utf8");
  const changed = spawnSync(process.execPath, [helper, "verify", date], { cwd: root, encoding: "utf8" });
  assert.equal(changed.status, 1);
  assert.match(JSON.parse(changed.stdout).failure, /read ledger incomplete|Snapshot changed after chunk reads/);
  const changedRead = spawnSync(process.execPath, [helper, "read", date], { cwd: root, encoding: "utf8" });
  assert.equal(changedRead.status, 1);
  assert.match(changedRead.stderr, /Evidence Snapshot changed after chunk reads began/);
});
