// ==UserScript==
// @name         Rou
// @namespace    luoyuqiuspider
// @version      1.0.1
// @match        https://rou.video/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const started = performance.timeOrigin || Date.now();
    let sent = false;

    function videos() {
        const seen = new Set();
        return [...document.querySelectorAll('a[href^="/v/"]')].map(function (link) {
            const image = link.querySelector('img');
            const id = new URL(link.href).pathname.split('/')[2];
            const name = link.querySelector('.clamp-2')?.textContent.trim() || image?.alt || '';
            if (!id || !name || seen.has(id)) return null;
            seen.add(id);
            return {vod_id: id, vod_name: name, vod_pic: image.src};
        }).filter(Boolean);
    }

    function playUrl() {
        const match = [...document.scripts].map(script => script.textContent.match(/\bev:\$R\[\d+\]=\{d:"([A-Za-z0-9+/=]+)",k:(\d+)\}/)).find(Boolean);
        if (!match) return '';
        try {
            const decoded = [...atob(match[1])].map(char => String.fromCharCode(char.charCodeAt(0) - Number(match[2]))).join('');
            const path = JSON.parse(decoded).videoUrl;
            const url = new URL(path, location.origin);
            return url.origin === location.origin && url.pathname.startsWith('/api/hls/') ? url.href : '';
        } catch (_) { return ''; }
    }

    function detail(ids) {
        const name = document.querySelector('meta[property="og:title"]')?.content || document.title;
        const url = playUrl();
        return {list: [{vod_id: ids[0], vod_name: name,
            vod_pic: document.querySelector('meta[property="og:image"]')?.content || '',
            vod_play_from: 'Rou', vod_play_url: url ? '播放$' + url : ''}]};
    }

    function tick() {
        if (sent) return;
        const waiting = Date.now() - started;
        let result = method === 'detailContent' ? detail(args[0]) : {list: videos()};
        if (method === 'homeContent') result.class = [];
        const ready = method === 'detailContent' ? !!result.list[0].vod_play_url : result.list.length > 0;
        if (!ready && waiting < 25000) return;
        if (!ready) result = {list: [], msg: '页面未获取到可播放内容'};
        sent = true;
        clearInterval(timer);
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    const timer = setInterval(tick, 500);
    tick();
})();
