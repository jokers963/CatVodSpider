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

## 根因假设（尚未确认）

**该 HLS 地址的 URL 路径里没有 `.m3u8` 扩展名。**
`.m3u8` 被 base64 编码藏在路径里（`/m/L3Yv…` 解码后才是
`/v/AGMX-271/…/playlist.m3u8`），播放器从 URL 上看不到。

若播放器首次判格式走的是 URL 后缀（ExoPlayer `Util.inferContentType(uri.getPath())` 这类逻辑），
无后缀会被当成普通 progressive/MP4，用 ProgressiveMediaSource 去解析 `#EXTM3U`
文本 → 解析失败 → 转圈后报错。与 ren 描述的症状完全吻合。

但这还不能定为根因。当前 TV `luoyuqiu` 代码的 `ExoPlayerEngine.handleError()` 已对
`IO_UNSPECIFIED`、容器/清单 malformed 与 unsupported 错误调用 `retryFormat()`，并由
`ExoUtil.getMimeType()` 切换为 HLS 或 octet-stream 后重试；同时 rou 的无扩展名 HLS 已有
实机通过记录。必须先取得本次失败的实际 `PlaybackException.errorCode`、底层 cause 和
媒体 HTTP 结果，确认是否进入过现有重试分支。

六个站最终送给播放器的 URL 对照：

| 站点 | 最终 URL | 格式 | URL 带扩展名 |
|---|---|---|---|
| missav | `unsafeWindow.hls.url` → `…/*.m3u8` | HLS | 有 |
| jable | `hlsUrl` → `…/*.m3u8` | HLS | 有 |
| av01 | playerContent → `…/manifest/master.m3u8?access_token=…` | HLS | 有 |
| hanime1 | `video source.src` → `…/*.mp4` | MP4 | 有 |
| rou | `/api/hls/{id}` | HLS | **无**（同类隐患） |
| javguru | playerContent → `https://helvid.com/m/{base64}?…` | HLS | **无** |

## 已知约束与仍需核对的接口能力

- `h` 参数是对请求签名的，改路径强行加 `.m3u8` 会破坏签名；
- ExoPlayer 的扩展名判断只看 `uri.getPath()`，加 query 参数或 `#` 片段不影响判定。
- 但 `playerContent` 的最终宿主契约支持 `format`；仍需确认 GM 的 `{type:"url"}` 包装是否能
  将显式格式传给 TV。确认前不能写成“接口侧无法修复”。

## 下一步（先诊断，后决定修改层）

1. 手机复现时记录实际 `PlaybackException.errorCode`、cause、响应状态与 Content-Type，并确认现有 `retryFormat()` 是否执行。
2. 若只是格式提示缺失，优先在最接近播放结果的已有契约中传 HLS `format`；只有 GM 无法透传时再考虑播放器域名/路径映射。
3. 不默认增加播前 HEAD：签名地址或 CDN 可能不支持 HEAD，也会额外增加启动请求；只有实际证据需要时再做 Content-Type 探测。

rou 的 `/api/hls/{id}` 可作为无扩展名 HLS 的对照样本；它当前已有实播通过记录，不因本问题顺带修改。

## 接口侧当前状态

- main 已推到 `603b9da`；javguru.user.js 1.0.1，json `userScript …?v=2`，
  `playUrlMatch` 含 `https://helvid.com/m/*`（兜底用）。
- 当前不能预设一定修改播放器侧；根据错误证据选择接口格式提示或播放器修复，之后再由 ren 手机复测。
