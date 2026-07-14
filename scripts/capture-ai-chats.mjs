#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const date = process.argv[2];

if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("Usage: node scripts/capture-ai-chats.mjs YYYY-MM-DD");
  process.exit(1);
}

const memoryDerivedMarker = "<!-- llm-wiki-memory:derived -->";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = process.env.LLM_WIKI_CAPTURE_OUTPUT_PATH ||
  path.join(repoRoot, ".vault-meta", "captures", "ai-chats", `${date}.capture.json`);
const configPath = process.env.LLM_WIKI_CAPTURE_CONFIG_PATH ||
  path.join(repoRoot, ".vault-meta", "config.json");
const captureEndTimestamp = String(process.env.LLM_WIKI_CAPTURE_END_TIMESTAMP || "").trim();
const captureEndTime = captureEndTimestamp ? Date.parse(captureEndTimestamp) : null;
if (captureEndTimestamp && Number.isNaN(captureEndTime)) {
  console.error("LLM_WIKI_CAPTURE_END_TIMESTAMP must be an ISO-8601 timestamp");
  process.exit(1);
}
const dailyWikiPath = path.join("wiki", "sources", "ai-chats", `${date}.md`);
const home = os.homedir();
const codexSessionsRoot = path.join(home, ".codex", "sessions");

