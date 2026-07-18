# AI 编程助手总是失忆？我做了一个纯 Markdown 的本地工程记忆库

> 项目地址：https://github.com/miniLV/coding-agent-memory

最近我在同时使用 Codex 和 Claude Code 写项目时，越来越频繁地遇到一个问题：**Agent 很聪明，但它不记得我们一起做过什么。**

一个 bug 上周已经定位过，换个 session 又从头排查；一个架构决定讨论了半天，下次改动时却只能靠人重新讲一遍；更麻烦的是，真正有价值的命令、失败原因和边界条件，全都散落在一堆 JSONL 会话里。

所以我做了 **Coding Agent Memory**：把 Codex / Claude Code 的本机会话整理成可查询、可审计的 Markdown Wiki，并在下一次任务中按需带回 Agent。

它不需要向量数据库，也不把私人会话上传到云端。

![项目演示](https://raw.githubusercontent.com/miniLV/coding-agent-memory/master/docs/assets/demo.gif)

## 1. 真正的问题不是“没有上下文”，而是上下文不会沉淀

很多 AI 编程工具已经支持项目指令、Rules 和 `AGENTS.md`。但这些文件适合放稳定规则，不适合无限增长的工程历史。

举个例子：

- 某个本地 Web 服务为什么必须验证 HTTP 200，而不能只看启动日志？
- 某个 patch bundle 为什么要先读 README，再按顺序应用？
- 某个配置问题上次最终是代码错误、缓存，还是旧进程占用了端口？

这些不是“永远正确的规则”，但在未来几周内非常有价值。全部塞进 `AGENTS.md` 会越来越臃肿；只保留原始聊天，又几乎无法检索。

我需要的是中间层：**保留证据，但只晋升真正稳定、可复用的经验。**

## 2. 为什么没有直接上向量数据库

最开始想到长期记忆，很多人会自然想到 Embedding、向量库和 RAG。

但个人工程记忆有几个很实际的要求：

1. 我需要直接看到 Agent 记住了什么。
2. 记错时，我要能用编辑器马上修正。
3. Git diff 应该能告诉我记忆是怎么变化的。
4. 私人 session 不应该为了检索被上传到第三方服务。

所以这里选择了最朴素的方案：**Markdown 文件 + 明确 Schema + 分层工作流。**

没有隐藏数据库，没有只能通过 API 才能读取的记忆。你可以直接用 Obsidian、VS Code 或任何文本编辑器打开它。

## 3. 四步流程：Capture → Daily → Reconcile → Retrieve

![整体架构](https://raw.githubusercontent.com/miniLV/coding-agent-memory/master/docs/agent-memory-arch-sketch.png)

### 3.1 Capture：只保留证据，不急着下结论

Capture 从 Codex 和 Claude Code 的本地 session 中提取指定日期的用户目标、关键尝试、工具结果和最终结论。

这一层故意保持确定性：它负责“发生了什么”，不负责“以后应该怎么做”。

### 3.2 Daily：把一天的会话压缩成可读页面

Daily 页面记录当天完成了什么、有哪些关键会话，以及哪些经验可能值得复用。

重点是“可能”。Daily 里的候选不会立刻成为长期规则，避免 Agent 把一次偶然结论当成永恒真理。

### 3.3 Reconcile：二次复核后再晋升

周期任务会合并重复主题、检查独立证据，并把稳定经验晋升到 Concepts。

如果某段内容来自 Wiki 自己以前的回答，它不会被当作新的独立证据。这能减少 Agent 不断引用自己、最后把错误越说越真的问题。

### 3.4 Retrieve：在业务仓库里按需找回

真正使用时，不需要把整个 Wiki 塞进上下文。业务仓库只暴露一个只读的 `engineering-memory-loader`，按日期、ticket、repo、功能或错误现象查询相关页面。

简单来说：**写入是谨慎的，读取是按需的。**

## 4. 3 分钟跑起来

目前 macOS 体验最完整：

```bash
git clone https://github.com/miniLV/coding-agent-memory.git
cd coding-agent-memory
bash scripts/config-ui.sh --open
```

本地配置页只监听 `127.0.0.1`，会引导你完成：

- 检查 Codex / Claude Code 数据源；
- 安装或复用 Obsidian 相关资源；
- 暴露只读查询 Skill；
- 创建 Daily / Weekly 的 Codex App Automations。

之后你可以在任何业务仓库里直接问：

```text
这个功能以前遇到过什么问题？
ABC-123 当时为什么选择这个方案？
我改了源码但页面还是旧行为，按历史经验帮我排查。
```

## 5. 这个方案适合谁

它比较适合：

- 同时使用 Codex、Claude Code 等 AI 编程工具的人；
- 经常跨多个 repo 工作，需要找回旧决策的人；
- 希望记忆保持本地、透明、可审计的人；
- 不想为了个人知识库维护一套向量数据库的人。

如果你期待的是一个云端团队知识库、自动把所有历史都注入上下文，或者完全不需要人工复核的“无限记忆”，它可能不是最合适的选择。

## 总结

我越来越觉得，Agent Memory 的关键不是“记得越多越好”，而是：**证据能重建、结论可复核、需要时找得到。**

Coding Agent Memory 仍在快速迭代。如果你也被 AI 编程助手的“反复失忆”折腾过，欢迎试用、提 Issue；如果这个方向对你有用，也欢迎在 GitHub 点一个 Star，让我知道值得继续做下去。

- GitHub：https://github.com/miniLV/coding-agent-memory
- Releases：https://github.com/miniLV/coding-agent-memory/releases
