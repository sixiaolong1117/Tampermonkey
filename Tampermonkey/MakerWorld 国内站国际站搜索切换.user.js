// ==UserScript==
// @name         MakerWorld 国内站国际站搜索切换
// @namespace    https://github.com/SIXiaolong1117/Rules
// @version      0.2
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

    const WRAPPER_CLASS = 'search-input-wrapper';
    const INPUT_CONTAINER_CLASS = 'search-input-container';
    const POLL_INTERVAL = 500;
    let injected = false;

    const wrapperSelector = '.' + WRAPPER_CLASS.split(' ').join('.');
    const wrapper = document.querySelector(wrapperSelector);
    if (wrapper) {
        wrapper.style.display = 'inline-flex'
        wrapper.style.alignItems = 'center'
        wrapper.style.height = 'auto'
        wrapper.style.gap = '8px'
    }


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

    function createButton(targetHost) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mw-switch-site-btn';
        btn.textContent = targetHost.endsWith('.com') ? '转到 .com' : '转到 .com.cn';
        btn.title = `转到 ${targetHost}`;
        btn.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            'height:40px',
            'padding:0 12px',
            'margin:0px',
            'font-size:16px',
            'border-radius:6px',
            'border:1px solid rgba(0,0,0,0.2)',
            'background:rgba(0,0,0,0.2)',
            'cursor:pointer',
            'margin-left:8px',
            'box-sizing:border-box',
            'user-select:none'
        ].join(';');

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

    function tryInject() {
        if (injected) return;

        const wrapperSelector = '.' + WRAPPER_CLASS.split(' ').join('.');
        const wrapper = document.querySelector(wrapperSelector);
        if (!wrapper) return;

        // 查找 search-input-container
        const inputContainer = wrapper.querySelector('.' + INPUT_CONTAINER_CLASS);
        if (!inputContainer) return;

        // 防止重复注入
        if (wrapper.querySelector('.mw-switch-site-btn')) {
            injected = true;
            return;
        }

        const btn = createButton(getTargetHost());
        // 插入到 inputContainer 后面
        inputContainer.insertAdjacentElement('afterend', btn);

        injected = true;
    }

    const poller = setInterval(() => {
        tryInject();
        if (injected) clearInterval(poller);
    }, POLL_INTERVAL);

    const mo = new MutationObserver(() => {
        if (!injected) tryInject();
        else mo.disconnect();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
        if (!injected) {
            clearInterval(poller);
            mo.disconnect();
        }
    }, 10000);

})();
