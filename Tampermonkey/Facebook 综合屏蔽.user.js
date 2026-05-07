// ==UserScript==
// @name         Facebook 综合屏蔽
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.1
// @description  屏蔽 Facebook 信息流赞助内容、右侧栏广告盒，可选屏蔽“可能认识”的推荐模块
// @license      MIT
// @icon         https://www.facebook.com/favicon.ico
// @author       SI Xiaolong
// @match        https://facebook.com/*
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_NAME = 'Facebook 综合屏蔽';
    const STORAGE_PREFIX = 'sixiaolong1117_facebook_blocker_';
    const BLOCKED_CLASS = 'sixiaolong1117-facebook-blocked';
    const SPONSORED_CHECKED_ATTR = 'data-sixiaolong1117-facebook-blocker-sponsored-checked';
    const SUGGESTION_CHECKED_ATTR = 'data-sixiaolong1117-facebook-blocker-suggestion-checked';
    const BLOCK_REASON_ATTR = 'data-sixiaolong1117-facebook-blocker-reason';

    const SETTINGS = {
        hideSponsoredFeed: {
            key: STORAGE_PREFIX + 'hide_sponsored_feed',
            label: '屏蔽信息流赞助内容',
            defaultValue: true
        },
        hideRightRailAds: {
            key: STORAGE_PREFIX + 'hide_right_rail_ads',
            label: '屏蔽右侧栏赞助广告盒',
            defaultValue: true
        },
        hidePeopleYouMayKnow: {
            key: STORAGE_PREFIX + 'hide_people_you_may_know',
            label: '屏蔽“可能认识”的推荐模块',
            defaultValue: true
        }
    };

    const SPONSORED_TEXTS = [
        '赞助内容',
        '贊助內容',
        '赞助',
        '贊助',
        'Sponsored',
        'Advertisement',
        'Publicidad',
        'Publicité',
        'Werbung',
        '広告'
    ];

    const PEOPLE_YOU_MAY_KNOW_TEXTS = [
        '可能认识',
        '你可能认识的用户',
        'People you may know'
    ];

    let scanTimer = null;
    let settingsCache = readSettings();

    function getValue(key, defaultValue) {
        if (typeof GM_getValue === 'function') {
            return GM_getValue(key, defaultValue);
        }
        const raw = localStorage.getItem(key);
        if (raw === null) {
            return defaultValue;
        }
        try {
            return JSON.parse(raw);
        } catch (error) {
            return raw;
        }
    }

    function setValue(key, value) {
        if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
            return;
        }
        localStorage.setItem(key, JSON.stringify(value));
    }

    function readSettings() {
        return Object.fromEntries(
            Object.entries(SETTINGS).map(([name, setting]) => [
                name,
                Boolean(getValue(setting.key, setting.defaultValue))
            ])
        );
    }

    function registerMenus() {
        if (typeof GM_registerMenuCommand !== 'function') {
            return;
        }

        Object.entries(SETTINGS).forEach(([name, setting]) => {
            const enabled = settingsCache[name];
            GM_registerMenuCommand(`${enabled ? '关闭' : '开启'}：${setting.label}`, () => {
                setValue(setting.key, !enabled);
                location.reload();
            });
        });
    }

    function injectStyle() {
        const style = document.createElement('style');
        style.textContent = `
            .${BLOCKED_CLASS} {
                display: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function normalizeText(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    function textMatches(text, keywords) {
        const normalizedText = normalizeText(text);
        if (!normalizedText) {
            return false;
        }

        return keywords.some(keyword => {
            if (/^[\x00-\x7F]+$/.test(keyword)) {
                return normalizedText.toLowerCase().includes(keyword.toLowerCase());
            }
            return normalizedText.includes(keyword);
        });
    }

    function isSponsoredMarker(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        const ariaLabel = element.getAttribute('aria-label');
        const title = element.getAttribute('title');
        const href = element.getAttribute('href');
        const text = normalizeText(element.textContent);

        return (
            textMatches(ariaLabel, SPONSORED_TEXTS) ||
            textMatches(title, SPONSORED_TEXTS) ||
            textMatches(text, SPONSORED_TEXTS) ||
            Boolean(href && /\/ads\/about\//i.test(href))
        );
    }

    function isPeopleYouMayKnowMarker(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        const ariaLabel = element.getAttribute('aria-label');
        const text = normalizeText(element.textContent);
        return textMatches(ariaLabel, PEOPLE_YOU_MAY_KNOW_TEXTS) || textMatches(text, PEOPLE_YOU_MAY_KNOW_TEXTS);
    }

    function isInsideNavigation(element) {
        return Boolean(element.closest('[role="navigation"], header, [data-pagelet="LeftRail"]'));
    }

    function findFeedUnit(element) {
        return (
            element.closest('[data-pagelet^="FeedUnit"]') ||
            element.closest('[role="article"]')
        );
    }

    function findRightRailAdBox(element) {
        const rightRail = element.closest('[data-pagelet="RightRail"], [role="complementary"]');
        if (!rightRail) {
            return null;
        }

        let candidate = element;
        while (
            candidate.parentElement &&
            candidate.parentElement !== rightRail &&
            !candidate.parentElement.matches('[data-pagelet="RightRail"]')
        ) {
            candidate = candidate.parentElement;
        }

        return candidate === document.documentElement || candidate === document.body ? null : candidate;
    }

    function findPeopleSuggestionContainer(element) {
        const feedUnit = findFeedUnit(element);
        if (feedUnit) {
            return feedUnit;
        }

        const region = element.closest('[aria-label*="可能认识"], [aria-label*="People you may know"]');
        return region ? region.closest('[data-pagelet^="FeedUnit"], [role="article"], [role="region"]') : null;
    }

    function hideElement(element, reason) {
        if (!element || element.classList.contains(BLOCKED_CLASS)) {
            return;
        }

        element.classList.add(BLOCKED_CLASS);
        element.setAttribute(BLOCK_REASON_ATTR, reason);
        console.debug(`[${SCRIPT_NAME}] 已隐藏：${reason}`, element);
    }

    function scanSponsoredMarkers() {
        if (!settingsCache.hideSponsoredFeed && !settingsCache.hideRightRailAds) {
            return;
        }

        const candidates = document.querySelectorAll([
            'a[href*="/ads/about/"]',
            '[aria-label*="赞助"]',
            '[aria-label*="贊助"]',
            '[aria-label*="Sponsored"]',
            '[title*="赞助"]',
            '[title*="贊助"]',
            '[title*="Sponsored"]',
            'h3',
            'span'
        ].join(','));

        candidates.forEach(element => {
            if (element.getAttribute(SPONSORED_CHECKED_ATTR) === '1' || isInsideNavigation(element)) {
                return;
            }
            element.setAttribute(SPONSORED_CHECKED_ATTR, '1');

            if (!isSponsoredMarker(element)) {
                return;
            }

            if (settingsCache.hideRightRailAds) {
                const rightRailAdBox = findRightRailAdBox(element);
                if (rightRailAdBox) {
                    hideElement(rightRailAdBox, '右侧栏赞助广告盒');
                    return;
                }
            }

            if (settingsCache.hideSponsoredFeed) {
                const feedUnit = findFeedUnit(element);
                if (feedUnit) {
                    hideElement(feedUnit, '信息流赞助内容');
                }
            }
        });
    }

    function scanPeopleSuggestions() {
        if (!settingsCache.hidePeopleYouMayKnow) {
            return;
        }

        const candidates = document.querySelectorAll([
            '[aria-label*="可能认识"]',
            '[aria-label*="People you may know"]',
            'h3',
            'span'
        ].join(','));

        candidates.forEach(element => {
            if (element.getAttribute(SUGGESTION_CHECKED_ATTR) === '1') {
                return;
            }
            element.setAttribute(SUGGESTION_CHECKED_ATTR, '1');

            if (!isPeopleYouMayKnowMarker(element)) {
                return;
            }

            hideElement(findPeopleSuggestionContainer(element), '可能认识推荐模块');
        });
    }

    function scan() {
        settingsCache = readSettings();
        scanSponsoredMarkers();
        scanPeopleSuggestions();
    }

    function scheduleScan() {
        if (scanTimer) {
            return;
        }

        scanTimer = window.setTimeout(() => {
            scanTimer = null;
            scan();
        }, 150);
    }

    function startObserver() {
        if (!document.body) {
            window.setTimeout(startObserver, 100);
            return;
        }

        const observer = new MutationObserver(scheduleScan);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        scan();
        window.setInterval(scan, 2000);
        console.info(`[${SCRIPT_NAME}] 已启动`);
    }

    injectStyle();
    registerMenus();
    startObserver();
})();
