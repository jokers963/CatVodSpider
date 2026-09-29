# 落雨秋 AI 接手与协作记录

## 给下一位 AI 的最新交接（2026-09-29；本节优先）

这是 Android 播放器“落雨秋”及其远程点播接口。用户不是开发人员，希望新 AI 能直接接手开发、自己构建和验证；不要让用户重复解释架构，也不要把单条视频成功写成整站稳定。本文下方多处“最新”“当前”是写入时的历史快照，**与本节冲突时以重新核对的远程状态和本节为准**。交接只记录事实，不替代用户对下一项改动的授权。

### 本轮：独立包名定制版构建受缺失播放器依赖阻挡（2026-09-29）

用户已明确最终想要自己的定制 APK，并将首包取舍交由 AI 决定。选择先做最小并存测试包：同步上游的 TV fork 加搜索封面候选，不纳入旧 TV 目录几十处未提交定制。隔离目录 `work/TV-cover-sync` 的 `build/luoyuqiu-preview` 分支已推送，提交 `1306d40a3` 在搜索封面修复 `98fcdd1` 之上，只给 `mobile` flavor 设置独立包名 `com.jokers963.luoyuqiu`，并将移动端应用标签改为“落雨秋测试”；不改正式接口、播放器逻辑或官方包。原目录 `D:\CodexWorkspace\Android\影视\TV` 全程只读。隔离目录内从原目录复制了 19 个被 Git 忽略的 `lib-*.aar`，以及仅用于 debug 构建的被忽略 `local.properties` 占位设置；无真实签名文件/密码被复制或提交。

Windows 本机 Gradle daemon 最初因 JDK Unix Domain Socket 临时路径报 `Unable to establish loopback connection`。仅在构建进程中设置 `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=E:/DevTools/Gradle.gradle` 后，`:app:assembleMobileDebug --no-daemon --console=plain` 已进入 Java 编译。编译仍因配套 AAR 不全失败：现有 `app/libs/` 缺 `androidx.media3.exoplayer.libass` 的 `LibassPlaybackSession`、`LibassSubtitleController`、`androidx.media3.ui.libass.LibassPlayerViewController` 及 `SecondaryTextTrackSelector` 等类，共 29 个编译错误。这是上游源码与手头旧的未入库播放器二进制依赖不匹配，不能通过只改封面代码解决；仓库 README 也明确 `lib-*.aar` 未纳入 Git。未下载到可核对版本的官方配套 AAR，未采用其他 fork 的不明二进制代替。`git diff --check` 通过，**APK 未生成、未签名、未加载手机，封面修复未实机验证**。官方 5.6.8 `com.fongmi.android.tv` 和数据均未动。后续应取得与当前 FongMi/TV 源码对应的播放器 AAR/可信构建产物后重试构建，核对 APK 包名与签名，再并存安装；若取不到，应向用户说明阻碍，不要宣称已完成定制包。上述 preview 分支只供测试，草稿 PR #1 仍仅含搜索封面代码，尚未合并。

### 本轮：手机上游 Release 版本澄清（2026-09-29）

用户给出上游成品包地址 `https://github.com/FongMi/Release/releases`，明确手机当前安装 5.6.8。只读 ADB 核对 `com.fongmi.android.tv` 为 `versionCode 568`、`versionName 5.6.8`；GitHub Release 5.6.8 发布于 2026-09-29，含 `mobile-arm64_v8a.apk` 与 `mobile-armeabi_v7a.apk`。下文先前截图所记 5.6.7 是旧快照，应以本节为准。TV fork 当前 `app/build.gradle` 仍标注 5.6.3，不能假定它与上游 5.6.8 成品 APK 是同一构建；草稿 PR #1 未构建、未签名、未安装。原装应用、用户数据与点播配置均未动。无上游签名密钥，不得尝试以不同签名直接覆盖安装或先卸载；若要实机测试，先设计独立包名/数据隔离的候选方案并获得用户同意。

### 本轮：播放器 fork 同步上游与搜索封面候选（2026-09-29）

用户说明手机安装的是源仓库成品 APK、不是其 fork 构建包，并选择“保留现有工作，把最新上游合并进 fork，再改搜索封面”。TV 原本地目录 `D:\CodexWorkspace\Android\影视\TV` 有大量未提交定制，本轮保持完全只读；操作在独立克隆 `C:\Users\Administrator\Documents\Codex\2026-09-28\https-github-com-jokers963-catvodspider-blob\work\TV-cover-sync` 完成。核对时 fork `fongmi` 为 `91b8c9a`，上游 `FongMi/TV` 的 `fongmi` 为 `c616c0a`，双方分叉：fork 独有两项文档提交，上游独有一项代理跳转修复。非强推合并提交 `322f2604` 已推到 `jokers963/TV:fongmi`；验证两个旧提交都是合并提交祖先、远程分支指向 `322f2604`。本地旧目录仍未同步或清理，**其未提交代码不在远程合并中**。

