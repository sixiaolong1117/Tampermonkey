// ==UserScript==
// @name         抖音精选内容屏蔽
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.1
// @description  屏蔽抖音精选页面的视频内容，支持关键词、作者、视频ID屏蔽
// @author       SI Xiaolong
// @match        https://www.douyin.com/jingxuan*
// @icon         https://www.douyin.com/favicon.ico
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 存储配置的键名
    const CONFIG_KEYS = {
        KEYWORDS: 'blocked_keywords',
        AUTHORS: 'blocked_authors',
        VIDEO_IDS: 'blocked_video_ids',
        BLOCK_ALL_LIVE: 'block_all_live'
    };

    // 获取屏蔽列表
    function getBlockList(key) {
        const data = GM_getValue(key, '[]');
        return JSON.parse(data);
    }

    // 获取屏蔽直播开关状态
    function getBlockAllLive() {
        return GM_getValue(CONFIG_KEYS.BLOCK_ALL_LIVE, false);
    }

    // 设置屏蔽直播开关状态
    function setBlockAllLive(value) {
        GM_setValue(CONFIG_KEYS.BLOCK_ALL_LIVE, value);
    }

    // 保存屏蔽列表
    function saveBlockList(key, list) {
        GM_setValue(key, JSON.stringify(list));
    }

    // 显示通知提示
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#52c41a' : '#1890ff'};
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999999;
            font-size: 14px;
            max-width: 300px;
            word-break: break-word;
            animation: slideIn 0.3s ease-out;
        `;

        // 添加动画
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        if (!document.querySelector('#notification-style')) {
            style.id = 'notification-style';
            document.head.appendChild(style);
        }

        notification.textContent = message;
        document.body.appendChild(notification);

        // 3秒后自动消失
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // 添加到屏蔽列表
    function addToBlockList(key, value) {
        const list = getBlockList(key);
        if (!list.includes(value)) {
            list.push(value);
            saveBlockList(key, list);
        }
    }

    // 从屏蔽列表移除
    function removeFromBlockList(key, value) {
        let list = getBlockList(key);
        list = list.filter(item => item !== value);
        saveBlockList(key, list);
    }

    // 检查是否为直播元素
    function isLiveElement(videoElement) {
        // 直播元素特征：包含"直播中"标识
        const liveIndicator = videoElement.querySelector('.czPHNW9v[data-e2e="user-info-living"]');
        const liveClass = videoElement.querySelector('.ZSMMXimI');
        return liveIndicator !== null || liveClass !== null;
    }

    // 获取视频/直播的标题和作者
    function getVideoInfo(videoElement) {
        // 尝试获取普通视频的信息
        let titleElement = videoElement.querySelector('.bWzvoR9D');
        let authorElement = videoElement.querySelector('.i1udsuGn');

        // 如果是直播，使用直播的选择器
        if (!titleElement) {
            titleElement = videoElement.querySelector('.Tu5IS0vC');
        }
        if (!authorElement) {
            authorElement = videoElement.querySelector('.TvB65_nE');
        }

        const title = titleElement ? titleElement.textContent.trim() : '';
        const author = authorElement ? authorElement.textContent.trim() : '';

        return { title, author };
    }

    // 判断是否为正则表达式格式
    function isRegexPattern(str) {
        return str.startsWith('/') && str.endsWith('/') && str.length > 2;
    }

    // 匹配文本（支持正则表达式和普通字符串）
    function matchText(text, pattern) {
        if (isRegexPattern(pattern)) {
            try {
                const regexStr = pattern.slice(1, -1);
                const regex = new RegExp(regexStr, 'i');
                return regex.test(text);
            } catch (e) {
                console.error('正则表达式错误:', pattern, e);
                return false;
            }
        }
        return text.includes(pattern);
    }

    // 创建右键菜单
    function createContextMenu(videoElement, e) {
        e.preventDefault();
        e.stopPropagation();

        // 移除已存在的菜单
        const existingMenu = document.getElementById('douyin-block-menu');
        if (existingMenu) existingMenu.remove();

        const videoId = videoElement.getAttribute('data-aweme-id');
        const { title, author } = getVideoInfo(videoElement);
        const isLive = isLiveElement(videoElement);

        const menu = document.createElement('div');
        menu.id = 'douyin-block-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${e.clientX}px;
            top: ${e.clientY}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 999999;
            min-width: 180px;
            font-size: 14px;
        `;

        const menuItems = [
            { text: `屏蔽标题关键词`, action: () => {
                const keyword = prompt('请输入要屏蔽的关键词（从标题中提取）:', title.substring(0, 20));
                if (keyword) {
                    addToBlockList(CONFIG_KEYS.KEYWORDS, keyword);
                    scanAndBlockVideos();
                    showNotification(`已屏蔽关键词: ${keyword}`);
                }
            }, disabled: !title},
            { text: `屏蔽作者: ${author}`, action: () => {
                if (author) {
                    addToBlockList(CONFIG_KEYS.AUTHORS, author);
                    scanAndBlockVideos();
                    showNotification(`已屏蔽作者: ${author}`);
                }
            }, disabled: !author},
            { text: `屏蔽此${isLive ? '直播' : '视频'}ID`, action: () => {
                if (videoId) {
                    addToBlockList(CONFIG_KEYS.VIDEO_IDS, videoId);
                    scanAndBlockVideos();
                    showNotification(`已屏蔽${isLive ? '直播' : '视频'}ID: ${videoId}`);
                }
            }, disabled: !videoId}
        ];

        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.textContent = item.text;
            menuItem.style.cssText = `
                padding: 8px 16px;
                cursor: ${item.disabled ? 'not-allowed' : 'pointer'};
                opacity: ${item.disabled ? '0.5' : '1'};
                transition: background 0.2s;
            `;
            if (!item.disabled) {
                menuItem.onmouseover = () => menuItem.style.background = '#f0f0f0';
                menuItem.onmouseout = () => menuItem.style.background = 'white';
                menuItem.onclick = () => {
                    item.action();
                    menu.remove();
                };
            }
            menu.appendChild(menuItem);
        });

        document.body.appendChild(menu);

        // 点击其他地方关闭菜单
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 100);
    }

    // 检查视频是否应该被屏蔽
    function shouldBlockVideo(videoElement) {
        const videoId = videoElement.getAttribute('data-aweme-id');
        const titleElement = videoElement.querySelector('.bWzvoR9D');
        const authorElement = videoElement.querySelector('.i1udsuGn');

        if (!titleElement) return false;

        const title = titleElement.textContent.trim();
        const author = authorElement ? authorElement.textContent.trim() : '';

        // 检查视频ID
        const blockedIds = getBlockList(CONFIG_KEYS.VIDEO_IDS);
        if (videoId && blockedIds.includes(videoId)) {
            return true;
        }

        // 检查作者（支持正则）
        const blockedAuthors = getBlockList(CONFIG_KEYS.AUTHORS);
        if (author && blockedAuthors.some(blocked => matchText(author, blocked))) {
            return true;
        }

        // 检查关键词（支持正则）
        const blockedKeywords = getBlockList(CONFIG_KEYS.KEYWORDS);
        if (blockedKeywords.some(keyword => matchText(title, keyword))) {
            return true;
        }

        return false;
    }

    // 隐藏视频元素
    function hideVideo(videoElement) {
        videoElement.style.display = 'none';
        videoElement.setAttribute('data-blocked', 'true');
    }

    // 显示视频元素
    function showVideo(videoElement) {
        videoElement.style.display = '';
        videoElement.removeAttribute('data-blocked');
    }

    // 检查是否为广告元素
    function isAdElement(videoElement) {
        // 广告元素特征：没有 data-aweme-id 属性或为空，且包含特定广告类名
        const awemeId = videoElement.getAttribute('data-aweme-id');
        const hasAdClass = videoElement.classList.contains('auIPeWle') ||
                          videoElement.querySelector('.auIPeWle') !== null;

        return (!awemeId || awemeId === '') && hasAdClass;
    }

    // 扫描并屏蔽视频
    function scanAndBlockVideos() {
        const videos = document.querySelectorAll('.Xyhun5Yc.discover-video-card-item');
        videos.forEach(video => {
            // 先检查是否为广告
            if (isAdElement(video)) {
                hideVideo(video);
                return;
            }

            // 再检查是否符合屏蔽规则
            if (shouldBlockVideo(video)) {
                hideVideo(video);
            } else if (video.getAttribute('data-blocked')) {
                showVideo(video);
            }
        });
    }

    // 监听右键点击
    function attachContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            const videoElement = e.target.closest('.Xyhun5Yc.discover-video-card-item');
            if (videoElement) {
                // 检查是否为广告元素，广告不显示菜单
                if (isAdElement(videoElement)) {
                    return;
                }
                createContextMenu(videoElement, e);
            }
        }, true);
    }

    // 管理屏蔽列表的界面
    function openManageDialog() {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 999999;
            width: 600px;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;

        const tabs = [
            { key: CONFIG_KEYS.KEYWORDS, name: '标题关键词', supportsRegex: true },
            { key: CONFIG_KEYS.AUTHORS, name: '作者', supportsRegex: true },
            { key: CONFIG_KEYS.VIDEO_IDS, name: '视频ID', supportsRegex: false }
        ];

        let currentTab = 0;

        const renderDialog = () => {
            const currentConfig = tabs[currentTab];
            const list = getBlockList(currentConfig.key);
            const textareaValue = list.join('\n');
            const blockAllLive = getBlockAllLive();

            dialog.innerHTML = `
                <div style="padding: 20px; border-bottom: 1px solid #e8e8e8;">
                    <h2 style="margin: 0;">屏蔽列表管理</h2>
                </div>
                <div style="display: flex; border-bottom: 1px solid #e8e8e8;">
                    ${tabs.map((tab, index) => `
                        <div class="tab-item" data-index="${index}" style="
                            flex: 1;
                            padding: 12px;
                            text-align: center;
                            cursor: pointer;
                            background: ${index === currentTab ? '#1890ff' : '#f5f5f5'};
                            color: ${index === currentTab ? 'white' : '#666'};
                            border-right: ${index < tabs.length - 1 ? '1px solid #e8e8e8' : 'none'};
                            transition: all 0.3s;
                        ">
                            ${tab.name}
                        </div>
                    `).join('')}
                </div>
                <div style="padding: 20px; flex: 1; overflow-y: auto;">
                    <div style="margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
                        <label style="display: flex; align-items: center; cursor: pointer; user-select: none;">
                            <input type="checkbox" id="blockAllLiveCheckbox" ${blockAllLive ? 'checked' : ''} style="
                                width: 18px;
                                height: 18px;
                                margin-right: 8px;
                                cursor: pointer;
                            ">
                            <span style="font-size: 14px; color: #333;">屏蔽所有直播内容</span>
                        </label>
                    </div>
                    <div style="margin-bottom: 10px; color: #666; font-size: 13px;">
                        ${currentConfig.supportsRegex
                            ? '提示：每行一项，支持正则表达式（用 /pattern/ 格式，如 /福瑞|furry/）'
                            : '提示：每行一个视频ID'}
                    </div>
                    <textarea id="blockListInput" style="
                        width: 100%;
                        height: 300px;
                        padding: 10px;
                        border: 1px solid #d9d9d9;
                        border-radius: 4px;
                        font-family: monospace;
                        font-size: 14px;
                        resize: vertical;
                        box-sizing: border-box;
                    ">${textareaValue}</textarea>
                    <div style="margin-top: 10px; color: #999; font-size: 12px;">
                        当前共 ${list.length} 项
                    </div>
                </div>
                <div style="padding: 15px 20px; border-top: 1px solid #e8e8e8; display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="saveBtn" style="
                        padding: 8px 20px;
                        cursor: pointer;
                        background: #52c41a;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        font-size: 14px;
                    ">保存</button>
                    <button id="closeBtn" style="
                        padding: 8px 20px;
                        cursor: pointer;
                        background: #f5f5f5;
                        color: #666;
                        border: none;
                        border-radius: 4px;
                        font-size: 14px;
                    ">关闭</button>
                </div>
            `;

            // 绑定标签切换事件
            dialog.querySelectorAll('.tab-item').forEach(item => {
                item.addEventListener('click', () => {
                    currentTab = parseInt(item.getAttribute('data-index'));
                    renderDialog();
                });
                item.addEventListener('mouseenter', function() {
                    if (parseInt(this.getAttribute('data-index')) !== currentTab) {
                        this.style.background = '#e6e6e6';
                    }
                });
                item.addEventListener('mouseleave', function() {
                    if (parseInt(this.getAttribute('data-index')) !== currentTab) {
                        this.style.background = '#f5f5f5';
                    }
                });
            });

            // 绑定屏蔽直播开关
            const checkbox = dialog.querySelector('#blockAllLiveCheckbox');
            checkbox.addEventListener('change', (e) => {
                setBlockAllLive(e.target.checked);
                scanAndBlockVideos();
                showNotification(e.target.checked ? '已开启屏蔽所有直播' : '已关闭屏蔽所有直播');
            });

            // 绑定保存按钮
            dialog.querySelector('#saveBtn').addEventListener('click', () => {
                const textarea = dialog.querySelector('#blockListInput');
                const lines = textarea.value
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);

                // 去重
                const uniqueLines = [...new Set(lines)];
                const duplicateCount = lines.length - uniqueLines.length;

                saveBlockList(currentConfig.key, uniqueLines);
                scanAndBlockVideos();

                let message = `已保存 ${uniqueLines.length} 项${currentConfig.name}屏蔽规则`;
                if (duplicateCount > 0) {
                    message += `，已去除 ${duplicateCount} 项重复`;
                }
                showNotification(message);
                renderDialog();
            });

            // 绑定关闭按钮
            dialog.querySelector('#closeBtn').addEventListener('click', () => {
                dialog.remove();
            });
        };

        renderDialog();
        document.body.appendChild(dialog);
    }

    // 注册油猴菜单命令
    GM_registerMenuCommand('管理屏蔽列表', openManageDialog);

    // 初始化
    function init() {
        console.log('抖音精选内容屏蔽脚本正在启动...');

        // 先绑定右键菜单
        attachContextMenu();
        console.log('右键菜单已绑定');

        // 初始扫描
        scanAndBlockVideos();
        console.log('初始扫描完成');

        // 监听DOM变化
        const observer = new MutationObserver(() => {
            scanAndBlockVideos();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('抖音精选内容屏蔽脚本已启动');
    }

    // 等待页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();