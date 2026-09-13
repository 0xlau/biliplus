/**
 * 首页推荐按发布时间排序。
 *
 * 从推荐卡片的信息行解析发布时间（相对时间或日期），把首页推荐网格的
 * 卡片按"最近发布在最前"重排；点"换一换"、滚动加载新卡、回退历史之后
 * 都会自动重新排列。无法识别时间的卡片（直播、广告等）固定排在末尾，
 * 且相互之间保持 B 站原本的顺序。
 */
(function initHomeFeedTimeSort(globalScope) {
  const GRID_SELECTOR = '.recommended-container_floor-aside .container';
  const CARD_SELECTOR = [
    '.feed-card',
    '.bili-live-card',
    '.floor-single-card',
    '.video-page-card-small',
    '.video-page-card',
    '.bili-video-card__wrap.__scale-wrap',
    '.bili-video-card',
  ].join(',');

  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const MINUTE_MS = 60 * 1000;
  const SORT_DEBOUNCE_MS = 300;
  const ROLL_SETTLE_DELAY_MS = 600;

  const TIME_TEXT_SELECTORS = [
    '.bili-video-card__info--date',
    '.bili-video-card__info--author',
    '.bili-video-card__info',
  ];

  const RELATIVE_TIME_PATTERN =
    /(?:(\d+)\s*(?:个)?\s*(秒|分钟|分|小时|天|日|周|星期|个月|月|年)前)|^(?:刚刚|刚才|刚刚发布)$/;

  const normalizeText = value => String(value || '').replace(/\s+/g, ' ').trim();

  const startOfDay = timestamp => {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };

  /**
   * 解析卡片上的发布时间文本，返回时间戳；无法识别返回 null。
   * B 站日期节点文本常带"· "之类的前缀分隔符（如"· 昨天"），先剥离。
   * 相对时间（如"3小时前"）按 now 反推；日期缺省年份时按当年补齐，
   * 若补出来是未来时间则回退一年（B 站跨年旧视频不写年份）。
   */
  const parsePublishTime = (rawText, now = Date.now()) => {
    const text = normalizeText(rawText).replace(
      /^[·•・\s\-–—|｜:：,，、.]+/,
      ''
    );
    if (!text) {
      return null;
    }

    let match = text.match(RELATIVE_TIME_PATTERN);
    if (match) {
      if (!match[1]) {
        return now;
      }
      const amount = Number(match[1]);
      if (!Number.isFinite(amount) || amount < 0) {
        return null;
      }
      switch (match[2]) {
        case '秒':
          return now - amount * 1000;
        case '分钟':
        case '分':
          return now - amount * MINUTE_MS;
        case '小时':
          return now - amount * HOUR_MS;
        case '天':
        case '日':
          return now - amount * DAY_MS;
        case '周':
        case '星期':
          return now - amount * 7 * DAY_MS;
        case '个月':
        case '月':
          return now - amount * 30 * DAY_MS;
        case '年':
          return now - amount * 365 * DAY_MS;
        default:
          return null;
      }
    }

    if (/^昨天/.test(text)) {
      return startOfDay(now) - DAY_MS;
    }
    if (/^前天/.test(text)) {
      return startOfDay(now) - 2 * DAY_MS;
    }

    const fullDate = text.match(
      /^(?:(\d{4})[-/.年])?(\d{1,2})[-/.月](\d{1,2})[日]?$/
    );
    if (fullDate) {
      const year = fullDate[1] ? Number(fullDate[1]) : new Date(now).getFullYear();
      const month = Number(fullDate[2]) - 1;
      const day = Number(fullDate[3]);
      if (month < 0 || month > 11 || day < 1 || day > 31) {
        return null;
      }
      let timestamp = new Date(year, month, day).getTime();
      if (!fullDate[1] && timestamp > now) {
        timestamp = new Date(year - 1, month, day).getTime();
      }
      return timestamp;
    }

    return null;
  };

  /**
   * 从卡片的候选文本里提取发布时间。优先取底部信息行的日期/作者节点，
   * 最后才对整卡文本兜底扫描（避免误读标题里出现的日期）。
   */
  const extractTimeFromText = (text, now = Date.now()) =>
    parsePublishTime(text, now);

  const extractCardTime = (card, now = Date.now()) => {
    if (!card || typeof card.querySelectorAll !== 'function') {
      return null;
    }

    for (const selector of TIME_TEXT_SELECTORS) {
      for (const element of card.querySelectorAll(selector)) {
        const time = parsePublishTime(element.textContent, now);
        if (time !== null) {
          return time;
        }
      }
    }

    // 兜底：整卡文本里找强模式的相对时间或日期。
    const time = parsePublishTime(card.textContent || '', now);
    return time;
  };

  /**
   * 稳定排序比较器：已知时间新→旧；未知时间（null）置底并保持原序。
   * 输入元素形如 { time: number|null, order: number }。
   */
  const compareByTimeDesc = (left, right) => {
    if (left.time !== null && right.time !== null) {
      if (left.time !== right.time) {
        return right.time - left.time;
      }
      return left.order - right.order;
    }
    if (left.time === null && right.time === null) {
      return left.order - right.order;
    }
    return left.time === null ? 1 : -1;
  };

  const isLayoutCard = element =>
    Boolean(element && element.nodeType === 1 && element.matches(CARD_SELECTOR));

  const isHomePageLocation = locationObject =>
    Boolean(
      locationObject &&
        locationObject.hostname === 'www.bilibili.com' &&
        (locationObject.pathname === '/' ||
          locationObject.pathname === '/index.html')
    );

  const UNKNOWN_ORDER_BASE = 100000;

  /**
   * 用 CSS order 对网格做纯视觉排序，不搬动任何 DOM 节点：
   * 网格是 display:grid，直接修改 order 即可改变排布，同时避免与
   * Vue 协调、"换一换历史"的节点快照恢复发生冲突。
   * 已知时间的卡片按新→旧得到 0..n-1；未知时间卡片与"加载更多"
   * 等非卡片节点排在后面，相互保持原有 DOM 顺序。
   * 返回是否有 order 值发生变化。
   */
  const applySortedOrder = (grid, now = Date.now()) => {
    if (!grid) {
      return false;
    }

    const children = Array.from(grid.children);
    const cardEntries = [];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (isLayoutCard(child)) {
        cardEntries.push({
          node: child,
          time: extractCardTime(child, now),
          order: index,
        });
      }
    }
    if (cardEntries.length < 2) {
      return false;
    }

    const sorted = [...cardEntries].sort(compareByTimeDesc);
    let changed = false;
    let knownCount = 0;
    const setOrder = (node, value) => {
      if (node.style.order !== value) {
        node.style.order = value;
        changed = true;
      }
    };

    for (const entry of sorted) {
      if (entry.time !== null) {
        setOrder(entry.node, String(knownCount));
        knownCount += 1;
      } else {
        setOrder(entry.node, String(UNKNOWN_ORDER_BASE + entry.order));
      }
    }

    // 非卡片节点（加载更多锚点等）跟在全部卡片之后，保持原相对顺序。
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (!isLayoutCard(child)) {
        setOrder(child, String(UNKNOWN_ORDER_BASE + index));
      }
    }

    return changed;
  };

  /** 关闭功能时清掉自己写入的 order，让页面回到 B 站原始排布。 */
  const clearSortedOrder = grid => {
    if (!grid) {
      return;
    }
    for (const child of grid.children) {
      const style = child.style;
      if (!style) {
        continue;
      }
      if (typeof style.removeProperty === 'function') {
        style.removeProperty('order');
      } else {
        delete style.order;
      }
    }
  };

  const api = {
    GRID_SELECTOR,
    CARD_SELECTOR,
    parsePublishTime,
    extractTimeFromText,
    extractCardTime,
    compareByTimeDesc,
    applySortedOrder,
    clearSortedOrder,
    isLayoutCard,
    isHomePageLocation,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  globalScope.BiliPlusHomeFeedTimeSort = api;

  const documentObject = globalScope.document;
  const storage = globalScope.chrome?.storage;
  if (!documentObject?.documentElement || !storage?.sync) {
    return;
  }

  const STORAGE_KEYS = ['biliplus-enable', 'sort-home-feed-by-time'];
  const state = {
    configured: false,
    enabled: false,
  };
  let routeMonitor = null;
  let gridObserver = null;
  let observing = false;
  let sortTimer = null;
  let lastSortAt = 0;

  const runSort = () => {
    sortTimer = null;
    if (!state.enabled) {
      return;
    }
    lastSortAt = Date.now();
    const grid = documentObject.querySelector(GRID_SELECTOR);
    applySortedOrder(grid);
  };

  const scheduleSort = delay => {
    clearTimeout(sortTimer);
    sortTimer = setTimeout(runSort, delay || 0);
  };

  /**
   * 节流（带尾沿）：距上次排序不足 SORT_DEBOUNCE_MS 时按剩余时间推迟。
   * 保证 B 站流式渲染、连续 DOM 变更期间排序最多 300ms 就会刷新一次，
   * 不会因为变更不停而无限推迟（去抖会出现这种饿死问题）。
   */
  const debouncedSort = () => {
    clearTimeout(sortTimer);
    const elapsed = Date.now() - lastSortAt;
    sortTimer = setTimeout(runSort, Math.max(0, SORT_DEBOUNCE_MS - elapsed));
  };

  const startGridObserver = () => {
    if (observing) {
      return;
    }
    if (!gridObserver) {
      gridObserver = new MutationObserver(() => {
        if (state.enabled) {
          debouncedSort();
        }
      });
    }
    gridObserver.observe(documentObject.documentElement, {
      childList: true,
      subtree: true,
    });
    observing = true;
  };

  const stopGridObserver = () => {
    gridObserver?.disconnect();
    observing = false;
    clearTimeout(sortTimer);
    sortTimer = null;
  };

  const syncRouteState = () => {
    const nextEnabled = state.configured && isHomePageLocation(globalScope.location);
    const changed = nextEnabled !== state.enabled;
    state.enabled = nextEnabled;
    documentObject.documentElement.toggleAttribute(
      'biliplus-home-feed-time-sort',
      state.enabled
    );

    if (state.enabled) {
      startGridObserver();
      // 路由刚切到首页时给网格一点渲染时间。
      debouncedSort();
    } else {
      stopGridObserver();
      if (changed) {
        clearSortedOrder(documentObject.querySelector(GRID_SELECTOR));
      }
    }
  };

  const updateRouteMonitor = () => {
    if (state.configured && !routeMonitor) {
      routeMonitor = setInterval(syncRouteState, 1000);
    } else if (!state.configured && routeMonitor) {
      clearInterval(routeMonitor);
      routeMonitor = null;
    }
  };

  const applyStorage = values => {
    state.configured = Boolean(
      values['biliplus-enable'] && values['sort-home-feed-by-time']
    );
    updateRouteMonitor();
    syncRouteState();
  };

  storage.sync.get(STORAGE_KEYS, applyStorage);

  storage.onChanged?.addListener((changes, areaName) => {
    if (
      areaName === 'sync' &&
      STORAGE_KEYS.some(key => Object.prototype.hasOwnProperty.call(changes, key))
    ) {
      storage.sync.get(STORAGE_KEYS, applyStorage);
    }
  });

  // 点"换一换"后等新卡片渲染完再排（观察器的去抖已覆盖大多数情况，
  // 这里再补一次稍长的延迟，避免 Vue 渐进渲染导致排完又被打乱）。
  documentObject.addEventListener(
    'click',
    event => {
      if (!state.enabled || !(event.target instanceof Element)) {
        return;
      }
      if (event.target.closest('.roll-btn')) {
        scheduleSort(ROLL_SETTLE_DELAY_MS);
      }
    },
    true
  );

  // "换一换"历史回退还原旧卡片后重新排序。
  documentObject.addEventListener('biliplus:feed-history-restored', () => {
    if (state.enabled) {
      scheduleSort(SORT_DEBOUNCE_MS);
    }
  });

  globalScope.addEventListener('popstate', syncRouteState);
  globalScope.addEventListener('pageshow', syncRouteState);
})(typeof globalThis === 'undefined' ? this : globalThis);
