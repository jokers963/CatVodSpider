const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(__dirname + '/hanime1.user.js', 'utf8');
const config = JSON.parse(fs.readFileSync(__dirname + '/../json/supjav.json', 'utf8'));
const site = config.sites.find(item => item.key === 'hanime1');
let result;
const link = {
    href: 'https://hanime1.me/watch?v=sample',
    querySelector: selector => selector === '.title' ? {textContent: 'Sample'}
        : selector === 'img' ? {alt: '', src: ''} : null
};
vm.runInNewContext(source, {
    document: {
        title: 'Hanime1', readyState: 'complete',
        querySelector: () => null,
        querySelectorAll: selector => selector.includes('video-link') ? [link] : []
    },
    performance: {timeOrigin: Date.now()}, Date, URL,
    setInterval: () => 1, clearInterval() {},
    GmSpiderInject: {
        GetSpiderArgs: () => JSON.stringify(['homeContent', true]),
        ShowWebview() {}, HideWebview() {},
        SetSpiderResult: value => { result = JSON.parse(value); }
    }
});

assert.deepEqual(result.class.map(item => item.type_name), [
    '里番', '泡面番', 'Motion Anime', '3DCG', '2.5D', '2D动画',
    'AI生成', 'MMD', 'Cosplay', '新番预告'
]);
assert.deepEqual(result.class.map(item => item.type_id),
    Array.from({length: 10}, (_, index) => `nav-${index + 1}`));
assert.equal(result.list[0].vod_id, 'sample');
assert.equal(site.ext.userScript.endsWith('hanime1.user.js?v=2'), true);
assert.equal(site.ext.spider.categoryContent, undefined);
console.log('Hanime1 navigation checks passed.');
