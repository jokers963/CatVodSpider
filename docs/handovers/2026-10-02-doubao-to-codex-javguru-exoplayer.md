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

## 已确认根因（2026-10-02 Codex 实机复核）

失败是上游媒体域名的 Cloudflare WAF 拒绝请求，不是 URL 缺少 `.m3u8` 导致的
EXO 格式推断错误。

上文“云电脑 HTTP 200”是更早的单次样本，只能证明地址当时可用；本轮同日重新取当次
签名地址后，手机和 PC 均稳定复现下述拦截，后者代表当前状态。

- 手机复现时 MediaSession 为 `state=7`、`position=0`、`error=Source error`；播放器错误文本为
  `Bad HTTP Status`，在当前 TV 源码中明确对应 `ERROR_CODE_IO_BAD_HTTP_STATUS`。
- 从四个不同 Upload18 播放页取得的当次 HLS 地址均返回 HTTP 403，响应是 Cloudflare
  “Sorry, you have been blocked”，不是 HLS 清单；PC 对照结果相同。
- UA、Referer/Origin 和 HTTP/1.1 对照不能恢复访问，只在 403/404 间变化。
- 播放页的会话刷新接口返回 HTTP 200 和新的签名 HLS 地址，但新地址仍返回 403。
- 四个样本的 `alternate720` 均为空，`workerDomains` 只有 `helvid.com`，没有页面提供的备用媒体源。

当前 TV 的 HLS 格式重试只处理解析/部分 IO 错误，不会也不应把 HTTP 403 当成格式错误重试。
即使显式传入 HLS `format`，请求仍会在读取清单前被 WAF 拒绝。

六个站最终送给播放器的 URL 对照：

| 站点 | 最终 URL | 格式 | URL 带扩展名 |
|---|---|---|---|
| missav | `unsafeWindow.hls.url` → `…/*.m3u8` | HLS | 有 |
| jable | `hlsUrl` → `…/*.m3u8` | HLS | 有 |
| av01 | playerContent → `…/manifest/master.m3u8?access_token=…` | HLS | 有 |
| hanime1 | `video source.src` → `…/*.mp4` | MP4 | 有 |
| rou | `/api/hls/{id}` | HLS | **无**（同类隐患） |
| javguru | playerContent → `https://helvid.com/m/{base64}?…` | HLS | **无** |

## 已知约束

- `h` 参数是对请求签名的，改路径强行加 `.m3u8` 会破坏签名；
- Cloudflare 拦截发生在媒体清单 HTTP 请求阶段，JSON、userscript、MIME 和 EXO 重试均无法解除；
- 当前页面没有备用媒体地址；自行增加远程中转会引入新的服务、隐私和维护边界，不在本次授权范围；
- 本轮未改变 VPN、DNS、代理或网络设置，也未尝试绕过安全服务。

## 后续可选路径

1. 等待上游媒体域名解除拦截或页面提供新的 worker/备用地址后重新验证；
2. 若用户有意继续保留此站，寻找不依赖 `helvid.com` 的合法可用媒体来源；
3. 若用户明确授权调整网络出口，只做网络层验证，不把网络差异伪装成仓库代码修复。

rou 的 `/api/hls/{id}` 已有无扩展名 HLS 实播通过记录，不因本问题顺带修改。

## 接口侧当前状态

- main 已推到 `603b9da`；javguru.user.js 1.0.1，json `userScript …?v=2`，
  `playUrlMatch` 含 `https://helvid.com/m/*`（兜底用）。
- 当前没有能解除上游 WAF 403 的仓库内代码修复；保持运行代码不变，待上游或用户网络决策变化后再复测。
