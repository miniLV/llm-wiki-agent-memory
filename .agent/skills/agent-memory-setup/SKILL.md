---
name: agent-memory-setup
description: Install this repository's local Agent Memory stack end to end, including dependencies, the Codex query-skill link, local source configuration, and the Daily and Weekly Codex App automations. Use when the user asks to install, set up, configure, bootstrap, repair, or one-click install this repository without manually copying an automation prompt.
---

# Agent Memory Setup

Complete the whole setup in the current task. Do not stop after installing local files or ask the user to copy a prompt into another Codex task.

## 1. Preflight

Before changing anything, run every check and collect all failures:

- Resolve this repository's real path and confirm `scripts/install-resources.sh`, `scripts/link-skills.sh`, `.agent/skills/ai-session-wiki-ingest/SKILL.md`, and `.agent/skills/agent-memory-reconcile/SKILL.md` exist.
- Record the exit status and version of:

```bash
node --version
git --version
bash --version
```

- Confirm the repository and `~/.codex` are writable; if `~/.codex` is absent, check the home directory.
- Confirm the Codex automation-management tool is available and its project list contains this repository.

On Windows, if `git` or `bash` is missing from `PATH`, also check `%ProgramFiles%\Git` and `%LOCALAPPDATA%\Programs\Git` before deciding Git for Windows is not installed.

If anything fails, make no changes. Report one `Setup prerequisites missing` list with every failure, the detected state, and its exact fix:

- Missing Node.js: install the current Node.js LTS from <https://nodejs.org/>, restart Codex, and retry.
- Windows Git/Bash: add an existing Git for Windows installation to `PATH`, or install it from <https://git-scm.com/download/win>; restart Codex and retry.
- macOS Git: install the Xcode Command Line Tools, restart Codex, and retry.
- Repository, permission, automation, or project failure: identify the exact missing path or capability and tell the user how to correct it.

Obsidian, Obsidian Skills, and Claude Obsidian are install targets, not prerequisites. If all checks pass, report `Preflight ready` and continue without asking again.

## 2. Install local resources

From the repository's real path, run:

```bash
bash scripts/install-resources.sh install-all
bash scripts/link-skills.sh --force --prune --agents codex
```

Reuse existing installations and never replace a modified non-link skill directory. In `.vault-meta/config.json`, preserve existing values and set `codexSourcesEnabled`, `claudeSourcesEnabled`, and `sourcesConfirmed` to `true`; create the file if absent and leave it uncommitted.

## 3. Create or update the memory loops

Use the Codex automation-management tool; never edit `$CODEX_HOME/automations/*/automation.toml`. Target the project resolved during preflight. Read `.vault-meta/config.json`, defaulting to Daily `17:00` and Weekly Friday `17:30` in local time. Inspect existing automations first and update matching ids or names instead of duplicating them. Keep both `ACTIVE`, `cron`, and local. Preserve model and reasoning effort when updating.

- Daily: id `llm-wiki-agent-memory-daily`, name `LLM Wiki Agent Memory - Daily`, creation model `gpt-5.6-luna`, reasoning `medium`.
  Prompt: `Use date +%F, then read .agent/skills/ai-session-wiki-ingest/SKILL.md completely and follow it as the sole workflow source of truth. Report the result. Do not git commit memory changes.`
- Weekly: id `llm-wiki-agent-memory-weekly`, name `LLM Wiki Agent Memory - Weekly`, creation model `gpt-5.6-sol`, reasoning `medium`.
  Prompt: `Use date +%F as the reconcile-window end date, then read .agent/skills/agent-memory-reconcile/SKILL.md completely and follow it as the sole workflow source of truth. Report the result. Do not git commit memory changes.`

If the automation-management tool becomes unavailable after preflight, report the changed runtime condition and do not substitute direct TOML writes, CLI scheduling, launchd, cron, or UI automation.

## 4. Verify

Run `bash scripts/install-resources.sh status --json`. Confirm the resources are available, `~/.codex/skills/engineering-memory-loader` resolves to this repository, and both automations exist once, target this repository, and are `ACTIVE` with the requested schedules.

Report installed, reused, or skipped resources and both schedules. Do not run the workflows or commit local config, memory, or automation state.
