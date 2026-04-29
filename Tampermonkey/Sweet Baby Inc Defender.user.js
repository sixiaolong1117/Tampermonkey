// ==UserScript==
// @name         Sweet Baby Inc Defender
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.3
// @description  隐藏被 Sweet Baby Inc detected 标记为"不推荐"的 Steam 游戏。
// @license      MIT
// @icon         https://store.steampowered.com/favicon.ico
// @author       SI Xiaolong
// @match        https://store.steampowered.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const CURATOR_ID = '44858017';
    const CACHE_TTL = 24 * 60 * 60 * 1000;
    const PAGE_SIZE = 100;
    const MAX_PAGES = 20;
    const CACHE_KEY = `sbiDefender:notRecommended:${CURATOR_ID}`;
    const CACHE_TIME_KEY = `${CACHE_KEY}:time`;
    const HIDDEN_ATTR = 'data-sbi-defender-hidden';
    const LOG_PREFIX = '[Sweet Baby Inc Defender]';

    const GAME_CONTAINER_SELECTOR = [
        '.tab_item',
        '.store_capsule',
        '.search_result_row',
        '.game_area_dlc_row',
        '.recommendation',
        '.app_impression_tracked',
        '.cluster_capsule',
        '.salepreviewwidgets_StoreSaleWidgetContainer',
        '[data-ds-appid]'
    ].join(',');

    let notRecommendedGames = new Set();
    let isLoading = false;
    let hideTimer = null;

    function log(...args) {
        console.log(LOG_PREFIX, ...args);
    }

    function warn(...args) {
        console.warn(LOG_PREFIX, ...args);
    }

    function parseCachedGames() {
        const raw = GM_getValue(CACHE_KEY);
        const cacheTime = Number(GM_getValue(CACHE_TIME_KEY, 0));

        if (!raw || !cacheTime || Date.now() - cacheTime > CACHE_TTL) {
            return null;
        }

        try {
            const games = JSON.parse(raw);
            return Array.isArray(games) ? new Set(games.map(String)) : null;
        } catch (error) {
            warn('缓存解析失败，将重新获取列表:', error);
            return null;
        }
    }

    function saveCache(games) {
        GM_setValue(CACHE_KEY, JSON.stringify([...games]));
        GM_setValue(CACHE_TIME_KEY, Date.now());
    }

    async function fetchRecommendationPage(start) {
        const url = new URL(`https://store.steampowered.com/curator/${CURATOR_ID}-/ajaxgetfilteredrecommendations/render/`);
        url.search = new URLSearchParams({
            query: '',
            start: String(start),
            count: String(PAGE_SIZE),
            tagids: '',
            sort: 'recent',
            types: '0'
        }).toString();

        const response = await fetch(url.toString(), {
            credentials: 'include',
            headers: {
                accept: 'application/json, text/javascript, */*; q=0.01'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
    }

    function getAppIdFromUrl(url) {
        const match = String(url || '').match(/\/app\/(\d+)(?:\/|$)/);
        return match ? match[1] : null;
    }

    function extractAppIdsFromHtml(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const ids = new Set();

        doc.querySelectorAll('.recommendation').forEach(rec => {
            const text = rec.textContent || '';
            const isNotRecommended =
                rec.querySelector('.not_recommended, .recommendation_not_recommended, .thumb_down, .icon_thumbs_down') ||
                /\bnot recommended\b/i.test(text) ||
                text.includes('不推荐');

            if (!isNotRecommended) return;

            const link = rec.querySelector('a[href*="/app/"]');
            const appId = getAppIdFromUrl(link && link.href);
            if (appId) ids.add(appId);
        });

        return ids;
    }

    function mergeSets(target, source) {
        source.forEach(value => target.add(value));
    }

    async function fetchCuratorNotRecommendedGames(forceRefresh = false) {
        if (isLoading) return;
        isLoading = true;

        try {
            if (!forceRefresh) {
                const cached = parseCachedGames();
                if (cached) {
                    notRecommendedGames = cached;
                    log(`从缓存加载 ${notRecommendedGames.size} 个不推荐游戏`);
                    scheduleHideGames();
                    return;
                }
            }

            const games = new Set();

            for (let page = 0; page < MAX_PAGES; page += 1) {
                const start = page * PAGE_SIZE;
                const data = await fetchRecommendationPage(start);

                if (data.success !== 1 || !data.results_html) {
                    break;
                }

                mergeSets(games, extractAppIdsFromHtml(data.results_html));

                const htmlIsShort = data.results_html.length < 1000;
                const hasFewerItems = (data.results_html.match(/class="[^"]*\brecommendation\b/g) || []).length < PAGE_SIZE;
                if (htmlIsShort || hasFewerItems) {
                    break;
                }
            }

            notRecommendedGames = games;
            saveCache(notRecommendedGames);
            log(`已更新列表，共 ${notRecommendedGames.size} 个不推荐游戏`);
            scheduleHideGames();
        } catch (error) {
            warn('获取列表失败:', error);
        } finally {
            isLoading = false;
        }
    }

    function getAppIdsFromElement(element) {
        const ids = new Set();
        const dsAppId = element.getAttribute('data-ds-appid');

        if (dsAppId) {
            dsAppId.split(',').map(id => id.trim()).filter(Boolean).forEach(id => ids.add(id));
        }

        if (element.href) {
            const id = getAppIdFromUrl(element.href);
            if (id) ids.add(id);
        }

        element.querySelectorAll('a[href*="/app/"], [data-ds-appid]').forEach(child => {
            const idFromHref = getAppIdFromUrl(child.href);
            const idFromAttr = child.getAttribute('data-ds-appid');

            if (idFromHref) ids.add(idFromHref);
            if (idFromAttr) {
                idFromAttr.split(',').map(id => id.trim()).filter(Boolean).forEach(id => ids.add(id));
            }
        });

        return ids;
    }

    function findContainer(element) {
        return element.closest(GAME_CONTAINER_SELECTOR) || element;
    }

    function hideElement(element, appId) {
        if (element.getAttribute(HIDDEN_ATTR) === '1') return;

        element.style.setProperty('display', 'none', 'important');
        element.setAttribute(HIDDEN_ATTR, '1');
        element.setAttribute('title', `已由 Sweet Baby Inc Defender 隐藏 App ${appId}`);
    }

    function hideGames(root = document) {
        if (notRecommendedGames.size === 0 || !document.body) return;

        const candidates = root.querySelectorAll
            ? root.querySelectorAll(`${GAME_CONTAINER_SELECTOR}, a[href*="/app/"]`)
            : [];

        candidates.forEach(item => {
            if (item.getAttribute(HIDDEN_ATTR) === '1') return;

            const ids = getAppIdsFromElement(item);
            const matchedId = [...ids].find(id => notRecommendedGames.has(id));
            if (!matchedId) return;

            hideElement(findContainer(item), matchedId);
        });
    }

    function scheduleHideGames(root = document) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => hideGames(root), 100);
    }

    function observePageChanges() {
        if (!document.body) return;

        const observer = new MutationObserver(mutations => {
            if (notRecommendedGames.size === 0) return;

            const addedNodes = mutations
                .flatMap(mutation => [...mutation.addedNodes])
                .filter(node => node.nodeType === Node.ELEMENT_NODE);

            if (addedNodes.length === 0) return;
            scheduleHideGames();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function registerMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;

        GM_registerMenuCommand('刷新 Sweet Baby Inc detected 列表', () => {
            fetchCuratorNotRecommendedGames(true);
        });
    }

    function init() {
        registerMenu();
        observePageChanges();
        fetchCuratorNotRecommendedGames();
        log('已启动');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
