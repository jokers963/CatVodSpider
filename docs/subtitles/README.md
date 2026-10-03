# 自有公开字幕库：实现与部署

当前为本地候选，尚未上传 R2、发布新 JAR 或修改正式配置，也未验证手机自动加载和时间轴。候选基于 main `7914a24`，复用已有 TV `Result.subs` → `Sub` → `MediaItem.SubtitleConfiguration` 链路，无需修改 TV 或重签 APK。

## 播放与匹配

`GMSubs.playerContent` 从 GM 播放描述的 `name` 或线路名提取番号，规范化为大写、去掉分隔符，再请求一个 JSON。例：`IPX-343`、`IPX343`、`IPX_343` 对应 `index/IP/IPX343.json`。

生成器与 Java 使用相同的番号规则，覆盖标准字母前缀、紧凑写法、S2M/S2MBD、T28、数字厂商前缀、HEYZO 和 FC2-PPV。以实际出现的第一个番号为准，保留前导零。没有厂商名称的日期/序号不猜测，避免不同厂商同编号串片；未识别文件进入报告。

只在站点的 `ext` 中配置了 `subtitleLibrary` 时查询自有库：

```json
{"subtitleLibrary":"https://subs.example.com/"}
```

它是公开文件根地址，不是 S3 上传端点。配置必须使用 HTTPS 且不能包含账号密码、查询参数或片段；未配置或无效配置继续使用迅雷。六站可以共用同一个根地址，影视名没有可识别番号时跳过匹配。

字幕库命中时采用它的候选，未命中、404、异常或无有效候选时再查迅雷。每次 HTTP 调用最多一秒，最坏为两次查询；接近宿主 30 秒调用截止时跳过，保留两秒返回余量。缓存复用原有五分钟/100 条限制，键含库地址与番号，防止不同库和迅雷结果串用。

索引示意：

```json
{
  "code":"IPX343",
  "subs":[{
    "name":"IPX343 · SRT · 01",
    "path":"subs/IP/IPX343/<64位内容SHA256>.srt",
    "ext":"srt"
  }]
}
```

Java 只接受当前番号目录中的内容哈希文件，相对路径不能跳出目录或指向外站。JSON 响应上限 256 KiB，候选最多 100 个。它将路径转换为公开 HTTPS 地址及播放器需要的 MIME，第一项设为默认字幕，其余可在字幕菜单选择；同时保留并去重站点原有字幕。库和迅雷都不可用时，媒体结果仍原样返回。

番号匹配只能确认影片标识，不能确认字幕时间轴与站点视频版本一致。同番号的删减版、不同片头或分段版本需要实播确认，必要时切换候选或调整字幕延迟。

## 一次性生成与验证

[生成器](../../scripts/subtitles/build_library.py) 使用 Python 3.10+。UTF-8、带 BOM 的 UTF-16 和确定性文件处理使用标准库；旧中文编码自动识别使用 `charset-normalizer`，限定 GB18030 与 Big5。没有可靠识别结果的文件留在报告，不使用替换字符强行解码。只有明确知道整包编码时才使用 `--legacy-encoding gb18030` 或 `big5`，这类转换标为需人工检查。

本机已有依赖的 Python：

```powershell
$subtitlePython = 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
& $subtitlePython -m unittest discover -s scripts/subtitles -v
& $subtitlePython scripts/subtitles/build_library.py `
  --source 'C:/Users/Administrator/Desktop/字幕0包' `
  --output 'D:/SubtitleExport/new-library'
& $subtitlePython scripts/subtitles/build_library.py `
  --source 'C:/Users/Administrator/Desktop/字幕0包' `
  --output 'D:/SubtitleExport/new-library' --verify
```

本轮使用 `charset-normalizer 3.5.1`。其他机器可在自己的 Python 环境运行 `python -m pip install charset-normalizer==3.5.1` 后使用同样的命令。生成输出必须是新目录，与源目录互不包含。Windows 使用长路径支持，避免 260 字符上限导致静默漏扫。

生成过程只读原件，输出 UTF-8 副本并统一换行；仅移除末尾 NUL 填充，内部 NUL、替换字符、无有效字幕结构等仍拒绝。按实际内容识别 SRT/ASS/SSA/VTT，修正仅文件扩展名错误的情况；不自动解压包内的 RAR/ZIP/7Z，也不转换 SMI/IDX/SUB。

同番号、同格式、UTF-8 内容哈希一致时只保留一份；不同时间轴或不同文本保留为多个候选。文件名中标为人工/校对的优先，机翻/自动的靠后；同级优先 SRT，剩余按哈希稳定排序。这是名称启发式，不能作为字幕质量验收。

输出分成两部分：

- `public/`：只包含 `index/` 和 `subs/`，可以上传；索引不包含电脑路径和原始长标题。
- `reports/`：`summary.json` 汇总、`issues.json` 未收录文件、`legacy-encoding-review.json` 编码审计、`sources.json` 原件哈希与对象映射、`verification.json` 验证结果。保留本机供追溯，不上传到公开桶。

