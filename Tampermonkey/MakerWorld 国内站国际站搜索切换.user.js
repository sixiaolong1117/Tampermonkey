// ==UserScript==
// @name         MakerWorld 国内站国际站搜索切换
// @namespace    https://github.com/SIXiaolong1117/Rules
// @version      0.4
// @description  在 MakerWorld 搜索框旁边放置转到另一个网站的按钮（.com <-> .com.cn）
// @license      MIT
// @icon         https://makerworld.com.cn/favicon.ico
// @author       SI Xiaolong
// @match        https://makerworld.com/*
// @match        https://makerworld.com.cn/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_CLASS = 'mw-switch-site-btn';
    const STYLE_ID = 'mw-switch-site-style';
    const SEARCH_CONTAINER_SELECTORS = [
        '.search-input-container',
        '.search-input-wrapper'
    ];
    const SEARCH_BOX_SELECTORS = [
        '.search-input',
        '.input-wrapper'
    ];
    const POLL_INTERVAL = 500;
    const POLL_TIMEOUT = 15000;
    let poller = null;

    function getTargetHost() {
        const hn = location.hostname.toLowerCase();
        return hn.endsWith('makerworld.com.cn') ? 'makerworld.com' : 'makerworld.com.cn';
    }

    function buildTargetUrl() {
        try {
            const u = new URL(location.href);
            u.hostname = getTargetHost();
            return u.toString();
        } catch {
            return location.href.replace(/\/\/[^\/]+/, '//' + getTargetHost());
        }
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .mw-switch-site-host {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                flex-direction: row !important;
                flex-wrap: nowrap !important;
                min-width: 0 !important;
            }

            .mw-switch-site-host > :not(.${BUTTON_CLASS}) {
                flex: 1 1 auto !important;
                min-width: 0 !important;
            }

            .${BUTTON_CLASS} {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                height: 40px;
                min-width: 92px;
                padding: 0 15px;
                margin: 0;
                font-size: 13px;
                font-weight: 600;
                line-height: 1;
                border-radius: 8px;
                border: 1px solid rgba(57, 170, 0, 0.36);
                background: rgba(57, 170, 0, 0.08);
                color: var(--mui-palette-primary-main, #39AA00);
                cursor: pointer;
                flex: 0 0 auto;
                box-sizing: border-box;
                user-select: none;
                transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
                white-space: nowrap;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
            }

            .${BUTTON_CLASS}:hover {
                border-color: rgba(57, 170, 0, 0.55);
                background: rgba(57, 170, 0, 0.12);
                transform: translateY(-1px);
            }

            .${BUTTON_CLASS}:active {
                transform: translateY(0);
                background: rgba(57, 170, 0, 0.16);
            }

            .${BUTTON_CLASS}:focus-visible {
                outline: 2px solid rgba(57, 170, 0, 0.65);
                outline-offset: 2px;
            }

            @media (max-width: 767px) {
                .${BUTTON_CLASS} {
                    min-width: 58px;
                    padding: 0 10px;
                    font-size: 12px;
                    height: 36px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function queryFirst(selectors, root = document) {
        for (const selector of selectors) {
            const node = root.querySelector(selector);
            if (node) return node;
        }
        return null;
    }

    function findSearchHost() {
        const container = queryFirst(SEARCH_CONTAINER_SELECTORS);
        if (!container) return null;

        if (container.matches('.search-input-container')) {
            return container;
        }

        const searchBox = queryFirst(SEARCH_BOX_SELECTORS, container);
        if (searchBox && searchBox.parentElement) {
            return searchBox.parentElement;
        }

        return container;
    }

    function createButton(targetHost) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = BUTTON_CLASS;
        btn.textContent = targetHost.endsWith('.com') ? '转到 .com' : '转到 .com.cn';
        btn.title = `转到 ${targetHost}`;

        btn.addEventListener('click', e => {
            e.preventDefault();
            window.location.href = buildTargetUrl();
        });
        
        btn.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                btn.click();
            }
        });
        
        btn.tabIndex = 0;
        return btn;
    }

    function updateButtonLabel(btn) {
        const targetHost = getTargetHost();

        if (window.innerWidth < 768) {
            btn.textContent = targetHost.endsWith('.com') ? '.com' : '.cn';
        } else {
            btn.textContent = targetHost.endsWith('.com') ? '转到 .com' : '转到 .com.cn';
        }

        btn.title = `转到 ${targetHost}`;
        btn.setAttribute('aria-label', `转到 ${targetHost}`);
    }

    function tryInject() {
        injectStyles();

        const host = findSearchHost();
        if (!host) return false;

        const existing = document.querySelector('.' + BUTTON_CLASS);
        if (existing) {
            if (existing.parentElement !== host) {
                host.appendChild(existing);
            }
            updateButtonLabel(existing);
            host.classList.add('mw-switch-site-host');
            return true;
        }

        const btn = createButton(getTargetHost());
        updateButtonLabel(btn);

        host.classList.add('mw-switch-site-host');
        host.appendChild(btn);

        return true;
    }

    function handleResponsive() {
        const btn = document.querySelector('.' + BUTTON_CLASS);
        if (!btn) return;
        updateButtonLabel(btn);
    }

    function startPolling() {
        if (poller) return;

        const startedAt = Date.now();
        poller = setInterval(() => {
            const ok = tryInject();
            if (ok || Date.now() - startedAt > POLL_TIMEOUT) {
                clearInterval(poller);
                poller = null;
                handleResponsive();
            }
        }, POLL_INTERVAL);
    }

    startPolling();

    const mo = new MutationObserver(() => {
        const btn = document.querySelector('.' + BUTTON_CLASS);
        if (!btn || !document.body.contains(btn)) {
            tryInject();
        }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', handleResponsive);

})();
