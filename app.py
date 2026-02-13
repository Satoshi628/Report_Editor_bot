"""Flask メインアプリケーション。

週報Webアプリのバックエンドサーバー。
"""

import uuid

from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

import config
from services import llm_service, report_manager, search_service

app = Flask(__name__)
CORS(app)


@app.route("/")
def index():
    """メインページを表示する。"""
    return render_template("index.html")


@app.route("/api/reports/completed", methods=["GET"])
def api_completed_reports():
    """完成済み週報の一覧を返す。"""
    reports = report_manager.get_completed_reports()
    return jsonify(reports)


@app.route("/api/reports/completed/<report_id>", methods=["GET"])
def api_completed_report(report_id: str):
    """完成済み週報の内容を返す。"""
    data = report_manager.get_completed_report_content(report_id)
    if data is None:
        return jsonify({"error": "週報が見つかりません"}), 404
    return jsonify(data)


@app.route("/api/reports/drafts", methods=["GET"])
def api_draft_reports():
    """未完成週報の一覧を返す。"""
    reports = report_manager.get_draft_reports()
    return jsonify(reports)


@app.route("/api/reports/drafts/<report_id>", methods=["GET"])
def api_draft_report(report_id: str):
    """未完成週報の内容を返す。"""
    data = report_manager.get_draft_report_content(report_id)
    if data is None:
        return jsonify({"error": "下書きが見つかりません"}), 404
    return jsonify(data)


@app.route("/api/search", methods=["POST"])
def api_search():
    """関連週報を検索する。"""
    body = request.get_json()
    query = body.get("query", "")
    top_k = body.get("top_k", 5)

    results = search_service.search_related_reports(query, top_k=top_k)
    return jsonify(results)


@app.route("/api/chat", methods=["POST"])
def api_chat():
    """チャットメッセージを処理する。"""
    body = request.get_json()
    session_id = body.get("session_id", str(uuid.uuid4()))
    user_message = body.get("message", "")
    mode = body.get("mode", "compose")
    editor_content = body.get("editor_content", "")

    if not user_message.strip():
        return jsonify({"error": "メッセージが空です"}), 400

    # 参考テキストの取得
    reference_texts = report_manager.get_all_completed_texts()

    # 教育モードの場合、未完成週報の例も取得
    draft_examples = None
    if mode == "education":
        drafts = report_manager.get_draft_reports()
        draft_examples = []
        for draft in drafts[:3]:
            draft_data = report_manager.get_draft_report_content(draft["id"])
            if draft_data:
                draft_examples.append(draft_data)

    result = llm_service.chat(
        session_id=session_id,
        user_message=user_message,
        mode=mode,
        editor_content=editor_content,
        reference_texts=reference_texts,
        draft_examples=draft_examples,
    )

    return jsonify({
        "session_id": session_id,
        "chat_message": result["chat_message"],
        "report_content": result["report_content"],
    })


@app.route("/api/apply-comments", methods=["POST"])
def api_apply_comments():
    """コメントに基づいて週報を修正する。"""
    body = request.get_json()
    editor_content = body.get("editor_content", "")
    comments = body.get("comments", [])

    if not editor_content.strip():
        return jsonify({"error": "エディタの内容が空です"}), 400
    if not comments:
        return jsonify({"error": "コメントがありません"}), 400

    reference_texts = report_manager.get_all_completed_texts()

    result = llm_service.apply_comments(
        editor_content=editor_content,
        comments=comments,
        reference_texts=reference_texts,
    )

    return jsonify({
        "chat_message": result["chat_message"],
        "report_content": result["report_content"],
    })


@app.route("/api/chat/clear", methods=["POST"])
def api_clear_chat():
    """チャット履歴をクリアする。"""
    body = request.get_json()
    session_id = body.get("session_id", "")
    llm_service.clear_history(session_id)
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    # データディレクトリの作成
    config.COMPLETED_DIR.mkdir(parents=True, exist_ok=True)
    config.DRAFTS_DIR.mkdir(parents=True, exist_ok=True)

    app.run(
        host=config.FLASK_HOST,
        port=config.FLASK_PORT,
        debug=config.FLASK_DEBUG,
    )
