# 落雨秋：配置、Spider 与网站脚本原理

> **版本快照可能滞后**：正式入口、JAR、五站与脚本 `?v=` 以根目录 [AGENTS.md 唯一现状卡](AGENTS.md) 与 `json/luoyuqiu.json` 为准；本文保留原理说明。下方「截至 … 文档复核」表格是历史快照，不是当前发布状态。


原始研究日期：2026-09-27；入口、正式版本与站点索引更新于 2026-10-02。本文是源码研究与维护说明，不是全部站点稳定性验收报告。

配套文档：[定制播放器开发入口](https://github.com/jokers963/TV/blob/luoyuqiu/README.md) · [历史播放器底层原理](https://github.com/jokers963/TV/blob/fongmi/LUOYUQIU_ARCHITECTURE.md)。实际定制源码在 `luoyuqiu`，下方 TV 的 `fongmi` 基线仅用于解释原始研究。

## 1. 研究范围与版本边界

- 本仓库 fork 自 [FongMi/CatVodSpider](https://github.com/FongMi/CatVodSpider)，研究基线为 `1d97a24cab319345218cc58b80091b9b1c1af879`，分支 `main`。
- 上游 CatVodSpider 对照基线为 `db4cf26356fa59d1331769f11cbbfb2a779227e6`。
- 配套 TV fork 研究基线为 `4afc4473e22a7ed3d98ee12233e0c2a490061000`，分支 `fongmi`。
- 研究时读取了正式远程 JSON，并核对本地定制源码和 GM 的关键反汇编调用链。没有因此重新构建、安装 APK 或进行全部站点手机回归。
- 版本号、站点结构、网站域名和上游代码可能变化；维护时应重新核对，不能将本文的日期快照当成永久现状。

## 2. 仓库职责与完整链路

TV 是播放器宿主，提供界面、配置加载、插件运行、内置播放、字幕、历史与收藏。CatVodSpider 提供站点适配器，将不同来源的数据转换为宿主认识的统一格式。JSON 是入口清单，不是视频存储服务。

```text
手机中的落雨秋
  → GitHub Pages 上的 JSON 配置
  → 下载并加载 gm_subs.jar
  → GMSubs 包装 GM 运行时
  → 加载对应网站 userscript
  → 获取首页、分类、搜索、详情与播放地址
  → 必要的 HLS 适配 + 字幕候选
  → TV 内置播放引擎
```

本项目运行路径不止依赖两个 FongMi 仓库：`jar/gm.jar` 来自第三方 `cluntop/tvbox`。来源与许可记录见 [NOTICE-GM.md](NOTICE-GM.md)。网站脚本运行在 GM 的 WebView 中，不是 TV 的 QuickJS Spider；宿主 `CustomWebView` 解析器也是另一套实现。

## 3. 正式入口与远程更新

正式点播配置地址：

```text
https://jokers963.github.io/CatVodSpider/json/luoyuqiu.json
```

[打开正式配置](https://jokers963.github.io/CatVodSpider/json/luoyuqiu.json) · [查看仓库中的配置文件](json/luoyuqiu.json)。

手机应填写完整 JSON 地址，而不是 GitHub 的 `blob/main/...` 查看页面、GitHub Pages 根目录或 JAR 地址。电脑上的本地文件改变不等于远程发布完成；需要确认远程仓库、Pages 部署和实际 HTTP 返回内容。

**当前（以 AGENTS 现状卡 / JSON 为准，2026-10-06）**：`gm_subs-v40` + MD5；正式五站 MissAV/AV01/肉视频/Hanime1/JavGuru（脚本 `?v=` 分别为 9/5/6/3/4）；Jable 已关闭。下表为 2026-10-02 历史快照，勿当作现状：

| 项目 | 历史快照（可能过时） |
| --- | --- |
| Spider JAR | 当时为 `jar/gm_subs-v38.jar?v=38` |
| 站点 | 当时含 MissAV、Jable、AV01、肉视频、Hanime1、JavGuru |
| 脚本 URL | MissAV `v=9`、Jable `v=12`、AV01 `v=5`、肉视频 `v=6`、Hanime1 `v=3`、JavGuru 当时 `v=3`（现正式为 `v=4`） |

JSON、JAR URL 版本、脚本 URL 版本、userscript 元数据版本和 APK 版本是不同层。URL 查询参数会影响宿主插件缓存键，但不是部署成功或缓存已刷新的证明。GM 初始化时会下载脚本，并可能在下载失败时使用本地脚本缓存。

## 4. 配置与 Spider 契约

| 字段 | 在当前链路中的作用 |
| --- | --- |
| `spider` | 全局默认 JAR，站点可以用 `jar` 覆盖 |
| `sites[].key` | 唯一站点标识，也用于插件实例与代理路由 |
| `type: 3` | 使用 Spider 获取数据 |
| `api: csp_GMSubs` | 对应类 `com.github.catvod.spider.GMSubs` |
| `ext` | 序列化后传入 `Spider.init`，内容由插件解释 |
| `ext.userScript` | GM 扩展参数中的网站脚本地址，并非所有 Spider 通用字段 |
| `ext.spider` | GM 各种任务的网页地址模板 |
| `ext.webViewSettings` | GM WebView 的图片、拦截与浏览器设置 |
| `parses` | 宿主进一步解析播放结果的解析器清单 |
| `rules`、`ads` | 宿主网页嗅探和拦截规则，不能假定自动作用于全部 GM 请求 |

Android 宿主使用 `DexClassLoader` 加载 JAR 中的 DEX，通过约定的类名实例化插件。此 JAR 不能简单理解为普通 JVM 的纯 `.class` 库；包名、方法签名、保留规则和宿主 API 必须兼容。

主要方法：

| 方法 | 任务 | 主要返回数据 |
| --- | --- | --- |
| `init` | 接收站点参数，准备脚本或客户端 | 无 |
| `homeContent` / `homeVideoContent` | 首页分类、筛选和推荐 | `class`、`filters`、`list` |
| `categoryContent` | 分类、分页、筛选 | `list`、`pagecount` |
| `searchContent` | 搜索，可支持分页 | `list`、`pagecount` |
| `detailContent` | 详情、线路与集数 | `list[0]` 中的 `vod_*` |
| `playerContent` | 获取所选线路与集数的播放结果 | `url`、`header`、`parse`、`format`、`subs` 等 |
| `proxy` | 响应手机本地代理请求 | 状态、MIME、内容流及可选响应头 |
| `destroy` | 重载或清理时释放插件资源 | 无 |

普通详情使用 `vod_play_from`、`vod_play_url`。`$$$` 分隔线路，`#` 分隔集数，`$` 分隔集数名和播放 ID。播放 ID 可以是描述或标识，不一定已经是媒体直链。

当前关键代码：[Spider 基类](app/src/main/java/com/github/catvod/crawler/Spider.java)、[GMSubs](app/src/main/java/com/github/catvod/spider/GMSubs.java)、[配置](json/luoyuqiu.json)。

## 5. GM、JavaScript 与播放地址

GM 将任务名及参数通过 `GmSpiderInject.GetSpiderArgs()` 交给脚本；脚本调用 `SetSpiderResult()` 返回 JSON。`ShowWebview()`、`HideWebview()` 控制 GM 页面显示。脚本需匹配实际 URL，并满足相应 GM 权限声明。

GM 的详情扩展 `vod_play_data` 会被转换为宿主认识的线路/集数字符串，媒体描述可编码为 Base64 播放 ID；它不是 TV 原生 `Vod` 对象直接读取的字段。

特别注意：脚本返回 `{type: "match"}` 后，GM 仍会等待符合规则的媒体请求，提取 URL 和请求头，再返回最终播放结果。因此不能在 Java 中假定脚本一返回，媒体解析就结束。

| 站点 | 当前主要实现 | 容易变化的边界 |
| --- | --- | --- |
| [MissAV](js/missav.user.js) | 详情页读取 `unsafeWindow.hls.url`，返回 HLS 直链 | 变量生成时机、网站域名、地址时效 |
| [Jable](js/jable.user.js) | 读取 `hlsUrl` 或内嵌脚本中的 HLS 地址 | HTML 结构、验证、脚本变量格式 |
| [AV01](js/av01.user.js) | 网站 API 查询内容与播放授权，构造主清单地址 | 授权、域名、子清单参数与可用画质 |
| [肉视频](js/rou.user.js) | 解码 hydration 地址，GMSubs 解包伪 PNG HLS | 页面数据格式、自定义 PNG chunk、代理边界 |
| [Hanime1](js/hanime1.user.js) | 搜索页抓列表，详情页返回多清晰度 MP4 | DOM、筛选原值、source 属性 |
| [JavGuru](js/javguru.user.js) | 顶层运行 Upload18 网页播放器并嗅探 HLS | 播放器运行时、匹配规则、短期地址 |

MissAV 当前采用普通直链的 `vod_play_url`，不要擅自改回带 `name` 的 GM `finalUrl` 描述。验证页面是真实访问条件；不应伪造验证成功或自动点击验证来掩盖问题。

各站的逐站实现过程（正式在线路由见 AGENTS 现状卡）、路由、播放原理和可复用经验见 [站点实现档案](docs/sites/README.md)。

## 6. GMSubs：媒体代理与字幕

`GMSubs` 大部分方法委托 GM；`playerContent` 在 GM 返回后增加有限的媒体适配与字幕候选。

### AV01 授权主清单

代理处理主清单，补齐子清单授权参数并指向对应授权 API；保留授权允许的自适应画质。当前代码按授权描述限制 cold 到 720p、hot 到 1080p；这不是对所有视频画质的保证。视频分片仍由播放器直接访问 CDN，不是全部通过本地代理。

### 迅雷字幕

从播放描述的标题或线路名称提取编号，查询迅雷字幕，按名称相关性排序、去重，保留 HTTPS 的 SRT/ASS/SSA/VTT 候选，转换成 `subs`。

匹配是名称相关性，不代表时间轴已验证；查询失败或没有字幕时仍返回原播放结果。当前查询是同步的，客户端总调用超时为一秒（`SUBTITLE_HTTP_TIMEOUT_MS = 1000`），可能增加启动等待；“失败不阻断”不等于“后台异步”。

2026-10-03 用户确认将已实测候选以 v38 发布到正式配置，v37 保留供回退：新增可选 `ext.subtitleLibrary`，按番号请求静态 JSON，库未命中或失败时回退迅雷；保留已有字幕与媒体字段、按库地址隔离缓存并限制总查询预算。配套生成器只读原包，生成 UTF-8 内容哈希对象与分片索引。R2 数据及手机字幕轨道/切换/播放已抽样验证；用户确认一个样本实际显示并在 player 临时 -6 秒校准后同步，不代表全库自动同步。Jable 暂缓，AV01/JavGuru 目视验收按用户要求跳过，不能因发布改记通过。部署状态、实现及回退见 [自有字幕库档案](docs/subtitles/README.md)。

历史 `gm_subs.jar` 保留 GM 的原始 `classes.dex`，新增包装层为 `classes2.dex`。研究时原始 DEX 在两个 JAR 中均为 SHA256（不是当前 v37 主 DEX 的校验值）：

```text
3126F4FD736073F8A47DDB7844CC00BCC6EF68EDF2D63DF3863493060D380D09
```

正式 v37 的构建入口是 [scripts/gmRelease/build-check.ps1](scripts/gmRelease/build-check.ps1)，它组合包装层测试与关闭遥测/日志出口的处理。该入口仍依赖本机 JDK/SDK/Gradle 缓存及已有编译文件，新 clone 不保证直接可构建。

[build.gradle](build.gradle) 中的 `gmSubsJar` 是基于原始 `gm.jar` 的隔离测试候选，没有执行上述关闭遥测/日志出口处理，不能当成等价正式产物发布。`gm.jar` 和 `gm_subs.jar` 仍是构建输入，不能作为旧版本垃圾直接删除。测试见 [GMSubsTest.java](app/src/test/java/com/github/catvod/spider/GMSubsTest.java)；构建、单元测试、脚本语法检查都不能替代手机播放验收。

## 7. 等待、取消与验证的边界

当前研究到的 TV 基线中，获取首页、详情与播放结果的外层任务通常限时 30 秒。站点 `timeout: 60` 主要传给播放器准备阶段，不自动改变 GM 或外层解析任务的限时。GM 本身另有约 40 秒超时处理；部分站点脚本可能等待普通页面或验证页面。

这些限时可能相互冲突：外层取消后，脚本预设的等待不一定有机会完成。这是源码层面的风险，不应未经手机验证就认定为某次失败的根因。实际 APK 的构建来源也需核对。

线路切换既要屏蔽旧结果，也要保证旧任务清理不取消新任务。旧交接中的 generation 修复描述不能代替当前代码；当前 `GMSubs` 主要职责已经是委托、代理与字幕，不应将历史实现误写成当前状态。

WebView Cookie、宿主 OkHttp 和 GMSubs 自建 OkHttp 不自动共享全部网络设置。网站可以显示列表，不代表播放器访问清单、分片、密钥和字幕也都成功。

## 8. 维护与验收

先分层定位：远程配置/发布 → JAR 加载 → 脚本执行 → 页面验证 → 媒体地址 → 清单与分片/代理 → 解码与字幕。只修改被证据指向的层。

- 手机继续使用正式远程配置，不以电脑本地地址替代正式入口验证。
- 不清应用数据、不操作错误的配置历史、不改变系统方向锁定、不使用外部播放器。
- 切换后确认实际选中的站点与线路，不只凭线路按钮位置判断。
- 检查首次播放、切换、持续播放、快进、返回后重播；至少两次观察状态与进度增长，并结合错误日志判断。
- 缓冲、解析失败、媒体 HTTP 错误、容器错误和解码错误应分开记录。
- 验证画面出现、开始缓冲、编译通过或单个样本成功，都不是整站稳定的证明。
- 发布只包含必要文件；保留用户未提交改动，不提交旧 `交接.md` 或无关内容。
- 不公开 Cookie、播放授权、签名媒体 URL、个人设备信息或凭据；正式包不遗留临时 WebView 调试。

此文档的提交仅修改 Markdown，不调整配置、JAR、脚本、APK 或站点行为。后续修复应另行记录变更、构建和实机验证证据。
