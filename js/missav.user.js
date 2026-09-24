// ==UserScript==
// @name         MissAV
// @namespace    luoyuqiuspider
// @version      1.2.2
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
        {type_id: "chinese-subtitle", type_name: "中文字幕"},
        {type_id: "new", type_name: "觀看日本 AV"},
        {type_id: "makers?group=amateur", type_name: "素人"},
        {type_id: "makers?group=uncensored", type_name: "無碼影片"},
        {type_id: "makers?group=asian", type_name: "亞洲 AV"}
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

    function groupFolders(groupName) {
        const list = [];
        document.querySelectorAll("nav.hidden .relative").forEach(function (group) {
            const heading = group.querySelector("a.group span");
                if (!groupName.includes(heading?.textContent.trim())) return;
            group.querySelectorAll(".py-1 a[href]").forEach(function (link) {
                const match = new URL(link.href, location.href).pathname.match(/\/cn\/(.+)$/);
                if (!match) return;
                list.push({
                    vod_id: decodeURIComponent(match[1]),
                    vod_name: link.textContent.trim(),
                    vod_tag: "folder",
                    style: {type: "rect", ratio: 2}
                });
            });
        });
        return list;
    }

    const spider = {
        homeContent: function () { return {class: classes, list: videos()}; },
        categoryContent: function (tid) {
            const groupName = {
                amateur: ["素人"],
                uncensored: ["无码影片", "無碼影片"],
                asian: ["亚洲 AV", "亞洲 AV"]
            }[new URLSearchParams(tid.split("?")[1] || "").get("group")];
            return groupName
                    ? {list: groupFolders(groupName), pagecount: 1}
                    : {list: videos(), pagecount: pageCount()};
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
                vod_play_from: playUrl ? [ids[0], title].filter(Boolean).join(" ") : "MissAV",
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
