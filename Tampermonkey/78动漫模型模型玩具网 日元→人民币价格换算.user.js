// ==UserScript==
// @name         78动漫模型模型玩具网 日元→人民币价格换算
// @namespace    https://acg.78dm.net/
// @version      0.1
// @description  自动将78动漫模型详情页的日元价格换算为人民币（实时汇率 + 四五算/五算/七算/八五算/十算）
// @author       SI Xiaolong
// @match        https://acg.78dm.net/ct/*.html
// @grant        GM_xmlhttpRequest
// @connect      api.frankfurter.app
// ==/UserScript==

(function () {
    'use strict';

    // ── 「*算」规则表 ──────────────────────────────────────────
    const SUAN_RULES = [
        { label: '四五算', factor: 0.045 },
        { label: '五算',   factor: 0.05  },
        { label: '七算',   factor: 0.07  },
        { label: '八五算', factor: 0.085 },
        { label: '十算',   factor: 0.10  },
    ];

    // ── 工具函数 ───────────────────────────────────────────────

    function findPriceCell() {
        const rows = document.querySelectorAll('table tr');
        for (const row of rows) {
            const header = row.querySelector('td.table-header');
            if (header && header.textContent.trim() === '价格') {
                return row.querySelector('td:not(.table-header)');
            }
        }
        return null;
    }

    function extractJPY(text) {
        const matches = text.match(/\d[\d,]*/g);
        if (!matches) return [];
        return matches.map(s => parseInt(s.replace(/,/g, ''), 10)).filter(n => !isNaN(n));
    }

    function fetchRate(callback) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://api.frankfurter.app/latest?from=JPY&to=CNY',
            onload: function (res) {
                try {
                    const data = JSON.parse(res.responseText);
                    const rate = data.rates && data.rates.CNY;
                    callback(rate || null, data.date || null);
                } catch (e) {
                    callback(null, null);
                }
            },
            onerror: function () { callback(null, null); }
        });
    }

    function fmt(num) {
        return num.toFixed(2);
    }

    // ── 渲染函数 ───────────────────────────────────────────────

    function renderBlock(priceCell, jpyValues, rate, rateDate) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            margin-top: 8px;
            border: 1px solid #e8d5a3;
            border-radius: 6px;
            overflow: hidden;
            font-size: 0.92em;
            line-height: 1.6;
            max-width: 520px;
        `;

        // ── 标题栏 ───────────────────────────────────────────
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `
            background: #f0a500;
            color: #fff;
            padding: 4px 10px;
            font-weight: bold;
            font-size: 0.9em;
            letter-spacing: 0.05em;
        `;
        titleBar.textContent = '人民币换算参考';
        wrapper.appendChild(titleBar);

        // ── 表格 ────────────────────────────────────────────
        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            background: #fffdf5;
        `;

        // 表头行
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        headRow.style.background = '#fdf3d0';

        const headCells = ['换算方式', ...jpyValues.map(v => `${v.toLocaleString()} 日元`)];
        headCells.forEach((text, i) => {
            const th = document.createElement('th');
            th.style.cssText = `
                padding: 5px 10px;
                border-bottom: 1px solid #e8d5a3;
                color: #7a5c00;
                font-weight: bold;
                text-align: ${i === 0 ? 'left' : 'center'};
                white-space: nowrap;
            `;
            th.textContent = text;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        // 数据行
        const tbody = document.createElement('tbody');

        // 实时汇率行（若获取成功）
        if (rate) {
            const row = makeRow(
                '实时汇率',
                jpyValues,
                jpy => fmt(jpy * rate),
                '#e8f4e8',
                '#2d7a2d',
                true
            );
            tbody.appendChild(row);
        }

        // 分隔行
        const sepRow = document.createElement('tr');
        const sepTd = document.createElement('td');
        sepTd.colSpan = headCells.length;
        sepTd.style.cssText = `
            padding: 2px 10px;
            background: #f5e9c8;
            color: #a07820;
            font-size: 0.82em;
            font-style: italic;
            border-top: 1px solid #e8d5a3;
        `;
        sepTd.textContent = '── 模型圈「*算」参考价 ──';
        sepRow.appendChild(sepTd);
        tbody.appendChild(sepRow);

        // *算行
        SUAN_RULES.forEach((rule, idx) => {
            const bg = idx % 2 === 0 ? '#fff' : '#fdfaf0';
            const row = makeRow(
                `${rule.label}（×${rule.factor}）`,
                jpyValues,
                jpy => fmt(jpy * rule.factor),
                bg,
                '#555'
            );
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        wrapper.appendChild(table);

        // ── 汇率来源注释 ─────────────────────────────────────
        if (rate) {
            const note = document.createElement('div');
            note.style.cssText = `
                padding: 4px 10px;
                background: #fdf3d0;
                color: #999;
                font-size: 0.8em;
                border-top: 1px solid #e8d5a3;
            `;
            note.textContent = `实时汇率来源：frankfurter.app（${rateDate}，1 JPY = ${rate.toFixed(6)} CNY）`;
            wrapper.appendChild(note);
        }

        priceCell.appendChild(wrapper);
    }

    function makeRow(labelText, jpyValues, calcFn, bgColor, labelColor, bold = false) {
        const row = document.createElement('tr');
        row.style.background = bgColor;

        const labelTd = document.createElement('td');
        labelTd.style.cssText = `
            padding: 5px 10px;
            color: ${labelColor};
            font-weight: ${bold ? 'bold' : 'normal'};
            border-top: 1px solid #f0e0b0;
            white-space: nowrap;
        `;
        labelTd.textContent = labelText;
        row.appendChild(labelTd);

        jpyValues.forEach(jpy => {
            const td = document.createElement('td');
            td.style.cssText = `
                padding: 5px 10px;
                text-align: center;
                color: ${bold ? '#1a7a1a' : '#333'};
                font-weight: ${bold ? 'bold' : 'normal'};
                border-top: 1px solid #f0e0b0;
                white-space: nowrap;
            `;
            td.textContent = `¥ ${calcFn(jpy)}`;
            row.appendChild(td);
        });

        return row;
    }

    // ── 主流程 ─────────────────────────────────────────────────

    const priceCell = findPriceCell();
    if (!priceCell) return;

    const originalText = priceCell.textContent.trim();

    // 仅处理日元标价，其他货币（人民币、美元等）直接跳过
    if (!originalText.includes('日元')) return;

    const jpyValues = extractJPY(originalText);
    if (jpyValues.length === 0) return;

    // 显示加载占位
    const indicator = document.createElement('span');
    indicator.style.cssText = 'margin-left:8px; color:#999; font-size:0.9em;';
    indicator.textContent = '（汇率获取中…）';
    priceCell.appendChild(indicator);

    fetchRate(function (rate, rateDate) {
        indicator.remove();

        if (!rate) {
            console.warn('[78dm换算] 实时汇率获取失败，仅显示*算参考价');
        }

        renderBlock(priceCell, jpyValues, rate, rateDate);
    });

})();