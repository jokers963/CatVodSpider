// ==UserScript==
// @name         SupJav
// @namespace    luoyuqiuspider
// @version      1.0.12
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
            const buttons = $(".video-wrap .cd-server").length
                    ? $(".video-wrap .cd-server:first .btn-server")
                    : $(".video-wrap .btn-server");
            buttons.each(function (i) {
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
            const index = parseInt((window.location.hash || "#0").substring(1), 10) || 0;
            const group = document.querySelector(".video-wrap .cd-server");
            const buttons = group ? group.querySelectorAll(".btn-server") : document.querySelectorAll(".video-wrap .btn-server");
            const button = buttons[index];
            tappedLine = button ? (button.textContent || "").trim() : "";
            if (button) button.click();
            document.querySelectorAll('[id^="asg-"]').forEach(function (el) { el.remove(); });
            const arm = function () {
                const frame = document.getElementById("video");
                if (!frame || frame.getAttribute("data-armed") === "1") return !!frame;
                frame.setAttribute("data-armed", "1");
                const mark = function () { frame.setAttribute("data-ready", "1"); };
                frame.addEventListener("load", function () { setTimeout(mark, 3500); }, {once: true});
                setTimeout(mark, 10000);
                return true;
            };
            if (!arm()) {
                const wait = setInterval(function () { if (arm()) clearInterval(wait); }, 200);
                setTimeout(function () { clearInterval(wait); }, 10000);
            }
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
            return !!document.querySelector(".video-wrap .btn-server, .post-meta .img");
        }
        return !!document.querySelector(".post");
    }

    let sent = false;
    let tappedLine = "";
    const startedAt = Date.now();
    function sendResult() {
        if (sent) return;
        const ready = pageReady();
        const waiting = Date.now() - startedAt;
        if (!ready && (cloudflareChallenge() || document.querySelector(".loading-verifying")) && waiting > 12000) {
            try {
                if (!sessionStorage.getItem("supjav-cf-retry")) {
                    sessionStorage.setItem("supjav-cf-retry", "1");
                    location.reload();
                    return;
                }
            } catch (e) {}
        }
        if (!ready && waiting < 35000) return;
        if (ready) {
            try { sessionStorage.removeItem("supjav-cf-retry"); } catch (e) {}
        }
        sent = true;
        if (poller) clearInterval(poller);
        const result = spider[method].apply(spider, args);
        const line = tappedLine || ((document.querySelector(".btn-server.active") || {}).textContent || "").trim();
        const embed = method === "playerContent" && /^(ST|VOE)$/i.test(line);
        if (!embed) GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
        if (embed) {
            const show = function () { try { GmSpiderInject.ShowWebview(); } catch (e) {} };
            show();
            const keep = setInterval(show, 1500);
            setTimeout(function () { clearInterval(keep); }, 20000);
            setTimeout(function () { try { GmSpiderInject.HideWebview(); } catch (e) {} }, 50000);
        }
    }

    const poller = setInterval(sendResult, 400);
    if (method === "playerContent") {
        try { GmSpiderInject.ShowWebview(); } catch (e) {}
    } else {
        GmSpiderInject.HideWebview();
    }
    if (method === "playerContent") {
        setInterval(function () {
            document.querySelectorAll('[id^="asg-"]').forEach(function (el) { el.remove(); });
            const video = document.getElementById("video");
            if (!video) return;
            const box = video.getBoundingClientRect();
            const x = box.left + box.width / 2;
            const y = box.top + box.height / 2;
            for (let i = 0; i < 8; i++) {
                const top = document.elementFromPoint(x, y);
                if (!top || top === video || video.contains(top)) break;
                top.remove();
            }
        }, 300);
    }
    $(document).ready(sendResult);
    $(unsafeWindow).on("load", sendResult);
})();
