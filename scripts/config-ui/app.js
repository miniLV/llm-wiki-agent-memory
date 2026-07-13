const $ = (id) => document.getElementById(id);
const log = $("log");
const fields = [
  "agentRunner",
  "codexSourcesEnabled",
  "claudeSourcesEnabled",
  "memorySkillCodexEnabled",
  "memorySkillClaudeEnabled",
  "dailySummaryDetail",
  "dailyDate",
  "weeklyEndDate",
  "dailyAutoTime",
  "weeklyAutoDay",
  "weeklyAutoTime",
];
let currentPage = "setup";
let userSelectedPage = false;
let latestStatus = null;
let activeSetupKey = "";
let currentLang = localStorage.getItem("configUiLang") === "en" ? "en" : "zh";
const progressActions = new Set([
  "setup",
  "install-all-resources",
  "install-obsidian-app",
  "install-obsidian-skills",
  "install-claude-obsidian",
]);

const i18n = {
  zh: {
    "sidebar.subtitle": "agent wiki loop",
    "sidebar.localOnly": "仅本机",
    "sidebar.poweredBy": "Powered by",
    "nav.workspace": "工作区",
    "nav.setup": "设置",
    "nav.config": "配置和运行",
    "nav.configuration": "配置",
    "nav.automation": "自动化",
    "hero.eyebrow": "本地优先 Agent Memory",
    "hero.sub": "把 Codex / Claude Code 的本机会话整理成可查询的本地 wiki，并在需要时带回 agent。",
    "hero.repoTitle": "打开本地 vault",
    "language.label": "语言",
    "button.refresh": "刷新",
    "button.openVault": "打开 Vault",
    "button.sources": "数据源",
    "button.open": "打开",
    "button.copyPromptOpenCodex": "复制提示词并打开 Codex",
    "button.copyLog": "复制日志",
    "button.copyLogTitle": "复制所有日志用于调试",
    "button.cancel": "取消",
    "button.confirmSources": "确认数据源",
    "button.copyOpen": "复制并打开",
    "button.close": "关闭",
    "button.applyRefresh": "应用 / 刷新",
    "setup.eyebrow": "第一步 · 环境检查",
    "setup.title": "完成首次设置",
    "setup.p1": "先确认这台机器能采集会话、写入 wiki，并能定时执行 daily / weekly memory loop。缺什么，这里只显示下一步动作。",
    "setup.p2": "设置完成后再进入 Config & Run 调整数据源、输出路径和定时任务。",
    "setup.progress": "当前进度",
    "setup.note": "建议先用默认配置跑通 demo。路径、source、skills 映射和产物位置在 Config & Run 页统一处理。",
    "setup.checks": "环境检查",
    "metric.memoryLoop": "Memory Loop",
    "metric.setup": "设置",
    "metric.dailyWiki": "Daily Wiki",
    "metric.concepts": "概念",
    "flow.title": "Wiki 结构和流程",
    "flow.sourceTitle": "01 Source Logs",
    "flow.sourceBody": "原始会话日志留在本机原位置，daily loop 先生成本地 capture inbox，再写 Daily Wiki。",
    "flow.dailyTitle": "02 Daily Wiki",
    "flow.dailyBody": "给人和 agent 看的每日中文 wiki，保留关键上下文和 source link。",
    "flow.conceptsTitle": "03 Concepts & Rules",
    "flow.conceptsBody": "Daily 只做 backup；weekly 二次 review 后，只有真正有价值的经验才进入 concepts，不生成 behavior rules。",
    "flow.skillTitle": "04 Apply Skill",
    "flow.skillBody": "业务 repo 按需加载查询 skill，找历史背景和防踩坑规则。",
    "recent.title": "最近一周",
    "recent.cardTitle": "整理最近一周",
    "recent.cardBody": "复制一段提示词并打开 Codex。粘贴后，Codex 会按最近 7 天逐日调用 daily workflow，再运行 weekly lint / merge / promote。",
    "automation.title": "自动化",
    "automation.notice": "调度由 Codex App Automations 负责。这里检查当前 repo 的 daily / weekly Memory Loop 是否启用；修改时间请直接在 Codex App Automations 里改。",
    "automation.statusTitle": "Memory Loop 状态",
    "summary.title": "每日总结",
    "summary.latest14": "最近 14 条",
    "log.title": "日志",
    "source.title": "选择数据源",
    "source.body": "确认这些数据源后，Daily Wiki 才会从对应会话来源开始整理。",
    "source.codexBody": "读取 Codex 本机会话，生成 Daily Wiki，并供后续 memory reconcile 使用。",
    "source.claudeBody": "读取 Claude Code 本机会话，和 Codex 一起作为默认数据来源。",
    "loop.title": "安装 Memory Loop",
    "loop.body": "下一步会打开 Codex，并复制安装提示词：创建 daily / weekly 两个定时 loop，让知识库自动总结、lint、合并和晋升。",
    "loop.dailyTime": "Daily 时间",
    "loop.dailyDetail": "Daily 总结详细度",
    "loop.detailConcise": "精简",
    "loop.detailDetailed": "详细（默认，完整提取价值信息，通常约 1200 词起）",
    "loop.weeklyDay": "Weekly 日期",
    "loop.weeklyTime": "Weekly 时间",
    "loop.note": "这些时间只用于生成安装提示词；安装后如果在 Codex App Automations 里修改，以 Codex App 的真实设置为准。",
    "loop.step1": "点击“复制并打开”后，会自动复制安装提示词并打开 Codex App。",
    "loop.step2": "在 Codex 里粘贴当前剪贴板内容并发送。",
    "loop.step3": "Codex agent 会创建或更新两个定时任务：daily 总结当天对话，weekly 做 lint、合并旧知识并晋升稳定经验。",
    "day.monday": "周一",
    "day.tuesday": "周二",
    "day.wednesday": "周三",
    "day.thursday": "周四",
    "day.friday": "周五",
    "day.saturday": "周六",
    "day.sunday": "周日",
    "skill.body": "把本 repo 的 engineering-memory-loader 软链接到 Codex，让其他 repo 可以查询这套本地 LLM wiki。",
    "skill.notice": "这一步只应用查询 skill；daily / weekly memory loop 仍由 Codex App Automations 负责。",
    "skill.syncTo": "同步到",
    "empty.dailySummaries": "还没有 Daily Wiki 页面",
    "status.latest": "最新",
    "status.daily": "每日",
    "status.ready": "ready",
    "status.blocked": "blocked",
    "status.idle": "idle",
    "status.running": "running",
    "status.updated": "updated",
    "status.copied": "copied",
    "status.notInstalled": "not installed",
    "status.active": "active",
    "status.paused": "paused",
    "setup.completeTitle": "Setup complete",
    "setup.completeBody": "环境已经就绪，可以进入 Config & Run 页。",
    "setup.enterConfig": "进入 Config & Run",
    "setup.obsidianAppTitle": "推荐安装 Obsidian（可选）",
    "setup.obsidianAppBody": "Obsidian 可以更方便地浏览和编辑本地知识库；不安装也不影响会话采集、知识整理或查询。",
    "setup.chooseInstall": "选择安装方式",
    "setup.obsidianSkillsTitle": "推荐安装 Obsidian Skills（可选）",
    "setup.obsidianSkillsBody": "需要 Obsidian CLI、Canvas、Bases 等增强能力时再安装；核心 memory pipeline 不依赖这些 skills。",
    "setup.installObsidianSkills": "安装 Obsidian Skills",
    "setup.installAllRecommended": "一键安装推荐环境",
    "setup.claudeObsidianTitle": "安装 Claude Obsidian",
    "setup.claudeObsidianBody": "安装 Claude Obsidian，让 memory loader 可以查询本地知识库。",
    "setup.installClaudeObsidian": "安装 Claude Obsidian",
    "setup.applySkillTitle": "应用 wiki skill",
    "setup.applySkillBody": "把 engineering-memory-loader 软链接到 Codex，让其他 repo 可以查询这套 LLM wiki。",
    "setup.applySkillAction": "应用 Wiki Skill",
    "setup.memoryLoopTitle": "安装 memory loop",
    "setup.memoryLoopBody": "安装 daily / weekly memory loop，让 Codex 自动总结对话并周期性 lint、合并和晋升经验。Claude Code 可以作为 source，但不作为默认 runner。",
    "setup.copyOpenCodex": "复制并打开 Codex",
    "setup.sourcesTitle": "还没有可读取的数据源",
    "setup.sourcesBody": "默认建议开启 Codex session logs 和 Claude Code session logs。",
    "setup.configureSources": "配置数据源",
    "action.handle": "处理",
    "action.open": "打开",
    "evidence.readFrom": "Read from",
    "gate.availableToCodex": "available to Codex",
    "gate.wikiQueryAvailable": "installed",
    "gate.wikiQueryMissing": "not installed",
    "gate.loopReady": "Codex App daily + weekly ACTIVE",
    "gate.loopMissing": "Not installed for this repo\nClick Open to create loops",
    "gate.runnerMissing": "runner missing",
    "gate.noSource": "No source enabled",
    "gate.confirmSourcesFirst": "Confirm sources first",
    "gate.installed": "installed",
    "gate.checkedAppLocations": "checked common app locations",
    "step.obsidianApp": "可选：安装桌面应用以便浏览和编辑知识库。",
    "step.obsidianSkills": "可选：安装 Obsidian CLI、Canvas、Bases 等增强 skills。",
    "step.claudeObsidian": "确认 Claude Obsidian 已就绪。",
    "step.sources": "选择会话数据源：Codex 或 Claude Code。",
    "step.runner": "让 Codex 自动总结对话，并每周复盘沉淀。",
    "step.localSkills": "把 LLM wiki 查询能力应用到 Codex。",
    "skill.sourceSkill": "Source skill",
    "skill.link": "link",
    "skill.availableNow": "available now",
    "skill.pointsElsewhere": "points elsewhere",
    "skill.notAvailable": "not available",
    "skill.keepLink": "Apply will keep/link",
    "skill.removeLink": "Apply will remove this repo link",
    "skill.currentTarget": "Current target:",
    "skill.synced": "synced",
    "skill.notSynced": "not synced",
    "skill.notSelected": "not selected",
    "toast.noLog": "当前没有 log 可以复制。",
    "toast.logCopied": "已复制所有 log for debug。",
    "toast.codexAutomationCopied": "粘贴板已经复制。请在 Codex App 里粘贴并发送，Codex 会创建 daily / weekly memory loop。",
    "toast.recentWeekCopied": "粘贴板已经复制。请在 Codex App 里粘贴并发送，Codex 会整理最近一周的 LLM wiki。",
    "toast.needAgent": "至少选择一个 agent，否则这个 wiki skill 不会被任何 agent 发现。",
    "progress.installTitle": "正在后台安装",
    "progress.installBody": "正在自动下载安装本地资源，完成后会刷新状态。网络慢时请稍等。",
    "log.savedConfig": "Saved config.",
    "log.confirmedSources": "Confirmed source selection.",
    "log.running": "Running",
    "log.exitCode": "Exit code:",
    "action.obsidianApp.body": "Obsidian 是推荐但非必需的本地 vault 桌面界面；缺失时核心 memory pipeline 仍可运行。",
    "action.obsidianApp.manual.title": "手动安装",
    "action.obsidianApp.manual.body": "打开 Obsidian 官方下载页，按官网方式安装桌面应用。",
    "action.obsidianApp.manual.label": "打开官方下载页",
    "action.obsidianApp.auto.title": "一键安装",
    "action.obsidianApp.auto.body": "使用 Homebrew 安装 Obsidian；没有 Homebrew 时会打开官方下载页。",
    "action.obsidianApp.auto.label": "一键安装 Obsidian",
    "action.obsidianSkills.body": "Obsidian 基础 skills 是可选增强，只在需要 CLI、Canvas、Bases 等能力时安装。",
    "action.obsidianSkills.manual.title": "手动查看",
    "action.obsidianSkills.manual.body": "打开 obsidian-skills GitHub repo，自己 clone 或阅读安装方式。",
    "action.obsidianSkills.manual.label": "打开 GitHub",
    "action.obsidianSkills.auto.title": "一键安装",
    "action.obsidianSkills.auto.body": "如果缺基础 skills，才 clone/update obsidian-skills 到本 repo 的 .agent/external 并创建链接。",
    "action.obsidianSkills.auto.label": "安装并链接",
    "action.claudeObsidian.body": "检查 Claude Obsidian 是否已就绪。",
    "action.claudeObsidian.manual.body": "打开 Claude Obsidian GitHub repo 查看详情。",
    "action.claudeObsidian.auto.body": "Clone/update Claude Obsidian，供 memory loader 使用。",
    "action.claudeObsidian.auto.label": "安装 Claude Obsidian",
    "action.localSkills.body": "把 engineering-memory-loader 同步到 Codex，让其他 repo 可以按需查询这套 LLM wiki。",
    "action.localSkills.manual.title": "手动查看",
    "action.localSkills.manual.body": "在 Codex skills 目录中定位已经应用的 engineering-memory-loader。",
    "action.localSkills.manual.label": "打开 Codex Skill",
    "action.localSkills.auto.title": "应用到 Codex",
    "action.localSkills.auto.body": "用最简单的软链接，把 engineering-memory-loader 同步到 Codex skills 目录。",
    "action.localSkills.auto.label": "应用 Wiki Skill",
    "action.runner.body": "安装 daily / weekly memory loop，让本地 wiki 自动总结对话，并周期性 lint、合并和晋升经验。",
    "action.runner.manual.title": "打开 Codex",
    "action.runner.manual.body": "复制安装提示词并打开 Codex，然后粘贴发送，让 Codex agent 创建两个 loop。",
    "action.runner.manual.label": "复制并打开 Codex",
    "action.runner.auto.title": "安装到 Codex",
    "action.runner.auto.label": "复制并打开 Codex",
    "action.sources.body": "检查方式：至少启用 Codex session logs 或 Claude Code session logs。",
    "action.sources.manual.title": "选择会话来源",
    "action.sources.manual.body": "在 Sources 弹窗里选择 Codex 或 Claude Code session logs。",
    "action.sources.manual.label": "选择数据源",
    "action.sources.auto.title": "选择默认来源",
    "action.sources.auto.body": "在当前页面勾选 Codex / Claude Code session logs；Claude 只作为数据源，不负责运行 loop。",
    "action.sources.auto.label": "选择数据源",
  },
  en: {
    "sidebar.localOnly": "Local only",
    "sidebar.poweredBy": "Powered by",
    "nav.workspace": "Workspace",
    "nav.setup": "Setup",
    "nav.config": "Config & Run",
    "nav.configuration": "Configuration",
    "nav.automation": "Automation",
    "hero.eyebrow": "Local-first Agent Memory",
    "hero.sub": "Turn local Codex and Claude Code sessions into a searchable local wiki, then bring that context back to agents when needed.",
    "hero.repoTitle": "Open local vault",
    "language.label": "Language",
    "button.refresh": "Refresh",
    "button.openVault": "Open Vault",
    "button.sources": "Sources",
    "button.open": "Open",
    "button.copyPromptOpenCodex": "Copy Prompt & Open Codex",
    "button.copyLog": "Copy Log",
    "button.copyLogTitle": "Copy all logs for debug",
    "button.cancel": "Cancel",
    "button.confirmSources": "Confirm sources",
    "button.copyOpen": "Copy and open",
    "button.close": "Close",
    "button.applyRefresh": "Apply / Refresh",
    "setup.eyebrow": "Step one · Environment check",
    "setup.title": "Finish first-time setup",
    "setup.p1": "First confirm this machine can collect sessions, write the wiki, and run the daily / weekly memory loop. Missing pieces show up here as the next action.",
    "setup.p2": "After setup, use Config & Run to adjust sources, output paths, and automation.",
    "setup.progress": "Progress",
    "setup.note": "Start with the defaults to get a demo working. Paths, sources, skill mappings, and outputs live in Config & Run.",
    "setup.checks": "Environment checks",
    "metric.setup": "Setup",
    "metric.concepts": "Concepts",
    "flow.title": "Wiki Structure & Flow",
    "flow.sourceBody": "Raw session logs stay in place; the daily loop writes a local capture inbox before the Daily Wiki page.",
    "flow.dailyBody": "Daily Chinese wiki pages for humans and agents, preserving key context and source links.",
    "flow.conceptsBody": "Daily is backup only; weekly review promotes valuable reusable knowledge into concepts and does not generate behavior rules.",
    "flow.skillBody": "Business repos load this query skill on demand to find history and avoid known traps.",
    "recent.title": "Recent Week",
    "recent.cardTitle": "Summarize the recent week",
    "recent.cardBody": "Copy a prompt and open Codex. After you paste it, Codex runs the daily workflow for the last 7 days, then runs weekly lint / merge / promote.",
    "automation.title": "Automation",
    "automation.notice": "Scheduling is handled by Codex App Automations. This checks whether the current repo's daily / weekly Memory Loop is enabled; edit schedules directly in Codex App Automations.",
    "automation.statusTitle": "Memory Loop Status",
    "summary.title": "Daily Summaries",
    "summary.latest14": "latest 14",
    "log.title": "Log",
    "source.title": "Choose data sources",
    "source.body": "Daily Wiki starts from these session sources.",
    "source.codexBody": "Read local Codex sessions to generate Daily Wiki pages for later memory reconciliation.",
    "source.claudeBody": "Read local Claude Code sessions alongside Codex as a default data source.",
    "loop.title": "Install Memory Loop",
    "loop.body": "Next, Codex opens with a copied install prompt that creates daily / weekly loops for automatic summarization, linting, merging, and promotion.",
    "loop.dailyTime": "Daily time",
    "loop.dailyDetail": "Daily summary detail",
    "loop.detailConcise": "Concise",
    "loop.detailDetailed": "Detailed (default, full value coverage, normally about 1,200+ words)",
    "loop.weeklyDay": "Weekly day",
    "loop.weeklyTime": "Weekly time",
    "loop.note": "These times only generate the install prompt. After installation, Codex App Automations remains the source of truth.",
    "loop.step1": "Click Copy and open to copy the install prompt and open Codex App.",
    "loop.step2": "Paste the clipboard into Codex and send it.",
    "loop.step3": "The Codex agent creates or updates two scheduled tasks: daily summaries and weekly lint / merge / promote.",
    "day.monday": "Monday",
    "day.tuesday": "Tuesday",
    "day.wednesday": "Wednesday",
    "day.thursday": "Thursday",
    "day.friday": "Friday",
    "day.saturday": "Saturday",
    "day.sunday": "Sunday",
    "skill.body": "Symlink this repo's engineering-memory-loader into Codex so other repos can query this local LLM wiki.",
    "skill.notice": "This only applies the query skill. The daily / weekly memory loop is still handled by Codex App Automations.",
    "skill.syncTo": "Sync to",
    "empty.dailySummaries": "No Daily Wiki pages yet",
    "status.latest": "latest",
    "status.daily": "daily",
    "setup.completeBody": "The environment is ready. You can continue to Config & Run.",
    "setup.enterConfig": "Go to Config & Run",
    "setup.obsidianAppTitle": "Recommended: Obsidian (optional)",
    "setup.obsidianAppBody": "Obsidian makes the local vault easier to browse and edit. Capture, consolidation, and query still work without it.",
    "setup.chooseInstall": "Choose install method",
    "setup.obsidianSkillsTitle": "Recommended: Obsidian Skills (optional)",
    "setup.obsidianSkillsBody": "Install these only for extras such as Obsidian CLI, Canvas, or Bases. The core memory pipeline does not depend on them.",
    "setup.installObsidianSkills": "Install Obsidian Skills",
    "setup.installAllRecommended": "Install recommended setup",
    "setup.claudeObsidianTitle": "Install Claude Obsidian",
    "setup.claudeObsidianBody": "Install Claude Obsidian so the memory loader can query the local vault.",
    "setup.installClaudeObsidian": "Install Claude Obsidian",
    "setup.applySkillTitle": "Apply wiki skill",
    "setup.applySkillBody": "Symlink engineering-memory-loader into Codex so other repos can query this LLM wiki.",
    "setup.applySkillAction": "Apply Wiki Skill",
    "setup.memoryLoopTitle": "Install memory loop",
    "setup.memoryLoopBody": "Install the daily / weekly memory loop so Codex can summarize conversations and periodically lint, merge, and promote lessons. Claude Code can be a source, but not the default runner.",
    "setup.copyOpenCodex": "Copy and open Codex",
    "setup.sourcesTitle": "No readable source yet",
    "setup.sourcesBody": "Enable Codex session logs or Claude Code session logs.",
    "setup.configureSources": "Configure sources",
    "action.handle": "Handle",
    "action.open": "Open",
    "evidence.readFrom": "Read from",
    "gate.wikiQueryAvailable": "installed",
    "gate.wikiQueryMissing": "not installed",
    "gate.loopMissing": "Not installed for this repo\nClick Open to create loops",
    "gate.runnerMissing": "runner missing",
    "gate.noSource": "No source enabled",
    "gate.confirmSourcesFirst": "Confirm sources first",
    "gate.installed": "installed",
    "gate.checkedAppLocations": "checked common app locations",
    "step.obsidianApp": "Optional: install the desktop app to browse and edit the vault.",
    "step.obsidianSkills": "Optional: install extras such as Obsidian CLI, Canvas, or Bases.",
    "step.claudeObsidian": "Confirm Claude Obsidian is ready.",
    "step.sources": "Choose Codex or Claude Code session sources.",
    "step.runner": "Let Codex summarize conversations and consolidate weekly lessons.",
    "step.localSkills": "Apply the LLM wiki query ability to Codex.",
    "skill.sourceSkill": "Source skill",
    "skill.availableNow": "available now",
    "skill.pointsElsewhere": "points elsewhere",
    "skill.notAvailable": "not available",
    "skill.keepLink": "Apply will keep/link",
    "skill.removeLink": "Apply will remove this repo link",
    "skill.currentTarget": "Current target:",
    "skill.synced": "synced",
    "skill.notSynced": "not synced",
    "skill.notSelected": "not selected",
    "toast.noLog": "There is no log to copy yet.",
    "toast.logCopied": "Copied all logs for debug.",
    "toast.codexAutomationCopied": "Copied to clipboard. Paste and send it in Codex App so Codex can create the daily / weekly memory loop.",
    "toast.recentWeekCopied": "Copied to clipboard. Paste and send it in Codex App so Codex can summarize the recent week.",
    "toast.needAgent": "Choose at least one agent, otherwise this wiki skill cannot be discovered.",
    "progress.installTitle": "Installing in the background",
    "progress.installBody": "Downloading and configuring local resources. The status will refresh when it finishes.",
    "action.obsidianApp.body": "Obsidian is a recommended but optional desktop UI for the local vault. The core memory pipeline runs without it.",
    "action.obsidianApp.manual.title": "Manual install",
    "action.obsidianApp.manual.body": "Open the official Obsidian download page and install the desktop app.",
    "action.obsidianApp.manual.label": "Open download page",
    "action.obsidianApp.auto.title": "One-click install",
    "action.obsidianApp.auto.body": "Install Obsidian with Homebrew. Without Homebrew, the official download page opens instead.",
    "action.obsidianApp.auto.label": "Install Obsidian",
    "action.obsidianSkills.body": "The base Obsidian skills are optional extras for capabilities such as CLI, Canvas, and Bases.",
    "action.obsidianSkills.manual.title": "Manual review",
    "action.obsidianSkills.manual.body": "Open the obsidian-skills GitHub repo to clone it yourself or read the install instructions.",
    "action.obsidianSkills.manual.label": "Open GitHub",
    "action.obsidianSkills.auto.title": "One-click install",
    "action.obsidianSkills.auto.body": "If missing, clone/update obsidian-skills into this repo's .agent/external and create links.",
    "action.obsidianSkills.auto.label": "Install and link",
    "action.claudeObsidian.body": "Check whether Claude Obsidian is ready.",
    "action.claudeObsidian.manual.body": "Open the Claude Obsidian GitHub repo for details.",
    "action.claudeObsidian.auto.body": "Clone/update Claude Obsidian for the memory loader.",
    "action.claudeObsidian.auto.label": "Install Claude Obsidian",
    "action.localSkills.body": "Sync engineering-memory-loader into Codex so other repos can query this LLM wiki.",
    "action.localSkills.manual.title": "Manual review",
    "action.localSkills.manual.body": "Reveal the applied engineering-memory-loader entry in the Codex skills directory.",
    "action.localSkills.manual.label": "Open Codex Skill",
    "action.localSkills.auto.title": "Apply to Codex",
    "action.localSkills.auto.body": "Use a simple symlink to sync engineering-memory-loader into the Codex skills directory.",
    "action.localSkills.auto.label": "Apply Wiki Skill",
    "action.runner.body": "Install the daily / weekly memory loop so the local wiki can summarize conversations, then lint, merge, and promote lessons.",
    "action.runner.manual.title": "Open Codex",
    "action.runner.manual.body": "Copy the install prompt, open Codex, paste it, and let Codex create the two loops.",
    "action.runner.manual.label": "Copy and open Codex",
    "action.runner.auto.title": "Install to Codex",
    "action.runner.auto.label": "Copy and open Codex",
    "action.sources.body": "Enable at least one source: Codex session logs or Claude Code session logs.",
    "action.sources.manual.title": "Choose session sources",
    "action.sources.manual.body": "Use the Sources modal to choose Codex or Claude Code session logs.",
    "action.sources.manual.label": "Choose sources",
    "action.sources.auto.title": "Choose defaults",
    "action.sources.auto.body": "Enable Codex / Claude Code session logs here. Claude is a source only, not the runner.",
    "action.sources.auto.label": "Choose sources",
  },
};

