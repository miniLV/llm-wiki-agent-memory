# LLM Wiki Agent Memory

Compile local Codex and Claude Code sessions into a small, searchable, auditable
Markdown Wiki.

[中文](README.md)

## Problems It Solves

- Agents forget recent work and repeat the same investigation.
- Decisions and debugging evidence are trapped in sessions.
- A growing `AGENTS.md` is the wrong place for personal history.
- Local private memory should not require a vector database or heavy RAG stack.

## Core Flow

```text
Codex / Claude Code session logs
  -> deterministic capture inbox
  -> one Daily backup page per date
  -> periodic lint + reconcile
  -> reviewed reusable Concepts
  -> read-only engineering-memory-loader
```

Capture preserves rebuildable evidence, Daily compiles a backup page with unreviewed
candidates, and Reconcile is the second review that promotes valuable reusable
Concepts. Daily candidates do not become effective guidance on their own.

![LLM Wiki Agent Memory flywheel](docs/agent-memory-loop-flywheel-en.png)

## Simplified Boundaries

- `SCHEMA.md` is the single domain authority. Skills contain procedures and
  boundaries; the template contains page shape.
- Daily metadata is minimal. Tickets, features, repos, tools, and aliases share one
  `lookup_keys` list; see [SCHEMA.md](SCHEMA.md).
- Provenance is one boolean. A page containing a Vault-derived answer is not
  automatically independent promotion evidence.
- There is no hot cache, nested `_index.md` hierarchy, trigger taxonomy, or automatic
  Canvas generation.
- Diagrams are generated only on explicit user request; searchable prose is canonical.
- This version captures Codex and Claude Code sessions only. Generic folder import is
  outside the core.

## Workflows

| Skill | Responsibility | Scope |
|---|---|---|
| `ai-session-wiki-ingest` | Capture one date and write one Daily Wiki page | repo-local |
| `agent-memory-reconcile` | Second review, merge, and promotion of Concepts; no Behavior Rules | repo-local |
| `engineering-memory-loader` | Read-only cross-repo query of historical knowledge | globally exposed |

Daily and Weekly are schedule frequencies, not extra memory layers. Codex App
Automations is currently the only scheduled writer, while both Codex and Claude Code
remain supported session sources.

## Quick Start

```bash
git clone https://github.com/miniLV/llm-wiki-agent-memory.git
cd llm-wiki-agent-memory
bash scripts/config-ui.sh --open
```

Setup installs the recommended bundle (Obsidian App, general Obsidian Skills, and
Claude Obsidian), links
`engineering-memory-loader` into Codex, confirms Codex / Claude Code sources, and
helps create the daily / weekly Codex App Automations.

Obsidian App and the general Obsidian Skills are recommended but optional extras.
First-time setup installs them together to avoid extra manual choices, but neither
participates in the core pipeline ready gate:

- Install Obsidian App for a friendlier way to browse and edit Markdown and links.
- Install the general Obsidian Skills only when you need extras such as Obsidian CLI,
  Canvas, or Bases.

Capture, Daily backup, Concept review, and read-only query still work without both.

## Daily Use

Ask Codex from any work repo:

```text
What did we mainly work on last week?
What decisions did we make for ABC-123?
What problems did this feature hit before?
The source changed but runtime behavior is still old; use memory to help debug.
```

The loader resolves the Vault from its real skill path, reads `wiki/index.md`, and
then uses dated Daily pages for historical evidence or reviewed Concepts for reusable
guidance. A Daily `可复用经验` candidate is not effective guidance by itself. The loader
stays read-only and does not load the Vault's `AGENTS.md` during normal queries.

## Current Support

| Area | Current support |
|---|---|
| Session sources | Codex: `~/.codex/sessions/`, `~/.codex/archived_sessions/`; Claude Code: `~/.claude/projects/` |
| Scheduled writer | Codex App Automations; one writer per Vault |
| Query | Date ranges, exact keys, concepts / decisions, debugging / repeated failures |
| Storage | Local Markdown; raw JSONL is not copied into the Vault |

Session images are temporarily extracted into gitignored
`.vault-meta/captures/assets/` for evidence inspection. The pipeline does not
automatically promote images or create diagrams.

## Repository Map

```text
.agent/skills/
  ai-session-wiki-ingest/
  agent-memory-reconcile/
  engineering-memory-loader/

scripts/
  capture-ai-chats.mjs
  wiki-lint.mjs
  setup.sh

wiki/
  index.md
  log.md
  sources/ai-chats/
  concepts/
  guardrails/Agent Behavior Rules.md
  templates/Daily AI Chat Summary Template.md
```

Local captures, configuration, and reviews live under gitignored `.vault-meta/`.
Generated Daily pages may contain private project memory; inspect them before
publishing a starter repository.

## Inspiration

The project follows [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):
compile external sources into an LLM-maintained Wiki governed by a small Schema. This
repo adds only the capture inbox, Daily compression layer, and anti-echo marker needed
for agent sessions.
