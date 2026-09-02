const SETTINGS_DEFAULTS = Object.freeze({
  'autoplay-mode': 'keep',
  'search-history-limit': 20
});
const COCOON_SYNC_MESSAGE = 'biliplus-sync-information-cocoon';
const COCOON_SYNC_KEYS = new Set([
  'biliplus-enable',
  'reject-information-cocoon',
]);
const INVALID_VIDEO_SETTING_KEY = 'invalid-video-info';
const ARCHIVE_ORIGINS = Object.freeze([
  'https://www.biliplus.com/*',
  'https://www.jijidown.com/*',
]);
const persistedValues = new Map();
const pendingSaves = new WeakMap();

const settingElements = () => Array.from(document.querySelectorAll('[data-setting]'));

function readElementValue(element) {
  if (element.type === 'checkbox') return element.checked;
  if (element.dataset.settingType === 'number') return Number(element.value);
  return element.value;
}

function applyElementValue(element, value) {
  if (element.type === 'checkbox') {
    element.checked = Boolean(value);
    return;
  }
  element.value = String(value ?? SETTINGS_DEFAULTS[element.dataset.setting] ?? '');
}

function setSaveState(message, state = 'saved') {
  const saveState = document.getElementById('save-state');
  if (!saveState) return;
  saveState.dataset.state = state;
  const label = saveState.querySelector('span:last-child');
  if (label) label.textContent = message;
}

function updateMasterState(enabled) {
  document.body.dataset.masterEnabled = String(enabled);
  const notice = document.getElementById('pause-notice');
  if (notice) notice.hidden = enabled;
}

function setSettingsBusy(busy) {
  document.body.setAttribute('aria-busy', String(busy));
  settingElements().forEach(element => {
    element.disabled = busy;
  });
}

async function syncInformationCocoonRules(key) {
  if (!COCOON_SYNC_KEYS.has(key)) return;
  try {
    const result = await chrome.runtime.sendMessage({ type: COCOON_SYNC_MESSAGE });
    if (!result?.ok) throw new Error(result?.error || '后台未确认规则状态');
  } catch (error) {
    console.error('即时同步拒绝信息茧房规则失败', error);
  }
}

function archivePermissionRequest() {
  return { origins: [...ARCHIVE_ORIGINS] };
}

async function hasArchiveAccess() {
  return chrome.permissions.contains(archivePermissionRequest());
}

async function requestArchiveAccess() {
  return chrome.permissions.request(archivePermissionRequest());
}

async function removeArchiveAccess() {
  return chrome.permissions.remove(archivePermissionRequest());
}

async function flushSettingSave(element, state) {
  const key = element.dataset.setting;
  const settingRow = element.closest('.setting-row, .master-switch');
  state.saving = true;
  settingRow?.setAttribute('aria-busy', 'true');

  try {
    while (!Object.is(state.desiredValue, persistedValues.get(key))) {
      const valueToSave = state.desiredValue;
      setSaveState('正在保存…', 'saving');
      try {
        await chrome.storage.sync.set({ [key]: valueToSave });
        persistedValues.set(key, valueToSave);
        await syncInformationCocoonRules(key);
      } catch (error) {
        console.error(`保存设置 ${key} 失败`, error);
        const persistedValue = persistedValues.get(key);
        if (!Object.is(state.desiredValue, persistedValue)) {
          state.desiredValue = persistedValue;
          applyElementValue(element, persistedValue);
          if (key === 'biliplus-enable') updateMasterState(Boolean(persistedValue));
          setSaveState('保存失败，请重试', 'error');
        } else {
          applyElementValue(element, persistedValue);
          setSaveState('已保存', 'saved');
        }
        return;
      }
    }
    setSaveState('已保存', 'saved');
  } finally {
    state.saving = false;
    settingRow?.setAttribute('aria-busy', 'false');
  }
}

