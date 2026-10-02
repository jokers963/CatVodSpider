# 落雨秋 AI 接手与协作记录

更新日期：2026-10-02。本文件只保留当前状态；历史实验、旧版本与失败证据见 [完整历史快照](docs/history/AI_HANDOFF-2026-10-01.md)。历史不授予权限，不代表当前任务。

## 移交状态（2026-10-02）

用户要求把项目交给下一位 AI。本轮交接只补充 Markdown，没有再次操作手机或发布运行资源；当前主对话不再继续开发/实机验证，手机没有进行中的测试，不持有操作权。

交接前核对：接口 local/remote main 同为 `572dae895df105f452d69e3c1a7769f577eaa406`；播放器 local/remote luoyuqiu 同为 `45149355d3bde48e47eb91cd9247f1e04f174c2e`；TV 远程 fongmi 为 `9952ff27ae9aa20cb12c47755081bd5952f7a88d`。两个实际开发目录均干净。交接文档提交会使接口 HEAD 前进，下一位重新核对，不把运行基线、清理提交和交接提交混为一谈。

第 4～6 项已发布完成，封面分支因打开的 PR 保留；第 7 项只做了通用只读核对，v37 实际加载及五站实播仍未完成。签名离机备份、AAR 获取/可复现构建和 CI 扩充未做；它们不是自动启动的任务。

## 当前结论与用户边界

- SupJav 已移除，NBD-022 排查已取消；不恢复旧站点、线路、诊断包或旧配置。
- 上一轮范围：归档交接、清理旧测试资源/分支、归并本地与远程差异，并核对手机配置/实际运行版本。当前用户请求仅写交接，下一项开发/发布/实机工作以用户的新指令为准。
- 不截图、不清应用数据、不改方向锁定、不用外部播放器、不自动点击验证。不得公开 Cookie、凭据、签名媒体 URL 或设备标识。
- 本轮不执行色情内容取址/播放验证；通用包信息、保存配置和缓存核对不是五站实播验收。

## 当前仓库与入口

| 对象 | 当前事实 |
| --- | --- |
| 接口 | `jokers963/CatVodSpider:main`；运行资源基线 `ae4eb8c`，后续文档/清理提交以 git log 为准 |
| 接口目录 | `C:/Users/Administrator/Documents/Codex/2026-09-28/https-github-com-jokers963-catvodspider-blob/work/CatVodSpider` |
| 播放器 | `jokers963/TV:luoyuqiu`；运行源码基线 `6767d2660`，已合入 `7cc80f223` 文档，后续提交以 git log 为准 |
| 播放器目录 | `D:/CodexWorkspace/Android/TV563Release` |
| 上游参考 | `TV:fongmi`；不是当前 APK 的构建分支，不盲目合并 |
| 正式配置 | `https://jokers963.github.io/CatVodSpider/json/luoyuqiu.json` |
| 正式 JAR | `jar/gm_subs-v37.jar?v=37`，五站共用，无站点 JAR 覆写 |
| 手机实装 | 2026-10-02 ADB 核对 `com.jokers963.luoyuqiu`，`5.6.3-lyq.3` / `56303`，Android 13 |

正式站点与脚本版本：`missav` v8、`jable` v8、`av01` v5、`rou` v6、`hanime1` v3。旧 `json/supjav.json` 已退役，不作为兼容入口。

v37 SHA-256：`03B7BBA54A47C958B5B11B04E96382A4687B01825EADE40295976443B5AF0021`；MD5：`004df47ae36384de6fe14d5e31f23ff7`。

## 本轮整理与原有差异归并

