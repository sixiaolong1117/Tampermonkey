// ==UserScript==
// @name         知乎 ETC 检测器
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  在回答详情页使用，用 LLM 检测评论质量，标红存在阅读障碍的用户
// @license      MIT
// @icon         https://zhihu.com/favicon.ico
// @author       SI Xiaolong
// @match        https://www.zhihu.com/question/*/answer/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      localhost
// @connect      127.0.0.1
// @connect      www.zhihu.com
// ==/UserScript==

(function() {
    'use strict';

    // 配置项
    const CONFIG = {
        ollamaUrl: GM_getValue('ollamaUrl', 'http://localhost:11434'),
        ollamaModel: GM_getValue('ollamaModel', 'qwen2.5:7b'),
        contextLength: GM_getValue('contextLength', 3000)
    };

    // 检测深色模式
    const isDarkMode = () => {
        return document.documentElement.classList.contains('theme-dark') ||
               document.body.classList.contains('dark') ||
               window.matchMedia('(prefers-color-scheme: dark)').matches;
    };

    // 获取自适应颜色
    const getColors = () => {
        const dark = isDarkMode();
        return {
            panelBg: dark ? '#1e1e1e' : '#ffffff',
            panelBorder: dark ? '#444444' : '#1976D2',
            btnContainerBg: dark ? '#2a2a2a' : '#f5f5f5',
            commentBorder: dark ? '#444444' : '#e0e0e0',
            commentBg: dark ? 'transparent' : 'transparent',
            textPrimary: dark ? '#e0e0e0' : '#333333',
            textSecondary: dark ? '#b0b0b0' : '#666666',
            primaryBtn: dark ? '#1565C0' : '#1976D2',
            successBtn: dark ? '#2E7D32' : '#4caf50',
            infoBtn: dark ? '#0277BD' : '#00ACC1',
            warningBtn: dark ? '#E65100' : '#FF6F00',
            errorBg: dark ? '#3d1f1f' : '#ffebee',
            errorBorder: dark ? '#8B0000' : '#ef5350',
            errorText: dark ? '#ff6b6b' : '#c62828',
            shadow: dark ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.15)',
            inputBg: dark ? '#2a2a2a' : '#ffffff',
            inputBorder: dark ? '#555555' : '#cccccc'
        };
    };

    // 显示设置面板
    function showSettingsPanel() {
        // 避免重复创建
        if (document.getElementById('ollama-settings-panel')) {
            document.getElementById('ollama-settings-panel').style.display = 'flex';
            return;
        }

        const colors = getColors();
        
        const overlay = document.createElement('div');
        overlay.id = 'ollama-settings-panel';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 99999;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            background: ${colors.panelBg};
            border-radius: 12px;
            box-shadow: ${colors.shadow};
            width: 500px;
            max-width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        `;

        panel.innerHTML = `
            <div style="
                padding: 20px;
                border-bottom: 2px solid ${colors.panelBorder};
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h2 style="margin: 0; color: ${colors.textPrimary}; font-size: 20px;">⚙️ Ollama 设置</h2>
                <button id="close-settings" style="
                    background: transparent;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: ${colors.textSecondary};
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    line-height: 30px;
                ">×</button>
            </div>
            
            <div style="padding: 20px;">
                <!-- Ollama 地址 -->
                <div style="margin-bottom: 20px;">
                    <label style="
                        display: block;
                        margin-bottom: 8px;
                        color: ${colors.textPrimary};
                        font-weight: 500;
                    ">🌐 Ollama 地址</label>
                    <input 
                        type="text" 
                        id="ollama-url-input" 
                        value="${CONFIG.ollamaUrl}"
                        placeholder="http://localhost:11434"
                        style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid ${colors.inputBorder};
                            border-radius: 6px;
                            background: ${colors.inputBg};
                            color: ${colors.textPrimary};
                            font-size: 14px;
                            box-sizing: border-box;
                        "
                    />
                    <small style="color: ${colors.textSecondary}; display: block; margin-top: 5px;">
                        默认: http://localhost:11434
                    </small>
                </div>

                <!-- 模型名称 -->
                <div style="margin-bottom: 20px;">
                    <label style="
                        display: block;
                        margin-bottom: 8px;
                        color: ${colors.textPrimary};
                        font-weight: 500;
                    ">🤖 模型名称</label>
                    <input 
                        type="text" 
                        id="ollama-model-input" 
                        value="${CONFIG.ollamaModel}"
                        placeholder="qwen2.5:7b"
                        style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid ${colors.inputBorder};
                            border-radius: 6px;
                            background: ${colors.inputBg};
                            color: ${colors.textPrimary};
                            font-size: 14px;
                            box-sizing: border-box;
                        "
                    />
                    <small style="color: ${colors.textSecondary}; display: block; margin-top: 5px;">
                        推荐: qwen2.5:7b, llama3.1:8b, mistral:7b
                    </small>
                </div>

                <!-- 上下文长度 -->
                <div style="margin-bottom: 20px;">
                    <label style="
                        display: block;
                        margin-bottom: 8px;
                        color: ${colors.textPrimary};
                        font-weight: 500;
                    ">📏 回答上下文长度（字数）</label>
                    <input 
                        type="number" 
                        id="context-length-input" 
                        value="${CONFIG.contextLength}"
                        min="1000"
                        max="10000"
                        step="500"
                        style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid ${colors.inputBorder};
                            border-radius: 6px;
                            background: ${colors.inputBg};
                            color: ${colors.textPrimary};
                            font-size: 14px;
                            box-sizing: border-box;
                        "
                    />
                    <small style="color: ${colors.textSecondary}; display: block; margin-top: 5px;">
                        建议: 3000-5000 字（越大越准确，但速度越慢）
                    </small>
                </div>

                <!-- 测试连接按钮 -->
                <button id="test-connection" style="
                    width: 100%;
                    padding: 12px;
                    background: ${colors.infoBtn};
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    margin-bottom: 15px;
                ">🔌 测试连接</button>

                <div id="test-result" style="
                    padding: 10px;
                    border-radius: 6px;
                    font-size: 13px;
                    display: none;
                    margin-bottom: 15px;
                "></div>

                <!-- 保存按钮 -->
                <div style="display: flex; gap: 10px;">
                    <button id="save-settings" style="
                        flex: 1;
                        padding: 12px;
                        background: ${colors.successBtn};
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                    ">💾 保存设置</button>
                    
                    <button id="reset-settings" style="
                        flex: 1;
                        padding: 12px;
                        background: ${colors.warningBtn};
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                    ">🔄 恢复默认</button>
                </div>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // 关闭面板
        const closePanel = () => {
            overlay.style.display = 'none';
        };

        document.getElementById('close-settings').onclick = closePanel;
        overlay.onclick = (e) => {
            if (e.target === overlay) closePanel();
        };

        // 测试连接
        document.getElementById('test-connection').onclick = async () => {
            const testBtn = document.getElementById('test-connection');
            const testResult = document.getElementById('test-result');
            const url = document.getElementById('ollama-url-input').value;
            
            testBtn.disabled = true;
            testBtn.textContent = '🔄 测试中...';
            testResult.style.display = 'block';
            testResult.style.background = colors.inputBg;
            testResult.style.color = colors.textSecondary;
            testResult.textContent = '正在连接...';

            try {
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: `${url}/api/tags`,
                        timeout: 5000,
                        onload: resolve,
                        onerror: reject,
                        ontimeout: () => reject(new Error('连接超时'))
                    });
                });

                if (response.status === 200) {
                    const data = JSON.parse(response.responseText);
                    const models = data.models || [];
                    testResult.style.background = '#e8f5e9';
                    testResult.style.color = '#2e7d32';
                    testResult.innerHTML = `
                        ✅ 连接成功！<br>
                        发现 ${models.length} 个模型: ${models.map(m => m.name).join(', ') || '无'}
                    `;
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (error) {
                testResult.style.background = colors.errorBg;
                testResult.style.color = colors.errorText;
                testResult.textContent = `❌ 连接失败: ${error.message}`;
            }

            testBtn.disabled = false;
            testBtn.textContent = '🔌 测试连接';
        };

        // 保存设置
        document.getElementById('save-settings').onclick = () => {
            const url = document.getElementById('ollama-url-input').value.trim();
            const model = document.getElementById('ollama-model-input').value.trim();
            const contextLength = parseInt(document.getElementById('context-length-input').value);

            if (!url || !model) {
                alert('❌ 请填写完整的配置信息！');
                return;
            }

            if (contextLength < 1000 || contextLength > 10000) {
                alert('❌ 上下文长度必须在 1000-10000 之间！');
                return;
            }

            CONFIG.ollamaUrl = url;
            CONFIG.ollamaModel = model;
            CONFIG.contextLength = contextLength;

            GM_setValue('ollamaUrl', url);
            GM_setValue('ollamaModel', model);
            GM_setValue('contextLength', contextLength);

            alert('✅ 设置已保存！');
            closePanel();
        };

        // 恢复默认
        document.getElementById('reset-settings').onclick = () => {
            if (confirm('确定要恢复默认设置吗？')) {
                document.getElementById('ollama-url-input').value = 'http://localhost:11434';
                document.getElementById('ollama-model-input').value = 'qwen2.5:7b';
                document.getElementById('context-length-input').value = '3000';
            }
        };
    }

    // 添加菜单命令
    GM_registerMenuCommand('打开设置面板', showSettingsPanel);

    // 调用 Ollama API
    function callOllama(prompt) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${CONFIG.ollamaUrl}/api/generate`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    model: CONFIG.ollamaModel,
                    prompt: prompt,
                    stream: false
                }),
                timeout: 90000, // 增加超时时间到90秒
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data.response);
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function(error) {
                    reject(error);
                },
                ontimeout: function() {
                    reject(new Error('请求超时'));
                }
            });
        });
    }

    // 获取回答信息
    function getAnswerInfo() {
        const answerItem = document.querySelector('.ContentItem.AnswerItem');
        if (!answerItem) return null;

        const dataZop = answerItem.getAttribute('data-zop');
        let title = '未知问题';
        let answerId = '';

        if (dataZop) {
            try {
                const zopData = JSON.parse(dataZop.replace(/&quot;/g, '"'));
                title = zopData.title || title;
                answerId = zopData.itemId || '';
            } catch (e) {
                console.error('解析 data-zop 失败:', e);
            }
        }

        const contentElement = answerItem.querySelector('.RichContent-inner');
        let answerContent = '';
        if (contentElement) {
            answerContent = contentElement.textContent.trim();
        }

        const metaUrl = answerItem.querySelector('meta[itemprop="url"]');
        const answerUrl = metaUrl ? metaUrl.getAttribute('content') : '';

        return {
            title,
            answerId,
            answerContent,
            answerItem,
            answerUrl
        };
    }

    // 分析评论质量（使用更严格的提示词）
    async function analyzeComment(title, answerContent, commentContent) {
        // 使用配置的上下文长度
        const answerSummary = answerContent.substring(0, CONFIG.contextLength);

        const prompt = `你是一个评论质量分析助手。请严格判断评论是否是明显的抬杠行为。

