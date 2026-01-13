// 硬编码的密钥
const HARDCODED_KEY = '123';

// 密钥过期时间（三个月后，Unix时间戳）
// 三个月 = 90天 = 90 * 24 * 60 * 60 = 7776000秒
const THREE_MONTHS_SECONDS = 90 * 24 * 60 * 60;

// 将Unix时间戳转换为datetime-local格式的字符串
function timestampToDateTimeLocal(timestamp) {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 将datetime-local格式的字符串转换为Unix时间戳
function dateTimeLocalToTimestamp(dateTimeLocal) {
  if (!dateTimeLocal) return null;
  return Math.floor(new Date(dateTimeLocal).getTime() / 1000);
}

// 格式化时间显示
function formatDateTime(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

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

// 检查密钥并验证过期时间
async function checkKeyExpiry() {
  try {
    const inputKey = document.getElementById('newKey').value.trim();
    const statusDiv = document.getElementById('expiryStatus');
    const displayDiv = document.getElementById('expiryDisplay');
    
    // 验证密钥
    if (!inputKey) {
      statusDiv.textContent = `❌ 请输入密钥`;
      statusDiv.className = 'status error';
      displayDiv.textContent = '';
      return false;
    }
    
    if (inputKey !== HARDCODED_KEY) {
      statusDiv.textContent = `❌ 密钥错误`;
      statusDiv.className = 'status error';
      displayDiv.textContent = '';
      return false;
    }
    
    // 密钥正确，获取当前网络时间
    const currentTime = await getNetworkTime();
    
    // 从存储中获取密钥过期时间，如果没有则设置为三个月后
    const result = await chrome.storage.local.get(['keyExpiry']);
    let expiryTimestamp = result.keyExpiry;
    
    // 如果没有存储的过期时间，或者已过期，则设置为三个月后
    if (!expiryTimestamp || currentTime >= expiryTimestamp) {
      expiryTimestamp = currentTime + THREE_MONTHS_SECONDS;
      await chrome.storage.local.set({ keyExpiry: expiryTimestamp });
      // 更新显示
      document.getElementById('keyExpiry').value = timestampToDateTimeLocal(expiryTimestamp);
    }
    
    // 显示格式化时间
    displayDiv.textContent = `过期时间: ${formatDateTime(expiryTimestamp)}`;
    
    // 计算剩余时间
    if (currentTime >= expiryTimestamp) {
      statusDiv.textContent = `❌ 密钥已过期 (过期时间: ${formatDateTime(expiryTimestamp)})`;
      statusDiv.className = 'status error';
      return false;
    } else {
      const remaining = expiryTimestamp - currentTime;
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 86400 % 3600) / 60);
      statusDiv.textContent = `✅ 密钥有效 (剩余: ${days}天${hours}小时${minutes}分钟)`;
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
  const result = await chrome.storage.local.get(['interval', 'userList', 'keyExpiry']);
  if (result.interval) {
    document.getElementById('interval').value = result.interval;
  }
  if (result.userList) {
    document.getElementById('userList').value = result.userList;
  }
  
  // 如果有存储的密钥，自动填充
  if (result.key) {
    document.getElementById('newKey').value = result.key;
  }
  
  // 如果有存储的过期时间，显示过期时间
  if (result.keyExpiry) {
    const expiryTimestamp = typeof result.keyExpiry === 'number' ? result.keyExpiry : parseInt(result.keyExpiry);
    document.getElementById('keyExpiry').value = timestampToDateTimeLocal(expiryTimestamp);
    // 如果有密钥，显示过期时间
    if (result.key) {
      try {
        const currentTime = await getNetworkTime();
        if (currentTime < expiryTimestamp) {
          const remaining = expiryTimestamp - currentTime;
          const days = Math.floor(remaining / 86400);
          const hours = Math.floor((remaining % 86400) / 3600);
          const minutes = Math.floor((remaining % 86400 % 3600) / 60);
          document.getElementById('expiryDisplay').textContent = `过期时间: ${formatDateTime(expiryTimestamp)} (剩余: ${days}天${hours}小时${minutes}分钟)`;
          document.getElementById('expiryStatus').textContent = `✅ 密钥有效 (剩余: ${days}天${hours}小时${minutes}分钟)`;
          document.getElementById('expiryStatus').className = 'status success';
        } else {
          document.getElementById('expiryDisplay').textContent = `过期时间: ${formatDateTime(expiryTimestamp)}`;
          document.getElementById('expiryStatus').textContent = `❌ 密钥已过期`;
          document.getElementById('expiryStatus').className = 'status error';
        }
      } catch (e) {
        // 忽略网络时间获取错误
        document.getElementById('expiryDisplay').textContent = `过期时间: ${formatDateTime(expiryTimestamp)}`;
      }
    }
  }
  
  // 加载已关注列表
  await loadFollowedList();
  
  // 加载日志
  await logSystem.loadLogs();
  
  // 清空日志按钮
  document.getElementById('clearLogBtn').addEventListener('click', async () => {
    if (confirm('确定要清空所有日志吗？')) {
      await logSystem.clearLogs();
    }
  });
  
  // 检查密钥按钮
  document.getElementById('checkExpiry').addEventListener('click', async () => {
    try {
      // 显示加载状态
      const statusDiv = document.getElementById('expiryStatus');
      statusDiv.textContent = '正在检查密钥...';
      statusDiv.className = 'status info';
      
      const isValid = await checkKeyExpiry();
      if (isValid) {
        // 自动保存密钥
        const inputKey = document.getElementById('newKey').value.trim();
        await chrome.storage.local.set({ key: inputKey });
        logSystem.addLog('密钥验证成功，已自动保存', 'success');
        updateStatus('密钥验证成功，已自动保存', 'success');
      } else {
        logSystem.addLog('密钥验证失败', 'error');
      }
    } catch (error) {
      console.error('检查密钥失败:', error);
      const statusDiv = document.getElementById('expiryStatus');
      statusDiv.textContent = `❌ 检查失败: ${error.message}`;
      statusDiv.className = 'status error';
      logSystem.addLog(`检查密钥失败: ${error.message}`, 'error');
    }
  });
  
  // 密钥输入框变化时自动保存（延迟保存，避免频繁写入）
  let saveKeyTimeout = null;
  document.getElementById('newKey').addEventListener('input', () => {
    clearTimeout(saveKeyTimeout);
    saveKeyTimeout = setTimeout(async () => {
      const inputKey = document.getElementById('newKey').value.trim();
      if (inputKey) {
        await chrome.storage.local.set({ key: inputKey });
      }
    }, 1000); // 1秒后保存
  });
  
  // 开始关注按钮
  document.getElementById('startBtn').addEventListener('click', async () => {
    const interval = parseInt(document.getElementById('interval').value);
    const userList = document.getElementById('userList').value.trim();
    
    if (!userList) {
      updateStatus('请输入关注名单', 'error');
      return;
    }
    
    if (!interval || interval < 1) {
      updateStatus('请输入有效的间隔时间', 'error');
      return;
    }
    
    // 检查密钥是否正确
    const inputKey = document.getElementById('newKey').value.trim();
    if (!inputKey || inputKey !== HARDCODED_KEY) {
      updateStatus('密钥错误或未输入，无法继续', 'error');
      return;
    }
    
    // 检查密钥是否过期（会从存储中获取过期时间）
    const isValid = await checkKeyExpiry();
    if (!isValid) {
      updateStatus('密钥已过期，无法继续', 'error');
      return;
    }
    
    // 获取过期时间（从存储中）
    const result = await chrome.storage.local.get(['keyExpiry']);
    const keyExpiry = result.keyExpiry;
    
    if (!keyExpiry) {
      updateStatus('密钥过期时间未设置，请先检查密钥', 'error');
      return;
    }
    
    // 保存配置
    await chrome.storage.local.set({
      interval,
      userList,
      keyExpiry
    });
    
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || !tab.url.includes('douyin.com')) {
      updateStatus('请在抖音页面使用此功能', 'error');
      return;
    }
    
    // 确保content script已注入
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await new Promise(resolve => setTimeout(resolve, 500)); // 等待脚本加载
    } catch (error) {
      // content script可能已经注入，忽略错误
      console.log('Content script可能已存在:', error);
    }
    
    // 发送开始关注消息（带错误处理）
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'startFollow',
        interval,
        userList: userList.split('\n').filter(url => url.trim()),
        keyExpiry
      });
      
      document.getElementById('startBtn').disabled = true;
      document.getElementById('stopBtn').disabled = false;
      updateStatus('开始关注...', 'info');
    } catch (error) {
      console.error('发送消息失败:', error);
      updateStatus('无法连接到页面，请刷新页面后重试', 'error');
      // 尝试重新注入脚本
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        // 重试发送消息
        await chrome.tabs.sendMessage(tab.id, {
          action: 'startFollow',
          interval,
          userList: userList.split('\n').filter(url => url.trim()),
          keyExpiry
        });
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        updateStatus('开始关注...', 'info');
      } catch (retryError) {
        updateStatus('连接失败，请刷新抖音页面后重试', 'error');
      }
    }
  });
  
  // 停止关注按钮
  document.getElementById('stopBtn').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'stopFollow' });
        } catch (error) {
          // 如果消息发送失败，通过存储来停止
          console.log('无法发送停止消息，使用存储方式停止:', error);
          await chrome.storage.local.set({ isFollowing: false });
        }
      }
      
      document.getElementById('startBtn').disabled = false;
      document.getElementById('stopBtn').disabled = true;
      updateStatus('已停止关注', 'info');
    } catch (error) {
      console.error('停止关注失败:', error);
      // 即使出错也更新UI
      document.getElementById('startBtn').disabled = false;
      document.getElementById('stopBtn').disabled = true;
      updateStatus('已停止关注', 'info');
    }
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
    if (message.action === 'addLog') {
      logSystem.addLog(message.text, message.type || 'info');
    }
    if (message.action === 'followComplete') {
      document.getElementById('startBtn').disabled = false;
      document.getElementById('stopBtn').disabled = true;
      updateStatus('✅ 所有任务已完成', 'success');
      loadFollowedList();
    }
  });
});

