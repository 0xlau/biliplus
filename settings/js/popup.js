const MODULE_KEYS = Object.freeze({
  home: [
    'clean-home-page',
    'hide-live-content',
    'hide-ad-content',
    'feed-roll-history-btn',
    'reject-information-cocoon'
  ],
  playback: ['stepless-video-rate', 'video-rate-remember', 'auto-widescreen', 'auto-subtitle'],
  search: ['hide-hot-search-list']
});

const TOOL_KEYS = ['ai-conclusion', 'invalid-video-info', 'cover-viewer'];
const COCOON_SYNC_MESSAGE = 'biliplus-sync-information-cocoon';
const allBooleanKeys = [...Object.values(MODULE_KEYS).flat(), ...TOOL_KEYS];
const STORAGE_KEYS = [
  'biliplus-enable',
  'autoplay-mode',
  'hide-user-comment',
  ...allBooleanKeys,
];

function openSettings(section) {
  const suffix = section ? `#${section}` : '';
  chrome.tabs.create({ url: `${chrome.runtime.getURL('settings/settings.html')}${suffix}` });
  window.close();
}

function updateMasterCopy(enabled) {
  document.getElementById('master-title').textContent = enabled ? '总开关已开启' : '总开关已关闭';
  document.getElementById('master-description').textContent = enabled
    ? '刷新已打开的 B 站页面后完全生效'
    : '配置已保留，刷新 B 站页面后完全生效';
  document.body.dataset.enabled = String(enabled);
}

function updateModuleSummary(storage) {
  const hasAutoplayOverride = Boolean(
    storage['autoplay-mode'] && storage['autoplay-mode'] !== 'keep'
  );
  const enabledCount = allBooleanKeys.filter(key => storage[key] === true).length
    + (hasAutoplayOverride ? 1 : 0)
    + (Array.isArray(storage['hide-user-comment']) && storage['hide-user-comment'].length > 0 ? 1 : 0);
  const masterEnabled = Boolean(storage['biliplus-enable']);
  document.getElementById('module-summary').textContent = enabledCount === 0
    ? '还没有开启功能，前往完整设置开始配置'
    : masterEnabled
      ? `${enabledCount} 项增强已配置，总开关已开启`
      : `已配置 ${enabledCount} 项增强，总开关已关闭`;

  Object.entries(MODULE_KEYS).forEach(([module, keys]) => {
    const count = keys.filter(key => storage[key] === true).length
      + (module === 'playback' && hasAutoplayOverride ? 1 : 0);
    const summary = document.getElementById(`${module}-summary`);
    summary.textContent = count > 0 ? `${count} 项已配置` : '未配置增强';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('extension-version').textContent = chrome.runtime.getManifest().version;
  const masterToggle = document.getElementById('master-toggle');
  const masterControl = masterToggle.closest('.popup-master');
  let masterSavePending = false;
  let masterPendingValue = false;

  async function flushMasterSave(storage) {
    masterSavePending = true;
    masterControl?.setAttribute('aria-busy', 'true');
    try {
      while (masterPendingValue !== Boolean(storage['biliplus-enable'])) {
        const valueToSave = masterPendingValue;
        try {
          await chrome.storage.sync.set({ 'biliplus-enable': valueToSave });
          storage['biliplus-enable'] = valueToSave;
          try {
            const result = await chrome.runtime.sendMessage({ type: COCOON_SYNC_MESSAGE });
            if (!result?.ok) throw new Error(result?.error || '后台未确认规则状态');
          } catch (error) {
            console.error('即时同步拒绝信息茧房规则失败', error);
          }
        } catch (error) {
          console.error('保存总开关失败', error);
          const persistedValue = Boolean(storage['biliplus-enable']);
          if (masterPendingValue !== persistedValue) {
            masterPendingValue = persistedValue;
            masterToggle.checked = persistedValue;
            updateMasterCopy(persistedValue);
            updateModuleSummary(storage);
            document.getElementById('module-summary').textContent = '保存失败，请重试';
          }
          return;
        }
      }
      updateMasterCopy(masterPendingValue);
      updateModuleSummary(storage);
    } finally {
      masterSavePending = false;
      masterControl?.setAttribute('aria-busy', 'false');
    }
  }

  document.querySelectorAll('[data-open-section]').forEach(button => {
    button.addEventListener('click', () => openSettings(button.dataset.openSection));
  });
  document.getElementById('open-settings').addEventListener('click', () => openSettings());

  try {
    const storage = await chrome.storage.sync.get(STORAGE_KEYS);
    masterToggle.checked = Boolean(storage['biliplus-enable']);
    masterToggle.disabled = false;
    updateMasterCopy(masterToggle.checked);
    updateModuleSummary(storage);
    masterPendingValue = masterToggle.checked;

    masterToggle.addEventListener('change', () => {
      masterPendingValue = masterToggle.checked;
      updateMasterCopy(masterPendingValue);
      updateModuleSummary({ ...storage, 'biliplus-enable': masterPendingValue });
      if (!masterSavePending) void flushMasterSave(storage);
    });
  } catch (error) {
    console.error('读取设置失败', error);
    document.getElementById('module-summary').textContent = '读取失败，请打开完整设置后重试';
  } finally {
    document.body.setAttribute('aria-busy', 'false');
  }
});
