// ==UserScript==
// @name         SupJav
// @namespace    luoyuqiuspider
// @version      2.8.0-cfgrace
// @description  SupJav WebView adapter for the open-source GM spider runtime. TEST ONLY - not in formal config.
// @match        https://supjav.com/*
// @match        https://jokers963.github.io/CatVodSpider/*
// @match        https://streamtape.com/e/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// ==/UserScript==
(function () {
    // @run-at document-start 只为 streamtape 嵌入页尽早挂去广告钩子；supjav.com / Pages 页面（含 CF 验证页）
    // 与 MissAV 相同：等 load 之后才执行任何代码，不在验证脚本运行期间改动页面环境。
    const EARLY = typeof location !== "undefined" && /^https:\/\/streamtape\.com\//.test(location.href || "");
    const WL = typeof unsafeWindow !== "undefined" ? unsafeWindow : (typeof window !== "undefined" ? window : null);
    if (!EARLY && typeof document !== "undefined" && document.readyState && document.readyState !== "complete"
            && WL && typeof WL.addEventListener === "function") {
        WL.addEventListener("load", main, {once: true});
    } else main();

    function main() {
    // 同一文档只运行一次；supjav 页已跳往 ST 嵌入页后不再重跑。
    const W0 = typeof unsafeWindow !== "undefined" ? unsafeWindow : (typeof window !== "undefined" ? window : {});
    try { if (W0.top && W0.top !== W0) return; } catch (_) { return; } // 只在顶层文档运行
    if (W0.__lyqSupjavRan) return;
    try { W0.__lyqSupjavRan = true; } catch (_) {}
    const args = typeof GmSpiderInject === "undefined"
            ? ["homeContent", "true"]
            : JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();

    // 线路：EVS / VAS / FST（EVS、FST 为 p,a,c,k,e,d → hls4；VAS 为 /api/stream POST）；
    // ST（Streamtape）= 用户手动点播放 + GM 嗅探 get_video（不自动点击、不点广告）；VOE 未收；LUC 仅 720p 不收。
    const LINES = ["EVS", "VAS", "FST", "ST"];
    const ST_HOST = /^https:\/\/streamtape\.com\/e\/[0-9a-z]+(\/|$)/i;
    const VAS_HOST = /^https:\/\/vvaassjjav\.xyz\/e\/([0-9a-z]+)/i;
    const LK1 = "https://lk1.supremejav.com/";
    const EMBED_HOSTS = /^https:\/\/(evsishere\.xyz|fc2stream\.tv|vvaassjjav\.xyz|streamtape\.com)\//;

    function absUrl(href) {
        try { return new URL(href, location.href).href; }
        catch (_) { return href || ""; }
    }

    function isVideoLink(href) {
        return /supjav\.com\/\d+\.html(\?|#|$)/.test(href || "");
    }

    function cleanPic(raw) {
        return /base64|1x1|placeholder|loading|blank\.gif|empty\.gif/i.test(raw || "") ? "" : (raw || "");
    }

    // 解析目标文档（当前页面）。
    let DOC = document;

    function videos() {
        const list = [];
        const seen = new Set();
        DOC.querySelectorAll("div.post").forEach(function (post) {
            const link = post.querySelector("a.img[href], h3 a[href]");
            if (!link) return;
            const href = link.getAttribute("href") || "";
            if (!isVideoLink(href)) return;
            const id = absUrl(href);
            if (seen.has(id)) return;
            const name = (link.getAttribute("title") || "").trim()
                || ((post.querySelector("h3 a") || {}).textContent || "").trim()
                || (link.textContent || "").trim();
            if (!name) return;
            seen.add(id);
            const img = post.querySelector("img.thumb, img");
            const picRaw = img ? (img.getAttribute("data-original") || img.getAttribute("data-src")
                || img.getAttribute("data-lazy-src") || img.getAttribute("src") || "") : "";
            list.push({
                vod_id: id,
                vod_name: name,
                vod_pic: absUrl(cleanPic(picRaw)),
                vod_remarks: ((post.querySelector(".meta") || {}).textContent || "").trim()
            });
        });
        return list;
    }

    function pageCount() {
        let count = 1;
        DOC.querySelectorAll("a[href]").forEach(function (a) {
            const m = /\/page\/(\d+)\/?(\?|#|$)/.exec(a.getAttribute("href") || "");
            if (m) count = Math.max(count, parseInt(m[1], 10));
        });
        return count;
    }

    // 作品编码供 GMSubs 字幕匹配：FC2PPV 4991168 → FC2PPV-4991168；ABC-123 原样大写。
    function workCode(title) {
        const fc2 = /FC2[\s-]*PPV[\s-]*(\d{5,8})/i.exec(title || "");
        if (fc2) return "FC2PPV-" + fc2[1];
        const m = /\b([A-Z]{2,6})-(\d{2,5})\b/i.exec(title || "");
        return m ? (m[1] + "-" + m[2]).toUpperCase() : "";
    }

    function reverse(s) { return String(s || "").split("").reverse().join(""); }

    const CLASSES = [
        {type_id: "censored-jav", type_name: "有码"},
        {type_id: "uncensored-jav", type_name: "无码"},
        {type_id: "amateur", type_name: "素人"},
        {type_id: "chinese-subtitles", type_name: "中字"},
        {type_id: "reducing-mosaic", type_name: "去码"},
        {type_id: "english-subtitles", type_name: "英字"}
    ];

    // ---- 播放解析（纯函数，便于离线测试）----
    // Dean Edwards packer 解包，不使用 eval。
    function unpack(html) {
        const m = /}\('((?:[^'\\]|\\.)*)',\s*(\d+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/.exec(html || "");
        if (!m) return "";
        const p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
        const a = parseInt(m[2], 10);
        const k = m[4].split("|");
        function enc(n) {
            return (n < a ? "" : enc(Math.floor(n / a)))
                + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
        }
        const dict = {};
        for (let c = parseInt(m[3], 10) - 1; c >= 0; c--) dict[enc(c)] = k[c] || enc(c);
        return p.replace(/\b\w+\b/g, function (w) { return Object.prototype.hasOwnProperty.call(dict, w) ? dict[w] : w; });
    }

    function hlsFromEmbed(html, embedUrl) {
        const js = unpack(html);
        const origin = (/^https?:\/\/[^/]+/.exec(embedUrl) || [""])[0];
        const found = {};
        const re = /["']?(hls\d)["']?\s*:\s*["']([^"']+)["']/g;
        let m;
        while ((m = re.exec(js))) found[m[1]] = m[2];
        // hls4 = 播放器同域相对 /stream/.../master.m3u8，优先；hls2 为备线
        for (const key of ["hls4", "hls2"]) {
            const v = found[key];
            if (!v) continue;
            const url = v.charAt(0) === "/" ? origin + v : v;
            if (/^https:\/\//.test(url) && /\.m3u8(\?|$)/.test(url)) return url;
        }
        return "";
    }

    function gmGet(url, referer, body) {
        return new Promise(function (resolve) {
            if (typeof GM_xmlhttpRequest !== "function") { resolve(null); return; }
            let settled = false;
            const finish = function (r) { if (!settled) { settled = true; resolve(r); } };
            const headers = {"Referer": referer, "User-Agent": navigator.userAgent};
            const req = {method: "GET", url: url, timeout: 15000, headers: headers};
            if (body !== undefined) {
                req.method = "POST";
                req.data = JSON.stringify(body);
                headers["Content-Type"] = "application/json";
            }
            try {
                GM_xmlhttpRequest(Object.assign(req, {
                    onload: function (r) { finish(r && r.status === 200 ? r : null); },
                    onerror: function () { finish(null); },
                    ontimeout: function () { finish(null); }
                }));
            } catch (_) { finish(null); }
            setTimeout(function () { finish(null); }, 20000);
        });
    }

    // lk1 302 → embed（HttpURLConnection 自动跟随，finalUrl 即 embed）；embed 带 Referer 才输出播放器脚本。
    async function resolveDirect(code) {
        if (!code) return null;
        const first = await gmGet(LK1 + "supjav.php?c=" + code, "https://supjav.com/");
        if (!first) return null;
        const embed = String(first.finalUrl || "").split("#")[0];
        if (!EMBED_HOSTS.test(embed)) return null;
        if (ST_HOST.test(embed)) return null; // ST 不走直链（get_video 需在网页播放器内由用户起播）
        const vas = VAS_HOST.exec(embed);
        if (vas) return resolveVas(embed, vas[1]);
        let url = hlsFromEmbed(first.responseText, embed);
        if (!url) {
            const second = await gmGet(embed, LK1);
            url = second ? hlsFromEmbed(second.responseText, embed) : "";
        }
        if (!url) return null;
        const origin = (/^https:\/\/[^/]+/.exec(embed) || [""])[0];
        return {type: "url", ext: {url: url, header: {
            "User-Agent": navigator.userAgent, "Referer": origin + "/", "Origin": origin
        }}};
    }

    // VAS（Vidara）：codecs 只认 av1/h265，H.264 是默认档；部分片源只有 AV1/H.265 转码。
    // device=web 时这类片源给 AV1，device=android 给 H.265（更易硬解）；有 H.264 时两者都返回 H.264。
    async function resolveVas(embed, filecode) {
        const r = await gmGet("https://vvaassjjav.xyz/api/stream", embed, {filecode: filecode, device: "android", codecs: []});
        if (!r) return null;
        let url = "";
        try { url = String(JSON.parse(r.responseText).streaming_url || ""); } catch (_) {}
        if (!/^https:\/\/[^/]+\/.*\.m3u8(\?|$)/.test(url)) return null;
        return {type: "url", ext: {url: url, header: {
            "User-Agent": navigator.userAgent, "Referer": "https://vvaassjjav.xyz/", "Origin": "https://vvaassjjav.xyz"
        }}};
    }

    // ST：lk1 → streamtape 嵌入页地址；只解析，不取媒体地址。
    async function resolveStEmbed(code) {
        if (!code) return "";
        const first = await gmGet(LK1 + "supjav.php?c=" + code, "https://supjav.com/");
        const embed = first ? String(first.finalUrl || "").split("#")[0] : "";
        return ST_HOST.test(embed) ? embed : "";
    }

    // ST 播放阶段运行在 supjav.com（json playerContent.loadUrl=${stpage:-Pages}）：streamtape 嵌入页无 supjav Referer 返回 404，
    // supjav 页面自身是 Referrer-Policy: same-origin，故先加 <meta name=referrer content=origin> 再顶层跳转，
    // 让嵌入页收到 Referer: https://supjav.com/。返回 {type:"match"} 后 GM 等待 playUrlMatch 命中（用户自己点播放）。
    function openStEmbed(embed) {
        try {
            const meta = document.createElement("meta");
            meta.setAttribute("name", "referrer");
            meta.setAttribute("content", "origin");
            (document.head || document.documentElement).appendChild(meta);
        } catch (_) {}
        location.replace(embed);
    }

    // 在 streamtape 嵌入页（@match）里：绝不以程序点击任何元素。只做去广告：
    // 1) 页面配置对象 {token,fileid,adblock,noads} 置 noads=true、adblock=true —— 站点播放处理器是
    //    `pcl<2 && !cfg.adblock → return`（首击给广告），adblock=true 后用户第一下就起播；noads=true 使
    //    `!noads && adblock → 跳 advtpe.com` 的检测分支不成立，也跳过 40s 后的统计上报。
    // 2) window.open / mkp 置空（弹窗/popunder 库都经由它们）。
    // 3) 移除盖在页面上的透明全屏层（popunder 库注入的 z-index:300000 div）和广告 iframe/脚本节点；
    //    .play-overlay 放大为全屏并置于最上层，触摸任何位置都落在播放按钮上。
    // 4) 用户点播放、视频真正开始后静音暂停网页内 <video> 并隐藏 WebView，避免与外部播放器同时出声。
    const ST_CSS = ".play-overlay{position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;"
        + "width:100vw!important;height:100vh!important;z-index:2147483647!important;display:block;pointer-events:auto!important;cursor:pointer}"
        + "#adb,.adblockblock,.ad,iframe:not(#innerframe){display:none!important}";

    function stConfigs(win) {
        const out = [];
        try {
            Object.keys(win).forEach(function (k) {
                let v;
                try { v = win[k]; } catch (_) { return; }
                if (v && typeof v === "object" && "token" in v && "fileid" in v && "adblock" in v) out.push(v);
            });
        } catch (_) {}
        return out;
    }

    function stIsAdLayer(el, win) {
        if (!el || !el.tagName) return false;
        const tag = el.tagName.toUpperCase();
        if (tag === "IFRAME") return el.id !== "innerframe";
        if (el.closest && el.closest(".play-overlay, .plyr-container, .plyr, video")) return false;
        if (el.id === "adb" || /(^|\s)(adblockblock|ad)(\s|$)/.test(el.className || "")) return true;
        let st;
        try { st = win.getComputedStyle(el); } catch (_) { return false; }
        const z = parseInt(st.zIndex, 10);
        return (st.position === "fixed" || st.position === "absolute") && z >= 1000;
    }

    function stClean(doc, win) {
        let removed = 0;
        stConfigs(win).forEach(function (c) { c.noads = true; c.adblock = true; });
        try {
            if (!doc.getElementById("__st_css")) {
                const css = doc.createElement("style");
                css.id = "__st_css";
                css.textContent = ST_CSS;
                (doc.head || doc.documentElement).appendChild(css);
            }
        } catch (_) {}
        try { Array.from(doc.querySelectorAll("script[src]")).forEach(function (el) { if (stIsAdScript(el)) stNeutralizeScript(el); }); } catch (_) {}
        const body = doc.body;
        if (body) {
            new Set(Array.from(body.children).concat(Array.from(doc.querySelectorAll("iframe")))).forEach(function (el) {
                try {
                    if (el.parentNode && stIsAdLayer(el, win)) { el.parentNode.removeChild(el); removed++; }
                } catch (_) {}
            });
        }
        return removed;
    }

    function stBlockPopups(win) {
        const nop = function () { return null; };
        ["open", "mkp"].forEach(function (k) {
            try { Object.defineProperty(win, k, {value: nop, writable: false, configurable: false}); }
            catch (_) { try { win[k] = nop; } catch (__) {} }
        });
    }

    // 已知广告/弹窗来源（llvpn.com tag = Monetag zone 11822409 → pyppo.com intent:// 跳转；另两个为 popunder 加载器）。
    const ST_AD_HOST = /(^|\.)(llvpn\.com|pyppo\.com|mulchimbiber\.com|conermoocher\.com|advtpe\.com|yandex\.ru|prebid|doubleclick\.net|googlesyndication\.com)$/i;
    const ST_TAP_EVENTS = ["click", "touchstart", "touchend", "pointerdown", "pointerup", "mousedown", "mouseup", "auxclick"];

    function stScriptHost(src) {
        try { return new URL(src, "https://streamtape.com/").hostname; } catch (_) { return ""; }
    }

    // 外链脚本：只放行 streamtape 同站与 recaptcha（嵌入页统计用）；内联广告加载器（llvpn tag、prebid 队列）按特征阻断；内联 popunder 库与页面配置同在一段脚本，不删，靠监听钩子与点按截断使其失效。
    function stIsAdScript(el) {
        if (!el || String(el.tagName || "").toUpperCase() !== "SCRIPT") return false;
        const src = el.src || (el.getAttribute && el.getAttribute("src")) || "";
        if (src) {
            const host = stScriptHost(src);
            return !(host === "streamtape.com" || /(^|\.)google\.com$|(^|\.)gstatic\.com$/.test(host)) || ST_AD_HOST.test(host);
        }
        const text = el.textContent || "";
        return /llvpn\.com|tag\.min\.js|dataset\.zone\s*=|pbjs\.que/i.test(text);
    }

    function stNeutralizeScript(el) {
        try { el.type = "javascript/blocked"; } catch (_) {}
        try { el.removeAttribute("src"); } catch (_) {}
        try { if (el.parentNode) el.parentNode.removeChild(el); } catch (_) {}
    }

    function stIsExternalHref(href) {
        const h = String(href || "").trim();
        if (!h || h.charAt(0) === "#" || /^javascript:/i.test(h)) return false;
        if (/^(intent|market|tg|whatsapp|sms|tel|mailto):/i.test(h)) return true;
        try { return new URL(h, "https://streamtape.com/").hostname !== "streamtape.com"; } catch (_) { return true; }
    }

    // 早期（document-start）钩子：丢弃 document/window 上新注册的点按类监听（popunder 库挂在这两处），
    // 播放器绑定在元素上的监听不受影响；外链 a 元素的 click 方法置空；阻断广告脚本插入。
    function stEarlyHooks(win) {
        try {
            const ET = win.EventTarget && win.EventTarget.prototype;
            if (ET && !Object.prototype.hasOwnProperty.call(ET, "__lyqWrapped")) {
                const orig = ET.addEventListener;
                ET.addEventListener = function (type, fn, opt) {
                    if ((this === win || this === win.document || (this && this.document === win.document && this.document)) && ST_TAP_EVENTS.indexOf(String(type)) >= 0 && !(fn && fn.__lyqOwn)) return;
                    return orig.call(this, type, fn, opt);
                };
                ET.__lyqWrapped = true;
            }
        } catch (_) {}
        try {
            const A = win.HTMLAnchorElement && win.HTMLAnchorElement.prototype;
            if (A && !Object.prototype.hasOwnProperty.call(A, "__lyqWrapped")) {
                const oc = A.click;
                A.click = function () { if (stIsExternalHref(this.getAttribute("href"))) return; return oc.call(this); };
                A.__lyqWrapped = true;
            }
        } catch (_) {}
        try {
            const F = win.HTMLFormElement && win.HTMLFormElement.prototype;
            if (F && !Object.prototype.hasOwnProperty.call(F, "__lyqWrapped")) {
                const os = F.submit;
                F.submit = function () { if (stIsExternalHref(this.getAttribute("action"))) return; return os.call(this); };
                F.__lyqWrapped = true;
            }
        } catch (_) {}
        try {
            const N = win.Node && win.Node.prototype;
            if (N && !Object.prototype.hasOwnProperty.call(N, "__lyqWrapped")) {
                ["appendChild", "insertBefore"].forEach(function (k) {
                    const o = N[k];
                    N[k] = function (el) { if (stIsAdScript(el)) return el; return o.apply(this, arguments); };
                });
                N.__lyqWrapped = true;
            }
        } catch (_) {}
        try {
            new win.MutationObserver(function (list) {
                list.forEach(function (m) {
                    Array.prototype.forEach.call(m.addedNodes || [], function (n) {
                        if (stIsAdScript(n)) { stNeutralizeScript(n); return; }
                        // 页面配置在内联脚本里：执行前把 "noads":false 改为 true（跳过首击广告与 advtpe 检测分支）。
                        if (n && String(n.tagName || "").toUpperCase() === "SCRIPT" && !n.src && /"fileid"/.test(n.textContent || "")) {
                            try { n.textContent = n.textContent.replace(/"noads":false/, '"noads":true').replace(/"adblock":false/, '"adblock":true'); } catch (_) {}
                        }
                        if (n && String(n.tagName || "").toUpperCase() === "META" && /refresh/i.test(n.getAttribute("http-equiv") || "")) {
                            try { n.parentNode.removeChild(n); } catch (_) {}
                        }
                    });
                });
            }).observe(win.document.documentElement || win.document, {childList: true, subtree: true});
        } catch (_) {}
    }

    // 用户的真实点按（不是程序点击）：window 捕获阶段最先收到，晚注入时也先于 document 上已注册的 popunder 监听。
    // 点在播放层上 → 直接执行与站点处理器相同的起播动作（隐藏遮罩、mainvideo.src = botlink + &stream=1），
    // 并阻止事件继续传播；其它点按也一律截断，避免广告库拿到用户手势去跳 intent://。
    function stTapShield(win, doc) {
        const shield = function (e) {
            try { e.stopImmediatePropagation(); e.stopPropagation(); } catch (_) {}
            const t = e.target;
            try {
                const a = t && t.closest && t.closest("a[href]");
                if (a && stIsExternalHref(a.getAttribute("href"))) e.preventDefault();
            } catch (_) {}
            if (e.type !== "click") return;
            try { e.preventDefault(); } catch (_) {}
            stStartPlayback(win, doc);
        };
        shield.__lyqOwn = true;
        ST_TAP_EVENTS.forEach(function (type) {
            try { win.addEventListener(type, shield, {capture: true, passive: false}); } catch (_) {}
        });
    }

    function stStartPlayback(win, doc) {
        const overlay = doc.querySelector(".play-overlay");
        const video = doc.getElementById("mainvideo") || doc.querySelector("video");
        const link = ((doc.getElementById("botlink") || {}).textContent || "").trim();
        if (!video || !link || win.__lyqStStarted) return false;
        const url = (/^\/\//.test(link) ? "https:" : "") + link + "&stream=1";
        if (!/^https:\/\/streamtape\.com\/get_video\?/.test(url)) return false;
        win.__lyqStStarted = true;
        try { if (overlay) overlay.style.display = "none"; } catch (_) {}
        try { video.src = url; } catch (_) {}
        try { if (win.player) win.player.currentTrack = 0; } catch (_) {}
        try { const p = video.play && video.play(); if (p && p.catch) p.catch(function () {}); } catch (_) {}
        return true;
    }

    function streamtapeGuard() {
        const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
        stBlockPopups(win);
        stEarlyHooks(win);
        stTapShield(win, document);
        let done = false;
        const quiet = function (v) {
            if (done) return;
            done = true;
            try { v.muted = true; v.pause(); } catch (_) {}
            try { GmSpiderInject.HideWebview(); } catch (_) {}
        };
        const tick = function () {
            stClean(document, win);
            const v = document.querySelector("video");
            if (v && !v.__stHooked) {
                v.__stHooked = true;
                v.addEventListener("playing", function () { quiet(v); });
            }
        };
        tick();
        setInterval(tick, 300);
        try {
            new MutationObserver(function () { stClean(document, win); })
                .observe(document.documentElement, {childList: true, subtree: true});
        } catch (_) {}
    }

    function playerMedium() {
        try { return JSON.parse(args[1] || "{}"); } catch (_) { return {}; }
    }

    const spider = {
        homeContent: function () { return {class: CLASSES, list: []}; },
        categoryContent: function (tid, pg) {
            const page = Math.max(1, parseInt(pg, 10) || 1);
            const list = videos();
            return {list: list, page: page, pagecount: list.length ? Math.max(pageCount(), page) : page};
        },
        searchContent: function (key, quick, pg) {
            const page = Math.max(1, parseInt(pg, 10) || 1);
            const list = videos();
            return {list: list, page: page, pagecount: list.length ? Math.max(pageCount(), page) : page};
        },
        detailContent: function (ids) {
            const page = ids[0];
            const h1 = (DOC.querySelector(".archive-title h1, h1") || {}).textContent;
            const title = ((DOC.querySelector('meta[property="og:title"]') || {}).content || h1 || DOC.title || "").trim();
            const image = (DOC.querySelector('meta[property="og:image"]') || {}).content || "";
            const code = workCode(title);
            let groups = Array.from(DOC.querySelectorAll(".cd-server"));
            if (!groups.length) groups = [DOC];
            const byLine = {};
            groups.forEach(function (group, i) {
                group.querySelectorAll("a.btn-server[data-link]").forEach(function (a) {
                    const line = (a.textContent || "").trim().toUpperCase();
                    const link = a.getAttribute("data-link") || "";
                    if (LINES.indexOf(line) < 0 || !/^[0-9a-f]+$/i.test(link)) return;
                    const replace = {page: page, c: reverse(link), line: line, cd: String(i + 1)};
                    // ST 播放阶段加载 supjav.com/robots.txt（CF 边缘缓存、不出验证；作为跳转嵌入页的 Referer 来源），其它线路仍加载 Pages 空白页。
                    if (line === "ST") replace.stpage = "https://supjav.com/robots.txt";
                    (byLine[line] = byLine[line] || []).push({
                        name: groups.length > 1 ? "CD" + (i + 1) : "播放",
                        type: "webview",
                        ext: {replace: replace}
                    });
                });
            });
            const playData = LINES.filter(function (l) { return byLine[l]; }).map(function (l) {
                return {from: code ? code + " " + l : l, media: byLine[l]};
            });
            if (!playData.length) return {list: []};
            return {list: [{
                vod_id: page,
                vod_name: title,
                vod_pic: absUrl(image),
                vod_content: ((DOC.querySelector('meta[name="description"]') || {}).content || "").trim(),
                vod_play_data: playData
            }]};
        },
        playerContent: async function () {
            const rep = (playerMedium().ext || {}).replace || {};
            if (rep.line === "ST") {
                const embed = await resolveStEmbed(rep.c);
                if (!embed) return {type: "url", ext: {url: "", header: {}}, msg: "ST 嵌入页解析失败，请换线路重试"};
                return {type: "match", embed: embed};
            }
            const direct = await resolveDirect(rep.c);
            if (direct) return direct;
            // 播放阶段加载的是自家 Pages 空白页（无 Cloudflare），没有详情页按钮可点，失败直接提示换线路。
            return {type: "url", ext: {url: "", header: {}}, msg: "播放地址解析失败，请换线路重试"};
        }
    };

    function navigationStartedAt() {
        if (typeof performance !== "undefined") {
            if (Number.isFinite(performance.timeOrigin)) return performance.timeOrigin;
            if (performance.timing && Number.isFinite(performance.timing.navigationStart)) return performance.timing.navigationStart;
        }
        return Date.now();
    }

    if (/^https:\/\/streamtape\.com\//.test(location.href || "")) { streamtapeGuard(); return; }

    let sent = false;
    let busy = false;
    // ==LYQ-CF-GRACE-BEGIN== 共享片段：6 个脚本逐字相同，由 js/cfgrace.test.cjs 校验。
    // Cloudflare 验证页先隐藏观察：首次检测记 seenAt，宽限期(8s)内验证标记消失/出现真实内容则永不显示；
    // 宽限后仅当出现可交互元素才显示，9.5s 无条件兜底显示（总宽限 <10s，外层任务约 30s）。不自动点击。
    function lyqCfGate(opts) {
        opts = opts || {};
        const now = opts.now || Date.now;
        const show = opts.show || function () { GmSpiderInject.ShowWebview(); };
        const graceMs = opts.graceMs || 8000;
        const fallbackMs = opts.fallbackMs || 9500;
        let seenAt = 0, seen = false, shown = false;
        function sized(el) {
            if (!el) return false;
            if (typeof el.getBoundingClientRect === "function") {
                const r = el.getBoundingClientRect();
                return !!r && r.width > 0 && r.height > 0;
            }
            return (el.offsetWidth || 0) > 0 && (el.offsetHeight || 0) > 0;
        }
        function interactive() {
            const doc = opts.doc || document;
            try {
                if ([].some.call(doc.querySelectorAll(".cf-turnstile"), sized)) return true;
                if ([].some.call(doc.querySelectorAll("iframe[src*='challenges.cloudflare.com']"), sized)) return true;
                const stage = doc.querySelector("#challenge-stage");
                if (stage && stage.querySelector("input:not([type=hidden])")) return true;
            } catch (_) {}
            return false;
        }
        return {
            tick: function (challenged) {
                if (!challenged) { if (!shown) { seenAt = 0; seen = false; } return shown; }
                const t = now();
                if (!seen) { seen = true; seenAt = t; }
                if (shown) return true;
                const age = t - seenAt;
                if (age >= graceMs && (age >= fallbackMs || interactive())) {
                    shown = true;
                    try { show(); } catch (_) {}
                }
                return shown;
            },
            seenAt: function () { return seenAt; },
            shown: function () { return shown; },
            interactive: interactive
        };
    }
    const cfGate = lyqCfGate();
    // ==LYQ-CF-GRACE-END==
    let settleAt = 0;
    const startedAt = navigationStartedAt();
    function deliver(result) {
        if (sent) return;
        sent = true;
        clearInterval(poller);
        if (result && result.type === "match" && result.embed) {
            // ST：WebView 保持显示供用户手动点播放；先交结果让 GM 进入等待嗅探，再跳转嵌入页。
            const embed = result.embed;
            try { GmSpiderInject.ShowWebview(); } catch (_) {}
            GmSpiderInject.SetSpiderResult(JSON.stringify({type: "match"}));
            openStEmbed(embed);
            return;
        }
        try { GmSpiderInject.HideWebview(); } catch (_) {}
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }
    // ---- 同源中转（2.7.0）：分类/搜索/详情先载 supjav.com/robots.txt（CF 边缘缓存，不出验证），
    // 在 WebView 内用 fetch 同源取目标页（与网页导航同一网络栈：同一 Cookie/cf_clearance、UA、TLS），DOMParser 解析。
    // 只发 1 个 HTML 请求，不加载整页的几十个站内脚本/样式与广告，降低触发 CF 频率/限速的概率；
    // 若 fetch 得到 403/验证页，则 location.replace(目标页) 让 CF 验证在页面中照常完成（不自动点击）。
    const RELAY_PAGE = /^https:\/\/supjav\.com\/robots\.txt(?:[?#]|$)/;
    function relayTarget() {
        if (!RELAY_PAGE.test(location.href || "")) return "";
        if (method === "searchContent") {
            // 搜索目标页由脚本按参数构造：关键词统一 encodeURIComponent（避免 & # % + 等破坏 hash/查询串），页码走 /page/N/?s=。
            const kw = String(args[0] == null ? "" : args[0]).trim();
            const pg = Math.max(1, parseInt(args[2], 10) || 1);
            return kw ? "https://supjav.com/" + (pg > 1 ? "page/" + pg + "/" : "") + "?s=" + encodeURIComponent(kw) : "";
        }
        let h = String(location.hash || "").replace(/^#/, "");
        try { h = decodeURIComponent(h); } catch (_) {}
        if (!h) return "";
        let u = "";
        try { u = new URL(h, "https://supjav.com/").href; } catch (_) { return ""; }
        return /^https:\/\/supjav\.com\/(?!robots\.txt)/.test(u) ? u : "";
    }
    function looksChallenged(html) {
        // 正常页面也含 /cdn-cgi/challenge-platform/ 信标脚本，不能据此判断。
        return /<title>\s*(Just a moment|Attention Required)|window\._cf_chl_opt|id="challenge-form"|id="cf-challenge-running"/i.test(html || "");
    }
    async function relay(target) {
        const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
        if (typeof W.fetch === "function" && typeof DOMParser === "function") {
            try {
                const res = await W.fetch(target, {credentials: "same-origin", redirect: "follow", cache: "no-store"});
                const html = res && res.ok ? await res.text() : "";
                if (html && !looksChallenged(html)) {
                    DOC = new DOMParser().parseFromString(html, "text/html");
                    const result = spider[method].apply(spider, args);
                    if (method === "detailContent" && !(result.list[0] && result.list[0].vod_play_data)) {
                        result.msg = "没有可用线路（仅支持 EVS/VAS/FST/ST）";
                    } else if (method !== "detailContent" && !result.list.length) {
                        result.msg = "当前页面没有匹配内容";
                    }
                    return result;
                }
            } catch (_) { DOC = document; }
        }
        location.replace(target);
        return null;
    }

    function challenged() {
        return !!document.querySelector("#challenge-stage, #challenge-form, #cf-challenge-running, input[name='cf-turnstile-response']")
                || /just a moment|checking your browser|verify you are human|请稍候|验证您是否为真人/i.test(document.title || "");
    }
    function sendResult() {
        if (sent || busy) return;
        if (!spider[method]) { deliver({list: [], msg: "请求参数异常，请重试"}); return; }
        if (method === "playerContent") {
            // 直链解析走原生 HTTP，不依赖所在页面内容；仅在验证页时等待（Pages 页正常不会出现）。
            // ST 只需要一个 supjav.com 源的页面做跳转（Cloudflare 验证页同样是 supjav.com 源），不等待验证。
            const isSt = ((playerMedium().ext || {}).replace || {}).line === "ST";
            if (!isSt && challenged() && Date.now() - startedAt < 60000) {
                cfGate.tick(true);
                return;
            }
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
        const waiting = Date.now() - startedAt;
        const result = spider[method].apply(spider, args);
        const hasContent = method === "homeContent" ? result.class.length > 0
                : method === "detailContent" ? !!(result.list[0] && result.list[0].vod_play_data)
                : result.list.length > 0;
        if (hasContent) {
            // supjav.com 真实页面（多为刚过 CF 验证后的回跳）：等 load 完成再留 1.5 秒，让 CF 页内信标/Cookie 写入完成再交结果。
            if (/^https:\/\/supjav\.com\//.test(location.href || "")) {
                if (document.readyState !== "complete") return;
                if (!settleAt) { settleAt = Date.now() + 1500; setTimeout(sendResult, 1600); }
                if (Date.now() < settleAt) return;
            }
            deliver(result);
            return;
        }
        if (challenged()) {
            cfGate.tick(true);
            if (Date.now() - cfGate.seenAt() < 60000) return;
            deliver({list: [], msg: "站点验证未完成，请在页面完成验证后重试"});
            return;
        }
        cfGate.tick(false);
        if (method === "detailContent" && waiting < 12000) return;
        if ((method === "homeContent" ? !result.class.length
                : (method === "categoryContent" || method === "searchContent") && !result.list.length)
                && waiting < 25000) return;
        result.msg = method === "detailContent" && document.readyState === "complete"
                ? "没有可用线路（仅支持 EVS/VAS/FST/ST）"
                : document.readyState === "complete" ? "当前页面没有匹配内容" : "页面加载超时，请检查网络后重试";
        deliver(result);
    }

    // 非 streamtape 页保持原 document-idle 时机：load 之后才开始轮询。
    let poller = 0;
    function start() {
        poller = setInterval(sendResult, 500);
        sendResult();
    }
    if (document.readyState === "complete") start();
    else if (typeof unsafeWindow !== "undefined" && unsafeWindow.addEventListener) {
        unsafeWindow.addEventListener("load", start, {once: true});
    } else start();
    }
})();
