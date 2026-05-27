// ==UserScript==
// @name         Threads 翻译姬
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.2
// @description  将Threads帖子翻译为简体中文，并在下方显示
// @license      MIT
// @icon         https://threads.com/favicon.ico
// @author       SI Xiaolong
// @match        https://www.threads.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// ==/UserScript==

(function () {
    'use strict';

    // 已翻译的元素集合，避免重复翻译
    const translatedElements = new WeakSet();
    // 已添加按钮的元素集合，避免重复添加按钮
    const buttonAddedElements = new WeakSet();

    // 默认设置
    const DEFAULT_SETTINGS = {
        translationSource: 'google',
        sourceLang: 'auto',
        targetLang: 'zh-CN',
        autoTranslate: false
    };

    // 获取当前设置
    function getSettings() {
        return {
            translationSource: GM_getValue('translationSource', DEFAULT_SETTINGS.translationSource),
            sourceLang: GM_getValue('sourceLang', DEFAULT_SETTINGS.sourceLang),
            targetLang: GM_getValue('targetLang', DEFAULT_SETTINGS.targetLang),
            autoTranslate: GM_getValue('autoTranslate', DEFAULT_SETTINGS.autoTranslate)
        };
    }

    // 保存设置
    function saveSetting(key, value) {
        GM_setValue(key, value);
        if (key !== 'autoTranslate') {
            location.reload();
        }
    }

    // 翻译源配置
    const TRANSLATION_SOURCES = {
        google: 'Google 翻译',
        mymemory: 'MyMemory 翻译'
    };

    // 语言配置
    const LANGUAGES = {
        'auto': '自动检测',
        'zh-CN': '简体中文',
        'zh-TW': '繁体中文',
        'en': '英语',
        'ja': '日语',
        'ko': '韩语',
        'es': '西班牙语',
        'fr': '法语',
        'de': '德语',
        'ru': '俄语',
        'ar': '阿拉伯语',
        'pt': '葡萄牙语',
        'it': '意大利语',
        'th': '泰语',
        'vi': '越南语'
    };

    // 检测当前主题（Threads通常是白色或深色）
    function detectTheme() {
        const bgColor = window.getComputedStyle(document.body).backgroundColor;
        const rgb = bgColor.match(/\d+/g);
        if (rgb) {
            const brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
            return brightness > 128 ? 'light' : 'dark';
        }
        return 'light';
    }

    // 获取主题相关的颜色
    function getThemeColors() {
        const theme = detectTheme();

        if (theme === 'light') {
            return {
                background: 'rgba(243, 245, 247, 0.8)',
                loadingText: '#999999',
                translatedText: '#000000',
                errorText: '#e74c3c',
                headerText: '#666666',
                border: 'rgba(219, 219, 219, 0.5)'
            };
        } else {
            return {
                background: 'rgba(38, 38, 38, 0.8)',
                loadingText: '#a8a8a8',
                translatedText: '#f5f5f5',
                errorText: '#ff6b6b',
                headerText: '#a8a8a8',
                border: 'rgba(54, 54, 54, 0.5)'
            };
        }
    }

    // 注册菜单命令
    function registerMenuCommands() {
        const settings = getSettings();

        // 自动翻译开关
        GM_registerMenuCommand(`🔄 自动翻译: ${settings.autoTranslate ? '开启' : '关闭'}`, () => {
            saveSetting('autoTranslate', !settings.autoTranslate);
        });

        // 翻译源选择
        GM_registerMenuCommand(`🌐 翻译源: ${TRANSLATION_SOURCES[settings.translationSource]}`, () => {
            const sources = Object.keys(TRANSLATION_SOURCES);
            const currentIndex = sources.indexOf(settings.translationSource);
            const nextIndex = (currentIndex + 1) % sources.length;
            const nextSource = sources[nextIndex];
            saveSetting('translationSource', nextSource);
        });

        // 源语言选择
        GM_registerMenuCommand(`📤 源语言: ${LANGUAGES[settings.sourceLang]}`, () => {
            showLanguageSelector('sourceLang', '选择源语言');
        });

        // 目标语言选择
        GM_registerMenuCommand(`📥 目标语言: ${LANGUAGES[settings.targetLang]}`, () => {
            showLanguageSelector('targetLang', '选择目标语言');
        });

        // 重置设置
        GM_registerMenuCommand('🔄 重置为默认设置', () => {
            if (confirm('确定要重置所有设置为默认值吗？')) {
                saveSetting('translationSource', DEFAULT_SETTINGS.translationSource);
                saveSetting('sourceLang', DEFAULT_SETTINGS.sourceLang);
                saveSetting('targetLang', DEFAULT_SETTINGS.targetLang);
                saveSetting('autoTranslate', DEFAULT_SETTINGS.autoTranslate);
            }
        });
    }

    // 显示语言选择对话框
    function showLanguageSelector(settingKey, title) {
        const languages = Object.keys(LANGUAGES);
        const languageList = languages.map((code, index) =>
            `${index + 1}. ${LANGUAGES[code]} (${code})`
        ).join('\n');

        const input = prompt(`${title}\n\n${languageList}\n\n请输入语言代码（如 zh-CN, en, ja 等）：`);

        if (input && LANGUAGES[input]) {
            saveSetting(settingKey, input);
        } else if (input) {
            alert('无效的语言代码！');
        }
    }

    // Google翻译API
    async function translateWithGoogle(text, sourceLang, targetLang) {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        console.log('[Threads翻译姬] 📡 Google翻译请求:', { sourceLang, targetLang, textLen: text.length });

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function (response) {
                    console.log('[Threads翻译姬] 📨 Google翻译响应状态:', response.status);
                    try {
                        const result = JSON.parse(response.responseText);
                        const translatedText = result[0].map(item => item[0]).join('');
                        console.log('[Threads翻译姬] 📨 Google翻译结果长度:', translatedText.length);
                        resolve(translatedText);
                    } catch (e) {
                        console.error('[Threads翻译姬] ❌ Google翻译解析失败:', e.message, '原始响应:', response.responseText.substring(0, 200));
                        reject(e);
                    }
                },
                onerror: function (error) {
                    console.error('[Threads翻译姬] ❌ Google翻译网络错误:', error);
                    reject(error);
                }
            });
        });
    }

    // MyMemory翻译API
    async function translateWithMyMemory(text, sourceLang, targetLang) {
        const langPair = `${sourceLang === 'auto' ? 'en' : sourceLang}|${targetLang}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
        console.log('[Threads翻译姬] 📡 MyMemory翻译请求:', { langPair, textLen: text.length });

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function (response) {
                    console.log('[Threads翻译姬] 📨 MyMemory翻译响应状态:', response.status);
                    try {
                        const result = JSON.parse(response.responseText);
                        if (result.responseStatus === 200) {
                            console.log('[Threads翻译姬] 📨 MyMemory翻译结果长度:', result.responseData.translatedText.length);
                            resolve(result.responseData.translatedText);
                        } else {
                            console.error('[Threads翻译姬] ❌ MyMemory翻译失败，状态:', result.responseStatus);
                            reject(new Error('Translation failed'));
                        }
                    } catch (e) {
                        console.error('[Threads翻译姬] ❌ MyMemory翻译解析失败:', e.message);
                        reject(e);
                    }
                },
                onerror: function (error) {
                    console.error('[Threads翻译姬] ❌ MyMemory翻译网络错误:', error);
                    reject(error);
                }
            });
        });
    }

    // 统一翻译接口
    async function translateText(text) {
        const settings = getSettings();
        const { translationSource, sourceLang, targetLang } = settings;

        switch (translationSource) {
            case 'google':
                return await translateWithGoogle(text, sourceLang, targetLang);
            case 'mymemory':
                return await translateWithMyMemory(text, sourceLang, targetLang);
            default:
                return await translateWithGoogle(text, sourceLang, targetLang);
        }
    }

    // 保护文本中的特殊元素（@mentions, #hashtags, URLs）
    function protectSpecialElements(text) {
        const protectedElements = [];
        let protectedText = text;

        // 保护 URL
        protectedText = protectedText.replace(/https?:\/\/[^\s]+/g, (match) => {
            const placeholder = `__URL_${protectedElements.length}__`;
            protectedElements.push(match);
            return placeholder;
        });

        // 保护 @mentions
        protectedText = protectedText.replace(/@[\w]+/g, (match) => {
            const placeholder = `__MENTION_${protectedElements.length}__`;
            protectedElements.push(match);
            return placeholder;
        });

        // 保护 #hashtags
        protectedText = protectedText.replace(/#[\w\u4e00-\u9fa5]+/g, (match) => {
            const placeholder = `__HASHTAG_${protectedElements.length}__`;
            protectedElements.push(match);
            return placeholder;
        });

        return { protectedText, protectedElements };
    }

    // 恢复保护的特殊元素
    function restoreSpecialElements(text, protectedElements) {
        let restoredText = text;

        protectedElements.forEach((element, index) => {
            if (element.startsWith('@')) {
                restoredText = restoredText.replace(`__MENTION_${index}__`, element);
            } else if (element.startsWith('#')) {
                restoredText = restoredText.replace(`__HASHTAG_${index}__`, element);
            } else if (element.startsWith('http')) {
                restoredText = restoredText.replace(`__URL_${index}__`, element);
            }
        });

        return restoredText;
    }

    // 提取Threads帖子的纯文本内容
    function extractPlainText(element) {
        let textParts = [];

        function traverse(node) {
            // 跳过不需要翻译的元素
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                if (tagName === 'button' || tagName === 'svg' || tagName === 'path') {
                    return;
                }
            }

            for (let child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent.trim();
                    if (text) textParts.push(text);
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    if (child.tagName === 'A') {
                        const linkText = child.textContent.trim();
                        if (linkText) textParts.push(linkText);
                    } else {
                        traverse(child);
                    }
                }
            }
        }

        traverse(element);
        return textParts.join(' ');
    }

    // 创建翻译按钮
    function createTranslateButton(element) {
        const colors = getThemeColors();
        
        const button = document.createElement('button');
        button.className = 'threads-translator-button';
        button.style.cssText = `
            margin-top: 8px;
            padding: 4px 12px;
            background-color: ${colors.background};
            border: 1px solid ${colors.border};
            border-radius: 16px;
            font-size: 13px;
            color: ${colors.headerText};
            cursor: pointer;
            transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
        `;
        button.textContent = '🌐 翻译';
        
        // 悬停效果
        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
            button.style.borderColor = '#1d9bf0';
            button.style.color = '#1d9bf0';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = colors.background;
            button.style.borderColor = colors.border;
            button.style.color = colors.headerText;
        });
        
        // 点击翻译
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('[Threads翻译姬] 🔘 用户点击翻译按钮');
            
            // 移除按钮自身
            if (button.parentNode) {
                button.parentNode.removeChild(button);
            }
            buttonAddedElements.delete(element);
            
            // 执行翻译
            processTranslation(element, true);
        });
        
        return button;
    }

    // 创建占位翻译框
    function createPlaceholderBox() {
        const settings = getSettings();
        const sourceName = TRANSLATION_SOURCES[settings.translationSource];
        const colors = getThemeColors();

        const box = document.createElement('div');
        box.className = 'threads-translator-box';
        box.style.cssText = `
            margin-top: 8px;
            padding: 10px 14px;
            background-color: ${colors.background};
            border: 1px solid ${colors.border};
            border-radius: 8px;
            font-size: 14px;
            line-height: 1.4;
            transition: background-color 0.2s ease, border-color 0.2s ease;
        `;

        // 创建标题
        const header = document.createElement('div');
        header.className = 'threads-translator-header';
        header.style.cssText = `
            font-size: 12px;
            color: ${colors.headerText};
            margin-bottom: 6px;
            font-weight: 500;
            transition: color 0.2s ease;
        `;
        header.textContent = `📝 ${sourceName}`;

        // 创建加载中的内容容器
        const content = document.createElement('div');
        content.className = 'threads-translator-content';
        content.style.cssText = `
            color: ${colors.loadingText};
            white-space: pre-wrap;
            word-wrap: break-word;
            transition: color 0.2s ease;
        `;
        content.textContent = '翻译中...';

        box.appendChild(header);
        box.appendChild(content);

        return box;
    }

    // 更新翻译框内容（成功）
    function updateTranslationBox(box, translatedText) {
        const colors = getThemeColors();
        const content = box.querySelector('.threads-translator-content');

        content.style.color = colors.translatedText;
        content.textContent = translatedText;
    }

    // 更新翻译框内容（失败）
    function updateTranslationBoxError(box, errorMessage) {
        const colors = getThemeColors();
        const content = box.querySelector('.threads-translator-content');

        content.style.color = colors.errorText;
        content.textContent = `❌ 翻译失败: ${errorMessage}`;
    }

    // 更新所有翻译框的主题
    function updateAllBoxesTheme() {
        const colors = getThemeColors();
        const boxes = document.querySelectorAll('.threads-translator-box');

        boxes.forEach(box => {
            box.style.backgroundColor = colors.background;
            box.style.borderColor = colors.border;

            const header = box.querySelector('.threads-translator-header');
            if (header) {
                header.style.color = colors.headerText;
            }

            const content = box.querySelector('.threads-translator-content');
            if (content) {
                const text = content.textContent;
                if (text === '翻译中...') {
                    content.style.color = colors.loadingText;
                } else if (text.startsWith('❌')) {
                    content.style.color = colors.errorText;
                } else {
                    content.style.color = colors.translatedText;
                }
            }
        });

        // 更新翻译按钮的主题
        const buttons = document.querySelectorAll('.threads-translator-button');
        buttons.forEach(button => {
            button.style.backgroundColor = colors.background;
            button.style.borderColor = colors.border;
            button.style.color = colors.headerText;
        });
    }

    // 处理翻译
    async function processTranslation(element, isManualClick = false) {
        // 如果已经翻译过，跳过
        if (translatedElements.has(element)) {
            console.log('[Threads翻译姬] ⏭️ 元素已翻译过，跳过');
            return;
        }

        // 获取设置
        const settings = getSettings();
        console.log('[Threads翻译姬] 📋 当前设置:', JSON.stringify(settings));

        // 提取纯文本内容
        const originalText = extractPlainText(element);
        console.log('[Threads翻译姬] 📝 提取到文本:', originalText.substring(0, 80) + (originalText.length > 80 ? '...' : ''));

        if (originalText.length === 0 || originalText.length < 2) {
            console.log('[Threads翻译姬] ⚠️ 文本为空或太短，跳过');
            return;
        }

        // 如果自动翻译关闭且不是手动点击，只添加翻译按钮
        if (!settings.autoTranslate && !isManualClick) {
            if (buttonAddedElements.has(element)) {
                console.log('[Threads翻译姬] ⏭️ 按钮已存在，跳过');
                return;
            }
            // 标记为已添加按钮
            buttonAddedElements.add(element);
            
            const button = createTranslateButton(element);
            // 找到帖子文本的父容器
            const textContainer = element.closest('.x1a6qonq, .xqcrz7y');
            const parentContainer = textContainer ? textContainer.parentElement : element.parentElement;
            if (parentContainer) {
                const insertTarget = textContainer || element;
                parentContainer.insertBefore(button, insertTarget.nextSibling);
                console.log('[Threads翻译姬] 🔘 已添加翻译按钮');
            } else {
                console.log('[Threads翻译姬] ⚠️ 无法找到父容器，未添加按钮');
            }
            return;
        }

        // 标记为已翻译
        translatedElements.add(element);

        // 创建占位框并立即插入到页面
        const placeholderBox = createPlaceholderBox();
        
        // 找到帖子文本的父容器
        const textContainer = element.closest('.x1a6qonq, .xqcrz7y');
        if (textContainer && textContainer.parentElement) {
            textContainer.parentElement.insertBefore(placeholderBox, textContainer.nextSibling);
        } else {
            // 备用方案：直接插入到元素后面
            element.parentElement.insertBefore(placeholderBox, element.nextSibling);
        }

        try {
            // 保护特殊元素
            const { protectedText, protectedElements } = protectSpecialElements(originalText);
            console.log('[Threads翻译姬] 🔄 保护后的文本:', protectedText.substring(0, 80) + (protectedText.length > 80 ? '...' : ''));

            // 翻译文本
            console.log('[Threads翻译姬] 🚀 开始请求翻译API (' + settings.translationSource + ')...');
            const rawTranslatedText = await translateText(protectedText);
            console.log('[Threads翻译姬] ✅ 翻译API返回:', rawTranslatedText.substring(0, 80) + (rawTranslatedText.length > 80 ? '...' : ''));

            // 恢复特殊元素
            const translatedText = restoreSpecialElements(rawTranslatedText, protectedElements);
            console.log('[Threads翻译姬] 🔄 恢复后文本:', translatedText.substring(0, 80) + (translatedText.length > 80 ? '...' : ''));

            // 如果翻译结果与原文相同，说明可能已经是目标语言，移除占位框
            if (translatedText === originalText) {
                console.log('[Threads翻译姬] ⚠️ 翻译结果与原文相同，可能是目标语言，移除翻译框');
                if (placeholderBox.parentNode) {
                    placeholderBox.parentNode.removeChild(placeholderBox);
                }
                return;
            }

            // 更新占位框内容为翻译结果
            updateTranslationBox(placeholderBox, translatedText);
            console.log('[Threads翻译姬] ✅ 翻译完成并显示');

        } catch (e) {
            console.error('[Threads翻译姬] ❌ 翻译失败:', e.message || e);
            // 更新占位框内容为错误信息
            updateTranslationBoxError(placeholderBox, e.message || '未知错误');
        }
    }

    // 查找并处理所有Threads帖子
    function findAndTranslateThreads() {
        console.log('[Threads翻译姬] 🔍 扫描页面内容...');
        // 查找包含帖子文本的容器
        const postTextContainers = document.querySelectorAll('.x1a6qonq span[dir="auto"]');
        
        postTextContainers.forEach(span => {
            const text = span.textContent.trim();
            if (text && text.length > 2) {
                const parentDiv = span.closest('.x1a6qonq');
                if (parentDiv) {
                    processTranslation(parentDiv);
                }
            }
        });
    }

    // 防抖函数，避免过于频繁的翻译请求
    let debounceTimer = null;
    function debouncedFindAndTranslateThreads() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            findAndTranslateThreads();
            debounceTimer = null;
        }, 500);
    }

    // 监听DOM变化，处理动态加载的内容（带防抖）
    const observer = new MutationObserver((mutations) => {
        const hasRelevantChanges = mutations.some(mutation => {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.classList && (
                        node.classList.contains('threads-translator-box') ||
                        node.classList.contains('threads-translator-button')
                    )) {
                        continue;
                    }
                    return true;
                }
            }
            return false;
        });
        
        if (hasRelevantChanges) {
            debouncedFindAndTranslateThreads();
        }
    });

    // 监听主题变化
    const themeObserver = new MutationObserver(() => {
        updateAllBoxesTheme();
    });

    // 注册菜单
    registerMenuCommands();

    // 开始观察
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 监听body的属性变化（主题切换）
    themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style']
    });

    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme']
    });

    // 初始翻译
    setTimeout(() => {
        findAndTranslateThreads();
    }, 1000);

    // 定期检查新内容（间隔增加到5秒）
    setInterval(findAndTranslateThreads, 5000);

    console.log('[Threads翻译姬] 🚀 脚本已加载，当前设置:', getSettings());
    console.log('[Threads翻译姬] 💡 提示: 打开浏览器控制台 (F12) 查看详细翻译日志');

})();