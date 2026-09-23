const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync(require.resolve("./freepornvideos.user.js"), "utf8");
function run(method, document) {
    let result;
    vm.runInNewContext(script, {
        document,
        location: {href: "https://www.freepornvideos.xxx/"},
        GmSpiderInject: {
            GetSpiderArgs: () => JSON.stringify(method === "detailContent" ? [method, ["1/test"]] : [method, "true"]),
            HideWebview: () => {},
            SetSpiderResult: value => { result = JSON.parse(value); }
        },
        URL,
        setInterval: () => 1,
        clearInterval: () => {}
    });
    return result;
}

const source = (label, selected) => ({
    src: `https://www.freepornvideos.xxx/get_file/${label}.mp4/`,
    getAttribute: key => key === "label" ? label : null,
    hasAttribute: key => key === "selected" && selected
});
const detail = run("detailContent", {
    title: "Video",
    querySelector: () => null,
    querySelectorAll: () => [source("2160p", false), source("720p", true)]
});
assert.equal(detail.list[0].vod_play_from, "720p$$$2160p");
assert.match(detail.list[0].vod_play_url, /^播放\$https:\/\/.*720p\.mp4\/\$\$\$播放\$https:\/\/.*2160p\.mp4\/$/);

const link = {href: "https://www.freepornvideos.xxx/videos/1/test/", getAttribute: () => "Test"};
const image = {dataset: {src: "https://img.freepornvideos.xxx/test.jpg"}};
const card = {querySelector: selector => selector.startsWith("a[") ? link : selector.startsWith("img[") ? image : null};
const home = run("homeContent", {
    querySelectorAll: selector => selector === ".list-videos .item" ? [card] : []
});
assert.equal(home.list[0].vod_id, "1/test");
assert.equal(home.list[0].vod_pic, image.dataset.src);
