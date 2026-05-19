const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // ---------- 上传分数（保留最高分） ----------
  if (action === 'submit') {
    const { nickName, avatarUrl, score } = event
    try {
      // 查询该用户是否已有分数记录
      const existRes = await db.collection('scores')
        .where({ _openid: openid })
        .get()

      if (existRes.data.length === 0) {
        // 无记录，直接新增
        await db.collection('scores').add({
          data: {
            _openid:openid,
            openid,
            nickName: nickName || '匿名用户',
            avatarUrl: avatarUrl || '',
            score,
            createTime: db.serverDate()
          }
        })
        return { success: true, msg: 'new', score }
      } else {
        // 已有记录，若当前分数更高则更新
        const oldRecord = existRes.data[0]
        if (score > oldRecord.score) {
          await db.collection('scores')
            .doc(oldRecord._id)
            .update({
              data: {
                
                score,
                nickName: nickName || oldRecord.nickName,
                avatarUrl: avatarUrl || oldRecord.avatarUrl,
                updateTime: db.serverDate()
              }
            })
          return { success: true, msg: 'updated', score }
        } else {
          // 分数未超过历史最高，不更新
          return { success: true, msg: 'keep', score: oldRecord.score }
        }
      }
    } catch (e) {
      return { success: false, error: e }
    }
  }

  // ---------- 获取排行榜（前20名） ----------
  else if (action === 'getRank') {
    try {
      const res = await db.collection('scores')
        .orderBy('score', 'desc')
        .limit(20)
        .get()
      // 给每条记录的 nickName 添加兜底，避免空白
      const rankList = res.data.map(item => ({
        ...item,
        nickName: item.nickName || '匿名用户'
      }))
      return { success: true, rankList }
    } catch (e) {
      return { success: false, error: e }
    }
  }

  // ---------- 获取当前用户排名 ----------
  else if (action === 'getMyRank') {
    try {
      // 查找当前用户的记录
      const myRes = await db.collection('scores')
        .where({ _openid : openid })
        .get()

      if (myRes.data.length === 0) {
        // 未答过题，没有排名
        return { success: true, score: 0, rank: null }
      }

      const myScore = myRes.data[0].score
      // 计算比自己分数高的人数（严格大于，实现同分排名不并列）
      const higherCountRes = await db.collection('scores')
        .where({ score: _.gt(myScore) })
        .count()

      const rank = higherCountRes.total + 1
      return {
        success: true,
        score: myScore,
        rank
        
      }
    } catch (e) {
      return { success: false, error: e }
    }
  }

  return { success: false, msg: 'unknown action' }
}