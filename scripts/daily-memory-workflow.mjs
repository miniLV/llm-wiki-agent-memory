#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [mode, date, ...options] = process.argv.slice(2);
const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date || "");
const validInvocation = validDate && options.length === 0 && ["prepare", "read", "verify"].includes(mode);

if (!validInvocation) {
  console.error("Usage: node scripts/daily-memory-workflow.mjs prepare YYYY-MM-DD | read YYYY-MM-DD | verify YYYY-MM-DD");
  process.exit(1);
}

const captureDir = path.join(repoRoot, ".vault-meta", "captures", "ai-chats");
const capturePath = path.join(captureDir, `${date}.capture.json`);
const dailyPath = path.join(repoRoot, "wiki", "sources", "ai-chats", `${date}.md`);
const logPath = path.join(repoRoot, "wiki", "log.md");
const ledgerPath = path.join(captureDir, `${date}.read-ledger.json`);
// Sized so a worst-case CJK-dense chunk stays under the agent harness's ~10k-token tool output budget.
const CHUNK_CHARS = 8000;

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readJson(file) {
  return parseJson(read(file));
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, "/");
}

function isEvidenceSnapshot(capture) {
  return capture?.date === date
    && capture.snapshot_kind === "bounded_daily_evidence"
    && Array.isArray(capture.cards);
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function fail(label, result) {
  const detail = String(result.stderr || result.stdout || result.error?.message || "unknown error").trim();
  console.error(`${label} failed${detail ? `: ${detail.slice(-4000)}` : ""}`);
  process.exit(result.status || 1);
}

function localDate() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function dailyTargetFailure(capture) {
  if (!fs.existsSync(dailyPath)) return `Daily page missing: ${relative(dailyPath)}`;
  const text = read(dailyPath);
  if (!text.trim()) return `Daily page empty: ${relative(dailyPath)}`;
  const captureGeneratedAt = Date.parse(String(capture?.generated_at || ""));
  if (!Number.isFinite(captureGeneratedAt)) return `Evidence Snapshot generated_at missing or invalid: ${relative(capturePath)}`;
  if (fs.statSync(dailyPath).mtimeMs <= captureGeneratedAt) {
    return `Daily page was not written after current Evidence Snapshot: ${relative(dailyPath)}`;
  }
  const frontmatterEnd = text.startsWith("---") ? text.indexOf("\n---", 3) : -1;
  const frontmatter = frontmatterEnd >= 0 ? text.slice(3, frontmatterEnd) : "";
  const frontmatterDate = frontmatter.match(/^date:\s*['"]?(\d{4}-\d{2}-\d{2})['"]?\s*$/m)?.[1];
  if (frontmatterDate !== date) {
    return `Daily frontmatter date must match filename: expected ${date}, found ${frontmatterDate || "none"}`;
  }
  return "";
}

function appendSuccessLog(capture, warnings) {
  const existing = read(logPath);
  const dailyHash = crypto.createHash("sha256").update(read(dailyPath)).digest("hex").slice(0, 12);
  const entry = `- ${localDate()}: compiled \`wiki/sources/ai-chats/${date}.md\` from ${capture.cards.length} Evidence Cards (Daily SHA-256: \`${dailyHash}\`); strict lint passed with 0 errors and ${warnings} warnings.`;
  if (existing.split("\n").includes(entry)) return { entry, appended: false };
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${existing && !existing.endsWith("\n") ? "\n" : ""}${entry}\n`, "utf8");
  return { entry, appended: true };
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function chunkBoundaries(text) {
  const boundaries = [0];
  while (boundaries[boundaries.length - 1] < text.length) {
    const start = boundaries[boundaries.length - 1];
    let end = Math.min(start + CHUNK_CHARS, text.length);
    const lead = text.charCodeAt(end - 1);
    if (end < text.length && lead >= 0xd800 && lead <= 0xdbff) end -= 1;
    boundaries.push(end);
  }
  return boundaries;
}

function freshLedger(snapshotText) {
  return {
    snapshotSha256: sha256(snapshotText),
    nextChunk: 0,
  };
}

function writeLedger(ledger) {
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function snapshotReadFailure(snapshotText) {
  const ledger = readJson(ledgerPath);
  if (!ledger) return `Snapshot read ledger missing: ${relative(ledgerPath)}`;
  if (ledger.snapshotSha256 !== sha256(snapshotText)) {
    return `Evidence Snapshot changed after chunk reads began: ${relative(capturePath)}`;
  }
  const totalChunks = chunkBoundaries(snapshotText).length - 1;
  if (ledger.nextChunk !== totalChunks) {
    return `Snapshot read ledger incomplete: read ${Number.isInteger(ledger.nextChunk) ? ledger.nextChunk : 0}/${totalChunks} chunks`;
  }
  return "";
}

if (mode === "prepare") {
  const captureRun = run(process.execPath, [path.join(repoRoot, "scripts", "capture-ai-chats.mjs"), date]);
  if (captureRun.status !== 0) fail("capture", captureRun);
  const snapshotText = read(capturePath);
  const capture = parseJson(snapshotText);
  if (!isEvidenceSnapshot(capture)) {
    console.error(`Invalid Evidence Snapshot: ${relative(capturePath)}`);
    process.exit(1);
  }
  const snapshotBytes = Buffer.byteLength(snapshotText);
  const ledger = freshLedger(snapshotText);
  writeLedger(ledger);
  const noSources = capture.cards.length === 0;
  const status = noSources ? "skipped_no_sources" : "ready";
  const result = {
    mode,
    date,
    status,
    skipReason: "",
    evidenceCards: capture.cards.length,
    containsVaultAnswer: Boolean(capture.contains_vault_answer),
    captureEndTimestamp: capture.capture_end_timestamp || null,
    captureTurns: Number(capture.included_turns || 0) + Number(capture.omitted_turns || 0),
    includedTurns: Number(capture.included_turns || 0),
    omittedTurns: Number(capture.omitted_turns || 0),
    snapshotMode: capture.snapshot_mode,
    snapshotBytes,
    snapshotPersisted: true,
    evidenceSnapshot: relative(capturePath),
  };
  console.log(JSON.stringify(result));
  process.exit(0);
}

if (mode === "read") {
  const snapshotText = read(capturePath);
  if (!snapshotText) {
    console.error(`Evidence Snapshot missing: ${relative(capturePath)}`);
    process.exit(1);
  }
  if (!isEvidenceSnapshot(parseJson(snapshotText))) {
    console.error(`Invalid Evidence Snapshot: ${relative(capturePath)}`);
    process.exit(1);
  }
  const fresh = freshLedger(snapshotText);
  const boundaries = chunkBoundaries(snapshotText);
  const totalChunks = boundaries.length - 1;
  const stored = readJson(ledgerPath);
  if (stored && stored.snapshotSha256 !== fresh.snapshotSha256) {
    console.error(`Evidence Snapshot changed after chunk reads began: ${relative(capturePath)}`);
    process.exit(1);
  }
  const index = Number.isInteger(stored?.nextChunk)
    && stored.nextChunk >= 0
    && stored.nextChunk <= totalChunks
    ? stored.nextChunk
    : 0;
  if (index === totalChunks) {
    console.log(JSON.stringify({
      mode,
      date,
      done: true,
      totalChunks,
      evidenceSnapshot: relative(capturePath),
    }));
  } else {
    writeLedger({ ...fresh, nextChunk: index + 1 });
    const label = `${index + 1}/${totalChunks}`;
    process.stdout.write(`CHUNK ${label}\n`);
    process.stdout.write(snapshotText.slice(boundaries[index], boundaries[index + 1]));
    process.stdout.write(`\nEND CHUNK ${label}\n`);
  }
}

if (mode === "verify") {
  const snapshotText = read(capturePath);
  const capture = parseJson(snapshotText);
  const captureFailure = isEvidenceSnapshot(capture)
    ? ""
    : `Invalid Evidence Snapshot: ${relative(capturePath)}`;
  const preconditionFailure = captureFailure || snapshotReadFailure(snapshotText) || dailyTargetFailure(capture);
  const lint = run(process.execPath, [path.join(repoRoot, "scripts", "wiki-lint.mjs"), "--strict"]);
  const report = readJson(path.join(repoRoot, ".vault-meta", "reviews", "wiki-lint-latest.json"));
  const issues = Array.isArray(report?.issues) ? report.issues : [];
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const beforeLog = read(logPath);
  const preDiffCheck = run("git", ["diff", "--check", "--", relative(dailyPath), relative(logPath)]);
  let logResult = { entry: "", appended: false };
  if (!preconditionFailure && lint.status === 0 && preDiffCheck.status === 0) {
    logResult = appendSuccessLog(capture, warningCount);
  }
  const diffCheck = run("git", ["diff", "--check", "--", relative(dailyPath), relative(logPath)]);
  if (logResult.appended && diffCheck.status !== 0) {
    fs.writeFileSync(logPath, beforeLog, "utf8");
    logResult = { entry: "", appended: false };
  }
  const status = run("git", ["status", "--short", "--", relative(dailyPath), relative(logPath)]);
  const result = {
    mode,
    date,
    ok: !preconditionFailure && lint.status === 0 && diffCheck.status === 0 && status.status === 0,
    lint: {
      exitCode: lint.status,
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: warningCount,
    },
    diffCheck: diffCheck.status === 0 ? "clean" : "failed",
    logEntry: logResult.entry,
    logAppended: logResult.appended,
    changedFiles: String(status.stdout || "").trim().split("\n").filter(Boolean),
  };
  if (!result.ok) {
    result.failure = String(preconditionFailure || lint.stderr || lint.stdout || diffCheck.stderr || diffCheck.stdout || status.stderr || "verification failed").trim().slice(-4000);
  }
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
