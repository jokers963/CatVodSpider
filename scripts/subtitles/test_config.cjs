const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const formal = JSON.parse(read('json/luoyuqiu.json'));
const test = JSON.parse(read('json/luoyuqiu-subtitles-test.json'));
const jar = 'jar/gm_subs-public-subtitles-test-20261003.jar';
const releaseJar = 'jar/gm_subs-v38.jar';
const md5 = read(`${jar}.md5`).toString().trim();
assert.equal(createHash('md5').update(read(jar)).digest('hex'), md5);
assert.equal(createHash('sha256').update(read(jar)).digest('hex'),
  '52a182633f21b6fa53f12bd6aa8279f8f15e1ebe36436f417938438a35d4fc04');
assert.equal(test.spider,
  `https://raw.githubusercontent.com/jokers963/CatVodSpider/feat/public-subtitles/${jar};md5;${md5}`);
const enabledKeys = ['missav', 'av01', 'rou', 'hanime1', 'javguru'];
assert.deepEqual(test.sites.map(site => site.key), enabledKeys);
for (const site of test.sites) {
  assert.equal(site.ext.subtitleLibrary,
    'https://pub-662c4b411cfb4cf69f52f71f22140341.r2.dev/');
  assert.equal(site.ext.debug, false);
  assert.equal(site.jar, undefined);
  delete site.ext.subtitleLibrary;
}

assert.equal(formal.spider,
  `https://jokers963.github.io/CatVodSpider/${releaseJar}?v=38;md5;${md5}`);
assert.equal(createHash('md5').update(read(releaseJar)).digest('hex'), md5);
assert.equal(read(`${releaseJar}.md5`).toString().trim(), md5);
assert.deepEqual(read(releaseJar), read(jar), 'Release must use the phone-tested sanitized candidate');
assert.equal(createHash('sha256').update(read('jar/gm_subs-v37.jar')).digest('hex'),
  '03b7bba54a47c958b5b11b04e96382a4687b01825eade40295976443b5af0021');
assert.equal(read('jar/gm_subs-v37.jar.md5').toString().trim(), '004df47ae36384de6fe14d5e31f23ff7');
assert.deepEqual(formal.sites.map(site => site.key), enabledKeys);
assert.ok(!formal.sites.some(site => site.key === 'memojav'));
for (const site of formal.sites) {
  assert.equal(site.ext.subtitleLibrary,
    'https://pub-662c4b411cfb4cf69f52f71f22140341.r2.dev/');
  assert.equal(site.ext.debug, false);
  assert.equal(site.jar, undefined);
  delete site.ext.subtitleLibrary;
}
test.spider = formal.spider;
assert.deepEqual(test, formal, 'Only candidate JAR and subtitleLibrary may differ from formal config');
console.log('Subtitle config: v38 unchanged, five library roots, Jable temporarily disabled');
