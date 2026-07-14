import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "capture-ai-chats.mjs");
const marker = "<!-- llm-wiki-memory:derived -->";

function runCapture({ fakeHome, output, config, date = "2099-01-02", extraEnv = {} }) {
  execFileSync(process.execPath, [script, date], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: fakeHome,
      LLM_WIKI_CAPTURE_OUTPUT_PATH: output,
      LLM_WIKI_CAPTURE_CONFIG_PATH: config,
      ...extraEnv,
    },
  });
  return JSON.parse(fs.readFileSync(output, "utf8"));
}

function captureText(capture) {
  return JSON.stringify(capture);
}

test("capture writes one machine-readable evidence layer without Daily conclusions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(path.join(sessionDir, "rollout.jsonl"), [
    { timestamp: "2099-01-02T01:00:00Z", role: "user", content: "# AGENTS.md instructions for /tmp/project" },
    { timestamp: "2099-01-02T01:01:00Z", role: "user", content: "Implement multilingual UI without layout shift", cwd: "/tmp/project", model: "gpt-test" },
    { timestamp: "2099-01-02T01:02:00Z", role: "assistant", content: "Implemented the layout-stable language switcher." },
  ].map(JSON.stringify).join("\n") + "\n");

  const capture = runCapture({ fakeHome, output, config });
  const text = captureText(capture);
  assert.equal(capture.snapshot_kind, "bounded_daily_evidence");
  assert.equal("capture_version" in capture, false);
  assert.equal("snapshot_limit_bytes" in capture, false);
  assert.equal(capture.included_turns, 1);
  assert.equal(capture.omitted_turns, 0);
  assert.equal(capture.snapshot_mode, "all-turns");
  assert.equal(capture.evidence_card_count, 1);
  assert.match(capture.cards[0].evidence_id, /^codex-rollout-[0-9a-f]{10}$/);
  assert.equal(capture.cards[0].agent, "Codex");
  assert.equal(capture.contains_vault_answer, false);
  assert.match(text, /Implement multilingual UI without layout shift/);
  assert.match(text, /Implemented the layout-stable language switcher/);
  assert.doesNotMatch(text, /# AGENTS\.md instructions/);
  assert.doesNotMatch(JSON.stringify(capture.cards), /## 摘要|## 可复用经验/);
  assert.equal(fs.existsSync(output.replace(/\.capture\.json$/, ".model-input.json")), false);
  assert.equal(fs.existsSync(output.replace(/\.capture\.json$/, ".md")), false);
});

test("capture uses one binary flag even when user input follows a vault answer", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-derived-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(path.join(sessionDir, "rollout.jsonl"), [
    { timestamp: "2099-01-02T01:00:00Z", role: "user", content: "What happened last time?", cwd: "/tmp/project" },
    { timestamp: "2099-01-02T01:01:00Z", role: "assistant", content: `The Wiki says to verify the runtime artifact first.\n${marker}` },
    { timestamp: "2099-01-02T01:02:00Z", role: "user", content: "This fresh build still failed." },
    { timestamp: "2099-01-02T01:03:00Z", role: "assistant", content: "That needs a new investigation." },
  ].map(JSON.stringify).join("\n") + "\n");

  const capture = runCapture({ fakeHome, output, config });
  const text = captureText(capture);
  assert.equal(capture.contains_vault_answer, true);
  assert.equal(capture.cards[0].contains_vault_answer, true);
  assert.match(text, /This fresh build still failed/);
  assert.doesNotMatch(JSON.stringify(capture.cards), /memory-derived|Evidence origin|llm-wiki-memory:derived/);
});

test("schema owns the provenance marker and loader reads the schema", () => {
  const schema = fs.readFileSync(path.join(repoRoot, "SCHEMA.md"), "utf8");
  const loader = fs.readFileSync(path.join(repoRoot, ".agent", "skills", "engineering-memory-loader", "SKILL.md"), "utf8");
  assert.match(schema, /<!-- llm-wiki-memory:derived -->/);
  assert.match(loader, /`SCHEMA\.md`/);
  assert.doesNotMatch(loader, /<!-- llm-wiki-memory:derived -->/);
  assert.doesNotMatch(loader, /wiki\/hot\.md|_index\.md|Guardrail Triggers/);
  assert.match(loader, /\.agent\/external\/claude-obsidian\/skills\/wiki-query\/SKILL\.md/);
  assert.match(loader, /Read the upstream query skill completely/i);
  assert.match(loader, /compatibility overlay/i);
  assert.match(loader, /engineering routes and read-only boundary are authoritative/i);
  assert.match(loader, /wiki\/sources\/ai-chats/);
  assert.match(loader, /wiki\/concepts/);
  assert.match(loader, /Daily `可复用经验` candidate as effective guidance/i);
});

