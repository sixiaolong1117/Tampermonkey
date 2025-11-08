// ==UserScript==
// @name         抖音综合屏蔽
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  通过关键词过滤抖音视频，支持可视化管理
// @license      MIT
// @icon         https://douyin.com/favicon.ico
// @author       SI Xiaolong
// @match        https://www.douyin.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置区域 ====================
    const STORAGE_PREFIX = 'douyin_filter_';
    const DEFAULT_KEYWORDS = [];
    const DEFAULT_AUTO_SKIP = true;
    const DEFAULT_BLOCK_LIVE = false;
    const DEFAULT_HIDE_COMMENTS = false;
    const COOLDOWN_DURATION = 1000;
    const DEFAULT_BLOCK_ADS = true;
    const DEFAULT_BLOCK_AUTHORS = [];
    const DEFAULT_BLOCK_VIDEO_IDS = [];
    const DEFAULT_DEBUG_MODE = false;
    const DEFAULT_TIME_FILTER = {
        enabled: false,
        days: 30
    };
    const stateManager = {
        // 当前检测状态
        current: {
            videoId: null,
            lastCheckedVideoId: null,
            lastCheckTime: 0,
            cooldownUntil: 0,
            isProcessing: false
        },

        // 保存状态快照
        snapshot: null,

        // 重置所有状态
        resetAll() {
            console.log('🔄 重置所有检测状态');
            this.current = {
                videoId: null,
                lastCheckedVideoId: null,
                lastCheckTime: 0,
                cooldownUntil: 0,
                isProcessing: false
            };
            this.snapshot = null;

            console.log('✅ 状态已重置:', this.current);
        },

        // 创建状态快照（在保存关键词前）
        createSnapshot() {
            this.snapshot = { ...this.current };
            console.log('📸 创建状态快照:', this.snapshot);
        },

        // 恢复状态快照（在保存关键词后）
        restoreSnapshot() {
            if (this.snapshot) {
                this.current = { ...this.snapshot };
                console.log('🔄 恢复状态快照:', this.current);
                this.snapshot = null;
            }
        },

        // 设置当前视频ID
        setCurrentVideoId(videoId) {
            this.current.videoId = videoId;
        },

        // 获取当前视频ID
        getCurrentVideoId() {
            return this.current.videoId;
        },

        // 设置最后检查的视频ID
        setLastCheckedVideoId(videoId) {
            this.current.lastCheckedVideoId = videoId;
        },

        // 获取最后检查的视频ID
        getLastCheckedVideoId() {
            return this.current.lastCheckedVideoId;
        },

        // 检查是否在冷却期
        isInCooldown() {
            return Date.now() < this.current.cooldownUntil;
        },

        // 设置冷却期
        setCooldown() {
            this.current.cooldownUntil = Date.now() + COOLDOWN_DURATION;
            console.log(`⏰ 设置冷却期，${COOLDOWN_DURATION / 1000}秒`);
        },

        // 重置冷却期
        resetCooldown() {
            this.current.cooldownUntil = 0;
            console.log('🔄 重置冷却期');
        },

        // 设置处理状态
        setProcessing(status) {
            this.current.isProcessing = status;
        },

        // 获取处理状态
        isProcessing() {
            return this.current.isProcessing;
        }
    };
    // =================================================

    // 绕过油猴检测
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
    });

    const originalToString = Function.prototype.toString;
    Function.prototype.toString = function () {
        if (this === Function.prototype.toString) {
            return 'function toString() { [native code] }';
        }
        return originalToString.call(this);
    };

    initializeState();

    // 初始化关键词列表
    let keywords = GM_getValue(STORAGE_PREFIX + 'keywords', DEFAULT_KEYWORDS);
    let autoSkip = GM_getValue(STORAGE_PREFIX + 'auto_skip', DEFAULT_AUTO_SKIP);
    let blockLive = GM_getValue(STORAGE_PREFIX + 'block_live', DEFAULT_BLOCK_LIVE);
    let hideComments = GM_getValue(STORAGE_PREFIX + 'hide_comments', DEFAULT_HIDE_COMMENTS);
    let blockAds = GM_getValue(STORAGE_PREFIX + 'block_ads', DEFAULT_BLOCK_ADS);
    let blockAuthors = GM_getValue(STORAGE_PREFIX + 'block_authors', DEFAULT_BLOCK_AUTHORS);
    let blockVideoIds = GM_getValue(STORAGE_PREFIX + 'block_video_ids', DEFAULT_BLOCK_VIDEO_IDS);
    let timeFilter = GM_getValue(STORAGE_PREFIX + 'time_filter', DEFAULT_TIME_FILTER);
    let debugMode = GM_getValue(STORAGE_PREFIX + 'debug_mode', DEFAULT_DEBUG_MODE);
    let filterStats = {
        total: 0,
        liveBlocked: 0,
        commentsHidden: 0,
        adsBlocked: 0,
        authorsBlocked: 0,
        videoIdsBlocked: 0,
        timeFiltered: 0,
        details: []
    };
    let isPanelOpen = false;
    let keyboardBlockers = []; // 存储所有键盘事件阻止器

    // 注册油猴菜单
    GM_registerMenuCommand('📝 管理过滤规则', showKeywordManager);
    GM_registerMenuCommand('⚙️ 过滤设置', showFilterSettings);
    // GM_registerMenuCommand('📊 查看统计信息', showStats);
    // GM_registerMenuCommand('👤 作者屏蔽管理', showAuthorManager);
    GM_registerMenuCommand('🎬 视频ID屏蔽管理', showVideoIdManager);
    GM_registerMenuCommand('⏰ 时间过滤设置', showTimeFilterSettings);
    GM_registerMenuCommand('🔄 重置冷却时间', resetCooldown);
    GM_registerMenuCommand('🔄 强制刷新状态', forceRefreshPageState);
    GM_registerMenuCommand('🔄 强制重置状态', () => {
        stateManager.resetAll();
        showNotification('已强制重置所有状态');
        console.log('✅ 状态已完全重置:', stateManager.current);
    });

    // 添加样式
    const styles = `
        /* 右键菜单样式 */
        .douyin-context-menu {
            position: fixed;
            background: var(--bg-color, #fff);
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 8px 0;
            z-index: 100001;
            min-width: 160px;
            border: 1px solid var(--border-color, #e0e0e0);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
        }
        .douyin-context-menu-item {
            padding: 8px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--text-color, #333);
            transition: background-color 0.2s;
        }
        .douyin-context-menu-item:hover {
            background: var(--btn-bg, #f5f5f5);
        }
        .douyin-context-menu-item.disabled {
            color: var(--text-secondary, #999);
            cursor: not-allowed;
        }
        .douyin-context-menu-item.disabled:hover {
            background: transparent;
        }
        .douyin-context-menu-divider {
            height: 1px;
            background: var(--border-color, #e0e0e0);
            margin: 4px 0;
        }
        .douyin-keyword-manager-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .douyin-keyword-manager {
            background: var(--bg-color, #fff);
            border-radius: 12px;
            padding: 24px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .douyin-keyword-manager h3 {
            margin: 0 0 20px 0;
            font-size: 20px;
            color: var(--text-color, #333);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .douyin-keyword-manager textarea {
            width: 100%;
            min-height: 200px;
            padding: 12px;
            border: 2px solid var(--border-color, #ddd);
            border-radius: 8px;
            font-size: 14px;
            font-family: 'Monaco', 'Menlo', monospace;
            resize: vertical;
            background: var(--input-bg, #f8f9fa);
            color: var(--input-color, #333);
            transition: border-color 0.3s;
        }
        .douyin-keyword-manager textarea:focus {
            outline: none;
            border-color: #fe2c55;
        }
        .douyin-keyword-manager .button-group {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 20px;
        }
        .douyin-keyword-manager button {
            padding: 10px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s;
        }
        .douyin-keyword-manager .save-btn {
            background: linear-gradient(135deg, #fe2c55 0%, #f00056 100%);
            color: white;
        }
        .douyin-keyword-manager .save-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(254, 44, 85, 0.4);
        }
        .douyin-keyword-manager .close-btn {
            background: var(--btn-bg, #f0f0f0);
            color: var(--btn-color, #666);
        }
        .douyin-keyword-manager .close-btn:hover {
            background: var(--btn-hover-bg, #e0e0e0);
        }
        .douyin-keyword-manager .help-text {
            margin-top: 16px;
            padding: 12px;
            background: var(--help-bg, #f8f9fa);
            border-radius: 8px;
            font-size: 13px;
            color: var(--help-color, #666);
            line-height: 1.6;
        }
        .douyin-keyword-manager .help-text div {
            margin: 4px 0;
        }
        .douyin-keyword-manager .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
            margin: 16px 0;
        }
        .douyin-keyword-manager .stat-card {
            background: var(--card-bg, #f8f9fa);
            padding: 16px;
            border-radius: 8px;
            text-align: center;
        }
        .douyin-keyword-manager .stat-number {
            font-size: 28px;
            font-weight: bold;
            color: #fe2c55;
            margin-bottom: 4px;
        }
        .douyin-keyword-manager .stat-label {
            font-size: 12px;
            color: var(--text-secondary, #999);
        }
        .douyin-keyword-manager .setting-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px;
            background: var(--card-bg, #f8f9fa);
            border-radius: 8px;
            margin-bottom: 12px;
        }
        .douyin-keyword-manager .setting-item label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            flex: 1;
        }
        .douyin-keyword-manager .setting-item input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }
        .douyin-notification {
            position: fixed;
            top: 80px;
            right: 20px;
            background: white;
            padding: 16px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 100000;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease-out;
        }
        .douyin-comment-hidden {
            display: none !important;
        }
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
        @media (prefers-color-scheme: light) {
            .douyin-keyword-manager {
                --bg-color: #fff;
                --text-color: #333;
                --text-secondary: #999;
                --border-color: #ddd;
                --input-bg: #f8f9fa;
                --input-color: #333;
                --btn-bg: #f0f0f0;
                --btn-color: #666;
                --btn-hover-bg: #e0e0e0;
                --help-bg: #f8f9fa;
                --help-color: #666;
                --card-bg: #f8f9fa;
            }
        }
        @media (prefers-color-scheme: dark) {
            .douyin-keyword-manager {
                --bg-color: #1f1f1f;
                --text-color: #e0e0e0;
                --text-secondary: #999;
                --border-color: #444;
                --input-bg: #2a2a2a;
                --input-color: #e0e0e0;
                --btn-bg: #333;
                --btn-color: #ccc;
                --btn-hover-bg: #444;
                --help-bg: #2a2a2a;
                --help-color: #999;
                --card-bg: #2a2a2a;
            }
        }
        /* 标签页样式 */
        .tab-btn {
            padding: 8px 16px;
            border: none;
            background: none;
            border-bottom: 2px solid transparent;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.3s;
            font-size: 14px;
        }
        .tab-btn.active {
            border-bottom-color: #fe2c55;
            color: var(--text-color);
        }
        .tab-btn:hover {
            color: var(--text-color);
        }
        .tab-content {
            display: block;
        }
        /* Debug弹窗样式 */
        .douyin-debug-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            z-index: 100002;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .douyin-debug-panel {
            background: #1a1a1a;
            border-radius: 12px;
            padding: 24px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            font-family: 'Monaco', 'Menlo', monospace;
            color: #fff;
            border: 2px solid #ff4757;
        }
        .douyin-debug-panel h3 {
            margin: 0 0 16px 0;
            font-size: 18px;
            color: #ff4757;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .douyin-debug-section {
            margin-bottom: 16px;
            padding: 12px;
            background: #2a2a2a;
            border-radius: 6px;
        }
        .douyin-debug-section h4 {
            margin: 0 0 8px 0;
            font-size: 14px;
            color: #ffa502;
        }
        .douyin-debug-content {
            font-size: 12px;
            line-height: 1.4;
            word-break: break-all;
        }
        .douyin-debug-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 20px;
        }
        .douyin-debug-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s;
        }
        .douyin-debug-continue {
            background: #2ed573;
            color: white;
        }
        .douyin-debug-continue:hover {
            background: #26c965;
        }
        .douyin-debug-cancel {
            background: #57606f;
            color: white;
        }
        .douyin-debug-cancel:hover {
            background: #4b5562;
        }
        .douyin-debug-skip {
            background: #ffa502;
            color: white;
        }
        .douyin-debug-skip:hover {
            background: #e59400;
        }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    // 显示通知
    function showNotification(message, duration = 3000) {
        const notification = document.createElement('div');
        notification.className = 'douyin-notification';
        notification.innerHTML = `
            <span style="font-size: 20px;">✅</span>
            <span style="font-size: 14px; color: #333;">${message}</span>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    // 切换隐藏评论功能
    function toggleHideComments() {
        hideComments = !hideComments;
        GM_setValue(STORAGE_PREFIX + 'hide_comments', hideComments);
        showNotification(hideComments ? '已开启隐藏评论功能' : '已关闭隐藏评论功能');

        if (hideComments) {
            setTimeout(() => {
                hideCommentButtons();
            }, 100);
        } else {
            showCommentButtons();
        }
    }

    // 隐藏评论按钮
    function hideCommentButtons() {
        if (!hideComments) return;

        console.log('🔍 查找评论按钮进行隐藏...');

        let hiddenCount = 0;

        const activeVideo = document.querySelector('[data-e2e="feed-active-video"]');
        if (!activeVideo) {
            console.log('⚠️ 未找到激活的视频');
            return;
        }

        const commentButtons = activeVideo.querySelectorAll('[data-e2e="feed-comment-icon"]');
        commentButtons.forEach(btn => {
            if (btn.style.display !== 'none') {
                btn.style.display = 'none';
                btn.classList.add('douyin-comment-hidden');
                hiddenCount++;
                console.log('💬 隐藏评论按钮（通过data-e2e）');
            }
        });

        const popupButton = activeVideo.querySelector('div[data-popupid="7qbom57"]');
        if (popupButton && popupButton.style.display !== 'none') {
            popupButton.style.display = 'none';
            popupButton.classList.add('douyin-comment-hidden');
            hiddenCount++;
            console.log('💬 隐藏评论按钮（通过data-popupid）');
        }

        if (hiddenCount > 0) {
            filterStats.commentsHidden += hiddenCount;
            console.log(`✅ 成功隐藏 ${hiddenCount} 个评论按钮`);
        } else {
            console.log('ℹ️ 当前视频未找到评论按钮');
        }
    }

    // 显示评论按钮
    function showCommentButtons() {
        console.log('🔍 恢复显示评论按钮...');

        const hiddenComments = document.querySelectorAll('.douyin-comment-hidden');
        let shownCount = 0;

        hiddenComments.forEach(element => {
            element.style.display = '';
            element.classList.remove('douyin-comment-hidden');
            shownCount++;
        });

        console.log(`✅ 恢复显示 ${shownCount} 个评论按钮`);
    }

    // 完全阻止键盘事件传播到抖音
    function blockKeyboardEvent(event) {
        // 立即停止传播和默认行为
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
        return false;
    }

    // 智能键盘事件处理器
    function smartKeyboardHandler(event) {
        if (!isPanelOpen) return;

        const activeElement = document.activeElement;
        const isInPanel = activeElement && activeElement.closest('.douyin-keyword-manager');

        // 如果不在面板内，阻止所有键盘事件
        if (!isInPanel) {
            console.log('⌨️ 阻止面板外的键盘事件:', event.key);
            return blockKeyboardEvent(event);
        }

        // 在面板内，根据情况处理
        const isInTextInput = activeElement && (
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'INPUT' ||
            activeElement.isContentEditable
        );

        // ESC键特殊处理：允许通过但不传播
        if (event.key === 'Escape') {
            event.stopPropagation();
            return;
        }

        // 在文本输入框内，允许所有键盘操作
        if (isInTextInput) {
            event.stopPropagation(); // 仅阻止冒泡，允许默认行为
            return;
        }

        // 面板内非输入区域，阻止所有可能触发抖音的按键
        const douyinKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'];
        if (douyinKeys.includes(event.key)) {
            console.log('⌨️ 阻止抖音控制键:', event.key);
            return blockKeyboardEvent(event);
        }

        // 其他键只阻止冒泡
        event.stopPropagation();
    }

    // 接管键盘控制
    function takeOverKeyboard() {
        if (isPanelOpen) return;

        isPanelOpen = true;
        console.log('🔒 完全接管键盘控制');

        // 清空之前的阻止器
        keyboardBlockers = [];

        // 创建多层拦截，确保完全阻止
        const events = ['keydown', 'keyup', 'keypress'];
        events.forEach(eventType => {
            // 捕获阶段 - 最高优先级
            const captureHandler = (e) => smartKeyboardHandler(e);
            document.addEventListener(eventType, captureHandler, { capture: true, passive: false });
            keyboardBlockers.push({ type: eventType, handler: captureHandler, capture: true });

            // 冒泡阶段 - 备用拦截
            const bubbleHandler = (e) => smartKeyboardHandler(e);
            document.addEventListener(eventType, bubbleHandler, { capture: false, passive: false });
            keyboardBlockers.push({ type: eventType, handler: bubbleHandler, capture: false });

            // Window级别拦截
            const windowHandler = (e) => smartKeyboardHandler(e);
            window.addEventListener(eventType, windowHandler, { capture: true, passive: false });
            keyboardBlockers.push({ type: eventType, handler: windowHandler, capture: true, isWindow: true });
        });

        console.log(`✅ 已安装 ${keyboardBlockers.length} 个键盘拦截器`);
    }

    // 恢复键盘控制
    function restoreKeyboard() {
        if (!isPanelOpen) return;

        isPanelOpen = false;
        console.log('🔓 恢复键盘控制');

        // 移除所有拦截器
        keyboardBlockers.forEach(blocker => {
            if (blocker.isWindow) {
                window.removeEventListener(blocker.type, blocker.handler, { capture: blocker.capture });
            } else {
                document.removeEventListener(blocker.type, blocker.handler, { capture: blocker.capture });
            }
        });

        keyboardBlockers = [];
        console.log('✅ 已移除所有键盘拦截器');
    }

    // 显示关键词管理器
    function showKeywordManager() {
        takeOverKeyboard();

        const cooldownStatus = getCooldownStatus();
        const cooldownText = cooldownStatus.inCooldown ?
            ` | 冷却中: ${cooldownStatus.remainingSeconds}秒` : '';

        const overlay = document.createElement('div');
        overlay.className = 'douyin-keyword-manager-overlay';

        const manager = document.createElement('div');
        manager.className = 'douyin-keyword-manager';
        manager.innerHTML = `
        <h3>
            <span>🎯</span>
            <span>过滤规则管理</span>
        </h3>
        
        <!-- 标签页导航 -->
        <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color);">
            <button class="tab-btn active" data-tab="keywords" style="padding: 8px 16px; border: none; background: none; border-bottom: 2px solid #fe2c55; color: var(--text-color); cursor: pointer;">
                📝 关键词屏蔽
            </button>
            <button class="tab-btn" data-tab="authors" style="padding: 8px 16px; border: none; background: none; border-bottom: 2px solid transparent; color: var(--text-secondary); cursor: pointer;">
                👤 作者屏蔽
            </button>
        </div>

        <!-- 统计信息 -->
        <div style="margin-bottom: 16px; font-size: 13px; color: var(--text-secondary);">
            关键词: ${keywords.length} 个 | 作者: ${blockAuthors.length} 个 | 已过滤 ${filterStats.total} 个视频${cooldownText}
        </div>

        <!-- 关键词屏蔽标签页 -->
        <div id="keywords-tab" class="tab-content">
            <textarea id="keyword-textarea" placeholder="每行一个关键词或标签

示例：
超级战队
特摄
#游戏
/正则表达式/

支持正则表达式：
/\\d+集/
/战队.*/
">${keywords.join('\n')}</textarea>
        </div>

        <!-- 作者屏蔽标签页 -->
        <div id="authors-tab" class="tab-content" style="display: none;">
            <textarea id="author-textarea" placeholder="每行一个作者名（支持部分匹配）

示例：
影视飓风
老番茄
张三

注意：作者名不区分大小写，包含指定文本即会被屏蔽">${blockAuthors.join('\n')}</textarea>
        </div>

        <div class="button-group">
            <button class="close-btn" id="manager-close-btn">取消</button>
            <button class="save-btn" id="manager-save-btn">保存并应用</button>
        </div>
        
        <div class="help-text">
            <div><strong>💡 使用说明：</strong></div>
            <div id="keywords-help">
                <div>• 每行输入一个关键词或标签，支持中英文</div>
                <div>• 支持正则表达式，用 /.../ 包裹</div>
                <div>• 标签以 # 开头，可在推荐页右键屏蔽</div>
                <div>• 匹配成功后自动触发"不感兴趣"</div>
            </div>
            <div id="authors-help" style="display: none;">
                <div>• 每行输入一个作者名，支持部分匹配</div>
                <div>• 不区分大小写，包含指定文本即会被屏蔽</div>
                <div>• 可在推荐页右键作者名快速屏蔽</div>
                <div>• 屏蔽后立即跳过该作者的视频</div>
            </div>
            <div style="margin-top: 8px;">
                <div>• 修改后立即生效，无需刷新页面</div>
                <div>• <strong>保存后将立即应用到当前页面</strong></div>
                <div>• 面板打开时键盘完全由面板控制</div>
                <div>• 按 ESC 键或点击外部关闭面板</div>
            </div>
        </div>
    `;

        const closeManager = () => {
            console.log('📝 管理面板关闭，恢复键盘控制');
            overlay.remove();
            restoreKeyboard();

            // 面板关闭后轻微刷新状态
            setTimeout(() => {
                forceRefreshPageState();
            }, 100);
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                console.log('📝 点击外部关闭管理面板');
                closeManager();
            }
        });

        // ESC键关闭面板
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                console.log('📝 ESC键关闭管理面板');
                closeManager();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        overlay.appendChild(manager);
        document.body.appendChild(overlay);

        // 设置标签页切换
        setTimeout(() => {
            const tabBtns = manager.querySelectorAll('.tab-btn');
            const tabContents = manager.querySelectorAll('.tab-content');
            const keywordsHelp = manager.querySelector('#keywords-help');
            const authorsHelp = manager.querySelector('#authors-help');

            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    // 移除所有激活状态
                    tabBtns.forEach(b => {
                        b.style.borderBottomColor = 'transparent';
                        b.style.color = 'var(--text-secondary)';
                    });
                    tabContents.forEach(content => content.style.display = 'none');
                    keywordsHelp.style.display = 'none';
                    authorsHelp.style.display = 'none';

                    // 激活当前标签
                    btn.style.borderBottomColor = '#fe2c55';
                    btn.style.color = 'var(--text-color)';

                    const tabName = btn.getAttribute('data-tab');
                    const activeTab = manager.querySelector(`#${tabName}-tab`);
                    if (activeTab) activeTab.style.display = 'block';

                    if (tabName === 'keywords') {
                        keywordsHelp.style.display = 'block';
                    } else if (tabName === 'authors') {
                        authorsHelp.style.display = 'block';
                    }
                });
            });

            // 设置保存按钮事件处理器
            setupCombinedSaveHandler(manager, closeManager);

            const keywordTextarea = manager.querySelector('#keyword-textarea');
            const closeBtn = manager.querySelector('#manager-close-btn');

            if (keywordTextarea) {
                keywordTextarea.focus();
                keywordTextarea.setSelectionRange(0, 0);
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', closeManager);
            }
        }, 100);
    }

    // 设置组合保存处理器
    // 完全重写设置组合保存处理器
    function setupCombinedSaveHandler(manager, closeManager) {
        const saveBtn = manager.querySelector('.save-btn');
        if (saveBtn) {
            // 移除旧的事件监听器
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

            // 添加新的事件监听器
            newSaveBtn.addEventListener('click', function () {
                const keywordTextarea = manager.querySelector('#keyword-textarea');
                const authorTextarea = manager.querySelector('#author-textarea');

                if (keywordTextarea && authorTextarea) {
                    const newKeywords = keywordTextarea.value
                        .split('\n')
                        .map(k => k.trim())
                        .filter(k => k.length > 0);

                    const newAuthors = authorTextarea.value
                        .split('\n')
                        .map(a => a.trim())
                        .filter(a => a.length > 0);

                    console.log('💾 开始保存关键词和作者屏蔽...', {
                        newKeywords: newKeywords,
                        newAuthors: newAuthors
                    });

                    // 在保存前创建状态快照
                    stateManager.createSnapshot();

                    // 保存关键词
                    keywords = newKeywords;
                    GM_setValue(STORAGE_PREFIX + 'keywords', keywords);

                    // 保存作者屏蔽
                    blockAuthors = newAuthors;
                    GM_setValue(STORAGE_PREFIX + 'block_authors', blockAuthors);

                    console.log('✅ 保存完成:', {
                        keywords: keywords,
                        blockAuthors: blockAuthors
                    });

                    closeManager();

                    // 显示保存成功的通知
                    showNotification(`已保存 ${keywords.length} 个关键词和 ${blockAuthors.length} 个作者屏蔽`);

                    // 关键修复：延迟后执行强制重新检查，但使用全新的状态
                    setTimeout(() => {
                        console.log('🚀 执行保存后的强制重新检查');
                        executePostSaveCheck();
                    }, 300);
                }
            });
        }
    }

    // 执行保存后的检查
    function executePostSaveCheck() {
        console.log('🔍 执行保存后检查流程');

        // 完全重置状态
        stateManager.resetAll();

        // 强制重新检测当前视频
        setTimeout(() => {
            const currentVideoInfo = getCurrentVideoInfo();
            const currentVideoId = currentVideoInfo ? currentVideoInfo.videoId : null;

            console.log('🎯 保存后检查 - 当前视频:', {
                videoId: currentVideoId,
                element: !!currentVideoInfo
            });

            if (currentVideoId) {
                // 设置新的状态
                stateManager.setCurrentVideoId(currentVideoId);
                stateManager.setLastCheckedVideoId(currentVideoId);

                console.log('🔍 立即检查当前视频是否匹配新规则');

                // 直接调用检查函数，绕过所有防抖和状态检查
                immediateCheckCurrentVideo();
            } else {
                console.log('❌ 保存后检查 - 未找到当前视频');
            }
        }, 200);
    }

    // 立即检查当前视频（绕过所有状态检查）
    function immediateCheckCurrentVideo() {
        console.log('⚡ 立即检查当前视频');

        if (stateManager.isProcessing()) {
            console.log('⏸️ 已有检查在进行中，跳过');
            return;
        }

        stateManager.setProcessing(true);

        try {
            const videoText = getVideoInfoText();
            const author = getCurrentAuthor();
            const description = getCurrentDescription();
            const currentVideoId = stateManager.getCurrentVideoId();

            console.log('🔍 立即检查 - 视频信息:', {
                videoId: currentVideoId,
                videoText: videoText,
                author: author,
                description: description
            });

            if (!videoText) {
                console.log('❌ 立即检查 - 未获取到视频文本');
                stateManager.setProcessing(false);
                return;
            }

            // 检查作者屏蔽
            if (window.location.href.includes('recommend=1')) {
                if (author && isAuthorBlocked(author)) {
                    console.log(`✅ 立即检查 - 匹配作者屏蔽: ${author}`);

                    filterStats.total++;
                    filterStats.authorsBlocked++;
                    filterStats.details.push({
                        keyword: `作者: ${author}`,
                        content: videoText.substring(0, 50),
                        timestamp: new Date().toLocaleTimeString(),
                        immediate: true
                    });

                    if (debugMode) {
                        console.log('🐛 立即检查 - 进入作者屏蔽调试流程');
                        showDebugPanel(
                            `立即检查 - 作者屏蔽: ${author}`,
                            author,
                            description,
                            `作者: ${author}`
                        ).then(() => {
                            stateManager.setProcessing(false);
                        });
                    } else {
                        stateManager.setCooldown();
                        setTimeout(() => {
                            triggerDisinterest();
                            console.log('🚫 立即检查 - 已触发不感兴趣（作者屏蔽）');
                            showNotification(`已屏蔽作者 ${author}`);
                            stateManager.setProcessing(false);
                        }, 300);
                    }
                    return;
                }
            }

            // 检查关键词匹配
            const matchedKeyword = isTextMatched(videoText);

            if (matchedKeyword) {
                console.log(`✅ 立即检查 - 匹配关键词: ${matchedKeyword}`);

                filterStats.total++;
                filterStats.details.push({
                    keyword: matchedKeyword,
                    content: videoText.substring(0, 50),
                    timestamp: new Date().toLocaleTimeString(),
                    immediate: true
                });

                if (debugMode) {
                    console.log('🐛 立即检查 - 进入关键词屏蔽调试流程');
                    showDebugPanel(
                        `立即检查 - 关键词匹配: ${matchedKeyword}`,
                        author,
                        description,
                        matchedKeyword
                    ).then(() => {
                        stateManager.setProcessing(false);
                    });
                } else {
                    stateManager.setCooldown();
                    setTimeout(() => {
                        triggerDisinterest();
                        console.log('🚫 立即检查 - 已触发不感兴趣');
                        showNotification(`已屏蔽视频`);
                        stateManager.setProcessing(false);
                    }, 300);
                }
            } else {
                console.log('❌ 立即检查 - 未匹配任何关键词');
                stateManager.setProcessing(false);
            }
        } catch (error) {
            console.error('❌ 立即检查出错:', error);
            stateManager.setProcessing(false);
        }
    }

    function resetAllDetectionStates() {
        stateManager.resetAll();
        console.log('🔄 已重置所有检测状态');
    }

    function forceCheckCurrentVideo() {
        console.log('🔍 强制检查当前视频');

        // 重置状态确保可以立即检查
        resetAllDetectionStates();

        // 如果是推荐页，立即执行检查
        if (window.location.href.includes('recommend=1')) {
            console.log('🎯 在推荐页执行强制检查');

            // 使用setTimeout确保DOM已更新
            setTimeout(() => {
                // 重新获取当前视频信息
                const currentVideoInfo = getCurrentVideoInfo();
                const currentVideoId = currentVideoInfo ? currentVideoInfo.videoId : null;

                console.log('🔍 强制检查 - 当前视频信息:', {
                    videoId: currentVideoId,
                    element: !!currentVideoInfo?.element
                });

                if (currentVideoId) {
                    stateManager.setLastCheckedVideoId(currentVideoId);
                    stateManager.setCurrentVideoId(currentVideoId);
                    immediateCheckCurrentVideo(); // 使用立即检查而不是常规检查
                } else {
                    console.log('❌ 强制检查 - 未找到当前视频');
                }
            }, 300);
        }
    }

    // 显示过滤设置
    function showFilterSettings() {
        takeOverKeyboard();

        const overlay = document.createElement('div');
        overlay.className = 'douyin-keyword-manager-overlay';

        const manager = document.createElement('div');
        manager.className = 'douyin-keyword-manager';
        manager.innerHTML = `
        <h3>
            <span>⚙️</span>
            <span>过滤设置</span>
        </h3>
        <div class="setting-item">
            <label>
                <input type="checkbox" id="auto-skip" ${autoSkip ? 'checked' : ''}>
                <div>
                    <div style="font-weight: 500; color: var(--text-color);">自动跳过匹配视频</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                        匹配关键词后自动触发不感兴趣
                    </div>
                </div>
            </label>
        </div>
        <div class="setting-item">
            <label>
                <input type="checkbox" id="block-live" ${blockLive ? 'checked' : ''}>
                <div>
                    <div style="font-weight: 500; color: var(--text-color);">自动屏蔽直播</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                        检测到直播内容时自动点击"不想看直播"
                    </div>
                </div>
            </label>
        </div>
        <div class="setting-item">
            <label>
                <input type="checkbox" id="hide-comments" ${hideComments ? 'checked' : ''}>
                <div>
                    <div style="font-weight: 500; color: var(--text-color);">隐藏评论按钮</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                        自动隐藏视频评论按钮，避免误触
                    </div>
                </div>
            </label>
        </div>
        <div class="setting-item">
            <label>
                <input type="checkbox" id="block-ads" ${blockAds ? 'checked' : ''}>
                <div>
                    <div style="font-weight: 500; color: var(--text-color);">屏蔽精选页广告</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                        自动隐藏精选页面的广告卡片
                    </div>
                </div>
            </label>
        </div>
        <div class="setting-item">
            <label>
                <input type="checkbox" id="debug-mode" ${debugMode ? 'checked' : ''}>
                <div>
                    <div style="font-weight: 500; color: var(--text-color);">调试模式</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                        屏蔽前显示调试信息，用于诊断屏蔽问题
                    </div>
                </div>
            </label>
        </div>
        <div class="button-group">
            <button class="close-btn">取消</button>
            <button class="save-btn">保存设置</button>
        </div>
    `;

        const saveBtn = manager.querySelector('.save-btn');
        const closeBtn = manager.querySelector('.close-btn');
        const autoSkipCheckbox = manager.querySelector('#auto-skip');
        const blockLiveCheckbox = manager.querySelector('#block-live');
        const hideCommentsCheckbox = manager.querySelector('#hide-comments');
        const blockAdsCheckbox = manager.querySelector('#block-ads');
        const debugModeCheckbox = manager.querySelector('#debug-mode');

        const closeManager = () => {
            overlay.remove();
            restoreKeyboard();
        };

        saveBtn.addEventListener('click', () => {
            autoSkip = autoSkipCheckbox.checked;
            blockLive = blockLiveCheckbox.checked;
            const oldHideComments = hideComments;
            const oldBlockAds = blockAds;
            const oldDebugMode = debugMode;
            hideComments = hideCommentsCheckbox.checked;
            blockAds = blockAdsCheckbox.checked;
            debugMode = debugModeCheckbox.checked;

            GM_setValue(STORAGE_PREFIX + 'auto_skip', autoSkip);
            GM_setValue(STORAGE_PREFIX + 'block_live', blockLive);
            GM_setValue(STORAGE_PREFIX + 'hide_comments', hideComments);
            GM_setValue(STORAGE_PREFIX + 'block_ads', blockAds);
            GM_setValue(STORAGE_PREFIX + 'debug_mode', debugMode);

            closeManager();
            showNotification('设置已保存');

            if (oldHideComments !== hideComments) {
                if (hideComments) {
                    hideCommentButtons();
                } else {
                    showCommentButtons();
                }
            }

            if (oldBlockAds !== blockAds) {
                if (blockAds && isJingxuanPage()) {
                    checkAndRemoveAds();
                } else if (!blockAds) {
                    showAdCards();
                }
            }

            if (oldDebugMode !== debugMode) {
                showNotification(debugMode ? '调试模式已开启' : '调试模式已关闭');
            }

            console.log('🔍 应用新设置，检查当前视频...');
            // 使用状态管理器而不是旧的全局变量
            stateManager.resetAll();
            setTimeout(() => {
                if (isJingxuanPage()) {
                    checkAndFilterJingxuanCards();
                } else {
                    immediateCheckCurrentVideo(); // 使用立即检查
                }
            }, 100);
        });

        closeBtn.addEventListener('click', closeManager);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeManager();
        });

        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                closeManager();
                document.removeEventListener('keydown', escHandler);
            }
        });

        overlay.appendChild(manager);
        document.body.appendChild(overlay);
    }

    // // 显示统计信息
    // function showStats() {
    //     takeOverKeyboard();

    //     const overlay = document.createElement('div');
    //     overlay.className = 'douyin-keyword-manager-overlay';

    //     const keywordStats = {};
    //     filterStats.details.forEach(detail => {
    //         keywordStats[detail.keyword] = (keywordStats[detail.keyword] || 0) + 1;
    //     });

    //     const topKeywords = Object.entries(keywordStats)
    //         .sort((a, b) => b[1] - a[1])
    //         .slice(0, 5);

    //     const manager = document.createElement('div');
    //     manager.className = 'douyin-keyword-manager';
    //     manager.innerHTML = `
    //     <h3>
    //         <span>📊</span>
    //         <span>过滤统计</span>
    //     </h3>
    //     <div class="stats-grid">
    //         <div class="stat-card">
    //             <div class="stat-number">${filterStats.total}</div>
    //             <div class="stat-label">已过滤视频</div>
    //         </div>
    //         <div class="stat-card">
    //             <div class="stat-number">${filterStats.adsBlocked}</div>
    //             <div class="stat-label">已屏蔽广告</div>
    //         </div>
    //         <div class="stat-card">
    //             <div class="stat-number">${filterStats.liveBlocked}</div>
    //             <div class="stat-label">已屏蔽直播</div>
    //         </div>
    //         <div class="stat-card">
    //             <div class="stat-number">${filterStats.commentsHidden}</div>
    //             <div class="stat-label">已隐藏评论</div>
    //         </div>
    //         <div class="stat-card">
    //             <div class="stat-number">${keywords.length}</div>
    //             <div class="stat-label">关键词数量</div>
    //         </div>
    //         <div class="stat-card">
    //             <div class="stat-number">${filterStats.authorsBlocked}</div>
    //             <div class="stat-label">作者屏蔽</div>
    //         </div>
    //         <div class="stat-card">
    //             <div class="stat-number">${filterStats.videoIdsBlocked}</div>
    //             <div class="stat-label">视频ID屏蔽</div>
    //         </div>
    //         <div class="stat-card">
    //             <div class="stat-number">${filterStats.timeFiltered}</div>
    //             <div class="stat-label">时间过滤</div>
    //         </div>
    //     </div>
    //     <div class="help-text">
    //         <div><strong>🔥 最常命中过滤条件：</strong></div>
    //         ${topKeywords.length > 0
    //             ? topKeywords.map(([k, count]) => `<div>• ${k}: ${count} 次</div>`).join('')
    //             : '<div style="color: var(--text-secondary);">暂无数据</div>'
    //         }
    //     </div>
    //     <div class="button-group">
    //         <button class="close-btn">关闭</button>
    //     </div>
    // `;

    //     const closeBtn = manager.querySelector('.close-btn');

    //     const closeManager = () => {
    //         overlay.remove();
    //         restoreKeyboard();
    //     };

    //     closeBtn.addEventListener('click', closeManager);
    //     overlay.addEventListener('click', (e) => {
    //         if (e.target === overlay) closeManager();
    //     });

    //     document.addEventListener('keydown', function escHandler(e) {
    //         if (e.key === 'Escape') {
    //             closeManager();
    //             document.removeEventListener('keydown', escHandler);
    //         }
    //     });

    //     overlay.appendChild(manager);
    //     document.body.appendChild(overlay);
    // }

    // 检查文本是否匹配关键词
    function isTextMatched(text) {
        for (const keyword of keywords) {
            if (keyword.startsWith('/') && keyword.endsWith('/')) {
                try {
                    const pattern = keyword.slice(1, -1);
                    const regex = new RegExp(pattern);
                    if (regex.test(text)) {
                        return keyword;
                    }
                } catch (e) {
                    console.warn('无效的正则表达式:', keyword);
                }
            } else {
                if (text.includes(keyword)) {
                    return keyword;
                }
            }
        }
        return null;
    }

    // 获取视频信息文本
    function getVideoInfoText() {
        // 如果是推荐页，使用新的选择器
        if (window.location.href.includes('recommend=1')) {
            const accountElement = document.querySelector('.account-name-text');
            const titleElement = document.querySelector('.title[data-e2e="video-desc"]');

            let text = '';
            if (accountElement) text += accountElement.innerText || accountElement.textContent;
            if (titleElement) text += ' ' + (titleElement.innerText || titleElement.textContent);

            console.log('🎯 推荐页获取到的文本:', text);
            return text;
        }

        // 原有的普通页面逻辑保持不变
        const currentVideo = getCurrentVideoInfo();
        if (!currentVideo || !currentVideo.element) return '';

        const videoInfoWrap = currentVideo.element;
        const titleElement = videoInfoWrap.querySelector('.title');
        const accountElement = videoInfoWrap.querySelector('.account-name-text');

        let text = '';
        if (titleElement) text += titleElement.innerText || titleElement.textContent;
        if (accountElement) text += ' ' + (accountElement.innerText || accountElement.textContent);

        return text;
    }

    // 触发不感兴趣
    function triggerDisinterest() {
        const event = new KeyboardEvent('keydown', {
            key: 'r',
            code: 'KeyR',
            keyCode: 82,
            which: 82,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }

    // 检测并处理直播
    function checkAndBlockLive() {
        if (!blockLive) return false;

        const currentVideo = getCurrentVideoInfo();
        if (!currentVideo) return false;

        const liveTag = currentVideo.element.closest('[data-e2e-vid]').querySelector('.semi-tag[aria-label*="直播"]');
        if (!liveTag) return false;

        console.log('📺 检测到直播内容');

        triggerDisinterest();

        setTimeout(() => {
            const optionContainer = document.querySelector('#TSWKLC4w');
            if (optionContainer) {
                const options = optionContainer.querySelectorAll('div');
                for (const option of options) {
                    if (option.textContent.includes('不想看直播')) {
                        console.log('🚫 点击"不想看直播"');
                        option.click();
                        filterStats.liveBlocked++;
                        return true;
                    }
                }
            }
        }, 600);

        return true;
    }

    // 获取当前视频作者
    function getCurrentAuthor() {
        if (window.location.href.includes('recommend=1')) {
            console.log('🔍 开始获取当前视频作者...');

            // 方法1: 从当前视频容器获取
            const currentVideoInfo = getCurrentVideoInfo();
            if (currentVideoInfo && currentVideoInfo.element) {
                const authorElement = currentVideoInfo.element.querySelector('.account-name-text');
                if (authorElement) {
                    const author = authorElement.innerText || authorElement.textContent;
                    console.log('✅ 从视频容器获取作者:', author);
                    return author;
                }
            }

            // 方法2: 通过可见性获取
            const authorElements = document.querySelectorAll('.account-name-text');
            for (let element of authorElements) {
                const rect = element.getBoundingClientRect();
                if (rect.top >= 0 && rect.top < window.innerHeight) {
                    const author = element.innerText || element.textContent;
                    console.log('✅ 通过可见性获取作者:', author);
                    return author;
                }
            }

            console.log('❌ 未找到作者信息');
            return '';
        }
        return '';
    }

    // 获取当前视频描述
    function getCurrentDescription() {
        if (window.location.href.includes('recommend=1')) {
            console.log('🔍 开始获取当前视频简介...');

            // 方法1: 从当前视频容器获取
            const currentVideoInfo = getCurrentVideoInfo();
            if (currentVideoInfo && currentVideoInfo.element) {
                const titleElement = currentVideoInfo.element.querySelector('.title[data-e2e="video-desc"]');
                if (titleElement) {
                    const description = titleElement.innerText || titleElement.textContent;
                    console.log('✅ 从视频容器获取简介:', description.substring(0, 50) + '...');
                    return description;
                }
            }

            // 方法2: 通过可见性获取
            const titleElements = document.querySelectorAll('.title[data-e2e="video-desc"]');
            for (let element of titleElements) {
                const rect = element.getBoundingClientRect();
                if (rect.top >= 0 && rect.top < window.innerHeight) {
                    const description = element.innerText || element.textContent;
                    console.log('✅ 通过可见性获取简介:', description.substring(0, 50) + '...');
                    return description;
                }
            }

            console.log('❌ 未找到简介信息');
            return '';
        }
        return '';
    }

    // 检查并过滤
    async function checkAndFilter() {
        const currentVideoId = stateManager.getCurrentVideoId();

        console.log('🔍 常规检查视频...', {
            currentVideoId: currentVideoId,
            lastCheckedVideoId: stateManager.getLastCheckedVideoId(),
            inCooldown: stateManager.isInCooldown(),
            isProcessing: stateManager.isProcessing()
        });

        // 状态检查
        if (stateManager.isInCooldown()) {
            console.log('⏸️ 冷却期中，跳过检查');
            return;
        }

        if (stateManager.isProcessing()) {
            console.log('⏸️ 已有处理在进行中，跳过检查');
            return;
        }

        // 重复检查保护
        if (currentVideoId && currentVideoId === stateManager.getLastCheckedVideoId()) {
            console.log('⏸️ 重复视频，跳过检查');
            return;
        }

        if (checkAndBlockLive()) {
            console.log('📺 已处理直播内容');
            stateManager.setCooldown();
            return;
        }

        if (!autoSkip) {
            console.log('⏸️ 自动跳过已关闭，跳过检查');
            return;
        }

        const videoText = getVideoInfoText();
        console.log('📝 视频文本内容:', videoText);

        if (!videoText) {
            console.log('⚠️ 未获取到视频文本');
            return;
        }

        // 获取作者和描述信息
        const author = getCurrentAuthor();
        const description = getCurrentDescription();

        console.log('🔍 检查条件:', {
            author: author,
            isAuthorBlocked: author ? isAuthorBlocked(author) : false,
            hasMatchedKeyword: !!isTextMatched(videoText)
        });

        stateManager.setProcessing(true);

        try {
            // 检查作者屏蔽
            if (window.location.href.includes('recommend=1')) {
                if (author && isAuthorBlocked(author)) {
                    console.log(`✅ 匹配作者屏蔽! 作者: ${author}`);

                    filterStats.total++;
                    filterStats.authorsBlocked++;
                    filterStats.details.push({
                        keyword: `作者: ${author}`,
                        content: videoText.substring(0, 50),
                        timestamp: new Date().toLocaleTimeString()
                    });

                    if (debugMode) {
                        console.log('🐛 进入作者屏蔽调试流程');
                        await showDebugPanel(
                            `作者屏蔽: ${author}`,
                            author,
                            description,
                            `作者: ${author}`
                        );
                    } else {
                        stateManager.setCooldown();
                        setTimeout(() => {
                            triggerDisinterest();
                            console.log('🚫 已触发不感兴趣（作者屏蔽）');
                            showNotification(`已屏蔽作者 ${author}`);
                        }, 300);
                    }
                    return;
                }
            }

            const matchedKeyword = isTextMatched(videoText);

            if (matchedKeyword) {
                console.log(`✅ 匹配成功! 关键词: ${matchedKeyword}`);

                filterStats.total++;
                filterStats.details.push({
                    keyword: matchedKeyword,
                    content: videoText.substring(0, 50),
                    timestamp: new Date().toLocaleTimeString()
                });

                if (debugMode) {
                    console.log('🐛 进入关键词屏蔽调试流程');
                    await showDebugPanel(
                        `关键词匹配: ${matchedKeyword}`,
                        author,
                        description,
                        matchedKeyword
                    );
                } else {
                    stateManager.setCooldown();
                    setTimeout(() => {
                        triggerDisinterest();
                        console.log('🚫 已触发不感兴趣');
                        showNotification(`已屏蔽视频`);
                    }, 300);
                }
            } else {
                console.log('❌ 未匹配任何关键词');
            }
        } finally {
            stateManager.setProcessing(false);
        }
    }

    // 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 获取当前视频ID
    function getCurrentVideoId() {
        return stateManager.getCurrentVideoId();
    }

    function initializeState() {
        stateManager.resetAll();
        console.log('✅ 状态管理器初始化完成');
    }


    // 检查并过滤的包装函数
    function checkAndFilterWithDebounce() {
        const currentVideoInfo = getCurrentVideoInfo();
        const currentVideoId = currentVideoInfo ? currentVideoInfo.videoId : null;

        // 更新当前视频ID
        stateManager.setCurrentVideoId(currentVideoId);

        console.log('🔄 包装函数检查:', {
            currentVideoId: currentVideoId,
            lastCheckedVideoId: stateManager.getLastCheckedVideoId(),
            inCooldown: stateManager.isInCooldown(),
            isProcessing: stateManager.isProcessing()
        });

        if (stateManager.isInCooldown()) {
            console.log('⏸️ 包装函数: 冷却期中，跳过检查');
            return;
        }

        if (stateManager.isProcessing()) {
            console.log('⏸️ 包装函数: 处理中，跳过检查');
            return;
        }

        // 重复检查保护
        if (currentVideoId && currentVideoId === stateManager.getLastCheckedVideoId()) {
            console.log('⏸️ 包装函数: 重复视频，跳过检查');
            return;
        }

        // 更新最后检查的视频ID
        stateManager.setLastCheckedVideoId(currentVideoId);

        setTimeout(async () => {
            await checkAndFilter();
            if (hideComments) {
                hideCommentButtons();
            }
        }, 300);
    }

    // 强制刷新当前页面状态
    function forceRefreshPageState() {
        console.log('🔄 强制刷新页面状态');

        if (window.location.href.includes('recommend=1')) {
            // 重置所有状态
            resetAllDetectionStates();

            // 模拟轻微滚动以刷新内容
            const scrollY = window.scrollY;
            window.scrollTo(0, scrollY + 1);
            setTimeout(() => {
                window.scrollTo(0, scrollY);

                // 触发重新检查
                setTimeout(() => {
                    console.log('🔍 强制刷新后重新检查');
                    lastCheckedVideoId = null;
                    checkAndFilterWithDebounce();
                }, 200);
            }, 100);
        }
    }

    // 获取当前激活的视频信息
    function getCurrentVideoInfo() {
        // 如果是推荐页
        if (window.location.href.includes('recommend=1')) {
            console.log('🎯 开始检测推荐页当前视频...');

            // 方法1: 通过播放状态检测
            let video = document.querySelector('video');
            let activeVideoContainer = null;

            if (video) {
                // 检查视频是否正在播放或可见
                const rect = video.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0 &&
                    rect.top < window.innerHeight && rect.bottom > 0;

                if (!video.paused || isVisible) {
                    // 找到包含作者信息的最近容器
                    activeVideoContainer = findVideoContainerWithAuthor(video);
                    console.log('🎯 通过播放状态找到视频容器:', !!activeVideoContainer);
                }
            }

            // 方法2: 如果方法1失败，通过滚动位置检测
            if (!activeVideoContainer) {
                activeVideoContainer = findVisibleVideoContainer();
                console.log('🎯 通过滚动位置找到视频容器:', !!activeVideoContainer);
            }

            // 方法3: 如果方法2失败，通过active状态检测
            if (!activeVideoContainer) {
                activeVideoContainer = document.querySelector('[data-e2e="feed-active-video"]');
                console.log('🎯 通过active状态找到视频容器:', !!activeVideoContainer);
            }

            if (activeVideoContainer) {
                const videoId = activeVideoContainer.getAttribute('data-e2e-vid') || '';
                return {
                    element: activeVideoContainer,
                    videoId: videoId
                };
            }

            console.log('❌ 未找到当前视频容器');
            return null;
        }

        // 原有的普通页面逻辑保持不变
        const activeVideo = document.querySelector('[data-e2e="feed-active-video"]');
        if (activeVideo) {
            const videoInfoWrap = activeVideo.querySelector('#video-info-wrap');
            if (videoInfoWrap) {
                return {
                    element: videoInfoWrap,
                    videoId: videoInfoWrap.getAttribute('data-e2e-aweme-id')
                };
            }
        }

        const playingVideo = document.querySelector('.xgplayer-playing, .xgplayer-pause');
        if (playingVideo) {
            const videoContainer = playingVideo.closest('[data-e2e-vid]');
            if (videoContainer) {
                const videoInfoWrap = videoContainer.querySelector('#video-info-wrap');
                if (videoInfoWrap) {
                    return {
                        element: videoInfoWrap,
                        videoId: videoInfoWrap.getAttribute('data-e2e-aweme-id')
                    };
                }
            }
        }

        return null;
    }

    // 通过播放的视频元素找到包含作者信息的容器
    function findVideoContainerWithAuthor(videoElement) {
        let container = videoElement;

        // 向上查找包含作者信息的容器
        while (container && container !== document.body) {
            // 检查当前容器是否包含作者信息
            const authorElement = container.querySelector('.account-name-text');
            if (authorElement) {
                console.log('✅ 找到包含作者信息的容器');
                return container;
            }

            // 检查是否到达视频卡片边界
            if (container.hasAttribute('data-e2e-vid') ||
                container.classList.contains('xg-container') ||
                container.querySelector('[data-e2e-vid]')) {
                console.log('✅ 找到视频卡片边界');
                return container;
            }

            container = container.parentElement;
        }

        return null;
    }

    // 通过滚动位置找到当前可见的视频容器
    function findVisibleVideoContainer() {
        const videoContainers = document.querySelectorAll('[data-e2e-vid], .xg-container');
        const viewportCenter = window.innerHeight / 2;

        for (let container of videoContainers) {
            const rect = container.getBoundingClientRect();

            // 检查容器是否在视口中心附近
            if (rect.top <= viewportCenter && rect.bottom >= viewportCenter) {
                console.log('✅ 通过视口位置找到视频容器');
                return container;
            }
        }

        return null;
    }

    const debouncedCheck = debounce(checkAndFilterWithDebounce, 100);

    // 监听滚动和视频切换
    function observeVideoChanges() {
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            let shouldHideComments = false;
            let shouldCheckJingxuan = false;
            let shouldCheckAds = false;
            let shouldRefresh = false;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    Array.from(mutation.addedNodes).forEach(node => {
                        if (node.nodeType === 1) {
                            // 检测视频元素的变化
                            if (node.tagName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
                                console.log('🎯 检测到新的视频元素');
                                shouldCheck = true;
                            }

                            // 检测作者信息的变化
                            if (node.querySelector && node.querySelector('.account-name-text')) {
                                console.log('🎯 检测到作者信息变化');
                                shouldCheck = true;
                            }

                            // 检测简介信息的变化
                            if (node.querySelector && node.querySelector('.title[data-e2e="video-desc"]')) {
                                console.log('🎯 检测到简介信息变化');
                                shouldCheck = true;
                            }

                            // 普通视频页面检测
                            if (node.hasAttribute('data-e2e-vid') ||
                                node.querySelector && node.querySelector('[data-e2e-vid]')) {
                                shouldCheck = true;
                                shouldHideComments = true;
                            }

                            // 推荐页特定检测
                            if (window.location.href.includes('recommend=1')) {
                                // 检测视频元素变化
                                if (node.tagName === 'VIDEO' ||
                                    node.querySelector && node.querySelector('video')) {
                                    shouldCheck = true;
                                    console.log('🎯 推荐页检测到视频元素变化');
                                }

                                // 检测用户信息变化
                                if (node.classList && (
                                    node.classList.contains('account') ||
                                    node.classList.contains('video-create-time') ||
                                    node.classList.contains('title') ||
                                    node.textContent && (
                                        node.textContent.includes('@') ||
                                        node.textContent.includes('作者') ||
                                        node.textContent.includes('发布')
                                    )
                                )) {
                                    shouldCheck = true;
                                    console.log('🎯 推荐页检测到用户信息或时间元素更新');
                                }

                                // 检测整个卡片容器变化
                                if (node.querySelector && node.querySelector('.account-name-text, .title[data-e2e="video-desc"]')) {
                                    shouldCheck = true;
                                    console.log('🎯 推荐页检测到视频卡片内容更新');
                                }
                            }

                            // 精选页面视频卡片检测
                            if (node.classList && node.classList.contains('discover-video-card-item') ||
                                node.querySelector && node.querySelector('.discover-video-card-item')) {
                                shouldCheckJingxuan = true;
                                shouldCheckAds = true;
                                shouldRefresh = true; // 有新卡片加入，可能需要刷新
                            }

                            if (node.hasAttribute('data-e2e') &&
                                node.getAttribute('data-e2e') === 'feed-comment-icon') {
                                shouldHideComments = true;
                            }

                            // 检测空卡片
                            if (node.classList && node.classList.contains('pAWPzs6W') ||
                                node.querySelector && node.querySelector('.pAWPzs6W')) {
                                setTimeout(() => {
                                    enhancedCheckAndLoadLazyCards();
                                    checkPageStateAndLoad(); // 检查整体状态
                                }, 300);
                            }

                            // 检测新加载的内容卡片
                            if (node.classList && node.classList.contains('discover-video-card-item') &&
                                !node.classList.contains('pAWPzs6W')) {
                                console.log('🎉 检测到新加载的视频卡片');
                                // 短暂延迟后检查页面状态
                                setTimeout(() => {
                                    checkPageStateAndLoad();
                                }, 200);
                            }
                        }
                    });
                }

                if (mutation.type === 'attributes' &&
                    (mutation.attributeName === 'data-e2e-aweme-id' ||
                        mutation.attributeName === 'data-e2e-vid' ||
                        mutation.attributeName === 'class')) {
                    shouldCheck = true;
                    shouldHideComments = true;
                }
            }

            if (shouldCheck && !isJingxuanPage()) {
                debouncedCheck();
            }

            if (shouldCheckJingxuan && isJingxuanPage()) {
                debouncedCheckJingxuan();
            }

            if (shouldCheckAds && isJingxuanPage() && blockAds) {
                debouncedCheckAds();
            }

            if (shouldHideComments && hideComments) {
                setTimeout(hideCommentButtons, 200);
            }

            // 如果需要刷新且有新内容，触发刷新
            if (shouldRefresh && isJingxuanPage()) {
                setTimeout(() => {
                    console.log('🔄 检测到新内容，触发智能刷新...');
                    triggerScrollRefresh();
                }, 500);
            }
        });

        addContextMenuListeners();

        const waitForElement = setInterval(() => {
            const videoContainer = document.querySelector('[data-e2e="feed-active-video"]');
            const jingxuanCards = document.querySelectorAll('.discover-video-card-item');

            if (videoContainer || jingxuanCards.length > 0) {
                clearInterval(waitForElement);

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['data-e2e-aweme-id', 'data-e2e-vid', 'class', 'data-e2e']
                });

                // 根据页面类型执行初始检查
                if (isJingxuanPage()) {
                    console.log('🎯 [精选页面] 检测到精选页面，开始初始过滤...');
                    if (blockAds) {
                        checkAndRemoveAds();
                    }
                    checkAndFilterJingxuanCards();
                } else {
                    checkAndFilter();
                    if (hideComments) {
                        hideCommentButtons();
                    }
                }

                console.log('✅ 抖音综合屏蔽已启动');
            }
        }, 500);

        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                if (isJingxuanPage()) {
                    if (blockAds) {
                        debouncedCheckAds();
                    }
                    debouncedCheckJingxuan();

                    // 滚动时检查状态
                    scrollManager.lastScrollY = window.scrollY;
                    checkPageStateAndLoad();
                } else {
                    debouncedCheck();
                }
            }, 400);
        }, { passive: true });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' || e.key === 'R') {
                setTimeout(() => {
                    stateManager.resetAll(); // 使用状态管理器重置
                    if (isJingxuanPage()) {
                        if (blockAds) {
                            checkAndRemoveAds();
                        }
                        checkAndFilterJingxuanCards();
                    } else {
                        checkAndFilterWithDebounce();
                    }
                }, 100);
            }
        });

        // 监听URL变化（用于检测页面切换）
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                console.log('🔄 页面URL变化:', url);

                setTimeout(() => {
                    if (isJingxuanPage()) {
                        console.log('🎯 切换到精选页面');
                        if (blockAds) {
                            checkAndRemoveAds();
                        }
                        checkAndFilterJingxuanCards();
                    } else {
                        console.log('🎯 切换到普通页面');
                        stateManager.resetAll(); // 使用状态管理器重置
                        checkAndFilterWithDebounce();
                    }
                }, 500);
            }
        }).observe(document, { subtree: true, childList: true });

        setInterval(() => {
            if (isJingxuanPage()) {
                const emptyCards = document.querySelectorAll('.discover-video-card-item.pAWPzs6W');
                const visibleCards = document.querySelectorAll('.discover-video-card-item:not([style*="display: none"]):not(.pAWPzs6W)');

                if (emptyCards.length > 5 && visibleCards.length < 10) {
                    console.log('⏰ 定时检查: 需要加载更多内容');
                    checkPageStateAndLoad();
                }
            }
        }, 10000);
    }

    // 检查是否在冷却期内
    function isInCooldown() {
        return stateManager.isInCooldown();
    }

    // 设置冷却时间
    function setCooldown() {
        stateManager.setCooldown();
    }

    // 检测当前是否在精选页面
    function isJingxuanPage() {
        const path = window.location.pathname;
        return path === '/jingxuan' || path.startsWith('/jingxuan/');
    }

    // 获取精选页面的视频卡片标题文本
    function getJingxuanCardTitle(card) {
        // 查找标题元素
        const titleElement = card.querySelector('.bWzvoR9D');
        if (titleElement) {
            return titleElement.textContent || titleElement.innerText || '';
        }
        return '';
    }

    // 隐藏精选页面的视频卡片
    function hideJingxuanCard(card, matchedKeyword) {
        if (card.style.display === 'none') return false;

        card.style.display = 'none';
        card.classList.add('douyin-filtered-card');
        card.setAttribute('data-filtered-keyword', matchedKeyword);

        console.log(`🚫 [精选页面] 隐藏视频卡片，匹配关键词: ${matchedKeyword}`);
        return true;
    }

    // 显示所有被隐藏的精选页面视频卡片
    function showJingxuanCards() {
        const filteredCards = document.querySelectorAll('.douyin-filtered-card');
        let count = 0;

        filteredCards.forEach(card => {
            card.style.display = '';
            card.classList.remove('douyin-filtered-card');
            card.removeAttribute('data-filtered-keyword');
            count++;
        });

        if (count > 0) {
            console.log(`✅ [精选页面] 恢复显示 ${count} 个视频卡片`);
        }
        return count;
    }

    // 检查并过滤精选页面的视频卡片
    function checkAndFilterJingxuanCards() {
        if (!isJingxuanPage()) return;

        console.log('🔍 [精选页面] 开始检查视频卡片...');

        // 首先移除广告
        if (blockAds) {
            checkAndRemoveAds();
        }

        // 查找所有视频卡片
        const videoCards = document.querySelectorAll('.Xyhun5Yc.discover-video-card-item');

        if (videoCards.length === 0) {
            console.log('⚠️ [精选页面] 未找到视频卡片');
            return;
        }

        console.log(`📋 [精选页面] 找到 ${videoCards.length} 个视频卡片`);

        let filteredCount = 0;
        let needsRefresh = false;

        videoCards.forEach((card, index) => {
            // 跳过已经被隐藏的卡片（包括广告）
            if (card.style.display === 'none') return;

            // 跳过广告卡片
            if (isAdCard(card)) return;

            const titleText = getJingxuanCardTitle(card);
            const author = getJingxuanCardAuthor(card);
            const videoId = getJingxuanCardVideoId(card);
            const publishTime = getJingxuanCardPublishTime(card);

            console.log(`📝 [精选页面] 卡片 ${index} - 标题: ${titleText.substring(0, 50)}..., 作者: ${author}, ID: ${videoId}, 时间: ${publishTime}`);

            let matchedKeyword = null;
            let filterReason = '';

            // 1. 检查视频ID屏蔽
            if (isVideoIdBlocked(videoId)) {
                filterReason = `视频ID: ${videoId}`;
                console.log(`✅ [精选页面] 卡片 ${index} 匹配视频ID屏蔽: ${videoId}`);
            }
            // 2. 检查作者屏蔽
            else if (isAuthorBlocked(author)) {
                filterReason = `作者: ${author}`;
                console.log(`✅ [精选页面] 卡片 ${index} 匹配作者屏蔽: ${author}`);
            }
            // 3. 检查时间过滤
            else if (shouldFilterByTime(publishTime)) {
                filterReason = `发布时间: ${publishTime.toLocaleDateString()} (超过${timeFilter.days}天)`;
                console.log(`✅ [精选页面] 卡片 ${index} 匹配时间过滤: ${publishTime.toLocaleDateString()}`);
            }
            // 4. 检查关键词匹配
            else {
                matchedKeyword = isTextMatched(titleText);
                if (matchedKeyword) {
                    filterReason = `关键词: ${matchedKeyword}`;
                    console.log(`✅ [精选页面] 卡片 ${index} 匹配关键词: ${matchedKeyword}`);
                }
            }

            if (filterReason) {
                if (enhancedSmartRemoveCard(card, filterReason)) {
                    filteredCount++;
                    filterStats.total++;

                    // 更新具体统计
                    if (filterReason.includes('视频ID')) {
                        filterStats.videoIdsBlocked++;
                    } else if (filterReason.includes('作者')) {
                        filterStats.authorsBlocked++;
                    } else if (filterReason.includes('发布时间')) {
                        filterStats.timeFiltered++;
                    }

                    filterStats.details.push({
                        keyword: filterReason,
                        content: titleText.substring(0, 50),
                        author: author,
                        videoId: videoId,
                        timestamp: new Date().toLocaleTimeString(),
                        page: 'jingxuan'
                    });
                }
            }
        });

        if (filteredCount > 0) {
            console.log(`🎯 [精选页面] 成功过滤 ${filteredCount} 个视频卡片`);
            showNotification(`已过滤 ${filteredCount} 个精选视频`);
        } else {
            console.log('❌ [精选页面] 未匹配任何过滤条件');
        }

        // 检查并触发未加载卡片的加载
        setTimeout(() => {
            enhancedCheckAndLoadLazyCards();

            // 检查页面整体状态
            setTimeout(() => {
                checkPageStateAndLoad();
            }, 500);
        }, 300);
    }

    // 检测视频卡片是否为广告
    function isAdCard(card) {
        // 方法1: 检查是否有广告标签
        const adLabel = card.querySelector('.dTOXLecF');
        if (adLabel && adLabel.textContent.includes('广告')) {
            return true;
        }

        // 方法2: 检查 data-aweme-id 是否为空（广告通常为空）
        const awemeId = card.getAttribute('data-aweme-id');
        if (awemeId === '' || awemeId === null) {
            // 进一步确认是否有广告特征
            const hasAdImage = card.querySelector('.auIPeWle');
            const hasAdText = card.querySelector('.A3iwm53Y');
            if (hasAdImage || hasAdText) {
                return true;
            }
        }

        // 方法3: 检查是否包含广告特有的类名
        if (card.querySelector('.auIPeWle') && card.querySelector('.dTOXLecF')) {
            return true;
        }

        return false;
    }

    // 隐藏广告卡片
    function hideAdCard(card) {
        if (card.style.display === 'none') return false;

        card.style.display = 'none';
        card.classList.add('douyin-filtered-ad');
        card.setAttribute('data-filtered-reason', 'advertisement');

        console.log('🚫 [精选页面] 隐藏广告卡片');
        return true;
    }

    // 显示所有被隐藏的广告卡片
    function showAdCards() {
        const filteredAds = document.querySelectorAll('.douyin-filtered-ad');
        let count = 0;

        filteredAds.forEach(card => {
            card.style.display = '';
            card.classList.remove('douyin-filtered-ad');
            card.removeAttribute('data-filtered-reason');
            count++;
        });

        if (count > 0) {
            console.log(`✅ [精选页面] 恢复显示 ${count} 个广告卡片`);
        }
        return count;
    }

    // 检查并移除精选页面的广告
    function checkAndRemoveAds() {
        if (!isJingxuanPage() || !blockAds) return;

        console.log('🔍 [精选页面] 开始检查广告...');

        // 查找所有视频卡片
        const videoCards = document.querySelectorAll('.Xyhun5Yc.discover-video-card-item');

        if (videoCards.length === 0) {
            return;
        }

        let adCount = 0;

        videoCards.forEach((card, index) => {
            // 跳过已经被隐藏的卡片
            if (card.style.display === 'none') return;

            if (isAdCard(card)) {
                console.log(`📢 [精选页面] 卡片 ${index} 识别为广告`);

                if (hideAdCard(card)) {
                    adCount++;
                    filterStats.adsBlocked++;
                    filterStats.details.push({
                        keyword: '[广告]',
                        content: '广告内容',
                        timestamp: new Date().toLocaleTimeString(),
                        page: 'jingxuan'
                    });
                }
            }
        });

        if (adCount > 0) {
            console.log(`🎯 [精选页面] 成功屏蔽 ${adCount} 个广告`);
            showNotification(`已屏蔽 ${adCount} 个广告`);
        }
    }

    // 保存关键词配置并立即应用过滤
    function saveKeywordsAndFilter(newKeywords) {
        keywords = newKeywords;
        GM_setValue(STORAGE_PREFIX + 'keywords', keywords);

        console.log('✅ 关键词已更新:', keywords);
        console.log('🔍 立即应用新关键词到精选页面...');

        // 如果在精选页面，使用批量处理
        if (isJingxuanPage()) {
            // 先显示所有之前隐藏的卡片
            showJingxuanCards();
            setTimeout(() => {
                // 使用批量处理确保内容刷新
                batchProcessWithRefresh((count) => {
                    showNotification(`已应用 ${keywords.length} 个关键词，过滤了 ${count} 个视频`);
                });
            }, 100);
        } else {
            // 在普通页面，重置检查状态
            lastCheckedVideoId = null;
            setTimeout(() => {
                checkAndFilter();
            }, 100);
            showNotification(`已保存 ${keywords.length} 个关键词`);
        }
    }

    // 设置关键词管理器保存按钮的事件处理器
    function setupKeywordManagerSaveHandler() {
        const saveBtn = document.querySelector('.douyin-keyword-manager .save-btn');
        if (saveBtn) {
            // 移除旧的事件监听器
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

            // 添加新的事件监听器
            newSaveBtn.addEventListener('click', function () {
                const textarea = document.querySelector('#keyword-textarea');
                if (textarea) {
                    const newKeywords = textarea.value
                        .split('\n')
                        .map(k => k.trim())
                        .filter(k => k.length > 0);

                    // 使用新的保存函数
                    saveKeywordsAndFilter(newKeywords);

                    // 关闭管理器
                    const overlay = document.querySelector('.douyin-keyword-manager-overlay');
                    if (overlay) {
                        overlay.remove();
                        restoreKeyboard();
                    }
                }
            });
        }
    }

    // 模拟滚动触发刷新
    function triggerScrollRefresh() {
        console.log('🔄 模拟滚动触发刷新...');

        // 方法1: 轻微滚动触发
        const scrollY = window.scrollY;
        window.scrollTo(0, scrollY + 10);
        setTimeout(() => {
            window.scrollTo(0, scrollY);
        }, 100);

        // 方法2: 触发滚动事件
        const scrollEvent = new Event('scroll', { bubbles: true });
        window.dispatchEvent(scrollEvent);

        // 方法3: 触发触摸事件（移动端模拟）
        const touchEvent = new Event('touchmove', { bubbles: true });
        document.dispatchEvent(touchEvent);
    }

    // 智能移除卡片并触发刷新
    function smartRemoveCard(card, matchedKeyword) {
        if (card.style.display === 'none') return false;

        console.log(`🚫 [精选页面] 隐藏视频卡片，匹配关键词: ${matchedKeyword}`);

        // 记录卡片位置信息
        const rect = card.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        // 隐藏卡片
        card.style.display = 'none';
        card.classList.add('douyin-filtered-card');
        card.setAttribute('data-filtered-keyword', matchedKeyword);

        // 如果隐藏的卡片在可视区域内，触发刷新
        if (isInViewport) {
            console.log('👀 隐藏的卡片在可视区域内，触发刷新...');
            setTimeout(() => {
                triggerScrollRefresh();

                // 延迟检查新内容
                setTimeout(() => {
                    if (isJingxuanPage()) {
                        checkAndFilterJingxuanCards();
                    }
                }, 500);
            }, 200);
        }

        return true;
    }

    // 批量处理时的智能刷新
    function batchProcessWithRefresh(callback) {
        console.log('🔄 批量处理开始，启用智能刷新...');

        let processedCount = 0;
        const maxBatchSize = 3; // 每批处理的最大数量

        // 查找所有视频卡片
        const videoCards = document.querySelectorAll('.Xyhun5Yc.discover-video-card-item:not([style*="display: none"])');

        const processBatch = (startIndex) => {
            let batchCount = 0;

            for (let i = startIndex; i < videoCards.length && batchCount < maxBatchSize; i++) {
                const card = videoCards[i];
                if (card.style.display !== 'none' && !isAdCard(card)) {
                    const titleText = getJingxuanCardTitle(card);
                    if (titleText) {
                        const matchedKeyword = isTextMatched(titleText);
                        if (matchedKeyword) {
                            if (smartRemoveCard(card, matchedKeyword)) {
                                processedCount++;
                                batchCount++;
                                filterStats.total++;
                                filterStats.details.push({
                                    keyword: matchedKeyword,
                                    content: titleText.substring(0, 50),
                                    timestamp: new Date().toLocaleTimeString(),
                                    page: 'jingxuan'
                                });
                            }
                        }
                    }
                }
            }

            console.log(`✅ 处理了 ${batchCount} 个卡片，总共 ${processedCount} 个`);

            // 如果还有卡片需要处理，延迟后继续
            if (startIndex + batchCount < videoCards.length) {
                console.log('🔄 批次处理完成，准备下一批...');
                setTimeout(() => {
                    triggerScrollRefresh();
                    setTimeout(() => {
                        processBatch(startIndex + batchCount);
                    }, 800);
                }, 500);
            } else {
                console.log(`🎯 批量处理完成，总共过滤 ${processedCount} 个视频卡片`);
                showNotification(`批量过滤完成，共 ${processedCount} 个视频`);

                if (callback) callback(processedCount);
            }
        };

        processBatch(0);
    }

    // 强制刷新精选页面内容
    function forceRefreshJingxuan() {
        if (!isJingxuanPage()) return;

        console.log('🔄 强制刷新精选页面内容...');

        // 多种刷新方式组合
        triggerScrollRefresh();

        // 模拟用户交互
        setTimeout(() => {
            // 触发resize事件
            window.dispatchEvent(new Event('resize'));

            // 触发visibilitychange事件
            document.dispatchEvent(new Event('visibilitychange'));

            // 模拟鼠标移动
            const mouseMoveEvent = new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                clientX: 100,
                clientY: 100
            });
            document.dispatchEvent(mouseMoveEvent);
        }, 300);

        // 延迟重新检查
        setTimeout(() => {
            checkAndFilterJingxuanCards();
        }, 1000);
    }

    // 获取作者名称（精选页面）
    function getJingxuanCardAuthor(card) {
        const authorElement = card.querySelector('.H0ZV35Qb .i1udsuGn');
        if (authorElement) {
            return authorElement.textContent || authorElement.innerText || '';
        }
        return '';
    }

    // 获取视频ID（精选页面）
    function getJingxuanCardVideoId(card) {
        return card.getAttribute('data-aweme-id') || '';
    }

    // 获取发布时间（精选页面）
    function getJingxuanCardPublishTime(card) {
        const timeElement = card.querySelector('.RIr_dcq4');
        if (timeElement) {
            const timeText = timeElement.textContent || timeElement.innerText || '';
            // 解析时间文本，如 "10月26日"
            return parseTimeText(timeText);
        }
        return null;
    }

    // 解析时间文本
    function parseTimeText(timeText) {
        if (!timeText) return null;

        // 处理相对时间格式，如 "昨天", "3小时前" 等
        if (timeText.includes('前') || timeText === '昨天') {
            return parseRelativeTime(timeText);
        }

        // 处理绝对时间格式，如 "10月26日", "2023年10月26日"
        return parseAbsoluteTime(timeText);
    }

    // 解析相对时间
    function parseRelativeTime(timeText) {
        const now = new Date();

        if (timeText === '昨天') {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            return yesterday;
        }

        if (timeText.includes('小时前')) {
            const hours = parseInt(timeText);
            if (!isNaN(hours)) {
                const time = new Date(now);
                time.setHours(time.getHours() - hours);
                return time;
            }
        }

        if (timeText.includes('天前')) {
            const days = parseInt(timeText);
            if (!isNaN(days)) {
                const time = new Date(now);
                time.setDate(time.getDate() - days);
                return time;
            }
        }

        return null;
    }

    // 解析绝对时间
    function parseAbsoluteTime(timeText) {
        const now = new Date();
        const currentYear = now.getFullYear();

        // 匹配 "月日" 格式，如 "10月26日"
        const monthDayMatch = timeText.match(/(\d{1,2})月(\d{1,2})日/);
        if (monthDayMatch) {
            const month = parseInt(monthDayMatch[1]) - 1; // 月份从0开始
            const day = parseInt(monthDayMatch[2]);
            return new Date(currentYear, month, day);
        }

        // 匹配 "年月日" 格式，如 "2023年10月26日"
        const fullDateMatch = timeText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (fullDateMatch) {
            const year = parseInt(fullDateMatch[1]);
            const month = parseInt(fullDateMatch[2]) - 1;
            const day = parseInt(fullDateMatch[3]);
            return new Date(year, month, day);
        }

        return null;
    }

    // 检查是否应该根据时间过滤
    function shouldFilterByTime(publishTime) {
        if (!timeFilter.enabled || !publishTime) return false;

        const now = new Date();
        const timeDiff = now.getTime() - publishTime.getTime();
        const dayDiff = timeDiff / (1000 * 60 * 60 * 24);

        return dayDiff > timeFilter.days;
    }

    // 检查作者是否在屏蔽列表
    function isAuthorBlocked(author) {
        return blockAuthors.some(blockedAuthor =>
            author.toLowerCase().includes(blockedAuthor.toLowerCase())
        );
    }

    // 检查视频ID是否在屏蔽列表
    function isVideoIdBlocked(videoId) {
        return blockVideoIds.includes(videoId);
    }

    // 显示作者屏蔽管理器
    function showAuthorManager() {
        takeOverKeyboard();

        const overlay = document.createElement('div');
        overlay.className = 'douyin-keyword-manager-overlay';

        const manager = document.createElement('div');
        manager.className = 'douyin-keyword-manager';
        manager.innerHTML = `
        <h3>
            <span>👤</span>
            <span>作者屏蔽管理</span>
        </h3>
        <div style="margin-bottom: 12px; font-size: 13px; color: var(--text-secondary);">
            共 ${blockAuthors.length} 个屏蔽作者 | 已屏蔽 ${filterStats.authorsBlocked} 个作者视频
        </div>
        <textarea id="author-textarea" placeholder="每行一个作者名（支持部分匹配）

示例：
影视飓风
老番茄
张三

注意：作者名不区分大小写，包含指定文本即会被屏蔽">${blockAuthors.join('\n')}</textarea>
        <div class="button-group">
            <button class="close-btn">取消</button>
            <button class="save-btn">保存并应用</button>
        </div>
        <div class="help-text">
            <div><strong>💡 使用说明：</strong></div>
            <div>• 每行输入一个作者名，支持部分匹配</div>
            <div>• 不区分大小写，包含指定文本即会被屏蔽</div>
            <div>• 保存后将立即应用到当前页面</div>
            <div>• 在推荐页会立即跳过该作者的视频</div>
        </div>
    `;

        const closeManager = () => {
            overlay.remove();
            restoreKeyboard();
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeManager();
        });

        // ESC键关闭面板
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeManager();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        overlay.appendChild(manager);
        document.body.appendChild(overlay);

        // 设置保存按钮事件处理器
        setTimeout(() => {
            const saveBtn = manager.querySelector('.save-btn');
            const closeBtn = manager.querySelector('.close-btn');
            const textarea = manager.querySelector('#author-textarea');

            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(0, 0);
            }

            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const newAuthors = textarea.value
                        .split('\n')
                        .map(a => a.trim())
                        .filter(a => a.length > 0);

                    blockAuthors = newAuthors;
                    GM_setValue(STORAGE_PREFIX + 'block_authors', blockAuthors);

                    closeManager();
                    showNotification(`已保存 ${blockAuthors.length} 个屏蔽作者`);

                    // 立即应用到当前页面
                    lastCheckedVideoId = null;
                    setTimeout(() => {
                        checkAndFilter();
                    }, 100);
                });
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', closeManager);
            }
        }, 100);
    }

    // 显示视频ID屏蔽管理器
    function showVideoIdManager() {
        takeOverKeyboard();

        const overlay = document.createElement('div');
        overlay.className = 'douyin-keyword-manager-overlay';

        const manager = document.createElement('div');
        manager.className = 'douyin-keyword-manager';
        manager.innerHTML = `
        <h3>
            <span>🎬</span>
            <span>视频ID屏蔽管理</span>
        </h3>
        <div style="margin-bottom: 12px; font-size: 13px; color: var(--text-secondary);">
            共 ${blockVideoIds.length} 个屏蔽视频ID | 已屏蔽 ${filterStats.videoIdsBlocked} 个视频
        </div>
        <textarea id="videoid-textarea" placeholder="每行一个视频ID

示例：
7565229087204117802
1234567890123456789

注意：视频ID必须完全匹配，可在视频卡片元素的 data-aweme-id 属性中找到">${blockVideoIds.join('\n')}</textarea>
        <div class="button-group">
            <button class="close-btn">取消</button>
            <button class="save-btn">保存并应用</button>
        </div>
        <div class="help-text">
            <div><strong>💡 使用说明：</strong></div>
            <div>• 每行输入一个完整的视频ID</div>
            <div>• 视频ID必须完全匹配才会被屏蔽</div>
            <div>• 可在视频卡片元素的 data-aweme-id 属性中找到ID</div>
            <div>• 保存后将立即应用到当前页面</div>
        </div>
    `;

        const closeManager = () => {
            overlay.remove();
            restoreKeyboard();
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeManager();
        });

        // ESC键关闭面板
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeManager();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        overlay.appendChild(manager);
        document.body.appendChild(overlay);

        // 设置保存按钮事件处理器
        setTimeout(() => {
            const saveBtn = manager.querySelector('.save-btn');
            const closeBtn = manager.querySelector('.close-btn');
            const textarea = manager.querySelector('#videoid-textarea');

            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(0, 0);
            }

            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const newVideoIds = textarea.value
                        .split('\n')
                        .map(id => id.trim())
                        .filter(id => id.length > 0);

                    blockVideoIds = newVideoIds;
                    GM_setValue(STORAGE_PREFIX + 'block_video_ids', blockVideoIds);

                    closeManager();
                    showNotification(`已保存 ${blockVideoIds.length} 个屏蔽视频ID`);

                    // 立即应用到精选页面
                    if (isJingxuanPage()) {
                        showJingxuanCards();
                        setTimeout(() => {
                            checkAndFilterJingxuanCards();
                        }, 100);
                    }
                });
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', closeManager);
            }
        }, 100);
    }

    // 显示时间过滤设置
    function showTimeFilterSettings() {
        takeOverKeyboard();

        const overlay = document.createElement('div');
        overlay.className = 'douyin-keyword-manager-overlay';

        const manager = document.createElement('div');
        manager.className = 'douyin-keyword-manager';
        manager.innerHTML = `
        <h3>
            <span>⏰</span>
            <span>时间过滤设置</span>
        </h3>
        <div style="margin-bottom: 16px; font-size: 13px; color: var(--text-secondary);">
            已屏蔽 ${filterStats.timeFiltered} 个过期视频
        </div>
        <div class="setting-item">
            <label>
                <input type="checkbox" id="time-filter-enabled" ${timeFilter.enabled ? 'checked' : ''}>
                <div>
                    <div style="font-weight: 500; color: var(--text-color);">启用时间过滤</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                        自动屏蔽指定天数前的视频
                    </div>
                </div>
            </label>
        </div>
        <div class="setting-item">
            <label style="display: flex; align-items: center; gap: 8px;">
                <span style="min-width: 80px;">过滤天数:</span>
                <input type="number" id="time-filter-days" value="${timeFilter.days}" min="1" max="365" style="padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--input-color); width: 80px;">
            </label>
        </div>
        <div class="help-text">
            <div><strong>💡 使用说明：</strong></div>
            <div>• 开启后会自动屏蔽超过指定天数的视频</div>
            <div>• 支持相对时间（如"3小时前"）和绝对时间（如"10月26日"）</div>
            <div>• 无法识别的时间格式不会被过滤</div>
            <div>• 默认关闭此功能</div>
        </div>
        <div class="button-group">
            <button class="close-btn">取消</button>
            <button class="save-btn">保存设置</button>
        </div>
    `;

        const closeManager = () => {
            overlay.remove();
            restoreKeyboard();
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeManager();
        });

        // ESC键关闭面板
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeManager();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        overlay.appendChild(manager);
        document.body.appendChild(overlay);

        // 设置保存按钮事件处理器
        setTimeout(() => {
            const saveBtn = manager.querySelector('.save-btn');
            const closeBtn = manager.querySelector('.close-btn');
            const enabledCheckbox = manager.querySelector('#time-filter-enabled');
            const daysInput = manager.querySelector('#time-filter-days');

            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const enabled = enabledCheckbox.checked;
                    const days = parseInt(daysInput.value) || 30;

                    timeFilter = {
                        enabled: enabled,
                        days: Math.max(1, Math.min(365, days)) // 限制在1-365天
                    };

                    GM_setValue(STORAGE_PREFIX + 'time_filter', timeFilter);

                    closeManager();
                    showNotification(`时间过滤${enabled ? '已开启' : '已关闭'}，设置: ${days}天`);

                    // 立即应用到精选页面
                    if (isJingxuanPage()) {
                        showJingxuanCards();
                        setTimeout(() => {
                            checkAndFilterJingxuanCards();
                        }, 100);
                    }
                });
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', closeManager);
            }
        }, 100);
    }

    // 冷却状态查询功能
    function getCooldownStatus() {
        const remaining = Math.max(0, stateManager.current.cooldownUntil - Date.now());
        return {
            inCooldown: remaining > 0,
            remainingSeconds: Math.ceil(remaining / 1000)
        };
    }

    // 重置冷却时间功能
    function resetCooldown() {
        stateManager.resetCooldown();
        showNotification('冷却时间已重置');
    }

    // 右键菜单功能
    function createContextMenu(x, y, options) {
        // 移除已存在的菜单
        const existingMenu = document.querySelector('.douyin-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.className = 'douyin-context-menu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        options.forEach((option, index) => {
            if (option.type === 'divider') {
                const divider = document.createElement('div');
                divider.className = 'douyin-context-menu-divider';
                menu.appendChild(divider);
            } else {
                const item = document.createElement('div');
                item.className = `douyin-context-menu-item ${option.disabled ? 'disabled' : ''}`;
                item.innerHTML = `
                <span style="font-size: 16px;">${option.icon}</span>
                <span>${option.text}</span>
            `;

                if (!option.disabled) {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        option.action();
                        menu.remove();
                    });
                }

                menu.appendChild(item);
            }
        });

        document.body.appendChild(menu);

        // 点击其他地方关闭菜单
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);

        return menu;
    }

    // 获取视频卡片信息
    function getVideoCardInfo(element) {
        const card = element.closest('.discover-video-card-item');
        if (!card) return null;

        const authorElement = card.querySelector('.H0ZV35Qb .i1udsuGn');
        const author = authorElement ? authorElement.textContent || authorElement.innerText : '';

        const videoId = card.getAttribute('data-aweme-id') || '';

        const titleElement = card.querySelector('.bWzvoR9D');
        const title = titleElement ? titleElement.textContent || titleElement.innerText : '';

        return {
            card,
            author,
            videoId,
            title,
            element
        };
    }

    // 屏蔽作者
    async function blockAuthor(author, currentAuthor, currentDescription) {
        if (!author || blockAuthors.includes(author)) return;

        blockAuthors.push(author);
        GM_setValue(STORAGE_PREFIX + 'block_authors', blockAuthors);

        filterStats.authorsBlocked++;
        showNotification(`已屏蔽作者: ${author}`);

        // 立即应用屏蔽
        if (window.location.href.includes('recommend=1')) {
            if (debugMode) {
                console.log('🐛 [Debug] 右键屏蔽作者，进入调试流程');
                // 使用传入的当前视频信息，而不是重新获取
                await showDebugPanel(
                    `右键屏蔽作者: ${author}`,
                    currentAuthor || getCurrentAuthor(), // 如果传入为空，则重新获取
                    currentDescription || getCurrentDescription(),
                    `作者: ${author}`
                );
            } else {
                setTimeout(() => {
                    triggerDisinterest();
                    showNotification(`已屏蔽作者 ${author} 并跳过当前视频`);
                }, 300);
            }
        }
    }

    // 屏蔽标签函数，确保立即生效
    async function addTagToKeywords(tagText, currentAuthor, currentDescription) {
        if (!tagText || keywords.includes(tagText)) return;

        keywords.push(tagText);
        GM_setValue(STORAGE_PREFIX + 'keywords', keywords);

        showNotification(`已添加屏蔽标签: ${tagText}`);

        // 立即应用屏蔽
        if (window.location.href.includes('recommend=1')) {
            if (debugMode) {
                console.log('🐛 [Debug] 右键屏蔽标签，进入调试流程');
                // 使用传入的当前视频信息，而不是重新获取
                await showDebugPanel(
                    `右键屏蔽标签: ${tagText}`,
                    currentAuthor || getCurrentAuthor(), // 如果传入为空，则重新获取
                    currentDescription || getCurrentDescription(),
                    tagText
                );
            } else {
                setTimeout(() => {
                    triggerDisinterest();
                    showNotification(`已屏蔽标签 ${tagText} 并跳过当前视频`);
                }, 300);
            }
        }
    }

    // 屏蔽视频
    function blockVideo(videoId, title = '') {
        if (!videoId || blockVideoIds.includes(videoId)) return;

        blockVideoIds.push(videoId);
        GM_setValue(STORAGE_PREFIX + 'block_video_ids', blockVideoIds);

        filterStats.videoIdsBlocked++;
        const displayTitle = title ? title.substring(0, 20) + (title.length > 20 ? '...' : '') : '视频';
        showNotification(`已屏蔽视频: ${displayTitle}`);

        // 立即应用屏蔽
        if (isJingxuanPage()) {
            const card = document.querySelector(`.discover-video-card-item[data-aweme-id="${videoId}"]`);
            if (card) {
                smartRemoveCard(card, `视频ID: ${videoId}`);
            }
        }
    }

    // 检查是否已屏蔽作者
    function isAuthorBlocked(author) {
        return blockAuthors.some(blockedAuthor =>
            author.toLowerCase().includes(blockedAuthor.toLowerCase())
        );
    }

    // 检查是否已屏蔽视频
    function isVideoIdBlocked(videoId) {
        return blockVideoIds.includes(videoId);
    }

    // 添加右键事件监听
    function addContextMenuListeners() {
        document.addEventListener('contextmenu', function (e) {
            // 检查是否点击在作者名称上（推荐页）
            const accountNameElement = e.target.closest('.account-name-text');

            // 检查是否点击在标签上
            let tagElement = null;
            let target = e.target;
            while (target && target !== document) {
                if (target.textContent && target.textContent.includes('#') &&
                    target.textContent.trim().startsWith('#')) {
                    tagElement = target;
                    break;
                }
                target = target.parentElement;
            }

            if (accountNameElement || tagElement) {
                e.preventDefault();
                e.stopPropagation();

                // 在右键点击时立即获取当前视频信息
                console.log('🖱️ 右键点击，开始获取当前视频信息...');
                const author = getCurrentAuthor();
                const description = getCurrentDescription();

                console.log('🖱️ 右键点击时获取的信息:', {
                    author: author,
                    description: description ? description.substring(0, 50) + '...' : '空'
                });

                const menuOptions = [];

                // 作者屏蔽选项
                if (accountNameElement) {
                    const clickedAuthor = accountNameElement.innerText || accountNameElement.textContent;
                    const isAuthorAlreadyBlocked = isAuthorBlocked(clickedAuthor);

                    menuOptions.push({
                        icon: '👤',
                        text: isAuthorAlreadyBlocked ? `已屏蔽作者: ${clickedAuthor}` : `屏蔽作者: ${clickedAuthor}`,
                        action: () => {
                            console.log('🔄 右键屏蔽作者:', clickedAuthor);
                            blockAuthor(clickedAuthor, author, description);

                            // 额外触发一次立即检查，确保生效
                            setTimeout(() => {
                                stateManager.resetAll(); // 使用状态管理器重置
                                resetCooldown();
                                setTimeout(() => {
                                    immediateCheckCurrentVideo(); // 使用立即检查
                                }, 200);
                            }, 500);
                        },
                        disabled: isAuthorAlreadyBlocked
                    });
                }

                // 标签屏蔽选项
                if (tagElement) {
                    let tagText = tagElement.innerText || tagElement.textContent;
                    tagText = tagText.trim();

                    // 确保以 # 开头
                    if (!tagText.startsWith('#')) {
                        tagText = '#' + tagText;
                    }

                    const isTagAlreadyBlocked = isTextMatched(tagText);

                    menuOptions.push({
                        icon: '🏷️',
                        text: isTagAlreadyBlocked ? `已屏蔽标签: ${tagText}` : `屏蔽标签: ${tagText}`,
                        action: () => {
                            console.log('🔄 右键屏蔽标签:', tagText);
                            addTagToKeywords(tagText, author, description);

                            // 额外触发一次立即检查，确保生效
                            setTimeout(() => {
                                lastCheckedVideoId = null;
                                resetCooldown();
                                setTimeout(() => {
                                    checkAndFilter();
                                }, 200);
                            }, 500);
                        },
                        disabled: isTagAlreadyBlocked
                    });
                }

                if (menuOptions.length > 0) {
                    if (menuOptions.length > 1) {
                        menuOptions.splice(1, 0, { type: 'divider' });
                    }
                    createContextMenu(e.clientX, e.clientY, menuOptions);
                }
            }
        }, true); // 使用捕获阶段
    }

    // 智能移除卡片函数
    function enhancedSmartRemoveCard(card, matchedKeyword) {
        if (card.style.display === 'none') return false;

        console.log(`🚫 [精选页面] 隐藏视频卡片，匹配关键词: ${matchedKeyword}`);

        // 记录卡片信息
        const rect = card.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
        const isEmptyCard = card.classList.contains('pAWPzs6W');
        const cardIndex = Array.from(document.querySelectorAll('.discover-video-card-item')).indexOf(card);

        // 隐藏卡片
        card.style.display = 'none';
        card.classList.add('douyin-filtered-card');
        card.setAttribute('data-filtered-keyword', matchedKeyword);

        // 延迟处理加载逻辑，避免过于密集
        setTimeout(() => {
            // 检查页面状态并决定如何触发加载
            const visibleCards = document.querySelectorAll('.discover-video-card-item:not([style*="display: none"]):not(.pAWPzs6W)').length;

            if (visibleCards < 6) {
                // 可见卡片太少，需要主动加载更多内容
                console.log(`📉 可见卡片仅剩${visibleCards}个，触发主动加载`);
                simulateNaturalScroll();
            } else if (isInViewport || isEmptyCard) {
                // 正常情况下的懒加载触发
                console.log('🔄 隐藏卡片在可视区域，触发懒加载');
                checkPageStateAndLoad();
            }

            // 总是重新检查过滤，确保新内容也被处理
            setTimeout(() => {
                if (isJingxuanPage()) {
                    checkAndFilterJingxuanCards();
                }
            }, 1000);
        }, 300);

        return true;
    }

    // 智能滚动加载管理器
    let scrollManager = {
        isProcessing: false,
        lastScrollY: 0,
        scrollCount: 0,
        emptyCardCount: 0
    };

    // 模拟自然用户滚动行为
    function simulateNaturalScroll() {
        if (scrollManager.isProcessing) return;

        scrollManager.isProcessing = true;
        console.log('🔄 模拟自然滚动触发加载...');

        const currentScroll = window.scrollY;
        const viewportHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;

        // 计算滚动距离：视口高度的 50-80%
        const scrollDistance = Math.floor(viewportHeight * (0.5 + Math.random() * 0.3));

        // 方法1: 平滑向下滚动
        window.scrollTo({
            top: currentScroll + scrollDistance,
            behavior: 'smooth'
        });

        // 方法2: 短暂延迟后滚回原位置（模拟浏览行为）
        setTimeout(() => {
            window.scrollTo({
                top: currentScroll,
                behavior: 'smooth'
            });

            // 方法3: 触发一系列事件
            triggerLoadingEvents();

            scrollManager.isProcessing = false;
            scrollManager.scrollCount++;

            console.log(`✅ 第${scrollManager.scrollCount}次滚动模拟完成`);

        }, 800 + Math.random() * 400); // 随机延迟增加自然感
    }

    // 触发加载事件序列
    function triggerLoadingEvents() {
        // 1. 触发滚动事件
        const scrollEvent = new Event('scroll', {
            bubbles: true,
            cancelable: true
        });
        window.dispatchEvent(scrollEvent);

        // 2. 触发resize事件
        setTimeout(() => {
            const resizeEvent = new Event('resize', {
                bubbles: true,
                cancelable: true
            });
            window.dispatchEvent(resizeEvent);

            // 3. 触发触摸事件
            const touchMoveEvent = new TouchEvent('touchmove', {
                bubbles: true,
                cancelable: true,
                touches: [new Touch({ identifier: 1, target: document.body, clientX: 100, clientY: 200 })],
                changedTouches: [new Touch({ identifier: 1, target: document.body, clientX: 100, clientY: 250 })]
            });
            document.dispatchEvent(touchMoveEvent);

            // 4. 触发鼠标滚轮事件
            const wheelEvent = new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                deltaY: 100
            });
            document.dispatchEvent(wheelEvent);

        }, 100);

        // 5. 触发Intersection Observer
        triggerEnhancedIntersectionObservers();
    }

    // Intersection Observer触发
    function triggerEnhancedIntersectionObservers() {
        // 创建多个触发点
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const triggerElement = document.createElement('div');
                triggerElement.style.cssText = `
                position: absolute;
                top: ${window.scrollY + window.innerHeight - 100 + i * 10}px;
                left: 0;
                width: 1px;
                height: 1px;
                opacity: 0.001;
                pointer-events: none;
            `;
                triggerElement.className = 'douyin-load-trigger';
                document.body.appendChild(triggerElement);

                // 微小变化触发IO
                setTimeout(() => {
                    triggerElement.style.height = '2px';
                    setTimeout(() => {
                        triggerElement.remove();
                    }, 50);
                }, 20);

            }, i * 150);
        }
    }

    // Debug弹窗，显示视频检测的详细信息
    function showDebugPanel(reason, author, description, matchedKeyword) {
        console.log('🐛 [Debug] 显示调试面板:', { reason, author, description, matchedKeyword });

        // 暂停当前视频
        pauseCurrentVideo();

        const overlay = document.createElement('div');
        overlay.className = 'douyin-debug-overlay';

        const panel = document.createElement('div');
        panel.className = 'douyin-debug-panel';
        panel.innerHTML = `
        <h3>
            <span>🐛</span>
            <span>屏蔽调试面板</span>
        </h3>
        
        <div class="douyin-debug-section">
            <h4>屏蔽原因</h4>
            <div class="douyin-debug-content">${reason}</div>
        </div>
        
        <div class="douyin-debug-section">
            <h4>匹配关键词</h4>
            <div class="douyin-debug-content">${matchedKeyword || '无'}</div>
        </div>
        
        <div class="douyin-debug-section">
            <h4>视频作者</h4>
            <div class="douyin-debug-content">${author || '未获取到作者信息'}</div>
        </div>
        
        <div class="douyin-debug-section">
            <h4>视频简介</h4>
            <div class="douyin-debug-content">${description || '未获取到简介信息'}</div>
        </div>
        
        <div class="douyin-debug-section">
            <h4>状态管理器信息</h4>
            <div class="douyin-debug-content">
                当前视频ID: ${stateManager.getCurrentVideoId() || '无'}<br>
                最后检查视频ID: ${stateManager.getLastCheckedVideoId() || '无'}<br>
                冷却状态: ${stateManager.isInCooldown() ? '冷却中' : '正常'}<br>
                处理状态: ${stateManager.isProcessing() ? '处理中' : '空闲'}<br>
                状态快照: ${stateManager.snapshot ? '有' : '无'}
            </div>
        </div>
        
        <div class="douyin-debug-section">
            <h4>系统信息</h4>
            <div class="douyin-debug-content">
                当前页面: ${window.location.href}<br>
                自动跳过: ${autoSkip ? '开启' : '关闭'}<br>
                关键词数量: ${keywords.length}<br>
                作者屏蔽数量: ${blockAuthors.length}<br>
                调试模式: ${debugMode ? '开启' : '关闭'}
            </div>
        </div>
        
        <div class="douyin-debug-actions">
            <button class="douyin-debug-btn douyin-debug-skip" data-action="skip">跳过此视频</button>
            <button class="douyin-debug-btn douyin-debug-cancel" data-action="cancel">取消屏蔽</button>
            <button class="douyin-debug-btn douyin-debug-continue" data-action="continue">继续屏蔽</button>
        </div>
    `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // 添加按钮事件监听
        panel.querySelectorAll('.douyin-debug-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const action = this.getAttribute('data-action');
                handleDebugAction(action, reason, author, matchedKeyword);
                overlay.remove();
            });
        });

        // ESC键关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                handleDebugAction('cancel', reason, author, matchedKeyword);
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        return new Promise((resolve) => {
            overlay.resolve = resolve;
        });
    }

    // 处理Debug操作
    function handleDebugAction(action, reason, author, matchedKeyword) {
        console.log('🐛 [Debug] 用户操作:', action, { reason, author, matchedKeyword });

        switch (action) {
            case 'continue':
                console.log('🐛 [Debug] 用户选择继续屏蔽');
                triggerDisinterest();
                showNotification(`已屏蔽视频 (Debug: ${reason})`);
                break;

            case 'skip':
                console.log('🐛 [Debug] 用户选择跳过此视频');
                // 手动触发下一个视频
                triggerNextVideo();
                showNotification(`已跳过视频 (Debug: ${reason})`);
                break;

            case 'cancel':
                console.log('🐛 [Debug] 用户取消屏蔽');
                // 恢复视频播放
                playCurrentVideo();
                showNotification(`已取消屏蔽 (Debug: ${reason})`);
                break;
        }

        // 记录调试操作
        filterStats.details.push({
            keyword: `[Debug] ${reason}`,
            content: `操作: ${action}, 作者: ${author}, 匹配: ${matchedKeyword}`,
            timestamp: new Date().toLocaleTimeString(),
            debug: true
        });
    }

    // 暂停当前视频
    function pauseCurrentVideo() {
        const video = document.querySelector('video');
        if (video && !video.paused) {
            video.pause();
            console.log('🐛 [Debug] 已暂停视频');
        }
    }

    // 播放当前视频
    function playCurrentVideo() {
        const video = document.querySelector('video');
        if (video && video.paused) {
            video.play().catch(e => console.log('🐛 [Debug] 播放视频失败:', e));
            console.log('🐛 [Debug] 已恢复视频播放');
        }
    }

    // 触发下一个视频
    function triggerNextVideo() {
        // 方法1: 模拟下滑手势
        const swipeEvent = new Event('swipe', { bubbles: true });
        document.dispatchEvent(swipeEvent);

        // 方法2: 模拟键盘向下键
        const keyEvent = new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            code: 'ArrowDown',
            keyCode: 40,
            which: 40,
            bubbles: true
        });
        document.dispatchEvent(keyEvent);

        // 方法3: 触发触摸事件
        const touchEvent = new TouchEvent('touchmove', {
            bubbles: true,
            touches: [new Touch({ identifier: 1, target: document.body, clientX: 100, clientY: 300 })],
            changedTouches: [new Touch({ identifier: 1, target: document.body, clientX: 100, clientY: 100 })]
        });
        document.dispatchEvent(touchEvent);

        console.log('🐛 [Debug] 已触发切换到下一个视频');
    }

    // 检查页面状态并智能加载
    function checkPageStateAndLoad() {
        if (!isJingxuanPage()) return;

        const visibleCards = document.querySelectorAll('.discover-video-card-item:not([style*="display: none"]):not(.pAWPzs6W)');
        const emptyCards = document.querySelectorAll('.discover-video-card-item.pAWPzs6W');
        const totalCards = document.querySelectorAll('.discover-video-card-item').length;

        console.log(`📊 页面状态: 可见${visibleCards.length}个, 空${emptyCards.length}个, 总计${totalCards}个卡片`);

        // 如果空卡片比例过高或可见卡片太少，触发加载
        const emptyRatio = emptyCards.length / totalCards;
        const needsMoreContent = visibleCards.length < 8 || emptyRatio > 0.6;

        if (needsMoreContent && emptyCards.length > 0) {
            console.log(`🚨 需要更多内容: 可见卡片${visibleCards.length}个, 空卡片比例${(emptyRatio * 100).toFixed(1)}%`);

            if (scrollManager.scrollCount < 5) { // 限制最大尝试次数
                setTimeout(() => {
                    simulateNaturalScroll();

                    // 额外触发一次懒加载检查
                    setTimeout(() => {
                        enhancedCheckAndLoadLazyCards();
                    }, 1000);
                }, 500);
            } else {
                console.log('⚠️ 已达到最大滚动尝试次数，暂停自动加载');
            }
        } else if (emptyCards.length > 0) {
            // 正常情况下的懒加载触发
            enhancedCheckAndLoadLazyCards();
        }
    }

    // 懒加载检查
    function enhancedCheckAndLoadLazyCards() {
        const emptyCards = document.querySelectorAll('.discover-video-card-item.pAWPzs6W');
        if (emptyCards.length === 0) return;

        console.log(`📦 发现 ${emptyCards.length} 个未加载的视频卡片`);

        // 分批处理空卡片
        const batches = [];
        for (let i = 0; i < emptyCards.length; i += 3) {
            batches.push(Array.from(emptyCards).slice(i, i + 3));
        }

        batches.forEach((batch, batchIndex) => {
            setTimeout(() => {
                batch.forEach((card, cardIndex) => {
                    setTimeout(() => {
                        triggerCardLoad(card);
                    }, cardIndex * 200);
                });
            }, batchIndex * 600);
        });

        // 记录空卡片数量用于状态判断
        scrollManager.emptyCardCount = emptyCards.length;
    }

    // 卡片加载触发
    function triggerCardLoad(card) {
        if (!card.classList.contains('pAWPzs6W')) return; // 只处理空卡片

        console.log('🔧 触发单个卡片加载');

        // 方法1: 强制重排触发
        const originalDisplay = card.style.display;
        card.style.display = 'none';
        void card.offsetHeight; // 触发重排
        card.style.display = originalDisplay;

        // 方法2: 属性变化触发
        const originalClass = card.className;
        card.className = originalClass + ' douyin-loading-trigger';
        setTimeout(() => {
            card.className = originalClass;
        }, 100);

        // 方法3: 事件触发
        const events = ['mouseenter', 'focus', 'pointerover', 'touchstart'];
        events.forEach(eventType => {
            const event = new Event(eventType, { bubbles: true });
            card.dispatchEvent(event);
        });

        // 方法4: 模拟可见性变化
        const observer = new IntersectionObserver(() => { }, { threshold: 0.1 });
        observer.observe(card);
        setTimeout(() => {
            observer.unobserve(card);
            observer.disconnect();
        }, 500);
    }

    // 防抖版本的广告移除函数
    const debouncedCheckAds = debounce(checkAndRemoveAds, 300);
    // 防抖版本的精选页面过滤函数
    const debouncedCheckJingxuan = debounce(checkAndFilterJingxuanCards, 300);

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeVideoChanges);
    } else {
        observeVideoChanges();
    }
})();