const test = require('node:test');
const assert = require('node:assert/strict');

const Utils = require('../scripts/common/utils.js');

test('converts between known av and BV identifiers', () => {
  assert.equal(Utils.avToBv(170001), 'BV17x411w7KC');
  assert.equal(Utils.bvToAv('BV17x411w7KC'), 170001);
  for (const aid of [2, 114514, 545479594, 1_000_000_000]) {
    assert.equal(Utils.bvToAv(Utils.avToBv(aid)), aid);
  }
  assert.equal(Utils.bvToAv('BV27x411w7KC'), null);
  assert.equal(Utils.avToBv('not-a-number'), null);
});

test('extracts valid video identifiers without guessing unrelated URLs', () => {
  assert.deepEqual(
    Utils.getVideoIdFromUrl('https://www.bilibili.com/video/BV17x411w7KC/?spm_id_from=xxx'),
    { bvid: 'BV17x411w7KC', aid: 170001 }
  );
  assert.deepEqual(
    Utils.getVideoIdFromUrl('https://www.bilibili.com/video/av170001/'),
    { aid: 170001, bvid: 'BV17x411w7KC' }
  );
  assert.deepEqual(Utils.getVideoIdFromUrl('https://www.bilibili.com/'), {});
  assert.deepEqual(Utils.getVideoIdFromUrl('javascript:;'), {});
});

test('normalizes trusted biliplus archive covers back to the Bilibili CDN', () => {
  const archived = 'https://img.biliplus.com/bfs/archive/9b53b363e0f6c16b3a73aa38f8a8c062eaff6187.jpg';
  assert.equal(
    Utils.normalizeCoverUrl(archived),
    'https://i0.hdslb.com/bfs/archive/9b53b363e0f6c16b3a73aa38f8a8c062eaff6187.jpg'
  );
  assert.equal(Utils.isGoodCoverUrl(archived), true);
  assert.equal(Utils.isGoodCoverUrl('//i0.hdslb.com/bfs/storyframe/x.jpg'), true);
  assert.equal(Utils.isGoodCoverUrl('https://www.jijidown.com/img/x.jpg'), false);
  assert.equal(Utils.isGoodCoverUrl('https://img.biliplus.com.evil.example/bfs/archive/x.jpg'), false);
  assert.equal(Utils.isGoodCoverUrl('https://i0.hdslb.com.evil.example/bfs/archive/x.jpg'), false);
  assert.equal(Utils.isGoodCoverUrl('https://i0.hdslb.com/bfs/face/x.jpg'), false);
  assert.equal(Utils.isGoodCoverUrl('javascript:bfs/archive'), false);
});

test('fills missing favorite ids only when list order has a trustworthy anchor', () => {
  const bvid = 'BV17x411w7KC';
  const filled = Utils.zipFillMissingIds(
    [{ aid: 170001, bvid }, {}, { aid: 2 }],
    [
      { id: 170001, bvid },
      { id: 999, bvid: 'BVxxxxxxxx' },
      { id: 2, bv_id: Utils.avToBv(2) },
    ]
  );
  assert.ok(filled);
  assert.equal(filled[1].aid, 999);
  assert.equal(filled[1].bvid, 'BVxxxxxxxx');
  assert.equal(Utils.zipFillMissingIds([{}], [{ id: 1 }]), null);
  assert.equal(Utils.zipFillMissingIds([{ aid: 1 }, { aid: 2 }], [{ id: 1 }]), null);
  assert.equal(Utils.zipFillMissingIds([{ aid: 1 }, {}], [{ id: 2 }, { id: 3 }]), null);
});
