// 后台服务脚本
// 主要用于管理扩展的状态和代理API请求

chrome.runtime.onInstalled.addListener(() => {
  console.log('抖音自动加关注扩展已安装');
});

// 代理获取网络时间（避免CORS问题）
async function proxyGetNetworkTime() {
  const TIME_APIS = [
    'https://api.uuni.cn/api/time',
    'http://vv.video.qq.com/checktime?otype=json'
  ];
  
  for (const api of TIME_APIS) {
    try {
      const response = await fetch(api);
      
      if (!response.ok) {
        console.warn(`API ${api} 返回错误: ${response.status}`);
        continue;
      }
      
      let data;
      
      if (api.includes('qq.com')) {
        const text = await response.text();
        const jsonMatch = text.match(/QZOutputJson=({.+})/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[1]);
          if (data.t) {
            return data.t;
          }
        }
      } else {
        data = await response.json();
        if (data.timestamp) {
          return data.timestamp;
        }
      }
    } catch (error) {
      console.warn(`API ${api} 请求失败:`, error.message);
      continue;
    }
  }
  
  // 如果所有API都失败，返回本地时间
  return Math.floor(Date.now() / 1000);
}

// 监听来自content script和popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getNetworkTime') {
    // 代理获取网络时间
    proxyGetNetworkTime().then(time => {
      sendResponse({ success: true, time });
    }).catch(error => {
      sendResponse({ success: false, error: error.message, time: Math.floor(Date.now() / 1000) });
    });
    return true; // 保持消息通道开放
  }
  return true;
});
