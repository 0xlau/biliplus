const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'invalid-video-info.js'),
  'utf8'
);

function runFixture({ invalid = false } = {}) {
  let viewCalls = 0;
  let actionClicks = 0;
  const documentQueries = [];
  const boxQueries = [];
  const action = {
    children: [],
    textContent: '取消跳转',
    click() {
      actionClicks += 1;
      box.textContent = '前往首页';
    },
  };
  const box = {
    children: [action],
    textContent: '取消跳转',
    querySelectorAll(selector) {
      boxQueries.push(selector);
      return [action];
    },
  };
  const never = new Promise(() => {});
  const document = {
    body: { innerText: invalid ? '稿件不可见' : '正常播放中的视频' },
    documentElement: {},
    querySelector(selector) {
      documentQueries.push(selector);
      if (invalid && (selector === '.go-home-from-404' || selector.includes('.go-home-from-404'))) {
        return box;
      }
      return null;
    },
    querySelectorAll(selector) {
      documentQueries.push(selector);
      return [];
    },
  };
  const chrome = {
    storage: {
      sync: {
        get(_keys, callback) {
          callback({ 'biliplus-enable': true, 'invalid-video-info': true });
        },
      },
      local: {
        get(_keys, callback) { callback({}); },
        set(_value, callback) { callback?.(); },
        remove() {},
      },
    },
  };
  const timers = [];
  const context = vm.createContext({
    chrome,
    document,
    location: {
      href: 'https://www.bilibili.com/video/av3/',
      hostname: 'www.bilibili.com',
      pathname: '/video/av3/',
    },
    console,
    URL,
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    _UTILS: {
      getVideoIdFromUrl() { return { aid: 3, bvid: 'BV1fixture' }; },
      isUsableTitle() { return false; },
      isGoodCoverUrl() { return false; },
    },
    _BILIAPI: {
      getVideoView() {
        viewCalls += 1;
        return invalid ? never : Promise.resolve({ code: 0, data: {} });
      },
    },
  });
  vm.runInContext(source, context);
  return {
    get viewCalls() { return viewCalls; },
    get actionClicks() { return actionClicks; },
    documentQueries,
    boxQueries,
    timers,
  };
}

test('normal video pages do not trigger an extra official view request', async () => {
  const fixture = runFixture({ invalid: false });
  await Promise.resolve();
  assert.equal(fixture.viewCalls, 0);
  assert.equal(fixture.actionClicks, 0);
  assert.ok(fixture.timers.some(timer => timer.delay === 1200), 'late SPA DOM recheck should be scheduled');
});

test('invalid pages cancel redirect only inside the Bilibili 404 control', async () => {
  const fixture = runFixture({ invalid: true });
  await Promise.resolve();
  assert.equal(fixture.viewCalls, 1);
  assert.equal(fixture.actionClicks, 1);
  assert.deepEqual(fixture.boxQueries, ['.action-btn, button, a, span, div']);
  assert.equal(
    fixture.documentQueries.includes('.go-home-from-404 .action-btn, .action-btn, button, a, span, div'),
    false
  );
});
