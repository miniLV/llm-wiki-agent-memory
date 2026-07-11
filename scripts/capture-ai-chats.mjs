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

const captureVersion = 7;
const memoryDerivedMarker = "<!-- llm-wiki-memory:derived -->";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = process.env.LLM_WIKI_CAPTURE_OUTPUT_PATH ||
  path.join(repoRoot, ".vault-meta", "captures", "ai-chats", `${date}.md`);
const captureAssetDir = process.env.LLM_WIKI_CAPTURE_ASSET_DIR ||
  path.join(repoRoot, ".vault-meta", "captures", "assets", "ai-chats", date);
const configPath = process.env.LLM_WIKI_CAPTURE_CONFIG_PATH ||
  path.join(repoRoot, ".vault-meta", "config.json");
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

function expandHome(p) {
  if (p === "~") return home;
  if (p.startsWith("~/")) return path.join(home, p.slice(2));
  return p;
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

function recordContentParts(record) {
  return [
    record.content,
    record.message?.content,
    record.payload?.content,
    record.item?.content,
  ].flatMap((candidate) => Array.isArray(candidate) ? candidate : []);
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

function imageSource(part) {
  if (!part || typeof part !== "object") return null;
  const type = String(part.type || "").toLowerCase();
  const imageUrl = typeof part.image_url === "string"
    ? part.image_url
    : firstString(part.image_url?.url, part.url, part.file_path, part.path);
  if (imageUrl && (type.includes("image") || part.image_url || part.file_path)) {
    return { value: imageUrl, mediaType: firstString(part.media_type, part.mime_type), detail: firstString(part.detail) };
  }
  if (type.includes("image") && part.source?.type === "base64" && part.source?.data) {
    const mediaType = firstString(part.source.media_type, part.media_type, "image/png");
    return {
      value: `data:${mediaType};base64,${part.source.data}`,
      mediaType,
      detail: firstString(part.detail),
    };
  }
  return null;
}

function imageExtension(mediaType, source = "") {
  const normalized = String(mediaType || "").toLowerCase();
  const byType = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  if (byType[normalized]) return byType[normalized];
  const ext = path.extname(String(source).split(/[?#]/)[0]).slice(1).toLowerCase();
  return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) ? ext.replace("jpeg", "jpg") : "png";
}

function persistVisualSource(source) {
  const maxBytes = 20 * 1024 * 1024;
  let buffer = null;
  let mediaType = source.mediaType;
  let sourceLabel = "embedded session image";
  const dataMatch = source.value.match(/^data:([^;,]+);base64,([\s\S]+)$/);

  try {
    if (dataMatch) {
      mediaType = mediaType || dataMatch[1];
      buffer = Buffer.from(dataMatch[2], "base64");
    } else {
      const expanded = expandHome(source.value.replace(/^file:\/\//, ""));
      if (path.isAbsolute(expanded) && exists(expanded)) {
        buffer = fs.readFileSync(expanded);
        sourceLabel = compactPath(expanded);
      }
    }
  } catch {
    return { warning: "visual_capture_failed", source: sourceLabel };
  }

  if (!buffer) {
    return {
      warning: /^https?:\/\//.test(source.value) ? "remote_visual_not_cached" : "visual_source_unavailable",
      source: /^https?:\/\//.test(source.value) ? source.value : sourceLabel,
    };
  }
  if (buffer.length === 0 || buffer.length > maxBytes) {
    return { warning: "visual_size_out_of_range", source: sourceLabel, bytes: buffer.length };
  }

  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const extension = imageExtension(mediaType, source.value);
  const target = path.join(captureAssetDir, `${hash.slice(0, 16)}.${extension}`);
  fs.mkdirSync(captureAssetDir, { recursive: true });
  if (!exists(target)) fs.writeFileSync(target, buffer);
  return {
    captureFile: compactPath(target),
    mediaType: mediaType || `image/${extension}`,
    bytes: buffer.length,
    detail: source.detail,
    source: sourceLabel,
    hash,
  };
}

function recordVisualEvidence(records) {
  const visuals = [];
  const seen = new Set();
  let truncated = false;
  for (const record of records) {
    for (const part of recordContentParts(record)) {
      const source = imageSource(part);
      if (!source) continue;
      if (visuals.length >= 8) {
        truncated = true;
        continue;
      }
      const visual = persistVisualSource(source);
      const key = visual.hash || `${visual.source}:${visual.warning}`;
      if (seen.has(key)) continue;
      seen.add(key);
      visuals.push({
        ...visual,
        timestamp: recordTimestamp(record),
        context: safeSnippet(recordText(record), 180),
      });
    }
  }
  return { visuals, truncated };
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
    .replace(/`/g, "'")
    .trim();
}

function safeSnippet(text, maxChars = 240) {
  const normalized = normalizedSnippet(text);
  if (normalized.length <= maxChars) return normalized;
  const separator = " … [truncated] … ";
  const tailLength = Math.min(240, Math.floor(maxChars / 3));
  const headLength = Math.max(1, maxChars - tailLength - separator.length);
  return `${normalized.slice(0, headLength)}${separator}${normalized.slice(-tailLength)}`;
}

function highlightScore(text) {
  const value = String(text || "");
  let score = Math.min(3, Math.floor(value.length / 180));
  const patterns = [
    /\b[A-Z][A-Z0-9]+-\d+\b/i,
    /\b(?:error|failed|failure|root cause|fixed|decision|conclusion|verify|verified|blocker|source map|runtime|callback|build)\b/i,
    /(?:原因|结论|决定|修复|失败|报错|验证|阻塞|日志|截图|运行包|调用链|数据流)/,
    /`[^`]+`/,
    /(?:^|\s)[~/.][^\s]+/,
  ];
  for (const pattern of patterns) if (pattern.test(value)) score += 2;
  return score;
}

function isAssistantOutcome(record) {
  const phase = recordPhase(record);
  return phase === "final_answer" || phase === "end_turn";
}

function conversationHighlights(records) {
  const messages = records
    .map((record, index) => {
      const text = recordText(record);
      const role = isUserRecord(record) ? "user" : isAssistantRecord(record) ? "assistant" : "";
      return {
        index,
        role,
        text,
        timestamp: recordTimestamp(record),
        score: highlightScore(text),
        outcome: role === "assistant" && isAssistantOutcome(record),
        delegated: isDelegatedOutcomeRecord(record),
        record,
      };
    })
    .filter((item) => item.role && item.text && !(item.role === "user" && isInjectedUserRecord(item.record, item.text)));

  const userPositions = messages
    .map((item, position) => item.role === "user" ? position : -1)
    .filter((position) => position >= 0);
  const turnsWithoutOutcome = userPositions.filter((start, turn) => {
    const end = userPositions[turn + 1] ?? messages.length;
    return !messages.slice(start + 1, end).some((item) => item.outcome);
  }).length;
  const selected = new Set();
  if (messages.length <= 8) {
    for (const item of messages) selected.add(item.index);
  } else {
    if (userPositions.length === 0) {
      for (const item of messages.filter((candidate) => candidate.outcome)) selected.add(item.index);
      for (const item of messages.filter((candidate) => candidate.delegated)) selected.add(item.index);
      for (const item of messages.slice(0, 2)) selected.add(item.index);
      for (const item of messages.slice(-4)) selected.add(item.index);
      for (const item of [...messages].sort((a, b) => b.score - a.score || a.index - b.index)) {
        if (selected.size >= 16) break;
        selected.add(item.index);
      }
    } else {
      for (let turn = 0; turn < userPositions.length; turn += 1) {
        const start = userPositions[turn];
        const end = userPositions[turn + 1] ?? messages.length;
        const user = messages[start];
        const assistants = messages.slice(start + 1, end).filter((item) => item.role === "assistant");
        selected.add(user.index);
        for (const outcome of assistants.filter((item) => item.outcome)) selected.add(outcome.index);
        for (const delegated of assistants.filter((item) => item.delegated)) selected.add(delegated.index);
        const evidence = assistants
          .filter((item) => !item.outcome && !item.delegated)
          .sort((a, b) => b.score - a.score || b.index - a.index)[0];
        if (evidence) selected.add(evidence.index);
        if (assistants.length > 0 && !assistants.some((item) => item.outcome)) {
          selected.add(assistants.at(-1).index);
        }
      }

      for (const outcome of messages.filter((item) => item.outcome)) selected.add(outcome.index);
      for (const delegated of messages.filter((item) => item.delegated)) selected.add(delegated.index);
    }
  }

  let textTruncated = false;
  const highlights = messages
    .filter((item) => selected.has(item.index))
    .map((item) => {
      const maxChars = item.role === "user" ? 600 : item.outcome ? 1200 : 700;
      if (normalizedSnippet(item.text).length > maxChars) textTruncated = true;
      return { ...item, record: undefined, text: safeSnippet(item.text, maxChars) };
    });

  return {
    highlights,
    messageCount: messages.length,
    selectedCount: highlights.length,
    unselectedCount: Math.max(0, messages.length - highlights.length),
    outcomeCount: messages.filter((item) => item.outcome).length,
    delegatedOutcomeCount: messages.filter((item) => item.delegated).length,
    turnsWithoutOutcome,
    textTruncated,
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
  const records = readJsonl(file);
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
  const userTexts = userRecords.map(recordText).filter(Boolean);
  const meaningfulUserTexts = userRecords
    .filter((record) => !isInjectedUserRecord(record))
    .map(recordText)
    .filter(Boolean);
  const assistantTexts = evidenceRecords.filter(isAssistantRecord).map(recordText).filter(Boolean);
  const derived = containsVaultAnswer(evidenceRecords);
  const { visuals, truncated: visualsTruncated } = recordVisualEvidence(evidenceRecords);
  const conversation = conversationHighlights(evidenceRecords);
  const firstGoal = meaningfulUserTexts.find((text) => text.length > 8) || "";
  const lastGoal = [...meaningfulUserTexts].reverse().find((text) => text.length > 8) || "";
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
  if (conversation.unselectedCount > 0) warnings.push("conversation_highlights_reduced");
  if (conversation.textTruncated) warnings.push("highlight_text_truncated");
  if (visuals.length > 0) warnings.push("visual_evidence_present");
  if (visualsTruncated) warnings.push("visual_evidence_truncated");
  for (const visual of visuals) {
    if (visual.warning) warnings.push(visual.warning);
  }

  return {
    kind: "session",
    agent,
    model,
    containsVaultAnswer: derived,
    sourceFile: compactPath(file),
    dateMatch,
    cwd: cwd ? compactPath(cwd) : "",
    repoName,
    firstTimestamp: timestamps[0] || "",
    lastTimestamp: timestamps[timestamps.length - 1] || "",
    recordCount: evidenceRecords.length,
    userTurnCount: meaningfulUserTexts.length,
    conversationMessageCount: conversation.messageCount,
    selectedHighlightCount: conversation.selectedCount,
    unselectedMessageCount: conversation.unselectedCount,
    finalOutcomeCount: conversation.outcomeCount,
    delegatedOutcomeCount: conversation.delegatedOutcomeCount,
    turnsWithoutOutcome: conversation.turnsWithoutOutcome,
    highlightTextTruncated: conversation.textTruncated,
    firstGoal: safeSnippet(firstGoal || "No clear user goal detected."),
    lastGoal: safeSnippet(lastGoal || "No clear final user goal detected."),
    highlights: conversation.highlights,
    visuals,
    warnings,
  };
}

function yamlList(values) {
  if (values.length === 0) return [" []"];
  return ["", ...values.map((value) => `  - ${JSON.stringify(value)}`)];
}

function pushField(lines, name, value) {
  if (value !== "" && value !== null && value !== undefined) lines.push(`- ${name}: ${value}`);
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
      agent: "Codex archived",
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
const sessions = sessionResults.filter((session) => !session.skipped);
const internalSubagentSessionsSkipped = sessionResults.filter(
  (session) => session.skipped && session.reason === "internal_subagent"
).length;

const allWarnings = [...new Set(sessions.flatMap((session) => session.warnings))];
const visualEvidenceCount = sessions.reduce((sum, session) => sum + session.visuals.length, 0);
const hasVaultAnswer = sessions.some((session) => session.containsVaultAnswer);
if (sessions.length === 0) allWarnings.push("no_sources");

const lines = [
  "---",
  "type: capture-inbox",
  `date: ${date}`,
  `capture_version: ${captureVersion}`,
  `generated_at: ${new Date().toISOString()}`,
  `daily_wiki_target: ${dailyWikiPath}`,
  `source_count: ${sessions.length}`,
  `session_count: ${sessions.length}`,
  `contains_vault_answer: ${hasVaultAnswer}`,
  `visual_evidence_count: ${visualEvidenceCount}`,
  `warnings:${yamlList(allWarnings).join("\n")}`,
  "---",
  "",
  `# ${date} AI Chat Capture Inbox`,
  "",
  "This file is evidence input for the daily workflow. It is not a Daily Wiki page, not a conclusion, and not a reusable lesson.",
  "",
  "Use it to write:",
  "",
  `- \`${dailyWikiPath}\``,
  "- `wiki/log.md`",
  "",
  "Do not copy full raw JSONL logs into the wiki. Use source files for audit-level evidence only.",
  "",
  "## Capture Summary",
  "",
  `- Date: ${date}`,
  `- Evidence cards: ${sessions.length}`,
  `- Session cards: ${sessions.length}`,
  `- Internal subagent sessions skipped: ${internalSubagentSessionsSkipped}`,
  `- Contains vault answer: ${hasVaultAnswer}`,
  `- Visual evidence items: ${visualEvidenceCount}`,
  `- Capture warnings: ${allWarnings.length > 0 ? allWarnings.join(", ") : "none"}`,
  "",
  "## Evidence Cards",
  "",
];

let sessionIndex = 0;
for (const session of sessions) {
  sessionIndex += 1;
  lines.push(`### session-${String(sessionIndex).padStart(3, "0")} · ${session.repoName}`, "");
  pushField(lines, "Kind", "agent session");
  pushField(lines, "Agent", session.agent);
  pushField(lines, "Contains vault answer", session.containsVaultAnswer);
  pushField(lines, "Source file", session.sourceFile);
  pushField(lines, "Date match", session.dateMatch);
  pushField(lines, "CWD", session.cwd);
  pushField(lines, "Model", session.model);
  pushField(lines, "First timestamp", session.firstTimestamp);
  pushField(lines, "Last timestamp", session.lastTimestamp);
  pushField(lines, "Raw record count", session.recordCount);
  pushField(lines, "Meaningful user turns", session.userTurnCount);
  pushField(lines, "Conversation messages", session.conversationMessageCount);
  pushField(lines, "Selected highlights", session.selectedHighlightCount);
  pushField(lines, "Unselected messages", session.unselectedMessageCount);
  pushField(lines, "Final outcomes", session.finalOutcomeCount);
  pushField(lines, "Delegated outcomes", session.delegatedOutcomeCount);
  pushField(lines, "User turns without final outcome", session.turnsWithoutOutcome);
  pushField(lines, "Highlight text truncated", session.highlightTextTruncated);
  pushField(lines, "Warnings", session.warnings.length > 0 ? session.warnings.join(", ") : "none");
  lines.push("", "- First user request:", `  - ${session.firstGoal}`, "");
  lines.push("- Last user request:", `  - ${session.lastGoal}`, "");
  if (session.highlights.length > 0) {
    lines.push("- Conversation highlights (chronological):");
    for (const highlight of session.highlights) {
      const timestamp = highlight.timestamp ? ` · ${highlight.timestamp}` : "";
      const role = highlight.delegated ? "delegated outcome" : highlight.role;
      lines.push(`  - ${role}${timestamp}: ${highlight.text}`);
    }
    lines.push("");
  }
  if (session.visuals.length > 0) {
    lines.push("- Visual evidence:");
    for (const visual of session.visuals) {
      lines.push(`  - Capture file: ${visual.captureFile || "not cached"}`);
      if (visual.source) lines.push(`    Source: ${visual.source}`);
      if (visual.mediaType) lines.push(`    Media type: ${visual.mediaType}`);
      if (visual.bytes) lines.push(`    Bytes: ${visual.bytes}`);
      if (visual.timestamp) lines.push(`    Timestamp: ${visual.timestamp}`);
      if (visual.context) lines.push(`    Turn context: ${visual.context}`);
      if (visual.warning) lines.push(`    Warning: ${visual.warning}`);
    }
    lines.push("");
  }
}

if (sessions.length === 0) {
  lines.push("No enabled source evidence matched this date.", "");
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join("\n").trimEnd()}\n`, "utf8");
console.log(`Wrote ${compactPath(outputPath)}`);
