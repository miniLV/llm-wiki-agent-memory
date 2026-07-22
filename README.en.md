# Coding Agent Memory

**Make Codex and Claude Code remember your engineering work.** Turn local coding sessions into an auditable Markdown wiki, then retrieve prior decisions and debugging context from any repo.

**Plain Markdown, no vector database, and no hosted memory service required.**

[中文](README.md)

![Coding Agent Memory demo](docs/assets/demo.gif)

### What This Is

This is a local-first agent memory starter. Instead of growing `AGENTS.md` forever, it stores daily and weekly memory in `wiki/`, then exposes one query skill, `engineering-memory-loader`, so Codex can retrieve that memory from other repos.

Use it when:

- Agents forget what happened recently.
- Debugging needs old context or known failure modes.
- Product and engineering decisions are trapped in chat history.
- You want private local memory without a cloud service or a heavy RAG stack.

### Architecture Highlights

- Key-driven synthesis: the daily loop extracts Jira / issue / work item ids, features, repos, tools, and aliases, so inputs like `project1`, `ABC-123`, `PROJ42-987`, `AI VBG`, or `aivbg` can connect related sessions over time.
- One normalized input: raw sessions remain the complete fact source. Each Daily run creates one regenerable Evidence Snapshot and sends those same bytes to the agent once. Priority and noise filtering control density; Snapshot size does not skip a date.
- Historical rollups: when one key matches five past sessions, the agent filters low-relevance matches and summarizes the timeline, decisions, repeated problems, current state, and next steps instead of returning five links.
- Two-layer memory: Daily Wiki pages keep concrete evidence and lookup keys; Weekly Review promotes only recurring, reviewed topics into Concepts.
- Anti-bloat rules: ordinary ticket / project keys are not promoted into durable memory by default. Only stable parent topics or long-running workstreams become Concepts.
- Auditability: every Daily key topic links only its supporting Snapshot Evidence Cards. Each card identifies Codex or Claude Code and retains the original session path; raw JSONL is opened only for exact output or disputed audits.

### Architecture Diagrams

Architecture: local sessions produce one bounded Evidence Snapshot, compile into Daily Wiki pages, get promoted by Weekly Review, and return to future tasks through the memory loader.

![Coding Agent Memory architecture](docs/agent-memory-arch-sketch-en.png)

Flywheel: Daily records, Weekly lints / merges / promotes, and Apply brings lessons back into future tasks.

![Coding Agent Memory flywheel](docs/agent-memory-loop-flywheel-en.png)

