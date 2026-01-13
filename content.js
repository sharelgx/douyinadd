// 内容脚本：在抖音页面上执行关注操作

let isFollowing = false;
let followQueue = [];
let currentIndex = 0;
let followInterval = null;
let followIntervalMs = 5000;

// 获取已关注用户列表
async function getFollowedUsers() {
  const result = await chrome.storage.local.get(['followedUsers']);
  return result.followedUsers || [];
}

// 添加已关注用户
async function addFollowedUser(url) {
  const followedUsers = await getFollowedUsers();
  if (!followedUsers.includes(url)) {
    followedUsers.push(url);
    await chrome.storage.local.set({ followedUsers });
  }
}

// 检查用户是否已关注
async function isUserFollowed(url) {
  const followedUsers = await getFollowedUsers();
  return followedUsers.includes(url);
}

// 获取网络时间
async function getNetworkTime() {
  const TIME_APIS = [
    'https://api.uuni.cn/api/time',
    'http://vv.video.qq.com/checktime?otype=json'
  ];
  
  for (const api of TIME_APIS) {
    try {
      const response = await fetch(api);
      let data;
      
      if (api.includes('qq.com')) {
        const text = await response.text();
        const jsonMatch = text.match(/QZOutputJson=({.+})/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[1]);
          return data.t;
        }
      } else {
        data = await response.json();
        return data.timestamp;
      }
    } catch (error) {
      console.error(`API ${api} 失败:`, error);
      continue;
    }
  }
  throw new Error('所有时间API都不可用');
}

// 检查密钥是否过期
async function checkKeyExpiry(keyExpiry) {
  try {
    const currentTime = await getNetworkTime();
    return currentTime < keyExpiry;
  } catch (error) {
    console.error('检查密钥过期失败:', error);
    return false;
  }
}

