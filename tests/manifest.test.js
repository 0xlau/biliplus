/**
 * manifest.json 结构性检查
 *
 * 运行：node tests/manifest.test.js
 *
 * 核心不变量：同一个 js 文件不允许出现在「matches 可能重叠」的两个
 * content_scripts entry 中。扩展的 content scripts 共享同一隔离世界，
 * 同一文件被注入两次时，顶层的 class/let/const 会重复声明直接抛
 * SyntaxError（本项目历史上就存在该问题）。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function hostOf(pattern) {
  const m = /^[a-z*]+:\/\/([^/]+)/i.exec(pattern);
  return m ? m[1] : null;
}

// Chrome 匹配规则里 *.example.com 同时覆盖裸域和子域
function hostsOverlap(a, b) {
  if (a === b) {
    return true;
  }
  for (const [x, y] of [
    [a, b],
    [b, a]
  ]) {
    if (x.startsWith('*.') && (y === x.slice(2) || y.endsWith(x.slice(1)))) {
      return true;
    }
  }
  return false;
}

function entriesOverlap(e1, e2) {
  return e1.matches.some(p1 => e2.matches.some(p2 => hostsOverlap(hostOf(p1), hostOf(p2))));
}

// 1. content script 文件必须真实存在
for (const entry of manifest.content_scripts) {
  for (const js of entry.js || []) {
    assert.ok(fs.existsSync(path.join(root, js)), `文件不存在: ${js}`);
  }
  for (const css of entry.css || []) {
    assert.ok(fs.existsSync(path.join(root, css)), `文件不存在: ${css}`);
  }
}

// 2. 重复出现在多个 entry 的 js 文件，这些 entry 的 matches 必须两两不相交
const owners = new Map(); // js -> [entryIndex]
manifest.content_scripts.forEach((entry, i) => {
  for (const js of entry.js || []) {
    if (!owners.has(js)) {
      owners.set(js, []);
    }
    owners.get(js).push(i);
  }
});
for (const [js, idxList] of owners) {
  for (let i = 0; i < idxList.length; i++) {
    for (let j = i + 1; j < idxList.length; j++) {
      const [e1, e2] = [manifest.content_scripts[idxList[i]], manifest.content_scripts[idxList[j]]];
      assert.ok(!entriesOverlap(e1, e2), `${js} 出现在 matches 重叠的 entry ${idxList[i]} 和 ${idxList[j]} 中，会被重复注入`);
    }
  }
}

// 3. 第三方归档站权限必须收在 /api，避免上架时申请整站读写
for (const permission of manifest.host_permissions || []) {
  if (/biliplus\.com|jijidown\.com/.test(permission)) {
    assert.match(permission, /\/api\b/, `归档站 host_permission 应限制在 /api：${permission}`);
  }
}

console.log('ok - manifest 结构检查通过');
