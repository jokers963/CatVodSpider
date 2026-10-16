// Cloudflare 验证弹窗“先隐藏、宽限后才显示”测试（js/cfgrace/*.user.js）。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, 'cfgrace');
const files = ['missav', 'hanime1', 'airav', 'supjav', 'jav.guru', 'javguru', 'jable'];
const src = n => fs.readFileSync(path.join(dir, n + '.user.js'), 'utf8');

// 1) 共享片段在所有脚本逐字相同
const blockOf = s => { const m = s.match(/ *\/\/ ==LYQ-CF-GRACE-BEGIN==[\s\S]*?\/\/ ==LYQ-CF-GRACE-END==/); assert.ok(m, 'block missing'); return m[0]; };
const ref = blockOf(src('missav'));
for (const f of files) assert.equal(blockOf(src(f)), ref, f + ' shared block differs');
assert.ok(ref.includes('graceMs || 8000') && ref.includes('fallbackMs || 9500'), 'grace must stay under 10s');
assert.ok(!ref.includes('const cfGate ='), 'cfGate instantiation must stay outside shared block');
for (const f of files) {
    const body = src(f);
    const after = body.split('// ==LYQ-CF-GRACE-END==')[1] || '';
    assert.ok(/const cfGate = lyqCfGate\(/.test(after), f + ' must instantiate cfGate after shared block');
}
assert.ok(/lyqCfGate\(\{graceMs: 2000, fallbackMs: 2500\}\)/.test(src('hanime1')), 'hanime1 aggressive grace');
assert.ok(/lyqCfGate\(\{graceMs: 2000, fallbackMs: 2500\}\)/.test(src('supjav')), 'supjav aggressive grace');
for (const f of files.filter(n => n !== 'hanime1' && n !== 'supjav')) {
    assert.ok(/const cfGate = lyqCfGate\(\);/.test(src(f).split('// ==LYQ-CF-GRACE-END==')[1] || ''), f + ' keeps default grace');
}
for (const f of files) assert.ok(!/ShowWebview\(\)/.test(src(f).replace(ref, '').replace(/try \{ GmSpiderInject\.ShowWebview\(\); \} catch \(_\) \{\}\n\s*GmSpiderInject\.SetSpiderResult\(JSON\.stringify\(\{type: "match"\}\)\)/, '')),
    f + ' still calls ShowWebview outside the gate');

// 2) 宽限逻辑单元测试
const gateSrc = ref;
function makeGate(doc, opts) {
    let t = 1000, shows = 0;
    const ctx = {Date, GmSpiderInject: {ShowWebview() { shows++; }}, document: doc || {querySelectorAll: () => [], querySelector: () => null}};
    vm.createContext(ctx);
    vm.runInContext(gateSrc + '\nthis.lyqCfGate = lyqCfGate;', ctx);
    const gate = ctx.lyqCfGate(Object.assign({now: () => t}, opts || {}));
    return {gate, at: v => { t = 1000 + v; return gate.tick(true); }, off: v => { t = 1000 + v; return gate.tick(false); }, shows: () => shows};
}
const el = (w, h) => ({getBoundingClientRect: () => ({width: w, height: h})});
const docWith = ({turnstile = [], iframes = [], stageInput = false} = {}) => ({
    querySelectorAll: s => s === '.cf-turnstile' ? turnstile : s.startsWith('iframe') ? iframes : [],
    querySelector: s => s === '#challenge-stage' ? {querySelector: () => stageInput ? {} : null} : null
});
{ // 无交互元素：宽限内不显示，9.5s 兜底显示且只显示一次
    const g = makeGate();
    for (const v of [0, 400, 4000, 7999, 8000, 9000, 9499]) { g.at(v); assert.equal(g.shows(), 0, 'no show at ' + v); }
    g.at(9500); g.at(10000); g.at(12000);
    assert.equal(g.shows(), 1);
    assert.equal(g.gate.seenAt(), 1000);
}
{ // 宽限内标记消失（内容出现）：永不显示，再次出现重新计时
    const g = makeGate(docWith({turnstile: [el(300, 65)]}));
    g.at(0); g.at(5000); g.off(6000);
    g.at(9000); // 重新计时，不应显示
    assert.equal(g.shows(), 0);
    assert.equal(g.gate.seenAt(), 10000);
}
{ // 宽限后一旦出现可见 turnstile 立即显示（不等兜底）
    const doc = docWith(); const g = makeGate(doc);
    g.at(0); g.at(8000); assert.equal(g.shows(), 0);
    doc.querySelectorAll = s => s === '.cf-turnstile' ? [el(300, 65)] : [];
    g.at(8400); assert.equal(g.shows(), 1);
}
{ // 零尺寸 turnstile / iframe 不算交互；非零 iframe、#challenge-stage 内 input 算
    assert.equal(makeGate(docWith({turnstile: [el(0, 0)], iframes: [el(0, 0)]})).gate.interactive(), false);
    assert.equal(makeGate(docWith({iframes: [el(300, 65)]})).gate.interactive(), true);
    assert.equal(makeGate(docWith({stageInput: true})).gate.interactive(), true);
    let g = makeGate(docWith({iframes: [el(300, 65)]})); g.at(0); g.at(8100); assert.equal(g.shows(), 1);
}
{ // 宽限前即使有可交互元素也不显示
    const g = makeGate(docWith({turnstile: [el(300, 65)]})); g.at(0); g.at(7900); assert.equal(g.shows(), 0);
}
{ // 激进宽限 opts：2s 后可交互即显，2.5s 无条件兜底
    const g = makeGate(undefined, {graceMs: 2000, fallbackMs: 2500});
    for (const v of [0, 1000, 1999]) { g.at(v); assert.equal(g.shows(), 0, 'no show at ' + v); }
    g.at(2500); assert.equal(g.shows(), 1);
}

// 3) 脚本集成：MissAV / Hanime1
function runScript(name, method, args, state) {
    let result, tick;
    vm.runInNewContext(src(name), {
        document: state.document, unsafeWindow: {addEventListener() {}},
        location: {href: 'https://x.test/', hostname: 'x.test'}, Date: {now: () => state.now},
        performance: {timeOrigin: 0},
        GmSpiderInject: {GetSpiderArgs: () => JSON.stringify([method, ...args]), HideWebview() { state.hides = (state.hides || 0) + 1; },
            ShowWebview() { state.shows = (state.shows || 0) + 1; }, SetSpiderResult: t => { result = JSON.parse(t); }},
        setInterval: fn => { tick = fn; return 1; }, clearInterval() {}, setTimeout: fn => fn()
    });
    return {tick: now => { state.now = now; tick(); }, result: () => result};
}
for (const [name, msg] of [['missav', /验证/], ['hanime1', /验证/]]) {
    const state = {now: 0, shows: 0, document: {title: 'Just a moment', querySelector: s => /challenge/.test(s) ? {} : null,
        querySelectorAll: () => [], addEventListener() {}}};
    const r = runScript(name, 'homeContent', ['true'], state);
    if (name === 'hanime1') { // 首页不依赖内容也 ready，改用搜索使其等待；激进宽限 2s/2.5s
        const s2 = {now: 0, shows: 0, document: state.document};
        const r2 = runScript(name, 'searchContent', ['x', '1'], s2);
        for (const t of [0, 500, 1999]) r2.tick(t);
        assert.equal(s2.shows, 0, name + ' hidden during grace');
        r2.tick(2600); assert.equal(s2.shows, 1, name + ' aggressive fallback show');
        r2.tick(25000); assert.match(r2.result().msg, msg); assert.ok(s2.hides >= 1);
        continue;
    }
    const s = {now: 0, shows: 0, document: state.document};
    const m = runScript(name, 'detailContent', ['abf-381'], s);
    for (const t of [0, 400, 5000, 9000]) m.tick(t);
    assert.equal(s.shows, 0, name + ' hidden during grace');
    m.tick(9600); assert.equal(s.shows, 1, name + ' fallback show');
    m.tick(25000); assert.match(m.result().msg, msg); assert.ok(s.hides >= 1, 'HideWebview on finish');
}
{ // MissAV：宽限内验证消失 -> 永不显示
    const doc = {title: 'Just a moment', querySelector: s => /challenge/.test(s) ? {} : null, querySelectorAll: () => [], addEventListener() {}};
    const s = {now: 0, shows: 0, document: doc};
    const m = runScript('missav', 'detailContent', ['abf-381'], s);
    m.tick(0); m.tick(3000);
    doc.title = 'MissAV'; doc.querySelector = () => null;
    for (const t of [3400, 9600, 20000]) m.tick(t);
    assert.equal(s.shows, 0);
}
console.log('cfgrace: shared block identical in', files.length, 'scripts; grace/fallback/interactive/vanish cases pass');

// 4) 测试入口：只引用 cfgrace 副本，且 ?v 高于正式；正式配置不引用 cfgrace
const root = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'json/luoyuqiu-cfgrace-test.json'), 'utf8'));
const formal = JSON.parse(fs.readFileSync(path.join(root, 'json/luoyuqiu.json'), 'utf8'));
assert.ok(!JSON.stringify(formal).includes('cfgrace'), 'formal config must not reference cfgrace');
const ver = u => Number(u.match(/\?v=(\d+)$/)[1]);
assert.deepEqual(cfg.sites.map(s => s.key), ['missav', 'hanime1', 'javguru', 'jav_guru', 'supjav']);
assert.equal(cfg.spider, formal.spider);
for (const s of cfg.sites) {
    const f = formal.sites.find(x => x.key === s.key);
    assert.match(s.ext.userScript, /\/js\/cfgrace\/[\w.]+\.user\.js\?v=\d+$/);
    assert.ok(ver(s.ext.userScript) > ver(f.ext.userScript), s.key + ' ?v must be bumped');
    assert.ok(fs.existsSync(path.join(dir, s.ext.userScript.match(/cfgrace\/([\w.]+)\?/)[1])));
    const a = JSON.parse(JSON.stringify(s)), b = JSON.parse(JSON.stringify(f));
    for (const x of [a, b]) { delete x.name; delete x.ext.userScript; }
    assert.deepEqual(a, b, s.key + ' must equal formal entry except name/userScript');
}
console.log('cfgrace: test config verified');
