// ==UserScript==
// @name         小红书综合屏蔽
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.0.1
// @description  屏蔽小红书发现页笔记内容，支持关键词、作者、用户ID、笔记ID和视频笔记屏蔽，适配深浅色模式
// @author       SI Xiaolong
// @match        https://www.xiaohongshu.com/explore*
// @icon         https://www.xiaohongshu.com/favicon.ico
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_PREFIX = 'sixiaolong1117_xhs_';
    const CONFIG_KEYS = {
        KEYWORDS: STORAGE_PREFIX + 'blocked_keywords',
        AUTHORS: STORAGE_PREFIX + 'blocked_authors',
        USER_IDS: STORAGE_PREFIX + 'blocked_user_ids',
        NOTE_IDS: STORAGE_PREFIX + 'blocked_note_ids',
        BLOCK_VIDEOS: STORAGE_PREFIX + 'block_videos',
        SHOW_BLOCK_BUTTON: STORAGE_PREFIX + 'show_block_button',
        SHOW_PLACEHOLDER: STORAGE_PREFIX + 'show_placeholder',
        HIDE_AD_ALERT: STORAGE_PREFIX + 'hide_ad_alert'
    };

    const DEFAULTS = {
        BLOCK_VIDEOS: false,
        SHOW_BLOCK_BUTTON: true,
        SHOW_PLACEHOLDER: true,
        HIDE_AD_ALERT: true
    };

    const SELECTORS = {
        feedContainer: '#exploreFeeds',
        noteItem: 'section.note-item',
        title: '.footer .title',
        author: '.author',
        authorName: '.author .name',
        cover: '.cover',
        playIcon: '.play-icon',
        adWrap: '.ad-wrap',
        adBlockAlert: '.reds-alert'
    };

    let scanTimer = null;

    function getValue(key, defaultValue) {
        return GM_getValue(key, defaultValue);
    }

    function setValue(key, value) {
        GM_setValue(key, value);
    }

    function getBlockList(key) {
        const raw = getValue(key, '[]');
        if (Array.isArray(raw)) {
            return raw;
        }
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('[小红书综合屏蔽] 屏蔽列表解析失败:', key, error);
            return [];
        }
    }

    function saveBlockList(key, list) {
        const uniqueList = [...new Set(list.map(item => item.trim()).filter(Boolean))];
        setValue(key, JSON.stringify(uniqueList));
        return uniqueList;
    }

    function addToBlockList(key, value) {
        const trimmedValue = (value || '').trim();
        if (!trimmedValue) {
            return false;
        }

        const list = getBlockList(key);
        if (list.includes(trimmedValue)) {
            return false;
        }

        list.push(trimmedValue);
        saveBlockList(key, list);
        return true;
    }

    function isRegexPattern(pattern) {
        return pattern.startsWith('/') && pattern.lastIndexOf('/') > 0;
    }

    function buildRegex(pattern) {
        const lastSlashIndex = pattern.lastIndexOf('/');
        const source = pattern.slice(1, lastSlashIndex);
        const flags = pattern.slice(lastSlashIndex + 1) || 'i';
        return new RegExp(source, flags.includes('i') ? flags : flags + 'i');
    }

    function matchText(text, pattern) {
        if (!text || !pattern) {
            return false;
        }

        if (isRegexPattern(pattern)) {
            try {
                return buildRegex(pattern).test(text);
            } catch (error) {
                console.warn('[小红书综合屏蔽] 正则表达式错误:', pattern, error);
                return false;
            }
        }

        return text.toLowerCase().includes(pattern.toLowerCase());
    }

    function getNoteId(noteItem) {
        const link = noteItem.querySelector('a[href^="/explore/"], a[href*="/explore/"]');
        if (!link) {
            return '';
        }

        const match = link.getAttribute('href').match(/\/explore\/([^/?#]+)/);
        return match ? match[1] : '';
    }

    function getUserId(noteItem) {
        const authorLink = noteItem.querySelector('.author[href*="/user/profile/"]');
        if (!authorLink) {
            return '';
        }

        const match = authorLink.getAttribute('href').match(/\/user\/profile\/([^/?#]+)/);
        return match ? match[1] : '';
    }

    function getNoteInfo(noteItem) {
        const titleElement = noteItem.querySelector(SELECTORS.title);
        const authorNameElement = noteItem.querySelector(SELECTORS.authorName);

        return {
            noteId: getNoteId(noteItem),
            userId: getUserId(noteItem),
            title: titleElement ? titleElement.textContent.trim() : '',
            author: authorNameElement ? authorNameElement.textContent.trim() : '',
            isVideo: Boolean(noteItem.querySelector(SELECTORS.playIcon))
        };
    }

    function getBlockReason(noteItem) {
        const info = getNoteInfo(noteItem);

        const blockedNoteIds = getBlockList(CONFIG_KEYS.NOTE_IDS);
        if (info.noteId && blockedNoteIds.includes(info.noteId)) {
            return `笔记ID: ${info.noteId}`;
        }

        const blockedUserIds = getBlockList(CONFIG_KEYS.USER_IDS);
        if (info.userId && blockedUserIds.includes(info.userId)) {
            return `用户ID: ${info.userId}`;
        }

        const blockedAuthors = getBlockList(CONFIG_KEYS.AUTHORS);
        const matchedAuthor = blockedAuthors.find(author => matchText(info.author, author));
        if (matchedAuthor) {
            return `作者: ${matchedAuthor}`;
        }

        const blockedKeywords = getBlockList(CONFIG_KEYS.KEYWORDS);
        const matchedKeyword = blockedKeywords.find(keyword => matchText(info.title, keyword));
        if (matchedKeyword) {
            return `关键词: ${matchedKeyword}`;
        }

        if (getValue(CONFIG_KEYS.BLOCK_VIDEOS, DEFAULTS.BLOCK_VIDEOS) && info.isVideo) {
            return '视频笔记';
        }

        return '';
    }

    function applyBlockedState(noteItem, reason) {
        const showPlaceholder = getValue(CONFIG_KEYS.SHOW_PLACEHOLDER, DEFAULTS.SHOW_PLACEHOLDER);
        noteItem.dataset.xhsBlocked = 'true';
        noteItem.dataset.xhsBlockReason = reason;
        noteItem.classList.toggle('xhs-blocked-with-placeholder', showPlaceholder);
        noteItem.classList.toggle('xhs-blocked-hidden', !showPlaceholder);
        noteItem.querySelectorAll('.xhs-block-placeholder').forEach(placeholder => placeholder.remove());

        if (showPlaceholder) {
            maskNoteContent(noteItem);
        } else {
            restoreMaskedContent(noteItem);
        }
    }

    function maskNoteContent(noteItem) {
        const titleElement = noteItem.querySelector(`${SELECTORS.title} span`) || noteItem.querySelector(SELECTORS.title);
        const authorElement = noteItem.querySelector(SELECTORS.authorName);
        const likeElement = noteItem.querySelector('.like-wrapper .count');

        maskTextElement(titleElement);
        maskTextElement(authorElement);
        maskTextElement(likeElement);
    }

    function maskTextElement(element) {
        if (!element) {
            return;
        }

        if (element.dataset.xhsOriginalText === undefined) {
            element.dataset.xhsOriginalText = element.textContent;
        }

        if (element.textContent !== '****') {
            element.textContent = '****';
        }
    }

    function restoreMaskedContent(noteItem) {
        noteItem.querySelectorAll('[data-xhs-original-text]').forEach(element => {
            element.textContent = element.dataset.xhsOriginalText;
            delete element.dataset.xhsOriginalText;
        });
    }

    function clearBlockedState(noteItem) {
        if (noteItem.dataset.xhsBlocked !== 'true') {
            return;
        }

        delete noteItem.dataset.xhsBlocked;
        delete noteItem.dataset.xhsBlockReason;
        restoreMaskedContent(noteItem);
        noteItem.classList.remove('xhs-blocked-with-placeholder', 'xhs-blocked-hidden');
        noteItem.querySelectorAll('.xhs-block-placeholder').forEach(placeholder => placeholder.remove());
    }

    function blockNote(noteItem, reason) {
        applyBlockedState(noteItem, reason);
    }

    function scanAndBlockNotes() {
        hideStandaloneAnnoyances();

        const noteItems = document.querySelectorAll(SELECTORS.noteItem);
        noteItems.forEach(noteItem => {
            addBlockButtons(noteItem);

            const reason = getBlockReason(noteItem);
            if (reason) {
                blockNote(noteItem, reason);
            } else {
                clearBlockedState(noteItem);
            }
        });
    }

    function scheduleScan() {
        window.clearTimeout(scanTimer);
        scanTimer = window.setTimeout(scanAndBlockNotes, 120);
    }

    function showNotification(message, type = 'success') {
        ensureBaseStyles();

        const notification = document.createElement('div');
        notification.className = `xhs-block-notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        window.setTimeout(() => {
            notification.classList.add('leaving');
            window.setTimeout(() => notification.remove(), 260);
        }, 2600);
    }

    function addBlockButtons(noteItem) {
        if (!getValue(CONFIG_KEYS.SHOW_BLOCK_BUTTON, DEFAULTS.SHOW_BLOCK_BUTTON)) {
            noteItem.querySelectorAll('.xhs-quick-block-btn').forEach(button => button.remove());
            return;
        }

        if (noteItem.dataset.xhsButtonsAdded === 'true') {
            return;
        }

        const authorWrapper = noteItem.querySelector('.author-wrapper');
        if (!authorWrapper) {
            return;
        }

        const authorButton = createQuickButton('屏蔽作者', '屏蔽此作者');
        authorButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();

            const info = getNoteInfo(noteItem);
            const key = info.userId ? CONFIG_KEYS.USER_IDS : CONFIG_KEYS.AUTHORS;
            const value = info.userId || info.author;
            const added = addToBlockList(key, value);
            showNotification(added ? `已屏蔽作者: ${info.author || value}` : `作者已在屏蔽列表中: ${info.author || value}`, added ? 'success' : 'info');
            scheduleScan();
        });

        authorWrapper.appendChild(authorButton);
        noteItem.dataset.xhsButtonsAdded = 'true';
    }

    function createQuickButton(text, title) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'xhs-quick-block-btn';
        button.textContent = text;
        button.title = title;
        return button;
    }

    function handleShortcut(event) {
        if (event.key !== 'F8') {
            return;
        }

        const selectedText = window.getSelection().toString().trim();
        if (!selectedText) {
            showNotification('请先选择要屏蔽的文本', 'info');
            return;
        }

        const keyword = selectedText.slice(0, 80);
        const added = addToBlockList(CONFIG_KEYS.KEYWORDS, keyword);
        showNotification(added ? `已添加关键词: ${keyword}` : `关键词已存在: ${keyword}`, added ? 'success' : 'info');
        scheduleScan();
    }

    function hideStandaloneAnnoyances() {
        if (!getValue(CONFIG_KEYS.HIDE_AD_ALERT, DEFAULTS.HIDE_AD_ALERT)) {
            return;
        }

        document.querySelectorAll(SELECTORS.adWrap).forEach(element => {
            element.classList.add('xhs-force-hidden');
        });

        document.querySelectorAll(SELECTORS.adBlockAlert).forEach(alert => {
            if (alert.textContent.includes('广告屏蔽插件')) {
                alert.classList.add('xhs-force-hidden');
            }
        });
    }

    function openManageDialog() {
        ensureBaseStyles();
        document.querySelector('#xhs-block-dialog-mask')?.remove();

        const tabs = [
            { key: CONFIG_KEYS.KEYWORDS, name: '关键词', help: '每行一项，匹配标题。支持 /pattern/ 或 /pattern/i 正则。' },
            { key: CONFIG_KEYS.AUTHORS, name: '作者', help: '每行一个作者昵称，支持正则。' },
            { key: CONFIG_KEYS.USER_IDS, name: '用户ID', help: '每行一个用户ID。点击“屏蔽作者”会优先记录用户ID。' },
            { key: CONFIG_KEYS.NOTE_IDS, name: '笔记ID', help: '每行一个笔记ID。' }
        ];
        let currentTabIndex = 0;

        const mask = document.createElement('div');
        mask.id = 'xhs-block-dialog-mask';

        const dialog = document.createElement('div');
        dialog.id = 'xhs-block-dialog';
        mask.appendChild(dialog);

        function render() {
            const tab = tabs[currentTabIndex];
            const list = getBlockList(tab.key);
            const blockVideos = getValue(CONFIG_KEYS.BLOCK_VIDEOS, DEFAULTS.BLOCK_VIDEOS);
            const showBlockButton = getValue(CONFIG_KEYS.SHOW_BLOCK_BUTTON, DEFAULTS.SHOW_BLOCK_BUTTON);
            const showPlaceholder = getValue(CONFIG_KEYS.SHOW_PLACEHOLDER, DEFAULTS.SHOW_PLACEHOLDER);
            const hideAdAlert = getValue(CONFIG_KEYS.HIDE_AD_ALERT, DEFAULTS.HIDE_AD_ALERT);

            dialog.innerHTML = `
                <div class="xhs-dialog-header">
                    <h2>小红书屏蔽管理</h2>
                    <button type="button" id="xhs-dialog-close">×</button>
                </div>
                <div class="xhs-dialog-switches">
                    <label><input type="checkbox" id="xhs-block-videos" ${blockVideos ? 'checked' : ''}> 屏蔽视频笔记</label>
                    <label><input type="checkbox" id="xhs-show-buttons" ${showBlockButton ? 'checked' : ''}> 显示快捷屏蔽按钮</label>
                    <label><input type="checkbox" id="xhs-show-placeholder" ${showPlaceholder ? 'checked' : ''}> 显示屏蔽占位</label>
                    <label><input type="checkbox" id="xhs-hide-ad-alert" ${hideAdAlert ? 'checked' : ''}> 隐藏广告屏蔽提示</label>
                </div>
                <div class="xhs-dialog-tabs">
                    ${tabs.map((item, index) => `<button type="button" class="${index === currentTabIndex ? 'active' : ''}" data-tab-index="${index}">${item.name}</button>`).join('')}
                </div>
                <div class="xhs-dialog-body">
                    <p>${tab.help}</p>
                    <textarea id="xhs-block-list-input">${escapeHtml(list.join('\n'))}</textarea>
                    <div class="xhs-dialog-count">当前 ${list.length} 项</div>
                </div>
                <div class="xhs-dialog-footer">
                    <button type="button" id="xhs-save-list">保存</button>
                    <button type="button" id="xhs-close-list">关闭</button>
                </div>
            `;

            dialog.querySelector('#xhs-dialog-close').addEventListener('click', () => mask.remove());
            dialog.querySelector('#xhs-close-list').addEventListener('click', () => mask.remove());

            dialog.querySelectorAll('.xhs-dialog-tabs button').forEach(button => {
                button.addEventListener('click', () => {
                    currentTabIndex = Number(button.dataset.tabIndex);
                    render();
                });
            });

            bindSwitch('#xhs-block-videos', CONFIG_KEYS.BLOCK_VIDEOS);
            bindSwitch('#xhs-show-buttons', CONFIG_KEYS.SHOW_BLOCK_BUTTON, () => {
                if (!getValue(CONFIG_KEYS.SHOW_BLOCK_BUTTON, DEFAULTS.SHOW_BLOCK_BUTTON)) {
                    document.querySelectorAll('.xhs-quick-block-btn').forEach(button => button.remove());
                    document.querySelectorAll(`${SELECTORS.noteItem}[data-xhs-buttons-added="true"]`).forEach(item => delete item.dataset.xhsButtonsAdded);
                }
            });
            bindSwitch('#xhs-show-placeholder', CONFIG_KEYS.SHOW_PLACEHOLDER);
            bindSwitch('#xhs-hide-ad-alert', CONFIG_KEYS.HIDE_AD_ALERT);

            dialog.querySelector('#xhs-save-list').addEventListener('click', () => {
                const input = dialog.querySelector('#xhs-block-list-input');
                const lines = input.value.split('\n').map(line => line.trim()).filter(Boolean);
                const savedList = saveBlockList(tab.key, lines);
                showNotification(`已保存 ${savedList.length} 项${tab.name}规则`);
                scheduleScan();
                render();
            });
        }

        function bindSwitch(selector, key, afterChange) {
            dialog.querySelector(selector).addEventListener('change', event => {
                setValue(key, event.target.checked);
                if (afterChange) {
                    afterChange();
                }
                scheduleScan();
            });
        }

        render();
        document.body.appendChild(mask);
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function ensureBaseStyles() {
        if (document.querySelector('#xhs-block-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'xhs-block-style';
        style.textContent = `
            :root {
                --xhs-block-bg: #fff;
                --xhs-block-bg-subtle: #fafafa;
                --xhs-block-text: #333;
                --xhs-block-muted: #666;
                --xhs-block-faint: #999;
                --xhs-block-border: #eee;
                --xhs-block-control-bg: #f0f0f0;
                --xhs-block-placeholder-bg: #fff4f6;
                --xhs-block-placeholder-border: rgba(255, 36, 66, 0.18);
                --xhs-block-menu-hover: #f5f5f5;
                --xhs-block-shadow: rgba(0, 0, 0, 0.18);
                --xhs-block-mask: rgba(0, 0, 0, 0.38);
                --xhs-block-primary: #ff2442;
                --xhs-block-primary-soft: #fff1f3;
            }

            @media (prefers-color-scheme: dark) {
                :root {
                    --xhs-block-bg: #1f1f1f;
                    --xhs-block-bg-subtle: #292929;
                    --xhs-block-text: rgba(255, 255, 255, 0.88);
                    --xhs-block-muted: rgba(255, 255, 255, 0.66);
                    --xhs-block-faint: rgba(255, 255, 255, 0.45);
                    --xhs-block-border: rgba(255, 255, 255, 0.12);
                    --xhs-block-control-bg: #333;
                    --xhs-block-placeholder-bg: #3a1e24;
                    --xhs-block-placeholder-border: rgba(255, 88, 112, 0.26);
                    --xhs-block-menu-hover: rgba(255, 255, 255, 0.08);
                    --xhs-block-shadow: rgba(0, 0, 0, 0.45);
                    --xhs-block-mask: rgba(0, 0, 0, 0.62);
                    --xhs-block-primary-soft: rgba(255, 36, 66, 0.15);
                }
            }

            .xhs-force-hidden {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }

            section.note-item.xhs-blocked-hidden {
                opacity: 0.01 !important;
                pointer-events: none !important;
            }

            section.note-item.xhs-blocked-with-placeholder .cover,
            section.note-item.xhs-blocked-with-placeholder .avatar-container {
                background: var(--xhs-block-placeholder-bg) !important;
            }

            section.note-item.xhs-blocked-with-placeholder .cover {
                border: 1px solid var(--xhs-block-placeholder-border);
                box-sizing: border-box;
            }

            section.note-item.xhs-blocked-with-placeholder .cover img,
            section.note-item.xhs-blocked-with-placeholder .author-avatar {
                opacity: 0 !important;
            }

            section.note-item.xhs-blocked-with-placeholder .play-icon,
            section.note-item.xhs-blocked-with-placeholder .like-icon,
            section.note-item.xhs-blocked-with-placeholder .like-lottie {
                visibility: hidden !important;
            }

            .xhs-quick-block-btn {
                margin-left: 6px;
                padding: 1px 6px;
                border: 1px solid var(--xhs-block-placeholder-border);
                border-radius: 4px;
                background: var(--xhs-block-bg);
                color: var(--xhs-block-primary);
                cursor: pointer;
                font-size: 12px;
                line-height: 18px;
                white-space: nowrap;
            }

            .xhs-quick-block-btn:hover {
                background: var(--xhs-block-primary-soft);
            }

            .xhs-block-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999999;
                max-width: 320px;
                padding: 12px 18px;
                border-radius: 8px;
                background: #ff2442;
                color: #fff;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
                font-size: 14px;
                animation: xhsBlockSlideIn 0.24s ease-out;
            }

            .xhs-block-notification.info {
                background: #555;
            }

            .xhs-block-notification.leaving {
                animation: xhsBlockSlideOut 0.24s ease-in forwards;
            }

            @keyframes xhsBlockSlideIn {
                from { transform: translateX(360px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }

            @keyframes xhsBlockSlideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(360px); opacity: 0; }
            }

            #xhs-block-dialog-mask {
                position: fixed;
                inset: 0;
                z-index: 9999998;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--xhs-block-mask);
            }

            #xhs-block-dialog {
                width: min(680px, calc(100vw - 32px));
                max-height: min(760px, calc(100vh - 32px));
                display: flex;
                flex-direction: column;
                border-radius: 10px;
                background: var(--xhs-block-bg);
                color: var(--xhs-block-text);
                box-shadow: 0 18px 60px var(--xhs-block-shadow);
                overflow: hidden;
                font-size: 14px;
            }

            .xhs-dialog-header,
            .xhs-dialog-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 16px 20px;
                border-bottom: 1px solid var(--xhs-block-border);
            }

            .xhs-dialog-footer {
                justify-content: flex-end;
                border-top: 1px solid var(--xhs-block-border);
                border-bottom: 0;
            }

            .xhs-dialog-header h2 {
                margin: 0;
                font-size: 18px;
            }

            #xhs-dialog-close {
                width: 32px;
                height: 32px;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: var(--xhs-block-text);
                cursor: pointer;
                font-size: 24px;
                line-height: 1;
            }

            .xhs-dialog-switches {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px 16px;
                padding: 14px 20px;
                background: var(--xhs-block-bg-subtle);
                border-bottom: 1px solid var(--xhs-block-border);
            }

            .xhs-dialog-switches label {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .xhs-dialog-tabs {
                display: flex;
                border-bottom: 1px solid var(--xhs-block-border);
            }

            .xhs-dialog-tabs button {
                flex: 1;
                padding: 12px;
                border: 0;
                background: var(--xhs-block-bg);
                cursor: pointer;
                color: var(--xhs-block-muted);
            }

            .xhs-dialog-tabs button.active {
                background: var(--xhs-block-primary);
                color: #fff;
            }

            .xhs-dialog-body {
                padding: 16px 20px;
                overflow: auto;
            }

            .xhs-dialog-body p {
                margin: 0 0 10px;
                color: var(--xhs-block-muted);
                font-size: 13px;
            }

            #xhs-block-list-input {
                width: 100%;
                height: 320px;
                box-sizing: border-box;
                padding: 10px;
                border: 1px solid var(--xhs-block-border);
                border-radius: 8px;
                background: var(--xhs-block-bg);
                color: var(--xhs-block-text);
                resize: vertical;
                font-family: Consolas, Monaco, monospace;
                font-size: 13px;
                line-height: 1.5;
            }

            .xhs-dialog-count {
                margin-top: 8px;
                color: var(--xhs-block-faint);
                font-size: 12px;
            }

            .xhs-dialog-footer button {
                min-width: 78px;
                padding: 8px 16px;
                border: 0;
                border-radius: 6px;
                cursor: pointer;
                background: var(--xhs-block-control-bg);
                color: var(--xhs-block-text);
            }

            #xhs-save-list {
                background: var(--xhs-block-primary);
                color: #fff;
            }
        `;
        document.head.appendChild(style);
    }

    function initObserver() {
        const observerTarget = document.body;
        if (!observerTarget) {
            return;
        }

        const observer = new MutationObserver(scheduleScan);
        observer.observe(observerTarget, {
            childList: true,
            subtree: true
        });
    }

    function init() {
        ensureBaseStyles();
        GM_registerMenuCommand('管理屏蔽列表', openManageDialog);
        GM_registerMenuCommand('立即重新扫描', scanAndBlockNotes);

        document.addEventListener('keydown', handleShortcut);
        initObserver();
        scanAndBlockNotes();

        console.log('[小红书综合屏蔽] 已启动。按 F8 可将选中文本加入关键词屏蔽。');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
