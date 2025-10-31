// ==UserScript==
// @name         PeerBanHelper 隐藏解封全部按钮（自行修改 @match 匹配网址）
// @namespace    https://github.com/SIXiaolong1117/Rules
// @version      0.1
// @description  PeerBanHelper 封禁名单中的解封全部按钮位于通常网页表单“筛选”按钮的位置上，经常会误操作，使用此脚本可以将其暂时隐藏。
// @license      MIT
// @icon         http://192.168.0.8:9898/favicon.ico
// @author       SI Xiaolong
// @match        http://192.168.0.8:9898/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 使用 MutationObserver 在元素出现时立即隐藏
    const observer = new MutationObserver(function(mutations) {
        hideButtonByText();
    });

    // 在 DOM 加载过程中就开始观察
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // 开始观察整个文档的变化
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
            // 立即执行一次检查
            hideButtonByText();
        });
    } else {
        // 如果文档已经加载，立即开始观察
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
        hideButtonByText();
    }

    // 额外的安全检查：定期检查（但频率较低）
    setInterval(hideButtonByText, 500);

    function hideButtonByText() {
        // 使用更精确的选择器，假设按钮是button元素
        const buttons = document.querySelectorAll('button, a, input[type="button"], input[type="submit"]');

        buttons.forEach(button => {
            const text = button.textContent || button.value || button.innerText;
            // 检查按钮文本是否包含"解封全部"
            if (text && text.includes('解封全部')) {
                button.style.display = 'none';
                // 为了更彻底，也可以设置visibility或opacity
                button.style.visibility = 'hidden';
                button.style.opacity = '0';
                button.style.position = 'absolute';
                button.style.left = '-9999px';
            }
        });
    }

    // 页面加载完成后也执行一次
    window.addEventListener('load', function() {
        hideButtonByText();
        // 加载完成后可以稍微增加检查频率
        setInterval(hideButtonByText, 100);
    });
})();