问题标题：${title}

回答内容（前${CONFIG.contextLength}字）：
${answerSummary}

评论内容：
${commentContent}

判断标准（请严格遵守）：

第一步：评论是否在反驳回答？
- 如果评论只是补充、提问、感谢、讨论相关话题 → 直接判定"正常评论"
- 如果评论明确表达不同意、反对、质疑回答的核心观点 → 继续第二步

第二步：如果是反驳，是否属于明显低质量抬杠？必须**同时满足以下所有条件**：
1. 反驳的内容明显无理（不是"可能无理"，而是"明显无理"）
2. 且属于以下至少一种情况：
   - 【故意曲解】：回答已清楚说明A，评论故意理解成B然后攻击
   - 【明显错误】：使用可被客观验证为错误的常识/事实来反驳
   - 【纯粹诡辩】：逻辑明显不通，纯粹为了反对而反对

**严格排除以下情况（必须判定为"正常评论"）：**
- 评论提出不同观点，且观点本身有一定合理性或可讨论空间
- 评论基于自身经验/角度提出质疑，即使与回答不符
- 评论语气不好、情绪化，但核心观点有一定依据
- 评论理解有偏差，但不是故意曲解（可能是真的没理解）
- 评论的反驳逻辑虽不完美，但不是明显荒谬
- 双方观点属于"见仁见智"的范畴
- 无法100%确定评论是在无理取闹

