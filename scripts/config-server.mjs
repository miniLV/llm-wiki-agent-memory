#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metaDir = path.join(repoRoot, ".vault-meta");
const configPath = path.join(metaDir, "config.json");
const defaultRepo = "https://github.com/AgriciDaniel/claude-obsidian.git";
const uiDir = path.join(repoRoot, "scripts", "config-ui");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const args = process.argv.slice(2);
const portArg = args.find((arg) => arg.startsWith("--port="));
const port = Number(portArg?.split("=")[1] || process.env.PORT || 8765);
const host = process.env.HOST || "127.0.0.1";
const defaultDailyAutoTime = "17:00";
const defaultWeeklyAutoTime = "17:30";

function today() {
  const value = new Date();
  const pad = (part) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function defaultConfig() {
  return {
    agentRunner: "codex",
    claudeObsidianRepo: defaultRepo,
    claudeObsidianDir: path.join(repoRoot, ".agent", "external", "claude-obsidian"),
    obsidianSkillsRepo: "https://github.com/kepano/obsidian-skills.git",
    obsidianSkillsDir: path.join(repoRoot, ".agent", "external", "obsidian-skills"),
    codexSourcesEnabled: true,
    claudeSourcesEnabled: true,
    sourcesConfirmed: false,
    memorySkillCodexEnabled: true,
    memorySkillClaudeEnabled: false,
    dailySummaryDetail: "detailed",
    dailyDate: today(),
    weeklyEndDate: today(),
    dailyAutoTime: defaultDailyAutoTime,
    weeklyAutoDay: "5",
    weeklyAutoTime: defaultWeeklyAutoTime,
  };
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sendFile(res, filePath, head = false) {
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "content-type": mimeTypes[ext] || "application/octet-stream",
    "cache-control": "no-store",
  });
  if (head) {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function readConfig() {
  if (!fs.existsSync(configPath)) return defaultConfig();
  const parsed = safeJson(fs.readFileSync(configPath, "utf8"));
  if (!parsed || typeof parsed !== "object") return defaultConfig();
  const defaults = defaultConfig();
  return Object.fromEntries(Object.keys(defaults).map((key) => [
    key,
    Object.hasOwn(parsed, key) ? parsed[key] : defaults[key],
  ]));
}

function normalizeConfig(input) {
  const base = { ...readConfig(), ...(input && typeof input === "object" ? input : {}) };
  const validTime = (value, fallback) => (/^\d{2}:\d{2}$/.test(String(value || "")) ? String(value) : fallback);
  const weeklyAutoDay = String(base.weeklyAutoDay ?? "5");
  return {
    agentRunner: "codex",
    claudeObsidianRepo: String(base.claudeObsidianRepo || defaultRepo).trim() || defaultRepo,
    claudeObsidianDir: String(base.claudeObsidianDir || path.join(repoRoot, ".agent", "external", "claude-obsidian")).trim(),
    obsidianSkillsRepo: String(base.obsidianSkillsRepo || "https://github.com/kepano/obsidian-skills.git").trim() || "https://github.com/kepano/obsidian-skills.git",
    obsidianSkillsDir: String(base.obsidianSkillsDir || path.join(repoRoot, ".agent", "external", "obsidian-skills")).trim(),
    codexSourcesEnabled: base.codexSourcesEnabled !== false,
    claudeSourcesEnabled: base.claudeSourcesEnabled !== false,
    sourcesConfirmed: base.sourcesConfirmed === true,
    memorySkillCodexEnabled: base.memorySkillCodexEnabled !== false,
    memorySkillClaudeEnabled: false,
    dailySummaryDetail: base.dailySummaryDetail === "concise" ? "concise" : "detailed",
    dailyDate: /^\d{4}-\d{2}-\d{2}$/.test(base.dailyDate) ? base.dailyDate : today(),
    weeklyEndDate: /^\d{4}-\d{2}-\d{2}$/.test(base.weeklyEndDate) ? base.weeklyEndDate : today(),
    dailyAutoTime: validTime(base.dailyAutoTime, defaultDailyAutoTime),
    weeklyAutoDay: /^[0-7]$/.test(weeklyAutoDay) ? weeklyAutoDay : "5",
    weeklyAutoTime: validTime(base.weeklyAutoTime, defaultWeeklyAutoTime),
  };
}

function writeConfig(input) {
  const config = normalizeConfig(input);
  fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function commandExists(command) {
  return Boolean(commandPath(command));
}

function appVersion() {
  const result = spawnSync("git", ["describe", "--tags", "--abbrev=0"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const version = result.status === 0 ? result.stdout.trim() : "";
  return version || "v0.0.1";
}

function commandPath(command) {
  if (command === "node") return process.execPath;
  const paths = (process.env.PATH || "").split(path.delimiter);
  for (const dir of paths) {
    const full = path.join(dir, command);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      // Try the next PATH entry.
    }
  }
  return "";
}

function bashPath() {
  return commandPath("bash") || commandPath("bash.exe");
}

function windowsSystemPath(...parts) {
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || (process.platform === "win32" ? "C:\\Windows" : "");
  const candidate = systemRoot ? path.join(systemRoot, ...parts) : "";
  return candidate && fs.existsSync(candidate) ? candidate : "";
}

function windowsPowerShellPath() {
  return windowsSystemPath("System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function windowsCommandPath() {
  return windowsSystemPath("System32", "cmd.exe");
}

function readLinkMaybe(file) {
  try {
    return fs.lstatSync(file).isSymbolicLink() ? fs.readlinkSync(file) : "";
  } catch {
    return "";
  }
}

function resolveLinkTarget(linkPath, linkTarget) {
  if (!linkTarget) return "";
  return path.isAbsolute(linkTarget) ? linkTarget : path.resolve(path.dirname(linkPath), linkTarget);
}

function pathMatches(actual, expected) {
  if (!actual || !expected) return false;
  const resolvedActual = path.resolve(actual);
  const resolvedExpected = path.resolve(expected);
  return resolvedActual === resolvedExpected || resolvedActual.startsWith(`${resolvedExpected}${path.sep}`);
}

function skillStatusAt(root, name, expectedTarget = "") {
  const target = path.join(root, name);
  const linkTarget = readLinkMaybe(target);
  let resolvedTarget = "";
  try {
    resolvedTarget = fs.realpathSync(target);
  } catch {
    resolvedTarget = resolveLinkTarget(target, linkTarget);
  }
  return {
    exists: fs.existsSync(target),
    target: linkTarget,
    resolvedTarget,
    expectedTarget,
    linkedToExpected: expectedTarget ? pathMatches(resolvedTarget, expectedTarget) : false,
  };
}

function memorySkillMappings(config) {
  const expectedTarget = path.join(repoRoot, ".agent", "skills", "engineering-memory-loader");
  return [
    {
      id: "codex",
      label: "Codex",
      enabled: config.memorySkillCodexEnabled !== false,
      root: path.join(os.homedir(), ".codex", "skills"),
    },
    {
      id: "claude",
      label: "Claude Code",
      enabled: config.memorySkillClaudeEnabled === true,
      root: path.join(os.homedir(), ".claude", "skills"),
    },
  ].map((agent) => ({
    ...agent,
    skill: skillStatusAt(agent.root, "engineering-memory-loader", expectedTarget),
  }));
}

function listDailySummaries() {
  const dir = path.join(repoRoot, "wiki", "sources", "ai-chats");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .slice(-14)
    .reverse();
}

function countMarkdownFiles(...segments) {
  const dir = path.join(repoRoot, ...segments);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((name) => name.endsWith(".md")).length;
}

function automationStatus() {
  const codexApp = codexAppAutomationStatus();
  return {
    supported: true,
    codexApp,
  };
}

function parseTomlString(value) {
  const text = String(value || "");
  try {
    return JSON.parse(text);
  } catch {
    return text.replace(/^"/, "").replace(/"$/, "");
  }
}

function parseSimpleToml(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (value.startsWith("[")) {
      out[key] = [...value.matchAll(/"((?:\\"|[^"])*)"/g)].map((item) => parseTomlString(`"${item[1]}"`));
    } else if (value.startsWith("\"")) {
      out[key] = parseTomlString(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function codexAppAutomationStatus() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const dir = path.join(codexHome, "automations");
  const empty = {
    root: dir,
    daily: { found: false, status: "missing", summary: "missing for this repo" },
    weekly: { found: false, status: "missing", summary: "missing for this repo" },
  };
  if (!fs.existsSync(dir)) return { ...empty, error: "No Codex automations directory found." };

  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name, "automation.toml"))
    .filter((file) => fs.existsSync(file));

  const automations = files.map((file) => {
    const data = parseSimpleToml(fs.readFileSync(file, "utf8"));
    return { ...data, file };
  });

  function matches(kind, automation) {
    const haystack = [
      automation.id,
      automation.name,
      automation.prompt,
      Array.isArray(automation.cwds) ? automation.cwds.join("\n") : "",
    ].join("\n");
    const skill = kind === "daily" ? "ai-session-wiki-ingest" : "agent-memory-reconcile";
    const expectedName = kind === "daily" ? "LLM Wiki Agent Memory - Daily" : "LLM Wiki Agent Memory - Weekly";
    const expectedId = kind === "daily" ? "llm-wiki-agent-memory-daily" : "llm-wiki-agent-memory-weekly";
    return (
      haystack.includes(repoRoot) &&
      (haystack.includes(expectedId) || haystack.includes(expectedName) || haystack.includes(`.agent/skills/${skill}/SKILL.md`))
    );
  }

  function summarize(kind) {
    const found = automations.find((automation) => matches(kind, automation));
    if (!found) return empty[kind];
    return {
      found: true,
      id: found.id || "",
      name: found.name || "",
      status: found.status || "unknown",
      rrule: found.rrule || "",
      model: found.model || "",
      reasoningEffort: found.reasoning_effort || "",
      file: found.file,
      summary: `${found.status || "unknown"} · ${found.name || found.id || "unnamed"}`,
    };
  }

  return {
    root: dir,
    daily: summarize("daily"),
    weekly: summarize("weekly"),
  };
}

function resourceStatus(config) {
  const env = { ...process.env };
  env.PATH = [path.dirname(process.execPath), env.PATH].filter(Boolean).join(path.delimiter);
  if (config.obsidianSkillsRepo) env.OBSIDIAN_SKILLS_REPO = config.obsidianSkillsRepo;
  if (config.obsidianSkillsDir) env.OBSIDIAN_SKILLS_DIR = config.obsidianSkillsDir;
  if (config.claudeObsidianRepo) env.CLAUDE_OBSIDIAN_REPO = config.claudeObsidianRepo;
  if (config.claudeObsidianDir) env.CLAUDE_OBSIDIAN_DIR = config.claudeObsidianDir;
  const shell = bashPath();
  if (!shell) return { error: "Git Bash is required. Install Git for Windows: https://git-scm.com/download/win" };
  const result = spawnSync(shell, ["scripts/install-resources.sh", "status", "--json"], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return {
      error: (result.stderr || result.stdout || "Unable to read resource status.").trim(),
    };
  }
  return safeJson(result.stdout) || { error: "Invalid resource status." };
}

function resourceReadiness(resources) {
  const obsidianLinked = resources.obsidianSkills?.linked || {};
  const obsidianSkillNames = Object.keys(obsidianLinked);
  return {
    obsidianAppReady: Boolean(resources.obsidianApp?.installed),
    obsidianSkillsReady:
      obsidianSkillNames.length > 0 &&
      obsidianSkillNames.every((name) => Boolean(obsidianLinked[name])),
    claudeObsidianReady: Boolean(resources.claudeObsidian?.adapterSkillsReady),
  };
}

function codexAppLoopReady(automation) {
  const dailyActive = automation.codexApp?.daily?.found && String(automation.codexApp.daily.status || "").toUpperCase() === "ACTIVE";
  const weeklyActive = automation.codexApp?.weekly?.found && String(automation.codexApp.weekly.status || "").toUpperCase() === "ACTIVE";
  return dailyActive && weeklyActive;
}

function gateStatus(config, commands, skills, resources, memoryMappings, automation) {
  const resourceState = resourceReadiness(resources);
  const enabledMemoryMappings = memoryMappings.filter((mapping) => mapping.enabled);
  const localSkillsReady =
    enabledMemoryMappings.length > 0 &&
    enabledMemoryMappings.every((mapping) => mapping.skill.linkedToExpected);
  const runnerAvailable = config.agentRunner === "codex";
  const summaryLoopReady = codexAppLoopReady(automation);
  const hasSelectedSource = Boolean(config.codexSourcesEnabled || config.claudeSourcesEnabled);
  const sourceReady = config.sourcesConfirmed === true && hasSelectedSource;
  const blockers = [];
  if (!resourceState.claudeObsidianReady) blockers.push("Install Claude Obsidian.");
  if (!localSkillsReady) blockers.push("Expose memory skill to Codex.");
  if (!summaryLoopReady) blockers.push("Install daily / weekly memory loops for this repo.");
  if (!sourceReady) blockers.push("Confirm at least one session source: Codex or Claude Code.");
  return {
    pipelineReady: blockers.length === 0,
    blockers,
    localSkillsReady,
    runnerReady: summaryLoopReady,
    runnerAvailable,
    codexAppLoopReady: codexAppLoopReady(automation),
    sourceReady,
    hasSelectedSource,
    sourcesConfirmed: config.sourcesConfirmed === true,
    ...resourceState,
  };
}

function setupGuidance(config, commands, skills, automation, resources, gates) {
  const missing = [];
  if (!commands.node) missing.push("Install Node.js.");
  if (!commands.git) missing.push("Install git.");
  if (!gates.claudeObsidianReady) missing.push("Install Claude Obsidian.");
  if (!gates.localSkillsReady) missing.push("Expose memory skill to Codex.");

  let runner = "Runner is ready.";
  if (config.agentRunner === "codex" && !commands.codex && !codexAppLoopReady(automation)) {
    runner = "Codex CLI was not found; the setup prompt will try to open Codex App directly.";
  }

  let automationText = "Codex App Automations are not installed for this repo.";
  if (codexAppLoopReady(automation)) {
    automationText = "Daily and weekly Codex App Automations are ACTIVE for this repo.";
  }

  return {
    ready: missing.length === 0 && gates.pipelineReady,
    missing: [...new Set(missing)],
    runner,
    automation: automationText,
  };
}

function statusPayload() {
  const config = readConfig();
  const skillsRoot = path.join(os.homedir(), ".codex", "skills");
  const skillNames = ["engineering-memory-loader"];
  const commands = {
    codex: commandExists("codex"),
    claude: commandExists("claude"),
    git: commandExists("git"),
    node: commandExists("node"),
  };
  const commandPaths = {
    codex: commandPath("codex"),
    claude: commandPath("claude"),
    git: commandPath("git"),
    node: commandPath("node"),
  };
  const skills = Object.fromEntries(
    skillNames.map((name) => {
      const expectedTarget = path.join(repoRoot, ".agent", "skills", name);
      return [name, skillStatusAt(skillsRoot, name, expectedTarget)];
    }),
  );
  const automation = automationStatus();
  const resources = resourceStatus(config);
  const memoryMappings = memorySkillMappings(config);
  const gates = gateStatus(config, commands, skills, resources, memoryMappings, automation);
  return {
    appVersion: appVersion(),
    repoRoot,
    configPath,
    paths: {
      summaries: path.join(repoRoot, "wiki", "sources", "ai-chats"),
      concepts: path.join(repoRoot, "wiki", "concepts"),
      guardrails: path.join(repoRoot, "wiki", "guardrails"),
      templates: path.join(repoRoot, "wiki", "templates"),
      skillsRoot,
    },
    commands,
    commandPaths,
    skills,
    memorySkillMappings: memoryMappings,
    automation,
    resources,
    gates,
    guidance: setupGuidance(config, commands, skills, automation, resources, gates),
    dailySummaries: listDailySummaries(),
    conceptCount: countMarkdownFiles("wiki", "concepts"),
    guardrailCount: countMarkdownFiles("wiki", "guardrails"),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function openPathCommand(target) {
  const quotedTarget = shellQuote(target);
  return ["-lc", [
    `target=${quotedTarget}`,
    'if [ ! -e "$target" ]; then',
    '  fallback="$target"',
    '  while [ "$fallback" != "/" ] && [ ! -d "$fallback" ]; do fallback="$(dirname "$fallback")"; done',
    '  echo "Path does not exist: $target" >&2',
    '  if [ -d "$fallback" ] && command -v explorer.exe >/dev/null 2>&1; then',
    '    explorer.exe "$fallback" >/dev/null 2>&1 &',
    '    echo "Opened nearest existing directory: $fallback"',
    '  elif [ -d "$fallback" ] && command -v open >/dev/null 2>&1; then',
    '    open -a Finder "$fallback" >/dev/null 2>&1 &',
    '    echo "Opened nearest existing directory: $fallback"',
    '  else',
    '    echo "No existing parent directory found." >&2',
    '  fi',
    '  exit 1',
    'fi',
    'if command -v explorer.exe >/dev/null 2>&1; then',
    '  if [ -d "$target" ]; then explorer.exe "$target" >/dev/null 2>&1 & else explorer.exe /select,"$target" >/dev/null 2>&1 & fi',
    'elif command -v open >/dev/null 2>&1; then',
    '  if [ -d "$target" ]; then open -a Finder "$target" >/dev/null 2>&1 & else open -R "$target" >/dev/null 2>&1 & fi',
    'else',
    '  echo "$target"',
    'fi',
  ].join("\n")];
}

function openUrlCommand(url) {
  return ["-lc", `if command -v open >/dev/null 2>&1; then open ${shellQuote(url)} >/dev/null 2>&1 & else echo ${shellQuote(url)}; fi`];
}

function openAppCommand(appName, fallbackPath) {
  return ["-lc", [
    `target=${shellQuote(fallbackPath)}`,
    "if command -v cmd.exe >/dev/null 2>&1; then",
    '  cmd.exe /c start "" "$target" >/dev/null 2>&1',
    "elif command -v open >/dev/null 2>&1; then",
    `  open -a ${shellQuote(appName)} >/dev/null 2>&1 || open "$target" >/dev/null 2>&1 &`,
    "else",
    '  echo "$target"',
    "fi",
  ].join("\n")];
}

function copyPromptAndOpenCodex(promptPath, copiedMessage, pasteMessage) {
  const powershell = windowsPowerShellPath();
  if (powershell) {
    const quotedPromptPath = promptPath.replaceAll("'", "''");
    return {
      cmd: powershell,
      args: ["-NoProfile", "-NonInteractive", "-Command", [
        "$ErrorActionPreference = 'Stop'",
        `Get-Content -LiteralPath '${quotedPromptPath}' -Raw -Encoding UTF8 | Set-Clipboard -ErrorAction Stop`,
        "Start-Process 'codex://threads/new'",
        `Write-Output '${copiedMessage}'`,
      ].join("; ")],
    };
  }
  return {
    cmd: bashPath(),
    args: ["-lc", [
      `prompt_file=${shellQuote(promptPath)}`,
      "if command -v pbcopy >/dev/null 2>&1; then",
      "  pbcopy < \"$prompt_file\"",
      `  echo ${shellQuote(copiedMessage)}`,
      "else",
      "  echo \"Clipboard copy is unavailable; prompt saved at: $prompt_file\"",
      "fi",
      "if command -v open >/dev/null 2>&1; then",
      "  open -a Codex >/dev/null 2>&1 || codex app >/dev/null 2>&1 || true",
      "elif command -v codex >/dev/null 2>&1; then",
      "  codex app >/dev/null 2>&1 || true",
      "fi",
      `echo ${shellQuote(pasteMessage)}`,
    ].join("\n")],
  };
}

function codexAutomationInstallPrompt(config) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone";
  const weekdayNames = {
    "0": "Sunday",
    "1": "Monday",
    "2": "Tuesday",
    "3": "Wednesday",
    "4": "Thursday",
    "5": "Friday",
    "6": "Saturday",
    "7": "Sunday",
  };
  const weeklyDay = weekdayNames[String(config.weeklyAutoDay)] || "Friday";
  return `Create or update these two Codex App Automations for ${repoRoot}.

- Use Codex App Automations as the only scheduled runner.
- Prefer updating existing automations with these names or ids instead of creating duplicates.
- Both must be cron, ACTIVE, local execution, with cwd ${repoRoot}.
- Preserve the current model and reasoning effort when updating; apply the listed defaults only when creating.

Daily:
- id/name: llm-wiki-agent-memory-daily / LLM Wiki Agent Memory - Daily
- schedule: every day at ${config.dailyAutoTime} (${timezone})
- creation default model: gpt-5.6-luna
- creation default reasoning effort: medium
- prompt:
Use \`date +%F\`, then read \`.agent/skills/ai-session-wiki-ingest/SKILL.md\` completely and follow it as the sole workflow source of truth. Report the result. Do not git commit memory changes.

Weekly:
- id/name: llm-wiki-agent-memory-weekly / LLM Wiki Agent Memory - Weekly
- schedule: every ${weeklyDay} at ${config.weeklyAutoTime} (${timezone})
- creation default model: gpt-5.6-sol
- creation default reasoning effort: medium
- prompt:
Use \`date +%F\` as the reconcile-window end date, then read \`.agent/skills/agent-memory-reconcile/SKILL.md\` completely and follow it as the sole workflow source of truth. Report the result. Do not git commit memory changes.

After creating/updating both automations, show me their names, schedules, and status.`;
}

function codexRecentWeekPrompt() {
  return `整理最近一周的 LLM wiki memory。

Repo:
${repoRoot}

Goal:
- 只处理最近 7 天，包括今天。
- 对每一天调用 repo-local daily workflow，把日期参数填进去，生成或更新 Daily Wiki page。
- 最后调用 weekly workflow，对这 7 天做 lint / merge / promote，只把二次 review 通过的经验更新到 concepts；Daily 只是 backup，不生成 behavior rules。
- 这是一次手动整理，不是创建 automation。
- 不要 git commit memory changes。

Workflow:
1. cd ${repoRoot}
2. 用本机时区确定今天：\`date +%F\`
3. 计算最近 7 个日期：今天和往前 6 天。
4. 父 agent 只负责编排。对每个日期，从旧到新顺序执行：
   - 为这个日期启动一个新的子 agent（独立线程/上下文，不是父 agent 自己继续处理），一次只处理一个日期；启动时只传 repo、日期和 skill 路径，不携带前几天的编译内容；等待它完成后再处理下一天，禁止一个子 agent 连续编译多个日期。
   - 子 agent 读取 \`.agent/skills/ai-session-wiki-ingest/SKILL.md\`，以它为唯一操作规范，并把日期参数填成当前处理的 \`YYYY-MM-DD\`。
   - 严格按 skill 的 metadata → persisted Snapshot 路径，以固定大小、互不重叠的片段顺序读取完整文件；全部片段到齐后只合成一次 Daily。禁止回读 raw session、旧 Codex / Claude 会话、以前生成的 Daily、prompt 或 patch。included / omitted 是证据筛选统计，不是传输数量。
   - 子 agent 必须报告 Evidence Snapshot 路径、evidence-card 数、included / omitted turn 数、明确 skipped 原因和输出路径。
   - 如果某天没有 session evidence 或不能安全产出，记录 skipped reason，继续下一天；不要报告 blocked。
5. 7 个日期都完成或明确 skipped 后，执行 agent memory reconcile：
   - 为 reconcile 启动另一个新的子 agent（独立线程/上下文）。
   - 读取 \`.agent/skills/agent-memory-reconcile/SKILL.md\`，以它为唯一操作规范。
   - 使用今天作为 end date，检查最近 7 天 Daily Wiki pages；禁止搜索或回放旧 agent session 里的 reconcile 结果或 concept / behavior-rule patch。
6. 完成后告诉我：
   - 处理了哪些日期
   - 哪些日期 skipped
   - 生成或更新了哪些 Daily Wiki pages / reviewed concepts
   - 有没有需要我手动确认的问题

重要约束：
- 上面两个 \`SKILL.md\` 是 workflow source of truth，不要用这个 prompt 覆盖它们。
- 如果无法创建新的子 agent，将未处理日期报告为 skipped；不要退回到父 agent 的长上下文里处理多天。
- 不要编辑 raw JSONL logs。
- 不要把临时 prompt 或本地配置提交到 git。
- 不生成或更新 behavior rules。`;
}

function runCommand(action, config, options = {}) {
  const env = { ...process.env, LC_CTYPE: "en_US.UTF-8" };
  if (config.claudeObsidianRepo) env.CLAUDE_OBSIDIAN_REPO = config.claudeObsidianRepo;
  if (config.claudeObsidianDir) env.CLAUDE_OBSIDIAN_DIR = config.claudeObsidianDir;
  if (config.obsidianSkillsRepo) env.OBSIDIAN_SKILLS_REPO = config.obsidianSkillsRepo;
  if (config.obsidianSkillsDir) env.OBSIDIAN_SKILLS_DIR = config.obsidianSkillsDir;

  let cmd = bashPath();
  let commandArgs = [];

  if (action === "setup") {
    commandArgs = ["scripts/setup.sh"];
    if (options.force) commandArgs.push("--force");
  } else if (action === "expose-memory-skill") {
    const agents = [];
    if (config.memorySkillCodexEnabled !== false) agents.push("codex");
    if (config.memorySkillClaudeEnabled === true) agents.push("claude");
    commandArgs = ["scripts/link-skills.sh", "--force", "--prune", "--agents", agents.join(",")];
  } else if (action === "prepare-codex-automation") {
    fs.mkdirSync(metaDir, { recursive: true });
    const promptPath = path.join(metaDir, "codex-automation-install-prompt.md");
    fs.writeFileSync(promptPath, codexAutomationInstallPrompt(config));
    const command = copyPromptAndOpenCodex(
      promptPath,
      "Copied Codex automation install prompt to clipboard.",
      "Paste the prompt into Codex App to create/update the daily and weekly loops.",
    );
    cmd = command.cmd;
    commandArgs = command.args;
  } else if (action === "prepare-codex-recent-week") {
    fs.mkdirSync(metaDir, { recursive: true });
    const promptPath = path.join(metaDir, "codex-recent-week-prompt.md");
    fs.writeFileSync(promptPath, codexRecentWeekPrompt());
    const command = copyPromptAndOpenCodex(
      promptPath,
      "Copied recent-week wiki prompt to clipboard.",
      "Paste the prompt into Codex App to summarize the recent week.",
    );
    cmd = command.cmd;
    commandArgs = command.args;
  } else if (action === "open-obsidian") {
    commandArgs = ["scripts/install-resources.sh", "open-obsidian"];
  } else if (action === "open-detected-obsidian-app") {
    const obsidianAppPath = resourceStatus(config).obsidianApp?.path || "/Applications/Obsidian.app";
    const windowsCommand = windowsCommandPath();
    if (windowsCommand) {
      cmd = windowsCommand;
      commandArgs = ["/c", "start", "", obsidianAppPath];
    } else {
      commandArgs = openAppCommand("Obsidian", obsidianAppPath);
    }
  } else if (action === "install-obsidian-app") {
    commandArgs = ["scripts/install-resources.sh", "install-obsidian-app"];
  } else if (action === "open-obsidian-skills-github") {
    commandArgs = openUrlCommand(config.obsidianSkillsRepo || "https://github.com/kepano/obsidian-skills");
  } else if (action === "open-detected-obsidian-skills") {
    commandArgs = openPathCommand(config.obsidianSkillsDir || path.join(repoRoot, ".agent", "external", "obsidian-skills"));
  } else if (action === "open-claude-obsidian-github") {
    commandArgs = openUrlCommand(config.claudeObsidianRepo || defaultRepo);
  } else if (action === "open-detected-claude-obsidian") {
    commandArgs = openPathCommand(config.claudeObsidianDir || path.join(repoRoot, ".agent", "external", "claude-obsidian"));
  } else if (action === "open-runner-docs") {
    commandArgs = openUrlCommand("https://developers.openai.com/codex/");
  } else if (action === "open-detected-runner") {
    const runnerPath = commandPath("codex");
    commandArgs = openPathCommand(runnerPath ? path.dirname(runnerPath) : repoRoot);
  } else if (action === "open-source-config") {
    commandArgs = openPathCommand(configPath);
  } else if (action === "open-global-skills") {
    commandArgs = openPathCommand(path.join(os.homedir(), ".codex", "skills"));
  } else if (action === "open-local-skills") {
    const target = path.join(os.homedir(), ".codex", "skills", "engineering-memory-loader");
    commandArgs = openPathCommand(target);
  } else if (action === "install-obsidian-skills") {
    commandArgs = ["scripts/install-resources.sh", "install-obsidian-skills"];
  } else if (action === "install-claude-obsidian") {
    commandArgs = ["scripts/install-resources.sh", "install-claude-obsidian"];
  } else if (action === "install-all-resources") {
    commandArgs = ["scripts/install-resources.sh", "install-all"];
  } else if (action === "complete-local-setup") {
    commandArgs = ["-lc", "bash scripts/install-resources.sh install-all && bash scripts/link-skills.sh --force --prune --agents codex"];
  } else if (action === "open-vault") {
    commandArgs = openPathCommand(repoRoot);
  } else if (action === "open-summaries") {
    commandArgs = openPathCommand(path.join(repoRoot, "wiki", "sources", "ai-chats"));
  } else if (action === "open-concepts") {
    commandArgs = openPathCommand(path.join(repoRoot, "wiki", "concepts"));
  } else if (action === "open-guardrails") {
    commandArgs = openPathCommand(path.join(repoRoot, "wiki", "guardrails"));
  } else if (action === "open-templates") {
    commandArgs = openPathCommand(path.join(repoRoot, "wiki", "templates"));
  } else if (action === "open-meta") {
    commandArgs = openPathCommand(path.join(repoRoot, "wiki", "guardrails"));
  } else {
    return Promise.resolve({ code: 2, output: `Unsupported action: ${action}\n` });
  }

  if (!cmd) {
    return Promise.resolve({
      code: 1,
      output: "Git Bash is required to run local setup on Windows. Install Git for Windows, then restart this setup page:\nhttps://git-scm.com/download/win\n",
    });
  }

  return new Promise((resolve) => {
    const child = spawn(cmd, commandArgs, { cwd: repoRoot, env });
    const startedAt = new Date();
    let output = `$ ${[cmd, ...commandArgs].join(" ")}\n`;
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ code: 1, output: `${output}\n${error.message}\n`, startedAt, finishedAt: new Date() });
    });
    child.on("close", (code) => {
      resolve({ code, output, startedAt, finishedAt: new Date() });
    });
  });
}



const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    const canRead = req.method === "GET" || req.method === "HEAD";
    if (req.method === "POST" && !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      sendJson(res, 415, { error: "POST requests require application/json." });
      return;
    }
    if (canRead && url.pathname === "/") {
      sendFile(res, path.join(uiDir, "index.html"), req.method === "HEAD");
      return;
    }
    if (canRead && url.pathname.startsWith("/assets/")) {
      const filePath = path.resolve(uiDir, url.pathname.slice("/assets/".length));
      if (!filePath.startsWith(uiDir + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      sendFile(res, filePath, req.method === "HEAD");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      sendJson(res, 200, readConfig());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/config") {
      const body = safeJson(await readBody(req));
      sendJson(res, 200, writeConfig(body));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, statusPayload());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/clipboard") {
      const body = safeJson(await readBody(req)) || {};
      const text = String(body.text || "");
      if (!text) {
        sendJson(res, 400, { error: "No clipboard text provided." });
        return;
      }
      const clipboardCommand = commandExists("pbcopy") ? "pbcopy" : (commandExists("clip.exe") ? "clip.exe" : "");
      if (!clipboardCommand) {
        sendJson(res, 501, { error: "System clipboard command is unavailable." });
        return;
      }
      const result = spawnSync(clipboardCommand, {
        input: text,
        encoding: "utf8",
        env: { ...process.env, LC_CTYPE: "en_US.UTF-8" },
      });
      if (result.status !== 0) {
        sendJson(res, 500, { error: (result.stderr || "Unable to copy to clipboard.").trim() });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/run") {
      const body = safeJson(await readBody(req)) || {};
      const config = writeConfig(body.config || readConfig());
      const action = String(body.action || "");
      const result = await runCommand(action, config, body.options || {});
      if (action === "complete-local-setup" && result.code === 0) {
        result.config = writeConfig({
          ...config,
          codexSourcesEnabled: true,
          claudeSourcesEnabled: true,
          sourcesConfirmed: true,
          memorySkillCodexEnabled: true,
          memorySkillClaudeEnabled: false,
        });
      }
      sendJson(res, 200, result);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}`;
  console.log(`Agent Memory Control running at ${url}`);
});
