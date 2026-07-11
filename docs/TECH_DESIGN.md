# Technical Design

## Authority And Layers

`SCHEMA.md` is the sole owner of the memory model.

```text
External: Codex / Claude Code session logs (immutable source of truth)
Capture:  .vault-meta/captures/ai-chats/YYYY-MM-DD.md (regenerable evidence)
Wiki:     Daily pages -> Concepts + Agent Behavior Rules
Query:    index router -> runtime file scan -> cited read-only answer
```

Skills do not redefine the schema:

- `ai-session-wiki-ingest` adopts selected source-reading principles from Claude
  Obsidian's `wiki-ingest` design, then compiles one dated Daily page without loading
  or executing its generic multi-page workflow.
- `agent-memory-reconcile` runs deterministic lint and performs judgment-based merge,
  promotion, correction, and demotion.
- `engineering-memory-loader` is a thin cross-repo router around the repo-local
  `claude-obsidian/wiki-query` skill.

## Write Path

1. Capture reads Codex and Claude Code JSONL, slices records to the requested local
   date, skips Codex worker transcripts while retaining their delivered outcomes in
   the parent session, removes injected/tool-result noise, preserves every meaningful
   user turn and final outcome plus one evidence update per turn, and writes a
   regenerable inbox with explicit reduction/truncation metadata.
2. Daily inventories every card, drills into the original date slice only when a
   high-signal digest is incomplete, checks workstream coverage, then writes one
   human-readable page with the shape defined by `SCHEMA.md` and appends
   `wiki/log.md`.
3. Reconcile reads the latest seven Daily pages by default, runs
   `scripts/wiki-lint.mjs`, updates or merges Concepts, and keeps a maximum of 10
   directly linked Behavior Rules.

Scheduled writes are external. Codex App Automations is currently the supported
scheduled writer; one Vault keeps one scheduled writer.

## Read Path

1. The global loader follows its real symlink to resolve `VAULT_ROOT`.
2. It loads repo-local `claude-obsidian/wiki-query`, `SCHEMA.md`, and `wiki/index.md`.
3. It lists the newest Daily files for current questions, reads explicit date ranges
   directly, exact-searches Daily/Concept files for engineering keys, or checks
   `Agent Behavior Rules.md` for repeated failures.
4. It synthesizes and cites the smallest useful set of Wiki pages. Raw sessions are
   opened only for exact output, disputed evidence, or an explicit audit.

The query path is read-only and does not load the Vault repo's `AGENTS.md` during a
normal cross-repo lookup.

## Provenance

The query path emits the hidden marker owned by `SCHEMA.md` when Vault content
materially contributes. Capture reduces this to one binary flag. A Daily page with
that flag is valid context but is not automatically independent promotion evidence.

This deliberately conservative page-level rule replaces origin states, aggregate
counts, and per-item provenance labels.

## Deterministic Lint

`scripts/wiki-lint.mjs` checks only machine-verifiable structure:

- core files exist;
- Daily frontmatter and section shape match `SCHEMA.md`;
- wikilinks resolve;
- Concepts have visible Daily evidence;
- Behavior Rules stay within the cap and link to evidence.

Content quality, contradiction resolution, promotion value, and demotion remain LLM
judgment in Reconcile. There is no automatic diagram branch, hot cache, nested index
maintenance, or generic file-source importer in the core.
