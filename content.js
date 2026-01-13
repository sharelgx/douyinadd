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

// 保存执行状态
async function saveFollowState() {
  await chrome.storage.local.set({
    isFollowing: isFollowing,
    followQueue: followQueue,
    currentIndex: currentIndex,
    followIntervalMs: followIntervalMs
  });
}

// 恢复执行状态
async function restoreFollowState() {
  const result = await chrome.storage.local.get(['isFollowing', 'followQueue', 'currentIndex', 'followIntervalMs', 'keyExpiry', 'skipKeyCheck', 'interval']);
  if (result.isFollowing && result.followQueue && result.followQueue.length > 0) {
    logger.info('检测到未完成的关注任务，正在恢复...');
    isFollowing = result.isFollowing;
    followQueue = result.followQueue;
    currentIndex = result.currentIndex || 0;
    followIntervalMs = result.followIntervalMs || 5000;
    
    // 继续执行
    if (isFollowing && currentIndex < followQueue.length) {
      const url = followQueue[currentIndex];
      const currentUrl = window.location.href.split('?')[0];
      const targetUrl = url.split('?')[0];
      
      logger.info(`恢复执行，当前页面: ${currentUrl}`);
      logger.info(`目标页面: ${targetUrl}`);
      
      // 如果当前页面就是目标页面，说明导航已完成，继续处理
      if (currentUrl === targetUrl) {
        logger.info('已在目标页面，继续处理关注操作...');
        setTimeout(async () => {
          await processCurrentUser(url, result.keyExpiry, result.skipKeyCheck || false, currentIndex, followQueue.length, result.interval || 5);
        }, 3000);
      } else {
        // 如果不在目标页面，说明导航可能失败或还未完成，等待一下再检查
        logger.warning('当前页面与目标页面不匹配，等待页面加载...');
        setTimeout(async () => {
          const newUrl = window.location.href.split('?')[0];
          if (newUrl === targetUrl) {
            logger.info('页面已加载到目标页面，继续处理...');
            await processCurrentUser(url, result.keyExpiry, result.skipKeyCheck || false, currentIndex, followQueue.length, result.interval || 5);
          } else {
            logger.error('页面导航失败，重新导航...');
            await navigateToUser(url);
          }
        }, 2000);
      }
    }
  }
}

// 处理当前用户（在页面加载完成后）
async function processCurrentUser(url, keyExpiry, skipKeyCheck, index, total, interval) {
  // 从存储中恢复统计信息
  const statsResult = await chrome.storage.local.get(['successCount', 'failCount']);
  let successCount = statsResult.successCount || 0;
  let failCount = statsResult.failCount || 0;
  
  const result = await followUser(url, keyExpiry, skipKeyCheck, index, total);
  
  if (result) {
    successCount++;
  } else {
    failCount++;
  }
  
  // 保存统计信息
  await chrome.storage.local.set({ successCount, failCount });
  
  currentIndex++;
  await saveFollowState();
  
  // 继续下一个
  if (isFollowing && currentIndex < followQueue.length) {
    const nextUrl = followQueue[currentIndex];
    logger.info(`等待 ${interval} 秒后处理下一个用户...`);
    followInterval = setTimeout(async () => {
      await navigateToUser(nextUrl);
    }, followIntervalMs);
  } else {
    logger.info('========== 关注流程完成 ==========');
    logger.info(`成功: ${successCount} 个`);
    logger.info(`失败: ${failCount} 个`);
    await chrome.storage.local.remove(['successCount', 'failCount']);
    stopFollow();
    await chrome.storage.local.remove(['isFollowing', 'followQueue', 'currentIndex', 'followIntervalMs']);
    sendMessage('updateStatus', `关注完成 (成功: ${successCount}, 失败: ${failCount})`, 'success');
    sendMessage('followComplete');
  }
}

