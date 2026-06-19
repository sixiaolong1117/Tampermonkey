// ==UserScript==
// @name         知乎内容 AI 质量筛选
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.1
// @description  在知乎问题详情页回答、文章和首页展开内容中添加 AI 质量评估按钮，调用 OpenAI 兼容接口输出质量判断
// @license      MIT
// @icon         https://zhihu.com/favicon.ico
// @author       SI Xiaolong
// @match        https://www.zhihu.com/*
// @match        https://zhihu.com/*
// @match        https://zhuanlan.zhihu.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_PREFIX = 'sixiaolong1117_zhihu_ai_quality_';
    const CONFIG_KEY = STORAGE_PREFIX + 'config';

    const DEFAULT_CONFIG = {
        apiUrl: 'https://api.siliconflow.cn/v1',
        apiKey: '',
        model: '',
        timeoutMs: 60000,
        maxChars: 12000
    };

    // 后续评判标准主要改这里。输出 JSON 是为了让页面能稳定渲染彩色质量卡片。
    const QUALITY_PROMPT = `
你是知乎内容质量评估助手。请只评估用户提供的知乎内容质量，不要回答原问题，不要续写原文。

重点评判角度：
0. 广告/营销检测是最高优先级规则：不管是文章还是回答，只要主要目的包含广告、营销、导流、卖课、卖咨询、推广测评工具/产品/服务、引导点击外部或站内商业入口、反复出现“入口/链接/自取/点击下方/私信/加群/领取/购买/咨询/测试/测评/专业版”等转化话术，一律判为广告。典型广告模式包括：先写一段泛泛科普或经验内容，再多次插入某个测试、工具、课程、咨询、商品或服务的入口。广告内容即使前半部分有科普、经验分享或看似有用的信息，也必须给 0 分。
1. 主题契合度：如果是回答，判断是否直接回应问题，是否偷换问题、绕开核心、只借题发挥；如果是文章，判断标题、主旨和正文是否一致。
2. 案例与信源：先区分内容是在表达个人体验/经验/主观观点，还是在提出需要外部证明的客观事实、统计数据、医学/法律/金融等高风险判断。个人体验只要边界清楚、没有冒充普遍规律，就不应因为缺少外部信源而判为不可靠；只有涉及客观数据、广泛事实、专业结论，或把个体经验推广成普遍结论时，才需要可靠信源。缺少必要来源时指出具体风险，不要替原文补来源。
3. 论证质量：观点和结论之间是否有清晰推理，是否存在以偏概全、因果倒置、情绪替代论证、断言多于证据等问题。
4. 信息密度：是否提供了有助于理解问题的新信息，而不是空泛表态、段子化表达或重复常识。
5. 表达与阅读价值：结构是否清楚，读者是否值得继续阅读。

质量等级只能选一个：
- 广告：检测到广告、营销或导流内容，必须给 0 分，不再按普通质量维度加分。
- AI生成：检测到内容由 AI 模型生成，必须给 0 分，不再按普通质量维度加分。
- 优质：主题明确、有证据或可信经验、论证清楚，值得读。
- 可读：基本贴合主题，有一定信息量；若主要是个人体验，边界清楚即可，不必强求外部信源。
- 存疑：可能有价值，但跑题、必要证据不足、逻辑跳跃或事实风险较明显。
- 低质：明显跑题、缺乏有效论证、主要靠情绪或无来源断言支撑。

请严格输出一个 JSON 对象，不要使用 Markdown 代码块，不要添加 JSON 之外的文字：
{
  "verdict": "广告|优质|可读|存疑|低质",
  "score": 0到100之间的整数,
  "isAd": true或false,
  "adReason": "如果是广告，说明命中的营销/导流信号；不是广告则为空字符串",
  "isAiGenerated": true或false,
  "aiReason": "如果是AI生成，说明检测到的AI特征；不是则为空字符串",
  "summary": "2到4句话概括判断，必须提到最关键的质量原因",
  "badges": ["最多3个短标签，例如：广告导流、AI生成、主题明确、经验边界清楚、必要信源不足、逻辑跳跃"],
  "dimensions": [
    {"name": "主题契合度", "level": "good|warn|bad", "comment": "一句话评价"},
    {"name": "案例与信源", "level": "good|warn|bad", "comment": "一句话评价；请说明它是个人体验可接受，还是客观断言缺少必要来源"},
    {"name": "论证质量", "level": "good|warn|bad", "comment": "一句话评价"},
    {"name": "信息密度", "level": "good|warn|bad", "comment": "一句话评价"}
  ],
  "adSignals": ["最多3条广告/营销/导流信号；不是广告则为空数组"],
  "aiSignals": ["最多3条AI生成特征信号；不是AI生成则为空数组"],
  "sourceIssues": ["最多3条必要信源或事实风险问题；个人体验边界清楚时不要列为信源问题，没有则为空数组"],
  "suggestions": ["最多3条给读者的阅读建议或核查建议"]
}

如果 isAd 为 true：
- verdict 必须是 "广告"
- score 必须是 0
- badges 必须包含 "广告导流" 或同义短标签
- dimensions 的 level 应主要为 "bad"
- adSignals 必须列出具体营销/导流证据

如果 isAiGenerated 为 true：
- verdict 必须是 "AI生成"
- score 必须是 0
- badges 必须包含 "AI生成" 或同义短标签
- dimensions 的 level 应主要为 "bad"
- aiSignals 必须列出具体AI生成特征证据
`.trim();

    const SELECTORS = {
        contentItem: '.ContentItem.AnswerItem, .AnswerItem, .ContentItem.ArticleItem, .ArticleItem, .Post-content, .Post-Main, .Post-NormalMain, .Post, article',
        pageTitle: '.QuestionHeader-title, .Post-Title, .Post-Header h1, .ArticleDetail-title, h1',
        itemTitle: '.ContentItem-title a, .ContentItem-title, h2 a, h2, .Post-Title, .Post-Header h1, .ArticleDetail-title, h1',
        contentBody: '.RichText, .RichContent-inner, .RichContent, .Post-RichText, .Post-RichTextContainer, .ArticleDetail-content',
        authorName: '.AuthorInfo-name, .UserLink-link, .AuthorInfo a[href*="/people/"], .Post-Author .UserLink-link, .Post-Header .UserLink-link, a[href*="/people/"]',
        voteText: '.VoteButton, .ContentItem-actions, .ContentItem-meta'
    };

    let config = loadConfig();
    let lastUrl = location.href;
    let processScheduled = false;

    updateThemeClass();

    appendStyle(`
        :root {
            --zhihu-ai-quality-toolbar-border: #ebebeb;
            --zhihu-ai-quality-button-border: #d0d0d0;
            --zhihu-ai-quality-button-text: #8590a6;
            --zhihu-ai-quality-button-hover-bg: rgba(22, 119, 255, 0.06);
            --zhihu-ai-quality-primary: #1677ff;
            --zhihu-ai-quality-panel-text: #1f2329;
            --zhihu-ai-quality-muted-text: #646a73;
            --zhihu-ai-quality-panel-border: #d9e6ff;
            --zhihu-ai-quality-panel-left: #1677ff;
            --zhihu-ai-quality-panel-bg: #f7fbff;
            --zhihu-ai-quality-excellent-border: #b7eb8f;
            --zhihu-ai-quality-excellent-left: #52c41a;
            --zhihu-ai-quality-excellent-bg: #f6ffed;
            --zhihu-ai-quality-good-border: #91caff;
            --zhihu-ai-quality-good-left: #1677ff;
            --zhihu-ai-quality-good-bg: #f0f7ff;
            --zhihu-ai-quality-risky-border: #ffe58f;
            --zhihu-ai-quality-risky-left: #faad14;
            --zhihu-ai-quality-risky-bg: #fffbe6;
            --zhihu-ai-quality-risky-text: #1f2329;
            --zhihu-ai-quality-poor-border: #ffccc7;
            --zhihu-ai-quality-poor-left: #ff4d4f;
            --zhihu-ai-quality-poor-bg: #fff2f0;
            --zhihu-ai-quality-poor-text: #1f2329;
            --zhihu-ai-quality-error-border: #ffd8bf;
            --zhihu-ai-quality-error-left: #fa8c16;
            --zhihu-ai-quality-error-bg: #fff7e6;
            --zhihu-ai-quality-error-text: #7c3f00;
            --zhihu-ai-quality-loading-text: #3a5f8f;
            --zhihu-ai-quality-icon-text: #fff;
            --zhihu-ai-quality-risky-icon-text: #5f3700;
            --zhihu-ai-quality-score-bg: rgba(255, 255, 255, 0.72);
            --zhihu-ai-quality-score-text: #1f2329;
            --zhihu-ai-quality-badge-bg: rgba(22, 119, 255, 0.1);
            --zhihu-ai-quality-badge-text: #1554ad;
            --zhihu-ai-quality-card-bg: rgba(255, 255, 255, 0.66);
            --zhihu-ai-quality-card-border: rgba(31, 35, 41, 0.08);
            --zhihu-ai-quality-section-border: rgba(31, 35, 41, 0.08);
            --zhihu-ai-quality-overlay-bg: rgba(0, 0, 0, 0.45);
            --zhihu-ai-quality-modal-bg: #fff;
            --zhihu-ai-quality-modal-text: #1f2329;
            --zhihu-ai-quality-modal-border: #dcdfe6;
            --zhihu-ai-quality-modal-muted: #606266;
            --zhihu-ai-quality-input-bg: #fff;
            --zhihu-ai-quality-input-border: #dcdfe6;
            --zhihu-ai-quality-close-bg: #f2f3f5;
            --zhihu-ai-quality-toast-bg: rgba(0, 0, 0, 0.82);
        }
        @media (prefers-color-scheme: dark) {
            :root:not(.zhihu-ai-quality-theme-light) {
                --zhihu-ai-quality-toolbar-border: #2f3336;
                --zhihu-ai-quality-button-border: #555;
                --zhihu-ai-quality-button-text: #8590a6;
                --zhihu-ai-quality-button-hover-bg: rgba(22, 119, 255, 0.12);
                --zhihu-ai-quality-panel-text: #d6e4ff;
                --zhihu-ai-quality-muted-text: #aeb6c2;
                --zhihu-ai-quality-panel-border: #244c7f;
                --zhihu-ai-quality-panel-bg: #142235;
                --zhihu-ai-quality-excellent-border: #2f6b24;
                --zhihu-ai-quality-excellent-bg: #122417;
                --zhihu-ai-quality-good-border: #244c7f;
                --zhihu-ai-quality-good-bg: #142235;
                --zhihu-ai-quality-risky-border: #6b5314;
                --zhihu-ai-quality-risky-bg: #2a230f;
                --zhihu-ai-quality-risky-text: #ffe7a3;
                --zhihu-ai-quality-poor-border: #6b2525;
                --zhihu-ai-quality-poor-bg: #2a1516;
                --zhihu-ai-quality-poor-text: #ffd2d2;
                --zhihu-ai-quality-error-border: #704214;
                --zhihu-ai-quality-error-bg: #2b1d0f;
                --zhihu-ai-quality-error-text: #ffd8a8;
                --zhihu-ai-quality-loading-text: #d6e4ff;
                --zhihu-ai-quality-score-bg: rgba(255, 255, 255, 0.08);
                --zhihu-ai-quality-score-text: inherit;
                --zhihu-ai-quality-badge-bg: rgba(22, 119, 255, 0.18);
                --zhihu-ai-quality-badge-text: #91caff;
                --zhihu-ai-quality-card-bg: rgba(255, 255, 255, 0.08);
                --zhihu-ai-quality-card-border: rgba(255, 255, 255, 0.12);
                --zhihu-ai-quality-section-border: rgba(255, 255, 255, 0.12);
                --zhihu-ai-quality-overlay-bg: rgba(0, 0, 0, 0.62);
                --zhihu-ai-quality-modal-bg: #1f1f1f;
                --zhihu-ai-quality-modal-text: #d8d8d8;
                --zhihu-ai-quality-modal-border: #444;
                --zhihu-ai-quality-modal-muted: #a0a0a0;
                --zhihu-ai-quality-input-bg: #141414;
                --zhihu-ai-quality-input-border: #4a4a4a;
                --zhihu-ai-quality-close-bg: #3a3a3a;
                --zhihu-ai-quality-toast-bg: #2f3336;
            }
        }
        :root.zhihu-ai-quality-theme-dark {
            --zhihu-ai-quality-toolbar-border: #2f3336;
            --zhihu-ai-quality-button-border: #555;
            --zhihu-ai-quality-button-text: #8590a6;
            --zhihu-ai-quality-button-hover-bg: rgba(22, 119, 255, 0.12);
            --zhihu-ai-quality-panel-text: #d6e4ff;
            --zhihu-ai-quality-muted-text: #aeb6c2;
            --zhihu-ai-quality-panel-border: #244c7f;
            --zhihu-ai-quality-panel-bg: #142235;
            --zhihu-ai-quality-excellent-border: #2f6b24;
            --zhihu-ai-quality-excellent-bg: #122417;
            --zhihu-ai-quality-good-border: #244c7f;
            --zhihu-ai-quality-good-bg: #142235;
            --zhihu-ai-quality-risky-border: #6b5314;
            --zhihu-ai-quality-risky-bg: #2a230f;
            --zhihu-ai-quality-risky-text: #ffe7a3;
            --zhihu-ai-quality-poor-border: #6b2525;
            --zhihu-ai-quality-poor-bg: #2a1516;
            --zhihu-ai-quality-poor-text: #ffd2d2;
            --zhihu-ai-quality-error-border: #704214;
            --zhihu-ai-quality-error-bg: #2b1d0f;
            --zhihu-ai-quality-error-text: #ffd8a8;
            --zhihu-ai-quality-loading-text: #d6e4ff;
            --zhihu-ai-quality-score-bg: rgba(255, 255, 255, 0.08);
            --zhihu-ai-quality-score-text: inherit;
            --zhihu-ai-quality-badge-bg: rgba(22, 119, 255, 0.18);
            --zhihu-ai-quality-badge-text: #91caff;
            --zhihu-ai-quality-card-bg: rgba(255, 255, 255, 0.08);
            --zhihu-ai-quality-card-border: rgba(255, 255, 255, 0.12);
            --zhihu-ai-quality-section-border: rgba(255, 255, 255, 0.12);
            --zhihu-ai-quality-overlay-bg: rgba(0, 0, 0, 0.62);
            --zhihu-ai-quality-modal-bg: #1f1f1f;
            --zhihu-ai-quality-modal-text: #d8d8d8;
            --zhihu-ai-quality-modal-border: #444;
            --zhihu-ai-quality-modal-muted: #a0a0a0;
            --zhihu-ai-quality-input-bg: #141414;
            --zhihu-ai-quality-input-border: #4a4a4a;
            --zhihu-ai-quality-close-bg: #3a3a3a;
            --zhihu-ai-quality-toast-bg: #2f3336;
        }
        .zhihu-ai-quality-toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 12px 0;
            padding: 8px 0;
            border-bottom: 1px solid var(--zhihu-ai-quality-toolbar-border);
        }
        .zhihu-ai-quality-btn,
        .zhihu-ai-quality-settings-btn {
            padding: 4px 10px;
            border: 1px solid var(--zhihu-ai-quality-button-border);
            border-radius: 3px;
            background: transparent;
            color: var(--zhihu-ai-quality-button-text);
            font-size: 13px;
            line-height: 1.5;
            cursor: pointer;
            transition: all 0.2s;
        }
        .zhihu-ai-quality-btn:hover,
        .zhihu-ai-quality-settings-btn:hover {
            border-color: var(--zhihu-ai-quality-primary);
            color: var(--zhihu-ai-quality-primary);
            background: var(--zhihu-ai-quality-button-hover-bg);
        }
        .zhihu-ai-quality-btn[disabled] {
            cursor: not-allowed;
            opacity: 0.65;
        }
        .zhihu-ai-quality-status {
            color: var(--zhihu-ai-quality-button-text);
            font-size: 13px;
        }
        .zhihu-ai-quality-panel {
            margin: 0 0 14px 0;
            padding: 14px;
            border: 1px solid var(--zhihu-ai-quality-panel-border);
            border-left: 5px solid var(--zhihu-ai-quality-panel-left);
            border-radius: 8px;
            background: var(--zhihu-ai-quality-panel-bg);
            color: var(--zhihu-ai-quality-panel-text);
            font-size: 14px;
            line-height: 1.7;
        }
        .zhihu-ai-quality-panel[data-grade="excellent"] {
            border-color: var(--zhihu-ai-quality-excellent-border);
            border-left-color: var(--zhihu-ai-quality-excellent-left);
            background: var(--zhihu-ai-quality-excellent-bg);
        }
        .zhihu-ai-quality-panel[data-grade="good"] {
            border-color: var(--zhihu-ai-quality-good-border);
            border-left-color: var(--zhihu-ai-quality-good-left);
            background: var(--zhihu-ai-quality-good-bg);
        }
        .zhihu-ai-quality-panel[data-grade="risky"] {
            border-color: var(--zhihu-ai-quality-risky-border);
            border-left-color: var(--zhihu-ai-quality-risky-left);
            background: var(--zhihu-ai-quality-risky-bg);
            color: var(--zhihu-ai-quality-risky-text);
        }
        .zhihu-ai-quality-panel[data-grade="poor"] {
            border-color: var(--zhihu-ai-quality-poor-border);
            border-left-color: var(--zhihu-ai-quality-poor-left);
            background: var(--zhihu-ai-quality-poor-bg);
            color: var(--zhihu-ai-quality-poor-text);
        }
        .zhihu-ai-quality-panel[data-grade="ad"],
        .zhihu-ai-quality-panel[data-grade="ai"] {
            border-color: var(--zhihu-ai-quality-poor-border);
            border-left-color: var(--zhihu-ai-quality-poor-left);
            background: var(--zhihu-ai-quality-poor-bg);
            color: var(--zhihu-ai-quality-poor-text);
        }
        .zhihu-ai-quality-panel[data-state="error"] {
            border-color: var(--zhihu-ai-quality-error-border);
            border-left-color: var(--zhihu-ai-quality-error-left);
            background: var(--zhihu-ai-quality-error-bg);
            color: var(--zhihu-ai-quality-error-text);
        }
        .zhihu-ai-quality-panel[data-state="loading"] {
            border-color: var(--zhihu-ai-quality-panel-border);
            border-left-color: var(--zhihu-ai-quality-panel-left);
            background: var(--zhihu-ai-quality-panel-bg);
            color: var(--zhihu-ai-quality-loading-text);
        }
        .zhihu-ai-quality-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 10px;
        }
        .zhihu-ai-quality-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            border-radius: 50%;
            background: var(--zhihu-ai-quality-primary);
            color: var(--zhihu-ai-quality-icon-text);
            font-weight: 700;
            font-size: 18px;
            flex: 0 0 auto;
        }
        .zhihu-ai-quality-panel[data-grade="excellent"] .zhihu-ai-quality-icon {
            background: var(--zhihu-ai-quality-excellent-left);
        }
        .zhihu-ai-quality-panel[data-grade="good"] .zhihu-ai-quality-icon {
            background: var(--zhihu-ai-quality-good-left);
        }
        .zhihu-ai-quality-panel[data-grade="risky"] .zhihu-ai-quality-icon {
            background: var(--zhihu-ai-quality-risky-left);
            color: var(--zhihu-ai-quality-risky-icon-text);
        }
        .zhihu-ai-quality-panel[data-grade="poor"] .zhihu-ai-quality-icon {
            background: var(--zhihu-ai-quality-poor-left);
        }
        .zhihu-ai-quality-panel[data-grade="ad"] .zhihu-ai-quality-icon,
        .zhihu-ai-quality-panel[data-grade="ai"] .zhihu-ai-quality-icon {
            background: var(--zhihu-ai-quality-poor-left);
        }
        .zhihu-ai-quality-title {
            font-size: 17px;
            font-weight: 700;
            line-height: 1.4;
        }
        .zhihu-ai-quality-subtitle {
            color: var(--zhihu-ai-quality-muted-text);
            font-size: 13px;
            line-height: 1.5;
        }
        .zhihu-ai-quality-score {
            margin-left: auto;
            min-width: 58px;
            padding: 4px 8px;
            border-radius: 999px;
            background: var(--zhihu-ai-quality-score-bg);
            color: var(--zhihu-ai-quality-score-text);
            text-align: center;
            font-weight: 700;
        }
        .zhihu-ai-quality-summary {
            margin: 8px 0 12px 0;
        }
        .zhihu-ai-quality-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin: 0 0 12px 0;
        }
        .zhihu-ai-quality-badge {
            padding: 2px 8px;
            border-radius: 999px;
            background: var(--zhihu-ai-quality-badge-bg);
            color: var(--zhihu-ai-quality-badge-text);
            font-size: 12px;
        }
        .zhihu-ai-quality-dimensions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 8px;
            margin-top: 10px;
        }
        .zhihu-ai-quality-dimension {
            padding: 9px 10px;
            border: 1px solid var(--zhihu-ai-quality-card-border);
            border-radius: 6px;
            background: var(--zhihu-ai-quality-card-bg);
        }
        .zhihu-ai-quality-dimension-title {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
            font-weight: 700;
        }
        .zhihu-ai-quality-dot {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: var(--zhihu-ai-quality-primary);
            flex: 0 0 auto;
        }
        .zhihu-ai-quality-dimension[data-level="good"] .zhihu-ai-quality-dot {
            background: var(--zhihu-ai-quality-excellent-left);
        }
        .zhihu-ai-quality-dimension[data-level="warn"] .zhihu-ai-quality-dot {
            background: var(--zhihu-ai-quality-risky-left);
        }
        .zhihu-ai-quality-dimension[data-level="bad"] .zhihu-ai-quality-dot {
            background: var(--zhihu-ai-quality-poor-left);
        }
        .zhihu-ai-quality-dimension-comment {
            color: var(--zhihu-ai-quality-muted-text);
            font-size: 13px;
        }
        .zhihu-ai-quality-section {
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid var(--zhihu-ai-quality-section-border);
        }
        .zhihu-ai-quality-section-title {
            margin-bottom: 5px;
            font-weight: 700;
        }
        .zhihu-ai-quality-list {
            margin: 0;
            padding-left: 18px;
        }
        .zhihu-ai-quality-raw {
            margin: 6px 0 0 0;
            white-space: pre-wrap;
        }
        .zhihu-ai-quality-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: var(--zhihu-ai-quality-overlay-bg);
        }
        .zhihu-ai-quality-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            z-index: 10000;
            transform: translate(-50%, -50%);
            width: 460px;
            max-width: 92vw;
            padding: 20px;
            border: 1px solid var(--zhihu-ai-quality-modal-border);
            border-radius: 8px;
            background: var(--zhihu-ai-quality-modal-bg);
            color: var(--zhihu-ai-quality-modal-text);
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .zhihu-ai-quality-modal h3 {
            margin: 0 0 14px 0;
            font-size: 18px;
        }
        .zhihu-ai-quality-field {
            margin-bottom: 12px;
        }
        .zhihu-ai-quality-field label {
            display: block;
            margin-bottom: 5px;
            color: var(--zhihu-ai-quality-modal-muted);
            font-size: 13px;
        }
        .zhihu-ai-quality-field input {
            width: 100%;
            box-sizing: border-box;
            padding: 8px 10px;
            border: 1px solid var(--zhihu-ai-quality-input-border);
            border-radius: 4px;
            background: var(--zhihu-ai-quality-input-bg);
            color: var(--zhihu-ai-quality-modal-text);
            font-size: 14px;
        }
        .zhihu-ai-quality-help {
            margin: 8px 0 14px 0;
            color: var(--zhihu-ai-quality-modal-muted);
            font-size: 12px;
            line-height: 1.5;
        }
        .zhihu-ai-quality-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
        .zhihu-ai-quality-modal-actions button {
            padding: 7px 14px;
            border: 0;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .zhihu-ai-quality-save {
            background: var(--zhihu-ai-quality-primary);
            color: #fff;
        }
        .zhihu-ai-quality-close {
            background: var(--zhihu-ai-quality-close-bg);
            color: var(--zhihu-ai-quality-modal-text);
        }
        .zhihu-ai-quality-toast {
            position: fixed;
            right: 20px;
            bottom: 20px;
            z-index: 10001;
            max-width: 320px;
            padding: 10px 14px;
            border-radius: 6px;
            background: var(--zhihu-ai-quality-toast-bg);
            color: #fff;
            font-size: 14px;
            line-height: 1.5;
        }
    `);
    setupThemeObserver();

    GM_registerMenuCommand('配置知乎内容AI质量筛选', showSettingsModal);
    GM_registerMenuCommand('重新添加AI质量评估按钮', processPage);

    function loadConfig() {
        const saved = GM_getValue(CONFIG_KEY, {});
        return Object.assign({}, DEFAULT_CONFIG, saved || {});
    }

    function saveConfig(nextConfig) {
        config = Object.assign({}, DEFAULT_CONFIG, nextConfig || {});
        GM_setValue(CONFIG_KEY, config);
    }

    function appendStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    function setupThemeObserver() {
        const root = document.documentElement;
        if (!root) {
            return;
        }

        const observer = new MutationObserver(updateThemeClass);
        observer.observe(root, {
            attributes: true,
            attributeFilter: ['class', 'data-theme', 'data-color-mode', 'style']
        });

        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'style']
            });
        }

        const colorSchemeMedia = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (colorSchemeMedia?.addEventListener) {
            colorSchemeMedia.addEventListener('change', updateThemeClass);
        } else if (colorSchemeMedia?.addListener) {
            colorSchemeMedia.addListener(updateThemeClass);
        }
    }

    function updateThemeClass() {
        const root = document.documentElement;
        if (!root) {
            return;
        }

        const explicitTheme = detectExplicitTheme();
        const isDark = explicitTheme === 'dark' || (!explicitTheme && isComputedDarkTheme());

        root.classList.toggle('zhihu-ai-quality-theme-dark', isDark);
        root.classList.toggle('zhihu-ai-quality-theme-light', !isDark);
    }

    function detectExplicitTheme() {
        const root = document.documentElement;
        const themeParam = new URL(location.href).searchParams.get('theme');
        if (themeParam && /dark|night/i.test(themeParam)) {
            return 'dark';
        }
        if (themeParam && /light|day/i.test(themeParam)) {
            return 'light';
        }

        const themeText = [
            root.getAttribute('data-theme'),
            root.getAttribute('data-color-mode'),
            root.className,
            document.body?.getAttribute('data-theme'),
            document.body?.getAttribute('data-color-mode'),
            document.body?.className
        ]
            .filter(Boolean)
            .join(' ')
            .replace(/\bzhihu-ai-quality-theme-(?:dark|light)\b/g, '');

        if (/(^|[\s_-])(dark|night|theme-dark|darkmode|dark-mode)([\s_-]|$)/i.test(themeText)) {
            return 'dark';
        }

        if (/(^|[\s_-])(light|day|theme-light|lightmode|light-mode)([\s_-]|$)/i.test(themeText)) {
            return 'light';
        }

        return '';
    }

    function isComputedDarkTheme() {
        const bodyStyle = document.body ? getComputedStyle(document.body) : null;
        const rootStyle = getComputedStyle(document.documentElement);
        const color = bodyStyle?.backgroundColor && bodyStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
            ? bodyStyle.backgroundColor
            : rootStyle.backgroundColor;
        const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);

        if (!match) {
            return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
        }

        const r = Number(match[1]);
        const g = Number(match[2]);
        const b = Number(match[3]);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness < 128;
    }

    function isAnswerDetailPage() {
        return /\/question\/\d+\/answer\/\d+/.test(location.pathname);
    }

    function isQuestionDetailPage() {
        return /^\/question\/\d+\/?$/.test(location.pathname);
    }

    function isArticlePage() {
        return (location.hostname === 'zhuanlan.zhihu.com' && /^\/p\//.test(location.pathname)) ||
            (['www.zhihu.com', 'zhihu.com'].includes(location.hostname) &&
                (/^\/p\//.test(location.pathname) ||
                    /^\/tardis\/.*\/art\//.test(location.pathname) ||
                    /^\/article\//.test(location.pathname)));
    }

    function isStandaloneContentPage() {
        return isAnswerDetailPage() || isArticlePage();
    }

    function isSupportedPage() {
        if (!['www.zhihu.com', 'zhihu.com', 'zhuanlan.zhihu.com'].includes(location.hostname)) {
            return false;
        }

        if (isStandaloneContentPage()) {
            return true;
        }

        if (isQuestionDetailPage()) {
            return true;
        }

        return ['/', '/follow', '/hot', '/explore'].includes(location.pathname);
    }

    function processPage() {
        if (!isSupportedPage()) {
            return;
        }

        findTargetContentItems().forEach(addToolbarToContentItem);
    }

    function findTargetContentItems() {
        if (isStandaloneContentPage()) {
            const standaloneItem = findStandaloneContentItem();
            return standaloneItem ? [standaloneItem] : [];
        }

        const items = dedupeNestedItems(Array.from(document.querySelectorAll(SELECTORS.contentItem)))
            .filter(item => item.querySelector(SELECTORS.contentBody))
            .filter(item => !item.classList.contains('custom-hidden'));

        return items.filter(isFeedContentReady);
    }

    function findStandaloneContentItem() {
        const body = Array.from(document.querySelectorAll(SELECTORS.contentBody))
            .find(element => normalizeText(element.innerText || element.textContent).length > 30);
        if (!body) {
            return null;
        }

        return body.closest('.Post-content, .Post-Main, .Post-NormalMain, .Post, article, main, .ContentItem, .AnswerItem') ||
            body.parentElement;
    }

    function dedupeNestedItems(items) {
        return items.filter(item => !items.some(other => other !== item && other.contains(item)));
    }

    function isFeedContentReady(contentItem) {
        if (contentItem.querySelector('.RichContent.is-collapsed')) {
            return false;
        }

        return Boolean(normalizeText(findText(contentItem, SELECTORS.contentBody)));
    }

    function addToolbarToContentItem(contentItem) {
        if (!contentItem || contentItem.dataset.zhihuAiQualityReady === 'true') {
            return;
        }

        const toolbar = createToolbar(contentItem);
        insertToolbar(contentItem, toolbar);
        contentItem.dataset.zhihuAiQualityReady = 'true';
    }

    function insertToolbar(contentItem, toolbar) {
        const title = contentItem.querySelector('.ContentItem-title, .Post-Title, .Post-Header h1, h1');
        if (title && contentItem.contains(title)) {
            title.insertAdjacentElement('afterend', toolbar);
            return;
        }

        contentItem.insertBefore(toolbar, contentItem.firstElementChild);
    }

    function createToolbar(contentItem) {
        const toolbar = document.createElement('div');
        toolbar.className = 'zhihu-ai-quality-toolbar';
        const contentType = getContentType(contentItem);
        const typeLabel = getContentTypeLabel(contentType);

        const evaluateButton = document.createElement('button');
        evaluateButton.type = 'button';
        evaluateButton.className = 'zhihu-ai-quality-btn';
        evaluateButton.textContent = `${typeLabel}AI质量评估`;
        evaluateButton.title = `让大模型阅读当前${typeLabel}并输出质量判断`;

        const settingsButton = document.createElement('button');
        settingsButton.type = 'button';
        settingsButton.className = 'zhihu-ai-quality-settings-btn';
        settingsButton.textContent = '配置';
        settingsButton.title = '配置 OpenAI 兼容接口';

        const status = document.createElement('span');
        status.className = 'zhihu-ai-quality-status';

        evaluateButton.addEventListener('click', () => evaluateCurrentContent(contentItem, evaluateButton, status));
        settingsButton.addEventListener('click', showSettingsModal);

        toolbar.appendChild(evaluateButton);
        toolbar.appendChild(settingsButton);
        toolbar.appendChild(status);
        return toolbar;
    }

    async function evaluateCurrentContent(contentItem, button, status) {
        if (!config.apiUrl || !config.model) {
            setPanel(contentItem, 'error', '请先配置 API 地址和模型名称。');
            showSettingsModal();
            return;
        }

        const contentData = extractContentData(contentItem);
        const typeLabel = getContentTypeLabel(contentData.contentType);
        if (!contentData.content) {
            setPanel(contentItem, 'error', `未能提取到当前${typeLabel}正文。`);
            return;
        }

        button.disabled = true;
        status.textContent = `正在阅读${typeLabel}...`;
        setPanel(contentItem, 'loading', `正在请求大模型评估当前${typeLabel}，请稍候。`);

        try {
            const result = await requestQualityReview(contentData);
            setPanel(contentItem, 'success', result);
            status.textContent = '评估完成';
        } catch (error) {
            setPanel(contentItem, 'error', `评估失败：${error.message || error}`);
            status.textContent = '评估失败';
        } finally {
            button.disabled = false;
        }
    }

    function extractContentData(contentItem) {
        const contentType = getContentType(contentItem);
        const title = normalizeText(findText(contentItem, SELECTORS.itemTitle)) ||
            normalizeText(findText(document, SELECTORS.pageTitle));
        const authorName = normalizeText(findText(contentItem, SELECTORS.authorName));
        const voteText = normalizeText(findText(contentItem, SELECTORS.voteText));
        const contentElement = contentItem.querySelector('.RichText') ||
            contentItem.querySelector('.RichContent-inner') ||
            contentItem.querySelector('.RichContent') ||
            contentItem.querySelector('.Post-RichText') ||
            contentItem.querySelector('.Post-RichTextContainer');

        let content = normalizeText(contentElement ? contentElement.innerText || contentElement.textContent : '');
        if (content.length > config.maxChars) {
            content = content.slice(0, config.maxChars) + `\n\n[内容过长，已截断到 ${config.maxChars} 字符]`;
        }

        return {
            contentType,
            title,
            authorName,
            voteText,
            content,
            url: location.href
        };
    }

    function getContentType(contentItem) {
        if (isArticlePage()) {
            return 'article';
        }

        if (contentItem?.classList?.contains('ArticleItem') ||
            contentItem?.querySelector?.('.ArticleItem, .Post-Title, .Post-RichText, .Post-RichTextContainer')) {
            return 'article';
        }

        return 'answer';
    }

    function getContentTypeLabel(contentType) {
        return contentType === 'article' ? '文章' : '回答';
    }

    function findText(root, selector) {
        const element = root.querySelector(selector);
        return element ? element.innerText || element.textContent || '' : '';
    }

    function normalizeText(text) {
        return String(text || '')
            .replace(/\u200b/g, '')
            .replace(/\s+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function requestQualityReview(contentData) {
        const typeLabel = getContentTypeLabel(contentData.contentType);
        const payload = {
            model: config.model,
            temperature: 0.2,
            stream: false,
            messages: [
                {
                    role: 'system',
                    content: QUALITY_PROMPT
                },
                {
                    role: 'user',
                    content: [
                        `内容类型：${typeLabel}`,
                        `${contentData.contentType === 'article' ? '标题' : '问题'}：${contentData.title || '未提取到标题'}`,
                        `作者：${contentData.authorName || '未提取到作者'}`,
                        `页面：${contentData.url}`,
                        contentData.voteText ? `页面赞同/操作区文本：${contentData.voteText}` : '',
                        '',
                        `${typeLabel}正文：`,
                        contentData.content
                    ].filter(Boolean).join('\n')
                }
            ]
        };

        const headers = {
            'Content-Type': 'application/json'
        };

        if (config.apiKey) {
            headers.Authorization = `Bearer ${config.apiKey}`;
        }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: buildChatCompletionsUrl(config.apiUrl),
                headers,
                data: JSON.stringify(payload),
                timeout: config.timeoutMs,
                onload(response) {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`HTTP ${response.status}: ${response.responseText || '无响应内容'}`));
                        return;
                    }

                    try {
                        const data = JSON.parse(response.responseText || '{}');
                        resolve(extractModelContent(data));
                    } catch (error) {
                        reject(new Error(`响应不是合法 JSON：${error.message}`));
                    }
                },
                ontimeout() {
                    reject(new Error('请求超时'));
                },
                onerror() {
                    reject(new Error('网络请求失败'));
                }
            });
        });
    }

    function buildChatCompletionsUrl(apiUrl) {
        const trimmed = String(apiUrl || '').trim().replace(/\/+$/, '');
        if (!trimmed) {
            return '';
        }

        if (/\/chat\/completions$/i.test(trimmed)) {
            return trimmed;
        }

        return `${trimmed}/chat/completions`;
    }

    function extractModelContent(data) {
        const chatContent = data?.choices?.[0]?.message?.content;
        if (chatContent) {
            return chatContent.trim();
        }

        const completionText = data?.choices?.[0]?.text;
        if (completionText) {
            return completionText.trim();
        }

        const messageContent = data?.message?.content;
        if (messageContent) {
            return messageContent.trim();
        }

        if (typeof data?.response === 'string') {
            return data.response.trim();
        }

        return JSON.stringify(data, null, 2);
    }

    function setPanel(contentItem, state, text) {
        let panel = contentItem.querySelector('.zhihu-ai-quality-panel');
        const toolbar = contentItem.querySelector('.zhihu-ai-quality-toolbar');

        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'zhihu-ai-quality-panel';
            if (toolbar) {
                toolbar.insertAdjacentElement('afterend', panel);
            } else {
                contentItem.insertBefore(panel, contentItem.firstElementChild);
            }
        }

        panel.dataset.state = state;
        panel.removeAttribute('data-grade');
        panel.textContent = '';

        if (state === 'success') {
            renderQualityResultPanel(panel, text);
        } else {
            renderMessagePanel(panel, state, text);
        }
    }

    function renderMessagePanel(panel, state, text) {
        const header = createElement('div', 'zhihu-ai-quality-header');
        const icon = createElement('div', 'zhihu-ai-quality-icon', state === 'error' ? '!' : 'AI');
        const copy = createElement('div', '');
        const title = createElement('div', 'zhihu-ai-quality-title', state === 'error' ? '评估失败' : '正在评估');
        const subtitle = createElement('div', 'zhihu-ai-quality-subtitle', String(text || ''));

        copy.appendChild(title);
        copy.appendChild(subtitle);
        header.appendChild(icon);
        header.appendChild(copy);
        panel.appendChild(header);
    }

    function renderQualityResultPanel(panel, rawText) {
        const parsed = parseQualityResult(rawText);

        if (!parsed) {
            panel.dataset.grade = 'risky';
            const header = createQualityHeader('存疑', null, '模型未返回结构化结果，已按原文展示。', '文');
            const raw = createElement('div', 'zhihu-ai-quality-raw', String(rawText || ''));
            panel.appendChild(header);
            panel.appendChild(raw);
            return;
        }

        normalizeAiResult(parsed);
        normalizeAdResult(parsed);
        const grade = getQualityGrade(parsed);
        panel.dataset.grade = grade.key;
        const displayVerdict = grade.key === 'ad' ? grade.label : (grade.key === 'ai' ? grade.label : (parsed.verdict || grade.label));
        panel.appendChild(createQualityHeader(displayVerdict, parsed.score, grade.subtitle, grade.icon));

        if (parsed.summary) {
            panel.appendChild(createElement('div', 'zhihu-ai-quality-summary', parsed.summary));
        }

        const badges = ensureArray(parsed.badges).slice(0, 3);
        if (badges.length > 0) {
            const badgesWrap = createElement('div', 'zhihu-ai-quality-badges');
            badges.forEach(badge => badgesWrap.appendChild(createElement('span', 'zhihu-ai-quality-badge', badge)));
            panel.appendChild(badgesWrap);
        }

        const dimensions = ensureArray(parsed.dimensions).slice(0, 6);
        if (dimensions.length > 0) {
            const grid = createElement('div', 'zhihu-ai-quality-dimensions');
            dimensions.forEach(dimension => grid.appendChild(createDimensionCard(dimension)));
            panel.appendChild(grid);
        }

        appendListSection(panel, '广告/导流信号', ensureArray(parsed.adSignals).slice(0, 3));
        if (parsed.adReason) {
            appendListSection(panel, '广告判定原因', [parsed.adReason]);
        }
        appendListSection(panel, 'AI生成特征信号', ensureArray(parsed.aiSignals).slice(0, 3));
        if (parsed.aiReason) {
            appendListSection(panel, 'AI生成判定原因', [parsed.aiReason]);
        }
        appendListSection(panel, '必要信源与事实风险', ensureArray(parsed.sourceIssues).slice(0, 3));
        appendListSection(panel, '阅读建议', ensureArray(parsed.suggestions).slice(0, 3));
    }

    function parseQualityResult(rawText) {
        const raw = String(rawText || '').trim();
        if (!raw) {
            return null;
        }

        const withoutFence = raw
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        const candidates = [withoutFence];
        const firstBrace = withoutFence.indexOf('{');
        const lastBrace = withoutFence.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            candidates.push(withoutFence.slice(firstBrace, lastBrace + 1));
        }

        for (const candidate of candidates) {
            try {
                const data = JSON.parse(candidate);
                if (data && typeof data === 'object') {
                    return data;
                }
            } catch (_) {
                // Try the next candidate.
            }
        }

        return null;
    }

    function normalizeAdResult(data) {
        if (!isAdResult(data)) {
            return;
        }

        data.isAd = true;
        data.verdict = '广告';
        data.score = 0;

        const badges = ensureArray(data.badges);
        if (!badges.some(badge => String(badge).includes('广告') || String(badge).includes('导流'))) {
            badges.unshift('广告导流');
        }
        data.badges = badges.slice(0, 3);
    }

    function normalizeAiResult(data) {
        if (!isAiGeneratedResult(data)) {
            return;
        }

        data.isAiGenerated = true;
        data.verdict = 'AI生成';
        data.score = 0;

        const badges = ensureArray(data.badges);
        if (!badges.some(badge => String(badge).includes('AI') || String(badge).includes('生成'))) {
            badges.unshift('AI生成');
        }
        data.badges = badges.slice(0, 3);
    }

    function isAdResult(data) {
        const verdict = String(data?.verdict || '');
        const adReason = String(data?.adReason || '').trim();
        return data?.isAd === true ||
            verdict.includes('广告') ||
            ensureArray(data?.adSignals).length > 0 ||
            Boolean(adReason);
    }

    function isAiGeneratedResult(data) {
        const verdict = String(data?.verdict || '');
        const aiReason = String(data?.aiReason || '').trim();
        return data?.isAiGenerated === true ||
            verdict.includes('AI生成') ||
            verdict.includes('AI') ||
            ensureArray(data?.aiSignals).length > 0 ||
            Boolean(aiReason);
    }

    function getQualityGrade(data) {
        const verdict = String(data.verdict || '');
        const score = Number(data.score);

        if (isAiGeneratedResult(data)) {
            return {
                key: 'ai',
                icon: 'AI',
                label: 'AI生成',
                subtitle: '检测到内容由 AI 模型生成，按规则 0 分。'
            };
        }

        if (isAdResult(data)) {
            return {
                key: 'ad',
                icon: '广',
                label: '广告',
                subtitle: '检测到广告、营销或导流内容，按规则 0 分。'
            };
        }

        if (verdict.includes('优质') || score >= 85) {
            return {
                key: 'excellent',
                icon: '优',
                label: '优质',
                subtitle: '主题契合度、可信度和论证质量较好。'
            };
        }

        if (verdict.includes('可读') || score >= 70) {
            return {
                key: 'good',
                icon: '可',
                label: '可读',
                subtitle: '有阅读价值，但仍建议核查关键事实。'
            };
        }

        if (verdict.includes('存疑') || score >= 50) {
            return {
                key: 'risky',
                icon: '疑',
                label: '存疑',
                subtitle: '存在跑题、证据不足或逻辑跳跃风险。'
            };
        }

        return {
            key: 'poor',
            icon: '低',
            label: '低质',
            subtitle: '质量风险较高，不建议直接采信。'
        };
    }

    function createQualityHeader(verdict, score, subtitle, iconText) {
        const header = createElement('div', 'zhihu-ai-quality-header');
        const icon = createElement('div', 'zhihu-ai-quality-icon', iconText || 'AI');
        const copy = createElement('div', '');
        const title = createElement('div', 'zhihu-ai-quality-title', `质量判断：${verdict || '未定'}`);
        const desc = createElement('div', 'zhihu-ai-quality-subtitle', subtitle || '基于主题契合度、信源可靠性、论证质量和信息密度。');

        copy.appendChild(title);
        copy.appendChild(desc);
        header.appendChild(icon);
        header.appendChild(copy);

        if (Number.isFinite(Number(score))) {
            header.appendChild(createElement('div', 'zhihu-ai-quality-score', `${Math.round(Number(score))}/100`));
        }

        return header;
    }

    function createDimensionCard(dimension) {
        const level = ['good', 'warn', 'bad'].includes(dimension?.level) ? dimension.level : 'warn';
        const card = createElement('div', 'zhihu-ai-quality-dimension');
        card.dataset.level = level;

        const title = createElement('div', 'zhihu-ai-quality-dimension-title');
        title.appendChild(createElement('span', 'zhihu-ai-quality-dot'));
        title.appendChild(createElement('span', '', dimension?.name || '未命名维度'));

        card.appendChild(title);
        card.appendChild(createElement('div', 'zhihu-ai-quality-dimension-comment', dimension?.comment || '模型未给出说明。'));
        return card;
    }

    function appendListSection(panel, titleText, items) {
        if (!items.length) {
            return;
        }

        const section = createElement('div', 'zhihu-ai-quality-section');
        section.appendChild(createElement('div', 'zhihu-ai-quality-section-title', titleText));

        const list = createElement('ul', 'zhihu-ai-quality-list');
        items.forEach(item => list.appendChild(createElement('li', '', String(item))));
        section.appendChild(list);
        panel.appendChild(section);
    }

    function ensureArray(value) {
        return Array.isArray(value) ? value.filter(item => item !== null && item !== undefined && String(item).trim()) : [];
    }

    function createElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) {
            element.className = className;
        }
        if (text !== undefined) {
            element.textContent = String(text);
        }
        return element;
    }

    function showSettingsModal() {
        if (document.querySelector('.zhihu-ai-quality-modal')) {
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'zhihu-ai-quality-overlay';

        const modal = document.createElement('div');
        modal.className = 'zhihu-ai-quality-modal';
        modal.innerHTML = `
            <h3>AI质量筛选配置</h3>
            <div class="zhihu-ai-quality-field">
                <label for="zhihu-ai-quality-api-url">API 地址</label>
                <input id="zhihu-ai-quality-api-url" type="url" placeholder="https://api.siliconflow.cn/v1">
            </div>
            <div class="zhihu-ai-quality-field">
                <label for="zhihu-ai-quality-model">模型名称</label>
                <input id="zhihu-ai-quality-model" type="text" placeholder="填写 SiliconFlow 控制台中的模型名称">
            </div>
            <div class="zhihu-ai-quality-field">
                <label for="zhihu-ai-quality-api-key">API Key</label>
                <input id="zhihu-ai-quality-api-key" type="password" placeholder="本地模型可留空">
            </div>
            <div class="zhihu-ai-quality-field">
                <label for="zhihu-ai-quality-timeout">超时时间（毫秒）</label>
                <input id="zhihu-ai-quality-timeout" type="number" min="5000" step="1000">
            </div>
            <div class="zhihu-ai-quality-field">
                <label for="zhihu-ai-quality-max-chars">最多发送正文字符数</label>
                <input id="zhihu-ai-quality-max-chars" type="number" min="1000" step="1000">
            </div>
            <div class="zhihu-ai-quality-help">
                当前按 OpenAI Chat Completions 兼容格式请求。API 地址可填写基础地址，例如 https://api.siliconflow.cn/v1，脚本会自动追加 /chat/completions。
            </div>
            <div class="zhihu-ai-quality-modal-actions">
                <button type="button" class="zhihu-ai-quality-close">取消</button>
                <button type="button" class="zhihu-ai-quality-save">保存</button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        const apiUrlInput = modal.querySelector('#zhihu-ai-quality-api-url');
        const modelInput = modal.querySelector('#zhihu-ai-quality-model');
        const apiKeyInput = modal.querySelector('#zhihu-ai-quality-api-key');
        const timeoutInput = modal.querySelector('#zhihu-ai-quality-timeout');
        const maxCharsInput = modal.querySelector('#zhihu-ai-quality-max-chars');

        apiUrlInput.value = config.apiUrl || '';
        modelInput.value = config.model || '';
        apiKeyInput.value = config.apiKey || '';
        timeoutInput.value = String(config.timeoutMs || DEFAULT_CONFIG.timeoutMs);
        maxCharsInput.value = String(config.maxChars || DEFAULT_CONFIG.maxChars);

        const close = () => {
            overlay.remove();
            modal.remove();
        };

        modal.querySelector('.zhihu-ai-quality-close').addEventListener('click', close);
        overlay.addEventListener('click', close);

        modal.querySelector('.zhihu-ai-quality-save').addEventListener('click', () => {
            saveConfig({
                apiUrl: apiUrlInput.value.trim(),
                model: modelInput.value.trim(),
                apiKey: apiKeyInput.value,
                timeoutMs: Math.max(5000, Number(timeoutInput.value) || DEFAULT_CONFIG.timeoutMs),
                maxChars: Math.max(1000, Number(maxCharsInput.value) || DEFAULT_CONFIG.maxChars)
            });
            close();
            showToast('AI质量筛选配置已保存');
        });
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'zhihu-ai-quality-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2200);
    }

    function scheduleProcessPage() {
        if (processScheduled) {
            return;
        }

        processScheduled = true;
        requestAnimationFrame(() => {
            processScheduled = false;
            processPage();
        });
    }

    function observePage() {
        updateThemeClass();
        processPage();

        const observer = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                updateThemeClass();
            }
            scheduleProcessPage();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });

        setInterval(() => {
            updateThemeClass();
            processPage();
        }, 2000);
    }

    if (document.body) {
        observePage();
    } else {
        document.addEventListener('DOMContentLoaded', observePage, { once: true });
    }
})();
