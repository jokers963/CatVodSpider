const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function run(path) {
    const clicked = [], probes = [];
    let result;
    const buttons = ['TV', 'FST'].map(textContent => ({textContent, click: () => clicked.push(textContent)}));
    const attributes = {};
    const frame = {id: 'video', src: 'https://embed.example.com/private?token=private',
        getAttribute: name => attributes[name], setAttribute: (name, value) => attributes[name] = value,
        addEventListener() {}};
    const group = {querySelectorAll: () => buttons};
    const document = {title: 'sample',
        querySelector: selector => selector === '.video-wrap .cd-server' ? group
            : selector === '.video-wrap .btn-server' ? buttons[0] : null,
        querySelectorAll: selector => selector === 'iframe' ? [frame] : [], getElementById: () => frame};
    const chain = {ready: fn => fn(), on() {}};
    vm.runInNewContext(fs.readFileSync(path, 'utf8'), {document, window: {location: {hash: '#1'}},
        location: {hostname: 'supjav.com'}, unsafeWindow: {}, $: () => chain,
        Date: {now: () => 0}, performance: {timeOrigin: 0},
        setInterval: () => 1, clearInterval() {}, setTimeout() {},
        GmSpiderInject: {GetSpiderArgs: () => '["playerContent"]', HideWebview() {},
            Diagnostic: (phase, value) => probes.push([phase, value]),
            SetSpiderResult: text => result = JSON.parse(text)}});
    return {result, clicked, attributes, probes};
}
const baseline = run(__dirname + '/../supjav.user.js');
const diagnostic = run(__dirname + '/supjav-diagnostic.user.js');
assert.deepEqual(diagnostic.result, baseline.result);
assert.deepEqual(diagnostic.clicked, ['FST']);
assert.deepEqual(diagnostic.attributes, baseline.attributes);
assert.ok(diagnostic.probes.some(([phase, value]) => phase === 'button' && value === 'FST'));
assert.ok(diagnostic.probes.some(([phase, value]) => phase === 'stage' && value === 'match_wait'));
console.log('Diagnostic script preserves playback selection/result checks passed.');
