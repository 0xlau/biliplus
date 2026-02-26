/**
 * 屏蔽首页非视频推荐 (直播/番剧/综艺/课堂/广告)
 */
chrome.storage.sync.get(['biliplus-enable', 'hide-non-video-rcmd'], storage => {
    if (storage['biliplus-enable'] && storage['hide-non-video-rcmd']) {
        const disconnect = _UTILS.observe(document.body, () => {
            // 匹配 .bili-video-card 和旧版 .feed-card
            const cards = document.querySelectorAll('.bili-video-card, .feed-card');

            cards.forEach(card => {
                // 如果已经被隐藏，跳过以节省性能
                if (card.style.display === 'none') return;

                const linkElem = card.querySelector('a');
                const link = linkElem ? linkElem.href : '';
                const badgeElem = card.querySelector('.bili-video-card__badge, .bili-video-card__info--badge, .bili-video-card__info--ad');
                const badgeText = badgeElem ? badgeElem.innerText : '';
                const isAdClass = card.querySelector('.bili-video-card__info--ad') !== null;

                const isNonVideo =
                    link.includes('live.bilibili.com') ||
                    link.includes('bangumi/play') ||
                    link.includes('cheese/play') ||
                    link.includes('cm.bilibili.com') ||
                    isAdClass ||
                    (badgeText && badgeText.match(/直播|番剧|国创|综艺|电影|课堂|广告/));

                if (isNonVideo) {
                    card.style.display = 'none';
                }
            });
        });
    }
});
