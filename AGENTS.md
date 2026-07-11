# Agent Instructions

This repo is an agent memory starter for a local Obsidian-style engineering memory vault.

`SCHEMA.md` is the only owner of the memory model. Do not redefine its field
semantics, promotion rules, or retrieval model in repo instructions or skills;
templates may mirror page shape only.

Use `.agent/skills/` for repo-local workflows and the single exported query skill:

- `ai-session-wiki-ingest`: repo-local Daily workflow; not globally exposed.
- `agent-memory-reconcile`: repo-local periodic workflow; not globally exposed.
- `engineering-memory-loader`: thin read-only adapter around
  `claude-obsidian/wiki-query`; the only skill exposed to other repos.

Do not store growing memory in `AGENTS.md`.

Keep skills procedural and narrow. Prefer `claude-obsidian/wiki-query` for generic
query behavior; this repo owns session capture, one-page Daily output, reconciliation
policy, vault routing, and read-only engineering lookup.
