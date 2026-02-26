/**
 * 屏蔽首页非视频推荐 (直播/番剧/综艺/课堂/广告/漫画/赛事)
 */
chrome.storage.sync.get(['biliplus-enable', 'hide-non-video-rcmd'], storage => {
    if (storage['biliplus-enable'] && storage['hide-non-video-rcmd']) {
        // 用 CSS class 代替 inline style，减少被 B站 检测到的风险
        const style = document.createElement('style');
        style.textContent = '.biliplus-hidden { display: none !important; }';
        document.head.appendChild(style);

        const hideCard = (card) => {
            // 向上找到 .feed-card 父容器（grid 单元格），隐藏整个格子消除黑块
            const feedCard = card.closest('.feed-card');
            if (feedCard) {
                feedCard.classList.add('biliplus-hidden');
            } else {
                card.classList.add('biliplus-hidden');
            }
        };

        let bannerRemoved = false;

        _UTILS.observe(document.body, () => {
            // 自动关闭 B站 反插件警告横幅
            if (!bannerRemoved) {
                const banner = document.querySelector('.adblock-tips');
                if (banner) {
                    const closeBtn = banner.querySelector('svg, .close, .close-btn, [class*="close"]');
                    if (closeBtn) closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    else banner.remove();
                    bannerRemoved = true;
                }
            }

            const cards = document.querySelectorAll('.bili-video-card, .feed-card, .bili-live-card, .floor-single-card');

            cards.forEach(card => {
                if (card.classList.contains('biliplus-hidden')) return;

                // 直播卡片和 floor-single-card（番剧/综艺/电影/漫画/赛事）直接隐藏
                if (card.classList.contains('bili-live-card') || card.classList.contains('floor-single-card')) {
                    hideCard(card);
                    return;
                }

                const linkElem = card.querySelector('a');
                const link = linkElem ? linkElem.href : '';
                const badgeElem = card.querySelector('.bili-video-card__badge, .bili-video-card__info--badge, .bili-video-card__info--ad');
                const badgeText = badgeElem ? badgeElem.innerText : '';
                const isAdClass = card.querySelector('.bili-video-card__info--ad') !== null;

                const bottomElem = card.querySelector('.bili-video-card__info--bottom');
                const bottomText = bottomElem ? bottomElem.innerText : '';

                const isNonVideo =
                    link.includes('live.bilibili.com') ||
                    link.includes('bangumi/play') ||
                    link.includes('cheese/play') ||
                    link.includes('cm.bilibili.com') ||
                    isAdClass ||
                    (badgeText && badgeText.match(/直播|番剧|国创|综艺|电影|课堂|广告|纪录片|电视剧|动画/)) ||
                    (bottomText && bottomText.match(/直播|赛事/));

                if (isNonVideo) {
                    hideCard(card);
                }
            });
        });
    }
});
