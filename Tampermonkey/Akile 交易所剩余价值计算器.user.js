// ==UserScript==
// @name         Akile 交易所剩余价值计算器
// @namespace    https://akile.ai/
// @version      0.1
// @description  自动计算 Akile 交易所每台机器的剩余价值，并高亮 IP 状态
// @author       SI Xiaolong
// @match        *://akile.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── 样式注入 ─────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* IP 状态着色（覆盖原有颜色） */
    .akile-ip-ok  { color: #16a34a !important; font-weight: 700 !important; }
    .akile-ip-ban { color: #dc2626 !important; font-weight: 700 !important; }

    /* 剩余价值行 */
    .akile-rv-row {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 6px 0 2px;
      border-top: 1px dashed #e5e7eb;
      margin-top: 4px;
    }
    .akile-rv-label {
      font-size: 12px;
      color: #6b7280;
    }
    .akile-rv-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.6;
      white-space: nowrap;
      width: fit-content;
    }
    .akile-rv-badge.good { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .akile-rv-badge.mid  { background: #fef9c3; color: #a16207; border: 1px solid #fde68a; }
    .akile-rv-badge.low  { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .akile-rv-badge.zero { background: #f3f4f6; color: #9ca3af; border: 1px solid #e5e7eb; }
    .akile-rv-bar {
      width: 100%;
      height: 3px;
      background: #e5e7eb;
      border-radius: 2px;
      overflow: hidden;
    }
    .akile-rv-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.4s ease;
    }
    .akile-rv-sub {
      font-size: 11px;
      color: #9ca3af;
    }
  `;
  document.head.appendChild(style);

  // ─── 工具函数 ─────────────────────────────────────────────

  function parseRenewalPrice(text) {
    if (!text) return null;
    const m = text.match(/[¥￥]([\d.]+)\s*\/\s*(月|年)/);
    if (!m) return null;
    return {
      price: parseFloat(m[1]),
      cycleDays: m[2] === '年' ? 365 : 30,
      unit: m[2],
    };
  }

  function parseExpiry(text) {
    if (!text) return null;
    const d = new Date(text.trim().replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }

  function calcRemainingValue(renewalText, expiryText) {
    const renewal = parseRenewalPrice(renewalText);
    const expiry  = parseExpiry(expiryText);
    if (!renewal || !expiry) return null;

    const now = new Date();
    const remainingMs = expiry - now;
    if (remainingMs <= 0) return { value: 0, remainingDays: 0, ratio: 0, ...renewal };

    const remainingDays = remainingMs / 86400000;
    const ratio = Math.min(remainingDays / renewal.cycleDays, 1);
    return {
      value: Math.round(renewal.price * ratio * 100) / 100,
      remainingDays: Math.ceil(remainingDays),
      ratio,
      ...renewal,
    };
  }

  function getInfoValue(card, labelText) {
    for (const row of card.querySelectorAll('.server-info')) {
      const name = row.querySelector('.info-name');
      const val  = row.querySelector('.info-value');
      if (name && val && name.textContent.trim() === labelText) {
        return val.textContent.trim();
      }
    }
    return null;
  }

  // ─── IP 状态着色 ──────────────────────────────────────────

  function injectIpStatus(card) {
    const detailEl = card.querySelector('.server-detail');
    if (!detailEl || detailEl.querySelector('.akile-ip-ok, .akile-ip-ban')) return;

    const text = detailEl.textContent.trim();
    if (text.includes('IP正常')) {
      detailEl.innerHTML = detailEl.innerHTML.replace(
        '[IP正常]',
        '<span class="akile-ip-ok">● IP正常</span>'
      );
    } else if (text.includes('IP被墙')) {
      detailEl.innerHTML = detailEl.innerHTML.replace(
        '[IP被墙]',
        '<span class="akile-ip-ban">● IP被墙</span>'
      );
    }
  }

  // ─── 剩余价值注入 ─────────────────────────────────────────

  function injectCard(card) {
    if (card.querySelector('.akile-rv-row')) return;
    injectIpStatus(card);

    const renewalText = getInfoValue(card, '续费价格');
    const expiryText  = getInfoValue(card, '到期时间');
    const result = calcRemainingValue(renewalText, expiryText);

    // 找到「到期时间」所在的 .server-info，插在其后
    let insertAfter = null;
    for (const row of card.querySelectorAll('.server-info')) {
      const name = row.querySelector('.info-name');
      if (name && name.textContent.trim() === '到期时间') {
        insertAfter = row;
        break;
      }
    }
    if (!insertAfter) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'akile-rv-row';

    if (!result) {
      wrapper.innerHTML = `
        <span class="akile-rv-label">剩余价值</span>
        <span class="akile-rv-badge zero">⚠ 无法计算</span>
      `;
    } else if (result.value <= 0) {
      wrapper.innerHTML = `
        <span class="akile-rv-label">剩余价值</span>
        <span class="akile-rv-badge zero">已过期</span>
      `;
    } else {
      const pct = (result.ratio * 100).toFixed(1);
      const cls = result.ratio >= 0.6 ? 'good' : result.ratio >= 0.3 ? 'mid' : 'low';
      const barColor = result.ratio >= 0.6 ? '#22c55e' : result.ratio >= 0.3 ? '#eab308' : '#ef4444';

      wrapper.innerHTML = `
        <span class="akile-rv-label">剩余价值</span>
        <span class="akile-rv-badge ${cls}">
          ¥${result.value.toFixed(2)}
          <span style="font-weight:400;opacity:0.75">（${result.remainingDays}天 / ${pct}%）</span>
        </span>
        <div class="akile-rv-bar">
          <div class="akile-rv-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <span class="akile-rv-sub">按 ¥${result.price}/${result.unit} 计算</span>
      `;
    }

    insertAfter.insertAdjacentElement('afterend', wrapper);
  }

  function processAllCards() {
    document.querySelectorAll('.server-manage-card').forEach(injectCard);
  }

  // ─── 启动 ─────────────────────────────────────────────────
  processAllCards();

  new MutationObserver(processAllCards)
    .observe(document.body, { childList: true, subtree: true });

})();