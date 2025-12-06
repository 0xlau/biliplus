/**
 * 无级视频倍速
 */

let videoRate = 1.0;

chrome.storage.sync.get(['biliplus-enable', 'stepless-video-rate'], storage => {
  if (storage['biliplus-enable'] && storage['stepless-video-rate']) {
    let hideBoxTimeout = null;
    var mousePositionY = 0;
    var initialPositionY = -10;
    
    // 优化：将原来的 div 替换为 input，并添加内联样式以适配 UI
    const rateButton = `
      <div class="stepless-video-rate-btn" role="button" aria-label="无级倍速" tabindex="0">
        <div class="stepless-video-rate-btn-result">无级倍速</div>
        <div class="stepless-video-rate-box">
          <input type="number" class="stepless-video-rate-input" step="0.1" min="0.1" max="5.0" value="1.0">
          <div class="stepless-video-rate-progress bui bui-slider">
            <div class="bui-area">
              <div
                class="bui-track bui-track-vertical"
                style=""
              >
                <div class="bui-bar-wrap">
                  <div class="bui-bar bui-bar-normal" role="progressbar" style="transform: scaleY(0.2);"></div>
                </div>
                <div class="bui-thumb" style="left: -5px; transform: translateY(-10px);">
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

        // 进入 btn 就显示 box
        document.querySelector('#bilibili-player').addEventListener('mouseover', e => {
          const target = e.target;
          if (target.nodeName === 'DIV' && target.parentElement.classList.contains('stepless-video-rate-btn')) {
            showBox();
            if (hideBoxTimeout != null) {
              clearTimeout(hideBoxTimeout);
            }
          }
        });

        // 离开 btn 就消失 box
        document.querySelector('.stepless-video-rate-btn').addEventListener('mouseleave', e => {
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
        }

        dot.addEventListener('mousedown', mouseDown);
        box.addEventListener('mouseup', mouseUp);

        const steplessBtn = document.querySelector('.stepless-video-rate-btn-result')
        console.log("😊 ~ observer ~ steplessBtn:", steplessBtn)

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
          
          document.querySelector('.stepless-video-rate-box .bui-thumb').style.transform = 'translateY(-10px)';
          document.querySelector('.stepless-video-rate-box .bui-bar').style.transform = 'scaleY(0.2)';
          mousePositionY = 0;
          initialPositionY = -10;
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
