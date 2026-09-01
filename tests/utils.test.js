/**
 * scripts/common/utils.js 纯函数冒烟测试
 *
 * 运行：node tests/utils.test.js
 * 覆盖 BV/av 互转、URL 提取、失效标题/封面校验、收藏夹对齐。
 * 项目没有测试基建，这里用 node:assert + vm 直接加载 class，零依赖。
 */
const assert = require('node:assert/strict');
// vm 上下文里创建的对象跨 realm，原型不同，对象比较用不校验原型的 legacy deepEqual
const { deepEqual } = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'common', 'utils.js'), 'utf8');
const context = vm.createContext({ URL });
vm.runInContext(src, context);
const _UTILS = vm.runInContext('_UTILS', context);

// ---------- BV/av 互转 ----------
assert.equal(_UTILS.avToBv(170001), 'BV17x411w7KC');
assert.equal(_UTILS.bvToAv('BV17x411w7KC'), 170001);

for (const aid of [2, 114514, 545479594, 1_000_000_000]) {
  assert.equal(_UTILS.bvToAv(_UTILS.avToBv(aid)), aid, `round trip av${aid}`);
}

assert.equal(_UTILS.bvToAv('17x411w7KC'), 170001);
assert.equal(_UTILS.bvToAv('BV17x411w7KC0'), null, '长度不是 12 应拒绝');
assert.equal(_UTILS.bvToAv('BV27x411w7KC'), null, '第三位不是 1 应拒绝');
assert.equal(_UTILS.bvToAv(''), null);
assert.equal(_UTILS.bvToAv(null), null);
assert.equal(_UTILS.bvToAv(undefined), null);
assert.equal(_UTILS.avToBv(null), null);
assert.equal(_UTILS.avToBv(undefined), null);
assert.equal(_UTILS.avToBv(''), null);
assert.equal(_UTILS.avToBv('not-a-number'), null);
assert.equal(_UTILS.avToBv(-1), null);

// ---------- getVideoIdFromUrl ----------
deepEqual(_UTILS.getVideoIdFromUrl('https://www.bilibili.com/video/BV17x411w7KC/?spm_id_from=xxx'), { bvid: 'BV17x411w7KC', aid: 170001 });
deepEqual(_UTILS.getVideoIdFromUrl('https://www.bilibili.com/video/av170001/'), { aid: 170001, bvid: 'BV17x411w7KC' });
deepEqual(_UTILS.getVideoIdFromUrl('https://www.bilibili.com/video/BV17x411w7KC?aid=2'), { bvid: 'BV17x411w7KC', aid: 170001 }, 'BV 优先于 aid 参数');
deepEqual(_UTILS.getVideoIdFromUrl('https://www.bilibili.com/'), {});
deepEqual(_UTILS.getVideoIdFromUrl('javascript:;'), {});
deepEqual(_UTILS.getVideoIdFromUrl(null), {});

// ---------- 标题校验 ----------
for (const title of _UTILS.INVALID_TITLE_SET) {
  assert.equal(_UTILS.isInvalidVideoTitle(title), true, title);
  assert.equal(_UTILS.isUsableTitle(title, 1), false, title);
}
assert.equal(_UTILS.isUsableTitle('', 1), false);
assert.equal(_UTILS.isUsableTitle('  ', 1), false);
assert.equal(_UTILS.isUsableTitle('170001', 170001), false, '标题等于 aid 视为占位');
assert.equal(_UTILS.isUsableTitle('正常标题', 1), true);
assert.equal(_UTILS.isInvalidVideoTitle('正常标题'), false);

