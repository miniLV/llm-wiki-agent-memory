# Technical Design

## Authority And Layers

`SCHEMA.md` is the sole owner of the memory model.

```text
External: Codex / Claude Code session logs (immutable source of truth)
Snapshot: .vault-meta/captures/ai-chats/YYYY-MM-DD.capture.json (regenerable bounded evidence)
Wiki:     Daily pages -> Reviewed Concepts
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

1. The Snapshot builder reads Codex and Claude Code JSONL, which remain the complete
   fact source, slices records to the requested local date, skips Codex worker
   transcripts while retaining their delivered outcomes in
   the parent session, and removes injected/tool-result noise. Per turn it keeps the
   goal, final and delegated outcomes, latest unresolved state, and a representative
   high-signal intermediate update. It writes one lossy, regenerable JSON Evidence
   Snapshot with a fixed internal budget. Every Evidence Card remains represented; if the Snapshot
   is oversized, Node omits whole older completed turns before unresolved work while
   retaining each card's identity, original session path, and latest turn.
2. `prepare --emit-snapshot` persists the Snapshot and emits those exact bytes once.
   This is a delivery action, not another evidence layer. If protected evidence still
   exceeds the budget, prepare skips and emits nothing.
3. Daily reads that emitted Snapshot once and writes one human-readable page with the
   shape defined by `SCHEMA.md`; local verification appends `wiki/log.md`. Each key topic
   links one to three representative Evidence Cards, which identify Codex or Claude
   Code and retain the original session path.
4. Reconcile reads the latest seven Daily pages by default, runs
   `scripts/wiki-lint.mjs`, and updates or merges Reviewed Concepts.

Scheduled writes are external. Codex App Automations is currently the supported
scheduled writer; one Vault keeps one scheduled writer.

## Read Path

1. The global loader follows its real symlink to resolve `VAULT_ROOT`.
2. It loads repo-local `claude-obsidian/wiki-query`, `SCHEMA.md`, and `wiki/index.md`.
3. It lists the newest Daily files for current questions, reads explicit date ranges
   directly, or exact-searches Daily/Concept files for engineering keys.
4. It synthesizes and cites the smallest useful set of Wiki pages. Raw sessions are
   opened only for exact output, disputed evidence, or an explicit audit.

The query path is read-only and does not load the Vault repo's `AGENTS.md` during a
normal cross-repo lookup.

## Provenance

The query path emits the hidden marker owned by `SCHEMA.md` when Vault content
materially contributes. The Evidence Snapshot reduces this to one binary flag. A
Daily page with that flag is valid context but is not automatically independent
promotion evidence.

This deliberately conservative page-level rule replaces origin states, aggregate
counts, and per-item provenance labels.

## Deterministic Lint

`scripts/wiki-lint.mjs` checks only machine-verifiable structure:

- core files exist;
- Daily frontmatter and section shape match `SCHEMA.md`;
- every Daily key topic links exact Evidence Cards from its dated Evidence Snapshot;
- wikilinks resolve;
- Concepts have visible Daily evidence;

Content quality, contradiction resolution, promotion value, and demotion remain LLM
judgment in Reconcile. There is no automatic diagram branch, hot cache, nested index
maintenance, or generic file-source importer in the core.
