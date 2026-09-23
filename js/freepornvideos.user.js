// ==UserScript==
// @name         FreePornVideos
// @namespace    luoyuqiuspider
// @version      1.0.0
// @match        https://freepornvideos.xxx/*
// @match        https://*.freepornvideos.xxx/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    function videos() {
        const seen = new Set();
        const list = [];
        document.querySelectorAll(".list-videos .item").forEach(function (card) {
            const link = card.querySelector('a[href*="/videos/"]');
            if (!link) return;
            const path = new URL(link.href, location.href).pathname.match(/^\/videos\/(\d+\/[^/]+)\/?$/);
            if (!path || seen.has(path[1])) return;
            const image = card.querySelector("img[data-src], img[src]");
            const name = link.getAttribute("title") || image?.alt || "";
            if (!name) return;
            seen.add(path[1]);
            list.push({
                vod_id: path[1],
                vod_name: name,
                vod_pic: image?.dataset.src || image?.src || "",
                vod_remarks: card.querySelector(".duration")?.textContent.trim() || ""
            });
        });
        return list;
    }

    function classes() {
        const list = [
            {type_id: "latest-updates", type_name: "最新"},
            {type_id: "top-rated", type_name: "高评分"},
            {type_id: "most-popular", type_name: "热门"}
        ];
        document.querySelectorAll('.sidebar > ul.list a[href*="/categories/"]').forEach(function (link) {
            const id = new URL(link.href, location.href).pathname.match(/^\/categories\/([^/]+)\/?$/)?.[1];
            if (id && list.length < 13) list.push({type_id: "categories/" + id, type_name: link.textContent.trim()});
        });
        return list;
    }

    function pageCount() {
        let count = 1;
        document.querySelectorAll(".pagination a[href]").forEach(function (link) {
            const page = new URL(link.href, location.href).pathname.match(/\/(\d+)\/$/)?.[1];
            if (page) count = Math.max(count, Number(page));
        });
        return count;
    }

    function detail(ids) {
        const sources = [...document.querySelectorAll('video source[type="video/mp4"][src]')]
                .sort((a, b) => Number(b.hasAttribute("selected")) - Number(a.hasAttribute("selected")));
        const lines = sources.map(function (source) {
            return {name: source.getAttribute("label") || "MP4", url: new URL(source.src, location.href).href};
        }).filter(line => line.url.startsWith("https://"));
        const title = document.querySelector('meta[property="og:title"]')?.content || document.title;
        return {list: [{
            vod_id: ids[0],
            vod_name: title,
            vod_pic: document.querySelector('meta[property="og:image"]')?.content || "",
            vod_content: title,
            vod_play_from: lines.map(line => line.name).join("$$$"),
            vod_play_url: lines.map(line => "播放$" + line.url).join("$$$")
        }]};
    }

    const spider = {
        homeContent: () => ({class: classes(), list: videos()}),
        categoryContent: () => ({list: videos(), pagecount: pageCount()}),
        searchContent: () => ({list: videos(), pagecount: pageCount()}),
        detailContent: detail
    };
    let sent = false;
    const startedAt = Date.now();
    const poller = setInterval(sendResult, 300);
    function sendResult() {
        if (sent || !spider[method]) return;
        const result = spider[method].apply(spider, args);
        const ready = method === "detailContent" ? result.list[0].vod_play_url : result.list.length;
        if (!ready && Date.now() - startedAt < 15000) return;
        sent = true;
        clearInterval(poller);
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }
    sendResult();
})();
