const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(__dirname + '/diagnostic/hanime1-home-v3.user.js', 'utf8');
const config = JSON.parse(fs.readFileSync(__dirname + '/../json/new-sites-test.json', 'utf8'));
const site = config.sites.find(item => item.key === 'hanime1');
let result;
const link = {
    href: 'https://hanime1.me/watch?v=sample',
    querySelector: selector => selector === '.title' ? {textContent: 'Sample'}
        : selector === 'img' ? {alt: '', src: 'https://example.test/cover.jpg'}
        : selector === '.duration' ? {textContent: '12:34'} : null
};

function run(method, args = [], page = 1) {
    vm.runInNewContext(source, {
        document: {
            title: 'Hanime1', readyState: 'complete',
            querySelector: () => null,
            querySelectorAll: selector => selector.includes('video-link') ? [link]
                : selector.includes('page=') ? [{href: `https://hanime1.me/search?genre=3DCG&page=${page}`}]
                : []
        },
        performance: {timeOrigin: Date.now()}, Date, URL,
        setInterval: () => 1, clearInterval() {},
        GmSpiderInject: {
            GetSpiderArgs: () => JSON.stringify([method, ...args]),
            ShowWebview() {}, HideWebview() {},
            SetSpiderResult: value => { result = JSON.parse(value); }
        }
    });
    return result;
}

const home = run('homeContent', [true]);

assert.deepEqual(home.class.map(item => item.type_name), [
    '里番', '泡面番', 'Motion Anime', '3DCG', '2.5D', '2D动画',
    'AI生成', 'MMD', 'Cosplay', '新番预告'
]);
assert.deepEqual(home.class.map(item => decodeURIComponent(item.type_id)), [
    '裏番', '泡麵番', 'Motion Anime', '3DCG', '2.5D', '2D動畫',
    'AI生成', 'MMD', 'Cosplay', '新番預告'
]);
assert.equal(home.list[0].vod_id, 'sample');
assert.equal(home.list[0].vod_remarks, '12:34');
assert.equal(home.filters[home.class[0].type_id].length, 3);
assert.equal(site.filterable, 1);
assert.equal(site.ext.userScript.endsWith('diagnostic/hanime1-home-v3.user.js?v=1'), true);
assert.match(site.ext.spider.categoryContent.loadUrl, /genre=\$\{tid\}.*page=\$\{pg:-1\}/);
const route = new URL(site.ext.spider.categoryContent.loadUrl
    .replace('${tid}', home.class[3].type_id)
    .replace('${pg:-1}', '2')
    .replace('${sort:-%E6%9C%80%E6%96%B0%E4%B8%8A%E5%B8%82}', home.filters[home.class[3].type_id][0].value[1].v)
    .replace('${date:-}', home.filters[home.class[3].type_id][1].value[1].v)
    .replace('${duration:-}', home.filters[home.class[3].type_id][2].value[2].v));
assert.deepEqual(Object.fromEntries(route.searchParams), {
    genre: '3DCG', page: '2', sort: '最新上傳', date: '過去 24 小時', duration: '5 分鐘 +'
});

const category = run('categoryContent', [home.class[3].type_id, '2', true, {}], 52);
assert.equal(category.list[0].vod_id, 'sample');
assert.equal(category.pagecount, 52);
console.log('Hanime1 home and category checks passed.');
