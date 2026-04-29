// ==UserScript==
// @name         SteamPY CDK 价格查询（增强版）
// @namespace    http://tampermonkey.net/
// @version      0.0.2
// @description  在 Steam 商店详情页显示 SteamPY CDK 价格，支持动态加载和后台标签页
// @author       bGZo, SI Xiaolong
// @license      MIT
// @match        https://store.steampowered.com/app/*
// @match        https://store.steampowered.com/sub/*
// @match        https://store.steampowered.com/bundle/*
// @icon         https://store.steampowered.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @connect      steampy.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 配置常量
    const CONFIG = {
        API_BASE_URL: 'https://steampy.com/xboot/common/plugIn/getGame',
        STEAMPY_DETAIL_URL: 'https://steampy.com/cdkDetail?name=cn&gameId=',
        RETRY_ATTEMPTS: 2,
        TIMEOUT: 5000,
        MAX_WAIT_TIME: 10000, // 最长等待时间
        CHECK_INTERVAL: 500, // 检查间隔
        OBSERVER_DEBOUNCE: 300, // 防抖延迟
        PRICE_CONTAINER_CLASS: 'steampy-price-container'
    };

    // 样式定义
    const STYLES = {
        container: {
            marginTop: '10px',
            padding: '8px',
            backgroundColor: '#1b2838',
            borderRadius: '4px',
            border: '1px solid #3d4f5c'
        },
        loading: {
            color: '#8f98a0',
            fontSize: '13px'
        },
        price: {
            color: '#4c6b22',
            fontSize: '16px',
            fontWeight: 'bold'
        },
        error: {
            color: '#c24641',
            fontSize: '13px'
        },
        link: {
            color: '#66c0f4',
            textDecoration: 'none',
            marginLeft: '8px'
        }
    };

    // 全局状态
    const state = {
        processedElements: new WeakSet(),
        processedKeys: new Set(), // 使用唯一标识符防止重复
        priceCache: new Map(),
        isProcessing: false, // 防止并发处理
        lastUrl: window.location.href // 记录上次URL
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const getPriceContainers = () => document.querySelectorAll(`.${CONFIG.PRICE_CONTAINER_CLASS}`);

    const resetPageState = () => {
        state.processedKeys.clear();
        state.processedElements = new WeakSet();
        getPriceContainers().forEach(el => el.remove());
    };

    /**
     * 等待元素出现
     */
    const waitForElement = (selector, timeout = CONFIG.MAX_WAIT_TIME) => {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            let timeoutId;
            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearTimeout(timeoutId);
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            timeoutId = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`等待元素超时: ${selector}`));
            }, timeout);
        });
    };

    /**
     * 检查页面是否完全加载
     */
    const waitForPageReady = async () => {
        // 等待文档就绪
        if (document.readyState !== 'complete') {
            await new Promise(resolve => {
                window.addEventListener('load', resolve, { once: true });
            });
        }

        // 额外等待一小段时间确保动态内容加载
        await sleep(500);
    };

    /**
     * 获取游戏 AppID（多种方式）
     */
    const getAppId = () => {
        try {
            // 方法1: 从 URL 获取
            const urlMatch = window.location.pathname.match(/\/app\/(\d+)/);
            if (urlMatch) return urlMatch[1];

            // 方法2: 从页面元素获取
            const siteInfoElement = document.querySelector('.apphub_OtherSiteInfo a');
            if (siteInfoElement) {
                const gameUrl = siteInfoElement.href;
                const appIdMatch = gameUrl.match(/\/(\d+)\/?$/);
                if (appIdMatch) return appIdMatch[1];
            }

            // 方法3: 从 data 属性获取
            const appHubElement = document.querySelector('[data-appid]');
            if (appHubElement) {
                return appHubElement.getAttribute('data-appid');
            }

            return null;
        } catch (error) {
            console.error('[SteamPY] 获取 AppID 失败:', error);
            return null;
        }
    };

    /**
     * 获取所有购买选项
     */
    const getPurchaseOptions = () => {
        const purchaseGames = document.querySelectorAll('.game_area_purchase_game');
        const options = [];

        purchaseGames.forEach((element, index) => {
            const form = element.querySelector('form');
            if (!form) return;

            const inputs = form.querySelectorAll('input');
            const lastInput = inputs[inputs.length - 1];

            if (lastInput && (lastInput.name === 'subid' || lastInput.name === 'bundleid')) {
                options.push({
                    element: element.closest('.game_area_purchase_game_wrapper'),
                    subId: lastInput.value,
                    type: lastInput.name,
                    index: index
                });
            }
        });

        return options;
    };

    /**
     * 应用样式到元素
     */
    const applyStyles = (element, styles) => {
        Object.assign(element.style, styles);
    };

    /**
     * 创建价格显示容器
     */
    const createPriceContainer = (wrapper) => {
        // 检查是否已存在价格容器
        const existing = wrapper.querySelector(`.${CONFIG.PRICE_CONTAINER_CLASS}`);
        if (existing) {
            return existing;
        }

        const container = document.createElement('div');
        container.className = CONFIG.PRICE_CONTAINER_CLASS;
        container.setAttribute('data-steampy-inserted', 'true'); // 添加标记
        applyStyles(container, STYLES.container);

        const loadingText = document.createElement('span');
        loadingText.textContent = '查询 CDK 价格中...';
        applyStyles(loadingText, STYLES.loading);
        container.appendChild(loadingText);

        wrapper.appendChild(container);
        return container;
    };

    /**
     * 发起 API 请求（带重试和缓存）
     */
    const fetchPrice = async (url, cacheKey) => {
        // 检查缓存
        if (state.priceCache.has(cacheKey)) {
            return state.priceCache.get(cacheKey);
        }

        return new Promise((resolve, reject) => {
            let attemptsLeft = CONFIG.RETRY_ATTEMPTS;

            const makeRequest = () => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: CONFIG.TIMEOUT,
                    onload: (response) => {
                        try {
                            if (response.status < 200 || response.status >= 300) {
                                retryOrReject(`服务器响应异常: HTTP ${response.status}`);
                                return;
                            }

                            const result = JSON.parse(response.responseText);
                            // 缓存结果
                            state.priceCache.set(cacheKey, result);
                            resolve(result);
                        } catch (error) {
                            retryOrReject('解析响应失败');
                        }
                    },
                    onerror: () => {
                        retryOrReject('网络请求失败');
                    },
                    ontimeout: () => {
                        retryOrReject('请求超时');
                    }
                });
            };

            const retryOrReject = (message) => {
                if (attemptsLeft > 1) {
                    attemptsLeft--;
                    setTimeout(makeRequest, 1000);
                    return;
                }

                reject(new Error(message));
            };

            makeRequest();
        });
    };

    /**
     * 更新价格显示
     */
    const updatePriceDisplay = (container, data) => {
        container.innerHTML = '';

        if (data.code !== 200 || !data.result) {
            const errorText = document.createElement('span');
            errorText.textContent = '❌ 暂无 CDK 信息';
            applyStyles(errorText, STYLES.error);
            container.appendChild(errorText);
            return;
        }

        const { keyPrice, id: cdkId } = data.result;

        const label = document.createElement('span');
        label.textContent = 'SteamPY CDK: ';
        label.style.color = '#8f98a0';
        label.style.fontSize = '13px';

        const price = document.createElement('span');
        price.textContent = `¥${keyPrice}`;
        applyStyles(price, STYLES.price);

        const link = document.createElement('a');
        link.href = `${CONFIG.STEAMPY_DETAIL_URL}${cdkId}`;
        link.target = '_blank';
        link.textContent = '查看详情 →';
        applyStyles(link, STYLES.link);
        link.addEventListener('mouseenter', () => {
            link.style.textDecoration = 'underline';
        });
        link.addEventListener('mouseleave', () => {
            link.style.textDecoration = 'none';
        });

        container.appendChild(label);
        container.appendChild(price);
        container.appendChild(link);
    };

    /**
     * 显示错误信息
     */
    const showError = (container, message) => {
        container.innerHTML = '';
        const errorText = document.createElement('span');
        errorText.textContent = `❌ ${message}`;
        applyStyles(errorText, STYLES.error);
        container.appendChild(errorText);
    };

    /**
     * 处理单个购买选项
     */
    const processPurchaseOption = async (option, appId) => {
        const { element, subId, type } = option;

        if (!element) {
            return;
        }

        // 使用唯一键标识，而不仅依赖 WeakSet
        const uniqueKey = `store-${appId}-${subId}-${type}`;

        // 检查是否已处理过
        if (state.processedKeys.has(uniqueKey) || element.querySelector(`.${CONFIG.PRICE_CONTAINER_CLASS}`)) {
            return;
        }

        state.processedKeys.add(uniqueKey);
        state.processedElements.add(element);

        const container = createPriceContainer(element);

        try {
            const cacheKey = `${appId}-${subId}-${type}`;
            const url = `${CONFIG.API_BASE_URL}?subId=${subId}&appId=${appId}&type=${type}`;
            const data = await fetchPrice(url, cacheKey);
            updatePriceDisplay(container, data);
        } catch (error) {
            console.error('[SteamPY] 获取价格失败:', error);
            showError(container, error.message || '获取失败');
        }
    };

    /**
     * 处理商店详情页
     */
    const processStorePage = async () => {
        if (state.isProcessing) {
            console.log('[SteamPY] 正在处理中，跳过');
            return;
        }

        try {
            state.isProcessing = true;

            // 等待页面准备就绪
            await waitForPageReady();

            // 等待关键元素加载
            await waitForElement('.game_area_purchase_game, .apphub_OtherSiteInfo');

            const appId = getAppId();
            if (!appId) {
                console.warn('[SteamPY] 未找到 AppID');
                return;
            }

            const purchaseOptions = getPurchaseOptions();
            if (purchaseOptions.length === 0) {
                console.warn('[SteamPY] 未找到购买选项');
                return;
            }

            console.log(`[SteamPY] 找到 ${purchaseOptions.length} 个购买选项`);

            await Promise.allSettled(
                purchaseOptions.map(option => processPurchaseOption(option, appId))
            );

            console.log('[SteamPY] 商店页价格查询完成');
        } catch (error) {
            console.error('[SteamPY] 处理商店页失败:', error);
        } finally {
            state.isProcessing = false;
        }
    };

    /**
     * 主函数
     */
    const init = async () => {
        try {
            // 检测URL是否变化（页面跳转）
            const currentUrl = window.location.href;
            if (state.lastUrl !== currentUrl) {
                console.log('[SteamPY] 检测到页面变化，清除状态');
                resetPageState();
                state.lastUrl = currentUrl;
            }

            console.log('[SteamPY] 脚本启动 - 商店详情页模式');
            await processStorePage();
        } catch (error) {
            console.error('[SteamPY] 脚本初始化失败:', error);
        }
    };

    // 监听页面可见性变化（处理后台标签页切换）
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('[SteamPY] 页面变为可见，检查是否需要重新处理');
            // 只有当元素不存在时才重新处理
            const hasElements = document.querySelector(`.${CONFIG.PRICE_CONTAINER_CLASS}`);
            if (!hasElements) {
                console.log('[SteamPY] 未找到已插入元素，重新处理');
                setTimeout(init, CONFIG.CHECK_INTERVAL);
            } else {
                console.log('[SteamPY] 已存在插入元素，跳过');
            }
        }
    });

    // 监听URL变化（SPA导航）
    let lastUrl = window.location.href;
    let urlObserverTimer = null;
    const urlObserver = new MutationObserver(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            console.log('[SteamPY] 检测到URL变化，重新初始化');
            lastUrl = currentUrl;
            clearTimeout(urlObserverTimer);
            urlObserverTimer = setTimeout(init, CONFIG.OBSERVER_DEBOUNCE);
        }
    });

    urlObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 启动脚本
    init();
})();
