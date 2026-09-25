// ==UserScript==
// @name         SupJav
// @namespace    luoyuqiuspider
// @version      1.0.5
// @description  SupJav WebView adapter for the open-source GM spider runtime.
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
            const index = parseInt((window.location.hash || "#0").substring(1), 10) || 0;
            const group = document.querySelector(".video-wrap .cd-server");
            const buttons = group ? group.querySelectorAll(".btn-server") : document.querySelectorAll(".video-wrap .btn-server");
            const button = buttons[index];
            if (button) button.click();
            return {type: "match"};
        }
    };

    function cloudflareChallenge() {
        return /just a moment|请稍候|請稍候/i.test(document.title)
                || !!document.querySelector("#challenge-form, #challenge-running, .cf-turnstile")
                || typeof unsafeWindow._cf_chl_opt !== "undefined";
    }

    function pageReady() {
        if (method === "playerContent" || method === "detailContent") {
            return !!document.querySelector(".video-wrap .btn-server, .post-meta .img");
        }
        return !!document.querySelector(".post");
    }

    let sent = false;
    const startedAt = Date.now();
    function sendResult() {
        if (sent) return;
        const ready = pageReady();
        if ((cloudflareChallenge() || document.querySelector(".loading-verifying")) && !ready) return;
        if (!ready && Date.now() - startedAt < 35000) return;
        sent = true;
        if (poller) clearInterval(poller);
        const result = spider[method].apply(spider, args);
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    const poller = setInterval(sendResult, 400);
    GmSpiderInject.HideWebview();
    $(document).ready(sendResult);
    $(unsafeWindow).on("load", sendResult);
})();
