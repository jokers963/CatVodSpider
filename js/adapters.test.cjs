const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function supjav(method) {
    let now = 0;
    let tick;
    let shows = 0;
    let result;
    const document = {title: 'Just a moment', querySelector: () => null};
    const chain = {ready: fn => fn(), on() {}};
    const bridge = {
        GetSpiderArgs: () => JSON.stringify([method, ['sample']]),
        ShowWebview: () => shows++, HideWebview() {},
        SetSpiderResult: text => { result = JSON.parse(text); }
    };
    vm.runInNewContext(fs.readFileSync(__dirname + '/supjav.user.js', 'utf8'), {
        document, location: {hostname: 'supjav.com'}, unsafeWindow: {}, GmSpiderInject: bridge, $: () => chain,
        Date: {now: () => now}, setInterval: fn => { tick = fn; return 1; }, clearInterval() {}
    });
    tick(); tick();
    assert.equal(shows, 1, 'verification must not repeatedly reset scrolling');
    assert.equal(result, undefined);
    now = 55000; tick();
    assert.ok(result, 'verification must not leave the request waiting forever');
    tick(); assert.equal(shows, 1);
    return result;
}
assert.deepEqual(supjav('detailContent').list, []);
assert.match(supjav('detailContent').msg, /验证/);
assert.equal(supjav('playerContent').type, 'url', 'an unavailable page must not wait for a media match');
let playerTick;
const calls = [];
vm.runInNewContext(fs.readFileSync(__dirname + '/supjav.user.js', 'utf8'), {
    location: {hostname: 'turbovidhls.com'},
    GmSpiderInject: {GetSpiderArgs: () => '["playerContent"]'},
    unsafeWindow: {jwplayer: () => ({
        getPlaylistItem: () => ({sources: [{file: 'https://cdn.example/test.m3u8'}]}),
        setMute: value => calls.push(['mute', value]), play: value => calls.push(['play', value])
    })},
    setInterval: fn => { playerTick = fn; return 1; }, clearInterval() {}, setTimeout() {}
});
playerTick(); playerTick();
assert.deepEqual(calls, [['mute', true], ['play', true]], 'start the TV embed once without changing native-player volume');
let jableResult;
vm.runInNewContext(fs.readFileSync(__dirname + '/jable.user.js', 'utf8'), {
    document: {
        title: 'ABF-381', readyState: 'complete',
        querySelector: selector => selector === 'meta[property="og:title"]' ? {content: 'ABF-381'} : null
    },
    unsafeWindow: {hlsUrl: 'https://cdn.example/test.m3u8'},
    GmSpiderInject: {
        GetSpiderArgs: () => '["detailContent",["abf-381"]]', HideWebview() {},
        SetSpiderResult: text => { jableResult = JSON.parse(text); }
    },
    setInterval: () => 1, clearInterval() {}, setTimeout: fn => fn()
});
assert.match(jableResult.list[0].vod_play_from, /abf-381/i);
assert.equal(jableResult.list[0].vod_play_url, '播放$https://cdn.example/test.m3u8');
let missNow = 0, missTick, missResult, missShows = 0;
vm.runInNewContext(fs.readFileSync(__dirname + '/missav.user.js', 'utf8'), {
    document: {title: 'Just a moment', querySelector: () => null, addEventListener() {}},
    unsafeWindow: {addEventListener() {}}, Date: {now: () => missNow},
    GmSpiderInject: {
        GetSpiderArgs: () => '["detailContent",["abf-381"]]', HideWebview() {},
        ShowWebview: () => missShows++, SetSpiderResult: text => { missResult = JSON.parse(text); }
    },
    setInterval: fn => { missTick = fn; return 1; }, clearInterval() {}, setTimeout: fn => fn()
});
missTick(); missTick(); assert.equal(missShows, 1); assert.equal(missResult, undefined);
missNow = 55000; missTick();
assert.deepEqual(missResult.list, []); assert.match(missResult.msg, /验证/);
console.log('Adapter checks passed.');
