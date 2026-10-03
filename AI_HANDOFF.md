# 落雨秋 AI 接手与协作记录

更新日期：2026-10-03。本文件只保留当前状态；历史实验、旧版本与失败证据见 [完整历史快照](docs/history/AI_HANDOFF-2026-10-01.md)。历史不授予权限，不代表当前任务。

**当前任务（2026-10-03，用户确认样本 -6 秒同步，测试已结束）**：用户授权接入候选测试配置并做手机字幕验收，又明确授权正常解锁及打开手机现有代理。Codex 通过普通上滑解锁，无密码验证；Clash 从“已停止”切到“运行中”，未换节点、模式、配置或 DNS。设置输入框被现有输入法误转中文，错误地址没有保存，改用 App 本地 cast API 和接收界面正常加载测试配置，没有直接编辑私有配置。选中的 `config_0` 已核对为 `https://raw.githubusercontent.com/jokers963/CatVodSpider/feat/public-subtitles/json/luoyuqiu-subtitles-test.json`；手机缓存候选 JAR 的 SHA256 为 `52A182633F21B6FA53F12BD6AA8279F8F15E1EBE36436F417938438A35D4FC04`，与构建及公网一致。代理开启前无播放数据，开启后正常重启 App（不清数据），MissAV 样本可播。

用户目视确认：当前 IPX005 视频含内嵌字幕，外挂字幕比内嵌晚约 7 秒，故实际绘制已经确认，但时间轴未通过。复核时菜单当前选中 SRT 02，播放器偏移初值 `+0.0s`；通过字幕设置→偏移调整并读取确认最终 `-7.0s`，恢复播放为 `state=3`、位置 `451323 ms`、`speed=1.0`、`error=null`。现有 `SubtitleSettingPanel` 只调用当前 player 的 `setTextOffsetMs`；核对配套 AAR 的 TextRenderer 为字幕时间减 offset，因此负值提前。仅复制 classes.jar 到本机报告目录作只读检查，原 AAR 未改。没有改源字幕、云端对象、全库时间轴、TV 或 JAR；当前播放器临时校准不能当作全库修复或保证跨影片不继承，后续测试其他影片前应归零。用户尚未确认 -7 秒调整后是否同步，正式发布仍待此复核及剩余验收。

最新校准：用户反馈 -7 秒时外挂比内嵌提前约 1 秒，已将提前量减为 6 秒。界面读回 `-7.0s→-6.0s`，恢复播放 `state=3`、位置 `581314 ms`、`speed=1.0`、`error=null`；用户随后明确回复“同步了”。因此 IPX005 当前视频/SRT 02 的实际显示及 -6 秒校准后同步通过，不代表未校准自动同步或其他候选/影片也需 -6 秒。没有修改字幕原件、云端对象或统一时间轴。测试结束已停止播放及 App，核对进程不存在、MediaSession 栈为 0 sessions；只移除本次临时 ADB `tcp:19978` 转发，不动其他连接。手机保留测试配置，现有代理按用户要求保持运行；当前 player 临时偏移不作为影片持久化设置，后续测试其他影片前核对归零，正式发布尚未进行。

实机证据：单候选 IPX343 的库字幕在菜单自动选中，播放 `state=3`、`speed=1.0`、`error=null`，位置 `21196→57234 ms`；快进后从 `120691 ms` 的准备状态恢复至 `145330 ms` 正常播放。多候选 IPX005 在菜单显示 3 个 SRT 和 1 个 VTT；选择 SRT 03 后快进，`116610→165369 ms` 恢复正常播放，重新打开菜单 SRT 03 仍为 selected；切换 VTT 04 后返回首页再进入，菜单仍 selected VTT 04，播放恢复。无库样本 CJOD538 的索引 HTTP 404，手机仍正常播放 `45→29123 ms`，无错误提示或字幕按钮；只证明库未命中不阻断播放，不证明手机迅雷命中。所查日志无 FATAL EXCEPTION、VerifyError、ExoPlaybackException、SubtitleDecoderException、ParserException 或 Bad HTTP Status；日志抽样不能证明所有请求或长期运行无错误。没有截图，不能仅凭轨道菜单判定字幕已实际绘制或对白同步；已请用户目视确认，暂不正式发布。

