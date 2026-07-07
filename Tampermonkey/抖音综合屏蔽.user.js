// ==UserScript==
// @name         抖音内容屏蔽
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      26.6.20
// @description  屏蔽抖音精选页面和推荐页面的视频内容，支持关键词、作者、视频ID屏蔽
// @author       SI Xiaolong
// @match        https://www.douyin.com/*
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
        BLOCK_ALL_LIVE: 'block_all_live',
        HIDE_FEATURED_CARD: 'hide_featured_card'
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

    // 获取隐藏精选页大卡片开关状态
    function getHideFeaturedCard() {
        return GM_getValue(CONFIG_KEYS.HIDE_FEATURED_CARD, true);
    }

    // 设置隐藏精选页大卡片开关状态
    function setHideFeaturedCard(value) {
        GM_setValue(CONFIG_KEYS.HIDE_FEATURED_CARD, value);
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

    // ====== 页面类型检测 ======
    function getPageType() {
        const url = window.location.href;
        if (url.includes('/jingxuan') || url === 'https://www.douyin.com/' || url === 'https://www.douyin.com') {
            // 检测当前可见的标签页内容
            const visiblePanel = document.querySelector('[role="tabpanel"][aria-hidden="false"]');
            if (visiblePanel) {
                if (visiblePanel.querySelector('.sliderVideo, [data-e2e="feed-active-video"]')) {
                    return 'recommend';
                }
                if (visiblePanel.querySelector('.discover-video-card-item')) {
                    return 'jingxuan';
                }
            }
            return 'jingxuan';
        }
        if (url.includes('?recommend=')) return 'recommend';
        return 'unknown';
    }

    // ====== 推荐页面专用函数 ======

    // 从 sliderVideo 的 class 中提取 video ID
    function extractVideoIdFromClass(videoElement) {
        const classes = videoElement.className.split(' ');
        for (const cls of classes) {
            if (cls.startsWith('video_')) {
                return cls.replace('video_', '');
            }
        }
        return null;
    }

    // 推荐页面：获取视频信息
    function getRecommendVideoInfo(videoElement) {
        const titleEl = videoElement.querySelector('[data-e2e="video-desc"]');
        const authorEl = videoElement.querySelector('[data-e2e="feed-video-nickname"]');
        const videoId = extractVideoIdFromClass(videoElement);

        const title = titleEl ? titleEl.textContent.trim() : '';
        const author = authorEl ? authorEl.textContent.trim().replace(/^@/, '') : '';

        return { title, author, videoId };
    }

    // 推荐页面：检查是否为直播
    function isRecommendLiveElement(videoElement) {
        // 直播标签出现在视频播放器容器上
        if (videoElement.querySelector('.LiveLinkA, .LivePlayer_PreCreatePlayer, .LivePlayer_Preview')) return true;
        // 检查整个元素是否包含直播标识
        const text = videoElement.textContent;
        if (text.includes('直播中') || text.includes('首播中') || text.includes('正在直播')) return true;
        return false;
    }

    // 推荐页面：检查是否为广告
    function isRecommendAdElement(videoElement) {
        const videoId = extractVideoIdFromClass(videoElement);
        if (!videoId) return true;
        const text = videoElement.textContent;
        if (text.includes('广告') || text.includes('推广') || text.includes('AD') || text.includes('ad')) {
            const { title } = getRecommendVideoInfo(videoElement);
            if (!title) return true;
        }
        return false;
    }

    // 推荐页面：检查是否应屏蔽
    function shouldBlockRecommendVideo(videoElement) {
        const { title, author, videoId } = getRecommendVideoInfo(videoElement);
        if (!title) return false;

        const blockAllLive = getBlockAllLive();
        if (blockAllLive && isRecommendLiveElement(videoElement)) return true;

        const blockedIds = getBlockList(CONFIG_KEYS.VIDEO_IDS);
        if (videoId && blockedIds.includes(videoId)) return true;

        const blockedAuthors = getBlockList(CONFIG_KEYS.AUTHORS);
        if (author && blockedAuthors.some(blocked => matchText(author, blocked))) return true;

        const blockedKeywords = getBlockList(CONFIG_KEYS.KEYWORDS);
        if (blockedKeywords.some(keyword => matchText(title, keyword))) return true;

        return false;
    }

    let _blockingRecommend = false;  // 重入保护
    let _lastRKeyTime = 0;           // 上次按 R 键的时间戳
    let _pendingBlockTimer = null;   // 待处理的延迟屏蔽定时器

    // 推荐页面：对活跃视频触发"不感兴趣"（模拟按 R 键）
    function markRecommendAsNotInterested(videoElement, reason = '') {
        const alreadyBlocked = videoElement.getAttribute('data-blocked');
        const { title, author, videoId } = getRecommendVideoInfo(videoElement);

        // 如果已有延迟定时器在排队，且该视频已标记过，不再重复排队
        if (_pendingBlockTimer && alreadyBlocked) return;

        console.log(
            `%c[抖音屏蔽] 推荐页不感兴趣 | ID: ${videoId || '未知'} | 作者: ${author || '未知'} | 标题: ${(title || '未知').substring(0, 40)} | 原因: ${reason}`,
            'color: #ff6b6b; font-weight: bold;'
        );

        // 标记已处理
        videoElement.setAttribute('data-blocked', 'true');

        // 节流：确保两次 R 键之间至少间隔 800ms（抖音 swiper 切换需要时间）
        const now = Date.now();
        const timeSinceLastR = now - _lastRKeyTime;
        if (timeSinceLastR < 800) {
            const delay = 800 - timeSinceLastR;
            if (_pendingBlockTimer) clearTimeout(_pendingBlockTimer);
            _pendingBlockTimer = setTimeout(() => {
                _lastRKeyTime = Date.now();
                const event = new KeyboardEvent('keydown', {
                    key: 'r', keyCode: 82, which: 82, code: 'KeyR',
                    bubbles: true, cancelable: true
                });
                document.dispatchEvent(event);
                _pendingBlockTimer = null;
            }, delay);
            return;
        }

        // 正常触发
        _lastRKeyTime = now;
        const event = new KeyboardEvent('keydown', {
            key: 'r', keyCode: 82, which: 82, code: 'KeyR',
            bubbles: true, cancelable: true
        });
        document.dispatchEvent(event);
    }

    // 推荐页面：扫描并屏蔽
    function scanRecommendPage() {
        if (_blockingRecommend) return;
        _blockingRecommend = true;

        try {
            const slides = document.querySelectorAll('.sliderVideo');
            const blockAllLive = getBlockAllLive();

            // 只处理活跃 slide
            const activeSlide = document.querySelector('[data-e2e="feed-active-video"]');
            if (!activeSlide) return;

            // 即使已被标记 data-blocked 也要处理（预屏蔽的 slide 变为活跃时需跳过）
            if (activeSlide.getAttribute('data-blocked')) {
                // 已被预屏蔽 → 直接按 R 跳过
                const { title, author, videoId } = getRecommendVideoInfo(activeSlide);
                console.log(
                    `%c[抖音屏蔽] 跳过已屏蔽视频（活跃） | ID: ${videoId || '未知'} | 作者: ${author || '未知'} | 标题: ${(title || '未知').substring(0, 40)}`,
                    'color: #ff6b6b; font-weight: bold;'
                );
                markRecommendAsNotInterested(activeSlide, '预屏蔽（活跃）');
                return;
            }

            if (isRecommendAdElement(activeSlide)) {
                markRecommendAsNotInterested(activeSlide, '广告');
            } else if (blockAllLive && isRecommendLiveElement(activeSlide)) {
                markRecommendAsNotInterested(activeSlide, '屏蔽所有直播');
            } else if (shouldBlockRecommendVideo(activeSlide)) {
                const { title, author, videoId } = getRecommendVideoInfo(activeSlide);
                const blockedIds = getBlockList(CONFIG_KEYS.VIDEO_IDS);
                const blockedAuthors = getBlockList(CONFIG_KEYS.AUTHORS);
                const blockedKeywords = getBlockList(CONFIG_KEYS.KEYWORDS);
                let reason = '匹配规则';
                if (videoId && blockedIds.includes(videoId)) reason = '视频ID黑名单';
                else if (author && blockedAuthors.some(b => matchText(author, b))) reason = '作者黑名单';
                else if (blockedKeywords.some(k => matchText(title, k))) reason = '标题关键词黑名单';
                markRecommendAsNotInterested(activeSlide, reason);
            }
        } finally {
            _blockingRecommend = false;
        }
    }

    // ====== 通用（精选页面）函数 ======

    // 检查是否为直播元素
    function isLiveElement(videoElement) {
        // 直播元素特征：包含直播标识 class
        const liveIndicator = videoElement.querySelector('.LiveLinkA, .LivePlayer_PreCreatePlayer, .LivePlayer_Preview');
        if (liveIndicator) return true;
        // 检查是否包含"直播中"或"首播中"标识
        const allElements = videoElement.querySelectorAll('*');
        for (const el of allElements) {
            if (el.children.length === 0) {
                const text = el.textContent.trim();
                if (text === '正在直播' || text === '直播中' || text === '首播中') {
                    return true;
                }
            }
        }
        return false;
    }

    // 获取视频/直播的标题和作者
    function getVideoInfo(videoElement) {
        // 新 class 选择器（适配抖音最新页面结构）
        let titleElement = videoElement.querySelector('.tpc3FG9j');
        let authorElement = videoElement.querySelector('.hNV3zCze');

        // 后备策略：在卡片的信息区域中寻找标题和作者
        if (!titleElement) {
            // 尝试在 img[alt] 中获取标题
            const img = videoElement.querySelector('img[class*="discover-video-card-img"]');
            if (img && img.alt) {
                titleElement = { textContent: img.alt };
            } else {
                // 最后后备：查找文本内容最长的独立 div
                let maxLen = 0;
                videoElement.querySelectorAll('div').forEach(el => {
                    if (el.children.length === 0) {
                        const text = el.textContent.trim();
                        if (text.length > maxLen && !text.includes('·') && text.length > 5) {
                            maxLen = text.length;
                            titleElement = el;
                        }
                    }
                });
            }
        }

        if (!authorElement) {
            // 后备：查找包含 @ 的短文本元素
            videoElement.querySelectorAll('div, span').forEach(el => {
                const text = el.textContent.trim();
                if (text.startsWith('@') && text.length < 25 && !text.includes('·')) {
                    authorElement = el;
                }
            });
        }

        const title = titleElement ? titleElement.textContent.trim() : '';
        const author = authorElement ? authorElement.textContent.trim().replace(/^@/, '') : '';

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
        const { title, author } = getVideoInfo(videoElement);

        if (!title) return false;

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

    // 对视频卡片应用深度高斯模糊（保留完整布局，视觉上隐藏）
    function blurVideo(videoElement, reason = '') {
        const videoId = videoElement.getAttribute('data-aweme-id');
        const { title, author } = getVideoInfo(videoElement);
        console.log(
            `%c[抖音屏蔽] 已模糊屏蔽视频 | ID: ${videoId || '未知'} | 作者: ${author || '未知'} | 标题: ${(title || '未知').substring(0, 40)} | 原因: ${reason}`,
            'color: #ff6b6b; font-weight: bold;'
        );
        // 停止播放
        videoElement.querySelectorAll('video, audio').forEach(media => {
            media.pause();
            media.removeAttribute('src');
            media.load();
        });
        // 应用深度高斯模糊，保留完整卡片结构和布局
        videoElement.style.filter = 'blur(40px)';
        videoElement.style.pointerEvents = 'none';
        videoElement.style.opacity = '0.3';
    }

    // 检查是否为广告元素
    function isAdElement(videoElement) {
        // 广告元素特征：没有 data-aweme-id 属性或为空
        const awemeId = videoElement.getAttribute('data-aweme-id');
        if (!awemeId || awemeId === '') return true;

        // 检查元素内是否包含广告/推广等文字
        const text = videoElement.textContent;
        if (text.includes('广告') || text.includes('推广') || text.includes('AD') || text.includes('ad')) {
            // 通过 getVideoInfo 验证是否有正常的视频内容结构
            const { title } = getVideoInfo(videoElement);
            if (!title) return true;
        }

        return false;
    }

    // 对精选页默认播放的大卡片应用深度高斯模糊
    function blurFeaturedCard() {
        if (!getHideFeaturedCard()) return;
        const firstCard = document.querySelector('.discover-video-card-item');
        if (!firstCard) return;
        // 检查是否包含视频播放器（默认播放的大卡片特征）
        const hasPlayer = firstCard.querySelector('.xgplayer, video, [class*="basePlayerContainer"]');
        if (!hasPlayer) return;
        // 获取标题用于日志
        const { title, author } = getVideoInfo(firstCard);
        const videoId = firstCard.getAttribute('data-aweme-id');
        console.log(
            `%c[抖音屏蔽] 已模糊屏蔽精选页默认播放大卡片 | ID: ${videoId || '未知'} | 作者: ${author || '未知'} | 标题: ${(title || '未知').substring(0, 40)}`,
            'color: #ff6b6b; font-weight: bold;'
        );
        // 停止播放
        firstCard.querySelectorAll('video, audio').forEach(media => {
            media.pause();
            media.removeAttribute('src');
            media.load();
        });
        // 应用深度高斯模糊，保留完整卡片结构和布局
        firstCard.style.filter = 'blur(40px)';
        firstCard.style.pointerEvents = 'none';
        firstCard.style.opacity = '0.3';
    }

    // 扫描精选页视频
    function scanJingxuanVideos() {
        // 先处理默认播放的大卡片
        blurFeaturedCard();

        const videos = document.querySelectorAll('.discover-video-card-item');
        if (videos.length === 0) return;
        const blockAllLive = getBlockAllLive();
        videos.forEach(video => {
            if (isAdElement(video)) {
                blurVideo(video, '广告');
                return;
            }
            if (blockAllLive && isLiveElement(video)) {
                blurVideo(video, '屏蔽所有直播');
                return;
            }
            if (shouldBlockVideo(video)) {
                const videoId = video.getAttribute('data-aweme-id');
                const { title, author } = getVideoInfo(video);
                const blockedIds = getBlockList(CONFIG_KEYS.VIDEO_IDS);
                const blockedAuthors = getBlockList(CONFIG_KEYS.AUTHORS);
                const blockedKeywords = getBlockList(CONFIG_KEYS.KEYWORDS);
                let reason = '匹配规则';
                if (videoId && blockedIds.includes(videoId)) reason = '视频ID黑名单';
                else if (author && blockedAuthors.some(b => matchText(author, b))) reason = '作者黑名单';
                else if (blockedKeywords.some(k => matchText(title, k))) reason = '标题关键词黑名单';
                blurVideo(video, reason);
            }
        });
    }

    // 扫描并屏蔽视频（自动检测页面类型）
    function scanAndBlockVideos() {
        const pageType = getPageType();
        if (pageType === 'unknown') return;

        if (pageType === 'recommend') {
            // 推荐页：只扫描推荐内容
            scanRecommendPage();
        } else {
            // 精选页：只扫描精选内容
            scanJingxuanVideos();
        }
    }

    // 监听右键点击
    function attachContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            // 推荐页：优先检测是否右键在作者名上
            const authorEl = e.target.closest('[data-e2e="feed-video-nickname"], .account-name');
            if (authorEl) {
                e.preventDefault();
                e.stopPropagation();

                const videoElement = authorEl.closest('.sliderVideo');
                if (!videoElement || videoElement.getAttribute('data-blocked')) return;

                const author = authorEl.textContent.trim().replace(/^@/, '');
                if (!author) return;

                const existingMenu = document.getElementById('douyin-block-menu');
                if (existingMenu) existingMenu.remove();

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
                    min-width: 160px;
                    font-size: 14px;
                `;

                const menuItem = document.createElement('div');
                menuItem.textContent = `屏蔽作者: ${author}`;
                menuItem.style.cssText = `
                    padding: 8px 16px;
                    cursor: pointer;
                    transition: background 0.2s;
                `;
                menuItem.onmouseover = () => menuItem.style.background = '#f0f0f0';
                menuItem.onmouseout = () => menuItem.style.background = 'white';
                menuItem.onclick = () => {
                    addToBlockList(CONFIG_KEYS.AUTHORS, author);
                    scanAndBlockVideos();
                    showNotification(`已屏蔽作者: ${author}`);
                    menu.remove();
                };
                menu.appendChild(menuItem);
                document.body.appendChild(menu);

                setTimeout(() => {
                    document.addEventListener('click', function closeMenu() {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    });
                }, 100);
                return;
            }

            // 推荐页：右键视频卡片 → 完整菜单
            const recommendVideo = e.target.closest('.sliderVideo');
            if (recommendVideo) {
                if (isRecommendAdElement(recommendVideo)) return;
                const { title, author } = getRecommendVideoInfo(recommendVideo);
                const videoId = extractVideoIdFromClass(recommendVideo);
                const isLive = isRecommendLiveElement(recommendVideo);
                createRecommendContextMenu(recommendVideo, e, { title, author, videoId, isLive });
                return;
            }

            // 精选页
            const jingxuanVideo = e.target.closest('.discover-video-card-item');
            if (jingxuanVideo) {
                if (isAdElement(jingxuanVideo)) return;
                createContextMenu(jingxuanVideo, e);
            }
        }, true);
    }

    // 推荐页面专用右键菜单
    function createRecommendContextMenu(videoElement, e, info) {
        e.preventDefault();
        e.stopPropagation();

        const existingMenu = document.getElementById('douyin-block-menu');
        if (existingMenu) existingMenu.remove();

        const { title, author, videoId, isLive } = info;

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

        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 100);
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
                    <div style="margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
                        <label style="display: flex; align-items: center; cursor: pointer; user-select: none;">
                            <input type="checkbox" id="hideFeaturedCardCheckbox" ${getHideFeaturedCard() ? 'checked' : ''} style="
                                width: 18px;
                                height: 18px;
                                margin-right: 8px;
                                cursor: pointer;
                            ">
                            <span style="font-size: 14px; color: #333;">隐藏精选页默认播放的大卡片</span>
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

            // 绑定隐藏大卡片开关
            const featuredCheckbox = dialog.querySelector('#hideFeaturedCardCheckbox');
            featuredCheckbox.addEventListener('change', (e) => {
                setHideFeaturedCard(e.target.checked);
                scanAndBlockVideos();
                showNotification(e.target.checked ? '已开启隐藏精选页大卡片' : '已关闭隐藏精选页大卡片');
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
        const pageType = getPageType();
        console.log(`抖音内容屏蔽脚本正在启动... 页面类型: ${pageType}`);

        attachContextMenu();

        // 延迟初始扫描，等待页面完全渲染
        setTimeout(() => {
            scanAndBlockVideos();
            console.log('初始扫描完成');
        }, 1500);

        // 监听标签页切换（精选/推荐等）
        const waitForTabs = setInterval(() => {
            const tabBar = document.querySelector('.semi-tabs-content') ||
                           document.querySelector('[class*="discover-tab-container"]');
            if (tabBar) {
                clearInterval(waitForTabs);
                console.log('标签页容器已找到，开始监听');

                // 监听标签页内容变化
                const observer = new MutationObserver(() => {
                    scanAndBlockVideos();
                });
                observer.observe(tabBar, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['aria-hidden', 'data-aweme-id', 'data-e2e']
                });
            }
        }, 500);

        // 兜底：每 3 秒扫描一次
        setInterval(() => {
            scanAndBlockVideos();
        }, 3000);

        // 超时后备
        setTimeout(() => {
            if (!document.querySelector('.semi-tabs-content')) {
                const observer = new MutationObserver(() => {
                    scanAndBlockVideos();
                });
                observer.observe(document.body, { childList: true, subtree: true });
                console.log('后备监听已启动');
            }
        }, 3000);

        console.log('抖音内容屏蔽脚本已启动');
    }

    // 尽快初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // SPA 路由变化检测：抖音使用客户端路由，URL 变化时重新扫描
    let lastUrl = window.location.href;
    setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            console.log('URL 变化，重新执行屏蔽扫描:', currentUrl);
            // 延迟执行，等待新页面 DOM 渲染
            setTimeout(() => {
                scanAndBlockVideos();
            }, 1000);
        }
    }, 2000);
})();