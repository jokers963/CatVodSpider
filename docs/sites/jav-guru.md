# JavGuru 原站（jav.guru）实现档案

状态：**测试中**（2026-10-14）。入口 `json/luoyuqiu-javguru-test.json`，key `jav_guru`，脚本 `js/jav.guru.user.js` 0.1.0（`?v=1`）。未进入正式配置。
正式配置里原来叫“JavGuru”的 `javguru.fit` 是仿站，已改名为 Upload18，见 [upload18.md](upload18.md)。

## 路由

| GM 方法 | loadUrl | 实际请求 |
| --- | --- | --- |
| homeContent | Pages 空白页 | 固定分类：jav / jav-uncensored / decensored / english-subbed / amateur / FC2 / 1080p |
| categoryContent | `jav.guru/robots.txt#/category/${tid}/page/${pg:-1}/` | 页内 fetch `/category/<tid>/`，第 N 页为 `/category/<tid>/page/N/` |
| searchContent | `jav.guru/robots.txt#/page/${pg:-1}/?s=${key}` | 脚本按参数构造：第 1 页 `/?s=<kw>`，第 N 页 `/page/N/?s=<kw>`，关键词只 encodeURIComponent 一次 |
| detailContent | `jav.guru/robots.txt#${id}` | 页内 fetch 详情页 |
| playerContent | `jav.guru/robots.txt` | 原生 HTTP（GM_xmlhttpRequest）解析，失败时用页内 fetch 取网关页 |

- `robots.txt` 由 CF 边缘缓存，不会出验证；页内 fetch 与 WebView 共用 Cookie、UA 和 TLS。fetch 拿到 403 或验证页时整页跳转到目标页，由用户手动完成验证（不自动点击）。
- 总页数取分页链接里的最大页码（`/page/N/`），且不小于当前页；结果为空时总页数等于当前页。

## 详情与线路

- 番号取信息栏 `Code:` 行，没有时取标题中的 `[ABC-123]`，用于匹配字幕库；演员取 `Actress:` 行。
- 按钮 `a[data-localize=X]` 的文字是 `STREAM XX`；页面脚本里 `var X = {..."iframe_url":"<base64>"}` 解码后得到站内网关地址 `https://jav.guru/searcho/?..`。
- 网关页的前端在点击后执行 `activate_real_stream()`：把 `stream-box` 上三个 data 属性拼接后反转，得到 `base + '?' + rtype + 'r=' + token`。脚本直接做同样的计算，**不点击、不触发广告**（网关页上挂有 pemsrv popunder，已加入 blockList）。
- 真实地址 302 到视频托管站的嵌入页；HttpURLConnection 会自动跟随跳转，`finalUrl` 就是嵌入页，所以不写死托管站域名（StreamHG 的别名会变，例如 javclan.com、hanerix.com）。
- 嵌入页的 p,a,c,k,e,d 代码解包后：StreamHG 优先取 `hls4`（同域 `/stream/.../master.m3u8`），其次 `hls2`；LuluStream 取 `sources[0].file`。返回 `type:url`，并带上 Referer/Origin（嵌入页的域名）。
- 线路：
  - **SB**：StreamHG，实测有 480/720/1080 三档，master 与分片带 Referer 的原生请求都返回 200。
  - **LU（测试）**：LuluStream，地址带 `_h`；master 绑定 IP，服务器上测试返回 403，需要在手机上确认能否播放、是否为 1080p。
- 其余线路不收：JK（maxstream）实测只有 720p；VO（Voe）、VI（vidara）、DD（DoodStream）需要网页播放器或 IP 绑定，未验证 1080p。
