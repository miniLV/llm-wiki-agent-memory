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
  const [resultLine, ...lines] = stdout.split("\n");
  const marker = "--- SYNTHESIS PACKET ---";
  const body = lines.join("\n");
  return {
    result: JSON.parse(resultLine),
    packet: body.includes(marker) ? body.slice(body.indexOf(marker) + marker.length).trimStart() : "",
  };
}

test("prepare emits one bounded packet and verify checks the Daily locally", () => {
  const { root, helper } = setupRoot("daily-memory-workflow-");
  const date = "2099-01-02";
  write(path.join(root, "scripts", "capture-ai-chats.mjs"), `
    import fs from "node:fs";
    import path from "node:path";
    const date = process.argv[2];
    const dir = path.join(process.cwd(), ".vault-meta", "captures", "ai-chats");
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
        { turn_number: 1, goal: "Investigate", outcomes: [], score: 2 },
        { turn_number: 2, goal: "Find root cause", outcomes: [{ text: "Verified fix" }], score: 10 },
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
      turns: [{ turn_number: 1, goal: "Review", outcomes: [{ text: "Review complete" }], score: 8 }],
    }];
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, \`${date}.capture.json\`), JSON.stringify({
      capture_version: 9,
      date,
      generated_at: new Date().toISOString(),
      capture_end_timestamp: null,
      evidence_card_count: cards.length,
      contains_vault_answer: false,
      warnings: [],
      cards,
    }));
  `);
  write(path.join(root, "scripts", "wiki-lint.mjs"), `
    import fs from "node:fs";
    import path from "node:path";
    const file = path.join(process.cwd(), ".vault-meta", "reviews", "wiki-lint-latest.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ issues: [] }));
  `);

  const legacyCapturePath = path.join(root, ".vault-meta", "captures", "ai-chats", `${date}.md`);
  write(legacyCapturePath, "legacy capture\n");
  const prepared = spawnSync(process.execPath, [helper, "prepare", date, "--emit-packet"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(prepared.status, 0, prepared.stderr);
  const { result, packet } = parsePrepare(prepared.stdout);
  assert.equal(result.status, "ready");
  assert.equal(result.evidenceCards, 2);
  assert.equal(result.captureTurns, 3);
  assert.equal(result.includedTurns, 3);
  assert.equal(result.omittedTurns, 0);
  assert.equal(result.packetMode, "all-turns");
  assert.equal(result.packetLimitBytes, 96 * 1024);
  assert.equal(result.packetBytes, Buffer.byteLength(packet));
  assert.match(packet, /codex-test-1/);
  assert.match(packet, /claude-test-2/);
  assert.match(packet, /Verified fix/);
  assert.match(packet, /Carryover deployment completed/);
  assert.match(packet, /carryover=1/);
  assert.match(packet, /Last activity: 2099-01-02T08:00:00\.000Z/);
  assert.match(packet, /--- END SYNTHESIS PACKET cards=2 included_turns=3 omitted_turns=0 ---\n$/);
  assert.doesNotMatch(packet, /daily-coverage|drill-down|raw-slice/);
  assert.equal(fs.existsSync(legacyCapturePath), true);

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
  assert.match(JSON.parse(stale.stdout).failure, /Daily page was not written after current Capture/);
  assert.equal(fs.existsSync(legacyCapturePath), true);

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
  assert.equal(fs.existsSync(legacyCapturePath), false);
});

test("prepare drops low-priority turns instead of blocking when the packet is oversized", () => {
  const { root, helper } = setupRoot("daily-memory-workflow-overflow-");
  const date = "2099-01-03";
  write(path.join(root, "scripts", "capture-ai-chats.mjs"), `
    import fs from "node:fs";
    import path from "node:path";
    const date = process.argv[2];
    const dir = path.join(process.cwd(), ".vault-meta", "captures", "ai-chats");
    const cards = Array.from({ length: 30 }, (_, cardIndex) => ({
      evidence_id: \`card-\${String(cardIndex).padStart(2, "0")}\`,
      agent: "Codex",
      repo: "repo",
      cwd: "/tmp/repo",
      source_file: \`/tmp/session-\${cardIndex}.jsonl\`,
      last_timestamp: "2099-01-03T09:00:00.000Z",
      counts: { user_turns: 20, final_outcomes: 19, turns_without_final_outcome: 1 },
      warnings: [],
      turns: Array.from({ length: 20 }, (_, turnIndex) => ({
        turn_number: turnIndex + 1,
        goal: (turnIndex === 0 ? \`LOW_VALUE_\${cardIndex} \` : turnIndex === 10 ? \`HIGH_VALUE_\${cardIndex} \` : turnIndex === 19 ? \`LATEST_\${cardIndex} \` : "routine ") + "g".repeat(300),
        outcomes: turnIndex === 0 ? [] : [{ text: "result " + "r".repeat(500) }],
        latest_unresolved_state: turnIndex === 0 ? { text: "Still investigating" } : null,
        unresolved: turnIndex === 0,
        score: turnIndex === 10 ? 1000 : turnIndex === 0 ? 2 : 10,
      })),
    }));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, \`${date}.capture.json\`), JSON.stringify({
      capture_version: 9,
      date,
      generated_at: new Date().toISOString(),
      evidence_card_count: cards.length,
      contains_vault_answer: false,
      warnings: [],
      cards,
    }));
  `);

  const prepared = spawnSync(process.execPath, [helper, "prepare", date, "--emit-packet"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(prepared.status, 0, prepared.stderr);
  const { result, packet } = parsePrepare(prepared.stdout);
  assert.equal(result.status, "ready");
  assert.equal(result.packetMode, "priority-trim");
  assert.equal(result.captureTurns, 600);
  assert.ok(result.omittedTurns > 0);
  assert.equal(result.includedTurns + result.omittedTurns, 600);
  assert.ok(result.packetBytes <= result.packetLimitBytes);
  assert.match(packet, /HIGH_VALUE_0/);
  assert.match(packet, /LATEST_0/);
  assert.doesNotMatch(packet, /LOW_VALUE_0/);
  for (let cardIndex = 0; cardIndex < 30; cardIndex += 1) {
    assert.match(packet, new RegExp(`card-${String(cardIndex).padStart(2, "0")}`));
  }
  assert.match(packet, /lower-priority turns omitted locally/);
  assert.match(packet, /--- END SYNTHESIS PACKET cards=30 included_turns=\d+ omitted_turns=\d+ ---\n$/);
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
      capture_version: 9,
      date,
      generated_at: new Date().toISOString(),
      evidence_card_count: 0,
      contains_vault_answer: false,
      warnings: [],
      cards: [],
    }));
  `);

  const prepared = spawnSync(process.execPath, [helper, "prepare", date, "--emit-packet"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(prepared.status, 0, prepared.stderr);
  const { result, packet } = parsePrepare(prepared.stdout);
  assert.equal(result.status, "skipped_no_sources");
  assert.equal(packet, "");
});