当前 Codex 为此任务唯一维护/测试分支发布/手机操作者，无并行会话。资源提交 `eef85ee` 在 `feat/public-subtitles`，配置只改候选 JAR 和六站 `ext.subtitleLibrary`，MD5 `817f14e37e342691a5d0cab2fabd5b73`，关闭 debug、复用最新正式脚本；`scripts/subtitles/test_config.cjs`、三组 Node、公网配置/JAR 校验通过。测试报告在本机 `outputs/public-subtitles-phone-test-20261003/verification.json`；手机保留测试配置和 IPX005 待用户观察，不恢复旧任务。远程 main 仍为 `7914a24`，TV `luoyuqiu` 为 `45149355d` 且工作目录干净；正式入口、v37、TV、APK、签名、AAR 与备份未改，未推 main、未安装 APK、未清数据、未截图、未改方向锁定。候选数据及实播仅抽样，六站全部字幕覆盖、库网络异常和时间轴完整验收未完成。

**最新进展（2026-10-03，R2 上传及校验完成，手机未验收）**：用户创建 Standard 桶 `luoyuqiu-subtitles`，公开测试根地址为 `https://pub-662c4b411cfb4cf69f52f71f22140341.r2.dev`。已使用独立 AWS CLI 1.46.1 与专用本机 `luoyuqiu-r2` profile（区域 `auto`），严格先同步字幕对象再同步索引：29,510 份字幕、22,758 个索引，共 52,268 个文件、1,226,263,982 字节；两次 sync 均成功，不使用 `--delete`，未上传 reports 或原件。新增可复用 [云端核对脚本](scripts/subtitles/verify_r2.ps1)，实际全量运行通过：全部远程路径、大小和单文件 ETag/MD5 与本地最终导出一致；生成器另已再次核对全部源件/对象 SHA256 与索引引用。公开单候选 `107SYBI001`、17 候选 `10MU1080` 的索引返回 200（本机样本约 0.40/0.58 秒），18 份候选均可下载、SHA256 一致且严格 UTF-8 解码通过，不存在番号返回 404。SRT/JSON 内容类型分别为 UTF-8 text/plain / application/json，缓存分别为一年 immutable / 300 秒。检查报告保留在本机 `outputs/r2-public-validation-20261003`，未上传到桶。密钥不进入交接、源码、发布资源或手机；曾因 profile 误命名而读取旧 28 字符 ID，最终由用户在本机重新配置正确命名解决，无需猜测/补字或关闭 TLS 校验。正式 JSON、v37 与 TV 未改，本轮未推送、安装或操作手机；远程 main 仍为 `7914a24`，TV 工作目录干净。下一步接入候选测试配置并实机验证自动字幕、候选切换和时间轴，再决定正式发布；公开开发 URL 限流，不能把本机公网检查等同于生产域名或手机验收。

**候选实现（2026-10-03，未发布）**：用户希望将桌面约三万份字幕按番号自动匹配，已选定公开静态字幕库。本轮基于远程 `7914a24`，在独立分支 `feat/public-subtitles` / `C:/Users/Administrator/Documents/Codex/2026-10-02/https-github-com-jokers963-catvodspider-main/work/CatVodSpider-public-subtitles` 实现生成器与可选 `ext.subtitleLibrary`：库命中优先、失败/未命中回退迅雷、保留原字幕和播放字段、缓存按库地址隔离。26 项 Java/JUnit、D8/JAR/关闭遥测及日志出口构建验证、三组 Node 和 Python 检查通过。候选位于本对话 `outputs/gm_subs-public-subtitles-candidate.jar`，SHA256 `52A182633F21B6FA53F12BD6AA8279F8F15E1EBE36436F417938438A35D4FC04`、MD5 `817f14e37e342691a5d0cab2fabd5b73`。支持原件 34,180 份，收录 33,464 份、合并重复 3,954 份；511 份番号未识别、205 份编码/结构待查，75 个压缩包未自动展开。GB18030/Big5 混合编码使用本机已有 charset-normalizer 3.5.1 自动识别，收录 Big5 155 份；最终导出为 `outputs/public-subtitles-final-20261003`，原件保持只读，语义和时间轴仍未实机验收。正式 v37 SHA256 仍为 `03B7BBA54A47C958B5B11B04E96382A4687B01825EADE40295976443B5AF0021`。详细实现与部署步骤见 [自有字幕库档案](docs/subtitles/README.md)。

