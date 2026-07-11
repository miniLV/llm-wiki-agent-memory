#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.LLM_WIKI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wikiRoot = path.join(repoRoot, "wiki");
const reviewDir = path.join(repoRoot, ".vault-meta", "reviews");
const markdownReportPath = path.join(reviewDir, "wiki-lint-latest.md");
const jsonReportPath = path.join(reviewDir, "wiki-lint-latest.json");
const strict = process.argv.includes("--strict");
const config = JSON.parse(read(path.join(repoRoot, ".vault-meta", "config.json")) || "{}");
const detailedDaily = config.dailySummaryDetail !== "concise";

const dailyFields = ["date", "source_links", "lookup_keys", "confidence", "contains_vault_answer"];
const issues = [];
const stats = { dailyPages: 0, concepts: 0, wikiFiles: 0, promotedRules: 0 };

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, "/");
}

function add(severity, code, file, message) {
  issues.push({ severity, code, file: file ? relative(file) : "", message });
}

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function listMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listMarkdown(full));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
  }
  return files.sort();
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { fields: new Map() };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { fields: new Map() };
  const fields = new Map();
  let current = null;
  for (const line of text.slice(4, end).trimEnd().split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      current = match[1];
      fields.set(current, match[2] || "");
    } else if (current && /^\s+-\s+/.test(line)) {
      fields.set(current, `${fields.get(current)}\n${line}`);
    }
  }
  return { fields };
}

function listFieldValues(fields, key) {
  const value = String(fields.get(key) || "").trim();
  if (!value || value === "[]") return [];
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
  return value.split("\n")
    .map((line) => line.match(/^\s+-\s+(.+)$/)?.[1]?.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function expandHome(file) {
  return file === "~" || file.startsWith("~/")
    ? path.join(os.homedir(), file.slice(2))
    : file;
}

function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const content = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    content.push(lines[index]);
  }
  return content.join("\n").trim();
}

