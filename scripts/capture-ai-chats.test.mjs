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
  return fs.readFileSync(output, "utf8");
}

test("capture writes session evidence without Daily conclusions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "capture.md");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(path.join(sessionDir, "rollout.jsonl"), [
    { timestamp: "2099-01-02T01:00:00Z", role: "user", content: "# AGENTS.md instructions for /tmp/project" },
    { timestamp: "2099-01-02T01:01:00Z", role: "user", content: "Implement multilingual UI without layout shift", cwd: "/tmp/project", model: "gpt-test" },
    { timestamp: "2099-01-02T01:02:00Z", role: "assistant", content: "Implemented the layout-stable language switcher." },
  ].map(JSON.stringify).join("\n") + "\n");

  const text = runCapture({ fakeHome, output, config });
  assert.match(text, /capture_version: 8/);
  assert.match(text, /<a id="codex-rollout-[0-9a-f]{10}"><\/a>/);
  assert.match(text, /Evidence ID: codex-rollout-[0-9a-f]{10}/);
  assert.match(text, /Agent: Codex/);
  assert.match(text, /contains_vault_answer: false/);
  assert.match(text, /Contains vault answer: false/);
  assert.match(text, /Implement multilingual UI without layout shift/);
  assert.match(text, /Implemented the layout-stable language switcher/);
  assert.doesNotMatch(text, /# AGENTS\.md instructions/);
  assert.doesNotMatch(text, /## 摘要|## 可复用经验/);
});

test("capture uses one binary flag even when user input follows a vault answer", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-derived-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "capture.md");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(path.join(sessionDir, "rollout.jsonl"), [
    { timestamp: "2099-01-02T01:00:00Z", role: "user", content: "What happened last time?", cwd: "/tmp/project" },
    { timestamp: "2099-01-02T01:01:00Z", role: "assistant", content: `The Wiki says to verify the runtime artifact first.\n${marker}` },
    { timestamp: "2099-01-02T01:02:00Z", role: "user", content: "This fresh build still failed." },
    { timestamp: "2099-01-02T01:03:00Z", role: "assistant", content: "That needs a new investigation." },
  ].map(JSON.stringify).join("\n") + "\n");

  const text = runCapture({ fakeHome, output, config });
  assert.match(text, /contains_vault_answer: true/);
  assert.match(text, /Contains vault answer: true/);
  assert.match(text, /This fresh build still failed/);
  assert.doesNotMatch(text, /memory-derived|Evidence origin|llm-wiki-memory:derived/);
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

test("daily ingest is a thin upstream adapter with a coverage contract", () => {
  const skill = fs.readFileSync(path.join(repoRoot, ".agent", "skills", "ai-session-wiki-ingest", "SKILL.md"), "utf8");
  assert.match(skill, /Claude Obsidian's `wiki-ingest` design/);
  assert.match(skill, /Do not load or execute the upstream `wiki-ingest` workflow/i);
  assert.match(skill, /Read every evidence card/i);
  assert.match(skill, /scratch coverage ledger/i);
  assert.match(skill, /Every high-signal workstream/i);
  assert.match(skill, /Compile a fresh candidate/i);
  assert.match(skill, /Do not search prior Codex or Claude agent runs/i);
  assert.match(skill, /leave the existing page unchanged/i);
  assert.match(skill, /not as a chronological activity log/i);
  assert.match(skill, /problem or goal, decisive evidence or reasoning/i);
  assert.match(skill, /final outcome, and impact or unresolved follow-up/i);
  assert.match(skill, /latest verified state/i);
  assert.match(skill, /confidence: high/i);
  assert.match(skill, /node scripts\/wiki-lint\.mjs --strict/);
  assert.match(skill, /revise the candidate/i);
  assert.match(skill, /restore the previous Daily page/i);
  assert.match(skill, /report the run as blocked/i);
  assert.match(skill, /backup\s+evidence and an unreviewed candidate/i);
  assert.match(skill, /exactly one Daily page plus `wiki\/log\.md`/i);
  assert.doesNotMatch(skill, /Create or update entity pages/i);
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
  const output = path.join(tmp, "capture.md");
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

  const text = runCapture({
    fakeHome,
    output,
    config,
    extraEnv: { LLM_WIKI_CAPTURE_ASSET_DIR: assetDir },
  });
  assert.match(text, /visual_evidence_count: 1/);
  assert.match(text, /Capture file:/);
  assert.match(text, /Media type: image\/png/);
  assert.doesNotMatch(text, /iVBORw0KGgo/);
  assert.equal(fs.readdirSync(assetDir).length, 1);
});

test("capture preserves every user turn and final outcome while reducing commentary noise", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-highlights-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "capture.md");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  const records = [];
  for (let turn = 0; turn < 9; turn += 1) {
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

  const text = runCapture({ fakeHome, output, config });
  const highlights = text.split("\n").filter((line) => /^  - (user|assistant)/.test(line));
  assert.match(text, /ROOT_CAUSE_SIGNAL RCV-123/);
  assert.ok(highlights.length > 16);
  for (let turn = 0; turn < 9; turn += 1) {
    assert.match(text, new RegExp(`USER_GOAL_${turn}`));
    assert.match(text, new RegExp(`FINAL_OUTCOME_${turn}`));
  }
  assert.doesNotMatch(text, /injected plugin list/);
  assert.match(text, /Conversation messages: 36/);
  assert.match(text, /Meaningful user turns: 9/);
  assert.match(text, /Unselected messages: 9/);
  assert.match(text, /Warnings: conversation_highlights_reduced/);
});

