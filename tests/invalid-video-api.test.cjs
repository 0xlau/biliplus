const test = require('node:test');
const assert = require('node:assert/strict');

const BiliApi = require('../scripts/common/bilibili-api.js');
const Utils = require('../scripts/common/utils.js');

test('archive API sends provider identifiers instead of caller-controlled URLs', async t => {
  const previousChrome = global.chrome;
  const previousUtils = global._UTILS;
  t.after(() => {
    global.chrome = previousChrome;
    global._UTILS = previousUtils;
  });

  const messages = [];
  global._UTILS = Utils;
  global.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        messages.push(message);
        if (message.provider === 'biliplus-aidinfo') {
          callback({
            ok: true,
            json: {
              code: 0,
              data: {
                3: {
                  title: '归档标题',
                  pic: 'https://img.biliplus.com/bfs/archive/hash.jpg',
                  author: '归档 UP',
                  mid: 42,
                },
              },
            },
          });
          return;
        }
        callback({ ok: false, error: 'unexpected-provider' });
      },
    },
  };

  const result = await BiliApi.getBiliplusAidInfo([3]);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], {
    type: 'biliplus-archive-fetch',
    provider: 'biliplus-aidinfo',
    aids: ['3'],
  });
  assert.equal(Object.hasOwn(messages[0], 'url'), false);
  assert.equal(result.get('3').title, '归档标题');
});
