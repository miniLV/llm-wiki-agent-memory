---
name: ai-session-wiki-ingest
description: Turn one date of local Codex and Claude Code session evidence into one Chinese Daily Wiki page. Use for scheduled or manual daily memory runs in this repository.
---

# AI Session Wiki Ingest

Write Chinese prose while preserving technical names, paths, commands, repo names,
and ticket ids in English.

## Thin Upstream Contract

Borrow only these editorial principles from Claude Obsidian's `wiki-ingest` design:
read the routed source instead of skimming it, digest each source before batch
merging, preserve contradictions, and synthesize durable takeaways instead of
transcribing.

Do not load or execute the upstream `wiki-ingest` workflow during a Daily run. Its
generic page-fan-out contract is outside this repository's single-writer model:

- The capture inbox is a routing catalog and turn-aware digest, not the source of
  truth. Original session files remain immutable source evidence.
- Write exactly one Daily page plus `wiki/log.md`.
- Do not create entities, concepts, domains, overview pages, indexes, hot caches,
  manifests, addresses, or generic ingest fan-out.
- Do not ask the user to review every source during an automation run.

## Run

1. Read `SCHEMA.md` completely. It is the only memory-model authority.
2. Read `.vault-meta/config.json` when present. Use its `dailySummaryDetail` value;
   valid values are `concise` and `detailed`, with `detailed` as the default.
3. Run `node scripts/capture-ai-chats.mjs YYYY-MM-DD` for the requested local date.
4. Read `.vault-meta/captures/ai-chats/YYYY-MM-DD.md` as evidence, not conclusions.
5. If no session evidence matched, do not create an empty Daily page; report skipped.
6. Compile a fresh candidate from the newly generated capture. Open requested-date
   raw slices only under the Drill Down conditions below. Do not read the existing
   Daily page or prior agent output until this fresh coverage pass is complete.
7. Only then read the existing dated page, when present, as a regression baseline.
   Re-verify any retained fact against the current capture or its original session.
8. Write or update exactly one page: `wiki/sources/ai-chats/YYYY-MM-DD.md`.
9. Append one concise operation entry to `wiki/log.md`.

Use `wiki/templates/Daily AI Chat Summary Template.md` for page shape. Copy the
capture-level derived flag into the Daily frontmatter exactly as defined by
`SCHEMA.md`. Do not add fields outside that schema.

## Fresh-Run Evidence Boundary

The current run's capture and the original session paths listed by that capture are
the only source evidence. A previous Daily page is comparison state, not evidence.

Do not search prior Codex or Claude agent runs for a generated Daily body, prompt,
patch, coverage ledger, or reconcile result. Never copy or replay such output as a
shortcut. Open an older session file only when the current capture explicitly lists
that exact file as requested-date source evidence.

If an existing Daily page contains supported high-signal facts that the fresh
candidate missed, complete the candidate before publishing. If you cannot establish
that the candidate preserves the current coverage ledger and does not regress source
traceability, leave the existing page unchanged and report the run as blocked instead
of replacing it with a shorter fallback.

## Compile The Day

### 1. Inventory Before Summarizing

Read every evidence card, not only the capture summary or the first few cards. Build a
scratch coverage ledger with: Evidence ID, Agent, source file, workstream, final
state, must-keep facts, and either the destination Daily topic or an explicit skip
reason. Do not persist this ledger as a new Wiki layer.

A high-signal workstream includes any substantive root-cause investigation,
implementation or delivery, decision with alternatives, user correction, failed then
fixed flow, verified result, commit/push, blocker, or unresolved follow-up. `low_signal`
and `self_referential` are reasons to inspect or skip a card, not reasons to ignore the
rest of the capture.

Treat `delegated outcome` lines as supporting evidence inside their parent workstream:
preserve a unique finding, but do not create a duplicate topic when the parent already
states the same result.

### 2. Drill Down When The Digest Is Insufficient

Use each card's conversation counts and outcome fields. Read the original session's
requested-date slice before concluding when any of these apply:

- `Highlight text truncated` is `true` and the card is high-signal.
- `User turns without final outcome` is greater than zero for a high-signal card.
- The highlights contain conflicting, changing, or incomplete final states.
- A root cause, implementation result, delivery status, or blocker cannot be stated
  with its supporting evidence from the card alone.

Do not copy raw JSONL or a full transcript into the Wiki. The purpose of drill-down is
to recover the decision chain and final outcome, not to make the Daily verbose.

### 3. Compile By Workstream

Apply the configured detail level without changing evidence coverage:

- `detailed` (default) extracts all valuable supported information. Preserve the
  relevant context, decision chain, evidence changes, rejected options,
  failure-to-fix transitions, final verification, downstream impact, blockers, and
  unresolved follow-ups. For a normal high-signal day, use roughly 1,200 words as the
  baseline, not a cap or a quota: write more when evidence requires it, and write less
  only when the day's evidence genuinely cannot support that depth.
