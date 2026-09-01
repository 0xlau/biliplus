/**
 * 首页“换一换”回溯功能实现
 */
chrome.storage.sync.get(['biliplus-enable', 'feed-roll-history-btn'], storage => {
  if (!storage['biliplus-enable'] || !storage['feed-roll-history-btn']) {
    return;
  }

  const feedHistory = [];
  // 当索引等于历史长度时，表示当前页面是尚未保存的新一页。
  let feedHistoryIndex = 0;

  const backIconPath =
    'M5.82843 6.99955L8.36396 9.53509L6.94975 10.9493L2 5.99955L6.94975 1.0498L8.36396 2.46402L5.82843 4.99955H13C17.4183 4.99955 21 8.58127 21 12.9996C21 17.4178 17.4183 20.9996 13 20.9996H4V18.9996H13C16.3137 18.9996 19 16.3133 19 12.9996C19 9.68584 16.3137 6.99955 13 6.99955H5.82843Z';
  const nextIconPath =
    'M18.1716 6.99955H11C7.68629 6.99955 5 9.68584 5 12.9996C5 16.3133 7.68629 18.9996 11 18.9996H20V20.9996H11C6.58172 20.9996 3 17.4178 3 12.9996C3 8.58127 6.58172 4.99955 11 4.99955H18.1716L15.636 2.46402L17.0503 1.0498L22 5.99955L17.0503 10.9493L15.636 9.53509L18.1716 6.99955Z';

  const createFeedRollButton = (id, className, label, iconPath) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = `primary-btn ${className} biliplus-disabled`;
    button.disabled = true;
    button.setAttribute('aria-label', label);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', iconPath);
    svg.appendChild(path);
    button.appendChild(svg);
    return button;
  };

  const listInnerHTMLOfFeedCard = () =>
    Array.from(document.getElementsByClassName('feed-card'), feedCard => feedCard.innerHTML);

  const setButtonDisabled = (id, disabled) => {
    const button = document.getElementById(id);
    if (!button) {
      return;
    }
    button.disabled = disabled;
    button.classList.toggle('biliplus-disabled', disabled);
  };

  const updateButtonStates = () => {
    setButtonDisabled('feed-roll-back-btn', feedHistoryIndex <= 0);
    setButtonDisabled(
      'feed-roll-next-btn',
      feedHistoryIndex >= feedHistory.length - 1
    );
  };

  const restoreFeed = snapshot => {
    if (!snapshot) {
      return;
    }

    const feedCards = document.getElementsByClassName('feed-card');
    const count = Math.min(feedCards.length, snapshot.length);
    for (let index = 0; index < count; index++) {
      feedCards[index].innerHTML = snapshot[index];
    }
  };

  const saveCurrentFeedBeforeRoll = () => {
    const currentFeed = listInnerHTMLOfFeedCard();
    if (currentFeed.length === 0) {
      return;
    }

    if (feedHistoryIndex === feedHistory.length) {
      // 当前页尚未进入历史，先保存再让 B 站执行“换一换”。
      feedHistory.push(currentFeed);
    } else {
      // 从历史页重新“换一换”时，应丢弃原来的前进分支。
      feedHistory[feedHistoryIndex] = currentFeed;
      feedHistory.splice(feedHistoryIndex + 1);
    }

    // B 站更新后显示的页面暂不保存，在回退时再按需保存。
    feedHistoryIndex = feedHistory.length;
    updateButtonStates();
  };

  const handleBack = () => {
    if (feedHistoryIndex === feedHistory.length) {
      const currentFeed = listInnerHTMLOfFeedCard();
      if (currentFeed.length > 0) {
        feedHistory.push(currentFeed);
      }
    }

    if (feedHistoryIndex <= 0) {
      updateButtonStates();
      return;
    }

    feedHistoryIndex -= 1;
    restoreFeed(feedHistory[feedHistoryIndex]);
    updateButtonStates();
  };

  const handleNext = () => {
    if (feedHistoryIndex >= feedHistory.length - 1) {
      updateButtonStates();
      return;
    }

    feedHistoryIndex += 1;
    restoreFeed(feedHistory[feedHistoryIndex]);
    updateButtonStates();
  };

  const mountButtons = () => {
    const feedRollBtn = document.querySelector('.roll-btn');
    if (!feedRollBtn || !feedRollBtn.parentElement) {
      return false;
    }

    if (!document.getElementById('feed-roll-back-btn')) {
      const backButton = createFeedRollButton(
        'feed-roll-back-btn',
        'feed-roll-back-btn',
        '返回上一组推荐',
        backIconPath
      );
      const nextButton = createFeedRollButton(
        'feed-roll-next-btn',
        'feed-roll-next-btn',
        '前往下一组推荐',
        nextIconPath
      );
      const insertionPoint = feedRollBtn.nextSibling;
      feedRollBtn.parentElement.insertBefore(backButton, insertionPoint);
      feedRollBtn.parentElement.insertBefore(nextButton, insertionPoint);
      backButton.addEventListener('click', handleBack);
      nextButton.addEventListener('click', handleNext);
      updateButtonStates();
    }

    return true;
  };

  // 在捕获阶段、B 站自身的点击处理之前保存当前推荐。
  // 使用事件委托也能兼容首页重新创建“换一换”按钮的情况。
  document.addEventListener(
    'click',
    event => {
      const target = event.target;
      if (target instanceof Element && target.closest('.roll-btn')) {
        saveCurrentFeedBeforeRoll();
      }
    },
    true
  );

  // Firefox/Zen 中内容脚本执行时，首页推荐容器可能尚未挂载。
  // 先立即查找；找不到时观察稳定存在的 documentElement，避免 observe(null) 抛错。
  if (!mountButtons()) {
    const observer = new MutationObserver(() => {
      if (mountButtons()) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
});
