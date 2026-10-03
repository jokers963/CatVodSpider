// ==UserScript==
// @name         MemoJav
// @namespace    luoyuqiuspider
// @version      1.0.1
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
// 本站无站内搜索（搜索框跳 Google site:），搜索支持：番号直查（自动纠大小写/空格/补 hyphen）+ 女优英文名直查 /actress/{slug}
(function () {
    const args = JSON.parse(GmSpiderInject.GetSpiderArgs());
    const method = args.shift();
    const started = performance.timeOrigin || Date.now();
    const ORIGIN = 'https://memojav.org';
    let sent = false, busy = false;

    // 分类页兜底（/categories/ 拉取失败时用）
    const fallbackCats = [
        ['categories/big-tits', 'Big Tits'],
        ['categories/beautiful-girl', 'Beautiful Girl'],
        ['categories/mature-woman', 'Mature Woman'],
        ['categories/married-woman', 'Married Woman'],
        ['categories/schoolgirl', 'Schoolgirl'],
        ['categories/creampie', 'Creampie'],
        ['categories/uniform', 'Uniform'],
        ['categories/cosplay', 'Cosplay'],
        ['categories/massage', 'Massage'],
        ['categories/nurse', 'Nurse']
    ];

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

    // 全站分类动态拉取（/categories/，约 260 个）
    async function home() {
        const cats = [{type_id: '', type_name: '最新视频'}];
        const doc = await fetchDoc(ORIGIN + '/categories/');
        if (doc) {
            const seen = new Set();
            doc.querySelectorAll('a[href^="/categories/"]').forEach(function (a) {
                const slug = new URL(a.href, ORIGIN).pathname.split('/')[2];
                const name = (a.textContent || '').trim();
                if (slug && name && !seen.has(slug)) {
                    seen.add(slug);
                    cats.push({type_id: 'categories/' + slug, type_name: name});
                }
            });
        }
        if (cats.length <= 1) {
            fallbackCats.forEach(([type_id, type_name]) => cats.push({type_id, type_name}));
        }
        return {class: cats, list: []};
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

    function isVideoPage(doc, id) {
        const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(esc, 'i');
        return re.test(doc.title || '') || re.test(
            doc.querySelector('meta[property="og:title"]')?.content || '');
    }

    function singleResult(doc, id) {
        const name = doc.querySelector('meta[property="og:title"]')?.content?.trim() || id;
        const pic = doc.querySelector('meta[property="og:image"]')?.content || '';
        return {list: [{vod_id: id, vod_name: name, vod_pic: pic}], pagecount: 1};
    }

    async function search(key, quick) {
        const raw = String(key || '').trim();
        const noMsg = {list: [], pagecount: 1};
        const msg = quick ? undefined : '未找到（仅支持番号 / 女优英文名搜索）';
        if (!raw) return noMsg;
        // 1) 番号直查：纠大小写、去空格
        const id = raw.toUpperCase().replace(/\s+/g, '');
        const candidates = [id];
        const m = id.match(/^([A-Z]+)(\d+[A-Z]*)$/);
        if (m && !id.includes('-')) candidates.push(m[1] + '-' + m[2]); // SDJS381 → SDJS-381
        for (const cid of candidates) {
            const doc = await fetchDoc(absUrl('/video/' + encodeURIComponent(cid)));
            if (doc && isVideoPage(doc, cid)) return singleResult(doc, cid);
        }
        // 2) 女优英文名直查：/actress/{slug}
        const slug = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (slug) {
            const adoc = await fetchDoc(absUrl('/actress/' + encodeURIComponent(slug)));
            if (adoc) {
                const list = videos(adoc);
                if (list.length) return {list: list, pagecount: pageCount(adoc)};
            }
        }
        return {list: [], pagecount: 1, msg};
    }

    async function tick() {
        if (sent || busy) return;
        busy = true;
        const waiting = Date.now() - started;
        let result;
        if (method === 'homeContent') {
            result = await home();
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
