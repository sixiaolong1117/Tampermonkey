// ==UserScript==
// @name         国家新闻出版署游戏版号统计高亮
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.2
// @description  在游戏审批信息页顶部显示本次版号总数与平台统计，支持表格搜索筛选，并高亮正文里的申报平台。
// @license      MIT
// @author       SI Xiaolong
// @match        *://www.nppa.gov.cn/bsfw/jggs/yxspjg/*
// @match        *://nppa.gov.cn/bsfw/jggs/yxspjg/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_ID = 'nppa-game-license-summary';
    const TOOLBAR_ID = 'nppa-game-license-toolbar';
    const PROCESSED_ATTR = 'data-nppa-license-highlighted';
    const LOG_PREFIX = '[游戏版号统计高亮]';

    const PLATFORM_STYLES = {
        '移动': {
            bg: '#e8f3ff',
            fg: '#075985',
            border: '#7dd3fc'
        },
        '客户端': {
            bg: '#f0fdf4',
            fg: '#166534',
            border: '#86efac'
        },
        '网页': {
            bg: '#fff7ed',
            fg: '#9a3412',
            border: '#fdba74'
        },
        '游戏机': {
            bg: '#f5f3ff',
            fg: '#6d28d9',
            border: '#c4b5fd'
        },
        'Switch': {
            bg: '#fef2f2',
            fg: '#b91c1c',
            border: '#fca5a5'
        },
        'PlayStation': {
            bg: '#eff6ff',
            fg: '#1d4ed8',
            border: '#93c5fd'
        },
        'Xbox': {
            bg: '#ecfdf5',
            fg: '#047857',
            border: '#6ee7b7'
        }
    };

    const KNOWN_PLATFORMS = Object.keys(PLATFORM_STYLES);

    function log(...args) {
        console.log(LOG_PREFIX, ...args);
    }

    function normalizeText(text) {
        return String(text || '').replace(/\s+/g, '').trim();
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function findApprovalTable() {
        const tables = [...document.querySelectorAll('.m3pageEdit table, table')];
        return tables.find((table) => {
            const text = table.textContent || '';
            return text.includes('申报类别') && text.includes('出版物号') && text.includes('批复文号');
        }) || null;
    }

    function getPlatformColumnIndex(table) {
        const headerRow = [...table.querySelectorAll('tr')].find((row) => {
            return [...row.cells].some((cell) => normalizeText(cell.textContent) === '申报类别');
        });

        if (!headerRow) {
            return 2;
        }

        const index = [...headerRow.cells].findIndex((cell) => normalizeText(cell.textContent) === '申报类别');
        return index >= 0 ? index : 2;
    }

    function getDataRows(table, platformColumnIndex) {
        const itemRows = [...table.querySelectorAll('tr.item')].filter((row) => row.cells.length > platformColumnIndex);
        if (itemRows.length) {
            return itemRows;
        }

        return [...table.querySelectorAll('tr')].filter((row) => {
            if (row.cells.length <= platformColumnIndex) {
                return false;
            }

            const rowText = normalizeText(row.textContent);
            const firstCell = normalizeText(row.cells[0]?.textContent);
            return /^\d+$/.test(firstCell) && !rowText.includes('申报类别');
        });
    }

    function splitPlatforms(categoryText) {
        const normalized = normalizeText(categoryText);
        if (!normalized) {
            return [];
        }

        const platforms = new Set();
        for (const part of normalized.split(/[、,，/]+/)) {
            const platform = KNOWN_PLATFORMS.find((name) => part.includes(name));
            platforms.add(platform || part.split('-')[0] || part);
        }

        return [...platforms].filter(Boolean);
    }

    function countRows(rows, platformColumnIndex) {
        const platformCounts = new Map();
        const categoryCounts = new Map();

        for (const row of rows) {
            const category = normalizeText(row.cells[platformColumnIndex]?.textContent);
            if (!category) {
                categoryCounts.set('未标注', (categoryCounts.get('未标注') || 0) + 1);
                continue;
            }

            categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
            for (const platform of splitPlatforms(category)) {
                platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1);
            }
        }

        return { platformCounts, categoryCounts };
    }

    function getPlatformStyle(platform) {
        const basePlatform = KNOWN_PLATFORMS.find((name) => String(platform || '').includes(name));
        return PLATFORM_STYLES[platform] || PLATFORM_STYLES[basePlatform] || {
            bg: '#f8fafc',
            fg: '#334155',
            border: '#cbd5e1'
        };
    }

    function createChip(label, count, className = '') {
        const style = getPlatformStyle(label);
        const chip = document.createElement('span');
        chip.className = `nppa-license-chip ${className}`.trim();
        chip.style.setProperty('--chip-bg', style.bg);
        chip.style.setProperty('--chip-fg', style.fg);
        chip.style.setProperty('--chip-border', style.border);
        chip.textContent = `${label} ${count}`;
        return chip;
    }

    function sortedEntries(countMap) {
        return [...countMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
    }

    function getRowCategory(row, platformColumnIndex) {
        return normalizeText(row.cells[platformColumnIndex]?.textContent);
    }

    function getRowSearchText(row) {
        return normalizeText(row.textContent).toLowerCase();
    }

    function createOption(value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }

    function buildSummary(rows, platformCounts, categoryCounts) {
        const oldSummary = document.getElementById(SCRIPT_ID);
        oldSummary?.remove();

        const title = document.querySelector('.m3page_t');
        const funs = document.querySelector('.m3page_funs');
        const mountAfter = funs || title;
        if (!mountAfter) {
            return;
        }

        const summary = document.createElement('section');
        summary.id = SCRIPT_ID;
        summary.innerHTML = `
            <div class="nppa-license-total">
                <span class="nppa-license-label">本次获得版号</span>
                <strong>${rows.length}</strong>
                <span class="nppa-license-unit">款游戏</span>
            </div>
            <div class="nppa-license-groups">
                <div class="nppa-license-group" data-group="platforms">
                    <span class="nppa-license-group-title">平台</span>
                </div>
                <div class="nppa-license-group nppa-license-category-group" data-group="categories">
                    <span class="nppa-license-group-title">申报类别</span>
                </div>
            </div>
        `;

        const platformGroup = summary.querySelector('[data-group="platforms"]');
        for (const [platform, count] of sortedEntries(platformCounts)) {
            platformGroup.append(createChip(platform, count));
        }

        const categoryGroup = summary.querySelector('[data-group="categories"]');
        for (const [category, count] of sortedEntries(categoryCounts)) {
            categoryGroup.append(createChip(category, count, 'nppa-license-chip-muted'));
        }

        mountAfter.insertAdjacentElement('afterend', summary);
    }

    function buildTableTools(table, rows, platformColumnIndex, platformCounts) {
        const oldToolbar = document.getElementById(TOOLBAR_ID);
        oldToolbar?.remove();

        const toolbar = document.createElement('section');
        toolbar.id = TOOLBAR_ID;
        toolbar.innerHTML = `
            <div class="nppa-license-toolbar-row">
                <label class="nppa-license-field nppa-license-search-field">
                    <span>搜索</span>
                    <input type="search" data-role="search" placeholder="名称、单位、文号、ISBN..." autocomplete="off">
                </label>
                <label class="nppa-license-field">
                    <span>平台</span>
                    <select data-role="platform"></select>
                </label>
                <button type="button" data-role="reset">清空</button>
                <span class="nppa-license-filter-count" data-role="count"></span>
            </div>
        `;

        const searchInput = toolbar.querySelector('[data-role="search"]');
        const platformSelect = toolbar.querySelector('[data-role="platform"]');
        const resetButton = toolbar.querySelector('[data-role="reset"]');
        const countText = toolbar.querySelector('[data-role="count"]');

        platformSelect.append(createOption('', '全部平台'));
        for (const [platform, count] of sortedEntries(platformCounts)) {
            platformSelect.append(createOption(platform, `${platform} (${count})`));
        }

        const rowMeta = rows.map((row) => {
            const category = getRowCategory(row, platformColumnIndex);
            return {
                row,
                category,
                platforms: splitPlatforms(category),
                searchText: getRowSearchText(row)
            };
        });

        function applyFilters() {
            const keyword = normalizeText(searchInput.value).toLowerCase();
            const selectedPlatform = platformSelect.value;
            let visibleCount = 0;

            for (const meta of rowMeta) {
                const matchesKeyword = !keyword || meta.searchText.includes(keyword);
                const matchesPlatform = !selectedPlatform || meta.platforms.includes(selectedPlatform);
                const visible = matchesKeyword && matchesPlatform;

                meta.row.style.display = visible ? '' : 'none';
                if (visible) {
                    visibleCount += 1;
                }
            }

            countText.textContent = `显示 ${visibleCount} / ${rows.length} 款`;
        }

        searchInput.addEventListener('input', applyFilters);
        platformSelect.addEventListener('change', applyFilters);
        resetButton.addEventListener('click', () => {
            searchInput.value = '';
            platformSelect.value = '';
            applyFilters();
            searchInput.focus();
        });

        table.insertAdjacentElement('beforebegin', toolbar);
        applyFilters();
    }

    function badgeHtml(text, platform) {
        const style = getPlatformStyle(platform || text);
        return `<span class="nppa-license-platform-badge" style="--badge-bg:${style.bg};--badge-fg:${style.fg};--badge-border:${style.border};">${escapeHtml(text)}</span>`;
    }

    function highlightCategoryCell(cell) {
        if (!cell || cell.getAttribute(PROCESSED_ATTR) === '1') {
            return;
        }

        const category = normalizeText(cell.textContent);
        if (!category) {
            return;
        }

        const parts = category.split(/(、|,|，|\/)/).filter(Boolean);
        const html = parts.map((part) => {
            if (/^(、|,|，|\/)$/.test(part)) {
                return `<span class="nppa-license-separator">${escapeHtml(part)}</span>`;
            }

            const platform = KNOWN_PLATFORMS.find((name) => part.includes(name));
            if (!platform) {
                return badgeHtml(part, part);
            }

            return badgeHtml(part, platform);
        }).join('');

        cell.innerHTML = html;
        cell.setAttribute(PROCESSED_ATTR, '1');
    }

    function injectStyle() {
        if (document.getElementById(`${SCRIPT_ID}-style`)) {
            return;
        }

        const style = document.createElement('style');
        style.id = `${SCRIPT_ID}-style`;
        style.textContent = `
            #${SCRIPT_ID} {
                margin: 18px 0 20px;
                padding: 16px 18px;
                border: 1px solid #dbeafe;
                border-left: 5px solid #2563eb;
                background: #f8fbff;
                color: #1f2937;
                box-sizing: border-box;
                font-size: 14px;
                line-height: 1.6;
            }

            #${SCRIPT_ID} .nppa-license-total {
                display: flex;
                align-items: baseline;
                gap: 8px;
                margin-bottom: 12px;
                color: #334155;
            }

            #${SCRIPT_ID} .nppa-license-total strong {
                color: #dc2626;
                font-size: 30px;
                line-height: 1;
                font-family: Arial, "Microsoft YaHei", sans-serif;
            }

            #${SCRIPT_ID} .nppa-license-label,
            #${SCRIPT_ID} .nppa-license-unit,
            #${SCRIPT_ID} .nppa-license-group-title {
                font-weight: 700;
            }

            #${SCRIPT_ID} .nppa-license-groups {
                display: grid;
                gap: 10px;
            }

            #${SCRIPT_ID} .nppa-license-group {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 8px;
            }

            #${SCRIPT_ID} .nppa-license-category-group {
                padding-top: 8px;
                border-top: 1px dashed #cbd5e1;
            }

            #${SCRIPT_ID} .nppa-license-chip,
            .nppa-license-platform-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 22px;
                padding: 1px 8px;
                border: 1px solid var(--chip-border, var(--badge-border));
                border-radius: 999px;
                background: var(--chip-bg, var(--badge-bg));
                color: var(--chip-fg, var(--badge-fg));
                font-weight: 700;
                line-height: 1.4;
                box-sizing: border-box;
                white-space: nowrap;
            }

            #${SCRIPT_ID} .nppa-license-chip-muted {
                font-weight: 600;
                opacity: 0.9;
            }

            #${TOOLBAR_ID} {
                margin: 0 0 12px;
                padding: 12px;
                border: 1px solid #e2e8f0;
                background: #ffffff;
                color: #1f2937;
                box-sizing: border-box;
                font-size: 14px;
            }

            #${TOOLBAR_ID} .nppa-license-toolbar-row {
                display: flex;
                flex-wrap: wrap;
                align-items: end;
                gap: 10px;
            }

            #${TOOLBAR_ID} .nppa-license-field {
                display: grid;
                gap: 4px;
                min-width: 150px;
            }

            #${TOOLBAR_ID} .nppa-license-search-field {
                flex: 1 1 260px;
                min-width: 220px;
            }

            #${TOOLBAR_ID} .nppa-license-field span {
                color: #475569;
                font-weight: 700;
                line-height: 1.4;
            }

            #${TOOLBAR_ID} input,
            #${TOOLBAR_ID} select,
            #${TOOLBAR_ID} button {
                height: 34px;
                border: 1px solid #cbd5e1;
                border-radius: 4px;
                background: #fff;
                color: #111827;
                box-sizing: border-box;
                font: inherit;
            }

            #${TOOLBAR_ID} input,
            #${TOOLBAR_ID} select {
                padding: 0 10px;
            }

            #${TOOLBAR_ID} button {
                min-width: 64px;
                padding: 0 14px;
                border-color: #2563eb;
                background: #2563eb;
                color: #fff;
                cursor: pointer;
                font-weight: 700;
            }

            #${TOOLBAR_ID} button:hover {
                background: #1d4ed8;
            }

            #${TOOLBAR_ID} .nppa-license-filter-count {
                min-height: 34px;
                display: inline-flex;
                align-items: center;
                color: #475569;
                font-weight: 700;
                white-space: nowrap;
            }

            .nppa-license-platform-badge {
                min-width: 46px;
                margin: 0 2px;
                padding: 2px 8px;
            }

            .nppa-license-separator {
                color: #64748b;
                font-weight: 700;
            }
        `;
        document.head.append(style);
    }

    function run() {
        const table = findApprovalTable();
        if (!table) {
            return;
        }

        const platformColumnIndex = getPlatformColumnIndex(table);
        const rows = getDataRows(table, platformColumnIndex);
        if (!rows.length) {
            return;
        }

        injectStyle();

        const { platformCounts, categoryCounts } = countRows(rows, platformColumnIndex);
        buildSummary(rows, platformCounts, categoryCounts);

        for (const row of rows) {
            highlightCategoryCell(row.cells[platformColumnIndex]);
        }

        buildTableTools(table, rows, platformColumnIndex, platformCounts);

        log(`已统计 ${rows.length} 款游戏`, Object.fromEntries(platformCounts));
    }

    run();
    window.addEventListener('load', () => window.setTimeout(run, 300), { once: true });
})();
