/**
 * 无级视频倍速
 */

let videoRate = 1.0;
let currentVideoElement = null;
let persistRate = false; // 是否在切换视频时保持倍速
let lastVideoSrc = null; // 记录上次的视频源，用于检测视频切换

// 监听 storage 变化，实时更新 persistRate 设置
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes['stepless-video-rate-persist']) {
    persistRate = changes['stepless-video-rate-persist'].newValue || false;
  }
});

/**
 * 保存倍速到 chrome.storage（用于跨标签页同步）
 */
function saveVideoRate(rate) {
  if (persistRate) {
    chrome.storage.sync.set({ 'stepless-video-rate-value': rate });
  }
}

/**
 * 重置倍速到 1.0x 并更新 UI
 */
function resetRateAndUI() {
  videoRate = 1.0;

  const rateInput = document.querySelector('.stepless-video-rate-input');
  const dot = document.querySelector('.stepless-video-rate-box .bui-thumb');
  const bar = document.querySelector('.stepless-video-rate-box .bui-bar');

  if (rateInput) rateInput.value = '1.0';
  if (dot) dot.style.transform = 'translateY(-17.6px)';
  if (bar) bar.style.transform = 'scaleY(0.2)';
}

/**
 * 绑定视频倍速同步
 * 根据 persistRate 设置决定：保持倍速 或 重置为 1.0x
 */
function bindVideoRateSync() {
  const video = document.querySelector('video');
  if (!video) return;

  const isNewElement = video !== currentVideoElement;

  if (isNewElement) {
    currentVideoElement = video;
    lastVideoSrc = video.src || video.currentSrc;

    // 首次绑定时，如果 persistRate 为 true，应用存储的倍速
    if (persistRate) {
      video.playbackRate = videoRate;
    }

    // 监听 playing 事件：只有在 persistRate 为 true 时才应用倍速
    // 使用 setTimeout 延迟设置，确保在 Bilibili 播放器完成初始化后再设置
    video.addEventListener('playing', function onPlaying() {
      if (persistRate) {
        setTimeout(() => {
          video.playbackRate = videoRate;
        }, 100);
      }
    });

    // 监听 loadstart 事件：检测视频源变化，这是切换视频的信号
    video.addEventListener('loadstart', function onLoadStart() {
      const currentSrc = video.src || video.currentSrc;

      // 检测视频源是否变化（排除首次加载）
      if (lastVideoSrc && currentSrc !== lastVideoSrc) {
        // 视频切换了，根据 persistRate 决定行为
        if (persistRate) {
          // 保持倍速 - 延迟设置以对抗 Bilibili 播放器的重置
          setTimeout(() => {
            video.playbackRate = videoRate;
          }, 100);
        } else {
          // 重置倍速 - 同样需要延迟设置以对抗 Bilibili 播放器
          resetRateAndUI();
          setTimeout(() => {
            video.playbackRate = 1.0;
          }, 100);
        }
      }
      lastVideoSrc = currentSrc;
    });
  }
}

