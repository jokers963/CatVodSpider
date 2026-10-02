# 交接：JavGuru 在落雨秋播放器（EXO 内核）上的播放修复

日期：2026-10-02（晚）| 写：豆宝 | 阅：Codex（播放器/APK 侧）

## 现象

JavGuru 站（`javguru.fit`，修复前 js/javguru.user.js 1.0.1，json `?v=2`）：
ren 在手机上点播 → 进入播放页 → 转圈 → 最后失败。
分类/翻页/搜索/详情均正常，只有最终播放失败。

## 接口侧已排除的事项

1. 嗅探规则问题（第一轮修复）：helvid.com 的 m3u8 地址形如
   `https://helvid.com/m/{base64}?e=…&h=…&s=…&x=…&d=…&i=…&v=…&k=…`，
   URL 里没有 "m3u8" 字样，旧 `*m3u8*` 规则永远匹配不上。
   已改为 playerContent 直接从 `window.PLAYER_CONFIG.m3u8`（服务端直出）
   取地址，以 `{type:"url", ext:{url, header:{}}}` 返回；嗅探（`helvid.com/m/*`）留作兜底。
   ——修完后 ren 复测：**依然转圈失败**，说明 URL 已送达播放器，问题在播放器侧。
2. URL 本身有效（云电脑实测 AGMX-271）：
   - playlist：HTTP 200，`Content-Type: application/vnd.apple.mpegurl`，标准 HLS VOD
     （`#EXT-X-PLAYLIST-TYPE:VOD`，分片 `https://helvid.com/s/…`，token 未过期）；
   - 分片：HTTP 200（6.4MB），带/不带 Referer 都能拉；
   - 无需特殊请求头。

## 实机复核结论（2026-10-02，已验证）

App 的直接媒体请求被 Cloudflare 拒绝，但同一手机的真实浏览器网页播放器可以持续播放。
因此不能写成“媒体域名整体不可用”，也不是 URL 缺少 `.m3u8` 导致的 EXO 格式推断错误。

上文“云电脑 HTTP 200”是更早的单次样本；本轮 curl/EXO 与真实浏览器呈现不同结果，
说明请求执行环境是关键变量，不能用 curl 结果替代浏览器实播。

- 手机复现时 MediaSession 为 `state=7`、`position=0`、`error=Source error`；播放器错误文本为
  `Bad HTTP Status`，在当前 TV 源码中明确对应 `ERROR_CODE_IO_BAD_HTTP_STATUS`。
- 从四个不同 Upload18 播放页取得的当次 HLS 地址均返回 HTTP 403，响应是 Cloudflare
  “Sorry, you have been blocked”，不是 HLS 清单；PC 对照结果相同。
- UA、Referer/Origin 和 HTTP/1.1 对照不能恢复访问，只在 403/404 间变化。
- 播放页的会话刷新接口返回 HTTP 200 和新的签名 HLS 地址，但新地址仍返回 403。
- 四个样本的 `alternate720` 均为空，`workerDomains` 只有 `helvid.com`，没有页面提供的备用媒体源。
- 按用户要求在同一手机 IceRaven 打开同一 Upload18 页面并点击播放：浏览器 MediaSession
  持续为 `state=3`、`speed=1.0`、`error=null`；AudioFlinger 显示浏览器有持续活动的
  48 kHz 音频轨并持有音频焦点，确认网页播放器实际运行。

修复前 `javguru.user.js` 在发现 `window.PLAYER_CONFIG.m3u8` 后直接返回
`{type:"url", ext:{url, header:{}}}`，绕过网页播放器的 HLS.js、会话刷新、错误恢复和浏览器
请求上下文。网页运行时代码明确会在 232403/232404 等错误时调用 session refresh 后重载流。
提交 `b92a158` 删除该直链分支，恢复 `{type:"match"}` 后，手机 App 已持续实播成功，确认这条差异就是根因。

六个站最终送给播放器的 URL 对照：

| 站点 | 最终 URL | 格式 | URL 带扩展名 |
|---|---|---|---|
| missav | `unsafeWindow.hls.url` → `…/*.m3u8` | HLS | 有 |
| jable | `hlsUrl` → `…/*.m3u8` | HLS | 有 |
| av01 | playerContent → `…/manifest/master.m3u8?access_token=…` | HLS | 有 |
| hanime1 | `video source.src` → `…/*.mp4` | MP4 | 有 |
| rou | `/api/hls/{id}` | HLS | **无**（同类隐患） |
| javguru | playerContent → `https://helvid.com/m/{base64}?…` | HLS | **无** |

## 已实施修复与约束

- `h` 参数是对请求签名的，改路径强行加 `.m3u8` 会破坏签名；
- 显式 HLS MIME 不能解决 HTTP 状态差异；
- 当前 `playUrlMatch` 已包含 `https://helvid.com/m/*`；旧 match 失败时仍是只匹配 `*m3u8*`
  的规则，不能代表当前规则，本轮已用当前规则实播通过；
- `playerContent` 已恢复 `{type:"match"}`，保留网页播放器自动启动和现有 `helvid.com/m/*` 匹配；
- `javguru.user.js` 已升至 1.0.2，正式配置升至 `?v=3`；
- 本轮未改变 VPN、DNS、代理或网络设置，也未尝试绕过安全服务。

## 发布与实机验证

- 三组 Node 检查、JSON 解析和 `git diff --check` 通过；GitHub Pages 已确认发布 1.0.2 / `?v=3`。
- 手机落雨秋 `5.6.3-lyq.3` 实播 IPZZ-975，MediaSession 持续为 `state=3`、`speed=1.0`、
  `error=null`；10 秒观察窗内位置 `63089→70687 ms`，缓冲 `116798→125140 ms`。
- 首次无扩展名识别会出现一次 extractor 错误，随后 TV 现有 HLS 重试正常恢复，无需修改 TV。
- 测试结束已停止 App；未截图、未清数据、未改方向或网络设置。

rou 的 `/api/hls/{id}` 已有无扩展名 HLS 实播通过记录，不因本问题顺带修改。

## 接口侧当前状态

- main 修复提交为 `b92a158`；javguru.user.js 1.0.2，json `userScript …?v=3`，
  `playUrlMatch` 含 `https://helvid.com/m/*`。
- JavGuru 播放已在正式配置和手机 App 内验证闭环。
