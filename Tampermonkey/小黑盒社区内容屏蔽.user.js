// ==UserScript==
// @name         小黑盒社区内容屏蔽
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.1
// @description  屏蔽小黑盒社区的信息流内容，支持关键词、作者、游戏社区屏蔽
// @author       SI Xiaolong
// @match        https://www.xiaoheihe.cn/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

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

        // 判断是否为楼层回复
        const isReply = contentElement.classList.contains('comment-children-item');

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
                text: `屏蔽${isReply ? '回复者' : '作者'}: ${author}`,
                action: () => {
                    if (author) {
                        addToBlockList(CONFIG_KEYS.AUTHORS, author);
                        scanAndBlockContent();
                        showNotification(`已屏蔽${isReply ? '回复者' : '作者'}: ${author}`);
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
                disabled: !game || isReply  // 楼层回复没有游戏标签
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
            '.comment-children-item'  // 新增:楼层回复
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

    // 监听右键点击
    function attachContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            // 支持信息流、评论区和楼层回复
            const contentElement = e.target.closest('.hb-cpt__bbs-content, .bbs-home__content-item, .hb-cpt__bbs-list-content, .link-comment__comment-item, .comment-children-item');
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

    // 初始化
    function init() {
        console.log('小黑盒社区内容屏蔽脚本正在启动...');

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