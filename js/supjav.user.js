// ==UserScript==
// @name         SupJav
// @namespace    luoyuqiuspider
// @version      1.0.1
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
            $(".video-wrap .btn-server").each(function (i) {
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
            $(".video-wrap .btn-server").eq(index).trigger("click");
            return {type: "match"};
        }
    };

    let sent = false;
    function sendResult() {
        if (sent) return;
        sent = true;
        const result = spider[method].apply(spider, args);
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    $(document).ready(function () {
        if ($(".loading-verifying").length) GmSpiderInject.ShowWebview();
        if (document.readyState === "complete") setTimeout(sendResult, 0);
    });
    $(unsafeWindow).on("load", sendResult);
})();
