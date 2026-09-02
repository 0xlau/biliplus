const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  parseHistoryLimit,
  normalizeQuery,
  normalizeHistory,
  mergeHistory,
  getAdditionalHistory,
  extractSearchQuery,
} = require('../scripts/hide-hot-search-list.js');

test('search history limit defaults to 20 and is bounded', () => {
  assert.equal(parseHistoryLimit(undefined), DEFAULT_HISTORY_LIMIT);
  assert.equal(parseHistoryLimit('0'), DEFAULT_HISTORY_LIMIT);
  assert.equal(parseHistoryLimit('30'), 30);
  assert.equal(parseHistoryLimit('999'), MAX_HISTORY_LIMIT);
});

test('queries are trimmed, whitespace-normalized, and capped', () => {
  assert.equal(normalizeQuery('  BiliPlus\n  搜索  '), 'BiliPlus 搜索');
  assert.equal(normalizeQuery(null), '');
  assert.equal(normalizeQuery('a'.repeat(120)).length, 100);
});

test('history is recent-first, de-duplicated, and limited', () => {
  assert.deepEqual(
    normalizeHistory([' 新词 ', 'BILIPLUS', 'biliplus', '', '旧词'], 3),
    ['新词', 'BILIPLUS', '旧词'],
  );
  assert.deepEqual(mergeHistory(['新词', '旧词'], ' 旧词 ', 20), ['旧词', '新词']);
  assert.deepEqual(mergeHistory(['旧词', '新词'], '第三条', 2), ['第三条', '旧词']);
});

test('only local records absent from native history are rendered', () => {
  assert.deepEqual(
    getAdditionalHistory(['最近', '原生已有', '更早'], ['原生已有', '最近'], 20),
    ['更早'],
  );
});

test('queries are captured only from Bilibili search pages', () => {
  assert.equal(
    extractSearchQuery('https://search.bilibili.com/all?keyword=BiliPlus%20%E6%B5%8B%E8%AF%95'),
    'BiliPlus 测试',
  );
  assert.equal(
    extractSearchQuery('https://www.bilibili.com/search?search_query=%E6%90%9C%E7%B4%A2'),
    '搜索',
  );
  assert.equal(
    extractSearchQuery('https://www.bilibili.com/video/BV1xx?keyword=not-a-search'),
    '',
  );
});
