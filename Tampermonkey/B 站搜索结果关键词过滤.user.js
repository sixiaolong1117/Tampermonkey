// ==UserScript==
// @name         B 站搜索结果关键词过滤
// @namespace    https://github.com/SIXiaolong1117/Rules
// @version      26.6.21
// @description  过滤B站搜索结果中标题不含搜索关键词的视频（仅保留第一页第一行结果）
// @license      MIT
// @icon         https://www.bilibili.com/favicon.ico
// @author       SI Xiaolong
// @match        https://search.bilibili.com/all*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 从 URL 获取搜索关键词
     */
    function getKeyword() {
        const url = new URL(window.location.href);
        return url.searchParams.get('keyword') || '';
    }

    /**
     * 判断当前是否为搜索结果第一页
     */
    function isFirstPage() {
        const url = new URL(window.location.href);
        const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
        return !Number.isFinite(page) || page <= 1;
    }

    /**
     * 过滤搜索结果：仅第一页从第二行开始，其他页从第一行开始
     */
    function filterResults() {
        const keyword = getKeyword();
        if (!keyword) return;

        const list = document.querySelector('.video-list.row');
        if (!list) return;

        const items = Array.from(list.children);
        if (items.length === 0) return;

        // 仅在第一页保留第一行，因为有些相关视频的标题可能不含关键词
        let firstRowCount = 0;
        if (isFirstPage()) {
            const firstTop = items[0].offsetTop;
            for (const item of items) {
                if (item.offsetTop === firstTop) {
                    firstRowCount++;
                } else {
                    break;
                }
            }
        }

        // 第一页从第二行开始检查，其他页从第一个结果开始检查
        for (let i = firstRowCount; i < items.length; i++) {
            const item = items[i];
            const heading = item.querySelector('h3');
            if (!heading) continue;

            const title = heading.textContent.trim();
            // 大小写不敏感匹配
            if (title.toLowerCase().indexOf(keyword.toLowerCase()) === -1) {
                item.style.display = 'none';
            }
        }
    }

    /**
     * 监听 URL 变化（B站使用 SPA 路由）
     */
    let lastUrl = window.location.href;
    function watchUrlChange() {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            setTimeout(filterResults, 500); // 等待新结果渲染
        }
        requestAnimationFrame(watchUrlChange);
    }

    // 初始过滤
    filterResults();

    // 监听 DOM 变化（处理异步加载更多结果）
    const observer = new MutationObserver(() => {
        filterResults();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 监听 URL 变化（处理 SPA 页面切换）
    watchUrlChange();

})();