chrome.storage.sync.get(['biliplus-enable', 'stepless-video-rate', 'stepless-video-rate-persist', 'stepless-video-rate-value'], storage => {
  // 读取倍速保持设置
  persistRate = storage['stepless-video-rate-persist'] || false;

  // 如果开启了保持倍速，从 storage 读取上次的倍速值
  if (persistRate && storage['stepless-video-rate-value']) {
    videoRate = parseFloat(storage['stepless-video-rate-value']) || 1.0;
  }

  if (storage['biliplus-enable'] && storage['stepless-video-rate']) {
    let hideBoxTimeout = null;
    var mousePositionY = 0;
    // 根据 videoRate 计算初始位置：-88 * (rate / 5.0)
    var initialPositionY = -88 * (videoRate / 5.0);
    
    // 优化：将原来的 div 替换为 input，并添加内联样式以适配 UI
    // 使用动态值以支持跨标签页保持倍速
    const barScale = videoRate / 5.0;
    const rateButton = `
      <div class="stepless-video-rate-btn" role="button" aria-label="无级倍速" tabindex="0">
        <div class="stepless-video-rate-btn-result">无级倍速</div>
        <div class="stepless-video-rate-box">
          <input type="number" class="stepless-video-rate-input" step="0.1" min="0.1" max="5.0" value="${videoRate}">
          <div class="stepless-video-rate-progress bui bui-slider">
            <div class="bui-area">
              <div
                class="bui-track bui-track-vertical"
                style=""
              >
                <div class="bui-bar-wrap">
                  <div class="bui-bar bui-bar-normal" role="progressbar" style="transform: scaleY(${barScale});"></div>
                </div>
                <div class="bui-thumb" style="left: -5px; transform: translateY(${initialPositionY}px);">
                  <div class="bui-thumb-dot" style=""></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.classList.add('biliplus-stepless-video-rate');

    // 用 MutationObserver 解决页面初始化时无法找到 bpx-player-ctrl-playbackrate 按钮
    const disconnect = _UTILS.observe(document.body, () => {
      // 每次 DOM 变化时检查并同步视频倍速（解决切换视频后倍速不同步的问题）
      bindVideoRateSync();

      if (document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-playbackrate') == null) {
        return;
      }
      if (document.querySelector('.stepless-video-rate-btn') == null) {
        const playerControl = document.querySelector('.bpx-player-control-bottom-right');
        const oldRateButton = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-playbackrate');

        const newRateButton = document.createElement('div');
        playerControl.insertBefore(newRateButton, oldRateButton);
        newRateButton.outerHTML = rateButton;

        const box = document.querySelector('.stepless-video-rate-box');
        const dot = document.querySelector('.stepless-video-rate-box .bui-thumb');
        const bar = document.querySelector('.stepless-video-rate-box .bui-bar');
        
        const rateInput = document.querySelector('.stepless-video-rate-box .stepless-video-rate-input');
        rateInput.value = videoRate;

        const steplessVideoRateBtn = document.querySelector('.stepless-video-rate-btn');

        // 进入 btn 区域就显示 box（使用 mouseenter，不会冒泡）
        steplessVideoRateBtn.addEventListener('mouseenter', () => {
          showBox();
          if (hideBoxTimeout != null) {
            clearTimeout(hideBoxTimeout);
            hideBoxTimeout = null;
          }
        });

        // 在 box 内移动时，确保清除隐藏定时器
        box.addEventListener('mouseenter', () => {
          if (hideBoxTimeout != null) {
            clearTimeout(hideBoxTimeout);
            hideBoxTimeout = null;
          }
        });

        // 离开 btn 就消失 box
        steplessVideoRateBtn.addEventListener('mouseleave', () => {
          // 如果输入框聚焦，则不隐藏
          if (document.activeElement === rateInput) return;

          // 防抖 400 ms
          hideBoxTimeout = setTimeout(() => {
            hideBox();
            box.removeEventListener('mousemove', mouseMove);
          }, 400);
        });

        // 进度条逻辑
        let tempPositionY = 0;
        function mouseDown(event) {
          mousePositionY = event.clientY;
          tempPositionY = initialPositionY;
          box.addEventListener('mousemove', mouseMove);
        }

        function mouseMove(event) {
          let deltaY = event.clientY - mousePositionY;

          // 这里的范围检测也需要更新为 88
          if (tempPositionY + deltaY < -88 || tempPositionY + deltaY > 0) {
            return;
          }

          initialPositionY = tempPositionY + deltaY;
          dot.style.transform = `translateY(${initialPositionY}px)`;
          bar.style.transform = `scaleY(${Math.abs(initialPositionY) / 88})`;
          videoRate = ((Math.abs(initialPositionY) / 88) * 5).toFixed(1);
          
          rateInput.value = videoRate;
          document.querySelector('video').playbackRate = videoRate;
        }

        function mouseUp() {
          box.removeEventListener('mousemove', mouseMove);
          // 拖动结束时保存倍速到 storage
          saveVideoRate(videoRate);
        }

        dot.addEventListener('mousedown', mouseDown);
        box.addEventListener('mouseup', mouseUp);

        const steplessBtn = document.querySelector('.stepless-video-rate-btn-result')

        // 优化：防止事件冒泡 + 处理 Enter 键
        rateInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                // 主动触发 change 逻辑
                rateInput.dispatchEvent(new Event('change'));
                // 失焦
                rateInput.blur();
                // 立即隐藏
                hideBox();
                box.removeEventListener('mousemove', mouseMove);
            }
        });

        // 输入框改变事件
        rateInput.addEventListener('change', () => {
          let newRate = parseFloat(rateInput.value);
          if (isNaN(newRate) || newRate < 0.1) newRate = 0.1;
          if (newRate > 5.0) newRate = 5.0;

          rateInput.value = newRate;
          videoRate = newRate;

          document.querySelector('video').playbackRate = videoRate;

          initialPositionY = -88 * (newRate / 5.0);
          dot.style.transform = `translateY(${initialPositionY}px)`;
          bar.style.transform = `scaleY(${Math.abs(initialPositionY) / 88})`;

          // 保存倍速到 storage
          saveVideoRate(videoRate);
        });

        // 输入框失焦时，如果鼠标不在按钮区域，才隐藏
        rateInput.addEventListener('blur', () => {
           if (!document.querySelector('.stepless-video-rate-btn').matches(':hover')) {
               hideBoxTimeout = setTimeout(() => {
                hideBox();
                box.removeEventListener('mousemove', mouseMove);
              }, 400);
           }
        });

        // double click to reset rate
        steplessBtn.addEventListener('dblclick', () => {
          document.querySelector('video').playbackRate = 1.0;
          videoRate = 1.0;

          rateInput.value = "1.0";

          // 1.0倍速对应的位置：-88 * (1.0 / 5.0) = -17.6
          document.querySelector('.stepless-video-rate-box .bui-thumb').style.transform = 'translateY(-17.6px)';
          document.querySelector('.stepless-video-rate-box .bui-bar').style.transform = 'scaleY(0.2)';
          mousePositionY = 0;
          initialPositionY = -17.6;

          // 保存重置后的倍速到 storage
          saveVideoRate(videoRate);
        });
      }else{
        disconnect();
      }
    });
  }
});

function showBox() {
  const rateBox = document.querySelector('.stepless-video-rate-box');
  if (!rateBox.classList.contains('display')) {
    rateBox.classList.add('display');
  }
}

function hideBox() {
  const rateBox = document.querySelector('.stepless-video-rate-box');
  if (rateBox.classList.contains('display')) {
    rateBox.classList.remove('display');
  }
}
