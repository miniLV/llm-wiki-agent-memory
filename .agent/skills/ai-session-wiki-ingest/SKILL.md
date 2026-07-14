---
name: ai-session-wiki-ingest
description: Turn one date of local Codex and Claude Code session evidence into one Chinese Daily Wiki page.
---

# AI Session Wiki Ingest

Write Chinese prose while preserving technical names, paths, commands, repo names,
and ticket ids in English.

## Purpose

The Daily workflow has one job:

```text
session logs -> bounded Evidence Snapshot -> one Daily page -> local verify
```

Node handles evidence extraction, Snapshot packing, and lint. The root agent receives
one Snapshot and writes one summary. Do not delegate routine Daily work or split it
into per-card model calls.

The `.capture.json` is a lossy, regenerable Evidence Snapshot; the raw session logs
remain the complete fact source. Priority and noise filtering control evidence density;
Snapshot size is not a business skip condition. `prepare` persists the Snapshot and
returns one metadata JSON line containing its path; it never emits Snapshot bytes.

## Run

1. As the first tool command after reading this skill, run:

   ```bash
   node scripts/daily-memory-workflow.mjs prepare YYYY-MM-DD
   ```

   Run it once with a 30-second blocking wait. If the tool still reports `running`,
   wait once. Never poll or rerun prepare. Do not inspect the helper source; this skill
   and the helper output are the complete run contract.

2. Handle the one-line status:

   - `ready`: read the persisted Evidence Snapshot at the reported `evidenceSnapshot`
     path in non-overlapping chunks of at most 12,000 JavaScript string characters.
     First read only the string length, then read offsets `0`, `12000`, `24000`, and so
     on until the full file has been consumed. Give every chunk-read command enough
     output allowance for one chunk. Never reread a chunk, summarize per chunk, or
     split the work across agents.

     ```bash
     node -e 'const fs=require("fs"); const s=fs.readFileSync(process.argv[1],"utf8"); console.log(s.length)' SNAPSHOT_PATH
     node -e 'const fs=require("fs"); const s=fs.readFileSync(process.argv[1],"utf8"); const start=Number(process.argv[2]); process.stdout.write(s.slice(start,start+12000))' SNAPSHOT_PATH OFFSET
     ```
   - `skipped_no_sources`: leave the Daily unchanged and report skipped.
   - `skipped_with_reason`: leave the Daily unchanged and report its reason.

   Prepare output is metadata-only. Never expect Snapshot JSON after the metadata line,
   and never interpret `includedTurns` / `omittedTurns` as transfer counts; they report
   evidence filtering. If the run cannot continue, report the exact stage and one of
   these reasons instead of the generic `incomplete tool transfer`:

   - `prepare_failed: ...` when the prepare command itself fails;
   - `snapshot_missing: ...` when `evidenceSnapshot` does not exist;
   - `snapshot_unreadable: ...` when the path exists but cannot be read;
   - `snapshot_invalid_json: ...` when the persisted file is not valid JSON;
   - `snapshot_chunk_missing: ...` when a required offset was not read;
   - `snapshot_read_truncated: ...` only when a chunk-read tool explicitly reports
     output truncation.

   Include the Snapshot path, `snapshotBytes` from prepare when available, and the
   original tool error text. Never report a business-level blocked state.

3. Use the complete ordered chunks from step 2 as the only synthesis input. Do not read
   any chunk again or open raw session JSONL, an existing Daily, automation memory,
   global memory, or prior agent runs. Omitted older turns are an expected cost-control
   result, not a reason to stop.

4. In one synthesis pass, write exactly
   `wiki/sources/ai-chats/YYYY-MM-DD.md` using the schema and template included in the
   Snapshot. Do not create any other knowledge page.

5. Run once:

   ```bash
   node scripts/daily-memory-workflow.mjs verify YYYY-MM-DD
   ```

   Use the same blocking-wait rule. If verification reports a mechanical formatting
   error, make at most one targeted correction and verify once more. If it still fails,
   leave the run as `skipped_with_reason`; do not broaden evidence reads or call it
   blocked. Do not read or edit `wiki/log.md`; verify owns lint, diff, status, and
   logging.

## Compile The Daily

- Group by workstream and final outcome, not transcript chronology.
- Preserve substantive goals, root causes, decisions, rejected options, verified
  results, blockers in the underlying work, and unresolved follow-ups.
- Omit routine tool narration, polling, acknowledgements, and repeated status updates.
- Every `###` topic under `关键会话` starts with one to three representative links
  to Evidence Cards from the Snapshot:

  ```markdown
  - 证据来源：[Codex · codex-...](../../../.vault-meta/captures/ai-chats/YYYY-MM-DD.capture.json#codex-...)
  ```

- Never link a card to a claim it does not support. The linked Snapshot card retains
  the original session path for later audit.
- If evidence is incomplete because older turns were omitted, state only what
  the Snapshot supports and lower `confidence` when appropriate. Do not invent missing
  detail and do not open another source.
- `detailed` preserves all valuable supported information in the Snapshot.
  `concise` shortens prose, not factual accuracy.
- A day with no substantive work may be `skipped_with_reason: no high-signal work`
  instead of producing an empty Daily.

## Cost Boundary

The normal path is exactly one prepare, the minimum number of non-overlapping Snapshot
chunk reads, one synthesis/write, and one verify. Do not issue separate model turns for
individual chunks, lint, diff, status, logging, or progress narration; the Node helper
owns the mechanical steps.

## Report

Report:

- the date and whether the result was written or skipped;
- Evidence Snapshot path and Evidence Card count;
- included and omitted turn counts from prepare;
- prepare status and Snapshot read status, including the exact failure stage and reason
  when skipped;
- Daily path when written;
- verification result;
- confirmation that no git commit was made.
