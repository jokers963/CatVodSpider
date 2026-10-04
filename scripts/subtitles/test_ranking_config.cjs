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
assert.equal(formal.spider, 'https://jokers963.github.io/CatVodSpider/jar/gm_subs-v40.jar?v=40;md5;c6a36e891a26e269300069fe7c317fef');
assert.equal(hash('jar/gm_subs-v40.jar', 'sha256'), '3f9495e93e15b440b2704d51454506bd153ec3caf8a90395e0a37bf94010a605');
assert.equal(hash('jar/gm_subs-v40.jar', 'md5'), 'c6a36e891a26e269300069fe7c317fef');
assert.equal(read('jar/gm_subs-v40.jar.md5').toString().trim(), 'c6a36e891a26e269300069fe7c317fef');
assert.deepEqual(read('jar/gm_subs-v39.jar'), read(jar), 'Previous v39 rollback must reuse verified fix3 bytes');
assert.equal(hash('jar/gm_subs-v38.jar', 'sha256'), '52a182633f21b6fa53f12bd6aa8279f8f15e1ebe36436f417938438a35d4fc04');
test.spider = formal.spider;
assert.deepEqual(test, formal, 'Only test JAR and removal of library lookup may differ');
console.log('Ranking test config: old fix3 test isolated from formal v40, v39/v38 rollback preservation checked');
