// ==UserScript==
// @name         Jav.Guru
// @namespace    luoyuqiuspider
// @version      1.0.1
// @description  Jav.Guru WebView adapter for the open-source GM spider runtime.
// @match        https://jav.guru/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    function pageCount() {
        let count = 1;
        document.querySelectorAll(".pagination a[href], a.page-numbers").forEach(function (link) {
            const numbers = (new URL(link.href, location.href).pathname.match(/\/page\/(\d+)/) || [])[1];
            if (numbers) count = Math.max(count, Number(numbers));
        });
        return count;
    }

    function videos() {
        const list = [];
        const seen = new Set();
        document.querySelectorAll(".inside-article").forEach(function (card) {
            const link = card.querySelector("h2 a[href]");
            if (!link) return;
            const url = new URL(link.href, location.href);
            if (url.hostname !== "jav.guru" || !/^\/\d+\/[^/]+\/?$/.test(url.pathname) || seen.has(url.pathname)) return;
            const image = card.querySelector(".imgg img, img");
            const name = link.title || link.textContent.trim() || image?.alt || "";
            if (!name) return;
            seen.add(url.pathname);
            list.push({
                vod_id: url.pathname.replace(/^\/|\/$/g, ""),
                vod_name: name,
                vod_pic: image?.dataset.lazySrc || image?.dataset.src || image?.src || "",
                vod_remarks: card?.querySelector(".date, .entry-meta")?.textContent.trim() || ""
            });
        });
        return list;
    }

    function streamButtons() {
        return [...document.querySelectorAll("a.wp-btn-iframe__shortcode")]
                .filter(function (el) {
                    const text = (el.textContent || el.value || "").replace(/\s+/g, " ").trim();
                    return /^STREAM\s+[A-Z0-9]+$/i.test(text);
                });
    }

    function startEmbeddedPlayer(doc) {
        const overlay = doc.querySelector("#overlay_layer[onclick]");
        if (overlay && !overlay.dataset.gmStarted) {
            overlay.dataset.gmStarted = "1";
            overlay.click();
        }
        doc.querySelectorAll("iframe").forEach(function (frame) {
            try { if (frame.contentDocument) startEmbeddedPlayer(frame.contentDocument); } catch (_) {}
        });
    }

    function videoCode(title) {
        const match = (title || "").match(/\b[A-Z]{2,8}[-_.]\d{2,6}\b/i);
        return match ? match[0].replace(/[_.]/g, "-").toUpperCase() : "";
    }

    const spider = {
        homeContent: function () {
            return {
                class: [
                    {type_id: "category/jav", type_name: "JAV"},
                    {type_id: "category/english-subbed", type_name: "英文字幕"}
                ],
                list: videos()
            };
        },
        categoryContent: function () { return {list: videos(), pagecount: pageCount()}; },
        searchContent: function () { return {list: videos(), pagecount: pageCount()}; },
        detailContent: function (ids) {
            const title = document.querySelector("h1")?.textContent.trim()
                    || document.querySelector('meta[property="og:title"]')?.content
                    || document.title;
            const code = videoCode(title) || videoCode(document.body.textContent);
            const name = code && !title.toUpperCase().includes(code) ? code + " " + title : title;
            const buttons = streamButtons();
            const media = buttons.map(function (button, index) {
                const label = (button.textContent || button.value || "").replace(/\s+/g, " ").trim();
                return {
                    from: label,
                    media: [{name: name, type: "webview", ext: {replace: {pathname: ids[0], link: index}}}]
                };
            });
            return {list: [{
                vod_id: ids[0],
                vod_name: name,
                vod_pic: document.querySelector('meta[property="og:image"]')?.content || "",
                vod_content: name,
                vod_play_data: media
            }]};
        },
        playerContent: function () {
            const index = Number((location.hash || "#0").slice(1));
            const buttons = streamButtons();
            if (!Number.isInteger(index) || index < 0 || index >= buttons.length) return {type: "finalUrl", ext: {url: ""}};
            buttons[index].click();
            const playbackPoller = setInterval(function () { startEmbeddedPlayer(document); }, 400);
            setTimeout(function () { clearInterval(playbackPoller); }, 35000);
            return {type: "match"};
        }
    };

    let sent = false;
    let poller;
    const startedAt = Date.now();
    function sendResult() {
        if (sent || !spider[method]) return;
        const ready = method === "detailContent" || method === "playerContent"
                ? streamButtons().length > 0 : videos().length > 0;
        if (!ready && Date.now() - startedAt < 35000) return;
        sent = true;
        if (poller) clearInterval(poller);
        const result = spider[method].apply(spider, args);
        if (!ready && method !== "playerContent") {
            const title = /just a moment|checking your browser|verify you are human/i.test(document.title)
                    ? "Jav.Guru 访问验证未完成" : "Jav.Guru 页面暂未就绪";
            result.list = [{vod_id: "javguru-unavailable", vod_name: title, vod_pic: "", vod_content: title}];
        }
        try { GmSpiderInject.HideWebview(); } catch (_) {}
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    poller = setInterval(sendResult, 400);
    if (document.readyState === "complete") setTimeout(sendResult, 0);
    else unsafeWindow.addEventListener("load", sendResult, {once: true});
})();
