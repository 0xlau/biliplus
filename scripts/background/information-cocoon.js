/**
 * Cookie isolation for public video discovery endpoints.
 *
 * Keep the allowlist intentionally narrow: playback, account, interaction,
 * watch-history and creator-management requests must remain authenticated.
 */
(function initInformationCocoonMode(globalScope) {
  const STORAGE_KEYS = ['biliplus-enable', 'reject-information-cocoon'];
  const RULE_ID_BASE = 12001;
  const RULE_PRIORITY = 1000;
  const RULE_SYNC_MESSAGE = 'biliplus-sync-information-cocoon';
  const RECOMMENDATION_PROBE_URL =
    'https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?fresh_type=3';
  const DISCOVERY_ENDPOINTS = Object.freeze([
    '/x/web-interface/wbi/index/top/feed/rcmd',
    '/x/web-interface/index/top/rcmd',
    '/x/web-interface/index/ogv/rcmd',
    '/pugv/app/web/floor/switch',
    '/x/web-interface/archive/related',
    '/x/web-interface/popular',
    '/x/web-interface/ranking',
    '/x/web-interface/wbi/search/',
    '/x/web-interface/search/',
  ]);
  const RULE_IDS = Object.freeze(
    DISCOVERY_ENDPOINTS.map((_, index) => RULE_ID_BASE + index)
  );

  const buildRules = () =>
    DISCOVERY_ENDPOINTS.map((endpoint, index) => ({
      id: RULE_ID_BASE + index,
      priority: RULE_PRIORITY,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'cookie', operation: 'remove' }],
      },
      condition: {
        requestDomains: ['api.bilibili.com'],
        urlFilter: endpoint,
        resourceTypes: ['xmlhttprequest'],
      },
    }));

  const getOwnedRules = async chromeApi => {
    if (!chromeApi.declarativeNetRequest.getDynamicRules) return [];
    const dynamicRules = await chromeApi.declarativeNetRequest.getDynamicRules();
    return dynamicRules.filter(rule => RULE_IDS.includes(rule.id));
  };

  const shouldEnable = values =>
    Boolean(
      values?.['biliplus-enable'] &&
        values?.['reject-information-cocoon']
    );

  const getRuleStatus = async (chromeApi, enabled) => {
    const ownedRules = await getOwnedRules(chromeApi);
    let recommendationMatches = null;

    if (
      enabled &&
      typeof chromeApi.declarativeNetRequest.testMatchOutcome === 'function'
    ) {
      try {
        const outcome =
          await chromeApi.declarativeNetRequest.testMatchOutcome({
            url: RECOMMENDATION_PROBE_URL,
            type: 'xmlhttprequest',
            initiator: 'https://www.bilibili.com',
          });
        recommendationMatches = outcome.matchedRules.some(rule =>
          RULE_IDS.includes(rule.ruleId)
        );
      } catch (_error) {
        // Older Chrome versions can install the rules without exposing the
        // unpacked-extension diagnostic API. Keep the runtime state usable.
      }
    }

    return {
      enabled,
      ruleCount: ownedRules.length,
      recommendationMatches,
    };
  };

  const syncRules = async (chromeApi, suppliedValues) => {
    const values =
      suppliedValues || (await chromeApi.storage.sync.get(STORAGE_KEYS));
    const enabled = shouldEnable(values);
    await chromeApi.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [...RULE_IDS],
      addRules: enabled ? buildRules() : [],
    });

    if (chromeApi.declarativeNetRequest.getDynamicRules) {
      const installedRules = await getOwnedRules(chromeApi);
      const expectedRuleCount = enabled ? RULE_IDS.length : 0;
      if (installedRules.length !== expectedRuleCount) {
        throw new Error(
          `拒绝信息茧房规则同步不完整：期望 ${expectedRuleCount} 条，实际 ${installedRules.length} 条`
        );
      }
    }
    return enabled;
  };

  const api = {
    STORAGE_KEYS,
    RULE_IDS,
    RULE_PRIORITY,
    RULE_SYNC_MESSAGE,
    RECOMMENDATION_PROBE_URL,
    DISCOVERY_ENDPOINTS,
    buildRules,
    getOwnedRules,
    getRuleStatus,
    shouldEnable,
    syncRules,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  globalScope.BiliPlusInformationCocoon = api;

  const chromeApi = globalScope.chrome;
  if (!chromeApi?.declarativeNetRequest || !chromeApi?.storage?.sync) return;

  let syncQueue = Promise.resolve();
  const scheduleSync = () => {
    const syncAttempt = syncQueue
      .catch(() => undefined)
      .then(() => syncRules(chromeApi));
    syncQueue = syncAttempt.catch(error => {
      console.error('同步拒绝信息茧房规则失败', error);
      return false;
    });
    return syncAttempt;
  };

  chromeApi.runtime?.onInstalled?.addListener(scheduleSync);
  chromeApi.runtime?.onStartup?.addListener(scheduleSync);
  chromeApi.storage.onChanged?.addListener((changes, areaName) => {
    if (
      areaName === 'sync' &&
      STORAGE_KEYS.some(key => Object.prototype.hasOwnProperty.call(changes, key))
    ) {
      scheduleSync();
    }
  });
  chromeApi.tabs?.onUpdated?.addListener((_tabId, changeInfo, tab) => {
    const pageUrl = changeInfo.url || tab?.url || '';
    if (
      (changeInfo.status === 'loading' || changeInfo.url) &&
      /^https:\/\/(?:[^/]+\.)?bilibili\.com\//.test(pageUrl)
    ) {
      scheduleSync();
    }
  });
  chromeApi.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== RULE_SYNC_MESSAGE) return undefined;
    scheduleSync()
      .then(enabled => getRuleStatus(chromeApi, enabled))
      .then(status => sendResponse({ ok: true, ...status }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  });
  scheduleSync();
})(typeof globalThis === 'undefined' ? this : globalThis);