test("daily ingest emits one persisted Evidence Snapshot and verifies locally", () => {
  const skill = fs.readFileSync(path.join(repoRoot, ".agent", "skills", "ai-session-wiki-ingest", "SKILL.md"), "utf8");
  assert.match(skill, /daily-memory-workflow\.mjs prepare YYYY-MM-DD --emit-snapshot/);
  assert.match(skill, /daily-memory-workflow\.mjs verify/);
  assert.doesNotMatch(skill, /--emit-packet|SYNTHESIS PACKET|lower-scored turns/i);
});

test("reconcile recomputes the current window instead of replaying old output", () => {
  const skill = fs.readFileSync(path.join(repoRoot, ".agent", "skills", "agent-memory-reconcile", "SKILL.md"), "utf8");
  assert.match(skill, /Derive the current review from those Daily pages/i);
  assert.match(skill, /Do not search prior Codex or Claude agent runs/i);
  assert.match(skill, /Never replay one as the current\s+review/i);
  assert.match(skill, /freshly derived from the current Daily window/i);
  assert.match(skill, /does not generate behavior rules/i);
  assert.match(skill, /Do not modify `wiki\/guardrails\/Agent Behavior Rules\.md`/i);
});

test("capture preserves long high-value fields without the old per-field caps", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-highlights-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  const goal = `GOAL_BEGIN ${"g".repeat(700)} GOAL_END_SENTINEL`;
  const evidence = `EVIDENCE_BEGIN root cause verified with \`npm test\` at /tmp/runtime ${"e".repeat(700)} EVIDENCE_END_SENTINEL`;
  const outcome = `OUTCOME_BEGIN ${"o".repeat(900)} OUTCOME_END_SENTINEL`;
  const records = [
    { timestamp: "2099-01-02T01:00:00Z", role: "user", content: goal, cwd: "/tmp/project" },
    { timestamp: "2099-01-02T01:01:00Z", role: "assistant", phase: "commentary", content: evidence },
    { timestamp: "2099-01-02T01:02:00Z", role: "assistant", phase: "final_answer", content: outcome },
  ];
  fs.writeFileSync(path.join(sessionDir, "rollout.jsonl"), `${records.map(JSON.stringify).join("\n")}\n`);

  const capture = runCapture({ fakeHome, output, config });
  const [turn] = capture.cards[0].turns;
  assert.equal(turn.goal, goal);
  assert.equal(turn.decisive_evidence.text, evidence);
  assert.equal(turn.outcomes[0].text, outcome);
  assert.doesNotMatch(captureText(capture), /\[truncated\]|field compacted locally/);
  assert.equal("score" in turn, false);
});

test("capture keeps normalized turns without a size gate", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-budget-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  const records = [];
  for (let turn = 0; turn < 40; turn += 1) {
    const stamp = String(turn).padStart(2, "0");
    records.push({
      timestamp: `2099-01-02T01:${stamp}:00Z`,
      role: "user",
      cwd: "/tmp/project",
      content: `GOAL_${stamp}_BEGIN ${"g".repeat(2000)} GOAL_${stamp}_END`,
    });
    records.push({
      timestamp: `2099-01-02T02:${stamp}:00Z`,
      role: "assistant",
      phase: "final_answer",
      content: `OUTCOME_${stamp}_BEGIN ${"o".repeat(2000)} OUTCOME_${stamp}_END`,
    });
  }
  fs.writeFileSync(path.join(sessionDir, "rollout.jsonl"), `${records.map(JSON.stringify).join("\n")}\n`);

  const capture = runCapture({ fakeHome, output, config });
  const persisted = fs.readFileSync(output, "utf8");
  assert.equal(capture.snapshot_mode, "all-turns");
  assert.equal(capture.omitted_turns, 0);
  assert.equal(capture.included_turns, 40);
  for (let turn = 0; turn < 40; turn += 1) {
    const stamp = String(turn).padStart(2, "0");
    for (const sentinel of [`GOAL_${stamp}_BEGIN`, `GOAL_${stamp}_END`, `OUTCOME_${stamp}_BEGIN`, `OUTCOME_${stamp}_END`]) {
      assert.equal(persisted.includes(sentinel), true, sentinel);
    }
  }
  assert.doesNotMatch(persisted, /\[truncated\]|field compacted locally/);
});

