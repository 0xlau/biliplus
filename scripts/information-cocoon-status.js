/**
 * Exposes the effective privacy-mode state on Bilibili pages and asks the
 * background worker to reconcile its declarative rules as early as possible.
 */
(function initInformationCocoonStatus(globalScope) {
  const STORAGE_KEYS = ['biliplus-enable', 'reject-information-cocoon'];
  const STATUS_ATTRIBUTE = 'biliplus-information-cocoon';
  const RULE_STATUS_ATTRIBUTE = 'biliplus-information-cocoon-rules';
  const RULE_MATCH_ATTRIBUTE = 'biliplus-information-cocoon-match';
  const RULE_SYNC_MESSAGE = 'biliplus-sync-information-cocoon';

  const isEnabled = values =>
    Boolean(
      values?.['biliplus-enable'] &&
        values?.['reject-information-cocoon']
    );

  const getRuleState = status => {
    if (!status?.ok) return 'error';
    if (!status.enabled) return 'inactive';
    return status.ruleCount > 0 ? 'active' : 'error';
  };

  const getMatchState = status => {
    if (status?.recommendationMatches === true) return 'yes';
    if (status?.recommendationMatches === false) return 'no';
    return 'unknown';
  };

  const exposeRuleStatus = status => {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute(RULE_STATUS_ATTRIBUTE, getRuleState(status));
    root.setAttribute(RULE_MATCH_ATTRIBUTE, getMatchState(status));
  };

  const applyStatus = async values => {
    const root = document.documentElement;
    const enabled = isEnabled(values);
    root?.toggleAttribute(STATUS_ATTRIBUTE, enabled);
    if (!enabled) {
      root?.setAttribute(RULE_STATUS_ATTRIBUTE, 'inactive');
      root?.setAttribute(RULE_MATCH_ATTRIBUTE, 'unknown');
    }

    try {
      const status = await chrome.runtime.sendMessage({ type: RULE_SYNC_MESSAGE });
      exposeRuleStatus(status);
      if (!status?.ok && status?.error) {
        console.error('同步拒绝信息茧房规则失败', status.error);
      }
    } catch (error) {
      exposeRuleStatus({ ok: false });
      console.error('请求同步拒绝信息茧房规则失败', error);
    }
  };

  const api = {
    STORAGE_KEYS,
    STATUS_ATTRIBUTE,
    RULE_STATUS_ATTRIBUTE,
    RULE_MATCH_ATTRIBUTE,
    RULE_SYNC_MESSAGE,
    isEnabled,
    getRuleState,
    getMatchState,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  globalScope.BiliPlusInformationCocoonStatus = api;

  if (!globalScope.chrome?.storage?.sync || typeof document === 'undefined') return;

  chrome.storage.sync.get(STORAGE_KEYS).then(applyStatus).catch(error => {
    console.error('读取拒绝信息茧房设置失败', error);
  });
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (
      areaName === 'sync' &&
      STORAGE_KEYS.some(key => Object.prototype.hasOwnProperty.call(changes, key))
    ) {
      chrome.storage.sync.get(STORAGE_KEYS).then(applyStatus).catch(error => {
        console.error('刷新拒绝信息茧房状态失败', error);
      });
    }
  });
})(typeof globalThis === 'undefined' ? this : globalThis);
