# SupJav

更新时间：2026-10-13。正式配置 `json/luoyuqiu.json`（key `supjav`，脚本 `js/supjav.user.js?v=13`，@version 2.5.0）；开发通道 `json/luoyuqiu-supjav-test.json`（同脚本，名称带「测试」，先在此验证再同步正式）。

## 线路（顺序 EVS / VAS / FST / ST）

| 线路 | 嵌入域 | 播放地址生成 | 画质 | 说明 |
| --- | --- | --- | --- | --- |
| EVS | evsishere.xyz | 嵌入页 p,a,c,k,e,d 解包 → `hls4` 同域 `/stream/.../master.m3u8` | 1080p | `type:url` + 嵌入域 Referer/Origin |
| VAS | vvaassjjav.xyz | `POST /api/stream {filecode, device:"android", codecs:[]}` → `streaming_url` | 1080p，H.264；片源无 H.264 时为 H.265 | `type:url` + Referer/Origin |
| FST | fc2stream.tv | 同 EVS（解包 hls4，备 hls2） | 1080p | `type:url` |
| ST | streamtape.com | 网页播放器 + 用户**手动点播放** + GM 嗅探 `get_video` | **720p**（手机实测） | 备用线路；`type:match` |

不收：**LUC**（仅 720p，且有更好线路）、**VOE**。多 CD 时每条线路下按 CD1/CD2… 分集，作品编码（FC2PPV-xxxx / ABC-123）写入 `vod_play_from` 供 GMSubs 字幕匹配。

## 减少 Cloudflare 验证（2.5.0）

- 实测（2026-10-13，box）：supjav.com 的 HTML 页（首页/分类/搜索/详情/404/feed）对非浏览器 TLS 指纹（curl、Python urllib）一律 403 验证页，仅 Chrome 指纹放行；`/robots.txt`、`/favicon.ico` 为 CF 边缘缓存（`cf-cache-status: HIT`），任何客户端都不出验证；`lk1.supremejav.com/supjav.php?c=` 也不出验证。WP REST 需登录（401），无可用镜像（supjav.net 为停放域名）。
- gm.jar：WebView 每次调用新建，但 Cookie 走全局 `CookieManager`（只有脚本显式 `GM_removeAllCookies` 才清，本脚本不用）；UA 为 WebView 默认 UA（配置未设 `userAgentString`），各阶段一致。`GM_xmlhttpRequest`（HttpURLConnection）不带 WebView Cookie，非 200 走 onerror。
- 做法：home 改载 Pages（只返回固定分类，原先每次开站都要过一次 supjav 验证）；category/search/detail 改载 `https://supjav.com/robots.txt#<目标>`，脚本先用 `GM_xmlhttpRequest` 取目标 HTML 并 `DOMParser` 解析（原生请求若未被 CF 拦则全程无验证，约 1 秒）；若 403/验证页则在 localStorage 记 30 分钟并在同一 WebView `location.replace(目标)` 走原流程（此时才可能出验证，验证通过的 cf_clearance 留在共享 CookieManager）。ST 的 Referer 中转页改为 robots.txt。
- 正常页面也含 `/cdn-cgi/challenge-platform/` 信标脚本，验证页判断只看 `Just a moment` 标题 / `_cf_chl_opt` / `challenge-form`。

## 路由与五方法

- home（Pages 首页）：只返回固定分类（有码/无码/素人/中字/去码/英字），不抓推荐。
- category `https://supjav.com/category/${tid}/page/${pg:-1}/`；search `https://supjav.com/?s=${key}`：`div.post` 卡片，页数取 `/page/N/` 最大值。
- detail `${id}`（vod_id = 完整详情 URL）：读 `.cd-server a.btn-server[data-link]`，媒体 `type:webview`，`ext.replace = {page, c: 反转后的 data-link, line, cd}`；ST 另带 `stpage=https://supjav.com/robots.txt`。
- player `${stpage:-https://jokers963.github.io/CatVodSpider/}`：EVS/VAS/FST 加载自家 Pages 空白页（无 Cloudflare），用 `GM_xmlhttpRequest`（原生 HTTP、可设 Referer、串行）请求 `lk1.supremejav.com/supjav.php?c=<反转码>`（Referer `https://supjav.com/`）→ 302 到嵌入页（finalUrl），再按上表解析。失败返回空 URL + 「请换线路」提示，不伪造。

## ST 细节（为什么这样做）

- 纯 HTTP 拼 `get_video?id&expires&ip&token` 在服务器侧最终 `tapecontent.net` 403（2026-10-13 多样本），不能做直链；改为网页播放器起播 + 嗅探。
- 嵌入页必须带 supjav Referer，否则 404；supjav 页面是 `Referrer-Policy: same-origin`。因此播放阶段加载 supjav.com（Cloudflare 验证页也可，同源即可，不等验证），插入 `<meta name=referrer content=origin>` 后 `location.replace(嵌入页)`，并先 `ShowWebview` + 返回 `{type:"match"}`；GM 等待 `playUrlMatch`（`https://streamtape.com/get_video*`、`https://*.tapecontent.net/radosgw/*`）命中。
- 嵌入页 `@match https://streamtape.com/e/*`、`@run-at document-start`（GM 在 onPageStarted 注入；非 streamtape 页仍等 load 后才运行，行为同 idle）。**不做任何程序点击**，只去广告：
  - 页面配置 `{token,fileid,adblock,noads}` 置 `noads/adblock=true`（站点首击 `pcl<2 && !adblock` 给广告；`!noads && adblock` 才跳 advtpe.com）。
  - `window.open`/`mkp` 置空；外链/`intent:` 的 a 元素 click、form submit 置空；丢弃 document/window 上新注册的点按类监听（popunder 库）；阻断外站广告脚本（llvpn.com tag = Monetag zone 11822409 → `intent://pyppo.com/...`、mulchimbiber、conermoocher）；删除高 z-index 遮罩与广告 iframe；`.play-overlay` 全屏置顶。
  - window 捕获阶段截断所有点按（晚注入也先于广告监听）；用户点到播放层时执行与站点处理器相同的起播（隐藏遮罩、`mainvideo.src = botlink + &stream=1`），视频 `playing` 后静音暂停网页视频并 `HideWebview`。
  - 正式 JSON `webViewSettings.blockList` 同时在网络层拦截上述广告域。
- 用户视角：选 ST → 半屏网页出现 → 点一下 → 外部播放器开始播放（720p）。

## 依赖与风险

- 依赖 lk1 中转（Referer supjav）、各嵌入域的页面结构/接口；EVS/FST hls4 与 VAS streaming_url 为短期签名地址，不缓存、不入库。
- ST 依赖用户手动点按；广告域名会轮换，blockList/特征需维护；Streamtape 改 `botlink`/`mainvideo` 结构需跟进。
- 不发布 Cookie、token、签名媒体地址。

## 测试与验收

- `js/supjav.test.cjs`：列表/详情/线路顺序、各线路解析（打包样本不含真实签名地址）、ST 跳转与 referrer、嵌入页去广告钩子与点按截断、禁止程序点击；`scripts/subtitles/test_config.cjs` 校验正式 SupJav 条目与开发通道一致。
- 手机（上游 FongMi TV 5.7.3，ExoPlayer）：VAS/EVS/FST 已实播；ST 2026-10-13 用户实测可播、720p。单样本不代表整站稳定。

## 历史

2026-10-01 旧 1.0.26（WebView 点击 + 嗅探，GM 不注入跨域 iframe）删除；2026-10-11 起测试版 2.x 重做；2026-10-13 用户明确要求正式上线（commit 见 AI_HANDOFF）。