test("capture keeps automation requests and skips structured Codex subagent sessions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-subagents-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(path.join(sessionDir, "top-level.jsonl"), [
    {
      timestamp: "2099-01-02T01:00:00Z",
      type: "session_meta",
      payload: { thread_source: "root", cwd: "/tmp/project" },
    },
    {
      timestamp: "2099-01-02T01:01:00Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: "Automation: Kibana Report Dispatcher\nAutomation ID: kibana-report-dispatcher\nRun npm run report and preserve the final result.",
      },
    },
    {
      timestamp: "2099-01-02T01:02:00Z",
      type: "response_item",
      payload: { type: "message", role: "assistant", phase: "final_answer", content: "Weekly report completed and verified." },
    },
    {
      timestamp: "2099-01-02T01:02:30Z",
      type: "response_item",
      payload: {
        type: "agent_message",
        author: "/root/worker",
        recipient: "/root",
        content: [{ type: "input_text", text: "Message Type: FINAL_ANSWER\nTask name: /root\nSender: /root/worker\nPayload:\nDELEGATED_ROOT_CAUSE verified from runtime evidence." }],
      },
    },
  ].map(JSON.stringify).join("\n") + "\n");
  fs.writeFileSync(path.join(sessionDir, "subagent.jsonl"), [
    {
      timestamp: "2099-01-02T01:03:00Z",
      type: "session_meta",
      payload: { thread_source: "subagent", source: { subagent: { thread_spawn: { depth: 1 } } }, cwd: "/tmp/project" },
    },
    { timestamp: "2099-01-02T01:04:00Z", role: "user", content: "DUPLICATED_PARENT_CONTEXT" },
    { timestamp: "2099-01-02T01:05:00Z", role: "assistant", content: "INTERNAL_WORKER_DETAIL" },
  ].map(JSON.stringify).join("\n") + "\n");

  const capture = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  const text = captureText(capture);
  assert.equal(capture.evidence_card_count, 1);
  assert.equal(capture.internal_subagent_sessions_skipped, 1);
  assert.match(text, /Automation: Kibana Report Dispatcher/);
  assert.match(text, /Weekly report completed and verified/);
  assert.equal(capture.cards[0].counts.delegated_outcomes, 1);
  assert.match(text, /DELEGATED_ROOT_CAUSE verified from runtime evidence/);
  assert.doesNotMatch(text, /DUPLICATED_PARENT_CONTEXT|INTERNAL_WORKER_DETAIL/);
});

test("capture drops Claude tool-result pseudo-users and preserves end-turn outcomes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-claude-turns-"));
  const fakeHome = path.join(tmp, "home");
  const claudeDir = path.join(fakeHome, ".claude", "projects", "sample");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: false, claudeSourcesEnabled: true }));
  fs.writeFileSync(path.join(claudeDir, "session.jsonl"), [
    {
      timestamp: "2099-01-02T01:00:00Z",
      type: "user",
      message: { role: "user", content: "Find the real root cause", cwd: "/tmp/project" },
    },
    {
      timestamp: "2099-01-02T01:01:00Z",
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", content: "NOISY_TOOL_OUTPUT" }] },
    },
    {
      timestamp: "2099-01-02T01:02:00Z",
      type: "assistant",
      message: { role: "assistant", stop_reason: "tool_use", content: [{ type: "text", text: "Checking evidence" }] },
    },
    {
      timestamp: "2099-01-02T01:03:00Z",
      type: "assistant",
      message: { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "CLAUDE_FINAL_OUTCOME verified" }] },
    },
  ].map(JSON.stringify).join("\n") + "\n");
  const capture = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  const text = captureText(capture);
  assert.match(capture.cards[0].evidence_id, /^claude-session-[0-9a-f]{10}$/);
  assert.equal(capture.cards[0].agent, "Claude Code");
  assert.match(text, /Find the real root cause/);
  assert.match(text, /CLAUDE_FINAL_OUTCOME verified/);
  assert.doesNotMatch(text, /NOISY_TOOL_OUTPUT/);
  assert.equal(capture.cards[0].counts.user_turns, 1);
});