- 完整旧交接搬入历史快照，原有两处未提交复核记录一并归档；其中旧“诊断配置未恢复”等描述仍按历史保留，不覆盖当前事实。
- 原 TV README 本地补充先用 stash `10660a9fd805f122750dd8791185e3bd97856a4a` 保留，再快进合入远程文档；定制版本、构建、依赖、签名限制已在当前 README 中，开发目录说明本轮归并。stash 不删除，不需要重复 apply 造成重复段落。
- 旧 `json/new-sites-test.json` 与重复 Hanime1 诊断脚本退役，测试直接复用正式脚本和配置；无引用的 v35/v36 JAR/校验文件清理。正式 JSON、五站脚本、v37 及构建输入 `gm.jar`/`gm_subs.jar` 保留。
- 旧 TV 预览分支已用远程标签 `archive/luoyuqiu-preview-2026-10-02` 保存完整提交后删除；封面修复分支也有归档标签，但因 [PR #1](https://github.com/jokers963/TV/pull/1) 仍打开，分支保留，不擅自关闭/合并 PR。详情见 [分支整理记录](https://github.com/jokers963/TV/blob/luoyuqiu/BRANCH_ARCHIVE.md)。
- 旧 `TV-cover-sync` 工作树仍有原有 staged/unstaged 定制，未移植或清除；本轮归并仅针对两个实际工作目录的记录/文档差异，不能宣布所有旧工作树干净。

## 验证事实与缺口

- 既有运行发布：三组 Node、手工 javac/22 项 JUnit、D8/JAR/日志出口检查及 Pages/HTTP/MD5 已通过。完整 Gradle 单测曾因守护进程首响应为空失败，不能写成完整构建通过。
- 本轮手机只读核对：实装版本已确认，选中的 `config_0` 精确等于裸正式 URL；手机休眠且 App 未运行。私有 cache/jar 目录不存在，私有目录 JAR 数为零，不能确认 v37 已实际加载。已安装 base.apk SHA-256 为 `C21E933BA065C518D622D461D75BD34ED05D8062BE9B4EBDC492EA70206A9E93`，与既有 lyq.3 发布包一致。未安装、启动或改变手机设置，未截图。
- 清理后的五站菜单、播放、持续播放、快进、返回重播及手机 v37 实际加载仍未验收；不以配置保存、单测或历史单样本代替。
- 清理提交 `572dae8`：三组 Node、当前 Markdown 本地链接、差异检查通过；历史正文逐字保留（仅换行统一）已核对，正式运行文件/构建输入及 TV 运行源码无变化，19 个 AAR 校验全部匹配。[CI](https://github.com/jokers963/CatVodSpider/actions/runs/36953685799) 和 [Pages](https://github.com/jokers963/CatVodSpider/actions/runs/36953685031) 均成功；正式 JSON 五站/v37 与远程 MD5 匹配，删除的五个资源均 HTTP 404。远程历史快照正文已核对完整保留；这些检查不新增实机结论。

## 构建与签名入口

播放器先读 [定制版 README](https://github.com/jokers963/TV/blob/luoyuqiu/README.md)、[AGENTS](https://github.com/jokers963/TV/blob/luoyuqiu/AGENTS.md)、[签名说明](https://github.com/jokers963/TV/blob/luoyuqiu/scripts/SIGNING.md) 和 19 个 AAR 校验清单。AAR 不在 Git 中，尚不支持新 clone 直接重建，也不能承诺新版 libass/双字幕。密钥/密码不入库；两份签名备份仍在同一台电脑，离机备份未做。

接口正式 v37 使用 [gmRelease](scripts/gmRelease/build-check.ps1)，组合包装层测试及关闭遥测/日志出口处理，仍依赖本机环境。`gmSubsJar` 只是测试候选，不能当成等价正式包发布。原理按需读 [LUOYUQIU_ARCHITECTURE](LUOYUQIU_ARCHITECTURE.md)。

## 当前任务登记

| 任务 | 负责人/发布人 | 范围与状态 |
| --- | --- | --- |
| 第 4～6 项 | 原主对话单独执行/发布，已结束 | 接口 `572dae8`、TV `45149355d`；归档、去重/旧资源退役、文档差异归并及恢复标签已发布，检查通过；封面分支因打开 PR 保留。不改运行源码或 APK |
| 第 7 项 | 原主对话仅通用只读核对，已停止 | 实装/配置已核对；手机 v37 实际加载及五站实播未完成。不能执行色情内容取址/播放测试；当前无进行中的实机任务 |

## 下一位 AI 的最短接手流程

先读本文件与 AGENTS，检查两个实际目录 git status 和最新远程分支。历史只按具体问题阅读，不自动恢复已取消任务；新工作以用户当次请求为准。多人协作先登记文件范围、手机操作者和唯一发布人；不同时改共享文件或操作手机。阶段结束留下提交/验证/未完成项。

原 README 恢复 stash 仍保留；旧 `TV-cover-sync` 有 37 项工作树状态，不能 reset/clean 或整批移植。上一轮的干净临时 `work/TV-docs-luoyuqiu` 已删除，不要再当作开发目录。签名材料及匹配 AAR 在本机，找不到时先按脚本/清单核对，不重新生成密钥或卸载手机 App。

### 用户可直接复制给下一位 AI

```text
请接手“落雨秋”项目的两个仓库：
https://github.com/jokers963/CatVodSpider（main）
https://github.com/jokers963/TV（实际定制分支 luoyuqiu，fongmi 仅作上游参考）。

先完整阅读 CatVodSpider 根目录 AGENTS.md、AI_HANDOFF.md，再读 TV:luoyuqiu 的 AGENTS.md、README.md 和签名说明。旧实验已归档到 docs/history/AI_HANDOFF-2026-10-01.md，只按需要查证，不重复从头研究。

两个实际开发目录、最新提交、手机版本/配置/校验、恢复标签和未完成项都在 AI_HANDOFF。先核对本地/远程状态，简短汇报，再按我的新指令继续。SupJav 已移除，NBD-022 已取消，不恢复旧任务。整理第 4～6 项已完成；第 7 项只有通用只读核对，不是五站实播通过，不能把保存配置或启动成功当作验收。

不要截图，不清应用数据、不改方向锁定、不用外部播放器、不自动点击验证；保护签名、AAR、恢复 stash 和旧脏工作树。交接记录不额外授予代码修改、安装或发布权限。
```