// 导航到用户页面
async function navigateToUser(url) {
  const currentUrl = window.location.href.split('?')[0]; // 移除查询参数
  const targetUrl = url.split('?')[0];
  
  if (currentUrl !== targetUrl) {
    window.location.href = url;
    // 等待页面加载
    await new Promise(resolve => {
      let checkCount = 0;
      const maxChecks = 100; // 最多等待10秒
      const checkLoad = setInterval(() => {
        checkCount++;
        if (document.readyState === 'complete' || checkCount >= maxChecks) {
          clearInterval(checkLoad);
          // 额外等待一下确保页面完全加载，特别是动态内容
          setTimeout(resolve, 3000);
        }
      }, 100);
    });
  } else {
    // 如果已经在目标页面，等待一下确保内容加载完成
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// 查找并点击关注按钮
async function clickFollowButton() {
  // 等待页面加载完成
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 方法1: 通过aria-label或name属性查找
  let followButton = null;
  
  // 查找所有按钮
  const buttons = Array.from(document.querySelectorAll('button'));
  
  // 优先查找包含"关注"文本且不包含"已关注"或"取消关注"的按钮
  for (const button of buttons) {
    const text = (button.textContent || button.innerText || '').trim();
    const ariaLabel = (button.getAttribute('aria-label') || button.getAttribute('name') || '').trim();
    
    // 检查文本内容
    if ((text === '关注' || ariaLabel === '关注') && 
        !text.includes('已关注') && 
        !text.includes('取消关注') &&
        !ariaLabel.includes('已关注') &&
        !ariaLabel.includes('取消关注')) {
      // 检查按钮是否可见且可点击
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      
      if (rect.width > 0 && 
          rect.height > 0 && 
          style.display !== 'none' && 
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          !button.disabled) {
        followButton = button;
        break;
      }
    }
  }
  
  // 方法2: 如果没找到，尝试通过类名或属性查找
  if (!followButton) {
    const possibleSelectors = [
      'button[class*="follow"]',
      'button[class*="Follow"]',
      'div[class*="follow"] button',
      'div[class*="Follow"] button',
    ];
    
    for (const selector of possibleSelectors) {
      const possibleButtons = document.querySelectorAll(selector);
      for (const btn of possibleButtons) {
        const text = (btn.textContent || btn.innerText || '').trim();
        if (text.includes('关注') && 
            !text.includes('已关注') && 
            !text.includes('取消关注')) {
          const rect = btn.getBoundingClientRect();
          const style = window.getComputedStyle(btn);
          
          if (rect.width > 0 && 
              rect.height > 0 && 
              style.display !== 'none' && 
              style.visibility !== 'hidden') {
            followButton = btn;
            break;
          }
        }
      }
      if (followButton) break;
    }
  }
  
  if (followButton) {
    // 滚动到按钮位置
    followButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // 尝试多种点击方式
    try {
      // 方式1: 直接点击
      followButton.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 方式2: 如果直接点击无效，尝试触发事件
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      followButton.dispatchEvent(clickEvent);
      
      return true;
    } catch (error) {
      console.error('点击关注按钮失败:', error);
      return false;
    }
  }
  
  return false;
}

// 处理单个用户关注
async function followUser(url, keyExpiry, skipKeyCheck = false) {
  try {
    // 检查密钥是否过期（如果未启用跳过检查）
    if (!skipKeyCheck) {
      const isValid = await checkKeyExpiry(keyExpiry);
      if (!isValid) {
        sendMessage('updateStatus', '密钥已过期，停止关注', 'error');
        stopFollow();
        return false;
      }
    }
    
    // 检查是否已关注
    const alreadyFollowed = await isUserFollowed(url);
    if (alreadyFollowed) {
      sendMessage('updateProgress', `跳过已关注: ${url}`);
      return true;
    }
    
    // 导航到用户页面
    sendMessage('updateProgress', `正在访问: ${url}`);
    await navigateToUser(url);
    
    // 点击关注按钮
    const clicked = await clickFollowButton();
    if (clicked) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await addFollowedUser(url);
      sendMessage('updateProgress', `✓ 已关注: ${url}`);
      return true;
    } else {
      sendMessage('updateProgress', `✗ 未找到关注按钮: ${url}`);
      return false;
    }
  } catch (error) {
    console.error('关注用户失败:', error);
    sendMessage('updateProgress', `✗ 关注失败: ${url} - ${error.message}`);
    return false;
  }
}

// 开始关注流程
async function startFollow(userList, interval, keyExpiry, skipKeyCheck = false) {
  if (isFollowing) {
    return;
  }
  
  isFollowing = true;
  followQueue = userList.map(url => url.trim()).filter(url => url);
  currentIndex = 0;
  followIntervalMs = interval * 1000;
  
  sendMessage('updateStatus', `开始关注，共 ${followQueue.length} 个用户`, 'info');
  
  // 过滤掉已关注的用户
  const followedUsers = await getFollowedUsers();
  followQueue = followQueue.filter(url => !followedUsers.includes(url));
  
  if (followQueue.length === 0) {
    sendMessage('updateStatus', '所有用户都已关注', 'success');
    isFollowing = false;
    sendMessage('followComplete');
    return;
  }
  
  sendMessage('updateStatus', `剩余 ${followQueue.length} 个用户需要关注`, 'info');
  
  // 开始关注循环
  const followNext = async () => {
    if (!isFollowing || currentIndex >= followQueue.length) {
      stopFollow();
      sendMessage('updateStatus', '关注完成', 'success');
      sendMessage('followComplete');
      return;
    }
    
    const url = followQueue[currentIndex];
    await followUser(url, keyExpiry, skipKeyCheck);
    currentIndex++;
    
    if (isFollowing && currentIndex < followQueue.length) {
      followInterval = setTimeout(followNext, followIntervalMs);
    } else {
      stopFollow();
      sendMessage('updateStatus', '关注完成', 'success');
      sendMessage('followComplete');
    }
  };
  
  // 立即开始第一个
  followNext();
}

// 停止关注
function stopFollow() {
  isFollowing = false;
  if (followInterval) {
    clearTimeout(followInterval);
    followInterval = null;
  }
  sendMessage('updateStatus', '已停止关注', 'info');
}

// 发送消息到popup
function sendMessage(action, text, type) {
  chrome.runtime.sendMessage({
    action,
    text,
    type
  }).catch(() => {
    // popup可能已关闭，忽略错误
  });
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startFollow') {
    startFollow(message.userList, message.interval, message.keyExpiry, message.skipKeyCheck || false);
    sendResponse({ success: true });
  } else if (message.action === 'stopFollow') {
    stopFollow();
    sendResponse({ success: true });
  }
  return true;
});

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('抖音自动关注脚本已加载');
  });
} else {
  console.log('抖音自动关注脚本已加载');
}
