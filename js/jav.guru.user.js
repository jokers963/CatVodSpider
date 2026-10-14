// ==UserScript==
// @name         JavGuru (jav.guru)
// @namespace    luoyuqiuspider
// @version      0.1.0
// @description  jav.guru 原站 WebView 适配（测试配置）。列表/详情走 robots.txt + 页内 fetch 中转；线路 SB（StreamHG，1080p）与 LU（LuluStream，测试）由原生 HTTP 解析 master.m3u8，不点击任何元素。
// @match        https://jav.guru/*
// @match        https://jokers963.github.io/CatVodSpider/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// ==/UserScript==
(function () {
    const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : (typeof window !== "undefined" ? window : {});
    if (typeof document !== "undefined" && document.readyState && document.readyState !== "complete"
            && typeof W.addEventListener === "function") {
        W.addEventListener("load", main, {once: true});
    } else main();

    function main() {
    try { if (W.top && W.top !== W) return; } catch (_) { return; }
    if (W.__lyqJavGuruRan) return;
    try { W.__lyqJavGuruRan = true; } catch (_) {}
    const args = typeof GmSpiderInject === "undefined" ? ["homeContent", "true"] : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    const BASE = "https://jav.guru/";
    // 线路按详情页按钮文字（STREAM XX）识别；只收 1080p 线路。SB = StreamHG（javclan 等别名域），LU = LuluStream（测试，地址绑定 IP）。
    const LINES = ["SB", "LU"];
    const LINE_LABEL = {SB: "SB", LU: "LU（测试）"};
    const CLASSES = [
        {type_id: "jav", type_name: "有码"},
        {type_id: "jav-uncensored", type_name: "无码"},
        {type_id: "decensored", type_name: "去码"},
        {type_id: "english-subbed", type_name: "英字"},
        {type_id: "amateur", type_name: "素人"},
        {type_id: "FC2", type_name: "FC2"},
        {type_id: "1080p", type_name: "1080p"}
    ];
    let DOC = document;

    function absUrl(href) { try { return new URL(href, BASE).href; } catch (_) { return href || ""; } }
    function isVideoLink(href) { return /^https:\/\/jav\.guru\/\d+\/[^/?#]+\/?$/.test(absUrl(href)); }
    function text(el) { return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : ""; }

    // 作品编码：FC2PPV 1234567 → FC2PPV-1234567；[ABC-123] → ABC-123。
    function workCode(s) {
        const fc2 = /FC2[\s-]*PPV[\s-]*(\d{5,8})/i.exec(s || "");
        if (fc2) return "FC2PPV-" + fc2[1];
        const b = /\[([A-Z0-9]{2,10}-\d{2,6}[A-Z]?)\]/i.exec(s || "");
        if (b) return b[1].toUpperCase();
        const m = /\b([A-Z]{2,6})-(\d{2,5})\b/i.exec(s || "");
        return m ? (m[1] + "-" + m[2]).toUpperCase() : "";
    }

    function videos() {
        const list = [];
        const seen = new Set();
        DOC.querySelectorAll(".inside-article").forEach(function (card) {
            const a = card.querySelector(".imgg a[href], h2 a[href]");
            if (!a) return;
            const href = absUrl(a.getAttribute("href") || "");
            if (!isVideoLink(href) || seen.has(href)) return;
            const img = card.querySelector("img");
            const name = text(card.querySelector("h2 a")) || (img && img.getAttribute("alt")) || "";
            if (!name) return;
            seen.add(href);
            list.push({
                vod_id: href,
                vod_name: name,
                vod_pic: img ? absUrl(img.getAttribute("data-src") || img.getAttribute("src") || "") : "",
                vod_remarks: text(card.querySelector(".date"))
            });
        });
        return list;
    }

    function pageCount() {
        let n = 1;
        DOC.querySelectorAll("a[href]").forEach(function (a) {
            const m = /\/page\/(\d+)\/?(\?|#|$)/.exec(a.getAttribute("href") || "");
            if (m) n = Math.max(n, parseInt(m[1], 10));
        });
        return n;
    }

    function listResult(pg) {
        const page = Math.max(1, parseInt(pg, 10) || 1);
        const list = videos();
        return {list: list, page: page, pagecount: list.length ? Math.max(pageCount(), page) : page};
    }

    function b64(s) {
        try { return typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary"); } catch (_) { return ""; }
    }

    // 详情页：按钮 a[data-localize=X] 文字 "STREAM SB"；脚本内 var X = {..."iframe_url":"<base64 网关地址>"}。
    function gatewayMap() {
        const map = {};
        DOC.querySelectorAll("script").forEach(function (s) {
            const re = /var\s+(\w+)\s*=\s*\{(?:(?!\bvar\s)[^])*?"iframe_url"\s*:\s*"([A-Za-z0-9+/=]+)"/g;
            let m;
            const t = s.textContent || "";
            while ((m = re.exec(t))) {
                const u = b64(m[2]);
                if (/^https:\/\/jav\.guru\/searcho\/\?/.test(u)) map[m[1]] = u;
            }
        });
        return map;
    }

    // ---- 播放解析 ----
    function unpack(html) {
        const m = /}\('((?:[^'\\]|\\.)*)',\s*(\d+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(html || "");
        if (!m) return "";
        const p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
        const a = parseInt(m[2], 10);
        const k = m[4].split("|");
        function enc(n) {
            return (n < a ? "" : enc(Math.floor(n / a))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
        }
        const dict = {};
        for (let c = parseInt(m[3], 10) - 1; c >= 0; c--) dict[enc(c)] = k[c] || enc(c);
        return p.replace(/\b\w+\b/g, function (w) { return Object.prototype.hasOwnProperty.call(dict, w) ? dict[w] : w; });
    }

    // StreamHG：hls4（同域 /stream/…/master.m3u8）优先，其次 hls2；LuluStream：sources[0].file。
    function hlsFromEmbed(html, embedUrl) {
        const js = unpack(html) || html || "";
        const origin = (/^https?:\/\/[^/]+/.exec(embedUrl) || [""])[0];
        const found = {};
        const re = /["']?(hls\d|file)["']?\s*:\s*["']([^"']+)["']/g;
        let m;
        while ((m = re.exec(js))) if (!found[m[1]]) found[m[1]] = m[2];
        for (const key of ["hls4", "hls2", "file"]) {
            const v = found[key];
            if (!v) continue;
            const url = v.charAt(0) === "/" ? origin + v : v;
            if (/^https:\/\//.test(url) && /\.m3u8(\?|$)/.test(url)) return url;
        }
        return "";
    }

    // 网关页（前端 activate_real_stream 的同等计算）：三段 data 属性拼接后反转 → base + '?' + rtype + 'r=' + token。
    function realGatewayUrl(html) {
        const box = /class="stream-box"([^>]*)>/.exec(html || "");
        const cfg = /window\.cfg\s*=\s*\{([\s\S]*?)\};/.exec(html || "");
        if (!box || !cfg) return "";
        const base = (/base:\s*'([^']+)'/.exec(cfg[1]) || [])[1] || "";
        const rtype = (/rtype:\s*'(\w+)'/.exec(cfg[1]) || [])[1] || "";
        const keys = ((/keys:\s*\[([^\]]*)\]/.exec(cfg[1]) || [])[1] || "").match(/data-\w+/g) || [];
        if (!/^https:\/\/jav\.guru\/searcho\//.test(base) || !rtype || keys.length !== 3) return "";
        let token = "";
        for (const k of keys) {
            const v = (new RegExp(k + '="(\\w+)"').exec(box[1]) || [])[1];
            if (!v) return "";
            token += v;
        }
        return base + "?" + rtype + "r=" + token.split("").reverse().join("");
    }

    function gmGet(url, referer) {
        return new Promise(function (resolve) {
            if (typeof GM_xmlhttpRequest !== "function") { resolve(null); return; }
            let done = false;
            const fin = function (r) { if (!done) { done = true; resolve(r); } };
            try {
                GM_xmlhttpRequest({method: "GET", url: url, timeout: 15000,
                    headers: {"Referer": referer, "User-Agent": navigator.userAgent},
                    onload: function (r) { fin(r && r.status === 200 ? r : null); },
                    onerror: function () { fin(null); }, ontimeout: function () { fin(null); }});
            } catch (_) { fin(null); }
            setTimeout(function () { fin(null); }, 20000);
        });
    }

    async function pageFetch(url) {
        try {
            if (typeof W.fetch !== "function") return "";
            const r = await W.fetch(url, {credentials: "same-origin", cache: "no-store"});
            return r && r.ok ? await r.text() : "";
        } catch (_) { return ""; }
    }

    async function resolvePlay(rep) {
        const gw = String(rep.gw || "");
        if (!/^https:\/\/jav\.guru\/searcho\/\?/.test(gw)) return null;
        const referer = /^https:\/\/jav\.guru\//.test(rep.page || "") ? rep.page : BASE;
        // 网关页：原生 HTTP 优先；被 CF 拦（403）时用页内同源 fetch（本阶段页面就是 jav.guru/robots.txt）。
        let gwHtml = ((await gmGet(gw, referer)) || {}).responseText || "";
        if (!realGatewayUrl(gwHtml)) gwHtml = await pageFetch(gw);
        const real = realGatewayUrl(gwHtml);
        if (!real) return null;
        // 真实地址 302 → 视频托管站嵌入页；HttpURLConnection 自动跟随，finalUrl 即嵌入页（域名别名随站点更换，不写死）。
        const r = await gmGet(real, gw);
        if (!r) return null;
        const embed = String(r.finalUrl || "").split("#")[0];
        if (!/^https:\/\//.test(embed) || /^https:\/\/jav\.guru\//.test(embed)) return null;
        let url = hlsFromEmbed(r.responseText, embed);
        if (!url) {
            const again = await gmGet(embed, BASE);
            url = again ? hlsFromEmbed(again.responseText, embed) : "";
        }
        if (!url) return null;
        const origin = (/^https:\/\/[^/]+/.exec(embed) || [""])[0];
        return {type: "url", ext: {url: url, header: {"User-Agent": navigator.userAgent, "Referer": origin + "/", "Origin": origin}}};
    }

    function playerMedium() { try { return JSON.parse(args[1] || "{}"); } catch (_) { return {}; } }

    const spider = {
        homeContent: function () { return {class: CLASSES, list: []}; },
        categoryContent: function (tid, pg) { return listResult(pg); },
        searchContent: function (key, quick, pg) { return listResult(pg); },
        detailContent: function (ids) {
            const page = ids[0];
            const title = text(DOC.querySelector("h1.titl, h1")) || String(DOC.title || "").split("⋆")[0].trim();
            let code = "";
            DOC.querySelectorAll(".infoleft li").forEach(function (li) {
                const m = /^Code:\s*(\S+)/i.exec(text(li));
                if (m && !code) code = m[1].toUpperCase();
            });
            code = workCode(code || title) || code;
            const img = DOC.querySelector(".large-screenimg img");
            const actress = [];
            DOC.querySelectorAll(".infoleft li").forEach(function (li) {
                if (/^Actress:/i.test(text(li))) li.querySelectorAll("a").forEach(function (a) { actress.push(text(a)); });
            });
            const gws = gatewayMap();
            const byLine = {};
            DOC.querySelectorAll("a[data-localize]").forEach(function (a) {
                const m = /STREAM\s+([A-Z0-9]+)/i.exec(text(a));
                const gw = gws[a.getAttribute("data-localize") || ""];
                if (!m || !gw) return;
                const line = m[1].toUpperCase();
                if (LINES.indexOf(line) < 0 || byLine[line]) return;
                byLine[line] = [{name: "播放", type: "webview", ext: {replace: {page: page, gw: gw, line: line}}}];
            });
            const playData = LINES.filter(function (l) { return byLine[l]; }).map(function (l) {
                return {from: (code ? code + " " : "") + LINE_LABEL[l], media: byLine[l]};
            });
            if (!playData.length) return {list: []};
            return {list: [{
                vod_id: page, vod_name: title,
                vod_pic: img ? absUrl(img.getAttribute("src") || "") : "",
                vod_actor: actress.join(","),
                vod_content: title,
                vod_play_data: playData
            }]};
        },
        playerContent: async function () {
            const r = await resolvePlay((playerMedium().ext || {}).replace || {});
            return r || {type: "url", ext: {url: "", header: {}}, msg: "播放地址解析失败，请换线路重试"};
        }
    };

    // ---- 同源中转：分类/搜索/详情加载 jav.guru/robots.txt（CF 边缘缓存），页内 fetch 目标 HTML 后 DOMParser 解析；
    // fetch 拿到 403/验证页时整页跳转目标页，由用户在页面中自行完成验证（不自动点击）。
    const RELAY_PAGE = /^https:\/\/jav\.guru\/robots\.txt(?:[?#]|$)/;
    function relayTarget() {
        if (!RELAY_PAGE.test(location.href || "")) return "";
        if (method === "searchContent") {
            const kw = String(args[0] == null ? "" : args[0]).trim();
            const pg = Math.max(1, parseInt(args[2], 10) || 1);
            return kw ? BASE + (pg > 1 ? "page/" + pg + "/" : "") + "?s=" + encodeURIComponent(kw) : "";
        }
        if (method === "categoryContent") {
            const tid = String(args[0] || "jav");
            const pg = Math.max(1, parseInt(args[1], 10) || 1);
            return BASE + "category/" + encodeURIComponent(tid) + "/" + (pg > 1 ? "page/" + pg + "/" : "");
        }
        if (method === "detailContent") {
            const id = absUrl(String((args[0] || [])[0] || ""));
            return isVideoLink(id) ? id : "";
        }
        return "";
    }
    function looksChallenged(html) {
        return /<title>\s*(Just a moment|Attention Required)|window\._cf_chl_opt|id="challenge-form"|id="cf-challenge-running"/i.test(html || "");
    }
    async function relay(target) {
        if (typeof W.fetch === "function" && typeof DOMParser === "function") {
            try {
                const res = await W.fetch(target, {credentials: "same-origin", redirect: "follow", cache: "no-store"});
                const html = res && res.ok ? await res.text() : "";
                if (html && !looksChallenged(html)) {
                    DOC = new DOMParser().parseFromString(html, "text/html");
                    const result = spider[method].apply(spider, args);
                    if (method === "detailContent" && !(result.list[0] && result.list[0].vod_play_data)) result.msg = "没有可用线路（仅支持 SB/LU）";
                    else if (method !== "detailContent" && !result.list.length) result.msg = "当前页面没有匹配内容";
                    return result;
                }
            } catch (_) { DOC = document; }
        }
        location.replace(target);
        return null;
    }

    let sent = false, busy = false, shown = false, settleAt = 0, poller = 0;
    const startedAt = Date.now();
    function deliver(result) {
        if (sent) return;
        sent = true;
        clearInterval(poller);
        try { GmSpiderInject.HideWebview(); } catch (_) {}
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }
    function challenged() {
        return !!document.querySelector("#challenge-stage, #challenge-form, #cf-challenge-running, input[name='cf-turnstile-response']")
            || /just a moment|checking your browser|verify you are human|请稍候/i.test(document.title || "");
    }
    function sendResult() {
        if (sent || busy) return;
        if (!spider[method]) { deliver({list: [], msg: "请求参数异常，请重试"}); return; }
        if (method === "playerContent") {
            busy = true;
            Promise.resolve(spider.playerContent()).then(deliver, function () {
                deliver({type: "url", ext: {url: "", header: {}}, msg: "播放地址解析失败，请换线路重试"});
            });
            return;
        }
        const target = relayTarget();
        if (target) {
            busy = true;
            relay(target).then(function (r) { if (r) deliver(r); }, function () { location.replace(target); });
            return;
        }
        const result = spider[method].apply(spider, args);
        const has = method === "homeContent" ? result.class.length > 0
            : method === "detailContent" ? !!(result.list[0] && result.list[0].vod_play_data) : result.list.length > 0;
        if (has) {
            if (/^https:\/\/jav\.guru\//.test(location.href || "")) {
                if (document.readyState !== "complete") return;
                if (!settleAt) { settleAt = Date.now() + 1500; setTimeout(sendResult, 1600); }
                if (Date.now() < settleAt) return;
            }
            deliver(result);
            return;
        }
        if (challenged()) {
            if (!shown) { shown = true; try { GmSpiderInject.ShowWebview(); } catch (_) {} }
            if (Date.now() - startedAt < 60000) return;
            deliver({list: [], msg: "站点验证未完成，请在页面完成验证后重试"});
            return;
        }
        if (Date.now() - startedAt < 15000) return;
        result.msg = method === "detailContent" ? "没有可用线路（仅支持 SB/LU）" : "当前页面没有匹配内容";
        deliver(result);
    }
    poller = setInterval(sendResult, 500);
    sendResult();
    }
})();
