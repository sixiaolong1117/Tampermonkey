// ==UserScript==
// @name         微博综合屏蔽
// @namespace    https://github.com/SIXiaolong1117/Rules
// @version      26.6.22
// @description  屏蔽推荐、广告、荐读标签、热搜栏、首页广告、首页中栏广告、右侧栏、创作者中心、顶栏推荐/视频和感兴趣的人，屏蔽自定义关键词的微博内容，支持首页跳转、长微博全文检测、自动切换深浅主题和微博将要访问页直接访问
// @license      MIT
// @icon         https://weibo.com/favicon.ico
// @author       SI Xiaolong
// @match        https://weibo.com/*
// @match        https://*.weibo.com/*
// @match        https://weibo.cn/sinaurl*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      weibo.com
// @connect      *.weibo.com
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置区域 ====================
    // 写死的推荐标签（不可通过菜单修改）
    const HIDDEN_TAGS = [
        '荐读',
        '广告',
        '推荐'
    ];

    const AD_TAG_IMAGE_PATTERNS = [
        /\/icon_auth_white\.png(?:[?#].*)?$/i
    ];

    // 默认关键词（可通过菜单修改）
    const DEFAULT_KEYWORDS = [
    ];

    // 默认屏蔽ID（可通过菜单修改）
    const DEFAULT_BLOCKED_IDS = [
    ];

    // 默认来源关键词
    const DEFAULT_SOURCE_KEYWORDS = [
    ];

    // 默认超话关键词
    const DEFAULT_SUPER_TOPIC_KEYWORDS = [
    ];

    // 为所有存储键添加脚本专属前缀
    const STORAGE_PREFIX = 'sixiaolong1117_weibo_';
    const TIME_FILTER_DAYS_KEY = STORAGE_PREFIX + 'time_filter_days';
    const DEFAULT_SHOW_BLOCK_BUTTON = true;  // 默认显示屏蔽按钮
    const DEFAULT_SHOW_PLACEHOLDER = true;   // 默认显示占位块
    const DEFAULT_AUTO_EXPAND = true;
    const DEFAULT_BLOCK_AI_CONTENT = false;  // 默认不屏蔽AI内容
    const DEFAULT_HIDE_HOT_SEARCH = true;    // 默认隐藏热搜栏
    const DEFAULT_HIDE_HOME_ADS = true;      // 默认隐藏首页广告
    const DEFAULT_HIDE_HOME_MID_AD = true;   // 默认隐藏首页中栏广告
    const DEFAULT_HIDE_INTERESTED_PEOPLE = true; // 默认隐藏可能感兴趣的人
    const DEFAULT_HIDE_RIGHT_SIDEBAR = false; // 默认不隐藏整个右侧栏
    const DEFAULT_HIDE_CREATOR_CENTER = true; // 默认隐藏右侧创作者中心
    const DEFAULT_HIDE_TOP_RECOMMEND = true; // 默认隐藏顶栏推荐按钮
    const DEFAULT_HIDE_TOP_VIDEO = true;     // 默认隐藏顶栏视频按钮
    const DEFAULT_REDIRECT_HOME_TO_MYGROUPS = true; // 默认将微博首页跳转到最新微博分组
    const DEFAULT_AUTO_SWITCH_THEME = true;  // 默认跟随系统深浅主题
    const MYGROUPS_REDIRECT_TARGET = 'https://weibo.com/mygroups?gid=110007969607960';

    // WebDAV配置存储键
    const WEBDAV_CONFIG_KEY = STORAGE_PREFIX + 'webdav_config';

    const SELECTORS = {
        // 微博主体
        feedBody: '[class*="_body_"]',
        feedItem: '.wbpro-scroller-item',

        // 用户信息相关
        avatar: '.woo-avatar-main[usercard]',
        userLink: 'a[href*="/u/"]',
        userName: '._name_ygi5b_120',
        userNameAlt: '._name_ygi5b_120',
        nickContainer: '._nick_ygi5b_25',
        suffixBox: '[class*="_suffixbox_"]',
        iconsPlus: '._iconsPlus_ygi5b_75',

        // 微博内容
        feedContent: '.wbpro-feed-content',
        feedText: '._wbtext_1h76l_19',
        feedTextContainer: '._text_1h76l_2',

        // 时间和来源
        timeLink: 'a[class*="_time_1tpft_33"]',
        sourceTag: '._cut_1tpft_29._source_1tpft_46',

        // 按钮相关
        followButton: '._followbtn_1sy5n_2',
        moreButton: '._more_1v5ao_27',
        expandButton: '.expand',

        // 评论区
        commentFeed: '.wbpro-list',

        // 标签
        tagPrefix: 'wbpro-tag',
        feedListTop: '[node-type="feed_list_top"]',

        // 超话相关
        chaohuaIcon: '[class*="_chaohuaIcon_"]',
        superText: '[class*="_superText_"]',

        // 面板
        panelMain: '.woo-panel-main',
        cardWrap: '.WB_cardwrap',

        // 独立页面组件
        hotBand: '.hotBand',
        tipsAd: '[class^="TipsAd"], [class*=" TipsAd"]',
        homeMidAd: '._wrap_rhdi0_2',
        rightSidebar: '#__sidebar',
        topRecommendLink: 'a[href="/hot"]',
        topVideoLink: 'a[href="/tv"]',
        colorModeButton: 'button[title="夜间模式"], button[title="日间模式"]',
        sideTitle: '.wbpro-side-tit'
    };
    // =================================================

    // 初始化关键词列表和ID列表
    let keywords = GM_getValue(STORAGE_PREFIX + 'keywords', DEFAULT_KEYWORDS);
    let blockedIds = GM_getValue(STORAGE_PREFIX + 'blocked_ids', DEFAULT_BLOCKED_IDS);
    let sourceKeywords = GM_getValue(STORAGE_PREFIX + 'source_keywords', DEFAULT_SOURCE_KEYWORDS);
    let superTopicKeywords = GM_getValue(STORAGE_PREFIX + 'super_topic_keywords', DEFAULT_SUPER_TOPIC_KEYWORDS);
    let timeFilterDays = GM_getValue(TIME_FILTER_DAYS_KEY, 0);
    let keywordManager = null;
    let showBlockButton = GM_getValue(STORAGE_PREFIX + 'show_block_button', DEFAULT_SHOW_BLOCK_BUTTON);
    let showPlaceholder = GM_getValue(STORAGE_PREFIX + 'show_placeholder', DEFAULT_SHOW_PLACEHOLDER);
    let autoExpandEnabled = GM_getValue(STORAGE_PREFIX + 'auto_expand', DEFAULT_AUTO_EXPAND);
    let blockAIContent = GM_getValue(STORAGE_PREFIX + 'block_ai_content', DEFAULT_BLOCK_AI_CONTENT);
    let hideHotSearchEnabled = GM_getValue(STORAGE_PREFIX + 'hide_hot_search', DEFAULT_HIDE_HOT_SEARCH);
    let hideHomeAdsEnabled = GM_getValue(STORAGE_PREFIX + 'hide_home_ads', DEFAULT_HIDE_HOME_ADS);
    let hideHomeMidAdEnabled = GM_getValue(STORAGE_PREFIX + 'hide_home_mid_ad', DEFAULT_HIDE_HOME_MID_AD);
    let hideInterestedPeopleEnabled = GM_getValue(STORAGE_PREFIX + 'hide_interested_people', DEFAULT_HIDE_INTERESTED_PEOPLE);
    let hideRightSidebarEnabled = GM_getValue(STORAGE_PREFIX + 'hide_right_sidebar', DEFAULT_HIDE_RIGHT_SIDEBAR);
    let hideCreatorCenterEnabled = GM_getValue(STORAGE_PREFIX + 'hide_creator_center', DEFAULT_HIDE_CREATOR_CENTER);
    let hideTopRecommendEnabled = GM_getValue(STORAGE_PREFIX + 'hide_top_recommend', DEFAULT_HIDE_TOP_RECOMMEND);
    let hideTopVideoEnabled = GM_getValue(STORAGE_PREFIX + 'hide_top_video', DEFAULT_HIDE_TOP_VIDEO);
    let redirectHomeToMyGroupsEnabled = GM_getValue(STORAGE_PREFIX + 'redirect_home_to_mygroups', DEFAULT_REDIRECT_HOME_TO_MYGROUPS);
    let autoSwitchThemeEnabled = GM_getValue(STORAGE_PREFIX + 'auto_switch_theme', DEFAULT_AUTO_SWITCH_THEME);
    const AUTO_EXPAND_SCROLL_IDLE_MS = 700;
    const FULL_TEXT_FETCH_TIMEOUT_MS = 2500;
    const FULL_TEXT_MAX_CONCURRENT = 2;
    let lastScrollTime = 0;
    let autoExpandTimer = null;
    let autoExpandIntervalId = null;
    let themeSwitchTimer = null;
    let colorSchemeListenerInitialized = false;
    const fullTextCheckedFeedIdentities = new Set();
    const fullTextCache = new Map();
    const fullTextPending = new Set();
    let fullTextActiveRequests = 0;

    // WebDAV配置
    let webdavConfig = GM_getValue(WEBDAV_CONFIG_KEY, {
        enabled: false,
        url: '',
        username: '',
        password: '',
        lastSync: 0
    });

    // 统计隐藏的内容
    let hiddenCount = 0;
    const MAX_HIDDEN_DETAILS = 500;
    const hiddenDetails = [];
    const hiddenTypeCounts = {};
    const hiddenReasonCounts = {};

    window.getHiddenStats = getHiddenStats;
    window.resetHiddenStats = resetHiddenStats;

    if (isWeiboSinaUrlPage()) {
        runWhenReady(initSinaurlDirectAccess);
        return;
    }

    if (redirectHomeToMyGroups()) {
        return;
    }

    // 注册油猴菜单命令
    GM_registerMenuCommand('管理屏蔽关键词', showKeywordManager);
    GM_registerMenuCommand('功能设置', showDisplaySettings);
    GM_registerMenuCommand('设置WebDAV同步', showWebDAVConfig);
    GM_registerMenuCommand('强制同步本地配置到云端', forceSyncToWebDAV);
    GM_registerMenuCommand('查看隐藏统计', getHiddenStats);

    const standaloneStyleSelectors = [
        hideRightSidebarEnabled ? '#__sidebar' : '',
        hideHotSearchEnabled ? '.hotBand' : '',
        hideHomeAdsEnabled ? '[class^="TipsAd"], [class*=" TipsAd"]' : '',
        hideHomeMidAdEnabled ? '._wrap_rhdi0_2' : '',
        hideTopRecommendEnabled ? 'a[href="/hot"]' : '',
        hideTopVideoEnabled ? 'a[href="/tv"]' : ''
    ].filter(Boolean).join(',\n        ');

    const additionalStyles = `
        .blocked-item-with-placeholder {
            height: auto !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
        }
        .blocked-item-hidden {
            height: 2px !important;
            min-height: 2px !important;
            margin: -1px 0 !important;
            padding: 0 !important;
            opacity: 0.01 !important;
            overflow: hidden !important;
            pointer-events: none !important;
        }
        .blocked-article-with-placeholder {
            height: auto !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 15px !important;
            overflow: hidden !important;
        }
        .blocked-article-hidden {
            height: 0 !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            opacity: 0 !important;
            overflow: hidden !important;
            pointer-events: none !important;
        }
        ${standaloneStyleSelectors ? `${standaloneStyleSelectors} {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            pointer-events: none !important;
            position: absolute !important;
            left: -9999px !important;
            top: -9999px !important;
            overflow: hidden !important;
        }` : ''}
    `;

    const styles = `
        .custom-hidden-message {
            margin: 10px 0;
        }
        .custom-hidden-message .message-content {
            padding: 15px;
            text-align: center;
            border: 1px solid;
            border-radius: 6px;
            font-size: 14px;
            margin: 10px 0;
        }
        .weibo-block-btn {
            padding: 2px 8px;
            border: 1px solid #d0d0d0;
            border-radius: 3px;
            background: transparent;
            color: #8590a6;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            flex-shrink: 0;
            margin-left: 10px;
        }
        .weibo-block-btn:hover {
            border-color: #f1403c;
            color: #f1403c;
            background: rgba(241, 64, 60, 0.05);
        }
        .weibo-block-btn-comment {
            font-size: 11px;
            padding: 1px 6px;
            margin-left: 5px;
        }
        ._name_ygi5b_120 {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .keyword-manager-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 500px;
            max-width: 90vw;
            max-height: 90vh;
            overflow: auto;
            background: var(--bg-color, white);
            border: 1px solid var(--border-color, #ccc);
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 10000;
            font-family: system-ui, -apple-system, sans-serif;
        }
        .keyword-manager-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
        }
        .keyword-manager h3 {
            margin: 0 0 15px 0;
            font-size: 18px;
            color: var(--text-color, #333);
        }
        .keyword-manager .tabs {
            display: flex;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color, #ddd);
        }
        .keyword-manager .tab {
            padding: 8px 16px;
            cursor: pointer;
            border: none;
            background: none;
            color: var(--text-color, #333);
            border-bottom: 2px solid transparent;
        }
        .keyword-manager .tab.active {
            border-bottom-color: #1890ff;
            color: #1890ff;
        }
        .keyword-manager textarea {
            width: 100%;
            height: 180px;
            margin-bottom: 15px;
            padding: 10px;
            border: 1px solid var(--border-color, #ddd);
            border-radius: 4px;
            resize: vertical;
            font-family: monospace;
            font-size: 14px;
            background: var(--input-bg, white);
            color: var(--input-color, #333);
        }
        .keyword-manager .button-group {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }
        .keyword-manager button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .keyword-manager .save-btn {
            background: #1890ff;
            color: white;
        }
        .keyword-manager .save-btn:hover {
            background: #40a9ff;
        }
        .keyword-manager .close-btn {
            background: var(--btn-bg, #f5f5f5);
            color: var(--btn-color, #666);
        }
        .keyword-manager .close-btn:hover {
            background: var(--btn-hover-bg, #e8e8e8);
        }
        .keyword-manager .help-text {
            margin-top: 10px;
            font-size: 12px;
            color: var(--help-color, #666);
            line-height: 1.4;
        }
        @media (prefers-color-scheme: light) {
            .keyword-manager-modal {
                --bg-color: white;
                --text-color: #333;
                --border-color: #ccc;
                --input-bg: white;
                --input-color: #333;
                --btn-bg: #f5f5f5;
                --btn-color: #666;
                --btn-hover-bg: #e8e8e8;
                --help-color: #666;
            }
            .custom-hidden-message .message-content {
                background: #f5f5f5;
                color: #666;
                border-color: #ddd;
            }
        }
        @media (prefers-color-scheme: dark) {
            .keyword-manager-modal {
                --bg-color: #2d2d2d;
                --text-color: #ccc;
                --border-color: #444;
                --input-bg: #1a1a1a;
                --input-color: #ccc;
                --btn-bg: #444;
                --btn-color: #ccc;
                --btn-hover-bg: #555;
                --help-color: #999;
            }
            .custom-hidden-message .message-content {
                background: #2d2d2d;
                color: #ccc;
                border-color: #444;
            }
            .weibo-block-btn {
                border-color: #555;
                color: #8590a6;
            }
            .weibo-block-btn:hover {
                border-color: #f1403c;
                color: #f1403c;
                background: rgba(241, 64, 60, 0.1);
            }
        }
        .time-filter-hidden-message {
            margin: 10px 0;
        }
        .time-filter-hidden-message .message-content {
            padding: 15px;
            text-align: center;
            border: 1px solid;
            border-radius: 6px;
            font-size: 14px;
            background: var(--time-filter-bg, #fff3cd);
            color: var(--time-filter-color, #856404);
            border-color: var(--time-filter-border, #ffeaa7);
        }
        @media (prefers-color-scheme: dark) {
            .time-filter-hidden-message .message-content {
                background: #332701;
                color: #f1c40f;
                border-color: #665200;
            }
        }
        .super-topic-context-menu {
            position: fixed;
            background: var(--ctx-bg, white);
            border: 1px solid var(--ctx-border, #ccc);
            border-radius: 6px;
            padding: 4px 0;
            box-shadow: 0 2px 12px rgba(0,0,0,0.15);
            z-index: 99999;
            min-width: 200px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 13px;
        }
        .super-topic-context-menu-item {
            padding: 8px 16px;
            cursor: pointer;
            color: var(--ctx-text, #333);
            white-space: nowrap;
            transition: background 0.15s;
        }
        .super-topic-context-menu-item:hover {
            background: var(--ctx-hover, #f0f0f0);
        }
        .super-topic-context-menu-item .highlight {
            color: #f1403c;
            font-weight: 600;
        }
        @media (prefers-color-scheme: light) {
            .super-topic-context-menu {
                --ctx-bg: #fff;
                --ctx-text: #333;
                --ctx-border: #ddd;
                --ctx-hover: #f5f5f5;
            }
        }
        @media (prefers-color-scheme: dark) {
            .super-topic-context-menu {
                --ctx-bg: #2d2d2d;
                --ctx-text: #ccc;
                --ctx-border: #444;
                --ctx-hover: #3a3a3a;
            }
        }
    `;

    // 添加样式到页面
    appendStyle(styles);

    // 在控制台输出隐藏信息
    function logHiddenContent(type, matchedText, element, reason) {
        hiddenCount++;
        const detail = {
            index: hiddenCount,
            type: type,
            matched: matchedText,
            reason: reason,
            timestamp: new Date().toLocaleTimeString(),
            text: element?.textContent?.trim?.().slice(0, 120) || '',
            path: getElementSummary(element)
        };
        hiddenDetails.push(detail);
        if (hiddenDetails.length > MAX_HIDDEN_DETAILS) {
            hiddenDetails.shift();
        }
        hiddenTypeCounts[type] = (hiddenTypeCounts[type] || 0) + 1;
        hiddenReasonCounts[reason] = (hiddenReasonCounts[reason] || 0) + 1;

        console.log(
            `🚫 微博内容隐藏 #${hiddenCount}\n` +
            `📌 类型: ${type}\n` +
            `🔍 匹配: "${matchedText}"\n` +
            `📝 原因: ${reason}\n` +
            `⏰ 时间: ${detail.timestamp}\n` +
            `📍 元素:`, element
        );

        // 每隐藏10条内容时输出汇总信息
        if (hiddenCount % 10 === 0) {
            console.log(
                `📊 隐藏内容汇总: 已隐藏 ${hiddenCount} 条内容\n` +
                `🏷️ 推荐标签: ${hiddenTypeCounts['推荐标签'] || 0} 条\n` +
                `🔤 关键词: ${hiddenTypeCounts['关键词'] || 0} 条\n` +
                `👤 用户ID: ${hiddenTypeCounts['用户ID'] || 0} 条\n` +
                `📋 详细分布:`,
                { ...hiddenReasonCounts }
            );
        }
    }

    function getElementSummary(element) {
        if (!element || element.nodeType !== 1) return '';

        const tag = element.tagName?.toLowerCase?.() || '';
        const id = element.id ? `#${element.id}` : '';
        const classes = Array.from(element.classList || []).slice(0, 4).map(className => `.${className}`).join('');
        return `${tag}${id}${classes}`;
    }

    function getHiddenStats() {
        console.log(
            `%c📊 微博内容隐藏统计\n` +
            `📈 总共隐藏: ${hiddenCount} 条内容\n` +
            `🏷️ 推荐标签: ${hiddenTypeCounts['推荐标签'] || 0} 条\n` +
            `🔤 关键词: ${hiddenTypeCounts['关键词'] || 0} 条\n` +
            `👤 用户ID: ${hiddenTypeCounts['用户ID'] || 0} 条\n` +
            `📋 详细分布:`,
            'background: #4CAF50; color: white; padding: 5px; border-radius: 3px;',
            { ...hiddenReasonCounts }
        );
        console.log('📋 最近记录:', hiddenDetails);
    }

    function resetHiddenStats() {
        hiddenCount = 0;
        hiddenDetails.length = 0;
        Object.keys(hiddenTypeCounts).forEach(key => delete hiddenTypeCounts[key]);
        Object.keys(hiddenReasonCounts).forEach(key => delete hiddenReasonCounts[key]);
        console.log('🔄 隐藏统计已重置');
    }

    // 输出脚本信息
    console.log(
        `💡 提示: 在控制台使用以下命令:\n` +
        `   getHiddenStats() - 查看隐藏统计\n` +
        `   resetHiddenStats() - 重置统计计数\n` +
        `💡 功能: 按 F8 将选中文本添加到屏蔽词\n` +
        `💡 功能: 按 F9 将选中文本添加到来源屏蔽词\n` +
        `💡 功能: 按 F10 将选中文本添加到超话屏蔽词\n` +
        `💡 功能: 点击用户名称旁的"屏蔽"按钮屏蔽该用户\n` +
        `💡 功能: 长微博全文检测${autoExpandEnabled ? '已启用' : '未启用，可在菜单中开启'}\n` +
        `💡 功能: 自动主题${autoSwitchThemeEnabled ? '已启用' : '未启用，可在菜单中开启'}\n` +
        `💡 功能: AI内容屏蔽${blockAIContent ? '已启用' : '未启用，可在菜单中开启'}`
    );

    function logScriptInfo() {
        console.log(
            `%c🐦 微博内容综合屏蔽脚本已启动\n` +
            `🏷️ 屏蔽标签: ${HIDDEN_TAGS.join(', ')}\n` +
            `🔤 屏蔽关键词: ${keywords.length} 个\n` +
            `📱 屏蔽来源: ${sourceKeywords.length} 个\n` +
            `🏷️ 屏蔽超话: ${superTopicKeywords.length} 个\n` +
            `👤 屏蔽用户ID: ${blockedIds.length} 个\n` +
            `⏰ 时间过滤: ${timeFilterDays > 0 ? timeFilterDays + '天前' : '已禁用'}\n` +
            `🏠 首页跳转: ${redirectHomeToMyGroupsEnabled ? '已启用' : '未启用'}\n` +
            `🧹 右侧栏清理: 整栏${hideRightSidebarEnabled ? '开' : '关'} / 热搜${hideHotSearchEnabled ? '开' : '关'} / 首页广告${hideHomeAdsEnabled ? '开' : '关'} / 首页中栏广告${hideHomeMidAdEnabled ? '开' : '关'} / 感兴趣的人${hideInterestedPeopleEnabled ? '开' : '关'} / 创作者中心${hideCreatorCenterEnabled ? '开' : '关'}\n` +
            `🧭 顶部导航清理: 推荐${hideTopRecommendEnabled ? '开' : '关'} / 视频${hideTopVideoEnabled ? '开' : '关'}\n` +
            `📱 长微博全文检测: ${autoExpandEnabled ? '已启用' : '未启用'}\n` +
            `🎨 自动主题: ${autoSwitchThemeEnabled ? '已启用' : '未启用'}\n` +
            `🤖 AI内容屏蔽: ${blockAIContent ? '已启用' : '未启用'}\n` +
            `🔗 WebDAV同步: ${webdavConfig.enabled ? '已启用' : '未启用'}\n` +
            `⌨️  按 F8 添加选中文本到屏蔽词\n` +
            `⌨️  按 F9 添加选中文本到来源屏蔽词\n` +
            `⌨️  按 F10 添加选中文本到超话屏蔽词\n` +
            `⏰ 启动时间: ${new Date().toLocaleString()}`,
            'background: #ff6b35; color: white; padding: 5px; border-radius: 3px;'
        );
    }

    function appendStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;

        const append = () => {
            const parent = document.head || document.documentElement;
            if (parent && !style.parentNode) {
                parent.appendChild(style);
            }
        };

        if (document.head || document.documentElement) {
            append();
        } else {
            document.addEventListener('DOMContentLoaded', append, { once: true });
        }

        return style;
    }

    function runWhenReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    function isWeiboSinaUrlPage() {
        return window.location.hostname === 'weibo.cn' && window.location.pathname === '/sinaurl';
    }

    function decodeSinaurlTarget(rawUrl) {
        if (!rawUrl) return null;

        const normalizeTargetUrl = (target) => {
            const targetUrl = new URL(target);
            if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
                console.log('微博将要访问页目标URL协议不支持:', targetUrl.protocol);
                return null;
            }
            return targetUrl.href;
        };

        const trimmedUrl = rawUrl.trim();
        try {
            return normalizeTargetUrl(trimmedUrl);
        } catch (e) {
            try {
                return normalizeTargetUrl(decodeURIComponent(trimmedUrl));
            } catch (decodeError) {
                console.log('微博将要访问页目标URL无效:', trimmedUrl, decodeError);
            }
            return null;
        }
    }

    function findSinaurlTargetUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const targetFromQuery = decodeSinaurlTarget(urlParams.get('u'));
        if (targetFromQuery) return targetFromQuery;

        const links = document.querySelectorAll('a[href]');
        for (const link of links) {
            try {
                const linkUrl = new URL(link.getAttribute('href'), window.location.href);
                if (linkUrl.hostname !== 'weibo.cn' || linkUrl.pathname !== '/sinaurl') continue;

                const targetFromLink = decodeSinaurlTarget(linkUrl.searchParams.get('u'));
                if (targetFromLink) return targetFromLink;
            } catch (e) {
                console.log('微博将要访问页链接解析失败:', e);
            }
        }

        return null;
    }

    function createSinaurlDirectAccessButton(targetUrl) {
        const button = document.createElement('button');
        button.className = 'weibo-direct-access-button';
        button.type = 'button';
        button.textContent = '直接访问目标网站';
        button.addEventListener('click', () => {
            window.location.href = targetUrl;
        });
        return button;
    }

    function createSinaurlTargetNotice(targetUrl) {
        const notice = document.createElement('div');
        notice.className = 'weibo-direct-access-notice';

        const label = document.createTextNode('检测到目标网站: ');
        const target = document.createElement('span');
        target.textContent = targetUrl;

        notice.append(label, target);
        return notice;
    }

    function initSinaurlDirectAccess() {
        const targetUrl = findSinaurlTargetUrl();
        if (!targetUrl) {
            console.log('微博将要访问页: 未找到目标URL');
            return;
        }

        console.log('微博将要访问页: 找到目标URL:', targetUrl);
        appendStyle(`
            .weibo-direct-access-button {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                padding: 12px 20px;
                background: #ff8140;
                color: #fff;
                border: none;
                border-radius: 6px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                transition: background 0.2s ease, transform 0.2s ease;
            }
            .weibo-direct-access-button:hover {
                background: #e67230;
                transform: scale(1.05);
            }
            .weibo-direct-access-notice {
                position: fixed;
                top: 70px;
                right: 20px;
                z-index: 9999;
                max-width: 400px;
                padding: 10px 15px;
                background: #fff;
                color: #333;
                border: 1px solid #ddd;
                border-radius: 6px;
                font-size: 14px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                word-break: break-all;
            }
            .weibo-direct-access-notice span {
                color: #ff8140;
                font-weight: bold;
            }
        `);

        document.body.append(
            createSinaurlDirectAccessButton(targetUrl),
            createSinaurlTargetNotice(targetUrl)
        );
    }

    function redirectHomeToMyGroups() {
        if (!redirectHomeToMyGroupsEnabled) return false;

        const isWeiboHome = location.hostname === 'weibo.com' &&
            location.pathname === '/' &&
            !location.search &&
            !location.hash;

        if (!isWeiboHome || location.href === MYGROUPS_REDIRECT_TARGET) {
            return false;
        }

        location.replace(MYGROUPS_REDIRECT_TARGET);
        return true;
    }

    function getSystemColorScheme() {
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function toggleColorMode() {
        if (!autoSwitchThemeEnabled) {
            return false;
        }

        const systemMode = getSystemColorScheme();
        const targetMode = systemMode === 'dark' ? '夜间模式' : '日间模式';
        const buttons = document.querySelectorAll(SELECTORS.colorModeButton);

        for (const button of buttons) {
            if (button.title === targetMode) {
                console.log(`🎨 检测到系统为${systemMode}模式，切换微博到${targetMode}`);
                button.click();
                return true;
            }
        }

        return false;
    }

    function scheduleThemeSwitch(delay = 100) {
        if (!autoSwitchThemeEnabled) {
            return;
        }

        clearTimeout(themeSwitchTimer);
        themeSwitchTimer = setTimeout(toggleColorMode, delay);
    }

    function initColorSchemeListener() {
        if (colorSchemeListenerInitialized || !window.matchMedia) {
            return;
        }

        const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const onColorSchemeChange = () => {
            console.log('🎨 系统颜色模式发生变化，重新调整微博主题');
            scheduleThemeSwitch(100);
        };

        if (colorSchemeQuery.addEventListener) {
            colorSchemeQuery.addEventListener('change', onColorSchemeChange);
        } else if (colorSchemeQuery.addListener) {
            colorSchemeQuery.addListener(onColorSchemeChange);
        }

        colorSchemeListenerInitialized = true;
    }

    function initAutoThemeSwitch() {
        if (!autoSwitchThemeEnabled) {
            return;
        }

        scheduleThemeSwitch(500);
        initColorSchemeListener();
    }

    // 显示WebDAV配置界面
    function showWebDAVConfig() {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'keyword-manager-overlay';

        // 创建配置模态框
        const configModal = document.createElement('div');
        configModal.className = 'keyword-manager-modal';
        configModal.innerHTML = `
            <div class="keyword-manager">
                <h3>WebDAV同步设置</h3>
                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="webdav-enabled" ${webdavConfig.enabled ? 'checked' : ''} style="margin-right: 8px;">
                        启用WebDAV同步
                    </label>
                </div>
                <div style="margin-bottom: 15px;">
                    <input type="url" id="webdav-url" placeholder="WebDAV服务器地址 (https://example.com/dav/)"
                           value="${webdavConfig.url || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 4px; margin-bottom: 10px;">
                    <input type="text" id="webdav-username" placeholder="用户名"
                           value="${webdavConfig.username || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 4px; margin-bottom: 10px;">
                    <input type="password" id="webdav-password" placeholder="密码"
                           value="${webdavConfig.password || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 4px;">
                </div>
                <div class="button-group">
                    <button class="close-btn">取消</button>
                    <button class="save-btn">保存</button>
                </div>
                <div class="help-text">
                    <div><strong>WebDAV同步说明：</strong></div>
                    <div>• 启用后，每次修改屏蔽词会自动同步到WebDAV服务器</div>
                    <div>• 支持 Nextcloud、OwnCloud、坚果云等WebDAV服务</div>
                    <div>• 文件将保存为: weibo_blocklist.json</div>
                    <div>• 多设备使用时请注意冲突问题</div>
                </div>
            </div>
        `;

        // 保存按钮事件
        configModal.querySelector('.save-btn').addEventListener('click', function () {
            const enabled = configModal.querySelector('#webdav-enabled').checked;
            const url = configModal.querySelector('#webdav-url').value.trim();
            const username = configModal.querySelector('#webdav-username').value.trim();
            const password = configModal.querySelector('#webdav-password').value;

            webdavConfig = {
                enabled: enabled,
                url: url,
                username: username,
                password: password,
                lastSync: webdavConfig.lastSync
            };

            GM_setValue(WEBDAV_CONFIG_KEY, webdavConfig);

            // 如果启用了同步，立即执行一次同步
            if (enabled) {
                syncToWebDAV('保存配置后同步');
            }

            // 关闭配置窗口
            overlay.remove();
            configModal.remove();

            showNotification('WebDAV配置已保存' + (enabled ? '，正在同步...' : ''));
        });

        // 关闭按钮事件
        configModal.querySelector('.close-btn').addEventListener('click', function () {
            overlay.remove();
            configModal.remove();
        });

        // 点击遮罩层关闭
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.remove();
                configModal.remove();
            }
        });

        // 添加到页面
        document.body.appendChild(overlay);
        document.body.appendChild(configModal);
    }

    // =============== WebDAV 相关逻辑 START ===============

    function forceSyncToWebDAV() {
        if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
            showNotification('请先配置 WebDAV 同步');
            showWebDAVConfig();
            return;
        }

        showNotification('正在强制同步本地配置到云端...');
        syncToWebDAV('手动强制同步到云端').then(success => {
            if (success) {
                showNotification('✅ 已强制同步本地配置到云端');
            } else {
                showNotification('❌ 强制同步失败，请检查 WebDAV 配置');
            }
        });
    }

    // WebDAV 文件定义：每个配置类别独立文件，互不干扰
    const WEBDAV_FILES = {
        keywords: 'weibo_keywords.json',
        sourceKeywords: 'weibo_source_keywords.json',
        superTopicKeywords: 'weibo_super_topic_keywords.json',
        blockedIds: 'weibo_blocked_ids.json',
        settings: 'weibo_settings.json'
    };

    // WebDAV URL 构建
    function getWebDAVUrls() {
        let base = webdavConfig.url;
        if (!base.endsWith('/')) base += '/';
        const folder = base + 'WeiboGeneralBlock/';
        const auth = 'Basic ' + btoa(webdavConfig.username + ':' + webdavConfig.password);
        return { base, folder, auth };
    }

    // GM_xmlhttpRequest 封装
    function webdavRequest({ method, url, data, headers = {}, responseType }, callback) {
        GM_xmlhttpRequest({
            method,
            url,
            data,
            headers: { 'Authorization': headers.auth || getWebDAVUrls().auth, ...headers },
            responseType: responseType || 'text',
            onload: res => callback(res),
            onerror: () => callback({ status: 0, responseText: '' })
        });
    }

    // lastSync 更新
    function updateLastSync(timestamp) {
        webdavConfig.lastSync = timestamp;
        GM_setValue(WEBDAV_CONFIG_KEY, webdavConfig);
    }

    // 获取本地数据快照（按文件分类）
    function getLocalDataByFile() {
        return {
            keywords: { data: [...keywords], lastModified: Date.now() },
            sourceKeywords: { data: [...sourceKeywords], lastModified: Date.now() },
            superTopicKeywords: { data: [...superTopicKeywords], lastModified: Date.now() },
            blockedIds: { data: [...blockedIds], lastModified: Date.now() },
            settings: { data: { timeFilterDays }, lastModified: Date.now() }
        };
    }

    // 从远端响应提取数据
    function extractFileData(response) {
        if (response.status === 200) {
            try { return response.response || JSON.parse(response.responseText) || null; } catch { }
        }
        return null;
    }

    // 上传单个文件到 WebDAV
    function uploadFile(fileName, content) {
        const { folder, auth } = getWebDAVUrls();
        const url = folder + fileName;
        return new Promise(resolve => {
            webdavRequest({
                method: 'PUT',
                url,
                data: JSON.stringify(content, null, 2),
                headers: { 'Content-Type': 'application/json; charset=utf-8', auth }
            }, res => {
                resolve(res.status >= 200 && res.status < 300);
            });
        });
    }

    // 下载单个文件从 WebDAV
    function downloadFile(fileName) {
        const { folder, auth } = getWebDAVUrls();
        const url = folder + fileName;
        return new Promise(resolve => {
            webdavRequest({ method: 'GET', url, responseType: 'json' }, res => {
                resolve(extractFileData(res));
            });
        });
    }

    // 确保 WebDAV 目录存在
    function ensureFolder() {
        const { folder, auth } = getWebDAVUrls();
        return new Promise(resolve => {
            webdavRequest({ method: 'PROPFIND', url: folder }, res => {
                if (res.status === 404) {
                    webdavRequest({ method: 'MKCOL', url: folder }, () => resolve());
                } else {
                    resolve();
                }
            });
        });
    }

    // 拉取同步（下载所有文件）
    function syncFromWebDAV() {
        if (!webdavConfig.enabled || !webdavConfig.url) return Promise.resolve(false);

        return ensureFolder().then(() => {
            const files = Object.entries(WEBDAV_FILES);
            return Promise.all(files.map(([key, fileName]) =>
                downloadFile(fileName).then(remoteData => {
                    if (!remoteData) return false;

                    const localTS = webdavConfig.lastSync || 0;
                    const remoteTS = remoteData.lastModified || 0;
                    if (remoteTS <= localTS) return false;

                    // 按文件类型合并到本地
                    if (key === 'settings') {
                        const d = remoteData.data || {};
                        if (typeof d.timeFilterDays === 'number') {
                            timeFilterDays = d.timeFilterDays;
                            GM_setValue(TIME_FILTER_DAYS_KEY, timeFilterDays);
                            return true;
                        }
                        return false;
                    }

                    // keywords, sourceKeywords, superTopicKeywords, blockedIds
                    if (Array.isArray(remoteData.data)) {
                        window[key] = remoteData.data;
                        GM_setValue(STORAGE_PREFIX + key.toLowerCase(), remoteData.data);
                        return true;
                    }
                    return false;
                })
            )).then(results => {
                const updated = results.some(Boolean);
                if (updated) {
                    updateLastSync(Date.now());
                    const msg = '✅ 已从云端同步数据';
                    console.log(msg);
                    showNotification(msg);
                } else {
                    console.log('✅ 本地已是最新，无需操作');
                }
                return updated;
            });
        });
    }

    // 推送同步（上传所有文件）
    function syncToWebDAV(reason = '手动同步') {
        if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
            console.log('请配置 WebDAV');
            return Promise.resolve(false);
        }

        return ensureFolder().then(() => {
            const localData = getLocalDataByFile();
            const uploads = Object.entries(WEBDAV_FILES).map(([key, fileName]) =>
                uploadFile(fileName, localData[key])
            );
            return Promise.all(uploads).then(results => {
                const allSuccess = results.every(Boolean);
                if (allSuccess) {
                    updateLastSync(Date.now());
                    console.log(`📤 上传成功 (${reason})`);
                } else {
                    console.log('❌ 部分文件上传失败');
                }
                return allSuccess;
            });
        });
    }

    // =============== WebDAV 相关逻辑 END ===============

    // 强类型检查辅助函数
    function ensureArray(value, fallback = []) {
        if (Array.isArray(value)) {
            return value;
        }

        // 如果是字符串且看起来像是理由/描述，返回fallback
        if (typeof value === 'string' && (value.includes('屏蔽用户:') || value.includes('快捷键添加'))) {
            console.warn('检测到错误传递的字符串参数，使用fallback:', value);
            return Array.isArray(fallback) ? fallback : [];
        }

        // 如果是字符串，尝试按行分割
        if (typeof value === 'string') {
            return value.split('\n').filter(line => line.trim().length > 0);
        }

        // 其他情况返回空数组
        console.warn('无法修复的数据类型，返回空数组:', typeof value, value);
        return [];
    }

    // 保存关键词函数
    function saveKeywordsAndSync(newKeywords, newBlockedIds, newSourceKeywords, newSuperTopicKeywords, reason = '手动修改') {
        // ✅ 更新内存数据
        keywords = ensureArray(newKeywords, keywords);
        blockedIds = ensureArray(newBlockedIds, blockedIds);
        sourceKeywords = ensureArray(newSourceKeywords, sourceKeywords);
        superTopicKeywords = ensureArray(newSuperTopicKeywords, superTopicKeywords);

        // ✅ 本地保存（始终执行）
        GM_setValue(STORAGE_PREFIX + 'keywords', keywords);
        GM_setValue(STORAGE_PREFIX + 'blocked_ids', blockedIds);
        GM_setValue(STORAGE_PREFIX + 'source_keywords', sourceKeywords);
        GM_setValue(STORAGE_PREFIX + 'super_topic_keywords', superTopicKeywords);
        GM_setValue(TIME_FILTER_DAYS_KEY, timeFilterDays);

        console.log(`📦 已保存到本地 (${reason})：`, {
            keywordsCount: keywords.length,
            blockedIdsCount: blockedIds.length,
            sourceKeywordsCount: sourceKeywords.length,
            superTopicKeywordsCount: superTopicKeywords.length,
            timeFilterDays: timeFilterDays
        });

        // ✅ 同步到 WebDAV
        if (webdavConfig && webdavConfig.enabled) {
            syncToWebDAV(reason);
        }

        return true;
    }

    // 显示关键词管理器
    function showKeywordManager() {
        // 添加类型检查和安全处理
        if (!Array.isArray(sourceKeywords)) {
            console.warn('sourceKeywords 不是数组，正在修复:', sourceKeywords);
            sourceKeywords = Array.isArray(sourceKeywords) ? sourceKeywords : [];
            // 保存修复后的数据
            GM_setValue(STORAGE_PREFIX + 'source_keywords', sourceKeywords);
        }

        if (!Array.isArray(keywords)) {
            console.warn('keywords 不是数组，正在修复:', keywords);
            keywords = Array.isArray(keywords) ? keywords : [];
            GM_setValue(STORAGE_PREFIX + 'keywords', keywords);
        }

        if (!Array.isArray(blockedIds)) {
            console.warn('blockedIds 不是数组，正在修复:', blockedIds);
            blockedIds = Array.isArray(blockedIds) ? blockedIds : [];
            GM_setValue(STORAGE_PREFIX + 'blocked_ids', blockedIds);
        }

        // 如果已经存在，先移除
        if (keywordManager) {
            keywordManager.remove();
        }

        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'keyword-manager-overlay';


        // 在 textarea 的值设置处也要确保是数组
        const safeSourceKeywords = Array.isArray(sourceKeywords) ? sourceKeywords : [];
        const safeKeywords = Array.isArray(keywords) ? keywords : [];
        const safeBlockedIds = Array.isArray(blockedIds) ? blockedIds : [];
        const safeSuperTopicKeywords = Array.isArray(superTopicKeywords) ? superTopicKeywords : [];

        // 创建管理器模态框
        const manager = document.createElement('div');
        manager.className = 'keyword-manager-modal';
        manager.innerHTML = `
            <div class="keyword-manager">
                <h3>屏蔽管理</h3>
                <p style="margin: 0 0 10px 0; font-size: 12px; color: var(--help-color, #666);">
                    推荐标签已内置: ${HIDDEN_TAGS.join(', ')}
                </p>
                <div class="tabs">
                    <button class="tab active" data-tab="keywords">关键词屏蔽</button>
                    <button class="tab" data-tab="sources">来源屏蔽</button>
                    <button class="tab" data-tab="ids">用户ID屏蔽</button>
                    <button class="tab" data-tab="supertopics">超话屏蔽</button>
                </div>
                <textarea id="keywords-textarea" placeholder="每行一个关键词&#10;&#10;普通关键词示例：&#10;推广&#10;营销&#10;&#10;正则表达式示例：&#10;/推广.*活动/&#10;/\\d+元优惠/&#10;">${safeKeywords.join('\n')}</textarea>
                <textarea id="sources-textarea" placeholder="每行一个来源关键词&#10;&#10;来源关键词示例：&#10;iPhone客户端&#10;微博 weibo.com&#10;HUAWEI&#10;&#10;正则表达式示例：&#10;/iPhone.*客户端/&#10;/.*广告平台.*/" style="display: none;">${safeSourceKeywords.join('\n')}</textarea>
                <textarea id="ids-textarea" placeholder="每行一个用户ID&#10;&#10;用户ID示例：&#10;6510119885&#10;1234567890&#10;&#10;注意：用户ID是数字ID，不是昵称" style="display: none;">${safeBlockedIds.join('\n')}</textarea>
                <textarea id="supertopics-textarea" placeholder="每行一个超话关键词&#10;&#10;超话关键词示例：&#10;黑袍纠察队&#10;FGO&#10;&#10;正则表达式示例：&#10;/.*KPL.*/&#10;/^韩剧/" style="display: none;">${safeSuperTopicKeywords.join('\n')}</textarea>
                <div class="button-group">
                    <button class="close-btn">取消</button>
                    <button class="save-btn">保存</button>
                </div>
                <div class="help-text">
                    <div id="keywords-help">
                        <div><strong>关键词屏蔽说明：</strong></div>
                        <div>• 普通关键词：直接匹配微博文本内容</div>
                        <div>• 正则表达式：用 // 包裹，如 /推广\d+元/</div>
                        <div>• 每行输入一个关键词</div>
                        <div>• 推荐标签已内置，无需重复添加</div>
                        <div>• 按 F8 键将选中文本添加到屏蔽词</div>
                    </div>
                    <div id="sources-help" style="display: none;">
                        <div><strong>来源屏蔽说明：</strong></div>
                        <div>• 每行输入一个来源关键词</div>
                        <div>• 来源通常显示在微博时间后方（如"iPhone客户端"）</div>
                        <div>• 支持正则表达式匹配</div>
                        <div>• 按 F9 键将选中文本添加到来源屏蔽词</div>
                        <div>• 可用于屏蔽特定客户端或推广来源</div>
                    </div>
                    <div id="ids-help" style="display: none;">
                        <div><strong>用户ID屏蔽说明：</strong></div>
                        <div>• 每行输入一个用户数字ID</div>
                        <div>• 用户ID可在博主主页链接中找到</div>
                        <div>• 点击微博旁的"屏蔽"按钮可快速添加用户ID</div>
                        <div>• 屏蔽后该用户的所有微博都将被隐藏</div>
                    </div>
                    <div id="supertopics-help" style="display: none;">
                        <div><strong>超话屏蔽说明：</strong></div>
                        <div>• 每行输入一个超话关键词</div>
                        <div>• 仅对带有超话标签的微博执行屏蔽</div>
                        <div>• 支持正则表达式匹配</div>
                        <div>• 按 F10 键将选中文本添加到超话屏蔽词</div>
                        <div>• 无超话标签的微博不受影响</div>
                    </div>
                </div>
            </div>
        `;

        // 标签切换功能
        const tabs = manager.querySelectorAll('.tab');
        const textareas = {
            keywords: manager.querySelector('#keywords-textarea'),
            sources: manager.querySelector('#sources-textarea'),
            ids: manager.querySelector('#ids-textarea'),
            supertopics: manager.querySelector('#supertopics-textarea')
        };
        const helps = {
            keywords: manager.querySelector('#keywords-help'),
            sources: manager.querySelector('#sources-help'),
            ids: manager.querySelector('#ids-help'),
            supertopics: manager.querySelector('#supertopics-help')
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', function () {
                // 移除所有active类
                tabs.forEach(t => t.classList.remove('active'));
                // 隐藏所有文本域和帮助
                Object.values(textareas).forEach(ta => ta.style.display = 'none');
                Object.values(helps).forEach(help => help.style.display = 'none');

                // 激活当前标签
                this.classList.add('active');
                const tabType = this.dataset.tab;
                textareas[tabType].style.display = 'block';
                helps[tabType].style.display = 'block';
            });
        });

        // 保存按钮事件
        manager.querySelector('.save-btn').addEventListener('click', function () {
            const keywordsText = textareas.keywords.value;
            const sourcesText = textareas.sources.value;
            const idsText = textareas.ids.value;
            const supertopicsText = textareas.supertopics.value;

            // 更新全局变量
            keywords = keywordsText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            sourceKeywords = sourcesText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            blockedIds = idsText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            superTopicKeywords = supertopicsText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            saveKeywordsAndSync(keywords, blockedIds, sourceKeywords, superTopicKeywords, '通过管理器修改');

            // 关闭管理器
            overlay.remove();
            manager.remove();
            keywordManager = null;

            // 重新执行屏蔽
            hideContent();

            // 强制更新页面布局
            forceLayoutUpdate();
        });

        // 关闭按钮事件
        manager.querySelector('.close-btn').addEventListener('click', function () {
            overlay.remove();
            manager.remove();
            keywordManager = null;
        });

        // 点击遮罩层关闭
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.remove();
                manager.remove();
                keywordManager = null;
            }
        });

        // 添加到页面
        document.body.appendChild(overlay);
        document.body.appendChild(manager);
        keywordManager = manager;

        // 聚焦到关键词文本框
        textareas.keywords.focus();
    }

    // 检查文本是否匹配关键词
    function isTextMatched(text) {
        for (const keyword of keywords) {
            if (keyword.startsWith('/') && keyword.endsWith('/')) {
                // 正则表达式
                try {
                    const pattern = keyword.slice(1, -1);
                    const regex = new RegExp(pattern);
                    if (regex.test(text)) {
                        return { type: 'regex', keyword: keyword };
                    }
                } catch (e) {
                    console.warn('无效的正则表达式:', keyword, e);
                }
            } else {
                // 普通关键词
                if (text.includes(keyword)) {
                    return { type: 'normal', keyword: keyword };
                }
            }
        }
        return null;
    }

    // 检查来源是否匹配关键词
    function isSourceMatched(sourceText) {
        for (const keyword of sourceKeywords) {
            if (keyword.startsWith('/') && keyword.endsWith('/')) {
                // 正则表达式
                try {
                    const pattern = keyword.slice(1, -1);
                    const regex = new RegExp(pattern);
                    if (regex.test(sourceText)) {
                        return { type: 'regex', keyword: keyword };
                    }
                } catch (e) {
                    console.warn('无效的正则表达式:', keyword, e);
                }
            } else {
                // 普通关键词
                if (sourceText.includes(keyword)) {
                    return { type: 'normal', keyword: keyword };
                }
            }
        }
        return null;
    }

    // 检查超话是否匹配关键词
    function isSuperTopicMatched(topicText) {
        for (const keyword of superTopicKeywords) {
            if (keyword.startsWith('/') && keyword.endsWith('/')) {
                try {
                    const pattern = keyword.slice(1, -1);
                    const regex = new RegExp(pattern);
                    if (regex.test(topicText)) {
                        return { type: 'regex', keyword: keyword };
                    }
                } catch (e) {
                    console.warn('无效的正则表达式:', keyword, e);
                }
            } else {
                if (topicText.includes(keyword)) {
                    return { type: 'normal', keyword: keyword };
                }
            }
        }
        return null;
    }

    // 检查用户ID是否在屏蔽列表中
    function isUserIdBlocked(userId) {
        return blockedIds.includes(userId);
    }

    function getUserNameFromLink(userLink, fallback = '未知用户', feedBody) {
        if (!userLink) return fallback;

        const nameSpan = userLink.querySelector('span');
        let rawName = nameSpan?.getAttribute('title') ||
            nameSpan?.textContent ||
            userLink.getAttribute('title') ||
            userLink.textContent ||
            '';

        rawName = rawName.trim().replace(/^@/, '');
        if (rawName) return rawName;

        // 最后尝试从头像 alt 属性获取
        if (feedBody) {
            const avatarImg = feedBody.querySelector('.woo-avatar-main img, .woo-avatar-img');
            if (avatarImg) {
                const alt = avatarImg.getAttribute('alt');
                if (alt && alt.trim()) return alt.trim();
            }
        }

        return fallback;
    }

    function getUserIdFromLink(userLink) {
        if (!userLink) return '';

        const usercard = userLink.getAttribute('usercard');
        if (usercard) return usercard;

        const href = userLink.getAttribute('href') || '';
        const match = href.match(/\/u\/(\d+)/);
        return match ? match[1] : '';
    }

    // 在容器中查找用户名文本链接（跳过头像链接）
    function findUserNameLink(container) {
        if (!container) return null;

        // 策略1: 查找 href 包含 /u/ 的链接（跳过含图片的）
        const allLinks = container.querySelectorAll('a[href*="/u/"]');
        for (const link of allLinks) {
            if (link.closest('.woo-avatar-main') || link.querySelector('img')) continue;
            return link;
        }

        // 策略2: 查找 span[usercard] 的父链接（超话布局中 href 为空的情况）
        const spannedUsercard = container.querySelector('a span[usercard]');
        if (spannedUsercard) return spannedUsercard.closest('a');

        // 策略3: 查找 a[usercard] 且不含图片的链接
        const linkWithUsercard = container.querySelector('a[usercard]:not(.woo-avatar-main a)');
        if (linkWithUsercard && !linkWithUsercard.querySelector('img')) return linkWithUsercard;

        // 降级：返回第一个非头像的 a[href*="/u/"]
        return allLinks[0] || null;
    }

    function addFeedAuthor(authors, seenIds, userId, userName, role) {
        if (!userId || seenIds.has(userId)) return;

        seenIds.add(userId);
        authors.push({
            id: userId,
            name: userName || '未知用户',
            role
        });
    }

    function getFeedAuthors(feedBody) {
        const authors = [];
        const seenIds = new Set();
        if (!feedBody) return authors;

        const header = feedBody.querySelector('header');
        const mainAvatar = header?.querySelector(SELECTORS.avatar) || feedBody.querySelector(SELECTORS.avatar);
        const mainUserId = mainAvatar?.getAttribute('usercard') || '';
        const mainUserLink = findUserNameLink(header || feedBody);

        addFeedAuthor(authors, seenIds, mainUserId, getUserNameFromLink(mainUserLink, '未知用户', feedBody), '主作者');

        const retweetLinks = feedBody.querySelectorAll([
            '.retweet a[usercard]',
            '.retweet a[href*="/u/"]',
            '[class*="retweet"] a[usercard]',
            '[class*="retweet"] a[href*="/u/"]',
            '.wbpro-feed-reText a[usercard]',
            '.wbpro-feed-reText a[href*="/u/"]',
            '[class*="_reText_"] a[usercard]',
            '[class*="_reText_"] a[href*="/u/"]'
        ].join(', '));

        retweetLinks.forEach(userLink => {
            const userId = getUserIdFromLink(userLink);
            addFeedAuthor(authors, seenIds, userId, getUserNameFromLink(userLink, '未知用户', feedBody), '转发原作者');
        });

        return authors;
    }

    // 显示通知
    function showNotification(message, timeout = 3000) {
        // 备用方案：在页面右上角显示临时提示
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10001;
            font-size: 14px;
            max-width: 300px;
            word-break: break-all;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, timeout);
    }

    // 处理快捷键添加屏蔽词
    function handleKeyPress(event) {
        // 检查是否按下了 F8 键（keyCode 119）
        if (event.keyCode === 119 && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
            const selectedText = window.getSelection().toString().trim();

            if (selectedText && selectedText.length > 0) {
                // 防止默认行为
                event.preventDefault();
                event.stopPropagation();

                // 检查是否已存在该关键词
                if (!keywords.includes(selectedText)) {
                    // 添加到关键词列表
                    keywords.push(selectedText);
                    saveKeywordsAndSync(keywords, blockedIds, sourceKeywords, superTopicKeywords, `快捷键添加: ${selectedText}`);

                    // 显示成功提示
                    showNotification(`✅ 已添加屏蔽词: "${selectedText}"`);

                    // 立即执行一次匹配处理
                    hideContent();

                    // 强制更新页面布局
                    forceLayoutUpdate();

                    console.log(`✅ 快捷键添加屏蔽关键词: "${selectedText}"`);
                } else {
                    showNotification(`ℹ️ 屏蔽词已存在: "${selectedText}"`);
                }
            } else {
                showNotification('⚠️ 请先选择要屏蔽的文本');
            }
        }

        // 检查是否按下了 F9 键（keyCode 120）
        if (event.keyCode === 120 && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
            const selectedText = window.getSelection().toString().trim();

            if (selectedText && selectedText.length > 0) {
                // 防止默认行为
                event.preventDefault();
                event.stopPropagation();

                // 检查是否已存在该来源关键词
                if (!sourceKeywords.includes(selectedText)) {
                    // 添加到来源关键词列表
                    const newSourceKeywords = [...sourceKeywords, selectedText];
                    saveKeywordsAndSync(keywords, blockedIds, newSourceKeywords, superTopicKeywords, `快捷键添加来源: ${selectedText}`);

                    // 显示成功提示
                    showNotification(`✅ 已添加来源屏蔽词: "${selectedText}"`);

                    // 立即执行一次匹配处理
                    hideContent();

                    // 强制更新页面布局
                    forceLayoutUpdate();

                    console.log(`✅ 快捷键添加来源屏蔽关键词: "${selectedText}"`);
                } else {
                    showNotification(`ℹ️ 来源屏蔽词已存在: "${selectedText}"`);
                }
            } else {
                showNotification('⚠️ 请先选择要屏蔽的来源文本');
            }
        }

        // 检查是否按下了 F10 键（keyCode 121）
        if (event.keyCode === 121 && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
            const selectedText = window.getSelection().toString().trim();

            if (selectedText && selectedText.length > 0) {
                // 防止默认行为
                event.preventDefault();
                event.stopPropagation();

                // 检查是否已存在该超话关键词
                if (!superTopicKeywords.includes(selectedText)) {
                    // 添加到超话关键词列表
                    const newSuperTopicKeywords = [...superTopicKeywords, selectedText];
                    saveKeywordsAndSync(keywords, blockedIds, sourceKeywords, newSuperTopicKeywords, `快捷键添加超话: ${selectedText}`);

                    // 显示成功提示
                    showNotification(`✅ 已添加超话屏蔽词: "${selectedText}"`);

                    // 立即执行一次匹配处理
                    hideContent();

                    // 强制更新页面布局
                    forceLayoutUpdate();

                    console.log(`✅ 快捷键添加超话屏蔽词: "${selectedText}"`);
                } else {
                    showNotification(`ℹ️ 超话屏蔽词已存在: "${selectedText}"`);
                }
            } else {
                showNotification('⚠️ 请先选择要屏蔽的超话文本');
            }
        }
    }

    // =============== 通用右键菜单 START ===============

    function showContextMenu(e, items) {
        e.preventDefault();
        e.stopPropagation();

        // 移除已有的右键菜单
        document.querySelectorAll('.super-topic-context-menu').forEach(el => el.remove());

        const menu = document.createElement('div');
        menu.className = 'super-topic-context-menu';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'super-topic-context-menu-item';
            if (item.html) {
                el.innerHTML = item.html;
            } else {
                el.textContent = item.text;
            }
            if (item.color) el.style.color = item.color;
            el.addEventListener('click', (ev) => {
                ev.stopPropagation();
                item.action();
                menu.remove();
            });
            menu.appendChild(el);
        });

        // 添加"取消"分隔
        const divider = document.createElement('div');
        divider.style.cssText = 'height:1px;background:var(--ctx-border,#ddd);margin:4px 0;';
        menu.appendChild(divider);
        const cancelItem = document.createElement('div');
        cancelItem.className = 'super-topic-context-menu-item';
        cancelItem.textContent = '取消';
        cancelItem.style.color = '#999';
        cancelItem.addEventListener('click', () => menu.remove());
        menu.appendChild(cancelItem);

        document.body.appendChild(menu);

        // 调整菜单位置，防止溢出屏幕
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
        }

        // 点击其他区域关闭菜单
        const closeHandler = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeHandler);
                document.removeEventListener('contextmenu', closeHandler);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeHandler);
            document.addEventListener('contextmenu', closeHandler);
        }, 0);
    }

    // 超话右键菜单
    function showSuperTopicContextMenu(e, topicText) {
        showContextMenu(e, [{
            html: `添加到超话屏蔽列表：<span class="highlight">${topicText}</span>`,
            action: () => {
                if (!superTopicKeywords.includes(topicText)) {
                    const newSuperTopicKeywords = [...superTopicKeywords, topicText];
                    saveKeywordsAndSync(keywords, blockedIds, sourceKeywords, newSuperTopicKeywords, `右键屏蔽超话: ${topicText}`);
                    showNotification(`✅ 已屏蔽超话: "${topicText}"`);
                    hideContent();
                    forceLayoutUpdate();
                } else {
                    showNotification(`ℹ️ 超话"${topicText}"已在屏蔽列表中`);
                }
            }
        }]);
    }

    // 用户右键菜单
    function showUserContextMenu(e, userId, userName) {
        const displayName = userName || '未知用户';
        showContextMenu(e, [{
            html: `屏蔽用户：<span class="highlight">${displayName}</span>`,
            action: () => {
                if (!blockedIds.includes(userId)) {
                    const newBlockedIds = [...blockedIds, userId];
                    saveKeywordsAndSync(keywords, newBlockedIds, sourceKeywords, superTopicKeywords, `右键屏蔽用户: ${displayName}`);
                    showNotification(`✅ 已屏蔽用户: "${displayName}"`);
                    hideContent();
                    forceLayoutUpdate();
                } else {
                    showNotification(`ℹ️ 用户"${displayName}"已在屏蔽列表中`);
                }
            }
        }]);
    }

    // =============== 通用右键菜单 END ===============

    // 添加屏蔽按钮到用户名称旁
    function addBlockButtons() {
        // 如果设置为不显示按钮,直接返回
        if (!showBlockButton) {
            return;
        }

        const feedItems = document.querySelectorAll(SELECTORS.feedBody);

        feedItems.forEach((feedItem) => {
            if (feedItem.querySelector('.weibo-block-btn')) return;

            // 查找用户头像链接（更稳定的方式）
            const avatarDiv = feedItem.querySelector('.woo-avatar-main[usercard]');
            if (!avatarDiv) return;

            const userId = avatarDiv.getAttribute('usercard');

            // 查找用户名链接（跳过头像链接）
            const userLink = findUserNameLink(feedItem);
            if (!userLink) return;
            let userName = '未知用户';
            const userSpan = userLink.querySelector('span');
            if (userSpan) {
                userName = userSpan.getAttribute('title') || userSpan.textContent || userName;
            }
            // 如果还是未知用户，尝试从头像的 alt 属性获取
            if (userName === '未知用户') {
                const avatarImg = feedItem.querySelector('.woo-avatar-main img, .woo-avatar-img');
                if (avatarImg) {
                    userName = avatarImg.getAttribute('alt') || userName;
                }
            }

            if (!userId) return;

            // 创建屏蔽按钮
            const blockBtn = document.createElement('button');
            blockBtn.className = 'weibo-block-btn';
            blockBtn.textContent = '屏蔽';
            blockBtn.title = `屏蔽用户 ${userName} (ID: ${userId})`;
            blockBtn.style.cssText = `
                padding: 2px 8px;
                border: 1px solid #d0d0d0;
                border-radius: 3px;
                background: transparent;
                color: #8590a6;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
                margin-left: 8px;
                vertical-align: middle;
            `;

            // 悬停效果
            blockBtn.addEventListener('mouseenter', () => {
                blockBtn.style.borderColor = '#f1403c';
                blockBtn.style.color = '#f1403c';
                blockBtn.style.background = 'rgba(241, 64, 60, 0.05)';
            });

            blockBtn.addEventListener('mouseleave', () => {
                blockBtn.style.borderColor = '#d0d0d0';
                blockBtn.style.color = '#8590a6';
                blockBtn.style.background = 'transparent';
            });

            // 按钮点击事件
            blockBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                // 添加用户ID到屏蔽列表
                if (!blockedIds.includes(userId)) {
                    const newBlockedIds = [...blockedIds, userId];
                    saveKeywordsAndSync(keywords, newBlockedIds, sourceKeywords, superTopicKeywords, `屏蔽用户: ${userName}`);

                    console.log(`✅ 已屏蔽用户: "${userName}" (ID: ${userId})`);

                    // 显示成功提示
                    showNotification(`已屏蔽用户: ${userName}`);

                    // 调用 hideContent 统一处理屏蔽逻辑
                    hideContent();

                    // 强制更新页面布局
                    forceLayoutUpdate();
                } else {
                    showNotification(`用户 ${userName} 已在屏蔽列表中`);
                }
            });

            // 始终插入到用户名链接后面
            userLink.parentNode.insertBefore(blockBtn, userLink.nextSibling);
        });

        // 为评论区添加屏蔽按钮
        addCommentBlockButtons();
    }

    // 为评论区用户添加屏蔽按钮
    function addCommentBlockButtons() {
        // 如果设置为不显示按钮,直接返回
        if (!showBlockButton) {
            return;
        }

        // 查找所有评论列表，包括刚加载的
        const commentLists = document.querySelectorAll('.wbpro-list');

        commentLists.forEach(list => {
            // 查找该评论区内的所有评论项
            const commentItems = list.querySelectorAll('.item1');

            commentItems.forEach(item => {
                // 检查是否已经添加过按钮
                if (item.querySelector('.weibo-block-btn-comment')) {
                    return;
                }

                // 查找评论中的用户头像（包含 usercard 属性）
                const avatarDiv = item.querySelector('.woo-avatar-main[usercard]');
                if (!avatarDiv) return;

                const userId = avatarDiv.getAttribute('usercard');
                if (!userId) return;

                // 查找用户名链接
                const userLink = item.querySelector('a[usercard]');
                if (!userLink) return;

                // 获取用户名
                let userName = userLink.textContent.trim() || '未知用户';

                // 创建屏蔽按钮
                const blockBtn = document.createElement('button');
                blockBtn.className = 'weibo-block-btn weibo-block-btn-comment';
                blockBtn.textContent = '屏蔽';
                blockBtn.title = `屏蔽用户 ${userName} (ID: ${userId})`;

                // 按钮点击事件
                blockBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    // 添加用户ID到屏蔽列表
                    if (!blockedIds.includes(userId)) {
                        const newBlockedIds = [...blockedIds, userId];
                        saveKeywordsAndSync(keywords, newBlockedIds, sourceKeywords, superTopicKeywords, `屏蔽评论用户: ${userName}`);

                        console.log(`✅ 已屏蔽评论用户: "${userName}" (ID: ${userId})`);
                        showNotification(`已屏蔽用户: ${userName}`);

                        // 调用 hideContent 统一处理屏蔽逻辑
                        hideContent();
                        forceLayoutUpdate();
                    } else {
                        showNotification(`用户 ${userName} 已在屏蔽列表中`);
                    }
                });

                // 将按钮添加到用户链接后面
                userLink.parentNode.insertBefore(blockBtn, userLink.nextSibling);
            });
        });
    }

    // 强制更新页面布局
    function forceLayoutUpdate() {
        requestAnimationFrame(() => {
            hideContent();
            scheduleAutoExpand();
        });
    }

    function hasTipsAdClass(element) {
        if (!element || !element.className || typeof element.className !== 'string') return false;
        return element.className.split(/\s+/).some(className => className.startsWith('TipsAd'));
    }

    function hideStandaloneElement(element) {
        if (!element || !element.style || element.dataset.weiboCompositeHidden === 'true') return false;

        element.style.display = 'none';
        element.style.visibility = 'hidden';
        element.style.opacity = '0';
        element.style.height = '0';
        element.style.width = '0';
        element.style.margin = '0';
        element.style.padding = '0';
        element.style.pointerEvents = 'none';
        element.style.position = 'absolute';
        element.style.left = '-9999px';
        element.style.top = '-9999px';
        element.style.overflow = 'hidden';
        element.dataset.weiboCompositeHidden = 'true';
        return true;
    }

    function findSidebarCardsByTitle(root = document, titleText) {
        const cards = [];
        const titles = [];

        if (root.nodeType === 1 && root.matches?.(SELECTORS.sideTitle)) {
            titles.push(root);
        }
        root.querySelectorAll?.(SELECTORS.sideTitle).forEach(title => titles.push(title));

        titles.forEach(title => {
            if (!title.textContent.includes(titleText)) return;

            const card = title.closest('.wbpro-side') || title.closest('.woo-panel-main');
            if (card) cards.push(card);
        });

        return cards;
    }

    function hasSidebarCardByTitle(root, titleText) {
        if (!root) return false;
        if (root.nodeType === 1 && root.matches?.(SELECTORS.sideTitle) && root.textContent.includes(titleText)) {
            return true;
        }
        return Boolean(root.querySelector?.(SELECTORS.sideTitle) && root.textContent.includes(titleText));
    }

    function findInterestedPeopleCards(root = document) {
        return findSidebarCardsByTitle(root, '你可能感兴趣的人');
    }

    function hasInterestedPeopleCard(root) {
        return hasSidebarCardByTitle(root, '你可能感兴趣的人');
    }

    function findCreatorCenterCards(root = document) {
        return findSidebarCardsByTitle(root, '创作者中心');
    }

    function hasCreatorCenterCard(root) {
        return hasSidebarCardByTitle(root, '创作者中心');
    }

    function findRightSidebarContainers(root = document) {
        const sidebars = [];

        if (root.nodeType === 1 && root.matches?.(SELECTORS.rightSidebar)) {
            sidebars.push(root);
        }
        root.querySelectorAll?.(SELECTORS.rightSidebar).forEach(sidebar => sidebars.push(sidebar));

        return sidebars.map(sidebar => {
            const parent = sidebar.parentElement;
            if (parent && [...parent.classList].some(className => /^_side_/.test(className))) {
                return parent;
            }
            return sidebar;
        });
    }

    function hasRightSidebar(root) {
        if (!root) return false;
        if (root.nodeType === 1 && root.matches?.(SELECTORS.rightSidebar)) {
            return true;
        }
        return Boolean(root.querySelector?.(SELECTORS.rightSidebar));
    }

    function hideHomeMidAd(root = document) {
        if (!hideHomeMidAdEnabled) return;
        const ads = [];
        if (root.nodeType === 1 && root.matches?.(SELECTORS.homeMidAd)) {
            ads.push(root);
        }
        root.querySelectorAll?.(SELECTORS.homeMidAd).forEach(el => ads.push(el));
        let hidden = 0;
        [...new Set(ads)].forEach(el => { if (hideStandaloneElement(el)) hidden++; });
        if (hidden > 0) console.log(`🚫 已隐藏 ${hidden} 个首页中栏广告`);
    }

    function hideStandaloneSidebarWidgets(root = document) {
        if (!hideRightSidebarEnabled && !hideHotSearchEnabled && !hideHomeAdsEnabled && !hideInterestedPeopleEnabled && !hideCreatorCenterEnabled) {
            return;
        }

        const elements = [];

        if (hideRightSidebarEnabled) {
            elements.push(...findRightSidebarContainers(root));
        }

        if (root.nodeType === 1) {
            if ((hideHotSearchEnabled && root.matches?.(SELECTORS.hotBand)) ||
                (hideHomeAdsEnabled && hasTipsAdClass(root))) {
                elements.push(root);
            }
            root.querySelectorAll?.(`${SELECTORS.hotBand}, ${SELECTORS.tipsAd}`).forEach(element => {
                if ((hideHotSearchEnabled && element.matches(SELECTORS.hotBand)) ||
                    (hideHomeAdsEnabled && hasTipsAdClass(element))) {
                    elements.push(element);
                }
            });
        } else {
            root.querySelectorAll?.(`${SELECTORS.hotBand}, ${SELECTORS.tipsAd}`).forEach(element => {
                if ((hideHotSearchEnabled && element.matches(SELECTORS.hotBand)) ||
                    (hideHomeAdsEnabled && hasTipsAdClass(element))) {
                    elements.push(element);
                }
            });
        }
        if (hideInterestedPeopleEnabled) {
            elements.push(...findInterestedPeopleCards(root));
        }
        if (hideCreatorCenterEnabled) {
            elements.push(...findCreatorCenterCards(root));
        }

        let hidden = 0;
        [...new Set(elements)].forEach(element => {
            if (hideStandaloneElement(element)) hidden++;
        });

        if (hidden > 0) {
            console.log(`🚫 已隐藏 ${hidden} 个右侧栏元素`);
        }
    }

    function hideTopNavButtons(root = document) {
        if (!hideTopRecommendEnabled && !hideTopVideoEnabled) {
            return;
        }

        const links = [];
        if (root.nodeType === 1) {
            if (hideTopRecommendEnabled && root.matches?.(SELECTORS.topRecommendLink)) {
                links.push(root);
            }
            if (hideTopVideoEnabled && root.matches?.(SELECTORS.topVideoLink)) {
                links.push(root);
            }
        }

        if (hideTopRecommendEnabled) {
            root.querySelectorAll?.(SELECTORS.topRecommendLink).forEach(link => links.push(link));
        }
        if (hideTopVideoEnabled) {
            root.querySelectorAll?.(SELECTORS.topVideoLink).forEach(link => links.push(link));
        }

        let hidden = 0;
        [...new Set(links)].forEach(link => {
            if (hideStandaloneElement(link)) hidden++;
        });

        if (hidden > 0) {
            console.log(`🚫 已隐藏 ${hidden} 个顶部导航按钮`);
        }
    }

    // 修改用户ID屏蔽逻辑
    function hideContent() {
        // 批量收集需要处理的元素
        const tasks = [];

        // 微博详情页保留原始微博及评论，不应用内容屏蔽规则。
        if (!isWeiboDetailPage()) {
            // 先添加屏蔽按钮（一次性处理）
            addBlockButtons();

            // 收集所有需要屏蔽的元素
            tasks.push(() => hideByTags());
            tasks.push(() => hideByKeywords());
            tasks.push(() => hideByUserId());
            tasks.push(() => hideBySourceKeywords());
            tasks.push(() => hideBySuperTopic());
            tasks.push(() => hideByTimeFilter());
            tasks.push(() => hideCommentsByUserId());
            tasks.push(() => hideByAIContent());
        }

        // 页面组件清理不属于微博内容屏蔽，详情页继续生效。
        tasks.push(() => hideHomeMidAd());
        tasks.push(() => hideStandaloneSidebarWidgets());
        tasks.push(() => hideTopNavButtons());

        // 使用requestAnimationFrame批量执行，减少重排
        requestAnimationFrame(() => {
            tasks.forEach(task => task());
        });
    }

    // 判断当前页面是否为热搜页
    function isHotWeiboPage() {
        return location.pathname.startsWith('/hot/weibo/');
    }

    // 判断当前页面是否为单条微博详情页。
    function isWeiboDetailPage() {
        const pathname = location.pathname.replace(/\/+$/, '');

        return /^\/\d+\/[A-Za-z0-9]+$/.test(pathname) ||
            /^\/(?:status|detail)\/[A-Za-z0-9]+$/.test(pathname);
    }

    // 通用隐藏处理函数
    function applyHiddenStyle(feedBody, message, reason) {
        if (isWeiboDetailPage() ||
            !feedBody ||
            feedBody.classList.contains('custom-hidden') ||
            isProcessed(feedBody, reason)) {
            return false;
        }

        feedBody.classList.add('custom-hidden');
        markAsProcessed(feedBody, reason);

        // 找到最外层容器
        const scrollerItem = feedBody.closest('.wbpro-scroller-item') ||
            feedBody.closest('.vue-recycle-scroller__item-view');
        const article = feedBody.closest('article');

        // 使用CSS类替代内联样式，减少重排
        if (scrollerItem) {
            scrollerItem.classList.add(showPlaceholder ? 'blocked-item-with-placeholder' : 'blocked-item-hidden');
        }

        if (article) {
            article.classList.add(showPlaceholder ? 'blocked-article-with-placeholder' : 'blocked-article-hidden');
        }

        const parent = feedBody.parentElement;
        if (!parent) return false;

        // 批量隐藏子元素
        const children = Array.from(parent.children);
        children.forEach(child => {
            if (!child.classList.contains('custom-hidden-message') &&
                !child.classList.contains('time-filter-hidden-message')) {
                child.style.display = 'none';
            }
        });

        // 处理占位显示
        if (showPlaceholder) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'custom-hidden-message';
            messageDiv.innerHTML = `<div class="message-content">${message}</div>`;
            parent.appendChild(messageDiv);
        } else {
            parent.style.display = 'none';
        }

        return true;
    }

    // 通过标签屏蔽
    function isAdTagImage(img) {
        if (!img) {
            return false;
        }

        const src = img.currentSrc || img.src || img.getAttribute('src') || '';
        return src.startsWith('data:image/') ||
            AD_TAG_IMAGE_PATTERNS.some(pattern => pattern.test(src));
    }

    function hideByTags() {
        const tags = Array.from(document.querySelectorAll('*[class], [node-type="feed_list_top"]')).filter(el =>
            Array.from(el.classList).some(c => c.startsWith(SELECTORS.tagPrefix)) ||
            el.getAttribute('node-type') === 'feed_list_top'
        );

        tags.forEach(tag => {
            const tagText = tag.textContent.trim();
            const img = tag.querySelector('img');
            const hasAdTagImage = isAdTagImage(img);
            const matchesKeyword = HIDDEN_TAGS.some(keyword => tagText.includes(keyword));

            if (matchesKeyword || hasAdTagImage) {
                const feedBody = tag.closest(SELECTORS.panelMain)?.querySelector(SELECTORS.feedBody) ||
                    tag.closest(SELECTORS.cardWrap)?.querySelector(SELECTORS.feedBody);

                const displayTag = tagText || '广告图片标签';
                const message = `已隐藏包含"${displayTag}"标签的内容 ${hasAdTagImage ? "(含广告图片)" : ""}`;
                if (applyHiddenStyle(feedBody, message, 'tag')) {
                    logHiddenContent('推荐标签', displayTag, feedBody, hasAdTagImage ? (img.currentSrc || img.src || '广告图片') : displayTag);
                }
            }
        });
    }

    // 通过关键词屏蔽
    function hideByKeywords() {
        const feedContents = document.querySelectorAll('.wbpro-feed-content, .weibo-text');

        feedContents.forEach(feedContent => {
            const contentText = feedContent.textContent.trim();
            const matchResult = isTextMatched(contentText);

            if (matchResult) {
                const feedBody = feedContent.closest(SELECTORS.feedBody);
                applyKeywordMatch(feedBody, contentText, matchResult);
            }
        });
    }

    // 通过用户ID屏蔽
    function hideByUserId() {
        const feedBodies = document.querySelectorAll(SELECTORS.feedBody);

        feedBodies.forEach(feedBody => {
            const matchedAuthor = getFeedAuthors(feedBody).find(author => isUserIdBlocked(author.id));
            if (!matchedAuthor) return;

            const message = `已隐藏屏蔽用户: ${matchedAuthor.name} (ID: ${matchedAuthor.id}${matchedAuthor.role === '转发原作者' ? '，转发原作者' : ''})`;
            if (applyHiddenStyle(feedBody, message, 'userid')) {
                logHiddenContent('用户ID', matchedAuthor.id, feedBody, `屏蔽用户: ${matchedAuthor.name} (${matchedAuthor.role})`);
            }
        });
    }

    // 通过来源关键词屏蔽
    function hideBySourceKeywords() {
        const sourceTags = document.querySelectorAll(SELECTORS.sourceTag);

        sourceTags.forEach(sourceTag => {
            const sourceText = sourceTag.textContent.trim();
            const matchResult = isSourceMatched(sourceText);

            if (matchResult) {
                const feedBody = sourceTag.closest(SELECTORS.feedBody);
                const displayKeyword = matchResult.type === 'regex'
                    ? `正则: ${matchResult.keyword}`
                    : matchResult.keyword;

                const message = `已隐藏来源包含"${displayKeyword}"的内容`;
                if (applyHiddenStyle(feedBody, message, 'source')) {
                    logHiddenContent('来源', sourceText, feedBody,
                        `${matchResult.type}: ${matchResult.keyword}`);
                }
            }
        });
    }

    // 通过超话关键词屏蔽
    function hideBySuperTopic() {
        if (!superTopicKeywords || superTopicKeywords.length === 0) return;

        // 查找所有带有超话标签的微博
        const feedBodies = document.querySelectorAll(SELECTORS.feedBody);

        feedBodies.forEach(feedBody => {
            // 只处理有超话标签的微博
            const chaohuaIcon = feedBody.querySelector('img[class*="chaohua"], img[class*="Chaohua"]');
            const superTextLink = feedBody.querySelector('a[class*="superText"], a[class*="_superText_"]');
            if (!chaohuaIcon && !superTextLink) return;

            // 获取超话文本
            let topicText = '';
            if (superTextLink) {
                const span = superTextLink.querySelector('span');
                topicText = span?.getAttribute('title') || span?.textContent || superTextLink.textContent || '';
            }
            if (!topicText && chaohuaIcon) {
                // 尝试从附近的超话链接获取
                const nearbyLink = feedBody.querySelector('a[href*="huati.weibo.com"] span');
                topicText = nearbyLink?.getAttribute('title') || nearbyLink?.textContent || '';
            }

            topicText = topicText.trim();
            if (!topicText) return;

            const matchResult = isSuperTopicMatched(topicText);
            if (!matchResult) return;

            const displayKeyword = matchResult.type === 'regex'
                ? `正则: ${matchResult.keyword}`
                : matchResult.keyword;

            const message = `已屏蔽超话"${topicText}"（匹配关键词: ${displayKeyword}）`;
            if (applyHiddenStyle(feedBody, message, 'supertopic')) {
                logHiddenContent('超话', topicText, feedBody,
                    `${matchResult.type}: ${matchResult.keyword}`);
            }
        });
    }

    // 通过时间过滤屏蔽
    function hideByTimeFilter() {
        if (!isHotWeiboPage()) return;

        const feedBodies = document.querySelectorAll(SELECTORS.feedBody);

        feedBodies.forEach(feedBody => {
            if (isWeiboTooOld(feedBody)) {
                const message = `⏰ 已隐藏 ${timeFilterDays} 天前的微博`;

                if (applyHiddenStyle(feedBody, message, 'time')) {
                    // 时间过滤使用特殊样式
                    const parent = feedBody.parentElement;
                    const placeholder = parent.querySelector('.custom-hidden-message');
                    if (placeholder) {
                        placeholder.className = 'time-filter-hidden-message';
                    }

                    logHiddenContent('时间过滤', `${timeFilterDays}天前`, feedBody, '时间过滤');
                }
            }
        });
    }

    // 屏蔽评论区用户
    function hideCommentsByUserId() {
        if (isWeiboDetailPage()) return;

        const commentLists = document.querySelectorAll('.wbpro-list');

        commentLists.forEach(list => {
            const commentItems = list.querySelectorAll('.item1');

            commentItems.forEach(item => {
                const avatarDiv = item.querySelector('.woo-avatar-main[usercard]');
                if (!avatarDiv) return;

                const userId = avatarDiv.getAttribute('usercard');
                if (!userId || !isUserIdBlocked(userId)) return;

                if (item.classList.contains('custom-hidden-comment')) return;

                item.classList.add('custom-hidden-comment');

                const userLink = item.querySelector('a[usercard]');
                const userName = userLink ? userLink.textContent.trim() : '未知用户';

                if (showPlaceholder) {
                    Array.from(item.children).forEach(child => child.style.display = 'none');
                    const message = document.createElement('div');
                    message.className = 'custom-hidden-message';
                    message.innerHTML = `<div class="message-content" style="padding: 8px; font-size: 12px;">
                已隐藏用户评论: ${userName} (ID: ${userId})
            </div>`;
                    item.appendChild(message);
                } else {
                    item.style.cssText = 'height: 1px; margin: -5px 0; padding: 0; overflow: hidden; opacity: 0; pointer-events: none;';
                }

                logHiddenContent('评论区用户ID', userId, item, `屏蔽评论用户: ${userName}`);
            });
        });
    }

    function hideByAIContent() {
        if (!blockAIContent) return;

        // 查找所有带有AI提示的元素
        const aiTips = document.querySelectorAll('.woo-tip-main.woo-tip-warn');

        aiTips.forEach(tip => {
            const tipText = tip.textContent.trim();

            // 检查是否包含AI相关提示
            if (tipText.includes('疑似使用了AI生成技术') ||
                tipText.includes('AI生成') ||
                tipText.includes('请谨慎甄别')) {

                const feedBody = tip.closest(SELECTORS.feedBody);

                if (feedBody) {
                    const message = '🤖 已屏蔽疑似AI生成的内容';
                    if (applyHiddenStyle(feedBody, message, 'ai')) {
                        logHiddenContent('AI内容', tipText, feedBody, 'AI生成提示');
                    }
                }
            }
        });
    }

    // 显示统一功能设置界面
    function showDisplaySettings() {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'keyword-manager-overlay';

        // 创建设置模态框
        const settingsModal = document.createElement('div');
        settingsModal.className = 'keyword-manager-modal';
        settingsModal.innerHTML = `
            <div class="keyword-manager">
                <h3>功能设置</h3>
                <div style="margin-bottom: 16px;">
                    <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-color, #333);">显示</div>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="show-block-button" ${showBlockButton ? 'checked' : ''} style="margin-right: 8px;">
                        显示用户名旁边的屏蔽按钮
                    </label>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="show-placeholder" ${showPlaceholder ? 'checked' : ''} style="margin-right: 8px;">
                        显示已屏蔽微博的占位块
                    </label>
                </div>
                <div style="margin-bottom: 16px;">
                    <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-color, #333);">首页跳转</div>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="redirect-home-to-mygroups" ${redirectHomeToMyGroupsEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        访问微博首页时自动跳转到最新微博分组
                    </label>
                    <div style="font-size: 12px; color: var(--help-color, #666); word-break: break-all;">
                        ${MYGROUPS_REDIRECT_TARGET}
                    </div>
                </div>
                <div style="margin-bottom: 16px;">
                    <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-color, #333);">外观</div>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="auto-switch-theme" ${autoSwitchThemeEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        跟随系统自动切换微博日间/夜间模式
                    </label>
                </div>
                <div style="margin-bottom: 16px;">
                    <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-color, #333);">右侧栏清理</div>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="hide-right-sidebar" ${hideRightSidebarEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        屏蔽整个微博右侧栏
                    </label>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="hide-hot-search" ${hideHotSearchEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        屏蔽微博热搜
                    </label>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="hide-home-ads" ${hideHomeAdsEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        屏蔽首页广告
                    </label>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="hide-home-mid-ad" ${hideHomeMidAdEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        屏蔽首页中栏广告
                    </label>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="hide-interested-people" ${hideInterestedPeopleEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        屏蔽你可能感兴趣的人
                    </label>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="hide-creator-center" ${hideCreatorCenterEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        屏蔽创作者中心
                    </label>
                </div>
                <div style="margin-bottom: 16px;">
                    <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-color, #333);">顶部导航清理</div>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="hide-top-recommend" ${hideTopRecommendEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        屏蔽顶栏推荐按钮
                    </label>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="hide-top-video" ${hideTopVideoEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        屏蔽顶栏视频按钮
                    </label>
                </div>
                <div style="margin-bottom: 16px;">
                    <div style="font-weight: 600; margin-bottom: 8px; color: var(--text-color, #333);">内容处理</div>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="auto-expand-enabled" ${autoExpandEnabled ? 'checked' : ''} style="margin-right: 8px;">
                        长微博全文检测
                    </label>
                    <label style="display: flex; align-items: center; margin-bottom: 10px;">
                        <input type="checkbox" id="block-ai-content" ${blockAIContent ? 'checked' : ''} style="margin-right: 8px;">
                        屏蔽疑似AI生成的内容
                    </label>
                    <label style="display: block; margin: 12px 0 6px; color: var(--text-color, #333);">
                        热搜页时间过滤（隐藏多少天之前的微博，0 为关闭）
                    </label>
                    <input type="number" id="time-filter-days"
                        value="${timeFilterDays}"
                        min="0" max="3650"
                        style="width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 4px; background: var(--input-bg, white); color: var(--input-color, #333);">
                </div>
                <div class="button-group">
                    <button class="close-btn">取消</button>
                    <button class="save-btn">保存</button>
                </div>
                <div class="help-text">
                    <div><strong>设置说明：</strong></div>
                    <div>• 右侧栏清理开关会在保存后刷新页面应用</div>
                    <div>• 时间过滤只对热搜微博详情页生效</div>
                    <div>• 关键词、来源和用户ID请在“管理屏蔽关键词”里调整</div>
                </div>
            </div>
        `;

        // 保存按钮事件
        settingsModal.querySelector('.save-btn').addEventListener('click', function () {
            const newShowBlockButton = settingsModal.querySelector('#show-block-button').checked;
            const newShowPlaceholder = settingsModal.querySelector('#show-placeholder').checked;
            const newRedirectHomeToMyGroupsEnabled = settingsModal.querySelector('#redirect-home-to-mygroups').checked;
            const newAutoSwitchThemeEnabled = settingsModal.querySelector('#auto-switch-theme').checked;
            const newHideRightSidebarEnabled = settingsModal.querySelector('#hide-right-sidebar').checked;
            const newHideHotSearchEnabled = settingsModal.querySelector('#hide-hot-search').checked;
            const newHideHomeAdsEnabled = settingsModal.querySelector('#hide-home-ads').checked;
            const newHideHomeMidAdEnabled = settingsModal.querySelector('#hide-home-mid-ad').checked;
            const newHideInterestedPeopleEnabled = settingsModal.querySelector('#hide-interested-people').checked;
            const newHideCreatorCenterEnabled = settingsModal.querySelector('#hide-creator-center').checked;
            const newHideTopRecommendEnabled = settingsModal.querySelector('#hide-top-recommend').checked;
            const newHideTopVideoEnabled = settingsModal.querySelector('#hide-top-video').checked;
            const newAutoExpandEnabled = settingsModal.querySelector('#auto-expand-enabled').checked;
            const newBlockAIContent = settingsModal.querySelector('#block-ai-content').checked;
            const newTimeFilterDays = parseInt(settingsModal.querySelector('#time-filter-days').value, 10);

            if (Number.isNaN(newTimeFilterDays) || newTimeFilterDays < 0) {
                showNotification('请输入有效的时间过滤天数');
                return;
            }

            const needsPageReload =
                showBlockButton !== newShowBlockButton ||
                showPlaceholder !== newShowPlaceholder ||
                hideRightSidebarEnabled !== newHideRightSidebarEnabled ||
                hideHotSearchEnabled !== newHideHotSearchEnabled ||
                hideHomeAdsEnabled !== newHideHomeAdsEnabled ||
                hideHomeMidAdEnabled !== newHideHomeMidAdEnabled ||
                hideInterestedPeopleEnabled !== newHideInterestedPeopleEnabled ||
                hideCreatorCenterEnabled !== newHideCreatorCenterEnabled ||
                hideTopRecommendEnabled !== newHideTopRecommendEnabled ||
                hideTopVideoEnabled !== newHideTopVideoEnabled;

            showBlockButton = newShowBlockButton;
            showPlaceholder = newShowPlaceholder;
            redirectHomeToMyGroupsEnabled = newRedirectHomeToMyGroupsEnabled;
            autoSwitchThemeEnabled = newAutoSwitchThemeEnabled;
            hideRightSidebarEnabled = newHideRightSidebarEnabled;
            hideHotSearchEnabled = newHideHotSearchEnabled;
            hideHomeAdsEnabled = newHideHomeAdsEnabled;
            hideHomeMidAdEnabled = newHideHomeMidAdEnabled;
            hideInterestedPeopleEnabled = newHideInterestedPeopleEnabled;
            hideCreatorCenterEnabled = newHideCreatorCenterEnabled;
            hideTopRecommendEnabled = newHideTopRecommendEnabled;
            hideTopVideoEnabled = newHideTopVideoEnabled;
            autoExpandEnabled = newAutoExpandEnabled;
            blockAIContent = newBlockAIContent;
            timeFilterDays = newTimeFilterDays;

            GM_setValue(STORAGE_PREFIX + 'show_block_button', showBlockButton);
            GM_setValue(STORAGE_PREFIX + 'show_placeholder', showPlaceholder);
            GM_setValue(STORAGE_PREFIX + 'redirect_home_to_mygroups', redirectHomeToMyGroupsEnabled);
            GM_setValue(STORAGE_PREFIX + 'auto_switch_theme', autoSwitchThemeEnabled);
            GM_setValue(STORAGE_PREFIX + 'hide_right_sidebar', hideRightSidebarEnabled);
            GM_setValue(STORAGE_PREFIX + 'hide_hot_search', hideHotSearchEnabled);
            GM_setValue(STORAGE_PREFIX + 'hide_home_ads', hideHomeAdsEnabled);
            GM_setValue(STORAGE_PREFIX + 'hide_home_mid_ad', hideHomeMidAdEnabled);
            GM_setValue(STORAGE_PREFIX + 'hide_interested_people', hideInterestedPeopleEnabled);
            GM_setValue(STORAGE_PREFIX + 'hide_creator_center', hideCreatorCenterEnabled);
            GM_setValue(STORAGE_PREFIX + 'hide_top_recommend', hideTopRecommendEnabled);
            GM_setValue(STORAGE_PREFIX + 'hide_top_video', hideTopVideoEnabled);
            GM_setValue(STORAGE_PREFIX + 'auto_expand', autoExpandEnabled);
            GM_setValue(STORAGE_PREFIX + 'block_ai_content', blockAIContent);
            GM_setValue(TIME_FILTER_DAYS_KEY, timeFilterDays);

            // 关闭设置窗口
            overlay.remove();
            settingsModal.remove();

            if (needsPageReload) {
                showNotification('功能设置已保存，正在刷新页面应用');
                location.reload();
                return;
            }

            if (autoExpandEnabled) {
                initAutoExpand();
            } else {
                clearTimeout(autoExpandTimer);
                autoExpandTimer = null;
                if (autoExpandIntervalId) {
                    clearInterval(autoExpandIntervalId);
                    autoExpandIntervalId = null;
                }
                fullTextCheckedFeedIdentities.clear();
                fullTextPending.clear();
            }

            if (autoSwitchThemeEnabled) {
                initAutoThemeSwitch();
            } else {
                clearTimeout(themeSwitchTimer);
                themeSwitchTimer = null;
            }

            showNotification('功能设置已保存');
            hideContent();
        });

        // 关闭按钮事件
        settingsModal.querySelector('.close-btn').addEventListener('click', function () {
            overlay.remove();
            settingsModal.remove();
        });

        // 点击遮罩层关闭
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.remove();
                settingsModal.remove();
            }
        });

        // 添加到页面
        document.body.appendChild(overlay);
        document.body.appendChild(settingsModal);
    }

    // 时间过滤检查函数
    function isWeiboTooOld(feedBody) {
        if (timeFilterDays <= 0) return false;

        // 查找时间链接元素
        const timeLink = feedBody.querySelector(SELECTORS.timeLink);
        if (!timeLink) return false;

        const dateString = timeLink.getAttribute('title');
        if (!dateString) return false;

        try {
            const weiboDate = new Date(dateString);
            const currentDate = new Date();
            const timeDiff = currentDate - weiboDate;
            const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

            return daysDiff > timeFilterDays;
        } catch (e) {
            console.warn('解析日期失败:', dateString, e);
            return false;
        }
    }

    // 为元素添加已处理标记
    function markAsProcessed(element, type) {
        if (!element.dataset.blockProcessed) {
            element.dataset.blockProcessed = '';
        }
        element.dataset.blockProcessed += type + ',';
    }

    function isProcessed(element, type) {
        return element.dataset.blockProcessed && element.dataset.blockProcessed.includes(type + ',');
    }

    function getFeedIdentity(feedBody) {
        if (!feedBody) return '';

        const userId = feedBody.querySelector(SELECTORS.avatar)?.getAttribute('usercard') || '';
        const time = feedBody.querySelector(SELECTORS.timeLink)?.getAttribute('title') ||
            feedBody.querySelector(SELECTORS.timeLink)?.textContent?.trim() || '';
        const text = feedBody.querySelector(SELECTORS.feedContent)?.textContent?.trim() ||
            feedBody.textContent?.trim() || '';

        return `${userId}|${time}|${text.slice(0, 120)}`;
    }

    function getMblogIdFromUrl(url) {
        if (!url) return '';

        try {
            const parsedUrl = new URL(url, window.location.href);
            const idFromQuery = parsedUrl.searchParams.get('id') ||
                parsedUrl.searchParams.get('mblogid') ||
                parsedUrl.searchParams.get('mid');
            if (idFromQuery) return idFromQuery;

            const parts = parsedUrl.pathname.split('/').filter(Boolean);
            const statusIndex = parts.findIndex(part => part === 'status' || part === 'detail');
            if (statusIndex >= 0 && /^[A-Za-z0-9]{6,}$/.test(parts[statusIndex + 1] || '')) {
                return parts[statusIndex + 1];
            }

            if (/^\d+$/.test(parts[0] || '') &&
                /^[A-Za-z0-9]{6,}$/.test(parts[1] || '') &&
                !/^\d+$/.test(parts[1])) {
                return parts[1];
            }
        } catch (e) {
            return '';
        }

        return '';
    }

    function getFeedDetailInfo(feedBody) {
        if (!feedBody) return null;

        const candidates = [
            feedBody.querySelector(SELECTORS.timeLink),
            ...feedBody.querySelectorAll('a[href*="/status/"], a[href*="/detail/"], a[href*="/"][href]')
        ];

        for (const link of candidates) {
            const href = link?.getAttribute?.('href');
            if (!href) continue;

            const mblogId = getMblogIdFromUrl(href);
            if (!mblogId) continue;

            try {
                const url = new URL(href, window.location.href);
                if (!/weibo\.com$/i.test(url.hostname) && !/\.weibo\.com$/i.test(url.hostname)) continue;

                return {
                    mblogId,
                    detailUrl: url.href
                };
            } catch (e) {
                continue;
            }
        }

        return null;
    }

    function requestText(url, responseType = 'text') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType,
                timeout: FULL_TEXT_FETCH_TIMEOUT_MS,
                headers: {
                    Accept: responseType === 'json' ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                onload: response => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.response ?? response.responseText ?? '');
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('timeout'))
            });
        });
    }

    function htmlDecode(text) {
        if (!text) return '';

        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    }

    function stripHtml(text) {
        return htmlDecode(String(text || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, ''))
            .replace(/\s+/g, ' ')
            .trim();
    }

    function collectTextRaw(value, texts = []) {
        if (!value) return texts;

        if (typeof value === 'string') {
            const cleaned = stripHtml(value);
            if (cleaned) texts.push(cleaned);
            return texts;
        }

        if (Array.isArray(value)) {
            value.forEach(item => collectTextRaw(item, texts));
            return texts;
        }

        if (typeof value === 'object') {
            ['text_raw', 'text', 'longTextContent'].forEach(key => {
                if (typeof value[key] === 'string') {
                    const cleaned = stripHtml(value[key]);
                    if (cleaned) texts.push(cleaned);
                }
            });

            ['retweeted_status', 'longText', 'status'].forEach(key => {
                if (value[key]) collectTextRaw(value[key], texts);
            });
        }

        return texts;
    }

    function extractFullTextFromHtml(html) {
        if (!html) return '';

        const doc = new DOMParser().parseFromString(html, 'text/html');
        const domTexts = Array.from(doc.querySelectorAll('.wbpro-feed-content, .weibo-text, [class*="_wbtext_"]'))
            .map(element => element.textContent.trim())
            .filter(Boolean);

        const rawTexts = [];
        const textRawPattern = /"(?:text_raw|longTextContent|text)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
        let match;
        while ((match = textRawPattern.exec(html))) {
            try {
                rawTexts.push(stripHtml(JSON.parse(`"${match[1]}"`)));
            } catch (e) {
                rawTexts.push(stripHtml(match[1]));
            }
        }

        return [...domTexts, ...rawTexts]
            .filter(Boolean)
            .sort((a, b) => b.length - a.length)[0] || '';
    }

    async function fetchFullTextForFeed(feedBody) {
        const info = getFeedDetailInfo(feedBody);
        if (!info?.mblogId) return '';

        if (fullTextCache.has(info.mblogId)) {
            return fullTextCache.get(info.mblogId);
        }

        let text = '';
        const apiUrl = `https://weibo.com/ajax/statuses/show?id=${encodeURIComponent(info.mblogId)}`;

        try {
            const apiResponse = await requestText(apiUrl, 'json');
            const parsedResponse = typeof apiResponse === 'string' ? JSON.parse(apiResponse) : apiResponse;
            const texts = collectTextRaw(parsedResponse);
            text = texts.sort((a, b) => b.length - a.length)[0] || '';
        } catch (e) {
            // 部分页面或账号可能不允许接口读取，继续尝试详情页 HTML。
        }

        if (!text && info.detailUrl) {
            try {
                const html = await requestText(info.detailUrl, 'text');
                text = extractFullTextFromHtml(html);
            } catch (e) {
                text = '';
            }
        }

        fullTextCache.set(info.mblogId, text);
        return text;
    }

    function isElementVisible(element) {
        if (!element || element.offsetParent === null) return false;

        const rect = element.getBoundingClientRect();
        return rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight;
    }

    function isFeedHidden(feedBody) {
        return !feedBody ||
            feedBody.classList.contains('custom-hidden') ||
            feedBody.closest('.blocked-item-hidden, .blocked-article-hidden') ||
            feedBody.closest('.blocked-item-with-placeholder, .blocked-article-with-placeholder');
    }

    function runAutoExpandNow() {
        processFullTextForVisibleFeeds();
    }

    function scheduleAutoExpand(delay = AUTO_EXPAND_SCROLL_IDLE_MS) {
        if (!autoExpandEnabled) return;

        clearTimeout(autoExpandTimer);
        autoExpandTimer = setTimeout(() => {
            const idleFor = Date.now() - lastScrollTime;
            if (idleFor < AUTO_EXPAND_SCROLL_IDLE_MS) {
                scheduleAutoExpand(AUTO_EXPAND_SCROLL_IDLE_MS - idleFor);
                return;
            }

            requestAnimationFrame(runAutoExpandNow);
        }, delay);
    }

    function applyKeywordMatch(feedBody, contentText, matchResult, source = '关键词') {
        const displayKeyword = matchResult.type === 'regex'
            ? `正则: ${matchResult.keyword}`
            : matchResult.keyword;

        const message = `已隐藏包含关键词"${displayKeyword}"的内容`;
        if (applyHiddenStyle(feedBody, message, 'keyword')) {
            logHiddenContent(source, contentText.substring(0, 50) + '...', feedBody,
                `${matchResult.type}: ${matchResult.keyword}`);
        }
    }

    function queueFullTextCheck(feedBody, feedIdentity) {
        if (!feedIdentity || fullTextPending.has(feedIdentity) || fullTextActiveRequests >= FULL_TEXT_MAX_CONCURRENT) {
            return false;
        }

        fullTextPending.add(feedIdentity);
        fullTextActiveRequests++;

        fetchFullTextForFeed(feedBody)
            .then(fullText => {
                if (isWeiboDetailPage()) return;
                if (isFeedHidden(feedBody)) return;

                if (fullText) {
                    feedBody.dataset.fullTextCheckedIdentity = feedIdentity;
                    const matchResult = isTextMatched(fullText);
                    if (matchResult) {
                        applyKeywordMatch(feedBody, fullText, matchResult, '关键词全文');
                    }
                    return;
                }

                feedBody.dataset.fullTextCheckedIdentity = feedIdentity;
            })
            .finally(() => {
                fullTextPending.delete(feedIdentity);
                fullTextActiveRequests = Math.max(0, fullTextActiveRequests - 1);
                if (autoExpandEnabled) scheduleAutoExpand(150);
            });

        return true;
    }

    // 仅通过后台接口/详情页获取全文做屏蔽判断，不操作页面展开/收起按钮
    function processFullTextForVisibleFeeds() {
        if (!autoExpandEnabled || isWeiboDetailPage()) return;
        if (Date.now() - lastScrollTime < AUTO_EXPAND_SCROLL_IDLE_MS) {
            scheduleAutoExpand();
            return;
        }

        const feedBodies = document.querySelectorAll(SELECTORS.feedBody);
        let clickCount = 0;

        feedBodies.forEach(feedBody => {
            if (fullTextActiveRequests >= FULL_TEXT_MAX_CONCURRENT) return;

            const feedIdentity = getFeedIdentity(feedBody);

            if (!feedIdentity || isFeedHidden(feedBody) || !isElementVisible(feedBody)) {
                return;
            }

            if (feedBody.dataset.fullTextCheckedIdentity === feedIdentity ||
                fullTextCheckedFeedIdentities.has(feedIdentity)) {
                return;
            }

            fullTextCheckedFeedIdentities.add(feedIdentity);
            if (queueFullTextCheck(feedBody, feedIdentity)) {
                clickCount++;
            }
        });

        if (clickCount > 0) {
            console.log(`📱 全文检测: 已排队 ${clickCount} 条微博`);
        }
    }

    // 初始化长微博全文检测功能
    function initAutoExpand() {
        if (!autoExpandEnabled) return;

        // 初始执行
        scheduleAutoExpand(300);

        if (!autoExpandIntervalId) {
            autoExpandIntervalId = setInterval(scheduleAutoExpand, 2500);
        }

        console.log('📱 微博长文全文检测已启用');
    }

    let lastHideTime = 0;
    let pendingHide = false;
    function throttledHide() {
        const now = Date.now();
        const timeSinceLastHide = now - lastHideTime;

        if (timeSinceLastHide >= 50) {
            // 立即执行
            lastHideTime = now;
            pendingHide = false;
            hideContent();
        } else if (!pendingHide) {
            // 节流等待
            pendingHide = true;
            setTimeout(() => {
                if (pendingHide) {
                    lastHideTime = Date.now();
                    pendingHide = false;
                    hideContent();
                }
            }, 50 - timeSinceLastHide);
        }
    }

    // 初始化
    function init() {
        // 初始化时进行全局类型检查
        keywords = ensureArray(keywords, DEFAULT_KEYWORDS);
        blockedIds = ensureArray(blockedIds, DEFAULT_BLOCKED_IDS);
        sourceKeywords = ensureArray(sourceKeywords, DEFAULT_SOURCE_KEYWORDS);

        // 保存修复后的数据
        GM_setValue(STORAGE_PREFIX + 'keywords', keywords);
        GM_setValue(STORAGE_PREFIX + 'blocked_ids', blockedIds);
        GM_setValue(STORAGE_PREFIX + 'source_keywords', sourceKeywords);

        // 添加额外样式
        appendStyle(additionalStyles);

        // 输出脚本启动信息
        logScriptInfo();

        // 添加键盘事件监听
        document.addEventListener('keydown', handleKeyPress);

        // 右键菜单 - 通过事件委托监听超话和用户名
        document.addEventListener('contextmenu', function (e) {
            // === 超话右键 ===
            const superLink = e.target.closest('a[class*="_superText_"]');
            const chaohuaImg = e.target.closest('img[class*="_chaohuaIcon_"]');
            if (superLink || chaohuaImg) {
                const container = (superLink || chaohuaImg).closest(SELECTORS.feedBody) ||
                                  (superLink || chaohuaImg).closest('[class*="_body_"]');
                if (container) {
                    let topicText = '';
                    const link = container.querySelector('a[class*="_superText_"]');
                    if (link) {
                        const span = link.querySelector('span');
                        topicText = span?.getAttribute('title') || span?.textContent || link.textContent || '';
                    }
                    topicText = topicText.trim();
                    if (topicText) {
                        showSuperTopicContextMenu(e, topicText);
                        return;
                    }
                }
            }

            // === 用户名右键 ===
            const nameSpan = e.target.closest('span[usercard]');
            const avatarMain = e.target.closest('.woo-avatar-main[usercard]');
            if (!nameSpan && !avatarMain) return;

            const container = (nameSpan || avatarMain).closest(SELECTORS.feedBody) ||
                              (nameSpan || avatarMain).closest('[class*="_body_"]');
            if (!container) return;

            // 从头像获取用户ID
            const avatar = container.querySelector('.woo-avatar-main[usercard]');
            if (!avatar) return;
            const userId = avatar.getAttribute('usercard');
            if (!userId) return;

            // 获取用户名称
            let userName = '未知用户';
            const nameLink = findUserNameLink(container);
            if (nameLink) {
                const span = nameLink.querySelector('span');
                userName = span?.getAttribute('title') || span?.textContent || userName;
            }
            if (userName === '未知用户') {
                const avatarImg = container.querySelector('.woo-avatar-main img, .woo-avatar-img');
                userName = avatarImg?.getAttribute('alt') || userName;
            }

            showUserContextMenu(e, userId, userName);
        });

        window.addEventListener('scroll', () => {
            lastScrollTime = Date.now();
            scheduleAutoExpand();
        }, { passive: true, capture: true });

        // 页面加载时执行一次WebDAV同步检查
        if (webdavConfig.enabled) {
            console.log('🔗 检查WebDAV同步...');
            syncFromWebDAV().then(synced => {
                if (synced) {
                    hideContent();
                }
            });
        }

        // 页面加载时执行一次
        hideContent();

        // 优化的MutationObserver - 精确监听，立即响应
        const observer = new MutationObserver((mutations) => {
            let needsProcessing = false;
            let needsAutoExpand = false;
            let needsCommentProcessing = false;
            let needsStandaloneCleanup = false;
            let needsTopNavCleanup = false;
            let needsThemeSwitch = false;

            // 使用Set去重，避免重复处理同一元素
            const processedNodes = new Set();

            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== 1 || processedNodes.has(node)) continue;
                        processedNodes.add(node);

                        // 精确匹配微博内容节点
                        if (node.classList) {
                            if ([...node.classList].some(cls => cls.startsWith('_body_')) ||
                                node.classList.contains('wbpro-scroller-item') ||
                                node.classList.contains('vue-recycle-scroller__item-view')) {
                                needsProcessing = true;
                            }

                            if ((hideRightSidebarEnabled && hasRightSidebar(node)) ||
                                (hideHotSearchEnabled && node.classList.contains('hotBand')) ||
                                (hideHomeAdsEnabled && hasTipsAdClass(node)) ||
                                (hideHomeMidAdEnabled && node.matches?.(SELECTORS.homeMidAd)) ||
                                (hideInterestedPeopleEnabled && hasInterestedPeopleCard(node)) ||
                                (hideCreatorCenterEnabled && hasCreatorCenterCard(node))) {
                                needsStandaloneCleanup = true;
                            }

                            if ((hideTopRecommendEnabled && node.matches?.(SELECTORS.topRecommendLink)) ||
                                (hideTopVideoEnabled && node.matches?.(SELECTORS.topVideoLink))) {
                                needsTopNavCleanup = true;
                            }

                            if (autoSwitchThemeEnabled && node.matches?.(SELECTORS.colorModeButton)) {
                                needsThemeSwitch = true;
                            }

                            if (autoExpandEnabled && node.classList.contains('expand')) {
                                needsAutoExpand = true;
                            }

                            if (node.classList.contains('wbpro-list') || node.classList.contains('item1')) {
                                needsCommentProcessing = true;
                            }
                        }

                        // 检查子节点（仅一层）
                        if (node.querySelector) {
                            if (!needsProcessing && node.querySelector(SELECTORS.feedBody)) {
                                needsProcessing = true;
                            }
                            if (!needsStandaloneCleanup &&
                                ((hideRightSidebarEnabled && hasRightSidebar(node)) ||
                                    (hideHotSearchEnabled && node.querySelector(SELECTORS.hotBand)) ||
                                    (hideHomeAdsEnabled && node.querySelector(SELECTORS.tipsAd)) ||
                                    (hideHomeMidAdEnabled && node.querySelector(SELECTORS.homeMidAd)) ||
                                    (hideInterestedPeopleEnabled && hasInterestedPeopleCard(node)) ||
                                    (hideCreatorCenterEnabled && hasCreatorCenterCard(node)))) {
                                needsStandaloneCleanup = true;
                            }
                            if (!needsTopNavCleanup &&
                                ((hideTopRecommendEnabled && node.querySelector(SELECTORS.topRecommendLink)) ||
                                    (hideTopVideoEnabled && node.querySelector(SELECTORS.topVideoLink)))) {
                                needsTopNavCleanup = true;
                            }
                            if (autoSwitchThemeEnabled && !needsThemeSwitch && node.querySelector(SELECTORS.colorModeButton)) {
                                needsThemeSwitch = true;
                            }
                            if (autoExpandEnabled && !needsAutoExpand && node.querySelector(SELECTORS.expandButton)) {
                                needsAutoExpand = true;
                            }
                            if (!needsCommentProcessing && (node.querySelector('.wbpro-list') || node.querySelector('.item1'))) {
                                needsCommentProcessing = true;
                            }
                        }
                    }
                }
            }

            // 立即处理，不使用节流
            if (needsProcessing) {
                hideContent();
            }
            if (needsStandaloneCleanup) {
                requestAnimationFrame(() => {
                    hideHomeMidAd();
                    hideStandaloneSidebarWidgets();
                });
            }
            if (needsTopNavCleanup) {
                requestAnimationFrame(() => hideTopNavButtons());
            }
            if (needsThemeSwitch) {
                requestAnimationFrame(() => scheduleThemeSwitch());
            }
            if (needsAutoExpand) {
                scheduleAutoExpand();
            }
            if (needsCommentProcessing) {
                requestAnimationFrame(() => {
                    addCommentBlockButtons();
                    hideCommentsByUserId();
                });
            }
        });

        // 优化的Observer配置 - 只监听必要的变化
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false,
            attributeOldValue: false,
            characterDataOldValue: false
        });

        // 使用Intersection Observer优化虚拟滚动场景
        const intersectionObserver = new IntersectionObserver((entries) => {
            let hasNewVisible = false;
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.classList.contains('custom-hidden')) {
                    hasNewVisible = true;
                }
            });
            if (hasNewVisible) {
                throttledHide();
            }
        }, {
            root: null,
            rootMargin: '100px', // 提前100px开始处理
            threshold: 0.01
        });

        // 监听所有滚动容器中的feed项
        const observeScrollItems = () => {
            document.querySelectorAll('.wbpro-scroller-item, .vue-recycle-scroller__item-view').forEach(item => {
                if (!item.dataset.observing) {
                    intersectionObserver.observe(item);
                    item.dataset.observing = 'true';
                }
            });
        };

        observeScrollItems();
        setInterval(observeScrollItems, 2000); // 定期检查新元素
        setInterval(() => {
            hideHomeMidAd();
            hideStandaloneSidebarWidgets();
            hideTopNavButtons();
        }, 5000); // 低频兜底，处理微博复用 DOM 时只改内容/属性的场景

        // 初始化长微博全文检测功能
        initAutoExpand();
        initAutoThemeSwitch();

        // 添加全局函数
        window.manualToggleColorMode = toggleColorMode;
        window.syncWeiboColorMode = toggleColorMode;

        console.log(
            `💡 提示: 在控制台使用以下命令:\n` +
            `   getHiddenStats() - 查看隐藏统计\n` +
            `   resetHiddenStats() - 重置统计计数\n` +
            `💡 功能: 按 F8 将选中文本添加到屏蔽词\n` +
            `💡 功能: 按 F9 将选中文本添加到来源屏蔽词\n` +
            `💡 功能: 点击用户名称旁的"屏蔽"按钮屏蔽该用户\n` +
            `💡 功能: 长微博全文检测${autoExpandEnabled ? '已启用' : '未启用，可在菜单中开启'}\n` +
            `💡 功能: 自动主题${autoSwitchThemeEnabled ? '已启用' : '未启用，可在菜单中开启'}`
        );
    }

    // 页面加载完成后执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
