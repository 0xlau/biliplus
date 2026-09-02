/**
 * 首页干净模式实现。
 *
 * 仅切换属性，不再删除 B 站节点；这样关闭开关或站点局部刷新后都能恢复。
 */
(function initCleanHomePage() {
  const STORAGE_KEYS = ['biliplus-enable', 'clean-home-page'];
  const GRID_SETTLE_DELAY = 1200;
  let configured = false;
  let enabled = false;
  let expansionTriggered = false;
  let expansionInProgress = false;
  let expansionBaseline = 0;
  let expansionAttempts = 0;
  let observedGridCount = -1;
  let gridStableSince = 0;
  let expansionTimer = null;
  let expansionPulsePending = false;
  let observing = false;
  let routeMonitor = null;

  const isHomePage = () =>
    location.hostname === 'www.bilibili.com' &&
    (location.pathname === '/' || location.pathname === '/index.html');

  const setBodyMode = () => {
    if (!document.body) {
      return;
    }
    document.body.toggleAttribute('biliplus-clean-mode', enabled);
  };

  const clearExpansionBridge = () => {
    clearTimeout(expansionTimer);
    expansionTimer = null;
    expansionPulsePending = false;
    for (const anchor of document.querySelectorAll('.load-more-anchor')) {
      anchor.classList.remove('biliplus-load-more-anchor');
      anchor.style.removeProperty('--biliplus-load-more-offset');
    }
  };

  const finishExpansion = () => {
    expansionTriggered = true;
    expansionInProgress = false;
    clearExpansionBridge();
  };

  const scheduleExpansion = delay => {
    clearTimeout(expansionTimer);
    expansionTimer = setTimeout(() => {
      expansionTimer = null;
      expandRecommendationGrid();
    }, delay);
  };

  const expandRecommendationGrid = () => {
    if (!enabled || expansionTriggered) return;

    const anchor = document.querySelector('.load-more-anchor');
    if (!anchor) {
      return;
    }

    const grid = anchor.closest('.recommended-container_floor-aside .container');
    const childCount = grid?.children.length || 0;
    if (expansionInProgress && childCount > expansionBaseline) {
      finishExpansion();
      return;
    }

    if (!expansionInProgress) {
      const now = Date.now();
      if (document.readyState !== 'complete') {
        observedGridCount = childCount;
        gridStableSince = now;
        scheduleExpansion(250);
        return;
      }
      if (childCount !== observedGridCount) {
        observedGridCount = childCount;
        gridStableSince = now;
        scheduleExpansion(GRID_SETTLE_DELAY);
        return;
      }
      const settleDelay = GRID_SETTLE_DELAY - (now - gridStableSince);
      if (settleDelay > 0) {
        scheduleExpansion(settleDelay);
        return;
      }
      expansionInProgress = true;
      expansionBaseline = childCount;
      expansionAttempts = 0;
    }

    if (expansionAttempts >= 40) {
      expansionInProgress = false;
      observedGridCount = childCount;
      gridStableSince = Date.now();
      clearExpansionBridge();
      return;
    }

    const enterViewport = () => {
      if (!enabled || expansionTriggered || !anchor.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      const safeViewportBottom = Math.max(120, window.innerHeight - 120);
      const offset = Math.min(0, safeViewportBottom - rect.bottom);
      anchor.style.setProperty('--biliplus-load-more-offset', `${offset}px`);
      anchor.classList.add('biliplus-load-more-anchor');
      window.dispatchEvent(new Event('scroll'));
      expansionAttempts += 1;
      scheduleExpansion(500);
    };

    if (anchor.classList.contains('biliplus-load-more-anchor')) {
      if (expansionPulsePending) return;
      expansionPulsePending = true;
      anchor.classList.remove('biliplus-load-more-anchor');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          expansionPulsePending = false;
          enterViewport();
        });
      });
    } else {
      enterViewport();
    }
  };

  const observer = new MutationObserver(() => {
    if (!enabled) {
      return;
    }
    setBodyMode();
    expandRecommendationGrid();
  });
  const startObserver = () => {
    if (observing) {
      return;
    }
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    observing = true;
  };

  const syncRouteState = () => {
    const nextEnabled = configured && isHomePage();
    if (nextEnabled !== enabled) {
      expansionTriggered = false;
      expansionInProgress = false;
      expansionBaseline = 0;
      expansionAttempts = 0;
      expansionPulsePending = false;
      observedGridCount = -1;
      gridStableSince = 0;
      clearExpansionBridge();
    }
    enabled = nextEnabled;
    setBodyMode();
    expandRecommendationGrid();
    if (enabled) {
      startObserver();
    } else {
      observer.disconnect();
      observing = false;
      clearExpansionBridge();
    }
  };

  const updateRouteMonitor = () => {
    if (configured && !routeMonitor) {
      routeMonitor = setInterval(syncRouteState, 1000);
    } else if (!configured && routeMonitor) {
      clearInterval(routeMonitor);
      routeMonitor = null;
    }
  };

  const applyStorage = storage => {
    configured = Boolean(
      storage['biliplus-enable'] && storage['clean-home-page']
    );
    updateRouteMonitor();
    syncRouteState();
  };

  chrome.storage.sync.get(STORAGE_KEYS, applyStorage);

  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (
      areaName === 'sync' &&
      STORAGE_KEYS.some(key => Object.prototype.hasOwnProperty.call(changes, key))
    ) {
      chrome.storage.sync.get(STORAGE_KEYS, applyStorage);
    }
  });

  window.addEventListener('popstate', syncRouteState);
  window.addEventListener('pageshow', syncRouteState);
})();