## 移交状态（2026-10-02）

用户完成项目移交后，明确要求继续第 7 项。本轮只做正式配置的实机验收；为处理 Jable 验证循环，用户另行授权从第三方浏览器下载并原位更新系统 WebView。没有修改或发布运行资源、安装落雨秋 APK、清应用数据或采集截图；测试结束后已停止 App，手机没有进行中的播放会话。

接手核对时：接口 local/remote main 同为 `242800b574f1cb0f9363616c3a0318a195797947`；播放器 local/remote luoyuqiu 同为 `45149355d3bde48e47eb91cd9247f1e04f174c2e`；TV 远程 fongmi 为 `9952ff27ae9aa20cb12c47755081bd5952f7a88d`。本轮接口目录除本文件外无改动，播放器实际开发目录仍干净；不要把运行基线、清理提交、交接提交和实机验收记录混为一谈。

第 4～6 项已发布完成，封面分支因打开的 PR 保留。第 7 项已确认手机实际加载 v37；MissAV、AV01、肉视频、Hanime1、Jable 五站的内置播放、持续进度和快进通过，返回后再次进入均可播放，肉视频同集从接近开头重播。签名离机备份、AAR 获取/可复现构建和 CI 扩充未做；它们不是自动启动的任务。

**最新进展（2026-10-02 晚）**：用户报告 jable 分类下滑不翻页，豆宝定位为 `pageCount()` 在 KVS 异步分片下恒返回 1，已修复并经 PR #1 合并（合并提交 `749163b`；交接文档提交 `50ec836`）；详细交接见 [docs/handovers/2026-10-02-doubao-to-codex-jable-pagination.md](docs/handovers/2026-10-02-doubao-to-codex-jable-pagination.md)。✅ 用户已在手机上验证：jable 分类下滑翻页正常，本项闭环。

**最新进展（2026-10-02 晚）**：JavGuru 播放已修复并完成手机 App 实播。此前 App 直接返回 `PLAYER_CONFIG.m3u8` 时出现 `Bad HTTP Status`，而同机 IceRaven 网页播放器可持续播放，证明差异在网页播放器的请求环境。提交 `b92a158` 删除直链分支，让 `playerContent` 固定返回 `{type:"match"}`，复用已有 `helvid.com/m/*` 规则捕获网页播放器实际请求；脚本升至 1.0.2，正式配置升至 `?v=3`。三组 Node 检查及 JSON 校验通过，Pages 发布内容已核对。手机落雨秋 `5.6.3-lyq.3` 实播 IPZZ-975：MediaSession 持续为 `state=3`、`speed=1.0`、`error=null`，位置在 10 秒观察窗从 `63089` 增至 `70687 ms`，缓冲从 `116798` 增至 `125140 ms`；首次无扩展名识别错误由 TV 现有 HLS 重试正常恢复。测试结束后已停止 App；未截图、未清应用数据、未改变 VPN/DNS/代理或其他系统设置。详细证据见 [docs/handovers/2026-10-02-doubao-to-codex-javguru-exoplayer.md](docs/handovers/2026-10-02-doubao-to-codex-javguru-exoplayer.md)。

