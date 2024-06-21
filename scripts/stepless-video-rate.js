/**
 * 无级视频倍速
 */

let videoRate = 1.0;

// 获取本地倍速值
chrome.storage.sync.get('stepless-video-rate-value', val => {
  if (!val['stepless-video-rate-value']) {
    chrome.storage.sync.set({ 'stepless-video-rate-value': videoRate })
  } else {
    videoRate = val['stepless-video-rate-value']
  }
  document.querySelector('video').playbackRate = videoRate
})

const observer = new MutationObserver(() => {
  document.querySelector('video').playbackRate = videoRate
})
observer.observe(document.querySelector('video'), {
  attributes: true,
  childList: true,
  subtree: true
})

chrome.storage.sync.get(['biliplus-enable', 'stepless-video-rate'], storage => {
  if (storage['biliplus-enable'] && storage['stepless-video-rate']) {
    let hideBoxTimeout = null;
    var mousePositionY = 0;
    var initialPositionY = -10;
    const rateButton = `
      <div class="stepless-video-rate-btn" role="button" aria-label="无级倍速" tabindex="0">
        <div class="stepless-video-rate-btn-result">无级倍速</div>
        <div class="stepless-video-rate-box">
          <div class="stepless-video-rate-number">${videoRate}</div>
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
        const rate = document.querySelector('.stepless-video-rate-box .stepless-video-rate-number');

        // DOM创建完成后，根据本地倍速值初始化UI状态
        initialPositionY =  - videoRate / 5 * 48
        dot.style.transform = `translateY(${initialPositionY}px)`;
        bar.style.transform = `scaleY(${Math.abs(initialPositionY) / 48})`;

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

          if (tempPositionY + deltaY < -48 || tempPositionY + deltaY > 0) {
            return;
          }

          initialPositionY = tempPositionY + deltaY;
          dot.style.transform = `translateY(${initialPositionY}px)`;
          bar.style.transform = `scaleY(${Math.abs(initialPositionY) / 48})`;
          videoRate = ((Math.abs(initialPositionY) / 48) * 5).toFixed(1);
          rate.innerText = videoRate;
          document.querySelector('video').playbackRate = videoRate;
        }

        function mouseUp() {
          box.removeEventListener('mousemove', mouseMove);
          // 保存倍速值
          chrome.storage.sync.set({ 'stepless-video-rate-value': videoRate })
        }

        dot.addEventListener('mousedown', mouseDown);
        box.addEventListener('mouseup', mouseUp);

        const steplessBtn = document.querySelector('.stepless-video-rate-btn-result')
        console.log("🚀 ~ observer ~ steplessBtn:", steplessBtn)

        //double click to reset rate
        steplessBtn.addEventListener('dblclick', () => {
          document.querySelector('video').playbackRate = 1.0;
          videoRate = 1.0;
          // console.log("🚀 ~ steplessBtn.addEventListener ~ videoRate = 1.0;:", videoRate = 1.0)
          rate.innerText = "1.0";
          dot.style.transform = 'translateY(-10px)';
          bar.style.transform = 'scaleY(0.2)';
          mousePositionY = 0;
          initialPositionY = -10;
          // 保存倍速值
          chrome.storage.sync.set({ 'stepless-video-rate-value': videoRate.toFixed(1) })
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