function t(key, fallback = key) {
  return i18n[currentLang]?.[key] || i18n.zh[key] || fallback;
}

function applyLanguage(options = {}) {
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
  const selector = $("languageSelect");
  if (selector) selector.value = currentLang;
  document.querySelectorAll("[data-i18n]").forEach((item) => {
    item.textContent = t(item.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((item) => {
    item.title = t(item.dataset.i18nTitle);
  });
  if (latestStatus && !options.skipRender) renderStatus(latestStatus, { keepPage: true });
}

const setupActionKeys = {
  obsidianApp: {
    title: "Obsidian App",
    body: "Obsidian 是推荐但非必需的本地 vault 桌面界面；缺失时核心 memory pipeline 仍可运行。",
    manual: {
      title: "手动安装",
      body: "打开 Obsidian 官方下载页，按官网方式安装桌面应用。",
      label: "打开官方下载页",
      action: "open-obsidian",
    },
    auto: {
      title: "一键安装",
      body: "使用 Homebrew 安装 Obsidian；没有 Homebrew 时会打开官方下载页。",
      label: "一键安装 Obsidian",
      action: "install-obsidian-app",
    },
  },
  obsidianSkills: {
    title: "Obsidian Skills",
    body: "Obsidian 基础 skills 是可选增强，只在需要 CLI、Canvas、Bases 等能力时安装。",
    manual: {
      title: "手动查看",
      body: "打开 obsidian-skills GitHub repo，自己 clone 或阅读安装方式。",
      label: "打开 GitHub",
      action: "open-obsidian-skills-github",
    },
    auto: {
      title: "一键安装",
      body: "如果缺基础 skills，才 clone/update obsidian-skills 到本 repo 的 .agent/external 并创建链接。",
      label: "安装并链接",
      action: "install-obsidian-skills",
    },
  },
  claudeObsidian: {
    title: "Claude Obsidian",
    body: "检查 Claude Obsidian 是否已就绪。",
    manual: {
      title: "手动查看",
      body: "打开 Claude Obsidian GitHub repo 查看详情。",
      label: "打开 GitHub",
      action: "open-claude-obsidian-github",
    },
    auto: {
      title: "安装到当前 repo",
      body: "Clone/update Claude Obsidian，供 memory loader 使用。",
      label: "安装 Claude Obsidian",
      action: "install-claude-obsidian",
    },
  },
  localSkills: {
    title: "Apply Wiki Skill",
    body: "把 engineering-memory-loader 同步到 Codex，让其他 repo 可以按需查询这套 LLM wiki。",
    manual: {
      title: "手动查看",
      body: "在 Codex skills 目录中定位已经应用的 engineering-memory-loader。",
      label: "打开 Codex Skill",
      action: "open-local-skills",
    },
    auto: {
      title: "应用到 Codex",
      body: "用最简单的软链接，把 engineering-memory-loader 同步到 Codex skills 目录。",
      label: "Apply Wiki Skill",
      action: "expose-memory-skill",
    },
  },
  runner: {
    title: "Memory Loop",
    body: "安装 daily / weekly memory loop，让本地 wiki 自动总结对话，并周期性 lint、合并和晋升经验。",
    manual: {
      title: "打开 Codex",
      body: "复制安装提示词并打开 Codex，然后粘贴发送，让 Codex agent 创建两个 loop。",
      label: "复制并打开 Codex",
      action: "prepare-codex-automation",
    },
    auto: {
      title: "安装到 Codex",
      body: "复制安装提示词并打开 Codex，然后粘贴发送，让 Codex agent 创建两个 loop。",
      label: "复制并打开 Codex",
      action: "prepare-codex-automation",
    },
  },
  sources: {
    title: "Data Sources",
    body: "检查方式：至少启用 Codex session logs 或 Claude Code session logs。",
    manual: {
      title: "选择会话来源",
      body: "在 Sources 弹窗里选择 Codex 或 Claude Code session logs。",
      label: "选择数据源",
      clientAction: "open-source-picker",
    },
    auto: {
      title: "选择默认来源",
      body: "在当前页面勾选 Codex / Claude Code session logs；Claude 只作为数据源，不负责运行 loop。",
      label: "选择数据源",
      clientAction: "open-source-picker",
    },
  },
};

function setupAction(key) {
  const action = setupActionKeys[key];
  if (!action) return null;
  const prefix = "action." + key;
  return {
    ...action,
    body: t(prefix + ".body", action.body),
    manual: {
      ...action.manual,
      title: t(prefix + ".manual.title", action.manual.title),
      body: t(prefix + ".manual.body", action.manual.body),
      label: t(prefix + ".manual.label", action.manual.label),
    },
    auto: {
      ...action.auto,
      title: t(prefix + ".auto.title", action.auto.title),
      body: t(prefix + ".auto.body", action.auto.body),
      label: t(prefix + ".auto.label", action.auto.label),
    },
  };
}

function setPage(page, manual = false) {
  currentPage = page;
  if (manual) userSelectedPage = true;
  document.body.dataset.page = page;
  document.querySelectorAll("[data-page-target]").forEach((item) => {
    item.classList.toggle("active", item.dataset.pageTarget === page);
  });
}

function reconcilePage(ready) {
  if (!ready) {
    userSelectedPage = false;
    setPage("setup");
    return;
  }
  setPage(currentPage || "setup");
}

function append(text) {
  log.textContent = log.textContent + text + "\n";
  log.scrollTop = log.scrollHeight;
  $("logState").textContent = t("status.updated");
}

function readForm() {
  return {
    agentRunner: $("agentRunner").value,
    codexSourcesEnabled: $("codexSourcesEnabled").checked,
    claudeSourcesEnabled: $("claudeSourcesEnabled").checked,
    memorySkillCodexEnabled: $("memorySkillCodexEnabled").checked,
    memorySkillClaudeEnabled: $("memorySkillClaudeEnabled").checked,
    dailySummaryDetail: $("dailySummaryDetail").value,
    dailyDate: $("dailyDate").value,
    weeklyEndDate: $("weeklyEndDate").value,
    dailyAutoTime: $("dailyAutoTime").value,
    weeklyAutoDay: $("weeklyAutoDay").value,
    weeklyAutoTime: $("weeklyAutoTime").value,
  };
}

function writeForm(config) {
  for (const key of fields) {
    if (["codexSourcesEnabled", "claudeSourcesEnabled", "memorySkillCodexEnabled", "memorySkillClaudeEnabled"].includes(key)) $(key).checked = Boolean(config[key]);
    else $(key).value = config[key] || "";
  }
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function saveConfig() {
  const config = await api("/api/config", { method: "POST", body: JSON.stringify(readForm()) });
  writeForm(config);
  append(t("log.savedConfig"));
  await refresh({ keepPage: true });
}

async function saveSourcesFromModal() {
  $("codexSourcesEnabled").checked = $("sourceModalCodex").checked;
  $("claudeSourcesEnabled").checked = $("sourceModalClaude").checked;
  closeSourceModal();
  const config = await api("/api/config", { method: "POST", body: JSON.stringify({ ...readForm(), sourcesConfirmed: true }) });
  writeForm(config);
  append(t("log.confirmedSources"));
  await refresh({ keepPage: true });
}

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("open");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => $("toast").classList.remove("open"), 5200);
}

function showProgressBanner() {
  $("progressTitle").textContent = t("progress.installTitle");
  $("progressBody").textContent = t("progress.installBody");
  $("progressBanner").hidden = false;
}

function hideProgressBanner() {
  $("progressBanner").hidden = true;
}

async function copyLogForDebug() {
  const logText = log.textContent || "";
  if (!logText.trim()) {
    showToast(t("toast.noLog"));
    return;
  }
  const version = latestStatus?.appVersion || $("appVersion").textContent || "v0.0.1";
  const text = "Version: " + version + "\n" + logText;
  let copied = false;
  try {
    await api("/api/clipboard", { method: "POST", body: JSON.stringify({ text }) });
    copied = true;
  } catch {
    copied = false;
  }
  if (!copied && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (!copied) {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.focus();
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }
  $("logState").textContent = t("status.copied");
  showToast(t("toast.logCopied"));
}

function renderAutomation(status) {
  const automation = status.automation || {};
  const codexApp = automation.codexApp || {};
  $("automationMetric").textContent = "Codex App";
  const codexLine = (entry) => {
    if (!entry?.found) return t("status.notInstalled");
    const status = String(entry.status || "unknown").toUpperCase();
    if (status === "ACTIVE") return t("status.active");
    if (status === "PAUSED") return t("status.paused");
    return status.toLowerCase();
  };
  $("dailyCodexMetric").textContent = codexLine(codexApp.daily);
  $("weeklyCodexMetric").textContent = codexLine(codexApp.weekly);
}

function renderSkillMappings(status) {
  const target = $("skillMappings");
  if (!target) return;
  const mappings = (status.memorySkillMappings || []).filter((mapping) => mapping.id === "codex");
  target.innerHTML = mappings.map((mapping) => {
    const statusText = mapping.enabled
      ? (mapping.skill?.linkedToExpected ? t("skill.synced") : t("skill.notSynced"))
      : t("skill.notSelected");
    const target = mapping.root + "/engineering-memory-loader";
    return "<li><b>" + esc(mapping.label) + "</b><code>" + esc(target + " · " + statusText) + "</code></li>";
  }).join("");
}

function renderApplyWikiSkillModal() {
  const mappings = (latestStatus?.memorySkillMappings || []).filter((mapping) => mapping.id === "codex");
  const source = mappings[0]?.skill?.expectedTarget || (latestStatus?.repoRoot ? latestStatus.repoRoot + "/.agent/skills/engineering-memory-loader" : "-");
  $("applyWikiSkillCodex").checked = $("memorySkillCodexEnabled").checked;
  $("applyWikiSkillClaude").checked = $("memorySkillClaudeEnabled").checked;
  const rows = [{ name: t("skill.sourceSkill"), path: source, status: "" }];
  for (const mapping of mappings) {
    const link = mapping.root + "/engineering-memory-loader";
    const statusText = mapping.skill?.linkedToExpected
      ? t("skill.availableNow")
      : (mapping.skill?.exists ? t("skill.pointsElsewhere") : t("skill.notAvailable"));
    const selectedText = mapping.enabled ? t("skill.keepLink") : t("skill.removeLink");
    const targetText = mapping.skill?.target ? t("skill.currentTarget") + " " + mapping.skill.target : "";
    rows.push({
      name: mapping.label + " " + t("skill.link", "link"),
      path: link,
      status: [selectedText, statusText, targetText].filter(Boolean).join(" · "),
    });
  }
  $("applyWikiSkillLinks").innerHTML = rows.map((row) => (
    "<li><b>" + esc(row.name) + "</b><code>" + esc(row.path) +
    (row.status ? "<span class=\"link-status\">" + esc(row.status) + "</span>" : "") +
    "</code></li>"
  )).join("");
}

function renderStepEvidence(step) {
  const lines = [];
  if (step.detail) lines.push('<strong>' + esc(step.detail) + '</strong>');
  if (step.path) lines.push('<div class="evidence-line"><em>' + esc(step.pathLabel || t("evidence.readFrom")) + '</em><code class="muted">' + esc(step.path) + '</code></div>');
  return lines.length ? '<div class="step-evidence">' + lines.join("") + '</div>' : "";
}

function setupActionLabel(step) {
  const action = setupAction(step.key);
  if (!action) return t("action.handle");
  return action.auto?.label || action.manual?.label || t("action.handle");
}

function handleSetupStep(key) {
  if (key === "sources") {
    openSourceModal();
    return;
  }
  openSetupModal(key);
}

function renderSetupChain(steps) {
  $("setupChain").innerHTML = steps.map((step, index) => {
    const state = step.ok ? "ok" : "blocked";
    const label = step.name.replace("Obsidian ", "Obs. ").replace("Claude ", "Cl. ");
    return '<button class="chain-step ' + state + '" type="button" data-setup-key="' + esc(step.key) + '">' +
      '<span class="chain-dot">' + (step.ok ? "✓" : String(index + 1)) + '</span>' +
      '<span class="chain-label">' + esc(label) + '</span>' +
    '</button>';
  }).join("");
}

function renderOnboarding(status, steps, options = {}) {
  const gates = status.gates || {};
  const readyCount = steps.filter((step) => step.ok).length;
  const total = steps.length;
  const ready = Boolean(gates.pipelineReady);

  document.body.classList.toggle("setup-mode", !ready);
  document.body.classList.toggle("app-mode", ready);
  if (!options.keepPage) reconcilePage(ready);
  $("onboardingScore").textContent = readyCount + "/" + total;

  let title = t("setup.completeTitle");
  let body = t("setup.completeBody");
  let action = "";
  let label = t("setup.enterConfig");

  if (!ready) {
    const firstBlockedStep = steps.find((step) => !step.ok);
    activeSetupKey = firstBlockedStep?.key || "";
    if (activeSetupKey === "obsidianApp") {
      title = t("setup.obsidianAppTitle");
      body = t("setup.obsidianAppBody");
      action = "install-all-resources";
      label = t("setup.installAllRecommended");
    } else if (activeSetupKey === "obsidianSkills") {
      title = t("setup.obsidianSkillsTitle");
      body = t("setup.obsidianSkillsBody");
      action = "install-all-resources";
      label = t("setup.installAllRecommended");
    } else if (activeSetupKey === "claudeObsidian") {
      title = t("setup.claudeObsidianTitle");
      body = t("setup.claudeObsidianBody");
      action = "install-all-resources";
      label = t("setup.installAllRecommended");
    } else if (activeSetupKey === "localSkills") {
      title = t("setup.applySkillTitle");
      body = t("setup.applySkillBody");
      action = "";
      label = t("setup.applySkillAction");
    } else if (activeSetupKey === "runner") {
      title = t("setup.memoryLoopTitle");
      body = t("setup.memoryLoopBody");
      action = "";
      label = t("setup.copyOpenCodex");
    } else if (activeSetupKey === "sources") {
      title = t("setup.sourcesTitle");
      body = t("setup.sourcesBody");
      action = "";
      label = t("setup.configureSources");
    }
  } else {
    activeSetupKey = "";
  }

  $("nextActionCard").className = "next-action" + (ready ? " ready" : "");
  $("nextActionTitle").textContent = title;
  $("nextActionBody").textContent = body;
  $("wizardPrimary").dataset.run = action;
  $("wizardPrimary").dataset.setupKey = activeSetupKey;
  $("wizardPrimary").textContent = label;
  $("wizardPrimary").disabled = false;
  renderSetupChain(steps);
  $("wizardSteps").innerHTML = steps.map((step, index) => (
    '<div class="step ' + (step.ok ? "ok" : "blocked") + '" data-setup-key="' + esc(step.key) + '">' +
      '<div class="step-number">' + (step.ok ? "✓" : String(index + 1)) + '</div>' +
      '<div class="step-body"><b>' + esc(step.name) + '</b><span>' + esc(step.text) + '</span>' + renderStepEvidence(step) + '</div>' +
      (step.ok && (step.openAction || step.clientOpenAction)
        ? '<button class="ghost open-evidence" type="button" ' + (step.openAction ? 'data-open-action="' + esc(step.openAction) + '"' : 'data-client-action="' + esc(step.clientOpenAction) + '"') + '>' + esc(t("action.open")) + '</button>'
        : (!step.ok ? '<button class="step-action" type="button" data-setup-action="' + esc(step.key) + '">' + esc(setupActionLabel(step)) + '</button>' : '<span></span>')) +
    '</div>'
  )).join("");
}

function renderGates(status, options = {}) {
  const gates = status.gates || {};
  const resources = status.resources || {};
  const obsidianLinked = resources.obsidianSkills?.linked || {};
  const linkedCount = Object.values(obsidianLinked).filter(Boolean).length;
  const linkedTotal = Object.keys(obsidianLinked).length || 5;
  const obsidianSkillDetail = linkedCount + "/" + linkedTotal + " " + t("gate.availableToCodex");
  const claudeObsidianDetail = gates.claudeObsidianReady ? t("status.ready") : t("status.notInstalled");
  const selectedMemoryMappings = (status.memorySkillMappings || []).filter((mapping) => mapping.enabled);
  const syncedMemoryCount = selectedMemoryMappings.filter((mapping) => mapping.skill?.linkedToExpected).length;
  const memoryTargetLabel = selectedMemoryMappings.map((mapping) => mapping.label).join(" + ") || "Codex";
  const runnerDetail = gates.codexAppLoopReady
    ? t("gate.loopReady")
    : (gates.runnerAvailable
      ? t("gate.loopMissing")
      : (($("agentRunner").value || "codex") + " " + t("gate.runnerMissing")));
  const sourceDetail = [
    $("codexSourcesEnabled").checked ? "Codex session logs" : "",
    $("claudeSourcesEnabled").checked ? "Claude Code session logs" : "",
  ].filter(Boolean).join("\n") || t("gate.noSource");
  const sourceGateDetail = gates.sourcesConfirmed ? sourceDetail : t("gate.confirmSourcesFirst") + "\n" + sourceDetail;
  const steps = [
    { key: "obsidianApp", name: "Obsidian App", ok: gates.obsidianAppReady, text: t("step.obsidianApp"), detail: resources.obsidianApp?.path ? t("gate.installed") : t("gate.checkedAppLocations"), openAction: "open-detected-obsidian-app" },
    { key: "obsidianSkills", name: "Obsidian Skills", ok: gates.obsidianSkillsReady, text: t("step.obsidianSkills"), detail: obsidianSkillDetail, openAction: "open-detected-obsidian-skills" },
    { key: "claudeObsidian", name: "Claude Obsidian", ok: gates.claudeObsidianReady, text: t("step.claudeObsidian"), detail: claudeObsidianDetail, openAction: "open-detected-claude-obsidian" },
    { key: "sources", name: "Sources", ok: gates.sourceReady, text: t("step.sources"), detail: sourceGateDetail, clientOpenAction: "open-source-picker" },
    { key: "runner", name: "Memory Loop", ok: gates.runnerReady, text: t("step.runner"), detail: runnerDetail, openAction: "prepare-codex-automation" },
    { key: "localSkills", name: "Apply Wiki Skill", ok: gates.localSkillsReady, text: t("step.localSkills"), detail: syncedMemoryCount + "/" + selectedMemoryMappings.length + " " + t("skill.synced") + " · " + memoryTargetLabel, openAction: "open-local-skills" },
  ];
  renderOnboarding(status, steps, options);
  $("gateMetric").textContent = gates.pipelineReady ? t("status.ready") : t("status.blocked");

  const reason = gates.blockers?.length ? "Blocked until setup is complete:\n" + gates.blockers.join("\n") : "";
  document.querySelectorAll("[data-requires-ready]").forEach((button) => {
    button.disabled = !gates.pipelineReady;
    button.title = gates.pipelineReady ? "" : reason;
  });
}

function renderStatus(status, options = {}) {
  latestStatus = status;
  $("appVersion").textContent = status.appVersion || "v0.0.1";
  $("repoRoot").textContent = status.repoRoot;
  if ($("configPath")) $("configPath").textContent = status.configPath;
  const gates = status.gates || {};
  const gateItems = [
    gates.obsidianAppReady,
    gates.obsidianSkillsReady,
    gates.claudeObsidianReady,
    gates.sourceReady,
    gates.runnerReady,
    gates.localSkillsReady,
  ];
  $("readyScoreMetric").textContent = gateItems.filter(Boolean).length + "/" + gateItems.length;
  $("summaryMetric").textContent = String(status.dailySummaries.length);
  $("conceptMetric").textContent = String(status.conceptCount);
  $("layerMetric").textContent = status.conceptCount + " " + t("metric.concepts").toLowerCase();
  $("summaries").innerHTML = status.dailySummaries.length
    ? status.dailySummaries.map((name, index) => '<li><code>' + name + '</code><span class="tag">' + (index === 0 ? t("status.latest") : t("status.daily")) + '</span></li>').join("")
    : '<li class="empty">' + esc(t("empty.dailySummaries")) + '</li>';
  renderAutomation(status);
  renderSkillMappings(status);
  renderGates(status, options);
}

async function refresh(options = {}) {
  const [config, status] = await Promise.all([api("/api/config"), api("/api/status")]);
  writeForm(config);
  renderStatus(status, options);
  $("runnerMetric").textContent = config.agentRunner;
  $("runState").textContent = t("status.idle");
}

async function run(action, options = {}) {
  const showProgress = progressActions.has(action);
  if (showProgress) showProgressBanner();
  document.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  try {
    await saveConfig();
    document.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    $("runState").textContent = t("status.running") + " " + action;
    $("logState").textContent = t("status.running");
    append("\n" + t("log.running") + " " + action + "...");
    const result = await api("/api/run", { method: "POST", body: JSON.stringify({ action, options }) });
    append(result.output);
        append(t("log.exitCode") + " " + result.code);
        if (action === "prepare-codex-automation" && result.code === 0) showToast(t("toast.codexAutomationCopied"));
        if (action === "prepare-codex-recent-week" && result.code === 0) showToast(t("toast.recentWeekCopied"));
    await refresh();
  } finally {
    document.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    if (showProgress) hideProgressBanner();
    await refresh();
        $("runState").textContent = t("status.idle");
  }
}

async function runActionOnly(action, options = {}) {
  try {
    const result = await api("/api/run", { method: "POST", body: JSON.stringify({ action, options }) });
    append(result.output);
  } catch (error) {
    showToast(error.message);
  }
}

function closeSetupModal() {
  $("setupModal").classList.remove("open");
  $("setupModal").setAttribute("aria-hidden", "true");
}

function closeSourceModal() {
  $("sourceModal").classList.remove("open");
  $("sourceModal").setAttribute("aria-hidden", "true");
}

function closeCodexLoopModal() {
  $("codexLoopModal").classList.remove("open");
  $("codexLoopModal").setAttribute("aria-hidden", "true");
}

function closeApplyWikiSkillModal() {
  $("applyWikiSkillModal").classList.remove("open");
  $("applyWikiSkillModal").setAttribute("aria-hidden", "true");
}

function openSourceModal() {
  $("sourceModalCodex").checked = $("codexSourcesEnabled").checked;
  $("sourceModalClaude").checked = $("claudeSourcesEnabled").checked;
  $("sourceModal").classList.add("open");
  $("sourceModal").setAttribute("aria-hidden", "false");
}

function openCodexLoopModal() {
  $("codexLoopModal").classList.add("open");
  $("codexLoopModal").setAttribute("aria-hidden", "false");
}

function openApplyWikiSkillModal() {
  renderApplyWikiSkillModal();
  $("applyWikiSkillModal").classList.add("open");
  $("applyWikiSkillModal").setAttribute("aria-hidden", "false");
}

async function applyWikiSkillSelection() {
  const codex = $("applyWikiSkillCodex").checked;
  if (!codex) {
    showToast(t("toast.needAgent"));
    return;
  }
  $("memorySkillCodexEnabled").checked = codex;
  $("memorySkillClaudeEnabled").checked = false;
  closeApplyWikiSkillModal();
  await run("expose-memory-skill");
}

function openSetupModal(key) {
  if (key === "sources") {
    openSourceModal();
    return;
  }
  if (key === "runner") {
    openCodexLoopModal();
    return;
  }
  if (key === "localSkills") {
    openApplyWikiSkillModal();
    return;
  }
  const action = setupAction(key);
  if (!action) return;
  activeSetupKey = key;
  $("setupModalTitle").textContent = action.title;
  $("setupModalBody").textContent = action.body;
  $("manualChoiceTitle").textContent = action.manual.title;
  $("manualChoiceBody").textContent = action.manual.body;
  $("manualChoiceBtn").textContent = action.manual.label;
  $("autoChoiceTitle").textContent = action.auto.title;
  $("autoChoiceBody").textContent = action.auto.body;
  $("autoChoiceBtn").textContent = action.auto.label;
  $("setupModal").classList.add("open");
  $("setupModal").setAttribute("aria-hidden", "false");
}

async function runSetupChoice(which) {
  const action = setupAction(activeSetupKey)?.[which];
  if (!action) return;
  closeSetupModal();
  if (action.clientAction === "open-config") {
    setPage("config", true);
    return;
  }
  if (action.clientAction === "open-source-picker") {
    openSourceModal();
    return;
  }
  if (action.clientAction === "enable-default-sources") {
    $("codexSourcesEnabled").checked = true;
    $("claudeSourcesEnabled").checked = true;
    const config = await api("/api/config", { method: "POST", body: JSON.stringify({ ...readForm(), sourcesConfirmed: true }) });
    writeForm(config);
    append(t("log.confirmedSources"));
    await refresh();
    openSourceModal();
    return;
  }
  if (action.action) await run(action.action);
}

function runClientAction(action) {
  if (action === "open-config") {
    setPage("config", true);
    return true;
  }
  if (action === "open-source-picker") {
    openSourceModal();
    return true;
  }
  if (action === "open-apply-wiki-skill") {
    openApplyWikiSkillModal();
    return true;
  }
  return false;
}

$("openVaultBtn").addEventListener("click", () => runActionOnly("open-vault"));
$("repoRoot").addEventListener("click", () => runActionOnly("open-vault"));
$("repoRoot").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    runActionOnly("open-vault");
  }
});
$("refreshBtn").addEventListener("click", refresh);
$("languageSelect").addEventListener("change", (event) => {
  currentLang = event.target.value === "en" ? "en" : "zh";
  localStorage.setItem("configUiLang", currentLang);
  applyLanguage();
});
$("copyLogBtn").addEventListener("click", () => {
  copyLogForDebug().catch((error) => showToast(error.message));
});
$("wizardRefresh").addEventListener("click", refresh);
$("wizardPrimary").addEventListener("click", () => {
  if ($("wizardPrimary").dataset.run) return;
  if (activeSetupKey) openSetupModal(activeSetupKey);
  else setPage("config", true);
});
$("setupModalClose").addEventListener("click", closeSetupModal);
$("setupModal").addEventListener("click", (event) => {
  if (event.target === $("setupModal")) closeSetupModal();
});
$("sourceModalClose").addEventListener("click", closeSourceModal);
$("sourceModalCancelBtn").addEventListener("click", closeSourceModal);
$("sourceModal").addEventListener("click", (event) => {
  if (event.target === $("sourceModal")) closeSourceModal();
});
$("sourceModalSaveBtn").addEventListener("click", saveSourcesFromModal);
$("codexLoopModalClose").addEventListener("click", closeCodexLoopModal);
$("codexLoopCancelBtn").addEventListener("click", closeCodexLoopModal);
$("codexLoopModal").addEventListener("click", (event) => {
  if (event.target === $("codexLoopModal")) closeCodexLoopModal();
});
$("codexLoopConfirmBtn").addEventListener("click", async () => {
  $("agentRunner").value = "codex";
  closeCodexLoopModal();
  await run("prepare-codex-automation");
});
$("applyWikiSkillModalClose").addEventListener("click", closeApplyWikiSkillModal);
$("applyWikiSkillCancelBtn").addEventListener("click", closeApplyWikiSkillModal);
$("applyWikiSkillModal").addEventListener("click", (event) => {
  if (event.target === $("applyWikiSkillModal")) closeApplyWikiSkillModal();
});
$("applyWikiSkillRunBtn").addEventListener("click", async () => {
  await applyWikiSkillSelection();
});
$("manualChoiceBtn").addEventListener("click", () => runSetupChoice("manual"));
$("autoChoiceBtn").addEventListener("click", () => runSetupChoice("auto"));
document.addEventListener("click", (event) => {
  const button = event.target.closest?.(".open-evidence[data-open-action]");
  if (!button) return;
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (button.dataset.openAction === "prepare-codex-automation") {
    openCodexLoopModal();
    return;
  }
  runActionOnly(button.dataset.openAction);
});
document.addEventListener("click", (event) => {
  const button = event.target.closest?.(".open-evidence[data-client-action]");
  if (!button) return;
  event.stopPropagation();
  event.stopImmediatePropagation();
  runClientAction(button.dataset.clientAction);
});
document.addEventListener("click", (event) => {
  const button = event.target.closest?.(".step-action[data-setup-action]");
  if (!button) return;
  event.stopPropagation();
  event.stopImmediatePropagation();
  handleSetupStep(button.dataset.setupAction);
});
document.addEventListener("click", (event) => {
  const step = event.target.closest?.(".step[data-setup-key], .chain-step[data-setup-key]");
  if (!step || step.disabled) return;
  handleSetupStep(step.dataset.setupKey);
});
document.querySelectorAll("[data-page-target]").forEach((item) => {
  item.addEventListener("click", () => setPage(item.dataset.pageTarget, true));
});
document.querySelectorAll("[data-run]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!button.dataset.run) return;
    if (button.dataset.run === "prepare-codex-automation") {
      openCodexLoopModal();
      return;
    }
    run(button.dataset.run, { force: button.dataset.force === "true" });
  });
});

applyLanguage({ skipRender: true });
refresh().catch((error) => append(error.message));
