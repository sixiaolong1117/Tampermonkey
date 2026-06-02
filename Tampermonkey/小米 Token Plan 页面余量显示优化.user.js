// ==UserScript==
// @name         小米token plan页面余量显示优化
// @namespace    https://github.com/SIXiaolong1117/Rules
// @version      0.1
// @description  在小米token plan页面的余量显示部分添加计算模块，根据剩余credits反算可使用的token数量
// @author       SI Xiaolong
// @match        https://platform.xiaomimimo.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const TAG = '[Token余量优化]';

    // 计费规则：每百万token的credits消耗率
    const BILLING_RULES = {
        'mimo-v2.5-pro': {
            input_cached: 2.5,
            input_uncached: 300,
            output: 600
        },
        'mimo-v2.5': {
            input_cached: 2,
            input_uncached: 100,
            output: 200
        },
        'mimo-v2-pro': {
            input_cached: 2.5,
            input_uncached: 300,
            output: 600
        },
        'mimo-v2-omni': {
            input_cached: 2,
            input_uncached: 100,
            output: 200
        }
    };

    // 解析数字字符串，移除逗号
    function parseNumber(str) {
        return parseInt(str.replace(/,/g, ''), 10);
    }

    // 格式化数字，添加千位分隔符
    function formatNumber(num) {
        return num.toLocaleString('en-US');
    }

    // 查找包含"当前套餐用量"文本的 <p> 元素
    function findUsageTitle() {
        const pElements = document.querySelectorAll('p');
        for (const p of pElements) {
            if (p.textContent.trim() === '当前套餐用量') {
                return p;
            }
        }
        return null;
    }

    // 从用量标题向上查找灰底卡片容器
    function findContainer(titleElement) {
        // 向上遍历，找到包含用量数字的灰色卡片容器
        let el = titleElement.parentElement;
        for (let i = 0; i < 10 && el; i++) {
            // 检查是否包含 usage figure 元素（匹配 xxx,xxx / xxx,xxx 格式）
            const spans = el.querySelectorAll('span');
            for (const span of spans) {
                if (/[\d,]+\s*\/\s*[\d,]+/.test(span.textContent) && span.textContent.includes('/')) {
                    // 检查是否已有注入元素（通过子元素中的 #mimo-model-select 判断）
                    if (el.querySelector('#mimo-model-select')) return null;
                    return { container: el, usageSpan: span };
                }
            }
            el = el.parentElement;
        }
        return null;
    }

    // 创建计算模块并插入
    function injectCalculationModule(container, usageSpan) {
        // 解析已用和总额
        const usageText = usageSpan.textContent.trim();
        const match = usageText.match(/([\d,]+)\s*\/\s*([\d,]+)/);
        if (!match) {
            console.log(TAG, '无法解析用量数字:', usageText);
            return;
        }

        const used = parseNumber(match[1]);
        const total = parseNumber(match[2]);
        const remaining = total - used;
        const usedPercent = ((used / total) * 100).toFixed(1);

        console.log(TAG, '解析成功 - 已用 credits:', used, '总额:', total, '剩余:', remaining);

        // 创建注入的 div
        const injectDiv = document.createElement('div');
        injectDiv.style.cssText = 'margin-top: 12px; padding: 12px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e6ea;';
        injectDiv.innerHTML = `
            <div style="font-size: 14px; font-weight: 500; color: #1f2329; margin-bottom: 8px;">📊 余量计算</div>
            <div style="margin-top: 4px;">
                <div style="font-size: 12px; color: #646a73; margin-bottom: 6px;">剩余 credits 可用 token 数量（credits ÷ 费率 × 1,000,000）</div>
                <select id="mimo-model-select" style="width: 100%; padding: 6px 8px; border: 1px solid #e5e6ea; border-radius: 4px; font-size: 12px; color: #1f2329; background-color: #f6f6f8; margin-bottom: 6px;">
                    ${Object.keys(BILLING_RULES).map(model => `<option value="${model}">${model}</option>`).join('')}
                </select>
                <div id="mimo-credits-info" style="font-size: 12px; color: #646a73;"></div>
            </div>
        `;

        // 插入到容器末尾
        container.appendChild(injectDiv);
        console.log(TAG, '计算模块已插入');

        // 更新 credits 信息：根据剩余 credits 反算可使用多少 token
        function updateCreditsInfo() {
            const modelSelect = document.getElementById('mimo-model-select');
            const creditsInfo = document.getElementById('mimo-credits-info');
            if (!modelSelect || !creditsInfo) return;

            const model = modelSelect.value;
            const rules = BILLING_RULES[model];
            if (!rules) return;

            // 剩余 token = 剩余 credits / (credits / 百万token) * 1,000,000
            // 即 剩余 token = 剩余 credits * 1,000,000 / credits_per_million_tokens
            const tokensForInputCached = Math.floor(remaining * 1000000 / rules.input_cached);
            const tokensForInputUncached = Math.floor(remaining * 1000000 / rules.input_uncached);
            const tokensForOutput = Math.floor(remaining * 1000000 / rules.output);

            creditsInfo.innerHTML = `
                <div style="margin-bottom: 2px;">输入（命中缓存，${rules.input_cached} credits/M）：<b>${formatNumber(tokensForInputCached)}</b> tokens</div>
                <div style="margin-bottom: 2px;">输入（未命中缓存，${rules.input_uncached} credits/M）：<b>${formatNumber(tokensForInputUncached)}</b> tokens</div>
                <div>输出（${rules.output} credits/M）：<b>${formatNumber(tokensForOutput)}</b> tokens</div>
            `;
        }

        updateCreditsInfo();
        injectDiv.querySelector('#mimo-model-select').addEventListener('change', updateCreditsInfo);
    }

    // 扫描并注入
    function scanAndInject() {
        const title = findUsageTitle();
        if (!title) {
            console.log(TAG, '未找到"当前套餐用量"标题');
            return false;
        }

        const result = findContainer(title);
        if (!result) {
            console.log(TAG, '未找到用量容器或已注入');
            return false;
        }

        injectCalculationModule(result.container, result.usageSpan);
        return true;
    }

    // 当前页面是否是目标页面
    function isTargetPage() {
        return location.pathname === '/console/plan-manage';
    }

    // 主逻辑
    function init() {
        console.log(TAG, '脚本启动');

        // 启动一个长期 MutationObserver，监听 DOM 变化并尝试注入
        const observer = new MutationObserver(() => {
            if (isTargetPage()) {
                scanAndInject();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        // 监听 SPA 路由变化（pushState / replaceState / popstate）
        function onRouteChange() {
            console.log(TAG, '检测到路由变化:', location.href);
            if (isTargetPage()) {
                // 延迟一点等待 DOM 渲染
                setTimeout(scanAndInject, 500);
            }
        }

        // 拦截 pushState 和 replaceState
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        history.pushState = function (...args) {
            originalPushState.apply(this, args);
            onRouteChange();
        };
        history.replaceState = function (...args) {
            originalReplaceState.apply(this, args);
            onRouteChange();
        };
        window.addEventListener('popstate', onRouteChange);

        // 首次也尝试扫描
        if (isTargetPage()) {
            setTimeout(scanAndInject, 500);
        }
    }

    // 启动
    init();
})();