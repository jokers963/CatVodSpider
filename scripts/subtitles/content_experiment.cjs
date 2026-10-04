// Offline only. Consumes frozen originals + exact GMSubs reports; never fetches or repairs subtitles.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const trim = text => text.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
const visible = text => trim(text.replace(/<[^>]*>|[{][^}]*[}]/g, '').replace(/[ \t\n\v\f\r]+/g, ' '));
const timing = /^[ \t\n\v\f\r]*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3}|\d{2}:\d{2}[,.]\d{1,3})[ \t]*(?:-->)[ \t]*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3}|\d{2}:\d{2}[,.]\d{1,3})[^\r\n]*$/m;
function time(value) {
  const parts = value.replace(',', '.').split(':').map(Number);
  const seconds = parts.pop(), minutes = parts.pop(), hours = parts.pop() || 0;
  if (minutes >= 60 || seconds >= 60) throw Error('Bad timestamp');
  return hours * 3600000 + minutes * 60000 + Math.round(seconds * 1000);
}
function parse(bytes) {
  const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le'
    : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
  const text = new TextDecoder(encoding, {fatal: true}).decode(bytes).replace(/\ufeff/g, '').replace(/\r\n?/g, '\n');
  if (/\[events\]/i.test(text)) throw Error('ASS: use runtime report only');
  const cues = [], vtt = trim(text).startsWith('WEBVTT');
  for (const block of text.split(/\n[ \t]*\n/)) {
    const match = timing.exec(block);
    if (!match) {
      const header = trim(block);
      if (header && !/^\d+$/.test(header) && !(vtt && /^(WEBVTT|NOTE|STYLE|REGION)/.test(header)))
        throw Error('Unsupported subtitle block');
      continue;
    }
    const body = block.slice(match.index + match[0].length);
    if (body.includes('-->')) throw Error('Incomplete cue separation');
    cues.push({start: time(match[1]), end: time(match[2]), text: visible(body)});
  }
  if (cues.length > 20000) throw Error('Too many cues');
  return cues;
}
function fingerprint(cues) {
  return hash(cues.map(c => `${c.start}:${c.end}:${c.text.length}:${c.text}\n`).join(''));
}
// Observations only: names, short utterances and punctuation style are NOT penalties.
function metrics(cues) {
  const texts = cues.map(c => c.text), counts = new Map();
  for (const text of texts) if ((text.match(/\p{Script=Han}/gu) || []).length >= 6)
    counts.set(text, (counts.get(text) || 0) + 1);
  const count = re => texts.filter(t => re.test(t)).length;
  return {cues: cues.length, meanChars: texts.reduce((n, t) => n + t.length, 0) / Math.max(1, cues.length),
    short: texts.filter(t => t.length <= 3).length, long: texts.filter(t => t.length >= 40).length,
    mixedLatin: count(/\p{Script=Han}.*[A-Za-z]|[A-Za-z].*\p{Script=Han}/u),
    unfinishedConnector: count(/(?:所以|但是|不过|因为|如果|虽然|然後|然后)[。！？.!?…\s]*$/u),
    adjacentRepeat: texts.filter((t, i) => i && t.length >= 6 && t === texts[i - 1]).length,
    mostRepeatedLong: Math.max(0, ...counts.values())};
}
function nearBody(a, b) {
  if (Math.min(a.length, b.length) < 100 || Math.abs(a.length - b.length) > 6) return false;
  for (let shift = -3; shift <= 3; shift++) {
    let matched = 0, substantial = 0;
    for (let i = 3; i < a.length - 3; i++) {
      const j = i + shift;
      if (j < 3 || j >= b.length - 3 || a[i].text !== b[j].text) continue;
      matched++;
      if ((a[i].text.match(/\p{Script=Han}/gu) || []).length >= 6) substantial++;
    }
    if (matched / Math.max(a.length - 6, b.length - 6) >= 0.995 && substantial >= 100) return true;
  }
  return false;
}
function truncatedPrefix(shorter, longer) {
  if (shorter.length < 100 || shorter.length > longer.length * .85) return false;
  if (Math.max(...longer.map(c => c.end)) - Math.max(...shorter.map(c => c.end)) < 600000) return false;
  // Last two cues may have incomplete content/time precision at EOF; the preceding prefix must match exactly.
  return shorter.slice(0, -2).every((c, i) => c.text === longer[i].text
    && c.start === longer[i].start && c.end === longer[i].end);
}
function reorder(rows) {
  const cut = new Map();
  for (const row of rows) if (row.cues) for (const full of rows) {
    if (full.cues && full.healthy && truncatedPrefix(row.cues, full.cues)) { cut.set(row.api, full.api); break; }
  }
  const sorted = [...rows].sort((a, b) => (b.score - (cut.has(b.api) ? 30 : 0)) - (a.score - (cut.has(a.api) ? 30 : 0)));
  const result = [], deferred = [], reps = [], families = new Map();
  let band = sorted[0]?.score || 0;
  for (const row of sorted) {
    const score = row.score - (cut.has(row.api) ? 30 : 0);
    if (!row.healthy || cut.has(row.api) || band - score > 3) {
      result.push(...deferred.splice(0)); reps.length = 0; band = score;
    }
    const same = !cut.has(row.api) && row.healthy && reps.find(r => nearBody(row.cues, r.cues));
    if (same) { families.set(row.api, same.api); deferred.push(row); }
    else { if (row.healthy && !cut.has(row.api)) reps.push(row); result.push(row); }
  }
  result.push(...deferred);
  return {rows: result, cut, families};
}
function experiment(report, originals) {
  const evidence = new Map(report.details.map(d => [d.url, d]));
  const rows = report.ranked.map((row, i) => {
    const q = evidence.get(row.url), file = path.basename(new URL(row.url).pathname);
    const bytes = fs.readFileSync(path.join(originals, file));
    let cues, unavailable;
    if (q?.fingerprint) try {
      cues = parse(bytes);
      assert.equal(fingerprint(cues), q.fingerprint, 'Runtime fingerprint mismatch');
    } catch (error) { cues = undefined; unavailable = error.message; }
    if (!Number.isFinite(q.contentScore)) throw Error('Re-run SubtitleRankingCheck to export contentScore');
    return {api: q.apiOrder, previous: i + 1, file, rawSha256: hash(bytes), score: q.contentScore,
      healthy: !!cues && q.contentScore >= 100 && q.invalid === 0 && !cues.some(c => /[\x00\ufffd\p{Private_Use}]/u.test(c.text)),
      cues, metrics: cues ? metrics(cues) : undefined, unavailable: unavailable || q.ungraded};
  });
  const ranked = reorder(rows);
  assert.deepEqual(ranked.rows.map(r => r.file).sort(), rows.map(r => r.file).sort(), 'Candidate loss');
  for (const row of rows) assert.equal(hash(fs.readFileSync(path.join(originals, row.file))), row.rawSha256);
  return {code: report.code, before: rows.map(r => r.api), after: ranked.rows.map(r => r.api),
    rows: ranked.rows.map(({cues, healthy, ...row}, i) => ({...row, proposed: i + 1,
      familyOf: ranked.families.get(row.api), truncatedAgainst: ranked.cut.get(row.api)}))};
}
function selfTest() {
  const cues = Array.from({length: 250}, (_, i) => ({start: i * 5000, end: i * 5000 + 1000, text: `今天一起去公园散步${i}`}));
  assert(nearBody(cues, cues.map(c => ({...c, start: c.start + 2000, end: c.end + 2000}))));
  assert(nearBody(cues, cues.map((c, i) => ({...c, text: i === 0 ? '署名不同' : c.text}))));
  assert(!nearBody(cues, cues.map((c, i) => ({...c, text: i % 10 ? c.text : `换一种表达${i}`}))));
  assert(!nearBody(cues.map(c => ({...c, text: '好的'})), cues.map(c => ({...c, text: '好的'}))));
  assert(truncatedPrefix(cues.slice(0, 110), cues));
  assert(!truncatedPrefix(cues.slice(0, 110).map(c => ({...c, start: c.start + 1})), cues));
  assert(!truncatedPrefix(cues.slice(0, 230), cues));
  assert(!truncatedPrefix(cues.slice(0, 110).map(c => ({...c, text: '其他剪辑'})), cues));
  assert.equal(parse(Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n2025\n'))[0].text, '2025');
  assert.throws(() => parse(Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n你好\n\n2\n00:03\n')));
  const rows = [{api: 1, score: 120, healthy: true, cues},
    {api: 2, score: 120, healthy: true, cues: cues.map(c => ({...c, start: c.start + 2000}))},
    {api: 3, score: 119, healthy: true, cues: cues.map(c => ({...c, text: `其他对白表达${c.start}`}))},
    {api: 4, score: 120, healthy: true, cues: cues.slice(0, 110)},
    {api: 5, score: 50}];
  assert.deepEqual(reorder(rows).rows.map(r => r.api), [1, 3, 2, 4, 5]);
  assert.equal(metrics([{text: '因为明天还有工作，所以。'}]).unfinishedConnector, 1);
  assert.equal(metrics([{text: '因为明天还有工作，所以早点回家。'}]).unfinishedConnector, 0);
  console.log('content experiment self-check passed');
}
if (require.main === module) {
  if (process.argv[2] === '--self-test') selfTest();
  else {
    const [casesFile, output] = process.argv.slice(2);
    if (!casesFile || !output) throw Error('Usage: node content_experiment.cjs cases.json new-output.json');
    const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
    const results = cases.map(c => experiment(JSON.parse(fs.readFileSync(c.report, 'utf8')), c.originals));
    fs.writeFileSync(output, JSON.stringify(results, null, 2), {flag: 'wx'});
    for (const r of results) console.log(`${r.code}: ${r.before.join(',')} -> ${r.after.join(',')}`);
  }
}
module.exports = {parse, fingerprint, metrics, nearBody, truncatedPrefix, reorder, experiment};
