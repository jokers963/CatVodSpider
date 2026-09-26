const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require('node:path').join(__dirname, 'javguru.user.js'), 'utf8');

function run(method, document) {
    const results = [], timers = [];
    vm.runInNewContext(script, {
        document, location: {href: 'https://jav.guru/', hash: '#0'}, URL, Date,
        unsafeWindow: {addEventListener() {}},
        setInterval(fn) { timers.push(fn); return timers.length; },
        clearInterval() {}, setTimeout(fn, delay) { if (!delay) fn(); },
        GmSpiderInject: {
            GetSpiderArgs() { return JSON.stringify([method, true]); },
            HideWebview() {}, SetSpiderResult(value) { results.push(JSON.parse(value)); }
        }
    });
    return {results, timers};
}

const title = '[ABF-381] Test movie';
const link = {href: 'https://jav.guru/1043459/abf-381-test/', title, textContent: title};
const card = {querySelector(selector) { return selector === 'h2 a[href]' ? link : selector === '.imgg img, img' ? {dataset: {}, src: 'https://cdn.javmiku.com/poster.jpg'} : null; }};
const home = run('homeContent', {
    readyState: 'complete',
    querySelectorAll(selector) { return selector === '.inside-article' ? [card] : []; }
});
assert.equal(home.results[0].list[0].vod_name, title);
assert.equal(home.results[0].list[0].vod_pic, 'https://cdn.javmiku.com/poster.jpg');

let buttons = [], buttonClicks = 0, overlayClicks = 0;
const overlay = {dataset: {}, click() { overlayClicks++; }};
const frameDocument = {querySelector() { return overlay; }, querySelectorAll() { return []; }};
const player = run('playerContent', {
    readyState: 'complete',
    querySelector() { return null; },
    querySelectorAll(selector) { return selector === 'a.wp-btn-iframe__shortcode' ? buttons : selector === 'iframe' ? [{contentDocument: frameDocument}] : []; }
});
assert.equal(player.results.length, 0, 'wait for the stream button before returning match');
buttons = [{textContent: 'STREAM TV', click() { buttonClicks++; }}];
player.timers[0]();
assert.equal(player.results[0].type, 'match');
assert.equal(buttonClicks, 1);
player.timers[1]();
player.timers[1]();
assert.equal(overlayClicks, 1, 'click the embedded playback overlay only once');
console.log('Jav.Guru card and playback-click checks passed');
