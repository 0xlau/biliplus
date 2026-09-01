class _UTILS {
  static BV_XOR_CODE = 23442827791579n;
  static BV_MASK_CODE = 2251799813685247n;
  static BV_MAX_AID = 1n << 51n;
  static BV_BASE = 58n;
  static BV_ALPHABET = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';
  static BV_DIGIT_MAP = [0, 1, 2, 9, 7, 5, 6, 4, 8, 3, 10, 11];
  // 各数据源用来占位「已失效」的标题；jijidown 的「正在加载数据...」在 _BILIAPI.getJijidownInfo 里单独判断
  static INVALID_TITLE_SET = new Set(['已失效视频', '失效视频', '视频已失效', '（视频已删除）', '视频去哪了呢？', '该视频或许已经被删除了']);

  static getBvidFromUrl(url) {
    const match = /\/video\/([A-Za-z0-9]+)/.exec(url);
    if (match) {
      return match[1];
    }
    return null;
  }

  static avToBv(aid) {
    if (aid == null || aid === '') {
      return null;
    }
    let avid;
    try {
      avid = BigInt(aid);
    } catch {
      return null;
    }
    if (avid < 0n) {
      return null;
    }
    const bytes = ['B', 'V', '1', '', '', '', '', '', '', '', '', ''];
    let bvIdx = bytes.length - 1;
    let tmp = (this.BV_MAX_AID | avid) ^ this.BV_XOR_CODE;
    while (tmp !== 0n) {
      bytes[this.BV_DIGIT_MAP[bvIdx]] = this.BV_ALPHABET[Number(tmp % this.BV_BASE)];
      tmp /= this.BV_BASE;
      bvIdx -= 1;
    }
    return bytes.join('');
  }

  static bvToAv(bvid) {
    if (!bvid) {
      return null;
    }
    let id = String(bvid).trim();
    // 允许省略 "BV" 前缀的写法
    if (/^1[A-Za-z0-9]{9}$/.test(id)) {
      id = 'BV' + id;
    }
    if (!/^[Bb][Vv]1/.test(id) || id.length !== 12) {
      return null;
    }
    id = 'BV' + id.slice(2);
    let r = 0n;
    for (let i = 3; i < 12; i++) {
      const idx = this.BV_ALPHABET.indexOf(id[this.BV_DIGIT_MAP[i]]);
      if (idx < 0) {
        return null;
      }
      r = r * this.BV_BASE + BigInt(idx);
    }
    return Number((r & this.BV_MASK_CODE) ^ this.BV_XOR_CODE);
  }

  static getVideoIdFromUrl(url) {
    if (!url) {
      return {};
    }
    const href = String(url);
    const bvMatch = /\/video\/(BV[0-9A-Za-z]+)/i.exec(href);
    if (bvMatch) {
      const bvid = bvMatch[1].replace(/^bv/i, 'BV');
      return { bvid, aid: this.bvToAv(bvid) };
    }
    const avMatch = /\/video\/av(\d+)/i.exec(href) || /[?&]aid=(\d+)/.exec(href);
    if (avMatch) {
      const aid = Number(avMatch[1]);
      return { aid, bvid: this.avToBv(aid) };
    }
    return {};
  }

  static isInvalidVideoTitle(text) {
    return this.INVALID_TITLE_SET.has(String(text || '').trim());
  }

  static isUsableTitle(title, aid) {
    const text = String(title || '').trim();
    if (!text || this.INVALID_TITLE_SET.has(text)) {
      return false;
    }
    if (aid != null && text === String(aid)) {
      return false;
    }
    return true;
  }

  static normalizeCoverUrl(url) {
    if (!url) {
      return '';
    }
    let value = String(url).trim();
    if (!value) {
      return '';
    }
    if (value.startsWith('//')) {
      value = 'https:' + value;
    } else if (value.startsWith('http://')) {
      value = 'https://' + value.slice(7);
    }
    return value;
  }

  static isGoodCoverUrl(url) {
    const value = this.normalizeCoverUrl(url);
    if (!value) {
      return false;
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:') {
        return false;
      }
      const host = parsed.hostname.toLowerCase();
      const isHdslb = host === 'hdslb.com' || host.endsWith('.hdslb.com');
      if (!isHdslb) {
        return false;
      }
      // archive 是封面、storyframe 是首帧图
      return /\/bfs\/(archive|storyframe)\//i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  /**
   * 从收藏夹页 URL 取出 media id。
   * 只认路径里的 /list/ml{id}，以及 fid / fav_id / media_id 查询参数；认不到就返回 null。
   */
  static getFavMediaIdFromUrl(url) {
    if (!url) {
      return null;
    }
    try {
      const parsed = new URL(url, 'https://www.bilibili.com');
      const ml = /\/list\/ml(\d+)/.exec(parsed.pathname);
      if (ml) {
        return ml[1];
      }
      for (const key of ['fid', 'fav_id', 'media_id']) {
        const value = parsed.searchParams.get(key);
        if (value && /^\d+$/.test(value)) {
          return value;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  static getPageNumberFromUrl(url) {
    if (!url) {
      return null;
    }
    try {
      const parsed = new URL(url, 'https://www.bilibili.com');
      const raw = parsed.searchParams.get('pn') || parsed.searchParams.get('page');
      const num = Number(raw);
      return Number.isInteger(num) && num > 0 ? num : null;
    } catch {
      return null;
    }
  }

  /**
   * 用 API 列表顺序给 DOM 列表补 aid/bvid。
   * 只在「长度一致 + 至少一枚已有 id 的卡片与 API 对得上 + 没有任何 id 冲突」时才成功。
   * 不满足则返回 null，调用方不得按位置猜——错还原比不还原更糟。
   * @param {Array<{aid?: number, bvid?: string}>} domItems
   * @param {Array<{id?: number, aid?: number, bvid?: string, bv_id?: string}>} apiItems
   * @returns {Array|null}
   */
  static zipFillMissingIds(domItems, apiItems) {
    if (!Array.isArray(domItems) || !Array.isArray(apiItems) || !domItems.length || domItems.length !== apiItems.length) {
      return null;
    }
    let anchors = 0;
    const filled = [];
    for (let i = 0; i < domItems.length; i++) {
      const item = domItems[i] || {};
      const api = apiItems[i] || {};
      const apiAid = Number(api.id || api.aid);
      const apiBvid = api.bvid || api.bv_id || null;
      const hasApiAid = Number.isFinite(apiAid) && apiAid > 0;
      const parsedDomAid = item.aid != null && item.aid !== '' ? Number(item.aid) : item.bvid ? this.bvToAv(item.bvid) : null;
      const hasDomAid = Number.isFinite(parsedDomAid) && parsedDomAid > 0;
      if (hasDomAid || item.bvid) {
        const aidAgreed = hasDomAid && hasApiAid && parsedDomAid === apiAid;
        const bvAgreed = !!(item.bvid && apiBvid && String(item.bvid).toLowerCase() === String(apiBvid).toLowerCase());
        if (hasDomAid && hasApiAid && !aidAgreed) {
          return null;
        }
        if (item.bvid && apiBvid && !bvAgreed) {
          return null;
        }
        if (!aidAgreed && !bvAgreed) {
          return null;
        }
        anchors += 1;
      }
      const aid = hasDomAid ? parsedDomAid : hasApiAid ? apiAid : null;
      filled.push({
        ...item,
        aid,
        bvid: item.bvid || apiBvid || (aid ? this.avToBv(aid) : null)
      });
    }
    return anchors > 0 ? filled : null;
  }

  static findParentElement(element, func) {
    let _pe = element.parentElement;
    while (_pe != null) {
      if (func(_pe)) {
        return _pe;
      }
      _pe = _pe.parentElement;
    }
    if (_pe == null) {
      return null;
    }
  }

  static mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
  ];

  // 对 imgKey 和 subKey 进行字符顺序打乱编码
  static getMixinKey = (orig) =>
    this.mixinKeyEncTab
      .map((n) => orig[n])
      .join("")
      .slice(0, 32);

  // 为请求参数进行 wbi 签名
  static encWbi(params, img_key, sub_key) {
    const mixin_key = this.getMixinKey(img_key + sub_key),
      curr_time = Math.round(Date.now() / 1000),
      chr_filter = /[!'()*]/g;

    Object.assign(params, { wts: curr_time }); // 添加 wts 字段
    // 按照 key 重排参数
    const query = Object.keys(params)
      .sort()
      .map((key) => {
        // 过滤 value 中的 "!'()*" 字符
        const value = params[key].toString().replace(chr_filter, "");
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      })
      .join("&");

    const wbi_sign = md5(query + mixin_key); // 计算 w_rid

    return query + "&w_rid=" + wbi_sign;
  }

  // 获取最新的 img_key 和 sub_key
  static async getWbiKeys() {
    const {
      wbi_img: { img_url, sub_url },
    } = await _BILIAPI.getNavUserInfo();
    return {
      img_key: img_url.slice(
        img_url.lastIndexOf("/") + 1,
        img_url.lastIndexOf(".")
      ),
      sub_key: sub_url.slice(
        sub_url.lastIndexOf("/") + 1,
        sub_url.lastIndexOf(".")
      ),
    };
  }

  // 刷新 wts 和 wrid
  static async getwts(params) {
    const web_keys = await this.getWbiKeys();
    const img_key = web_keys.img_key;
    const sub_key = web_keys.sub_key;
    const query = this.encWbi(params, img_key, sub_key);
    return query;
  }

  static observe(node, callback, options) {
    const observer = new MutationObserver((mutations, ob) => {
      callback(mutations, ob);
    });
    observer.observe(
      node,
      Object.assign(
        {
          childList: true,
          subtree: true
        },
        options
      )
    );
    const disconnect = () => observer.disconnect();
    return disconnect;
  }
}
