// 密钥过期时间（Unix时间戳）
const KEY_EXPIRY_TIMESTAMP = 1768302100; // 示例时间，需要根据实际情况修改

// 时间API列表（备用）
const TIME_APIS = [
  'https://api.uuni.cn/api/time',
  'http://vv.video.qq.com/checktime?otype=json'
];

// 获取当前网络时间
async function getNetworkTime() {
  for (const api of TIME_APIS) {
    try {
      const response = await fetch(api);
      let data;
      
      if (api.includes('qq.com')) {
        // QQ API返回格式：QZOutputJson={"s":"o","t":1768302101,...}
        const text = await response.text();
        const jsonMatch = text.match(/QZOutputJson=({.+})/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[1]);
          return data.t; // 返回时间戳
        }
      } else {
        // uuni API返回格式：{"date":"2026-01-13 19:01:40","timestamp":1768302100,...}
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
async function checkKeyExpiry() {
  try {
    const currentTime = await getNetworkTime();
    const expiryTime = parseInt(document.getElementById('keyExpiry').value) || KEY_EXPIRY_TIMESTAMP;
    
    const statusDiv = document.getElementById('expiryStatus');
    if (currentTime >= expiryTime) {
      statusDiv.textContent = `❌ 密钥已过期 (当前: ${currentTime}, 过期: ${expiryTime})`;
      statusDiv.className = 'status error';
      return false;
    } else {
      const remaining = expiryTime - currentTime;
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      statusDiv.textContent = `✅ 密钥有效 (剩余: ${days}天${hours}小时)`;
      statusDiv.className = 'status success';
      return true;
    }
  } catch (error) {
    const statusDiv = document.getElementById('expiryStatus');
    statusDiv.textContent = `❌ 无法检查过期时间: ${error.message}`;
    statusDiv.className = 'status error';
    return false;
  }
}

// 加载已关注列表
async function loadFollowedList() {
  const result = await chrome.storage.local.get(['followedUsers']);
  const followedUsers = result.followedUsers || [];
  const listDiv = document.getElementById('followedList');
  
  if (followedUsers.length === 0) {
    listDiv.innerHTML = '<div class="followed-item">暂无已关注用户</div>';
  } else {
    listDiv.innerHTML = followedUsers.map(url => 
      `<div class="followed-item">${url}</div>`
    ).join('');
  }
}

  // 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 加载配置
  const result = await chrome.storage.local.get(['interval', 'userList', 'keyExpiry', 'skipKeyCheck']);
  if (result.interval) {
    document.getElementById('interval').value = result.interval;
  }
  if (result.userList) {
    document.getElementById('userList').value = result.userList;
  }
  if (result.keyExpiry) {
    document.getElementById('keyExpiry').value = result.keyExpiry;
  } else {
    document.getElementById('keyExpiry').value = KEY_EXPIRY_TIMESTAMP;
  }
  if (result.skipKeyCheck !== undefined) {
    document.getElementById('skipKeyCheck').checked = result.skipKeyCheck;
  }
  
  // 加载已关注列表
  await loadFollowedList();
  
  // 检查过期时间按钮
  document.getElementById('checkExpiry').addEventListener('click', checkKeyExpiry);
  
  // 开始关注按钮
  document.getElementById('startBtn').addEventListener('click', async () => {
    const interval = parseInt(document.getElementById('interval').value);
    const userList = document.getElementById('userList').value.trim();
    const keyExpiry = parseInt(document.getElementById('keyExpiry').value);
    const skipKeyCheck = document.getElementById('skipKeyCheck').checked;
    
    if (!userList) {
      updateStatus('请输入关注名单', 'error');
      return;
    }
    
    if (!interval || interval < 1) {
      updateStatus('请输入有效的间隔时间', 'error');
      return;
    }
    
    // 检查密钥是否过期（如果未启用跳过检查）
    if (!skipKeyCheck) {
      const isValid = await checkKeyExpiry();
      if (!isValid) {
        updateStatus('密钥已过期，无法继续。如需继续，请勾选"跳过密钥检查"', 'error');
        return;
      }
    } else {
      updateStatus('⚠️ 已跳过密钥检查，正在启动...', 'info');
    }
    
    // 保存配置
    await chrome.storage.local.set({
      interval,
      userList,
      keyExpiry,
      skipKeyCheck
    });
    
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || !tab.url.includes('douyin.com')) {
      updateStatus('请在抖音页面使用此功能', 'error');
      return;
    }
    
    // 发送开始关注消息
    chrome.tabs.sendMessage(tab.id, {
      action: 'startFollow',
      interval,
      userList: userList.split('\n').filter(url => url.trim()),
      keyExpiry,
      skipKeyCheck
    });
    
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    updateStatus('开始关注...', 'info');
  });
  
  // 停止关注按钮
  document.getElementById('stopBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'stopFollow' });
    
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    updateStatus('已停止关注', 'info');
  });
  
  // 清空已关注记录按钮
  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (confirm('确定要清空已关注记录吗？')) {
      await chrome.storage.local.set({ followedUsers: [] });
      await loadFollowedList();
      updateStatus('已清空关注记录', 'success');
    }
  });
  
  // 监听来自content script的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateStatus') {
      updateStatus(message.text, message.type);
    }
    if (message.action === 'updateProgress') {
      updateProgress(message.text);
    }
    if (message.action === 'followComplete') {
      document.getElementById('startBtn').disabled = false;
      document.getElementById('stopBtn').disabled = true;
      loadFollowedList();
    }
  });
});

// 更新状态
function updateStatus(text, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = text;
  statusDiv.className = `status ${type}`;
}

// 更新进度
function updateProgress(text) {
  const progressDiv = document.getElementById('progress');
  progressDiv.textContent = text;
}
