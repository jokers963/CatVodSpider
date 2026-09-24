// ==UserScript==
// @name         SupJav subtitle preview
// @namespace    luoyuqiuspider
// @version      1.0.3
// @description  Preview adapter without jQuery. Shows the verification page and returns as soon as content is parseable.
// @match        https://supjav.com/*
// @grant        GM_cookie
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const cfCookie = {value: null};
    const startedAt = Date.now();
    const VERIFY_REPORT_MS = 90000;

    function text(el) {
        return (el && (el.textContent || "")).trim();
    }

    function attr(el, name) {
        return el ? (el.getAttribute(name) || "") : "";
    }

    function qs(sel, root) {
        return (root || document).querySelector(sel);
    }

    function qsa(sel, root) {
        return Array.from((root || document).querySelectorAll(sel));
    }

    function imageUrl(url) {
        if (!url) return "";
        if (cfCookie.value) return url + "@User-Agent=" + navigator.userAgent + "@Cookie=cf_clearance=" + cfCookie.value;
        if (typeof GM_cookie !== "undefined") {
            GM_cookie.list({name: "cf_clearance"}, function (cookies, error) {
                if (!error && cookies.length) cfCookie.value = cookies[0].value;
            });
        }
        return url;
    }

    function pageCount() {
        const pages = qsa(".pagination li").filter(function (li) {
            return !li.classList.contains("next-page");
        });
        const last = pages.length ? text(pages[pages.length - 1]) : "1";
        return parseInt(last || "1", 10);
    }

    function videos() {
        return qsa(".post").map(function (post) {
            const link = qs(".img", post);
            const href = attr(link, "href");
            if (!href) return null;
            const img = qs("img", post);
            return {
                vod_id: new URL(href, location.href).pathname.split("/")[2],
                vod_name: attr(link, "title") || text(link),
                vod_pic: imageUrl(attr(img, "data-original") || attr(img, "src")),
                vod_remarks: text(qs(".date", post)),
                vod_year: text(qs(".meta", post))
            };
        }).filter(Boolean);
    }

    function challengeVisible() {
        return !!qs(".loading-verifying, #challenge-stage, #challenge-form, #cf-challenge-running, input[name='cf-turnstile-response']")
                || /just a moment|checking your browser|verify you are human|请稍候|验证您是否为真人/i.test(document.title);
    }

    function serverButtons() {
        const group = qs(".video-wrap .cd-server");
        return group ? qsa(".btn-server", group) : qsa(".video-wrap .btn-server");
    }

    function categories() {
        return [
            {type_id: "popular", type_name: "热门"},
            {type_id: "category/censored-jav", type_name: "有码"},
            {type_id: "category/uncensored-jav", type_name: "无码"},
            {type_id: "category/amateur", type_name: "素人"},
            {type_id: "category/chinese-subtitles", type_name: "中文字幕"},
            {type_id: "category/reducing-mosaic", type_name: "无码破解"},
            {type_id: "category/english-subtitles", type_name: "英文字幕"}
        ];
    }

    function verificationResult() {
        if (method === "homeContent") {
            return {
                class: categories(),
                list: [],
                msg: "页面需要验证，请在网页中完成后再重试"
            };
        }
        if (method === "detailContent") {
            return {
                list: [{
                    vod_id: args[0] || "",
                    vod_name: "需要验证",
                    vod_content: "页面需要验证，请在网页中完成后再打开详情",
                    vod_play_data: []
                }],
                msg: "页面需要验证，请在网页中完成后再重试"
            };
        }
        return {
            list: [],
            pagecount: 1,
            msg: "页面需要验证，请在网页中完成后再重试"
        };
    }

    const spider = {
        homeContent: function () {
            return {class: categories(), list: videos()};
        },
        categoryContent: function () {
            return {list: videos(), pagecount: pageCount()};
        },
        searchContent: function () {
            return {list: videos(), pagecount: pageCount()};
        },
        detailContent: function (ids) {
            const vserver = qs("#vserver");
            if (vserver) vserver.dispatchEvent(new Event("click"));
            const image = qs(".post-meta .img");
            const name = attr(image, "alt") || document.title;
            const media = serverButtons().map(function (button, i) {
                return {
                    from: text(button) || "播放",
                    media: [{name: name, type: "webview", ext: {replace: {pathname: ids[0], link: i}}}]
                };
            });
            return {list: [{
                vod_id: ids[0],
                vod_name: name,
                vod_pic: imageUrl(attr(image, "src")),
                vod_content: name,
                vod_play_data: media
            }]};
        },
        playerContent: function () {
            const index = parseInt(location.hash.substring(1) || "0", 10);
            const button = serverButtons()[index];
            if (button) button.dispatchEvent(new Event("click"));
            return {type: "match"};
        }
    };

    let sent = false;
    let clicked = false;
    let sawChallenge = false;

    function logTiming(phase) {
        try {
            console.log("[supjav-preview]", method, phase, Date.now() - startedAt, "ms", sawChallenge ? "after-verify" : "normal");
        } catch (e) {}
    }

    function finish(result, hide) {
        if (sent || typeof GmSpiderInject === "undefined") return;
        sent = true;
        clearInterval(poller);
        logTiming(hide ? "done-hide" : "done-keep");
        if (hide) GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    function contentReady(result) {
        if (method === "homeContent" || method === "categoryContent" || method === "searchContent") {
            return result.list && result.list.length > 0;
        }
        if (method === "detailContent") {
            return result.list && result.list[0] && result.list[0].vod_play_data && result.list[0].vod_play_data.length > 0;
        }
        return false;
    }

    function sendResult() {
        if (sent || typeof GmSpiderInject === "undefined") return;

        if (challengeVisible()) {
            sawChallenge = true;
            GmSpiderInject.ShowWebview();
            if (Date.now() - startedAt >= VERIFY_REPORT_MS) {
                finish(verificationResult(), false);
            }
            return;
        }

        if (method === "playerContent") {
            if (!clicked) {
                if (!serverButtons().length) return;
                spider.playerContent();
                clicked = true;
                logTiming("player-click");
            }
            finish({type: "match"}, false);
            return;
        }

        const result = spider[method].apply(spider, args);
        if (contentReady(result)) {
            finish(result, true);
            return;
        }
        if (Date.now() - startedAt < 20000) return;
        finish(result, true);
    }

    const poller = setInterval(sendResult, 400);
    if (challengeVisible()) {
        sawChallenge = true;
        if (typeof GmSpiderInject !== "undefined") GmSpiderInject.ShowWebview();
    }
    if (document.readyState === "complete") setTimeout(sendResult, 0);
    else unsafeWindow.addEventListener("load", sendResult, {once: true});
})();
