const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function run(method, extraArgs, document, extra = {}) {
    let resolve;
    const done = new Promise(r => { resolve = r; });
    vm.runInNewContext(fs.readFileSync(__dirname + '/supjav.user.js', 'utf8'), {
        document, location: {href: 'https://supjav.com/1.html', origin: 'https://supjav.com'},
        navigator: {userAgent: 'TestUA/1.0'}, performance: {timeOrigin: Date.now()}, Date, URL, Promise, JSON,
        GmSpiderInject: {GetSpiderArgs: () => JSON.stringify([method, ...extraArgs]),
            HideWebview() {}, ShowWebview() {}, SetSpiderResult: v => resolve(JSON.parse(v))},
        setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, ...extra
    });
    return done;
}

// Minimal Dean Edwards packer, so the test carries no real signed URL.
function pack(src) {
    const words = [...new Set(src.match(/\b\w+\b/g))];
    const a = 36, enc = n => n.toString(36);
    const p = src.replace(/\b\w+\b/g, w => enc(words.indexOf(w)));
    return "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('"
        + p.replace(/'/g, "\\'") + "'," + a + "," + words.length + ",'" + words.join('|') + "'.split('|')))";
}

const btn = (text, link) => ({textContent: text, getAttribute: k => k === 'data-link' ? link : null});
const group = btns => ({querySelectorAll: () => btns});

async function main() {
    const home = await run('homeContent', ['true'], {readyState: 'complete', querySelectorAll: () => [], querySelector: () => null});
    assert.equal(home.class[0].type_id, 'censored-jav');
    assert.deepEqual(home.list, []);

    // Multi-CD detail: lines = EVS/FST only, episodes = CD, code reversed, ST/VOE dropped, order EVS/VAS/FST.
    const groups = [group([btn('EVS', 'abc1'), btn('ST', 'dead'), btn('VOE', 'beef')]),
                    group([btn('EVS', 'abc2'), btn('FST', 'f00d'), btn('VAS', 'cafe')])];
    const detail = await run('detailContent', [['https://supjav.com/464721.html']], {
        title: 'x', readyState: 'complete',
        querySelector: s => s === 'meta[property="og:title"]' ? {content: 'FC2PPV 4991168 Sample'} : null,
        querySelectorAll: s => s === '.cd-server' ? groups : []
    });
    const vod = detail.list[0];
    assert.equal(vod.vod_id, 'https://supjav.com/464721.html');
    assert.deepEqual(vod.vod_play_data.map(d => d.from), ['FC2PPV-4991168 EVS', 'FC2PPV-4991168 VAS', 'FC2PPV-4991168 FST']);
    assert.deepEqual(vod.vod_play_data[0].media.map(m => m.name), ['CD1', 'CD2']);
    const m0 = vod.vod_play_data[0].media[0];
    assert.equal(m0.type, 'webview');
    assert.deepEqual(m0.ext.replace, {page: 'https://supjav.com/464721.html', c: '1cba', line: 'EVS', cd: '1'});
    assert.equal(vod.vod_play_data[1].media[0].ext.replace.cd, '2');
    assert.equal(vod.vod_play_data[1].media[0].ext.replace.c, 'efac');

    // Player: GM_xmlhttpRequest follows lk1 302 → embed, unpack → hls4 absolute + embed headers.
    const embedHtml = '<script>' + pack('var links={"hls2":"https://x.acek-cdn.com/hls2/a/master.m3u8?t=1","hls4":"/stream/AbC/xyz/179/435/master.m3u8"};jwplayer("vplayer").setup({})') + '</script>';
    const calls = [];
    const gm = d => { calls.push({url: d.url, ref: d.headers.Referer});
        d.onload({status: 200, finalUrl: 'https://fc2stream.tv/e/zb1', responseText: embedHtml}); };
    const medium = JSON.stringify({name: 'CD1', type: 'webview', ext: {replace: {page: 'p', c: 'rev', line: 'FST', cd: '1'}}});
    const player = await run('playerContent', ['FST', medium, '[]'], {title: 'x', querySelector: () => null, querySelectorAll: () => []},
        {GM_xmlhttpRequest: gm});
    assert.deepEqual(calls, [{url: 'https://lk1.supremejav.com/supjav.php?c=rev', ref: 'https://supjav.com/'}]);
    assert.equal(player.type, 'url');
    assert.equal(player.ext.url, 'https://fc2stream.tv/stream/AbC/xyz/179/435/master.m3u8');
    assert.deepEqual(player.ext.header, {'User-Agent': 'TestUA/1.0', 'Referer': 'https://fc2stream.tv/', 'Origin': 'https://fc2stream.tv'});

    // Embed without player script on first hop → refetch with lk1 Referer.
    const calls2 = [];
    const gm2 = d => { calls2.push(d.headers.Referer);
        d.onload({status: 200, finalUrl: 'https://evsishere.xyz/embed/q1', responseText: calls2.length === 1 ? '<html></html>' : embedHtml}); };
    const player2 = await run('playerContent', ['EVS', medium, '[]'], {querySelector: () => null, querySelectorAll: () => []}, {GM_xmlhttpRequest: gm2});
    assert.deepEqual(calls2, ['https://supjav.com/', 'https://lk1.supremejav.com/']);
    assert.equal(player2.ext.url, 'https://evsishere.xyz/stream/AbC/xyz/179/435/master.m3u8');

    // No GM API → no click fallback any more (player page is not the detail page) → empty url + msg.
    const fb = await run('playerContent', ['FST', medium, '[]'], {querySelector: () => null, querySelectorAll: () => { throw new Error('no DOM access'); }});
    assert.equal(fb.type, 'url'); assert.equal(fb.ext.url, ''); assert.ok(fb.msg);
    const none = await run('playerContent', ['FST', medium, '[]'], {querySelector: () => null, querySelectorAll: () => []},
        {GM_xmlhttpRequest: d => d.onload({status: 200, finalUrl: 'https://evil.example/e/1', responseText: embedHtml})});
    assert.equal(none.ext.url, '');

    // VAS: lk1 302 → vvaassjjav embed → POST /api/stream JSON → streaming_url.
    const vc = [];
    const gmv = d => { vc.push(d);
        if (d.method === 'GET') d.onload({status: 200, finalUrl: 'https://vvaassjjav.xyz/e/2f6d7185d1e3#DLDSS-564', responseText: '<html></html>'});
        else d.onload({status: 200, responseText: JSON.stringify({streaming_url: 'https://s8.97bf1.com/hls/Tok/master.m3u8'})}); };
    const pv = await run('playerContent', ['VAS', medium, '[]'], {querySelector: () => null, querySelectorAll: () => []}, {GM_xmlhttpRequest: gmv});
    assert.equal(vc.length, 2);
    assert.equal(vc[1].method, 'POST');
    assert.equal(vc[1].url, 'https://vvaassjjav.xyz/api/stream');
    assert.equal(vc[1].headers.Referer, 'https://vvaassjjav.xyz/e/2f6d7185d1e3');
    assert.equal(vc[1].headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(vc[1].data), {filecode: '2f6d7185d1e3', device: 'android', codecs: []});
    assert.equal(pv.ext.url, 'https://s8.97bf1.com/hls/Tok/master.m3u8');
    assert.deepEqual(pv.ext.header, {'User-Agent': 'TestUA/1.0', 'Referer': 'https://vvaassjjav.xyz/', 'Origin': 'https://vvaassjjav.xyz'});
    // API failure (non-200 → onerror) → empty url + msg.
    const pf = await run('playerContent', ['VAS', medium, '[]'], {querySelector: () => null, querySelectorAll: () => []},
        {GM_xmlhttpRequest: d => d.method === 'GET' ? d.onload({status: 200, finalUrl: 'https://vvaassjjav.xyz/e/abc', responseText: ''}) : d.onerror({})});
    assert.equal(pf.ext.url, ''); assert.ok(pf.msg);

    const cfg = JSON.parse(fs.readFileSync(__dirname + '/../json/luoyuqiu-supjav-test.json', 'utf8'));
    const site = cfg.sites[0];
    assert.equal(site.key, 'supjav');
    assert.equal(site.ext.debug, false);
    assert.equal(site.ext.spider.playerContent.loadUrl, 'https://jokers963.github.io/CatVodSpider/');
    assert.match(site.ext.userScript, /supjav\.user\.js\?v=9$/);
    const userSrc = fs.readFileSync(__dirname + '/supjav.user.js', 'utf8');
    assert.match(userSrc, /@version\s+2\.3\.0/);
    assert.match(userSrc, /@match\s+https:\/\/jokers963\.github\.io\/CatVodSpider\/\*/);
    assert.ok(!/clickServer/.test(userSrc));
    console.log('SupJav adapter checks passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
