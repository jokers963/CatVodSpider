# MissAV 实现档案

当前实现：`js/missav.user.js` 1.2.5，正式脚本查询版本 `v=9`。

## 为什么采用 DOM + 页面变量

MissAV 的列表和分类导航已在服务端页面中呈现，详情页又会把最终 HLS 放在 `unsafeWindow.hls.url`。因此不需要额外 API、媒体嗅探或播放器代理：WebView 负责通过站点访问条件，脚本只抽取已经生成的数据。

## 路由与数据流

| GM 方法 | 页面 | 提取方式 |
| --- | --- | --- |
| `homeContent` | `/cn/new` | 返回五个固定主分类，不生成“推荐”列表 |
| `categoryContent` | `/cn/${tid}?page=${pg}` | 普通分类抓视频卡；maker 分组先返回文件夹 |
| `searchContent` | `/cn/search/${key}?page=${pg}` | 抓 `.gap-5 .thumbnail` 卡片 |
| `detailContent` | `/cn/${id}` | `og:title`、`og:image` 和 `unsafeWindow.hls.url` |

普通卡片从 `/cn/{id}` 链接、`.text-secondary` 标题和 lazy-load 图片属性组装。maker 分类在隐藏导航 `nav.hidden` 中先展开为 `vod_tag: "folder"`，避免把目录误当影片。页数来自页面的 `#price-currency` 文本，这是站点当前实际承载总页数的位置。

详情只接受 HTTPS HLS。`vod_play_from` 会带作品编码和标题，供 `GMSubs` 的通用字幕编码提取使用；播放本身仍是普通 `vod_play_url`，不要改成不等价的 GM `finalUrl` 描述。

## 验证页与异步时机

脚本每 400 ms 检查一次，最多等待 25 秒。检测到 Cloudflare 页面时显示 WebView，让用户自行完成验证；真实内容一旦出现立即优先返回，即使验证控件仍残留在 DOM 中。脚本不自动点击验证，也不保存验证数据。

## 实现过程

- `47e3053`：首次加入 MissAV。
- `4f430bb`、`c310e5f`：按真实导航修正分类和 HLS 播放。
- `9519004`、`fda9c47`：把标题/编码交给通用字幕匹配，同时恢复简单直链播放。
- `e42968e`：等待异步内容并显式处理验证页。
- `7ce766e`：改为内容优先，解决验证控件残留导致结果不返回。

## 测试与实机结论

`js/adapters.test.cjs` 覆盖首页、详情播放、验证等待和内容优先分支。正式手机验收记录为内置播放器 `state=3`、进度持续增长、快进和返回重播通过；精确样本见 `AI_HANDOFF.md`。

## 可复用经验

- 页面全局变量可能晚于 DOM 完成，先轮询“业务数据是否就绪”，不要只等 `load`。
- 验证控件存在不代表仍处于验证状态；真实内容应优先。
- 如果页面已经给出稳定直链，不要额外引入嗅探、代理或自定义播放器。
- 导航中的“文件夹”和最终视频列表要分别建模，否则分类会混入不可播放条目。
