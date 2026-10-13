// ==UserScript==
// @name         SupJav
// @namespace    luoyuqiuspider
// @version      2.1.0
// @description  SupJav WebView adapter for the open-source GM spider runtime. TEST ONLY - not in formal config.
// @match        https://supjav.com/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    // 线路：只收 EVS / FST（已验证 p,a,c,k,e,d → hls4）；ST/VOE 用户已取消；VAS/LUC 未验证，默认不收。
    const LINES = ["EVS", "FST"];
    const LK1 = "https://lk1.supremejav.com/";
    const EMBED_HOSTS = /^https:\/\/(evsishere\.xyz|fc2stream\.tv)\//;

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

    function gmGet(url, referer) {
        return new Promise(function (resolve) {
            if (typeof GM_xmlhttpRequest !== "function") { resolve(null); return; }
            let settled = false;
            const finish = function (r) { if (!settled) { settled = true; resolve(r); } };
            try {
                GM_xmlhttpRequest({
                    method: "GET", url: url, timeout: 15000,
                    headers: {"Referer": referer, "User-Agent": navigator.userAgent},
                    onload: function (r) { finish(r && r.status === 200 ? r : null); },
                    onerror: function () { finish(null); },
                    ontimeout: function () { finish(null); }
                });
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

    // 兜底：GM_xmlhttpRequest 不可用/失败时，点详情页对应按钮，让站点自己插 iframe，交给 playUrlMatch 嗅探。
    function clickServer(line, cd) {
        const groups = document.querySelectorAll(".cd-server");
        const group = groups[Math.max(0, (parseInt(cd, 10) || 1) - 1)] || document;
        const btns = group.querySelectorAll ? group.querySelectorAll("a.btn-server[data-link]") : [];
        for (const b of btns) {
            if ((b.textContent || "").trim().toUpperCase() === line) { try { b.click(); } catch (_) {} return true; }
        }
        return false;
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
                    (byLine[line] = byLine[line] || []).push({
                        name: groups.length > 1 ? "CD" + (i + 1) : "播放",
                        type: "webview",
                        ext: {replace: {page: page, c: reverse(link), line: line, cd: String(i + 1)}}
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
            const direct = await resolveDirect(rep.c);
            if (direct) return direct;
            if (clickServer(String(rep.line || ""), rep.cd)) return {type: "match"};
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

    let sent = false;
    let busy = false;
    let verificationShown = false;
    let challengeSeenAt = 0;
    const startedAt = navigationStartedAt();
    function deliver(result) {
        if (sent) return;
        sent = true;
        clearInterval(poller);
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
            // 直链解析走原生 HTTP，不依赖 supjav 页面内容；仅在验证页时等待。
            if (challenged() && Date.now() - startedAt < 60000) {
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
                ? "没有可用线路（仅支持 EVS/FST）"
                : document.readyState === "complete" ? "当前页面没有匹配内容" : "页面加载超时，请检查网络后重试";
        deliver(result);
    }

    const poller = setInterval(sendResult, 500);
    if (document.readyState === "complete") sendResult();
    else if (typeof unsafeWindow !== "undefined" && unsafeWindow.addEventListener) {
        unsafeWindow.addEventListener("load", sendResult, {once: true});
    } else sendResult();
})();
