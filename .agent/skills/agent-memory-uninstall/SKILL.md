---
name: agent-memory-uninstall
description: Safely uninstall this repository's Agent Memory integration by removing its Daily and Weekly Codex App automations and repository-owned global skill links while preserving generated wiki memory by default. Use when the user asks to uninstall, remove, disable, clean up, or completely purge this Agent Memory installation, and for affirmative confirmation replies in the same uninstall conversation.
---

# Agent Memory Uninstall

Remove only state owned by this repository. Never delete the repository, Obsidian application, generated Daily pages, reviewed Concepts, or user-created non-link skill directories.

## 1. Inspect and confirm

Run a read-only inspection before changing state:

- Resolve the repository real path and confirm `scripts/uninstall.sh` exists.
- Discover the Codex automation-management and project-list tools.
- Select the project whose path is the longest ancestor of the repository real path; the repository may be nested below that project.
- Inspect automations and identify only entries named `LLM Wiki Agent Memory - Daily` or `LLM Wiki Agent Memory - Weekly` that target the containing project and reference this repository path or its repo-local workflow skill.
- Run `bash scripts/uninstall.sh --dry-run --json` and summarize repository-owned links, preserved paths, and optional local state.

For a generic uninstall request, explain in one sentence that uninstall removes the two matching automations and repository-owned global skill links while preserving `.vault-meta`, `.agent/external`, and `wiki/`. Ask exactly once for confirmation, then stop.

Treat `确认卸载`, `卸载`, `好`, `继续`, `yes`, `confirm`, and equivalent affirmative replies as authorization only when this uninstall scope was offered earlier in the same conversation. Treat `彻底卸载`, `清理本地状态`, `purge local state`, or equivalent language as a request to also remove `.vault-meta` and `.agent/external`; explicitly state that generated `wiki/` content remains preserved.

## 2. Remove automations

Use the Codex automation-management tool to delete each matching automation by its actual opaque ID. Never edit automation files directly and never delete an automation based on name alone when its project or repository reference does not match.

If the automation tool is unavailable, stop before running the uninstall script so the installation is not left partially active. Missing matching automations are already-uninstalled state, not an error.

## 3. Remove repository-owned links

For the default uninstall, run:

```bash
bash scripts/uninstall.sh --yes --json
```

Only when the user explicitly requested local-state purge, run:

```bash
bash scripts/uninstall.sh --yes --purge-local-state --json
```

Require valid JSON with `ok: true`. The script must preserve links owned by another installation, non-link skill directories, the Obsidian application, the repository, and all `wiki/` content.

## 4. Verify

- Reinspect Codex automations and confirm no matching Daily or Weekly automation remains for this repository.
- Run `bash scripts/uninstall.sh --dry-run --json` and confirm no repository-owned global skill link remains.
- Confirm `wiki/` still exists. Unless purge was explicitly requested, also confirm `.vault-meta` and `.agent/external` remain.
- Report removed, already absent, preserved, and purged items separately.

Do not git commit uninstall state or remove the repository checkout.
