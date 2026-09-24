// ==UserScript==
// @name         JavMix
// @namespace    luoyuqiuspider
// @version      1.0.0
// @description  JavMix WebView adapter for the open-source GM spider runtime.
// @match        https://javmix.tv/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const startedAt = Date.now();
    let sent = false;
    let showedVerify = false;

    function videos() {
        const list = [];
        const seen = new Set();
        document.querySelectorAll("a[href]").forEach(function (link) {
            let url;
            try { url = new URL(link.href, location.href); } catch (_) { return; }
            if (url.hostname !== "javmix.tv") return;
            const parts = url.pathname.split("/").filter(Boolean);
            if (parts.length !== 2 || ["video", "xvideo", "fc2ppv"].indexOf(parts[0]) < 0) return;
            const id = parts.join("/");
            if (seen.has(id)) return;
            const image = link.querySelector("img");
            const name = image?.getAttribute("alt") || link.getAttribute("title") || "";
            if (!name) return;
            seen.add(id);
            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: image?.getAttribute("src") || "",
                vod_remarks: link.querySelector(".post-list-duration")?.textContent.trim() || ""
            });
        });
        return list;
    }

    function pageCount() {
        let count = 1;
        document.querySelectorAll('a[href*="/page/"]').forEach(function (link) {
            const match = link.href.match(/\/page\/(\d+)\//);
            if (match) count = Math.max(count, Number(match[1]));
        });
        return count;
    }

    function challengeVisible() {
        return !!document.querySelector("#challenge-stage, #challenge-form, #cf-challenge-running")
                || /just a moment|checking your browser|verify you are human|验证您是否为真人/i.test(document.title);
    }

    function lines() {
        const groups = document.querySelectorAll("#server > div");
        const spans = document.querySelectorAll("#server span");
        return Array.prototype.map.call(spans, function (span) {
            const label = span.textContent.trim() || "播放";
            if (groups.length < 2) return label;
            const index = Array.prototype.indexOf.call(groups, span.parentElement);
            return (index + 1) + " " + label;
        });
    }

    const spider = {
        homeContent: function () {
            return {
                class: [
                    {type_id: "video", type_name: "有码"},
                    {type_id: "xvideo", type_name: "无码破解"},
                    {type_id: "fc2ppv", type_name: "素人投稿"},
                    {type_id: "soaring", type_name: "急上升"},
                    {type_id: "popularity", type_name: "热门"}
                ],
                list: videos()
            };
        },
        categoryContent: function () { return {list: videos(), pagecount: pageCount()}; },
        searchContent: function () { return {list: videos(), pagecount: pageCount()}; },
        detailContent: function (ids) {
            const title = document.querySelector('meta[property="og:title"]')?.content || document.title;
            const image = document.querySelector('meta[property="og:image"]')?.content
                    || document.querySelector("#iframe img")?.getAttribute("src") || "";
            const media = lines().map(function (label, index) {
                return {
                    from: label,
                    media: [{
                        name: [ids[0], title].filter(Boolean).join(" "),
                        type: "webview",
                        ext: {replace: {pathname: ids[0], link: index}}
                    }]
                };
            });
            return {list: [{
                vod_id: ids[0],
                vod_name: title,
                vod_pic: image,
                vod_content: title,
                vod_play_data: media
            }]};
        },
        playerContent: function () {
            const index = parseInt((location.hash || "#0").substring(1), 10) || 0;
            const span = document.querySelectorAll("#server span")[index];
            if (span) span.click();
            return {type: "match"};
        }
    };

    function ready(result) {
        if (method === "playerContent") {
            return document.readyState === "complete"
                    && (document.querySelectorAll("#server span").length > 0 || Date.now() - startedAt > 8000);
        }
        if (method === "detailContent") return result.list[0].vod_play_data.length > 0 || Date.now() - startedAt > 8000;
        return result.list.length > 0 || Date.now() - startedAt > 30000;
    }

    function sendResult() {
        if (sent || !spider[method]) return;
        if (challengeVisible()) {
            if (!showedVerify && Date.now() - startedAt > 1200) {
                showedVerify = true;
                GmSpiderInject.ShowWebview();
            }
            if (Date.now() - startedAt < 90000) return;
        }
        const result = spider[method].apply(spider, args);
        if (!ready(result)) return;
        sent = true;
        clearInterval(poller);
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    const poller = setInterval(sendResult, 500);
    if (document.readyState === "complete") sendResult();
    else unsafeWindow.addEventListener("load", sendResult, {once: true});
})();