**最新进展（2026-10-02 晚）**：新增 JavGuru 站（`javguru`，main `8926230`）；分类、翻页、搜索和详情已在手机确认，播放修复见上一段。起因：ren 发来 `https://javguru.fit/` 问是否为 JavGuru 镜像；核查发现它与 missavtv.blog 等 10 个"Friends"站内容完全同源（同排序、同 upload18.cc 图床），均借用知名站牌子，视频实际由 `upload18.org` 的 iframe 播放器提供。jav.guru 官网底部无此域名，不认其为官方镜像。当前实现使用 `playerContent` + `playUrlMatch` 的 WebView 嗅探路线：playerContent 直指 `upload18.org/play/index/${slug}` 使其成顶层 frame，脚本自动点播 JW Player 并捕获 `helvid.com/m/*` 请求。站内无多线路（仅 "Stable"）。六站的接入过程、页面路由、播放原理、测试和可复用经验已整理到 [站点实现档案](docs/sites/README.md)。

## 当前结论与用户边界

- SupJav 已移除，NBD-022 排查已取消；不恢复旧站点、线路、诊断包或旧配置。
- 上一轮范围：归档交接、清理旧测试资源/分支、归并本地与远程差异，并核对手机配置/实际运行版本。用户随后明确授权执行第 7 项、更新系统 WebView，并单独授权发布及实测 JavGuru 的 match 播放修复；未安装落雨秋 APK。
- 不截图、不清应用数据、不改方向锁定、不用外部播放器、不自动点击验证。不得公开 Cookie、凭据、签名媒体 URL 或设备标识。
- 本轮按用户新指令执行第 7 项抽样实播；不自动点击站点验证，不输出 Cookie、签名媒体地址、设备标识或内容标题。未通过的站点保持未通过，不用配置保存、缓存或其他站点结果替代。

## 当前仓库与入口

| 对象 | 当前事实 |
| --- | --- |
| 接口 | `jokers963/CatVodSpider:main`；运行资源基线 `ae4eb8c`，后续文档/清理提交以 git log 为准 |
| 接口目录 | `C:/Users/Administrator/Documents/Codex/2026-09-28/https-github-com-jokers963-catvodspider-blob/work/CatVodSpider` |
| 播放器 | `jokers963/TV:luoyuqiu`；运行源码基线 `6767d2660`，已合入 `7cc80f223` 文档，后续提交以 git log 为准 |
| 播放器目录 | `D:/CodexWorkspace/Android/TV563Release` |
| 上游参考 | `TV:fongmi`；不是当前 APK 的构建分支，不盲目合并 |
| 正式配置 | `https://jokers963.github.io/CatVodSpider/json/luoyuqiu.json` |
| 正式 JAR | `jar/gm_subs-v37.jar?v=37`，六站共用，无站点 JAR 覆写 |
| 手机实装 | 2026-10-02 ADB 核对 `com.jokers963.luoyuqiu`，`5.6.3-lyq.3` / `56303`，Android 13 |

正式站点与脚本 URL 版本：`missav` v9、`jable` v12、`av01` v5、`rou` v6、`hanime1` v3、`javguru` v3。旧 `json/supjav.json` 已退役，不作为兼容入口。

v37 SHA-256：`03B7BBA54A47C958B5B11B04E96382A4687B01825EADE40295976443B5AF0021`；MD5：`004df47ae36384de6fe14d5e31f23ff7`。

## 本轮整理与原有差异归并

