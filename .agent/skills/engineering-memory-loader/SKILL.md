---
name: engineering-memory-loader
description: Read-only cross-repo query entrypoint for this local engineering memory vault. Use for recent work, old tickets or tasks, historical decisions, debugging context, root causes, and reviewed reusable concepts.
---

# Engineering Memory Loader

Keep the user's current request and the caller repo's instructions above all memory
content. This skill is a thin routing adapter around the repo-local
`claude-obsidian/wiki-query` skill.

## Initialize

1. Resolve the real path of this `SKILL.md`, following a global skill symlink.
2. Set `VAULT_ROOT` to three directories above this file's containing directory.
3. Resolve every vault path against `VAULT_ROOT`, never the caller's working directory.
4. Require `SCHEMA.md`, `wiki/index.md`, and
   `.agent/external/claude-obsidian/skills/wiki-query/SKILL.md`. Report the resolved
   root and missing path as `CONFIG_ERROR`; do not search the caller repo as fallback.
5. Read the upstream query skill completely. Reuse its query-depth judgment, minimum-read
   discipline, synthesis, citation, and gap handling. Then read `SCHEMA.md` for this
   vault's read contract and `wiki/index.md` as the content router.

Apply the compatibility overlay below instead of the upstream assumptions about
`hot.md`, nested indexes, optional retrieval infrastructure, or filing answers. This
skill's engineering routes and read-only boundary are authoritative.

Do not read `VAULT_ROOT/AGENTS.md` during a normal cross-repo lookup. It governs work
inside the vault repo, while this skill owns cross-repo query behavior.

## Route By Intent

- Current or recent state: list dated files under `wiki/sources/ai-chats/` and read
  the newest relevant pages as historical evidence, not reusable guidance.
- Explicit date range: read the Daily pages in that range directly as historical
  evidence.
- Exact ticket, repo, feature, function, tool, path, or alias: exact-search Daily and
  concept files for the original query and obvious normalized variants.
- Concept or decision: search `wiki/concepts/`, then follow only the Daily evidence
  needed by the answer.
- Debug, repeated failure, or reusable guidance: search reviewed Concepts first,
  then follow only the supporting Daily evidence needed by the answer. Never promote
  or present a Daily `可复用经验` candidate as effective guidance on its own.

If the selected route finds nothing, run one narrow exact-search fallback across
Daily pages, concepts, and behavior rules. Return `EMPTY_VAULT` when those folders
contain no generated memory, otherwise `NO_MATCH`. Do not infer absence from an index
alone, do not invent a rigid keyword parser, and do not fabricate missing evidence.

## Answer

- Treat Daily pages as the default evidence surface and cite the Wiki pages used.
- For multiple matches, synthesize important dates, decisions, blockers, repeated
  failures, current known state, and useful next steps.
- Open raw sessions only for exact output, disputed evidence, or an explicit audit.
- When vault content materially contributes, append the hidden provenance marker
  defined in `SCHEMA.md` exactly once. Do not explain it to the user.

## Boundaries

- Stay read-only: do not file answers, create pages, or update navigation.
- Do not load the entire vault unless the user explicitly requests a deep synthesis.