搜索封面候选仅改移动端 `SearchAdapter`：使用现有 `ImgUtil.load(..., false)` 的等比 `FIT_CENTER`，并保持图片视图可见以保留空/失败图片的文字占位；其他 UI、分类比例、播放器和接口均未改。候选提交 `98fcdd1` 已推到 `fix/search-cover-fit`，草稿 PR [jokers963/TV#1](https://github.com/jokers963/TV/pull/1) 尚未合并。`git diff --check` 通过；JDK 21 下尝试 `:app:compileMobileDebugJavaWithJavac`，Gradle daemon 在编译前返回空首结果，故**未通过构建**。未生成/安装 APK，未实机检查搜索封面；手机源仓库 APK 界面曾显示 5.6.7，而 fork 源码 `app/build.gradle` 标注 5.6.3，不能假定版本或签名匹配，更不能卸载现有应用。下一步应先解决独立环境构建并确认 APK/签名与安装方案，再由用户验证；在此之前不要把 PR 当成已修好。

### 本轮：正式接口新增 `luoyuqiu.json` 地址（2026-09-29）

用户指定正式接口新文件名 `luoyuqiu.json`。提交 `eceee5e` 新增 `json/luoyuqiu.json`，其 JSON 内容与当时正式 `json/supjav.json` 相同；旧 URL 保留兼容。两份正式 JSON 后续功能发布必须同步，避免新旧链接漂移。`json/cover-style-test.json` 仍是独立横向封面试验，**未因改名自动合入正式**。此轮不改站点对象、脚本、JAR、TV 或 APK；不要将链接改名等同于搜索封面修复。Pages 部署成功后新旧 URL 均 HTTP 200，解析为完全相同的六站配置，均无站点横向 `style`；本轮未重新加载手机或测试搜索、播放。

### 本轮：前四站封面比例试验与搜索页限制（2026-09-29）

用户指出后两站封面正常、前四站分类封面裁切；随后同意试用横向卡片。提交 `113a9e3` 新增独立测试入口 `json/cover-style-test.json`：复制正式六站配置，仅给 SupJav、MissAV、Jable、AV01 添加站点 `style: {"type":"rect","ratio":1.5}`；Rou、Hanime1 保持原样。正式 `json/supjav.json`、脚本、JAR、TV 源码及 APK 均未改。Pages 测试 URL 已返回 200；JSON 与正式六站对象逐项比较，除上述四个 `style` 外一致。TV 只读源码确认分类 `TypeFragment` 使用站点 `style`，横向样式将当前三列降为两列。用户反馈试用“可以了”，但搜索结果封面仍显示不全；这仅是用户对分类画面的认可，不代表搜索已修好或所有条目均适配。

搜索页根因已定位于 TV 只读源码：移动端 `adapter_search.xml` 图片框固定为 96×128dp；`SearchAdapter` 调用 `ImgUtil.load` 默认 `CENTER_CROP`，不使用站点 `style`。因此接口中的站点比例不会改变搜索结果图片布局。用户此前明确暂缓 TV/APK 修改，本轮没有改播放器。若用户今后授权，应在隔离 TV 工作树中仅调整搜索图片适配、构建并安装新 APK，再实机验证搜索与其它站点回归；不要把接口试验说成搜索修复。前次自动输入测试 URL 曾发生前缀错误；用户后续反馈已能试用，勿假定手机当前入口，操作前重新核对。交接曾因临时只读环境未及时写入，此段补记。

### 本轮：六站显示名增加分类表情（2026-09-29）

用户要求给前四站、第五站及最后一站的名字增加表情分类。按本轮已告知用户的映射，提交 `fe98c43` 只改正式 `json/supjav.json` 的六个 `name`：🎬 SupJav、🎬 MissAV、🎬 Jable、🎬 AV01、📺 肉视频、🎨 Hanime1。站点 key、顺序、脚本、JAR、分类、搜索及播放配置完全不变；TV/APK 未改。JSON 解析、逐对象比较和 diff 检查通过。Pages 发布成功且裸正式 URL 返回六个新名称。手机重新加载同一正式 URL 后，菜单六项表情和顺序均核对无误，当前选中“📺 肉视频”。

未验证：本轮是纯显示名改动，未重新测试分类结果、搜索或实播。用户此前反馈两列仍未解决封面裁切；测试用的全局“特大”已恢复原先的“大”（三列），TV 仓库继续只读，未改封面适配或安装 APK。

### 历史：第五站更名并移除前四站“推荐”（2026-09-29）

用户要求正式接口第五站从“Rou”显示为“肉视频”，并删除 SupJav、MissAV、Jable、AV01 各自最前面的“推荐”分类。提交 `3fb015e` 保持六站顺序与站点 key 不变，仅把 Rou 的显示名改为“肉视频”；前四站 `homeContent` 只返回原有分类、`list: []`，从而不触发 TV `TypeAdapter` 对非空首页列表自动插入的“推荐”。MissAV/Jable 的首页就绪条件相应改为分类可用；AV01 不再请求首页不用的最新影片列表；SupJav 验证失败时也不再返回会触发“推荐”的占位影片。四站分类、搜索、详情及播放逻辑未改。正式脚本缓存版本改为 34/8/8/5；Rou v6、Hanime1 v3、全局 v35 和 Rou 专属 v36 JAR 均未改，TV/APK 未改。

已验证：四站首页返回分类且空影片列表的自动测试、既有适配和新站测试、四份脚本语法、正式 JSON 解析、非目标配置字段不变比较及 diff 检查通过。Pages 已发布 `3fb015e`，裸正式 URL 返回“肉视频”和新脚本版本，远程四份脚本均与提交内容一致。手机重新加载裸正式 URL，站点菜单第五项为“肉视频”；逐站查看 SupJav、MissAV、Jable、AV01 的首项均为原有分类、没有“推荐”。手机已选回“肉视频”，停在“劇集庫”列表。

未验证：没有对前四站的全部分类卡片、搜索、详情及实播做本轮回归；Jable 分类比其余站晚出现，不能写成所有场景都快速稳定。用户此前确认 Rou 搜索和播放可用，但本次纯首页/显示名改动不能代替全站验收。

### 历史：Rou 调整为正式接口第五站（2026-09-29）

用户确认 Rou 搜索修复“可以了”，要求把 Rou 挪到第五个站点。提交 `2492bec` 仅交换正式 `json/supjav.json` 中 Rou 与 Hanime1 的顺序：SupJav、MissAV、Jable、AV01、Rou、Hanime1。逐站对象和全局字段完全不变；测试入口、脚本、JAR、APK、TV 均未改。JSON 解析、对象不变比较与 diff 检查通过；Pages 发布成功，裸正式 URL 返回相同顺序。手机重新加载裸正式 URL，站点菜单依次显示六站，Rou 确为第五个；已选回 Rou 并停在“劇集庫”列表。

本轮未重新测试搜索、播放或所有分类；搜索可用是用户对上一轮 v6 的反馈，播放没问题是更早的用户反馈，不把这次纯排序发布写成全站回归通过。

### 历史：Rou 正式搜索修复（2026-09-29）

用户在正式入口验证 Rou 播放后反馈“播放没问题，就是搜索有问题”。根因是正式/测试 Rou 对象原来都配置 `searchable: 0`，且没有 `searchContent` 地址。提交 `cf7bebb` 将两份配置的 Rou 改为可搜索，脚本缓存升级到 `v=6`，站点脚本 `@version 1.0.5` 使用 `/search?q=${key}&page=${pg:-1}` 的视频页，并以同源请求读取 `tab=series` 剧集页，合并两类卡片及最大页数；详情和播放代理未改。TV、APK、JAR 与其他五站对象也未改。

已验证：网站搜索表单使用 `q` 参数，视频与剧集分别位于默认页和 `tab=series`，两页均有站点分页；脚本语法、新站/既有适配测试、两份 JSON 解析、原五站对象与全局 JAR 不变检查、diff 检查通过。Pages 已发布 `cf7bebb`，裸正式 URL 返回 Rou `searchable: 1`、`v=6` 和搜索模板，远程脚本为 `1.0.5`。手机重新加载裸正式 URL 后以“AI”搜索，结果页出现 Rou 条目；手机目前停在该结果页，交给用户测试。

未验证：用户尚未验收修复后的搜索；手机可见卡片没有逐一确认视频/剧集比例、第二页与空结果、中文或特殊字符关键词。用户的“播放没问题”属于本次正式入口反馈，但不代表所有条目、长时间播放、快进及重播均通过。站点搜索同源第二页请求若在手机网络失败，脚本只返回默认视频页；若用户报告仅剧集搜不到，先核对这一分支。

### 历史：Rou 剧集库置顶并接入正式接口（2026-09-29）

用户提供 `https://rou.video/series` 截图，要求将“劇集庫”放在 Rou 分类第一位、直接发布正式接口，再由其在手机验证。功能提交 `9e879d3`：`js/rou.user.js?v=5` 增加 `/series` 分类、网站的排序／连载状态／标签筛选、剧集卡片和 `/s/<id>` 分集详情；常规视频 ID 改为带 `v/` 前缀，使两类详情共用 `https://rou.video/${id}`。正式 `json/supjav.json` 增加第六站 Rou，**仅 Rou 站点覆写为 `jar/gm_subs-v36.jar?v=36`**，正式全局 JAR 仍为 v35，原五站对象未变。独立测试入口同步到 v5；TV、APK、JAR 文件均未改。

已验证：网站 `/series` 卡片与 `/s/<id>` 分集结构、排序／状态参数、分页；脚本语法、新站与既有适配测试、JSON 解析、原五站对象及全局 JAR 不变检查、`git diff --check` 均通过。`9e879d3` 已推送，Pages 发布成功；裸正式 URL 返回六站配置且 Rou v5 脚本与提交内容一致。手机 `vodUrl` 已逐字核对为裸正式 URL，点播中选中 Rou，首个分类“劇集庫”列表有卡片；打开一条剧集可见“Rou 劇集”线路与第 1–6 集，筛选面板显示排序、连载状态、标签选项。手机已返回 Rou 剧集库列表，交给用户测试。

未验证：用户尚未在**正式入口**实播剧集分集，也未反馈各排序／状态／标签组合、翻页、搜索、持续播放、快进、返回重播或多条目表现。此前“播放没有什么问题”仅是 v36 **测试入口旧版普通视频**的用户反馈，不能算本次正式剧集播放通过；手机列表和分集按钮出现也不等于可播放。若用户反馈异常，先分清剧集与普通视频、分类请求与 HLS 代理，勿直接扩大到全站。

### 历史：Rou 首页提速与主分类（2026-09-28）

用户在 v36 测试入口实播后反馈“播放没有什么问题”，同时指出首页慢、分类需要完善。提交 `5cbbcae` 更新独立测试入口的 `js/rou.user.js?v=4` 和 Rou 配置：`homeContent` 改从比 `/home` 更轻的 `/v` 加载，只返回分类元数据，不等视频卡片；分类按网站视频库的“全部”及六个主分类路由 `/v`、`/t/<分类>`，支持“最新发布／最多观看／最多喜欢”排序和网站分页。详情与 v36 播放代理未改，正式 `json/supjav.json`、v35 JAR 和 TV 均未改。测试接口仍为 `https://jokers963.github.io/CatVodSpider/json/new-sites-test.json`。

已验证：浏览器确认 `/cat` 的六个主分类、`/v` 和 `/t/OnlyFans` 的列表、三种排序及 `page` 参数；同次电脑请求 `/home` 约 82.7 KB、`/v` 约 24.4 KB，不能等同手机耗时。脚本语法、新站/既有适配测试、JSON 解析和 diff 检查通过。Pages 配置已返回 `v=4` 与分类模板，远程脚本和提交内容按换行标准化后相同。手机重新加载了测试接口，Rou 页面显示七个分类；切换“自拍流出”和 OnlyFans 均有卡片，OnlyFans 的“最多观看”选项可选，列表重新出现。用户要求接手测试后，手机已停在 Rou 测试页面，不再操作。

未验证：用户尚未反馈 v4 在其操作下的首页体感速度、所有六个分类、排序结果正确性、翻页及多条目播放。用户先前的“播放没有什么问题”是 v36 测试反馈，不能推出 v4 全站稳定。尚未获得用户把 Rou 接入正式接口的指示；继续保留为独立测试入口。此前顶部 v36 段落的“尚未由用户实机确认播放”是该段写入时的历史状态，以本段用户反馈为准。

### 本轮：Rou `roUd` HLS 独立测试候选（2026-09-28）

用户要求开始做 Rou，并要求候选完成后直接加载到手机由其验证。提交 `efce677` 只更新独立测试入口：新增 `jar/gm_subs-v36.jar`，令 `json/new-sites-test.json` 指向 v36，并在 `GMSubs` 现有 HLS 代理中加入 Rou 解包；正式 `json/supjav.json`、v35 JAR、五个正式站点和 TV 源码均未修改。手机现已加载 `https://jokers963.github.io/CatVodSpider/json/new-sites-test.json`，进入点播后曾显示 `Rou (测试)`，随后首页列表出现 12 个可见卡片；已停在该列表等待用户亲自点播。

已确认此前约 1–2 MB / 1–2 KB 的 `image/png` 不是普通占位图：当前网页播放器脚本会查找 PNG 自定义 `roUd` chunk，首字节 bit 0 表示 zlib/deflate。一个实时主清单样本的 1505 字节 PNG 解包为 8186 字节、以 `#EXTM3U` 开头；其首个分片样本的 1,951,576 字节容器解包为 1,946,740 字节、首字节为 MPEG-TS 同步字节 `0x47`。候选仅对无用户信息的 HTTPS `rou.video/api/hls/` 初始地址启用现有本地代理；同一流里的清单和分片再按内容识别 `roUd`，压缩内容用 JDK `InflaterInputStream`，复用既有清单 URI 改写和分片转发。清单最多 8 MiB、膨胀输出最多 64 MiB；没有新依赖、重试、播放器修改或外部播放器。

已验证：22 项 `GMSubsTest`（含压缩清单、未压缩 TS、PNG 尾部截断及 URL 边界）通过；离线 javac/D8、JAR 结构/引用和 quiet 组合检查通过；`new-sites.test.cjs`、既有 adapter、Rou 脚本语法、测试 JSON 与 `git diff --check` 通过。Pages 测试 JSON 已返回 v36，远程 JAR SHA-256 `6B38A7474644176A3891DC460516F896344302F5FD9B0F0A03E1112A41CCF2CC` 与本地逐字一致。完整 Gradle 任务因本机 Gradle daemon 无法建立 loopback 连接而未成功，不能写成完整 Gradle 构建通过；离线脚本复用了历史缓存的 app 编译 API JAR。

未验证 / 未完成：尚未由用户实机确认首次播放、持续播放、快进、返回重播或多条目；手机只证明远程测试配置和 Rou 首页列表已加载，不能据此声称播放已修好。也未验证所有分片都采用相同包装上限，当前解析只在前 64 KiB 内寻找 `roUd`（实时样本满足）；若出现更大的前置 PNG chunk，再改为全流 chunk 扫描。未接入正式接口，必须等用户明确验收和授权后再提升 v36/Rou，不能提前改正式配置。

### 本轮：Hanime1 完整首页候选（2026-09-28）

用户要求把 Hanime1 首页补完整，并在完成后加载到手机由用户验收。初版候选 `ec0263f` 后，用户反馈首页和分类慢、部分分类不出结果；`221f3a5` 补齐另一套分类卡片 DOM，`fe354b8` 改用较轻的数据源。用户随后要求删除播放器自动插入的“推荐”页并继续提速，`0971d80` 让首页只返回分类元数据、无影片列表，从而不触发 TV 的“推荐”伪分类，并使用 GM 已支持的 `blockList` 屏蔽页面样式、字体、广告和统计请求。用户确认测试效果“可以了”并明确要求接入正式接口；提交 `0c03947` 已把同一执行体提升到正式 `js/hanime1.user.js?v=3`，正式 `json/supjav.json` 增加分类、筛选和资源拦截。其余四站、正式 v35 JAR、APK 和 TV 源码均未修改。

已验证：接手前 `origin/main` 与干净隔离工作树同为 `23e7941`，原接口工作树和旧候选工作树的未提交改动只读保留。正式发布前，正式脚本执行体与已验收测试 v3 逐字比较通过；发布前后其余四站对象及 v35 JAR 地址与基线一致。Pages 正式 JSON 的 Hanime1 对象和远程正式脚本已与提交 `0c03947` 逐字核对。站点使用真实的 10 个分类 ID，含排序、日期、时长三组筛选和分类分页。三套旧卡片分类桌面实页分别取得 41、41、20 条有效卡片，其余七类各 59 条。自动测试、脚本语法、正式/测试 JSON 解析和差异检查通过。测试入口上，首个真实分类与可见卡片一次 ADB 粗测约 3.8 秒出现，3DCG 约 3.9 秒；用户随后认可并授权转正式。手机已切回裸正式 URL，站源标题为 Hanime1，分类和列表可见且无“推荐”。

未验证 / 未完成：用户尚未完成正式入口复验；三组筛选、搜索、多清晰度、播放、快进和返回重播均不能写成正式已通过。切正式过程中手机曾显示一个 Hanime1 详情/线路页，但未观察播放状态或进度，不能算播放验证；已返回分类列表。分类页保留站点每页全部结果，没有为速度截断；进入站点后直接选择首个真实分类，不再展示独立首页影片页。标签是网站多选能力，而 TV 现有筛选协议为单选，本轮未把它伪装成不等价的标签筛选。后续以用户的正式复验结果为准，不要把测试入口性能观察扩大成全站稳定结论。

### 1. 仓库、正式入口与当前版本

| 对象 | 当前核对结果 |
| --- | --- |
| 接口 fork | [jokers963/CatVodSpider](https://github.com/jokers963/CatVodSpider)；Rou 正式功能提交 `9e879d3`，本交接更新提交在其后；接手时核对实际 `main` HEAD |
| 播放器 fork | [jokers963/TV](https://github.com/jokers963/TV)，本地 `fongmi` 为 `4afc4473e22a7ed3d98ee12233e0c2a490061000`；**本地 TV 仓库严格只读** |
| 正式手机配置 | 新主地址 `https://jokers963.github.io/CatVodSpider/json/luoyuqiu.json`；旧 `json/supjav.json` 保持兼容；不是 GitHub `blob` 页面、本地文件或根目录 |
| 正式 Spider | 全局 `jar/gm_subs-v35.jar?v=35`；仅 Rou 站点覆写 `jar/gm_subs-v36.jar?v=36`；此次未重新构建或替换 |
| 正式站点 | 🎬 SupJav、🎬 MissAV、🎬 Jable、🎬 AV01、📺 肉视频（key `rou`）、🎨 Hanime1，共 6 站；2026-09-29 从 Pages 直接读取确认 |
| 正式脚本缓存版本 | SupJav `v=34`、MissAV `v=8`、Jable `v=8`、AV01 `v=5`、肉视频 `v=6`、Hanime1 `v=3` |
| 手机 | 2026-09-29 ADB 已连接；`com.fongmi.android.tv` 版本 `5.6.6`。当前加载裸正式 URL；六个表情站名已在菜单显示，选中第五项“📺 肉视频”；大小保持原先的“大”（三列）。设备状态会变化 |

源码位置：接口 `D:\CodexWorkspace\Android\影视\CatVodSpider`；播放器 `D:\CodexWorkspace\Android\影视\TV`。原接口 `main` 工作树停在旧提交 `1d97a24`，落后远程且有用户改动和未跟踪的 `交接.md`，**不要重置、清理、覆盖或直接从它发布**。本轮发布来自新的隔离克隆 `C:\Users\Administrator\Documents\Codex\2026-09-28\https-github-com-jokers963-catvodspider-blob\work\CatVodSpider`；旧候选工作树 `C:\Users\Administrator\AppData\Local\Temp\catvodspider-release-v34-20260927` 含未提交改动，**不得误当正式代码或覆盖**。接手时重新查看 `git status`、`origin/main` 和 Pages，不假定上述快照仍然新。

### 2. 一分钟理解调用链

手机 TV 宿主读取 Pages JSON → 通过 `DexClassLoader` 加载 JAR 的 `csp_GMSubs` → `GMSubs` 调用第三方 `jar/gm.jar` 的 GM WebView 运行对应 `js/*.user.js` → 脚本返回统一的首页/分类/搜索/详情/播放数据 → `GMSubs` 必要时处理 HLS 代理和字幕 → TV 内置 Media3/ExoPlayer 或 mpv 播放。JSON **不是视频服务器**；列表成功、拿到 URL、出现缓冲都不等于实际播放。`GM` 返回 `type: match` 后还会等待媒体请求；不要在 Java 中把初始脚本返回误当最终地址。MissAV 不要擅自改回带 `name` 的 `finalUrl`。

先读本仓库 [AGENTS.md](AGENTS.md)、[接口原理](LUOYUQIU_ARCHITECTURE.md)，再按任务读 [正式 JSON](json/luoyuqiu.json)、[GMSubs.java](app/src/main/java/com/github/catvod/spider/GMSubs.java) 和对应 userscript。TV 只读源码入口：`VodConfig`、`BaseLoader`/`JarLoader`、`SiteApi`、`PlaybackActivity`、`PlayerManager`、`ExoMediaSourceFactory`。旧接口原理文档指向的 TV 专属 `LUOYUQIU_ARCHITECTURE.md` **在此次检查的 TV `origin/fongmi` 文件树中不存在**；以实际 TV 源码和其 `README.md` 为准，勿把坏链接当作已读文档。

### 3. 站点事实与未完成项

| 站点/线路 | 已有证据 | 不能声称的事 / 下一步 |
| --- | --- | --- |
| SupJav TV | 之前在正式入口的一条目复核为 `state=3` 且进度增长；v35 测试候选曾通过持续播放、快进 | 未完成所有视频回归；验证新改动时重新测。ST/VOE 已按用户要求取消，不要恢复 |
| SupJav FST | v35 已加入限域代理和 30 秒总期限；SNOS-377 曾多段播放且快进后恢复 | ABF-381 仍有慢读、短读与长缓冲不确定性；不能说整线稳定。用户明确说 SSIS-001 的 FST 自身有问题，不用管 |
| MissAV/Jable/AV01 | 原四站正式保留，历史记录有功能测试 | 本轮未做多视频/长期回归；不因保留在 JSON 就写成完全稳定 |
| Hanime1 | 正式 v3 已使用真实分类 ID、分类分页、三组筛选和资源拦截；不再显示“推荐”。测试入口由用户认可后发布，正式手机已显示分类与列表 | 正式入口的筛选、搜索、多清晰度与播放回归仍待用户复验；不能由测试列表出现推断整站稳定 |
| Rou | 正式 v5 已新增置顶“劇集庫”与网站六个主分类；用户反馈正式入口播放没问题。正式 v6 修复搜索关闭与缺少路由，手机“AI”搜索可见 Rou 条目 | 搜索 v6 仍待用户验收；视频/剧集分别命中、翻页、中文/特殊字符、空结果及长时间播放等未逐项验证，不能推断全站稳定 |
| AirAV | 独立测试入口曾有一条目手机播放、快进、重播通过；2026-09-28 桌面浏览器首页可访问 | 先前切正式时手机首页遇真人验证，已撤回；此次未重做手机验证，**未纳入正式** |
| JavMenu | 用户曾提出此站 | 没有适配脚本/实机测试；此前自动浏览被安全边界拦截，勿换途径绕过；**未纳入正式** |

Rou、AirAV、Hanime1 的动态列表中曾出现年龄身份暗示的性化条目。先前 AI 因此没有发布 Hanime1 功能性分类或 Rou/AirAV 整站新接入；这不是对每一作品实际年龄的事实裁定，也**不是** Rou 播放失败的技术根因。新 AI 应独立遵守自身安全要求，不要把用户的“用任何方法”理解成允许绕过安全、验证码、付费或访问控制。有关内容不在交接中复述、传播或保存具体标题和媒体地址。

### 4. 构建、发布与实机验收规则

- `json/new-sites-test.json` 是独立远程测试入口（含 Rou、AirAV、Hanime1），**不是正式手机配置**。Rou 已按用户明确授权加入正式 JSON；仅 Rou 使用站点专属 v36 JAR，其他站仍用全局 v35。JAR、APK 和 TV 源码未改，正式状态以上表为准。
- JS 最小检查：`node --check js/<站点>.user.js`、`node js/new-sites.test.cjs`、`node js/adapters.test.cjs`；Hanime1 导航另有 `node js/hanime1.nav.test.cjs`。再验 JSON 解析、`git diff --check`。测试通过只说明脚本结构/模拟数据，不代表实播。
- JAR 构建入口 `scripts/gmRelease/build-check.ps1`（先读脚本并指定新的独立输出目录）；它依赖本机 JDK/SDK/缓存和部分生成文件。历史上 21 项 JUnit、手动 javac/D8/结构检查通过，但**没有成功的完整 Gradle Debug 构建，也没有本轮新 APK 安装**。不能把手动 JAR 检查写成 `assembleDebug` 成功。
- 改站点先用独立远程测试 JSON/JAR/脚本，确认可用后才评估正式发布。正式发布只做任务范围内文件的非强推提交，确认 GitHub Pages 实际 HTTP 内容和缓存版本，再从手机**正式远程 URL**重新加载验证；本地地址不能代替。
- 手机不清数据、不盲填配置历史、不改变方向锁定/VPN、不使用外部播放器、不自动点击验证或宣称验证成功；不遗留 WebView 调试。确认实际站点/线路，至少两次观察 `state` 与进度自然增长，并验首次、持续、快进、返回重播。`state=6` 是缓冲，`state=7` 是错误，需结合进度与错误类型，不能设几秒死线。
- 不输出 Cookie、凭据、签名媒体 URL、完整日志、设备序列号或私有地址。TV 本地工作树有大量原有未提交改动，**只读，不修改、不 reset、不覆盖、不提交、不推送**。两个 AI 协作时分离文件负责人、手机操作者和唯一发布人；未沟通前不要并发操作手机或同一工作树。

### 5. 给新 AI 的开场消息（用户复制这一段即可）

```text
请接手“落雨秋”项目。先读 jokers963/CatVodSpider 仓库 main 分支的 AGENTS.md 与 AI_HANDOFF.md 顶部“给下一位 AI 的最新交接”，按任务再看 LUOYUQIU_ARCHITECTURE.md 和实际源码。另一个 fork 是 jokers963/TV 的 fongmi 分支，本地 TV 工作树严格只读。正式接口是 https://jokers963.github.io/CatVodSpider/json/luoyuqiu.json；旧 supjav.json 兼容保留。
先核对远程版本、Git 状态和未提交文件，再说明你准备处理的具体问题；不要覆盖用户改动，不要把测试入口、本地地址或单条视频成功当成正式验收。当前我交给你的具体任务是：<由我填写>。完成后请更新交接、列出已验证与未验证结果，方便再交给下一位 AI。
```

---

### 历史：2026-09-28 Hanime1 顶部导航展示

用户将需求明确收窄为截图最上方的 10 个分类名称，不包括第二排筛选栏或分类结果列表，且明确不修改 TV 播放器。提交 `54864b6` 已正常推送到接口仓库 `main`；正式 `json/supjav.json` 仅把 Hanime1 脚本缓存版本改为 `v=2`，其余四站、运行 JAR 和 Hanime1 其它路由未改。`js/hanime1.user.js` 仅在首页结果中增加 10 个导航名称；类型 ID 为 `nav-1` 至 `nav-10`，没有配置 `categoryContent`，故点选后的分类加载**未实现**，不得称为功能性分类或网站样式的像素级复刻。播放器现有原生界面负责呈现这些名称。

本地 `node --check`、单站导航测试、既有适配器测试和差异检查通过；GitHub Pages 正式 JSON 已返回 Hanime1 `v=2`，远程脚本 HTTP 200 且包含导航。用户将自行在手机重新加载并验证外观；本轮没有手机验证、APK/JAR 构建或 TV 修改。之前隔离工作树中的分类列表候选和其它未提交改动未合入本次发布，也不得据此推断其可用性。

### 历史：2026-09-28 新站接入

用户要求逐站接入 Rou、AirAV、JavMenu、Hanime1，并保持昨晚 v35 正式接口可用。当前正式入口仍是 `https://jokers963.github.io/CatVodSpider/json/supjav.json`；最新发布提交 `62b9052`，站点为 SupJav、MissAV、Jable、AV01、Hanime1。原四站 JSON 对象及 `gm_subs-v35.jar?v=35` 完全未变；没有新 APK/JAR 或播放器源码修改。手机点播地址已恢复且逐字核对为裸正式 URL，重新加载后站点菜单也是这五站。旧下文“四站”的说法是 2026-09-27 历史快照，不是现在的正式站点数。

- Hanime1：`js/hanime1.user.js?v=1`。独立远程测试入口及正式入口各在手机验证同一条目，内置播放器 720 线路为 state=3 且进度两次增长；测试入口快进后继续增长，返回重播继续增长。首页和详情/多清晰度可用。浏览器搜索页面有结果，但手机搜索未完成验收；单条目通过不代表全站稳定。
- AirAV：`js/airav.user.js?v=1` 在独立远程测试入口的一条目成功内置播放，进度增长、快进、返回重播均通过；切正式入口时首页遇到真人验证，未代点，无法稳定加载。已从正式 JSON 撤回，脚本和测试入口保留，不能写成正式可用。搜索也未验收。
- Rou：`js/rou.user.js?v=3` 能在手机列出首页、打开详情；修复了卡片标题读取及网页加载后初始化脚本消失的问题。手机播放未启动；抽查三个不同条目的站内 HLS 路径均返回 `image/png`，不是可播放清单。未纳入正式。不能以“拿到 URL”称播放成功。
- JavMenu：自动浏览被安全策略明确拦截，不能换其他浏览器/命令/渠道绕过；未写适配脚本、未纳入正式、未实机测试。
- 独立远程测试入口 `json/new-sites-test.json` 包含 Rou/AirAV/Hanime1 三站，不是手机当前配置，也不是正式接口。新脚本自检 `node js/new-sites.test.cjs`、既有 `node js/adapters.test.cjs`、脚本语法、JSON 和 `git diff --check` 通过。未运行 Gradle/生成新 APK，因为这次仅新增脚本和 JSON。
- 正式配置发布后，手机 SupJav 首页/TV 单条目复核为 state=3、进度 43175→63144 ms，证明该次基本播放链路仍通；没有对原四站全部多视频回归。手机未改方向锁/VPN、未清应用数据、未启用 WebView 调试、未使用外部播放器。

更新日期：2026-09-28。这是两个 fork 共用的工作状态入口；原理说明不在这里重复。以后完成一项任务或交接前，更新此文件的状态与证据。

### 历史快照：2026-09-27 正式 v35（以上 2026-09-28 状态优先）

**本轮已收尾，状态为部分完成（正式版本已发布，FST 尚未全部稳定）**。用户在正式地址已加载后明确说“不用确认了”，因此停止追加实机验收，不再测试、不自动约定明天运行。手机最后在正式配置的 SNOS-377/SupJav 详情加载流程；没有再确认实际线路或进度，不能称为正式入口发布后回归通过。两个脱敏日志流已 Ctrl-C 停止，未清 Logcat。后续 AI 只有收到新的任务才操作手机。

- 用户最新授权：“先把当前体验最好的转正式接口，剩下明天再说”。不再扩大今晚排查；SSIS-001/FST 用户已明确排除。正式地址仍 `https://jokers963.github.io/CatVodSpider/json/supjav.json`。
- 正式 JSON 切换提交 `f9ba37b`，新增窄匹配 `https://fc2stream.tv/*.m3u8*`，JAR 指向 `jar/gm_subs-v35.jar?v=35`。四站仍 SupJav/MissAV/Jable/AV01，四份脚本版本不变（33/7/7/4），不恢复 ST/VOE/取消站点。旧 `jar/gm_subs.jar` v34 文件不覆盖，保留回退；只改 JSON 即可回退。
- 发布 JAR SHA-256 `1BBDC264655677F915438D9A9083B04576D6F8EA16A48D15C369326E107592EB`；DEX 分别：primary `8DD113834DB154C3DD34098F8C05911CCD7D9A02BE872E31715A82C92238DD3C`、wrapper `A29A61FF97A69671C21F3F79C86C967BA13284097A4F57648E2D3CF59395CA61`、quiet helper `7FE7CDE550EBFC0E70C4F0A712AF1D9ED9C1C6C5464BD47C4A28D01E1012D759`。**正式 v35 primary 有意修改**：Sentry SDK 入口改 no-op，原始日志/无参异常输出改静默 sink；不再声称正式 primary 仍为 v34 原始 DEX。类定义不变，非目标条目保持。没有开启 WebView 调试、网络探针或 Diagnostic JS bridge。
- GMSubs 最小正式改动：FST HTTPS 精确域名清单复用已有 TV PNG/TS 代理；代理读失败关闭连接/流并重新抛原异常；整个代理请求 `callTimeout(30s)`，保留 connect/read 15/30s。总期限同时作用于此共享代理的 TV/FST/AV01 清单，未改变 TV 分流/字幕逻辑。没有新重试/缓存/外部播放器。**不含 HTTP/1.1 强制、不含 FST 720p 临时 cap、不含任何 GM_DIAG 日志/探针**，保留 TV/FST 自适应画质。AV01 原有 token 720/1080 逻辑不动。
- 发布前 quiet 候选从远程加载，SNOS-377/SupJav 详情和实际线路核对。TV `state=3,23845/380048434 → state=3,67084/380091668`，自然增量 43239/43234 ms；快进后 `state=3,122534/380132653`，比自然时钟多约 14.5 秒，恢复播放。切 FST 后 `state=3,149671/380170730 → state=3,206257/380227325`，自然增量 56586/56595 ms。此候选 JSON 与发布正式 JSON 语义完全相同。发布后裸正式地址只读 GET、v35 JAR HTTP 200/哈希核对成功；手机输入框及配置行逐字确认已加载裸正式地址（无 query），随后用户取消进一步实播确认。
- 构建：21 项 JUnit、手动 javac/D8/包装结构引用检查、27 项脱敏检查、quiet DEX 无 Android 日志/网络/diagnostic 方法检查、脚本语法/adapter/JSON/diff 检查通过；组合 JAR 逐项核对只有 classes2.dex 相对于 quiet 隐私基底变化。没有成功的完整 Gradle 构建，也没有新 APK/安装。测试平台探测有 JVM Android Log 警告，最终 JUnit 成功，不能伪装为设备编译失败。
- 可重复构建入口：`scripts/gmRelease/build-check.ps1 -OutputDir <新的临时目录>`，复用 `scripts/gmSubsManual/` 和 `scripts/gmDiagnostic/ -Quiet`；输入保持 v34 的 `jar/gm_subs.jar`。已实际运行通过，第二次产物与发布 JAR 的三个 DEX 逐字节一致（ZIP 时间戳不同使整个 JAR hash 不同）；没有覆盖已发布字节。依赖本机 JDK/SDK/Gradle 缓存以及已有 app 编译 API JAR，不声称全新电脑上无准备可构建。产物在新目录，不覆盖正式/用户工作树。
- 待明天：ABF-381/FST 间歇慢读/缓冲；部分分片 EOF 字节数与 Content-Length 不一致及进度跳变原因；需要更长、多样本实播。r14 HTTP/1.1 只有短时 SNOS-377 读流对照（多数完整快速 EOF），没有完整双线路/多样本回归，因此不合正式。SNOS-377 r13 已有首次两段自然增长、快进后仍播放、返回重播 70 秒自然增长证据，但首次有慢读及一分片短读，不能称整条线路稳定。质量 cap 是否实际生效未观测，不作为正式选择依据。
- 已保护原 CatVodSpider 脏工作树与 `交接.md`；TV 严格只读，HEAD `4afc4473e22a7ed3d98ee12233e0c2a490061000`，39 项脏状态摘要仍 `DC3596C468B00BCCE3E645DEC04198E3C11998472A89166E0879A36C023FB9FD`。所有发布操作来自隔离分支正常 push，无强推/重置/清理。此次获正式发布授权后同步 GMSubs、测试、诊断/quiet/组合构建源和本记录，未来可从远程接手，不再只依赖未提交临时源码。

### 最新 FST 排查快照（2026-09-27，覆盖后面的旧快照）

本轮仍在进行，以下新增记录优先于旧收尾文字：

- 当前远程测试 main `200b4ad`，独立 `gm_subs-diagnostic-fst-deadline.jar?v=13` SHA-256 `0BE74D5321EB0D7DE2DE7D2D3B09F5DB208BDF18ACD1B2BB03E01661939C1E50`，远程核对并实机加载。r13 ABF-381/FST 成功响应的分片 id27 `length=4686910`、读到 898022 bytes 后 `outcome=io,ms=30001`；id28/34 同样 30001 ms 中止，证明整个读流期限生效。但仍缓冲，且位置有远大于时钟的跳变，不能算自然播放通过，不确定时间轴/人工操作/流重试哪个因素。TV 构建/初播能运行，不证明完整回归通过。
- 后续 HTTP/1.1 对照包装源已在本地编译、JUnit 21 项/D8/结构检查通过，临时产物 `luoyu-gm-fst-http1-349d363d229741a397c02d03e1d9e02c/codex-gm_subs.jar`。**未组合隐私候选/未上传/未在手机加载**；源码 stream 的单 HTTP_1_1 配置是这个未发布对照，不要错说当前 r13 实播用了 HTTP/1.1（实际日志 h2）。正式 six 文件不变。质量 cap 仅按最终清单主机判断，尚未观测实际轨道/重定向后是否被应用，不能称已确认手机以 720p 播放。
- 用户新增要求 SNOS-377/FST。正在用远程 r13（非正式入口，h2/30s 总期限）验证。搜索结果异步到达会改变顺序：曾点到 AV01，随后返回按结果 `site=SupJav` 选择，详情标题/站源/实际 FST selected 全部核对。不可盲点列表第一条。清单/分片 HTTP 200；`state=3,49019/379086286 → state=3,89338/379126605 → state=3,123249/379160514`，自然增量 40319/40319 ms、33911/33909 ms，两段持续增长通过。分片 id12 EOF 1585662 bytes/13292 ms，其余多次 1 秒内；不代表长时稳定。随后 keycode90，快进/返回重播待完成。

- 用户最新明确：SSIS-001 视频的 FST 线路本身有问题，**不用管**。停止该样本排查，不再列为接口修复验收项，也不尝试恢复/替换该视频资源。前面的解析失败仅保留为历史观测，不能继续按待修接口缺陷派任务。

- r12 已远程核对并加载手机。首次 FST 分片 id9 EOF 81830 bytes/28345 ms，id23 1784190 bytes/18573 ms，id27 1931582 bytes/15031 ms；其他多次在 1 秒内完整 EOF。快进后 `state=3,150627/378223973 → state=3,199027/378272554`，自然增量 48400/48581 ms，但只能证明该段恢复。
- r12 返回 ABF-381 结果后重进并重新选择 FST，matched/result。`state=3,26386/378354191 → state=6,43164/378391992 → state=3,55873/378437642`。同一轮实际分片 id8 前缀就绪 2683 ms，随后 EOF 877646 bytes/100038 ms；id9 1684926 bytes/231 ms。观测明确定位到成功响应后的全体分片读取可拖到 100 秒，非只等待解析。零星数据使 readTimeout(30s) 不触发，总请求此前没有 callTimeout。不能由此确认 ISP/VPN/CDN 哪个环节，未改变网络。
- 最小边界修复正在验证：复用 OkHttp `callTimeout(30,SECONDS)` 限制整个请求及读流，保留原 connect/read 15/30 秒，无新增重试/缓存/下载线程。这修复本地无总时限的慢读等待，不代表上游吞吐稳定；r13 实机是否按期限失败、播放器是否恢复和 TV 回归尚待记录。

- r10 720p 对照在后续 `state=6,172463/377089574,buffered=172766` 耗尽缓冲；随后恢复并继续增长，但不能宣布降档解决稳定性。
- 发现并修复独立候选的连接资源缺陷：成功收到分片 Response 后，`stripFakePng` 前缀读取抛 IOException 时此前没有关闭 Response；现失败路径关闭并重新抛出原错误。r11 手动 JUnit 20 项、D8/结构检查通过，只发布独立 JAR/JSON，提交 `9f2ce86`。远程 `gm_subs-diagnostic-fst-io.jar?v=11` SHA-256 `D2F3A56218204DFC9FCEB43A69137C68D8611BB3132FDF4F529301BBFEF65FAA`，已核对并从远程加载手机。
- r11 ABF-381/FST matched/result、实际代理清单三次 HTTP 200；分片 id7 前缀就绪需 7695 ms，id9 需 3862 ms。`state=3,26870/377733127,buffered=60033 → state=6,63497/377774913,buffered=64300 → state=3,116564/377848274,buffered=170033`。等待期间目标进程出现 SocketTimeoutException，但前缀阶段日志无 timeout；不能只凭异常类确认是哪一请求。仍未稳定。
- r12 使用标准 FilterInputStream 观测返回流 EOF/close/IOException，固定日志只有请求 id、结果枚举、大小、总耗时，最多 64 请求，不打印媒体、URL、头或正文。读取失败立即关闭源流并保留原异常，新增前缀后的 synthetic timeout 关闭测试。手动 JUnit 21 项、D8/结构检查通过；JVM 的 Android 日志平台探测有警告但最终测试通过。合成隐私基底 JAR，逐项比较只有 classes2.dex 改变。额外 HTTP 探针仍关闭。
- r12 提交 `7fa34d3` 只独立 `jar/diagnostic/gm_subs-diagnostic-fst-body.jar?v=12` 和测试 JSON 指针；JAR SHA-256 `C0938CFD8C45518915FF61D0AAFD32913073B3DFD507ED6B1C42C2E27E21441C`。实机加载与最终收尾待下面追加；没有新 APK 或正式资源更新。Java/测试/诊断构建源/本 MD 仍仅隔离工作树未提交。

当前继续任务：用户再次要求继续查因、修复并验证。主负责人独占隔离工作树与手机，继续限定独立远程测试资源，正式接口/TV/方向/VPN 不改。新 r6 对照探针比较同地址捕获请求头与移除 Referer/Origin 的请求，最多两组、各三层、媒体最多 256 KiB，仅记录状态、类型、时间、大小及清单档位摘要，不输出地址/头/正文。诊断构建与 27 项脱敏检查通过；`afe6f88` 已推送独立测试 JAR/JSON，手机是否加载及最终恢复状态待本轮收尾记录，下面“已收尾”是上轮状态。

本轮新增证据/候选（收尾前仍属进行中）：

- r6 实机：捕获头主/子清单 HTTP 200，首分片 HTTP 206，256 KiB/736 ms，PNG 类型；移除 Referer/Origin 后主清单成功，但子清单超时，因此不能归因或修复为“去掉 Referer 即可”。主清单 3 档，最高标称带宽 3103220 bps，观测清单未含加密标签。
- r7 实机：同一 FST 首分片两种请求头均 HTTP 206，PNG 后的 MPEG-TS 同步位置为 70 字节；两次 256 KiB 分别 483/254 ms。复用 GMSubs 已有 `tsOffset` 通过反射确认，不保存/打印字节、URL 或头。说明媒体是 PNG 前缀包裹的 TS，不证明所有超时或缓冲都由此导致。r7 未改播放器输出，手机仍见缓冲。
- 最小候选修复：`GMSubs.needsPngProxy` 限定 HTTPS `fc2stream.tv` 的 `.m3u8`（拒绝带用户信息/近似域名/其他站点），复用原 TV 清单改写、分片请求和 `stripFakePng`，不改变 TV/AV01/MissAV/Jable 的分流。新增边界测试；手动 JUnit 18 项、D8、结构引用检查通过。Java 源/测试仅在隔离工作树未提交。
- `88a3862` 只发布独立 `jar/diagnostic/gm_subs-diagnostic-fst-proxy.jar?v=8` 和测试 JSON 指针。候选 SHA-256 `BD9217AD902594A37A5C9C74F1D8015241863CBA812786D4422B1E0C08366FF8`；包装 DEX `86F84B4645D6A09790A58C8C7FF63A0C79DE499137AB9BDCCF688C014D228D66`。额外网络探针在编译时关闭，反汇编 `inspect` 只有 return-void；脱敏阶段日志/遥测关闭保持，实播回归不与额外下载竞争。未生成播放器 APK。
- 可重复构建/组合：先 `scripts/gmSubsManual/build-check.ps1` 生成新包装 DEX，再以 `NETWORK_PROBE=false` 的 `scripts/gmDiagnostic/build-check.ps1` 构建 v34 隐私候选；复制该候选到新临时产物，用 JDK jar 仅替换 `classes2.dex`（来源为前者 `codex-update`）。组合后逐项比较除 `classes2.dex` 外与隐私候选字节完全一致，包装 DEX 与手动构建哈希一致。旧构建/正式 JAR 未覆盖。
- r8 关闭额外网络探针后 FST 进入播放，但 `state=3,36904/375890480 → state=6,71886/375946923 → state=6,73710/376025807 → state=3,101368/376127232`，仍有长缓冲。不能把去 PNG 头候选说成已解决加载稳定性。
- r9 `13421c6` 添加临时限量代理阶段元数据（不含请求地址/头），只改独立 JAR/JSON；SHA-256 `ECC348C366BF6BB8023556E5DF469BED718FA7D0001ADE5476EE9292956CFF31`，包装 DEX `DAB9C9CEECEA5B5F69C4969BCCC533D380841D184C0886E69E60C53656646EFE`。实机先 TV，再 FST：FST 匹配/result 后确实出现代理 playlist start/status=200，证明新代理路由被执行，而非仅编译成功。计数上限 12 包含此前 TV 请求，后面没有新的代理日志不能当作没请求。
- r9 FST `state=3,27482/376401451 → state=3,84704/376483974 → state=6,110137/376583523`；第一段播放增加 57222 ms、时钟增加 82523 ms，有约 25 秒停顿，第二段同样不足自然增长。正在只对测试 FST 暂限 720p 做对照（不改 TV 或正式配置、不改手机全局轨道/VPN），并新增隔离边界测试，手动 JUnit 19 项通过；尚无该限档候选的实机结论。
- r10 `a156f34` 仅独立测试 JAR `gm_subs-diagnostic-fst-720.jar?v=10` 与 JSON 指针，远程 SHA-256 `4F40FF49F4FF939E0A6B6E123CA39A2CB8A76293F1077DE94A7A3248279CC973`（与组合产物一致），包装 DEX `475CFC2FDB0F7E368BC85C16416E87F5782CC360231ED04D8FBCF7F5898A0F4E`。额外网络探针关闭，保留最多 12 次固定代理状态观测；cap 只作用于最终主机为 fc2stream.tv 的清单，保留 <=720p 自适应档，测试证明 TV 1080p 不被删除。不是正式降画质/发布。
- r10 ABF-381/FST 已实际选中并 matched/result。早期 `state=6,61417/376968643`，随后 `state=3,83271/377000376,buffered=140033 → state=3,135026/377052127,buffered=170600`，后段位置/时钟增长 `51755/51751 ms`，该段自然播放通过。后续持续、快进、重播及另一个样本尚待验证，不能据单段归因或宣布稳定。

- 本轮用户要求查明原因并修复，仍限定独立远程测试入口；正式接口六份运行文件和 TV 仓库未修改。原脏工作树、用户 `交接.md` 均保留。主负责人单独操作，没有新增子代理。
- 远程 `main` 已推进到 `1e6786419f5f4b02f9a584d05f2f25333c10782f`。独立测试入口仍为 `json/diagnostic/supjav-diagnostic-20260927.json`，引用 `gm_subs-diagnostic-network.jar?v=5` 和 `js/diagnostic/supjav-diagnostic.user.js?v=2`。当前候选 JAR SHA-256 为 `011E6121B64801366C042DEBD9F974C542308510D25490E75FA49F12B488788F`，远程 HTTP 200 且字节一致；脚本只增加脱敏阶段观测，保留原选择/返回语义。没有开启 WebView 调试。
- 已证实第一层缺陷：选择 ABF-381 的 FST 后，按钮、iframe 加载和播放清单请求均出现，但原配置未匹配 `fc2stream.tv`。提交 `3f46b8d` 只在测试 JSON 增加 `https://fc2stream.tv/*.m3u8*`。此后实际出现 matched/result，地址解析层修复通过；这不等于播放已稳定。
- 第二层证据：同一手机、ABF-381、FST，网络观测版最初在清单 GET 超时，播放器最终“连接超时”；当时未获得 HTTP 状态，不能确定是网络路由、服务端、会话/请求还是其他原因。只读检查发现 VPN 存在，但没有修改 VPN/网络设置，也不能据此归因。
- 分别从电脑和手机只读请求域名首页均 HTTP 200；手机 curl 约 0.8 秒返回。首页成功不代表签名媒体地址必定可用。阶段版 r5 重试时，实际清单 HTTP 200/HLS、子清单 HTTP 200/HLS、首个资源 HTTP 206；没有输出路径、查询、签名、头、响应体或私有 IP。随后 FST 从缓冲进入内置播放，`state=3,position=34686,updated=374146152,speed=1.0`。这是重试成功，不证明先前超时的最终根因已经解决。
- 另一个 SSIS-001 FST 样本仍发生解析失败，未见新的匹配清单；不能把 ABF-381 成功推广到所有条目。广告媒体域名在 TV 路径也出现，因此没有将广告请求加入媒体匹配。
- TV 切回恢复的两次 state=3 样本为 `24999/373838741 → 48819/373862556`，自然增量 `23820/23815 ms`；快进输入后 `75804/373874545` 为缓冲状态，该段不能作为持续播放通过。返回结果后重播 state=3 样本为 `14977/373925109 → 38680/373948822`，增量 `23703/23713 ms`。
- 本轮手动诊断 JAR 构建/隐私检查、诊断脚本语义检查、四站 adapter 检查和 node 语法检查通过。没有 Gradle/APK 构建或播放器 APK 安装，不能声称新 APK 成功。源文件 `scripts/gmDiagnostic/`、JS 自检和本文仍只在隔离工作树，未远程同步；远程提交仅含独立测试资源。
- 本轮已收尾：手机停在设置页，点播配置行逐字确认已恢复 `https://jokers963.github.io/CatVodSpider/json/supjav.json`；未补做正式入口恢复后的实播，因此恢复配置不代表该实播验收通过。结束时无 WebView 调试 socket、无 tcp:9223 转发，方向设置仍 `1/0`。没有清应用数据、Logcat，改变方向/VPN、自动点击验证码或使用外部播放器。
- 最终状态为部分完成：FST 缺失匹配规则只在独立测试 JSON 修好；ABF-381 曾内置播放，但反复缓冲且重播超时，SSIS-001 解析仍失败。没有将 FST 规则或诊断 JAR/JS 合入正式接口，也不宣称媒体加载不稳定的最终根因已解决。源/自检/本文仅本地保存，下一 AI 应从当前隔离工作树接续，不能只拿远程测试 JAR 当作完整源码交接。

#### 本轮后续观测（尚不等于全部验收通过）

- FST 重试播放后进度推进，但反复缓冲：`state=3,34686/374146152 → state=6,69986/374205027 → state=6,91194/374238321`。位置增加不是持续 state=3 的证明，不能将缓冲频繁的样本称为稳定播放。
- FST 快进前为 `state=3,91216/374273883`；输入 keycode 90 后 `state=6,106842/374274509`，随后 `state=6,109867/374288120`，只能证明跳转并有限推进，未通过快进后持续播放验收。
- FST 返回结果再重播，重新确认 ABF-381/SupJav/FST 选中，并出现 matched/result；随后探针 `phase=manifest,step=headers,error=timeout`，手机 `state=6,position=4890,updated=374365656`。`connect()` 已返回，超时发生在等待 HTTP 响应阶段，不是探针连接阶段；未取得状态码，不能再细分服务端、路径、会话或网络中间环节。该重播没有通过。现有播放器/接口不足以证明或修复媒体服务的间歇性响应问题，禁止靠无限重试/盲目延长超时或修改 VPN 掩盖。
- 正式六份运行资源在本轮末再次逐一远程 GET/哈希核对，全部与 v34 基线一致。TV 本地 HEAD 仍 `4afc4473e22a7ed3d98ee12233e0c2a490061000`，39 项脏状态的 SHA-256 仍 `DC3596C468B00BCCE3E645DEC04198E3C11998472A89166E0879A36C023FB9FD`。
- r5 下 FST 重播失败后切回 TV：`state=3,19833/374426476 → state=3,53676/374460321`，自然增长 `33843/33845 ms`；快进后 `state=6,69323/374460968`，随后恢复为 `state=3,109649/374501619`。TV 有连续增长、切换恢复与快进恢复证据，但仍只代表 ABF-381 样本。两个脱敏日志读流已 Ctrl-C 停止，未清 Logcat。

### 上一轮执行快照（历史记录，结束状态已过期）

- 用户已批准独立 GitHub 诊断测试入口及手机加载验收，随后明确要求安装测试辅助工具。主负责人是唯一文件、设备与发布操作者；子对话已停止。正式接口与 TV 仓库仍不允许修改。
- 已仅提交/正常推送两个新增文件，提交 `5d3e28157d00acbf436b3c49431a38f9fd32a1e6`：`jar/diagnostic/gm_subs-diagnostic-20260927.jar` 与 `json/diagnostic/supjav-diagnostic-20260927.json`。GitHub Pages 两者 HTTP 200，JAR SHA-256 为 `7FC343D8DABF0A661EB8702BABA6A9DB16CED984B3B7BBA5ABF83CBD47B46956`，JSON SHA-256 为 `2DCB3A7E835657B71AF7BE5E21231D221FC15385212F2D47AB8321D6692F704A`，与提交文件字节一致。测试 JSON 仅替换 spider JAR 地址，其余字段与正式配置一致。正式 JSON/JAR/四份脚本的远程 SHA-256 全部与发布前一致。
- 手机先核对当前配置为正式地址，再完整替换为 `https://jokers963.github.io/CatVodSpider/json/diagnostic/supjav-diagnostic-20260927.json`，确认输入逐字一致后加载。输入框有输入首个 `h` 自动追加 `ttp://` 的逻辑，不能直接把逐字输入结果当作正确地址；本次错误草稿均未确认加载。`GM_DIAG` 脱敏日志实际出现，证明候选日志出口已执行；仍未直接读取手机端 JAR 哈希。
- Maestro 最初报告 `INSTALL_FAILED_USER_RESTRICTED`。复用本机 `maestro-client.jar` 内的辅助 APK，经普通 `adb install -r` 成功安装 `dev.mobile.maestro`，随后界面检查成功；未 root、关闭系统安全检查或改方向设置，安装命令未使用 `-g`，未单独设置权限，不能声称逐项核验了全部默认权限。已存在 `dev.mobile.maestro.test`。没有编译或替换播放器 APK，播放器仍为 5.6.6。方向设置只读复核仍 `accelerometer_rotation=1,user_rotation=0`。
- 测试入口 SupJav 首页曾提示“站点验证未完成”，随后正常搜索 `ABF-381` 自然返回结果，未点击验证码。确认选中 TV，日志为 `matched host=cdn3.turboviplay.com kind=playlist` 后 result。三次 `state=3,speed=1.0` 样本为 `2937/updated=370959157 → 18599/370974817 → 48712/371004930`，两段位置/时钟增长为 `15662/15660 ms`、`30113/30113 ms`。快进后 `66225/371007773`，额外跳转约 14.7 秒。
- 确认切到 FST 后出现“播放地址加载失败”，`state=0,position=83579,updated=371025298` 不增长。脱敏摘要曾见 `static.javhdhello.com` 的 other 请求及 `cdn.storagexhd.com` 的 media 请求，但不能证明该媒体是正片而非广告，也没有 HTTP 状态/console/响应体证据；不得据此添加域名匹配或宣称根因已找到。切回 TV 后再次命中 playlist 并恢复 `state=3`，`104018/371137158 → 138895/371172035`，位置/时钟均增长 34877 ms。第二次 FST 同样失败，`state=0,position=139728,updated=371172870`；提前启动的连续 GM_DIAG 读流只见本次 load，缺少新的 matched/result，allowed 摘要按 loader 去重/限量，不能把没有新 allowed 当作未发生请求。流已停止，未清 Logcat。
- 本轮结束时已逐字核对并恢复正式点播地址，手机停在设置页，配置行再次确认等于 `https://jokers963.github.io/CatVodSpider/json/supjav.json`，不再播放或操作设备。正式配置/JAR/四脚本没有修改，TV 对照证据来自独立诊断入口；没有补做恢复正式地址后的 TV 重播，也没有完成诊断入口的返回重播测试，不能把恢复配置行当作这些测试通过。正式 GM 的既有遥测风险没有被这两个独立资源修复，下一步扩大观测应继续使用关闭遥测的候选，不能直接拿正式 GM 的完整 URL 日志调查。
- 当前仅本文为未提交改动，`scripts/gmDiagnostic/` 四份源文件未跟踪；两份远程测试资源已提交。原脏工作树与旧 `交接.md` 保持不动。诊断源文件/本文未获单独远程同步授权，未混入两个测试资源提交。FST 仍未修复，本轮不宣称全站稳定。

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
| 接口正式远程 `main`（源码/独立测试资源） | 正式 v35 JSON 切换提交 `f9ba37b`；随后同步本轮源码/构建/交接记录，接手时重新核对 HEAD；顶部 v35 快照优先 |
| 接口运行资源发布基线 | v35 JAR 新增提交 `c466b6a`、正式 JSON `f9ba37b`；旧 `ee3637dc250c3a945f97cd3a7c9e7f579ae2f838` / v34 文件保留，四份脚本未改变 |
| TV 远程 `fongmi` | `91b8c9a698922a2f8f4a11b24736f1ddab264441`；只读 `ls-remote` 于 2026-09-27 复核 |
| 接口原工作树 | `D:\CodexWorkspace\Android\影视\CatVodSpider`，`main` / `1d97a24cab319345218cc58b80091b9b1c1af879`，含用户未提交改动 |
| 源码同步工作树 | `C:\Users\Administrator\AppData\Local\Temp\catvodspider-release-v34-20260927`，分支 `publish/gm-subs-v34-20260927`；八文件源码同步提交 `574e2aa6eead6b4ed54d59ae899e32b3a8d4d3ec` 已推送到接口 `origin/main`（只读 `git ls-remote` 复核），与运行资源基线 `ee3637d` / v34 分开；本轮新增实测记录仅留在工作树 |
| 手机播放器 | `com.fongmi.android.tv`，实装 `5.6.6` / versionCode `566`，2026-09-27 只读复核 |

维护者电脑上的路径：`D:\CodexWorkspace\Android\影视\CatVodSpider` 与 `D:\CodexWorkspace\Android\影视\TV`。换电脑后自行定位，不能假定这些目录存在。

原工作树的未提交文件保留且未覆盖：`GMSubs.java`、`GMSubsTest.java`、`build.gradle`、`jar/checkJar.ps1`、`js/adapters.test.cjs`、四份 `js/*.user.js`、未跟踪 `scripts/` 与 `AI_HANDOFF.md`，以及用户原有未跟踪 `交接.md`。2026-09-27 本轮实机复核结束时，手机停留在 SupJav `ABF-381` 详情页，TV 线路暂停于 `position=150621 ms`，外部字幕开启；没有改配置或应用数据。当前不再操作手机。TV 只做过加载/缓存链只读检查，无代码修改；TV 本地定制/源码与实装 APK/AAR 的精确映射未全面确认。TV 源码基线 `4afc447…` 与 39 项脏状态是 2026-09-27 日期快照，不代表此后状态。

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

运行资源正式发布基线为 `ee3637dc250c3a945f97cd3a7c9e7f579ae2f838`。其后源码同步提交 `574e2aa6eead6b4ed54d59ae899e32b3a8d4d3ec` 已更新远程 `main`，但不包含运行资源发布。四站均为 `type: 3` / `csp_GMSubs`，调试关闭；站点集合只有 SupJav、MissAV、Jable、AV01。ST、VOE 及已取消站点不得恢复。运行手机入口始终是上面的 GitHub Pages URL，不以电脑本地 JSON 代替。

### 已验证结果

- SupJav `ABF-381` TV 线路有实播证据。字幕选择器显示 `迅雷 · ABF-381.srt，SRT`，轨道行可用播放器正常方式开关。只读读取同名公开 SRT 时仅保留时间戳与“含汉字”标记（共 312 cues，不保存/输出字幕文本或签名 URL）。在手机暂停的同一帧 `position=120621 ms`，该 SRT cue 为 `00:02:00.360–00:02:03.600` 且含汉字：关闭外轨时画面只见原生日文行，打开外轨后中文行出现，再关闭即消失，再打开又恢复；TV 原生视频位置、帧和日文行保持不变。另快进到 `position=150621 ms`，落在含汉字 cue `00:02:25.700–00:02:32.119` 内，日文原生行与中文外轨同时显示。该样本足以确认外挂 SRT 的来源区分、两处 cue 渲染及快进后显示；不替代手机端 HTTP 字节/请求计数或整片同步验收。
- ABF-381 TV 连续播放原始 MediaSession 样本（均 `state=3,speed=1.0,error=null`）：`position=373885, updated=363920075 → position=389072, updated=363935268`，增量 `+15187 ms / +15193 ms`；下一段 `position=389072, updated=363935268 → position=411138, updated=363942677`，增量 `+22066 ms / +7409 ms`，其中确有一次 Remote Media Fast Forward 输入，因此不是纯自然播放对照。另一次 FF 证据为 `473927/updated=363991300 → 490797/updated=363993385`，`+16870 ms / +2085 ms`，超出自然速率约 14.8 秒。
- ABF-381 返回结果后重播的三次原始 MediaSession 样本：`state=3,speed=1.0,position=5949,updated=364051328 → state=3,speed=1.0,position=28748,updated=364074135 → state=3,speed=1.0,position=304187,updated=364349569`，各相邻差值为 `+22799/+22807 ms`、`+275439/+275434 ms`。先前“约 12 秒”是对墙钟间隔的估计错误；设备 `updated` 与 position 证明这两段按 `speed=1.0` 连续推进，没有恢复位置跳跃。其后另做的进度拖动/FF 已与这三条样本分开记录。
- `SSIS-001` 是成功空结果样本：桌面端字幕 API 返回 0 条，手机面板无外部轨道且 TV 视频继续播放；手机 API 响应没有直接抓包。它能证明无字幕结果没有阻止该样本播放，不能替代实际字幕请求失败隔离测试。
- Jable `ABF-381` 自然访问成功。媒体快进键 keycode 90 前后由 `44770→65709 ms`，updated 只增加 `6140 ms`，额外跳转约 `14799 ms`；随后两次均 `state=3` 的实质增长为 `18036 ms` 和 `20132 ms`。回到搜索结果重播后 `13880→29848→53166 ms`，两次增长 `15968 ms`、`23318 ms`。
- AV01 `ABF-381` 自然访问成功。快进前后 `28980→53800 ms`，updated 增加 `10323 ms`，额外跳转约 `14497 ms`；随后两次 `state=3` 的实质增长为 `20276 ms` 和 `18436 ms`。回到搜索结果重播后 `16889→38253→61782 ms`，两次增长 `21364 ms`、`23529 ms`。
- MissAV `ABF-381` 有既有正常播放/重播记录；本轮没有补做新线路测试。以上是指定样本证据，不代表整站稳定。

### 尚未验证或未确诊

- SupJav FST 的 `SSIS-001`、`ABF-381` 均选中线路后出现“播放地址加载失败”，播放状态为 0、无实质进度增长；相同样本 TV 能播放。本轮安全观测只做了正式入口实机 UI、只读 MediaSession、已存在 logcat 过滤（相关候选仅有无关 `ContentCatcherManager` 系统错误）、已存在 `/proc/net/unix` WebView DevTools socket 检查（无 socket），没有启用任何调试。普通电脑 GET 同站两条文章路径均返回 HTTP 403；未读取/执行挑战页或尝试绕过，因此没有可核对的 SupJav 文章 DOM、按钮集合、iframe 或脚本响应。静态核对 [supjav.user.js](js/supjav.user.js)：详情的 selector 在行 97–99 建立同一按钮集合，行 100 迭代的 `i` 是原始集合序号（被跳过的 ST/VOE 不重新编号），行 104 把 `link:i` 写入 `pathname#link`；播放器行 119 用相同的 `.cd-server:first .btn-server` / fallback selector，行 120 以 `buttons[index]` 读取该原始序号，行 130 点击，行 149 返回 `type:match`。静态 selector/index 未见错位，但不证明手机运行时 DOM 的按钮集合仍完全相同。正式匹配规则只有通用域名 pattern，无 FST 专属规则。

  已用仓库现有 `jar/3rd/apktool_2.11.0.jar` 对 `jar/gm.jar` 做静态反汇编（只读输入，保留输出目录 `C:\Users\Administrator\AppData\Local\Temp\catvod-gm-dex-readonly-236f691eca9447349b0340f9ff71a660\decoded`；未运行会删除临时目录的 `checkJar.ps1`）。[GM.smali](C:\Users\Administrator\AppData\Local\Temp\catvod-gm-dex-readonly-236f691eca9447349b0340f9ff71a660\decoded\smali\com\github\catvod\spider\GM.smali) 中 `playerContent`（约 1658 行）解码播放描述，按 `webview` 分支组装并调用 player WebView 请求；共用请求函数 `GM.b`（约 193–376 行）记录 `LOAD_URL_BY_CLIENT`，安排 40 秒后触发 `webViewDestroyAfterTimeOut`，经 [a.smali](C:\Users\Administrator\AppData\Local\Temp\catvod-gm-dex-readonly-236f691eca9447349b0340f9ff71a660\decoded\smali\com\github\catvod\spider\merge\f2\a.smali) 的 `h(CompletableFuture)`（约 156–169 行）调用 `CompletableFuture.get()` 等待；仅对 `ExecutionException` / `InterruptedException` 记录 `ERROR_CLIENT` 并返回 null。`GM.smali` 的超时任务把 load URL 与 payload 传给 `WebViewFactory.webViewDestroyAfterTimeOut`；debug=false 时该方法调用 `SentryLog.captureEvent` 后销毁 WebView。这个 40 秒销毁调度不是 `waitMatched()` 的超时通知，静态代码未显示其唤醒等待线程。

  更正：`WebViewFactory.smali` 与 `webmonkey/WebViewClientGmHook.smali` 均在该 JAR 的 `classes.dex` 反汇编结果中。`WebViewFactory.configWebViewClient`（约 477–683 行）将配置中的 blockList、playUrlMatch 装到 Hook；`WebViewClientGmHook.shouldInterceptRequest`（约 404 行）先对完整请求 URL 执行 CriterionMatcher，命中时记 `MATCHED_BY_CLIENT` 并 `SetSpiderResult`（存下 WebResourceRequest 后 notify），再跑 blockList；未 block 则记 `ALLOWED_BY_CLIENT`，命中 block 则记 `BLOCKED_BY_CLIENT` 并返回空文本响应。这些 `Log.i` 带完整 URL，不受 debug 开关控制。`waitMatched`（约 440 行）只做一次无期限 `Object.wait()`，无超时/循环条件；被中断会抛 RuntimeException。GM 的 `type:match` 回调有两个调用路径（`spider/a.smali` 约 244、594 行），之后直接读取返回请求的 headers/URL，没有 null 保护。GM/WebView 客户端未实现 `onReceivedError`、`onReceivedHttpError` 或 `onConsoleMessage`；现存这些日志可证明请求被允许/阻止/匹配及其 URL，但不提供 HTTP 状态或网页 console 错误；仍不能证明本次手机实际走到这里或 FST 的具体失败层。

  已按 PID 只读检查当前 Logcat 环形缓冲，未清缓冲、未重播或切线路。缓冲覆盖 `09-26 17:40:55.212` 至 `09-27 18:17:45.664`，共 230,889 行；当前应用进程为 `com.fongmi.android.tv` PID `14184`，其中 73 行。按上述目标 GM/Hook 标签对整个现有缓冲检索为 0 行；当前应用 PID 中 `ABF-381` / `SSIS-001` 标记也为 0。故既有缓冲无可回溯的 GM/Hook/FST 记录，无法区分该时段 FST 与 TV 线路；不能据此说这些请求未发生。

  静态核实了 debug=false 的第三方遥测边界：40 秒 runnable 将 load URL 与 play payload 传给 `webViewDestroyAfterTimeOut`；该分支解析 payload 后初始化遥测 SDK、配置第三方遥测端点并调用 `captureEvent`，事件数据类别包括加载地址与播放参数。代码确实将事件交给 SDK；静态证据不能确认设备当时联网、SDK 是否成功排队/发出或远端是否收到，所以不能写成已确认外发，但应按可能产生外发处理。更重要的是，`GM.b` 丢弃 `schedule()` 返回的 `ScheduledFuture`，之后只 `shutdown()` executor，没有 `cancel()`；正常 `GM.b` 完成时的 `webViewDestroy()` 也不改 `webviewDestroyed`。反汇编中该 flag 只在 timeout 回调末尾置 true，因此未发现正常返回可撤销 watchdog 的路径：即使调用在 40 秒前正常结束，保留的定时任务仍可能在 40 秒后进入遥测 SDK 分支。当前不存在能从静态链保证“正常短窗口 FST 复测不会触发遥测”的窗口。不要手动或长等待触发该定时任务；先暂停新复测，交主负责人复核风险/决定下一步。未修改配置/debug、未抓网络、未发起复测、未猜 FST host，FST 跨层根因仍未知。
- Jable/AV01 的验证码与网络失败分支有本地模拟测试覆盖，但本轮未在手机制造网络故障或点击验证。TV 弱网下多档清晰度的实际切换/卡顿改善没有验证；TV 仅检查加载/缓存链，未修改代码。
- 字幕手机端 HTTP 响应字节/请求计数、网络超时/HTTP/解析失败时播放隔离仍未直接验证；`SSIS-001` 无结果时继续播放只覆盖正常空结果。已有 JVM 调用计数测试验证缓存/异常不缓存，但不替代手机失败注入证据。
- 手机通过正式入口加载的配置/实播有证据，但没有设备端 JAR 响应体或哈希，不能声称手机已直接确认下载 v34 字节。

### 本地候选与构建状态

- 远程 v34 JAR SHA-256 为 `907BD6C189C2DF4C24F0434EE8B6BC151EC02B15E37912666764350ADCAC9104`；其 `classes.dex` SHA-256 为 `3126F4FD736073F8A47DDB7844CC00BCC6EF68EDF2D63DF3863493060D380D09`，`classes2.dex` 为 `E3BD12C6DDC2B67F839E38AE20AE09203D2AFA6F5143F2DA0BA08409D9E4F231`。远程 JAR 与先前本地构建候选整包哈希一致；不代表手机端直接哈希。
- 已推送的源码同步提交 `574e2aa6eead6b4ed54d59ae899e32b3a8d4d3ec` 包含八项：`GMSubs.java`、`GMSubsTest.java`、`js/adapters.test.cjs`、`build.gradle`、`jar/checkJar.ps1`、`scripts/gmSubsManual/build-check.ps1`、本文与 `AGENTS.md`；本次只读 `git ls-remote origin refs/heads/main` 确认 `origin/main` 指向该 SHA。四份运行 JS 与 v34 发布内容在换行规范化后相同，无运行资源发布。原脏工作树本地 JSON/JAR 仍 v33，禁止拿来覆盖已发布 v34。
- 本轮候选复验（2026-09-27）：`node js/adapters.test.cjs` 通过；`jable.user.js`、`av01.user.js`、`missav.user.js`、`supjav.user.js` 的 `node --check` 通过；Groovy 4.0.32 `FileSystemCompiler` 对 `build.gradle` 语法编译通过；手动脚本 JUnit 17 项、D8、DEX 引用及临时 JAR 结构校验均通过，原始 `classes.dex` SHA-256 保持为 `3126F4FD...D380D09`。新生成 `classes2.dex` SHA-256 为 `E3BD12C6...D9E4F231`，与正式 v34 JAR 记录值一致。`git diff --check` 无空白错误（只有 Windows 行尾提示）。正式 Gradle 构建仍在项目配置前因本机 JDK 21 loopback selector 初始化失败，不能记作构建通过。手动脚本使用当前主机的 `E:\DevTools\...` 固定路径，不是新机器开箱即用。
- 手动脚本还依赖 `app/build/intermediates/compile_app_classes_jar/debug/bundleDebugClassesToCompileJar/classes.jar`。本次候选目录起初没有此忽略的生成文件；实际从原脏工作树中已存在的生成产物复制复用，未在候选中重建，不能称为本轮完整新构建。新 clone 缺此文件时须先用 Wrapper 生成匹配的宿主 compile 产物，或调整明确的编译 classpath；当前脚本不是独立开箱即用的完整构建。标准 Gradle 的本机限制尚未解决，不能保证新环境无需构建条件即可重建。
- 八文件源码/测试/构建/文档同步已在 `574e2aa` 推送；核对的 `origin/main` 与该提交相同。运行资源基线仍为 `ee3637d` / v34；同步不改变任何 JAR、JSON 或四份运行 JS，属于源码提交，不是正式接口运行资源发布。本文本轮补充的实机记录仍是唯一未提交改动；没有设备端 JAR 响应体/哈希。未安装 APK。

## 4. 从任务直接找到代码

### 隐私诊断候选（2026-09-27，已发布独立测试入口）

- 用户批准“关闭遥测、仅记录脱敏信息的本地诊断候选”，并指定由原对话主负责人接手；子对话已停止，文件与手机操作权已移交。随后批准两个独立远程测试资源的提交/推送与手机验证，最新状态见本文开头；正式运行入口文件保持不变。
- 新增 `scripts/gmDiagnostic/` 四个文件：构建检查脚本、`SafeDiagnosticLog.java`、无框架 JVM 测试及仅供 JVM 的 Android Log 测试替身。复用现有 APKtool/JDK/D8，不安装依赖，不使用原脏工作树的宿主生成产物。脚本只接受已核对的正式 v34 JAR 哈希，要求独立新建/空输出目录，不删除目录，不覆盖任何仓库 JAR。
- 独立候选为 `C:\Users\Administrator\AppData\Local\Temp\luoyu-gm-diagnostic-final-01959112e9144c84a150843ada529b88\gm_subs-diagnostic.jar`，SHA-256 `7FC343D8DABF0A661EB8702BABA6A9DB16CED984B3B7BBA5ABF83CBD47B46956`。主 `classes.dex` **有意改动**：遥测 capture/config 回调变成空操作；Android 日志写调用改为安全日志出口，无参数的异常堆栈打印禁用。这不符合正式 JAR“原始 DEX 不变”的历史记录，只是单独本地诊断产物，不可混入旧手动发布流程。原 JAR 中除主 DEX 外的所有条目保持逐字节相同，尤其已发布字幕/代理包装层 `classes2.dex`；新增 `classes3.dex` 仅包含安全日志帮助类，不含 JVM 测试替身。解析、匹配、看门狗和字幕处理逻辑未改，FST 仍未确诊/修复。
- 诊断输出固定标签 `GM_DIAG`，仅允许列出的加载/结果/错误/匹配/允许/阻止事件，必要时输出 HTTP(S) 主机与 playlist/media/other 分类，不输出路径、查询参数、片段、用户信息、请求头、payload、异常原文或堆栈。无关标签丢弃；IP、本地/内部或非法地址隐藏。允许/阻止请求按安全摘要去重并限制每 loader 最多 64 项，匹配/结果不受该限量阻断。该出口控制此插件 DEX 的日志，不承诺控制宿主或 Android 系统自己的日志。
- 验证：21 项脱敏等值检查通过，另有未知标签丢弃、请求去重/限量、限量后仍可记录匹配事件的 JVM 检查；D8、修补 DEX 重新组装/反汇编通过；102 个生成 smali 文件只做遥测或日志机械改写；主 DEX 类定义集合未变，所有安全日志调用签名可解析，主 DEX 无原 Android 日志写调用，SDK 外无遥测 init/capture 入口调用；候选中无 JVM Android Log 替身。正式 JAR 输入哈希与非主 DEX 条目均核对未变，现有 Node adapter 检查通过。没有手机加载/播放此候选，没有生成或安装新 APK，不声称完整 Gradle 构建通过。
- 重建：在隔离源码工作树执行 `scripts/gmDiagnostic/build-check.ps1 -OutputDir <新建或空目录>`；当前 JDK/SDK 是脚本参数默认值，需要时明确指定本机已安装路径。独立 GitHub 测试资源及手机验收现已获批准并执行，不能用电脑本地 JSON 代替，也不能覆盖正式 JSON/JAR。

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

- 权限以用户当次明确授权为准。此前八文件源码同步已完成；本轮批准由主负责人制作隐私诊断候选、发布两个独立远程测试资源并实机验收，另批准测试辅助组件安装。不包括正式 JSON/JAR/四运行脚本修改发布、回退、替换播放器 APK 或新增源码/文档远程同步。TV 代码、工作树与运行文件保持只读。
- 保留未提交文件；不 reset/clean/强推、不自动同步上游、不把用户定制或旧交接混进提交。必要的独立工作分支/工作树也应按所在工具的要求建立。
- 手机日常使用正式远程 JSON；获准诊断期间可以使用独立远程测试入口，结束后恢复正式入口。本地 `127.0.0.1` 可用于手机媒体代理，不能替代远程配置入口。
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

截至 2026-09-27：八文件源码同步已由 `574e2aa6eead6b4ed54d59ae899e32b3a8d4d3ec` 推送至 `origin/main`，只读远程核对吻合；运行资源发布基线仍为 `ee3637d` / v34，未发布新运行资源。其后本轮只读诊断/实机记录仅修改本文，未提交/推送。手机实测使用正式入口 `https://jokers963.github.io/CatVodSpider/json/supjav.json`；结束时停在 SupJav `ABF-381` 详情页，TV 线路暂停于 `150621 ms`，外部字幕开启。当前不再操作设备。TV 仓库仍只读、无代码改动。以下登记只描述本任务，不代表其它会话资源空闲。

| 任务 | 负责人/发布人 | 仓库与基线 | 文件/共享资源范围 | 状态与下一步 | 验证证据 |
| --- | --- | --- | --- | --- | --- |
| 四站稳定性复核/源码同步 | Codex 子任务；原对话主负责人复核 | CatVodSpider；源码同步 `574e2aa` 已推送；运行基线 `ee3637d` | 本轮仅 `AI_HANDOFF.md` 未提交实机记录；原脏工作树 `main` / `1d97a24` 保留；手机当前暂停于 ABF-381 TV `150621 ms` 并开启外挂字幕；TV 只读 | 不发布运行资源；字幕两时间点/同帧开关已实机验证；FST 跨层根因与字幕 HTTP 失败隔离仍未知；交回主负责人复核 | 正式 JSON v34/v33/v7/v7/v4；进度原始字段、cue 时间和未验证项见第 3 节 |
| 独立隐私诊断验收 | 原对话主负责人，子对话已停止 | CatVodSpider；诊断资源 `5d3e281`，正式运行仍 `ee3637d` / v34 | 两份独立测试资源已推送；`scripts/gmDiagnostic/` 与本文仅本地；TV 只读；手机已恢复正式地址并释放 | TV 对照/持续播放/快进/切回恢复通过；FST 两次失败，媒体摘要不足以定位根因；返回重播及恢复后的 TV 重播未做；辅助工具正常安装成功 | 最新授权、远程哈希、日志出口实机证明、进度和未完成项见本文开头 |
| FST 媒体请求继续排查 | 主负责人单独实现/发布/实机验证 | CatVodSpider 隔离分支，r6 `afe6f88`；正式基线 v34 不变 | 独立诊断资源、`scripts/gmDiagnostic/`、本地记录；手机本轮由主负责人占用；TV 只读 | 正在比较请求头/响应/分片吞吐，证据充分才做测试入口修复，结束恢复正式地址 | 本轮最新证据与收尾状态见开头 |

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