- `concise` compresses the prose only. Both levels cover the same high-signal
  workstreams; neither may omit valuable evidence merely to reduce length or include
  routine tool narration and unsupported detail.

- Write by workstream and final outcome, not as a chronological activity log. Omit
  routine progress narration, tool chatter, and intermediate steps that do not change
  the decision, evidence, final state, or follow-up.
- Each `关键会话` topic must make the problem or goal, decisive evidence or reasoning,
  final outcome, and impact or unresolved follow-up recoverable from the prose. Do not
  replace these with a list of actions performed.
- Preserve the important workstreams, decisions, evidence changes, rejected options,
  outcomes, blockers, and unresolved follow-ups.
- Every high-signal workstream in the coverage ledger must appear in `摘要` or
  `关键会话`; never discard one merely to keep the page short.
- Group related sessions only after the coverage pass. Group by stable workstream,
  ticket, feature, or repo, while keeping independent outcomes separate.
- Prefer the latest verified state over an earlier intermediate state. When a failure
  later became a fix, preserve the transition and the final verification.
- Give a completed root-cause investigation, shipped change, or unresolved blocker
  enough context to answer a later “what happened and why?” query without reopening
  raw logs.
- Keep exact ids, repo names, aliases, functions, commands, paths, tools, and versions
  in body text and `lookup_keys` when they will help later retrieval.
- Do not put original session paths or a page-wide source list in Daily frontmatter.
- Under every `###` topic in `关键会话`, make the first content line
  `- 证据来源：` with one or more Markdown links to the exact supporting Evidence
  Card anchors in `.vault-meta/captures/ai-chats/YYYY-MM-DD.md`. Label every link
  with the card's `Agent` (`Codex` or `Claude Code`) and stable
  Evidence ID. Cite only cards that materially support that topic; do not attach the
  whole day's card list to every topic.
- Keep the original session path only in the capture card. The required audit chain
  is `Daily topic -> capture Evidence Card -> original session`.
- Put a lesson in `可复用经验` only when it may help a future task. It remains backup
  evidence and an unreviewed candidate; query must not consume it as effective
  reusable guidance. This workflow never creates concepts or behavior rules.
- Use capture images only as evidence while compiling text. Do not automatically
  promote images, generate Mermaid, or create JSON Canvas files. Visual output is a
  separate, explicit user request.

## Boundaries

- Do not modify raw session logs.
- Do not copy full transcripts or raw JSONL into the Wiki.
- Do not create entity pages, concept pages, weekly summaries, lookup databases, hot
  caches, or per-folder indexes.
- Do not write `Agent Behavior Rules.md`.
- Do not invent claims unsupported by the capture.
- Do not include private starter examples in tracked files.

## Verify

After writing the candidate, run `node scripts/wiki-lint.mjs --strict`. A Daily run
is not successful until strict lint passes. If lint reports `daily-detailed-depth` or
`daily-detailed-coverage`, revise the candidate from the current run's coverage
ledger and permitted evidence, then run strict lint again. If it still cannot pass,
restore the previous Daily page (or remove the new candidate when no page existed),
leave `wiki/log.md` without a success entry, and report the run as blocked. Never
silently deliver a shallow page or claim success from the non-strict lint report.

- The page uses only the Daily frontmatter and three body sections defined by
  `SCHEMA.md`.
- Compare the final page with the scratch coverage ledger: every high-signal
  workstream is covered and every skipped card has a defensible low-signal reason.
- For `detailed`, confirm that all valuable supported information in the coverage
  ledger is present. Treat roughly 1,200 words as the normal baseline; if the page is
  materially shorter, verify that this is caused by genuinely sparse evidence and
  report that reason instead of silently publishing a compressed Daily.
- Every `关键会话` topic links its exact supporting capture Evidence Card(s), the
  link labels identify Codex or Claude Code, and each linked card contains the
  original session path.
- The page contains enough problem, conclusion, evidence, and impact context for a
  normal query without reopening raw logs.
- The page is organized around useful outcomes rather than chat chronology or a
  sequence of commands and progress updates.
- Root cause, failure-to-fix transitions, final verification, commits/pushes,
  blockers, and unresolved work are not replaced by earlier intermediate status.
- Use `confidence: high` only when all high-signal cards were covered and every
  material truncation, outcome gap, or contradiction was resolved. Otherwise use
  `medium` or `low` and state the gap in the body.
- The derived flag matches the capture inbox.
- `wiki/log.md` records the write or the run was explicitly reported as skipped.
- Report the evidence-card count, covered high-signal workstreams, explicit skips,
  raw-session drill-down count, and final output path so a batch orchestrator can
  detect a bypassed coverage pass.