// 更新状态
function updateStatus(text, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = text;
  statusDiv.className = `status ${type}`;
  // 同时添加到日志
  logSystem.addLog(text, type);
}

// 日志系统
const logSystem = {
  // 添加日志
  addLog: function(message, type = 'info') {
    const logContainer = document.getElementById('logContainer');
    if (!logContainer) return;
    
    const time = new Date().toLocaleTimeString('zh-CN');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
    
    logContainer.appendChild(logEntry);
    // 自动滚动到底部
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // 保存到存储（最多保存1000条）
    this.saveLog(message, type, time);
  },
  
  // 保存日志到存储
  saveLog: async function(message, type, time) {
    try {
      const result = await chrome.storage.local.get(['logs']);
      const logs = result.logs || [];
      logs.push({ message, type, time, timestamp: Date.now() });
      
      // 只保留最近1000条日志
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }
      
      await chrome.storage.local.set({ logs });
    } catch (error) {
      console.error('保存日志失败:', error);
    }
  },
  
  // 加载日志
  loadLogs: async function() {
    try {
      const result = await chrome.storage.local.get(['logs']);
      const logs = result.logs || [];
      const logContainer = document.getElementById('logContainer');
      if (!logContainer) return;
      
      logContainer.innerHTML = '';
      logs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${log.type}`;
        logEntry.innerHTML = `<span class="log-time">[${log.time}]</span>${log.message}`;
        logContainer.appendChild(logEntry);
      });
      
      // 滚动到底部
      logContainer.scrollTop = logContainer.scrollHeight;
    } catch (error) {
      console.error('加载日志失败:', error);
    }
  },
  
  // 清空日志
  clearLogs: async function() {
    await chrome.storage.local.set({ logs: [] });
    const logContainer = document.getElementById('logContainer');
    if (logContainer) {
      logContainer.innerHTML = '';
    }
    this.addLog('日志已清空', 'info');
  }
};

// 更新进度
function updateProgress(text) {
  const progressDiv = document.getElementById('progress');
  progressDiv.textContent = text;
  // 同时添加到日志
  logSystem.addLog(text, 'info');
}
