---
name: agent-memory-setup
description: Install and fully configure this repository's local Agent Memory stack, including dependencies, source configuration, the Codex query-skill link, and Daily and Weekly Codex App automations. Use when the user asks to install, deploy, set up, configure, bootstrap, repair, one-click install, or finish the complete setup of this repository, and for short affirmative follow-ups such as "好", "继续", "确认", "yes", or "proceed" after a full installation was offered in the same conversation.
---

# Agent Memory Setup

Complete setup in the current task. Keep the local configuration UI as a diagnostic and recovery surface; do not route a normal installation through it.

## 1. Preflight and authorization

Run a read-only preflight before asking for authorization or changing files:

- Resolve this repository's real path and confirm `scripts/setup.sh`, `scripts/install-resources.sh`, `scripts/link-skills.sh`, `.agent/skills/ai-session-wiki-ingest/SKILL.md`, and `.agent/skills/agent-memory-reconcile/SKILL.md` exist.
- Record the exit status and version of `node --version`, `git --version`, and `bash --version`.
- Confirm the repository and Codex home are writable; if Codex home is absent, check the home directory.
- Discover the Codex automation-management and project-list tools. List projects and select the project whose path is the longest ancestor of the repository real path. The repository may be the project root or a clone anywhere below it; do not require the repository itself to appear in the project list.

On Windows, if Git or Bash is missing from `PATH`, also check `%ProgramFiles%\Git` and `%LOCALAPPDATA%\Programs\Git` before deciding Git for Windows is not installed.

Treat Obsidian, Obsidian Skills, and Claude Obsidian as install targets, not prerequisites. If a required command, path, permission, automation tool, or containing Codex project is unavailable, make no changes. Report one `Setup prerequisites missing` list containing every failure, the detected state, and its exact fix.

After preflight succeeds, determine authorization:

- Treat requests that explicitly say complete, full, one-click, direct, or equivalent installation as authorization to proceed.
- Treat `好`, `可以`, `继续`, `确认`, `yes`, `proceed`, and equivalent affirmative replies as authorization only when full installation was offered earlier in the same conversation.
- For a generic request such as "安装这个项目", "部署一下", "set up this repo", or "install this", summarize in one sentence that setup installs local dependencies, confirms Codex and Claude session sources, exposes `engineering-memory-loader`, and creates two Codex App automations. Ask exactly once whether to perform the full setup, then stop without making changes.
- After authorization, continue immediately without asking again. Do not open the configuration UI or ask the user to copy a prompt.

## 2. Install local resources

From the repository real path, run:

```bash
bash scripts/setup.sh --full --non-interactive --json
```

Require valid JSON with `ok: true`. Preserve existing configuration and modified non-link skill directories. Treat a missing optional Obsidian desktop app as a warning, not a pipeline failure. Do not commit `.vault-meta`, generated memory, or installation state.

## 3. Create or update memory loops

Use the Codex automation-management tool; never edit Codex automation files directly and never substitute launchd, cron, UI automation, or copied prompts.

Target the containing project selected during preflight. Because its root may be an ancestor of this repository, begin each automation prompt by changing to the repository's absolute real path before reading a repo-local skill.

Read `.vault-meta/config.json`. Default to Daily at `17:00` local time and Weekly on Friday at `17:30` local time. Match existing automations by containing project, exact name, and the referenced repo-local skill or repository path. Update matches instead of creating duplicates. Automation IDs are runtime-owned and opaque; do not require or invent a fixed ID.

Preserve an existing automation's model and reasoning effort. For a new automation, use a model configured in `dailyModel` or `weeklyModel` when non-empty; otherwise use a currently supported Codex coding model accepted by the automation tool. Default reasoning effort to `medium`. Do not hard-code preview-only model IDs.

- Daily name: `LLM Wiki Agent Memory - Daily`
  Prompt: change to the repository real path, use `date +%F`, read `.agent/skills/ai-session-wiki-ingest/SKILL.md` completely, follow it as the sole workflow source of truth, report the result, and do not git commit memory changes.
- Weekly name: `LLM Wiki Agent Memory - Weekly`
  Prompt: change to the repository real path, use `date +%F` as the reconcile-window end date, read `.agent/skills/agent-memory-reconcile/SKILL.md` completely, follow it as the sole workflow source of truth, report the result, and do not git commit memory changes.

Keep both automations `ACTIVE`, local, and scheduled. If the automation tool rejects the containing project or selected model after local setup, report the exact changed runtime condition and the completed local state; do not send the user to the configuration page automatically.

## 4. Verify

Run:

```bash
bash scripts/install-resources.sh status --json
```

Confirm:

- required resources are available;
- the Codex `engineering-memory-loader` resolves to this repository;
- `.vault-meta/config.json` confirms at least one source and preserves existing values;
- exactly one active Daily and one active Weekly automation target the containing project and reference this repository;
- each automation has the requested local schedule.

Report installed, reused, skipped, and warning states plus both schedules. Do not run Daily or Weekly workflows as part of setup.
