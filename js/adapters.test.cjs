const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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
jableChallenge.tick(0); jableChallenge.tick(59999);
assert.equal(jableChallenge.shows(), 1); assert.equal(jableChallenge.result(), undefined);
jableChallenge.tick(60000);
assert.match(jableChallenge.result().msg, /验证未完成/);
for (const method of ['homeContent', 'categoryContent', 'searchContent']) {
    const delayedJableChallenge = jableWait(true, 'loading', method, 0, 20000);
    delayedJableChallenge.tick(20000); // challenge first seen here
    delayedJableChallenge.tick(79999);
    assert.equal(delayedJableChallenge.result(), undefined, `${method} keeps verification visible while the user works on the challenge`);
    delayedJableChallenge.tick(80000);
    assert.match(delayedJableChallenge.result().msg, /验证未完成/, `${method} gives up 60s after the challenge was first shown`);
}
const jableLoadFailure = jableWait(false, 'loading');
jableLoadFailure.tick(25000);
assert.match(jableLoadFailure.result().msg, /页面加载超时/);
const jableEmpty = jableWait(false, 'complete');
jableEmpty.tick(25000);
assert.match(jableEmpty.result().msg, /没有匹配内容/);
// Jable search pagination is AJAX-driven (URL never changes): the userscript
// drives ul.pagination in-page. Mock: pages render "01".."03", clicking a
// page link swaps the active page and its video anchors.
function jableSearch(targetPg, totalPages = 3) {
    let now = 0, tick, result;
    let activePage = 1;
    const pad = n => String(n).padStart(2, '0');
    const videoAnchor = id => ({
        href: 'https://jable.tv/videos/' + id + '/',
        closest: () => null, parentElement: null,
        querySelector: () => ({dataset: {}, getAttribute: () => null, textContent: 'Video ' + id})
    });
    const pageLink = n => ({textContent: pad(n), getAttribute: () => null, click() { activePage = n; }});
    const document = {
        title: 'Jable', readyState: 'loading',
        querySelector(selector) {
            if (selector === 'ul.pagination li.page-item span.page-link.active') {
                return activePage <= totalPages ? {textContent: pad(activePage)} : null;
            }
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'ul.pagination li.page-item a.page-link'
                || selector === 'ul.pagination a.page-link') {
                const links = [];
                for (let n = 1; n <= totalPages; n++) if (n !== activePage) links.push(pageLink(n));
                return links;
            }
            if (selector === 'a[href*="/videos/"]') {
                return [videoAnchor('p' + activePage + 'a'), videoAnchor('p' + activePage + 'b')];
            }
            return [];
        }
    };
    vm.runInNewContext(fs.readFileSync(__dirname + '/jable.user.js', 'utf8'), {
        document, location: {href: 'https://jable.tv/search/test/'}, URL,
        unsafeWindow: {addEventListener() {}}, Date: {now: () => now}, performance: {timeOrigin: 0},
        GmSpiderInject: {
            GetSpiderArgs: () => JSON.stringify(['searchContent', 'test', true, String(targetPg)]),
            ShowWebview() {}, HideWebview() {},
            SetSpiderResult: text => { result = JSON.parse(text); }
        },
        setInterval: fn => { tick = fn; return 1; }, clearInterval() {}, setTimeout: fn => fn()
    });
    return {tick: value => { now = value; tick(); }, result: () => result};
}
const jableSearchP2 = jableSearch(2);
jableSearchP2.tick(0); // clicks "02"
assert.equal(jableSearchP2.result(), undefined, 'driving to page 2 must not send page-1 content');
jableSearchP2.tick(1000); // lets the AJAX-swapped DOM settle
assert.equal(jableSearchP2.result(), undefined);
jableSearchP2.tick(2000);
assert.equal(jableSearchP2.result().list[0].vod_id, 'p2a', 'page 2 must return page-2 videos');
assert.equal(jableSearchP2.result().pagecount, 3, 'pagecount comes from the pagination labels');
const jableSearchP1 = jableSearch(1);
jableSearchP1.tick(0);
assert.equal(jableSearchP1.result().list[0].vod_id, 'p1a', 'page 1 keeps the direct scrape path');
const jableSearchDead = jableSearch(2, 1); // single-page result, no pagination to drive
jableSearchDead.tick(0);
assert.equal(jableSearchDead.result(), undefined);
jableSearchDead.tick(25000);
assert.deepEqual(jableSearchDead.result().list, [], 'an unreachable page must end the list, not duplicate page 1');
// Content wins over stale challenge markers: a completed Cloudflare widget
// often stays in the DOM, which must not block real results.
function jableStaleChallenge() {
    let now = 0, tick, result;
    const document = {
        title: 'Jable', readyState: 'loading',
        querySelector(selector) {
            if (selector.includes('cf-turnstile-response')) return {name: 'cf-turnstile-response'};
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'a[href*="/videos/"]') {
                return [{
                    href: 'https://jable.tv/videos/abc123/',
                    closest: () => null, parentElement: null,
                    querySelector: () => ({dataset: {src: 'https://pic.example/a.jpg'}, getAttribute: () => null, textContent: 'Video ABC'})
                }];
            }
            return [];
        }
    };
    vm.runInNewContext(fs.readFileSync(__dirname + '/jable.user.js', 'utf8'), {
        document, location: {href: 'https://jable.tv/search/test/'}, URL,
        unsafeWindow: {addEventListener() {}}, Date: {now: () => now}, performance: {timeOrigin: 0},
        GmSpiderInject: {
            GetSpiderArgs: () => JSON.stringify(['searchContent', 'test', true, '1']),
            ShowWebview() {}, HideWebview() {},
            SetSpiderResult: text => { result = JSON.parse(text); }
        },
        setInterval: fn => { tick = fn; return 1; }, clearInterval() {}, setTimeout: fn => fn()
    });
    return {tick: value => { now = value; tick(); }, result: () => result};
}
const stale = jableStaleChallenge();
stale.tick(0);
assert.equal(stale.result().list[0].vod_id, 'abc123', 'real content must be sent even with a stale challenge widget in the DOM');
assert.equal(stale.result().msg, undefined);
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