async function restoreSettings() {
  const elements = settingElements();
  const keys = [...new Set(elements.map(element => element.dataset.setting))];
  const storage = await chrome.storage.sync.get([...keys, 'hide-user-comment']);
  let restoreNotice = '';
  if (storage[INVALID_VIDEO_SETTING_KEY] && !(await hasArchiveAccess())) {
    storage[INVALID_VIDEO_SETTING_KEY] = false;
    await chrome.storage.sync.set({ [INVALID_VIDEO_SETTING_KEY]: false });
    restoreNotice = '失效视频归档权限未授权，功能已保持关闭';
  }

  elements.forEach(element => {
    const key = element.dataset.setting;
    const value = storage[key] ?? SETTINGS_DEFAULTS[key] ?? false;
    applyElementValue(element, value);
    persistedValues.set(key, value);
  });
  updateMasterState(Boolean(persistedValues.get('biliplus-enable')));

  const hiddenUsers = storage['hide-user-comment'] || [];
  const badge = document.getElementById('hide-user-comment-count');
  if (badge && hiddenUsers.length > 0) {
    badge.textContent = String(hiddenUsers.length);
    badge.hidden = false;
  }
  return restoreNotice;
}

async function handleInvalidVideoChange(element, state, nextValue) {
  const settingRow = element.closest('.setting-row');
  state.desiredValue = nextValue;
  settingRow?.setAttribute('aria-busy', 'true');

  try {
    if (nextValue) {
      setSaveState('等待归档站访问授权…', 'saving');
      const granted = await requestArchiveAccess();
      const accessAvailable = granted && await hasArchiveAccess();
      if (!state.desiredValue) {
        if (accessAvailable) await removeArchiveAccess();
        return;
      }
      if (!accessAvailable) {
        state.desiredValue = Boolean(persistedValues.get(INVALID_VIDEO_SETTING_KEY));
        applyElementValue(element, state.desiredValue);
        setSaveState('未授予归档站权限，功能未开启', 'error');
        return;
      }
    } else {
      await removeArchiveAccess();
    }

    if (!state.saving) await flushSettingSave(element, state);
  } catch (error) {
    console.error('更新失效视频归档权限失败', error);
    state.desiredValue = Boolean(persistedValues.get(INVALID_VIDEO_SETTING_KEY));
    applyElementValue(element, state.desiredValue);
    setSaveState('归档站权限更新失败，请重试', 'error');
  } finally {
    if (!state.saving) settingRow?.setAttribute('aria-busy', 'false');
  }
}

function bindSettings() {
  settingElements().forEach(element => {
    const state = {
      desiredValue: persistedValues.get(element.dataset.setting),
      saving: false,
    };
    pendingSaves.set(element, state);

    element.addEventListener('change', () => {
      const key = element.dataset.setting;
      const nextValue = readElementValue(element);
      if (key === INVALID_VIDEO_SETTING_KEY) {
        void handleInvalidVideoChange(element, state, Boolean(nextValue));
        return;
      }
      state.desiredValue = nextValue;
      if (key === 'biliplus-enable') updateMasterState(Boolean(nextValue));
      if (!state.saving) void flushSettingSave(element, state);
    });
  });
}

function bindNavigation() {
  const links = Array.from(document.querySelectorAll('.settings-nav a'));
  const sections = links.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  const updateCurrent = id => {
    links.forEach(link => {
      if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  const observer = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) updateCurrent(visible.target.id);
  }, { rootMargin: '-20% 0px -65%', threshold: [0.05, 0.4] });

  sections.forEach(section => observer.observe(section));
  links.forEach(link => link.addEventListener('click', () => updateCurrent(link.hash.slice(1))));
}

document.addEventListener('DOMContentLoaded', async () => {
  const version = document.getElementById('extension-version');
  if (version) version.textContent = chrome.runtime.getManifest().version;
  bindNavigation();
  setSettingsBusy(true);
  try {
    const restoreNotice = await restoreSettings();
    bindSettings();
    setSettingsBusy(false);
    setSaveState(restoreNotice || '设置会自动保存', restoreNotice ? 'error' : 'saved');
  } catch (error) {
    console.error('读取设置失败', error);
    document.body.setAttribute('aria-busy', 'false');
    setSaveState('读取失败，请刷新重试', 'error');
  }
});
