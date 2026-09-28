// ==UserScript==
// @name         AirAV
// @namespace    luoyuqiuspider
// @version      1.0.0
// @match        https://airav.io/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const started = performance.timeOrigin || Date.now();
    let sent = false, shown = false;

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
        if (challenged && !shown) { shown = true; GmSpiderInject.ShowWebview(); }
        let result = method === 'detailContent' ? detail(args[0]) : {list: videos()};
        if (method === 'homeContent') result.class = [];
        const ready = method === 'detailContent' ? !!result.list[0].vod_play_url : result.list.length > 0;
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
