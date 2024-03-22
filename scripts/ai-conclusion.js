/**
 * 悬浮显示ai总结
 */

const aiData = {}

chrome.storage.sync.get(["biliplus-enable", "ai-conclusion"], (storage) => {

  if (storage["biliplus-enable"] && storage["ai-conclusion"]) {

    const aiCard = `
    <div class="biliplus-ai-conclusion-card-header">在顺德吃粥底火锅和双皮奶的经历。视频中提到168元的4人餐牛肉猪杂加油条吃得挺饱,再花100多元多吃双皮奶。对于粥底火锅,视频中提到环境不太好,但菜品新鲜,牛肉和猪杂都很嫩滑,调料简单但味道很棒。对于双皮奶,视频中称赞口感嫩滑,奶香味十足,但觉得姜撞奶做得不太好。最后,视频还提到了买了一份手工龟苓膏和凉茶,但凉茶很苦。</div>
    <div class="biliplus-ai-conclusion-card-selection">
      <div class="biliplus-ai-conclusion-card-selection-title">作者在顺德吃粥底火锅的经历,包括环境、菜品和口感等方面。</div>
      <div>
        <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
        <span>顺德美食体验：粥底火锅和双皮奶</span>
      </div>
      <div>
        <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
        <span>顺德美食体验：粥底火锅和双皮奶</span>
      </div>
      <div>
        <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
        <span>顺德美食体验：粥底火锅和双皮奶</span>
      </div>
    </div>
     <div class="biliplus-ai-conclusion-card-selection">
      <div class="biliplus-ai-conclusion-card-selection-title">作者在顺德吃粥底火锅的经历,包括环境、菜品和口感等方面。</div>
      <div>
        <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
        <span>顺德美食体验：粥底火锅和双皮奶</span>
      </div>
      <div>
        <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
        <span>顺德美食体验：粥底火锅和双皮奶</span>
      </div>
      <div>
        <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
        <span>顺德美食体验：粥底火锅和双皮奶</span>
      </div>
    </div>
    <div class="biliplus-ai-conclusion-card-selection">
    <div class="biliplus-ai-conclusion-card-selection-title">作者在顺德吃粥底火锅的经历,包括环境、菜品和口感等方面。</div>
    <div>
      <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
      <span>顺德美食体验：粥底火锅和双皮奶</span>
    </div>
    <div>
      <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
      <span>顺德美食体验：粥底火锅和双皮奶</span>
    </div>
    <div>
      <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
      <span>顺德美食体验：粥底火锅和双皮奶</span>
    </div>
  </div>
  <div class="biliplus-ai-conclusion-card-selection">
  <div class="biliplus-ai-conclusion-card-selection-title">作者在顺德吃粥底火锅的经历,包括环境、菜品和口感等方面。</div>
  <div>
    <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
    <span>顺德美食体验：粥底火锅和双皮奶</span>
  </div>
  <div>
    <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
    <span>顺德美食体验：粥底火锅和双皮奶</span>
  </div>
  <div>
    <span class="biliplus-ai-conclusion-card-selection-timer">00:01</span>
    <span>顺德美食体验：粥底火锅和双皮奶</span>
  </div>
</div>
  `

    const container = document.querySelector('.container')

    container.addEventListener('mouseover', async (e) => {
      const target = e.target
      if (target.nodeName === 'IMG' && target.parentElement.classList.contains('bili-video-card__cover')) {
        const cardElement = _UTILS.findParentElement(
          target,
          (e) => e.className == "bili-video-card__image--link"
        )
        const aiCardElement = createAiCardElement(cardElement, target)

        let bvid = _UTILS.getBvidFromUrl(cardElement.getAttribute("href"));
        if (aiData[bvid]) {
          genterateAiConclusionCard(aiData[bvid], aiCardElement)
          return
        }
        let cid = cardElement.getAttribute("data-biliplus-cid");
        let up_mid = cardElement.getAttribute('data-biliplus-up_mid')
        if (cid == null || up_mid == null) {
          try {
            const videoInfo = await _BILIAPI.getVideoInfo(bvid);
            console.log(videoInfo, videoInfo.owner.mid)
            cardElement.setAttribute("data-biliplus-aid", videoInfo.aid);
            cardElement.setAttribute("data-biliplus-cid", videoInfo.cid);
            cardElement.setAttribute("data-biliplus-bvid", videoInfo.bvid);
            cardElement.setAttribute("data-biliplus-up_mid", videoInfo.owner.mid);
            aid = videoInfo.aid;
            cid = videoInfo.cid;
            bvid = videoInfo.bvid;
            up_mid = videoInfo.owner.mid
          } catch (e) {
            console.error(e);
            return;
          }
        }
        const aiConclusionRes = await _UTILS.getAiConclusion({ bvid, cid, up_mid })
        aiData[bvid] = aiConclusionRes
        genterateAiConclusionCard(aiConclusionRes, aiCardElement)
      }
    })

  }
});


const genterateAiConclusionCard = (aiConclusionRes, aiCardElement) => {
  let aiCard = ''
  const { model_result } = aiConclusionRes
  if (aiConclusionRes.code !== 0) {
    aiCard = `
    <div class="biliplus-ai-conclusion-card-header">暂无AI总结</div>
    `
  } else {
    aiCard = `
    <div class="biliplus-ai-conclusion-card-header">${model_result.summary}</div>
  
    `
    model_result.outline.forEach(item => {
      aiCard += `
      <div class="biliplus-ai-conclusion-card-selection">
        <div class="biliplus-ai-conclusion-card-selection-title">${item.title}</div>
        ${item.part_outline.map(s => `
          <div>
            <span class="biliplus-ai-conclusion-card-selection-timer">${timeNumberToTime(s.timestamp)}</span>
            <span>${s.content}</span>
          </div>
        `).join('')}
      </div>
      `
    })
  }
  aiCardElement.innerHTML = aiCard
}

const createAiCardElement = (cardElement, target) => {
  
  const div = document.createElement('div')
  div.className = 'biliplus-ai-conclusion-card '
  div.innerHTML = '<div class="biliplus-ai-conclusion-card-header">正在加载AI 总结</div>'
  //获取屏幕宽度
  const clientWidth = document.documentElement.clientWidth
  //根据cardElement位置判断卡片应该在左边还是右边
  if (clientWidth - cardElement.getBoundingClientRect().right < 400) {
    div.style.left = cardElement.getBoundingClientRect().left - 400 + 'px'
  } else {
    div.style.left = cardElement.getBoundingClientRect().right + 'px'
  }
  //根据屏幕滚动高度计算卡片位置
  div.style.top = (cardElement.getBoundingClientRect().top) + 'px'
  // div.style.top = (cardElement.getBoundingClientRect().top - 50) + 'px'
  const feedCard = _UTILS.findParentElement(
    target,
    (e) => e.className == "feed-card" || e.classList[0] == "bili-video-card"
  );
  feedCard.appendChild(div)
  //鼠标移出卡片消失
  feedCard.addEventListener('mouseleave', () => {
    div.remove()
  })
  return div
}
const timeNumberToTime = (time) => {
  let min = Math.floor(time / 60)
  let sec = time % 60
  min = min < 10 ? '0' + min : min
  sec = sec < 10 ? '0' + sec : sec
  return `${min}:${sec}`
}