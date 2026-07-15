# Agent Instructions

This repo is an agent memory starter for a local Obsidian-style engineering memory vault.

`SCHEMA.md` is the only owner of the memory model. Do not redefine its field
semantics, promotion rules, or retrieval model in repo instructions or skills;
templates may mirror page shape only.

Use `.agent/skills/` for repo-local workflows and the single exported query skill:

- `agent-memory-setup`: repo-local end-to-end installer; when the user asks to
  install, set up, configure, bootstrap, repair, or one-click install this repo,
  read this skill. For a generic install request, run its read-only preflight and
  ask once whether to perform the full setup. An affirmative follow-up authorizes
  immediate non-interactive local setup plus Codex App automations. A clone below
  the current Codex project uses that containing project for automation targeting;
  the clone itself does not need to be registered as a separate project.
- `agent-memory-uninstall`: repo-local safe uninstaller; when the user asks to
  uninstall, remove, disable, or purge this installation, read this skill,
  confirm once, remove matching Codex automations with the official tool, and
  remove only global skill links owned by this repository. Preserve wiki memory
  unless the user separately chooses to delete the repository checkout.
- `ai-session-wiki-ingest`: repo-local Daily workflow; not globally exposed.
- `agent-memory-reconcile`: repo-local periodic workflow; not globally exposed.
- `engineering-memory-loader`: thin read-only adapter around
  `claude-obsidian/wiki-query`; the only skill exposed to other repos.

Do not store growing memory in `AGENTS.md`.

Do not make the local configuration UI part of the normal Agent installation
path. Keep it as an optional status, diagnostics, and recovery surface.

Keep skills procedural and narrow. Prefer `claude-obsidian/wiki-query` for generic
query behavior; this repo owns session capture, one-page Daily output, reconciliation
policy, vault routing, and read-only engineering lookup.