<sub>Both diagrams above were created with the [miniLV/sketchboard-diagram](https://github.com/miniLV/sketchboard-diagram) agent skill, which generates hand-drawn whiteboard-style HTML diagrams and exports them as PNG.</sub>

### Reproducible Verification

The repository's synthetic fixtures do not read personal sessions. This command verifies setup and uninstall boundaries, the Evidence Snapshot, the Daily workflow, and strict Wiki lint:

```bash
node --test scripts/*.test.mjs && node scripts/wiki-lint.mjs --strict
```

These checks reproduce the deterministic local pipeline and provenance constraints. They are not presented as a real-user benchmark and do not measure how well an Agent answers future engineering questions. That evaluation is being designed in [#4](https://github.com/miniLV/coding-agent-memory/issues/4); [SCHEMA.md](SCHEMA.md) remains the sole definition of the memory model.

### Quick Start

> Use the Agent-first flow below directly from `master`. The `v0.0.1` entry on the Releases page is an early historical snapshot and does not include the current setup and verification flow.

Send this directly in an existing Codex project task:

```text
Help me install [miniLV/coding-agent-memory](https://github.com/miniLV/coding-agent-memory)
```

Codex clones the repository below the current project, reads its setup instructions, and performs a read-only preflight. Then the conversation continues with one confirmation:

```text
User: Install this project.

Codex: This will install local dependencies, confirm Codex and Claude session
sources, expose engineering-memory-loader, and create Daily and Weekly
automations. Perform the complete installation?

User: Yes.
```

To skip the confirmation, say:

```text
Perform the complete installation, including the Daily and Weekly automations.
```

The repository does not need to be registered as a separate Codex project. The installer targets the closest containing Codex project, runs the local setup without opening a browser, and creates or updates both automations with Codex's official automation tool.

Manual clone remains available as a fallback:

```bash
git clone https://github.com/miniLV/coding-agent-memory.git
```

### Uninstall

Prefer asking Codex to uninstall the project because the Daily and Weekly automations must be deleted with Codex's official automation tool:

```text
Uninstall this Agent Memory project.
```

The Agent performs a read-only inspection, explains the two matching automations and repository-owned global skill links, and asks for confirmation once. By default it preserves `.vault-meta`, `.agent/external`, all Daily Wiki pages, and Concepts.

Inspect the manual cleanup plan:

```bash
bash scripts/uninstall.sh --dry-run --json
```

After Codex has removed the automations, remove repository-owned global skill links manually:

```bash
bash scripts/uninstall.sh --yes --json
```

To also remove regenerable local configuration, Evidence Snapshots, and third-party checkouts:

```bash
bash scripts/uninstall.sh --yes --purge-local-state --json
```

`--purge-local-state` still preserves `wiki/`. The script never uninstalls Obsidian, removes the repository, deletes links owned by another installation, or replaces same-name non-link skill directories.

### Local Config UI

The local page is an optional status, diagnostics, and recovery surface:

```bash
cd coding-agent-memory
bash scripts/config-ui.sh --open
```

![Coding Agent Memory local config UI](docs/assets/local-config-ui-en.png)

The page binds only to `127.0.0.1`. Use it to:

1. Inspect Obsidian, Obsidian Skills, Claude Obsidian, repo skills, and sources.
2. Repair an individual missing dependency.
3. Adjust source and schedule settings.
4. Copy the automation recovery prompt only when normal Agent installation is unavailable.

### Current Support

| Area | Current support |
|---|---|
| Sources | Supports Codex, Claude Code, and custom folders. Codex reads `~/.codex/sessions/` and `~/.codex/archived_sessions/`; Claude Code reads `~/.claude/projects/`. Raw sessions stay in place; Daily receives one bounded Evidence Snapshot. |
| Scheduled runner | Currently only Codex App Automations runs the daily / weekly jobs. To avoid double writes, one vault should have one scheduled writer; Codex CLI + launchd / cron and Claude Code runner support are still in progress. |

### Daily Use

After setup, you usually do not touch `.vault-meta/` or `wiki/sources/` by hand. Let Codex App Automations run the daily / weekly loops. When you want to backfill the recent week, copy the prompt from the local config page and run it manually in Codex.

Then ask Codex from any work repo:

```text
What did we mainly work on last week?
What problems did this feature hit before?
I changed the source, but the browser still shows old behavior. Check memory and help debug.
```

Codex loads the local query flow through `engineering-memory-loader` and reads only the Daily pages or reviewed Concepts it needs:

```text
wiki/sources/ai-chats/
wiki/concepts/
```

### Local and Private

- The config UI binds only to `127.0.0.1`.
- Local config is written to `.vault-meta/`, which is gitignored.
- `.agent/external/` stores third-party checkouts and is gitignored.
- Generated Daily Wiki pages may contain private project memory. Do not commit personal generated wiki content to a public starter repo.
- Raw session logs stay in their original local locations. Gitignored `.vault-meta/` stores regenerable Evidence Snapshots; the wiki stores lightweight pages and navigation.

### Configure and Install

Normal installation is performed by `agent-memory-setup`; the local page is optional. Obsidian Skills, Claude Obsidian, memory skill exposure, source confirmation, and Codex Automations can still be inspected and repaired from the local **Setup** page.

### Repo Map

```text
.agent/skills/
  agent-memory-setup/           # repo-local complete installer
  agent-memory-uninstall/       # repo-local safe uninstaller
  ai-session-wiki-ingest/       # repo-local daily workflow
  agent-memory-reconcile/       # repo-local periodic workflow
  engineering-memory-loader/    # exported query skill

scripts/
  config-ui.sh                  # local config web entry
  setup.sh                      # skill setup entry
  uninstall.sh                  # safe local uninstall entry
  capture-ai-chats.mjs          # deterministic bounded Evidence Snapshot
  daily-memory-workflow.mjs     # one-shot Snapshot prepare and Daily verify
  wiki-lint.mjs                 # deterministic wiki health report

wiki/
  sources/ai-chats/             # Daily Wiki pages
  concepts/                     # reusable engineering lessons
  index.md / log.md             # stable routing and operation log
```
