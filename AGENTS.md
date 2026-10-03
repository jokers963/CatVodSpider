# 落雨秋接口：AI 工作入口

本文件用于快速接手，不代替用户当次授权，不保证站点已经完成验收。

## 阅读顺序

1. [AI_HANDOFF.md](AI_HANDOFF.md)：当前状态、版本、权限、协作登记与下一步。
2. [LUOYUQIU_ARCHITECTURE.md](LUOYUQIU_ARCHITECTURE.md)：只读当前任务涉及的原理章节及源码。
3. 核对当前代码/远程发布/工作树差异，再继续用户具体任务；不要重复全仓调研。

## 工作边界

- 本仓库负责远程配置、GMSubs、站点 userscript 与运行 JAR；配套播放器实际开发入口为 [jokers963/TV:luoyuqiu](https://github.com/jokers963/TV/tree/luoyuqiu)，先读该分支 [AGENTS.md](https://github.com/jokers963/TV/blob/luoyuqiu/AGENTS.md)。默认分支 `fongmi` 仅作上游同步参考。
- 正式手机入口是 `https://jokers963.github.io/CatVodSpider/json/luoyuqiu.json`。不要填写电脑本地文件或 GitHub blob 页面。
- SupJav 已移除、NBD-022 排查取消，旧 `json/supjav.json` 已退役；MemoJav 亦已按用户要求取消，不恢复。2026-10-03 用户确认发布公开字幕库，六站 MissAV、Jable、AV01、肉视频、Hanime1、JavGuru 共用 v38，v37 保留供回退；部署完成与未验收范围以 AI_HANDOFF 顶部为准，下方旧记录不能作为恢复任务的依据。
- 实际播放器定制分支为 `jokers963/TV:luoyuqiu`，本机工作目录为 `D:/CodexWorkspace/Android/TV563Release`；`fongmi` 是另一分支。手机遵守用户“不要截图”的要求。
- 保护用户未提交改动；旧 `交接.md` 不删除/覆盖，其历史内容不能代替当前源码。禁止破坏性 Git 操作、强推或未经请求同步上游。
- TV 本地工作树及运行文件保持只读；文档不授予运行修改或发布权限，权限以用户当次明确授权为准。
- 不恢复已取消的站点/线路；MissAV 不擅自改回带 `name` 的 `finalUrl`；GM 的 `type: match` 不代表媒体解析已经结束。
- 修复按证据定位，做匹配测试并从正式远程入口实机验证。不以编译或单样本成功宣布整站稳定。
- 不清应用数据、不改变方向锁定、不用外部播放器、不自动点击验证；不要发布凭据、Cookie、签名媒体地址或设备标识，不遗留调试开关。

## 协作与交接

两个 AI 开始前按 AI_HANDOFF 的唯一共享任务表约定文件负责人、手机操作者和发布人；同一文件或手机不能同时操作。文档是约定，不是自动互斥锁。更新基于最新远程 HEAD，不覆盖对方提交。

每个阶段留下提交/发布版本、测试与实机证据、未完成项及下一步，更新 AI_HANDOFF。没有具体任务时先报告状态，不擅自实现潜在优化。

**发布流程（2026-10-02 用户拍板）**：小改动（json 微调、测试、文档）豆宝可直接推 main，用户在手机上验证，有问题立即回退；大改动（动 jar、加新站、换域名）先与用户对方案再动手。分支 PR 仅用于大改动或与 Codex 并行协作时隔离。
