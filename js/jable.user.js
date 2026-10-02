// ==UserScript==
// @name         Jable
// @namespace    luoyuqiuspider
// @version      1.0.8
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

    function isAsyncFragment() {
        try {
            return /(^|[?&])mode=async([&#]|$)/.test(new URL(location.href).search);
        } catch (_) {
            return false;
        }
    }

    function pageCount(total) {
        let count = 1;
        document.querySelectorAll(".pagination a[href], a[href*='page=']").forEach(function (link) {
            const match = new URL(link.href, location.href).searchParams.get("page");
            if (match && /^\d+$/.test(match)) count = Math.max(count, Number(match));
        });
        if (count === 1) {
            // JS-driven pagination (page links carry no page= href): harvest page
            // numbers from data attributes or link labels ("01", "02", ...).
            // Recomputed on every page, so the count grows as the pagination
            // window slides forward while driving deeper.
            document.querySelectorAll("ul.pagination a.page-link").forEach(function (a) {
                const m = (a.getAttribute && a.getAttribute("data-page") || "").match(/\d+/)
                    || a.textContent.match(/\d+/);
                if (m) count = Math.max(count, parseInt(m[0], 10));
            });
        }
        if (count === 1 && isAsyncFragment() && total >= 20) {
            // KVS async block endpoint returns raw video HTML with no pagination UI,
            // so pagecount would stay 1 and the player would never request page 2+.
            // A full batch (~24 videos per block on jable) implies more blocks exist:
            // report a large count and let the empty last block terminate pagination.
            count = 9999;
        }
        return count;
    }

    // Jable search pagination is AJAX-driven: flipping pages never changes the
    // URL, so the player cannot request page 2+ through the loadUrl template.
    // Drive the in-page pagination instead (ul.pagination > li.page-item >
    // a.page-link; current page is span.page-link.active; labels are "01"...).
    // Returns undefined when the caller should scrape the current DOM,
    // otherwise a result object (pending while driving, terminal-empty when
    // the target page is unreachable so the player stops cleanly).
    let searchNav = null;
    function paginationActivePage() {
        const active = document.querySelector("ul.pagination li.page-item span.page-link.active");
        if (!active) return 0;
        const m = active.textContent.match(/\d+/);
        return m ? parseInt(m[0], 10) : 0;
    }
    function paginationClick(target) {
        const links = [...document.querySelectorAll("ul.pagination li.page-item a.page-link")];
        let exact = null, below = null, belowN = -1, maxA = null, maxN = -1;
        for (const a of links) {
            const m = a.textContent.match(/\d+/);
            if (!m) continue;
            const n = parseInt(m[0], 10);
            if (n === target) { exact = a; break; }
            if (n < target && n > belowN) { below = a; belowN = n; }
            if (n > maxN) { maxN = n; maxA = a; }
        }
        const choice = exact || below || (maxN < target ? maxA : null);
        if (choice) { choice.click(); return true; }
        return false;
    }
    function searchPageDrive(pg) {
        pg = parseInt(pg, 10) || 1;
        if (pg <= 1) { searchNav = null; return undefined; }
        const active = paginationActivePage();
        if (active === pg) {
            if (searchNav && searchNav.target === pg && (searchNav.settled = (searchNav.settled || 0) + 1) < 2) {
                return {list: [], pagecount: 1}; // let the AJAX-swapped DOM settle
            }
            searchNav = null;
            return undefined;
        }
        if (!searchNav || searchNav.target !== pg) searchNav = {target: pg, lastActive: -1, clicks: 0, at: 0, settled: 0};
        if (searchNav.lastActive !== active) {
            searchNav.lastActive = active;
            searchNav.at = Date.now();
            if (++searchNav.clicks <= 24 && paginationClick(pg)) return {list: [], pagecount: 1};
        } else if (Date.now() - searchNav.at < 8000) {
            return {list: [], pagecount: 1};
        }
        searchNav = null;
        return {list: [], pagecount: pg};
    }

    const spider = {
        homeContent: function () { return {class: classes(), list: []}; },
        categoryContent: function () { const list = videos(); return {list: list, pagecount: pageCount(list.length)}; },
        searchContent: function (key, quick, pg) {
            const driven = searchPageDrive(pg);
            if (driven) return driven;
            return {list: videos(), pagecount: pageCount()};
        },
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

    function navigationStartedAt() {
        if (typeof performance !== "undefined") {
            if (Number.isFinite(performance.timeOrigin)) return performance.timeOrigin;
            if (performance.timing && Number.isFinite(performance.timing.navigationStart)) return performance.timing.navigationStart;
        }
        return Date.now();
    }

    let sent = false;
    let verificationShown = false;
    const startedAt = navigationStartedAt();
    function sendResult() {
        if (sent || !spider[method]) return;
        const challenged = document.querySelector("#challenge-stage, #challenge-form, #cf-challenge-running, input[name='cf-turnstile-response']")
                || /just a moment|checking your browser|verify you are human|请稍候|验证您是否为真人/i.test(document.title);
        const waiting = Date.now() - startedAt;
        if (challenged) {
            if (!verificationShown) {
                verificationShown = true;
                GmSpiderInject.ShowWebview();
            }
            if (waiting < 25000) return;
            sent = true;
            clearInterval(poller);
            GmSpiderInject.HideWebview();
            GmSpiderInject.SetSpiderResult(JSON.stringify({list: [], msg: "站点验证未完成，请在页面完成验证后重试"}));
            return;
        }
        const result = spider[method].apply(spider, args);
        if (method === "detailContent" && !result.list[0].vod_play_url && waiting < 12000) return;
        if ((method === "homeContent" ? !result.class.length
                : (method === "categoryContent" || method === "searchContent") && !result.list.length)
                && waiting < 25000) return;
        const ready = method === "homeContent" ? result.class.length > 0
                : method === "detailContent" ? !!result.list[0].vod_play_url : result.list.length > 0;
        sent = true;
        clearInterval(poller);
        GmSpiderInject.HideWebview();
        if (!ready) result.msg = document.readyState === "complete"
                ? method === "detailContent" ? "页面已加载，但未获取到播放地址" : "当前页面没有匹配内容"
                : "页面加载超时，请检查网络后重试";
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    const poller = setInterval(sendResult, 500);
    if (document.readyState === "complete") setTimeout(sendResult, 0);
    else unsafeWindow.addEventListener("load", sendResult, {once: true});
})();
