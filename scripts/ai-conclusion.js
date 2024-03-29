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
        const cardImageLinkElement = _UTILS.findParentElement(target, e => e.className == 'bili-video-card__image--link');
        const cardImageWrapElement = _UTILS.findParentElement(target, e => e.className == 'bili-video-card__image--wrap');

        let bvid = _UTILS.getBvidFromUrl(cardImageLinkElement.getAttribute('href'));
        if (aiData[bvid]) {
          if (aiData[bvid].code === 0) {
            createAIButtonElement(cardImageWrapElement, bvid);
          }
          return;
        }
        let cid = cardImageLinkElement.getAttribute('data-biliplus-cid');
        let up_mid = cardImageLinkElement.getAttribute('data-biliplus-up_mid');
        if (cid == null || up_mid == null) {
          try {
            const videoInfo = await _BILIAPI.getVideoInfo(bvid);
            console.log(videoInfo);
            cardImageLinkElement.setAttribute('data-biliplus-aid', videoInfo.aid);
            cardImageLinkElement.setAttribute('data-biliplus-cid', videoInfo.cid);
            cardImageLinkElement.setAttribute('data-biliplus-bvid', videoInfo.bvid);
            cardImageLinkElement.setAttribute('data-biliplus-up_mid', videoInfo.owner.mid);
            aid = videoInfo.aid;
            cid = videoInfo.cid;
            bvid = videoInfo.bvid;
            up_mid = videoInfo.owner.mid;
          } catch (e) {
            console.error(e);
            return;
          }
        }
        const aiConclusionRes = await _BILIAPI.getAIConclusion({
          bvid,
          cid,
          up_mid
        });
        aiData[bvid] = aiConclusionRes;
        console.log('aiConclusionRes', aiConclusionRes);
        if (aiConclusionRes.code === 0) {
          createAIButtonElement(cardImageWrapElement, bvid);
        }
      }
    });
  }
});