test("capture keeps automation requests and skips structured Codex subagent sessions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-subagents-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "02");
  const output = path.join(tmp, "capture.md");
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

  const text = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  assert.match(text, /Session cards: 1/);
  assert.match(text, /Internal subagent sessions skipped: 1/);
  assert.match(text, /Automation: Kibana Report Dispatcher/);
  assert.match(text, /Weekly report completed and verified/);
  assert.match(text, /Delegated outcomes: 1/);
  assert.match(text, /delegated outcome .*DELEGATED_ROOT_CAUSE verified from runtime evidence/);
  assert.doesNotMatch(text, /DUPLICATED_PARENT_CONTEXT|INTERNAL_WORKER_DETAIL/);
});

test("capture drops Claude tool-result pseudo-users and preserves end-turn outcomes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-claude-turns-"));
  const fakeHome = path.join(tmp, "home");
  const claudeDir = path.join(fakeHome, ".claude", "projects", "sample");
  const output = path.join(tmp, "capture.md");
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
  const text = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  assert.match(text, /Evidence ID: claude-session-[0-9a-f]{10}/);
  assert.match(text, /Agent: Claude Code/);
  assert.match(text, /Find the real root cause/);
  assert.match(text, /CLAUDE_FINAL_OUTCOME verified/);
  assert.doesNotMatch(text, /NOISY_TOOL_OUTPUT/);
  assert.match(text, /Meaningful user turns: 1/);
});

test("capture matches Claude timestamps by local date", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-tz-"));
  const fakeHome = path.join(tmp, "home");
  const claudeDir = path.join(fakeHome, ".claude", "projects", "sample");
  const output = path.join(tmp, "capture.md");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: false, claudeSourcesEnabled: true }));
  fs.writeFileSync(path.join(claudeDir, "session.jsonl"), [
    { timestamp: "2099-01-01T16:30:00.000Z", role: "user", content: "Review local timezone capture", cwd: "/tmp/project" },
    { timestamp: "2099-01-01T16:31:00.000Z", role: "assistant", content: "Captured it on the local day." },
  ].map(JSON.stringify).join("\n") + "\n");

  const text = runCapture({ fakeHome, output, config, extraEnv: { TZ: "Asia/Shanghai" } });
  assert.match(text, /Session cards: 1/);
  assert.match(text, /Review local timezone capture/);
  assert.match(text, /record timestamp 2099-01-01T16:30:00.000Z/);
});

