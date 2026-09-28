// ==UserScript==
// @name         Hanime1
// @namespace    luoyuqiuspider
// @version      1.0.1
// @match        https://hanime1.me/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const started = performance.timeOrigin || Date.now();
    let sent = false, shown = false;
    // ponytail: display the site's navigation only; category loading needs a separate request.
    const categories = ['里番', '泡面番', 'Motion Anime', '3DCG', '2.5D', '2D动画',
        'AI生成', 'MMD', 'Cosplay', '新番预告']
        .map((type_name, index) => ({type_id: `nav-${index + 1}`, type_name}));

    function videos() {
        const seen = new Set();
        return [...document.querySelectorAll('a.video-link[href*="/watch"]')].map(function (link) {
            const id = new URL(link.href).searchParams.get('v');
            const name = link.querySelector('.title')?.textContent.trim() || link.querySelector('img')?.alt || '';
            if (!id || !name || seen.has(id)) return null;
            seen.add(id);
            return {vod_id: id, vod_name: name, vod_pic: link.querySelector('img')?.src || ''};
        }).filter(Boolean);
    }

    function detail(ids) {
        const sources = [...document.querySelectorAll('video source[type="video/mp4"]')]
                .filter(source => /^https:\/\//i.test(source.src))
                .sort((a, b) => Number(b.getAttribute('size') || 0) - Number(a.getAttribute('size') || 0));
        const name = document.querySelector('meta[property="og:title"]')?.content || document.title;
        return {list: [{vod_id: ids[0], vod_name: name,
            vod_pic: document.querySelector('meta[property="og:image"]')?.content || '',
            vod_play_from: 'Hanime1',
            vod_play_url: sources.map(source => (source.getAttribute('size') || '播放') + '$' + source.src).join('#')}]};
    }

    function tick() {
        if (sent) return;
        const waiting = Date.now() - started;
        const challenged = /just a moment|checking your browser|安全验证|驗證/i.test(document.title)
                || !!document.querySelector('#challenge-stage, #challenge-form, input[name="cf-turnstile-response"]');
        if (challenged && !shown) { shown = true; GmSpiderInject.ShowWebview(); }
        let result = method === 'detailContent' ? detail(args[0]) : {list: videos()};
        if (method === 'homeContent') result.class = categories;
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
