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
  assert.equal(capture.capture_version, 9);
  assert.equal(capture.evidence_card_count, 1);
  assert.match(capture.cards[0].evidence_id, /^codex-rollout-[0-9a-f]{10}$/);
  assert.equal(capture.cards[0].agent, "Codex");
  assert.equal(capture.contains_vault_answer, false);
  assert.match(text, /Implement multilingual UI without layout shift/);
  assert.match(text, /Implemented the layout-stable language switcher/);
  assert.doesNotMatch(text, /# AGENTS\.md instructions/);
  assert.doesNotMatch(text, /## 摘要|## 可复用经验/);
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
  assert.doesNotMatch(text, /memory-derived|Evidence origin|llm-wiki-memory:derived/);
});

test("capture can freeze an A/B evidence window at an exact timestamp", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-cutoff-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(path.join(sessionDir, "rollout.jsonl"), [
    { timestamp: "2099-01-02T01:00:00Z", role: "user", content: "BEFORE_CUTOFF_GOAL", cwd: "/tmp/project" },
    { timestamp: "2099-01-02T01:01:00Z", role: "assistant", content: "BEFORE_CUTOFF_OUTCOME" },
    { timestamp: "2099-01-02T01:10:00Z", role: "user", content: "AFTER_CUTOFF_GOAL" },
    { timestamp: "2099-01-02T01:11:00Z", role: "assistant", content: "AFTER_CUTOFF_OUTCOME" },
  ].map(JSON.stringify).join("\n") + "\n");

  const capture = runCapture({
    fakeHome,
    output,
    config,
    extraEnv: { LLM_WIKI_CAPTURE_END_TIMESTAMP: "2099-01-02T01:05:00Z" },
  });
  const text = captureText(capture);
  assert.match(text, /BEFORE_CUTOFF_GOAL/);
  assert.doesNotMatch(text, /AFTER_CUTOFF_GOAL/);
  assert.equal(capture.capture_end_timestamp, "2099-01-02T01:05:00Z");
  assert.equal(capture.cards[0].counts.user_turns, 1);
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

test("daily ingest uses one bounded packet and one local verification path", () => {
  const skill = fs.readFileSync(path.join(repoRoot, ".agent", "skills", "ai-session-wiki-ingest", "SKILL.md"), "utf8");
  assert.match(skill, /session logs -> canonical Capture -> bounded packet -> one Daily page -> local verify/);
  assert.match(skill, /daily-memory-workflow\.mjs prepare YYYY-MM-DD --emit-packet/);
  assert.match(skill, /daily-memory-workflow\.mjs verify/);
  assert.match(skill, /packet is a temporary\s+model view capped at 96 KiB/i);
  assert.match(skill, /removes\s+lower-scored turns first/i);
  assert.match(skill, /Never poll or rerun prepare/i);
  assert.match(skill, /outer\s+`functions\.exec` call.*nested `exec_command`.*max_output_tokens: 100000/is);
  assert.match(skill, /Warning: truncated output/);
  assert.doesNotMatch(skill, /40,000-token tool-output budget/);
  assert.match(skill, /END SYNTHESIS PACKET/);
  assert.match(skill, /not a transport failure/i);
  assert.match(skill, /one synthesis pass/i);
  assert.match(skill, /Target 3-5 root\s+model continuations and never exceed 6/i);
  assert.match(skill, /Do not inspect the helper source/i);
  assert.match(skill, /Do not read or (?:edit|patch) `wiki\/log\.md`/i);
  assert.match(skill, /Never report a business-level\s+blocked state/i);
  assert.doesNotMatch(skill, /drill-down|raw-slice|coverage ledger/i);
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

test("capture extracts session images without copying base64 into Markdown", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-visual-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const assetDir = path.join(tmp, "capture-assets");
  const config = path.join(tmp, "config.json");
  const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7aAAAAAASUVORK5CYII=";
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(path.join(sessionDir, "rollout.jsonl"), [
    {
      timestamp: "2099-01-02T01:01:00Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        cwd: "/tmp/project",
        content: [
          { type: "input_text", text: "The browser still shows the old UI. This screenshot is evidence." },
          { type: "input_image", image_url: `data:image/png;base64,${onePixelPng}`, detail: "high" },
        ],
      },
    },
    { timestamp: "2099-01-02T01:02:00Z", role: "assistant", content: "Verify the running build before source reasoning." },
  ].map(JSON.stringify).join("\n") + "\n");

  const capture = runCapture({
    fakeHome,
    output,
    config,
    extraEnv: { LLM_WIKI_CAPTURE_ASSET_DIR: assetDir },
  });
  const text = captureText(capture);
  assert.equal(capture.visual_evidence_count, 1);
  assert.match(capture.cards[0].visuals[0].capture_file, /\.(?:png)$/);
  assert.equal(capture.cards[0].visuals[0].media_type, "image/png");
  assert.doesNotMatch(text, /iVBORw0KGgo/);
  assert.equal(fs.readdirSync(assetDir).length, 1);
});

test("capture preserves every normalized user turn and final outcome without preselecting eight", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-highlights-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "2099-01-02.capture.json");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  const records = [];
  for (let turn = 0; turn < 15; turn += 1) {
    records.push({
      timestamp: `2099-01-02T01:${String(turn * 5).padStart(2, "0")}:00Z`,
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: `<recommended_plugins> injected plugin list ${turn}`,
      },
    });
    records.push({
      timestamp: `2099-01-02T01:${String(turn * 5 + 1).padStart(2, "0")}:00Z`,
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: `USER_GOAL_${turn}: investigate and finish this workstream`,
        cwd: "/tmp/project",
      },
    });
    records.push({
      timestamp: `2099-01-02T01:${String(turn * 5 + 2).padStart(2, "0")}:00Z`,
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        phase: "commentary",
        content: `Routine progress for turn ${turn}`,
      },
    });
    records.push({
      timestamp: `2099-01-02T01:${String(turn * 5 + 3).padStart(2, "0")}:00Z`,
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        phase: "commentary",
        content: turn === 4
          ? "ROOT_CAUSE_SIGNAL RCV-123: root cause path /tmp/runtime proves the bundle was not rebuilt"
          : `Evidence update for turn ${turn}`,
      },
    });
    records.push({
      timestamp: `2099-01-02T01:${String(turn * 5 + 4).padStart(2, "0")}:00Z`,
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        phase: "final_answer",
        content: `FINAL_OUTCOME_${turn}: verified result and remaining blocker`,
      },
    });
  }
  fs.writeFileSync(path.join(sessionDir, "rollout.jsonl"), `${records.map(JSON.stringify).join("\n")}\n`);

  const capture = runCapture({ fakeHome, output, config });
  const compactText = captureText(capture);
  const card = capture.cards[0];
  assert.match(compactText, /ROOT_CAUSE_SIGNAL RCV-123/);
  assert.equal(capture.capture_version, 9);
  assert.equal(capture.evidence_card_count, 1);
  assert.equal(card.turns.length, 15);
  assert.equal(card.counts.user_turns, 15);
  assert.equal(card.counts.final_outcomes, 15);
  assert.match(compactText, /ROOT_CAUSE_SIGNAL RCV-123/);
  assert.doesNotMatch(compactText, /Routine progress|Evidence update/);
  assert.match(compactText, /USER_GOAL_0/);
  assert.match(compactText, /FINAL_OUTCOME_0/);
  assert.match(compactText, /USER_GOAL_14/);
  assert.match(compactText, /FINAL_OUTCOME_14/);
  for (let turn = 0; turn < 15; turn += 1) {
    assert.match(compactText, new RegExp(`USER_GOAL_${turn}`));
    assert.match(compactText, new RegExp(`FINAL_OUTCOME_${turn}`));
  }
  assert.doesNotMatch(compactText, /injected plugin list/);
  assert.equal(card.counts.conversation_messages, 60);
  assert.doesNotMatch(compactText, /conversation_highlights_reduced|omitted_model_turns/);
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

  execFileSync(process.execPath, [copiedScript, "2099-01-02"], {
    cwd: spacedRepo,
    env: { ...process.env, HOME: fakeHome, TZ: "UTC" },
  });

  assert.equal(fs.existsSync(expectedOutput), true);
  assert.ok(JSON.parse(fs.readFileSync(expectedOutput, "utf8")).warnings.includes("no_sources"));
});
