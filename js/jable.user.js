// ==UserScript==
// @name         Jable
// @namespace    luoyuqiuspider
// @version      1.0.5
// @description  Jable WebView adapter for the open-source GM spider runtime.
// @match        https://jable.tv/*
// @match        https://*.jable.tv/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    function pathId(href, prefix) {
        try {
            const path = new URL(href, location.href).pathname;
            const match = path.match(new RegExp("/" + prefix + "/([^/]+)"));
            return match ? decodeURIComponent(match[1]) : "";
        } catch (_) { return ""; }
    }

    function videos() {
        const list = [];
        const seen = new Set();
        document.querySelectorAll('a[href*="/videos/"]').forEach(function (link) {
            const id = pathId(link.href, "videos");
            if (!id || seen.has(id)) return;
            const card = link.closest(".video-img-box") || link.closest("article, li") || link.parentElement;
            const image = (card && card.querySelector("img")) || link.querySelector("img");
            const title = (card && card.querySelector(".detail h6, h6, [title]")) || image;
            const name = title?.getAttribute("title") || title?.getAttribute("alt") || title?.textContent.trim() || "";
            if (!name) return;
            seen.add(id);
            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: image?.dataset.src || image?.dataset.lazySrc || image?.src || "",
                vod_remarks: (card && card.querySelector(".detail p, .inactive-color"))?.textContent.trim() || ""
            });
        });
        return list;
    }

    function classes() {
        const list = [];
        const seen = new Set();
        document.querySelectorAll("div.img-box > a, div.horizontal-img-box > a").forEach(function (link) {
            const id = pathId(link.href, "categories");
            const name = link.querySelector(".absolute-center h4, .detail h6.title")?.textContent.trim() || "";
            if (!id || !name || seen.has(id)) return;
            seen.add(id);
            list.push({type_id: id, type_name: name});
        });
        return list;
    }

    function pageCount() {
        let count = 1;
        document.querySelectorAll(".pagination a[href], a[href*='page=']").forEach(function (link) {
            const match = new URL(link.href, location.href).searchParams.get("page");
            if (match && /^\d+$/.test(match)) count = Math.max(count, Number(match));
        });
        return count;
    }

    const spider = {
        homeContent: function () { return {class: classes(), list: videos()}; },
        categoryContent: function () { return {list: videos(), pagecount: pageCount()}; },
        searchContent: function () { return {list: videos(), pagecount: pageCount()}; },
        detailContent: function (ids) {
            const title = document.querySelector('meta[property="og:title"]')?.content || document.title;
            const image = document.querySelector('meta[property="og:image"]')?.content || "";
            const playUrl = unsafeWindow.hlsUrl || [...document.querySelectorAll('script:not([src])')]
                    .map(script => script.textContent.match(/\bhlsUrl\s*=\s*['"]([^'"]+\.m3u8(?:\?[^'"]*)?)['"]/))
                    .find(Boolean)?.[1] || "";
            return {list: [{
                vod_id: ids[0],
                vod_name: title,
                vod_pic: image,
                vod_content: title,
                vod_play_from: ["Jable", ids[0], title].join(" "),
                vod_play_url: /^https:\/\/[^\s]+\.m3u8(?:\?|$)/i.test(playUrl) ? "播放$" + playUrl : ""
            }]};
        }
    };

    let sent = false;
    const startedAt = Date.now();
    function sendResult() {
        if (sent || !spider[method]) return;
        if (document.querySelector("#challenge-stage, #challenge-form, #cf-challenge-running, input[name='cf-turnstile-response']")
                || /just a moment|checking your browser|verify you are human|请稍候|验证您是否为真人/i.test(document.title)) return;
        const result = spider[method].apply(spider, args);
        if (method === "detailContent" && !result.list[0].vod_play_url && Date.now() - startedAt < 12000) return;
        if ((method === "homeContent" || method === "categoryContent" || method === "searchContent")
                && !result.list.length && Date.now() - startedAt < 30000) return;
        sent = true;
        clearInterval(poller);
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    const poller = setInterval(sendResult, 500);
    if (document.readyState === "complete") setTimeout(sendResult, 0);
    else unsafeWindow.addEventListener("load", sendResult, {once: true});
})();
