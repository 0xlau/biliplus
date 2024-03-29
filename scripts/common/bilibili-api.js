class _BILIAPI {
  static BILIBILI_API = 'https://api.bilibili.com';

  /**
   * 获取B站视频 aid、cid 等信息
   * @param {string} 视频 bvid
   * @returns 视频data
   */
  /* 返回视频data例子
    {
      "bvid": "BV11q4y1J7UA",
      "aid": 545479594,
      "videos": 1,
      "tid": 233,
      "tname": "极客DIY",
      "copyright": 1,
      "pic": "http://i2.hdslb.com/bfs/archive/8d47ef473318b6e87a87b9f3051971694d6dc0b8.jpg",
      "title": "基于stm32的蓝牙骑行辅助导航《CycleGuider》",
      "pubdate": 1620409656,
      "ctime": 1620409656,
      "desc": "大四狗的毕业设计，简单开发了一个安卓APP，然后跟蓝牙模块通讯起来，实现基于HC-42蓝牙模块的骑行辅助导航设备。",
      "desc_v2": [
          {
              "raw_text": "大四狗的毕业设计，简单开发了一个安卓APP，然后跟蓝牙模块通讯起来，实现基于HC-42蓝牙模块的骑行辅助导航设备。",
              "type": 1,
              "biz_id": 0
          }
      ],
      "state": 0,
      "duration": 193,
      "rights": {
          "bp": 0,
          "elec": 0,
          "download": 1,
          "movie": 0,
          "pay": 0,
          "hd5": 1,
          "no_reprint": 1,
          "autoplay": 1,
          "ugc_pay": 0,
          "is_cooperation": 0,
          "ugc_pay_preview": 0,
          "no_background": 0,
          "clean_mode": 0,
          "is_stein_gate": 0,
          "is_360": 0,
          "no_share": 0,
          "arc_pay": 0,
          "free_watch": 0
      },
      "owner": {
          "mid": 393341686,
          "name": "码农小易",
          "face": "https://i1.hdslb.com/bfs/face/55a68b0f165d87845886c3bd241e808a8fa37973.jpg"
      },
      "stat": {
          "aid": 545479594,
          "view": 1634,
          "danmaku": 0,
          "reply": 14,
          "favorite": 25,
          "coin": 16,
          "share": 13,
          "now_rank": 0,
          "his_rank": 0,
          "like": 56,
          "dislike": 0,
          "evaluation": "",
          "vt": 0
      },
      "argue_info": {
          "argue_msg": "",
          "argue_type": 0,
          "argue_link": ""
      },
      "dynamic": "(づ￣ 3￣)づ，明天要答辩了！发上来备用。",
      "cid": 335317956,
      "dimension": {
          "width": 1920,
          "height": 1080,
          "rotate": 0
      },
      "premiere": null,
      "teenage_mode": 0,
      "is_chargeable_season": false,
      "is_story": false,
      "is_upower_exclusive": false,
      "is_upower_play": false,
      "is_upower_preview": false,
      "enable_vt": 0,
      "vt_display": "",
      "no_cache": false,
      "pages": [
          {
              "cid": 335317956,
              "page": 1,
              "from": "vupload",
              "part": "演示视频",
              "duration": 193,
              "vid": "",
              "weblink": "",
              "dimension": {
                  "width": 1920,
                  "height": 1080,
                  "rotate": 0
              }
          }
      ],
      "subtitle": {
          "allow_submit": false,
          "list": []
      },
      "is_season_display": false,
      "user_garb": {
          "url_image_ani_cut": ""
      },
      "honor_reply": {},
      "like_icon": "",
      "need_jump_bv": false,
      "disable_show_up_info": false,
      "is_story_play": 1
    }
  */
  static async getVideoInfo(bvid) {
    const response = await fetch(`${_BILIAPI.BILIBILI_API}/x/web-interface/view?bvid=${bvid}`);
    const jsonData = await response.json();
    if (response.status !== 200 || !jsonData) {
      throw new Error();
    }
    return jsonData.data;
  }

  /**
   * 获取对应视频的在线观看人数数据
   * @param {*} aid
   * @param {*} cid
   * @param {*} bvid
   * @returns 观看人数data
   */
  /*
    {
        "total": "44",
        "count": "44",
        "show_switch": {
            "total": true,
            "count": true
        },
        "abtest": {
            "group": "b"
        }
    }
  */
  static async getOnlineTotal(aid, cid, bvid) {
    const response = await fetch(`${_BILIAPI.BILIBILI_API}/x/player/online/total?aid=${aid}&cid=${cid}&bvid=${bvid}`);
    const jsonData = await response.json();
    if (response.status !== 200 || !jsonData) {
      throw new Error();
    }
    return jsonData.data;
  }

  /**
   * 根据keyword获取用户信息
   * @param {string} keyword
   * @returns 用户data
   */
  /* 返回用户data例子
    {
      "type": "bili_user",
      "mid": 393341686,
      "uname": "码农小易",
      "usign": "INFP-A | Github @0xlau | Gitee @liupeiqiang",
      "fans": 31,
      "videos": 1,
      "upic": "//i1.hdslb.com/bfs/face/55a68b0f165d87845886c3bd241e808a8fa37973.jpg",
      "face_nft": 0,
      "face_nft_type": 0,
      "verify_info": "",
      "level": 6,
      "gender": 1,
      "is_upuser": 1,
      "is_live": 0,
      "room_id": 22684532,
      "res": [
          {
              "aid": 545479594,
              "bvid": "BV11q4y1J7UA",
              "title": "基于stm32的蓝牙骑行辅助导航《CycleGuider》",
              "pubdate": 1620409656,
              "arcurl": "http://www.bilibili.com/video/av545479594",
              "pic": "//i2.hdslb.com/bfs/archive/8d47ef473318b6e87a87b9f3051971694d6dc0b8.jpg",
              "play": "1636",
              "dm": 0,
              "coin": 16,
              "fav": 25,
              "desc": "大四狗的毕业设计，简单开发了一个安卓APP，然后跟蓝牙模块通讯起来，实现基于HC-42蓝牙模块的骑行辅助导航设备。",
              "duration": "3:13",
              "is_pay": 0,
              "is_union_video": 0,
              "is_charge_video": 0,
              "vt": 0,
              "enable_vt": 0,
              "vt_display": ""
          }
      ],
      "official_verify": {
          "type": 127,
          "desc": ""
      },
      "hit_columns": [],
      "is_senior_member": 0
    }
  */
  static async getUserInfoByKeyword(keyword) {
    const response = await fetch(`${_BILIAPI.BILIBILI_API}/x/web-interface/wbi/search/type?search_type=bili_user&keyword=${keyword}`);
    const jsonData = await response.json();
    if (response.status !== 200 || !jsonData) {
      throw new Error();
    }
    if (jsonData.data.result == undefined) {
      return null;
    }
    for (const userData of jsonData.data.result) {
      if (userData.uname == keyword || String(userData.mid) == keyword.replace(/^uid/, '')) {
        return userData;
      }
    }
    return null;
  }

  /**
   * 获取导航栏用户信息
   * @returns 用户信息data
   */
  /**
   * 数据示例
   * {
    "code": 0,
    "message": "0",
    "ttl": 1,
    "data": {
        "isLogin": true,
        "email_verified": 1,
        "face": "https://i0.hdslb.com/bfs/face/aebb2639a0d47f2ce1fec0631f412eaf53d4a0be.jpg",
        "face_nft": 0,
        "face_nft_type": 0,
        "level_info": {
            "current_level": 6,
            "current_min": 28800,
            "current_exp": 52689,
            "next_exp": "--"
        },
        "mid": 293793435,
        "mobile_verified": 1,
        "money": 172.4,
        "moral": 70,
        "official": {
            "role": 0,
            "title": "",
            "desc": "",
            "type": -1
        },
        "officialVerify": {
            "type": -1,
            "desc": ""
        },
        "pendant": {
            "pid": 2511,
            "name": "初音未来13周年",
            "image": "https://i0.hdslb.com/bfs/garb/item/4f8f3f1f2d47f0dad84f66aa57acd4409ea46361.png",
            "expire": 0,
            "image_enhance": "https://i0.hdslb.com/bfs/garb/item/fe0b83b53e2342b16646f6e7a9370d8a867decdb.webp",
            "image_enhance_frame": "https://i0.hdslb.com/bfs/garb/item/127c507ec8448be30cf5f79500ecc6ef2fd32f2c.png"
        },
        "scores": 0,
        "uname": "社会易姐QwQ",
        "vipDueDate": 1707494400000,
        "vipStatus": 1,
        "vipType": 2,
        "vip_pay_type": 0,
        "vip_theme_type": 0,
        "vip_label": {
            "path": "",
            "text": "年度大会员",
            "label_theme": "annual_vip",
            "text_color": "#FFFFFF",
            "bg_style": 1,
            "bg_color": "#FB7299",
            "border_color": "",
            "use_img_label": true,
            "img_label_uri_hans": "",
            "img_label_uri_hant": "",
            "img_label_uri_hans_static": "https://i0.hdslb.com/bfs/vip/8d4f8bfc713826a5412a0a27eaaac4d6b9ede1d9.png",
            "img_label_uri_hant_static": "https://i0.hdslb.com/bfs/activity-plat/static/20220614/e369244d0b14644f5e1a06431e22a4d5/VEW8fCC0hg.png"
        },
        "vip_avatar_subscript": 1,
        "vip_nickname_color": "#FB7299",
        "vip": {
            "type": 2,
            "status": 1,
            "due_date": 1707494400000,
            "vip_pay_type": 0,
            "theme_type": 0,
            "label": {
                "path": "",
                "text": "年度大会员",
                "label_theme": "annual_vip",
                "text_color": "#FFFFFF",
                "bg_style": 1,
                "bg_color": "#FB7299",
                "border_color": "",
                "use_img_label": true,
                "img_label_uri_hans": "",
                "img_label_uri_hant": "",
                "img_label_uri_hans_static": "https://i0.hdslb.com/bfs/vip/8d4f8bfc713826a5412a0a27eaaac4d6b9ede1d9.png",
                "img_label_uri_hant_static": "https://i0.hdslb.com/bfs/activity-plat/static/20220614/e369244d0b14644f5e1a06431e22a4d5/VEW8fCC0hg.png"
            },
            "avatar_subscript": 1,
            "nickname_color": "#FB7299",
            "role": 3,
            "avatar_subscript_url": "",
            "tv_vip_status": 0,
            "tv_vip_pay_type": 0,
            "tv_due_date": 1640793600
        },
        "wallet": {
            "mid": 293793435,
            "bcoin_balance": 5,
            "coupon_balance": 5,
            "coupon_due_time": 0
        },
        "has_shop": true,
        "shop_url": "https://gf.bilibili.com?msource=main_station",
        "allowance_count": 0,
        "answer_status": 0,
        "is_senior_member": 1,
        "wbi_img": {
            "img_url": "https://i0.hdslb.com/bfs/wbi/653657f524a547ac981ded72ea172057.png",
            "sub_url": "https://i0.hdslb.com/bfs/wbi/6e4909c702f846728e64f6007736a338.png"
        },
        "is_jury": false
    }
}
   */
  static async getNavUserInfo() {
    const response = await fetch(`${_BILIAPI.BILIBILI_API}/x/web-interface/nav`);
    const jsonData = await response.json();
    if (response.status !== 200 || !jsonData) {
      throw new Error();
    }
    return jsonData.data;
  }

  /**
   * 获取ai简介
   * @param {object} params
   * @returns ai简介data
   */
  static async getAIConclusion(params) {
    const query = await _UTILS.getwts(params);
    const response = await fetch(`${_BILIAPI.BILIBILI_API}/x/web-interface/view/conclusion/get?${query}`);
    const jsonData = await response.json();
    if (response.status !== 200 || !jsonData) {
      throw new Error();
    }
    return jsonData.data;
  }
}
