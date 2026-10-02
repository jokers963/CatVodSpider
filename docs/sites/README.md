# 站点实现档案

更新时间：2026-10-02。这里记录当前正式站点的实现过程、运行原理、验证方法和可复用经验。故障时间线仍放在 `docs/handovers/`，旧实验放在 `docs/history/`；不要用历史状态覆盖当前实现。

## 当前站点

核心作者栏按项目所有者的直接确认记录，不替代各文档中的后续协作提交历史。

| 站点 | 核心作者 | 主要接入模式 | 播放模式 | 实现档案 |
| --- | --- | --- | --- | --- |
| MissAV | Codex | DOM 抓取 + 页面全局变量 | 详情页 HLS 直链 | [MissAV](missav.md) |
| Jable | Codex | DOM 抓取 + AJAX 分页 + 验证页兼容 | 详情页 HLS 直链 | [Jable](jable.md) |
| AV01 | Claude Opus 5.5 | JSON API + 地区/授权接口 | 带 token 的 HLS 主清单 | [AV01](av01.md) |
| 肉视频（Rou） | Codex | DOM + 页面内编码 hydration | 本地代理解包伪 PNG HLS | [肉视频](rou.md) |
| Hanime1 | Codex | DOM 抓取 + 固定分类/筛选 | 多清晰度 MP4 直链 | [Hanime1](hanime1.md) |
| JavGuru | Codex | DOM + 第三方网页播放器 | WebView 启播后嗅探 HLS | [JavGuru](javguru.md) |

## 共用运行链路

```text
luoyuqiu.json 路由
  → csp_GMSubs / GM WebView 加载目标页和 userscript
  → userscript 返回分类、列表、详情或播放描述
  → GMSubs 仅在需要时补媒体代理、授权清单改写和字幕候选
  → TV 内置 Media3/ExoPlayer 播放
```

脚本缓存版本、userscript 的 `@version`、Spider JAR 版本和 APK 版本是四个独立层次。修改脚本后至少递增 JSON 中的查询版本，并在 Pages 发布后读取远程内容核对，不能只看 Git 提交。

## 新站点先选最简单的接入模式

1. 页面已有稳定 HTTPS MP4/HLS：直接从 DOM 或页面变量返回，参考 MissAV、Jable、Hanime1。
2. 站点有公开 JSON API：直接调用 API，先做参数白名单和超时，参考 AV01。
3. 播放需要短期 token：复用站点授权接口，不缓存签名地址，参考 AV01。
4. 地址只在真实播放器运行时有效：让 WebView 播放器发请求，再用 `playUrlMatch` 嗅探，参考 JavGuru。
5. 媒体做了站点专有封装：只在精确域名和路径上启用最小代理，参考 Rou；不要把特殊处理扩散到其他站。

## 最小验收顺序

1. 为首页/分类/搜索/详情/播放中的非平凡分支留一个 Node 或 Java 回归检查。
2. 运行 `node js/adapters.test.cjs`、`node js/new-sites.test.cjs`、`node js/hanime1.nav.test.cjs` 和 JSON 解析。
3. 核对 GitHub Pages 的脚本版本与正式 JSON，确认不是旧缓存。
4. 手机依次验证列表、详情、内置播放、两次自然进度、快进、返回重播；`state=3`、位置增长、`error=null` 才算实播。
5. 记录没有验证的边界，例如全部分类、末页、长时间播放、不同网络或多线路，不能用一个成功样本概括整站。

## 新站档案应回答的问题

新增站点时复制最接近的现有案例，并至少写清：为什么选择 DOM、API、直链或嗅探；五个 GM 方法分别加载什么页面；ID、分页和筛选如何映射；播放地址在哪一层生成；是否依赖 Cookie、短期 token、请求头或网页运行时；超时/验证/空页怎样结束；缓存版本怎样递增；自动测试与手机实播验证了什么、还缺什么。

## 通用边界

- 不自动点击验证页，不伪造 Cookie、签名参数或验证成功状态。
- 不把临时签名媒体 URL、Cookie、设备标识写进文档或测试。
- `type: "match"` 只是开始等待媒体请求，不等于已经取得可播放地址。
- 页面显示列表、播放器进入加载或拿到 URL，都不能代替实际播放进度证据。
- 新站优先只改 userscript、JSON 和最小测试；只有媒体格式确实需要宿主处理时才改 `GMSubs`。