// 导航到用户页面
async function navigateToUser(url) {
  // 保存状态
  await saveFollowState();
  logger.info(`导航到新页面: ${url}`);
  window.location.href = url;
  // 注意：页面导航后，脚本会重新加载，状态会通过restoreFollowState恢复
  // 这里不等待，让页面自然加载
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
async function followUser(url, keyExpiry, skipKeyCheck = false, index = 0, total = 0) {
  try {
    logger.info(`[${index + 1}/${total}] 开始处理用户: ${url}`);
    
    // 检查密钥是否过期（如果未启用跳过检查）
    if (!skipKeyCheck) {
      logger.info('检查密钥是否过期...');
      const isValid = await checkKeyExpiry(keyExpiry);
      if (!isValid) {
        logger.error('密钥已过期，停止关注');
        sendMessage('updateStatus', '密钥已过期，停止关注', 'error');
        stopFollow();
        return false;
      }
      logger.success('密钥检查通过');
    } else {
      logger.warning('已跳过密钥检查');
    }
    
    // 检查是否已关注
    logger.info('检查用户是否已关注...');
    const alreadyFollowed = await isUserFollowed(url);
    if (alreadyFollowed) {
      logger.warning(`用户已关注，跳过: ${url}`);
      sendMessage('updateProgress', `[${index + 1}/${total}] 跳过已关注: ${url}`);
      return true;
    }
    
    // 检查当前页面是否是目标页面
    const currentUrl = window.location.href.split('?')[0];
    const targetUrl = url.split('?')[0];
    
    if (currentUrl !== targetUrl) {
      // 导航到用户页面
      logger.info(`正在导航到用户页面: ${url}`);
      sendMessage('updateProgress', `[${index + 1}/${total}] 正在访问: ${url}`);
      await navigateToUser(url);
      // 注意：导航后脚本会重新加载，状态会通过restoreFollowState恢复
      // 这里返回false，让恢复逻辑继续处理
      return false;
    }
    
    logger.info('已在目标页面，等待内容加载...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 点击关注按钮
    logger.info('查找并点击关注按钮...');
    const clicked = await clickFollowButton();
    if (clicked) {
      logger.success('关注按钮点击成功');
      await new Promise(resolve => setTimeout(resolve, 2000)); // 等待关注操作完成
      
      // 验证是否关注成功（检查按钮文本是否变为"已关注"）
      const buttons = Array.from(document.querySelectorAll('button'));
      let isFollowed = false;
      for (const btn of buttons) {
        const text = (btn.textContent || btn.innerText || '').trim();
        if (text.includes('已关注') || text.includes('取消关注')) {
          isFollowed = true;
          break;
        }
      }
      
      if (isFollowed) {
        await addFollowedUser(url);
        logger.success(`✓ 成功关注用户: ${url}`);
        sendMessage('updateProgress', `[${index + 1}/${total}] ✓ 已关注: ${url}`);
        return true;
      } else {
        logger.warning('关注按钮已点击，但状态未更新，可能关注失败');
        sendMessage('updateProgress', `[${index + 1}/${total}] ⚠ 关注状态未确认: ${url}`);
        return false;
      }
    } else {
      logger.error(`未找到关注按钮: ${url}`);
      sendMessage('updateProgress', `[${index + 1}/${total}] ✗ 未找到关注按钮: ${url}`);
      return false;
    }
  } catch (error) {
    logger.error(`关注用户失败: ${url} - ${error.message}`);
    console.error('关注用户失败:', error);
    sendMessage('updateProgress', `[${index + 1}/${total}] ✗ 关注失败: ${url} - ${error.message}`);
    return false;
  }
}

// 开始关注流程
async function startFollow(userList, interval, keyExpiry, skipKeyCheck = false) {
  if (isFollowing) {
    logger.warning('关注流程已在运行中');
    return;
  }
  
  logger.info('========== 开始关注流程 ==========');
  logger.info(`关注间隔: ${interval}秒`);
  logger.info(`跳过密钥检查: ${skipKeyCheck ? '是' : '否'}`);
  
  isFollowing = true;
  followQueue = userList.map(url => url.trim()).filter(url => url);
  currentIndex = 0;
  followIntervalMs = interval * 1000;
  
  // 保存配置和状态
  await chrome.storage.local.set({
    keyExpiry,
    skipKeyCheck,
    interval
  });
  await saveFollowState();
  
  const totalUsers = followQueue.length;
  logger.info(`总共 ${totalUsers} 个用户需要处理`);
  sendMessage('updateStatus', `开始关注，共 ${totalUsers} 个用户`, 'info');
  
  // 过滤掉已关注的用户
  logger.info('检查已关注用户列表...');
  const followedUsers = await getFollowedUsers();
  const beforeFilter = followQueue.length;
  followQueue = followQueue.filter(url => !followedUsers.includes(url));
  const skippedCount = beforeFilter - followQueue.length;
  
  if (skippedCount > 0) {
    logger.info(`已跳过 ${skippedCount} 个已关注的用户`);
  }
  
  if (followQueue.length === 0) {
    logger.success('所有用户都已关注，无需处理');
    sendMessage('updateStatus', '所有用户都已关注', 'success');
    isFollowing = false;
    sendMessage('followComplete');
    return;
  }
  
  logger.info(`剩余 ${followQueue.length} 个用户需要关注`);
  sendMessage('updateStatus', `剩余 ${followQueue.length} 个用户需要关注`, 'info');
  
  // 从存储中恢复统计信息，或初始化
  const statsResult = await chrome.storage.local.get(['successCount', 'failCount']);
  let successCount = statsResult.successCount || 0;
  let failCount = statsResult.failCount || 0;
  
  // 开始关注循环
  const followNext = async () => {
    if (!isFollowing) {
      logger.warning('关注流程已被停止');
      await chrome.storage.local.remove(['successCount', 'failCount']);
      stopFollow();
      sendMessage('updateStatus', `已停止关注 (成功: ${successCount}, 失败: ${failCount})`, 'info');
      sendMessage('followComplete');
      return;
    }
    
    if (currentIndex >= followQueue.length) {
      logger.info('========== 关注流程完成 ==========');
      logger.info(`成功: ${successCount} 个`);
      logger.info(`失败: ${failCount} 个`);
      await chrome.storage.local.remove(['successCount', 'failCount']);
      stopFollow();
      sendMessage('updateStatus', `关注完成 (成功: ${successCount}, 失败: ${failCount})`, 'success');
      sendMessage('followComplete');
      return;
    }
    
    const url = followQueue[currentIndex];
    logger.info(`\n--- 处理第 ${currentIndex + 1}/${followQueue.length} 个用户 ---`);
    
    // 检查当前页面，如果需要导航则导航
    const currentUrl = window.location.href.split('?')[0];
    const targetUrl = url.split('?')[0];
    
    if (currentUrl !== targetUrl) {
      logger.info(`需要导航到: ${url}`);
      await navigateToUser(url);
      // 导航后脚本会重新加载，状态会恢复
      return;
    }
    
    // 已在目标页面，处理关注
    const result = await followUser(url, keyExpiry, skipKeyCheck, currentIndex, followQueue.length);
    
    if (result) {
      successCount++;
    } else {
      failCount++;
    }
    
    // 保存统计信息
    await chrome.storage.local.set({ successCount, failCount });
    
    currentIndex++;
    await saveFollowState(); // 保存进度
    
    if (isFollowing && currentIndex < followQueue.length) {
      logger.info(`等待 ${interval} 秒后处理下一个用户...`);
      followInterval = setTimeout(followNext, followIntervalMs);
    } else {
      logger.info('========== 关注流程完成 ==========');
      logger.info(`成功: ${successCount} 个`);
      logger.info(`失败: ${failCount} 个`);
      await chrome.storage.local.remove(['successCount', 'failCount']);
      stopFollow();
      await chrome.storage.local.remove(['isFollowing', 'followQueue', 'currentIndex', 'followIntervalMs']);
      sendMessage('updateStatus', `关注完成 (成功: ${successCount}, 失败: ${failCount})`, 'success');
      sendMessage('followComplete');
    }
  };
  
  // 立即开始第一个
  logger.info('开始处理第一个用户...');
  followNext();
}

// 停止关注
async function stopFollow() {
  logger.warning('停止关注流程');
  isFollowing = false;
  if (followInterval) {
    clearTimeout(followInterval);
    followInterval = null;
  }
  await chrome.storage.local.remove(['isFollowing', 'followQueue', 'currentIndex', 'followIntervalMs']);
  sendMessage('updateStatus', '已停止关注', 'info');
}

// 日志系统
const logger = {
  log: function(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    sendMessage('addLog', logMessage, type);
  },
  
  info: function(message) {
    this.log(message, 'info');
  },
  
  success: function(message) {
    this.log(message, 'success');
  },
  
  error: function(message) {
    this.log(message, 'error');
  },
  
  warning: function(message) {
    this.log(message, 'warning');
  }
};

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
  document.addEventListener('DOMContentLoaded', async () => {
    logger.info('抖音自动关注脚本已加载');
    // 尝试恢复未完成的任务
    await restoreFollowState();
  });
} else {
  logger.info('抖音自动关注脚本已加载');
  // 尝试恢复未完成的任务
  restoreFollowState();
}