function exists(p) {
  return fs.existsSync(p);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function walk(dir, matcher = () => true) {
  if (!exists(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if ([".git", "node_modules", "dist", "build", ".vault-meta"].includes(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile() && matcher(full)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function readJsonl(file) {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }

  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function compactPath(file) {
  return file.startsWith(home) ? `~${file.slice(home.length)}` : file;
}

function sessionEvidenceId(file, sourceKind) {
  const prefix = sourceKind === "claude"
    ? "claude"
    : "codex";
  const stem = path.basename(file, path.extname(file));
  const uuid = stem.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (uuid) return `${prefix}-${uuid.toLowerCase()}`;

  const label = stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "session";
  const hash = crypto.createHash("sha256").update(path.resolve(file)).digest("hex").slice(0, 10);
  return `${prefix}-${label}-${hash}`;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function recordTimestamp(record) {
  return firstString(
    record.timestamp,
    record.created_at,
    record.createdAt,
    record.time,
    record.message?.created_at,
    record.message?.timestamp,
    record.payload?.timestamp
  );
}

function isWithinCaptureWindow(record) {
  if (captureEndTime === null) return true;
  const timestamp = recordTimestamp(record);
  if (!timestamp) return true;
  const time = Date.parse(timestamp);
  return Number.isNaN(time) || time <= captureEndTime;
}

function recordCwd(record) {
  return firstString(
    record.cwd,
    record.context?.cwd,
    record.metadata?.cwd,
    record.payload?.cwd,
    record.message?.cwd,
    record.session?.cwd
  );
}

function recordModel(record) {
  return firstString(
    record.model,
    record.model_name,
    record.response?.model,
    record.message?.model,
    record.payload?.model
  );
}

function recordText(record) {
  const candidates = [
    record.text,
    record.content,
    record.message?.content,
    record.message?.text,
    record.payload?.text,
    record.payload?.content,
    record.item?.content,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate)) {
      const joined = candidate
        .map((part) => {
          if (typeof part === "string") return part;
          return firstString(part.text, part.content, part.input_text);
        })
        .filter(Boolean)
        .join(" ")
        .trim();
      if (joined) return joined;
    }
  }

  return "";
}

function isToolResultRecord(record) {
  const candidates = [
    record.content,
    record.message?.content,
    record.payload?.content,
    record.item?.content,
  ];
  return candidates.some((candidate) =>
    Array.isArray(candidate) &&
    candidate.length > 0 &&
    candidate.every((part) => String(part?.type || "").toLowerCase().includes("tool_result"))
  );
}

function recordRole(record) {
  return firstString(record.role, record.message?.role, record.payload?.role, record.item?.role);
}

function recordType(record) {
  return firstString(record.type, record.message?.type, record.payload?.type, record.item?.type).toLowerCase();
}

function recordPhase(record) {
  return firstString(
    record.phase,
    record.stop_reason,
    record.message?.phase,
    record.message?.stop_reason,
    record.payload?.phase,
    record.payload?.stop_reason,
    record.item?.phase,
  ).toLowerCase();
}

function isUserRecord(record) {
  const role = recordRole(record).toLowerCase();
  const type = recordType(record);
  return role === "user" || type.includes("user");
}

function isAssistantRecord(record) {
  const role = recordRole(record).toLowerCase();
  const type = recordType(record);
  return role === "assistant" || type.includes("assistant") || isDelegatedOutcomeRecord(record);
}

function isDelegatedOutcomeRecord(record) {
  return record.payload?.type === "agent_message" &&
    /^Message Type: FINAL_ANSWER\b/m.test(recordText(record));
}

function isInjectedUserText(text) {
  const normalized = String(text || "").trim();
  const head = normalized.slice(0, 700).toLowerCase();
  return (
    head.startsWith("# agents.md instructions") ||
    head.startsWith("# claude.md instructions") ||
    head.startsWith("<instructions>") ||
    /^# .*instructions for \//i.test(normalized) ||
    head.startsWith("<recommended_plugins>") ||
    head.startsWith("<environment_context>") ||
    head.startsWith("<permissions instructions>") ||
    head.startsWith("<skills_instructions>") ||
    head.startsWith("<apps_instructions>") ||
    head.startsWith("<plugins_instructions>") ||
    head.startsWith("<collaboration_mode>") ||
    (head.startsWith("<skill>") && head.includes("<name>")) ||
    head.startsWith("launching skill:") ||
    head.startsWith("base directory for this skill:") ||
    head.startsWith("your task is to create a detailed summary of the conversation so far") ||
    head.startsWith("<turn_aborted>")
  );
}

function isInternalSubagentSession(records) {
  return records.some((record) =>
    record.type === "session_meta" &&
    (record.payload?.thread_source === "subagent" || record.payload?.source?.subagent)
  );
}

function isInjectedUserRecord(record, text = recordText(record)) {
  return isToolResultRecord(record) || isInjectedUserText(text);
}

function isSelfReferentialText(text) {
  const head = String(text || "").toLowerCase().slice(0, 1000);
  return (
    head.includes("capture-ai-chats") ||
    head.includes("ai-session-wiki-ingest") ||
    head.includes("daily agent memory") ||
    head.includes("run the daily") ||
    head.includes("整理 daily wiki") ||
    head.includes("每日 memory")
  );
}

function containsVaultAnswer(records) {
  return records.some((record) =>
    isAssistantRecord(record) && recordText(record).includes(memoryDerivedMarker)
  );
}

function normalizedSnippet(text) {
  return String(text || "")
    .replaceAll(memoryDerivedMarker, "")
    .replace(/^Message Type: FINAL_ANSWER\s*\nTask name:[^\n]*\nSender:[^\n]*\nPayload:\s*/i, "")
    .replace(/<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/g, "")
    .replace(/<in-app-browser-context\b[^>]*>[\s\S]*?<\/in-app-browser-context>/gi, "")
    .replace(/^# In app browser:[\s\S]*?## My request for Codex:\s*/i, "")
    .replace(/::(?:inbox-item|git-stage|git-commit)\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasEvidenceSignal(text) {
  const value = String(text || "");
  const patterns = [
    /\b[A-Z][A-Z0-9]+-\d+\b/i,
    /\b(?:error|failed|failure|root cause|fixed|decision|conclusion|verify|verified|blocker|source map|runtime|callback|build)\b/i,
    /(?:原因|结论|决定|修复|失败|报错|验证|阻塞|日志|截图|运行包|调用链|数据流)/,
    /`[^`]+`/,
    /(?:^|\s)[~/.][^\s]+/,
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function isAssistantOutcome(record) {
  const phase = recordPhase(record);
  return phase === "final_answer" || phase === "end_turn";
}

function normalizedConversation(records) {
  const messages = records
    .map((record) => {
      const text = recordText(record);
      const role = isUserRecord(record) ? "user" : isAssistantRecord(record) ? "assistant" : "";
      return {
        role,
        text,
        timestamp: recordTimestamp(record),
        outcome: role === "assistant" && isAssistantOutcome(record),
        delegated: isDelegatedOutcomeRecord(record),
        record,
      };
    })
    .filter((item) => item.role && item.text && !(item.role === "user" && isInjectedUserRecord(item.record, item.text)));
  const userPositions = messages
    .map((item, position) => item.role === "user" ? position : -1)
    .filter((position) => position >= 0);

  const firstUserPosition = userPositions[0] ?? messages.length;
  const carryoverOutcomes = messages
    .slice(0, firstUserPosition)
    .filter((item) => item.role === "assistant" && (item.outcome || item.delegated))
    .map((item) => ({
      kind: item.delegated ? "delegated" : "final",
      timestamp: item.timestamp,
      text: normalizedSnippet(item.text),
    }));

  const turns = userPositions.map((start, turn) => {
    const end = userPositions[turn + 1] ?? messages.length;
    const user = messages[start];
    const assistants = messages.slice(start + 1, end).filter((item) => item.role === "assistant");
    const outcomes = assistants.filter((item) => item.outcome);
    const delegated = assistants.filter((item) => item.delegated);
    const evidence = assistants
      .filter((item) => !item.outcome && !item.delegated && hasEvidenceSignal(item.text))
      .at(-1);
    const fallback = outcomes.length === 0 ? assistants.at(-1) : null;

    const normalizedTurn = {
      turn_number: turn + 1,
      goal: normalizedSnippet(user.text),
      goal_timestamp: user.timestamp,
      outcomes: outcomes.map((item) => ({
        timestamp: item.timestamp,
        text: normalizedSnippet(item.text),
      })),
      delegated_outcomes: delegated.map((item) => ({
        timestamp: item.timestamp,
        text: normalizedSnippet(item.text),
      })),
      unresolved: outcomes.length === 0,
    };
    if (evidence) {
      normalizedTurn.decisive_evidence = {
        timestamp: evidence.timestamp,
        text: normalizedSnippet(evidence.text),
      };
    }
    if (fallback) {
      normalizedTurn.latest_unresolved_state = {
        timestamp: fallback.timestamp,
        text: normalizedSnippet(fallback.text),
      };
    }
    return normalizedTurn;
  });
  return {
    turns,
    carryoverOutcomes,
    messageCount: messages.length,
    outcomeCount: messages.filter((item) => item.outcome).length,
    delegatedOutcomeCount: messages.filter((item) => item.delegated).length,
    turnsWithoutOutcome: turns.filter((turn) => turn.unresolved).length,
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function localDateKey(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

function timestampDateKey(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return localDateKey(text) || text.match(/^(\d{4}-\d{2}-\d{2})(?:$|[ T])/)?.[1] || "";
}

function isCodexSessionCandidate(file) {
  if (!file.endsWith(".jsonl")) return false;

  const [folderYear, folderMonth, folderDay] = path.relative(codexSessionsRoot, file).split(path.sep);
  if (!/^\d{4}$/.test(folderYear) || !/^\d{2}$/.test(folderMonth) || !/^\d{2}$/.test(folderDay)) return false;

  const folderDate = `${folderYear}-${folderMonth}-${folderDay}`;
  if (folderDate === date) return true;
  if (folderDate > date) return false;

  try {
    return localDateKey(fs.statSync(file).mtime) >= date;
  } catch {
    return false;
  }
}

function sessionDateMatchReason(file, records, sourceKind) {
  if (sourceKind === "codex-dated") return "codex dated session folder";
  if (sourceKind === "codex-archived") return "archived rollout filename";

  const timestamp = records.map(recordTimestamp).find((value) => timestampDateKey(value) === date);
  if (timestamp) return `record timestamp ${timestamp}`;

  try {
    const stat = fs.statSync(file);
    if (localDateKey(stat.mtime) === date) return `file mtime local ${localDateKey(stat.mtime)}`;
  } catch {
    return "";
  }
  return "";
}

function sessionEvidence(file, agent, sourceKind) {
  const records = readJsonl(file).filter(isWithinCaptureWindow);
  if (records.length === 0) return null;
  const dateMatch = sessionDateMatchReason(file, records, sourceKind);
  if (!dateMatch) return null;

  const timestampedRecords = records.filter((record) => timestampDateKey(recordTimestamp(record)));
  const targetRecords = timestampedRecords.filter((record) => timestampDateKey(recordTimestamp(record)) === date);
  const evidenceRecords = timestampedRecords.length > 0 ? targetRecords : records;
  if (evidenceRecords.length === 0) return null;
  if (isInternalSubagentSession(records)) {
    return { skipped: true, reason: "internal_subagent" };
  }

  const cwd = evidenceRecords.map(recordCwd).find(Boolean) || "";
  const model = evidenceRecords.map(recordModel).find(Boolean) || "";
  const timestamps = evidenceRecords.map(recordTimestamp).filter(Boolean);
  const userRecords = evidenceRecords.filter(isUserRecord);
  const meaningfulUserTexts = userRecords
    .filter((record) => !isInjectedUserRecord(record))
    .map(recordText)
    .filter(Boolean);
  const assistantTexts = evidenceRecords.filter(isAssistantRecord).map(recordText).filter(Boolean);
  const derived = containsVaultAnswer(evidenceRecords);
  const conversation = normalizedConversation(evidenceRecords);
  const firstGoal = meaningfulUserTexts.find((text) => text.length > 8) || "";
  const repoName = cwd ? path.basename(cwd) : "unknown-repo";
  const warnings = [];

  if (timestampedRecords.some((record) => {
    const recordDate = timestampDateKey(recordTimestamp(record));
    return recordDate !== date && (isUserRecord(record) || isAssistantRecord(record));
  })) warnings.push("cross_day_records_filtered");
  if (!cwd) warnings.push("missing_cwd");
  if (!firstGoal) warnings.push("missing_user_goal");
  if (meaningfulUserTexts.length <= 1 && assistantTexts.length === 0) warnings.push("low_signal");
  if (meaningfulUserTexts.some(isSelfReferentialText)) warnings.push("self_referential");
  return {
    kind: "session",
    evidenceId: sessionEvidenceId(file, sourceKind),
    agent,
    model,
    containsVaultAnswer: derived,
    sourceFile: compactPath(file),
    dateMatch,
    cwd: cwd ? compactPath(cwd) : "",
    repoName,
    lastTimestamp: timestamps[timestamps.length - 1] || "",
    recordCount: evidenceRecords.length,
    userTurnCount: meaningfulUserTexts.length,
    conversationMessageCount: conversation.messageCount,
    finalOutcomeCount: conversation.outcomeCount,
    delegatedOutcomeCount: conversation.delegatedOutcomeCount,
    turnsWithoutOutcome: conversation.turnsWithoutOutcome,
    turns: conversation.turns,
    carryoverOutcomes: conversation.carryoverOutcomes,
    warnings,
  };
}

const codexArchivedDir = path.join(home, ".codex", "archived_sessions");
const claudeProjectsDir = path.join(home, ".claude", "projects");
const config = readConfig();
const codexSourcesEnabled = config.codexSourcesEnabled !== false;
const claudeSourcesEnabled = config.claudeSourcesEnabled !== false;
const sources = [];

if (codexSourcesEnabled) {
  sources.push(
    ...walk(codexSessionsRoot, isCodexSessionCandidate).map((file) => ({
      file,
      agent: "Codex",
      sourceKind: "codex-dated",
    })),
    ...walk(codexArchivedDir, (file) => path.basename(file).startsWith(`rollout-${date}`) && file.endsWith(".jsonl")).map((file) => ({
      file,
      agent: "Codex",
      sourceKind: "codex-archived",
    })),
  );
}

if (claudeSourcesEnabled) {
  sources.push(...walk(claudeProjectsDir, (file) => file.endsWith(".jsonl")).map((file) => ({
    file,
    agent: "Claude Code",
    sourceKind: "claude",
  })));
}

const sessionResults = sources
  .map(({ file, agent, sourceKind }) => sessionEvidence(file, agent, sourceKind))
  .filter(Boolean);
const seenEvidenceIds = new Set();
const duplicateEvidenceIds = new Set();
const sessions = sessionResults.filter((session) => {
  if (session.skipped) return false;
  if (seenEvidenceIds.has(session.evidenceId)) {
    duplicateEvidenceIds.add(session.evidenceId);
    return false;
  }
  seenEvidenceIds.add(session.evidenceId);
  return true;
});
const internalSubagentSessionsSkipped = sessionResults.filter(
  (session) => session.skipped && session.reason === "internal_subagent"
).length;

const allWarnings = [...new Set(sessions.flatMap((session) => session.warnings))];
if (duplicateEvidenceIds.size > 0) allWarnings.push("duplicate_session_source_filtered");
const hasVaultAnswer = sessions.some((session) => session.containsVaultAnswer);
if (sessions.length === 0) allWarnings.push("no_sources");

const capture = {
  snapshot_kind: "bounded_daily_evidence",
  date,
  generated_at: new Date().toISOString(),
  capture_end_timestamp: captureEndTimestamp || null,
  daily_summary_detail: config.dailySummaryDetail === "concise" ? "concise" : "detailed",
  daily_wiki_target: dailyWikiPath,
  capture_file: compactPath(outputPath),
  evidence_card_count: sessions.length,
  internal_subagent_sessions_skipped: internalSubagentSessionsSkipped,
  contains_vault_answer: hasVaultAnswer,
  warnings: allWarnings,
  schema: fs.readFileSync(path.join(repoRoot, "SCHEMA.md"), "utf8").trimEnd(),
  daily_template: fs.readFileSync(path.join(repoRoot, "wiki", "templates", "Daily AI Chat Summary Template.md"), "utf8").trimEnd(),
  cards: sessions.map((session) => ({
    kind: "agent_session",
    evidence_id: session.evidenceId,
    agent: session.agent,
    repo: session.repoName,
    cwd: session.cwd,
    source_file: session.sourceFile,
    date_match: session.dateMatch,
    model: session.model,
    contains_vault_answer: session.containsVaultAnswer,
    last_timestamp: session.lastTimestamp,
    counts: {
      raw_records: session.recordCount,
      user_turns: session.userTurnCount,
      conversation_messages: session.conversationMessageCount,
      final_outcomes: session.finalOutcomeCount,
      delegated_outcomes: session.delegatedOutcomeCount,
      turns_without_final_outcome: session.turnsWithoutOutcome,
      carryover_outcomes: session.carryoverOutcomes.length,
    },
    warnings: session.warnings,
    turns: session.turns,
    carryover_outcomes: session.carryoverOutcomes,
  })),
};

function turnFingerprint(turn) {
  return JSON.stringify([
    normalizedSnippet(turn.goal),
    (turn.outcomes || []).map((item) => normalizedSnippet(item.text)),
    (turn.delegated_outcomes || []).map((item) => normalizedSnippet(item.text)),
    normalizedSnippet(turn.decisive_evidence?.text),
    normalizedSnippet(turn.latest_unresolved_state?.text),
  ]);
}

function reduceCardTurns(card) {
  const selected = new Set();
  const fingerprints = new Set();
  let latestUnresolved = -1;
  card.turns.forEach((turn, index) => {
    if (turn.unresolved) latestUnresolved = index;
  });
  card.turns.forEach((turn, index) => {
    const hasOutcome = (turn.outcomes || []).length > 0 || (turn.delegated_outcomes || []).length > 0;
    const hasEvidence = Boolean(turn.decisive_evidence);
    const isLatestUnresolved = index === latestUnresolved;
    if (!hasOutcome && !hasEvidence && !isLatestUnresolved) return;
    const fingerprint = turnFingerprint(turn);
    if (fingerprints.has(fingerprint)) return;
    fingerprints.add(fingerprint);
    selected.add(index);
  });
  if (selected.size === 0 && card.turns.length > 0) selected.add(card.turns.length - 1);
  return selected;
}

function renderSnapshot(selectedTurns) {
  const totalTurns = capture.cards.reduce((count, card) => count + card.turns.length, 0);
  const includedTurns = selectedTurns.reduce((count, indexes) => count + indexes.size, 0);
  const omittedTurns = totalTurns - includedTurns;
  const warnings = omittedTurns > 0
    ? [...new Set([...capture.warnings, "snapshot_turns_omitted"])]
    : capture.warnings;
  const snapshot = {
    ...capture,
    included_turns: includedTurns,
    omitted_turns: omittedTurns,
    snapshot_mode: omittedTurns > 0 ? "whole-turn-trim" : "all-turns",
    warnings,
    cards: capture.cards.map((card, cardIndex) => {
      const selected = selectedTurns[cardIndex];
      const turns = card.turns.filter((_, turnIndex) => selected.has(turnIndex));
      return {
        ...card,
        counts: {
          ...card.counts,
          included_turns: turns.length,
          omitted_turns: card.turns.length - turns.length,
        },
        turns,
      };
    }),
  };
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function buildSnapshot() {
  const selectedTurns = capture.cards.map(reduceCardTurns);
  return renderSnapshot(selectedTurns);
}

const snapshotText = buildSnapshot();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, snapshotText, "utf8");
console.log(`Wrote ${compactPath(outputPath)}`);
