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

## 根因判断（需播放器侧确认/修复）

**该 HLS 地址的 URL 路径里没有 `.m3u8` 扩展名。**
`.m3u8` 被 base64 编码藏在路径里（`/m/L3Yv…` 解码后才是
`/v/AGMX-271/…/playlist.m3u8`），播放器从 URL 上看不到。

若播放器判格式走的是 URL 后缀（ExoPlayer `Util.inferContentType(uri.getPath())` 这类逻辑），
无后缀会被当成普通 progressive/MP4，用 ProgressiveMediaSource 去解析 `#EXTM3U`
文本 → 解析失败 → 转圈后报错。与 ren 描述的症状完全吻合。

六个站最终送给播放器的 URL 对照：

| 站点 | 最终 URL | 格式 | URL 带扩展名 |
|---|---|---|---|
| missav | `unsafeWindow.hls.url` → `…/*.m3u8` | HLS | 有 |
| jable | `hlsUrl` → `…/*.m3u8` | HLS | 有 |
| av01 | playerContent → `…/manifest/master.m3u8?access_token=…` | HLS | 有 |
| hanime1 | `video source.src` → `…/*.mp4` | MP4 | 有 |
| rou | `/api/hls/{id}` | HLS | **无**（同类隐患） |
| javguru | playerContent → `https://helvid.com/m/{base64}?…` | HLS | **无** |

## 为什么接口侧修不了

- `h` 参数是对请求签名的，改路径强行加 `.m3u8` 会破坏签名；
- ExoPlayer 的扩展名判断只看 `uri.getPath()`，加 query 参数或 `#` 片段不影响判定。

## 建议的播放器侧修法（Codex 定）

1. 播前对 URL 做一次 HEAD，`Content-Type: application/vnd.apple.mpegurl` → 按 HLS 建 MediaSource；
2. 或域名映射：`helvid.com`（及 `rou` 的 `/api/hls/`）直接按 HLS 处理；
3. 或 progressive 解析失败时 fallback 重试 HLS。

注意第 2 条里 rou 站是同类隐患（`/api/hls/{id}` 无扩展名），修的时候可一并覆盖。

## 接口侧当前状态

- main 已推到 `603b9da`；javguru.user.js 1.0.1，json `userScript …?v=2`，
  `playUrlMatch` 含 `https://helvid.com/m/*`（兜底用）。
- 播放器侧修好后，JavGuru 无需接口侧再改，ren 直接复测即可。
