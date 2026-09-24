// ==UserScript==
// @name         SupJav subtitle preview
// @namespace    luoyuqiuspider
// @version      1.0.2
// @description  Preview adapter. Playback waits for the server request before returning a match.
// @match        https://supjav.com/*
// @require      https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.slim.min.js
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

    function imageUrl(url) {
        if (!url) return "";
        if (cfCookie.value) return url + "@User-Agent=" + navigator.userAgent + "@Cookie=cf_clearance=" + cfCookie.value;
        GM_cookie.list({name: "cf_clearance"}, function (cookies, error) {
            if (!error && cookies.length) cfCookie.value = cookies[0].value;
        });
        return url;
    }

    function pageCount() {
        const last = $(".pagination li").not(".next-page").last().text().trim();
        return parseInt(last || "1", 10);
    }

    function videos() {
        const list = [];
        $(".post").each(function () {
            const link = $(this).find(".img").first();
            const href = link.attr("href");
            if (!href) return;
            list.push({
                vod_id: new URL(href).pathname.split("/")[2],
                vod_name: link.attr("title") || link.text().trim(),
                vod_pic: imageUrl($(this).find("img").first().data("original") || $(this).find("img").first().attr("src")),
                vod_remarks: $(this).find(".date").text().trim(),
                vod_year: $(this).find(".meta").text().trim()
            });
        });
        return list;
    }

    function challengeVisible() {
        return !!document.querySelector(".loading-verifying, #challenge-stage, #challenge-form, #cf-challenge-running")
                || /just a moment|checking your browser|verify you are human|请稍候|验证您是否为真人/i.test(document.title);
    }

    const spider = {
        homeContent: function () {
            return {
                class: [
                    {type_id: "popular", type_name: "热门"},
                    {type_id: "category/censored-jav", type_name: "有码"},
                    {type_id: "category/uncensored-jav", type_name: "无码"},
                    {type_id: "category/amateur", type_name: "素人"},
                    {type_id: "category/chinese-subtitles", type_name: "中文字幕"},
                    {type_id: "category/reducing-mosaic", type_name: "无码破解"},
                    {type_id: "category/english-subtitles", type_name: "英文字幕"}
                ],
                list: videos()
            };
        },
        categoryContent: function (tid, pg) {
            return {list: videos(), pagecount: pageCount()};
        },
        searchContent: function () {
            return {list: videos(), pagecount: pageCount()};
        },
        detailContent: function (ids) {
            $("#vserver").first().trigger("click");
            const image = $(".post-meta .img").first();
            const name = image.attr("alt") || document.title;
            const media = [];
            const buttons = $(".video-wrap .cd-server").length
                    ? $(".video-wrap .cd-server:first .btn-server")
                    : $(".video-wrap .btn-server");
            buttons.each(function (i) {
                media.push({
                    from: $(this).text().trim() || "播放",
                    media: [{name: name, type: "webview", ext: {replace: {pathname: ids[0], link: i}}}]
                });
            });
            return {list: [{
                vod_id: ids[0],
                vod_name: name,
                vod_pic: imageUrl(image.attr("src")),
                vod_content: name,
                vod_play_data: media
            }]};
        },
        playerContent: function () {
            const index = parseInt(window.location.hash.substring(1) || "0", 10);
            const group = document.querySelector(".video-wrap .cd-server");
            const buttons = group ? group.querySelectorAll(".btn-server") : document.querySelectorAll(".video-wrap .btn-server");
            const button = buttons[index];
            if (button) button.dispatchEvent(new Event("click"));
            return {type: "match"};
        }
    };

    let sent = false;
    let clickedAt = 0;

    function finish(result, hide) {
        if (sent) return;
        sent = true;
        clearInterval(poller);
        if (hide) GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    function sendResult() {
        if (sent || typeof GmSpiderInject === "undefined") return;
        if (method === "playerContent") {
            if (challengeVisible()) {
                GmSpiderInject.ShowWebview();
                if (Date.now() - startedAt < 20000) return;
                finish(spider.playerContent(), false);
                return;
            }
            if (!clickedAt) {
                const before = document.querySelectorAll(".video-wrap .btn-server").length;
                spider.playerContent();
                if (before) clickedAt = Date.now();
                if (Date.now() - startedAt < 15000) return;
            } else if (Date.now() - clickedAt < 8000) {
                return;
            }
            finish({type: "match"}, false);
            return;
        }
        const result = spider[method].apply(spider, args);
        const waitingForList = (method === "homeContent" || method === "categoryContent" || method === "searchContent")
                && !result.list.length && Date.now() - startedAt < 15000;
        const waitingForLines = method === "detailContent" && !result.list[0].vod_play_data.length && Date.now() - startedAt < 15000;
        if (challengeVisible() || waitingForList || waitingForLines) {
            if (challengeVisible()) GmSpiderInject.ShowWebview();
            if (Date.now() - startedAt < 20000) return;
        }
        finish(result, true);
    }

    const poller = setInterval(sendResult, 500);
    $(document).ready(function () {
        if ($(".loading-verifying").length) GmSpiderInject.ShowWebview();
        if (document.readyState === "complete") setTimeout(sendResult, 0);
    });
    $(unsafeWindow).on("load", sendResult);
})();
