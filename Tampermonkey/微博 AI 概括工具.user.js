// ==UserScript==
// @name         微博 AI 概括工具
// @namespace    https://github.com/sixiaolong1117/Tampermonkey
// @version      0.3
// @description  使用 LLM 对微博博文进行 AI 概括总结
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
// @connect      localhost
// @connect      127.0.0.1
// @connect      weibo.com
// @connect      *.weibo.com
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // 默认配置
    const DEFAULT_CONFIG = {
        aiProvider: 'ollama', // 'ollama' 或 'openai'
        
        // Ollama 配置
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llama3.2',
        
        // OpenAI 兼容配置
        openaiBaseUrl: 'https://api.openai.com/v1',
        openaiApiKey: '',
        openaiModel: 'gpt-4o-mini',
        
        // 通用配置
        maxLength: 1000,
        prompt: '请用简洁的中文总结以下微博内容，提取核心要点，限制在100字以内：'
    };

    // 工具函数：检测深色模式
    const isDarkMode = () => {
        return document.documentElement.classList.contains('theme-dark') ||
               document.body.classList.contains('dark') ||
               window.matchMedia('(prefers-color-scheme: dark)').matches;
    };

    // 工具函数：获取主题颜色
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

    class OllamaSummarizer {
        constructor() {
            this.config = this.loadConfig();
            this.initMenu();
            this.observeFeed();
            this.fullTextCache = new Map();
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
            GM_registerMenuCommand('⚙️ AI 设置', () => this.showSettingsPanel());
        }

        // ============ 设置面板相关方法 ============
        
        showSettingsPanel() {
            // 避免重复创建
            if (document.getElementById('ollama-settings-panel')) {
                document.getElementById('ollama-settings-panel').style.display = 'flex';
                return;
            }

            const overlay = this.createOverlay();
            const panel = this.createPanel();
            
            overlay.appendChild(panel);
            document.body.appendChild(overlay);
            
            this.bindSettingsEvents(overlay, panel);
        }

        createOverlay() {
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
            return overlay;
        }

        createPanel() {
            const colors = getColors();
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
                ${this.createPanelHeader(colors)}
                ${this.createPanelBody(colors)}
            `;

            return panel;
        }

        createPanelHeader(colors) {
            return `
                <div style="
                    padding: 20px;
                    border-bottom: 2px solid ${colors.panelBorder};
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h2 style="margin: 0; color: ${colors.textPrimary}; font-size: 20px;">⚙️ AI 设置</h2>
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
            `;
        }

        createPanelBody(colors) {
            return `
                <div style="padding: 20px;">
                    ${this.createProviderSelector(colors)}
                    ${this.createOllamaSettings(colors)}
                    ${this.createOpenaiSettings(colors)}
                    ${this.createCommonSettings(colors)}
                    ${this.createActionButtons(colors)}
                </div>
            `;
        }

        createProviderSelector(colors) {
            return `
                <div style="margin-bottom: 20px;">
                    <label style="
                        display: block;
                        margin-bottom: 8px;
                        color: ${colors.textPrimary};
                        font-weight: 500;
                    ">🤖 选择 AI 平台</label>
                    <select id="ai-provider-select" style="
                        width: 100%;
                        padding: 10px;
                        border: 1px solid ${colors.inputBorder};
                        border-radius: 6px;
                        background: ${colors.inputBg};
                        color: ${colors.textPrimary};
                        font-size: 14px;
                        box-sizing: border-box;
                    ">
                        <option value="ollama" ${this.config.aiProvider === 'ollama' ? 'selected' : ''}>Ollama (本地模型)</option>
                        <option value="openai" ${this.config.aiProvider === 'openai' ? 'selected' : ''}>OpenAI 兼容 (通用)</option>
                    </select>
                </div>
            `;
        }

        createOllamaSettings(colors) {
            const display = this.config.aiProvider === 'ollama' ? 'block' : 'none';
            return `
                <div id="ollama-settings" style="display: ${display};">
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

                    <div style="margin-bottom: 20px;">
                        <label style="
                            display: block;
                            margin-bottom: 8px;
                            color: ${colors.textPrimary};
                            font-weight: 500;
                        ">🧠 模型名称</label>
                        <input
                            type="text"
                            id="ollama-model-input"
                            value="${this.config.ollamaModel}"
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
                </div>
            `;
        }

        createOpenaiSettings(colors) {
            const display = this.config.aiProvider === 'openai' ? 'block' : 'none';
            return `
                <div id="openai-settings" style="display: ${display};">
                    <div style="margin-bottom: 20px;">
                        <label style="
                            display: block;
                            margin-bottom: 8px;
                            color: ${colors.textPrimary};
                            font-weight: 500;
                        ">🌐 Base URL</label>
                        <input
                            type="text"
                            id="openai-base-url-input"
                            value="${this.config.openaiBaseUrl}"
                            placeholder="https://api.openai.com/v1"
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
                            支持任何兼容 OpenAI 接口的 API 地址，例如 https://api.openai.com/v1、https://api.deepseek.com/v1 等
                        </small>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="
                            display: block;
                            margin-bottom: 8px;
                            color: ${colors.textPrimary};
                            font-weight: 500;
                        ">🔑 API Key</label>
                        <input
                            type="password"
                            id="openai-api-key-input"
                            value="${this.config.openaiApiKey}"
                            placeholder="sk-..."
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
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="
                            display: block;
                            margin-bottom: 8px;
                            color: ${colors.textPrimary};
                            font-weight: 500;
                        ">🧠 模型名称</label>
                        <input
                            type="text"
                            id="openai-model-input"
                            value="${this.config.openaiModel}"
                            placeholder="gpt-4o-mini"
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
                            例如: gpt-4o-mini, gpt-4o, deepseek-chat, qwen-turbo 等
                        </small>
                    </div>
                </div>
            `;
        }

        createCommonSettings(colors) {
            return `
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
            `;
        }

        createActionButtons(colors) {
            return `
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
            `;
        }

        bindSettingsEvents(overlay, panel) {
            const closePanel = () => {
                overlay.style.display = 'none';
            };

            // 关闭按钮
            panel.querySelector('#close-settings').onclick = closePanel;
            overlay.onclick = (e) => {
                if (e.target === overlay) closePanel();
            };

            // AI 平台切换
            panel.querySelector('#ai-provider-select').addEventListener('change', (e) => {
                const provider = e.target.value;
                panel.querySelector('#ollama-settings').style.display = provider === 'ollama' ? 'block' : 'none';
                panel.querySelector('#openai-settings').style.display = provider === 'openai' ? 'block' : 'none';
            });

            // 测试连接
            panel.querySelector('#test-connection').onclick = () => this.testConnection(panel);

            // 保存设置
            panel.querySelector('#save-settings').onclick = () => this.saveSettings(panel, closePanel);

            // 恢复默认
            panel.querySelector('#reset-settings').onclick = () => this.resetSettings(panel);
        }

        async testConnection(panel) {
            const testBtn = panel.querySelector('#test-connection');
            const testResult = panel.querySelector('#test-result');
            const colors = getColors();
            
            const provider = panel.querySelector('#ai-provider-select').value;

            testBtn.disabled = true;
            testBtn.textContent = '🔄 测试中...';
            testResult.style.display = 'block';
            testResult.style.background = colors.inputBg;
            testResult.style.color = colors.textSecondary;
            testResult.textContent = '正在连接...';

            try {
                if (provider === 'ollama') {
                    await this.testOllamaConnection(panel, testResult, colors);
                } else {
                    await this.testOpenAIConnection(panel, testResult, colors);
                }
            } catch (error) {
                testResult.style.background = colors.errorBg;
                testResult.style.color = colors.errorText;
                testResult.textContent = `❌ 连接失败: ${error.message}`;
            }

            testBtn.disabled = false;
            testBtn.textContent = '🔌 测试连接';
        }

        testOllamaConnection(panel, testResult, colors) {
            const url = panel.querySelector('#ollama-url-input').value;

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${url}/api/tags`,
                    timeout: 5000,
                    onload: (response) => {
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            const models = data.models || [];
                            testResult.style.background = '#e8f5e9';
                            testResult.style.color = '#2e7d32';
                            testResult.innerHTML = `
                                ✅ 连接成功！<br>
                                发现 ${models.length} 个模型: ${models.map(m => m.name).join(', ') || '无'}
                            `;
                            resolve();
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: reject,
                    ontimeout: () => reject(new Error('连接超时'))
                });
            });
        }

        testOpenAIConnection(panel, testResult, colors) {
            const baseUrl = panel.querySelector('#openai-base-url-input').value.trim().replace(/\/+$/, '');
            const apiKey = panel.querySelector('#openai-api-key-input').value.trim();
            const model = panel.querySelector('#openai-model-input').value.trim();

            if (!apiKey) {
                testResult.style.background = colors.errorBg;
                testResult.style.color = colors.errorText;
                testResult.textContent = '❌ 请先输入 API Key';
                return Promise.reject(new Error('未输入 API Key'));
            }

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${baseUrl}/models`,
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000,
                    onload: (response) => {
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            const models = data.data || [];
                            const found = models.find(m => m.id === model);
                            testResult.style.background = '#e8f5e9';
                            testResult.style.color = '#2e7d32';
                            testResult.innerHTML = `✅ 连接成功！${found ? '✓ 模型可用' : '⚠ 未找到指定模型'}<br>地址: ${baseUrl}`;
                            resolve();
                        } else {
                            // 如果 /models 接口不可用，尝试直接发 chat 请求
                            GM_xmlhttpRequest({
                                method: 'POST',
                                url: `${baseUrl}/chat/completions`,
                                headers: {
                                    'Authorization': `Bearer ${apiKey}`,
                                    'Content-Type': 'application/json'
                                },
                                data: JSON.stringify({
                                    model: model,
                                    messages: [{ role: 'user', content: 'test' }],
                                    max_tokens: 10
                                }),
                                timeout: 10000,
                                onload: (resp) => {
                                    if (resp.status === 200) {
                                        testResult.style.background = '#e8f5e9';
                                        testResult.style.color = '#2e7d32';
                                        testResult.innerHTML = `✅ 连接成功！<br>模型: ${model}`;
                                        resolve();
                                    } else {
                                        reject(new Error(`API 错误: ${resp.status}`));
                                    }
                                },
                                onerror: reject,
                                ontimeout: () => reject(new Error('连接超时'))
                            });
                        }
                    },
                    onerror: () => {
                        // 获取模型列表失败时，尝试 chat 接口
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: `${baseUrl}/chat/completions`,
                            headers: {
                                'Authorization': `Bearer ${apiKey}`,
                                'Content-Type': 'application/json'
                            },
                            data: JSON.stringify({
                                model: model,
                                messages: [{ role: 'user', content: 'test' }],
                                max_tokens: 10
                            }),
                            timeout: 10000,
                            onload: (resp) => {
                                if (resp.status === 200) {
                                    testResult.style.background = '#e8f5e9';
                                    testResult.style.color = '#2e7d32';
                                    testResult.innerHTML = `✅ 连接成功！<br>模型: ${model}`;
                                    resolve();
                                } else {
                                    reject(new Error(`API 错误: ${resp.status}`));
                                }
                            },
                            onerror: reject,
                            ontimeout: () => reject(new Error('连接超时'))
                        });
                    },
                    ontimeout: () => reject(new Error('连接超时'))
                });
            });
        }

        saveSettings(panel, closePanel) {
            const provider = panel.querySelector('#ai-provider-select').value;
            const maxLength = parseInt(panel.querySelector('#max-length-input').value);
            const prompt = panel.querySelector('#ollama-prompt-input').value.trim();

            // 验证通用配置
            if (maxLength < 500 || maxLength > 5000) {
                alert('❌ 最大文本长度必须在 500-5000 之间！');
                return;
            }

            const newConfig = {
                aiProvider: provider,
                maxLength: maxLength,
                prompt: prompt
            };

            // 验证并保存 Ollama 配置
            if (provider === 'ollama') {
                const url = panel.querySelector('#ollama-url-input').value.trim();
                const model = panel.querySelector('#ollama-model-input').value.trim();

                if (!url || !model) {
                    alert('❌ 请填写完整的 Ollama 配置！');
                    return;
                }

                newConfig.ollamaUrl = url;
                newConfig.ollamaModel = model;
            }
            // 验证并保存 OpenAI 兼容配置
            else if (provider === 'openai') {
                const baseUrl = panel.querySelector('#openai-base-url-input').value.trim().replace(/\/+$/, '');
                const apiKey = panel.querySelector('#openai-api-key-input').value.trim();
                const model = panel.querySelector('#openai-model-input').value.trim();

                if (!baseUrl || !apiKey || !model) {
                    alert('❌ 请填写完整的 OpenAI 兼容配置！');
                    return;
                }

                newConfig.openaiBaseUrl = baseUrl;
                newConfig.openaiApiKey = apiKey;
                newConfig.openaiModel = model;
            }

            this.saveConfig(newConfig);
            alert('✅ 设置已保存！');
            closePanel();
        }

        resetSettings(panel) {
            if (confirm('确定要恢复默认设置吗？')) {
                panel.querySelector('#ai-provider-select').value = DEFAULT_CONFIG.aiProvider;
                panel.querySelector('#ollama-url-input').value = DEFAULT_CONFIG.ollamaUrl;
                panel.querySelector('#ollama-model-input').value = DEFAULT_CONFIG.ollamaModel;
                panel.querySelector('#openai-base-url-input').value = DEFAULT_CONFIG.openaiBaseUrl;
                panel.querySelector('#openai-api-key-input').value = DEFAULT_CONFIG.openaiApiKey;
                panel.querySelector('#openai-model-input').value = DEFAULT_CONFIG.openaiModel;
                panel.querySelector('#max-length-input').value = DEFAULT_CONFIG.maxLength;
                panel.querySelector('#ollama-prompt-input').value = DEFAULT_CONFIG.prompt;
                
                // 触发平台切换事件
                const event = new Event('change');
                panel.querySelector('#ai-provider-select').dispatchEvent(event);
            }
        }

        // ============ AI 调用相关方法 ============

        async callAI(content) {
            const fullPrompt = this.config.prompt + '\n\n' + content;
            
            if (this.config.aiProvider === 'openai') {
                return await this.callOpenAI(fullPrompt);
            } else {
                return await this.callOllamaAPI(fullPrompt);
            }
        }

        callOllamaAPI(prompt) {
            return new Promise((resolve, reject) => {
                const payload = {
                    model: this.config.ollamaModel,
                    prompt: prompt,
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
                    timeout: 60000,
                    onload: (response) => {
                        if (response.status === 200) {
                            const data = response.response;
                            resolve(data.response || '无返回内容');
                        } else {
                            reject(new Error(`Ollama API 错误: ${response.status}`));
                        }
                    },
                    onerror: (error) => {
                        reject(new Error(`网络错误: ${error.statusText || 'Unknown'}`));
                    },
                    ontimeout: () => {
                        reject(new Error('请求超时'));
                    }
                });
            });
        }

        callOpenAI(prompt) {
            return new Promise((resolve, reject) => {
                if (!this.config.openaiApiKey) {
                    reject(new Error('未配置 API Key'));
                    return;
                }

                const baseUrl = this.config.openaiBaseUrl.replace(/\/+$/, '');

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${baseUrl}/chat/completions`,
                    headers: {
                        'Authorization': `Bearer ${this.config.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({
                        model: this.config.openaiModel,
                        messages: [
                            { role: 'user', content: prompt }
                        ]
                    }),
                    timeout: 60000,
                    onload: (response) => {
                        if (response.status === 200) {
                            try {
                                const data = JSON.parse(response.responseText);
                                const result = data.choices?.[0]?.message?.content || '无返回内容';
                                resolve(result);
                            } catch (e) {
                                reject(new Error('解析响应失败'));
                            }
                        } else {
                            reject(new Error(`API 错误: ${response.status}`));
                        }
                    },
                    onerror: (error) => {
                        reject(new Error(`网络错误: ${error.statusText || 'Unknown'}`));
                    },
                    ontimeout: () => {
                        reject(new Error('请求超时'));
                    }
                });
            });
        }

        // ============ 全文获取方法 ============

        /**
         * 从 URL 中提取微博的 mblogid
         */
        getMblogId(url) {
            if (!url) return '';
            try {
                const parsedUrl = new URL(url, window.location.href);
                const idFromQuery = parsedUrl.searchParams.get('id') ||
                    parsedUrl.searchParams.get('mblogid') ||
                    parsedUrl.searchParams.get('mid');
                if (idFromQuery) return idFromQuery;

                const parts = parsedUrl.pathname.split('/').filter(Boolean);
                const statusIndex = parts.findIndex(part => part === 'status' || part === 'detail');
                if (statusIndex >= 0 && /^[A-Za-z0-9]{6,}$/.test(parts[statusIndex + 1] || '')) {
                    return parts[statusIndex + 1];
                }

                if (/^\d+$/.test(parts[0] || '') &&
                    /^[A-Za-z0-9]{6,}$/.test(parts[1] || '') &&
                    !/^\d+$/.test(parts[1])) {
                    return parts[1];
                }
            } catch (e) {
                return '';
            }
            return '';
        }

        /**
         * 从 feed 项中提取 mblogid
         */
        getMblogIdFromFeed(feedItem) {
            const S = OllamaSummarizer.SELECTORS;
            const candidates = [
                feedItem.querySelector(S.timeLink),
                ...feedItem.querySelectorAll('a[href*="/status/"], a[href*="/detail/"], a[href*="/"][href]')
            ];

            for (const link of candidates) {
                const href = link?.getAttribute?.('href');
                if (!href) continue;

                const mblogId = this.getMblogId(href);
                if (!mblogId) continue;

                try {
                    const url = new URL(href, window.location.href);
                    if (!/weibo\.com$/i.test(url.hostname) && !/\.weibo\.com$/i.test(url.hostname)) continue;
                    return mblogId;
                } catch (e) {
                    continue;
                }
            }
            return '';
        }

        /**
         * 去除 HTML 标签，将 <br> 转为换行
         */
        stripHtml(text) {
            if (!text) return '';
            const textarea = document.createElement('textarea');
            textarea.innerHTML = text;
            return textarea.value
                .replace(/\s+/g, ' ')
                .trim();
        }

        /**
         * 从 API 响应中递归提取文本
         */
        collectTextRaw(value, texts = []) {
            if (!value) return texts;

            if (typeof value === 'string') {
                const cleaned = this.stripHtml(value);
                if (cleaned) texts.push(cleaned);
                return texts;
            }

            if (Array.isArray(value)) {
                value.forEach(item => this.collectTextRaw(item, texts));
                return texts;
            }

            if (typeof value === 'object') {
                ['text_raw', 'text', 'longTextContent'].forEach(key => {
                    if (typeof value[key] === 'string') {
                        const cleaned = this.stripHtml(value[key]);
                        if (cleaned) texts.push(cleaned);
                    }
                });

                ['retweeted_status', 'longText', 'status'].forEach(key => {
                    if (value[key]) this.collectTextRaw(value[key], texts);
                });
            }

            return texts;
        }

        /**
         * 通过微博 API 获取全文
         * @param {string} mblogId - 微博 ID
         * @returns {Promise<string>} 全文文本
         */
        fetchFullText(mblogId) {
            // 命中缓存
            if (this.fullTextCache.has(mblogId)) {
                return Promise.resolve(this.fullTextCache.get(mblogId));
            }

            return new Promise((resolve, reject) => {
                const apiUrl = `https://weibo.com/ajax/statuses/show?id=${encodeURIComponent(mblogId)}`;

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: apiUrl,
                    responseType: 'json',
                    timeout: 8000,
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    },
                    onload: (response) => {
                        if (response.status === 200) {
                            try {
                                const data = response.response;
                                const texts = this.collectTextRaw(data);
                                const text = texts.sort((a, b) => b.length - a.length)[0] || '';
                                this.fullTextCache.set(mblogId, text);
                                resolve(text);
                            } catch (e) {
                                reject(new Error('解析 API 响应失败'));
                            }
                        } else {
                            reject(new Error(`API 返回 HTTP ${response.status}`));
                        }
                    },
                    onerror: () => {
                        reject(new Error('网络请求失败'));
                    },
                    ontimeout: () => {
                        reject(new Error('API 请求超时'));
                    }
                });
            });
        }

        // ============ 微博相关方法 ============

        // Feed 项选择器（与微博综合屏蔽脚本保持一致，兼容新旧版本）
        static get SELECTORS() {
            return {
                feedBody: '._body_m3n8j_63, ._body_ecgcn_63',
                feedContent: '.wbpro-feed-content',
                feedText: '._wbtext_1psp9_14, ._wbtext_1h76l_19',
                feedTextContainer: '._text_1psp9_2, ._text_1h76l_2',
                userLink: 'a[href*="/u/"]',
                userName: '._link_1b05f_126, ._name_ygi5b_120',
                userNameAlt: '._name_1b05f_122, ._name_ygi5b_120',
                nickContainer: '._nick_1b05f_25, ._nick_ygi5b_25',
                suffixBox: '._suffixbox_1b05f_33',
                iconsPlus: '._iconsPlus_1b05f_75, ._iconsPlus_ygi5b_75',
                timeLink: 'a[class*="_time_1tpft_33"]',
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
            const S = OllamaSummarizer.SELECTORS;
            const feedItems = container.querySelectorAll?.(S.feedBody) || [];

            feedItems.forEach((feedItem) => {
                if (feedItem.querySelector('.weibo-ai-summary-btn')) return;

                // 内容区域：优先用 .wbpro-feed-content，回退到 ._wbtext_1psp9_14
                const content = feedItem.querySelector(S.feedContent) ||
                                feedItem.querySelector(S.feedText);

                if (!content) return;

                this.addSummaryButton(feedItem);
            });
        }

        addSummaryButton(feedItem) {
            const S = OllamaSummarizer.SELECTORS;

            // 参照综合屏蔽脚本 findBlockButtonContainer 的逻辑
            let container = feedItem.querySelector(S.iconsPlus);
            let parentBox = null;

            if (!container) {
                parentBox = feedItem.querySelector(`${S.nickContainer}, ${S.suffixBox}`);
                if (parentBox) {
                    container = document.createElement('div');
                    container.className = 'woo-box-flex woo-box-alignCenter ' + S.iconsPlus.slice(1);
                    parentBox.appendChild(container);
                }
            }

            // 降级方案：在用户链接后插入
            const fallbackInsert = () => {
                const userLink = feedItem.querySelector(S.userLink);
                if (!userLink) return null;
                const btn = document.createElement('button');
                btn.className = 'weibo-ai-summary-btn';
                btn.textContent = 'AI 概括';
                Object.assign(btn.style, {
                    padding: '2px 8px',
                    border: '1px solid #d0d0d0',
                    borderRadius: '3px',
                    background: 'transparent',
                    color: '#8590a6',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    flexShrink: '0',
                    marginLeft: '8px',
                    verticalAlign: 'middle'
                });
                btn.addEventListener('mouseenter', () => {
                    btn.style.borderColor = '#667eea';
                    btn.style.color = '#667eea';
                    btn.style.background = 'rgba(102, 126, 234, 0.05)';
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.borderColor = '#d0d0d0';
                    btn.style.color = '#8590a6';
                    btn.style.background = 'transparent';
                });
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    const content = feedItem.querySelector(S.feedContent) || feedItem.querySelector(S.feedText);
                    if (content) this.summarizeContent(content, btn);
                });
                userLink.parentNode.insertBefore(btn, userLink.nextSibling);
                return btn;
            };

            if (!container) {
                fallbackInsert();
                return;
            }

            // 创建按钮容器，独立于用户名
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'weibo-ai-button-container';
            buttonContainer.style.cssText = `
                display: inline-flex;
                align-items: center;
                margin-left: 10px;
                flex-shrink: 0;
            `;

            const button = document.createElement('button');
            button.className = 'weibo-ai-summary-btn';
            button.textContent = 'AI 概括';
            Object.assign(button.style, {
                padding: '2px 8px',
                border: '1px solid #d0d0d0',
                borderRadius: '3px',
                background: 'transparent',
                color: '#8590a6',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                flexShrink: '0',
            });

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

            // 阻止事件冒泡，避免触发父元素的点击事件
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const content = feedItem.querySelector(S.feedContent) || feedItem.querySelector(S.feedText);
                if (content) this.summarizeContent(content, button);
            });

            // 阻止容器的点击事件冒泡
            buttonContainer.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            buttonContainer.appendChild(button);
            container.appendChild(buttonContainer);
        }

        async summarizeContent(contentElement, button) {
            const originalText = button.textContent;
            button.textContent = '概括中...';
            button.disabled = true;

            try {
                // 优先通过 API 获取完整微博原文
                let content = '';

                // 从按钮所在的 feedItem 中提取 mblogid
                const feedItem = button.closest(OllamaSummarizer.SELECTORS.feedBody);
                const mblogId = feedItem ? this.getMblogIdFromFeed(feedItem) : '';

                if (mblogId) {
                    try {
                        const fullText = await this.fetchFullText(mblogId);
                        if (fullText && fullText.length > 50) {
                            content = fullText.substring(0, this.config.maxLength);
                        }
                    } catch (apiError) {
                        console.warn('API 获取全文失败，回退到 DOM 提取:', apiError.message);
                    }
                }

                // API 没取到，回退到 DOM 提取
                if (!content) {
                    content = this.extractTextContent(contentElement);
                    if (!content) {
                        throw new Error('无法获取微博内容');
                    }
                }

                const summary = await this.callAI(content);
                this.showSummaryPopup(summary, contentElement);
            } catch (error) {
                console.error('概括失败:', error);
                const message = error.message.includes('API')
                    ? `API 获取全文失败: ${error.message}`
                    : `概括失败: ${error.message}`;
                GM_notification({
                    text: message,
                    title: 'AI 概括错误',
                    timeout: 5000
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

        showSummaryPopup(summary, contentElement) {
            const S = OllamaSummarizer.SELECTORS;
            const feedItem = contentElement.closest(S.feedBody);

            // 先移除该 feed 中已有的概括
            const existing = feedItem ? feedItem.querySelector('.weibo-summary-inline') : document.querySelector('.weibo-summary-inline');
            if (existing) existing.remove();

            if (!feedItem) {
                // 兜底：找不到 feedItem 时直接追加到 contentElement 前面
                const inline = this.createSummaryElement(summary);
                contentElement.parentNode.insertBefore(inline, contentElement);
                return;
            }

            // 找到内容区域，将概括插入到内容文本之前
            const contentArea = feedItem.querySelector(S.feedContent) || feedItem.querySelector(S.feedText);
            if (!contentArea) return;

            const inline = this.createSummaryElement(summary);
            contentArea.parentNode.insertBefore(inline, contentArea);
        }

        createSummaryElement(summary) {
            const colors = getColors();
            const providerName = this.config.aiProvider === 'openai'
                ? `OpenAI (${this.config.openaiModel})`
                : `Ollama (${this.config.ollamaModel})`;

            const container = document.createElement('div');
            container.className = 'weibo-summary-inline';
            container.style.cssText = `
                margin: 8px 0;
                padding: 12px 14px;
                background: ${colors.panelBg};
                border: 1px solid ${colors.panelBorder};
                border-radius: 8px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                color: ${colors.textPrimary};
                box-shadow: ${colors.shadow};
            `;

            container.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong style="color: #667eea; font-size: 13px;">📝 AI 概括</strong>
                    <button class="close-summary" style="
                        background: none;
                        border: none;
                        font-size: 18px;
                        cursor: pointer;
                        color: ${colors.textSecondary};
                        padding: 0 4px;
                        line-height: 1;
                    ">×</button>
                </div>
                <div style="white-space: pre-wrap; word-break: break-word;">${summary}</div>
                <div style="font-size: 11px; color: ${colors.textSecondary}; text-align: right; margin-top: 6px;">
                    ${providerName}
                </div>
            `;

            // 关闭按钮
            container.querySelector('.close-summary').addEventListener('click', () => {
                container.remove();
            });

            return container;
        }
    }

    // 初始化
    let initialized = false;
    function init() {
        if (!initialized && (document.querySelector('._body_m3n8j_63') || document.querySelector('._body_ecgcn_63'))) {
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
})();