test("capture matches Claude timestamps by local date", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-tz-"));
  const fakeHome = path.join(tmp, "home");
  const claudeDir = path.join(fakeHome, ".claude", "projects", "sample");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: false, claudeSourcesEnabled: true }));
  fs.writeFileSync(path.join(claudeDir, "session.jsonl"), [
    { timestamp: "2099-01-01T16:30:00.000Z", role: "user", content: "Review local timezone capture", cwd: "/tmp/project" },
    { timestamp: "2099-01-01T16:31:00.000Z", role: "assistant", content: "Captured it on the local day." },
  ].map(JSON.stringify).join("\n") + "\n");

  const capture = runCapture({ fakeHome, output, config, extraEnv: { TZ: "Asia/Shanghai" } });
  const text = captureText(capture);
  assert.equal(capture.evidence_card_count, 1);
  assert.match(text, /Review local timezone capture/);
  assert.match(text, /record timestamp 2099-01-01T16:30:00.000Z/);
});

test("capture keeps Codex identity and stable ID for archived storage", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-archived-"));
  const fakeHome = path.join(tmp, "home");
  const archivedDir = path.join(fakeHome, ".codex", "archived_sessions");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  const id = "019f0000-1111-7222-8333-444444444444";
  fs.mkdirSync(archivedDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(path.join(archivedDir, `rollout-2099-01-02T01-00-00-${id}.jsonl`), [
    { timestamp: "2099-01-02T01:00:00Z", role: "user", content: "Audit archived session identity", cwd: "/tmp/project" },
    { timestamp: "2099-01-02T01:01:00Z", role: "assistant", content: "Archived storage does not change the agent identity." },
  ].map(JSON.stringify).join("\n") + "\n");

  const capture = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  assert.equal(capture.cards[0].evidence_id, `codex-${id}`);
  assert.equal(capture.cards[0].agent, "Codex");
  assert.equal(capture.cards[0].date_match, "archived rollout filename");
});

test("capture slices multi-day sessions before computing the derived flag", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-multi-day-"));
  const fakeHome = path.join(tmp, "home");
  const claudeDir = path.join(fakeHome, ".claude", "projects", "sample");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: false, claudeSourcesEnabled: true }));
  fs.writeFileSync(path.join(claudeDir, "session.jsonl"), [
    { timestamp: "2099-01-01T10:00:00.000Z", role: "user", content: "DAY_ONE_ONLY request", cwd: "/tmp/day-one", model: "old-model" },
    { timestamp: "2099-01-01T10:01:00.000Z", role: "assistant", content: `DAY_ONE_ONLY response\n${marker}` },
    { timestamp: "2099-01-02T10:00:00.000Z", role: "user", content: `DAY_TWO_ONLY request quotes ${marker}`, cwd: "/tmp/day-two", model: "new-model" },
    { timestamp: "2099-01-02T10:01:00.000Z", role: "assistant", content: "DAY_TWO_ONLY response" },
  ].map(JSON.stringify).join("\n") + "\n");

  const capture = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  const text = captureText(capture);
  assert.match(text, /DAY_TWO_ONLY request|DAY_TWO_ONLY response/);
  assert.doesNotMatch(text, /DAY_ONE_ONLY/);
  assert.equal(capture.cards[0].repo, "day-two");
  assert.equal(capture.cards[0].model, "new-model");
  assert.doesNotMatch(text, /old-model/);
  assert.equal(capture.contains_vault_answer, false);
  assert.equal(capture.cards[0].counts.raw_records, 2);
  assert.ok(capture.cards[0].warnings.includes("cross_day_records_filtered"));
});

