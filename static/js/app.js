/**
 * app.js - メインアプリケーションロジック
 */

const AppModule = (() => {
    let currentMode = 'compose';
    let currentTab = 'related';
    let searchTimeout = null;
    let currentModalContent = '';

    /**
     * アプリケーションを初期化する。
     */
    function init() {
        // エディタ初期化
        EditorModule.init();

        // チャット初期化
        ChatModule.init();

        // イベントリスナーの設定
        setupModeSwitch();
        setupTabs();
        setupEditorActions();
        setupChatActions();
        setupModal();
        setupResizeHandles();

        // エディタの変更監視（関連週報の自動検索）
        const quill = EditorModule.getInstance();
        if (quill) {
            quill.on('text-change', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    if (currentTab === 'related') {
                        searchRelatedReports();
                    }
                }, 1500);
            });
        }

        // 初期データの読み込み
        loadTab(currentTab);
    }

    /** モード切替のセットアップ。 */
    function setupModeSwitch() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentMode = btn.dataset.mode;

                // チャットモードバッジ更新
                const badge = document.getElementById('chat-mode-badge');
                badge.textContent = currentMode === 'compose' ? '文書作成・修正' : '教育';
            });
        });
    }

    /** タブ切替のセットアップ。 */
    function setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTab = btn.dataset.tab;
                loadTab(currentTab);
            });
        });
    }

    /** エディタアクションのセットアップ。 */
    function setupEditorActions() {
        document.getElementById('btn-search-related').addEventListener('click', () => {
            // 関連タブに切り替えて検索
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('tab-related').classList.add('active');
            currentTab = 'related';
            searchRelatedReports();
        });

        document.getElementById('btn-clear-editor').addEventListener('click', () => {
            EditorModule.clear();
        });

        // コメント追加ボタン（mousedownで選択消失を防止）
        document.getElementById('btn-add-comment').addEventListener('mousedown', (e) => {
            e.preventDefault(); // フォーカス移動を防止
            const range = EditorModule.getSavedRange();
            if (!range || range.length === 0) {
                showToast('テキストを選択してからコメントを追加してください');
                return;
            }
            showCommentPopover();
        });

        // ツールチップの「コメントを追加」ボタンからのイベント
        document.addEventListener('editor:request-comment', () => {
            showCommentPopover();
        });

        // Submitボタン
        document.getElementById('btn-submit-comments').addEventListener('click', () => {
            submitComments();
        });

        // コメントポップオーバーのボタン
        document.getElementById('btn-comment-cancel').addEventListener('click', () => {
            hideCommentPopover();
        });

        document.getElementById('btn-comment-confirm').addEventListener('click', () => {
            const input = document.getElementById('comment-input');
            const text = input.value.trim();
            if (!text) return;

            const comment = EditorModule.addComment(text);
            if (comment) {
                showToast(`コメントを追加しました`);
            } else {
                showToast('テキストが選択されていません');
            }
            input.value = '';
            hideCommentPopover();
        });

        // Enterでコメント確定
        document.getElementById('comment-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                document.getElementById('btn-comment-confirm').click();
            }
        });
    }

    /** チャットアクションのセットアップ。 */
    function setupChatActions() {
        document.getElementById('btn-clear-chat').addEventListener('click', () => {
            ChatModule.clearChat();
        });
    }

    /** モーダルのセットアップ。 */
    function setupModal() {
        const overlay = document.getElementById('report-modal');
        document.getElementById('modal-close').addEventListener('click', () => {
            overlay.classList.remove('active');
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });

        document.getElementById('btn-insert-to-editor').addEventListener('click', () => {
            if (currentModalContent) {
                EditorModule.setText(currentModalContent);
                overlay.classList.remove('active');
            }
        });
    }

    /** リサイズハンドルのセットアップ。 */
    function setupResizeHandles() {
        setupResize('resize-left', 'panel-left', 'left');
        setupResize('resize-right', 'panel-right', 'right');
    }

    /**
     * パネルリサイズの実装。
     * @param {string} handleId - ハンドル要素ID
     * @param {string} panelId - パネル要素ID
     * @param {string} side - "left" or "right"
     */
    function setupResize(handleId, panelId, side) {
        const handle = document.getElementById(handleId);
        const panel = document.getElementById(panelId);
        let isResizing = false;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            handle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            if (side === 'left') {
                const newWidth = e.clientX;
                if (newWidth >= 220 && newWidth <= 500) {
                    panel.style.width = newWidth + 'px';
                }
            } else {
                const newWidth = window.innerWidth - e.clientX;
                if (newWidth >= 280 && newWidth <= 600) {
                    panel.style.width = newWidth + 'px';
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                handle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    /**
     * タブに応じたデータを読み込む。
     * @param {string} tab - タブ名
     */
    async function loadTab(tab) {
        const listEl = document.getElementById('report-list');

        if (tab === 'related') {
            searchRelatedReports();
        } else if (tab === 'all') {
            await loadCompletedReports(listEl);
        } else if (tab === 'drafts') {
            await loadDraftReports(listEl);
        }
    }

    /** 完成済み週報一覧を読み込む。 */
    async function loadCompletedReports(listEl) {
        listEl.innerHTML = '<div class="empty-state pulse"><p>読み込み中...</p></div>';

        try {
            const response = await fetch('/api/reports/completed');
            const reports = await response.json();

            if (reports.length === 0) {
                listEl.innerHTML = `
                    <div class="empty-state">
                        <p>完成済みの週報がありません。<br>data/completed/ にtxtファイルを配置してください。</p>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = '';
            reports.forEach(report => {
                const item = createReportItem(report, 'completed');
                listEl.appendChild(item);
            });
        } catch (error) {
            listEl.innerHTML = `<div class="empty-state"><p>読み込みエラー</p></div>`;
        }
    }

    /** 未完成週報一覧を読み込む。 */
    async function loadDraftReports(listEl) {
        listEl.innerHTML = '<div class="empty-state pulse"><p>読み込み中...</p></div>';

        try {
            const response = await fetch('/api/reports/drafts');
            const reports = await response.json();

            if (reports.length === 0) {
                listEl.innerHTML = `
                    <div class="empty-state">
                        <p>下書きの週報がありません。<br>data/drafts/ にdocxファイルを配置してください。</p>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = '';
            reports.forEach(report => {
                const item = createReportItem(report, 'draft');
                listEl.appendChild(item);
            });
        } catch (error) {
            listEl.innerHTML = `<div class="empty-state"><p>読み込みエラー</p></div>`;
        }
    }

    /** 関連週報を検索する。 */
    async function searchRelatedReports() {
        const listEl = document.getElementById('report-list');
        const query = EditorModule.getText();

        if (!query.trim()) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <p>エディタに入力すると<br>関連する週報が表示されます</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = '<div class="empty-state pulse"><p>検索中...</p></div>';

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, top_k: 5 }),
            });
            const results = await response.json();

            if (results.length === 0) {
                listEl.innerHTML = `
                    <div class="empty-state">
                        <p>関連する週報が見つかりませんでした</p>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = '';
            results.forEach(result => {
                const item = createReportItem(result, 'search');
                listEl.appendChild(item);
            });
        } catch (error) {
            listEl.innerHTML = `<div class="empty-state"><p>検索エラー</p></div>`;
        }
    }

    /**
     * 週報アイテム要素を作成する。
     * @param {Object} data - 週報データ
     * @param {string} type - "completed", "draft", "search"
     * @returns {HTMLElement} 週報アイテム要素
     */
    function createReportItem(data, type) {
        const item = document.createElement('div');
        item.className = 'report-item fade-in';

        let metaHtml = '';
        if (type === 'search' && data.score !== undefined) {
            metaHtml = `<span class="report-item-score">関連度: ${(data.score * 100).toFixed(1)}%</span>`;
        } else if (type === 'draft' && data.page_count) {
            metaHtml = `<span class="report-item-meta">${data.page_count}ページ</span>`;
        }

        let snippetHtml = '';
        if (data.snippet) {
            snippetHtml = `<div class="report-item-snippet">${escapeHtml(data.snippet)}</div>`;
        }

        item.innerHTML = `
            <div class="report-item-title">${escapeHtml(data.title || data.filename || data.id)}</div>
            ${metaHtml}
            ${snippetHtml}
        `;

        item.addEventListener('click', () => {
            if (type === 'draft') {
                openDraftModal(data.id);
            } else {
                openCompletedModal(data.id);
            }
        });

        return item;
    }

    /** 完成済み週報のモーダルを開く。 */
    async function openCompletedModal(reportId) {
        const overlay = document.getElementById('report-modal');
        const titleEl = document.getElementById('modal-title');
        const bodyEl = document.getElementById('modal-body');

        titleEl.textContent = '読み込み中...';
        bodyEl.innerHTML = '<div class="pulse">読み込み中...</div>';
        overlay.classList.add('active');

        try {
            const response = await fetch(`/api/reports/completed/${reportId}`);
            const data = await response.json();

            titleEl.textContent = data.title;
            bodyEl.textContent = data.content;
            currentModalContent = data.content;
        } catch (error) {
            titleEl.textContent = 'エラー';
            bodyEl.textContent = '週報の読み込みに失敗しました';
        }
    }

    /** 未完成週報のモーダルを開く。 */
    async function openDraftModal(reportId) {
        const overlay = document.getElementById('report-modal');
        const titleEl = document.getElementById('modal-title');
        const bodyEl = document.getElementById('modal-body');

        titleEl.textContent = '読み込み中...';
        bodyEl.innerHTML = '<div class="pulse">読み込み中...</div>';
        overlay.classList.add('active');

        try {
            const response = await fetch(`/api/reports/drafts/${reportId}`);
            const data = await response.json();

            titleEl.textContent = `下書き: ${data.filename}`;
            currentModalContent = '';

            let html = '';
            data.pages.forEach(page => {
                let labelHtml = '';
                if (page.is_final) {
                    labelHtml = '<span class="draft-page-label final">最終原稿</span>';
                } else if (page.is_first_draft) {
                    labelHtml = '<span class="draft-page-label first-draft">初版</span>';
                }

                let commentsHtml = '';
                if (page.comments && page.comments.length > 0) {
                    commentsHtml = page.comments.map(c => `
                        <div class="draft-comment">
                            <div class="draft-comment-author">${escapeHtml(c.author)}</div>
                            <div class="draft-comment-text">${escapeHtml(c.text)}</div>
                        </div>
                    `).join('');
                }

                html += `
                    <div class="draft-page">
                        <div class="draft-page-header">
                            ページ ${page.page_number}
                            ${labelHtml}
                        </div>
                        <div class="draft-page-content">${escapeHtml(page.content)}</div>
                        ${commentsHtml}
                    </div>
                `;

                if (page.is_final) {
                    currentModalContent = page.content;
                }
            });

            bodyEl.innerHTML = html;
        } catch (error) {
            titleEl.textContent = 'エラー';
            bodyEl.textContent = '下書きの読み込みに失敗しました';
        }
    }

    /**
     * 現在のモードを取得する。
     * @returns {string} "compose" or "education"
     */
    function getCurrentMode() {
        return currentMode;
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


    /** コメントポップオーバーを表示する。 */
    function showCommentPopover() {
        const popover = document.getElementById('comment-popover');
        const input = document.getElementById('comment-input');
        popover.classList.add('active');
        input.value = '';
        setTimeout(() => input.focus(), 100);
    }

    /** コメントポップオーバーを非表示にする。 */
    function hideCommentPopover() {
        document.getElementById('comment-popover').classList.remove('active');
    }

    /**
     * コメントを一括でAPIに送信し、エディタを更新する。
     */
    async function submitComments() {
        const comments = EditorModule.getComments();
        if (comments.length === 0) {
            showToast('コメントがありません。テキストを選択してコメントを追加してください。');
            return;
        }

        const editorContent = EditorModule.getText();
        if (!editorContent.trim()) {
            showToast('エディタの内容が空です');
            return;
        }

        const submitBtn = document.getElementById('btn-submit-comments');
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');

        // チャットにシステムメッセージを表示
        ChatModule.appendSystemMessage(`${comments.length}件のコメントをAIに送信中...`);

        try {
            const apiComments = comments.map(c => ({
                text: c.text,
                selected_text: c.selectedText,
            }));

            const response = await fetch('/api/apply-comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    editor_content: editorContent,
                    comments: apiComments,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                // チャットに修正内容の説明を表示
                ChatModule.appendMessage('ai', data.chat_message);
                // エディタに修正後の週報を反映
                if (data.report_content) {
                    EditorModule.setText(data.report_content);
                    ChatModule.appendSystemMessage('コメントの修正をエディタに反映しました');
                }
            } else {
                ChatModule.appendMessage('ai', `エラー: ${data.error || 'コメントの反映に失敗しました'}`);
            }
        } catch (error) {
            ChatModule.appendMessage('ai', `通信エラー: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
        }
    }

    /**
     * トーストメッセージを表示する。
     * @param {string} message - 表示メッセージ
     */
    function showToast(message) {
        const existing = document.querySelector('.toast-message');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast-message';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('active'));

        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    return {
        init,
        getCurrentMode,
    };
})();

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    AppModule.init();
});