function jableCategory(videoCount, href, paginationLinks = []) {
    let result;
    const links = [];
    for (let i = 1; i <= videoCount; i++) {
        const code = 'abf-' + String(i).padStart(3, '0');
        links.push({
            href: 'https://jable.tv/videos/' + code + '/',
            closest: () => null,
            parentElement: null,
            querySelector: () => ({
                dataset: {},
                src: '',
                getAttribute: () => null,
                textContent: 'Test video ' + code
            })
        });
    }
    const pageLinks = paginationLinks.map(page => ({href: 'https://jable.tv/categories/jav/?page=' + page}));
    vm.runInNewContext(fs.readFileSync(__dirname + '/jable.user.js', 'utf8'), {
        document: {
            title: 'Jable', readyState: 'complete',
            querySelector: () => null,
            querySelectorAll: selector => selector === 'a[href*="/videos/"]' ? links : pageLinks
        },
        location: {href},
        unsafeWindow: {},
        URL, Date, performance: {timeOrigin: 0},
        GmSpiderInject: {
            GetSpiderArgs: () => '["categoryContent"]',
            HideWebview() {}, ShowWebview() {},
            SetSpiderResult: text => { result = JSON.parse(text); }
        },
        setInterval: () => 1, clearInterval() {}, setTimeout: fn => fn()
    });
    return result;
}

const JABLE_ASYNC = 'https://jable.tv/categories/jav/?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&from=01';
const jableFullBatch = jableCategory(24, JABLE_ASYNC);
assert.equal(jableFullBatch.list.length, 24);
assert.equal(jableFullBatch.pagecount, 9999, 'async fragment with a full batch must report more pages');
const jableShortBatch = jableCategory(5, JABLE_ASYNC);
assert.equal(jableShortBatch.pagecount, 1, 'async fragment with a short batch stays single-page');
const jablePaged = jableCategory(24, 'https://jable.tv/categories/jav/', [3, 7]);
assert.equal(jablePaged.pagecount, 7, 'page links on a full page are still honored');

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
