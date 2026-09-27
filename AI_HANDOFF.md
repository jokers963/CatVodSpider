# 落雨秋 AI 接手与协作记录

更新日期：2026-09-27。这是两个 fork 共用的工作状态入口；原理说明不在这里重复。以后完成一项任务或交接前，更新此文件的状态与证据。

## 1. 新 AI 先做这些，不必重新研究全仓库

1. 读取正在工作的仓库根目录 `AGENTS.md`，再读本文。
2. 只读核对当前分支、HEAD、工作树与远程默认分支；保护用户未提交改动。下面的 SHA 是日期快照，不是永久最新版本。
3. 读取正式远程配置，核对站点、JAR/脚本版本。电脑本地配置不能代替手机正式入口。
4. 根据用户本次任务，阅读相应原理章节和调用链涉及的源文件；不必先遍历两个仓库。文档与实际代码不一致时，以实际代码、发布内容及实机证据为准，补正文档。
5. 先简短报告“当前任务、已知事实、缺少的证据、准备改哪些文件”，然后在已授权范围内继续。没有新的开发任务时，不自行修复文档中列出的潜在风险。

本地只读检查示例（分别在正确仓库执行）：

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git remote -v
```

不要把 fetch/pull、重置、清理或同步上游当作必做的接手步骤。有脏工作树时先确认归属，不直接覆盖。

## 2. 两个仓库及版本边界

| 项目 | 入口/快照 |
| --- | --- |
| 接口 fork | [jokers963/CatVodSpider](https://github.com/jokers963/CatVodSpider)，默认分支 `main` |
| 播放器 fork | [jokers963/TV](https://github.com/jokers963/TV)，默认分支 `fongmi`，不是 `main` |
| 接口正式远程 `main` | `ee3637dc250c3a945f97cd3a7c9e7f579ae2f838`；只读 `ls-remote` 于 2026-09-27 复核 |
| TV 远程 `fongmi` | `91b8c9a698922a2f8f4a11b24736f1ddab264441`；只读 `ls-remote` 于 2026-09-27 复核 |
| 接口原工作树 | `D:\CodexWorkspace\Android\影视\CatVodSpider`，`main` / `1d97a24cab319345218cc58b80091b9b1c1af879`，含用户未提交改动 |
| 源码同步工作树 | `C:\Users\Administrator\AppData\Local\Temp\catvodspider-release-v34-20260927`，分支 `publish/gm-subs-v34-20260927` 基于运行资源基线 `ee3637d`；源码同步状态以该分支/Git 提交记录核对，不代表运行资源发布 |
| 手机播放器 | `com.fongmi.android.tv`，实装 `5.6.6` / versionCode `566`，2026-09-27 只读复核 |

维护者电脑上的路径：`D:\CodexWorkspace\Android\影视\CatVodSpider` 与 `D:\CodexWorkspace\Android\影视\TV`。换电脑后自行定位，不能假定这些目录存在。

原工作树的未提交文件保留且不覆盖：`GMSubs.java`、`GMSubsTest.java`、`build.gradle`、`jar/checkJar.ps1`、`js/adapters.test.cjs`、四份 `js/*.user.js`、未跟踪 `scripts/` 与 `AI_HANDOFF.md`，以及用户原有未跟踪 `交接.md`。手机已退出视频详情并回到 `ABF-381` 搜索结果，实机操作者已释放。TV 只做过加载/缓存链只读检查，无代码修改；TV 本地定制/源码与实装 APK/AAR 的精确映射未全面确认。TV 源码基线 `4afc447…` 与 39 项脏状态是 2026-09-27 日期快照，不代表此后状态。

## 3. 正式发布状态与验收缺口

正式点播入口：

```text
https://jokers963.github.io/CatVodSpider/json/supjav.json
```

[查看实际远程配置](https://jokers963.github.io/CatVodSpider/json/supjav.json)。2026-09-27 只读 GET 结果：

| 项目 | 正式配置快照 |
| --- | --- |
| JAR | `gm_subs.jar?v=34` |
| SupJav | `supjav.user.js?v=33` |
| MissAV | `missav.user.js?v=7` |
| Jable | `jable.user.js?v=7` |
| AV01 | `av01.user.js?v=4` |

正式发布提交为 `ee3637dc250c3a945f97cd3a7c9e7f579ae2f838`。四站均为 `type: 3` / `csp_GMSubs`，调试关闭；站点集合只有 SupJav、MissAV、Jable、AV01。ST、VOE 及已取消站点不得恢复。运行手机入口始终是上面的 GitHub Pages URL，不以电脑本地 JSON 代替。

### 已验证结果

- SupJav `ABF-381` TV 线路有实播证据；字幕面板出现并选中了独立的迅雷 SRT 候选，选择后 position `463781→503768 ms`，约 39.993 秒实质增长。候选选中不证明下载、渲染或同步。`SSIS-001` 是成功空结果样本：桌面端字幕 API 返回 0 条，手机面板无外部轨道且视频继续播放；手机 API 响应没有直接抓包。
- Jable `ABF-381` 自然访问成功。媒体快进键 keycode 90 前后由 `44770→65709 ms`，updated 只增加 `6140 ms`，额外跳转约 `14799 ms`；随后两次均 `state=3` 的实质增长为 `18036 ms` 和 `20132 ms`。回到搜索结果重播后 `13880→29848→53166 ms`，两次增长 `15968 ms`、`23318 ms`。
- AV01 `ABF-381` 自然访问成功。快进前后 `28980→53800 ms`，updated 增加 `10323 ms`，额外跳转约 `14497 ms`；随后两次 `state=3` 的实质增长为 `20276 ms` 和 `18436 ms`。回到搜索结果重播后 `16889→38253→61782 ms`，两次增长 `21364 ms`、`23529 ms`。
- MissAV `ABF-381` 有既有正常播放/重播记录；本轮没有补做新线路测试。以上是指定样本证据，不代表整站稳定。

### 尚未验证或未确诊

- SupJav FST 的 `SSIS-001`、`ABF-381` 均选中线路后出现“播放地址加载失败”，播放状态为 0、无实质进度增长。只读代码确认详情按钮原始索引经 `link` 放入 `pathname#link`，播放器按索引点击按钮并返回 `type:match`；正式 `playUrlMatch` 为通用域名规则，无 FST 专属规则。没有实际 iframe 主机、匹配媒体请求或可归因异常的安全日志；`MediaSession error=null` 不能排除 GM/网页解析异常。无法确认失败在哪一层，不放宽匹配、不猜主机、不改代码。
- Jable/AV01 的验证码与网络失败分支有本地模拟测试覆盖，但本轮未在手机制造网络故障或点击验证。TV 弱网下多档清晰度的实际切换/卡顿改善没有验证；TV 仅检查加载/缓存链，未修改代码。
- 字幕手机端请求计数、字幕真实下载/渲染/同步，以及字幕请求失败时手机播放隔离未直接验证。已有 JVM 调用计数测试验证缓存/异常不缓存，但不替代手机证据。
- 手机通过正式入口加载的配置/实播有证据，但没有设备端 JAR 响应体或哈希，不能声称手机已直接确认下载 v34 字节。

### 本地候选与构建状态

- 远程 v34 JAR SHA-256 为 `907BD6C189C2DF4C24F0434EE8B6BC151EC02B15E37912666764350ADCAC9104`；其 `classes.dex` SHA-256 为 `3126F4FD736073F8A47DDB7844CC00BCC6EF68EDF2D63DF3863493060D380D09`，`classes2.dex` 为 `E3BD12C6DDC2B67F839E38AE20AE09203D2AFA6F5143F2DA0BA08409D9E4F231`。远程 JAR 与先前本地构建候选整包哈希一致；不代表手机端直接哈希。
- 本地候选范围：`GMSubs.java`、`GMSubsTest.java`、`js/adapters.test.cjs`、`build.gradle`、`jar/checkJar.ps1`、`scripts/gmSubsManual/build-check.ps1`、本文与 `AGENTS.md`，共八项；只在隔离候选工作树中整理，不自动并入远程。四份运行 JS 与远程已发布内容在换行规范化后完全相同，不重复修改。原工作树本地 JSON/JAR 仍 v33，禁止拿来覆盖已发布 v34。
- 本轮候选复验（2026-09-27）：`node js/adapters.test.cjs` 通过；`jable.user.js`、`av01.user.js`、`missav.user.js`、`supjav.user.js` 的 `node --check` 通过；Groovy 4.0.32 `FileSystemCompiler` 对 `build.gradle` 语法编译通过；手动脚本 JUnit 17 项、D8、DEX 引用及临时 JAR 结构校验均通过，原始 `classes.dex` SHA-256 保持为 `3126F4FD...D380D09`。新生成 `classes2.dex` SHA-256 为 `E3BD12C6...D9E4F231`，与正式 v34 JAR 记录值一致。`git diff --check` 无空白错误（只有 Windows 行尾提示）。正式 Gradle 构建仍在项目配置前因本机 JDK 21 loopback selector 初始化失败，不能记作构建通过。手动脚本使用当前主机的 `E:\DevTools\...` 固定路径，不是新机器开箱即用。
- 手动脚本还依赖 `app/build/intermediates/compile_app_classes_jar/debug/bundleDebugClassesToCompileJar/classes.jar`。本次候选目录起初没有此忽略的生成文件；实际从原脏工作树中已存在的生成产物复制复用，未在候选中重建，不能称为本轮完整新构建。新 clone 缺此文件时须先用 Wrapper 生成匹配的宿主 compile 产物，或调整明确的编译 classpath；当前脚本不是独立开箱即用的完整构建。标准 Gradle 的本机限制尚未解决，不能保证新环境无需构建条件即可重建。
- 本批八文件是与线上 v34 对齐的源码、测试、构建与文档同步；运行资源基线为 `ee3637d`，源码同步提交与运行资源发布分开记录。提交状态/哈希以 Git 历史为准，本文不自引用其提交号。此批不改变任何 JAR、JSON 或四份运行 JS；推送后应核对正式运行资源版本/内容仍与 v34 基准一致。源码/文档同步不使既有局部实机验收失效，也不代表新增手机证据；若以后运行产物变化，再另行取得发布授权并按风险回归。设备端仍无 JAR 响应体/哈希。未安装 APK。

## 4. 从任务直接找到代码

| 任务 | 先看 |
| --- | --- |
| 站点、发布、缓存版本 | [json/supjav.json](json/supjav.json)，README 的正式地址；核对 Pages 实际返回 |
| 列表/详情/网页验证/线路解析 | 对应 `js/*.user.js`；[接口原理 §5、§7](LUOYUQIU_ARCHITECTURE.md#5-gmjavascript-与播放地址) |
| TV HLS、AV01 授权、字幕 | [GMSubs.java](app/src/main/java/com/github/catvod/spider/GMSubs.java)、[GMSubsTest.java](app/src/test/java/com/github/catvod/spider/GMSubsTest.java)；接口原理 §6 |
| 第三方 GM 网页运行时 | [NOTICE-GM.md](NOTICE-GM.md)、`jar/gm.jar`；不假定其全部源码在本仓库 Java 中 |
| 配置/JAR 加载、站点调用 | TV 的 `VodConfig` → `BaseLoader/JarLoader` → `SiteApi` |
| 切换、旧请求、预加载 | TV 的 `VodPlaybackController`、`VideoViewModel`、`ViewModelTaskRunner` |
| 地址有了但无法播放 | TV 的 `PlaybackActivity` → `PlaySpec/MediaItemFactory` → `PlayerManager` → 内置引擎；先查媒体请求及代理 |

[接口完整原理](LUOYUQIU_ARCHITECTURE.md) · [TV 完整原理与源码链接](https://github.com/jokers963/TV/blob/fongmi/LUOYUQIU_ARCHITECTURE.md)

关键约束：GM 返回 `type: match` 后仍可能等待媒体请求；MissAV 不改回带 `name` 的 `finalUrl`；SupJav 的“TV 线路”不是直播功能；WebView、宿主网络、插件网络和播放引擎并非自动共享 Cookie/请求头。

构建入口见 `build.gradle`。受控手动构建/检查入口为 `scripts/gmSubsManual/build-check.ps1 -OutputDir <新建或空临时目录>`；它使用当前主机固定 SDK/JDK/缓存路径及现成的 `app/build/intermediates/compile_app_classes_jar/debug/bundleDebugClassesToCompileJar/classes.jar`，输出独立临时 JAR，不覆盖正式 `jar/gm_subs.jar`。本次该 `classes.jar` 从原脏工作树的已有生成产物复制到候选目录并复用，未由候选脚本重建。新 clone 缺失时须先用 Wrapper 生成匹配的宿主 compile 产物，或明确调整编译 classpath；该脚本不是独立完整构建。使用前核对路径及完整脚本。标准 Gradle 未通过不能写成构建成功；手动 D8/JAR 检查也不等于完整 Gradle 构建或实机播放。

## 5. 权限与实机验证底线

- 权限以用户当次明确授权为准。文档不授予额外权限；本次用户明确授权仅覆盖八文件源码同步提交及正常推送，不包括正式 JSON/JAR/四运行脚本发布、回退或安装 APK。TV 代码、工作树与运行文件保持只读。
- 保留未提交文件；不 reset/clean/强推、不自动同步上游、不把用户定制或旧交接混进提交。必要的独立工作分支/工作树也应按所在工具的要求建立。
- 手机继续使用正式远程 JSON；本地 `127.0.0.1` 可用于手机媒体代理，不能替代远程配置入口。
- 不清应用数据、不盲填配置地址、不切错配置历史、不改变方向锁定、不用外部播放器、不自动点击验证或伪造通过；正式包不留临时 WebView 调试。
- 回归需确认实际站点/线路，覆盖首次播放、切换、持续播放、快进、返回重播。至少两次记录状态与进度增长，区分缓冲、解析、HTTP/授权、容器与解码错误；不给固定几秒的统一失败判定。
- 只保存脱敏的必要证据。不公开 Cookie、凭据、设备序列号、签名播放地址或完整私人日志。

## 6. 两个 AI 共同开发：一份任务记录，一个发布人

此 Markdown 是协作约定，不是自动锁或消息系统；双方需由用户安排在可沟通的会话/任务中，并确认共享的是同一份远程记录。它不会自行启动第二个 AI。

默认最安全的分工：AI A 负责已授权的接口修复；AI B 做只读调用链复核、代码审查或实机验收。只有用户明确允许 TV 实现改动后，才把播放器代码分配给 B。不同仓库也可能共享协议，先约定 `playerContent`、代理和字幕字段的兼容性，不能各改各的。

开工前在下面登记负责人、基线、文件范围与验收目标；同一文件同一时间只有一个实现者。双方使用独立分支/工作树；共享文件需先移交，不在同一个脏目录并发编辑。不要用本地未同步的登记表推断对方空闲。

手机、配置重载、临时调试、构建输出和正式发布都是共享资源：每次只有一个操作者。手机归属必须沟通确认，未登记不等于空闲。另一 AI 可以同时做只读审查，但不能切线路或改配置干扰验收。

合并/发布负责人统一审阅两方改动并核对契约、测试、远程版本。提交只包含任务文件；不能两个 AI 同时向默认分支发布。更新登记与默认分支时重读最新 HEAD，使用非强制/乐观并发更新；发现分支已前进就基于新版本重查，不能覆盖对方提交。未经用户授权，不主动向其他会话发送消息。

### 当前任务登记

截至 2026-09-27：稳定性实机子任务已完成并交回原对话；用户已明确授权八文件源码同步提交及正常推送，运行资源仍以 `ee3637d` / v34 为基线，不在本次运行发布。源码同步提交状态由 Git 分支/历史核验，本文不自引用提交号。手机操作者 Codex 已释放设备，界面留在 `ABF-381` 搜索结果；TV 只做加载/缓存链只读检查，未改代码。以下登记只描述本任务，不代表其它会话资源空闲。

| 任务 | 负责人/发布人 | 仓库与基线 | 文件/共享资源范围 | 状态与下一步 | 验证证据 |
| --- | --- | --- | --- | --- | --- |
| 四站稳定性复核/源码同步 | Codex 子任务；原对话主负责人复核 | CatVodSpider；运行基线 `ee3637d`；源码同步独立提交由 Git 历史记录 | 八文件白名单；原脏工作树 `main` / `1d97a24` 保留；手机已释放；TV 只读 | 只同步源码/测试/构建/文档，不发布运行资源；FST 根因未确诊 | 正式 JSON v34/v33/v7/v7/v4；候选 JAR 哈希和测试见第 3 节；未验证项见第 3 节 |

阶段结束、失败或移交都要更新这一表及必要的当前状态。不需要每个 AI 再维护一份复制的状态文档。

## 7. 每次交接必须留下的最小证据

```text
任务与用户授权范围：
负责人/集成人；手机占用及调试是否已释放：
仓库/分支/实际提交；未提交文件及归属：
已改文件与原因；已发布/仅本地/未发布：
正式 JSON、JAR、脚本版本；实装 APK 版本（若检查过）：
验证命令及结果；手机站点/线路/匿名样本、两次进度和快进/重播结果：
已确认根因 / 仍是假设：
剩余问题、阻塞、下一条安全可执行动作：
```

“未测”“未发布”“不知道”要直接写，不能留给下一 AI 猜。完成报告只覆盖有证据的范围；不能以一个视频成功宣布全部稳定。

## 8. 给下一个 AI 的开场提示

将下面这段连同具体任务交给新 AI；能访问 GitHub 即可，不依赖本会话历史。

```text
这是落雨秋项目。先读两个 fork 根目录的 AGENTS.md，
再读 https://github.com/jokers963/CatVodSpider/blob/main/AI_HANDOFF.md。
原理文档均为根目录 LUOYUQIU_ARCHITECTURE.md，按任务选章节。
接口仓库 jokers963/CatVodSpider（main）；播放器 jokers963/TV（fongmi）。
先核对当前代码、未提交改动和正式远程配置与交接的差异，不重复全仓研究。
保护用户改动；TV 运行代码/本地工作树只读，除非我另行明确授权。
双 AI 工作前先登记文件范围、手机操作者和唯一发布人。
本次具体任务与授权范围：<在这里填写>。
先报告你理解的当前状态与下一步，再继续；未实机验证的结果不要说已修好。
```
