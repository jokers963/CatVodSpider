const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function run(name, method, id, document, extra = {}) {
    let resolve;
    const done = new Promise(done => { resolve = done; });
    vm.runInNewContext(fs.readFileSync(__dirname + '/' + name + '.user.js', 'utf8'), {
        document, location: {origin: 'https://' + name + '.example'},
        performance: {timeOrigin: Date.now()}, Date, URL, atob,
        GmSpiderInject: {GetSpiderArgs: () => JSON.stringify([method, [id]]),
            HideWebview() {}, ShowWebview() {}, SetSpiderResult: value => { resolve(JSON.parse(value)); }},
        setInterval: () => 1, clearInterval() {}, ...extra
    });
    return done;
}

async function main() {
const airav = await run('airav', 'detailContent', 'ABF-381', {
    title: 'ABF-381',
    querySelector: () => null,
    querySelectorAll: selector => selector.startsWith('script')
            ? [{textContent: JSON.stringify({'@type': 'VideoObject', contentUrl: 'https://cdn.example/video.m3u8'})}]
            : []
});
assert.equal(airav.list[0].vod_play_url, '播放$https://cdn.example/video.m3u8');

const hanime1 = await run('hanime1', 'detailContent', '42', {
    title: 'Example',
    querySelector: () => null,
    querySelectorAll: selector => selector.startsWith('video source') ? [
        {src: 'https://cdn.example/480.mp4', getAttribute: () => '480'},
        {src: 'https://cdn.example/720.mp4', getAttribute: () => '720'}
    ] : []
});
assert.equal(hanime1.list[0].vod_play_url, '720$https://cdn.example/720.mp4#480$https://cdn.example/480.mp4');

const raw = JSON.stringify({videoUrl: '/api/hls/sample.m3u8', thumbVTTUrl: ''});
const shift = 48;
const encoded = Buffer.from([...raw].map(c => String.fromCharCode(c.charCodeAt(0) + shift)).join(''), 'latin1').toString('base64');
const rou = await run('rou', 'detailContent', 'v/sample', {
    title: 'Example',
    scripts: [{textContent: 'ev:$R[99]={d:"' + encoded + '",k:' + shift + '}'}],
    querySelector: () => null
}, {location: {origin: 'https://rou.video'}});
assert.equal(rou.list[0].vod_play_url, '播放$https://rou.video/api/hls/sample.m3u8');
const rouHome = await run('rou', 'homeContent', '', {
    scripts: [], querySelectorAll: () => []
}, {location: {origin: 'https://rou.video', pathname: '/v/sample'}});
assert.equal(rouHome.list.length, 0, 'Rou home returns categories without waiting for cards');
assert.deepEqual(Array.from(rouHome.class, item => item.type_name),
    ['劇集庫', '全部', '自拍流出', '國產AV', '探花', '日本', '麻豆傳媒', 'OnlyFans']);
assert.equal(rouHome.filters['t/OnlyFans'][0].value[1].v, 'viewCount');
assert.equal(rouHome.filters.series[0].value[1].v, 'hot');
assert.equal(rouHome.filters.series[1].value[2].v, 'completed');
const rouCategory = await run('rou', 'categoryContent', 't/OnlyFans', {
    scripts: [],
    querySelectorAll: selector => selector === 'main a[href*="page="]'
        ? [{href: 'https://rou.video/t/OnlyFans?order=createdAt&page=78'}]
        : [{
        href: 'https://rou.video/v/sample',
        querySelector: selector => selector === 'img' ? {alt: '', src: 'https://rou.video/cover.jpg'}
                : selector === '.clamp-2' ? {textContent: 'Sample title'} : null
    }]
}, {location: {origin: 'https://rou.video'}});
assert.equal(rouCategory.list[0].vod_id, 'v/sample');
assert.equal(rouCategory.list[0].vod_name, 'Sample title', 'Rou cards do not put their title in image alt');
assert.equal(rouCategory.pagecount, 78);
const rouSeries = await run('rou', 'categoryContent', 'series', {
    scripts: [],
    querySelectorAll: selector => selector === 'main a[href*="page="]'
        ? [{href: 'https://rou.video/series?page=32'}]
        : [{href: 'https://rou.video/s/show',
            querySelector: selector => selector === 'h3' ? {textContent: 'Example series'}
                : selector === 'img' ? {src: 'https://rou.video/series.jpg'} : null}]
}, {location: {origin: 'https://rou.video', pathname: '/series'}});
assert.equal(rouSeries.list[0].vod_id, 's/show');
assert.equal(rouSeries.pagecount, 32);
const rouEpisodes = await run('rou', 'detailContent', 's/show', {
    title: 'Example series',
    querySelector: selector => selector === 'meta[property="og:image"]' ? {content: 'https://rou.video/series.jpg'} : null,
    querySelectorAll: () => [
        {href: 'https://rou.video/v/one', textContent: '從第 1 集開始'},
        {href: 'https://rou.video/v/one', textContent: '第 1 集5 分鐘'},
        {href: 'https://rou.video/v/two', textContent: '第 2 集6 分鐘'}
    ]
}, {location: {origin: 'https://rou.video', pathname: '/s/show'}});
assert.equal(rouEpisodes.list[0].vod_play_url,
    '第1集$https://rou.video/api/hls/one#第2集$https://rou.video/api/hls/two');
const searchSeriesPage = {
    querySelectorAll: selector => selector === 'main a[href*="page="]'
        ? [{href: 'https://rou.video/search?q=sample&tab=series&page=4'}]
        : [{href: 'https://rou.video/s/show',
            querySelector: selector => selector === 'h3' ? {textContent: 'Example series'}
                : selector === 'img' ? {src: 'https://rou.video/series.jpg'} : null}]
};
const rouSearch = await run('rou', 'searchContent', 'sample', {
    querySelector: selector => selector === '#page-search' ? {} : null,
    querySelectorAll: selector => selector === 'main a[href*="page="]'
        ? [{href: 'https://rou.video/search?q=sample&page=2'}]
        : selector === 'a[href^="/v/"]' ? [{href: 'https://rou.video/v/sample',
            querySelector: selector => selector === '.clamp-2' ? {textContent: 'Example video'} : null}]
            : []
}, {location: {origin: 'https://rou.video', href: 'https://rou.video/search?q=sample&page=2'},
    fetch: async url => {
        assert.equal(url, 'https://rou.video/search?q=sample&page=2&tab=series');
        return {ok: true, text: async () => '<html></html>'};
    }, DOMParser: class { parseFromString() { return searchSeriesPage; } }});
assert.deepEqual(Array.from(rouSearch.list, item => item.vod_id), ['v/sample', 's/show']);
assert.equal(rouSearch.pagecount, 4);
const fetched = await run('rou', 'detailContent', 'v/sample', {
    title: 'Example', scripts: [], querySelector: () => null
}, {location: {origin: 'https://rou.video', pathname: '/v/sample', href: 'https://rou.video/v/sample'},
    fetch: async () => ({ok: true, text: async () => 'ev:$R[99]={d:"' + encoded + '",k:' + shift + '}'})});
assert.equal(fetched.list[0].vod_play_url, '播放$https://rou.video/api/hls/sample.m3u8');

// JavGuru (upload18 skin): categories from nav, video cards, upload18 iframe -> webview sniffing.
const jgHome = await run('javguru', 'homeContent', '', {
    title: 'JavGuru', readyState: 'complete',
    querySelector: () => null,
    querySelectorAll: selector => selector === 'header a[href], nav a[href]' ? [
        {href: 'https://javguru.fit/'},
        {href: 'https://javguru.fit/uncensored'},
        {href: 'https://javguru.fit/uncensored-leaked'},
        {href: 'https://javguru.fit/censored'},
        {href: 'https://javguru.fit/chinese'},
        {href: 'https://javguru.fit/amateur'},
        {href: 'https://javguru.fit/hentai'}
    ] : []
});
assert.deepEqual(Array.from(jgHome.class, c => c.type_name),
    ['最新', '无码', '无码破解', '有码', '国产', '素人', 'Hentai']);
assert.deepEqual(jgHome.list, []);
const jgCard = (id, name) => ({
    href: 'https://javguru.fit/video/' + id,
    getAttribute: () => '', textContent: '',
    querySelector: sel => sel === 'img' ? {
        getAttribute: attr => attr === 'alt' ? name : '',
        src: 'https://upload18.cc/v/' + id.toUpperCase() + '/poster.jpg'
    } : null
});
const jgListDoc = cards => ({
    title: 'JavGuru', readyState: 'complete',
    querySelector: () => null,
    querySelectorAll: selector => selector === 'a[href*="/video/"]' ? cards
        : selector === 'a[href*="page="]' ? [{href: 'https://javguru.fit/uncensored?page=42'}] : []
});
const jgCat = await run('javguru', 'categoryContent', 'uncensored',
    jgListDoc([jgCard('ipzz-961', 'IPZZ-961 title'), jgCard('ipzz-950', 'IPZZ-950 title')]));
assert.equal(jgCat.list[0].vod_id, 'ipzz-961');
assert.equal(jgCat.list[0].vod_name, 'IPZZ-961 title');
assert.equal(jgCat.list[0].vod_pic, 'https://upload18.cc/v/IPZZ-961/poster.jpg');
assert.equal(jgCat.list.length, 2, 'duplicate video links are deduped by id');
assert.equal(jgCat.pagecount, 42);
const jgSearch = await run('javguru', 'searchContent', 'IPZZ', jgListDoc([jgCard('ipzz-961', 'IPZZ-961 title')]));
assert.equal(jgSearch.list[0].vod_id, 'ipzz-961');
assert.equal(jgSearch.pagecount, 42);
const jgDetail = await run('javguru', 'detailContent', 'ipzz-961', {
    title: 'IPZZ-961 title | JavGuru', readyState: 'complete',
    querySelector: selector => selector === 'meta[property="og:title"]' ? {content: 'IPZZ-961 title'}
        : selector === 'meta[property="og:image"]' ? {content: 'https://upload18.cc/v/IPZZ-961/poster.jpg'}
        : selector === "iframe[src*='upload18.org/play']" ? {src: 'https://upload18.org/play/index/ipzz-961'}
        : null,
    querySelectorAll: () => []
});
assert.equal(jgDetail.list[0].vod_id, 'ipzz-961');
const jgMedia = jgDetail.list[0].vod_play_data[0].media[0];
assert.equal(jgMedia.type, 'webview', 'upload18 iframe goes through WebView sniffing, not a direct url');
assert.equal(jgMedia.ext.replace.slug, 'ipzz-961');
const jgPlayerCfg = {m3u8: 'https://helvid.com/m/QUdNWC0yNzEvcGxheWxpc3QubTN1OA'};
const jgPlayer = await run('javguru', 'playerContent', '', {
    title: 'AGMX-271', readyState: 'complete',
    querySelector: () => null, querySelectorAll: () => []
}, {
    location: {origin: 'https://upload18.org', href: 'https://upload18.org/play/index/agmx-271'},
    unsafeWindow: {PLAYER_CONFIG: jgPlayerCfg}
});
assert.equal(jgPlayer.type, 'url', 'server-rendered m3u8 is returned directly, no sniffing needed');
assert.equal(jgPlayer.ext.url, jgPlayerCfg.m3u8);
const jgPlayerFallback = await run('javguru', 'playerContent', '', {
    title: 'AGMX-271', readyState: 'complete',
    querySelector: () => null, querySelectorAll: () => []
}, {
    location: {origin: 'https://upload18.org', href: 'https://upload18.org/play/index/agmx-271'},
    unsafeWindow: {jwplayer: () => ({
        play() {}, setMute() {}, getPlaylistItem: () => ({file: 'https://cdn.example/x.m3u8'})
    })}
});
assert.equal(jgPlayerFallback.type, 'match', 'without PLAYER_CONFIG falls back to sniff mode');
console.log('New-site adapter checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
