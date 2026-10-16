// ==UserScript==
// @name         AirAV
// @namespace    luoyuqiuspider
// @version      1.0.0-cfgrace
// @match        https://airav.io/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const started = performance.timeOrigin || Date.now();
    let sent = false;
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
    // ==LYQ-CF-GRACE-END==
    const cfGate = lyqCfGate();

    function videos() {
        const seen = new Set();
        return [...document.querySelectorAll('.card a[href*="/video?hid="]')].map(function (link) {
            const id = new URL(link.href).searchParams.get('hid');
            const card = link.closest('.card');
            const image = card?.querySelector('img');
            const name = card?.querySelector('h5')?.textContent.trim() || image?.alt || '';
            if (!id || !name || seen.has(id)) return null;
            seen.add(id);
            return {vod_id: id, vod_name: name, vod_pic: image?.src || ''};
        }).filter(Boolean);
    }

    function detail(ids) {
        const media = [...document.querySelectorAll('script[type="application/ld+json"]')].map(function (script) {
            try { return JSON.parse(script.textContent); } catch (_) { return null; }
        }).find(data => data?.['@type'] === 'VideoObject' && /^https:\/\/[^\s]+\.m3u8(?:\?|$)/i.test(data.contentUrl || ''));
        const name = document.querySelector('meta[property="og:title"]')?.content || document.title;
        return {list: [{vod_id: ids[0], vod_name: name,
            vod_pic: document.querySelector('meta[property="og:image"]')?.content || '',
            vod_play_from: 'AirAV', vod_play_url: media ? '播放$' + media.contentUrl : ''}]};
    }

    function tick() {
        if (sent) return;
        const waiting = Date.now() - started;
        const challenged = /just a moment|checking your browser|安全验证|驗證/i.test(document.title)
                || !!document.querySelector('#challenge-stage, #challenge-form, input[name="cf-turnstile-response"]');
        let result = method === 'detailContent' ? detail(args[0]) : {list: videos()};
        if (method === 'homeContent') result.class = [];
        const ready = method === 'detailContent' ? !!result.list[0].vod_play_url : result.list.length > 0;
        cfGate.tick(challenged && !ready);
        if (!ready && waiting < 25000) return;
        if (!ready) result = {list: [], msg: challenged ? '站点验证未完成，请手动完成后重试' : '页面未获取到可播放内容'};
        sent = true;
        clearInterval(timer);
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    const timer = setInterval(tick, 500);
    tick();
})();