**判定原则：存疑从宽，只抓"明显"抬杠**
如果你对是否属于抬杠有任何犹豫或不确定 → 判定为"正常评论"

请严格按照以下格式回答（不要有多余内容）：
抬杠|具体理由
或
正常评论|具体理由

理由必须具体说明判断依据，不超过30字。`;

        try {
            const response = await callOllama(prompt);
            console.log('AI 分析结果:', response);

            const parts = response.trim().split('|');
            const judgment = parts[0] || '';
            const reason = parts[1] || response.trim();

            const isLowQuality = judgment.includes('抬杠');
            return {
                isLowQuality,
                reason: reason,
                fullResponse: response.trim()
            };
        } catch (error) {
            console.error('AI 分析失败:', error);
            throw error;
        }
    }

    // 标红评论
    function markCommentAsLowQuality(commentDiv, reason) {
        const colors = getColors();
        commentDiv.style.backgroundColor = colors.errorBg;
        commentDiv.style.border = `2px solid ${colors.errorBorder}`;
        commentDiv.style.borderRadius = '4px';

        const badge = document.createElement('div');
        badge.style.cssText = `
            display: inline-block;
            padding: 4px 8px;
            background: ${colors.errorBorder};
            color: white;
            border-radius: 3px;
            font-size: 12px;
            margin-left: 10px;
            font-weight: bold;
        `;
        badge.textContent = '🚫 抬杠';
        badge.title = reason;

        const metaLine = commentDiv.querySelector('.CommentItemV2-metaLine, .CommentItemV2-meta');
        if (metaLine) {
            metaLine.appendChild(badge);
        }
    }

    // 处理单个评论
    async function processComment(commentDiv, answerInfo, statusSpan) {
        const commentId = commentDiv.getAttribute('data-id');
        const commentText = commentDiv.textContent.trim();

        if (!commentText || commentText.length < 5) {
            statusSpan.textContent = '⏭️ 跳过（太短）';
            statusSpan.style.color = '#999';
            return;
        }

        statusSpan.textContent = '🔍 分析中...';
        statusSpan.style.color = '#2196F3';

        try {
            const result = await analyzeComment(
                answerInfo.title,
                answerInfo.answerContent,
                commentText
            );

            const colors = getColors();

            if (result.isLowQuality) {
                statusSpan.innerHTML = `
                    <span style="color: #ef5350; font-weight: bold;">🚫 抬杠</span>
                    <span style="color: ${colors.textSecondary}; margin-left: 8px; font-size: 11px;">
                        ${result.reason}
                    </span>
                `;
                statusSpan.title = `完整判定：${result.fullResponse}`;
                markCommentAsLowQuality(commentDiv, result.fullResponse);
            } else {
                statusSpan.innerHTML = `
                    <span style="color: #4caf50; font-weight: bold;">✅ 正常</span>
                    <span style="color: ${colors.textSecondary}; margin-left: 8px; font-size: 11px;">
                        ${result.reason}
                    </span>
                `;
                statusSpan.title = `完整判定：${result.fullResponse}`;
            }
        } catch (error) {
            statusSpan.textContent = '❌ 错误';
            statusSpan.style.color = '#f44336';
            statusSpan.title = error.message;
            console.error('处理评论失败:', error);
        }
    }

    // 添加检测按钮到每个评论
    function addDetectionButtons() {
        const answerInfo = getAnswerInfo();
        if (!answerInfo) {
            console.error('无法获取回答信息');
            console.log('❌ 无法获取回答信息，请刷新页面后重试');
            return;
        }

        const colors = getColors();

        let commentDivs = [];

        commentDivs = Array.from(document.querySelectorAll('[data-id^="1"]')).filter(el => {
            const dataId = el.getAttribute('data-id');
            return dataId && dataId.length > 10 && el.closest('.Comments-container');
        });

        if (commentDivs.length === 0) {
            const possibleSelectors = [
                '.CommentItemV2',
                '.CommentItem',
                '.Comment',
                '[class*="Comment"]',
                '.css-18ld3w0 > div'
            ];

            for (const selector of possibleSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    commentDivs = Array.from(elements).filter(el =>
                        el.getAttribute('data-id') || el.textContent.trim().length > 20
                    );
                    if (commentDivs.length > 0) {
                        console.log(`✅ 使用选择器 ${selector} 找到 ${commentDivs.length} 条评论`);
                        break;
                    }
                }
            }
        }

        if (commentDivs.length === 0) {
            console.log('❌ 未找到评论');
            return;
        }

        console.log(`✅ 找到 ${commentDivs.length} 条评论`);
        let successCount = 0;

        commentDivs.forEach((commentDiv, index) => {
            if (commentDiv.querySelector('.ai-detect-btn')) {
                console.log(`评论 ${index + 1} 已有检测按钮，跳过`);
                return;
            }

            const commentId = commentDiv.getAttribute('data-id') || `temp_${index}`;

            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = `
                display: inline-flex;
                align-items: center;
                gap: 8px;
                margin: 8px 0;
                padding: 4px 8px;
                background: ${colors.btnContainerBg};
                border-radius: 4px;
            `;

            const detectBtn = document.createElement('button');
            detectBtn.className = 'ai-detect-btn';
            detectBtn.style.cssText = `
                padding: 4px 10px;
                background: ${colors.primaryBtn};
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                transition: all 0.3s;
            `;
            detectBtn.textContent = '🤖 检测';
            detectBtn.title = '使用 AI 检测评论质量';

            const statusSpan = document.createElement('span');
            statusSpan.style.cssText = `
                font-size: 12px;
                font-weight: 500;
                color: ${colors.textSecondary};
            `;

            detectBtn.onclick = async () => {
                detectBtn.disabled = true;
                detectBtn.style.opacity = '0.5';
                detectBtn.style.cursor = 'not-allowed';
                await processComment(commentDiv, answerInfo, statusSpan);
                detectBtn.disabled = false;
                detectBtn.style.opacity = '1';
                detectBtn.style.cursor = 'pointer';
            };

            btnContainer.appendChild(detectBtn);
            btnContainer.appendChild(statusSpan);

            let inserted = false;

            const metaSelectors = [
                '.CommentItemV2-metaLine',
                '.CommentItemV2-meta',
                '.CommentItem-meta',
                '[class*="meta"]',
                '[class*="Meta"]'
            ];

            for (const selector of metaSelectors) {
                const metaLine = commentDiv.querySelector(selector);
                if (metaLine) {
                    metaLine.appendChild(btnContainer);
                    inserted = true;
                    console.log(`✅ 评论 ${index + 1} 按钮已插入到 ${selector}`);
                    break;
                }
            }

            if (!inserted) {
                commentDiv.appendChild(btnContainer);
                inserted = true;
                console.log(`✅ 评论 ${index + 1} 按钮已追加到评论末尾`);
            }

            if (inserted) {
                successCount++;
                commentDiv.style.border = `1px solid ${colors.commentBorder}`;
                commentDiv.style.padding = '8px';
                commentDiv.style.marginBottom = '8px';
                commentDiv.style.borderRadius = '4px';
            }
        });

        console.log(`✅ 成功为 ${successCount}/${commentDivs.length} 条评论添加检测按钮`);
    }

    // 使面板可拖动
    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        let isDragging = false;

        const dragHandle = element.querySelector('#drag-handle');
        if (!dragHandle) return;

        dragHandle.style.cursor = 'move';
        dragHandle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            isDragging = true;
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            element.style.transition = 'none';
        }

        function elementDrag(e) {
            if (!isDragging) return;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;

            const maxX = window.innerWidth - element.offsetWidth;
            const maxY = window.innerHeight - element.offsetHeight;

            newLeft = Math.max(0, Math.min(newLeft, maxX));
            newTop = Math.max(0, Math.min(newTop, maxY));

            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
            element.style.right = 'auto';
        }

        function closeDragElement() {
            isDragging = false;
            document.onmouseup = null;
            document.onmousemove = null;
            element.style.transition = '';
        }
    }

    // 添加全局检测按钮
    function addGlobalDetectionButton() {
        if (document.getElementById('global-detect-panel')) return;

        const colors = getColors();

        const panel = document.createElement('div');
        panel.id = 'global-detect-panel';
        panel.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: ${colors.panelBg};
            border: 2px solid ${colors.panelBorder};
            border-radius: 8px;
            box-shadow: ${colors.shadow};
            z-index: 10000;
            min-width: 220px;
            transition: box-shadow 0.3s;
        `;

        panel.innerHTML = `
            <div id="drag-handle" style="
                padding: 12px 15px;
                font-weight: bold;
                font-size: 16px;
                color: ${colors.panelBorder};
                border-bottom: 1px solid ${colors.panelBorder};
                background: ${colors.btnContainerBg};
                border-radius: 6px 6px 0 0;
                user-select: none;
            ">
                🤖 AI 评论检测 <span style="float: right; font-size: 14px; color: ${colors.textSecondary};">✋</span>
            </div>
            <div style="padding: 15px;">
                <button id="open-settings" style="
                    width: 100%;
                    padding: 10px;
                    background: ${colors.infoBtn};
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    margin-bottom: 8px;
                    transition: opacity 0.3s;
                ">⚙️ 打开设置</button>
                <button id="add-detect-buttons" style="
                    width: 100%;
                    padding: 10px;
                    background: ${colors.primaryBtn};
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    margin-bottom: 8px;
                    transition: opacity 0.3s;
                ">📌 添加检测按钮</button>
                <button id="batch-detect" style="
                    width: 100%;
                    padding: 10px;
                    background: ${colors.successBtn};
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                ">🚀 批量检测全部</button>
                <div id="batch-progress" style="
                    margin-top: 10px;
                    font-size: 12px;
                    color: ${colors.textSecondary};
                    display: none;
                "></div>
                <div style="
                    margin-top: 10px;
                    padding: 8px;
                    background: ${colors.btnContainerBg};
                    border-radius: 4px;
                    font-size: 11px;
                    color: ${colors.textSecondary};
                ">
                    📊 上下文: ${CONFIG.contextLength} 字<br>
                    🤖 模型: ${CONFIG.ollamaModel}
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        makeDraggable(panel);

        const dragHandle = panel.querySelector('#drag-handle');
        dragHandle.addEventListener('mouseenter', () => {
            panel.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
        });
        dragHandle.addEventListener('mouseleave', () => {
            panel.style.boxShadow = colors.shadow;
        });

        const buttons = panel.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.opacity = '0.85';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.opacity = '1';
            });
        });

        // 打开设置面板
        document.getElementById('open-settings').onclick = () => {
            showSettingsPanel();
        };

        // 添加检测按钮
        document.getElementById('add-detect-buttons').onclick = () => {
            addDetectionButtons();
        };

        // 批量检测
        document.getElementById('batch-detect').onclick = async () => {
            const answerInfo = getAnswerInfo();
            if (!answerInfo) {
                alert('无法获取回答信息');
                return;
            }

            let commentDivs = [];

            commentDivs = Array.from(document.querySelectorAll('[data-id^="1"]')).filter(el => {
                const dataId = el.getAttribute('data-id');
                return dataId && dataId.length > 10 && el.closest('.Comments-container');
            });

            if (commentDivs.length === 0) {
                const possibleSelectors = [
                    '.CommentItemV2',
                    '.CommentItem',
                    '.Comment',
                    '[class*="Comment"]',
                    '.css-18ld3w0 > div'
                ];

                for (const selector of possibleSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        commentDivs = Array.from(elements).filter(el =>
                            el.getAttribute('data-id') || el.textContent.trim().length > 20
                        );
                        if (commentDivs.length > 0) break;
                    }
                }
            }

            if (commentDivs.length === 0) {
                alert('未找到评论');
                return;
            }

            const progressDiv = document.getElementById('batch-progress');
            progressDiv.style.display = 'block';
            const batchBtn = document.getElementById('batch-detect');
            batchBtn.disabled = true;
            batchBtn.style.opacity = '0.5';

            for (let i = 0; i < commentDivs.length; i++) {
                const commentDiv = commentDivs[i];
                progressDiv.textContent = `进度: ${i + 1}/${commentDivs.length}`;

                let statusSpan = commentDiv.querySelector('.temp-status');
                if (!statusSpan) {
                    statusSpan = document.createElement('span');
                    statusSpan.className = 'temp-status';
                    statusSpan.style.cssText = 'margin-left: 10px; font-size: 12px; font-weight: bold;';

                    const metaSelectors = [
                        '.CommentItemV2-metaLine',
                        '.CommentItemV2-meta',
                        '.CommentItem-meta',
                        '[class*="meta"]'
                    ];

                    let inserted = false;
                    for (const selector of metaSelectors) {
                        const metaLine = commentDiv.querySelector(selector);
                        if (metaLine) {
                            metaLine.appendChild(statusSpan);
                            inserted = true;
                            break;
                        }
                    }

                    if (!inserted) {
                        commentDiv.appendChild(statusSpan);
                    }
                }

                await processComment(commentDiv, answerInfo, statusSpan);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const colors = getColors();
            progressDiv.textContent = '✅ 批量检测完成！';
            progressDiv.style.color = colors.successBtn;
            batchBtn.disabled = false;
            batchBtn.style.opacity = '1';
        };
    }

    // 初始化
    function init() {
        console.log('知乎评论智能检测器已启动');
        console.log('Ollama 配置:', CONFIG);

        setTimeout(() => {
            addGlobalDetectionButton();
        }, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();