// ==UserScript==
// @name         SupJav
// @namespace    luoyuqiuspider
// @version      2.4.0
// @description  SupJav WebView adapter for the open-source GM spider runtime. TEST ONLY - not in formal config.
// @match        https://supjav.com/*
// @match        https://jokers963.github.io/CatVodSpider/*
// @match        https://streamtape.com/e/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    // 线路：EVS / VAS / FST（EVS、FST 为 p,a,c,k,e,d → hls4；VAS 为 /api/stream POST）；
    // ST（Streamtape）= 用户手动点播放 + GM 嗅探 get_video（不自动点击、不点广告）；VOE 未收；LUC 仅 720p 不收。
    const LINES = ["EVS", "VAS", "FST", "ST"];
    const ST_HOST = /^https:\/\/streamtape\.com\/e\/[0-9a-z]+(\/|$)/i;
    const VAS_HOST = /^https:\/\/vvaassjjav\.xyz\/e\/([0-9a-z]+)/i;
    const LK1 = "https://lk1.supremejav.com/";
    const EMBED_HOSTS = /^https:\/\/(evsishere\.xyz|fc2stream\.tv|vvaassjjav\.xyz|streamtape\.com)\//;

    function absUrl(href) {
        try { return new URL(href, location.href).href; }
        catch (_) { return href || ""; }
    }

    function isVideoLink(href) {
        return /supjav\.com\/\d+\.html(\?|#|$)/.test(href || "");
    }

    function cleanPic(raw) {
        return /base64|1x1|placeholder|loading|blank\.gif|empty\.gif/i.test(raw || "") ? "" : (raw || "");
    }

    function videos() {
        const list = [];
        const seen = new Set();
        document.querySelectorAll("div.post").forEach(function (post) {
            const link = post.querySelector("a.img[href], h3 a[href]");
            if (!link) return;
            const href = link.getAttribute("href") || "";
            if (!isVideoLink(href)) return;
            const id = absUrl(href);
            if (seen.has(id)) return;
            const name = (link.getAttribute("title") || "").trim()
                || ((post.querySelector("h3 a") || {}).textContent || "").trim()
                || (link.textContent || "").trim();
            if (!name) return;
            seen.add(id);
            const img = post.querySelector("img.thumb, img");
            const picRaw = img ? (img.getAttribute("data-original") || img.getAttribute("data-src")
                || img.getAttribute("data-lazy-src") || img.getAttribute("src") || "") : "";
            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: absUrl(cleanPic(picRaw)),
                vod_remarks: ((post.querySelector(".meta") || {}).textContent || "").trim()
            });
        });
        return list;
    }

    function pageCount() {
        let count = 1;
        document.querySelectorAll("a[href]").forEach(function (a) {
            const m = /\/page\/(\d+)\/?(\?|#|$)/.exec(a.getAttribute("href") || "");
            if (m) count = Math.max(count, parseInt(m[1], 10));
        });
        return count;
    }

    // 作品编码供 GMSubs 字幕匹配：FC2PPV 4991168 → FC2PPV-4991168；ABC-123 原样大写。
    function workCode(title) {
        const fc2 = /FC2[\s-]*PPV[\s-]*(\d{5,8})/i.exec(title || "");
        if (fc2) return "FC2PPV-" + fc2[1];
        const m = /\b([A-Z]{2,6})-(\d{2,5})\b/i.exec(title || "");
        return m ? (m[1] + "-" + m[2]).toUpperCase() : "";
    }

    function reverse(s) { return String(s || "").split("").reverse().join(""); }

    const CLASSES = [
        {type_id: "censored-jav", type_name: "有码"},
        {type_id: "uncensored-jav", type_name: "无码"},
        {type_id: "amateur", type_name: "素人"},
        {type_id: "chinese-subtitles", type_name: "中字"},
        {type_id: "reducing-mosaic", type_name: "去码"},
        {type_id: "english-subtitles", type_name: "英字"}
    ];

    // ---- 播放解析（纯函数，便于离线测试）----
    // Dean Edwards packer 解包，不使用 eval。
    function unpack(html) {
        const m = /}\('((?:[^'\\]|\\.)*)',\s*(\d+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(html || "");
        if (!m) return "";
        const p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
        const a = parseInt(m[2], 10);
        const k = m[4].split("|");
        function enc(n) {
            return (n < a ? "" : enc(Math.floor(n / a)))
                + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
        }
        const dict = {};
        for (let c = parseInt(m[3], 10) - 1; c >= 0; c--) dict[enc(c)] = k[c] || enc(c);
        return p.replace(/\b\w+\b/g, function (w) { return Object.prototype.hasOwnProperty.call(dict, w) ? dict[w] : w; });
    }

    function hlsFromEmbed(html, embedUrl) {
        const js = unpack(html);
        const origin = (/^https?:\/\/[^/]+/.exec(embedUrl) || [""])[0];
        const found = {};
        const re = /["']?(hls\d)["']?\s*:\s*["']([^"']+)["']/g;
        let m;
        while ((m = re.exec(js))) found[m[1]] = m[2];
        // hls4 = 播放器同域相对 /stream/.../master.m3u8，优先；hls2 为备线
        for (const key of ["hls4", "hls2"]) {
            const v = found[key];
            if (!v) continue;
            const url = v.charAt(0) === "/" ? origin + v : v;
            if (/^https:\/\//.test(url) && /\.m3u8(\?|$)/.test(url)) return url;
        }
        return "";
    }

    function gmGet(url, referer, body) {
        return new Promise(function (resolve) {
            if (typeof GM_xmlhttpRequest !== "function") { resolve(null); return; }
            let settled = false;
            const finish = function (r) { if (!settled) { settled = true; resolve(r); } };
            const headers = {"Referer": referer, "User-Agent": navigator.userAgent};
            const req = {method: "GET", url: url, timeout: 15000, headers: headers};
            if (body !== undefined) {
                req.method = "POST";
                req.data = JSON.stringify(body);
                headers["Content-Type"] = "application/json";
            }
            try {
                GM_xmlhttpRequest(Object.assign(req, {
                    onload: function (r) { finish(r && r.status === 200 ? r : null); },
                    onerror: function () { finish(null); },
                    ontimeout: function () { finish(null); }
                }));
            } catch (_) { finish(null); }
            setTimeout(function () { finish(null); }, 20000);
        });
    }

    // lk1 302 → embed（HttpURLConnection 自动跟随，finalUrl 即 embed）；embed 带 Referer 才输出播放器脚本。
    async function resolveDirect(code) {
        if (!code) return null;
        const first = await gmGet(LK1 + "supjav.php?c=" + code, "https://supjav.com/");
        if (!first) return null;
        const embed = String(first.finalUrl || "").split("#")[0];
        if (!EMBED_HOSTS.test(embed)) return null;
        if (ST_HOST.test(embed)) return null; // ST 不走直链（get_video 需在网页播放器内由用户起播）
        const vas = VAS_HOST.exec(embed);
        if (vas) return resolveVas(embed, vas[1]);
        let url = hlsFromEmbed(first.responseText, embed);
        if (!url) {
            const second = await gmGet(embed, LK1);
            url = second ? hlsFromEmbed(second.responseText, embed) : "";
        }
        if (!url) return null;
        const origin = (/^https:\/\/[^/]+/.exec(embed) || [""])[0];
        return {type: "url", ext: {url: url, header: {
            "User-Agent": navigator.userAgent, "Referer": origin + "/", "Origin": origin
        }}};
    }

    // VAS（Vidara）：codecs 只认 av1/h265，H.264 是默认档；部分片源只有 AV1/H.265 转码。
    // device=web 时这类片源给 AV1，device=android 给 H.265（更易硬解）；有 H.264 时两者都返回 H.264。
    async function resolveVas(embed, filecode) {
        const r = await gmGet("https://vvaassjjav.xyz/api/stream", embed, {filecode: filecode, device: "android", codecs: []});
        if (!r) return null;
        let url = "";
        try { url = String(JSON.parse(r.responseText).streaming_url || ""); } catch (_) {}
        if (!/^https:\/\/[^/]+\/.*\.m3u8(\?|$)/.test(url)) return null;
        return {type: "url", ext: {url: url, header: {
            "User-Agent": navigator.userAgent, "Referer": "https://vvaassjjav.xyz/", "Origin": "https://vvaassjjav.xyz"
        }}};
    }

    // ST：lk1 → streamtape 嵌入页地址；只解析，不取媒体地址。
    async function resolveStEmbed(code) {
        if (!code) return "";
        const first = await gmGet(LK1 + "supjav.php?c=" + code, "https://supjav.com/");
        const embed = first ? String(first.finalUrl || "").split("#")[0] : "";
        return ST_HOST.test(embed) ? embed : "";
    }

    // ST 播放阶段运行在 supjav.com（json playerContent.loadUrl=${stpage:-Pages}）：streamtape 嵌入页无 supjav Referer 返回 404，
    // supjav 页面自身是 Referrer-Policy: same-origin，故先加 <meta name=referrer content=origin> 再顶层跳转，
    // 让嵌入页收到 Referer: https://supjav.com/。返回 {type:"match"} 后 GM 等待 playUrlMatch 命中（用户自己点播放）。
    function openStEmbed(embed) {
        try {
            const meta = document.createElement("meta");
            meta.setAttribute("name", "referrer");
            meta.setAttribute("content", "origin");
            (document.head || document.documentElement).appendChild(meta);
        } catch (_) {}
        location.replace(embed);
    }

    // 在 streamtape 嵌入页（@match）里：不点击任何元素、不关闭遮罩；只在用户点播放、视频真正开始后
    // 暂停并静音网页内的 <video> 并隐藏 WebView，避免与外部播放器同时出声。
    function streamtapeGuard() {
        let done = false;
        const quiet = function (v) {
            if (done) return;
            done = true;
            try { v.muted = true; v.pause(); } catch (_) {}
            try { GmSpiderInject.HideWebview(); } catch (_) {}
        };
        const hook = setInterval(function () {
            const v = document.querySelector("video");
            if (!v || v.__stHooked) return;
            v.__stHooked = true;
            v.addEventListener("playing", function () { quiet(v); });
            clearInterval(hook);
        }, 500);
    }

    function playerMedium() {
        try { return JSON.parse(args[1] || "{}"); } catch (_) { return {}; }
    }

    const spider = {
        homeContent: function () { return {class: CLASSES, list: []}; },
        categoryContent: function () { return {list: videos(), pagecount: pageCount()}; },
        searchContent: function () { return {list: videos(), pagecount: pageCount()}; },
        detailContent: function (ids) {
            const page = ids[0];
            const h1 = (document.querySelector(".archive-title h1, h1") || {}).textContent;
            const title = ((document.querySelector('meta[property="og:title"]') || {}).content || h1 || document.title || "").trim();
            const image = (document.querySelector('meta[property="og:image"]') || {}).content || "";
            const code = workCode(title);
            let groups = Array.from(document.querySelectorAll(".cd-server"));
            if (!groups.length) groups = [document];
            const byLine = {};
            groups.forEach(function (group, i) {
                group.querySelectorAll("a.btn-server[data-link]").forEach(function (a) {
                    const line = (a.textContent || "").trim().toUpperCase();
                    const link = a.getAttribute("data-link") || "";
                    if (LINES.indexOf(line) < 0 || !/^[0-9a-f]+$/i.test(link)) return;
                    const replace = {page: page, c: reverse(link), line: line, cd: String(i + 1)};
                    // ST 播放阶段需加载 supjav.com 页面（作为跳转嵌入页的 Referer 来源），其它线路仍加载 Pages 空白页。
                    if (line === "ST") replace.stpage = "https://supjav.com/";
                    (byLine[line] = byLine[line] || []).push({
                        name: groups.length > 1 ? "CD" + (i + 1) : "播放",
                        type: "webview",
                        ext: {replace: replace}
                    });
                });
            });
            const playData = LINES.filter(function (l) { return byLine[l]; }).map(function (l) {
                return {from: code ? code + " " + l : l, media: byLine[l]};
            });
            if (!playData.length) return {list: []};
            return {list: [{
                vod_id: page,
                vod_name: title,
                vod_pic: absUrl(image),
                vod_content: ((document.querySelector('meta[name="description"]') || {}).content || "").trim(),
                vod_play_data: playData
            }]};
        },
        playerContent: async function () {
            const rep = (playerMedium().ext || {}).replace || {};
            if (rep.line === "ST") {
                const embed = await resolveStEmbed(rep.c);
                if (!embed) return {type: "url", ext: {url: "", header: {}}, msg: "ST 嵌入页解析失败，请换线路重试"};
                return {type: "match", embed: embed};
            }
            const direct = await resolveDirect(rep.c);
            if (direct) return direct;
            // 播放阶段加载的是自家 Pages 空白页（无 Cloudflare），没有详情页按钮可点，失败直接提示换线路。
            return {type: "url", ext: {url: "", header: {}}, msg: "播放地址解析失败，请换线路重试"};
        }
    };

    function navigationStartedAt() {
        if (typeof performance !== "undefined") {
            if (Number.isFinite(performance.timeOrigin)) return performance.timeOrigin;
            if (performance.timing && Number.isFinite(performance.timing.navigationStart)) return performance.timing.navigationStart;
        }
        return Date.now();
    }

    if (/^https:\/\/streamtape\.com\//.test(location.href || "")) { streamtapeGuard(); return; }

    let sent = false;
    let busy = false;
    let verificationShown = false;
    let challengeSeenAt = 0;
    const startedAt = navigationStartedAt();
    function deliver(result) {
        if (sent) return;
        sent = true;
        clearInterval(poller);
        if (result && result.type === "match" && result.embed) {
            // ST：WebView 保持显示供用户手动点播放；先交结果让 GM 进入等待嗅探，再跳转嵌入页。
            const embed = result.embed;
            try { GmSpiderInject.ShowWebview(); } catch (_) {}
            GmSpiderInject.SetSpiderResult(JSON.stringify({type: "match"}));
            openStEmbed(embed);
            return;
        }
        try { GmSpiderInject.HideWebview(); } catch (_) {}
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }
    function challenged() {
        return !!document.querySelector("#challenge-stage, #challenge-form, #cf-challenge-running, input[name='cf-turnstile-response']")
                || /just a moment|checking your browser|verify you are human|请稍候|验证您是否为真人/i.test(document.title || "");
    }
    function sendResult() {
        if (sent || busy) return;
        if (!spider[method]) { deliver({list: [], msg: "请求参数异常，请重试"}); return; }
        if (method === "playerContent") {
            // 直链解析走原生 HTTP，不依赖所在页面内容；仅在验证页时等待（Pages 页正常不会出现）。
            // ST 只需要一个 supjav.com 源的页面做跳转（Cloudflare 验证页同样是 supjav.com 源），不等待验证。
            const isSt = ((playerMedium().ext || {}).replace || {}).line === "ST";
            if (!isSt && challenged() && Date.now() - startedAt < 60000) {
                if (!verificationShown) { verificationShown = true; GmSpiderInject.ShowWebview(); }
                return;
            }
            busy = true;
            Promise.resolve(spider.playerContent()).then(deliver, function () {
                deliver({type: "url", ext: {url: "", header: {}}, msg: "播放地址解析失败，请换线路重试"});
            });
            return;
        }
        const waiting = Date.now() - startedAt;
        const result = spider[method].apply(spider, args);
        const hasContent = method === "homeContent" ? result.class.length > 0
                : method === "detailContent" ? !!(result.list[0] && result.list[0].vod_play_data)
                : result.list.length > 0;
        if (hasContent) { deliver(result); return; }
        if (challenged()) {
            if (!verificationShown) {
                verificationShown = true;
                challengeSeenAt = Date.now();
                GmSpiderInject.ShowWebview();
            }
            if (Date.now() - challengeSeenAt < 60000) return;
            deliver({list: [], msg: "站点验证未完成，请在页面完成验证后重试"});
            return;
        }
        if (method === "detailContent" && waiting < 12000) return;
        if ((method === "homeContent" ? !result.class.length
                : (method === "categoryContent" || method === "searchContent") && !result.list.length)
                && waiting < 25000) return;
        result.msg = method === "detailContent" && document.readyState === "complete"
                ? "没有可用线路（仅支持 EVS/VAS/FST/ST）"
                : document.readyState === "complete" ? "当前页面没有匹配内容" : "页面加载超时，请检查网络后重试";
        deliver(result);
    }

    const poller = setInterval(sendResult, 500);
    if (document.readyState === "complete") sendResult();
    else if (typeof unsafeWindow !== "undefined" && unsafeWindow.addEventListener) {
        unsafeWindow.addEventListener("load", sendResult, {once: true});
    } else sendResult();
})();
