// ==UserScript==
// @name         SupJav
// @namespace    luoyuqiuspider
// @version      1.0.0
// @description  SupJav WebView adapter for the open-source GM spider runtime. TEST ONLY - not in formal config.
// @match        https://supjav.com/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    const SITE = "https://supjav.com";

    function absUrl(href) {
        try { return new URL(href, location.href).href; }
        catch (_) { return href || ""; }
    }

    function isVideoLink(href) {
        if (!href || href.indexOf("/zh/") < 0) return false;
        const lower = href.toLowerCase();
        return lower.indexOf("/popular") < 0 && lower.indexOf("/page/") < 0
            && lower.indexOf("/category") < 0 && lower.indexOf("/tag/") < 0
            && lower.indexOf("/maker/") < 0 && lower.indexOf("/cast/") < 0
            && lower.indexOf("/genre/") < 0 && lower.indexOf("#") < 0;
    }

    function cardName(link) {
        let name = (link.textContent || "").trim();
        let card = link;
        for (let i = 0; i < 4 && card; i++, card = card.parentElement) {
            if (!name) {
                const h = card.querySelector("h2, h3, h4, h5, .title");
                if (h) name = (h.textContent || "").trim();
            }
            if (card.querySelector("img")) break;
        }
        if (!name) name = (link.getAttribute("title") || "").trim();
        return name;
    }

    function cardPic(link) {
        let card = link;
        for (let i = 0; i < 4 && card; i++, card = card.parentElement) {
            const img = card.querySelector("img");
            if (img) {
                return img.getAttribute("data-original") || img.getAttribute("data-src")
                    || img.getAttribute("src") || "";
            }
        }
        return "";
    }

    function videos() {
        const list = [];
        const seen = new Set();
        document.querySelectorAll("a[href]").forEach(function (link) {
            const href = link.getAttribute("href") || "";
            if (!isVideoLink(href)) return;
            const id = absUrl(href);
            if (seen.has(id)) return;
            const name = cardName(link);
            if (!name) return;
            seen.add(id);
            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: absUrl(cardPic(link)),
                vod_remarks: ""
            });
        });
        return list;
    }

    function pageCount() {
        let count = 1;
        document.querySelectorAll("a[href*='/page/']").forEach(function (a) {
            try {
                const m = /\/page\/(\d+)/.exec(a.getAttribute("href") || "");
                if (m) count = Math.max(count, parseInt(m[1], 10));
            } catch (_) {}
        });
        return count;
    }

    const CLASSES = [
        {type_id: "popular", type_name: "热门"},
        {type_id: "censored-jav", type_name: "有码"},
        {type_id: "uncensored-jav", type_name: "无码"},
        {type_id: "amateur", type_name: "素人"},
        {type_id: "fc2", type_name: "FC2"}
    ];

    // SupJav category pages live under /zh/{tid}/page/{pg}
    // The GM runtime loads the URL we return via homeUrl/categoryUrl in config.
    function playableLinks() {
        const eps = [];
        const seen = new Set();
        document.querySelectorAll("a[href], iframe[src]").forEach(function (el) {
            const href = el.getAttribute("href") || el.getAttribute("src") || "";
            if (!href) return;
            const lower = href.toLowerCase();
            const playable = lower.indexOf("/video/") >= 0 || lower.indexOf("/play/") >= 0
                || lower.indexOf(".m3u8") >= 0 || lower.indexOf(".mp4") >= 0
                || (lower.indexOf("/zh/") >= 0 && lower.indexOf("/page/") < 0
                    && lower.indexOf("/popular") < 0);
            if (!playable) return;
            const url = absUrl(href);
            if (seen.has(url)) return;
            seen.add(url);
            const name = (el.textContent || "").trim() || "播放";
            eps.push(name + "$" + url);
        });
        return eps;
    }

    const spider = {
        homeContent: function () { return {class: CLASSES, list: []}; },
        categoryContent: function (tid, pg) {
            const list = videos();
            return {list: list, pagecount: pageCount()};
        },
        searchContent: function (key, quick, pg) {
            const list = videos();
            return {list: list, pagecount: pageCount()};
        },
        detailContent: function (ids) {
            const title = document.querySelector('meta[property="og:title"]')?.content
                || document.querySelector("h1, h2, .title")?.textContent?.trim()
                || document.title;
            const image = document.querySelector('meta[property="og:image"]')?.content || "";
            let eps = playableLinks();
            if (!eps.length) eps = [ids[0]];
            return {list: [{
                vod_id: ids[0],
                vod_name: title,
                vod_pic: absUrl(image),
                vod_content: (document.querySelector('meta[name="description"]')?.content || "").trim(),
                vod_play_data: [{
                    from: "SupJav",
                    media: eps.map(function (e) {
                        const parts = e.split("$");
                        return {name: parts[0] || "播放", type: "webview", ext: {url: parts[1] || e}};
                    })
                }]
            }]};
        },
        // Sniff the WebView's own network requests for the media URL.
        // NBD-022 note: FST线路曾出现"播放地址加载失败"，此为测试版，未做针对性修复。
        playerContent: function () { return {type: "match"}; }
    };

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
        if (!spider[method]) {
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

    const poller = setInterval(sendResult, 500);
    if (document.readyState === "complete") sendResult();
    else if (typeof unsafeWindow !== "undefined" && unsafeWindow.addEventListener) {
        unsafeWindow.addEventListener("load", sendResult, {once: true});
    } else sendResult();
})();
