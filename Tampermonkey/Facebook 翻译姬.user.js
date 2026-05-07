// ==UserScript==
// @name         Facebook 翻译姬
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.1
// @description  将 Facebook 帖子和评论翻译为简体中文，并在下方显示
// @license      MIT
// @icon         https://www.facebook.com/favicon.ico
// @author       SI Xiaolong
// @match        https://facebook.com/*
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// ==/UserScript==

(function () {
    'use strict';

    const translatedElements = new WeakSet();
    const processingElements = new WeakSet();
    const translationTargets = new WeakSet();
    const STORAGE_PREFIX = 'facebook_translator_';
    const TRANSLATOR_BOX_CLASS = 'facebook-translator-box';
    const TRANSLATOR_TARGET_STATUS_ATTR = 'data-facebook-translator-status';
    const EXPAND_BUTTON_TEXTS = new Set([
        '展开',
        '顯示更多',
        '显示更多',
        '查看更多',
        'See more',
        'Read more'
    ]);

    const DEFAULT_SETTINGS = {
        translationSource: 'google',
        sourceLang: 'auto',
        targetLang: 'zh-CN',
        translateComments: true
    };

    const TRANSLATION_SOURCES = {
        google: 'Google 翻译',
        mymemory: 'MyMemory 翻译'
    };

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

    const UI_TEXT_PATTERNS = [
        /^(赞|评论|分享|回复|查看|更多|关注|好友|发送|收藏|隐藏|举报|复制|删除|编辑)$/,
        /^(Like|Comment|Share|Reply|See more|More|Follow|Send|Save|Hide|Report|Copy|Delete|Edit)$/i,
        /^\d+$/,
        /^[\d,.\s]+[KMB万亿]*$/,
        /^\d+\s*(分钟|小时|天|周|个月|年|m|h|d|w|mo|y)$/i
    ];

    function getSettings() {
        return {
            translationSource: GM_getValue(STORAGE_PREFIX + 'translationSource', DEFAULT_SETTINGS.translationSource),
            sourceLang: GM_getValue(STORAGE_PREFIX + 'sourceLang', DEFAULT_SETTINGS.sourceLang),
            targetLang: GM_getValue(STORAGE_PREFIX + 'targetLang', DEFAULT_SETTINGS.targetLang),
            translateComments: GM_getValue(STORAGE_PREFIX + 'translateComments', DEFAULT_SETTINGS.translateComments)
        };
    }

    function saveSetting(key, value) {
        GM_setValue(STORAGE_PREFIX + key, value);
        location.reload();
    }

    function detectTheme() {
        const bgColor = window.getComputedStyle(document.body).backgroundColor;
        const rgb = bgColor.match(/\d+/g);
        if (rgb) {
            const brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
            return brightness > 128 ? 'light' : 'dark';
        }
        return 'light';
    }

    function getThemeColors() {
        if (detectTheme() === 'light') {
            return {
                background: 'rgba(240, 242, 245, 0.9)',
                loadingText: '#65676b',
                translatedText: '#050505',
                errorText: '#d93025',
                headerText: '#65676b',
                border: 'rgba(206, 208, 212, 0.75)'
            };
        }

        return {
            background: 'rgba(58, 59, 60, 0.9)',
            loadingText: '#b0b3b8',
            translatedText: '#e4e6eb',
            errorText: '#ff7b72',
            headerText: '#b0b3b8',
            border: 'rgba(74, 76, 79, 0.75)'
        };
    }

    function registerMenuCommands() {
        const settings = getSettings();

        GM_registerMenuCommand(`🌐 翻译源: ${TRANSLATION_SOURCES[settings.translationSource]}`, () => {
            const sources = Object.keys(TRANSLATION_SOURCES);
            const currentIndex = sources.indexOf(settings.translationSource);
            saveSetting('translationSource', sources[(currentIndex + 1) % sources.length]);
        });

        GM_registerMenuCommand(`📤 源语言: ${LANGUAGES[settings.sourceLang]}`, () => {
            showLanguageSelector('sourceLang', '选择源语言');
        });

        GM_registerMenuCommand(`📥 目标语言: ${LANGUAGES[settings.targetLang]}`, () => {
            showLanguageSelector('targetLang', '选择目标语言');
        });

        GM_registerMenuCommand(`💬 翻译评论: ${settings.translateComments ? '开启' : '关闭'}`, () => {
            saveSetting('translateComments', !settings.translateComments);
        });

        GM_registerMenuCommand('🔄 重置为默认设置', () => {
            if (confirm('确定要重置所有设置为默认值吗？')) {
                Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
                    GM_setValue(STORAGE_PREFIX + key, value);
                });
                location.reload();
            }
        });
    }

    function showLanguageSelector(settingKey, title) {
        const languageList = Object.keys(LANGUAGES).map((code, index) =>
            `${index + 1}. ${LANGUAGES[code]} (${code})`
        ).join('\n');

        const input = prompt(`${title}\n\n${languageList}\n\n请输入语言代码（如 zh-CN, en, ja 等）：`);
        if (input && LANGUAGES[input]) {
            saveSetting(settingKey, input);
        } else if (input) {
            alert('无效的语言代码！');
        }
    }

    async function translateWithGoogle(text, sourceLang, targetLang) {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload: response => {
                    try {
                        const result = JSON.parse(response.responseText);
                        resolve(result[0].map(item => item[0]).join(''));
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }

    async function translateWithMyMemory(text, sourceLang, targetLang) {
        const langPair = `${sourceLang === 'auto' ? 'en' : sourceLang}|${targetLang}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload: response => {
                    try {
                        const result = JSON.parse(response.responseText);
                        if (result.responseStatus === 200) {
                            resolve(result.responseData.translatedText);
                        } else {
                            reject(new Error('Translation failed'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }

    async function translateText(text) {
        const { translationSource, sourceLang, targetLang } = getSettings();
        if (translationSource === 'mymemory') {
            return await translateWithMyMemory(text, sourceLang, targetLang);
        }
        return await translateWithGoogle(text, sourceLang, targetLang);
    }

    function protectSpecialElements(text) {
        const protectedElements = [];
        let protectedText = text;

        protectedText = protectedText.replace(/https?:\/\/[^\s]+/g, match => {
            const placeholder = `__URL_${protectedElements.length}__`;
            protectedElements.push(match);
            return placeholder;
        });

        protectedText = protectedText.replace(/@[\w.\-\u4e00-\u9fa5]+/g, match => {
            const placeholder = `__MENTION_${protectedElements.length}__`;
            protectedElements.push(match);
            return placeholder;
        });

        protectedText = protectedText.replace(/#[\w.\-\u4e00-\u9fa5]+/g, match => {
            const placeholder = `__HASHTAG_${protectedElements.length}__`;
            protectedElements.push(match);
            return placeholder;
        });

        return { protectedText, protectedElements };
    }

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

    function extractPlainText(element) {
        const textParts = [];

        function traverse(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                if (['button', 'svg', 'path', 'img', 'video'].includes(tagName)) return;
                if (node.getAttribute('contenteditable') === 'true') return;
                if (node.classList.contains(TRANSLATOR_BOX_CLASS)) return;
                if (isExpandButton(node)) return;
            }

            for (const child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent.trim();
                    if (text) textParts.push(text);
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    traverse(child);
                }
            }
        }

        traverse(element);
        return textParts.join(' ').replace(/\s+/g, ' ').trim();
    }

    function isLikelyUiText(text) {
        return UI_TEXT_PATTERNS.some(pattern => pattern.test(text));
    }

    function isBadCandidate(element, text) {
        if (!text || text.length < 2) return true;
        if (isLikelyUiText(text)) return true;
        if (element.closest(`.${TRANSLATOR_BOX_CLASS}`)) return true;
        if (element.closest('[role="button"], button, nav, form, [contenteditable="true"]')) return true;
        return false;
    }

    function createPlaceholderBox() {
        const settings = getSettings();
        const sourceName = TRANSLATION_SOURCES[settings.translationSource];
        const colors = getThemeColors();

        const box = document.createElement('div');
        box.className = TRANSLATOR_BOX_CLASS;
        box.style.cssText = `
            margin-top: 8px;
            padding: 10px 12px;
            background-color: ${colors.background};
            border: 1px solid ${colors.border};
            border-radius: 8px;
            font-size: 14px;
            line-height: 1.45;
            transition: background-color 0.2s ease, border-color 0.2s ease;
        `;

        const header = document.createElement('div');
        header.className = 'facebook-translator-header';
        header.style.cssText = `
            font-size: 12px;
            color: ${colors.headerText};
            margin-bottom: 6px;
            font-weight: 600;
            transition: color 0.2s ease;
        `;
        header.textContent = `📝 ${sourceName}`;

        const content = document.createElement('div');
        content.className = 'facebook-translator-content';
        content.style.cssText = `
            color: ${colors.loadingText};
            white-space: pre-wrap;
            word-wrap: break-word;
            transition: color 0.2s ease;
        `;
        content.textContent = '翻译中...';

        box.append(header, content);
        return box;
    }

    function updateTranslationBox(box, translatedText) {
        const content = box.querySelector('.facebook-translator-content');
        content.style.color = getThemeColors().translatedText;
        content.textContent = translatedText;
    }

    function updateTranslationBoxError(box, errorMessage) {
        const content = box.querySelector('.facebook-translator-content');
        content.style.color = getThemeColors().errorText;
        content.textContent = `❌ 翻译失败: ${errorMessage}`;
    }

    function updateAllBoxesTheme() {
        const colors = getThemeColors();
        document.querySelectorAll('.facebook-translator-box').forEach(box => {
            box.style.backgroundColor = colors.background;
            box.style.borderColor = colors.border;

            const header = box.querySelector('.facebook-translator-header');
            if (header) header.style.color = colors.headerText;

            const content = box.querySelector('.facebook-translator-content');
            if (!content) return;

            if (content.textContent === '翻译中...') {
                content.style.color = colors.loadingText;
            } else if (content.textContent.startsWith('❌')) {
                content.style.color = colors.errorText;
            } else {
                content.style.color = colors.translatedText;
            }
        });
    }

    function findInsertTarget(element) {
        return element.closest('[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-ad-rendering-role="story_message"], [data-ad-rendering-role="comment_message"]') || element;
    }

    function normalizeButtonText(text) {
        return text.replace(/\s+/g, ' ').replace(/^[.\u2026\s]+/, '').trim();
    }

    function isExpandButton(element) {
        if (!(element instanceof HTMLElement)) return false;
        const tagName = element.tagName.toLowerCase();
        if (tagName !== 'button' && element.getAttribute('role') !== 'button') return false;

        return EXPAND_BUTTON_TEXTS.has(normalizeButtonText(element.textContent || ''));
    }

    function findExpandButtons(element) {
        return Array.from(element.querySelectorAll('button, [role="button"]')).filter(button =>
            isExpandButton(button) &&
            !button.closest(`.${TRANSLATOR_BOX_CLASS}`) &&
            !button.closest('[contenteditable="true"]')
        );
    }

    function waitForExpandedText(element, oldText) {
        return new Promise(resolve => {
            let done = false;

            const finish = () => {
                if (done) return;
                done = true;
                observer.disconnect();
                resolve();
            };

            const observer = new MutationObserver(() => {
                const newText = extractPlainText(element);
                if (newText && newText !== oldText && !findExpandButtons(element).length) {
                    finish();
                }
            });

            observer.observe(element, {
                childList: true,
                subtree: true,
                characterData: true
            });

            setTimeout(finish, 1500);
        });
    }

    async function expandTextIfNeeded(insertTarget) {
        const expandButtons = findExpandButtons(insertTarget);
        if (!expandButtons.length) return;

        const oldText = extractPlainText(insertTarget);
        expandButtons.forEach(button => button.click());
        await waitForExpandedText(insertTarget, oldText);
    }

    function hasTranslationBoxForTarget(insertTarget, originalText) {
        if (insertTarget.getAttribute(TRANSLATOR_TARGET_STATUS_ATTR)) return true;

        const nextElement = insertTarget.nextElementSibling;
        if (nextElement?.classList.contains(TRANSLATOR_BOX_CLASS)) return true;

        if (!insertTarget.parentElement) return false;

        return Array.from(insertTarget.parentElement.children).some(child =>
            child.classList.contains(TRANSLATOR_BOX_CLASS) &&
            child.dataset.originalText === originalText
        );
    }

    function findTranslationBoxForTarget(insertTarget) {
        const nextElement = insertTarget.nextElementSibling;
        if (nextElement?.classList.contains(TRANSLATOR_BOX_CLASS)) return nextElement;

        return Array.from(insertTarget.parentElement?.children || []).find(child =>
            child.classList.contains(TRANSLATOR_BOX_CLASS)
        ) || null;
    }

    function removeStaleTranslationBox(element, insertTarget, originalText) {
        const existingBox = findTranslationBoxForTarget(insertTarget);
        if (!existingBox || existingBox.dataset.originalText === originalText) return false;

        existingBox.remove();
        translatedElements.delete(element);
        translationTargets.delete(insertTarget);
        insertTarget.removeAttribute(TRANSLATOR_TARGET_STATUS_ATTR);
        return true;
    }

    function hasTranslatedOverlappingTarget(element, insertTarget) {
        const translatedAncestor = element.parentElement?.closest(`[${TRANSLATOR_TARGET_STATUS_ATTR}]`);
        if (translatedAncestor && translatedAncestor !== insertTarget) return true;

        return Array.from(element.querySelectorAll(`[${TRANSLATOR_TARGET_STATUS_ATTR}]`)).some(translatedDescendant =>
            translatedDescendant !== insertTarget
        );
    }

    async function processTranslation(element) {
        if (processingElements.has(element)) return;

        if (translatedElements.has(element)) {
            const insertTarget = findInsertTarget(element);
            const currentText = extractPlainText(element);
            if (!removeStaleTranslationBox(element, insertTarget, currentText)) return;
        }

        processingElements.add(element);
        let insertTarget = null;
        let placeholderBox = null;
        try {
            insertTarget = findInsertTarget(element);
            await expandTextIfNeeded(insertTarget);

            const originalText = extractPlainText(element);
            if (isBadCandidate(element, originalText)) return;

            removeStaleTranslationBox(element, insertTarget, originalText);

            if (hasTranslatedOverlappingTarget(element, insertTarget)) {
                translatedElements.add(element);
                return;
            }

            if (translationTargets.has(insertTarget) || hasTranslationBoxForTarget(insertTarget, originalText)) {
                translatedElements.add(element);
                return;
            }

            translatedElements.add(element);
            translationTargets.add(insertTarget);
            insertTarget.setAttribute(TRANSLATOR_TARGET_STATUS_ATTR, 'processing');

            placeholderBox = createPlaceholderBox();
            placeholderBox.dataset.originalText = originalText;
            if (insertTarget.parentElement) {
                insertTarget.parentElement.insertBefore(placeholderBox, insertTarget.nextSibling);
            }

            const { protectedText, protectedElements } = protectSpecialElements(originalText);
            const rawTranslatedText = await translateText(protectedText);
            const translatedText = restoreSpecialElements(rawTranslatedText, protectedElements);

            if (translatedText === originalText) {
                placeholderBox.remove();
                insertTarget.removeAttribute(TRANSLATOR_TARGET_STATUS_ATTR);
                return;
            }

            updateTranslationBox(placeholderBox, translatedText);
            insertTarget.setAttribute(TRANSLATOR_TARGET_STATUS_ATTR, 'done');
        } catch (e) {
            console.error('Facebook 翻译失败:', e);
            if (placeholderBox) updateTranslationBoxError(placeholderBox, e.message || '未知错误');
            if (insertTarget) insertTarget.setAttribute(TRANSLATOR_TARGET_STATUS_ATTR, 'error');
        } finally {
            processingElements.delete(element);
        }
    }

    function findPostTextElements() {
        const elements = new Set();

        document.querySelectorAll([
            '[data-ad-preview="message"]',
            '[data-ad-comet-preview="message"]',
            '[data-ad-rendering-role="story_message"]'
        ].join(', ')).forEach(element => elements.add(element));

        document.querySelectorAll('[role="article"] div[dir="auto"]').forEach(element => {
            const coveredMessage = element.closest('[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-ad-rendering-role="story_message"]');
            if (coveredMessage && coveredMessage !== element) return;

            const text = extractPlainText(element);
            if (text.length >= 20 && !isBadCandidate(element, text)) {
                elements.add(element);
            }
        });

        return elements;
    }

    function findCommentTextElements() {
        if (!getSettings().translateComments) return [];

        const elements = new Set();
        document.querySelectorAll('[data-ad-rendering-role="comment_message"]').forEach(element => elements.add(element));

        document.querySelectorAll('[aria-label*="评论"] div[dir="auto"], [aria-label*="comment"] div[dir="auto"]').forEach(element => {
            const coveredComment = element.closest('[data-ad-rendering-role="comment_message"]');
            if (coveredComment && coveredComment !== element) return;

            const text = extractPlainText(element);
            if (text.length >= 6 && !isBadCandidate(element, text)) {
                elements.add(element);
            }
        });

        return elements;
    }

    function findAndTranslateAll() {
        findPostTextElements().forEach(processTranslation);
        findCommentTextElements().forEach(processTranslation);
    }

    const observer = new MutationObserver(() => {
        findAndTranslateAll();
    });

    const themeObserver = new MutationObserver(() => {
        updateAllBoxesTheme();
    });

    registerMenuCommands();

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style']
    });

    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme']
    });

    setTimeout(findAndTranslateAll, 1000);
    setInterval(findAndTranslateAll, 3000);

    console.log('Facebook 翻译姬已加载，当前设置:', getSettings());
})();
