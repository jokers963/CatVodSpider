// ==UserScript==
// @name         SupJav
// @namespace    luoyuqiuspider
// @version      1.0.26-nbd-diag5
// @description  SupJav WebView adapter for the open-source GM spider runtime.
// @match        https://supjav.com/*
// @match        https://turbovidhls.com/*
// @match        https://fc2stream.tv/*
// @match        https://lk1.supremejav.com/*
// @require      https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.slim.min.js
// @grant        GM_cookie
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    if (location.hostname === "lk1.supremejav.com") {
        if (method !== "playerContent") return;
        diag("stage", "started");
        let opened = false;
        const open = function () {
            if (opened) return;
            const frame = document.querySelector("iframe[src]");
            if (!frame) return;
            try {
                const url = new URL(frame.src);
                const target = url.hostname === "fc2stream.tv" && url.pathname.startsWith("/e/")
                        || url.hostname === "lk1.supremejav.com" && url.pathname === "/supjav.php"
                        && url.searchParams.has("c") && !url.searchParams.has("l");
                if (url.protocol !== "https:" || !target || url.username || url.password) return;
                opened = true;
                clearInterval(timer);
                diag("frame", url.href);
                location.replace(url.href);
            } catch (_) {}
        };
        const timer = setInterval(open, 400);
        setTimeout(function () { clearInterval(timer); }, 30000);
        open();
        return;
    }
    if (location.hostname === "turbovidhls.com" || location.hostname === "fc2stream.tv") {
        if (method !== "playerContent") return;
        diag("stage", "started");
        // This TV player disables autostart. Start it once so GM can capture its media request.
        let started = false;
        const start = function () {
            if (started) return;
            try {
                const player = unsafeWindow.jwplayer(location.hostname === "fc2stream.tv" ? "vplayer" : "video_player");
                const item = player.getPlaylistItem();
                if (!item || !(item.file || item.sources?.[0]?.file)) return;
                started = true;
                diag("stage", "page_ready");
                clearInterval(timer);
                player.setMute(true);
                player.play(true);
                diag("stage", "match_wait");
            } catch (_) {}
        };
        const timer = setInterval(start, 400);
        setTimeout(function () { clearInterval(timer); }, 30000);
        start();
        return;
    }
    function diag(phase, value) { try { GmSpiderInject.Diagnostic(phase, value); } catch (_) {} }
    if (method === "playerContent") diag("stage", "started");
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
                list: []
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
                if (/^(ST|VOE)$/i.test($(this).text().trim())) return;
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
            const raw = (window.location.hash || "#0").substring(1);
            const index = parseInt(raw, 10);
            const group = document.querySelector(".video-wrap .cd-server");
            const buttons = group ? group.querySelectorAll(".btn-server") : document.querySelectorAll(".video-wrap .btn-server");
            let button = String(index) === raw && index >= 0 && index < buttons.length ? buttons[index] : null;
            if (!button) {
                const want = raw.toUpperCase();
                for (let i = 0; i < buttons.length; i++) {
                    if ((buttons[i].textContent || "").trim().toUpperCase() === want) {
                        button = buttons[i];
                        break;
                    }
                }
            }
            diag("stage", "page_ready");
            if (button) { diag("button", (button.textContent || "").trim().toUpperCase()); button.click(); }
            else diag("stage", "button_missing");
            document.querySelectorAll('[id^="asg-"]').forEach(function (el) { el.remove(); });
            document.querySelectorAll("iframe").forEach(function (el) {
                if (el.id !== "video") el.remove();
            });
            const arm = function () {
                const frame = document.getElementById("video");
                if (!frame) return false;
                if (button && (button.textContent || "").trim().toUpperCase() === "FST") {
                    try {
                        const url = new URL(frame.src);
                        if (url.protocol !== "https:" || url.hostname !== "lk1.supremejav.com"
                                || url.pathname !== "/supjav.php" || url.username || url.password) return false;
                        diag("frame", url.href);
                        location.replace(url.href);
                        return true;
                    } catch (_) { return false; }
                }
                if (frame.getAttribute("data-armed") === "1") return true;
                diag("frame", frame.src);
                frame.setAttribute("data-armed", "1");
                frame.setAttribute("allow", "autoplay; fullscreen");
                const mark = function () { frame.setAttribute("data-ready", "1"); };
                frame.addEventListener("load", function () { diag("stage", "frame_loaded"); setTimeout(mark, 3500); }, {once: true});
                setTimeout(mark, 10000);
                return true;
            };
            if (!arm()) {
                const wait = setInterval(function () { if (arm()) clearInterval(wait); }, 200);
                setTimeout(function () { clearInterval(wait); }, 10000);
            }
            diag("stage", "match_wait");
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
            return !!document.querySelector(".video-wrap .btn-server");
        }
        return !!document.querySelector(".post");
    }

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
        if (sent) return;
        const ready = pageReady();
        const waiting = Date.now() - startedAt;
        const challenged = cloudflareChallenge() || !!document.querySelector(".loading-verifying");
        if (!ready && challenged && !verificationShown) {
            verificationShown = true;
            GmSpiderInject.ShowWebview();
        }
        // Return immediately when content is ready; do not abort a still-loading page after only five seconds.
        if (!ready && waiting < 25000) return;
        sent = true;
        if (poller) clearInterval(poller);
        const message = challenged ? "站点验证未完成，请在页面完成验证后重试" : "页面内容未返回，请稍后重试";
        if (!ready && method === "playerContent") diag("stage", "page_unavailable");
        const result = ready ? spider[method].apply(spider, args)
                : method === "playerContent" ? {type: "url", ext: {url: "", header: {}}}
                : {list: [], msg: message};
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    const poller = setInterval(sendResult, 400);
    try { GmSpiderInject.HideWebview(); } catch (e) {}
    $(document).ready(sendResult);
    $(unsafeWindow).on("load", sendResult);
})();
