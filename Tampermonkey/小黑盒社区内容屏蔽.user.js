// ==UserScript==
// @name         小黑盒社区内容屏蔽
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.3
// @description  屏蔽小黑盒社区的信息流内容，支持关键词、作者、游戏社区屏蔽
// @author       SI Xiaolong
// @match        https://www.xiaoheihe.cn/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    // 版本号提取
    const SCRIPT_VERSION = GM_info.script.version || 'unknown';

    // WebDAV配置存储键
    const WEBDAV_CONFIG_KEY = 'heybox_webdav_config';

    // WebDAV配置
    let webdavConfig = GM_getValue(WEBDAV_CONFIG_KEY, {
        enabled: false,
        url: '',
        username: '',
        password: '',
        lastSync: 0
    });

    // 存储配置的键名
    const CONFIG_KEYS = {
        KEYWORDS: 'heybox_blocked_keywords',
        AUTHORS: 'heybox_blocked_authors',
        GAMES: 'heybox_blocked_games'
    };

    // 获取屏蔽列表
    function getBlockList(key) {
        const data = GM_getValue(key, '[]');
        return JSON.parse(data);
    }

    // 保存屏蔽列表
    function saveBlockList(key, list) {
        GM_setValue(key, JSON.stringify(list));

        // 同步到WebDAV
        if (webdavConfig && webdavConfig.enabled) {
            const keyName = Object.keys(CONFIG_KEYS).find(k => CONFIG_KEYS[k] === key);
            syncToWebDAV(`保存${keyName || '列表'}`);
        }
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
        if (!document.querySelector('#heybox-notification-style')) {
            style.id = 'heybox-notification-style';
            document.head.appendChild(style);
        }

        notification.textContent = message;
        document.body.appendChild(notification);

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

    // 获取楼层回复信息
    function getReplyInfo(replyElement) {
        const authorElement = replyElement.querySelector('.children-item__comment-creator');
        const author = authorElement ? authorElement.textContent.trim() : '';

        const contentElement = replyElement.querySelector('.children-item__comment-content');
        const content = contentElement ? contentElement.textContent.trim() : '';

        return { author, content };
    }

    // 获取内容信息
    function getContentInfo(contentElement) {
        // 判断是楼层回复
        const isReply = contentElement.classList.contains('comment-children-item');

        if (isReply) {
            const { author, content } = getReplyInfo(contentElement);
            return { title: '', content, author, game: '' };
        }

        // 判断是评论通知
        const isNotification = contentElement.classList.contains('message__comment-item');

        if (isNotification) {
            // 评论通知结构
            const authorElement = contentElement.querySelector('.message-comment-item__username');
            const author = authorElement ? authorElement.textContent.trim() : '';

            const contentTextElement = contentElement.querySelector('.message-comment-item__text');
            const content = contentTextElement ? contentTextElement.textContent.trim() : '';

            // 也获取原文内容用于关键词匹配
            const originalContentElement = contentElement.querySelector('.message-content-item__text');
            const originalContent = originalContentElement ? originalContentElement.textContent.trim() : '';

            return { title: '', content: content + ' ' + originalContent, author, game: '' };
        }

        // 判断是信息流还是评论
        const isComment = contentElement.classList.contains('link-comment__comment-item');

        if (isComment) {
            // 评论区结构
            const contentTextElement = contentElement.querySelector('.comment-item__content');
            const content = contentTextElement ? contentTextElement.textContent.trim() : '';

            const authorElement = contentElement.querySelector('.info-box__username');
            const author = authorElement ? authorElement.textContent.trim() : '';

            return { title: '', content, author, game: '' };
        } else {
            // 信息流结构
            const titleElement = contentElement.querySelector('.bbs-content__title');
            const title = titleElement ? titleElement.textContent.trim() : '';

            const contentTextElement = contentElement.querySelector('.bbs-content__content');
            const content = contentTextElement ? contentTextElement.textContent.trim() : '';

            const authorElement = contentElement.querySelector('.list-content__username');
            const author = authorElement ? authorElement.textContent.trim() : '';

            const gameTagElement = contentElement.querySelector('.content-tag-text');
            const game = gameTagElement ? gameTagElement.textContent.trim() : '';

            return { title, content, author, game };
        }
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
    function createContextMenu(contentElement, e) {
        e.preventDefault();
        e.stopPropagation();

        // 移除已存在的菜单
        const existingMenu = document.getElementById('heybox-block-menu');
        if (existingMenu) existingMenu.remove();

        const { title, content, author, game } = getContentInfo(contentElement);

        // 判断是否为楼层回复或评论通知
        const isReply = contentElement.classList.contains('comment-children-item');
        const isNotification = contentElement.classList.contains('message__comment-item');

        const menu = document.createElement('div');
        menu.id = 'heybox-block-menu';
        menu.style.cssText = `
        position: fixed;
        left: ${e.clientX}px;
        top: ${e.clientY}px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 999999;
        min-width: 200px;
        font-size: 14px;
    `;

        const menuItems = [
            {
                text: `屏蔽关键词`,
                action: () => {
                    const defaultText = content.substring(0, 20);
                    const keyword = prompt('请输入要屏蔽的关键词:', defaultText);
                    if (keyword) {
                        addToBlockList(CONFIG_KEYS.KEYWORDS, keyword);
                        scanAndBlockContent();
                        showNotification(`已屏蔽关键词: ${keyword}`);
                    }
                },
                disabled: !content
            },
            {
                text: `屏蔽${isReply || isNotification ? '评论者' : '作者'}: ${author}`,
                action: () => {
                    if (author) {
                        addToBlockList(CONFIG_KEYS.AUTHORS, author);
                        scanAndBlockContent();
                        showNotification(`已屏蔽${isReply || isNotification ? '评论者' : '作者'}: ${author}`);
                    }
                },
                disabled: !author
            },
            {
                text: `屏蔽游戏: ${game}`,
                action: () => {
                    if (game) {
                        addToBlockList(CONFIG_KEYS.GAMES, game);
                        scanAndBlockContent();
                        showNotification(`已屏蔽游戏: ${game}`);
                    }
                },
                disabled: !game || isReply || isNotification
            }
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

    // 检查内容是否应该被屏蔽
    function shouldBlockContent(contentElement) {
        const { title, content, author, game } = getContentInfo(contentElement);

        // 检查作者（支持正则）
        const blockedAuthors = getBlockList(CONFIG_KEYS.AUTHORS);
        if (author && blockedAuthors.some(blocked => matchText(author, blocked))) {
            return true;
        }

        // 检查游戏（支持正则）
        const blockedGames = getBlockList(CONFIG_KEYS.GAMES);
        if (game && blockedGames.some(blocked => matchText(game, blocked))) {
            return true;
        }

        // 检查关键词（支持正则，同时检查标题和内容）
        const blockedKeywords = getBlockList(CONFIG_KEYS.KEYWORDS);
        const fullText = title + ' ' + content;
        if (blockedKeywords.some(keyword => matchText(fullText, keyword))) {
            return true;
        }

        return false;
    }

    // 隐藏内容元素
    function hideContent(contentElement) {
        contentElement.style.display = 'none';
        contentElement.setAttribute('data-heybox-blocked', 'true');
    }

    // 显示内容元素
    function showContent(contentElement) {
        contentElement.style.display = '';
        contentElement.removeAttribute('data-heybox-blocked');
    }

    // 扫描并屏蔽内容
    function scanAndBlockContent() {
        // 匹配小黑盒信息流和评论区的多种容器选择器
        const selectors = [
            '.hb-cpt__bbs-content',
            '.bbs-home__content-item',
            '.hb-cpt__bbs-list-content',
            '.link-comment__comment-item',  // 评论区
            '.comment-children-item',  // 楼层回复
            '.message__comment-item'  // 评论通知
        ];

        selectors.forEach(selector => {
            const contents = document.querySelectorAll(selector);
            contents.forEach(content => {
                if (shouldBlockContent(content)) {
                    hideContent(content);
                } else if (content.getAttribute('data-heybox-blocked')) {
                    showContent(content);
                }
            });
        });
    }

    // 显示WebDAV配置界面
    function showWebDAVConfig() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 9999998;
    `;

        const configModal = document.createElement('div');
        configModal.style.cssText = `
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 500px;
        max-width: 90vw;
        background: white;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        z-index: 9999999;
    `;

        configModal.innerHTML = `
        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #333;">WebDAV同步设置</h3>
        <div style="margin-bottom: 15px;">
            <label style="display: flex; align-items: center; margin-bottom: 10px;">
                <input type="checkbox" id="webdav-enabled" ${webdavConfig.enabled ? 'checked' : ''} style="margin-right: 8px;">
                启用WebDAV同步
            </label>
        </div>
        <div style="margin-bottom: 15px;">
            <input type="url" id="webdav-url" placeholder="WebDAV服务器地址 (https://example.com/dav/)"
                   value="${webdavConfig.url || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; box-sizing: border-box;">
            <input type="text" id="webdav-username" placeholder="用户名"
                   value="${webdavConfig.username || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; box-sizing: border-box;">
            <input type="password" id="webdav-password" placeholder="密码"
                   value="${webdavConfig.password || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="cancel-btn" style="padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; background: #f5f5f5; color: #666;">取消</button>
            <button id="save-btn" style="padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; background: #1890ff; color: white;">保存</button>
        </div>
        <div style="margin-top: 10px; font-size: 12px; color: #666; line-height: 1.4;">
            <div><strong>WebDAV同步说明：</strong></div>
            <div>• 启用后，每次修改屏蔽词会自动同步到WebDAV服务器</div>
            <div>• 支持 Nextcloud、OwnCloud、坚果云等WebDAV服务</div>
            <div>• 文件将保存为: heybox_blocklist.json</div>
            <div>• 多设备使用时请注意冲突问题</div>
        </div>
    `;

        configModal.querySelector('#save-btn').addEventListener('click', function () {
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

        configModal.querySelector('#cancel-btn').addEventListener('click', function () {
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

    // WebDAV辅助函数
    function getWebDAVUrls() {
        let base = webdavConfig.url;
        if (!base.endsWith('/')) base += '/';
        const folder = base + 'HeyboxBlock/';
        const file = folder + 'heybox_blocklist.json';
        const auth = 'Basic ' + btoa(webdavConfig.username + ':' + webdavConfig.password);
        return { base, folder, file, auth };
    }

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

    function updateLastSync(timestamp) {
        webdavConfig.lastSync = timestamp;
        GM_setValue(WEBDAV_CONFIG_KEY, webdavConfig);
    }

    function createConfigObject(base = {}, reason = '手动同步') {
        return {
            ...base,
            keywords: getBlockList(CONFIG_KEYS.KEYWORDS),
            authors: getBlockList(CONFIG_KEYS.AUTHORS),
            games: getBlockList(CONFIG_KEYS.GAMES),
            lastModified: Date.now(),
            reason,
            timestamp: new Date().toISOString(),
            _script_version: SCRIPT_VERSION
        };
    }

    function compareVersion(a, b) {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0, nb = pb[i] || 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    }

    function checkAndUpgradeVersion(remoteData) {
        if (!remoteData._script_version || remoteData._script_version === SCRIPT_VERSION) {
            console.log(`✅ 云端配置版本匹配：v${SCRIPT_VERSION}`);
            return;
        }

        const remoteVer = remoteData._script_version;
        const cmp = compareVersion(remoteVer, SCRIPT_VERSION);

        if (cmp > 0) {
            const msg = `🚨 警告：云端配置 v${remoteVer} 高于本地 v${SCRIPT_VERSION}，请升级脚本！`;
            showNotification(msg, 'info');
            console.log(msg);
        } else if (cmp < 0) {
            console.log(`⬆️ 云端配置 v${remoteVer} 较旧，自动升级中...`);
            if (!window._heybox_version_upgrading) {
                window._heybox_version_upgrading = true;
                setTimeout(() => {
                    syncToWebDAV('自动版本升级')
                        .then(() => {
                            const msg = `✅ 云端配置已升级：v${remoteVer} → v${SCRIPT_VERSION}`;
                            console.log(msg);
                            showNotification(msg);
                        })
                        .catch(() => showNotification('❌ 自动升级失败'))
                        .finally(() => window._heybox_version_upgrading = false);
                }, 1500);
            }
        }
    }

    function mergeFields(data) {
        let updated = false;

        if (Array.isArray(data.keywords)) {
            saveBlockList(CONFIG_KEYS.KEYWORDS, data.keywords);
            updated = true;
        }
        if (Array.isArray(data.authors)) {
            saveBlockList(CONFIG_KEYS.AUTHORS, data.authors);
            updated = true;
        }
        if (Array.isArray(data.games)) {
            saveBlockList(CONFIG_KEYS.GAMES, data.games);
            updated = true;
        }

        return updated;
    }

    // 从WebDAV拉取
    function syncFromWebDAV() {
        if (!webdavConfig.enabled || !webdavConfig.url) return Promise.resolve(false);

        const { file } = getWebDAVUrls();

        return new Promise(resolve => {
            webdavRequest({ method: 'GET', url: file, responseType: 'json' }, res => {
                if (res.status !== 200) {
                    if (res.status === 404) {
                        console.log('🔄 文件不存在，初始化上传');
                        syncToWebDAV('初始化同步').then(() => resolve(false));
                    } else {
                        console.error('❌ 拉取失败:', res.status);
                        resolve(false);
                    }
                    return;
                }

                let data;
                try { data = res.response || {}; } catch { data = {}; }

                const localTS = webdavConfig.lastSync || 0;
                const remoteTS = data.lastModified || 0;
                const remoteVer = data._script_version;

                const shouldDownload = remoteTS > localTS;
                const shouldUpload = remoteVer && compareVersion(remoteVer, SCRIPT_VERSION) < 0;

                let finalResolved = false;

                if (shouldDownload) {
                    const updated = mergeFields(data);
                    if (updated) {
                        updateLastSync(remoteTS);
                        const msg = '✅ 时间戳更新：已从云端同步数据';
                        console.log(msg);
                        showNotification(msg);
                        checkAndUpgradeVersion(data);
                        scanAndBlockContent();
                        resolve(true);
                        finalResolved = true;
                    }
                }

                if (shouldUpload && !finalResolved) {
                    console.log(`⬆️ 远端版本 v${remoteVer} 落后，强制升级`);
                    syncToWebDAV('强制版本升级')
                        .then(success => {
                            if (success) {
                                showNotification(`✅ 远端配置已强制升级至 v${SCRIPT_VERSION}`);
                                updateLastSync(Date.now());
                            }
                            resolve(success);
                        });
                    return;
                }

                if (!finalResolved) {
                    console.log('✅ 本地已是最新，无需操作');
                    if (remoteVer && compareVersion(remoteVer, SCRIPT_VERSION) > 0) {
                        const msg = `🚨 警告：云端配置 v${remoteVer} 高于本地 v${SCRIPT_VERSION}，请升级脚本！`;
                        showNotification(msg, 'info');
                        console.log(msg);
                    }
                    resolve(false);
                }
            });
        });
    }

    // 推送到WebDAV
    function syncToWebDAV(reason = '手动同步') {
        if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
            console.log('请配置 WebDAV');
            return Promise.resolve();
        }

        const { folder, file, auth } = getWebDAVUrls();

        return new Promise(resolve => {
            webdavRequest({ method: 'PROPFIND', url: folder }, res => {
                if (res.status === 404) {
                    webdavRequest({ method: 'MKCOL', url: folder }, () => proceed());
                } else {
                    proceed();
                }
            });

            function proceed() {
                webdavRequest({ method: 'GET', url: file }, res => {
                    let remote = {};
                    if (res.status === 200) {
                        try { remote = JSON.parse(res.responseText) || {}; } catch { }
                    }

                    const data = createConfigObject(remote, reason);
                    webdavRequest({
                        method: 'PUT',
                        url: file,
                        data: JSON.stringify(data, null, 2),
                        headers: { 'Content-Type': 'application/json; charset=utf-8', auth }
                    }, putRes => {
                        if (putRes.status >= 200 && putRes.status < 300) {
                            updateLastSync(data.lastModified);
                            console.log('上传成功');
                            resolve(true);
                        } else {
                            console.log('上传失败:', putRes.status);
                            resolve(false);
                        }
                    });
                });
            }
        });
    }

    // 监听右键点击
    function attachContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            // 支持信息流、评论区、楼层回复和评论通知
            const contentElement = e.target.closest('.hb-cpt__bbs-content, .bbs-home__content-item, .hb-cpt__bbs-list-content, .link-comment__comment-item, .comment-children-item, .message__comment-item');
            if (contentElement) {
                createContextMenu(contentElement, e);
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
            { key: CONFIG_KEYS.KEYWORDS, name: '关键词', supportsRegex: true },
            { key: CONFIG_KEYS.AUTHORS, name: '作者', supportsRegex: true },
            { key: CONFIG_KEYS.GAMES, name: '游戏社区', supportsRegex: true }
        ];

        let currentTab = 0;

        const renderDialog = () => {
            const currentConfig = tabs[currentTab];
            const list = getBlockList(currentConfig.key);
            const textareaValue = list.join('\n');

            dialog.innerHTML = `
                <div style="padding: 20px; border-bottom: 1px solid #e8e8e8;">
                    <h2 style="margin: 0; color: #333;">小黑盒屏蔽列表管理</h2>
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
                    <div style="margin-bottom: 10px; color: #666; font-size: 13px;">
                        ${currentConfig.supportsRegex
                    ? '提示：每行一项，支持正则表达式（用 /pattern/ 格式，如 /原神|米哈游/）'
                    : '提示：每行一项'}
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
                item.addEventListener('mouseenter', function () {
                    if (parseInt(this.getAttribute('data-index')) !== currentTab) {
                        this.style.background = '#e6e6e6';
                    }
                });
                item.addEventListener('mouseleave', function () {
                    if (parseInt(this.getAttribute('data-index')) !== currentTab) {
                        this.style.background = '#f5f5f5';
                    }
                });
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
                scanAndBlockContent();

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
    GM_registerMenuCommand('设置WebDAV同步', showWebDAVConfig);

    // 初始化
    function init() {
        console.log('小黑盒社区内容屏蔽脚本正在启动...');

        // WebDAV同步检查
        if (webdavConfig.enabled) {
            console.log('🔗 检查WebDAV同步...');
            syncFromWebDAV().then(synced => {
                if (synced) {
                    scanAndBlockContent();
                }
            });
        }

        // 先绑定右键菜单
        attachContextMenu();
        console.log('右键菜单已绑定');

        // 初始扫描
        scanAndBlockContent();
        console.log('初始扫描完成');

        // 监听DOM变化
        const observer = new MutationObserver(() => {
            scanAndBlockContent();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('小黑盒社区内容屏蔽脚本已启动');
    }

    // 等待页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();