// ---------- 封面 URL ----------
assert.equal(_UTILS.normalizeCoverUrl('//i0.hdslb.com/bfs/archive/x.jpg'), 'https://i0.hdslb.com/bfs/archive/x.jpg');
assert.equal(_UTILS.normalizeCoverUrl('http://i0.hdslb.com/bfs/archive/x.jpg'), 'https://i0.hdslb.com/bfs/archive/x.jpg');
assert.equal(_UTILS.isGoodCoverUrl('http://i0.hdslb.com/bfs/archive/x.jpg'), true);
assert.equal(_UTILS.isGoodCoverUrl('//i0.hdslb.com/bfs/storyframe/x.jpg'), true, 'storyframe 首帧图也算封面');
assert.equal(_UTILS.isGoodCoverUrl('https://www.jijidown.com/img/x.jpg'), false, '非 B 站图床拒绝');
assert.equal(_UTILS.isGoodCoverUrl('https://evil.example/bfs/archive/x.jpg'), false, '只允许 hdslb 域名');
assert.equal(_UTILS.isGoodCoverUrl('https://i0.hdslb.com.evil.example/bfs/archive/x.jpg'), false, '不能靠后缀骗过');
assert.equal(_UTILS.isGoodCoverUrl('https://i0.hdslb.com/bfs/face/x.jpg'), false, '头像图床不算封面');
assert.equal(_UTILS.isGoodCoverUrl('javascript:bfs/archive'), false);
assert.equal(_UTILS.isGoodCoverUrl(''), false);

// ---------- 收藏夹 URL ----------
assert.equal(_UTILS.getFavMediaIdFromUrl('https://www.bilibili.com/list/ml123456'), '123456');
assert.equal(_UTILS.getFavMediaIdFromUrl('https://space.bilibili.com/1/favlist?fid=99'), '99');
assert.equal(_UTILS.getFavMediaIdFromUrl('https://space.bilibili.com/1/favlist?fav_id=88'), '88');
assert.equal(_UTILS.getFavMediaIdFromUrl('https://space.bilibili.com/1/favlist'), null, '没有 fid 不得猜默认收藏夹');
assert.equal(_UTILS.getFavMediaIdFromUrl('https://space.bilibili.com/1/favlist?fid=abc'), null);
assert.equal(_UTILS.getPageNumberFromUrl('https://space.bilibili.com/1/favlist?fid=99&pn=3'), 3);
assert.equal(_UTILS.getPageNumberFromUrl('https://www.bilibili.com/list/ml1?page=2'), 2);
assert.equal(_UTILS.getPageNumberFromUrl('https://www.bilibili.com/list/ml1'), null);

// ---------- zipFillMissingIds ----------
{
  const bvid = 'BV17x411w7KC';
  const filled = _UTILS.zipFillMissingIds(
    [{ aid: 170001, bvid }, { titleEl: 'invalid' }, { aid: 2 }],
    [
      { id: 170001, bvid },
      { id: 999, bvid: 'BVxxxxxxxx' },
      { id: 2, bv_id: _UTILS.avToBv(2) }
    ]
  );
  assert.ok(filled, '有锚点且无冲突时应对齐');
  assert.equal(filled[1].aid, 999);
  assert.equal(filled[1].bvid, 'BVxxxxxxxx');
}

assert.equal(_UTILS.zipFillMissingIds([{ title: '已失效' }], [{ id: 1 }]), null, '没有任何锚点不得按下标猜');
assert.equal(_UTILS.zipFillMissingIds([{ aid: 1 }, { aid: 2 }], [{ id: 1 }]), null, '长度不一致应拒绝');
assert.equal(_UTILS.zipFillMissingIds([{ aid: 1 }, {}], [{ id: 2 }, { id: 3 }]), null, '锚点冲突应拒绝');
{
  const filled = _UTILS.zipFillMissingIds([{ bvid: 'BV17x411w7KC' }, {}], [{ id: 170001, bvid: 'bv17x411w7KC' }, { id: 8, bvid: 'BVother' }]);
  assert.ok(filled, 'bvid 大小写不同仍算锚点');
  assert.equal(filled[1].aid, 8);
}

console.log('ok - utils 纯函数测试全部通过');
