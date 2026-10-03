# 自有公开字幕库：实现与部署

2026-10-03 字幕数据已上传 R2，云端全量及公开样本校验通过；候选 JAR/配置只发布在隔离测试分支。手机已验证候选加载、库字幕轨道自动选择、候选切换和未命中仍可播放；用户确认 IPX005 的字幕实际显示，且当前播放器临时校准 -6 秒后同步。该结果不代表全库无需校准即可同步，正式入口未改。候选基于 main `7914a24`，复用已有 TV `Result.subs` → `Sub` → `MediaItem.SubtitleConfiguration` 链路，无需修改 TV 或重签 APK。

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

本机最终输出目录为 `C:/Users/Administrator/Documents/Codex/2026-10-02/https-github-com-jokers963-catvodspider-main/outputs/public-subtitles-final-20261003`；本轮只上传了它的 `public/`，原件和报告保留本机。编码审计结果是识别器判断，并不证明每个字幕文本都经过人工检查。

## R2 开通与上传

需要用户登录 Cloudflare 并开通 R2。建立专用 Standard 桶，例如 `luoyuqiu-subtitles`；开发验证可启用 `r2.dev` 公开地址。该地址限流且定位为开发用途，正式使用建议绑定自己的域名；公开桶默认不提供根目录文件列表。[Cloudflare 公开桶说明](https://developers.cloudflare.com/r2/buckets/public-buckets/)

批量上传使用官方支持的 S3 工具，示例采用 AWS CLI。在电脑配置限制到此桶的对象读写凭据，使用命名 profile；密钥不进入 JSON、JAR、Git、聊天或手机。S3 端点格式为 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`，区域为 `auto`。[Cloudflare AWS CLI 说明](https://developers.cloudflare.com/r2/examples/aws/aws-cli/)

以下为可复用操作示例，端点和目录需按实际环境替换。

录入凭据时先执行 `aws configure --profile luoyuqiu-r2` 并按回车，看到 Access Key ID 提示后再从创建成功页复制，不能把密钥粘到命令末尾（会误改 profile 名称）。不要经过手工抄写；API Token 字符串也不能代替 S3 Access Key ID。若用剪贴板只检查长度，先在终端准备命令、再复制密钥、最后回终端只按回车，避免复制检查命令本身覆盖剪贴板。任何截图、报告和交接都不得包含密钥值。

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

### 云端完整性复核

[verify_r2.ps1](../../scripts/subtitles/verify_r2.ps1) 使用已配置的 AWS CLI 获取完整分页对象清单，再与本地最终公开目录逐个比较路径、字节数和单文件 ETag/MD5，不重新下载整套库，也不删除任何对象。生成器另行核对源件和对象 SHA256；公开访问检查还要下载样本验证实际内容及 UTF-8。该脚本适用于本轮小文件、单段上传、专用桶的布局；遇到非 MD5 ETag 会停止，不能把分段对象 ETag 当作内容哈希。

本机独立上传工具使用的 Python 为 `C:/Users/Administrator/Documents/Codex/2026-10-02/https-github-com-jokers963-catvodspider-main/outputs/tools/awscli-r2/Scripts/python.exe`。确认全部同步成功后，在仓库目录运行：

```powershell
./scripts/subtitles/verify_r2.ps1 -PublicRoot $exportRoot `
  -AwsPython '<已安装 AWS CLI 的 Python 路径>' -Endpoint $r2Endpoint
```

脚本只输出计数、总大小及通过状态，不输出密钥或原始字幕文本。对象总数不一致时先查原因，不使用 `--delete` 强行对齐。

### 本轮部署结果（2026-10-03）

Standard 桶 `luoyuqiu-subtitles` 的公开根地址为 [字幕库开发地址](https://pub-662c4b411cfb4cf69f52f71f22140341.r2.dev)。29,510 个字幕对象和 22,758 个索引已全部上传，共 52,268 个文件、1,226,263,982 字节；全量路径、大小及单段 ETag/MD5 与本地导出一致。

公网 HTTP 检查中，`107SYBI001` 的单候选及 `10MU1080` 的全部 17 个候选均可下载，18 份字幕的 SHA256 和严格 UTF-8 检查通过；不存在的番号返回 404。字幕和索引的 Content-Type、Cache-Control 与上传设置一致。这里的缓存头不代表 `r2.dev` 已提供自定义域名的边缘缓存能力。

云端检查报告保留在本机 `outputs/r2-public-validation-20261003`；它们不替代下节的手机测试。正式配置、v37 JAR、TV 源码和 APK 均未修改。

## 发布与验收

### 当前验收范围与用户决定（2026-10-03）

用户授权将现有测试及记录提交到测试分支，不替换正式入口。用户明确不再做 AV01、JavGuru 新样本的绘制/对白同步目视验收，并将 Jable 重复验证暂缓；这不是验收通过，也不作为自动恢复测试的待办。

| 范围 | 已有证据 | 未验证或暂缓 |
| --- | --- | --- |
| MissAV | 单/多候选、切换、快进及未命中播放；IPX005/SRT 02 用户确认显示并在临时 -6 秒校准后同步 | 不保证其他影片或未校准时间轴同步 |
| AV01、JavGuru | 库轨道自动选择、偏移 +0.0s、快进后正常播放且选择保留 | 用户跳过目视绘制/对白同步，保持未验证 |
| Hanime1、肉视频 | 无可识别番号样本正确跳过字幕匹配，正常播放 | 库命中未验证 |
| Jable | 本轮遇到验证，等待结束返回错误、播放 state=0 | 本轮播放/字幕未通过，按用户要求暂缓 |
| 故障兜底 | 手机连接拒绝后出现并选中迅雷候选，媒体继续播放；Java 模拟拒绝连接/超时断言通过 | 手机真实超时及故障样本字幕绘制未验证 |

以下手机段落为过程记录，旧“待确认”和“仅本地”描述以当时为准。完整六站字幕验收及全库自动同步未完成；不新增偏移持久化、不更改整库时间轴，正式发布须另行获得用户授权。

记录/回归测试提交 `b5e4149` 已推送测试分支。随后只读复核发现其他维护者将 main 推进至 `1336ed8`，新增 MemoJav（`4bb9dba`），未在本轮合并或覆盖。字幕测试配置仍基于 `7914a24` 的六站快照；下述配置隔离检查只与本测试分支的 `json/luoyuqiu.json` 比较，不是最新七站 main 的一致性证明。正式发布前另行协调、对齐最新配置并复核，不能用旧六站配置覆盖新站。

隔离入口为 [字幕测试配置](https://raw.githubusercontent.com/jokers963/CatVodSpider/feat/public-subtitles/json/luoyuqiu-subtitles-test.json)，只在 `feat/public-subtitles` 分支发布候选 JAR 和配置，不替换 main 或正式 Pages 入口。配置内含候选 MD5，六站沿用最新正式 userscript；`node scripts/subtitles/test_config.cjs` 检查候选校验值、六站库地址以及除此之外与正式配置完全相同。

### 本轮手机抽样（2026-10-03）

用户授权正常解锁和开启手机现有代理后，沿用现有配置/节点启用 Clash。App 通过本地 cast API 和接收确认界面加载远程测试入口，没有直接改私有配置文件。手机缓存 JAR 的 SHA256 与候选和公网一致；只正常重启 App，没有清数据、截图、安装 APK 或修改方向锁定。

- MissAV IPX343：菜单自动选中“字幕库 · IPX343 · SRT · 01”；持续播放位置 `21196→57234 ms`，快进后的准备状态恢复至 `145330 ms` 正常播放。
- MissAV IPX005：菜单列出 3 个 SRT 和 1 个 VTT。切换 SRT 03、快进后 `116610→165369 ms` 正常播放，重新打开菜单确认 SRT 03 selected；切换 VTT 04，返回再进入仍 selected VTT 04，播放恢复。
- CJOD538：库索引 HTTP 404，仍正常播放 `45→29123 ms`，没有错误提示或字幕按钮；这不证明迅雷命中，只证明此未命中样本不阻断媒体。

正常播放样本均 `state=3`、`speed=1.0`、`error=null`；所查日志未见播放/字幕解码异常。轨道名称和 selected 状态不能单独证明实际绘制或同步；用户随后以 IPX005 内嵌字幕作参照，确认外挂字幕已显示但晚约 7 秒。复核时当前选中 SRT 02、原偏移 +0.0s，现已在播放器字幕设置中读回确认 -7.0s（提前 7 秒），恢复正常播放，待用户对照确认。偏移只调用当前 player 的 `setTextOffsetMs`，没有改字幕原文件或全库；其他影片测试前应归零，不保证此临时值跨影片不会继承，也不把它写为统一校正。

手机保留测试入口和 IPX005 供复核；尚未验收六站全部字幕、库网络异常或所有时间轴，不正式发布。手机报告在本机 `outputs/public-subtitles-phone-test-20261003/verification.json`。

用户随后反馈 -7 秒时外挂反而提前约 1 秒，已减为提前 6 秒，界面核对 `-6.0s` 并恢复播放（`581314 ms`、state=3、speed=1.0、error=null）。用户最终回复“同步了”，该视频/SRT 02 校准后的同步验收通过；原库不改，不能将 -6 秒推广到其他候选或影片，也不能将临时 player 偏移描述为影片持久化记录。已结束播放并停止 App，进程不存在、MediaSession 栈为 0 sessions，本次临时 ADB 转发已移除。手机保留测试配置，现有代理按用户要求保持运行；后续其他影片前核对偏移归零。

### 续测：其他站点与真实连接失败（2026-10-03）

- AV01、JavGuru 的 IPX343 样本自动选中库 SRT 01，设置读回 +0.0s；快进到约 27/26 分钟后正常播放，库轨道仍 selected。新样本的字幕绘制及对白同步待用户目视确认，不能仅凭轨道菜单判断。
- Hanime1、肉视频各一个无可识别番号样本正常播放，字幕菜单无库/迅雷轨道；这是正确跳过不误配，不是库命中覆盖。
- 本机临时配置仅将库根地址替换为 HTTPS loopback 的拒绝连接端口；手机核对该端口 Connection refused 和配置实际选中，MissAV/IPX343 仍正常播放，自动选中迅雷 SRT 候选。这是手机故障兜底样本，不再只是桌面模拟。
- 已恢复公开候选入口，只移除新增的临时故障配置条目及本轮服务/ADB 连接；未清应用数据、未改代理、未改 TV/APK 或已发布 JAR。Jable 验证等待结束后返回错误提示、播放仍 state=0，手机留在该样本页面待用户重新尝试及手动验证，正式发布未做。
- 本机报告：`outputs/subtitles-extra-tests-20261003/extra-verification.json`。现有 Java 用例追加连接拒绝、超时与迅雷候选断言，26 项及三组 Node/配置隔离检查通过；测试修改与本段记录仍仅本地未推送。

### 完整验收流程（清单）

1. 生成、编码审计及 `--verify` 通过，确定真实公开根地址。
2. 上传字幕和索引，验证一个单字幕番号、一个多字幕番号以及不存在的番号；确认所有候选地址可下载且内容是 UTF-8。
3. 用 [gmRelease](../../scripts/gmRelease/build-check.ps1) 构建经过关闭遥测/日志处理的候选。该旧脚本输出名固定为 `gm_subs-v37.jar`，它在新输出目录中的内容不等于已发布 v37；发布时另定新版本名，保留正式 v37。`gmSubsManual` 的原始 GM 包候选不能直接发布。
4. 在测试配置中引用新 JAR，并给六站 `ext` 增加相同 `subtitleLibrary`，以正式站点配置为基础，不复制过期脚本版本。
5. 手机确认匹配后自动出现字幕、候选切换、快进后字幕连续性、无字幕/库不可用时迅雷兜底和媒体仍可播放；遵守不截图、不清数据等用户边界。
6. 验收后才更新正式入口的 JAR/配置版本、MD5、发布记录和共享交接。原 APK 和签名无需改动。

本地 Java 测试覆盖真实 `playerContent` 路径中的库命中、404、坏 JSON、两源均失败、媒体字段/原字幕保留、缓存与截止时间；Python 检查覆盖只读原件、两种旧中文编码、UTF-16、去重、格式纠正、输出隔离及验证发现原件变化。
