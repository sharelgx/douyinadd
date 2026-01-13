// 后台服务脚本
// 主要用于管理扩展的状态

chrome.runtime.onInstalled.addListener(() => {
  console.log('抖音自动加关注扩展已安装');
});

// 监听来自content script和popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 这里可以添加后台处理逻辑
  return true;
});
