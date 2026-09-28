// ==UserScript==
// @name         Hanime1
// @namespace    luoyuqiuspider
// @version      3.0.0
// @match        https://hanime1.me/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const started = performance.timeOrigin || Date.now();
    let sent = false, shown = false;
    const categories = [
        ['裏番', '里番'], ['泡麵番', '泡面番'], ['Motion Anime', 'Motion Anime'],
        ['3DCG', '3DCG'], ['2.5D', '2.5D'], ['2D動畫', '2D动画'],
        ['AI生成', 'AI生成'], ['MMD', 'MMD'], ['Cosplay', 'Cosplay'], ['新番預告', '新番预告']
    ].map(([id, type_name]) => ({type_id: encodeURIComponent(id), type_name}));

    function filters() {
        const values = (items) => items.map(([n, v]) => ({n, v: v ? encodeURIComponent(v) : ''}));
        const list = [
            {key: 'sort', name: '排序', value: values([
                ['最新上市', '最新上市'], ['最新上传', '最新上傳'], ['本日排行', '本日排行'],
                ['本周排行', '本週排行'], ['本月排行', '本月排行'], ['观看次数', '觀看次數'],
                ['点赞比例', '讚好比例'], ['时长最长', '時長最長'], ['他们在看', '他們在看']
            ])},
            {key: 'date', name: '发布日期', value: values([
                ['全部', ''], ['过去 24 小时', '過去 24 小時'], ['过去 2 天', '過去 2 天'],
                ['过去 1 周', '過去 1 週'], ['过去 1 个月', '過去 1 個月'],
                ['过去 3 个月', '過去 3 個月'], ['过去 1 年', '過去 1 年']
            ])},
            {key: 'duration', name: '时长', value: values([
                ['全部', ''], ['1 分钟以上', '1 分鐘 +'], ['5 分钟以上', '5 分鐘 +'],
                ['10 分钟以上', '10 分鐘 +'], ['20 分钟以上', '20 分鐘 +'],
                ['30 分钟以上', '30 分鐘 +'], ['60 分钟以上', '60 分鐘 +'],
                ['0–10 分钟', '0 - 10 分鐘'], ['0–20 分钟', '0 - 20 分鐘']
            ])}
        ];
        return Object.fromEntries(categories.map(({type_id}) => [type_id, list]));
    }

    function videos() {
        const seen = new Set();
        return [...document.querySelectorAll('a[href*="/watch?v="]')].map(function (link) {
            const id = new URL(link.href).searchParams.get('v');
            const name = link.querySelector('.title, .home-rows-videos-title')?.textContent.trim()
                || link.querySelector('img')?.alt || '';
            if (!id || !name || seen.has(id)) return null;
            seen.add(id);
            return {vod_id: id, vod_name: name, vod_pic: link.querySelector('img')?.src || '',
                vod_remarks: link.querySelector('.duration')?.textContent.trim() || ''};
        }).filter(Boolean);
    }

    function pageCount() {
        let count = 1;
        document.querySelectorAll('a[href*="page="]').forEach(function (link) {
            const page = Number(new URL(link.href).searchParams.get('page'));
            if (page > count) count = page;
        });
        return count;
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
        let result = method === 'homeContent' ? {list: [], class: categories, filters: filters()}
            : method === 'detailContent' ? detail(args[0]) : {list: videos()};
        if (method === 'categoryContent' || method === 'searchContent') result.pagecount = pageCount();
        const ready = method === 'homeContent' || (method === 'detailContent'
            ? !!result.list[0].vod_play_url : result.list.length > 0);
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
