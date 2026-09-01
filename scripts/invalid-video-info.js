/**
 * 还原失效视频的封面和标题
 *
 * - 收藏夹页：把「已失效视频」卡片还原出标题、封面和链接
 * - 视频页（已失效/404）：在错误页面上插入还原信息面板
 *
 * 数据源按 官方接口 → biliplus.com 归档 → jijidown.com 归档 回退。
 * 结果缓存在 chrome.storage.local：完整结果长期有效；部分结果 30 分钟后重试补齐，空结果 12 小时内不重试。
 *
 * 本文件与其他 content script 共享隔离世界，实现都收在 storage 回调内，避免污染全局。
 */
chrome.storage.sync.get(['biliplus-enable', 'invalid-video-info'], storage => {
  if (!storage['biliplus-enable'] || !storage['invalid-video-info']) {
    return;
  }

  const INVALID_META_PREFIX = 'biliplus-invalid-meta-';
  const INVALID_VIEW_CODES = new Set([-404, 62002, 62004, 62012]);
  const CARD_SELECTOR = '.bili-video-card, .fav-video-card, .small-item';
  const PLACEHOLDER_COVER_TOKEN = 'be27fd62';
  const CACHE_PARTIAL_TTL = 30 * 60 * 1000;
  const CACHE_EMPTY_TTL = 12 * 60 * 60 * 1000;
  const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
  const memoryCache = new Map();
  const inflight = new Map();
  const jijiQueue = [];
  let jijiBusy = false;
  let lastHref = location.href;
  let scanTimer = null;
  let videoTask = 0;
  let scanning = false;
  let scanQueued = false;
  let favObserverDisconnect = null;
  let homeJumpGuard = null;

  function cacheKey(aid) {
    return `${INVALID_META_PREFIX}${aid}`;
  }

  function storageGet(key) {
    return new Promise(resolve => {
      chrome.storage.local.get(key, data => resolve(data[key]));
    });
  }

  function storageSet(obj) {
    return new Promise(resolve => {
      chrome.storage.local.set(obj, resolve);
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function mapLimit(items, limit, mapper) {
    const result = new Array(items.length);
    let index = 0;
    async function worker() {
      while (index < items.length) {
        const current = index++;
        result[current] = await mapper(items[current], current);
      }
    }
    const size = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: size }, worker));
    return result;
  }

  // ---------- 归档解析 ----------

  function enqueueJiji(aid) {
    return new Promise(resolve => {
      jijiQueue.push({ aid, resolve });
      pumpJiji();
    });
  }

  async function pumpJiji() {
    if (jijiBusy) {
      return;
    }
    jijiBusy = true;
    while (jijiQueue.length) {
      const { aid, resolve } = jijiQueue.shift();
      try {
        resolve(await _BILIAPI.getJijidownInfo(aid));
      } catch {
        resolve(null);
      }
      if (jijiQueue.length) {
        await sleep(1000);
      }
    }
    jijiBusy = false;
  }

  function emptyMeta(aid, bvid) {
    return {
      aid: aid ? Number(aid) : null,
      bvid: bvid || (aid ? _UTILS.avToBv(aid) : null),
      title: '',
      pic: '',
      ownerName: '',
      ownerMid: '',
      source: '',
      weakTitle: false
    };
  }

  function mergeMeta(base, extra, source) {
    if (!extra) {
      return base;
    }
    const next = { ...base };
    const aid = extra.aid || next.aid;
    if (_UTILS.isUsableTitle(extra.title, aid) && (!_UTILS.isUsableTitle(next.title, aid) || next.weakTitle)) {
      next.title = String(extra.title).trim();
      next.weakTitle = false;
      next.source = source;
    }
    const pic = _UTILS.normalizeCoverUrl(extra.pic || extra.cover || extra.img);
    if (_UTILS.isGoodCoverUrl(pic) && !_UTILS.isGoodCoverUrl(next.pic)) {
      next.pic = pic;
      next.coverSource = source;
    }
    const firstFrame = _UTILS.normalizeCoverUrl(extra.first_frame);
    if (!_UTILS.isGoodCoverUrl(next.pic) && _UTILS.isGoodCoverUrl(firstFrame)) {
      next.pic = firstFrame;
      next.coverSource = `${source}:first_frame`;
    }
    if (extra.owner && extra.owner.name) {
      next.ownerName = extra.owner.name;
      next.ownerMid = extra.owner.mid || next.ownerMid;
    } else if (extra.author) {
      next.ownerName = extra.author;
      next.ownerMid = extra.mid || next.ownerMid;
    }
    if (extra.bvid) {
      next.bvid = extra.bvid;
    }
    if (extra.aid) {
      next.aid = Number(extra.aid);
    }
    if (!next.bvid && next.aid) {
      next.bvid = _UTILS.avToBv(next.aid);
    }
    return next;
  }

  function isComplete(meta) {
    return meta && _UTILS.isUsableTitle(meta.title, meta.aid) && _UTILS.isGoodCoverUrl(meta.pic);
  }

  function isFreshCache(meta) {
    if (!meta || !meta.cachedAt) {
      return false;
    }
    const hasSomeInfo = _UTILS.isUsableTitle(meta.title, meta.aid) || _UTILS.isGoodCoverUrl(meta.pic);
    const ttl = hasSomeInfo ? CACHE_PARTIAL_TTL : CACHE_EMPTY_TTL;
    return Date.now() - meta.cachedAt < ttl;
  }

  async function readCache(aid) {
    if (!aid) {
      return null;
    }
    const key = String(aid);
    if (memoryCache.has(key)) {
      return memoryCache.get(key);
    }
    const saved = await storageGet(cacheKey(aid));
    if (saved) {
      memoryCache.set(key, saved);
    }
    return saved || null;
  }

  async function writeCache(meta) {
    if (!meta || !meta.aid) {
      return;
    }
    const entry = { ...meta, cachedAt: Date.now() };
    memoryCache.set(String(meta.aid), entry);
    await storageSet({ [cacheKey(meta.aid)]: entry });
  }

  function pruneCache() {
    chrome.storage.local.get(null, all => {
      const now = Date.now();
      const staleKeys = Object.keys(all).filter(key => {
        if (!key.startsWith(INVALID_META_PREFIX)) {
          return false;
        }
        const value = all[key];
        if (!value || typeof value !== 'object') {
          return true;
        }
        if (!value.cachedAt) {
          return !_UTILS.isUsableTitle(value.title, value.aid);
        }
        return now - value.cachedAt > CACHE_MAX_AGE;
      });
      if (staleKeys.length) {
        chrome.storage.local.remove(staleKeys);
      }
    });
  }

  /**
   * 批量解析视频元数据，返回 Map<aid, meta>。
   * 管线：缓存 → 官方 view（可选）→ pagelist 弱标题 → biliplus 批量 → biliplus 单查 → jijidown 队列
   */
  async function resolveMany(items, { skipOfficialView = true, allowJiji = true } = {}) {
    const unique = [];
    const seen = new Set();
    for (const item of items) {
      const aid = item.aid || (item.bvid ? _UTILS.bvToAv(item.bvid) : null);
      if (!aid || seen.has(aid)) {
        continue;
      }
      seen.add(aid);
      unique.push({ ...item, aid, bvid: item.bvid || _UTILS.avToBv(aid) });
    }

    const metas = new Map();
    const pending = [];
    for (const item of unique) {
      const cached = await readCache(item.aid);
      if (cached && isComplete(cached)) {
        metas.set(item.aid, cached);
        continue;
      }
      if (cached && isFreshCache(cached)) {
        metas.set(item.aid, Object.assign(emptyMeta(item.aid, item.bvid), cached));
        continue;
      }
      pending.push({
        ...item,
        meta: cached ? Object.assign(emptyMeta(item.aid, item.bvid), cached) : emptyMeta(item.aid, item.bvid)
      });
    }

    await mapLimit(pending, 4, async item => {
      if (!skipOfficialView) {
        const view = await _BILIAPI.getVideoView({ aid: item.aid, bvid: item.bvid });
        if (view.data) {
          item.meta = mergeMeta(
            item.meta,
            {
              aid: view.data.aid,
              bvid: view.data.bvid,
              title: view.data.title,
              pic: view.data.pic,
              owner: view.data.owner
            },
            'official'
          );
        }
      }
      if (!_UTILS.isUsableTitle(item.meta.title, item.aid)) {
        const pages = await _BILIAPI.getPageList(item.aid);
        if (pages.length === 1 && _UTILS.isUsableTitle(pages[0].part, item.aid)) {
          item.meta.title = pages[0].part;
          item.meta.weakTitle = true;
          item.meta.source = item.meta.source || 'pagelist';
        }
      }
    });

    const needArchive = pending.filter(item => !isComplete(item.meta));
    if (needArchive.length) {
      const batch = await _BILIAPI.getBiliplusAidInfo(needArchive.map(item => item.aid));
      for (const item of needArchive) {
        if (batch.has(String(item.aid))) {
          item.meta = mergeMeta(item.meta, batch.get(String(item.aid)), 'biliplus');
        }
      }
    }

    const stillNeedView = pending.filter(item => !isComplete(item.meta));
    await mapLimit(stillNeedView, 3, async item => {
      item.meta = mergeMeta(item.meta, await _BILIAPI.getBiliplusView(item.aid), 'biliplus');
    });

    if (allowJiji) {
      const stillNeedJiji = pending.filter(item => !isComplete(item.meta));
      for (const item of stillNeedJiji) {
        item.meta = mergeMeta(item.meta, await enqueueJiji(item.aid), 'jijidown');
      }
    }

    for (const item of pending) {
      await writeCache(item.meta);
      metas.set(item.aid, item.meta);
    }
    return metas;
  }

  async function resolveMeta({ aid, bvid, skipOfficialView = false, allowJiji = true }) {
    if (!aid && bvid) {
      aid = _UTILS.bvToAv(bvid);
    }
    if (!aid) {
      return emptyMeta(aid, bvid);
    }
    const taskKey = String(aid);
    if (inflight.has(taskKey)) {
      return inflight.get(taskKey);
    }
    const task = resolveMany([{ aid, bvid }], { skipOfficialView, allowJiji }).then(metas => metas.get(aid) || emptyMeta(aid, bvid));
    inflight.set(taskKey, task);
    try {
      return await task;
    } finally {
      inflight.delete(taskKey);
    }
  }

  // ---------- 收藏夹 DOM ----------

  function extractIdFromCard(card) {
    const attrAid = card.getAttribute('data-aid') || card.getAttribute('data-id');
    const attrBvid = card.getAttribute('data-bvid') || card.getAttribute('bvid');
    if (attrAid && /^\d+$/.test(attrAid)) {
      return { aid: Number(attrAid), bvid: attrBvid || _UTILS.avToBv(attrAid) };
    }
    if (attrBvid) {
      return { aid: _UTILS.bvToAv(attrBvid), bvid: attrBvid };
    }
    const link = card.querySelector('a[href*="/video/"], a[href*="bilibili://video/"]');
    if (link) {
      const href = link.getAttribute('href') || '';
      const fromUrl = _UTILS.getVideoIdFromUrl(href);
      if (fromUrl.aid || fromUrl.bvid) {
        return fromUrl;
      }
      const app = /bilibili:\/\/video\/(\d+)/.exec(href);
      if (app) {
        return { aid: Number(app[1]), bvid: _UTILS.avToBv(app[1]) };
      }
    }
    return {};
  }

  function resolveCard(el) {
    return el.closest(CARD_SELECTOR) || el.closest('li') || el.parentElement;
  }

  function findInvalidTitleEl(card) {
    const candidates = card.querySelectorAll('p, span, div, a');
    for (const el of candidates) {
      if (el.children.length === 0 && _UTILS.isInvalidVideoTitle(el.textContent)) {
        return el;
      }
    }
    return null;
  }

  function collectInvalidCards() {
    const cards = [];
    const seen = new Set();
    const push = (hitEl, coverImg, titleEl) => {
      if (!hitEl || hitEl.closest('.biliplus-invalid-panel')) {
        return;
      }
      const card = resolveCard(hitEl);
      if (!card || seen.has(card) || card.dataset.biliplusInvalidDone) {
        return;
      }
      seen.add(card);
      cards.push({
        card,
        titleEl: titleEl || findInvalidTitleEl(card),
        coverImg: coverImg || null,
        ...extractIdFromCard(card)
      });
    };

    document.querySelectorAll(`img[src*="${PLACEHOLDER_COVER_TOKEN}"]`).forEach(img => push(img, img, null));
    for (const text of _UTILS.INVALID_TITLE_SET) {
      const iter = document.evaluate(`//*[normalize-space(text())="${text}"]`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < iter.snapshotLength; i++) {
        push(iter.snapshotItem(i), null, iter.snapshotItem(i));
      }
    }
    return cards;
  }

  /**
   * 失效卡如果是同一父节点下的兄弟，顺带收集整行卡片，供 zipFillMissingIds 用锚点对齐。
   * 对不齐时 ordered 为空，调用方只还原自身已带 aid/bvid 的卡。
   */
  function collectFavCards() {
    const invalid = collectInvalidCards();
    if (!invalid.length) {
      return { invalid, ordered: [] };
    }
    const parent = invalid[0].card.parentElement;
    const sameParent = parent && invalid.every(item => item.card.parentElement === parent);
    if (!sameParent) {
      return { invalid, ordered: [] };
    }
    const ordered = [];
    for (const el of parent.children) {
      const cardEl = el.matches && el.matches(CARD_SELECTOR) ? el : el.querySelector && el.querySelector(CARD_SELECTOR);
      if (!cardEl) {
        continue;
      }
      const existing = invalid.find(item => item.card === cardEl);
      if (existing) {
        ordered.push(existing);
      } else {
        ordered.push({
          card: cardEl,
          titleEl: null,
          coverImg: null,
          ...extractIdFromCard(cardEl)
        });
      }
    }
    return { invalid, ordered };
  }

  function getPageNumber() {
    const fromUrl = _UTILS.getPageNumberFromUrl(location.href);
    if (fromUrl) {
      return fromUrl;
    }
    const active =
      document.querySelector('.be-pager-item.be-pager-item-active') ||
      document.querySelector('.vui_pagenation--btns .vui_button--active') ||
      document.querySelector('.vui_pagenation .vui_button--active');
    const num = Number((active && active.textContent ? active.textContent : '').trim());
    return Number.isFinite(num) && num > 0 ? num : 1;
  }

  async function getFavMedias(expectedCount) {
    const mediaId = _UTILS.getFavMediaIdFromUrl(location.href);
    if (!mediaId) {
      return [];
    }
    const ps = expectedCount > 20 ? 40 : 20;
    const data = await _BILIAPI.getFavResourceList({ mediaId, pn: getPageNumber(), ps });
    return (data && data.medias) || [];
  }

  function applyZippedIds(ordered, medias) {
    const zipped = _UTILS.zipFillMissingIds(ordered, medias);
    if (!zipped) {
      return;
    }
    zipped.forEach((item, index) => {
      ordered[index].aid = item.aid;
      ordered[index].bvid = item.bvid;
    });
  }

  function setBadge(titleEl, text, state) {
    let badge = titleEl.parentElement ? titleEl.parentElement.querySelector('.biliplus-invalid-badge') : null;
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'biliplus-invalid-badge';
      titleEl.insertAdjacentElement('afterend', badge);
    }
    badge.textContent = text;
    badge.dataset.state = state;
  }

  function isInjectedCoverNode(node) {
    return (
      node.classList.contains('biliplus-invalid-cover-overlay') ||
      node.classList.contains('biliplus-invalid-restored-cover') ||
      node.classList.contains('biliplus-invalid-mask')
    );
  }

  function findCoverBox(card, coverImg) {
    if (coverImg && coverImg.parentElement) {
      return coverImg.parentElement.closest('picture, [class*="cover"]') || coverImg.parentElement;
    }
    for (const node of card.querySelectorAll('picture, [class*="cover"]')) {
      if (node.tagName === 'IMG' || isInjectedCoverNode(node)) {
        continue;
      }
      return node;
    }
    return null;
  }

  function addInvalidMask(box) {
    if (!box || box.tagName === 'IMG') {
      return;
    }
    if (getComputedStyle(box).position === 'static') {
      box.style.position = 'relative';
    }
    if (box.querySelector(':scope > .biliplus-invalid-mask')) {
      return;
    }
    const mask = document.createElement('div');
    mask.className = 'biliplus-invalid-mask';
    mask.innerHTML = '<span class="biliplus-invalid-mask__label">已失效</span>';
    box.appendChild(mask);
  }

  function setCardCover(card, url, coverImg) {
    const pic = _UTILS.normalizeCoverUrl(url);
    if (!_UTILS.isGoodCoverUrl(pic)) {
      return;
    }
    const box = findCoverBox(card, coverImg);
    const img = coverImg || (box && box.querySelector('img:not(.biliplus-invalid-cover-overlay)')) || null;
    if (img) {
      const picture = img.closest('picture');
      if (picture) {
        picture.querySelectorAll('source').forEach(source => source.remove());
      }
      img.src = pic;
      img.removeAttribute('srcset');
      img.classList.add('biliplus-invalid-restored-cover');
    }
    if (box && box.tagName !== 'IMG') {
      if (getComputedStyle(box).position === 'static') {
        box.style.position = 'relative';
      }
      if (box.clientHeight === 0) {
        box.style.aspectRatio = '16 / 10';
      }
      if (!img) {
        let overlay = box.querySelector(':scope > .biliplus-invalid-cover-overlay');
        if (!overlay) {
          overlay = document.createElement('img');
          overlay.className = 'biliplus-invalid-cover-overlay';
          overlay.alt = '';
          box.appendChild(overlay);
        }
        overlay.src = pic;
      }
      addInvalidMask(box);
    }
  }

  function setCardLink(card, meta) {
    if (!meta.bvid && !meta.aid) {
      return;
    }
    const href = `https://www.bilibili.com/video/${meta.bvid || 'av' + meta.aid}/`;
    const links = card.querySelectorAll('a');
    if (links.length) {
      links.forEach(a => {
        const current = a.getAttribute('href');
        if (!current || current === 'javascript:;' || current === '#') {
          a.setAttribute('href', href);
          a.setAttribute('target', '_blank');
        }
      });
      return;
    }
    card.dataset.biliplusHref = href;
    card.style.cursor = 'pointer';
    if (card.dataset.biliplusInvalidLink) {
      return;
    }
    card.dataset.biliplusInvalidLink = '1';
    card.addEventListener('click', () => {
      const next = card.dataset.biliplusHref;
      if (next) {
        window.open(next, '_blank');
      }
    });
  }

  function patchCard(item, meta) {
    const card = item.card;
    const titleEl = item.titleEl;
    const restored = _UTILS.isUsableTitle(meta && meta.title, meta && meta.aid);
    const title = restored ? meta.title : meta && meta.aid ? `av${meta.aid}` : '';
    if (titleEl && title) {
      titleEl.textContent = title;
      titleEl.classList.add('biliplus-invalid-title');
      titleEl.title = [title, meta.aid ? `av${meta.aid}` : '', meta.bvid || '', meta.ownerName ? `UP: ${meta.ownerName}` : '', meta.source ? `来源: ${meta.source}` : '']
        .filter(Boolean)
        .join('\n');
      setBadge(titleEl, restored ? '已还原' : '未还原标题', restored ? 'done' : 'fail');
    } else if (titleEl) {
      setBadge(titleEl, '未能还原', 'fail');
    }
    setCardCover(card, meta && meta.pic, item.coverImg);
    setCardLink(card, meta || {});
    card.dataset.biliplusInvalidDone = title ? '1' : 'fail';
  }

  async function scanFavPage() {
    if (scanning) {
      scanQueued = true;
      return;
    }
    scanning = true;
    try {
      await scanFavPageOnce();
      while (scanQueued) {
        scanQueued = false;
        await scanFavPageOnce();
      }
    } finally {
      scanning = false;
    }
  }

  async function scanFavPageOnce() {
    const { invalid, ordered } = collectFavCards();
    if (!invalid.length) {
      return;
    }
    if (ordered.length) {
      applyZippedIds(ordered, await getFavMedias(ordered.length));
    }
    const withId = invalid.filter(card => card.aid || card.bvid);
    if (!withId.length) {
      return;
    }
    for (const item of withId) {
      if (item.titleEl) {
        setBadge(item.titleEl, '还原中…', 'loading');
      }
    }
    const metas = await resolveMany(withId, { skipOfficialView: true });
    for (const card of withId) {
      const aid = card.aid || _UTILS.bvToAv(card.bvid);
      patchCard(card, metas.get(aid) || emptyMeta(aid, card.bvid));
    }
  }

  // ---------- 视频页面板 ----------

  function pageLooksInvalid() {
    const text = document.body ? document.body.innerText : '';
    return /视频不见了|稿件不可见|视频已失效|啊叻？/.test(text);
  }

  function removePanel() {
    document.querySelectorAll('.biliplus-invalid-panel').forEach(el => el.remove());
  }

  function createPanel(meta, fallbackId) {
    removePanel();
    const panel = document.createElement('div');
    panel.className = 'biliplus-invalid-panel biliplus-invalid-panel--enter';
    const hasTitle = _UTILS.isUsableTitle(meta.title, meta.aid);
    const title = hasTitle ? meta.title : fallbackId || '未能还原标题';
    const info = [meta.aid ? `av${meta.aid}` : '', meta.bvid || '', meta.ownerName ? `UP: ${meta.ownerName}` : '', meta.source ? `来源: ${meta.source}` : '来源: 无归档']
      .filter(Boolean)
      .join(' · ');
    const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(hasTitle ? meta.title : fallbackId || '')}`;
    const coverSrc = _UTILS.isGoodCoverUrl(meta.pic) ? escapeHtml(meta.pic) : '';
    panel.innerHTML =
      `<div class="biliplus-invalid-panel__cover-wrap">` +
      `<img class="biliplus-invalid-panel__cover" alt="cover" src="${coverSrc}" />` +
      `<div class="biliplus-invalid-mask"><span class="biliplus-invalid-mask__label">已失效</span></div>` +
      `</div>` +
      `<div class="biliplus-invalid-panel__meta">` +
      `<div class="biliplus-invalid-panel__title">${escapeHtml(title)}</div>` +
      `<div class="biliplus-invalid-panel__sub">${escapeHtml(info)}</div>` +
      (hasTitle ? '' : '<div class="biliplus-invalid-panel__empty">第三方归档也没有找到标题/封面，可尝试用 av/BV 号自行搜索。</div>') +
      `<div class="biliplus-invalid-panel__actions">` +
      `<button type="button" class="biliplus-copy">复制信息</button>` +
      `<a class="secondary" target="_blank" rel="noopener noreferrer" href="${searchUrl}">搜索标题</a>` +
      `</div></div>`;
    if (!_UTILS.isGoodCoverUrl(meta.pic)) {
      panel.querySelector('.biliplus-invalid-panel__cover-wrap').style.display = 'none';
    }
    panel.querySelector('.biliplus-copy').addEventListener('click', async () => {
      const text = [meta.title, meta.aid ? `av${meta.aid}` : '', meta.bvid, meta.ownerName, meta.pic].filter(Boolean).join('\n');
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        window.prompt('复制信息', text);
      }
    });
    mountPanelWithRetry(panel);
  }

  function createLoadingPanel() {
    removePanel();
    const panel = document.createElement('div');
    panel.className = 'biliplus-invalid-panel biliplus-invalid-panel--loading';
    panel.innerHTML =
      `<div class="biliplus-invalid-panel__cover biliplus-skeleton"></div>` +
      `<div class="biliplus-invalid-panel__meta">` +
      `<div class="biliplus-invalid-panel__skeleton-title biliplus-skeleton"></div>` +
      `<div class="biliplus-invalid-panel__skeleton-line biliplus-skeleton"></div>` +
      `<div class="biliplus-invalid-panel__skeleton-line biliplus-skeleton short"></div>` +
      `<div class="biliplus-invalid-panel__skeleton-tip">正在尝试还原失效视频…</div>` +
      `</div>`;
    mountPanelWithRetry(panel);
  }

  // 实际错误页是 .error-page > .error-panel > .error-msg（吉祥物 + 文案 + 按钮）。
  // 挂到 .error-panel：与 .error-msg 左右并排。不要 wrap Vue 节点，否则 patch 会把「前往首页」拆到容器底部。
  function findErrorBox() {
    const panel = document.querySelector('.error-panel');
    if (panel) {
      return panel;
    }
    const page = document.querySelector('.error-page');
    if (page) {
      return page.querySelector('.error-panel') || page;
    }
    return document.querySelector('.error-container, .video-error, .error-body, .bili-video-card-error, .error-msg');
  }

  function mountPanel(panel) {
    const errorBox = findErrorBox();
    if (errorBox) {
      errorBox.classList.add('biliplus-invalid-host');
      if (panel.parentElement !== errorBox || errorBox.firstElementChild !== panel) {
        errorBox.prepend(panel);
      }
      return;
    }
    const mount =
      document.querySelector('#mirror-vdcon') ||
      document.querySelector('.left-container') ||
      document.querySelector('#app') ||
      document.body;
    if (panel.parentElement !== mount) {
      mount.prepend(panel);
    }
  }

  function mountPanelWithRetry(panel) {
    mountPanel(panel);
    setTimeout(() => {
      if (panel.isConnected) {
        mountPanel(panel);
        ensureAutoRedirectCanceled();
      }
    }, 600);
  }

  // B 站错误页 mounted 后 3 秒会 location.href 跳首页；「取消跳转」是 div.action-btn，不是 button。
  // Vue hydrate 前点击无效，所以要持续点到出现「前往首页」或超时。
  function isHomeJumpCanceled() {
    const box = document.querySelector('.go-home-from-404');
    return !!(box && /前往首页/.test(box.textContent || ''));
  }

  function clickCancelJump() {
    const nodes = document.querySelectorAll('.go-home-from-404 .action-btn, .action-btn, button, a, span, div');
    for (const el of nodes) {
      if (el.children.length === 0 && el.textContent.trim() === '取消跳转') {
        el.click();
        return true;
      }
    }
    return false;
  }

  function stopHomeJumpGuard() {
    if (!homeJumpGuard) {
      return;
    }
    clearInterval(homeJumpGuard.timer);
    if (homeJumpGuard.observer) {
      homeJumpGuard.observer.disconnect();
    }
    homeJumpGuard = null;
  }

  function cancelAutoRedirect() {
    if (isHomeJumpCanceled()) {
      stopHomeJumpGuard();
      return true;
    }
    clickCancelJump();
    if (isHomeJumpCanceled()) {
      stopHomeJumpGuard();
      return true;
    }
    return false;
  }

  function ensureAutoRedirectCanceled() {
    if (cancelAutoRedirect() || homeJumpGuard) {
      return;
    }
    const observer = new MutationObserver(() => {
      cancelAutoRedirect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (cancelAutoRedirect() || Date.now() - startedAt > 10000) {
        stopHomeJumpGuard();
      }
    }, 150);
    homeJumpGuard = { observer, timer };
  }

  async function handleVideoPage() {
    const token = ++videoTask;
    const id = _UTILS.getVideoIdFromUrl(location.href);
    if (!id.aid && !id.bvid) {
      removePanel();
      return;
    }
    removePanel();
    // 倒计时从错误页 mounted 就开始，必须赶在 view 请求返回前去点「取消跳转」
    if (pageLooksInvalid()) {
      ensureAutoRedirectCanceled();
    }
    const view = await _BILIAPI.getVideoView(id);
    if (token !== videoTask) {
      return;
    }
    if (view.data) {
      stopHomeJumpGuard();
      return;
    }
    if (!INVALID_VIEW_CODES.has(view.code) && !pageLooksInvalid()) {
      return;
    }
    ensureAutoRedirectCanceled();
    createLoadingPanel();
    const meta = await resolveMeta({ ...id, skipOfficialView: true, allowJiji: true });
    if (token !== videoTask) {
      return;
    }
    createPanel(meta, id.bvid || (id.aid ? `av${id.aid}` : ''));
  }

  // ---------- 路由 ----------

  function isFavPage() {
    if (location.hostname === 'space.bilibili.com' && /(\/favlist|\/lists|\/collect)/.test(location.pathname)) {
      return true;
    }
    return location.hostname === 'www.bilibili.com' && /\/list\/ml\d+/.test(location.pathname);
  }

  function isVideoPage() {
    return /\/video\/(BV|av)/i.test(location.pathname);
  }

  function scheduleFavScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanFavPage().catch(e => console.error('BILIPLUS invalid-video-info:', e));
    }, 400);
  }

  function ensureFavObserver() {
    if (favObserverDisconnect) {
      return;
    }
    favObserverDisconnect = _UTILS.observe(document.documentElement, () => {
      if (isFavPage()) {
        scheduleFavScan();
      }
    });
  }

  function disconnectFavObserver() {
    if (!favObserverDisconnect) {
      return;
    }
    favObserverDisconnect();
    favObserverDisconnect = null;
  }

  function onRouteChange() {
    if (isVideoPage()) {
      disconnectFavObserver();
      handleVideoPage().catch(e => console.error('BILIPLUS invalid-video-info:', e));
    } else if (isFavPage()) {
      stopHomeJumpGuard();
      ensureFavObserver();
      scheduleFavScan();
    } else {
      stopHomeJumpGuard();
      disconnectFavObserver();
      removePanel();
    }
  }

  pruneCache();
  onRouteChange();
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      onRouteChange();
    }
  }, 1000);
});
