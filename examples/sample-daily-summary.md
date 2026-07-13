---
date: 2099-01-01
lookup_keys: [sample-feature, sample-repo, old behavior, source map, running bundle]
confidence: high
contains_vault_answer: false
---

# 2099-01-01 AI 协作总结

## 摘要

今天围绕 Sample Feature 的浏览器旧行为问题做了排查。关键结论是：源码变化不等于运行时 bundle 已更新，debug 时需要先验证浏览器实际加载的产物。

## 关键会话

### Sample Feature：浏览器仍加载旧 bundle

- 证据来源：[Codex · codex-00000000-0000-0000-0000-000000000000](../../../.vault-meta/captures/ai-chats/2099-01-01.md#codex-00000000-0000-0000-0000-000000000000)
- 用户反馈已经修改源码，但浏览器仍显示旧行为。
- Agent 先检查构建输出、source map 和 dev server 状态，再回到源码推理。
- 最终发现本地 dev server 仍在提供旧 bundle。

## 可复用经验

- [[Runtime Artifact Verification]]：当 UI 行为和源码不一致时，先确认运行时 artifact、source map、dev server、cache，再推理业务逻辑。
