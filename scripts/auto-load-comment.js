const replyMap = new Map()
let oid = null
chrome.storage.sync.get(['biliplus-enable'], storage => {
  if (!storage['biliplus-enable']) return
  const observer = new MutationObserver(async () => {
    if (document.querySelector('.reply-item')) {
      if (!oid) {
        const res = await _BILIAPI.getVideoInfo('BV1hH4y1N7SS')
        oid = res.aid
      }
      const replyList = document.querySelectorAll('.reply-item')
      // console.log(replyList)
      replyList.forEach(async replyDom => {
        const rid = replyDom.querySelector('.root-reply-avatar').getAttribute('data-root-reply-id')
        if (!replyMap.has(rid)) {
          replyMap.set(rid, replyDom)
          getComments(replyDom, rid)
        }
      })
    }
  }
  )
  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
})

const getComments = async (replyDom, rid) => {
  replyDom.querySelector('.view-more-btn') && replyDom.querySelector('.view-more-btn').click()
  const res = await _BILIAPI.getComment({
    type: 1, oid: oid, root: rid, ps: 10, pn: 1
  })
  const { size, count } = res.page

  const pageSize = count / size > 1 ? Math.ceil(count / size) : 1

  if (pageSize === 1) return
  for (let i = 2; i <= pageSize; i++) {
    const res = await _BILIAPI.getComment({
      type: 1, oid: oid, root: rid, ps: 10, pn: i
    })
    const comments = res.replies
    console.log(comments)
  }

}