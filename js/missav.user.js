// ==UserScript==
// @name         MissAV
// @namespace    luoyuqiuspider
// @version      1.1.0
// @description  MissAV WebView adapter for the open-source GM spider runtime.
// @match        https://missav.ws/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    const classes = [
        {type_id: "new", type_name: "最近更新"},
        {type_id: "madou", type_name: "麻豆传媒"},
        {type_id: "chinese-subtitle", type_name: "中文字幕"},
        {type_id: "uncensored-leak", type_name: "无码流出"},
        {type_id: "actresses/ranking", type_name: "女优排行"},
        {type_id: "makers", type_name: "发行商"},
        {type_id: "genres", type_name: "类型"}
    ];

    function pageCount() {
        const text = document.querySelector("#price-currency")?.textContent || "";
        const pages = Number(text.replace(/[^0-9]/g, ""));
        return pages || 1;
    }

    function videos() {
        const list = [];
        document.querySelectorAll(".gap-5 .thumbnail").forEach(function (card) {
            const title = card.querySelector(".text-secondary");
            const link = title?.closest("a") || card.querySelector('a[href*="/cn/"]');
            if (!link) return;
            let id = title?.getAttribute("alt") || "";
            if (!id) {
                const match = new URL(link.href, location.href).pathname.match(/\/cn\/([^/]+)/);
                id = match ? decodeURIComponent(match[1]) : "";
            }
            if (!id) return;
            const image = card.querySelector("img");
            list.push({
                vod_id: id,
                vod_name: title?.textContent.trim() || image?.alt || id,
                vod_pic: image?.dataset.src || image?.dataset.lazySrc || image?.src || "",
                vod_year: card.querySelector(".absolute")?.textContent.trim() || "",
                vod_remarks: card.querySelector(".left-1")?.textContent.trim() || ""
            });
        });
        return list;
    }

    function folders() {
        const list = [];
        document.querySelectorAll(".gap-4 .text-nord13[href]").forEach(function (link) {
            const match = new URL(link.href, location.href).pathname.match(/\/cn\/(.+)$/);
            if (!match) return;
            list.push({
                vod_id: decodeURIComponent(match[1]),
                vod_name: link.textContent.trim(),
                vod_tag: "folder",
                style: {type: "rect", ratio: 2}
            });
        });
        return list;
    }

    const spider = {
        homeContent: function () { return {class: classes, list: videos()}; },
        categoryContent: function (tid) {
            const folderPage = ["actresses/ranking", "makers", "genres"].includes(tid);
            return {list: folderPage ? folders() : videos(), pagecount: pageCount()};
        },
        searchContent: function () { return {list: videos(), pagecount: pageCount()}; },
        detailContent: function (ids) {
            const title = document.querySelector('meta[property="og:title"]')?.content || document.title;
            const image = document.querySelector('meta[property="og:image"]')?.content || "";
            let playUrl = "";
            try { playUrl = unsafeWindow.hls?.url || ""; } catch (_) {}
            if (!/^https:\/\//i.test(playUrl)) playUrl = "";
            return {list: [{
                vod_id: ids[0],
                vod_name: title,
                vod_pic: image,
                vod_content: title,
                vod_play_from: "MissAV",
                vod_play_url: playUrl ? "播放$" + playUrl : ""
            }]};
        }
    };

    let sent = false;
    let poller = null;
    function sendResult() {
        if (sent || !spider[method]) return;
        if (method === "detailContent") {
            let playUrl = "";
            try { playUrl = unsafeWindow.hls?.url || ""; } catch (_) {}
            if (!playUrl && Date.now() - startedAt < 12000) return;
        }
        sent = true;
        if (poller) clearInterval(poller);
        const result = spider[method].apply(spider, args);
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }
    const startedAt = Date.now();
    if (document.readyState === "complete") setTimeout(sendResult, 0);
    else unsafeWindow.addEventListener("load", sendResult, {once: true});
    if (method === "detailContent") poller = setInterval(sendResult, 250);
})();
