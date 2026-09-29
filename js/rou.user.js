// ==UserScript==
// @name         Rou
// @namespace    luoyuqiuspider
// @version      1.0.5
// @match        https://rou.video/*
// @grant        unsafeWindow
// ==/UserScript==
(function () {
    const args = JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const started = performance.timeOrigin || Date.now();
    let sent = false, busy = false, htmlPromise;
    const categories = [
        ['series', '劇集庫'], ['v', '全部'], ['t/自拍流出', '自拍流出'], ['t/國產AV', '國產AV'],
        ['t/探花', '探花'], ['t/日本', '日本'], ['t/麻豆傳媒', '麻豆傳媒'],
        ['t/OnlyFans', 'OnlyFans']
    ].map(([path, type_name]) => ({type_id: path.split('/').map(encodeURIComponent).join('/'), type_name}));
    const sort = [{key: 'order', name: '排序', value: [
        {n: '最新發布', v: 'createdAt'}, {n: '最多觀看', v: 'viewCount'},
        {n: '最多喜歡', v: 'likeCount'}
    ]}];
    const seriesFilters = [
        {key: 's', name: '排序', value: [
            {n: '最新更新', v: ''}, {n: '最多觀看', v: 'hot'},
            {n: '最多喜歡', v: 'likes'}, {n: '集數最多', v: 'most'}
        ]},
        {key: 'f', name: '狀態', value: [
            {n: '全部', v: ''}, {n: '連載中', v: 'ongoing'},
            {n: '已完結', v: 'completed'}, {n: '本週更新', v: 'fresh'}
        ]},
        {key: 'tag', name: '題材', value: [
            {n: '全部', v: ''}, ...['AI短劇', '現代', '都市', '熟女', '大男主', '後宮', '大女主角', '綠帽']
                .map(n => ({n, v: encodeURIComponent(n)}))
        ]}
    ];

    function pageCount(root = document) {
        let count = 1;
        root.querySelectorAll('main a[href*="page="]').forEach(function (link) {
            const page = Number(new URL(link.href).searchParams.get('page'));
            if (page > count) count = page;
        });
        return count;
    }

    function videos(root = document) {
        const seen = new Set();
        return [...root.querySelectorAll('a[href^="/v/"]')].map(function (link) {
            const image = link.querySelector('img');
            const id = new URL(link.href).pathname.split('/')[2];
            const name = link.querySelector('.clamp-2')?.textContent.trim() || image?.alt || '';
            if (!id || !name || seen.has(id)) return null;
            seen.add(id);
            return {vod_id: 'v/' + id, vod_name: name, vod_pic: image?.src || ''};
        }).filter(Boolean);
    }

    function series(root = document) {
        const seen = new Set();
        return [...root.querySelectorAll('main a[href^="/s/"]')].map(function (link) {
            const id = new URL(link.href).pathname.split('/')[2];
            const name = link.querySelector('h3')?.textContent.trim();
            if (!id || !name || seen.has(id)) return null;
            seen.add(id);
            return {vod_id: 's/' + id, vod_name: name, vod_pic: link.querySelector('img')?.src || ''};
        }).filter(Boolean);
    }

    async function search() {
        const url = new URL(location.href);
        url.searchParams.set('tab', 'series');
        const response = await fetch(url.href, {credentials: 'same-origin'}).catch(() => null);
        const seriesPage = response?.ok ? new DOMParser().parseFromString(await response.text(), 'text/html') : null;
        return {list: [...videos(), ...(seriesPage ? series(seriesPage) : [])],
            pagecount: Math.max(pageCount(), seriesPage ? pageCount(seriesPage) : 1)};
    }

    async function playUrl() {
        const pattern = /\bev:\$R\[\d+\]=\{d:"([A-Za-z0-9+/=]+)",k:(\d+)\}/;
        let match = [...document.scripts].map(script => script.textContent.match(pattern)).find(Boolean);
        if (!match) {
            htmlPromise ||= fetch(location.href, {credentials: 'same-origin'}).then(response => response.ok ? response.text() : '').catch(() => '');
            match = (await htmlPromise).match(pattern);
        }
        if (!match) return '';
        try {
            const decoded = [...atob(match[1])].map(char => String.fromCharCode(char.charCodeAt(0) - Number(match[2]))).join('');
            const path = JSON.parse(decoded).videoUrl;
            const url = new URL(path, location.origin);
            return url.origin === location.origin && url.pathname.startsWith('/api/hls/') ? url.href : '';
        } catch (_) { return ''; }
    }

    async function detail(ids) {
        const name = document.querySelector('meta[property="og:title"]')?.content || document.title;
        if (location.pathname?.startsWith('/s/')) {
            const episodes = [...document.querySelectorAll('main a[href^="/v/"]')].map(function (link) {
                const number = link.textContent.trim().match(/^第\s*(\d+)\s*集/);
                const id = new URL(link.href).pathname.split('/')[2];
                return number && id ? {number: number[1], id} : null;
            }).filter(Boolean);
            return {list: [{vod_id: ids[0], vod_name: name,
                vod_pic: document.querySelector('meta[property="og:image"]')?.content || '',
                vod_play_from: 'Rou 劇集',
                vod_play_url: episodes.map(item => '第' + item.number + '集$' + location.origin + '/api/hls/' + item.id).join('#')} ]};
        }
        const url = await playUrl();
        return {list: [{vod_id: ids[0], vod_name: name,
            vod_pic: document.querySelector('meta[property="og:image"]')?.content || '',
            vod_play_from: 'Rou', vod_play_url: url ? '播放$' + url : ''}]};
    }

    async function tick() {
        if (sent || busy) return;
        busy = true;
        const waiting = Date.now() - started;
        if (method === 'searchContent' && !document.querySelector('#page-search') && waiting < 25000) {
            busy = false;
            return;
        }
        let result = method === 'homeContent'
            ? {list: [], class: categories, filters: Object.fromEntries(categories.map(({type_id}) =>
                [type_id, type_id === 'series' ? seriesFilters : sort]))}
            : method === 'detailContent' ? await detail(args[0])
                : method === 'searchContent' ? await search()
                : {list: location.pathname === '/series' ? series() : videos()};
        if (method === 'categoryContent') result.pagecount = pageCount();
        const ready = method === 'homeContent' || method === 'searchContent' || (method === 'detailContent'
            ? !!result.list[0].vod_play_url : result.list.length > 0);
        if (!ready && waiting < 25000) { busy = false; return; }
        if (!ready) result = {list: [], msg: '页面未获取到可播放内容'};
        sent = true;
        clearInterval(timer);
        GmSpiderInject.HideWebview();
        GmSpiderInject.SetSpiderResult(JSON.stringify(result));
    }

    const timer = setInterval(tick, 500);
    tick();
})();
