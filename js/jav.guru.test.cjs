// jav.guru（原站，测试配置）适配脚本离线检查。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(__dirname, 'jav.guru.user.js'), 'utf8');

function run(spArgs, href, {fetchImpl, gm, doc} = {}) {
    let resolveR; const got = new Promise(r => { resolveR = r; });
    let replaced = '';
    const fetched = [], gmCalls = [];
    const win = {fetch: fetchImpl ? (u, o) => { fetched.push(u); return fetchImpl(u, o); } : undefined};
    vm.runInNewContext(src, {
        document: doc || {readyState: 'complete', title: '', querySelector: () => null, querySelectorAll: () => []},
        location: {href, hash: href.includes('#') ? href.slice(href.indexOf('#')) : '', replace: u => { replaced = u; resolveR(null); }},
        navigator: {userAgent: 'UA'}, Date, URL, Promise, JSON, Buffer, unsafeWindow: win,
        DOMParser: function () { this.parseFromString = () => doc; },
        GmSpiderInject: {GetSpiderArgs: () => JSON.stringify(spArgs), HideWebview() {}, ShowWebview() {}, SetSpiderResult: v => resolveR(JSON.parse(v))},
        GM_xmlhttpRequest: d => { gmCalls.push([d.url, d.headers.Referer]); const r = gm ? gm(d.url) : null; r ? d.onload(r) : d.onerror({}); },
        setInterval: () => 1, clearInterval() {}, setTimeout: () => 1
    });
    return got.then(r => ({r, replaced, fetched, gmCalls}));
}

