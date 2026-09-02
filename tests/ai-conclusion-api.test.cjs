const test = require('node:test');
const assert = require('node:assert/strict');

const BiliApi = require('../scripts/common/bilibili-api.js');

test('AI conclusion includes login credentials and preserves the top-level code', async t => {
  const previousFetch = global.fetch;
  const previousUtils = global._UTILS;
  t.after(() => {
    global.fetch = previousFetch;
    global._UTILS = previousUtils;
  });

  global._UTILS = { getwts: async () => 'bvid=BV1&w_rid=signed' };
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      status: 200,
      async json() {
        return {
          code: 0,
          message: '0',
          data: { model_result: { summary: 'summary', outline: [] } },
        };
      },
    };
  };

  const result = await BiliApi.getAIConclusion({ bvid: 'BV1' });
  assert.match(request.url, /\/view\/conclusion\/get\?/);
  assert.equal(request.options.credentials, 'include');
  assert.equal(result.code, 0);
  assert.equal(result.model_result.summary, 'summary');
});
