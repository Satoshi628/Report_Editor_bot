/**
 * editor.js - Quill リッチテキストエディタの初期化・管理
 *
 * コメント機能: テキスト選択→コメント付与→一括Submit
 */

const EditorModule = (() => {
    let quill = null;
    let comments = []; // { id, index, length, text, selectedText }
    let commentIdCounter = 0;
    let savedRange = null; // 選択範囲を保持

    /**
     * Quillエディタを初期化する。
     */
    function init() {
        // コメント用のカスタムフォーマットを登録
        const Inline = Quill.import('blots/inline');
        class CommentBlot extends Inline {
            static create(value) {
                const node = super.create();
                node.setAttribute('data-comment-id', value);
                node.classList.add('comment-highlight');
                return node;
            }
            static formats(node) {
                return node.getAttribute('data-comment-id');
            }
        }
        CommentBlot.blotName = 'comment';
        CommentBlot.tagName = 'span';
        Quill.register(CommentBlot);

        quill = new Quill('#quill-editor', {
            theme: 'snow',
            placeholder: '週報の内容を入力してください...',
            formats: [
                'header', 'bold', 'italic', 'underline', 'strike',
                'list', 'indent', 'blockquote', 'comment',
            ],
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    [{ 'indent': '-1' }, { 'indent': '+1' }],
                    ['blockquote'],
                    ['clean'],
                ],
            },
        });

        // テキスト選択時にツールチップを表示
        quill.on('selection-change', (range) => {
            if (range && range.length > 0) {
                savedRange = { ...range };
                showSelectionTooltip(range);
            } else {
                hideSelectionTooltip();
            }
        });

        // ツールチップ要素を作成
        createSelectionTooltip();

        return quill;
    }

    /**
     * 選択ツールチップ要素を作成する。
     */
    function createSelectionTooltip() {
        const tooltip = document.createElement('div');
        tooltip.id = 'selection-tooltip';
        tooltip.className = 'selection-tooltip';
        tooltip.innerHTML = `
            <button class="selection-tooltip-btn" id="btn-tooltip-comment">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                コメントを追加
            </button>
        `;
        document.body.appendChild(tooltip);

        // ツールチップ全体のmousedown/clickでエディタの選択解除を防止
        tooltip.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        // ボタンクリックでコメント追加を開始
        tooltip.querySelector('#btn-tooltip-comment').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideSelectionTooltip();
            // カスタムイベントでapp.jsに通知
            document.dispatchEvent(new CustomEvent('editor:request-comment'));
        });
    }

    /**
     * 選択範囲の近くにツールチップを表示する。
     * @param {Object} range - Quillの選択範囲
     */
    function showSelectionTooltip(range) {
        const tooltip = document.getElementById('selection-tooltip');
        if (!tooltip) return;

        const bounds = quill.getBounds(range.index, range.length);
        const editorRect = quill.root.closest('.ql-container').getBoundingClientRect();

        const top = editorRect.top + bounds.top - tooltip.offsetHeight - 8;
        const left = editorRect.left + bounds.left + (bounds.width / 2);

        tooltip.style.top = `${Math.max(top, editorRect.top)}px`;
        tooltip.style.left = `${left}px`;
        tooltip.classList.add('active');
    }

    /**
     * ツールチップを非表示にする。
     */
    function hideSelectionTooltip() {
        const tooltip = document.getElementById('selection-tooltip');
        if (tooltip) tooltip.classList.remove('active');
    }

    /**
     * エディタのテキスト内容を取得する。
     * @returns {string} プレーンテキスト
     */
    function getText() {
        if (!quill) return '';
        return quill.getText().trim();
    }

    /**
     * エディタのHTML内容を取得する。
     * @returns {string} HTML文字列
     */
    function getHTML() {
        if (!quill) return '';
        return quill.root.innerHTML;
    }

    /**
     * エディタにテキストを設定する。
     * @param {string} text - 設定するテキスト
     */
    function setText(text) {
        if (!quill) return;
        quill.setText(text);
        clearComments();
    }

    /**
     * エディタにHTMLを設定する。
     * @param {string} html - 設定するHTML
     */
    function setHTML(html) {
        if (!quill) return;
        quill.root.innerHTML = html;
        clearComments();
    }

    /**
     * エディタの末尾にテキストを挿入する。
     * @param {string} text - 挿入するテキスト
     */
    function appendText(text) {
        if (!quill) return;
        const length = quill.getLength();
        quill.insertText(length - 1, '\n' + text);
    }

    /**
     * エディタをクリアする。
     */
    function clear() {
        if (!quill) return;
        quill.setText('');
        clearComments();
    }

    /**
     * Quillインスタンスを取得する。
     * @returns {Quill} Quillインスタンス
     */
    function getInstance() {
        return quill;
    }

    /**
     * 保存された選択範囲を取得する。
     * @returns {Object|null} 選択範囲
     */
    function getSavedRange() {
        return savedRange;
    }

    /**
     * 現在の選択範囲にコメントを追加する。
     * @param {string} commentText - コメント内容
     * @returns {Object|null} 追加されたコメント、選択がない場合はnull
     */
    function addComment(commentText) {
        if (!quill) return null;

        // savedRange を優先使用（ボタンクリックで選択が消えた場合の対策）
        const range = savedRange || quill.getSelection();
        if (!range || range.length === 0) return null;

        const selectedText = quill.getText(range.index, range.length);
        const id = `comment-${++commentIdCounter}`;

        // ハイライト適用
        quill.formatText(range.index, range.length, 'comment', id);

        const comment = {
            id,
            index: range.index,
            length: range.length,
            text: commentText,
            selectedText: selectedText.trim(),
        };

        comments.push(comment);
        savedRange = null; // 使用済みなのでクリア
        renderCommentBadges();
        hideSelectionTooltip();
        return comment;
    }

    /**
     * コメントを削除する。
     * @param {string} commentId - 削除するコメントのID
     */
    function removeComment(commentId) {
        const comment = comments.find(c => c.id === commentId);
        if (!comment || !quill) return;

        // ハイライトを解除（該当範囲を探す）
        const allNodes = quill.root.querySelectorAll(`[data-comment-id="${commentId}"]`);
        allNodes.forEach(node => {
            const blot = Quill.find(node);
            if (blot) {
                const index = quill.getIndex(blot);
                const length = blot.length();
                quill.formatText(index, length, 'comment', false);
            }
        });

        comments = comments.filter(c => c.id !== commentId);
        renderCommentBadges();
    }

    /**
     * 全コメントを取得する。
     * @returns {Array} コメント一覧
     */
    function getComments() {
        return [...comments];
    }

    /**
     * 全コメントをクリアする。
     */
    function clearComments() {
        if (quill) {
            // 全ハイライトを解除
            quill.formatText(0, quill.getLength(), 'comment', false);
        }
        comments = [];
        renderCommentBadges();
    }

    /**
     * コメントバッジ（エディタ横の吹き出し）を描画する。
     */
    function renderCommentBadges() {
        // 既存バッジを削除
        const existing = document.getElementById('comment-badges');
        if (existing) existing.remove();

        if (comments.length === 0) return;

        const container = document.createElement('div');
        container.id = 'comment-badges';
        container.className = 'comment-badges-container';

        comments.forEach(comment => {
            const badge = document.createElement('div');
            badge.className = 'comment-badge';
            badge.innerHTML = `
                <div class="comment-badge-header">
                    <span class="comment-badge-target">「${escapeHtml(comment.selectedText.substring(0, 30))}${comment.selectedText.length > 30 ? '...' : ''}」</span>
                    <button class="comment-badge-remove" data-id="${comment.id}" title="削除">&times;</button>
                </div>
                <div class="comment-badge-text">${escapeHtml(comment.text)}</div>
            `;

            // ハイライトへのホバー連動
            badge.addEventListener('mouseenter', () => {
                const nodes = quill.root.querySelectorAll(`[data-comment-id="${comment.id}"]`);
                nodes.forEach(n => n.classList.add('comment-highlight-active'));
            });
            badge.addEventListener('mouseleave', () => {
                const nodes = quill.root.querySelectorAll(`[data-comment-id="${comment.id}"]`);
                nodes.forEach(n => n.classList.remove('comment-highlight-active'));
            });

            // 削除ボタン
            badge.querySelector('.comment-badge-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                removeComment(comment.id);
            });

            container.appendChild(badge);
        });

        // エディタコンテナの後に挿入
        const editorContainer = document.querySelector('.editor-container');
        editorContainer.appendChild(container);
    }

    /**
     * HTMLエスケープ。
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    return {
        init,
        getText,
        getHTML,
        setText,
        setHTML,
        appendText,
        clear,
        getInstance,
        getSavedRange,
        addComment,
        removeComment,
        getComments,
        clearComments,
    };
})();
