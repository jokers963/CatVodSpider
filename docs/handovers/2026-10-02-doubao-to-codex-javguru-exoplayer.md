# 交接：JavGuru 在落雨秋播放器（EXO 内核）上播放失败

日期：2026-10-02（晚）| 写：豆宝 | 阅：Codex（播放器/APK 侧）

## 现象

JavGuru 站（`javguru.fit`，js/javguru.user.js 1.0.1，json `?v=2`）：
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

## 实机复核结论（2026-10-02，根因仍需候选改动验证）

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

当前 `javguru.user.js` 在发现 `window.PLAYER_CONFIG.m3u8` 后直接返回
`{type:"url", ext:{url, header:{}}}`，绕过网页播放器的 HLS.js、会话刷新、错误恢复和浏览器
请求上下文。网页运行时代码明确会在 232403/232404 等错误时调用 session refresh 后重载流。
这条差异是当前最强候选，但仍需把 App 恢复到 match 路径后实测才能定为最终根因。

六个站最终送给播放器的 URL 对照：

| 站点 | 最终 URL | 格式 | URL 带扩展名 |
|---|---|---|---|
| missav | `unsafeWindow.hls.url` → `…/*.m3u8` | HLS | 有 |
| jable | `hlsUrl` → `…/*.m3u8` | HLS | 有 |
| av01 | playerContent → `…/manifest/master.m3u8?access_token=…` | HLS | 有 |
| hanime1 | `video source.src` → `…/*.mp4` | MP4 | 有 |
| rou | `/api/hls/{id}` | HLS | **无**（同类隐患） |
| javguru | playerContent → `https://helvid.com/m/{base64}?…` | HLS | **无** |

## 已知约束与候选修复

- `h` 参数是对请求签名的，改路径强行加 `.m3u8` 会破坏签名；
- 显式 HLS MIME 不能解决 HTTP 状态差异；
- 当前 `playUrlMatch` 已包含 `https://helvid.com/m/*`，旧 match 实现失败时使用的是只匹配
  `*m3u8*` 的规则，因此“match 已失败”并未在现有正确规则下得到验证；
- 最小候选改动是让 `playerContent` 恢复 `{type:"match"}`，保留网页播放器自动启动和现有
  `helvid.com/m/*` 匹配，再由 App 实测 GM 捕获的请求上下文能否播放；
- 本轮未改变 VPN、DNS、代理或网络设置，也未尝试绕过安全服务。

## 下一步

1. 将 JavGuru `playerContent` 从直链优先恢复为 match 模式，脚本与 URL 查询版本递增；
2. 跑现有 Node 测试后发布，手机验证 App 是否由 GM 捕获到可播放请求；
3. 若 match 仍交回被拒绝的裸 URL，再记录其请求头/错误证据，不能宣称浏览器可播等于 App 已修复。

rou 的 `/api/hls/{id}` 已有无扩展名 HLS 实播通过记录，不因本问题顺带修改。

## 接口侧当前状态

- main 已推到 `603b9da`；javguru.user.js 1.0.1，json `userScript …?v=2`，
  `playUrlMatch` 含 `https://helvid.com/m/*`（兜底用）。
- 浏览器对照已证明媒体可播；当前尚未实施 match 候选改动，保持运行代码不变并等待用户决定是否继续发布验证。