`--verify` 核对全部支持格式的文件都有结果或问题记录，复核已收录原件哈希、全部输出文件的 UTF-8/内容哈希/格式、JSON 番号与目录一致性，以及索引引用无遗漏和孤立对象。它验证数据完整性，不替代语义、时间轴或公网/手机验收。

### 本轮整包结果（2026-10-03）

输入共 34,448 个文件，支持格式 34,180 份。收录 33,464 份原字幕，按 UTF-8 内容去重 3,954 份，产出 29,510 个字幕对象、22,758 个番号索引，最多 33 个候选，公开目录 1,226,263,982 字节。278 份按实际内容修正扩展名；旧编码识别出 GB18030 5,273 份、Big5 155 份。

暂未收录 716 份：511 份无可靠番号、205 份编码或字幕结构需要检查（其中 135 份旧编码识别不确定）。另有 75 个压缩包及 193 个其他文件。本轮没有为了提高数字而猜测裸日期番号或宽松替换坏字符。

本机最终输出目录为 `C:/Users/Administrator/Documents/Codex/2026-10-02/https-github-com-jokers963-catvodspider-main/outputs/public-subtitles-final-20261003`；只有它的 `public/` 待上传。编码审计结果是识别器判断，并不证明每个字幕文本都经过人工检查。

## R2 开通与上传

需要用户登录 Cloudflare 并开通 R2。建立专用 Standard 桶，例如 `luoyuqiu-subtitles`；开发验证可启用 `r2.dev` 公开地址。该地址限流且定位为开发用途，正式使用建议绑定自己的域名；公开桶默认不提供根目录文件列表。[Cloudflare 公开桶说明](https://developers.cloudflare.com/r2/buckets/public-buckets/)

批量上传使用官方支持的 S3 工具，示例采用 AWS CLI。在电脑配置限制到此桶的对象读写凭据，使用命名 profile；密钥不进入 JSON、JAR、Git、聊天或手机。S3 端点格式为 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`，区域为 `auto`。[Cloudflare AWS CLI 说明](https://developers.cloudflare.com/r2/examples/aws/aws-cli/)

以下变量是操作时要替换的示例，不是本轮已经建立的云资源：

```powershell
aws configure --profile luoyuqiu-r2
$exportRoot = 'D:/SubtitleExport/new-library/public'
$r2Endpoint = 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com'
$bucketRoot = 's3://luoyuqiu-subtitles'

# 先上传字幕对象，再上传引用它们的索引。无 --delete，不移除已有文件。
aws s3 sync "$exportRoot/subs" "$bucketRoot/subs" `
  --profile luoyuqiu-r2 --endpoint-url $r2Endpoint `
  --content-type 'text/plain; charset=utf-8' `
  --cache-control 'public,max-age=31536000,immutable'
aws s3 sync "$exportRoot/index" "$bucketRoot/index" `
  --profile luoyuqiu-r2 --endpoint-url $r2Endpoint `
  --content-type 'application/json; charset=utf-8' `
  --cache-control 'public,max-age=300'
```

只上传 `public` 下这两个目录。播放器的格式来自 `subs.format`，无需 Worker、数据库或搜索服务。原生播放器请求不依赖浏览器 CORS；以后增加网页字幕预览再配置对应 CORS。

## 发布与验收

1. 生成、编码审计及 `--verify` 通过，确定真实公开根地址。
2. 上传字幕和索引，验证一个单字幕番号、一个多字幕番号以及不存在的番号；确认所有候选地址可下载且内容是 UTF-8。
3. 用 [gmRelease](../../scripts/gmRelease/build-check.ps1) 构建经过关闭遥测/日志处理的候选。该旧脚本输出名固定为 `gm_subs-v37.jar`，它在新输出目录中的内容不等于已发布 v37；发布时另定新版本名，保留正式 v37。`gmSubsManual` 的原始 GM 包候选不能直接发布。
4. 在测试配置中引用新 JAR，并给六站 `ext` 增加相同 `subtitleLibrary`，以正式站点配置为基础，不复制过期脚本版本。
5. 手机确认匹配后自动出现字幕、候选切换、快进后字幕连续性、无字幕/库不可用时迅雷兜底和媒体仍可播放；遵守不截图、不清数据等用户边界。
6. 验收后才更新正式入口的 JAR/配置版本、MD5、发布记录和共享交接。原 APK 和签名无需改动。

本地 Java 测试覆盖真实 `playerContent` 路径中的库命中、404、坏 JSON、两源均失败、媒体字段/原字幕保留、缓存与截止时间；Python 检查覆盖只读原件、两种旧中文编码、UTF-16、去重、格式纠正、输出隔离及验证发现原件变化。
