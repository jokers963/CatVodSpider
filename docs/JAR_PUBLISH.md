# 正式 JAR 发布短清单

权限以用户当次授权为准。小改动可直接推 main；动 jar 属大改动，先对方案。

1. 基线：干净工作树，核对远程 `main` HEAD；不碰签名/AAR/TV/R2/原档。
2. 构建：跑 `scripts/gmRelease/build-check.ps1`（包装层测试 + 关闭遥测/日志出口）。`build.gradle` 的 `gmSubsJar` 只是测试候选，不能当正式包。
3. 落盘：`jar/gm_subs-vN.jar` 与对应 MD5 文本；保留上一正式版及更早回退包。
4. 配置：`json/luoyuqiu.json` 的 `spider` 只改版本查询参数与 MD5；五站与 `subtitleLibrary` 等除非授权否则不动。
5. 发布：按 AGENTS 规则推送或开 PR；合并后等 CI 与 Pages success。
6. 公网核对：裸正式 URL、JAR 字节/MD5、回退 JAR；与本地深比较。
7. 记录：更新 AGENTS「唯一现状卡」与 AI_HANDOFF 顶部；标明手机 QA 是否已做（未做勿写通过）。
8. 当前发布记录：v40 由 Codex 经 PR #5 发布完成；手机加载/绘制/切换等 **未** 新增验收。