const createAIButtonElement = (cardImageWrapElement, bvid) => {
  const aiIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none">
      <g clip-path="url(#clip0_8665_4990)">
        <g opacity="0.6" filter="url(#filter0_f_8665_4990)">
          <path d="M21.5994 14.6024C21.5994 20.0163 17.3013 21.5998 11.9994 21.5998C6.69748 21.5998 2.39941 20.0163 2.39941 14.6024C2.39941 9.18859 3.13788 4.7998 11.9994 4.7998C21.2302 4.7998 21.5994 9.18859 21.5994 14.6024Z" fill="url(#paint0_linear_8665_4990)"/>
        </g>
        <g filter="url(#filter1_d_8665_4990)">
          <path d="M21.2301 15.234C21.2301 20.5883 17.0973 22.1544 11.9993 22.1544C6.90131 22.1544 2.76855 20.5883 2.76855 15.234C2.76855 9.87962 3.47861 5.53906 11.9993 5.53906C20.8751 5.53906 21.2301 9.87962 21.2301 15.234Z" fill="#D9D9D9"/>
        </g>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M6.03142 1.87875C6.54055 1.45447 7.29723 1.52326 7.7215 2.03239L9.72151 4.43239C10.1458 4.94153 10.077 5.6982 9.56786 6.12248C9.05873 6.54676 8.30205 6.47797 7.87777 5.96884L5.87777 3.56884C5.4535 3.0597 5.52229 2.30303 6.03142 1.87875Z" fill="url(#paint1_linear_8665_4990)"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M17.5682 1.87875C17.0591 1.45447 16.3024 1.52326 15.8781 2.03239L13.8781 4.43239C13.4538 4.94153 13.5226 5.6982 14.0317 6.12248C14.5409 6.54676 15.2976 6.47797 15.7218 5.96884L17.7218 3.56884C18.1461 3.0597 18.0773 2.30303 17.5682 1.87875Z" fill="url(#paint2_linear_8665_4990)"/>
        <g filter="url(#filter2_ii_8665_4990)">
          <path d="M22.4045 15.1648C22.4045 21.3304 17.7483 22.4057 12.0045 22.4057C6.26073 22.4057 1.60449 21.3304 1.60449 15.1648C1.60449 8.00566 2.40449 4.80566 12.0045 4.80566C22.0045 4.80566 22.4045 8.00566 22.4045 15.1648Z" fill="url(#paint3_linear_8665_4990)"/>
        </g>
        <path d="M3.83203 11.3712C3.83203 9.54498 5.159 7.97354 6.97224 7.75614C10.5687 7.32495 13.4174 7.30903 17.0537 7.74864C18.8589 7.96688 20.1749 9.53494 20.1749 11.3533V15.3575C20.1749 17.0701 19.0072 18.5846 17.3193 18.8746C13.5256 19.5264 10.5395 19.4008 6.85061 18.8149C5.09301 18.5357 3.83203 16.9898 3.83203 15.2101V11.3712Z" fill="#191924"/>
        <path d="M15.7178 12.2539L15.7178 14.4825" stroke="#2CFFFF" stroke-width="1.92" stroke-linecap="round"/>
        <path d="M8.31152 12.2539L8.31152 14.4825" stroke="#2CFFFF" stroke-width="1.92" stroke-linecap="round"/>
      </g>
      <defs>
        <filter id="filter0_f_8665_4990" x="-1.60059" y="0.799805" width="27.2002" height="24.7998" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix"/>
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
          <feGaussianBlur stdDeviation="2" result="effect1_foregroundBlur_8665_4990"/>
        </filter>
        <filter id="filter1_d_8665_4990" x="-0.000676155" y="2.76983" width="24.0004" height="22.1537" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset/>
          <feGaussianBlur stdDeviation="1.38462"/>
          <feComposite in2="hardAlpha" operator="out"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0.039545 0 0 0 0 0.0845023 0 0 0 0 0.200107 0 0 0 0.7 0"/>
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_8665_4990"/>
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_8665_4990" result="shape"/>
        </filter>
        <filter id="filter2_ii_8665_4990" x="0.00449228" y="3.31995" width="24.6284" height="21.3144" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix"/>
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset dx="2.22857" dy="2.97143"/>
          <feGaussianBlur stdDeviation="1.11429"/>
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0"/>
          <feBlend mode="normal" in2="shape" result="effect1_innerShadow_8665_4990"/>
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
          <feOffset dx="-1.6" dy="-1.48571"/>
          <feGaussianBlur stdDeviation="1.48571"/>
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0.15445 0 0 0 0 0.454264 0 0 0 0.11 0"/>
          <feBlend mode="normal" in2="effect1_innerShadow_8665_4990" result="effect2_innerShadow_8665_4990"/>
        </filter>
        <linearGradient id="paint0_linear_8665_4990" x1="4.15362" y1="6.9227" x2="27.6921" y2="26.7689" gradientUnits="userSpaceOnUse">
          <stop stop-color="#9DE3FA"/>
          <stop offset="1" stop-color="#1C29A0"/>
        </linearGradient>
        <linearGradient id="paint1_linear_8665_4990" x1="5.443" y1="2.28" x2="7.21478" y2="6.6384" gradientUnits="userSpaceOnUse">
          <stop stop-color="#393946"/>
          <stop offset="0.401159" stop-color="#23232E"/>
          <stop offset="1" stop-color="#191924"/>
        </linearGradient>
        <linearGradient id="paint2_linear_8665_4990" x1="18.1566" y1="2.28" x2="16.3848" y2="6.6384" gradientUnits="userSpaceOnUse">
          <stop stop-color="#393946"/>
          <stop offset="0.401159" stop-color="#23232E"/>
          <stop offset="1" stop-color="#191924"/>
        </linearGradient>
        <linearGradient id="paint3_linear_8665_4990" x1="6.14122" y1="8.65113" x2="15.9492" y2="23.2761" gradientUnits="userSpaceOnUse">
          <stop stop-color="#F4FCFF"/>
          <stop offset="1" stop-color="#EAF5F9"/>
        </linearGradient>
        <clipPath id="clip0_8665_4990">
          <rect width="24" height="24" fill="white"/>
        </clipPath>
      </defs>
    </svg>
      `;
  const btn = document.createElement('button');
  btn.innerHTML = aiIcon;
  btn.className = 'biliplus-ai-conclusion-button';
  cardImageWrapElement.appendChild(btn);
  cardImageWrapElement.addEventListener('mouseleave', () => {
    btn.remove();
  });
  btn.addEventListener('click', e => {
    e.preventDefault();
    // 避免重复打开窗口
    if (document.querySelectorAll('.biliplus-ai-conclusion-card-header').length > 0) {
      return;
    }
    const aiCardElement = createAICardElement(cardImageWrapElement);
    genterateAIConclusionCard(aiData[bvid], aiCardElement, bvid);
  });
};

const genterateAIConclusionCard = (aiConclusionRes, aiCardElement, bvid) => {
  let aiCard = '';
  const { model_result } = aiConclusionRes;
  if (aiConclusionRes.code !== 0) {
    aiCard = `
    <div class="biliplus-ai-conclusion-card-header">当前视频暂不支持AI视频总结</div>
    `;
  } else {
    aiCard = `
    <div class="biliplus-ai-conclusion-card-header">
      <div class="biliplus-ai-conclusion-card-header-left">
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none"
            xmlns="http://www.w3.org/2000/svg" class="ai-summary-popup-icon" >
            <g clip-path="url(#clip0_8728_3421)">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M7.53976 2.34771C8.17618 1.81736 9.12202 1.90335 9.65237 2.53976L12.1524 5.53976C12.6827 6.17618 12.5967 7.12202 11.9603 7.65237C11.3239 8.18272 10.3781 8.09673 9.84771 7.46031L7.34771 4.46031C6.81736 3.8239 6.90335 2.87805 7.53976 2.34771Z" fill="url(#paint0_linear_8728_3421)"></path>
                <path fill-rule="evenodd" clip-rule="evenodd" d="M21.9602 2.34771C21.3238 1.81736 20.378 1.90335 19.8476 2.53976L17.3476 5.53976C16.8173 6.17618 16.9033 7.12202 17.5397 7.65237C18.1761 8.18272 19.1219 8.09673 19.6523 7.46031L22.1523 4.46031C22.6826 3.8239 22.5967 2.87805 21.9602 2.34771Z" fill="url(#paint1_linear_8728_3421)"></path>
                <g opacity="0.2" filter="url(#filter0_d_8728_3421)">
                    <path d="M27 18.2533C27 25.0206 21.6274 27 15 27C8.37258 27 3 25.0206 3 18.2533C3 11.486 3.92308 6 15 6C26.5385 6 27 11.486 27 18.2533Z" fill="#D9D9D9"></path>
                </g>
                <g filter="url(#filter1_ii_8728_3421)">
                    <path d="M28 18.9489C28 26.656 22.1797 28 15 28C7.8203 28 2 26.656 2 18.9489C2 10 3 6 15 6C27.5 6 28 10 28 18.9489Z" fill="url(#paint2_linear_8728_3421)"></path>
                </g>
                <path d="M4.78613 14.2091C4.78613 11.9263 6.44484 9.96205 8.71139 9.6903C13.2069 9.1513 16.7678 9.13141 21.3132 9.68091C23.5697 9.95371 25.2147 11.9138 25.2147 14.1868V19.192C25.2147 21.3328 23.7551 23.2258 21.6452 23.5884C16.903 24.4032 13.1705 24.2461 8.55936 23.5137C6.36235 23.1647 4.78613 21.2323 4.78613 19.0078V14.2091Z" fill="#191924"></path>
                <path d="M19.6426 15.3125L19.6426 18.0982" stroke="#2CFFFF" stroke-width="2.4" stroke-linecap="round"></path>
                <path d="M10.3574 14.8516L12.2146 16.7087L10.3574 18.5658" stroke="#2CFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
            </g>
            <defs>
                <filter id="filter0_d_8728_3421" x="1" y="4" width="30" height="27" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"></feColorMatrix>
                    <feOffset dx="1" dy="1"></feOffset>
                    <feGaussianBlur stdDeviation="1.5"></feGaussianBlur>
                    <feComposite in2="hardAlpha" operator="out"></feComposite>
                    <feColorMatrix type="matrix" values="0 0 0 0 0.039545 0 0 0 0 0.0845023 0 0 0 0 0.200107 0 0 0 0.85 0"></feColorMatrix>
                    <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_8728_3421"></feBlend>
                    <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_8728_3421" result="shape"></feBlend>
                </filter>
                <filter id="filter1_ii_8728_3421" x="0" y="4.14286" width="30.7857" height="26.6429" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                    <feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood>
                    <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"></feColorMatrix>
                    <feOffset dx="2.78571" dy="3.71429"></feOffset>
                    <feGaussianBlur stdDeviation="1.39286"></feGaussianBlur>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"></feComposite>
                    <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.25 0"></feColorMatrix>
                    <feBlend mode="normal" in2="shape" result="effect1_innerShadow_8728_3421"></feBlend>
                    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"></feColorMatrix>
                    <feOffset dx="-2" dy="-1.85714"></feOffset>
                    <feGaussianBlur stdDeviation="1.85714"></feGaussianBlur>
                    <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"></feComposite>
                    <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0.15445 0 0 0 0 0.454264 0 0 0 0.11 0"></feColorMatrix>
                    <feBlend mode="normal" in2="effect1_innerShadow_8728_3421" result="effect2_innerShadow_8728_3421"></feBlend>
                </filter>
                <linearGradient id="paint0_linear_8728_3421" x1="6.80424" y1="2.84927" x2="9.01897" y2="8.29727" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#393946"></stop>
                    <stop offset="0.401159" stop-color="#23232E"></stop>
                    <stop offset="1" stop-color="#191924"></stop>
                </linearGradient>
                <linearGradient id="paint1_linear_8728_3421" x1="22.6958" y1="2.84927" x2="20.481" y2="8.29727" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#393946"></stop>
                    <stop offset="0.401159" stop-color="#23232E"></stop>
                    <stop offset="1" stop-color="#191924"></stop>
                </linearGradient>
                <linearGradient id="paint2_linear_8728_3421" x1="7.67091" y1="10.8068" x2="19.9309" y2="29.088" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#F4FCFF"></stop>
                    <stop offset="1" stop-color="#EAF5F9"></stop>
                </linearGradient>
                <clipPath id="clip0_8728_3421">
                    <rect width="30" height="30" fill="white"></rect>
                </clipPath>
            </defs>
        </svg>
        <span class="tips-text">已为你生成视频总结</span>
      </div>
    </div>
    <div class="biliplus-ai-conclusion-card-summary">
    ${model_result.summary}
    </div>
    `;
    model_result.outline.forEach(item => {
      aiCard += `
      <div class="biliplus-ai-conclusion-card-selection">
        <div class="biliplus-ai-conclusion-card-selection-title">${item.title}</div>
        ${item.part_outline
          .map(
            s => `
          <a class="bullet" href="https://www.bilibili.com/video/${bvid}/?t=${s.timestamp}s">
            <span class="biliplus-ai-conclusion-card-selection-timer">${timeNumberToTime(s.timestamp)}</span>
            <span>${s.content}</span>
          </a>
        `
          )
          .join('')}
      </div>
      `;
    });
  }
  aiCardElement.innerHTML = aiCard;
};

const createAICardElement = cardElement => {
  const div = document.createElement('div');
  div.className = 'biliplus-ai-conclusion-card';
  div.innerHTML = '<div class="biliplus-ai-conclusion-card-header">正在加载 AI 总结</div>';
  //获取屏幕宽度
  const clientWidth = document.documentElement.clientWidth;
  //根据cardElement位置判断卡片应该在左边还是右边
  if (clientWidth - cardElement.getBoundingClientRect().right < 400) {
    div.style.left = cardElement.getBoundingClientRect().left - 400 + 'px';
  } else {
    div.style.left = cardElement.getBoundingClientRect().right + 'px';
  }
  //根据屏幕滚动高度计算卡片位置
  div.style.top = cardElement.getBoundingClientRect().top + 'px';
  // div.style.top = (cardElement.getBoundingClientRect().top - 50) + 'px'
  const feedCard = _UTILS.findParentElement(cardElement, e => e.className == 'feed-card' || e.classList[0] == 'bili-video-card');
  feedCard.appendChild(div);
  //鼠标移出卡片消失
  feedCard.addEventListener('mouseleave', () => {
    div.remove();
  });
  return div;
};
const timeNumberToTime = time => {
  let min = Math.floor(time / 60);
  let sec = time % 60;
  min = min < 10 ? '0' + min : min;
  sec = sec < 10 ? '0' + sec : sec;
  return `${min}:${sec}`;
};
