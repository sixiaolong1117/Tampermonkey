// ==UserScript==
// @name         知乎综合屏蔽
// @namespace    https://github.com/SIXiaolong1117/Rules
// @version      0.10
// @description  屏蔽包含自定义关键词的知乎问题，支持正则表达式，可一键添加屏蔽，同时隐藏广告卡片
// @license      MIT
// @icon         https://zhihu.com/favicon.ico
// @author       SI Xiaolong
// @match        https://www.zhihu.com/*
// @match        https://zhihu.com/*
// @match        https://*.zhihu.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    // 默认关键词（可通过菜单修改）
    const DEFAULT_KEYWORDS = [
    ];

    // 为所有存储键添加脚本专属前缀
    const STORAGE_PREFIX = 'sixiaolong1117_zhihu_';

    // WebDAV配置存储键
    const WEBDAV_CONFIG_KEY = STORAGE_PREFIX + 'webdav_config';

    // 时间过滤配置
    const TIME_FILTER_DAYS_KEY = STORAGE_PREFIX + 'time_filter_days';

    // 显示设置
    const DEFAULT_SHOW_BLOCK_BUTTON = true;  // 默认显示屏蔽按钮
    const DEFAULT_SHOW_PLACEHOLDER = true;   // 默认显示占位块

    // 提取 @version
    const SCRIPT_VERSION = GM_info.script.version || 'unknown';

    // 初始化关键词列表
    let keywords = GM_getValue(STORAGE_PREFIX + 'keywords', DEFAULT_KEYWORDS);
    let blockedUsers = GM_getValue(STORAGE_PREFIX + 'blocked_users', []);
    let keywordManager = null;
    let timeFilterDays = GM_getValue(TIME_FILTER_DAYS_KEY, 30);
    let showBlockButton = GM_getValue(STORAGE_PREFIX + 'show_block_button', DEFAULT_SHOW_BLOCK_BUTTON);
    let showPlaceholder = GM_getValue(STORAGE_PREFIX + 'show_placeholder', DEFAULT_SHOW_PLACEHOLDER);

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
    const hiddenDetails = [];

    // 深浅色模式样式
    const styles = `
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
            transition: all 0.2s;
        }
        .keyword-manager .tab.active {
            border-bottom-color: #1890ff;
            color: #1890ff;
        }
        .keyword-manager .tab:hover {
            color: #1890ff;
            background: rgba(24, 144, 255, 0.05);
        }
        
        /* 其他现有样式保持不变 */
        .time-filter-hidden-message {
            margin: 10px 0;
            padding: 15px;
            text-align: center;
            border: 1px solid;
            border-radius: 6px;
            font-size: 14px;
            background: var(--time-filter-bg, #fff3cd);
            color: var(--time-filter-color, #856404);
            border-color: var(--time-filter-border, #ffeaa7);
        }
        .time-filter-hidden-message {
            margin: 10px 0;
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
            .time-filter-hidden-message {
                --time-filter-bg: #332701;
                --time-filter-color: #f1c40f;
                --time-filter-border: #665200;
            }
        }
        .zhihu-block-user-btn {
            padding: 2px 8px;
            border: 1px solid #d0d0d0;
            border-radius: 3px;
            background: transparent;
            color: #8590a6;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            flex-shrink: 0;
            margin-left: 5px;
        }
        .zhihu-block-user-btn:hover {
            border-color: #ff6b00;
            color: #ff6b00;
            background: rgba(255, 107, 0, 0.05);
        }
        @media (prefers-color-scheme: dark) {
            .zhihu-block-user-btn {
                border-color: #555;
                color: #8590a6;
            }
            .zhihu-block-user-btn:hover {
                border-color: #ff6b00;
                color: #ff6b00;
                background: rgba(255, 107, 0, 0.1);
            }
        }
        .custom-hidden-message {
            margin: 10px 0;
            padding: 15px;
            text-align: center;
            border: 1px solid;
            border-radius: 6px;
            font-size: 14px;
        }
        .ContentItem-title {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .zhihu-block-btn {
            padding: 2px 8px;
            border: 1px solid #d0d0d0;
            border-radius: 3px;
            background: transparent;
            color: #8590a6;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            flex-shrink: 0;
        }
        .zhihu-block-btn:hover {
            border-color: #f1403c;
            color: #f1403c;
            background: rgba(241, 64, 60, 0.05);
        }
        .ContentItem-title a {
            flex: 1;
        }
        .keyword-manager-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 400px;
            max-width: 90vw;
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
        .keyword-manager textarea {
            width: 100%;
            height: 200px;
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
            .custom-hidden-message {
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
            .custom-hidden-message {
                background: #2d2d2d;
                color: #ccc;
                border-color: #444;
            }
            .zhihu-block-btn {
                border-color: #555;
                color: #8590a6;
            }
            .zhihu-block-btn:hover {
                border-color: #f1403c;
                color: #f1403c;
                background: rgba(241, 64, 60, 0.1);
            }
        }
    `;

    // 添加样式到页面
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    // 在控制台输出隐藏信息
    function logHiddenContent(matchedKeyword, questionText, element, matchType, source = '自动屏蔽') {
        hiddenCount++;
        const detail = {
            index: hiddenCount,
            keyword: matchedKeyword,
            question: questionText,
            matchType: matchType,
            source: source,
            timestamp: new Date().toLocaleTimeString(),
            element: element
        };
        hiddenDetails.push(detail);

        console.log(
            `🚫 知乎内容隐藏 #${hiddenCount}\n` +
            `🔍 关键词/类型: "${matchedKeyword}"\n` +
            `📝 内容: "${questionText}"\n` +
            `🔧 匹配类型: ${matchType}\n` +
            `📮 来源: ${source}\n` +
            `⏰ 时间: ${detail.timestamp}\n` +
            `📍 元素:`, element
        );

        // 每隐藏10条内容时输出汇总信息
        if (hiddenCount % 10 === 0) {
            console.log(
                `📊 隐藏内容汇总: 已隐藏 ${hiddenCount} 个内容\n` +
                `📋 关键词分布:`,
                hiddenDetails.reduce((acc, detail) => {
                    acc[detail.keyword] = (acc[detail.keyword] || 0) + 1;
                    return acc;
                }, {})
            );
        }
    }

    // 显示WebDAV配置界面
    function showWebDAVConfig() {
        const overlay = document.createElement('div');
        overlay.className = 'keyword-manager-overlay';

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
                       value="${webdavConfig.url || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 4px; margin-bottom: 10px; background: var(--input-bg, white); color: var(--input-color, #333);">
                <input type="text" id="webdav-username" placeholder="用户名"
                       value="${webdavConfig.username || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 4px; margin-bottom: 10px; background: var(--input-bg, white); color: var(--input-color, #333);">
                <input type="password" id="webdav-password" placeholder="密码"
                       value="${webdavConfig.password || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 4px; background: var(--input-bg, white); color: var(--input-color, #333);">
            </div>
            <div class="button-group">
                <button class="close-btn">取消</button>
                <button class="save-btn">保存</button>
            </div>
            <div class="help-text">
                <div><strong>WebDAV同步说明：</strong></div>
                <div>• 启用后，每次修改屏蔽词会自动同步到WebDAV服务器</div>
                <div>• 支持 Nextcloud、OwnCloud、坚果云等WebDAV服务</div>
                <div>• 文件将保存为: zhihu_blocklist.json</div>
                <div>• 多设备使用时请注意冲突问题</div>
            </div>
        </div>
    `;

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

            if (enabled) {
                syncToWebDAV('保存配置后同步');
            }

            overlay.remove();
            configModal.remove();
            showNotification('WebDAV配置已保存' + (enabled ? '，正在同步...' : ''));
        });

        configModal.querySelector('.close-btn').addEventListener('click', function () {
            overlay.remove();
            configModal.remove();
        });

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.remove();
                configModal.remove();
            }
        });

        document.body.appendChild(overlay);
        document.body.appendChild(configModal);
    }

    // WebDAV同步函数
    function syncToWebDAV(reason = '手动同步') {
        if (!webdavConfig.enabled || !webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
            console.log('❌ 请先在脚本设置中配置 WebDAV 信息！');
            return;
        }

        // ✅ 自动补全 URL 末尾斜杠
        let baseUrl = webdavConfig.url;
        if (!baseUrl.endsWith('/')) baseUrl += '/';
        const folderUrl = baseUrl + 'ZhihuGeneralBlock/';
        const fileUrl = folderUrl + 'zhihu_blocklist.json';
        const authHeader = 'Basic ' + btoa(webdavConfig.username + ':' + webdavConfig.password);

        // Step 1: 检查目录
        GM_xmlhttpRequest({
            method: 'PROPFIND',
            url: folderUrl,
            headers: { 'Authorization': authHeader },
            onload: function (res) {
                if (res.status === 404) {
                    createFolderAndUpload();
                } else {
                    readThenMergeAndUpload();
                }
            },
            onerror: () => console.log('❌ 检查目录失败')
        });

        // 创建目录
        function createFolderAndUpload() {
            GM_xmlhttpRequest({
                method: 'MKCOL',
                url: folderUrl,
                headers: { 'Authorization': authHeader },
                onload: () => readThenMergeAndUpload(),
                onerror: () => console.log('❌ 创建目录失败')
            });
        }

        // 核心：先 GET 远端 → 合并本地变更 → 再 PUT
        function readThenMergeAndUpload() {
            GM_xmlhttpRequest({
                method: 'GET',
                url: fileUrl,
                headers: { 'Authorization': authHeader },
                onload: function (getRes) {
                    let remoteData = {};
                    if (getRes.status === 200) {
                        try { remoteData = JSON.parse(getRes.responseText) || {}; } catch (e) { }
                    } else if (getRes.status !== 404) {
                        console.log('❌ 读取远端文件失败:', getRes.status);
                    }

                    // 合并：保留远端所有字段，只更新当前版本所识别的
                    const mergedData = {
                        ...remoteData,  // 保留所有字段
                        keywords: keywords,
                        blockedUsers: blockedUsers,
                        timeFilterDays: timeFilterDays,
                        lastModified: Date.now(),
                        reason: reason,
                        timestamp: new Date().toISOString(),
                        _script_version: SCRIPT_VERSION  // 版本标记
                    };

                    // 上传合并后的数据
                    GM_xmlhttpRequest({
                        method: 'PUT',
                        url: fileUrl,
                        data: JSON.stringify(mergedData, null, 2),
                        headers: {
                            'Authorization': authHeader,
                            'Content-Type': 'application/json; charset=utf-8'
                        },
                        onload: function (putRes) {
                            if (putRes.status >= 200 && putRes.status < 300) {
                                console.log('✅ WebDAV 增量同步成功');
                                webdavConfig.lastSync = mergedData.lastModified;
                                GM_setValue(WEBDAV_CONFIG_KEY, webdavConfig);
                            } else {
                                console.log('❌ 上传失败:', putRes.status);
                            }
                        },
                        onerror: () => console.log('❌ 上传请求错误')
                    });
                },
                onerror: () => console.log('❌ 读取远端文件失败')
            });
        }
    }

    // 从WebDAV拉取数据
    function syncFromWebDAV() {
        if (!webdavConfig.enabled || !webdavConfig.url) {
            return Promise.resolve(false);
        }

        let baseUrl = webdavConfig.url;
        if (!baseUrl.endsWith('/')) baseUrl += '/';
        const fileUrl = baseUrl + 'ZhihuGeneralBlock/zhihu_blocklist.json';

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: fileUrl,
                responseType: 'json',
                headers: {
                    'Authorization': 'Basic ' + btoa(webdavConfig.username + ':' + webdavConfig.password)
                },
                onload: function (response) {
                    if (response.status === 200) {
                        try {
                            const remoteData = response.response || {};

                            // 只有远程时间戳更新才应用
                            const localTimestamp = webdavConfig.lastSync || 0;
                            const remoteTimestamp = remoteData.lastModified || 0;

                            // 版本检查
                            if (remoteData._script_version && remoteData._script_version !== SCRIPT_VERSION) {
                                console.log(`☁️ 云端配置版本: ${remoteData._script_version}, 💻 本地脚本版本: ${SCRIPT_VERSION}`);
                                showNotification(`🚨 云端配置来自 v${remoteData._script_version}，当前脚本 v${SCRIPT_VERSION}，建议升级脚本！`);
                            }

                            if (remoteTimestamp <= localTimestamp) {
                                console.log('✅ 本地数据已是最新，无需同步');
                                resolve(false);
                                return;
                            }

                            // 增量合并：只更新我们认识的字段
                            let updated = false;

                            if (Array.isArray(remoteData.keywords)) {
                                keywords = remoteData.keywords;
                                GM_setValue(STORAGE_PREFIX + 'keywords', keywords);
                                updated = true;
                            }
                            if (Array.isArray(remoteData.blockedUsers)) {
                                blockedUsers = remoteData.blockedUsers;
                                GM_setValue(STORAGE_PREFIX + 'blocked_users', blockedUsers);
                                updated = true;
                            }
                            if (typeof remoteData.timeFilterDays === 'number') {
                                timeFilterDays = remoteData.timeFilterDays;
                                GM_setValue(TIME_FILTER_DAYS_KEY, timeFilterDays);
                                updated = true;
                            }

                            if (updated) {
                                webdavConfig.lastSync = remoteTimestamp;
                                GM_setValue(WEBDAV_CONFIG_KEY, webdavConfig);
                                console.log('✅ 从 WebDAV 增量同步成功');
                                showNotification('✅ 已从云端同步最新数据');
                                resolve(true);
                            } else {
                                console.log('➡️ 无有效字段更新，跳过同步');
                                resolve(false);
                            }
                        } catch (e) {
                            console.error('❌ 解析远程数据失败:', e);
                            resolve(false);
                        }
                    } else if (response.status === 404) {
                        console.log('⬆️ 远程文件不存在，上传本地数据初始化');
                        syncToWebDAV('🔄 初始化同步').then(() => resolve(false));
                    } else {
                        console.error('❌ 拉取失败:', response.status);
                        resolve(false);
                    }
                },
                onerror: function (err) {
                    console.error('❌ 网络错误:', err);
                    resolve(false);
                }
            });
        });
    }

    function saveAllSettingsAndSync(newKeywords, newUsers, reason = '手动修改') {
        // 更新全局变量
        keywords = Array.isArray(newKeywords) ? newKeywords : [];
        blockedUsers = Array.isArray(newUsers) ? newUsers : [];

        // 本地保存
        GM_setValue(STORAGE_PREFIX + 'keywords', keywords);
        GM_setValue(STORAGE_PREFIX + 'blocked_users', blockedUsers);

        console.log(`📦 已保存到本地 (${reason})：`, {
            keywordsCount: keywords.length,
            usersCount: blockedUsers.length
        });

        // WebDAV同步
        if (webdavConfig && webdavConfig.enabled) {
            syncToWebDAV(reason);
        }

        return true;
    }

    // 保存关键词函数
    function saveKeywordsAndSync(newKeywords, reason = '手动修改') {
        keywords = Array.isArray(newKeywords) ? newKeywords : [];
        GM_setValue(STORAGE_PREFIX + 'keywords', keywords);

        console.log(`📦 已保存到本地 (${reason})：`, { keywordsCount: keywords.length });

        if (webdavConfig && webdavConfig.enabled) {
            syncToWebDAV(reason);
        }

        return true;
    }

    // 保存屏蔽用户函数
    function saveBlockedUsersAndSync(newUsers, reason = '手动修改') {
        blockedUsers = Array.isArray(newUsers) ? newUsers : [];
        GM_setValue(STORAGE_PREFIX + 'blocked_users', blockedUsers);

        console.log(`📦 已保存屏蔽用户到本地 (${reason})：`, { usersCount: blockedUsers.length });

        if (webdavConfig && webdavConfig.enabled) {
            syncToWebDAV(reason);
        }

        return true;
    }

    // 显示关键词管理器
    function showKeywordManager() {
        // 如果已经存在，先移除
        if (keywordManager) {
            keywordManager.remove();
        }

        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'keyword-manager-overlay';

        // 创建管理器模态框
        const manager = document.createElement('div');
        manager.className = 'keyword-manager-modal';
        manager.innerHTML = `
        <div class="keyword-manager">
            <h3>屏蔽管理</h3>
            <div class="tabs">
                <button class="tab active" data-tab="keywords">关键词屏蔽</button>
                <button class="tab" data-tab="users">用户屏蔽</button>
            </div>
            <textarea id="keywords-textarea" placeholder="每行一个关键词&#10;&#10;普通关键词示例：&#10;推广&#10;营销&#10;广告&#10;&#10;正则表达式示例：&#10;/推广.*活动/&#10;/\\d+元优惠/&#10;">${keywords.join('\n')}</textarea>
            <textarea id="users-textarea" placeholder="每行一个用户名&#10;&#10;示例：&#10;用户名1&#10;用户名2&#10;用户名3" style="display: none;">${blockedUsers.join('\n')}</textarea>
            <div class="button-group">
                <button class="close-btn">取消</button>
                <button class="save-btn">保存</button>
            </div>
            <div class="help-text">
                <div id="keywords-help">
                    <div><strong>关键词屏蔽说明：</strong></div>
                    <div>• 普通关键词：直接匹配问题标题内容</div>
                    <div>• 正则表达式：用 // 包裹，如 /推广\d+元/</div>
                    <div>• 每行输入一个关键词</div>
                    <div>• 匹配到关键词的问题将被隐藏</div>
                    <div>• 点击问题旁的"屏蔽"按钮可快速添加关键词</div>
                    <div>• 按 F8 键将选中文本添加到屏蔽词</div>
                    <div>• 同时自动隐藏广告卡片 (TopstoryItem--advertCard)</div>
                </div>
                <div id="users-help" style="display: none;">
                    <div><strong>用户屏蔽说明：</strong></div>
                    <div>• 每行输入一个用户名</div>
                    <div>• 该用户的所有回答和文章将被隐藏</div>
                    <div>• 点击回答旁的"屏蔽作者"按钮可快速添加</div>
                    <div>• 用户名从 data-zop 属性中自动提取</div>
                </div>
            </div>
        </div>
    `;

        // 标签切换功能
        const tabs = manager.querySelectorAll('.tab');
        const textareas = {
            keywords: manager.querySelector('#keywords-textarea'),
            users: manager.querySelector('#users-textarea')
        };
        const helps = {
            keywords: manager.querySelector('#keywords-help'),
            users: manager.querySelector('#users-help')
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
            const usersText = textareas.users.value;

            // 更新全局变量
            const newKeywords = keywordsText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            const newUsers = usersText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            // 保存关键词
            keywords = newKeywords;
            GM_setValue(STORAGE_PREFIX + 'keywords', keywords);

            // 保存屏蔽用户
            blockedUsers = newUsers;
            GM_setValue(STORAGE_PREFIX + 'blocked_users', blockedUsers);

            console.log(`📦 已保存到本地：`, {
                keywordsCount: keywords.length,
                usersCount: blockedUsers.length
            });

            // WebDAV同步
            if (webdavConfig && webdavConfig.enabled) {
                syncToWebDAV('通过管理器修改');
            }

            // 关闭管理器
            overlay.remove();
            manager.remove();
            keywordManager = null;

            // 重新执行屏蔽
            hideQuestions();
            hideAdvertCards();

            // 显示成功提示
            showNotification(`已保存 ${keywords.length} 个关键词和 ${blockedUsers.length} 个屏蔽用户`);
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

    // 显示用户屏蔽管理器
    function showUserBlockManager() {
        const overlay = document.createElement('div');
        overlay.className = 'keyword-manager-overlay';

        const manager = document.createElement('div');
        manager.className = 'keyword-manager-modal';
        manager.innerHTML = `
            <div class="keyword-manager">
                <h3>知乎用户屏蔽管理</h3>
                <textarea placeholder="每行一个用户名&#10;&#10;示例：&#10;用户名1&#10;用户名2&#10;用户名3">${blockedUsers.join('\n')}</textarea>
                <div class="button-group">
                    <button class="close-btn">取消</button>
                    <button class="save-btn">保存</button>
                </div>
                <div class="help-text">
                    <div><strong>使用说明：</strong></div>
                    <div>• 每行输入一个用户名</div>
                    <div>• 该用户的所有回答和文章将被隐藏</div>
                    <div>• 点击回答旁的"屏蔽作者"按钮可快速添加</div>
                </div>
            </div>
        `;

        manager.querySelector('.save-btn').addEventListener('click', function () {
            const textarea = manager.querySelector('textarea');
            const newUsers = textarea.value.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            saveBlockedUsersAndSync(newUsers, '通过管理器修改');

            overlay.remove();
            manager.remove();

            hideQuestions();
            hideAdvertCards();
        });

        manager.querySelector('.close-btn').addEventListener('click', function () {
            overlay.remove();
            manager.remove();
        });

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.remove();
                manager.remove();
            }
        });

        document.body.appendChild(overlay);
        document.body.appendChild(manager);
        manager.querySelector('textarea').focus();
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

    // 添加屏蔽按钮到问题标题
    function addBlockButtons() {
        // 如果设置为不显示按钮,直接返回
        if (!showBlockButton) {
            return;
        }

        const questionTitles = document.querySelectorAll('.ContentItem-title');

        questionTitles.forEach(titleElement => {
            // 检查是否已经添加过按钮
            if (titleElement.querySelector('.zhihu-block-btn')) {
                return;
            }

            const titleLink = titleElement.querySelector('a');
            if (!titleLink) return;

            const questionText = titleLink.textContent.trim();

            // 创建屏蔽按钮
            const blockBtn = document.createElement('button');
            blockBtn.className = 'zhihu-block-btn';
            blockBtn.textContent = '屏蔽';
            blockBtn.title = '将此问题添加到屏蔽列表';

            // 按钮点击事件
            blockBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                // 添加关键词到列表
                if (!keywords.includes(questionText)) {
                    const newKeywords = [...keywords, questionText];
                    saveKeywordsAndSync(newKeywords, `手动屏蔽: ${questionText}`);

                    console.log(`✅ 已添加屏蔽关键词: "${questionText}"`);

                    // 显示成功提示
                    showNotification(`已添加屏蔽词: "${questionText}"`);
                }

                // 隐藏该问题
                const contentItem = titleElement.closest('.ContentItem');
                if (contentItem && !contentItem.classList.contains('custom-hidden')) {
                    contentItem.classList.add('custom-hidden');

                    // 根据设置决定是否显示占位块
                    if (showPlaceholder) {
                        // 创建提示元素
                        const message = document.createElement('div');
                        message.className = 'custom-hidden-message';
                        message.innerHTML = `🚫 已手动屏蔽问题: "${questionText}"`;

                        // 替换原始内容
                        contentItem.parentNode.replaceChild(message, contentItem);
                    } else {
                        // 完全隐藏内容
                        contentItem.style.display = 'none';
                    }

                    // 记录到控制台
                    logHiddenContent(questionText, questionText, contentItem, '手动添加', '手动屏蔽');
                }
            });

            // 将按钮添加到标题后面
            titleElement.appendChild(blockBtn);

            // 添加屏蔽作者按钮
            const contentItem = titleElement.closest('.ContentItem');
            if (contentItem) {
                const authorName = getAuthorNameFromElement(contentItem);
                if (authorName) {
                    const blockUserBtn = document.createElement('button');
                    blockUserBtn.className = 'zhihu-block-user-btn';
                    blockUserBtn.textContent = '屏蔽作者';
                    blockUserBtn.title = `屏蔽作者: ${authorName}`;

                    blockUserBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();

                        if (!blockedUsers.includes(authorName)) {
                            const newUsers = [...blockedUsers, authorName];
                            saveAllSettingsAndSync(keywords, newUsers, `手动屏蔽用户: ${authorName}`);
                            console.log(`✅ 已添加屏蔽用户: "${authorName}"`);
                            showNotification(`已屏蔽作者: "${authorName}"`);
                        }

                        if (!contentItem.classList.contains('custom-hidden')) {
                            contentItem.classList.add('custom-hidden');

                            // 根据设置决定是否显示占位块
                            if (showPlaceholder) {
                                const message = document.createElement('div');
                                message.className = 'custom-hidden-message';
                                message.innerHTML = `🚫 已屏蔽作者: "${authorName}"`;
                                contentItem.parentNode.replaceChild(message, contentItem);
                            } else {
                                // 完全隐藏内容
                                contentItem.style.display = 'none';
                            }

                            logHiddenContent(authorName, `作者: ${authorName}`, contentItem, '用户屏蔽', '手动屏蔽');
                        }
                    });

                    titleElement.appendChild(blockUserBtn);
                }
            }
        });
    }

    // 隐藏广告卡片
    function hideAdvertCards() {
        const advertCards = document.querySelectorAll('.TopstoryItem--advertCard');

        advertCards.forEach(card => {
            if (!card.classList.contains('custom-hidden')) {
                card.classList.add('custom-hidden');

                // 根据设置决定是否显示占位块
                if (showPlaceholder) {
                    // 创建提示元素
                    const message = document.createElement('div');
                    message.className = 'custom-hidden-message';
                    message.innerHTML = '🚫 已隐藏广告卡片';

                    // 替换原始内容
                    card.parentNode.replaceChild(message, card);
                } else {
                    // 完全隐藏内容
                    card.style.display = 'none';
                }

                // 记录到控制台
                logHiddenContent('TopstoryItem--advertCard', '广告卡片', card, '广告卡片', '自动屏蔽');
            }
        });
    }

    function hideQuestions() {
        // 在问题详情页和用户主页不启用屏蔽功能
        const isQuestionPage = window.location.href.includes('/question/');
        const isPeoplePage = window.location.href.includes('/people/');
        if (isQuestionPage || isPeoplePage) {
            return; // 直接返回，不执行任何屏蔽功能
        }

        // 添加屏蔽按钮
        addBlockButtons();

        // 然后执行自动屏蔽
        const contentItems = document.querySelectorAll('.ContentItem');

        contentItems.forEach(contentItem => {
            if (contentItem.classList.contains('custom-hidden')) {
                return;
            }

            // 用户屏蔽
            const authorName = getAuthorNameFromElement(contentItem);
            if (authorName && isUserBlocked(authorName)) {
                contentItem.classList.add('custom-hidden');

                // 根据设置决定是否显示占位块
                if (showPlaceholder) {
                    const message = document.createElement('div');
                    message.className = 'custom-hidden-message';
                    message.innerHTML = `🚫 已屏蔽作者: "${authorName}"`;
                    contentItem.parentNode.replaceChild(message, contentItem);
                } else {
                    // 完全隐藏内容
                    contentItem.style.display = 'none';
                }

                logHiddenContent(authorName, `作者: ${authorName}`, contentItem, '用户屏蔽', '自动屏蔽');
                return;
            }

            // 时间屏蔽
            if (!isQuestionPage && !isPeoplePage && isAnswerTooOld(contentItem)) {
                contentItem.classList.add('custom-hidden');

                // 根据设置决定是否显示占位块
                if (showPlaceholder) {
                    const message = document.createElement('div');
                    message.className = 'time-filter-hidden-message';
                    message.innerHTML = `⏰ 已隐藏 ${timeFilterDays} 天前的回答`;
                    contentItem.parentNode.replaceChild(message, contentItem);
                } else {
                    // 完全隐藏内容
                    contentItem.style.display = 'none';
                }

                logHiddenContent(`${timeFilterDays}天前`, '时间过滤', contentItem, '时间过滤', '自动屏蔽');
                return;
            }

            // 关键词屏蔽
            const titleElement = contentItem.querySelector('.ContentItem-title a');
            if (titleElement) {
                const questionText = titleElement.textContent.trim();
                const matchResult = isTextMatched(questionText);

                if (matchResult) {
                    contentItem.classList.add('custom-hidden');
                    let displayKeyword = matchResult.keyword;
                    let matchType = matchResult.type === 'regex' ? '正则表达式' : '普通关键词';

                    // 根据设置决定是否显示占位块
                    if (showPlaceholder) {
                        const message = document.createElement('div');
                        message.className = 'custom-hidden-message';
                        message.innerHTML = `🚫 已隐藏包含"${displayKeyword}"的问题`;
                        contentItem.parentNode.replaceChild(message, contentItem);
                    } else {
                        // 完全隐藏内容
                        contentItem.style.display = 'none';
                    }

                    logHiddenContent(matchResult.keyword, questionText, contentItem, matchType, '自动屏蔽');
                }
            }
        });

        // 隐藏广告卡片
        hideAdvertCards();
    }

    // 显示通知
    function showNotification(message, timeout = 3000) {
        // 尝试使用GM_notification
        if (typeof GM_notification === 'function') {
            GM_notification({
                text: message,
                timeout: timeout,
                title: '知乎关键词屏蔽'
            });
        } else {
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
    }

    // 处理快捷键添加屏蔽词
    function handleKeyPress(event) {
        // 检查是否按下了 F8 键（keyCode 119）或 Alt+Q（keyCode 81 + altKey）
        if ((event.keyCode === 119 && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) || // F8 单独按下
            (event.keyCode === 81 && event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey)) { // Alt+Q
            const selectedText = window.getSelection().toString().trim();

            if (selectedText && selectedText.length > 0) {
                // 防止默认行为
                event.preventDefault();
                event.stopPropagation();

                // 检查是否已存在该关键词
                if (!keywords.includes(selectedText)) {
                    // 添加到关键词列表
                    const newKeywords = [...keywords, selectedText];
                    saveAllSettingsAndSync(newKeywords, blockedUsers, `快捷键添加: ${selectedText}`);

                    // 显示成功提示
                    showNotification(`✅ 已添加屏蔽词: "${selectedText}"`);

                    // 如果当前在主站，立即执行一次匹配处理
                    if (isMainZhihuSite()) {
                        hideQuestions();
                    }

                    console.log(`✅ 快捷键添加屏蔽关键词: "${selectedText}"`);
                } else {
                    showNotification(`⚠️ 屏蔽词已存在: "${selectedText}"`);
                }
            } else {
                showNotification('⚠️ 请先选择要屏蔽的文本');
            }
        }
    }

    // 从 data-zop 属性中提取用户名
    function getAuthorNameFromElement(element) {
        try {
            const dataZop = element.getAttribute('data-zop');
            if (dataZop) {
                const zopData = JSON.parse(dataZop);
                return zopData.authorName || null;
            }
        } catch (e) {
            console.warn('解析 data-zop 失败:', e);
        }
        return null;
    }

    // 检查用户是否被屏蔽
    function isUserBlocked(username) {
        return username && blockedUsers.includes(username);
    }

    // 显示时间过滤配置界面函数
    function showTimeFilterConfig() {
        const overlay = document.createElement('div');
        overlay.className = 'keyword-manager-overlay';

        const configModal = document.createElement('div');
        configModal.className = 'keyword-manager-modal';
        configModal.innerHTML = `
            <div class="keyword-manager">
                <h3>设置时间过滤</h3>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 10px; font-weight: bold;">
                        隐藏多少天之前的回答：
                    </label>
                    <input type="number" id="time-filter-days" 
                        value="${timeFilterDays}" 
                        min="1" max="3650" 
                        style="width: 100%; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 4px; background: var(--input-bg, white); color: var(--input-color, #333);">
                </div>
                <div class="button-group">
                    <button class="close-btn">取消</button>
                    <button class="save-btn">保存</button>
                </div>
                <div class="help-text">
                    <div><strong>时间过滤说明：</strong></div>
                    <div>• 设置隐藏多少天之前的回答</div>
                    <div>• 设置为 0 表示禁用时间过滤</div>
                    <div>• 基于回答的创建时间进行过滤</div>
                    <div>• 仅对首页的回答生效</div>
                </div>
            </div>
        `;

        configModal.querySelector('.save-btn').addEventListener('click', function () {
            const daysInput = configModal.querySelector('#time-filter-days');
            const newDays = parseInt(daysInput.value);

            if (!isNaN(newDays) && newDays >= 0) {
                timeFilterDays = newDays;
                GM_setValue(TIME_FILTER_DAYS_KEY, timeFilterDays);

                overlay.remove();
                configModal.remove();

                showNotification(`时间过滤已设置为: ${timeFilterDays}天`);

                // 重新执行屏蔽
                if (isMainZhihuSite()) {
                    hideQuestions();
                }
            } else {
                showNotification('请输入有效的天数');
            }
        });

        configModal.querySelector('.close-btn').addEventListener('click', function () {
            overlay.remove();
            configModal.remove();
        });

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.remove();
                configModal.remove();
            }
        });

        document.body.appendChild(overlay);
        document.body.appendChild(configModal);

        // 聚焦到输入框并选中文本
        const input = configModal.querySelector('#time-filter-days');
        input.focus();
        input.select();
    }

    // 时间过滤检查函数
    function isAnswerTooOld(contentItem) {
        if (timeFilterDays <= 0) return false;

        // 查找日期元素
        const dateMeta = contentItem.querySelector('meta[itemprop="dateCreated"]');
        if (!dateMeta) return false;

        const dateString = dateMeta.getAttribute('content');
        if (!dateString) return false;

        try {
            const answerDate = new Date(dateString);
            const currentDate = new Date();
            const timeDiff = currentDate - answerDate;
            const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

            return daysDiff > timeFilterDays;
        } catch (e) {
            console.warn('解析日期失败:', dateString, e);
            return false;
        }
    }

    // 检查当前页面是否在主站（允许执行屏蔽功能）
    function isMainZhihuSite() {
        const currentUrl = window.location.href;

        // 排除用户主页路径
        if (currentUrl.includes('/people/')) {
            return false;
        }

        // 排除问题详情页 
        if (currentUrl.includes('/question/')) {
            return false;
        }

        const mainSites = [
            'https://www.zhihu.com',
            'https://www.zhihu.com/?theme=light',
            'https://www.zhihu.com/?theme=dark',
            'https://zhihu.com',
            'https://zhihu.com/?theme=light',
            'https://zhihu.com/?theme=dark',
            'https://www.zhihu.com/follow',
            'https://www.zhihu.com/hot',
            'https://www.zhihu.com/explore'
        ];

        return mainSites.some(site => currentUrl.startsWith(site)) ||
            currentUrl === 'https://www.zhihu.com/' ||
            currentUrl === 'https://zhihu.com/';
    }

    // 使用防抖避免频繁执行
    let timeoutId;
    function debouncedHide() {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(hideQuestions, 100);
    }

    // 输出脚本信息
    function logScriptInfo() {
        const isQuestionPage = window.location.href.includes('/question/');
        const isPeoplePage = window.location.href.includes('/people/');
        const pageType = isQuestionPage ? '问题详情页' : (isPeoplePage ? '用户主页' : (isMainZhihuSite() ? '知乎首页' : '其他页面'));

        console.log(
            `%c📚 知乎问题关键词屏蔽脚本已启动\n` +
            `🔤 屏蔽关键词: ${keywords.length} 个\n` +
            `👤 屏蔽用户: ${blockedUsers.length} 个\n` +
            `⏰ 时间过滤: ${timeFilterDays > 0 ? timeFilterDays + '天前' : '禁用'}\n` +
            `📄 当前页面: ${pageType}\n` +
            `📱 同时隐藏广告卡片 (TopstoryItem--advertCard)\n` +
            `🔗 WebDAV同步: ${webdavConfig.enabled ? '已启用' : '未启用'}\n` +
            `🔘 屏蔽按钮: ${showBlockButton ? '显示' : '隐藏'}\n` +
            `📦 占位块: ${showPlaceholder ? '显示' : '隐藏'}\n` +
            `⌨️  按 F8 添加选中文本到屏蔽词\n` +
            `⏰ 启动时间: ${new Date().toLocaleString()}`,
            'background: #0084ff; color: white; padding: 5px; border-radius: 3px;'
        );
    }

    // 显示显示设置界面
    function showDisplaySettings() {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'keyword-manager-overlay';

        // 创建设置模态框
        const settingsModal = document.createElement('div');
        settingsModal.className = 'keyword-manager-modal';
        settingsModal.innerHTML = `
        <div class="keyword-manager">
            <h3>显示设置</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; margin-bottom: 10px;">
                    <input type="checkbox" id="show-block-button" ${showBlockButton ? 'checked' : ''} style="margin-right: 8px;">
                    显示问题旁边的屏蔽按钮
                </label>
                <label style="display: flex; align-items: center; margin-bottom: 10px;">
                    <input type="checkbox" id="show-placeholder" ${showPlaceholder ? 'checked' : ''} style="margin-right: 8px;">
                    显示已屏蔽内容的占位块
                </label>
            </div>
            <div class="button-group">
                <button class="close-btn">取消</button>
                <button class="save-btn">保存</button>
            </div>
            <div class="help-text">
                <div><strong>设置说明:</strong></div>
                <div>• 屏蔽按钮: 在问题标题旁显示"屏蔽"按钮,方便快速屏蔽问题</div>
                <div>• 占位块: 被屏蔽的内容会显示灰色提示框,取消则完全隐藏</div>
            </div>
        </div>
    `;

        // 保存按钮事件
        settingsModal.querySelector('.save-btn').addEventListener('click', function () {
            const newShowBlockButton = settingsModal.querySelector('#show-block-button').checked;
            const newShowPlaceholder = settingsModal.querySelector('#show-placeholder').checked;

            showBlockButton = newShowBlockButton;
            showPlaceholder = newShowPlaceholder;

            GM_setValue(STORAGE_PREFIX + 'show_block_button', showBlockButton);
            GM_setValue(STORAGE_PREFIX + 'show_placeholder', showPlaceholder);

            // 关闭设置窗口
            overlay.remove();
            settingsModal.remove();

            showNotification('显示设置已保存');

            // 重新执行屏蔽以应用新设置
            location.reload(); // 刷新页面以应用新设置
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

    // 强制更新页面布局函数
    function forceLayoutUpdate() {
        // 方法1: 触发resize事件
        window.dispatchEvent(new Event('resize'));

        // 方法2: 使用requestAnimationFrame确保渲染完成
        requestAnimationFrame(() => {
            document.body.offsetHeight;
        });

        // 方法3: 微调一个隐藏元素来触发重排
        const trigger = document.createElement('div');
        trigger.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(trigger);
        trigger.offsetHeight;
        document.body.removeChild(trigger);
    }

    // 注册油猴菜单命令
    GM_registerMenuCommand('管理屏蔽设置', showKeywordManager);
    // GM_registerMenuCommand('管理屏蔽用户', showUserBlockManager);
    GM_registerMenuCommand('设置WebDAV同步', showWebDAVConfig);
    GM_registerMenuCommand('设置时间过滤天数', showTimeFilterConfig);
    GM_registerMenuCommand('显示设置', showDisplaySettings);

    // 初始化
    function init() {
        // 输出脚本启动信息
        logScriptInfo();

        // 添加键盘事件监听（在所有知乎站点都启用）
        document.addEventListener('keydown', handleKeyPress);

        // 在所有页面都执行基本功能，只在特定页面限制某些功能
        const isQuestionPage = window.location.href.includes('/question/');

        // 页面加载时执行一次
        hideQuestions();

        // 监听DOM变化（使用防抖）
        const observer = new MutationObserver(debouncedHide);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 页面加载时执行一次WebDAV同步检查
        if (webdavConfig.enabled) {
            console.log('🔗 检查WebDAV同步...');
            syncFromWebDAV().then(synced => {
                if (synced) {
                    hideQuestions();
                }
            });
        }

        // 添加全局函数以便在控制台手动查看统计
        window.getHiddenStats = function () {
            console.log(
                `%c📊 知乎内容隐藏统计\n` +
                `📈 总共隐藏: ${hiddenCount} 个内容\n` +
                `📋 关键词分布:`,
                'background: #4CAF50; color: white; padding: 5px; border-radius: 3px;',
                hiddenDetails.reduce((acc, detail) => {
                    acc[detail.keyword] = (acc[detail.keyword] || 0) + 1;
                    return acc;
                }, {})
            );
            console.log('📋 完整记录:', hiddenDetails);
        };

        // 添加重置统计的函数
        window.resetHiddenStats = function () {
            hiddenCount = 0;
            hiddenDetails.length = 0;
            console.log('🔄 隐藏统计已重置');
        };

        console.log(
            `💡 提示: 在控制台使用以下命令:\n` +
            `   getHiddenStats() - 查看隐藏统计\n` +
            `   resetHiddenStats() - 重置统计计数\n` +
            `💡 功能: 按 F8 将选中文本添加到屏蔽词\n` +
            `💡 功能: 点击问题旁的"屏蔽"按钮快速屏蔽问题\n` +
            `💡 功能: 点击"屏蔽作者"按钮快速屏蔽用户\n` +
            `💡 菜单: 使用"管理屏蔽设置"统一管理关键词和用户屏蔽\n` +  // 更新这一行
            `💡 当前页面: ${isQuestionPage ? '问题详情页' : (isPeoplePage ? '用户主页' : '首页或其他页面')}\n` +
            `💡 时间过滤: ${(isQuestionPage || isPeoplePage) ? '禁用' : (timeFilterDays > 0 ? timeFilterDays + '天前' : '禁用')}`
        );
    }

    // 页面加载完成后执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();