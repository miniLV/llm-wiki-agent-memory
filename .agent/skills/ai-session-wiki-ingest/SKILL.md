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
session logs -> canonical Capture -> bounded packet -> one Daily page -> local verify
```

Node handles capture, packet packing, and lint. The root agent reads one packet and
writes one summary. Do not delegate routine Daily work or split it into per-card
model calls.

The versioned `.capture.json` is complete machine evidence. The packet is a temporary
model view capped at 96 KiB. When all compact turns do not fit, Node removes
lower-scored turns first while retaining every Evidence Card's identity and source.
The complete Capture is not deleted or shortened.

## Run

1. As the first tool command after reading this skill, run:

   ```bash
   node scripts/daily-memory-workflow.mjs prepare YYYY-MM-DD --emit-packet
   ```

   Run it once with a 30-second blocking wait. In Codex, give both the outer
   `functions.exec` call and its nested `exec_command` a
   `max_output_tokens: 100000` allowance. If the tool still reports `running`, wait
   once. Never poll or rerun prepare. Do not inspect the helper source; this skill and
   the helper output are the complete run contract.

2. Handle the one-line status:

   - `ready`: consume the packet that follows.
   - `skipped_no_sources`: leave the Daily unchanged and report skipped.
   - `skipped_with_reason`: leave the Daily unchanged and report its reason.

   A complete packet ends with
   `--- END SYNTHESIS PACKET cards=... included_turns=... omitted_turns=... ---`.
   The inline text `[field compacted locally]` only means one long field was shortened
   by Node; it is not a transport failure. If the tool reports
   `Warning: truncated output`, or if the final packet marker is absent, report
   `skipped_with_reason: incomplete tool transfer`. Never report a business-level
   blocked state.

3. Use the emitted packet as the only synthesis input. Do not read the canonical
   Capture, raw session JSONL, an existing Daily, automation memory, global memory, or
   prior agent runs. Omitted lower-priority turns are an expected cost-control result,
   not a reason to stop.

4. In one synthesis pass, write exactly
   `wiki/sources/ai-chats/YYYY-MM-DD.md` using the schema and template included in the
   packet. Do not create any other knowledge page.

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
  to Evidence Cards from the packet:

  ```markdown
  - 证据来源：[Codex · codex-...](../../../.vault-meta/captures/ai-chats/YYYY-MM-DD.capture.json#codex-...)
  ```

- Never link a card to a claim it does not support. The linked Capture card retains
  the original session path for later audit.
- If evidence is incomplete because low-priority turns were omitted, state only what
  the packet supports and lower `confidence` when appropriate. Do not invent missing
  detail and do not open another source.
- `detailed` preserves all valuable supported information in the packet.
  `concise` shortens prose, not factual accuracy.
- A day with no substantive work may be `skipped_with_reason: no high-signal work`
  instead of producing an empty Daily.

## Cost Boundary

The normal path is one prepare, one synthesis/write, and one verify. Target 3-5 root
model continuations and never exceed 6. Do not issue separate model turns for lint,
diff, status, logging, or progress narration; the Node helper owns those mechanical
steps.

## Report

Report:

- the date and whether the result was written or skipped;
- Capture path and Evidence Card count;
- included and omitted turn counts from prepare;
- Daily path when written;
- verification result;
- confirmation that no git commit was made.
