// ==UserScript==
// @name         MissAV
// @namespace    luoyuqiuspider
// @version      1.0.0
// @description  Public-page adapter for the open-source GM spider runtime.
// @match        https://missav.ws/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    function videos() {
        const result = [];
        const seen = new Set();
        document.querySelectorAll("a[href]").forEach(function (link) {
            let url;
            try { url = new URL(link.href); } catch (_) { return; }
            if (url.hostname !== "missav.ws" || !/^\/[a-z0-9-]*\d+[a-z0-9-]*\/?$/i.test(url.pathname)) return;
            const id = url.pathname.replace(/^\/+|\/+$/g, "");
            if (!id || seen.has(id)) return;
            const card = link.closest("article, li, .thumbnail, .group, .relative") || link.parentElement;
            const image = (card && card.querySelector("img")) || link.querySelector("img");
            const name = link.getAttribute("title") || (image && image.getAttribute("alt")) || link.innerText.trim();
            if (!name) return;
            seen.add(id);
            result.push({
                vod_id: id,
                vod_name: name,
                vod_pic: image ? (image.dataset.src || image.dataset.lazySrc || image.src) : "",
                vod_remarks: card ? card.innerText.trim().split("\n")[0] : ""
            });
        });
        return result;
    }

    function pageCount() {
        let count = 1;
        document.querySelectorAll("a[href]").forEach(function (link) {
            const match = new URL(link.href).searchParams.get("page");
            if (match && /^\d+$/.test(match)) count = Math.max(count, Number(match));
        });
        return count;
    }

    const spider = {
        homeContent: function () {
            return {
                class: [
                    {type_id: "dm635/release", type_name: "新作"},
                    {type_id: "dm278/chinese-subtitle", type_name: "中文字幕"}
                ],
                list: videos()
            };
        },
        categoryContent: function () { return {list: videos(), pagecount: pageCount()}; },
        searchContent: function () { return {list: videos(), pagecount: pageCount()}; },
        detailContent: function (ids) {
            const title = document.querySelector('meta[property="og:title"]')?.content || document.title;
            const image = document.querySelector('meta[property="og:image"]')?.content || "";
            return {list: [{
                vod_id: ids[0],
                vod_name: title,
                vod_pic: image,
                vod_content: title,
                vod_play_data: [{
                    from: "MissAV",
                    media: [{name: "播放", type: "webview", ext: {replace: {pathname: ids[0]}}}]
                }]
            }]};
        },
        playerContent: function () {
            return {type: "match"};
        }
    };

    let sent = false;
    function sendResult() {
        if (sent || !spider[method]) return;
        sent = true;
        const result = spider[method].apply(spider, args);
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    if (document.readyState === "complete") setTimeout(sendResult, 0);
    else unsafeWindow.addEventListener("load", sendResult, {once: true});
})();