function collectPages(files) {
  const pages = new Map();
  for (const file of files) {
    const withExtension = relative(file).replace(/^wiki\//, "");
    const withoutExtension = withExtension.replace(/\.md$/, "");
    const base = path.basename(file, ".md");
    pages.set(withExtension, file);
    pages.set(withoutExtension, file);
    if (!pages.has(base)) pages.set(base, file);
  }
  return pages;
}

function extractWikilinks(text) {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((match) => match[1].split("|")[0].split("#")[0].trim().replace(/\.md$/, ""))
    .filter(Boolean);
}

function resolveLink(target, pages) {
  const clean = target.replace(/^wiki\//, "").replace(/^\/+/, "");
  return pages.get(clean) || pages.get(path.basename(clean));
}

function checkDailyPages() {
  const dir = path.join(wikiRoot, "sources", "ai-chats");
  const files = listMarkdown(dir).filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(path.basename(file)));
  stats.dailyPages = files.length;

  for (const file of files) {
    const text = read(file);
    const { fields } = parseFrontmatter(text);
    for (const key of dailyFields) {
      if (!fields.has(key)) add("error", "daily-frontmatter", file, `Missing frontmatter field: ${key}.`);
    }
    for (const key of fields.keys()) {
      if (!dailyFields.includes(key)) add("error", "daily-frontmatter-extra", file, `Unexpected frontmatter field: ${key}.`);
    }

    const filenameDate = path.basename(file, ".md");
    if (fields.has("date") && String(fields.get("date")).replace(/^['"]|['"]$/g, "") !== filenameDate) {
      add("error", "daily-date", file, `Frontmatter date must match filename: ${filenameDate}.`);
    }
    const sourceLinks = listFieldValues(fields, "source_links");
    if (fields.has("source_links") && sourceLinks.length === 0) {
      add("error", "daily-source-links", file, "source_links must include at least one original session file.");
    }
    if (fields.has("confidence") && !/^(high|medium|low)$/.test(String(fields.get("confidence")).trim())) {
      add("error", "daily-confidence", file, "confidence must be high, medium, or low.");
    }
    if (fields.has("contains_vault_answer") && !/^(true|false)$/.test(String(fields.get("contains_vault_answer")).trim())) {
      add("error", "daily-derived-flag", file, "contains_vault_answer must be true or false.");
    }
    for (const heading of ["摘要", "关键会话", "可复用经验"]) {
      if (!section(text, heading)) add("error", "daily-section", file, `Missing or empty section: ## ${heading}.`);
    }

    const capture = read(path.join(repoRoot, ".vault-meta", "captures", "ai-chats", `${filenameDate}.md`));
    const captureSources = new Set(
      [...capture.matchAll(/^- Source file:\s*(.+)$/gm)].map((match) => path.resolve(expandHome(match[1].trim()))),
    );
    for (const source of sourceLinks) {
      if (!path.isAbsolute(source)) {
        add("error", "daily-source-links", file, `source_link must be absolute: ${source}`);
        continue;
      }
      const resolved = path.resolve(source);
      if (!fs.existsSync(resolved)) add("error", "daily-source-links", file, `source_link does not exist: ${source}`);
      if (!captureSources.has(resolved)) add("error", "daily-source-links", file, `source_link is not listed by the dated capture: ${source}`);
    }
    const evidenceCards = Number(capture.match(/^- Evidence cards:\s*(\d+)/m)?.[1] || 0);
    if (detailedDaily && evidenceCards > 0) {
      const body = ["摘要", "关键会话", "可复用经验"].map((heading) => section(text, heading)).join("\n");
      const contentLength = body.replace(/\s/g, "").length;
      if (contentLength < 1200) {
        add("error", "daily-detailed-depth", file, `Detailed Daily is too shallow for ${evidenceCards} evidence card(s): ${contentLength}/1200 non-whitespace characters.`);
      }
      const keySessions = section(text, "关键会话");
      for (const [label, pattern] of [
        ["problem or goal", /问题|目标|背景/],
        ["evidence or reasoning", /证据|理由|推理|决定|尝试/],
        ["outcome", /结论|结果|完成|状态/],
        ["impact or follow-up", /影响|后续|未解决|下一步|阻塞/],
      ]) {
        if (!pattern.test(keySessions)) add("error", "daily-detailed-coverage", file, `Detailed Daily key sessions must preserve ${label}.`);
      }
    }
  }
}

function checkWikilinks(files, pages) {
  for (const file of files) {
    for (const link of extractWikilinks(read(file))) {
      const target = resolveLink(link, pages);
      if (!target) add("error", "broken-wikilink", file, `Broken wikilink: [[${link}]].`);
    }
  }
}

function checkConcepts() {
  const files = listMarkdown(path.join(wikiRoot, "concepts"));
  stats.concepts = files.length;
  for (const file of files) {
    const text = read(file);
    if (!/(sources\/ai-chats|\b20\d{2}-\d{2}-\d{2}\b|evidence|证据)/i.test(text)) {
      add("warning", "concept-missing-evidence", file, "Concept has no obvious Daily evidence link or date.");
    }
  }
}

function checkBehaviorRules() {
  const file = path.join(wikiRoot, "guardrails", "Agent Behavior Rules.md");
  const text = read(file);
  if (!text) {
    add("error", "missing-behavior-rules", file, "Agent Behavior Rules.md is missing.");
    return;
  }
  const rules = text.split("\n")
    .filter((line) => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line))
    .filter((line) => !/No promoted rules yet|Keep at most 10 rules/i.test(line));
  stats.promotedRules = rules.length;
  if (rules.length > 10) add("error", "behavior-rule-cap", file, `Promoted behavior rules exceed cap: ${rules.length}/10.`);
  rules.forEach((rule, index) => {
    if (!/\[\[[^\]]+\]\]|sources\/ai-chats|concepts\//.test(rule)) {
      add("warning", "behavior-rule-evidence", file, `Rule ${index + 1} has no concept or Daily evidence link.`);
    }
  });
}

function checkCoreFiles() {
  for (const name of ["index.md", "log.md"]) {
    const file = path.join(wikiRoot, name);
    if (!read(file).trim()) add("error", "missing-core-file", file, `${name} is missing or empty.`);
  }
}

function renderMarkdown() {
  const groups = Object.fromEntries(["error", "warning", "info"].map((severity) => [
    severity,
    issues.filter((issue) => issue.severity === severity),
  ]));
  const lines = [
    "# Wiki Lint Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Repo: ${repoRoot}`,
    "",
    "## Summary",
    "",
    `- Errors: ${groups.error.length}`,
    `- Warnings: ${groups.warning.length}`,
    `- Daily pages: ${stats.dailyPages}`,
    `- Concepts: ${stats.concepts}`,
    `- Promoted behavior rules: ${stats.promotedRules}/10`,
    "",
  ];
  for (const [label, entries] of [["Errors", groups.error], ["Warnings", groups.warning], ["Info", groups.info]]) {
    lines.push(`## ${label}`, "");
    if (entries.length === 0) lines.push("- None", "");
    else {
      for (const issue of entries) {
        const location = issue.file ? ` (${issue.file})` : "";
        lines.push(`- [${issue.code}]${location} ${issue.message}`);
      }
      lines.push("");
    }
  }
  lines.push(
    "## Reconcile Notes",
    "",
    "- Fix deterministic errors before promotion work.",
    "- Apply the provenance and promotion rules from SCHEMA.md.",
    "- Escalate to original sessions only for insufficient, disputed, or audit-level evidence.",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

function main() {
  fs.mkdirSync(reviewDir, { recursive: true });
  if (!fs.existsSync(wikiRoot)) add("error", "missing-wiki", wikiRoot, "wiki/ directory is missing.");
  else {
    const files = listMarkdown(wikiRoot);
    stats.wikiFiles = files.length;
    checkCoreFiles();
    checkDailyPages();
    checkWikilinks(files, collectPages(files));
    checkConcepts();
    checkBehaviorRules();
  }

  const report = { generatedAt: new Date().toISOString(), repoRoot, stats, issues };
  fs.writeFileSync(markdownReportPath, renderMarkdown());
  fs.writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${relative(markdownReportPath)}`);
  console.log(`Errors: ${issues.filter((issue) => issue.severity === "error").length}, warnings: ${issues.filter((issue) => issue.severity === "warning").length}`);
  if (strict && issues.some((issue) => issue.severity === "error")) process.exitCode = 1;
}

main();
