// ==UserScript==
// @name         微博 AI 概括工具
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.1
// @description  使用 Ollama 对微博博文进行 AI 概括总结
// @license      MIT
// @icon         https://weibo.com/favicon.ico
// @author       SI Xiaolong
// @match        https://weibo.com/*
// @match        https://*.weibo.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// ==/UserScript==

(function() {
    'use strict';

    // 默认配置
    const DEFAULT_CONFIG = {
        ollamaUrl: 'http://localhost:11434',
        model: 'llama3.2',
        maxLength: 1000,
        prompt: '请用简洁的中文总结以下微博内容，提取核心要点，限制在100字以内：'
    };

    class OllamaSummarizer {
        constructor() {
            this.config = this.loadConfig();
            this.initMenu();
            this.observeFeed();
        }

        loadConfig() {
            const saved = GM_getValue('ollama_config');
            return { ...DEFAULT_CONFIG, ...saved };
        }

        saveConfig(config) {
            this.config = { ...this.config, ...config };
            GM_setValue('ollama_config', this.config);
        }

        initMenu() {
            GM_registerMenuCommand('⚙️ Ollama设置', () => this.showSettingsPanel());
        }

        showSettingsPanel() {
            // 避免重复创建
            if (document.getElementById('ollama-settings-panel')) {
                document.getElementById('ollama-settings-panel').style.display = 'flex';
                return;
            }

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
                            value="${this.config.ollamaUrl}"
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
                            value="${this.config.model}"
                            placeholder="llama3.2"
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
                            推荐: llama3.2, qwen2.5:7b, mistral:7b
                        </small>
                    </div>

                    <!-- 最大文本长度 -->
                    <div style="margin-bottom: 20px;">
                        <label style="
                            display: block;
                            margin-bottom: 8px;
                            color: ${colors.textPrimary};
                            font-weight: 500;
                        ">📏 最大文本长度（字数）</label>
                        <input
                            type="number"
                            id="max-length-input"
                            value="${this.config.maxLength}"
                            min="500"
                            max="5000"
                            step="100"
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
                            建议: 1000-2000 字（越大越准确，但速度越慢）
                        </small>
                    </div>

                    <!-- 提示词 -->
                    <div style="margin-bottom: 20px;">
                        <label style="
                            display: block;
                            margin-bottom: 8px;
                            color: ${colors.textPrimary};
                            font-weight: 500;
                        ">💬 提示词</label>
                        <textarea
                            id="ollama-prompt-input"
                            placeholder="请输入概括提示词"
                            style="
                                width: 100%;
                                padding: 10px;
                                border: 1px solid ${colors.inputBorder};
                                border-radius: 6px;
                                background: ${colors.inputBg};
                                color: ${colors.textPrimary};
                                font-size: 14px;
                                box-sizing: border-box;
                                resize: vertical;
                                min-height: 80px;
                            "
                        >${this.config.prompt}</textarea>
                        <small style="color: ${colors.textSecondary}; display: block; margin-top: 5px;">
                            用于指导AI如何概括微博内容
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
                const maxLength = parseInt(document.getElementById('max-length-input').value);
                const prompt = document.getElementById('ollama-prompt-input').value.trim();

                if (!url || !model) {
                    alert('❌ 请填写完整的配置信息！');
                    return;
                }

                if (maxLength < 500 || maxLength > 5000) {
                    alert('❌ 最大文本长度必须在 500-5000 之间！');
                    return;
                }

                this.saveConfig({
                    ollamaUrl: url,
                    model: model,
                    maxLength: maxLength,
                    prompt: prompt
                });

                alert('✅ 设置已保存！');
                closePanel();
            };

            // 恢复默认
            document.getElementById('reset-settings').onclick = () => {
                if (confirm('确定要恢复默认设置吗？')) {
                    document.getElementById('ollama-url-input').value = DEFAULT_CONFIG.ollamaUrl;
                    document.getElementById('ollama-model-input').value = DEFAULT_CONFIG.model;
                    document.getElementById('max-length-input').value = DEFAULT_CONFIG.maxLength;
                    document.getElementById('ollama-prompt-input').value = DEFAULT_CONFIG.prompt;
                }
            };
        }

        observeFeed() {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            this.processFeedItems(node);
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // 初始处理
            this.processFeedItems(document.body);
        }

        processFeedItems(container) {
            const feedItems = container.querySelectorAll?.('.Feed_body_3R0rO') || [];

            feedItems.forEach((feedItem) => {
                if (feedItem.querySelector('.weibo-ai-summary-btn')) return;

                const header = feedItem.querySelector('.woo-box-flex');
                const content = feedItem.querySelector('.detail_wbtext_4CRf9');

                if (header && content) {
                    this.addSummaryButton(header, content);
                }
            });
        }

        addSummaryButton(header, contentElement) {
            // 查找用户名元素，参考屏蔽按钮的位置
            const userNameElement = header.querySelector('.head_name_24eEB');
            if (!userNameElement) return;

            // 创建AI概括按钮，样式参考屏蔽按钮
            const button = document.createElement('button');
            button.className = 'weibo-ai-summary-btn';
            button.textContent = 'AI 概括';
            button.style.cssText = `
                padding: 2px 8px;
                border: 1px solid #d0d0d0;
                border-radius: 3px;
                background: transparent;
                color: #8590a6;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
                flex-shrink: 0;
                margin-left: 10px;
            `;

            // 悬停效果
            button.addEventListener('mouseenter', () => {
                button.style.borderColor = '#667eea';
                button.style.color = '#667eea';
                button.style.background = 'rgba(102, 126, 234, 0.05)';
            });

            button.addEventListener('mouseleave', () => {
                button.style.borderColor = '#d0d0d0';
                button.style.color = '#8590a6';
                button.style.background = 'transparent';
            });

            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.summarizeContent(contentElement, button);
            });

            // 确保用户名元素有合适的布局
            if (window.getComputedStyle(userNameElement).display === 'inline') {
                userNameElement.style.display = 'inline-flex';
                userNameElement.style.alignItems = 'center';
                userNameElement.style.gap = '5px';
            }

            // 添加到用户名元素后面
            userNameElement.appendChild(button);
        }

        async summarizeContent(contentElement, button) {
            const originalText = button.textContent;
            button.textContent = '概括中...';
            button.disabled = true;

            try {
                const content = this.extractTextContent(contentElement);
                const summary = await this.callOllamaAPI(content);
                this.showSummaryPopup(summary, contentElement);
            } catch (error) {
                console.error('概括失败:', error);
                GM_notification({
                    text: `概括失败: ${error.message}`,
                    title: 'AI概括错误',
                    timeout: 3000
                });
            } finally {
                button.textContent = originalText;
                button.disabled = false;
            }
        }

        extractTextContent(element) {
            let text = element.textContent || element.innerText || '';
            // 清理文本，移除多余空格和换行
            text = text.replace(/\s+/g, ' ').trim();
            // 限制长度
            return text.substring(0, this.config.maxLength);
        }

        callOllamaAPI(content) {
            return new Promise((resolve, reject) => {
                const payload = {
                    model: this.config.model,
                    prompt: this.config.prompt + '\n\n' + content,
                    stream: false
                };

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${this.config.ollamaUrl}/api/generate`,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(payload),
                    responseType: 'json',
                    onload: (response) => {
                        if (response.status === 200) {
                            const data = response.response;
                            resolve(data.response || '无返回内容');
                        } else {
                            reject(new Error(`API错误: ${response.status} - ${response.statusText}`));
                        }
                    },
                    onerror: (error) => {
                        reject(new Error(`网络错误: ${error.statusText}`));
                    },
                    timeout: 30000
                });
            });
        }

        showSummaryPopup(summary, contentElement) {
            // 移除已存在的弹窗
            const existingPopup = document.querySelector('.weibo-summary-popup');
            if (existingPopup) {
                existingPopup.remove();
            }

            // 检测深色模式
            const isDarkMode = () => {
                return document.documentElement.classList.contains('theme-dark') ||
                       document.body.classList.contains('dark') ||
                       window.matchMedia('(prefers-color-scheme: dark)').matches;
            };

            const colors = getColors();

            const popup = document.createElement('div');
            popup.className = 'weibo-summary-popup';
            popup.style.cssText = `
                position: absolute;
                background: ${colors.panelBg};
                border: 1px solid ${colors.panelBorder};
                border-radius: 8px;
                padding: 15px;
                max-width: 400px;
                box-shadow: ${colors.shadow};
                z-index: 1000;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 14px;
                line-height: 1.5;
                color: ${colors.textPrimary};
            `;

            popup.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <strong style="color: #667eea;">AI 概括</strong>
                    <button class="close-popup" style="background: none; border: none; font-size: 16px; cursor: pointer; color: ${colors.textSecondary};">×</button>
                </div>
                <div class="summary-content" style="white-space: pre-wrap; margin-bottom: 10px;">${summary}</div>
                <div style="font-size: 12px; color: ${colors.textSecondary}; text-align: right;">
                    Powered by Ollama
                </div>
            `;

            // 定位弹窗
            const rect = contentElement.getBoundingClientRect();
            popup.style.top = `${rect.bottom + window.scrollY + 10}px`;
            popup.style.left = `${rect.left + window.scrollX}px`;

            document.body.appendChild(popup);

            // 关闭按钮事件
            popup.querySelector('.close-popup').addEventListener('click', () => {
                popup.remove();
            });

            // 点击外部关闭
            setTimeout(() => {
                const closeHandler = (e) => {
                    if (!popup.contains(e.target)) {
                        popup.remove();
                        document.removeEventListener('click', closeHandler);
                    }
                };
                document.addEventListener('click', closeHandler);
            }, 100);
        }
    }

    // 初始化
    let initialized = false;
    function init() {
        if (!initialized && document.querySelector('.Feed_body_3R0rO')) {
            initialized = true;
            new OllamaSummarizer();
        }
    }

    // 页面加载时初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 处理动态加载的内容
    setInterval(init, 1000);

    // 辅助函数：获取颜色配置
    function getColors() {
        const isDarkMode = () => {
            return document.documentElement.classList.contains('theme-dark') ||
                   document.body.classList.contains('dark') ||
                   window.matchMedia('(prefers-color-scheme: dark)').matches;
        };

        const dark = isDarkMode();
        return {
            panelBg: dark ? '#1e1e1e' : '#ffffff',
            panelBorder: dark ? '#444444' : '#1976D2',
            btnContainerBg: dark ? '#2a2a2a' : '#f5f5f5',
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
    }
})();