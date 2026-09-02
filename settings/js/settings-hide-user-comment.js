(function initHiddenUserSettings() {
  'use strict';

  const STORAGE_KEY = 'hide-user-comment';
  let users = [];
  let mutationPending = false;

  function setStatus(message, state = 'saved') {
    const status = document.getElementById('user-status');
    status.dataset.state = state;
    status.querySelector('span:last-child').textContent = message;
  }

  function normalizeAvatar(value) {
    const raw = String(value || '').trim();
    if (!raw) return './img/logo_128.png';
    const candidate = raw.startsWith('//') ? `https:${raw}` : raw;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:') url.protocol = 'https:';
      return url.protocol === 'https:' ? url.href : './img/logo_128.png';
    } catch (_error) {
      return './img/logo_128.png';
    }
  }

  function normalizedUser(user) {
    return {
      mid: String(user?.mid || '').trim(),
      uname: String(user?.uname || '').trim() || `UID ${user?.mid || ''}`,
      upic: normalizeAvatar(user?.upic),
    };
  }

  async function persistUsers() {
    await chrome.storage.sync.set({ [STORAGE_KEY]: users });
  }

  function setFormEnabled(enabled) {
    document.getElementById('user-id-box').disabled = !enabled;
    document.getElementById('add-user').disabled = !enabled;
  }

  function focusAfterRemoval(removedIndex) {
    const removeButtons = Array.from(document.querySelectorAll('#user-list .secondary-action'));
    if (removeButtons.length > 0) {
      removeButtons[Math.min(removedIndex, removeButtons.length - 1)].focus();
      return;
    }
    document.getElementById('hidden-users-title').focus();
  }

  function createUserCard(user) {
    const card = document.createElement('article');
    card.className = 'user-card';
    card.dataset.userMid = user.mid;

    const avatar = document.createElement('img');
    avatar.className = 'user-card__avatar';
    avatar.src = user.upic;
    avatar.alt = '';
    avatar.width = 44;
    avatar.height = 44;
    avatar.referrerPolicy = 'no-referrer';

    const copy = document.createElement('span');
    copy.className = 'user-card__copy';
    const name = document.createElement('strong');
    name.textContent = user.uname;
    const mid = document.createElement('small');
    mid.textContent = `UID ${user.mid}`;
    copy.append(name, mid);

    const remove = document.createElement('button');
    remove.className = 'secondary-action';
    remove.type = 'button';
    remove.textContent = '移除';
    remove.setAttribute('aria-label', `移除 ${user.uname}`);
    remove.addEventListener('click', async () => {
      if (mutationPending) return;
      mutationPending = true;
      const removedIndex = users.findIndex(item => item.mid === user.mid);
      remove.setAttribute('aria-busy', 'true');
      remove.setAttribute('aria-disabled', 'true');
      setFormEnabled(false);
      setStatus(`正在移除 ${user.uname}…`, 'saving');
      const previousUsers = users;
      users = users.filter(item => item.mid !== user.mid);
      try {
        await persistUsers();
        renderUsers();
        setStatus(`已移除 ${user.uname}`);
        focusAfterRemoval(Math.max(removedIndex, 0));
      } catch (error) {
        console.error('移除隐藏用户失败', error);
        users = previousUsers;
        remove.removeAttribute('aria-busy');
        remove.removeAttribute('aria-disabled');
        setStatus('移除失败，请重试', 'error');
        remove.focus();
      } finally {
        mutationPending = false;
        setFormEnabled(true);
      }
    });

    card.append(avatar, copy, remove);
    return card;
  }

  function renderUsers() {
    const list = document.getElementById('user-list');
    list.replaceChildren(...users.map(createUserCard));
    document.getElementById('empty-state').hidden = users.length > 0;
  }

  async function addUser(keyword) {
    const userInfo = await _BILIAPI.getUserInfoByKeyword(keyword);
    if (!userInfo) {
      setStatus('没有找到完全匹配的用户', 'error');
      return false;
    }

    const user = normalizedUser(userInfo);
    if (users.some(item => item.mid === user.mid)) {
      setStatus(`${user.uname} 已在列表中`, 'error');
      return false;
    }

    users = [user, ...users];
    try {
      await persistUsers();
      renderUsers();
      setStatus(`已添加 ${user.uname}`);
      return true;
    } catch (error) {
      console.error('添加隐藏用户失败', error);
      users = users.filter(item => item.mid !== user.mid);
      setStatus('保存失败，请重试', 'error');
      return false;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('user-form');
    const input = document.getElementById('user-id-box');
    const submit = document.getElementById('add-user');
    setFormEnabled(false);

    try {
      const storage = await chrome.storage.sync.get(STORAGE_KEY);
      users = Array.isArray(storage[STORAGE_KEY])
        ? storage[STORAGE_KEY].map(normalizedUser).filter(user => user.mid)
        : [];
      renderUsers();
      setStatus(users.length > 0 ? `已隐藏 ${users.length} 位用户` : '列表为空');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const keyword = input.value.trim();
        if (!keyword || mutationPending) return;

        mutationPending = true;
        setFormEnabled(false);
        setStatus('正在查找用户…', 'saving');
        try {
          if (await addUser(keyword)) input.value = '';
        } catch (error) {
          console.error('查询 B 站用户失败', error);
          setStatus('查询失败，请检查网络后重试', 'error');
        } finally {
          mutationPending = false;
          setFormEnabled(true);
          input.focus();
        }
      });
      setFormEnabled(true);
      document.body.setAttribute('aria-busy', 'false');
    } catch (error) {
      console.error('读取隐藏用户列表失败', error);
      setFormEnabled(false);
      document.body.setAttribute('aria-busy', 'false');
      setStatus('读取失败，请刷新重试', 'error');
    }
  });
})();
