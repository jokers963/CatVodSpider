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
const rou = await run('rou', 'detailContent', 'sample', {
    title: 'Example',
    scripts: [{textContent: 'ev:$R[99]={d:"' + encoded + '",k:' + shift + '}'}],
    querySelector: () => null
}, {location: {origin: 'https://rou.video'}});
assert.equal(rou.list[0].vod_play_url, '播放$https://rou.video/api/hls/sample.m3u8');
const rouHome = await run('rou', 'homeContent', '', {
    scripts: [],
    querySelectorAll: () => [{
        href: 'https://rou.video/v/sample',
        querySelector: selector => selector === 'img' ? {alt: '', src: 'https://rou.video/cover.jpg'}
                : selector === '.clamp-2' ? {textContent: 'Sample title'} : null
    }]
}, {location: {origin: 'https://rou.video'}});
assert.equal(rouHome.list[0].vod_name, 'Sample title', 'Rou cards do not put their title in image alt');
const fetched = await run('rou', 'detailContent', 'sample', {
    title: 'Example', scripts: [], querySelector: () => null
}, {location: {origin: 'https://rou.video', href: 'https://rou.video/v/sample'},
    fetch: async () => ({ok: true, text: async () => 'ev:$R[99]={d:"' + encoded + '",k:' + shift + '}'})});
assert.equal(fetched.list[0].vod_play_url, '播放$https://rou.video/api/hls/sample.m3u8');
console.log('New-site adapter checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
