const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const hash = (file, type) => createHash(type).update(read(file)).digest('hex');
const formal = JSON.parse(read('json/luoyuqiu.json'));
const test = JSON.parse(read('json/luoyuqiu-subtitle-ranking-test.json'));
const jar = 'jar/gm_subs-subtitle-ranking-test-20261003-fix3.jar';
const md5 = '28cd05f6a9e4f91fe333a916bb76edaa';
assert.equal(hash(jar, 'md5'), md5);
assert.equal(read(`${jar}.md5`).toString().trim(), md5);
assert.equal(hash(jar, 'sha256'), '9c72a25d70de9732c7d9d3b0adedc94fd5942a0a8688df739dc01fa57a1bec0c');
assert.equal(read(jar).length, 1223148);
assert.equal(test.spider, `https://raw.githubusercontent.com/jokers963/CatVodSpider/feat/subtitle-rule-ranking/${jar};md5;${md5}`);
assert.deepEqual(test.sites.map(site => site.key), ['missav', 'av01', 'rou', 'hanime1', 'javguru']);
for (const site of test.sites) {
  assert.equal(site.ext.subtitleLibrary, undefined, 'Test must exercise Xunlei, not a public-library hit');
  assert.equal(site.ext.debug, false);
  assert.equal(site.jar, undefined);
}
for (const site of formal.sites) {
  assert.equal(site.ext.subtitleLibrary, 'https://pub-662c4b411cfb4cf69f52f71f22140341.r2.dev/');
  delete site.ext.subtitleLibrary;
}
assert.equal(formal.spider, 'https://jokers963.github.io/CatVodSpider/jar/gm_subs-v38.jar?v=38;md5;817f14e37e342691a5d0cab2fabd5b73');
assert.equal(hash('jar/gm_subs-v38.jar', 'sha256'), '52a182633f21b6fa53f12bd6aa8279f8f15e1ebe36436f417938438a35d4fc04');
test.spider = formal.spider;
assert.deepEqual(test, formal, 'Only test JAR and removal of library lookup may differ');
console.log('Ranking test config: sanitized JAR hashes, Xunlei-only isolation and formal v38 preservation checked');
