# 落雨秋接口：AI 工作入口

本文件用于快速接手，不代替用户当次授权，不保证站点已经完成验收。

## 唯一现状卡（2026-10-06）

| 项 | 当前事实 |
| --- | --- |
| 正式入口 | `https://jokers963.github.io/CatVodSpider/json/luoyuqiu.json`（手机只填此地址） |
| Spider | `gm_subs-v40.jar?v=40`，MD5 `c6a36e891a26e269300069fe7c317fef`；v39/v38/v37 保留回退 |
| 正式五站 | MissAV `?v=9`、AV01 `?v=5`、肉视频 `?v=6`、Hanime1 `?v=3`、JavGuru `?v=4` |
| Jable | **已关闭**（脚本/实现保留）；未经用户新指令不恢复 |
| 手机验收 | **v40 手机 QA 未做**；发布≠实机通过；不截图 |
| 勿恢复 | SupJav、MemoJav、NBD-022、旧 `json/supjav.json`、已关闭的 Jable |
| 非正式入口 | 仓库 `CNAME`=`fm.t4tv.hz.cz` 不是正式点播地址；`jokers963/luoyuqiu-api` 已清空，勿再发正式配置；`LuoYuQiu.java`（libvio）不是正式站点入口（正式为 `csp_GMSubs`） |
| 播放器 | [TV:luoyuqiu AGENTS](https://github.com/jokers963/TV/blob/luoyuqiu/AGENTS.md)；现状以本卡 + [AI_HANDOFF 顶部](AI_HANDOFF.md) 为准 |

下方边界与发布规则仍有效；与本卡冲突时以本卡为准。版本/站点细节核对以 `json/luoyuqiu.json` 为准。

## 阅读顺序

1. 本文件顶部「唯一现状卡」。
2. [AI_HANDOFF.md](AI_HANDOFF.md) 顶部：部署证据、任务登记；下方旧记录是历史。
3. [LUOYUQIU_ARCHITECTURE.md](LUOYUQIU_ARCHITECTURE.md)：只读当前任务涉及的原理章节及源码（文内版本快照可能滞后，以现状卡为准）。
4. 核对当前代码/远程发布/工作树差异，再继续用户具体任务；不要重复全仓调研。

## 工作边界

- 本仓库负责远程配置、GMSubs、站点 userscript 与运行 JAR；配套播放器实际开发入口为 [jokers963/TV:luoyuqiu](https://github.com/jokers963/TV/tree/luoyuqiu)，先读该分支 [AGENTS.md](https://github.com/jokers963/TV/blob/luoyuqiu/AGENTS.md)。默认分支 `fongmi` 仅作上游同步参考。
- 正式手机入口是 github.io 上的 `json/luoyuqiu.json`。不要填写电脑本地文件、GitHub blob 页面、CNAME 自定义域，或已清空的 `luoyuqiu-api`。
- 不恢复「勿恢复」清单中的项。Jable 脚本/实现保留。正式配置与脚本 `?v=` 以现状卡 / JSON 为准；部署证据见 AI_HANDOFF 顶部。发布不代表手机或最佳表达验收。
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

**JAR 发布清单（摘要）**：用 [scripts/gmRelease/build-check.ps1](scripts/gmRelease/build-check.ps1) 产出净化包（勿把 `gmSubsJar`/未净化候选当正式）；写入 `jar/gm_subs-vN.jar` + MD5 文件；正式 JSON 只改 spider 字段的版本/MD5；PR 或按上条规则推 main → 等 CI/Pages → 核对公网 JSON/JAR/MD5 与回退包；**当前正式发布人记录见 AI_HANDOFF 任务表（v40 为 Codex，手机由用户验证）**。详单见 [docs/JAR_PUBLISH.md](docs/JAR_PUBLISH.md)。
