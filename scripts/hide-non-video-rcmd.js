/**
 * 屏蔽首页非视频推荐 (直播/番剧/综艺/课堂/广告)
 */
chrome.storage.sync.get(['biliplus-enable', 'hide-non-video-rcmd'], storage => {
    if (storage['biliplus-enable'] && storage['hide-non-video-rcmd']) {
        const disconnect = _UTILS.observe(document.body, () => {
            // 匹配 .bili-video-card, 旧版 .feed-card, 以及直播卡片 .bili-live-card
            const cards = document.querySelectorAll('.bili-video-card, .feed-card, .bili-live-card');

            cards.forEach(card => {
                // 如果已经被隐藏，跳过以节省性能
                if (card.style.display === 'none') return;

                // 直播卡片特殊类名直接判断
                if (card.classList.contains('bili-live-card')) {
                    card.style.display = 'none';
                    return;
                }

                const linkElem = card.querySelector('a');
                const link = linkElem ? linkElem.href : '';
                const badgeElem = card.querySelector('.bili-video-card__badge, .bili-video-card__info--badge, .bili-video-card__info--ad');
                const badgeText = badgeElem ? badgeElem.innerText : '';
                const isAdClass = card.querySelector('.bili-video-card__info--ad') !== null;

                // 有些直播或者赛事卡片的文字会写在 bottom 区块里
                const bottomElem = card.querySelector('.bili-video-card__info--bottom');
                const bottomText = bottomElem ? bottomElem.innerText : '';

                const isNonVideo =
                    link.includes('live.bilibili.com') ||
                    link.includes('bangumi/play') ||
                    link.includes('cheese/play') ||
                    link.includes('cm.bilibili.com') ||
                    isAdClass ||
                    (badgeText && badgeText.match(/直播|番剧|国创|综艺|电影|课堂|广告/)) ||
                    (bottomText && bottomText.match(/直播|赛事/));

                if (isNonVideo) {
                    card.style.display = 'none';
                }
            });
        });
    }
});