- 完整旧交接搬入历史快照，原有两处未提交复核记录一并归档；其中旧“诊断配置未恢复”等描述仍按历史保留，不覆盖当前事实。
- 原 TV README 本地补充先用 stash `10660a9fd805f122750dd8791185e3bd97856a4a` 保留，再快进合入远程文档；定制版本、构建、依赖、签名限制已在当前 README 中，开发目录说明本轮归并。stash 不删除，不需要重复 apply 造成重复段落。
- 旧 `json/new-sites-test.json` 与重复 Hanime1 诊断脚本退役，测试直接复用正式脚本和配置；无引用的 v35/v36 JAR/校验文件清理。正式 JSON、当前站点脚本、v37 及构建输入 `gm.jar`/`gm_subs.jar` 保留。
- 旧 TV 预览分支已用远程标签 `archive/luoyuqiu-preview-2026-10-02` 保存完整提交后删除；封面修复分支也有归档标签，但因 [PR #1](https://github.com/jokers963/TV/pull/1) 仍打开，分支保留，不擅自关闭/合并 PR。详情见 [分支整理记录](https://github.com/jokers963/TV/blob/luoyuqiu/BRANCH_ARCHIVE.md)。
- 旧 `TV-cover-sync` 工作树仍有原有 staged/unstaged 定制，未移植或清除；本轮归并仅针对两个实际工作目录的记录/文档差异，不能宣布所有旧工作树干净。

## 验证事实与缺口

- 既有运行发布：三组 Node、手工 javac/22 项 JUnit、D8/JAR/日志出口检查及 Pages/HTTP/MD5 已通过。完整 Gradle 单测曾因守护进程首响应为空失败，不能写成完整构建通过。
- 接手时的通用只读核对：实装版本已确认，选中的 `config_0` 精确等于裸正式 URL；当时私有 cache/jar 目录不存在，不能确认 v37 已实际加载。已安装 base.apk SHA-256 为 `C21E933BA065C518D622D461D75BD34ED05D8062BE9B4EBDC492EA70206A9E93`，与既有 lyq.3 发布包一致。
- 第 7 项实机验收：冷启动后正式配置下载出一个私有缓存 JAR，设备端 SHA-256 为 `03B7BBA54A47C958B5B11B04E96382A4687B01825EADE40295976443B5AF0021`，与正式 v37 完全一致；五站菜单及顺序可见。MissAV `state=3` 的连续样本 `37102→53127 ms`，快进后 `71170 ms`，返回首页再次进入仍为 `state=3`；AV01 连续样本 `10443→34459 ms`，快进后 `55972 ms`，返回后重新进入站点样本为 `state=3`；肉视频连续样本 `23954→47467 ms`，快进后 `68140 ms`，返回后同集重播从 `43 ms` 开始并为 `state=3`；Hanime1 连续样本 `27326→49548 ms`，快进后 `68220 ms`，返回后再次进入为 `state=3`。四站均使用内置播放器、`speed=1.0`、`error=null`。
- Jable 在用户手动验证后仍持续显示 Cloudflare 安全验证。按用户后续指令，通过手机现有 IceRaven 从 APKMirror 下载 Google Android System WebView `155.0.8059.30` / `805903003`（arm64-v8a，minSdk 32），文件大小 `256086897` 字节、SHA-256 `2ED32289C0A6020586FC7032815B741B3A5E0FC3926CEDEC0A52928D45199DB4`，Google WebView 证书 SHA-256 `6FAF3C4140407473400934D117815A21AF1CFEFC5C0BEE61C858BC3D72BA6FE5`；包名、版本、文件哈希及与原系统包相同的签名均核对后用 `adb install --no-streaming -r` 原位更新，未恢复小米商店、未清数据。系统当前 WebView provider 已确认为 `155.0.8059.30`。更新后 Jable 分类列表和详情正常加载，内置播放连续样本 `29726→47936 ms`，快进后 `67010 ms`，返回详情再次进入后为 `98080 ms`，全程 `state=3`、`speed=1.0`、`error=null`。因此第 7 项五站实播通过。测试进程未见 `FATAL EXCEPTION`、`VerifyError` 或类加载错误；未截图、未清数据、未改方向设置、未用外部播放器、未自动点击验证。结束时 App 已停止且无活动 MediaSession。
- 清理提交 `572dae8`：三组 Node、当前 Markdown 本地链接、差异检查通过；历史正文逐字保留（仅换行统一）已核对，正式运行文件/构建输入及 TV 运行源码无变化，19 个 AAR 校验全部匹配。[CI](https://github.com/jokers963/CatVodSpider/actions/runs/36953685799) 和 [Pages](https://github.com/jokers963/CatVodSpider/actions/runs/36953685031) 均成功；正式 JSON 五站/v37 与远程 MD5 匹配，删除的五个资源均 HTTP 404。远程历史快照正文已核对完整保留；这些检查不新增实机结论。

## 构建与签名入口

播放器先读 [定制版 README](https://github.com/jokers963/TV/blob/luoyuqiu/README.md)、[AGENTS](https://github.com/jokers963/TV/blob/luoyuqiu/AGENTS.md)、[签名说明](https://github.com/jokers963/TV/blob/luoyuqiu/scripts/SIGNING.md) 和 19 个 AAR 校验清单。AAR 不在 Git 中，尚不支持新 clone 直接重建，也不能承诺新版 libass/双字幕。密钥/密码不入库；两份签名备份仍在同一台电脑，离机备份未做。

接口正式 v37 使用 [gmRelease](scripts/gmRelease/build-check.ps1)，组合包装层测试及关闭遥测/日志出口处理，仍依赖本机环境。`gmSubsJar` 只是测试候选，不能当成等价正式包发布。原理按需读 [LUOYUQIU_ARCHITECTURE](LUOYUQIU_ARCHITECTURE.md)。

## 当前任务登记

| 任务 | 负责人/发布人 | 范围与状态 |
| --- | --- | --- |
| 自有公开字幕库 | 当前 Codex 单独执行/测试分支发布，抽样测试已结束 | `feat/public-subtitles`；R2/构建及手机候选加载、自动字幕轨道、多候选切换、快进、未命中播放抽样通过。用户确认 IPX005/SRT 02 实际显示且 -6 秒临时校准后同步；不证明全库自动同步，不统一改库。测试 App 已停止、0 MediaSession、临时转发已移除；手机保留测试配置及启用的现有代理。正式入口与 TV/APK/签名未变，未推 main，剩余覆盖/异常路径及正式发布待后续授权 |
| 第 4～6 项 | 原主对话单独执行/发布，已结束 | 接口 `572dae8`、TV `45149355d`；归档、去重/旧资源退役、文档差异归并及恢复标签已发布，检查通过；封面分支因打开 PR 保留。不改运行源码或 APK |
| 第 7 项 | 当前主对话单独执行/发布，已结束 | 已完成：v37 实际加载及 MissAV、AV01、肉视频、Hanime1、Jable 五站核心播放链路通过；Jable 在系统 WebView 原位更新至 `155.0.8059.30` 后恢复；当前无进行中的实机任务 |
| Jable 分类翻页修复 | 豆宝执行/发布，用户逐项确认 | ✅ 已闭环：PR #1 已合并；三组 Node 测试通过；**2026-10-02 用户手机实机验证：jable 分类下滑翻页正常**。范围：`js/jable.user.js`（pageCount 适配 async 分片：整批返回时报 9999 页，`@version` 1.0.6→1.0.7）、`json/luoyuqiu.json`（jable.user.js `?v=8`→`?v=9`）、`js/adapters.test.cjs`（新增三项 pagecount 断言）。详细交接（根因/改动/验证/待办）：[docs/handovers/2026-10-02-doubao-to-codex-jable-pagination.md](docs/handovers/2026-10-02-doubao-to-codex-jable-pagination.md) |
| rou/hanime1 补 style 卡片 | 豆宝执行/发布，用户逐项确认 | ✅ 已闭环：PR #2 合并后用户验证发现两站封面被裁切；查历史记录确认此前故意不给这两站加 style（其封面比例与 1.5:1 不符）。已直接回退到 PR #2 前状态并推 main（`3caeb01`），三组 Node 测试通过，**用户手机验证封面恢复正常** |
| Hanime1 搜索加分页 | 豆宝执行/发布，用户验证 | ✅ 已闭环：`json/luoyuqiu.json` 里 hanime1 的 searchContent 模板补 `&page=${pg:-1}`；`js/hanime1.nav.test.cjs` 新增搜索 URL 断言；三组 Node 测试通过。**用户手机验证：搜索翻页正常** |
| Jable 搜索翻页（JS 驱动） | 豆宝执行/发布，用户验证 | ✅ 已闭环：jable 搜索翻页不换 URL（用户浏览器确认第 2 页地址与第 1 页相同），模板加参数无效。改为 userscript 内驱动站内分页：`searchContent(pg>1)` 时点击 `ul.pagination` 对应页码（"01"式标签），等 `span.page-link.active` 落到目标页再抓取；`pageCount` 补 JS 分页的页码解析（data-page/标签文字，逐页重算随窗口前移）；不可达的页返回空列表让播放器干净收尾。`js/jable.user.js` @version 1.0.7→1.0.8，`json/luoyuqiu.json` 中 `?v=9`→`?v=10`，`js/adapters.test.cjs` 新增三组单测（翻页驱动/首页直抓/不可达收尾）。三组 Node 测试通过。**用户手机验证：jable 搜索翻页正常** |
| Jable blockNetworkImage 改 true | 豆宝执行/发布，用户验证 | ✅ 已闭环：`json/luoyuqiu.json` 里 jable 的 `blockNetworkImage` false→true，与其余四站统一；抓页面时不下载图片（只拿 HTML 文字），封面地址以文字形式提取不受影响，播放器封面另行加载。JSON 校验通过，五站全 true；三组 Node 测试通过。**用户手机验证：封面显示无异常** |
| 验证页"卡住"修复 | 豆宝执行/发布，用户验证 | ✅ 已直接推 main：根因是 Cloudflare 验证框在用户点完后仍留在 DOM 里，jable/missav 的脚本认不出"已验证完"，一直不上报结果（WebView 也不消失）。改为内容优先：只要抓到真实内容就立即上报并隐藏 WebView，不再被残留验证标记卡住；jable 的验证等待从"导航开始 25 秒"改为"首次发现验证起 60 秒"（jable 验证最慢）。`js/jable.user.js` 1.0.8→1.0.10、`js/missav.user.js` 1.2.4→1.2.5，`json/luoyuqiu.json` 中 jable `?v=10`→`?v=12`、missav `?v=8`→`?v=9`；`js/adapters.test.cjs` 更新超时断言并新增回归测试（残留验证标记/未知 method 兜底）。三组 Node 测试通过 |
| JavGuru 新站与播放 | 豆宝初版，Codex 修复/发布/实测 | ✅ 已闭环：分类、翻页、搜索、详情正常；`b92a158` 恢复 GM `{type:"match"}`，脚本 1.0.2 / 配置 `?v=3` 已发布。手机 App 实播持续 `state=3`、`speed=1.0`、`error=null`，位置与缓冲均递增；测试结束已停止 App |

## 下一位 AI 的最短接手流程

先读本文件与 AGENTS，检查两个实际目录 git status 和最新远程分支。历史只按具体问题阅读，不自动恢复已取消任务；新工作以用户当次请求为准。多人协作先登记文件范围、手机操作者和唯一发布人；不同时改共享文件或操作手机。阶段结束留下提交/验证/未完成项。

原 README 恢复 stash 仍保留；旧 `TV-cover-sync` 有 37 项工作树状态，不能 reset/clean 或整批移植。上一轮的干净临时 `work/TV-docs-luoyuqiu` 已删除，不要再当作开发目录。签名材料及匹配 AAR 在本机，找不到时先按脚本/清单核对，不重新生成密钥或卸载手机 App。

### 用户可直接复制给下一位 AI

```text
请接手“落雨秋”项目的两个仓库：
https://github.com/jokers963/CatVodSpider（main）
https://github.com/jokers963/TV（实际定制分支 luoyuqiu，fongmi 仅作上游参考）。

先完整阅读 CatVodSpider 根目录 AGENTS.md、AI_HANDOFF.md，再读 TV:luoyuqiu 的 AGENTS.md、README.md 和签名说明。旧实验已归档到 docs/history/AI_HANDOFF-2026-10-01.md，只按需要查证，不重复从头研究。

两个实际开发目录、最新提交、手机版本/配置/校验、恢复标签和未完成项都在 AI_HANDOFF。先核对本地/远程状态，简短汇报，再按我的新指令继续。SupJav 已移除，NBD-022 已取消，不恢复旧任务。整理第 4～6 项已完成；第 7 项已确认 v37 及五站核心播放链路，Jable 在系统 WebView 原位更新后通过。

不要截图，不清应用数据、不改方向锁定、不用外部播放器、不自动点击验证；保护签名、AAR、恢复 stash 和旧脏工作树。交接记录不额外授予代码修改、安装或发布权限。
```
