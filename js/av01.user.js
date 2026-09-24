// ==UserScript==
// @name         AV01
// @namespace    luoyuqiuspider
// @version      1.0.2
// @description  AV01 WebView adapter for the open-source GM spider runtime.
// @match        https://www.av01.media/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const api = location.origin + "/api/v1/";
    const limit = 24;
    const fixedClasses = [
        {type_id: "latest", type_name: "最新"},
        {type_id: "hottest", type_name: "热门"}
    ];

    async function json(path, options) {
        const response = await fetch(path.startsWith("http") ? path : api + path, options);
        if (!response.ok) throw new Error(path + " " + response.status);
        return response.json();
    }

    let geoPromise = null;
    function geo() {
        if (!geoPromise) geoPromise = json("https://files.iw01.xyz/edge/geo.js?json").catch(function () { return null; });
        return geoPromise;
    }

    function cn(text, translations) {
        return (translations && (translations.cn || translations.tw || translations.hk)) || text || "";
    }

    function cover(video, g) {
        if (!g) return "";
        if (g.r2_cover && (video.r2_status === "COVER_ONLY" || video.r2_status === "COMPLETE")) {
            return "https://files.iw01.xyz/covers/" + video.id + "/640.jpg?token_v2=" + g.token_v2 + "&expires=" + g.expires + "&ip=" + g.ip;
        }
        const base = g.continent === "EU" ? "https://static2.av01.tv" : "https://static.av01.tv";
        return base + "/media/videos/tmb/" + video.id + "/1.jpg/format=jpeg/wlv=800?access_token=" + g.access_token;
    }

    function title(video) {
        return [video.dvd_id, cn(video.title, video.title_translations)].filter(Boolean).join(" ");
    }

    function item(video, g) {
        return {
            vod_id: String(video.id),
            vod_name: title(video),
            vod_pic: cover(video, g),
            vod_remarks: (video.published_time || "").substring(0, 10)
        };
    }

    async function page(data) {
        const g = await geo();
        const pagination = data.pagination || {};
        return {
            list: (data.videos || []).map(function (video) { return item(video, g); }),
            page: pagination.page || 1,
            pagecount: pagination.totalPages || 1,
            limit: pagination.limit || limit,
            total: pagination.total || 0
        };
    }

    function listPath(tid, pg) {
        const query = "?page=" + (parseInt(pg, 10) || 1) + "&limit=" + limit;
        if (tid === "latest" || tid === "hottest") return "videos/types/" + tid + query;
        return "videos/" + tid + query;
    }

    async function tagClasses() {
        try {
            const data = await json("tags/by-score?page=1&limit=20");
            return (data.tags || []).map(function (tag) {
                return {type_id: "tag/" + tag.id, type_name: cn(tag.name, tag.name_translations)};
            });
        } catch (_) {
            return [];
        }
    }

    const spider = {
        homeContent: async function () {
            const results = await Promise.all([tagClasses(), json(listPath("latest", 1)).then(page)]);
            return {class: fixedClasses.concat(results[0]), list: results[1].list};
        },
        categoryContent: async function (tid, pg) {
            return page(await json(listPath(tid, pg)));
        },
        searchContent: async function (key, quick, pg) {
            const body = {query: key, pagination: {page: parseInt(pg, 10) || 1, limit: limit}};
            return page(await json("videos/search?lang=cn", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body)
            }));
        },
        detailContent: async function (ids) {
            const video = await json("videos/" + ids[0]);
            const g = await geo();
            const name = title(video);
            const code = video.dvd_id || "AV01";
            const people = (video.actresses || []).map(function (a) { return cn(a.name, a.name_translations); });
            const tags = (video.tags || []).map(function (t) { return cn(t.name, t.name_translations); });
            return {list: [{
                vod_id: String(video.id),
                vod_name: name,
                vod_pic: cover(video, g),
                vod_year: (video.published_time || "").substring(0, 4),
                vod_actor: people.join(","),
                vod_director: cn(video.director, video.director_translations),
                vod_remarks: cn(video.maker, video.maker_translations),
                vod_content: [cn(video.description, video.description_translations), tags.join(" ")].filter(Boolean).join("\n"),
                vod_play_data: [{
                    from: code,
                    media: [{name: name, type: "webview", ext: {replace: {id: String(video.id), slug: code.toLowerCase()}}}]
                }]
            }]};
        },
        playerContent: async function () {
            const header = {"User-Agent": navigator.userAgent, "Referer": location.origin + "/"};
            const id = location.pathname.split("/")[3];
            const g = await geo();
            let token = "";
            if (id && g) {
                let access = "https://customers.iw01.xyz/api/v1/videos/" + id + "/cdn-access?token_v2=" + g.token_v2 + "&expires=" + g.expires + "&ip=" + g.ip;
                if (g.comp) access += "&comp=true";
                token = (await json(access)).access_token || "";
            }
            const url = token ? location.origin + "/api/v1/videos/" + id + "/manifest/master.m3u8?access_token=" + encodeURIComponent(token) : "";
            return {type: "url", ext: {url: url, header: header}};
        }
    };

    let sent = false;
    async function sendResult() {
        if (sent) return;
        sent = true;
        let result;
        try {
            result = await spider[method].apply(spider, args);
        } catch (error) {
            result = method === "playerContent"
                    ? {type: "url", ext: {url: "", header: {}}}
                    : {list: [], error: String(error && error.message || error)};
        }
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", sendResult, {once: true});
    } else {
        sendResult();
    }
})();
