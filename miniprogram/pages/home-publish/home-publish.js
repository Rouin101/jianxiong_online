const db = wx.cloud.database()

Page({
  data: {
    title: '',
    content: '',
    tempFilePaths: [] 
  },


  onTitleInput: function(e) {
    this.setData({ title: e.detail.value })
  },

  
  onContentInput: function(e) {
    this.setData({ content: e.detail.value })
  },

  
  chooseImage: function() {
    // 使用箭头函数确保 this 指向正确
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        // 1. 提取新图片的路径
        const newFiles = res.tempFiles.map(file => file.tempFilePath)
        
        // 2. 合并旧图片和新图片
        const allFiles = this.data.tempFilePaths.concat(newFiles)
        
        // 3. 更新数据
        this.setData({
          tempFilePaths: allFiles
        })
        
        console.log('图片已添加，当前数量:', allFiles.length)
      },
      fail: (err) => {
        console.error('选择失败:', err)
      }
    })
  },

  
  deleteImage: function(e) {
    const index = e.currentTarget.dataset.index
    const files = this.data.tempFilePaths
    files.splice(index, 1)
    this.setData({ tempFilePaths: files })
  },

  
  goBack: function() {
    wx.navigateBack({ delta: 1 })
  },

  
  confirmPublish: async function() {
    const { title, content, tempFilePaths } = this.data

    // 1. 基础校验
    if (!title.trim()) {
      return wx.showToast({ title: '标题不能为空', icon: 'none' })
    }
    if (tempFilePaths.length === 0) {
      return wx.showToast({ title: '请至少添加一张图片', icon: 'none' })
    }

    wx.showLoading({ title: '安全检测中...', mask: true })

    try {
      // ==========================================
      // 2. 文本检测 (标题 + 内容)
      // ==========================================
      // 建议将标题和内容拼接在一起检测，或者分开检测
      const textRes = await wx.cloud.callFunction({
        name: 'msgCheck', // 使用你之前写好的云函数
        data: { text: title + content }
      })

      if (!textRes.result) {
        wx.hideLoading()
        return wx.showToast({ title: '标题或内容包含违规文字', icon: 'none' })
      }

      // ==========================================
      // 3. 图片检测 (修改版：转 base64 调用自己的云函数)
      // ==========================================
      if (tempFilePaths.length > 0) {
        for (let i = 0; i < tempFilePaths.length; i++) {
          const filePath = tempFilePaths[i]
          
          // 先把图片转成 base64
          const base64Data = await new Promise((resolve, reject) => {
            wx.getFileSystemManager().readFile({
              filePath: filePath,
              encoding: 'base64',
              success: (res) => resolve(res.data),
              fail: reject
            })
          })

          // 调用你自己的云函数
          const checkRes = await wx.cloud.callFunction({
            name: 'imgCheck', 
            data: { base64Data: base64Data }
          })

          // 如果返回 false，说明违规或检测出错
          if (!checkRes.result) {
            wx.hideLoading()
            return wx.showToast({ title: `第 ${i + 1} 张图片未通过检测`, icon: 'none' })
          }
        }
      }

      // ==========================================
      // 4. 全部检测通过，开始上传
      // ==========================================
      wx.showLoading({ title: '发布中...', mask: true }) // 更新loading文字

      // 批量上传
      const uploadTasks = tempFilePaths.map(path => {
        const fileName = Date.now() + '_' + Math.random() + '.jpg'
        return wx.cloud.uploadFile({
          cloudPath: `notes_images/${fileName}`,
          filePath: path
        }).then(res => res.fileID)
      })

      const fileIDs = await Promise.all(uploadTasks)
      
      // 保存到数据库
      this.saveToDatabase(fileIDs, title, content)

    } catch (err) {
      // 捕获其他未知错误
      wx.hideLoading()
      console.error('检测或发布失败', err)
      wx.showToast({ title: '含有违规内容', icon: 'none' })
    }
  },


  
  saveToDatabase: function(fileIDs, title, content) {
    // 调用云函数
    wx.cloud.callFunction({
      name: 'home_postData',
      data: {
        title: title,
        content: content,
        images: fileIDs
        // 注意：这里不需要再传 nickname, avatar, openid 了
        // 云函数会自动去 users 集合里抓取最新、最准确的信息
      }
    }).then(res => {
      wx.hideLoading()
      if (res.result.code === 0) {
        wx.showToast({ title: '发布成功', icon: 'success' })
        setTimeout(() => { wx.navigateBack({ delta: 1 }) }, 1500)
      } else {
        wx.showToast({ title: res.result.message || '发布失败', icon: 'none' })
      }
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '系统错误', icon: 'none' })
      console.error(err)
    })
  }


})