test("capture exposes target-day outcomes carried over from a previous-day user turn", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-carryover-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(path.join(sessionDir, "rollout.jsonl"), [
    { timestamp: "2099-01-01T23:50:00.000Z", role: "user", content: "PREVIOUS_DAY_GOAL", cwd: "/tmp/project" },
    { timestamp: "2099-01-02T00:30:00.000Z", role: "assistant", phase: "final_answer", content: "CARRYOVER_FINAL_OUTCOME root cause fixed in commit abc123" },
    { timestamp: "2099-01-02T01:00:00.000Z", role: "user", content: "TODAY_GOAL verify deployment", cwd: "/tmp/project" },
    { timestamp: "2099-01-02T01:10:00.000Z", role: "assistant", phase: "final_answer", content: "TODAY_FINAL_OUTCOME deployment verified" },
  ].map(JSON.stringify).join("\n") + "\n");

  const capture = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  const text = captureText(capture);
  const card = capture.cards[0];
  assert.match(text, /CARRYOVER_FINAL_OUTCOME/);
  assert.equal(card.counts.final_outcomes, 2);
  assert.equal(card.counts.carryover_outcomes, 1);
  assert.equal(card.carryover_outcomes.length, 1);
  assert.match(card.carryover_outcomes[0].text, /CARRYOVER_FINAL_OUTCOME/);
  assert.match(card.turns[0].goal, /TODAY_GOAL/);
  assert.match(card.turns[0].outcomes[0].text, /TODAY_FINAL_OUTCOME/);
});

test("capture discovers target-day records in an older Codex session folder", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-codex-resume-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "01");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  const sessionFile = path.join(sessionDir, "rollout.jsonl");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(sessionFile, [
    { timestamp: "2099-01-01T10:00:00.000Z", role: "user", content: "OLD_DAY request", cwd: "/tmp/old-day" },
    { timestamp: "2099-01-01T10:01:00.000Z", role: "assistant", content: `OLD_DAY response\n${marker}` },
    { timestamp: "2099-01-02T10:00:00.000Z", role: "user", content: "RESUMED_TODAY request", cwd: "/tmp/resumed-today" },
    { timestamp: "2099-01-02T10:01:00.000Z", role: "assistant", content: "RESUMED_TODAY response" },
  ].map(JSON.stringify).join("\n") + "\n");
  fs.utimesSync(sessionFile, new Date("2099-01-02T12:00:00.000Z"), new Date("2099-01-02T12:00:00.000Z"));

  const capture = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  const text = captureText(capture);
  assert.equal(capture.evidence_card_count, 1);
  assert.match(text, /RESUMED_TODAY request|RESUMED_TODAY response/);
  assert.doesNotMatch(text, /OLD_DAY/);
  assert.equal(capture.cards[0].repo, "resumed-today");
  assert.equal(capture.contains_vault_answer, false);
  assert.ok(capture.cards[0].warnings.includes("cross_day_records_filtered"));
});

test("capture resolves its repo root when the script path contains spaces", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-script-path-"));
  const fakeHome = path.join(tmp, "home");
  const spacedRepo = path.join(tmp, "repo with spaces");
  const copiedScript = path.join(spacedRepo, "scripts", "capture-ai-chats.mjs");
  const expectedOutput = path.join(spacedRepo, ".vault-meta", "captures", "ai-chats", "2099-01-02.capture.json");
  fs.mkdirSync(path.dirname(copiedScript), { recursive: true });
  fs.copyFileSync(script, copiedScript);
  fs.writeFileSync(path.join(spacedRepo, "SCHEMA.md"), "# Schema\n");
  fs.mkdirSync(path.join(spacedRepo, "wiki", "templates"), { recursive: true });
  fs.writeFileSync(path.join(spacedRepo, "wiki", "templates", "Daily AI Chat Summary Template.md"), "# Daily template\n");

  execFileSync(process.execPath, [copiedScript, "2099-01-02"], {
    cwd: spacedRepo,
    env: { ...process.env, HOME: fakeHome, TZ: "UTC" },
  });

  assert.equal(fs.existsSync(expectedOutput), true);
  assert.ok(JSON.parse(fs.readFileSync(expectedOutput, "utf8")).warnings.includes("no_sources"));
});
