const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function supjav(method, scriptStartedAt = 0) {
    let now = scriptStartedAt;
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
        Date: {now: () => now}, performance: {timeOrigin: 0}, setInterval: fn => { tick = fn; return 1; }, clearInterval() {}
    });
    tick(); tick();
    assert.equal(shows, 1, 'verification must not repeatedly reset scrolling');
    assert.equal(result, undefined);
    now = 25000; tick();
    assert.ok(result, 'verification must not leave the request waiting forever');
    tick(); assert.equal(shows, 1);
    return result;
}
assert.deepEqual(supjav('detailContent').list, []);
assert.deepEqual(supjav('homeContent').list, [], 'unavailable SupJav home must not create a recommendation tab');
assert.match(supjav('detailContent').msg, /验证/);
assert.match(supjav('detailContent', 20000).msg, /验证未完成/, 'page time before script start counts toward the wait limit');
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
    unsafeWindow: {hlsUrl: 'https://cdn.example/test.m3u8'}, Date: {now: () => 30000}, performance: {timeOrigin: 0},
    GmSpiderInject: {
        GetSpiderArgs: () => '["detailContent",["abf-381"]]', HideWebview() {},
        SetSpiderResult: text => { jableResult = JSON.parse(text); }
    },
    setInterval: () => 1, clearInterval() {}, setTimeout: fn => fn()
});
assert.match(jableResult.list[0].vod_play_from, /abf-381/i);
assert.equal(jableResult.list[0].vod_play_url, '播放$https://cdn.example/test.m3u8');
function home(name, document, extra = {}) {
    let result;
    const chain = {ready: fn => fn(), on() {}};
    vm.runInNewContext(fs.readFileSync(__dirname + '/' + name + '.user.js', 'utf8'), {
        document, location: {hostname: name + '.com', href: 'https://' + name + '.com/'}, unsafeWindow: {addEventListener() {}},
        Date, URL, performance: {timeOrigin: Date.now()}, $: () => chain,
        GmSpiderInject: {GetSpiderArgs: () => '["homeContent","true"]', HideWebview() {}, ShowWebview() {},
            SetSpiderResult: text => { result = JSON.parse(text); }},
        setInterval: () => 1, clearInterval() {}, setTimeout: fn => fn(), ...extra
    });
    return result;
}
const supjavHome = home('supjav', {title: 'SupJav', querySelector: selector => selector === '.post' ? {} : null});
assert.ok(supjavHome.class.length > 0);
assert.deepEqual(supjavHome.list, []);
const missavHome = home('missav', {title: 'MissAV', querySelector: () => null, addEventListener() {}});
assert.ok(missavHome.class.length > 0);
assert.deepEqual(missavHome.list, []);
const jableHome = home('jable', {
    title: 'Jable', readyState: 'complete', querySelector: () => null,
    querySelectorAll: selector => selector === 'div.img-box > a, div.horizontal-img-box > a'
        ? [{href: 'https://jable.tv/categories/sample/',
            querySelector: () => ({textContent: 'Sample category'})}] : []
});
assert.equal(jableHome.class.length, 1);
assert.deepEqual(jableHome.list, []);
function jableWait(challenged, readyState, method = 'homeContent', navigationStart = 0, scriptStart = 0) {
    let now = scriptStart, tick, result, shows = 0;
    vm.runInNewContext(fs.readFileSync(__dirname + '/jable.user.js', 'utf8'), {
        document: {
            title: challenged ? 'Just a moment' : 'Jable', readyState,
            querySelector: () => challenged ? {} : null, querySelectorAll: () => []
        },
        unsafeWindow: {addEventListener() {}}, Date: {now: () => now}, performance: {timeOrigin: navigationStart},
        GmSpiderInject: {
            GetSpiderArgs: () => JSON.stringify([method]), ShowWebview: () => shows++, HideWebview() {},
            SetSpiderResult: text => { result = JSON.parse(text); }
        },
        setInterval: fn => { tick = fn; return 1; }, clearInterval() {}, setTimeout() {}
    });
    return {tick: value => { now = value; tick(); }, result: () => result, shows: () => shows};
}
const jableChallenge = jableWait(true, 'loading');
jableChallenge.tick(0); jableChallenge.tick(24999);
assert.equal(jableChallenge.shows(), 1); assert.equal(jableChallenge.result(), undefined);
jableChallenge.tick(25000);
assert.match(jableChallenge.result().msg, /验证未完成/);
for (const method of ['homeContent', 'categoryContent', 'searchContent']) {
    const delayedJableChallenge = jableWait(true, 'loading', method, 0, 20000);
    delayedJableChallenge.tick(24999);
    assert.equal(delayedJableChallenge.result(), undefined, `${method} keeps verification visible until the navigation budget ends`);
    delayedJableChallenge.tick(25000);
    assert.match(delayedJableChallenge.result().msg, /验证未完成/, `${method} uses navigation time after late script injection`);
}
const jableLoadFailure = jableWait(false, 'loading');
jableLoadFailure.tick(25000);
assert.match(jableLoadFailure.result().msg, /页面加载超时/);
const jableEmpty = jableWait(false, 'complete');
jableEmpty.tick(25000);
assert.match(jableEmpty.result().msg, /没有匹配内容/);
let missNow = 0, missTick, missResult, missShows = 0;
vm.runInNewContext(fs.readFileSync(__dirname + '/missav.user.js', 'utf8'), {
    document: {title: 'Just a moment', querySelector: () => null, addEventListener() {}},
    unsafeWindow: {addEventListener() {}}, Date: {now: () => missNow}, performance: {timeOrigin: 0},
    GmSpiderInject: {
        GetSpiderArgs: () => '["detailContent",["abf-381"]]', HideWebview() {},
        ShowWebview: () => missShows++, SetSpiderResult: text => { missResult = JSON.parse(text); }
    },
    setInterval: fn => { missTick = fn; return 1; }, clearInterval() {}, setTimeout: fn => fn()
});
missTick(); missTick(); assert.equal(missShows, 1); assert.equal(missResult, undefined);
missNow = 25000; missTick();
assert.deepEqual(missResult.list, []); assert.match(missResult.msg, /验证/);

