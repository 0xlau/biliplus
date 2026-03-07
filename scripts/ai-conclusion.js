/**
 * 悬浮显示ai总结
 */

const aiData = {};

chrome.storage.sync.get(['biliplus-enable', 'ai-conclusion'], storage => {
  if (storage['biliplus-enable'] && storage['ai-conclusion']) {
    const container = document.querySelector('body');

    container.addEventListener('mouseover', async e => {
      const target = e.target;
      if (target.nodeName === 'IMG' && target.parentElement.classList.contains('bili-video-card__cover')) {
        const cardElement = _UTILS.findParentElement(target, e => e.classList.contains('bili-video-card'));
        if (cardElement == null) {
          return;
        }
        // 忽略广告卡片
        if (cardElement.innerHTML.indexOf('bili-video-card__info--ad') != -1) {
          return;
        }
        const cardImageLinkElement = _UTILS.findParentElement(target, e => e.classList.contains('bili-video-card__image--link'));
        const cardImageWrapElement = _UTILS.findParentElement(target, e => e.classList.contains('bili-video-card__image--wrap'));

        if (!cardImageLinkElement || !cardImageWrapElement) {
          console.warn('[BiliPlus] Failed to find link or wrap element.', { cardImageLinkElement, cardImageWrapElement });
          return;
        }

        let bvid = _UTILS.getBvidFromUrl(cardImageLinkElement.getAttribute('href'));

        // 如果已经有卡片正在显示，或者正在加载，则跳过
        if (cardImageWrapElement.querySelector('.biliplus-ai-conclusion-card')) {
          return;
        }

        const showSummary = (data) => {
          if (data && data.code === 0) {
            // 确保鼠标还在这个容器里，防止请求延迟导致鼠标移走后突然弹出
            if (cardImageWrapElement.matches(':hover')) {
              const aiCardElement = createAICardElement(cardImageWrapElement);
              genterateAIConclusionCard(data, aiCardElement, bvid);
            }
          }
        };

        if (aiData[bvid]) {
          showSummary(aiData[bvid]);
          return;
        }

        let cid = cardImageLinkElement.getAttribute('data-biliplus-cid');
        let up_mid = cardImageLinkElement.getAttribute('data-biliplus-up_mid');
        if (cid == null || up_mid == null) {
          try {
            const videoInfo = await _BILIAPI.getVideoInfo(bvid);
            cardImageLinkElement.setAttribute('data-biliplus-aid', videoInfo.aid);
            cardImageLinkElement.setAttribute('data-biliplus-cid', videoInfo.cid);
            cardImageLinkElement.setAttribute('data-biliplus-bvid', videoInfo.bvid);
            cardImageLinkElement.setAttribute('data-biliplus-up_mid', videoInfo.owner.mid);
            cid = videoInfo.cid;
            up_mid = videoInfo.owner.mid;
          } catch (e) {
            console.error('[BiliPlus] Failed to get video info:', e);
            return;
          }
        }

        const aiConclusionRes = await _BILIAPI.getAIConclusion({
          bvid,
          cid,
          up_mid
        });
        aiData[bvid] = aiConclusionRes;
        showSummary(aiConclusionRes);
      }
    });
  }
});

const genterateAIConclusionCard = (aiConclusionRes, aiCardElement, bvid) => {
  const { model_result } = aiConclusionRes;
  if (!aiConclusionRes || aiConclusionRes.code !== 0) {
    aiCardElement.innerHTML = `
      <div class="biliplus-ai-conclusion-card-header">当前视频暂不支持AI视频总结</div>
    `;
    return;
  }

  let aiCard = `
    <div class="biliplus-ai-conclusion-card-header">
      <div class="biliplus-ai-conclusion-card-header-left">
        <svg width="24" height="24" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" class="ai-summary-popup-icon">
          <g clip-path="url(#clip0_8728_3421)">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M7.53976 2.34771C8.17618 1.81736 9.12202 1.90335 9.65237 2.53976L12.1524 5.53976C12.6827 6.17618 12.5967 7.12202 11.9603 7.65237C11.3239 8.18272 10.3781 8.09673 9.84771 7.46031L7.34771 4.46031C6.81736 3.8239 6.90335 2.87805 7.53976 2.34771Z" fill="url(#paint0_linear_8728_3421)"></path>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M21.9602 2.34771C21.3238 1.81736 20.378 1.90335 19.8476 2.53976L17.3476 5.53976C16.8173 6.17618 16.9033 7.12202 17.5397 7.65237C18.1761 8.18272 19.1219 8.09673 19.6523 7.46031L22.1523 4.46031C22.6826 3.8239 22.5967 2.87805 21.9602 2.34771Z" fill="url(#paint1_linear_8728_3421)"></path>
            <linearGradient id="paint0_linear_8728_3421" x1="6.80424" y1="2.84927" x2="9.01897" y2="8.29727" gradientUnits="userSpaceOnUse"><stop stop-color="#393946"></stop><stop offset="0.401159" stop-color="#23232E"></stop><stop offset="1" stop-color="#191924"></stop></linearGradient>
            <linearGradient id="paint1_linear_8728_3421" x1="22.6958" y1="2.84927" x2="20.481" y2="8.29727" gradientUnits="userSpaceOnUse"><stop stop-color="#393946"></stop><stop offset="0.401159" stop-color="#23232E"></stop><stop offset="1" stop-color="#191924"></stop></linearGradient>
          </g>
        </svg>
        <span class="tips-text">AI 视频总结</span>
      </div>
    </div>
    <div class="biliplus-ai-conclusion-card-body">
      <div class="biliplus-ai-conclusion-card-summary">${model_result.summary}</div>
      <div class="biliplus-ai-conclusion-card-outlines">
        ${model_result.outline.map(item => `
          <div class="biliplus-ai-conclusion-card-selection">
            <div class="biliplus-ai-conclusion-card-selection-title">${item.title}</div>
            <div class="bullets">
              ${item.part_outline.map(s => `
                <a class="bullet" href="https://www.bilibili.com/video/${bvid}/?t=${s.timestamp}s" target="_blank">
                  <span class="timer">${timeNumberToTime(s.timestamp)}</span>
                  <span class="content">${s.content}</span>
                </a>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  aiCardElement.innerHTML = aiCard;
};

const createAICardElement = wrapElement => {
  const div = document.createElement('div');
  div.className = 'biliplus-ai-conclusion-card';
  div.innerHTML = '<div class="biliplus-ai-conclusion-card-header">正在加载 AI 总结...</div>';

  wrapElement.appendChild(div);

  // 鼠标移出容器（封面）时移除总结
  wrapElement.addEventListener('mouseleave', () => {
    div.remove();
  }, { once: true });

  return div;
};

const timeNumberToTime = time => {
  let min = Math.floor(time / 60);
  let sec = time % 60;
  return `${min < 10 ? '0' + min : min}:${sec < 10 ? '0' + sec : sec}`;
};