test("capture keeps Codex identity and stable ID for archived storage", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-archived-"));
  const fakeHome = path.join(tmp, "home");
  const archivedDir = path.join(fakeHome, ".codex", "archived_sessions");
  const output = path.join(tmp, "capture.md");
  const config = path.join(tmp, "config.json");
  const id = "019f0000-1111-7222-8333-444444444444";
  fs.mkdirSync(archivedDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: true, claudeSourcesEnabled: false }));
  fs.writeFileSync(path.join(archivedDir, `rollout-2099-01-02T01-00-00-${id}.jsonl`), [
    { timestamp: "2099-01-02T01:00:00Z", role: "user", content: "Audit archived session identity", cwd: "/tmp/project" },
    { timestamp: "2099-01-02T01:01:00Z", role: "assistant", content: "Archived storage does not change the agent identity." },
  ].map(JSON.stringify).join("\n") + "\n");

  const text = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  assert.match(text, new RegExp(`Evidence ID: codex-${id}`));
  assert.match(text, /Agent: Codex/);
  assert.doesNotMatch(text, /Agent: Codex archived/);
  assert.match(text, /Date match: archived rollout filename/);
});

test("capture slices multi-day sessions before computing the derived flag", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-multi-day-"));
  const fakeHome = path.join(tmp, "home");
  const claudeDir = path.join(fakeHome, ".claude", "projects", "sample");
  const output = path.join(tmp, "capture.md");
  const config = path.join(tmp, "config.json");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ codexSourcesEnabled: false, claudeSourcesEnabled: true }));
  fs.writeFileSync(path.join(claudeDir, "session.jsonl"), [
    { timestamp: "2099-01-01T10:00:00.000Z", role: "user", content: "DAY_ONE_ONLY request", cwd: "/tmp/day-one", model: "old-model" },
    { timestamp: "2099-01-01T10:01:00.000Z", role: "assistant", content: `DAY_ONE_ONLY response\n${marker}` },
    { timestamp: "2099-01-02T10:00:00.000Z", role: "user", content: `DAY_TWO_ONLY request quotes ${marker}`, cwd: "/tmp/day-two", model: "new-model" },
    { timestamp: "2099-01-02T10:01:00.000Z", role: "assistant", content: "DAY_TWO_ONLY response" },
  ].map(JSON.stringify).join("\n") + "\n");

  const text = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  assert.match(text, /DAY_TWO_ONLY request|DAY_TWO_ONLY response/);
  assert.doesNotMatch(text, /DAY_ONE_ONLY/);
  assert.match(text, /session-001 · day-two/);
  assert.match(text, /Model: new-model/);
  assert.doesNotMatch(text, /old-model/);
  assert.match(text, /contains_vault_answer: false/);
  assert.match(text, /Raw record count: 2/);
  assert.match(text, /Warnings: cross_day_records_filtered/);
});

test("capture discovers target-day records in an older Codex session folder", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-codex-resume-"));
  const fakeHome = path.join(tmp, "home");
  const sessionDir = path.join(fakeHome, ".codex", "sessions", "2099", "01", "01");
  const output = path.join(tmp, "capture.md");
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

  const text = runCapture({ fakeHome, output, config, extraEnv: { TZ: "UTC" } });
  assert.match(text, /Session cards: 1/);
  assert.match(text, /RESUMED_TODAY request|RESUMED_TODAY response/);
  assert.doesNotMatch(text, /OLD_DAY/);
  assert.match(text, /session-001 · resumed-today/);
  assert.match(text, /contains_vault_answer: false/);
  assert.match(text, /Warnings: cross_day_records_filtered/);
});

test("capture resolves its repo root when the script path contains spaces", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capture-ai-chats-script-path-"));
  const fakeHome = path.join(tmp, "home");
  const spacedRepo = path.join(tmp, "repo with spaces");
  const copiedScript = path.join(spacedRepo, "scripts", "capture-ai-chats.mjs");
  const expectedOutput = path.join(spacedRepo, ".vault-meta", "captures", "ai-chats", "2099-01-02.md");
  fs.mkdirSync(path.dirname(copiedScript), { recursive: true });
  fs.copyFileSync(script, copiedScript);

  execFileSync(process.execPath, [copiedScript, "2099-01-02"], {
    cwd: spacedRepo,
    env: { ...process.env, HOME: fakeHome, TZ: "UTC" },
  });

  assert.equal(fs.existsSync(expectedOutput), true);
  assert.match(fs.readFileSync(expectedOutput, "utf8"), /Capture warnings: no_sources/);
});
