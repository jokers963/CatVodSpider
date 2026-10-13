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
        setInterval: () => 1, clearInterval() {}, setTimeout: (f, ms) => ms <= 2000 ? setTimeout(f, ms) : 1, ...extra
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

const userSrc0 = () => fs.readFileSync(__dirname + '/supjav.user.js', 'utf8');
const m0Probe = vod => vod.vod_play_data[0].media[0].ext.replace;

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
    assert.deepEqual(vod.vod_play_data.map(d => d.from), ['FC2PPV-4991168 EVS', 'FC2PPV-4991168 VAS', 'FC2PPV-4991168 FST', 'FC2PPV-4991168 ST']);
    assert.deepEqual(vod.vod_play_data[3].media[0].ext.replace, {page: 'https://supjav.com/464721.html', c: 'daed', line: 'ST', cd: '1', stpage: 'https://supjav.com/robots.txt'});
    assert.ok(!('stpage' in m0Probe(vod)));
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
    assert.equal(site.ext.spider.playerContent.loadUrl, '${stpage:-https://jokers963.github.io/CatVodSpider/}');
    assert.ok(site.ext.playUrlMatch.includes('https://streamtape.com/get_video*'));
    assert.ok(site.ext.playUrlMatch.includes('https://*.tapecontent.net/radosgw/*'));
    assert.match(userSrc0(), /@match\s+https:\/\/streamtape\.com\/e\/\*/);
    assert.match(site.ext.userScript, /supjav\.user\.js\?v=15$/);
    const userSrc = fs.readFileSync(__dirname + '/supjav.user.js', 'utf8');
    assert.match(userSrc, /@version\s+2\.7\.0/);
    assert.match(userSrc, /@match\s+https:\/\/jokers963\.github\.io\/CatVodSpider\/\*/);
    assert.ok(!/clickServer/.test(userSrc));
    // ST: lk1 → streamtape embed; result is bare {type:'match'}, WebView shown, then top-level jump with referrer meta; no click.
    {
        const shown = [], hidden = [], appended = []; let replaced = '';
        const stMedium = JSON.stringify({name: '播放', type: 'webview', ext: {replace: {page: 'p', c: 'rev', line: 'ST', cd: '1', stpage: 'https://supjav.com/robots.txt'}}});
        const loc = {href: 'https://supjav.com/', origin: 'https://supjav.com', replace: u => { replaced = u; }};
        let resolveR; const got = new Promise(r => { resolveR = r; });
        vm.runInNewContext(fs.readFileSync(__dirname + '/supjav.user.js', 'utf8'), {
            document: {readyState: 'complete', querySelector: () => null, querySelectorAll: () => [],
                head: {appendChild: n => appended.push(n)},
                createElement: () => { const a = {}; return {setAttribute: (k, v) => { a[k] = v; }, a}; }},
            location: loc, navigator: {userAgent: 'TestUA/1.0'}, performance: {timeOrigin: Date.now()}, Date, URL, Promise, JSON,
            GmSpiderInject: {GetSpiderArgs: () => JSON.stringify(['playerContent', 'ST', stMedium, '[]']),
                HideWebview() { hidden.push(1); }, ShowWebview() { shown.push(1); }, SetSpiderResult: v => resolveR(JSON.parse(v))},
            GM_xmlhttpRequest: d => d.onload({status: 200, finalUrl: 'https://streamtape.com/e/AbC123xyz/x.mp4', responseText: ''}),
            setInterval: () => 1, clearInterval() {}, setTimeout: () => 1
        });
        const st = await got;
        assert.deepEqual(st, {type: 'match'});
        assert.equal(shown.length, 1); assert.equal(hidden.length, 0);
        assert.equal(replaced, 'https://streamtape.com/e/AbC123xyz/x.mp4');
        assert.deepEqual(appended.map(n => n.a), [{name: 'referrer', content: 'origin'}]);
        // ST embed from lk1 that is not streamtape → empty url + msg; ST never returned as direct url for other lines.
        const bad = await run('playerContent', ['ST', stMedium, '[]'], {querySelector: () => null, querySelectorAll: () => []},
            {GM_xmlhttpRequest: d => d.onload({status: 200, finalUrl: 'https://evil.example/e/1', responseText: ''})});
        assert.equal(bad.type, 'url'); assert.equal(bad.ext.url, ''); assert.ok(bad.msg);
        const stAsFst = await run('playerContent', ['FST', medium, '[]'], {querySelector: () => null, querySelectorAll: () => []},
            {GM_xmlhttpRequest: d => d.onload({status: 200, finalUrl: 'https://streamtape.com/e/AbC123xyz/x.mp4', responseText: embedHtml})});
        assert.equal(stAsFst.type, 'url'); assert.equal(stAsFst.ext.url, '');
    }

    // On the streamtape embed page: no SetSpiderResult, no click. Ad cleanup: cfg noads/adblock=true, window.open stubbed,
    // high z-index cover + ad iframes removed, player nodes kept, CSS enlarges .play-overlay; 'playing' → mute/pause + hide.
    {
        let tick, listener; const ev = {hidden: 0, set: 0};
        const noClick = () => { throw new Error('no programmatic click'); };
        const mk = (tag, props = {}) => ({tagName: tag, id: '', className: '', click: noClick, parentNode: null, closest: () => null, ...props});
        const video = mk('VIDEO', {muted: false, paused: false, closest: () => ({}),
            addEventListener: (n, f) => { if (n === 'playing') listener = f; }, pause() { this.paused = true; }});
        const kids = [];
        const body = {get children() { return kids.slice(); }, removeChild: el => { const i = kids.indexOf(el); if (i < 0) throw new Error('not a child'); kids.splice(i, 1); el.parentNode = null; }};
        const add = el => { el.parentNode = body; kids.push(el); return el; };
        const cover = add(mk('DIV', {style: {position: 'fixed', zIndex: '300000'}}));
        const adFrame = add(mk('IFRAME'));
        const inner = add(mk('IFRAME', {id: 'innerframe'}));
        const adb = add(mk('DIV', {id: 'adb', style: {position: 'static', zIndex: 'auto'}}));
        const overlay = add(mk('DIV', {className: 'play-overlay', closest: () => ({}), style: {position: 'absolute', zIndex: '5000'}}));
        const plain = add(mk('DIV', {style: {position: 'static', zIndex: 'auto'}}));
        const styles = [];
        const cfg = {token: 't', fileid: 'f', adblock: false, noads: false, blockadblock: false};
        const sandbox = {
            document: {readyState: 'complete', body, head: {appendChild: n => styles.push(n)}, getElementById: () => null,
                createElement: () => ({}), documentElement: {},
                querySelector: s => s === 'video' ? video : null,
                querySelectorAll: s => s === 'iframe' ? kids.filter(k => k.tagName === 'IFRAME') : []},
            getComputedStyle: el => el.style || {position: 'static', zIndex: 'auto'},
            location: {href: 'https://streamtape.com/e/AbC123xyz/x.mp4'}, navigator: {userAgent: 'x'}, performance: {timeOrigin: Date.now()}, Date, URL, Promise, JSON,
            GmSpiderInject: {GetSpiderArgs: () => JSON.stringify(['playerContent', 'ST', '{}', '[]']), HideWebview() { ev.hidden++; }, ShowWebview() {}, SetSpiderResult() { ev.set++; }},
            setInterval: f => { tick = f; return 1; }, clearInterval() {}, setTimeout: () => 1,
            open: () => { throw new Error('popup opened'); }, dxJCTDPJzmXu: cfg
        };
        sandbox.unsafeWindow = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync(__dirname + '/supjav.user.js', 'utf8'), sandbox);
        assert.equal(sandbox.open('https://ad.example/'), null);
        assert.equal(cfg.adblock, true); assert.equal(cfg.noads, true);
        assert.ok(!kids.includes(cover) && !kids.includes(adFrame) && !kids.includes(adb));
        assert.ok(kids.includes(inner) && kids.includes(overlay) && kids.includes(plain));
        assert.equal(styles.length, 1);
        assert.match(styles[0].textContent, /\.play-overlay\{position:fixed!important;.*z-index:2147483647!important/);
        const late = add(mk('DIV', {style: {position: 'fixed', zIndex: '999999'}}));
        tick();
        assert.ok(!kids.includes(late));
        assert.equal(video.paused, false); assert.equal(ev.hidden, 0);
        listener();
        assert.equal(video.muted, true); assert.equal(video.paused, true); assert.equal(ev.hidden, 1); assert.equal(ev.set, 0);
        const src = fs.readFileSync(__dirname + '/supjav.user.js', 'utf8');
        assert.ok(!/\.click\(\)|dispatchEvent|new\s+(Mouse|Pointer|Touch)Event/.test(src), 'no programmatic clicks');
    }

    // 2.4.2: document-start hooks + tap shield (late-injection safe). No programmatic clicks; the user's own tap is handled.
    {
        class ET { constructor() { this.l = []; } addEventListener(t, f, o) { this.l.push({t, f, o}); } }
        class Anchor extends ET { constructor(h) { super(); this.h = h; this.clicked = 0; } getAttribute() { return this.h; } click() { this.clicked++; } }
        class Form extends ET { getAttribute() { return 'https://pyppo.com/f'; } submit() { this.sent = true; } }
        class Node0 extends ET { constructor() { super(); this.kids = []; } appendChild(el) { this.kids.push(el); return el; } insertBefore(el) { this.kids.push(el); return el; } }
        const observers = [];
        class MO { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} }
        const video = Object.assign(new ET(), {tagName: 'VIDEO', src: '', play() { this.played = true; return Promise.resolve(); }, pause() {}});
        const overlay = {style: {display: ''}, closest: q => q === '.play-overlay' ? overlay : null};
        const doc = Object.assign(new Node0(), {readyState: 'loading', documentElement: {}, head: null, body: null,
            querySelector: q => q === '.play-overlay' ? overlay : q === 'video' ? video : null,
            querySelectorAll: () => [], getElementById: id => id === 'mainvideo' ? video : id === 'botlink' ? {textContent: '//streamtape.com/get_video?id=AbC&expires=1&ip=X&token=T'} : null,
            createElement: () => ({setAttribute() {}})});
        const win = Object.assign(new ET(), {document: doc, EventTarget: ET, HTMLAnchorElement: Anchor, HTMLFormElement: Form, Node: Node0,
            MutationObserver: MO, getComputedStyle: () => ({}), open: () => 'popup',
            location: {href: 'https://streamtape.com/e/AbC/x.mp4'}, navigator: {userAgent: 'x'}, performance: {timeOrigin: Date.now()}, Date, URL, Promise, JSON,
            GmSpiderInject: {GetSpiderArgs: () => '["playerContent","ST","{}","[]"]', HideWebview() {}, ShowWebview() {}, SetSpiderResult() { throw new Error('no result on embed'); }},
            setInterval: () => 1, clearInterval() {}, setTimeout: () => 1});
        ET.prototype.addEventListener = ET.prototype.addEventListener; // original
        Object.setPrototypeOf(doc, Node0.prototype);
        win.unsafeWindow = win; win.window = win; win.MutationObserver = MO;
        vm.createContext(win);
        vm.runInContext(fs.readFileSync(__dirname + '/supjav.user.js', 'utf8'), win);
        // a second injection into the same document is a no-op
        vm.runInContext(fs.readFileSync(__dirname + '/supjav.user.js', 'utf8'), win);
        const shields = win.l.filter(x => x.o && x.o.capture);
        assert.deepEqual(shields.map(x => x.t).sort(), ['auxclick', 'click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchend', 'touchstart']);
        // ad code registering tap handlers on document/window afterwards is dropped; element listeners kept
        const before = doc.l.length; doc.addEventListener('click', () => {}, true); win.addEventListener('touchend', () => {}, true);
        assert.equal(doc.l.length, before); assert.equal(win.l.length, shields.length, JSON.stringify(win.l.map(x => [x.t, x.o])));
        doc.addEventListener('DOMContentLoaded', () => {}); assert.equal(doc.l.length, before + 1);
        const el = new ET(); el.addEventListener('click', () => {}); assert.equal(el.l.length, 1);
        // external anchors/forms neutralised, same-site anchors untouched
        const ext = new Anchor('intent://pyppo.com/4/1#Intent;end'); ext.click(); assert.equal(ext.clicked, 0);
        const ext2 = new Anchor('https://pyppo.com/x'); ext2.click(); assert.equal(ext2.clicked, 0);
        const own = new Anchor('/e/AbC'); own.click(); assert.equal(own.clicked, 1);
        const f = new Form(); f.submit(); assert.ok(!f.sent);
        assert.equal(win.open('https://pyppo.com/'), null);
        // ad script insertion blocked; site scripts allowed; config script rewritten before execution
        const host = new Node0();
        const adTag = {tagName: 'SCRIPT', src: 'https://llvpn.com/tag.min.js', getAttribute() { return this.src; }};
        const jq = {tagName: 'SCRIPT', src: 'https://streamtape.com/js/jquery.min.js', getAttribute() { return this.src; }};
        host.appendChild(adTag); host.appendChild(jq);
        assert.deepEqual(host.kids, [jq]);
        const cfgScript = {tagName: 'SCRIPT', src: '', textContent: 'window.x={"token":"t","adblock":false,"blockadblock":false,"noads":false,"fileid":"f"};'};
        const loader = {tagName: 'SCRIPT', src: '', textContent: "(function(s){s.dataset.zone='1',s.src='https://llvpn.com/tag.min.js'})(x)",
            parentNode: {removeChild() { loader.removed = true; }}, removeAttribute() {}};
        observers.forEach(o => o.cb([{addedNodes: [cfgScript, loader]}]));
        assert.match(cfgScript.textContent, /"adblock":true/); assert.match(cfgScript.textContent, /"noads":true/);
        assert.ok(loader.removed); assert.equal(loader.type, 'javascript/blocked');
        // the user's real tap: shield stops propagation and starts playback exactly like the site handler
        const evt = t => ({type: t, target: overlay, stopped: 0, prevented: 0, stopImmediatePropagation() { this.stopped++; }, stopPropagation() {}, preventDefault() { this.prevented++; }});
        const touch = evt('touchend'); shields.find(x => x.t === 'touchend').f(touch);
        assert.equal(touch.stopped, 1); assert.equal(touch.prevented, 0); assert.equal(video.src, '');
        const click = evt('click'); shields.find(x => x.t === 'click').f(click);
        assert.equal(click.stopped, 1);
        assert.equal(video.src, 'https://streamtape.com/get_video?id=AbC&expires=1&ip=X&token=T&stream=1');
        assert.equal(overlay.style.display, 'none'); assert.ok(video.played);
        const src = fs.readFileSync(__dirname + '/supjav.user.js', 'utf8');
        assert.match(src, /@run-at\s+document-start/);
    }

    // 2.6.0: same page model as MissAV — category/search/detail load the real supjav.com pages (no relay, no GM fetch of
    // supjav.com HTML); home = Pages (static classes); ST Referer hop = robots.txt (CF edge-cached, never challenged).
    for (const file of ['luoyuqiu.json', 'luoyuqiu-supjav-test.json']) {
        const site = JSON.parse(fs.readFileSync(__dirname + '/../json/' + file, 'utf8')).sites.find(x => x.key === 'supjav');
        const sp = site.ext.spider;
        assert.equal(sp.homeContent.loadUrl, 'https://jokers963.github.io/CatVodSpider/');
        assert.equal(sp.categoryContent.loadUrl, 'https://supjav.com/robots.txt#/category/${tid}/page/${pg:-1}/');
        assert.equal(sp.searchContent.loadUrl, 'https://supjav.com/robots.txt#/?s=${key}');
        assert.equal(sp.detailContent.loadUrl, 'https://supjav.com/robots.txt#${id}');
        assert.equal(site.ext.webViewSettings.userAgentString, undefined, 'keep WebView default UA like MissAV (cf_clearance is UA-bound)');
        assert.ok(!site.ext.webViewSettings.blockList.some(x => /cloudflare|turnstile|supjav\.com/i.test(x)));
    }
    {
        const src = fs.readFileSync(__dirname + '/supjav.user.js', 'utf8');
        assert.ok(!/GM_xmlhttpRequest\(\{[^}]*supjav\.com/.test(src.replace(/\/\/.*$/gm, '')), 'never fetch supjav.com HTML via native HTTP');
        // on a supjav page that is still loading (e.g. CF challenge), nothing runs until 'load'
        let loadCb = null, argsRead = 0;
        vm.runInNewContext(src, {
            document: {readyState: 'interactive', querySelector: () => null, querySelectorAll: () => []},
            location: {href: 'https://supjav.com/464694.html'}, navigator: {userAgent: 'x'}, performance: {timeOrigin: Date.now()}, Date, URL, Promise, JSON,
            unsafeWindow: {addEventListener: (t, f) => { if (t === 'load') loadCb = f; }},
            GmSpiderInject: {GetSpiderArgs: () => { argsRead++; return '["detailContent",["x"]]'; }, HideWebview() {}, ShowWebview() {}, SetSpiderResult() {}},
            setInterval: () => { throw new Error('no polling before load'); }, clearInterval() {}, setTimeout: () => 1
        });
        assert.equal(typeof loadCb, 'function'); assert.equal(argsRead, 0);
    }

    // 2.7.0 same-origin relay: robots.txt#target → window.fetch (WebView cookies/UA) + DOMParser; challenge/403 → navigate.
    {
        const listHtml = '<html><head><title>SupJav</title><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></head><body><div class="post">x</div></body></html>';
        const parsed = html => ({title: '', querySelector: () => null,
            querySelectorAll: q => q === 'div.post' && /class="post"/.test(html)
                ? [{querySelector: s => s.startsWith('a.img') ? {getAttribute: k => ({href: 'https://supjav.com/464694.html', title: 'FC2PPV 4991238 X'})[k] || null, textContent: ''} : null}]
                : q === 'a[href]' ? [{getAttribute: () => '/category/censored-jav/page/7/'}] : []});
        const mk = fetchImpl => {
            let replaced = ''; let resolveR; const got = new Promise(r => { resolveR = r; });
            const gmCalls = [];
            const win = {fetch: fetchImpl};
            vm.runInNewContext(fs.readFileSync(__dirname + '/supjav.user.js', 'utf8'), {
                document: {readyState: 'complete', title: '', querySelector: () => null, querySelectorAll: () => []},
                location: {href: 'https://supjav.com/robots.txt#/category/censored-jav/page/2/', hash: '#/category/censored-jav/page/2/', replace: u => { replaced = u; resolveR(null); }},
                navigator: {userAgent: 'UA'}, performance: {timeOrigin: Date.now()}, Date, URL, Promise, JSON,
                DOMParser: function () { this.parseFromString = parsed; }, unsafeWindow: win,
                GmSpiderInject: {GetSpiderArgs: () => JSON.stringify(['categoryContent', 'censored-jav', '2', true, {}]), HideWebview() {}, ShowWebview() {}, SetSpiderResult: v => resolveR(JSON.parse(v))},
                GM_xmlhttpRequest: d => gmCalls.push(d.url), setInterval: () => 1, clearInterval() {}, setTimeout: () => 1
            });
            return got.then(r => ({r, replaced, gmCalls}));
        };
        const fetched = [];
        const ok = await mk((u, o) => { fetched.push([u, o.credentials]); return Promise.resolve({ok: true, text: () => Promise.resolve(listHtml)}); });
        assert.deepEqual(fetched, [['https://supjav.com/category/censored-jav/page/2/', 'same-origin']]);
        assert.equal(ok.r.list[0].vod_id, 'https://supjav.com/464694.html'); assert.equal(ok.r.pagecount, 7);
        assert.deepEqual(ok.gmCalls, [], 'no native HTTP to supjav.com');
        const cf = await mk(() => Promise.resolve({ok: false, text: () => Promise.resolve('<title>Just a moment...</title>')}));
        assert.equal(cf.r, null); assert.equal(cf.replaced, 'https://supjav.com/category/censored-jav/page/2/');
        const ch = await mk(() => Promise.resolve({ok: true, text: () => Promise.resolve('<html><head><title>Just a moment...</title></head></html>')}));
        assert.equal(ch.replaced, 'https://supjav.com/category/censored-jav/page/2/');
    }

    console.log('SupJav adapter checks passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
