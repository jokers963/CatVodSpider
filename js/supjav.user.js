// ==UserScript==
// @name         SupJav
// @namespace    luoyuqiuspider
// @version      2.0.0
// @description  SupJav WebView adapter for the open-source GM spider runtime. TEST ONLY - not in formal config.
// @match        https://supjav.com/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    function absUrl(href) {
        try { return new URL(href, location.href).href; }
        catch (_) { return href || ""; }
    }

    // Video URLs look like https://supjav.com/462685.html
    function isVideoLink(href) {
        return /supjav\.com\/\d+\.html(\?|#|$)/.test(href || "");
    }

    function videos() {
        const list = [];
        const seen = new Set();
        // Cards are div.post > a.img (title attr) + img.thumb, div.con > h3 > a (text)
        document.querySelectorAll("div.post").forEach(function (post) {
            const link = post.querySelector("a.img[href], h3 a[href]");
            if (!link) return;
            const href = link.getAttribute("href") || "";
            if (!isVideoLink(href)) return;
            const id = absUrl(href);
            if (seen.has(id)) return;
            const name = (link.getAttribute("title") || "").trim()
                || (post.querySelector("h3 a")?.textContent || "").trim()
                || (link.textContent || "").trim();
            if (!name) return;
            seen.add(id);
            const img = post.querySelector("img.thumb, img");
            const picRaw = img ? (img.getAttribute("src") || img.getAttribute("data-src")
                || img.getAttribute("data-original") || img.getAttribute("data-lazy-src") || "") : "";
            // 去掉懒加载占位图（1px gif / base64）
            const pic = /base64|1x1|placeholder|loading/i.test(picRaw) ? "" : picRaw;
            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: absUrl(pic),
                vod_remarks: (post.querySelector(".meta")?.textContent || "").trim()
            });
        });
        // Fallback: any bare video link on the page
        if (!list.length) {
            document.querySelectorAll("a[href]").forEach(function (link) {
                const href = link.getAttribute("href") || "";
                if (!isVideoLink(href)) return;
                const id = absUrl(href);
                if (seen.has(id)) return;
                const name = (link.getAttribute("title") || "").trim() || (link.textContent || "").trim();
                if (!name) return;
                seen.add(id);
                const img = link.querySelector("img");
                list.push({
                    vod_id: id,
                    vod_name: name,
                    vod_pic: absUrl(img ? (img.getAttribute("src") || "") : ""),
                    vod_remarks: ""
                });
            });
        }
        return list;
    }

    function pageCount() {
        let count = 1;
        // WordPress style: /page/2/
        document.querySelectorAll("a[href]").forEach(function (a) {
            try {
                const m = /\/page\/(\d+)\/?(\?|#|$)/.exec(a.getAttribute("href") || "");
                if (m) count = Math.max(count, parseInt(m[1], 10));
            } catch (_) {}
        });
        return count;
    }

    const CLASSES = [
        {type_id: "censored-jav", type_name: "有码"},
        {type_id: "uncensored-jav", type_name: "无码"},
        {type_id: "amateur", type_name: "素人"},
        {type_id: "chinese-subtitles", type_name: "中字"},
        {type_id: "reducing-mosaic", type_name: "去码"},
        {type_id: "english-subtitles", type_name: "英字"}
    ];

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
                || document.querySelector("h1")?.textContent?.trim()
                || document.title;
            const image = document.querySelector('meta[property="og:image"]')?.content || "";
            // Player links: look for iframes or player tab links
            const eps = [];
            const seen = new Set();
            document.querySelectorAll("iframe[src], a[href]").forEach(function (el) {
                const href = el.getAttribute("src") || el.getAttribute("href") || "";
                if (!href) return;
                const lower = href.toLowerCase();
                // Player iframes or tabs (FST/ST/etc.)
                if (el.tagName === "IFRAME" && /embed|play|video/i.test(href)) {
                    const url = absUrl(href);
                    if (!seen.has(url)) { seen.add(url); eps.push("播放$" + url); }
                }
            });
            if (!eps.length) eps.push("播放$" + ids[0]);
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
        sent = true;
        clearInterval(poller);
        GmSpiderInject.HideWebview();
        result.msg = document.readyState === "complete" ? "当前页面没有匹配内容" : "页面加载超时，请检查网络后重试";
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    const poller = setInterval(sendResult, 500);
    if (document.readyState === "complete") sendResult();
    else if (typeof unsafeWindow !== "undefined" && unsafeWindow.addEventListener) {
        unsafeWindow.addEventListener("load", sendResult, {once: true});
    } else sendResult();
})();
