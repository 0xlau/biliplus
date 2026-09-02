const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_RESPONSE_BYTES,
  buildArchiveUrl,
  fetchArchiveJson,
  installArchiveProxy,
} = require('../scripts/background/archive-proxy.js');

function jsonResponse(value, overrides = {}) {
  const text = JSON.stringify(value);
  return {
    ok: true,
    status: 200,
    headers: { get: () => String(Buffer.byteLength(text)) },
    text: async () => text,
    ...overrides,
  };
}

test('constructs only known provider URLs from validated aid values', () => {
  assert.equal(
    buildArchiveUrl({ provider: 'biliplus-view', aid: 114514 }),
    'https://www.biliplus.com/api/view?id=114514'
  );
  assert.equal(
    buildArchiveUrl({ provider: 'jijidown-info', aid: '3' }),
    'https://www.jijidown.com/api/v1/video/get_info?id=3'
  );
  assert.equal(
    buildArchiveUrl({ provider: 'biliplus-aidinfo', aids: [3, '114514', 3] }),
    'https://www.biliplus.com/api/aidinfo?aid=3%2C114514'
  );
  assert.throws(() => buildArchiveUrl({ provider: 'biliplus-view', aid: '../admin' }), /invalid-aid/);
  assert.throws(() => buildArchiveUrl({ provider: 'https://evil.example/', aid: 3 }), /unknown-provider/);
  assert.throws(
    () => buildArchiveUrl({ provider: 'biliplus-aidinfo', aids: Array.from({ length: 21 }, (_, index) => index + 1) }),
    /invalid-aids/
  );
});

test('archive requests omit credentials, reject redirects, and return parsed JSON', async () => {
  let request;
  const result = await fetchArchiveJson('https://www.biliplus.com/api/view?id=3', async (url, options) => {
    request = { url, options };
    return jsonResponse({ code: 0, title: '归档标题' });
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.json, { code: 0, title: '归档标题' });
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.cache, 'no-store');
});

test('archive proxy rejects oversized and malformed responses', async () => {
  const declaredTooLarge = await fetchArchiveJson('https://example.test', async () =>
    jsonResponse({}, { headers: { get: () => String(MAX_RESPONSE_BYTES + 1) } })
  );
  assert.equal(declaredTooLarge.error, 'response-too-large');

  const actualTooLarge = await fetchArchiveJson('https://example.test', async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => 'x'.repeat(MAX_RESPONSE_BYTES + 1),
  }));
  assert.equal(actualTooLarge.error, 'response-too-large');

  const malformed = await fetchArchiveJson('https://example.test', async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => '{not-json',
  }));
  assert.equal(malformed.error, 'invalid-json');
});

test('message listener refuses unknown providers before any fetch can occur', () => {
  let listener;
  const runtime = {
    id: 'extension-id',
    onMessage: { addListener(callback) { listener = callback; } },
  };
  installArchiveProxy(runtime);
  let response;
  const keepAlive = listener(
    { type: 'biliplus-archive-fetch', provider: 'arbitrary-url', url: 'https://evil.example/' },
    { id: 'extension-id' },
    value => { response = value; }
  );
  assert.equal(keepAlive, false);
  assert.equal(response.ok, false);
  assert.equal(response.error, 'unknown-provider');
});
