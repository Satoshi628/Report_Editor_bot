"""関連週報検索サービス。

TF-IDFベースでエディタ内容に類似する過去の週報を検索する。
"""

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from services import report_manager


def search_related_reports(query: str, top_k: int = 5) -> list[dict]:
    """現在のテキストに関連する過去の週報を検索する。

    TF-IDFベクトルのコサイン類似度で関連度を計算する。

    Args:
        query: 検索クエリ（エディタの内容）。
        top_k: 返す結果の最大数。

    Returns:
        list[dict]: 関連週報のリスト。各要素は id, title, score, snippet を持つ。
    """
    if not query.strip():
        return []

    reports = report_manager.get_completed_reports()
    if not reports:
        return []

    # 各週報の全文を取得
    report_contents = []
    valid_reports = []
    for report in reports:
        content_data = report_manager.get_completed_report_content(report["id"])
        if content_data and content_data["content"].strip():
            report_contents.append(content_data["content"])
            valid_reports.append({
                "id": report["id"],
                "title": report["title"],
                "content": content_data["content"],
            })

    if not valid_reports:
        return []

    # TF-IDF ベクトル化
    all_texts = report_contents + [query]
    vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(2, 4),
        max_features=5000,
    )
    tfidf_matrix = vectorizer.fit_transform(all_texts)

    # クエリとの類似度計算
    query_vector = tfidf_matrix[-1]
    report_vectors = tfidf_matrix[:-1]
    similarities = cosine_similarity(query_vector, report_vectors).flatten()

    # スコアでソートしてtop_k件を返す
    ranked_indices = similarities.argsort()[::-1][:top_k]

    results = []
    for idx in ranked_indices:
        score = float(similarities[idx])
        if score < 0.01:
            continue

        content = valid_reports[idx]["content"]
        snippet = content[:200] + "..." if len(content) > 200 else content

        results.append({
            "id": valid_reports[idx]["id"],
            "title": valid_reports[idx]["title"],
            "score": round(score, 4),
            "snippet": snippet,
        })

    return results
