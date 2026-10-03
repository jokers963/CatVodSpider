// ==UserScript==
// @name         MemoJav
// @namespace    luoyuqiuspider
// @version      1.0.0
// @match        https://memojav.org/*
// @grant        unsafeWindow
// ==/UserScript==
// MemoJav (memojav.org) 自建站：JW Player + /hls/get_video_info.php
// 签名算法已逆向（纯客户端时间戳算法，无密钥）：video_sig()
//   t = Date.now(); sig = btoa(String(t)).substr(len-12, 10)
//   sts = 1 + Σ(sig.charCodeAt(i) * i * 1743), i = 0..9
//   GET /hls/get_video_info.php?id={番号}&sig={sig}&sts={sts}
//   → for (;;);{"type":"hls","url":"https%3A%2F%2Fvideo10.memojav.net%2Fstream%2F{id}%2Fmaster.m3u8","success":true}
// 实测：curl 复现签名调接口成功，m3u8 (video10.memojav.net) 200 可读，无过期概念
// 本站无站内搜索（搜索框跳 Google site:），搜索仅支持番号直查 /video/{番号}
(function () {
    const args = JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const started = performance.timeOrigin || Date.now();
    const ORIGIN = 'https://memojav.org';
    let sent = false, busy = false;

    const categories = [
        ['', '最新视频'],
        ['categories/big-tits', '大胸'],
        ['categories/beautiful-girl', '美少女'],
        ['categories/mature-woman', '熟女'],
        ['categories/married-woman', '人妻'],
        ['categories/schoolgirl', '学生妹'],
        ['categories/creampie', '中出'],
        ['categories/uniform', '制服'],
        ['categories/cosplay', 'Cosplay'],
        ['categories/massage', '按摩']
    ].map(([type_id, type_name]) => ({type_id, type_name}));

    function absUrl(path) {
        return path.startsWith('http') ? path : ORIGIN + (path.startsWith('/') ? path : '/' + path);
    }

    function videos(root) {
        const seen = new Set();
        return [...root.querySelectorAll('a[href^="/video/"]')].map(function (link) {
            const id = new URL(link.href, ORIGIN).pathname.split('/')[2];
            if (!id || seen.has(id)) return null;
            seen.add(id);
            const image = link.querySelector('img');
            const name = (link.textContent || '').trim().split('\n')[0].trim()
                || image?.alt?.trim() || id;
            return {vod_id: id, vod_name: name, vod_pic: image?.src || ''};
        }).filter(Boolean);
    }

    function pageCount(root) {
        let count = 1;
        root.querySelectorAll('a[href*="page-"]').forEach(function (link) {
            const m = (link.getAttribute('href') || '').match(/page-(\d+)/);
            if (m) count = Math.max(count, Number(m[1]));
        });
        return count;
    }

    async function fetchDoc(url) {
        const response = await fetch(url, {credentials: 'same-origin'}).catch(() => null);
        if (!response || !response.ok) return null;
        return new DOMParser().parseFromString(await response.text(), 'text/html');
    }

    // 逆向出的签名算法：纯本地时间戳，无密钥
    function videoSig() {
        const t = Date.now();
        let sig = btoa(String(t));
        sig = sig.substr(sig.length - 12, 10);
        let sts = 1;
        for (let i = 0; i < 10; i++) sts += sig.charCodeAt(i) * i * 1743;
        return 'sig=' + sig + '&sts=' + sts;
    }

    async function playUrl(id) {
        const api = ORIGIN + '/hls/get_video_info.php?id=' + encodeURIComponent(id) + '&' + videoSig();
        const response = await fetch(api, {credentials: 'same-origin'}).catch(() => null);
        if (!response || !response.ok) return '';
        let text = await response.text();
        text = text.replace(/^for\s*\(\s*;;\s*\)\s*;?/, '');
        try {
            const json = JSON.parse(text);
            if (json && json.success && json.url) return decodeURIComponent(json.url);
        } catch (_) {}
        return '';
    }

    async function detail(ids) {
        const id = ids[0];
        const name = document.querySelector('meta[property="og:title"]')?.content?.trim()
            || document.title.replace(/\s*-\s*MemoJav\s*$/, '').trim() || id;
        const pic = document.querySelector('meta[property="og:image"]')?.content || '';
        const url = await playUrl(id);
        return {list: [{
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_play_from: 'MemoJav',
            vod_play_url: url ? '播放$' + url : ''
        }]};
    }

    async function category(tid, pg) {
        pg = Number(pg) || 1;
        if (pg > 1) {
            const doc = await fetchDoc(absUrl(tid) + '/page-' + pg);
            if (!doc) return {list: [], pagecount: pg};
            return {list: videos(doc), pagecount: Math.max(pageCount(doc), pg)};
        }
        return {list: videos(document), pagecount: pageCount(document)};
    }

    // 本站无站内搜索：仅支持番号直查 /video/{番号}
    async function search(key, quick) {
        const id = String(key || '').trim().toUpperCase();
        if (!id) return {list: [], pagecount: 1};
        const doc = await fetchDoc(absUrl('/video/' + encodeURIComponent(id)));
        const msg = quick ? undefined : '未找到该番号（本站无关键词搜索）';
        if (!doc) return {list: [], pagecount: 1, msg};
        const name = doc.querySelector('meta[property="og:title"]')?.content?.trim() || id;
        // 详情页标题含番号才算命中，避免 404 软着陆页误报
        const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(esc, 'i').test(doc.title) && !new RegExp(esc, 'i').test(name)) {
            return {list: [], pagecount: 1, msg};
        }
        const pic = doc.querySelector('meta[property="og:image"]')?.content || '';
        return {list: [{vod_id: id, vod_name: name, vod_pic: pic}], pagecount: 1};
    }

    async function tick() {
        if (sent || busy) return;
        busy = true;
        const waiting = Date.now() - started;
        let result;
        if (method === 'homeContent') {
            result = {list: [], class: categories};
        } else if (method === 'categoryContent') {
            const [tid, , pg] = args;
            result = await category(tid, pg);
        } else if (method === 'detailContent') {
            result = await detail(args[0]);
        } else if (method === 'searchContent') {
            result = await search(args[0], args[1]);
        } else {
            result = {list: []};
        }
        const ready = method === 'homeContent' ? result.class.length > 0
            : method === 'detailContent' ? !!(result.list[0] && result.list[0].vod_play_url)
            : result.list.length > 0 || !!result.msg;
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
