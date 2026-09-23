const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

let challenged = true;
let result = "";
let shown = false;
let tick;
let onLoad;
const title = {getAttribute: () => null, textContent: "Test video"};
const image = {dataset: {src: "https://example.com/poster.jpg"}, src: "", getAttribute: () => null};
const card = {querySelector: selector => selector === "img" ? image : selector.startsWith(".detail h6") ? title : null};
const link = {href: "https://jable.tv/videos/test-1/", closest: () => card, parentElement: card};
const document = {
    readyState: "complete",
    title: "Just a moment...",
    querySelector: () => challenged ? {} : null,
    querySelectorAll: selector => selector.includes('a[href*="/videos/"]') && !challenged ? [link] : []
};
vm.runInNewContext(fs.readFileSync(require.resolve("./jable.user.js"), "utf8"), {
    document,
    location: {href: "https://jable.tv/"},
    unsafeWindow: {addEventListener: () => {}},
    GmSpiderInject: {
        GetSpiderArgs: () => '["homeContent","true"]',
        ShowWebview: () => { shown = true; },
        HideWebview: () => {},
        SetSpiderResult: value => { result = value; }
    },
    URL,
    setInterval: callback => { tick = callback; return 1; },
    clearInterval: () => {},
    setTimeout: callback => { onLoad = callback; }
});
onLoad();
assert.equal(shown, false);
assert.equal(result, "");
challenged = false;
document.title = "Jable";
tick();
assert.equal(JSON.parse(result).list[0].vod_id, "test-1");
