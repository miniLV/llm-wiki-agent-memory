---
name: agent-memory-reconcile
description: Review recent Daily backup pages and promote only valuable reusable concepts. Use for scheduled or manual weekly memory maintenance in this repository.
---

# Agent Memory Reconcile

Write Chinese prose while preserving technical names, paths, commands, repo names,
and ticket ids in English. This workflow is periodic maintenance, not a weekly report.

## Run

1. Read `SCHEMA.md` completely. It is the only memory-model authority.
2. Run `node scripts/wiki-lint.mjs`, then read
   `.vault-meta/reviews/wiki-lint-latest.md`.
3. Read the latest seven dated pages under `wiki/sources/ai-chats/` by default.
4. Derive the current review from those Daily pages. Existing concepts and behavior
   rules are update targets, not independent evidence.
5. Fix deterministic errors before making judgment calls.
6. Apply the concept, promotion, provenance, and rule-cap definitions from
   `SCHEMA.md`; update existing knowledge before creating parallel pages.
7. Do not modify `wiki/guardrails/Agent Behavior Rules.md`; this repository consumes
   reviewed Concepts and does not generate behavior rules.
8. Append a concise audit entry to
   `.vault-meta/reviews/Agent Memory Reconcile Reviews.md` and an operation entry to
   `wiki/log.md`.

Escalate to original sessions only when a decision depends on disputed or insufficient
Daily evidence, and record why.

Do not search prior Codex or Claude agent runs for a generated reconcile answer,
concept/rule patch, or earlier promotion decision. Never replay one as the current
review. Recompute candidates from the current seven Daily pages and use existing
knowledge only to merge, update, or avoid duplication.

## Boundaries

- Do not modify raw session logs.
- Do not create a weekly summary, trigger taxonomy, hot cache, per-folder index,
  lookup database, Canvas, or automatic diagram.
- Do not promote a Daily candidate that merely repeats `SCHEMA.md`, a skill, README,
  an existing Concept, or the memory workflow's own output.
- Do not create or edit skills unless the user explicitly asks.
- Do not promote a claim merely because the memory loop repeated it; require
  distinct independent workstreams and a concrete future action that the Concept
  changes. Independent workstreams may be within the same repo; cross-repo evidence
  is not required.

## Verify

- Lint completed and its Markdown report was read.
- New or updated concepts link to Daily evidence.
- Provenance, promotion, and rule-cap decisions follow `SCHEMA.md`.
- The review was freshly derived from the current Daily window rather than copied
  from a prior agent run.
- The reconcile audit and `wiki/log.md` state what changed, what was skipped, and any
  escalation reason.
