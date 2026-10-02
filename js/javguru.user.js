// ==UserScript==
// @name         JavGuru
// @namespace    luoyuqiuspider
// @version      1.0.1
// @description  JavGuru (upload18) WebView adapter for the open-source GM spider runtime.
// @match        https://javguru.fit/*
// @match        https://upload18.org/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    const isPlayerHost = (() => {
        try { return /(^|\.)upload18\.org$/.test(new URL(location.href).hostname); }
        catch (_) { return false; }
    })();

    function pathId(href, prefix) {
        try {
            const path = new URL(href, location.href).pathname;
            const match = path.match(new RegExp("/" + prefix + "/([^/]+)"));
            return match ? decodeURIComponent(match[1]) : "";
        } catch (_) { return ""; }
    }

    function videos() {
        const list = [];
        const seen = new Set();
        document.querySelectorAll('a[href*="/video/"]').forEach(function (link) {
            const id = pathId(link.href, "video");
            if (!id || seen.has(id)) return;
            const image = link.querySelector("img");
            const name = (image && (image.getAttribute("alt") || image.getAttribute("title")) || "").trim()
                || (link.getAttribute("title") || "").trim()
                || link.textContent.trim();
            if (!name) return;
            seen.add(id);
            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: image?.src || image?.dataset.src || "",
                vod_remarks: ""
            });
        });
        return list;
    }

    function pageCount() {
        let count = 1;
        document.querySelectorAll('a[href*="page="]').forEach(function (a) {
            try {
                const m = new URL(a.href, location.href).searchParams.get("page");
                if (m && /^\d+$/.test(m)) count = Math.max(count, parseInt(m, 10));
            } catch (_) {}
        });
        return count;
    }

    const CATEGORY_NAMES = {
        "uncensored": "无码",
        "uncensored-leaked": "无码破解",
        "censored": "有码",
        "chinese": "国产",
        "amateur": "素人",
        "hentai": "Hentai"
    };

    function classes() {
        const list = [{type_id: "", type_name: "最新"}];
        const seen = new Set([""]);
        document.querySelectorAll("header a[href], nav a[href]").forEach(function (a) {
            let path = "";
            try { path = new URL(a.href, location.href).pathname.replace(/^\/+|\/+$/g, ""); } catch (_) {}
            if (!path || !CATEGORY_NAMES[path] || seen.has(path)) return;
            seen.add(path);
            list.push({type_id: path, type_name: CATEGORY_NAMES[path]});
        });
        return list;
    }

    const spider = {
        homeContent: function () { return {class: classes(), list: []}; },
        categoryContent: function (tid, pg) {
            const list = videos();
            return {list: list, pagecount: pageCount()};
        },
        searchContent: function (key, quick, pg) {
            const list = videos();
            return {list: list, pagecount: pageCount()};
        },
        detailContent: function (ids) {
            const title = document.querySelector('meta[property="og:title"]')?.content || document.title;
            const image = document.querySelector('meta[property="og:image"]')?.content || "";
            const frame = document.querySelector("iframe[src*='upload18.org/play']");
            const src = frame ? frame.src : "";
            const m = src.match(/\/play\/index\/([^\/?#]+)/);
            const slug = m ? decodeURIComponent(m[1]) : ids[0];
            return {list: [{
                vod_id: ids[0],
                vod_name: title,
                vod_pic: image,
                vod_content: title,
                vod_play_data: [{
                    from: "Upload18",
                    media: [{name: title, type: "webview", ext: {replace: {slug: slug}}}]
                }]
            }]};
        },
        playerContent: function () {
            // Primary: the server renders window.PLAYER_CONFIG.m3u8 in the
            // page HTML (https://helvid.com/m/... — no "m3u8" in the URL, so
            // pattern sniffing can't see it). Return it directly, no click needed.
            try {
                const cfg = unsafeWindow.PLAYER_CONFIG;
                if (cfg && typeof cfg.m3u8 === "string" && /^https:\/\//.test(cfg.m3u8)) {
                    return {type: "url", ext: {url: cfg.m3u8, header: {}}};
                }
            } catch (_) {}
            // Fallback: sniff mode — the auto-start timer fires the HLS request.
            return {type: "match"};
        }
    };

    // upload18.org is loaded as the top frame in playerContent mode
    // (playerContent.loadUrl points at the player, not the skin page), so the
    // userscript runs here directly. Auto-start the JW player so its HLS
    // request fires and the runtime can sniff it via playUrlMatch.
    function armPlayer() {
        if (!isPlayerHost || method !== "playerContent") return;
        let started = false;
        const start = function () {
            if (started) return;
            try {
                const jp = unsafeWindow.jwplayer;
                const p = typeof jp === "function" ? jp() : null;
                if (p && typeof p.play === "function") {
                    const item = typeof p.getPlaylistItem === "function" ? p.getPlaylistItem() : null;
                    if (!item || !(item.file || (item.sources && item.sources[0] && item.sources[0].file))) return;
                    started = true;
                    clearInterval(timer);
                    try { p.setMute(true); } catch (_) {}
                    p.play(true);
                    return;
                }
            } catch (_) {}
            try {
                const btn = document.querySelector(".jw-display-icon-display");
                if (btn) { started = true; clearInterval(timer); btn.click(); }
            } catch (_) {}
        };
        const timer = setInterval(start, 400);
        if (typeof setTimeout === "function") setTimeout(function () { clearInterval(timer); }, 30000);
        start();
    }

    function navigationStartedAt() {
        if (typeof performance !== "undefined") {
            if (Number.isFinite(performance.timeOrigin)) return performance.timeOrigin;
            if (performance.timing && Number.isFinite(performance.timing.navigationStart)) return performance.timing.navigationStart;
        }
        return Date.now();
    }

    let sent = false;
    let verificationShown = false;
    let challengeSeenAt = 0;
    const startedAt = navigationStartedAt();
    function sendResult() {
        if (sent) return;
        if (isPlayerHost) {
            // Player frame: prefer the server-rendered m3u8 (direct URL, no
            // click needed); fall back to sniffing once the player exists.
            if (method !== "playerContent") return;
            const pc = spider.playerContent();
            if (pc.type === "url" && pc.ext && pc.ext.url) {
                sent = true;
                clearInterval(poller);
                try { GmSpiderInject.HideWebview(); } catch (_) {}
                GmSpiderInject.SetSpiderResult(JSON.stringify(pc));
                return;
            }
            let ready = false;
            try { ready = !!unsafeWindow.jwplayer || !!document.querySelector("video, .jwplayer"); } catch (_) {}
            if (!ready && Date.now() - startedAt < 20000) return;
            sent = true;
            clearInterval(poller);
            try { GmSpiderInject.HideWebview(); } catch (_) {}
            GmSpiderInject.SetSpiderResult(JSON.stringify(pc));
            return;
        }
        if (!spider[method]) {
            // Defensive: unknown method must not spin forever with the WebView up.
            sent = true;
            clearInterval(poller);
            try { GmSpiderInject.HideWebview(); } catch (_) {}
            try { GmSpiderInject.SetSpiderResult(JSON.stringify({list: [], msg: "请求参数异常，请重试"})); } catch (_) {}
            return;
        }
        const challenged = document.querySelector("#challenge-stage, #challenge-form, #cf-challenge-running, input[name='cf-turnstile-response]")
                || /just a moment|checking your browser|verify you are human|请稍候|验证您是否为真人/i.test(document.title);
        const waiting = Date.now() - startedAt;
        const result = spider[method].apply(spider, args);
        const hasContent = method === "homeContent" ? result.class.length > 0
                : method === "detailContent" ? !!(result.list[0] && result.list[0].vod_play_data)
                : method === "playerContent" ? true
                : result.list.length > 0;
        if (hasContent) {
            sent = true;
            clearInterval(poller);
            GmSpiderInject.HideWebview();
            GmSpiderInject.SetSpiderResult(JSON.stringify(result));
            return;
        }
        if (challenged) {
            if (!verificationShown) {
                verificationShown = true;
                challengeSeenAt = Date.now();
                GmSpiderInject.ShowWebview();
            }
            if (Date.now() - challengeSeenAt < 60000) return;
            sent = true;
            clearInterval(poller);
            GmSpiderInject.HideWebview();
            GmSpiderInject.SetSpiderResult(JSON.stringify({list: [], msg: "站点验证未完成，请在页面完成验证后重试"}));
            return;
        }
        if (method === "detailContent" && waiting < 12000) return;
        if ((method === "homeContent" ? !result.class.length
                : (method === "categoryContent" || method === "searchContent") && !result.list.length)
                && waiting < 25000) return;
        const ready = method === "homeContent" ? result.class.length > 0
                : method === "detailContent" ? !!(result.list[0] && result.list[0].vod_play_data)
                : method === "playerContent" ? true : result.list.length > 0;
        sent = true;
        clearInterval(poller);
        GmSpiderInject.HideWebview();
        if (!ready) result.msg = document.readyState === "complete"
                ? method === "detailContent" ? "页面已加载，但未获取到播放地址" : "当前页面没有匹配内容"
                : "页面加载超时，请检查网络后重试";
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    armPlayer();
    const poller = setInterval(sendResult, 500);
    if (document.readyState === "complete") sendResult();
    else if (typeof unsafeWindow !== "undefined" && unsafeWindow.addEventListener) {
        unsafeWindow.addEventListener("load", sendResult, {once: true});
    } else sendResult();
})();
