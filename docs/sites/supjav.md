# SupJav

更新时间：2026-10-13。正式配置 `json/luoyuqiu.json`（key `supjav`，脚本 `js/supjav.user.js?v=14`，@version 2.6.0）；开发通道 `json/luoyuqiu-supjav-test.json`（同脚本，名称带「测试」，先在此验证再同步正式）。

## 线路（顺序 EVS / VAS / FST / ST）

| 线路 | 嵌入域 | 播放地址生成 | 画质 | 说明 |
| --- | --- | --- | --- | --- |
| EVS | evsishere.xyz | 嵌入页 p,a,c,k,e,d 解包 → `hls4` 同域 `/stream/.../master.m3u8` | 1080p | `type:url` + 嵌入域 Referer/Origin |
| VAS | vvaassjjav.xyz | `POST /api/stream {filecode, device:"android", codecs:[]}` → `streaming_url` | 1080p，H.264；片源无 H.264 时为 H.265 | `type:url` + Referer/Origin |
| FST | fc2stream.tv | 同 EVS（解包 hls4，备 hls2） | 1080p | `type:url` |
| ST | streamtape.com | 网页播放器 + 用户**手动点播放** + GM 嗅探 `get_video` | **720p**（手机实测） | 备用线路；`type:match` |

不收：**LUC**（仅 720p，且有更好线路）、**VOE**。多 CD 时每条线路下按 CD1/CD2… 分集，作品编码（FC2PPV-xxxx / ABC-123）写入 `vod_play_from` 供 GMSubs 字幕匹配。

## Cloudflare 验证（2.6.0，对齐 MissAV）

- 两站 CF 同为 `cType: 'managed'` 托管验证（无更严规则）；gm.jar 共享 CookieManager、默认 WebView UA，MissAV 配置未设 UA/header，SupJav 也不设。
- 与 MissAV 的差异及处理：
  1. 2.4.2 起整份脚本 `@run-at document-start`，在 supjav.com 页面（含 CF 验证页）验证脚本运行前就执行；2.6.0 起仅 streamtape 嵌入页早执行，supjav/Pages 页等 `load` 后才运行（同 MissAV 的默认时机）。
  2. 2.5.0 的 robots.txt 中转会用 GM_xmlhttpRequest（HttpURLConnection，非浏览器 TLS 指纹）直接请求 supjav.com HTML，必被 403 验证，且同 IP 的非浏览器请求可能拉低 CF 对该 IP 的评分；随后再跳页又多一次导航。2.6.0 撤回：分类/搜索/详情与 MissAV 一样直接加载真实页面，不再用原生请求访问 supjav.com（lk1.supremejav.com 播放中转保留，属不同站点、本身不出验证）。
  3. 保留：首页载 Pages（只返回固定分类，少一次 supjav 加载）；ST 的 Referer 中转页用 `supjav.com/robots.txt`（CF 边缘缓存，不出验证、无额外跳转）。
  4. blockList 仅广告域，不含 cloudflare/turnstile/supjav.com。

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