(async () => {
    // 配置
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'json/luoyuqiu-javguru-test.json'), 'utf8'));
    assert.equal(cfg.sites.length, 1);
    const site = cfg.sites[0];
    assert.equal(site.key, 'jav_guru'); assert.equal(site.name, '🎬 JavGuru（测试）');
    assert.match(site.ext.userScript, /\/js\/jav\.guru\.user\.js\?v=\d+$/);
    assert.equal(site.ext.subtitleLibrary, 'https://pub-662c4b411cfb4cf69f52f71f22140341.r2.dev/');
    assert.equal(site.ext.spider.searchContent.loadUrl, 'https://jav.guru/robots.txt#/page/${pg:-1}/?s=${key}');
    assert.equal(site.ext.spider.categoryContent.loadUrl, 'https://jav.guru/robots.txt#/category/${tid}/page/${pg:-1}/');
    assert.equal(site.ext.spider.playerContent.loadUrl, 'https://jav.guru/robots.txt');
    assert.ok(site.ext.webViewSettings.blockList.some(u => u.includes('pemsrv.com')));
    const formal = JSON.parse(fs.readFileSync(path.join(root, 'json/luoyuqiu.json'), 'utf8'));
    assert.ok(!formal.sites.some(s => s.key === 'jav_guru'), 'jav.guru 原站暂不进正式配置');
    assert.equal(formal.sites.find(s => s.key === 'javguru').name, '🎬 Upload18');
    assert.ok(!/\.click\(\)|dispatchEvent|start_player\(/.test(src.replace(/\/\/.*$/gm, '')), 'no programmatic clicks');

    const listHtml = '<div class="inside-article">';
    const card = (id, title) => ({querySelector: s => s.startsWith('.imgg') ? {getAttribute: () => `https://jav.guru/${id}/slug-${id}/`}
        : s === 'img' ? {getAttribute: k => (k === 'src' ? 'https://cdn.example/p.jpg' : null)}
        : s === 'h2 a' ? {textContent: title} : s === '.date' ? {textContent: '13 Oct, 26'} : null});
    const listDoc = cards => ({readyState: 'complete', title: '', querySelector: () => null,
        querySelectorAll: q => q === '.inside-article' ? cards : q === 'a[href]' ? [{getAttribute: () => '/page/54/?s=SSIS'}] : []});
    const okFetch = () => Promise.resolve({ok: true, text: () => Promise.resolve(listHtml)});

    // 搜索分页 + 关键词编码
    for (const [kw, pg, want] of [['SSIS', '2', 'https://jav.guru/page/2/?s=SSIS'], ['三上 a&b#', '1', 'https://jav.guru/?s=' + encodeURIComponent('三上 a&b#')]]) {
        const s = await run(['searchContent', kw, false, pg], 'https://jav.guru/robots.txt#/page/' + pg + '/?s=' + kw,
            {fetchImpl: okFetch, doc: listDoc([card(1062787, '[START-660] x')])});
        assert.deepEqual(s.fetched, [want]);
        assert.equal(s.r.page, +pg); assert.equal(s.r.pagecount, 54);
        assert.equal(s.r.list[0].vod_id, 'https://jav.guru/1062787/slug-1062787/');
        assert.deepEqual(s.gmCalls, []);
    }
    // 分类第 1 页不带 /page/
    const c1 = await run(['categoryContent', 'jav', '1', true, {}], 'https://jav.guru/robots.txt#/category/jav/page/1/',
        {fetchImpl: okFetch, doc: listDoc([card(1, 'A')])});
    assert.deepEqual(c1.fetched, ['https://jav.guru/category/jav/']);
    // 无结果 → 空列表，pagecount = 当前页
    const empty = await run(['searchContent', 'zzz', false, '1'], 'https://jav.guru/robots.txt#/page/1/?s=zzz', {fetchImpl: okFetch, doc: listDoc([])});
    assert.deepEqual(empty.r.list, []); assert.equal(empty.r.pagecount, 1);
    // CF 验证页 → 整页跳转目标页
    const cf = await run(['categoryContent', 'jav', '2', true, {}], 'https://jav.guru/robots.txt#/category/jav/page/2/',
        {fetchImpl: () => Promise.resolve({ok: false, text: () => Promise.resolve('<title>Just a moment...</title>')})});
    assert.equal(cf.replaced, 'https://jav.guru/category/jav/page/2/');

    // 详情：按钮文字识别线路，脚本内 base64 网关地址；番号取 Code 行。
    const gw = id => 'https://jav.guru/searcho/?' + id + 'd=abc&bg=x';
    const b64 = s => Buffer.from(s).toString('base64');
    const scriptText = 'var aaa = {"iframe_style":"top:0;left:0;","iframe_url":"' + b64(gw('x')) + '"};var bbb = {"a":"b;c","iframe_url":"' + b64(gw('e')) + '"};var ccc = {"iframe_url":"' + b64(gw('t')) + '"};';
    const btn = (id, t) => ({getAttribute: () => id, textContent: t});
    const li = t => ({textContent: t, querySelectorAll: () => t.startsWith('Actress') ? [{textContent: 'Aozora Hikari'}] : []});
    const detailDoc = {readyState: 'complete', title: 'x',
        querySelector: s => s.startsWith('h1') ? {textContent: '[START-660] Title'} : s === '.large-screenimg img' ? {getAttribute: () => 'https://cdn.example/c.jpg'} : null,
        querySelectorAll: s => s === 'script' ? [{textContent: scriptText}] : s === '.infoleft li' ? [li('Code: START-660'), li('Actress: Aozora Hikari')]
            : s === 'a[data-localize]' ? [btn('aaa', 'STREAM SB'), btn('bbb', 'STREAM LU'), btn('ccc', 'STREAM TV')] : []};
    const page = 'https://jav.guru/1062787/start-660/';
    const d = await run(['detailContent', [page]], 'https://jav.guru/robots.txt#' + page, {fetchImpl: okFetch, doc: detailDoc});
    const v = d.r.list[0];
    assert.equal(v.vod_actor, 'Aozora Hikari');
    assert.deepEqual(v.vod_play_data.map(x => x.from), ['START-660 SB', 'START-660 LU（测试）']);
    assert.deepEqual(v.vod_play_data[0].media[0].ext.replace, {page, gw: gw('x'), line: 'SB'});

    // 播放：网关页 → 计算真实地址（3 段 data 拼接后反转）→ 302 嵌入页 → hls4 master.m3u8（同域相对路径）。
    const gwHtml = '<div id="c1" class="stream-box" data-k1="abc" data-k2="def" data-k3="ghi"><iframe></iframe></div>'
        + "<script>window.cfg = { cid: 'c1', base: 'https://jav.guru/searcho/', rtype: 'x', cls: 'v', keys: ['data-k1', 'data-k2', 'data-k3'] };</script>";
    const media = JSON.stringify({name: '播放', type: 'webview', ext: {replace: {page, gw: gw('x'), line: 'SB'}}});
    const p = await run(['playerContent', 'START-660 SB', media], 'https://jav.guru/robots.txt', {gm: u =>
        u === gw('x') ? {status: 200, responseText: gwHtml, finalUrl: u}
        : u === 'https://jav.guru/searcho/?xr=ihgfedcba' ? {status: 200, finalUrl: 'https://javclan.example/e/qq', responseText: 'jwplayer({"hls4":"/stream/T/master.m3u8","hls2":"https://cdn.example/hls2/master.m3u8?t=1"})'}
        : null});
    assert.deepEqual(p.gmCalls.map(c => c[0]), [gw('x'), 'https://jav.guru/searcho/?xr=ihgfedcba']);
    assert.equal(p.gmCalls[0][1], page);
    assert.deepEqual(p.r, {type: 'url', ext: {url: 'https://javclan.example/stream/T/master.m3u8',
        header: {'User-Agent': 'UA', Referer: 'https://javclan.example/', Origin: 'https://javclan.example'}}});
    // 原生请求网关被拦 → 页内同源 fetch 网关页
    const p2 = await run(['playerContent', 'x', media], 'https://jav.guru/robots.txt', {
        fetchImpl: () => Promise.resolve({ok: true, text: () => Promise.resolve(gwHtml)}),
        gm: u => u.includes('xr=') ? {status: 200, finalUrl: 'https://lulu.example/e/z', responseText: 'sources:[{file:"https://cdn.example/hls2/x_h/master.m3u8?t=2"}]'} : null});
    assert.deepEqual(p2.fetched, [gw('x')]);
    assert.equal(p2.r.ext.url, 'https://cdn.example/hls2/x_h/master.m3u8?t=2');
    // 全部失败 → 提示换线路
    const p3 = await run(['playerContent', 'x', media], 'https://jav.guru/robots.txt', {});
    assert.equal(p3.r.msg, '播放地址解析失败，请换线路重试');
    console.log('jav.guru adapter checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
