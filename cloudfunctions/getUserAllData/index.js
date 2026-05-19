// cloudfunctions/getUserAllData/index.js
const cloud = require('wx-server-sdk')

// 初始化 cloud，env 若不填则默认操作当前环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV 
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 2. 并行执行三个查询，提高响应速度
    // 使用 Promise.all 可以让三个查询同时进行，而不是串行等待
    const [notesRes, forumRes, replyRes] = await Promise.all([
      // 查询 Notes
      db.collection('notes')
        .where({ _openid: openid }) // 系统自动匹配，无需前端传参
        .orderBy('createTime', 'desc')
        .get(),

      // 查询 Forum_post
      db.collection('forum_post')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .get(),

      // 查询 Forum_reply
      db.collection('forum_reply')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .get()
    ])

    // 3. 返回整合后的数据
    return {
      success: true,
      data: {
        notes: notesRes.data,
        forumPosts: forumRes.data,
        replies: replyRes.data
      }
    }

  } catch (err) {
    console.error(err)
    return {
      success: false,
      errMsg: err
    }
  }
}