let delayedMissResult, delayedMissTick, delayedMissNow = 20000;
vm.runInNewContext(fs.readFileSync(__dirname + '/missav.user.js', 'utf8'), {
    document: {title: 'MissAV', querySelector: () => null, addEventListener() {}},
    unsafeWindow: {addEventListener() {}}, Date: {now: () => delayedMissNow}, performance: {timeOrigin: 0},
    GmSpiderInject: {
        GetSpiderArgs: () => '["detailContent",["abf-381"]]', HideWebview() {}, ShowWebview() {},
        SetSpiderResult: text => { delayedMissResult = JSON.parse(text); }
    },
    setInterval: fn => { delayedMissTick = fn; return 1; }, clearInterval() {}, setTimeout: fn => fn()
});
delayedMissTick();
assert.equal(delayedMissResult, undefined);
delayedMissNow = 25000; delayedMissTick();
assert.match(delayedMissResult.msg, /未获取到/, 'slow navigation time counts toward the wait limit');

function av01(method, fetch, callArgs = ['latest', '1']) {
    let result, complete;
    const timers = [];
    const done = new Promise(resolve => { complete = resolve; });
    class AbortController {
        constructor() { this.signal = {}; }
        abort() { this.signal.onabort?.(); }
    }
    vm.runInNewContext(fs.readFileSync(__dirname + '/av01.user.js', 'utf8'), {
        document: {readyState: 'complete'}, location: {origin: 'https://www.av01.media', pathname: '/cn/video/123/slug'},
        navigator: {userAgent: 'test'}, AbortController, fetch,
        GmSpiderInject: {
            GetSpiderArgs: () => JSON.stringify([method, ...callArgs]), HideWebview() {},
            SetSpiderResult: text => { result = JSON.parse(text); complete(result); }
        },
        setTimeout: (fn, ms) => { timers.push({fn, ms}); return timers.length; }, clearTimeout() {}
    });
    return {done, timers, result: () => result};
}

async function testAv01() {
    const homeRequests = [];
    const av01Home = av01('homeContent', async url => {
        homeRequests.push(url);
        return {ok: true, json: async () => ({tags: []})};
    });
    const homeResult = await av01Home.done;
    assert.deepEqual(homeResult.list, []);
    assert.equal(homeResult.class.length, 2);
    assert.equal(homeRequests.length, 1, 'AV01 home does not load the unused latest-video list');

    const timeout = av01('categoryContent', (_url, options) => new Promise((_, reject) => {
        options.signal.onabort = () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); };
    }));
    const requestTimer = timeout.timers.find(timer => timer.ms === 8000);
    assert.ok(requestTimer, 'AV01 requests must have a bounded network timeout');
    requestTimer.fn();
    assert.match((await timeout.done).msg, /网络请求超时/);

    const noResults = av01('categoryContent', async url => ({
        ok: true,
        json: async () => url.includes('geo.js') ? {} : {videos: [], pagination: {total: 0}}
    }));
    const empty = await noResults.done;
    assert.deepEqual(empty.list, []);
    assert.equal(empty.msg, undefined, 'a successful empty result must not be reported as a network failure');

    const listFailure = av01('categoryContent', async url => url.includes('geo.js')
            ? {ok: true, json: async () => ({})}
            : {ok: false, status: 503});
    assert.deepEqual((await listFailure.done).list, []);
    assert.match(listFailure.result().msg, /HTTP 503/, 'an API failure must be distinguished from a successful empty list');

    let invalidRequested = false;
    const invalidCategory = av01('categoryContent', async () => { invalidRequested = true; }, ['videos/../../geo.js', '1']);
    assert.match((await invalidCategory.done).msg, /参数无效/);
    assert.equal(invalidRequested, false, 'invalid category IDs must not reach fetch');

    const httpFailure = av01('playerContent', async url => url.includes('geo.js')
            ? {ok: true, json: async () => ({token_v2: 'private-token', expires: 'private-expiry', ip: 'private-ip'})}
            : {ok: false, status: 403});
    const failedPlay = await httpFailure.done;
    assert.equal(failedPlay.msg, undefined, 'the installed GM PlayMedium model does not preserve top-level player messages');
    assert.equal(failedPlay.ext.url, '');
}

testAv01().then(() => console.log('Adapter checks passed.'), error => {
    console.error(error);
    process.exitCode = 1;
});
