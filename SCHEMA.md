# Schema

This repository follows the LLM Wiki model:

```text
External agent sessions -> Capture inbox -> Daily backup -> Reviewed Concepts
```

`SCHEMA.md` is the single owner of the memory model. Skills define procedures and
boundaries, templates define page shape, and lint only enforces deterministic parts
of this schema. Do not copy domain rules into those files.

## Layout

```text
wiki/
  index.md                         # stable query router
  log.md                           # concise write log
  sources/ai-chats/YYYY-MM-DD.md   # one compiled Daily page per date
  concepts/*.md                    # reusable knowledge
  guardrails/Agent Behavior Rules.md
  templates/Daily AI Chat Summary Template.md

.vault-meta/
  captures/ai-chats/YYYY-MM-DD.md  # regenerable evidence inbox
  reviews/                         # local lint/reconcile reports
```

Raw Codex and Claude Code session logs remain in their original locations and are
read-only source of truth. The capture inbox is a deterministic staging file, not
durable knowledge. Daily pages are the default evidence surface for queries.

## Daily Wiki

Every `wiki/sources/ai-chats/YYYY-MM-DD.md` page has exactly these frontmatter
fields:

```yaml
date: YYYY-MM-DD
lookup_keys: []
confidence: high | medium | low
contains_vault_answer: false
```

- `lookup_keys` is the only lookup metadata list. Put ticket ids, repos, feature
  aliases, tools, important paths, functions, and versions here when useful. Do not
  maintain parallel `tickets`, `features`, `repos`, or `tools` fields.
- `confidence` describes the quality of the compiled Daily page, not certainty that
  every assistant statement is true.
- `contains_vault_answer` is `true` when any captured session for the page contains
  an answer materially derived from this vault.

The body has three sections: `摘要`, `关键会话`, and `可复用经验`. It should preserve
decisions, evidence, rejected options, outcomes, and unresolved work without copying
the full transcript.

Each `###` topic under `关键会话` owns its provenance. Its first content line is
`- 证据来源：` followed by one or more Markdown links to the exact Evidence Cards in
the dated capture, for example:

```markdown
### Runtime verification

- 证据来源：[Codex · codex-019f...](../../../.vault-meta/captures/ai-chats/2026-07-13.md#codex-019f...)
```

Do not put original session paths or a page-wide source list in Daily frontmatter.
The linked capture card records its stable Evidence ID, `Agent: Codex` or
`Agent: Claude Code`, and the original session path. This gives the audit chain
`Daily topic -> capture Evidence Card -> original session` without making a Daily
look as if it was compiled directly from raw JSONL. A topic may cite multiple cards
when they materially support the same workstream, but it must not cite unrelated
cards merely because they occurred on the same date.

A Daily page is backup evidence, not effective reusable knowledge. Its `可复用经验`
section contains unreviewed candidates only; query must not present them as reusable
guidance unless Reconcile has promoted the claim into a Concept.

## Anti-echo Provenance

Vault-backed query answers end with this hidden marker:

```html
<!-- llm-wiki-memory:derived -->
```

Capture removes the marker from displayed text and sets a binary derived flag. Daily
copies the aggregate flag to `contains_vault_answer`; it does not maintain origin
states, origin counts, or per-item origin labels.

A Daily page with `contains_vault_answer: true` is useful context but is not
automatically independent evidence for promotion. Reconcile may use it only after an
independent Daily page supports the claim or the relevant original session evidence
is explicitly verified. Independent evidence may come from distinct workstreams in
the same repo; it does not require cross-repo repetition. This conservative
page-level rule intentionally trades some promotion recall for a much smaller state
model.

## Reviewed Concepts

A concept explains a reusable pattern, its trigger, why it matters, how a future
agent should apply it, and links to supporting Daily pages. Update an existing
concept before creating a near-duplicate.

Reconcile is the only writer of effective reusable knowledge. Promote a Daily
candidate only when independent evidence from distinct workstreams shows actionable
value beyond the current task, including when those workstreams are in the same
repo, and it does not merely restate `SCHEMA.md`, a skill, README, or an existing
Concept. Self-referential workflow output is backup evidence, not independent
promotion evidence.

`wiki/guardrails/Agent Behavior Rules.md` is retained as a compatibility placeholder.
This repository does not generate behavior rules; Reconcile writes Concepts only.

There is no trigger taxonomy, hot cache, per-folder index, or automatic visual layer.
Diagrams may be created only when a user explicitly requests one; searchable text
remains canonical.

## Write And Read Contracts

- Daily writes one dated page and appends `wiki/log.md`.
- Reconcile runs deterministic lint, then may update reviewed concepts and
  `wiki/log.md`. It does not create behavior rules or a weekly summary layer.
- `wiki/index.md` is stable routing documentation, not a growing key database.
- Query lists or exact-searches Daily and concept files at runtime. Current-state
  and date-range questions may use Daily pages as historical evidence. Reusable
  guidance comes only from reviewed Concepts.
- Query is read-only. It does not write answers back into the vault.
- Daily may open the requested-date slice of an original session when the capture
  reports truncated text, a missing final outcome, or conflicting high-signal
  evidence. Query and Reconcile otherwise open original logs only for exact output,
  disputed evidence, or an explicit audit.

Only `engineering-memory-loader` is exposed globally. Daily and reconcile remain
repo-local workflows invoked by manual or scheduled runs. Scheduling is external;
currently Codex App Automations is the supported scheduled writer.
