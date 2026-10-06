# JavGuru 实现档案

当前实现：`js/javguru.user.js` 1.0.2，正式脚本查询版本 `v=4`（与 `json/luoyuqiu.json` 一致）。播放故障与手机证据见 `docs/handovers/2026-10-02-doubao-to-codex-javguru-exoplayer.md`。

## 站点定位与接入选择

正式入口是 `javguru.fit`。它与多个 “Friends” 站共用内容和 Upload18 播放器，但不是 `jav.guru` 官网确认的镜像；实现档案只记录技术行为，不把站名关系写成官方事实。

列表与详情可从 JavGuru DOM 取得，最终媒体请求则由 `upload18.org` 的网页播放器生成。直接读取初始 `PLAYER_CONFIG.m3u8` 会绕过网页运行时的会话刷新和请求环境，因此当前实现必须使用 WebView 播放器嗅探。

## 路由与数据流

| GM 方法 | 页面 | 提取方式 |
| --- | --- | --- |
| `homeContent` | `/` | 从导航读取允许的六个分类，另加“最新” |
| `categoryContent` | `/${tid}?page=${pg}` | 抓 `/video/{id}` 卡片和页数 |
| `searchContent` | `/search?keyword=${key}&page=${pg}` | 复用卡片和分页逻辑 |
| `detailContent` | `/video/${id}` | 读取 Upload18 iframe 的 slug |
| `playerContent` | `upload18.org/play/index/${slug}` | 自动启动 JW Player，返回 `type: "match"` |

分类使用允许列表映射，避免把导航中的其他链接误报为分类。卡片按 ID 去重，标题依次取图片 alt/title、链接 title和可见文字。

详情不直接返回媒体 URL，而是生成 `type: "webview"` 的 Upload18 媒体项。`playerContent` 页面成为顶层 frame 后，userscript 可以直接运行；脚本轮询 `jwplayer()`，确认播放项存在后静音启播，找不到 API 时点击 JW 的显示按钮作为兜底。

正式 `playUrlMatch` 包含 `https://helvid.com/m/*` 和 helvid 子域名。该媒体地址不带 `.m3u8` 扩展名，因此只写 `*m3u8*` 永远匹配不到。GM 捕获网页播放器实际发出的请求后，再把最终地址交给内置播放器。

## 为什么不能直接返回 PLAYER_CONFIG

曾在 `603b9da` 改为直接返回服务端渲染的 `PLAYER_CONFIG.m3u8`。手机 App 随后得到 `Bad HTTP Status`，而同机 IceRaven 打开相同 Upload18 页面可持续播放。`b92a158` 删除直链分支、恢复 match 路径后，App 实播恢复，证明网页播放器的会话/请求上下文不可跳过。

无扩展名地址第一次可能触发普通 extractor 识别失败；TV 现有 HLS 重试会恢复，不需要为 JavGuru 修改 TV。

## 实现过程

- 早期 `6fb171d`、`d75f8dd` 曾试接 `jav.guru`，随后由 `5e1d4c2` 移除；这不是当前站点实现。
- `8926230`：以 `javguru.fit` + Upload18 顶层播放器重新接入。
- `603b9da`：尝试直接返回 `PLAYER_CONFIG`，实机失败。
- `b92a158`：恢复 match，保留正确 helvid 规则，手机实播通过。

## 测试与实机结论

`js/new-sites.test.cjs` 覆盖分类、卡片去重、分页、搜索、iframe slug、WebView 媒体项，以及即使存在 `PLAYER_CONFIG` 也必须返回 match。正式手机实播持续 `state=3`、`speed=1.0`、`error=null`，位置和缓冲均增长。

## 可复用经验

- curl 或裸播放器失败、真实浏览器成功时，应比较执行环境，不要直接判定媒体源失效。
- 短期地址出现在页面变量中不代表可以脱离网页播放器使用。
- `playUrlMatch` 必须按真实 URL 形态编写，不能假定 HLS 地址一定带 `.m3u8`。
- 嵌套 iframe 中脚本注入受限时，可把已授权的播放器页作为 `playerContent` 顶层页面加载。
