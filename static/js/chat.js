/**
 * chat.js - チャット機能の管理
 */

const ChatModule = (() => {
    /** セッションID生成（非HTTPS環境対応）。 */
    function generateSessionId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // フォールバック: crypto.randomUUID 非対応環境
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
    let sessionId = generateSessionId();
    let isProcessing = false;

    const elements = {
        container: null,
        input: null,
        sendBtn: null,
    };

    /**
     * チャットモジュールを初期化する。
     */
    function init() {
        elements.container = document.getElementById('chat-messages');
        elements.input = document.getElementById('chat-input');
        elements.sendBtn = document.getElementById('btn-send');

        // 送信ボタン
        elements.sendBtn.addEventListener('click', () => sendMessage());

        // Enter で送信（Shift+Enter は改行）
        elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // テキストエリアの自動リサイズ
        elements.input.addEventListener('input', () => {
            elements.input.style.height = 'auto';
            elements.input.style.height = Math.min(elements.input.scrollHeight, 120) + 'px';
        });

        // クイックアクションボタン
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.input.value = btn.dataset.message;
                elements.input.style.height = 'auto';
                sendMessage();
            });
        });
    }

    /**
     * メッセージを送信してAIレスポンスを取得する。
     */
    async function sendMessage() {
        const message = elements.input.value.trim();
        if (!message || isProcessing) return;

        isProcessing = true;
        elements.sendBtn.disabled = true;

        // Welcomeメッセージを削除
        const welcome = elements.container.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        // ユーザーメッセージを表示
        appendMessage('user', message);

        // 入力欄をクリア
        elements.input.value = '';
        elements.input.style.height = 'auto';

        // ローディング表示
        const loadingEl = appendLoading();

        try {
            const editorContent = EditorModule.getText();
            const mode = AppModule.getCurrentMode();

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    message: message,
                    mode: mode,
                    editor_content: editorContent,
                }),
            });

            const data = await response.json();

            // ローディングを削除
            loadingEl.remove();

            if (response.ok) {
                sessionId = data.session_id;
                // チャットメッセージを表示
                appendMessage('ai', data.chat_message);
                // 週報内容があればエディタに反映
                if (data.report_content) {
                    EditorModule.setText(data.report_content);
                    appendSystemMessage('エディタに週報内容を反映しました');
                }
            } else {
                appendMessage('ai', `エラー: ${data.error || '通信に失敗しました'}`);
            }
        } catch (error) {
            loadingEl.remove();
            appendMessage('ai', `通信エラーが発生しました: ${error.message}`);
        } finally {
            isProcessing = false;
            elements.sendBtn.disabled = false;
            elements.input.focus();
        }
    }

    /**
     * チャットメッセージを表示する。
     * @param {string} role - "user" または "ai"
     * @param {string} content - メッセージ内容
     */
    function appendMessage(role, content) {
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${role}`;

        const avatarLabel = role === 'user' ? 'You' : 'AI';

        // Markdown風の簡易変換（AIレスポンス用）
        let formattedContent = content;
        if (role === 'ai') {
            formattedContent = formatMarkdown(content);
        } else {
            formattedContent = escapeHtml(content);
        }

        messageEl.innerHTML = `
            <div class="message-avatar">${avatarLabel}</div>
            <div class="message-bubble">${formattedContent}</div>
        `;

        elements.container.appendChild(messageEl);
        scrollToBottom();
    }

    /**
     * システムメッセージを表示する。
     * @param {string} text - メッセージ内容
     */
    function appendSystemMessage(text) {
        const el = document.createElement('div');
        el.className = 'chat-system-message';
        el.textContent = text;
        elements.container.appendChild(el);
        scrollToBottom();
    }

    /**
     * ローディングインジケータを表示する。
     * @returns {HTMLElement} ローディング要素
     */
    function appendLoading() {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'chat-message ai';
        loadingEl.innerHTML = `
            <div class="message-avatar">AI</div>
            <div class="message-bubble">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        elements.container.appendChild(loadingEl);
        scrollToBottom();
        return loadingEl;
    }

    /**
     * チャットをクリアしてセッションをリセットする。
     */
    async function clearChat() {
        try {
            await fetch('/api/chat/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId }),
            });
        } catch (_) {
            // サーバーエラーは無視
        }

        sessionId = crypto.randomUUID();
        elements.container.innerHTML = `
            <div class="chat-welcome">
                <div class="welcome-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                </div>
                <h3>AIアシスタントへようこそ</h3>
                <p>週報の作成・修正についてお手伝いします。<br>エディタに内容を入力してからメッセージを送信してください。</p>
                <div class="quick-actions">
                    <button class="quick-btn" data-message="この週報を添削してください">📝 添削してください</button>
                    <button class="quick-btn" data-message="この内容で週報を作成してください">✨ 週報を作成</button>
                    <button class="quick-btn" data-message="文章をもっと簡潔にしてください">✂️ 簡潔にする</button>
                </div>
            </div>
        `;

        // クイックアクションを再バインド
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.input.value = btn.dataset.message;
                sendMessage();
            });
        });
    }

    /**
     * 簡易Markdown→HTML変換。
     * @param {string} text - Markdownテキスト
     * @returns {string} HTML文字列
     */
    function formatMarkdown(text) {
        let html = escapeHtml(text);

        // コードブロック
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        // インラインコード
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        // 太字
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // 斜体
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // 改行
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    /**
     * HTMLエスケープ。
     * @param {string} text - 元テキスト
     * @returns {string} エスケープされたテキスト
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /** チャットを最下部にスクロールする。 */
    function scrollToBottom() {
        elements.container.scrollTop = elements.container.scrollHeight;
    }

    return {
        init,
        sendMessage,
        clearChat,
        appendMessage,
        appendSystemMessage,
    };
})();
