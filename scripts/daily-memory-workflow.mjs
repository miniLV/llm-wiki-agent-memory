#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [mode, date, ...options] = process.argv.slice(2);
const emitSnapshot = mode === "prepare" && options.length === 1 && options[0] === "--emit-snapshot";
const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date || "");
const validInvocation = validDate && (
  (mode === "prepare" && (options.length === 0 || emitSnapshot))
  || (mode === "verify" && options.length === 0)
);

if (!validInvocation) {
  console.error("Usage: node scripts/daily-memory-workflow.mjs prepare YYYY-MM-DD [--emit-snapshot] | verify YYYY-MM-DD");
  process.exit(1);
}

const captureDir = path.join(repoRoot, ".vault-meta", "captures", "ai-chats");
const capturePath = path.join(captureDir, `${date}.capture.json`);
const dailyPath = path.join(repoRoot, "wiki", "sources", "ai-chats", `${date}.md`);
const logPath = path.join(repoRoot, "wiki", "log.md");

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

const capture = readJson(capturePath);
const captureFailure = isEvidenceSnapshot(capture)
  ? ""
  : `Invalid Evidence Snapshot: ${relative(capturePath)}`;
const preconditionFailure = captureFailure || dailyTargetFailure(capture);
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
