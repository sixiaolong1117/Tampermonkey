// ==UserScript==
// @name         Acck 交易所剩余价值计算器
// @namespace    https://acck.io/
// @version      0.2
// @description  自动计算 Acck 交易所每台机器的剩余价值，显示流量存量条，并高亮 IP 状态
// @author       SI Xiaolong
// @match        *://acck.io/console*
// @match        *://*.acck.io/console*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const VALUE_RENDER_VERSION = '0.2';

  const style = document.createElement('style');
  style.textContent = `
    .acck-ip-ok  { color: #22c55e !important; font-weight: 700 !important; }
    .acck-ip-ban { color: #f87171 !important; font-weight: 700 !important; }
    .acck-ip-blocked-card {
      background: rgba(220, 38, 38, 0.14) !important;
      border-color: rgba(248, 113, 113, 0.65) !important;
      box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.18) !important;
    }

    .acck-rv-row {
      grid-column: 1 / -1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 0 2px;
      border-top: 1px dashed rgba(255, 255, 255, 0.16);
      margin-top: 4px;
    }
    .acck-rv-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.58);
    }
    .acck-rv-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.6;
      white-space: nowrap;
      width: fit-content;
    }
    .acck-rv-badge.good { background: rgba(34, 197, 94, 0.18); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.42); }
    .acck-rv-badge.mid  { background: rgba(234, 179, 8, 0.18); color: #fde68a; border: 1px solid rgba(234, 179, 8, 0.42); }
    .acck-rv-badge.low  { background: rgba(239, 68, 68, 0.18); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.42); }
    .acck-rv-badge.zero { background: rgba(148, 163, 184, 0.14); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.32); }
    .acck-rv-bar {
      width: 100%;
      height: 3px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 2px;
      overflow: hidden;
    }
    .acck-rv-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.4s ease;
    }
    .acck-rv-sub {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.46);
    }

    .acck-traffic-row {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-top: 5px;
      width: 100%;
      min-width: 120px;
    }
    .acck-traffic-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.58);
    }
    .acck-traffic-percent {
      font-weight: 700;
      white-space: nowrap;
    }
    .acck-traffic-track {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      overflow: hidden;
    }
    .acck-traffic-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.4s ease;
    }
    .acck-traffic-fill.good { background: #22c55e; }
    .acck-traffic-fill.mid  { background: #eab308; }
    .acck-traffic-fill.low  { background: #ef4444; }
  `;
  document.head.appendChild(style);

  function parseRenewalPrice(text) {
    if (!text) return null;
    const m = text.match(/[¥￥]\s*([\d.]+)\s*\/\s*(月|年)付?/);
    if (!m) return null;
    return {
      price: parseFloat(m[1]),
      cycleDays: m[2] === '年' ? 365 : 30,
      unit: m[2],
    };
  }

  function parseExpiry(text) {
    if (!text) return null;
    const m = text.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;

    const [, year, month, day, hour, minute, second] = m.map(Number);
    const d = new Date(year, month - 1, day, hour, minute, second);
    return isNaN(d.getTime()) ? null : d;
  }

  function calcRemainingValue(renewalText, expiryText) {
    const renewal = parseRenewalPrice(renewalText);
    const expiry = parseExpiry(expiryText);
    if (!renewal || !expiry) return null;

    const remainingMs = expiry - new Date();
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

  function parseMoney(text) {
    if (!text) return null;
    const m = text.match(/[¥￥]\s*([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  }

  function parseTrafficAmount(text) {
    if (!text) return null;
    const m = text.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
    if (!m) return null;

    const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
    return parseFloat(m[1]) * units[m[2].toUpperCase()];
  }

  function calcTrafficStock(text) {
    if (!text) return null;
    const parts = text.split('/').map((part) => part.trim());
    if (parts.length !== 2) return null;

    const used = parseTrafficAmount(parts[0]);
    const total = parseTrafficAmount(parts[1]);
    if (used === null || total === null) return null;
    if (total <= 0) {
      return {
        remainingRatio: 1,
        remainingPct: '不限',
        usedText: parts[0],
        totalText: parts[1],
        unlimited: true,
      };
    }

    const remainingRatio = Math.max(0, Math.min((total - used) / total, 1));
    return {
      remainingRatio,
      remainingPct: (remainingRatio * 100).toFixed(1),
      usedText: parts[0],
      totalText: parts[1],
      unlimited: false,
    };
  }

  function getInfoItem(card, labelText) {
    for (const row of card.querySelectorAll('.info-item')) {
      const label = row.querySelector('.label');
      if (label && label.textContent.trim() === labelText) return row;
    }
    return null;
  }

  function getInfoValue(card, labelText) {
    const row = getInfoItem(card, labelText);
    return row?.querySelector('.value')?.textContent.trim() || null;
  }

  function getSalePrice(card) {
    return parseMoney(card.querySelector('.total-price')?.textContent);
  }

  function getValueCompareClass(remainingValue, salePrice) {
    if (salePrice === null || Number.isNaN(salePrice)) return 'zero';

    const diff = remainingValue - salePrice;
    if (diff > 1) return 'good';
    if (diff < -1) return 'low';
    return 'mid';
  }

  function injectIpStatus(card) {
    const descEl = card.querySelector('.product-desc');
    if (!descEl) return;

    const text = descEl.textContent.trim();
    if (text.includes('IP正常')) {
      card.classList.remove('acck-ip-blocked-card');
      if (descEl.querySelector('.acck-ip-ok')) return;
      descEl.innerHTML = descEl.innerHTML.replace('[IP正常]', '<span class="acck-ip-ok">● IP正常</span>');
    } else if (text.includes('IP被墙')) {
      card.classList.add('acck-ip-blocked-card');
      if (descEl.querySelector('.acck-ip-ban')) return;
      descEl.innerHTML = descEl.innerHTML.replace('[IP被墙]', '<span class="acck-ip-ban">● IP被墙</span>');
    } else {
      card.classList.remove('acck-ip-blocked-card');
    }
  }

  function injectTrafficStock(card) {
    const row = getInfoItem(card, '流量');
    const valueEl = row?.querySelector('.value');
    const usageText = valueEl?.childNodes[0]?.textContent.trim() || valueEl?.textContent.trim();
    const result = usageText && calcTrafficStock(usageText);
    if (!valueEl || !result) return;

    const cls = result.unlimited || result.remainingRatio >= 0.6 ? 'good' : result.remainingRatio >= 0.3 ? 'mid' : 'low';
    let wrapper = valueEl.querySelector('.acck-traffic-row');
    if (wrapper && wrapper.dataset.trafficText === usageText) return;
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'acck-traffic-row';
      valueEl.appendChild(wrapper);
    }
    wrapper.dataset.trafficText = usageText;

    wrapper.innerHTML = `
      <div class="acck-traffic-head">
        <span>剩余流量</span>
        <span class="acck-traffic-percent">${result.remainingPct}${result.unlimited ? '' : '%'}</span>
      </div>
      <div class="acck-traffic-track" title="已用 ${result.usedText} / 总量 ${result.totalText}">
        <div class="acck-traffic-fill ${cls}" style="width:${result.unlimited ? 100 : result.remainingPct}%"></div>
      </div>
    `;
  }

  function injectRemainingValue(card) {
    const renewalText = getInfoValue(card, '续费价格');
    const expiryText = getInfoValue(card, '到期时间');
    const salePrice = getSalePrice(card);
    const result = calcRemainingValue(renewalText, expiryText);
    const insertAfter = getInfoItem(card, '到期时间');
    if (!insertAfter) return;

    let wrapper = card.querySelector('.acck-rv-row');
    const signature = `${VALUE_RENDER_VERSION}|${renewalText || ''}|${expiryText || ''}|${salePrice ?? ''}`;
    if (wrapper && wrapper.dataset.valueSignature === signature) return;
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'acck-rv-row';
    }
    wrapper.dataset.valueSignature = signature;

    if (!result) {
      wrapper.innerHTML = `
        <span class="acck-rv-label">剩余价值</span>
        <span class="acck-rv-badge zero">无法计算</span>
      `;
    } else if (result.value <= 0) {
      wrapper.innerHTML = `
        <span class="acck-rv-label">剩余价值</span>
        <span class="acck-rv-badge zero">已过期</span>
      `;
    } else {
      const pct = (result.ratio * 100).toFixed(1);
      const cls = getValueCompareClass(result.value, salePrice);
      const barColor = cls === 'good' ? '#22c55e' : cls === 'mid' ? '#eab308' : '#ef4444';
      const compareText = salePrice === null
        ? '未找到售价'
        : `售价 ¥${salePrice.toFixed(2)}，差额 ${(result.value - salePrice) >= 0 ? '+' : ''}¥${(result.value - salePrice).toFixed(2)}`;

      wrapper.innerHTML = `
        <span class="acck-rv-label">剩余价值</span>
        <span class="acck-rv-badge ${cls}">
          ¥${result.value.toFixed(2)}
          <span style="font-weight:400;opacity:0.75">（${result.remainingDays}天 / ${pct}%）</span>
        </span>
        <div class="acck-rv-bar">
          <div class="acck-rv-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <span class="acck-rv-sub">按 ¥${result.price}/${result.unit} 计算；${compareText}</span>
      `;
    }

    if (!wrapper.isConnected) insertAfter.insertAdjacentElement('afterend', wrapper);
  }

  function injectCard(card) {
    injectIpStatus(card);
    injectTrafficStock(card);
    injectRemainingValue(card);
  }

  function processAllCards() {
    document.querySelectorAll('.server-card').forEach(injectCard);
  }

  processAllCards();

  new MutationObserver(processAllCards)
    .observe(document.body, { childList: true, subtree: true });
})();
