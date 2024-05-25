class _UTILS {
  static getBvidFromUrl(url) {
    const match = /\/video\/([A-Za-z0-9]+)/.exec(url);
    if (match) {
      return match[1];
    }
    return null;
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

  //时间戳转时间
  static formatTime(time) {
    const date = new Date(time * 1000);
    // 如果time距离现在超过10小时显示具体时间，小于1小时显示“n分钟前” 否则显示“n小时前”
    const now = new Date();
    const diff = (now - date) / 1000;
    if (diff < 3600) {
      return `${Math.floor(diff / 60)}分钟前`;
    }
    if (diff < 36000) {
      return `${Math.floor(diff / 3600)}小时前`;
    } else {
      //分钟数小于10的时候前面加0
      if (date.getMinutes() < 10) {
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:0${date.getMinutes()}`;
      }
      return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
    }

  }
}
