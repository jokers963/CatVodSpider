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
console.log('Adapter checks passed.');
