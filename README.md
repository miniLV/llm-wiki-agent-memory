# LLM Wiki Agent Memory

把 Codex / Claude Code 的本机会话编译成一个小型、可查询、可审计的本地
Markdown Wiki。

[English](README.en.md)

## 解决什么问题

- Agent 忘记最近做过什么，重复调查同一问题。
- 工程决定和 debug 证据散落在 session 里，无法按 ticket、repo、功能或时间找回。
- `AGENTS.md` 不适合承载持续增长的个人历史。
- 需要本地私有记忆，但不想先引入向量库或复杂 RAG。

## 核心链路

```text
Codex / Claude Code session logs
  -> deterministic capture inbox
  -> one Daily backup page per date
  -> periodic lint + reconcile
  -> reviewed reusable Concepts
  -> read-only engineering-memory-loader
```

三层各自只做一件事：

- Capture 保留可重建的 session evidence，不写结论。
- Daily 把一天的会话编译成事实备份和未审查候选，不直接作为经验生效。
- Reconcile 二次 review，只把有独立证据和行动价值的经验晋升为 concept。

原始 session 始终留在本机原位置，是 source of truth。

![LLM Wiki Agent Memory 飞轮](docs/agent-memory-loop-flywheel.png)

## 简化后的设计边界

- `SCHEMA.md` 是唯一领域规则源；skills 只写步骤和边界，template 只写页面形状。
- Daily frontmatter 只有一组最小字段，详见 [SCHEMA.md](SCHEMA.md)。ticket、feature、repo、tool 等都收敛到一个 `lookup_keys` 列表。
- provenance 只有一个布尔值。只要页面包含 Vault 派生回答，就不会自动作为独立晋升证据。
- 不维护 `hot.md`、多级 `_index.md`、Guardrail Trigger taxonomy 或自动 Canvas。
- 图只在用户明确要求时生成；可检索文字始终是主记录。
- 当前只采集 Codex 与 Claude Code session logs。通用文件夹导入不属于这个版本的核心。

## 三个 workflow

| Skill | 职责 | 可见范围 |
|---|---|---|
| `ai-session-wiki-ingest` | 采集指定日期并写一页 Daily Wiki | repo-local |
| `agent-memory-reconcile` | 二次 review、合并和晋升 Concepts，不生成 Behavior Rules | repo-local |
| `engineering-memory-loader` | 跨 repo 只读查询历史知识 | 全局暴露 |

Daily 和 Weekly 只是调度频率，不是新的记忆层。当前定时 writer 只支持 Codex App
Automations；session source 仍同时支持 Codex 和 Claude Code。

## 快速开始

```bash
git clone https://github.com/miniLV/llm-wiki-agent-memory.git
cd llm-wiki-agent-memory
bash scripts/config-ui.sh --open
```

设置流程会：

1. 一键安装推荐环境：Obsidian App、通用 Obsidian Skills 和 Claude Obsidian。
2. 把 `engineering-memory-loader` 软链接到 Codex skills 目录。
3. 确认 Codex / Claude Code session sources。
4. 帮你在 Codex App 中创建 daily / weekly Automations。

Obsidian App 和通用 Obsidian Skills 都是推荐但非必需的增强项。首次设置会一并
安装，减少新手需要理解和手动选择的步骤，但它们不参与核心 pipeline ready gate：

- 推荐安装 Obsidian App，以便更方便地浏览、编辑 Markdown 和双链。
- 需要 Obsidian CLI、Canvas、Bases 等能力时，再安装通用 Obsidian Skills。

即使两者都不安装，会话采集、Daily backup、Concept review 和只读查询仍可运行。

## 平时怎么用

设置完成后，让 Automations 维护 Daily / Concepts。之后在任意业务 repo 直接问：

```text
帮我查一下最近一周主要做了什么
ABC-123 之前做过哪些决定
这个功能以前遇到过什么问题
我改了源码但运行仍是旧行为，按历史经验帮我排查
```

Loader 从自身真实路径解析 Vault，读取 `wiki/index.md`，再按意图读取日期页中的历史
事实或 weekly review 后的 concept。Daily 的 `可复用经验` 只是候选，不会单独作为经验
生效。Loader 不会读取业务 repo 之外的 `AGENTS.md`，也不会把回答写回 Wiki。

## 当前支持范围

| 类型 | 当前支持 |
|---|---|
| Session sources | Codex：`~/.codex/sessions/`、`~/.codex/archived_sessions/`；Claude Code：`~/.claude/projects/` |
| Scheduled writer | Codex App Automations；同一个 Vault 保持 single writer |
| Query | 时间范围、精确 key、concept / decision、debug / repeated failure |
| Storage | 本地 Markdown；原始 JSONL 不复制进 Vault |

Capture 会把 session 内图片临时提取到 gitignored 的 `.vault-meta/captures/assets/`，供
Daily 编译时查看；不会自动晋升图片或生成图。

## 目录

```text
.agent/skills/
  ai-session-wiki-ingest/
  agent-memory-reconcile/
  engineering-memory-loader/

scripts/
  capture-ai-chats.mjs
  wiki-lint.mjs
  setup.sh

wiki/
  index.md
  log.md
  sources/ai-chats/
  concepts/
  guardrails/Agent Behavior Rules.md
  templates/Daily AI Chat Summary Template.md
```

本地 capture、配置和 review 写入 `.vault-meta/`，该目录不会进入 git。生成的 Daily
Wiki 可能包含私有项目记忆；公开 starter repo 前请检查内容。

## 灵感来源

项目源自 [Andrej Karpathy 的 LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)：
把 external sources 编译成由 LLM 维护的 Wiki，并用小型 Schema 约束写入、查询和
维护。本项目只增加 agent session 所需的 capture inbox、Daily 压缩层和防回声标记。
