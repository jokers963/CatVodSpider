const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const formal = JSON.parse(read('json/luoyuqiu.json'));
const test = JSON.parse(read('json/luoyuqiu-subtitles-test.json'));
const jar = 'jar/gm_subs-public-subtitles-test-20261003.jar';
const md5 = read(`${jar}.md5`).toString().trim();
assert.equal(createHash('md5').update(read(jar)).digest('hex'), md5);
assert.equal(createHash('sha256').update(read(jar)).digest('hex'),
  '52a182633f21b6fa53f12bd6aa8279f8f15e1ebe36436f417938438a35d4fc04');
assert.equal(test.spider,
  `https://raw.githubusercontent.com/jokers963/CatVodSpider/feat/public-subtitles/${jar};md5;${md5}`);
assert.equal(test.sites.length, 6);
for (const site of test.sites) {
  assert.equal(site.ext.subtitleLibrary,
    'https://pub-662c4b411cfb4cf69f52f71f22140341.r2.dev/');
  assert.equal(site.ext.debug, false);
  assert.equal(site.jar, undefined);
  delete site.ext.subtitleLibrary;
}
test.spider = formal.spider;
assert.deepEqual(test, formal, 'Only candidate JAR and subtitleLibrary may differ from formal config');
console.log('Subtitle test config: isolated JAR, six library roots, formal settings preserved');
