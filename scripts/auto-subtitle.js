/**
 * 自动打开AI字幕
 * 需求背景：Issue #95 b站的学习视频里，切换分P后，每次都要重新再手动打开字幕，很麻烦
 * 解决方案：不单纯的看字幕按钮是否存在，因为分p场景里切换还是会有问题，所以需要看看请求里是否包含字幕
 */

chrome.storage.sync.get(['biliplus-enable', 'auto-subtitle'], storage => {
    if (storage['biliplus-enable'] && storage['auto-subtitle']) { // 注意这里的条件判断
        // 监听请求消息，使用mutation observer配合监听页面变化
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'subtitle-ready' && message.exists) {
                // 字幕存在，执行相应操作
                const disconnect = _UTILS.observe(document.body, () => {
                    // 能获取到
                    const subtitleBtn = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-subtitle');
                    if (!subtitleBtn) return;
        
                    const subtitleIcon = subtitleBtn.querySelector('.bpx-common-svg-icon');
                    if (subtitleIcon) {
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    subtitleIcon.dispatchEvent(clickEvent);
                    disconnect(); // 一旦触发了点击事件，就可以断开观察器
                    }
                });
            } 
        });
    }
  });